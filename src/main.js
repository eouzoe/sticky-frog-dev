// 開機、主迴圈、狀態機、輸入、存檔、事件 → 手感回饋（音效／粒子／震動／慢動作／跳字）。
import { cg } from './cg.js';
import { TUNE as T, WORLDS, SKINS, TRAILS } from './config.js';
import { generateLevel, LEVEL_COUNT, levelLabel, worldOf } from './level.js';
import { createSim, step, movePos } from './sim.js';
import { createView } from './scene.js';
import { createLevelView } from './levelview.js';
import { createFrog } from './frog.js';
import { createFx } from './fx.js';
import * as A from './audio.js';
import * as UI from './ui.js';

const SAVE_KEY = 'sticky-frog-v1';
const DEFAULT_SAVE = { unlocked: 1, stars: {}, best: {}, coins: 0, skin: 'tree', trail: 'none', owned: ['tree', 'none'], music: true, sfx: true, results: 0, grabs: 0, last: 1, worldsDone: [] };
const FLIP_NAMES = ['', 'FLIP!', 'DOUBLE FLIP!', 'TRIPLE FLIP!', 'QUAD FLIP!'];

const canvas = document.getElementById('c');
const view = createView(canvas);
const lvView = createLevelView(view.scene);
const frog = createFrog(view.scene);
const fx = createFx(view.scene);
let save = { ...DEFAULT_SAVE };

const G = {
  state: 'boot', level: 1, lv: null, sim: null, builtLevel: 0, world: -1,
  score: 0, combo: 0, comboT: 0, comboPulse: 0, deaths: 0, restartT: 0, winT: 0, winAnim: 0,
  timeScale: 1, slowT: 0, slowAmt: 0, hitStop: 0, fovKick: 0, acc: 0, hold: false,
  attachesTotal: 0, flipsTotal: 0, wins: 0, tongueWob: 0, tipPop: 1, lick: { x: 0, y: 0, t: 0 },
  cam: { x: 0, y: 7, d: T.CAM_DIST }, resultAt: 0, adBreak: false, lastResult: null, quality: 'high', fps: 60, bestFlip: 0,
};
window.__game = {
  get state() { return G.state; }, get level() { return G.level; }, get score() { return G.score; },
  get attaches() { return G.sim?.attaches ?? 0; }, get attachesTotal() { return G.attachesTotal; }, get flips() { return G.flipsTotal; },
  get bestFlip() { return G.bestFlip; }, get x() { return G.sim?.x ?? 0; }, get maxX() { return G.sim?.maxX ?? 0; }, get mode() { return G.sim?.mode; },
  get deaths() { return G.deaths; }, get wins() { return G.wins; }, get coins() { return save.coins; }, get quality() { return G.quality; },
  get fps() { return G.fps; }, get timeScale() { return G.timeScale; }, get result() { return G.lastResult; }, get hold() { return G.hold; },
  get drawCalls() { return view.info.render.calls; }, get length() { return G.lv?.length ?? 0; },
  // 測試用：把青蛙放到終點上方，讓它自然落在荷葉上完成關卡
  forceWin() { const s = G.sim, g = G.lv.goal; if (!s) return; s.tongue.state = 'idle'; s.mode = 'air'; s.x = g.x; s.y = g.y + 4; s.vx = 0; s.vy = -4; },
};

// ---------- 存檔 ----------
const persist = () => cg.saveJSON(SAVE_KEY, save);
const skinOf = () => SKINS.find((s) => s.id === save.skin) ?? SKINS[0];
const trailOf = () => TRAILS.find((t) => t.id === save.trail) ?? TRAILS[0];
const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* 不支援就算了 */ } };
const sfx = (n, o) => A.play(n, o);

// ---------- 關卡 ----------
function loadLevel(n) {
  G.level = n; G.lv = generateLevel(n);
  const w = WORLDS[G.lv.world];
  if (G.builtLevel !== n) {
    view.setTheme(w, G.lv.length); lvView.build(G.lv, w); G.builtLevel = n;
    document.body.style.background = w.sky[0];
  }
  A.setWorld(G.lv.world);
  resetRun();
}
function resetRun() {
  G.sim = createSim(G.lv); G.score = 0; G.combo = 0; G.comboT = 0; G.restartT = 0; G.winT = 0; G.winAnim = 0; G.acc = 0;
  G.slowT = 0; G.hitStop = 0; lvView.reset(); fx.clear(); fx.resetTrail(G.sim.x, G.sim.y); UI.dieText(null);
  frog.squash(0.7, 0);
}
function startLevel(n) {
  A.initAudio();
  loadLevel(n);
  save.last = n; persist();
  G.state = 'playing'; G.hold = false; UI.show(null); UI.hint(null);
  G.cam.x = G.sim.x + 6; G.cam.y = T.CAM_MIN_Y;
  cg.gameplayStart();
}

// ---------- 連擊與分數 ----------
const mult = () => 1 + Math.min(3, Math.floor(G.combo / 5) * 0.5);
function addCombo() { G.combo++; G.comboT = T.COMBO_WINDOW; G.comboPulse = 1; }
function addScore(v) { const s = Math.round(v * mult()); G.score += s; return s; }
function pop(text, x, y, cls) { const p = view.project(x, y, 0.5); UI.popup(text, p.x, p.y, cls); }
function slowmo(t = T.SLOWMO_TIME) { G.slowT = Math.max(G.slowT, t); A.duckMusic(0.3, t); }

function onEvent(e) {
  const s = G.sim, w = WORLDS[G.lv.world];
  switch (e.type) {
    case 'crouch': sfx('tick'); break;
    case 'jump':
      frog.squash(1.45, Math.atan2(-s.vx, s.vy)); sfx('jump');
      fx.burst(s.x, s.y - 0.5, 10, { colors: [w.wood, '#f5e6c8'], speed: 5, dir: Math.PI / 2, spread: 2.6, size: 0.22 });
      break;
    case 'shoot': sfx('shoot'); G.tongueWob = 0.35; break;
    case 'miss': sfx('miss'); G.tongueWob = 0.5; break;
    case 'attach': {
      G.attachesTotal++; save.grabs++;
      lvView.wobbleHook(e.hook); sfx('attach', { combo: G.combo });
      frog.squash(0.72, s.angle); frog.jiggle(4);
      G.tongueWob = 0.6; G.tipPop = 1.9;
      fx.burst(e.x, e.y, 8, { colors: [w.petal, w.bud, '#ffffff'], speed: 6, size: 0.24, grav: 6 });
      fx.shock(e.x, e.y, 2.2, w.petal, 0.3);
      fx.addTrauma(0.06 + Math.min(0.2, e.speed * 0.006));
      addCombo(); addScore(T.SCORE_GRAB);
      vibrate(8);
      break;
    }
    case 'release':
      sfx('release'); if (e.speed > 21) sfx('whoosh');
      frog.squash(1.4, Math.atan2(-s.vx, s.vy)); frog.jiggle(5);
      G.fovKick = Math.min(9, 2 + e.speed * 0.22); G.tongueWob = 0.7;
      fx.addTrauma(Math.min(0.25, e.speed * 0.008));
      if (e.speed > 20) fx.burst(s.x, s.y, 8, { colors: ['#ffffff'], speed: 4, size: 0.2, grav: 0, shape: 3, life: 0.5 });
      break;
    case 'flip': {
      G.flipsTotal++; G.bestFlip = Math.max(G.bestFlip, e.n);
      addCombo();
      const pts = addScore(T.SCORE_FLIP * e.n);
      sfx('flip', { n: e.n, combo: G.combo });
      const name = e.n < FLIP_NAMES.length ? FLIP_NAMES[e.n] : `${e.n}x FLIP!!`;
      if (e.n >= 2) {
        pop(name, s.x, s.y + 2.6, 'big'); fx.shock(s.x, s.y, 3 + e.n, '#ffd23f', 0.45);
        fx.burst(s.x, s.y, 10 + e.n * 6, { colors: ['#ffd23f', '#ff6fb5', '#7be0ff', '#2ecc71'], speed: 9, size: 0.3, grav: 8, shape: 1, life: 1 });
      } else pop(`${name} +${pts}`, s.x, s.y + 2, 'gold');
      if (e.n === 3 || e.n >= 5) { slowmo(); UI.flash(0.22); G.fovKick -= 6; vibrate(25); }
      fx.addTrauma(0.05 * e.n);
      break;
    }
    case 'fly': {
      lvView.eatFly(e.i); sfx('fly'); addCombo();
      const pts = addScore(T.SCORE_FLY);
      pop(`+${pts}`, e.x, e.y + 1, 'pink');
      fx.burst(e.x, e.y, 8, { colors: ['#ffffff', '#ffd23f', '#222233'], speed: 5, size: 0.16, grav: 4, shape: 2 });
      if (s.tongue.state === 'idle' || s.tongue.state === 'retract') { G.lick.x = e.x; G.lick.y = e.y; G.lick.t = 0.13; G.tongueWob = 0.3; }
      frog.jiggle(3);
      break;
    }
    case 'ring': {
      lvView.takeRing(e.i); sfx('ring'); addCombo();
      const pts = addScore(T.SCORE_RING);
      pop(`RING! +${pts}`, e.x, e.y + 2.6, 'big');
      fx.burst(e.x, e.y, 26, { colors: ['#ffd23f', '#fff6a0', '#ffffff'], speed: 10, size: 0.26, grav: 4, shape: 2 });
      fx.shock(e.x, e.y, 4.5, '#ffd23f', 0.5);
      slowmo(e.speed > 16 || e.flips >= 1 ? T.SLOWMO_TIME : 0.45); G.fovKick -= 5; UI.flash(0.15);
      break;
    }
    case 'bounce': {
      lvView.squashMush(e.i); sfx('bounce'); addCombo(); addScore(T.SCORE_BOUNCE);
      frog.squash(0.55, 0); frog.jiggle(8);
      pop('BOING!', e.x, e.y + 1.5, 'gold');
      fx.burst(e.x, e.y, 14, { colors: [w.cap, w.capSpot, '#ffffff'], speed: 8, dir: Math.PI / 2, spread: 2.2, size: 0.26 });
      fx.shock(e.x, e.y - 0.2, 3.2, '#ffffff', 0.35, true);
      fx.addTrauma(0.25); G.hitStop = 0.045; vibrate(15);
      break;
    }
    case 'fan': sfx('fan'); fx.burst(s.x, s.y - 0.5, 6, { colors: ['#ffffff'], speed: 6, dir: Math.PI / 2, spread: 0.6, size: 0.18, grav: -6, shape: 2 }); break;
    case 'wall': sfx('wall'); fx.addTrauma(0.22); frog.squash(0.6, Math.PI / 2); break;
    case 'die': {
      const water = e.cause === 'water';
      sfx(water ? 'splash' : 'spike'); G.deaths++;
      G.hitStop = water ? 0.06 : 0.11; fx.addTrauma(water ? 0.45 : 0.7); UI.flash(water ? 0.25 : 0.55);
      view.post.amount = water ? 0.012 : 0.03;
      if (water) {
        fx.burst(e.x, 0.2, 34, { colors: [w.water, '#ffffff', w.water], speed: 13, dir: Math.PI / 2, spread: 1.4, size: 0.3, grav: 26 });
        fx.shock(e.x, 0.15, 4, '#ffffff', 0.5, true);
      } else {
        fx.burst(e.x, e.y, 22, { colors: [skinOf().body, skinOf().belly, '#ff3b3b'], speed: 12, size: 0.3, grav: 20 });
        fx.burst(e.x, e.y, 14, { colors: ['#ffffff', '#ffd23f'], speed: 16, size: 0.3, grav: 0, shape: 2, life: 0.35 });
        fx.shock(e.x, e.y, 3.5, '#ff5a5a', 0.35);
      }
      UI.dieText(water ? w.die : 'OUCH!');
      A.duckMusic(0.4, 0.4); vibrate([30, 40, 30]);
      G.combo = 0; G.restartT = T.RESTART_DELAY;
      break;
    }
    case 'win': {
      sfx('win'); lvView.bouncePad(); G.winT = 1.5; G.winAnim = 0;
      frog.squash(0.5, 0);
      const g = G.lv.goal;
      fx.burst(s.x, s.y, 70, { colors: ['#ff6fb5', '#ffd23f', '#2ecc71', '#7be0ff', '#ffffff', '#9b5de5'], speed: 14, dir: Math.PI / 2, spread: 2.4, size: 0.34, grav: 9, shape: 1, life: 1.8 });
      fx.shock(s.x, g.y + 0.1, 6, '#ffffff', 0.6, true);
      slowmo(0.6); fx.addTrauma(0.3); UI.flash(0.3); G.fovKick -= 4; vibrate([20, 30, 60]);
      pop(Math.abs(s.x - g.x) < 1.6 ? 'BULLSEYE!' : 'LANDED!', s.x, s.y + 3, 'big');
      if (Math.abs(s.x - g.x) < 1.6) addScore(200);
      break;
    }
  }
}

// ---------- 結算 ----------
function finishLevel() {
  const s = G.sim, lv = G.lv, n = G.level;
  const fliesNeed = Math.ceil(lv.flies.length * 0.7), fliesOk = s.fliesGot >= fliesNeed, timeOk = s.time <= lv.par;
  const stars = 1 + (fliesOk ? 1 : 0) + (timeOk ? 1 : 0);
  const coins = 10 + stars * 8 + Math.floor(G.score / 100);
  const newBest = G.score > (save.best[n] ?? 0) && (save.best[n] ?? 0) > 0;
  save.best[n] = Math.max(save.best[n] ?? 0, G.score);
  save.stars[n] = Math.max(save.stars[n] ?? 0, stars);
  save.unlocked = Math.max(save.unlocked, Math.min(LEVEL_COUNT, n + 1));
  save.coins += coins; save.results++;
  let title = stars === 3 ? 'PERFECT!' : 'LEVEL CLEAR!';
  if (n % 15 === 0 && !save.worldsDone.includes(n)) { save.worldsDone.push(n); title = 'WORLD CLEAR!'; cg.happytime(); }
  persist();
  G.wins++;
  G.lastResult = { level: n, stars, coins, score: G.score, time: s.time };
  G.state = 'over'; G.resultAt = performance.now(); G.adBreak = false; G.hold = false;
  cg.gameplayStop(); UI.hint(null);
  UI.setCoins(save.coins);
  UI.showResult({ title, time: s.time, par: lv.par, flies: s.fliesGot, fliesTotal: lv.flies.length, fliesNeed, fliesOk, flips: s.flipsTotal, score: G.score, coins, newBest, offerDouble: cg.ready && save.results % 3 === 0 }, sfx);
  G.resCoins = coins;
}
async function afterResult(next) {
  if (G.state !== 'over') return;
  sfx('click');
  if (!G.adBreak) { G.state = 'ad'; UI.show('block'); await cg.midgame(); }
  if (next && G.level >= LEVEL_COUNT) { toMenu(); return; }
  startLevel(next ? G.level + 1 : G.level);
}
async function doubleCoins() {
  if (G.state !== 'over' || G.adBreak) return;
  G.adBreak = true; document.getElementById('resDouble').style.display = 'none';
  G.state = 'ad'; UI.show('block');
  const ok = await cg.rewarded();
  if (ok) { save.coins += G.resCoins; persist(); UI.setCoins(save.coins); }
  G.state = 'over'; UI.show('result'); UI.setResultCoins(ok ? G.resCoins * 2 : G.resCoins);
  document.querySelectorAll('#result .bigstar').forEach((el, i) => { if (i < G.lastResult.stars) el.classList.add('got'); });
}

// ---------- 選單 ----------
function toMenu() {
  if (G.state === 'playing' || G.state === 'paused') cg.gameplayStop();
  G.state = 'menu'; G.hold = false;
  loadLevel(Math.min(save.last, save.unlocked));
  UI.show('menu'); UI.setCoins(save.coins); UI.hint(null);
  document.getElementById('playBtn').textContent = `PLAY ${levelLabel(Math.min(save.unlocked, LEVEL_COUNT))}`;
}
function openLevels() { sfx('click'); G.state = 'levels'; UI.setWorldTab(save.unlocked); UI.renderLevels(save, (n) => { sfx('click'); startLevel(n); }); UI.show('levels'); }
function openShop() { sfx('click'); G.state = 'shop'; renderShop(); UI.show('shop'); }
function renderShop() {
  UI.renderShop(save, (tab, it) => {
    if (!save.owned.includes(it.id)) {
      if (save.coins < it.price) { sfx('miss'); return; }
      save.coins -= it.price; save.owned.push(it.id); sfx('buy'); UI.setCoins(save.coins);
    } else sfx('click');
    if (tab === 'skins') { save.skin = it.id; frog.setSkin(skinOf()); frog.squash(0.6, 0); frog.jiggle(6); }
    else { save.trail = it.id; fx.setTrail(trailOf()); }
    persist(); renderShop();
  });
}
function pause() {
  if (G.state !== 'playing') return;
  G.state = 'paused'; G.hold = false; cg.gameplayStop(); UI.show('pause');
}
function resume() {
  if (G.state !== 'paused') return;
  sfx('click'); G.state = 'playing'; G.hold = false; UI.show(null); cg.gameplayStart();
}
function toggle(key) {
  save[key] = !save[key]; persist(); UI.setToggles(save);
  A.setMusic(save.music); A.setSfx(save.sfx); sfx('click');
}

// ---------- 輸入 ----------
const isUI = (t) => t instanceof Element && !!t.closest('button, .panel, .card, .lvl, .tab');
function press() { if (G.state === 'playing' && G.sim.mode !== 'dead') G.hold = true; }
addEventListener('pointerdown', (e) => {
  A.initAudio();
  if (isUI(e.target)) return;
  if (G.state === 'playing') { e.preventDefault(); press(); }
}, { passive: false });
const up = () => { G.hold = false; };
addEventListener('touchstart', (e) => { A.initAudio(); if (isUI(e.target)) return; if (G.state === 'playing') { e.preventDefault(); press(); } }, { passive: false });
addEventListener('touchend', (e) => { if (e.touches.length === 0) up(); });
addEventListener('touchcancel', up);
addEventListener('pointerup', up); addEventListener('pointercancel', up); addEventListener('blur', () => { up(); pause(); });
addEventListener('contextmenu', (e) => e.preventDefault());
const HOLD_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'ArrowRight', 'KeyD']);
addEventListener('keydown', (e) => {
  if (HOLD_KEYS.has(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
  A.initAudio();
  if (e.repeat) return;
  const act = HOLD_KEYS.has(e.code) || e.code === 'Enter';
  if (G.state === 'playing') {
    if (HOLD_KEYS.has(e.code)) press();
    else if (e.code === 'Escape' || e.code === 'KeyP') pause();
    else if (e.code === 'KeyR') { resetRun(); }
  } else if (G.state === 'paused') { if (act || e.code === 'Escape' || e.code === 'KeyP') resume(); }
  else if (G.state === 'menu') { if (act) startLevel(Math.min(save.unlocked, LEVEL_COUNT)); }
  else if (G.state === 'over') { if (act && performance.now() - G.resultAt > 700) afterResult(true); }
  else if ((G.state === 'levels' || G.state === 'shop') && e.code === 'Escape') { sfx('click'); toMenu(); }
});
addEventListener('keyup', (e) => { if (HOLD_KEYS.has(e.code)) G.hold = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
on('playBtn', () => { sfx('click'); startLevel(Math.min(save.unlocked, LEVEL_COUNT)); });
on('levelsBtn', openLevels); on('shopBtn', openShop);
for (const b of document.querySelectorAll('.back')) b.addEventListener('click', () => { sfx('click'); toMenu(); });
for (const b of document.querySelectorAll('.musicT')) b.addEventListener('click', () => toggle('music'));
for (const b of document.querySelectorAll('.sfxT')) b.addEventListener('click', () => toggle('sfx'));
on('pauseBtn', () => { sfx('click'); pause(); });
on('resumeBtn', resume);
on('pRestart', () => { resume(); resetRun(); });
on('pLevels', () => { cg.gameplayStop(); openLevels(); });
on('pMenu', () => { sfx('click'); toMenu(); });
on('resNext', () => afterResult(true));
on('resRetry', () => afterResult(false));
on('resMenu', () => { sfx('click'); toMenu(); });
on('resDouble', doubleCoins);
document.getElementById('result').addEventListener('pointerdown', (e) => { if (!isUI(e.target) && performance.now() - G.resultAt > 700) afterResult(true); });

// ---------- 主迴圈 ----------
const tipV = { x: 0, y: 0 }, mouth = { x: 0, y: 0, z: 0 }, tmp = { x: 0, y: 0 };
const mood = { lookX: 0, lookY: 0, mouth: false, tongueWob: 0, tipPop: 1, scared: false };
let last = performance.now(), fpsAcc = 0, fpsN = 0, lowSecs = 0, tReal = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; tReal += realDt;
  // 效能監看：平均 < 45 fps 持續 2 秒 → 降畫質
  fpsAcc += realDt; fpsN++;
  if (fpsAcc >= 1) {
    G.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0;
    if (G.state === 'playing' && !document.hidden) { lowSecs = G.fps < 45 ? lowSecs + 1 : 0; if (lowSecs >= 2 && G.quality === 'high') { G.quality = 'low'; view.setQuality(false); } }
  }
  // 慢動作與 hit-stop
  if (G.slowT > 0) G.slowT -= realDt;
  const tsTarget = G.slowT > 0 ? T.SLOWMO_SCALE : 1;
  G.timeScale += (tsTarget - G.timeScale) * Math.min(1, realDt * (tsTarget < G.timeScale ? 16 : 5));
  G.slowAmt = (1 - G.timeScale) / (1 - T.SLOWMO_SCALE);
  let dt = realDt * G.timeScale;
  if (G.hitStop > 0) { G.hitStop -= realDt; dt = 0; }
  const s = G.sim;
  if (s && (G.state === 'playing' || G.state === 'menu' || G.state === 'over' || G.state === 'levels' || G.state === 'shop')) {
    G.acc += dt; let n = 0;
    while (G.acc >= T.DT && n < 14) { step(s, T.DT, G.hold && G.state === 'playing'); G.acc -= T.DT; n++; }
    if (n >= 14) G.acc = 0;
    for (const e of s.events) onEvent(e);
    s.events.length = 0;
    if (G.state === 'playing') updatePlaying(realDt, dt);
  }
  if (s) render(realDt, dt);
}

function updatePlaying(realDt, dt) {
  const s = G.sim;
  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) { if (G.combo >= 5) pop(`COMBO x${G.combo}!`, s.x, s.y + 3, 'gold'); G.combo = 0; } }
  G.comboPulse = Math.max(0, G.comboPulse - realDt * 5);
  if (G.restartT > 0) { G.restartT -= realDt; if (G.restartT <= 0) resetRun(); }
  if (G.winT > 0) { G.winT -= realDt; if (G.winT <= 0) finishLevel(); }
  UI.hud({ level: G.level, score: G.score, flies: s.fliesGot, fliesTotal: G.lv.flies.length, time: s.time, combo: G.combo, comboLeft: Math.max(0, G.comboT / T.COMBO_WINDOW), comboPulse: G.comboPulse });
  // 新手提示：前幾次黏住之前，在目標鉤點上顯示 HOLD、擺到前上方時顯示 RELEASE
  if ((save.grabs < 6 || G.level === 1) && s.mode !== 'dead' && s.mode !== 'won') {
    const tg = s.tongue;
    if (tg.state === 'stuck') {
      const go = s.vx > 2 && s.vy > 0 && s.x > tg.ax + tg.L * 0.3;
      if (go) { const p = view.project(s.x, s.y + 2.2); UI.hint('RELEASE!', p.x, p.y); } else UI.hint(null);
    } else if (s.target >= 0 && !G.hold && (s.mode === 'perch' || s.vy < 4)) {
      movePos(G.lv.hooks[s.target], s.t, tmp); const p = view.project(tmp.x, tmp.y - 2.2);
      UI.hint(s.mode === 'perch' ? 'HOLD' : 'HOLD!', p.x, p.y);
    } else UI.hint(null);
  } else UI.hint(null);
}

function render(realDt, dt) {
  const s = G.sim, tg = s.tongue;
  lvView.st.target = G.state === 'playing' && tg.state !== 'stuck' && s.mode !== 'dead' ? s.target : -1;
  lvView.st.attached = tg.state === 'stuck' ? tg.hook : -1;
  frog.mouthWorld(s, mouth);
  // 舌尖位置
  let tip = null;
  if (s.mode !== 'dead') {
    if (tg.state === 'stuck') { tipV.x = tg.ax; tipV.y = tg.ay; tip = tipV; }
    else if (tg.state === 'shoot' || tg.state === 'retract' || tg.state === 'miss') { tipV.x = s.x + tg.dx * tg.tip; tipV.y = s.y + tg.dy * tg.tip; tip = tipV; }
    if (G.lick.t > 0) { G.lick.t -= realDt; tipV.x = G.lick.x; tipV.y = G.lick.y; tip = tipV; }
  }
  G.tongueWob *= Math.exp(-realDt * 5); G.tipPop += (1 - G.tipPop) * Math.min(1, realDt * 12);
  // 青蛙看向目標
  if (s.target >= 0) {
    movePos(G.lv.hooks[s.target], s.t, tmp);
    const dx = tmp.x - s.x, dy = tmp.y - s.y, d = Math.hypot(dx, dy) || 1, c = Math.cos(-s.angle), sn = Math.sin(-s.angle);
    mood.lookX = (dx * c - dy * sn) / d; mood.lookY = (dx * sn + dy * c) / d;
  }
  mood.mouth = tg.state !== 'idle' || G.lick.t > 0; mood.tongueWob = G.tongueWob; mood.tipPop = G.tipPop; mood.scared = s.y < 3 && s.vy < -5;
  // 勝利後在荷葉上彈跳
  if (s.mode === 'won') {
    G.winAnim += realDt;
    let da = -s.angle; da -= Math.round(da / (Math.PI * 2)) * Math.PI * 2; s.angle += da * Math.min(1, realDt * 8);
    s.vx = 0; s.vy = 0; s.omega = 0;
  }
  frog.root.visible = s.mode !== 'dead';
  const yOff = s.mode === 'won' ? Math.abs(Math.sin(G.winAnim * 7)) * 1.3 * Math.exp(-G.winAnim * 2.2) : 0;
  s.y += yOff; frog.update(s, realDt, tReal, tip, mood); s.y -= yOff;
  lvView.update(s, tReal, realDt, mouth);
  const sp = Math.hypot(s.vx, s.vy);
  fx.update(dt, realDt, s, sp, G.state === 'playing' && s.mode !== 'dead');
  UI.tickFlash(realDt);
  view.post.amount *= Math.exp(-realDt * 7);
  // 鏡頭：平滑跟隨 + 速度前瞻 + 隨速度拉遠 + FOV 衝擊 + 慢動作推近
  const cam = view.camera, c = G.cam;
  let tx, ty, td;
  if (G.state === 'menu' || G.state === 'levels' || G.state === 'shop') { tx = s.x + 3.2; ty = 5.6; td = 14; }
  else {
    const lx = Math.max(-6, Math.min(9, s.vx * T.CAM_LOOKAHEAD)), ly = Math.max(-4, Math.min(4, s.vy * T.CAM_LOOKAHEAD * 0.6));
    tx = s.x + 3 + lx; ty = Math.max(T.CAM_MIN_Y, s.y + ly - 0.5);
    td = Math.min(T.CAM_DIST_MAX, T.CAM_DIST + Math.max(0, sp - 9) * T.CAM_DIST_SPEED) - G.slowAmt * 4;
    if (s.mode === 'won') { tx = s.x + 1; ty = Math.max(5, s.y + 2.5); td = 17; }
  }
  const k = 1 - Math.exp(-realDt * 4.5);
  c.x += (tx - c.x) * k; c.y += (ty - c.y) * k; c.d += (td - c.d) * (1 - Math.exp(-realDt * 2.2));
  G.fovKick *= Math.exp(-realDt * 3.5);
  const fov = T.CAM_FOV + G.fovKick - G.slowAmt * 7;
  if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  cam.position.set(c.x + fx.shake.x, c.y + fx.shake.y, c.d);
  cam.rotation.set(-0.05, 0, fx.shake.roll);
  view.update(tReal, c.x, Math.max(4, s.y));
  view.render();
}

// ---------- 開機 ----------
async function boot() {
  cg.loadingStart();
  await cg.init();
  save = cg.loadJSON(SAVE_KEY, DEFAULT_SAVE);
  for (const k of ['stars', 'best']) if (typeof save[k] !== 'object' || !save[k]) save[k] = {};
  if (!Array.isArray(save.owned)) save.owned = ['tree', 'none'];
  if (!Array.isArray(save.worldsDone)) save.worldsDone = [];
  frog.setSkin(skinOf()); fx.setTrail(trailOf());
  A.setMusic(save.music); A.setSfx(save.sfx); UI.setToggles(save);
  cg.onMute((m) => A.setMuted(m));
  toMenu();
  cg.loadingStop();
  requestAnimationFrame((t) => { last = t; frame(t); });
}
boot();
