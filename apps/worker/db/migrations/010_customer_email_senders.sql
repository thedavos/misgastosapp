CREATE TABLE IF NOT EXISTS customer_email_senders (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_email_senders_sender
  ON customer_email_senders(sender_email);

CREATE INDEX IF NOT EXISTS idx_customer_email_senders_customer
  ON customer_email_senders(customer_id);

INSERT OR IGNORE INTO customer_email_senders (id, customer_id, sender_email, enabled, created_at, updated_at)
VALUES
  ('ces_default_david', 'cust_default', 'davidvargas.d45@gmail.com', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
