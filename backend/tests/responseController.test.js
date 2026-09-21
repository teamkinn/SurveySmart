const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const ctrl = require('../src/controllers/responseController');
const { mockRes } = require('./helpers/mockReqRes');

// The mysql2 pool created by requiring config/db.js keeps a background
// connection-queue timer alive even though these tests never open a real
// connection — close it once all tests in this file are done so the
// process (and `node --test`) can exit instead of hanging.
test.after(async () => {
  try { await db.end(); } catch { /* nothing was ever connected */ }
});

test('chartData — a configured scale minimum of 0 is preserved (regression test for the ?? fix)', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    // canAccessSurvey() for an admin user
    if (sql.includes('SELECT id FROM surveys')) return [[{ id: 1 }]];
    if (sql.includes('FROM questions')) {
      return [[{
        id: 1,
        question_text: 'Rate 0-10',
        question_type: 'scale',
        options_json: JSON.stringify({ min: 0, max: 10 }),
      }]];
    }
    if (sql.includes('FROM response_answers')) {
      return [[{ question_id: 1, answer_text: null, answer_json: JSON.stringify({ score: 3 }), score: 3 }]];
    }
    return [[]];
  };

  const req = { params: { surveyId: '1' }, user: { id: 1, role: 'admin' } };
  const res = mockRes();
  await ctrl.chartData(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 200);
  const chart = res.body[0];
  assert.equal(chart.chartType, 'score');
  // Buckets 0..10 inclusive = 11 entries if min:0 was respected. With the
  // old `opts?.min || 1` bug, min:0 would be falsy-coerced to 1, giving
  // only 10 buckets (1..10) starting at label "1" instead of "0".
  assert.equal(chart.data.length, 11);
  assert.equal(chart.data[0].label, '0');
});

test('chartData — falls back to the 1-5 default when no options are configured', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('SELECT id FROM surveys')) return [[{ id: 1 }]];
    if (sql.includes('FROM questions')) {
      return [[{ id: 2, question_text: 'Satisfaction', question_type: 'star', options_json: null }]];
    }
    if (sql.includes('FROM response_answers')) return [[]];
    return [[]];
  };

  const req = { params: { surveyId: '1' }, user: { id: 1, role: 'admin' } };
  const res = mockRes();
  await ctrl.chartData(req, res);
  db.query = originalQuery;

  const chart = res.body[0];
  assert.equal(chart.data.length, 5);
  assert.equal(chart.data[0].label, '1');
});

test('submit — rejects a submission missing an answer to a required question', async () => {
  const originalGetConnection = db.getConnection;
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (sql) => {
      if (sql.includes('FROM surveys') && sql.includes("status = 'active'")) return [[{ id: 1 }]];
      if (sql.includes('question_type')) return [[{ id: 10, question_type: 'short', options_json: null }]];
      if (sql.includes('is_required = 1')) return [[{ id: 10 }]];
      return [{ insertId: 1 }];
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });

  const req = {
    params: { surveyId: '1' },
    body: { respondent_name: 'Tester', answers: [], share_token: 'tok-1' },
    ip: '127.0.0.1',
  };
  const res = mockRes();
  await ctrl.submit(req, res);
  db.getConnection = originalGetConnection;

  assert.equal(res.statusCode, 400);
});

test('submit — accepts a valid submission with all required answers present', async () => {
  const originalGetConnection = db.getConnection;
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (sql) => {
      if (sql.includes('FROM surveys') && sql.includes("status = 'active'")) return [[{ id: 1 }]];
      if (sql.includes('question_type')) return [[{ id: 10, question_type: 'short', options_json: null }]];
      if (sql.includes('is_required = 1')) return [[{ id: 10 }]];
      return [{ insertId: 99 }];
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });

  const req = {
    params: { surveyId: '1' },
    body: { respondent_name: 'Tester', answers: [{ question_id: 10, answer_text: 'yes' }], share_token: 'tok-1' },
    ip: '127.0.0.1',
  };
  const res = mockRes();
  await ctrl.submit(req, res);
  db.getConnection = originalGetConnection;

  assert.equal(res.statusCode, 201);
});

test('submit — self-assigns external_id = its own id, so Export CSV -> re-import into the same survey can dedup on the first try (regression test)', async () => {
  const originalGetConnection = db.getConnection;
  const queries = [];
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes('FROM surveys') && sql.includes("status = 'active'")) return [[{ id: 1 }]];
      if (sql.includes('question_type')) return [[{ id: 10, question_type: 'short', options_json: null }]];
      if (sql.includes('is_required = 1')) return [[]];
      if (sql.startsWith('INSERT INTO responses')) return [{ insertId: 555 }];
      return [{}];
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });

  const req = {
    params: { surveyId: '1' },
    body: { respondent_name: 'Tester', answers: [{ question_id: 10, answer_text: 'yes' }], share_token: 'tok-1' },
    ip: '127.0.0.1',
  };
  const res = mockRes();
  await ctrl.submit(req, res);
  db.getConnection = originalGetConnection;

  assert.equal(res.statusCode, 201);
  const updateQuery = queries.find(q => q.sql.startsWith('UPDATE responses SET external_id'));
  assert.ok(updateQuery, 'expected an UPDATE responses SET external_id ... query after the insert');
  assert.deepEqual(updateQuery.params, ['555', 555]);
});

test('submit — a genuine answer of 0 (e.g. a scale question with min: 0) is stored as 0, not NULL (regression test)', async () => {
  const originalGetConnection = db.getConnection;
  let insertedAnswerValues = null;
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (sql, params) => {
      if (sql.includes('FROM surveys') && sql.includes("status = 'active'")) return [[{ id: 1 }]];
      if (sql.includes('question_type')) {
        return [[{ id: 10, question_type: 'scale', options_json: JSON.stringify({ min: 0, max: 5 }) }]];
      }
      if (sql.includes('is_required = 1')) return [[]];
      if (sql.includes('INSERT INTO response_answers')) {
        insertedAnswerValues = params[0];
        return [{}];
      }
      return [{ insertId: 99 }];
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });

  const req = {
    params: { surveyId: '1' },
    body: { respondent_name: 'Tester', answers: [{ question_id: 10, score: 0 }], share_token: 'tok-1' },
    ip: '127.0.0.1',
  };
  const res = mockRes();
  await ctrl.submit(req, res);
  db.getConnection = originalGetConnection;

  assert.equal(res.statusCode, 201);
  // Column order: [responseId, question_id, answer_text, answer_json, score]
  assert.equal(insertedAnswerValues[0][4], 0);
});

test('submit — rejects submissions to a survey that is not active (closed/draft)', async () => {
  const originalGetConnection = db.getConnection;
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (sql) => {
      if (sql.includes('FROM surveys') && sql.includes("status = 'active'")) return [[]]; // not found/not active
      return [{ insertId: 1 }];
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });

  const req = { params: { surveyId: '1' }, body: { respondent_name: 'Tester', answers: [], share_token: 'tok-1' }, ip: '127.0.0.1' };
  const res = mockRes();
  await ctrl.submit(req, res);
  db.getConnection = originalGetConnection;

  assert.equal(res.statusCode, 403);
});

test('submit — requires a matching share_token, not just an active survey id (regression test for the ID-enumeration fix)', async () => {
  const originalGetConnection = db.getConnection;
  let capturedParams = null;
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (sql, params) => {
      if (sql.includes('FROM surveys') && sql.includes("status = 'active'")) {
        capturedParams = params;
        // Simulate the real query: only matches when share_token is correct.
        return params[1] === 'correct-token' ? [[{ id: 1 }]] : [[]];
      }
      if (sql.includes('question_type')) return [[]];
      if (sql.includes('is_required = 1')) return [[]];
      return [{ insertId: 1 }];
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });

  const req = {
    params: { surveyId: '1' },
    body: { respondent_name: 'Tester', answers: [], share_token: 'guessed-wrong-token' },
    ip: '127.0.0.1',
  };
  const res = mockRes();
  await ctrl.submit(req, res);
  db.getConnection = originalGetConnection;

  assert.equal(res.statusCode, 403);
  assert.ok(capturedParams.includes('guessed-wrong-token'), 'share_token from the request body must reach the query');
});

test('submit — drops an answer whose question_id does not belong to this survey (regression test for cross-survey answer injection)', async () => {
  const originalGetConnection = db.getConnection;
  let insertedAnswerValues = 'not-called';
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (sql, params) => {
      if (sql.includes('FROM surveys') && sql.includes("status = 'active'")) return [[{ id: 1 }]];
      // This survey only really has question id 10 — 999 belongs to some other survey.
      if (sql.includes('question_type')) return [[{ id: 10, question_type: 'short', options_json: null }]];
      if (sql.includes('is_required = 1')) return [[]];
      if (sql.includes('INSERT INTO response_answers')) {
        insertedAnswerValues = params[0];
        return [{}];
      }
      return [{ insertId: 99 }];
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });

  const req = {
    params: { surveyId: '1' },
    body: { respondent_name: 'Tester', answers: [{ question_id: 999, answer_text: 'injected' }], share_token: 'tok-1' },
    ip: '127.0.0.1',
  };
  const res = mockRes();
  await ctrl.submit(req, res);
  db.getConnection = originalGetConnection;

  assert.equal(res.statusCode, 201);
  // The foreign answer must never reach the INSERT at all.
  assert.equal(insertedAnswerValues, 'not-called');
});

test('submit — a score outside the question\'s configured range is dropped instead of stored (regression test for score-injection fix)', async () => {
  const originalGetConnection = db.getConnection;
  let insertedAnswerValues = null;
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (sql, params) => {
      if (sql.includes('FROM surveys') && sql.includes("status = 'active'")) return [[{ id: 1 }]];
      if (sql.includes('question_type')) {
        return [[{ id: 10, question_type: 'scale', options_json: JSON.stringify({ min: 1, max: 5 }) }]];
      }
      if (sql.includes('is_required = 1')) return [[]];
      if (sql.includes('INSERT INTO response_answers')) {
        insertedAnswerValues = params[0];
        return [{}];
      }
      return [{ insertId: 99 }];
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });

  const req = {
    params: { surveyId: '1' },
    // 999999 is nowhere near this scale question's configured 1-5 range.
    body: { respondent_name: 'Tester', answers: [{ question_id: 10, score: 999999 }], share_token: 'tok-1' },
    ip: '127.0.0.1',
  };
  const res = mockRes();
  await ctrl.submit(req, res);
  db.getConnection = originalGetConnection;

  assert.equal(res.statusCode, 201);
  assert.equal(insertedAnswerValues[0][4], null);
});
