import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, handleCorsPreflight } from './_lib/cors.js';
import { applyRateLimit } from './_lib/rateLimit.js';

const DECISION_RATE_LIMIT = {
  key: 'access-decision',
  maxRequests: 30,
  windowMs: 60 * 1000,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCorsPreflight(req, res)) return;
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
  if (!applyRateLimit(req, res, DECISION_RATE_LIMIT)) return;

  return res.status(410).send('Access decisions are disabled. Manage portal access with ALLOWED_AUTH_EMAILS.');
}
