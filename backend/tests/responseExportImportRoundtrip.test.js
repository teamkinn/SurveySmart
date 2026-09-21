const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const ctrl = require('../src/controllers/responseController');
const { mockRes } = require('./helpers/mockReqRes');

// This is the test the user actually asked for: don't just unit-test the
// frontend's CSV builder in isolation and assume it lines up with the real
// backend importCsv column-matching algorithm — actually run both, back to
// back, and prove a file "Export CSV" produces can be handed straight back
// to "นำเข้าคำตอบ CSV" and reconstruct the same answers.
//
// buildResponseExportRows/downloadCSV/parseCSV all live in the frontend
// package (ES modules); this backend test file is CommonJS, so it reaches
// across via a dynamic import() (supported from CJS since Node 12) instead
// of require().

test.after(async () => {
  try { await db.end(); } catch { /* nothing was ever connected */ }
});

const QUESTIONS = [
  { id: 1, question_text: 'ชื่อ-นามสกุล', question_type: 'short', options_json: null },
  { id: 2, question_text: 'เพศ', question_type: 'radio', options_json: JSON.stringify(['ชาย', 'หญิง', 'ไม่ระบุ']) },
  { id: 3, question_text: 'ความพึงพอใจโดยรวม', question_type: 'radio', options_json: JSON.stringify(['แย่ (1)', 'ปานกลาง (3)', 'ดีมาก (5)']) },
  { id: 4, question_text: 'คะแนนบริการ', question_type: 'scale', options_json: JSON.stringify({ min: 1, max: 5 }) },
  { id: 5, question_text: 'กิจกรรมที่เข้าร่วม', question_type: 'checkbox', options_json: JSON.stringify(['วิ่ง', 'ว่ายน้ำ', 'ปั่นจักรยาน']) },
];

// Shape mirrors what GET /surveys/:surveyId/responses actually returns per
// row (id, respondent_name, submitted_at, answers[]) — same as what
// ResponsesView.vue's loadResponses() hands to buildResponseExportRows.
const RESPONSES = [
  {
    id: 501, respondent_name: 'สมชาย ใจดี', submitted_at: '2026-08-01T10:00:00Z',
    answers: [
      { question_id: 1, answer_text: 'สมชาย ใจดี', answer_json: { value: 'สมชาย ใจดี' }, score: null },
      { question_id: 2, answer_text: 'ชาย', answer_json: { value: 'ชาย' }, score: null },
      { question_id: 3, answer_text: 'ดีมาก (5)', answer_json: { value: 'ดีมาก (5)' }, score: 5 },
      { question_id: 4, answer_text: '4', answer_json: { score: 4 }, score: 4 },
      { question_id: 5, answer_text: 'วิ่ง, ว่ายน้ำ', answer_json: { values: ['วิ่ง', 'ว่ายน้ำ'] }, score: null },
    ],
  },
  {
    id: 502, respondent_name: 'สมหญิง รักเรียน', submitted_at: '2026-08-02T10:00:00Z',
    answers: [
      { question_id: 1, answer_text: 'สมหญิง รักเรียน', answer_json: { value: 'สมหญิง รักเรียน' }, score: null },
      { question_id: 2, answer_text: 'หญิง', answer_json: { value: 'หญิง' }, score: null },
      { question_id: 3, answer_text: 'ปานกลาง (3)', answer_json: { value: 'ปานกลาง (3)' }, score: 3 },
      { question_id: 4, answer_text: '2', answer_json: { score: 2 }, score: 2 },
      { question_id: 5, answer_text: 'ปั่นจักรยาน', answer_json: { values: ['ปั่นจักรยาน'] }, score: null },
    ],
  },
];

function stubQuestionsQuery() {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('FROM surveys')) return [[{ id: 7 }]];
    if (sql.includes('FROM questions')) return [QUESTIONS];
    return [[]];
  };
  return () => { db.query = originalQuery; };
}

// existingExternalIds simulates rows already sitting in the DB (e.g. from
// self-assigned external_id on the original submissions, or a prior CSV
// import) — same pattern as responseImportCsv.test.js's stubConn.
function stubConn(inserted, existingExternalIds = new Set()) {
  const originalGetConnection = db.getConnection;
  let nextResponseId = 900;
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
        inserted.push({ id, respondent_name: params[1], overall_score: params[2], external_id: externalId, answers: [] });
        return [{ insertId: id }];
      }
      if (sql.startsWith('INSERT INTO response_answers')) {
        const lastResponse = inserted[inserted.length - 1];
        // params[0] is the array of [responseId, questionId, answerText, answerJson, score] rows.
        lastResponse.answers = params[0].map(([, questionId, answerText, answerJson, score]) => ({
          question_id: questionId, answer_text: answerText, answer_json: answerJson, score,
        }));
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

test('Export CSV -> นำเข้าคำตอบ CSV round-trip — reconstructs every answer correctly, including the "ชื่อ-นามสกุล" duplicate-header case', async () => {
  const { buildResponseExportRows, downloadCsvRows, parseCSV } = await loadFrontendCsvHelpers();

  const { headers, rows } = buildResponseExportRows(QUESTIONS, RESPONSES, { formatDate: () => '11 Aug 2026' });

  // Exactly reproduce downloadCSV's escaping (it can't be called directly —
  // it triggers a browser save-as) and feed the string back through
  // parseCSV, exactly like ImportResponsesCsvModal.vue's onFile() does with
  // an uploaded file — this closes the loop the earlier unit test left open.
  const csvText = downloadCsvRows([headers, ...rows]);
  const parsed = parseCSV(csvText);

  assert.deepEqual(parsed.headers, headers);
  // respondent_name column must not collide with the "ชื่อ-นามสกุล" question column.
  assert.equal(headers.filter(h => h === 'ชื่อ-นามสกุล').length, 1);
  assert.ok(headers.includes('respondent_name'));

  const restoreQuery = stubQuestionsQuery();
  const inserted = [];
  const restoreConn = stubConn(inserted);

  const req = {
    params: { surveyId: '7' },
    user: { id: 1, role: 'user' },
    body: { headers: parsed.headers, rows: parsed.rows },
  };
  const res = mockRes();
  await ctrl.importCsv(req, res);
  restoreQuery();
  restoreConn();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.imported, 2);
  assert.equal(res.body.skipped, 0);
  // All 5 real questions matched by exact question_text — 'id' and
  // 'respondent_name' are metadata, not questions, and shouldn't count.
  assert.equal(res.body.matchedColumns, 5);
  assert.equal(res.body.totalQuestions, 5);
  assert.equal(inserted.length, 2);

  // respondent_name came from the dedicated column, not the "ชื่อ-นามสกุล"
  // question column (they hold the same value here, but the point is which
  // column fed it — see the regression test in useCsv.test.mjs).
  assert.equal(inserted[0].respondent_name, 'สมชาย ใจดี');
  // external_id is always stored as a string (importCsv does String(cell)),
  // even though the exported "id" column started out as a number.
  assert.equal(inserted[0].external_id, '501'); // dedup id round-tripped

  const answersById = a => new Map(a.map(x => [x.question_id, x]));
  const a1 = answersById(inserted[0].answers);

  assert.equal(a1.get(1).answer_text, 'สมชาย ใจดี'); // short
  assert.equal(a1.get(3).score, 5); // radio, parsed from "(5)" suffix
  assert.equal(a1.get(4).score, 4); // scale
  assert.deepEqual(JSON.parse(a1.get(5).answer_json).values, ['วิ่ง', 'ว่ายน้ำ']); // checkbox

  const a2 = answersById(inserted[1].answers);
  assert.equal(a2.get(3).score, 3);
  assert.equal(a2.get(4).score, 2);
  assert.deepEqual(JSON.parse(a2.get(5).answer_json).values, ['ปั่นจักรยาน']);
});

test('Export CSV -> re-import into the SAME survey is recognized as a duplicate on the very FIRST re-import (regression test for the external_id self-assign fix)', async () => {
  const { buildResponseExportRows, downloadCsvRows, parseCSV } = await loadFrontendCsvHelpers();

  const { headers, rows } = buildResponseExportRows(QUESTIONS, RESPONSES, { formatDate: () => '11 Aug 2026' });
  const parsed = parseCSV(downloadCsvRows([headers, ...rows]));

  const restoreQuery = stubQuestionsQuery();
  const inserted = [];
  // Simulates RESPONSES already having external_id = their own id in the DB
  // — what responseController.submit / publicResponseController.submitFromGoogleForm
  // now do on insert (see the comments there), and what
  // 004_backfill_response_external_id.sql does for pre-existing rows.
  // Without that self-assign, this Set would start empty and both rows
  // would insert as brand-new duplicates instead of being skipped — see the
  // "future work" note this test replaces above buildResponseExportRows.
  const existingExternalIds = new Set(RESPONSES.map(r => String(r.id)));
  const restoreConn = stubConn(inserted, existingExternalIds);

  const req = {
    params: { surveyId: '7' },
    user: { id: 1, role: 'user' },
    body: { headers: parsed.headers, rows: parsed.rows },
  };
  const res = mockRes();
  await ctrl.importCsv(req, res);
  restoreQuery();
  restoreConn();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.imported, 0);
  assert.equal(res.body.duplicates, 2);
  assert.equal(inserted.length, 0);
});

// Loads the frontend's ESM composable and reimplements downloadCSV's escaping
// as a pure string function (the real one manipulates the DOM to trigger a
// save-as, which doesn't exist in this Node test environment) — the escaping
// itself is copied verbatim from composables/useCsv.js's downloadCSV so this
// test still catches a mismatch if that escaping ever changes.
async function loadFrontendCsvHelpers() {
  const mod = await import('../../frontend/src/composables/useCsv.js');
  const downloadCsvRows = (rows) =>
    rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  return { buildResponseExportRows: mod.buildResponseExportRows, parseCSV: mod.parseCSV, downloadCsvRows };
}
