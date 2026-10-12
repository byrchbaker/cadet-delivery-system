import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type DB = Database.Database;

let instance: DB | null = null;

export function db(): DB {
  if (!instance) throw new Error('Database not initialised');
  return instance;
}

export function initDb(file: string): DB {
  if (instance) instance.close();
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new Database(file);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  conn.pragma('busy_timeout = 5000');
  migrate(conn);
  instance = conn;
  return conn;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}

/** Run a function inside a transaction. */
export function tx<T>(fn: () => T): T {
  return db().transaction(fn)();
}

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

// Append new migrations to the end; never edit one that has shipped.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('organizer','helper','parent','cadet')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','suspended')),
    email TEXT UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    phone_e164 TEXT,
    notify_sms INTEGER NOT NULL DEFAULT 1,
    notify_email INTEGER NOT NULL DEFAULT 1,
    permissions TEXT NOT NULL DEFAULT '[]',
    theme TEXT,
    managed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    note TEXT,
    staff_notes TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    last_seen_at TEXT
  );
  CREATE INDEX users_phone ON users(phone_e164);
  CREATE INDEX users_role ON users(role, status);

  CREATE TABLE cadet_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    class_year TEXT NOT NULL DEFAULT '',
    squadron TEXT NOT NULL DEFAULT '',
    dorm TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE family_links (
    parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cadet_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    PRIMARY KEY (parent_id, cadet_id)
  );
  CREATE INDEX family_cadet ON family_links(cadet_id);

  CREATE TABLE invites (
    code TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('family','helper')),
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    for_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    permissions TEXT,
    expires_at TEXT NOT NULL,
    used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    expires_at TEXT NOT NULL,
    user_agent TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE services (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    fee_cents INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE locations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE runs (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    service_id INTEGER NOT NULL REFERENCES services(id),
    vendor TEXT NOT NULL DEFAULT '',
    run_date TEXT NOT NULL,
    pickup_time TEXT NOT NULL,
    cutoff_at TEXT,
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    capacity INTEGER NOT NULL DEFAULT 0,
    fee_cents INTEGER,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX runs_date ON runs(run_date);

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    ref TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    service_id INTEGER NOT NULL REFERENCES services(id),
    service_name TEXT NOT NULL,
    category TEXT NOT NULL,
    fee_cents INTEGER NOT NULL DEFAULT 0,
    tip_cents INTEGER NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    payment_method TEXT,
    payment_ref TEXT,
    paid_at TEXT,
    service_date TEXT NOT NULL,
    time TEXT NOT NULL,
    location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
    details TEXT NOT NULL DEFAULT '{}',
    notes TEXT NOT NULL DEFAULT '',
    staff_notes TEXT NOT NULL DEFAULT '',
    surprise TEXT NOT NULL DEFAULT 'none',
    short_notice INTEGER NOT NULL DEFAULT 0,
    cadet_id INTEGER NOT NULL REFERENCES users(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    payer_id INTEGER REFERENCES users(id),
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    run_id INTEGER REFERENCES runs(id) ON DELETE SET NULL,
    eta_at TEXT,
    delivered_at TEXT,
    delivery_note TEXT,
    tracking_token TEXT NOT NULL UNIQUE,
    reminder_sent_at TEXT,
    cancel_reason TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX orders_date ON orders(service_date, time);
  CREATE INDEX orders_status ON orders(status);
  CREATE INDEX orders_cadet ON orders(cadet_id);
  CREATE INDEX orders_created_by ON orders(created_by);
  CREATE INDEX orders_payer ON orders(payer_id);
  CREATE INDEX orders_assigned ON orders(assigned_to);

  CREATE TABLE order_events (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    status TEXT,
    message TEXT NOT NULL DEFAULT '',
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX order_events_order ON order_events(order_id);

  CREATE TABLE threads (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('order','direct')),
    order_id INTEGER UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    last_message_at TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE attachments (
    id INTEGER PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    thread_id INTEGER REFERENCES threads(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    path TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX attachments_order ON attachments(order_id);

  CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    via TEXT NOT NULL DEFAULT 'app',
    attachment_id INTEGER REFERENCES attachments(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX messages_thread ON messages(thread_id, id);

  CREATE TABLE thread_reads (
    thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_id INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (thread_id, user_id)
  );

  CREATE TABLE notifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('inapp','sms','email')),
    event TEXT NOT NULL,
    to_address TEXT,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    link TEXT,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    sent_at TEXT
  );
  CREATE INDEX notifications_user ON notifications(user_id, channel, id);
  CREATE INDEX notifications_status ON notifications(status, channel);

  CREATE TABLE announcements (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    audience TEXT NOT NULL DEFAULT 'everyone',
    class_year TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    sms_count INTEGER NOT NULL DEFAULT 0,
    email_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE subscriptions (
    id INTEGER PRIMARY KEY,
    cadet_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT 'Semester subscription',
    starts_on TEXT NOT NULL,
    ends_on TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX subscriptions_cadet ON subscriptions(cadet_id);
  `,
];

function migrate(conn: DB): void {
  const current = conn.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    conn.transaction(() => {
      conn.exec(MIGRATIONS[v]);
      conn.pragma(`user_version = ${v + 1}`);
    })();
  }
}

export function json<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
