import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { Pool } from 'pg';

const splitCsv = (value) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export const getAllowedAuthEmails = () =>
  splitCsv(process.env.ALLOWED_AUTH_EMAILS).map((email) => normalizeEmail(email));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const isEmailAllowedByEnv = (email) => {
  const allowedEmails = getAllowedAuthEmails();
  if (allowedEmails.length === 0) return false;
  return allowedEmails.includes(normalizeEmail(email));
};

export const isEmailAllowedByDb = async (email) => {
  if (!process.env.DATABASE_URL) return false;

  const result = await pool.query(
    'select 1 from allowed_auth_emails where email = $1 and revoked_at is null limit 1',
    [normalizeEmail(email)]
  );
  return result.rowCount > 0;
};

export const isEmailAllowed = async (email) => isEmailAllowedByEnv(email) || (await isEmailAllowedByDb(email));

export const getTrustedOrigins = () => {
  const origins = [
    process.env.BETTER_AUTH_URL,
    process.env.APP_BASE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
    'http://localhost:3000',
    'http://localhost:5173',
    ...splitCsv(process.env.ALLOWED_ORIGINS),
  ];

  return Array.from(
    new Set(origins.map((origin) => String(origin || '').trim().replace(/\/$/, '')).filter(Boolean))
  );
};

export const isBetterAuthConfigured = () =>
  Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET);

const requireRuntimeAuthConfig = () => {
  if (!process.env.DATABASE_URL) {
    throw new APIError('SERVICE_UNAVAILABLE', {
      message: 'Server auth is not configured. Set DATABASE_URL.',
    });
  }
  if (!process.env.BETTER_AUTH_SECRET) {
    throw new APIError('SERVICE_UNAVAILABLE', {
      message: 'Server auth is not configured. Set BETTER_AUTH_SECRET.',
    });
  }
};

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET || 'missing-better-auth-secret',
  baseURL: process.env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  trustedOrigins: getTrustedOrigins(),
  emailAndPassword: {
    enabled: true,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!ctx.path.startsWith('/sign-in/email') && !ctx.path.startsWith('/sign-up/email')) {
        return;
      }

      requireRuntimeAuthConfig();

      const email = normalizeEmail(ctx.body?.email);
      if (!email || !(await isEmailAllowed(email))) {
        throw new APIError('UNAUTHORIZED', {
          message: 'This email is not approved for portal access.',
        });
      }
    }),
  },
});
