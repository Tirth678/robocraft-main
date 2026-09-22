import { Elysia } from 'elysia';

const app = new Elysia()
  .get('/', () => ({
    service: 'cart-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  }))
  .get('/health', () => ({
    service: 'cart-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  }))
  .listen(3003);

console.log(`Cart service running at http://localhost:${app.server?.port}`);
