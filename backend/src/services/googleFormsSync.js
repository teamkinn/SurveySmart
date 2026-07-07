const db = require('../config/db');

function parseJsonSafe(v) {
  if (!v) return null;
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

// Groups a Google Forms API response's raw per-question answers into the
// per-local-question shape (`response_answers` rows) plus an overall score.
function extractResponseAnswers(resp, qIdMap) {
  const grouped = {};
  for (const [googleQId, ans] of Object.entries(resp.answers || {})) {
    const qInfo = qIdMap[googleQId];
    if (!qInfo) continue;
    const values = (ans.textAnswers?.answers || []).map(a => a.value).filter(Boolean);

    if (qInfo.isGridRow) {
      const g = (grouped[qInfo.localId] ??= {
        isGrid: true,
        type: qInfo.type,
        cols: qInfo.cols,
        rows: {},
      });
      g.rows[qInfo.rowLabel] = qInfo.type === 'cbgrid' ? values : values[0] || null;
      continue;
    }

    let answerText = null,
      answerJson = null,
      score = null;
    if (qInfo.type === 'checkbox') {
      answerText = values.join(', ');
      answerJson = JSON.stringify({ values });
    } else if (['scale', 'star'].includes(qInfo.type)) {
      const n = parseFloat(values[0]);
      if (!isNaN(n)) {
        score = n;
        answerJson = JSON.stringify({ score: n });
      }
      answerText = values[0] || null;
    } else {
      answerText = values[0] || null;
      if (['radio', 'dropdown'].includes(qInfo.type)) {
        answerJson = JSON.stringify({ value: answerText });
        const m = (answerText || '').match(/\((\d+(?:\.\d+)?)\)\s*$/);
        if (m) {
          score = parseFloat(m[1]);
        } else if (Array.isArray(qInfo.options) && qInfo.options.length > 1) {
          const idx = qInfo.options.indexOf(answerText);
          if (idx !== -1) score = idx + 1;
        }
      }
    }
    grouped[qInfo.localId] = { isGrid: false, answerText, answerJson, score };
  }

  const finalAnswers = [];
  for (const [localId, g] of Object.entries(grouped)) {
    if (g.isGrid) {
      const rowEntries = Object.entries(g.rows);
      const answerJson = JSON.stringify(g.rows);
      const answerText = rowEntries
        .map(([r, v]) => `${r}: ${Array.isArray(v) ? v.join('/') : v}`)
        .join('; ');
      let score = null;
      if (g.type === 'mcgrid' && Array.isArray(g.cols) && g.cols.length > 1) {
        const rowScores = rowEntries
          .map(([, v]) => g.cols.indexOf(v))
          .filter(i => i !== -1)
          .map(i => i + 1);
        if (rowScores.length) score = rowScores.reduce((a, b) => a + b, 0) / rowScores.length;
      }
      finalAnswers.push({ localId: Number(localId), answerText, answerJson, score });
    } else {
      finalAnswers.push({
        localId: Number(localId),
        answerText: g.answerText,
        answerJson: g.answerJson,
        score: g.score,
      });
    }
  }

  const scores = finalAnswers.map(a => a.score).filter(s => s != null && !isNaN(s));
  const overall = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  return { finalAnswers, overall };
}

// Builds the Google-questionId -> local-question map. For each local
// question that has a `google_question_id` (or, for grids, complete
// `options_json.rowQuestionIds`), matches by that ID — robust to the local
// questions being reordered/edited. Any local question WITHOUT a stored ID
// (legacy pre-fix imports, or a hand-mixed survey) falls back to positional
// matching, but only among the other ID-less questions/items, so a handful
// of untracked questions can't force the whole survey back to fragile
// order-dependent matching.
function buildQIdMap(formItems, localQuestions) {
  const byGoogleId = new Map();
  const positionalQuestions = [];

  for (const q of localQuestions) {
    if (['mcgrid', 'cbgrid'].includes(q.question_type)) {
      const opts = parseJsonSafe(q.options_json) || {};
      const rows = Array.isArray(opts.rows) ? opts.rows : [];
      const cols = Array.isArray(opts.cols) ? opts.cols : [];
      const rowQuestionIds = Array.isArray(opts.rowQuestionIds) ? opts.rowQuestionIds : null;
      if (rowQuestionIds && !rowQuestionIds.some(id => !id)) {
        rowQuestionIds.forEach((gid, i) => {
          byGoogleId.set(gid, { localId: q.id, type: q.question_type, isGridRow: true, rowLabel: rows[i] || '', cols });
        });
      } else {
        positionalQuestions.push(q);
      }
    } else if (q.google_question_id) {
      byGoogleId.set(q.google_question_id, {
        localId: q.id,
        type: q.question_type,
        options: parseJsonSafe(q.options_json),
      });
    } else {
      positionalQuestions.push(q);
    }
  }

  const qIdMap = {};
  let posPtr = 0;

  for (const item of formItems || []) {
    if (item.questionGroupItem) {
      const rowIds = (item.questionGroupItem.questions || []).map(rq => rq.questionId);
      const allRowsKnown = rowIds.length > 0 && rowIds.every(id => id && byGoogleId.has(id));
      if (allRowsKnown) {
        for (const rq of item.questionGroupItem.questions || []) {
          qIdMap[rq.questionId] = byGoogleId.get(rq.questionId);
        }
        continue;
      }
      const local = positionalQuestions[posPtr++];
      if (local) {
        const opts = parseJsonSafe(local.options_json) || {};
        const cols = Array.isArray(opts.cols) ? opts.cols : [];
        for (const rq of item.questionGroupItem.questions || []) {
          if (rq.questionId) {
            qIdMap[rq.questionId] = {
              localId: local.id,
              type: local.question_type,
              isGridRow: true,
              rowLabel: rq.rowQuestion?.title || '',
              cols,
            };
          }
        }
      }
      continue;
    }

    const googleQId = item.questionItem?.question?.questionId;
    if (googleQId && byGoogleId.has(googleQId)) {
      qIdMap[googleQId] = byGoogleId.get(googleQId);
      continue;
    }
    const local = positionalQuestions[posPtr++];
    if (googleQId && local) {
      qIdMap[googleQId] = {
        localId: local.id,
        type: local.question_type,
        options: parseJsonSafe(local.options_json),
      };
    }
  }

  return qIdMap;
}

// Pulls responses for `formId` (via an already-authorized `forms` API client)
// into `surveyId`, skipping any google_response_id already stored. Used by
// both the manual "sync now" route and the background poller.
async function pullFormResponses(forms, formId, surveyId) {
  const [localQuestions] = await db.query(
    'SELECT id, question_text, question_type, options_json, google_question_id FROM questions WHERE survey_id = ? ORDER BY section_number, sort_order',
    [surveyId]
  );

  const { data: form } = await forms.forms.get({ formId });
  const qIdMap = buildQIdMap(form.items || [], localQuestions);

  // Google Forms only returns a respondent's real name via `respondentEmail`
  // when the form owner has "collect email addresses" turned on. Most forms
  // don't, so fall back to whatever the respondent typed into this survey's
  // own name question, instead of the previous behavior of always writing the
  // literal string "Google Forms" as the respondent's name. Restricted to the
  // very first question (every SurveySmart survey convention puts the
  // "ชื่อ-นามสกุล" question first) to avoid misattributing an unrelated
  // "ชื่อ..." question (e.g. organization/activity name) elsewhere in the form.
  const firstQuestion = localQuestions[0];
  const nameQuestion =
    firstQuestion && ['short', 'para'].includes(firstQuestion.question_type) && firstQuestion.question_text?.includes('ชื่อ')
      ? firstQuestion
      : null;

  const { data: respData } = await forms.forms.responses.list({ formId });
  let synced = 0,
    skipped = 0;

  for (const resp of respData.responses || []) {
    if (!resp.responseId) continue;

    try {
      const [existing] = await db.query(
        'SELECT id FROM responses WHERE survey_id = ? AND google_response_id = ?',
        [surveyId, resp.responseId]
      );
      if (existing.length) {
        skipped++;
        continue;
      }

      const { finalAnswers, overall } = extractResponseAnswers(resp, qIdMap);

      const nameAnswer = nameQuestion ? finalAnswers.find(a => a.localId === nameQuestion.id) : null;
      const respondentName = nameAnswer?.answerText?.trim() || resp.respondentEmail || 'Google Forms';

      const [rResult] = await db.query(
        'INSERT INTO responses (survey_id, respondent_name, overall_score, submitted_at, google_response_id) VALUES (?,?,?,?,?)',
        [
          surveyId,
          respondentName,
          overall,
          resp.createTime ? new Date(resp.createTime) : new Date(),
          resp.responseId,
        ]
      );
      const responseId = rResult.insertId;

      const vals = finalAnswers.map(a => [responseId, a.localId, a.answerText, a.answerJson, a.score]);
      if (vals.length) {
        await db.query(
          'INSERT INTO response_answers (response_id, question_id, answer_text, answer_json, score) VALUES ?',
          [vals]
        );
      }
      synced++;
    } catch (e) {
      // A duplicate google_response_id here means another sync inserted it
      // concurrently between our SELECT and INSERT — treat as already-synced
      // rather than failing the whole batch.
      if (e.code === 'ER_DUP_ENTRY') {
        skipped++;
      } else {
        console.error(`pullFormResponses: response ${resp.responseId} failed:`, e.message);
      }
    }
  }

  return { synced, skipped, questionCount: Object.keys(qIdMap).length };
}

module.exports = { parseJsonSafe, extractResponseAnswers, buildQIdMap, pullFormResponses };
