import React, { useState, useMemo } from 'react';
import './LegendFooter.css';

interface LegendFooterProps {
  allSourcesInData: string[];
  filteredSources: Set<string>;
  onToggleSourceFilter: (source: string) => void;
  showWfsCables: boolean;
  onToggleWfsCables: () => void;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

const LegendFooter: React.FC<LegendFooterProps> = ({
  allSourcesInData,
  filteredSources,
  onToggleSourceFilter,
  showWfsCables,
  onToggleWfsCables,
  isExpanded = false,
  onToggleExpanded,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [internalExpanded, setInternalExpanded] = useState(isExpanded);

  // Use external expanded state if provided, otherwise use internal
  const expanded = onToggleExpanded ? isExpanded : internalExpanded;
  const handleToggleExpanded = onToggleExpanded || (() => setInternalExpanded(!internalExpanded));

  // Filter sources based on search query
  const filteredSourcesList = useMemo(() => {
    if (!searchQuery.trim()) {
      return allSourcesInData.filter(source => source !== 'other');
    }

    return allSourcesInData
      .filter(source => source !== 'other')
      .filter(source =>
        source.toLowerCase().includes(searchQuery.toLowerCase())
      );
  }, [allSourcesInData, searchQuery]);

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

  return (
    <footer className="legend-footer">
      <div className="legend-header">
        <h4 className="legend-title">Legend</h4>
        <div className="legend-controls">
          {filteredSourcesList.length > 6 && (
            <div className="search-container">
              <input
                type="text"
                placeholder="Search types..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="legend-search"
                aria-label="Search power plant types"
              />
              <span className="search-icon" aria-hidden="true">🔍</span>
            </div>
          )}
          {onToggleExpanded && (
            <button
              className="expand-toggle"
              onClick={handleToggleExpanded}
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse legend' : 'Expand legend'}
            >
              {expanded ? '−' : '+'}
            </button>
          )}
        </div>
      </div>

      <div className={`legend-content ${expanded ? 'expanded' : ''}`}>
        {/* Power Plant Types */}
        <div className="legend-section">
          <h5 className="section-subtitle">Power Plants</h5>
          <div className="legend-grid">
            {filteredSourcesList.map((source) => {
              const color = POWER_PLANT_COLORS[source] || POWER_PLANT_COLORS.other;
              const isActive = filteredSources.has(source) || source === 'other';

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
                  </span>
                </button>
              );
            })}

            {/* Other category */}
            <button
              className={`legend-item ${filteredSources.has('other') ? 'active' : 'inactive'}`}
              onClick={() => onToggleSourceFilter('other')}
              aria-pressed={filteredSources.has('other')}
              aria-label={`${filteredSources.has('other') ? 'Hide' : 'Show'} other power plants`}
              title="Other power plants"
            >
              <div
                className="legend-color"
                style={{
                  backgroundColor: `rgb(${POWER_PLANT_COLORS.other.join(',')})`
                }}
                aria-hidden="true"
              />
              <span className="legend-label">Other</span>
            </button>
          </div>
        </div>

        {/* Infrastructure */}
        <div className="legend-section">
          <h5 className="section-subtitle">Infrastructure</h5>
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
            <span className="legend-label">Terrestrial Links</span>
          </button>
        </div>
      </div>
    </footer>
  );
};

export default LegendFooter;