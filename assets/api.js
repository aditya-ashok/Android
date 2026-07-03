/*
 * Front-end data layer for Namaste Bharat Inn.
 *
 * Talks to the Express API when available (full-stack mode). If the API
 * can't be reached — e.g. the site is served statically from GitHub
 * Pages — it transparently falls back to an in-browser store backed by
 * localStorage and seeded from the shared CATALOG. Same method surface
 * either way, so the pages never care which mode they're in.
 */
window.NBI = (function () {
  const C = window.CATALOG;
  const LS_KEY = "nbi_bookings_v1";
  const TOTAL_ROOMS = C.TOTAL_ROOMS;
  let mode = "checking"; // 'api' | 'local'

  // ---------- local store ------------------------------------------------
  function today() {
    return new Date().toISOString().slice(0, 10);
  }
  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const seed = C.generateBookings(45, today());
    saveLocal(seed);
    return seed;
  }
  function saveLocal(list) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  function occupies(b, date) {
    if (b.status === "cancelled") return false;
    if (b.kind === "banquet") return b.checkIn === date;
    return b.checkIn <= date && date < b.checkOut;
  }

  function localDaySummary(date) {
    const all = loadLocal();
    const inHouse = all.filter((b) => occupies(b, date));
    const rooms = inHouse.filter((b) => b.kind === "room");
    const banquets = inHouse.filter((b) => b.kind === "banquet");
    const nightly = (b) => Math.round(b.gross / (b.nights || 1));
    const nightlyNet = (b) => Math.round(b.net / (b.nights || 1));

    const roomRevenue = rooms.reduce((s, b) => s + nightly(b), 0);
    const banquetRevenue = banquets.reduce((s, b) => s + b.gross, 0);
    const grossRevenue = roomRevenue + banquetRevenue;
    const netRevenue =
      rooms.reduce((s, b) => s + nightlyNet(b), 0) +
      banquets.reduce((s, b) => s + b.net, 0);

    const roomsSold = rooms.length;
    const chMap = {};
    C.CHANNELS.forEach(
      (c) =>
        (chMap[c.id] = {
          id: c.id, name: c.name, color: c.color, commission: c.commission,
          bookings: 0, gross: 0, net: 0,
        })
    );
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
      grossRevenue,
      netRevenue,
      commission: grossRevenue - netRevenue,
      roomRevenue,
      banquetRevenue,
      roomsSold,
      totalRooms: TOTAL_ROOMS,
      occupancy: Math.round((roomsSold / TOTAL_ROOMS) * 1000) / 10,
      adr: roomsSold ? Math.round(roomRevenue / roomsSold) : 0,
      revpar: Math.round(roomRevenue / TOTAL_ROOMS),
      banquetEvents: banquets.length,
      channels: Object.values(chMap),
      bookings: inHouse,
    };
  }

  function localRange(from, to) {
    const series = [];
    let cur = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    let guard = 0;
    while (cur <= end && guard++ < 400) {
      const d = cur.toISOString().slice(0, 10);
      const s = localDaySummary(d);
      series.push({
        date: d, grossRevenue: s.grossRevenue, netRevenue: s.netRevenue,
        commission: s.commission, occupancy: s.occupancy,
        roomsSold: s.roomsSold, adr: s.adr,
      });
      cur.setDate(cur.getDate() + 1);
    }
    return series;
  }

  function localCreate(b) {
    const all = loadLocal();
    const kind = b.kind === "banquet" ? "banquet" : "room";
    let item, rate, nights;
    if (kind === "room") {
      item = C.ROOMS.find((r) => r.id === b.itemId) || C.ROOMS.find((r) => r.type === b.roomType);
      nights = C.nightsBetween(b.checkIn, b.checkOut);
      rate = item.price;
    } else {
      item = C.BANQUETS.find((x) => x.id === b.itemId);
      nights = 1;
      rate = item.price;
    }
    const gross = rate * nights;
    const m = C.computeMoney(b.channel || "direct", gross);
    const booking = {
      ref: "NBI-" + Math.floor(10000 + Math.random() * 89999),
      kind, itemId: item.id, itemName: item.name,
      roomType: kind === "room" ? item.type : "Banquet",
      guestName: b.guestName || "Guest", guestEmail: b.guestEmail || "",
      guestPhone: b.guestPhone || "",
      checkIn: b.checkIn, checkOut: kind === "room" ? b.checkOut : b.checkIn,
      nights, guests: b.guests || 1, channel: b.channel || "direct",
      rate, gross: m.gross, commissionPct: m.commissionPct,
      commission: m.commission, net: m.net,
      status: "confirmed", createdAt: today(),
    };
    all.push(booking);
    saveLocal(all);
    return booking;
  }

  // ---------- API detection & unified surface ---------------------------
  async function detect() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const r = await fetch("/api/channels", { signal: ctrl.signal });
      clearTimeout(t);
      mode = r.ok ? "api" : "local";
    } catch (e) {
      mode = "local";
    }
    return mode;
  }
  const ready = detect();

  async function get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  return {
    ready,
    mode: () => mode,
    catalog: C,
    async rooms() {
      await ready;
      return mode === "api" ? get("/api/rooms") : C.ROOMS;
    },
    async banquets() {
      await ready;
      return mode === "api" ? get("/api/banquets") : C.BANQUETS;
    },
    async channels() {
      await ready;
      return mode === "api" ? get("/api/channels") : C.CHANNELS;
    },
    async dashboard(date) {
      await ready;
      const d = date || today();
      return mode === "api" ? get("/api/dashboard?date=" + d) : localDaySummary(d);
    },
    async range(from, to) {
      await ready;
      const t = to || today();
      const f = from || new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10);
      return mode === "api" ? get(`/api/revenue/range?from=${f}&to=${t}`) : localRange(f, t);
    },
    async createBooking(payload) {
      await ready;
      if (mode === "api") {
        const r = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error((await r.json()).error || "Booking failed");
        return r.json();
      }
      return localCreate(payload);
    },
    today,
  };
})();
