-- Adds dedup support for the CSV responses import (routes/responses.js
-- POST /import-csv). schema.sql already includes this column so fresh
-- installs get it automatically — this migration is what brings an existing
-- database up to date, tracked by src/migrate.js so it only ever runs once.
-- (Relocated from database/migration_2026-07-31_response_external_id.sql —
-- same content.)
--
-- Rows imported WITHOUT an id/response_id column in the CSV keep
-- external_id NULL and always insert as new (MySQL unique keys treat every
-- NULL as distinct, so NULLs never collide with each other). Rows imported
-- WITH one are deduped per-survey — re-importing a file that mixes
-- previously-imported rows with new ones skips the old ones instead of
-- duplicating them.

ALTER TABLE responses
  ADD COLUMN external_id VARCHAR(191) NULL
  COMMENT 'caller-supplied ID from a CSV import id/response_id column, for dedup on re-import'
  AFTER google_response_id,
  ADD UNIQUE KEY uq_survey_external_id (survey_id, external_id);
