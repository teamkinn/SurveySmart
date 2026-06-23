const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

const signToken = (user) =>
  jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

exports.register = async (req, res) => {
  try {
    const { username, email, password, first_name, last_name } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบ' });

    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    if (existing.length)
      return res.status(409).json({ message: 'อีเมลหรือชื่อผู้ใช้นี้มีอยู่แล้ว' });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (username, email, password, first_name, last_name) VALUES (?,?,?,?,?)',
      [username, email, hash, first_name || '', last_name || '']
    );
    const user = { id: result.insertId, username, email };
    res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password)
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบ' });

    const [rows] = await db.query(
      'SELECT * FROM users WHERE email = ? OR username = ?',
      [identifier, identifier]
    );
    if (!rows.length)
      return res.status(401).json({ message: 'ไม่พบผู้ใช้งานนี้' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ message: 'รหัสผ่านไม่ถูกต้อง' });

    const { password: _p, ...safe } = user;
    res.json({ token: signToken(user), user: safe });
  } catch (err) {
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: err.message });
  }
};

exports.me = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, email, first_name, last_name, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: err.message });
  }
};
