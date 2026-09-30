const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS groups (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  business_name TEXT,
  business_desc TEXT,
  mentor_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,          -- NIM untuk mahasiswa, NIDN/NIP untuk dosen
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('mahasiswa', 'dosen')),
  prodi         TEXT,
  group_id      INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS personal_logs (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date       TEXT NOT NULL,
  activity       TEXT NOT NULL,
  description    TEXT,
  outcome        TEXT,
  duration_hours REAL,
  status         TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu', 'disetujui', 'revisi')),
  feedback       TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_personal_logs_user ON personal_logs(user_id, log_date);

CREATE TABLE IF NOT EXISTS group_logs (
  id             INTEGER PRIMARY KEY,
  group_id       INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  author_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  log_date       TEXT NOT NULL,
  activity       TEXT NOT NULL,
  description    TEXT,
  outcome        TEXT,
  attendees      TEXT,
  duration_hours REAL,
  status         TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu', 'disetujui', 'revisi')),
  feedback       TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_group_logs_group ON group_logs(group_id, log_date);

CREATE TABLE IF NOT EXISTS documents (
  id            INTEGER PRIMARY KEY,
  owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id      INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  scope         TEXT NOT NULL CHECK (scope IN ('pribadi', 'kelompok')),
  category      TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  stored_name   TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime          TEXT,
  size          INTEGER,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS topics (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  week_no     INTEGER,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS materials (
  id            INTEGER PRIMARY KEY,
  topic_id      INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  content       TEXT,
  link_url      TEXT,
  stored_name   TEXT,
  original_name TEXT,
  mime          TEXT,
  size          INTEGER,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS material_progress (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id  INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, material_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  sess    TEXT NOT NULL,
  expires INTEGER NOT NULL
);
`;

const DEFAULT_SETTINGS = {
  program_name: 'Program Kewirausahaan Mahasiswa',
  period_start: new Date().toISOString().slice(0, 10),
  period_weeks: 14,
  min_personal_logs_per_week: 1,
  min_group_logs_per_week: 1,
};

const NUMERIC_SETTINGS = ['period_weeks', 'min_personal_logs_per_week', 'min_group_logs_per_week'];

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insert.run(key, String(value));
  return db;
}

function getSettings(db) {
  const settings = {};
  for (const row of db.prepare('SELECT key, value FROM settings').all()) {
    settings[row.key] = NUMERIC_SETTINGS.includes(row.key) ? Number(row.value) : row.value;
  }
  return settings;
}

function saveSettings(db, values) {
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  for (const [key, value] of Object.entries(values)) upsert.run(key, String(value));
}

function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDb, getSettings, saveSettings, transaction };
