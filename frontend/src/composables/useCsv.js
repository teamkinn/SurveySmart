// Minimal, dependency-free RFC4180-ish CSV parser/writer shared by the
// survey-structure import, the responses import, and (potentially) any
// future CSV export that needs to round-trip through the same format.
//
// Handles: quoted fields, "" as an escaped quote inside a quoted field,
// commas/newlines embedded inside quoted fields, and CRLF/LF/CR line
// endings. Strips a leading UTF-8 BOM, since both Excel-exported CSVs and
// SurveySmart's own Export CSV write one.

export function parseCSV(text) {
  if (!text) return { headers: [], rows: [] };
  // Strip BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const table = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); table.push(row); row = []; };

  while (i < len) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }

    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { pushField(); i++; continue; }
    if (c === '\r') {
      if (text[i + 1] === '\n') i++;
      pushRow(); i++; continue;
    }
    if (c === '\n') { pushRow(); i++; continue; }
    field += c; i++;
  }
  // Final field/row, if the file didn't end with a newline.
  if (field !== '' || row.length) pushRow();

  // Drop fully-empty trailing rows (common with a trailing newline).
  while (table.length && table[table.length - 1].every(c => c === '')) table.pop();

  if (!table.length) return { headers: [], rows: [] };
  const [headers, ...rows] = table;
  return { headers: headers.map(h => h.trim()), rows };
}

// Builds a downloadable CSV Blob and triggers a browser save-as, matching
// the escaping convention already used by ResponsesView.vue's Export CSV.
export function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
