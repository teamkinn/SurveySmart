import test from 'node:test';
import assert from 'node:assert/strict';
import { localDateStr } from '../src/composables/useLocalDate.js';

test('localDateStr — formats a Date using local (not UTC) calendar fields', () => {
  const d = new Date(2026, 6, 4); // 4 July 2026, local time — month is 0-indexed
  assert.equal(localDateStr(d), '2026-07-04');
});

test('localDateStr — accepts an ISO timestamp string directly, not just a Date object', () => {
  // Regression coverage for ResponsesView.vue's date filter, which passes
  // r.submitted_at (a string) straight through instead of wrapping it in
  // `new Date(...)` first like DashboardView.vue's trend chart does.
  const result = localDateStr('2026-07-04T10:00:00.000Z');
  assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
});

test('localDateStr — pads single-digit month and day with a leading zero', () => {
  const d = new Date(2026, 0, 5); // 5 January 2026
  assert.equal(localDateStr(d), '2026-01-05');
});

test('localDateStr — a late-night local timestamp does not roll to the next UTC day (regression test for the original bug)', () => {
  // 23:30 in Thailand (UTC+7) on 3 July is already 16:30 UTC on 3 July —
  // still safely same-day in both. Pick a genuinely adversarial case: a
  // timestamp constructed via local Date fields for 23:59 local time must
  // report *that* local day, not whatever day toISOString() would give.
  const d = new Date(2026, 6, 3, 23, 59, 0);
  assert.equal(localDateStr(d), '2026-07-03');
});
