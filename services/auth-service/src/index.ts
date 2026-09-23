import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { verifyNeonAccessToken } from './auth';

const port = Number(process.env.PORT ?? 3001);
const allowedOrigins = [
  process.env.CUSTOMER_FRONTEND_URL,
  process.env.ADMIN_DASHBOARD_URL,
].filter((origin): origin is string => Boolean(origin));

const app = new Elysia()
  .use(cors({
    origin: allowedOrigins,
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
    const user = await verifyNeonAccessToken(request);

    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }

    return { user };
  })
  .listen(port);

console.log(`Auth service running at http://localhost:${app.server?.port}`);
