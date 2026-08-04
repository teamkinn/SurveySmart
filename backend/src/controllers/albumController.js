const db = require('../config/db');

// Only accept the fixed palette offered in the UI's color-swatch picker —
// keeps stored colors predictable and rules out someone POSTing arbitrary
// CSS (e.g. "red; background-image:url(...)"). Mirrors the swatches shown
// in AlbumSidebar.vue.
const ALLOWED_COLORS = ['#1A56A0', '#C9A84C', '#166534', '#B91C1C', '#7C3AED'];
const DEFAULT_COLOR = ALLOWED_COLORS[0];

function normalizeColor(color) {
  return ALLOWED_COLORS.includes(color) ? color : DEFAULT_COLOR;
}

// Coerces any body value into a trimmed name string, safely — used by both
// create() and update(). Two things a naive `(v || '').trim()` gets wrong:
// a non-string truthy value (e.g. a number) has no .trim() and throws,
// turning a 400-worthy bad request into a 500; and `null` is not `undefined`
// so a caller distinguishing "field omitted" from "field explicitly sent"
// via `!== undefined` lets `null` slip through as the 4-character string
// "null" instead of being treated as empty/invalid.
function sanitizeName(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

// Albums are private per-user (no sharing/collaboration on categorization
// itself, distinct from survey_shares) — every query below scopes to
// req.user.id, including for admins. An admin managing someone else's
// surveys (surveyController.update/remove use isHeadAdmin bypasses) still
// only ever assigns them into their OWN albums; there's no cross-user
// album concept to bypass into.

exports.list = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.id, a.name, a.color, a.created_at,
              (SELECT COUNT(*) FROM surveys s WHERE s.album_id = a.id) AS survey_count
       FROM survey_albums a
       WHERE a.user_id = ?
       ORDER BY a.created_at ASC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('albumController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.create = async (req, res) => {
  try {
    const name = sanitizeName(req.body.name);
    if (!name) return res.status(400).json({ message: 'กรุณาระบุชื่ออัลบัม' });
    if (name.length > 100) return res.status(400).json({ message: 'ชื่ออัลบัมต้องไม่เกิน 100 ตัวอักษร' });
    const color = normalizeColor(req.body.color);

    const [result] = await db.query(
      'INSERT INTO survey_albums (user_id, name, color) VALUES (?,?,?)',
      [req.user.id, name, color]
    );
    res.status(201).json({ id: result.insertId, name, color, survey_count: 0 });
  } catch (err) {
    console.error('albumController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

exports.update = async (req, res) => {
  try {
    const [chk] = await db.query(
      'SELECT id, name, color FROM survey_albums WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!chk.length) return res.status(404).json({ message: 'ไม่พบอัลบัม' });
    const current = chk[0];

    // Only treat the name as "the caller wants to change it" when the field
    // was actually sent — `undefined` means omitted (PATCH is partial, keep
    // current.name), but an explicit `null`/number/array must still be
    // validated as a real (if invalid) attempt to change it, not silently
    // stringified — see sanitizeName().
    const name = req.body.name !== undefined ? sanitizeName(req.body.name) : current.name;
    if (!name) return res.status(400).json({ message: 'กรุณาระบุชื่ออัลบัม' });
    if (name.length > 100) return res.status(400).json({ message: 'ชื่ออัลบัมต้องไม่เกิน 100 ตัวอักษร' });
    const color = req.body.color !== undefined ? normalizeColor(req.body.color) : current.color;

    await db.query('UPDATE survey_albums SET name = ?, color = ? WHERE id = ?', [name, color, req.params.id]);
    res.json({ id: Number(req.params.id), name, color });
  } catch (err) {
    console.error('albumController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

// Deleting an album un-categorizes its surveys (ON DELETE SET NULL on
// surveys.album_id — see database/migrations/003_survey_albums.sql) rather
// than deleting them.
exports.remove = async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM survey_albums WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'ไม่พบอัลบัม' });
    res.json({ message: 'ลบอัลบัมเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('albumController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};

// PATCH /api/surveys/:id/album — assign (album_id: number) or unassign
// (album_id: null) a survey. Lives here (not surveyController) because the
// only new state it touches is album-related, but it's mounted under
// /api/surveys/:id/album (see routes/surveys.js) since the resource being
// modified is the survey.
//
// Only the survey's owner may re-categorize it — unlike
// surveyController.update/remove, head_admin does NOT get a bypass here:
// albums are a personal organizing tool, not something an admin should be
// silently rearranging in someone else's workspace while doing unrelated
// moderation.
exports.setSurveyAlbum = async (req, res) => {
  try {
    const albumId = req.body.album_id === null || req.body.album_id === undefined
      ? null
      : Number(req.body.album_id);
    if (albumId !== null && !Number.isInteger(albumId)) {
      return res.status(400).json({ message: 'album_id ไม่ถูกต้อง' });
    }

    const [surveyChk] = await db.query(
      'SELECT id FROM surveys WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!surveyChk.length) return res.status(404).json({ message: 'ไม่พบแบบสอบถาม' });

    if (albumId !== null) {
      const [albumChk] = await db.query(
        'SELECT id FROM survey_albums WHERE id = ? AND user_id = ?',
        [albumId, req.user.id]
      );
      if (!albumChk.length) return res.status(404).json({ message: 'ไม่พบอัลบัม' });
    }

    await db.query('UPDATE surveys SET album_id = ? WHERE id = ?', [albumId, req.params.id]);
    res.json({ id: Number(req.params.id), album_id: albumId });
  } catch (err) {
    console.error('albumController error:', err.message);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดภายในระบบ' });
  }
};
