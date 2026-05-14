import { auth, isBetterAuthConfigured, isEmailAllowed } from './betterAuth.js';

const headersFromRequest = (req) => {
  const headers = new Headers();
  for (const [key, rawValue] of Object.entries(req.headers || {})) {
    if (Array.isArray(rawValue)) {
      headers.set(key, rawValue.join(', '));
    } else if (rawValue !== undefined) {
      headers.set(key, String(rawValue));
    }
  }
  return headers;
};

export const isAuthConfigured = isBetterAuthConfigured;

export const requireAuth = async (req, res) => {
  if (!isBetterAuthConfigured()) {
    res.status(503).json({ error: 'Server auth is not configured.' });
    return null;
  }

  const session = await auth.api.getSession({
    headers: headersFromRequest(req),
  });
  if (!session?.user?.email || !isEmailAllowed(session.user.email)) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  return session;
};
