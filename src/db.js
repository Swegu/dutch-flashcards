const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });

const db = new Database(path.join(dir, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS words(
  id INTEGER PRIMARY KEY, rank INTEGER NOT NULL, word TEXT UNIQUE NOT NULL, pos TEXT,
  glosses TEXT NOT NULL, ipa TEXT, example_nl TEXT, example_en TEXT);
CREATE INDEX IF NOT EXISTS words_rank ON words(rank);
CREATE TABLE IF NOT EXISTS translations(
  word_id INTEGER NOT NULL REFERENCES words(id), lang TEXT NOT NULL, text TEXT NOT NULL,
  PRIMARY KEY(word_id, lang));
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, salt TEXT NOT NULL, hash TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS progress(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, word_id INTEGER NOT NULL REFERENCES words(id),
  box INTEGER NOT NULL DEFAULT 0, due INTEGER NOT NULL, correct INTEGER NOT NULL DEFAULT 0, wrong INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, word_id));
CREATE INDEX IF NOT EXISTS progress_due ON progress(user_id, due);
CREATE TABLE IF NOT EXISTS daily(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, day TEXT NOT NULL,
  reviews INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id, day));
`);

// Migration: frequency count column (databases created by earlier versions lack it)
if (!db.prepare("SELECT 1 FROM pragma_table_info('words') WHERE name='freq'").get()) db.exec('ALTER TABLE words ADD COLUMN freq INTEGER');

module.exports = db;
