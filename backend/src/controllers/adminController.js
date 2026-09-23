const db = require('../config/db');

// Shared by setRole/setStatus/deleteUser below — a head_admin's own
// self-action is already blocked (parseInt(req.params.id) === req.user.id
// checks in each), but nothing stopped one head_admin from demoting,
// suspending, or deleting ANOTHER head_admin account. Since setRole/
// setStatus/deleteUser are all gated to head_admin only (routes/admin.js),
// that meant any head_admin could unilaterally strip another head_admin
// of their access with no recourse. Returns true only for an existing
// head_admin target, so a not-found id still falls through to each
// caller's own 'user not found' handling instead of being silently
// swallowed here.
async function isHeadAdminAccount(id) {
  const [[row]] = await db.query('SELECT role FROM users WHERE id = ?', [id]);
  return row?.role === 'head_admin';
}

exports.listUsers = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, username, email, first_name, last_name, role, is_active, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('adminController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

// Every survey in the system, regardless of owner or share status — this is
// what makes the Admin Panel's "แบบสอบถามทั้งหมด" tab different from
// แชร์ให้ฉันดู (which only lists *other* users' surveys, and hides drafts
// from non-admins). Both admin and head_admin may view/manage this.
exports.listSurveys = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT vs.*, u.first_name, u.last_name, u.username AS owner_username, u.email AS owner_email
       FROM v_survey_summary vs
       JOIN users u ON u.id = vs.user_id
       ORDER BY vs.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('adminController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.setRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role))
      return res.status(400).json({ message: 'role ต้องเป็น user หรือ admin' });
    if (parseInt(req.params.id) === req.user.id)
      return res.status(400).json({ message: 'ไม่สามารถเปลี่ยน role ของตัวเองได้' });
    if (await isHeadAdminAccount(req.params.id))
      return res.status(403).json({ message: 'ไม่สามารถเปลี่ยน role ของ Head Admin คนอื่นได้' });
    await db.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ message: 'อัปเดต role เรียบร้อยแล้ว' });
  } catch (err) {
    console.error('adminController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.setStatus = async (req, res) => {
  try {
    const { is_active } = req.body;
    if (![0, 1, true, false].includes(is_active))
      return res.status(400).json({ message: 'is_active ต้องเป็น true หรือ false' });
    if (parseInt(req.params.id) === req.user.id)
      return res.status(400).json({ message: 'ไม่สามารถระงับบัญชีของตัวเองได้' });
    if (await isHeadAdminAccount(req.params.id))
      return res.status(403).json({ message: 'ไม่สามารถระงับบัญชีของ Head Admin คนอื่นได้' });
    const active = is_active ? 1 : 0;
    await db.query('UPDATE users SET is_active = ? WHERE id = ?', [active, req.params.id]);
    res.json({ message: active ? 'เปิดใช้งานบัญชีเรียบร้อยแล้ว' : 'ระงับบัญชีเรียบร้อยแล้ว', is_active: active });
  } catch (err) {
    console.error('adminController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id)
      return res.status(400).json({ message: 'ไม่สามารถลบบัญชีของตัวเองได้' });
    if (await isHeadAdminAccount(req.params.id))
      return res.status(403).json({ message: 'ไม่สามารถลบบัญชีของ Head Admin คนอื่นได้' });
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'ลบผู้ใช้เรียบร้อยแล้ว' });
  } catch (err) {
    console.error('adminController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.deleteNullResponses = async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM responses WHERE survey_id = ? AND overall_score IS NULL',
      [req.params.surveyId]
    );
    res.json({ message: `ลบ ${result.affectedRows} คำตอบที่ไม่มีคะแนน`, deleted: result.affectedRows });
  } catch (err) {
    console.error('adminController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};
