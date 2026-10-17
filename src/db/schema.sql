-- Storefront Voice Ops schema.
-- Store data (products, orders, customers) is read live through the StoreAdapter.
-- These tables are the control plane: cached reference data, pending confirmations, and the audit log.

CREATE TABLE IF NOT EXISTS products (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PKR',
  stock INTEGER NOT NULL DEFAULT 0,
  reorder_point INTEGER NOT NULL DEFAULT 0,
  supplier_name TEXT,
  supplier_contact TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  order_count INTEGER NOT NULL DEFAULT 0,
  lifetime_value REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'PKR'
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'shipped', 'delivered', 'cancelled')),
  total REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PKR',
  created_at TEXT NOT NULL,
  carrier TEXT,
  tracking_number TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  PRIMARY KEY (order_id, sku)
);

-- A write action awaiting confirmation.
CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY,
  tool TEXT NOT NULL,
  target TEXT,
  input_json TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  session_id TEXT,
  actor TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_actions_session ON pending_actions (session_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_actions_expires ON pending_actions (expires_at);

-- Every write transition is recorded here (created, confirmed, cancelled, expired, executed).
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  actor TEXT,
  session_id TEXT,
  tool TEXT NOT NULL,
  input_json TEXT,
  result_status TEXT NOT NULL,
  result_summary TEXT,
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log (ts);
