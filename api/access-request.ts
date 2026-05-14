import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, handleCorsPreflight } from './_lib/cors.js';
import { applyRateLimit } from './_lib/rateLimit.js';

const REQUEST_RATE_LIMIT = {
  key: 'access-request',
  maxRequests: 10,
  windowMs: 60 * 1000,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCorsPreflight(req, res)) return;
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
  if (!applyRateLimit(req, res, REQUEST_RATE_LIMIT)) return;

  return res.status(410).json({
    error: 'Access requests are disabled. Ask an admin to add your email to ALLOWED_AUTH_EMAILS.',
  });
}
