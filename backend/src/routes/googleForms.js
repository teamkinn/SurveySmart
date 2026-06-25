const router = require('express').Router();
const { google } = require('googleapis');
const auth = require('../middleware/auth');
const { getClient, registerPendingState, getTokens, removeTokens } = require('../services/googleAuth');

router.use(auth);

// GET /api/google/auth-url
router.get('/auth-url', (req, res) => {
  const state = Math.random().toString(36).substring(2, 12);
  registerPendingState(state);
  const client = getClient();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/forms.body'],
    state,
    prompt: 'consent',
  });
  res.json({ url, state });
});

// POST /api/google/create-form
router.post('/create-form', async (req, res) => {
  const { state, survey } = req.body;
  const tokens = getTokens(state);
  if (!tokens) return res.status(401).json({ message: 'Google auth expired — please authorize again' });

  const client = getClient();
  client.setCredentials(tokens);
  const forms = google.forms({ version: 'v1', auth: client });

  try {
    const { data: form } = await forms.forms.create({
      requestBody: { info: { title: survey.title || 'แบบสอบถาม', documentTitle: survey.title || 'แบบสอบถาม' } },
    });
    const formId = form.formId;

    const allQ = [...(survey.sec1 || []), ...(survey.sec2 || []), ...(survey.sec3 || [])];
    const requests = allQ
      .map((q, idx) => {
        const item = toGoogleItem(q);
        return item ? { createItem: { item, location: { index: idx } } } : null;
      })
      .filter(Boolean);

    if (requests.length) {
      await forms.forms.batchUpdate({ formId, requestBody: { requests } });
    }

    removeTokens(state);
    res.json({ formUrl: `https://docs.google.com/forms/d/${formId}/viewform`, formId });
  } catch (e) {
    console.error('Google Forms create error:', e.message);
    res.status(500).json({ message: 'ไม่สามารถสร้าง Google Form ได้ กรุณาลองใหม่' });
  }
});

function toGoogleItem(q) {
  const title = q.text || 'คำถาม';

  if (q.type === 'short' || q.type === 'para') {
    return { title, questionItem: { question: { required: false, textQuestion: { paragraph: q.type === 'para' } } } };
  }

  if (q.type === 'radio' || q.type === 'checkbox' || q.type === 'dropdown') {
    const typeMap = { radio: 'RADIO', checkbox: 'CHECKBOX', dropdown: 'DROP_DOWN' };
    const opts = (q.opts || []).filter(Boolean);
    return {
      title,
      questionItem: {
        question: {
          required: false,
          choiceQuestion: {
            type: typeMap[q.type],
            options: (opts.length ? opts : ['ตัวเลือก 1']).map(v => ({ value: v })),
          },
        },
      },
    };
  }

  if (q.type === 'scale') {
    return { title, questionItem: { question: { required: false, scaleQuestion: { low: q.scaleMin ?? 1, high: q.scaleMax ?? 5 } } } };
  }

  if (q.type === 'star') {
    return { title, questionItem: { question: { required: false, ratingQuestion: { ratingScaleLevel: 5, iconType: 'STAR' } } } };
  }

  if (q.type === 'date') {
    return { title, questionItem: { question: { required: false, dateQuestion: {} } } };
  }

  if (q.type === 'time') {
    return { title, questionItem: { question: { required: false, timeQuestion: {} } } };
  }

  // file → fallback to short text (file upload requires Google Workspace)
  return { title, questionItem: { question: { required: false, textQuestion: { paragraph: false } } } };
}

module.exports = router;
