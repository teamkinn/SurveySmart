const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const { pullFormResponses } = require('../src/services/googleFormsSync');

// The mysql2 pool created by requiring config/db.js keeps a background
// connection-queue timer alive even though these tests never open a real
// connection — close it once all tests in this file are done so the
// process (and `node --test`) can exit instead of hanging.
test.after(async () => {
  try { await db.end(); } catch { /* nothing was ever connected */ }
});

function makeForms({ items = [], responses = [] } = {}) {
  return {
    forms: {
      get: async () => ({ data: { items } }),
      responses: { list: async () => ({ data: { responses } }) },
    },
  };
}

const SAMPLE_QUESTIONS = [
  { id: 10, question_text: 'ชื่อ-นามสกุล', question_type: 'short', options_json: null, google_question_id: 'g1' },
];

const SAMPLE_ITEMS = [{ questionItem: { question: { questionId: 'g1' } } }];
const SAMPLE_RESPONSES = [{
  responseId: 'r1',
  createTime: '2026-01-01T00:00:00Z',
  answers: { g1: { textAnswers: { answers: [{ value: 'สมชาย' }] } } },
}];

test('pullFormResponses — commits response + answers together on success', async () => {
  const calls = [];
  const originalGetConnection = db.getConnection;
  const originalDbQuery = db.query;

  db.getConnection = async () => ({
    beginTransaction: async () => calls.push('begin'),
    query: async (sql) => {
      if (sql.includes('SELECT id FROM responses')) return [[]]; // not a dup
      if (sql.includes('INSERT INTO responses')) { calls.push('insert-response'); return [{ insertId: 1 }]; }
      if (sql.includes('INSERT INTO response_answers')) { calls.push('insert-answers'); return [{}]; }
      return [[]];
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
  });
  db.query = async (sql) => {
    if (sql.includes('FROM questions')) return [SAMPLE_QUESTIONS];
    return [[]];
  };

  const result = await pullFormResponses(makeForms({ items: SAMPLE_ITEMS, responses: SAMPLE_RESPONSES }), 'form-1', 1);

  db.getConnection = originalGetConnection;
  db.query = originalDbQuery;

  assert.equal(result.synced, 1);
  assert.deepEqual(calls, ['begin', 'insert-response', 'insert-answers', 'commit', 'release']);
});

test('pullFormResponses — rolls back both writes if the answers insert fails, instead of leaving an orphaned response (regression test)', async () => {
  const calls = [];
  const originalGetConnection = db.getConnection;
  const originalDbQuery = db.query;

  db.getConnection = async () => ({
    beginTransaction: async () => calls.push('begin'),
    query: async (sql) => {
      if (sql.includes('SELECT id FROM responses')) return [[]];
      if (sql.includes('INSERT INTO responses')) { calls.push('insert-response'); return [{ insertId: 1 }]; }
      if (sql.includes('INSERT INTO response_answers')) {
        calls.push('insert-answers');
        throw new Error('simulated failure');
      }
      return [[]];
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
  });
  db.query = async (sql) => {
    if (sql.includes('FROM questions')) return [SAMPLE_QUESTIONS];
    return [[]];
  };

  const result = await pullFormResponses(makeForms({ items: SAMPLE_ITEMS, responses: SAMPLE_RESPONSES }), 'form-1', 1);

  db.getConnection = originalGetConnection;
  db.query = originalDbQuery;

  // Before this fix, the responses INSERT (on the shared pool, no
  // transaction) had already committed by the time the answers INSERT threw
  // — the response would survive with zero answers, and the next sync's
  // dedup check (google_response_id already present) would skip it forever.
  assert.equal(result.synced, 0);
  assert.ok(calls.includes('rollback'), 'must roll back instead of leaving the responses row committed');
  assert.ok(!calls.includes('commit'), 'must not commit a half-written response');
  assert.deepEqual(calls, ['begin', 'insert-response', 'insert-answers', 'rollback', 'release']);
});

test('pullFormResponses — skips (and releases the connection) without inserting when google_response_id already exists', async () => {
  const calls = [];
  const originalGetConnection = db.getConnection;
  const originalDbQuery = db.query;

  db.getConnection = async () => ({
    beginTransaction: async () => calls.push('begin'),
    query: async (sql) => {
      if (sql.includes('SELECT id FROM responses')) return [[{ id: 999 }]]; // already synced
      calls.push('unexpected-write');
      return [[]];
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
  });
  db.query = async (sql) => {
    if (sql.includes('FROM questions')) return [SAMPLE_QUESTIONS];
    return [[]];
  };

  const result = await pullFormResponses(makeForms({ items: SAMPLE_ITEMS, responses: SAMPLE_RESPONSES }), 'form-1', 1);

  db.getConnection = originalGetConnection;
  db.query = originalDbQuery;

  assert.equal(result.synced, 0);
  assert.equal(result.skipped, 1);
  assert.deepEqual(calls, ['begin', 'rollback', 'release']);
});
