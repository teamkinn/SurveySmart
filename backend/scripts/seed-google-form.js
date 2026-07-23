#!/usr/bin/env node
/**
 * seed-google-form.js
 *
 * Submits N fake responses directly to a live Google Form (the actual
 * "testtest" form your SurveySmart survey pulls its answers from), the same
 * way a real respondent's browser would POST to Google's formResponse
 * endpoint. This is the right test for your setup, since SurveySmart itself
 * doesn't host the fill-in form for Google-linked surveys — it only *syncs*
 * responses in afterward (via "Sync now" or the background poller in
 * backend/src/services/formSyncPoller.js).
 *
 * After running this, sync the survey in SurveySmart (or wait for the
 * poller, default every 15 min) to pull the 50 fake responses into your DB.
 *
 * Usage:
 *   node scripts/seed-google-form.js [--count 50] [--delay 300]
 *
 * Requires Node 18+ (uses global fetch).
 */

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i === args.length - 1) return fallback;
  return args[i + 1];
}

const COUNT = parseInt(getArg('count', '50'), 10);
const DELAY_MS = parseInt(getArg('delay', '300'), 10);

// Submit endpoint, read straight off the live form's <form action="..."> —
// see backend/src/routes/googleForms.js for how SurveySmart itself talks to
// this form's sibling Forms API (that's the *read* side; this script is the
// *write* side, mimicking a real respondent).
const FORM_ACTION =
  'https://docs.google.com/forms/u/0/d/e/1FAIpQLSdzOXkJaZqADmJEqlySROGczxEO4fasol-HphMFCtwBhi5tfg/formResponse';

// entry.<id> field names, extracted from the form's FB_PUBLIC_LOAD_DATA_ —
// title: "testtest", 4 questions:
//   1. ชื่อ-นามสกุล                         (short answer)
//   2. เพศ                                   (radio: ชาย / หญิง / ไม่ระบุ)
//   3. ท่านมีความพึงพอใจต่อการให้บริการโดยรวมในระดับใด  (radio, scored 1-5)
//   4. ข้อเสนอแนะ / ความคิดเห็นเพิ่มเติม        (paragraph)
const ENTRY = {
  name: 'entry.1304724168',
  gender: 'entry.774213201',
  satisfaction: 'entry.1704751456',
  feedback: 'entry.995095367',
};

const GENDER_OPTIONS = ['ชาย', 'หญิง', 'ไม่ระบุ'];
const SATISFACTION_OPTIONS = [
  'ควรปรับปรุง (1)',
  'พอใช้ (2)',
  'ปานกลาง (3)',
  'ดี (4)',
  'ดีมาก (5)',
];

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
const FEEDBACK_ANSWERS = [
  'บริการดีมาก ประทับใจ',
  'อยากให้ปรับปรุงความเร็วในการให้บริการ',
  'พนักงานเป็นกันเองดี',
  'โดยรวมพอใจ แต่ขั้นตอนยังซับซ้อนไปหน่อย',
  'ไม่มีความเห็นเพิ่มเติม',
  'อยากให้มีช่องทางติดต่อเพิ่มขึ้น',
  'ทุกอย่างเป็นไปด้วยดี ขอบคุณครับ/ค่ะ',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function fakeName() { return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function submitOne(i) {
  const body = new URLSearchParams({
    [ENTRY.name]: fakeName(),
    [ENTRY.gender]: pick(GENDER_OPTIONS),
    [ENTRY.satisfaction]: pick(SATISFACTION_OPTIONS),
    [ENTRY.feedback]: pick(FEEDBACK_ANSWERS),
  });

  const res = await fetch(FORM_ACTION, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  // Google Forms replies 200 with an HTML confirmation page on success
  // (it does not use conventional REST status codes for validation errors).
  return res.ok;
}

async function main() {
  console.log(`Submitting ${COUNT} fake responses to the Google Form...`);
  let ok = 0, fail = 0;
  for (let i = 1; i <= COUNT; i++) {
    try {
      const success = await submitOne(i);
      if (success) { ok++; console.log(`[${i}/${COUNT}] OK`); }
      else { fail++; console.log(`[${i}/${COUNT}] FAILED`); }
    } catch (err) {
      fail++;
      console.log(`[${i}/${COUNT}] ERROR - ${err.message}`);
    }
    if (DELAY_MS) await sleep(DELAY_MS);
  }
  console.log(`\nDone. ${ok} succeeded, ${fail} failed.`);
  console.log('Now sync the survey in SurveySmart ("Sync now") or wait for the background poller to pull these into the DB.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
