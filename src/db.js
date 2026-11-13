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
  id INTEGER PRIMARY KEY,
  rank INTEGER,
  word TEXT UNIQUE NOT NULL,
  pos TEXT,
  article TEXT,
  glosses TEXT NOT NULL,
  alt_glosses TEXT,
  meaning_conflict INTEGER NOT NULL DEFAULT 0,
  ipa TEXT,
  example_nl TEXT,
  example_en TEXT,
  freq INTEGER,
  forms TEXT,
  lemma TEXT,
  topics TEXT,
  globally_skipped INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS words_rank ON words(rank);

CREATE TABLE IF NOT EXISTS translations(
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  lang TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY(word_id, lang)
);

CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS progress(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  box INTEGER NOT NULL DEFAULT 0,
  due INTEGER NOT NULL,
  correct INTEGER NOT NULL DEFAULT 0,
  wrong INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, word_id)
);
CREATE INDEX IF NOT EXISTS progress_due ON progress(user_id, due);

CREATE TABLE IF NOT EXISTS daily(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  reviews INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, day)
);

CREATE TABLE IF NOT EXISTS reports(
  id INTEGER PRIMARY KEY,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS reports_status ON reports(status, word_id);

CREATE TABLE IF NOT EXISTS user_skips(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, word_id)
);
`);

// Schema migrations for existing databases
const cols = new Set(db.prepare("SELECT name FROM pragma_table_info('words')").all().map(c => c.name));
const migrations = [
  ['freq', 'INTEGER'],
  ['article', 'TEXT'],
  ['alt_glosses', 'TEXT'],
  ['meaning_conflict', 'INTEGER NOT NULL DEFAULT 0'],
  ['forms', 'TEXT'],
  ['lemma', 'TEXT'],
  ['topics', 'TEXT'],
  ['globally_skipped', 'INTEGER NOT NULL DEFAULT 0'],
];
for (const [col, def] of migrations) {
  if (!cols.has(col)) db.exec(`ALTER TABLE words ADD COLUMN ${col} ${def}`);
}
db.exec('CREATE INDEX IF NOT EXISTS words_skip ON words(globally_skipped)');

// Allow NULL rank on older schemas where rank had NOT NULL constraint
const rankInfo = db.prepare("SELECT \"notnull\" FROM pragma_table_info('words') WHERE name='rank'").get();
if (rankInfo && rankInfo.notnull === 1) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN TRANSACTION;
    CREATE TABLE words_new(
      id INTEGER PRIMARY KEY, rank INTEGER, word TEXT UNIQUE NOT NULL, pos TEXT, article TEXT,
      glosses TEXT NOT NULL, alt_glosses TEXT, meaning_conflict INTEGER NOT NULL DEFAULT 0,
      ipa TEXT, example_nl TEXT, example_en TEXT, freq INTEGER, forms TEXT, lemma TEXT,
      topics TEXT, globally_skipped INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO words_new(id,rank,word,pos,article,glosses,alt_glosses,meaning_conflict,ipa,example_nl,example_en,freq,forms,lemma,topics,globally_skipped)
      SELECT id,rank,word,pos,article,glosses,alt_glosses,meaning_conflict,ipa,example_nl,example_en,freq,forms,lemma,topics,globally_skipped FROM words;
    DROP TABLE words;
    ALTER TABLE words_new RENAME TO words;
    CREATE INDEX IF NOT EXISTS words_rank ON words(rank);
    CREATE INDEX IF NOT EXISTS words_skip ON words(globally_skipped);
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

module.exports = db;
