# IVCS Manager Survey

A mobile-first web app to record IVCS Manager details across Meghalaya.

**Flow:** Login → select **District → Block → Name of IVCS** (cascading
dropdowns from the official list of 503 IVCS, with an *"Others"* option
for IVCS not on the list) → enter **Manager Name**, **Manager Phone
Number** (10-digit validation) and **Shareholders Count** → Submit.

Every entry is saved to a **Google Sheet in real time** (once connected,
see below) and also kept on the device as an offline backup with a
one-tap *Sync pending* button and CSV export.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app (login, survey form, records, CSV export) |
| `data.js` | District → Block → IVCS list generated from `IVCS__Survey_1.xlsx` |
| `config.js` | Backend URL + demo-mode users — **the only file you edit** |
| `apps-script/Code.gs` | Google Apps Script backend (login + write to Sheet) |

## Try it immediately (demo mode)

Open `survey/index.html` in a browser (or visit `/survey/` on the
deployed site). Until a backend is configured the app runs in demo mode:

- Login: **admin / ivcs@2026**
- Entries are stored on the device only, downloadable as CSV.

## Connect Google Sheets for live capture (~2 minutes)

1. Create a new **Google Sheet** — this becomes your live database.
2. In the sheet: **Extensions → Apps Script**, delete the sample code,
   paste the whole of `apps-script/Code.gs`, and save.
3. In the Apps Script toolbar select the **`setup`** function and press
   **Run** (grant permission when asked). This creates:
   - a **Responses** tab — one row per submission, timestamped;
   - a **Users** tab with a default account `admin / ivcs@2026` —
     **change this password**, and add a row per surveyor
     (`username, password, full name, role, active=yes`).
4. **Deploy → New deployment → Web app**, with
   *Execute as: Me* and *Who has access: Anyone*. Copy the `/exec` URL.
5. Paste that URL into `config.js` → `SCRIPT_URL`, commit and push.

From then on login is checked against the Users tab (deactivate anyone
by setting *Active* to `no`), and every submission appears in the
Responses tab instantly. Duplicate retries are filtered by submission ID.

## Managing users

All accounts live in the **Users** tab of your Google Sheet — no code
changes needed. Role `admin` additionally allows fetching all responses
through the API; everyone else can only submit.

## Deployment

This repo already publishes to GitHub Pages from `main`, so after
merging, the survey is live at `https://<your-domain>/survey/`.
