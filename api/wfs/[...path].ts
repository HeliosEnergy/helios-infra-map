import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_lib/auth.js';
import { applyCors, handleCorsPreflight } from '../_lib/cors.js';
import { applyRateLimit } from '../_lib/rateLimit.js';

const RATE_LIMIT = {
  key: 'wfs',
  maxRequests: 10,
  windowMs: 60 * 1000,
};

const ITU_BASE_URL = 'https://bbmaps.itu.int/geoserver/itu-geocatalogue/ows';

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

  try {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'path') continue;
      if (Array.isArray(value)) {
        for (const item of value) query.append(key, String(item));
      } else if (value !== undefined) {
        query.append(key, String(value));
      }
    }

    const ituUrl = `${ITU_BASE_URL}?${query.toString()}`;
    const response = await fetch(ituUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mapping-Infra-App/1.0',
        Accept: 'application/json,*/*',
      },
    });

    const data = await response.text();
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    } else {
      res.setHeader('Content-Type', 'application/json');
    }

    return res.status(response.status).send(data);
  } catch (error) {
    console.error('WFS Proxy Error:', error);
    return res.status(500).json({ error: 'Failed to fetch data from ITU service' });
  }
}
