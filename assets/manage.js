/* Namaste Bharat Inn — Owner/Manager console. */
(function () {
  const C = window.CATALOG;
  const rupee = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
  const el = (id) => document.getElementById(id);
  const view = el("view");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtD = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  let user = null;
  let charts = {};

  function toast(msg, ok = true) {
    const t = el("toast");
    t.textContent = msg;
    t.className = "fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-soft text-sm text-white " + (ok ? "bg-leaf" : "bg-red-600");
    t.style.display = "block";
    clearTimeout(t._t);
    t._t = setTimeout(() => (t.style.display = "none"), 2600);
  }

  async function api(method, path, body) {
    const opt = { method, headers: {}, credentials: "include" };
    if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
    const r = await fetch(path, opt);
    if (r.status === 401) { location.href = "login.html"; throw new Error("Session expired"); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  const TABS = [
    { id: "reports", label: "Reports", render: renderReports },
    { id: "bookings", label: "Bookings", render: renderBookings },
    { id: "housekeeping", label: "Housekeeping", render: renderHousekeeping },
    { id: "rates", label: "Rates", render: renderRates },
    { id: "settings", label: "Settings", render: renderSettings },
  ];

  function buildTabs(active) {
    el("tabs").innerHTML = TABS.map(
      (t) => `<button data-tab="${t.id}" class="px-3 py-1.5 rounded-full whitespace-nowrap ${t.id === active ? "bg-saffron text-ink font-600" : "text-white/70 hover:bg-white/10"}">${t.label}</button>`
    ).join("");
    el("tabs").querySelectorAll("[data-tab]").forEach((b) =>
      b.addEventListener("click", () => go(b.dataset.tab))
    );
  }

  function go(tab) {
    charts = {}; // drop chart refs between tabs
    buildTabs(tab);
    const t = TABS.find((x) => x.id === tab) || TABS[0];
    try { location.hash = tab; } catch (e) {}
    t.render();
  }

  // =============================== REPORTS ==============================
  async function renderReports() {
    const today = new Date().toISOString().slice(0, 10);
    view.innerHTML = `
      <div class="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div><h1 class="font-display text-2xl font-700">Daily Revenue</h1><p class="text-black/50 text-sm" id="repSub">—</p></div>
        <label class="text-sm">Business date
          <input type="date" id="repDate" value="${today}" class="ml-2 rounded-lg border border-black/15 px-3 py-1.5 outline-none" />
        </label>
      </div>
      <div id="repKpis" class="grid grid-cols-2 lg:grid-cols-4 gap-4"></div>
      <div class="grid lg:grid-cols-3 gap-4 mt-5">
        <div class="bg-white rounded-2xl p-5 shadow-soft lg:col-span-2"><h3 class="font-600 mb-3">14-Day Revenue</h3><canvas id="repTrend" height="120"></canvas></div>
        <div class="bg-white rounded-2xl p-5 shadow-soft"><h3 class="font-600 mb-3">By Channel</h3><canvas id="repChannel" height="200"></canvas></div>
      </div>
      <div class="grid lg:grid-cols-3 gap-4 mt-4">
        <div class="bg-white rounded-2xl p-5 shadow-soft"><h3 class="font-600 mb-3">14-Day Occupancy %</h3><canvas id="repOcc" height="200"></canvas></div>
        <div class="bg-white rounded-2xl p-5 shadow-soft lg:col-span-2 overflow-x-auto thin-scroll"><h3 class="font-600 mb-3">Channel Performance</h3>
          <table class="w-full text-sm"><thead class="text-left text-black/45 border-b border-black/10"><tr><th class="py-2">Channel</th><th>Bookings</th><th>Gross</th><th>Commission</th><th>Net</th></tr></thead><tbody id="repChTable"></tbody></table>
        </div>
      </div>`;
    el("repDate").addEventListener("change", loadReports);
    loadReports();
  }

  async function loadReports() {
    const date = el("repDate").value;
    const from = new Date(new Date(date + "T00:00:00").getTime() - 13 * 86400000).toISOString().slice(0, 10);
    const [day, series] = await Promise.all([
      api("GET", "/api/dashboard?date=" + date),
      api("GET", `/api/revenue/range?from=${from}&to=${date}`),
    ]);
    el("repSub").textContent = "Business date · " + fmtD(date);
    const owner = user.role === "owner";
    const kpi = (label, val, sub, cls) => `<div class="bg-white rounded-2xl p-5 shadow-soft"><div class="text-xs uppercase tracking-wide text-black/45">${label}</div><div class="font-display text-2xl font-700 mt-1 ${cls || ""}">${val}</div><div class="text-xs text-black/45 mt-1">${sub}</div></div>`;
    el("repKpis").innerHTML =
      kpi("Gross Revenue", rupee(day.grossRevenue), "Rooms + banquets", "") +
      kpi("Net Revenue", rupee(day.netRevenue), "After OTA commission", "text-leaf") +
      (owner ? kpi("OTA Commission", rupee(day.commission), "Paid to channels", "text-saffron")
             : kpi("Rooms Sold", day.roomsSold + " / " + day.totalRooms, "Today", "")) +
      kpi("Occupancy", day.occupancy + "%", "ADR " + rupee(day.adr) + " · RevPAR " + rupee(day.revpar), "");

    const labels = series.map((d) => new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }));
    mkChart("repTrend", "line", {
      labels,
      datasets: [
        { label: "Gross", data: series.map((d) => d.grossRevenue), borderColor: "#ff7a18", backgroundColor: "rgba(255,122,24,.12)", fill: true, tension: .35, borderWidth: 2 },
        { label: "Net", data: series.map((d) => d.netRevenue), borderColor: "#0f8a5f", backgroundColor: "rgba(15,138,95,.10)", fill: true, tension: .35, borderWidth: 2 },
      ],
    }, { plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (c) => c.dataset.label + ": " + rupee(c.raw) } } }, scales: { y: { ticks: { callback: (v) => "₹" + v / 1000 + "k" } } } });

    const active = day.channels.filter((c) => c.bookings > 0).sort((a, b) => b.gross - a.gross);
    mkChart("repChannel", "doughnut", { labels: active.map((c) => c.name), datasets: [{ data: active.map((c) => c.gross), backgroundColor: active.map((c) => c.color), borderWidth: 0 }] },
      { cutout: "58%", plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => c.label + ": " + rupee(c.raw) } } } });

    mkChart("repOcc", "bar", { labels, datasets: [{ data: series.map((d) => d.occupancy), backgroundColor: "#c8912f", borderRadius: 4 }] },
      { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.raw + "%" } } }, scales: { y: { max: 100, ticks: { callback: (v) => v + "%" } } } });

    el("repChTable").innerHTML = active.length ? active.map((c) =>
      `<tr class="border-b border-black/5"><td class="py-2"><span class="badge-dot mr-2" style="background:${c.color}"></span>${c.name} <span class="text-black/40 text-xs">· ${c.commission}%</span></td><td>${c.bookings}</td><td>${rupee(c.gross)}</td><td class="text-saffron">${rupee(c.gross - c.net)}</td><td class="text-leaf font-600">${rupee(c.net)}</td></tr>`
    ).join("") : `<tr><td colspan="5" class="py-4 text-center text-black/40">No bookings this date.</td></tr>`;
  }

  function mkChart(id, type, data, options) {
    const ctx = el(id);
    if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, { type, data, options: { responsive: true, ...options } });
  }

  // =============================== BOOKINGS =============================
  const STATUS_STYLE = { confirmed: "bg-blue-100 text-blue-700", checked_in: "bg-green-100 text-green-700", checked_out: "bg-gray-100 text-gray-600", cancelled: "bg-red-100 text-red-700" };

  async function renderBookings() {
    const chOpts = ['<option value="">All channels</option>'].concat(C.CHANNELS.map((c) => `<option value="${c.id}">${c.name}</option>`)).join("");
    view.innerHTML = `
      <h1 class="font-display text-2xl font-700 mb-4">All Bookings</h1>
      <div class="bg-white rounded-2xl p-4 shadow-soft mb-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
        <input id="fQ" placeholder="Search guest / ref / phone" class="rounded-lg border border-black/15 px-3 py-2 outline-none" />
        <select id="fStatus" class="rounded-lg border border-black/15 px-3 py-2"><option value="">All statuses</option><option value="confirmed">Confirmed</option><option value="checked_in">Checked-in</option><option value="checked_out">Checked-out</option><option value="cancelled">Cancelled</option></select>
        <select id="fChannel" class="rounded-lg border border-black/15 px-3 py-2">${chOpts}</select>
        <select id="fKind" class="rounded-lg border border-black/15 px-3 py-2"><option value="">Rooms + Banquets</option><option value="room">Rooms</option><option value="banquet">Banquets</option></select>
        <button id="fGo" class="rounded-lg bg-ink text-white font-600 px-4 py-2 hover:bg-saffron">Apply</button>
      </div>
      <div class="bg-white rounded-2xl shadow-soft overflow-x-auto thin-scroll">
        <table class="w-full text-sm min-w-[920px]">
          <thead class="text-left text-black/45 border-b border-black/10"><tr>
            <th class="py-2 px-4">Ref</th><th>Guest</th><th>Room / Hall</th><th>Channel</th><th>Dates</th><th>Gross</th><th>Payment</th><th>Status</th><th class="pr-4">Actions</th>
          </tr></thead>
          <tbody id="bkRows"><tr><td class="p-4 text-black/40">Loading…</td></tr></tbody>
        </table>
      </div>
      <p id="bkCount" class="text-xs text-black/40 mt-2"></p>`;
    el("fGo").addEventListener("click", loadBookings);
    el("fQ").addEventListener("keydown", (e) => { if (e.key === "Enter") loadBookings(); });
    loadBookings();
  }

  async function loadBookings() {
    const p = new URLSearchParams();
    if (el("fQ").value) p.set("q", el("fQ").value);
    if (el("fStatus").value) p.set("status", el("fStatus").value);
    if (el("fChannel").value) p.set("channel", el("fChannel").value);
    if (el("fKind").value) p.set("kind", el("fKind").value);
    const rows = await api("GET", "/api/bookings?" + p.toString());
    el("bkCount").textContent = rows.length + " booking(s)";
    el("bkRows").innerHTML = rows.length ? rows.map(bookingRow).join("") : `<tr><td colspan="9" class="p-4 text-center text-black/40">No bookings match.</td></tr>`;
    el("bkRows").querySelectorAll("[data-act]").forEach((b) =>
      b.addEventListener("click", () => bookingAction(b.dataset.id, b.dataset.act))
    );
  }

  function bookingRow(b) {
    const ch = C.channel(b.channel);
    const paid = b.paymentStatus === "paid";
    const dates = b.kind === "banquet" ? fmtD(b.checkIn) : `${fmtD(b.checkIn)} → ${fmtD(b.checkOut)} <span class="text-black/40">(${b.nights}n)</span>`;
    const canCheckIn = b.status === "confirmed";
    const canCheckOut = b.status === "checked_in";
    const canCancel = b.status !== "cancelled" && b.status !== "checked_out";
    const btn = (act, label, cls) => `<button data-act="${act}" data-id="${b.id}" class="text-xs rounded-md px-2 py-1 ${cls}">${label}</button>`;
    const actions = [
      canCheckIn ? btn("checked_in", "Check-in", "bg-green-100 text-green-700 hover:bg-green-200") : "",
      canCheckOut ? btn("checked_out", "Check-out", "bg-gray-200 text-gray-700 hover:bg-gray-300") : "",
      canCancel ? btn("cancelled", "Cancel", "bg-red-100 text-red-700 hover:bg-red-200") : "",
    ].filter(Boolean).join(" ") || '<span class="text-black/30 text-xs">—</span>';
    return `<tr class="border-b border-black/5">
      <td class="py-2 px-4 font-mono text-xs">${esc(b.ref)}</td>
      <td>${esc(b.guestName)}<div class="text-[11px] text-black/40">${esc(b.guestPhone || "")}</div></td>
      <td>${esc(b.itemName)}<div class="text-[11px] text-black/40">${esc(b.roomType)}</div></td>
      <td><span class="badge-dot mr-1.5" style="background:${ch.color}"></span>${ch.name}</td>
      <td class="text-xs">${dates}</td>
      <td>${rupee(b.gross)}</td>
      <td><span class="text-xs px-2 py-0.5 rounded-full ${paid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}">${paid ? "Paid" : b.paymentStatus}</span><div class="text-[10px] text-black/40">${esc(b.paymentMethod || "")}</div></td>
      <td><span class="text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[b.status] || ""}">${b.status.replace("_", " ")}</span></td>
      <td class="pr-4 whitespace-nowrap">${actions}</td>
    </tr>`;
  }

  async function bookingAction(id, status) {
    const labels = { checked_in: "check in", checked_out: "check out", cancelled: "cancel" };
    if (status === "cancelled" && !confirm("Cancel this booking?")) return;
    try {
      await api("PATCH", "/api/bookings/" + id, { status });
      toast("Booking " + labels[status] + " done");
      loadBookings();
    } catch (e) { toast(e.message, false); }
  }

  // ============================ HOUSEKEEPING ============================
  const HK = {
    clean: { label: "Vacant · Clean", chip: "bg-green-100 text-green-700" },
    occupied: { label: "Occupied", chip: "bg-blue-100 text-blue-700" },
    dirty: { label: "Dirty", chip: "bg-amber-100 text-amber-700" },
    maintenance: { label: "Maintenance", chip: "bg-red-100 text-red-700" },
  };

  async function renderHousekeeping() {
    view.innerHTML = `<h1 class="font-display text-2xl font-700 mb-1">Rooms & Housekeeping</h1>
      <p class="text-black/50 text-sm mb-4">Live status of all ${C.TOTAL_ROOMS} rooms. Occupied rooms show today's guest.</p>
      <div id="hkGrid" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">Loading…</div>`;
    const rooms = await api("GET", "/api/housekeeping");
    el("hkGrid").innerHTML = rooms.map((r) => {
      const st = HK[r.status] || HK.clean;
      const opts = Object.keys(HK).map((k) => `<option value="${k}" ${k === r.status ? "selected" : ""}>${HK[k].label}</option>`).join("");
      return `<div class="bg-white rounded-2xl p-4 shadow-soft">
        <div class="flex items-center justify-between">
          <div><div class="font-700">${esc(r.name)}</div><div class="text-xs text-black/45">${esc(r.type)}</div></div>
          <span class="text-xs px-2 py-0.5 rounded-full ${st.chip}">${st.label}</span>
        </div>
        ${r.guest ? `<div class="text-xs text-black/55 mt-2">Guest: <b>${esc(r.guest)}</b> · out ${fmtD(r.checkOut)}</div>` : `<div class="text-xs text-black/35 mt-2">No guest in-house</div>`}
        <select data-room="${r.id}" class="mt-3 w-full text-sm rounded-lg border border-black/15 px-2 py-1.5">${opts}</select>
      </div>`;
    }).join("");
    el("hkGrid").querySelectorAll("[data-room]").forEach((s) =>
      s.addEventListener("change", async () => {
        try { await api("PATCH", `/api/rooms/${s.dataset.room}/status`, { status: s.value }); toast("Status updated"); renderHousekeeping(); }
        catch (e) { toast(e.message, false); }
      })
    );
  }

  // =============================== RATES ================================
  async function renderRates() {
    const owner = user.role === "owner";
    const [rooms, banquets, channels] = await Promise.all([
      api("GET", "/api/rooms"), api("GET", "/api/banquets"), api("GET", "/api/channels"),
    ]);
    // unique room types (price is per type)
    const seen = {};
    const types = rooms.filter((r) => (seen[r.type] ? false : (seen[r.type] = true)));
    const dis = owner ? "" : "disabled";
    const note = owner ? "" : `<p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">You are signed in as Manager — rates are read-only. Ask the Owner to change prices.</p>`;
    view.innerHTML = `<h1 class="font-display text-2xl font-700 mb-1">Rates & Inventory</h1>
      <p class="text-black/50 text-sm mb-4">Room & banquet prices and per-channel OTA commission.</p>${note}
      <div class="grid lg:grid-cols-2 gap-4">
        <div class="bg-white rounded-2xl p-5 shadow-soft"><h3 class="font-600 mb-3">Room rates (per night)</h3><div class="space-y-2">
          ${types.map((r) => rateRow("room", r.id, r.type, r.price, dis)).join("")}
        </div></div>
        <div class="bg-white rounded-2xl p-5 shadow-soft"><h3 class="font-600 mb-3">Banquet rates (per day)</h3><div class="space-y-2">
          ${banquets.map((b) => rateRow("banquet", b.id, b.name, b.price, dis)).join("")}
        </div></div>
        <div class="bg-white rounded-2xl p-5 shadow-soft lg:col-span-2"><h3 class="font-600 mb-3">Channel commission (%)</h3><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          ${channels.map((c) => `<div class="flex items-center justify-between gap-2 border border-black/10 rounded-lg px-3 py-2">
            <span class="text-sm"><span class="badge-dot mr-1.5" style="background:${c.color}"></span>${c.name}</span>
            <div class="flex items-center gap-1"><input type="number" min="0" max="60" value="${c.commission}" data-ch="${c.id}" ${dis} class="w-16 text-sm rounded-lg border border-black/15 px-2 py-1 text-right ${dis ? "bg-black/5" : ""}" /><span class="text-black/40 text-sm">%</span></div>
          </div>`).join("")}
        </div></div>
      </div>`;
    if (owner) {
      view.querySelectorAll("[data-save]").forEach((b) => b.addEventListener("click", () => saveRate(b)));
      view.querySelectorAll("[data-ch]").forEach((i) => i.addEventListener("change", async () => {
        try { await api("PATCH", "/api/channels/" + i.dataset.ch, { commission: Number(i.value) }); toast("Commission saved"); }
        catch (e) { toast(e.message, false); }
      }));
    }
  }
  function rateRow(kind, id, label, price, dis) {
    return `<div class="flex items-center justify-between gap-2">
      <span class="text-sm">${esc(label)}</span>
      <div class="flex items-center gap-2">
        <span class="text-black/40 text-sm">₹</span>
        <input type="number" min="1" value="${price}" data-rate="${id}" data-kind="${kind}" ${dis} class="w-28 text-sm rounded-lg border border-black/15 px-2 py-1 text-right ${dis ? "bg-black/5" : ""}" />
        ${dis ? "" : `<button data-save="${id}" class="text-xs rounded-md bg-ink text-white px-2.5 py-1 hover:bg-saffron">Save</button>`}
      </div></div>`;
  }
  async function saveRate(btn) {
    const id = btn.dataset.save;
    const input = view.querySelector(`[data-rate="${id}"]`);
    const kind = input.dataset.kind;
    const path = kind === "room" ? `/api/rooms/${id}/rate` : `/api/banquets/${id}/rate`;
    try { await api("PATCH", path, { price: Number(input.value) }); toast("Rate saved"); }
    catch (e) { toast(e.message, false); }
  }

  // ============================== SETTINGS ==============================
  async function renderSettings() {
    const owner = user.role === "owner";
    view.innerHTML = `<h1 class="font-display text-2xl font-700 mb-4">Settings</h1>
      <div class="grid lg:grid-cols-2 gap-4">
        <div class="bg-white rounded-2xl p-5 shadow-soft">
          <h3 class="font-600 mb-3">Change my password</h3>
          <div class="space-y-2 text-sm">
            <input id="pw1" type="password" placeholder="New password (min 6 chars)" class="w-full rounded-lg border border-black/15 px-3 py-2" />
            <input id="pw2" type="password" placeholder="Confirm new password" class="w-full rounded-lg border border-black/15 px-3 py-2" />
            <button id="pwSave" class="rounded-lg bg-ink text-white font-600 px-4 py-2 hover:bg-saffron">Update password</button>
          </div>
        </div>
        ${owner ? `<div class="bg-white rounded-2xl p-5 shadow-soft">
          <h3 class="font-600 mb-3">Staff accounts <span class="text-xs text-black/40">(owner only)</span></h3>
          <div id="userList" class="text-sm space-y-1 mb-3">Loading…</div>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <input id="nuName" placeholder="Full name" class="rounded-lg border border-black/15 px-3 py-2" />
            <input id="nuUser" placeholder="username" class="rounded-lg border border-black/15 px-3 py-2" />
            <input id="nuPass" placeholder="password" class="rounded-lg border border-black/15 px-3 py-2" />
            <select id="nuRole" class="rounded-lg border border-black/15 px-3 py-2"><option value="manager">Manager</option><option value="owner">Owner</option></select>
          </div>
          <button id="nuAdd" class="mt-2 rounded-lg bg-leaf text-white font-600 px-4 py-2 hover:brightness-110">Add staff</button>
        </div>` : ""}
      </div>`;
    el("pwSave").addEventListener("click", async () => {
      const a = el("pw1").value, b = el("pw2").value;
      if (a.length < 6) return toast("Password too short", false);
      if (a !== b) return toast("Passwords do not match", false);
      try { await api("PATCH", "/api/users/password", { newPassword: a }); toast("Password updated"); el("pw1").value = el("pw2").value = ""; }
      catch (e) { toast(e.message, false); }
    });
    if (owner) {
      await loadUsers();
      el("nuAdd").addEventListener("click", async () => {
        try {
          await api("POST", "/api/users", { name: el("nuName").value, username: el("nuUser").value, password: el("nuPass").value, role: el("nuRole").value });
          toast("Staff added"); el("nuName").value = el("nuUser").value = el("nuPass").value = ""; loadUsers();
        } catch (e) { toast(e.message, false); }
      });
    }
  }
  async function loadUsers() {
    const users = await api("GET", "/api/users");
    el("userList").innerHTML = users.map((u) =>
      `<div class="flex items-center justify-between border-b border-black/5 py-1"><span>${esc(u.name)} <span class="text-black/40">@${esc(u.username)}</span></span><span class="text-xs px-2 py-0.5 rounded-full ${u.role === "owner" ? "bg-saffron/20 text-saffron" : "bg-blue-100 text-blue-700"}">${u.role}</span></div>`
    ).join("");
  }

  // =============================== INIT =================================
  el("logout").addEventListener("click", async () => {
    try { await api("POST", "/api/auth/logout"); } catch (e) {}
    location.href = "login.html";
  });

  (async function init() {
    try {
      const me = await api("GET", "/api/auth/me");
      user = me.user;
      el("whoami").textContent = user.name + " · " + user.role;
      const start = (location.hash || "").replace("#", "") || "reports";
      go(TABS.some((t) => t.id === start) ? start : "reports");
    } catch (e) {
      location.href = "login.html";
    }
  })();
})();
