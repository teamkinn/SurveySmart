-- Run this once against your existing database (e.g. Railway) to add
-- "share with everyone" support. schema.sql has already been updated so
-- fresh installs include this column automatically — this file is only
-- needed to bring an existing database up to date.

ALTER TABLE surveys
  ADD COLUMN shared_all TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'owner opted this survey into "visible to every user" (vs. per-user survey_shares rows)'
  AFTER view_count;
