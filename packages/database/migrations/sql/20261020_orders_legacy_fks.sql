-- Orders carry Neon Managed Auth subjects and inventory product ids, not rows
-- from the retired `users` / `products` tables.
--
-- Both legacy tables are empty and nothing writes to them anymore, so their
-- foreign keys rejected every real checkout with a 409 no matter who was signed
-- in or which product was in the cart. Drop them; the identifiers are opaque
-- strings owned by Neon Auth and the inventory catalogue.
--
-- Additive and idempotent: safe to re-run.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS "orders_userId_fkey";
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS "order_items_productId_fkey";
