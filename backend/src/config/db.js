// src/config/db.js
// -----------------------------------------------------------------------
// Persistence layer. Uses Node's built-in `node:sqlite` (real SQL, ACID
// transactions, prepared statements — no ORM magic hiding what's happening).
//
// To move to Postgres/MySQL in production: everything in this file is the
// only place that touches the driver. Swap DatabaseSync for a pg/mysql2
// pool here and the rest of the app (which only calls db.prepare/exec/
// transaction) does not need to change, as long as the adapter below keeps
// the same shape.
// -----------------------------------------------------------------------
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'motion.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Minimal transaction helper — node:sqlite has no built-in .transaction()
// like better-sqlite3, so we wrap BEGIN/COMMIT/ROLLBACK ourselves and make
// sure a failure never leaves half-applied money movements committed.
function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'buyer', -- buyer | organizer | admin | creator
  wallet_balance_cents INTEGER NOT NULL DEFAULT 0,
  handle TEXT UNIQUE,
  phone TEXT,
  id_masked TEXT,
  avatar_data_url TEXT,
  city TEXT DEFAULT 'Nairobi',
  niches_json TEXT NOT NULL DEFAULT '[]',
  picks_json TEXT NOT NULL DEFAULT '[]',
  followers INTEGER NOT NULL DEFAULT 0,
  following INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,              -- image | video
  media_data_url TEXT,
  caption TEXT DEFAULT '',
  brand TEXT DEFAULT '',
  likes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brand_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  age_restricted INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES brand_categories(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  text_color TEXT NOT NULL DEFAULT '#fff',
  campaign TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gigs (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id),
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  scope TEXT NOT NULL,
  eligibility TEXT NOT NULL,
  budget_cents INTEGER NOT NULL,
  is_live INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gig_deliverables (
  id TEXT PRIMARY KEY,
  gig_id TEXT NOT NULL REFERENCES gigs(id),
  title TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gig_applications (
  id TEXT PRIMARY KEY,
  gig_id TEXT NOT NULL REFERENCES gigs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'awarded', -- awarded | in_production | invoiced | sent | paid
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(gig_id, user_id)
);

CREATE TABLE IF NOT EXISTS application_deliverables (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES gig_applications(id),
  title TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | done
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES gig_applications(id),
  invoice_no TEXT NOT NULL UNIQUE,
  fee_rate REAL NOT NULL DEFAULT 0.10,
  vat_rate REAL NOT NULL DEFAULT 0.16,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | sent | paid
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  due_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS marketplace_ledger (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  type TEXT NOT NULL, -- platform_fee | creator_payout
  amount_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS community_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  member_count INTEGER NOT NULL DEFAULT 0,
  gradient TEXT NOT NULL DEFAULT 'linear-gradient(140deg,#DC3A21,#F0713C)'
);

CREATE TABLE IF NOT EXISTS group_memberships (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES community_groups(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS commerce_listings (
  id TEXT PRIMARY KEY,
  seller_id TEXT REFERENCES users(id),
  seller_handle TEXT NOT NULL,
  title TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  image_data_url TEXT,
  gradient TEXT DEFAULT 'linear-gradient(140deg,#6C8FD6,#B5DF8B)',
  status TEXT NOT NULL DEFAULT 'active', -- active | sold
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS culture_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  tag TEXT NOT NULL,
  gradient TEXT DEFAULT 'linear-gradient(140deg,#0C7378,#141414)',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,             -- topup | debit | credit | payout
  amount_cents INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  reference TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  organizer_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  category TEXT,
  venue TEXT,
  city TEXT,
  event_date TEXT,
  gate_time TEXT,
  description TEXT,
  poster_data_url TEXT,           -- data: URL for demo; production -> object storage URL
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ticket_tiers (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  quantity_total INTEGER NOT NULL,
  quantity_sold INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS flights (
  id TEXT PRIMARY KEY,
  airline TEXT NOT NULL,
  flight_no TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  flight_date TEXT NOT NULL,
  departs_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  economy_fare_cents INTEGER NOT NULL,
  business_fare_cents INTEGER
);

CREATE TABLE IF NOT EXISTS flight_seats (
  id TEXT PRIMARY KEY,
  flight_id TEXT NOT NULL REFERENCES flights(id),
  row_no INTEGER NOT NULL,
  letter TEXT NOT NULL,
  cabin_class TEXT NOT NULL DEFAULT 'economy',
  status TEXT NOT NULL DEFAULT 'available' -- available | held | booked
);

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  capacity INTEGER NOT NULL,
  tags TEXT -- json array
);

CREATE TABLE IF NOT EXISTS room_bookings (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  order_id TEXT NOT NULL,
  checkin TEXT NOT NULL,
  checkout TEXT NOT NULL,
  guests INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed'
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  order_type TEXT NOT NULL,       -- ticket | flight | stay
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed | refunded
  subtotal_cents INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL DEFAULT 0,
  fees_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  ref_type TEXT NOT NULL,
  ref_id TEXT,
  description TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  line_total_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL,          -- mpesa | card | wallet
  provider_ref TEXT,
  status TEXT NOT NULL,            -- success | failed
  amount_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commission_rules (
  rule_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  applies_to TEXT NOT NULL,        -- ticket | flight | stay
  rate_percent REAL NOT NULL DEFAULT 0,
  flat_fee_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS revenue_ledger (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  rule_key TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  doc_type TEXT NOT NULL,          -- receipt | invoice
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  meta_json TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

db.exec(SCHEMA);

module.exports = { db, transaction };
