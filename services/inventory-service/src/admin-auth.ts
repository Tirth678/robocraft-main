import { createRemoteJWKSet, jwtVerify } from 'jose';
import { db } from './db';

const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
const authBaseUrl = process.env.NEON_AUTH_BASE_URL;

if (!jwksUrl || !authBaseUrl) {
  throw new Error('Neon Managed Auth environment variables are not set');
}

const jwks = createRemoteJWKSet(new URL(jwksUrl));
const issuer = new URL(authBaseUrl).origin;

export async function getAdminUserId(request: Request): Promise<string | null> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;

  try {
    const { payload } = await jwtVerify(authorization.slice(7), jwks, { issuer });
    if (!payload.sub) return null;

    const result = await db.query<{ auth_user_id: string }>(
      `SELECT auth_user_id FROM inventory_admins
       WHERE auth_user_id = $1 AND revoked_at IS NULL`,
      [payload.sub],
    );
    return result.rowCount ? payload.sub : null;
  } catch {
    return null;
  }
}
