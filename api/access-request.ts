import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, handleCorsPreflight } from './_lib/cors.js';
import { applyRateLimit } from './_lib/rateLimit.js';
import {
  getAdminEmails,
  getBaseAppUrl,
  isEmailAllowed,
  normalizeEmail,
  sendAccessRequestEmail,
  upsertPendingAccessRequest,
} from './_lib/accessControl.js';

const REQUEST_RATE_LIMIT = {
  key: 'access-request',
  maxRequests: 10,
  windowMs: 60 * 1000,
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCorsPreflight(req, res)) return;
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
  if (!applyRateLimit(req, res, REQUEST_RATE_LIMIT)) return;

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = parseBody(req);
  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const company = typeof body.company === 'string' ? body.company.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  if (await isEmailAllowed(email)) {
    return res.status(200).json({ ok: true, message: 'This email is already approved. You can create an account.' });
  }

  const admins = getAdminEmails();
  if (admins.length === 0) {
    return res.status(503).json({ error: 'Admin approval email is not configured.' });
  }

  try {
    const request = await upsertPendingAccessRequest({ email, name, company, reason });
    const baseUrl = getBaseAppUrl(req);
    const approveUrl = `${baseUrl}/api/access-decision?action=approve&token=${encodeURIComponent(
      String(request.decision_token)
    )}`;
    const rejectUrl = `${baseUrl}/api/access-decision?action=reject&token=${encodeURIComponent(
      String(request.decision_token)
    )}`;

    await sendAccessRequestEmail({
      to: admins,
      requesterEmail: email,
      requesterName: name,
      company,
      reason,
      approveUrl,
      rejectUrl,
    });

    return res.status(200).json({ ok: true, message: 'Access request submitted for approval.' });
  } catch (error) {
    console.error('Error creating access request:', error);
    return res.status(500).json({ error: 'Failed to submit access request.' });
  }
}
