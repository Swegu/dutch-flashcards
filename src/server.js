const express = require('express');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');
const { startImport, importStatus } = require('./import');

const BOX_DAYS = [0, 1, 3, 7, 14, 30, 60];
const MASTERED_BOX = 5;
const DAY = 86400000;
const SESSION_MS = 30 * DAY;
const DAILY_GOAL_BONUS = 50;
const ALLOWED_TOPICS = new Set(['all', 'food', 'travel', 'home', 'work', 'health']);
const CEFR_LEVELS = db.CEFR_LEVELS || ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const ALLOWED_LEVELS = new Set(['auto', 'all', ...CEFR_LEVELS]);

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));
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

// ---------- helpers ----------
const todayIso = () => new Date().toISOString().slice(0, 10);
const prevDayIso = dayStr => new Date(new Date(dayStr + 'T00:00:00Z').getTime() - DAY).toISOString().slice(0, 10);

function formatCard(w) {
  const isNew = !!w.isNew;
  return {
    id: w.id,
    word: w.word,
    pos: w.pos,
    article: w.article || null,
    ipa: w.ipa,
    glosses: JSON.parse(w.glosses || '[]'),
    altGlosses: w.alt_glosses ? JSON.parse(w.alt_glosses) : [],
    meaningConflict: !!w.meaning_conflict,
    exampleNl: w.example_nl,
    exampleEn: w.example_en,
    box: w.box ?? 0,
    isNew,
    stage: w.stage || (isNew ? 'new' : 'due'),
    level: w.level || 'C2',
    rank: w.rank ?? null,
    freq: w.freq ?? null,
    forms: w.forms ? JSON.parse(w.forms) : [],
    lemma: w.lemma || null,
    topics: w.topics ? JSON.parse(w.topics) : [],
    sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(w.word)}#Dutch`,
  };
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getLevelsBreakdown(uid, topic = 'all') {
  const topicSql = topic !== 'all' ? 'AND w.topics LIKE ?' : '';
  const topicParams = topic !== 'all' ? [`%"${topic}"%`] : [];
  const rows = db.prepare(`
    SELECT w.level,
           COUNT(*) AS total,
           COALESCE(SUM(p.word_id IS NOT NULL), 0) AS learned,
           COALESCE(SUM(p.box >= ?), 0) AS mastered,
           COALESCE(SUM(CASE WHEN p.due <= ? THEN 1 ELSE 0 END), 0) AS due
    FROM words w
    LEFT JOIN progress p ON p.word_id = w.id AND p.user_id = ?
    WHERE w.globally_skipped = 0
      AND NOT EXISTS(SELECT 1 FROM user_skips us WHERE us.user_id = ? AND us.word_id = w.id)
      ${topicSql}
    GROUP BY w.level
  `).all(MASTERED_BOX, Date.now(), uid, uid, ...topicParams);

  const byLevel = new Map(rows.map(r => [r.level, r]));
  return CEFR_LEVELS.map(lvl => {
    const r = byLevel.get(lvl) || { total: 0, learned: 0, mastered: 0, due: 0 };
    return {
      level: lvl,
      total: r.total,
      learned: r.learned,
      mastered: r.mastered,
      due: r.due,
    };
  });
}

function resolveActiveLevel(levelsBreakdown) {
  for (const l of levelsBreakdown) {
    if (l.total > 0 && l.learned / l.total < 0.8) return l.level;
  }
  for (const l of levelsBreakdown) {
    if (l.total > l.learned) return l.level;
  }
  return 'C2';
}

function interleavePattern(dueCards, newCards, consolidateCards) {
  const result = [];
  let di = 0, ni = 0;
  while (di < dueCards.length || ni < newCards.length) {
    if (di < dueCards.length) result.push(dueCards[di++]);
    if (di < dueCards.length) result.push(dueCards[di++]);
    if (ni < newCards.length) result.push(newCards[ni++]);
  }
  for (const c of consolidateCards) result.push(c);
  return result;
}

// ---------- cards & search ----------
app.get('/api/cards', auth, (req, res) => {
  const limit = Math.min(+req.query.limit || 10, 30);
  const exclude = String(req.query.exclude || '').split(',').map(Number).filter(Number.isInteger);
  const topic = ALLOWED_TOPICS.has(req.query.topic) ? req.query.topic : 'all';
  const requestedLevel = ALLOWED_LEVELS.has(req.query.level) ? req.query.level : (req.user.target_level || 'auto');
  const shuffle = req.query.shuffle !== '0';
  const mode = req.query.mode === 'free' ? 'free' : 'daily';
  const extra = req.query.extra === '1';

  const uid = req.user.id;
  const now = Date.now();
  const day = todayIso();

  const exSql = exclude.length ? `AND w.id NOT IN (${exclude.map(() => '?').join()})` : '';
  const topicSql = topic !== 'all' ? 'AND w.topics LIKE ?' : '';
  const topicParams = topic !== 'all' ? [`%"${topic}"%`] : [];

  const levelsBreakdown = getLevelsBreakdown(uid, topic);
  const activeLevel = requestedLevel === 'auto'
    ? resolveActiveLevel(levelsBreakdown)
    : (CEFR_LEVELS.includes(requestedLevel) ? requestedLevel : null);

  // In 'auto' mode, due/consolidate reviews cover all learned words across any level, while new words target activeLevel
  const strictLevelSql = CEFR_LEVELS.includes(requestedLevel) ? 'AND w.level = ?' : '';
  const strictLevelParams = CEFR_LEVELS.includes(requestedLevel) ? [requestedLevel] : [];

  let batchLimit = limit;
  let maxNewInBatch = limit;

  if (mode === 'daily' && !extra) {
    const todayRow = db.prepare('SELECT reviews, correct, new_words, goal_met FROM daily WHERE user_id=? AND day=?').get(uid, day)
      || { reviews: 0, correct: 0, new_words: 0, goal_met: 0 };

    const inQueueTotal = exclude.length;
    const inQueueLearned = exclude.length
      ? db.prepare(`SELECT COUNT(*) n FROM progress WHERE user_id=? AND word_id IN (${exclude.map(() => '?').join()})`).get(uid, ...exclude).n
      : 0;
    const inQueueNew = inQueueTotal - inQueueLearned;

    const remNew = Math.max(0, req.user.daily_new_goal - todayRow.new_words - inQueueNew);
    const remReviews = Math.max(0, req.user.daily_review_goal - todayRow.reviews - inQueueTotal);
    const totalNeededToday = Math.max(remNew, remReviews);

    if (totalNeededToday <= 0) return res.json([]);
    batchLimit = Math.min(limit, totalNeededToday);
    maxNewInBatch = Math.min(remNew, batchLimit);
  } else {
    // In free practice or extra mode, still interleave due cards with new words nicely
    maxNewInBatch = batchLimit;
  }

  // Step 1: Fetch due cards
  const duePoolLimit = shuffle ? Math.max(batchLimit * 3, 25) : batchLimit;
  const due = db.prepare(`
    SELECT w.*, p.box, 0 AS isNew, 'due' AS stage
    FROM progress p
    JOIN words w ON w.id = p.word_id
    WHERE p.user_id = ?
      AND p.due <= ?
      AND w.globally_skipped = 0
      AND NOT EXISTS(SELECT 1 FROM user_skips us WHERE us.user_id = ? AND us.word_id = w.id)
      ${strictLevelSql}
      ${topicSql}
      ${exSql}
    ORDER BY (p.wrong > p.correct) DESC, p.box ASC, p.due ASC
    LIMIT ?
  `).all(uid, now, uid, ...strictLevelParams, ...topicParams, ...exclude, duePoolLimit);

  if (shuffle && due.length > 1) {
    const struggled = due.filter(c => c.wrong > c.correct);
    const normal = due.filter(c => c.wrong <= c.correct);
    shuffleInPlace(struggled);
    shuffleInPlace(normal);
    due.splice(0, due.length, ...struggled, ...normal);
  }

  // Reserve slots for daily new words so users with many due cards still learn their daily new words
  const reservedNewSlots = maxNewInBatch > 0
    ? Math.min(maxNewInBatch, due.length > 0 ? Math.max(1, Math.ceil(batchLimit * 0.4)) : batchLimit)
    : 0;
  let pickedDue = due.slice(0, batchLimit - reservedNewSlots);

  // Step 2: Fetch new words at target level
  let pickedFresh = [];
  const desiredNew = Math.min(maxNewInBatch, batchLimit - pickedDue.length);
  if (desiredNew > 0) {
    const fetchFreshForLevel = (lvl, neededCount, extraExcludeIds) => {
      const allEx = [...exclude, ...extraExcludeIds];
      const exClause = allEx.length ? `AND w.id NOT IN (${allEx.map(() => '?').join()})` : '';
      const lvlClause = lvl ? 'AND w.level = ?' : '';
      const lvlParams = lvl ? [lvl] : [];
      const poolSize = shuffle ? Math.max(neededCount * 4, 45) : neededCount;
      const rows = db.prepare(`
        SELECT w.*, 0 AS box, 1 AS isNew, 'new' AS stage
        FROM words w
        WHERE w.globally_skipped = 0
          AND NOT EXISTS(SELECT 1 FROM progress p WHERE p.user_id = ? AND p.word_id = w.id)
          AND NOT EXISTS(SELECT 1 FROM user_skips us WHERE us.user_id = ? AND us.word_id = w.id)
          ${lvlClause}
          ${topicSql}
          ${exClause}
        ORDER BY (w.rank IS NULL) ASC, w.rank ASC, w.id ASC
        LIMIT ?
      `).all(uid, uid, ...lvlParams, ...topicParams, ...allEx, poolSize);
      if (shuffle && rows.length > 1) shuffleInPlace(rows);
      return rows.slice(0, neededCount);
    };

    if (requestedLevel === 'auto' && activeLevel) {
      // Pull from activeLevel first; if exhausted, cascade through subsequent CEFR levels
      const startIdx = Math.max(0, CEFR_LEVELS.indexOf(activeLevel));
      for (let i = startIdx; i < CEFR_LEVELS.length && pickedFresh.length < desiredNew; i++) {
        const more = fetchFreshForLevel(
          CEFR_LEVELS[i],
          desiredNew - pickedFresh.length,
          pickedFresh.map(c => c.id)
        );
        pickedFresh.push(...more);
      }
    } else {
      pickedFresh = fetchFreshForLevel(
        CEFR_LEVELS.includes(requestedLevel) ? requestedLevel : null,
        desiredNew,
        []
      );
    }
  }

  // If fewer fresh cards were found than reserved, top up with any remaining due cards
  if (pickedDue.length + pickedFresh.length < batchLimit && due.length > pickedDue.length) {
    const extraDueNeeded = batchLimit - (pickedDue.length + pickedFresh.length);
    pickedDue.push(...due.slice(pickedDue.length, pickedDue.length + extraDueNeeded));
  }

  // Step 3: Consolidation stage — if daily review quota still needs cards (or free mode has no unseen words left),
  // reinforce recently learned / low-box words
  let pickedConsolidate = [];
  if (pickedDue.length + pickedFresh.length < batchLimit) {
    const neededConsolidate = batchLimit - (pickedDue.length + pickedFresh.length);
    const allUsedIds = [...exclude, ...pickedDue.map(c => c.id), ...pickedFresh.map(c => c.id)];
    const usedClause = allUsedIds.length ? `AND w.id NOT IN (${allUsedIds.map(() => '?').join()})` : '';
    const consPoolLimit = shuffle ? Math.max(neededConsolidate * 3, 20) : neededConsolidate;

    const cons = db.prepare(`
      SELECT w.*, p.box, 0 AS isNew, 'consolidate' AS stage
      FROM progress p
      JOIN words w ON w.id = p.word_id
      WHERE p.user_id = ?
        AND w.globally_skipped = 0
        AND NOT EXISTS(SELECT 1 FROM user_skips us WHERE us.user_id = ? AND us.word_id = w.id)
        ${strictLevelSql}
        ${topicSql}
        ${usedClause}
      ORDER BY p.box ASC, (p.wrong > p.correct) DESC, p.due ASC
      LIMIT ?
    `).all(uid, uid, ...strictLevelParams, ...topicParams, ...allUsedIds, consPoolLimit);

    if (shuffle && cons.length > 1) shuffleInPlace(cons);
    pickedConsolidate = cons.slice(0, neededConsolidate);
  }

  const ordered = interleavePattern(pickedDue, pickedFresh, pickedConsolidate);
  res.json(ordered.map(formatCard));
});

app.get('/api/word/:term', auth, (req, res) => {
  const term = String(req.params.term || '').trim().toLowerCase();
  if (!term) return res.status(400).json({ error: 'Empty query' });
  const uid = req.user.id;
  const row = db.prepare(`
    SELECT w.*, COALESCE(p.box, 0) AS box, (p.word_id IS NULL) AS isNew
    FROM words w
    LEFT JOIN progress p ON p.word_id = w.id AND p.user_id = ?
    WHERE w.word = ?
  `).get(uid, term);
  if (!row) return res.status(404).json({ error: 'Word not found' });
  res.json(formatCard(row));
});

app.get('/api/search', auth, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json([]);
  const like = `%${q}%`;
  const rows = db.prepare(`
    SELECT w.*, 0 AS box, 1 AS isNew
    FROM words w
    WHERE w.globally_skipped = 0
      AND (w.word LIKE ? OR w.glosses LIKE ? OR w.forms LIKE ?)
    ORDER BY (w.word = ?) DESC, (w.word LIKE ?) DESC, (w.rank IS NULL) ASC, w.rank ASC
    LIMIT 12
  `).all(like, like, like, q, `${q}%`);
  res.json(rows.map(formatCard));
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

// ---------- daily plan & level settings ----------
app.post('/api/settings', auth, (req, res) => {
  const uid = req.user.id;
  const rawNew = Number(req.body?.dailyNewGoal);
  const rawRev = Number(req.body?.dailyReviewGoal);
  const rawLvl = String(req.body?.targetLevel || '');

  const dailyNewGoal = Number.isFinite(rawNew) ? Math.max(1, Math.min(100, Math.round(rawNew))) : req.user.daily_new_goal;
  const dailyReviewGoal = Number.isFinite(rawRev) ? Math.max(dailyNewGoal, Math.min(500, Math.round(rawRev))) : req.user.daily_review_goal;
  const targetLevel = ALLOWED_LEVELS.has(rawLvl) ? rawLvl : req.user.target_level;

  const day = todayIso();
  db.transaction(() => {
    db.prepare('UPDATE users SET daily_new_goal=?, daily_review_goal=?, target_level=? WHERE id=?')
      .run(dailyNewGoal, dailyReviewGoal, targetLevel, uid);
    const todayRow = db.prepare('SELECT reviews, new_words FROM daily WHERE user_id=? AND day=?').get(uid, day);
    if (todayRow) {
      const met = (todayRow.new_words >= dailyNewGoal && todayRow.reviews >= dailyReviewGoal) ? 1 : 0;
      db.prepare('UPDATE daily SET goal_met = MAX(goal_met, ?) WHERE user_id=? AND day=?').run(met, uid, day);
    }
  })();

  res.json({ stats: getStats(uid) });
});

// ---------- reporting & global skip review ----------
app.post('/api/report', auth, (req, res) => {
  const { wordId, reason } = req.body || {};
  if (!Number.isInteger(wordId)) return res.status(400).json({ error: 'Bad request' });
  if (!db.prepare('SELECT 1 FROM words WHERE id=?').get(wordId)) return res.status(404).json({ error: 'Unknown word' });
  const cleanReason = String(reason || '').trim().slice(0, 200);
  const uid = req.user.id;
  db.transaction(() => {
    db.prepare('INSERT INTO reports(word_id, user_id, reason, created_at, status) VALUES(?,?,?,?,?)')
      .run(wordId, uid, cleanReason, Date.now(), 'open');
    db.prepare('INSERT OR IGNORE INTO user_skips(user_id, word_id) VALUES(?,?)').run(uid, wordId);
  })();
  res.json({ ok: true, stats: getStats(uid) });
});

app.get('/api/reports', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT w.*, COUNT(r.id) AS report_count,
           GROUP_CONCAT(DISTINCT NULLIF(r.reason, '')) AS reasons,
           MAX(r.created_at) AS last_reported
    FROM reports r
    JOIN words w ON w.id = r.word_id
    WHERE r.status = 'open'
    GROUP BY w.id
    ORDER BY report_count DESC, last_reported DESC
    LIMIT 100
  `).all();
  res.json(rows.map(r => ({
    ...formatCard(r),
    reportCount: r.report_count,
    reasons: r.reasons ? r.reasons.split(',') : [],
    globallySkipped: !!r.globally_skipped,
  })));
});

app.post('/api/reports/:wordId/resolve', auth, (req, res) => {
  const wordId = +req.params.wordId;
  const action = req.body?.action; // 'skip_all' | 'dismiss'
  if (!Number.isInteger(wordId) || !['skip_all', 'dismiss'].includes(action)) {
    return res.status(400).json({ error: 'Bad request' });
  }
  db.transaction(() => {
    if (action === 'skip_all') {
      db.prepare('UPDATE words SET globally_skipped = 1 WHERE id = ?').run(wordId);
      db.prepare("UPDATE reports SET status = 'skipped' WHERE word_id = ? AND status = 'open'").run(wordId);
    } else {
      db.prepare('UPDATE words SET globally_skipped = 0 WHERE id = ?').run(wordId);
      db.prepare("UPDATE reports SET status = 'dismissed' WHERE word_id = ? AND status = 'open'").run(wordId);
      db.prepare('DELETE FROM user_skips WHERE user_id = ? AND word_id = ?').run(req.user.id, wordId);
    }
  })();
  res.json({ ok: true, stats: getStats(req.user.id) });
});

// ---------- reviews, undo & stats ----------
function getStats(uid) {
  const u = db.prepare(`
    SELECT score, streak, best_streak, daily_new_goal, daily_review_goal, target_level,
           day_streak, best_day_streak, last_study_day
    FROM users WHERE id=?
  `).get(uid);

  const agg = db.prepare(`
    SELECT COUNT(*) learned, COALESCE(SUM(box>=?),0) mastered, COALESCE(SUM(correct),0) c, COALESCE(SUM(wrong),0) w
    FROM progress p
    JOIN words w ON w.id = p.word_id
    WHERE p.user_id=? AND w.globally_skipped = 0
  `).get(MASTERED_BOX, uid);

  const day = todayIso();
  const yesterday = prevDayIso(day);
  const activeDayStreak = (u.last_study_day === day || u.last_study_day === yesterday) ? u.day_streak : 0;

  const openReports = db.prepare("SELECT COUNT(DISTINCT word_id) n FROM reports WHERE status='open'").get().n;
  const todayRow = db.prepare('SELECT reviews, correct, new_words, goal_met FROM daily WHERE user_id=? AND day=?').get(uid, day)
    || { reviews: 0, correct: 0, new_words: 0, goal_met: 0 };

  const levels = getLevelsBreakdown(uid);
  const autoLevel = resolveActiveLevel(levels);
  const activeLevel = u.target_level === 'auto' ? autoLevel : u.target_level;

  const goalMet = Boolean(
    todayRow.goal_met ||
    (todayRow.new_words >= u.daily_new_goal && todayRow.reviews >= u.daily_review_goal)
  );

  return {
    score: u.score,
    streak: u.streak,
    bestStreak: u.best_streak,
    dayStreak: activeDayStreak,
    bestDayStreak: u.best_day_streak || 0,
    totalWords: db.prepare('SELECT COUNT(*) n FROM words WHERE globally_skipped = 0').get().n,
    openReports,
    learned: agg.learned,
    mastered: agg.mastered,
    accuracy: agg.c + agg.w ? Math.round(agg.c / (agg.c + agg.w) * 100) : 0,
    dueNow: db.prepare(`
      SELECT COUNT(*) n FROM progress p
      JOIN words w ON w.id = p.word_id
      WHERE p.user_id=? AND p.due<=? AND w.globally_skipped = 0
        AND NOT EXISTS(SELECT 1 FROM user_skips us WHERE us.user_id=? AND us.word_id=w.id)
    `).get(uid, Date.now(), uid).n,
    today: {
      reviews: todayRow.reviews,
      correct: todayRow.correct,
      newWords: todayRow.new_words,
      goalMet,
    },
    dailyPlan: {
      dailyNewGoal: u.daily_new_goal,
      dailyReviewGoal: u.daily_review_goal,
      targetLevel: u.target_level || 'auto',
      activeLevel,
      autoLevel,
      newToday: todayRow.new_words,
      reviewsToday: todayRow.reviews,
      correctToday: todayRow.correct,
      goalMet,
      newProgressPct: Math.min(100, Math.round((todayRow.new_words / Math.max(1, u.daily_new_goal)) * 100)),
      reviewProgressPct: Math.min(100, Math.round((todayRow.reviews / Math.max(1, u.daily_review_goal)) * 100)),
    },
    levels,
    days: db.prepare(`
      SELECT day, reviews, correct, new_words AS newWords, goal_met AS goalMet
      FROM (SELECT * FROM daily WHERE user_id=? ORDER BY day DESC LIMIT 7)
      ORDER BY day
    `).all(uid),
  };
}

app.get('/api/stats', auth, (req, res) => res.json(getStats(req.user.id)));

// rating: 0 = again, 1 = good, 2 = easy
app.post('/api/review', auth, (req, res) => {
  const { wordId, rating } = req.body || {};
  if (!Number.isInteger(wordId) || ![0, 1, 2].includes(rating)) return res.status(400).json({ error: 'Bad request' });
  if (!db.prepare('SELECT 1 FROM words WHERE id=?').get(wordId)) return res.status(404).json({ error: 'Unknown word' });

  const uid = req.user.id, now = Date.now(), day = todayIso();
  const prevProgress = db.prepare('SELECT box, due, correct, wrong FROM progress WHERE user_id=? AND word_id=?').get(uid, wordId) || null;
  const prevDaily = db.prepare('SELECT reviews, correct, new_words, goal_met FROM daily WHERE user_id=? AND day=?').get(uid, day) || null;
  const prevUser = {
    score: req.user.score,
    streak: req.user.streak,
    bestStreak: req.user.best_streak,
    dayStreak: req.user.day_streak || 0,
    bestDayStreak: req.user.best_day_streak || 0,
    lastStudyDay: req.user.last_study_day || null,
  };

  const isFirstReview = !prevProgress;
  const curBox = prevProgress ? prevProgress.box : 0;
  const box = rating === 0 ? 0 : Math.min(BOX_DAYS.length - 1, curBox + rating);
  const due = rating === 0 ? now + 10 * 60000 : now + BOX_DAYS[box] * DAY;
  const baseGained = rating === 0 ? 0 : (rating === 1 ? 10 : 15) + Math.min(req.user.streak, 10) * 2;
  const streak = rating === 0 ? 0 : req.user.streak + 1;
  const ok = rating === 0 ? 0 : 1;

  // Daily study streak calculation
  const yesterday = prevDayIso(day);
  let dayStreak = prevUser.dayStreak;
  if (prevUser.lastStudyDay === day) {
    dayStreak = Math.max(1, dayStreak);
  } else if (prevUser.lastStudyDay === yesterday) {
    dayStreak = dayStreak + 1;
  } else {
    dayStreak = 1;
  }
  const bestDayStreak = Math.max(prevUser.bestDayStreak, dayStreak);

  const nextReviews = (prevDaily?.reviews || 0) + 1;
  const nextNewWords = (prevDaily?.new_words || 0) + (isFirstReview ? 1 : 0);
  const wasGoalMet = Boolean(prevDaily?.goal_met);
  const isGoalMetNow = wasGoalMet || (nextNewWords >= req.user.daily_new_goal && nextReviews >= req.user.daily_review_goal);
  const dailyGoalJustMet = !wasGoalMet && isGoalMetNow;
  const gained = baseGained + (dailyGoalJustMet ? DAILY_GOAL_BONUS : 0);

  db.transaction(() => {
    db.prepare(`
      INSERT INTO progress(user_id,word_id,box,due,correct,wrong) VALUES(?,?,?,?,?,?)
      ON CONFLICT(user_id,word_id) DO UPDATE SET box=?, due=?, correct=correct+?, wrong=wrong+?
    `).run(uid, wordId, box, due, ok, 1 - ok, box, due, ok, 1 - ok);

    db.prepare(`
      UPDATE users
      SET score=score+?, streak=?, best_streak=MAX(best_streak,?),
          day_streak=?, best_day_streak=?, last_study_day=?
      WHERE id=?
    `).run(gained, streak, streak, dayStreak, bestDayStreak, day, uid);

    db.prepare(`
      INSERT INTO daily(user_id, day, reviews, correct, new_words, goal_met)
      VALUES(?, ?, 1, ?, ?, ?)
      ON CONFLICT(user_id, day) DO UPDATE SET
        reviews = reviews + 1,
        correct = correct + ?,
        new_words = new_words + ?,
        goal_met = MAX(goal_met, ?)
    `).run(
      uid, day, ok, isFirstReview ? 1 : 0, isGoalMetNow ? 1 : 0,
      ok, isFirstReview ? 1 : 0, isGoalMetNow ? 1 : 0
    );
  })();

  res.json({
    gained,
    dailyGoalJustMet,
    undoToken: { wordId, day, ok, isFirstReview, prevProgress, prevDaily, prevUser },
    stats: getStats(uid),
  });
});

app.post('/api/review/undo', auth, (req, res) => {
  const { wordId, day, ok, isFirstReview, prevProgress, prevDaily, prevUser } = req.body || {};
  if (!Number.isInteger(wordId) || !prevUser) return res.status(400).json({ error: 'Invalid undo payload' });
  const uid = req.user.id;
  db.transaction(() => {
    if (prevProgress) {
      db.prepare('UPDATE progress SET box=?, due=?, correct=?, wrong=? WHERE user_id=? AND word_id=?')
        .run(prevProgress.box, prevProgress.due, prevProgress.correct, prevProgress.wrong, uid, wordId);
    } else {
      db.prepare('DELETE FROM progress WHERE user_id=? AND word_id=?').run(uid, wordId);
    }
    db.prepare(`
      UPDATE users
      SET score=?, streak=?, best_streak=?,
          day_streak=COALESCE(?, day_streak),
          best_day_streak=COALESCE(?, best_day_streak),
          last_study_day=?
      WHERE id=?
    `).run(
      prevUser.score,
      prevUser.streak,
      prevUser.bestStreak,
      prevUser.dayStreak ?? null,
      prevUser.bestDayStreak ?? null,
      prevUser.lastStudyDay ?? null,
      uid
    );
    if (day) {
      if (prevDaily) {
        db.prepare('UPDATE daily SET reviews=?, correct=?, new_words=?, goal_met=? WHERE user_id=? AND day=?')
          .run(prevDaily.reviews, prevDaily.correct, prevDaily.new_words, prevDaily.goal_met, uid, day);
      } else {
        db.prepare('UPDATE daily SET reviews=MAX(0,reviews-1), correct=MAX(0,correct-?), new_words=MAX(0,new_words-?) WHERE user_id=? AND day=?')
          .run(ok ? 1 : 0, isFirstReview ? 1 : 0, uid, day);
      }
    }
  })();
  res.json({ stats: getStats(uid) });
});

db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
startImport();
if (require.main === module) {
  app.listen(process.env.PORT || 3000, () => console.log('Listening on :' + (process.env.PORT || 3000)));
}

module.exports = app;