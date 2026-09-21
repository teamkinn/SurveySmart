// Encrypts/decrypts long-lived third-party credentials (currently:
// surveys.google_refresh_token) before they touch the database, so a DB
// leak/backup exposure doesn't also hand out live, reusable Google API
// access for every synced form — previously this column was plaintext.
//
// Key: derived (SHA-256) from an existing required app secret
// (ENCRYPTION_KEY if set, else JWT_SECRET) rather than requiring a brand
// new env var — avoids adding a deployment step that's easy to forget and
// would otherwise crash the app on boot the first time this module is used.
//
// Format: "enc:v1:" + base64(iv(12) + authTag(16) + ciphertext), AES-256-GCM.
// Backward compatible with data written before this module existed: decrypt()
// returns any value that doesn't start with the "enc:v1:" prefix unchanged,
// so already-stored plaintext refresh tokens keep working without a manual
// data migration — only newly-written tokens get encrypted, and everything
// converges to encrypted the next time each survey's token is refreshed.
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY or JWT_SECRET must be set to encrypt/decrypt stored credentials');
  }
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes for aes-256
}

function encrypt(plaintext) {
  if (plaintext == null) return plaintext;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(value) {
  if (value == null) return value;
  if (!value.startsWith(PREFIX)) return value; // legacy plaintext — see header note

  const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
