/*
 * Full seed — wipes and reloads rooms, banquets, channels, the two default
 * user accounts, and 45 days of realistic sample bookings.
 *
 *   npm run seed                          # local file DB
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run seed   # Turso
 */
const { db, ensureReady } = require("./db");
const { hashPassword } = require("./auth");
const CATALOG = require("../assets/catalog");

async function seed() {
  await ensureReady();

  await db.batch(
    ["DELETE FROM bookings", "DELETE FROM rooms", "DELETE FROM banquets", "DELETE FROM channels", "DELETE FROM users"],
    "write"
  );

  const now = new Date().toISOString();
  const ownerPw = process.env.OWNER_PASSWORD || "owner123";
  const managerPw = process.env.MANAGER_PASSWORD || "manager123";

  const stmts = [
    { sql: "INSERT INTO users (username,password_hash,role,name,created_at) VALUES (?,?,?,?,?)", args: ["owner", hashPassword(ownerPw), "owner", "Hotel Owner", now] },
    { sql: "INSERT INTO users (username,password_hash,role,name,created_at) VALUES (?,?,?,?,?)", args: ["manager", hashPassword(managerPw), "manager", "Front Desk Manager", now] },
  ];

  CATALOG.ROOMS.forEach((r) =>
    stmts.push({
      sql: `INSERT INTO rooms (id,number,name,type,price,capacity,beds,size,image,description,amenities,status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?, 'clean')`,
      args: [r.id, r.number, r.name, r.type, r.price, r.capacity, r.beds, r.size, r.image, r.description, JSON.stringify(r.amenities)],
    })
  );
  CATALOG.BANQUETS.forEach((b) =>
    stmts.push({
      sql: `INSERT INTO banquets (id,name,capacity,price,area,image,description,amenities) VALUES (?,?,?,?,?,?,?,?)`,
      args: [b.id, b.name, b.capacity, b.price, b.area, b.image, b.description, JSON.stringify(b.amenities)],
    })
  );
  CATALOG.CHANNELS.forEach((c) =>
    stmts.push({ sql: "INSERT INTO channels (id,name,commission,color) VALUES (?,?,?,?)", args: [c.id, c.name, c.commission, c.color] })
  );

  const today = new Date().toISOString().slice(0, 10);
  CATALOG.generateBookings(45, today).forEach((bk) =>
    stmts.push({
      sql: `INSERT INTO bookings
        (ref,kind,item_id,item_name,room_type,guest_name,guest_email,guest_phone,
         check_in,check_out,nights,guests,channel,rate,gross,commission_pct,commission,net,status,
         payment_status,payment_method,payment_id,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        bk.ref, bk.kind, bk.itemId, bk.itemName, bk.roomType, bk.guestName, bk.guestEmail, bk.guestPhone,
        bk.checkIn, bk.checkOut, bk.nights, bk.guests, bk.channel, bk.rate, bk.gross, bk.commissionPct, bk.commission, bk.net, bk.status,
        bk.paymentStatus, bk.paymentMethod, bk.paymentId, bk.createdAt,
      ],
    })
  );

  // batch in chunks to stay well within limits
  for (let i = 0; i < stmts.length; i += 100) {
    await db.batch(stmts.slice(i, i + 100), "write");
  }

  const counts = {
    users: Number((await db.execute("SELECT COUNT(*) n FROM users")).rows[0].n),
    rooms: Number((await db.execute("SELECT COUNT(*) n FROM rooms")).rows[0].n),
    banquets: Number((await db.execute("SELECT COUNT(*) n FROM banquets")).rows[0].n),
    channels: Number((await db.execute("SELECT COUNT(*) n FROM channels")).rows[0].n),
    bookings: Number((await db.execute("SELECT COUNT(*) n FROM bookings")).rows[0].n),
  };
  console.log("Seeded Namaste Bharat Inn:", counts);
  console.log("Logins → owner /", ownerPw, "  ·  manager /", managerPw);
}

seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
