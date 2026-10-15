-- Milestone 1 schema: raw report log, inventory snapshots, daily sales, manual flags, settings.

CREATE TABLE IF NOT EXISTS report_imports (
  id            BIGSERIAL PRIMARY KEY,
  report_type   TEXT NOT NULL,          -- inventory_health | all_orders | nineyard_profit_by_sku
  report_date   DATE NOT NULL,
  source        TEXT NOT NULL,          -- file name or sheet URL
  row_count     INTEGER NOT NULL,
  loaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_type, report_date)
);

-- Raw rows exactly as downloaded, so any day can be re-processed later.
CREATE TABLE IF NOT EXISTS report_rows (
  import_id     BIGINT NOT NULL REFERENCES report_imports(id) ON DELETE CASCADE,
  row_num       INTEGER NOT NULL,
  data          JSONB NOT NULL,
  PRIMARY KEY (import_id, row_num)
);

CREATE TABLE IF NOT EXISTS products (
  sku           TEXT PRIMARY KEY,
  asin          TEXT NOT NULL,
  fnsku         TEXT,
  title         TEXT,
  image_url     TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_asin ON products(asin);

-- One row per snapshot date and SKU, from Manage Inventory Health.
CREATE TABLE IF NOT EXISTS inventory_daily (
  snapshot_date        DATE NOT NULL,
  sku                  TEXT NOT NULL,
  asin                 TEXT NOT NULL,
  available            INTEGER NOT NULL DEFAULT 0,
  reserved             INTEGER NOT NULL DEFAULT 0,
  fc_transfer          INTEGER NOT NULL DEFAULT 0,
  inbound_working      INTEGER NOT NULL DEFAULT 0,
  inbound_shipped      INTEGER NOT NULL DEFAULT 0,
  inbound_received     INTEGER NOT NULL DEFAULT 0,
  unfulfillable        INTEGER NOT NULL DEFAULT 0,
  days_of_supply       NUMERIC,
  PRIMARY KEY (snapshot_date, sku)
);
CREATE INDEX IF NOT EXISTS inventory_daily_asin ON inventory_daily(asin, snapshot_date);

-- One row per day, ASIN and source. Units and sales as the daily sheets count them.
CREATE TABLE IF NOT EXISTS sales_daily (
  sale_date     DATE NOT NULL,
  asin          TEXT NOT NULL,
  source        TEXT NOT NULL,          -- all_orders | nineyard_profit_by_sku
  units         NUMERIC NOT NULL DEFAULT 0,
  sales         NUMERIC NOT NULL DEFAULT 0,
  orders        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sale_date, asin, source)
);
CREATE INDEX IF NOT EXISTS sales_daily_asin ON sales_daily(asin, sale_date);

-- Manual lists kept in Google Sheets today (Discontinued tab, errors tab).
CREATE TABLE IF NOT EXISTS product_flags (
  asin          TEXT NOT NULL,
  flag          TEXT NOT NULL,          -- discontinued | error
  note          TEXT,
  error_units   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (asin, flag)
);

-- Dashboard rules (FBA Inventory Status Dashboard!L7:L13).
CREATE TABLE IF NOT EXISTS settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('min_days', '14'),
  ('max_alert_days', '24'),
  ('max_days', '45'),
  ('days_to_send', '15'),
  ('days_ahead', '0'),
  ('include_shipment_created', 'true')
ON CONFLICT (key) DO NOTHING;
