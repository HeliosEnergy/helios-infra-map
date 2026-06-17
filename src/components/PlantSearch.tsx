import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Star } from 'lucide-react';
import type { PowerPlant } from '../models/PowerPlant';
import type { BookmarkedPlantRef } from '../utils/bookmarkedPlants';
import { levenshtein, normalizeString } from '../utils/stringUtils';
import './PlantSearch.css';

interface PlantSearchProps {
  powerPlants: PowerPlant[];
  selectedPlantIds: Set<string>;
  onPlantSelect: (plantId: string) => void;
  onPlantDeselect: (plantId: string) => void;
  onClearSelection: () => void;
  bookmarkedPlantIds: Set<string>;
  bookmarkedPlants: BookmarkedPlantRef[];
  onToggleBookmark: (plant: PowerPlant | BookmarkedPlantRef) => void;
  onFlyToBookmark: (bookmark: BookmarkedPlantRef) => void;
  onClearBookmarks: () => void;
}

const PlantSearch: React.FC<PlantSearchProps> = ({
  powerPlants,
  selectedPlantIds,
  onPlantSelect,
  onPlantDeselect,
  onClearSelection,
  bookmarkedPlantIds,
  bookmarkedPlants,
  onToggleBookmark,
  onFlyToBookmark,
  onClearBookmarks,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [savedExpanded, setSavedExpanded] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sortedBookmarks = useMemo(
    () => [...bookmarkedPlants].sort((a, b) => a.name.localeCompare(b.name)),
    [bookmarkedPlants]
  );

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const normalizedQuery = normalizeString(searchQuery);
    const results = powerPlants
      .filter(plant => {
        const normalizedPlantName = normalizeString(plant.name);
        if (normalizedPlantName.includes(normalizedQuery)) return true;
        const distance = levenshtein(normalizedQuery, normalizedPlantName);
        return distance <= Math.min(3, Math.floor(normalizedQuery.length / 2));
      })
      .sort((a, b) => {
        const aNormalized = normalizeString(a.name);
        const bNormalized = normalizeString(b.name);
        const aExact = aNormalized.includes(normalizedQuery) ? 0 : 1;
        const bExact = bNormalized.includes(normalizedQuery) ? 0 : 1;

        if (aExact !== bExact) return aExact - bExact;

        const aDistance = levenshtein(normalizedQuery, aNormalized);
        const bDistance = levenshtein(normalizedQuery, bNormalized);
        return aDistance - bDistance;
      })
      .slice(0, 10);

    return results;
  }, [searchQuery, powerPlants]);

  const visibleSearchResults = useMemo(() => {
    if (!showSavedOnly) return searchResults;
    return searchResults.filter((plant) => bookmarkedPlantIds.has(plant.id));
  }, [searchResults, showSavedOnly, bookmarkedPlantIds]);

  const selectedPlants = useMemo(() => {
    return powerPlants.filter(plant => selectedPlantIds.has(plant.id));
  }, [powerPlants, selectedPlantIds]);

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
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleBookmarkClick = (
    event: React.MouseEvent,
    plant: PowerPlant | BookmarkedPlantRef
  ) => {
    event.stopPropagation();
    onToggleBookmark(plant);
  };

  return (
    <div className="plant-search-container" ref={searchRef}>
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

      <div className="saved-plants-section">
        <button
          type="button"
          className="saved-plants-toggle"
          onClick={() => setSavedExpanded((prev) => !prev)}
          aria-expanded={savedExpanded}
        >
          <span className="saved-plants-title">
            Saved plants ({sortedBookmarks.length})
          </span>
          <span className="saved-plants-chevron" aria-hidden="true">
            {savedExpanded ? '▾' : '▸'}
          </span>
        </button>

        {savedExpanded && (
          <>
            {sortedBookmarks.length > 0 && (
              <div className="saved-plants-actions">
                <button
                  type="button"
                  className="clear-selection-btn"
                  onClick={onClearBookmarks}
                  aria-label="Clear all saved plants"
                >
                  Clear saved
                </button>
              </div>
            )}

            {sortedBookmarks.length === 0 ? (
              <p className="saved-plants-empty">Click the star on a plant to save it here.</p>
            ) : (
              <ul className="saved-plants-list" aria-label="Saved power plants">
                {sortedBookmarks.map((bookmark) => {
                  const isBookmarked = bookmarkedPlantIds.has(bookmark.id);
                  return (
                    <li key={bookmark.id} className="saved-plant-item">
                      <button
                        type="button"
                        className="saved-plant-name"
                        onClick={() => onFlyToBookmark(bookmark)}
                        title={`Go to ${bookmark.name}`}
                      >
                        <span>{bookmark.name}</span>
                        {bookmark.outputDisplay && (
                          <span className="saved-plant-meta">{bookmark.outputDisplay}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        className={`saved-plant-star${isBookmarked ? ' saved-plant-star--active' : ''}`}
                        onClick={(event) => handleBookmarkClick(event, bookmark)}
                        aria-label={`Remove ${bookmark.name} from saved plants`}
                        title="Remove bookmark"
                      >
                        <Star size={14} fill={isBookmarked ? 'currentColor' : 'none'} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

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

      <label className="saved-only-toggle">
        <input
          type="checkbox"
          checked={showSavedOnly}
          onChange={(event) => setShowSavedOnly(event.target.checked)}
        />
        Show saved only in search
      </label>

      {isOpen && visibleSearchResults.length > 0 && (
        <ul
          className="plant-search-dropdown"
          role="listbox"
          aria-label="Power plant search results"
        >
          {visibleSearchResults.map(plant => {
            const isSelected = selectedPlantIds.has(plant.id);
            const isBookmarked = bookmarkedPlantIds.has(plant.id);
            return (
              <li
                key={plant.id}
                className={`plant-result-item ${isSelected ? 'selected' : ''}`}
                onClick={() => handlePlantToggle(plant.id)}
                role="option"
                aria-selected={isSelected}
              >
                <div className="plant-result-main">
                  <span className="plant-name" title={plant.name}>{plant.name}</span>
                  {plant.source && (
                    <span className="plant-source">({plant.source})</span>
                  )}
                  {plant.outputDisplay && (
                    <span className="plant-output">{plant.outputDisplay}</span>
                  )}
                </div>
                <button
                  type="button"
                  className={`plant-result-star${isBookmarked ? ' plant-result-star--active' : ''}`}
                  onClick={(event) => handleBookmarkClick(event, plant)}
                  aria-label={isBookmarked ? `Remove ${plant.name} from saved plants` : `Save ${plant.name}`}
                  title={isBookmarked ? 'Remove bookmark' : 'Save plant'}
                >
                  <Star size={14} fill={isBookmarked ? 'currentColor' : 'none'} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {isOpen && searchQuery && visibleSearchResults.length === 0 && (
        <div className="plant-search-no-results">
          {showSavedOnly
            ? `No saved plants found matching "${searchQuery}"`
            : `No plants found matching "${searchQuery}"`}
        </div>
      )}
    </div>
  );
};

export default PlantSearch;
