-- Digital inventory support.
--
-- Additive and idempotent: safe to re-run against an existing branch. Apply it
-- with the direct (unpooled) connection:
--
--   DATABASE_URL="$DATABASE_URL_UNPOOLED" bun run db:migrate
--
-- Monetary values stay integer paise (*_minor). Digital payloads live in Neon
-- Object Storage; only the object key is stored in Postgres.

-- ---------------------------------------------------------------------------
-- inventory_items: physical vs digital products
-- ---------------------------------------------------------------------------
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'physical',
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'files',
  ADD COLUMN IF NOT EXISTS download_limit integer,
  ADD COLUMN IF NOT EXISTS digital_instructions text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_kind_check') THEN
    ALTER TABLE inventory_items
      ADD CONSTRAINT inventory_items_kind_check CHECK (kind IN ('physical', 'digital'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_delivery_mode_check') THEN
    ALTER TABLE inventory_items
      ADD CONSTRAINT inventory_items_delivery_mode_check
      CHECK (delivery_mode IN ('files', 'license_keys', 'both'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_digital_stock_check') THEN
    -- Digital goods are never stocked by hand; their availability is derived
    -- from the key pool (license delivery) instead.
    ALTER TABLE inventory_items
      ADD CONSTRAINT inventory_items_digital_stock_check
      CHECK (kind = 'physical' OR quantity_on_hand = 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_download_limit_check') THEN
    ALTER TABLE inventory_items
      ADD CONSTRAINT inventory_items_download_limit_check
      CHECK (download_limit IS NULL OR download_limit > 0);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS inventory_items_kind_idx
  ON inventory_items (kind)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Digital deliverables (files in Neon Object Storage)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_digital_assets (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid        NOT NULL REFERENCES inventory_items (id) ON DELETE CASCADE,
  object_key    text        NOT NULL,
  bucket        text        NOT NULL,
  file_name     text        NOT NULL,
  content_type  text        NOT NULL DEFAULT 'application/octet-stream',
  bytes         bigint      NOT NULL DEFAULT 0,
  checksum      text,
  position      integer     NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_by    text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, object_key)
);

CREATE INDEX IF NOT EXISTS inventory_digital_assets_item_idx
  ON inventory_digital_assets (item_id, position)
  WHERE is_active;

-- ---------------------------------------------------------------------------
-- License-key pool (delivery_mode = 'license_keys' or 'both')
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_digital_keys (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid        NOT NULL REFERENCES inventory_items (id) ON DELETE CASCADE,
  license_key    text        NOT NULL,
  status         text        NOT NULL DEFAULT 'available',
  entitlement_id uuid,
  created_by     text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  assigned_at    timestamptz,
  revoked_at     timestamptz,
  UNIQUE (item_id, license_key)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_digital_keys_status_check') THEN
    ALTER TABLE inventory_digital_keys
      ADD CONSTRAINT inventory_digital_keys_status_check
      CHECK (status IN ('available', 'assigned', 'revoked'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS inventory_digital_keys_pool_idx
  ON inventory_digital_keys (item_id, status);

-- ---------------------------------------------------------------------------
-- Entitlements: one row per fulfilled digital order line
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_entitlements (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_key    text        NOT NULL UNIQUE,
  order_id           text        NOT NULL,
  order_item_id      text,
  item_id            uuid        NOT NULL REFERENCES inventory_items (id) ON DELETE RESTRICT,
  user_id            text,
  customer_email     text        NOT NULL,
  delivery_mode      text        NOT NULL,
  access_token       text        NOT NULL UNIQUE,
  download_count     integer     NOT NULL DEFAULT 0,
  download_limit     integer,
  license_keys       jsonb       NOT NULL DEFAULT '[]',
  status             text        NOT NULL DEFAULT 'active',
  expires_at         timestamptz,
  fulfilled_at       timestamptz NOT NULL DEFAULT now(),
  last_downloaded_at timestamptz,
  revoked_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_entitlements_status_check') THEN
    ALTER TABLE inventory_entitlements
      ADD CONSTRAINT inventory_entitlements_status_check
      CHECK (status IN ('active', 'revoked', 'expired'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_digital_keys_entitlement_fk') THEN
    ALTER TABLE inventory_digital_keys
      ADD CONSTRAINT inventory_digital_keys_entitlement_fk
      FOREIGN KEY (entitlement_id) REFERENCES inventory_entitlements (id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS inventory_entitlements_order_idx
  ON inventory_entitlements (order_id);

CREATE INDEX IF NOT EXISTS inventory_entitlements_email_idx
  ON inventory_entitlements (lower(customer_email));
