import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import Razorpay from 'razorpay';
import { signServiceRequest, verifyNeonRequest } from 'shared-utils';

const port = Number(process.env.PORT ?? 3004);
const inventoryServiceUrl = (process.env.INVENTORY_SERVICE_URL || 'http://localhost:3002').replace(
  /\/+$/,
  ''
);
const cartServiceUrl = (process.env.CART_SERVICE_URL || 'http://localhost:3003').replace(
  /\/+$/,
  ''
);
const emailServiceUrl = (process.env.EMAIL_SERVICE_URL || 'http://localhost:3005').replace(
  /\/+$/,
  ''
);
const internalSecret = process.env.INTERNAL_SERVICE_SECRET;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}
const db = new Pool({ connectionString: databaseUrl, max: 10 });

const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
// Razorpay signs each webhook with the secret configured on that webhook
// endpoint, which is a *different* value from the API key secret. Verifying
// with the key secret instead makes every live webhook fail with 401, so prefer
// the dedicated secret and only fall back for setups that still share one value.
const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || razorpayKeySecret;
const razorpay =
  razorpayKeyId && razorpayKeySecret
    ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
    : null;

/**
 * Without Razorpay credentials checkout runs in mock mode: an intent settles
 * immediately so the storefront flow can be exercised end to end locally.
 */
const paymentMode = razorpay ? 'razorpay' : 'mock';

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
    '[BILLING] NODE_ENV=production but neither CUSTOMER_FRONTEND_URL nor ADMIN_DASHBOARD_URL is set — all browser origins will be rejected.',
  );
}

interface CartItem {
  product: {
    id: string;
    name: string;
    price: number;
    imageUrl: string | null;
    kind?: string;
    isDigital?: boolean;
  };
  quantity: number;
}

/** Signs a request for inventory-service's service-to-service endpoint. */
function inventoryHeaders(method: string, path: string, bodyText: string): Record<string, string> {
  const { timestamp, signature } = signServiceRequest(internalSecret ?? '', method, path, bodyText);
  return {
    'content-type': 'application/json',
    'x-service-timestamp': String(timestamp),
    'x-service-signature': signature,
  };
}

/** The customer's own session is forwarded so cart-service sees a real JWT. */
async function readCart(authorization: string): Promise<CartItem[]> {
  const response = await fetch(`${cartServiceUrl}/cart`, {
    headers: { authorization },
  });
  if (!response.ok) {
    throw new Error('Unable to read the cart');
  }
  const payload = (await response.json()) as { success?: boolean; data?: { items?: CartItem[] } };
  return payload.data?.items ?? [];
}

/** Canonical admin check: the same allow-list inventory-service uses. */
async function isAdmin(userId: string): Promise<boolean> {
  try {
    const result = await db.query(
      `SELECT 1 FROM inventory_admins
        WHERE auth_user_id = $1 AND revoked_at IS NULL AND (is_active IS NULL OR is_active = true)`,
      [userId]
    );
    return Boolean(result.rowCount);
  } catch {
    return false;
  }
}

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return ((await request.json()) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

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
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  )
  .get('/', () => ({ service: 'billing-service', status: 'healthy', paymentMode }))
  .get('/health', () => ({ service: 'billing-service', status: 'healthy', paymentMode }))

  // --------------------------------------------------------------
  // ORDERS
  // --------------------------------------------------------------
  .post('/orders', async ({ request, set }) => {
    const user = await verifyNeonRequest(request);
    if (!user) {
      set.status = 401;
      return { success: false, error: 'Authentication required' };
    }

    let cart: CartItem[];
    try {
      cart = await readCart(request.headers.get('authorization') ?? '');
    } catch {
      set.status = 502;
      return { success: false, error: 'Unable to read your cart' };
    }

    if (!cart.length) {
      set.status = 409;
      return { success: false, error: 'Your cart is empty' };
    }

    const orderId = randomUUID();
    let subtotal = 0;

    // A Pool cannot pin a transaction to one connection via query(), so the
    // whole checkout runs on a dedicated client.
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      for (const line of cart) {
        // Re-validate against inventory at purchase time: stock can move
        // between adding to cart and checking out.
        const response = await fetch(`${inventoryServiceUrl}/products/${line.product.id}`);
        const payload = response.ok
          ? ((await response.json()) as { success?: boolean; data?: any })
          : null;
        const product = payload?.data;

        if (!payload?.success || !product || !product.isListed) {
          throw new Error(`${line.product.name} is no longer available`);
        }

        const available: number | null =
          product.kind === 'digital'
            ? product.sellsLicenseKeys
              ? (product.keysAvailable ?? product.stock ?? 0)
              : null
            : (product.stock ?? 0);

        if (available !== null && available < line.quantity) {
          throw new Error(`Only ${available} of ${line.product.name} left`);
        }

        const price = Number(line.product.price);
        subtotal += price * line.quantity;

        await client.query(
          `INSERT INTO order_items (id, "orderId", "productId", quantity, price)
           VALUES ($1,$2,$3,$4,$5)`,
          [randomUUID(), orderId, line.product.id, line.quantity, price]
        );
      }

      const tax = Math.round(subtotal * 0.18);
      const total = subtotal + tax;

      await client.query(
        `INSERT INTO orders (id, "userId", status, total, subtotal, tax, customer_email, customer_name, "createdAt", "updatedAt")
         VALUES ($1,$2,'pending',$3,$4,$5,$6,$7,now(),now())`,
        [orderId, user.sub, total, subtotal, tax, user.email, user.name]
      );

      await client.query('COMMIT');
      set.status = 201;
      return { success: true, data: { id: orderId, subtotal, tax, total } };
    } catch (error) {
      await client.query('ROLLBACK');
      set.status = 409;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unable to create the order',
      };
    } finally {
      client.release();
    }
  })
  .post('/create-order', async ({ request, set }) => {
    const user = await verifyNeonRequest(request);
    if (!user) {
      set.status = 401;
      return { success: false, error: 'Authentication required' };
    }

    const payload = await parseBody(request);
    const amount = Math.max(0, Number(payload.amount ?? 0));
    if (!amount) {
      set.status = 422;
      return { success: false, error: 'amount is required' };
    }

    if (!razorpay) {
      return { success: true, data: { paymentMode, amount, currency: 'INR', keyId: null } };
    }

    try {
      const rzpOrder = await razorpay.orders.create({
        amount: Math.round(amount * 100),
        currency: 'INR',
        receipt: `rcp_${Date.now()}`,
        notes: { user: user.sub },
      });
      return {
        success: true,
        data: {
          paymentMode,
          razorpayOrderId: rzpOrder.id,
          amount,
          currency: 'INR',
          keyId: razorpayKeyId,
        },
      };
    } catch (error) {
      console.error('[BILLING] Razorpay order creation failed:', error);
      set.status = 502;
      return { success: false, error: 'Payment provider unavailable' };
    }
  })

  // --------------------------------------------------------------
  // PAYMENTS + SETTLEMENT
  // --------------------------------------------------------------
  .post('/payments/create-intent', async ({ request, set }) => {
    const user = await verifyNeonRequest(request);
    if (!user) {
      set.status = 401;
      return { success: false, error: 'Authentication required' };
    }

    const payload = await parseBody(request);
    const orderId = String(payload.orderId ?? '').trim();
    if (!orderId) {
      set.status = 422;
      return { success: false, error: 'orderId is required' };
    }

    const result = await db.query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
    const order = result.rows[0];
    if (!order) {
      set.status = 404;
      return { success: false, error: 'Order not found' };
    }
    if (order.userId !== user.sub && !(await isAdmin(user.sub))) {
      set.status = 403;
      return { success: false, error: 'Not your order' };
    }

    // Never charge more than the server-calculated total.
    const requested = Number(payload.amount ?? 0);
    const amount = Math.max(0, Math.min(requested || Number(order.total), Number(order.total)));

    if (order.status === 'paid') {
      return {
        success: true,
        data: { clientSecret: `paid_${order.id}`, paymentIntentId: order.id, paymentMode },
      };
    }

    if (razorpay) {
      try {
        const rzpOrder = await razorpay.orders.create({
          amount: Math.round(amount * 100),
          currency: 'INR',
          receipt: order.id,
          notes: { orderId: order.id },
        });
        await db.query(
          `UPDATE orders SET "razorpayOrderId" = $1, total = $2, "updatedAt" = now() WHERE id = $3`,
          [rzpOrder.id, amount, order.id]
        );
        return {
          success: true,
          data: {
            clientSecret: `${rzpOrder.id}|${amount}`,
            paymentIntentId: rzpOrder.id,
            paymentMode,
          },
        };
      } catch (error) {
        console.error('[BILLING] Payment intent failed:', error);
        set.status = 502;
        return { success: false, error: 'Payment provider unavailable' };
      }
    }

    // Mock mode: settle straight away so checkout can be exercised locally.
    await db.query(`UPDATE orders SET total = $1, "updatedAt" = now() WHERE id = $2`, [
      amount,
      order.id,
    ]);
    await settleOrder(order.id);

    return {
      success: true,
      data: { clientSecret: `mock_${order.id}`, paymentIntentId: order.id, paymentMode },
    };
  })
  .get('/payments/:orderId', async ({ params, request, set }) => {
    const user = await verifyNeonRequest(request);
    if (!user) {
      set.status = 401;
      return { success: false, error: 'Authentication required' };
    }

    const result = await db.query(`SELECT * FROM orders WHERE id = $1`, [params.orderId]);
    const order = result.rows[0];
    if (!order) {
      set.status = 404;
      return { success: false, error: 'Order not found' };
    }
    if (order.userId !== user.sub && !(await isAdmin(user.sub))) {
      set.status = 403;
      return { success: false, error: 'Not your order' };
    }

    const status =
      order.status === 'paid' ? 'completed' : order.status === 'failed' ? 'failed' : 'pending';
    return { success: true, data: { status, orderId: order.id, total: order.total } };
  })
  .post('/payments/webhook', async ({ request, set }) => {
    const raw = await request.text();
    const signature = request.headers.get('x-razorpay-signature');

    if (!razorpayWebhookSecret || !signature) {
      set.status = 400;
      return { success: false, error: 'Webhook is not configured' };
    }

    const expected = createHmac('sha256', razorpayWebhookSecret).update(raw).digest('hex');
    const provided = Buffer.from(signature, 'utf8');
    const wanted = Buffer.from(expected, 'utf8');
    if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
      set.status = 401;
      return { success: false, error: 'Invalid signature' };
    }

    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      set.status = 422;
      return { success: false, error: 'Malformed payload' };
    }

    const orderId = event?.payload?.payment?.entity?.notes?.orderId;
    if (event.event === 'payment.captured' && typeof orderId === 'string') {
      await settleOrder(orderId);
    }

    return { success: true, received: true };
  })

  // --------------------------------------------------------------
  // ORDER LOOKUP + PROMOS
  // --------------------------------------------------------------
  .post('/track-order', async ({ request, set }) => {
    const payload = await parseBody(request);
    const query = String(payload.query ?? '').trim();
    if (!query) {
      set.status = 422;
      return { error: 'Order id or email address is required' };
    }

    const byEmail = query.includes('@');
    const result = await db.query(
      `SELECT * FROM orders
        WHERE ($1::boolean AND lower(customer_email) = lower($2))
           OR ((NOT $1::boolean) AND (id = $2 OR "razorpayOrderId" = $2))
        ORDER BY "createdAt" DESC LIMIT 20`,
      [byEmail, query]
    );

    const orders = [];
    for (const order of result.rows) {
      const items = await db.query(`SELECT * FROM order_items WHERE "orderId" = $1`, [order.id]);
      const resolved = [];

      for (const item of items.rows) {
        const response = await fetch(
          `${inventoryServiceUrl}/products/${encodeURIComponent(item.productId)}`
        );
        const product = response.ok
          ? ((await response.json()) as { success?: boolean; data?: any })
          : null;
        const info = product?.data;

        resolved.push({
          id: item.id,
          name: info?.name ?? 'Product',
          price: Number(item.price),
          quantity: item.quantity,
          image: info?.imageUrl ? mediaUrlFor(info.imageUrl) : null,
        });
      }

      orders.push({
        id: order.id,
        customer_name: order.customer_name ?? '',
        customer_email: order.customer_email ?? '',
        shipping_address: order.shipping_address ?? {
          address: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'India',
        },
        items: resolved,
        subtotal: Number(order.subtotal ?? order.total),
        tax: Number(order.tax ?? 0),
        total: Number(order.total),
        status: order.status,
        created_at: order.createdAt,
      });
    }
    // TrackOrderPage reads `orders` directly off the payload.
    return { orders };
  })
  .post('/products/validate-promo', async ({ request, set }) => {
    const payload = await parseBody(request);
    const code = String(payload.promoCode ?? '')
      .trim()
      .toUpperCase();
    const productId = String(payload.productId ?? '').trim();

    if (!code) {
      set.status = 422;
      return { success: false, error: 'promoCode is required' };
    }

    const response = await fetch(
      `${inventoryServiceUrl}/products/${encodeURIComponent(productId)}`
    );
    const productPayload = response.ok
      ? ((await response.json()) as { success?: boolean; data?: any })
      : null;
    const product = productPayload?.data;
    const originalPrice = Number(product?.price ?? 0);

    const invalid = (message: string, price = originalPrice) => ({
      success: true,
      data: {
        valid: false,
        discount: 0,
        originalPrice: price,
        discountedPrice: price,
        promoCode: code,
        message,
      },
    });

    if (!productPayload?.success || !product || originalPrice <= 0) {
      return invalid('That product is no longer available', 0);
    }

    // Coupon rules live in inventory_coupons; validation happens server-side so a
    // client cannot invent its own discount.
    const coupons = await db.query(
      `SELECT * FROM inventory_coupons
        WHERE upper(code) = upper($1)
          AND is_active
          AND (starts_at IS NULL OR starts_at <= now())
          AND (ends_at IS NULL OR ends_at > now())
          AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
          AND (minimum_order_minor IS NULL OR minimum_order_minor <= $2)
        LIMIT 1`,
      [code, Math.round(originalPrice * 100)]
    );

    if (!coupons.rowCount) return invalid('Invalid or expired promo code');

    const coupon = coupons.rows[0];
    const discountAmount =
      coupon.kind === 'percentage'
        ? Math.round((originalPrice * coupon.valueMinor) / 100)
        : Math.min(Math.round(coupon.value_minor / 100), originalPrice);

    const discountedPrice = Math.max(0, originalPrice - discountAmount);
    const discount = originalPrice > 0 ? Math.round((discountAmount / originalPrice) * 100) : 0;

    return {
      success: true,
      data: {
        valid: true,
        discount,
        discountAmount,
        originalPrice,
        discountedPrice,
        promoCode: coupon.code,
        message: 'Promo applied',
      },
    };
  })

  // --------------------------------------------------------------
  // ADMIN: product list + sales analytics
  // --------------------------------------------------------------
  .get('/products', async ({ request, set }) => {
    const user = await verifyNeonRequest(request);
    if (!user) {
      set.status = 401;
      return { success: false, error: 'Authentication required' };
    }

    // inventory-service owns the admin allow-list, so its verdict is reused
    // rather than duplicated here.
    const response = await fetch(`${inventoryServiceUrl}/admin/products?limit=200`, {
      headers: { authorization: request.headers.get('authorization') ?? '' },
    });
    if (!response.ok) {
      set.status = 502;
      return { success: false, error: 'Unable to load products' };
    }

    const payload = (await response.json()) as { data?: { items?: any[] } };
    const items = (payload.data?.items ?? []).map((product) => ({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      imageUrl: product.imageUrl ? mediaUrlFor(product.imageUrl) : null,
      category: product.category ?? null,
    }));

    return { success: true, data: items };
  })
  .get('/admin/analytics/sales', async ({ request, set }) => {
    const user = await verifyNeonRequest(request);
    if (!user) {
      set.status = 401;
      return { success: false, error: 'Authentication required' };
    }
    if (!(await isAdmin(user.sub))) {
      set.status = 403;
      return { success: false, error: 'Admin access is required' };
    }

    const year = Number(new URL(request.url).searchParams.get('year')) || new Date().getFullYear();
    return { success: true, data: await salesSummary(year) };
  })
  .get('/admin/analytics/sales/product/:productId', async ({ params, request, set }) => {
    const user = await verifyNeonRequest(request);
    if (!user) {
      set.status = 401;
      return { success: false, error: 'Authentication required' };
    }
    if (!(await isAdmin(user.sub))) {
      set.status = 403;
      return { success: false, error: 'Admin access is required' };
    }

    const year = Number(new URL(request.url).searchParams.get('year')) || new Date().getFullYear();
    const productResponse = await fetch(
      `${inventoryServiceUrl}/products/${encodeURIComponent(params.productId)}`,
      { headers: { authorization: request.headers.get('authorization') ?? '' } }
    );
    const productPayload = productResponse.ok
      ? ((await productResponse.json()) as { success?: boolean; data?: any })
      : null;
    const info = productPayload?.data;

    const monthly = await db.query(
      `SELECT EXTRACT(MONTH FROM o."createdAt")::int AS month,
              COALESCE(SUM(oi.quantity),0)::int AS "quantitySold",
              COALESCE(SUM(oi.quantity * oi.price),0)::float AS revenue,
              COUNT(DISTINCT o.id)::int AS "orderCount"
         FROM orders o
         JOIN order_items oi ON oi."orderId" = o.id
        WHERE oi."productId" = $1
          AND EXTRACT(YEAR FROM o."createdAt") = $2
          AND o.status <> 'failed'
        GROUP BY 1`,
      [params.productId, year]
    );

    const daily = await db.query(
      `SELECT EXTRACT(DOY FROM o."createdAt")::int AS day,
              COALESCE(SUM(oi.quantity),0)::int AS "quantitySold",
              COALESCE(SUM(oi.quantity * oi.price),0)::float AS revenue,
              COUNT(DISTINCT o.id)::int AS "orderCount"
         FROM orders o
         JOIN order_items oi ON oi."orderId" = o.id
        WHERE oi."productId" = $1
          AND EXTRACT(YEAR FROM o."createdAt") = $2
          AND o.status <> 'failed'
        GROUP BY 1`,
      [params.productId, year]
    );

    const monthlyRows = new Map(monthly.rows.map((row) => [row.month, row]));
    const dailyRows = new Map(daily.rows.map((row) => [row.day, row]));
    const dayCount = isLeapYear(year) ? 366 : 365;

    const totals = monthly.rows.reduce(
      (acc, row) => ({
        totalQuantity: acc.totalQuantity + Number(row.quantitySold),
        totalRevenue: acc.totalRevenue + Number(row.revenue),
        totalOrders: acc.totalOrders + Number(row.orderCount),
      }),
      { totalQuantity: 0, totalRevenue: 0, totalOrders: 0 }
    );

    return {
      success: true,
      data: {
        product: {
          id: params.productId,
          name: info?.name ?? 'Product',
          price: Number(info?.price ?? 0),
          imageUrl: info?.imageUrl ? mediaUrlFor(info.imageUrl) : null,
          category: info?.category ?? null,
        },
        year,
        yearly: totals,
        monthlySales: Array.from({ length: 12 }, (_, index) => {
          const row = monthlyRows.get(index + 1);
          return {
            month: index + 1,
            quantitySold: row ? Number(row.quantitySold) : 0,
            revenue: row ? Number(row.revenue) : 0,
            orderCount: row ? Number(row.orderCount) : 0,
          };
        }),
        dailySales: Array.from({ length: dayCount }, (_, index) => {
          const row = dailyRows.get(index + 1);
          return {
            day: index + 1,
            quantitySold: row ? Number(row.quantitySold) : 0,
            revenue: row ? Number(row.revenue) : 0,
            orderCount: row ? Number(row.orderCount) : 0,
          };
        }),
      },
    };
  })
  .listen(port);

console.log(`Billing service running at http://localhost:${app.server?.port} (${paymentMode})`);

/**
 * Object-storage keys are resolved through the storefront's inventory proxy so
 * the browser never needs bucket credentials.
 */
function mediaUrlFor(key: string): string {
  if (/^https?:\/\//i.test(key) || key.startsWith('/')) return key;
  return `/inventory/media?key=${encodeURIComponent(key)}`;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Marks an order paid (idempotently), hands every digital line to inventory for
 * entitlement creation, then queues the delivery email.
 *
 * Called by the mock path in create-intent and by the Razorpay webhook, so all
 * three entry points settle an order exactly once.
 */
async function settleOrder(orderId: string) {
  const result = await db.query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  const order = result.rows[0];
  if (!order) return null;

  if (order.status !== 'paid') {
    await db.query(`UPDATE orders SET status = 'paid', "updatedAt" = now() WHERE id = $1`, [
      orderId,
    ]);
    order.status = 'paid';
  }

  const items = await db.query(
    `SELECT id, "productId", quantity FROM order_items WHERE "orderId" = $1`,
    [orderId]
  );

  const lines: Array<{ itemId: string; orderItemId: string; quantity: number }> = [];
  for (const item of items.rows) {
    const response = await fetch(
      `${inventoryServiceUrl}/products/${encodeURIComponent(item.productId)}`
    );
    const payload = response.ok
      ? ((await response.json()) as { success?: boolean; data?: any })
      : null;
    if (payload?.data?.kind === 'digital') {
      lines.push({ itemId: item.productId, orderItemId: item.id, quantity: item.quantity });
    }
  }

  if (!lines.length) return { entitlements: [] as any[] };

  const bodyText = JSON.stringify({
    orderId,
    customerEmail: order.customer_email ?? '',
    userId: order.userId ?? null,
    items: lines,
  });

  type FulfillmentPayload = {
    success?: boolean;
    data?: { entitlements?: any[]; created?: number };
  };

  let payload: FulfillmentPayload | null = null;
  try {
    const response = await fetch(`${inventoryServiceUrl}/internal/fulfillments`, {
      method: 'POST',
      headers: inventoryHeaders('POST', '/internal/fulfillments', bodyText),
      body: bodyText,
    });
    if (response.ok) {
      payload = (await response.json()) as FulfillmentPayload;
    } else {
      console.error('[BILLING] Digital fulfilment failed:', await response.text());
    }
  } catch (error) {
    console.error('[BILLING] Digital fulfilment errored:', error);
  }

  const fulfillment: FulfillmentPayload = payload ?? {};
  const entitlements = fulfillment.data?.entitlements ?? [];
  const created = fulfillment.data?.created ?? 0;

  // Only a freshly created entitlement triggers mail, so a replayed webhook
  // never emails the customer twice.
  if (created > 0 && order.customer_email) {
    fetch(`${emailServiceUrl}/send-digital-delivery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orderId,
        customerEmail: order.customer_email,
        customerName: order.customer_name,
        total: order.total,
        entitlements,
      }),
    }).catch((error) => console.error('[BILLING] Failed to queue delivery email:', error));
  }

  return { entitlements, created };
}

/** Yearly sales roll-up with dense month/day buckets for the charts. */
async function salesSummary(year: number) {
  const monthly = await db.query(
    `SELECT EXTRACT(MONTH FROM o."createdAt")::int AS month,
            COUNT(DISTINCT o.id)::int AS "orderCount",
            COALESCE(SUM(o.total),0)::float AS "totalRevenue",
            COALESCE(SUM(oi.quantity),0)::int AS "totalItems"
       FROM orders o
       JOIN order_items oi ON oi."orderId" = o.id
      WHERE EXTRACT(YEAR FROM o."createdAt") = $1 AND o.status <> 'failed'
      GROUP BY 1`,
    [year]
  );

  const daily = await db.query(
    `SELECT EXTRACT(DOY FROM o."createdAt")::int AS day,
            COUNT(DISTINCT o.id)::int AS "orderCount",
            COALESCE(SUM(o.total),0)::float AS "totalRevenue"
       FROM orders o
      WHERE EXTRACT(YEAR FROM o."createdAt") = $1 AND o.status <> 'failed'
      GROUP BY 1`,
    [year]
  );

  const monthlyRows = new Map(monthly.rows.map((row) => [row.month, row]));
  const dailyRows = new Map(daily.rows.map((row) => [row.day, row]));

  return {
    year,
    monthlySales: Array.from({ length: 12 }, (_, index) => {
      const row = monthlyRows.get(index + 1);
      return {
        month: index + 1,
        orderCount: row ? Number(row.orderCount) : 0,
        totalRevenue: row ? Number(row.totalRevenue) : 0,
        totalItems: row ? Number(row.totalItems) : 0,
      };
    }),
    dailySales: Array.from({ length: isLeapYear(year) ? 366 : 365 }, (_, index) => {
      const row = dailyRows.get(index + 1);
      return {
        day: index + 1,
        orderCount: row ? Number(row.orderCount) : 0,
        totalRevenue: row ? Number(row.totalRevenue) : 0,
      };
    }),
  };
}
