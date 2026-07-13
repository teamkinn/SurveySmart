# SurveySmart — ระบบแบบสอบถามออนไลน์

ระบบจัดการแบบสอบถามออนไลน์ภาษาไทย พร้อมแดชบอร์ดวิเคราะห์ผล

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 + Vite 5 + Pinia + Vue Router + Axios |
| Backend | Node.js + Express 4 + mysql2 + JWT + bcryptjs + nodemailer |
| Database | MySQL 8.0 |
| Hosting | Railway (backend + MySQL), Vercel (frontend) |
| Font / Theme | Sarabun, Navy / Gold / Royal Blue |

---

## Project Structure

```
surveysmart/
├── backend/
│   ├── src/
│   │   ├── app.js
│   │   ├── config/db.js
│   │   ├── middleware/auth.js
│   │   ├── middleware/isAdmin.js
│   │   ├── controllers/
│   │   ├── routes/
│   │   └── services/googleAuth.js
│   ├── database/schema.sql
│   └── .env
└── frontend/
    ├── src/
    │   ├── api/index.js
    │   ├── router/index.js
    │   ├── stores/          # auth, surveys
    │   ├── views/
    │   └── components/Survey/
    └── vite.config.js
```

---

## Getting Started

### 1. Database Setup

```sql
source backend/database/schema.sql
```

### 2. Backend Environment

Copy `.env.example` → `.env` and fill in values:

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

# Email (optional — for forgot password)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your@gmail.com
MAIL_PASS=your_app_password
MAIL_FROM=your@gmail.com

# Google Forms integration (optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

### 3. Install & Run

**Backend:**
```bash
cd backend && npm install && npm run dev
```

**Frontend:**
```bash
cd frontend && npm install && npm run dev
```

Open **http://localhost:5173**

---

## Features

- **Survey Builder** — multi-section wizard, 11 question types
- **Dashboard** — donut charts, score breakdown, KPI cards, date/gender filter
- **Response Management** — table view, CSV export
- **Share** — view other users' surveys (read-only)
- **Admin Panel** — manage users, promote/demote roles
- **Auth** — register, login, forgot/reset password, JWT sessions
- **Google Forms** — link surveys to Google Forms, receive responses via webhook

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Register |
| POST | `/api/auth/login` | — | Login → JWT |
| GET | `/api/auth/me` | ✅ | Current user |
| POST | `/api/auth/forgot-password` | — | Request reset link |
| POST | `/api/auth/reset-password` | — | Reset password with token |
| GET | `/api/surveys` | ✅ | Own surveys |
| GET | `/api/surveys/shared` | ✅ | Surveys shared with me |
| GET | `/api/surveys/others` | ✅ | All other users' surveys |
| POST | `/api/surveys` | ✅ | Create survey |
| PUT | `/api/surveys/:id` | ✅ | Update survey |
| DELETE | `/api/surveys/:id` | ✅ | Delete survey |
| PATCH | `/api/surveys/:id/publish` | ✅ | Publish survey |
| POST | `/api/surveys/:id/share` | ✅ | Share with user by email |
| GET | `/api/surveys/:id/responses` | ✅ | List responses |
| POST | `/api/surveys/:id/responses` | — | Submit response (public) |
| GET | `/api/surveys/:id/responses/chart-data` | ✅ | Chart data |
| POST | `/api/responses/public/form/:formId` | — | Google Forms webhook |
| GET | `/api/admin/users` | Admin | List all users |
| PATCH | `/api/admin/users/:id/role` | Admin | Change user role |
| DELETE | `/api/admin/users/:id` | Admin | Delete user |

---

## Database Schema

| Table | Purpose |
|---|---|
| `users` | Accounts (role: user/admin) |
| `surveys` | Survey metadata |
| `questions` | Questions with `options_json` |
| `responses` | One row per submission |
| `response_answers` | One row per question per submission |
| `survey_shares` | User-to-user read access |
| `password_resets` | Forgot password tokens |

**Views:** `v_survey_summary` · `v_question_stats`
