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
  role         ENUM('user','admin') DEFAULT 'user',
  is_active    TINYINT(1)      DEFAULT 1,
  created_at   TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

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
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_token (token),
  KEY idx_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
--  3. SURVEYS
-- ─────────────────────────────────────────────
CREATE TABLE surveys (
  id               INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED     NOT NULL,
  title            VARCHAR(500)     NOT NULL,
  description      TEXT,
  status           ENUM('draft','active','closed') DEFAULT 'draft',
  target_responses INT UNSIGNED,          -- notification threshold
  close_date       DATE,
  share_token      VARCHAR(64)      UNIQUE,   -- random token for public link / QR code
  view_count       INT UNSIGNED     DEFAULT 0, -- how many times the public link was opened
  created_at       TIMESTAMP        DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_user_status    (user_id, status),
  KEY idx_share_token    (share_token),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
--  4. QUESTIONS
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
  options_json  JSON,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_survey_order (survey_id, section_number, sort_order),
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
--  5. RESPONSES  (one row per survey submission)
-- ─────────────────────────────────────────────
CREATE TABLE responses (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  survey_id        INT UNSIGNED NOT NULL,
  respondent_name  VARCHAR(255)  DEFAULT 'ไม่ระบุ',
  overall_score    DECIMAL(5,2),   -- avg of all numeric answers (computed on insert)
  ip_address       VARCHAR(45),    -- IPv4 or IPv6, optional
  submitted_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_survey_time (survey_id, submitted_at),
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ─────────────────────────────────────────────
--  6. RESPONSE ANSWERS  (one row per question per submission)
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
--  7. SURVEY SHARES  (user-to-user, view-only)
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

-- ─────────────────────────────────────────────
--  8. NOTIFICATIONS
-- ─────────────────────────────────────────────
CREATE TABLE notifications (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  type       ENUM('new','goal','warn') NOT NULL,
  title      VARCHAR(255) NOT NULL,
  message    TEXT,
  survey_id  INT UNSIGNED,
  is_read    TINYINT(1)   DEFAULT 0,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_user_unread (user_id, is_read),   -- fast unread-count query
  KEY idx_created     (created_at),
  FOREIGN KEY (user_id)   REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (survey_id) REFERENCES surveys(id)  ON DELETE SET NULL
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
