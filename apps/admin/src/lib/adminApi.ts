import { getBackendUrl } from "@/lib/backend";
import { getApiErrorMessage, parseJsonSafely } from "@/lib/apiErrors";

/**
 * Admin console API client.
 *
 * Every call goes to admin-service over the session cookie — there is no
 * bearer token in this app, so a leaked admin cookie cannot be replayed
 * elsewhere and no admin authority is ever minted by the public auth service.
 *
 * The function signatures keep the leading `token` argument that the screens
 * already pass, so the UI code is unchanged by the move. It is intentionally
 * unused: authority is the httpOnly cookie, not a JS-visible value.
 */
type TokenArg = string;

export type ProductKind = "physical" | "digital";
export type DeliveryMode = "files" | "license_keys" | "both";

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
  quantityOnHand?: number;
  reservedQuantity?: number;
  availableQuantity?: number | null;
  isListed: boolean;
  createdAt: string;
  updatedAt: string;
  keysAvailable?: number;
  keysTotal?: number;
  sellsFiles?: boolean;
  sellsLicenseKeys?: boolean;
  /** Populated when the screen expands a row. */
  assets?: InventoryAsset[];
}

export interface InventoryAsset {
  id: string;
  publicId: string;
  objectKey?: string;
  bucket?: string;
  fileName?: string;
  contentType?: string;
  bytes: number | null;
  resourceType: string;
  productId?: string | null;
  secureUrl: string | null;
  url: string | null;
  createdAt: string | null;
}

export interface DigitalAsset extends InventoryAsset {
  itemId: string | null;
  format: string | null;
  checksum: string | null;
  position: number;
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
  itemId: string;
  customerEmail: string;
  deliveryMode: DeliveryMode;
  status: "active" | "revoked" | "expired";
  downloadCount: number;
  downloadLimit: number | null;
  downloadsRemaining: number | null;
  licenseKeys: string[];
  claimUrl: string;
  fulfilledAt: string;
  product?: { id: string; name: string; sku: string };
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
  stock: { onHand: number; outOfStock: number; lowStock: number; lowStockAt: number; value: number };
  digital?: { assets: number; keysAvailable: number; activeEntitlements: number };
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
  mrp?: number;
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
  search?: string;
  category?: string;
  kind?: ProductKind;
  lowStockAt?: number;
  sort?: "newest" | "oldest" | "name" | "priceAsc" | "priceDesc" | "stockAsc";
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

export interface PreOrderPage {
  items: PreOrder[];
  total: number;
}

export interface LicenseKeyImportResult {
  itemId: string;
  submitted: number;
  added: number;
  duplicates: number;
}

const adminBase = (
  (import.meta.env.VITE_ADMIN_SERVICE_URL as string | undefined) || ""
).trim().replace(/\/+$/, "");

const adminUrl = (path: string) => {
  if (adminBase) return `${adminBase}${path.startsWith("/") ? path : `/${path}`}`;
  // In dev Vite proxies /admin-api to admin-service.
  return getBackendUrl(`/admin-api${path}`);
};

/** Object keys must be routed through a service that streams them. */
export const resolveMediaUrl = (keyOrUrl: string | null | undefined): string => {
  if (!keyOrUrl) return "";
  if (/^https?:\/\//i.test(keyOrUrl) || keyOrUrl.startsWith("/")) return keyOrUrl;
  return adminUrl(`/media?key=${encodeURIComponent(keyOrUrl)}`);
};

function buildQuery(query: ProductQuery | Record<string, unknown> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function request<T>(
  path: string,
  { token: _token, ...init }: RequestInit & { token?: TokenArg | null } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  // The session cookie is the credential; it must ride along on every call.
  const response = await fetch(adminUrl(path), { ...init, headers, credentials: "include" });
  const payload = await parseJsonSafely<{ success?: boolean; data?: T }>(response);

  if (response.status === 401) {
    throw new Error("Your admin session has expired — sign in again.");
  }
  if (!response.ok || !payload?.success) {
    throw new Error(getApiErrorMessage(payload, `Request failed (${response.status})`));
  }
  return payload.data as T;
}

// ------------------------------------------------------------------ catalog
export const fetchAdminProducts = (token: TokenArg, query?: ProductQuery) =>
  request<{ products: InventoryProduct[] }>(`/api/admin/products${buildQuery(query)}`, { token }).then(
    ({ products }) => ({
      items: products ?? [],
      total: products?.length ?? 0,
      nextCursor: null,
    }),
  );

export const fetchInventorySummary = (token: TokenArg, lowStockAt?: number) =>
  request<{ summary: InventorySummary }>(
    `/api/admin/summary${lowStockAt !== undefined ? `?lowStockAt=${lowStockAt}` : ""}`,
    { token },
  ).then(({ summary }) => summary);

export const fetchRecentMovements = (token: TokenArg, limit = 25) =>
  request<{ movements: StockMovement[] }>(`/api/admin/movements?limit=${limit}`, { token }).then(
    ({ movements }) => movements ?? [],
  );

export const fetchProductMovements = (token: TokenArg, productId: string, limit = 25) =>
  request<{ movements: StockMovement[] }>(`/api/admin/products/${productId}/movements?limit=${limit}`, {
    token,
  }).then(({ movements }) => movements ?? []);

export const createProduct = (token: TokenArg, payload: ProductPayload) =>
  request<{ product: InventoryProduct }>("/api/admin/products", {
    token,
    method: "POST",
    body: JSON.stringify(payload),
  }).then(({ product }) => product);

export const updateProduct = (token: TokenArg, id: string, payload: Partial<ProductPayload>) =>
  request<{ product: InventoryProduct }>(`/api/admin/products/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload),
  }).then(({ product }) => product);

export const deleteProduct = (token: TokenArg, id: string) =>
  request<{ product: InventoryProduct }>(`/api/admin/products/${id}`, {
    token,
    method: "DELETE",
  }).then(({ product }) => ({ deleted: true, product }));

export const adjustStock = (token: TokenArg, id: string, body: { delta: number; reason: string }) =>
  request<{ product: InventoryProduct }>(`/api/admin/products/${id}/stock`, {
    token,
    method: "POST",
    body: JSON.stringify(body),
  }).then(({ product }) => ({ product, movement: null as StockMovement | null }));

export const setStock = (token: TokenArg, id: string, body: { stock: number; reason: string }) =>
  request<{ product: InventoryProduct }>(`/api/admin/products/${id}/stock`, {
    token,
    method: "POST",
    body: JSON.stringify(body),
  }).then(({ product }) => ({ product, movement: null as StockMovement | null }));

// ------------------------------------------------------------ product media
export const uploadAssets = (
  token: TokenArg,
  files: File[],
  _opts: { productId?: string; folder?: string } = {},
) => {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  return request<{ assets: InventoryAsset[] }>("/api/admin/assets", {
    token,
    method: "POST",
    body: form,
  }).then(({ assets }) => assets ?? []);
};

export const fetchAssets = (token: TokenArg, productId?: string) =>
  request<{ assets: InventoryAsset[] }>(
    `/api/admin/assets${productId ? `?productId=${encodeURIComponent(productId)}` : ""}`,
    { token },
  ).then(({ assets }) => assets ?? []);

export const attachAsset = (
  token: TokenArg,
  publicId: string,
  body: { productId: string | null; primary?: boolean },
) =>
  request<{ asset: InventoryAsset }>(`/api/admin/assets?key=${encodeURIComponent(publicId)}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(body),
  }).then(({ asset }) => asset);

export const deleteAsset = (
  token: TokenArg,
  publicId: string,
  opts: { productId?: string; purge?: boolean } = {},
) => {
  const params = new URLSearchParams({ key: publicId });
  if (opts.productId) params.set("productId", opts.productId);
  if (opts.purge) params.set("purge", "true");
  return request<{ publicId: string; deleted: boolean }>(`/api/admin/assets?${params.toString()}`, {
    token,
    method: "DELETE",
  });
};

// ---------------------------------------------------------------- pre-orders
export const fetchAdminPreOrders = (
  token: TokenArg,
  query?: { status?: string; limit?: number; offset?: number; search?: string },
) =>
  request<{ preOrders: PreOrder[] }>(`/api/admin/pre-orders${buildQuery(query ?? {})}`, {
    token,
  }).then(({ preOrders }) => ({ items: preOrders ?? [], total: preOrders?.length ?? 0 }));

export const fetchAdminPreOrder = (token: TokenArg, id: string) =>
  request<{ preOrder: PreOrder }>(`/api/admin/pre-orders/${id}`, { token }).then(
    ({ preOrder }) => preOrder,
  );

export const updateAdminPreOrder = (
  token: TokenArg,
  id: string,
  payload: { status?: string; customerName?: string; customerPhone?: string; notes?: string },
) =>
  request<{ preOrder: PreOrder }>(`/api/admin/pre-orders/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload),
  }).then(({ preOrder }) => preOrder);

export const cancelAdminPreOrder = (token: TokenArg, id: string) =>
  request<{ preOrder: PreOrder }>(`/api/admin/pre-orders/${id}`, {
    token,
    method: "DELETE",
  }).then(({ preOrder }) => ({ id: preOrder.id, cancelled: preOrder.status === "cancelled" }));

// ------------------------------------------------------------------- digital
export const fetchDigitalAssets = (token: TokenArg, productId: string) =>
  request<{ assets: DigitalAsset[] }>(`/api/admin/products/${productId}/assets`, { token }).then(
    ({ assets }) => assets ?? [],
  );

export const uploadDigitalAssets = (token: TokenArg, productId: string, files: File[]) => {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  return request<{ assets: DigitalAsset[] }>(`/api/admin/products/${productId}/digital-assets`, {
    token,
    method: "POST",
    body: form,
  }).then(({ assets }) => assets ?? []);
};

export const deleteDigitalAsset = (token: TokenArg, assetId: string) =>
  request<{ deleted: boolean }>(`/api/admin/assets/${assetId}`, {
    token,
    method: "DELETE",
  });

export const fetchLicenseKeys = (token: TokenArg, productId: string) =>
  request<{ keys: DigitalLicenseKey[] }>(`/api/admin/products/${productId}/license-keys`, {
    token,
  }).then(({ keys }) => keys ?? []);

/** Accepts an array or raw pasted text (one key per line). */
export const importLicenseKeys = (token: TokenArg, productId: string, keys: string[] | string) => {
  const list =
    typeof keys === "string"
      ? keys
          .split(/[\n,]/)
          .map((k) => k.trim())
          .filter(Boolean)
      : keys;
  return request<{ imported: number; skipped: number }>(
    `/api/admin/products/${productId}/license-keys`,
    { token, method: "POST", body: JSON.stringify({ keys: list }) },
  ).then(({ imported, skipped }) => ({
    itemId: productId,
    submitted: list.length,
    added: imported ?? 0,
    duplicates: skipped ?? 0,
  }));
};

export const revokeLicenseKey = (token: TokenArg, keyId: string) =>
  request<{ revoked: boolean }>(`/api/admin/license-keys/${keyId}`, {
    token,
    method: "DELETE",
  });

export const fetchEntitlements = (token: TokenArg, productId: string) =>
  request<{ entitlements: DigitalEntitlement[] }>(`/api/admin/products/${productId}/entitlements`, {
    token,
  }).then(({ entitlements }) => entitlements ?? []);

export const revokeEntitlement = (token: TokenArg, id: string) =>
  request<{ revoked: boolean }>(`/api/admin/entitlements/${id}/revoke`, {
    token,
    method: "POST",
    body: JSON.stringify({}),
  });

// ------------------------------------------------------------------ sales
export interface MonthlySalesPoint {
  month: number;
  orderCount: number;
  totalRevenue: number;
  totalItems: number;
}

export interface DailySalesPoint {
  day: number;
  orderCount: number;
  totalRevenue: number;
}

export interface ProductMonthlyPoint {
  month: number;
  quantitySold: number;
  revenue: number;
  orderCount: number;
}

export interface ProductDailyPoint {
  day: number;
  quantitySold: number;
  revenue: number;
  orderCount: number;
}

export interface SalesSummary {
  year: number;
  monthlySales: MonthlySalesPoint[];
  dailySales: DailySalesPoint[];
}

export interface ProductSales {
  product: {
    id: string;
    name: string;
    price: number;
    imageUrl: string | null;
    category: string | null;
  };
  year: number;
  yearly: { totalQuantity: number; totalRevenue: number; totalOrders: number };
  monthlySales: ProductMonthlyPoint[];
  dailySales: ProductDailyPoint[];
}

export const fetchSalesSummary = (token: TokenArg, year: number) =>
  request<{ sales: SalesSummary }>(`/api/admin/sales/summary?year=${year}`, { token }).then(
    ({ sales }) => sales,
  );

export const fetchProductSales = (token: TokenArg, productId: string, year: number) =>
  request<{ sales: ProductSales }>(
    `/api/admin/sales/product/${encodeURIComponent(productId)}?year=${year}`,
    { token },
  ).then(({ sales }) => sales);