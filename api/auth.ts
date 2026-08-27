import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getBearerToken,
  isHeliosEmailLoginValid,
  isAuthConfigured,
  issueAuthToken,
  verifyAuthToken,
} from './_lib/auth.js';
import { applyCors, handleCorsPreflight } from './_lib/cors.js';
import { applyRateLimit } from './_lib/rateLimit.js';
import { validateApprovedUserLogin } from './_lib/accessControl.js';
import { recordMapLoginSuccess } from './_lib/usageTracking.js';

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

  if (req.method === 'GET') {
    if (!isAuthConfigured()) {
      return res.status(503).json({
        error: 'Server auth is not configured.',
      });
    }

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
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  let tokenSubject = 'helios-user';
  let authMethod = 'approved_access';

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  if (isHeliosEmailLoginValid(email, password.trim())) {
    tokenSubject = email;
    authMethod = 'helios_domain';
  } else {
    try {
      const loginResult = await validateApprovedUserLogin({
        email,
        password: password.trim(),
      });
      if (!loginResult.ok) {
        if (loginResult.reason === 'pending') {
          return res.status(403).json({ error: 'Access request is pending approval.' });
        }
        if (loginResult.reason === 'rejected') {
          return res.status(403).json({ error: 'Your access request was rejected.' });
        }
        if (loginResult.reason === 'access_expired') {
          return res.status(403).json({ error: 'Access expired. Please request access again.' });
        }
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
      tokenSubject = email;
    } catch (error) {
      console.error('Email auth failed:', error);
      return res.status(500).json({ error: 'Unable to validate access right now.' });
    }
  }

  const { token, expiresAt } = issueAuthToken(undefined, tokenSubject);
  try {
    await recordMapLoginSuccess({ email: tokenSubject, req, authMethod });
  } catch (error) {
    console.warn('Failed to record map login usage:', error);
  }

  return res.status(200).json({
    token,
    expiresAt,
    email: tokenSubject !== 'helios-user' ? tokenSubject : undefined,
  });
}
