CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  merchant TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  bank TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  status TEXT NOT NULL,
  category_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_occurred_at ON expenses(occurred_at);

CREATE TABLE IF NOT EXISTS expense_events (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (expense_id) REFERENCES expenses(id)
);

INSERT OR IGNORE INTO categories (id, name, slug) VALUES
  ('cat_food', 'Comida', 'comida'),
  ('cat_transport', 'Transporte', 'transporte'),
  ('cat_shopping', 'Compras', 'compras'),
  ('cat_services', 'Servicios', 'servicios');
