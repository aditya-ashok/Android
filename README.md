# Namaste Bharat Inn — Hotel Booking + Owner/Manager Console

A full-stack website and property-management system for **Namaste Bharat
Inn** — **12 rooms**, **2 banquet halls** (Anga Hall · Magadha Hall).
Guest-facing booking site with **Razorpay** payments, plus a
login-protected **Owner/Manager console** backed by a database.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Faditya-ashok%2FnamastebharatInn&env=DATABASE_URL,AUTH_SECRET&envDescription=Neon%20Postgres%20connection%20string%20and%20a%20random%20auth%20secret)

> One-click deploy: click the button, sign in to Vercel, and paste your
> Neon `DATABASE_URL` + an `AUTH_SECRET` when prompted. See
> [Deploy to Vercel](#deploy-to-vercel--neon-postgres--thenamastebharatin) below.

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

## Deploy to Vercel (+ Neon Postgres + thenamastebharat.in)

Vercel is serverless, so use a hosted Postgres — **Neon** (free tier).

**1. Create the database**
- Sign in at [neon.tech](https://neon.tech) → **Create Project**.
- Copy the **connection string** (`postgresql://…@…neon.tech/neondb?sslmode=require`).
  This is your `DATABASE_URL`.

**2. Deploy** — click the button above, or at vercel.com → **Add New →
Project** → import `namastebharatInn` (framework preset: **Other**).

**3. Environment Variables** (Settings → Environment Variables), then redeploy:
| Name | Value |
|------|-------|
| `DATABASE_URL` | your Neon connection string |
| `AUTH_SECRET` | any long random string |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | *(optional — live payments)* |

On first visit the app auto-creates the two logins + rooms/banquets in
your Neon DB. For demo sample bookings in Reports, run once from your
machine: `DATABASE_URL=postgresql://… npm run seed`.

**4. Point the domain**
- Vercel → Project → **Settings → Domains → Add** `thenamastebharat.in`
  (and `www.thenamastebharat.in`).
- At your registrar, add the records **exactly as Vercel shows them**.
  Typically: apex **A** → `76.76.21.21`, `www` **CNAME** → `cname.vercel-dns.com`.
- Vercel issues HTTPS automatically once DNS resolves.

> Static-only hosting (e.g. GitHub Pages) can still serve the **public
> website** in demo mode, but the login-protected console needs this
> Node/Vercel backend + Neon.

---

## Making OTA integration real (next phase)
OTA channels are simulated and commission-tagged today. For live sync:
sign OTA extranet contracts, subscribe to a channel manager (STAAH / eZee
/ Djubo), and map its ARI feed onto the `bookings` + `channels` tables —
the schema already carries `channel`, `commission_pct`, `commission`, `net`.
