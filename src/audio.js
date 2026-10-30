// WebAudio 程序合成：多層音效（音高隨機 ±7%）＋短循環音樂（大時刻壓低 ducking）。
let ctx = null, master, sfx, music, duck, noiseBuf;
let musicOn = true, sfxOn = true, muted = false, step16 = 0, nextT = 0, worldI = 0;
const VOL = 0.8;

const rnd = (a = 0.07) => 1 + (Math.random() * 2 - 1) * a;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : VOL; master.connect(ctx.destination);
  sfx = ctx.createGain(); sfx.gain.value = sfxOn ? 1 : 0; sfx.connect(master);
  duck = ctx.createGain(); duck.gain.value = 1; duck.connect(master);
  music = ctx.createGain(); music.gain.value = musicOn ? 0.32 : 0; music.connect(duck);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startMusic();
}
// iOS：在使用者手勢裡 resume
for (const ev of ['touchend', 'click', 'keydown', 'pointerdown']) addEventListener(ev, () => { if (ctx && ctx.state !== 'running') ctx.resume(); }, { capture: true });

export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : VOL, ctx.currentTime, 0.02); }
export function setMusic(on) { musicOn = on; if (music) music.gain.setTargetAtTime(on ? 0.32 : 0, ctx.currentTime, 0.05); }
export function setSfx(on) { sfxOn = on; if (sfx) sfx.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.02); }
export function setWorld(i) { worldI = i; }
export function duckMusic(amount = 0.25, hold = 0.6) {
  if (!ctx) return;
  const t = ctx.currentTime; duck.gain.cancelScheduledValues(t);
  duck.gain.setTargetAtTime(amount, t, 0.03); duck.gain.setTargetAtTime(1, t + hold, 0.25);
}

function tone(type, f0, f1, dur, vol, when = 0, dest = sfx) {
  const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, f0, f1, vol, q = 1, type = 'bandpass', when = 0, dest = sfx) {
  const t = ctx.currentTime + when, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.playbackRate.value = rnd(0.1);
  f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const note = (base, i) => base * Math.pow(2, PENTA[Math.min(PENTA.length - 1, i)] / 12);

export function play(name, o = {}) {
  if (!ctx || !sfxOn || muted) return;
  const p = rnd();
  switch (name) {
    case 'shoot': noise(0.09, 1800 * p, 5000, 0.25, 2); tone('square', 300 * p, 900 * p, 0.08, 0.06); break;
    case 'attach': { const c = Math.pow(2, Math.min(o.combo ?? 0, 12) / 24); tone('sine', 520 * p * c, 180 * p * c, 0.14, 0.4); noise(0.04, 3000, 1500, 0.2, 3); tone('triangle', 1040 * p * c, 700 * c, 0.07, 0.12, 0.01); break; }
    case 'release': noise(0.25, 600 * p, 2400, 0.22, 0.8); tone('sine', 300 * p, 520 * p, 0.12, 0.12); break;
    case 'miss': tone('sine', 400 * p, 250, 0.1, 0.15); break;
    case 'jump': tone('square', 220 * p, 520 * p, 0.12, 0.08); noise(0.08, 900, 400, 0.15, 1); break;
    case 'flip': { const n = o.n ?? 1, c = o.combo ?? 0; const b = 523 * Math.pow(2, Math.min(c, 14) / 24);
      for (let i = 0; i < Math.min(4, n + 1); i++) tone('triangle', note(b, i * 2) * p, note(b, i * 2) * p, 0.18, 0.18, i * 0.05); break; }
    case 'fly': tone('square', 900 * p, 1400 * p, 0.05, 0.08); tone('sine', 300 * p, 120, 0.12, 0.3, 0.03); tone('triangle', 1760 * p, 1760, 0.1, 0.07, 0.07); break;
    case 'ring': for (let i = 0; i < 3; i++) tone('sine', note(880, i * 2), note(880, i * 2), 0.25, 0.16, i * 0.06); noise(0.3, 4000, 8000, 0.08, 1, 'highpass'); break;
    case 'bounce': tone('sine', 160 * p, 520 * p, 0.22, 0.45); tone('sine', 166 * p, 540 * p, 0.22, 0.2); noise(0.06, 500, 200, 0.2, 1); break;
    case 'fan': noise(0.5, 400, 1400, 0.12, 0.6); break;
    case 'wall': tone('sine', 140, 90, 0.15, 0.3); noise(0.1, 700, 300, 0.2, 1); break;
    case 'splash': noise(0.5, 2500, 300, 0.5, 0.7, 'lowpass'); tone('sine', 220, 60, 0.3, 0.4); noise(0.3, 6000, 2000, 0.15, 1, 'highpass', 0.05); break;
    case 'spike': noise(0.18, 3000, 600, 0.5, 1.5); tone('sawtooth', 300, 70, 0.25, 0.25); tone('square', 90, 40, 0.3, 0.2); break;
    case 'win': [0, 4, 7, 12, 16].forEach((s, i) => tone('triangle', 523 * Math.pow(2, s / 12), 523 * Math.pow(2, s / 12), 0.3, 0.2, i * 0.09)); tone('sine', 1046, 1046, 0.6, 0.15, 0.45); break;
    case 'star': { const i = o.i ?? 0; tone('sine', 120, 50, 0.25, 0.5); noise(0.12, 1200, 300, 0.3, 1); tone('triangle', note(784, i * 2), note(784, i * 2), 0.35, 0.22, 0.02); break; }
    case 'coin': tone('square', 1320 * p, 1320 * p, 0.05, 0.05); tone('square', 1760 * p, 1760 * p, 0.08, 0.05, 0.04); break;
    case 'tick': tone('sine', 880 * p, 660, 0.05, 0.12); break;
    case 'click': tone('triangle', 660 * p, 990 * p, 0.07, 0.16); break;
    case 'buy': [0, 7, 12].forEach((s, i) => tone('triangle', 660 * Math.pow(2, s / 12), 660 * Math.pow(2, s / 12), 0.2, 0.16, i * 0.06)); break;
    case 'whoosh': noise(0.6, 300, 3000, 0.25, 0.7); break;
    case 'slide': noise(0.17, 2400 * p, 1200, 0.06, 0.9); break; // 滑沙：沙沙聲（既有的噪音＋帶通，音量小）
    // 第二輪（軟膠公仔特效的聲音層）
    case 'sparkle': { const n = Math.min(7, o.n ?? 1); for (let i = 0; i < n + 1; i++) tone('triangle', note(1568, (i * 3) % 10) * p, note(1568, (i * 3) % 10) * p, 0.12, 0.05 + n * 0.006, i * 0.035); break; } // 閃星：高音琶音，圈數越多越長
    case 'fanfare': { const big = (o.n ?? 1) >= 2; // 號角：大三和弦往上爬＋長音，7 圈版多一層低音與鈸
      [0, 4, 7, 12, 16, 19, 24].slice(0, big ? 7 : 5).forEach((st, i) => { tone('sawtooth', 392 * Math.pow(2, st / 12), 392 * Math.pow(2, st / 12), 0.22, 0.05, i * 0.07); tone('triangle', 392 * Math.pow(2, st / 12), 392 * Math.pow(2, st / 12), 0.3, 0.12, i * 0.07); });
      tone('triangle', 1568, 1568, big ? 1.1 : 0.6, 0.12, big ? 0.5 : 0.36);
      if (big) { tone('sine', 98, 49, 0.9, 0.4, 0.02); noise(1.2, 9000, 4000, 0.12, 0.6, 'highpass', 0.05); }
      break; }
    case 'gulp': tone('sine', 520 * p, 160, 0.09, 0.3); tone('sine', 300 * p, 700 * p, 0.06, 0.12, 0.07); break; // 吞蒼蠅：啵咕
    case 'jelly': { const t = ctx.currentTime, o2 = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(); // 果凍晃：帶顫音的低音彈簧
      o2.type = 'sine'; o2.frequency.setValueAtTime(140 * p, t); o2.frequency.exponentialRampToValueAtTime(320 * p, t + 0.35);
      lfo.frequency.value = 18; lg.gain.setValueAtTime(40, t); lg.gain.exponentialRampToValueAtTime(1, t + 0.35); lfo.connect(lg); lg.connect(o2.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      o2.connect(g); g.connect(sfx); o2.start(t); lfo.start(t); o2.stop(t + 0.4); lfo.stop(t + 0.4); break; }
    // 第二輪 UI 接點（ui.js 呼叫）：音量小、短，音色沿用 click / tick 的 sine+triangle
    case 'ui_press': tone('sine', 420 * p, 300 * p, 0.06, 0.14); break; // 按下：軟膠被壓
    case 'ui_pop': tone('triangle', 520 * p, 880 * p, 0.08, 0.14); noise(0.03, 2500, 1500, 0.06, 2); break; // 放開：彈回
    case 'ui_nope': tone('sine', 230 * p, 170, 0.1, 0.2); tone('sine', 200 * p, 140, 0.1, 0.16, 0.08); break; // 鎖住／不能按：兩下悶聲
    case 'panel_in': noise(0.22, 500, 1800, 0.12, 0.7); tone('sine', 330 * p, 560 * p, 0.14, 0.1); break; // 面板滑入
    case 'tab': tone('triangle', 740 * p, 740 * p, 0.05, 0.12); tone('sine', 1110 * p, 1110 * p, 0.04, 0.06, 0.03); break; // 分頁切換
    case 'coin_tick': tone('square', (1500 + Math.random() * 300), 1500, 0.025, 0.035); break; // 金幣數字跳動
    case 'coin_land': { const i = Math.min(o.n ?? 0, 8); tone('square', 1320 * Math.pow(2, i / 12), 1320 * Math.pow(2, i / 12), 0.05, 0.06); tone('square', 1760 * Math.pow(2, i / 12), 1760 * Math.pow(2, i / 12), 0.08, 0.05, 0.04); break; } // 飛幣落進錢包，逐顆升半音
    case 'feat': [0, 4, 7, 12].forEach((st, i) => tone('triangle', 660 * Math.pow(2, st / 12), 660 * Math.pow(2, st / 12), 0.16, 0.14, i * 0.05)); noise(0.2, 5000, 9000, 0.06, 1, 'highpass', 0.1); break; // 成就橫幅
    case 'next_up': tone('sine', 440 * p, 660 * p, 0.1, 0.16); tone('triangle', 880 * p, 1320 * p, 0.12, 0.1, 0.07); break; // 「下一關」按鈕浮出
    case 'pop': for (let i = 0; i < 4; i++) tone('sine', (500 + i * 220) * p, (900 + i * 300) * p, 0.06, 0.12, i * 0.06); break; // 泡泡啵啵（換關出場）
  }
}

// 音樂：16 步、每世界不同根音與速度
const WORLD_MUSIC = [
  { root: 196, bpm: 112, prog: [0, 5, 3, 4] }, { root: 220, bpm: 120, prog: [0, 3, 5, 4] },
  { root: 174.6, bpm: 124, prog: [0, 0, 3, 4] }, { root: 164.8, bpm: 128, prog: [0, 3, 1, 4] },
  // 冰峰：慢（84 bpm）、D 小調（自然小調音階）、鈴音（正弦＋非整數倍泛音）當旋律、細碎的雪沙取代 hi-hat，和弦墊用三角波長音；沒有 bandpass 的軍鼓
  { root: 293.7, bpm: 84, prog: [0, 5, 2, 6], scale: [0, 2, 3, 5, 7, 8, 10], bell: true, mel: [0, 3, 7, 3, 10, 7, 3, 7, 0, 7, 10, 12, 10, 7, 3, 0] },
  // 夕陽沙丘：100 bpm、降 B（233.1 Hz）弗里吉安屬音階（0 1 4 5 7 8 10，沙漠味的小二度＋大三度）；撥弦（三角波＋八度正弦）當旋律、鼓點是低咚＋清脆敲擊（咚 咚 敲 的搖擺節奏）、鼓邊沙沙聲，持續低音；沒有 hi-hat、沒有軍鼓
  { root: 233.1, bpm: 100, prog: [0, 0, 3, 4], scale: [0, 1, 4, 5, 7, 8, 10], desert: true, mel: [0, 4, -1, 5, 4, 1, -1, 0, 7, -1, 8, 7, 5, 4, 1, 0] },
];
const SCALE = [0, 2, 4, 5, 7, 9, 11];
// 現在的拍位（四分音符為單位的小數）。音樂排程超前播放，所以扣掉還沒到的部分；音樂沒起來就用牆鐘照該世界的 bpm 推（視覺照樣有節奏）
export function beatPos() {
  const bpm = WORLD_MUSIC[worldI].bpm;
  if (ctx && ctx.state === 'running') return (step16 - (nextT - ctx.currentTime) / (60 / bpm / 4)) / 4;
  return (performance.now() / 1000) * bpm / 60;
}
function startMusic() {
  nextT = ctx.currentTime + 0.1;
  setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    const m = WORLD_MUSIC[worldI], sp = 60 / m.bpm / 4;
    while (nextT < ctx.currentTime + 0.15) {
      const bar = Math.floor(step16 / 16) % 4, s = step16 % 16, deg = m.prog[bar];
      const when = nextT - ctx.currentTime;
      const chord = (k) => m.root * Math.pow(2, ((m.scale ?? SCALE)[(deg + k) % 7] + 12 * Math.floor((deg + k) / 7)) / 12);
      if (m.bell) {
        if (s % 8 === 0) { tone('sine', chord(0) / 2, chord(0) / 2, sp * 7, 0.34, when, music); tone('sine', 70, 38, 0.16, 0.2, when, music); }
        if (s % 4 === 2) noise(0.05, 9500, 8500, 0.035, 1, 'highpass', when, music);
        if (s % 8 === 6) noise(0.2, 6000, 3000, 0.03, 2, 'bandpass', when, music);
        if ((s * 5 + bar) % 3 !== 1) { const f = chord(0) * 4 * Math.pow(2, m.mel[(s + bar * 5) % 16] / 12); tone('sine', f, f, sp * 3.2, 0.075, when, music); tone('sine', f * 2.76, f * 2.76, sp * 1.1, 0.022, when, music); }
        if (s === 0) [0, 2, 4].forEach((k) => tone('triangle', chord(k), chord(k), sp * 15, 0.045, when, music));
        nextT += sp; step16++; continue;
      }
      if (m.desert) {
        if (s === 0 || s === 6 || s === 10) { tone('sine', s === 0 ? 118 : 96, 52, 0.2, 0.34, when, music); }
        if (s === 4 || s === 12 || s === 15) noise(0.05, 4200, 2600, 0.07, 3, 'bandpass', when, music);
        if (s % 4 === 2) noise(0.06, 7800, 6800, 0.025, 1, 'highpass', when, music);
        const md = m.mel[(s + bar * 5) % 16];
        if (md >= 0 && (s % 2 === 0 || (s + bar) % 3 === 0)) { const f = chord(0) * 2 * Math.pow(2, md / 12); tone('triangle', f, f * 0.996, sp * 2.6, 0.1, when, music); tone('sine', f * 2, f * 2, sp * 1.1, 0.03, when, music); }
        if (s === 0) { tone('triangle', chord(0) / 2, chord(0) / 2, sp * 14, 0.11, when, music); tone('triangle', chord(0), chord(0), sp * 14, 0.05, when, music); }
        if (s === 8) tone('sine', chord(4), chord(4), sp * 5, 0.045, when, music);
        nextT += sp; step16++; continue;
      }
      if (s % 4 === 0) tone('triangle', chord(0) / 2, chord(0) / 2, sp * 3.5, 0.3, when, music);
      if (s % 8 === 4) noise(0.08, 1800, 900, 0.12, 1, 'bandpass', when, music);
      if (s % 2 === 1) noise(0.03, 8000, 7000, 0.05, 1, 'highpass', when, music);
      const mel = [0, 2, 4, 2, 7, 4, 2, 4, 0, 4, 7, 9, 7, 4, 2, 0][(s + bar * 3) % 16];
      if ((s * 7 + bar) % 3 !== 2) tone('sine', chord(0) * 2 * Math.pow(2, mel / 12), chord(0) * 2 * Math.pow(2, mel / 12), sp * 1.6, 0.09, when, music);
      if (s === 0 || s === 8) [0, 2, 4].forEach((k) => tone('sine', chord(k), chord(k), sp * 7, 0.035, when, music));
      nextT += sp; step16++;
    }
  }, 30);
}
