const test = require('node:test');
const assert = require('node:assert/strict');

const { todayInBangkok, OPEN_BY_CLOSE_DATE_SQL } = require('../src/utils/bangkokDate');

test('todayInBangkok — 23:30 UTC is already the next day in Thailand (UTC+7)', () => {
  assert.equal(todayInBangkok(new Date('2026-09-30T23:30:00Z')), '2026-10-01');
});

test('todayInBangkok — 16:59 UTC is still the same day in Thailand', () => {
  assert.equal(todayInBangkok(new Date('2026-09-30T16:59:00Z')), '2026-09-30');
});

test('todayInBangkok — 17:00 UTC is exactly Thai midnight (next day)', () => {
  assert.equal(todayInBangkok(new Date('2026-09-30T17:00:00Z')), '2026-10-01');
});

test('OPEN_BY_CLOSE_DATE_SQL — close_date is inclusive (open through the whole closing day)', () => {
  assert.match(OPEN_BY_CLOSE_DATE_SQL, /close_date IS NULL/);
  assert.match(OPEN_BY_CLOSE_DATE_SQL, /close_date >= \?/);
});
