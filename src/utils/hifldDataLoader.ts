import type { TransmissionLine } from '../models/TransmissionLine';
import { HifldCache } from './cache';
import { indexedDbCache } from './indexedDbCache';
import { authenticatedFetch } from './auth';

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

// S3 API endpoint for pre-processed HIFLD data (via server-side proxy for private S3 access)
const HIFLD_S3_API_URL = '/api/hifld-s3';

// HIFLD cache now uses compressed caching via HifldCache (similar to CableCache)

/**
 * Fetch HIFLD data from ArcGIS REST API with pagination
 */
async function fetchHifldData(
  onProgress?: (progress: number, message: string, count: number) => void,
  onDataChunk?: (data: TransmissionLine[]) => void
): Promise<TransmissionLine[]> {
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
  
  if (onProgress) {
    onProgress(0, 'Starting to fetch HIFLD data...', 0);
  }

  while (hasMore && pageCount < maxPages) {
    pageCount++;
    
    // Report progress
    if (onProgress) {
      const progress = Math.min(95, (pageCount / maxPages) * 90); // Use 0-90% for fetching
      onProgress(progress, `Fetching page ${pageCount}/${maxPages}...`, allFeatures.length);
    }
      const params = new URLSearchParams({
        where: '1=1', // Get all features
        outFields: 'VOLTAGE,VOLT_CLASS,OWNER,STATUS,TYPE,SUB_1,SUB_2,ID,OBJECTID',
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
      
      const response = await authenticatedFetch(url, {
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

      // Emit the new chunk of data for progressive rendering
      if (onDataChunk && allFeatures.length > 0) {
        const newChunk = allFeatures.slice(-data.features.length); // Get just the new lines from this page
        onDataChunk(newChunk);
      }

      console.log(`Fetched ${data.features.length} features (total: ${allFeatures.length}) at offset ${offset}`);

      // Report progress with current count
      if (onProgress) {
        const progress = Math.min(95, (pageCount / maxPages) * 90);
        onProgress(progress, `Loaded ${allFeatures.length.toLocaleString()} lines (page ${pageCount}/${maxPages})...`, allFeatures.length);
      }

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
  
  // Report completion
  if (onProgress) {
    onProgress(95, `Processing ${allFeatures.length} transmission lines...`, allFeatures.length);
  }
  
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
  
  // Light simplification: only reduce extremely long lines to preserve hover accuracy
  // Keep max 200 points per line for good balance of performance and interactivity
  const simplifiedFeatures = allFeatures.map(line => {
    if (line.coordinates.length > 200) {
      const step = Math.ceil(line.coordinates.length / 200);
      const simplified = line.coordinates.filter((_, index) => 
        index % step === 0 || index === line.coordinates.length - 1
      );
      return { ...line, coordinates: simplified };
    }
    return line;
  });
  
  const simplifiedCount = allFeatures.filter(line => line.coordinates.length > 200).length;
  console.log(`ℹ️ Simplified ${simplifiedCount} very long lines for better performance`);
  
  return simplifiedFeatures;
}

const HIFLD_CACHE_KEY = 'hifld-transmission-lines';
const HIFLD_CACHE_VERSION = 'v4'; // Increment to force refresh
const HIFLD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Get cached HIFLD data from IndexedDB (primary) or localStorage (fallback)
 */
async function getCachedHifldData(): Promise<TransmissionLine[] | null> {
  // Try IndexedDB first (better for large datasets)
  if (indexedDbCache.isAvailable()) {
    try {
      const cached = await indexedDbCache.get<TransmissionLine[]>(HIFLD_CACHE_KEY, HIFLD_MAX_AGE_MS);
      if (cached && cached.length >= 100) {
        console.log(`✅ Using IndexedDB cached HIFLD data (${cached.length} lines)`);
        return cached;
      }
    } catch (error) {
      console.warn('IndexedDB cache read failed, trying localStorage:', error);
    }
  }

  // Fallback to localStorage cache
  const cachedData = HifldCache.get();
  if (cachedData && cachedData.length >= 100) {
    console.log(`✅ Using localStorage cached HIFLD data (${cachedData.length} lines)`);
    // Migrate to IndexedDB if available
    if (indexedDbCache.isAvailable()) {
      indexedDbCache.set(HIFLD_CACHE_KEY, cachedData, HIFLD_CACHE_VERSION).catch(() => {
        // Ignore migration errors
      });
    }
    return cachedData;
  }

  return null;
}

/**
 * Store HIFLD data in both IndexedDB and localStorage (for redundancy)
 */
async function cacheHifldData(data: TransmissionLine[]): Promise<void> {
  if (data.length < 100) {
    console.warn(`⚠️ Not caching data - only ${data.length} lines (too few)`);
    return;
  }

  // Store in IndexedDB (primary)
  if (indexedDbCache.isAvailable()) {
    const indexedDbSuccess = await indexedDbCache.set(HIFLD_CACHE_KEY, data, HIFLD_CACHE_VERSION);
    if (indexedDbSuccess) {
      console.log(`✅ Cached ${data.length} HIFLD transmission lines in IndexedDB`);
    } else {
      console.warn('⚠️ Failed to cache HIFLD data in IndexedDB');
    }
  }

  // Also store in localStorage as backup (compressed)
  const localStorageSuccess = HifldCache.set(data);
  if (localStorageSuccess) {
    console.log(`✅ Also cached ${data.length} HIFLD transmission lines in localStorage (compressed)`);
  } else {
    console.warn('⚠️ Failed to cache HIFLD data in localStorage - may be too large');
  }
}

/**
 * Load HIFLD data from S3 (fast, pre-processed)
 */
async function loadHifldFromS3(
  onProgress?: (progress: number, message: string, count: number) => void
): Promise<TransmissionLine[] | null> {
  try {
    if (onProgress) {
      onProgress(10, 'Loading HIFLD data from S3...', 0);
    }
    
    console.log('🔄 Fetching HIFLD data from S3 via API proxy...');
    const response = await authenticatedFetch(HIFLD_S3_API_URL, {
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ S3 fetch failed: ${response.status} ${response.statusText}`);
      return null;
    }

    if (onProgress) {
      onProgress(50, 'Parsing HIFLD data...', 0);
    }

    const data: TransmissionLine[] = await response.json();
    
    if (onProgress) {
      onProgress(100, `Loaded ${data.length} transmission lines from S3`, data.length);
    }

    console.log(`✅ Loaded ${data.length} HIFLD transmission lines from S3`);
    return data;
  } catch (error) {
    console.warn('⚠️ Failed to load HIFLD data from S3:', error);
    return null;
  }
}

/**
 * Load HIFLD transmission line data with instant cache return and background refresh
 * Priority: 1. Cache, 2. S3, 3. API
 */
export async function loadHifldData(
  onProgress?: (data: TransmissionLine[]) => void,
  onFetchProgress?: (progress: number, message: string, count: number) => void,
  onDataChunk?: (data: TransmissionLine[]) => void
): Promise<TransmissionLine[]> {
  // 1. Get cached data immediately
  const cachedData = await getCachedHifldData();
  
  // If we have good cached data, return it immediately and refresh in background
  if (cachedData && cachedData.length >= 1000) {
    console.log(`✅ Returning cached HIFLD data instantly (${cachedData.length} lines)`);
    
    // Trigger background refresh from S3 (don't await)
    loadHifldFromS3(onFetchProgress)
      .then((s3Data) => {
        if (s3Data && s3Data.length > cachedData.length) {
          console.log(`✅ S3 data is newer (${s3Data.length} vs ${cachedData.length} lines), updating...`);
          cacheHifldData(s3Data);
          if (onProgress) {
            onProgress(s3Data);
          }
        }
      })
      .catch((error) => {
        console.warn('Background S3 refresh failed:', error);
      });
    
    return cachedData;
  }

  // 2. Try S3 (fast, pre-processed data) - but don't wait if it fails
  if (onFetchProgress) {
    onFetchProgress(5, 'Checking for pre-processed data...', 0);
  }
  
  // Try S3 with timeout - don't block if it fails
  const s3Promise = loadHifldFromS3(onFetchProgress).catch(() => null);
  const s3Timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), 3000); // 3 second timeout for S3
  });
  
  const s3Data = await Promise.race([s3Promise, s3Timeout]);
  
  if (s3Data && s3Data.length >= 100) {
    console.log(`✅ Loaded HIFLD data from S3 (${s3Data.length} lines)`);
    // Emit S3 data in chunks for progressive rendering
    if (onDataChunk && s3Data.length > 0) {
      // Emit in chunks of 2000 for smooth progressive rendering
      const chunkSize = 2000;
      for (let i = 0; i < s3Data.length; i += chunkSize) {
        const chunk = s3Data.slice(i, i + chunkSize);
        onDataChunk(chunk);
        // Small delay to allow UI to update
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    // Cache it for next time
    await cacheHifldData(s3Data);
    if (onProgress) {
      onProgress(s3Data);
    }
    return s3Data;
  }

  // 3. Fallback to API (slow, but always works)
  if (onFetchProgress) {
    onFetchProgress(10, 'Fetching from API... This may take 10-30 seconds.', 0);
  }
  
  if (cachedData && cachedData.length < 1000) {
    console.log(`⚠️ Cached data has only ${cachedData.length} lines, fetching from API...`);
  } else {
    console.log('🔄 No cached or S3 data found, fetching from API...');
  }

  return refreshHifldDataInBackground(onProgress, onFetchProgress, onDataChunk);
}

/**
 * Refresh HIFLD data from API in background
 */
async function refreshHifldDataInBackground(
  onProgress?: (data: TransmissionLine[]) => void,
  onFetchProgress?: (progress: number, message: string, count: number) => void,
  onDataChunk?: (data: TransmissionLine[]) => void
): Promise<TransmissionLine[]> {
  try {
    console.log('🔄 Fetching fresh HIFLD data from API...');
    
    // Add overall timeout wrapper (200 seconds total)
    const fetchPromise = fetchHifldData(onFetchProgress, onDataChunk);
    const timeoutPromise = new Promise<TransmissionLine[]>((_, reject) => {
      setTimeout(() => reject(new Error('HIFLD data fetch timeout after 200 seconds')), 200000);
    });
    
    const freshData = await Promise.race([fetchPromise, timeoutPromise]);
    
    // Report processing progress
    if (onFetchProgress) {
      onFetchProgress(98, 'Caching data...', freshData.length);
    }

    // Cache the fresh data
    await cacheHifldData(freshData);
    
    // Report completion
    if (onFetchProgress) {
      onFetchProgress(100, `Loaded ${freshData.length} transmission lines`, freshData.length);
    }

    // Notify progress callback if provided
    if (onProgress) {
      onProgress(freshData);
    }

    return freshData;
  } catch (error) {
    console.error('❌ Failed to fetch HIFLD data:', error);
    
    // Try to return cached data as fallback
    const cachedData = await getCachedHifldData();
    if (cachedData && cachedData.length > 0) {
      console.warn(`⚠️ Using cached data (${cachedData.length} lines) as fallback after fetch error`);
      return cachedData;
    }
    
    // Return empty array on error (better than crashing)
    return [];
  }
}

/**
 * Clear the cached HIFLD data from both IndexedDB and localStorage
 */
export async function clearHifldCache(): Promise<void> {
  // Clear IndexedDB cache
  if (indexedDbCache.isAvailable()) {
    await indexedDbCache.clear(HIFLD_CACHE_KEY);
  }
  
  // Clear localStorage cache
  HifldCache.clear();
  console.log('✅ HIFLD cache cleared from both IndexedDB and localStorage');
}

/**
 * Get HIFLD cache statistics
 */
export async function getHifldCacheStats() {
  try {
    // Check IndexedDB first
    if (indexedDbCache.isAvailable()) {
      const indexedDbData = await indexedDbCache.get<TransmissionLine[]>(HIFLD_CACHE_KEY);
      if (indexedDbData && indexedDbData.length >= 100) {
        return { cached: true, count: indexedDbData.length, source: 'indexeddb' };
      }
    }

    // Fallback to localStorage
    const cached = HifldCache.get();
    if (cached && cached.length >= 100) {
      return { cached: true, count: cached.length, source: 'localstorage' };
    }

    return { cached: false, count: 0, source: null };
  } catch {
    return { cached: false, count: 0, source: null };
  }
}
