require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.set('trust proxy', 1);
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: allowedOrigins,
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  })
);
app.use(express.json({ limit: '100kb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/responses/public', require('./routes/publicResponses'));
app.use('/api/surveys/:surveyId/responses', require('./routes/responses'));
app.use('/api/surveys', require('./routes/surveys'));
app.use('/auth/google', require('./routes/googleAuth'));
app.use('/api/google', require('./routes/googleForms'));

app.get('/api/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SurveySmart API running on port ${PORT}`));

require('./services/formSyncPoller').start();
