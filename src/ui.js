// DOM 介面：畫面切換、HUD（含即時金幣）、跳字、成就稱讚、觸控教學、關卡地圖、商店、紀錄頁、無盡結算。
import { SKINS, TRAILS, TONGUES, WORLDS } from './config.js';
import { FEATS } from './feats.js';
import { LEVEL_COUNT, levelLabel, worldOf } from './level.js';

const $ = (id) => document.getElementById(id);
const screens = ['menu', 'levels', 'shop', 'records', 'over', 'pause', 'block'];

export function show(name) {
  for (const s of screens) $(s).classList.toggle('on', s === name);
  if (name) dieText(null);
  $('hud').classList.toggle('on', name === null || name === 'pause' || name === 'block');
  if (name === 'over') { const p = $('overPanel'); p.classList.remove('pop'); void p.offsetWidth; p.classList.add('pop'); }
  if (name !== null && name !== 'block') tut(null);
}
export function showHud(on) { $('hud').classList.toggle('on', on); }

export function setCoins(n) { for (const el of document.querySelectorAll('.coinN')) el.textContent = n; }

let hudCache = {};
export function hud(o) {
  const set = (id, v) => { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } };
  set('hudLevel', o.endless ? `ENDLESS  ${o.dist} m` : `LEVEL ${levelLabel(o.level)}`);
  set('hudScore', String(o.score));
  set('hudFlies', o.endless ? String(o.flies) : `${o.flies}/${o.fliesTotal}`);
  set('hudTime', `${o.time.toFixed(1)}s`);
  $('prog').style.display = o.endless ? 'none' : '';
  $('progFill').style.transform = `scaleX(${o.prog.toFixed(3)})`;
  const pb = $('progBest'); if (o.best > 0.02) { pb.style.display = 'block'; pb.style.left = `${(o.best * 100).toFixed(1)}%`; } else pb.style.display = 'none';
  const c = $('combo');
  if (o.combo >= 2) {
    c.style.opacity = 1; set('comboN', `x${o.combo}`);
    c.style.transform = `scale(${1 + Math.min(0.6, o.combo * 0.03) + o.comboPulse * 0.4})`;
    $('comboBar').style.transform = `scaleX(${o.comboLeft})`; $('comboBar').style.transformOrigin = 'left';
  } else c.style.opacity = 0;
}

export function hint(text, x, y) {
  const h = $('hint');
  if (!text) { h.style.display = 'none'; return; }
  h.style.display = 'block'; h.style.left = `${x}px`; h.style.top = `${y}px`;
  if ($('hintText').textContent !== text) $('hintText').textContent = text;
}

const pool = [];
export function popup(text, x, y, cls = '') {
  let el = pool.find((e) => !e.busy);
  if (!el) { el = { node: document.createElement('div'), busy: false }; $('popups').appendChild(el.node); pool.push(el); el.node.addEventListener('animationend', () => { el.busy = false; el.node.style.display = 'none'; }); }
  if (cls.includes('big')) for (const o of pool) if (o.busy && o.node.classList.contains('big')) { o.busy = false; o.node.style.display = 'none'; }
  el.busy = true;
  const n = el.node;
  n.className = `pp stroke ${cls}`; n.textContent = text;
  n.style.left = `${Math.max(80, Math.min(innerWidth - 80, x))}px`; n.style.top = `${Math.max(60, Math.min(innerHeight - 40, y))}px`;
  n.style.display = 'block'; n.style.animation = 'none'; void n.offsetWidth; n.style.animation = '';
}

let flashA = 0;
export function flash(a = 0.7) { flashA = Math.max(flashA, a); }
export function tickFlash(dt) { flashA = Math.max(0, flashA - dt * 3.2); $('flash').style.opacity = flashA.toFixed(3); }

export function dieText(t) {
  const d = $('dieText');
  if (!t) { d.classList.remove('on'); return; }
  d.textContent = t; d.classList.remove('on'); void d.offsetWidth; d.classList.add('on');
}

export function setToggles(save) {
  for (const b of document.querySelectorAll('.musicT')) b.style.opacity = save.music ? 1 : 0.45;
  for (const b of document.querySelectorAll('.sfxT')) b.style.opacity = save.sfx ? 1 : 0.45;
}

// 即時金幣（HUD）：數字變了就彈一下
let coinShown = -1, bumpT = 0;
export function hudCoins(n) {
  if (n === coinShown) return;
  const el = $('hudCoins'); if (coinShown >= 0 && n > coinShown) { el.classList.add('bump'); clearTimeout(bumpT); bumpT = setTimeout(() => el.classList.remove('bump'), 140); }
  coinShown = n; $('hudCoinN').textContent = n;
}

// 成就稱讚：大字＋一句話＋金幣
export function feat(name, line, coins) {
  const f = $('feat');
  f.querySelector('.ftName').textContent = name; f.querySelector('.ftLine').textContent = line;
  f.querySelector('.ftN').textContent = `+${coins}`;
  f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
}
$('feat').addEventListener('animationend', () => $('feat').classList.remove('on'));

// 手機觸控教學：mode＝null｜'hold'｜'let'
let tutMode = null;
export function tut(mode) {
  if (mode === tutMode) return;
  tutMode = mode; const t = $('tut');
  t.className = mode ? `on ${mode}` : '';
  if (mode) { t.querySelector('.tutText').textContent = mode === 'hold' ? 'HOLD' : 'LET GO!'; t.querySelector('.tutSub').textContent = mode === 'hold' ? 'anywhere on screen' : 'fly!'; }
}

// 關卡地圖（沒有星星：一關就是一關）
let worldTab = 0;
export function renderLevels(save, onPick) {
  const tabs = $('worldTabs'); tabs.innerHTML = '';
  WORLDS.forEach((w, i) => {
    const b = document.createElement('button'); b.className = `tab${i === worldTab ? ' on' : ''}`; b.textContent = w.name;
    b.onclick = () => { worldTab = i; renderLevels(save, onPick); };
    tabs.appendChild(b);
  });
  const g = $('levelGrid'); g.innerHTML = '';
  for (let k = 0; k < 15; k++) {
    const n = worldTab * 15 + k + 1; if (n > LEVEL_COUNT) break;
    const b = document.createElement('button'), locked = n > save.unlocked;
    b.className = `lvl${locked ? ' locked' : ''}`;
    b.textContent = locked ? '?' : String(k + 1);
    if (!locked) b.onclick = () => onPick(n);
    g.appendChild(b);
  }
}
export function setWorldTab(n) { worldTab = worldOf(n); }

// 商店：HEROES（角色）／TONGUES／TRAILS；hi＝要標出來的那件（選單推薦點進來的）
let shopTab = 'skins';
export function setShopTab(t) { shopTab = t; }
const LISTS = { skins: SKINS, tongues: TONGUES, trails: TRAILS };
const EQ = { skins: 'skin', tongues: 'tongue', trails: 'trail' };
export function renderShop(save, onAct, hi = null) {
  for (const t of document.querySelectorAll('#shop .tab')) {
    t.classList.toggle('on', t.dataset.t === shopTab);
    t.onclick = () => { shopTab = t.dataset.t; renderShop(save, onAct, hi); };
  }
  const list = LISTS[shopTab], eqId = save[EQ[shopTab]];
  const c = $('cards'); c.innerHTML = '';
  let hiEl = null;
  for (const it of list) {
    const owned = save.owned.includes(it.id), eq = it.id === eqId;
    const d = document.createElement('button'); d.className = `card${eq ? ' eq' : ''}${it.featured ? ' feat' : ''}${it.kind === 'cat' ? ' cat' : ''}${it.id === hi && !owned ? ' afford' : ''}`;
    let sw;
    if (shopTab === 'skins') sw = `<div class="swatch" style="background:radial-gradient(circle at 50% 75%, ${it.belly} 30%, ${it.body} 32%)"></div>`;
    else if (shopTab === 'tongues') sw = `<div class="tswatch" style="height:${10 + it.width * 14}px;background:${{ yarn: 'repeating-linear-gradient(60deg,#ff7ab8 0 6px,#ffd0e8 6px 10px)', vine: 'linear-gradient(#3d8f3a,#5fbf4a 40%,#3d8f3a)', silk: 'linear-gradient(#c9d2ff,#fff 50%,#c9d2ff)' }[it.tex] ?? it.color}"></div>`;
    else sw = `<div class="tswatch" style="background:linear-gradient(90deg, ${it.colors.join(',')})"></div>`;
    const pr = eq ? 'EQUIPPED' : owned ? 'TAP TO USE' : `<span class="coin"></span>${it.price}`;
    const tag = it.featured ? '<div class="tag">STAR</div>' : it.tongue ? `<div class="tag">+ ${TONGUES.find((t) => t.id === it.tongue).name}</div>` : '';
    d.innerHTML = `${tag}${sw}<div class="nm">${it.name}</div><div class="pr" style="color:${!owned && save.coins < it.price ? '#c0392b' : 'inherit'}">${pr}</div>`;
    d.dataset.id = it.id;
    d.onclick = () => onAct(shopTab, it);
    c.appendChild(d);
    if (it.id === hi) hiEl = d;
  }
  hiEl?.scrollIntoView?.({ block: 'nearest' });
}
export function tryNow(name) {
  const t = $('tryNow');
  if (!name) { t.style.display = 'none'; return; }
  $('tryTitle').textContent = `${name.toUpperCase()} IS YOURS!`;
  t.style.display = ''; t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop');
}

// 紀錄頁「我的高光」：每種成就第一次達成日期、最佳數值、次數；無盡前 10 名
export function renderRecords(save, lastScore) {
  $('featCards').innerHTML = FEATS.map((f) => {
    const r = save.feats[f.id];
    return r
      ? `<div class="card"><div class="fn">${f.name}</div><div class="fl">${f.line}</div><div class="fb">BEST ${f.fmt(r.best)}</div><div class="fl">x${r.count} &middot; first ${r.first}</div></div>`
      : `<div class="card lock"><div class="fn">???</div><div class="fl">${f.line}</div><div class="fb">not yet</div></div>`;
  }).join('');
  $('lbList').innerHTML = save.lb.length
    ? save.lb.map((e) => `<li class="${e.score === lastScore ? 'me' : ''}">${e.score} &middot; ${e.dist} m</li>`).join('')
    : '<li>Play ENDLESS!</li>';
}

// 無盡結算
export function showOver(r) {
  $('ovNew').style.display = r.newBest ? '' : 'none';
  $('ovStats').innerHTML = [['SCORE', r.score], ['BEST', r.best], ['FLIPS', r.flips], ['RANK', r.rank ? `#${r.rank}` : '-']].map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
  $('ovDouble').style.display = r.offerDouble ? '' : 'none';
  show('over');
  const t0 = performance.now(), dur = 700;
  const tick = () => { const u = Math.min(1, (performance.now() - t0) / dur); $('ovDist').textContent = String(Math.round(r.dist * (1 - Math.pow(1 - u, 3)))); if (u < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

// 選單「下一步」：最顯眼的那顆鈕
export function nextUp(text, sub) {
  const b = $('nextUp');
  if (!text) { b.style.display = 'none'; return; }
  b.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`; b.style.display = '';
}
