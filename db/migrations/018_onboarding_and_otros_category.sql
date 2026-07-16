-- MVP onboarding tracking for first-contact WhatsApp flows.
ALTER TABLE users ADD COLUMN onboarding_completed_at TEXT;

-- Global fallback category used when the model returns an unknown category.
INSERT OR IGNORE INTO categories_v2 (id, user_id, name, slug, created_at)
VALUES (
  'cat_otros',
  NULL,
  'Otros',
  'otros',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
