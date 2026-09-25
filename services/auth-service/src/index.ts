import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { verifyNeonAccessToken } from './auth';

const port = Number(process.env.PORT ?? 3001);
const allowedOrigins = [
  process.env.CUSTOMER_FRONTEND_URL,
  process.env.ADMIN_DASHBOARD_URL,
].filter((origin): origin is string => Boolean(origin));

const adminEmails = (process.env.ADMIN_EMAILS || 'admin@robocraft.com,tirth@robocraft.com')
  .toLowerCase()
  .split(',')
  .map((e) => e.trim());

const app = new Elysia()
  .use(cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  }))
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
    const payload = await verifyNeonAccessToken(request);

    if (!payload) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }

    const email = typeof payload.email === 'string' ? payload.email : '';
    const isExplicitAdmin = payload.role === 'admin' || (email && adminEmails.includes(email.toLowerCase()));

    const user = {
      ...payload,
      email,
      role: isExplicitAdmin ? 'admin' : (payload.role || 'user'),
    };

    return { user };
  })
  .listen(port);

console.log(`Auth service running at http://localhost:${app.server?.port}`);
