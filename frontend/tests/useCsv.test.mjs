// Node's built-in test runner, run directly against the ES module — no
// bundler needed since this composable is plain, framework-free JavaScript.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV } from '../src/composables/useCsv.js';

test('parseCSV — parses a simple header + rows', () => {
  const { headers, rows } = parseCSV('a,b,c\n1,2,3\n4,5,6');
  assert.deepEqual(headers, ['a', 'b', 'c']);
  assert.deepEqual(rows, [['1', '2', '3'], ['4', '5', '6']]);
});

test('parseCSV — handles quoted fields with embedded commas and escaped quotes', () => {
  const { headers, rows } = parseCSV('name,note\n"Somchai, Jr.","He said ""hi"""');
  assert.deepEqual(headers, ['name', 'note']);
  assert.deepEqual(rows, [['Somchai, Jr.', 'He said "hi"']]);
});

test('parseCSV — handles a newline embedded inside a quoted field', () => {
  const { headers, rows } = parseCSV('name,note\n"Somchai","line1\nline2"');
  assert.deepEqual(rows, [['Somchai', 'line1\nline2']]);
});

test('parseCSV — strips a leading UTF-8 BOM', () => {
  const { headers } = parseCSV('﻿a,b\n1,2');
  assert.deepEqual(headers, ['a', 'b']);
});

test('parseCSV — handles CRLF line endings', () => {
  const { headers, rows } = parseCSV('a,b\r\n1,2\r\n3,4');
  assert.deepEqual(headers, ['a', 'b']);
  assert.deepEqual(rows, [['1', '2'], ['3', '4']]);
});

test('parseCSV — drops a trailing blank row from a trailing newline', () => {
  const { rows } = parseCSV('a,b\n1,2\n');
  assert.equal(rows.length, 1);
});

test('parseCSV — empty input returns empty headers/rows', () => {
  assert.deepEqual(parseCSV(''), { headers: [], rows: [] });
  assert.deepEqual(parseCSV('   '.trim()), { headers: [], rows: [] });
});
