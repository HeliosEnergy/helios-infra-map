import type { VercelRequest, VercelResponse } from '@vercel/node';

// Simple in-memory cache (CSV text)
let cache: { data: string; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check cache
  const now = Date.now();
  if (cache && now - cache.timestamp < CACHE_TTL) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return res.status(200).send(cache.data);
  }

  try {
    const s3Url = process.env.US_EIA_PLANTS_CSV_S3_URL;
    if (!s3Url) {
      return res.status(500).json({
        error: 'Missing env var US_EIA_PLANTS_CSV_S3_URL'
      });
    }

    const response = await fetch(s3Url);
    if (!response.ok) {
      throw new Error(`Failed to fetch US EIA plants CSV: ${response.statusText} (${response.status})`);
    }

    const csvText = await response.text();

    cache = { data: csvText, timestamp: now };

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');

    return res.status(200).send(csvText);
  } catch (error) {
    console.error('Error fetching US EIA plants CSV:', error);
    return res.status(500).json({ error: 'Failed to fetch US EIA plants CSV' });
  }
}

