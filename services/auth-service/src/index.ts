import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { verifyNeonAccessToken } from './auth';
import { neonAuthClient } from './neonAuthClient';

const port = Number(process.env.PORT ?? 3001);
const allowedOrigins = [
  process.env.CUSTOMER_FRONTEND_URL,
  process.env.ADMIN_DASHBOARD_URL,
].filter((origin): origin is string => Boolean(origin));

/**
 * Browser origins allowed to call this service.
 *
 * Configured origins are always honoured. Localhost is only tolerated outside
 * production: with `credentials: true`, a page served from the operator's own
 * localhost would otherwise be able to ride the session cookie. An empty
 * allow-list therefore denies every browser origin rather than reflecting it.
 */
// `process.env.NODE_ENV` in dot form is constant-folded by `bun build`, which
// bakes in whatever NODE_ENV was set during the build and ignores the runtime
// value. Bracket notation keeps this a real lookup, so the production gate below
// reflects the deployed environment.
const isProduction = process.env['NODE_ENV'] === 'production';
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const isAllowedOrigin = (request: Request): boolean => {
  const origin = request.headers.get('origin');
  if (!origin) return true; // server-to-server / same-origin, no CORS involved
  if (allowedOrigins.includes(origin)) return true;
  return !isProduction && LOCAL_ORIGIN.test(origin);
};

if (isProduction && allowedOrigins.length === 0) {
  console.warn(
    '[AUTH] NODE_ENV=production but neither CUSTOMER_FRONTEND_URL nor ADMIN_DASHBOARD_URL is set — all browser origins will be rejected.',
  );
}

/** Normalized, human-readable status for a Neon Auth session. */
export type AuthStatus =
  | { status: 'authenticated'; email: string; role?: string }
  | { status: 'anonymous'; error?: string };

/**
 * Resolve the caller's identity from the Bearer JWT alone.
 *
 * The server has no session cookie — only the browser does — so verifying the
 * JWT is the single source of truth here. The JWT `role` claim is a generic
 * auth state (e.g. `authenticated`), not an application role, so the admin
 * allow-list (same env used by inventory-service) decides the effective role.
 */
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS || 'admin@robocraft.com,tirth@robocraft.com')
    .toLowerCase()
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean),
);

export const getAuthStatus = async (request: Request): Promise<AuthStatus> => {
  try {
    const payload = await verifyNeonAccessToken(request);
    if (!payload) {
      return { status: 'anonymous' };
    }

    const email = typeof payload.email === 'string' ? payload.email : '';
    const claimedRole = typeof payload.role === 'string' ? payload.role : undefined;
    const isAdminClaim = claimedRole === 'admin' || claimedRole === 'superadmin';
    const role =
      isAdminClaim || (email && adminEmails.has(email.toLowerCase())) ? 'admin' : 'user';

    return { status: 'authenticated', email, role };
  } catch (err) {
    return {
      status: 'anonymous',
      error: err instanceof Error ? err.message : 'Auth sync failed',
    };
  }
};

const app = new Elysia()
  .use(
    cors({
      origin: isAllowedOrigin,
      credentials: true,
    })
  )
  .get('/', () => ({
    service: 'auth-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  }))
  .get('/health', () => ({
    service: 'auth-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  }))

  .get('/me', async ({ request, set }) => {
    const authStatus = await getAuthStatus(request);

    // Any degraded state is surfaced as 401, and the client `useAuth` will
    // re-render as unauthenticated rather than guessing a partially-loaded
    // role.
    if (authStatus.status !== 'authenticated') {
      set.status = 401;
      return { error: authStatus.error || 'Unauthorized' };
    }

    return {
      user: {
        id: authStatus.email || 'anonymous',
        email: authStatus.email,
        role: authStatus.role || 'user',
      },
    };
  })

  .post('/logout', async () => {
    try {
      await neonAuthClient.signOut();
      return { success: true, message: 'Signed out' };
    } catch (err) {
      // Neon Auth may not implement a sign-out endpoint; treat a 404 as a
      // no-op rather than failing the client logout flow.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404') || msg.includes('HTTP 404')) {
        console.warn('[AUTH] Neon Auth sign-out endpoint not implemented; clearing local state only.');
        return { success: true, message: 'Local session cleared' };
      }
      return {
        success: false,
        error: msg,
      };
    }
  })

  .listen(port);

console.log(`Auth service running at http://localhost:${app.server?.port}`);
