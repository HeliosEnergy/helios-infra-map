import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, handleCorsPreflight } from './_lib/cors.js';
import { applyRateLimit } from './_lib/rateLimit.js';
import { setAccessRequestStatus } from './_lib/accessControl.js';

const DECISION_RATE_LIMIT = {
  key: 'access-decision',
  maxRequests: 30,
  windowMs: 60 * 1000,
};

const page = (title: string, message: string) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; background: #0b1220; color: #e2e8f0; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
      .card { width:min(92vw,560px); background:#111a2e; border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:24px; box-shadow:0 14px 40px rgba(0,0,0,0.35); }
      h1 { margin:0 0 12px; font-size:22px; }
      p { margin:0; line-height:1.5; opacity:0.92; }
    </style>
  </head>
  <body><div class="card"><h1>${title}</h1><p>${message}</p></div></body>
</html>`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCorsPreflight(req, res)) return;
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
  if (!applyRateLimit(req, res, DECISION_RATE_LIMIT)) return;

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const action = typeof req.query.action === 'string' ? req.query.action : '';
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token || (action !== 'approve' && action !== 'reject')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send(page('Invalid Link', 'This approval link is invalid.'));
  }

  const status = action === 'approve' ? 'approved' : 'rejected';

  try {
    const result = await setAccessRequestStatus({ token, status });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!result.ok) {
      if (result.reason === 'expired') {
        return res.status(410).send(page('Link Expired', 'This decision link expired. Ask the requester to submit again.'));
      }
      if (result.reason === 'already_processed') {
        return res.status(200).send(page('Already Processed', `This request is already ${result.request?.status || 'processed'}.`));
      }
      return res.status(404).send(page('Not Found', 'Request not found for this link.'));
    }

    return res.status(200).send(
      page(
        status === 'approved' ? 'Access Approved' : 'Access Rejected',
        `Request for ${result.request?.email || 'user'} has been ${status}.`
      )
    );
  } catch (error) {
    console.error('Error processing access decision:', error);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(page('Server Error', 'Could not process this request right now.'));
  }
}

