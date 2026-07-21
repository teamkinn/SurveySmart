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
      if (sql.includes('is_required = 1')) return [[{ id: 10 }]];
      return [{ insertId: 1 }];
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });

  const req = {
    params: { surveyId: '1' },
    body: { respondent_name: 'Tester', answers: [] },
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
      if (sql.includes('is_required = 1')) return [[{ id: 10 }]];
      return [{ insertId: 99 }];
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });

  const req = {
    params: { surveyId: '1' },
    body: { respondent_name: 'Tester', answers: [{ question_id: 10, answer_text: 'yes' }] },
    ip: '127.0.0.1',
  };
  const res = mockRes();
  await ctrl.submit(req, res);
  db.getConnection = originalGetConnection;

  assert.equal(res.statusCode, 201);
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

  const req = { params: { surveyId: '1' }, body: { respondent_name: 'Tester', answers: [] }, ip: '127.0.0.1' };
  const res = mockRes();
  await ctrl.submit(req, res);
  db.getConnection = originalGetConnection;

  assert.equal(res.statusCode, 403);
});
