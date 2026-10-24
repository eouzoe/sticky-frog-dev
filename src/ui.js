// DOM 介面：畫面切換、HUD、跳字、關卡地圖、商店、結算（星星一顆顆砸下、數字跳動累加）。
import { SKINS, TRAILS, WORLDS } from './config.js';
import { LEVEL_COUNT, levelLabel, worldOf } from './level.js';

const $ = (id) => document.getElementById(id);
const screens = ['menu', 'levels', 'shop', 'result', 'pause', 'block'];

export function show(name) {
  for (const s of screens) $(s).classList.toggle('on', s === name);
  if (name) dieText(null);
  $('hud').classList.toggle('on', name === null || name === 'pause' || name === 'block');
  if (name === 'result') { const p = $('resultPanel'); p.classList.remove('pop'); void p.offsetWidth; p.classList.add('pop'); }
}
export function showHud(on) { $('hud').classList.toggle('on', on); }

export function setCoins(n) { for (const el of document.querySelectorAll('.coinN')) el.textContent = n; }

let hudCache = {};
export function hud(o) {
  const set = (id, v) => { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } };
  set('hudLevel', `LEVEL ${levelLabel(o.level)}`);
  set('hudScore', String(o.score));
  set('hudFlies', `${o.flies}/${o.fliesTotal}`);
  set('hudTime', `${o.time.toFixed(1)}s`);
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

// 關卡地圖
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
    const b = document.createElement('button'), locked = n > save.unlocked, st = save.stars[n] ?? 0;
    b.className = `lvl${locked ? ' locked' : ''}`;
    b.innerHTML = `${locked ? '?' : k + 1}<div class="st">${[0, 1, 2].map((i) => `<span class="${i < st ? 'on-star' : 'off-star'}">&#9733;</span>`).join('')}</div>`;
    if (!locked) b.onclick = () => onPick(n);
    g.appendChild(b);
  }
  const total = Object.values(save.stars).reduce((a, b) => a + b, 0);
  $('starTotal').textContent = `★ ${total}/${LEVEL_COUNT * 3}`;
}
export function setWorldTab(n) { worldTab = worldOf(n); }

// 商店
let shopTab = 'skins';
export function renderShop(save, onAct) {
  for (const t of document.querySelectorAll('#shop .tab')) {
    t.classList.toggle('on', t.dataset.t === shopTab);
    t.onclick = () => { shopTab = t.dataset.t; renderShop(save, onAct); };
  }
  const list = shopTab === 'skins' ? SKINS : TRAILS, eqId = shopTab === 'skins' ? save.skin : save.trail;
  const c = $('cards'); c.innerHTML = '';
  for (const it of list) {
    const owned = save.owned.includes(it.id), eq = it.id === eqId;
    const d = document.createElement('button'); d.className = `card${eq ? ' eq' : ''}`;
    const sw = shopTab === 'skins'
      ? `<div class="swatch" style="background:radial-gradient(circle at 50% 75%, ${it.belly} 30%, ${it.body} 32%)"></div>`
      : `<div class="tswatch" style="background:linear-gradient(90deg, ${it.colors.join(',')})"></div>`;
    const pr = eq ? 'EQUIPPED' : owned ? 'TAP TO USE' : `<span class="coin"></span>${it.price}`;
    d.innerHTML = `${sw}<div class="nm">${it.name}</div><div class="pr" style="color:${!owned && save.coins < it.price ? '#c0392b' : 'inherit'}">${pr}</div>`;
    d.onclick = () => onAct(shopTab, it);
    c.appendChild(d);
  }
}

// 結算：星星依序砸下、分數累加
export function showResult(r, sfx) {
  $('resTitle').textContent = r.title;
  const stars = document.querySelectorAll('#result .bigstar');
  stars.forEach((s) => s.classList.remove('got'));
  $('resBest').style.display = 'none';
  const rows = [
    ['TIME', `${r.time.toFixed(1)}s`, r.time <= r.par ? '' : `par ${r.par}s`],
    ['FLIES', `${r.flies}/${r.fliesTotal}`, r.fliesOk ? '' : `need ${r.fliesNeed}`],
    ['FLIPS', String(r.flips), ''],
    ['SCORE', '0', ''],
    ['BEST', String(r.best ?? r.score), ''],
  ];
  $('resStats').innerHTML = rows.map(([a, b, c], i) => `<span>${a}</span><b id="rs${i}">${b}${c ? ` <small class="miss">(${c})</small>` : ''}</b>`).join('');
  $('resCoins').textContent = '0';
  $('resDouble').style.display = r.offerDouble ? '' : 'none';
  show('result');
  const got = [true, r.fliesOk, r.time <= r.par];
  let delay = 350;
  got.forEach((g, i) => {
    if (!g) return;
    setTimeout(() => { stars[i].classList.add('got'); sfx('star', i); }, delay); delay += 330;
  });
  const t0 = performance.now(), dur = 900;
  const tick = () => {
    const u = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - u, 3);
    const el = $('rs3'); if (el) el.textContent = String(Math.round(r.score * e));
    $('resCoins').textContent = String(Math.round(r.coins * e));
    if (u < 1) { if (Math.random() < 0.5) sfx('coin'); requestAnimationFrame(tick); }
    else if (r.newBest) $('resBest').style.display = '';
  };
  setTimeout(() => requestAnimationFrame(tick), 250);
}
export function setResultCoins(n) { $('resCoins').textContent = String(n); }
