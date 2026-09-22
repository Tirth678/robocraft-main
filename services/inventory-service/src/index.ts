import { Elysia } from 'elysia';

const app = new Elysia()
  .get('/', () => ({
    service: 'inventory-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  }))
  .get('/health', () => ({
    service: 'inventory-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  }))
  .listen(3002);

console.log(`Inventory service running at http://localhost:${app.server?.port}`);
