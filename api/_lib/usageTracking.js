import crypto from 'crypto';
import { normalizeEmail, supabaseFetch } from './accessControl.js';

const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();

  return req.socket?.remoteAddress || '';
};

const hashIp = (req) => {
  const ip = getClientIp(req);
  const secret = process.env.USAGE_IP_HASH_SECRET || '';
  if (!ip || !secret) return null;
  return crypto.createHmac('sha256', secret).update(ip).digest('hex');
};

const getUserAgent = (req) => {
  const userAgent = req.headers['user-agent'];
  if (Array.isArray(userAgent)) return userAgent[0] || null;
  return typeof userAgent === 'string' && userAgent.trim() ? userAgent.slice(0, 500) : null;
};

export const getTrackableEmail = (subject) => {
  const email = normalizeEmail(String(subject || ''));
  if (!email || email === 'helios-user' || !email.includes('@')) return null;
  return email;
};

export const touchMapUserActivity = async ({ email, req, markLogin = false }) => {
  const normalizedEmail = getTrackableEmail(email);
  if (!normalizedEmail) return { tracked: false };

  const now = new Date().toISOString();
  const ipHash = hashIp(req);
  const userAgent = getUserAgent(req);
  const body = {
    email: normalizedEmail,
    last_seen_at: now,
    last_login_at: markLogin ? now : undefined,
    updated_at: now,
  };

  if (ipHash) {
    body.last_ip_hash = ipHash;
  }
  if (userAgent) {
    body.last_user_agent = userAgent;
  }

  await supabaseFetch('map_user_activity', {
    method: 'POST',
    query: 'on_conflict=email',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body,
  });

  return { tracked: true };
};

export const recordMapLoginSuccess = async ({ email, req, authMethod }) => {
  const normalizedEmail = getTrackableEmail(email);
  if (!normalizedEmail) return { tracked: false };

  await Promise.all([
    supabaseFetch('map_login_events', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        email: normalizedEmail,
        event_type: 'login_success',
        auth_method: authMethod || null,
        ip_hash: hashIp(req),
        user_agent: getUserAgent(req),
      },
    }),
    touchMapUserActivity({ email: normalizedEmail, req, markLogin: true }),
  ]);

  return { tracked: true };
};
