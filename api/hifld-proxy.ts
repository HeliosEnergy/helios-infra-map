import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_lib/auth.js';
import { applyCors, handleCorsPreflight } from './_lib/cors.js';
import { applyRateLimit } from './_lib/rateLimit.js';

const RATE_LIMIT = {
  key: 'hifld-proxy',
  maxRequests: 10,
  windowMs: 60 * 1000,
};

const HIFLD_BASE_URL =
  'https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0/query';

const ALLOWED_FIELDS = ['VOLTAGE', 'VOLT_CLASS', 'OWNER', 'STATUS', 'TYPE', 'SUB_1', 'SUB_2', 'ID', 'OBJECTID'];

const getSingleValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const sanitizeGeoJson = (data: any): any => {
  if (!data || !Array.isArray(data.features)) return data;

  const features = data.features.map((feature: any) => {
    const sourceProps = feature?.properties ?? {};
    const properties: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
      if (sourceProps[field] !== undefined) {
        properties[field] = sourceProps[field];
      }
    }

    return {
      type: feature?.type || 'Feature',
      geometry: feature?.geometry,
      properties,
    };
  });

  return {
    ...data,
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

  const rawOffset = Number(getSingleValue(req.query.resultOffset as string | string[] | undefined) || '0');
  const rawLimit = Number(
    getSingleValue(req.query.resultRecordCount as string | string[] | undefined) || '2000'
  );
  const resultOffset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
  const resultRecordCount =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(2000, Math.floor(rawLimit)) : 2000;

  const query = new URLSearchParams({
    where: '1=1',
    outFields: ALLOWED_FIELDS.join(','),
    outSR: '4326',
    f: 'geojson',
    resultOffset: String(resultOffset),
    resultRecordCount: String(resultRecordCount),
  });

  const hifldUrl = `${HIFLD_BASE_URL}?${query.toString()}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch(hifldUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mapping-Infra-App/1.0',
        Accept: 'application/json,*/*',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).send(text);
    }

    const data = await response.json();
    const sanitized = sanitizeGeoJson(data);
    return res.status(200).json(sanitized);
  } catch (error) {
    console.error('HIFLD Proxy Error:', error);
    return res.status(500).json({ error: 'Failed to fetch data from HIFLD service' });
  }
}
