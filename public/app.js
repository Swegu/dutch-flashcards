const T = {
  login: 'Log in', register: 'Create account', username: 'Username', password: 'Password (min. 8 characters)',
  logout: 'Log out', show: 'Show answer', again: 'Again', good: 'Good', easy: 'Easy', score: 'Score', streak: 'Streak',
  dayStreak: 'Day streak', answerStreak: 'Answer streak',
  best: 'Best streak', learned: 'Words started', mastered: 'Mastered', accuracy: 'Accuracy', today: 'Today', due: 'Due now',
  dehetAccuracy: 'de / het Accuracy',
  last7: 'Last 7 days (click a day to inspect words)', noCards: 'No cards match these filters.', stats: 'Progress Overview', newWord: '🌱 New', loading: 'Loading…',
  importing: 'Preparing the Dutch dictionary…', retry: 'Retry',
  source: 'Source', rank: 'frequency rank', unranked: 'Curriculum / Wiktionary',
  haveAccount: 'Already have an account? Log in', noAccount: 'No account yet? Create one', err: 'Something went wrong',
  formOf: 'Form of', forms: 'Inflected forms', shuffleOn: '🎲 Shuffle', shuffleOff: '📋 Order',
  report: 'Report wrong', reportTitle: 'Report incorrect card', reportHint: 'Why is this card wrong? (optional)',
  reportPlaceholder: 'e.g. wrong translation, typo, broken inflection…', sendReport: 'Report & Skip', cancel: 'Cancel',
  reportedToast: 'Card reported and hidden from your queue.', reviewReports: 'Flagged cards',
  noReports: 'No flagged cards waiting for review.', skipEveryone: 'Skip for everyone', keepWord: 'Dismiss flag',
  skippedGlobalToast: 'Skipped for all users.', dismissedToast: 'Flag dismissed.',
  conflictWarn: 'Sources disagree on meaning — verify on Wiktionary:',
  wiktionaryLabel: 'Wiktionary', freedictLabel: 'FreeDict',
  searchPlaceholder: 'Search Dutch or English… ( / )', undo: 'Undo', undoneToast: 'Last rating undone.',
  dailyPattern: 'Daily Learn Pattern',
  modeDaily: '📅 Daily Plan', modeFree: '♾️ Free Practice',
  practiceFlashcard: '🃏 Flashcards', practiceType: '⌨️ Type Word',
  dehetFilter: '🏷️ de/het Nouns',
  stepNew: '🌱 New words', stepReviews: '🔄 Reviews', stepGoal: '🎯 Today',
  goalCompleteBadge: '✓ Daily goal met',
  planSettings: '⚙️ Plan',
  inspectWordsBtn: '📋 Words',
  inspectCompletedBtn: '📋 Inspect Completed Words',
  dailyWordsTitle: 'Completed Words',
  noDailyWords: 'No words completed on this day yet.',
  filterAll: 'All', filterNew: '🌱 New', filterReviewed: '🔄 Reviewed',
  openCard: 'Practice card',
  paceLight: '🐢 Casual (5 / 15)', paceRegular: '🚶 Regular (10 / 30)', paceIntensive: '🚀 Intensive (20 / 60)',
  newPerDay: 'New words / day', reviewsPerDay: 'Total reviews / day', targetLevelLabel: 'Difficulty level',
  savePlan: 'Save daily plan', planSavedToast: 'Daily learning plan updated.',
  dailyGoalToast: '🎉 Daily learn pattern complete! (+50 bonus)',
  dailyDoneTitle: '🎉 Daily Learn Pattern Complete!',
  dailyDoneDesc: 'You finished today’s structured session of new level-matched words and spaced-repetition reviews.',
  continueExtra: '➕ Continue Extra Practice', adjustPlan: '⚙️ Adjust Daily Goal',
  stageDue: '🔄 Due review', stageConsolidate: '🧠 Consolidate', boxLabel: 'Box',
  levelsTitle: 'CEFR Language Levels',
  themasTitle: 'De Opmaat Thema’s (1–9)',
  themaAll: 'All Thema’s',
  studyThema: '▶ Study Thema',
  viewWords: '📖 Word List',
  hideWords: 'Hide List',
  typePromptHint: 'Translate into Dutch',
  typePlaceholder: 'Type Dutch word…',
  checkAnswer: 'Check (Enter)',
  hintBtn: '💡 Hint',
  retryTypeBtn: '↺ Try typing again',
  chooseArticlePrompt: 'Which article?',
  orFlip: 'or flip card',
  levels: {
    auto: '🎓 Auto Level',
    all: 'All levels',
    A1: 'A1 · Beginner',
    A2: 'A2 · Elementary',
    B1: 'B1 · Intermediate',
    B2: 'B2 · Upper-Int.',
    C1: 'C1 · Advanced',
    C2: 'C2 · Mastery',
  },
  topics: {
    all: 'All dict. topics',
    food: '🍽️ Food & Drink',
    travel: '🚆 Travel & Transport',
    home: '🏠 Home & Daily',
    work: '💼 Work & Money',
    health: '🩺 Body & Health',
  },
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let tab = localStorage.tab || 'study';
let topic = localStorage.topic || 'all';
let thema = localStorage.thema || 'all';
let level = localStorage.level || 'auto';
let dehetOnly = localStorage.dehetOnly === '1';
let practiceMode = localStorage.practiceMode === 'type' ? 'type' : 'flashcard';
let studyMode = localStorage.studyMode === 'free' ? 'free' : 'daily';
let extraPractice = false;
let editingPlan = false;
let shuffle = localStorage.shuffle !== '0';

let stats, queue = [], card = null, flipped = false, gain = 0, mode = 'login', authErr = '';
let reporting = false, showingReports = false, reportsList = [];
let dailyWordsDay = '', dailyWordsList = [], dailyWordsFilter = 'all', dailyWordsLoaded = false;
let inspectThemaSlug = '', inspectThemaData = null, themaSearch = '', themaArtFilter = 'all';
let searchQuery = '', searchResults = [], searchTimer = null;
let lastUndo = null, lastReviewedCard = null, toastTimer = null;

// Per-card interactive state (article quiz & typing mode)
let cardDehetGuess = null; // null | 'correct' | 'wrong'
let cardGuessedArt = null; // null | 'de' | 'het'
let typeArticle = null;    // null | 'de' | 'het'
let typeText = '';
let typeHintStep = 0;
let typeResult = null;     // null | { status: 'perfect'|'article_wrong'|'word_wrong', wordCorrect, articleStatus, expectedFull, typedDisplay }

const t = k => T[k];
const view = html => { $('#app').innerHTML = html; };

function resetCardInteraction() {
  cardDehetGuess = null;
  cardGuessedArt = null;
  typeArticle = null;
  typeText = '';
  typeHintStep = 0;
  typeResult = null;
}

function showToast(msg, withUndo = false) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${withUndo ? ` <button class="toast-btn" data-act="undo">${t('undo')}</button>` : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, withUndo ? 5500 : 3000);
}

async function api(path, body) {
  const r = await fetch('/api/' + path, body === undefined ? {} :
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || t('err')), { status: r.status });
  return j;
}

async function boot() {
  $('#logout').textContent = t('logout');
  const s = await api('status');
  if (!s.ready && s.state === 'error') {
    return view(`<div class="panel"><p class="err">${esc(s.message)}</p><button data-act="retry">${t('retry')}</button></div>`);
  }
  if (!s.ready) {
    view(`<div class="panel"><p>${t('importing')}</p><p class="muted">${esc(s.message)}</p></div>`);
    return setTimeout(boot, 3000);
  }
  try { await api('me'); await start(); }
  catch (e) { e.status === 401 ? renderAuth() : view(`<p class="err">${esc(e.message)}</p>`); }
}

function updateHeaderBadges() {
  if (!stats) return;
  const repBtn = $('#reports-btn');
  repBtn.hidden = false;
  $('#reports-count').textContent = stats.openReports || 0;
  repBtn.classList.toggle('has-reports', (stats.openReports || 0) > 0);
  const tabsEl = $('#main-tabs');
  if (tabsEl) {
    tabsEl.hidden = false;
    tabsEl.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
  }
}

async function start() {
  stats = await api('stats');
  if (stats.dailyPlan?.targetLevel) {
    level = localStorage.level = stats.dailyPlan.targetLevel;
  }
  queue = []; card = null; showingReports = false; reporting = false; editingPlan = false; extraPractice = false;
  dailyWordsLoaded = false;
  resetCardInteraction();
  $('#logout').hidden = false;
  updateHeaderBadges();
  if (tab === 'progress') await loadDailyWords('');
  await next();
}

async function fill() {
  if (studyMode === 'daily' && !extraPractice && stats?.dailyPlan?.goalMet) return;
  const exclude = [card, ...queue].filter(Boolean).map(c => c.id);
  const qs = new URLSearchParams({
    limit: '10',
    exclude: exclude.join(','),
    topic,
    thema,
    dehet: dehetOnly ? '1' : '0',
    level,
    mode: studyMode,
    extra: extraPractice ? '1' : '0',
    shuffle: shuffle ? '1' : '0',
  });
  queue.push(...await api(`cards?${qs}`));
}

async function next() {
  if (studyMode === 'daily' && !extraPractice && stats?.dailyPlan?.goalMet) {
    queue = [];
    card = null;
    flipped = false;
    reporting = false;
    resetCardInteraction();
    render();
    return;
  }
  if (queue.length < 3) await fill().catch(() => {});
  card = queue.shift() || null;
  flipped = false;
  reporting = false;
  resetCardInteraction();
  render();
  if (practiceMode === 'type' && tab === 'study' && card) {
    setTimeout(() => $('#type-input')?.focus(), 10);
  }
  if (queue.length < 3) fill().catch(() => {});
}

async function jumpToWord(wordStr) {
  try {
    const found = await api(`word/${encodeURIComponent(wordStr)}`);
    if (card) queue.unshift(card);
    card = found;
    flipped = false;
    reporting = false;
    showingReports = false;
    resetCardInteraction();
    tab = localStorage.tab = 'study';
    searchQuery = '';
    searchResults = [];
    updateHeaderBadges();
    render();
    if (practiceMode === 'type') setTimeout(() => $('#type-input')?.focus(), 10);
  } catch (e) {
    showToast(e.message);
  }
}

function flip() {
  if (!card || flipped || reporting) return;
  flipped = true;
  render();
}

function guessArticle(chosen) {
  if (!card || !card.article || flipped || reporting) return;
  cardGuessedArt = chosen;
  const expected = card.article === 'het, de' ? ['de', 'het'] : [card.article];
  cardDehetGuess = expected.includes(chosen) ? 'correct' : 'wrong';
  flipped = true;
  render();
}

// ---------- Smart Forgiving Typing Evaluator ----------
function normStr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function buildAcceptableCandidates(rawWord) {
  const out = new Set();
  const w = normStr(rawWord);
  out.add(w);

  // Strip parenthetical note e.g. "aanmelden (zich)" -> "aanmelden"
  const noParens = normStr(w.replace(/\([^)]*\)/g, ''));
  if (noParens) out.add(noParens);

  // Also allow inline optional suffixes like "motor(fiets)" -> "motorfiets" & "welk(e)" -> "welke"
  const joinedParens = normStr(w.replace(/[()]/g, ''));
  if (joinedParens) out.add(joinedParens);

  // Reflexive "zich aanmelden" if "(zich)" is present
  if (/\(zich\)/i.test(w) && noParens) {
    out.add(`zich ${noParens}`);
    out.add(`${noParens} zich`);
  }

  // Split slash alternatives e.g. "je/ jij", "tablet/ i-pad", "net / netjes"
  for (const variant of [...out]) {
    if (variant.includes('/')) {
      for (const part of variant.split('/')) {
        const clean = normStr(part);
        if (clean) out.add(clean);
      }
    }
  }

  // Handle "door … gaan" -> "doorgaan" and "door gaan"
  if (w.includes('...')) {
    const collapsed = normStr(noParens.replace(/\s*\.\.\.\s*/g, ''));
    const spaced = normStr(noParens.replace(/\s*\.\.\.\s*/g, ' '));
    if (collapsed) out.add(collapsed);
    if (spaced) out.add(spaced);
  }

  // Strip trailing punctuation like "!"
  for (const v of [...out]) {
    const noPunct = normStr(v.replace(/[!?.,]+$/g, ''));
    if (noPunct) out.add(noPunct);
  }

  return [...out];
}

function evaluateTypedAnswer(c, selArt, rawInput) {
  let typed = normStr(rawInput);
  let chosenArt = selArt;

  // Detect inline typed article ("het huis" or "de auto")
  const artMatch = /^(de|het)\s+(.+)$/i.exec(typed);
  if (artMatch && c.article && normStr(c.word) !== typed) {
    if (!chosenArt) chosenArt = artMatch[1].toLowerCase();
    typed = normStr(artMatch[2]);
  }

  const candidates = buildAcceptableCandidates(c.word);
  const typedPlain = stripAccents(typed);
  const wordCorrect = candidates.some(cand => cand === typed || stripAccents(cand) === typedPlain);

  let articleStatus = 'none';
  if (c.article) {
    const acceptableArts = c.article === 'het, de' ? ['de', 'het'] : [c.article];
    if (!chosenArt) articleStatus = 'missing';
    else if (acceptableArts.includes(chosenArt)) articleStatus = 'correct';
    else articleStatus = 'wrong';
  }

  let status = 'word_wrong';
  if (wordCorrect && (articleStatus === 'none' || articleStatus === 'correct')) {
    status = 'perfect';
  } else if (wordCorrect) {
    status = 'article_wrong';
  }

  const expectedFull = c.article ? `${c.article} ${c.word}` : c.word;
  const typedDisplay = (chosenArt ? `${chosenArt} ` : '') + (typed || '—');

  return {
    status,
    wordCorrect,
    articleStatus,
    chosenArt,
    expectedFull,
    typedDisplay,
  };
}

function submitTypedAnswer() {
  if (!card || flipped || reporting) return;
  const inp = $('#type-input');
  const raw = inp ? inp.value : typeText;
  typeText = raw;

  const res = evaluateTypedAnswer(card, typeArticle, raw);
  typeResult = res;
  if (res.chosenArt) cardGuessedArt = res.chosenArt;
  if (card.article) {
    cardDehetGuess = res.articleStatus === 'correct' ? 'correct' : 'wrong';
  }
  flipped = true;
  render();
}

function buildHintText(c, step) {
  const clean = normStr(c.word.replace(/\([^)]*\)/g, '')).split('/')[0].trim() || c.word;
  const artHint = c.article ? `${c.article.includes(',') ? 'de/het' : c.article} ` : '';
  const revealChars = Math.min(clean.length - 1, step <= 1 ? 1 : Math.max(2, Math.ceil(clean.length * 0.4)));
  const masked = clean.split('').map((ch, idx) => {
    if (ch === ' ' || ch === '-') return ch;
    return idx < revealChars ? ch : '_';
  }).join(' ');
  return `${step >= 2 ? artHint : ''}${masked} (${clean.replace(/\s+/g, '').length} letters)`;
}

async function rate(r) {
  if (!flipped || !card) return;
  const c = card;
  try {
    const res = await api('review', {
      wordId: c.id,
      rating: r,
      dehetGuess: cardDehetGuess,
    });
    stats = res.stats;
    gain = res.gained;
    lastUndo = res.undoToken;
    lastReviewedCard = c;
    dailyWordsLoaded = false;
    updateHeaderBadges();
    if (r === 0) {
      c.isNew = false;
      c.stage = 'due';
      queue.splice(Math.min(3, queue.length), 0, c);
    }
    if (res.dailyGoalJustMet) {
      showToast(t('dailyGoalToast'), true);
    } else {
      showToast(`${t(['again', 'good', 'easy'][r])}${gain ? ` (+${gain})` : ''}`, true);
    }
  } catch (e) {
    return view(`<p class="err">${esc(e.message)}</p>`);
  }
  await next();
  gain = 0;
}

async function undoLast() {
  if (!lastUndo || !lastReviewedCard) return;
  try {
    const res = await api('review/undo', lastUndo);
    stats = res.stats;
    if (card) queue.unshift(card);
    card = lastReviewedCard;
    flipped = true;
    resetCardInteraction();
    lastUndo = null;
    lastReviewedCard = null;
    dailyWordsLoaded = false;
    tab = localStorage.tab = 'study';
    updateHeaderBadges();
    render();
    showToast(t('undoneToast'));
  } catch (e) {
    showToast(e.message);
  }
}

async function saveDailySettings(newGoal, revGoal, targetLvl) {
  try {
    const res = await api('settings', {
      dailyNewGoal: newGoal,
      dailyReviewGoal: revGoal,
      targetLevel: targetLvl,
    });
    stats = res.stats;
    level = localStorage.level = stats.dailyPlan.targetLevel;
    editingPlan = false;
    extraPractice = false;
    queue = [];
    card = null;
    showToast(t('planSavedToast'));
    await next();
  } catch (e) {
    showToast(e.message);
  }
}

async function loadDailyWords(day = '') {
  try {
    const qs = day ? `?day=${encodeURIComponent(day)}` : '';
    const res = await api(`daily-words${qs}`);
    dailyWordsDay = res.day;
    dailyWordsList = res.words || [];
    dailyWordsLoaded = true;
  } catch {
    dailyWordsList = [];
  }
}

async function openThemaWordList(slug) {
  if (inspectThemaSlug === slug) {
    inspectThemaSlug = '';
    inspectThemaData = null;
    render();
    return;
  }
  inspectThemaSlug = slug;
  inspectThemaData = null;
  themaSearch = '';
  themaArtFilter = 'all';
  render();
  try {
    inspectThemaData = await api(`thema/${encodeURIComponent(slug)}/words`);
  } catch {
    inspectThemaData = { words: [] };
  }
  render();
}

async function submitReport(reason) {
  if (!card) return;
  const reportedId = card.id;
  try {
    const res = await api('report', { wordId: reportedId, reason });
    stats = res.stats;
    queue = queue.filter(x => x.id !== reportedId);
    updateHeaderBadges();
    showToast(t('reportedToast'));
    await next();
  } catch (e) {
    showToast(e.message);
  }
}

async function openReportsView() {
  showingReports = true;
  tab = localStorage.tab = 'study';
  updateHeaderBadges();
  render();
  try {
    reportsList = await api('reports');
  } catch {
    reportsList = [];
  }
  render();
}

async function resolveReport(wordId, action) {
  try {
    const res = await api(`reports/${wordId}/resolve`, { action });
    stats = res.stats;
    reportsList = reportsList.filter(r => r.id !== wordId);
    updateHeaderBadges();
    render();
    showToast(t(action === 'skip_all' ? 'skippedGlobalToast' : 'dismissedToast'));
  } catch (e) {
    showToast(e.message);
  }
}

function articleClass(art) {
  if (!art) return '';
  if (art.includes(',')) return 'art-both';
  return art === 'het' ? 'art-het' : 'art-de';
}

function articlePillHtml(art) {
  if (!art) return '';
  return `<span class="art-pill ${articleClass(art)}">${esc(art)}</span>`;
}

function dailyStripHtml() {
  const dp = stats.dailyPlan;
  if (!dp) return '';
  const activeLvlLabel = dp.targetLevel === 'auto'
    ? `${t('levels').auto} (${dp.autoLevel})`
    : (t('levels')[dp.targetLevel] || dp.targetLevel);
  const todayAcc = dp.reviewsToday ? Math.round((dp.correctToday / dp.reviewsToday) * 100) : 100;
  const completedCount = dp.completedWordsToday ?? dp.newToday ?? 0;

  const settingsDrawer = editingPlan ? `
    <div class="plan-drawer">
      <div class="pace-presets">
        <button type="button" class="${dp.dailyNewGoal === 5 && dp.dailyReviewGoal === 15 ? 'active' : ''}" data-act="preset-pace" data-new="5" data-rev="15">${t('paceLight')}</button>
        <button type="button" class="${dp.dailyNewGoal === 10 && dp.dailyReviewGoal === 30 ? 'active' : ''}" data-act="preset-pace" data-new="10" data-rev="30">${t('paceRegular')}</button>
        <button type="button" class="${dp.dailyNewGoal === 20 && dp.dailyReviewGoal === 60 ? 'active' : ''}" data-act="preset-pace" data-new="20" data-rev="60">${t('paceIntensive')}</button>
      </div>
      <div class="plan-grid">
        <label>
          <span>${t('newPerDay')}</span>
          <input id="plan-new" type="number" min="1" max="100" value="${dp.dailyNewGoal}">
        </label>
        <label>
          <span>${t('reviewsPerDay')}</span>
          <input id="plan-rev" type="number" min="5" max="500" value="${dp.dailyReviewGoal}">
        </label>
        <label>
          <span>${t('targetLevelLabel')}</span>
          <select id="plan-level">
            ${Object.entries(t('levels')).map(([k, lbl]) => `
              <option value="${k}"${dp.targetLevel === k ? ' selected' : ''}>${esc(k === 'auto' ? `${lbl} (${dp.autoLevel})` : lbl)}</option>
            `).join('')}
          </select>
        </label>
      </div>
      <div class="row-actions">
        <button type="button" class="primary" data-act="save-plan">${t('savePlan')}</button>
        <button type="button" data-act="toggle-plan">${t('cancel')}</button>
      </div>
    </div>` : '';

  return `<section class="panel daily-panel ${dp.goalMet ? 'goal-met' : ''}">
    <div class="daily-head">
      <div class="daily-title-wrap">
        <h2>${t('dailyPattern')}</h2>
        <span class="pill level-badge level-${esc(dp.activeLevel === 'all' ? 'A1' : dp.activeLevel)}">${esc(activeLvlLabel)}</span>
        <span class="mini-kpi" title="${t('dayStreak')}">🔥 ${stats.dayStreak || 0}d</span>
        <span class="mini-kpi" title="${t('due')}">⏰ ${stats.dueNow}</span>
        <span class="mini-kpi" title="${t('score')}">⭐ ${stats.score}</span>
      </div>
      <div class="daily-actions">
        <button type="button" data-act="inspect-today-words">${t('inspectWordsBtn')} (${completedCount})</button>
        <button type="button" class="${studyMode === 'daily' ? 'active' : ''}" data-act="toggle-study-mode">
          ${t(studyMode === 'daily' ? 'modeDaily' : 'modeFree')}
        </button>
        <button type="button" class="${editingPlan ? 'active' : ''}" data-act="toggle-plan">${t('planSettings')}</button>
      </div>
    </div>
    <div class="pattern-steps">
      <div class="pattern-step ${dp.newToday >= dp.dailyNewGoal ? 'done' : ''}">
        <div class="step-top">
          <span>${t('stepNew')}</span>
          <b>${dp.newToday}/${dp.dailyNewGoal}</b>
        </div>
        <div class="mini-bar"><i style="width:${dp.newProgressPct}%"></i></div>
      </div>
      <div class="pattern-step ${dp.reviewsToday >= dp.dailyReviewGoal ? 'done' : ''}">
        <div class="step-top">
          <span>${t('stepReviews')}</span>
          <b>${dp.reviewsToday}/${dp.dailyReviewGoal}</b>
        </div>
        <div class="mini-bar"><i style="width:${dp.reviewProgressPct}%"></i></div>
      </div>
      <div class="pattern-step ${dp.goalMet ? 'done' : ''}">
        <div class="step-top">
          <span>${t('stepGoal')}</span>
          <b>${dp.goalMet ? t('goalCompleteBadge') : `${todayAcc}%`}</b>
        </div>
        <div class="mini-bar"><i style="width:${dp.goalMet ? 100 : Math.round((dp.newProgressPct + dp.reviewProgressPct) / 2)}%"></i></div>
      </div>
    </div>
    ${settingsDrawer}
  </section>`;
}

function controlsHtml() {
  const dp = stats.dailyPlan;
  const themaList = stats.themas || [];
  const themaOpts = `<option value="all"${thema === 'all' ? ' selected' : ''}>📚 ${esc(t('themaAll'))}</option>` +
    themaList.map(th => `<option value="${esc(th.slug)}"${thema === th.slug ? ' selected' : ''}>${esc(th.icon)} ${esc(th.title)} (${th.total})</option>`).join('');

  const levelOpts = Object.entries(t('levels'))
    .map(([k, label]) => {
      const text = k === 'auto' && dp?.autoLevel ? `${label} (${dp.autoLevel})` : label;
      return `<option value="${k}"${level === k ? ' selected' : ''}>${esc(text)}</option>`;
    })
    .join('');

  const topicOpts = Object.entries(t('topics'))
    .map(([k, label]) => `<option value="${k}"${topic === k ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');

  return `<section class="controls-bar">
    <div class="controls-row">
      <div class="segmented" role="group" aria-label="Practice mode">
        <button type="button" class="${practiceMode === 'flashcard' ? 'active' : ''}" data-act="set-practice-mode" data-mode="flashcard">${t('practiceFlashcard')}</button>
        <button type="button" class="${practiceMode === 'type' ? 'active' : ''}" data-act="set-practice-mode" data-mode="type">${t('practiceType')}</button>
      </div>
      <button type="button" class="toggle-chip ${dehetOnly ? 'active-dehet' : ''}" data-act="toggle-dehet">${t('dehetFilter')}</button>
      <button type="button" id="shuffle-toggle" class="toggle-chip ${shuffle ? 'active' : ''}" data-act="toggle-shuffle">${t(shuffle ? 'shuffleOn' : 'shuffleOff')}</button>
      <div class="search-wrap">
        <input id="search-input" type="search" value="${esc(searchQuery)}" placeholder="${t('searchPlaceholder')}" autocomplete="off">
        ${searchResults.length ? `<div class="search-drop">${searchResults.map(r => `
          <button type="button" class="search-item" data-act="jump" data-word="${esc(r.word)}">
            <div>
              <span class="pill level-badge level-${esc(r.level || 'C2')}">${esc(r.level || 'C2')}</span>
              ${r.article ? articlePillHtml(r.article) : ''}
              <b>${esc(r.word)}</b>
            </div>
            <span>${esc(r.glosses.slice(0, 2).join('; '))}</span>
          </button>`).join('')}</div>` : ''}
      </div>
    </div>
    <div class="controls-row filters-row">
      <select id="thema-select" aria-label="Thema">${themaOpts}</select>
      <select id="level-select" aria-label="Difficulty level">${levelOpts}</select>
      <select id="topic-select" aria-label="Topic">${topicOpts}</select>
    </div>
  </section>`;
}

function dailyDoneHtml() {
  const dp = stats.dailyPlan;
  const todayAcc = dp.reviewsToday ? Math.round((dp.correctToday / dp.reviewsToday) * 100) : 100;
  const completedCount = dp.completedWordsToday ?? dp.newToday ?? 0;
  return `<section class="panel daily-done">
    <h2>${t('dailyDoneTitle')}</h2>
    <p class="muted">${t('dailyDoneDesc')}</p>
    <div class="done-metrics">
      <div><b>${dp.newToday}/${dp.dailyNewGoal}</b><span>${t('stepNew')}</span></div>
      <div><b>${dp.reviewsToday}/${dp.dailyReviewGoal}</b><span>${t('stepReviews')}</span></div>
      <div><b>${todayAcc}%</b><span>${t('accuracy')}</span></div>
      <div><b>🔥 ${stats.dayStreak}</b><span>${t('dayStreak')}</span></div>
    </div>
    <div class="row-actions center-actions">
      <button type="button" class="primary" data-act="extra-practice">${t('continueExtra')}</button>
      <button type="button" data-act="inspect-today-words">${t('inspectCompletedBtn')} (${completedCount})</button>
      <button type="button" data-act="toggle-plan">${t('adjustPlan')}</button>
    </div>
  </section>`;
}

function cardBadgesHtml(c) {
  const themaMap = new Map((stats.themas || []).map(th => [th.slug, th]));
  const themaBadges = (c.themas || []).slice(0, 2).map(slug => {
    const meta = themaMap.get(slug);
    return `<span class="pill thema-pill">${esc(meta ? `${meta.icon} Thema ${meta.num}` : slug)}</span>`;
  }).join('');
  const topicBadges = (c.topics || [])
    .map(tp => `<span class="pill topic-pill">${esc(t('topics')[tp] || tp)}</span>`)
    .join('');
  const stageBadge = c.isNew || c.stage === 'new'
    ? `<span class="tag">${t('newWord')}</span>`
    : (c.stage === 'consolidate'
      ? `<span class="pill stage-pill">${t('stageConsolidate')} · ${t('boxLabel')} ${c.box}</span>`
      : `<span class="pill stage-pill">${t('stageDue')} · ${t('boxLabel')} ${c.box}</span>`);
  const levelBadge = `<span class="pill level-badge level-${esc(c.level || 'C2')}">${esc(c.level || 'C2')}</span>`;
  return `${levelBadge}${stageBadge}${themaBadges}${topicBadges}`;
}

function cardBackDetailsHtml(c) {
  const rankLabel = c.rank ? `${t('rank')} #${c.rank}` : t('unranked');
  const conflictHtml = c.meaningConflict && c.altGlosses?.length ? `
    <div class="warn-box">
      <strong>⚠️ ${t('conflictWarn')}</strong>
      <div><b>${t('wiktionaryLabel')}:</b> ${c.glosses.map(esc).join('; ')}</div>
      <div><b>${t('freedictLabel')}:</b> ${c.altGlosses.map(esc).join('; ')}</div>
    </div>` : '';

  const formsHtml = c.forms?.length ? `
    <div class="forms-box">
      <span class="muted">${t('forms')}:</span>
      ${c.forms.map(f => `<span class="pill form-pill" title="${esc(f.gloss)}">${esc(f.word)}</span>`).join('')}
    </div>` : '';

  return `
    ${conflictHtml}
    ${formsHtml}
    ${c.exampleNl ? `<div class="ex"><i>${esc(c.exampleNl)}</i><br>${esc(c.exampleEn || '')}</div>` : ''}
    <div class="src">
      ${t('source')}: <a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">Wiktionary ↗</a>
      · ${rankLabel}
    </div>`;
}

function ratingButtonsHtml(suggestedRating = null) {
  return `<div class="rate">${[['again', 0], ['good', 1], ['easy', 2]]
    .map(([k, r]) => `<button type="button" class="${suggestedRating === r ? 'suggested-rate' : ''}" data-act="rate" data-r="${r}">${t(k)} <small>${r + 1}</small></button>`).join('')}</div>`;
}

function cardHtml() {
  const c = card;
  const reportModal = reporting ? `
    <div class="report-box" data-stop="1">
      <h3>${t('reportTitle')}: <b>${esc(c.word)}</b></h3>
      <p class="muted">${t('reportHint')}</p>
      <input id="report-reason" placeholder="${t('reportPlaceholder')}" maxlength="200">
      <div class="row-actions">
        <button type="button" class="danger" data-act="send-report">${t('sendReport')}</button>
        <button type="button" data-act="cancel-report">${t('cancel')}</button>
      </div>
    </div>` : '';

  if (practiceMode === 'type') {
    let typeContent = '';
    let suggested = null;

    if (reporting) {
      typeContent = reportModal;
    } else if (!flipped) {
      const hintLine = typeHintStep > 0
        ? `<div class="hint-box">💡 ${esc(buildHintText(c, typeHintStep))}</div>`
        : '';

      const artControls = c.article ? `
        <div class="art-picker" role="group" aria-label="Choose article">
          <button type="button" class="art-btn art-de ${typeArticle === 'de' ? 'selected' : ''}" data-act="pick-type-art" data-art="de">de</button>
          <button type="button" class="art-btn art-het ${typeArticle === 'het' ? 'selected' : ''}" data-act="pick-type-art" data-art="het">het</button>
        </div>` : '';

      typeContent = `
        <div class="type-prompt-label muted">${t('typePromptHint')} ${c.article ? '· <strong class="dehet-callout">include de / het</strong>' : ''}</div>
        <div class="tr prompt-gloss">${c.glosses.map(esc).join('; ')}</div>
        <div class="meta">${esc(c.pos || '')}</div>
        ${hintLine}
        <form id="type-form" class="type-form" data-stop="1">
          <div class="type-input-row">
            ${artControls}
            <input id="type-input" type="text" value="${esc(typeText)}" placeholder="${t('typePlaceholder')}" autocomplete="off" autocapitalize="none" spellcheck="false">
          </div>
          <div class="row-actions center-actions">
            <button type="submit" class="primary">${t('checkAnswer')}</button>
            <button type="button" data-act="type-hint">${t('hintBtn')}</button>
            <button type="button" data-act="flip">${t('show')}</button>
          </div>
        </form>`;
    } else {
      let bannerHtml = '';
      if (typeResult) {
        if (typeResult.status === 'perfect') {
          suggested = 1;
          bannerHtml = `<div class="type-feedback ok">✓ Perfect! <b>${esc(typeResult.expectedFull)}</b></div>`;
        } else if (typeResult.status === 'article_wrong') {
          suggested = 0;
          const artDisp = c.article.toUpperCase();
          bannerHtml = `<div class="type-feedback warn">⚠️ Spelling is right, but the article is <b>${esc(artDisp)}</b> ${esc(c.word)} ${typeResult.chosenArt ? `(you chose <i>${esc(typeResult.chosenArt)}</i>)` : '(no article chosen)'}</div>`;
        } else {
          suggested = 0;
          bannerHtml = `<div class="type-feedback bad">✗ You typed: <code>${esc(typeResult.typedDisplay)}</code> → Answer: <b>${esc(typeResult.expectedFull)}</b></div>`;
        }
      }

      typeContent = `
        ${bannerHtml}
        <div class="word">
          ${c.article ? `${articlePillHtml(c.article)} ` : ''}${esc(c.word)}
        </div>
        <div class="meta">${esc(c.pos || '')} ${esc(c.ipa || '')}</div>
        <div class="tr">${c.glosses.map(esc).join('; ')}</div>
        ${cardBackDetailsHtml(c)}
        ${typeResult && typeResult.status !== 'perfect' ? `<div class="retry-type-wrap"><button type="button" class="small-btn" data-act="retry-type">${t('retryTypeBtn')}</button></div>` : ''}`;
    }

    return `
      <div class="card card-type">
        <div class="card-top">
          <div class="badges">${cardBadgesHtml(c)}</div>
          <div class="card-actions">
            ${gain ? `<span class="gain">+${gain}</span>` : ''}
            <button type="button" class="icon report-btn" data-act="open-report" title="${t('report')}">🚩</button>
          </div>
        </div>
        ${c.lemma ? `<div class="lemma-link">${t('formOf')} <a data-act="jump" data-word="${esc(c.lemma)}">${esc(c.lemma)}</a></div>` : ''}
        ${typeContent}
      </div>
      ${flipped && !reporting ? ratingButtonsHtml(suggested) : ''}`;
  }

  // Flashcard mode
  let frontQuiz = '';
  if (!flipped && !reporting) {
    frontQuiz = c.article ? `
      <div class="dehet-quiz" data-stop="1">
        <div class="muted small">${t('chooseArticlePrompt')}</div>
        <div class="dehet-quiz-btns">
          <button type="button" class="art-btn art-de" data-act="guess-art" data-art="de">de <small>D</small></button>
          <button type="button" class="art-btn art-het" data-act="guess-art" data-art="het">het <small>H</small></button>
        </div>
        <button type="button" class="primary" data-act="flip">${t('show')} <small>Space</small></button>
      </div>` : `<div><button type="button" class="primary" data-act="flip">${t('show')} <small>Space</small></button></div>`;
  }

  let guessFeedback = '';
  if (flipped && cardDehetGuess && c.article) {
    guessFeedback = cardDehetGuess === 'correct'
      ? `<div class="type-feedback ok">✓ Correct article: <b>${esc(cardGuessedArt)} ${esc(c.word)}</b></div>`
      : `<div class="type-feedback bad">✗ Article is <b>${esc(c.article.toUpperCase())}</b> ${esc(c.word)} (you picked <i>${esc(cardGuessedArt)}</i>)</div>`;
  }

  const back = flipped ? `
    ${guessFeedback}
    <div class="tr">${c.glosses.map(esc).join('; ')}</div>
    ${cardBackDetailsHtml(c)}
  ` : '';

  const suggestedFlash = cardDehetGuess === 'wrong' ? 0 : (cardDehetGuess === 'correct' ? 1 : null);

  return `
    <div class="card" data-act="flip">
      <div class="card-top">
        <div class="badges">${cardBadgesHtml(c)}</div>
        <div class="card-actions">
          ${gain ? `<span class="gain">+${gain}</span>` : ''}
          <button type="button" class="icon report-btn" data-act="open-report" title="${t('report')}">🚩</button>
        </div>
      </div>

      ${c.lemma ? `<div class="lemma-link">${t('formOf')} <a data-act="jump" data-word="${esc(c.lemma)}">${esc(c.lemma)}</a></div>` : ''}

      <div class="word">
        ${flipped && c.article ? `${articlePillHtml(c.article)} ` : ''}${esc(c.word)}
      </div>

      <div class="meta">${esc(c.pos || '')} ${esc(c.ipa || '')}</div>

      ${reporting ? reportModal : (flipped ? back : frontQuiz)}
    </div>
    ${flipped && !reporting ? ratingButtonsHtml(suggestedFlash) : ''}`;
}

function reportsPanelHtml() {
  return `<section class="panel">
    <div class="panel-head">
      <h2>🚩 ${t('reviewReports')}</h2>
      <button type="button" data-act="close-reports">✕</button>
    </div>
    ${!reportsList.length ? `<p class="muted">${t('noReports')}</p>` : reportsList.map(r => `
      <div class="report-item">
        <div>
          <span class="pill level-badge level-${esc(r.level || 'C2')}">${esc(r.level || 'C2')}</span>
          ${r.article ? articlePillHtml(r.article) : ''}
          <strong>${esc(r.word)}</strong> <span class="muted">(${esc(r.pos || '')}) · ×${r.reportCount}</span>
          <div>${r.glosses.map(esc).join('; ')}</div>
          ${r.reasons.length ? `<div class="muted small">“${r.reasons.map(esc).join('”, “')}”</div>` : ''}
        </div>
        <div class="row-actions">
          <button type="button" class="danger" data-act="resolve-report" data-id="${r.id}" data-resolution="skip_all">${t('skipEveryone')}</button>
          <button type="button" data-act="resolve-report" data-id="${r.id}" data-resolution="dismiss">${t('keepWord')}</button>
        </div>
      </div>
    `).join('')}
  </section>`;
}

function curriculumTabHtml() {
  const s = stats, pct = (n, tot) => Math.round(n / (tot || 1) * 100);

  const themasGrid = (s.themas || []).map(th => {
    const mastPct = pct(th.mastered, th.total);
    const learnPct = pct(Math.max(0, th.learned - th.mastered), th.total);
    const isCurrent = thema === th.slug;
    const isInspecting = inspectThemaSlug === th.slug;
    return `<div class="thema-card ${isCurrent ? 'selected' : ''}">
      <div class="thema-card-head">
        <div>
          <div class="thema-title-row">
            <span class="thema-icon">${esc(th.icon)}</span>
            <strong>${esc(th.title)}</strong>
          </div>
          <div class="muted small">${esc(th.subtitle)}</div>
        </div>
        <span class="pill level-badge level-${esc(th.level)}">${esc(th.level)}</span>
      </div>
      <div class="thema-meta-row">
        <span class="small"><b>${th.learned}</b>/${th.total} words · <b>${th.nouns}</b> de/het nouns${th.due ? ` · <span class="due-dot">${th.due} due</span>` : ''}</span>
      </div>
      <div class="bar small-bar"><i style="width:${mastPct}%"></i><i class="l" style="width:${learnPct}%"></i></div>
      <div class="row-actions">
        <button type="button" class="small-btn primary" data-act="study-thema" data-slug="${esc(th.slug)}">${t('studyThema')}</button>
        <button type="button" class="small-btn ${isInspecting ? 'active' : ''}" data-act="open-thema-words" data-slug="${esc(th.slug)}">${t(isInspecting ? 'hideWords' : 'viewWords')}</button>
      </div>
    </div>`;
  }).join('');

  let inspectorHtml = '';
  if (inspectThemaSlug) {
    const words = inspectThemaData?.words || [];
    const q = themaSearch.trim().toLowerCase();
    const filtered = words.filter(w => {
      if (themaArtFilter === 'de' && !(w.article && w.article.includes('de'))) return false;
      if (themaArtFilter === 'het' && !(w.article && w.article.includes('het'))) return false;
      if (themaArtFilter === 'nouns' && !w.article) return false;
      if (q && !w.word.toLowerCase().includes(q) && !w.glosses.join(' ').toLowerCase().includes(q)) return false;
      return true;
    });

    const thInfo = (s.themas || []).find(x => x.slug === inspectThemaSlug);
    inspectorHtml = `<section class="panel" id="thema-inspector">
      <div class="panel-head">
        <h2>${thInfo ? `${esc(thInfo.icon)} ${esc(thInfo.title)}` : inspectThemaSlug} (${words.length})</h2>
        <button type="button" data-act="close-thema-words">✕</button>
      </div>
      ${!inspectThemaData ? `<p class="muted">${t('loading')}</p>` : `
        <div class="daily-words-toolbar">
          <input id="thema-word-search" type="search" value="${esc(themaSearch)}" placeholder="Filter words in this Thema…">
          <div class="filter-tabs">
            <button type="button" class="${themaArtFilter === 'all' ? 'active' : ''}" data-act="filter-thema-art" data-art="all">All</button>
            <button type="button" class="${themaArtFilter === 'nouns' ? 'active' : ''}" data-act="filter-thema-art" data-art="nouns">de/het</button>
            <button type="button" class="${themaArtFilter === 'de' ? 'active' : ''}" data-act="filter-thema-art" data-art="de">de</button>
            <button type="button" class="${themaArtFilter === 'het' ? 'active' : ''}" data-act="filter-thema-art" data-art="het">het</button>
          </div>
        </div>
        <div class="daily-words-list">
          ${filtered.map(w => `
            <div class="daily-word-item">
              <div class="daily-word-main">
                <div class="badges">
                  ${w.article ? articlePillHtml(w.article) : ''}
                  <strong class="daily-word-term">${esc(w.word)}</strong>
                  <span class="pill level-badge level-${esc(w.level || 'A1')}">${esc(w.level || 'A1')}</span>
                  ${w.isNew ? `<span class="muted small">Unseen</span>` : `<span class="pill">${t('boxLabel')} ${w.box}</span>`}
                </div>
                <div class="daily-word-gloss">${w.glosses.map(esc).join('; ')}</div>
              </div>
              <button type="button" class="small-btn" data-act="jump" data-word="${esc(w.word)}">${t('openCard')}</button>
            </div>
          `).join('')}
        </div>
      `}
    </section>`;
  }

  const levelsHtml = (s.levels || []).map(l => {
    const isSelected = level === l.level || (level === 'auto' && s.dailyPlan?.autoLevel === l.level);
    const mastPct = pct(l.mastered, l.total);
    const learnPct = pct(Math.max(0, l.learned - l.mastered), l.total);
    return `<button type="button" class="level-card ${isSelected ? 'selected' : ''}" data-act="select-level" data-level="${esc(l.level)}">
      <div class="level-card-head">
        <span class="pill level-badge level-${esc(l.level)}">${esc(t('levels')[l.level] || l.level)}</span>
        <span class="small"><b>${l.learned}</b>/${l.total}${l.due ? ` · <span class="due-dot">${l.due} due</span>` : ''}</span>
      </div>
      <div class="bar small-bar"><i style="width:${mastPct}%"></i><i class="l" style="width:${learnPct}%"></i></div>
    </button>`;
  }).join('');

  return `
    <section class="panel">
      <div class="panel-head">
        <h2>${t('themasTitle')}</h2>
        ${thema !== 'all' ? `<button type="button" class="small-btn" data-act="study-thema" data-slug="all">Reset to All</button>` : ''}
      </div>
      <div class="themas-grid">${themasGrid}</div>
    </section>
    ${inspectorHtml}
    <section class="panel">
      <h2>${t('levelsTitle')}</h2>
      <div class="levels-grid">${levelsHtml}</div>
    </section>
  `;
}

function dailyWordsInspectorHtml() {
  const newCount = dailyWordsList.filter(w => w.learnedToday).length;
  const revCount = dailyWordsList.length - newCount;
  const filtered = dailyWordsList.filter(w => {
    if (dailyWordsFilter === 'new') return w.learnedToday;
    if (dailyWordsFilter === 'review') return !w.learnedToday;
    return true;
  });

  const dayTabs = (stats.days || []).map(d => `
    <button type="button" class="pill-btn ${dailyWordsDay === d.day ? 'active' : ''}" data-act="inspect-day" data-day="${esc(d.day)}">
      ${esc(d.day.slice(5))}${d.goalMet ? ' ✓' : ''}
    </button>
  `).join('');

  const ratingLabel = r => [t('again'), t('good'), t('easy')][r] || t('good');
  const ratingClass = r => ['rate-bad', 'rate-ok', 'rate-good'][r] || 'rate-ok';

  return `<section class="panel">
    <div class="panel-head">
      <h2>📋 ${t('dailyWordsTitle')} <span class="muted">(${esc(dailyWordsDay || t('today'))})</span></h2>
    </div>
    <div class="daily-words-toolbar">
      <div class="filter-tabs">
        <button type="button" class="${dailyWordsFilter === 'all' ? 'active' : ''}" data-act="filter-daily-words" data-filter="all">${t('filterAll')} (${dailyWordsList.length})</button>
        <button type="button" class="${dailyWordsFilter === 'new' ? 'active' : ''}" data-act="filter-daily-words" data-filter="new">${t('filterNew')} (${newCount})</button>
        <button type="button" class="${dailyWordsFilter === 'review' ? 'active' : ''}" data-act="filter-daily-words" data-filter="review">${t('filterReviewed')} (${revCount})</button>
      </div>
      ${dayTabs ? `<div class="day-pills">${dayTabs}</div>` : ''}
    </div>
    ${!dailyWordsLoaded ? `<p class="muted">${t('loading')}</p>` : (!filtered.length ? `<p class="muted">${t('noDailyWords')}</p>` : `<div class="daily-words-list">${filtered.map(w => `
      <div class="daily-word-item">
        <div class="daily-word-main">
          <div class="badges">
            <span class="pill level-badge level-${esc(w.level || 'C2')}">${esc(w.level || 'C2')}</span>
            ${w.learnedToday ? `<span class="tag">${t('newWord')}</span>` : `<span class="pill">${t('boxLabel')} ${w.box}</span>`}
            <span class="pill ${ratingClass(w.lastRating)}">${esc(ratingLabel(w.lastRating))}${w.todayReviews > 1 ? ` ×${w.todayReviews}` : ''}</span>
            ${w.article ? articlePillHtml(w.article) : ''}
            <strong class="daily-word-term">${esc(w.word)}</strong>
            <span class="muted small">${esc(w.pos || '')} ${esc(w.ipa || '')}</span>
          </div>
          <div class="daily-word-gloss">${w.glosses.map(esc).join('; ')}</div>
          ${w.exampleNl ? `<div class="muted small"><i>${esc(w.exampleNl)}</i> — ${esc(w.exampleEn || '')}</div>` : ''}
        </div>
        <button type="button" class="small-btn" data-act="jump" data-word="${esc(w.word)}">${t('openCard')}</button>
      </div>
    `).join('')}</div>`)}
  </section>`;
}

function progressTabHtml() {
  const s = stats, pct = (n, tot) => Math.round(n / (tot || 1) * 100), max = Math.max(1, ...s.days.map(d => d.reviews));
  const dehetStr = s.dehetTotal ? `${s.dehetAccuracy}% (${s.dehetCorrect}/${s.dehetTotal})` : '—';

  return `
    <section class="stats stats-6">
      <div><b>${esc(s.score)}</b><span>${t('score')}</span></div>
      <div><b>🔥 ${s.dayStreak || 0}</b><span>${t('dayStreak')}</span></div>
      <div><b>${s.learned}</b><span>${t('learned')}</span></div>
      <div><b>${s.mastered}/${s.totalWords}</b><span>${t('mastered')}</span></div>
      <div><b>${s.accuracy}%</b><span>${t('accuracy')}</span></div>
      <div><b>${esc(dehetStr)}</b><span>${t('dehetAccuracy')}</span></div>
    </section>
    <section class="panel">
      <h2>${t('stats')}</h2>
      <p class="muted">${t('answerStreak')}: <b>${s.streak}</b> (${t('best')}: <b>${s.bestStreak}</b>) · ${t('today')}: <b>${s.today.correct}/${s.today.reviews}</b></p>
      <div class="bar"><i style="width:${pct(s.mastered, s.totalWords)}%"></i><i class="l" style="width:${pct(s.learned - s.mastered, s.totalWords)}%"></i></div>
      <h3>${t('last7')}</h3>
      <div class="days">${s.days.map(d => `<div class="day-col ${d.goalMet ? 'day-goal-met' : ''} ${dailyWordsDay === d.day ? 'day-selected' : ''}" data-act="inspect-day" data-day="${esc(d.day)}" title="${d.day}: ${d.correct}/${d.reviews} (+${d.newWords || 0} new) — click to inspect"><i style="height:${Math.round(d.reviews / max * 100)}%"></i><span>${d.day.slice(5)}${d.goalMet ? ' ✓' : ''}</span></div>`).join('')}</div>
    </section>
    ${dailyWordsInspectorHtml()}
  `;
}

function render() {
  const activeId = document.activeElement?.id;
  const selStart = activeId && document.activeElement.selectionStart !== undefined ? document.activeElement.selectionStart : null;

  let bodyHtml = '';
  if (showingReports) {
    bodyHtml = reportsPanelHtml();
  } else if (tab === 'curriculum') {
    bodyHtml = curriculumTabHtml();
  } else if (tab === 'progress') {
    bodyHtml = progressTabHtml();
  } else {
    const isDailyCompleteView = studyMode === 'daily' && !extraPractice && stats.dailyPlan?.goalMet && !card;
    const studyStage = isDailyCompleteView
      ? dailyDoneHtml()
      : (card ? cardHtml() : `<div class="panel">${t('noCards')}</div>`);
    bodyHtml = `
      ${dailyStripHtml()}
      ${controlsHtml()}
      ${studyStage}
    `;
  }

  view(bodyHtml);

  if (activeId === 'search-input' || activeId === 'type-input' || activeId === 'thema-word-search') {
    const inp = document.getElementById(activeId);
    if (inp) {
      inp.focus();
      if (selStart !== null) {
        try { inp.setSelectionRange(selStart, selStart); } catch {}
      }
    }
  }
}

function renderAuth() {
  $('#logout').hidden = true;
  $('#reports-btn').hidden = true;
  $('#main-tabs').hidden = true;
  const reg = mode === 'register';
  view(`<form class="panel" id="auth"><h2>${t(reg ? 'register' : 'login')}</h2>
    <input name="username" placeholder="${t('username')}" autocomplete="username" required>
    <input name="password" type="password" placeholder="${t('password')}" autocomplete="${reg ? 'new-password' : 'current-password'}" required>
    <p class="err">${esc(authErr)}</p>
    <button class="primary">${t(reg ? 'register' : 'login')}</button>
    <a data-act="mode">${t(reg ? 'haveAccount' : 'noAccount')}</a></form>`);
}

document.addEventListener('submit', async e => {
  if (e.target.id === 'auth') {
    e.preventDefault();
    try {
      await api(mode, Object.fromEntries(new FormData(e.target)));
      authErr = '';
      await start();
    } catch (err) { authErr = err.message; renderAuth(); }
  } else if (e.target.id === 'type-form') {
    e.preventDefault();
    submitTypedAnswer();
  }
});

document.addEventListener('change', async e => {
  if (e.target.id === 'topic-select') {
    topic = localStorage.topic = e.target.value;
    queue = [];
    card = null;
    await next();
  } else if (e.target.id === 'thema-select') {
    thema = localStorage.thema = e.target.value;
    if (stats?.dailyPlan?.goalMet) extraPractice = true;
    queue = [];
    card = null;
    await next();
  } else if (e.target.id === 'level-select') {
    level = localStorage.level = e.target.value;
    if (stats?.dailyPlan?.goalMet) extraPractice = true;
    queue = [];
    card = null;
    try {
      const res = await api('settings', { targetLevel: level });
      stats = res.stats;
    } catch { /* ignore */ }
    await next();
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'search-input') {
    searchQuery = e.target.value;
    clearTimeout(searchTimer);
    if (searchQuery.trim().length < 2) {
      searchResults = [];
      render();
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        searchResults = await api(`search?q=${encodeURIComponent(searchQuery.trim())}`);
        render();
      } catch { /* ignore */ }
    }, 180);
  } else if (e.target.id === 'type-input') {
    typeText = e.target.value;
  } else if (e.target.id === 'thema-word-search') {
    themaSearch = e.target.value;
    render();
  }
});

document.addEventListener('click', async e => {
  if (e.target.closest('[data-stop]') && !e.target.closest('[data-act]')) return;
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;

  if (act === 'switch-tab') {
    tab = localStorage.tab = el.dataset.tab || 'study';
    showingReports = false;
    updateHeaderBadges();
    if (tab === 'progress' && !dailyWordsLoaded) {
      render();
      await loadDailyWords(dailyWordsDay);
    }
    render();
  } else if (act === 'flip') {
    if (el.tagName !== 'BUTTON' && e.target.closest('button, a, input')) return;
    flip();
  } else if (act === 'guess-art') {
    e.stopPropagation();
    guessArticle(el.dataset.art);
  } else if (act === 'pick-type-art') {
    e.stopPropagation();
    const chosen = el.dataset.art;
    typeArticle = typeArticle === chosen ? null : chosen;
    render();
    $('#type-input')?.focus();
  } else if (act === 'type-hint') {
    e.stopPropagation();
    typeHintStep++;
    render();
    $('#type-input')?.focus();
  } else if (act === 'retry-type') {
    flipped = false;
    resetCardInteraction();
    render();
    setTimeout(() => $('#type-input')?.focus(), 10);
  } else if (act === 'rate') {
    rate(+el.dataset.r);
  } else if (act === 'set-practice-mode') {
    practiceMode = localStorage.practiceMode = el.dataset.mode === 'type' ? 'type' : 'flashcard';
    flipped = false;
    resetCardInteraction();
    render();
    if (practiceMode === 'type') setTimeout(() => $('#type-input')?.focus(), 10);
  } else if (act === 'toggle-dehet') {
    dehetOnly = !dehetOnly;
    localStorage.dehetOnly = dehetOnly ? '1' : '0';
    if (stats?.dailyPlan?.goalMet) extraPractice = true;
    queue = [];
    card = null;
    await next();
  } else if (act === 'toggle-shuffle') {
    shuffle = !shuffle;
    localStorage.shuffle = shuffle ? '1' : '0';
    queue = [];
    card = null;
    await next();
  } else if (act === 'toggle-study-mode') {
    studyMode = studyMode === 'daily' ? 'free' : 'daily';
    localStorage.studyMode = studyMode;
    extraPractice = false;
    queue = [];
    card = null;
    await next();
  } else if (act === 'extra-practice') {
    extraPractice = true;
    queue = [];
    card = null;
    await next();
  } else if (act === 'inspect-today-words') {
    tab = localStorage.tab = 'progress';
    showingReports = false;
    updateHeaderBadges();
    render();
    await loadDailyWords('');
    render();
  } else if (act === 'inspect-day') {
    tab = localStorage.tab = 'progress';
    updateHeaderBadges();
    await loadDailyWords(el.dataset.day || '');
    render();
  } else if (act === 'filter-daily-words') {
    dailyWordsFilter = el.dataset.filter || 'all';
    render();
  } else if (act === 'study-thema') {
    thema = localStorage.thema = el.dataset.slug || 'all';
    tab = localStorage.tab = 'study';
    showingReports = false;
    if (stats?.dailyPlan?.goalMet) extraPractice = true;
    queue = [];
    card = null;
    updateHeaderBadges();
    await next();
  } else if (act === 'open-thema-words') {
    await openThemaWordList(el.dataset.slug);
  } else if (act === 'close-thema-words') {
    inspectThemaSlug = '';
    inspectThemaData = null;
    render();
  } else if (act === 'filter-thema-art') {
    themaArtFilter = el.dataset.art || 'all';
    render();
  } else if (act === 'toggle-plan') {
    editingPlan = !editingPlan;
    render();
  } else if (act === 'preset-pace') {
    const newInp = $('#plan-new');
    const revInp = $('#plan-rev');
    if (newInp) newInp.value = el.dataset.new;
    if (revInp) revInp.value = el.dataset.rev;
  } else if (act === 'save-plan') {
    const newGoal = +($('#plan-new')?.value || 10);
    const revGoal = +($('#plan-rev')?.value || 30);
    const targetLvl = $('#plan-level')?.value || level;
    await saveDailySettings(newGoal, revGoal, targetLvl);
  } else if (act === 'select-level') {
    const picked = el.dataset.level;
    if (picked) {
      level = localStorage.level = picked;
      tab = localStorage.tab = 'study';
      if (stats?.dailyPlan?.goalMet) extraPractice = true;
      queue = [];
      card = null;
      try {
        const res = await api('settings', { targetLevel: level });
        stats = res.stats;
      } catch { /* ignore */ }
      updateHeaderBadges();
      await next();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } else if (act === 'open-report') {
    e.stopPropagation();
    reporting = true;
    render();
    $('#report-reason')?.focus();
  } else if (act === 'cancel-report') {
    e.stopPropagation();
    reporting = false;
    render();
  } else if (act === 'send-report') {
    e.stopPropagation();
    await submitReport($('#report-reason')?.value || '');
  } else if (act === 'close-reports') {
    showingReports = false;
    render();
  } else if (act === 'resolve-report') {
    await resolveReport(+el.dataset.id, el.dataset.resolution);
  } else if (act === 'jump') {
    e.stopPropagation();
    await jumpToWord(el.dataset.word);
  } else if (act === 'undo') {
    await undoLast();
  } else if (act === 'mode') {
    mode = mode === 'login' ? 'register' : 'login';
    authErr = '';
    renderAuth();
  } else if (act === 'retry') {
    await api('import/retry', {});
    boot();
  }
});

document.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea')) {
    if (e.key === 'Escape') {
      e.target.blur();
      if (reporting) { reporting = false; render(); }
      if (searchResults.length) { searchResults = []; render(); }
    }
    return;
  }
  if (e.key === '/') {
    e.preventDefault();
    $('#search-input')?.focus();
    return;
  }
  if ((e.key === 'z' || e.key === 'Z') && lastUndo) {
    e.preventDefault();
    undoLast();
    return;
  }
  if (tab !== 'study' || !card || showingReports || reporting) return;
  if (!flipped) {
    if (practiceMode === 'flashcard') {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
      else if ((e.key === 'd' || e.key === 'D') && card.article) { e.preventDefault(); guessArticle('de'); }
      else if ((e.key === 'h' || e.key === 'H') && card.article) { e.preventDefault(); guessArticle('het'); }
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      $('#type-input')?.focus();
    }
  } else {
    if (['1', '2', '3'].includes(e.key)) {
      rate(+e.key - 1);
    } else if (e.key === 'Enter' && practiceMode === 'type' && document.activeElement?.tagName !== 'BUTTON') {
      e.preventDefault();
      const suggested = typeResult ? (typeResult.status === 'perfect' ? 1 : 0) : 1;
      rate(suggested);
    }
  }
  if (e.key === 'r' || e.key === 'R') { reporting = true; render(); $('#report-reason')?.focus(); }
});

$('#reports-btn').addEventListener('click', () => {
  if (showingReports) { showingReports = false; render(); }
  else openReportsView();
});

$('#logout').addEventListener('click', async () => {
  await api('logout', {});
  stats = null; mode = 'login'; renderAuth();
});

boot();
