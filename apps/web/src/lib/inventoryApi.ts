import { getBackendUrl } from "@/lib/backend";
import { getApiErrorMessage, parseJsonSafely } from "@/lib/apiErrors";

/** Digital-inventory service, reachable through the nginx gateway at /inventory. */
export type ProductKind = "physical" | "digital";

export interface InventoryAsset {
  id: string;
  publicId: string;
  secureUrl: string;
  folder: string | null;
  format: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  resourceType: string;
  productId: string | null;
  createdAt: string;
}

export interface InventoryProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  mrp?: number;
  category: string | null;
  kind: ProductKind;
  deliveryMode?: DeliveryMode;
  downloadLimit?: number | null;
  digitalInstructions?: string | null;
  isDigital?: boolean;
  imageUrl: string | null;
  imageKeys?: string[];
  /** null means "unlimited" — digital file products are never stocked. */
  stock: number | null;
  isListed: boolean;
  createdAt: string;
  updatedAt: string;
  assetsCount?: number;
  keysAvailable?: number;
  keysTotal?: number;
  sellsFiles?: boolean;
  sellsLicenseKeys?: boolean;
  assets?: InventoryAsset[];
}

export type DeliveryMode = "files" | "license_keys" | "both";

export interface DigitalAsset {
  id: string;
  publicId: string;
  itemId: string | null;
  productId: string | null;
  objectKey: string;
  bucket: string;
  fileName: string;
  format: string | null;
  contentType: string;
  bytes: number;
  checksum: string | null;
  position: number;
  resourceType: string;
  secureUrl: string | null;
  url: string | null;
  createdAt: string;
  /** Present on the public claim response only. */
  downloadUrl?: string;
}

export interface DigitalLicenseKey {
  id: string;
  licenseKey: string;
  status: "available" | "assigned" | "revoked";
  entitlementId: string | null;
  createdAt: string;
  assignedAt: string | null;
}

export interface DigitalEntitlement {
  id: string;
  orderId: string;
  orderItemId: string | null;
  itemId: string;
  userId: string | null;
  customerEmail: string;
  deliveryMode: DeliveryMode;
  status: "active" | "revoked" | "expired";
  downloadCount: number;
  downloadLimit: number | null;
  downloadsRemaining: number | null;
  licenseKeys: string[];
  claimUrl: string;
  expiresAt: string | null;
  fulfilledAt: string;
  lastDownloadedAt: string | null;
  createdAt: string;
  product?: { id: string; name: string; sku: string };
}

export interface DigitalClaim {
  entitlement: DigitalEntitlement;
  product: {
    id: string;
    sku: string;
    name: string;
    description: string | null;
    deliveryMode: DeliveryMode;
    instructions: string | null;
  } | null;
  files: DigitalAsset[];
}

export interface LicenseKeyImportResult {
  itemId: string;
  submitted: number;
  added: number;
  duplicates: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  delta: number;
  reason: string;
  reference: string | null;
  createdAt: string;
  product?: { id: string; sku: string; name: string };
}

export interface InventorySummary {
  products: { total: number; listed: number; unlisted: number; digital?: number; physical?: number };
  stock: {
    onHand: number;
    outOfStock: number;
    lowStock: number;
    lowStockAt: number;
    value: number;
  };
  digital?: {
    assets: number;
    keysAvailable: number;
    activeEntitlements: number;
  };
  assets: number;
}

export interface ProductPage {
  items: InventoryProduct[];
  total: number;
  nextCursor: string | null;
}

export interface ProductPayload {
  sku: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  kind?: ProductKind;
  deliveryMode?: DeliveryMode;
  downloadLimit?: number | null;
  digitalInstructions?: string;
  stock?: number;
  isListed?: boolean;
  imageUrl?: string;
}

export interface ProductQuery {
  limit?: number;
  cursor?: string;
  search?: string;
  category?: string;
  kind?: ProductKind;
  lowStockAt?: number;
  sort?: "newest" | "oldest" | "name" | "priceAsc" | "priceDesc" | "stockAsc";
  /** Admin listing only: restrict to products visible in the storefront. */
  listedOnly?: boolean;
}

export interface PreOrderProductInfo {
  id: string;
  name: string;
  sku: string;
  price: number;
  mrp: number;
  imageUrl: string | null;
  description: string | null;
  category: string | null;
}

export interface PreOrder {
  id: string;
  productId: string;
  quantity: number;
  status: string;
  customerEmail: string;
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  product: PreOrderProductInfo;
  totalAmount: number;
}

export interface PreOrderCreateInput {
  productId: string;
  quantity?: number;
  customerEmail: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}

export interface PreOrderPage {
  items: PreOrder[];
  total: number;
}

const inventoryBase = (
  (import.meta.env.VITE_INVENTORY_URL as string | undefined) ||
  (import.meta.env.VITE_INVENTORY_SERVICE_URL as string | undefined) ||
  ""
).trim().replace(/\/+$/, "");

const inventoryUrl = (path: string) => {
  if (inventoryBase) {
    return `${inventoryBase}${path.startsWith("/") ? path : `/${path}`}`;
  }
  return getBackendUrl(`/inventory${path}`);
};

/**
 * Product images are stored in object storage as bare object keys, so a key has
 * to be routed back through the inventory service, which presigns or streams the
 * object. Absolute and site-relative URLs (legacy seeds, bundled assets) pass
 * through untouched.
 */
export const resolveMediaUrl = (keyOrUrl: string | null | undefined): string => {
  if (!keyOrUrl) return "";
  if (/^https?:\/\//i.test(keyOrUrl) || keyOrUrl.startsWith("/")) return keyOrUrl;
  return inventoryUrl(`/media?key=${encodeURIComponent(keyOrUrl)}`);
};

function buildQuery(query: ProductQuery = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function request<T>(
  path: string,
  { token, ...init }: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(inventoryUrl(path), { ...init, headers });
  const payload = await parseJsonSafely<{ success?: boolean; data?: T }>(response);

  if (!response.ok || !payload?.success) {
    throw new Error(getApiErrorMessage(payload, `Request failed (${response.status})`));
  }

  return payload.data as T;
}

export const fetchPublicProducts = (query?: ProductQuery) =>
  request<ProductPage>(`/products${buildQuery(query)}`);

export const fetchProduct = (id: string) => request<InventoryProduct>(`/products/${id}`);

export const fetchCategories = () =>
  request<{ category: string; count: number }[]>("/categories");

export const checkPreOrderAvailability = (productId: string) =>
  request<{ product: InventoryProduct; canPreOrder: boolean }>(`/pre-orders/product/${productId}`);

export const createPreOrder = (input: PreOrderCreateInput) =>
  request<{ id: string }>("/pre-orders", {
    method: "POST",
    body: JSON.stringify(input),
  });

/** Public, token-gated claim payload — no Authorization header involved. */
export const fetchDigitalClaim = (accessToken: string) =>
  request<DigitalClaim>(`/downloads/${encodeURIComponent(accessToken)}`);
