const test = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const path = require('node:path');
const db = require('../src/config/db');
const { run, pendingMigrations, parseStatements, MIGRATIONS_DIR } = require('../src/migrate');

test.after(async () => {
  try { await db.end(); } catch { /* nothing was ever connected */ }
});

test('pendingMigrations — returns nothing when every migration file has already been applied', () => {
  const files = ['000_a.sql', '001_b.sql'];
  const applied = ['000_a.sql', '001_b.sql'];
  assert.deepEqual(pendingMigrations(files, applied), []);
});

test('pendingMigrations — returns un-applied files in filename order regardless of directory listing order', () => {
  const files = ['002_c.sql', '000_a.sql', '001_b.sql'];
  const applied = ['000_a.sql'];
  assert.deepEqual(pendingMigrations(files, applied), ['001_b.sql', '002_c.sql']);
});

test('pendingMigrations — ignores non-.sql files in the migrations folder', () => {
  const files = ['000_a.sql', 'README.md', '.gitkeep'];
  const applied = [];
  assert.deepEqual(pendingMigrations(files, applied), ['000_a.sql']);
});

test('pendingMigrations — a brand new database with no schema_migrations rows needs every file applied', () => {
  const files = ['000_a.sql', '001_b.sql', '002_c.sql'];
  assert.deepEqual(pendingMigrations(files, []), ['000_a.sql', '001_b.sql', '002_c.sql']);
});

test('parseStatements — a statement directly preceded by a "-- comment" block (no blank/semicolon between them) is NOT dropped (regression test)', () => {
  const sql = `-- This explains what the statement below does.
-- Second comment line.
ALTER TABLE surveys ADD COLUMN foo INT NULL;`;
  const statements = parseStatements(sql);
  assert.equal(statements.length, 1, 'the real statement must survive comment-stripping, not be discarded along with the comment');
  assert.match(statements[0], /^ALTER TABLE surveys ADD COLUMN foo INT NULL$/);
});

test('parseStatements — a pure comment-only chunk (nothing after it before the next statement) produces no statement', () => {
  const sql = `-- just a comment, no SQL follows in this chunk\n\nALTER TABLE surveys ADD COLUMN bar INT NULL;`;
  const statements = parseStatements(sql);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /ADD COLUMN bar/);
});

test('parseStatements — multiple statements in one file are all extracted, each with its own leading comment', () => {
  const sql = `-- comment for first\nALTER TABLE t ADD COLUMN a INT;\n-- comment for second\nALTER TABLE t ADD COLUMN b INT;`;
  const statements = parseStatements(sql);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /ADD COLUMN a INT/);
  assert.match(statements[1], /ADD COLUMN b INT/);
});

test('parseStatements — every real migration file under database/migrations/ has its first statement survive parsing (regression test for the earlier silent-drop bug)', () => {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
  assert.ok(files.length > 0, 'expected at least one migration file to check');
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = parseStatements(sql);
    assert.ok(statements.length > 0, `${file} produced zero statements after parsing — likely had its SQL swallowed along with a leading comment`);
    for (const stmt of statements) {
      assert.ok(/^(CREATE|ALTER|INSERT|UPDATE|DROP)\s/i.test(stmt), `${file} produced a statement that doesn't look like SQL: ${JSON.stringify(stmt.slice(0, 60))}`);
    }
  }
});

// The tests below mock db.query/db.getConnection to exercise run() itself
// (previously untested — only the pure helpers above had coverage), against
// the real 003_survey_albums.sql file on disk.
test('run — a duplicate-named foreign key (ER_FK_DUP_NAME) is treated as already-satisfied, same as ER_DUP_FIELDNAME/ER_TABLE_EXISTS_ERROR (regression test)', async () => {
  const originalQuery = db.query;
  const originalGetConnection = db.getConnection;

  const allFiles = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
  const alreadyApplied = allFiles.filter(f => f !== '003_survey_albums.sql');

  db.query = async (sql) => {
    if (sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations')) return [{}];
    if (sql.includes('SELECT name FROM schema_migrations')) return [alreadyApplied.map(name => ({ name }))];
    return [{}];
  };

  const queriedStatements = [];
  db.getConnection = async () => ({
    query: async (stmt) => {
      queriedStatements.push(stmt);
      // Simulate a database built fresh from schema.sql: survey_albums,
      // album_id, and the named FK constraint all already exist even though
      // schema_migrations has never recorded 003 as applied.
      if (/CREATE TABLE survey_albums/.test(stmt)) {
        const err = new Error('Table already exists'); err.code = 'ER_TABLE_EXISTS_ERROR'; throw err;
      }
      if (/ADD COLUMN album_id/.test(stmt)) {
        const err = new Error('Duplicate column name'); err.code = 'ER_DUP_FIELDNAME'; throw err;
      }
      if (/ADD CONSTRAINT fk_surveys_album_id/.test(stmt)) {
        const err = new Error('Duplicate foreign key constraint name'); err.code = 'ER_FK_DUP_NAME'; throw err;
      }
      return [{}];
    },
    release: () => {},
  });

  const result = await run({ silent: true });

  db.query = originalQuery;
  db.getConnection = originalGetConnection;

  assert.deepEqual(result.applied, ['003_survey_albums.sql']);
  assert.ok(queriedStatements.some(s => /ADD CONSTRAINT fk_surveys_album_id/.test(s)), 'the FK statement must actually have been attempted, not skipped entirely');
});

test('run — a real (non-allowlisted) error still aborts the file and is not swallowed', async () => {
  const originalQuery = db.query;
  const originalGetConnection = db.getConnection;

  const allFiles = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
  const alreadyApplied = allFiles.filter(f => f !== '003_survey_albums.sql');

  db.query = async (sql) => {
    if (sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations')) return [{}];
    if (sql.includes('SELECT name FROM schema_migrations')) return [alreadyApplied.map(name => ({ name }))];
    return [{}];
  };
  db.getConnection = async () => ({
    query: async () => {
      const err = new Error('Access denied'); err.code = 'ER_ACCESS_DENIED_ERROR'; throw err;
    },
    release: () => {},
  });

  await assert.rejects(() => run({ silent: true }));

  db.query = originalQuery;
  db.getConnection = originalGetConnection;
});
