const getStore = () => {
  if (!global.__heliosRateLimiterStore) {
    global.__heliosRateLimiterStore = new Map();
  }
  return global.__heliosRateLimiterStore;
};

const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
    return forwardedFor.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim().length > 0) {
    return realIp.trim();
  }
  return req.socket.remoteAddress || 'unknown';
};

export const applyRateLimit = (req, res, options) => {
  const now = Date.now();
  const windowStart = now - options.windowMs;
  const ip = getClientIp(req);
  const key = `${options.key}:${ip}`;
  const store = getStore();

  const existing = store.get(key) || [];
  const recent = existing.filter((timestamp) => timestamp > windowStart);

  if (recent.length >= options.maxRequests) {
    const oldest = recent[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
    res.setHeader('Retry-After', retryAfterSeconds.toString());
    res.status(429).json({ error: 'Too Many Requests' });
    return false;
  }

  recent.push(now);
  store.set(key, recent);
  return true;
};
