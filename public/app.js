const I18N = {
  en: { login:'Log in', register:'Create account', username:'Username', password:'Password (min. 8 characters)',
    logout:'Log out', show:'Show answer', again:'Again', good:'Good', easy:'Easy', score:'Score', streak:'Streak',
    best:'Best streak', learned:'Words started', mastered:'Mastered', accuracy:'Accuracy', today:'Today', due:'Due now',
    last7:'Last 7 days', noCards:'No cards available.', stats:'Progress', newWord:'New', loading:'Loading…',
    importing:'Preparing the Dutch dictionary… first start only, this can take a few minutes.', retry:'Retry',
    haveAccount:'Already have an account? Log in', noAccount:'No account yet? Create one', err:'Something went wrong' },
  bg: { login:'Вход', register:'Създай профил', username:'Потребителско име', password:'Парола (мин. 8 символа)',
    logout:'Изход', show:'Покажи отговора', again:'Отново', good:'Добре', easy:'Лесно', score:'Точки', streak:'Серия',
    best:'Най-добра серия', learned:'Започнати думи', mastered:'Научени', accuracy:'Точност', today:'Днес', due:'За преговор',
    last7:'Последните 7 дни', noCards:'Няма налични карти.', stats:'Напредък', newWord:'Нова', loading:'Зареждане…',
    importing:'Подготвя се холандският речник… само при първо стартиране, може да отнеме няколко минути.', retry:'Опитай пак',
    haveAccount:'Вече имаш профил? Влез', noAccount:'Нямаш профил? Създай', err:'Нещо се обърка' },
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let lang = localStorage.lang || 'en', stats, queue = [], card = null, flipped = false, gain = 0, mode = 'login', authErr = '';
const t = k => I18N[lang][k];
const view = html => { $('#app').innerHTML = html; };

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
  if (s.state === 'error') {
    return view(`<div class="panel"><p class="err">${esc(s.message)}</p><button data-act="retry">${t('retry')}</button></div>`);
  }
  if (s.state !== 'done') {
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

async function start() {
  stats = await api('stats');
  queue = []; card = null;
  $('#logout').hidden = false;
  await next();
}

async function fill() {
  const exclude = [card, ...queue].filter(Boolean).map(c => c.id);
  queue.push(...await api(`cards?limit=10&exclude=${exclude}`));
}

async function next() {
  if (queue.length < 3) await fill().catch(() => {});
  card = queue.shift() || null;
  flipped = false;
  render();
  if (queue.length < 3) fill().catch(() => {});
}

async function loadTr(c) {
  c.tr ??= {};
  if (c.tr[lang] !== undefined) return;
  c.tr[lang] = null;
  try { c.tr[lang] = (await api(`translation/${c.id}?lang=${lang}`)).text; } catch { c.tr[lang] = ''; }
  if (c === card) render();
}

function flip() {
  if (!card || flipped) return;
  flipped = true;
  render();
  if (lang !== 'en') loadTr(card);
}

async function rate(r) {
  if (!flipped || !card) return;
  const c = card;
  try {
    const res = await api('review', { wordId: c.id, rating: r });
    stats = res.stats; gain = res.gained;
    if (r === 0) { c.isNew = false; queue.splice(Math.min(3, queue.length), 0, c); }
  } catch (e) { return view(`<p class="err">${esc(e.message)}</p>`); }
  await next();
  gain = 0;
}

function cardHtml() {
  const c = card;
  let back = '';
  if (flipped) {
    const tr = lang === 'en' ? '' : (c.tr?.[lang] ?? null) === null ? '…' : c.tr[lang];
    back = `${tr ? `<div class="tr">${esc(tr)}</div>` : ''}
      <div class="${tr ? 'sub' : 'tr'}">${c.glosses.map(esc).join('; ')}</div>
      ${c.exampleNl ? `<div class="ex"><i>${esc(c.exampleNl)}</i><br>${esc(c.exampleEn)}</div>` : ''}`;
  }
  return `<div class="card" data-act="flip">
      ${c.isNew ? `<span class="tag">${t('newWord')}</span>` : ''}${gain ? `<span class="gain">+${gain}</span>` : ''}
      <div class="word">${esc(c.word)} <button class="icon" data-act="speak" title="🔊">🔊</button></div>
      <div class="meta">${esc(c.pos || '')} ${esc(c.ipa || '')}</div>
      ${flipped ? back : `<div><button class="primary" data-act="flip">${t('show')}</button></div>`}
    </div>
    ${flipped ? `<div class="rate">${[['again', 0], ['good', 1], ['easy', 2]]
      .map(([k, r]) => `<button data-act="rate" data-r="${r}">${t(k)} <small>${r + 1}</small></button>`).join('')}</div>` : ''}`;
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
  view(`<section class="stats">${[['score', s.score], ['streak', s.streak], ['due', s.dueNow], ['mastered', `${s.mastered}/${s.totalWords}`]]
    .map(([k, v]) => `<div><b>${esc(v)}</b><span>${t(k)}</span></div>`).join('')}</section>
    ${card ? cardHtml() : `<div class="panel">${t('noCards')}</div>`}${progressHtml()}`);
}

function renderAuth() {
  $('#logout').hidden = true;
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

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'flip') flip();
  else if (act === 'rate') rate(+el.dataset.r);
  else if (act === 'speak') { const u = new SpeechSynthesisUtterance(card.word); u.lang = 'nl-NL'; speechSynthesis.speak(u); }
  else if (act === 'mode') { mode = mode === 'login' ? 'register' : 'login'; authErr = ''; renderAuth(); }
  else if (act === 'retry') { await api('import/retry', {}); boot(); }
});

document.addEventListener('keydown', e => {
  if (!card || e.target.matches('input, select')) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
  else if (['1', '2', '3'].includes(e.key)) rate(+e.key - 1);
});

$('#lang').addEventListener('change', e => {
  lang = localStorage.lang = e.target.value;
  applyLang();
  if (stats) { render(); if (flipped && lang !== 'en') loadTr(card); } else if (!$('#auth')) boot(); else renderAuth();
});

$('#logout').addEventListener('click', async () => {
  await api('logout', {});
  stats = null; mode = 'login'; renderAuth();
});

boot();
