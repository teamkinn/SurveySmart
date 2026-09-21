const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

const { encrypt, decrypt } = require('../src/utils/credentialCrypto');

test('encrypt/decrypt — round-trips a refresh token', () => {
  const plaintext = '1//0gLongGoogleRefreshTokenValueHere';
  const encrypted = encrypt(plaintext);
  assert.notEqual(encrypted, plaintext);
  assert.equal(decrypt(encrypted), plaintext);
});

test('encrypt — two encryptions of the same value produce different ciphertext (random IV) but both decrypt correctly', () => {
  const plaintext = 'same-token-value';
  const a = encrypt(plaintext);
  const b = encrypt(plaintext);
  assert.notEqual(a, b);
  assert.equal(decrypt(a), plaintext);
  assert.equal(decrypt(b), plaintext);
});

test('decrypt — passes through a legacy plaintext value unchanged (backward compatibility regression test)', () => {
  // Tokens written before this module existed are stored as plain,
  // unprefixed text — decrypt() must not choke on those or need a manual
  // data migration to keep working.
  const legacyPlaintext = '1//0gPreExistingPlaintextRefreshToken';
  assert.equal(decrypt(legacyPlaintext), legacyPlaintext);
});

test('encrypt/decrypt — null/undefined pass through unchanged', () => {
  assert.equal(encrypt(null), null);
  assert.equal(encrypt(undefined), undefined);
  assert.equal(decrypt(null), null);
  assert.equal(decrypt(undefined), undefined);
});

test('decrypt — tampering with the ciphertext is detected (GCM auth tag)', () => {
  const encrypted = encrypt('a-secret-refresh-token');
  const tampered = encrypted.slice(0, -4) + 'abcd';
  assert.throws(() => decrypt(tampered));
});
