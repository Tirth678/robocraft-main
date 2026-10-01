import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getAdminUserId } from './admin-auth';
import { verifyServiceRequest } from 'shared-utils';
import {
  deliversFiles,
  deliversKeys,
  digitalSummaries,
  FulfillmentError,
  formatAsset,
  formatEntitlement,
  fulfillOrder,
  isDigital,
  type FulfillmentLine,
} from './digital';
import { db } from './db';
import {
  buildObjectKey,
  checksumOf,
  deleteObject,
  getObject,
  presignObject,
  putObject,
  sanitizeFileName,
  storageBackend,
  storageBucket,
  supportsSignedUrls,
} from './storage';

const port = Number(process.env.PORT ?? 3002);
const emailServiceUrl = process.env.EMAIL_SERVICE_URL || 'http://localhost:3005';

/** Public origin used for links that land in customer emails. */
const publicBaseUrl = (process.env.INVENTORY_PUBLIC_URL || `http://localhost:${port}`).replace(
  /\/+$/,
  ''
);

const allowedOrigins = [
  process.env.ADMIN_DASHBOARD_URL,
  process.env.CUSTOMER_FRONTEND_URL,
  'http://localhost:8080',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
].filter((origin): origin is string => Boolean(origin));

const kindSchema = z.enum(['physical', 'digital']);
const deliveryModeSchema = z.enum(['files', 'license_keys', 'both']);

const itemInput = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .transform((value) => value.toUpperCase()),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1),
    category: z.string().trim().min(1).max(100).optional(),
    imageUrl: z.string().trim().optional(),
    imageKeys: z.array(z.string().trim().min(1)).max(20).default([]),
    mrpMinor: z.number().int().nonnegative().optional(),
    salePriceMinor: z.number().int().nonnegative().optional(),
    price: z.number().nonnegative().optional(),
    mrp: z.number().nonnegative().optional(),
    quantityOnHand: z.number().int().nonnegative().default(0),
    stock: z.number().int().nonnegative().optional(),
    isListed: z.boolean().optional(),
    kind: kindSchema.default('physical'),
    deliveryMode: deliveryModeSchema.default('files'),
    downloadLimit: z.number().int().positive().nullable().optional(),
    digitalInstructions: z.string().trim().max(2000).optional(),
  })
  .transform((data) => {
    // If price in standard currency units was passed, convert to minor
    const salePriceMinor =
      data.salePriceMinor !== undefined
        ? data.salePriceMinor
        : data.price !== undefined
          ? Math.round(data.price * 100)
          : 0;
    const mrpMinor =
      data.mrpMinor !== undefined
        ? data.mrpMinor
        : data.mrp !== undefined
          ? Math.round(data.mrp * 100)
          : salePriceMinor;
    const quantityOnHand =
      data.quantityOnHand !== undefined
        ? data.quantityOnHand
        : data.stock !== undefined
          ? data.stock
          : 0;
    const imageKeys = [...data.imageKeys];
    if (data.imageUrl && !imageKeys.includes(data.imageUrl)) {
      imageKeys.unshift(data.imageUrl);
    }
    return {
      ...data,
      salePriceMinor,
      mrpMinor,
      // Digital goods are never hand-stocked; a DB constraint enforces this too.
      quantityOnHand: data.kind === 'digital' ? 0 : quantityOnHand,
      imageKeys,
    };
  })
  .refine((value) => value.salePriceMinor <= value.mrpMinor, {
    message: 'salePriceMinor cannot exceed mrpMinor',
    path: ['salePriceMinor'],
  });

const updateItemInput = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .transform((value) => value.toUpperCase())
      .optional(),
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    imageUrl: z.string().trim().optional(),
    imageKeys: z.array(z.string().trim().min(1)).max(20).optional(),
    mrpMinor: z.number().int().nonnegative().optional(),
    salePriceMinor: z.number().int().nonnegative().optional(),
    price: z.number().nonnegative().optional(),
    mrp: z.number().nonnegative().optional(),
    quantityOnHand: z.number().int().nonnegative().optional(),
    stock: z.number().int().nonnegative().optional(),
    isListed: z.boolean().optional(),
    isActive: z.boolean().optional(),
    kind: kindSchema.optional(),
    deliveryMode: deliveryModeSchema.optional(),
    downloadLimit: z.number().int().positive().nullable().optional(),
    digitalInstructions: z.string().trim().max(2000).optional(),
  })
  .transform((data) => {
    let salePriceMinor = data.salePriceMinor;
    if (salePriceMinor === undefined && data.price !== undefined) {
      salePriceMinor = Math.round(data.price * 100);
    }
    let mrpMinor = data.mrpMinor;
    if (mrpMinor === undefined && data.mrp !== undefined) {
      mrpMinor = Math.round(data.mrp * 100);
    }
    const quantityOnHand = data.quantityOnHand !== undefined ? data.quantityOnHand : data.stock;
    let imageKeys = data.imageKeys ? [...data.imageKeys] : undefined;
    if (data.imageUrl) {
      imageKeys = [data.imageUrl, ...(imageKeys ?? [])];
    }
    return {
      ...data,
      salePriceMinor,
      mrpMinor,
      // Switching a product to digital clears physical stock in the same write.
      quantityOnHand: data.kind === 'digital' ? 0 : quantityOnHand,
      imageKeys,
    };
  });

const stockAdjustmentInput = z.object({
  quantityDelta: z
    .number()
    .int()
    .refine((value) => value !== 0),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().uuid(),
});

const discountInput = z
  .object({
    kind: z.enum(['percentage', 'fixed']),
    valueMinor: z.number().int().positive(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
  })
  .superRefine((value, context) => {
    if (value.kind === 'percentage' && value.valueMinor > 100) {
      context.addIssue({ code: 'custom', message: 'Percentage discounts cannot exceed 100' });
    }
    if (value.endsAt && value.startsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
      context.addIssue({ code: 'custom', message: 'endsAt must be after startsAt' });
    }
  });

const couponInput = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(50)
      .transform((value) => value.toUpperCase()),
    kind: z.enum(['percentage', 'fixed']),
    valueMinor: z.number().int().positive(),
    minimumOrderMinor: z.number().int().nonnegative().default(0),
    maximumDiscountMinor: z.number().int().positive().nullable().optional(),
    maxRedemptions: z.number().int().positive().nullable().optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    itemIds: z.array(z.string().uuid()).max(500).default([]),
  })
  .superRefine((value, context) => {
    if (value.kind === 'percentage' && value.valueMinor > 100) {
      context.addIssue({ code: 'custom', message: 'Percentage coupons cannot exceed 100' });
    }
    if (value.endsAt && value.startsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
      context.addIssue({ code: 'custom', message: 'endsAt must be after startsAt' });
    }
  });

/** Browser-renderable URL for an object-storage key (never a raw bucket URL). */
const mediaUrl = (key: string) => `${publicBaseUrl}/media?key=${encodeURIComponent(key)}`;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DIGITAL_BYTES = 50 * 1024 * 1024;

type UploadedFile = { fileName: string; contentType: string; bytes: Uint8Array };

/** Reads every File part named `field` out of a multipart form. */
type RequestFormData = Awaited<ReturnType<Request['formData']>>;

async function readUploads(
  form: RequestFormData,
  field: string,
  maxBytes = MAX_IMAGE_BYTES
): Promise<{ files: UploadedFile[]; tooLarge: string[] }> {
  const files: UploadedFile[] = [];
  const tooLarge: string[] = [];

  for (const entry of form.getAll(field)) {
    if (typeof entry === 'string') continue;
    const file = entry as File;
    if (file.size > maxBytes) {
      tooLarge.push(file.name || 'file');
      continue;
    }
    files.push({
      fileName: file.name || 'file',
      contentType: file.type || 'application/octet-stream',
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }

  return { files, tooLarge };
}

/** Cloudinary-compatible shape the admin UI already consumes. */
function describeImage(key: string, overrides: Record<string, any> = {}): Record<string, any> {
  const isAbsolute = /^https?:\/\//i.test(key);
  return {
    id: key,
    publicId: key,
    objectKey: isAbsolute ? null : key,
    folder: isAbsolute ? null : key.split('/').slice(0, -1).join('/') || null,
    format: key.includes('.') ? key.split('.').pop() : null,
    bytes: null,
    width: null,
    height: null,
    resourceType: 'image',
    productId: null,
    secureUrl: isAbsolute ? key : mediaUrl(key),
    url: isAbsolute ? key : mediaUrl(key),
    createdAt: null,
    ...overrides,
  };
}

/** Appends or promotes an image key on an item and returns the new key list. */
async function writeImageKeys(
  itemId: string,
  key: string,
  options: { primary?: boolean; remove?: boolean } = {}
): Promise<string[] | null> {
  const item = await db.query<{ image_keys: unknown }>(
    `SELECT image_keys FROM inventory_items WHERE id = $1 AND deleted_at IS NULL`,
    [itemId]
  );
  if (!item.rowCount) return null;

  const current: string[] = Array.isArray(item.rows[0].image_keys)
    ? (item.rows[0].image_keys as string[])
    : [];
  const without = current.filter((existing) => existing !== key);
  const next = options.remove ? without : options.primary ? [key, ...without] : [...without, key];

  await db.query(`UPDATE inventory_items SET image_keys = $1::jsonb WHERE id = $2`, [
    JSON.stringify(next),
    itemId,
  ]);

  return next;
}

/** Looks up a delivery by its unguessable token. */
async function findEntitlement(token: string) {
  if (!token) return null;
  const result = await db.query(`SELECT * FROM inventory_entitlements WHERE access_token = $1`, [
    token,
  ]);
  return result.rows[0] ?? null;
}

/** Shared gate used by the claim page and the byte-serving endpoint. */
function entitlementBlockReason(entitlement: Record<string, any>): string | null {
  if (entitlement.status !== 'active') return `This download link is ${entitlement.status}`;
  if (entitlement.expires_at && new Date(entitlement.expires_at) < new Date()) {
    return 'This download link has expired';
  }
  if (
    entitlement.download_limit != null &&
    entitlement.download_count >= entitlement.download_limit
  ) {
    return 'The download limit for this link has been reached';
  }
  return null;
}

/**
 * Shared fulfilment body for the admin and service-to-service routes.
 *
 * `rawBody` is supplied when the request body was already consumed for
 * signature verification — a request stream can only be read once.
 */
async function fulfilFromRequest(
  request: Request,
  set: { status?: number | string },
  rawBody?: string,
) {
  let body: Record<string, unknown> | null = null;
  try {
    body =
      rawBody !== undefined
        ? (JSON.parse(rawBody) as Record<string, unknown>)
        : ((await json(request)) as Record<string, unknown> | null);
  } catch {
    return invalid(set, { formErrors: ['Body must be valid JSON'] });
  }

  const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
  const customerEmail = typeof body?.customerEmail === 'string' ? body.customerEmail.trim() : '';
  const rawItems = Array.isArray(body?.items)
    ? (body.items as Array<Record<string, unknown>>)
    : [];

  if (!orderId) return invalid(set, { formErrors: ['orderId is required'] });
  if (!customerEmail) return invalid(set, { formErrors: ['customerEmail is required'] });
  if (!rawItems.length) {
    return invalid(set, { formErrors: ['items must contain at least one line'] });
  }

  const items: FulfillmentLine[] = [];
  for (const entry of rawItems) {
    const itemId = typeof entry?.itemId === 'string' ? entry.itemId : '';
    if (!itemId) return invalid(set, { formErrors: ['every item needs an itemId'] });
    items.push({
      itemId,
      orderItemId: typeof entry?.orderItemId === 'string' ? entry.orderItemId : null,
      quantity: Number(entry?.quantity ?? 1) || 1,
    });
  }

  try {
    const outcome = await fulfillOrder(
      {
        orderId,
        customerEmail,
        userId: typeof body?.userId === 'string' ? body.userId : null,
        items,
      },
      publicBaseUrl,
    );
    set.status = outcome.created ? 201 : 200;
    return { success: true, data: outcome };
  } catch (error) {
    if (error instanceof FulfillmentError) {
      set.status = error.status;
      return { success: false, error: error.message };
    }
    console.error('[INVENTORY] Fulfilment failed:', error);
    set.status = 500;
    return { success: false, error: 'Unable to fulfil the digital items' };
  }
}

async function json(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

async function admin(request: Request): Promise<string | null> {
  return getAdminUserId(request);
}

function forbidden(set: { status?: number | string }) {
  set.status = 403;
  return { success: false, error: 'Admin access is required' };
}

function invalid(set: { status?: number | string }, details: unknown) {
  set.status = 422;
  return { success: false, error: 'Invalid request', details };
}

function formatItem(row: Record<string, any>): Record<string, any> {
  const imageKeys = Array.isArray(row.image_keys) ? row.image_keys : [];
  const imageUrl = imageKeys[0] || null;
  const price = row.sale_price_minor !== undefined ? row.sale_price_minor / 100 : 0;
  const mrp = row.mrp_minor !== undefined ? row.mrp_minor / 100 : price;
  const kind = row.kind === 'digital' ? 'digital' : 'physical';
  return {
    ...row,
    price,
    mrp,
    stock: row.quantity_on_hand ?? 0,
    imageKeys,
    imageUrl,
    image_url: imageUrl,
    isListed: row.is_active ?? true,
    kind,
    deliveryMode: row.delivery_mode ?? 'files',
    downloadLimit: row.download_limit ?? null,
    digitalInstructions: row.digital_instructions ?? null,
    isDigital: kind === 'digital',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Merges deliverable/key counts into formatted rows.
 *
 * Digital availability is derived, never hand-entered: a license-key product is
 * "in stock" when keys remain in the pool, and a file product is unlimited.
 */
async function decorateItems(
  items: Array<Record<string, any>>
): Promise<Array<Record<string, any>>> {
  const digitalIds = items.filter((item) => item.kind === 'digital').map((item) => item.id);
  if (!digitalIds.length) return items;

  const summaries = await digitalSummaries(digitalIds);

  for (const item of items) {
    if (item.kind !== 'digital') continue;
    const summary = summaries.get(item.id) ?? { assets: 0, keysAvailable: 0, keysTotal: 0 };
    // Counters only: `assets` stays an array of image assets for the admin
    // gallery, so the deliverable count is exposed as `assetsCount`.
    item.assetsCount = summary.assets;
    item.keysAvailable = summary.keysAvailable;
    item.keysTotal = summary.keysTotal;
    item.sellsFiles = deliversFiles(item.deliveryMode);
    item.sellsLicenseKeys = deliversKeys(item.deliveryMode);
    if (item.sellsLicenseKeys) {
      item.stock = summary.keysAvailable;
      item.quantityOnHand = summary.keysAvailable;
    } else {
      item.stock = null;
      item.unlimited = true;
    }
  }

  return items;
}

const app = new Elysia()
  .use(
    cors({
      origin: (request: Request) => {
        const origin = request.headers.get('origin');
        if (!origin) return true;
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return true;
        // Allow localhost and local IP origins in development
        if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
        return false;
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  )
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

  // ----------------------------------------------------
  // PUBLIC STOREFRONT PRODUCTS APIS
  // ----------------------------------------------------
  .get('/products', async ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get('search');
    const category = url.searchParams.get('category');
    const sort = url.searchParams.get('sort') || 'newest';
    const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 200);

    let orderBy = 'updated_at DESC';
    if (sort === 'oldest') orderBy = 'created_at ASC';
    else if (sort === 'name') orderBy = 'name ASC';
    else if (sort === 'priceAsc') orderBy = 'sale_price_minor ASC';
    else if (sort === 'priceDesc') orderBy = 'sale_price_minor DESC';
    else if (sort === 'stockAsc') orderBy = 'quantity_on_hand ASC';

    const result = await db.query(
      `SELECT * FROM inventory_items
       WHERE is_active = true AND deleted_at IS NULL
         AND ($1::text IS NULL OR sku ILIKE '%' || $1 || '%' OR name ILIKE '%' || $1 || '%')
         AND ($2::text IS NULL OR category ILIKE $2)
       ORDER BY ${orderBy} LIMIT $3`,
      [search, category, limit]
    );
    const items = await decorateItems(result.rows.map(formatItem));
    return {
      success: true,
      data: {
        items,
        total: items.length,
        nextCursor: null,
      },
    };
  })
  .get('/inventory/products', async ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get('search');
    const category = url.searchParams.get('category');
    const sort = url.searchParams.get('sort') || 'newest';
    const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 200);

    let orderBy = 'updated_at DESC';
    if (sort === 'oldest') orderBy = 'created_at ASC';
    else if (sort === 'name') orderBy = 'name ASC';
    else if (sort === 'priceAsc') orderBy = 'sale_price_minor ASC';
    else if (sort === 'priceDesc') orderBy = 'sale_price_minor DESC';
    else if (sort === 'stockAsc') orderBy = 'quantity_on_hand ASC';

    const result = await db.query(
      `SELECT * FROM inventory_items
       WHERE is_active = true AND deleted_at IS NULL
         AND ($1::text IS NULL OR sku ILIKE '%' || $1 || '%' OR name ILIKE '%' || $1 || '%')
         AND ($2::text IS NULL OR category ILIKE $2)
       ORDER BY ${orderBy} LIMIT $3`,
      [search, category, limit]
    );
    const items = await decorateItems(result.rows.map(formatItem));
    return {
      success: true,
      data: {
        items,
        total: items.length,
        nextCursor: null,
      },
    };
  })
  .get('/products/:id', async ({ params, set }) => {
    const result = await db.query(
      `SELECT * FROM inventory_items WHERE id = $1 AND is_active = true AND deleted_at IS NULL`,
      [params.id]
    );
    if (!result.rowCount) {
      set.status = 404;
      return { success: false, error: 'Product not found' };
    }
    const [product] = await decorateItems([formatItem(result.rows[0])]);
    return { success: true, data: product };
  })
  .get('/inventory/products/:id', async ({ params, set }) => {
    const result = await db.query(
      `SELECT * FROM inventory_items WHERE id = $1 AND is_active = true AND deleted_at IS NULL`,
      [params.id]
    );
    if (!result.rowCount) {
      set.status = 404;
      return { success: false, error: 'Product not found' };
    }
    const [product] = await decorateItems([formatItem(result.rows[0])]);
    return { success: true, data: product };
  })
  .get('/categories', async () => {
    const result = await db.query(
      `SELECT category, COUNT(*)::int as count FROM inventory_items
       WHERE is_active = true AND deleted_at IS NULL AND category IS NOT NULL
       GROUP BY category ORDER BY category ASC`
    );
    return { success: true, data: result.rows };
  })
  .get('/inventory/categories', async () => {
    const result = await db.query(
      `SELECT category, COUNT(*)::int as count FROM inventory_items
       WHERE is_active = true AND deleted_at IS NULL AND category IS NOT NULL
       GROUP BY category ORDER BY category ASC`
    );
    return { success: true, data: result.rows };
  })

  // ----------------------------------------------------
  // PRE-ORDER APIS (Public - for customers)
  // ----------------------------------------------------
  .get('/pre-orders/product/:productId', async ({ params, set }) => {
    // Check if product exists and is available for pre-order
    const productResult = await db.query(
      `SELECT * FROM inventory_items WHERE id = $1 AND deleted_at IS NULL`,
      [params.productId]
    );
    if (!productResult.rowCount) {
      set.status = 404;
      return { success: false, error: 'Product not found' };
    }
    const product = productResult.rows[0];
    return {
      success: true,
      data: {
        product: formatItem(product),
        canPreOrder: !product.is_active || product.quantity_on_hand === 0,
      },
    };
  })
  .post('/pre-orders', async ({ request, set }) => {
    const preOrderInput = z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive().default(1),
      customerEmail: z.string().email(),
      customerName: z.string().trim().min(1).max(200).optional(),
      customerPhone: z.string().trim().max(20).optional(),
      notes: z.string().trim().max(1000).optional(),
    });

    const rawBody = await json(request);
    const parsed = preOrderInput.safeParse(rawBody);
    if (!parsed.success) return invalid(set, parsed.error.flatten());

    const input = parsed.data;
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Check product exists
      const productResult = await client.query(
        `SELECT * FROM inventory_items WHERE id = $1 AND deleted_at IS NULL`,
        [input.productId]
      );
      if (!productResult.rowCount) {
        await client.query('ROLLBACK');
        set.status = 404;
        return { success: false, error: 'Product not found' };
      }
      const product = productResult.rows[0];

      // Create pre-order
      const preOrderId = randomUUID();
      const preOrderResult = await client.query(
        `INSERT INTO pre_orders (id, user_id, product_id, quantity, status, customer_email, customer_name, customer_phone, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now()) RETURNING *`,
        [
          preOrderId,
          'guest',
          input.productId,
          input.quantity,
          'pending',
          input.customerEmail,
          input.customerName || null,
          input.customerPhone || null,
          input.notes || null,
        ]
      );

      await client.query('COMMIT');

      // Send email notifications via email service
      const preOrder = preOrderResult.rows[0];
      const emailPayload = {
        preOrder: {
          id: preOrder.id,
          productId: product.id,
          productName: product.name,
          productDescription: product.description,
          productCategory: product.category,
          productPrice: product.sale_price_minor ? product.sale_price_minor / 100 : 0,
          productMrp: product.mrp_minor ? product.mrp_minor / 100 : 0,
          productImage:
            Array.isArray(product.image_keys) && product.image_keys.length > 0
              ? product.image_keys[0]
              : null,
          quantity: preOrder.quantity,
          totalAmount:
            (product.sale_price_minor ? product.sale_price_minor / 100 : 0) * preOrder.quantity,
          customerEmail: preOrder.customer_email,
          customerName: preOrder.customer_name,
          customerPhone: preOrder.customer_phone,
          notes: preOrder.notes,
          createdAt: preOrder.created_at,
        },
      };

      // Fire and forget - don't wait for email service
      fetch(`${emailServiceUrl}/send-pre-order-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailPayload),
      }).catch((err) => console.error('[INVENTORY] Failed to queue pre-order emails:', err));

      set.status = 201;
      return { success: true, data: preOrderResult.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Pre-order creation error:', error);
      set.status = 500;
      return { success: false, error: 'Failed to create pre-order' };
    } finally {
      client.release();
    }
  })

  // ----------------------------------------------------
  // ADMIN INVENTORY APIS
  // ----------------------------------------------------
  .get('/admin/inventory/items', async ({ request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const url = new URL(request.url);
    const search = url.searchParams.get('search');
    const result = await db.query(
      `SELECT * FROM inventory_items
       WHERE deleted_at IS NULL
         AND ($1::text IS NULL OR sku ILIKE '%' || $1 || '%' OR name ILIKE '%' || $1 || '%')
       ORDER BY updated_at DESC LIMIT 100`,
      [search]
    );
    const formatted = await decorateItems(result.rows.map(formatItem));
    return {
      success: true,
      data: formatted,
      items: formatted,
      total: formatted.length,
      nextCursor: null,
    };
  })
  .get('/admin/products', async ({ request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const url = new URL(request.url);
    const search = url.searchParams.get('search');
    const sort = url.searchParams.get('sort') || 'newest';
    const lowStockAt = url.searchParams.get('lowStockAt');
    const kind = url.searchParams.get('kind');

    let orderBy = 'updated_at DESC';
    if (sort === 'stockAsc') orderBy = 'quantity_on_hand ASC';
    else if (sort === 'name') orderBy = 'name ASC';
    else if (sort === 'priceAsc') orderBy = 'sale_price_minor ASC';
    else if (sort === 'priceDesc') orderBy = 'sale_price_minor DESC';

    const result = await db.query(
      `SELECT * FROM inventory_items
       WHERE deleted_at IS NULL
         AND ($1::text IS NULL OR sku ILIKE '%' || $1 || '%' OR name ILIKE '%' || $1 || '%')
         AND ($2::int IS NULL OR (kind = 'physical' AND quantity_on_hand <= $2))
         AND ($3::text IS NULL OR kind = $3)
       ORDER BY ${orderBy} LIMIT 100`,
      [search, lowStockAt ? Number(lowStockAt) : null, kind]
    );
    const items = await decorateItems(result.rows.map(formatItem));
    return { success: true, data: { items, total: items.length, nextCursor: null } };
  })
  .get('/admin/summary', async ({ request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const stats = await db.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active = true)::int AS listed,
        COUNT(*) FILTER (WHERE is_active = false)::int AS unlisted,
        COUNT(*) FILTER (WHERE kind = 'digital')::int AS digital,
        COUNT(*) FILTER (WHERE kind = 'physical')::int AS physical,
        COALESCE(SUM(quantity_on_hand), 0)::int AS on_hand,
        COUNT(*) FILTER (WHERE kind = 'physical' AND quantity_on_hand = 0)::int AS out_of_stock,
        COUNT(*) FILTER (WHERE kind = 'physical' AND quantity_on_hand <= 5 AND quantity_on_hand > 0)::int AS low_stock,
        COALESCE(SUM((sale_price_minor / 100.0) * quantity_on_hand), 0)::float AS value,
        (SELECT COUNT(*) FROM inventory_digital_assets WHERE is_active)::int AS assets,
        (SELECT COUNT(*) FROM inventory_digital_keys WHERE status = 'available')::int AS keys_available,
        (SELECT COUNT(*) FROM inventory_entitlements WHERE status = 'active')::int AS entitlements
      FROM inventory_items WHERE deleted_at IS NULL
    `);
    const s = stats.rows[0];
    return {
      success: true,
      data: {
        products: {
          total: s.total,
          listed: s.listed,
          unlisted: s.unlisted,
          digital: s.digital,
          physical: s.physical,
        },
        stock: {
          onHand: s.on_hand,
          outOfStock: s.out_of_stock,
          lowStock: s.low_stock,
          lowStockAt: 5,
          value: s.value,
        },
        digital: {
          assets: s.assets,
          keysAvailable: s.keys_available,
          activeEntitlements: s.entitlements,
        },
        assets: s.assets,
      },
    };
  })
  .get('/admin/movements', async ({ request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const limit = Math.min(Number(new URL(request.url).searchParams.get('limit')) || 50, 200);
    const result = await db.query(
      `SELECT m.*, i.name as product_name, i.sku as product_sku
       FROM inventory_stock_movements m
       JOIN inventory_items i ON i.id = m.item_id
       ORDER BY m.created_at DESC LIMIT $1`,
      [limit]
    );
    const movements = result.rows.map((r) => ({
      id: r.id,
      productId: r.item_id,
      delta: r.quantity_delta,
      reason: r.reason,
      reference: r.idempotency_key,
      createdAt: r.created_at,
      product: { id: r.item_id, sku: r.product_sku, name: r.product_name },
    }));
    return { success: true, data: movements };
  })
  .get('/admin/pre-orders', async ({ request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search')?.trim();
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
    const offset = Number(url.searchParams.get('offset')) || 0;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND po.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (po.id::text ILIKE $${paramIndex} OR po.customer_email ILIKE $${paramIndex} OR COALESCE(po.customer_name, '') ILIKE $${paramIndex} OR i.name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    params.push(limit);
    paramIndex++;
    params.push(offset);
    paramIndex++;

    const result = await db.query(
      `SELECT po.*, i.name as product_name, i.sku as product_sku, i.sale_price_minor, i.mrp_minor, i.image_keys
       FROM pre_orders po
       JOIN inventory_items i ON i.id = po.product_id
       ${whereClause}
       ORDER BY po.created_at DESC LIMIT $${paramIndex - 2} OFFSET $${paramIndex - 1}`,
      params
    );

    const countResult = await db.query(
      `SELECT COUNT(*)::int as total FROM pre_orders po JOIN inventory_items i ON i.id = po.product_id ${whereClause}`,
      params.slice(0, -2)
    );

    const preOrders = result.rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      quantity: r.quantity,
      status: r.status,
      customerEmail: r.customer_email,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      product: {
        id: r.product_id,
        sku: r.product_sku,
        name: r.product_name,
        price: r.sale_price_minor ? r.sale_price_minor / 100 : 0,
        mrp: r.mrp_minor ? r.mrp_minor / 100 : 0,
        imageUrl: Array.isArray(r.image_keys) && r.image_keys.length > 0 ? r.image_keys[0] : null,
      },
      totalAmount: (r.sale_price_minor ? r.sale_price_minor / 100 : 0) * r.quantity,
    }));

    // Keep every collection endpoint consistent: clients unwrap `data` and
    // expect both the records and pagination metadata there.
    return {
      success: true,
      data: { items: preOrders, total: countResult.rows[0]?.total || 0 },
    };
  })
  .get('/admin/pre-orders/:id', async ({ params, request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const result = await db.query(
      `SELECT po.*, i.name as product_name, i.sku as product_sku, i.sale_price_minor, i.mrp_minor, i.image_keys, i.description as product_description, i.category as product_category
       FROM pre_orders po
       JOIN inventory_items i ON i.id = po.product_id
       WHERE po.id = $1`,
      [params.id]
    );
    if (!result.rowCount) {
      set.status = 404;
      return { success: false, error: 'Pre-order not found' };
    }
    const r = result.rows[0];
    return {
      success: true,
      data: {
        id: r.id,
        productId: r.product_id,
        quantity: r.quantity,
        status: r.status,
        customerEmail: r.customer_email,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        notes: r.notes,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        product: {
          id: r.product_id,
          sku: r.product_sku,
          name: r.product_name,
          description: r.product_description,
          category: r.product_category,
          price: r.sale_price_minor ? r.sale_price_minor / 100 : 0,
          mrp: r.mrp_minor ? r.mrp_minor / 100 : 0,
          imageUrl: Array.isArray(r.image_keys) && r.image_keys.length > 0 ? r.image_keys[0] : null,
        },
        totalAmount: (r.sale_price_minor ? r.sale_price_minor / 100 : 0) * r.quantity,
      },
    };
  })
  .patch('/admin/pre-orders/:id', async ({ params, request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const updateInput = z.object({
      status: z.enum(['pending', 'confirmed', 'cancelled', 'fulfilled']).optional(),
      customerName: z.string().trim().min(1).max(200).optional(),
      customerPhone: z.string().trim().max(20).optional(),
      notes: z.string().trim().max(1000).optional(),
    });

    const rawBody = await json(request);
    const parsed = updateInput.safeParse(rawBody);
    if (!parsed.success) return invalid(set, parsed.error.flatten());

    const input = parsed.data;
    const fields: Array<[string, unknown]> = [
      ['status', input.status],
      ['customer_name', input.customerName],
      ['customer_phone', input.customerPhone],
      ['notes', input.notes],
    ].filter(([, value]) => value !== undefined) as Array<[string, unknown]>;

    if (!fields.length) return invalid(set, { formErrors: ['No editable fields supplied'] });

    const values = fields.map(([, value]) => value);
    const assignments = fields.map(([column], index) => `${column} = $${index + 1}`);

    try {
      const result = await db.query(
        `UPDATE pre_orders SET ${assignments.join(', ')}, updated_at = now() WHERE id = $${values.length + 1} RETURNING *`,
        [...values, params.id]
      );
      if (!result.rowCount) {
        set.status = 404;
        return { success: false, error: 'Pre-order not found' };
      }
      return { success: true, data: result.rows[0] };
    } catch {
      set.status = 422;
      return { success: false, error: 'Invalid update' };
    }
  })
  .delete('/admin/pre-orders/:id', async ({ params, request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const result = await db.query(
      `UPDATE pre_orders SET status = 'cancelled', updated_at = now() WHERE id = $1 RETURNING *`,
      [params.id]
    );
    if (!result.rowCount) {
      set.status = 404;
      return { success: false, error: 'Pre-order not found' };
    }
    return { success: true, data: { id: params.id, cancelled: true } };
  })
  .post('/admin/inventory/items', async ({ request, set }) => {
    const userId = await admin(request);
    if (!userId) return forbidden(set);
    const rawBody = await json(request);
    const parsed = itemInput.safeParse(rawBody);
    if (!parsed.success) return invalid(set, parsed.error.flatten());
    const item = parsed.data;
    const id = randomUUID();
    try {
      const result = await db.query(
        `INSERT INTO inventory_items
          (id, sku, name, description, category, image_keys, mrp_minor, sale_price_minor, quantity_on_hand, is_active, created_by,
           kind, delivery_mode, download_limit, digital_instructions)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [
          id,
          item.sku,
          item.name,
          item.description,
          item.category ?? null,
          JSON.stringify(item.imageKeys),
          item.mrpMinor,
          item.salePriceMinor,
          item.quantityOnHand,
          item.isListed ?? true,
          userId,
          item.kind,
          item.deliveryMode,
          item.downloadLimit ?? null,
          item.digitalInstructions ?? null,
        ]
      );
      if (item.quantityOnHand > 0) {
        await db.query(
          `INSERT INTO inventory_stock_movements
            (id, item_id, quantity_delta, quantity_before, quantity_after, reason, idempotency_key, performed_by)
           VALUES ($1,$2,$3,0,$3,'initial inventory',$4,$5)`,
          [randomUUID(), id, item.quantityOnHand, `initial:${id}`, userId]
        );
      }
      set.status = 201;
      const [product] = await decorateItems([formatItem(result.rows[0])]);
      return { success: true, data: product };
    } catch {
      set.status = 409;
      return { success: false, error: 'An item with this SKU already exists' };
    }
  })
  .post('/products', async ({ request, set }) => {
    const userId = await admin(request);
    if (!userId) return forbidden(set);
    const rawBody = await json(request);
    const parsed = itemInput.safeParse(rawBody);
    if (!parsed.success) return invalid(set, parsed.error.flatten());
    const item = parsed.data;
    const id = randomUUID();
    try {
      const result = await db.query(
        `INSERT INTO inventory_items
          (id, sku, name, description, category, image_keys, mrp_minor, sale_price_minor, quantity_on_hand, is_active, created_by,
           kind, delivery_mode, download_limit, digital_instructions)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [
          id,
          item.sku,
          item.name,
          item.description,
          item.category ?? null,
          JSON.stringify(item.imageKeys),
          item.mrpMinor,
          item.salePriceMinor,
          item.quantityOnHand,
          item.isListed ?? true,
          userId,
          item.kind,
          item.deliveryMode,
          item.downloadLimit ?? null,
          item.digitalInstructions ?? null,
        ]
      );
      if (item.quantityOnHand > 0) {
        await db.query(
          `INSERT INTO inventory_stock_movements
            (id, item_id, quantity_delta, quantity_before, quantity_after, reason, idempotency_key, performed_by)
           VALUES ($1,$2,$3,0,$3,'initial inventory',$4,$5)`,
          [randomUUID(), id, item.quantityOnHand, `initial:${id}`, userId]
        );
      }
      set.status = 201;
      const [product] = await decorateItems([formatItem(result.rows[0])]);
      return { success: true, data: product };
    } catch {
      set.status = 409;
      return { success: false, error: 'An item with this SKU already exists' };
    }
  })
  .get('/admin/inventory/items/:id', async ({ params, request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const result = await db.query(
      `SELECT i.*, COALESCE(json_agg(d.*) FILTER (WHERE d.id IS NOT NULL), '[]') AS discounts
       FROM inventory_items i LEFT JOIN inventory_item_discounts d ON d.item_id = i.id
       WHERE i.id = $1 AND i.deleted_at IS NULL GROUP BY i.id`,
      [params.id]
    );
    if (!result.rowCount) {
      set.status = 404;
      return { success: false, error: 'Item not found' };
    }
    const [product] = await decorateItems([formatItem(result.rows[0])]);
    return { success: true, data: product };
  })
  .patch('/admin/inventory/items/:id', async ({ params, request, set }) => {
    const userId = await admin(request);
    if (!userId) return forbidden(set);
    const rawBody = await json(request);
    const parsed = updateItemInput.safeParse(rawBody);
    if (!parsed.success) return invalid(set, parsed.error.flatten());
    const input = parsed.data;

    const fields: Array<[string, unknown]> = [
      ['sku', input.sku],
      ['name', input.name],
      ['description', input.description],
      ['category', input.category],
      ['image_keys', input.imageKeys ? JSON.stringify(input.imageKeys) : undefined],
      ['mrp_minor', input.mrpMinor],
      ['sale_price_minor', input.salePriceMinor],
      ['quantity_on_hand', input.quantityOnHand],
      ['is_active', input.isListed !== undefined ? input.isListed : input.isActive],
      ['kind', input.kind],
      ['delivery_mode', input.deliveryMode],
      ['download_limit', input.downloadLimit],
      ['digital_instructions', input.digitalInstructions],
    ].filter(([, value]) => value !== undefined) as Array<[string, unknown]>;

    if (!fields.length) return invalid(set, { formErrors: ['No editable fields supplied'] });

    const values = fields.map(([, value]) => value);
    const assignments = fields.map(
      ([column], index) => `${column} = $${index + 1}${column === 'image_keys' ? '::jsonb' : ''}`
    );

    try {
      const result = await db.query(
        `UPDATE inventory_items SET ${assignments.join(', ')} WHERE id = $${values.length + 1} AND deleted_at IS NULL RETURNING *`,
        [...values, params.id]
      );
      if (!result.rowCount) {
        set.status = 404;
        return { success: false, error: 'Item not found' };
      }
      const [product] = await decorateItems([formatItem(result.rows[0])]);
      return { success: true, data: product };
    } catch {
      set.status = 422;
      return { success: false, error: 'The requested price, stock or SKU change is invalid' };
    }
  })
  .patch('/products/:id', async ({ params, request, set }) => {
    const userId = await admin(request);
    if (!userId) return forbidden(set);
    const rawBody = await json(request);
    const parsed = updateItemInput.safeParse(rawBody);
    if (!parsed.success) return invalid(set, parsed.error.flatten());
    const input = parsed.data;

    const fields: Array<[string, unknown]> = [
      ['sku', input.sku],
      ['name', input.name],
      ['description', input.description],
      ['category', input.category],
      ['image_keys', input.imageKeys ? JSON.stringify(input.imageKeys) : undefined],
      ['mrp_minor', input.mrpMinor],
      ['sale_price_minor', input.salePriceMinor],
      ['quantity_on_hand', input.quantityOnHand],
      ['is_active', input.isListed !== undefined ? input.isListed : input.isActive],
      ['kind', input.kind],
      ['delivery_mode', input.deliveryMode],
      ['download_limit', input.downloadLimit],
      ['digital_instructions', input.digitalInstructions],
    ].filter(([, value]) => value !== undefined) as Array<[string, unknown]>;

    if (!fields.length) return invalid(set, { formErrors: ['No editable fields supplied'] });

    const values = fields.map(([, value]) => value);
    const assignments = fields.map(
      ([column], index) => `${column} = $${index + 1}${column === 'image_keys' ? '::jsonb' : ''}`
    );

    try {
      const result = await db.query(
        `UPDATE inventory_items SET ${assignments.join(', ')} WHERE id = $${values.length + 1} AND deleted_at IS NULL RETURNING *`,
        [...values, params.id]
      );
      if (!result.rowCount) {
        set.status = 404;
        return { success: false, error: 'Item not found' };
      }
      const [product] = await decorateItems([formatItem(result.rows[0])]);
      return { success: true, data: product };
    } catch {
      set.status = 422;
      return { success: false, error: 'The requested price, stock or SKU change is invalid' };
    }
  })
  .delete('/admin/inventory/items/:id', async ({ params, request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const result = await db.query(
      `UPDATE inventory_items SET is_active = false, deleted_at = now()
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [params.id]
    );
    if (!result.rowCount) {
      set.status = 404;
      return { success: false, error: 'Item not found' };
    }
    return {
      success: true,
      data: { id: params.id, deleted: true, product: formatItem(result.rows[0]) },
    };
  })
  .delete('/products/:id', async ({ params, request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const result = await db.query(
      `UPDATE inventory_items SET is_active = false, deleted_at = now()
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [params.id]
    );
    if (!result.rowCount) {
      set.status = 404;
      return { success: false, error: 'Item not found' };
    }
    return {
      success: true,
      data: { id: params.id, deleted: true, product: formatItem(result.rows[0]) },
    };
  })
  .post('/admin/inventory/items/:id/stock-adjustments', async ({ params, request, set }) => {
    const userId = await admin(request);
    if (!userId) return forbidden(set);
    const parsed = stockAdjustmentInput.safeParse(await json(request));
    if (!parsed.success) return invalid(set, parsed.error.flatten());
    const input = parsed.data;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const replay = await client.query(
        `SELECT * FROM inventory_stock_movements WHERE idempotency_key = $1`,
        [input.idempotencyKey]
      );
      if (replay.rowCount) {
        await client.query('COMMIT');
        return { success: true, data: replay.rows[0], replayed: true };
      }
      const item = await client.query<{ quantity_on_hand: number; kind: string }>(
        `SELECT quantity_on_hand, kind FROM inventory_items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [params.id]
      );
      if (!item.rowCount) {
        await client.query('ROLLBACK');
        set.status = 404;
        return { success: false, error: 'Item not found' };
      }
      if (isDigital(item.rows[0].kind)) {
        await client.query('ROLLBACK');
        set.status = 409;
        return {
          success: false,
          error: 'Digital products have no stock; manage license keys instead',
        };
      }
      const before = item.rows[0].quantity_on_hand;
      const after = before + input.quantityDelta;
      if (after < 0) {
        await client.query('ROLLBACK');
        set.status = 409;
        return { success: false, error: 'Stock cannot become negative' };
      }
      await client.query(`UPDATE inventory_items SET quantity_on_hand = $1 WHERE id = $2`, [
        after,
        params.id,
      ]);
      const movement = await client.query(
        `INSERT INTO inventory_stock_movements
          (id,item_id,quantity_delta,quantity_before,quantity_after,reason,idempotency_key,performed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          randomUUID(),
          params.id,
          input.quantityDelta,
          before,
          after,
          input.reason,
          input.idempotencyKey,
          userId,
        ]
      );
      await client.query('COMMIT');
      return { success: true, data: movement.rows[0] };
    } catch {
      await client.query('ROLLBACK');
      set.status = 500;
      return { success: false, error: 'Unable to adjust stock' };
    } finally {
      client.release();
    }
  })
  .post('/products/:id/stock', async ({ params, request, set }) => {
    const userId = await admin(request);
    if (!userId) return forbidden(set);
    const body = (await json(request)) as {
      delta?: number;
      stock?: number;
      reason?: string;
      reference?: string;
    };
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const item = await client.query(
        `SELECT * FROM inventory_items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [params.id]
      );
      if (!item.rowCount) {
        await client.query('ROLLBACK');
        set.status = 404;
        return { success: false, error: 'Product not found' };
      }
      if (isDigital(item.rows[0].kind)) {
        await client.query('ROLLBACK');
        set.status = 409;
        return {
          success: false,
          error: 'Digital products have no stock; manage license keys instead',
        };
      }
      const before = item.rows[0].quantity_on_hand;
      const after = body.stock !== undefined ? body.stock : before + (body.delta ?? 0);
      if (after < 0) {
        await client.query('ROLLBACK');
        set.status = 409;
        return { success: false, error: 'Stock cannot be negative' };
      }
      const delta = after - before;
      const updatedItem = await client.query(
        `UPDATE inventory_items SET quantity_on_hand = $1 WHERE id = $2 RETURNING *`,
        [after, params.id]
      );
      let movementRow = null;
      if (delta !== 0) {
        const movement = await client.query(
          `INSERT INTO inventory_stock_movements
            (id,item_id,quantity_delta,quantity_before,quantity_after,reason,idempotency_key,performed_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [
            randomUUID(),
            params.id,
            delta,
            before,
            after,
            body.reason || 'Manual adjustment',
            randomUUID(),
            userId,
          ]
        );
        movementRow = movement.rows[0];
      }
      await client.query('COMMIT');
      return {
        success: true,
        data: {
          product: formatItem(updatedItem.rows[0]),
          movement: movementRow,
        },
      };
    } catch {
      await client.query('ROLLBACK');
      set.status = 500;
      return { success: false, error: 'Unable to set stock' };
    } finally {
      client.release();
    }
  })
  .post('/admin/inventory/items/:id/discounts', async ({ params, request, set }) => {
    const userId = await admin(request);
    if (!userId) return forbidden(set);
    const parsed = discountInput.safeParse(await json(request));
    if (!parsed.success) return invalid(set, parsed.error.flatten());
    const input = parsed.data;
    await db.query(
      `UPDATE inventory_item_discounts SET is_active = false WHERE item_id = $1 AND is_active`,
      [params.id]
    );
    const result = await db.query(
      `INSERT INTO inventory_item_discounts (id,item_id,kind,value_minor,starts_at,ends_at,created_by)
       VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz,now()),$6,$7) RETURNING *`,
      [
        randomUUID(),
        params.id,
        input.kind,
        input.valueMinor,
        input.startsAt ?? null,
        input.endsAt ?? null,
        userId,
      ]
    );
    set.status = 201;
    return { success: true, data: result.rows[0] };
  })
  .get('/admin/inventory/coupons', async ({ request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const result = await db.query(
      `SELECT * FROM inventory_coupons ORDER BY created_at DESC LIMIT 100`
    );
    return { success: true, data: result.rows };
  })
  .post('/admin/inventory/coupons', async ({ request, set }) => {
    const userId = await admin(request);
    if (!userId) return forbidden(set);
    const parsed = couponInput.safeParse(await json(request));
    if (!parsed.success) return invalid(set, parsed.error.flatten());
    const input = parsed.data;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const coupon = await client.query(
        `INSERT INTO inventory_coupons
          (id,code,kind,value_minor,minimum_order_minor,maximum_discount_minor,max_redemptions,starts_at,ends_at,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz,now()),$9,$10) RETURNING *`,
        [
          randomUUID(),
          input.code,
          input.kind,
          input.valueMinor,
          input.minimumOrderMinor,
          input.maximumDiscountMinor ?? null,
          input.maxRedemptions ?? null,
          input.startsAt ?? null,
          input.endsAt ?? null,
          userId,
        ]
      );
      for (const itemId of input.itemIds) {
        await client.query(
          `INSERT INTO inventory_coupon_items (coupon_id,item_id) VALUES ($1,$2)`,
          [coupon.rows[0].id, itemId]
        );
      }
      await client.query('COMMIT');
      set.status = 201;
      return { success: true, data: coupon.rows[0] };
    } catch {
      await client.query('ROLLBACK');
      set.status = 422;
      return { success: false, error: 'Coupon code or item scope is invalid' };
    } finally {
      client.release();
    }
  })
  .delete('/admin/inventory/coupons/:id', async ({ params, request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const result = await db.query(
      `UPDATE inventory_coupons SET is_active = false WHERE id = $1 AND is_active RETURNING id`,
      [params.id]
    );
    if (!result.rowCount) {
      set.status = 404;
      return { success: false, error: 'Active coupon not found' };
    }
    return { success: true, data: { id: params.id, deactivated: true } };
  })
  // ----------------------------------------------------
  // DIGITAL INVENTORY ROUTES
  // ----------------------------------------------------
  // ----------------------------------------------------
  // PRODUCT IMAGE ASSETS (Neon Object Storage backed)
  // ----------------------------------------------------
  .get('/assets', async ({ request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const url = new URL(request.url);
    const productId = url.searchParams.get('productId');

    if (productId) {
      const item = await db.query<{ image_keys: unknown }>(
        `SELECT image_keys FROM inventory_items WHERE id = $1 AND deleted_at IS NULL`,
        [productId]
      );
      if (!item.rowCount) {
        set.status = 404;
        return { success: false, error: 'Product not found' };
      }
      const keys = Array.isArray(item.rows[0].image_keys)
        ? (item.rows[0].image_keys as string[])
        : [];
      return { success: true, data: keys.map((key) => describeImage(key, { productId })) };
    }

    const result = await db.query<{ key: string }>(
      `SELECT DISTINCT jsonb_array_elements_text(image_keys) AS key
         FROM inventory_items WHERE deleted_at IS NULL LIMIT 500`
    );
    return { success: true, data: result.rows.map((row) => describeImage(row.key)) };
  })
  .post('/assets', async ({ request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const form = await request.formData().catch(() => null);
    if (!form) return invalid(set, { formErrors: ['Expected multipart/form-data'] });

    const productId =
      typeof form.get('productId') === 'string' ? String(form.get('productId')) : null;
    const folderValue = form.get('folder');
    const folder = typeof folderValue === 'string' && folderValue ? folderValue : 'product-images';

    const { files, tooLarge } = await readUploads(form, 'files', MAX_IMAGE_BYTES);
    if (tooLarge.length) {
      set.status = 413;
      return {
        success: false,
        error: `Each image must be under ${MAX_IMAGE_BYTES / 1024 / 1024}MB`,
        details: tooLarge,
      };
    }
    if (!files.length) return invalid(set, { formErrors: ['No image files supplied'] });

    try {
      const uploaded: Array<Record<string, any>> = [];
      for (const [index, file] of files.entries()) {
        const key = buildObjectKey(file.fileName, folder);
        await putObject({ key, body: file.bytes, contentType: file.contentType });
        // The first file of a product upload becomes its primary image.
        if (productId && index === 0) await writeImageKeys(productId, key, { primary: true });
        uploaded.push(describeImage(key, { productId, bytes: file.bytes.byteLength }));
      }
      set.status = 201;
      return { success: true, data: uploaded };
    } catch (error) {
      console.error('[INVENTORY] Image upload failed:', error);
      set.status = 502;
      return { success: false, error: 'Object storage upload failed' };
    }
  })
  .patch('/assets', async ({ request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const key = new URL(request.url).searchParams.get('key');
    if (!key) return invalid(set, { formErrors: ['key query parameter is required'] });

    const body = (await json(request)) as { productId?: string | null; primary?: boolean } | null;

    if (body?.productId) {
      const keys = await writeImageKeys(body.productId, key, { primary: body.primary ?? false });
      if (!keys) {
        set.status = 404;
        return { success: false, error: 'Product not found' };
      }
      return { success: true, data: describeImage(key, { productId: body.productId }) };
    }

    return { success: true, data: describeImage(key) };
  })
  .delete('/assets', async ({ request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (!key) return invalid(set, { formErrors: ['key query parameter is required'] });
    const productId = url.searchParams.get('productId');
    const purge = url.searchParams.get('purge') === 'true';

    // Detach from every product first: a storage hiccup must never leave a
    // dangling key that renders as a broken image on the storefront.
    const affected = await db.query<{ id: string }>(
      `SELECT id FROM inventory_items WHERE deleted_at IS NULL AND image_keys @> $1::jsonb`,
      [JSON.stringify([key])]
    );
    for (const row of affected.rows) {
      if (productId && row.id !== productId) continue;
      await writeImageKeys(row.id, key, { remove: true });
    }

    if (purge && !/^https?:\/\//i.test(key)) {
      await deleteObject(key).catch((error) =>
        console.error('[INVENTORY] Image delete failed:', error)
      );
    }

    return { success: true, data: { publicId: key, deleted: true } };
  })
  .get('/media', async ({ request, set }) => {
    const key = new URL(request.url).searchParams.get('key');
    if (!key) return invalid(set, { formErrors: ['key query parameter is required'] });

    const signed = await presignObject(key, { expiresIn: 900 });
    if (signed) return Response.redirect(signed, 302);

    const object = await getObject(key);
    if (!object) {
      set.status = 404;
      return { success: false, error: 'Image not found' };
    }
    return new Response(object.body, {
      headers: { 'content-type': object.contentType, 'cache-control': 'public, max-age=300' },
    });
  })
  // ----------------------------------------------------
  // DIGITAL DELIVERABLES (admin)
  // ----------------------------------------------------
  .get('/products/:id/digital-assets', async ({ params, request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const result = await db.query(
      `SELECT * FROM inventory_digital_assets
        WHERE item_id = $1 AND is_active
        ORDER BY position, created_at`,
      [params.id]
    );
    return { success: true, data: result.rows.map(formatAsset) };
  })
  .post('/products/:id/digital-assets', async ({ params, request, set }) => {
    const userId = await admin(request);
    if (!userId) return forbidden(set);

    const item = await db.query<{ kind: string; delivery_mode: string }>(
      `SELECT kind, delivery_mode FROM inventory_items WHERE id = $1 AND deleted_at IS NULL`,
      [params.id]
    );
    if (!item.rowCount) {
      set.status = 404;
      return { success: false, error: 'Product not found' };
    }
    if (!isDigital(item.rows[0].kind)) {
      set.status = 409;
      return { success: false, error: 'Deliverables can only be attached to digital products' };
    }

    const form = await request.formData().catch(() => null);
    if (!form) return invalid(set, { formErrors: ['Expected multipart/form-data'] });

    const { files, tooLarge } = await readUploads(form, 'files', MAX_DIGITAL_BYTES);
    if (tooLarge.length) {
      set.status = 413;
      return {
        success: false,
        error: `Each file must be under ${MAX_DIGITAL_BYTES / 1024 / 1024}MB`,
        details: tooLarge,
      };
    }
    if (!files.length) return invalid(set, { formErrors: ['No files supplied'] });

    const positionResult = await db.query<{ next: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next
         FROM inventory_digital_assets WHERE item_id = $1`,
      [params.id]
    );
    let position = Number(positionResult.rows[0]?.next ?? 0);

    const created: Array<Record<string, any>> = [];
    try {
      for (const file of files) {
        const key = buildObjectKey(file.fileName, `digital/${params.id}`);
        await putObject({ key, body: file.bytes, contentType: file.contentType });
        const row = await db.query(
          `INSERT INTO inventory_digital_assets
             (id, item_id, object_key, bucket, file_name, content_type, bytes, checksum, position, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [
            randomUUID(),
            params.id,
            key,
            storageBucket,
            sanitizeFileName(file.fileName),
            file.contentType,
            file.bytes.byteLength,
            checksumOf(file.bytes),
            position++,
            userId,
          ]
        );
        created.push(formatAsset(row.rows[0]));
      }
    } catch (error) {
      console.error('[INVENTORY] Deliverable upload failed:', error);
      set.status = 502;
      return { success: false, error: 'Failed to store the deliverable' };
    }

    // Uploading a file for a keys-only product promotes it to file + keys.
    if (!deliversFiles(item.rows[0].delivery_mode)) {
      await db.query(`UPDATE inventory_items SET delivery_mode = 'both' WHERE id = $1`, [
        params.id,
      ]);
    }

    set.status = 201;
    return { success: true, data: created };
  })
  .delete('/digital-assets/:assetId', async ({ params, request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const purge = new URL(request.url).searchParams.get('purge') === 'true';

    const result = await db.query<{ object_key: string }>(
      `UPDATE inventory_digital_assets SET is_active = false, updated_at = now()
        WHERE id = $1 AND is_active RETURNING object_key`,
      [params.assetId]
    );
    if (!result.rowCount) {
      set.status = 404;
      return { success: false, error: 'Deliverable not found' };
    }

    // The object is retained by default: already-sold entitlements may still be
    // inside their download window. `?purge=true` is the explicit hard delete.
    if (purge) {
      await deleteObject(result.rows[0].object_key).catch((error) =>
        console.error('[INVENTORY] Deliverable purge failed:', error)
      );
    }

    return { success: true, data: { id: params.assetId, deleted: true, purged: purge } };
  })
  // ----------------------------------------------------
  // LICENSE KEY POOL (admin)
  // ----------------------------------------------------
  .get('/products/:id/keys', async ({ params, request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const status = new URL(request.url).searchParams.get('status');
    const result = await db.query(
      `SELECT id, license_key, status, entitlement_id, created_at, assigned_at
         FROM inventory_digital_keys
        WHERE item_id = $1 AND ($2::text IS NULL OR status = $2)
        ORDER BY created_at DESC LIMIT 500`,
      [params.id, status]
    );
    return {
      success: true,
      data: result.rows.map((row) => ({
        id: row.id,
        licenseKey: row.license_key,
        status: row.status,
        entitlementId: row.entitlement_id,
        createdAt: row.created_at,
        assignedAt: row.assigned_at,
      })),
    };
  })
  .post('/products/:id/keys', async ({ params, request, set }) => {
    const userId = await admin(request);
    if (!userId) return forbidden(set);

    const item = await db.query<{ kind: string; delivery_mode: string }>(
      `SELECT kind, delivery_mode FROM inventory_items WHERE id = $1 AND deleted_at IS NULL`,
      [params.id]
    );
    if (!item.rowCount) {
      set.status = 404;
      return { success: false, error: 'Product not found' };
    }
    if (!isDigital(item.rows[0].kind)) {
      set.status = 409;
      return { success: false, error: 'License keys can only be attached to digital products' };
    }

    const body = (await json(request)) as { keys?: unknown; text?: unknown } | null;
    const raw = Array.isArray(body?.keys)
      ? body.keys
      : typeof body?.text === 'string'
        ? body.text.split(/\r?\n/)
        : [];
    const keys = [...new Set(raw.map((key) => String(key).trim()).filter(Boolean))].slice(0, 5000);
    if (!keys.length) return invalid(set, { formErrors: ['No license keys supplied'] });

    // One round trip for the whole paste; duplicates are dropped by the
    // (item_id, license_key) unique index instead of a pre-flight SELECT.
    const inserted = await db.query(
      `INSERT INTO inventory_digital_keys (id, item_id, license_key, created_by)
       SELECT gen_random_uuid(), $1, key, $2 FROM unnest($3::text[]) AS key
       ON CONFLICT (item_id, license_key) DO NOTHING
       RETURNING id`,
      [params.id, userId, keys]
    );

    if (!deliversKeys(item.rows[0].delivery_mode)) {
      await db.query(`UPDATE inventory_items SET delivery_mode = 'both' WHERE id = $1`, [
        params.id,
      ]);
    }

    set.status = 201;
    return {
      success: true,
      data: {
        itemId: params.id,
        submitted: keys.length,
        added: inserted.rowCount ?? 0,
        duplicates: keys.length - (inserted.rowCount ?? 0),
      },
    };
  })
  .post('/digital-keys/:keyId/revoke', async ({ params, request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    // An assigned key is part of someone's purchase, so only unused keys move.
    const result = await db.query(
      `UPDATE inventory_digital_keys SET status = 'revoked', revoked_at = now()
        WHERE id = $1 AND status = 'available' RETURNING id`,
      [params.keyId]
    );
    if (!result.rowCount) {
      set.status = 409;
      return { success: false, error: 'Only unassigned keys can be revoked' };
    }
    return { success: true, data: { id: params.keyId, revoked: true } };
  })
  .get('/products/:id/movements', async ({ params, request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const limit = Math.min(Number(new URL(request.url).searchParams.get('limit')) || 25, 200);
    const result = await db.query(
      `SELECT * FROM inventory_stock_movements
        WHERE item_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [params.id, limit]
    );
    return {
      success: true,
      data: result.rows.map((row) => ({
        id: row.id,
        productId: row.item_id,
        delta: row.quantity_delta,
        reason: row.reason,
        reference: row.idempotency_key,
        createdAt: row.created_at,
      })),
    };
  })
  .get('/storage', async ({ request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    return {
      success: true,
      data: {
        backend: storageBackend,
        bucket: storageBucket,
        signedUrls: supportsSignedUrls,
      },
    };
  })

  // ----------------------------------------------------
  // ENTITLEMENTS + FULFILMENT
  // ----------------------------------------------------
  .post('/admin/fulfillments', async ({ request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    return fulfilFromRequest(request, set);
  })
  // Service-to-service variant. billing-service signs this call with
  // INTERNAL_SERVICE_SECRET because a customer checkout is not an admin
  // session. It is an identity for our own services, not an admin bypass:
  // every /admin/* route still requires a verified Neon admin JWT.
  .post('/internal/fulfillments', async ({ request, set }) => {
    const raw = await request.text();
    const trusted = await verifyServiceRequest(request, process.env.INTERNAL_SERVICE_SECRET, raw);
    if (!trusted) {
      set.status = 401;
      return { success: false, error: 'Invalid service signature' };
    }
    return fulfilFromRequest(request, set, raw);
  })
  .get('/admin/entitlements', async ({ request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');
    const email = url.searchParams.get('email');
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);

    const result = await db.query(
      `SELECT e.*, i.name AS product_name, i.sku AS product_sku
         FROM inventory_entitlements e
         JOIN inventory_items i ON i.id = e.item_id
        WHERE ($1::text IS NULL OR e.order_id = $1)
          AND ($2::text IS NULL OR e.customer_email = lower($2))
        ORDER BY e.created_at DESC LIMIT $3`,
      [orderId, email, limit]
    );

    return {
      success: true,
      data: result.rows.map((row) => ({
        ...formatEntitlement(row, publicBaseUrl),
        product: { id: row.item_id, name: row.product_name, sku: row.product_sku },
      })),
    };
  })
  .post('/admin/entitlements/:id/revoke', async ({ params, request, set }) => {
    if (!(await admin(request))) return forbidden(set);
    const result = await db.query(
      `UPDATE inventory_entitlements
          SET status = 'revoked', revoked_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'active' RETURNING id`,
      [params.id]
    );
    if (!result.rowCount) {
      set.status = 404;
      return { success: false, error: 'Active entitlement not found' };
    }

    // Revoking the entitlement also retires the license keys it handed out.
    await db.query(
      `UPDATE inventory_digital_keys SET status = 'revoked', revoked_at = now()
        WHERE entitlement_id = $1 AND status = 'assigned'`,
      [params.id]
    );

    return { success: true, data: { id: params.id, revoked: true } };
  })
  // ----------------------------------------------------
  // PUBLIC DIGITAL DELIVERY (token gated, no auth header)
  // ----------------------------------------------------
  .get('/downloads/:token', async ({ params, set }) => {
    const entitlement = await findEntitlement(params.token);
    if (!entitlement) {
      set.status = 404;
      return { success: false, error: 'Download link not found' };
    }

    const blocked = entitlementBlockReason(entitlement);
    if (blocked) {
      set.status = entitlement.status === 'active' ? 409 : 410;
      return { success: false, error: blocked };
    }

    const item = await db.query(
      `SELECT id, sku, name, description, digital_instructions, delivery_mode
         FROM inventory_items WHERE id = $1`,
      [entitlement.item_id]
    );
    const assets = await db.query(
      `SELECT * FROM inventory_digital_assets
        WHERE item_id = $1 AND is_active ORDER BY position, created_at`,
      [entitlement.item_id]
    );

    return {
      success: true,
      data: {
        entitlement: formatEntitlement(entitlement, publicBaseUrl),
        product: item.rowCount
          ? {
              id: item.rows[0].id,
              sku: item.rows[0].sku,
              name: item.rows[0].name,
              description: item.rows[0].description,
              deliveryMode: item.rows[0].delivery_mode,
              instructions: item.rows[0].digital_instructions ?? null,
            }
          : null,
        files: assets.rows.map((row) => ({
          ...formatAsset(row),
          downloadUrl: `${publicBaseUrl}/downloads/${params.token}/files/${row.id}`,
        })),
      },
    };
  })
  .get('/downloads/:token/files/:assetId', async ({ params, set }) => {
    const entitlement = await findEntitlement(params.token);
    if (!entitlement) {
      set.status = 404;
      return { success: false, error: 'Download link not found' };
    }

    const blocked = entitlementBlockReason(entitlement);
    if (blocked) {
      set.status = entitlement.status === 'active' ? 409 : 410;
      return { success: false, error: blocked };
    }

    const asset = await db.query(
      `SELECT * FROM inventory_digital_assets
        WHERE id = $1 AND item_id = $2 AND is_active`,
      [params.assetId, entitlement.item_id]
    );
    if (!asset.rowCount) {
      set.status = 404;
      return { success: false, error: 'File not found' };
    }

    const row = asset.rows[0];
    // Resolve the bytes before consuming a download so a storage blip never
    // costs the customer one of their permitted downloads.
    const signed = await presignObject(row.object_key, {
      expiresIn: 300,
      downloadName: row.file_name,
    });
    const object = signed ? null : await getObject(row.object_key);

    if (!signed && !object) {
      set.status = 410;
      return { success: false, error: 'This file is no longer available' };
    }

    await db.query(
      `UPDATE inventory_entitlements
          SET download_count = download_count + 1, last_downloaded_at = now(), updated_at = now()
        WHERE id = $1`,
      [entitlement.id]
    );

    if (signed) return Response.redirect(signed, 302);

    return new Response(object!.body, {
      headers: {
        'content-type': row.content_type,
        'content-disposition': `attachment; filename="${sanitizeFileName(row.file_name)}"`,
      },
    });
  })
  // ROUTES_ANCHOR
  .listen(port);

console.log(`Inventory service running at http://localhost:${app.server?.port}`);
