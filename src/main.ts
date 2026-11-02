// 開機、主迴圈、輸入、存檔、事件 → 手感回饋（音效／粒子／震動／慢動作／跳字）。流程狀態機在 flow.ts，一局結束的節拍在 beat.ts。
// 主迴圈：物理固定 120 Hz（sim.ts），畫面在前後兩個物理狀態之間插值（90／120 Hz 螢幕不會一頓一頓）；按下的瞬間會鎖存到下一個物理步（快速點擊不會遺失）。
import { cg } from './cg.ts';
import { TUNE as T, WORLDS, SKINS, TRAILS, TONGUES, THEMES, THEME_LEVELS, themeKey, themeItems, ownsTheme, themePrice } from './config.ts';
import type { Skin, TongueSpec, TrailSpec, Theme } from './config.ts';
import { generateLevel, newElements, LEVEL_COUNT, levelLabel, worldOf, createEndless, extendEndless, endlessWorld } from './level.ts';
import { createSim, step, movePos, flyPos, burstOn, burstWarn, padSnapshot, ringPoints } from './sim.ts';
import { makeBot } from './bot.ts';
import type { Bot } from './bot.ts';
import * as A from './audio.ts';
import * as UI from './ui.ts';
import { createFeatTracker, featById, recordFeat, BIG_FEATS } from './feats.ts';
import type { FeatHit } from './feats.ts';
import { SAVE_KEY, DEFAULT_SAVE, ENDLESS_UNLOCK, normalizeSave, mergeSave, nextStep, rateStars, recordStars } from './save.ts';
import type { Save, NextStep, ShopItem, ShopTab } from './save.ts';
import { addLocal, submitPlatform } from './leaderboard.ts';
import { t, itemName, setLang, loadLang, onLang, detect, urlLang, navLangs, sdkInfo, mountPicker, enablePseudo, audit } from './i18n.ts';
import './i18n.css';
import { TIERS, pickTier, createGovernor } from './quality.ts';
import type { Governor, TierName } from './quality.ts';
import type { Juice } from './juice.ts';
import { TM } from './telemetry.ts';
import { transition, BOOT_FLOW, RUN } from './flow.ts';
import type { Action, Phase } from './flow.ts';
import { clearBeat, overBeat, dyingBeat, fired, COUNTDOWN } from './beat.ts';
import type { Beat, Cue } from './beat.ts';
import { createView } from './render/view.ts';
import { prefetch, dropPrefetch, measure } from './render/atlas.ts';
import type { View } from './render/view.ts';
import { createLevelView } from './render/level.ts';
import type { LevelView } from './render/level.ts';
import { createCharacter } from './render/character.ts';
import type { Character, Mood } from './render/character.ts';
import { createFx, SH } from './render/fx.ts';
import type { Fx } from './render/fx.ts';
import { loadCatStage, catSinging, setPortraitSource } from './render/portraits.ts';
import type { Level, PadSnapshot, Sim, SimEvent, XY } from './types.ts';

performance.mark('main-start'); // 主程式開始執行（HTML、CSS、JS 下載與解析都在這之前）
// 金幣要珍貴（使用者：太多、太頻繁）：每 500 分 1 枚、過關 3 枚、三星再 3 枚、成就 5–15 枚；物價（config.ts）跟著降到約 2/5
const COIN_PTS = 500; // 每 500 分＝1 金幣
const CLEAR_COINS = 3; // 過關獎勵
const PERFECT_COINS = 3; // 三星加碼
const COIN_HOVER = 0.35; // 金幣噴出後懸空這麼久才飛向 HUD 計數器（到達那一刻數字才跳：入帳要有距離感）
const FLY_STALE = 1.8; // 飛行中的金幣超過這麼多秒還沒到（動畫被打斷）：直接入帳
// 跳字的門檻一律偏嚴：常常跳就廉價，還會打斷盪的手感。分數在 HUD 累計就夠了
const FLIP_POP = 7; // 轉幾圈以上才跳字
const CLOSE_GAP = 0.3; // 離危險物多近才算千鈞一髮（sim 在 1.1 單位內就會發事件，這裡再篩）
const MENU_FRAME_MS = 48; // 選單類畫面最多約 20 fps（只有緩慢的水波與雲，待機少畫三分之一）

// ?perf=1：右上角的效能數字（真機排查用）。frame＝rAF 間隔（含等 GPU）、js＝主執行緒每幀花的時間；>50ms／>200ms 只在遊玩中累計
const PERF = new URLSearchParams(location.search).has('perf');
const perf = { el: null as HTMLDivElement | null, at: 0, n: 0, sum: 0, max: 0, js: 0, jsMax: 0, over50: 0, over200: 0, gpu: '' };
function perfTick(frameMs: number, jsMs: number, playing: boolean): void {
  perf.n++; perf.sum += frameMs; if (frameMs > perf.max) perf.max = frameMs; perf.js += jsMs; if (jsMs > perf.jsMax) perf.jsMax = jsMs;
  if (playing) { if (frameMs > 50) perf.over50++; if (frameMs > 200) perf.over200++; }
  const now = performance.now(); if (now - perf.at < 500) return; perf.at = now;
  if (!perf.el) {
    perf.el = document.createElement('div'); perf.el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:999;font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,.65);padding:6px 8px;border-radius:6px;white-space:pre;pointer-events:none';
    document.body.appendChild(perf.el);
    const g = view.R.gl, d = g.getExtension('WEBGL_debug_renderer_info'); perf.gpu = String(d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)).slice(0, 70);
  }
  perf.el.textContent = `${G.state}  fps ${G.fps}  frame avg ${(perf.sum / perf.n).toFixed(1)} max ${perf.max.toFixed(0)} ms   >50ms ${perf.over50}  >200ms ${perf.over200}\njs avg ${(perf.js / perf.n).toFixed(2)} max ${perf.jsMax.toFixed(1)} ms   draw ${view.drawCalls}   q ${G.quality} dpr ${view.R.dpr}   ${innerWidth}×${innerHeight}\n${perf.gpu}`;
  perf.n = 0; perf.sum = 0; perf.max = 0; perf.js = 0; perf.jsMax = 0;
}

interface Ckpt extends PadSnapshot { score: number }
interface LevelResult { level: number; stars: number; got: [boolean, boolean, boolean]; score: number; newBest: boolean; coins: number } // got：過關、蒼蠅、時間三顆星各自有沒有拿到
const G = {
  flow: BOOT_FLOW, get state(): Phase { return this.flow.phase; }, // 畫面狀態只能經過 dispatch() 改
  level: 1, lv: null as Level | null, sim: null as Sim | null, world: -1,
  score: 0, combo: 0, comboT: 0, comboPulse: 0, deaths: 0, winAnim: 0,
  beat: null as Beat | null, beatT: 0, // 一局結束的節拍與播到哪（真實秒）
  coinQ: [] as { x: number; y: number; n: number; t: number }[], coinsInFlight: 0, flyAt: 0, // 噴出懸空中的金幣；飛向計數器還沒到的金幣數
  timeScale: 1, slowT: 0, slowAmt: 0, hitStop: 0, fovKick: 0, acc: 0, hold: false, latch: false,
  attachesTotal: 0, flipsTotal: 0, bestProg: 0, wins: 0, tongueWob: 0, tipPop: 1, lick: { x: 0, y: 0, t: 0 },
  cam: { x: 0, y: 7, d: T.CAM_DIST }, quality: 'high' as TierName, fps: 60, bestFlip: 0,
  slideT: 0, slideSfxT: 0, ckpt: null as Ckpt | null, hiScore: 0, endless: false, coinPts: 0, runCoins: 0,
  feats: createFeatTracker(), featLog: [] as { id: string; value: number; t: number }[], runFeats: [] as string[], lastWin: null as unknown,
  shopHi: null as string | null, bought: null as ShopItem | null, lvBestScore: 0, levelResult: null as LevelResult | null, lastResult: null as { endless: true; dist: number; score: number; rank: number; coins: number; newBest: boolean } | null,
  startedAt: 0, ignorePressUntil: 0, touch: false, freeze: false, camOv: null as { p: [number, number, number] } | null, bot: null as Bot | null, botKey: '',
  prev: { x: 0, y: 0, a: 0 },
};
// 每個流程動作都經過這裡：這個狀態下不合法（死亡中再撞到東西、開機前開關……）就忽略、回 false
function dispatch(a: Action): boolean { const f = transition(G.flow, a); if (!f) return false; G.flow = f; return true; }
let save: Save = normalizeSave(DEFAULT_SAVE, LEVEL_COUNT);
let view: View, lvView: LevelView, frog: Character, fx: Fx, gov: Governor;
// 手感回饋（粒子、慢動作、震動的組合，約 6 KB）選單出來後才載；載好之前每個呼叫都是空操作。
// 閒置回呼要給上限（忙碌的機器可能很久不閒置），開關卡時也直接確保載好
let juice: Juice = new Proxy({}, { get: () => () => {} }) as Juice, juiceP: Promise<void> | null = null;
const ensureJuice = () => (juiceP ??= import('./juice.ts').then((m) => { juice = m.createJuice({ fx, frog, lvView, G, sfx, duckMusic: A.duckMusic, slowmo, flash: UI.flash, vibrate }); }));
const canvas = document.getElementById('c') as HTMLCanvasElement;

// ---------- 測試／截圖用掛鉤（tests/*.json 冒煙步驟用） ----------
const hooks = {
  get state() { return G.state; }, get level() { return G.level; }, get score() { return G.score; },
  get attaches() { return G.sim?.attaches ?? 0; }, get attachesTotal() { return G.attachesTotal; }, get flips() { return G.flipsTotal; },
  get bestFlip() { return G.bestFlip; }, get x() { return G.sim?.x ?? 0; }, get maxX() { return G.sim?.maxX ?? 0; }, get mode() { return G.sim?.mode; },
  get deaths() { return G.deaths; }, get wins() { return G.wins; }, get coins() { return save.coins; }, get quality() { return G.quality; },
  get fps() { return G.fps; }, get timeScale() { return G.timeScale; }, get result() { return G.lastResult; }, get hold() { return G.hold; },
  get length() { return G.lv?.length ?? 0; }, get dist() { return G.endless ? endlessDist() : 0; }, get levelResult() { return G.levelResult; },
  get frogScreen() { const p = view.project(G.sim?.x ?? 0, G.sim?.y ?? 0); return [p.x, p.y]; },
  get furthest() { return Math.max(G.sim?.maxX ?? 0, G.bestProg * (G.lv?.goal.x ?? 0)); }, get bestScore() { return Math.max(G.score, G.lvBestScore); },
  get endless() { return G.endless; }, get startedAt() { return G.startedAt; }, get feats() { return G.featLog; }, get lastWin() { return G.lastWin; }, get save() { return save; }, get ckpt() { return G.ckpt; },
  get sim() { return G.sim; }, get view() { return view; }, get particles() { return fx.count(); }, get atlasBytes() { return view.atlasBytes; },
  start(n: number) { startLevel(n); }, startEndless() { startEndless(); },
  look(skin: string, trail?: string, tongue?: string) { applyLook(SKINS.find((k) => k.id === skin), TRAILS.find((k) => k.id === trail), TONGUES.find((k) => k.id === tongue)); },
  forceDie() { const s = G.sim; if (s && s.mode !== 'dead') { s.mode = 'air'; s.tongue.state = 'idle'; s.y = 0.1; s.vy = -5; } },
  forceWin() { const s = G.sim, g = G.lv?.goal; if (!s || !g) return; UI.dieText(null); s.tongue.state = 'idle'; s.mode = 'air'; s.x = g.x; s.y = g.y + 4; s.vx = 0; s.vy = -4; },
  skip() { skipBeat(); }, get flow() { return G.flow; }, get theme() { return save.theme; }, buySet(id: string) { const th = THEMES.find((x) => x.id === id); if (th) shopSet(th); }, get beat() { return G.beat ? { t: G.beatT, total: G.beat.total, skipAfter: G.beat.skipAfter } : null; }, get coinsInFlight() { return G.coinsInFlight; },
  set camOverride(v: { p: [number, number, number] } | null) { G.camOv = v; }, set freeze(v: boolean) { G.freeze = !!v; },
  setTier(n: TierName) { setTier(n); }, setLow() { setTier('low'); },
  emit(e: SimEvent) { if (G.sim) onEvent({ x: G.sim.x, y: G.sim.y, ...e } as SimEvent); },
  fxFeat(kind: string) { fxFeat(kind); },
  ballPos(i: number) { return lvView.ballPos(i); },
  audio: A, ui: UI, i18n: { audit, setLang, t },
  autoplay: null as [number, number] | null, // 截圖巡覽用：設成 [rel, grabVy] 讓自動玩家操作
};
// 測試掛鉤只在開發伺服器或 ?debug=1 才掛到 window（正式版不暴露改存檔、刷榜的入口）
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) (window as unknown as { __game: typeof hooks }).__game = hooks;

// ---------- 存檔、造型 ----------
const persist = () => { save.updatedAt = Date.now(); cg.saveJSON(SAVE_KEY, save); };
const skinOf = (): Skin => SKINS.find((s) => s.id === save.skin) ?? SKINS[1];
const trailOf = (): TrailSpec => TRAILS.find((x) => x.id === save.trail) ?? TRAILS[0];
const tongueOf = (): TongueSpec => TONGUES.find((x) => x.id === save.tongue) ?? TONGUES[0];
function applyLook(sk: Skin = skinOf(), tr: TrailSpec = trailOf(), tk: TongueSpec = tongueOf()): void { frog.setSkin(sk); fx.setTrail(tr); frog.setTongue(tk); if (sk.kind === 'cat') A.wantOiia(); }
// 主題：道具替換表（起點、終點、蒼蠅……）與音效替換表跟著 save.theme；沒套用主題就全部用世界預設
function applyTheme(): void { const th = THEMES.find((x) => x.id === save.theme); view.setTheme(th?.props ?? {}); lvView.setTheme(th?.props ?? {}); A.setTheme(th?.sfx ?? {}); }
const vibrate = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* 不支援就算了 */ } };
const sfx = (n: string, o?: A.PlayOpts) => A.play(n, o);

// ---------- 關卡 ----------
function setWorld(w: number): void { G.world = w; view.setWorld(w); lvView.setWorld(w); A.setWorld(w); UI.setWorld(w); document.body.style.background = WORLDS[w].sky[0]; }
function loadLevel(n: number): void {
  const fresh = G.level !== n || G.endless;
  if (fresh) { G.bestProg = 0; G.lvBestScore = 0; }
  G.endless = false; G.level = n; G.lv = generateLevel(n);
  lvView.build(G.lv); setWorld(G.lv.world);
  resetRun(true);
}
// 無盡模式：每次一條新的隨機路線；元素上限＝主線打過的關數（荷葉、加速圈、沙丘要先在主線學過）
const endlessCap = () => Math.max(60, Math.min(LEVEL_COUNT, save.unlocked - 1));
function loadEndless(): void {
  G.endless = true; G.level = 0; G.bestProg = 0;
  G.lv = createEndless(1 + Math.floor(Math.random() * 1e6), endlessCap());
  lvView.build(G.lv); setWorld(0);
  resetRun();
}
function updateEndless(): void {
  const s = G.sim!, L = G.lv!;
  if (L.gen!.x < s.x + 120) extendEndless(L, s.x + 250);
  const cap = save.unlocked > 75 ? 6 : save.unlocked > 60 ? 5 : 4, k = endlessWorld(s.x, cap);
  const kNext = endlessWorld(s.x + 150, cap); if (kNext !== G.world) prefetch(`w${kNext}`); // 快到下一個世界：先把圖集下載解碼好，切換那一幀就有道具
  if (k !== G.world && s.mode !== 'dead') {
    L.world = k; setWorld(k);
    UI.flash(0.6); sfx('win'); UI.popup(t(`world.${k}`, null, WORLDS[k].name), innerWidth / 2, bigY(), 'big'); fx.addTrauma(0.2, true); juice.levelIn(s);
  }
}
const endlessDist = () => Math.floor(Math.max(0, (G.sim?.maxX ?? 0) - (G.lv?.start.x ?? 0)));
const endlessScore = () => G.score + endlessDist() * 10;
// fromStart＝true：忘掉荷葉存檔，從起點重來；預設（死掉自動重生、R 鍵）：有存檔就從最後落地的荷葉重生
function resetRun(fromStart = false): void {
  if (G.endless && G.sim && G.sim.maxX > 60) { G.sim = null; loadEndless(); return; } // 無盡模式死掉或重來＝新路線
  if (fromStart || G.endless) G.ckpt = null;
  G.lvBestScore = Math.max(G.lvBestScore, G.score);
  const ck = G.ckpt;
  // 荷葉重生：蒼蠅、圈圈、加速圈、時間、分數都回到落地那一刻；金幣已入帳，不重複給
  G.sim = createSim(G.lv!, ck); G.score = ck ? ck.score : 0; if (!ck) { G.coinPts = 0; G.runCoins = 0; G.hiScore = 0; }
  G.feats.reset(); if (ck) G.feats.st.padded = true; G.runFeats = [];
  G.combo = 0; G.comboT = 0; G.winAnim = 0; G.acc = 0; G.slowT = 0; G.hitStop = 0;
  G.prev.x = G.sim.x; G.prev.y = G.sim.y; G.prev.a = G.sim.angle;
  lvView.reset(); restoreEaten(); fx.clear(); fx.resetTrail(G.sim.x, G.sim.y); UI.dieText(null);
  frog.squash(0.7, 0);
  if (G.state === 'playing') cg.gameplayStart(); // 重生、R 重來：這一局繼續算（cg.ts 會去重）
}
// 荷葉重生後：已經吃掉的蒼蠅、圈圈、加速圈照 sim 狀態隱藏
function restoreEaten(): void {
  const s = G.sim; if (!s) return;
  s.flies.forEach((v, i) => { if (v) lvView.st.flyGone[i] = 1; });
  s.rings.forEach((v, i) => { if (v) lvView.st.ringGone[i] = 1; });
  s.boostUsed.forEach((v, i) => { if (v) lvView.st.boostGone[i] = 1; });
  G.lv!.pads.forEach((_, i) => { lvView.st.padOn[i] = i <= s.checkpoint ? 1 : 0; });
}
let pendingStart = 0;
function startLevel(n: number): void {
  const wi = worldOf(n);
  // 世界圖集還沒到（第一次進這個世界、或剛切過世界）：先換世界讓它開始載，到了再開；不然鉤子、荷葉會等圖集到了才冒出來
  if (!view.worldReady(wi)) { pendingStart = n; setWorld(wi); void view.ensureWorld(wi).then(() => { if (pendingStart === n) { pendingStart = 0; startLevel(n); } }); return; }
  pendingStart = 0; void ensureJuice();
  const last = n === LEVEL_COUNT || (n > LEVEL_COUNT && (n - LEVEL_COUNT) % THEME_LEVELS === 0); // 主線最後一關、主題系列最後一關：過了回選單
  if (!dispatch(last ? 'startLast' : 'start')) return;
  if (n % 15 === 0 && wi + 1 < WORLDS.length) prefetch(`w${wi + 1}`); // 這個世界的最後一關：先把下一個世界的圖集下載解碼好
  beginRun();
  A.initAudio();
  loadLevel(n); TM.levelStart(n);
  save.last = n; persist();
  cg.gameplayStart(); clearHold(); UI.show(null); UI.hint(null);
  G.cam.x = G.sim!.x + 6; G.cam.y = G.lv!.world === 5 ? T.CAM_MIN_Y_DUNE : T.CAM_MIN_Y; juice.levelIn(G.sim!);
  const ne = newElements(n)[0]; UI.newCard(ne ? t(`new.${ne}`) : null);
  UI.popup(n <= LEVEL_COUNT && (n - 1) % 15 === 0 ? t('pop.worldLevel', { world: t(`world.${G.lv!.world}`, null, WORLDS[G.lv!.world].name), level: levelLabel(n) }) : t('pop.level', { level: levelLabel(n) }), innerWidth / 2, bigY(), 'big');
}
function startEndless(): void {
  if (save.unlocked <= ENDLESS_UNLOCK || !dispatch('startEndless')) return;
  beginRun(); // 直接進無盡也要讓畫質調整開始計時
  A.initAudio(); void ensureJuice(); G.sim = null; loadEndless();
  cg.gameplayStart(); clearHold(); UI.show(null); UI.hint(null);
  G.cam.x = G.sim!.x + 6; G.cam.y = T.CAM_MIN_Y;
  UI.popup(t('pop.endlessBest', { dist: save.endlessBest }), innerWidth / 2, bigY(), 'big');
}
// 開一關／開一局之前：上一局的節拍、懸空與飛行中的金幣、結束浮層都清掉
function beginRun(): void {
  G.beat = null; G.coinQ.length = 0; G.coinsInFlight = 0; UI.clearHide(); UI.overHide();
  G.ignorePressUntil = performance.now() + 250; G.startedAt = performance.now();
}
// 金幣入帳要有距離感：存檔立刻加（永遠不會少算），HUD 的數字等金幣真的飛到計數器才跳。
// fly＝true：從角色身上噴出、懸空 COIN_HOVER 秒、飛向計數器；false：呼叫端自己安排飛行（成就膠囊、過關節拍）
function addCoins(n: number, fly = true): void {
  if (n <= 0) return; save.coins += n; G.runCoins += n; G.coinsInFlight += n; G.flyAt = performance.now();
  if (!fly) return;
  const s = G.sim;
  if (!s || !RUN.has(G.state)) { G.coinsInFlight -= n; return; }
  juice.coins(s.x, s.y, n); sfx('coin'); G.coinQ.push({ x: s.x, y: s.y + 2, n, t: COIN_HOVER });
}
// 飛行中的金幣到達：k 枚均分 n，最後一枚帶餘數；i<0＝沒飛成（計數器不在畫面上），全部直接入帳
function lander(n: number, k: number): (i: number) => void { let left = n; return (i) => { const d = i < 0 || i >= k - 1 ? left : Math.floor(n / k); left -= d; G.coinsInFlight = Math.max(0, G.coinsInFlight - d); }; }
function flyCoins(n: number, from: [number, number]): void { if (n <= 0) return; const k = Math.min(5, n), land = lander(n, k); G.flyAt = performance.now(); if (!UI.coinFly(from, document.getElementById('hudCoins'), k, land)) land(-1); }
function tickCoins(dt: number): void {
  for (let i = G.coinQ.length - 1; i >= 0; i--) { const q = G.coinQ[i]; q.t -= dt; if (q.t <= 0) { G.coinQ.splice(i, 1); const p = view.project(q.x, q.y); flyCoins(q.n, [p.x, p.y]); } }
  if (G.coinsInFlight > 0 && performance.now() - G.flyAt > FLY_STALE * 1000) G.coinsInFlight = 0; // 動畫被打斷（切分頁、換畫面）：別讓數字卡住
}
function onFeat(f: FeatHit): void {
  const d = featById(f.id)!;
  if (f.silent) { const r = save.feats[f.id]; if (r && d.better === 'max' && f.value > r.best) r.best = f.value; return; } // 同一跳的後續圈數只刷新最佳值，不重複計次
  const better = recordFeat(save.feats, f.id, f.value);
  G.featLog.push({ id: f.id, value: f.value, t: performance.now() });
  G.runFeats.push(f.id);
  const big = BIG_FEATS.has(f.id);
  addCoins(d.coins, !big); persist();
  if (big) { UI.feat(UI.featName(f.id), UI.featLine(f.id), d.coins, lander(d.coins, 3)); sfx('ring'); sfx('buy'); A.duckMusic(0.35, 0.8); vibrate([15, 30, 15]); fxFeat(f.id); } // 金幣從膠囊上的 +N 飛進計數器
  else { const s = G.sim; if (s) pop(UI.featName(f.id), s.x, s.y + 3, 'gold'); sfx('ring'); } // 其他成就：跟一般跳字一樣簡單閃一下，金幣（計數器會動）與紀錄照給
  if (better && save.feats[f.id].count > 1) UI.popup(t('pop.newRecord'), innerWidth / 2, bigY() + 150, 'gold');
}

// ---------- 連擊與分數 ----------
const mult = () => 1 + Math.min(3, Math.floor(G.combo / 8) * 0.5);
function addCombo(): void { G.combo++; G.comboT = T.COMBO_WINDOW; G.comboPulse = 1; }
function addScore(v: number): number {
  const s = Math.round(v * mult()), before = G.score; G.score += s;
  const earned = Math.max(0, G.score - Math.max(before, G.hiScore)); G.hiScore = Math.max(G.hiScore, G.score);
  G.coinPts += earned; const c = Math.floor(G.coinPts / COIN_PTS); if (c > 0) { G.coinPts -= c * COIN_PTS; addCoins(c); }
  return s;
}
function fxFeat(kind: string): void { const s = G.sim; if (s) juice.feat(kind, s.x, s.y); }
const bigY = () => Math.max(132, innerHeight * 0.27);
function pop(text: string, x: number, y: number, cls: string): void {
  if (cls === 'big') { UI.popup(text, innerWidth / 2, bigY(), cls); return; }
  const p = view.project(x, y); UI.popup(text, p.x, p.y, cls);
}
function slowmo(tm = T.SLOWMO_TIME): void { G.slowT = Math.max(G.slowT, tm); A.duckMusic(0.3, tm); }

function onEvent(e: SimEvent): void {
  const s = G.sim!, w = WORLDS[G.lv!.world];
  for (const f of G.feats.event(e, s)) onFeat(f);
  switch (e.type) {
    case 'crouch': sfx('tick'); break;
    case 'jump': juice.jump(s, w); sfx('jump'); break;
    case 'shoot': sfx('shoot'); G.tongueWob = 0.35; break;
    case 'miss': sfx('miss'); G.tongueWob = 0.5; break;
    case 'attach':
      G.attachesTotal++; save.grabs++;
      sfx('attach', { combo: G.combo });
      G.tongueWob = 0.6; G.tipPop = 1.9;
      juice.attach(e, s, w, tongueOf());
      addCombo(); addScore(T.SCORE_GRAB);
      vibrate(8);
      break;
    case 'release':
      sfx('release'); if (e.speed > 21) sfx('whoosh');
      G.tongueWob = 0.7; juice.release(s, e.speed);
      break;
    case 'flip': {
      G.flipsTotal++; G.bestFlip = Math.max(G.bestFlip, e.n);
      addCombo();
      addScore(T.SCORE_FLIP * e.n);
      sfx('flip', { n: e.n, combo: G.combo });
      if (e.n >= FLIP_POP) pop(t('pop.flipN', { n: e.n }), s.x, s.y + 2.6, 'big');
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
      const pts = addScore(ringPoints(G.lv!, e.i));
      if (G.lv!.rings[e.i]?.trail !== undefined) { pop(t('pop.ring', { pts }), e.x, e.y + 2.2, 'gold'); juice.ringTrail(e); break; }
      pop(t('pop.ring', { pts }), e.x, e.y + 2.6, 'big');
      juice.ring(e, e.speed > 16 || e.flips >= 1 ? T.SLOWMO_TIME : 0.45);
      break;
    }
    case 'bounce':
      sfx('bounce'); addCombo(); addScore(T.SCORE_BOUNCE);
      juice.bounce(e, w); vibrate(15);
      break;
    case 'fan': sfx('fan'); juice.fan(s); break;
    case 'dune': sfx('jelly'); juice.dune(e, w); break;
    case 'launch': sfx('whoosh'); sfx('sparkle', { n: 1 }); juice.launch(e, w); break;
    case 'pad':
      lvView.landPad(e.i); juice.pad(e, w); sfx('jelly');
      if (!G.endless) { G.ckpt = { ...padSnapshot(s), score: G.score }; pop(t('pop.checkpoint'), e.x, e.y + 2.6, 'gold'); }
      break;
    case 'boost':
      lvView.takeBoost(e.i); juice.boost(e, w); sfx('whoosh'); addCombo();
      break;
    case 'close': {
      if (e.gap === undefined || e.gap > CLOSE_GAP) break; // 真的貼著過才算
      const pts = addScore(50); addCombo(); sfx('ring');
      pop(t('pop.closeCall', { pts }), e.x, e.y + 2, 'gold'); juice.close(e);
      break;
    }
    case 'wall': sfx('wall'); juice.wall(s, w); break;
    case 'die': {
      if (!dispatch('die')) break; // 已經在死亡／過關的節拍裡：忽略
      const water = e.cause === 'water';
      sfx(water ? 'splash' : 'spike'); G.deaths++;
      if (water) juice.dieWater(e, w); else juice.dieHazard(e, skinOf());
      UI.dieText(water ? t(`die.${G.lv!.world}`, null, w.die) : t('pop.ouch'));
      const prog = G.endless ? 0 : Math.min(1, s.maxX / G.lv!.goal.x);
      if (prog > 0.6) UI.popup(t('pop.soClose', { pct: Math.round(prog * 100) }), innerWidth / 2, innerHeight * 0.52, 'gold');
      G.bestProg = Math.max(G.bestProg, prog); if (!G.endless) TM.death(e.x, prog, e.cause);
      A.duckMusic(0.4, 0.4); vibrate([30, 40, 30]);
      G.combo = 0; cg.gameplayStop(); persist();
      if (G.endless) endlessOver(); else startBeat(dyingBeat(T.RESTART_DELAY));
      break;
    }
    case 'win': {
      if (!dispatch('win')) break;
      sfx('win'); G.winAnim = 0;
      const g = G.lv!.goal, bull = Math.abs(s.x - g.x) < 1.6;
      juice.win(s, g); vibrate([20, 30, 60]);
      if (bull) pop(t('pop.bullseye'), s.x + 4, s.y + 2, 'gold'); // 一般落地不跳字，正中紅心才值得；放角色右邊（頭上是金幣晶片、大字的位置是過關浮層的）
      if (bull) addScore(200);
      levelCleared();
      break;
    }
  }
}

// ---------- 過關：落荷葉那一刻就記錄、存檔，浮層出來，節拍（beat.ts）播完無條件下一關；沒有按鈕 ----------
function levelCleared(): void {
  const s = G.sim!, n = G.level, lv = G.lv!;
  const rate = rateStars({ flies: s.fliesGot, fliesTotal: lv.flies.length, time: s.time, par: lv.par });
  recordStars(save, n, rate.stars); TM.clear(s.time, rate.stars, s.fliesGot);
  const prevBest = save.best[n] ?? 0, newBest = G.score > prevBest && prevBest > 0;
  save.best[n] = Math.max(prevBest, G.score);
  save.unlocked = Math.max(save.unlocked, Math.min(LEVEL_COUNT, n + 1));
  save.clears++; G.wins++;
  if (n % 15 === 0 && !save.worldsDone.includes(n)) { save.worldsDone.push(n); cg.happytime(); } // 破世界＝真正的成就
  addCoins(CLEAR_COINS + (rate.stars === 3 ? PERFECT_COINS : 0), false); persist(); // 過關獎勵先記進存檔；噴出與飛入由節拍安排
  G.lastWin = { level: n, score: G.score, time: s.time, coins: G.runCoins, at: performance.now() };
  G.levelResult = { level: n, stars: rate.stars, got: [true, rate.fliesOk, rate.timeOk], score: G.score, newBest, coins: G.runCoins };
  UI.hint(null); UI.tut(null); clearHold(); cg.gameplayStop();
  UI.clearShow(t(n % 15 === 0 ? 'result.world' : rate.stars === 3 ? 'result.perfect' : 'result.clear'), { level: levelLabel(n), flies: s.fliesGot, fliesTotal: lv.flies.length, time: s.time, par: lv.par });
  startBeat(clearBeat(rate.stars, newBest));
}

// ---------- 無盡死亡：那一刻就結算、存檔，浮層出來，倒數完自動新一局 ----------
function endlessOver(): void {
  const dist = endlessDist(), score = endlessScore();
  const newBest = dist > save.endlessBest && save.endlessBest > 0; TM.endlessOver(dist, score);
  save.endlessBest = Math.max(save.endlessBest, dist); save.endlessRuns++;
  const now = new Date(), day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const rank = addLocal(save.lb, { score, dist, day });
  void submitPlatform(score);
  if (newBest) cg.happytime();
  persist();
  G.lastResult = { endless: true, dist, score, rank, coins: G.runCoins, newBest };
  clearHold(); UI.hint(null); UI.tut(null);
  UI.overShow(save.endlessBest);
  startBeat(overBeat());
}

// ---------- 節拍：固定時間表（beat.ts），每幀取出跨過的提示點播畫面；任何點擊在 skipAfter 之後可提前；播完去哪由 flow.ts 決定 ----------
function startBeat(b: Beat): void { G.beat = b; G.beatT = 0; }
function tickBeat(dt: number): void {
  const b = G.beat; if (!b) return;
  const t0 = G.beatT; G.beatT += dt;
  for (const c of fired(b, t0, G.beatT)) onCue(c, false);
  if (G.beat === b && G.beatT >= b.total) endBeat();
}
function skipBeat(): void {
  const b = G.beat; if (!b || !RUN.has(G.state) || G.beatT < b.skipAfter) return; // 暫停中不算（節拍留著等繼續）
  for (const c of fired(b, G.beatT, Infinity)) onCue(c, true);
  endBeat();
}
function endBeat(): void {
  const was = G.state; G.beat = null;
  if (!dispatch('beatEnd')) return;
  if (was === 'dying') resetRun(); // 主線：從最後落地的荷葉重生
  else if (was === 'over') startEndless(); // 無盡：新一局
  else if (G.state === 'menu') toMenu(); // 最後一關：回選單
  else startLevel(G.level + 1);
}
// fast＝玩家點擊提前：剩下的提示點一次做完，沒有動畫與聲音
function onCue(c: Cue, fast: boolean): void {
  const s = G.sim!, r = G.levelResult, o = G.lastResult;
  switch (c) {
    case 'star1': case 'star2': case 'star3': { const i = Number(c[4]) - 1; if (r?.got[i]) UI.clearStar(i, fast); break; } // 沒拿到的那顆留暗
    case 'coinsOut': if (!fast) { juice.coins(s.x, s.y, 8); sfx('coin'); } break;
    case 'coinsFly': {
      UI.clearCoins(G.runCoins); G.coinQ.length = 0;
      if (fast) G.coinsInFlight = 0; else { const p = view.project(s.x, s.y + 2); flyCoins(G.coinsInFlight, [p.x, p.y]); }
      break;
    }
    case 'best': UI.clearBest(); if (!fast) sfx('buy'); break;
    case 'dist': UI.overDist(o?.dist ?? 0, !!o?.newBest, fast); break;
    case 'score': UI.overScore(o?.score ?? 0); break;
    case 'countdown': UI.overCountdown(fast ? 0 : COUNTDOWN); break;
  }
}

// ---------- 選單 ----------
// 沒有離開遊戲鈕。退回選單時把一個「下一步」推到最顯眼：新模式 → 新世界 → 買得起的東西
let menuStep: NextStep | null = null;
function toMenu(): void {
  TM.leave('menu');
  if (RUN.has(G.state) || G.state === 'paused') cg.gameplayStop();
  persist();
  if (!dispatch('menu')) return;
  G.beat = null; G.coinQ.length = 0; G.coinsInFlight = 0; clearHold(); UI.tryNow(null); UI.newCard(null);
  loadLevel(Math.min(save.last, save.unlocked));
  UI.show('menu'); UI.setCoins(save.coins); UI.hint(null);
  UI.setPlay(t('menu.play', { level: levelLabel(Math.min(save.unlocked, LEVEL_COUNT)) })); UI.setHero(skinOf());
  UI.setEndless(save.unlocked > ENDLESS_UNLOCK);
  menuStep = nextStep(save);
  document.getElementById('endlessBtn')!.classList.toggle('badge', menuStep?.kind === 'endless');
  document.getElementById('shopBtn')!.classList.toggle('badge', menuStep?.kind === 'shop');
  if (!menuStep) UI.nextUp(null);
  else if (menuStep.kind === 'endless') UI.nextUp(t('next.endless'), t('next.endlessSub'), { icon: 'loop' });
  else if (menuStep.kind === 'world') UI.nextUp(t('next.world', { world: t(`world.${menuStep.world}`, null, WORLDS[menuStep.world].name) }), t('next.worldSub', { level: levelLabel(menuStep.level) }), { icon: 'globe' });
  else UI.nextUp(t('next.get', { item: itemName(menuStep.item.tab, menuStep.item) }), t('next.getSub', { coins: save.coins, price: menuStep.item.price }), menuStep.item.tab === 'skins' ? { skin: menuStep.item.id } : { icon: 'coin' });
}
function goNextUp(): void {
  const st = menuStep; if (!st) return;
  sfx('click');
  if (st.kind === 'endless') { save.seen.endless = true; persist(); startEndless(); }
  else if (st.kind === 'world') { save.seen.world = st.world; persist(); startLevel(st.level); }
  else openShop(st.item);
}
// 選關背景：切到哪個世界分頁就換成那個世界（換世界只是換色，沒有載入成本）
function levelsBackdrop(w: number): void {
  const n = w >= WORLDS.length ? LEVEL_COUNT + (w - WORLDS.length) * THEME_LEVELS + 1 : Math.min(w * 15 + 1, save.unlocked); // 主題分頁：系列第一關（道具是主題版）
  if (worldOf(n) !== G.lv?.world || G.endless || (n > LEVEL_COUNT) !== (G.level > LEVEL_COUNT)) loadLevel(n);
}
function openLevels(): void { if (!dispatch('levels')) return; sfx('click'); G.beat = null; if (G.sim && G.sim.mode !== 'perch') resetRun(true); clearHold(); UI.setWorldTab(save.unlocked); UI.renderLevels(save, (n) => { sfx('click'); startLevel(n); }, levelsBackdrop); levelsBackdrop(worldOf(save.unlocked)); UI.show('levels'); }
function openRecords(): void { if (!dispatch('records')) return; sfx('click'); clearHold(); UI.renderRecords(save, G.lastResult?.score); UI.show('records'); }
// 商店展示台的旋轉貓：第一次開商店才掛上（圖片到那時才下載）；畫布 2 倍解析度（CSS 最大 230px）
function openShop(hi: ShopItem | null = null): void {
  void loadCatStage().then((m) => m.catStage(document.getElementById('showSpin') as HTMLCanvasElement, 460, { feet: 0.97, height: 0.9 }));
  if (!dispatch('shop')) return;
  sfx('click'); if (G.sim && G.sim.mode !== 'perch') resetRun(true); clearHold();
  if (!save.saleAt) { save.saleAt = Date.now(); persist(); } // 組合包的限時特價從第一次開商店算起
  G.shopHi = hi?.id ?? null; if (hi) UI.setShopTab(hi.tab);
  renderShop(); UI.show('shop'); UI.tryNow(null);
}
function renderShop(): void { UI.renderShop(save, (tab, it) => shopPick(tab, it), G.shopHi, shopSet); }
// 組合包：沒擁有→買（全部進 owned，含系列關卡）；擁有→一鍵套用整套（角色、舌頭、拖尾、道具、音效）
function shopSet(th: Theme): void {
  const owned = ownsTheme(save.owned, th);
  if (!owned) {
    const price = themePrice(th, save.saleAt, Date.now());
    if (save.coins < price) { sfx('miss'); TM.want(`set_${th.id}`, price, save.coins); return; }
    save.coins -= price; for (const id of [themeKey(th.id), ...themeItems(th)]) if (!save.owned.includes(id)) save.owned.push(id);
    sfx('buy'); UI.setCoins(save.coins); TM.buy(`set_${th.id}`, price);
  } else sfx('click');
  save.theme = th.id; save.skin = th.skin; save.tongue = th.tongue; save.trail = th.trail;
  frog.squash(0.6, 0); frog.jiggle(6); applyLook(); applyTheme(); persist(); renderShop();
  if (!owned) { const sk = SKINS.find((k) => k.id === th.skin)!; G.bought = { ...sk, tab: 'skins' }; UI.tryNow(sk.name, sk); }
}
function shopPick(tab: ShopTab, it: Skin | TongueSpec | TrailSpec): void {
  let bought = false;
  if (!save.owned.includes(it.id)) {
    if (save.coins < it.price) { sfx('miss'); TM.want(it.id, it.price, save.coins); return; } // 「想買但不夠」：定價的依據
    save.coins -= it.price; save.owned.push(it.id); sfx('buy'); UI.setCoins(save.coins); bought = true; TM.buy(it.id, it.price);
    const tongue = 'tongue' in it ? it.tongue : undefined;
    if (tongue && !save.owned.includes(tongue)) save.owned.push(tongue); // 角色送招牌舌頭
    if (G.shopHi === it.id) G.shopHi = null;
  } else sfx('click');
  if (tab === 'skins') { save.skin = it.id; const tongue = 'tongue' in it ? it.tongue : undefined; if (tongue) save.tongue = tongue; frog.squash(0.6, 0); frog.jiggle(6); }
  else if (tab === 'tongues') { save.tongue = it.id; G.lick.x = G.sim!.x + 2.5; G.lick.y = G.sim!.y + 1.5; G.lick.t = 0.4; G.tongueWob = 0.5; }
  else save.trail = it.id;
  applyLook(); persist(); renderShop();
  if (bought) { G.bought = { ...it, tab } as ShopItem; UI.tryNow(it.name, it); } // 買完：慶祝＋立刻推「立即試玩」
}
function tryBought(): void { sfx('click'); UI.tryNow(null); if (G.bought) startLevel(Math.min(save.unlocked, LEVEL_COUNT)); }
function pause(): void {
  if (!dispatch('pause')) return; // 只在一局之內（遊玩、死亡、過關、無盡結束的節拍中都可以）
  clearHold(); cg.gameplayStop(); persist();
  pauseMeta(); UI.show('pause'); view.dirty = true;
}
function pauseMeta(): void { UI.pauseMeta(G.endless ? t('pause.endless', { dist: endlessDist() }) : t('pause.level', { level: levelLabel(G.level), score: G.score.toLocaleString('en-US') })); }
function resume(): void { if (!dispatch('resume')) return; sfx('click'); if (G.state === 'playing') cg.gameplayStart(); clearHold(); UI.show(null); }
function toggle(key: 'music' | 'sfx'): void { save[key] = !save[key]; persist(); UI.setToggles(save); A.setMusic(save.music); A.setSfx(save.sfx); sfx('click'); }

// ---------- 輸入 ----------
const isUI = (tg: EventTarget | null) => tg instanceof Element && !!tg.closest('button, .panel, .card, .lvb, .tab');
const held = { key: false, ptr: new Set<number | string>() };
const syncHold = () => { G.hold = G.state === 'playing' && (held.key || held.ptr.size > 0); if (G.hold) G.latch = true; };
const canPress = () => G.state === 'playing' && !!G.sim && G.sim.mode !== 'dead' && performance.now() > G.ignorePressUntil;
const clearHold = () => { held.key = false; held.ptr.clear(); G.latch = false; syncHold(); };
addEventListener('pointerdown', (e) => {
  A.initAudio(); if (e.pointerType === 'touch') G.touch = true;
  if (isUI(e.target)) return;
  if (G.state === 'playing') { e.preventDefault(); if (canPress()) { held.ptr.add(e.pointerId); syncHold(); } }
  else if (G.beat) { e.preventDefault(); skipBeat(); } // 一局結束的節拍中點一下：提前
}, { passive: false });
const ptrUp = (e: PointerEvent) => { held.ptr.delete(e.pointerId); syncHold(); };
// 合成 TouchEvent（不會產生 pointer 事件）也要能玩：用 'touch' 當一個指標
addEventListener('touchstart', (e) => { G.touch = true; A.initAudio(); if (isUI(e.target)) return; if (G.state === 'playing') { e.preventDefault(); if (canPress()) { held.ptr.add('touch'); syncHold(); } } else if (G.beat) { e.preventDefault(); skipBeat(); } }, { passive: false });
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
  // 鍵盤操作 UI：焦點在按鈕上時 Enter／Space 交給那顆按鈕
  if ((e.code === 'Enter' || e.code === 'Space') && G.state !== 'playing' && document.activeElement instanceof HTMLButtonElement && document.activeElement.offsetParent) return;
  const act = HOLD_KEYS.has(e.code) || e.code === 'Enter';
  if (G.state === 'playing') {
    if (HOLD_KEYS.has(e.code)) { if (canPress()) { held.key = true; syncHold(); } }
    else if (e.code === 'Escape' || e.code === 'KeyP') pause();
    else if (e.code === 'KeyR') { clearHold(); resetRun(); }
  } else if (G.state === 'paused') { if (act || e.code === 'Escape' || e.code === 'KeyP') resume(); }
  else if (G.beat) { if (act || e.code === 'KeyR') skipBeat(); else if (e.code === 'Escape' || e.code === 'KeyP') pause(); } // 一局結束的節拍中：提前，或暫停（回選單在暫停選單裡）
  else if (G.state === 'menu') { if (act) startLevel(Math.min(save.unlocked, LEVEL_COUNT)); }
  else if ((G.state === 'levels' || G.state === 'shop' || G.state === 'records') && e.code === 'Escape') { sfx('click'); toMenu(); }
});
addEventListener('keyup', (e) => { if (HOLD_KEYS.has(e.code)) { held.key = false; syncHold(); } });
// 切走分頁：暫停、存檔、整個音訊時鐘停下；回來時音訊接著走（遊戲維持暫停，等玩家按繼續）
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); persist(); A.setPaused(true); } else A.setPaused(false); });

const on = (id: string, fn: () => void) => document.getElementById(id)!.addEventListener('click', fn);
on('playBtn', () => { sfx('click'); startLevel(Math.min(save.unlocked, LEVEL_COUNT)); });
on('levelsBtn', openLevels); on('shopBtn', () => openShop(menuStep?.kind === 'shop' ? menuStep.item : null));
on('endlessBtn', () => { sfx('click'); if (save.unlocked <= ENDLESS_UNLOCK) { UI.popup(t('pop.endlessLocked', { level: levelLabel(ENDLESS_UNLOCK) }), innerWidth / 2, innerHeight * 0.8, 'gold'); return; } save.seen.endless = true; persist(); startEndless(); });
on('recordsBtn', openRecords); on('nextUp', goNextUp); on('heroTag', () => openShop());
on('tryPlay', tryBought); on('tryLater', () => { sfx('click'); UI.tryNow(null); });
for (const b of document.querySelectorAll('.back')) b.addEventListener('click', () => { sfx('click'); toMenu(); });
for (const b of document.querySelectorAll('.musicT')) b.addEventListener('click', () => toggle('music'));
for (const b of document.querySelectorAll('.sfxT')) b.addEventListener('click', () => toggle('sfx'));
on('pauseBtn', () => { sfx('click'); pause(); });
on('resumeBtn', resume);
on('pRestart', () => { sfx('click'); if (G.endless) startEndless(); else startLevel(G.level); }); // 重來＝重開這一關／新的一局（過關或死亡的節拍中也可以）
on('pLevels', () => { cg.gameplayStop(); openLevels(); });
on('pMenu', () => { sfx('click'); toMenu(); });

// ---------- 主迴圈 ----------
const hudData: UI.HudData = { endless: false, dist: 0, level: 1, score: 0, flies: 0, fliesTotal: 0, time: 0, prog: 0, best: 0, combo: 0, comboLeft: 0, comboPulse: 0 };
const tipV: XY = { x: 0, y: 0 }, tmp: XY = { x: 0, y: 0 };
let mouth: XY = { x: 0, y: 0 };
const mood: Mood = { lookX: 0, lookY: 0, mouth: false, tongueWob: 0, tipPop: 1, scared: false };
let last = performance.now(), fpsTime = 0, fpsN = 0, tReal = 0;
const MENU_STATES = new Set<Phase>(['menu', 'levels', 'shop', 'records']);
const SIM_STATES = new Set<Phase>([...RUN, ...MENU_STATES]); // 模擬在跑的狀態（暫停不跑）

function frame(now: number): void {
  requestAnimationFrame(frame);
  const pT0 = PERF ? performance.now() : 0;
  if (document.hidden) { last = now; return; }
  const st = G.state;
  if (st === 'paused' && !view.dirty) { last = now; fpsTime = 0; fpsN = 0; return; } // 暫停：畫面沒變，不畫
  if (MENU_STATES.has(st) && now - last < MENU_FRAME_MS) return;
  const rawDt = Math.max(0, (now - last) / 1000); last = now;
  const realDt = Math.min(st === 'playing' ? 0.05 : 0.1, rawDt); tReal += realDt;
  // 效能監看：用沒夾過的真實幀時間算 fps，每秒交給畫質調整；開局 2 秒不算
  fpsTime += rawDt; fpsN++;
  if (fpsTime >= 1) {
    G.fps = Math.round(fpsN / fpsTime); fpsTime = 0; fpsN = 0;
    if (G.state === 'playing' && performance.now() - G.startedAt > 2000) { const nt = gov.tick(G.fps); if (nt) setTier(nt); }
  }
  // 慢動作與 hit-stop
  if (G.slowT > 0) G.slowT -= realDt;
  const tsTarget = G.slowT > 0 ? T.SLOWMO_SCALE : 1;
  G.timeScale += (tsTarget - G.timeScale) * Math.min(1, realDt * (tsTarget < G.timeScale ? 16 : 5));
  G.slowAmt = (1 - G.timeScale) / (1 - T.SLOWMO_SCALE);
  let dt = realDt * G.timeScale;
  if (G.hitStop > 0) { G.hitStop -= realDt; dt = 0; }
  if (G.freeze) dt = 0;
  const s = G.sim;
  if (s && SIM_STATES.has(G.state)) {
    G.acc += dt; let n = 0;
    const ap = hooks.autoplay && G.state === 'playing' ? autoBot(hooks.autoplay) : null;
    while (G.acc >= T.DT && n < 14) {
      G.prev.x = s.x; G.prev.y = s.y; G.prev.a = s.angle;
      const hold = ap ? ap(s) : G.state === 'playing' && (G.hold || G.latch);
      G.latch = false; // 鎖存的按下只撐一個物理步：之後看實際有沒有按著
      step(s, T.DT, hold); G.acc -= T.DT; n++;
      if (G.state === 'playing') for (const f of G.feats.tick(s, T.DT)) onFeat(f);
    }
    if (n >= 14) G.acc = 0;
    // 先把事件拿出來再分派：處理到一半丟例外也不會在下一幀重播同一批（例如重複扣命、重複過關）
    const evs = s.events; s.events = [];
    for (const e of evs) onEvent(e);
    if (RUN.has(G.state)) updateRun(realDt, dt);
  }
  if (G.sim) render(realDt, dt);
  if (PERF) perfTick(rawDt * 1000, performance.now() - pT0, st === 'playing');
}
function autoBot(p: [number, number]): Bot { const k = p.join(','); if (k !== G.botKey) { G.bot = makeBot(p[0], p[1]); G.botKey = k; } return G.bot!; }

// 一局之內每幀（遊玩、死亡／過關／無盡結束的節拍中）：連擊、節拍、金幣飛行、落荷葉後的彈跳、HUD、教學
function updateRun(realDt: number, dt: number): void {
  const s = G.sim!, lv = G.lv!, playing = G.state === 'playing';
  if (playing && G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) { if (G.combo >= 10) pop(t('pop.combo', { n: G.combo }), s.x, s.y + 3, 'gold'); G.combo = 0; } }
  G.comboPulse = Math.max(0, G.comboPulse - realDt * 5);
  tickBeat(realDt); if (G.sim !== s || !RUN.has(G.state)) return; // 節拍播完可能已經換關、回選單
  tickCoins(realDt);
  if (playing && G.endless) updateEndless();
  // 滑沙揚沙＋沙沙聲
  if (playing && s.onDune >= 0 && s.mode !== 'dead' && s.mode !== 'won') {
    G.slideT -= realDt; G.slideSfxT -= realDt;
    if (G.slideT <= 0) { G.slideT = 0.05; juice.slide(s, WORLDS[lv.world]); }
    if (G.slideSfxT <= 0) { G.slideSfxT = 0.2; sfx('slide'); }
  }
  // 落荷葉後：轉正、停下，在荷葉上彈跳（畫面只讀 G.winAnim；這是 render 之外唯一改模擬的地方）
  if (s.mode === 'won') { G.winAnim += realDt; let wa = -s.angle; wa -= Math.round(wa / (Math.PI * 2)) * Math.PI * 2; s.angle += wa * Math.min(1, realDt * 8); G.prev.a = s.angle; s.vx = 0; s.vy = 0; s.omega = 0; }
  UI.hudCoins(save.coins - G.coinsInFlight);
  Object.assign(hudData, { endless: G.endless, dist: G.endless ? endlessDist() : 0, level: G.level, score: G.endless ? endlessScore() : G.score, flies: s.fliesGot, fliesTotal: lv.flies.length, time: s.time, prog: Math.max(0, Math.min(1, s.x / lv.goal.x)), best: G.bestProg, combo: G.combo, comboLeft: Math.max(0, G.comboT / T.COMBO_WINDOW), comboPulse: G.comboPulse });
  UI.hud(hudData);
  if (!playing) { UI.tut(null); UI.hint(null); return; }
  // 手機：螢幕下方的手指教學 HOLD／LET GO!，前 8 次黏住內或第 1 關
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
      if (s.vx > 2 && s.vy > 0 && s.x > tg.ax + tg.L * 0.3) { const p = view.project(s.x, s.y + 2.2); UI.hint(t('hint.release'), p.x, p.y); } else UI.hint(null);
    } else if (s.target >= 0 && !G.hold && (s.mode === 'perch' || s.vy < 4)) {
      movePos(lv.hooks[s.target], s.t, tmp); const p = view.project(tmp.x, tmp.y - 2.2);
      UI.hint(t(s.mode === 'perch' ? 'hint.hold' : 'hint.holdNow'), p.x, p.y);
    } else UI.hint(null);
  } else UI.hint(null);
}

function render(realDt: number, dt: number): void {
  const s = G.sim!, tg = s.tongue, lv = G.lv!;
  // 畫面插值：在上一個與這一個物理狀態之間（alpha＝累積器剩下的比例）
  const alpha = Math.min(1, G.acc / T.DT);
  let da = s.angle - G.prev.a; da -= Math.round(da / (Math.PI * 2)) * Math.PI * 2;
  const ix = G.prev.x + (s.x - G.prev.x) * alpha, iy = G.prev.y + (s.y - G.prev.y) * alpha;
  let ia = G.prev.a + da * alpha;
  lvView.st.target = G.state === 'playing' && tg.state !== 'stuck' && s.mode !== 'dead' ? s.target : -1;
  lvView.st.attached = tg.state === 'stuck' ? tg.hook : -1;
  // 舌尖位置
  let tip: XY | null = null;
  if (s.mode !== 'dead') {
    if (tg.state === 'stuck') { tipV.x = tg.ax; tipV.y = tg.ay; tip = tipV; }
    else if (tg.state === 'shoot' || tg.state === 'retract' || tg.state === 'miss') { tipV.x = ix + tg.dx * tg.tip; tipV.y = iy + tg.dy * tg.tip; tip = tipV; }
    if (G.lick.t > 0) { G.lick.t -= realDt; tipV.x = G.lick.x; tipV.y = G.lick.y; tip = tipV; }
  }
  G.tongueWob *= Math.exp(-realDt * 5); G.tipPop += (1 - G.tipPop) * Math.min(1, realDt * 12);
  // 看向目標
  if (s.target >= 0) {
    movePos(lv.hooks[s.target], s.t, tmp);
    const dx = tmp.x - ix, dy = tmp.y - iy, d = Math.hypot(dx, dy) || 1, c = Math.cos(-ia), sn = Math.sin(-ia);
    mood.lookX = (dx * c - dy * sn) / d; mood.lookY = (dx * sn + dy * c) / d;
  }
  mood.mouth = tg.state !== 'idle' || G.lick.t > 0; mood.tongueWob = G.tongueWob; mood.tipPop = G.tipPop; mood.scared = s.y < 3 && s.vy < -5;
  // 落荷葉後在荷葉上彈跳（只讀：轉正與停下在 updateRun）
  let yOff = 0;
  if (s.mode === 'won') { ia = s.angle; yOff = Math.abs(Math.sin(G.winAnim * 7)) * 1.3 * Math.exp(-G.winAnim * 2.2); }
  frog.visible = s.mode !== 'dead' && G.state !== 'menu'; // 首頁：角色只在右邊的頭像出現，世界裡起點那隻不畫（兩隻同時在太怪）
  mouth = frog.update(s, ix, iy + yOff, ia, realDt, tReal, tip, mood);
  // 旋轉貓：在空中轉起來就循環唱 oiia，停下來（黏住、落地、死掉、離開遊戲畫面）就淡出——迷因的節奏；選單上點貓讓牠轉也會唱
  if ((frog.kind === 'cat' && G.state === 'playing' && frog.st.spinning) || catSinging()) A.oiiaStart(); else A.oiiaStop();
  lvView.update(s, tReal, realDt, mouth);
  const sp = Math.hypot(s.vx, s.vy);
  ambient(s, dt);
  fx.update(dt, realDt, s, ix, iy, sp, G.state === 'playing' && s.mode !== 'dead');
  UI.tickFlash(realDt);
  // 鏡頭：平滑跟隨 + 速度前瞻 + 隨速度拉遠 + FOV 衝擊 + 慢動作推近
  const c = G.cam, aspect = innerWidth / innerHeight;
  let tx: number, ty: number, td: number, follow = false;
  if (MENU_STATES.has(G.state)) { tx = ix - aspect * (G.state === 'shop' ? 2.9 : 3.3); ty = 5.4; td = G.state === 'shop' ? 10 : 12; menuIdle(realDt); }
  else {
    follow = true;
    const lx = Math.max(-6, Math.min(9, s.vx * T.CAM_LOOKAHEAD)), ly = Math.max(-4, Math.min(4, s.vy * T.CAM_LOOKAHEAD * 0.6));
    tx = ix + 3 + lx; ty = Math.max(lv.world === 5 ? T.CAM_MIN_Y_DUNE : T.CAM_MIN_Y, iy + ly + 1.2);
    // 手機橫向（矮螢幕）拉近一點；直式（窄螢幕）拉遠，前方的鉤點才看得到
    td = (Math.min(T.CAM_DIST_MAX, T.CAM_DIST + Math.max(0, sp - 9) * T.CAM_DIST_SPEED) - G.slowAmt * 4) * (innerHeight < 500 ? 0.82 : aspect < 0.8 ? 1.5 : 1);
    if (s.mode === 'won') { tx = ix + 1; ty = Math.max(5, iy + 2.5); td = 17; }
  }
  const k = 1 - Math.exp(-realDt * 4.5);
  c.x += (tx - c.x) * k; c.y += (ty - c.y) * k; c.d += (td - c.d) * (1 - Math.exp(-realDt * 2.2));
  G.fovKick *= Math.exp(-realDt * 3.5);
  const fov = T.CAM_FOV + G.fovKick - G.slowAmt * 7;
  // 平滑跟隨在高速時會落後好幾單位：青蛙中心離畫面中心最多 60% 半寬
  if (follow) { const hw = c.d * Math.tan((fov * Math.PI) / 360) * aspect * 0.6; c.x = Math.max(ix - hw, Math.min(ix + hw, c.x)); }
  const vc = view.cam;
  vc.x = c.x; vc.y = c.y; vc.d = c.d; vc.fov = fov; vc.shakeX = fx.shake.x; vc.shakeY = fx.shake.y;
  if (G.camOv) { vc.x = G.camOv.p[0]; vc.y = G.camOv.p[1]; vc.d = G.camOv.p[2]; }
  view.frame(tReal, A.beatPos());
  view.render();
}

// 換畫質級別：像素比上限、背景細節、粒子上限
function setTier(name: TierName): void {
  const cur = TIERS[name]; if (!cur) return;
  G.quality = name; view.setQuality(cur.dpr, cur.detail); fx.setCap(cur.fx);
  fpsTime = 0; fpsN = 0;
}

// 環境粒子：風扇的上升氣流、火山噴口的蒸汽、蒼蠅的嗡嗡點點（只在鏡頭附近生）
const PUFF = ['#ffe3d2', '#ffcfb4', '#ffd9a8'];
function ambient(s: Sim, dt: number): void {
  if (dt <= 0) return;
  const lv = G.lv!, cx = G.cam.x;
  if (lvView.isGeyser()) {
    for (const f of lv.fans) {
      if (Math.abs(f.x - cx) > 26) continue;
      const on = !!f.burst && burstOn(f.burst, s.t), warn = !!f.burst && burstWarn(f.burst, s.t);
      const n = Math.floor(dt * (on ? 50 : warn ? 22 : 3.5) + Math.random());
      for (let k = 0; k < n; k++) {
        const big = on ? 1 : warn ? 0.55 : 0.4;
        fx.spawn(f.x + (Math.random() - 0.5) * f.w * (on ? 0.7 : 0.4), f.y0 + 0.7, 0, (Math.random() - 0.5) * (on ? 2.5 : 1.2),
          on ? 15 + Math.random() * 9 : warn ? 4 + Math.random() * 3 : 2.5 + Math.random() * 2, 0, on ? 0.7 + Math.random() * 0.3 : 1.1, (0.75 + Math.random() * 0.6) * big, 0, 0.6, SH.STEAM, PUFF[k % 3]);
      }
    }
  } else for (const f of lv.fans) if (Math.abs(f.x - cx) < 24 && Math.random() < dt * 14) fx.spawn(f.x + (Math.random() - 0.5) * f.w, f.y0 + 0.5, 0, 0, 10 + Math.random() * 6, 0, (f.y1 - f.y0) / 14, 0.2, 0, 0, SH.BUBBLE, '#ffffff');
  for (let i = 0; i < lv.flies.length; i++) {
    if (s.flies[i] || Math.abs(lv.flies[i].x - cx) > 22 || Math.random() > dt * 5) continue;
    flyPos(lv.flies[i], s.t, tmp);
    fx.spawn(tmp.x + (Math.random() - 0.5) * 0.8, tmp.y + (Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0, 0.5, 0.09, 0, 1, SH.CANDY, '#fffbe0');
  }
}
// 選單裡的青蛙偶爾舔一下空氣（世界是活的）
let menuLickT = 2;
function menuIdle(dt: number): void {
  menuLickT -= dt;
  if (menuLickT < 0) { menuLickT = 2.5 + Math.random() * 2.5; G.lick.x = G.sim!.x + 1.6 + Math.random() * 1.5; G.lick.y = G.sim!.y + 1.2 + Math.random() * 1.5; G.lick.t = 0.16; G.tongueWob = 0.4; frog.jiggle(3); }
}

// ---------- 開機 ----------
// 順序：loadingStart → 建渲染器與圖集（同時等 SDK）→ 讀存檔 → loadingStop。沒有任何素材要下載。
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const onCG = /(^|\.)crazygames\.(com|ru)$/.test(location.hostname) || /crazygames/.test(document.referrer + (location.ancestorOrigins?.[0] ?? ''));
const setBoot = (p: number) => window.__bootP?.(p);
const WEB_SDK_MS = 1200; // 不在 CrazyGames 網域時 SDK 常常永遠不回：最多等這麼久，之後 SDK 晚到也會自動補 init
const envVars: Record<string, string | undefined> = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
async function startSdk(): Promise<void> {
  if (envVars.VITE_WEB) return; // 網頁版建置：完全不碰 SDK
  await Promise.race([window.__cgSdk, sleep(onCG ? 4000 : WEB_SDK_MS)]);
  const init = cg.init();
  await (onCG ? init : Promise.race([init, sleep(WEB_SDK_MS)]));
}
function readSave(from: 'local' | 'cloud'): Save { let raw: unknown = null; try { raw = JSON.parse(cg.getItem(SAVE_KEY, from) || 'null'); } catch { raw = null; } return normalizeSave(raw, LEVEL_COUNT); }
// 選單第一幀就要的圖集：存檔目前的世界、身上的造型（貓是照片，另外載）
const bootAtlases = (s: Save) => { const k = SKINS.find((x) => x.id === s.skin) ?? SKINS[1]; return { world: worldOf(Math.min(s.last, s.unlocked, LEVEL_COUNT)), skin: k.kind === 'cat' ? null : k.kind === 'ape' ? 'ape' : k.id }; };
async function boot(): Promise<void> {
  performance.mark('boot-start');
  cg.loadingStart();
  setBoot(0.1);
  const pick = pickTier(); gov = createGovernor(pick);
  // SDK 不擋開機：選單用本機存檔先出來，SDK 就緒（可能在選單之後、甚至開局之後）再跟雲端合併（下面的 cg.onReady）
  void startSdk();
  // 先照本機存檔開始下載＋解碼要的圖集，跟建 WebGL 同時進行
  save = readSave('local');
  const guess = bootAtlases(save); prefetch(`w${guess.world}`); if (guess.skin) prefetch(`c_${guess.skin}`);
  view = await createView(canvas, TIERS[pick.tier].dpr);
  setBoot(0.6);
  void view.ensureWorld(0); // 大部分玩家從第一個世界開始：跟 SDK 同時下載
  lvView = createLevelView(view); fx = createFx(view); frog = createCharacter(view);
  // 遊戲平面的圖層順序：關卡物件 → 拖尾 → 角色＋舌頭 → 翻轉圈前半 → 粒子
  view.layer(lvView.drawBack); view.layer(fx.drawTrail); view.layer(frog.draw); view.layer(lvView.drawFront); view.layer(fx.draw);
  setPortraitSource({ now: view.skinBitmapNow, load: view.skinBitmap }, () => { if (G.state === 'shop') renderShop(); else if (G.state === 'menu') UI.setHero(skinOf()); });
  setBoot(0.9);
  const need = bootAtlases(save);
  await Promise.all([view.ensureWorld(need.world), need.skin ? view.ensureSkin(need.skin) : view.ensureCat()]);
  dropPrefetch();
  // SDK 就緒：雲端存檔跟目前的合併（成就取並集、狀態聽較新的，永遠不丟進度），合併結果寫回兩邊；沒開局的話選單重畫
  cg.onReady(() => {
    save = mergeSave(save, readSave('cloud'), LEVEL_COUNT); persist();
    if (G.startedAt === 0 && (G.state === 'menu' || G.state === 'boot')) { applyLook(); applyTheme(); UI.hudCoins(save.coins); if (G.state === 'menu') toMenu(); }
  });
  // 介面語言：?lang= > 玩家自己選的 > CrazyGames locale > 瀏覽器 > English；?lang=xx 是版面測試用的加長假語言
  if (urlLang() === 'xx') enablePseudo();
  const lang = detect({ url: urlLang(), saved: save.lang, sdk: sdkInfo(), nav: navLangs() });
  const tLang = performance.now();
  await loadLang(lang); // 語系是各自的小檔：開機只下載偵測到的那一個，第一幀就是對的語言
  measure('boot:lang', tLang); const tMenu = performance.now();
  setLang(lang);
  mountPicker((code) => { save.lang = code; persist(); });
  onLang(() => { if (G.state === 'menu') toMenu(); else if (G.state === 'paused') pauseMeta(); });
  G.touch = matchMedia?.('(pointer: coarse)').matches ?? false;
  setTier(gov.tier);
  applyLook(); applyTheme(); UI.hudCoins(save.coins);
  A.setMusic(save.music); A.setSfx(save.sfx); UI.setToggles(save);
  cg.onMute((m) => A.setMuted(m));
  TM.bind(() => ((RUN.has(G.state) || G.state === 'paused') && !G.endless && G.sim && G.lv ? { level: G.level, x: G.sim.maxX, prog: Math.min(1, G.sim.maxX / G.lv.goal.x) } : null));
  dispatch('ready'); toMenu();
  measure('boot:ui', tMenu); const tRender = performance.now();
  // 先在載入畫面底下畫一幀：天空、水面、合批、粒子的著色器都在第一次渲染時編譯，別讓玩家看到的第一幀去付這筆
  if (G.sim) render(0, 0);
  measure('boot:firstRender', tRender); const tFence = performance.now();
  // 等 GPU 真的把第一幀做完再收載入畫面：第一次用的著色器與貼圖在 GPU 那邊可能要編譯、上傳幾百毫秒（期間 rAF 幾乎不來），
  // 畫完就收的話玩家看到的是一個凍住的選單。用 fence 輪詢（不阻塞主執行緒，載入條照樣動），最多等 3 秒
  await new Promise<void>((r) => {
    const gl = view.R.gl, sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
    const t0 = performance.now();
    const tick = () => {
      const s = sync ? gl.clientWaitSync(sync, 0, 0) : gl.CONDITION_SATISFIED;
      if (s !== gl.TIMEOUT_EXPIRED || performance.now() - t0 > 3000) { if (sync) gl.deleteSync(sync); r(); } else setTimeout(tick, 16);
    };
    tick();
  });
  measure('boot:fence', tFence);
  setBoot(1);
  // 載入時間的量測點（選單第一幀畫完、從導覽開始算）：開發者工具效能面板看得到，或 performance.getEntriesByName('menu-ready')
  performance.mark('menu-ready');
  // 選單出來之後再載手感回饋：閒置時、最晚 800 ms；玩家按 PLAY 前幾乎一定載完（startLevel 也會確保）
  if (window.requestIdleCallback) window.requestIdleCallback(() => void ensureJuice(), { timeout: 800 }); else setTimeout(() => void ensureJuice(), 50);
  TM.menuReady(performance.now(),{ lang: document.documentElement.lang, vw: innerWidth, vh: innerHeight, q: G.quality }); TM.notice(save.privSeen, () => { save.privSeen = true; persist(); });
  const ld = document.getElementById('boot'); ld?.classList.add('done'); setTimeout(() => ld?.classList.add('out'), 120); setTimeout(() => ld?.remove(), 600);
  cg.loadingStop();
  requestAnimationFrame((tm) => { last = tm; frame(tm); });
}
boot().catch((e) => { console.error('[boot]', e); window.__bootFail?.(); });
