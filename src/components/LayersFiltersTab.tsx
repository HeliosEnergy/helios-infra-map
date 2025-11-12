import React, { useState, useEffect } from 'react';
import type { PowerRange } from '../utils/powerRangeCalculator';
import DualRangeSlider from './DualRangeSlider';
import StatusChip from './StatusChip';
import StatusDropdown from './StatusDropdown';
import './LayersFiltersTab.css';
import './StatusComponents.css';
import './StatusComponents.css';

// Function to get country flag emoji
function getCountryFlag(countryCode: string): string {
  const flagMap: Record<string, string> = {
    'CA': '🇨🇦',
    'US': '🇺🇸',
    'KZ': '🇰🇿',
    'AE': '🇦🇪',
    'IN': '🇮🇳',
    'KG': '🇰🇬',
    'CHN': '🇨🇳',
    'GBR': '🇬🇧',
    'BRA': '🇧🇷',
    'FRA': '🇫🇷',
    'DEU': '🇩🇪',
    'ESP': '🇪🇸',
    'RUS': '🇷🇺',
    'JPN': '🇯🇵',
    'AUS': '🇦🇺',
    'PRT': '🇵🇹',
    'CZE': '🇨🇿',
    'ITA': '🇮🇹',
    'CHL': '🇨🇱',
    'NOR': '🇳🇴',
    'MEX': '🇲🇽',
    'VNM': '🇻🇳',
    'ARG': '🇦🇷',
    'THA': '🇹🇭',
    'POL': '🇵🇱',
    'FIN': '🇫🇮',
    'IDN': '🇮🇩',
    'SWE': '🇸🇪',
    'CHE': '🇨🇭',
    'TUR': '🇹🇷',
    'KOR': '🇰🇷',
    'PHL': '🇵🇭',
    'IRN': '🇮🇷',
    'ZAF': '🇿🇦',
    'AUT': '🇦🇹',
    'SAU': '🇸🇦',
    'GRC': '🇬🇷',
    'GTM': '🇬🇹',
    'URY': '🇺🇾',
    'NLD': '🇳🇱',
    'BEL': '🇧🇪',
    'ROU': '🇷🇴',
    'UKR': '🇺🇦',
    'PAK': '🇵🇰',
    'EGY': '🇪🇬',
    'ISR': '🇮🇱',
    'IRL': '🇮🇪',
    'DZA': '🇩🇿',
    'BGD': '🇧🇩',
    'MYS': '🇲🇾',
    'LKA': '🇱🇰',
    'DNK': '🇩🇰',
    'MAR': '🇲🇦',
    'VEN': '🇻🇪',
    'NZL': '🇳🇿',
    'BGR': '🇧🇬',
    'HND': '🇭🇳',
    'TWN': '🇹🇼',
    'MMR': '🇲🇲',
    'JOR': '🇯🇴',
    'PER': '🇵🇪',
    'PRK': '🇰🇵',
    'SVK': '🇸🇰',
    'IRQ': '🇮🇶',
    'TUN': '🇹🇳',
    'CRI': '🇨🇷',
    'BOL': '🇧🇴',
    'COL': '🇨🇴',
    'HRV': '🇭🇷',
    'BLR': '🇧🇾',
    'MUS': '🇲🇺',
    'KEN': '🇰🇪',
    'ECU': '🇪🇨',
    'LAO': '🇱🇦',
    'ISL': '🇮🇸',
    'BIH': '🇧🇦',
    'SDN': '🇸🇩',
    'GEO': '🇬🇪',
    'SYR': '🇸🇾',
    'HUN': '🇭🇺',
    'PAN': '🇵🇦',
    'EST': '🇪🇪',
    'UZB': '🇺🇿',
    'SLV': '🇸🇻',
    'NIC': '🇳🇮',
    'KHM': '🇰🇭',
    'ZMB': '🇿🇲',
    'PNG': '🇵🇬',
    'DOM': '🇩🇴',
    'COD': '🇨🇩',
    'SGP': '🇸🇬',
    'NPL': '🇳🇵',
    'CUB': '🇨🇺',
    'AZE': '🇦🇿',
    'AGO': '🇦🇴',
    'NGA': '🇳🇬',
    'NAM': '🇳🇦',
    'ETH': '🇪🇹',
    'SRB': '🇷🇸',
    'QAT': '🇶🇦',
    'OMN': '🇴🇲',
    'MKD': '🇲🇰',
    'MDG': '🇲🇬',
    'LBY': '🇱🇾',
    'FJI': '🇫🇯',
    'UGA': '🇺🇬',
    'TZA': '🇹🇿',
    'RWA': '🇷🇼',
    'TJK': '🇹🇯',
    'SEN': '🇸🇳',
    'JAM': '🇯🇲',
    'KWT': '🇰🇼',
    'GIN': '🇬🇳',
    'AFG': '🇦🇫',
    'SVN': '🇸🇮',
    'MNG': '🇲🇳',
    'COG': '🇨🇬',
    'CMR': '🇨🇲',
    'CIV': '🇨🇮',
    'BHR': '🇧🇭',
    'ARM': '🇦🇲',
    'ALB': '🇦🇱',
    'YEM': '🇾🇪',
    'TKM': '🇹🇲',
    'NER': '🇳🇪',
    'MRT': '🇲🇷',
    'LBN': '🇱🇧',
    'BFA': '🇧🇫',
    'TTO': '🇹🇹',
    'SWZ': '🇸🇿',
    'MDA': '🇲🇩',
    'LTU': '🇱🇹',
    'GUF': '🇬🇫',
    'GHA': '🇬🇭',
    'GAB': '🇬🇦',
    'MWI': '🇲🇼',
    'LVA': '🇱🇻',
    'GUY': '🇬🇾',
    'BTN': '🇧🇹',
    'MLI': '🇲🇱',
    'CPV': '🇨🇻',
    'BRN': '🇧🇳',
    'BDI': '🇧🇮',
    'TGO': '🇹🇬',
    'SLE': '🇸🇱',
    'PRY': '🇵🇾',
    'MOZ': '🇲🇿',
    'MNE': '🇲🇪',
    'GNQ': '🇬🇶',
    'CYP': '🇨🇾',
    'ZWE': '🇿🇼',
    'LUX': '🇱🇺',
    'LBR': '🇱🇷',
    'KOS': '🇽🇰',
    'GMB': '🇬🇲',
    'ERI': '🇪🇷',
    'CAF': '🇨🇫',
    'BWA': '🇧🇼',
    'BEN': '🇧🇯',
    'ATA': '🇦🇶',
    'SUR': '🇸🇷',
    'PSE': '🇵🇸',
    'LSO': '🇱🇸',
    'LCA': '🇱🇨',
    'GNB': '🇬🇼',
    'ESH': '🇪🇭',
    'DJI': '🇩🇯'
  };
  
  return flagMap[countryCode] || '🏳️';
}

interface LayersFiltersTabProps {
  // Layer visibility
  showPowerPlants: boolean;
  showWfsCables: boolean;
  showHifldLines: boolean;
  onTogglePowerPlants: () => void;
  onToggleWfsCables: () => void;
  onToggleHifldLines: () => void;

  // Country filtering
  showCanadianPlants: boolean;
  showAmericanPlants: boolean;
  showKazakhstanPlants: boolean;
  showUaePlants: boolean;
  showIndiaPlants: boolean;
  showKyrgyzstanPlants: boolean;
  onToggleCanadianPlants: () => void;
  onToggleAmericanPlants: () => void;
  onToggleKazakhstanPlants: () => void;
  onToggleUaePlants: () => void;
  onToggleIndiaPlants: () => void;
  onToggleKyrgyzstanPlants: () => void;
  
  // Dynamic country filtering
  allCountries: Array<{code: string, name: string, count: number, usedCapacity?: number}>;
  enabledCountries: Set<string>;
  onToggleCountryFilter: (countryCode: string) => void;

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
  showHifldLines,
  onTogglePowerPlants,
  onToggleWfsCables,
  onToggleHifldLines,
  showCanadianPlants: _showCanadianPlants,
  showAmericanPlants: _showAmericanPlants,
  showKazakhstanPlants: _showKazakhstanPlants,
  showUaePlants: _showUaePlants,
  showIndiaPlants: _showIndiaPlants,
  showKyrgyzstanPlants: _showKyrgyzstanPlants,
  onToggleCanadianPlants: _onToggleCanadianPlants,
  onToggleAmericanPlants: _onToggleAmericanPlants,
  onToggleKazakhstanPlants: _onToggleKazakhstanPlants,
  onToggleUaePlants: _onToggleUaePlants,
  onToggleIndiaPlants: _onToggleIndiaPlants,
  onToggleKyrgyzstanPlants: _onToggleKyrgyzstanPlants,
  allCountries,
  enabledCountries,
  onToggleCountryFilter,
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
  const [selectedPresets, setSelectedPresets] = useState<Set<PowerRangePreset>>(new Set());
  const [showCustomRangeInputs, setShowCustomRangeInputs] = useState(false);
  const [minInputValue, setMinInputValue] = useState<string>(minPowerOutput.toString());
  const [maxInputValue, setMaxInputValue] = useState<string>(maxPowerOutput.toString());
  
  // State for capacity factor input values
  const [minCapacityFactorInput, setMinCapacityFactorInput] = useState<string>(minCapacityFactor.toString());
  const [maxCapacityFactorInput, setMaxCapacityFactorInput] = useState<string>(maxCapacityFactor.toString());
  
  // State for country dropdown
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [countrySearchTerm, setCountrySearchTerm] = useState('');
  
  // Filter countries based on search term and sort with US/CA pinned at top
  const filteredCountries = allCountries
    .filter(country =>
      country.name.toLowerCase().includes(countrySearchTerm.toLowerCase()) ||
      country.code.toLowerCase().includes(countrySearchTerm.toLowerCase())
    )
    .sort((a, b) => {
      // Pin US and CA at the top
      if (a.code === 'US' && b.code !== 'US') return -1;
      if (b.code === 'US' && a.code !== 'US') return 1;
      if (a.code === 'CA' && b.code !== 'CA' && b.code !== 'US') return -1;
      if (b.code === 'CA' && a.code !== 'CA' && a.code !== 'US') return 1;
      
      // Sort the rest alphabetically by name
      return a.name.localeCompare(b.name);
    });

  // Power range presets - use actual calculated max instead of hardcoded 10000
  const powerRangePresets = {
    small: { min: 0, max: 100, label: 'Small (0-100 MW)' },
    medium: { min: 100, max: 1000, label: 'Medium (100-1000 MW)' },
    large: { min: 1000, max: powerRange.max, label: `Large (1000+ MW)` },
  };

  const handlePowerRangePreset = (preset: PowerRangePreset) => {
    if (preset === 'custom') {
      // Toggle custom range inputs
      setShowCustomRangeInputs(!showCustomRangeInputs);
      // Clear other presets when custom is activated
      if (!showCustomRangeInputs) {
        setSelectedPresets(new Set());
      }
      return;
    }
    
    // Toggle the preset
    setSelectedPresets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(preset)) {
        // Deselect the preset
        newSet.delete(preset);
      } else {
        // Select the preset
        newSet.add(preset);
      }
      return newSet;
    });
    
    // Hide custom inputs when a preset is toggled
    setShowCustomRangeInputs(false);
  };

  // Calculate combined range from selected presets
  useEffect(() => {
    // Don't auto-update if custom inputs are shown (user is manually adjusting)
    if (showCustomRangeInputs) {
      return;
    }

    if (selectedPresets.size === 0) {
      // If no presets selected, show all plants (full range)
      onMinPowerOutputChange(powerRange.min);
      onMaxPowerOutputChange(powerRange.max);
      return;
    }

    // Calculate the combined range from all selected presets
    const ranges = Array.from(selectedPresets)
      .filter(p => p !== 'custom')
      .map(p => powerRangePresets[p as keyof typeof powerRangePresets]);
    
    if (ranges.length === 0) return;

    // Find the overall min and max across all selected presets
    const combinedMin = Math.min(...ranges.map(r => r.min));
    const combinedMax = Math.max(...ranges.map(r => r.max));
    
    onMinPowerOutputChange(combinedMin);
    onMaxPowerOutputChange(combinedMax);
  }, [selectedPresets, powerRange.min, powerRange.max, showCustomRangeInputs, onMinPowerOutputChange, onMaxPowerOutputChange]);
  
  // Sync input values when power output changes externally
  useEffect(() => {
    setMinInputValue(minPowerOutput.toString());
  }, [minPowerOutput]);

  useEffect(() => {
    setMaxInputValue(maxPowerOutput.toString());
  }, [maxPowerOutput]);


  // Sync capacity factor input values when capacity factor changes externally
  useEffect(() => {
    setMinCapacityFactorInput(minCapacityFactor.toString());
  }, [minCapacityFactor]);

  useEffect(() => {
    setMaxCapacityFactorInput(maxCapacityFactor.toString());
  }, [maxCapacityFactor]);

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

          <label className="toggle-item">
            <input
              type="checkbox"
              checked={showHifldLines}
              onChange={onToggleHifldLines}
              className="toggle-input"
            />
            <span className="toggle-slider"></span>
            <span className="toggle-label">Detailed US Infrastructure</span>
          </label>
        </div>
      </section>

      {/* Quick Filters Section */}
      <section className="tab-section">
        <h3 className="section-title">Quick Filters</h3>

        {/* Country Filter */}
        <div className="control-group">
          <label className="control-label">Countries ({enabledCountries.size} selected)</label>
          <div className="country-dropdown">
            <button
              className="dropdown-trigger"
              onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
              aria-expanded={isCountryDropdownOpen}
              aria-label="Select countries"
            >
              <span>Select Countries</span>
              <span className="dropdown-arrow">{isCountryDropdownOpen ? '▲' : '▼'}</span>
            </button>
            
            {isCountryDropdownOpen && (
              <div className="dropdown-content">
                <div className="search-box">
                  <input
                    type="text"
                    placeholder="Search countries..."
                    value={countrySearchTerm}
                    onChange={(e) => setCountrySearchTerm(e.target.value)}
                    className="search-input"
                  />
                </div>
                <div className="country-list">
                  {filteredCountries.map(country => (
                    <label key={country.code} className="country-item">
                      <input
                        type="checkbox"
                        checked={enabledCountries.has(country.code)}
                        onChange={() => onToggleCountryFilter(country.code)}
                      />
                      <span className="country-flag">{getCountryFlag(country.code)}</span>
                      <span className="country-name">{country.name}</span>
                      <span className="country-count">({country.count})</span>
                      {country.usedCapacity && (
                        <span className="country-capacity">• {country.usedCapacity.toFixed(1)} MW used</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}
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
                className={`preset-button ${selectedPresets.has(key as PowerRangePreset) ? 'active' : ''}`}
                onClick={() => handlePowerRangePreset(key as PowerRangePreset)}
                aria-pressed={selectedPresets.has(key as PowerRangePreset)}
              >
                {preset.label}
              </button>
            ))}
            <button
              className={`preset-button ${showCustomRangeInputs ? 'active' : ''}`}
              onClick={() => handlePowerRangePreset('custom')}
              aria-pressed={showCustomRangeInputs}
            >
              Custom Range
            </button>
          </div>
          
          {/* Custom Range Inputs - shown inline when Custom Range is clicked */}
          {showCustomRangeInputs && (
            <div className="custom-range-inline">
              <div className="custom-range-inputs">
                <div className="range-input-group">
                  <label htmlFor="min-power-input-inline" className="range-input-label">Min:</label>
                  <input
                    id="min-power-input-inline"
                    type="number"
                    min={powerRange.min}
                    max={powerRange.max}
                    value={minInputValue}
                    onChange={(e) => {
                      // Allow empty or partial input while typing
                      setMinInputValue(e.target.value);
                    }}
                    onBlur={(e) => {
                      // Validate and clamp on blur
                      const numValue = Number(e.target.value);
                      if (isNaN(numValue) || e.target.value === '') {
                        // If empty or invalid, use current minPowerOutput
                        setMinInputValue(minPowerOutput.toString());
                      } else {
                        // Clamp to valid range and ensure it doesn't exceed max
                        const clampedValue = Math.max(
                          powerRange.min, 
                          Math.min(maxPowerOutput, Math.min(powerRange.max, numValue))
                        );
                        setMinInputValue(clampedValue.toString());
                        onMinPowerOutputChange(clampedValue);
                        // Clear selected presets when manually adjusting
                        setSelectedPresets(new Set());
                      }
                    }}
                    onKeyDown={(e) => {
                      // Allow Enter key to trigger blur validation
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    className="range-input"
                    step="1"
                  />
                  <span className="range-input-unit">MW</span>
                </div>
                <div className="range-input-group">
                  <label htmlFor="max-power-input-inline" className="range-input-label">Max:</label>
                  <input
                    id="max-power-input-inline"
                    type="number"
                    min={powerRange.min}
                    max={powerRange.max}
                    value={maxInputValue}
                    onChange={(e) => {
                      // Allow empty or partial input while typing
                      setMaxInputValue(e.target.value);
                    }}
                    onBlur={(e) => {
                      // Validate and clamp on blur
                      const numValue = Number(e.target.value);
                      if (isNaN(numValue) || e.target.value === '') {
                        // If empty or invalid, use current maxPowerOutput
                        setMaxInputValue(maxPowerOutput.toString());
                      } else {
                        // Clamp to valid range and ensure it's not less than min
                        const clampedValue = Math.max(
                          minPowerOutput,
                          Math.min(powerRange.max, numValue)
                        );
                        setMaxInputValue(clampedValue.toString());
                        onMaxPowerOutputChange(clampedValue);
                        // Clear selected presets when manually adjusting
                        setSelectedPresets(new Set());
                      }
                    }}
                    onKeyDown={(e) => {
                      // Allow Enter key to trigger blur validation
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    className="range-input"
                    step="1"
                  />
                  <span className="range-input-unit">MW</span>
                </div>
              </div>
              <DualRangeSlider
                min={powerRange.min}
                max={powerRange.max}
                value={[minPowerOutput, maxPowerOutput]}
                onChange={([min, max]) => {
                  onMinPowerOutputChange(min);
                  onMaxPowerOutputChange(max);
                  // Clear selected presets when manually adjusting slider
                  setSelectedPresets(new Set());
                }}
                step={10}
              />
            </div>
          )}
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
              <div className="custom-range-inputs">
                <div className="range-input-group">
                  <label htmlFor="min-power-input" className="range-input-label">Min:</label>
                  <input
                    id="min-power-input"
                    type="number"
                    min={powerRange.min}
                    max={powerRange.max}
                    value={minInputValue}
                    onChange={(e) => {
                      // Allow empty or partial input while typing
                      setMinInputValue(e.target.value);
                    }}
                    onBlur={(e) => {
                      // Validate and clamp on blur
                      const numValue = Number(e.target.value);
                      if (isNaN(numValue) || e.target.value === '') {
                        // If empty or invalid, use current minPowerOutput
                        setMinInputValue(minPowerOutput.toString());
                      } else {
                        // Clamp to valid range and ensure it doesn't exceed max
                        const clampedValue = Math.max(
                          powerRange.min, 
                          Math.min(maxPowerOutput, Math.min(powerRange.max, numValue))
                        );
                        setMinInputValue(clampedValue.toString());
                        onMinPowerOutputChange(clampedValue);
                        // Clear selected presets when manually adjusting
                        setSelectedPresets(new Set());
                      }
                    }}
                    onKeyDown={(e) => {
                      // Allow Enter key to trigger blur validation
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    className="range-input"
                    step="1"
                  />
                  <span className="range-input-unit">MW</span>
                </div>
                <div className="range-input-group">
                  <label htmlFor="max-power-input" className="range-input-label">Max:</label>
                  <input
                    id="max-power-input"
                    type="number"
                    min={powerRange.min}
                    max={powerRange.max}
                    value={maxInputValue}
                    onChange={(e) => {
                      // Allow empty or partial input while typing
                      setMaxInputValue(e.target.value);
                    }}
                    onBlur={(e) => {
                      // Validate and clamp on blur
                      const numValue = Number(e.target.value);
                      if (isNaN(numValue) || e.target.value === '') {
                        // If empty or invalid, use current maxPowerOutput
                        setMaxInputValue(maxPowerOutput.toString());
                      } else {
                        // Clamp to valid range and ensure it's not less than min
                        const clampedValue = Math.max(
                          minPowerOutput,
                          Math.min(powerRange.max, numValue)
                        );
                        setMaxInputValue(clampedValue.toString());
                        onMaxPowerOutputChange(clampedValue);
                        // Clear selected presets when manually adjusting
                        setSelectedPresets(new Set());
                      }
                    }}
                    onKeyDown={(e) => {
                      // Allow Enter key to trigger blur validation
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    className="range-input"
                    step="1"
                  />
                  <span className="range-input-unit">MW</span>
                </div>
              </div>
              <DualRangeSlider
                min={powerRange.min}
                max={powerRange.max}
                value={[minPowerOutput, maxPowerOutput]}
                onChange={([min, max]) => {
                  onMinPowerOutputChange(min);
                  onMaxPowerOutputChange(max);
                  // Clear selected presets when manually adjusting slider
                  setSelectedPresets(new Set());
                }}
                step={10}
              />
            </div>

            <div className="filter-section">
              <label className="filter-label">Capacity Factor (%)</label>
              <div className="custom-range-inputs">
                <div className="range-input-group">
                  <label htmlFor="min-capacity-factor-input" className="range-input-label">Min:</label>
                  <input
                    id="min-capacity-factor-input"
                    type="number"
                    min={0}
                    max={100}
                    value={minCapacityFactorInput}
                    onChange={(e) => {
                      // Allow empty or partial input while typing
                      setMinCapacityFactorInput(e.target.value);
                    }}
                    onBlur={(e) => {
                      // Validate and clamp on blur
                      const numValue = Number(e.target.value);
                      if (isNaN(numValue) || e.target.value === '') {
                        // If empty or invalid, use current minCapacityFactor
                        setMinCapacityFactorInput(minCapacityFactor.toString());
                      } else {
                        // Clamp to valid range and ensure it doesn't exceed max
                        const clampedValue = Math.max(
                          0, 
                          Math.min(maxCapacityFactor, Math.min(100, numValue))
                        );
                        setMinCapacityFactorInput(clampedValue.toString());
                        onMinCapacityFactorChange(clampedValue);
                      }
                    }}
                    onKeyDown={(e) => {
                      // Allow Enter key to trigger blur validation
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    className="range-input"
                    step="1"
                  />
                  <span className="range-input-unit">%</span>
                </div>
                <div className="range-input-group">
                  <label htmlFor="max-capacity-factor-input" className="range-input-label">Max:</label>
                  <input
                    id="max-capacity-factor-input"
                    type="number"
                    min={0}
                    max={100}
                    value={maxCapacityFactorInput}
                    onChange={(e) => {
                      // Allow empty or partial input while typing
                      setMaxCapacityFactorInput(e.target.value);
                    }}
                    onBlur={(e) => {
                      // Validate and clamp on blur
                      const numValue = Number(e.target.value);
                      if (isNaN(numValue) || e.target.value === '') {
                        // If empty or invalid, use current maxCapacityFactor
                        setMaxCapacityFactorInput(maxCapacityFactor.toString());
                      } else {
                        // Clamp to valid range and ensure it's not less than min
                        const clampedValue = Math.max(
                          minCapacityFactor,
                          Math.min(100, numValue)
                        );
                        setMaxCapacityFactorInput(clampedValue.toString());
                        onMaxCapacityFactorChange(clampedValue);
                      }
                    }}
                    onKeyDown={(e) => {
                      // Allow Enter key to trigger blur validation
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    className="range-input"
                    step="1"
                  />
                  <span className="range-input-unit">%</span>
                </div>
              </div>
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