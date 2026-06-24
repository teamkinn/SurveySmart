const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const crypto       = require('crypto');
const nodemailer   = require('nodemailer');
const db           = require('../config/db');

function makeTransport() {
  if (!process.env.MAIL_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT) || 587,
    secure: process.env.MAIL_SECURE === 'true',
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
}

const signToken = (user) =>
  jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

exports.register = async (req, res) => {
  try {
    const { username, email, password, first_name, last_name } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบ' });
    if (password.length < 8)
      return res.status(400).json({ message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });

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
    const user = { id: result.insertId, username, email, role: 'user' };
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

exports.forgot = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'กรุณาระบุอีเมล' });

    const [rows] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    // Always respond the same way to prevent email enumeration
    if (!rows.length) return res.json({ message: 'หากอีเมลนี้มีในระบบ คุณจะได้รับลิงก์รีเซตรหัสผ่าน' });

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await db.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?,?,?)',
      [rows[0].id, token, expires]
    );

    const resetUrl = `${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/reset-password?token=${token}`;
    const transport = makeTransport();
    if (transport) {
      await transport.sendMail({
        from: process.env.MAIL_FROM || process.env.MAIL_USER,
        to:   email,
        subject: 'รีเซตรหัสผ่าน SurveySmart',
        html: `<p>คลิกลิงก์ด้านล่างเพื่อรีเซตรหัสผ่านของคุณ (หมดอายุใน 1 ชั่วโมง)</p>
               <p><a href="${resetUrl}">${resetUrl}</a></p>
               <p>หากคุณไม่ได้ขอรีเซต ไม่ต้องทำอะไร</p>`,
      });
      res.json({ message: 'หากอีเมลนี้มีในระบบ คุณจะได้รับลิงก์รีเซตรหัสผ่าน' });
    } else {
      // No email configured — return the link directly (dev/demo mode)
      res.json({ message: 'ไม่ได้ตั้งค่าอีเมล', resetUrl });
    }
  } catch (err) {
    res.status(500).json({ message: 'เกิดข้อผิดพลาด', error: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: 'ข้อมูลไม่ครบ' });
    if (password.length < 8) return res.status(400).json({ message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });

    const [rows] = await db.query(
      'SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > NOW()',
      [token]
    );
    if (!rows.length) return res.status(400).json({ message: 'ลิงก์หมดอายุหรือใช้ไปแล้ว' });

    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hash, rows[0].user_id]);
    await db.query('UPDATE password_resets SET used = 1 WHERE id = ?', [rows[0].id]);

    res.json({ message: 'รีเซตรหัสผ่านเรียบร้อยแล้ว' });
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
