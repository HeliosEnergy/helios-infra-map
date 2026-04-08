import React, { useMemo, useState, useEffect } from 'react';
import { MapPin, Zap, Activity, ChevronLeft, ChevronRight, X, Eye, EyeOff } from 'lucide-react';
import type { PowerPlant } from '../models/PowerPlant';
import { calculateDistance } from '../utils/geoUtils';
import RadiusSlider from './RadiusSlider';
import './LocationStatsPanel.css';

interface LocationStatsPanelProps {
  coordinates: [number, number];
  addressName: string;
  powerPlants: PowerPlant[];
  radius: number; // in miles
  onRadiusChange: (radius: number) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  showRadiusCircle?: boolean;
  onToggleRadiusCircle?: () => void;
}

const LocationStatsPanel: React.FC<LocationStatsPanelProps> = ({
  coordinates,
  addressName,
  powerPlants,
  radius,
  onRadiusChange,
  isCollapsed = false,
  onToggleCollapse,
  onClose,
  showRadiusCircle = false,
  onToggleRadiusCircle,
}) => {
  const [customRadiusInput, setCustomRadiusInput] = useState<string>(radius.toString());
  
  // Sync custom input with radius prop
  useEffect(() => {
    setCustomRadiusInput(radius.toString());
  }, [radius]);

  const handleCustomRadiusSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(customRadiusInput);
    if (!isNaN(value) && value >= 0.1 && value <= 500) {
      onRadiusChange(value);
    } else {
      // Reset to current radius if invalid
      setCustomRadiusInput(radius.toString());
    }
  };

  const handleCustomRadiusChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomRadiusInput(e.target.value);
  };
  // Calculate power plants within the specified radius
  const nearbyPlants = useMemo(() => {
    return powerPlants.filter(plant => {
      const distance = calculateDistance(coordinates, plant.coordinates);
      return distance <= radius;
    });
  }, [coordinates, powerPlants, radius]);

  // Calculate statistics
  const stats = useMemo(() => {
    const totalCapacity = nearbyPlants.reduce((sum, plant) => sum + plant.output, 0);
    const avgCapacity = nearbyPlants.length > 0 ? totalCapacity / nearbyPlants.length : 0;
    
    // Count by source
    const sourceCounts: Record<string, number> = {};
    nearbyPlants.forEach(plant => {
      sourceCounts[plant.source] = (sourceCounts[plant.source] || 0) + 1;
    });

    // Total capacity by source
    const sourceCapacity: Record<string, number> = {};
    nearbyPlants.forEach(plant => {
      sourceCapacity[plant.source] = (sourceCapacity[plant.source] || 0) + plant.output;
    });

    return {
      count: nearbyPlants.length,
      totalCapacity,
      avgCapacity,
      sourceCounts,
      sourceCapacity,
    };
  }, [nearbyPlants]);

  const radiusOptions = [1, 5, 10, 25, 50];

  return (
    <>
      {/* Collapsed button to reopen panel */}
      {isCollapsed && onToggleCollapse && (
        <button
          type="button"
          className="location-stats-collapsed-button"
          onClick={onToggleCollapse}
          aria-label="Open stats panel"
        >
          <ChevronLeft size={20} />
        </button>
      )}

      <div className={`location-stats-panel ${isCollapsed ? 'collapsed' : ''}`}>
        <div className="location-stats-header-buttons">
          {onClose && (
            <button
              type="button"
              className="location-stats-close-button"
              onClick={onClose}
              aria-label="Close stats panel"
            >
              <X size={16} />
            </button>
          )}
          {onToggleCollapse && (
            <button
              type="button"
              className="location-stats-collapse-button"
              onClick={onToggleCollapse}
              aria-label="Collapse stats panel"
            >
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      <div className="location-stats-header">
        <MapPin size={18} />
        <div className="location-stats-title">
          <h3>{addressName}</h3>
          <p className="location-coords">
            {coordinates[1].toFixed(4)}, {coordinates[0].toFixed(4)}
          </p>
        </div>
      </div>

      <div className="location-stats-radius-selector">
        <div className="radius-selector-header">
          <label>Search Radius:</label>
          {onToggleRadiusCircle && (
            <button
              type="button"
              className="toggle-circle-button"
              onClick={onToggleRadiusCircle}
              aria-label={showRadiusCircle ? "Hide radius circle" : "Show radius circle"}
              title={showRadiusCircle ? "Hide radius circle on map" : "Show radius circle on map"}
            >
              {showRadiusCircle ? <EyeOff size={16} /> : <Eye size={16} />}
              <span>{showRadiusCircle ? 'Hide Circle' : 'Show Circle'}</span>
            </button>
          )}
        </div>
        
        {/* Slider for radius */}
        <div className="radius-slider-container">
          <RadiusSlider
            min={0.1}
            max={200}
            value={radius}
            onChange={onRadiusChange}
            step={0.1}
          />
        </div>

        {/* Quick select buttons */}
        <div className="radius-buttons">
          {radiusOptions.map(opt => (
            <button
              key={opt}
              type="button"
              className={`radius-button ${Math.abs(radius - opt) < 0.1 ? 'active' : ''}`}
              onClick={() => onRadiusChange(opt)}
            >
              {opt} mi
            </button>
          ))}
        </div>

        {/* Custom radius input */}
        <form onSubmit={handleCustomRadiusSubmit} className="custom-radius-input-form">
          <label htmlFor="custom-radius">Custom Radius:</label>
          <div className="custom-radius-input-wrapper">
            <input
              id="custom-radius"
              type="number"
              min="0.1"
              max="500"
              step="0.1"
              value={customRadiusInput}
              onChange={handleCustomRadiusChange}
              className="custom-radius-input"
              placeholder="Enter radius"
            />
            <span className="custom-radius-unit">mi</span>
            <button type="submit" className="custom-radius-submit">Apply</button>
          </div>
        </form>
      </div>

      <div className="location-stats-content">
        <div className="stat-card primary">
          <div className="stat-icon">
            <Zap size={20} />
          </div>
          <div className="stat-info">
            <div className="stat-value">{stats.count}</div>
            <div className="stat-label">Power Plants</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Activity size={20} />
          </div>
          <div className="stat-info">
            <div className="stat-value">{stats.totalCapacity.toLocaleString()}</div>
            <div className="stat-label">Total Capacity (MW)</div>
          </div>
        </div>

        {stats.count > 0 && (
          <div className="stat-card">
            <div className="stat-info">
              <div className="stat-value">{stats.avgCapacity.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
              <div className="stat-label">Avg Capacity (MW)</div>
            </div>
          </div>
        )}
      </div>

      {stats.count > 0 && Object.keys(stats.sourceCounts).length > 0 && (
        <div className="location-stats-sources">
          <h4>By Energy Source</h4>
          <div className="source-list">
            {Object.entries(stats.sourceCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([source, count]) => (
                <div key={source} className="source-item">
                  <span className="source-name">{source}</span>
                  <span className="source-count">{count} plants</span>
                  <span className="source-capacity">
                    {stats.sourceCapacity[source].toLocaleString()} MW
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {stats.count === 0 && (
        <div className="location-stats-empty">
          <p>No power plants found within {radius} mile{radius !== 1 ? 's' : ''} of this location.</p>
        </div>
      )}
      </div>
    </>
  );
};

export default LocationStatsPanel;
