/*
 * Seed the database with the 12 rooms, 2 banquets, OTA channels and a
 * realistic 45-day sample booking history. Idempotent: wipes & reloads.
 *
 *   npm run seed
 */
const db = require("./db");
const CATALOG = require("../assets/catalog");

function seed() {
  const wipe = db.transaction(() => {
    db.prepare("DELETE FROM rooms").run();
    db.prepare("DELETE FROM banquets").run();
    db.prepare("DELETE FROM channels").run();
    db.prepare("DELETE FROM bookings").run();
  });
  wipe();

  const insRoom = db.prepare(`INSERT INTO rooms
    (id, number, name, type, price, capacity, beds, size, image, description, amenities)
    VALUES (@id,@number,@name,@type,@price,@capacity,@beds,@size,@image,@description,@amenities)`);
  const insBanq = db.prepare(`INSERT INTO banquets
    (id, name, capacity, price, area, image, description, amenities)
    VALUES (@id,@name,@capacity,@price,@area,@image,@description,@amenities)`);
  const insChan = db.prepare(`INSERT INTO channels (id,name,commission,color)
    VALUES (@id,@name,@commission,@color)`);
  const insBook = db.prepare(`INSERT INTO bookings
    (ref,kind,item_id,item_name,room_type,guest_name,guest_email,guest_phone,
     check_in,check_out,nights,guests,channel,rate,gross,commission_pct,commission,net,status,created_at)
    VALUES (@ref,@kind,@itemId,@itemName,@roomType,@guestName,@guestEmail,@guestPhone,
     @checkIn,@checkOut,@nights,@guests,@channel,@rate,@gross,@commissionPct,@commission,@net,@status,@createdAt)`);

  const load = db.transaction(() => {
    CATALOG.ROOMS.forEach((r) =>
      insRoom.run({ ...r, amenities: JSON.stringify(r.amenities) })
    );
    CATALOG.BANQUETS.forEach((b) =>
      insBanq.run({ ...b, amenities: JSON.stringify(b.amenities) })
    );
    CATALOG.CHANNELS.forEach((c) => insChan.run(c));

    const today = new Date().toISOString().slice(0, 10);
    CATALOG.generateBookings(45, today).forEach((bk) => insBook.run(bk));
  });
  load();

  const counts = {
    rooms: db.prepare("SELECT COUNT(*) n FROM rooms").get().n,
    banquets: db.prepare("SELECT COUNT(*) n FROM banquets").get().n,
    channels: db.prepare("SELECT COUNT(*) n FROM channels").get().n,
    bookings: db.prepare("SELECT COUNT(*) n FROM bookings").get().n,
  };
  console.log("Seeded Namaste Bharat Inn:", counts);
}

seed();
