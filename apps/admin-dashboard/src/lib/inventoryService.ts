const INVENTORY_SERVICE_URL =
  process.env.NEXT_PUBLIC_INVENTORY_SERVICE_URL || 'http://localhost:3002';

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string | null;
  image_keys: string[];
  imageUrl?: string | null;
  mrp_minor: number;
  sale_price_minor: number;
  quantity_on_hand: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CouponItem {
  id: string;
  code: string;
  kind: 'percentage' | 'fixed';
  value_minor: number;
  minimum_order_minor: number;
  is_active: boolean;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
}

export interface CreateItemInput {
  sku: string;
  name: string;
  description: string;
  category?: string;
  imageUrl?: string;
  imageKeys?: string[];
  mrpMinor: number;
  salePriceMinor: number;
  quantityOnHand?: number;
}

export interface UpdateItemInput {
  sku?: string;
  name?: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  imageKeys?: string[];
  mrpMinor?: number;
  salePriceMinor?: number;
  quantityOnHand?: number;
  isActive?: boolean;
}

export interface StockAdjustmentInput {
  quantityDelta: number;
  reason: string;
  idempotencyKey: string;
}

async function request<T>(path: string, token: string | null, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${INVENTORY_SERVICE_URL}${path}`, {
    ...options,
    headers,
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(json?.error || json?.message || `Request failed with status ${response.status}`);
  }

  return json.data as T;
}

export async function fetchInventoryItems(token: string | null, search?: string): Promise<InventoryItem[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return request<InventoryItem[]>(`/admin/inventory/items${query}`, token);
}

export async function createInventoryItem(token: string | null, input: CreateItemInput): Promise<InventoryItem> {
  return request<InventoryItem>('/admin/inventory/items', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateInventoryItem(
  token: string | null,
  id: string,
  input: UpdateItemInput
): Promise<InventoryItem> {
  return request<InventoryItem>(`/admin/inventory/items/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteInventoryItem(token: string | null, id: string): Promise<{ id: string; deleted: boolean }> {
  return request<{ id: string; deleted: boolean }>(`/admin/inventory/items/${id}`, token, {
    method: 'DELETE',
  });
}

export async function adjustInventoryStock(
  token: string | null,
  id: string,
  input: StockAdjustmentInput
): Promise<unknown> {
  return request(`/admin/inventory/items/${id}/stock-adjustments`, token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchInventoryCoupons(token: string | null): Promise<CouponItem[]> {
  return request<CouponItem[]>('/admin/inventory/coupons', token);
}

export async function createInventoryCoupon(
  token: string | null,
  input: {
    code: string;
    kind: 'percentage' | 'fixed';
    valueMinor: number;
    minimumOrderMinor?: number;
  }
): Promise<CouponItem> {
  return request<CouponItem>('/admin/inventory/coupons', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
