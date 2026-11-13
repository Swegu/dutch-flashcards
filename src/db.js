const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });

const db = new Database(path.join(dir, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const LEVELS_VERSION = '1';

function computeWordLevel({ rank, word, topics, exampleNl, rawTopics }) {
  if (rawTopics) {
    for (const rt of rawTopics) {
      const m = /\b(A1|A2|B1|B2|C1|C2)\b/i.exec(String(rt));
      if (m) return m[1].toUpperCase();
    }
  }
  const w = String(word || '');
  const len = w.length;
  const hasTopics = Array.isArray(topics) ? topics.length > 0 : (typeof topics === 'string' && topics.length > 2);
  const hasExample = Boolean(exampleNl);

  if (rank !== null && rank !== undefined && rank > 0) {
    let eff = rank;
    if (len <= 5 && rank <= 3000) eff *= 0.85;
    else if (len >= 17) eff *= 1.6;
    else if (len >= 13) eff *= 1.3;

    if (hasTopics && hasExample) eff *= 0.9;

    if (eff <= 750) return 'A1';
    if (eff <= 2000) return 'A2';
    if (eff <= 4500) return 'B1';
    if (eff <= 9000) return 'B2';
    if (eff <= 18000) return 'C1';
    return 'C2';
  }

  if (hasTopics && hasExample && len <= 9) return 'B2';
  if (hasTopics || (hasExample && len <= 10)) return 'C1';
  return 'C2';
}

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
  level TEXT NOT NULL DEFAULT 'C2',
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
  best_streak INTEGER NOT NULL DEFAULT 0,
  daily_new_goal INTEGER NOT NULL DEFAULT 10,
  daily_review_goal INTEGER NOT NULL DEFAULT 30,
  target_level TEXT NOT NULL DEFAULT 'auto',
  day_streak INTEGER NOT NULL DEFAULT 0,
  best_day_streak INTEGER NOT NULL DEFAULT 0,
  last_study_day TEXT
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
  new_words INTEGER NOT NULL DEFAULT 0,
  goal_met INTEGER NOT NULL DEFAULT 0,
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
  ['level', "TEXT NOT NULL DEFAULT 'C2'"],
  ['globally_skipped', 'INTEGER NOT NULL DEFAULT 0'],
];
for (const [col, def] of migrations) {
  if (!cols.has(col)) db.exec(`ALTER TABLE words ADD COLUMN ${col} ${def}`);
}
db.exec('CREATE INDEX IF NOT EXISTS words_skip ON words(globally_skipped)');
db.exec('CREATE INDEX IF NOT EXISTS words_level ON words(level, rank)');

const userCols = new Set(db.prepare("SELECT name FROM pragma_table_info('users')").all().map(c => c.name));
const userMigrations = [
  ['daily_new_goal', 'INTEGER NOT NULL DEFAULT 10'],
  ['daily_review_goal', 'INTEGER NOT NULL DEFAULT 30'],
  ['target_level', "TEXT NOT NULL DEFAULT 'auto'"],
  ['day_streak', 'INTEGER NOT NULL DEFAULT 0'],
  ['best_day_streak', 'INTEGER NOT NULL DEFAULT 0'],
  ['last_study_day', 'TEXT'],
];
for (const [col, def] of userMigrations) {
  if (!userCols.has(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
}

const dailyCols = new Set(db.prepare("SELECT name FROM pragma_table_info('daily')").all().map(c => c.name));
const dailyMigrations = [
  ['new_words', 'INTEGER NOT NULL DEFAULT 0'],
  ['goal_met', 'INTEGER NOT NULL DEFAULT 0'],
];
for (const [col, def] of dailyMigrations) {
  if (!dailyCols.has(col)) db.exec(`ALTER TABLE daily ADD COLUMN ${col} ${def}`);
}

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
      topics TEXT, level TEXT NOT NULL DEFAULT 'C2', globally_skipped INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO words_new(id,rank,word,pos,article,glosses,alt_glosses,meaning_conflict,ipa,example_nl,example_en,freq,forms,lemma,topics,level,globally_skipped)
      SELECT id,rank,word,pos,article,glosses,alt_glosses,meaning_conflict,ipa,example_nl,example_en,freq,forms,lemma,topics,level,globally_skipped FROM words;
    DROP TABLE words;
    ALTER TABLE words_new RENAME TO words;
    CREATE INDEX IF NOT EXISTS words_rank ON words(rank);
    CREATE INDEX IF NOT EXISTS words_skip ON words(globally_skipped);
    CREATE INDEX IF NOT EXISTS words_level ON words(level, rank);
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

// Backfill CEFR levels for existing databases if not yet computed
const curLevelsVer = db.prepare("SELECT value FROM meta WHERE key='levels_version'").get()?.value;
if (curLevelsVer !== LEVELS_VERSION) {
  const rows = db.prepare('SELECT id, rank, word, topics, example_nl FROM words').all();
  if (rows.length > 0) {
    const upd = db.prepare('UPDATE words SET level = ? WHERE id = ?');
    db.transaction(() => {
      for (const r of rows) {
        const lvl = computeWordLevel({
          rank: r.rank,
          word: r.word,
          topics: r.topics,
          exampleNl: r.example_nl,
        });
        upd.run(lvl, r.id);
      }
      db.prepare("INSERT INTO meta VALUES('levels_version', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(LEVELS_VERSION);
    })();
  }
}

db.CEFR_LEVELS = CEFR_LEVELS;
db.computeWordLevel = computeWordLevel;
module.exports = db;
