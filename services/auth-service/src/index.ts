import { Elysia } from 'elysia';

const app = new Elysia()
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
  .listen(3001);

console.log(`Auth service running at http://localhost:${app.server?.port}`);
