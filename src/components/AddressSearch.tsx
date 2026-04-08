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

// Optional leading/trailing brackets or parens; then lat, lng; optional zoom
const COORDINATE_REGEX = /^\s*[\(\[]?\s*(-?\d+(?:\.\d+)?)\s*[,;\s]+\s*(-?\d+(?:\.\d+)?)(?:\s*[,;\s]+\s*(\d+(?:\.\d+)?))?\s*[\)\]]?\s*$/;

function parseCoordinateInput(query: string): { lat: number; lng: number; zoom: number } | null {
  const trimmed = query.trim();
  const match = trimmed.match(COORDINATE_REGEX);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  const zoomRaw = match[3] != null ? parseFloat(match[3]) : 14;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const zoom = Math.max(2, Math.min(18, Math.round(zoomRaw)));
  return { lat, lng, zoom };
}

const AddressSearch: React.FC<AddressSearchProps> = ({ onLocationSelect, mapboxToken }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [coordinateSuggestion, setCoordinateSuggestion] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
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

  // Debounced geocoding search (skip when input looks like coordinates)
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      setResults([]);
      setCoordinateSuggestion(null);
      setIsOpen(false);
      return;
    }

    const coords = parseCoordinateInput(searchQuery);
    if (coords) {
      setCoordinateSuggestion(coords);
      setResults([]);
      setIsOpen(true);
      return;
    }

    setCoordinateSuggestion(null);
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
      
      // Rough calculation for zoom level (minimum 8 so fiber loads for any city/state)
      if (maxDiff > 10) zoom = 8;
      else if (maxDiff > 5) zoom = 8;
      else if (maxDiff > 1) zoom = 8;
      else if (maxDiff > 0.5) zoom = 10;
      else if (maxDiff > 0.1) zoom = 12;
      else zoom = 14;
    }
    zoom = Math.max(8, zoom);

    onLocationSelect([lng, lat], zoom, result.place_name);
    setSearchQuery(result.place_name);
    setIsOpen(false);
  };

  const handleCoordinateSelect = (coords: { lat: number; lng: number; zoom: number }) => {
    const label = `Coordinates: ${coords.lat}, ${coords.lng}`;
    onLocationSelect([coords.lng, coords.lat], coords.zoom, label);
    setSearchQuery(label);
    setCoordinateSuggestion(null);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const coords = coordinateSuggestion ?? parseCoordinateInput(searchQuery);
    if (coords) {
      e.preventDefault();
      handleCoordinateSelect(coords);
    }
  };

  const handleClear = () => {
    setSearchQuery('');
    setResults([]);
    setCoordinateSuggestion(null);
    setIsOpen(false);
  };

  return (
    <div className="address-search-container" ref={searchRef}>
      <div className="address-search-input-wrapper">
        <Search className="address-search-icon" size={18} />
        <input
          type="text"
          placeholder="Address or coordinates"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0 || coordinateSuggestion) setIsOpen(true);
          }}
          className="address-search-input"
          aria-label="Search address or coordinates"
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
      <p className="address-search-hint" aria-hidden="true">
        Coordinates: enter as <strong>lat, long</strong> (e.g. 40.71, -74.01). Brackets optional.
      </p>
      {isLoading && (
        <div className="address-search-loading">Searching...</div>
      )}

      {isOpen && (results.length > 0 || coordinateSuggestion) && (
        <div className="address-search-results">
          {coordinateSuggestion && (
            <button
              type="button"
              onClick={() => handleCoordinateSelect(coordinateSuggestion)}
              className="address-search-result-item"
            >
              <MapPin size={16} />
              <span>Go to coordinates ({coordinateSuggestion.lat}, {coordinateSuggestion.lng})</span>
            </button>
          )}
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

      {isOpen && searchQuery && !isLoading && results.length === 0 && !coordinateSuggestion && (
        <div className="address-search-no-results">
          No results found for "{searchQuery}"
        </div>
      )}
    </div>
  );
};

export default AddressSearch;
