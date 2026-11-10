# Namaste Bharat Inn — Hotel Booking + Owner/Manager Console

A full-stack website and property-management system for **Namaste Bharat
Inn** — **12 rooms**, **2 banquet halls** (Anga Hall · Magadha Hall).
Guest-facing booking site with **Razorpay** payments, plus a
login-protected **Owner/Manager console** backed by a database.

---

## Features

### Guest website (`index.html`)
Rooms, banquets, amenities, gallery, contact, and a **direct booking
form** with a live price/commission quote and **Razorpay** checkout
(Pay → Confirm). OTA channels (MakeMyTrip, Yatra, Goibibo, Booking.com)
are simulated and commission-tagged.

### Owner / Manager console (`login.html` → `manage.html`)
Role-based login. **Owner** = everything incl. finances, rates & staff.
**Manager** = day-to-day operations (rates read-only, no staff admin).

| Module | Owner | Manager |
|--------|:-----:|:-------:|
| **Reports** — daily gross/net/commission, occupancy, ADR, RevPAR, 14-day trend, channel breakdown | ✅ | ✅ |
| **Bookings** — the "all room booking info" service: search/filter all bookings, check-in, check-out, cancel | ✅ | ✅ |
| **Housekeeping** — live status of every room (clean / occupied / dirty / maintenance) + today's guest | ✅ | ✅ |
| **Rates & inventory** — edit room/banquet prices & per-channel commission | ✅ edit | 👁 read-only |
| **Settings** — change password; add/manage staff accounts | ✅ full | 👁 own password |

**Default logins** (change in Settings after first sign-in):
`owner / owner123` · `manager / manager123`

---

## Tech / architecture
- **Backend** — Node.js + Express (`server/app.js`), exported so it runs
  as a local server *and* as a Vercel serverless function.
- **Database** — **libSQL / Turso** (SQLite-compatible). Same client and
  SQL run locally (a file) and in production (Turso). No ORM.
- **Auth** — scrypt password hashing + stateless HMAC-signed session
  cookies (`server/auth.js`). No external auth service.
- **Payments** — Razorpay Orders API + server-side HMAC signature
  verification (`/api/payment/*`). Test Mode when no keys are set.
- **Frontend** — vanilla JS + Tailwind (CDN) + Chart.js. `assets/catalog.js`
  is a UMD module shared by the Node seeder and the browser.

```
index.html  login.html  manage.html        ← pages
assets/     catalog.js api.js app.js manage.js styles.css
server/     app.js  db.js  auth.js  seed.js  index.js
api/        index.js                         ← Vercel entry
vercel.json  .env.example
```

---

## Run locally (file database — no setup)

```bash
npm install
npm run seed        # 12 rooms, 2 halls, 6 channels, 2 users, 45 days of bookings
npm start           # → http://localhost:3000
```
- Website: http://localhost:3000/
- Console: http://localhost:3000/login.html

### Key API endpoints
| | Endpoint | Access |
|-|----------|--------|
| Public | `GET /api/rooms` · `/api/banquets` · `/api/channels` | open |
| Public | `POST /api/bookings` · `GET/POST /api/payment/*` | open |
| Auth | `POST /api/auth/login` · `/logout` · `GET /api/auth/me` | — |
| Auth | `GET /api/bookings` (filters: `q,status,channel,kind,from,to`) · `PATCH /api/bookings/:id` | owner+manager |
| Auth | `GET /api/housekeeping` · `PATCH /api/rooms/:id/status` | owner+manager |
| Auth | `GET /api/dashboard?date=` · `GET /api/revenue/range?from=&to=` | owner+manager |
| Owner | `PATCH /api/rooms/:id/rate` · `/api/banquets/:id/rate` · `/api/channels/:id` | owner |
| Owner | `GET/POST /api/users` · `PATCH /api/users/password` | owner |

---

## Deploy to Vercel (+ Turso + thenamastebharat.in)

Vercel is serverless, so the file DB won't persist — use **Turso** (free).

**1. Create the database**
```bash
# install the Turso CLI, then:
turso db create namaste-bharat
turso db show namaste-bharat --url          # → TURSO_DATABASE_URL (libsql://…)
turso db tokens create namaste-bharat       # → TURSO_AUTH_TOKEN
```

**2. Seed it once (from your machine)**
```bash
TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… npm run seed
```
(The app also auto-creates the two logins + catalog on first run if the
DB is empty; `npm run seed` additionally loads sample bookings.)

**3. Deploy**
- Import the GitHub repo at vercel.com (framework preset: **Other**).
- Add Environment Variables (Settings → Environment Variables):
  `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET` (long random),
  and optionally `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
- Deploy. `vercel.json` routes `/api/*` to the Express function and
  serves the static pages from Vercel's CDN.

**4. Point the domain**
- Vercel → Project → **Settings → Domains → Add** `thenamastebharat.in`
  (and `www.thenamastebharat.in`).
- At your domain registrar, add the records **exactly as Vercel shows them**.
  Typically:
  - Apex `thenamastebharat.in` → **A** record → `76.76.21.21`
  - `www` → **CNAME** → `cname.vercel-dns.com`
- DNS can take a few minutes to a few hours; Vercel issues HTTPS automatically.

> Static-only hosting (e.g. GitHub Pages) can still serve the **public
> website** in demo mode, but the login-protected console needs this
> Node/Vercel backend + Turso.

---

## Making OTA integration real (next phase)
OTA channels are simulated and commission-tagged today. For live sync:
sign OTA extranet contracts, subscribe to a channel manager (STAAH / eZee
/ Djubo), and map its ARI feed onto the `bookings` + `channels` tables —
the schema already carries `channel`, `commission_pct`, `commission`, `net`.
