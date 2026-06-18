import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_lib/auth.js';
import { applyCors, handleCorsPreflight } from './_lib/cors.js';
import { applyRateLimit } from './_lib/rateLimit.js';
import { normalizeEmail, supabaseFetch } from './_lib/accessControl.js';

const RATE_LIMIT = {
  key: 'bookmarks',
  maxRequests: 120,
  windowMs: 60 * 1000,
};

type BookmarkPayload = {
  id?: unknown;
  name?: unknown;
  coordinates?: unknown;
  source?: unknown;
  outputDisplay?: unknown;
  country?: unknown;
};

const parseBody = (req: VercelRequest): Record<string, unknown> => {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof req.body === 'object') return req.body as Record<string, unknown>;
  return {};
};

const getUserEmail = (session: unknown): string | null => {
  const sub = (session as { sub?: unknown } | null)?.sub;
  if (typeof sub !== 'string') return null;

  const normalized = normalizeEmail(sub);
  if (!normalized || normalized === 'helios-user' || !normalized.includes('@')) {
    return null;
  }

  return normalized;
};

const toPlantId = (value: unknown): string => String(value || '').trim();

const toBookmarkResponse = (row: Record<string, unknown>) => ({
  id: String(row.plant_id || ''),
  name: String(row.name || ''),
  coordinates: row.coordinates,
  source: String(row.source || ''),
  outputDisplay: String(row.output_display || ''),
  country: String(row.country || ''),
});

const validateBookmarkPayload = (body: BookmarkPayload) => {
  const id = toPlantId(body.id);
  const name = String(body.name || '').trim();
  const coordinates = body.coordinates;

  if (!id || !name) {
    return { error: 'Bookmark requires plant id and name.' };
  }

  if (
    !Array.isArray(coordinates) ||
    coordinates.length !== 2 ||
    !coordinates.every((value) => typeof value === 'number' && Number.isFinite(value))
  ) {
    return { error: 'Bookmark requires valid [longitude, latitude] coordinates.' };
  }

  return {
    bookmark: {
      plant_id: id,
      name,
      coordinates,
      source: String(body.source || ''),
      output_display: String(body.outputDisplay || ''),
      country: String(body.country || ''),
      updated_at: new Date().toISOString(),
    },
  };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCorsPreflight(req, res)) return;
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
  if (!applyRateLimit(req, res, RATE_LIMIT)) return;

  const session = requireAuth(req, res);
  if (!session) return;

  const userEmail = getUserEmail(session);
  if (!userEmail) {
    return res.status(403).json({ error: 'Please sign in with approved email access to save bookmarks.' });
  }

  try {
    if (req.method === 'GET') {
      const rows =
        (await supabaseFetch('saved_power_plants', {
          query: `select=plant_id,name,coordinates,source,output_display,country,created_at&user_email=eq.${encodeURIComponent(
            userEmail
          )}&order=created_at.desc`,
        })) || [];

      return res.status(200).json({
        data: rows.map((row: Record<string, unknown>) => toBookmarkResponse(row)),
      });
    }

    if (req.method === 'POST') {
      const { bookmark, error } = validateBookmarkPayload(parseBody(req));
      if (error || !bookmark) return res.status(400).json({ error });

      const existing =
        (await supabaseFetch('saved_power_plants', {
          query: `select=id&user_email=eq.${encodeURIComponent(userEmail)}&plant_id=eq.${encodeURIComponent(
            bookmark.plant_id
          )}&limit=1`,
        })) || [];

      const payload = {
        ...bookmark,
        user_email: userEmail,
      };

      const rows = existing[0]?.id
        ? await supabaseFetch('saved_power_plants', {
            method: 'PATCH',
            query: `id=eq.${encodeURIComponent(String(existing[0].id))}`,
            body: payload,
          })
        : await supabaseFetch('saved_power_plants', {
            method: 'POST',
            body: payload,
          });

      return res.status(200).json({
        data: toBookmarkResponse((rows?.[0] || payload) as Record<string, unknown>),
      });
    }

    if (req.method === 'DELETE') {
      const plantId = toPlantId(req.query.plantId);
      const query = plantId
        ? `user_email=eq.${encodeURIComponent(userEmail)}&plant_id=eq.${encodeURIComponent(plantId)}`
        : `user_email=eq.${encodeURIComponent(userEmail)}`;

      await supabaseFetch('saved_power_plants', {
        method: 'DELETE',
        query,
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Bookmarks API error:', error);
    return res.status(500).json({
      error: 'Failed to sync saved power plants. Confirm the saved_power_plants table exists in Supabase.',
    });
  }
}
