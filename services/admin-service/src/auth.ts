import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query as dbQuery } from './db';

/**
 * Admin identity is fully independent of the customer auth provider.
 *
 * The admin surface is a separate origin talking to a separate service, so a
 * customer session — or a compromised customer JWT — can never be replayed
 * here. There is no Neon Auth / customer-token path in this file by design.
 */

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export interface Session {
  token: string;
  adminId: string;
  email: string;
  name: string | null;
  role: string;
  expiresAt: Date;
}

const SESSION_COOKIE = 'admin_session';
const SESSION_TTL_HOURS = Number(process.env.ADMIN_SESSION_TTL_HOURS ?? 12);
const BCRYPT_ROUNDS = 12;

/** Only a hash of the token is stored, so a DB leak cannot be replayed as a session. */
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function ensureSchema(): Promise<void> {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email          text NOT NULL UNIQUE,
      password_hash  text NOT NULL,
      name           text,
      role           text NOT NULL DEFAULT 'admin',
      is_active      boolean NOT NULL DEFAULT true,
      created_at     timestamptz NOT NULL DEFAULT now(),
      last_login_at  timestamptz
    )
  `);

  // `CREATE TABLE IF NOT EXISTS` silently skips an existing table, so an
  // earlier version of this service would otherwise be left with missing
  // columns forever. Reconcile them explicitly — every statement is idempotent.
  await dbQuery(`
    ALTER TABLE admin_users
      ADD COLUMN IF NOT EXISTS is_active     boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS last_login_at  timestamptz,
      ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now()
  `);
  // Legacy rows predate is_active; normalise any NULLs before it is relied on.
  await dbQuery(`UPDATE admin_users SET is_active = true WHERE is_active IS NULL`);
  await dbQuery(`CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_key ON admin_users (lower(email))`);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash  text PRIMARY KEY,
      admin_id    uuid NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
      expires_at  timestamptz NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now(),
      user_agent  text
    )
  `);
  await dbQuery(`CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON admin_sessions (admin_id)`);
}

/**
 * Creates the first admin from env on an empty table.
 *
 * Refuses to invent a password: both variables must be present and at least 12
 * characters. Returns true when a user was created.
 */
export async function seedAdminFromEnv(): Promise<boolean> {
  const email = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD;

  const existing = await dbQuery('SELECT 1 FROM admin_users LIMIT 1');
  if (existing.rowCount) return false;

  if (!email || !password) {
    throw new Error(
      'No admin_users rows and ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD are not both set. ' +
        'Set them (password >= 12 chars) to create the first admin, or create a row manually.',
    );
  }
  if (password.length < 12) {
    throw new Error('ADMIN_SEED_PASSWORD must be at least 12 characters');
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await dbQuery(
    `INSERT INTO admin_users (email, password_hash, name, role) VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO NOTHING`,
    [email, hash, process.env.ADMIN_SEED_NAME ?? 'Admin'],
  );
  console.log(`[ADMIN] seeded initial admin ${email}`);
  return true;
}

export async function verifyCredentials(email: string, password: string): Promise<AdminUser | null> {
  const { rows } = await dbQuery<{
    id: string;
    email: string;
    password_hash: string;
    name: string | null;
    role: string;
  }>(
    `SELECT id, email, password_hash, name, role
       FROM admin_users
      WHERE lower(email) = lower($1) AND is_active = true`,
    [email.trim()],
  );

  const row = rows[0];
  // Always run a bcrypt comparison so a missing user and a wrong password take
  // the same amount of time and cannot be distinguished by response latency.
  const hash = row?.password_hash ?? '$2a$12$0000000000000000000000000000000000000000000000000000';
  const ok = await bcrypt.compare(password, hash);
  if (!row || !ok) return null;

  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export async function createSession(
  admin: AdminUser,
  userAgent?: string | null,
): Promise<Session> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);

  await dbQuery(
    `INSERT INTO admin_sessions (token_hash, admin_id, expires_at, user_agent)
     VALUES ($1, $2, $3, $4)`,
    [tokenHash(token), admin.id, expiresAt, userAgent?.slice(0, 300) ?? null],
  );
  await dbQuery(`UPDATE admin_users SET last_login_at = now() WHERE id = $1`, [admin.id]);

  return { token, adminId: admin.id, email: admin.email, name: admin.name, role: admin.role, expiresAt };
}

/** Resolves a session cookie to a live admin, or null if absent/expired/revoked. */
export async function resolveSession(token: string | null): Promise<Session | null> {
  if (!token) return null;

  const { rows } = await dbQuery<{
    token_hash: string;
    admin_id: string;
    expires_at: Date;
    email: string;
    name: string | null;
    role: string;
  }>(
    `SELECT s.token_hash, s.admin_id, s.expires_at, u.email, u.name, u.role
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.admin_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()
        AND u.is_active = true`,
    [tokenHash(token)],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    token,
    adminId: row.admin_id,
    email: row.email,
    name: row.name,
    role: row.role,
    expiresAt: row.expires_at,
  };
}

export async function destroySession(token: string | null): Promise<void> {
  if (!token) return;
  await dbQuery(`DELETE FROM admin_sessions WHERE token_hash = $1`, [tokenHash(token)]);
}

export async function destroyAllSessions(adminId: string): Promise<void> {
  await dbQuery(`DELETE FROM admin_sessions WHERE admin_id = $1`, [adminId]);
}

/** Drops expired rows. Cheap enough to call on boot. */
export async function pruneExpiredSessions(): Promise<void> {
  await dbQuery(`DELETE FROM admin_sessions WHERE expires_at <= now()`);
}

export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function sessionCookie(token: string, expiresAt: Date): string {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Expires=${expiresAt.toUTCString()}`,
  ];
  // Secure cookies break local http://admin dev, so it is opt-in via env.
  if (process.env.ADMIN_COOKIE_SECURE === 'true') attrs.push('Secure');
  return attrs.join('; ');
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}