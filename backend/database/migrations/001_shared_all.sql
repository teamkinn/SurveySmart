-- Adds "share with everyone" support. schema.sql already includes this
-- column so fresh installs get it automatically — this migration is what
-- brings an existing database up to date, tracked by src/migrate.js so it
-- only ever runs once.
-- (Relocated from database/migration_2026-07-23_shared_all.sql — same content.)

ALTER TABLE surveys
  ADD COLUMN shared_all TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'owner opted this survey into "visible to every user" (vs. per-user survey_shares rows)'
  AFTER view_count;
