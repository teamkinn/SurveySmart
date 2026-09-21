const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const ctrl = require('../src/controllers/responseController');
const { mockRes } = require('./helpers/mockReqRes');

test.after(async () => {
  try { await db.end(); } catch { /* nothing was ever connected */ }
});

// Regression coverage for the survey-37 incident: a radio question whose
// options are authored best-first ("มากที่สุด" ... "น้อยที่สุด" — the
// standard Thai ก.พ.ร. layout) with plain labels (no "(n)" suffix). The old
// importCsv scored these by the option's ARRAY POSITION, which silently
// inverted every score for this exact ordering. See utils/likertScore.js.
const QUESTIONS = [
  { id: 1, question_text: 'ชื่อ-นามสกุล', question_type: 'short', options_json: null },
  {
    id: 2,
    question_text: '1.โครงการนี้ช่วยให้เกิดความรัก ในระดับใด',
    question_type: 'radio',
    options_json: JSON.stringify(['มากที่สุด', 'มาก', 'ปานกลาง', 'น้อย', 'น้อยที่สุด']),
  },
  {
    id: 3,
    question_text: 'ข้อเสนอแนะอื่นๆ (โปรดระบุ)',
    question_type: 'radio',
    options_json: JSON.stringify(['ตัวเลือก A', 'ตัวเลือก B']),
  },
];

function stubQuestionsQuery() {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('FROM surveys')) return [[{ id: 37 }]];
    if (sql.includes('FROM questions')) return [QUESTIONS];
    return [[]];
  };
  return () => { db.query = originalQuery; };
}

function stubConn(inserted) {
  const originalGetConnection = db.getConnection;
  let nextResponseId = 1;
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (sql, params) => {
      if (sql.startsWith('INSERT INTO responses')) {
        const id = nextResponseId++;
        inserted.push({ id, respondent_name: params[1], overall_score: params[2], answers: [] });
        return [{ insertId: id }];
      }
      if (sql.startsWith('INSERT INTO response_answers')) {
        const lastResponse = inserted[inserted.length - 1];
        lastResponse.answers = params[0].map(([, questionId, answerText, answerJson, score]) => ({ question_id: questionId, answer_text: answerText, score }));
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

test('importCsv — a best-first-ordered Likert radio question scores "มากที่สุด" as 5, not 1 (regression test for survey #37)', async () => {
  const restoreQuery = stubQuestionsQuery();
  const inserted = [];
  const restoreConn = stubConn(inserted);

  const headers = ['ชื่อ-นามสกุล', '1.โครงการนี้ช่วยให้เกิดความรัก ในระดับใด'];
  const rows = [
    ['สมชาย', 'มากที่สุด'],
    ['สมหญิง', 'มาก'],
  ];

  const req = { params: { surveyId: '37' }, user: { id: 1, role: 'user' }, body: { headers, rows } };
  const res = mockRes();
  await ctrl.importCsv(req, res);
  restoreQuery();
  restoreConn();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.imported, 2);
  assert.equal(res.body.unscoredChoiceCells, 0);

  const q2Answer = r => r.answers.find(a => a.question_id === 2);
  assert.equal(q2Answer(inserted[0]).score, 5, '"มากที่สุด" must score 5, the HIGH end — not 1 from its array position');
  assert.equal(q2Answer(inserted[1]).score, 4, '"มาก" must score 4');
  assert.equal(inserted[0].overall_score, 5);
  assert.equal(inserted[1].overall_score, 4);
});

test('importCsv — an unrecognized choice label (no "(n)" suffix, not in the Likert dictionary) is imported but left unscored, and counted in unscoredChoiceCells', async () => {
  const restoreQuery = stubQuestionsQuery();
  const inserted = [];
  const restoreConn = stubConn(inserted);

  const headers = ['ชื่อ-นามสกุล', 'ข้อเสนอแนะอื่นๆ (โปรดระบุ)'];
  const rows = [['สมชาย', 'ตัวเลือก A']];

  const req = { params: { surveyId: '37' }, user: { id: 1, role: 'user' }, body: { headers, rows } };
  const res = mockRes();
  await ctrl.importCsv(req, res);
  restoreQuery();
  restoreConn();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.imported, 1);
  // "ตัวเลือก A" is neither an explicit "(n)"-suffixed label nor a
  // recognized Likert phrase — must be left unscored (not guessed from its
  // position, which used to silently score it as 1).
  const q3Answer = inserted[0].answers.find(a => a.question_id === 3);
  assert.equal(q3Answer.score, null);
  assert.equal(q3Answer.answer_text, 'ตัวเลือก A');
  assert.equal(res.body.unscoredChoiceCells, 1);
  // No scoreable answers at all in this row -> overall_score stays null,
  // not 0 or some guessed value.
  assert.equal(inserted[0].overall_score, null);
});

test('importCsv — an explicit "(n)" score suffix still wins even when the label also happens to be a recognized Likert word', async () => {
  const restoreQuery = stubQuestionsQuery();
  const inserted = [];
  const restoreConn = stubConn(inserted);

  const headers = ['ชื่อ-นามสกุล', '1.โครงการนี้ช่วยให้เกิดความรัก ในระดับใด'];
  const rows = [['สมชาย', 'มากที่สุด (10)']]; // author explicitly overrides the usual 1-5 scale

  const req = { params: { surveyId: '37' }, user: { id: 1, role: 'user' }, body: { headers, rows } };
  const res = mockRes();
  await ctrl.importCsv(req, res);
  restoreQuery();
  restoreConn();

  const q2Answer = inserted[0].answers.find(a => a.question_id === 2);
  assert.equal(q2Answer.score, 10);
});
