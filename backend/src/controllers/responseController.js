const db = require('../config/db');
const { todayInBangkok, OPEN_BY_CLOSE_DATE_SQL } = require('../utils/bangkokDate');
const { resolveChoiceScore, scoreFromLikertLabel } = require('../utils/likertScore');

// Owner, admin, a user the survey was explicitly shared with (survey_shares),
// or anyone when the owner opted the survey into shared_all — may view a
// survey's responses/stats/charts. Anyone else must be rejected.
async function canAccessSurvey(surveyId, user) {
  if (['admin', 'head_admin'].includes(user.role)) {
    const [[s]] = await db.query('SELECT id FROM surveys WHERE id = ?', [surveyId]);
    return !!s;
  }
  const [[s]] = await db.query(
    `SELECT s.id FROM surveys s
     LEFT JOIN survey_shares sh ON sh.survey_id = s.id AND sh.shared_with_id = ?
     WHERE s.id = ? AND (s.user_id = ? OR sh.id IS NOT NULL OR s.shared_all = 1)`,
    [user.id, surveyId, user.id]
  );
  return !!s;
}

exports.list = async (req, res) => {
  try {
    const surveyId = req.params.surveyId;

    if (!(await canAccessSurvey(surveyId, req.user))) {
      return res.status(404).json({ message: 'ไม่พบแบบสอบถาม' });
    }

    const [rows] = await db.query(
      `SELECT r.*,
              JSON_ARRAYAGG(
                JSON_OBJECT(
                  'question_id', ra.question_id,
                  'answer_text', ra.answer_text,
                  'answer_json', ra.answer_json,
                  'score', ra.score,
                  'question_type', q.question_type
                )
              ) AS answers
       FROM responses r
       LEFT JOIN response_answers ra ON ra.response_id = r.id
       LEFT JOIN questions q ON q.id = ra.question_id
       WHERE r.survey_id = ?
       GROUP BY r.id
       ORDER BY r.submitted_at DESC`,
      [surveyId]
    );
    res.json(rows);
  } catch (err) {
    console.error('responses.list error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

// Clamps a raw client-supplied score to the question's own configured range
// (scale: options.min/max; star: 0..max_stars) before it's trusted for
// storage/aggregation. Out-of-range or non-numeric input is dropped (null)
// rather than stored — this is a public, unauthenticated endpoint, so a
// submitter could otherwise plant an arbitrary large/negative score to skew
// overall_score / v_question_stats averages. Other types (radio/dropdown
// embed a score parsed from their label, e.g. "ดีมาก (5)") get a generous
// blanket sanity bound instead of a per-type one.
function sanitizeScore(question, rawScore) {
  if (rawScore === undefined || rawScore === null || rawScore === '') return null;
  const n = parseFloat(rawScore);
  if (isNaN(n)) return null;

  let opts = question?.options_json ?? null;
  if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { opts = null; } }

  let min = 0, max = 100;
  if (question?.question_type === 'scale' && opts && !Array.isArray(opts)) {
    min = opts.min ?? 1;
    max = opts.max ?? 5;
  } else if (question?.question_type === 'star') {
    min = 0;
    max = (opts && !Array.isArray(opts) && opts.max_stars) || 5;
  }
  return n >= min && n <= max ? n : null;
}

// Public, unauthenticated endpoint — bound how many answers a single
// submission can carry regardless of what the survey actually asks, mirroring
// the row cap already enforced on CSV import.
const MAX_ANSWERS_PER_SUBMISSION = 500;

exports.submit = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { surveyId } = req.params;
    const { respondent_name, answers = [], share_token } = req.body;

    if (!Array.isArray(answers) || answers.length > MAX_ANSWERS_PER_SUBMISSION) {
      await conn.rollback();
      return res.status(400).json({ message: 'ข้อมูลคำตอบไม่ถูกต้อง' });
    }

    // Only accept submissions for active surveys reached via their own
    // share_token. Checking status alone let anyone iterate the plain
    // sequential survey id and POST forged responses to any active survey
    // system-wide, without ever having received its share link/QR code —
    // share_token is what's supposed to gate that, so submission must
    // require it too, not just the public GET that loads the form.
    const [[survey]] = await conn.query(
      `SELECT id FROM surveys
       WHERE id = ? AND status = 'active' AND share_token = ? AND ${OPEN_BY_CLOSE_DATE_SQL}`,
      [surveyId, share_token || null, todayInBangkok()]
    );
    if (!survey) {
      await conn.rollback();
      return res.status(403).json({ message: 'แบบสอบถามนี้ปิดรับคำตอบแล้ว' });
    }

    // Load this survey's own questions so every answer below can be checked
    // to actually belong to it, instead of trusting a client-supplied
    // question_id as-is (which could otherwise point at a question on a
    // completely different survey).
    const [surveyQuestions] = await conn.query(
      'SELECT id, question_type, options_json FROM questions WHERE survey_id = ?',
      [surveyId]
    );
    const questionById = new Map(surveyQuestions.map(q => [q.id, q]));
    const safeAnswers = answers.filter(a => a && questionById.has(a.question_id));

    // Required-question validation — the frontend already enforces this, but
    // the API must not trust the client; anyone can POST here directly with
    // required answers omitted.
    const [requiredQuestions] = await conn.query(
      'SELECT id FROM questions WHERE survey_id = ? AND is_required = 1',
      [surveyId]
    );
    if (requiredQuestions.length) {
      const answerByQuestionId = new Map(safeAnswers.map(a => [a.question_id, a]));
      const hasAnswer = a => {
        if (!a) return false;
        if (a.answer_text && String(a.answer_text).trim()) return true;
        if (a.score !== undefined && a.score !== null && a.score !== '' && !isNaN(parseFloat(a.score))) return true;
        const j = a.answer_json;
        if (j && ((Array.isArray(j.values) && j.values.length) || j.value || (j.score !== undefined && j.score !== null))) {
          return true;
        }
        return false;
      };
      const missing = requiredQuestions.some(q => !hasAnswer(answerByQuestionId.get(q.id)));
      if (missing) {
        await conn.rollback();
        return res.status(400).json({ message: 'กรุณาตอบคำถามที่จำเป็นให้ครบถ้วน' });
      }
    }

    // Input length guard
    const name = (respondent_name || 'ไม่ระบุ').slice(0, 200);

    const answerRows = safeAnswers.map(a => [
      a.question_id,
      a.answer_text ? String(a.answer_text).slice(0, 5000) : null,
      a.answer_json ? JSON.stringify(a.answer_json).slice(0, 10000) : null,
      sanitizeScore(questionById.get(a.question_id), a.score),
    ]);

    const scores = answerRows.map(r => r[3]).filter(s => s !== null);
    const overall = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    const ip = req.ip || null;

    const [resResult] = await conn.query(
      'INSERT INTO responses (survey_id, respondent_name, overall_score, ip_address) VALUES (?,?,?,?)',
      [surveyId, name, overall, ip]
    );
    const responseId = resResult.insertId;

    // Self-assign external_id = this response's own id. Without this, a
    // native submission's external_id stays NULL forever, so exporting it
    // (composables/useCsv.js buildResponseExportRows writes the response's
    // own id into the CSV's "id" column) and importing that file straight
    // back into the SAME survey wouldn't be recognized as a duplicate on the
    // very first re-import — importCsv can only dedup against an existing
    // external_id, and NULL never matches anything. Since ids are globally
    // unique across the whole table, this can never collide with anything
    // (own uq_survey_external_id key is scoped per survey_id, which is even
    // narrower). Doesn't affect Google Forms sync's own dedup, which uses
    // the separate google_response_id column instead.
    await conn.query('UPDATE responses SET external_id = ? WHERE id = ?', [String(responseId), responseId]);

    if (answerRows.length) {
      const vals = answerRows.map(([questionId, answerText, answerJson, score]) => [
        responseId,
        questionId,
        answerText,
        answerJson,
        score,
      ]);
      await conn.query(
        'INSERT INTO response_answers (response_id, question_id, answer_text, answer_json, score) VALUES ?',
        [vals]
      );
    }

    await conn.commit();
    res.status(201).json({ id: responseId, message: 'ส่งคำตอบเรียบร้อยแล้ว' });
  } catch (err) {
    await conn.rollback();
    console.error('responses.submit error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  } finally {
    conn.release();
  }
};

// Bulk-imports responses from a CSV file already parsed client-side into
// { headers, rows }. Owner (or admin/head_admin) only — unlike viewing
// (canAccessSurvey), a survey a user can merely see via sharing must not be
// injectable with data.
//
// Column matching: each header is matched to a question by exact
// (trimmed, case-insensitive) text match against question_text first;
// any leftover headers are matched positionally against whichever
// questions weren't already claimed by a text match, in order — the same
// fallback strategy used for Google Forms sync
// (see services/googleFormsSync.js buildQIdMap) so behavior stays
// consistent across both import paths.
//
// Dedup: an optional id/response_id/external_id column is stored as
// responses.external_id (scoped per survey). Re-importing a file that mixes
// previously-imported rows with new ones silently skips rows whose ID was
// already imported instead of duplicating them. Without that column, this
// import batch itself can't dedup rows against each other or a previous run
// of the same file — but each inserted row still gets external_id
// self-assigned to its own new id right after insert (same as
// responseController.submit for native submissions), so a *later* export of
// this survey and re-import back into it can still be recognized as a
// duplicate.
exports.importCsv = async (req, res) => {
  try {
    const surveyId = req.params.surveyId;
    const isAdmin = ['admin', 'head_admin'].includes(req.user.role);
    const [[survey]] = await db.query(
      isAdmin ? 'SELECT id FROM surveys WHERE id = ?' : 'SELECT id FROM surveys WHERE id = ? AND user_id = ?',
      isAdmin ? [surveyId] : [surveyId, req.user.id]
    );
    if (!survey) return res.status(404).json({ message: 'ไม่พบแบบสอบถาม' });

    const { headers, rows } = req.body;
    if (!Array.isArray(headers) || !Array.isArray(rows)) {
      return res.status(400).json({ message: 'รูปแบบข้อมูล CSV ไม่ถูกต้อง' });
    }
    if (!rows.length) return res.status(400).json({ message: 'ไม่พบข้อมูลในไฟล์ CSV' });
    if (rows.length > 5000) {
      return res.status(400).json({ message: 'นำเข้าได้สูงสุด 5,000 แถวต่อครั้ง — กรุณาแบ่งไฟล์' });
    }

    const [questions] = await db.query(
      'SELECT id, question_text, question_type, options_json FROM questions WHERE survey_id = ? ORDER BY section_number, sort_order',
      [surveyId]
    );
    if (!questions.length) {
      return res.status(400).json({ message: 'แบบสอบถามนี้ยังไม่มีคำถาม — ไม่สามารถนำเข้าคำตอบได้' });
    }

    const norm = s => String(s || '').trim().toLowerCase();

    // Pass 1: match every header to a question by exact (trimmed,
    // case-insensitive) text match — this runs BEFORE any "looks like a
    // name column" guess below, so a survey whose first question literally
    // is a name question (very common — "ชื่อ-นามสกุล") still gets that
    // column matched as a real answer, not swallowed as name-only metadata.
    const usedQuestionIds = new Set();
    const colToQuestion = new Map(); // header index -> question row
    headers.forEach((h, idx) => {
      const q = questions.find(q => !usedQuestionIds.has(q.id) && norm(q.question_text) === norm(h));
      if (q) { colToQuestion.set(idx, q); usedQuestionIds.add(q.id); }
    });

    // Pass 2: among headers NOT already matched to a question, ones that
    // look like a dedicated respondent-name or row-ID column supply
    // responses.respondent_name / responses.external_id as metadata only
    // (excluded from positional matching below, since neither is an answer
    // to anything). The ID column is optional — if the CSV came from
    // another system that already assigns each response a stable ID (e.g.
    // "response_id"), including it here lets a later re-import of a file
    // that mixes old and new rows skip the old ones instead of duplicating
    // them (see the ON DUPLICATE KEY handling below).
    const nameColIdx = headers.findIndex((h, idx) => !colToQuestion.has(idx) && /^(respondent[_ ]?name|ชื่อ|name)/i.test(norm(h)));
    const idAliases = new Set(['id', 'response_id', 'external_id', 'row_id']);
    const idColIdx = headers.findIndex((h, idx) => !colToQuestion.has(idx) && idAliases.has(norm(h).replace(/[\s-]+/g, '_')));

    // Pass 3: any remaining unmatched headers (excluding the name/ID
    // columns, if any) are matched positionally against whichever
    // questions weren't already claimed by a text match, in order — the
    // same fallback strategy used for Google Forms sync (see
    // services/googleFormsSync.js buildQIdMap) so behavior stays
    // consistent across both import paths.
    const unmatchedQuestions = questions.filter(q => !usedQuestionIds.has(q.id));
    let posPtr = 0;
    headers.forEach((h, idx) => {
      if (idx === nameColIdx || idx === idColIdx || colToQuestion.has(idx)) return;
      const q = unmatchedQuestions[posPtr++];
      if (q) colToQuestion.set(idx, q);
    });

    if (!colToQuestion.size) {
      return res.status(400).json({
        message: 'ไม่พบคอลัมน์ที่ตรงกับคำถามในแบบสอบถามนี้ — ตรวจสอบว่าหัวคอลัมน์ตรงกับข้อความคำถาม',
      });
    }

    // No dedicated name column? Fall back to whichever matched question
    // looks like a name question — mirrors the convention already used for
    // Google Forms sync (services/googleFormsSync.js pullFormResponses):
    // a short/para question whose text contains "ชื่อ". Its value still
    // gets inserted normally as an answer too; this only decides what also
    // gets copied into responses.respondent_name.
    let nameFromQuestionIdx = -1;
    if (nameColIdx === -1) {
      for (const [idx, q] of colToQuestion) {
        if (['short', 'para'].includes(q.question_type) && q.question_text.includes('ชื่อ')) {
          nameFromQuestionIdx = idx;
          break;
        }
      }
    }

    const conn = await db.getConnection();
    let imported = 0, skipped = 0, duplicates = 0, unscoredChoiceCells = 0;
    try {
      await conn.beginTransaction();

      for (const row of rows) {
        const nameSrcIdx = nameColIdx >= 0 ? nameColIdx : nameFromQuestionIdx;
        const rawName = nameSrcIdx >= 0 ? row[nameSrcIdx] : '';
        const name = String(rawName ?? '').trim().slice(0, 200) || 'ไม่ระบุ';
        const externalId = idColIdx >= 0 ? (String(row[idColIdx] ?? '').trim().slice(0, 191) || null) : null;

        const answerRows = [];
        const scores = [];

        for (const [idx, q] of colToQuestion) {
          const raw = row[idx];
          const cell = raw == null ? '' : String(raw).trim();
          if (!cell) continue;

          let answerText = null, answerJson = null, score = null;

          if (q.question_type === 'checkbox') {
            const values = cell.split(';').map(v => v.trim()).filter(Boolean);
            answerText = values.join(', ');
            answerJson = JSON.stringify({ values });
          } else if (['scale', 'star'].includes(q.question_type)) {
            const n = parseFloat(cell);
            if (!isNaN(n)) {
              score = n;
              answerJson = JSON.stringify({ score: n });
            }
            answerText = cell;
          } else if (['radio', 'dropdown'].includes(q.question_type)) {
            answerText = cell;
            answerJson = JSON.stringify({ value: cell });
            // Score comes from an explicit "(n)" suffix or the shared Thai
            // Likert label dictionary (utils/likertScore.js) — NEVER from
            // this option's position in `opts`. Options are very commonly
            // authored best-first ("มากที่สุด, มาก, ... , น้อยที่สุด"), which
            // a position-based guess (index 0 -> score 1) would silently
            // invert; see the comment at the top of likertScore.js for the
            // incident that motivated this. An unrecognized label is left
            // unscored (counted below) rather than guessed.
            score = resolveChoiceScore(cell);
            if (score == null) unscoredChoiceCells++;
          } else {
            // short / para / date / time / file / mcgrid / cbgrid — grid
            // answers aren't reconstructable from a single flat CSV cell,
            // so they're stored as plain text rather than skipped outright.
            answerText = cell;
          }

          answerRows.push([q.id, answerText, answerJson, score]);
          if (score != null && !isNaN(score)) scores.push(score);
        }

        if (!answerRows.length) { skipped++; continue; }

        const overall = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

        let responseId;
        try {
          const [rResult] = await conn.query(
            'INSERT INTO responses (survey_id, respondent_name, overall_score, external_id) VALUES (?,?,?,?)',
            [surveyId, name, overall, externalId]
          );
          responseId = rResult.insertId;
        } catch (e) {
          // A duplicate (survey_id, external_id) means this row's ID was
          // already imported in a previous run — MySQL doesn't poison the
          // rest of the transaction on a duplicate-key error, so this is
          // safe to catch and keep going rather than aborting the whole
          // import (mirrors the same pattern used for Google Forms sync —
          // see services/googleFormsSync.js pullFormResponses).
          if (e.code === 'ER_DUP_ENTRY' && externalId != null) {
            duplicates++;
            continue;
          }
          throw e;
        }

        // A row imported without an id/response_id/external_id column in
        // the CSV (externalId still null here) — self-assign external_id =
        // its own new id, same as responseController.submit /
        // publicResponseController.submitFromGoogleForm do for native
        // submissions (see the comment there). Without this, a CSV-imported
        // response could never be recognized as a duplicate on a future
        // export -> re-import into this same survey, even though every
        // other response already can be. Safe: doesn't touch the
        // ER_DUP_ENTRY check above, which already ran against the
        // *original* externalId (still null at that point) before this row
        // ever reaches here — rows imported from the same id-less file
        // still never dedup against each other or a previous run of it, per
        // the "rows without any id column never dedup against each other"
        // test — this only affects what happens on a *later* export/import.
        if (externalId == null) {
          await conn.query('UPDATE responses SET external_id = ? WHERE id = ?', [String(responseId), responseId]);
        }

        await conn.query(
          'INSERT INTO response_answers (response_id, question_id, answer_text, answer_json, score) VALUES ?',
          [answerRows.map(([qid, text, json, score]) => [responseId, qid, text, json, score])]
        );
        imported++;
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    res.json({
      imported,
      duplicates,
      skipped,
      matchedColumns: colToQuestion.size,
      totalQuestions: questions.length,
      // Radio/dropdown cells whose text didn't match an explicit "(n)"
      // score suffix or a known Likert label (utils/likertScore.js) — left
      // unscored on purpose rather than guessed. A non-zero count is worth
      // surfacing to the importing admin: it usually means the survey uses
      // custom option wording that isn't in the dictionary yet.
      unscoredChoiceCells,
    });
  } catch (err) {
    console.error('responses.importCsv error:', err.message);
    res.status(500).json({ message: 'นำเข้าไฟล์ CSV ไม่สำเร็จ' });
  }
};

exports.chartData = async (req, res) => {
  try {
    const surveyId = req.params.surveyId;
    if (!(await canAccessSurvey(surveyId, req.user))) {
      return res.status(404).json({ message: 'ไม่พบแบบสอบถาม' });
    }

    const [questions] = await db.query(
      `SELECT id, question_text, question_type, options_json
       FROM questions
       WHERE survey_id = ?
       ORDER BY section_number, sort_order`,
      [surveyId]
    );

    const [answers] = await db.query(
      `SELECT ra.question_id, ra.answer_text, ra.answer_json, ra.score
       FROM response_answers ra
       JOIN responses r ON r.id = ra.response_id
       WHERE r.survey_id = ?`,
      [surveyId]
    );

    const parseJson = v => {
      if (!v) return null;
      if (typeof v !== 'string') return v;
      try { return JSON.parse(v); } catch { return null; }
    };

    const charts = questions.map(q => {
      const qAnswers = answers.filter(a => a.question_id === q.id);
      const opts = parseJson(q.options_json) || [];

      let chartType = 'none';
      let data = [];
      // True only for radio/dropdown/checkbox questions whose entire option
      // set is a recognized Thai Likert-scale family (see likertScore.js) —
      // e.g. "น้อยที่สุด/น้อย/ปานกลาง/มาก/มากที่สุด". Distinguishes a real
      // rating question from an open-text question that merely happens to
      // be *titled* with a feedback word like "ความคิดเห็น" (a very common
      // phrasing for Thai satisfaction-rating questions, e.g. "ระดับความ
      // คิดเห็นต่อ..."). Without this, ResponsesView.vue's text-based
      // isFeedbackQuestionText() keyword match would treat such a rating
      // question as an open-feedback question too, pulling its Likert
      // answers ("มาก", "มากที่สุด") into the "ความคิดเห็นล่าสุด" comments
      // panel instead of actual free-text answers, and hiding its own
      // bar/donut chart in the process.
      let isLikertScale = false;

      if (['radio', 'checkbox', 'dropdown'].includes(q.question_type)) {
        chartType = 'bar';
        const labels = Array.isArray(opts) ? opts : [];
        const counts = {};
        labels.forEach(l => counts[l] = 0);
        qAnswers.forEach(a => {
          const parsed = parseJson(a.answer_json);
          if (parsed?.values) {
            parsed.values.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
          } else {
            const value = parsed?.value ?? a.answer_text;
            if (value) counts[value] = (counts[value] || 0) + 1;
          }
        });
        data = labels.map(l => ({ label: l, count: counts[l] || 0 }));
        isLikertScale = labels.length > 0 && labels.every(l => scoreFromLikertLabel(l) !== null);
      } else if (['scale', 'star'].includes(q.question_type)) {
        chartType = 'score';
        // ?? (not ||) — a deliberately-configured min of 0 must not be
        // overwritten by the default just because 0 is falsy.
        const min = opts?.min ?? 1, max = opts?.max ?? 5;
        const counts = {};
        for (let i = min; i <= max; i++) counts[i] = 0;
        qAnswers.forEach(a => {
          const parsed = parseJson(a.answer_json);
          const v = parsed?.score ?? a.score;
          if (v !== null && v !== undefined) counts[Math.round(v)] = (counts[Math.round(v)] || 0) + 1;
        });
        data = Object.entries(counts).map(([k, v]) => ({ label: k, count: v }));
      } else if (['short', 'para', 'date', 'time', 'file'].includes(q.question_type)) {
        chartType = 'text';
        data = qAnswers.slice(0, 5).map(a => a.answer_text).filter(Boolean);
      } else if (['mcgrid', 'cbgrid'].includes(q.question_type)) {
        chartType = 'grid';
        const cols = Array.isArray(opts?.cols) ? opts.cols : [];
        const rowLabels = Array.isArray(opts?.rows) ? opts.rows : [];
        const rows = rowLabels.map(rowLabel => {
          const counts = {};
          cols.forEach(c => {
            counts[c] = 0;
          });
          qAnswers.forEach(a => {
            const parsed = parseJson(a.answer_json);
            if (!parsed || !(rowLabel in parsed)) return;
            const v = parsed[rowLabel];
            if (Array.isArray(v)) {
              v.forEach(x => {
                if (x in counts) counts[x]++;
              });
            } else if (v && v in counts) {
              counts[v]++;
            }
          });
          return { row: rowLabel, counts };
        });
        data = { cols, rows };
      }

      const total = qAnswers.length;
      return {
        question_id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        chartType,
        isLikertScale,
        data,
        total,
      };
    });

    res.json(charts);
  } catch (err) {
    console.error('responses.chartData error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

