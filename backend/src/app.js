require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '100kb' }));

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/responses/public', require('./routes/publicResponses'));
app.use('/api/surveys/:surveyId/responses', require('./routes/responses'));
app.use('/api/surveys',       require('./routes/surveys'));
app.use('/auth/google',      require('./routes/googleAuth'));
app.use('/api/google',       require('./routes/googleForms'));

app.get('/api/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SurveySmart API running on port ${PORT}`));
