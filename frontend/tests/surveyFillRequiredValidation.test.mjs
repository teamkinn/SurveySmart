// SurveyFillView.vue is a Single-File Component — it can't be `require()`d
// directly without a Vue SFC compiler/bundler in the loop. The required-
// question "is this answered yet?" expression assigned to `empty` is pure
// (only reads plain q/a objects), so this test extracts its exact source out
// of the real .vue file and executes it, giving true behavioral coverage of
// the shipped code — not a hand-copied reimplementation that could drift out
// of sync. Mirrors the technique used by scaleMinMax.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const viewPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/views/SurveyFillView.vue');
const source = readFileSync(viewPath, 'utf8');

const match = source.match(/const empty = ([\s\S]*?);/);
assert.ok(match, 'could not find the `const empty = ...` required-question check in SurveyFillView.vue — has it been renamed?');
// eslint-disable-next-line no-new-func
const isEmpty = new Function('q', 'a', `return ${match[1]};`);

test('required check — a scale question answered with 0 counts as answered, not empty (regression test for the falsy-0 fix)', () => {
  const q = { question_type: 'scale' };
  const a = { score: 0, hover: 0 };
  assert.equal(isEmpty(q, a), false, 'a genuine answer of 0 must not be treated as "still empty"');
});

test('required check — a star/scale question with no answer yet (score: null) is empty', () => {
  const q = { question_type: 'star' };
  const a = { score: null, hover: 0 };
  assert.equal(isEmpty(q, a), true);
});

test('required check — checkbox/radio/text questions are unaffected by the score fix', () => {
  assert.equal(isEmpty({ question_type: 'checkbox' }, { values: [] }), true);
  assert.equal(isEmpty({ question_type: 'checkbox' }, { values: ['a'] }), false);
  assert.equal(isEmpty({ question_type: 'radio' }, { value: '' }), true);
  assert.equal(isEmpty({ question_type: 'radio' }, { value: 'yes' }), false);
  assert.equal(isEmpty({ question_type: 'short' }, { text: '  ' }), true);
  assert.equal(isEmpty({ question_type: 'short' }, { text: 'hi' }), false);
});
