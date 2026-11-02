// 介面語言：t('key', {vars}) 查表、語言偵測、設定選單、即時切換（不重載）。
// 字串在 src/lang/<code>.ts（英文是來源：src/lang/en.ts）。規則見 src/lang/README.md；檢查：node tests/i18n-check.mjs。
// 資料名稱（角色／舌頭／拖尾、世界、成就）的英文留在資料旁邊（config.ts、feats.ts）當備援，其他語言放在 it.<tab>.<id> 等 key。
// 語系延遲載入：英文打包在主程式（備援），其他語言是各自的小檔，用到才下載（開機只抓偵測到的那一個）。
import en from './lang/en.ts';

type Dict = Record<string, string>;
// 選單順序＋母語名稱
export const LANGS: readonly (readonly [string, string])[] = [['en', 'English'], ['es', 'Español'], ['pt', 'Português (BR)'], ['fr', 'Français'], ['de', 'Deutsch'], ['tr', 'Türkçe'],
  ['ru', 'Русский'], ['ja', '日本語'], ['ko', '한국어'], ['id', 'Indonesia'], ['zh-Hant', '繁體中文'], ['zh-Hans', '简体中文']];
const CODES = LANGS.map((l) => l[0]);
/** 已載入的字典（一開始只有英文） */
export const DICTS: Record<string, Dict> = { en };
const pending = new Map<string, Promise<void>>();
/** 載入一種語言（已載、不認得的直接完成） */
export function loadLang(code: string): Promise<void> {
  if (DICTS[code] || !CODES.includes(code)) return Promise.resolve();
  let p = pending.get(code);
  if (!p) { p = import(`./lang/${code}.ts`).then((m: { default: Dict }) => { DICTS[code] = m.default; }); pending.set(code, p); }
  return p;
}
/** 全部語言依選單順序載入（檢查程式用） */
export async function loadAllLangs(): Promise<void> { for (const c of CODES) await loadLang(c); }
// ?lang=xx（測試用）：假語言，每個英文字串加長約 40%，驗證按鈕、標題撐得住德文／法文的長度
export function pseudo(v: string): string { const n = Math.ceil(v.replace(/<[^>]*>|\{\w+\}/g, '').length * 0.4); return n ? v + 'ÉÀÖÜÇÑÄ'.repeat(9).slice(0, n) : v; }
const SHORT: Record<string, string> = { en: 'EN', es: 'ES', pt: 'PT', fr: 'FR', de: 'DE', tr: 'TR', ru: 'RU', ja: 'JA', ko: 'KO', id: 'ID', 'zh-Hant': '繁', 'zh-Hans': '简', xx: 'XX' };

// ---------------------------------------------------------------- 偵測
// BCP 47 標籤（'pt-BR'、'zh_TW'、'zh-Hant-HK'、'in'）→ DICTS 之一，或 null
export function matchLang(code: unknown): string | null {
  if (typeof code !== 'string' || !code.trim()) return null;
  const [base, ...rest] = code.trim().replace(/_/g, '-').toLowerCase().split('-');
  if (base === 'zh') return rest.includes('hant') || rest.some((r) => r === 'tw' || r === 'hk' || r === 'mo') ? 'zh-Hant' : 'zh-Hans';
  if (base === 'in') return 'id'; // 舊的印尼文標籤（舊 Android／Java）
  return (CODES.includes(base) || base in DICTS) && base.length === 2 ? base : null; // 'xx'（假語言）只在 enablePseudo() 之後存在
}
// 國碼 → 語言，給只回報國家的平台用
const COUNTRY: Record<string, string> = {};
const addC = (lang: string, list: string) => { for (const c of list.split(' ')) COUNTRY[c] = lang; };
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
export const fromCountry = (cc: unknown) => COUNTRY[String(cc || '').toUpperCase()] || null;

export interface SdkInfo { locale?: string; countryCode?: string }
// 優先序：?lang= > 玩家自選 > CrazyGames locale > 它的 countryCode（沒有可用 locale 時）> 瀏覽器 > English
export function detect({ url, saved, sdk, nav }: { url?: string | null; saved?: string; sdk?: SdkInfo | null; nav?: readonly string[] } = {}): string {
  const loc = sdk?.locale;
  const sdkPick = matchLang(loc) || (/^[A-Z]{2}$/.test(loc || '') ? fromCountry(loc) : null) || (loc ? null : fromCountry(sdk?.countryCode));
  return matchLang(url) || matchLang(saved) || sdkPick || (nav || []).map(matchLang).find(Boolean) || 'en';
}
export function enablePseudo(): void { DICTS.xx = Object.fromEntries(Object.entries(en).map(([k, v]) => [k, pseudo(v)])); }
export const urlLang = (): string | null => { try { return new URLSearchParams(location.search).get('lang'); } catch { return null; } };
export const navLangs = (): string[] => (navigator.languages?.length ? [...navigator.languages] : [navigator.language]);
export const sdkInfo = (): SdkInfo | null => { try { return window.CrazyGames?.SDK?.user?.systemInfo || null; } catch { return null; } };

// ---------------------------------------------------------------- 查表
let cur = 'en', D: Dict = en;
const missing = new Set<string>();
type Vars = Record<string, string | number> | null | undefined;
const fill = (s: string, vars: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => String(vars[k] ?? m)) : s);
// t('hud.left', { n: 3 }) → '3 LEFT'。vars.n === 1 時優先用 '<key>_1'。fallback：字典外的英文（物品名稱…）；誰都不認得的 key 原樣回傳並記錄
export function t(key: string, vars?: Vars, fallback?: string): string {
  const one = vars?.n === 1;
  let s: string | undefined = (one && D[key + '_1']) || D[key];
  if (s === undefined) s = cur === 'xx' && fallback ? pseudo(fallback) : fallback ?? ((one && en[key + '_1' as keyof typeof en]) || en[key as keyof typeof en]);
  if (s === undefined) { missing.add(key); return key; }
  return fill(s, vars);
}
export const itemName = (tab: string, it: { id: string; name: string } | null | undefined) => (it ? t(`it.${tab}.${it.id}`, null, it.name) : '');
export const getLang = () => cur;

const fns = new Set<(code: string) => void>();
export const onLang = (fn: (code: string) => void) => { fns.add(fn); return () => fns.delete(fn); };

export function setLang(code: string): string {
  // 還沒下載的語言：先下載，到了再切（這段時間維持目前的語言）
  if (!DICTS[code] && CODES.includes(code)) { void loadLang(code).then(() => setLang(code)); return cur; }
  const next = DICTS[code] ? code : 'en';
  const changed = next !== cur;
  cur = next; D = DICTS[cur];
  if (typeof document === 'undefined') return cur; // Node：tests/i18n-check.mjs
  document.documentElement.lang = cur;
  applyDom();
  for (const el of document.querySelectorAll('.langCode')) el.textContent = SHORT[cur] ?? cur.toUpperCase();
  for (const b of document.querySelectorAll<HTMLElement>('#langMenu .lmItem')) b.classList.toggle('on', b.dataset.code === cur);
  if (changed) fns.forEach((fn) => { try { fn(cur); } catch (e) { console.warn('[i18n] listener', e); } });
  return cur;
}

// 靜態標記：data-i18n（文字）、data-i18n-html（標記）、data-i18n-aria（aria-label）
export function applyDom(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n!);
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml!);
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria!));
  fit(root);
}
// root 底下所有 data-fit：字太長就縮到放得下（德文、法文比英文長約 40%）；尺寸改變與換語言時重算
export function fit(root: ParentNode = document): void { for (const el of root.querySelectorAll<HTMLElement>('[data-fit]')) { fitObs?.observe(el); fitText(el); } }
function fitText(el: HTMLElement): void {
  if (!el.offsetWidth) return;
  el.style.fontSize = '';
  let fs = parseFloat(getComputedStyle(el).fontSize);
  const min = fs * 0.55; // 最小到設計字級的 55%
  // 高度留 4px 餘裕：圓胖的字母會稍微凸出行框，那不算溢出
  while ((el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 4) && fs > min) { fs -= 1; el.style.fontSize = fs + 'px'; }
}
const fitObs = typeof ResizeObserver === 'function' ? new ResizeObserver((list) => { for (const e of list) fitText(e.target as HTMLElement); }) : null;

// ---------------------------------------------------------------- 語言選單（選單與暫停畫面，跟音樂／音效鈕放一起）
export function mountPicker(onPick: (code: string) => void): void {
  if (document.getElementById('langMenu')) return;
  document.body.insertAdjacentHTML('beforeend', `<div id="langMenu" class="hidden" role="menu"><div class="lmHead" data-i18n="set.language">${t('set.language')}</div>`
    + LANGS.map(([c, n]) => `<button class="lmItem${c === cur ? ' on' : ''}" role="menuitem" data-code="${c}" lang="${c}">${n}</button>`).join('') + '</div>');
  const menu = document.getElementById('langMenu')!;
  let from: HTMLElement | null = null;
  const open = (btn: HTMLElement | null) => {
    menu.classList.toggle('hidden', !btn); from = btn;
    for (const b of document.querySelectorAll('.langT')) b.setAttribute('aria-expanded', String(b === btn));
    if (btn) { const r = btn.getBoundingClientRect(); menu.style.left = `${Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.left))}px`; menu.style.top = `${Math.max(8, r.top - menu.offsetHeight - 10)}px`; }
  };
  for (const b of document.querySelectorAll<HTMLElement>('.langT')) b.addEventListener('click', (e) => { e.stopPropagation(); open(from === b && !menu.classList.contains('hidden') ? null : b); });
  menu.addEventListener('click', (e) => { e.stopPropagation(); const b = (e.target as Element).closest<HTMLElement>('.lmItem'); if (!b) return; open(null); const code = b.dataset.code!; setLang(code); onPick(code); }); // 存使用者點的那個：還沒下載的語言 setLang 會先回傳舊語言
  // 點別的地方只關選單（不能同時從選單開始一關）
  document.addEventListener('click', (e) => { if (!menu.classList.contains('hidden') && !(e.target as Element).closest('#langMenu, .langT')) { open(null); e.stopPropagation(); } }, true);
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && !menu.classList.contains('hidden')) { open(null); e.stopPropagation(); } }, true);
  new MutationObserver(() => open(null)).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
}

// ---------------------------------------------------------------- 測試用（window.__game.i18n.audit）
// 看得到的文字節點：超出自己的框或畫面、畫面上殘留原始 key、有幾個字串是翻譯過的
function* ancestors(el: Element) { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) yield a; }
export function audit() {
  const vals = new Set<string>();
  if (cur !== 'en') for (const [k, v] of Object.entries(D)) if (v !== en[k as keyof typeof en]) for (const part of v.replace(/<[^>]*>/g, '\n').split(/\{\w+\}|\n/)) { const p = part.trim(); if (p.length > 1) vals.add(p); }
  const W = innerWidth, H = innerHeight, out: string[] = [], keys: string[] = [];
  let translated = 0, texts = 0;
  const boxOf = (el: Element) => {
    for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return a;
      if (cs.backgroundImage !== 'none' || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || parseFloat(cs.borderTopWidth) > 0) return a;
    }
    return null;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const s = (n.nodeValue ?? '').trim(), el = n.parentElement;
    if (!s || !el || el.closest('script, style, #logo, #popups, #langMenu, svg')) continue;
    if (!el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    let hidden = false;
    for (let a: Element | null = el; a; a = a.parentElement) if (parseFloat(getComputedStyle(a).opacity) < 0.05) { hidden = true; break; }
    if (hidden) continue;
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    texts++;
    if (/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+)+$/.test(s)) keys.push(s);
    if (vals.has(s) || [...vals].some((v) => v.length > 3 && s.includes(v))) translated++;
    const box = boxOf(el), b = box?.getBoundingClientRect(), tol = 2;
    const where = (box?.id ? '#' + box.id : box?.className || 'viewport') + ' ← ' + s.slice(0, 40);
    // 垂直捲動區（商店卡片、矮螢幕的結算面板）：只檢查左右
    const scroller = [...ancestors(el)].find((a) => /auto|scroll/.test(getComputedStyle(a).overflowY));
    if (scroller) { const sb = scroller.getBoundingClientRect(); if (r.left < sb.left - tol || r.right > sb.right + tol) out.push('scroller sideways: ' + where); continue; }
    if (r.left < -tol || r.top < -tol || r.right > W + tol || r.bottom > H + tol) out.push('viewport: ' + where);
    else if (b && (r.left < b.left - tol || r.right > b.right + tol || r.top < b.top - tol || r.bottom > b.bottom + tol)) out.push(`box ${Math.round(r.left - b.left)},${Math.round(b.right - r.right)}: ${where}`);
  }
  for (const el of document.querySelectorAll<HTMLElement>('.b, .card, .wcard, .sticker, #hint')) {
    if (!el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1) out.push(`scroll ${el.scrollWidth}>${el.clientWidth}: ${el.id || el.className}`);
  }
  return { lang: cur, texts, translated, overflow: out, keys, missing: [...missing] };
}
