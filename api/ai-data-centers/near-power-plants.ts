import type { VercelRequest, VercelResponse } from '@vercel/node';
import RBush from 'rbush';
import { requireAuth } from '../_lib/auth.js';
import { applyCors, handleCorsPreflight } from '../_lib/cors.js';
import { applyRateLimit } from '../_lib/rateLimit.js';
import {
  applyPlantFilters,
  getSingleQueryValue,
  getUnifiedPowerPlantDataset,
  parsePlantQuery,
} from '../_lib/powerPlantsData.js';

const CACHE_TTL = 60 * 60 * 1000;
const MAX_RADIUS_MILES = 250;
const DEFAULT_RADIUS_MILES = 25;

const RATE_LIMIT = {
  key: 'ai-data-centers-near-power-plants',
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

type PowerPlant = {
  id: string;
  name: string;
  output: number;
  outputDisplay: string;
  source: string;
  coordinates: [number, number];
  country: string;
};

type IndexedPowerPlant = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  plant: PowerPlant;
};

let aiDataCenterCache: { data: GeoJsonFeatureCollection; timestamp: number } | null = null;

const getConfiguredS3Url = () => process.env.AI_DATA_CENTERS_S3_URL || '';

const isValidHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const clampRadius = (value: string | string[] | undefined) => {
  const parsed = Number(getSingleQueryValue(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RADIUS_MILES;
  return Math.min(MAX_RADIUS_MILES, Math.max(1, parsed));
};

const getPointCoordinates = (feature: GeoJsonFeature): [number, number] | null => {
  if (feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) return null;
  const [longitude, latitude] = feature.geometry.coordinates;
  if (typeof longitude !== 'number' || typeof latitude !== 'number') return null;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return [longitude, latitude];
};

const calculateDistanceMiles = (coord1: [number, number], coord2: [number, number]): number => {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  const earthRadiusMiles = 3958.8;
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return earthRadiusMiles * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const radiusBbox = ([longitude, latitude]: [number, number], radiusMiles: number) => {
  const deltaLat = radiusMiles / 69;
  const latRad = (latitude * Math.PI) / 180;
  const cosLat = Math.max(0.01, Math.abs(Math.cos(latRad)));
  const deltaLon = radiusMiles / (69 * cosLat);

  return {
    minX: Math.max(-180, longitude - deltaLon),
    minY: Math.max(-90, latitude - deltaLat),
    maxX: Math.min(180, longitude + deltaLon),
    maxY: Math.min(90, latitude + deltaLat),
  };
};

const buildPowerPlantIndex = (plants: PowerPlant[]) => {
  const index = new RBush<IndexedPowerPlant>();
  index.load(
    plants.map((plant) => {
      const [longitude, latitude] = plant.coordinates;
      return {
        minX: longitude,
        minY: latitude,
        maxX: longitude,
        maxY: latitude,
        plant,
      };
    })
  );
  return index;
};

const loadAIDataCenters = async (): Promise<GeoJsonFeatureCollection> => {
  const now = Date.now();
  if (aiDataCenterCache && now - aiDataCenterCache.timestamp < CACHE_TTL) {
    return aiDataCenterCache.data;
  }

  const s3Url = getConfiguredS3Url();
  if (!s3Url || !isValidHttpUrl(s3Url)) {
    throw new Error('AI data centers dataset is not configured.');
  }

  const response = await fetch(s3Url, {
    headers: {
      Accept: 'application/geo+json, application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to fetch AI data centers from S3 (${response.status}).`);
  }

  const data = (await response.json()) as GeoJsonFeatureCollection;
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('AI data centers dataset is not valid GeoJSON.');
  }

  aiDataCenterCache = { data, timestamp: now };
  return data;
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

  const radiusMiles = clampRadius(req.query.radiusMiles);
  const { filters, error } = parsePlantQuery(req.query as Record<string, string | string[] | undefined>);

  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const [aiDataset, powerPlantDataset] = await Promise.all([
      loadAIDataCenters(),
      getUnifiedPowerPlantDataset(),
    ]);
    const filteredPowerPlants = applyPlantFilters(powerPlantDataset, filters) as PowerPlant[];
    const powerPlantIndex = buildPowerPlantIndex(filteredPowerPlants);

    const features = aiDataset.features
      .map((feature) => {
        const coordinates = getPointCoordinates(feature);
        if (!coordinates) return null;

        const candidates = powerPlantIndex.search(radiusBbox(coordinates, radiusMiles));
        const nearby = candidates
          .map(({ plant }) => ({
            plant,
            distanceMiles: calculateDistanceMiles(coordinates, plant.coordinates),
          }))
          .filter((result) => result.distanceMiles <= radiusMiles)
          .sort((a, b) => a.distanceMiles - b.distanceMiles);

        if (nearby.length === 0) return null;

        const nearest = nearby[0];
        return {
          ...feature,
          properties: {
            ...(feature.properties || {}),
            nearbyPowerPlantCount: nearby.length,
            nearestPowerPlant: {
              id: nearest.plant.id,
              name: nearest.plant.name,
              distanceMiles: Number(nearest.distanceMiles.toFixed(2)),
              source: nearest.plant.source,
              outputDisplay: nearest.plant.outputDisplay,
              country: nearest.plant.country,
              coordinates: nearest.plant.coordinates,
            },
          },
        };
      })
      .filter((feature): feature is GeoJsonFeature => Boolean(feature));

    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json({
      ...aiDataset,
      metadata: {
        ...(aiDataset.metadata || {}),
        proximityMode: 'near-power-plants',
        proximityRadiusMiles: radiusMiles,
        filteredPowerPlantCount: filteredPowerPlants.length,
        filteredCount: features.length,
        unfilteredCount: aiDataset.features.length,
      },
      features,
    });
  } catch (routeError) {
    console.error('Error filtering AI data centers near power plants:', routeError);
    const message = routeError instanceof Error ? routeError.message : 'Failed to load nearby AI data centers.';
    return res.status(500).json({ error: message });
  }
}
