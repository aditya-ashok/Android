/*
 * Namaste Bharat Inn — shared catalog & business logic.
 *
 * UMD module: works both in the browser (attaches to window.CATALOG)
 * and in Node (module.exports) so the backend seeder and the static
 * front-end share ONE source of truth for rooms, banquets, OTA
 * channels and revenue maths.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CATALOG = api;
})(typeof self !== "undefined" ? self : this, function () {
  // ---- Rooms: 12 total across 4 categories ------------------------------
  const ROOM_TYPES = [
    {
      type: "Deluxe Room",
      price: 3500,
      capacity: 2,
      beds: "1 Queen bed",
      size: "220 sq.ft.",
      count: 4,
      image:
        "https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=900&q=70",
      description:
        "Warm, contemporary rooms with a queen bed, work desk and city view — perfect for solo travellers and couples.",
      amenities: ["AC", "Free Wi-Fi", "32\" TV", "Tea/Coffee", "Room Service"],
    },
    {
      type: "Executive Room",
      price: 4800,
      capacity: 3,
      beds: "1 King bed",
      size: "300 sq.ft.",
      count: 4,
      image:
        "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=900&q=70",
      description:
        "Spacious executive rooms with a king bed, lounge chair and premium bath amenities for the business guest.",
      amenities: ["AC", "Free Wi-Fi", "43\" TV", "Mini Bar", "Work Desk", "Bathtub"],
    },
    {
      type: "Family Room",
      price: 6000,
      capacity: 4,
      beds: "1 King + 1 Single",
      size: "380 sq.ft.",
      count: 2,
      image:
        "https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=900&q=70",
      description:
        "Generous family rooms that sleep four comfortably, with extra seating and a dining nook.",
      amenities: ["AC", "Free Wi-Fi", "43\" TV", "Mini Fridge", "Extra Bed", "Sofa"],
    },
    {
      type: "Premium Suite",
      price: 7500,
      capacity: 3,
      beds: "1 King bed + Living area",
      size: "520 sq.ft.",
      count: 2,
      image:
        "https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=900&q=70",
      description:
        "Our finest suites — a separate living area, king bedroom and panoramic views with butler service.",
      amenities: ["AC", "Free Wi-Fi", "55\" TV", "Living Room", "Butler", "Bathtub", "Mini Bar"],
    },
  ];

  // Expand the 4 categories into 12 individual, numbered rooms.
  const ROOMS = [];
  let roomNo = 101;
  ROOM_TYPES.forEach((rt, ti) => {
    for (let i = 0; i < rt.count; i++) {
      ROOMS.push({
        id: `R${roomNo}`,
        number: String(roomNo),
        name: `${rt.type} ${roomNo}`,
        type: rt.type,
        price: rt.price,
        capacity: rt.capacity,
        beds: rt.beds,
        size: rt.size,
        image: rt.image,
        description: rt.description,
        amenities: rt.amenities,
      });
      roomNo++;
      if (i === rt.count - 1) roomNo = 100 * (ti + 2) + 1; // 101.., 201.., 301.., 401..
    }
  });

  // ---- Banquets: 2 halls ------------------------------------------------
  const BANQUETS = [
    {
      id: "BANQ-GANGA",
      name: "Ganga Grand Ballroom",
      capacity: 300,
      price: 75000,
      area: "5,000 sq.ft.",
      image:
        "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=900&q=70",
      description:
        "A pillarless grand ballroom for weddings and large receptions of up to 300 guests, with stage, dance floor and valet.",
      amenities: ["Stage", "Dance Floor", "Valet Parking", "In-house Catering", "LED Wall", "AC"],
    },
    {
      id: "BANQ-YAMUNA",
      name: "Yamuna Conference Hall",
      capacity: 150,
      price: 40000,
      area: "2,400 sq.ft.",
      image:
        "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=900&q=70",
      description:
        "A flexible hall for corporate conferences, engagements and intimate functions up to 150 guests.",
      amenities: ["Projector", "Podium", "Wi-Fi", "Catering", "AC", "Parking"],
    },
  ];

  // ---- OTA / distribution channels --------------------------------------
  // commission is the % the channel keeps; net = gross * (1 - commission).
  const CHANNELS = [
    { id: "direct", name: "Direct / Website", commission: 0, color: "#0d9488" },
    { id: "walkin", name: "Walk-in", commission: 0, color: "#64748b" },
    { id: "makemytrip", name: "MakeMyTrip", commission: 18, color: "#e11d48" },
    { id: "yatra", name: "Yatra", commission: 16, color: "#f59e0b" },
    { id: "goibibo", name: "Goibibo", commission: 18, color: "#2563eb" },
    { id: "booking", name: "Booking.com", commission: 15, color: "#4f46e5" },
  ];

  function channel(id) {
    return CHANNELS.find((c) => c.id === id) || CHANNELS[0];
  }

  // ---- Revenue maths ----------------------------------------------------
  // Given gross amount + channel, return the money split.
  function computeMoney(channelId, gross) {
    const c = channel(channelId);
    const commission = Math.round((gross * c.commission) / 100);
    return {
      gross: Math.round(gross),
      commissionPct: c.commission,
      commission,
      net: Math.round(gross - commission),
    };
  }

  function nightsBetween(checkIn, checkOut) {
    const a = new Date(checkIn + "T00:00:00");
    const b = new Date(checkOut + "T00:00:00");
    return Math.max(1, Math.round((b - a) / 86400000));
  }

  // ---- Deterministic sample-data generator ------------------------------
  // mulberry32 PRNG so the demo dataset is identical every run.
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const NAMES = [
    "Aarav Sharma", "Diya Patel", "Vivaan Nair", "Ananya Iyer", "Kabir Singh",
    "Ishaan Reddy", "Saanvi Gupta", "Aditya Rao", "Myra Das", "Arjun Menon",
    "Aditi Verma", "Rohan Kapoor", "Zara Khan", "Vihaan Joshi", "Kiara Bose",
    "Neha Agarwal", "Karan Malhotra", "Pooja Desai", "Rahul Chauhan", "Sneha Pillai",
  ];

  function fmtDate(d) {
    return d.toISOString().slice(0, 10);
  }

  // Generate ~`days` days of realistic bookings ending "today".
  function generateBookings(days, todayStr) {
    const rnd = mulberry32(20260703);
    const today = todayStr ? new Date(todayStr + "T00:00:00") : new Date();
    const bookings = [];
    let ref = 1001;
    const roomChannels = ["direct", "walkin", "makemytrip", "yatra", "goibibo", "booking"];
    // weight channels so OTAs dominate but direct is healthy
    const weighted = [
      "direct", "direct", "direct",
      "makemytrip", "makemytrip", "makemytrip",
      "yatra", "yatra",
      "goibibo", "goibibo",
      "booking",
      "walkin",
    ];

    for (let d = days - 1; d >= 0; d--) {
      const day = new Date(today);
      day.setDate(today.getDate() - d);
      // 3–9 room bookings that are "in house" this night
      const n = 3 + Math.floor(rnd() * 7);
      const used = new Set();
      for (let i = 0; i < n; i++) {
        let room = ROOMS[Math.floor(rnd() * ROOMS.length)];
        let guard = 0;
        while (used.has(room.id) && guard++ < 20) {
          room = ROOMS[Math.floor(rnd() * ROOMS.length)];
        }
        used.add(room.id);
        const nights = 1 + Math.floor(rnd() * 3);
        const ci = new Date(day);
        const co = new Date(day);
        co.setDate(day.getDate() + nights);
        const ch = weighted[Math.floor(rnd() * weighted.length)];
        // small rate variance
        const rate = Math.round(room.price * (0.92 + rnd() * 0.22));
        const gross = rate * nights;
        const money = computeMoney(ch, gross);
        bookings.push({
          ref: "NBI-" + ref++,
          kind: "room",
          itemId: room.id,
          itemName: room.name,
          roomType: room.type,
          guestName: NAMES[Math.floor(rnd() * NAMES.length)],
          guestEmail: "guest@example.com",
          guestPhone: "+91 9" + Math.floor(100000000 + rnd() * 899999999),
          checkIn: fmtDate(ci),
          checkOut: fmtDate(co),
          nights,
          guests: 1 + Math.floor(rnd() * room.capacity),
          channel: ch,
          rate,
          gross: money.gross,
          commissionPct: money.commissionPct,
          commission: money.commission,
          net: money.net,
          status: "confirmed",
          createdAt: fmtDate(day),
        });
      }
      // occasional banquet booking (~20% of days)
      if (rnd() < 0.2) {
        const b = BANQUETS[Math.floor(rnd() * BANQUETS.length)];
        const ch = rnd() < 0.7 ? "direct" : "makemytrip";
        const gross = b.price;
        const money = computeMoney(ch, gross);
        bookings.push({
          ref: "NBI-" + ref++,
          kind: "banquet",
          itemId: b.id,
          itemName: b.name,
          roomType: "Banquet",
          guestName: NAMES[Math.floor(rnd() * NAMES.length)],
          guestEmail: "events@example.com",
          guestPhone: "+91 9" + Math.floor(100000000 + rnd() * 899999999),
          checkIn: fmtDate(day),
          checkOut: fmtDate(day),
          nights: 1,
          guests: 50 + Math.floor(rnd() * b.capacity),
          channel: ch,
          rate: gross,
          gross: money.gross,
          commissionPct: money.commissionPct,
          commission: money.commission,
          net: money.net,
          status: "confirmed",
          createdAt: fmtDate(day),
        });
      }
    }
    return bookings;
  }

  const TOTAL_ROOMS = ROOMS.length; // 12

  return {
    ROOM_TYPES,
    ROOMS,
    BANQUETS,
    CHANNELS,
    TOTAL_ROOMS,
    channel,
    computeMoney,
    nightsBetween,
    generateBookings,
  };
});
