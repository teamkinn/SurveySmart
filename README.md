# SurveySmart — ระบบแบบสอบถามออนไลน์

ระบบจัดการแบบสอบถามออนไลน์ภาษาไทย พร้อมส่งออกเป็น Google Forms และ QR Code

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 + Vite 5 + Pinia + Vue Router + Axios |
| Backend | Node.js + Express 4 + mysql2 + JWT + bcryptjs |
| Database | MySQL 8.0 |
| Integrations | Google Forms API v1, Anthropic Claude AI |
| Font / Theme | Sarabun, Navy / Gold / Royal Blue |

---

## Project Structure

```
surveysmart/
├── backend/
│   ├── src/
│   │   ├── app.js                  # Express entry point (port 3000)
│   │   ├── config/db.js            # mysql2 connection pool
│   │   ├── middleware/auth.js      # JWT middleware
│   │   ├── controllers/            # authController, surveyController, aiController, ...
│   │   ├── routes/                 # auth, surveys, responses, notifications, ai, googleForms
│   │   └── services/googleAuth.js  # Google OAuth client + token store
│   ├── database/schema.sql         # Full MySQL DDL (tables + views)
│   └── .env                        # Environment variables
└── frontend/
    ├── src/
    │   ├── main.js
    │   ├── api/index.js            # Axios instance with JWT interceptor
    │   ├── router/index.js
    │   ├── stores/                 # Pinia: auth, surveys, notifications
    │   ├── views/                  # AuthView, MainLayout, SurveysView, DashboardView, ...
    │   └── components/
    │       └── Survey/
    │           └── SurveyBuilder.vue   # 5-step wizard + Google Forms export
    └── vite.config.js
```

---

## Getting Started

### 1. Database Setup

```sql
source backend/database/schema.sql
```

### 2. Backend Environment

Edit `backend/.env`:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=surveysmart
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
CLIENT_ORIGIN=http://localhost:5173

# AI (optional)
ANTHROPIC_API_KEY=your_anthropic_key

# Google Forms integration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

### 3. Install & Run

**Backend:**
```bash
cd backend
npm install
npm run dev       # nodemon — port 3000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev       # Vite HMR — port 5173
```

Open **http://localhost:5173**

---

## Features

### Survey Builder (5-step wizard)

| Step | Content |
|---|---|
| 1 | ตั้งค่า — ชื่อ, คำอธิบาย, วันสิ้นสุด, AI Generator |
| 2 | ตอน 1 — ข้อมูลส่วนตัว |
| 3 | ตอน 2 — ความพึงพอใจ |
| 4 | ตอน 3 — ข้อเสนอแนะ |
| 5 | ตรวจสอบ & สร้าง Google Form + QR Code |

**Question types:** `short` `para` `radio` `checkbox` `dropdown` `file` `scale` `star` `date` `time`

**Per-question features:** drag-and-drop reorder · type picker · live preview

### AI Template Generator
- Input a topic → Claude generates a full question set across 3 sections
- Requires `ANTHROPIC_API_KEY`

### Google Forms Export (Step 5)
1. Shows a **Google Forms mockup** (purple header, all questions in Google style)
2. Click **"สร้าง Google Form"** → Google OAuth popup opens
3. Authorize → form created via Google Forms API v1
4. **QR Code** displayed inline and downloadable as PNG
5. Survey automatically saved to SurveySmart with the Google Form URL linked

### Survey Management
- Search, status filter, sort
- Publish draft → active
- Share with other users by email
- **Google Forms button** on rows with a linked Google Form

### Analytics
- Response count and average score per survey
- Per-question breakdown in responses view
- Dashboard with totals and trend charts

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/login` | Login → JWT |
| GET | `/api/auth/me` | Current user |
| GET | `/api/surveys` | List own surveys |
| POST | `/api/surveys` | Create survey |
| PUT | `/api/surveys/:id` | Update survey |
| DELETE | `/api/surveys/:id` | Delete survey |
| PATCH | `/api/surveys/:id/publish` | Publish survey |
| POST | `/api/surveys/:id/share` | Share with user |
| GET | `/api/surveys/:id/responses` | Survey responses |
| POST | `/api/surveys/:surveyId/responses` | Submit response |
| POST | `/api/ai/generate` | AI question generator |
| GET | `/api/google/auth-url` | Get Google OAuth URL |
| POST | `/api/google/create-form` | Create Google Form |
| GET | `/auth/google/callback` | Google OAuth callback |

---

## Google Forms Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable **Google Forms API** under APIs & Services → Library
3. Create **OAuth 2.0 Client ID** (Web application)
   - Authorized redirect URI: `http://localhost:3000/auth/google/callback`
4. Paste **Client ID** and **Client Secret** into `backend/.env`

> While in testing mode, add your Gmail to **OAuth consent screen → Test users**.

---

## Database Schema

| Table | Purpose |
|---|---|
| `users` | Accounts |
| `surveys` | Survey metadata + `google_form_url` |
| `questions` | Questions with `options_json` |
| `responses` | One row per submission |
| `response_answers` | One row per question per submission |
| `survey_shares` | User-to-user read access |
| `notifications` | In-app notification feed |

**Views:** `v_survey_summary` (response count + avg score) · `v_question_stats` (per-question analytics)
