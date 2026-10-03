import type { Row } from './db';

/**
 * Row -> API shape mappers.
 *
 * These deliberately reproduce the field names the admin screens already
 * consume (`price`, `mrp`, `stock`, `isListed`, ...) so relocating the UI does
 * not require rewriting it. Money stays integer paise in the database and is
 * only converted to major units here.
 */

export const toMinor = (rupees: number): number => Math.round(rupees * 100);
export const toMajor = (paise: number | null | undefined): number => (paise ?? 0) / 100;

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));

export function isDigital(kind: string): boolean {
  return kind === 'digital';
}

export function mapProduct(r: Row) {
  const kind = r.kind ?? 'physical';
  const digital = isDigital(kind);
  const deliveryMode = r.delivery_mode ?? 'files';
  const sellsKeys = deliveryMode === 'license_keys' || deliveryMode === 'both';
  const onHand = num(r.quantity_on_hand);

  return {
    id: r.id,
    sku: r.sku,
    name: r.name,
    description: r.description ?? null,
    category: r.category ?? null,
    price: toMajor(r.sale_price_minor),
    mrp: toMajor(r.mrp_minor),
    kind,
    deliveryMode,
    downloadLimit: r.download_limit ?? null,
    digitalInstructions: r.digital_instructions ?? null,
    // Digital file-only products are unlimited; key-backed digital goods sell
    // from the key pool, which is surfaced as `keysAvailable`.
    stock: digital ? (sellsKeys ? num(r.keys_available) : null) : onHand,
    quantityOnHand: onHand,
    reservedQuantity: num(r.reserved_quantity),
    availableQuantity: r.available_quantity === null ? null : num(r.available_quantity),
    isDigital: digital,
    sellsFiles: deliveryMode === 'files' || deliveryMode === 'both',
    sellsLicenseKeys: sellsKeys,
    keysAvailable: r.keys_available === undefined ? undefined : num(r.keys_available),
    keysTotal: r.keys_total === undefined ? undefined : num(r.keys_total),
    imageKeys: Array.isArray(r.image_keys) ? r.image_keys : [],
    imageUrl: Array.isArray(r.image_keys) && r.image_keys.length ? r.image_keys[0] : null,
    isListed: r.is_active === true,
    isActive: r.is_active === true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapMovement(r: Row) {
  return {
    id: r.id,
    productId: r.item_id,
    delta: num(r.quantity_delta),
    reason: r.reason,
    reference: r.idempotency_key,
    createdAt: r.created_at,
    product: r.product_name
      ? { id: r.item_id, sku: r.product_sku ?? '', name: r.product_name }
      : undefined,
  };
}

export function mapPreOrder(r: Row) {
  const price = toMajor(r.sale_price_minor);
  const quantity = num(r.quantity);
  return {
    id: r.id,
    productId: r.product_id,
    quantity,
    status: r.status,
    customerEmail: r.customer_email,
    customerName: r.customer_name ?? null,
    customerPhone: r.customer_phone ?? null,
    notes: r.notes ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    product: {
      id: r.product_id,
      sku: r.product_sku ?? '',
      name: r.product_name ?? '',
      description: r.product_description ?? null,
      category: r.product_category ?? null,
      price,
      mrp: toMajor(r.mrp_minor),
      imageUrl: Array.isArray(r.image_keys) && r.image_keys.length ? r.image_keys[0] : null,
    },
    totalAmount: price * quantity,
  };
}

export function mapDigitalAsset(r: Row) {
  return {
    id: r.id,
    publicId: r.object_key,
    itemId: r.item_id,
    productId: r.item_id,
    objectKey: r.object_key,
    bucket: r.bucket,
    fileName: r.file_name,
    format: r.file_name?.split('.').pop() ?? null,
    contentType: r.content_type,
    bytes: num(r.bytes),
    checksum: r.checksum ?? null,
    position: num(r.position),
    resourceType: 'file',
    secureUrl: null,
    url: null,
    createdAt: r.created_at,
  };
}

export function mapLicenseKey(r: Row) {
  return {
    id: r.id,
    licenseKey: r.license_key,
    status: r.status,
    entitlementId: r.entitlement_id ?? null,
    createdAt: r.created_at,
    assignedAt: r.assigned_at ?? null,
  };
}

export function mapEntitlement(r: Row) {
  const keys = Array.isArray(r.license_keys) ? r.license_keys : [];
  return {
    id: r.id,
    orderId: r.order_id,
    orderItemId: r.order_item_id ?? null,
    itemId: r.item_id,
    userId: r.user_id ?? null,
    customerEmail: r.customer_email,
    deliveryMode: r.delivery_mode,
    status: r.status,
    downloadCount: num(r.download_count),
    downloadLimit: r.download_limit ?? null,
    downloadsRemaining: r.download_limit === null ? null : r.download_limit - num(r.download_count),
    licenseKeys: keys,
    claimUrl: `/downloads/${r.access_token}`,
    expiresAt: r.expires_at ?? null,
    fulfilledAt: r.fulfilled_at,
    lastDownloadedAt: r.last_downloaded_at ?? null,
    createdAt: r.created_at,
    product: r.product_name ? { id: r.item_id, name: r.product_name, sku: r.product_sku ?? '' } : undefined,
  };
}