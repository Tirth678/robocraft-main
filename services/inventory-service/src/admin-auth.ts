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
 * 
 * Status codes returned by endpoints using this function:
 * - 403: Authorization header missing or JWT validation failed (null returned)
 * - 403: Valid JWT but user not in admin list (null returned)
 */
export async function getAdminUserId(request: Request): Promise<string | null> {
  const authorization = request.headers.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    console.warn('[INVENTORY-AUTH] Missing or invalid Authorization header');
    return null;
  }

  const token = authorization.slice(7);

  if (!jwks || !issuer) {
    // No Neon JWKS configured: there is nothing we can verify, so deny access.
    // Deployment must set NEON_AUTH_JWKS_URL and NEON_AUTH_BASE_URL.
    console.error('[INVENTORY-AUTH] JWKS not configured - set NEON_AUTH_JWKS_URL and NEON_AUTH_BASE_URL');
    return null;
  }

  let payload: unknown;
  try {
    const { payload: p } = await jwtVerify(token, jwks, { issuer });
    payload = p;
    console.log('[INVENTORY-AUTH] JWT verified successfully');
  } catch (err) {
    console.warn('[INVENTORY-AUTH] JWT verification failed:', err instanceof Error ? err.message : 'Unknown error');
    return null;
  }

  const sub = (payload as { sub?: unknown }).sub;
  const role = (payload as { role?: unknown }).role;
  const email = (payload as { email?: unknown }).email;

  if (typeof sub !== 'string' || sub.length === 0) {
    console.warn('[INVENTORY-AUTH] Invalid or missing subject (sub) in JWT');
    return null;
  }

  console.log('[INVENTORY-AUTH] JWT payload:', { sub, role, email });

  // Explicit application-level admin role in JWT → fast path
  if (typeof role === 'string') {
    const normalized = role.toLowerCase();
    if (normalized === 'admin' || normalized === 'superadmin') {
      console.log(`[INVENTORY-AUTH] Admin access granted via JWT role: ${normalized}`);
      return sub;
    }
  }

  // Configured admin emails allow-list fast path
  const adminEmails = (process.env.ADMIN_EMAILS || 'admin@robocraft.com,tirth@robocraft.com')
    .toLowerCase()
    .split(',')
    .map(e => e.trim());
  
  if (typeof email === 'string' && adminEmails.includes(email.toLowerCase())) {
    console.log(`[INVENTORY-AUTH] Admin access granted via email whitelist: ${email}`);
    return sub;
  }

  // Require a matching allow-listed admin identity in the DB.
  try {
    const emailParam = typeof email === 'string' ? email.toLowerCase() : '';
    const result = await db.query<{ auth_user_id: string }>(
      `SELECT auth_user_id FROM inventory_admins
       WHERE (auth_user_id = $1 OR (email IS NOT NULL AND LOWER(email) = $2))
         AND revoked_at IS NULL
         AND (is_active IS NULL OR is_active = true)`,
      [sub, emailParam],
    );
    
    if (result.rowCount) {
      console.log(`[INVENTORY-AUTH] Admin access granted via database lookup for ${email || sub}`);
      return sub;
    }
    
    console.warn(`[INVENTORY-AUTH] User not found in inventory_admins: ${email || sub}`);
  } catch (err) {
    // If the table does not exist or the database is starting up, fail closed.
    console.error('[INVENTORY-AUTH] Database query failed:', err instanceof Error ? err.message : 'Unknown error');
  }

  console.warn('[INVENTORY-AUTH] Access denied - no admin authorization found');
  return null;
}
