// Central place for turning a radio/dropdown/grid-column LABEL into a
// numeric score, for every code path that only has display text to work
// from (CSV import, Google Forms sync, the Apps Script webhook) — as
// opposed to 'star'/'scale' questions, which already carry the number
// directly from the client.
//
// Why this exists: those paths used to GUESS a label's score from its
// POSITION in the question's options array (index 0 -> 1, index 1 -> 2, …).
// That only works if options happen to be authored worst-to-best. This
// app's own 'scale' question type documents the opposite convention
// (options_json.min_label = "น้อยที่สุด", max_label = "มากที่สุด" — i.e.
// "มากที่สุด" is the HIGH end), and Thai ก.พ.ร.-style satisfaction surveys
// are very commonly laid out best-option-first ("มากที่สุด, มาก, ปานกลาง,
// น้อย, น้อยที่สุด"). On a survey using that order, the old position guess
// silently inverted every score (มากที่สุด -> 1 instead of 5) — that's what
// happened to survey #37 (avg_score showed ~1.8/5 despite almost every
// answer being "มากที่สุด"/"มาก"). This module removes the guess entirely:
// score now comes from a fixed label dictionary, so it no longer depends
// on option order at all. Extend the dictionary below for a new label
// family rather than reintroducing a position-based fallback.

const normalize = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

// 5-point Thai Likert families in common use, worst -> best. All normalized
// onto a 1-5 scale (5 = most positive), matching this app's 'scale'
// question convention (max = "มากที่สุด"-equivalent).
const FIVE_POINT_FAMILIES = [
  ['น้อยที่สุด', 'น้อย', 'ปานกลาง', 'มาก', 'มากที่สุด'],
  ['ไม่ดีเลย', 'ไม่ดี', 'ปานกลาง', 'ดี', 'ดีมาก'],
  ['ต้องปรับปรุงอย่างมาก', 'ต้องปรับปรุง', 'พอใช้', 'ดี', 'ดีเยี่ยม'],
  ['ไม่เห็นด้วยอย่างยิ่ง', 'ไม่เห็นด้วย', 'ไม่แน่ใจ', 'เห็นด้วย', 'เห็นด้วยอย่างยิ่ง'],
  ['ไม่พึงพอใจอย่างยิ่ง', 'ไม่พึงพอใจ', 'ปานกลาง', 'พึงพอใจ', 'พึงพอใจอย่างยิ่ง'],
];

const LABEL_TO_SCORE = new Map();
for (const family of FIVE_POINT_FAMILIES) {
  family.forEach((label, i) => LABEL_TO_SCORE.set(normalize(label), i + 1));
}
// Common yes/no phrasing some surveys use for a "level" question — a
// separate 2-point scale, not part of the 5-point families above.
LABEL_TO_SCORE.set(normalize('ไม่ใช่'), 0);
LABEL_TO_SCORE.set(normalize('ใช่'), 1);

// Returns a numeric score for a plain-text label, or null when the label
// isn't a recognized standard phrase. Callers must NOT fall back to
// guessing from array position — null means "couldn't determine this
// one, leave it unscored" so an unrecognized wording surfaces as a gap to
// fix (e.g. via the importer's unscored-answer count), instead of quietly
// producing a wrong number.
function scoreFromLikertLabel(label) {
  const key = normalize(label);
  return LABEL_TO_SCORE.has(key) ? LABEL_TO_SCORE.get(key) : null;
}

// Full resolution for a radio/dropdown answer's raw text: an explicit
// "label (n)" suffix — the survey author's own explicit score — always
// wins; otherwise fall back to the label dictionary above. Never falls
// back to the question's options-array position.
function resolveChoiceScore(text) {
  const s = String(text ?? '');
  const m = s.match(/\((\d+(?:\.\d+)?)\)\s*$/);
  if (m) return parseFloat(m[1]);
  return scoreFromLikertLabel(s);
}

module.exports = { scoreFromLikertLabel, resolveChoiceScore };
