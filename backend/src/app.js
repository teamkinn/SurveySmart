require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/responses/public', require('./routes/publicResponses'));
app.use('/api/surveys',       require('./routes/surveys'));
app.use('/api/surveys/:surveyId/responses', require('./routes/responses'));
app.use('/auth/google',      require('./routes/googleAuth'));
app.use('/api/google',       require('./routes/googleForms'));

app.get('/api/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SurveySmart API running on port ${PORT}`));
