const test = require('node:test');
const assert = require('node:assert/strict');

const { scoreFromLikertLabel, resolveChoiceScore } = require('../src/utils/likertScore');

test('scoreFromLikertLabel — scores the standard 5-point Thai Likert family regardless of how it is later ordered in a question\'s options', () => {
  assert.equal(scoreFromLikertLabel('น้อยที่สุด'), 1);
  assert.equal(scoreFromLikertLabel('น้อย'), 2);
  assert.equal(scoreFromLikertLabel('ปานกลาง'), 3);
  assert.equal(scoreFromLikertLabel('มาก'), 4);
  assert.equal(scoreFromLikertLabel('มากที่สุด'), 5);
});

test('scoreFromLikertLabel — is whitespace/case tolerant', () => {
  assert.equal(scoreFromLikertLabel('  มากที่สุด  '), 5);
  assert.equal(scoreFromLikertLabel('MOST'), null); // not a recognized label at all
  assert.equal(scoreFromLikertLabel('Comment'), null);
});

test('scoreFromLikertLabel — unrecognized label returns null rather than guessing', () => {
  assert.equal(scoreFromLikertLabel('อบจ.สุราษฎร์ธานี'), null);
  assert.equal(scoreFromLikertLabel(''), null);
  assert.equal(scoreFromLikertLabel(undefined), null);
});

test('resolveChoiceScore — an explicit "(n)" suffix always wins over the dictionary', () => {
  // "มากที่สุด" would normally resolve to 5 via the dictionary, but an
  // author who explicitly wrote a different score in the label gets that
  // instead — the label is treated as the source of truth for this option.
  assert.equal(resolveChoiceScore('มากที่สุด (2)'), 2);
  assert.equal(resolveChoiceScore('ดีมาก (5)'), 5);
  assert.equal(resolveChoiceScore('ตัวเลือกกำหนดเอง (3.5)'), 3.5);
});

test('resolveChoiceScore — falls back to the dictionary when there is no suffix', () => {
  assert.equal(resolveChoiceScore('มากที่สุด'), 5);
  assert.equal(resolveChoiceScore('น้อยที่สุด'), 1);
});

test('resolveChoiceScore — regression test for the survey-37 incident: best-first option ordering must NOT invert scores', () => {
  // This is the exact ก.พ.ร.-style ordering that triggered the bug: options
  // are authored best -> worst. The OLD code scored by array position
  // (index 0 -> 1), which would have given "มากที่สุด" a score of 1 instead
  // of 5. resolveChoiceScore must ignore this ordering entirely.
  const bestFirstOptions = ['มากที่สุด', 'มาก', 'ปานกลาง', 'น้อย', 'น้อยที่สุด'];
  const scores = bestFirstOptions.map(resolveChoiceScore);
  assert.deepEqual(scores, [5, 4, 3, 2, 1]);
});

test('resolveChoiceScore — an unrecognized label with no suffix returns null (left unscored, not guessed)', () => {
  assert.equal(resolveChoiceScore('อื่นๆ (โปรดระบุ)'), null);
  assert.equal(resolveChoiceScore('เพศชาย'), null);
});
