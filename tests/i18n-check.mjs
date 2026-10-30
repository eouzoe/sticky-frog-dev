// node tests/i18n-check.mjs — the string pipeline is closed: no hard-coded English player text left in index.html / src/ui.js
// (and no raw literals handed to the pop-up / hint / banner calls in src/main.js), every key used exists in src/lang/en.js,
// every en.js key is used, every language in DICTS has the same keys / {vars}, plus detection + lookup cases. Exit 1 on any problem.
import { readFileSync } from 'node:fs';
import { SKINS, TONGUES, TRAILS, WORLDS } from '../src/config.js';
import { FEATS } from '../src/feats.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const en = (await import(new URL('src/lang/en.js', root))).default;
const errs = [];
const words = (s) => /[A-Za-z]{2,}/.test(s);

// ---- 1. index.html: text nodes and aria-label / title attributes in the body
const html = read('index.html');
const body = html.slice(html.indexOf('<body')).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>');
for (const m of body.matchAll(/>([^<]+)</g)) { const txt = m[1].replace(/&[a-z#0-9]+;/gi, ' ').trim(); if (txt.length > 1 && words(txt)) errs.push(`index.html text: "${txt}"`); }
const BRAND = new Set(['Sticky Frog']); // the logo's accessible name is the brand, English everywhere
for (const m of body.matchAll(/\s(aria-label|title|alt|placeholder)="([^"]*)"/g)) if (words(m[2]) && !BRAND.has(m[2])) errs.push(`index.html ${m[1]}="${m[2]}" (use data-i18n-aria)`);

// ---- 2. src/ui.js: string / template literals that carry visible text
// strip ${…} (nested braces), then markup tags; what is left between tags is text the player would see
function literals(src) {
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c !== "'" && c !== '"' && c !== '`') continue;
    let j = i + 1, s = '', depth = 0;
    for (; j < src.length; j++) {
      const d = src[j];
      if (d === '\\') { s += src[j + 1]; j++; continue; }
      if (c === '`' && d === '$' && src[j + 1] === '{') { depth = 1; j += 2; for (; j < src.length && depth; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; } j--; s += '\u0000'; continue; }
      if (d === c) break;
      s += d;
    }
    out.push({ s, at: src.slice(0, i).split('\n').length, before: src.slice(Math.max(0, i - 40), i) });
    i = j;
  }
  return out;
}
const ALLOW_CALL = /(?:\bt|itemName|A\.play|querySelector(?:All)?|getElementById|\$|classList\.(?:add|remove|toggle|contains)|closest|setAttribute|getAttribute|animate|addEventListener|removeEventListener|matchMedia)\(\s*$/;
const ui = read('src/ui.js');
for (const { s, at, before } of literals(ui)) {
  if (ALLOW_CALL.test(before)) continue;
  // oxlint-disable-next-line no-control-regex -- \u0000/\u0001 are the separators this line inserts in place of tags
  const text = s.replace(/<[^>]*>/g, '\u0001').split(/[\u0000\u0001]/).map((x) => x.replace(/&[a-z#0-9]+;/gi, ' ').trim()).filter(Boolean);
  const isMarkup = s.includes('<');
  for (const tx of text) {
    if (!words(tx)) continue;
    // outside markup: words with spaces (not a selector) or an ALL-CAPS word are player text; single lowercase tokens are ids / classes / sound names
    // (locale tags like en-US are not text; class lists are short lowercase words)
    const looksText = /^[a-z]{2}-[A-Z]{2}$/.test(tx) ? false : (/\s/.test(tx) && /[A-Z]/.test(tx) && !/[#.[>:=(]/.test(tx)) || /\b[A-Z]{2,}\b/.test(tx) || (tx.match(/\b[a-z]{3,}\b/g) || []).length >= 3;
    if (!isMarkup && !looksText) continue;
    if (isMarkup && /^[\w-]+=?"?$/.test(tx)) continue;
    if (/^(?:[\d.%]+(?:px|ms|s|deg)?|translate|scale|cubic-bezier|rgba?|[\w-]+:)/.test(tx)) continue; // css / transforms
    errs.push(`src/ui.js:${at} hard-coded text "${tx.slice(0, 50)}"`);
  }
}

// ---- 3. src/main.js: nothing raw handed to the text-showing calls
const main = read('src/main.js');
for (const m of main.matchAll(/\b(?:pop|UI\.(?:popup|hint|dieText|nextUp|setPlay|pauseMeta|clearSticker|feat|tryNow))\(\s*(['"`])([^'"`]*)\1?/g)) {
  if (m[2] && words(m[2]) && !m[0].includes('${')) errs.push(`src/main.js raw text to ${m[0].slice(0, 30)}…`);
}
for (const m of main.matchAll(/\b(?:pop|UI\.(?:popup|hint|dieText|clearSticker))\(\s*`/g)) errs.push(`src/main.js template literal to ${m[0]} (use t())`);

// ---- 4. keys: used ⊆ en.js (or data keys), en.js ⊆ used
const srcAll = ['src/ui.js', 'src/main.js', 'index.html'].map(read).join('\n'); // i18n.js only has examples in comments + the picker's set.language
const used = new Set();
for (const m of srcAll.matchAll(/\bt\(\s*'([\w.]+)'/g)) used.add(m[1]);
for (const m of srcAll.matchAll(/data-i18n(?:-aria|-html)?="([\w.]+)"/g)) used.add(m[1]);
for (const m of srcAll.matchAll(/'((?:pop|new|featVal|hint|tut|clear|result|shop|menu|next|over|pause|hud|records|levels|aria|set)\.[\w.]+)'/g)) used.add(m[1]);
{ const { NEW_AT } = await import(new URL('src/level.js', root)); for (const k of Object.keys(NEW_AT)) used.add(`new.${k}`); } // NEW 字卡的 key 在 main.js 用 t(`new.${id}`) 動態組
const DATA = /^(it\.|world\.|die\.|feat\.|featLine\.)/;
for (const k of used) if (!(k in en) && !DATA.test(k)) errs.push(`key used but missing in en.js: ${k}`);
for (const k of Object.keys(en)) if (!used.has(k)) errs.push(`en.js key never used: ${k}`);

// ---- 5. other languages: same keys (no missing, no extra), same {vars} as English, no empty strings
const { DICTS, detect, matchLang, t, setLang, itemName, pseudo, enablePseudo } = await import(new URL('src/i18n.js', root));
const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
// English that lives next to the data (fallbacks): it.<tab>.<id>, world.<i>, die.<i>, feat.<id>, featLine.<id>
const extra = {};
for (const [tab, list] of Object.entries({ skins: SKINS, tongues: TONGUES, trails: TRAILS })) for (const it of list) extra[`it.${tab}.${it.id}`] = it.name;
WORLDS.forEach((w, i) => { extra[`world.${i}`] = w.name; extra[`die.${i}`] = w.die; });
for (const f of FEATS) { extra[`feat.${f.id}`] = f.name; extra[`featLine.${f.id}`] = f.line; }
for (const [code, d] of Object.entries(DICTS)) {
  if (code === 'en') continue;
  const want = { ...en, ...extra };
  for (const k of Object.keys(d)) if (!(k in want)) errs.push(`${code}: extra key ${k}`);
  for (const [k, v] of Object.entries(d)) if (typeof v !== 'string' || !v.trim()) errs.push(`${code}: empty ${k}`);
  for (const k of Object.keys(want)) { if (!(k in d)) errs.push(`${code}: missing ${k}`); else if (vars(d[k]) !== vars(want[k])) errs.push(`${code}: ${k} vars differ`); }
}

// ---- 6. detection + lookup
setLang('en');
const cases = [
  [matchLang('en-US'), 'en'], [matchLang('de-DE'), 'de'], [matchLang('pt-BR'), 'pt'], [matchLang('zh_TW'), 'zh-Hant'], [matchLang('zh-CN'), 'zh-Hans'], [matchLang('in'), 'id'], [matchLang('sv'), null], [matchLang(''), null],
  [detect({ nav: ['de-DE', 'en'] }), 'de'], [detect({ nav: ['sv', 'fr-CA'] }), 'fr'], [detect({ sdk: { locale: 'ja-JP' }, nav: ['zh-TW'] }), 'ja'], [detect({ sdk: { countryCode: 'KR' }, nav: ['zh-TW'] }), 'ko'], [detect({ url: 'ru', saved: 'de', sdk: { locale: 'ja' } }), 'ru'], [detect({ saved: 'de', sdk: { locale: 'ja' } }), 'de'], [detect({ saved: 'en' }), 'en'], [detect({}), 'en'],
  [t('menu.play', { level: '1-2' }), 'PLAY 1-2'], [t('nope.key', null, 'FALLBACK'), 'FALLBACK'],
  [itemName('skins', SKINS[0]), SKINS[0].name], [t('world.2', null, WORLDS[2].name), 'NEON CITY'],
];
const nLang = Object.keys(DICTS).length;
if (nLang !== 12) errs.push(`expected 12 languages, found ${nLang}`);
const { LANGS } = await import(new URL('src/i18n.js', root));
if (LANGS.map((l) => l[0]).join() !== Object.keys(DICTS).join()) errs.push('LANGS order / codes differ from DICTS');
enablePseudo();
cases.push([matchLang('xx'), 'xx'], [setLang('xx') && t('menu.levels'), pseudo('LEVELS')], [pseudo('LEVELS').length, 'LEVELS'.length + 3]);
setLang('en');
cases.forEach(([got, want], i) => { if (got !== want) errs.push(`case ${i}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); });

console.log(`[i18n-check] ${nLang} language(s) · ${Object.keys(en).length} UI keys + ${Object.keys(extra).length} data names (items / worlds / feats) · ${used.size} keys referenced · ${cases.length} lookup cases`);
for (const e of errs.slice(0, 80)) console.log('  ✗', e);
if (errs.length) { console.log(`[i18n-check] ${errs.length} problems`); process.exit(1); }
console.log('[i18n-check] OK — 0 hard-coded player strings in index.html / src/ui.js');
