PRAGMA foreign_keys = ON;

-- Normalize legacy expense status values so the legacy expenses table
-- uses the same business semantics as the MVP-core transactions table.

UPDATE expenses
SET status = 'needs_clarification'
WHERE status IN ('PENDING_CATEGORY', 'NEEDS_CLARIFICATION');

UPDATE expenses
SET status = 'confirmed'
WHERE status IN ('CATEGORIZED', 'CONFIRMED');

UPDATE expenses
SET status = 'deleted'
WHERE status IN ('DISCARDED', 'DELETED');
