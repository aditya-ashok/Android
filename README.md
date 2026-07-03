# Namaste Bharat Inn — Hotel Booking Site + Revenue Dashboard

A full-stack website for **Namaste Bharat Inn** — a boutique hotel with
**12 rooms** and **2 banquet halls**. It includes a guest-facing booking
site, a booking engine, and an **admin revenue dashboard** that computes
**daily revenue, occupancy and per-channel (OTA) performance**.

> **OTA note:** MakeMyTrip, Yatra, Goibibo and Booking.com channels are
> **simulated** here (bookings are tagged by source and commission is
> deducted per channel). Real, live OTA sync requires signed contracts
> with each OTA plus a paid **channel manager** (STAAH, eZee, Djubo,
> etc.). The data model and revenue maths are already OTA-shaped, so a
> real channel-manager feed can be dropped in later without redesign.

## What's inside

| Page | File | Purpose |
|------|------|---------|
| **Website** | `index.html` | Hero, rooms (4 types / 12 keys), banquets, amenities, gallery, contact + **direct booking form** with live price/commission quote. |
| **Revenue Console** | `admin.html` | Daily **Gross / Net / Commission**, **Occupancy**, **ADR**, **RevPAR**, room vs banquet split, 14-day trend, channel doughnut, occupancy bars, channel table and in-house booking list. |

### The 12 rooms & 2 banquets
- **Deluxe Room** ×4 — ₹3,500/night
- **Executive Room** ×4 — ₹4,800/night
- **Family Room** ×2 — ₹6,000/night
- **Premium Suite** ×2 — ₹7,500/night
- **Ganga Grand Ballroom** — up to 300 guests, ₹75,000/day
- **Yamuna Conference Hall** — up to 150 guests, ₹40,000/day

### Distribution channels & commission
Direct 0% · Walk-in 0% · MakeMyTrip 18% · Yatra 16% · Goibibo 18% · Booking.com 15%

`net = gross − (gross × commission%)`. Booking direct keeps 100% of revenue.

## Two ways to run

### 1. Full-stack (frontend + backend + database)
Real REST API on Node/Express with a SQLite database.

```bash
npm install
npm run seed     # loads 12 rooms, 2 banquets, 6 channels + 45 days of sample bookings
npm start        # → http://localhost:3000  (site)  ·  /admin.html  (dashboard)
```

**API** (JSON):
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rooms`, `/api/banquets`, `/api/channels` | Catalog |
| GET | `/api/bookings` | Recent bookings |
| POST | `/api/bookings` | Create a booking |
| PATCH | `/api/bookings/:id` | Update status (`checked_in`, `checked_out`, `cancelled`) |
| GET | `/api/dashboard?date=YYYY-MM-DD` | Full day summary (revenue, occupancy, channels) |
| GET | `/api/revenue/range?from=&to=` | Daily revenue/occupancy series |

### 2. Static / demo (no backend)
The front-end detects when the API is unreachable and falls back to an
in-browser store (localStorage) seeded from the same catalog — so the
site and dashboard work when hosted on **GitHub Pages**:

```bash
python3 -m http.server 8080   # → http://localhost:8080
```

A badge in the corner shows which mode is active
(*Live backend connected* vs *Demo mode*).

## Deploying

- **GitHub Pages** (already configured in `.github/workflows/pages.yml`)
  serves the static demo automatically on push to `main`.
- **Full-stack** — deploy to any Node host (Render, Railway, a VPS):
  `npm install && npm run seed && npm start`. Set `PORT` via env var.

## Stack
- **Backend** — Node.js, Express, better-sqlite3
- **Frontend** — vanilla JS, Tailwind (CDN), Chart.js
- **Shared** — `assets/catalog.js` is a UMD module used by *both* the
  Node seeder and the browser, so rooms, channels and revenue maths have
  a single source of truth.

## Customising
- Rooms, banquets, channels, prices & commission → `assets/catalog.js`
- Hotel name, contact, images, copy → `index.html`
- Re-seed the database anytime → `npm run seed`

## Making OTA integration real (next phase)
1. Sign extranet contracts with MakeMyTrip, Yatra, etc.
2. Subscribe to a channel manager (STAAH / eZee / Djubo).
3. Map each channel's ARI (Availability, Rates, Inventory) push/pull to
   the `bookings` + `channels` tables — the schema already carries
   `channel`, `commission_pct`, `commission` and `net`.
