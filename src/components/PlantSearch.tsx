import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { PowerPlant } from '../models/PowerPlant';
import { levenshtein, normalizeString } from '../utils/stringUtils';
import './PlantSearch.css';

interface PlantSearchProps {
  powerPlants: PowerPlant[];
  selectedPlantIds: Set<string>;
  onPlantSelect: (plantId: string) => void;
  onPlantDeselect: (plantId: string) => void;
  onClearSelection: () => void;
}

const PlantSearch: React.FC<PlantSearchProps> = ({
  powerPlants,
  selectedPlantIds,
  onPlantSelect,
  onPlantDeselect,
  onClearSelection
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter plants based on search query using fuzzy matching
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const normalizedQuery = normalizeString(searchQuery);
    const results = powerPlants
      .filter(plant => {
        const normalizedPlantName = normalizeString(plant.name);
        // Exact match gets highest priority
        if (normalizedPlantName.includes(normalizedQuery)) return true;
        // Fuzzy match with Levenshtein distance
        const distance = levenshtein(normalizedQuery, normalizedPlantName);
        return distance <= Math.min(3, Math.floor(normalizedQuery.length / 2));
      })
      .sort((a, b) => {
        // Sort by relevance - exact matches first, then by Levenshtein distance
        const aNormalized = normalizeString(a.name);
        const bNormalized = normalizeString(b.name);
        const aExact = aNormalized.includes(normalizedQuery) ? 0 : 1;
        const bExact = bNormalized.includes(normalizedQuery) ? 0 : 1;
        
        if (aExact !== bExact) return aExact - bExact;
        
        const aDistance = levenshtein(normalizedQuery, aNormalized);
        const bDistance = levenshtein(normalizedQuery, bNormalized);
        return aDistance - bDistance;
      })
      .slice(0, 10); // Limit to top 10 results

    return results;
  }, [searchQuery, powerPlants]);

  // Get selected plants for chip display
  const selectedPlants = useMemo(() => {
    return powerPlants.filter(plant => selectedPlantIds.has(plant.id));
  }, [powerPlants, selectedPlantIds]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handlePlantToggle = (plantId: string) => {
    if (selectedPlantIds.has(plantId)) {
      onPlantDeselect(plantId);
    } else {
      onPlantSelect(plantId);
    }
    // Keep dropdown open after selection
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setIsOpen(false);
  };

  return (
    <div className="plant-search-container" ref={searchRef}>
      {/* Selected plants chips */}
      {selectedPlants.length > 0 && (
        <div className="selected-plants-chips">
          {selectedPlants.map(plant => (
            <div key={plant.id} className="plant-chip">
              <span className="chip-label" title={plant.name}>{plant.name}</span>
              <button 
                className="chip-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlantDeselect(plant.id);
                }}
                aria-label={`Remove ${plant.name}`}
              >
                ×
              </button>
            </div>
          ))}
          {selectedPlants.length > 1 && (
            <button 
              className="clear-selection-btn"
              onClick={onClearSelection}
              aria-label="Clear all selections"
            >
              Clear All
            </button>
          )}
        </div>
      )}

      {/* Search input with dropdown */}
      <div className="plant-search-input-container">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search power plants..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onClick={() => setIsOpen(true)}
          className="plant-search-input"
          aria-label="Search power plants"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        />
        {searchQuery && (
          <button 
            className="clear-search-btn"
            onClick={handleClearSearch}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* Dropdown results */}
      {isOpen && searchResults.length > 0 && (
        <ul 
          className="plant-search-dropdown"
          role="listbox"
          aria-label="Power plant search results"
        >
          {searchResults.map(plant => {
            const isSelected = selectedPlantIds.has(plant.id);
            return (
              <li 
                key={plant.id}
                className={`plant-result-item ${isSelected ? 'selected' : ''}`}
                onClick={() => handlePlantToggle(plant.id)}
                role="option"
                aria-selected={isSelected}
              >
                <span className="plant-name" title={plant.name}>{plant.name}</span>
                {plant.source && (
                  <span className="plant-source">({plant.source})</span>
                )}
                {plant.outputDisplay && (
                  <span className="plant-output">{plant.outputDisplay}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isOpen && searchQuery && searchResults.length === 0 && (
        <div className="plant-search-no-results">
          No plants found matching "{searchQuery}"
        </div>
      )}
    </div>
  );
};

export default PlantSearch;