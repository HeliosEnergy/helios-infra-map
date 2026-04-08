import type { Cable } from '../models/Cable';
import { processWfsCableData } from './geoJsonParser';
import { CableCache, CacheManager } from './cache';
import type { GeoJsonObject } from './geoJsonParser';
import { authenticatedFetch } from './auth';

// Test data for fallback - more realistic submarine cable data
const testCables: GeoJsonObject = {
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "atlantic_cable_1",
        "name": "Transatlantic Cable System"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [-74.0060, 40.7128],  // New York
          [-70.6483, -33.4569], // Santiago
          [-0.1276, 51.5074],   // London
          [2.3522, 48.8566]     // Paris
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "pacific_cable_1",
        "name": "Transpacific Cable Network"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [-118.2437, 34.0522], // Los Angeles
          [-157.8583, 21.3069], // Honolulu
          [139.6917, 35.6895],  // Tokyo
          [151.2093, -33.8688], // Sydney
          [103.8198, 1.3521]    // Singapore
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "europe_asia_cable_1",
        "name": "Europe-Asia Connectivity Cable"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [2.3522, 48.8566],    // Paris
          [13.4050, 52.5200],   // Berlin
          [37.6173, 55.7558],   // Moscow
          [55.2792, 25.2295],   // Dubai
          [77.2090, 28.7041],   // New Delhi
          [100.5018, 13.7563],  // Bangkok
          [139.6917, 35.6895]   // Tokyo
        ]
      }
    }
  ]
};

/**
 * Fetch fresh cable data from ITU WFS service
 * @returns Promise resolving to array of Cable objects
 */
async function fetchFreshCableData(): Promise<Cable[]> {
  // Use authenticated API route in both development and production.
  const baseUrl = '/api/wfs/ows';

  const params = new URLSearchParams({
    service: 'WFS',
    version: '1.0.0',
    request: 'GetFeature',
    typeName: 'itu-geocatalogue:trx_geocatalogue',
    outputFormat: 'application/json'
  });

  const url = `${baseUrl}?${params}`;

  // Add a timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  const response = await authenticatedFetch(url, {
    signal: controller.signal
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`Failed to fetch submarine cable data: ${response.status} ${response.statusText}`);
  }

  const cableData = await response.json();
  return processWfsCableData(cableData);
}

/**
 * Load submarine cable data from ITU WFS service with caching
 * @returns Promise resolving to array of Cable objects
 */
export async function loadWfsCableData(): Promise<Cable[]> {
  // Try cache first
  const cachedData = CableCache.get();
  if (cachedData) {
    console.log('Using cached cable data');
    return cachedData;
  }

  // Fetch fresh data
  try {
    console.log('Fetching fresh cable data from API');
    const freshData = await fetchFreshCableData();

    // Attempt to cache the data
    const cacheResult = CableCache.set(freshData);
    if (!cacheResult) {
      console.warn('Failed to cache cable data - may be too large for localStorage');
    }

    return freshData;
  } catch (error) {
    console.warn('Failed to fetch submarine cable data:', error);

    // Try expired cache as fallback
    const expiredCache = CableCache.get();
    if (expiredCache) {
      console.warn('Using expired cached cable data due to API failure');
      return expiredCache;
    }

    // Ultimate fallback to local test data
    console.log('Using local test cable data');
    return processWfsCableData(testCables);
  }
}

/**
 * Clear the cached cable data
 */
export function clearCableCache(): void {
  CableCache.clear();
}

/**
 * Get cable cache statistics
 */
export function getCableCacheStats() {
  return CacheManager.getCacheStats();
}
