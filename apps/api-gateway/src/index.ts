/**
 * Edge router for the storefront.
 *
 * The browser only ever talks to this one origin (`/api/*` for commerce,
 * `/inventory/*` for products and downloads), which keeps CORS, credentials and
 * service topology out of the client. Each route strips its public prefix
 * before forwarding, so services stay unaware of the gateway.
 */
import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';

const port = Number(process.env.PORT ?? 8081);

const target = (name: string, fallbackPort: number) =>
  (process.env[name] || `http://localhost:${fallbackPort}`).replace(/\/+$/, '');

const inventoryServiceUrl = target('INVENTORY_SERVICE_URL', 3002);
const cartServiceUrl = target('CART_SERVICE_URL', 3003);
const billingServiceUrl = target('BILLING_SERVICE_URL', 3004);
const authServiceUrl = target('AUTH_SERVICE_URL', 3001);

interface Route {
  /** Longest public path that selects this route. */
  prefix: string;
  /** The part actually stripped before forwarding (usually `/api`). */
  mount: string;
  base: string;
  service: string;
}

/** Longest prefix wins, so `/api/products/validate-promo` beats `/api/products`. */
const routes: Route[] = [
  { prefix: '/api/cart', mount: '/api', base: cartServiceUrl, service: 'cart-service' },
  { prefix: '/api/orders', mount: '/api', base: billingServiceUrl, service: 'billing-service' },
  {
    prefix: '/api/create-order',
    mount: '/api',
    base: billingServiceUrl,
    service: 'billing-service',
  },
  {
    prefix: '/api/payments',
    mount: '/api',
    base: billingServiceUrl,
    service: 'billing-service',
  },
  {
    prefix: '/api/track-order',
    mount: '/api',
    base: billingServiceUrl,
    service: 'billing-service',
  },
  {
    prefix: '/api/products/validate-promo',
    mount: '/api',
    base: billingServiceUrl,
    service: 'billing-service',
  },
  { prefix: '/api/products', mount: '/api', base: billingServiceUrl, service: 'billing-service' },
  {
    prefix: '/api/admin/analytics',
    mount: '/api',
    base: billingServiceUrl,
    service: 'billing-service',
  },
  { prefix: '/api/auth', mount: '/api/auth', base: authServiceUrl, service: 'auth-service' },
  {
    prefix: '/inventory',
    mount: '/inventory',
    base: inventoryServiceUrl,
    service: 'inventory-service',
  },
].sort((a, b) => b.prefix.length - a.prefix.length);

/**
 * Public routes that the storefront still calls but that no service implements
 * yet. They answer 501 with a clear message instead of a confusing 404.
 */
const unimplemented = ['/api/chat', '/api/beta-feedback', '/api/generate-product-description'];

const allowedOrigins = [
  process.env.ADMIN_DASHBOARD_URL,
  process.env.CUSTOMER_FRONTEND_URL,
  'http://localhost:8080',
  'http://localhost:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:5173',
].filter((origin): origin is string => Boolean(origin));

const HOP_BY_HOP = new Set(['host', 'connection', 'content-length', 'transfer-encoding']);

const app = new Elysia()
  .use(
    cors({
      origin: (request: Request) => {
        const origin = request.headers.get('origin');
        if (!origin) return true;
        if (allowedOrigins.includes(origin)) return true;
        return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  )
  .get('/health', () => ({
    service: 'api-gateway',
    status: 'healthy',
    routes: routes.map(({ prefix, service }) => ({ prefix, service })),
    timestamp: new Date().toISOString(),
  }))
  .all('/*', async ({ request, set }) => {
    const url = new URL(request.url);
    const path = url.pathname;

    if (unimplemented.some((route) => path === route || path.startsWith(`${route}/`))) {
      set.status = 501;
      return { success: false, error: `No service implements ${path} yet` };
    }

    const route = routes.find(
      (candidate) => path === candidate.prefix || path.startsWith(`${candidate.prefix}/`)
    );

    if (!route) {
      set.status = 404;
      return { success: false, error: `No route for ${path}` };
    }

    // Only the mount point is stripped, so `/api/cart` reaches cart-service as
    // `/cart` and `/inventory/products` reaches inventory-service as `/products`.
    const forwarded = path.slice(route.mount.length) || '/';
    const target = new URL(
      `${route.base}${forwarded.startsWith('/') ? forwarded : `/${forwarded}`}`
    );
    target.search = url.search;

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase())) headers[key] = value;
    });

    const method = request.method.toUpperCase();
    const body = method === 'GET' || method === 'HEAD' ? undefined : await request.text();

    try {
      const response = await fetch(target, {
        method,
        headers,
        body,
        redirect: 'manual',
      });

      const payload = await response.text();
      set.status = response.status;
      const contentType = response.headers.get('content-type');
      if (contentType) set.headers['content-type'] = contentType;
      return payload;
    } catch (error) {
      console.error(`[GATEWAY] ${route.service} unreachable:`, error);
      set.status = 502;
      return {
        success: false,
        error: `${route.service} is unreachable`,
      };
    }
  })
  .listen(port);

console.log(`API gateway running at http://localhost:${app.server?.port}`);
