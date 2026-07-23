#!/usr/bin/env node
/**
 * seed-test-responses.js
 *
 * Creates N fake respondents and submits realistic answers to a live
 * SurveySmart survey, exactly the way the public fill form
 * (frontend/src/views/SurveyFillView.vue) would.
 *
 * Usage:
 *   node scripts/seed-test-responses.js --token <shareToken> [--count 50] [--base http://localhost:3000]
 *
 * Where <shareToken> is the token in the survey's public link, e.g.
 *   http://localhost:5173/f/AbC123xyz   ->  --token AbC123xyz
 *
 * Requires Node 18+ (uses global fetch).
 */

const args = process.argv.slice(2);

function getArg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i === args.length - 1) return fallback;
  return args[i + 1];
}

const TOKEN = getArg('token');
const COUNT = parseInt(getArg('count', '50'), 10);
const BASE = (getArg('base', 'http://localhost:3000')).replace(/\/$/, '');
const DELAY_MS = parseInt(getArg('delay', '150'), 10); // spacing between submits, be nice to the rate limiter

if (!TOKEN) {
  console.error('Missing required --token <shareToken>\n\nExample:\n  node scripts/seed-test-responses.js --token AbC123xyz --count 50');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Fake data pools
// ---------------------------------------------------------------------------
const FIRST_NAMES = [
  'สมชาย', 'สมหญิง', 'วิชัย', 'มานะ', 'สุดา', 'ประยุทธ', 'กมล', 'พรทิพย์',
  'อนุชา', 'จิราภรณ์', 'ธนากร', 'ศิริพร', 'วีระ', 'นภา', 'ชัยวัฒน์', 'อรทัย',
  'สุรชัย', 'เบญจวรรณ', 'ปิยะ', 'รัตนา', 'ธีระ', 'กาญจนา', 'สมพงษ์', 'วรรณา',
  'อภิชาติ', 'สุนีย์', 'ณัฐวุฒิ', 'พิมพ์ใจ', 'เกียรติศักดิ์', 'ลัดดา',
];
const LAST_NAMES = [
  'ใจดี', 'รักเรียน', 'สายบุญ', 'แก้วมณี', 'ศรีสุข', 'บุญมาก', 'เพชรรัตน์',
  'ทองดี', 'มั่นคง', 'สุขใจ', 'วงศ์ษา', 'ชูเกียรติ', 'เจริญพร', 'พูลสวัสดิ์',
  'อินทร์แก้ว', 'คงเจริญ', 'ศรีวิไล', 'ธนโชติ', 'ไพศาล', 'บุญเลิศ',
];

const SHORT_ANSWERS = [
  'ดีมาก', 'พอใช้', 'ควรปรับปรุงเรื่องความเร็ว', 'บริการดีเยี่ยม', 'ไม่มีความเห็นเพิ่มเติม',
  'อยากให้มีตัวเลือกเพิ่มขึ้น', 'ประทับใจมาก', 'เจ้าหน้าที่เป็นกันเอง', 'สะดวกและรวดเร็ว',
  'ระบบใช้งานง่าย',
];
const PARA_ANSWERS = [
  'โดยรวมแล้วรู้สึกพอใจกับการใช้งาน แต่คิดว่ายังมีจุดที่พัฒนาต่อได้ เช่น ความเร็วในการตอบสนอง',
  'อยากให้เพิ่มช่องทางการติดต่อสอบถามให้หลากหลายขึ้น เพื่อความสะดวกของผู้ใช้งาน',
  'เจ้าหน้าที่ให้บริการดีมาก อธิบายชัดเจน แต่ขั้นตอนบางอย่างยังซับซ้อนเกินไป',
  'พอใจกับคุณภาพโดยรวม อยากให้คงมาตรฐานนี้ไว้และพัฒนาต่อเนื่อง',
  'ไม่มีข้อเสนอแนะเพิ่มเติม ทุกอย่างเป็นไปด้วยดี',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function fakeName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

function parseOpts(o) {
  if (!o) return [];
  if (Array.isArray(o)) return o;
  if (typeof o === 'string') { try { return JSON.parse(o); } catch { return []; } }
  return o;
}

function scaleMin(q) { const o = parseOpts(q.options_json); return (o && !Array.isArray(o) ? o.min : null) ?? 1; }
function scaleMax(q) { const o = parseOpts(q.options_json); return (o && !Array.isArray(o) ? o.max : null) ?? 5; }

// Mirrors buildAnswers() in SurveyFillView.vue so payloads match what the
// real form would send.
function answerFor(q) {
  const opts = parseOpts(q.options_json);
  switch (q.question_type) {
    case 'short':
      return { question_id: q.id, answer_text: pick(SHORT_ANSWERS) };
    case 'para':
      return { question_id: q.id, answer_text: pick(PARA_ANSWERS) };
    case 'radio':
    case 'dropdown': {
      const list = Array.isArray(opts) ? opts : [];
      const value = list.length ? pick(list) : '';
      const m = value.match(/\((\d+(?:\.\d+)?)\)\s*$/);
      const score = m ? parseFloat(m[1]) : undefined;
      return { question_id: q.id, answer_json: { value }, answer_text: value, ...(score !== undefined ? { score } : {}) };
    }
    case 'checkbox': {
      const list = Array.isArray(opts) ? opts : [];
      const n = list.length ? randInt(1, Math.min(list.length, 3)) : 0;
      const shuffled = [...list].sort(() => Math.random() - 0.5);
      const values = shuffled.slice(0, n);
      return { question_id: q.id, answer_json: { values }, answer_text: values.join(', ') };
    }
    case 'star': {
      const score = randInt(1, 5);
      return { question_id: q.id, answer_json: { score }, score };
    }
    case 'scale': {
      const score = randInt(scaleMin(q), scaleMax(q));
      return { question_id: q.id, answer_json: { score }, score };
    }
    case 'date': {
      const d = new Date(Date.now() - randInt(0, 365) * 86400000);
      return { question_id: q.id, answer_text: d.toISOString().slice(0, 10) };
    }
    case 'time': {
      const hh = String(randInt(8, 18)).padStart(2, '0');
      const mm = String(randInt(0, 59)).padStart(2, '0');
      return { question_id: q.id, answer_text: `${hh}:${mm}` };
    }
    default:
      return { question_id: q.id, answer_text: pick(SHORT_ANSWERS) };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log(`Fetching survey (token=${TOKEN}) from ${BASE} ...`);
  const surveyRes = await fetch(`${BASE}/api/surveys/public/${encodeURIComponent(TOKEN)}`);
  if (!surveyRes.ok) {
    console.error(`Failed to load survey: ${surveyRes.status} ${surveyRes.statusText}`);
    process.exit(1);
  }
  const survey = await surveyRes.json();
  console.log(`Survey: "${survey.title}" (id=${survey.id}), ${survey.questions.length} questions`);

  let ok = 0, fail = 0;
  for (let i = 1; i <= COUNT; i++) {
    const respondent_name = fakeName();
    const answers = survey.questions.map(answerFor);

    try {
      const res = await fetch(`${BASE}/api/surveys/${survey.id}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respondent_name, answers }),
      });
      if (res.ok) {
        ok++;
        console.log(`[${i}/${COUNT}] OK  - ${respondent_name}`);
      } else {
        fail++;
        const body = await res.text();
        console.log(`[${i}/${COUNT}] FAIL (${res.status}) - ${respondent_name} - ${body}`);
      }
    } catch (err) {
      fail++;
      console.log(`[${i}/${COUNT}] ERROR - ${respondent_name} - ${err.message}`);
    }

    if (DELAY_MS) await sleep(DELAY_MS);
  }

  console.log(`\nDone. ${ok} succeeded, ${fail} failed.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
