// Builds the word list from online open-data sources:
//  1. hermitdave/FrequencyWords (Dutch 50k subtitle frequency list)
//  2. kaikki.org (Dutch Wiktionary extract: lemmas, inflected forms, IPA, gender, examples, topics)
//  3. FreeDict nld-eng (secondary bilingual dictionary for cross-checking meanings)
const readline = require('readline');
const { Readable } = require('stream');
const db = require('./db');

const FREQ_URL = process.env.FREQ_URL || 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/nl/nl_50k.txt';
const DICT_URL = process.env.DICT_URL || 'https://kaikki.org/dictionary/Dutch/kaikki.org-dictionary-Dutch.jsonl';
const FREEDICT_URL = process.env.FREEDICT_URL || 'https://raw.githubusercontent.com/freedict/fd-dictionaries/master/nld-eng/nld-eng.tei';
const WORD_LIMIT = +process.env.WORD_LIMIT || 0; // 0 = no limit
const IMPORT_VERSION = `3|${WORD_LIMIT}`;
const SKIP_POS = new Set(['name', 'character', 'symbol', 'prefix', 'suffix', 'infix', 'abbreviation', 'initialism']);
const SKIP_TAGS = new Set(['obsolete', 'archaic', 'dialectal', 'rare', 'dated']);
const VALID_WORD = /^[a-zà-ÿ]+(?:[-'][a-zà-ÿ]+)*$/;

const TOPIC_RULES = [
  { slug: 'food', rx: /\b(food|drink|beverage|cooking|cuisine|fruit|vegetable|meat|fish|dairy|bread|dish|meal|kitchen|restaurant|alcohol|wine|beer|coffee|tea|spice|herb)\b/i },
  { slug: 'travel', rx: /\b(travel|transport|vehicle|nautical|aviation|railway|road|traffic|tourism|hotel|geography|weather|direction|navigation|boat|ship|train|car|bicycle)\b/i },
  { slug: 'home', rx: /\b(home|house|furniture|clothing|garment|room|building|tool|household|family|time|calendar|day|month|season|color|colour|number)\b/i },
  { slug: 'work', rx: /\b(business|finance|money|commerce|economy|law|legal|government|politics|education|school|science|technology|computing|internet|profession|occupation|work)\b/i },
  { slug: 'health', rx: /\b(anatomy|body|medicine|medical|health|disease|illness|emotion|feeling|psychology|sport|exercise|nature|animal|plant)\b/i },
];

const setMeta = (k, v) => db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v));
const getMeta = k => db.prepare('SELECT value FROM meta WHERE key=?').get(k)?.value;
let running = false;

async function fetchOk(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r;
}

function normalizeTokens(glosses) {
  const stop = new Set(['to', 'a', 'an', 'the', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'or', 'and', 'be', 'is', 'as', 'one', 'someone', 'something']);
  const tokens = new Set();
  for (const g of glosses) {
    const cleaned = String(g)
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .toLowerCase()
      .replace(/[^a-z\s-]/g, ' ');
    for (const tok of cleaned.split(/\s+/)) {
      if (tok.length > 2 && !stop.has(tok)) tokens.add(tok);
    }
  }
  return tokens;
}

function checkMeaningConflict(primaryGlosses, secondaryGlosses) {
  if (!primaryGlosses?.length || !secondaryGlosses?.length) return false;
  const a = normalizeTokens(primaryGlosses);
  const b = normalizeTokens(secondaryGlosses);
  if (!a.size || !b.size) return false;
  for (const tok of a) {
    if (b.has(tok)) return false;
    // Allow prefix/stem match (e.g. "walk" vs "walking", "house" vs "houses")
    for (const tokB of b) {
      if (tok.length >= 4 && tokB.length >= 4 && (tok.startsWith(tokB.slice(0, 4)) || tokB.startsWith(tok.slice(0, 4)))) {
        return false;
      }
    }
  }
  return true;
}

function classifyTopics(rawTopics, glosses) {
  const bag = [...rawTopics, ...glosses].join(' ');
  const matched = [];
  for (const rule of TOPIC_RULES) {
    if (rule.rx.test(bag)) matched.push(rule.slug);
  }
  return matched;
}

function extractArticle(e) {
  if (e.pos !== 'noun') return null;
  const tags = new Set();
  for (const h of e.head_templates || []) {
    for (const v of Object.values(h.args || {})) tags.add(String(v).toLowerCase());
  }
  for (const s of e.senses || []) {
    for (const t of s.tags || []) tags.add(String(t).toLowerCase());
  }
  if (tags.has('n') || tags.has('neuter')) return 'het';
  if (tags.has('m') || tags.has('f') || tags.has('c') || tags.has('masculine') || tags.has('feminine') || tags.has('common')) return 'de';
  return null;
}

async function loadFreeDict() {
  const map = new Map();
  try {
    setMeta('import_message', 'Downloading secondary dictionary (FreeDict)…');
    const xml = await (await fetchOk(FREEDICT_URL)).text();
    const entryRx = /<entry>([\s\S]*?)<\/entry>/g;
    let m;
    while ((m = entryRx.exec(xml))) {
      const block = m[1];
      const orth = /<orth>([^<]+)<\/orth>/.exec(block)?.[1]?.trim().toLowerCase();
      if (!orth || !VALID_WORD.test(orth)) continue;
      const quotes = [];
      const qRx = /<quote>([^<]+)<\/quote>/g;
      let qm;
      while ((qm = qRx.exec(block))) {
        const val = qm[1].trim();
        if (val && !quotes.includes(val) && quotes.length < 4) quotes.push(val);
      }
      if (quotes.length) {
        const prev = map.get(orth) || [];
        for (const q of quotes) if (!prev.includes(q) && prev.length < 4) prev.push(q);
        map.set(orth, prev);
      }
    }
  } catch (err) {
    console.warn('FreeDict secondary source unavailable, continuing without cross-check:', err.message);
  }
  return map;
}

async function run() {
  setMeta('import_state', 'running');
  setMeta('import_message', 'Downloading frequency list…');
  const freqMap = new Map();
  for (const line of (await (await fetchOk(FREQ_URL)).text()).split('\n')) {
    const [rawW, count] = line.split(' ');
    const w = (rawW || '').trim().toLowerCase();
    if (w.length > 1 && VALID_WORD.test(w) && !freqMap.has(w)) {
      freqMap.set(w, { r: freqMap.size + 1, freq: +count || null });
    }
  }

  const freeDict = await loadFreeDict();

  setMeta('import_message', 'Downloading Wiktionary dictionary…');
  const res = await fetchOk(DICT_URL);
  const rl = readline.createInterface({ input: Readable.fromWeb(res.body), crlfDelay: Infinity });

  const entries = new Map();
  let n = 0;
  for await (const line of rl) {
    if (++n % 25000 === 0) setMeta('import_message', `Reading dictionary… ${n} entries`);
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if ((e.lang_code && e.lang_code !== 'nl') || SKIP_POS.has(e.pos)) continue;
    const w = (e.word || '').trim().toLowerCase();
    if (w.length < 2 || !VALID_WORD.test(w)) continue;

    const f = entries.get(w) || {
      word: w,
      pos: null,
      anyPos: e.pos,
      article: null,
      main: [],
      formGlosses: [],
      lemmaRefs: new Set(),
      forms: new Map(), // inflectedWord -> { word, tags, rank }
      ipa: null,
      ex: null,
      rawTopics: new Set(),
    };
    entries.set(w, f);

    f.article ||= extractArticle(e);
    for (const tp of e.topics || []) f.rawTopics.add(tp);
    for (const cat of e.categories || []) f.rawTopics.add(cat);

    for (const s of e.senses || []) {
      const g = s.glosses?.[s.glosses.length - 1];
      if (!g || s.tags?.some(t => SKIP_TAGS.has(t))) continue;
      for (const tp of s.topics || []) f.rawTopics.add(tp);

      const refs = [...(s.form_of || []), ...(s.alt_of || [])]
        .map(x => (x.word || '').trim().toLowerCase())
        .filter(lw => lw && lw !== w && VALID_WORD.test(lw));

      if (refs.length) {
        for (const lw of refs) f.lemmaRefs.add(lw);
        if (f.formGlosses.length < 3 && !f.formGlosses.includes(g)) f.formGlosses.push(g);
      } else {
        if (f.main.length < 4 && !f.main.includes(g)) f.main.push(g);
        f.pos ||= e.pos;
        f.ex ||= s.examples?.find(x => x.text && x.english);
      }
    }
    f.ipa ||= e.sounds?.find(s => s.ipa)?.ipa;
  }

  setMeta('import_message', 'Grouping inflected forms under base words…');

  // Attach inflected forms to their base lemma entries
  const mergedAsForm = new Set();
  for (const [w, f] of entries) {
    // Only merge pure inflected entries (no independent lemma glosses) into existing base lemmas
    if (f.main.length === 0 && f.lemmaRefs.size > 0) {
      let attached = false;
      for (const baseWord of f.lemmaRefs) {
        const base = entries.get(baseWord);
        if (base && base.main.length > 0) {
          const formRank = freqMap.get(w)?.r || null;
          base.forms.set(w, {
            word: w,
            gloss: f.formGlosses[0] || '',
            rank: formRank,
          });
          attached = true;
        }
      }
      if (attached) mergedAsForm.add(w);
    }
  }

  // Build final deduplicated lemma list
  const rankedRows = [];
  const unrankedRows = [];

  for (const [w, f] of entries) {
    if (mergedAsForm.has(w)) continue;
    const glosses = f.main.length ? f.main : f.formGlosses;
    if (!glosses.length) continue;

    // Best frequency rank across the lemma itself and any merged inflections
    let bestRank = freqMap.get(w)?.r ?? null;
    let totalFreq = freqMap.get(w)?.freq ?? 0;
    for (const [fw] of f.forms) {
      const fi = freqMap.get(fw);
      if (fi) {
        if (bestRank === null || fi.r < bestRank) bestRank = fi.r;
        totalFreq += fi.freq || 0;
      }
    }

    const altGlosses = freeDict.get(w) || [];
    const conflict = checkMeaningConflict(glosses, altGlosses) ? 1 : 0;
    const topics = classifyTopics([...f.rawTopics], glosses);
    const formsList = [...f.forms.values()]
      .sort((a, b) => (a.rank || 999999) - (b.rank || 999999))
      .slice(0, 12);
    const fallbackLemma = f.main.length === 0 && f.lemmaRefs.size > 0 ? [...f.lemmaRefs][0] : null;

    const item = {
      word: w,
      pos: f.pos || f.anyPos || null,
      article: f.article,
      glosses,
      altGlosses,
      conflict,
      ipa: f.ipa || null,
      exNl: f.ex?.text || null,
      exEn: f.ex?.english || null,
      rawRank: bestRank,
      freq: totalFreq || null,
      forms: formsList,
      lemma: fallbackLemma,
      topics,
      rawTopics: [...f.rawTopics],
    };

    if (bestRank !== null) rankedRows.push(item);
    else unrankedRows.push(item);
  }

  rankedRows.sort((a, b) => a.rawRank - b.rawRank);
  unrankedRows.sort((a, b) => a.word.localeCompare(b.word, 'nl'));

  const combined = [...rankedRows, ...unrankedRows].slice(0, WORD_LIMIT || undefined);
  if (combined.length < 50) throw new Error(`Only ${combined.length} words found - import aborted`);

  setMeta('import_message', `Saving ${combined.length} words to database…`);

  const ins = db.prepare(`
    INSERT INTO words(rank, word, pos, article, glosses, alt_glosses, meaning_conflict, ipa, example_nl, example_en, freq, forms, lemma, topics, level)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(word) DO UPDATE SET
      rank=excluded.rank,
      pos=excluded.pos,
      article=excluded.article,
      glosses=excluded.glosses,
      alt_glosses=excluded.alt_glosses,
      meaning_conflict=excluded.meaning_conflict,
      ipa=excluded.ipa,
      example_nl=excluded.example_nl,
      example_en=excluded.example_en,
      freq=excluded.freq,
      forms=excluded.forms,
      lemma=excluded.lemma,
      topics=excluded.topics,
      level=excluded.level
  `);

  db.transaction(() => {
    db.prepare('UPDATE words SET rank = NULL').run();
    let seqRank = 0;
    for (const x of combined) {
      const assignedRank = x.rawRank !== null ? ++seqRank : null;
      const level = db.computeWordLevel({
        rank: assignedRank,
        word: x.word,
        topics: x.topics,
        exampleNl: x.exNl,
        rawTopics: x.rawTopics,
      });
      ins.run(
        assignedRank,
        x.word,
        x.pos,
        x.article,
        JSON.stringify(x.glosses),
        x.altGlosses.length ? JSON.stringify(x.altGlosses) : null,
        x.conflict,
        x.ipa,
        x.exNl,
        x.exEn,
        x.freq,
        x.forms.length ? JSON.stringify(x.forms) : null,
        x.lemma,
        x.topics.length ? JSON.stringify(x.topics) : null,
        level
      );
    }
  })();

  setMeta('levels_version', '1');
  setMeta('import_version', IMPORT_VERSION);
  setMeta('import_state', 'done');
  setMeta('import_message', '');
}

function startImport() {
  if (db.prepare('SELECT 1 FROM words LIMIT 1').get() && getMeta('import_version') === IMPORT_VERSION) {
    return setMeta('import_state', 'done');
  }
  if (running) return;
  running = true;
  run()
    .catch(e => {
      console.error('Import failed:', e);
      setMeta('import_state', 'error');
      setMeta('import_message', e.message);
    })
    .finally(() => {
      running = false;
    });
}

const importStatus = () => ({
  state: getMeta('import_state') || 'idle',
  message: getMeta('import_message') || '',
  ready: !!db.prepare('SELECT 1 FROM words LIMIT 1').get(),
});

module.exports = { startImport, importStatus };