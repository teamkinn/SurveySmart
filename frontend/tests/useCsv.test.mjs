// Node's built-in test runner, run directly against the ES module — no
// bundler needed since this composable is plain, framework-free JavaScript.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, parseXLSX, buildResponseExportRows, inferQuestionsFromResponseExport } from '../src/composables/useCsv.js';
import * as XLSX from 'xlsx';

test('parseCSV — parses a simple header + rows', () => {
  const { headers, rows } = parseCSV('a,b,c\n1,2,3\n4,5,6');
  assert.deepEqual(headers, ['a', 'b', 'c']);
  assert.deepEqual(rows, [['1', '2', '3'], ['4', '5', '6']]);
});

test('parseCSV — handles quoted fields with embedded commas and escaped quotes', () => {
  const { headers, rows } = parseCSV('name,note\n"Somchai, Jr.","He said ""hi"""');
  assert.deepEqual(headers, ['name', 'note']);
  assert.deepEqual(rows, [['Somchai, Jr.', 'He said "hi"']]);
});

test('parseCSV — handles a newline embedded inside a quoted field', () => {
  const { headers, rows } = parseCSV('name,note\n"Somchai","line1\nline2"');
  assert.deepEqual(rows, [['Somchai', 'line1\nline2']]);
});

test('parseCSV — strips a leading UTF-8 BOM', () => {
  const { headers } = parseCSV('﻿a,b\n1,2');
  assert.deepEqual(headers, ['a', 'b']);
});

test('parseCSV — handles CRLF line endings', () => {
  const { headers, rows } = parseCSV('a,b\r\n1,2\r\n3,4');
  assert.deepEqual(headers, ['a', 'b']);
  assert.deepEqual(rows, [['1', '2'], ['3', '4']]);
});

test('parseCSV — drops a trailing blank row from a trailing newline', () => {
  const { rows } = parseCSV('a,b\n1,2\n');
  assert.equal(rows.length, 1);
});

test('parseCSV — empty input returns empty headers/rows', () => {
  assert.deepEqual(parseCSV(''), { headers: [], rows: [] });
  assert.deepEqual(parseCSV('   '.trim()), { headers: [], rows: [] });
});

// buildResponseExportRows — Export CSV / Import CSV format parity
//
// Mirrors the QUESTIONS fixture in backend/tests/responseImportCsv.test.js
// (same ids, text, and types) so these two test suites are effectively
// asserting the same contract from opposite ends: this file proves Export
// CSV *produces* headers/cells in the shape importCsv expects, and the
// backend suite proves importCsv *consumes* that exact shape correctly.
const QUESTIONS = [
  { id: 1, question_text: 'ชื่อ-นามสกุล', question_type: 'short' },
  { id: 2, question_text: 'ความพึงพอใจโดยรวม', question_type: 'radio' },
  { id: 3, question_text: 'คะแนนบริการ', question_type: 'scale' },
  { id: 4, question_text: 'กิจกรรมที่เข้าร่วม', question_type: 'checkbox' },
];

test('buildResponseExportRows — headers are the id/name metadata columns plus exact question_text per question', () => {
  const { headers } = buildResponseExportRows(QUESTIONS, []);
  assert.deepEqual(headers, [
    'id', 'respondent_name', 'ชื่อ-นามสกุล', 'ความพึงพอใจโดยรวม', 'คะแนนบริการ', 'กิจกรรมที่เข้าร่วม', 'วันที่ส่ง',
  ]);
});

test('buildResponseExportRows — the metadata name column is headed "respondent_name", not "ชื่อ...", so it never collides with (and gets swapped for) a real question literally titled "ชื่อ-นามสกุล" — regression test for the duplicate-header bug found 2026-08-11', () => {
  const { headers } = buildResponseExportRows(QUESTIONS, []);
  const nameColIdx = headers.indexOf('respondent_name');
  const realQuestionColIdx = headers.indexOf('ชื่อ-นามสกุล'); // QUESTIONS[0]'s own column
  assert.notEqual(nameColIdx, -1);
  assert.notEqual(realQuestionColIdx, -1);
  assert.notEqual(nameColIdx, realQuestionColIdx);
  // Only one column may be headed exactly "ชื่อ-นามสกุล" (the question's own).
  assert.equal(headers.filter(h => h === 'ชื่อ-นามสกุล').length, 1);
});

test('buildResponseExportRows — scale/star cells are the plain numeric score, not display text', () => {
  const responses = [{
    id: 100, respondent_name: 'สมชาย', submitted_at: '2026-08-01T00:00:00Z',
    answers: [{ question_id: 3, answer_text: '4', answer_json: { score: 4 }, score: 4 }],
  }];
  const { headers, rows } = buildResponseExportRows(QUESTIONS, responses, { formatDate: () => '' });
  const scaleCol = headers.indexOf('คะแนนบริการ');
  assert.equal(rows[0][scaleCol], '4');
});

test('buildResponseExportRows — radio cell is the raw answer_text (e.g. "ดีมาก (5)"), matching importCsv\'s score-suffix parsing', () => {
  const responses = [{
    id: 101, respondent_name: 'สมหญิง', submitted_at: '2026-08-01T00:00:00Z',
    answers: [{ question_id: 2, answer_text: 'ดีมาก (5)', answer_json: { value: 'ดีมาก (5)' }, score: 5 }],
  }];
  const { headers, rows } = buildResponseExportRows(QUESTIONS, responses, { formatDate: () => '' });
  const radioCol = headers.indexOf('ความพึงพอใจโดยรวม');
  assert.equal(rows[0][radioCol], 'ดีมาก (5)');
});

test('buildResponseExportRows — checkbox cells are semicolon-joined (importCsv splits on ";", not ", ")', () => {
  const responses = [{
    id: 102, respondent_name: 'สมศักดิ์', submitted_at: '2026-08-01T00:00:00Z',
    answers: [{
      question_id: 4,
      answer_text: 'วิ่ง, ว่ายน้ำ', // display join used by SurveyFillView.vue — must NOT leak into the export cell
      answer_json: { values: ['วิ่ง', 'ว่ายน้ำ'] },
      score: null,
    }],
  }];
  const { headers, rows } = buildResponseExportRows(QUESTIONS, responses, { formatDate: () => '' });
  const cbCol = headers.indexOf('กิจกรรมที่เข้าร่วม');
  assert.equal(rows[0][cbCol], 'วิ่ง;ว่ายน้ำ');
});

test('buildResponseExportRows — id column carries the response\'s own db id, for idempotent re-import dedup', () => {
  const responses = [{ id: 42, respondent_name: 'Tester', submitted_at: null, answers: [] }];
  const { headers, rows } = buildResponseExportRows(QUESTIONS, responses, { formatDate: () => '' });
  assert.equal(rows[0][headers.indexOf('id')], 42);
});

test('buildResponseExportRows — a question with no answer on a given response exports an empty cell, not an error', () => {
  const responses = [{ id: 200, respondent_name: 'ไม่ระบุ', submitted_at: null, answers: [] }];
  const { rows } = buildResponseExportRows(QUESTIONS, responses, { formatDate: () => '' });
  assert.deepEqual(rows[0].slice(2, 6), ['', '', '', '']);
});

test('buildResponseExportRows — round-trips through parseCSV/downloadCSV escaping unchanged', () => {
  const responses = [{
    id: 1, respondent_name: 'Comma, "Quoted" Name', submitted_at: null,
    answers: [{ question_id: 2, answer_text: 'ปานกลาง (3)', answer_json: { value: 'ปานกลาง (3)' }, score: 3 }],
  }];
  const { headers, rows } = buildResponseExportRows(QUESTIONS, responses, { formatDate: () => '2026-08-11' });
  // Reproduce downloadCSV's exact escaping (it's a browser-only function —
  // triggers a save-as — so it isn't called directly here) and feed the
  // result back through parseCSV to confirm nothing is lost or corrupted.
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const parsed = parseCSV(csv);
  assert.deepEqual(parsed.headers, headers);
  assert.deepEqual(parsed.rows[0].map(String), rows[0].map(String));
});

// inferQuestionsFromResponseExport — lets ImportCsvModal.vue's "create a new
// survey from a file" flow accept ANY tabular file that isn't a
// question_text/question_type structure file: a file "Export CSV" produced
// (recognized by its id/respondent_name/วันที่ส่ง metadata columns) is one
// case, but a plain data file with none of those columns is now inferred
// from too — every header just becomes a question.
test('inferQuestionsFromResponseExport — a plain file with no metadata columns still infers a question per column', () => {
  const { headers, rows } = { headers: ['foo', 'bar'], rows: [['1', '2']] };
  const questions = inferQuestionsFromResponseExport(headers, rows);
  assert.deepEqual(questions.map(q => q.text), ['foo', 'bar']);
});

test('inferQuestionsFromResponseExport — returns null when every column is a metadata column (nothing left to ask)', () => {
  const headers = ['id', 'respondent_name', 'วันที่ส่ง'];
  const rows = [['1', 'สมชาย', '11 Aug 2026']];
  assert.equal(inferQuestionsFromResponseExport(headers, rows), null);
});

test('inferQuestionsFromResponseExport — returns null for a completely empty header row', () => {
  assert.equal(inferQuestionsFromResponseExport([], []), null);
});

test('inferQuestionsFromResponseExport — excludes id/respondent_name/วันที่ส่ง, keeps every other column as a question', () => {
  const headers = ['id', 'respondent_name', 'ชื่อ-นามสกุล', 'ความคิดเห็น', 'วันที่ส่ง'];
  const rows = [['1', 'สมชาย', 'สมชาย', 'ok', '11 Aug 2026']];
  const questions = inferQuestionsFromResponseExport(headers, rows);
  assert.deepEqual(questions.map(q => q.text), ['ชื่อ-นามสกุล', 'ความคิดเห็น']);
});

test('inferQuestionsFromResponseExport — a column of plain numbers infers as scale with sensible min/max', () => {
  const headers = ['id', 'respondent_name', 'คะแนนบริการ'];
  const rows = [['1', 'A', '4'], ['2', 'B', '2'], ['3', 'C', '5']];
  const [q] = inferQuestionsFromResponseExport(headers, rows);
  assert.equal(q.type, 'scale');
  assert.equal(q.options.min, 1);
  assert.equal(q.options.max, 5);
});

test('inferQuestionsFromResponseExport — a column with ";" in it infers as checkbox with the union of split values as options', () => {
  const headers = ['id', 'respondent_name', 'กิจกรรม'];
  const rows = [['1', 'A', 'วิ่ง;ว่ายน้ำ'], ['2', 'B', 'ปั่นจักรยาน']];
  const [q] = inferQuestionsFromResponseExport(headers, rows);
  assert.equal(q.type, 'checkbox');
  assert.deepEqual(new Set(q.options), new Set(['วิ่ง', 'ว่ายน้ำ', 'ปั่นจักรยาน']));
});

test('inferQuestionsFromResponseExport — a small repeated set of text answers infers as radio', () => {
  const headers = ['id', 'respondent_name', 'เพศ'];
  const rows = [['1', 'A', 'ชาย'], ['2', 'B', 'หญิง'], ['3', 'C', 'ชาย'], ['4', 'D', 'หญิง']];
  const [q] = inferQuestionsFromResponseExport(headers, rows);
  assert.equal(q.type, 'radio');
  assert.deepEqual(new Set(q.options), new Set(['ชาย', 'หญิง']));
});

test('inferQuestionsFromResponseExport — free text (every value distinct) falls back to short, not radio', () => {
  const headers = ['id', 'respondent_name', 'ข้อเสนอแนะ'];
  const rows = [['1', 'A', 'ดีมาก'], ['2', 'B', 'ควรปรับปรุงเรื่องเวลา'], ['3', 'C', 'พอใจ']];
  const [q] = inferQuestionsFromResponseExport(headers, rows);
  assert.equal(q.type, 'short');
  assert.equal(q.options, null);
});

test('inferQuestionsFromResponseExport — free text where most people answer with the same short placeholder ("-") still falls back to short, not radio, even though that collapses distinct values into radio\'s 2-8 range', () => {
  // Regression test: 5 respondents just wrote "-" (no comment) and the
  // other 7 each wrote a unique, long, full-sentence answer. That's 8
  // distinct values out of 12 total — inside the old radio heuristic's
  // "2 to 8 distinct, fewer than the row count" window — even though this
  // is plainly an open-ended comment column, not a fixed-choice one.
  const headers = ['id', 'respondent_name', 'ข้อเสนอแนะเพิ่มเติม'];
  const placeholderRows = Array.from({ length: 5 }, (_, i) => [String(i + 1), `P${i + 1}`, '-']);
  const uniqueAnswers = [
    'ดีครับ',
    'การสร้างจิตสำนึกของประชาชนเป็นเรื่องยาก ต้องเน้นสร้างผู้นำท้องถิ่นให้เป็นต้นแบบแก่ประชาชนในชุมชนอย่างจริงจัง',
    '🎉',
    'เป็นโครงการที่ดีมากๆ',
    'ไม่มี',
    'วิชาการมากเกินไปทำให้ งงๆไปบ้าง',
    'ขอบคุณ อบจ. ขอบคุณ อาจารย์ และผู้ร่วมโครงการ ทุกท่าน',
  ];
  const uniqueRows = uniqueAnswers.map((text, i) => [String(i + 6), `U${i + 1}`, text]);
  const rows = [...placeholderRows, ...uniqueRows];
  const [q] = inferQuestionsFromResponseExport(headers, rows);
  assert.equal(q.type, 'short');
  assert.equal(q.options, null);
});

// --- parseXLSX -------------------------------------------------------

// Builds an in-memory .xlsx workbook (as parseXLSX itself consumes: an
// ArrayBuffer, the same thing readSpreadsheetFile() gets back from
// FileReader#readAsArrayBuffer on a real upload) from a plain array-of-arrays,
// so these tests exercise the real SheetJS read path rather than
// hand-constructing sheet objects.
function buildXlsxArrayBuffer(aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

test('parseXLSX — parses a simple header + rows into the same shape as parseCSV', () => {
  const buf = buildXlsxArrayBuffer([['a', 'b', 'c'], [1, 2, 3], [4, 5, 6]]);
  const { headers, rows } = parseXLSX(buf);
  assert.deepEqual(headers, ['a', 'b', 'c']);
  assert.deepEqual(rows, [['1', '2', '3'], ['4', '5', '6']]);
});

test('parseXLSX — every cell comes back as a string, matching parseCSV (numbers included)', () => {
  const buf = buildXlsxArrayBuffer([['section', 'scale_min', 'scale_max'], [1, 1, 5]]);
  const { rows } = parseXLSX(buf);
  rows[0].forEach(cell => assert.equal(typeof cell, 'string'));
  assert.deepEqual(rows, [['1', '1', '5']]);
});

test('parseXLSX — short rows are padded with empty strings to match the header width', () => {
  const buf = buildXlsxArrayBuffer([['a', 'b', 'c'], ['x', 'y']]);
  const { rows } = parseXLSX(buf);
  assert.deepEqual(rows, [['x', 'y', '']]);
});

test('parseXLSX — drops a fully-empty trailing row, matching parseCSV', () => {
  const buf = buildXlsxArrayBuffer([['a', 'b'], ['1', '2'], ['', '']]);
  const { rows } = parseXLSX(buf);
  assert.deepEqual(rows, [['1', '2']]);
});

test('parseXLSX — a completely empty sheet returns empty headers/rows', () => {
  const buf = buildXlsxArrayBuffer([]);
  assert.deepEqual(parseXLSX(buf), { headers: [], rows: [] });
});

