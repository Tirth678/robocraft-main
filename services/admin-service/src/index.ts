import { randomUUID } from 'node:crypto';
import { Elysia, NotFoundError } from 'elysia';
import { cors } from '@elysiajs/cors';
import { z } from 'zod';
import { query as dbQuery, withTransaction, type Row } from './db';
import {
  clearSessionCookie,
  destroyAllSessions,
  destroySession,
  ensureSchema,
  pruneExpiredSessions,
  readSessionCookie,
  resolveSession,
  seedAdminFromEnv,
  sessionCookie,
  verifyCredentials,
  createSession,
  type Session,
} from './auth';
import {
  isDigital,
  mapDigitalAsset,
  mapEntitlement,
  mapLicenseKey,
  mapMovement,
  mapPreOrder,
  mapProduct,
  toMinor,
} from './mappers';
import {
  buildObjectKey,
  checksumOf,
  deleteObject,
  getObject,
  presignObject,
  putObject,
  storageBucket,
} from './storage';

/**
 * admin-service — private control plane for catalog, stock, pre-orders and
 * digital fulfilment.
 *
 * Design notes:
 *  - It talks straight to Postgres. It does not proxy the customer-facing
 *    inventory service and it does not accept customer/Neon tokens, so admin
 *    authority cannot leak through the public auth provider.
 *  - Authorization is the `admin` guard below. Nothing else is trusted.
 *  - Every response uses the `{ success, data | error }` envelope the admin UI
 *    already parses.
 */

const PORT = Number(process.env.ADMIN_SERVICE_PORT ?? process.env.PORT ?? 3007);
const ADMIN_ROLES = new Set(['admin', 'superadmin']);

const ok = <T>(data: T) => ({ success: true as const, data });
const fail = (error: string) => ({ success: false as const, error });

/**
 * Elysia exposes response status/headers through `set`, and `set.headers` is a
 * plain record (`app.setHeaders ?? {}`), not a `Headers` instance.
 */
// Structural subset of Elysia's `set` that we actually use. Elysia types
// `status` as an optional number-or-known-string union, so it is assignable to
// this but not the other way round.
type SetCtx = { status?: number | string; headers: Record<string, unknown> };

// Shape a transaction returns when it bails out with a client error, so the
// caller's `in` narrowing stays precise instead of widening `error`/`status`.
type TxFailure = { error: string; status: number };

const unauthorized = (set: SetCtx) => {
  set.status = 401;
  return fail('Admin access is required');
};

/** Pre-order lifecycle. The column has no DB constraint, so enforce it here. */
const PRE_ORDER_STATUSES = ['pending', 'confirmed', 'in_production', 'ready', 'shipped', 'delivered', 'cancelled'] as const;
const PRE_ORDER_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['in_production', 'cancelled'],
  in_production: ['ready', 'cancelled'],
  ready: ['shipped', 'in_production'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

// --- simple in-process login throttle -------------------------------------
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function throttleLogin(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return false;
  }
  if (entry.count >= 10) return true;
  entry.count += 1;
  return false;
}

const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});

const productFieldsSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().min(1).max(80),
  description: z.string().max(20_000).default(''),
  category: z.string().max(120).optional().nullable(),
  price: z.number().min(0),
  mrp: z.number().min(0),
  stock: z.number().int().min(0).optional().nullable(),
  isListed: z.boolean().optional(),
  kind: z.enum(['physical', 'digital']).optional(),
  deliveryMode: z.enum(['files', 'license_keys', 'both']).optional(),
  downloadLimit: z.number().int().min(1).max(1000).optional().nullable(),
  digitalInstructions: z.string().max(20_000).optional().nullable(),
});

// Create-time rules. Kept on a separate schema because `.partial()` cannot be
// applied to a refined schema, and PATCH legitimately sends only changed fields.
const productCreateSchema = productFieldsSchema.superRefine((v, ctx) => {
  if (v.kind === 'physical' && v.stock == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['stock'],
      message: 'stock is required for physical products',
    });
  }
  if (v.kind === 'digital' && v.stock != null && v.stock !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['stock'],
      message: 'digital products are never stocked by hand; manage license keys instead',
    });
  }
});

const productUpdateSchema = productFieldsSchema.partial().superRefine((v, ctx) => {
  // A patch that omits `kind` says nothing about the product's type, so only
  // reject an explicit hand-set stock on a digital product.
  if (v.kind === 'digital' && v.stock != null && v.stock !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['stock'],
      message: 'digital products are never stocked by hand; manage license keys instead',
    });
  }
});

const preOrderUpdateSchema = z.object({
  status: z.enum(PRE_ORDER_STATUSES).optional(),
  notes: z.string().max(20_000).optional().nullable(),
  customerPhone: z.string().max(40).optional().nullable(),
  customerName: z.string().max(200).optional().nullable(),
  quantity: z.number().int().min(1).max(1000).optional(),
});

/**
 * The admin console is a separate origin from the storefront, so it gets its
 * own allow-list. It fails closed: with `ADMIN_ALLOWED_ORIGINS` unset only the
 * local dev console may call in, which would silently break a deployed admin —
 * hence the loud production warning rather than a permissive default.
 */
const adminAllowedOrigins = (
  process.env.ADMIN_ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:8082'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// `process.env.NODE_ENV` in dot form is constant-folded by `bun build`, which
// bakes in whatever NODE_ENV was set during the build and ignores the runtime
// value. Bracket notation keeps this a real lookup, so the production gate below
// reflects the deployed environment.
if (process.env['NODE_ENV'] === 'production' && !process.env.ADMIN_ALLOWED_ORIGINS) {
  console.warn(
    '[ADMIN] NODE_ENV=production but ADMIN_ALLOWED_ORIGINS is unset — the deployed admin console will be rejected by CORS. Set it to the admin origin.',
  );
}

const app = new Elysia()
  .use(
    cors({
      origin: adminAllowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  )
  .onError(({ error, set }) => {
    // A path with no matching route is a client mistake, not a server fault, and
    // reporting it as 500 hides typos behind "Internal error".
    if (error instanceof NotFoundError) {
      set.status = 404;
      return fail('Not found');
    }
    console.error('[ADMIN] unhandled', error);
    set.status = 500;
    return fail('Internal error');
  });

/**
 * Resolves the caller. Returns null (and 401) unless a live admin session
 * cookie is present. This is the only authority check in the service.
 */
async function admin(request: Request, set: SetCtx): Promise<Session | null> {
  const session = await resolveSession(readSessionCookie(request));
  if (!session || !ADMIN_ROLES.has(session.role)) {
    set.status = 401;
    return null;
  }
  return session;
}

const app$ = app
  .get('/health', async () => ok({ status: 'ok', service: 'admin-service' }))

  // ------------------------------------------------------------------ auth
  .post('/api/auth/login', async ({ request, set }) => {
    const ip =
      request.headers.get('cf-connecting-ip') ??
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      'local';
    if (throttleLogin(ip)) {
      set.status = 429;
      return fail('Too many attempts — try again later');
    }

    const parsed = loginSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      set.status = 400;
      return fail('Email and password are required');
    }

    const user = await verifyCredentials(parsed.data.email, parsed.data.password);
    if (!user) {
      set.status = 401;
      return fail('Invalid credentials');
    }

    const session = await createSession(user, request.headers.get('user-agent'));
    set.headers['set-cookie'] = sessionCookie(session.token, session.expiresAt);
    return ok({
      admin: { id: user.id, email: user.email, name: user.name, role: user.role },
      expiresAt: session.expiresAt,
    });
  })

  .post('/api/auth/logout', async ({ request, set }) => {
    await destroySession(readSessionCookie(request));
    set.headers['set-cookie'] = clearSessionCookie();
    set.status = 200;
    return ok({ loggedOut: true });
  })

  .get('/api/auth/me', async ({ request, set }) => {
    const session = await admin(request, set);
    if (!session) return unauthorized(set);
    return ok({
      admin: {
        id: session.adminId,
        email: session.email,
        name: session.name,
        role: session.role,
      },
      expiresAt: session.expiresAt,
    });
  })

  .post('/api/auth/change-password', async ({ request, set }) => {
    const session = await admin(request, set);
    if (!session) return unauthorized(set);
    const body = (await request.json().catch(() => null)) as {
      currentPassword?: string;
      newPassword?: string;
    } | null;
    if (!body?.currentPassword || !body?.newPassword || body.newPassword.length < 12) {
      set.status = 400;
      return fail('Current password and a new password of at least 12 characters are required');
    }
    const bcrypt = (await import('bcryptjs')).default;
    const { rows } = await dbQuery<{ password_hash: string }>(
      `SELECT password_hash FROM admin_users WHERE id = $1`,
      [session.adminId],
    );
    const okPw = rows[0] && (await bcrypt.compare(body.currentPassword, rows[0].password_hash));
    if (!okPw) {
      set.status = 403;
      return fail('Current password is incorrect');
    }
    await dbQuery(`UPDATE admin_users SET password_hash = $1 WHERE id = $2`, [
      await bcrypt.hash(body.newPassword, 12),
      session.adminId,
    ]);
    // Changing a password invalidates every other session for that admin.
    await destroyAllSessions(session.adminId);
    set.status = 200;
    return ok({ changed: true });
  })

  // --------------------------------------------------------------- catalog
  .get('/api/admin/products', async ({ request, set, query }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    const search = (query.search ?? '').trim();
    const category = (query.category ?? '').trim();
    const limit = Math.min(Number(query.limit ?? 100), 500);
    const offset = Math.max(Number(query.offset ?? 0), 0);

    const { rows } = await dbQuery<Row>(
      `SELECT i.*,
              (SELECT count(*) FROM inventory_digital_keys k
                WHERE k.item_id = i.id AND k.status = 'available')  AS keys_available,
              (SELECT count(*) FROM inventory_digital_keys k
                WHERE k.item_id = i.id)                                AS keys_total
         FROM inventory_items i
        WHERE i.deleted_at IS NULL
          AND ($1 = '' OR i.name ILIKE '%' || $1 || '%' OR i.sku ILIKE '%' || $1 || '%')
          AND ($2 = '' OR i.category = $2)
        ORDER BY i.created_at DESC
        LIMIT $3 OFFSET $4`,
      [search, category, limit, offset],
    );
    return ok({ products: rows.map(mapProduct) });
  })

  .get('/api/admin/products/:id', async ({ request, set, params }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    const { rows } = await dbQuery<Row>(
      `SELECT i.*,
              (SELECT count(*) FROM inventory_digital_keys k
                WHERE k.item_id = i.id AND k.status = 'available') AS keys_available,
              (SELECT count(*) FROM inventory_digital_keys k WHERE k.item_id = i.id) AS keys_total
         FROM inventory_items i
        WHERE i.id = $1 AND i.deleted_at IS NULL`,
      [params.id],
    );
    if (!rows[0]) {
      set.status = 404;
      return fail('Product not found');
    }
    return ok({ product: mapProduct(rows[0]) });
  })

  .post('/api/admin/products', async ({ request, set }) => {
    const session = await admin(request, set);
    if (!session) return unauthorized(set);
    const parsed = productCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      set.status = 400;
      return fail(parsed.error.issues[0]?.message ?? 'Invalid product');
    }
    const p = parsed.data;
    const kind = p.kind ?? 'physical';
    const digital = kind === 'digital';
    const qty = digital ? 0 : (p.stock ?? 0);

    const { rows } = await dbQuery<Row>(
      `INSERT INTO inventory_items
         (id, sku, name, description, category, mrp_minor, sale_price_minor,
          quantity_on_hand, is_active, created_by, kind, delivery_mode,
          download_limit, digital_instructions, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
       RETURNING *`,
      [
        randomUUID(),
        p.sku.trim(),
        p.name.trim(),
        p.description ?? '',
        p.category ?? null,
        toMinor(p.mrp),
        toMinor(p.price),
        qty,
        p.isListed ?? true,
        session.adminId,
        kind,
        p.deliveryMode ?? (digital ? 'files' : 'files'),
        p.downloadLimit ?? null,
        p.digitalInstructions ?? null,
      ],
    );

    // opening stock is recorded as a movement so the ledger reconciles
    if (qty !== 0) {
      await dbQuery(
        `INSERT INTO inventory_stock_movements
           (id, item_id, quantity_delta, quantity_before, quantity_after, reason, idempotency_key, performed_by)
         VALUES ($1,$2,$3,0,$3,'Opening stock',$4,$5)`,
        [randomUUID(), rows[0].id, qty, randomUUID(), session.adminId],
      );
    }
    return ok({ product: mapProduct(rows[0]) });
  })

  .patch('/api/admin/products/:id', async ({ request, set, params }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    const parsed = productUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      set.status = 400;
      return fail(parsed.error.issues[0]?.message ?? 'Invalid product');
    }
    const p = parsed.data;

    // `available_quantity` is a generated column and must never be assigned.
    const assignments: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      assignments.push(`${col} = $${values.length}`);
    };
    if (p.name !== undefined) add('name', p.name.trim());
    if (p.sku !== undefined) add('sku', p.sku.trim());
    if (p.description !== undefined) add('description', p.description);
    if (p.category !== undefined) add('category', p.category || null);
    if (p.price !== undefined) add('sale_price_minor', toMinor(p.price));
    if (p.mrp !== undefined) add('mrp_minor', toMinor(p.mrp));
    if (p.isListed !== undefined) add('is_active', p.isListed);
    if (p.kind !== undefined) add('kind', p.kind);
    if (p.deliveryMode !== undefined) add('delivery_mode', p.deliveryMode);
    if (p.downloadLimit !== undefined) add('download_limit', p.downloadLimit);
    if (p.digitalInstructions !== undefined) add('digital_instructions', p.digitalInstructions);
    if (p.stock !== undefined && p.stock !== null) add('quantity_on_hand', p.stock);
    if (!assignments.length) {
      set.status = 400;
      return fail('No fields to update');
    }
    assignments.push('updated_at = now()');
    values.push(params.id);

    const { rows } = await dbQuery<Row>(
      `UPDATE inventory_items SET ${assignments.join(', ')}
        WHERE id = $${values.length} AND deleted_at IS NULL RETURNING *`,
      values,
    );
    if (!rows[0]) {
      set.status = 404;
      return fail('Product not found');
    }
    return ok({ product: mapProduct(rows[0]) });
  })

  .delete('/api/admin/products/:id', async ({ request, set, params }) => {
    const session = await admin(request, set);
    if (!session) return unauthorized(set);
    // Soft delete: order history and FKs keep pointing at the row.
    const { rows } = await dbQuery<Row>(
      `UPDATE inventory_items SET is_active = false, deleted_at = now(), updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [params.id],
    );
    if (!rows[0]) {
      set.status = 404;
      return fail('Product not found');
    }
    return ok({ product: mapProduct(rows[0]) });
  })

  // ----------------------------------------------------------------- stock
  .post('/api/admin/products/:id/stock', async ({ request, set, params }) => {
    const session = await admin(request, set);
    if (!session) return unauthorized(set);
    const body = (await request.json().catch(() => null)) as {
      delta?: number;
      stock?: number;
      reason?: string;
    } | null;

    try {
      const movement = await withTransaction<{ item: Row } | TxFailure>(async (client) => {
        // Lock the row before reading quantity so concurrent adjustments
        // cannot both read the same "before" value.
        const item = await client.query<{ quantity_on_hand: number; kind: string }>(
          `SELECT quantity_on_hand, kind FROM inventory_items
            WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
          [params.id],
        );
        if (!item.rowCount) return { error: 'Product not found', status: 404 as const };
        if (isDigital(item.rows[0].kind)) {
          return { error: 'Digital products have no stock; manage license keys instead', status: 409 as const };
        }
        const before = item.rows[0].quantity_on_hand;
        const after = body?.stock !== undefined ? body.stock : before + (body?.delta ?? 0);
        if (!Number.isInteger(after) || after < 0) {
          return { error: 'Stock cannot become negative', status: 409 as const };
        }
        const delta = after - before;
        await client.query(`UPDATE inventory_items SET quantity_on_hand = $1, updated_at = now() WHERE id = $2`, [
          after,
          params.id,
        ]);
        // A zero-delta adjustment would violate quantity_delta <> 0.
        if (delta !== 0) {
          await client.query(
            `INSERT INTO inventory_stock_movements
               (id, item_id, quantity_delta, quantity_before, quantity_after, reason, idempotency_key, performed_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              randomUUID(),
              params.id,
              delta,
              before,
              after,
              body?.reason?.slice(0, 300) || 'Manual adjustment',
              randomUUID(),
              session.adminId,
            ],
          );
        }
        return { item: (await client.query(`SELECT * FROM inventory_items WHERE id = $1`, [params.id])).rows[0] };
      });

      if ('error' in movement) {
        set.status = movement.status;
        return fail(movement.error);
      }
      return ok({ product: mapProduct(movement.item as Row) });
    } catch {
      set.status = 500;
      return fail('Unable to adjust stock');
    }
  })

  .get('/api/admin/products/:id/movements', async ({ request, set, params, query }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    const limit = Math.min(Number(query.limit ?? 50), 200);
    const { rows } = await dbQuery<Row>(
      `SELECT m.*, i.name AS product_name, i.sku AS product_sku
         FROM inventory_stock_movements m
         JOIN inventory_items i ON i.id = m.item_id
        WHERE m.item_id = $1
        ORDER BY m.created_at DESC LIMIT $2`,
      [params.id, limit],
    );
    return ok({ movements: rows.map(mapMovement) });
  })

  .get('/api/admin/movements', async ({ request, set, query }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    const limit = Math.min(Number(query.limit ?? 20), 200);
    const { rows } = await dbQuery<Row>(
      `SELECT m.*, i.name AS product_name, i.sku AS product_sku
         FROM inventory_stock_movements m
         JOIN inventory_items i ON i.id = m.item_id
        ORDER BY m.created_at DESC LIMIT $1`,
      [limit],
    );
    return ok({ movements: rows.map(mapMovement) });
  })

  // --------------------------------------------------------------- summary
  .get('/api/admin/summary', async ({ request, set, query }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    const lowStockAt = Math.max(Number(query.lowStockAt ?? 5), 0);

    const { rows } = await dbQuery<Row>(
      `SELECT
         (SELECT count(*) FROM inventory_items WHERE deleted_at IS NULL)                                   AS total,
         (SELECT count(*) FROM inventory_items WHERE deleted_at IS NULL AND is_active)                      AS listed,
         (SELECT count(*) FROM inventory_items WHERE deleted_at IS NULL AND kind = 'digital')                AS digital,
         (SELECT count(*) FROM inventory_items WHERE deleted_at IS NULL AND kind = 'physical')              AS physical,
         (SELECT COALESCE(sum(quantity_on_hand),0) FROM inventory_items
           WHERE deleted_at IS NULL AND kind = 'physical')                                                 AS on_hand,
         (SELECT count(*) FROM inventory_items
           WHERE deleted_at IS NULL AND kind = 'physical' AND quantity_on_hand - reserved_quantity <= 0)   AS out_of_stock,
         (SELECT count(*) FROM inventory_items
           WHERE deleted_at IS NULL AND kind = 'physical'
             AND quantity_on_hand - reserved_quantity > 0
             AND quantity_on_hand - reserved_quantity <= $1)                                               AS low_stock,
         (SELECT COALESCE(sum(i.quantity_on_hand * i.sale_price_minor),0) FROM inventory_items i
           WHERE i.deleted_at IS NULL AND i.kind = 'physical')                                             AS stock_value_minor,
         (SELECT count(*) FROM inventory_digital_assets WHERE is_active)                                   AS assets,
         (SELECT count(*) FROM inventory_digital_keys WHERE status = 'available')                          AS keys_available,
         (SELECT count(*) FROM inventory_entitlements WHERE status = 'active')                            AS active_entitlements`,
      [lowStockAt],
    );

    const s = rows[0];
    return ok({
      summary: {
        products: {
          total: Number(s.total ?? 0),
          listed: Number(s.listed ?? 0),
          unlisted: Number(s.total ?? 0) - Number(s.listed ?? 0),
          digital: Number(s.digital ?? 0),
          physical: Number(s.physical ?? 0),
        },
        stock: {
          onHand: Number(s.on_hand ?? 0),
          outOfStock: Number(s.out_of_stock ?? 0),
          lowStock: Number(s.low_stock ?? 0),
          lowStockAt,
          value: Number(s.stock_value_minor ?? 0) / 100,
        },
        digital: {
          assets: Number(s.assets ?? 0),
          keysAvailable: Number(s.keys_available ?? 0),
          activeEntitlements: Number(s.active_entitlements ?? 0),
        },
        assets: Number(s.assets ?? 0),
      },
    });
  })

  // ------------------------------------------------------------------ sales
  // Sales analytics live here rather than in billing-service so the private
  // admin console only ever depends on admin-service. billing-service keeps
  // its own copies for its Neon-Auth-authenticated callers, but those are
  // unreachable from this app because it authenticates with a cookie session.
  .get('/api/admin/sales/summary', async ({ request, set, query }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    return ok({ sales: await salesSummary(requestedYear(query.year)) });
  })
  .get('/api/admin/sales/product/:productId', async ({ request, set, params, query }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    return ok({ sales: await productSales(params.productId, requestedYear(query.year)) });
  })

  // ------------------------------------------------------------- pre-orders
  .get('/api/admin/pre-orders', async ({ request, set, query }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    const search = (query.search ?? '').trim();
    const status = (query.status ?? '').trim();
    const limit = Math.min(Number(query.limit ?? 50), 200);
    const offset = Math.max(Number(query.offset ?? 0), 0);

    const { rows } = await dbQuery<Row>(
      `SELECT po.*, i.name AS product_name, i.sku AS product_sku, i.description AS product_description,
              i.category AS product_category, i.sale_price_minor, i.mrp_minor, i.image_keys
         FROM pre_orders po
         JOIN inventory_items i ON i.id = po.product_id
        WHERE ($1 = '' OR po.customer_email ILIKE '%' || $1 || '%'
                     OR po.customer_name ILIKE '%' || $1 || '%'
                     OR i.name ILIKE '%' || $1 || '%')
          AND ($2 = '' OR po.status = $2)
        ORDER BY po.created_at DESC
        LIMIT $3 OFFSET $4`,
      [search, status, limit, offset],
    );
    return ok({ preOrders: rows.map(mapPreOrder) });
  })

  .get('/api/admin/pre-orders/:id', async ({ request, set, params }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    const { rows } = await dbQuery<Row>(
      `SELECT po.*, i.name AS product_name, i.sku AS product_sku, i.description AS product_description,
              i.category AS product_category, i.sale_price_minor, i.mrp_minor, i.image_keys
         FROM pre_orders po
         JOIN inventory_items i ON i.id = po.product_id
        WHERE po.id = $1`,
      [params.id],
    );
    if (!rows[0]) {
      set.status = 404;
      return fail('Pre-order not found');
    }
    return ok({ preOrder: mapPreOrder(rows[0]) });
  })

  .patch('/api/admin/pre-orders/:id', async ({ request, set, params }) => {
    const session = await admin(request, set);
    if (!session) return unauthorized(set);
    const parsed = preOrderUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      set.status = 400;
      return fail(parsed.error.issues[0]?.message ?? 'Invalid update');
    }
    const p = parsed.data;

    const current = await dbQuery<{ status: string }>(`SELECT status FROM pre_orders WHERE id = $1`, [
      params.id,
    ]);
    if (!current.rowCount) {
      set.status = 404;
      return fail('Pre-order not found');
    }

    // Reject illegal transitions instead of silently corrupting the lifecycle.
    if (p.status && p.status !== current.rows[0].status) {
      const allowed = PRE_ORDER_TRANSITIONS[current.rows[0].status] ?? [];
      if (!allowed.includes(p.status)) {
        set.status = 409;
        return fail(`Cannot move pre-order from "${current.rows[0].status}" to "${p.status}"`);
      }
    }

    const assignments: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      assignments.push(`${col} = $${values.length}`);
    };
    if (p.status !== undefined) add('status', p.status);
    if (p.notes !== undefined) add('notes', p.notes);
    if (p.customerPhone !== undefined) add('customer_phone', p.customerPhone);
    if (p.customerName !== undefined) add('customer_name', p.customerName);
    if (p.quantity !== undefined) add('quantity', p.quantity);
    if (!assignments.length) {
      set.status = 400;
      return fail('No fields to update');
    }
    assignments.push('updated_at = now()');
    values.push(params.id);

    const { rows } = await dbQuery<Row>(
      `UPDATE pre_orders SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    return ok({ preOrder: mapPreOrder(rows[0]) });
  })

  .delete('/api/admin/pre-orders/:id', async ({ request, set, params }) => {
    const session = await admin(request, set);
    if (!session) return unauthorized(set);
    const { rows } = await dbQuery<Row>(
      `UPDATE pre_orders SET status = 'cancelled', updated_at = now()
        WHERE id = $1 AND status NOT IN ('cancelled','delivered') RETURNING *`,
      [params.id],
    );
    if (!rows[0]) {
      set.status = 404;
      return fail('Pre-order not found or already closed');
    }
    return ok({ preOrder: mapPreOrder(rows[0]) });
  })

  // ------------------------------------------------------ product media
  // Serves stored media to the console. `resolveMediaUrl()` in the admin app
  // builds `<admin-base>/media?key=...`, so this route has to exist on the same
  // origin as the console's API calls. Staff-gated; the public storefront reads
  // the same bucket through inventory-service's own /media route.
  .get('/media', async ({ request, set }) => {
    const session = await admin(request, set);
    if (!session) return unauthorized(set);

    const key = new URL(request.url).searchParams.get('key');
    if (!key) {
      set.status = 400;
      return fail('key query parameter is required');
    }

    const signed = await presignObject(key, { expiresIn: 900 });
    if (signed) return Response.redirect(signed, 302);

    const object = await getObject(key);
    if (!object) {
      set.status = 404;
      return fail('Image not found');
    }
    return new Response(object.body, {
      headers: {
        'content-type': object.contentType,
        // Short TTL so a replaced image shows up without a hard refresh.
        'cache-control': 'private, max-age=60',
      },
    });
  })
  .post('/api/admin/assets', async ({ request, set }) => {
    const session = await admin(request, set);
    if (!session) return unauthorized(set);

    const form = await request.formData().catch(() => null);
    if (!form) {
      set.status = 400;
      return fail('Expected multipart form data');
    }
    const files: File[] = [];
    for (const entry of form.getAll('files')) {
      if (entry instanceof File) files.push(entry);
    }
    if (!files.length) {
      set.status = 400;
      return fail('No files uploaded');
    }

    const created: any[] = [];
    for (const file of files.slice(0, 10)) {
      const key = buildObjectKey(file.name, 'product-images');
      const body = new Uint8Array(await file.arrayBuffer());
      await putObject({ key, body, contentType: file.type || 'application/octet-stream' });
      created.push({
        id: key,
        publicId: key,
        objectKey: key,
        bucket: storageBucket,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        bytes: file.size,
        checksum: checksumOf(body),
        resourceType: 'image',
        secureUrl: null,
        url: null,
        createdAt: new Date().toISOString(),
      });
    }
    return ok({ assets: created });
  })

  .get('/api/admin/assets', async ({ request, set, query }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    const productId = query.productId ? String(query.productId) : null;
    const { rows } = await dbQuery<Row>(
      `SELECT id, name, image_keys FROM inventory_items
        WHERE deleted_at IS NULL AND ($1::uuid IS NULL OR id = $1::uuid)`,
      [productId],
    );

    const assets = rows.flatMap((r) =>
      (Array.isArray(r.image_keys) ? r.image_keys : []).map((key: string) => ({
        id: key,
        publicId: key,
        objectKey: key,
        bucket: storageBucket,
        fileName: key.split('/').pop() ?? key,
        contentType: 'image/*',
        bytes: null,
        resourceType: 'image',
        productId: r.id,
        productName: r.name,
        secureUrl: null,
        url: null,
        createdAt: null,
      })),
    );
    return ok({ assets });
  })

  .patch('/api/admin/assets', async ({ request, set, query }) => {
    const session = await admin(request, set);
    if (!session) return unauthorized(set);
    const key = query.key ? String(query.key) : '';
    if (!key) {
      set.status = 400;
      return fail('key is required');
    }
    const body = (await request.json().catch(() => null)) as {
      productId?: string | null;
      primary?: boolean;
    } | null;
    if (!body?.productId) {
      set.status = 400;
      return fail('productId is required');
    }

    // image_keys is a jsonb array; append without clobbering existing entries.
    const { rows } = await dbQuery<Row>(
      `UPDATE inventory_items
          SET image_keys = CASE
                WHEN image_keys @> $2::jsonb THEN image_keys
                ELSE image_keys || $2::jsonb
              END,
              updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, name, image_keys`,
      [body.productId, JSON.stringify([key])],
    );
    if (!rows[0]) {
      set.status = 404;
      return fail('Product not found');
    }
    return ok({
      asset: {
        id: key,
        publicId: key,
        objectKey: key,
        bucket: storageBucket,
        fileName: key.split('/').pop() ?? key,
        bytes: null,
        resourceType: 'image',
        productId: rows[0].id,
        secureUrl: null,
        url: null,
      },
    });
  })

  .delete('/api/admin/assets', async ({ request, set, query }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    const key = query.key ? String(query.key) : '';
    if (!key) {
      set.status = 400;
      return fail('key is required');
    }
    const productId = query.productId ? String(query.productId) : null;

    if (productId) {
      // jsonb `-` removes the matching element from the array
      await dbQuery(
        `UPDATE inventory_items SET image_keys = image_keys - $2, updated_at = now()
          WHERE id = $1 AND deleted_at IS NULL`,
        [productId, key],
      );
    }
    if (query.purge === 'true') await deleteObject(key).catch(() => undefined);

    return ok({ publicId: key, deleted: true, purged: query.purge === 'true' });
  })

  // ---------------------------------------------------- digital fulfilment
  .post('/api/admin/products/:id/digital-assets', async ({ request, set, params }) => {
    const session = await admin(request, set);
    if (!session) return unauthorized(set);

    const form = await request.formData().catch(() => null);
    const files: File[] = [];
    for (const entry of form?.getAll('files') ?? []) {
      if (entry instanceof File) files.push(entry);
    }
    if (!files.length) {
      set.status = 400;
      return fail('No files uploaded');
    }

    const item = await dbQuery<{ kind: string }>(
      `SELECT kind FROM inventory_items WHERE id = $1 AND deleted_at IS NULL`,
      [params.id],
    );
    if (!item.rowCount) {
      set.status = 404;
      return fail('Product not found');
    }
    if (!isDigital(item.rows[0].kind)) {
      set.status = 409;
      return fail('Digital files can only be attached to a digital product');
    }

    const created: any[] = [];
    for (const file of files.slice(0, 10)) {
      const key = buildObjectKey(file.name, 'digital');
      const body = new Uint8Array(await file.arrayBuffer());
      await putObject({ key, body, contentType: file.type || 'application/octet-stream' });
      const { rows } = await dbQuery<Row>(
        `INSERT INTO inventory_digital_assets
           (id, item_id, object_key, bucket, file_name, content_type, bytes, checksum, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          randomUUID(),
          params.id,
          key,
          storageBucket,
          file.name,
          file.type || 'application/octet-stream',
          file.size,
          checksumOf(body),
          session.adminId,
        ],
      );
      created.push(mapDigitalAsset(rows[0]));
    }
    return ok({ assets: created });
  })

  .get('/api/admin/products/:id/assets', async ({ request, set, params }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    const { rows } = await dbQuery<Row>(
      `SELECT * FROM inventory_digital_assets
        WHERE item_id = $1 AND is_active ORDER BY position, created_at`,
      [params.id],
    );
    return ok({ assets: rows.map(mapDigitalAsset) });
  })

  // Same listing as /assets above. Upload uses /digital-assets, so the read is
  // aliased to match instead of forcing callers to remember both names.
  .get('/api/admin/products/:id/digital-assets', async ({ request, set, params }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    const { rows } = await dbQuery<Row>(
      `SELECT * FROM inventory_digital_assets
        WHERE item_id = $1 AND is_active ORDER BY position, created_at`,
      [params.id],
    );
    return ok({ assets: rows.map(mapDigitalAsset) });
  })

  .delete('/api/admin/assets/:id', async ({ request, set, params }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    const { rowCount } = await dbQuery(`DELETE FROM inventory_digital_assets WHERE id = $1`, [
      params.id,
    ]);
    if (!rowCount) {
      set.status = 404;
      return fail('Asset not found');
    }
    return ok({ deleted: true });
  })

  .get('/api/admin/products/:id/license-keys', async ({ request, set, params, query }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    const search = (query.search ?? '').trim();
    const { rows } = await dbQuery<Row>(
      `SELECT * FROM inventory_digital_keys
        WHERE item_id = $1 AND ($2 = '' OR license_key ILIKE '%' || $2 || '%')
        ORDER BY created_at DESC LIMIT 500`,
      [params.id, search],
    );
    return ok({ keys: rows.map(mapLicenseKey) });
  })

  .post('/api/admin/products/:id/license-keys', async ({ request, set, params }) => {
    const session = await admin(request, set);
    if (!session) return unauthorized(set);
    const body = (await request.json().catch(() => null)) as { keys?: unknown } | null;
    const keys = (Array.isArray(body?.keys) ? body!.keys : [])
      .map((k) => String(k).trim())
      .filter(Boolean);
    if (!keys.length) {
      set.status = 400;
      return fail('No license keys provided');
    }

    const inserted = await withTransaction(async (client) => {
      let count = 0;
      for (const key of keys) {
        const { rowCount } = await client.query(
          `INSERT INTO inventory_digital_keys (id, item_id, license_key, created_by)
           VALUES ($1,$2,$3,$4) ON CONFLICT (item_id, license_key) DO NOTHING`,
          [randomUUID(), params.id, key, session.adminId],
        );
        count += rowCount ?? 0;
      }
      return count;
    });
    return ok({ imported: inserted, skipped: keys.length - inserted });
  })

  .delete('/api/admin/license-keys/:id', async ({ request, set, params }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    // Revoke rather than delete so issued entitlements stay auditable.
    const { rowCount } = await dbQuery(
      `UPDATE inventory_digital_keys SET status = 'revoked', revoked_at = now() WHERE id = $1`,
      [params.id],
    );
    if (!rowCount) {
      set.status = 404;
      return fail('License key not found');
    }
    return ok({ revoked: true });
  })

  .get('/api/admin/products/:id/entitlements', async ({ request, set, params }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    const { rows } = await dbQuery<Row>(
      `SELECT e.*, i.name AS product_name, i.sku AS product_sku
         FROM inventory_entitlements e
         JOIN inventory_items i ON i.id = e.item_id
        WHERE e.item_id = $1
        ORDER BY e.created_at DESC LIMIT 200`,
      [params.id],
    );
    return ok({ entitlements: rows.map(mapEntitlement) });
  })

  .post('/api/admin/entitlements/:id/revoke', async ({ request, set, params }) => {
    if (!(await admin(request, set))) return unauthorized(set);
    const { rows } = await dbQuery<Row>(
      `UPDATE inventory_entitlements SET status = 'revoked', revoked_at = now(), updated_at = now()
        WHERE id = $1 RETURNING *`,
      [params.id],
    );
    if (!rows[0]) {
      set.status = 404;
      return fail('Entitlement not found');
    }
    return ok({ entitlement: mapEntitlement(rows[0]) });
  });

// ------------------------------------------------------------------- sales
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function requestedYear(raw: unknown): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : new Date().getUTCFullYear();
}

async function salesSummary(year: number) {
  const [{ rows: monthly }, { rows: daily }] = await Promise.all([
    dbQuery<Row>(
      `SELECT EXTRACT(MONTH FROM o."createdAt")::int AS month,
              COUNT(DISTINCT o.id)::int AS "orderCount",
              COALESCE(SUM(o.total),0)::float AS "totalRevenue",
              COALESCE(SUM(oi.quantity),0)::int AS "totalItems"
         FROM orders o
         JOIN order_items oi ON oi."orderId" = o.id
        WHERE EXTRACT(YEAR FROM o."createdAt") = $1 AND o.status <> 'failed'
        GROUP BY 1`,
      [year],
    ),
    dbQuery<Row>(
      `SELECT EXTRACT(DOY FROM o."createdAt")::int AS day,
              COUNT(DISTINCT o.id)::int AS "orderCount",
              COALESCE(SUM(o.total),0)::float AS "totalRevenue"
         FROM orders o
        WHERE EXTRACT(YEAR FROM o."createdAt") = $1 AND o.status <> 'failed'
        GROUP BY 1`,
      [year],
    ),
  ]);

  const monthlyRows = new Map(monthly.map((row) => [Number(row.month), row]));
  const dailyRows = new Map(daily.map((row) => [Number(row.day), row]));

  return {
    year,
    monthlySales: Array.from({ length: 12 }, (_, i) => {
      const row = monthlyRows.get(i + 1);
      return {
        month: i + 1,
        orderCount: Number(row?.orderCount ?? 0),
        totalRevenue: Number(row?.totalRevenue ?? 0),
        totalItems: Number(row?.totalItems ?? 0),
      };
    }),
    dailySales: Array.from({ length: isLeapYear(year) ? 366 : 365 }, (_, i) => {
      const row = dailyRows.get(i + 1);
      return {
        day: i + 1,
        orderCount: Number(row?.orderCount ?? 0),
        totalRevenue: Number(row?.totalRevenue ?? 0),
      };
    }),
  };
}

async function productSales(productId: string, year: number) {
  const [monthly, daily, product] = await Promise.all([
    dbQuery<Row>(
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
      [productId, year],
    ),
    dbQuery<Row>(
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
      [productId, year],
    ),
    // Resolved from the shared catalog instead of calling inventory-service,
    // so a sales view never depends on the public service being reachable.
    dbQuery<Row>(
      `SELECT id, name, sale_price_minor, category, image_keys
         FROM inventory_items WHERE id = $1`,
      [productId],
    ),
  ]);

  const monthlyRows = new Map(monthly.rows.map((row) => [Number(row.month), row]));
  const dailyRows = new Map(daily.rows.map((row) => [Number(row.day), row]));
  const info = product.rows[0];
  const imageKeys = Array.isArray(info?.image_keys) ? (info.image_keys as string[]) : [];

  const totals = monthly.rows.reduce(
    (acc, row) => ({
      totalQuantity: acc.totalQuantity + Number(row.quantitySold ?? 0),
      totalRevenue: acc.totalRevenue + Number(row.revenue ?? 0),
      totalOrders: acc.totalOrders + Number(row.orderCount ?? 0),
    }),
    { totalQuantity: 0, totalRevenue: 0, totalOrders: 0 },
  );

  return {
    product: {
      id: productId,
      name: info?.name ?? 'Product',
      price: Number(info?.sale_price_minor ?? 0) / 100,
      // Raw storage key; the admin client resolves it through /media.
      imageUrl: imageKeys.length ? imageKeys[0] : null,
      category: info?.category ?? null,
    },
    year,
    yearly: totals,
    monthlySales: Array.from({ length: 12 }, (_, i) => {
      const row = monthlyRows.get(i + 1);
      return {
        month: i + 1,
        quantitySold: Number(row?.quantitySold ?? 0),
        revenue: Number(row?.revenue ?? 0),
        orderCount: Number(row?.orderCount ?? 0),
      };
    }),
    dailySales: Array.from({ length: isLeapYear(year) ? 366 : 365 }, (_, i) => {
      const row = dailyRows.get(i + 1);
      return {
        day: i + 1,
        quantitySold: Number(row?.quantitySold ?? 0),
        revenue: Number(row?.revenue ?? 0),
        orderCount: Number(row?.orderCount ?? 0),
      };
    }),
  };
}

await ensureSchema();
await seedAdminFromEnv();
await pruneExpiredSessions();

app$.listen(PORT);

console.log(`[ADMIN] admin-service listening on :${PORT}`);