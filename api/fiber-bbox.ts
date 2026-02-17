import { VercelRequest, VercelResponse } from '@vercel/node';
import path from 'path';
import fs from 'fs/promises';
import { requireAuth } from './_lib/auth.js';
import { applyCors, handleCorsPreflight } from './_lib/cors.js';
import { applyRateLimit } from './_lib/rateLimit.js';

// Simple in-memory cache per bbox (keyed by bbox string)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT = {
  key: 'fiber-bbox',
  maxRequests: 30,
  windowMs: 60 * 1000,
};

// Grid tile size (degrees)
// Can be overridden via FIBER_TILE_SIZE env var (default: 5 for current tiles, use 2 for optimized tiles)
const TILE_SIZE = parseInt(process.env.FIBER_TILE_SIZE || '5', 10);
const FIBER_PROPERTIES_WHITELIST = [
  'NAME',
  'OPERATOR',
  'OWNER',
  'TYPE',
  'STATUS',
  'SERVICE_TYPE',
  'MILES',
  'STATE_NAME',
  'CNTY_NAME',
  'CNTRY_NAME',
  'QUALITY',
  'LOC_ID',
] as const;

function sanitizeFeature(feature: any): any {
  const sanitizedProperties: Record<string, any> = {};
  const sourceProperties = feature?.properties ?? {};
  for (const key of FIBER_PROPERTIES_WHITELIST) {
    if (sourceProperties[key] !== undefined) {
      sanitizedProperties[key] = sourceProperties[key];
    }
  }

  return {
    type: feature?.type || 'Feature',
    geometry: feature?.geometry,
    properties: sanitizedProperties,
  };
}

/**
 * Calculate which grid tiles intersect with the given bbox
 */
function getIntersectingTiles(
  minLon: number,
  minLat: number,
  maxLon: number,
  maxLat: number
): Array<{ minLon: number; minLat: number; maxLon: number; maxLat: number }> {
  const tiles: Array<{ minLon: number; minLat: number; maxLon: number; maxLat: number }> = [];

  // Round down to tile boundaries
  const startTileLon = Math.floor(minLon / TILE_SIZE) * TILE_SIZE;
  const startTileLat = Math.floor(minLat / TILE_SIZE) * TILE_SIZE;
  const endTileLon = Math.ceil(maxLon / TILE_SIZE) * TILE_SIZE;
  const endTileLat = Math.ceil(maxLat / TILE_SIZE) * TILE_SIZE;

  // Generate all tiles that intersect
  for (let lon = startTileLon; lon < endTileLon; lon += TILE_SIZE) {
    for (let lat = startTileLat; lat < endTileLat; lat += TILE_SIZE) {
      tiles.push({
        minLon: lon,
        minLat: lat,
        maxLon: lon + TILE_SIZE,
        maxLat: lat + TILE_SIZE,
      });
    }
  }

  return tiles;
}

/**
 * Generate tile filename (e.g. fiber_n125_25.json)
 */
function getTileFilename(minLon: number, minLat: number): string {
  const lonStr = minLon < 0 ? `n${Math.abs(minLon)}` : `${minLon}`;
  const latStr = minLat < 0 ? `s${Math.abs(minLat)}` : `${minLat}`;
  return `fiber_${lonStr}_${latStr}.json`;
}

/**
 * Generate S3 URL for a tile file
 */
function getTileUrl(minLon: number, minLat: number, baseUrl: string): string {
  return `${baseUrl}/${getTileFilename(minLon, minLat)}`;
}

/**
 * Read a tile from the filesystem (dev only). Tries public/fiber-tiles then fiber-tiles.
 */
async function readTileFromDisk(minLon: number, minLat: number): Promise<{ type: string; features: any[] }> {
  const filename = getTileFilename(minLon, minLat);
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'public', 'fiber-tiles', filename),
    path.join(cwd, 'fiber-tiles', filename),
  ];
  for (const filePath of candidates) {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as { type: string; features: any[] };
    } catch {
      continue;
    }
  }
  return { type: 'FeatureCollection', features: [] };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCorsPreflight(req, res)) return;
  if (!applyCors(req, res)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  if (!applyRateLimit(req, res, RATE_LIMIT)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAuth(req, res)) return;

  // Get bbox from query params
  const minLon = parseFloat(req.query.minLon as string);
  const minLat = parseFloat(req.query.minLat as string);
  const maxLon = parseFloat(req.query.maxLon as string);
  const maxLat = parseFloat(req.query.maxLat as string);
  const overview = req.query.overview === '1' || req.query.overview === 'true';

  // Validate bbox
  if (
    isNaN(minLon) ||
    isNaN(minLat) ||
    isNaN(maxLon) ||
    isNaN(maxLat) ||
    minLon >= maxLon ||
    minLat >= maxLat
  ) {
    return res.status(400).json({
      error: 'Invalid bbox parameters. Required: minLon, minLat, maxLon, maxLat',
    });
  }

  // Overview mode: 20 tiles. Full mode: 50 tiles (center-sorted) to avoid memory crashes from huge responses.
  const MAX_TILES = overview ? 20 : 50;
  const MAX_FEATURES_OVERVIEW = 8000;
  const MAX_FEATURES_FULL = 25000; // Hard cap so response never crashes browser/laptop

  // Create cache key (include overview so full and overview responses are cached separately)
  const cacheKey = `${minLon}_${minLat}_${maxLon}_${maxLat}_${overview ? 'ov' : 'full'}`;
  const now = Date.now();

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    res.setHeader('Cache-Control', 'private, max-age=600'); // 10 minutes
    return res.status(200).json(cached.data);
  }

  try {
    // Get tile source from environment variable, or use local dev server files.
    const isDev = process.env.NODE_ENV === 'development' || !process.env.VERCEL;
    let baseUrl = process.env.FIBER_TILES_S3_URL;
    
    if (!baseUrl) {
      if (isDev) {
        // Use request origin in dev mode (works with any Vite port)
        let origin = 'http://localhost:5173';
        if (req.headers.origin) {
          origin = req.headers.origin as string;
        } else if (req.headers.referer) {
          const referer = req.headers.referer as string;
          const urlParts = referer.split('/');
          if (urlParts.length >= 3) {
            origin = urlParts.slice(0, 3).join('/');
          }
        }
        baseUrl = `${origin}/fiber-tiles`;
      } else {
        return res.status(500).json({
          error: 'FIBER_TILES_S3_URL is not configured',
        });
      }
    }

    // Get intersecting tiles
    const tiles = getIntersectingTiles(minLon, minLat, maxLon, maxLat);
    
    // In overview mode, sample tiles evenly across the bbox for geographic distribution
    let tilesToFetch = tiles;
    if (overview && tiles.length > MAX_TILES) {
      // Sample tiles evenly across the bbox to ensure geographic distribution
      // Sort by lat first, then lon to get a consistent grid pattern
      const sortedTiles = [...tiles].sort((a, b) => {
        if (Math.abs(a.minLat - b.minLat) > 0.1) return a.minLat - b.minLat;
        return a.minLon - b.minLon;
      });
      // Take evenly spaced tiles across the sorted list
      const step = Math.ceil(sortedTiles.length / MAX_TILES);
      tilesToFetch = [];
      for (let i = 0; i < sortedTiles.length && tilesToFetch.length < MAX_TILES; i += step) {
        tilesToFetch.push(sortedTiles[i]);
      }
      // Fill remaining slots with tiles from different areas
      if (tilesToFetch.length < MAX_TILES) {
        const used = new Set(tilesToFetch.map(t => `${t.minLon}_${t.minLat}`));
        for (const tile of sortedTiles) {
          if (tilesToFetch.length >= MAX_TILES) break;
          const key = `${tile.minLon}_${tile.minLat}`;
          if (!used.has(key)) {
            tilesToFetch.push(tile);
            used.add(key);
          }
        }
      }
    } else {
      // Full mode: when over limit, take tiles closest to viewport center so visible area always has fiber
      if (tiles.length > MAX_TILES) {
        const centerLon = (minLon + maxLon) / 2;
        const centerLat = (minLat + maxLat) / 2;
        tilesToFetch = [...tiles]
          .sort((a, b) => {
            const ax = (a.minLon + a.maxLon) / 2;
            const ay = (a.minLat + a.maxLat) / 2;
            const bx = (b.minLon + b.maxLon) / 2;
            const by = (b.minLat + b.maxLat) / 2;
            const distA = (ax - centerLon) ** 2 + (ay - centerLat) ** 2;
            const distB = (bx - centerLon) ** 2 + (by - centerLat) ** 2;
            return distA - distB;
          })
          .slice(0, MAX_TILES);
      } else {
        tilesToFetch = tiles;
      }
    }

    if (tiles.length > MAX_TILES) {
      console.warn(`Requested ${tiles.length} tiles, limiting to ${MAX_TILES} for performance. Consider zooming in or using smaller tile size.`);
    }

    // In dev, read tiles from disk (vercel dev doesn't serve /fiber-tiles to server-side requests)
    const tilePromises = tilesToFetch.map((tile) => {
      if (isDev) {
        return readTileFromDisk(tile.minLon, tile.minLat);
      }
      // Production: fetch from S3 or CDN
      const tileUrl = getTileUrl(tile.minLon, tile.minLat, baseUrl);
      const FETCH_TIMEOUT = 30000; // 30 seconds per tile
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Fetch timeout')), FETCH_TIMEOUT);
      });
      return Promise.race([
        fetch(tileUrl, { headers: { Accept: 'application/json' } })
          .then((response) => {
            if (!response.ok) {
              if (response.status === 404) return { type: 'FeatureCollection', features: [] };
              throw new Error(`Failed to fetch tile: ${response.statusText}`);
            }
            return response.json();
          }),
        timeoutPromise,
      ]).catch((error) => {
        console.warn(`Failed to fetch tile ${tileUrl}:`, error.message);
        return { type: 'FeatureCollection', features: [] };
      });
    });

    // Wait for all tiles to load (with progress logging in dev)
    console.log(`Fetching ${tilesToFetch.length} tiles for bbox [${minLon}, ${minLat}, ${maxLon}, ${maxLat}]`);
    const tileData = await Promise.all(tilePromises);
    console.log(`Loaded ${tileData.length} tiles`);

    // Merge all features from all tiles (use loop to avoid stack overflow with 100k+ features)
    const allFeatures: any[] = [];
    for (const geojson of tileData) {
      if (geojson && geojson.features && Array.isArray(geojson.features)) {
        for (const f of geojson.features) allFeatures.push(f);
      }
    }

    // Cap features so we never send a response that can crash the client
    let featuresToReturn = allFeatures;
    if (overview && allFeatures.length > MAX_FEATURES_OVERVIEW) {
      const step = Math.ceil(allFeatures.length / MAX_FEATURES_OVERVIEW);
      featuresToReturn = [];
      for (let i = 0; i < allFeatures.length; i += step) {
        featuresToReturn.push(allFeatures[i]);
      }
      if (featuresToReturn.length < MAX_FEATURES_OVERVIEW && allFeatures.length > featuresToReturn.length) {
        featuresToReturn = allFeatures.slice(0, MAX_FEATURES_OVERVIEW);
      }
    } else if (!overview && allFeatures.length > MAX_FEATURES_FULL) {
      // Full mode: hard cap to prevent memory crashes (take first N; tiles are already center-sorted)
      featuresToReturn = allFeatures.slice(0, MAX_FEATURES_FULL);
    }

    // For performance with large datasets, skip precise filtering if we have too many features
    // The tiles are already clipped to the bbox area, so most features should be relevant
    let filteredFeatures = featuresToReturn;
    
    // Only do precise filtering if we have a reasonable number of features
    if (featuresToReturn.length < 10000) {
      // Filter features to only include those that intersect the bbox
      // (tiles might have some overlap, so we filter precisely)
      filteredFeatures = featuresToReturn.filter((feature) => {
        if (!feature.geometry || !feature.geometry.coordinates) return false;

        const coords = feature.geometry.coordinates;
        let featureMinLon = Infinity;
        let featureMaxLon = -Infinity;
        let featureMinLat = Infinity;
        let featureMaxLat = -Infinity;

        // Extract bbox from feature coordinates (iterative to avoid stack overflow)
        // Use iterative approach instead of recursion for large features
        const coordStack: any[] = [coords];
        const MAX_DEPTH = 10; // Safety limit
        let depth = 0;
        
        while (coordStack.length > 0 && depth < MAX_DEPTH) {
          const current = coordStack.pop();
          depth++;
          
          if (!Array.isArray(current) || current.length === 0) continue;
          
          // Check if it's a coordinate pair [lon, lat]
          if (typeof current[0] === 'number' && typeof current[1] === 'number' && current.length >= 2) {
            const [lon, lat] = current;
            featureMinLon = Math.min(featureMinLon, lon);
            featureMaxLon = Math.max(featureMaxLon, lon);
            featureMinLat = Math.min(featureMinLat, lat);
            featureMaxLat = Math.max(featureMaxLat, lat);
          } else if (Array.isArray(current[0])) {
            // Nested array - add all items to stack
            for (let i = current.length - 1; i >= 0; i--) {
              coordStack.push(current[i]);
            }
          }
        }

        // Check if feature bbox intersects request bbox
        return (
          featureMaxLon >= minLon &&
          featureMinLon <= maxLon &&
          featureMaxLat >= minLat &&
          featureMinLat <= maxLat
        );
      });
    } else {
      console.log(`Skipping precise bbox filtering for ${featuresToReturn.length} features (performance optimization)`);
    }

    const sanitizedFeatures = filteredFeatures.map(sanitizeFeature);

    // Create merged GeoJSON response
    const mergedGeoJson = {
      type: 'FeatureCollection',
      features: sanitizedFeatures,
    };

    // Update cache
    cache.set(cacheKey, {
      data: mergedGeoJson,
      timestamp: now,
    });

    // Set response headers
    res.setHeader('Cache-Control', 'private, max-age=600'); // 10 minutes

    // Send response
    return res.status(200).json(mergedGeoJson);
  } catch (error) {
    console.error('Error fetching fiber cable data:', error);
    return res.status(500).json({
      error: 'Failed to fetch fiber cable data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
