const T = {
  login: 'Log in', register: 'Create account', username: 'Username', password: 'Password (min. 8 characters)',
  logout: 'Log out', show: 'Show answer', again: 'Again', good: 'Good', easy: 'Easy', score: 'Score', streak: 'Streak',
  dayStreak: 'Day streak', answerStreak: 'Answer streak',
  best: 'Best streak', learned: 'Words started', mastered: 'Mastered', accuracy: 'Accuracy', today: 'Today', due: 'Due now',
  last7: 'Last 7 days (click a day to inspect words)', noCards: 'No cards available in this pack.', stats: 'Progress', newWord: '🌱 New', loading: 'Loading…',
  importing: 'Preparing the Dutch dictionary… first start only, this can take a few minutes.', retry: 'Retry',
  source: 'Source', rank: 'frequency rank', unranked: 'Unranked (Wiktionary)',
  haveAccount: 'Already have an account? Log in', noAccount: 'No account yet? Create one', err: 'Something went wrong',
  formOf: 'Form of', forms: 'Inflected forms', shuffleOn: '🎲 Shuffle: On', shuffleOff: '📋 Order: Frequency',
  report: 'Report wrong', reportTitle: 'Report incorrect card', reportHint: 'Why is this card wrong? (optional)',
  reportPlaceholder: 'e.g. wrong translation, typo, broken inflection…', sendReport: 'Report & Skip', cancel: 'Cancel',
  reportedToast: 'Card reported and hidden from your queue.', reviewReports: 'Flagged cards',
  noReports: 'No flagged cards waiting for review.', skipEveryone: 'Skip for everyone', keepWord: 'Dismiss flag',
  skippedGlobalToast: 'Skipped for all users.', dismissedToast: 'Flag dismissed.',
  conflictWarn: 'Sources disagree on meaning — verify on Wiktionary:',
  wiktionaryLabel: 'Wiktionary', freedictLabel: 'FreeDict',
  searchPlaceholder: 'Search Dutch or English word… ( / )', undo: 'Undo', undoneToast: 'Last rating undone.',
  dailyPattern: 'Daily Learn Pattern',
  modeDaily: '📅 Daily Plan', modeFree: '♾️ Free Practice',
  stepNew: '🌱 New words', stepReviews: '🔄 Reviews', stepGoal: '🎯 Today',
  goalReady: 'In progress', goalCompleteBadge: '✓ Daily goal met',
  planSettings: '⚙️ Plan',
  inspectWordsBtn: '📋 Words',
  inspectCompletedBtn: '📋 Inspect Completed Words',
  dailyWordsTitle: 'Completed Words',
  noDailyWords: 'No words completed on this day yet.',
  filterAll: 'All', filterNew: '🌱 New', filterReviewed: '🔄 Reviewed',
  openCard: 'Open card',
  paceLight: '🐢 Casual (5 / 15)', paceRegular: '🚶 Regular (10 / 30)', paceIntensive: '🚀 Intensive (20 / 60)',
  newPerDay: 'New words / day', reviewsPerDay: 'Total reviews / day', targetLevelLabel: 'Difficulty level',
  savePlan: 'Save daily plan', planSavedToast: 'Daily learning plan updated.',
  dailyGoalToast: '🎉 Daily learn pattern complete! (+50 bonus)',
  dailyDoneTitle: '🎉 Daily Learn Pattern Complete!',
  dailyDoneDesc: 'You finished today’s structured session of new level-matched words and spaced-repetition reviews.',
  continueExtra: '➕ Continue Extra Practice', adjustPlan: '⚙️ Adjust Daily Goal',
  stageDue: '🔄 Due review', stageConsolidate: '🧠 Consolidate', boxLabel: 'Box',
  levelsTitle: 'Language Levels (CEFR)',
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
    all: 'All topics',
    food: '🍽️ Food & Drink',
    travel: '🚆 Travel & Transport',
    home: '🏠 Home & Daily',
    work: '💼 Work & Money',
    health: '🩺 Body & Health',
  },
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let topic = localStorage.topic || 'all';
let level = localStorage.level || 'auto';
let studyMode = localStorage.studyMode === 'free' ? 'free' : 'daily';
let extraPractice = false;
let editingPlan = false;
let shuffle = localStorage.shuffle !== '0'; // enabled by default
let stats, queue = [], card = null, flipped = false, gain = 0, mode = 'login', authErr = '';
let reporting = false, showingReports = false, reportsList = [];
let showingDailyWords = false, dailyWordsDay = '', dailyWordsList = [], dailyWordsFilter = 'all';
let searchQuery = '', searchResults = [], searchTimer = null;
let lastUndo = null, lastReviewedCard = null, toastTimer = null;

const t = k => T[k];
const view = html => { $('#app').innerHTML = html; };

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
}

async function start() {
  stats = await api('stats');
  if (stats.dailyPlan?.targetLevel) {
    level = localStorage.level = stats.dailyPlan.targetLevel;
  }
  queue = []; card = null; showingReports = false; showingDailyWords = false; reporting = false; editingPlan = false; extraPractice = false;
  $('#logout').hidden = false;
  updateHeaderBadges();
  await next();
}

async function fill() {
  if (studyMode === 'daily' && !extraPractice && stats?.dailyPlan?.goalMet) return;
  const exclude = [card, ...queue].filter(Boolean).map(c => c.id);
  const qs = new URLSearchParams({
    limit: '10',
    exclude: exclude.join(','),
    topic,
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
    render();
    return;
  }
  if (queue.length < 3) await fill().catch(() => {});
  card = queue.shift() || null;
  flipped = false;
  reporting = false;
  render();
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
    showingDailyWords = false;
    searchQuery = '';
    searchResults = [];
    render();
  } catch (e) {
    showToast(e.message);
  }
}

function flip() {
  if (!card || flipped || reporting) return;
  flipped = true;
  render();
}

async function rate(r) {
  if (!flipped || !card) return;
  const c = card;
  try {
    const res = await api('review', { wordId: c.id, rating: r });
    stats = res.stats;
    gain = res.gained;
    lastUndo = res.undoToken;
    lastReviewedCard = c;
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
    lastUndo = null;
    lastReviewedCard = null;
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

async function openDailyWords(day = '') {
  showingDailyWords = true;
  showingReports = false;
  render();
  try {
    const qs = day ? `?day=${encodeURIComponent(day)}` : '';
    const res = await api(`daily-words${qs}`);
    dailyWordsDay = res.day;
    dailyWordsList = res.words || [];
  } catch {
    dailyWordsList = [];
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
  showingDailyWords = false;
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

function dailyPatternHtml() {
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
      </div>
      <div class="daily-actions">
        <button type="button" class="${showingDailyWords ? 'active' : ''}" data-act="toggle-daily-words">
          ${t('inspectWordsBtn')} (${completedCount})
        </button>
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

function dailyWordsPanelHtml() {
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
      <button type="button" data-act="close-daily-words">✕</button>
    </div>
    <div class="daily-words-toolbar">
      <div class="filter-tabs">
        <button type="button" class="${dailyWordsFilter === 'all' ? 'active' : ''}" data-act="filter-daily-words" data-filter="all">${t('filterAll')} (${dailyWordsList.length})</button>
        <button type="button" class="${dailyWordsFilter === 'new' ? 'active' : ''}" data-act="filter-daily-words" data-filter="new">${t('filterNew')} (${newCount})</button>
        <button type="button" class="${dailyWordsFilter === 'review' ? 'active' : ''}" data-act="filter-daily-words" data-filter="review">${t('filterReviewed')} (${revCount})</button>
      </div>
      ${dayTabs ? `<div class="day-pills">${dayTabs}</div>` : ''}
    </div>
    ${!filtered.length ? `<p class="muted">${t('noDailyWords')}</p>` : `<div class="daily-words-list">${filtered.map(w => `
      <div class="daily-word-item">
        <div class="daily-word-main">
          <div class="badges">
            <span class="pill level-badge level-${esc(w.level || 'C2')}">${esc(w.level || 'C2')}</span>
            ${w.learnedToday ? `<span class="tag">${t('newWord')}</span>` : `<span class="pill">${t('boxLabel')} ${w.box}</span>`}
            <span class="pill ${ratingClass(w.lastRating)}">${esc(ratingLabel(w.lastRating))}${w.todayReviews > 1 ? ` ×${w.todayReviews}` : ''}</span>
            <strong class="daily-word-term">${w.article ? `<span class="article-inline">${esc(w.article)}</span> ` : ''}${esc(w.word)}</strong>
            <span class="muted small">${esc(w.pos || '')} ${esc(w.ipa || '')}</span>
          </div>
          <div class="daily-word-gloss">${w.glosses.map(esc).join('; ')}</div>
          ${w.exampleNl ? `<div class="muted small"><i>${esc(w.exampleNl)}</i> — ${esc(w.exampleEn || '')}</div>` : ''}
        </div>
        <button type="button" class="small-btn" data-act="jump" data-word="${esc(w.word)}">${t('openCard')}</button>
      </div>
    `).join('')}</div>`}
  </section>`;
}

function controlsHtml() {
  const dp = stats.dailyPlan;
  const levelOpts = Object.entries(t('levels'))
    .map(([k, label]) => {
      const text = k === 'auto' && dp?.autoLevel ? `${label} (${dp.autoLevel})` : label;
      return `<option value="${k}"${level === k ? ' selected' : ''}>${esc(text)}</option>`;
    })
    .join('');

  const topicOpts = Object.entries(t('topics'))
    .map(([k, label]) => `<option value="${k}"${topic === k ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');

  return `<section class="controls">
    <select id="level-select" aria-label="Difficulty level">${levelOpts}</select>
    <select id="topic-select" aria-label="Topic">${topicOpts}</select>
    <button type="button" id="shuffle-toggle" class="${shuffle ? 'active' : ''}" data-act="toggle-shuffle">${t(shuffle ? 'shuffleOn' : 'shuffleOff')}</button>
    <div class="search-wrap">
      <input id="search-input" type="search" value="${esc(searchQuery)}" placeholder="${t('searchPlaceholder')}" autocomplete="off">
      ${searchResults.length ? `<div class="search-drop">${searchResults.map(r => `
        <button type="button" class="search-item" data-act="jump" data-word="${esc(r.word)}">
          <div>
            <span class="pill level-badge level-${esc(r.level || 'C2')}">${esc(r.level || 'C2')}</span>
            <b>${esc(r.word)}</b>
          </div>
          <span>${esc(r.glosses.slice(0, 2).join('; '))}</span>
        </button>`).join('')}</div>` : ''}
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
      <button type="button" data-act="toggle-daily-words">${t('inspectCompletedBtn')} (${completedCount})</button>
      <button type="button" data-act="toggle-plan">${t('adjustPlan')}</button>
    </div>
  </section>`;
}

function cardHtml() {
  const c = card;
  const rankLabel = c.rank ? `${t('rank')} #${c.rank}` : t('unranked');
  const topicBadges = (c.topics || [])
    .map(tp => `<span class="pill topic-pill">${esc(t('topics')[tp] || tp)}</span>`)
    .join('');

  const stageBadge = c.isNew || c.stage === 'new'
    ? `<span class="tag">${t('newWord')}</span>`
    : (c.stage === 'consolidate'
      ? `<span class="pill stage-pill">${t('stageConsolidate')} · ${t('boxLabel')} ${c.box}</span>`
      : `<span class="pill stage-pill">${t('stageDue')} · ${t('boxLabel')} ${c.box}</span>`);

  const levelBadge = `<span class="pill level-badge level-${esc(c.level || 'C2')}">${esc(c.level || 'C2')}</span>`;

  let back = '';
  if (flipped) {
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

    back = `
      <div class="tr">${c.glosses.map(esc).join('; ')}</div>
      ${conflictHtml}
      ${formsHtml}
      ${c.exampleNl ? `<div class="ex"><i>${esc(c.exampleNl)}</i><br>${esc(c.exampleEn)}</div>` : ''}
      <div class="src">
        ${t('source')}: <a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">Wiktionary ↗</a>
        · ${rankLabel}
      </div>`;
  }

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

  return `
    <div class="card" data-act="flip">
      <div class="card-top">
        <div class="badges">
          ${levelBadge}
          ${stageBadge}
          ${topicBadges}
        </div>
        <div class="card-actions">
          ${gain ? `<span class="gain">+${gain}</span>` : ''}
          <button type="button" class="icon report-btn" data-act="open-report" title="${t('report')}">🚩</button>
        </div>
      </div>

      ${c.lemma ? `<div class="lemma-link">${t('formOf')} <a data-act="jump" data-word="${esc(c.lemma)}">${esc(c.lemma)}</a></div>` : ''}

      <div class="word">
        ${flipped && c.article ? `<span class="article">${esc(c.article)}</span> ` : ''}${esc(c.word)}
      </div>

      <div class="meta">${esc(c.pos || '')} ${esc(c.ipa || '')}</div>

      ${reporting ? reportModal : (flipped ? back : `<div><button type="button" class="primary" data-act="flip">${t('show')}</button></div>`)}
    </div>
    ${flipped && !reporting ? `<div class="rate">${[['again', 0], ['good', 1], ['easy', 2]]
      .map(([k, r]) => `<button type="button" data-act="rate" data-r="${r}">${t(k)} <small>${r + 1}</small></button>`).join('')}</div>` : ''}`;
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

function progressHtml() {
  const s = stats, pct = (n, tot) => Math.round(n / (tot || 1) * 100), max = Math.max(1, ...s.days.map(d => d.reviews));
  const levelsHtml = (s.levels || []).map(l => {
    const isSelected = level === l.level || (level === 'auto' && s.dailyPlan?.autoLevel === l.level);
    const mastPct = pct(l.mastered, l.total);
    const learnPct = pct(Math.max(0, l.learned - l.mastered), l.total);
    return `<button type="button" class="level-card ${isSelected ? 'selected' : ''}" data-act="select-level" data-level="${esc(l.level)}">
      <div class="level-card-head">
        <span class="pill level-badge level-${esc(l.level)}">${esc(t('levels')[l.level] || l.level)}</span>
        <span class="small"><b>${l.learned}</b>/${l.total}${l.due ? ` · <span class="due-dot">${l.due} ${t('due').toLowerCase()}</span>` : ''}</span>
      </div>
      <div class="bar small-bar"><i style="width:${mastPct}%"></i><i class="l" style="width:${learnPct}%"></i></div>
    </button>`;
  }).join('');

  return `<section class="panel"><h2>${t('stats')}</h2>
    <p>${t('learned')}: <b>${s.learned}</b> · ${t('accuracy')}: <b>${s.accuracy}%</b>
       · ${t('answerStreak')}: <b>${s.streak}</b> (${t('best')}: <b>${s.bestStreak}</b>)
       · ${t('today')}: <b>${s.today.correct}/${s.today.reviews}</b></p>
    <div class="bar"><i style="width:${pct(s.mastered, s.totalWords)}%"></i><i class="l" style="width:${pct(s.learned - s.mastered, s.totalWords)}%"></i></div>
    ${levelsHtml ? `<h3>${t('levelsTitle')}</h3><div class="levels-grid">${levelsHtml}</div>` : ''}
    <h3>${t('last7')}</h3>
    <div class="days">${s.days.map(d => `<div class="day-col ${d.goalMet ? 'day-goal-met' : ''}" data-act="inspect-day" data-day="${esc(d.day)}" title="${d.day}: ${d.correct}/${d.reviews} (+${d.newWords || 0} new) — click to inspect"><i style="height:${Math.round(d.reviews / max * 100)}%"></i><span>${d.day.slice(5)}${d.goalMet ? ' ✓' : ''}</span></div>`).join('')}</div>
  </section>`;
}

function render() {
  const s = stats;
  const activeSearch = document.activeElement?.id === 'search-input';
  const selStart = activeSearch ? document.activeElement.selectionStart : null;

  const isDailyCompleteView = studyMode === 'daily' && !extraPractice && s.dailyPlan?.goalMet && !card;
  let mainContent = '';
  if (showingReports) mainContent = reportsPanelHtml();
  else if (showingDailyWords) mainContent = dailyWordsPanelHtml();
  else if (isDailyCompleteView) mainContent = dailyDoneHtml();
  else if (card) mainContent = cardHtml();
  else mainContent = `<div class="panel">${t('noCards')}</div>`;

  view(`
    <section class="stats">${[
      ['score', s.score],
      ['dayStreak', `🔥 ${s.dayStreak || 0}`],
      ['due', s.dueNow],
      ['mastered', `${s.mastered}/${s.totalWords}`],
    ].map(([k, v]) => `<div><b>${esc(v)}</b><span>${t(k)}</span></div>`).join('')}</section>
    ${dailyPatternHtml()}
    ${controlsHtml()}
    ${mainContent}
    ${progressHtml()}
  `);

  if (activeSearch) {
    const inp = $('#search-input');
    if (inp) {
      inp.focus();
      if (selStart !== null) inp.setSelectionRange(selStart, selStart);
    }
  }
}

function renderAuth() {
  $('#logout').hidden = true;
  $('#reports-btn').hidden = true;
  const reg = mode === 'register';
  view(`<form class="panel" id="auth"><h2>${t(reg ? 'register' : 'login')}</h2>
    <input name="username" placeholder="${t('username')}" autocomplete="username" required>
    <input name="password" type="password" placeholder="${t('password')}" autocomplete="${reg ? 'new-password' : 'current-password'}" required>
    <p class="err">${esc(authErr)}</p>
    <button class="primary">${t(reg ? 'register' : 'login')}</button>
    <a data-act="mode">${t(reg ? 'haveAccount' : 'noAccount')}</a></form>`);
}

document.addEventListener('submit', async e => {
  if (e.target.id !== 'auth') return;
  e.preventDefault();
  try {
    await api(mode, Object.fromEntries(new FormData(e.target)));
    authErr = '';
    await start();
  } catch (err) { authErr = err.message; renderAuth(); }
});

document.addEventListener('change', async e => {
  if (e.target.id === 'topic-select') {
    topic = localStorage.topic = e.target.value;
    queue = [];
    card = null;
    await next();
  } else if (e.target.id === 'level-select') {
    level = localStorage.level = e.target.value;
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
  if (e.target.id !== 'search-input') return;
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
});

document.addEventListener('click', async e => {
  if (e.target.closest('[data-stop]') && !e.target.closest('[data-act]')) return;
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;

  if (act === 'flip') {
    if (el.tagName !== 'BUTTON' && e.target.closest('button, a, input')) return;
    flip();
  } else if (act === 'rate') rate(+el.dataset.r);
  else if (act === 'toggle-shuffle') {
    shuffle = !shuffle;
    localStorage.shuffle = shuffle ? '1' : '0';
    queue = [];
    card = null;
    await next();
  } else if (act === 'toggle-study-mode') {
    studyMode = studyMode === 'daily' ? 'free' : 'daily';
    localStorage.studyMode = studyMode;
    extraPractice = false;
    showingDailyWords = false;
    queue = [];
    card = null;
    await next();
  } else if (act === 'extra-practice') {
    extraPractice = true;
    showingDailyWords = false;
    queue = [];
    card = null;
    await next();
  } else if (act === 'toggle-daily-words') {
    if (showingDailyWords) {
      showingDailyWords = false;
      render();
    } else {
      await openDailyWords('');
    }
  } else if (act === 'close-daily-words') {
    showingDailyWords = false;
    render();
  } else if (act === 'inspect-day') {
    await openDailyWords(el.dataset.day || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (act === 'filter-daily-words') {
    dailyWordsFilter = el.dataset.filter || 'all';
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
      showingDailyWords = false;
      queue = [];
      card = null;
      try {
        const res = await api('settings', { targetLevel: level });
        stats = res.stats;
      } catch { /* ignore */ }
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
  if (!card || showingReports || showingDailyWords || reporting) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
  else if (['1', '2', '3'].includes(e.key)) rate(+e.key - 1);
  else if (e.key === 'r' || e.key === 'R') { reporting = true; render(); $('#report-reason')?.focus(); }
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