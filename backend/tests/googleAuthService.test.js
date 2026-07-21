const test = require('node:test');
const assert = require('node:assert/strict');

const svc = require('../src/services/googleAuth');

test('OAuth tokens are only returned to the user who registered the state', () => {
  const state = 'state-owned-by-42';
  svc.registerPendingState(state, 42);
  svc.storeTokens(state, { access_token: 'tok-for-42' });

  assert.deepEqual(svc.getTokens(state, 42), { access_token: 'tok-for-42' });
});

test('OAuth tokens are NOT returned to a different user (regression test for the cross-user fix)', () => {
  const state = 'state-owned-by-7';
  svc.registerPendingState(state, 7);
  svc.storeTokens(state, { access_token: 'tok-for-7' });

  // A different, unrelated authenticated user must not be able to claim
  // user 7's tokens just by knowing/guessing the state value.
  assert.equal(svc.getTokens(state, 999), undefined);
});

test('getTokens on an unregistered state returns undefined regardless of user', () => {
  assert.equal(svc.getTokens('never-registered-state', 1), undefined);
});

test('removeTokens clears both the token and its ownership record', () => {
  const state = 'state-to-remove';
  svc.registerPendingState(state, 3);
  svc.storeTokens(state, { access_token: 'temp' });
  svc.removeTokens(state);
  assert.equal(svc.getTokens(state, 3), undefined);
});

test('verifyPendingState is single-use (the CSRF state can only be consumed once)', () => {
  const state = 'csrf-state-1';
  svc.registerPendingState(state, 1);
  assert.equal(svc.verifyPendingState(state), true);
  assert.equal(svc.verifyPendingState(state), false);
});

test('verifyPendingState rejects a state that was never registered', () => {
  assert.equal(svc.verifyPendingState('totally-made-up-state'), false);
});

test('hasTokens — powers the oauth-status polling endpoint; true only for the owning user once tokens exist', () => {
  const state = 'poll-state-1';
  svc.registerPendingState(state, 11);
  assert.equal(svc.hasTokens(state, 11), false, 'not ready until storeTokens() is called');

  svc.storeTokens(state, { access_token: 'tok' });
  assert.equal(svc.hasTokens(state, 11), true);
  assert.equal(svc.hasTokens(state, 22), false, 'a different user must not see it as ready');
});
