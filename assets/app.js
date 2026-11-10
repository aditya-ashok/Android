/* Namaste Bharat Inn — public site behaviour. */
(function () {
  const C = window.CATALOG;
  const rupee = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  let currentGross = 0;   // payable amount for the active quote
  let currentDesc = "";   // human label for the payment
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
        currentDesc = `${rt.type} · ${nights} night${nights > 1 ? "s" : ""}`;
      }
    } else {
      const b = C.BANQUETS.find((x) => x.id === d.get("banquetId"));
      if (b) { gross = b.price; label = "1 day event"; currentDesc = b.name + " · event booking"; }
    }
    currentGross = gross;
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

  // ---- simulated Razorpay modal (Test Mode, when no live keys) ----
  function simulateRazorpay(amount, prefill, orderId) {
    return new Promise((resolve, reject) => {
      const ov = document.createElement("div");
      ov.className = "fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4";
      ov.innerHTML = `
        <div class="bg-white text-ink rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
          <div class="bg-[#072654] text-white px-5 py-4 flex items-center justify-between">
            <span class="font-700 text-lg">Razorpay</span>
            <span class="text-[11px] bg-amber-400 text-ink px-2 py-0.5 rounded-full font-600">TEST MODE</span>
          </div>
          <div class="p-5 space-y-3">
            <div class="text-sm text-black/60">Paying <b>Namaste Bharat Inn</b></div>
            <div class="font-display text-3xl font-700">${rupee(amount)}</div>
            <div class="text-xs text-black/50">${currentDesc || ""}</div>
            <div class="text-xs bg-cream border border-black/10 rounded-lg p-2.5 text-black/60">
              Order <span class="font-mono">${orderId}</span><br>
              No real card is charged. Add live Razorpay keys on the server to take real payments.
            </div>
            <div class="flex gap-2 pt-1">
              <button data-cancel class="flex-1 rounded-lg border border-black/15 px-4 py-2.5 font-600 hover:bg-black/5">Cancel</button>
              <button data-pay class="flex-1 rounded-lg bg-[#3395ff] text-white px-4 py-2.5 font-600 hover:brightness-110">Pay ${rupee(amount)}</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(ov);
      const close = () => ov.remove();
      ov.querySelector("[data-pay]").addEventListener("click", () => { close(); resolve(); });
      ov.querySelector("[data-cancel]").addEventListener("click", () => { close(); reject(new Error("Payment cancelled")); });
      ov.addEventListener("click", (ev) => { if (ev.target === ov) { close(); reject(new Error("Payment cancelled")); } });
    });
  }

  // ---- run the payment, resolve with {paymentId, method} ----
  async function payForBooking(amount, prefill) {
    const cfg = await window.NBI.paymentConfig();
    const order = await window.NBI.createOrder(amount);
    if (cfg.enabled && !order.simulated && window.Razorpay) {
      return new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: cfg.keyId,
          order_id: order.id,
          amount: order.amount,
          currency: order.currency || "INR",
          name: "Namaste Bharat Inn",
          description: currentDesc || "Booking",
          prefill: { name: prefill.name, email: prefill.email, contact: prefill.contact },
          theme: { color: "#ff7a18" },
          handler: async (resp) => {
            try {
              const v = await window.NBI.verifyPayment(resp);
              resolve({ paymentId: v.paymentId, method: "Razorpay" });
            } catch (e) { reject(e); }
          },
          modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
        });
        rzp.on("payment.failed", (r) =>
          reject(new Error((r.error && r.error.description) || "Payment failed"))
        );
        rzp.open();
      });
    }
    // Test Mode (no live keys)
    await simulateRazorpay(amount, prefill, order.id);
    const v = await window.NBI.verifyPayment({ razorpay_order_id: order.id });
    return { paymentId: v.paymentId, method: "Razorpay (Test Mode)" };
  }

  // ---- submit booking (pay first, then confirm) ----
  const payBtn = $("#payBtn");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    updateQuote();
    const msg = $("#bookMsg");
    if (!currentGross) {
      msg.textContent = "⚠️ Please choose dates / a hall to see the amount first.";
      msg.className = "text-center mt-4 text-sm text-red-300";
      return;
    }
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
    const prefill = { name: d.guestName, email: d.guestEmail, contact: d.guestPhone };

    payBtn.disabled = true;
    payBtn.classList.add("opacity-60");
    msg.textContent = "Opening secure payment…";
    msg.className = "text-center mt-4 text-sm text-white/70";
    try {
      const pay = await payForBooking(currentGross, prefill);
      payload.paymentStatus = "paid";
      payload.paymentMethod = pay.method;
      payload.paymentId = pay.paymentId;
      const b = await window.NBI.createBooking(payload);
      msg.innerHTML =
        `✅ Payment successful — booking confirmed!<br>` +
        `Ref <b>${b.ref}</b> · ${b.itemName} · <b>${rupee(b.gross)}</b> paid<br>` +
        `<span class="text-white/60">Payment ID ${pay.paymentId} · ${pay.method}</span>`;
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
    } finally {
      payBtn.disabled = false;
      payBtn.classList.remove("opacity-60");
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
