import { createRemoteJWKSet, jwtVerify } from 'jose';
import { db } from './db';

const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
const authBaseUrl = process.env.NEON_AUTH_BASE_URL;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let issuer: string | null = null;

if (jwksUrl && authBaseUrl) {
  try {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
    issuer = new URL(authBaseUrl).origin;
  } catch (err) {
    console.warn('Failed to initialize Neon JWKS in inventory-service:', err);
  }
}

/**
 * Admin auth: only a verified Neon Auth JWT can act as an admin.
 *
 * Hardcoded credentials are gone. An admin identity is either:
 *  1. a Neon JWT whose `sub` matches an active row in `inventory_admins`, or
 *  2. a Neon JWT whose verified `role` payload is `admin`/`superadmin`.
 *
 * There is no fallback token, no custom header bypass, and no hardcoded admin
 * user. If the JWT cannot be verified, or no allow-listed admin role exists in
 * the payload, this returns `null` and the caller returns 401/403.
 */
export async function getAdminUserId(request: Request): Promise<string | null> {
  const authorization = request.headers.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice(7);

  if (!jwks || !issuer) {
    // No Neon JWKS configured: there is nothing we can verify, so deny access.
    // Deployment must set NEON_AUTH_JWKS_URL and NEON_AUTH_BASE_URL.
    return null;
  }

  let payload: unknown;
  try {
    const { payload: p } = await jwtVerify(token, jwks, { issuer });
    payload = p;
  } catch {
    return null;
  }

  const sub = (payload as { sub?: unknown }).sub;
  const role = (payload as { role?: unknown }).role;

  if (typeof sub !== 'string' || sub.length === 0) {
    return null;
  }

  // If the token payload declares an explicit admin role, it is sufficient for
  // the caller to check the DB allow-list before returning it.
  if (typeof role === 'string') {
    const normalized = role.toLowerCase();
    if (normalized === 'admin' || normalized === 'superadmin') {
      return sub;
    }
    return null;
  }

  // Otherwise, require a matching allow-listed admin identity in the DB.
  try {
    const result = await db.query<{ auth_user_id: string }>(
      `SELECT auth_user_id FROM inventory_admins
       WHERE auth_user_id = $1 AND revoked_at IS NULL`,
      [sub],
    );
    if (result.rowCount) return sub;
  } catch {
    // If the table does not exist or the database is starting up, fail closed.
  }

  return null;
}
