const https = require('https');

exports.generateSurvey = async (req, res) => {
  const { topic, language = 'th' } = req.body;
  if (!topic) return res.status(400).json({ message: 'กรุณาระบุหัวข้อ' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ message: 'ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY' });

  const systemPrompt = language === 'th'
    ? 'คุณเป็นผู้เชี่ยวชาญการสร้างแบบสอบถาม ตอบเป็นภาษาไทย'
    : 'You are a survey design expert.';

  const userPrompt = `สร้างแบบสอบถามเกี่ยวกับ: "${topic}"

ส่งคืนเป็น JSON array เท่านั้น ไม่มีข้อความอื่น รูปแบบดังนี้:
[
  { "section": 1, "text": "ชื่อ-นามสกุล", "type": "short", "opts": [] },
  { "section": 1, "text": "เพศ", "type": "radio", "opts": ["ชาย","หญิง","ไม่ระบุ"] },
  { "section": 2, "text": "คำถามประเมิน...", "type": "radio", "opts": ["ดีมาก","ดี","ปานกลาง","พอใช้","ควรปรับปรุง"] },
  { "section": 3, "text": "ข้อเสนอแนะ", "type": "para", "opts": [] }
]

กฎ:
- section 1 = ข้อมูลส่วนตัว (2-3 ข้อ)
- section 2 = คำถามหลักเกี่ยวกับ "${topic}" (4-6 ข้อ) ใช้ type: radio, scale, star ตามความเหมาะสม
- section 3 = ข้อเสนอแนะ (1 ข้อ type: para)
- type ที่ใช้ได้: short, para, radio, checkbox, dropdown, scale, star, date
- ส่ง JSON array เท่านั้น`;

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  });

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  };

  try {
    const result = await new Promise((resolve, reject) => {
      const httpReq = https.request(options, (httpRes) => {
        let data = '';
        httpRes.on('data', chunk => data += chunk);
        httpRes.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('Invalid JSON from Anthropic')); }
        });
      });
      httpReq.on('error', reject);
      httpReq.write(body);
      httpReq.end();
    });

    if (result.error) return res.status(500).json({ message: result.error.message });

    const raw = result.content?.[0]?.text || '[]';
    // Extract JSON array from the response
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return res.status(500).json({ message: 'AI ไม่สามารถสร้างคำถามได้ ลองใหม่อีกครั้ง' });

    const questions = JSON.parse(match[0]);
    res.json({ questions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
