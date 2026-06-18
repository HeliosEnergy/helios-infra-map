import crypto from 'crypto';

const ACCESS_WINDOW_DAYS = Number(process.env.ACCESS_REQUEST_WINDOW_DAYS || '7');
const DECISION_TOKEN_TTL_HOURS = Number(process.env.ACCESS_DECISION_TOKEN_TTL_HOURS || '72');

const getSupabaseUrl = () => process.env.SUPABASE_URL || '';
const getSupabaseServiceRoleKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const assertSupabaseConfigured = () => {
  if (!getSupabaseUrl() || !getSupabaseServiceRoleKey()) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
};

const buildSupabaseUrl = (path, query = '') => `${getSupabaseUrl()}/rest/v1/${path}${query ? `?${query}` : ''}`;

export const supabaseFetch = async (path, { method = 'GET', query = '', body } = {}) => {
  assertSupabaseConfigured();
  const response = await fetch(buildSupabaseUrl(path, query), {
    method,
    headers: {
      apikey: getSupabaseServiceRoleKey(),
      Authorization: `Bearer ${getSupabaseServiceRoleKey()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${text}`);
  }

  if (response.status === 204) return null;
  return response.json();
};

const nowIso = () => new Date().toISOString();

const addDaysIso = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

const addHoursIso = (hours) => {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString();
};

export const normalizeEmail = (email) => email.trim().toLowerCase();

export const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

export const verifyPasswordHash = (password, storedHash) => {
  const [salt, hash] = String(storedHash || '').split(':');
  if (!salt || !hash) return false;
  const computed = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(computed, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

export const createDecisionToken = () => crypto.randomBytes(24).toString('hex');

export const getRequestByEmail = async (email) => {
  const normalized = normalizeEmail(email);
  const rows =
    (await supabaseFetch(
      'access_requests',
      {
        query: `select=*&email=eq.${encodeURIComponent(normalized)}&limit=1`,
      }
    )) || [];
  return rows[0] || null;
};

export const getRequestByDecisionToken = async (token) => {
  const rows =
    (await supabaseFetch(
      'access_requests',
      {
        query: `select=*&decision_token=eq.${encodeURIComponent(token)}&limit=1`,
      }
    )) || [];
  return rows[0] || null;
};

export const upsertPendingAccessRequest = async ({ email, passwordHash }) => {
  const normalizedEmail = normalizeEmail(email);
  const existing = await getRequestByEmail(normalizedEmail);
  const decisionToken = createDecisionToken();
  const payload = {
    email: normalizedEmail,
    password_hash: passwordHash,
    status: 'pending',
    decision_token: decisionToken,
    decision_token_expires_at: addHoursIso(DECISION_TOKEN_TTL_HOURS),
    access_expires_at: addDaysIso(ACCESS_WINDOW_DAYS),
    requested_at: nowIso(),
    approved_at: null,
    rejected_at: null,
    updated_at: nowIso(),
  };

  if (existing) {
    const rows = await supabaseFetch('access_requests', {
      method: 'PATCH',
      query: `email=eq.${encodeURIComponent(normalizedEmail)}`,
      body: payload,
    });
    return rows?.[0] || { ...existing, ...payload };
  }

  const rows = await supabaseFetch('access_requests', {
    method: 'POST',
    body: payload,
  });
  return rows?.[0] || payload;
};

export const setAccessRequestStatus = async ({ token, status }) => {
  const request = await getRequestByDecisionToken(token);
  if (!request) return { ok: false, reason: 'not_found' };

  const expiresAt = request.decision_token_expires_at ? new Date(request.decision_token_expires_at).getTime() : 0;
  if (!expiresAt || Date.now() > expiresAt) return { ok: false, reason: 'expired' };

  if (request.status !== 'pending') return { ok: false, reason: 'already_processed', request };

  const patch = {
    status,
    approved_at: status === 'approved' ? nowIso() : null,
    rejected_at: status === 'rejected' ? nowIso() : null,
    updated_at: nowIso(),
    decision_token: null,
    decision_token_expires_at: null,
  };

  const rows = await supabaseFetch('access_requests', {
    method: 'PATCH',
    query: `id=eq.${encodeURIComponent(String(request.id))}`,
    body: patch,
  });

  return { ok: true, request: rows?.[0] || { ...request, ...patch } };
};

export const validateApprovedUserLogin = async ({ email, password }) => {
  const request = await getRequestByEmail(email);
  if (!request) return { ok: false, reason: 'not_found' };

  if (request.status !== 'approved') return { ok: false, reason: request.status || 'not_approved' };

  const accessExpiresAt = request.access_expires_at ? new Date(request.access_expires_at).getTime() : 0;
  if (!accessExpiresAt || Date.now() > accessExpiresAt) return { ok: false, reason: 'access_expired' };

  if (!verifyPasswordHash(password, request.password_hash)) return { ok: false, reason: 'invalid_password' };

  return { ok: true, request };
};

export const getAdminEmails = () =>
  (process.env.ACCESS_ADMIN_EMAILS || process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const getBaseAppUrl = (req) => {
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  if (!host) return 'http://localhost:3000';
  return `${proto}://${host}`.replace(/\/$/, '');
};

export const sendAccessRequestEmail = async ({ to, requesterEmail, approveUrl, rejectUrl }) => {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) throw new Error('RESEND_API_KEY is missing.');

  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5">
      <h2>InfraMap access request</h2>
      <p><strong>${requesterEmail}</strong> requested temporary access.</p>
      <p>
        <a href="${approveUrl}" style="padding:8px 14px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;margin-right:8px;">Approve</a>
        <a href="${rejectUrl}" style="padding:8px 14px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px;">Reject</a>
      </p>
      <p>Decision link expires in ${DECISION_TOKEN_TTL_HOURS} hours.</p>
    </div>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject: `Access request: ${requesterEmail}`,
      html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to send email via Resend (${response.status}): ${text}`);
  }
};

