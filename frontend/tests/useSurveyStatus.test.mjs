// Node's built-in test runner, run directly against the ES module — no
// bundler or test framework install needed since this composable is plain,
// framework-free JavaScript (no Vue APIs used).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDate,
  badgeClass,
  badgeText,
  interpClass,
  interpText,
} from '../src/composables/useSurveyStatus.js';

test('formatDate — formats a date string and returns an em-dash for empty input', () => {
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate(''), '—');
  assert.equal(typeof formatDate('2026-01-15'), 'string');
  assert.notEqual(formatDate('2026-01-15'), '—');
});

test('badgeClass — maps each survey status to exactly one active class', () => {
  assert.deepEqual(badgeClass('active'), { 'badge-active': true, 'badge-draft': false, 'badge-closed': false });
  assert.deepEqual(badgeClass('draft'), { 'badge-active': false, 'badge-draft': true, 'badge-closed': false });
  assert.deepEqual(badgeClass('closed'), { 'badge-active': false, 'badge-draft': false, 'badge-closed': true });
});

test('badgeText — returns the expected label per status', () => {
  assert.equal(badgeText('active'), '🟢 Active');
  assert.equal(badgeText('draft'), '✏️ Draft');
  assert.equal(badgeText('closed'), '⬜ Closed');
});

test('interpClass/interpText — score-band thresholds are inclusive at each boundary', () => {
  assert.equal(interpClass(4.5), 'interp-5');
  assert.equal(interpClass(4.49), 'interp-4');
  assert.equal(interpClass(3.5), 'interp-4');
  assert.equal(interpClass(2.5), 'interp-3');
  assert.equal(interpClass(1.5), 'interp-2');
  assert.equal(interpClass(1.49), 'interp-1');

  assert.equal(interpText(5), 'ดีมาก');
  assert.equal(interpText(1), 'ควรปรับปรุง');
});
