INSERT OR IGNORE INTO customer_email_routes (id, customer_id, recipient_email, enabled, created_at, updated_at)
VALUES (
  'cer_default_recibos',
  'cust_default',
  'recibos@misgastos.app',
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

UPDATE customer_email_routes
SET recipient_email = 'recibos@misgastos.app',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'cer_default_gastos'
  AND NOT EXISTS (
    SELECT 1
    FROM customer_email_routes
    WHERE recipient_email = 'recibos@misgastos.app'
      AND id <> 'cer_default_gastos'
  );

UPDATE customer_email_routes
SET enabled = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE recipient_email = 'gastos@misgastos.app';
