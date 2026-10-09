// จัดลำดับตัวเลือกของตัวกรอง (dropdown) ให้อ่านง่าย แทนการเรียงตามลำดับที่ข้อมูลเข้ามา
//   - ช่วงอายุ/ตัวเลข  -> เรียงจากน้อยไปมาก  (ต่ำกว่า 20, 20-30, 31-40, ... 61 ปีขึ้นไป)
//   - ระดับการศึกษา    -> เรียงจากสูงไปต่ำ    (สูงกว่าปริญญาตรี ... ประถมศึกษา)
//   - ระดับความพึงพอใจ -> เรียงจากมากไปน้อย  (มากที่สุด, มาก, ปานกลาง, น้อย, น้อยที่สุด)
// ถ้าตัวเลือก "ทุกตัว" ไม่เข้ากฎใดเลย (เช่น เพศ) จะคืนลำดับเดิมโดยไม่แตะต้อง

// ลำดับสูง -> ต่ำ; ตัวที่อยู่ก่อนถูกเทียบก่อน จึงวางคำเฉพาะ (สูงกว่าปริญญาตรี) ไว้ก่อนคำทั่วไป (ปริญญาตรี)
const EDUCATION_RANKS = [
  /ดุษฎี|ปริญญาเอก|doctor|ph\.?d/i,
  /สูงกว่าปริญญาตรี|ปริญญาโท|master/i,
  /ปริญญาตรี|bachelor/i,
  /อนุปริญญา|ปวส|ปวช|ประกาศนียบัตร|diploma/i,
  /มัธยม|high\s*school|secondary/i,
  /ประถม|primary|elementary/i,
  /ต่ำกว่า.*(ประถม|มัธยม)|ไม่ได้ศึกษา|ไม่ได้เรียน|none/i,
];

// ตัด "(5)" ท้ายป้ายคะแนนออกก่อนเทียบ เช่น "มาก (4)"
function likertRank(label) {
  const s = String(label).replace(/\s*\(\d+(?:\.\d+)?\)\s*$/, '').trim();
  if (/^มากที่สุด/.test(s)) return 0;
  if (/^มาก(?!ที่สุด)/.test(s)) return 1;
  if (/^ปานกลาง/.test(s)) return 2;
  if (/^น้อยที่สุด/.test(s)) return 4;
  if (/^น้อย/.test(s)) return 3;
  return null;
}

function educationRank(label) {
  const i = EDUCATION_RANKS.findIndex(re => re.test(label));
  return i === -1 ? null : i;
}

// "20 - 30 ปี" -> 20 | "ต่ำกว่า 20 ปี" -> 19.5 (มาก่อน 20) | "61 ปีขึ้นไป" -> 61
function numericRank(label) {
  const m = String(label).match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return /ต่ำกว่า|น้อยกว่า|ไม่เกิน|under|below|less/i.test(label) ? n - 0.5 : n;
}

// เรียง items ตามป้าย (getLabel) — คืนอาร์เรย์ใหม่เสมอ ไม่แก้ต้นฉบับ
// ใช้ได้กับทั้งรายการข้อความ และข้อมูลแผนภูมิ ({label, count})
export function sortByLabel(items, getLabel = x => x) {
  const list = Array.isArray(items) ? [...items] : [];
  if (list.length < 2) return list;
  const labels = list.map(getLabel);

  for (const rankOf of [likertRank, educationRank, numericRank]) {
    const ranks = labels.map(rankOf);
    if (ranks.every(r => r !== null)) {
      return list
        .map((item, i) => ({ item, i, r: ranks[i] }))
        .sort((a, b) => a.r - b.r || a.i - b.i)
        .map(x => x.item);
    }
  }
  return list;
}

export function sortFilterLabels(labels) {
  return sortByLabel(labels);
}

// จัดลำดับ data ของแผนภูมิแท่ง/โดนัททุกอัน (ไม่แตะแผนภูมิชนิดอื่น เช่น trend)
export function orderChartData(charts) {
  if (!Array.isArray(charts)) return charts;
  return charts.map(c =>
    c && c.chartType === 'bar' && Array.isArray(c.data)
      ? { ...c, data: sortByLabel(c.data, d => d?.label ?? '') }
      : c
  );
}
