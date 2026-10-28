// DOM 介面（設計系統：_out/hook-hero/round2/ui/DESIGN.md，A 軟膠公仔）：畫面切換、按鈕壓扁回彈、HUD、跳字、成就膠囊、
// 過關結算（星星砸下、分數金幣累加）、觸控教學、選關、商店（旋轉貓咪展示台＋購買慶祝）、紀錄頁、無盡結算、選單下一步推薦。
import { SKINS, TRAILS, TONGUES, WORLDS } from './config.js';
import { FEATS, featById } from './feats.js';
import { LEVEL_COUNT, levelLabel, worldOf } from './level.js';
import * as A from './audio.js';
import { t, itemName, fit } from './i18n.js';

const $ = (id) => document.getElementById(id);
const screens = ['menu', 'levels', 'shop', 'records', 'result', 'over', 'pause', 'block'];
const icon = (id, cls = 'i') => `<svg class="${cls}"><use href="#i-${id}" /></svg>`;
const portrait = (id) => `./ui/${id}.webp`;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const FEATURED = SKINS.find((s) => s.featured);
const WORLD_DEEP = ['#0f6b55', '#b02a74', '#2a1458', '#5a1a1a', '#1d5f94']; // 同 index.html body[data-world] 的 --w-deep

export function setWorld(i) { document.body.dataset.world = String(i); }

// ---------- 按下壓扁、放開回彈（一個全域 listener 管所有軟膠元件；音效接點 ui_press／ui_pop／ui_nope 見 DONE.md） ----------
const PRESSABLE = '.b, .bub, .card, .lvb, .wcard';
addEventListener('pointerdown', (e) => {
  const el = e.target instanceof Element && e.target.closest(PRESSABLE);
  if (!el || el.id === 'combo' || el.classList.contains('chip')) return;
  el.classList.remove('rel'); el.classList.add('down'); A.play(el.classList.contains('locked') ? 'ui_nope' : 'ui_press');
  const up = () => {
    removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    el.classList.remove('down');
    if (!el.classList.contains('locked')) { void el.offsetWidth; el.classList.add('rel'); A.play('ui_pop'); }
  };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
});
addEventListener('animationend', (e) => { if (e.animationName === 'newIn') { e.target.hidden = true; e.target.classList.remove('on'); } if (e.animationName === 'rel' || e.animationName === 'relB') e.target.classList.remove('rel'); });

// ---------- 畫面 ----------
export function show(name) {
  for (const s of screens) $(s).classList.toggle('on', s === name);
  document.body.dataset.screen = name ?? 'play';
  if (name) { dieText(null); clearSticker(false); hideFeat(); }
  $('hud').classList.toggle('on', name === null || name === 'pause' || name === 'block');
  if (name !== null && name !== 'block') tut(null);
  const ins = name ? [...$(name).querySelectorAll('[data-in]')] : [];
  if (name && !ins.length) ins.push(...$(name).querySelectorAll('.panel')); // 結算／暫停：面板落下
  for (const [i, el] of ins.slice(0, 8).entries()) { el.classList.remove('drop'); void el.offsetWidth; el.style.animationDelay = `${i * 40}ms`; el.classList.add('drop'); }
  if (name && name !== 'block') A.play('panel_in');
  if (name) requestAnimationFrame(() => fit($(name)));
}
export function showHud(on) { $('hud').classList.toggle('on', on); }

// 金幣（選單／商店／選關的膠囊）：變少時往下跑（買東西看得到錢花掉）
let coinsShown = null;
export function setCoins(n) {
  const els = document.querySelectorAll('.coinN'), from = coinsShown ?? n; coinsShown = n;
  if (from === n || document.body.dataset.screen !== 'shop') { for (const el of els) el.textContent = fmt(n); return; }
  countTo(els, from, n, 600);
}
function countTo(els, from, to, dur, onDone) {
  const t0 = performance.now(); let lastTick = 0;
  const step = (t) => {
    const u = Math.min(1, (t - t0) / dur), v = from + (to - from) * (1 - (1 - u) ** 3);
    for (const el of els) el.textContent = fmt(v);
    if (t - lastTick > 40 && u < 1) { A.play('coin_tick'); lastTick = t; }
    if (u < 1) requestAnimationFrame(step); else onDone?.();
  };
  requestAnimationFrame(step);
}

// ---------- HUD ----------
const hudCache = {};
let comboShown = 0;
export function hud(o) {
  const set = (id, v) => { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } };
  set('hudLevel', o.endless ? t('hud.endless') : levelLabel(o.level));
  set('hudScore', fmt(o.score));
  set('hudFlies', o.endless ? String(o.flies) : `${o.flies}/${o.fliesTotal}`);
  set('hudTime', o.endless ? t('hud.dist', { dist: o.dist }) : t('hud.time', { time: o.time.toFixed(1) }));
  $('prog').style.display = o.endless ? 'none' : '';
  $('progFill').style.transform = `scaleX(${o.prog.toFixed(3)})`;
  $('progKnob').style.left = `${(o.prog * 100).toFixed(1)}%`;
  const pb = $('progBest'); if (o.best > 0.02) { pb.style.display = 'block'; pb.style.left = `${(o.best * 100).toFixed(1)}%`; } else pb.style.display = 'none';
  const c = $('combo');
  if (o.combo >= 2) {
    c.style.opacity = 1; set('comboN', `x${o.combo}`);
    $('comboBar').style.transform = `scaleX(${o.comboLeft.toFixed(3)})`;
    if (Math.floor(o.combo / 5) > Math.floor(comboShown / 5)) bump(c); // 每 5 連壓扁一次，不是每連一次
  } else c.style.opacity = 0;
  comboShown = o.combo;
}
const bump = (el) => { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); };

export function hint(text, x, y) {
  const h = $('hint');
  if (!text) { h.style.display = 'none'; return; }
  h.style.display = 'block'; h.style.left = `${x}px`; h.style.top = `${y}px`;
  if ($('hintText').textContent !== text) $('hintText').textContent = text;
}

// 新元素字卡（NEW）：關卡開場在關名下面顯示 2.6 秒；不含新元素的關傳 null
export function newCard(name) {
  const c = $('newCard');
  if (!name) { c.hidden = true; c.classList.remove('on'); return; }
  const b = $('newName');
  b.textContent = name; c.hidden = false; c.classList.remove('on'); fitNewName(b); void c.offsetWidth; c.classList.add('on');
}
// 標題只准在空白處換行（CJK 照常逐字）：放不下（溢出、或有字被切成兩行／在連字號換行）就一路縮字級，下限 60%（24px）
function fitNewName(b) {
  const cjk = /^(ja|ko|zh)/.test(document.documentElement.lang || '');
  const split = () => {
    if (cjk || !b.firstChild) return false;
    const tn = b.firstChild, re = /\S+/g; let m;
    while ((m = re.exec(tn.data))) {
      const r = document.createRange(); r.setStart(tn, m.index); r.setEnd(tn, m.index + m[0].length);
      if (new Set([...r.getClientRects()].map((q) => Math.round(q.top / 4))).size > 1) return true;
    }
    return false;
  };
  let fs = 40; b.style.fontSize = '';
  while (fs > 24 && (b.scrollWidth > b.clientWidth + 0.5 || split())) { fs -= 1; b.style.fontSize = `${fs}px`; }
}

// 跳字：同時最多 3 個；大字一次只留一個
const pool = [];
export function popup(text, x, y, cls = '') {
  if (cls.includes('big') && !$('feat').hidden) return; // 成就膠囊在場：同時只留一個大型橫幅
  const busy = pool.filter((p) => p.busy).sort((a, b) => a.t - b.t);
  if (cls.includes('big')) for (const o of busy) if (o.node.classList.contains('big')) free(o);
  if (busy.filter((p) => p.busy).length >= 3) free(busy.find((p) => p.busy));
  let el = pool.find((e) => !e.busy);
  if (!el) { el = { node: document.createElement('div'), busy: false, t: 0 }; $('popups').appendChild(el.node); pool.push(el); el.node.addEventListener('animationend', () => free(el)); }
  el.busy = true; el.t = performance.now();
  const n = el.node;
  n.className = `pp tx ${cls}`; n.textContent = text;
  n.style.left = `${Math.max(80, Math.min(innerWidth - 80, x))}px`; n.style.top = `${Math.max(60, Math.min(innerHeight - 40, y))}px`;
  n.style.display = 'block'; n.style.animation = 'none'; void n.offsetWidth; n.style.animation = '';
}
function free(o) { o.busy = false; o.node.style.display = 'none'; }

let flashA = 0;
export function flash(a = 0.7) { flashA = Math.max(flashA, a); }
export function tickFlash(dt) { flashA = Math.max(0, flashA - dt * 3.2); $('flash').style.opacity = flashA.toFixed(3); }

export function dieText(t) {
  const d = $('dieText');
  if (!t) { d.classList.remove('on'); return; }
  d.textContent = t; d.classList.remove('on'); void d.offsetWidth; d.classList.add('on');
}

export function setToggles(save) {
  for (const b of document.querySelectorAll('.musicT')) b.classList.toggle('off', !save.music);
  for (const b of document.querySelectorAll('.sfxT')) b.classList.toggle('off', !save.sfx);
}

// HUD 金幣：數字即時、變多就壓扁一下（80 ms 內多次只做一次）
let coinShown = -1, bumpAt = 0;
export function hudCoins(n) {
  if (n === coinShown) return;
  if (coinShown >= 0 && n > coinShown && performance.now() - bumpAt > 80) { bump($('hudCoins')); bumpAt = performance.now(); }
  coinShown = n; $('hudCoinN').textContent = fmt(n);
}

// ---------- 金幣飛入、軟糖泡泡 ----------
const center = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
export function coinFly(from, toEl, n, onLand) {
  if (!toEl || toEl.getBoundingClientRect().width === 0) return;
  n = Math.min(8, n);
  const [x1, y1] = center(toEl);
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div'); c.className = 'fly'; c.innerHTML = '<svg width="34" height="34"><use href="#i-coin" /></svg>'; document.body.appendChild(c);
    const x0 = from[0] + (Math.random() - 0.5) * 40, y0 = from[1] + (Math.random() - 0.5) * 30, mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 120, my = Math.min(y0, y1) - 90 - Math.random() * 60;
    const kf = [];
    for (let k = 0; k <= 10; k++) { const u = k / 10, a = (1 - u) ** 2, b = 2 * (1 - u) * u, cc = u * u; kf.push({ transform: `translate(${a * x0 + b * mx + cc * x1}px, ${a * y0 + b * my + cc * y1}px) scale(${1 + Math.sin(u * Math.PI) * 0.35})` }); }
    const anim = c.animate(kf, { duration: 450, delay: i * 50, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' });
    anim.onfinish = () => { c.remove(); A.play('coin_land', { n: i }); bump(toEl); onLand?.(i); };
  }
}
function goo(at, colors) {
  for (let i = 0; i < 6; i++) {
    const d = document.createElement('div'), s = 16 + Math.random() * 18; d.className = 'goo';
    Object.assign(d.style, { width: `${s}px`, height: `${s}px`, background: colors[i % colors.length] }); document.body.appendChild(d);
    const ang = -Math.PI / 2 + (i - 2.5) * 0.45, sp = 120 + Math.random() * 70, kf = [];
    for (let k = 0; k <= 12; k++) { const u = k / 12, x = at[0] + Math.cos(ang) * sp * u, y = at[1] + Math.sin(ang) * sp * u + 260 * u * u - s / 2, sc = u < 0.15 ? u / 0.15 : 1 - Math.max(0, u - 0.7) / 0.3; kf.push({ transform: `translate(${x - s / 2}px, ${y}px) scale(${sc * (1 + 0.15 * Math.sin(u * 20))}, ${sc})` }); }
    d.animate(kf, { duration: 820, easing: 'linear', fill: 'both' }).onfinish = () => d.remove();
  }
}
const GOO = ['#ffd23f', '#ff9cbc', '#7be0ff', '#8af5b0', '#ffffff', '#c9b8ff'];

// ---------- 成就稱讚：扭蛋膠囊落下、名字逐字充氣、金幣飛進 HUD；一次一個，最多排 2 個 ----------
const featQ = []; let featBusy = false, featTimers = [];
export function feat(name, line, coins) {
  if (featBusy) { if (featQ.length < 2) featQ.push([name, line, coins]); return; }
  featBusy = true;
  const f = $('feat');
  f.querySelector('.ftName').innerHTML = [...name].map((ch, i) => `<span style="animation-delay:${120 + Math.min(i, 12) * 30}ms">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
  f.querySelector('.ftLine').textContent = line; f.querySelector('.ftN').textContent = `+${coins}`;
  $('clear').hidden = true; for (const o of pool) if (o.busy && o.node.classList.contains('big')) free(o); // 畫面上同時只留一個大型橫幅
  f.hidden = false; fit(f); f.classList.remove('out', 'in'); void f.offsetWidth; f.classList.add('in'); A.play('feat');
  featTimers = [
    setTimeout(() => coinFly(center(f.querySelector('.chip')), $('hudCoins'), 3), 700),
    setTimeout(() => f.classList.add('out'), 2100),
    setTimeout(() => { f.hidden = true; featBusy = false; const n = featQ.shift(); if (n) feat(...n); }, 2300),
  ];
}
function hideFeat() { for (const t of featTimers) clearTimeout(t); featTimers = []; featQ.length = 0; featBusy = false; $('feat').hidden = true; }

// ---------- 過關貼紙（落荷葉後的短暫慶祝） ----------
export function clearSticker(on, text = '') {
  const c = $('clear');
  if (!on) { c.hidden = true; return; }
  if (!$('feat').hidden) return; // 成就膠囊正在捧場：這一刻已經有一個大型橫幅（每事件疊加上限）
  for (const o of pool) if (o.busy && o.node.classList.contains('big')) free(o); // BULLSEYE／LANDED 這類大跳字讓位給貼紙
  c.querySelector('.sticker').textContent = text; c.hidden = false; fit(c);
  const s = c.querySelector('.sticker'); s.style.animation = 'none'; void s.offsetWidth; s.style.animation = '';
}

// ---------- 觸控教學：mode＝null｜'hold'｜'let' ----------
let tutMode = null;
export function tut(mode) {
  if (mode === tutMode) return;
  tutMode = mode; const el = $('tut');
  el.className = mode ? `on ${mode}` : '';
  if (mode) el.querySelector('.tutText').textContent = t(mode === 'hold' ? 'tut.hold' : 'tut.let');
}

// ---------- 選單 ----------
export function setPlay(label) { $('playLbl').textContent = label; fit($('menu')); }
export function setEndless(ok) { $('endlessBtn').classList.toggle('locked', !ok); $('endlessBtn').innerHTML = `<span>${t('menu.endless')}</span>${ok ? '' : icon('lock')}`; }
export function setHero(skin) { const img = $('heroImg'), src = portrait(skin.id); if (!img.src.endsWith(src.slice(1))) img.src = src; $('heroName').textContent = itemName('skins', skin); }
// 下一步推薦：pic＝{ skin } 或 { icon }
export function nextUp(text, sub, pic = null) {
  const b = $('nextUp');
  if (!text) { b.style.display = 'none'; return; }
  const p = pic?.skin ? `<img src="${portrait(pic.skin)}" alt="" />` : icon(pic?.icon ?? 'play');
  b.innerHTML = `<span class="nuPic">${p}</span><span class="t">${text}${sub ? `<small>${sub}</small>` : ''}</span><span class="arr">&rarr;</span>`;
  if (b.style.display === 'none') A.play('next_up');
  b.style.display = ''; fit(b.parentElement);
}

// ---------- 選關：世界卡片＋15 顆關卡膠珠（每關最佳星數；星數不鎖關） ----------
let worldTab = 0;
const starRow = (n, cls = 'st') => `<span class="${cls}">${[0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
export function renderLevels(save, onPick) {
  const tabs = $('worldTabs'); tabs.innerHTML = '';
  WORLDS.forEach((w, i) => {
    const first = i * 15 + 1, locked = first > save.unlocked;
    const got = Array.from({ length: 15 }, (_, k) => save.stars[first + k] ?? 0).reduce((a, b) => a + b, 0);
    const b = document.createElement('button');
    b.className = `wcard${i === worldTab ? ' on' : ''}${locked ? ' locked' : ''}`;
    b.style.cssText = `--s0:${w.sky[0]};--s1:${w.sky[1]};--d:${WORLD_DEEP[i]};--p:${w.petal}`;
    b.innerHTML = `<i class="blob"></i>${locked ? `<span class="lk">${icon('lock')}</span>` : ''}<span class="wn" data-fit>${t(`world.${i}`, null, w.name)}</span><span class="wp" data-fit>${locked ? t('levels.open', { level: levelLabel(first - 1) }) : `&#9733; ${got}/45`}</span>`;
    b.onclick = () => { if (locked) { A.play('ui_nope'); return; } worldTab = i; renderLevels(save, onPick); };
    tabs.appendChild(b);
  });
  const total = Object.values(save.stars).reduce((a, b) => a + b, 0);
  $('starTotal').textContent = `${total}/${LEVEL_COUNT * 3}`;
  const g = $('levelGrid'); g.innerHTML = '';
  for (let k = 0; k < 15; k++) {
    const n = worldTab * 15 + k + 1; if (n > LEVEL_COUNT) break;
    const b = document.createElement('button'), locked = n > save.unlocked, cur = n === save.unlocked;
    b.className = `lvb${locked ? ' locked' : cur ? ' cur' : ''}`;
    b.innerHTML = locked ? icon('lock') : `<span>${k + 1}</span>${starRow(save.stars[n] ?? 0)}`;
    b.setAttribute('aria-label', t(locked ? 'aria.levelLocked' : 'aria.level', { level: levelLabel(n) }));
    b.onclick = () => { if (locked) { A.play('ui_nope'); return; } onPick(n); };
    g.appendChild(b);
  }
  fit(tabs);
}
export function setWorldTab(n) { worldTab = worldOf(n); }

// ---------- 商店 ----------
let shopTab = 'skins';
export function setShopTab(t) { shopTab = t; }
const LISTS = { skins: SKINS, tongues: TONGUES, trails: TRAILS };
const EQ = { skins: 'skin', tongues: 'tongue', trails: 'trail' };
const TONGUE_LOOK = { tongue: ['#ff4f7a', 14], yarn: ['url(#yarnP)', 10], vine: ['url(#vineP)', 12], silk: ['#eef0ff', 5] };
function tongueSvg(id) {
  const [c, w] = TONGUE_LOOK[id] ?? TONGUE_LOOK.tongue, tipC = c.startsWith('url') ? (id === 'vine' ? '#7ad151' : '#ff6fb5') : c;
  return `<svg class="tsw" viewBox="0 0 120 80"><path d="M12 66 C 40 66, 50 20, 96 18" stroke="rgba(40,30,70,.16)" stroke-width="${w + 4}" fill="none" stroke-linecap="round" transform="translate(0 4)"/>
    <path d="M12 66 C 40 66, 50 20, 96 18" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round"/><circle cx="98" cy="18" r="${Math.max(7, w * 0.9)}" fill="${tipC}" stroke="rgba(40,30,70,.15)" stroke-width="2"/></svg>`;
}
function trailSvg(it) {
  const cols = it.colors, id = `tr-${it.id}`, stops = cols.map((c, i) => `<stop offset="${i / Math.max(1, cols.length - 1)}" stop-color="${c}"/>`).join('');
  return `<svg class="tsw" viewBox="0 0 120 80"><defs><linearGradient id="${id}">${stops}</linearGradient></defs><path d="M8 50 Q 60 22 102 40" stroke="url(#${id})" stroke-width="16" fill="none" stroke-linecap="round" opacity="${it.id === 'none' ? 0.55 : 0.95}"/>
    <circle cx="104" cy="40" r="11" fill="#fff" stroke="rgba(40,30,70,.15)" stroke-width="2"/><circle cx="100" cy="36" r="3" fill="#fff"/></svg>`;
}
const picOf = (tab, it) => (tab === 'skins' ? `<img src="${portrait(it.id)}" alt="" loading="lazy" />` : tab === 'tongues' ? tongueSvg(it.id) : trailSvg(it));
let lastAct = null;
export function renderShop(save, onAct, hi = null) {
  lastAct = { save, onAct, hi };
  for (const t of document.querySelectorAll('#shop .tab')) {
    t.classList.toggle('on', t.dataset.t === shopTab);
    t.onclick = () => { shopTab = t.dataset.t; A.play('tab'); renderShop(save, onAct, hi); };
  }
  // 展示台：旋轉貓咪（看板角色）永遠置頂
  const cat = FEATURED, catOwned = save.owned.includes(cat.id), catEq = save.skin === cat.id, buy = $('showBuy');
  buy.className = `b buy ${catOwned ? 'go owned' : 'sun'}`;
  buy.innerHTML = catEq ? `${icon('check')}<span>${t('shop.equipped')}</span>` : catOwned ? `<span>${t('shop.useIt')}</span>` : `${icon('coin')}<span class="num">${cat.price}</span><span>${t('shop.buy')}</span>`;
  $('showName').textContent = itemName('skins', cat); $('showSpin').setAttribute('aria-label', itemName('skins', cat));
  $('showSub').textContent = t('shop.comesWith', { tongue: itemName('tongues', TONGUES.find((x) => x.id === cat.tongue)) });
  buy.onclick = () => onAct('skins', cat);
  // 只有一樣東西會呼吸：買得起的貓 > 選單推薦的那件 > 這一頁最便宜買得起的
  const catFirst = !catOwned && save.coins >= cat.price;
  buy.classList.toggle('afford', catFirst);
  const list = LISTS[shopTab].filter((it) => it !== cat), eqId = save[EQ[shopTab]];
  const cheapest = list.filter((it) => !save.owned.includes(it.id) && it.price <= save.coins).sort((a, b) => a.price - b.price)[0]?.id;
  const breathe = catFirst ? null : (hi && list.some((it) => it.id === hi) ? hi : cheapest);
  const c = $('cards'); c.innerHTML = '';
  let hiEl = null;
  for (const it of list) {
    const owned = save.owned.includes(it.id), eq = it.id === eqId, poor = !owned && save.coins < it.price;
    const d = document.createElement('button');
    d.className = `card${eq ? ' eq' : ''}${poor ? ' poor' : ''}${it.id === breathe && !owned ? ' afford' : ''}`;
    const pr = eq ? `<span class="price eq" data-fit>${icon('check')}${t('shop.on')}</span>` : owned ? `<span class="price own" data-fit>${t('shop.tapToUse')}</span>`
      : `<span class="price${poor ? ' no' : ''}">${icon('coin')}<span class="num">${it.price}</span></span>`;
    const tag = it.tongue ? `<span class="tag" data-fit>${t('shop.bundle', { tongue: itemName('tongues', TONGUES.find((x) => x.id === it.tongue)) })}</span>` : '';
    const nm = itemName(shopTab, it);
    d.innerHTML = `${tag}<div class="pic">${picOf(shopTab, it)}</div><div class="nm" data-fit>${nm}</div>${pr}`;
    d.dataset.id = it.id; d.setAttribute('aria-label', owned ? nm : t('aria.itemPrice', { item: nm, price: it.price }));
    d.onclick = () => onAct(shopTab, it);
    c.appendChild(d);
    if (it.id === hi) hiEl = d;
  }
  hiEl?.scrollIntoView?.({ block: 'nearest' });
  fit($('shop'));
}
// 買完：金幣從錢包飛進那件東西 → 東西跳起來＋軟糖泡泡 → 試玩面板落下
let tryTimer = 0;
export function tryNow(name, it = null) {
  const tn = $('tryNow');
  clearTimeout(tryTimer);
  if (!name) { tn.classList.remove('on'); return; }
  const tab = it?.tab ?? (SKINS.includes(it) ? 'skins' : TONGUES.includes(it) ? 'tongues' : 'trails');
  const target = it === FEATURED ? document.querySelector('#showcase .spin') : document.querySelector(`#cards [data-id="${it?.id}"] .pic`);
  if (target) {
    coinFly(center($('shopCoins')), target, 8);
    setTimeout(() => { target.classList.remove('hop'); void target.offsetWidth; target.classList.add('hop'); goo(center(target), GOO); }, 520);
  }
  const nm = it ? itemName(tab, it) : name;
  $('tryTitle').textContent = t('shop.yours', { item: nm });
  $('tryPic').innerHTML = it ? picOf(tab, it).replace(' loading="lazy"', '') : '';
  $('tryLine').textContent = t('shop.tryLine', { item: nm });
  tryTimer = setTimeout(() => {
    tn.classList.add('on'); fit(tn); const p = tn.querySelector('.panel'); p.classList.remove('drop'); void p.offsetWidth; p.classList.add('drop'); A.play('panel_in');
  }, target ? 1100 : 0);
}
export const tryOpen = () => $('tryNow').classList.contains('on');

// ---------- 高光紀錄頁 ----------
export function renderRecords(save, lastScore) {
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

// ---------- 過關結算：星星一顆顆砸下、分數與金幣累加、這一關的成就；任何「下一步」輸入先把進場動畫跳到結尾 ----------
let res = null;
export function showResult(r) {
  if (res) for (const t of res.timers) clearTimeout(t); // 重播時先停掉上一輪的計時器
  const p = $('resPanel');
  $('resTitle').textContent = r.title;
  $('resLevel').textContent = t('result.level', { level: levelLabel(r.level) });
  const conds = [[t('result.cleared'), true], [t('result.flies', { got: r.flies, total: r.fliesTotal }), r.fliesOk], [t('result.time', { time: r.time.toFixed(1), par: r.par }), r.timeOk]];
  $('resStars').innerHTML = conds.map(([txt, ok], i) => `<div class="rs${ok ? ' got' : ''}"><svg class="rstar"><use href="#i-star" /></svg><span>${txt}</span></div>`).join('');
  $('resScore').textContent = '0'; $('resCoinsN').textContent = '0';
  $('resBest').style.display = r.newBest ? '' : 'none';
  $('resFeats').innerHTML = r.feats.map((id) => `<span class="rf">${featName(id)}</span>`).join('');
  show('result'); fit($('result'));
  p.classList.remove('done'); p.querySelectorAll('.rs').forEach((el) => el.classList.remove('hit'));
  const timers = [];
  let i = 0;
  for (const el of p.querySelectorAll('.rs.got')) {
    const k = i++;
    timers.push(setTimeout(() => { el.classList.add('hit'); A.play('star', { i: k }); }, 380 + k * 330));
  }
  const tCount = 380 + i * 330 + 80;
  timers.push(setTimeout(() => { countTo([$('resScore')], 0, r.score, 600); countTo([$('resCoinsN')], 0, r.coins, 600); }, tCount));
  timers.push(setTimeout(() => finishResult(), tCount + 700));
  res = { r, timers, done: false };
}
// 動畫還沒播完：直接跳到結尾，回 true（這次輸入不算「下一關」）
export function finishResult() {
  if (!res || res.done) return false;
  res.done = true; for (const t of res.timers) clearTimeout(t);
  const p = $('resPanel'); p.classList.add('done');
  p.querySelectorAll('.rs.got').forEach((el) => el.classList.add('hit'));
  $('resScore').textContent = fmt(res.r.score); $('resCoinsN').textContent = fmt(res.r.coins);
  return true;
}
export const resultAnimating = () => !!res && !res.done;

// ---------- 無盡結算 ----------
export function showOver(r) {
  $('ovNew').style.display = r.newBest ? '' : 'none';
  $('ovStats').innerHTML = [[t('over.score'), fmt(r.score)], [t('over.best'), t('over.bestVal', { dist: r.best })], [t('over.flips'), r.flips], [t('over.rank'), r.rank ? `#${r.rank}` : '-']].map(([a, b]) => `<div><span data-fit>${a}</span><b class="num">${b}</b></div>`).join('');
  $('ovDouble').style.display = r.offerDouble ? '' : 'none';
  show('over');
  countTo([$('ovDist')], 0, r.dist, 700);
}

// ---------- 暫停 ----------
export function pauseMeta(text) { $('pMeta').textContent = text; }

// ---------- 成就名稱、稱讚、數值（英文留在 feats.js 當備援；其他語言 feat.<id>／featLine.<id>） ----------
export const featName = (id) => t(`feat.${id}`, null, featById(id)?.name ?? id);
export const featLine = (id) => t(`featLine.${id}`, null, featById(id)?.line ?? '');
const FEAT_VAL = { spin: ['featVal.spins', 0], tornado: ['featVal.spins', 0], flow: ['featVal.stalled', 2], speed: ['featVal.speed', 1], skim: ['featVal.above', 2], shave: ['featVal.gap', 2], clutch: ['featVal.high', 2] };
function featVal(f, v) { const [k, d] = FEAT_VAL[f.id] ?? []; return k ? t(k, { n: v, v: Number(v).toFixed(d) }) : f.fmt(v); }
