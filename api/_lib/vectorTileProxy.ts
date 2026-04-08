import type { VercelRequest, VercelResponse } from '@vercel/node';

const getSingleQueryValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const parseTileCoordinate = (value: string | undefined, max: number): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 0 || parsed > max) return null;
  return parsed;
};

export const getTilePathParams = (
  req: VercelRequest
): { z: number; x: number; y: number } | { error: string } => {
  const z = parseTileCoordinate(getSingleQueryValue(req.query.z as string | string[] | undefined), 24);
  const x = parseTileCoordinate(getSingleQueryValue(req.query.x as string | string[] | undefined), 1 << 24);
  const y = parseTileCoordinate(getSingleQueryValue(req.query.y as string | string[] | undefined), 1 << 24);

  if (z === null || x === null || y === null) {
    return { error: 'Invalid tile coordinates' };
  }

  const maxXY = 1 << z;
  if (x >= maxXY || y >= maxXY) {
    return { error: 'Tile coordinate out of range for zoom level' };
  }

  return { z, x, y };
};

export const buildTileUrl = (baseUrl: string, z: number, x: number, y: number): string => {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (normalized.includes('{z}') || normalized.includes('{x}') || normalized.includes('{y}')) {
    return normalized
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
  }

  return `${normalized}/${z}/${x}/${y}.pbf`;
};

export const proxyVectorTile = async (
  req: VercelRequest,
  res: VercelResponse,
  baseUrl: string
): Promise<void> => {
  const params = getTilePathParams(req);
  if ('error' in params) {
    res.status(400).json({ error: params.error });
    return;
  }

  const upstreamUrl = buildTileUrl(baseUrl, params.z, params.x, params.y);

  try {
    const response = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/x-protobuf,application/vnd.mapbox-vector-tile',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        res.status(204).end();
        return;
      }

      const text = await response.text();
      res.status(response.status).send(text);
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/x-protobuf');

    const contentEncoding = response.headers.get('content-encoding');
    if (contentEncoding) {
      res.setHeader('Content-Encoding', contentEncoding);
    }

    const cacheControl = response.headers.get('cache-control') || 'private, max-age=300';
    res.setHeader('Cache-Control', cacheControl);

    const etag = response.headers.get('etag');
    if (etag) {
      res.setHeader('ETag', etag);
    }

    res.status(200).send(buffer);
  } catch (error) {
    console.error('Vector tile proxy failed:', error);
    res.status(500).json({ error: 'Failed to proxy vector tile' });
  }
};
