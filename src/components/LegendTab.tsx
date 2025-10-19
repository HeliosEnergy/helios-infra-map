import React, { useState, useMemo } from 'react';
import './LegendTab.css';
import type { PowerPlant } from '../models/PowerPlant';
import PlantSearch from './PlantSearch';

interface LegendTabProps {
  allSourcesInData: string[];
  filteredSources: Set<string>;
  onToggleSourceFilter: (source: string) => void;
  showWfsCables: boolean;
  onToggleWfsCables: () => void;
  powerPlantCounts?: Record<string, number>;

  // Search functionality
  powerPlants: PowerPlant[];
  selectedPlantIds: Set<string>;
  onPlantSelect: (plantId: string) => void;
  onPlantDeselect: (plantId: string) => void;
  onApplySelection: () => void;
}

const LegendTab: React.FC<LegendTabProps> = ({
  allSourcesInData,
  filteredSources,
  onToggleSourceFilter,
  showWfsCables,
  onToggleWfsCables,
  powerPlantCounts = {},
  powerPlants,
  selectedPlantIds,
  onPlantSelect,
  onPlantDeselect,
  onApplySelection,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'active'>('name');
  const [groupByCategory, setGroupByCategory] = useState(false);

  // Power plant colors (matching the main app)
  const POWER_PLANT_COLORS: Record<string, [number, number, number]> = {
    'hydro': [31, 119, 180],      // Blue (water-based energy)
    'gas': [255, 127, 14],        // Orange (gas)
    'wind': [44, 160, 44],        // Green (wind)
    'nuclear': [214, 39, 40],     // Red (nuclear)
    'coal': [64, 64, 64],         // Dark gray (coal)
    'solar': [255, 215, 0],       // Yellow (solar)
    'oil': [128, 128, 128],       // Medium gray (oil)
    'biomass': [100, 180, 50],    // Vibrant green (biomass)
    'battery': [128, 0, 128],     // Purple (battery/storage)
    'diesel': [192, 192, 192],    // Light gray (diesel)
    'geothermal': [160, 32, 240], // Violet (geothermal)
    'tidal': [0, 191, 255],       // Sky blue (tidal)
    'waste': [139, 69, 19],       // Saddle brown (waste)
    'biofuel': [210, 180, 140],   // Tan (biofuel)
    'other': [148, 103, 189]      // Purple (other)
};

const CABLE_COLOR: [number, number, number] = [255, 165, 0]; // Orange

  // Filter and sort sources based on search and sort options
  const processedSources = useMemo(() => {
    let sources = allSourcesInData.filter(source => source !== 'other');

    // Apply search filter
    if (searchQuery.trim()) {
      sources = sources.filter(source =>
        source.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply sorting
    sources.sort((a, b) => {
      if (sortBy === 'active') {
        const aActive = filteredSources.has(a);
        const bActive = filteredSources.has(b);
        if (aActive !== bActive) return aActive ? -1 : 1;
      }
      return a.localeCompare(b);
    });

    return sources;
  }, [allSourcesInData, searchQuery, sortBy, filteredSources]);

  // Group sources by category if enabled
  const groupedSources = useMemo(() => {
    if (!groupByCategory) {
      return { 'All Types': processedSources };
    }

    const groups: Record<string, string[]> = {
      'Renewable': [],
      'Fossil Fuel': [],
      'Nuclear': [],
      'Storage': [],
      'Other': []
    };

    const categoryMap: Record<string, string> = {
      'hydro': 'Renewable',
      'wind': 'Renewable',
      'solar': 'Renewable',
      'geothermal': 'Renewable',
      'tidal': 'Renewable',
      'biomass': 'Renewable',
      'biofuel': 'Renewable',
      'gas': 'Fossil Fuel',
      'coal': 'Fossil Fuel',
      'oil': 'Fossil Fuel',
      'diesel': 'Fossil Fuel',
      'waste': 'Fossil Fuel',
      'nuclear': 'Nuclear',
      'battery': 'Storage',
      'other': 'Other'
    };

    processedSources.forEach(source => {
      const category = categoryMap[source] || 'Other';
      groups[category].push(source);
    });

    // Remove empty groups
    Object.keys(groups).forEach(key => {
      if (groups[key].length === 0) {
        delete groups[key];
      }
    });

    return groups;
  }, [processedSources, groupByCategory]);

  const handleClearPlantSelection = () => {
    // Clear all selected plants
    selectedPlantIds.forEach(id => onPlantDeselect(id));
    onApplySelection();
  };

  // Helper function for category name display with tooltips
  const getDisplayCategoryName = (category: string): { display: string, full: string } => {
    if (category.length <= 15) return { display: category, full: category };

    // Truncate and add ellipsis
    return {
      display: category.substring(0, 15) + '...',
      full: category
    };
  };

  const activeCount = filteredSources.size;
  const totalCount = allSourcesInData.length;

  return (
    <div className="legend-tab">
      {/* Header with controls */}
      <div className="legend-controls">
        <div className="control-row">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search power plant types..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="legend-search"
              aria-label="Search power plant types"
            />
            <span className="search-icon" aria-hidden="true">🔍</span>
          </div>

          <div className="filter-controls">
            <select
              value={sortBy}
              onChange={(_e) => setSortBy(_e.target.value as 'name' | 'active')}
              className="sort-select"
              aria-label="Sort legend items"
            >
              <option value="name">Sort by Name</option>
              <option value="active">Sort by Active</option>
            </select>

            <label className="group-toggle">
              <input
                type="checkbox"
                checked={groupByCategory}
                onChange={() => setGroupByCategory(!groupByCategory)}
              />
              <span className="toggle-slider"></span>
              Group by Category
            </label>
          </div>
        </div>

        <div className="legend-stats">
          <span className="stats-text">
            {activeCount} of {totalCount} types active
          </span>
        </div>
      </div>

      {/* Plant Search Section with improved UI */}
      <div className="plant-search-section">
        <PlantSearch
          powerPlants={powerPlants}
          selectedPlantIds={selectedPlantIds}
          onPlantSelect={onPlantSelect}
          onPlantDeselect={onPlantDeselect}
          onClearSelection={handleClearPlantSelection}
        />
      </div>

      {/* Legend Content */}
      <div className="legend-content">
        {Object.entries(groupedSources).map(([category, sources]) => (
          <div key={category} className="legend-section">
            {groupByCategory && (() => {
              const { display, full } = getDisplayCategoryName(category);
              return (
                <h4 className="category-title" title={full}>{display}</h4>
              );
            })()}

            <div className="legend-grid">
              {sources.map((source) => {
                const color = POWER_PLANT_COLORS[source] || POWER_PLANT_COLORS.other;
                const isActive = filteredSources.has(source);

                return (
                  <button
                    key={source}
                    className={`legend-item ${isActive ? 'active' : 'inactive'}`}
                    onClick={() => onToggleSourceFilter(source)}
                    aria-pressed={isActive}
                    aria-label={`${isActive ? 'Hide' : 'Show'} ${source} power plants`}
                    title={`${source.charAt(0).toUpperCase() + source.slice(1)} power plants`}
                  >
                    <div
                      className="legend-color"
                      style={{
                        backgroundColor: `rgb(${color.join(',')})`
                      }}
                      aria-hidden="true"
                    />
                    <span className="legend-label">
                      {source.charAt(0).toUpperCase() + source.slice(1)}
                      {powerPlantCounts && powerPlantCounts[source] !== undefined && (
                        <span className="legend-count"> ({powerPlantCounts[source]})</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Infrastructure Section */}
        <div className="legend-section">
          <h4 className="category-title">Infrastructure</h4>
          <div className="legend-grid">
            <button
              className={`legend-item ${showWfsCables ? 'active' : 'inactive'}`}
              onClick={onToggleWfsCables}
              aria-pressed={showWfsCables}
              aria-label={`${showWfsCables ? 'Hide' : 'Show'} terrestrial links`}
              title="Terrestrial links and submarine cables"
            >
              <div
                className="legend-color"
                style={{
                  backgroundColor: `rgb(${CABLE_COLOR.join(',')})`
                }}
                aria-hidden="true"
              />
              <span className="legend-label">Terrestrial Links
                      {powerPlantCounts && powerPlantCounts['cables'] !== undefined && (
                        <span className="legend-count"> ({powerPlantCounts['cables']})</span>
                      )}
                    </span>
            </button>
          </div>
        </div>


      </div>
    </div>
  );
};

export default LegendTab;