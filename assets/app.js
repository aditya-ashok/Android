/* Namaste Bharat Inn — public site behaviour. */
(function () {
  const C = window.CATALOG;
  const rupee = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  document.getElementById("year").textContent = new Date().getFullYear();

  // ---- reveal-on-scroll ----
  const io = new IntersectionObserver(
    (es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
    { threshold: 0.15 }
  );
  $$(".reveal").forEach((el) => io.observe(el));

  // ---- render rooms ----
  const roomsGrid = $("#roomsGrid");
  C.ROOM_TYPES.forEach((rt) => {
    roomsGrid.insertAdjacentHTML(
      "beforeend",
      `<article class="reveal bg-white rounded-2xl overflow-hidden shadow-soft card-hover flex flex-col">
        <div class="relative h-44">
          <img src="${rt.image}" alt="${rt.type}" class="w-full h-full object-cover" />
          <span class="absolute top-3 left-3 bg-white/90 text-xs font-600 px-2.5 py-1 rounded-full">${rt.count} available</span>
        </div>
        <div class="p-5 flex flex-col flex-1">
          <h3 class="font-display text-lg font-700">${rt.type}</h3>
          <p class="text-sm text-black/55 mt-1 flex-1">${rt.description}</p>
          <div class="flex flex-wrap gap-1.5 my-3">
            ${rt.amenities.slice(0, 4).map((a) => `<span class="text-[11px] bg-cream border border-black/5 px-2 py-0.5 rounded-full">${a}</span>`).join("")}
          </div>
          <div class="flex items-center justify-between border-t border-black/5 pt-3">
            <div><span class="font-display text-xl font-700 text-saffron">${rupee(rt.price)}</span><span class="text-xs text-black/50"> / night</span></div>
            <button data-book-room="${rt.type}" class="rounded-full bg-ink text-white text-sm font-600 px-4 py-2 hover:bg-saffron transition">Book</button>
          </div>
        </div>
      </article>`
    );
  });
  $$(".reveal", roomsGrid).forEach((el) => io.observe(el));

  // ---- render banquets ----
  const banqGrid = $("#banquetsGrid");
  C.BANQUETS.forEach((b) => {
    banqGrid.insertAdjacentHTML(
      "beforeend",
      `<article class="bg-white rounded-2xl overflow-hidden shadow-soft card-hover flex flex-col md:flex-row">
        <img src="${b.image}" alt="${b.name}" class="md:w-2/5 h-48 md:h-auto object-cover" />
        <div class="p-5 flex flex-col flex-1">
          <h3 class="font-display text-xl font-700">${b.name}</h3>
          <p class="text-sm text-black/55 mt-1 flex-1">${b.description}</p>
          <div class="flex flex-wrap gap-1.5 my-3">
            ${b.amenities.slice(0, 4).map((a) => `<span class="text-[11px] bg-cream border border-black/5 px-2 py-0.5 rounded-full">${a}</span>`).join("")}
          </div>
          <div class="flex items-center justify-between border-t border-black/5 pt-3">
            <div class="text-sm text-black/60">Up to <b>${b.capacity}</b> guests · ${b.area}</div>
            <div class="text-right"><span class="font-display text-lg font-700 text-saffron">${rupee(b.price)}</span><span class="text-xs text-black/50"> / day</span></div>
          </div>
          <button data-book-banquet="${b.id}" class="mt-3 rounded-full bg-ink text-white text-sm font-600 px-4 py-2 hover:bg-saffron transition">Enquire / Book</button>
        </div>
      </article>`
    );
  });

  // ---- partner strip ----
  const strip = $("#partnerStrip");
  C.CHANNELS.filter((c) => c.commission > 0).forEach((c) => {
    strip.insertAdjacentHTML(
      "beforeend",
      `<span class="px-5 py-3 rounded-xl bg-white shadow-soft font-700 font-display text-lg" style="color:${c.color}">${c.name}</span>`
    );
  });

  // ---- populate selects ----
  function fillRoomTypeSelect(sel) {
    sel.innerHTML = C.ROOM_TYPES.map(
      (r) => `<option value="${r.type}">${r.type} — ${rupee(r.price)}/night</option>`
    ).join("");
  }
  function fillBanquetSelect(sel) {
    sel.innerHTML = C.BANQUETS.map(
      (b) => `<option value="${b.id}">${b.name} — ${rupee(b.price)}/day</option>`
    ).join("");
  }
  function fillChannelSelect(sel) {
    sel.innerHTML = C.CHANNELS.map(
      (c) => `<option value="${c.id}">${c.name}${c.commission ? ` (${c.commission}% commission)` : " — best rate"}</option>`
    ).join("");
  }
  fillRoomTypeSelect($('#quickBook select[name="roomType"]'));
  const form = $("#bookingForm");
  fillRoomTypeSelect($('select[name="roomType"]', form));
  fillBanquetSelect($('select[name="banquetId"]', form));
  fillChannelSelect($('select[name="channel"]', form));

  // default dates: today + tomorrow
  const todayStr = new Date().toISOString().slice(0, 10);
  const tmr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  $$('input[type="date"]').forEach((i) => {
    if (i.name === "checkIn") i.value = todayStr;
    if (i.name === "checkOut") i.value = tmr;
    i.min = todayStr;
  });

  // ---- quick-book → scroll to form & prefill ----
  $("#quickBook").addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    $('select[name="roomType"]', form).value = d.get("roomType");
    $('input[name="checkIn"]', form).value = d.get("checkIn");
    $('input[name="checkOut"]', form).value = d.get("checkOut");
    $('input[name="guests"]', form).value = d.get("guests");
    document.getElementById("book").scrollIntoView({ behavior: "smooth" });
    updateQuote();
  });

  // ---- "Book" buttons on cards ----
  document.addEventListener("click", (e) => {
    const rt = e.target.closest("[data-book-room]");
    const bq = e.target.closest("[data-book-banquet]");
    if (rt) {
      $('select[name="kind"]', form).value = "room";
      toggleKind();
      $('select[name="roomType"]', form).value = rt.dataset.bookRoom;
      document.getElementById("book").scrollIntoView({ behavior: "smooth" });
      updateQuote();
    }
    if (bq) {
      $('select[name="kind"]', form).value = "banquet";
      toggleKind();
      $('select[name="banquetId"]', form).value = bq.dataset.bookBanquet;
      document.getElementById("book").scrollIntoView({ behavior: "smooth" });
      updateQuote();
    }
  });

  // ---- kind toggle (room vs banquet) ----
  function toggleKind() {
    const kind = $('select[name="kind"]', form).value;
    $$("[data-room]", form).forEach((el) => (el.style.display = kind === "room" ? "" : "none"));
    $$("[data-banquet]", form).forEach((el) => (el.style.display = kind === "banquet" ? "" : "none"));
  }
  $('select[name="kind"]', form).addEventListener("change", () => { toggleKind(); updateQuote(); });

  // ---- live quote ----
  function updateQuote() {
    const d = new FormData(form);
    const kind = d.get("kind");
    const channel = d.get("channel");
    let gross = 0, label = "";
    if (kind === "room") {
      const rt = C.ROOM_TYPES.find((r) => r.type === d.get("roomType"));
      const ci = d.get("checkIn"), co = d.get("checkOut");
      if (rt && ci && co) {
        const nights = C.nightsBetween(ci, co);
        gross = rt.price * nights;
        label = `${nights} night${nights > 1 ? "s" : ""} × ${rupee(rt.price)}`;
      }
    } else {
      const b = C.BANQUETS.find((x) => x.id === d.get("banquetId"));
      if (b) { gross = b.price; label = "1 day event"; }
    }
    const m = C.computeMoney(channel, gross);
    const note = m.commission
      ? ` · OTA keeps ${rupee(m.commission)} (${m.commissionPct}%), you net ${rupee(m.net)}`
      : " · 0% commission — you keep it all";
    $("#quote").innerHTML = gross
      ? `<b class="text-white">${rupee(gross)}</b> <span class="text-white/60">(${label})</span><span class="text-white/50">${note}</span>`
      : "Select dates to see your total.";
  }
  form.addEventListener("input", updateQuote);
  toggleKind();
  updateQuote();

  // ---- submit booking ----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form).entries());
    const payload = {
      kind: d.kind,
      roomType: d.roomType,
      itemId: d.kind === "banquet" ? d.banquetId : undefined,
      checkIn: d.checkIn,
      checkOut: d.checkOut,
      guests: Number(d.guests),
      channel: d.channel,
      guestName: d.guestName,
      guestEmail: d.guestEmail,
      guestPhone: d.guestPhone,
    };
    const msg = $("#bookMsg");
    msg.textContent = "Processing…";
    msg.className = "text-center mt-4 text-sm text-white/70";
    try {
      const b = await window.NBI.createBooking(payload);
      msg.innerHTML = `✅ Confirmed! Reference <b>${b.ref}</b> — ${b.itemName}, ${rupee(b.gross)} total. A confirmation will be sent to you.`;
      msg.className = "text-center mt-4 text-sm text-green-400";
      form.reset();
      fillChannelSelect($('select[name="channel"]', form));
      $$('input[type="date"]').forEach((i) => {
        if (i.name === "checkIn") i.value = todayStr;
        if (i.name === "checkOut") i.value = tmr;
      });
      toggleKind();
      updateQuote();
    } catch (err) {
      msg.textContent = "⚠️ " + err.message;
      msg.className = "text-center mt-4 text-sm text-red-300";
    }
  });

  // ---- mode badge ----
  window.NBI.ready.then(() => {
    const badge = $("#modeBadge");
    badge.textContent =
      window.NBI.mode() === "api"
        ? "● Live backend connected"
        : "● Demo mode (local data)";
  });
})();
