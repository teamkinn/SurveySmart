import test from 'node:test';
import assert from 'node:assert/strict';
import { sortFilterLabels } from '../src/composables/useLabelOrder.js';

test('อายุ — เรียงจากน้อยไปมาก โดย "ต่ำกว่า 20" มาก่อน และ "61 ปีขึ้นไป" อยู่ท้ายสุด', () => {
  const input = ['20 - 30 ปี', '31 - 40 ปี', '51-60 ปี', 'ต่ำกว่า 20 ปี', '41 - 50 ปี', '61 ปีขึ้นไป'];
  assert.deepEqual(sortFilterLabels(input), [
    'ต่ำกว่า 20 ปี', '20 - 30 ปี', '31 - 40 ปี', '41 - 50 ปี', '51-60 ปี', '61 ปีขึ้นไป',
  ]);
});

test('การศึกษา — เรียงจากสูงไปต่ำ', () => {
  const input = ['ปริญญาตรี', 'มัธยมศึกษา', 'อนุปริญญา', 'สูงกว่าปริญญาตรี', 'ประถมศึกษา'];
  assert.deepEqual(sortFilterLabels(input), [
    'สูงกว่าปริญญาตรี', 'ปริญญาตรี', 'อนุปริญญา', 'มัธยมศึกษา', 'ประถมศึกษา',
  ]);
});

test('ตัวเลือกอื่น (เช่น เพศ) คงลำดับเดิม และไม่แก้อาร์เรย์ต้นฉบับ', () => {
  const input = ['หญิง', 'ชาย', 'อื่นๆ'];
  const out = sortFilterLabels(input);
  assert.deepEqual(out, ['หญิง', 'ชาย', 'อื่นๆ']);
  assert.notEqual(out, input);
});

test('ถ้ามีตัวเลือกที่ไม่รู้จักปนอยู่ จะไม่จัดลำดับ (กันเรียงผิด)', () => {
  const input = ['ปริญญาตรี', 'อื่นๆ', 'มัธยมศึกษา'];
  assert.deepEqual(sortFilterLabels(input), input);
});

import { orderChartData, sortByLabel } from '../src/composables/useLabelOrder.js';

test('ความพึงพอใจ — เรียง มากที่สุด > มาก > ปานกลาง > น้อย > น้อยที่สุด (แก้ข้อที่เรียง ปานกลาง ขึ้นก่อน)', () => {
  const input = ['ปานกลาง', 'มาก', 'มากที่สุด', 'น้อย', 'น้อยที่สุด'];
  assert.deepEqual(sortByLabel(input), ['มากที่สุด', 'มาก', 'ปานกลาง', 'น้อย', 'น้อยที่สุด']);
});

test('ความพึงพอใจ — ป้ายมีคะแนนต่อท้าย และมีแค่บางระดับ ก็เรียงถูก', () => {
  assert.deepEqual(sortByLabel(['ปานกลาง (3)', 'มาก (4)', 'มากที่สุด (5)']), ['มากที่สุด (5)', 'มาก (4)', 'ปานกลาง (3)']);
});

test('orderChartData — เรียง data ของแผนภูมิแท่ง คงฟิลด์อื่น และไม่แตะชนิดอื่น/ต้นฉบับ', () => {
  const bar = { question_id: 1, chartType: 'bar', data: [
    { label: 'ปานกลาง', count: 42 }, { label: 'มาก', count: 17 }, { label: 'มากที่สุด', count: 6 },
    { label: 'น้อย', count: 3 }, { label: 'น้อยที่สุด', count: 1 },
  ] };
  const trend = { question_id: 2, chartType: 'line', data: [{ label: '2', count: 1 }, { label: '1', count: 2 }] };
  const out = orderChartData([bar, trend]);
  assert.deepEqual(out[0].data.map(d => d.label), ['มากที่สุด', 'มาก', 'ปานกลาง', 'น้อย', 'น้อยที่สุด']);
  assert.equal(out[0].data[0].count, 6);
  assert.equal(out[0].question_id, 1);
  assert.equal(out[1], trend);
  assert.equal(bar.data[0].label, 'ปานกลาง');
});
