const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const ctrl = require('../src/controllers/publicResponseController');
const { mockRes } = require('./helpers/mockReqRes');

test.after(async () => {
  try { await db.end(); } catch { /* nothing was ever connected */ }
});

const QUESTIONS = [
  { id: 1, question_type: 'radio' },
];

function stubConn(inserted) {
  const originalGetConnection = db.getConnection;
  let nextResponseId = 1;
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (sql, params) => {
      if (sql.includes('FROM surveys')) return [[{ id: 37 }]];
      if (sql.includes('FROM questions')) return [QUESTIONS];
      if (sql.startsWith('INSERT INTO responses')) {
        const id = nextResponseId++;
        inserted.push({ id, overall_score: params[2], answers: [] });
        return [{ insertId: id }];
      }
      if (sql.startsWith('UPDATE responses SET external_id')) return [{}];
      if (sql.startsWith('INSERT INTO response_answers')) {
        inserted[inserted.length - 1].answers = params[0].map(([, questionId, answerText, answerJson, score]) => ({ question_id: questionId, answer_text: answerText, score }));
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

test('submitFromGoogleForm — a plain Likert label with no "(n)" suffix is now scored via the shared dictionary (previously left unscored)', async () => {
  const inserted = [];
  const restoreConn = stubConn(inserted);

  const req = {
    params: { formId: 'form-1' },
    body: { respondent_name: 'สมชาย', answers: [{ answer_text: 'มากที่สุด' }] },
  };
  const res = mockRes();
  await ctrl.submitFromGoogleForm(req, res);
  restoreConn();

  assert.equal(res.statusCode, 201);
  assert.equal(inserted[0].overall_score, 5);
  assert.equal(inserted[0].answers[0].score, 5);
});

test('submitFromGoogleForm — a "dropdown" question\'s score is included in overall_score (regression test: it used to be stored per-answer but silently excluded from the average, which only recognized "radio")', async () => {
  const originalGetConnection = db.getConnection;
  let nextResponseId = 1;
  const inserted = [];
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (sql, params) => {
      if (sql.includes('FROM surveys')) return [[{ id: 37 }]];
      if (sql.includes('FROM questions')) return [[{ id: 1, question_type: 'dropdown' }]];
      if (sql.startsWith('INSERT INTO responses')) {
        const id = nextResponseId++;
        inserted.push({ id, overall_score: params[2], answers: [] });
        return [{ insertId: id }];
      }
      if (sql.startsWith('UPDATE responses SET external_id')) return [{}];
      if (sql.startsWith('INSERT INTO response_answers')) {
        inserted[inserted.length - 1].answers = params[0].map(([, questionId, answerText, answerJson, score]) => ({ question_id: questionId, score }));
        return [{}];
      }
      return [{}];
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });

  const req = {
    params: { formId: 'form-1' },
    body: { respondent_name: 'สมหญิง', answers: [{ answer_text: 'มากที่สุด' }] },
  };
  const res = mockRes();
  await ctrl.submitFromGoogleForm(req, res);
  db.getConnection = originalGetConnection;

  assert.equal(res.statusCode, 201);
  assert.equal(inserted[0].answers[0].score, 5, 'the per-answer score must still be stored');
  assert.equal(inserted[0].overall_score, 5, 'overall_score must include the dropdown answer, not silently drop it');
});
