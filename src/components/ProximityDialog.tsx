import React from 'react';
import { X, Download } from 'lucide-react';
import type { PowerPlant } from '../models/PowerPlant';

interface ProximityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  proximityDistance: number;
  onDistanceChange: (distance: number) => void;
  nearbyPlants: PowerPlant[];
  maxDistance?: number;
  isCalculating?: boolean;
}

const ProximityDialog: React.FC<ProximityDialogProps> = ({
  isOpen,
  onClose,
  proximityDistance,
  onDistanceChange,
  nearbyPlants,
  maxDistance = 80,
  isCalculating = false
}) => {
  if (!isOpen) return null;

  const handleDownload = () => {
    const content = nearbyPlants.map((plant, index) =>
      `=== Plant ${index + 1} ===
Name: ${plant.name}
Output: ${plant.outputDisplay}
Capacity Factor: ${plant.capacityFactor ? `${plant.capacityFactor.toFixed(1)}%` : 'N/A'}
Source: ${plant.source}
Country: ${plant.country}
Coordinates: ${plant.coordinates[1].toFixed(4)}, ${plant.coordinates[0].toFixed(4)}
Owner: ${plant.rawData?.['Owner Name (Company)'] || 'N/A'}
Operator: ${plant.rawData?.['Operator Name'] || 'N/A'}
City: ${plant.rawData?.['City (Site Name)'] || 'N/A'}
State/Province: ${plant.rawData?.['State / Province / Territory'] || 'N/A'}

`).join('\n');

    const header = `Power Plants within ${proximityDistance} miles of Infrastructure
Generated: ${new Date().toLocaleString()}
Total Plants: ${nearbyPlants.length}

`;

    const fullContent = header + content;

    const blob = new Blob([fullContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nearby-powerplants-${proximityDistance}miles.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="proximity-dialog-overlay" onClick={onClose}>
      <div className="proximity-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="proximity-dialog-header">
          <h2>
            Plants within {proximityDistance} miles
          </h2>
          <button className="close-button" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>

        <div className="proximity-dialog-controls">
          <div className="slider-container">
            <label htmlFor="dialog-proximity-distance">
              Distance: {proximityDistance} miles ({isCalculating ? '...' : nearbyPlants.length} plants)
            </label>
            <input
              id="dialog-proximity-distance"
              type="range"
              min="0"
              max={maxDistance}
              step="1"
              value={proximityDistance}
              onChange={(e) => onDistanceChange(Number(e.target.value))}
              className="proximity-dialog-slider"
            />
            <div className="slider-labels">
              <span>0 miles</span>
              <span>{maxDistance} miles</span>
            </div>
          </div>
        </div>

        <div className="proximity-dialog-content">
          {nearbyPlants.length === 0 ? (
            <div className="no-plants-message">
              <p>No power plants found within {proximityDistance} miles of infrastructure.</p>
              <p>Try increasing the distance or check if infrastructure layers are enabled.</p>
            </div>
          ) : (
            <div className="plants-list">
              {nearbyPlants.map((plant, index) => (
                <div key={`${plant.coordinates.join('-')}-${index}`} className="plant-item">
                  <div className="plant-header">
                    <h3>{plant.name}</h3>
                    <span className="plant-output">{plant.outputDisplay}</span>
                  </div>
                  <div className="plant-details">
                    <span className="plant-source">{plant.source}</span>
                    <span className="plant-country">{plant.country}</span>
                    <span className="plant-coords">
                      {plant.coordinates[1].toFixed(4)}, {plant.coordinates[0].toFixed(4)}
                    </span>
                  </div>
                  {plant.rawData?.['Owner Name (Company)'] && (
                    <div className="plant-owner">
                      Owner: {plant.rawData['Owner Name (Company)']}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="proximity-dialog-footer">
          <button
            className="download-button"
            onClick={handleDownload}
            disabled={nearbyPlants.length === 0}
          >
            <Download size={16} />
            Download List ({nearbyPlants.length} plants)
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProximityDialog;