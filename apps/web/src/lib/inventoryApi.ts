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
  category: string | null;
  kind: ProductKind;
  imageUrl: string | null;
  stock: number;
  isListed: boolean;
  createdAt: string;
  updatedAt: string;
  assets?: InventoryAsset[];
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
  products: { total: number; listed: number; unlisted: number };
  stock: {
    onHand: number;
    outOfStock: number;
    lowStock: number;
    lowStockAt: number;
    value: number;
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

const inventoryUrl = (path: string) => getBackendUrl(`/inventory${path}`);

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

export const fetchAdminProducts = (token: string, query?: ProductQuery) =>
  request<ProductPage>(`/admin/products${buildQuery(query)}`, { token });

export const fetchInventorySummary = (token: string, lowStockAt?: number) =>
  request<InventorySummary>(
    `/admin/summary${lowStockAt !== undefined ? `?lowStockAt=${lowStockAt}` : ""}`,
    { token }
  );

export const fetchRecentMovements = (token: string, limit = 25) =>
  request<StockMovement[]>(`/admin/movements?limit=${limit}`, { token });

export const fetchProductMovements = (token: string, productId: string, limit = 25) =>
  request<StockMovement[]>(`/products/${productId}/movements?limit=${limit}`, { token });

export const createProduct = (token: string, payload: ProductPayload) =>
  request<InventoryProduct>("/products", {
    token,
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateProduct = (
  token: string,
  id: string,
  payload: Partial<ProductPayload>
) =>
  request<InventoryProduct>(`/products/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload),
  });

/** Deletes the product, or unlists it when it already appears in orders. */
export const deleteProduct = (token: string, id: string) =>
  request<{ deleted: boolean; product: InventoryProduct | null }>(`/products/${id}`, {
    token,
    method: "DELETE",
  });

export const adjustStock = (
  token: string,
  id: string,
  body: { delta: number; reason: string; reference?: string }
) =>
  request<{ product: InventoryProduct; movement: StockMovement }>(
    `/products/${id}/stock`,
    { token, method: "POST", body: JSON.stringify(body) }
  );

export const setStock = (
  token: string,
  id: string,
  body: { stock: number; reason: string; reference?: string }
) =>
  request<{ product: InventoryProduct; movement: StockMovement | null }>(
    `/products/${id}/stock`,
    { token, method: "POST", body: JSON.stringify(body) }
  );

export const uploadAssets = (
  token: string,
  files: File[],
  opts: { productId?: string; folder?: string } = {}
) => {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  if (opts.productId) form.append("productId", opts.productId);
  if (opts.folder) form.append("folder", opts.folder);

  return request<InventoryAsset[]>("/assets", { token, method: "POST", body: form });
};

export const attachAsset = (
  token: string,
  publicId: string,
  body: { productId: string | null; primary?: boolean }
) =>
  request<InventoryAsset>(`/assets/${publicId}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteAsset = (token: string, publicId: string) =>
  request<InventoryAsset>(`/assets/${publicId}`, { token, method: "DELETE" });
