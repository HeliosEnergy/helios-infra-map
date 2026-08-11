import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_lib/auth.js';
import { applyCors, handleCorsPreflight } from './_lib/cors.js';
import { applyRateLimit } from './_lib/rateLimit.js';

const CACHE_TTL = 60 * 60 * 1000;
const RATE_LIMIT = {
  key: 'ai-data-centers',
  maxRequests: 60,
  windowMs: 60 * 1000,
};

type GeoJsonFeature = {
  type: 'Feature';
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: Record<string, unknown>;
};

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  metadata?: Record<string, unknown>;
  features: GeoJsonFeature[];
};

type CachedDataset = {
  data: GeoJsonFeatureCollection;
  timestamp: number;
};

let cache: CachedDataset | null = null;

const getConfiguredS3Url = () => process.env.AI_DATA_CENTERS_S3_URL || '';

const isValidHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const getStringQuery = (value: string | string[] | undefined): string | null => {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
};

const getNumberQuery = (value: string | string[] | undefined): number | null => {
  const raw = getStringQuery(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseBbox = (value: string | string[] | undefined): [number, number, number, number] | null => {
  const raw = getStringQuery(value);
  if (!raw) return null;

  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;

  const [minLng, minLat, maxLng, maxLat] = parts;
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90 || minLng > maxLng || minLat > maxLat) {
    return null;
  }

  return [minLng, minLat, maxLng, maxLat];
};

const normalizeText = (value: unknown) => String(value || '').trim().toLowerCase();

const getPointCoordinates = (feature: GeoJsonFeature): [number, number] | null => {
  if (feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) return null;
  const [longitude, latitude] = feature.geometry.coordinates;
  if (typeof longitude !== 'number' || typeof latitude !== 'number') return null;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return [longitude, latitude];
};

const matchesFilters = (
  feature: GeoJsonFeature,
  filters: {
    status: string | null;
    state: string | null;
    country: string | null;
    developer: string | null;
    minPowerMw: number | null;
    maxPowerMw: number | null;
    bbox: [number, number, number, number] | null;
  }
) => {
  const properties = feature.properties || {};

  if (filters.status && normalizeText(properties.status) !== normalizeText(filters.status)) return false;
  if (filters.state && normalizeText(properties.state) !== normalizeText(filters.state)) return false;
  if (filters.country && normalizeText(properties.country) !== normalizeText(filters.country)) return false;
  if (filters.developer && !normalizeText(properties.developer).includes(normalizeText(filters.developer))) {
    return false;
  }

  const powerMw = typeof properties.powerMw === 'number' ? properties.powerMw : null;
  if (filters.minPowerMw !== null && (powerMw === null || powerMw < filters.minPowerMw)) return false;
  if (filters.maxPowerMw !== null && (powerMw === null || powerMw > filters.maxPowerMw)) return false;

  if (filters.bbox) {
    const coordinates = getPointCoordinates(feature);
    if (!coordinates) return false;
    const [longitude, latitude] = coordinates;
    const [minLng, minLat, maxLng, maxLat] = filters.bbox;
    if (longitude < minLng || longitude > maxLng || latitude < minLat || latitude > maxLat) return false;
  }

  return true;
};

const applyQueryFilters = (dataset: GeoJsonFeatureCollection, req: VercelRequest): GeoJsonFeatureCollection => {
  const filters = {
    status: getStringQuery(req.query.status),
    state: getStringQuery(req.query.state),
    country: getStringQuery(req.query.country),
    developer: getStringQuery(req.query.developer),
    minPowerMw: getNumberQuery(req.query.minPowerMw),
    maxPowerMw: getNumberQuery(req.query.maxPowerMw),
    bbox: parseBbox(req.query.bbox),
  };

  const shouldFilter = Object.values(filters).some((value) => value !== null);
  if (!shouldFilter) return dataset;

  const features = dataset.features.filter((feature) => matchesFilters(feature, filters));
  return {
    ...dataset,
    metadata: {
      ...(dataset.metadata || {}),
      filteredCount: features.length,
      unfilteredCount: dataset.features.length,
    },
    features,
  };
};

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

  const s3Url = getConfiguredS3Url();
  if (!s3Url || !isValidHttpUrl(s3Url)) {
    return res.status(503).json({ error: 'AI data centers dataset is not configured.' });
  }

  const now = Date.now();
  if (cache && now - cache.timestamp < CACHE_TTL) {
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json(applyQueryFilters(cache.data, req));
  }

  try {
    const response = await fetch(s3Url, {
      headers: {
        Accept: 'application/geo+json, application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: text || 'Failed to fetch AI data centers from S3.',
      });
    }

    const data = (await response.json()) as GeoJsonFeatureCollection;
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      return res.status(502).json({ error: 'AI data centers dataset is not valid GeoJSON.' });
    }

    cache = { data, timestamp: now };

    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json(applyQueryFilters(data, req));
  } catch (error) {
    console.error('Error fetching AI data centers from S3:', error);
    return res.status(500).json({ error: 'Failed to fetch AI data centers from S3.' });
  }
}
