import { VercelRequest, VercelResponse } from '@vercel/node';

// Simple in-memory cache
let cache: { data: any; timestamp: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour (HIFLD data doesn't change often)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Check if we have valid cached data
  const now = Date.now();
  if (cache && (now - cache.timestamp) < CACHE_TTL) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    return res.status(200).json(cache.data);
  }

  try {
    // Fetch data from S3 using environment variable
    const s3Url = process.env.HIFLD_S3_URL || 'https://helios-dataanalysisbucket.s3.us-east-1.amazonaws.com/hifld_transmission_lines.json';
    const response = await fetch(s3Url, {
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch data from S3: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Update cache
    cache = {
      data: data,
      timestamp: now
    };

    // Set response headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    // Send response
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching HIFLD data from S3:', error);
    return res.status(500).json({ error: 'Failed to fetch HIFLD data from S3' });
  }
}
