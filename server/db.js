/*
 * Database layer — libSQL / Turso (SQLite-compatible, serverless-ready).
 *
 * Local dev:  file:data/namaste.db   (no env needed)
 * Production: set TURSO_DATABASE_URL (libsql://...) + TURSO_AUTH_TOKEN
 *
 * The same client and SQL run in both places, so nothing changes between
 * your laptop and Vercel except two environment variables.
 */
const path = require("path");
const fs = require("fs");
const { createClient } = require("@libsql/client");
const CATALOG = require("../assets/catalog");
const { hashPassword } = require("./auth");

const url =
  process.env.TURSO_DATABASE_URL ||
  "file:" + path.join(__dirname, "..", "data", "namaste.db");
const authToken = process.env.TURSO_AUTH_TOKEN;

if (url.startsWith("file:")) {
  try {
    fs.mkdirSync(path.dirname(url.slice(5)), { recursive: true });
  } catch (e) {}
}

const db = createClient(authToken ? { url, authToken } : { url });

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     username TEXT UNIQUE,
     password_hash TEXT,
     role TEXT,              -- 'owner' | 'manager'
     name TEXT,
     created_at TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS rooms (
     id TEXT PRIMARY KEY, number TEXT, name TEXT, type TEXT, price INTEGER,
     capacity INTEGER, beds TEXT, size TEXT, image TEXT, description TEXT,
     amenities TEXT, status TEXT DEFAULT 'clean'
   )`,
  `CREATE TABLE IF NOT EXISTS banquets (
     id TEXT PRIMARY KEY, name TEXT, capacity INTEGER, price INTEGER, area TEXT,
     image TEXT, description TEXT, amenities TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS channels (
     id TEXT PRIMARY KEY, name TEXT, commission INTEGER, color TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS bookings (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ref TEXT UNIQUE, kind TEXT, item_id TEXT, item_name TEXT, room_type TEXT,
     guest_name TEXT, guest_email TEXT, guest_phone TEXT,
     check_in TEXT, check_out TEXT, nights INTEGER, guests INTEGER,
     channel TEXT, rate INTEGER, gross INTEGER, commission_pct INTEGER,
     commission INTEGER, net INTEGER, status TEXT DEFAULT 'confirmed',
     payment_status TEXT DEFAULT 'unpaid', payment_method TEXT, payment_id TEXT,
     created_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_checkin ON bookings(check_in)`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_channel ON bookings(channel)`,
];

async function ensureColumn(table, col, def) {
  const r = await db.execute(`PRAGMA table_info(${table})`);
  if (!r.rows.some((row) => row.name === col)) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
}

// Insert catalog + the two default accounts if the DB is empty, so a fresh
// Turso database can log in and show rooms immediately after deploy.
// (Sample bookings are NOT auto-created — run `npm run seed` for those.)
async function ensureSeeded() {
  const haveUsers = (await db.execute("SELECT COUNT(*) AS n FROM users")).rows[0].n;
  if (Number(haveUsers) === 0) {
    const owner = process.env.OWNER_PASSWORD || "owner123";
    const manager = process.env.MANAGER_PASSWORD || "manager123";
    const now = new Date().toISOString();
    await db.batch(
      [
        {
          sql: "INSERT INTO users (username,password_hash,role,name,created_at) VALUES (?,?,?,?,?)",
          args: ["owner", hashPassword(owner), "owner", "Hotel Owner", now],
        },
        {
          sql: "INSERT INTO users (username,password_hash,role,name,created_at) VALUES (?,?,?,?,?)",
          args: ["manager", hashPassword(manager), "manager", "Front Desk Manager", now],
        },
      ],
      "write"
    );
  }

  const haveRooms = (await db.execute("SELECT COUNT(*) AS n FROM rooms")).rows[0].n;
  if (Number(haveRooms) === 0) {
    const stmts = [];
    CATALOG.ROOMS.forEach((r) =>
      stmts.push({
        sql: `INSERT INTO rooms (id,number,name,type,price,capacity,beds,size,image,description,amenities,status)
              VALUES (?,?,?,?,?,?,?,?,?,?,?, 'clean')`,
        args: [r.id, r.number, r.name, r.type, r.price, r.capacity, r.beds, r.size, r.image, r.description, JSON.stringify(r.amenities)],
      })
    );
    CATALOG.BANQUETS.forEach((b) =>
      stmts.push({
        sql: `INSERT INTO banquets (id,name,capacity,price,area,image,description,amenities)
              VALUES (?,?,?,?,?,?,?,?)`,
        args: [b.id, b.name, b.capacity, b.price, b.area, b.image, b.description, JSON.stringify(b.amenities)],
      })
    );
    CATALOG.CHANNELS.forEach((c) =>
      stmts.push({
        sql: "INSERT INTO channels (id,name,commission,color) VALUES (?,?,?,?)",
        args: [c.id, c.name, c.commission, c.color],
      })
    );
    await db.batch(stmts, "write");
  }
}

let readyPromise = null;
function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      for (const stmt of SCHEMA) await db.execute(stmt);
      // migrations for pre-existing databases
      await ensureColumn("bookings", "payment_status", "TEXT DEFAULT 'unpaid'");
      await ensureColumn("bookings", "payment_method", "TEXT");
      await ensureColumn("bookings", "payment_id", "TEXT");
      await ensureColumn("rooms", "status", "TEXT DEFAULT 'clean'");
      await ensureSeeded();
    })().catch((e) => {
      readyPromise = null; // allow retry on next request
      throw e;
    });
  }
  return readyPromise;
}

module.exports = { db, ensureReady };
