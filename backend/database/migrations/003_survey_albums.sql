-- Adds "albums" — user-defined categories a survey can be dragged into/out
-- of from the Surveys page (frontend/src/components/Survey/AlbumSidebar.vue).
-- One survey belongs to at most one album at a time (album_id is a single
-- nullable FK on surveys, not a join table) — matches the approved UX
-- mockup where dropping a card on a new album moves it, it doesn't add a
-- second membership.
--
-- ON DELETE CASCADE on survey_albums.user_id: deleting a user deletes their
-- albums too (consistent with how surveys/survey_shares already cascade).
-- ON DELETE SET NULL on surveys.album_id: deleting an album un-categorizes
-- its surveys instead of deleting them — albumController.remove relies on
-- this instead of doing it manually in application code.

CREATE TABLE survey_albums (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  name       VARCHAR(100) NOT NULL,
  color      VARCHAR(7)   NOT NULL DEFAULT '#1A56A0',
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Split into two ALTER statements on purpose: some MariaDB builds throw
-- ER_FK_CANNOT_OPEN_PARENT (1824) when ADD COLUMN and ADD FOREIGN KEY
-- referencing a table created earlier in the same script are combined into
-- one ALTER TABLE statement, even though the referenced table exists and is
-- fully committed. Adding the column+index first, then the FK as its own
-- statement, sidesteps that.
ALTER TABLE surveys
  ADD COLUMN album_id INT UNSIGNED NULL
  COMMENT 'which survey_albums row this survey is categorized under, if any'
  AFTER shared_all,
  ADD KEY idx_album (album_id);

-- Named explicitly (not left to MySQL's auto-generated fk name) so that
-- re-running this migration against a database that already has this FK —
-- e.g. one built fresh from schema.sql, where album_id + the FK exist from
-- the start but schema_migrations is still empty — throws a catchable
-- "duplicate constraint name" error (see migrate.js's ER_DUP_KEYNAME /
-- ER_FK_DUP_NAME handling) instead of MySQL silently accepting a second,
-- differently-auto-named FK constraint on the same column.
ALTER TABLE surveys
  ADD CONSTRAINT fk_surveys_album_id FOREIGN KEY (album_id) REFERENCES survey_albums(id) ON DELETE SET NULL;
