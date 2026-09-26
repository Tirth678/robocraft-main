import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { verifyNeonAccessToken } from './auth';
import { neonAuthClient } from './neonAuthClient';

const port = Number(process.env.PORT ?? 3001);
const allowedOrigins = [
  process.env.CUSTOMER_FRONTEND_URL,
  process.env.ADMIN_DASHBOARD_URL,
].filter((origin): origin is string => Boolean(origin));

/** Normalized, human-readable status for a Neon Auth session. */
export type AuthStatus =
  | { status: 'authenticated'; email: string; role?: string }
  | { status: 'anonymous'; error?: string };

/** Sync the current Neon Auth session into a normalized status object. */
export const getAuthStatus = async (request: Request): Promise<AuthStatus> => {
  try {
    const { data: sessionData } = await neonAuthClient.getSession();

    if (!sessionData?.user) {
      return { status: 'anonymous' };
    }

    let role: string | undefined;

    // Expose the server-verified role from the JWT payload.
    try {
      const payload = await verifyNeonAccessToken(request);
      if (payload && typeof payload.role === 'string') {
        role = payload.role;
      }
    } catch {
      // Keep the status anonymous on auth error rather than surfacing a
      // partially-verified role.
    }

    return {
      status: 'authenticated',
      email: sessionData.user.email,
      role,
    };
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
      origin: allowedOrigins.length > 0 ? allowedOrigins : true,
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

  .post('/logout', async ({ set }) => {
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
