// 開機、主迴圈、狀態機、輸入、存檔、事件 → 手感回饋（音效／粒子／震動／慢動作／跳字）。
import { cg } from './cg.js';
import { TUNE as T, WORLDS, SKINS, TRAILS, TONGUES, FULL_LAUNCH } from './config.js';
import { generateLevel, newElements, LEVEL_COUNT, levelLabel, worldOf, createEndless, extendEndless, endlessWorld, ENDLESS_WORLD_LEN } from './level.js';
import { createSim, step, movePos, flyPos, burstOn, burstWarn, padSnapshot } from './sim.js';
import { makeBot } from './bot.js';
import { createView } from './scene.js';
import { createLevelView } from './levelview.js';
import { createFrog } from './frog.js';
import { createFx, SH } from './fx.js';
import * as A from './audio.js';
import * as UI from './ui.js';
import { createFeatTracker, featById, recordFeat } from './feats.js';
import { SAVE_KEY, DEFAULT_SAVE, ENDLESS_UNLOCK, normalizeSave, nextStep, rateStars, recordStars } from './save.js';
import { addLocal, submitPlatform } from './leaderboard.js';
import { tongueTexture } from './tongues.js';
import { t, itemName, setLang, onLang, detect, urlLang, navLangs, sdkInfo, mountPicker, enablePseudo, audit } from './i18n.js';
import './i18n.css';
import { ART, loadPack, packReady, ensureWorld, worldReady, ensureSkin, skinReady } from './art.js';
import { WORLD_COUNT } from './packs-table.js';
import { TIERS, pickTier, createGovernor } from './quality.js';
import { createJuice } from './juice.js';
import { TM } from './telemetry.js'; // 匿名遊玩數據；建置沒設 VITE_TELEMETRY_URL 時全是空操作

const MIDGAME_EVERY = 3; // 每破 3 關，在換關的空檔插一次 midgame（SDK 自己還會限 3 分鐘一次）
const CELEBRATE = 1.2; // 落荷葉後的短暫慶祝秒數，然後進結算畫面（等玩家按 NEXT）
const COIN_PTS = 100; // 每 100 分＝1 金幣（即時入帳）
const CLEAR_COINS = 25; // 過關獎勵
const FLIP_KEYS = ['', 'pop.flip1', 'pop.flip2', 'pop.flip3', 'pop.flip4']; // 跳字走 i18n（src/lang/en.js）

const canvas = document.getElementById('c');
const view = createView(canvas);
const lvView = createLevelView(view.scene);
const frog = createFrog(view.scene, view.renderer);
const fx = createFx(view.scene, view.renderer);
let save = normalizeSave(DEFAULT_SAVE, LEVEL_COUNT);

const G = {
  state: 'boot', level: 1, lv: null, sim: null, builtLevel: 0, world: -1,
  score: 0, combo: 0, comboT: 0, comboPulse: 0, deaths: 0, restartT: 0, winT: 0, winAnim: 0,
  timeScale: 1, slowT: 0, slowAmt: 0, hitStop: 0, fovKick: 0, acc: 0, hold: false,
  attachesTotal: 0, flipsTotal: 0, bestProg: 0, wins: 0, tongueWob: 0, tipPop: 1, lick: { x: 0, y: 0, t: 0 },
  cam: { x: 0, y: 7, d: T.CAM_DIST }, resultAt: 0, adBreak: false, lastResult: null, quality: 'high', fps: 60, bestFlip: 0,
  ckpt: null, hiScore: 0, endless: false, coinPts: 0, runCoins: 0, sessionClears: 0, feats: createFeatTracker(), featLog: [], lastWin: null, shopHi: null, bought: null,
};
const juice = createJuice({ fx, frog, lvView, view, G, sfx: (n, o) => A.play(n, o), A, slowmo: (t) => slowmo(t), flash: (a) => UI.flash(a), vibrate: (p) => vibrate(p) });
window.__game = {
  get state() { return G.state; }, get level() { return G.level; }, get score() { return G.score; },
  get attaches() { return G.sim?.attaches ?? 0; }, get attachesTotal() { return G.attachesTotal; }, get flips() { return G.flipsTotal; },
  get bestFlip() { return G.bestFlip; }, get x() { return G.sim?.x ?? 0; }, get maxX() { return G.sim?.maxX ?? 0; }, get mode() { return G.sim?.mode; },
  get deaths() { return G.deaths; }, get wins() { return G.wins; }, get coins() { return save.coins; }, get quality() { return G.quality; },
  get fps() { return G.fps; }, get timeScale() { return G.timeScale; }, get result() { return G.lastResult; }, get hold() { return G.hold; },
  get drawCalls() { return view.info.render.calls; }, get length() { return G.lv?.length ?? 0; },
  get frogScreen() { const p = view.project(G.sim?.x ?? 0, G.sim?.y ?? 0, 0); return [p.x, p.y]; }, get dist() { return G.endless ? endlessDist() : 0; },
  get levelResult() { return G.levelResult; }, // 這一關所有嘗試裡最遠／最高分（死掉重來前的也算；冒煙用）
  get furthest() { return Math.max(G.sim?.maxX ?? 0, G.bestProg * (G.lv?.goal?.x ?? 0)); }, get bestScore() { return Math.max(G.score, G.lvBestScore ?? 0); }, get endless() { return G.endless; }, get startedAt() { return G.startedAt; }, get feats() { return G.featLog; }, get lastWin() { return G.lastWin; }, get save() { return save; }, get ckpt() { return G.ckpt; },
  start(n) { startLevel(n); }, startEndless() { startEndless(); },
  // 測試用：直接換造型／拖尾（不改存檔）
  look(skin, trail, tongue) { applyLook(SKINS.find((k) => k.id === skin), TRAILS.find((k) => k.id === trail), TONGUES.find((k) => k.id === tongue)); },
  // 測試用：讓無盡模式直接死（驗結算流程）
  forceDie() { const s = G.sim; if (s && s.mode !== 'dead') { s.mode = 'air'; s.tongue.state = 'idle'; s.y = 0.1; s.vy = -5; } },
  get view() { return view; }, // 測試用：量岩漿泡的螢幕位置
  get sim() { return G.sim; }, // 測試用：冒煙直接調時間／蒼蠅數來造 1、2 星
  audio: A, ui: UI, i18n: { audit, setLang, t }, // 截圖／測試用：直接叫 UI（例如成就膠囊）、語言稽核
  setLow() { setTier('low'); }, setTier(n) { setTier(n); }, // 測試用：直接切畫質（low＝C 材質）
  ballPos(i) { return lvView.ballPos(i); }, // 測試用：鉤點球實際畫出來的世界座標（藤蔓晃動驗收：必須等於 sim 錨點）
  autoplay: null, // 巡覽截圖用：設成 [rel, grabVy] 讓自動玩家操作

  // 測試用：把青蛙放到終點上方，讓它自然落在荷葉上完成關卡
  fxFeat(kind) { fxFeat(kind); }, get particles() { return fx.count(); },
  emit(e) { if (G.sim) onEvent({ x: G.sim.x, y: G.sim.y, ...e }); }, // 測試用：直接觸發一個遊戲事件的特效（例如 {type:'flip', n:7}）
  // 剛落水還在等重生（restartT）時強制過關：先取消重生，不然慶祝到一半被 resetRun 洗掉、永遠進不了結算
  forceWin() { const s = G.sim, g = G.lv.goal; if (!s) return; G.restartT = 0; UI.dieText(null); s.tongue.state = 'idle'; s.mode = 'air'; s.x = g.x; s.y = g.y + 4; s.vx = 0; s.vy = -4; },
};

// ---------- 存檔 ----------
const persist = () => cg.saveJSON(SAVE_KEY, save);
const skinOf = () => SKINS.find((s) => s.id === save.skin) ?? SKINS[1];
const trailOf = () => TRAILS.find((t) => t.id === save.trail) ?? TRAILS[0];
const tongueOf = () => TONGUES.find((t) => t.id === save.tongue) ?? TONGUES[0];
function applyLook(sk = skinOf(), tr = trailOf(), tk = tongueOf()) {
  // 造型模型包還沒載（例如測試直接 look('cat')）：先載，載好再套；這一刻先維持現在的造型
  if (!skinReady(sk.id)) { ensureSkin(sk.id).then(() => applyLook(sk, tr, tk), (e) => console.error('[skin load]', e)); if (!ART.models['char-frog']) return; sk = frog.st.skin ?? SKINS[1]; }
  frog.setSkin(sk); fx.setTrail(tr); frog.setTongue(tk, tongueTexture(tk.tex)); }
const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* 不支援就算了 */ } };
const sfx = (n, o) => A.play(n, o);

// ---------- 關卡 ----------
function loadLevel(n) {
  const fresh = G.level !== n;
  if (fresh) G.bestProg = 0;
  G.endless = false; G.level = n; G.lv = generateLevel(n);
  const w = WORLDS[G.lv.world];
  if (G.builtLevel !== n) {
    view.setTheme(w, G.lv.length); lvView.build(G.lv, w); G.builtLevel = n;
    document.body.style.background = w.sky[0];
  }
  A.setWorld(G.lv.world); UI.setWorld(G.lv.world);
  resetRun(true);
  if (fresh) G.lvBestScore = 0; // 換關：上一關的分數不算進這一關
}
// 無盡模式：每次一條新的隨機路線；世界每 ENDLESS_WORLD_LEN 單位輪替
// 元素上限＝主線打過的關數（至少 60、最多 LEVEL_COUNT）：荷葉（63）、加速圈（69）要先在主線學過才會出現在無盡模式
const endlessCap = () => Math.max(60, Math.min(LEVEL_COUNT, save.unlocked - 1));
const ENDLESS_SPAN = 6000; // 背景道具一次鋪這麼長（換世界時才重鋪，避免背景跳動）
function loadEndless() {
  G.endless = true; G.level = 0; G.builtLevel = -1; G.bestProg = 0;
  G.lv = createEndless(1 + Math.floor(Math.random() * 1e6), endlessCap());
  setEndlessWorld(0, true);
  resetRun();
}
function setEndlessWorld(k, quiet) {
  G.world = k; G.lv.world = k;
  const w = WORLDS[k];
  view.setTheme(w, Math.max(ENDLESS_SPAN, (G.sim?.x ?? 0) + 4000)); lvView.build(G.lv, w); restoreEaten();
  document.body.style.background = w.sky[0]; A.setWorld(k); UI.setWorld(k);
  if (!quiet) { UI.flash(0.6); sfx('win'); pop(t(`world.${k}`, null, w.name), 0, 0, 'big'); fx.addTrauma(0.2, true); juice.levelIn(G.sim); }
}
// lvView.build 會把蒼蠅、圈圈的「被吃掉」狀態清掉：照 sim 補回去
function restoreEaten() {
  const s = G.sim; if (!s) return;
  lvView.st.flyGone = G.lv.flies.map((_, i) => (s.flies[i] ? 1 : 0)); lvView.st.ringGone = G.lv.rings.map((_, i) => (s.rings[i] ? 1 : 0));
  lvView.st.boostGone = G.lv.boosts.map((_, i) => (s.boostUsed[i] ? 1 : 0)); lvView.st.padOn = G.lv.pads.map((_, i) => (i <= s.checkpoint ? 1 : 0)); lvView.st.padBounce = G.lv.pads.map(() => 0);
}
function updateEndless() {
  const s = G.sim, L = G.lv;
  if (L.gen.x < s.x + 120 && extendEndless(L, s.x + 250)) { lvView.build(L, WORLDS[G.world]); restoreEaten(); }
  const k = endlessWorld(s.x, save.unlocked > 60 ? 5 : 4); // 打過 4-15 才輪到冰峰
  if (k !== G.world && s.mode !== 'dead') { if (worldReady(k)) setEndlessWorld(k); else ensureWorld(k).catch(() => {}); } // 下一個世界的模型還沒到就先照舊，到了再換
}
const endlessDist = () => Math.floor(Math.max(0, (G.sim?.maxX ?? 0) - G.lv.start.x));
const endlessScore = () => G.score + endlessDist() * 10;
// 唯一的「進入遊玩」入口：開關、重生、續玩、R 重來、下一關都經過這裡呼叫 gameplayStart（cg.js 會去重）
function enterPlaying() { G.state = 'playing'; cg.gameplayStart(); }
// fromStart＝true：忘掉荷葉存檔，從起點重來（開新關、暫停選單的 Restart、離開關卡）；預設（死掉自動重生、R 鍵）：有存檔就從最後落地的荷葉重生
function resetRun(fromStart = false) {
  if (G.endless && G.sim && G.sim.maxX > 60) { G.sim = null; loadEndless(); return; } // 無盡模式死掉或重來＝新路線
  if (fromStart || G.endless) G.ckpt = null;
  G.lvBestScore = Math.max(G.lvBestScore ?? 0, G.score);
  const ck = G.ckpt;
  // 荷葉重生：蒼蠅、圈圈、加速圈、星數用的時間、分數都回到落地那一刻（落地之後吃的蒼蠅會再出現）；金幣已入帳，不重複給（addScore 只算超過 hiScore 的部分）
  G.sim = createSim(G.lv, ck); G.score = ck ? ck.score : 0; if (!ck) { G.coinPts = 0; G.runCoins = 0; G.hiScore = 0; }
  G.feats.reset(); if (ck) G.feats.st.padded = true; G.runFeats = []; G.combo = 0; G.comboT = 0; G.restartT = 0; G.winT = 0; G.winAnim = 0; G.acc = 0;
  G.slowT = 0; G.hitStop = 0; lvView.reset(); restoreEaten(); fx.clear(); fx.resetTrail(G.sim.x, G.sim.y); UI.dieText(null);
  frog.squash(0.7, 0);
  if (G.state === 'playing') enterPlaying();
}
// 世界背景模型只有開機那個世界先載：還沒載好就顯示載入狀態，載好再做 fn（最後一次呼叫才算數）
let worldSeq = 0;
// 這一關（n＝0 表示無盡）用得到的包：世界背景＋有後期道具的話再加 props 包
const levelPacks = (n) => {
  if (n === 0) return ['world-0', 'props'];
  const lv = generateLevel(n);
  return [`world-${worldOf(n)}`, ...(lv.fans.length || lv.saws.length || lv.rings.length || lv.boosts.length || lv.pads.length ? ['props'] : [])];
};
function whenLevel(n, fn) {
  const need = levelPacks(n);
  if (need.every((k) => packReady(k))) { fn(); return; }
  const seq = ++worldSeq, wl = document.getElementById('wload');
  wl?.classList.add('on');
  Promise.all(need.map((k) => loadPack(k))).then(() => { if (seq === worldSeq) fn(); }, (e) => console.error('[world load]', e)).finally(() => { if (seq === worldSeq) wl?.classList.remove('on'); });
}
// 第一關開始後，把其他世界與造型的模型在背景慢慢載（一包一包、中間留空檔，不卡遊玩）
let prefetched = false;
function prefetchRest() {
  if (prefetched) return; prefetched = true;
  const list = ['props', ...Array.from({ length: WORLD_COUNT }, (_, w) => `world-${w}`), 'skin-cat', 'skin-ape', 'acc'];
  let i = 0;
  const next = () => { if (i >= list.length) return; loadPack(list[i++]).catch(() => {}).finally(() => setTimeout(next, 2500)); };
  setTimeout(next, 4000);
}
function startLevel(n) { whenLevel(n, () => startLevelNow(n)); }
function startLevelNow(n) {
  prefetchRest();
  G.ignorePressUntil = performance.now() + 250; G.startedAt = performance.now();
  A.initAudio();
  loadLevel(n); TM.levelStart(n);
  save.last = n; persist();
  enterPlaying(); clearHold(); UI.show(null); UI.hint(null);
  G.cam.x = G.sim.x + 6; G.cam.y = T.CAM_MIN_Y; juice.levelIn(G.sim);
  const ne = newElements(n)[0]; UI.newCard(ne ? t(`new.${ne}`) : null);
  UI.popup((n - 1) % 15 === 0 ? t('pop.worldLevel', { world: t(`world.${G.lv.world}`, null, WORLDS[G.lv.world].name), level: levelLabel(n) }) : t('pop.level', { level: levelLabel(n) }), innerWidth / 2, bigY(), 'big');
}
function startEndless() {
  if (save.unlocked <= ENDLESS_UNLOCK) return;
  whenLevel(0, startEndlessNow);
}
function startEndlessNow() {
  prefetchRest();
  G.ignorePressUntil = performance.now() + 250;
  A.initAudio(); G.sim = null; loadEndless();
  enterPlaying(); clearHold(); UI.show(null); UI.hint(null);
  G.cam.x = G.sim.x + 6; G.cam.y = T.CAM_MIN_Y;
  UI.popup(t('pop.endlessBest', { dist: save.endlessBest }), innerWidth / 2, bigY(), 'big');
}
// 即時金幣：入帳、HUD 彈一下（存檔在死亡／過關／退回選單時寫）
function addCoins(n) { if (n <= 0) return; save.coins += n; G.runCoins += n; UI.hudCoins(save.coins); if (G.sim && G.state === 'playing') { juice.coins(G.sim.x, G.sim.y, n); sfx('coin'); } }
function onFeat(f, s) {
  const d = featById(f.id), better = recordFeat(save.feats, f.id, f.value);
  G.featLog.push({ id: f.id, value: f.value, t: performance.now() });
  if (f.silent) return;
  G.runFeats.push(f.id);
  addCoins(d.coins); persist();
  UI.feat(UI.featName(f.id), UI.featLine(f.id), d.coins); sfx('ring'); sfx('buy'); A.duckMusic(0.35, 0.8); vibrate([15, 30, 15]);
  fxFeat(f.id);
  if (better && save.feats[f.id].count > 1) UI.popup(t('pop.newRecord'), innerWidth / 2, bigY() + 150, 'gold');
}

// ---------- 連擊與分數 ----------
const mult = () => 1 + Math.min(3, Math.floor(G.combo / 5) * 0.5);
function addCombo() { G.combo++; G.comboT = T.COMBO_WINDOW; G.comboPulse = 1; }
function addScore(v) {
  const s = Math.round(v * mult()), before = G.score; G.score += s;
  const earned = Math.max(0, G.score - Math.max(before, G.hiScore)); G.hiScore = Math.max(G.hiScore, G.score);
  G.coinPts += earned; const c = Math.floor(G.coinPts / COIN_PTS); if (c > 0) { G.coinPts -= c * COIN_PTS; addCoins(c); }
  return s;
}
// 成就的場景特效掛鉤（UI 線的 DOM 彈出另外做；kind＝src/feats.js 的成就 id）
function fxFeat(kind) { const s = G.sim; if (s) juice.feat(kind, s.x, s.y); }
const bigY = () => Math.max(132, innerHeight * 0.27);
function pop(text, x, y, cls) {
  if (cls === 'big') { UI.popup(text, innerWidth / 2, bigY(), cls); return; }
  const p = view.project(x, y, 0.5); UI.popup(text, p.x, p.y, cls);
}
function slowmo(t = T.SLOWMO_TIME) { G.slowT = Math.max(G.slowT, t); A.duckMusic(0.3, t); }

function onEvent(e) {
  const s = G.sim, w = WORLDS[G.lv.world];
  for (const f of G.feats.event(e, s)) onFeat(f, s);
  switch (e.type) {
    case 'crouch': sfx('tick'); break;
    case 'jump':
      juice.jump(s, w); sfx('jump');
      break;
    case 'shoot': sfx('shoot'); G.tongueWob = 0.35; break;
    case 'miss': sfx('miss'); G.tongueWob = 0.5; break;
    case 'attach': {
      G.attachesTotal++; save.grabs++;
      sfx('attach', { combo: G.combo });
      G.tongueWob = 0.6; G.tipPop = 1.9;
      juice.attach(e, s, w, tongueOf()); // 含舌頭種類的黏上特效
      addCombo(); addScore(T.SCORE_GRAB);
      vibrate(8);
      break;
    }
    case 'release':
      sfx('release'); if (e.speed > 21) sfx('whoosh');
      G.tongueWob = 0.7; juice.release(s, e.speed);
      break;
    case 'flip': {
      G.flipsTotal++; G.bestFlip = Math.max(G.bestFlip, e.n);
      addCombo();
      const pts = addScore(T.SCORE_FLIP * e.n);
      sfx('flip', { n: e.n, combo: G.combo });
      const name = e.n < FLIP_KEYS.length ? t(FLIP_KEYS[e.n]) : t('pop.flipN', { n: e.n });
      if (e.n >= 2) pop(name, s.x, s.y + 2.6, 'big');
      else pop(t('pop.withPts', { text: name, pts }), s.x, s.y + 2, 'gold');
      juice.flip(s, e.n);
      break;
    }
    case 'fly': {
      lvView.eatFly(e.i); sfx('fly'); addCombo(); juice.fly(e);
      const pts = addScore(T.SCORE_FLY);
      pop(t('pop.pts', { pts }), e.x, e.y + 1, 'pink');
      if (s.tongue.state === 'idle' || s.tongue.state === 'retract') { G.lick.x = e.x; G.lick.y = e.y; G.lick.t = 0.13; G.tongueWob = 0.3; }
      break;
    }
    case 'ring': {
      sfx('ring'); addCombo();
      const pts = addScore(T.SCORE_RING);
      pop(t('pop.ring', { pts }), e.x, e.y + 2.6, 'big');
      juice.ring(e, e.speed > 16 || e.flips >= 1 ? T.SLOWMO_TIME : 0.45);
      break;
    }
    case 'bounce': {
      sfx('bounce'); addCombo(); addScore(T.SCORE_BOUNCE);
      pop(t('pop.boing'), e.x, e.y + 1.5, 'gold');
      juice.bounce(e, w); vibrate(15);
      break;
    }
    case 'fan': sfx('fan'); juice.fan(s); break;
    case 'pad': {
      lvView.landPad(e.i); juice.pad(e, w); sfx('jelly');
      if (!G.endless) { G.ckpt = { ...padSnapshot(s), score: G.score }; pop(t('pop.checkpoint'), e.x, e.y + 2.6, 'gold'); }
      break;
    }
    case 'boost': {
      lvView.takeBoost(e.i); juice.boost(e, w); sfx('whoosh'); addCombo();
      pop(t('pop.boost'), e.x, e.y + 2.4, 'gold');
      break;
    }
    case 'close': {
      const pts = addScore(50); addCombo(); sfx('ring');
      pop(t('pop.closeCall', { pts }), e.x, e.y + 2, 'gold'); juice.close(e);
      break;
    }
    case 'wall': sfx('wall'); juice.wall(s, w); break;
    case 'die': {
      const water = e.cause === 'water';
      sfx(water ? 'splash' : 'spike'); G.deaths++;
      if (water) juice.dieWater(e, w); else juice.dieHazard(e, skinOf());
      UI.dieText(water ? t(`die.${G.lv.world}`, null, w.die) : t('pop.ouch'));
      const prog = G.endless ? 0 : Math.min(1, s.maxX / G.lv.goal.x);
      if (prog > 0.6) UI.popup(t('pop.soClose', { pct: Math.round(prog * 100) }), innerWidth / 2, innerHeight * 0.52, 'gold');
      G.bestProg = Math.max(G.bestProg, prog); if (!G.endless) TM.death(e.x, prog, e.cause);
      A.duckMusic(0.4, 0.4); vibrate([30, 40, 30]);
      G.combo = 0; cg.gameplayStop(); persist();
      if (G.endless) G.overT = 0.8; else G.restartT = T.RESTART_DELAY;
      break;
    }
    case 'win': {
      sfx('win'); G.winT = CELEBRATE; G.winAnim = 0;
      const g = G.lv.goal;
      juice.win(s, g); vibrate([20, 30, 60]);
      pop(t(Math.abs(s.x - g.x) < 1.6 ? 'pop.bullseye' : 'pop.landed'), s.x, s.y + 3, 'big');
      if (Math.abs(s.x - g.x) < 1.6) addScore(200);
      levelCleared();
      break;
    }
  }
}

// ---------- 過關（沒有結算畫面：落荷葉 → 慶祝 CELEBRATE 秒 → 自動下一關） ----------
function levelCleared() {
  const s = G.sim, n = G.level;
  addCoins(CLEAR_COINS);
  const rate = rateStars({ flies: s.fliesGot, fliesTotal: G.lv.flies.length, time: s.time, par: G.lv.par });
  recordStars(save, n, rate.stars); TM.clear(s.time, rate.stars, s.fliesGot);
  UI.clearSticker(true, t(rate.stars === 3 ? 'clear.perfect' : 'clear.clear'));
  { const p = view.project(s.x, s.y, 0.5); UI.coinFly([p.x, p.y], document.getElementById('hudCoins'), 3); }
  const newBest = G.score > (save.best[n] ?? 0) && (save.best[n] ?? 0) > 0;
  save.best[n] = Math.max(save.best[n] ?? 0, G.score);
  save.unlocked = Math.max(save.unlocked, Math.min(LEVEL_COUNT, n + 1));
  save.clears++; G.sessionClears++; G.wins++;
  if (n % 15 === 0 && !save.worldsDone.includes(n)) { save.worldsDone.push(n); cg.happytime(); } // 解鎖新世界＝真正的成就
  persist();
  G.lastWin = { level: n, score: G.score, time: s.time, coins: G.runCoins, at: performance.now() };
  G.levelResult = { level: n, stars: rate.stars, ...rate, flies: s.fliesGot, fliesTotal: G.lv.flies.length, time: s.time, par: G.lv.par, score: G.score, newBest,
    title: t(n % 15 === 0 ? 'result.world' : rate.stars === 3 ? 'result.perfect' : 'result.clear'), feats: [...new Set(G.runFeats)] };
  UI.hint(null); UI.tut(null);
}
// 結算畫面：慶祝完停在這裡等玩家（gameplayStop）；NEXT／Space／Enter／點一下＝下一關，進場動畫沒播完時先跳到結尾
function showLevelResult() {
  G.state = 'result'; G.resultAt = performance.now(); clearHold(); cg.gameplayStop();
  G.levelResult.coins = G.runCoins; UI.showResult(G.levelResult);
}
function resultNext() {
  if (G.state !== 'result' || UI.finishResult()) return;
  sfx('click'); advance();
}
function resultRetry() { if (G.state !== 'result') return; UI.finishResult(); sfx('click'); startLevel(G.level); }
async function advance() {
  const n = G.level;
  if (n >= LEVEL_COUNT) { toMenu(); return; }
  if (G.sessionClears % MIDGAME_EVERY === 0) { G.state = 'ad'; clearHold(); UI.show('block'); await cg.midgame(); } // 按 NEXT＝自然中斷點，每 MIDGAME_EVERY 關一次
  startLevel(n + 1);
}

// ---------- 無盡結算 ----------
function endlessOver() {
  const dist = endlessDist(), score = endlessScore();
  const newBest = dist > save.endlessBest && save.endlessBest > 0; TM.endlessOver(dist, score);
  save.endlessBest = Math.max(save.endlessBest, dist); save.endlessRuns++;
  const now = new Date(), day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const rank = addLocal(save.lb, { score, dist, day });
  submitPlatform(score);
  if (newBest) cg.happytime(); // 破紀錄
  persist();
  G.lastResult = { endless: true, dist, score, rank, coins: G.runCoins };
  G.state = 'over'; G.resultAt = performance.now(); G.adBreak = false; clearHold(); UI.hint(null); UI.tut(null);
  UI.showOver({ dist, score, best: save.endlessBest, flips: G.sim.flipsTotal, rank, newBest, offerDouble: FULL_LAUNCH && cg.ready && G.runCoins >= 10 && save.endlessRuns % 3 === 0 });
}
async function retryEndless() {
  if (G.state !== 'over') return;
  sfx('click');
  if (!G.adBreak) { G.state = 'ad'; UI.show('block'); await cg.midgame(); } // 結算後按再一局＝自然中斷點（看過獎勵影片就不再放）
  startEndless();
}
async function doubleCoins() {
  if (G.state !== 'over' || G.adBreak) return;
  G.adBreak = true; document.getElementById('ovDouble').style.display = 'none';
  G.state = 'ad'; UI.show('block');
  const ok = await cg.rewarded();
  if (ok) { save.coins += G.lastResult.coins; persist(); UI.setCoins(save.coins); sfx('buy'); UI.popup(t('pop.coins', { n: G.lastResult.coins }), innerWidth / 2, innerHeight * 0.18, 'gold'); }
  else UI.popup(t('pop.noVideo'), innerWidth / 2, innerHeight * 0.18, 'gold');
  G.state = 'over'; UI.show('over'); document.getElementById('ovDist').textContent = String(G.lastResult.dist);
}

// ---------- 選單 ----------
// 沒有離開遊戲鈕。退回選單時把一個「下一步」推到最顯眼：新模式 → 新世界 → 買得起的東西（見 src/save.js nextStep）
let menuStep = null;
function toMenu() {
  TM.leave('menu');
  if (G.state === 'playing' || G.state === 'paused') cg.gameplayStop();
  persist();
  G.state = 'menu'; clearHold(); UI.tryNow(null); UI.newCard(null);
  loadLevel(Math.min(save.last, save.unlocked));
  UI.show('menu'); UI.setCoins(save.coins); UI.hint(null);
  UI.setPlay(t('menu.play', { level: levelLabel(Math.min(save.unlocked, LEVEL_COUNT)) })); UI.setHero(skinOf());
  const eb = document.getElementById('endlessBtn'), endlessOk = save.unlocked > ENDLESS_UNLOCK;
  UI.setEndless(endlessOk);
  menuStep = nextStep(save);
  eb.classList.toggle('badge', menuStep?.kind === 'endless');
  document.getElementById('shopBtn').classList.toggle('badge', menuStep?.kind === 'shop');
  if (!menuStep) UI.nextUp(null);
  else if (menuStep.kind === 'endless') UI.nextUp(t('next.endless'), t('next.endlessSub'), { icon: 'loop' });
  else if (menuStep.kind === 'world') UI.nextUp(t('next.world', { world: t(`world.${menuStep.world}`, null, WORLDS[menuStep.world].name) }), t('next.worldSub', { level: levelLabel(menuStep.level) }), { icon: 'globe' });
  else UI.nextUp(t('next.get', { item: itemName(menuStep.item.tab, menuStep.item) }), t('next.getSub', { coins: save.coins, price: menuStep.item.price }), menuStep.item.tab === 'skins' ? { skin: menuStep.item.id } : { icon: 'coin' });
}
function goNextUp() {
  const st = menuStep; if (!st) return;
  sfx('click');
  if (st.kind === 'endless') { save.seen.endless = true; persist(); startEndless(); }
  else if (st.kind === 'world') { save.seen.world = st.world; persist(); startLevel(st.level); }
  else openShop(st.item);
}
function openLevels() { sfx('click'); if (G.sim && G.sim.mode !== 'perch') resetRun(true); clearHold(); G.state = 'levels'; UI.setWorldTab(save.unlocked); UI.renderLevels(save, (n) => { sfx('click'); startLevel(n); }); UI.show('levels'); }
function openRecords() { sfx('click'); clearHold(); G.state = 'records'; UI.renderRecords(save, G.lastResult?.score); UI.show('records'); }
function openShop(hi = null) {
  sfx('click'); if (G.sim && G.sim.mode !== 'perch') resetRun(true); clearHold(); G.state = 'shop';
  G.shopHi = hi?.id ?? null; if (hi) UI.setShopTab(hi.tab);
  renderShop(); UI.show('shop'); UI.tryNow(null);
  for (const k of ['skin-cat', 'skin-ape', 'acc']) loadPack(k).catch(() => {}); // 商店裡每個造型都可能被點：先把模型包載起來
}
function renderShop() {
  UI.renderShop(save, (tab, it) => {
    if (tab === 'skins' && !skinReady(it.id)) { ensureSkin(it.id).then(() => shopPick(tab, it), (e) => console.error('[skin load]', e)); return; } // 貓、猿、配件的模型還沒載：載好再套
    shopPick(tab, it);
  }, G.shopHi);
}
function shopPick(tab, it) {
    let bought = false;
    if (!save.owned.includes(it.id)) {
      if (save.coins < it.price) { sfx('miss'); return; }
      save.coins -= it.price; save.owned.push(it.id); sfx('buy'); UI.setCoins(save.coins); bought = true;
      if (it.tongue && !save.owned.includes(it.tongue)) save.owned.push(it.tongue); // 角色送招牌舌頭
      if (G.shopHi === it.id) G.shopHi = null;
    } else sfx('click');
    if (tab === 'skins') { save.skin = it.id; if (it.tongue) save.tongue = it.tongue; frog.squash(0.6, 0); frog.jiggle(6); }
    else if (tab === 'tongues') { save.tongue = it.id; G.lick.x = G.sim.x + 2.5; G.lick.y = G.sim.y + 1.5; G.lick.t = 0.4; G.tongueWob = 0.5; }
    else save.trail = it.id;
    applyLook(); persist(); renderShop();
    if (bought) { G.bought = it; UI.tryNow(it.name, it); } // 買完：慶祝＋立刻推「立即試玩」
}
function tryBought() {
  sfx('click'); UI.tryNow(null);
  if (G.bought) startLevel(Math.min(save.unlocked, LEVEL_COUNT)); // 穿著剛買的東西直接開玩
}
function pause() {
  if (G.state !== 'playing') return;
  G.state = 'paused'; clearHold(); cg.gameplayStop();
  pauseMeta(); UI.show('pause');
}
function pauseMeta() {
  UI.pauseMeta(G.endless ? t('pause.endless', { dist: endlessDist() }) : t('pause.level', { level: levelLabel(G.level), score: G.score.toLocaleString('en-US') }));
}
function resume() {
  if (G.state !== 'paused') return;
  sfx('click'); enterPlaying(); clearHold(); UI.show(null);
}
function toggle(key) {
  save[key] = !save[key]; persist(); UI.setToggles(save);
  A.setMusic(save.music); A.setSfx(save.sfx); sfx('click');
}

// ---------- 輸入 ----------
const isUI = (t) => t instanceof Element && !!t.closest('button, .panel, .card, .lvl, .tab');
const held = { key: false, ptr: new Set() };
const syncHold = () => { G.hold = G.state === 'playing' && (held.key || held.ptr.size > 0); };
function press() { return G.state === 'playing' && G.sim.mode !== 'dead' && performance.now() > (G.ignorePressUntil ?? 0); }
addEventListener('pointerdown', (e) => {
  A.initAudio(); if (e.pointerType === 'touch') G.touch = true;
  if (isUI(e.target)) return;
  if (G.state === 'playing') { e.preventDefault(); if (press()) { held.ptr.add(e.pointerId); syncHold(); } }
}, { passive: false });
const ptrUp = (e) => { held.ptr.delete(e.pointerId); syncHold(); };
const clearHold = () => { held.key = false; held.ptr.clear(); syncHold(); };
// 合成 TouchEvent（不會產生 pointer 事件）也要能玩：用 'touch' 當一個指標
addEventListener('touchstart', (e) => { G.touch = true; A.initAudio(); if (isUI(e.target)) return; if (G.state === 'playing') { e.preventDefault(); if (press()) { held.ptr.add('touch'); syncHold(); } } }, { passive: false });
addEventListener('touchend', (e) => { if (e.touches.length === 0) { held.ptr.clear(); syncHold(); } });
addEventListener('touchcancel', clearHold);
addEventListener('pointerup', ptrUp); addEventListener('pointercancel', ptrUp);
// iframe 外放開滑鼠收不到 pointerup：回來時 buttons=0 就當放開
addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && e.buttons === 0 && held.ptr.has(e.pointerId)) ptrUp(e); });
addEventListener('blur', () => { clearHold(); pause(); });
addEventListener('contextmenu', (e) => e.preventDefault());
const HOLD_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'ArrowRight', 'KeyD']);
addEventListener('keydown', (e) => {
  if (HOLD_KEYS.has(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
  A.initAudio();
  if (e.repeat) return;
  // 鍵盤操作 UI：焦點在按鈕上時 Enter／Space 交給那顆按鈕（click），不搶
  if ((e.code === 'Enter' || e.code === 'Space') && G.state !== 'playing' && document.activeElement instanceof HTMLButtonElement && document.activeElement.offsetParent) return;
  const act = HOLD_KEYS.has(e.code) || e.code === 'Enter';
  if (G.state === 'playing') {
    if (HOLD_KEYS.has(e.code)) { if (press()) { held.key = true; syncHold(); } }
    else if (e.code === 'Escape' || e.code === 'KeyP') pause();
    else if (e.code === 'KeyR') { clearHold(); resetRun(); }
  } else if (G.state === 'paused') { if (act || e.code === 'Escape' || e.code === 'KeyP') resume(); }
  else if (G.state === 'menu') { if (act) startLevel(Math.min(save.unlocked, LEVEL_COUNT)); }
  else if (G.state === 'result') { if (act) resultNext(); else if (e.code === 'KeyR') resultRetry(); else if (e.code === 'Escape') toMenu(); }
  else if (G.state === 'over') { if (act && performance.now() - G.resultAt > 700) retryEndless(); else if (e.code === 'Escape') toMenu(); }
  else if ((G.state === 'levels' || G.state === 'shop' || G.state === 'records') && e.code === 'Escape') { sfx('click'); toMenu(); }
});
addEventListener('keyup', (e) => { if (HOLD_KEYS.has(e.code)) { held.key = false; syncHold(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
on('playBtn', () => { sfx('click'); startLevel(Math.min(save.unlocked, LEVEL_COUNT)); });
on('levelsBtn', openLevels); on('shopBtn', () => openShop(menuStep?.kind === 'shop' ? menuStep.item : null));
on('endlessBtn', () => { sfx('click'); if (save.unlocked <= ENDLESS_UNLOCK) { UI.popup(t('pop.endlessLocked', { level: levelLabel(ENDLESS_UNLOCK) }), innerWidth / 2, innerHeight * 0.8, 'gold'); return; } save.seen.endless = true; persist(); startEndless(); });
on('recordsBtn', openRecords); on('nextUp', goNextUp); on('heroTag', () => openShop());
on('resNext', resultNext); on('resRetry', resultRetry); on('resMenu', () => { sfx('click'); toMenu(); });
document.getElementById('result').addEventListener('pointerdown', (e) => { if (!(e.target instanceof Element && e.target.closest('button'))) resultNext(); });
on('tryPlay', tryBought); on('tryLater', () => { sfx('click'); UI.tryNow(null); });
for (const b of document.querySelectorAll('.back')) b.addEventListener('click', () => { sfx('click'); toMenu(); });
for (const b of document.querySelectorAll('.musicT')) b.addEventListener('click', () => toggle('music'));
for (const b of document.querySelectorAll('.sfxT')) b.addEventListener('click', () => toggle('sfx'));
on('pauseBtn', () => { sfx('click'); pause(); });
on('resumeBtn', resume);
on('pRestart', () => { resume(); if (G.endless && G.sim) G.sim.maxX = 61; resetRun(true); });
on('pLevels', () => { cg.gameplayStop(); openLevels(); });
on('pMenu', () => { sfx('click'); toMenu(); });
on('ovRetry', retryEndless);
on('ovMenu', () => { sfx('click'); toMenu(); });
on('ovDouble', doubleCoins);
document.getElementById('over').addEventListener('pointerdown', (e) => { if (!isUI(e.target) && performance.now() - G.resultAt > 700) retryEndless(); });

// ---------- 主迴圈 ----------
const hudData = {};
const tipV = { x: 0, y: 0 }, mouth = { x: 0, y: 0, z: 0 }, tmp = { x: 0, y: 0 };
const mood = { lookX: 0, lookY: 0, mouth: false, tongueWob: 0, tipPop: 1, scared: false };
let last = performance.now(), fpsAcc = 0, fpsN = 0, tReal = 0, gov = null;
const MENU_FRAME_MS = 62; // 選單類畫面（待機動畫）上限約 15 fps（螢幕 60Hz 時每四幀畫一次）：待機動畫慢吞吞沒關係，主執行緒忙碌量大減

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; } // 分頁隱藏：什麼都不做
  const st = G.state;
  if ((st === 'paused' || st === 'ad') && !view.dirty) { last = now; fpsAcc = 0; fpsN = 0; return; } // 暫停／看廣告：畫面沒變，不畫（視窗大小改變時 view.dirty 會補畫一次）
  if ((st === 'menu' || st === 'levels' || st === 'shop' || st === 'records') && now - last < MENU_FRAME_MS) return;
  // 選單 15fps 時一幀 66ms，dt 上限放寬到 0.1 才不會動畫變慢
  const realDt = Math.min(st === 'playing' ? 0.05 : 0.1, Math.max(0, (now - last) / 1000)); last = now; tReal += realDt;
  // 效能監看：每秒量一次實際 fps 交給畫質調整（src/quality.js）；開局 3 秒（建場景、編 shader）的卡頓不算
  fpsAcc += realDt; fpsN++;
  if (fpsAcc >= 1) {
    G.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0;
    if (G.state === 'playing' && performance.now() - G.startedAt > 3000) { const nt = gov?.tick(G.fps); if (nt) setTier(nt); }
  }
  // 慢動作與 hit-stop
  if (G.slowT > 0) G.slowT -= realDt;
  const tsTarget = G.slowT > 0 ? T.SLOWMO_SCALE : 1;
  G.timeScale += (tsTarget - G.timeScale) * Math.min(1, realDt * (tsTarget < G.timeScale ? 16 : 5));
  G.slowAmt = (1 - G.timeScale) / (1 - T.SLOWMO_SCALE);
  let dt = realDt * G.timeScale;
  if (G.hitStop > 0) { G.hitStop -= realDt; dt = 0; }
  const s = G.sim;
  if (s && (G.state === 'playing' || G.state === 'menu' || G.state === 'over' || G.state === 'levels' || G.state === 'shop' || G.state === 'records')) {
    G.acc += dt; let n = 0;
    const ap = window.__game.autoplay && G.state === 'playing' ? (G.bot ??= makeBot(...window.__game.autoplay)) : null;
    while (G.acc >= T.DT && n < 14) {
      step(s, T.DT, ap ? ap(s) : G.hold && G.state === 'playing'); G.acc -= T.DT; n++;
      if (G.state === 'playing') for (const f of G.feats.tick(s, T.DT)) onFeat(f, s);
    }
    if (n >= 14) G.acc = 0;
    for (const e of s.events) onEvent(e);
    s.events.length = 0;
    if (G.state === 'playing') updatePlaying(realDt, dt);
  }
  if (s) render(realDt, dt);
}

function updatePlaying(realDt, dt) {
  const s = G.sim;
  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) { if (G.combo >= 5) pop(t('pop.combo', { n: G.combo }), s.x, s.y + 3, 'gold'); G.combo = 0; } }
  G.comboPulse = Math.max(0, G.comboPulse - realDt * 5);
  if (G.restartT > 0) { G.restartT -= realDt; if (G.restartT <= 0) resetRun(); }
  if (G.overT > 0) { G.overT -= realDt; if (G.overT <= 0) { endlessOver(); return; } }
  if (G.winT > 0) { G.winT -= realDt; if (G.winT <= 0) { showLevelResult(); return; } }
  if (G.endless) updateEndless();
  UI.hudCoins(save.coins);
  Object.assign(hudData, { endless: G.endless, dist: G.endless ? endlessDist() : 0, level: G.level, score: G.endless ? endlessScore() : G.score, flies: s.fliesGot, fliesTotal: G.lv.flies.length, time: s.time, prog: Math.max(0, Math.min(1, s.x / G.lv.goal.x)), best: G.bestProg, combo: G.combo, comboLeft: Math.max(0, G.comboT / T.COMBO_WINDOW), comboPulse: G.comboPulse });
  UI.hud(hudData);
  // 手機（觸控）：螢幕下方的手指教學 HOLD／LET GO!，前 8 次黏住內或第 1 關
  if (G.touch && (save.grabs < 8 || G.level === 1) && s.mode !== 'dead' && s.mode !== 'won') {
    const tg = s.tongue; UI.hint(null);
    if (tg.state === 'stuck') UI.tut(s.vx > 2 && s.vy > 0 && s.x > tg.ax + tg.L * 0.3 ? 'let' : null);
    else UI.tut(s.target >= 0 && !G.hold && (s.mode === 'perch' || s.vy < 4) ? 'hold' : null);
    return;
  }
  UI.tut(null);
  // 桌機新手提示：前幾次黏住之前，在目標鉤點上顯示 HOLD、擺到前上方時顯示 RELEASE
  if ((save.grabs < 6 || G.level === 1) && s.mode !== 'dead' && s.mode !== 'won') {
    const tg = s.tongue;
    if (tg.state === 'stuck') {
      const go = s.vx > 2 && s.vy > 0 && s.x > tg.ax + tg.L * 0.3;
      if (go) { const p = view.project(s.x, s.y + 2.2); UI.hint(t('hint.release'), p.x, p.y); } else UI.hint(null);
    } else if (s.target >= 0 && !G.hold && (s.mode === 'perch' || s.vy < 4)) {
      movePos(G.lv.hooks[s.target], s.t, tmp); const p = view.project(tmp.x, tmp.y - 2.2);
      UI.hint(t(s.mode === 'perch' ? 'hint.hold' : 'hint.holdNow'), p.x, p.y);
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
  ambient(s, dt);
  fx.update(dt, realDt, s, sp, G.state === 'playing' && s.mode !== 'dead');
  UI.tickFlash(realDt);
  view.post.amount *= Math.exp(-realDt * 7);
  // 鏡頭：平滑跟隨 + 速度前瞻 + 隨速度拉遠 + FOV 衝擊 + 慢動作推近
  const cam = view.camera, c = G.cam;
  let tx, ty, td, follow = false;
  if (G.state === 'menu' || G.state === 'levels' || G.state === 'shop' || G.state === 'records') { tx = s.x - cam.aspect * (G.state === 'shop' ? 2.9 : 3.3); ty = 5.4; td = G.state === 'shop' ? 10 : 12; menuIdle(realDt); }
  else {
    follow = true;
    const lx = Math.max(-6, Math.min(9, s.vx * T.CAM_LOOKAHEAD)), ly = Math.max(-4, Math.min(4, s.vy * T.CAM_LOOKAHEAD * 0.6));
    tx = s.x + 3 + lx; ty = Math.max(T.CAM_MIN_Y, s.y + ly + 1.2);
    // 手機橫向（矮螢幕）拉近一點，青蛙才不會太小
    td = (Math.min(T.CAM_DIST_MAX, T.CAM_DIST + Math.max(0, sp - 9) * T.CAM_DIST_SPEED) - G.slowAmt * 4) * (innerHeight < 500 ? 0.82 : cam.aspect < 0.8 ? 1.5 : 1); // 直式（窄螢幕）拉遠，前方的鉤點才看得到
    if (s.mode === 'won') { tx = s.x + 1; ty = Math.max(5, s.y + 2.5); td = 17; }
  }
  const k = 1 - Math.exp(-realDt * 4.5);
  c.x += (tx - c.x) * k; c.y += (ty - c.y) * k; c.d += (td - c.d) * (1 - Math.exp(-realDt * 2.2));
  // 平滑跟隨在高速時會落後好幾單位，直式畫面又窄，連轉時青蛙會飛出左緣：青蛙中心離畫面中心最多 60% 半寬（橫式很寬，幾乎碰不到）
  if (follow) { const hw = c.d * Math.tan((cam.fov * Math.PI) / 360) * cam.aspect * 0.6; c.x = Math.max(s.x - hw, Math.min(s.x + hw, c.x)); }
  G.fovKick *= Math.exp(-realDt * 3.5);
  const fov = T.CAM_FOV + G.fovKick - G.slowAmt * 7;
  if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  cam.position.set(c.x + fx.shake.x, c.y + fx.shake.y, c.d);
  cam.rotation.set(-0.04, 0, fx.shake.roll);
  view.update(tReal, c.x, Math.max(4, s.y), A.beatPos());
  view.render();
}

// 換畫質級別（src/quality.js 的表）：像素比、陰影、後製、粒子上限直接換；材質種類變了（high↔low）要把場景、青蛙重新 dress
function setTier(name) {
  if (name === G.quality || !TIERS[name]) return;
  const prev = TIERS[G.quality], cur = TIERS[name];
  G.quality = name; ART.q = cur.mats; view.setQuality(cur); fx.setQuality(cur.mats === 'high', cur.fx);
  fpsAcc = 0; fpsN = 0;
  if (!G.lv || cur.mats === prev.mats) return;
  const w = WORLDS[G.lv.world];
  view.setTheme(w, G.endless ? Math.max(ENDLESS_SPAN, (G.sim?.x ?? 0) + 4000) : G.lv.length); lvView.build(G.lv, w); restoreEaten(); applyLook();
}

// 環境粒子：風扇的上升氣流、蒼蠅的嗡嗡點點（只在鏡頭附近生）
function ambient(s, dt) {
  if (dt <= 0) return;
  const lv = G.lv, cx = G.cam.x;
  if (lvView.isGeyser()) { // 火山：蒸汽噴泉。平常口上飄細細的圓蒸汽、預兆（0.6 秒）小蒸汽團變密、噴發時一柱圓胖的蒸汽團往上衝
    const PUFF = ['#ffe3d2', '#ffcfb4', '#ffd9a8'];
    for (const f of lv.fans) {
      if (Math.abs(f.x - cx) > 26) continue;
      const on = f.burst && burstOn(f.burst, s.t), warn = f.burst && burstWarn(f.burst, s.t);
      const n = Math.floor(dt * (on ? 70 : warn ? 26 : 3.5) + Math.random());
      for (let k = 0; k < n; k++) {
        const big = on ? 1 : warn ? 0.55 : 0.4;
        fx.spawn(f.x + (Math.random() - 0.5) * f.w * (on ? 0.7 : 0.4), f.y0 + 0.7, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * (on ? 2.5 : 1.2),
          (on ? 15 + Math.random() * 9 : warn ? 4 + Math.random() * 3 : 2.5 + Math.random() * 2), 0, on ? 0.7 + Math.random() * 0.3 : 1.1, (0.75 + Math.random() * 0.6) * big, 0, 0.6, SH.STEAM, PUFF[k % 3]);
      }
    }
  } else for (const f of lv.fans) if (Math.abs(f.x - cx) < 24 && Math.random() < dt * 14) fx.spawn(f.x + (Math.random() - 0.5) * f.w, f.y0 + 0.5, 0.3, 0, 10 + Math.random() * 6, 0, (f.y1 - f.y0) / 14, 0.2, 0, 0, 3, '#ffffff'); // 上升氣流＝小泡泡
  for (let i = 0; i < lv.flies.length; i++) {
    if (s.flies[i] || Math.abs(lv.flies[i].x - cx) > 22 || Math.random() > dt * 5) continue;
    flyPos(lv.flies[i], s.t, tmp);
    fx.spawn(tmp.x + (Math.random() - 0.5) * 0.8, tmp.y + (Math.random() - 0.5) * 0.8, 0.4, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0, 0.5, 0.09, 0, 1, 0, '#fffbe0');
  }
}

// 選單裡的青蛙偶爾舔一下空氣（世界是活的）
let menuLickT = 2;
function menuIdle(dt) {
  menuLickT -= dt;
  if (menuLickT < 0) { menuLickT = 2.5 + Math.random() * 2.5; G.lick.x = G.sim.x + 1.6 + Math.random() * 1.5; G.lick.y = G.sim.y + 1.2 + Math.random() * 1.5; G.lick.t = 0.16; G.tongueWob = 0.4; frog.jiggle(3); }
}

// ---------- 開機 ----------
// 順序（CrazyGames 版不變）：loadingStart → SDK init（同時下載核心模型）→ 讀存檔 → loadingStop。
// 載入畫面是 index.html 內嵌的（不靠這包 JS）；這裡只負責把進度條推到真的進度。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const onCG = /(^|\.)crazygames\.(com|ru)$/.test(location.hostname) || /crazygames/.test(document.referrer + (location.ancestorOrigins?.[0] ?? ''));
const setBoot = (p) => window.__bootP?.(p);
// 不在 CrazyGames 網域時 SDK 常常永遠不回（要等 cg.js 的 4 秒逾時）：網頁版最多等 WEB_SDK_MS，之後 SDK 晚到也沒關係（cg.js 會補送狀態）
const WEB_SDK_MS = 1200;
async function startSdk() {
  if (import.meta.env.VITE_WEB) return; // 網頁版建置（VITE_WEB=1）：完全不碰 SDK
  await Promise.race([window.__cgSdk, sleep(onCG ? 4000 : WEB_SDK_MS)]); // SDK 腳本是 async 載入的
  const init = cg.init();
  await (onCG ? init : Promise.race([init, sleep(WEB_SDK_MS)]));
}
// 存檔還沒讀之前（SDK 雲端存檔要 init 完才讀得到）先偷看 localStorage，猜該先載哪個世界與造型；猜錯只是讀完存檔後多等一個小包
function peekSave() { try { const r = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') ?? {}; return { last: Math.min(r.last || 1, r.unlocked || 1), skin: r.skin || DEFAULT_SAVE.skin }; } catch { return { last: 1, skin: DEFAULT_SAVE.skin }; } }
async function boot() {
  cg.loadingStart();
  const hint = peekSave(), frac = {};
  const prog = (k) => (f) => { frac[k] = f; setBoot(0.08 + 0.8 * (Object.values(frac).reduce((a, b) => a + b, 0) / 4)); };
  const art = Promise.all([loadPack('core', prog('core')), ...levelPacks(hint.last).map((k) => loadPack(k, prog(k))), ensureSkin(hint.skin, prog('skin'))]);
  await Promise.all([startSdk(), art]); // SDK 與素材同時進行
  setBoot(0.92);
  let raw = null; try { raw = JSON.parse(cg.getItem(SAVE_KEY) || 'null'); } catch { raw = null; }
  save = normalizeSave(raw, LEVEL_COUNT); // 舊存檔（有 stars 欄位）也走這裡
  await Promise.all([...levelPacks(Math.min(save.last, save.unlocked)).map((k) => loadPack(k)), ensureSkin(save.skin)]); // 偷看猜錯時補載
  // 介面語言：?lang= > 玩家自己選的 > CrazyGames locale > 瀏覽器 > English（src/i18n.js detect）；?lang=xx 是版面測試用的加長假語言
  if (urlLang() === 'xx') enablePseudo();
  setLang(detect({ url: urlLang(), saved: save.lang, sdk: sdkInfo(), nav: navLangs() }));
  mountPicker((code) => { save.lang = code; persist(); });
  // 換語言時重算 JS 拼出來的字（選單的 PLAY 1-2、推薦鈕；暫停的關卡與分數），不管是從語言鈕還是直接 setLang
  onLang(() => { if (G.state === 'menu') toMenu(); else if (G.state === 'paused') pauseMeta(); });
  G.touch = matchMedia?.('(pointer: coarse)').matches ?? false;
  const pick = pickTier(); gov = createGovernor(pick); setTier(gov.tier); // 一開始依裝置訊號決定畫質（要在第一次建場景、dress 之前）
  applyLook(); UI.hudCoins(save.coins);
  A.setMusic(save.music); A.setSfx(save.sfx); UI.setToggles(save);
  cg.onMute((m) => A.setMuted(m));
  TM.bind(() => ((G.state === 'playing' || G.state === 'paused') && !G.endless && G.sim ? { level: G.level, x: G.sim.maxX, prog: Math.min(1, G.sim.maxX / G.lv.goal.x) } : null));
  toMenu();
  setBoot(1);
  TM.menuReady(performance.now(), { lang: document.documentElement.lang, vw: innerWidth, vh: innerHeight, q: G.quality }); TM.notice(save.privSeen, () => { save.privSeen = true; persist(); });
  const ld = document.getElementById('boot'); ld?.classList.add('done'); setTimeout(() => ld?.classList.add('out'), 120); setTimeout(() => ld?.remove(), 600); // 載入畫面收掉
  cg.loadingStop();
  requestAnimationFrame((t) => { last = t; frame(t); });
}
boot().catch((e) => { console.error('[boot]', e); window.__bootFail?.(); });
