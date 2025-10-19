import React, { useState } from 'react';
import type { PowerRange } from '../utils/powerRangeCalculator';
import DualRangeSlider from './DualRangeSlider';
import StatusChip from './StatusChip';
import StatusDropdown from './StatusDropdown';
import './LayersFiltersTab.css';
import './StatusComponents.css';
import './StatusComponents.css';

interface LayersFiltersTabProps {
  // Layer visibility
  showPowerPlants: boolean;
  showWfsCables: boolean;
  onTogglePowerPlants: () => void;
  onToggleWfsCables: () => void;

  // Country filtering
  showCanadianPlants: boolean;
  showAmericanPlants: boolean;
  showKazakhstanPlants: boolean;
  onToggleCanadianPlants: () => void;
  onToggleAmericanPlants: () => void;
  onToggleKazakhstanPlants: () => void;

  // Status filtering
  allStatuses: string[];
  filteredStatuses: Set<string>;
  onToggleStatusFilter: (status: string) => void;

  // Power output filtering
  minPowerOutput: number;
  maxPowerOutput: number;
  onMinPowerOutputChange: (value: number) => void;
  onMaxPowerOutputChange: (value: number) => void;

  // Power range limits
  powerRange: PowerRange;

  // Capacity factor filtering
  minCapacityFactor: number;
  maxCapacityFactor: number;
  onMinCapacityFactorChange: (value: number) => void;
  onMaxCapacityFactorChange: (value: number) => void;

   // Proximity filtering
   showOnlyNearbyPlants: boolean;
   proximityDistance: number;
   onToggleNearbyPlants: () => void;
   onProximityDistanceChange: (value: number) => void;
   proximityPlantCount: number;
   onOpenProximityDialog: () => void;
}

type PowerRangePreset = 'small' | 'medium' | 'large' | 'custom';

const LayersFiltersTab: React.FC<LayersFiltersTabProps> = ({
  showPowerPlants,
  showWfsCables,
  onTogglePowerPlants,
  onToggleWfsCables,
  showCanadianPlants,
  showAmericanPlants,
  showKazakhstanPlants,
  onToggleCanadianPlants,
  onToggleAmericanPlants,
  onToggleKazakhstanPlants,
  allStatuses,
  filteredStatuses,
  onToggleStatusFilter,
  minPowerOutput,
  maxPowerOutput,
  onMinPowerOutputChange,
  onMaxPowerOutputChange,
  powerRange,
  minCapacityFactor,
  maxCapacityFactor,
  onMinCapacityFactorChange,
  onMaxCapacityFactorChange,
  showOnlyNearbyPlants,
  proximityDistance,
  onToggleNearbyPlants,
  onProximityDistanceChange,
  proximityPlantCount,
  onOpenProximityDialog,
}) => {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [powerRangePreset, setPowerRangePreset] = useState<PowerRangePreset | null>(null);

  // Power range presets
  const powerRangePresets = {
    small: { min: 0, max: 100, label: 'Small (0-100 MW)' },
    medium: { min: 100, max: 1000, label: 'Medium (100-1000 MW)' },
    large: { min: 1000, max: 10000, label: 'Large (1000+ MW)' },
  };

  const handlePowerRangePreset = (preset: PowerRangePreset) => {
    if (preset === 'custom') {
      setPowerRangePreset('custom');
      return;
    }
    const range = powerRangePresets[preset];
    onMinPowerOutputChange(range.min);
    onMaxPowerOutputChange(range.max);
    setPowerRangePreset(preset);
  };

  // Determine active preset based on current values
  const getActivePreset = (): PowerRangePreset | null => {
    if (powerRangePreset === 'custom') return 'custom';

    for (const [key, range] of Object.entries(powerRangePresets)) {
      if (minPowerOutput === range.min && maxPowerOutput === range.max) {
        return key as PowerRangePreset;
      }
    }
    return null;
  };

  const activePreset = getActivePreset();

  const toggleStatusDropdown = () => {
    setIsStatusDropdownOpen(!isStatusDropdownOpen);
  };

  const handleSelectAllStatuses = () => {
    allStatuses.forEach(status => {
      if (!filteredStatuses.has(status)) {
        onToggleStatusFilter(status);
      }
    });
  };

  const handleClearAllStatuses = () => {
    filteredStatuses.forEach(status => {
      onToggleStatusFilter(status);
    });
  };

  return (
    <div className="layers-filters-tab">
      {/* Layer Visibility Section */}
      <section className="tab-section">
        <h3 className="section-title">Layer Visibility</h3>
        <div className="control-group">
          <label className="toggle-item">
            <input
              type="checkbox"
              checked={showPowerPlants}
              onChange={onTogglePowerPlants}
              className="toggle-input"
            />
            <span className="toggle-slider"></span>
            <span className="toggle-label">Power Plants</span>
          </label>

          <label className="toggle-item">
            <input
              type="checkbox"
              checked={showWfsCables}
              onChange={onToggleWfsCables}
              className="toggle-input"
            />
            <span className="toggle-slider"></span>
            <span className="toggle-label">Infrastructure</span>
          </label>
        </div>
      </section>

      {/* Quick Filters Section */}
      <section className="tab-section">
        <h3 className="section-title">Quick Filters</h3>

        {/* Country Filter */}
        <div className="control-group">
          <label className="control-label">Countries</label>
          <div className="country-buttons">
            <button
              className={`country-button ${showCanadianPlants ? 'active' : 'inactive'}`}
              onClick={onToggleCanadianPlants}
              aria-pressed={showCanadianPlants}
              aria-label="Toggle Canadian power plants"
            >
              🇨🇦 Canada
            </button>
            <button
              className={`country-button ${showAmericanPlants ? 'active' : 'inactive'}`}
              onClick={onToggleAmericanPlants}
              aria-pressed={showAmericanPlants}
              aria-label="Toggle American power plants"
            >
              🇺🇸 United States
            </button>
            <button
              className={`country-button ${showKazakhstanPlants ? 'active' : 'inactive'}`}
              onClick={onToggleKazakhstanPlants}
              aria-pressed={showKazakhstanPlants}
              aria-label="Toggle Kazakhstan power plants"
            >
              🇰🇿 Kazakhstan
            </button>
          </div>
        </div>

        {/* Status Filter */}
        <div className="control-group">
          <label className="control-label">Status</label>
          <div className="status-selector">
            <div className="selected-chips">
              {Array.from(filteredStatuses).map(status => (
                <StatusChip
                  key={status}
                  status={status}
                  onRemove={onToggleStatusFilter}
                />
              ))}
              <button
                className="dropdown-trigger"
                onClick={toggleStatusDropdown}
                aria-expanded={isStatusDropdownOpen}
                aria-haspopup="listbox"
              >
                {filteredStatuses.size > 0
                  ? `${filteredStatuses.size} selected`
                  : 'Select Statuses'
                }
                <span className="dropdown-arrow">{isStatusDropdownOpen ? '▲' : '▼'}</span>
              </button>
            </div>
            <StatusDropdown
              allStatuses={allStatuses}
              filteredStatuses={filteredStatuses}
              onToggleStatus={onToggleStatusFilter}
              onSelectAll={handleSelectAllStatuses}
              onClearAll={handleClearAllStatuses}
              isOpen={isStatusDropdownOpen}
            />
          </div>
        </div>

        {/* Power Range Presets */}
        <div className="control-group">
          <label className="control-label">Power Output</label>
          <div className="preset-buttons">
            {Object.entries(powerRangePresets).map(([key, preset]) => (
              <button
                key={key}
                className={`preset-button ${activePreset === key ? 'active' : ''}`}
                onClick={() => handlePowerRangePreset(key as PowerRangePreset)}
                aria-pressed={activePreset === key}
              >
                {preset.label}
              </button>
            ))}
            <button
              className={`preset-button ${activePreset === 'custom' ? 'active' : ''}`}
              onClick={() => setShowAdvancedFilters(true)}
              aria-pressed={activePreset === 'custom'}
            >
              Custom Range
            </button>
          </div>
        </div>
      </section>

      {/* Proximity Filter Section */}
      <section className="tab-section proximity-section">
        <h3 className="section-title">Proximity Filter</h3>

        <div className="control-group">
          <div className="proximity-header">
            <label className="toggle-item">
              <input
                type="checkbox"
                checked={showOnlyNearbyPlants}
                onChange={onToggleNearbyPlants}
                className="toggle-input"
              />
              <span className="toggle-slider"></span>
              <span className="toggle-label">Show only plants near infrastructure</span>
            </label>

            {showOnlyNearbyPlants && (
              <button
                className="eye-button"
                onClick={onOpenProximityDialog}
                aria-label="View detailed list of nearby plants"
                title="View detailed list of nearby plants"
              >
                list 
              </button>
            )}
          </div>

          {showOnlyNearbyPlants && (
            <div className="proximity-control">
              <div className="proximity-info">
                <label htmlFor="proximity-distance" className="control-label">
                  Distance: {proximityDistance} miles
                </label>
                <span className="plant-count">
                  {proximityPlantCount} plants found
                </span>
              </div>
              <input
                id="proximity-distance"
                type="range"
                min="0"
                max="80"
                step="1"
                value={proximityDistance}
                onChange={(e) => onProximityDistanceChange(Number(e.target.value))}
                className="proximity-slider"
              />
              <div className="slider-labels">
                <span>0 miles</span>
                <span>80 miles</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Advanced Filters Section */}
      <section className="tab-section">
        <button
          className="expand-button"
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          aria-expanded={showAdvancedFilters}
          aria-controls="advanced-filters"
        >
          <span className="expand-icon">{showAdvancedFilters ? '▼' : '▶'}</span>
          Advanced Filters
        </button>

        {showAdvancedFilters && (
          <div id="advanced-filters" className="advanced-filters">
            {/* Custom Power Range */}
            <div className="control-group">
              <label className="control-label">Custom Power Range (MW)</label>
              <DualRangeSlider
                min={powerRange.min}
                max={powerRange.max}
                value={[minPowerOutput, maxPowerOutput]}
                onChange={([min, max]) => {
                  onMinPowerOutputChange(min);
                  onMaxPowerOutputChange(max);
                }}
                step={10}
              />
            </div>

            <div className="filter-section">
              <label className="filter-label">Capacity Factor (%)</label>
              <DualRangeSlider
                min={0}
                max={100}
                value={[minCapacityFactor, maxCapacityFactor]}
                onChange={([min, max]) => {
                  onMinCapacityFactorChange(min);
                  onMaxCapacityFactorChange(max);
                }}
                step={1}
              />
            </div>


          </div>
        )}
      </section>
    </div>
  );
};

export default LayersFiltersTab;