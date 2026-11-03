// The string pipeline is closed: no hard-coded English player text left in index.html / src/ui.js
// (and no raw literals handed to the pop-up / hint / banner calls in src/main.js), every key used exists in src/lang/en.js,
// every en.js key is used, every language in DICTS has the same keys / {vars}, plus detection + lookup cases.
// 原腳本用 node:fs 讀原始碼；這裡改用 Vite 的 ?raw 匯入（內容相同，型別由 vite/client 提供，不用裝 @types/node）。
import { beforeAll, describe, expect, it } from 'vitest';
import html from '../index.html?raw';
import ui from '../src/ui.ts?raw';
import main from '../src/main.ts?raw';
import enDict from '../src/lang/en.ts';
import { SKINS, TONGUES, TRAILS, WORLDS } from '../src/config.ts';
import { FEATS } from '../src/feats.ts';
import { NEW_AT } from '../src/level.ts';
import { DICTS, LANGS, detect, matchLang, t, setLang, itemName, pseudo, enablePseudo, loadAllLangs } from '../src/i18n.ts';

const en: Record<string, string> = enDict;
const words = (s: string) => /[A-Za-z]{2,}/.test(s);
const none = (errs: string[]) => {
  expect(errs.length === 0, errs.slice(0, 80).join('\n')).toBe(true);
};

describe('1. index.html: text nodes and aria-label / title attributes in the body', () => {
  it('no hard-coded player text in index.html', () => {
    const errs: string[] = [];
    const body = html
      .slice(html.indexOf('<body'))
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>');
    for (const m of body.matchAll(/>([^<]+)</g)) {
      const txt = m[1].replace(/&[a-z#0-9]+;/gi, ' ').trim();
      if (txt.length > 1 && words(txt)) errs.push(`index.html text: "${txt}"`);
    }
    const BRAND = new Set(['Sticky Frog']); // the logo's accessible name is the brand, English everywhere
    for (const m of body.matchAll(/\s(aria-label|title|alt|placeholder)="([^"]*)"/g)) if (words(m[2]) && !BRAND.has(m[2])) errs.push(`index.html ${m[1]}="${m[2]}" (use data-i18n-aria)`);
    none(errs);
  });
});

// ---- 2. src/ui.js: string / template literals that carry visible text
// strip ${…} (nested braces), then markup tags; what is left between tags is text the player would see
function literals(src: string) {
  const out: { s: string; at: number; before: string }[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      i = src.indexOf('\n', i);
      if (i < 0) break;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i = src.indexOf('*/', i + 2) + 1;
      continue;
    }
    if (c !== "'" && c !== '"' && c !== '`') continue;
    let j = i + 1,
      s = '',
      depth = 0;
    for (; j < src.length; j++) {
      const d = src[j];
      if (d === '\\') {
        s += src[j + 1];
        j++;
        continue;
      }
      if (c === '`' && d === '$' && src[j + 1] === '{') {
        depth = 1;
        j += 2;
        for (; j < src.length && depth; j++) {
          if (src[j] === '{') depth++;
          else if (src[j] === '}') depth--;
        }
        j--;
        s += '\u0000';
        continue;
      }
      if (d === c) break;
      s += d;
    }
    out.push({ s, at: src.slice(0, i).split('\n').length, before: src.slice(Math.max(0, i - 40), i) });
    i = j;
  }
  return out;
}
const ALLOW_CALL =
  /(?:\bt|itemName|A\.play|querySelector(?:All)?|getElementById|\$|classList\.(?:add|remove|toggle|contains)|closest|setAttribute|getAttribute|animate|addEventListener|removeEventListener|matchMedia)\(\s*$/;

describe('2. src/ui.js: string / template literals that carry visible text', () => {
  it('no hard-coded player text in src/ui.ts', () => {
    const errs: string[] = [];
    for (const { s, at, before } of literals(ui)) {
      if (ALLOW_CALL.test(before)) continue;
      // oxlint-disable no-control-regex -- 刻意用控制字元當分隔符
      const text = s
        .replace(/<[^>]*>/g, '\u0001')
        .split(/[\u0000\u0001]/)
        .map((x) => x.replace(/&[a-z#0-9]+;/gi, ' ').trim())
        .filter(Boolean);
      // oxlint-enable no-control-regex
      const isMarkup = s.includes('<');
      for (const tx of text) {
        if (!words(tx)) continue;
        // outside markup: words with spaces (not a selector) or an ALL-CAPS word are player text; single lowercase tokens are ids / classes / sound names
        // (locale tags like en-US are not text; class lists are short lowercase words)
        const looksText = /^[a-z]{2}-[A-Z]{2}$/.test(tx)
          ? false
          : (/\s/.test(tx) && /[A-Z]/.test(tx) && !/[#.[>:=(]/.test(tx)) || /\b[A-Z]{2,}\b/.test(tx) || (tx.match(/\b[a-z]{3,}\b/g) || []).length >= 3;
        if (!isMarkup && !looksText) continue;
        if (isMarkup && /^[\w-]+=?"?$/.test(tx)) continue;
        if (/^(?:[\d.%]+(?:px|ms|s|deg)?|translate|scale|cubic-bezier|rgba?|[\w-]+:)/.test(tx)) continue; // css / transforms
        errs.push(`src/ui.js:${at} hard-coded text "${tx.slice(0, 50)}"`);
      }
    }
    none(errs);
  });
});

describe('3. src/main.js: nothing raw handed to the text-showing calls', () => {
  it('no raw literals / template literals to pop / UI.* text calls', () => {
    const errs: string[] = [];
    for (const m of main.matchAll(/\b(?:pop|UI\.(?:popup|hint|dieText|nextUp|setPlay|pauseMeta|clearShow|feat|tryNow))\(\s*(['"`])([^'"`]*)\1?/g)) {
      if (m[2] && words(m[2]) && !m[0].includes('${')) errs.push(`src/main.js raw text to ${m[0].slice(0, 30)}…`);
    }
    for (const m of main.matchAll(/\b(?:pop|UI\.(?:popup|hint|dieText|clearShow))\(\s*`/g)) errs.push(`src/main.js template literal to ${m[0]} (use t())`);
    none(errs);
  });
});

// ---- 4. keys: used ⊆ en.js (or data keys), en.js ⊆ used
const srcAll = [ui, main, html].join('\n'); // i18n.js only has examples in comments + the picker's set.language
const used = new Set<string>();
for (const m of srcAll.matchAll(/\bt\(\s*'([\w.]+)'/g)) used.add(m[1]);
for (const m of srcAll.matchAll(/data-i18n(?:-aria|-html)?="([\w.]+)"/g)) used.add(m[1]);
for (const m of srcAll.matchAll(/'((?:pop|new|featVal|hint|tut|clear|result|shop|menu|next|over|pause|hud|records|levels|aria|set)\.[\w.]+)'/g)) used.add(m[1]);
for (const k of Object.keys(NEW_AT)) used.add(`new.${k}`); // NEW 字卡的 key 在 main.js 用 t(`new.${id}`) 動態組
const DATA = /^(it\.|world\.|die\.|feat\.|featLine\.)/;

describe('4. keys: used ⊆ en.js (or data keys), en.js ⊆ used', () => {
  it('every key used exists in en.js', () => {
    const errs: string[] = [];
    for (const k of used) if (!(k in en) && !DATA.test(k)) errs.push(`key used but missing in en.js: ${k}`);
    none(errs);
  });
  it('every en.js key is used', () => {
    const errs: string[] = [];
    for (const k of Object.keys(en)) if (!used.has(k)) errs.push(`en.js key never used: ${k}`);
    none(errs);
  });
});

// ---- 5. other languages: same keys (no missing, no extra), same {vars} as English, no empty strings
const vars = (s: unknown) =>
  [...String(s).matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');
// English that lives next to the data (fallbacks): it.<tab>.<id>, world.<i>, die.<i>, feat.<id>, featLine.<id>
const extra: Record<string, string> = {};
for (const [tab, list] of Object.entries({ skins: SKINS, tongues: TONGUES, trails: TRAILS })) for (const it of list) extra[`it.${tab}.${it.id}`] = it.name;
WORLDS.forEach((w, i) => {
  extra[`world.${i}`] = w.name;
  extra[`die.${i}`] = w.die;
});
for (const f of FEATS) {
  extra[`feat.${f.id}`] = f.name;
  extra[`featLine.${f.id}`] = f.line;
}

beforeAll(async () => {
  await loadAllLangs(); // 語系延遲載入：檢查前全部載進來
});

describe('5. other languages: same keys, same {vars} as English, no empty strings', () => {
  it('every language in DICTS matches English', () => {
    const errs: string[] = [];
    for (const [code, d] of Object.entries(DICTS)) {
      if (code === 'en') continue;
      const want = { ...en, ...extra };
      for (const k of Object.keys(d)) if (!(k in want)) errs.push(`${code}: extra key ${k}`);
      for (const [k, v] of Object.entries(d)) if (typeof v !== 'string' || !v.trim()) errs.push(`${code}: empty ${k}`);
      for (const k of Object.keys(want)) {
        if (!(k in d)) errs.push(`${code}: missing ${k}`);
        else if (vars(d[k]) !== vars(want[k])) errs.push(`${code}: ${k} vars differ`);
      }
    }
    none(errs);
  });
  it('expected 12 languages; LANGS order / codes match DICTS', () => {
    const errs: string[] = [];
    const nLang = Object.keys(DICTS).length;
    if (nLang !== 12) errs.push(`expected 12 languages, found ${nLang}`);
    if (LANGS.map((l) => l[0]).join() !== Object.keys(DICTS).join()) errs.push('LANGS order / codes differ from DICTS');
    none(errs);
  });
});

describe('6. detection + lookup', () => {
  it('lookup cases', () => {
    const errs: string[] = [];
    const nLang = Object.keys(DICTS).length; // enablePseudo 之前算（xx 不算語言）
    setLang('en');
    const cases: [unknown, unknown][] = [
      [matchLang('en-US'), 'en'],
      [matchLang('de-DE'), 'de'],
      [matchLang('pt-BR'), 'pt'],
      [matchLang('zh_TW'), 'zh-Hant'],
      [matchLang('zh-CN'), 'zh-Hans'],
      [matchLang('in'), 'id'],
      [matchLang('sv'), null],
      [matchLang(''), null],
      [detect({ nav: ['de-DE', 'en'] }), 'de'],
      [detect({ nav: ['sv', 'fr-CA'] }), 'fr'],
      [detect({ sdk: { locale: 'ja-JP' }, nav: ['zh-TW'] }), 'ja'],
      [detect({ sdk: { countryCode: 'KR' }, nav: ['zh-TW'] }), 'ko'],
      [detect({ url: 'ru', saved: 'de', sdk: { locale: 'ja' } }), 'ru'],
      [detect({ saved: 'de', sdk: { locale: 'ja' } }), 'de'],
      [detect({ saved: 'en' }), 'en'],
      [detect({}), 'en'],
      [t('menu.play', { level: '1-2' }), 'PLAY 1-2'],
      [t('nope.key', null, 'FALLBACK'), 'FALLBACK'],
      [itemName('skins', SKINS[0]), SKINS[0].name],
      [t('world.2', null, WORLDS[2].name), 'NEON CITY'],
    ];
    enablePseudo();
    cases.push([matchLang('xx'), 'xx'], [setLang('xx') && t('menu.levels'), pseudo('LEVELS')], [pseudo('LEVELS').length, 'LEVELS'.length + 3]);
    setLang('en');
    cases.forEach(([got, want], i) => {
      if (got !== want) errs.push(`case ${i}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    });
    expect(
      errs.length === 0,
      `[i18n-check] ${nLang} language(s) · ${Object.keys(en).length} UI keys + ${Object.keys(extra).length} data names (items / worlds / feats) · ${used.size} keys referenced · ${cases.length} lookup cases\n${errs.join('\n')}`,
    ).toBe(true);
  });
});
