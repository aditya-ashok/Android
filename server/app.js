/*
 * Namaste Bharat Inn — Express application (API).
 *
 * Exported as a plain Express app so it can run two ways:
 *   - locally via server/index.js (app.listen)
 *   - on Vercel via api/index.js (serverless handler)
 *
 * Modules: auth (owner/manager), bookings, rooms & housekeeping,
 * rates & inventory, reports & finances, payments (Razorpay).
 */
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { db, ensureReady, USE_NEON } = require("./db");
const auth = require("./auth");
const CATALOG = require("../assets/catalog");

const app = express();
const TOTAL_ROOMS = CATALOG.TOTAL_ROOMS; // 12

// ---- Razorpay config ----
const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const RZP_LIVE = Boolean(RZP_KEY_ID && RZP_KEY_SECRET);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Public health check — never throws, so it can report the DB being down.
app.get("/api/status", async (req, res) => {
  try {
    await ensureReady();
    res.json({ ok: true, db: "ok", configured: USE_NEON });
  } catch (e) {
    res.status(200).json({
      ok: false,
      db: "down",
      configured: USE_NEON,
      message: USE_NEON
        ? "Could not connect to the database. Check that DATABASE_URL is correct and the database is reachable."
        : "DATABASE_URL is not set. Add your Neon connection string in your host's environment variables (e.g. Vercel → Settings → Environment Variables), then redeploy.",
    });
  }
});

// Guard only the API: if the DB isn't ready, return a clear, friendly error.
// Static pages (index/login/manage) still load so the UI can explain things.
app.use("/api", async (req, res, next) => {
  try {
    await ensureReady();
    next();
  } catch (e) {
    res.status(503).json({
      error: "database_unavailable",
      configured: USE_NEON,
      message: USE_NEON
        ? "The database is unreachable right now. Please check DATABASE_URL and try again."
        : "The backend database isn't configured yet. Set DATABASE_URL (your Neon connection string) in your host's environment variables, then redeploy.",
    });
  }
});

// ---- helpers ----
const money = (n) => Math.round(n || 0);
const num = (v) => (v == null ? v : Number(v));

function roomOut(r) {
  return { ...r, price: num(r.price), capacity: num(r.capacity), amenities: JSON.parse(r.amenities || "[]") };
}
function banquetOut(b) {
  return { ...b, price: num(b.price), capacity: num(b.capacity), amenities: JSON.parse(b.amenities || "[]") };
}
function bookingOut(b) {
  return {
    id: num(b.id), ref: b.ref, kind: b.kind, itemId: b.item_id, itemName: b.item_name,
    roomType: b.room_type, guestName: b.guest_name, guestEmail: b.guest_email, guestPhone: b.guest_phone,
    checkIn: b.check_in, checkOut: b.check_out, nights: num(b.nights), guests: num(b.guests),
    channel: b.channel, rate: num(b.rate), gross: num(b.gross), commissionPct: num(b.commission_pct),
    commission: num(b.commission), net: num(b.net), status: b.status,
    paymentStatus: b.payment_status, paymentMethod: b.payment_method, paymentId: b.payment_id,
    createdAt: b.created_at,
  };
}
async function query(sql, args = []) {
  return (await db.execute({ sql, args })).rows;
}

function occupiesDate(b, date) {
  if (b.status === "cancelled") return false;
  if (b.kind === "banquet") return b.checkIn === date;
  return b.checkIn <= date && date < b.checkOut;
}

// ============================= AUTH =====================================
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  const rows = await query("SELECT * FROM users WHERE username = ?", [String(username || "").toLowerCase().trim()]);
  const u = rows[0];
  if (!u || !auth.verifyPassword(password, u.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  const token = auth.signToken({ uid: Number(u.id), username: u.username, role: u.role, name: u.name });
  res.cookie("nbi_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: auth.TOKEN_TTL_MS,
  });
  res.json({ user: { username: u.username, role: u.role, name: u.name }, token });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("nbi_token");
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const u = auth.currentUser(req);
  if (!u) return res.status(401).json({ error: "Not authenticated" });
  res.json({ user: { username: u.username, role: u.role, name: u.name } });
});

// ---- owner: user management ----
app.get("/api/users", auth.requireOwner, async (req, res) => {
  const rows = await query("SELECT id, username, role, name, created_at FROM users ORDER BY id");
  res.json(rows.map((r) => ({ id: num(r.id), username: r.username, role: r.role, name: r.name, createdAt: r.created_at })));
});

app.post("/api/users", auth.requireOwner, async (req, res) => {
  const { username, password, role, name } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  if (!["owner", "manager"].includes(role)) return res.status(400).json({ error: "role must be owner or manager" });
  try {
    await db.execute({
      sql: "INSERT INTO users (username,password_hash,role,name,created_at) VALUES (?,?,?,?,?)",
      args: [String(username).toLowerCase().trim(), auth.hashPassword(password), role, name || username, new Date().toISOString()],
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: "Could not create user (username may already exist)" });
  }
});

app.patch("/api/users/password", auth.requireAuth, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
  await db.execute({ sql: "UPDATE users SET password_hash = ? WHERE username = ?", args: [auth.hashPassword(newPassword), req.user.username] });
  res.json({ ok: true });
});

// ======================= CATALOG (public read) ==========================
app.get("/api/rooms", async (req, res) => res.json((await query("SELECT * FROM rooms ORDER BY id")).map(roomOut)));
app.get("/api/banquets", async (req, res) => res.json((await query("SELECT * FROM banquets ORDER BY id")).map(banquetOut)));
app.get("/api/channels", async (req, res) => {
  res.json((await query("SELECT * FROM channels")).map((c) => ({ ...c, commission: num(c.commission) })));
});

// ========================= BOOKINGS =====================================
// Public: create a booking (guest website).
app.post("/api/bookings", async (req, res) => {
  const b = req.body || {};
  try {
    const kind = b.kind === "banquet" ? "banquet" : "room";
    let item, rate, nights;
    if (kind === "room") {
      const rows = await query("SELECT * FROM rooms WHERE id = ? OR type = ? LIMIT 1", [b.itemId || "", b.roomType || ""]);
      if (!rows[0]) return res.status(400).json({ error: "Unknown room" });
      item = roomOut(rows[0]);
      nights = CATALOG.nightsBetween(b.checkIn, b.checkOut);
      rate = item.price;
    } else {
      const rows = await query("SELECT * FROM banquets WHERE id = ? LIMIT 1", [b.itemId || ""]);
      if (!rows[0]) return res.status(400).json({ error: "Unknown banquet" });
      item = banquetOut(rows[0]);
      nights = 1;
      rate = item.price;
    }
    const gross = rate * nights;
    const m = CATALOG.computeMoney(b.channel || "direct", gross);
    const ref = "NBI-" + Math.floor(10000 + Math.random() * 89999);
    const createdAt = new Date().toISOString().slice(0, 10);
    const r = await db.execute({
      sql: `INSERT INTO bookings
        (ref,kind,item_id,item_name,room_type,guest_name,guest_email,guest_phone,
         check_in,check_out,nights,guests,channel,rate,gross,commission_pct,commission,net,status,
         payment_status,payment_method,payment_id,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'confirmed',?,?,?,?) RETURNING id`,
      args: [
        ref, kind, item.id, item.name, kind === "room" ? item.type : "Banquet",
        b.guestName || "Guest", b.guestEmail || "", b.guestPhone || "",
        b.checkIn, kind === "room" ? b.checkOut : b.checkIn, nights, b.guests || 1,
        b.channel || "direct", rate, m.gross, m.commissionPct, m.commission, m.net,
        b.paymentStatus || "unpaid", b.paymentMethod || CATALOG.payMethod(b.channel || "direct"), b.paymentId || null, createdAt,
      ],
    });
    const row = (await query("SELECT * FROM bookings WHERE id = ?", [r.rows[0].id]))[0];
    res.status(201).json(bookingOut(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Auth: list / filter all bookings (the "all room booking info" service).
app.get("/api/bookings", auth.requireAuth, async (req, res) => {
  const { status, channel, kind, from, to, q } = req.query;
  const where = [];
  const args = [];
  if (status) { where.push("status = ?"); args.push(status); }
  if (channel) { where.push("channel = ?"); args.push(channel); }
  if (kind) { where.push("kind = ?"); args.push(kind); }
  if (from) { where.push("check_in >= ?"); args.push(from); }
  if (to) { where.push("check_in <= ?"); args.push(to); }
  if (q) { where.push("(guest_name LIKE ? OR ref LIKE ? OR item_name LIKE ? OR guest_phone LIKE ?)"); const s = "%" + q + "%"; args.push(s, s, s, s); }
  const sql = "SELECT * FROM bookings" + (where.length ? " WHERE " + where.join(" AND ") : "") + " ORDER BY check_in DESC, id DESC LIMIT 1000";
  res.json((await query(sql, args)).map(bookingOut));
});

// Auth: update a booking (status and/or editable fields).
app.patch("/api/bookings/:id", auth.requireAuth, async (req, res) => {
  const { status, guestName, guestPhone, guestEmail, checkIn, checkOut, guests } = req.body || {};
  const sets = [];
  const args = [];
  if (status) {
    if (!["confirmed", "checked_in", "checked_out", "cancelled"].includes(status)) return res.status(400).json({ error: "Bad status" });
    sets.push("status = ?"); args.push(status);
  }
  if (guestName != null) { sets.push("guest_name = ?"); args.push(guestName); }
  if (guestPhone != null) { sets.push("guest_phone = ?"); args.push(guestPhone); }
  if (guestEmail != null) { sets.push("guest_email = ?"); args.push(guestEmail); }
  if (checkIn != null) { sets.push("check_in = ?"); args.push(checkIn); }
  if (checkOut != null) { sets.push("check_out = ?"); args.push(checkOut); }
  if (guests != null) { sets.push("guests = ?"); args.push(Number(guests)); }
  if (!sets.length) return res.status(400).json({ error: "Nothing to update" });
  args.push(req.params.id);
  await db.execute({ sql: `UPDATE bookings SET ${sets.join(", ")} WHERE id = ?`, args });
  const row = (await query("SELECT * FROM bookings WHERE id = ?", [req.params.id]))[0];
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(bookingOut(row));
});

// =================== ROOMS & HOUSEKEEPING (auth) ========================
const ROOM_STATUSES = ["clean", "occupied", "dirty", "maintenance"];

app.get("/api/housekeeping", auth.requireAuth, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const rooms = (await query("SELECT * FROM rooms ORDER BY id")).map(roomOut);
  const bookings = (await query("SELECT * FROM bookings")).map(bookingOut);
  const result = rooms.map((r) => {
    const current = bookings.find((b) => b.kind === "room" && b.itemId === r.id && occupiesDate(b, today));
    return {
      id: r.id, name: r.name, type: r.type, number: r.number,
      status: r.status || "clean",
      guest: current ? current.guestName : null,
      ref: current ? current.ref : null,
      checkOut: current ? current.checkOut : null,
    };
  });
  res.json(result);
});

app.patch("/api/rooms/:id/status", auth.requireAuth, async (req, res) => {
  const { status } = req.body || {};
  if (!ROOM_STATUSES.includes(status)) return res.status(400).json({ error: "status must be one of " + ROOM_STATUSES.join(", ") });
  await db.execute({ sql: "UPDATE rooms SET status = ? WHERE id = ?", args: [status, req.params.id] });
  res.json({ ok: true, id: req.params.id, status });
});

// ==================== RATES & INVENTORY (owner) =========================
app.patch("/api/rooms/:id/rate", auth.requireOwner, async (req, res) => {
  const price = Math.round(Number(req.body && req.body.price));
  if (!(price > 0)) return res.status(400).json({ error: "price must be a positive number" });
  await db.execute({ sql: "UPDATE rooms SET price = ? WHERE id = ?", args: [price, req.params.id] });
  res.json({ ok: true, id: req.params.id, price });
});

app.patch("/api/banquets/:id/rate", auth.requireOwner, async (req, res) => {
  const price = Math.round(Number(req.body && req.body.price));
  if (!(price > 0)) return res.status(400).json({ error: "price must be a positive number" });
  await db.execute({ sql: "UPDATE banquets SET price = ? WHERE id = ?", args: [price, req.params.id] });
  res.json({ ok: true, id: req.params.id, price });
});

app.patch("/api/channels/:id", auth.requireOwner, async (req, res) => {
  const commission = Math.round(Number(req.body && req.body.commission));
  if (!(commission >= 0 && commission <= 60)) return res.status(400).json({ error: "commission must be 0–60" });
  await db.execute({ sql: "UPDATE channels SET commission = ? WHERE id = ?", args: [commission, req.params.id] });
  res.json({ ok: true, id: req.params.id, commission });
});

// ===================== REPORTS & FINANCES (auth) ========================
function daySummary(date, allBookings, channels) {
  const inHouse = allBookings.filter((b) => occupiesDate(b, date));
  const rooms = inHouse.filter((b) => b.kind === "room");
  const banquets = inHouse.filter((b) => b.kind === "banquet");
  const nightly = (b) => money(b.gross / (b.nights || 1));
  const nightlyNet = (b) => money(b.net / (b.nights || 1));

  const roomRevenue = rooms.reduce((s, b) => s + nightly(b), 0);
  const banquetRevenue = banquets.reduce((s, b) => s + b.gross, 0);
  const grossRevenue = roomRevenue + banquetRevenue;
  const netRevenue = rooms.reduce((s, b) => s + nightlyNet(b), 0) + banquets.reduce((s, b) => s + b.net, 0);
  const roomsSold = rooms.length;

  const chMap = {};
  channels.forEach((c) => (chMap[c.id] = { id: c.id, name: c.name, color: c.color, commission: c.commission, bookings: 0, gross: 0, net: 0 }));
  inHouse.forEach((b) => {
    const c = chMap[b.channel] || chMap.direct || Object.values(chMap)[0];
    if (!c) return;
    const g = b.kind === "banquet" ? b.gross : nightly(b);
    const nt = b.kind === "banquet" ? b.net : nightlyNet(b);
    c.bookings += 1; c.gross += g; c.net += nt;
  });

  return {
    date,
    grossRevenue: money(grossRevenue), netRevenue: money(netRevenue), commission: money(grossRevenue - netRevenue),
    roomRevenue: money(roomRevenue), banquetRevenue: money(banquetRevenue),
    roomsSold, totalRooms: TOTAL_ROOMS,
    occupancy: Math.round((roomsSold / TOTAL_ROOMS) * 1000) / 10,
    adr: roomsSold ? money(roomRevenue / roomsSold) : 0,
    revpar: money(roomRevenue / TOTAL_ROOMS),
    banquetEvents: banquets.length,
    channels: Object.values(chMap),
    bookings: inHouse,
  };
}

async function loadForReports() {
  const bookings = (await query("SELECT * FROM bookings")).map(bookingOut);
  const channels = (await query("SELECT * FROM channels")).map((c) => ({ ...c, commission: num(c.commission) }));
  return { bookings, channels };
}

app.get("/api/dashboard", auth.requireAuth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const { bookings, channels } = await loadForReports();
  res.json(daySummary(date, bookings, channels));
});

app.get("/api/revenue/range", auth.requireAuth, async (req, res) => {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from || new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10);
  const { bookings, channels } = await loadForReports();
  const series = [];
  let cur = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  let guard = 0;
  while (cur <= end && guard++ < 400) {
    const d = cur.toISOString().slice(0, 10);
    const s = daySummary(d, bookings, channels);
    series.push({ date: d, grossRevenue: s.grossRevenue, netRevenue: s.netRevenue, commission: s.commission, occupancy: s.occupancy, roomsSold: s.roomsSold, adr: s.adr });
    cur.setDate(cur.getDate() + 1);
  }
  res.json(series);
});

// ========================= PAYMENTS (Razorpay) ==========================
app.get("/api/payment/config", (req, res) => {
  res.json({ enabled: RZP_LIVE, keyId: RZP_LIVE ? RZP_KEY_ID : null, currency: "INR" });
});

app.post("/api/payment/order", async (req, res) => {
  const rupees = Math.max(1, Math.round(Number(req.body && req.body.amount) || 0));
  const amountPaise = rupees * 100;
  try {
    if (!RZP_LIVE) {
      return res.json({ id: "order_sim_" + crypto.randomBytes(8).toString("hex"), amount: amountPaise, currency: "INR", simulated: true });
    }
    const authHdr = Buffer.from(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`).toString("base64");
    const r = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic " + authHdr },
      body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: "rcpt_" + Date.now(), payment_capture: 1 }),
    });
    const order = await r.json();
    if (!r.ok) return res.status(502).json({ error: order.error ? order.error.description : "Razorpay order failed" });
    res.json({ id: order.id, amount: order.amount, currency: order.currency, simulated: false });
  } catch (err) {
    res.status(502).json({ error: "Payment gateway unreachable: " + err.message });
  }
});

app.post("/api/payment/verify", (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!RZP_LIVE || (razorpay_order_id || "").startsWith("order_sim_")) {
    return res.json({ verified: true, simulated: true, paymentId: razorpay_payment_id || "pay_sim_" + crypto.randomBytes(8).toString("hex") });
  }
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return res.status(400).json({ verified: false, error: "Missing payment fields" });
  const expected = crypto.createHmac("sha256", RZP_KEY_SECRET).update(razorpay_order_id + "|" + razorpay_payment_id).digest("hex");
  const ok = expected.length === razorpay_signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
  if (!ok) return res.status(400).json({ verified: false, error: "Signature mismatch" });
  res.json({ verified: true, simulated: false, paymentId: razorpay_payment_id });
});

// ---- static front-end (used locally; on Vercel the CDN serves these) ----
app.use(express.static(path.join(__dirname, "..")));

module.exports = app;
