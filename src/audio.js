// WebAudio 程序合成：多層音效（音高隨機 ±7%）＋短循環音樂（大時刻壓低 ducking）。
let ctx = null, master, sfx, music, duck, noiseBuf;
let musicOn = true, sfxOn = true, muted = false, musicTimer = null, step16 = 0, nextT = 0, worldI = 0;
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
  }
}

// 音樂：16 步、每世界不同根音與速度
const WORLD_MUSIC = [
  { root: 196, bpm: 112, prog: [0, 5, 3, 4] }, { root: 220, bpm: 120, prog: [0, 3, 5, 4] },
  { root: 174.6, bpm: 124, prog: [0, 0, 3, 4] }, { root: 164.8, bpm: 128, prog: [0, 3, 1, 4] },
];
const SCALE = [0, 2, 4, 5, 7, 9, 11];
function startMusic() {
  nextT = ctx.currentTime + 0.1;
  musicTimer = setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    const m = WORLD_MUSIC[worldI], sp = 60 / m.bpm / 4;
    while (nextT < ctx.currentTime + 0.15) {
      const bar = Math.floor(step16 / 16) % 4, s = step16 % 16, deg = m.prog[bar];
      const when = nextT - ctx.currentTime;
      const chord = (k) => m.root * Math.pow(2, (SCALE[(deg + k) % 7] + 12 * Math.floor((deg + k) / 7)) / 12);
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
