const db = require('../config/db');
const { resolveChoiceScore } = require('../utils/likertScore');

// Public, unauthenticated endpoint (called by the Apps Script webhook) —
// bound how many answers a single submission can carry, mirroring the same
// cap on responseController.submit / the CSV import row limit.
const MAX_ANSWERS_PER_SUBMISSION = 500;

exports.submitFromGoogleForm = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { formId } = req.params;
    const { respondent_name, answers = [] } = req.body;

    if (!Array.isArray(answers) || answers.length > MAX_ANSWERS_PER_SUBMISSION) {
      await conn.rollback();
      return res.status(400).json({ message: 'Invalid answers payload' });
    }

    // Find active survey by google_form_id
    const [[survey]] = await conn.query(
      "SELECT id FROM surveys WHERE google_form_id = ? AND status = 'active'",
      [formId]
    );
    if (!survey) {
      await conn.rollback();
      return res.status(404).json({ message: 'Survey not found or closed' });
    }

    // Get questions in section + sort order
    //
    // NOTE — this matches `answers[i]` to `questions[i]` purely by array
    // position, unlike the OAuth-based sync path (services/googleFormsSync.js
    // buildQIdMap), which matches by google_question_id and can also expand
    // mcgrid/cbgrid questions into their per-row entries. This webhook can't
    // do the same: the Apps Script that POSTs here lives outside this repo
    // and, as far as this endpoint's contract goes, only ever sends a flat
    // `answer_text` per position — no per-answer question ID to match against,
    // and no defined shape for a grid question's answer. If local
    // section_number/sort_order ever drifts from the live Google Form's item
    // order, or a grid question is present, answers after that point silently
    // land on the wrong question instead of erroring. Closing this gap would
    // require changing the Apps Script payload itself, not just this handler.
    const [questions] = await conn.query(
      'SELECT id, question_type FROM questions WHERE survey_id = ? ORDER BY section_number, sort_order, id',
      [survey.id]
    );

    // Build one record per answer — question_id/answer_text/answer_json/
    // score — reused for BOTH computing the response's overall_score below
    // AND the response_answers insert further down. Previously these were
    // two separate hand-written passes that had drifted apart: the
    // overall_score pass only recognized question_type === 'radio', while
    // the insert pass below correctly used ['radio', 'dropdown'] — so a
    // 'dropdown' answer got its own score stored correctly but was silently
    // excluded from overall_score (regression test: publicResponseController
    // LikertScoring.test.js). Computing both from the same records makes
    // that particular class of drift structurally impossible.
    const answerRecords = answers.map((a, i) => {
      const q = questions[i];
      if (!q) return null;

      const answerText = a.answer_text || null;
      let answerJson = null;
      let score = null;

      if (['star', 'scale'].includes(q.question_type)) {
        const s = parseFloat(a.answer_text);
        if (!isNaN(s)) { score = s; answerJson = JSON.stringify({ score: s }); }
      } else if (['radio', 'dropdown'].includes(q.question_type)) {
        // resolveChoiceScore: an explicit "(n)" suffix, or the shared Thai
        // Likert label dictionary — never a guess from option position,
        // which this endpoint doesn't even have data for. See
        // utils/likertScore.js.
        score = resolveChoiceScore(a.answer_text);
        answerJson = JSON.stringify({ value: a.answer_text });
      } else if (q.question_type === 'checkbox') {
        const values = (a.answer_text || '').split(', ').filter(Boolean);
        answerJson = JSON.stringify({ values });
      }

      return { questionId: q.id, answerText, answerJson, score };
    }).filter(Boolean);

    const scores = answerRecords.map(r => r.score).filter(s => s != null && !isNaN(s));
    const overall = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    // req.ip (not a hand-parsed X-Forwarded-For) — respects the app's
    // `trust proxy` setting (app.js), so this can't be spoofed by a client
    // sending its own X-Forwarded-For header directly, unlike reading the
    // header here would allow. Matches responseController.submit.
    const ip = req.ip || null;

    const [resResult] = await conn.query(
      'INSERT INTO responses (survey_id, respondent_name, overall_score, ip_address) VALUES (?,?,?,?)',
      [survey.id, respondent_name || 'ไม่ระบุ', overall, ip]
    );
    const responseId = resResult.insertId;

    // Self-assign external_id = this response's own id — same reasoning as
    // responseController.submit (see the comment there): without it, Export
    // CSV -> re-import into the same survey can't dedup on the first try.
    // Separate from google_response_id, which googleFormsSync.js's own
    // (unrelated) dedup path uses — this webhook doesn't set that column at
    // all today, so there's nothing to conflict with here.
    await conn.query('UPDATE responses SET external_id = ? WHERE id = ?', [String(responseId), responseId]);

    const vals = answerRecords.map(r => [responseId, r.questionId, r.answerText, r.answerJson, r.score]);

    if (vals.length) {
      await conn.query(
        'INSERT INTO response_answers (response_id, question_id, answer_text, answer_json, score) VALUES ?',
        [vals]
      );
    }

    await conn.commit();
    res.status(201).json({ message: 'Response saved', response_id: responseId });
  } catch (err) {
    await conn.rollback();
    console.error('publicResponse error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  } finally {
    conn.release();
  }
};
