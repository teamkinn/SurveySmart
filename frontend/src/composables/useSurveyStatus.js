// Shared survey status-badge and score-interpretation helpers.
// Previously duplicated verbatim (byte-for-byte identical) across
// SurveysView.vue, SharedView.vue, DashboardView.vue, ResponsesView.vue,
// and SurveyCard.vue — extracted here so they change in one place.
//
// Note: ResponsesView.vue's respondent-table date format ('en-GB', short
// month) is intentionally different from this th-TH formatDate and stays
// local to that file rather than being folded in here.

export function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('th-TH') : '—';
}

export function badgeClass(status) {
  return {
    'badge-active': status === 'active',
    'badge-draft': status === 'draft',
    'badge-closed': status === 'closed',
  };
}

export function badgeText(status) {
  return status === 'active' ? '🟢 Active' : status === 'draft' ? '✏️ Draft' : '⬜ Closed';
}

// Every current call site guards with `v-if="avgScore !== '—'"` before
// calling these, so NaN/negative never actually reaches them today — but
// the helpers themselves had no floor, silently lumping NaN or a negative
// value into the same "ควรปรับปรุง" (worst) bucket as a genuinely bad score
// if a future call site ever omits that guard. isNaN check makes that an
// explicit, obviously-different '—' instead.
export function interpClass(avg) {
  if (isNaN(avg)) return 'interp-none';
  if (avg >= 4.5) return 'interp-5';
  if (avg >= 3.5) return 'interp-4';
  if (avg >= 2.5) return 'interp-3';
  if (avg >= 1.5) return 'interp-2';
  return 'interp-1';
}

export function interpText(avg) {
  if (isNaN(avg)) return '—';
  if (avg >= 4.5) return 'ดีมาก';
  if (avg >= 3.5) return 'ดี';
  if (avg >= 2.5) return 'ปานกลาง';
  if (avg >= 1.5) return 'พอใช้';
  return 'ควรปรับปรุง';
}
