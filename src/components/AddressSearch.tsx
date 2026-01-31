import React, { useState, useRef, useEffect } from 'react';
import { Search, X, MapPin } from 'lucide-react';
import './AddressSearch.css';

interface AddressSearchProps {
  onLocationSelect: (coordinates: [number, number], zoom: number, addressName: string) => void;
  mapboxToken: string;
}

interface GeocodingResult {
  place_name: string;
  center: [number, number];
  bbox?: [number, number, number, number];
}

const AddressSearch: React.FC<AddressSearchProps> = ({ onLocationSelect, mapboxToken }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced geocoding search
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceTimeoutRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${mapboxToken}&limit=5`
        );

        if (!response.ok) {
          throw new Error('Geocoding request failed');
        }

        const data = await response.json();
        setResults(data.features || []);
        setIsOpen(true);
      } catch (error) {
        console.error('Error geocoding address:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [searchQuery, mapboxToken]);

  const handleSelect = (result: GeocodingResult) => {
    const [lng, lat] = result.center;
    
    // Calculate zoom level based on bounding box if available
    let zoom = 14; // Default zoom
    if (result.bbox) {
      const [minLng, minLat, maxLng, maxLat] = result.bbox;
      const latDiff = maxLat - minLat;
      const lngDiff = maxLng - minLng;
      const maxDiff = Math.max(latDiff, lngDiff);
      
      // Rough calculation for zoom level
      if (maxDiff > 10) zoom = 4;
      else if (maxDiff > 5) zoom = 6;
      else if (maxDiff > 1) zoom = 8;
      else if (maxDiff > 0.5) zoom = 10;
      else if (maxDiff > 0.1) zoom = 12;
      else zoom = 14;
    }

    onLocationSelect([lng, lat], zoom, result.place_name);
    setSearchQuery(result.place_name);
    setIsOpen(false);
  };

  const handleClear = () => {
    setSearchQuery('');
    setResults([]);
    setIsOpen(false);
  };

  return (
    <div className="address-search-container" ref={searchRef}>
      <div className="address-search-input-wrapper">
        <Search className="address-search-icon" size={18} />
        <input
          type="text"
          placeholder="Search for an address..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          className="address-search-input"
          aria-label="Search address"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={handleClear}
            className="address-search-clear"
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {isLoading && (
        <div className="address-search-loading">Searching...</div>
      )}

      {isOpen && results.length > 0 && (
        <div className="address-search-results">
          {results.map((result, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelect(result)}
              className="address-search-result-item"
            >
              <MapPin size={16} />
              <span>{result.place_name}</span>
            </button>
          ))}
        </div>
      )}

      {isOpen && searchQuery && !isLoading && results.length === 0 && (
        <div className="address-search-no-results">
          No results found for "{searchQuery}"
        </div>
      )}
    </div>
  );
};

export default AddressSearch;
