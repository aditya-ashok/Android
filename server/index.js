/*
 * Namaste Bharat Inn — Express API + static site server.
 *
 *   npm install
 *   npm run seed      # first run only
 *   npm start         # http://localhost:3000
 *
 * Serves the front-end (index.html / admin.html) AND a JSON API under /api.
 */
const path = require("path");
const express = require("express");
const cors = require("cors");
const db = require("./db");
const CATALOG = require("../assets/catalog");

const app = express();
const PORT = process.env.PORT || 3000;
const TOTAL_ROOMS = CATALOG.TOTAL_ROOMS; // 12

app.use(cors());
app.use(express.json());

// ---- helpers -----------------------------------------------------------
const parseRow = (r) => (r ? { ...r, amenities: JSON.parse(r.amenities || "[]") } : r);
const money = (n) => Math.round(n || 0);

function bookingOut(b) {
  return {
    id: b.id,
    ref: b.ref,
    kind: b.kind,
    itemId: b.item_id,
    itemName: b.item_name,
    roomType: b.room_type,
    guestName: b.guest_name,
    guestEmail: b.guest_email,
    guestPhone: b.guest_phone,
    checkIn: b.check_in,
    checkOut: b.check_out,
    nights: b.nights,
    guests: b.guests,
    channel: b.channel,
    rate: b.rate,
    gross: b.gross,
    commissionPct: b.commission_pct,
    commission: b.commission,
    net: b.net,
    status: b.status,
    createdAt: b.created_at,
  };
}

// Does a booking occupy the given date (check_in <= date < check_out)?
// Banquets occupy only their single event day.
function occupiesDate(b, date) {
  if (b.status === "cancelled") return false;
  if (b.kind === "banquet") return b.check_in === date;
  return b.check_in <= date && date < b.check_out;
}

// ---- catalog endpoints -------------------------------------------------
app.get("/api/rooms", (req, res) => {
  res.json(db.prepare("SELECT * FROM rooms").all().map(parseRow));
});

app.get("/api/banquets", (req, res) => {
  res.json(db.prepare("SELECT * FROM banquets").all().map(parseRow));
});

app.get("/api/channels", (req, res) => {
  res.json(db.prepare("SELECT * FROM channels").all());
});

// ---- bookings ----------------------------------------------------------
app.get("/api/bookings", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM bookings ORDER BY check_in DESC, id DESC LIMIT 500")
    .all();
  res.json(rows.map(bookingOut));
});

app.post("/api/bookings", (req, res) => {
  const b = req.body || {};
  try {
    const kind = b.kind === "banquet" ? "banquet" : "room";
    let item, rate, nights;

    if (kind === "room") {
      item = parseRow(db.prepare("SELECT * FROM rooms WHERE id = ? OR type = ? LIMIT 1").get(b.itemId, b.roomType));
      if (!item) return res.status(400).json({ error: "Unknown room" });
      nights = CATALOG.nightsBetween(b.checkIn, b.checkOut);
      rate = item.price;
    } else {
      item = parseRow(db.prepare("SELECT * FROM banquets WHERE id = ? LIMIT 1").get(b.itemId));
      if (!item) return res.status(400).json({ error: "Unknown banquet" });
      nights = 1;
      rate = item.price;
    }

    const gross = rate * nights;
    const m = CATALOG.computeMoney(b.channel || "direct", gross);
    const ref = "NBI-" + Math.floor(10000 + Math.random() * 89999);
    const createdAt = new Date().toISOString().slice(0, 10);

    const info = db
      .prepare(
        `INSERT INTO bookings
        (ref,kind,item_id,item_name,room_type,guest_name,guest_email,guest_phone,
         check_in,check_out,nights,guests,channel,rate,gross,commission_pct,commission,net,status,created_at)
        VALUES (@ref,@kind,@itemId,@itemName,@roomType,@guestName,@guestEmail,@guestPhone,
         @checkIn,@checkOut,@nights,@guests,@channel,@rate,@gross,@commissionPct,@commission,@net,'confirmed',@createdAt)`
      )
      .run({
        ref,
        kind,
        itemId: item.id,
        itemName: item.name,
        roomType: kind === "room" ? item.type : "Banquet",
        guestName: b.guestName || "Guest",
        guestEmail: b.guestEmail || "",
        guestPhone: b.guestPhone || "",
        checkIn: b.checkIn,
        checkOut: kind === "room" ? b.checkOut : b.checkIn,
        nights,
        guests: b.guests || 1,
        channel: b.channel || "direct",
        rate,
        gross: m.gross,
        commissionPct: m.commissionPct,
        commission: m.commission,
        net: m.net,
        createdAt,
      });

    const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json(bookingOut(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch("/api/bookings/:id", (req, res) => {
  const { status } = req.body || {};
  const allowed = ["confirmed", "checked_in", "checked_out", "cancelled"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Bad status" });
  db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, req.params.id);
  const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(bookingOut(row));
});

// ---- revenue / dashboard ----------------------------------------------
// Summary for a single day: revenue split, occupancy, ADR, RevPAR, channels.
function daySummary(date) {
  const all = db.prepare("SELECT * FROM bookings").all();
  const inHouse = all.filter((b) => occupiesDate(b, date));
  const rooms = inHouse.filter((b) => b.kind === "room");
  const banquets = inHouse.filter((b) => b.kind === "banquet");

  // per-night revenue recognised for that day = gross / nights
  const nightly = (b) => money(b.gross / (b.nights || 1));
  const nightlyNet = (b) => money(b.net / (b.nights || 1));

  const roomRevenue = rooms.reduce((s, b) => s + nightly(b), 0);
  const banquetRevenue = banquets.reduce((s, b) => s + b.gross, 0);
  const grossRevenue = roomRevenue + banquetRevenue;
  const netRevenue =
    rooms.reduce((s, b) => s + nightlyNet(b), 0) +
    banquets.reduce((s, b) => s + b.net, 0);
  const commission = grossRevenue - netRevenue;

  const roomsSold = rooms.length;
  const occupancy = Math.round((roomsSold / TOTAL_ROOMS) * 1000) / 10; // %
  const adr = roomsSold ? money(roomRevenue / roomsSold) : 0;         // avg daily rate
  const revpar = money(roomRevenue / TOTAL_ROOMS);                    // rev per available room

  // channel breakdown
  const chMap = {};
  CATALOG.CHANNELS.forEach((c) => (chMap[c.id] = { id: c.id, name: c.name, color: c.color, commission: c.commission, bookings: 0, gross: 0, net: 0 }));
  inHouse.forEach((b) => {
    const c = chMap[b.channel] || chMap.direct;
    const g = b.kind === "banquet" ? b.gross : nightly(b);
    const nt = b.kind === "banquet" ? b.net : nightlyNet(b);
    c.bookings += 1;
    c.gross += g;
    c.net += nt;
  });

  return {
    date,
    grossRevenue: money(grossRevenue),
    netRevenue: money(netRevenue),
    commission: money(commission),
    roomRevenue: money(roomRevenue),
    banquetRevenue: money(banquetRevenue),
    roomsSold,
    totalRooms: TOTAL_ROOMS,
    occupancy,
    adr,
    revpar,
    banquetEvents: banquets.length,
    channels: Object.values(chMap),
    bookings: inHouse.map(bookingOut),
  };
}

app.get("/api/dashboard", (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  res.json(daySummary(date));
});

// Daily revenue series between two dates (inclusive).
app.get("/api/revenue/range", (req, res) => {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from =
    req.query.from ||
    new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10);
  const series = [];
  let cur = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  let guard = 0;
  while (cur <= end && guard++ < 400) {
    const d = cur.toISOString().slice(0, 10);
    const s = daySummary(d);
    series.push({
      date: d,
      grossRevenue: s.grossRevenue,
      netRevenue: s.netRevenue,
      commission: s.commission,
      occupancy: s.occupancy,
      roomsSold: s.roomsSold,
      adr: s.adr,
    });
    cur.setDate(cur.getDate() + 1);
  }
  res.json(series);
});

// ---- static front-end --------------------------------------------------
app.use(express.static(path.join(__dirname, "..")));

app.listen(PORT, () => {
  console.log(`Namaste Bharat Inn running → http://localhost:${PORT}`);
});
