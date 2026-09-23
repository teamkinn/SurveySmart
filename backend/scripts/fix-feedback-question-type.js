#!/usr/bin/env node
/**
 * fix-feedback-question-type.js
 *
 * One-time (but safe to re-run) data fix for the bug reported against
 * DashboardView.vue: a question whose text is clearly an open-feedback
 * prompt (e.g. "ข้อเสนอแนะเพิ่มเติม") but was imported/created with a
 * categorical question_type ('radio'/'checkbox'/'dropdown') instead of
 * free text ('para'/'short'). The frontend now has a keyword-based fallback
 * (DashboardView.vue's / ResponsesView.vue's isFeedbackChart) that routes
 * such a question's answers into the ความคิดเห็นล่าสุด comments panel
 * regardless of its stored type — but the question itself was still typed
 * wrong at the source, which meant it kept rendering as a bar-chart
 * "distribution" of individual free-text answers in the รายคำถาม tab.
 *
 * This script finds every question whose text matches the same
 * FEEDBACK_KEYWORDS used by the frontend, is NOT a genuine Likert rating
 * question (same isLikertScale check as responseController.chartData —
 * skips e.g. "ระดับความคิดเห็นต่อ..." radio questions whose options are a
 * real มาก/มากที่สุด scale), and isn't already 'para'/'short'/'date'/'time'/
 * 'file'. It reclassifies matches to 'para' and clears options_json to '[]'
 * (matching how SurveyBuilder.vue creates a fresh para question) — it does
 * NOT touch response_answers at all, so no answer data is affected, only
 * how the question itself is now classified.
 *
 * Usage:
 *   node scripts/fix-feedback-question-type.js                # preview (dry run)
 *   node scripts/fix-feedback-question-type.js --apply         # actually write
 *   node scripts/fix-feedback-question-type.js --survey 12     # scope to one survey
 *   node scripts/fix-feedback-question-type.js --survey 12 --apply
 *
 * Safe to run more than once: once a question is 'para' it no longer
 * matches the WHERE clause below, so re-running is a no-op for it.
 */

const db = require('../src/config/db');
const { scoreFromLikertLabel } = require('../src/utils/likertScore');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const surveyIdx = args.indexOf('--survey');
const SURVEY_ID = surveyIdx !== -1 ? parseInt(args[surveyIdx + 1], 10) : null;

// Same list DashboardView.vue / ResponsesView.vue use client-side.
const FEEDBACK_KEYWORDS = ['ข้อเสนอแนะ', 'เสนอแนะ', 'ความคิดเห็น', 'ความเห็น', 'comment', 'feedback'];
function isFeedbackQuestionText(text) {
  const t = (text || '').toLowerCase();
  return FEEDBACK_KEYWORDS.some(k => t.includes(k.toLowerCase()));
}

function parseJson(v) {
  if (!v) return null;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
}

async function main() {
  console.log(APPLY ? '=== APPLY MODE (will write changes) ===' : '=== DRY RUN (no changes will be written; pass --apply to write) ===');
  if (SURVEY_ID) console.log(`Scope: survey ${SURVEY_ID} only`);
  else console.log('Scope: ALL surveys');
  console.log('');

  const [questions] = await db.query(
    `SELECT id, survey_id, question_text, question_type, options_json
     FROM questions
     WHERE question_type IN ('radio', 'checkbox', 'dropdown')
       ${SURVEY_ID ? 'AND survey_id = ?' : ''}`,
    SURVEY_ID ? [SURVEY_ID] : []
  );

  let checked = 0, matched = 0, skippedLikert = 0;

  for (const q of questions) {
    checked++;
    if (!isFeedbackQuestionText(q.question_text)) continue;

    const opts = parseJson(q.options_json) || [];
    const labels = Array.isArray(opts) ? opts : [];
    const isLikertScale = labels.length > 0 && labels.every(l => scoreFromLikertLabel(l) !== null);
    if (isLikertScale) {
      skippedLikert++;
      console.log(`  SKIP (real Likert rating question) — survey ${q.survey_id}, question #${q.id}: "${q.question_text}"`);
      continue;
    }

    matched++;
    console.log(`  survey ${q.survey_id}, question #${q.id} (${q.question_type} -> para): "${q.question_text}"`);
    if (APPLY) {
      await db.query('UPDATE questions SET question_type = ?, options_json = ? WHERE id = ?', ['para', '[]', q.id]);
    }
  }

  console.log('');
  console.log(`Checked ${checked} radio/checkbox/dropdown question(s): ${matched} reclassified to 'para', ${skippedLikert} left alone (real Likert scale).`);
  if (!APPLY) {
    console.log('\nThis was a DRY RUN — nothing was written. Re-run with --apply to write these changes.');
  } else {
    console.log('\nDone — changes written.');
  }

  await db.end?.();
}

main().catch(err => {
  console.error('fix-feedback-question-type failed:', err);
  process.exit(1);
});
