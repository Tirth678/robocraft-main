import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
const authBaseUrl = process.env.NEON_AUTH_BASE_URL;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let issuer: string | null = null;

if (jwksUrl && authBaseUrl) {
  try {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
    issuer = new URL(authBaseUrl).origin;
  } catch (err) {
    console.warn('[AUTH] Failed to initialize Neon JWKS:', err);
  }
}

export interface AuthenticatedUser {
  sub: string;
  email: string | null;
  name: string | null;
}

/**
 * Verifies a Neon Managed Auth bearer token.
 *
 * Returns null for a missing, unverifiable or expired token. Never falls back
 * to a header, query parameter or cookie — the caller decides what roles to
 * grant afterwards.
 */
export async function verifyNeonRequest(request: Request): Promise<AuthenticatedUser | null> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;

  if (!jwks || !issuer) {
    console.error('[AUTH] JWKS not configured — set NEON_AUTH_JWKS_URL and NEON_AUTH_BASE_URL');
    return null;
  }

  try {
    const { payload } = await jwtVerify(authorization.slice(7), jwks, { issuer });
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      name: typeof payload.name === 'string' ? payload.name : null,
    };
  } catch (err) {
    console.warn('[AUTH] JWT verification failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
