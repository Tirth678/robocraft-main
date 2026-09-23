// User types
export interface User {
  id: string;
  authUserId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Product types
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  images: string[];
  categoryId: string;
  discountId?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProductInput {
  name: string;
  description: string;
  price: number;
  stock: number;
  images: string[];
  categoryId: string;
  discountId?: string;
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  price?: number;
  stock?: number;
  images?: string[];
  categoryId?: string;
  discountId?: string;
  isActive?: boolean;
}

// Admin inventory types. Monetary fields are integer paise, never floats.
export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  description: string;
  category?: string;
  imageKeys: string[];
  mrpMinor: number;
  salePriceMinor: number;
  quantityOnHand: number;
  reservedQuantity: number;
  availableQuantity: number;
  isActive: boolean;
}

export interface InventoryCoupon {
  id: string;
  code: string;
  kind: 'percentage' | 'fixed';
  valueMinor: number;
  minimumOrderMinor: number;
  maximumDiscountMinor?: number;
  maxRedemptions?: number;
  redemptionCount: number;
  startsAt: Date;
  endsAt?: Date;
  isActive: boolean;
}

export interface StockAdjustment {
  itemId: string;
  quantityDelta: number;
  reason: string;
  idempotencyKey: string;
}

// Category types
export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Cart types
export interface CartItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface Cart {
  sessionId: string;
  items: CartItem[];
  total: number;
  updatedAt: Date;
}

// Order types
export interface Order {
  id: string;
  userId: string;
  status: 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  total: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  price: number;
}

// Discount types
export interface Discount {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  minPurchase?: number;
  maxUses?: number;
  usedCount: number;
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Analytics types
export interface Analytics {
  date: Date;
  revenue: number;
  orders: number;
  pageViews: number;
  uniqueVisitors: number;
  conversionRate: number;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Service health types
export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  details?: Record<string, unknown>;
}
