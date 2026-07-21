const router = require('express').Router();
const { google } = require('googleapis');
const { randomBytes } = require('crypto');
const auth = require('../middleware/auth');
const db = require('../config/db');
const {
  getClient,
  registerPendingState,
  getTokens,
  hasTokens,
  removeTokens,
} = require('../services/googleAuth');
const { pullFormResponses } = require('../services/googleFormsSync');

router.use(auth);

// GET /api/google/auth-url
router.get('/auth-url', (req, res) => {
  const state = Math.random().toString(36).substring(2, 12);
  registerPendingState(state, req.user.id);
  const client = getClient();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/forms.body'],
    state,
    prompt: 'consent',
  });
  res.json({ url, state });
});

// GET /api/google/oauth-status?state=... — polled by the opener tab while
// the Google consent popup is open. Google's accounts.google.com pages set
// Cross-Origin-Opener-Policy: same-origin, which severs window.opener the
// moment the popup navigates there — so the popup->opener postMessage
// handoff can't be relied on. Polling this instead only needs a plain
// same-origin XHR from the opener tab, unaffected by COOP.
router.get('/oauth-status', (req, res) => {
  const { state } = req.query;
  if (!state) return res.status(400).json({ message: 'state is required' });
  res.json({ ready: hasTokens(state, req.user.id) });
});

// POST /api/google/create-form
router.post('/create-form', async (req, res) => {
  const { state, survey } = req.body;
  const tokens = getTokens(state, req.user.id);
  if (!tokens) {
    return res.status(401).json({ message: 'Google auth expired — please authorize again' });
  }

  const client = getClient();
  client.setCredentials(tokens);
  const forms = google.forms({ version: 'v1', auth: client });

  try {
    const { data: form } = await forms.forms.create({
      requestBody: {
        info: {
          title: survey.title || 'แบบสอบถาม',
          documentTitle: survey.title || 'แบบสอบถาม',
        },
      },
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

// GET /api/google/import-auth-url
router.get('/import-auth-url', (req, res) => {
  const state = Math.random().toString(36).substring(2, 12);
  registerPendingState(state, req.user.id);
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

  const tokens = getTokens(state, req.user.id);
  if (!tokens) {
    return res.status(401).json({ message: 'Google auth expired — please authorize again' });
  }

  if (/\/forms\/d\/e\//.test(formUrl)) {
    return res.status(400).json({
      message:
        'ลิงก์นี้เป็นลิงก์สำหรับตอบแบบสอบถาม (viewform) ซึ่งไม่สามารถใช้นำเข้าได้ กรุณาเปิดฟอร์มในโหมดแก้ไข แล้วคัดลอก URL จากแถบที่อยู่ (ต้องมีรูปแบบ .../forms/d/FORM_ID/edit)',
    });
  }

  const formId = extractFormId(formUrl);
  if (!formId) return res.status(400).json({ message: 'Google Forms URL ไม่ถูกต้อง' });

  const client = getClient();
  client.setCredentials(tokens);
  const forms = google.forms({ version: 'v1', auth: client });

  try {
    const { data: form } = await forms.forms.get({ formId });

    const token = randomBytes(32).toString('hex');
    const [result] = await db.query(
      `INSERT INTO surveys
         (user_id, title, description, status, share_token, google_form_url, google_form_id)
       VALUES (?,?,?,?,?,?,?)`,
      [
        req.user.id,
        form.info?.title || 'Imported Survey',
        form.info?.description || '',
        'draft',
        token,
        `https://docs.google.com/forms/d/${formId}/viewform`,
        formId,
      ]
    );
    const surveyId = result.insertId;

    const qIdMap = {};
    for (const [idx, item] of (form.items || []).entries()) {
      if (item.questionGroupItem) {
        const gi = item.questionGroupItem;
        const isCheckbox = gi.grid?.columns?.type === 'CHECKBOX';
        const type = isCheckbox ? 'cbgrid' : 'mcgrid';
        const cols = (gi.grid?.columns?.options || []).map(o => o.value).filter(Boolean);
        const rows = (gi.questions || []).map(rq => rq.rowQuestion?.title || '');
        const rowQuestionIds = (gi.questions || []).map(rq => rq.questionId || null);
        const required = (gi.questions || []).some(rq => rq.required);
        const [qResult] = await db.query(
          `INSERT INTO questions
             (survey_id, section_number, sort_order, question_text, question_type, is_required, options_json)
           VALUES (?,?,?,?,?,?,?)`,
          [
            surveyId,
            1,
            idx + 1,
            item.title || '',
            type,
            required ? 1 : 0,
            JSON.stringify({ rows, cols, rowQuestionIds }),
          ]
        );
        for (const rq of gi.questions || []) {
          if (rq.questionId) {
            qIdMap[rq.questionId] = {
              localId: qResult.insertId,
              type,
              isGridRow: true,
              rowLabel: rq.rowQuestion?.title || '',
              cols,
            };
          }
        }
        continue;
      }

      const googleQId = item.questionItem?.question?.questionId;
      const q = fromGoogleItem(item, idx + 1);
      const [qResult] = await db.query(
        `INSERT INTO questions
           (survey_id, section_number, sort_order, question_text, question_type, is_required, options_json, google_question_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          surveyId,
          q.section,
          q.order,
          q.text,
          q.type,
          q.required ? 1 : 0,
          q.options ? JSON.stringify(q.options) : null,
          googleQId || null,
        ]
      );
      if (googleQId) qIdMap[googleQId] = { localId: qResult.insertId, type: q.type, options: q.options };
    }

    let responseCount = 0;
    try {
      const result = await pullFormResponses(forms, formId, surveyId);
      responseCount = result.synced;
    } catch (respErr) {
      console.warn('Could not fetch Google Form responses:', respErr.message);
    }

    // Persist the refresh token (if Google issued one) so the background
    // poller can pick up new responses automatically from here on.
    if (tokens.refresh_token) {
      await db.query('UPDATE surveys SET google_refresh_token = ?, last_synced_at = NOW() WHERE id = ?', [
        tokens.refresh_token,
        surveyId,
      ]);
    }

    removeTokens(state);
    res.json({
      surveyId,
      title: form.info?.title || 'Imported Survey',
      questionCount: Object.keys(qIdMap).length,
      responseCount,
    });
  } catch (e) {
    console.error('Google Forms import error:', e.message);
    if (e.code === 403 || e.status === 403) {
      return res.status(403).json({
        message: 'ไม่มีสิทธิ์เข้าถึง Google Form นี้ — ตรวจสอบว่าคุณเป็นเจ้าของฟอร์ม',
      });
    }
    res.status(500).json({ message: 'ไม่สามารถนำเข้า Google Form ได้ กรุณาลองใหม่' });
  }
});

// GET /api/google/sync-auth-url — same scopes as import, for the "sync now" popup flow
router.get('/sync-auth-url', (req, res) => {
  const state = Math.random().toString(36).substring(2, 12);
  registerPendingState(state, req.user.id);
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

// POST /api/google/sync-responses — pull latest responses for an already-linked survey
router.post('/sync-responses', async (req, res) => {
  const { state, surveyId } = req.body;
  if (!surveyId) return res.status(400).json({ message: 'surveyId is required' });

  const tokens = getTokens(state, req.user.id);
  if (!tokens) {
    return res.status(401).json({ message: 'Google auth expired — please authorize again' });
  }

  try {
    const [[survey]] = await db.query(
      'SELECT id, google_form_id FROM surveys WHERE id = ? AND user_id = ?',
      [surveyId, req.user.id]
    );
    if (!survey) return res.status(404).json({ message: 'ไม่พบแบบสอบถาม' });
    if (!survey.google_form_id) {
      return res.status(400).json({ message: 'แบบสอบถามนี้ยังไม่ได้เชื่อมกับ Google Form' });
    }
    const formId = survey.google_form_id;

    const client = getClient();
    client.setCredentials(tokens);
    const forms = google.forms({ version: 'v1', auth: client });

    const { synced, skipped } = await pullFormResponses(forms, formId, surveyId);

    // Persist the refresh token (if Google issued one) so the background
    // poller can keep pulling new responses without another manual sync.
    if (tokens.refresh_token) {
      await db.query('UPDATE surveys SET google_refresh_token = ? WHERE id = ?', [
        tokens.refresh_token,
        surveyId,
      ]);
    }
    await db.query('UPDATE surveys SET last_synced_at = NOW() WHERE id = ?', [surveyId]);

    removeTokens(state);
    res.json({ ok: true, synced, skipped });
  } catch (e) {
    console.error('Google Forms sync error:', e.message);
    if (e.code === 403 || e.status === 403) {
      return res.status(403).json({
        message: 'ไม่มีสิทธิ์เข้าถึง Google Form นี้ — ตรวจสอบว่าคุณเป็นเจ้าของฟอร์ม',
      });
    }
    res.status(500).json({ message: 'ไม่สามารถซิงค์คำตอบได้ กรุณาลองใหม่' });
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
  const q = {
    text: item.title || '',
    section: 1,
    order: idx,
    type: 'short',
    required: false,
    options: null,
  };
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
    q.options = {
      min: qi.scaleQuestion.low ?? 1,
      max: qi.scaleQuestion.high ?? 5,
      min_label: qi.scaleQuestion.lowLabel || '',
      max_label: qi.scaleQuestion.highLabel || '',
    };
  } else if (qi.ratingQuestion) {
    q.type = 'star';
    q.options = { max_stars: qi.ratingQuestion.ratingScaleLevel || 5 };
  } else if (qi.dateQuestion) {
    q.type = 'date';
  } else if (qi.timeQuestion) {
    q.type = 'time';
  } else if (qi.fileUploadQuestion) {
    q.type = 'file';
  }

  return q;
}

function toGoogleItem(q) {
  const title = q.text || 'คำถาม';

  if (q.type === 'short' || q.type === 'para') {
    return {
      title,
      questionItem: { question: { required: false, textQuestion: { paragraph: q.type === 'para' } } },
    };
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
    return {
      title,
      questionItem: {
        question: { required: false, scaleQuestion: { low: q.scaleMin ?? 1, high: q.scaleMax ?? 5 } },
      },
    };
  }

  if (q.type === 'star') {
    return {
      title,
      questionItem: {
        question: { required: false, ratingQuestion: { ratingScaleLevel: 5, iconType: 'STAR' } },
      },
    };
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
