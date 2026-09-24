-- ============================================================
--  SurveySmart — MySQL Database Schema
--  Charset: utf8mb4  Collation: utf8mb4_unicode_ci
-- ============================================================

CREATE DATABASE IF NOT EXISTS surveysmart
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE surveysmart;

-- ─────────────────────────────────────────────
--  1. USERS
-- ─────────────────────────────────────────────
CREATE TABLE users (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  username     VARCHAR(50)     NOT NULL,
  email        VARCHAR(255)    NOT NULL,
  password     VARCHAR(255)    NOT NULL,
  first_name   VARCHAR(100)    DEFAULT '',
  last_name    VARCHAR(100)    DEFAULT '',
  role         ENUM('user','admin','head_admin') DEFAULT 'user',
  is_active    TINYINT(1)      DEFAULT 1,
  created_at   TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Set whenever the password is changed (currently: password-reset flow).
  -- auth middleware rejects any JWT issued before this timestamp, so a
  -- token that leaked before a reset stops working immediately instead of
  -- staying valid until it naturally expires (see migrations/005).
  password_changed_at TIMESTAMP NULL DEFAULT NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_username (username),
  UNIQUE KEY uq_email    (email)
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
--  2. PASSWORD RESETS  (forgot-password flow)
-- ─────────────────────────────────────────────
CREATE TABLE password_resets (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  token      VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP    NOT NULL,
  used       TINYINT(1)   DEFAULT 0,
  -- wrong-code guesses against this user's outstanding codes; all of them
  -- are marked used at MAX_OTP_ATTEMPTS (see migrations/006)
  attempts   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_token (token),
  KEY idx_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
--  3. SURVEY ALBUMS  (user-defined categories, drag/drop from Surveys page)
--     Declared before SURVEYS so surveys.album_id can reference it —
--     one survey belongs to at most one album at a time.
-- ─────────────────────────────────────────────
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

-- ─────────────────────────────────────────────
--  4. SURVEYS
-- ─────────────────────────────────────────────
CREATE TABLE surveys (
  id                   INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  user_id              INT UNSIGNED     NOT NULL,
  title                VARCHAR(500)     NOT NULL,
  description          TEXT,
  status               ENUM('draft','active','closed') DEFAULT 'draft',
  target_responses     INT UNSIGNED,          -- notification threshold
  close_date           DATE,
  google_form_url      VARCHAR(500),          -- viewform URL, set when linked to a Google Form
  google_form_id       VARCHAR(100),          -- Google Forms file ID, set when linked to a Google Form
  google_refresh_token TEXT,                  -- long-lived OAuth refresh token, enables background auto-sync (NULL until first import/sync grant)
  last_synced_at       TIMESTAMP    NULL DEFAULT NULL, -- last time the background poller (or a manual sync) pulled responses
  share_token          VARCHAR(64)      UNIQUE,   -- random token for public link / QR code
  view_count           INT UNSIGNED     DEFAULT 0, -- how many times the public link was opened
  shared_all           TINYINT(1)       NOT NULL DEFAULT 0, -- owner opted this survey into "visible to every user" (vs. per-user survey_shares rows)
  album_id             INT UNSIGNED     NULL, -- which survey_albums row this survey is categorized under, if any
  created_at           TIMESTAMP        DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_user_status    (user_id, status),
  KEY idx_album          (album_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_surveys_album_id FOREIGN KEY (album_id) REFERENCES survey_albums(id) ON DELETE SET NULL
) ENGINE=InnoDB;
-- Note: no separate idx_share_token index — the inline UNIQUE on
-- share_token above already creates one; a second explicit KEY on the same
-- single column was a redundant duplicate index (wasted write overhead/
-- storage, no query it served that the UNIQUE index didn't already serve).
-- The old migrations/000_google_forms_columns.sql migration path never
-- created that second index either, so this also removes a drift between
-- a fresh schema.sql install and a database migrated up from scratch.

-- ─────────────────────────────────────────────
--  5. QUESTIONS
--     section_number: 1=ข้อมูลส่วนตัว
--                     2=ความพึงพอใจ
--                     3=ข้อเสนอแนะ
-- ─────────────────────────────────────────────
CREATE TABLE questions (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  survey_id     INT UNSIGNED NOT NULL,
  section_number TINYINT UNSIGNED DEFAULT 1,
  sort_order    SMALLINT UNSIGNED DEFAULT 0,
  question_text TEXT         NOT NULL,
  question_type ENUM(
    'short',     -- คำตอบสั้นๆ
    'para',      -- ย่อหน้า
    'radio',     -- หลายตัวเลือก (single)
    'checkbox',  -- ช่องทำเครื่องหมาย (multi)
    'dropdown',  -- เลื่อนลง
    'file',      -- อัปโหลดไฟล์
    'scale',     -- สเกลเชิงเส้น 1-5/1-10
    'star',      -- คะแนนดาว
    'mcgrid',    -- ตารางกริด radio (Likert)
    'cbgrid',    -- ตารางกริด checkbox
    'date',      -- วันที่
    'time'       -- เวลา
  ) NOT NULL DEFAULT 'short',
  is_required   TINYINT(1)   DEFAULT 0,
  -- options_json stores:
  --   radio/checkbox/dropdown : ["opt1","opt2",...]
  --   scale                   : {"min":1,"max":5,"min_label":"น้อยที่สุด","max_label":"มากที่สุด"}
  --   mcgrid/cbgrid           : {"rows":["row1","row2"],"cols":["col1","col2"]}
  --   star                    : {"max_stars":5}
  --   mcgrid/cbgrid also add  : "rowQuestionIds":["gId1","gId2",...] (parallel to "rows"), once imported from Google
  options_json  JSON,
  google_question_id VARCHAR(128), -- Google Forms question ID, set on import; lets sync match by ID instead of guessing by position (NULL for native/pre-existing questions)
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_survey_order (survey_id, section_number, sort_order),
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
--  6. RESPONSES  (one row per survey submission)
-- ─────────────────────────────────────────────
CREATE TABLE responses (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  survey_id        INT UNSIGNED NOT NULL,
  respondent_name  VARCHAR(255)  DEFAULT 'ไม่ระบุ',
  overall_score    DECIMAL(5,2),   -- avg of all numeric answers (computed on insert)
  ip_address       VARCHAR(45),    -- IPv4 or IPv6, optional
  google_response_id VARCHAR(128), -- Google Forms response ID, for dedup on sync (NULL for native responses)
  external_id      VARCHAR(191),   -- caller-supplied ID from a CSV import's id/response_id column, for dedup on
                                    -- re-import (NULL for native submissions and rows imported without an ID column —
                                    -- MySQL unique keys treat each NULL as distinct, so those never collide)
  submitted_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_survey_time (survey_id, submitted_at),
  UNIQUE KEY uq_survey_google_resp (survey_id, google_response_id),
  UNIQUE KEY uq_survey_external_id (survey_id, external_id),
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
--  7. RESPONSE ANSWERS  (one row per question per submission)
--     Enables per-question x̄ / S.D. analytics
-- ─────────────────────────────────────────────
CREATE TABLE response_answers (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  response_id  INT UNSIGNED NOT NULL,
  question_id  INT UNSIGNED NOT NULL,
  -- text answer (short / para / date / time)
  answer_text  TEXT,
  -- structured answer (radio/checkbox/dropdown/mcgrid/cbgrid/scale/star)
  -- radio     → {"value":"ดีมาก (5)"}
  -- checkbox  → {"values":["A","B"]}
  -- mcgrid    → {"row1":"ดีมาก","row2":"ดี",...}
  -- scale/star→ {"score":4}
  answer_json  JSON,
  -- numeric score extracted for aggregation (NULL for non-numeric types)
  score        DECIMAL(4,2),

  PRIMARY KEY (id),
  KEY idx_response  (response_id),
  KEY idx_question  (question_id),
  FOREIGN KEY (response_id) REFERENCES responses(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
--  8. SURVEY SHARES  (user-to-user, view-only)
-- ─────────────────────────────────────────────
CREATE TABLE survey_shares (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  survey_id       INT UNSIGNED NOT NULL,
  shared_with_id  INT UNSIGNED NOT NULL,
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_share (survey_id, shared_with_id),
  FOREIGN KEY (survey_id)      REFERENCES surveys(id) ON DELETE CASCADE,
  FOREIGN KEY (shared_with_id) REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
--  VIEWS for common analytics queries
-- ============================================================

-- Survey summary (response count + avg score per survey)
CREATE OR REPLACE VIEW v_survey_summary AS
SELECT
  s.id,
  s.user_id,
  s.title,
  s.status,
  s.target_responses,
  s.close_date,
  s.share_token,
  s.created_at,
  s.updated_at,
  COUNT(DISTINCT r.id)       AS response_count,
  ROUND(AVG(r.overall_score), 2) AS avg_score
FROM surveys s
LEFT JOIN responses r ON r.survey_id = s.id
GROUP BY s.id;

-- Per-question analytics (x̄ and S.D. across all responses)
CREATE OR REPLACE VIEW v_question_stats AS
SELECT
  ra.question_id,
  q.survey_id,
  q.section_number,
  q.question_text,
  q.question_type,
  COUNT(ra.id)                                 AS n,
  ROUND(AVG(ra.score), 2)                      AS avg_score,
  ROUND(SQRT(AVG(ra.score * ra.score) - AVG(ra.score) * AVG(ra.score)), 2) AS std_dev
FROM response_answers ra
JOIN questions q ON q.id = ra.question_id
WHERE ra.score IS NOT NULL
GROUP BY ra.question_id;
