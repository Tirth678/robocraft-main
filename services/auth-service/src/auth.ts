import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} environment variable is not set`);
  }

  return value;
}

const jwks = createRemoteJWKSet(new URL(requireEnv('NEON_AUTH_JWKS_URL')));
const issuer = new URL(requireEnv('NEON_AUTH_BASE_URL')).origin;

export async function verifyNeonAccessToken(request: Request): Promise<JWTPayload | null> {
  const authorization = request.headers.get('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(authorization.slice(7), jwks, { issuer });
    return payload.sub ? payload : null;
  } catch {
    return null;
  }
}
