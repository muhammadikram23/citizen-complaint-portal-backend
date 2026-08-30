# Citizen Complaint Portal — Backend API

Government / Civic Tech MERN Platform Backend built with Node.js, Express.js, MongoDB (Mongoose), and JWT authentication.

## Features Implemented

1. **User Authentication & Role-based Authorization**:
   - Citizen registration (`POST /api/auth/signup`) and login (`POST /api/auth/login`).
   - Hardcoded / seeded Officer account with administrative privileges (`scripts/createOfficer.js`).
   - JWT protection (`protect`) and role restriction (`officerOnly`).

2. **Complaints Lifecycle & Dynamic Priority Scoring**:
   - `POST /api/complaints` (Citizen create issue).
   - `GET /api/complaints` (Public feed with full-text search, category/area/status filters).
   - `GET /api/complaints/mine` (Citizen's own issues).
   - `GET /api/complaints/:id` (Detailed complaint view).
   - Dynamic Priority calculation based on Section 5.11 formula:
     $$\text{Score} = \text{upvotes} \times 2 + \text{daysSinceCreated}$$
     - $\text{Score} < 5 \to \text{Low}$
     - $5 \le \text{Score} \le 15 \to \text{Medium}$
     - $16 \le \text{Score} \le 30 \to \text{High}$
     - $\text{Score} > 30 \to \text{Critical}$
   - Dynamic recalculation on every fetch (no background cron job needed).

3. **Duplicate Complaint Detection**:
   - Reuses `GET /api/complaints?category=...&area=...&status=pending,in-progress` to detect existing issues in real-time as a citizen types.

4. **Single-Upvote Enforcement**:
   - `PATCH /api/complaints/:id/upvote` prevents double upvoting using the `upvotedBy` array.

5. **Officer Resolution & Citizen Feedback Loop**:
   - `PATCH /api/complaints/:id/status` (Officer updates status to `Pending`, `In Progress`, or `Resolved` + adds `officerRemark`).
   - Marking as `Resolved` automatically flags `feedbackPending: true`.
   - `PATCH /api/complaints/:id/feedback` allows the complaint owner to submit 1–5 star rating and comment.

6. **AI Daily Briefing for Officers**:
   - `POST /api/ai/officer-summary` aggregates operational stats (overdue, critical, hotspots, average citizen satisfaction) and invokes Anthropic Claude API (with Gemini & smart local summary fallbacks).

7. **CSV Export for Government Reporting**:
   - `GET /api/complaints/export` streams filtered complaints formatted as CSV with auto-generated filenames.

---

## API Endpoints Reference

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | Public | Service health check |
| `POST` | `/api/auth/signup` | Public | Register a new citizen account |
| `POST` | `/api/auth/login` | Public | Login with email & password (returns JWT) |
| `GET` | `/api/auth/me` | Authenticated | Get current authenticated user info |
| `GET` | `/api/complaints` | Public | List complaints with search, category, area, status, priority filters |
| `POST` | `/api/complaints` | Citizen / Auth | Submit a new complaint |
| `GET` | `/api/complaints/mine` | Citizen / Auth | List complaints filed by the current user |
| `GET` | `/api/complaints/:id` | Public | Get single complaint details |
| `PATCH` | `/api/complaints/:id/upvote` | Citizen / Auth | Upvote a complaint (prevents double upvoting) |
| `PATCH` | `/api/complaints/:id/status` | Officer Only | Update status (`Pending`, `In Progress`, `Resolved`) & add remark |
| `PATCH` | `/api/complaints/:id/feedback` | Citizen Owner | Submit 1–5 star satisfaction rating and comment |
| `GET` | `/api/complaints/export` | Officer Only | Download filtered complaints as `.csv` file |
| `POST` / `GET` | `/api/ai/officer-summary` | Officer Only | AI-generated operations briefing card & stats |

---

## Environment Variables (.env)

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/citizen_complaint_portal
JWT_SECRET=supersecret_jwt_key_for_citizen_portal_2026
JWT_EXPIRES_IN=7d

# Officer Default Account
OFFICER_NAME=City Officer
OFFICER_EMAIL=officer@citygov.org
OFFICER_PASSWORD=Officer@123

# AI Briefing Provider (Anthropic Claude)
ANTHROPIC_API_KEY=

# Optional Gemini API key
GEMINI_API_KEY=
```

---

## Setup & Running Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Seed Officer Account**:
   ```bash
   npm run seed:officer
   ```

3. **Seed Demo Complaints (Optional for testing)**:
   ```bash
   npm run seed:complaints
   ```

4. **Run Server**:
   ```bash
   npm start
   ```

5. **Run Automated Test Suite**:
   ```bash
   npm test
   ```

---

## Deployment Instructions (Render / Railway / Atlas)

1. **MongoDB Atlas**:
   - Create a free MongoDB Atlas cluster at https://mongodb.com
   - Create database user and whitelist IP `0.0.0.0/0`
   - Copy connection string to `MONGO_URI`

2. **Deploy on Render / Railway**:
   - Set Build Command: `npm install`
   - Set Start Command: `node server.js`
   - Set Environment Variables: `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `ANTHROPIC_API_KEY`
