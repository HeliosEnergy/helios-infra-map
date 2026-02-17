import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../../../_lib/auth.js';
import { applyCors, handleCorsPreflight } from '../../../../_lib/cors.js';
import { applyRateLimit } from '../../../../_lib/rateLimit.js';
import { proxyVectorTile } from '../../../../_lib/vectorTileProxy.js';

const RATE_LIMIT = {
  key: 'vector-fiber',
  maxRequests: 30,
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

  const baseUrl = process.env.FIBER_MVT_BASE_URL;
  if (!baseUrl) {
    return res.status(500).json({ error: 'FIBER_MVT_BASE_URL is not configured' });
  }

  await proxyVectorTile(req, res, baseUrl);
}
