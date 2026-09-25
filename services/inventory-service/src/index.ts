import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getAdminUserId } from './admin-auth';
import { db } from './db';

const port = Number(process.env.PORT ?? 3002);

const allowedOrigins = [
  process.env.ADMIN_DASHBOARD_URL,
  process.env.CUSTOMER_FRONTEND_URL,
  'http://localhost:8080',
  'http://localhost:3000',
  'http://localhost:3006',
  'http://localhost:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3006',
  'http://127.0.0.1:5173',
].filter((origin): origin is string => Boolean(origin));

const itemInput = z.object({
  sku: z.string().trim().min(1).max(80).transform((value) => value.toUpperCase()),
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
}).transform((data) => {
  // If price in standard currency units was passed, convert to minor
  const salePriceMinor = data.salePriceMinor !== undefined
    ? data.salePriceMinor
    : (data.price !== undefined ? Math.round(data.price * 100) : 0);
  const mrpMinor = data.mrpMinor !== undefined
    ? data.mrpMinor
    : (data.mrp !== undefined ? Math.round(data.mrp * 100) : salePriceMinor);
  const quantityOnHand = data.quantityOnHand !== undefined
    ? data.quantityOnHand
    : (data.stock !== undefined ? data.stock : 0);
  const imageKeys = [...data.imageKeys];
  if (data.imageUrl && !imageKeys.includes(data.imageUrl)) {
    imageKeys.unshift(data.imageUrl);
  }
  return {
    ...data,
    salePriceMinor,
    mrpMinor,
    quantityOnHand,
    imageKeys,
  };
}).refine((value) => value.salePriceMinor <= value.mrpMinor, {
  message: 'salePriceMinor cannot exceed mrpMinor',
  path: ['salePriceMinor'],
});

const updateItemInput = z.object({
  sku: z.string().trim().min(1).max(80).transform((value) => value.toUpperCase()).optional(),
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
}).transform((data) => {
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
    quantityOnHand,
    imageKeys,
  };
});

const stockAdjustmentInput = z.object({
  quantityDelta: z.number().int().refine((value) => value !== 0),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().uuid(),
});

const discountInput = z.object({
  kind: z.enum(['percentage', 'fixed']),
  valueMinor: z.number().int().positive(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
}).superRefine((value, context) => {
  if (value.kind === 'percentage' && value.valueMinor > 100) {
    context.addIssue({ code: 'custom', message: 'Percentage discounts cannot exceed 100' });
  }
  if (value.endsAt && value.startsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
    context.addIssue({ code: 'custom', message: 'endsAt must be after startsAt' });
  }
});

const couponInput = z.object({
  code: z.string().trim().min(3).max(50).transform((value) => value.toUpperCase()),
  kind: z.enum(['percentage', 'fixed']),
  valueMinor: z.number().int().positive(),
  minimumOrderMinor: z.number().int().nonnegative().default(0),
  maximumDiscountMinor: z.number().int().positive().nullable().optional(),
  maxRedemptions: z.number().int().positive().nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  itemIds: z.array(z.string().uuid()).max(500).default([]),
}).superRefine((value, context) => {
  if (value.kind === 'percentage' && value.valueMinor > 100) {
    context.addIssue({ code: 'custom', message: 'Percentage coupons cannot exceed 100' });
  }
  if (value.endsAt && value.startsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
    context.addIssue({ code: 'custom', message: 'endsAt must be after startsAt' });
  }
});

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

function formatItem(row: Record<string, any>) {
  const imageKeys = Array.isArray(row.image_keys) ? row.image_keys : [];
  const imageUrl = imageKeys[0] || null;
  const price = row.sale_price_minor !== undefined ? row.sale_price_minor / 100 : 0;
  const mrp = row.mrp_minor !== undefined ? row.mrp_minor / 100 : price;
  return {
    ...row,
    price,
    mrp,
    stock: row.quantity_on_hand ?? 0,
    imageUrl,
    image_url: imageUrl,
    isListed: row.is_active ?? true,
    kind: 'physical' as const,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
      allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-user-id'],
    }),
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
      [search, category, limit],
    );
    const items = result.rows.map(formatItem);
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
      [search, category, limit],
    );
    const items = result.rows.map(formatItem);
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
      [params.id],
    );
    if (!result.rowCount) {
      set.status = 404;
      return { success: false, error: 'Product not found' };
    }
    return { success: true, data: formatItem(result.rows[0]) };
  })
  .get('/inventory/products/:id', async ({ params, set }) => {
    const result = await db.query(
      `SELECT * FROM inventory_items WHERE id = $1 AND is_active = true AND deleted_at IS NULL`,
      [params.id],
    );
    if (!result.rowCount) {
      set.status = 404;
      return { success: false, error: 'Product not found' };
    }
    return { success: true, data: formatItem(result.rows[0]) };
  })
  .get('/categories', async () => {
    const result = await db.query(
      `SELECT category, COUNT(*)::int as count FROM inventory_items
       WHERE is_active = true AND deleted_at IS NULL AND category IS NOT NULL
       GROUP BY category ORDER BY category ASC`,
    );
    return { success: true, data: result.rows };
  })
  .get('/inventory/categories', async () => {
    const result = await db.query(
      `SELECT category, COUNT(*)::int as count FROM inventory_items
       WHERE is_active = true AND deleted_at IS NULL AND category IS NOT NULL
       GROUP BY category ORDER BY category ASC`,
    );
    return { success: true, data: result.rows };
  })

  // ----------------------------------------------------
  // ADMIN INVENTORY APIS
  // ----------------------------------------------------
  .get('/admin/inventory/items', async ({ request, set }) => {
    if (!await admin(request)) return forbidden(set);
    const url = new URL(request.url);
    const search = url.searchParams.get('search');
    const result = await db.query(
      `SELECT * FROM inventory_items
       WHERE deleted_at IS NULL
         AND ($1::text IS NULL OR sku ILIKE '%' || $1 || '%' OR name ILIKE '%' || $1 || '%')
       ORDER BY updated_at DESC LIMIT 100`,
      [search],
    );
    const formatted = result.rows.map(formatItem);
    return { success: true, data: formatted, items: formatted, total: formatted.length, nextCursor: null };
  })
  .get('/admin/products', async ({ request, set }) => {
    if (!await admin(request)) return forbidden(set);
    const url = new URL(request.url);
    const search = url.searchParams.get('search');
    const sort = url.searchParams.get('sort') || 'newest';
    const lowStockAt = url.searchParams.get('lowStockAt');

    let orderBy = 'updated_at DESC';
    if (sort === 'stockAsc') orderBy = 'quantity_on_hand ASC';
    else if (sort === 'name') orderBy = 'name ASC';
    else if (sort === 'priceAsc') orderBy = 'sale_price_minor ASC';
    else if (sort === 'priceDesc') orderBy = 'sale_price_minor DESC';

    const result = await db.query(
      `SELECT * FROM inventory_items
       WHERE deleted_at IS NULL
         AND ($1::text IS NULL OR sku ILIKE '%' || $1 || '%' OR name ILIKE '%' || $1 || '%')
         AND ($2::int IS NULL OR quantity_on_hand <= $2)
       ORDER BY ${orderBy} LIMIT 100`,
      [search, lowStockAt ? Number(lowStockAt) : null],
    );
    const items = result.rows.map(formatItem);
    return { success: true, data: { items, total: items.length, nextCursor: null } };
  })
  .get('/admin/summary', async ({ request, set }) => {
    if (!await admin(request)) return forbidden(set);
    const stats = await db.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active = true)::int AS listed,
        COUNT(*) FILTER (WHERE is_active = false)::int AS unlisted,
        COALESCE(SUM(quantity_on_hand), 0)::int AS on_hand,
        COUNT(*) FILTER (WHERE quantity_on_hand = 0)::int AS out_of_stock,
        COUNT(*) FILTER (WHERE quantity_on_hand <= 5 AND quantity_on_hand > 0)::int AS low_stock,
        COALESCE(SUM((sale_price_minor / 100.0) * quantity_on_hand), 0)::float AS value
      FROM inventory_items WHERE deleted_at IS NULL
    `);
    const s = stats.rows[0];
    return {
      success: true,
      data: {
        products: { total: s.total, listed: s.listed, unlisted: s.unlisted },
        stock: { onHand: s.on_hand, outOfStock: s.out_of_stock, lowStock: s.low_stock, lowStockAt: 5, value: s.value },
        assets: 0,
      },
    };
  })
  .get('/admin/movements', async ({ request, set }) => {
    if (!await admin(request)) return forbidden(set);
    const result = await db.query(`
      SELECT m.*, i.name as product_name, i.sku as product_sku
      FROM inventory_stock_movements m
      JOIN inventory_items i ON i.id = m.item_id
      ORDER BY m.created_at DESC LIMIT 50
    `);
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
          (id, sku, name, description, category, image_keys, mrp_minor, sale_price_minor, quantity_on_hand, is_active, created_by)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11) RETURNING *`,
        [id, item.sku, item.name, item.description, item.category ?? null, JSON.stringify(item.imageKeys), item.mrpMinor, item.salePriceMinor, item.quantityOnHand, item.isListed ?? true, userId],
      );
      if (item.quantityOnHand > 0) {
        await db.query(
          `INSERT INTO inventory_stock_movements
            (id, item_id, quantity_delta, quantity_before, quantity_after, reason, idempotency_key, performed_by)
           VALUES ($1,$2,$3,0,$3,'initial inventory',$4,$5)`,
          [randomUUID(), id, item.quantityOnHand, `initial:${id}`, userId],
        );
      }
      set.status = 201;
      return { success: true, data: formatItem(result.rows[0]) };
    } catch (error) {
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
          (id, sku, name, description, category, image_keys, mrp_minor, sale_price_minor, quantity_on_hand, is_active, created_by)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11) RETURNING *`,
        [id, item.sku, item.name, item.description, item.category ?? null, JSON.stringify(item.imageKeys), item.mrpMinor, item.salePriceMinor, item.quantityOnHand, item.isListed ?? true, userId],
      );
      if (item.quantityOnHand > 0) {
        await db.query(
          `INSERT INTO inventory_stock_movements
            (id, item_id, quantity_delta, quantity_before, quantity_after, reason, idempotency_key, performed_by)
           VALUES ($1,$2,$3,0,$3,'initial inventory',$4,$5)`,
          [randomUUID(), id, item.quantityOnHand, `initial:${id}`, userId],
        );
      }
      set.status = 201;
      return { success: true, data: formatItem(result.rows[0]) };
    } catch (error) {
      set.status = 409;
      return { success: false, error: 'An item with this SKU already exists' };
    }
  })
  .get('/admin/inventory/items/:id', async ({ params, request, set }) => {
    if (!await admin(request)) return forbidden(set);
    const result = await db.query(
      `SELECT i.*, COALESCE(json_agg(d.*) FILTER (WHERE d.id IS NOT NULL), '[]') AS discounts
       FROM inventory_items i LEFT JOIN inventory_item_discounts d ON d.item_id = i.id
       WHERE i.id = $1 AND i.deleted_at IS NULL GROUP BY i.id`,
      [params.id],
    );
    if (!result.rowCount) { set.status = 404; return { success: false, error: 'Item not found' }; }
    return { success: true, data: formatItem(result.rows[0]) };
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
    ].filter(([, value]) => value !== undefined) as Array<[string, unknown]>;

    if (!fields.length) return invalid(set, { formErrors: ['No editable fields supplied'] });

    const values = fields.map(([, value]) => value);
    const assignments = fields.map(([column], index) => `${column} = $${index + 1}${column === 'image_keys' ? '::jsonb' : ''}`);

    try {
      const result = await db.query(
        `UPDATE inventory_items SET ${assignments.join(', ')} WHERE id = $${values.length + 1} AND deleted_at IS NULL RETURNING *`,
        [...values, params.id],
      );
      if (!result.rowCount) { set.status = 404; return { success: false, error: 'Item not found' }; }
      return { success: true, data: formatItem(result.rows[0]) };
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
    ].filter(([, value]) => value !== undefined) as Array<[string, unknown]>;

    if (!fields.length) return invalid(set, { formErrors: ['No editable fields supplied'] });

    const values = fields.map(([, value]) => value);
    const assignments = fields.map(([column], index) => `${column} = $${index + 1}${column === 'image_keys' ? '::jsonb' : ''}`);

    try {
      const result = await db.query(
        `UPDATE inventory_items SET ${assignments.join(', ')} WHERE id = $${values.length + 1} AND deleted_at IS NULL RETURNING *`,
        [...values, params.id],
      );
      if (!result.rowCount) { set.status = 404; return { success: false, error: 'Item not found' }; }
      return { success: true, data: formatItem(result.rows[0]) };
    } catch {
      set.status = 422;
      return { success: false, error: 'The requested price, stock or SKU change is invalid' };
    }
  })
  .delete('/admin/inventory/items/:id', async ({ params, request, set }) => {
    if (!await admin(request)) return forbidden(set);
    const result = await db.query(
      `UPDATE inventory_items SET is_active = false, deleted_at = now()
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [params.id],
    );
    if (!result.rowCount) { set.status = 404; return { success: false, error: 'Item not found' }; }
    return { success: true, data: { id: params.id, deleted: true, product: formatItem(result.rows[0]) } };
  })
  .delete('/products/:id', async ({ params, request, set }) => {
    if (!await admin(request)) return forbidden(set);
    const result = await db.query(
      `UPDATE inventory_items SET is_active = false, deleted_at = now()
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [params.id],
    );
    if (!result.rowCount) { set.status = 404; return { success: false, error: 'Item not found' }; }
    return { success: true, data: { id: params.id, deleted: true, product: formatItem(result.rows[0]) } };
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
      const replay = await client.query(`SELECT * FROM inventory_stock_movements WHERE idempotency_key = $1`, [input.idempotencyKey]);
      if (replay.rowCount) { await client.query('COMMIT'); return { success: true, data: replay.rows[0], replayed: true }; }
      const item = await client.query<{ quantity_on_hand: number }>(
        `SELECT quantity_on_hand FROM inventory_items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [params.id],
      );
      if (!item.rowCount) { await client.query('ROLLBACK'); set.status = 404; return { success: false, error: 'Item not found' }; }
      const before = item.rows[0].quantity_on_hand;
      const after = before + input.quantityDelta;
      if (after < 0) { await client.query('ROLLBACK'); set.status = 409; return { success: false, error: 'Stock cannot become negative' }; }
      await client.query(`UPDATE inventory_items SET quantity_on_hand = $1 WHERE id = $2`, [after, params.id]);
      const movement = await client.query(
        `INSERT INTO inventory_stock_movements
          (id,item_id,quantity_delta,quantity_before,quantity_after,reason,idempotency_key,performed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [randomUUID(), params.id, input.quantityDelta, before, after, input.reason, input.idempotencyKey, userId],
      );
      await client.query('COMMIT');
      return { success: true, data: movement.rows[0] };
    } catch {
      await client.query('ROLLBACK'); set.status = 500; return { success: false, error: 'Unable to adjust stock' };
    } finally { client.release(); }
  })
  .post('/products/:id/stock', async ({ params, request, set }) => {
    const userId = await admin(request);
    if (!userId) return forbidden(set);
    const body = (await json(request)) as { delta?: number; stock?: number; reason?: string; reference?: string };
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const item = await client.query(
        `SELECT * FROM inventory_items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [params.id],
      );
      if (!item.rowCount) {
        await client.query('ROLLBACK');
        set.status = 404;
        return { success: false, error: 'Product not found' };
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
        [after, params.id],
      );
      let movementRow = null;
      if (delta !== 0) {
        const movement = await client.query(
          `INSERT INTO inventory_stock_movements
            (id,item_id,quantity_delta,quantity_before,quantity_after,reason,idempotency_key,performed_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [randomUUID(), params.id, delta, before, after, body.reason || 'Manual adjustment', randomUUID(), userId],
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
    await db.query(`UPDATE inventory_item_discounts SET is_active = false WHERE item_id = $1 AND is_active`, [params.id]);
    const result = await db.query(
      `INSERT INTO inventory_item_discounts (id,item_id,kind,value_minor,starts_at,ends_at,created_by)
       VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz,now()),$6,$7) RETURNING *`,
      [randomUUID(), params.id, input.kind, input.valueMinor, input.startsAt ?? null, input.endsAt ?? null, userId],
    );
    set.status = 201; return { success: true, data: result.rows[0] };
  })
  .get('/admin/inventory/coupons', async ({ request, set }) => {
    if (!await admin(request)) return forbidden(set);
    const result = await db.query(`SELECT * FROM inventory_coupons ORDER BY created_at DESC LIMIT 100`);
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
        [randomUUID(), input.code, input.kind, input.valueMinor, input.minimumOrderMinor, input.maximumDiscountMinor ?? null, input.maxRedemptions ?? null, input.startsAt ?? null, input.endsAt ?? null, userId],
      );
      for (const itemId of input.itemIds) {
        await client.query(`INSERT INTO inventory_coupon_items (coupon_id,item_id) VALUES ($1,$2)`, [coupon.rows[0].id, itemId]);
      }
      await client.query('COMMIT'); set.status = 201; return { success: true, data: coupon.rows[0] };
    } catch {
      await client.query('ROLLBACK'); set.status = 422; return { success: false, error: 'Coupon code or item scope is invalid' };
    } finally { client.release(); }
  })
  .delete('/admin/inventory/coupons/:id', async ({ params, request, set }) => {
    if (!await admin(request)) return forbidden(set);
    const result = await db.query(`UPDATE inventory_coupons SET is_active = false WHERE id = $1 AND is_active RETURNING id`, [params.id]);
    if (!result.rowCount) { set.status = 404; return { success: false, error: 'Active coupon not found' }; }
    return { success: true, data: { id: params.id, deactivated: true } };
  })
  .listen(port);

console.log(`Inventory service running at http://localhost:${app.server?.port}`);
