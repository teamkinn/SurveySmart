const db = require('../config/db');

// Lightweight user lookup for the "share survey with a person" picker —
// any authenticated user may search (unlike /api/admin/users, which is
// admin-only and returns the full roster). Only returns the fields needed
// to identify someone in the picker UI, never password/role/is_active.
exports.search = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json([]);

    const like = `%${q}%`;
    const [rows] = await db.query(
      `SELECT id, username, email, first_name, last_name
       FROM users
       WHERE is_active = 1
         AND id != ?
         AND (username LIKE ? OR email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)
       ORDER BY username
       LIMIT 10`,
      [req.user.id, like, like, like, like]
    );
    res.json(rows);
  } catch (err) {
    console.error('userController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};
