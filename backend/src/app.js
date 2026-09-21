require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

app.set('trust proxy', 1);
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

// Baseline security headers (HSTS, X-Content-Type-Options, X-Frame-Options,
// etc.) for every response. contentSecurityPolicy is off: this is primarily
// a JSON API, but routes/googleAuth.js's OAuth callback returns a small HTML
// page with an inline <script> to close the popup — helmet's default CSP
// would block that inline script and break the Google Forms connect flow.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  cors({
    origin: allowedOrigins,
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  })
);
// 100kb comfortably covers a single survey submission; CSV responses import
// (routes/responses.js POST /import-csv) sends the whole parsed file as a
// JSON array in one request, which can run well past that for a few
// thousand rows — 5mb is generous for that while still bounded (that route
// also caps at 5000 rows server-side, see responseController.importCsv).
app.use(express.json({ limit: '5mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/albums', require('./routes/albums'));
app.use('/api/responses/public', require('./routes/publicResponses'));
app.use('/api/surveys/:surveyId/responses', require('./routes/responses'));
app.use('/api/surveys', require('./routes/surveys'));
app.use('/auth/google', require('./routes/googleAuth'));
app.use('/api/google', require('./routes/googleForms'));

app.get('/api/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SurveySmart API running on port ${PORT}`));

require('./services/formSyncPoller').start();

// Read-only visibility into schema drift (see src/migrate.js) — warns loudly
// in the logs instead of letting a missing column surface later as a
// mysterious ER_BAD_FIELD_ERROR on some unrelated request. Never blocks
// startup and never writes to the DB by itself; applying the fix is a
// deliberate `npm run migrate` step.
require('./migrate')
  .checkPending()
  .then((pending) => {
    if (pending.length) {
      console.warn(
        `[schema] มี migration ที่ยังไม่ได้รัน ${pending.length} ไฟล์: ${pending.join(', ')} — รัน "npm run migrate" ก่อน deploy จริง`
      );
    }
  })
  .catch((err) => console.error('[schema] ตรวจสอบ migration ไม่สำเร็จ:', err.message));
