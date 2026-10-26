// Interface language: t('key', {vars}) lookup, detection, the settings picker, live switching (no reload).
// Ported from BONK BEANS (src/i18n.js). Strings live in src/lang/<code>.js (English is the source of truth: src/lang/en.js).
// Rules + what stays English: src/lang/README.md. Check: node tests/i18n-check.mjs.
// Data names (skins / tongues / trails, worlds, feats) keep their English next to the data (config.js, feats.js) as the
// fallback; other languages translate them under it.<tab>.<id> / world.<i> / die.<i> / feat.<id> / featLine.<id>.
// Styles (per-language fonts, the picker) are in i18n.css, imported by main.js so this module also loads in node.
import en from './lang/en.js';

import es from './lang/es.js';
import pt from './lang/pt.js';
import fr from './lang/fr.js';
import de from './lang/de.js';
import tr from './lang/tr.js';
import ru from './lang/ru.js';
import ja from './lang/ja.js';
import ko from './lang/ko.js';
import id from './lang/id.js';
import zhHant from './lang/zh-Hant.js';
import zhHans from './lang/zh-Hans.js';

export const DICTS = { en, es, pt, fr, de, tr, ru, ja, ko, id, 'zh-Hant': zhHant, 'zh-Hans': zhHans };
// picker order + native names (each name is drawn in its own language's font stack, i18n.css)
export const LANGS = [['en', 'English'], ['es', 'Español'], ['pt', 'Português (BR)'], ['fr', 'Français'], ['de', 'Deutsch'], ['tr', 'Türkçe'],
  ['ru', 'Русский'], ['ja', '日本語'], ['ko', '한국어'], ['id', 'Indonesia'], ['zh-Hant', '繁體中文'], ['zh-Hans', '简体中文']];
// ?lang=xx (tests only): pseudo-locale, each English string padded ~40% to prove buttons / titles survive DE / FR lengths
export function pseudo(v) { const n = Math.ceil(v.replace(/<[^>]*>|\{\w+\}/g, '').length * 0.4); return n ? v + 'ÉÀÖÜÇÑÄ'.repeat(9).slice(0, n) : v; }
const SHORT = { en: 'EN', es: 'ES', pt: 'PT', fr: 'FR', de: 'DE', tr: 'TR', ru: 'RU', ja: 'JA', ko: 'KO', id: 'ID', 'zh-Hant': '繁', 'zh-Hans': '简', xx: 'XX' };

// ---------------------------------------------------------------- detection
// BCP 47 tag ('pt-BR', 'zh_TW', 'zh-Hant-HK', 'in') → one of DICTS, or null
export function matchLang(code) {
  if (typeof code !== 'string' || !code.trim()) return null;
  const [base, ...rest] = code.trim().replace(/_/g, '-').toLowerCase().split('-');
  if (base === 'zh') return rest.includes('hant') || rest.some((r) => r === 'tw' || r === 'hk' || r === 'mo') ? 'zh-Hant' : 'zh-Hans';
  if (base === 'in') return 'id'; // legacy Indonesian tag (old Android / Java)
  return base in DICTS && base.length === 2 ? base : null; // 'xx' (pseudo) only exists after enablePseudo()
}
// ISO 3166 country → language, for platforms that report a country instead of a language
const COUNTRY = {};
const addC = (lang, list) => { for (const c of list.split(' ')) COUNTRY[c] = lang; };
addC('es', 'ES MX AR CO CL PE VE EC GT CU BO DO HN PY SV NI CR PA UY PR GQ');
addC('pt', 'BR PT AO MZ CV GW ST TL');
addC('fr', 'FR MC SN CI ML BF NE TG BJ GA CG CD CM MG HT');
addC('de', 'DE AT LI');
addC('tr', 'TR');
addC('ru', 'RU BY KZ KG');
addC('ja', 'JP');
addC('ko', 'KR');
addC('id', 'ID');
addC('zh-Hant', 'TW HK MO');
addC('zh-Hans', 'CN SG');
export const fromCountry = (cc) => COUNTRY[String(cc || '').toUpperCase()] || null;

// Priority: ?lang= (tests, sharing) > the player's own pick (save.lang) > CrazyGames SDK user.systemInfo.locale
// (docs.crazygames.com/sdk/user: "use the locale field" to pick the language) > its countryCode (only if no usable
// locale) > navigator.languages > English.
export function detect({ url, saved, sdk, nav } = {}) {
  const loc = sdk?.locale;
  const sdkPick = matchLang(loc) || (/^[A-Z]{2}$/.test(loc || '') ? fromCountry(loc) : null) || (loc ? null : fromCountry(sdk?.countryCode));
  return matchLang(url) || matchLang(saved) || sdkPick || (nav || []).map(matchLang).find(Boolean) || 'en';
}
export function enablePseudo() { DICTS.xx = Object.fromEntries(Object.entries(en).map(([k, v]) => [k, pseudo(v)])); }
export const urlLang = () => { try { return new URLSearchParams(location.search).get('lang'); } catch { return null; } };
export const navLangs = () => (navigator.languages?.length ? [...navigator.languages] : [navigator.language]);
export const sdkInfo = () => { try { return window.CrazyGames?.SDK?.user?.systemInfo || null; } catch { return null; } };

// ---------------------------------------------------------------- lookup
let cur = 'en', D = en;
const missing = new Set();
const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s);
// t('hud.left', { n: 3 }) → '3 LEFT'. vars.n === 1 picks '<key>_1' when the language has it. fallback: English text
// that lives outside the dictionaries (item names…); a key nobody knows is returned as-is and recorded (audit()).
export function t(key, vars, fallback) {
  const one = vars?.n === 1;
  let s = (one && D[key + '_1']) || D[key];
  if (s === undefined) s = cur === 'xx' && fallback ? pseudo(fallback) : fallback ?? ((one && en[key + '_1']) || en[key]);
  if (s === undefined) { missing.add(key); return key; }
  return fill(s, vars);
}
// 1 → '1ST' / '1.º' / '1er' / '1位' … (a language may override single places: ord1, ord2, ord3)
export const ord = (n) => fill(D['ord' + n] ?? D.ord ?? en['ord' + n] ?? en.ord, { n });
export const itemName = (tab, it) => (it ? t(`it.${tab}.${it.id}`, null, it.name) : '');
export const getLang = () => cur;

// Other modules bring their own string tables (e.g. a new shop: src/shop/strings.js):
//   registerStrings('en', { 'shop2.buy': 'BUY {price}' }); registerStrings('ja', { 'shop2.buy': '{price}で買う' });
//   or all at once: registerStrings({ en: {...}, ja: {...} }).  Then t('shop2.buy', { price }) as usual.
// Keys are merged into the language tables (prefix them with your module's namespace to avoid clashes); a language
// without the key falls back to the registered English. Returns the codes it merged into.
export function registerStrings(lang, dict) {
  if (lang && typeof lang === 'object') return Object.entries(lang).flatMap(([l, d]) => registerStrings(l, d));
  const code = DICTS[lang] ? lang : matchLang(lang);
  if (!code || !dict) return [];
  Object.assign(DICTS[code], dict);
  for (const k of Object.keys(dict)) missing.delete(k);
  if ((code === cur || code === 'en') && typeof document !== 'undefined') applyDom(); // markup that already carries the new keys
  return [code];
}

const fns = new Set();
export const onLang = (fn) => { fns.add(fn); return () => fns.delete(fn); };

export function setLang(code) {
  const next = DICTS[code] ? code : 'en';
  const changed = next !== cur;
  cur = next; D = DICTS[cur];
  if (typeof document === 'undefined') return cur; // node: tools/i18n-check.mjs
  const root = document.documentElement;
  root.lang = cur;
  applyDom();
  for (const el of document.querySelectorAll('.langCode')) el.textContent = SHORT[cur] ?? cur.toUpperCase();
  for (const b of document.querySelectorAll('#langMenu .lmItem')) b.classList.toggle('on', b.dataset.code === cur);
  if (changed) fns.forEach((fn) => { try { fn(cur); } catch (e) { console.warn('[i18n] listener', e); } });
  return cur;
}

// static markup: data-i18n (text), data-i18n-html (markup), data-i18n-aria (aria-label)
export function applyDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  fit(root);
}
// data-fit everywhere under root (call after rendering dynamic markup): text shrinks until it fits its box
export function fit(root = document) { for (const el of root.querySelectorAll('[data-fit]')) { fitObs?.observe(el); fitText(el); } }
// data-fit: a box whose width is set by its parent (row buttons, tabs, titles, stickers) shrinks its text until it fits —
// German / French run ~40 % longer than English. Re-runs on resize and after every language switch.
// Re-run whenever the box gets a size (shown) and after every language switch.
function fitText(el) {
  if (!el.offsetWidth) return;
  el.style.fontSize = '';
  let fs = parseFloat(getComputedStyle(el).fontSize);
  const min = fs * 0.55; // never below 55 % of the designed size
  while ((el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && fs > min) { fs -= 1; el.style.fontSize = fs + 'px'; }
}
const fitObs = typeof ResizeObserver === 'function' ? new ResizeObserver((list) => { for (const e of list) fitText(e.target); }) : null;

// ---------------------------------------------------------------- settings picker (menu + pause: next to music / sound)
// Every .langT button opens the same popover; only English this round, the list fills itself from LANGS.
export function mountPicker(onPick) {
  if (document.getElementById('langMenu')) return;
  document.body.insertAdjacentHTML('beforeend', `<div id="langMenu" class="hidden" role="menu"><div class="lmHead" data-i18n="set.language">${t('set.language')}</div>`
    + LANGS.map(([c, n]) => `<button class="lmItem${c === cur ? ' on' : ''}" role="menuitem" data-code="${c}" lang="${c}">${n}</button>`).join('') + '</div>');
  const menu = document.getElementById('langMenu');
  let from = null;
  const open = (btn) => {
    menu.classList.toggle('hidden', !btn); from = btn;
    for (const b of document.querySelectorAll('.langT')) b.setAttribute('aria-expanded', String(b === btn));
    if (btn) { const r = btn.getBoundingClientRect(); menu.style.left = `${Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.left))}px`; menu.style.top = `${Math.max(8, r.top - menu.offsetHeight - 10)}px`; }
  };
  for (const b of document.querySelectorAll('.langT')) b.addEventListener('click', (e) => { e.stopPropagation(); open(from === b && !menu.classList.contains('hidden') ? null : b); });
  menu.addEventListener('click', (e) => { e.stopPropagation(); const b = e.target.closest('.lmItem'); if (!b) return; open(null); onPick(setLang(b.dataset.code)); });
  // a click elsewhere only closes the picker (it must not also start a level from the menu)
  document.addEventListener('click', (e) => { if (!menu.classList.contains('hidden') && !e.target.closest('#langMenu, .langT')) { open(null); e.stopPropagation(); } }, true);
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && !menu.classList.contains('hidden')) { open(null); e.stopPropagation(); } }, true);
  new MutationObserver(() => open(null)).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
}

// ---------------------------------------------------------------- tests (window.__game.i18n.audit)
// Visible text nodes: overflowing their box (the nearest ancestor with a background / border, or anything that
// clips) or the viewport, raw keys left on screen ('menu.play'), and how many visible strings are translations.
function* ancestors(el) { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) yield a; }
export function audit() {
  const vals = new Set();
  if (cur !== 'en') for (const [k, v] of Object.entries(D)) if (v !== en[k]) for (const part of v.replace(/<[^>]*>/g, '\n').split(/\{\w+\}|\n/)) { const p = part.trim(); if (p.length > 1) vals.add(p); }
  const W = innerWidth, H = innerHeight, out = [], keys = [];
  let translated = 0, texts = 0;
  const boxOf = (el) => {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return a;
      if (cs.backgroundImage !== 'none' || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || parseFloat(cs.borderTopWidth) > 0) return a;
    }
    return null;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const s = n.nodeValue.trim(), el = n.parentElement;
    if (!s || !el || el.closest('script, style, #logo, #popups, #langMenu, svg')) continue;
    if (!el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    let hidden = false;
    for (let a = el; a; a = a.parentElement) if (parseFloat(getComputedStyle(a).opacity) < 0.05) { hidden = true; break; }
    if (hidden) continue;
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    texts++;
    if (/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+)+$/.test(s)) keys.push(s);
    if (vals.has(s) || [...vals].some((v) => v.length > 3 && s.includes(v))) translated++;
    const box = boxOf(el), b = box?.getBoundingClientRect(), tol = 2;
    const where = (box?.id ? '#' + box.id : box?.className || 'viewport') + ' ← ' + s.slice(0, 40);
    // inside a vertical scroller (wardrobe grid, short-screen results panel) rows below the fold are fine: sideways only
    const scroller = [...ancestors(el)].find((a) => /auto|scroll/.test(getComputedStyle(a).overflowY));
    if (scroller) { const sb = scroller.getBoundingClientRect(); if (r.left < sb.left - tol || r.right > sb.right + tol) out.push('scroller sideways: ' + where); continue; }
    if (r.left < -tol || r.top < -tol || r.right > W + tol || r.bottom > H + tol) out.push('viewport: ' + where);
    else if (b && (r.left < b.left - tol || r.right > b.right + tol || r.top < b.top - tol || r.bottom > b.bottom + tol)) out.push(`box ${Math.round(r.left - b.left)},${Math.round(b.right - r.right)}: ${where}`);
  }
  for (const el of document.querySelectorAll('.b, .card, .wcard, .sticker, #hint')) {
    if (!el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1) out.push(`scroll ${el.scrollWidth}>${el.clientWidth}: ${el.id || el.className}`);
  }
  return { lang: cur, texts, translated, overflow: out, keys, missing: [...missing] };
}
