const jwt = require('jsonwebtoken');
const db = require('../config/db');

module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'ไม่มีสิทธิ์เข้าถึง' });
  }
  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Token ไม่ถูกต้องหรือหมดอายุ' });
  }

  // Re-check the account's current status/role in the database on every
  // request instead of trusting the JWT payload alone. Without this, there
  // is no token revocation: an admin suspending an account (is_active=0) or
  // demoting/promoting a role has no real effect until the old token
  // naturally expires (up to JWT_EXPIRES_IN, default 7 days) — the suspended
  // user (or the user with a stale elevated role) could keep using the
  // system for up to a week after the admin action.
  try {
    const [[user]] = await db.query(
      'SELECT id, username, email, role, is_active, password_changed_at FROM users WHERE id = ?',
      [payload.id]
    );
    if (!user || !user.is_active) {
      return res.status(401).json({ message: 'บัญชีนี้ถูกระงับการใช้งานหรือถูกลบแล้ว' });
    }

    // Reject tokens issued before the password was last changed. jwt.sign
    // stamps every token with `iat` (issued-at, epoch seconds) by default,
    // so a leaked/stale token stops working the moment the user resets
    // their password instead of staying valid until it naturally expires
    // (up to JWT_EXPIRES_IN, default 7 days).
    if (user.password_changed_at) {
      const changedAtSec = Math.floor(new Date(user.password_changed_at).getTime() / 1000);
      if (payload.iat < changedAtSec) {
        return res.status(401).json({ message: 'รหัสผ่านถูกเปลี่ยนแล้ว กรุณาเข้าสู่ระบบใหม่' });
      }
    }

    req.user = { id: user.id, username: user.username, email: user.email, role: user.role };
    next();
  } catch (err) {
    console.error('auth middleware DB check error:', err.message);
    return res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};
