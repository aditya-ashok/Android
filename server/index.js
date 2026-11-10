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
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const db = require("./db");
const CATALOG = require("../assets/catalog");

const app = express();
const PORT = process.env.PORT || 3000;
const TOTAL_ROOMS = CATALOG.TOTAL_ROOMS; // 12

// ---- Razorpay config ---------------------------------------------------
// Set real keys via env for live payments:
//   RAZORPAY_KEY_ID=rzp_test_xxx RAZORPAY_KEY_SECRET=yyy npm start
// With no keys the API runs in Test Mode (orders/verification simulated)
// so the booking + payment flow is fully demoable without credentials.
const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const RZP_LIVE = Boolean(RZP_KEY_ID && RZP_KEY_SECRET);

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
    paymentStatus: b.payment_status,
    paymentMethod: b.payment_method,
    paymentId: b.payment_id,
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
         check_in,check_out,nights,guests,channel,rate,gross,commission_pct,commission,net,status,
         payment_status,payment_method,payment_id,created_at)
        VALUES (@ref,@kind,@itemId,@itemName,@roomType,@guestName,@guestEmail,@guestPhone,
         @checkIn,@checkOut,@nights,@guests,@channel,@rate,@gross,@commissionPct,@commission,@net,'confirmed',
         @paymentStatus,@paymentMethod,@paymentId,@createdAt)`
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
        paymentStatus: b.paymentStatus || "unpaid",
        paymentMethod: b.paymentMethod || CATALOG.payMethod(b.channel || "direct"),
        paymentId: b.paymentId || null,
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

// ---- payments (Razorpay) ----------------------------------------------
// Tells the front-end whether live Razorpay is configured and, if so,
// the publishable key_id (never the secret).
app.get("/api/payment/config", (req, res) => {
  res.json({ enabled: RZP_LIVE, keyId: RZP_LIVE ? RZP_KEY_ID : null, currency: "INR" });
});

// Create a Razorpay order for `amount` (rupees). Live mode calls the
// Razorpay Orders API; otherwise a simulated order id is returned.
app.post("/api/payment/order", async (req, res) => {
  const rupees = Math.max(1, Math.round(Number(req.body && req.body.amount) || 0));
  const amountPaise = rupees * 100;
  const receipt = "rcpt_" + Date.now();
  try {
    if (!RZP_LIVE) {
      return res.json({
        id: "order_sim_" + crypto.randomBytes(8).toString("hex"),
        amount: amountPaise,
        currency: "INR",
        simulated: true,
      });
    }
    const auth = Buffer.from(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`).toString("base64");
    const r = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic " + auth },
      body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, payment_capture: 1 }),
    });
    const order = await r.json();
    if (!r.ok) return res.status(502).json({ error: order.error ? order.error.description : "Razorpay order failed" });
    res.json({ id: order.id, amount: order.amount, currency: order.currency, simulated: false });
  } catch (err) {
    res.status(502).json({ error: "Payment gateway unreachable: " + err.message });
  }
});

// Verify the signature Razorpay returns after checkout.
// signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret).
app.post("/api/payment/verify", (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!RZP_LIVE || (razorpay_order_id || "").startsWith("order_sim_")) {
    // Test Mode: accept and mint a simulated payment id if needed.
    return res.json({
      verified: true,
      simulated: true,
      paymentId: razorpay_payment_id || "pay_sim_" + crypto.randomBytes(8).toString("hex"),
    });
  }
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ verified: false, error: "Missing payment fields" });
  }
  const expected = crypto
    .createHmac("sha256", RZP_KEY_SECRET)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");
  const ok =
    expected.length === razorpay_signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
  if (!ok) return res.status(400).json({ verified: false, error: "Signature mismatch" });
  res.json({ verified: true, simulated: false, paymentId: razorpay_payment_id });
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
