// Today's calendar date in Thailand (Asia/Bangkok, UTC+7) as 'YYYY-MM-DD'.
//
// Used to enforce surveys.close_date. The server and MySQL on Railway run in
// UTC, so MySQL's CURDATE() would still report "yesterday" between 00:00 and
// 06:59 Thai time — a survey whose close date was yesterday would keep
// accepting responses for up to 7 extra hours. Computing the Thai date here
// and passing it as a query parameter makes the cut-off happen at Thai
// midnight no matter what timezone the server or database is in.
//
// 'en-CA' formats dates as YYYY-MM-DD, which compares correctly against a
// MySQL DATE column.
const TZ = 'Asia/Bangkok';

function todayInBangkok(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// SQL fragment: the survey is still open on `todayInBangkok()`. A survey
// with close_date = D accepts responses through the end of day D (Thai
// time) and stops at 00:00 on D+1. Pair with one `todayInBangkok()` param.
const OPEN_BY_CLOSE_DATE_SQL = '(close_date IS NULL OR close_date >= ?)';

module.exports = { todayInBangkok, OPEN_BY_CLOSE_DATE_SQL };
