const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const ctrl = require('../src/controllers/responseController');
const { mockRes } = require('./helpers/mockReqRes');

test.after(async () => {
  try { await db.end(); } catch { /* nothing was ever connected */ }
});

const QUESTIONS = [
  { id: 1, question_text: 'ชื่อ-นามสกุล', question_type: 'short', options_json: null },
  { id: 2, question_text: 'ความพึงพอใจโดยรวม', question_type: 'radio', options_json: JSON.stringify(['แย่ (1)', 'ปานกลาง (3)', 'ดีมาก (5)']) },
  { id: 3, question_text: 'คะแนนบริการ', question_type: 'scale', options_json: JSON.stringify({ min: 1, max: 5 }) },
];

function stubQuestionsQuery(ownerId = 1) {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('FROM surveys')) return [[{ id: 7 }]];
    if (sql.includes('FROM questions')) return [QUESTIONS];
    return [[]];
  };
  return () => { db.query = originalQuery; };
}

// existingExternalIds simulates rows already sitting in the DB from a prior
// import (the uq_survey_external_id unique key) — passing the same Set into
// two stubConn() calls simulates re-importing a file across two requests.
function stubConn(inserted, existingExternalIds = new Set()) {
  const originalGetConnection = db.getConnection;
  let nextResponseId = 100;
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (sql, params) => {
      if (sql.startsWith('INSERT INTO responses')) {
        const externalId = params[3];
        if (externalId != null && existingExternalIds.has(externalId)) {
          const err = new Error('Duplicate entry');
          err.code = 'ER_DUP_ENTRY';
          throw err;
        }
        if (externalId != null) existingExternalIds.add(externalId);
        const id = nextResponseId++;
        inserted.push({ id, respondent_name: params[1], overall_score: params[2], external_id: externalId });
        return [{ insertId: id }];
      }
      if (sql.startsWith('INSERT INTO response_answers')) {
        const lastResponse = inserted[inserted.length - 1];
        lastResponse.answers = params[0];
        return [{}];
      }
      return [{}];
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });
  return () => { db.getConnection = originalGetConnection; };
}

test('importCsv — rejects a caller who does not own the survey (and is not admin)', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('FROM surveys')) return [[]]; // ownership check fails
    return [[]];
  };

  const req = { params: { surveyId: '7' }, user: { id: 99, role: 'user' }, body: { headers: ['ชื่อ'], rows: [['a']] } };
  const res = mockRes();
  await ctrl.importCsv(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 404);
});

test('importCsv — rejects a malformed payload (headers/rows not arrays)', async () => {
  const restore = stubQuestionsQuery();
  const req = { params: { surveyId: '7' }, user: { id: 1, role: 'user' }, body: { headers: 'oops', rows: [] } };
  const res = mockRes();
  await ctrl.importCsv(req, res);
  restore();

  assert.equal(res.statusCode, 400);
});

test('importCsv — rejects more than 5000 rows', async () => {
  const restore = stubQuestionsQuery();
  const rows = Array.from({ length: 5001 }, () => ['x']);
  const req = { params: { surveyId: '7' }, user: { id: 1, role: 'user' }, body: { headers: ['ชื่อ'], rows } };
  const res = mockRes();
  await ctrl.importCsv(req, res);
  restore();

  assert.equal(res.statusCode, 400);
});

test('importCsv — matches columns by question text, computes scores, and inserts one response per row', async () => {
  const restoreQuery = stubQuestionsQuery();
  const inserted = [];
  const restoreConn = stubConn(inserted);

  const headers = ['ชื่อ-นามสกุล', 'ความพึงพอใจโดยรวม', 'คะแนนบริการ'];
  const rows = [
    ['สมชาย ใจดี', 'ดีมาก (5)', '4'],
    ['สมหญิง รักเรียน', 'ปานกลาง (3)', '2'],
  ];

  const req = { params: { surveyId: '7' }, user: { id: 1, role: 'user' }, body: { headers, rows } };
  const res = mockRes();
  await ctrl.importCsv(req, res);
  restoreQuery();
  restoreConn();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.imported, 2);
  assert.equal(res.body.duplicates, 0);
  assert.equal(res.body.skipped, 0);
  assert.equal(res.body.matchedColumns, 3);
  assert.equal(res.body.totalQuestions, 3);

  assert.equal(inserted.length, 2);
  assert.equal(inserted[0].respondent_name, 'สมชาย ใจดี');
  // overall_score = avg(5, 4) = 4.5
  assert.equal(inserted[0].overall_score, 4.5);
  // overall_score = avg(3, 2) = 2.5
  assert.equal(inserted[1].overall_score, 2.5);
});

test('importCsv — falls back to positional matching when a header does not match any question text', async () => {
  const restoreQuery = stubQuestionsQuery();
  const inserted = [];
  const restoreConn = stubConn(inserted);

  // None of these headers match QUESTIONS' text exactly, so all three
  // should fall back to positional matching (in question order).
  const headers = ['Name', 'Q1', 'Q2'];
  const rows = [['Tester', 'ดีมาก (5)', '3']];

  const req = { params: { surveyId: '7' }, user: { id: 1, role: 'user' }, body: { headers, rows } };
  const res = mockRes();
  await ctrl.importCsv(req, res);
  restoreQuery();
  restoreConn();

  assert.equal(res.statusCode, 200);
  // "Name" is claimed as the dedicated respondent-name column (metadata
  // only, not a question answer), leaving "Q1"/"Q2" to positionally match
  // 2 of the survey's 3 questions.
  assert.equal(res.body.matchedColumns, 2);
  assert.equal(res.body.totalQuestions, 3);
  assert.equal(res.body.imported, 1);
  assert.equal(inserted[0].respondent_name, 'Tester');
});

test('importCsv — treats id/response_id/external_id as a dedup column, not a question answer', async () => {
  const restoreQuery = stubQuestionsQuery();
  const inserted = [];
  const restoreConn = stubConn(inserted);

  const headers = ['response_id', 'ชื่อ-นามสกุล', 'ความพึงพอใจโดยรวม', 'คะแนนบริการ'];
  const rows = [['ext-001', 'สมชาย ใจดี', 'ดีมาก (5)', '4']];

  const req = { params: { surveyId: '7' }, user: { id: 1, role: 'user' }, body: { headers, rows } };
  const res = mockRes();
  await ctrl.importCsv(req, res);
  restoreQuery();
  restoreConn();

  assert.equal(res.statusCode, 200);
  // response_id isn't a question — only the other 3 columns count as matches.
  assert.equal(res.body.matchedColumns, 3);
  assert.equal(res.body.imported, 1);
  assert.equal(inserted[0].external_id, 'ext-001');
});

test('importCsv — re-importing a file that mixes already-imported rows with new ones skips the old ones', async () => {
  const restoreQuery = stubQuestionsQuery();
  const headers = ['response_id', 'ชื่อ-นามสกุล', 'ความพึงพอใจโดยรวม', 'คะแนนบริการ'];
  const seenExternalIds = new Set();

  // First import: two rows, both new.
  {
    const inserted = [];
    const restoreConn = stubConn(inserted, seenExternalIds);
    const rows = [
      ['ext-1', 'สมชาย', 'ดีมาก (5)', '4'],
      ['ext-2', 'สมหญิง', 'ปานกลาง (3)', '2'],
    ];
    const req = { params: { surveyId: '7' }, user: { id: 1, role: 'user' }, body: { headers, rows } };
    const res = mockRes();
    await ctrl.importCsv(req, res);
    restoreConn();
    assert.equal(res.body.imported, 2);
    assert.equal(res.body.duplicates, 0);
  }

  // Second import: same file plus one genuinely new row — ext-1/ext-2 must
  // be skipped as duplicates, only ext-3 should insert.
  {
    const inserted = [];
    const restoreConn = stubConn(inserted, seenExternalIds);
    const rows = [
      ['ext-1', 'สมชาย', 'ดีมาก (5)', '4'],
      ['ext-2', 'สมหญิง', 'ปานกลาง (3)', '2'],
      ['ext-3', 'สมศักดิ์', 'ดีมาก (5)', '5'],
    ];
    const req = { params: { surveyId: '7' }, user: { id: 1, role: 'user' }, body: { headers, rows } };
    const res = mockRes();
    await ctrl.importCsv(req, res);
    restoreConn();

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.imported, 1);
    assert.equal(res.body.duplicates, 2);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].external_id, 'ext-3');
  }

  restoreQuery();
});

test('importCsv — rows without any id column never dedup against each other', async () => {
  const restoreQuery = stubQuestionsQuery();
  const inserted = [];
  const restoreConn = stubConn(inserted);

  // No id/response_id/external_id column at all — every row must insert,
  // even identical-looking ones, since external_id stays NULL for all.
  const headers = ['ชื่อ-นามสกุล', 'ความพึงพอใจโดยรวม', 'คะแนนบริการ'];
  const rows = [
    ['สมชาย', 'ดีมาก (5)', '4'],
    ['สมชาย', 'ดีมาก (5)', '4'],
  ];
  const req = { params: { surveyId: '7' }, user: { id: 1, role: 'user' }, body: { headers, rows } };
  const res = mockRes();
  await ctrl.importCsv(req, res);
  restoreQuery();
  restoreConn();

  assert.equal(res.body.imported, 2);
  assert.equal(res.body.duplicates, 0);
});

test('importCsv — a row imported without an id column still gets external_id self-assigned to its own new id (regression test, so a later export/re-import can dedup it)', async () => {
  const restoreQuery = stubQuestionsQuery();
  const originalGetConnection = db.getConnection;
  const queries = [];
  let nextResponseId = 700;
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.startsWith('INSERT INTO responses')) {
        return [{ insertId: nextResponseId++ }];
      }
      return [{}];
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });

  const headers = ['ชื่อ-นามสกุล', 'ความพึงพอใจโดยรวม', 'คะแนนบริการ']; // no id/response_id/external_id column
  const rows = [['สมชาย', 'ดีมาก (5)', '4']];
  const req = { params: { surveyId: '7' }, user: { id: 1, role: 'user' }, body: { headers, rows } };
  const res = mockRes();
  await ctrl.importCsv(req, res);
  restoreQuery();
  db.getConnection = originalGetConnection;

  assert.equal(res.body.imported, 1);
  const updateQuery = queries.find(q => q.sql.startsWith('UPDATE responses SET external_id'));
  assert.ok(updateQuery, 'expected external_id to be self-assigned after an id-less insert');
  assert.deepEqual(updateQuery.params, ['700', 700]);
});

test('importCsv — rejects when no CSV column matches any question', async () => {
  const restoreQuery = stubQuestionsQuery();
  // Force zero matches: give a name column (excluded from matching) and no
  // other columns at all — nothing to match against QUESTIONS.
  const req = {
    params: { surveyId: '7' },
    user: { id: 1, role: 'user' },
    body: { headers: ['respondent_name'], rows: [['Tester']] },
  };
  const res = mockRes();
  await ctrl.importCsv(req, res);
  restoreQuery();

  assert.equal(res.statusCode, 400);
});
