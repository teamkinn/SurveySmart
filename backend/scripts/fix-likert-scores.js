#!/usr/bin/env node
/**
 * fix-likert-scores.js
 *
 * One-time (but safe to re-run) data fix for the bug described in
 * backend/src/utils/likertScore.js: CSV import / Google Forms sync used to
 * score a radio/dropdown/grid-column answer by its POSITION in the
 * question's option list (index 0 -> score 1, index 1 -> score 2, ...)
 * whenever the label had no explicit "(n)" suffix. On a survey whose
 * options are laid out best-first ("มากที่สุด, มาก, ปานกลาง, น้อย, น้อยที่สุด"
 * — the common Thai ก.พ.ร. convention), that guess silently INVERTED every
 * score: "มากที่สุด" got stored as 1 instead of 5.
 *
 * This script re-derives every affected response_answers.score from its
 * answer_text using the corrected, order-independent Likert dictionary
 * (utils/likertScore.js), fixes any row whose stored score doesn't match,
 * and recomputes responses.overall_score for every response that changed.
 *
 * It does NOT touch anything for a label the dictionary doesn't recognize
 * — those are left exactly as they were (same behavior as the fixed import
 * code: unscored rather than guessed).
 *
 * Usage:
 *   node scripts/fix-likert-scores.js --survey 37           # preview (dry run)
 *   node scripts/fix-likert-scores.js --survey 37 --apply   # actually write
 *   node scripts/fix-likert-scores.js --apply               # ALL surveys
 *
 * Safe to run more than once: a row whose score is already correct is
 * simply skipped (reported as "unchanged"), so re-running after a partial
 * failure just picks up where it left off.
 */

const db = require('../src/config/db');
const { resolveChoiceScore } = require('../src/utils/likertScore');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const surveyIdx = args.indexOf('--survey');
const SURVEY_ID = surveyIdx !== -1 ? parseInt(args[surveyIdx + 1], 10) : null;

async function main() {
  console.log(APPLY ? '=== APPLY MODE (will write changes) ===' : '=== DRY RUN (no changes will be written; pass --apply to write) ===');
  if (SURVEY_ID) console.log(`Scope: survey ${SURVEY_ID} only`);
  else console.log('Scope: ALL surveys');
  console.log('');

  const [answers] = await db.query(
    `SELECT ra.id, ra.response_id, ra.question_id, ra.answer_text, ra.score,
            q.question_type, q.survey_id, q.question_text
     FROM response_answers ra
     JOIN questions q ON q.id = ra.question_id
     WHERE q.question_type IN ('radio', 'dropdown')
       ${SURVEY_ID ? 'AND q.survey_id = ?' : ''}`,
    SURVEY_ID ? [SURVEY_ID] : []
  );

  let checked = 0, changed = 0, unchanged = 0, stillUnscored = 0;
  const affectedResponseIds = new Set();
  const perQuestionChanges = new Map(); // question_id -> { text, count }

  for (const row of answers) {
    checked++;
    const recomputed = resolveChoiceScore(row.answer_text);
    const stored = row.score == null ? null : Number(row.score);

    if (recomputed == null) {
      if (stored != null) {
        // Previously had a (guessed) score, now resolves to "unrecognized
        // label" — clear it rather than leave a guessed number behind.
        changed++;
        affectedResponseIds.add(row.response_id);
        const key = row.question_id;
        perQuestionChanges.set(key, {
          text: row.question_text,
          count: (perQuestionChanges.get(key)?.count || 0) + 1,
        });
        console.log(`  answer #${row.id} (response ${row.response_id}): "${row.answer_text}" score ${stored} -> NULL (label not recognized)`);
        if (APPLY) {
          await db.query('UPDATE response_answers SET score = NULL WHERE id = ?', [row.id]);
        }
      } else {
        stillUnscored++;
      }
      continue;
    }

    if (stored === recomputed) {
      unchanged++;
      continue;
    }

    changed++;
    affectedResponseIds.add(row.response_id);
    const key = row.question_id;
    perQuestionChanges.set(key, {
      text: row.question_text,
      count: (perQuestionChanges.get(key)?.count || 0) + 1,
    });
    console.log(`  answer #${row.id} (response ${row.response_id}): "${row.answer_text}" score ${stored} -> ${recomputed}`);
    if (APPLY) {
      await db.query('UPDATE response_answers SET score = ? WHERE id = ?', [recomputed, row.id]);
    }
  }

  console.log('');
  console.log(`Checked ${checked} radio/dropdown answers: ${changed} changed, ${unchanged} already correct, ${stillUnscored} still unrecognized (untouched).`);
  if (perQuestionChanges.size) {
    console.log('\nQuestions with corrected scores:');
    for (const [, { text, count }] of perQuestionChanges) {
      console.log(`  - ${count} answer(s): ${text}`);
    }
  }

  if (!affectedResponseIds.size) {
    console.log('\nNo responses need their overall_score recomputed. Done.');
    await db.end?.();
    return;
  }

  console.log(`\nRecomputing overall_score for ${affectedResponseIds.size} affected response(s)...`);
  let responsesChanged = 0;
  for (const responseId of affectedResponseIds) {
    const [scoreRows] = await db.query(
      'SELECT score FROM response_answers WHERE response_id = ? AND score IS NOT NULL',
      [responseId]
    );
    const scores = scoreRows.map(r => Number(r.score));
    const newOverall = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    const [[current]] = await db.query('SELECT overall_score FROM responses WHERE id = ?', [responseId]);
    const oldOverall = current?.overall_score == null ? null : Number(current.overall_score);

    if (oldOverall !== newOverall && !(oldOverall == null && newOverall == null)) {
      responsesChanged++;
      console.log(`  response ${responseId}: overall_score ${oldOverall} -> ${newOverall == null ? 'NULL' : newOverall.toFixed(2)}`);
      if (APPLY) {
        await db.query('UPDATE responses SET overall_score = ? WHERE id = ?', [newOverall, responseId]);
      }
    }
  }

  console.log(`\n${responsesChanged} response(s) had their overall_score corrected.`);
  if (!APPLY) {
    console.log('\nThis was a DRY RUN — nothing was written. Re-run with --apply to write these changes.');
  } else {
    console.log('\nDone — changes written.');
  }

  await db.end?.();
}

main().catch(err => {
  console.error('fix-likert-scores failed:', err);
  process.exit(1);
});
