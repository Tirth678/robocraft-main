-- Pre-orders are opt-in per product.
--
-- The storefront used to offer "Pre Order" on anything out of stock, which made
-- every sold-out item look available for pre-order. A product now accepts
-- pre-orders only when this flag is on.
--
-- Additive and idempotent.
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS preorder_enabled boolean NOT NULL DEFAULT false;

-- Seed: the flagship custom build is the single pre-order product for now.
-- Toggle later from the admin product editor / PATCH /api/admin/products/:id.
UPDATE inventory_items
   SET preorder_enabled = true
 WHERE sku = 'ROBO-CUSTOM-06';
