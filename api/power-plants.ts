import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_lib/auth.js';
import { applyCors, handleCorsPreflight } from './_lib/cors.js';
import { applyRateLimit } from './_lib/rateLimit.js';
import {
  applyPlantFilters,
  getUnifiedPowerPlantDataset,
  paginatePowerPlants,
  parsePlantQuery,
} from './_lib/powerPlantsData.js';

const RATE_LIMIT = {
  key: 'power-plants',
  maxRequests: 10,
  windowMs: 60 * 1000,
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

  const { filters, pagination, error } = parsePlantQuery(
    req.query as Record<string, string | string[] | undefined>
  );

  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const dataset = await getUnifiedPowerPlantDataset();
    const filtered = applyPlantFilters(dataset, filters);
    const response = paginatePowerPlants(filtered, pagination);

    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).json(response);
  } catch (routeError) {
    console.error('Error loading power plant dataset:', routeError);
    return res.status(500).json({ error: 'Failed to load power plants' });
  }
}
