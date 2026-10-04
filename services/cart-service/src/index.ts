import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import Redis from 'ioredis';
import { verifyNeonRequest } from 'shared-utils';

const port = Number(process.env.PORT ?? 3003);
const inventoryServiceUrl = (process.env.INVENTORY_SERVICE_URL || 'http://localhost:3002').replace(
  /\/+$/,
  ''
);
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const configuredOrigins = [
  process.env.ADMIN_DASHBOARD_URL,
  process.env.CUSTOMER_FRONTEND_URL,
].filter((origin): origin is string => Boolean(origin));

/** Development-only storefront/admin origins; see inventory-service for why. */
const devOrigins = [
  'http://localhost:8080',
  'http://localhost:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:5173',
];

// `process.env.NODE_ENV` in dot form is constant-folded by `bun build`, which
// bakes in whatever NODE_ENV was set during the build and ignores the runtime
// value. Bracket notation keeps this a real lookup, so the production gate below
// reflects the deployed environment.
const isProduction = process.env['NODE_ENV'] === 'production';
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

if (isProduction && configuredOrigins.length === 0) {
  console.warn(
    '[CART] NODE_ENV=production but neither CUSTOMER_FRONTEND_URL nor ADMIN_DASHBOARD_URL is set — all browser origins will be rejected.',
  );
}

/** One line in a stored cart. Prices are never cached — they stay live. */
interface CartLine {
  productId: string;
  quantity: number;
}

interface InventoryProduct {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  isListed: boolean;
  kind: 'physical' | 'digital';
  deliveryMode?: string;
  stock: number | null;
  keysAvailable?: number;
  sellsLicenseKeys?: boolean;
}

const memoryStore = new Map<string, CartLine[]>();
let redis: Redis | null = null;
let redisReady = false;

async function connectRedis(): Promise<void> {
  if (!process.env.REDIS_URL) return;
  try {
    const client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => (times > 2 ? null : Math.min(times * 200, 1000)),
    });
    await client.connect();
    redis = client;
    redisReady = true;
    console.log(`[CART] Connected to Redis at ${redisUrl}`);
  } catch (error) {
    redisReady = false;
    console.warn(
      '[CART] Redis unavailable, using in-memory carts:',
      error instanceof Error ? error.message : error
    );
  }
}

const cartKey = (userId: string) => `cart:${userId}`;

async function readCart(userId: string): Promise<CartLine[]> {
  if (redis && redisReady) {
    try {
      const raw = await redis.get(cartKey(userId));
      if (raw) return JSON.parse(raw) as CartLine[];
      return [];
    } catch (error) {
      console.warn('[CART] Redis read failed, falling back:', error);
    }
  }
  return memoryStore.get(userId) ?? [];
}

async function writeCart(userId: string, lines: CartLine[]): Promise<void> {
  if (redis && redisReady) {
    try {
      await redis.set(cartKey(userId), JSON.stringify(lines), 'EX', 60 * 60 * 24 * 30);
      return;
    } catch (error) {
      console.warn('[CART] Redis write failed, falling back:', error);
    }
  }
  memoryStore.set(userId, lines);
}

async function loadProduct(productId: string): Promise<InventoryProduct | null> {
  try {
    const response = await fetch(
      `${inventoryServiceUrl}/products/${encodeURIComponent(productId)}`
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as { success?: boolean; data?: InventoryProduct };
    return payload.success && payload.data ? payload.data : null;
  } catch (error) {
    console.error('[CART] Inventory lookup failed:', error);
    return null;
  }
}

/** How many more units of this product can be sold right now (null = unlimited). */
function availableUnits(product: InventoryProduct): number | null {
  if (product.kind === 'digital') {
    const sellsKeys =
      product.sellsLicenseKeys ??
      (product.deliveryMode === 'license_keys' || product.deliveryMode === 'both');
    return sellsKeys ? (product.keysAvailable ?? product.stock ?? 0) : null;
  }
  return product.stock ?? 0;
}

interface ResolvedLine {
  product: {
    id: string;
    name: string;
    price: number;
    imageUrl: string | null;
    kind: string;
    isDigital: boolean;
  };
  quantity: number;
}

/** Turns stored lines into the shape the storefront cart renders. */
async function resolveLines(
  lines: CartLine[]
): Promise<{ items: ResolvedLine[]; removed: string[] }> {
  const items: ResolvedLine[] = [];
  const removed: string[] = [];

  for (const line of lines) {
    const product = await loadProduct(line.productId);
    if (!product || !product.isListed) {
      removed.push(line.productId);
      continue;
    }
    items.push({
      product: {
        id: product.id,
        name: product.name,
        price: Number(product.price),
        imageUrl: product.imageUrl,
        kind: product.kind,
        isDigital: product.kind === 'digital',
      },
      quantity: line.quantity,
    });
  }

  return { items, removed };
}

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    return ((await request.json()) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

await connectRedis();

const app = new Elysia()
  .use(
    cors({
      origin: (request: Request) => {
        const origin = request.headers.get('origin');
        if (!origin) return true; // server-to-server / same-origin
        if (configuredOrigins.includes(origin)) return true;
        // Localhost is a development convenience only: with `credentials: true`
        // a page on the operator's localhost could otherwise ride the cookie.
        return !isProduction && (LOCAL_ORIGIN.test(origin) || devOrigins.includes(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  )
  .get('/', () => ({ service: 'cart-service', status: 'healthy' }))
  .get('/health', () => ({ service: 'cart-service', status: 'healthy' }))
  .get('/cart', async ({ request, set }) => {
    const user = await verifyNeonRequest(request);
    if (!user) {
      set.status = 401;
      return { success: false, error: 'Authentication required' };
    }

    const lines = await readCart(user.sub);
    const { items, removed } = await resolveLines(lines);

    // A delisted product silently disappears from the cart instead of
    // rendering a broken row forever.
    if (removed.length) {
      await writeCart(
        user.sub,
        lines.filter((line) => !removed.includes(line.productId))
      );
    }

    return { success: true, data: { items, removed: removed.length } };
  })
  .post('/cart/items', async ({ request, set }) => {
    const user = await verifyNeonRequest(request);
    if (!user) {
      set.status = 401;
      return { success: false, error: 'Authentication required' };
    }

    const payload = await body(request);
    const productId = typeof payload.productId === 'string' ? payload.productId.trim() : '';
    const quantity = Math.max(1, Number(payload.quantity ?? 1) || 1);

    if (!productId) {
      set.status = 422;
      return { success: false, error: 'productId is required' };
    }

    const product = await loadProduct(productId);
    if (!product || !product.isListed) {
      set.status = 409;
      return { success: false, error: 'This product is not available' };
    }

    const lines = await readCart(user.sub);
    const existing = lines.find((line) => line.productId === productId);
    const wanted = (existing?.quantity ?? 0) + quantity;
    const available = availableUnits(product);

    if (available !== null && wanted > available) {
      set.status = 409;
      return {
        success: false,
        error:
          product.kind === 'digital'
            ? `Only ${available} license key(s) left`
            : `Only ${available} unit(s) in stock`,
      };
    }

    if (existing) existing.quantity = wanted;
    else lines.push({ productId, quantity });

    await writeCart(user.sub, lines);
    set.status = 201;
    return { success: true, data: { productId, quantity: wanted } };
  })
  .put('/cart/items/:productId', async ({ params, request, set }) => {
    const user = await verifyNeonRequest(request);
    if (!user) {
      set.status = 401;
      return { success: false, error: 'Authentication required' };
    }

    const payload = await body(request);
    const quantity = Number(payload.quantity ?? 0);
    const lines = await readCart(user.sub);
    const line = lines.find((entry) => entry.productId === params.productId);
    if (!line) {
      set.status = 404;
      return { success: false, error: 'Item not in cart' };
    }

    if (quantity <= 0) {
      await writeCart(
        user.sub,
        lines.filter((entry) => entry.productId !== params.productId)
      );
      return { success: true, data: { productId: params.productId, quantity: 0 } };
    }

    const product = await loadProduct(params.productId);
    if (!product || !product.isListed) {
      set.status = 409;
      return { success: false, error: 'This product is not available' };
    }

    const available = availableUnits(product);
    if (available !== null && quantity > available) {
      set.status = 409;
      return { success: false, error: `Only ${available} unit(s) available` };
    }

    line.quantity = quantity;
    await writeCart(user.sub, lines);
    return { success: true, data: { productId: params.productId, quantity } };
  })
  .delete('/cart/items/:productId', async ({ params, request, set }) => {
    const user = await verifyNeonRequest(request);
    if (!user) {
      set.status = 401;
      return { success: false, error: 'Authentication required' };
    }

    const lines = await readCart(user.sub);
    await writeCart(
      user.sub,
      lines.filter((line) => line.productId !== params.productId)
    );
    return { success: true, data: { productId: params.productId, removed: true } };
  })
  .delete('/cart', async ({ request, set }) => {
    const user = await verifyNeonRequest(request);
    if (!user) {
      set.status = 401;
      return { success: false, error: 'Authentication required' };
    }

    await writeCart(user.sub, []);
    return { success: true, data: { cleared: true } };
  })
  .listen(port);

console.log(`Cart service running at http://localhost:${app.server?.port}`);
