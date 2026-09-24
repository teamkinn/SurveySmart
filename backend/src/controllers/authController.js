const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');
const { sendMail } = require('../services/mailer');

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
    if (username.length > 50)
      return res.status(400).json({ message: 'ชื่อผู้ใช้ต้องไม่เกิน 50 ตัวอักษร' });
    if (email.length > 255)
      return res.status(400).json({ message: 'อีเมลไม่ถูกต้อง' });
    if (password.length < 8)
      return res.status(400).json({ message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
    if (password.length > 128)
      return res.status(400).json({ message: 'รหัสผ่านต้องไม่เกิน 128 ตัวอักษร' });
    if (first_name && first_name.length > 100)
      return res.status(400).json({ message: 'ชื่อต้องไม่เกิน 100 ตัวอักษร' });
    if (last_name && last_name.length > 100)
      return res.status(400).json({ message: 'นามสกุลต้องไม่เกิน 100 ตัวอักษร' });

    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    if (existing.length)
      return res.status(409).json({ message: 'อีเมลหรือชื่อผู้ใช้นี้มีอยู่แล้ว' });

    const hash = await bcrypt.hash(password, 10);
    let result;
    try {
      [result] = await db.query(
        'INSERT INTO users (username, email, password, first_name, last_name) VALUES (?,?,?,?,?)',
        [username, email, hash, first_name || '', last_name || '']
      );
    } catch (e) {
      // The SELECT above and this INSERT aren't atomic — two concurrent
      // registrations with the same username/email can both pass the
      // pre-check and race here. Without this, the second one fell through
      // to the generic 500 handler below instead of the intended 409.
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'อีเมลหรือชื่อผู้ใช้นี้มีอยู่แล้ว' });
      }
      throw e;
    }
    const user = {
      id: result.insertId,
      username,
      email,
      first_name: first_name || '',
      last_name: last_name || '',
      role: 'user',
    };
    res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    console.error('register error:', {
      name: err.name,
      code: err.code,
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password)
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบ' });
    if (identifier.length > 255 || password.length > 128)
      return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง' });

    const [rows] = await db.query(
      'SELECT * FROM users WHERE email = ? OR username = ?',
      [identifier, identifier]
    );
    // Same message whether the identifier doesn't exist or the password is
    // wrong — distinguishing them lets an attacker enumerate valid accounts.
    const invalidCredentials = () => res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    if (!rows.length) return invalidCredentials();

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return invalidCredentials();

    if (!user.is_active)
      return res.status(403).json({ message: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' });

    const { password: _p, ...safe } = user;
    res.json({ token: signToken(user), user: safe });
  } catch (err) {
    console.error('login error:', {
      name: err.name,
      code: err.code,
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

// 6-digit numeric OTP (000000–999999, zero-padded so every code is exactly
// 6 characters). crypto.randomInt is cryptographically strong, unlike
// Math.random() — this is a credential, not a UI id.
function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

exports.forgot = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'กรุณาระบุอีเมล' });

    const [rows] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    // Always respond the same way to prevent email enumeration
    if (!rows.length) return res.json({ message: 'หากอีเมลนี้มีในระบบ คุณจะได้รับรหัสยืนยันสำหรับรีเซตรหัสผ่าน' });

    // Any earlier, still-unused OTP for this user becomes stale the moment a
    // new one is issued — otherwise a user who requests a second code could
    // still redeem the first, older one too.
    await db.query('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0', [rows[0].id]);

    const expires = new Date(Date.now() + 15 * 60 * 1000);
    let code;
    // The token column has a UNIQUE constraint; a 6-digit code is drawn from
    // a much smaller space than the old 32-byte hex token, so a collision
    // with another still-active code (different user) is unlikely but no
    // longer negligible — retry a few times instead of 500ing on it.
    for (let attempt = 0; ; attempt++) {
      code = generateOtp();
      try {
        await db.query(
          'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?,?,?)',
          [rows[0].id, code, expires]
        );
        break;
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY' && attempt < 4) continue;
        throw e;
      }
    }

    const used = await sendMail({
      to: email,
      subject: 'รหัสยืนยันรีเซตรหัสผ่าน SurveySmart',
      html: `<p>รหัสยืนยันสำหรับรีเซตรหัสผ่านของคุณคือ</p>
             <p style="font-size:28px;font-weight:700;letter-spacing:6px;">${code}</p>
             <p>รหัสนี้จะหมดอายุใน 15 นาที</p>
             <p>หากคุณไม่ได้ขอรีเซต ไม่ต้องทำอะไร</p>`,
    });
    if (used === 'none') {
      // No mail transport configured (e.g. local dev without RESEND_API_KEY
      // / MAIL_HOST) — the OTP would otherwise vanish with no way to
      // complete the flow. This never goes in the HTTP response (that would
      // let anyone read another user's OTP just by knowing their email),
      // only the server's own log.
      console.log(`[dev] ไม่ได้ตั้งค่าการส่งอีเมล — รหัสยืนยันรีเซตรหัสผ่านสำหรับ ${email} คือ ${code} (หมดอายุใน 15 นาที)`);
    }
    // Never return the code to the caller — even in dev mode
    res.json({ message: 'หากอีเมลนี้มีในระบบ คุณจะได้รับรหัสยืนยันสำหรับรีเซตรหัสผ่าน' });
  } catch (err) {
    console.error('forgot error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

// Shared by /verify-reset-code and /reset-password so the two endpoints
// agree on exactly what counts as a valid, live code. Does NOT mark the
// code used — /verify-reset-code only checks, /reset-password is what
// actually consumes it once the new password is set.
async function findValidReset(email, code) {
  const [userRows] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
  if (!userRows.length) return null;
  const userId = userRows[0].id;

  const [rows] = await db.query(
    'SELECT * FROM password_resets WHERE user_id = ? AND token = ? AND used = 0 AND expires_at > NOW()',
    [userId, code]
  );
  if (!rows.length) {
    await recordFailedAttempt(userId);
    return null;
  }
  return { userId };
}

// A wrong code counts against every still-live code this user has, and once
// MAX_OTP_ATTEMPTS is reached they're all marked used — the user has to
// request a fresh code. Without this, the only thing bounding guesses at a
// 6-digit code (1,000,000 possibilities) was the per-IP rate limit, which a
// handful of IPs (or the separate verify/reset limiters) multiplies.
//
// MySQL evaluates single-table UPDATE assignments left to right using the
// already-updated values, so `attempts` in the IF() below is the new count.
const MAX_OTP_ATTEMPTS = 5;
async function recordFailedAttempt(userId) {
  try {
    await db.query(
      `UPDATE password_resets
       SET attempts = attempts + 1, used = IF(attempts >= ?, 1, used)
       WHERE user_id = ? AND used = 0 AND expires_at > NOW()`,
      [MAX_OTP_ATTEMPTS, userId]
    );
  } catch (e) {
    // Database not migrated yet (migrations/006 adds `attempts`) — don't turn
    // a normal "wrong code" answer into a 500; the migration warning at boot
    // (app.js) already flags this.
    if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    console.error('recordFailedAttempt: password_resets.attempts missing — run npm run migrate');
  }
}
exports.MAX_OTP_ATTEMPTS = MAX_OTP_ATTEMPTS;

// Lets the UI confirm the OTP before showing the new-password fields,
// without spending the code yet — the code is still required again (and
// actually consumed) at /reset-password, so this step is a UX check, not a
// second factor of trust on its own.
exports.verifyResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: 'ข้อมูลไม่ครบ' });

    // Same generic invalid-code message whether the email doesn't exist or
    // the code itself is wrong/expired — otherwise this endpoint becomes a
    // way to enumerate which emails have an account.
    const invalidCode = () => res.status(400).json({ message: 'รหัสไม่ถูกต้องหรือหมดอายุ' });

    const match = await findValidReset(email, code);
    if (!match) return invalidCode();

    res.json({ valid: true });
  } catch (err) {
    console.error('verifyResetCode error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) return res.status(400).json({ message: 'ข้อมูลไม่ครบ' });
    if (password.length < 8) return res.status(400).json({ message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
    if (password.length > 128) return res.status(400).json({ message: 'รหัสผ่านต้องไม่เกิน 128 ตัวอักษร' });

    // Same generic invalid-code message whether the email doesn't exist or
    // the code itself is wrong/expired — otherwise this endpoint becomes a
    // second way (besides /forgot-password already guarding against it) to
    // enumerate which emails have an account.
    const invalidCode = () => res.status(400).json({ message: 'รหัสไม่ถูกต้องหรือหมดอายุ' });

    const match = await findValidReset(email, code);
    if (!match) return invalidCode();
    const { userId } = match;

    const hash = await bcrypt.hash(password, 10);
    // password_changed_at lets the auth middleware reject any JWT issued
    // before this moment — otherwise a token that leaked before the reset
    // (or a session left open on another device) would keep working until
    // it naturally expired instead of being cut off right here.
    await db.query(
      'UPDATE users SET password = ?, password_changed_at = NOW() WHERE id = ?',
      [hash, userId]
    );
    // Invalidate every other still-valid, unused code for this user too —
    // not just this one. Without this, an earlier forgot-password request
    // that issued a code which hasn't expired yet stayed usable right up
    // until its own 15-minute expiry, even after the password had already
    // been changed via a different (newer) code.
    await db.query('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0', [userId]);

    // Purge old/used reset codes to keep table clean
    await db.query('DELETE FROM password_resets WHERE expires_at < NOW() OR used = 1');

    res.json({ message: 'รีเซตรหัสผ่านเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('resetPassword error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.me = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, email, first_name, last_name, role, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
    res.json(rows[0]);
  } catch (err) {
    console.error('me error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};
