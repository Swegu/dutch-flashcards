const express = require('express');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');
const { startImport, importStatus } = require('./import');

const BOX_DAYS = [0, 1, 3, 7, 14, 30, 60]; // review interval per box
const MASTERED_BOX = 5;
const DAY = 86400000;
const SESSION_MS = 30 * DAY;

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- auth ----------
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const sidOf = req => /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];

function login(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token, userId, Date.now() + SESSION_MS);
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: SESSION_MS });
}

function auth(req, res, next) {
  const sid = sidOf(req);
  const user = sid && db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(sid, Date.now());
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  req.user = user;
  next();
}

app.post('/api/register', (req, res) => {
  if (process.env.ALLOW_REGISTRATION === 'false') return res.status(403).json({ error: 'Registration is disabled' });
  const { username, password } = req.body || {};
  if (!/^[\w.-]{3,32}$/.test(username || '')) return res.status(400).json({ error: 'Username: 3-32 letters, digits, . _ -' });
  if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const salt = crypto.randomBytes(16).toString('hex');
  try {
    const { lastInsertRowid } = db.prepare('INSERT INTO users(username,salt,hash) VALUES(?,?,?)').run(username, salt, hashPw(password, salt));
    login(req, res, lastInsertRowid);
    res.json({ username });
  } catch {
    res.status(409).json({ error: 'Username already taken' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = typeof username === 'string' && typeof password === 'string' && db.prepare('SELECT * FROM users WHERE username=?').get(username);
  const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(password, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
  if (!ok) return res.status(401).json({ error: 'Wrong username or password' });
  login(req, res, u.id);
  res.json({ username: u.username });
});

app.post('/api/logout', (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token=?').run(sidOf(req));
  res.clearCookie('sid').json({});
});

app.get('/api/me', auth, (req, res) => res.json({ username: req.user.username }));

// ---------- import status ----------
app.get('/api/status', (req, res) => res.json(importStatus()));
app.post('/api/import/retry', (req, res) => { startImport(); res.json({}); });

// ---------- cards ----------
app.get('/api/cards', auth, (req, res) => {
  const limit = Math.min(+req.query.limit || 10, 30);
  const exclude = String(req.query.exclude || '').split(',').map(Number).filter(Number.isInteger);
  const ex = exclude.length ? `AND w.id NOT IN (${exclude.map(() => '?').join()})` : '';
  const uid = req.user.id;
  // Due cards first; words the user keeps getting wrong come before the rest, then lowest box, then most overdue.
  const due = db.prepare(`SELECT w.*, p.box, 0 AS isNew FROM progress p JOIN words w ON w.id=p.word_id
    WHERE p.user_id=? AND p.due<=? ${ex} ORDER BY (p.wrong>p.correct) DESC, p.box, p.due LIMIT ?`).all(uid, Date.now(), ...exclude, limit);
  // Then new words, most frequent Dutch words first.
  const fresh = due.length >= limit ? [] : db.prepare(`SELECT w.*, 0 AS box, 1 AS isNew FROM words w
    WHERE NOT EXISTS(SELECT 1 FROM progress p WHERE p.user_id=? AND p.word_id=w.id) ${ex} ORDER BY w.rank LIMIT ?`)
    .all(uid, ...exclude, limit - due.length);
  res.json([...due, ...fresh].map(w => ({
    id: w.id, word: w.word, pos: w.pos, ipa: w.ipa, glosses: JSON.parse(w.glosses),
    exampleNl: w.example_nl, exampleEn: w.example_en, box: w.box, isNew: !!w.isNew,
  })));
});

// Translations into other languages (Bulgarian) are fetched online on demand and cached.
app.get('/api/translation/:id', auth, async (req, res) => {
  const lang = req.query.lang;
  if (lang !== 'bg') return res.status(400).json({ error: 'Unsupported language' });
  const w = db.prepare('SELECT id, word FROM words WHERE id=?').get(+req.params.id);
  if (!w) return res.status(404).json({ error: 'Unknown word' });
  const hit = db.prepare('SELECT text FROM translations WHERE word_id=? AND lang=?').get(w.id, lang);
  if (hit) return res.json({ text: hit.text });
  try {
    const u = new URL('https://api.mymemory.translated.net/get');
    u.searchParams.set('q', w.word);
    u.searchParams.set('langpair', `nl|${lang}`);
    if (process.env.MYMEMORY_EMAIL) u.searchParams.set('de', process.env.MYMEMORY_EMAIL);
    const j = await (await fetch(u, { signal: AbortSignal.timeout(6000) })).json();
    const text = Number(j.responseStatus) === 200 && j.responseData?.translatedText?.trim();
    if (text && !/MYMEMORY WARNING/i.test(text)) {
      db.prepare('INSERT OR REPLACE INTO translations VALUES(?,?,?)').run(w.id, lang, text);
      return res.json({ text });
    }
  } catch { /* fall through */ }
  res.json({ text: '' });
});

// ---------- reviews & stats ----------
function getStats(uid) {
  const u = db.prepare('SELECT score, streak, best_streak FROM users WHERE id=?').get(uid);
  const agg = db.prepare('SELECT COUNT(*) learned, COALESCE(SUM(box>=?),0) mastered, COALESCE(SUM(correct),0) c, COALESCE(SUM(wrong),0) w FROM progress WHERE user_id=?').get(MASTERED_BOX, uid);
  const day = new Date().toISOString().slice(0, 10);
  return {
    score: u.score, streak: u.streak, bestStreak: u.best_streak,
    totalWords: db.prepare('SELECT COUNT(*) n FROM words').get().n,
    learned: agg.learned, mastered: agg.mastered,
    accuracy: agg.c + agg.w ? Math.round(agg.c / (agg.c + agg.w) * 100) : 0,
    dueNow: db.prepare('SELECT COUNT(*) n FROM progress WHERE user_id=? AND due<=?').get(uid, Date.now()).n,
    today: db.prepare('SELECT reviews, correct FROM daily WHERE user_id=? AND day=?').get(uid, day) || { reviews: 0, correct: 0 },
    days: db.prepare('SELECT day, reviews, correct FROM (SELECT * FROM daily WHERE user_id=? ORDER BY day DESC LIMIT 7) ORDER BY day').all(uid),
  };
}

app.get('/api/stats', auth, (req, res) => res.json(getStats(req.user.id)));

// rating: 0 = again, 1 = good, 2 = easy
app.post('/api/review', auth, (req, res) => {
  const { wordId, rating } = req.body || {};
  if (!Number.isInteger(wordId) || ![0, 1, 2].includes(rating)) return res.status(400).json({ error: 'Bad request' });
  if (!db.prepare('SELECT 1 FROM words WHERE id=?').get(wordId)) return res.status(404).json({ error: 'Unknown word' });
  const uid = req.user.id, now = Date.now(), day = new Date().toISOString().slice(0, 10);
  const p = db.prepare('SELECT box FROM progress WHERE user_id=? AND word_id=?').get(uid, wordId) || { box: 0 };
  const box = rating === 0 ? 0 : Math.min(BOX_DAYS.length - 1, p.box + rating);
  const due = rating === 0 ? now + 10 * 60000 : now + BOX_DAYS[box] * DAY;
  const gained = rating === 0 ? 0 : (rating === 1 ? 10 : 15) + Math.min(req.user.streak, 10) * 2;
  const streak = rating === 0 ? 0 : req.user.streak + 1;
  const ok = rating === 0 ? 0 : 1;
  db.transaction(() => {
    db.prepare(`INSERT INTO progress(user_id,word_id,box,due,correct,wrong) VALUES(?,?,?,?,?,?)
      ON CONFLICT(user_id,word_id) DO UPDATE SET box=?, due=?, correct=correct+?, wrong=wrong+?`)
      .run(uid, wordId, box, due, ok, 1 - ok, box, due, ok, 1 - ok);
    db.prepare('UPDATE users SET score=score+?, streak=?, best_streak=MAX(best_streak,?) WHERE id=?').run(gained, streak, streak, uid);
    db.prepare(`INSERT INTO daily VALUES(?,?,1,?) ON CONFLICT(user_id,day) DO UPDATE SET reviews=reviews+1, correct=correct+?`)
      .run(uid, day, ok, ok);
  })();
  res.json({ gained, stats: getStats(uid) });
});

db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
startImport();
app.listen(process.env.PORT || 3000, () => console.log('Listening on :' + (process.env.PORT || 3000)));
