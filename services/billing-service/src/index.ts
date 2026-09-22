import { Elysia } from 'elysia';

const app = new Elysia()
  .get('/', () => ({
    service: 'billing-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  }))
  .get('/health', () => ({
    service: 'billing-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  }))
  .listen(3004);

console.log(`Billing service running at http://localhost:${app.server?.port}`);
