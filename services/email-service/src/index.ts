import { Elysia } from 'elysia';

const app = new Elysia()
  .get('/', () => ({
    service: 'email-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  }))
  .get('/health', () => ({
    service: 'email-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  }))
  .listen(3005);

console.log(`Email service running at http://localhost:${app.server?.port}`);
