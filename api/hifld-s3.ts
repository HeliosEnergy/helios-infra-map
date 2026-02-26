import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_lib/auth.js';
import { applyCors, handleCorsPreflight } from './_lib/cors.js';
import { applyRateLimit } from './_lib/rateLimit.js';

const CACHE_TTL = 60 * 60 * 1000;
const RATE_LIMIT = {
  key: 'hifld-s3',
  maxRequests: 20,
  windowMs: 60 * 1000,
};

let cache: { data: unknown; timestamp: number } | null = null;

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

  const now = Date.now();
  if (cache && now - cache.timestamp < CACHE_TTL) {
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json(cache.data);
  }

  try {
    const s3Url =
      process.env.HIFLD_S3_URL ||
      'https://helios-dataanalysisbucket.s3.us-east-1.amazonaws.com/hifld_transmission_lines.json';

    const response = await fetch(s3Url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).send(text || 'Failed to fetch HIFLD data from S3');
    }

    const data = (await response.json()) as unknown;
    cache = { data, timestamp: now };

    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching HIFLD data from S3:', error);
    return res.status(500).json({ error: 'Failed to fetch HIFLD data from S3' });
  }
}
