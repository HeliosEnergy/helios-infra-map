const DEFAULT_ALLOWED_METHODS = 'GET,POST,OPTIONS';
const DEFAULT_ALLOWED_HEADERS = 'Content-Type, Authorization';

const parseAllowedOrigins = () =>
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const isLocalhostOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

const doesOriginMatchRule = (origin, rule) => {
  if (rule === origin) return true;
  if (!rule.includes('*')) return false;

  const escaped = rule
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const matcher = new RegExp(`^${escaped}$`);
  return matcher.test(origin);
};

export const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (isLocalhostOrigin(origin)) return true;
  const allowedOrigins = parseAllowedOrigins();
  return allowedOrigins.some((rule) => doesOriginMatchRule(origin, rule));
};

const isSameOriginRequest = (req, origin) => {
  if (!origin) return true;

  try {
    const parsedOrigin = new URL(origin);
    const forwardedHost = req.headers['x-forwarded-host'];
    const rawHost = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.headers.host;
    if (!rawHost) return false;

    if (parsedOrigin.host !== rawHost) return false;

    const forwardedProto = req.headers['x-forwarded-proto'];
    const rawProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    if (!rawProto) return true;

    return parsedOrigin.protocol.replace(':', '') === rawProto;
  } catch {
    return false;
  }
};

export const applyCors = (req, res) => {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', DEFAULT_ALLOWED_METHODS);
  res.setHeader('Access-Control-Allow-Headers', DEFAULT_ALLOWED_HEADERS);

  if (!isOriginAllowed(origin) && !isSameOriginRequest(req, origin)) {
    return false;
  }

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  return true;
};

export const handleCorsPreflight = (req, res) => {
  if (req.method !== 'OPTIONS') return false;
  if (!applyCors(req, res)) {
    res.status(403).json({ error: 'Origin not allowed' });
    return true;
  }
  res.status(200).end();
  return true;
};
