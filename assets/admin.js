/* Namaste Bharat Inn — revenue dashboard. */
(function () {
  const rupee = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
  const $ = (s) => document.querySelector(s);
  const fmt = (d) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });

  document.getElementById("year").textContent = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);
  const picker = $("#datePick");
  picker.value = today;
  picker.max = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  let trendChart, channelChart, occChart;

  const STATUS_STYLE = {
    confirmed: "bg-blue-100 text-blue-700",
    checked_in: "bg-green-100 text-green-700",
    checked_out: "bg-gray-100 text-gray-600",
    cancelled: "bg-red-100 text-red-700",
  };

  async function render(date) {
    const [day, series] = await Promise.all([
      window.NBI.dashboard(date),
      window.NBI.range(
        new Date(new Date(date + "T00:00:00").getTime() - 13 * 86400000).toISOString().slice(0, 10),
        date
      ),
    ]);

    $("#subTitle").textContent = "Business date · " + fmt(date);
    $("#chDate").textContent = fmt(date);
    $("#bkDate").textContent = fmt(date);

    // KPIs
    $("#kpiGross").textContent = rupee(day.grossRevenue);
    $("#kpiNet").textContent = rupee(day.netRevenue);
    $("#kpiComm").textContent = rupee(day.commission);
    $("#kpiOcc").textContent = day.occupancy + "%";
    $("#kpiRoomsSold").textContent = day.roomsSold;
    $("#kpiAdr").textContent = rupee(day.adr);
    $("#kpiRevpar").textContent = rupee(day.revpar);
    $("#kpiRoomRev").textContent = rupee(day.roomRevenue);
    $("#kpiBanqRev").textContent = rupee(day.banquetRevenue);
    $("#kpiBanqEvents").textContent = day.banquetEvents;

    // Channel table (only channels with activity, sorted by gross)
    const active = day.channels.filter((c) => c.bookings > 0).sort((a, b) => b.gross - a.gross);
    $("#channelTable").innerHTML =
      active.length
        ? active
            .map(
              (c) => `<tr class="border-b border-black/5">
          <td class="py-2"><span class="badge-dot mr-2" style="background:${c.color}"></span>${c.name}<span class="text-black/40 text-xs"> · ${c.commission}%</span></td>
          <td>${c.bookings}</td><td>${rupee(c.gross)}</td>
          <td class="text-saffron">${rupee(c.gross - c.net)}</td>
          <td class="text-leaf font-600">${rupee(c.net)}</td></tr>`
            )
            .join("")
        : `<tr><td colspan="5" class="py-4 text-center text-black/40">No bookings for this date.</td></tr>`;

    // Bookings table
    $("#bookingTable").innerHTML =
      day.bookings.length
        ? day.bookings
            .map((b) => {
              const ch = window.CATALOG.channel(b.channel);
              return `<tr class="border-b border-black/5">
            <td class="py-2 font-mono text-xs">${b.ref}</td>
            <td>${b.guestName}</td>
            <td>${b.itemName}<span class="text-black/40 text-xs"> · ${b.roomType}</span></td>
            <td><span class="badge-dot mr-1.5" style="background:${ch.color}"></span>${ch.name}</td>
            <td>${b.kind === "banquet" ? "—" : b.nights}</td>
            <td>${rupee(b.gross)}</td>
            <td class="text-leaf">${rupee(b.net)}</td>
            <td><span class="text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[b.status] || ""}">${b.status.replace("_", " ")}</span></td>
          </tr>`;
            })
            .join("")
        : `<tr><td colspan="8" class="py-4 text-center text-black/40">No stays or events on this date.</td></tr>`;

    drawTrend(series);
    drawChannels(active);
    drawOcc(series);
  }

  const labels = (s) =>
    s.map((d) => new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }));

  function drawTrend(series) {
    const ctx = $("#trendChart");
    const data = {
      labels: labels(series),
      datasets: [
        { label: "Gross", data: series.map((d) => d.grossRevenue), borderColor: "#ff7a18", backgroundColor: "rgba(255,122,24,.12)", fill: true, tension: 0.35, borderWidth: 2 },
        { label: "Net", data: series.map((d) => d.netRevenue), borderColor: "#0f8a5f", backgroundColor: "rgba(15,138,95,.10)", fill: true, tension: 0.35, borderWidth: 2 },
      ],
    };
    const opts = {
      responsive: true,
      plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (c) => c.dataset.label + ": " + rupee(c.raw) } } },
      scales: { y: { ticks: { callback: (v) => "₹" + v / 1000 + "k" } } },
    };
    if (trendChart) { trendChart.data = data; trendChart.update(); }
    else trendChart = new Chart(ctx, { type: "line", data, options: opts });
  }

  function drawChannels(active) {
    const ctx = $("#channelChart");
    const data = {
      labels: active.map((c) => c.name),
      datasets: [{ data: active.map((c) => c.gross), backgroundColor: active.map((c) => c.color), borderWidth: 0 }],
    };
    const opts = {
      responsive: true,
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: (c) => c.label + ": " + rupee(c.raw) } },
      },
      cutout: "58%",
    };
    if (channelChart) { channelChart.data = data; channelChart.update(); }
    else channelChart = new Chart(ctx, { type: "doughnut", data, options: opts });
  }

  function drawOcc(series) {
    const ctx = $("#occChart");
    const data = {
      labels: labels(series),
      datasets: [{ label: "Occupancy %", data: series.map((d) => d.occupancy), backgroundColor: "#c8912f", borderRadius: 4 }],
    };
    const opts = {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.raw + "% occupied" } } },
      scales: { y: { max: 100, ticks: { callback: (v) => v + "%" } } },
    };
    if (occChart) { occChart.data = data; occChart.update(); }
    else occChart = new Chart(ctx, { type: "bar", data, options: opts });
  }

  picker.addEventListener("change", () => render(picker.value));

  window.NBI.ready.then(() => {
    $("#modeBadge").textContent =
      window.NBI.mode() === "api" ? "● Live backend connected" : "● Demo mode (local data)";
    render(picker.value);
  });
})();
