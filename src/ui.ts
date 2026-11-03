// DOM 介面（軟膠公仔設計系統）：畫面切換、按鈕壓扁回彈、HUD、跳字、成就膠囊、過關／無盡結束浮層、觸控教學、選關、商店、紀錄頁、選單下一步推薦。
// 每幀呼叫的 hud()／tickFlash() 只在數值改變時才寫 DOM。
import { SKINS, TRAILS, TONGUES, WORLDS, THEMES, THEME_LEVELS, ownsTheme, themePrice } from './config.ts';
import type { Skin, TongueSpec, TrailSpec, Theme } from './config.ts';
import { FEATS, featById } from './feats.ts';
import type { FeatDef } from './feats.ts';
import { LEVEL_COUNT, levelLabel, worldOf } from './level.ts';
import * as A from './audio.ts';
import { t, itemName, fit } from './i18n.ts';
import { portraitURL, drawPortrait } from './render/portraits.ts';
import type { Save, ShopTab } from './save.ts';

type Item = Skin | TongueSpec | TrailSpec;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const screens = ['menu', 'levels', 'shop', 'records', 'pause'] as const;
export type Screen = (typeof screens)[number];
const icon = (id: string, cls = 'i') => `<svg class="${cls}"><use href="#i-${id}" /></svg>`;
// 千分位自己加：toLocaleString 第一次呼叫要載入 ICU 語系資料（開機時約 20ms）
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const FEATURED = SKINS.find((s) => s.featured)!;
const WORLD_DEEP = ['#0f6b55', '#b02a74', '#2a1458', '#5a1a1a', '#1d5f94', '#8e2f6b']; // 同 index.html body[data-world] 的 --w-deep

export function setWorld(i: number): void {
  document.body.dataset.world = String(i);
}

// ---------- 按下壓扁、放開回彈（一個全域 listener 管所有軟膠元件） ----------
const PRESSABLE = '.b, .bub, .card, .lvb, .wcard';
addEventListener('pointerdown', (e) => {
  const el = e.target instanceof Element ? e.target.closest<HTMLElement>(PRESSABLE) : null;
  if (!el || el.id === 'combo' || el.classList.contains('chip')) return;
  el.classList.remove('rel');
  el.classList.add('down');
  A.play(el.classList.contains('locked') ? 'ui_nope' : 'ui_press');
  const up = () => {
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
    el.classList.remove('down');
    if (!el.classList.contains('locked')) {
      void el.offsetWidth;
      el.classList.add('rel');
      A.play('ui_pop');
    }
  };
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
});
addEventListener('animationend', (e) => {
  const el = e.target as HTMLElement;
  if (e.animationName === 'newIn') {
    el.hidden = true;
    el.classList.remove('on');
  }
  if (e.animationName === 'rel' || e.animationName === 'relB') el.classList.remove('rel');
});

// ---------- 畫面 ----------
export function show(name: Screen | null): void {
  for (const s of screens) $(s).classList.toggle('on', s === name);
  document.body.dataset.screen = name ?? 'play';
  if (name) {
    dieText(null);
    hideFeat();
  }
  if (name && name !== 'pause') {
    clearHide();
    overHide();
  } // 暫停時結束浮層留著（繼續要接著同一個節拍）
  $('hud').classList.toggle('on', name === null || name === 'pause');
  if (name !== null) tut(null);
  const ins = name ? [...$(name).querySelectorAll<HTMLElement>('[data-in]')] : [];
  if (name && !ins.length) ins.push(...$(name).querySelectorAll<HTMLElement>('.panel')); // 暫停：面板落下
  for (const [i, el] of ins.slice(0, 8).entries()) {
    el.classList.remove('drop');
    void el.offsetWidth;
    el.style.animationDelay = `${i * 40}ms`;
    el.classList.add('drop');
  }
  if (name) A.play('panel_in');
  if (name) requestAnimationFrame(() => fit($(name)));
}

// 金幣（選單／商店／選關的膠囊）：變少時往下跑（買東西看得到錢花掉）
let coinsShown: number | null = null;
export function setCoins(n: number): void {
  const els = [...document.querySelectorAll<HTMLElement>('.coinN')],
    from = coinsShown ?? n;
  coinsShown = n;
  if (from === n || document.body.dataset.screen !== 'shop') {
    for (const el of els) el.textContent = fmt(n);
    return;
  }
  countTo(els, from, n, 600);
}
function countTo(els: HTMLElement[], from: number, to: number, dur: number, onDone?: () => void): void {
  const t0 = performance.now();
  let lastTick = 0;
  const step = (tm: number) => {
    const u = Math.min(1, (tm - t0) / dur),
      v = from + (to - from) * (1 - (1 - u) ** 3);
    for (const el of els) el.textContent = fmt(v);
    if (tm - lastTick > 40 && u < 1) {
      A.play('coin_tick');
      lastTick = tm;
    }
    if (u < 1) requestAnimationFrame(step);
    else onDone?.();
  };
  requestAnimationFrame(step);
}

// ---------- HUD（每幀呼叫：只寫有變的值） ----------
export interface HudData {
  endless: boolean;
  dist: number;
  level: number;
  score: number;
  flies: number;
  fliesTotal: number;
  time: number;
  prog: number;
  best: number;
  combo: number;
  comboLeft: number;
  comboPulse: number;
}
const hudCache: Record<string, string> = {};
let comboShown = 0;
const set = (id: string, v: string) => {
  if (hudCache[id] !== v) {
    hudCache[id] = v;
    $(id).textContent = v;
  }
};
const css = (id: string, prop: 'transform' | 'left' | 'top' | 'display' | 'opacity', v: string) => {
  const k = `${id}.${prop}`;
  if (hudCache[k] !== v) {
    hudCache[k] = v;
    $(id).style[prop] = v;
  }
};
export function hud(o: HudData): void {
  set('hudLevel', o.endless ? t('hud.endless') : levelLabel(o.level));
  set('hudScore', fmt(o.score));
  set('hudFlies', o.endless ? String(o.flies) : `${o.flies}/${o.fliesTotal}`);
  set('hudTime', o.endless ? t('hud.dist', { dist: o.dist }) : t('hud.time', { time: o.time.toFixed(1) }));
  css('prog', 'display', o.endless ? 'none' : '');
  css('progFill', 'transform', `scaleX(${o.prog.toFixed(3)})`);
  css('progKnob', 'left', `${(o.prog * 100).toFixed(1)}%`);
  if (o.best > 0.02) {
    css('progBest', 'display', 'block');
    css('progBest', 'left', `${(o.best * 100).toFixed(1)}%`);
  } else css('progBest', 'display', 'none');
  if (o.combo >= 2) {
    css('combo', 'opacity', '1');
    set('comboN', `x${o.combo}`);
    css('comboBar', 'transform', `scaleX(${o.comboLeft.toFixed(2)})`);
    if (Math.floor(o.combo / 5) > Math.floor(comboShown / 5)) bump($('combo')); // 每 5 連壓扁一次
  } else css('combo', 'opacity', '0');
  comboShown = o.combo;
}
const bump = (el: HTMLElement) => {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
};

let hintShown: string | null = null;
export function hint(text: string | null, x = 0, y = 0): void {
  const h = $('hint');
  if (!text) {
    if (hintShown !== null) {
      h.style.display = 'none';
      hintShown = null;
    }
    return;
  }
  if (hintShown === null) h.style.display = 'block';
  css('hint', 'left', `${x.toFixed(0)}px`);
  css('hint', 'top', `${y.toFixed(0)}px`);
  if (hintShown !== text) {
    $('hintText').textContent = text;
    hintShown = text;
  }
}

// 新元素字卡（NEW）：關卡開場在關名下面顯示 2.6 秒；不含新元素的關傳 null
export function newCard(name: string | null): void {
  const c = $('newCard');
  if (!name) {
    c.hidden = true;
    c.classList.remove('on');
    return;
  }
  const b = $('newName');
  b.textContent = name;
  c.hidden = false;
  c.classList.remove('on');
  fitNewName(b);
  void c.offsetWidth;
  c.classList.add('on');
}
// 標題只准在空白處換行（CJK 照常逐字）：放不下就一路縮字級，下限 24px
function fitNewName(b: HTMLElement): void {
  const cjk = /^(ja|ko|zh)/.test(document.documentElement.lang || '');
  const split = () => {
    if (cjk || !b.firstChild) return false;
    const tn = b.firstChild as Text,
      re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tn.data))) {
      const r = document.createRange();
      r.setStart(tn, m.index);
      r.setEnd(tn, m.index + m[0].length);
      if (new Set([...r.getClientRects()].map((q) => Math.round(q.top / 4))).size > 1) return true;
    }
    return false;
  };
  let fs = 40;
  b.style.fontSize = '';
  while (fs > 24 && (b.scrollWidth > b.clientWidth + 0.5 || split())) {
    fs -= 1;
    b.style.fontSize = `${fs}px`;
  }
}

// 跳字：同時最多 3 個；大字一次只留一個
interface Pop {
  node: HTMLDivElement;
  busy: boolean;
  t: number;
}
const pool: Pop[] = [];
export function popup(text: string, x: number, y: number, cls = ''): void {
  if (cls.includes('big') && !$('feat').hidden) return; // 成就膠囊在場：同時只留一個大型橫幅
  const busy = pool.filter((p) => p.busy).sort((a, b) => a.t - b.t);
  if (cls.includes('big')) for (const o of busy) if (o.node.classList.contains('big')) free(o);
  const still = busy.filter((p) => p.busy);
  if (still.length >= 3) free(still[0]);
  let el = pool.find((e) => !e.busy);
  if (!el) {
    const node = document.createElement('div');
    el = { node, busy: false, t: 0 };
    $('popups').appendChild(node);
    pool.push(el);
    const ref = el;
    node.addEventListener('animationend', () => free(ref));
  }
  el.busy = true;
  el.t = performance.now();
  const n = el.node;
  n.className = `pp tx ${cls}`;
  n.textContent = text;
  n.style.left = `${Math.max(80, Math.min(innerWidth - 80, x))}px`;
  n.style.top = `${Math.max(60, Math.min(innerHeight - 40, y))}px`;
  n.style.display = 'block';
  n.style.animation = 'none';
  void n.offsetWidth;
  n.style.animation = '';
}
function free(o: Pop): void {
  o.busy = false;
  o.node.style.display = 'none';
}

// 閃白：每秒最多 3 次大面積閃光（WCAG 2.3.1 三次閃光門檻），之後的閃光降到一半強度
let flashA = 0,
  flashShown = -1,
  flashTimes: number[] = [];
export function flash(a = 0.7): void {
  const now = performance.now();
  flashTimes = flashTimes.filter((x) => now - x < 1000);
  if (a > 0.2) {
    if (flashTimes.length >= 3) a *= 0.4;
    else flashTimes.push(now);
  }
  flashA = Math.max(flashA, a);
}
export function tickFlash(dt: number): void {
  flashA = Math.max(0, flashA - dt * 3.2);
  const v = Math.round(flashA * 100) / 100;
  if (v !== flashShown) {
    flashShown = v;
    $('flash').style.opacity = String(v);
  }
}

export function dieText(text: string | null): void {
  const d = $('dieText');
  if (!text) {
    d.classList.remove('on');
    return;
  }
  d.textContent = text;
  d.classList.remove('on');
  void d.offsetWidth;
  d.classList.add('on');
}

export function setToggles(save: Save): void {
  for (const b of document.querySelectorAll('.musicT')) b.classList.toggle('off', !save.music);
  for (const b of document.querySelectorAll('.sfxT')) b.classList.toggle('off', !save.sfx);
}

// HUD 金幣：數字即時、變多就壓扁一下（80 ms 內多次只做一次）
let coinShown = -1,
  bumpAt = 0;
export function hudCoins(n: number): void {
  if (n === coinShown) return;
  if (coinShown >= 0 && n > coinShown && performance.now() - bumpAt > 80) {
    bump($('hudCoins'));
    bumpAt = performance.now();
  }
  coinShown = n;
  $('hudCoinN').textContent = fmt(n);
}

// ---------- 金幣飛入、軟糖泡泡 ----------
const center = (el: Element): [number, number] => {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
};
// 回 false＝目標不在畫面上，沒有飛（呼叫端自己把金幣直接入帳）
export function coinFly(from: [number, number], toEl: HTMLElement | null, n: number, onLand?: (i: number) => void): boolean {
  if (!toEl || toEl.getBoundingClientRect().width === 0) return false;
  n = Math.min(8, n);
  const [x1, y1] = center(toEl);
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div');
    c.className = 'fly';
    c.innerHTML = '<svg width="34" height="34"><use href="#i-coin" /></svg>';
    document.body.appendChild(c);
    const x0 = from[0] + (Math.random() - 0.5) * 40,
      y0 = from[1] + (Math.random() - 0.5) * 30,
      mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 120,
      my = Math.min(y0, y1) - 90 - Math.random() * 60;
    const kf: Keyframe[] = [];
    for (let k = 0; k <= 10; k++) {
      const u = k / 10,
        a = (1 - u) ** 2,
        b = 2 * (1 - u) * u,
        cc = u * u;
      kf.push({ transform: `translate(${a * x0 + b * mx + cc * x1}px, ${a * y0 + b * my + cc * y1}px) scale(${1 + Math.sin(u * Math.PI) * 0.35})` });
    }
    const anim = c.animate(kf, { duration: 450, delay: i * 50, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' });
    anim.onfinish = () => {
      c.remove();
      A.play('coin_land', { n: i });
      bump(toEl);
      onLand?.(i);
    };
  }
  return true;
}
function goo(at: [number, number], colors: string[]): void {
  for (let i = 0; i < 6; i++) {
    const d = document.createElement('div'),
      s = 16 + Math.random() * 18;
    d.className = 'goo';
    Object.assign(d.style, { width: `${s}px`, height: `${s}px`, background: colors[i % colors.length] });
    document.body.appendChild(d);
    const ang = -Math.PI / 2 + (i - 2.5) * 0.45,
      sp = 120 + Math.random() * 70,
      kf: Keyframe[] = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12,
        x = at[0] + Math.cos(ang) * sp * u,
        y = at[1] + Math.sin(ang) * sp * u + 260 * u * u - s / 2,
        sc = u < 0.15 ? u / 0.15 : 1 - Math.max(0, u - 0.7) / 0.3;
      kf.push({ transform: `translate(${x - s / 2}px, ${y}px) scale(${sc * (1 + 0.15 * Math.sin(u * 20))}, ${sc})` });
    }
    d.animate(kf, { duration: 820, easing: 'linear', fill: 'both' }).onfinish = () => d.remove();
  }
}
const GOO = ['#ffd23f', '#ff9cbc', '#7be0ff', '#8af5b0', '#ffffff', '#c9b8ff'];

// ---------- 成就稱讚：扭蛋膠囊落下、名字逐字充氣、金幣飛進 HUD（onLand：每枚到達；沒飛成就以 -1 叫一次）；一次一個，最多排 2 個 ----------
const featQ: [string, string, number, ((i: number) => void) | undefined][] = [];
let featBusy = false,
  featTimers: number[] = [];
export function feat(name: string, line: string, coins: number, onLand?: (i: number) => void): void {
  if (featBusy) {
    if (featQ.length < 2) featQ.push([name, line, coins, onLand]);
    else onLand?.(-1);
    return;
  }
  featBusy = true;
  const f = $('feat');
  const nameEl = f.querySelector<HTMLElement>('.ftName')!;
  nameEl.replaceChildren(
    ...[...name].map((ch, i) => {
      const s = document.createElement('span');
      s.style.animationDelay = `${120 + Math.min(i, 12) * 30}ms`;
      s.textContent = ch === ' ' ? ' ' : ch;
      return s;
    }),
  );
  f.querySelector<HTMLElement>('.ftLine')!.textContent = line;
  f.querySelector<HTMLElement>('.ftN')!.textContent = `+${coins}`;
  $('clear').hidden = true;
  for (const o of pool) if (o.busy && o.node.classList.contains('big')) free(o);
  f.hidden = false;
  fit(f);
  f.classList.remove('out', 'in');
  void f.offsetWidth;
  f.classList.add('in');
  A.play('feat');
  featTimers = [
    window.setTimeout(() => {
      if (!coinFly(center(f.querySelector('.chip')!), $('hudCoins'), 3, onLand)) onLand?.(-1);
    }, 700),
    window.setTimeout(() => f.classList.add('out'), 2100),
    window.setTimeout(() => {
      f.hidden = true;
      featBusy = false;
      const n = featQ.shift();
      if (n) feat(...n);
    }, 2300),
  ];
}
function hideFeat(): void {
  for (const tm of featTimers) clearTimeout(tm);
  featTimers = [];
  for (const q of featQ) q[3]?.(-1);
  featQ.length = 0;
  featBusy = false;
  $('feat').hidden = true;
}

// ---------- 過關浮層：貼紙、三顆星（星下是拿星的依據：關卡、蒼蠅數、時間）、金幣、NEW BEST。不擋輸入、沒有按鈕；什麼時候亮由 main.ts 的節拍決定 ----------
const replay = (el: HTMLElement) => {
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
};
export function clearShow(title: string, sub: { level: string; flies: number; fliesTotal: number; time: number; par: number }): void {
  hideFeat(); // 大型跳字（正中紅心）留著：它在角色旁邊，浮層在上半部
  const c = $('clear');
  $('clearTitle').textContent = title;
  for (const el of c.querySelectorAll('.cs')) el.classList.remove('hit');
  $('csLevel').textContent = sub.level;
  $('csFlies').innerHTML = `${icon('fly')}${sub.flies}/${sub.fliesTotal}`;
  $('csTime').textContent = t('result.time', { time: sub.time.toFixed(1), par: sub.par });
  $('clearCoins').hidden = true;
  $('clearBest').hidden = true;
  c.hidden = false;
  fit(c);
  replay($('clearTitle'));
}
export function clearStar(i: number, silent = false): void {
  const el = $('clear').querySelectorAll<HTMLElement>('.cs')[i];
  if (!el) return;
  el.classList.add('hit');
  if (!silent) A.play('star', { i });
}
export function clearCoins(n: number): void {
  const el = $('clearCoins');
  $('clearCoinN').textContent = `+${fmt(n)}`;
  el.hidden = false;
  replay(el);
}
export function clearBest(): void {
  $('clearBest').hidden = false;
}
export function clearHide(): void {
  $('clear').hidden = true;
}

// ---------- 無盡結束浮層：距離、分數與最佳、倒數條（跑完自動新一局） ----------
export function overShow(best: number): void {
  hideFeat();
  dieText(null); // RUN OVER 貼紙取代死亡大字（兩個都在畫面中上，會疊）
  $('ovDist').textContent = '0';
  $('ovScore').textContent = '0';
  $('ovBest').textContent = t('over.bestVal', { dist: best });
  $('ovDistRow').hidden = true;
  $('ovScoreRow').hidden = true;
  $('ovNew').hidden = true;
  $('ovCdWrap').hidden = true;
  const o = $('over');
  o.hidden = false;
  fit(o);
  replay(o.querySelector<HTMLElement>('.sticker')!);
}
export function overDist(n: number, newBest: boolean, fast: boolean): void {
  $('ovDistRow').hidden = false;
  $('ovNew').hidden = !newBest;
  if (fast) $('ovDist').textContent = fmt(n);
  else countTo([$('ovDist')], 0, n, 400);
}
export function overScore(n: number): void {
  $('ovScoreRow').hidden = false;
  $('ovScore').textContent = fmt(n);
}
// 倒數條：sec 秒內從滿縮到空（0＝直接空）
export function overCountdown(sec: number): void {
  const w = $('ovCdWrap'),
    b = $('ovCd');
  w.hidden = false;
  b.style.transition = 'none';
  b.style.transform = 'scaleX(1)';
  void b.offsetWidth;
  b.style.transition = sec > 0 ? `transform ${sec}s linear` : 'none';
  b.style.transform = 'scaleX(0)';
}
export function overHide(): void {
  $('over').hidden = true;
}

// ---------- 觸控教學：mode＝null｜'hold'｜'let' ----------
let tutMode: string | null = null;
export function tut(mode: 'hold' | 'let' | null): void {
  if (mode === tutMode) return;
  tutMode = mode;
  const el = $('tut');
  el.className = mode ? `on ${mode}` : '';
  if (mode) el.querySelector<HTMLElement>('.tutText')!.textContent = t(mode === 'hold' ? 'tut.hold' : 'tut.let');
}

// ---------- 選單 ----------
export function setPlay(label: string): void {
  $('playLbl').textContent = label;
  fit($('menu'));
}
export function setEndless(ok: boolean): void {
  $('endlessBtn').classList.toggle('locked', !ok);
  $('endlessBtn').innerHTML = `<span>${t('menu.endless')}</span>${ok ? '' : icon('lock')}`;
}
export function setHero(skin: Skin): void {
  drawPortrait(skin.id, $<HTMLCanvasElement>('heroImg'), 384);
  $('heroName').textContent = itemName('skins', skin);
}
// 下一步推薦：pic＝{ skin } 或 { icon }
export function nextUp(text: string | null, sub?: string, pic: { skin?: string; icon?: string } | null = null): void {
  const b = $('nextUp');
  if (!text) {
    b.style.display = 'none';
    return;
  }
  const p = pic?.skin ? `<img src="${portraitURL(pic.skin, 96)}" alt="" />` : icon(pic?.icon ?? 'play');
  b.innerHTML = `<span class="nuPic">${p}</span><span class="t">${text}${sub ? `<small>${sub}</small>` : ''}</span><span class="arr">&rarr;</span>`;
  if (b.style.display === 'none') A.play('next_up');
  b.style.display = '';
  fit(b.parentElement!);
}

// ---------- 選關：世界卡片＋15 顆關卡膠珠（每關最佳星數；星數不鎖關） ----------
let worldTab = 0;
const starRow = (n: number, cls = 'st') => `<span class="${cls}">${[0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
export function renderLevels(save: Save, onPick: (n: number) => void, onTab?: (w: number) => void): void {
  const tabs = $('worldTabs');
  tabs.innerHTML = '';
  WORLDS.forEach((w, i) => {
    const first = i * 15 + 1,
      locked = first > save.unlocked;
    const got = Array.from({ length: 15 }, (_, k) => save.stars[first + k] ?? 0).reduce((a, b) => a + b, 0);
    const b = document.createElement('button');
    b.className = `wcard${i === worldTab ? ' on' : ''}${locked ? ' locked' : ''}`;
    b.style.cssText = `--s0:${w.sky[0]};--s1:${w.sky[1]};--d:${WORLD_DEEP[i]};--p:${w.petal}`;
    b.innerHTML = `<i class="blob"></i>${locked ? `<span class="lk">${icon('lock')}</span>` : ''}<span class="wn" data-fit>${t(`world.${i}`, null, w.name)}</span><span class="wp" data-fit>${locked ? t('levels.open', { level: levelLabel(first - 1) }) : `&#9733; ${got}/45`}</span>`;
    b.onclick = () => {
      if (locked) {
        A.play('ui_nope');
        return;
      }
      worldTab = i;
      renderLevels(save, onPick, onTab);
      onTab?.(i);
    };
    tabs.appendChild(b);
  });
  // 主題系列關卡：每個主題一張卡，擁有整套才開；關卡號接在主線後面
  THEMES.forEach((th, j) => {
    const i = WORLDS.length + j,
      locked = !ownsTheme(save.owned, th),
      first = LEVEL_COUNT + j * THEME_LEVELS + 1;
    const got = Array.from({ length: THEME_LEVELS }, (_, k) => save.stars[first + k] ?? 0).reduce((a, b) => a + b, 0);
    const b = document.createElement('button');
    b.className = `wcard${i === worldTab ? ' on' : ''}${locked ? ' locked' : ''}`;
    b.style.cssText = '--s0:#ffd6e8;--s1:#fff3f8;--d:#8e2f6b;--p:#ff7ab8';
    b.innerHTML = `<i class="blob"></i>${locked ? `<span class="lk">${icon('lock')}</span>` : ''}<span class="wn" data-fit>&#9733; ${itemName(
      'skins',
      SKINS.find((k) => k.id === th.skin),
    )}</span><span class="wp" data-fit>${locked ? t('levels.set') : `&#9733; ${got}/${THEME_LEVELS * 3}`}</span>`;
    b.onclick = () => {
      if (locked) {
        A.play('ui_nope');
        return;
      }
      worldTab = i;
      renderLevels(save, onPick, onTab);
      onTab?.(i);
    };
    tabs.appendChild(b);
  });
  const total = Object.entries(save.stars).reduce((a, [k, v]) => a + (Number(k) <= LEVEL_COUNT ? v : 0), 0);
  $('starTotal').textContent = `${total}/${LEVEL_COUNT * 3}`;
  const g = $('levelGrid');
  g.innerHTML = '';
  const themeTab = worldTab >= WORLDS.length,
    count = themeTab ? THEME_LEVELS : 15,
    base = themeTab ? LEVEL_COUNT + (worldTab - WORLDS.length) * THEME_LEVELS : worldTab * 15;
  for (let k = 0; k < count; k++) {
    const n = base + k + 1;
    if (!themeTab && n > LEVEL_COUNT) break;
    const b = document.createElement('button'),
      locked = !themeTab && n > save.unlocked,
      cur = !themeTab && n === save.unlocked;
    b.className = `lvb${locked ? ' locked' : cur ? ' cur' : ''}`;
    b.innerHTML = locked ? icon('lock') : `<span>${k + 1}</span>${starRow(save.stars[n] ?? 0)}`;
    b.setAttribute('aria-label', t(locked ? 'aria.levelLocked' : 'aria.level', { level: levelLabel(n) }));
    b.onclick = () => {
      if (locked) {
        A.play('ui_nope');
        return;
      }
      onPick(n);
    };
    g.appendChild(b);
  }
  fit(tabs);
}
export function setWorldTab(n: number): void {
  worldTab = n > LEVEL_COUNT ? WORLDS.length + Math.floor((n - LEVEL_COUNT - 1) / THEME_LEVELS) : worldOf(n);
}
export const getWorldTab = () => worldTab;

// ---------- 商店 ----------
let shopTab: ShopTab = 'skins';
export function setShopTab(tab: ShopTab): void {
  shopTab = tab;
}
const LISTS: Record<ShopTab, readonly Item[]> = { skins: SKINS, tongues: TONGUES, trails: TRAILS };
const EQ = { skins: 'skin', tongues: 'tongue', trails: 'trail' } as const;
const TONGUE_LOOK: Record<string, [string, number]> = { tongue: ['#ff4f7a', 14], yarn: ['url(#yarnP)', 10], vine: ['url(#vineP)', 12], silk: ['#eef0ff', 5] };
function tongueSvg(id: string): string {
  const [c, w] = TONGUE_LOOK[id] ?? TONGUE_LOOK.tongue,
    tipC = c.startsWith('url') ? (id === 'vine' ? '#7ad151' : '#ff6fb5') : c;
  return `<svg class="tsw" viewBox="0 0 120 80"><path d="M12 66 C 40 66, 50 20, 96 18" stroke="rgba(40,30,70,.16)" stroke-width="${w + 4}" fill="none" stroke-linecap="round" transform="translate(0 4)"/>
    <path d="M12 66 C 40 66, 50 20, 96 18" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round"/><circle cx="98" cy="18" r="${Math.max(7, w * 0.9)}" fill="${tipC}" stroke="rgba(40,30,70,.15)" stroke-width="2"/></svg>`;
}
function trailSvg(it: TrailSpec): string {
  const cols = it.colors,
    id = `tr-${it.id}`,
    stops = cols.map((c, i) => `<stop offset="${i / Math.max(1, cols.length - 1)}" stop-color="${c}"/>`).join('');
  return `<svg class="tsw" viewBox="0 0 120 80"><defs><linearGradient id="${id}">${stops}</linearGradient></defs><path d="M8 50 Q 60 22 102 40" stroke="url(#${id})" stroke-width="16" fill="none" stroke-linecap="round" opacity="${it.id === 'none' ? 0.55 : 0.95}"/>
    <circle cx="104" cy="40" r="11" fill="#fff" stroke="rgba(40,30,70,.15)" stroke-width="2"/><circle cx="100" cy="36" r="3" fill="#fff"/></svg>`;
}
const picOf = (tab: ShopTab, it: Item) => (tab === 'skins' ? `<img src="${portraitURL(it.id)}" alt="" />` : tab === 'tongues' ? tongueSvg(it.id) : trailSvg(it as TrailSpec));
// 特價剩多少：小時或分鐘（單位字母不翻譯）
const left = (ms: number) => (ms >= 3600000 ? `${Math.ceil(ms / 3600000)}h` : `${Math.max(1, Math.ceil(ms / 60000))}m`);
export function renderShop(save: Save, onAct: (tab: ShopTab, it: Item) => void, hi: string | null, onSet: (th: Theme) => void, now = Date.now()): void {
  for (const tb of document.querySelectorAll<HTMLElement>('#shop .tab')) {
    tb.classList.toggle('on', tb.dataset.t === shopTab);
    tb.onclick = () => {
      shopTab = tb.dataset.t as ShopTab;
      A.play('tab');
      renderShop(save, onAct, hi, onSet, now);
    };
  }
  // 展示台：主題組合包（第一個主題）永遠置頂——整套買、整套用；單品在分頁裡照舊、集齊也算擁有整套
  const th = THEMES[0],
    skin = SKINS.find((k) => k.id === th.skin)!,
    owned = ownsTheme(save.owned, th),
    buy = $('showBuy');
  const on = owned && save.theme === th.id && save.skin === th.skin && save.tongue === th.tongue && save.trail === th.trail;
  const price = themePrice(th, save.saleAt, now),
    sale = price < th.price;
  buy.className = `b buy ${owned ? 'go owned' : 'sun'}`;
  buy.innerHTML = on
    ? `${icon('check')}<span>${t('shop.equipped')}</span>`
    : owned
      ? `<span>${t('shop.useIt')}</span>`
      : `${icon('coin')}${sale ? `<s class="num">${th.price}</s>` : ''}<span class="num">${price}</span><span>${t('shop.buy')}</span>`;
  $('showName').textContent = itemName('skins', skin);
  $('showSpin').setAttribute('aria-label', itemName('skins', skin));
  $('showSub').textContent = t('shop.setLine', {
    skin: itemName('skins', skin),
    tongue: itemName(
      'tongues',
      TONGUES.find((x) => x.id === th.tongue),
    ),
    trail: itemName(
      'trails',
      TRAILS.find((x) => x.id === th.trail),
    ),
    n: THEME_LEVELS,
  });
  $('showRibbon').textContent = sale && !owned ? t('shop.saleEnds', { time: left(save.saleAt + th.sale!.hours * 3600000 - now) }) : t('shop.set');
  buy.onclick = () => onSet(th);
  // 只有一樣東西會呼吸：買得起的組合包 > 選單推薦的那件 > 這一頁最便宜買得起的
  const setFirst = !owned && save.coins >= price;
  buy.classList.toggle('afford', setFirst);
  const list = LISTS[shopTab],
    eqId = save[EQ[shopTab]];
  const cheapest = list.filter((it) => !save.owned.includes(it.id) && it.price <= save.coins).sort((a, b) => a.price - b.price)[0]?.id;
  const breathe = setFirst ? null : hi && list.some((it) => it.id === hi) ? hi : cheapest;
  const c = $('cards');
  c.innerHTML = '';
  let hiEl: HTMLElement | null = null;
  for (const it of list) {
    const owned = save.owned.includes(it.id),
      eq = it.id === eqId,
      poor = !owned && save.coins < it.price;
    const d = document.createElement('button');
    d.className = `card${eq ? ' eq' : ''}${poor ? ' poor' : ''}${it.id === breathe && !owned ? ' afford' : ''}`;
    const pr = eq
      ? `<span class="price eq" data-fit>${icon('check')}${t('shop.on')}</span>`
      : owned
        ? `<span class="price own" data-fit>${t('shop.tapToUse')}</span>`
        : `<span class="price${poor ? ' no' : ''}">${icon('coin')}<span class="num">${it.price}</span></span>`;
    const tongue = 'tongue' in it ? it.tongue : undefined;
    const tag = tongue
      ? `<span class="tag" data-fit>${t('shop.bundle', {
          tongue: itemName(
            'tongues',
            TONGUES.find((x) => x.id === tongue),
          ),
        })}</span>`
      : '';
    const nm = itemName(shopTab, it);
    d.innerHTML = `${tag}<div class="pic">${picOf(shopTab, it)}</div><div class="nm" data-fit>${nm}</div>${pr}`;
    d.dataset.id = it.id;
    d.setAttribute('aria-label', owned ? nm : t('aria.itemPrice', { item: nm, price: it.price }));
    d.onclick = () => onAct(shopTab, it);
    c.appendChild(d);
    if (it.id === hi) hiEl = d;
  }
  hiEl?.scrollIntoView?.({ block: 'nearest' });
  fit($('shop'));
}
// 買完：金幣從錢包飛進那件東西 → 東西跳起來＋軟糖泡泡 → 試玩面板落下
let tryTimer = 0;
export function tryNow(name: string | null, it: Item | null = null): void {
  const tn = $('tryNow');
  clearTimeout(tryTimer);
  if (!name) {
    tn.classList.remove('on');
    return;
  }
  const tab: ShopTab = it && SKINS.includes(it as Skin) ? 'skins' : it && TONGUES.includes(it as TongueSpec) ? 'tongues' : 'trails';
  const target = it === FEATURED ? document.querySelector<HTMLElement>('#showcase .spin') : document.querySelector<HTMLElement>(`#cards [data-id="${it?.id}"] .pic`);
  if (target) {
    coinFly(center($('shopCoins')), target, 8);
    window.setTimeout(() => {
      target.classList.remove('hop');
      void target.offsetWidth;
      target.classList.add('hop');
      goo(center(target), GOO);
    }, 520);
  }
  const nm = it ? itemName(tab, it) : name;
  $('tryTitle').textContent = t('shop.yours', { item: nm });
  $('tryPic').innerHTML = it ? picOf(tab, it) : '';
  $('tryLine').textContent = t('shop.tryLine', { item: nm });
  tryTimer = window.setTimeout(
    () => {
      tn.classList.add('on');
      fit(tn);
      const p = tn.querySelector<HTMLElement>('.panel')!;
      p.classList.remove('drop');
      void p.offsetWidth;
      p.classList.add('drop');
      A.play('panel_in');
    },
    target ? 1100 : 0,
  );
}

// ---------- 高光紀錄頁 ----------
export function renderRecords(save: Save, lastScore?: number): void {
  $('featCards').innerHTML = FEATS.map((f) => {
    const r = save.feats[f.id];
    return r
      ? `<div class="fcard"><div class="fh" data-fit>${featName(f.id)}</div><div class="fl">${featLine(f.id)}</div><div class="fb">${featVal(f, r.best)}</div><div class="fx">${t('records.count', { n: r.count, day: r.first })}</div></div>`
      : `<div class="fcard lock"><div class="fh">${t('records.locked')}</div><div class="fl">${featLine(f.id)}</div><div class="fb">${t('records.notYet')}</div><div class="fx">&nbsp;</div></div>`;
  }).join('');
  $('lbList').innerHTML = save.lb.length
    ? save.lb.map((e) => `<li class="${e.score === lastScore ? 'me' : ''}">${fmt(e.score)}<span>${t('hud.dist', { dist: e.dist })}</span></li>`).join('')
    : `<li>${t('records.empty')}</li>`;
  fit($('records'));
}

// ---------- 暫停 ----------
export function pauseMeta(text: string): void {
  $('pMeta').textContent = text;
}

// ---------- 成就名稱、稱讚、數值（英文留在 feats.ts 當備援；其他語言 feat.<id>／featLine.<id>） ----------
export const featName = (id: string) => t(`feat.${id}`, null, featById(id)?.name ?? id);
export const featLine = (id: string) => t(`featLine.${id}`, null, featById(id)?.line ?? '');
const FEAT_VAL: Record<string, [string, number]> = {
  spin: ['featVal.spins', 0],
  tornado: ['featVal.spins', 0],
  flow: ['featVal.stalled', 2],
  speed: ['featVal.speed', 1],
  skim: ['featVal.above', 2],
  shave: ['featVal.gap', 2],
};
function featVal(f: FeatDef, v: number): string {
  const e = FEAT_VAL[f.id];
  return e ? t(e[0], { n: v, v: Number(v).toFixed(e[1]) }) : f.fmt(v);
}
