import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PowerPlant } from '../models/PowerPlant';
import type { Contact } from '../utils/apolloApi';
import { fetchPublicContacts } from '../utils/publicContactsApi';
import { askPlantResearch } from '../utils/plantResearchApi';

type IcpTabProps = {
  powerPlants: PowerPlant[];
  selectedPlantIds: Set<string>;
  onPlantSelect: (plantId: string) => void;
  onPlantDeselect: (plantId: string) => void;
  downloadedPlantIds: Set<string>;
  onMarkPlantsDownloaded: (plantIds: string[]) => void;
  onClearDownloadedPlants: () => void;
  selectedStates: Set<string>;
  onSelectedStatesChange: (next: Set<string>) => void;
  excessThresholdMw: number;
  onExcessThresholdMwChange: (next: number) => void;
  sectorFilter:
    | 'all'
    | 'independent'
    | 'electric_utility'
    | 'commercial'
    | 'other';
  onSectorFilterChange: (
    next:
      | 'all'
      | 'independent'
      | 'electric_utility'
      | 'commercial'
      | 'other'
  ) => void;
};

const getPlantState = (plant: PowerPlant): string => {
  const raw = plant.rawData?.['State / Province / Territory'] || plant.rawData?.State || '';
  return String(raw).trim().toUpperCase();
};

const getOwner = (plant: PowerPlant): string =>
  String(plant.rawData?.['Owner Name (Company)'] || '').trim();

const getOperator = (plant: PowerPlant): string =>
  String(plant.rawData?.['Operator Name'] || '').trim();

const getPlantUrl = (plant: PowerPlant): string =>
  String(plant.rawData?.['Plant URL'] || '').trim();

const getCompanyWebsite = (plant: PowerPlant): string =>
  String(plant.rawData?.['Utility URL'] || '').trim();

const toCsvValue = (value: string | number | null | undefined): string => {
  const raw = value == null ? '' : String(value);
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
};

const splitName = (fullName: string): { firstName: string; lastName: string } => {
  const normalized = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return { firstName: '', lastName: '' };
  const parts = normalized.split(' ');
  if (parts.length === 1) return { firstName: parts[0] || '', lastName: '' };
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
};

const downloadTextFile = (filename: string, text: string, mimeType = 'text/csv;charset=utf-8') => {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const getHostname = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
};

const renderAnswerBlock = (answer: string) => {
  const cleaned = answer
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();

  const lines = cleaned
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l, idx, arr) => !(l.trim().length === 0 && arr[idx - 1]?.trim().length === 0));

  const bulletLines = lines.filter((l) => /^[-*•]\s+/.test(l.trim()));
  const nonBulletLines = lines.filter((l) => !/^[-*•]\s+/.test(l.trim()));

  if (bulletLines.length >= 2 && nonBulletLines.length <= 2) {
    return (
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: '#111827' }}>
        {bulletLines.map((l, i) => (
          <li key={i}>{l.replace(/^[-*•]\s+/, '')}</li>
        ))}
      </ul>
    );
  }

  return (
    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5, color: '#111827' }}>
      {cleaned}
    </div>
  );
};

const ROWS_TO_SHOW_PRESETS = [1, 10, 20, 50, 100, 200, 0] as const;

const getUsSector = (plant: PowerPlant): string =>
  plant.country === 'US' ? String(plant.rawData?.Sector || '').trim() : '';

const classifyUsSector = (
  sector: string
):
  | 'independent'
  | 'electric_utility'
  | 'commercial'
  | 'other' => {
  const s = sector.toUpperCase();
  if (!s) return 'other';
  if (s.includes('IPP')) return 'independent';
  if (s.includes('ELECTRIC UTILITY')) return 'electric_utility';
  if (s.includes('COMMERCIAL') || s.includes('INDUSTRIAL')) return 'commercial';
  return 'other';
};

const IcpTab: React.FC<IcpTabProps> = ({
  powerPlants,
  selectedPlantIds,
  onPlantSelect,
  onPlantDeselect,
  downloadedPlantIds,
  onMarkPlantsDownloaded,
  onClearDownloadedPlants,
  selectedStates,
  onSelectedStatesChange,
  excessThresholdMw,
  onExcessThresholdMwChange,
  sectorFilter,
  onSectorFilterChange,
}) => {
  const [stateSearch, setStateSearch] = useState<string>('');
  const [isStatesOpen, setIsStatesOpen] = useState<boolean>(false);
  const [rowsToShow, setRowsToShow] = useState<number>(10);
  const [isResultsOpen, setIsResultsOpen] = useState<boolean>(true);
  const [isPlantResearchOpen, setIsPlantResearchOpen] = useState<boolean>(false);
  const [autoSelectionMode, setAutoSelectionMode] = useState<'none' | 'top_all' | 'next_undownloaded'>('none');
  const statesDropdownRef = useRef<HTMLDivElement>(null);

  // Apollo contacts state
  const [contactsByCompany, setContactsByCompany] = useState<Record<string, Contact[]>>({});
  const [isLoadingContacts, setIsLoadingContacts] = useState<boolean>(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [isDownloadingCsv2, setIsDownloadingCsv2] = useState<boolean>(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState<boolean>(false);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const [isAdvancedSelectMenuOpen, setIsAdvancedSelectMenuOpen] = useState<boolean>(false);
  const advancedSelectMenuRef = useRef<HTMLDivElement>(null);

  const [plantQuestion, setPlantQuestion] = useState<string>('');
  const [plantAnswer, setPlantAnswer] = useState<string>('');
  const [plantCitations, setPlantCitations] = useState<string[]>([]);
  const [plantResearchError, setPlantResearchError] = useState<string | null>(null);
  const [isLoadingPlantResearch, setIsLoadingPlantResearch] = useState<boolean>(false);

  useEffect(() => {
    if (!isStatesOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsStatesOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!statesDropdownRef.current) return;
      if (!statesDropdownRef.current.contains(e.target as Node)) {
        setIsStatesOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [isStatesOpen]);

  useEffect(() => {
    if (!isDownloadMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsDownloadMenuOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!downloadMenuRef.current) return;
      if (!downloadMenuRef.current.contains(e.target as Node)) {
        setIsDownloadMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [isDownloadMenuOpen]);

  useEffect(() => {
    if (!isAdvancedSelectMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsAdvancedSelectMenuOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!advancedSelectMenuRef.current) return;
      if (!advancedSelectMenuRef.current.contains(e.target as Node)) {
        setIsAdvancedSelectMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [isAdvancedSelectMenuOpen]);

  const availableStates = useMemo(() => {
    const states = new Set<string>();
    powerPlants
      .filter((plant) => plant.country === 'US')
      .forEach((plant) => {
        const st = getPlantState(plant);
        if (st && st.length > 0) states.add(st);
      });
    return Array.from(states).sort();
  }, [powerPlants]);

  const visibleStates = useMemo(() => {
    const q = stateSearch.trim().toUpperCase();
    if (!q) return availableStates;
    return availableStates.filter((st) => st.includes(q));
  }, [availableStates, stateSearch]);

  const visibleStatesSorted = useMemo(() => {
    // Keep selected states at the top, then alphabetically
    return [...visibleStates].sort((a, b) => {
      const aSelected = selectedStates.has(a);
      const bSelected = selectedStates.has(b);
      if (aSelected && !bSelected) return -1;
      if (bSelected && !aSelected) return 1;
      return a.localeCompare(b);
    });
  }, [visibleStates, selectedStates]);

  const candidates = useMemo(() => {
    const threshold = Number.isFinite(excessThresholdMw) ? excessThresholdMw : 0;
    const states = selectedStates;

    return powerPlants
      .filter((plant) => plant.country === 'US')
      .filter((plant) => {
        if (sectorFilter === 'all') return true;
        const category = classifyUsSector(getUsSector(plant));
        return category === sectorFilter;
      })
      .filter((plant) => {
        const st = getPlantState(plant);
        if (st.length === 0) return false;
        if (states.size === 0) return true;
        return states.has(st);
      })
      .map((plant) => {
        const available = plant.output || 0;
        const used = plant.usedCapacity || 0;
        const excess = available - used;
        const capacityFactor = available > 0 ? (used / available) * 100 : 0;
        return { plant, available, used, excess, capacityFactor };
      })
      .filter((row) => row.excess >= threshold)
      .sort((a, b) => b.excess - a.excess);
  }, [powerPlants, selectedStates, excessThresholdMw]);

  const undownloadedCandidates = useMemo(() => {
    return candidates.filter(({ plant }) => !downloadedPlantIds.has(plant.id));
  }, [candidates, downloadedPlantIds]);

  const selectedCandidateRows = useMemo(() => {
    return candidates.filter((row) => selectedPlantIds.has(row.plant.id));
  }, [candidates, selectedPlantIds]);

  const displayedCandidates = useMemo(() => {
    if (rowsToShow <= 0) return candidates;
    return candidates.slice(0, rowsToShow);
  }, [candidates, rowsToShow]);

  const exportableSelectedRows = useMemo(() => {
    return selectedCandidateRows.filter((row) => !downloadedPlantIds.has(row.plant.id));
  }, [downloadedPlantIds, selectedCandidateRows]);

  const downloadableExportableRows = useMemo(() => {
    if (rowsToShow <= 0) return exportableSelectedRows;
    return exportableSelectedRows.slice(0, rowsToShow);
  }, [exportableSelectedRows, rowsToShow]);

  const advancedSelectCounts = useMemo(() => {
    const undownloaded = candidates.filter(({ plant }) => !downloadedPlantIds.has(plant.id));
    const limit = rowsToShow <= 0 ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(rowsToShow));

    // Count for "Next N" (page forward through undownloaded).
    const selectedIds = new Set(selectedCandidateRows.map((r) => r.plant.id));
    let startIndex = 0;
    for (let i = 0; i < undownloaded.length; i += 1) {
      if (selectedIds.has(undownloaded[i]!.plant.id)) {
        startIndex = i + 1;
      }
    }
    const nextCount = Math.max(0, Math.min(undownloaded.length - startIndex, limit));

    // Count for "Select not downloaded" (within top N window).
    const top = rowsToShow <= 0 ? candidates : candidates.slice(0, rowsToShow);
    return { nextCount };
  }, [candidates, downloadedPlantIds, rowsToShow, selectedCandidateRows]);

  const selectedPlantForResearch = useMemo(() => {
    if (selectedCandidateRows.length !== 1) return null;
    return selectedCandidateRows[0]?.plant || null;
  }, [selectedCandidateRows]);

  const toggleState = (state: string) => {
    const next = new Set(selectedStates);
    if (next.has(state)) next.delete(state);
    else next.add(state);
    onSelectedStatesChange(next);
  };

  const selectAllVisibleStates = () => {
    const next = new Set(selectedStates);
    visibleStates.forEach((st) => next.add(st));
    onSelectedStatesChange(next);
  };

  const clearAllStates = () => {
    onSelectedStatesChange(new Set());
  };

  const clearSelectedCandidates = () => {
    displayedCandidates.forEach((row) => {
      if (selectedPlantIds.has(row.plant.id)) onPlantDeselect(row.plant.id);
    });
    setAutoSelectionMode('none');
  };

  const selectTopCandidates = useCallback(() => {
    const top = rowsToShow <= 0 ? candidates : candidates.slice(0, rowsToShow);
    const nextIds = top.map((r) => r.plant.id);
    selectedCandidateRows.forEach(({ plant }) => onPlantDeselect(plant.id));
    nextIds.forEach((id) => onPlantSelect(id));
    setAutoSelectionMode('top_all');
  }, [candidates, onPlantDeselect, onPlantSelect, rowsToShow, selectedCandidateRows]);

  const selectNextUndownloadedCandidates = useCallback(() => {
    const limit = rowsToShow <= 0 ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(rowsToShow));
    const undownloaded = candidates.filter(({ plant }) => !downloadedPlantIds.has(plant.id));

    // "Next" means: take the next batch after the current selection within the sorted undownloaded list.
    // If nothing is selected, start from the top.
    const selectedIds = new Set(selectedCandidateRows.map((r) => r.plant.id));
    let startIndex = 0;
    for (let i = 0; i < undownloaded.length; i += 1) {
      if (selectedIds.has(undownloaded[i]!.plant.id)) {
        startIndex = i + 1;
      }
    }

    const nextIds = undownloaded.slice(startIndex, startIndex + limit).map((r) => r.plant.id);
    if (nextIds.length === 0) return;

    selectedCandidateRows.forEach(({ plant }) => onPlantDeselect(plant.id));
    nextIds.forEach((id) => onPlantSelect(id));
    setAutoSelectionMode('next_undownloaded');
  }, [candidates, downloadedPlantIds, onPlantDeselect, onPlantSelect, rowsToShow, selectedCandidateRows]);

  const lastRowsToShowRef = useRef<number>(rowsToShow);
  useEffect(() => {
    // Only auto-reapply when the "View more" dropdown changes.
    if (lastRowsToShowRef.current === rowsToShow) return;
    lastRowsToShowRef.current = rowsToShow;

    if (autoSelectionMode === 'none') return;
    if (autoSelectionMode === 'top_all') {
      selectTopCandidates();
      return;
    }
    if (autoSelectionMode === 'next_undownloaded') {
      selectNextUndownloadedCandidates();
    }
  }, [
    autoSelectionMode,
    rowsToShow,
    selectNextUndownloadedCandidates,
    selectTopCandidates,
  ]);

  // Fetch contacts from public sources (free) for selected candidates
  const fetchPublicContactsForSelected = useCallback(async () => {
    if (downloadableExportableRows.length === 0) return;

    setIsLoadingContacts(true);
    setContactsError(null);

    const entries: { company: string; url?: string; plant_name: string; state: string; operator?: string }[] = [];
    downloadableExportableRows.forEach(({ plant }) => {
      const owner = getOwner(plant);
      const operator = getOperator(plant);
      const url = getCompanyWebsite(plant);
      const plantName = plant.name;
      const state = getPlantState(plant);

      if (owner) entries.push({ company: owner, url, plant_name: plantName, state, operator });
      if (operator && operator !== owner) {
        entries.push({ company: operator, url, plant_name: plantName, state, operator });
      }
    });

    try {
      const results = await fetchPublicContacts(entries);
      setContactsByCompany((prev) => ({ ...prev, ...results }));
    } catch (error) {
      console.error('Error fetching contacts:', error);
      setContactsError(error instanceof Error ? error.message : 'Failed to fetch contacts');
    } finally {
      setIsLoadingContacts(false);
    }
  }, [downloadableExportableRows]);

  const runPlantResearch = useCallback(async () => {
    if (!selectedPlantForResearch) return;
    const prompt = plantQuestion.trim();
    if (!prompt) return;

    setIsLoadingPlantResearch(true);
    setPlantResearchError(null);
    setPlantAnswer('');
    setPlantCitations([]);

    try {
      const plant = selectedPlantForResearch;
      const owner = getOwner(plant);
      const operator = getOperator(plant);
      const websiteHint = getCompanyWebsite(plant) || getPlantUrl(plant);
      const { answer, citations } = await askPlantResearch({
        prompt: prompt.slice(0, 240),
        plant_name: plant.name,
        state: getPlantState(plant),
        owner,
        operator,
        website_hint: websiteHint,
      });
      setPlantAnswer(answer);
      setPlantCitations(Array.isArray(citations) ? citations : []);
    } catch (error) {
      console.error('Error running plant research:', error);
      setPlantResearchError(error instanceof Error ? error.message : 'Failed to run plant research');
    } finally {
      setIsLoadingPlantResearch(false);
    }
  }, [plantQuestion, selectedPlantForResearch]);

  // Helper to get contacts for a plant
  const getContactsForPlant = useCallback(
    (plant: PowerPlant): Contact[] => {
      const owner = getOwner(plant);
      const operator = getOperator(plant);
      const contacts: Contact[] = [];

      if (owner && contactsByCompany[owner]) {
        contacts.push(...contactsByCompany[owner]);
      }
      if (operator && operator !== owner && contactsByCompany[operator]) {
        contacts.push(...contactsByCompany[operator]);
      }

      return contacts;
    },
    [contactsByCompany]
  );

  // Check if we have contacts for all selected plants
  const hasContactsForAllSelected = useMemo(() => {
    if (downloadableExportableRows.length === 0) return false;

    return downloadableExportableRows.every(({ plant }) => {
      const owner = getOwner(plant);
      const operator = getOperator(plant);
      const hasOwnerContacts = !owner || contactsByCompany[owner] !== undefined;
      const hasOperatorContacts = !operator || operator === owner || contactsByCompany[operator] !== undefined;
      return hasOwnerContacts && hasOperatorContacts;
    });
  }, [downloadableExportableRows, contactsByCompany]);

  const downloadSelectedCsv = () => {
    if (downloadableExportableRows.length === 0) return;

    const header = [
      'plant_id',
      'plant_name',
      'state',
      'available_mw',
      'used_mw',
      'excess_mw',
      'capacity_factor_percent',
      'owner',
      'operator',
      'plant_url',
      'owner_website',
      'latitude',
      'longitude',
      'contact_1_name',
      'contact_1_title',
      'contact_1_email',
      'contact_1_linkedin',
      'contact_1_phone',
      'contact_2_name',
      'contact_2_title',
      'contact_2_email',
      'contact_2_linkedin',
      'contact_2_phone',
    ];

    const lines: string[] = [header.map(toCsvValue).join(',')];
    downloadableExportableRows.forEach(({ plant, available, used, excess, capacityFactor }) => {
      const [lon, lat] = plant.coordinates;
      const contacts = getContactsForPlant(plant);

      const row = [
        plant.id,
        plant.name,
        getPlantState(plant),
        available.toFixed(1),
        used.toFixed(1),
        excess.toFixed(1),
        capacityFactor.toFixed(1),
        getOwner(plant),
        getOperator(plant),
        getPlantUrl(plant),
        getCompanyWebsite(plant),
        Number.isFinite(lat) ? lat.toFixed(6) : '',
        Number.isFinite(lon) ? lon.toFixed(6) : '',
        // Contact 1
        contacts[0]?.name || '',
        contacts[0]?.title || '',
        contacts[0]?.email || '',
        contacts[0]?.linkedin_url || '',
        contacts[0]?.phone || '',
        // Contact 2
        contacts[1]?.name || '',
        contacts[1]?.title || '',
        contacts[1]?.email || '',
        contacts[1]?.linkedin_url || '',
        contacts[1]?.phone || '',
      ];
      lines.push(row.map(toCsvValue).join(','));
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `icp-candidates_excess${excessThresholdMw}mw_rows${rowsToShow <= 0 ? 'all' : rowsToShow}_${timestamp}.csv`;
    downloadTextFile(filename, lines.join('\n'));

    const downloadedIds = downloadableExportableRows.map(({ plant }) => plant.id);
    onMarkPlantsDownloaded(downloadedIds);

    // Clear just-downloaded selection to avoid accidental re-export.
    downloadedIds.forEach((id) => onPlantDeselect(id));
  };

  const downloadSelectedCsv2 = useCallback(async () => {
    if (downloadableExportableRows.length === 0) return;

    setIsDownloadingCsv2(true);
    setContactsError(null);

    try {
      if (!hasContactsForAllSelected) {
        await fetchPublicContactsForSelected();
      }

      const header = [
        'First Name',
        'Last Name',
        'Title',
        'Company Name',
        'Email',
        'Phone',
        'Stage',
        'Person Linkedin Url',
      ];

      const lines: string[] = [header.map(toCsvValue).join(',')];

      downloadableExportableRows.forEach(({ plant }) => {
        const contacts = getContactsForPlant(plant);
        const best = [...contacts].sort((a, b) => {
          const score = (c: Contact) =>
            (c.email ? 3 : 0) + (c.phone ? 2 : 0) + (c.linkedin_url ? 1 : 0);
          return score(b) - score(a);
        })[0];

        if (!best) return;

        const { firstName, lastName } = splitName(best.name);
        const row = [
          firstName,
          lastName,
          best.title || '',
          best.company || '',
          best.email || '',
          best.phone || '',
          'Prospect',
          best.linkedin_url || '',
        ];
        lines.push(row.map(toCsvValue).join(','));
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `icp-contacts_csv2_${timestamp}.csv`;
      downloadTextFile(filename, lines.join('\n'));

      // Mark plants as downloaded (same behavior as Detailed CSV).
      const downloadedIds = downloadableExportableRows.map(({ plant }) => plant.id);
      onMarkPlantsDownloaded(downloadedIds);
      downloadedIds.forEach((id) => onPlantDeselect(id));
    } catch (error) {
      console.error('Error downloading CSV 2:', error);
      setContactsError(error instanceof Error ? error.message : 'Failed to download CSV 2');
    } finally {
      setIsDownloadingCsv2(false);
    }
  }, [
    downloadableExportableRows,
    fetchPublicContactsForSelected,
    getContactsForPlant,
    hasContactsForAllSelected,
    onMarkPlantsDownloaded,
    onPlantDeselect,
  ]);

  return (
    <div className="tab-content-placeholder">
      <h3>ICP Candidates</h3>
      <div className="placeholder-content">
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 600 }}>States</div>
            <div style={{ position: 'relative' }} ref={statesDropdownRef}>
              <button
                type="button"
                className="dropdown-trigger"
                onClick={() => setIsStatesOpen((v) => !v)}
                aria-expanded={isStatesOpen}
                aria-label="Select states"
                style={{ width: '100%' }}
              >
                <span>Select states ({selectedStates.size === 0 ? 'All' : `${selectedStates.size} selected`})</span>
                <span className="dropdown-arrow">{isStatesOpen ? '▲' : '▼'}</span>
              </button>

              {isStatesOpen && (
                <div
                  className="dropdown-content"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1100,
                    maxHeight: 260,
                    overflowY: 'auto',
                  }}
                >
                  <div className="search-box">
                    <input
                      type="text"
                      placeholder="Search states (e.g. CA)"
                      value={stateSearch}
                      onChange={(e) => setStateSearch(e.target.value)}
                      className="search-input"
                    />
                  </div>

                  <div style={{ display: 'grid', gap: 6, padding: 8 }}>
                    <button type="button" className="clear-cache-btn" onClick={selectAllVisibleStates}>
                      Select all
                    </button>
                    <button type="button" className="clear-cache-btn" onClick={clearAllStates}>
                      Deselect all
                    </button>
                  </div>

                  <div style={{ padding: '4px 0', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    {visibleStatesSorted.map((st) => (
                      <label
                        key={st}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 12px',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedStates.has(st)}
                          onChange={() => toggleState(st)}
                        />
                        <span>{st}</span>
                      </label>
                    ))}
                    {visibleStatesSorted.length === 0 && (
                      <div style={{ fontSize: 12, opacity: 0.7, padding: '8px 12px' }}>
                        No states match “{stateSearch}”.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 600 }}>Excess power threshold (MW)</div>
            <input
              type="number"
              min={0}
              step={1}
              value={excessThresholdMw}
              onChange={(e) => onExcessThresholdMwChange(Number(e.target.value))}
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)' }}
            />
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 600 }}>Sector (US)</div>
            <select
              value={sectorFilter}
              onChange={(e) =>
                onSectorFilterChange(
                  e.target.value as
                    | 'all'
                    | 'independent'
                    | 'electric_utility'
                    | 'commercial'
                    | 'other'
                )
              }
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)' }}
            >
              <option value="all">All</option>
              <option value="independent">Independent providers</option>
              <option value="electric_utility">Electric utility</option>
              <option value="commercial">Commercial / industrial</option>
              <option value="other">Other / unknown</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span>View more</span>
              <select
                value={rowsToShow}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '__custom__') {
                    const current = rowsToShow > 0 ? String(rowsToShow) : '';
                    const input = window.prompt('Enter rows to show (0 = All).', current);
                    if (input == null) return;
                    const next = Number(input);
                    if (!Number.isFinite(next) || next < 0) return;
                    setRowsToShow(Math.floor(next));
                    return;
                  }

                  setRowsToShow(Number(raw));
                }}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)' }}
              >
                {ROWS_TO_SHOW_PRESETS.map((value) => (
                  <option key={value} value={value}>
                    {value === 0 ? 'All' : value}
                  </option>
                ))}
                {!ROWS_TO_SHOW_PRESETS.includes(rowsToShow as (typeof ROWS_TO_SHOW_PRESETS)[number]) && (
                  <option value={rowsToShow}>Custom ({rowsToShow})</option>
                )}
                <option value="__custom__">Custom…</option>
              </select>
            </label>
            <button
              type="button"
              className="clear-cache-btn"
              onClick={selectTopCandidates}
              style={{ minWidth: 190 }}
            >
              Select all ({rowsToShow <= 0 ? candidates.length : Math.min(rowsToShow, candidates.length)})
            </button>
            <div style={{ position: 'relative' }} ref={advancedSelectMenuRef}>
              <button
                type="button"
                className="clear-cache-btn"
                onClick={() => setIsAdvancedSelectMenuOpen((v) => !v)}
                disabled={candidates.length === 0}
                style={{ minWidth: 190, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}
                title="Advanced selection options"
              >
                <span>Advanced select</span>
                <span aria-hidden="true" style={{ opacity: 0.8 }}>
                  {isAdvancedSelectMenuOpen ? '▲' : '▼'}
                </span>
              </button>

              {isAdvancedSelectMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    zIndex: 1200,
                    width: 300,
                    borderRadius: 10,
                    border: '1px solid rgba(0,0,0,0.12)',
                    background: '#ffffff',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    overflow: 'hidden',
                  }}
                  role="menu"
                  aria-label="Advanced select options"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsAdvancedSelectMenuOpen(false);
                      selectNextUndownloadedCandidates();
                    }}
                    disabled={undownloadedCandidates.length === 0}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'grid',
                      gap: 2,
                    }}
                    role="menuitem"
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>
                      Next {rowsToShow <= 0 ? 'All' : rowsToShow} ({advancedSelectCounts.nextCount})
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      Page forward through not-downloaded plants
                    </div>
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="clear-cache-btn"
              onClick={clearSelectedCandidates}
              style={{ minWidth: 190 }}
            >
              Clear selected
            </button>
            <button
              type="button"
              className="clear-cache-btn"
              onClick={onClearDownloadedPlants}
              disabled={downloadedPlantIds.size === 0}
              style={{ minWidth: 190 }}
              title="Clear the downloaded marker for all plants"
            >
              Reset downloaded
            </button>
            <button
              type="button"
              className="clear-cache-btn"
              onClick={fetchPublicContactsForSelected}
              disabled={downloadableExportableRows.length === 0 || isLoadingContacts}
              style={{ minWidth: 190 }}
              title={
                downloadableExportableRows.length === 0
                  ? 'Select at least 1 displayed plant to fetch contacts'
                  : isLoadingContacts
                  ? 'Loading contacts...'
                  : 'Fetch contact info'
              }
            >
              {isLoadingContacts ? 'Loading...' : `Fetch Contacts (${rowsToShow <= 0 ? downloadableExportableRows.length : Math.min(rowsToShow, downloadableExportableRows.length)})`}
            </button>
            <button
              type="button"
              className="clear-cache-btn"
              onClick={downloadSelectedCsv}
              disabled
              style={{ display: 'none' }}
            >
              Download CSV
            </button>
            <div style={{ position: 'relative' }} ref={downloadMenuRef}>
              <button
                type="button"
                className="clear-cache-btn"
                onClick={() => setIsDownloadMenuOpen((v) => !v)}
                disabled={downloadableExportableRows.length === 0 || isLoadingContacts || isDownloadingCsv2}
                style={{ minWidth: 190, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}
                title={
                  downloadableExportableRows.length === 0
                    ? 'Select at least 1 displayed plant to export'
                    : 'Choose a CSV export format'
                }
              >
                <span>{isDownloadingCsv2 ? 'Downloading…' : 'Download CSV'}</span>
                <span aria-hidden="true" style={{ opacity: 0.8 }}>
                  {isDownloadMenuOpen ? '▲' : '▼'}
                </span>
              </button>

              {isDownloadMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    zIndex: 1200,
                    width: 260,
                    borderRadius: 10,
                    border: '1px solid rgba(0,0,0,0.12)',
                    background: '#ffffff',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    overflow: 'hidden',
                  }}
                  role="menu"
                  aria-label="Download CSV options"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsDownloadMenuOpen(false);
                      downloadSelectedCsv();
                    }}
                    disabled={downloadableExportableRows.length === 0}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'grid',
                      gap: 2,
                    }}
                    role="menuitem"
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>
                      Detailed CSV (plants)
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      Current format (multi-column) • {downloadableExportableRows.length} plant(s)
                    </div>
                  </button>
                  <div style={{ height: 1, background: 'rgba(0,0,0,0.06)' }} />
                  <button
                    type="button"
                    onClick={() => {
                      setIsDownloadMenuOpen(false);
                      void downloadSelectedCsv2();
                    }}
                    disabled={downloadableExportableRows.length === 0 || isLoadingContacts || isDownloadingCsv2}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'grid',
                      gap: 2,
                    }}
                    role="menuitem"
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>
                      Contacts CSV (8 columns)
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      One contact per plant • {downloadableExportableRows.length} plant(s)
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Showing {candidates.length} plants in {Array.from(selectedStates).sort().join(', ')} with excess ≥{' '}
            {excessThresholdMw} MW.
          </div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Downloaded (this device): {downloadedPlantIds.size}
          </div>

          {contactsError && (
            <div style={{ fontSize: 12, color: '#dc2626', padding: '8px 12px', background: 'rgba(220, 38, 38, 0.1)', borderRadius: 6 }}>
              {contactsError}
            </div>
          )}

          {hasContactsForAllSelected && downloadableExportableRows.length > 0 && (
            <div style={{ fontSize: 12, color: '#059669', padding: '8px 12px', background: 'rgba(5, 150, 105, 0.1)', borderRadius: 6 }}>
              ✓ Contacts loaded for {downloadableExportableRows.length} selected plant(s). Ready to download CSV with contact info.
            </div>
          )}

          <div
            style={{
              borderRadius: 8,
              border: '1px solid rgba(0,0,0,0.1)',
              background: '#ffffff',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => setIsPlantResearchOpen((v) => !v)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '7px 12px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              aria-expanded={isPlantResearchOpen}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 18,
                    height: 18,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 6,
                    border: '1px solid rgba(0,0,0,0.08)',
                    color: '#111827',
                    fontSize: 12,
                    lineHeight: 1,
                    transform: isPlantResearchOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s ease',
                    flex: '0 0 auto',
                  }}
                >
                  ▶
                </span>
                <div>
                  <div style={{ fontWeight: 700, color: '#111827', fontSize: 13 }}>
                    Expand if you have more questions about a specific plant
                  </div>
                  {isPlantResearchOpen && (
                    <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.25, marginTop: 2 }}>
                      Q&A is only enabled when exactly 1 plant is selected.
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{isPlantResearchOpen ? 'Minimize' : 'Expand'}</div>
            </button>

            {isPlantResearchOpen && (
              <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                {selectedPlantForResearch ? (
                  <>
                    <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
                      Asking about <strong>{selectedPlantForResearch.name}</strong> ({getPlantState(selectedPlantForResearch)}). Limit 240 chars.
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <textarea
                        value={plantQuestion}
                        onChange={(e) => {
                          setPlantQuestion(e.target.value.slice(0, 240));
                          setPlantAnswer('');
                          setPlantCitations([]);
                          setPlantResearchError(null);
                        }}
                        placeholder="Example: Who is the owner/operator and what is the best official contact page?"
                        rows={2}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: 10,
                          border: '1px solid rgba(0,0,0,0.12)',
                          background: '#ffffff',
                          resize: 'vertical',
                          fontSize: 13,
                          lineHeight: 1.4,
                          color: '#111827',
                        }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{plantQuestion.trim().length}/240</div>
                        <button
                          type="button"
                          className="clear-cache-btn"
                          onClick={runPlantResearch}
                          disabled={isLoadingPlantResearch || plantQuestion.trim().length === 0}
                          title={isLoadingPlantResearch ? 'Loading…' : 'Ask a question about the selected plant'}
                        >
                          {isLoadingPlantResearch ? 'Asking…' : 'Ask'}
                        </button>
                      </div>
                    </div>

                    {plantResearchError && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>{plantResearchError}</div>
                    )}

                    {plantAnswer && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#111827' }}>Answer</div>
                        <div
                          style={{
                            border: '1px solid rgba(0,0,0,0.08)',
                            background: '#ffffff',
                            borderRadius: 8,
                            padding: 10,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                          }}
                        >
                          {renderAnswerBlock(plantAnswer)}
                        </div>
                        {plantCitations.length > 0 && (
                          <div style={{ marginTop: 10, fontSize: 12, opacity: 1, color: '#111827' }}>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>Sources</div>
                            <div style={{ display: 'grid', gap: 4 }}>
                              {plantCitations.map((url, idx) => (
                                <a key={`${idx}-${url}`} href={url} target="_blank" rel="noreferrer">
                                  [{idx + 1}] {getHostname(url)}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Select exactly <strong>1</strong> plant to enable Q&A.
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <button
              type="button"
              onClick={() => setIsResultsOpen((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid rgba(0,0,0,0.1)',
                background: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
              aria-expanded={isResultsOpen}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ transform: isResultsOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
                  ▶
                </span>
                Selected ({selectedCandidateRows.length} plant{selectedCandidateRows.length === 1 ? '' : 's'} selected)
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.8 }}>
                {isResultsOpen ? 'Hide' : 'Show'}
              </span>
            </button>

            {isResultsOpen && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div
                  style={{
                    maxHeight: 360,
                    overflowY: 'auto',
                    paddingRight: 6,
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  {selectedCandidateRows.map(({ plant, excess }) => (
                    <label
                      key={plant.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '18px 1fr',
                        gap: 10,
                        alignItems: 'start',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid rgba(0,0,0,0.08)',
                        background: downloadedPlantIds.has(plant.id)
                          ? 'rgba(5, 150, 105, 0.06)'
                          : 'rgba(255,255,255,0.5)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPlantIds.has(plant.id)}
                        onChange={() =>
                          (selectedPlantIds.has(plant.id) ? onPlantDeselect(plant.id) : onPlantSelect(plant.id))
                        }
                      />
                      <div style={{ display: 'grid', gap: 2 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <div style={{ fontWeight: 600, lineHeight: 1.2 }}>{plant.name}</div>
                          {downloadedPlantIds.has(plant.id) && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#059669',
                                background: 'rgba(5, 150, 105, 0.12)',
                                border: '1px solid rgba(5, 150, 105, 0.22)',
                                padding: '2px 6px',
                                borderRadius: 999,
                              }}
                            >
                              Downloaded
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          {getPlantState(plant)} • Excess {excess.toFixed(1)} MW
                        </div>
                        {(getOwner(plant) || getOperator(plant)) && (
                          <div style={{ fontSize: 12, opacity: 0.8 }}>
                            {[getOwner(plant), getOperator(plant)].filter(Boolean).join(' • ')}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
                {selectedCandidateRows.length === 0 && (
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    No plants selected. Use “Select all” or “Advanced select” to choose plants.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IcpTab;

