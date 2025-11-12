import type { TransmissionLine } from '../models/TransmissionLine';
import { HifldCache } from './cache';

interface GeoJsonFeature {
  type: string;
  id?: number | string;
  geometry: {
    type: string;
    coordinates: [number, number][] | [number, number][][];
  };
  properties: {
    [key: string]: any;
  };
}

interface GeoJsonObject {
  type: string;
  features: GeoJsonFeature[];
  properties?: {
    exceededTransferLimit?: boolean;
  };
}

// HIFLD ArcGIS REST API endpoint (via proxy)
const HIFLD_BASE_URL = '/api/hifld-proxy';

// HIFLD cache now uses compressed caching via HifldCache (similar to CableCache)

/**
 * Fetch HIFLD data from ArcGIS REST API with pagination
 */
async function fetchHifldData(): Promise<TransmissionLine[]> {
  const allFeatures: TransmissionLine[] = [];
  let offset = 0;
  const pageSize = 2000; // Page size for requests
  let hasMore = true;
  let consecutiveEmptyPages = 0;
  const maxConsecutiveEmpty = 2; // Stop after 2 consecutive empty pages
  const maxPages = 30; // 30 pages = 60,000 features for complete US coverage
  // Removed minFeatures early stopping - we want to fetch until we get all data or hit maxPages
  let pageCount = 0;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;
  
  // Overall timeout for entire fetch operation (180 seconds - allow more time for many pages)
  const overallTimeout = setTimeout(() => {
    console.warn('⚠️ Overall fetch timeout reached (180s), returning partial data');
    hasMore = false;
  }, 180000);

  console.log('🔄 Fetching HIFLD transmission line data...');

  while (hasMore && pageCount < maxPages) {
    pageCount++;
    const params = new URLSearchParams({
      where: '1=1', // Get all features
      outFields: '*', // Get all fields
      outSR: '4326', // WGS84 coordinate system
      f: 'geojson',
      resultOffset: offset.toString(),
      resultRecordCount: pageSize.toString(),
    });

    // Build URL - check if we're using proxy or direct
    const url = `${HIFLD_BASE_URL}?${params.toString()}`;
    console.log(`📡 Fetching from: ${url.substring(0, 100)}...`);

    try {
      // Add timeout to prevent hanging - 12 seconds per request (faster)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 second timeout per request
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch HIFLD data: ${response.status} ${response.statusText}`);
      }
      
      // Reset error counter on success
      consecutiveErrors = 0;

      // Get response text first to check content
      const responseText = await response.text();
      
      // Check if response is actually JSON
      const contentType = response.headers.get('content-type') || '';
      let data: GeoJsonObject;
      
      try {
        // Try to parse as JSON
        data = JSON.parse(responseText);
      } catch (parseError: any) {
        // If JSON parse fails, log the actual response
        console.error('❌ Failed to parse JSON response. Content-Type:', contentType);
        console.error('❌ Response text (first 500 chars):', responseText.substring(0, 500));
        throw new Error(`Failed to parse JSON: ${parseError.message}. Response starts with: ${responseText.substring(0, 100)}`);
      }

      if (!data.features || data.features.length === 0) {
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= maxConsecutiveEmpty) {
          console.log(`Stopping after ${maxConsecutiveEmpty} consecutive empty pages`);
          hasMore = false;
          break;
        }
        // Try next page
        offset += pageSize;
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }
      
      // Reset empty page counter if we got data
      consecutiveEmptyPages = 0;
      
      // Check if API says we've exceeded transfer limit (indicates more data available)
      if (data.properties?.exceededTransferLimit) {
        console.log(`⚠️ API indicates more data available (exceededTransferLimit=true)`);
      }

      // Process features
      data.features.forEach((feature, index) => {
        if (feature.geometry?.type === 'LineString') {
          const coordinates = feature.geometry.coordinates as [number, number][];
          const props = feature.properties || {};

          const transmissionLine: TransmissionLine = {
            id: props.ID || props.OBJECTID?.toString() || `hifld_${offset + index}`,
            coordinates: coordinates,
            properties: {
              objectId: props.OBJECTID,
              objectId1: props.OBJECTID_1,
              id: props.ID,
              type: props.TYPE,
              status: props.STATUS,
              naicsCode: props.NAICS_CODE,
              naicsDesc: props.NAICS_DESC,
              source: props.SOURCE,
              sourceDate: props.SOURCEDATE,
              valMethod: props.VAL_METHOD,
              valDate: props.VAL_DATE,
              owner: props.OWNER,
              voltage: props.VOLTAGE,
              voltClass: props.VOLT_CLASS,
              inferred: props.INFERRED,
              sub1: props.SUB_1,
              sub2: props.SUB_2,
              shapeLength: props.Shape__Length || props.SHAPE__Len,
              globalId: props.GlobalID,
              ...props, // Include any additional properties
            },
          };

          allFeatures.push(transmissionLine);
        }
      });

              console.log(`Fetched ${data.features.length} features (total: ${allFeatures.length}) at offset ${offset}`);

              // Check if we got fewer features than requested (last page)
              if (data.features.length < pageSize) {
                // Got fewer features than requested, we're done
                console.log(`Received ${data.features.length} features (less than pageSize ${pageSize}), stopping pagination - reached end of data`);
                hasMore = false;
              } else {
                // Got a full page, continue fetching to get more geographic coverage
                offset += pageSize;
                // Small delay to avoid overwhelming the API
                await new Promise(resolve => setTimeout(resolve, 100));
              }
    } catch (error) {
      consecutiveErrors++;
      console.error(`Error fetching HIFLD data at offset ${offset} (attempt ${consecutiveErrors}/${maxConsecutiveErrors}):`, error);
      
      // If we have some data, continue trying (don't stop early)
              if (allFeatures.length > 0) {
                console.warn(`⚠️ Error occurred but have ${allFeatures.length} features, continuing...`);
              }
      
      // If too many consecutive errors, stop trying
      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.warn(`❌ Too many consecutive errors (${consecutiveErrors}), stopping. Have ${allFeatures.length} features.`);
        if (allFeatures.length > 0) {
          console.warn(`Returning partial dataset: ${allFeatures.length} features`);
          break;
        }
        // If we have no data and too many errors, throw
        throw new Error(`Failed to fetch HIFLD data after ${consecutiveErrors} attempts`);
      }
      
      // Wait a bit longer before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Don't increment offset on error, retry same page
      continue;
    }
  }
  
  // Clear overall timeout
  clearTimeout(overallTimeout);
  
  if (pageCount >= maxPages) {
    console.warn(`Reached maximum page limit (${maxPages}), stopping pagination. Loaded ${allFeatures.length} features.`);
  }

  console.log(`✅ Total HIFLD transmission lines loaded: ${allFeatures.length}`);
  
  // Log data coverage info
  if (allFeatures.length < 1000) {
    console.warn(`⚠️ Warning: Only loaded ${allFeatures.length} transmission lines. Data may be incomplete.`);
  } else if (allFeatures.length < 10000) {
    console.log(`ℹ️ Loaded ${allFeatures.length} transmission lines. This should provide good coverage.`);
  } else {
    console.log(`✅ Loaded ${allFeatures.length} transmission lines. Good geographic coverage expected.`);
  }
  
  // Return whatever we have, even if empty (better than throwing)
  if (allFeatures.length === 0) {
    console.warn('⚠️ No HIFLD transmission lines were loaded - returning empty array');
    return [];
  }
  
  // Simplify geometries for very long lines to reduce visual clutter
  // Keep all lines but simplify coordinates if they have too many points
  const simplifiedFeatures = allFeatures.map(line => {
    if (line.coordinates.length > 100) {
      // Simplify by keeping every Nth point for very long lines
      const step = Math.ceil(line.coordinates.length / 100);
      const simplified = line.coordinates.filter((_, index) => index % step === 0 || index === line.coordinates.length - 1);
      return { ...line, coordinates: simplified };
    }
    return line;
  });
  
  console.log(`ℹ️ Simplified ${allFeatures.length - simplifiedFeatures.length} long lines for better visualization`);
  
  return simplifiedFeatures;
}

/**
 * Load HIFLD transmission line data with caching
 * Similar pattern to WFS cable data loading
 */
export async function loadHifldData(): Promise<TransmissionLine[]> {
  // Try cache first (uses compressed caching)
  const cachedData = HifldCache.get();
  if (cachedData && cachedData.length >= 100) {
    console.log(`✅ Using cached HIFLD data (${cachedData.length} lines)`);
    return cachedData;
  } else if (cachedData && cachedData.length < 100) {
    console.log(`⚠️ Cached data has only ${cachedData.length} lines, fetching fresh data...`);
    // Clear the incomplete cache
    HifldCache.clear();
  }

  // Fetch fresh data from API with overall timeout
  try {
    console.log('🔄 Fetching fresh HIFLD data from API...');
    
    // Add overall timeout wrapper (200 seconds total - allow more time for many pages)
    const fetchPromise = fetchHifldData();
    const timeoutPromise = new Promise<TransmissionLine[]>((_, reject) => {
      setTimeout(() => reject(new Error('HIFLD data fetch timeout after 200 seconds')), 200000);
    });
    
    const freshData = await Promise.race([fetchPromise, timeoutPromise]);

    // Cache using compressed storage (handles large data automatically)
    if (freshData.length >= 100) {
      const cacheResult = HifldCache.set(freshData);
      if (!cacheResult) {
        console.warn('⚠️ Failed to cache HIFLD data - may be too large even with compression');
      } else {
        console.log(`✅ Cached ${freshData.length} HIFLD transmission lines (compressed)`);
      }
    } else {
      console.warn(`⚠️ Not caching data - only ${freshData.length} lines (too few)`);
    }

    return freshData;
  } catch (error) {
    console.error('❌ Failed to fetch HIFLD data:', error);
    
    // If we have cached data (even if incomplete), return it as fallback
    if (cachedData && cachedData.length > 0) {
      console.warn(`⚠️ Using incomplete cached data (${cachedData.length} lines) as fallback`);
      return cachedData;
    }
    
    // Return empty array on error (better than crashing)
    return [];
  }
}

/**
 * Clear the cached HIFLD data
 */
export function clearHifldCache(): void {
  HifldCache.clear();
  console.log('HIFLD cache cleared');
}

/**
 * Get HIFLD cache statistics
 */
export function getHifldCacheStats() {
  try {
    const cached = HifldCache.get();
    if (!cached) {
      return { cached: false, count: 0 };
    }
    return { cached: true, count: cached.length };
  } catch {
    return { cached: false, count: 0 };
  }
}

