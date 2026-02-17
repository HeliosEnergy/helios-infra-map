import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getBearerToken,
  isAuthConfigured,
  isPasswordValid,
  issueAuthToken,
  verifyAuthToken,
} from './_lib/auth.js';
import { applyCors, handleCorsPreflight } from './_lib/cors.js';
import { applyRateLimit } from './_lib/rateLimit.js';

const AUTH_RATE_LIMIT = {
  key: 'auth',
  maxRequests: 20,
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
  if (typeof req.body === 'object') {
    return req.body as Record<string, unknown>;
  }
  return {};
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCorsPreflight(req, res)) return;
  if (!applyCors(req, res)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  if (!applyRateLimit(req, res, AUTH_RATE_LIMIT)) return;

  if (!isAuthConfigured()) {
    return res.status(503).json({
      error: 'Server auth is not configured. Set APP_PASSWORD (or APP_PASSWORDS) and AUTH_JWT_SECRET.',
    });
  }

  if (req.method === 'GET') {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(200).json({ authenticated: false });
    }

    const payload = verifyAuthToken(token);
    if (!payload) {
      return res.status(200).json({ authenticated: false });
    }

    return res.status(200).json({
      authenticated: true,
      expiresAt: payload.exp * 1000,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = parseBody(req);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!password || !isPasswordValid(password.trim())) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const { token, expiresAt } = issueAuthToken();
  return res.status(200).json({
    token,
    expiresAt,
  });
}
