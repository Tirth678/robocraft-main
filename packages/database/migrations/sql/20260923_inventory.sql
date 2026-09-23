-- Apply with DATABASE_URL_UNPOOLED. This migration is intentionally separate
-- from the generated Prisma migration so it can be reviewed and tested on a
-- Neon branch before production.

CREATE TABLE IF NOT EXISTS inventory_admins (
  auth_user_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY,
  sku text NOT NULL UNIQUE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description text NOT NULL,
  category text,
  image_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  mrp_minor integer NOT NULL CHECK (mrp_minor >= 0),
  sale_price_minor integer NOT NULL CHECK (sale_price_minor >= 0 AND sale_price_minor <= mrp_minor),
  quantity_on_hand integer NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  reserved_quantity integer NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0 AND reserved_quantity <= quantity_on_hand),
  available_quantity integer GENERATED ALWAYS AS (quantity_on_hand - reserved_quantity) STORED,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_items_active_idx
  ON inventory_items (is_active, deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS inventory_stock_movements (
  id uuid PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES inventory_items(id),
  quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
  quantity_before integer NOT NULL CHECK (quantity_before >= 0),
  quantity_after integer NOT NULL CHECK (quantity_after >= 0),
  reason text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  performed_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_stock_movements_item_created_idx
  ON inventory_stock_movements (item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_item_discounts (
  id uuid PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES inventory_items(id),
  kind text NOT NULL CHECK (kind IN ('percentage', 'fixed')),
  value_minor integer NOT NULL CHECK (value_minor > 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (kind <> 'percentage' OR value_minor <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_item_active_discount_idx
  ON inventory_item_discounts (item_id)
  WHERE is_active AND ends_at IS NULL;

CREATE TABLE IF NOT EXISTS inventory_coupons (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('percentage', 'fixed')),
  value_minor integer NOT NULL CHECK (value_minor > 0),
  minimum_order_minor integer NOT NULL DEFAULT 0 CHECK (minimum_order_minor >= 0),
  maximum_discount_minor integer CHECK (maximum_discount_minor IS NULL OR maximum_discount_minor > 0),
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemption_count integer NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (kind <> 'percentage' OR value_minor <= 100)
);

CREATE TABLE IF NOT EXISTS inventory_coupon_items (
  coupon_id uuid NOT NULL REFERENCES inventory_coupons(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES inventory_items(id),
  PRIMARY KEY (coupon_id, item_id)
);

CREATE TABLE IF NOT EXISTS inventory_coupon_redemptions (
  id uuid PRIMARY KEY,
  coupon_id uuid NOT NULL REFERENCES inventory_coupons(id),
  auth_user_id text NOT NULL,
  order_id text NOT NULL UNIQUE,
  discount_minor integer NOT NULL CHECK (discount_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION inventory_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_items_updated_at ON inventory_items;
CREATE TRIGGER inventory_items_updated_at BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION inventory_set_updated_at();

DROP TRIGGER IF EXISTS inventory_item_discounts_updated_at ON inventory_item_discounts;
CREATE TRIGGER inventory_item_discounts_updated_at BEFORE UPDATE ON inventory_item_discounts
  FOR EACH ROW EXECUTE FUNCTION inventory_set_updated_at();

DROP TRIGGER IF EXISTS inventory_coupons_updated_at ON inventory_coupons;
CREATE TRIGGER inventory_coupons_updated_at BEFORE UPDATE ON inventory_coupons
  FOR EACH ROW EXECUTE FUNCTION inventory_set_updated_at();
