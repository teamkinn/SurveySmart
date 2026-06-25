const db = require('../config/db');

exports.listUsers = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, email, first_name, last_name, role, is_active, created_at FROM users ORDER BY created_at DESC'
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
    await db.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ message: 'อัปเดต role เรียบร้อยแล้ว' });
  } catch (err) {
    console.error('adminController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id)
      return res.status(400).json({ message: 'ไม่สามารถลบบัญชีของตัวเองได้' });
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
