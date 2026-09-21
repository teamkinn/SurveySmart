// Minimal, dependency-free RFC4180-ish CSV parser/writer shared by the
// survey-structure import, the responses import, and (potentially) any
// future CSV export that needs to round-trip through the same format.
//
// Handles: quoted fields, "" as an escaped quote inside a quoted field,
// commas/newlines embedded inside quoted fields, and CRLF/LF/CR line
// endings. Strips a leading UTF-8 BOM, since both Excel-exported CSVs and
// SurveySmart's own Export CSV write one.
//
// .xlsx/.xls support (parseXLSX/readSpreadsheetFile below) is layered on
// top of this same module rather than living separately, specifically so
// every caller keeps consuming the one { headers, rows } shape this parser
// already produces — CSV and Excel uploads become indistinguishable to
// ImportCsvModal.vue/ImportResponsesCsvModal.vue and to the backend (which
// only ever sees the already-parsed table, see responseController.importCsv)
// the moment readSpreadsheetFile() resolves.
import * as XLSX from 'xlsx';

export function parseCSV(text) {
  if (!text) return { headers: [], rows: [] };
  // Strip BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const table = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); table.push(row); row = []; };

  while (i < len) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }

    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { pushField(); i++; continue; }
    if (c === '\r') {
      if (text[i + 1] === '\n') i++;
      pushRow(); i++; continue;
    }
    if (c === '\n') { pushRow(); i++; continue; }
    field += c; i++;
  }
  // Final field/row, if the file didn't end with a newline.
  if (field !== '' || row.length) pushRow();

  // Drop fully-empty trailing rows (common with a trailing newline).
  while (table.length && table[table.length - 1].every(c => c === '')) table.pop();

  if (!table.length) return { headers: [], rows: [] };
  const [headers, ...rows] = table;
  return { headers: headers.map(h => h.trim()), rows };
}

// Parses the first sheet of an .xlsx/.xls workbook (already loaded into an
// ArrayBuffer) into the exact same { headers, rows } shape parseCSV()
// returns. Every cell is coerced to a string: parseCSV's output is always
// strings (raw CSV text has no notion of a "number" cell), and every
// downstream consumer — the question-type/options parsing in
// ImportCsvModal.vue, the column matching in
// responseController.importCsv — calls .trim()/parseInt/parseFloat
// straight on a cell assuming exactly that. SheetJS otherwise hands back
// native JS numbers/Dates for numeric/date cells, which lack .trim() and
// would throw the moment any of that downstream code touched one.
export function parseXLSX(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  // header:1 -> array-of-arrays (not "guess the header row and key by it"),
  // matching parseCSV's own "first row is the header" contract exactly.
  // raw:false renders each cell through its own display format, so e.g. a
  // date cell reads back "2026-08-11" rather than the underlying serial
  // number 46245 — the same text a person would see typing the sheet into
  // a CSV by hand. defval:'' fills gaps from short/sparse rows instead of
  // leaving them missing, so every row stays the same length as headers.
  const table = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' });
  const rows = table.map(r => r.map(c => (c == null ? '' : String(c))));

  // Drop fully-empty trailing rows, matching parseCSV's own trailing-row
  // handling (common with a trailing blank line/row in the sheet).
  while (rows.length && rows[rows.length - 1].every(c => c === '')) rows.pop();

  if (!rows.length) return { headers: [], rows: [] };
  const [headers, ...dataRows] = rows;
  return { headers: headers.map(h => h.trim()), rows: dataRows };
}

// True when `file` looks like an Excel workbook rather than a CSV — by
// extension first (the reliable signal for a locally-picked file) and MIME
// type as a fallback, since some browsers/OSes leave File#type blank for
// .xlsx on upload.
function isExcelFile(file) {
  if (/\.xlsx?$/i.test(file.name || '')) return true;
  return [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
  ].includes(file.type);
}

// Reads a File picked via <input type="file"> into { headers, rows },
// dispatching to parseCSV or parseXLSX by the file's actual format. Every
// import modal's onFile() should go through this rather than hand-rolling
// its own FileReader — a single dispatch point is what keeps CSV and Excel
// support from drifting out of sync as those modals evolve.
export function readSpreadsheetFile(file) {
  const excel = isExcelFile(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์นี้ได้'));
    reader.onload = () => {
      try {
        resolve(excel ? parseXLSX(reader.result) : parseCSV(String(reader.result)));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    if (excel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, 'utf-8');
  });
}

// Builds a downloadable CSV Blob and triggers a browser save-as, matching
// the escaping convention already used by ResponsesView.vue's Export CSV.
export function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// One cell of a per-question export column, formatted so it round-trips
// through responseController.importCsv's column parsing (backend/src/
// controllers/responseController.js) without being reinterpreted as the
// wrong thing:
//   - checkbox   -> semicolon-joined values (the import splits on ';', NOT
//                   the ', ' SurveyFillView.vue joins answer_text with)
//   - scale/star -> the plain numeric score, so re-import's parseFloat(cell)
//                   recovers it directly instead of parsing display text
//   - everything else (short/para/radio/dropdown/date/time/...) -> answer_text
//                   as-is; radio/dropdown answer_text already equals one of
//                   the question's option labels (e.g. "ดีมาก (5)"), which is
//                   exactly what import's score-suffix/positional-index
//                   matching expects.
function cellForAnswer(question, answer) {
  if (!answer) return '';
  let json = answer.answer_json;
  if (typeof json === 'string') { try { json = JSON.parse(json); } catch { json = null; } }

  if (question.question_type === 'checkbox') {
    const values = Array.isArray(json?.values)
      ? json.values
      : (answer.answer_text ? String(answer.answer_text).split(',').map(s => s.trim()).filter(Boolean) : []);
    return values.join(';');
  }
  if (question.question_type === 'scale' || question.question_type === 'star') {
    return answer.score != null ? String(answer.score) : (answer.answer_text ?? '');
  }
  return answer.answer_text ?? '';
}

// Builds the { headers, rows } table for the responses "Export CSV" button,
// in exactly the shape responseController.importCsv expects back: one
// column per survey question, headed by that question's exact question_text
// (import's pass-1 column matching is an exact, case-insensitive text match
// against question_text) plus a respondent-name column recognized by
// import's name-column regex (/^(respondent[_ ]?name|ชื่อ|name)/i) and an
// `id` column recognized as the dedup column (import's idAliases set).
//
// `id` is set to each response's own database id — harmless on a first
// import into a *different* survey (that survey's rows don't share ids with
// this one, so nothing collides), and lets re-importing the exported file
// back into the *same* survey be recognized as a duplicate and skipped
// rather than inserted a second time. That dedup works on the very FIRST
// re-import too, not just the second: responseController.submit and
// publicResponseController.submitFromGoogleForm now self-assign
// external_id = a response's own id at insert time (and
// 004_backfill_response_external_id.sql backfilled every older row), so the
// id this function writes into the CSV already matches what's stored in the
// DB — it doesn't depend on a previous CSV import having set it first.
//
// The trailing "วันที่ส่ง" column is informational only — import has no
// column for submission date, but since every real question above is
// already claimed by an exact question_text match, this extra header is
// simply left unmatched (not misassigned to some other question — see the
// positional-fallback comment in importCsv) if the file is ever re-imported.
export function buildResponseExportRows(questions, responses, { formatDate } = {}) {
  const fmt = formatDate || (d => (d ? new Date(d).toISOString().slice(0, 10) : ''));
  const qs = Array.isArray(questions) ? questions : [];
  // 'respondent_name', not 'ชื่อ-นามสกุล' — a survey's own first question is
  // very often literally titled "ชื่อ-นามสกุล", which would collide with
  // this metadata column's header. importCsv's Pass-1 exact-text match runs
  // before its name-column detection, so a collision doesn't error, but it
  // silently picks whichever of the two identically-headed columns comes
  // first as "the" answer to that question and demotes the other to
  // name-only metadata — correct by coincidence only because both columns
  // happen to hold the same value here. 'respondent_name' still satisfies
  // import's name-column regex (/^(respondent[_ ]?name|ชื่อ|name)/i) but
  // can't collide with a real question's Thai question_text.
  const headers = ['id', 'respondent_name', ...qs.map(q => q.question_text), 'วันที่ส่ง'];
  const rows = (Array.isArray(responses) ? responses : []).map(r => {
    const byQuestionId = new Map();
    (Array.isArray(r.answers) ? r.answers : []).forEach(a => {
      if (a && a.question_id != null) byQuestionId.set(a.question_id, a);
    });
    const cells = qs.map(q => cellForAnswer(q, byQuestionId.get(q.id)));
    return [r.id, r.respondent_name || '', ...cells, fmt(r.submitted_at)];
  });
  return { headers, rows };
}

// Exact-header names buildResponseExportRows uses for columns that aren't
// real survey questions — shared here so detection/exclusion below stays in
// sync with what that function actually emits if it's ever changed.
const RESPONSE_EXPORT_METADATA_HEADERS = new Set(['id', 'respondent_name', 'วันที่ส่ง']);

// Guesses a question_type + options for one column of a responses-export
// CSV from its cell values alone — the export doesn't carry question_type,
// so recreating a survey from it can only approximate the original types.
// The result is deliberately conservative (falls back to 'short' free text
// whenever a column doesn't clearly look like something else) since a wrong
// guess is easy to fix by hand after creation, but a wrong CHOICE OF DATA
// (e.g. treating a comment column as a 5-option radio) is not.
// A real choice-question option is a short label (a word or a few words) —
// never a full sentence. Distinct-value counting alone previously called
// ANY column with 2-8 distinct values "radio"/"checkbox", which reliably
// misfires on open-ended text columns whenever many respondents happen to
// answer with the same short placeholder ("-", "ไม่มี", "ok"...) and only a
// few write something unique: e.g. 12 answers where 5 people wrote "-" and
// 7 wrote unique full-sentence feedback collapses to 8 distinct values out
// of 12 — satisfying the old "looks like a fixed option set" check even
// though every one of those 7 unique values is free-form prose, not an
// option label. Requiring every distinct value to be option-label-length
// closes that gap without weakening the check for genuinely short,
// repeated choice sets (ดี/ปานกลาง/แย่ and the like).
const MAX_OPTION_LABEL_LENGTH = 40;
const looksLikeOptionLabel = v => v.length <= MAX_OPTION_LABEL_LENGTH;

function inferQuestionTypeFromValues(values) {
  const nonEmpty = values.map(v => String(v ?? '').trim()).filter(Boolean);
  if (!nonEmpty.length) return { type: 'short', options: null };

  // checkbox — buildResponseExportRows joins multi-select answers with ';'.
  // Same option-label-length guard as radio below: a semicolon can show up
  // inside genuine free text too, so only trust this when every split
  // token is actually short enough to be a choice label.
  if (nonEmpty.some(v => v.includes(';'))) {
    const set = new Set();
    nonEmpty.forEach(v => v.split(';').map(s => s.trim()).filter(Boolean).forEach(s => set.add(s)));
    const tokens = [...set];
    if (tokens.every(looksLikeOptionLabel)) {
      return { type: 'checkbox', options: tokens };
    }
    return { type: 'short', options: null };
  }

  // scale/star — every answered cell is a plain number (this is what
  // cellForAnswer writes for both types; they're indistinguishable from
  // values alone, so 'scale' is used for both).
  if (nonEmpty.every(v => /^-?\d+(\.\d+)?$/.test(v))) {
    const nums = nonEmpty.map(Number);
    let min = Math.min(...nums);
    let max = Math.max(...nums);
    if (min > 1) min = 1;   // widen to the common 1-5 convention unless the
    if (max < 5) max = 5;   // observed data already exceeds it either way
    return { type: 'scale', options: { min, max } };
  }

  // radio — a small, repeated set of distinct text answers (fewer distinct
  // values than rows) reads as single-choice; anything more varied than
  // that is free text, not a real fixed option set. See
  // MAX_OPTION_LABEL_LENGTH above for why length matters just as much as
  // the distinct count.
  //
  // Length and distinct-count alone still aren't enough: a genuinely
  // open-ended column where most respondents happen to write a short,
  // *different* comment each (each under MAX_OPTION_LABEL_LENGTH on its
  // own) can land on e.g. 8 distinct values out of 12 rows and pass both
  // checks above, even though 7 of those 8 are one-off free text and only
  // a shared placeholder like "-" repeats. A real fixed option set doesn't
  // look like that: with a real radio/checkbox question, most of its
  // options get picked by more than one respondent. So also require that
  // most distinct values actually repeat — this is what actually
  // distinguishes "5 people picked A, 4 picked B, 3 picked C" (a genuine
  // choice question) from "5 people wrote '-', 7 people each wrote their
  // own unique sentence" (free text with a common placeholder).
  const distinct = [...new Set(nonEmpty)];
  const valueCounts = {};
  nonEmpty.forEach(v => { valueCounts[v] = (valueCounts[v] || 0) + 1; });
  const repeatedValueCount = distinct.filter(v => valueCounts[v] > 1).length;
  if (
    distinct.length > 1 && distinct.length <= 8 && distinct.length < nonEmpty.length &&
    distinct.every(looksLikeOptionLabel) &&
    repeatedValueCount / distinct.length >= 0.5
  ) {
    return { type: 'radio', options: distinct };
  }

  return { type: 'short', options: null };
}

// Reconstructs a { questions } list a new survey can be created with from
// ANY tabular file that ImportCsvModal.vue can't read as a question-structure
// file (no question_text column) — every remaining column becomes one
// question, headed by that column's own header text, with its type guessed
// from the column's cell values (see inferQuestionTypeFromValues above).
//
// This was originally written only for a CSV produced by
// buildResponseExportRows (the "Export CSV" button — recognized by its id/
// respondent_name/วันที่ส่ง metadata columns), so a survey's own exported
// responses could be re-imported as a brand-new survey. It's since become
// the general fallback for *any* file without a question_text column —
// someone's own spreadsheet of collected answers (paper forms, another
// tool's export, a plain table someone typed by hand) works exactly the
// same way: headers become questions, rows become the new survey's first
// batch of responses (ImportCsvModal.vue hands the same headers/rows to
// POST /responses/import-csv right after creating the survey). Any of the
// three known metadata headers are still excluded from becoming a question
// if present — e.g. a genuine Export CSV round-trip doesn't get a
// nonsensical "id" or "วันที่ส่ง" question — but their presence is no longer
// required to trigger inference at all.
//
// Returns null only when literally nothing is left to work with (every
// column is a metadata column, or the file has no columns at all), so the
// caller falls back to its "ไม่พบคอลัมน์ question_text" error for a truly
// empty or unreadable file.
export function inferQuestionsFromResponseExport(headers, rows) {
  const isMetadata = h => RESPONSE_EXPORT_METADATA_HEADERS.has(String(h ?? '').trim().toLowerCase());

  const questionCols = headers
    .map((h, idx) => ({ h, idx }))
    .filter(({ h }) => !isMetadata(h) && String(h ?? '').trim());
  if (!questionCols.length) return null;

  const questions = questionCols.map(({ h, idx }, order) => {
    const colValues = rows.map(r => r[idx]);
    const { type, options } = inferQuestionTypeFromValues(colValues);
    return { section: 1, order, text: h, type, required: false, options };
  });
  return questions;
}
