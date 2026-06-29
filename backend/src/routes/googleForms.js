const router = require('express').Router();
const { google } = require('googleapis');
const { randomBytes } = require('crypto');
const auth = require('../middleware/auth');
const db = require('../config/db');
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

// POST /api/google/apps-script-setup
router.post('/apps-script-setup', async (req, res) => {
  const { formId, title, description, questions } = req.body;
  if (!formId || !title) return res.status(400).json({ message: 'formId and title are required' });

  try {
    const [existing] = await db.query(
      'SELECT id FROM surveys WHERE google_form_id = ? AND user_id = ?',
      [formId, req.user.id]
    );

    if (existing.length) {
      const surveyId = existing[0].id;
      await db.query('UPDATE surveys SET title=?, description=?, updated_at=NOW() WHERE id=?', [title, description || '', surveyId]);
      if (Array.isArray(questions) && questions.length) {
        await db.query('DELETE FROM questions WHERE survey_id = ?', [surveyId]);
        const vals = questions.map(q => [surveyId, q.section || 1, q.order || 0, q.text || '', q.type || 'short', q.required ? 1 : 0, q.options ? JSON.stringify(q.options) : null]);
        await db.query('INSERT INTO questions (survey_id, section_number, sort_order, question_text, question_type, is_required, options_json) VALUES ?', [vals]);
      }
      return res.json({ surveyId, title, updated: true });
    }

    const token = randomBytes(32).toString('hex');
    const [result] = await db.query(
      'INSERT INTO surveys (user_id, title, description, status, share_token, google_form_url, google_form_id) VALUES (?,?,?,?,?,?,?)',
      [req.user.id, title, description || '', 'active', token, `https://docs.google.com/forms/d/${formId}/viewform`, formId]
    );
    const surveyId = result.insertId;

    if (Array.isArray(questions) && questions.length) {
      const vals = questions.map(q => [surveyId, q.section || 1, q.order || 0, q.text || '', q.type || 'short', q.required ? 1 : 0, q.options ? JSON.stringify(q.options) : null]);
      await db.query('INSERT INTO questions (survey_id, section_number, sort_order, question_text, question_type, is_required, options_json) VALUES ?', [vals]);
    }

    res.status(201).json({ surveyId, title, created: true });
  } catch (e) {
    console.error('Apps Script setup error:', e.message);
    res.status(500).json({ message: 'Setup failed' });
  }
});

// GET /api/google/import-auth-url
router.get('/import-auth-url', (req, res) => {
  const state = Math.random().toString(36).substring(2, 12);
  registerPendingState(state);
  const client = getClient();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/forms.body.readonly',
      'https://www.googleapis.com/auth/forms.responses.readonly',
    ],
    state,
    prompt: 'consent',
  });
  res.json({ url, state });
});

// POST /api/google/import-form
router.post('/import-form', async (req, res) => {
  const { state, formUrl } = req.body;
  if (!formUrl) return res.status(400).json({ message: 'กรุณาระบุ URL ของ Google Form' });

  const tokens = getTokens(state);
  if (!tokens) return res.status(401).json({ message: 'Google auth expired — please authorize again' });

  const formId = extractFormId(formUrl);
  if (!formId) return res.status(400).json({ message: 'Google Forms URL ไม่ถูกต้อง' });

  const client = getClient();
  client.setCredentials(tokens);
  const forms = google.forms({ version: 'v1', auth: client });

  try {
    const { data: form } = await forms.forms.get({ formId });

    const token = randomBytes(32).toString('hex');
    const [result] = await db.query(
      'INSERT INTO surveys (user_id, title, description, status, share_token, google_form_url, google_form_id) VALUES (?,?,?,?,?,?,?)',
      [req.user.id, form.info?.title || 'Imported Survey', form.info?.description || '', 'draft', token,
       `https://docs.google.com/forms/d/${formId}/viewform`, formId]
    );
    const surveyId = result.insertId;

    const qIdMap = {};
    for (const [idx, item] of (form.items || []).entries()) {
      const googleQId = item.questionItem?.question?.questionId;
      const q = fromGoogleItem(item, idx + 1);
      const [qResult] = await db.query(
        'INSERT INTO questions (survey_id, section_number, sort_order, question_text, question_type, is_required, options_json) VALUES (?,?,?,?,?,?,?)',
        [surveyId, q.section, q.order, q.text, q.type, q.required ? 1 : 0, q.options ? JSON.stringify(q.options) : null]
      );
      if (googleQId) qIdMap[googleQId] = { localId: qResult.insertId, type: q.type };
    }

    let responseCount = 0;
    try {
      const { data: respData } = await forms.forms.responses.list({ formId });
      for (const resp of (respData.responses || [])) {
        const [rResult] = await db.query(
          'INSERT INTO responses (survey_id, respondent_name, submitted_at) VALUES (?,?,?)',
          [surveyId, resp.respondentEmail || 'Google Forms', resp.createTime ? new Date(resp.createTime) : new Date()]
        );
        const responseId = rResult.insertId;

        const vals = [];
        for (const [googleQId, ans] of Object.entries(resp.answers || {})) {
          const qInfo = qIdMap[googleQId];
          if (!qInfo) continue;
          const values = (ans.textAnswers?.answers || []).map(a => a.value).filter(Boolean);

          let answerText = null, answerJson = null, score = null;
          if (qInfo.type === 'checkbox') {
            answerText = values.join(', ');
            answerJson = JSON.stringify({ values });
          } else if (['scale', 'star'].includes(qInfo.type)) {
            const n = parseFloat(values[0]);
            if (!isNaN(n)) { score = n; answerJson = JSON.stringify({ score: n }); }
            answerText = values[0] || null;
          } else {
            answerText = values[0] || null;
            if (['radio', 'dropdown'].includes(qInfo.type)) {
              answerJson = JSON.stringify({ value: answerText });
              const m = (answerText || '').match(/\((\d+(?:\.\d+)?)\)\s*$/);
              if (m) score = parseFloat(m[1]);
            }
          }
          vals.push([responseId, qInfo.localId, answerText, answerJson, score]);
        }
        if (vals.length) {
          await db.query(
            'INSERT INTO response_answers (response_id, question_id, answer_text, answer_json, score) VALUES ?',
            [vals]
          );
        }
        responseCount++;
      }
    } catch (respErr) {
      console.warn('Could not fetch Google Form responses:', respErr.message);
    }

    removeTokens(state);
    res.json({ surveyId, title: form.info?.title || 'Imported Survey', questionCount: Object.keys(qIdMap).length, responseCount });
  } catch (e) {
    console.error('Google Forms import error:', e.message);
    if (e.code === 403 || e.status === 403) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์เข้าถึง Google Form นี้ — ตรวจสอบว่าคุณเป็นเจ้าของฟอร์ม' });
    }
    res.status(500).json({ message: 'ไม่สามารถนำเข้า Google Form ได้ กรุณาลองใหม่' });
  }
});

function extractFormId(url) {
  if (!url) return null;
  const m = url.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url.trim())) return url.trim();
  return null;
}

function fromGoogleItem(item, idx) {
  const q = { text: item.title || '', section: 1, order: idx, type: 'short', required: false, options: null };
  const qi = item.questionItem?.question;
  if (!qi) return q;

  q.required = !!qi.required;

  if (qi.textQuestion) {
    q.type = qi.textQuestion.paragraph ? 'para' : 'short';
  } else if (qi.choiceQuestion) {
    const map = { RADIO: 'radio', CHECKBOX: 'checkbox', DROP_DOWN: 'dropdown' };
    q.type = map[qi.choiceQuestion.type] || 'radio';
    q.options = (qi.choiceQuestion.options || []).map(o => o.value).filter(Boolean);
  } else if (qi.scaleQuestion) {
    q.type = 'scale';
    q.options = { min: qi.scaleQuestion.low ?? 1, max: qi.scaleQuestion.high ?? 5, min_label: qi.scaleQuestion.lowLabel || '', max_label: qi.scaleQuestion.highLabel || '' };
  } else if (qi.ratingQuestion) {
    q.type = 'star';
    q.options = { max_stars: qi.ratingQuestion.ratingScaleLevel || 5 };
  } else if (qi.dateQuestion) {
    q.type = 'date';
  } else if (qi.timeQuestion) {
    q.type = 'time';
  }

  return q;
}

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
