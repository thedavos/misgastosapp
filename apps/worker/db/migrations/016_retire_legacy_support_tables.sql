PRAGMA foreign_keys = OFF;

ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users ADD COLUMN confidence_threshold REAL NOT NULL DEFAULT 0.75;

UPDATE users
SET status = 'ACTIVE'
WHERE status IS NULL;

UPDATE users
SET confidence_threshold = 0.75
WHERE confidence_threshold IS NULL;

UPDATE users
SET status = COALESCE((SELECT c.status FROM customers c WHERE c.id = users.id), status),
    confidence_threshold = COALESCE(
      (SELECT c.confidence_threshold FROM customers c WHERE c.id = users.id),
      confidence_threshold
    )
WHERE EXISTS (SELECT 1 FROM customers c WHERE c.id = users.id);

DROP TABLE IF EXISTS customer_channels;
DROP TABLE IF EXISTS customer_channel_settings;
DROP TABLE IF EXISTS customer_email_routes;
DROP TABLE IF EXISTS customer_email_senders;
DROP TABLE IF EXISTS customer_subscriptions;

PRAGMA foreign_keys = ON;
