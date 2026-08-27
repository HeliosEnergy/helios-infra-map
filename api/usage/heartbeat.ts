import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_lib/auth.js';
import { applyCors, handleCorsPreflight } from '../_lib/cors.js';
import { applyRateLimit } from '../_lib/rateLimit.js';
import { getTrackableEmail, touchMapUserActivity } from '../_lib/usageTracking.js';

const RATE_LIMIT = {
  key: 'usage-heartbeat',
  maxRequests: 60,
  windowMs: 60 * 1000,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCorsPreflight(req, res)) return;
  if (!applyCors(req, res)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  if (!applyRateLimit(req, res, RATE_LIMIT)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireAuth(req, res);
  if (!session) return;

  const email = getTrackableEmail(session.sub);
  if (!email) {
    return res.status(400).json({ error: 'Email-authenticated session is required for usage tracking.' });
  }

  try {
    await touchMapUserActivity({ email, req });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Failed to record usage heartbeat:', error);
    return res.status(500).json({ error: 'Failed to record usage heartbeat.' });
  }
}
