const db = require('../config/db');

exports.list = async (req, res) => {
  try {
    const surveyId = req.params.surveyId;

    const [chk] = await db.query('SELECT id FROM surveys WHERE id = ?', [surveyId]);
    if (!chk.length) return res.status(404).json({ message: 'ไม่พบแบบสอบถาม' });

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

exports.submit = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { surveyId } = req.params;
    const { respondent_name, answers = [] } = req.body;

    // Only accept submissions for active surveys
    const [[survey]] = await conn.query(
      "SELECT id FROM surveys WHERE id = ? AND status = 'active'",
      [surveyId]
    );
    if (!survey) return res.status(403).json({ message: 'แบบสอบถามนี้ปิดรับคำตอบแล้ว' });

    // Input length guard
    const name = (respondent_name || 'ไม่ระบุ').slice(0, 200);

    const scores = answers.map(a => parseFloat(a.score)).filter(s => !isNaN(s));
    const overall = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    const ip = req.ip || null;

    const [resResult] = await conn.query(
      'INSERT INTO responses (survey_id, respondent_name, overall_score, ip_address) VALUES (?,?,?,?)',
      [surveyId, name, overall, ip]
    );
    const responseId = resResult.insertId;

    if (answers.length) {
      const vals = answers.map(a => [
        responseId,
        a.question_id,
        a.answer_text  ? String(a.answer_text).slice(0, 5000)  : null,
        a.answer_json  ? JSON.stringify(a.answer_json).slice(0, 10000) : null,
        a.score !== undefined ? parseFloat(a.score) || null : null,
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

exports.chartData = async (req, res) => {
  try {
    const surveyId = req.params.surveyId;
    const [chk] = await db.query('SELECT id FROM surveys WHERE id = ?', [surveyId]);
    if (!chk.length) return res.status(404).json({ message: 'ไม่พบแบบสอบถาม' });

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
      } else if (['scale', 'star'].includes(q.question_type)) {
        chartType = 'score';
        const min = opts?.min || 1, max = opts?.max || 5;
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

exports.stats = async (req, res) => {
  try {
    const surveyId = req.params.surveyId;

    const [[summary]] = await db.query(
      `SELECT COUNT(*) AS total, ROUND(AVG(overall_score),2) AS avg_score, MAX(submitted_at) AS last_at
       FROM responses WHERE survey_id = ?`,
      [surveyId]
    );

    const [breakdown] = await db.query(
      'SELECT * FROM v_question_stats WHERE survey_id = ? ORDER BY section_number, question_id',
      [surveyId]
    );

    res.json({ ...summary, breakdown });
  } catch (err) {
    console.error('responses.stats error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};
