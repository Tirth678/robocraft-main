-- Order-level customer + shipping detail.
--
-- Additive and idempotent. Orders need this so `/track-order` can answer a
-- lookup by email or order number without a separate customer table.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS shipping_address jsonb,
  ADD COLUMN IF NOT EXISTS subtotal double precision,
  ADD COLUMN IF NOT EXISTS tax double precision,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS orders_email_idx ON orders (lower(customer_email));
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders ("createdAt" DESC);

-- order_items references inventory products by id (uuid stored as text)
CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items ("productId");
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items ("orderId");
