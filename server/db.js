/*
 * SQLite database layer for Namaste Bharat Inn.
 * Uses better-sqlite3 (synchronous, zero-config, file-backed).
 */
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "namaste.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id        TEXT PRIMARY KEY,
    number    TEXT,
    name      TEXT,
    type      TEXT,
    price     INTEGER,
    capacity  INTEGER,
    beds      TEXT,
    size      TEXT,
    image     TEXT,
    description TEXT,
    amenities TEXT
  );

  CREATE TABLE IF NOT EXISTS banquets (
    id        TEXT PRIMARY KEY,
    name      TEXT,
    capacity  INTEGER,
    price     INTEGER,
    area      TEXT,
    image     TEXT,
    description TEXT,
    amenities TEXT
  );

  CREATE TABLE IF NOT EXISTS channels (
    id         TEXT PRIMARY KEY,
    name       TEXT,
    commission INTEGER,
    color      TEXT
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ref           TEXT UNIQUE,
    kind          TEXT,          -- 'room' | 'banquet'
    item_id       TEXT,
    item_name     TEXT,
    room_type     TEXT,
    guest_name    TEXT,
    guest_email   TEXT,
    guest_phone   TEXT,
    check_in      TEXT,
    check_out     TEXT,
    nights        INTEGER,
    guests        INTEGER,
    channel       TEXT,
    rate          INTEGER,
    gross         INTEGER,
    commission_pct INTEGER,
    commission    INTEGER,
    net           INTEGER,
    status        TEXT DEFAULT 'confirmed',
    created_at    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_checkin ON bookings(check_in);
  CREATE INDEX IF NOT EXISTS idx_bookings_channel ON bookings(channel);
`);

module.exports = db;
