const db = require('../config/db');
const { randomBytes } = require('crypto');

const genToken = () => randomBytes(32).toString('hex');

// Single source of truth for the "survey summary" shape (stats + Google
// Forms sync fields) so list/create/update never drift into returning
// different shapes for the same survey.
const SURVEY_SUMMARY_JOIN = `
  SELECT v.*, s.google_form_url, s.google_form_id, s.share_token, s.last_synced_at,
         (s.google_refresh_token IS NOT NULL) AS auto_sync_enabled
  FROM v_survey_summary v
  JOIN surveys s ON s.id = v.id
`;

exports.list = async (req, res) => {
  try {
    const [rows] = await db.query(`${SURVEY_SUMMARY_JOIN} WHERE v.user_id = ? ORDER BY v.created_at DESC`, [
      req.user.id,
    ]);
    res.json(rows);
  } catch (err) {
    console.error('surveyController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

const SURVEY_COLUMNS = `
  id, user_id, title, description, status, target_responses, close_date,
  google_form_url, google_form_id, (google_refresh_token IS NOT NULL) AS auto_sync_enabled,
  last_synced_at, share_token, view_count, created_at, updated_at,
  (SELECT COUNT(*) FROM responses r WHERE r.survey_id = surveys.id) AS response_count
`;

exports.get = async (req, res) => {
  try {
    const isAdmin = ['admin', 'head_admin'].includes(req.user.role);
    const [surveys] = await db.query(
      isAdmin
        ? `SELECT ${SURVEY_COLUMNS} FROM surveys WHERE id = ?`
        : `SELECT ${SURVEY_COLUMNS} FROM surveys WHERE id = ? AND user_id = ?`,
      isAdmin ? [req.params.id] : [req.params.id, req.user.id]
    );
    if (!surveys.length) return res.status(404).json({ message: 'ไม่พบแบบสอบถาม' });

    const [questions] = await db.query(
      'SELECT * FROM questions WHERE survey_id = ? ORDER BY section_number, sort_order',
      [req.params.id]
    );
    res.json({ ...surveys[0], questions });
  } catch (err) {
    console.error('surveyController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.create = async (req, res) => {
  try {
    const { title, description, close_date, questions, google_form_url, google_form_id } = req.body;
    if (!title) return res.status(400).json({ message: 'กรุณาระบุชื่อแบบสอบถาม' });

    const token = genToken();
    const [result] = await db.query(
      `INSERT INTO surveys
         (user_id, title, description, status, close_date, share_token, google_form_url, google_form_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        req.user.id,
        title,
        description || '',
        'draft',
        close_date || null,
        token,
        google_form_url || null,
        google_form_id || null,
      ]
    );
    const surveyId = result.insertId;

    if (Array.isArray(questions) && questions.length) {
      const vals = questions.map(q => [
        surveyId,
        q.section || 1,
        q.order || 0,
        q.text || '',
        q.type || 'short',
        q.required ? 1 : 0,
        q.options ? JSON.stringify(q.options) : null,
      ]);
      await db.query(
        `INSERT INTO questions
           (survey_id, section_number, sort_order, question_text, question_type, is_required, options_json)
         VALUES ?`,
        [vals]
      );
    }

    const [[created]] = await db.query(`${SURVEY_SUMMARY_JOIN} WHERE v.id = ?`, [surveyId]);
    res.status(201).json(created);
  } catch (err) {
    console.error('surveyController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.update = async (req, res) => {
  try {
    const { title, description, status, close_date, target_responses, questions } = req.body;
    // Only head_admin may edit surveys they don't own — a regular admin can
    // still edit their own (falls through to the ownership-scoped query).
    const isHeadAdmin = req.user.role === 'head_admin';
    const [chk] = await db.query(
      isHeadAdmin
        ? 'SELECT title, description, status, close_date, target_responses FROM surveys WHERE id = ?'
        : 'SELECT title, description, status, close_date, target_responses FROM surveys WHERE id = ? AND user_id = ?',
      isHeadAdmin ? [req.params.id] : [req.params.id, req.user.id]
    );
    if (!chk.length) return res.status(404).json({ message: 'ไม่พบแบบสอบถาม' });
    const current = chk[0];

    // Only overwrite fields the caller actually sent — a partial PUT (e.g.
    // just { status }) must not blank out the rest of the survey.
    await db.query(
      `UPDATE surveys
       SET title=?, description=?, status=?, close_date=?, target_responses=?, updated_at=NOW()
       WHERE id=?`,
      [
        title !== undefined ? title : current.title,
        description !== undefined ? description : current.description,
        status !== undefined ? status : current.status,
        close_date !== undefined ? close_date || null : current.close_date,
        target_responses !== undefined ? target_responses || null : current.target_responses,
        req.params.id,
      ]
    );

    if (Array.isArray(questions)) {
      // Replacing questions deletes the old rows, which cascades and wipes
      // response_answers for any response already tied to them (per-question
      // detail is lost even though the response and its overall_score
      // survive). Once a survey has responses, refuse to restructure its
      // questions rather than silently destroying that data.
      const [[{ c: responseCount }]] = await db.query(
        'SELECT COUNT(*) AS c FROM responses WHERE survey_id = ?',
        [req.params.id]
      );
      if (responseCount > 0) {
        return res.status(409).json({
          message: 'ไม่สามารถแก้ไขคำถามได้ เนื่องจากมีผู้ตอบแบบสอบถามนี้แล้ว',
        });
      }

      await db.query('DELETE FROM questions WHERE survey_id = ?', [req.params.id]);
      if (questions.length) {
        const vals = questions.map(q => [
          req.params.id,
          q.section || 1,
          q.order || 0,
          q.text || '',
          q.type || 'short',
          q.required ? 1 : 0,
          q.options ? JSON.stringify(q.options) : null,
        ]);
        await db.query(
          `INSERT INTO questions
             (survey_id, section_number, sort_order, question_text, question_type, is_required, options_json)
           VALUES ?`,
          [vals]
        );
      }
    }

    const [[updated]] = await db.query(`${SURVEY_SUMMARY_JOIN} WHERE v.id = ?`, [req.params.id]);
    res.json(updated);
  } catch (err) {
    console.error('surveyController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.remove = async (req, res) => {
  try {
    // Only head_admin may delete surveys they don't own.
    const isHeadAdmin = req.user.role === 'head_admin';
    const [chk] = await db.query(
      isHeadAdmin ? 'SELECT id FROM surveys WHERE id = ?' : 'SELECT id FROM surveys WHERE id = ? AND user_id = ?',
      isHeadAdmin ? [req.params.id] : [req.params.id, req.user.id]
    );
    if (!chk.length) return res.status(404).json({ message: 'ไม่พบแบบสอบถาม' });
    await db.query('DELETE FROM surveys WHERE id = ?', [req.params.id]);
    res.json({ message: 'ลบแบบสอบถามเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('surveyController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.publish = async (req, res) => {
  try {
    // Only head_admin may publish surveys they don't own.
    const isHeadAdmin = req.user.role === 'head_admin';
    const [chk] = await db.query(
      isHeadAdmin ? 'SELECT id FROM surveys WHERE id = ?' : 'SELECT id FROM surveys WHERE id = ? AND user_id = ?',
      isHeadAdmin ? [req.params.id] : [req.params.id, req.user.id]
    );
    if (!chk.length) return res.status(404).json({ message: 'ไม่พบแบบสอบถาม' });
    await db.query("UPDATE surveys SET status='active' WHERE id = ?", [req.params.id]);

    const [[s]] = await db.query('SELECT share_token FROM surveys WHERE id = ?', [req.params.id]);
    res.json({ message: 'เผยแพร่แบบสอบถามเรียบร้อยแล้ว', share_token: s.share_token });
  } catch (err) {
    console.error('surveyController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.listOthers = async (req, res) => {
  try {
    const isAdmin = ['admin', 'head_admin'].includes(req.user.role);
    const [rows] = await db.query(
      `SELECT vs.*, u.first_name, u.last_name, u.username AS owner_username
       FROM v_survey_summary vs
       JOIN users u ON u.id = vs.user_id
       WHERE vs.user_id != ?
       ${isAdmin ? '' : "AND vs.status != 'draft'"}
       ORDER BY vs.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('surveyController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.listShared = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT vs.*, u.first_name, u.last_name, u.username AS owner_username
       FROM v_survey_summary vs
       JOIN survey_shares ss ON ss.survey_id = vs.id
       JOIN users u ON u.id = vs.user_id
       WHERE ss.shared_with_id = ?
       ORDER BY vs.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('surveyController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.share = async (req, res) => {
  try {
    const { email } = req.body;
    const [chk] = await db.query(
      'SELECT id FROM surveys WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!chk.length) return res.status(404).json({ message: 'ไม่พบแบบสอบถาม' });

    const [target] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (!target.length) return res.status(404).json({ message: 'ไม่พบผู้ใช้งานอีเมลนี้' });
    if (target[0].id === req.user.id) return res.status(400).json({ message: 'ไม่สามารถแชร์ให้ตัวเองได้' });

    await db.query(
      'INSERT IGNORE INTO survey_shares (survey_id, shared_with_id) VALUES (?,?)',
      [req.params.id, target[0].id]
    );
    res.json({ message: 'แชร์แบบสอบถามเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('surveyController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.stats = async (req, res) => {
  try {
    const userId = req.user.id;
    const [[totals]] = await db.query(
      `SELECT
         COUNT(*)                   AS total,
         SUM(status='active')       AS active,
         SUM(status='draft')        AS draft,
         SUM(status='closed')       AS closed
       FROM surveys WHERE user_id = ?`,
      [userId]
    );
    const [[resp]] = await db.query(
      `SELECT
         COALESCE(SUM(response_count),0)      AS total_responses,
         ROUND(AVG(NULLIF(avg_score,0)),2)    AS overall_avg
       FROM v_survey_summary WHERE user_id = ?`,
      [userId]
    );
    res.json({ ...totals, ...resp });
  } catch (err) {
    console.error('surveyController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

// Public endpoint — anyone with the share_token can view the survey form
exports.getByToken = async (req, res) => {
  try {
    const [surveys] = await db.query(
      "SELECT id, title, description FROM surveys WHERE share_token = ? AND status = 'active'",
      [req.params.token]
    );
    if (!surveys.length) return res.status(404).json({ message: 'ไม่พบแบบสอบถามหรือปิดรับแล้ว' });

    const [questions] = await db.query(
      `SELECT id, section_number, sort_order, question_text, question_type, is_required, options_json
       FROM questions
       WHERE survey_id = ?
       ORDER BY section_number, sort_order`,
      [surveys[0].id]
    );

    await db.query('UPDATE surveys SET view_count = view_count + 1 WHERE id = ?', [surveys[0].id]);
    res.json({ ...surveys[0], questions });
  } catch (err) {
    console.error('surveyController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};
