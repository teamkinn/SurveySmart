const db = require('../config/db');

exports.submitFromGoogleForm = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { formId } = req.params;
    const { respondent_name, answers = [] } = req.body;

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
    const [questions] = await conn.query(
      'SELECT id, question_type FROM questions WHERE survey_id = ? ORDER BY section_number, sort_order, id',
      [survey.id]
    );

    // Compute overall_score from star/scale answers or radio with "(n)" pattern
    const scores = [];
    answers.forEach((a, i) => {
      const q = questions[i];
      if (!q) return;
      if (['star', 'scale'].includes(q.question_type)) {
        const s = parseFloat(a.answer_text);
        if (!isNaN(s)) scores.push(s);
      } else if (q.question_type === 'radio') {
        const m = (a.answer_text || '').match(/\((\d+(?:\.\d+)?)\)\s*$/);
        if (m) scores.push(parseFloat(m[1]));
      }
    });
    const overall = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || null;

    const [resResult] = await conn.query(
      'INSERT INTO responses (survey_id, respondent_name, overall_score, ip_address) VALUES (?,?,?,?)',
      [survey.id, respondent_name || 'ไม่ระบุ', overall, ip]
    );
    const responseId = resResult.insertId;

    const vals = [];
    answers.forEach((a, i) => {
      const q = questions[i];
      if (!q) return;

      let answerText = a.answer_text || null;
      let answerJson = null;
      let score = null;

      if (['star', 'scale'].includes(q.question_type)) {
        const s = parseFloat(a.answer_text);
        if (!isNaN(s)) { score = s; answerJson = JSON.stringify({ score: s }); }
      } else if (['radio', 'dropdown'].includes(q.question_type)) {
        const m = (a.answer_text || '').match(/\((\d+(?:\.\d+)?)\)\s*$/);
        if (m) score = parseFloat(m[1]);
        answerJson = JSON.stringify({ value: a.answer_text });
      } else if (q.question_type === 'checkbox') {
        const values = (a.answer_text || '').split(', ').filter(Boolean);
        answerJson = JSON.stringify({ values });
      }

      vals.push([responseId, q.id, answerText, answerJson, score]);
    });

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
