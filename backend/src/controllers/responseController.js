const db = require('../config/db');
const { randomBytes } = require('crypto');

exports.list = async (req, res) => {
  try {
    const surveyId = req.params.surveyId;

    // Verify ownership or shared access
    const [access] = await db.query(
      `SELECT id FROM surveys WHERE id = ? AND (user_id = ? OR id IN (SELECT survey_id FROM survey_shares WHERE shared_with_id = ?))`,
      [surveyId, req.user.id, req.user.id]
    );
    if (!access.length) return res.status(403).json({ message: 'ไม่มีสิทธิ์เข้าถึง' });

    const [rows] = await db.query(
      `SELECT r.*,
              JSON_ARRAYAGG(
                JSON_OBJECT(
                  'question_id',   ra.question_id,
                  'answer_text',   ra.answer_text,
                  'answer_json',   ra.answer_json,
                  'score',         ra.score,
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
    res.status(500).json({ message: err.message });
  }
};

exports.submit = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { surveyId } = req.params;
    const { respondent_name, answers = [] } = req.body;

    // Compute overall score from numeric answers
    const scores = answers.map(a => parseFloat(a.score)).filter(s => !isNaN(s));
    const overall = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || null;

    const [resResult] = await conn.query(
      'INSERT INTO responses (survey_id, respondent_name, overall_score, ip_address) VALUES (?,?,?,?)',
      [surveyId, respondent_name || 'ไม่ระบุ', overall, ip]
    );
    const responseId = resResult.insertId;

    if (answers.length) {
      const vals = answers.map(a => [
        responseId,
        a.question_id,
        a.answer_text  || null,
        a.answer_json  ? JSON.stringify(a.answer_json) : null,
        a.score        !== undefined ? parseFloat(a.score) || null : null,
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
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

exports.chartData = async (req, res) => {
  try {
    const surveyId = req.params.surveyId;
    const [access] = await db.query(
      `SELECT id FROM surveys WHERE id = ? AND (user_id = ? OR id IN (SELECT survey_id FROM survey_shares WHERE shared_with_id = ?))`,
      [surveyId, req.user.id, req.user.id]
    );
    if (!access.length) return res.status(403).json({ message: 'ไม่มีสิทธิ์เข้าถึง' });

    // Get all questions for this survey
    const [questions] = await db.query(
      'SELECT id, question_text, question_type, options_json FROM questions WHERE survey_id = ? ORDER BY section_number, sort_order',
      [surveyId]
    );

    // Get all answers
    const [answers] = await db.query(
      `SELECT ra.question_id, ra.answer_text, ra.answer_json, ra.score
       FROM response_answers ra
       JOIN responses r ON r.id = ra.response_id
       WHERE r.survey_id = ?`,
      [surveyId]
    );

    const charts = questions.map(q => {
      const qAnswers = answers.filter(a => a.question_id === q.id);
      const opts = (() => { try { return JSON.parse(q.options_json) || []; } catch { return []; } })();

      let chartType = 'none';
      let data = [];

      if (['radio', 'checkbox', 'dropdown'].includes(q.question_type)) {
        chartType = 'bar';
        const labels = Array.isArray(opts) ? opts : [];
        const counts = {};
        labels.forEach(l => counts[l] = 0);
        qAnswers.forEach(a => {
          let parsed = null;
          try { parsed = JSON.parse(a.answer_json); } catch {}
          if (parsed?.value) counts[parsed.value] = (counts[parsed.value] || 0) + 1;
          if (parsed?.values) parsed.values.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
        });
        data = labels.map(l => ({ label: l, count: counts[l] || 0 }));
      } else if (['scale', 'star'].includes(q.question_type)) {
        chartType = 'score';
        const min = opts?.min || 1, max = opts?.max || 5;
        const counts = {};
        for (let i = min; i <= max; i++) counts[i] = 0;
        qAnswers.forEach(a => {
          let parsed = null;
          try { parsed = JSON.parse(a.answer_json); } catch {}
          const v = parsed?.score ?? a.score;
          if (v !== null && v !== undefined) counts[Math.round(v)] = (counts[Math.round(v)] || 0) + 1;
        });
        data = Object.entries(counts).map(([k, v]) => ({ label: k, count: v }));
      } else if (['short', 'para'].includes(q.question_type)) {
        chartType = 'text';
        data = qAnswers.slice(0, 5).map(a => a.answer_text).filter(Boolean);
      }

      const total = qAnswers.length;
      return { question_id: q.id, question_text: q.question_text, question_type: q.question_type, chartType, data, total };
    });

    res.json(charts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.stats = async (req, res) => {
  try {
    const surveyId = req.params.surveyId;
    const [[summary]] = await db.query(
      `SELECT COUNT(*) AS total, ROUND(AVG(overall_score),2) AS avg_score, MAX(submitted_at) AS last_at
       FROM responses WHERE survey_id = ?`,
      [surveyId]
    );

    // Per-question stats using the view
    const [breakdown] = await db.query(
      'SELECT * FROM v_question_stats WHERE survey_id = ? ORDER BY section_number, question_id',
      [surveyId]
    );

    res.json({ ...summary, breakdown });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
