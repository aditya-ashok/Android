/*
 * Database layer — PostgreSQL (Neon in production, PGlite locally).
 *
 * Production / Vercel: set DATABASE_URL to your Neon connection string.
 *   → uses @neondatabase/serverless (HTTP, serverless-friendly).
 * Local dev (no DATABASE_URL): an in-process PGlite file database, so you
 *   can run everything offline. Both speak the SAME PostgreSQL SQL.
 *
 * NOTE: DATABASE_URL is a secret — never commit it. Set it as an env var
 * locally and in Vercel → Settings → Environment Variables.
 */
const path = require("path");
const fs = require("fs");
const CATALOG = require("../assets/catalog");
const { hashPassword } = require("./auth");

const USE_NEON = Boolean(process.env.DATABASE_URL);

// ---- driver: unified { query(text,args) -> {rows}, tx([{text,args}]) } ----
let driver;
if (USE_NEON) {
  const { neon } = require("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL, { fullResults: true });
  driver = {
    query: (text, args) => sql.query(text, args),
    tx: (items) => sql.transaction(items.map((i) => sql.query(i.text, i.args))),
  };
} else {
  const { PGlite } = require("@electric-sql/pglite");
  const dir = path.join(__dirname, "..", "data", "pg");
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  const pg = new PGlite(dir);
  driver = {
    query: (text, args) => pg.query(text, args),
    tx: async (items) => {
      await pg.query("BEGIN");
      try {
        const out = [];
        for (const i of items) out.push(await pg.query(i.text, i.args));
        await pg.query("COMMIT");
        return out;
      } catch (e) {
        await pg.query("ROLLBACK");
        throw e;
      }
    },
  };
}

// Translate libsql-style `?` placeholders to Postgres `$1, $2, ...`.
function conv(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => "$" + ++i);
}
function norm(stmt, maybeArgs) {
  if (typeof stmt === "string") return { text: conv(stmt), args: maybeArgs || [] };
  return { text: conv(stmt.sql), args: stmt.args || [] };
}

// Keeps the same tiny interface the rest of the app already uses.
const db = {
  async execute(stmt, maybeArgs) {
    const { text, args } = norm(stmt, maybeArgs);
    const res = await driver.query(text, args);
    return { rows: res.rows || [], rowsAffected: res.rowCount || 0 };
  },
  async batch(stmts /*, mode */) {
    if (!stmts.length) return;
    await driver.tx(stmts.map((s) => norm(s)));
  },
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id SERIAL PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT,
     role TEXT, name TEXT, created_at TEXT
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
     id SERIAL PRIMARY KEY, ref TEXT UNIQUE, kind TEXT, item_id TEXT,
     item_name TEXT, room_type TEXT, guest_name TEXT, guest_email TEXT, guest_phone TEXT,
     check_in TEXT, check_out TEXT, nights INTEGER, guests INTEGER,
     channel TEXT, rate INTEGER, gross INTEGER, commission_pct INTEGER,
     commission INTEGER, net INTEGER, status TEXT DEFAULT 'confirmed',
     payment_status TEXT DEFAULT 'unpaid', payment_method TEXT, payment_id TEXT,
     created_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_checkin ON bookings(check_in)`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_channel ON bookings(channel)`,
];

async function count(table) {
  return Number((await db.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
}

// Insert catalog + the two default accounts if empty (so a fresh Neon DB
// can log in and show rooms right after deploy). Sample bookings come from
// `npm run seed`.
async function ensureSeeded() {
  if ((await count("users")) === 0) {
    const owner = process.env.OWNER_PASSWORD || "owner123";
    const manager = process.env.MANAGER_PASSWORD || "manager123";
    const now = new Date().toISOString();
    await db.batch([
      { sql: "INSERT INTO users (username,password_hash,role,name,created_at) VALUES (?,?,?,?,?)", args: ["owner", hashPassword(owner), "owner", "Hotel Owner", now] },
      { sql: "INSERT INTO users (username,password_hash,role,name,created_at) VALUES (?,?,?,?,?)", args: ["manager", hashPassword(manager), "manager", "Front Desk Manager", now] },
    ]);
  }
  if ((await count("rooms")) === 0) {
    const stmts = [];
    CATALOG.ROOMS.forEach((r) =>
      stmts.push({ sql: `INSERT INTO rooms (id,number,name,type,price,capacity,beds,size,image,description,amenities,status) VALUES (?,?,?,?,?,?,?,?,?,?,?, 'clean')`,
        args: [r.id, r.number, r.name, r.type, r.price, r.capacity, r.beds, r.size, r.image, r.description, JSON.stringify(r.amenities)] })
    );
    CATALOG.BANQUETS.forEach((b) =>
      stmts.push({ sql: `INSERT INTO banquets (id,name,capacity,price,area,image,description,amenities) VALUES (?,?,?,?,?,?,?,?)`,
        args: [b.id, b.name, b.capacity, b.price, b.area, b.image, b.description, JSON.stringify(b.amenities)] })
    );
    CATALOG.CHANNELS.forEach((c) =>
      stmts.push({ sql: "INSERT INTO channels (id,name,commission,color) VALUES (?,?,?,?)", args: [c.id, c.name, c.commission, c.color] })
    );
    await db.batch(stmts);
  }
}

let readyPromise = null;
function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      for (const stmt of SCHEMA) await db.execute(stmt);
      // migrations (Postgres supports ADD COLUMN IF NOT EXISTS)
      await db.execute("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'");
      await db.execute("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_method TEXT");
      await db.execute("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_id TEXT");
      await db.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'clean'");
      await ensureSeeded();
    })().catch((e) => { readyPromise = null; throw e; });
  }
  return readyPromise;
}

module.exports = { db, ensureReady, USE_NEON };
