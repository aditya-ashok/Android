# Jhanjharpur Vidhan Sabha — Redesign

A modern, single-page redesign of `jhanjharpur.co.in` built around the
Jhanjharpur Vidhan Sabha constituency (Madhubani, Bihar).

## Run

No build step — just open `index.html` in any browser, or serve the
folder:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

## What's inside

- **Hero** with live clock, weather/AQI widget and animated KPIs.
- **Live Dashboard**: budget utilization (bar), project status
  (doughnut), 12-month grievance trend (area), grievance categories
  (polar area), ward-wise activity list.
- **MLA / about** section with quote, term stats and tricolor visual.
- **Development** grid with 6 flagship projects and progress bars.
- **Schemes** directory (8 central + state welfare schemes).
- **Grievance** redressal flow with a working-looking form and tracker.
- **News & notices** cards + sticky **Janta Darbar** sidebar.
- **Gallery**, **contact** card and embedded OpenStreetMap of
  Jhanjharpur, plus footer with newsletter.

## Stack

- Tailwind CSS via CDN
- Chart.js 4 via CDN
- Google Fonts (Plus Jakarta Sans + Tiro Devanagari Hindi)
- Vanilla JS — `assets/main.js`

## Customising

Open `assets/main.js` to swap real numbers into the charts, ward list
and KPIs. Edit `index.html` for copy, MLA name, photos, and contact
details. The color tokens (`saffron`, `india`, `navy`, `ink`, `gold`)
are defined inline in the Tailwind config block at the top of
`index.html`.
