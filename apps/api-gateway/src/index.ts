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

// `||` not `??`: an empty or zero PORT (some dev harnesses export PORT=0) would
// otherwise bind an ephemeral port the storefront never finds.
const port = Number(process.env.PORT) || 8081;

const target = (name: string, fallbackPort: number) =>
  (process.env[name] || `http://localhost:${fallbackPort}`).replace(/\/+$/, '');

const inventoryServiceUrl = target('INVENTORY_SERVICE_URL', 3002);
const cartServiceUrl = target('CART_SERVICE_URL', 3003);
const billingServiceUrl = target('BILLING_SERVICE_URL', 3004);
const authServiceUrl = target('AUTH_SERVICE_URL', 3001);
// The admin console (a static host) proxies /admin-api/* to this gateway so its
// session cookie stays first-party; single-container deploys keep admin-service
// on a private port and this is its only way out.
const adminServiceUrl = target('ADMIN_SERVICE_URL', 3007);

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
  {
    prefix: '/admin-api',
    mount: '/admin-api',
    base: adminServiceUrl,
    service: 'admin-service',
  },
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

/**
 * Upstream response headers the browser needs verbatim. `location` carries the
 * signed-URL redirects inventory-service answers `/media` and `/downloads` with,
 * `set-cookie` carries the admin console's session through the `/admin-api`
 * proxy, and the rest keep caching and download filenames intact. Everything
 * else (encoding, length, date) is left to this hop, or the body would disagree
 * with its own framing.
 */
const FORWARDED_RESPONSE_HEADERS = new Set([
  'content-type',
  'content-disposition',
  'cache-control',
  'etag',
  'last-modified',
  'location',
]);

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

      // A plain object return cannot carry repeated `set-cookie` headers, so the
      // downstream response is rebuilt by hand: the platform's CORS headers that
      // `@elysiajs/cors` already wrote onto `set.headers` are merged in, which
      // keeps the allow-list effective on responses this handler synthesises.
      const outgoing = new Headers();
      response.headers.forEach((value, key) => {
        if (FORWARDED_RESPONSE_HEADERS.has(key.toLowerCase())) outgoing.set(key, value);
      });
      for (const cookie of response.headers.getSetCookie?.() ?? []) {
        outgoing.append('set-cookie', cookie);
      }
      for (const [key, value] of Object.entries(set.headers)) {
        if (value === undefined || value === null) continue;
        outgoing.set(key, String(value));
      }

      return new Response(payload, { status: response.status, headers: outgoing });
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
