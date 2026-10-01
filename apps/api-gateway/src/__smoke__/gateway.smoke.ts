/**
 * Cross-service smoke test: drives a digital purchase through the gateway.
 *
 *   bun --env-file=../../.env run apps/api-gateway/src/__smoke__/gateway.smoke.ts
 *
 * Requires inventory (3002), cart (3003), billing (3004), email (3005) and the
 * gateway (8081) to be running. Everything it creates is removed at the end.
 */
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { signServiceRequest } from 'shared-utils';

const gateway = 'http://localhost:8081';
const secret = process.env.INTERNAL_SERVICE_SECRET ?? '';
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const sku = `SMOKE-GW-${Date.now()}`;
const itemId = randomUUID();
const orderId = `smoke-gw-order-${randomUUID()}`;

const checks: Array<[string, boolean, unknown?]> = [];
const check = (label: string, passed: boolean, detail?: unknown) => {
  checks.push([label, passed, detail]);
  const suffix = !passed && detail !== undefined ? ` -> ${JSON.stringify(detail)}` : '';
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${suffix}`);
};

const fulfilmentBody = JSON.stringify({
  orderId,
  customerEmail: 'smoke-gateway@robocraft.com',
  items: [{ itemId, quantity: 1 }],
});

async function postInternal(
  bodyText: string,
  secretOverride = secret
): Promise<{
  status: number;
  payload: any;
}> {
  // The signature binds the path the *receiving service* sees, which is after
  // the gateway strips `/inventory` — exactly what billing signs when it calls
  // inventory-service directly.
  const path = '/internal/fulfillments';
  const { timestamp, signature } = signServiceRequest(secretOverride, 'POST', path, bodyText);
  const response = await fetch(`${gateway}/inventory${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-service-timestamp': String(timestamp),
      'x-service-signature': signature,
    },
    body: bodyText,
  });
  return { status: response.status, payload: await response.json().catch(() => null) };
}

async function run() {
  await sql`
    INSERT INTO inventory_items
      (id, sku, name, description, image_keys, mrp_minor, sale_price_minor, quantity_on_hand,
       is_active, created_by, kind, delivery_mode, download_limit)
    VALUES (${itemId}, ${sku}, 'Gateway Smoke Digital', 'throwaway', '[]'::jsonb,
            19900, 9900, 0, true, 'smoke-test', 'digital', 'license_keys', 5)
  `;
  await sql`
    INSERT INTO inventory_digital_keys (id, item_id, license_key, created_by)
    VALUES (gen_random_uuid(), ${itemId}, 'GW-KEY-1', 'smoke-test')
  `;
  check('setup: digital product with one license key', true);

  // ------------------------------------------------------------- routing
  const list = await fetch(`${gateway}/inventory/products?search=${sku}`);
  const listBody = (await list.json()) as any;
  const listed = listBody?.data?.items?.[0];
  check('gateway routes /inventory to inventory-service', list.status === 200 && Boolean(listed));
  check(
    'storefront sees kind=digital and derived stock',
    listed?.kind === 'digital' && listed?.stock === 1,
    { kind: listed?.kind, stock: listed?.stock }
  );

  const cart = await fetch(`${gateway}/api/cart`);
  check(
    'gateway routes /api/cart to cart-service (401 without a session)',
    cart.status === 401,
    cart.status
  );

  const track = await fetch(`${gateway}/api/track-order`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'no-such-order' }),
  });
  const trackBody = (await track.json().catch(() => null)) as any;
  check(
    'gateway routes /api/track-order to billing-service',
    track.status === 200 && Array.isArray(trackBody.orders),
    { status: track.status }
  );

  const chat = await fetch(`${gateway}/api/chat`, { method: 'POST' });
  check('unimplemented storefront route answers 501 (not 404)', chat.status === 501, chat.status);

  const unknown = await fetch(`${gateway}/api/nope`);
  check('unknown route answers 404', unknown.status === 404, unknown.status);

  // -------------------------------------------------- fulfilment security
  const unsigned = await fetch(`${gateway}/inventory/internal/fulfillments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: fulfilmentBody,
  });
  check('unsigned fulfilment is rejected', unsigned.status === 401, unsigned.status);

  const wrongSecret = await postInternal(fulfilmentBody, 'not-the-secret');
  check(
    'fulfilment with a wrong signature is rejected',
    wrongSecret.status === 401,
    wrongSecret.status
  );

  const first = await postInternal(fulfilmentBody);
  check('signed fulfilment is accepted', first.status === 201, first.payload);
  const entitlement = first.payload?.data?.entitlements?.[0];
  check(
    'fulfilment hands over the license key',
    entitlement?.licenseKeys?.length === 1,
    entitlement?.licenseKeys
  );

  const replay = await postInternal(fulfilmentBody);
  check(
    'replayed fulfilment creates nothing new',
    replay.payload?.data?.created === 0,
    replay.payload?.data
  );
  check(
    'replayed fulfilment returns the same entitlement',
    replay.payload?.data?.entitlements?.[0]?.id === entitlement?.id
  );

  // ------------------------------------------------------ customer delivery
  const claim = await fetch(`${gateway}/inventory/downloads/${entitlement.accessToken}`);
  const claimBody = (await claim.json()) as any;
  check(
    'claim page resolves through the gateway',
    claim.status === 200 && claimBody.success === true,
    claim.status
  );
  check(
    'claim page lists the license key',
    claimBody?.data?.entitlement?.licenseKeys?.length === 1
  );

  const forged = await fetch(
    `${gateway}/inventory/downloads/${entitlement.accessToken.slice(0, -1)}x`
  );
  check('a wrong token cannot claim the download', forged.status === 404, forged.status);
}

try {
  await run();
} finally {
  await sql`DELETE FROM inventory_entitlements WHERE order_id = ${orderId}`;
  await sql`DELETE FROM inventory_digital_keys WHERE item_id = ${itemId}`;
  await sql`DELETE FROM inventory_items WHERE id = ${itemId}`;
  const leftover = await sql`SELECT COUNT(*)::int AS n FROM inventory_items WHERE sku = ${sku}`;
  console.log(`\ncleanup: ${leftover[0].n} leftover item(s)`);
  await sql.end();

  const failed = checks.filter(([, passed]) => !passed);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) process.exit(1);
}
