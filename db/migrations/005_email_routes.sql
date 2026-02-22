CREATE TABLE IF NOT EXISTS customer_email_routes (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_email_routes_recipient
  ON customer_email_routes(recipient_email);

CREATE INDEX IF NOT EXISTS idx_customer_email_routes_customer
  ON customer_email_routes(customer_id);

INSERT OR IGNORE INTO customer_email_routes (id, customer_id, recipient_email, enabled, created_at, updated_at)
VALUES
  ('cer_default_gastos', 'cust_default', 'gastos@misgastos.app', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('cer_default_devmail', 'cust_default', 'davidvargas.d45@gmail.com', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
