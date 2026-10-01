/**
 * Digital inventory domain logic: deliverables, license keys and entitlements.
 *
 * A digital product either ships files (Neon Object Storage objects), license
 * keys from a pool, or both. Fulfilment is idempotent per order line, so a
 * retried payment webhook never hands out a second license.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { db } from './db';

export type ProductKind = 'physical' | 'digital';
export type DeliveryMode = 'files' | 'license_keys' | 'both';

export const deliveryModes: DeliveryMode[] = ['files', 'license_keys', 'both'];

export const isDigital = (kind: unknown): boolean => kind === 'digital';

export const deliversFiles = (mode: string) => mode === 'files' || mode === 'both';

export const deliversKeys = (mode: string) => mode === 'license_keys' || mode === 'both';

/** URL-safe, single-use delivery token baked into customer emails. */
export const createAccessToken = () => randomBytes(32).toString('base64url');

export function formatAsset(row: Record<string, any>) {
  return {
    id: row.id,
    publicId: row.id,
    itemId: row.item_id ?? null,
    productId: row.item_id ?? null,
    objectKey: row.object_key,
    bucket: row.bucket,
    fileName: row.file_name,
    format: row.file_name?.includes('.') ? row.file_name.split('.').pop() : null,
    contentType: row.content_type,
    bytes: Number(row.bytes ?? 0),
    checksum: row.checksum ?? null,
    position: row.position ?? 0,
    secureUrl: null,
    url: null,
    resourceType: 'raw',
    createdAt: row.created_at,
  };
}

export interface DigitalSummary {
  assets: number;
  keysAvailable: number;
  keysTotal: number;
}

/**
 * One aggregate query per table for the whole page instead of a per-row query,
 * and counts only — the deliverable bytes never travel to the admin list view.
 */
export async function digitalSummaries(itemIds: string[]): Promise<Map<string, DigitalSummary>> {
  const summaries = new Map<string, DigitalSummary>();
  if (!itemIds.length) return summaries;

  const assets = await db.query<{ item_id: string; count: string }>(
    `SELECT item_id, COUNT(*)::text AS count
       FROM inventory_digital_assets
      WHERE item_id = ANY($1::uuid[]) AND is_active
      GROUP BY item_id`,
    [itemIds]
  );
  for (const row of assets.rows) {
    summaries.set(row.item_id, { assets: Number(row.count), keysAvailable: 0, keysTotal: 0 });
  }

  const keys = await db.query<{ item_id: string; available: string; total: string }>(
    `SELECT item_id,
            COUNT(*) FILTER (WHERE status = 'available')::text AS available,
            COUNT(*)::text AS total
       FROM inventory_digital_keys
      WHERE item_id = ANY($1::uuid[])
      GROUP BY item_id`,
    [itemIds]
  );
  for (const row of keys.rows) {
    const current = summaries.get(row.item_id) ?? { assets: 0, keysAvailable: 0, keysTotal: 0 };
    current.keysAvailable = Number(row.available);
    current.keysTotal = Number(row.total);
    summaries.set(row.item_id, current);
  }

  return summaries;
}

export interface FulfillmentLine {
  itemId: string;
  orderItemId?: string | null;
  quantity?: number;
}

export interface FulfillmentInput {
  orderId: string;
  customerEmail: string;
  userId?: string | null;
  items: FulfillmentLine[];
}

export interface FulfillmentOutcome {
  orderId: string;
  created: number;
  entitlements: Array<Record<string, any>>;
  skipped: Array<{ itemId: string; reason: string }>;
}

export class FulfillmentError extends Error {
  constructor(
    message: string,
    public status = 409
  ) {
    super(message);
    this.name = 'FulfillmentError';
  }
}

/**
 * Grants every digital line in an order. Safe to call twice: the unique
 * `fulfillment_key` (orderId + order line) makes replays return the existing
 * entitlement untouched.
 */
export async function fulfillOrder(
  input: FulfillmentInput,
  baseUrl: string
): Promise<FulfillmentOutcome> {
  const client = await db.connect();
  const entitlements: Array<Record<string, any>> = [];
  const skipped: Array<{ itemId: string; reason: string }> = [];
  let created = 0;

  try {
    await client.query('BEGIN');

    for (const line of input.items) {
      const quantity = Math.max(1, Number(line.quantity ?? 1));
      const itemResult = await client.query(
        `SELECT id, name, kind, delivery_mode, download_limit
           FROM inventory_items
          WHERE id = $1 AND deleted_at IS NULL`,
        [line.itemId]
      );
      const item = itemResult.rows[0];

      if (!item) {
        skipped.push({ itemId: line.itemId, reason: 'item_not_found' });
        continue;
      }
      if (!isDigital(item.kind)) {
        skipped.push({ itemId: line.itemId, reason: 'not_digital' });
        continue;
      }

      const fulfillmentKey = `${input.orderId}:${line.orderItemId ?? line.itemId}`;

      const existing = await client.query(
        `SELECT * FROM inventory_entitlements WHERE fulfillment_key = $1`,
        [fulfillmentKey]
      );
      if (existing.rowCount) {
        entitlements.push(formatEntitlement(existing.rows[0], baseUrl));
        continue;
      }

      let licenseKeys: string[] = [];
      if (deliversKeys(item.delivery_mode)) {
        const pool = await client.query<{ id: string; license_key: string }>(
          `SELECT id, license_key
             FROM inventory_digital_keys
            WHERE item_id = $1 AND status = 'available'
            ORDER BY created_at
            LIMIT $2
            FOR UPDATE SKIP LOCKED`,
          [item.id, quantity]
        );

        if (pool.rowCount !== quantity) {
          throw new FulfillmentError(
            `Not enough license keys for "${item.name}" — requested ${quantity}, available ${pool.rowCount}`
          );
        }

        licenseKeys = pool.rows.map((row) => row.license_key);

        await client.query(
          `UPDATE inventory_digital_keys SET status = 'assigned', assigned_at = now()
            WHERE id = ANY($1::uuid[])`,
          [pool.rows.map((row) => row.id)]
        );
      }

      const entitlement = await client.query(
        `INSERT INTO inventory_entitlements
           (id, fulfillment_key, order_id, order_item_id, item_id, user_id, customer_email,
            delivery_mode, access_token, download_limit, license_keys)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
         RETURNING *`,
        [
          randomUUID(),
          fulfillmentKey,
          input.orderId,
          line.orderItemId ?? null,
          item.id,
          input.userId ?? null,
          input.customerEmail.toLowerCase(),
          item.delivery_mode,
          createAccessToken(),
          item.download_limit ?? null,
          JSON.stringify(licenseKeys),
        ]
      );

      if (licenseKeys.length) {
        await client.query(
          `UPDATE inventory_digital_keys
              SET entitlement_id = $1
            WHERE item_id = $2 AND license_key = ANY($3::text[])`,
          [entitlement.rows[0].id, item.id, licenseKeys]
        );
      }

      created += 1;
      entitlements.push(formatEntitlement(entitlement.rows[0], baseUrl));
    }

    await client.query('COMMIT');
    return { orderId: input.orderId, created, entitlements, skipped };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Shapes a row from `inventory_entitlements` for API responses. `baseUrl` is the
 * public origin of the inventory service, used to build the customer claim URL.
 */
export function formatEntitlement(row: Record<string, any>, baseUrl: string) {
  const licenseKeys: string[] = Array.isArray(row.license_keys) ? row.license_keys : [];
  return {
    id: row.id,
    orderId: row.order_id,
    orderItemId: row.order_item_id ?? null,
    itemId: row.item_id,
    userId: row.user_id ?? null,
    customerEmail: row.customer_email,
    deliveryMode: row.delivery_mode as DeliveryMode,
    status: row.status,
    downloadCount: row.download_count ?? 0,
    downloadLimit: row.download_limit ?? null,
    downloadsRemaining:
      row.download_limit == null
        ? null
        : Math.max(0, row.download_limit - (row.download_count ?? 0)),
    licenseKeys,
    claimUrl: `${baseUrl}/downloads/${row.access_token}`,
    accessToken: row.access_token,
    expiresAt: row.expires_at ?? null,
    fulfilledAt: row.fulfilled_at,
    lastDownloadedAt: row.last_downloaded_at ?? null,
    createdAt: row.created_at,
  };
}
