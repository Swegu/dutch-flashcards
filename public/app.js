const I18N = {
  en: {
    login: 'Log in', register: 'Create account', username: 'Username', password: 'Password (min. 8 characters)',
    logout: 'Log out', show: 'Show answer', again: 'Again', good: 'Good', easy: 'Easy', score: 'Score', streak: 'Streak',
    best: 'Best streak', learned: 'Words started', mastered: 'Mastered', accuracy: 'Accuracy', today: 'Today', due: 'Due now',
    last7: 'Last 7 days', noCards: 'No cards available in this pack.', stats: 'Progress', newWord: 'New', loading: 'Loading…',
    importing: 'Preparing the Dutch dictionary… first start only, this can take a few minutes.', retry: 'Retry',
    source: 'Source', rank: 'frequency rank', unranked: 'Unranked (Wiktionary)', mt: 'machine translation',
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
    topics: {
      all: 'All topics',
      food: '🍽️ Food & Drink',
      travel: '🚆 Travel & Transport',
      home: '🏠 Home & Daily',
      work: '💼 Work & Money',
      health: '🩺 Body & Health',
    },
  },
  bg: {
    login: 'Вход', register: 'Създай профил', username: 'Потребителско име', password: 'Парола (мин. 8 символа)',
    logout: 'Изход', show: 'Покажи отговора', again: 'Отново', good: 'Добре', easy: 'Лесно', score: 'Точки', streak: 'Серия',
    best: 'Най-добра серия', learned: 'Започнати думи', mastered: 'Научени', accuracy: 'Точност', today: 'Днес', due: 'За преговор',
    last7: 'Последните 7 дни', noCards: 'Няма налични карти в тази тема.', stats: 'Напредък', newWord: 'Нова', loading: 'Зареждане…',
    importing: 'Подготвя се холандският речник… само при първо стартиране, може да отнеме няколко минути.', retry: 'Опитай пак',
    source: 'Източник', rank: 'ранг по честота', unranked: 'Без ранг (Wiktionary)', mt: 'машинен превод',
    haveAccount: 'Вече имаш профил? Влез', noAccount: 'Нямаш профил? Създай', err: 'Нещо се обърка',
    formOf: 'Форма на', forms: 'Словоформи', shuffleOn: '🎲 Разбъркано: Вкл.', shuffleOff: '📋 Ред: По честота',
    report: 'Докладвай грешка', reportTitle: 'Докладвай грешна карта', reportHint: 'Какъв е проблемът? (по избор)',
    reportPlaceholder: 'напр. грешен превод, печатна грешка…', sendReport: 'Докладвай и пропусни', cancel: 'Отказ',
    reportedToast: 'Картата е докладвана и скрита от опашката ти.', reviewReports: 'Докладвани карти',
    noReports: 'Няма докладвани карти за преглед.', skipEveryone: 'Скрий за всички', keepWord: 'Отхвърли сигнала',
    skippedGlobalToast: 'Скрито за всички потребители.', dismissedToast: 'Сигналът е отхвърлен.',
    conflictWarn: 'Разминаване между източниците — провери в Wiktionary:',
    wiktionaryLabel: 'Wiktionary', freedictLabel: 'FreeDict',
    searchPlaceholder: 'Търси дума на холандски или английски… ( / )', undo: 'Отмени', undoneToast: 'Последната оценка е отменена.',
    topics: {
      all: 'Всички теми',
      food: '🍽️ Храна и напитки',
      travel: '🚆 Пътуване и транспорт',
      home: '🏠 Дом и ежедневие',
      work: '💼 Работа и финанси',
      health: '🩺 Тяло и здраве',
    },
  },
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let lang = localStorage.lang || 'en';
let topic = localStorage.topic || 'all';
let shuffle = localStorage.shuffle !== '0'; // enabled by default
let stats, queue = [], card = null, flipped = false, gain = 0, mode = 'login', authErr = '';
let reporting = false, showingReports = false, reportsList = [];
let searchQuery = '', searchResults = [], searchTimer = null;
let lastUndo = null, lastReviewedCard = null, toastTimer = null;

const t = k => I18N[lang][k];
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
  applyLang();
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

function applyLang() {
  $('#lang').value = lang;
  document.documentElement.lang = lang;
  $('#logout').textContent = t('logout');
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
  queue = []; card = null; showingReports = false; reporting = false;
  $('#logout').hidden = false;
  updateHeaderBadges();
  await next();
}

async function fill() {
  const exclude = [card, ...queue].filter(Boolean).map(c => c.id);
  const qs = new URLSearchParams({
    limit: '10',
    exclude: exclude.join(','),
    topic,
    shuffle: shuffle ? '1' : '0',
  });
  queue.push(...await api(`cards?${qs}`));
}

async function next() {
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
    searchQuery = '';
    searchResults = [];
    render();
  } catch (e) {
    showToast(e.message);
  }
}

async function loadTr(c) {
  c.tr ??= {};
  if (c.tr[lang] !== undefined) return;
  c.tr[lang] = null;
  try { c.tr[lang] = (await api(`translation/${c.id}?lang=${lang}`)).text; } catch { c.tr[lang] = ''; }
  if (c === card) render();
}

function flip() {
  if (!card || flipped || reporting) return;
  flipped = true;
  render();
  if (lang !== 'en') loadTr(card);
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
      queue.splice(Math.min(3, queue.length), 0, c);
    }
    showToast(`${t(['again', 'good', 'easy'][r])}${gain ? ` (+${gain})` : ''}`, true);
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

function controlsHtml() {
  const topicOpts = Object.entries(t('topics'))
    .map(([k, label]) => `<option value="${k}"${topic === k ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');

  return `<section class="controls">
    <select id="topic-select" aria-label="Topic">${topicOpts}</select>
    <button id="shuffle-toggle" class="${shuffle ? 'active' : ''}" data-act="toggle-shuffle">${t(shuffle ? 'shuffleOn' : 'shuffleOff')}</button>
    <div class="search-wrap">
      <input id="search-input" type="search" value="${esc(searchQuery)}" placeholder="${t('searchPlaceholder')}" autocomplete="off">
      ${searchResults.length ? `<div class="search-drop">${searchResults.map(r => `
        <button type="button" class="search-item" data-act="jump" data-word="${esc(r.word)}">
          <b>${esc(r.word)}</b>
          <span>${esc(r.glosses.slice(0, 2).join('; '))}</span>
        </button>`).join('')}</div>` : ''}
    </div>
  </section>`;
}

function cardHtml() {
  const c = card;
  const rankLabel = c.rank ? `${t('rank')} #${c.rank}` : t('unranked');
  const topicBadges = (c.topics || [])
    .map(tp => `<span class="pill topic-pill">${esc(t('topics')[tp] || tp)}</span>`)
    .join('');

  let back = '';
  if (flipped) {
    const tr = lang === 'en' ? '' : (c.tr?.[lang] ?? null) === null ? '…' : c.tr[lang];
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
      ${tr ? `<div class="tr">${esc(tr)}</div>` : ''}
      <div class="${tr ? 'sub' : 'tr'}">${c.glosses.map(esc).join('; ')}</div>
      ${conflictHtml}
      ${formsHtml}
      ${c.exampleNl ? `<div class="ex"><i>${esc(c.exampleNl)}</i><br>${esc(c.exampleEn)}</div>` : ''}
      <div class="src">
        ${t('source')}: <a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">Wiktionary ↗</a>
        ${tr && tr !== '…' ? `· <a href="https://mymemory.translated.net/en/Dutch/Bulgarian/${encodeURIComponent(c.word)}" target="_blank" rel="noopener">MyMemory ↗</a> (${t('mt')})` : ''}
        · ${rankLabel}
      </div>`;
  }

  const reportModal = reporting ? `
    <div class="report-box" data-stop="1">
      <h3>${t('reportTitle')}: <b>${esc(c.word)}</b></h3>
      <p class="muted">${t('reportHint')}</p>
      <input id="report-reason" placeholder="${t('reportPlaceholder')}" maxlength="200">
      <div class="row-actions">
        <button class="danger" data-act="send-report">${t('sendReport')}</button>
        <button data-act="cancel-report">${t('cancel')}</button>
      </div>
    </div>` : '';

  return `
    <div class="card" data-act="flip">
      <div class="card-top">
        <div class="badges">
          ${c.isNew ? `<span class="tag">${t('newWord')}</span>` : ''}
          ${topicBadges}
        </div>
        <div class="card-actions">
          ${gain ? `<span class="gain">+${gain}</span>` : ''}
          <button class="icon report-btn" data-act="open-report" title="${t('report')}">🚩</button>
        </div>
      </div>

      ${c.lemma ? `<div class="lemma-link">${t('formOf')} <a data-act="jump" data-word="${esc(c.lemma)}">${esc(c.lemma)}</a></div>` : ''}

      <div class="word">
        ${flipped && c.article ? `<span class="article">${esc(c.article)}</span> ` : ''}${esc(c.word)}
        <button class="icon" data-act="speak" title="🔊">🔊</button>
      </div>

      <div class="meta">${esc(c.pos || '')} ${esc(c.ipa || '')}</div>

      ${reporting ? reportModal : (flipped ? back : `<div><button class="primary" data-act="flip">${t('show')}</button></div>`)}
    </div>
    ${flipped && !reporting ? `<div class="rate">${[['again', 0], ['good', 1], ['easy', 2]]
      .map(([k, r]) => `<button data-act="rate" data-r="${r}">${t(k)} <small>${r + 1}</small></button>`).join('')}</div>` : ''}`;
}

function reportsPanelHtml() {
  return `<section class="panel">
    <div class="panel-head">
      <h2>🚩 ${t('reviewReports')}</h2>
      <button data-act="close-reports">✕</button>
    </div>
    ${!reportsList.length ? `<p class="muted">${t('noReports')}</p>` : reportsList.map(r => `
      <div class="report-item">
        <div>
          <strong>${esc(r.word)}</strong> <span class="muted">(${esc(r.pos || '')}) · ×${r.reportCount}</span>
          <div>${r.glosses.map(esc).join('; ')}</div>
          ${r.reasons.length ? `<div class="muted small">“${r.reasons.map(esc).join('”, “')}”</div>` : ''}
        </div>
        <div class="row-actions">
          <button class="danger" data-act="resolve-report" data-id="${r.id}" data-resolution="skip_all">${t('skipEveryone')}</button>
          <button data-act="resolve-report" data-id="${r.id}" data-resolution="dismiss">${t('keepWord')}</button>
        </div>
      </div>
    `).join('')}
  </section>`;
}

function progressHtml() {
  const s = stats, pct = n => Math.round(n / (s.totalWords || 1) * 100), max = Math.max(1, ...s.days.map(d => d.reviews));
  return `<section class="panel"><h2>${t('stats')}</h2>
    <p>${t('learned')}: <b>${s.learned}</b> · ${t('accuracy')}: <b>${s.accuracy}%</b> · ${t('best')}: <b>${s.bestStreak}</b>
       · ${t('today')}: <b>${s.today.correct}/${s.today.reviews}</b></p>
    <div class="bar"><i style="width:${pct(s.mastered)}%"></i><i class="l" style="width:${pct(s.learned - s.mastered)}%"></i></div>
    <h3>${t('last7')}</h3>
    <div class="days">${s.days.map(d => `<div title="${d.day}: ${d.correct}/${d.reviews}"><i style="height:${Math.round(d.reviews / max * 100)}%"></i><span>${d.day.slice(5)}</span></div>`).join('')}</div>
  </section>`;
}

function render() {
  const s = stats;
  const activeSearch = document.activeElement?.id === 'search-input';
  const selStart = activeSearch ? document.activeElement.selectionStart : null;

  view(`
    <section class="stats">${[['score', s.score], ['streak', s.streak], ['due', s.dueNow], ['mastered', `${s.mastered}/${s.totalWords}`]]
      .map(([k, v]) => `<div><b>${esc(v)}</b><span>${t(k)}</span></div>`).join('')}</section>
    ${controlsHtml()}
    ${showingReports ? reportsPanelHtml() : (card ? cardHtml() : `<div class="panel">${t('noCards')}</div>`)}
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
    if (e.target.closest('button, a, input')) return;
    flip();
  } else if (act === 'rate') rate(+el.dataset.r);
  else if (act === 'speak') {
    e.stopPropagation();
    const u = new SpeechSynthesisUtterance(card.word);
    u.lang = 'nl-NL';
    speechSynthesis.speak(u);
  } else if (act === 'toggle-shuffle') {
    shuffle = !shuffle;
    localStorage.shuffle = shuffle ? '1' : '0';
    queue = [];
    card = null;
    await next();
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
  if (!card || showingReports || reporting) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
  else if (['1', '2', '3'].includes(e.key)) rate(+e.key - 1);
  else if (e.key === 'r' || e.key === 'R') { reporting = true; render(); $('#report-reason')?.focus(); }
});

$('#reports-btn').addEventListener('click', () => {
  if (showingReports) { showingReports = false; render(); }
  else openReportsView();
});

$('#lang').addEventListener('change', e => {
  lang = localStorage.lang = e.target.value;
  applyLang();
  if (stats) { render(); if (flipped && lang !== 'en') loadTr(card); }
  else if (!$('#auth')) boot();
  else renderAuth();
});

$('#logout').addEventListener('click', async () => {
  await api('logout', {});
  stats = null; mode = 'login'; renderAuth();
});

boot();