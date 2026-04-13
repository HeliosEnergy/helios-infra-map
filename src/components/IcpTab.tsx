import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PowerPlant } from '../models/PowerPlant';
import { fetchApolloContacts, type Contact } from '../utils/apolloApi';

type IcpTabProps = {
  powerPlants: PowerPlant[];
  selectedPlantIds: Set<string>;
  onPlantSelect: (plantId: string) => void;
  onPlantDeselect: (plantId: string) => void;
  selectedStates: Set<string>;
  onSelectedStatesChange: (next: Set<string>) => void;
  excessThresholdMw: number;
  onExcessThresholdMwChange: (next: number) => void;
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

const toCsvValue = (value: string | number | null | undefined): string => {
  const raw = value == null ? '' : String(value);
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
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

const IcpTab: React.FC<IcpTabProps> = ({
  powerPlants,
  selectedPlantIds,
  onPlantSelect,
  onPlantDeselect,
  selectedStates,
  onSelectedStatesChange,
  excessThresholdMw,
  onExcessThresholdMwChange,
}) => {
  const [stateSearch, setStateSearch] = useState<string>('');
  const [isStatesOpen, setIsStatesOpen] = useState<boolean>(false);
  const [rowsToShow, setRowsToShow] = useState<number>(10);
  const [customRowsToShow, setCustomRowsToShow] = useState<string>('10');
  const [isResultsOpen, setIsResultsOpen] = useState<boolean>(true);
  const statesDropdownRef = useRef<HTMLDivElement>(null);

  // Apollo contacts state
  const [contactsByCompany, setContactsByCompany] = useState<Record<string, Contact[]>>({});
  const [isLoadingContacts, setIsLoadingContacts] = useState<boolean>(false);
  const [contactsError, setContactsError] = useState<string | null>(null);

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
    setCustomRowsToShow(String(rowsToShow));
  }, [rowsToShow]);

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
    const threshold = Number.isFinite(excessThresholdMw) ? excessThresholdMw : 10;
    const states = selectedStates;

    return powerPlants
      .filter((plant) => plant.country === 'US')
      .filter((plant) => {
        const st = getPlantState(plant);
        return st.length > 0 && states.has(st);
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

  const selectedCandidateRows = useMemo(() => {
    return candidates.filter((row) => selectedPlantIds.has(row.plant.id));
  }, [candidates, selectedPlantIds]);

  const displayedCandidates = useMemo(() => {
    if (rowsToShow <= 0) return candidates;
    return candidates.slice(0, rowsToShow);
  }, [candidates, rowsToShow]);

  const downloadableSelectedRows = useMemo(() => {
    if (rowsToShow <= 0) return selectedCandidateRows;
    return selectedCandidateRows.slice(0, rowsToShow);
  }, [selectedCandidateRows, rowsToShow]);

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

  const selectAllCandidates = () => {
    displayedCandidates.forEach((row) => onPlantSelect(row.plant.id));
  };

  const clearSelectedCandidates = () => {
    displayedCandidates.forEach((row) => {
      if (selectedPlantIds.has(row.plant.id)) onPlantDeselect(row.plant.id);
    });
  };

  // Fetch contacts from Apollo for selected candidates
  const fetchContactsForSelected = useCallback(async () => {
    if (downloadableSelectedRows.length === 0) return;

    setIsLoadingContacts(true);
    setContactsError(null);

    // Collect unique company names (owners and operators)
    const companies = new Set<string>();
    downloadableSelectedRows.forEach(({ plant }) => {
      const owner = getOwner(plant);
      const operator = getOperator(plant);
      if (owner) companies.add(owner);
      if (operator && operator !== owner) companies.add(operator);
    });

    try {
      const results = await fetchApolloContacts([...companies]);
      setContactsByCompany((prev) => ({ ...prev, ...results }));
    } catch (error) {
      console.error('Error fetching contacts:', error);
      setContactsError(error instanceof Error ? error.message : 'Failed to fetch contacts');
    } finally {
      setIsLoadingContacts(false);
    }
  }, [downloadableSelectedRows]);

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
    if (downloadableSelectedRows.length === 0) return false;

    return downloadableSelectedRows.every(({ plant }) => {
      const owner = getOwner(plant);
      const operator = getOperator(plant);
      const hasOwnerContacts = !owner || contactsByCompany[owner] !== undefined;
      const hasOperatorContacts = !operator || operator === owner || contactsByCompany[operator] !== undefined;
      return hasOwnerContacts && hasOperatorContacts;
    });
  }, [downloadableSelectedRows, contactsByCompany]);

  const downloadSelectedCsv = () => {
    if (downloadableSelectedRows.length === 0) return;

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
      'latitude',
      'longitude',
      'contact_1_name',
      'contact_1_title',
      'contact_1_email',
      'contact_1_linkedin',
      'contact_1_company',
      'contact_2_name',
      'contact_2_title',
      'contact_2_email',
      'contact_2_linkedin',
      'contact_2_company',
      'contact_3_name',
      'contact_3_title',
      'contact_3_email',
      'contact_3_linkedin',
      'contact_3_company',
    ];

    const lines: string[] = [header.map(toCsvValue).join(',')];
    downloadableSelectedRows.forEach(({ plant, available, used, excess, capacityFactor }) => {
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
        Number.isFinite(lat) ? lat.toFixed(6) : '',
        Number.isFinite(lon) ? lon.toFixed(6) : '',
        // Contact 1
        contacts[0]?.name || '',
        contacts[0]?.title || '',
        contacts[0]?.email || '',
        contacts[0]?.linkedin_url || '',
        contacts[0]?.company || '',
        // Contact 2
        contacts[1]?.name || '',
        contacts[1]?.title || '',
        contacts[1]?.email || '',
        contacts[1]?.linkedin_url || '',
        contacts[1]?.company || '',
        // Contact 3
        contacts[2]?.name || '',
        contacts[2]?.title || '',
        contacts[2]?.email || '',
        contacts[2]?.linkedin_url || '',
        contacts[2]?.company || '',
      ];
      lines.push(row.map(toCsvValue).join(','));
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `icp-candidates_excess${excessThresholdMw}mw_rows${rowsToShow <= 0 ? 'all' : rowsToShow}_${timestamp}.csv`;
    downloadTextFile(filename, lines.join('\n'));
  };

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
                <span>Select states ({selectedStates.size} selected)</span>
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

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 8 }}>
                    <button type="button" className="clear-cache-btn" onClick={selectAllVisibleStates}>
                      Select visible
                    </button>
                    <button type="button" className="clear-cache-btn" onClick={clearAllStates}>
                      Clear states
                    </button>
                    <button
                      type="button"
                      className="clear-cache-btn"
                      onClick={() => onSelectedStatesChange(new Set(['UT', 'TX', 'CA']))}
                    >
                      Reset to UT/TX/CA
                    </button>
                  </div>

                  <div style={{ padding: '4px 0' }}>
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

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span>View more</span>
              <select
                value={rowsToShow}
                onChange={(e) => setRowsToShow(Number(e.target.value))}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)' }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={0}>All</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span>Custom</span>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={customRowsToShow}
                onChange={(e) => {
                  const raw = e.target.value;
                  setCustomRowsToShow(raw);
                  if (raw.trim() === '') return;
                  const next = Number(raw);
                  if (!Number.isFinite(next) || next < 0) return;
                  setRowsToShow(Math.floor(next));
                }}
                style={{ width: 92, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)' }}
                aria-label="Custom rows to show"
              />
            </label>
            <button type="button" className="clear-cache-btn" onClick={selectAllCandidates}>
              Select visible ({displayedCandidates.length})
            </button>
            <button type="button" className="clear-cache-btn" onClick={clearSelectedCandidates}>
              Clear visible
            </button>
            <button
              type="button"
              className="clear-cache-btn"
              onClick={fetchContactsForSelected}
              disabled={downloadableSelectedRows.length === 0 || isLoadingContacts}
              title={
                downloadableSelectedRows.length === 0
                  ? 'Select at least 1 displayed plant to fetch contacts'
                  : isLoadingContacts
                  ? 'Loading contacts...'
                  : 'Fetch contacts from Apollo.io'
              }
            >
              {isLoadingContacts ? 'Loading...' : `Fetch Contacts (${downloadableSelectedRows.length})`}
            </button>
            <button
              type="button"
              className="clear-cache-btn"
              onClick={downloadSelectedCsv}
              disabled={downloadableSelectedRows.length === 0}
              title={
                downloadableSelectedRows.length === 0
                  ? 'Select at least 1 displayed plant to export'
                  : hasContactsForAllSelected
                  ? 'Download CSV with contacts'
                  : 'Download CSV (fetch contacts first for contact info)'
              }
            >
              Download CSV ({downloadableSelectedRows.length})
            </button>
          </div>

          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Showing {candidates.length} plants in {Array.from(selectedStates).sort().join(', ')} with excess ≥{' '}
            {excessThresholdMw} MW.
          </div>

          {contactsError && (
            <div style={{ fontSize: 12, color: '#dc2626', padding: '8px 12px', background: 'rgba(220, 38, 38, 0.1)', borderRadius: 6 }}>
              {contactsError}
            </div>
          )}

          {hasContactsForAllSelected && downloadableSelectedRows.length > 0 && (
            <div style={{ fontSize: 12, color: '#059669', padding: '8px 12px', background: 'rgba(5, 150, 105, 0.1)', borderRadius: 6 }}>
              ✓ Contacts loaded for {downloadableSelectedRows.length} selected plant(s). Ready to download CSV with contact info.
            </div>
          )}

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
                Candidates ({candidates.length})
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.8 }}>
                {isResultsOpen ? 'Hide' : 'Show'}
              </span>
            </button>

            {isResultsOpen && (
              <div style={{ display: 'grid', gap: 8 }}>
                {displayedCandidates.map(({ plant, excess }) => (
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
                      background: 'rgba(255,255,255,0.5)',
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
                      <div style={{ fontWeight: 600, lineHeight: 1.2 }}>{plant.name}</div>
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
                {rowsToShow > 0 && candidates.length > rowsToShow && (
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Showing first {rowsToShow} results out of {candidates.length}. Increase “View more” to view more.
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

