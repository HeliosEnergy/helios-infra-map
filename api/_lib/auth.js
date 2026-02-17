import crypto from 'crypto';

const DEFAULT_TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24h

const base64UrlEncode = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const base64UrlDecode = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64').toString('utf8');
};

const parsePasswordList = (raw) => {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
};

const getConfiguredPasswords = () =>
  parsePasswordList(process.env.APP_PASSWORDS || process.env.APP_PASSWORD || process.env.VITE_APP_PASSWORD);

const getJwtSecret = () =>
  process.env.AUTH_JWT_SECRET || process.env.APP_PASSWORD || process.env.VITE_APP_PASSWORD || '';

const timingSafeEqual = (a, b) => {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
};

export const isAuthConfigured = () => getConfiguredPasswords().length > 0 && getJwtSecret().length > 0;

export const isPasswordValid = (candidate) => {
  const passwords = getConfiguredPasswords();
  if (passwords.length === 0) return false;
  return passwords.some((password) => timingSafeEqual(password, candidate));
};

export const issueAuthToken = (ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS) => {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error('AUTH_JWT_SECRET (or APP_PASSWORD) is required to issue tokens.');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'helios-user',
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', secret).update(signingInput).digest();

  return {
    token: `${signingInput}.${base64UrlEncode(signature)}`,
    expiresAt: payload.exp * 1000,
  };
};

export const verifyAuthToken = (token) => {
  const secret = getJwtSecret();
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = base64UrlEncode(
    crypto.createHmac('sha256', secret).update(signingInput).digest()
  );
  if (!timingSafeEqual(expectedSignature, encodedSignature)) {
    return null;
  }

  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader));
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    if (payload.sub !== 'helios-user') return null;
    if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number') return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};

export const getBearerToken = (req) => {
  const authorization = req.headers.authorization;
  if (!authorization) return null;

  const [scheme, token] = authorization.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
  return token;
};

export const requireAuth = (req, res) => {
  if (!isAuthConfigured()) {
    res.status(503).json({ error: 'Server auth is not configured.' });
    return null;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  return payload;
};
