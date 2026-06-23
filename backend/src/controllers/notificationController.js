const db = require('../config/db');

exports.list = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.markRead = async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ message: 'อ่านแล้ว' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ message: 'อ่านทั้งหมดแล้ว' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
