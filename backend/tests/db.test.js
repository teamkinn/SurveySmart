const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const { isStaleConnectionError, isReadOnly } = db._internals;

test.after(async () => {
  try { await db.end(); } catch { /* nothing was ever connected */ }
});

test('isStaleConnectionError — recognizes dead-socket errors, not real SQL errors', () => {
  assert.equal(isStaleConnectionError({ code: 'PROTOCOL_CONNECTION_LOST' }), true);
  assert.equal(isStaleConnectionError({ code: 'ECONNRESET' }), true);
  assert.equal(isStaleConnectionError({ message: "Can't add new command when connection is in closed state" }), true);
  assert.equal(isStaleConnectionError({ code: 'ER_PARSE_ERROR', message: 'syntax' }), false);
  assert.equal(isStaleConnectionError({ code: 'ER_DUP_ENTRY' }), false);
});

test('isReadOnly — only SELECT/SHOW are retried, never writes', () => {
  assert.equal(isReadOnly('  SELECT id FROM users'), true);
  assert.equal(isReadOnly({ sql: 'select 1' }), true);
  assert.equal(isReadOnly('INSERT INTO responses VALUES (1)'), false);
  assert.equal(isReadOnly('UPDATE users SET x=1'), false);
  assert.equal(isReadOnly('DELETE FROM surveys'), false);
});
