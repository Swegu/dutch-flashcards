// Builds the word list on first start from two online sources:
//  - hermitdave/FrequencyWords: how common each Dutch word is (ordering)
//  - kaikki.org (Wiktionary extract): English meanings, IPA, example sentences
const readline = require('readline');
const { Readable } = require('stream');
const db = require('./db');

const FREQ_URL = process.env.FREQ_URL || 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/nl/nl_50k.txt';
const DICT_URL = process.env.DICT_URL || 'https://kaikki.org/dictionary/Dutch/kaikki.org-dictionary-Dutch.jsonl';
const WORD_LIMIT = +process.env.WORD_LIMIT || 5000;
const SKIP_POS = new Set(['name', 'character', 'symbol', 'prefix', 'suffix', 'infix', 'abbreviation', 'initialism']);
const SKIP_TAGS = new Set(['obsolete', 'archaic', 'dialectal', 'rare', 'dated']);

const setMeta = (k, v) => db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v));
const getMeta = k => db.prepare('SELECT value FROM meta WHERE key=?').get(k)?.value;
let running = false;

async function fetchOk(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r;
}

async function run() {
  setMeta('import_state', 'running');
  setMeta('import_message', 'Downloading frequency list…');
  const rank = new Map();
  for (const line of (await (await fetchOk(FREQ_URL)).text()).split('\n')) {
    const w = line.split(' ')[0];
    if (w.length > 1 && /^[a-zà-ÿ]+(?:[-'][a-zà-ÿ]+)*$/.test(w) && !rank.has(w)) rank.set(w, rank.size + 1);
    if (rank.size >= WORD_LIMIT * 3) break;
  }

  setMeta('import_message', 'Downloading dictionary…');
  const res = await fetchOk(DICT_URL);
  const rl = readline.createInterface({ input: Readable.fromWeb(res.body), crlfDelay: Infinity });
  const found = new Map();
  let n = 0;
  for await (const line of rl) {
    if (++n % 20000 === 0) setMeta('import_message', `Reading dictionary… ${n} entries`);
    const m = /"word": ?"([^"\\]*)"/.exec(line);
    if (!m || !rank.has(m[1])) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if ((e.lang_code && e.lang_code !== 'nl') || SKIP_POS.has(e.pos)) continue;
    const f = found.get(e.word) || { pos: null, anyPos: e.pos, main: [], forms: [], ipa: null, ex: null };
    found.set(e.word, f);
    for (const s of e.senses || []) {
      const g = s.glosses?.[s.glosses.length - 1];
      if (!g || s.tags?.some(t => SKIP_TAGS.has(t))) continue;
      const bucket = s.form_of || s.alt_of ? f.forms : f.main;
      if (bucket.length < 3 && !bucket.includes(g)) bucket.push(g);
      if (bucket === f.main) f.pos ||= e.pos;
      f.ex ||= s.examples?.find(x => x.text && x.english);
    }
    f.ipa ||= e.sounds?.find(s => s.ipa)?.ipa;
  }

  const rows = [...found].map(([word, f]) => ({ word, f, r: rank.get(word), g: f.main.length ? f.main : f.forms }))
    .filter(x => x.g.length).sort((a, b) => a.r - b.r).slice(0, WORD_LIMIT);
  if (rows.length < 50) throw new Error(`Only ${rows.length} words found - import aborted`);
  const ins = db.prepare('INSERT INTO words(rank,word,pos,glosses,ipa,example_nl,example_en) VALUES(?,?,?,?,?,?,?)');
  db.transaction(() => rows.forEach((x, i) => ins.run(i + 1, x.word, x.f.pos || x.f.anyPos, JSON.stringify(x.g),
    x.f.ipa || null, x.f.ex?.text || null, x.f.ex?.english || null)))();
  setMeta('import_state', 'done');
  setMeta('import_message', '');
}

function startImport() {
  if (db.prepare('SELECT 1 FROM words LIMIT 1').get()) return setMeta('import_state', 'done');
  if (running) return;
  running = true;
  run().catch(e => { console.error('Import failed:', e); setMeta('import_state', 'error'); setMeta('import_message', e.message); })
    .finally(() => { running = false; });
}

const importStatus = () => ({ state: getMeta('import_state') || 'idle', message: getMeta('import_message') || '' });

module.exports = { startImport, importStatus };
