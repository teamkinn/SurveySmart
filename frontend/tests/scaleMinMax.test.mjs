// SurveyFillView.vue is a Single-File Component — it can't be `require()`d
// directly without a Vue SFC compiler/bundler in the loop. scaleMin/scaleMax
// are pure functions with no Vue dependency (they only read a plain `q`
// object), so this test extracts their exact source out of the real .vue
// file and executes it, giving true behavioral coverage of the shipped
// code — not a hand-copied reimplementation that could drift out of sync.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const viewPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/views/SurveyFillView.vue');
const source = readFileSync(viewPath, 'utf8');

function extractFn(name) {
  const re = new RegExp(`function ${name}\\(q\\)\\s*\\{[^}]*\\}`);
  const match = source.match(re);
  assert.ok(match, `could not find function ${name}(q) in SurveyFillView.vue — has it been renamed?`);
  // eslint-disable-next-line no-new-func
  return new Function('q', match[0].slice(match[0].indexOf('{') + 1, -1));
}

const scaleMin = extractFn('scaleMin');
const scaleMax = extractFn('scaleMax');

test('scaleMin — a configured min of 0 is preserved (regression test for the ?? fix)', () => {
  const q = { options_json: { min: 0, max: 10 } };
  assert.equal(scaleMin(q), 0, 'min:0 must not be coerced to the 1 default');
  assert.equal(scaleMax(q), 10);
});

test('scaleMin/scaleMax — fall back to 1/5 when no options are configured', () => {
  assert.equal(scaleMin({ options_json: null }), 1);
  assert.equal(scaleMax({ options_json: null }), 5);
});

test('scaleMin/scaleMax — a JSON-string options_json (as stored pre-parse) does not throw', () => {
  // options_json can arrive as a raw string in some code paths — these
  // functions don't JSON.parse it themselves (that's parseOpts' job for
  // arrays), so a string value should just fall through to the default
  // rather than throwing.
  assert.equal(scaleMin({ options_json: '{"min":2,"max":8}' }), 1);
});
