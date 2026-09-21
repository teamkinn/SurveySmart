// Local (not UTC) calendar-day key for a Date/timestamp. Used anywhere a
// timestamp needs to be bucketed/compared against a plain YYYY-MM-DD value
// (e.g. a <input type="date"> filter, or a day-by-day trend chart) using the
// viewer's own calendar day, not UTC's.
//
// Originally lived only in DashboardView.vue's trend chart — extracted here
// after the exact same bug (comparing a UTC-derived date string against a
// local-date input) turned up separately in ResponsesView.vue's date-range
// filter. A response submitted late at night in Thailand (UTC+7, already
// "tomorrow" in UTC after ~17:00 local) would otherwise land in the wrong
// day's bucket or get excluded/included off-by-one at a filter's edges.
export function localDateStr(d) {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
