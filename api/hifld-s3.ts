import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_lib/auth.js';
import { applyCors, handleCorsPreflight } from './_lib/cors.js';
import { applyRateLimit } from './_lib/rateLimit.js';

const RATE_LIMIT = {
  key: 'hifld-s3',
  maxRequests: 10,
  windowMs: 60 * 1000,
};

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

let cache: { data: any[]; timestamp: number } | null = null;

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const sanitizeLine = (line: any, index: number) => {
  const sourceProps = line?.properties ?? {};
  const id = String(line?.id ?? sourceProps.id ?? sourceProps.ID ?? sourceProps.OBJECTID ?? `hifld_${index}`);

  return {
    id,
    coordinates: Array.isArray(line?.coordinates) ? line.coordinates : [],
    properties: {
      id: sourceProps.id ?? sourceProps.ID,
      objectId: toNumber(sourceProps.objectId ?? sourceProps.OBJECTID),
      type: sourceProps.type ?? sourceProps.TYPE,
      status: sourceProps.status ?? sourceProps.STATUS,
      owner: sourceProps.owner ?? sourceProps.OWNER,
      voltage: toNumber(sourceProps.voltage ?? sourceProps.VOLTAGE),
      voltClass: sourceProps.voltClass ?? sourceProps.VOLT_CLASS,
      sub1: sourceProps.sub1 ?? sourceProps.SUB_1,
      sub2: sourceProps.sub2 ?? sourceProps.SUB_2,
    },
  };
};

const sanitizePayload = (payload: unknown): any[] => {
  if (!Array.isArray(payload)) return [];
  return payload.map(sanitizeLine);
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

  const now = Date.now();
  if (cache && now - cache.timestamp < CACHE_TTL) {
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json(cache.data);
  }

  const s3Url = process.env.HIFLD_S3_URL;
  if (!s3Url) {
    return res.status(500).json({ error: 'HIFLD_S3_URL is not configured' });
  }

  try {
    const response = await fetch(s3Url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch data from S3: ${response.status} ${response.statusText}`);
    }

    const raw = await response.json();
    const data = sanitizePayload(raw);

    cache = {
      data,
      timestamp: now,
    };

    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching HIFLD data from S3:', error);
    return res.status(500).json({ error: 'Failed to fetch HIFLD data from S3' });
  }
}
