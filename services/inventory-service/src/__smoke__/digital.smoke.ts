/**
 * Live end-to-end smoke test for digital inventory.
 *
 *   bun --env-file=../../.env run src/__smoke__/digital.smoke.ts
 *
 * Creates a throwaway digital product, uploads a real deliverable to object
 * storage, fulfils an order twice (proving idempotency), then downloads the
 * file through the public token-gated endpoint. Everything it creates is
 * removed at the end. Requires the service to be running on PORT (default 3002).
 */
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { fulfillOrder } from '../digital';
import { buildObjectKey, deleteObject, putObject } from '../storage';

const sku = `SMOKE-DIGITAL-${Date.now()}`;
const itemId = randomUUID();
const orderId = `smoke-order-${randomUUID()}`;
const objectKey = buildObjectKey('smoke-deliverable.txt', `digital/smoke/${itemId}`);
const baseUrl = `http://localhost:${process.env.PORT ?? 3002}`;

const checks: Array<[string, boolean, unknown?]> = [];
const check = (label: string, passed: boolean, detail?: unknown) => {
  checks.push([label, passed, detail]);
  const suffix = !passed && detail !== undefined ? ` -> ${JSON.stringify(detail)}` : '';
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${suffix}`);
};

async function cleanup() {
  await db.query(`DELETE FROM inventory_entitlements WHERE order_id = $1`, [orderId]);
  await db.query(`DELETE FROM inventory_digital_keys WHERE item_id = $1`, [itemId]);
  await db.query(`DELETE FROM inventory_digital_assets WHERE item_id = $1`, [itemId]);
  await db.query(`DELETE FROM inventory_items WHERE id = $1`, [itemId]);
  await deleteObject(objectKey).catch(() => undefined);
}

try {
  // ---------------------------------------------------------------- setup
  await db.query(
    `INSERT INTO inventory_items
       (id, sku, name, description, image_keys, mrp_minor, sale_price_minor, quantity_on_hand,
        is_active, created_by, kind, delivery_mode, download_limit, digital_instructions)
     VALUES ($1,$2,$3,$4,'[]'::jsonb,$5,$6,0,true,'smoke-test','digital','both',3,$7)`,
    [
      itemId,
      sku,
      'Smoke Test Digital Product',
      'Throwaway row created by digital.smoke.ts',
      49900,
      29900,
      'Unzip and enjoy.',
    ]
  );

  const body = new TextEncoder().encode('robocraft digital deliverable payload');
  await putObject({ key: objectKey, body, contentType: 'text/plain' });
  const asset = await db.query(
    `INSERT INTO inventory_digital_assets
       (id, item_id, object_key, bucket, file_name, content_type, bytes, position, created_by)
     VALUES ($1,$2,$3,$4,'smoke-deliverable.txt','text/plain',$5,0,'smoke-test') RETURNING id`,
    [
      randomUUID(),
      itemId,
      objectKey,
      process.env.INVENTORY_STORAGE_BUCKET || 'productimages',
      body.byteLength,
    ]
  );
  const assetId = asset.rows[0].id as string;

  await db.query(
    `INSERT INTO inventory_digital_keys (id, item_id, license_key, created_by)
     SELECT gen_random_uuid(), $1, key, 'smoke-test'
       FROM unnest($2::text[]) AS key`,
    [itemId, ['SMOKE-KEY-1', 'SMOKE-KEY-2', 'SMOKE-KEY-3']]
  );
  check('setup: digital product + deliverable + 3 keys', true);

  // ------------------------------------------------------------ fulfilment
  const first = await fulfillOrder(
    { orderId, customerEmail: 'smoke@robocraft.com', items: [{ itemId, quantity: 2 }] },
    baseUrl
  );
  check('first fulfilment creates one entitlement', first.created === 1, first);
  check(
    'first fulfilment assigns 2 license keys',
    first.entitlements[0]?.licenseKeys?.length === 2,
    first.entitlements[0]
  );

  const second = await fulfillOrder(
    { orderId, customerEmail: 'smoke@robocraft.com', items: [{ itemId, quantity: 2 }] },
    baseUrl
  );
  check('replayed fulfilment creates nothing new', second.created === 0, second);
  check(
    'replayed fulfilment returns the same entitlement',
    second.entitlements[0]?.id === first.entitlements[0]?.id
  );

  const after = await db.query(
    `SELECT COUNT(*) FILTER (WHERE status = 'assigned')::int AS assigned,
            COUNT(*) FILTER (WHERE status = 'available')::int AS available
       FROM inventory_digital_keys WHERE item_id = $1`,
    [itemId]
  );
  check(
    'exactly 2 keys assigned, 1 still available',
    after.rows[0].assigned === 2 && after.rows[0].available === 1,
    after.rows[0]
  );

  const token = first.entitlements[0].accessToken as string;

  // --------------------------------------------------------- public delivery
  const claim = await fetch(`${baseUrl}/downloads/${token}`);
  const claimBody = (await claim.json()) as any;
  check('claim page resolves', claim.status === 200 && claimBody.success === true, claim.status);
  check('claim page returns a download URL', Boolean(claimBody.data?.files?.[0]?.downloadUrl));

  const file = await fetch(`${baseUrl}/downloads/${token}/files/${assetId}`);
  const bytes = await file.text();
  check(
    'deliverable downloads through the signed URL',
    file.status === 200 && bytes === 'robocraft digital deliverable payload',
    file.status
  );

  const counted = await db.query(
    `SELECT download_count FROM inventory_entitlements WHERE access_token = $1`,
    [token]
  );
  check('download counter incremented', counted.rows[0].download_count === 1, counted.rows[0]);

  // -------------------------------------------- over-download protection
  await db.query(`UPDATE inventory_entitlements SET download_limit = 1 WHERE access_token = $1`, [
    token,
  ]);
  const blocked = await fetch(`${baseUrl}/downloads/${token}/files/${assetId}`);
  check('download limit blocks the next fetch', blocked.status === 409, blocked.status);

  const unknown = await fetch(`${baseUrl}/downloads/not-a-real-token`);
  check('unknown token returns 404', unknown.status === 404, unknown.status);

  // -------------------------------------------------------- storefront API
  const list = await fetch(`${baseUrl}/products?search=${sku}`);
  const listBody = (await list.json()) as any;
  const listed = listBody.data?.items?.find((item: any) => item.id === itemId);
  check('storefront lists the digital product', Boolean(listed));
  check('storefront reports kind=digital', listed?.kind === 'digital', listed?.kind);
  check('storefront derives stock from the key pool', listed?.stock === 1, listed?.stock);
  check('storefront reports the deliverable count', listed?.assetsCount === 1, listed?.assetsCount);

  const detail = await fetch(`${baseUrl}/products/${itemId}`);
  const detailBody = (await detail.json()) as any;
  check(
    'product detail exposes deliveryMode',
    detailBody.data?.deliveryMode === 'both',
    detailBody.data?.deliveryMode
  );

  // -------------------------------------------------------------- guardrails
  const stockAttempt = await fetch(`${baseUrl}/products/${itemId}/stock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ delta: 5, reason: 'should be rejected' }),
  });
  check(
    'unauthenticated stock change is forbidden',
    stockAttempt.status === 403,
    stockAttempt.status
  );

  const publicProducts = await fetch(`${baseUrl}/products`);
  const publicBody = await publicProducts.text();
  check('public product list never exposes access tokens', !publicBody.includes('accessToken'));
} finally {
  await cleanup();
  const remaining = await db.query(
    `SELECT COUNT(*)::int AS n FROM inventory_items WHERE sku = $1`,
    [sku]
  );
  console.log(`\ncleanup: ${remaining.rows[0].n} leftover item(s)`);
  await db.end();

  const failed = checks.filter(([, passed]) => !passed);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) process.exit(1);
}
