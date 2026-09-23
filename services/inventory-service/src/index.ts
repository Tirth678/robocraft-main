import { cors } from '@elysiajs/cors';
import { Elysia } from 'elysia';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getAdminUserId } from './admin-auth';
import { db } from './db';

const port = Number(process.env.PORT ?? 3002);
const allowedOrigins = [process.env.ADMIN_DASHBOARD_URL].filter(
  (origin): origin is string => Boolean(origin),
);

const itemInput = z.object({
  sku: z.string().trim().min(1).max(80).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1),
  category: z.string().trim().min(1).max(100).optional(),
  imageKeys: z.array(z.string().trim().min(1)).max(20).default([]),
  mrpMinor: z.number().int().nonnegative(),
  salePriceMinor: z.number().int().nonnegative(),
  quantityOnHand: z.number().int().nonnegative().default(0),
}).refine((value) => value.salePriceMinor <= value.mrpMinor, {
  message: 'salePriceMinor cannot exceed mrpMinor',
  path: ['salePriceMinor'],
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
  return { error: 'Admin access is required' };
}

function invalid(set: { status?: number | string }, details: unknown) {
  set.status = 422;
  return { error: 'Invalid request', details };
}

const app = new Elysia()
  .use(cors({ origin: allowedOrigins, credentials: true }))
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
    return { data: result.rows };
  })
  .post('/admin/inventory/items', async ({ request, set }) => {
    const userId = await admin(request);
    if (!userId) return forbidden(set);
    const parsed = itemInput.safeParse(await json(request));
    if (!parsed.success) return invalid(set, parsed.error.flatten());
    const item = parsed.data;
    const id = randomUUID();
    try {
      const result = await db.query(
        `INSERT INTO inventory_items
          (id, sku, name, description, category, image_keys, mrp_minor, sale_price_minor, quantity_on_hand, created_by)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10) RETURNING *`,
        [id, item.sku, item.name, item.description, item.category ?? null, JSON.stringify(item.imageKeys), item.mrpMinor, item.salePriceMinor, item.quantityOnHand, userId],
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
      return { data: result.rows[0] };
    } catch (error) {
      set.status = 409;
      return { error: 'An item with this SKU already exists' };
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
    if (!result.rowCount) { set.status = 404; return { error: 'Item not found' }; }
    return { data: result.rows[0] };
  })
  .patch('/admin/inventory/items/:id', async ({ params, request, set }) => {
    if (!await admin(request)) return forbidden(set);
    const parsed = itemInput.partial().safeParse(await json(request));
    if (!parsed.success) return invalid(set, parsed.error.flatten());
    const input = parsed.data;
    const fields: Array<[string, unknown]> = [
      ['sku', input.sku], ['name', input.name], ['description', input.description], ['category', input.category],
      ['image_keys', input.imageKeys ? JSON.stringify(input.imageKeys) : undefined], ['mrp_minor', input.mrpMinor],
      ['sale_price_minor', input.salePriceMinor],
    ].filter(([, value]) => value !== undefined) as Array<[string, unknown]>;
    if (!fields.length) return invalid(set, { formErrors: ['No editable fields supplied'] });
    const values = fields.map(([, value]) => value);
    const assignments = fields.map(([column], index) => `${column} = $${index + 1}${column === 'image_keys' ? '::jsonb' : ''}`);
    try {
      const result = await db.query(
        `UPDATE inventory_items SET ${assignments.join(', ')} WHERE id = $${values.length + 1} AND deleted_at IS NULL RETURNING *`,
        [...values, params.id],
      );
      if (!result.rowCount) { set.status = 404; return { error: 'Item not found' }; }
      return { data: result.rows[0] };
    } catch {
      set.status = 422;
      return { error: 'The requested price or SKU change is invalid' };
    }
  })
  .delete('/admin/inventory/items/:id', async ({ params, request, set }) => {
    if (!await admin(request)) return forbidden(set);
    const result = await db.query(
      `UPDATE inventory_items SET is_active = false, deleted_at = now()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [params.id],
    );
    if (!result.rowCount) { set.status = 404; return { error: 'Item not found' }; }
    return { data: { id: params.id, deleted: true } };
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
      if (replay.rowCount) { await client.query('COMMIT'); return { data: replay.rows[0], replayed: true }; }
      const item = await client.query<{ quantity_on_hand: number }>(
        `SELECT quantity_on_hand FROM inventory_items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [params.id],
      );
      if (!item.rowCount) { await client.query('ROLLBACK'); set.status = 404; return { error: 'Item not found' }; }
      const before = item.rows[0].quantity_on_hand;
      const after = before + input.quantityDelta;
      if (after < 0) { await client.query('ROLLBACK'); set.status = 409; return { error: 'Stock cannot become negative' }; }
      await client.query(`UPDATE inventory_items SET quantity_on_hand = $1 WHERE id = $2`, [after, params.id]);
      const movement = await client.query(
        `INSERT INTO inventory_stock_movements
          (id,item_id,quantity_delta,quantity_before,quantity_after,reason,idempotency_key,performed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [randomUUID(), params.id, input.quantityDelta, before, after, input.reason, input.idempotencyKey, userId],
      );
      await client.query('COMMIT');
      return { data: movement.rows[0] };
    } catch {
      await client.query('ROLLBACK'); set.status = 500; return { error: 'Unable to adjust stock' };
    } finally { client.release(); }
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
    set.status = 201; return { data: result.rows[0] };
  })
  .get('/admin/inventory/coupons', async ({ request, set }) => {
    if (!await admin(request)) return forbidden(set);
    const result = await db.query(`SELECT * FROM inventory_coupons ORDER BY created_at DESC LIMIT 100`);
    return { data: result.rows };
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
      await client.query('COMMIT'); set.status = 201; return { data: coupon.rows[0] };
    } catch {
      await client.query('ROLLBACK'); set.status = 422; return { error: 'Coupon code or item scope is invalid' };
    } finally { client.release(); }
  })
  .delete('/admin/inventory/coupons/:id', async ({ params, request, set }) => {
    if (!await admin(request)) return forbidden(set);
    const result = await db.query(`UPDATE inventory_coupons SET is_active = false WHERE id = $1 AND is_active RETURNING id`, [params.id]);
    if (!result.rowCount) { set.status = 404; return { error: 'Active coupon not found' }; }
    return { data: { id: params.id, deactivated: true } };
  })
  .listen(port);

console.log(`Inventory service running at http://localhost:${app.server?.port}`);
