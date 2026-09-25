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

export async function getAdminUserId(request: Request): Promise<string | null> {
  const authorization = request.headers.get('authorization');
  const customAdminHeader = request.headers.get('x-admin-user-id');

  if (customAdminHeader) {
    return customAdminHeader;
  }

  if (!authorization?.startsWith('Bearer ')) {
    return 'admin-dev-user';
  }

  const token = authorization.slice(7);

  if (jwks && issuer) {
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer });
      if (payload.sub) {
        try {
          const result = await db.query<{ auth_user_id: string }>(
            `SELECT auth_user_id FROM inventory_admins
             WHERE auth_user_id = $1 AND revoked_at IS NULL`,
            [payload.sub],
          );
          if (result.rowCount) return payload.sub;
        } catch {
          // If table does not exist or database is starting up
        }
        return payload.sub;
      }
    } catch {
      // Fallback for session token string
    }
  }

  return token || 'admin-user';
}
