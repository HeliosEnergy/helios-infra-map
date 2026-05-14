import crypto from 'crypto';
import { getAllowedAuthEmails, isEmailAllowed, normalizeEmail, pool } from './betterAuth.js';

const DECISION_TOKEN_TTL_HOURS = Number(process.env.ACCESS_DECISION_TOKEN_TTL_HOURS || '72');

const addHoursIso = (hours) => {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
};

export { getAllowedAuthEmails, isEmailAllowed, normalizeEmail };

export const createDecisionToken = () => crypto.randomBytes(32).toString('hex');

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const getAdminEmails = () =>
  (process.env.ACCESS_ADMIN_EMAILS || process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const getBaseAppUrl = (req) => {
  const configured = process.env.APP_BASE_URL || process.env.BETTER_AUTH_URL;
  if (configured) return configured.replace(/\/$/, '');

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  if (!host) return 'http://localhost:5173';
  return `${proto}://${host}`.replace(/\/$/, '');
};

export const upsertPendingAccessRequest = async ({ email, name, company, reason }) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing.');
  }

  const normalizedEmail = normalizeEmail(email);
  const decisionToken = createDecisionToken();
  const decisionTokenExpiresAt = addHoursIso(DECISION_TOKEN_TTL_HOURS);

  const result = await pool.query(
    `
      insert into access_requests (
        email,
        name,
        company,
        reason,
        status,
        decision_token,
        decision_token_expires_at,
        requested_at,
        updated_at
      )
      values ($1, $2, $3, $4, 'pending', $5, $6, now(), now())
      on conflict (email)
      do update set
        name = excluded.name,
        company = excluded.company,
        reason = excluded.reason,
        status = 'pending',
        decision_token = excluded.decision_token,
        decision_token_expires_at = excluded.decision_token_expires_at,
        decided_at = null,
        decided_by = null,
        updated_at = now()
      returning *
    `,
    [
      normalizedEmail,
      name?.trim() || null,
      company?.trim() || null,
      reason?.trim() || null,
      decisionToken,
      decisionTokenExpiresAt,
    ]
  );

  return result.rows[0];
};

export const setAccessRequestStatus = async ({ token, status, decidedBy }) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing.');
  }

  const requestResult = await pool.query('select * from access_requests where decision_token = $1 limit 1', [token]);
  const request = requestResult.rows[0];
  if (!request) return { ok: false, reason: 'not_found' };

  const expiresAt = request.decision_token_expires_at ? new Date(request.decision_token_expires_at).getTime() : 0;
  if (!expiresAt || Date.now() > expiresAt) return { ok: false, reason: 'expired', request };
  if (request.status !== 'pending') return { ok: false, reason: 'already_processed', request };

  const result = await pool.query(
    `
      update access_requests
      set
        status = $2,
        decision_token = null,
        decision_token_expires_at = null,
        decided_at = now(),
        decided_by = $3,
        updated_at = now()
      where id = $1
      returning *
    `,
    [request.id, status, decidedBy || null]
  );
  const updatedRequest = result.rows[0];

  if (status === 'approved') {
    await pool.query(
      `
        insert into allowed_auth_emails (email, approved_by, approved_at)
        values ($1, $2, now())
        on conflict (email)
        do update set
          approved_by = excluded.approved_by,
          approved_at = now(),
          revoked_at = null
      `,
      [request.email, decidedBy || null]
    );
  }

  return { ok: true, request: updatedRequest };
};

export const sendAccessRequestEmail = async ({ to, requesterEmail, requesterName, company, reason, approveUrl, rejectUrl }) => {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) throw new Error('RESEND_API_KEY is missing.');

  const from = process.env.RESEND_FROM || 'info@helios.co';
  const details = [
    requesterName ? `<p><strong>Name:</strong> ${escapeHtml(requesterName)}</p>` : '',
    company ? `<p><strong>Company:</strong> ${escapeHtml(company)}</p>` : '',
    reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : '',
  ].join('');
  const safeRequesterEmail = escapeHtml(requesterEmail);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject: `Infra map access request: ${requesterEmail}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5">
          <h2>Infra map access request</h2>
          <p><strong>${safeRequesterEmail}</strong> requested access.</p>
          ${details}
          <p>
            <a href="${approveUrl}" style="padding:8px 14px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;margin-right:8px;">Approve</a>
            <a href="${rejectUrl}" style="padding:8px 14px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px;">Reject</a>
          </p>
          <p>Decision link expires in ${DECISION_TOKEN_TTL_HOURS} hours.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to send email via Resend (${response.status}): ${text}`);
  }
};
