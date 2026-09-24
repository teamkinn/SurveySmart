// Applies pending SQL files from database/migrations/ and tracks which ones
// have already run in a `schema_migrations` table, so schema drift between
// schema.sql (source of truth) and a real running database can't happen
// silently anymore — this replaces the old one-off
// backend/fix-shared-all-column.js / backend/check-teamkinn-bug.js scripts
// that were previously the only way to detect/fix that class of bug.
//
// Usage:
//   node src/migrate.js        (or: npm run migrate)
//
// Each file in database/migrations/ is a plain .sql file, applied in
// filename order, exactly once ever (tracked by filename in
// schema_migrations). Statements are split on ";" — migrations here are
// simple ALTER TABLE statements with no stored procedures/triggers, so a
// naive split is safe.
const fs = require('fs');
const path = require('path');
const pool = require('./config/db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'database', 'migrations');

// Pure — given every filename in the migrations folder and every name
// already recorded as applied, returns the ones that still need to run, in
// order. Exported so this can be unit-tested without a real DB connection.
function pendingMigrations(allFiles, appliedNames) {
  const applied = new Set(appliedNames);
  return allFiles
    .filter(f => f.endsWith('.sql'))
    .sort()
    .filter(f => !applied.has(f));
}

// Pure — splits a migration file's raw text into individual statements to
// execute. Exported so this can be unit-tested without a real DB connection.
//
// Splits on ";", then strips "-- comment" LINES out of each chunk (not just
// checking whether the whole trimmed chunk starts with "--"). Every
// migration file here opens with a multi-line "-- ..." explanation directly
// above its first statement with no blank/semicolon in between — an earlier
// version of this function checked `chunk.startsWith('--')` on the whole
// chunk, which is true for "-- comment\nALTER TABLE ..." too, so it silently
// dropped the real statement along with the comment instead of just the
// comment. That let migrations "succeed" (schema_migrations got the row)
// while their first statement had never actually run.
function parseStatements(sql) {
  return sql
    .split(';')
    .map(chunk => chunk
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .trim())
    .filter(Boolean);
}

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_name (name)
    ) ENGINE=InnoDB
  `);
}

async function listAppliedNames() {
  const [rows] = await pool.query('SELECT name FROM schema_migrations');
  return rows.map(r => r.name);
}

function listMigrationFiles() {
  return fs.existsSync(MIGRATIONS_DIR) ? fs.readdirSync(MIGRATIONS_DIR) : [];
}

// Read-only — used by app.js at boot so an un-applied migration shows up as
// a clear warning in the server logs instead of surfacing later as a
// mysterious ER_BAD_FIELD_ERROR the first time a request touches the
// missing column.
async function checkPending() {
  await ensureMigrationsTable();
  return pendingMigrations(listMigrationFiles(), await listAppliedNames());
}

async function run({ silent = false } = {}) {
  const log = (...a) => { if (!silent) console.log(...a); };

  await ensureMigrationsTable();
  const pending = pendingMigrations(listMigrationFiles(), await listAppliedNames());

  if (!pending.length) {
    log('ไม่มี migration ที่ต้องรัน — schema เป็นปัจจุบันแล้ว');
    return { applied: [] };
  }

  const appliedNow = [];
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = parseStatements(sql);

    log(`[กำลังรัน] ${file} ...`);
    // One connection for every statement in this file (not pool.query() per
    // statement, which can silently hand out a different pooled connection
    // each time). Some MySQL/MariaDB setups have thrown ER_FK_CANNOT_OPEN_PARENT
    // when a FOREIGN KEY is added in one statement referencing a table that
    // was CREATEd by an earlier statement in the same file but on a
    // different connection — running the whole file on one connection avoids
    // that class of "table not visible yet" error.
    const conn = await pool.getConnection();
    try {
      for (const stmt of statements) {
        try {
          await conn.query(stmt);
        } catch (e) {
          // A database that already had this column/index/table applied by
          // hand before the migration runner existed (e.g. via the old
          // fix-shared-all-column.js script), or a previous run of this same
          // file that got partway through before failing, shouldn't block
          // forever — treat "already exists" as this statement being
          // satisfied so the migration can still be recorded as applied.
          // ER_FK_DUP_NAME: duplicate foreign key constraint name (MySQL 8+;
          // named explicitly in the migration files precisely so a retry
          // against a database that already has the constraint hits this
          // instead of MySQL silently accepting a second, differently
          // auto-named FK on the same column — see 003_survey_albums.sql).
          if (['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_FK_DUP_NAME'].includes(e.code)) {
            log(`   [ข้าม] ${e.code}: ${e.sqlMessage || e.message}`);
            continue;
          }
          console.error(`   ล้มเหลวที่ไฟล์ ${file}: ${e.message}`);
          throw e;
        }
      }
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    } finally {
      conn.release();
    }
    log('   สำเร็จ');
    appliedNow.push(file);
  }

  log(`\nรัน migration สำเร็จ ${appliedNow.length} ไฟล์: ${appliedNow.join(', ')}`);
  return { applied: appliedNow };
}

// Connection-level errors worth retrying: the database simply isn't
// reachable *yet*. On Railway the Pre-deploy Command container starts and
// runs this within ~1s, before its private network (mysql.railway.internal)
// is up — the first attempt failed with ETIMEDOUT (IPv6) / ECONNREFUSED
// (IPv4) and aborted the whole deploy. mysql2 wraps the per-address
// failures in an AggregateError whose own .code is the first one's, so
// checking err.code and each err.errors[].code covers both shapes.
// Anything else (bad SQL, access denied, unknown database) is a real error
// and is NOT retried.
const RETRYABLE_CODES = new Set([
  'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH',
  'ENETUNREACH', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST',
]);
function isRetryableConnectionError(err) {
  if (!err) return false;
  if (RETRYABLE_CODES.has(err.code)) return true;
  return Array.isArray(err.errors) && err.errors.some(e => RETRYABLE_CODES.has(e?.code));
}

async function runWithRetry({ attempts = 10, delayMs = 3000, runFn = run, sleep } = {}) {
  const wait = sleep || (ms => new Promise(r => setTimeout(r, ms)));
  for (let i = 1; ; i++) {
    try {
      return await runFn();
    } catch (err) {
      if (i >= attempts || !isRetryableConnectionError(err)) throw err;
      console.warn(`[migrate] ยังเชื่อมต่อฐานข้อมูลไม่ได้ (${err.code}) — ลองใหม่ครั้งที่ ${i + 1}/${attempts} ใน ${delayMs / 1000} วินาที`);
      await wait(delayMs);
    }
  }
}

module.exports = {
  run, runWithRetry, isRetryableConnectionError,
  checkPending, pendingMigrations, parseStatements, MIGRATIONS_DIR,
};

if (require.main === module) {
  runWithRetry()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('เกิดข้อผิดพลาดตอนรัน migration:', err);
      process.exit(1);
    });
}
