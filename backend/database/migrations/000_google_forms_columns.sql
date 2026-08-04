-- Retroactive migration: captures the Google Forms integration columns on
-- `surveys` that historically shipped in schema.sql but were never applied
-- to at least one already-running database (the root cause diagnosed by the
-- old backend/fix-shared-all-column.js one-off script — see database
-- migration runner in src/migrate.js, which replaces that script).
--
-- Safe to run against a database that already has some/all of these columns
-- from a fresh schema.sql install: src/migrate.js catches
-- ER_DUP_FIELDNAME / ER_DUP_KEYNAME for this specific file and treats the
-- migration as already satisfied instead of failing.

ALTER TABLE surveys ADD COLUMN google_form_url VARCHAR(500) NULL;
ALTER TABLE surveys ADD COLUMN google_form_id VARCHAR(100) NULL;
ALTER TABLE surveys ADD COLUMN google_refresh_token TEXT NULL;
ALTER TABLE surveys ADD COLUMN last_synced_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE surveys ADD COLUMN share_token VARCHAR(64) NULL;
ALTER TABLE surveys ADD UNIQUE KEY share_token (share_token);
