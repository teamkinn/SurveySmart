const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const { extractResponseAnswers } = require('../src/services/googleFormsSync');

test.after(async () => {
  try { await db.end(); } catch { /* nothing was ever connected */ }
});

test('extractResponseAnswers — a best-first-ordered radio question scores "มากที่สุด" as 5, not 1 (regression test, googleFormsSync counterpart to the CSV-import fix)', () => {
  const qIdMap = {
    g1: { localId: 1, type: 'radio', options: ['มากที่สุด', 'มาก', 'ปานกลาง', 'น้อย', 'น้อยที่สุด'] },
  };
  const resp = { answers: { g1: { textAnswers: { answers: [{ value: 'มากที่สุด' }] } } } };

  const { finalAnswers, overall } = extractResponseAnswers(resp, qIdMap);

  assert.equal(finalAnswers.length, 1);
  assert.equal(finalAnswers[0].score, 5, '"มากที่สุด" must score 5 — not 1 from its position in qInfo.options');
  assert.equal(overall, 5);
});

test('extractResponseAnswers — an mcgrid row scores its column label by the Likert dictionary, not the column\'s index in cols', () => {
  // Two grid rows both answered "มากที่สุด" (col index 0 in a best-first
  // layout) — the old code would have averaged to 1, not 5.
  const qIdMap = {
    r1: { localId: 5, type: 'mcgrid', isGridRow: true, rowLabel: 'ข้อ 1', cols: ['มากที่สุด', 'มาก', 'ปานกลาง', 'น้อย', 'น้อยที่สุด'] },
    r2: { localId: 5, type: 'mcgrid', isGridRow: true, rowLabel: 'ข้อ 2', cols: ['มากที่สุด', 'มาก', 'ปานกลาง', 'น้อย', 'น้อยที่สุด'] },
  };
  const resp = {
    answers: {
      r1: { textAnswers: { answers: [{ value: 'มากที่สุด' }] } },
      r2: { textAnswers: { answers: [{ value: 'มาก' }] } },
    },
  };

  const { finalAnswers, overall } = extractResponseAnswers(resp, qIdMap);

  assert.equal(finalAnswers.length, 1);
  assert.equal(finalAnswers[0].localId, 5);
  // (5 + 4) / 2 = 4.5, not (1 + 2) / 2 = 1.5 from the old position-based guess.
  assert.equal(finalAnswers[0].score, 4.5);
  assert.equal(overall, 4.5);
});

test('extractResponseAnswers — an unrecognized radio label (no dictionary match, no "(n)" suffix) is left unscored rather than guessed', () => {
  const qIdMap = {
    g1: { localId: 1, type: 'radio', options: ['สมชาย ใจดี', 'สมหญิง รักเรียน'] }, // free-text-like options, not a Likert scale
  };
  const resp = { answers: { g1: { textAnswers: { answers: [{ value: 'สมชาย ใจดี' }] } } } };

  const { finalAnswers, overall } = extractResponseAnswers(resp, qIdMap);

  assert.equal(finalAnswers[0].score, null);
  assert.equal(overall, null);
});

test('extractResponseAnswers — an explicit "(n)" suffix on a radio label still wins', () => {
  const qIdMap = {
    g1: { localId: 1, type: 'radio', options: ['แย่ (1)', 'ปานกลาง (3)', 'ดีมาก (5)'] },
  };
  const resp = { answers: { g1: { textAnswers: { answers: [{ value: 'ดีมาก (5)' }] } } } };

  const { finalAnswers } = extractResponseAnswers(resp, qIdMap);
  assert.equal(finalAnswers[0].score, 5);
});
