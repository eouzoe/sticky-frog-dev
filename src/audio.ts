// 音效門面：真正的合成器（audio-engine.ts，約 14 KB）要等第一次使用者手勢才用得到，開機不載。
// 設定先記在這裡，引擎載好再套上去；載入期間的 play() 先排隊（最多留 300 ms），第一聲點擊不會掉。
// 對外介面跟引擎一樣（main.ts／ui.ts／juice.ts 都 import * as A）。
import type { PlayOpts } from './audio-engine.ts';
export type { PlayOpts };
type Engine = typeof import('./audio-engine.ts');

let E: Engine | null = null, loading: Promise<Engine> | null = null;
const S = { muted: false, music: true, sfx: true, world: 0, paused: false, oiia: false };
const queue: [string, PlayOpts, number][] = [];

function load(): Promise<Engine> {
  return (loading ??= import('./audio-engine.ts').then((m) => {
    m.setMuted(S.muted); m.setMusic(S.music); m.setSfx(S.sfx); m.setWorld(S.world); m.setPaused(S.paused);
    if (S.oiia) m.wantOiia();
    m.initAudio(); // 第一次手勢已經發生過（有 sticky activation），之後建 AudioContext 也算在手勢內
    E = m;
    const now = performance.now();
    for (const [n, o, t] of queue) if (now - t < 300) m.play(n, o);
    queue.length = 0;
    return m;
  }));
}
/** 第一次使用者手勢時呼叫（pointerdown／touchstart）：載引擎、建 AudioContext */
export function initAudio(): void { if (E) E.initAudio(); else void load(); }
export function play(name: string, o: PlayOpts = {}): void { if (E) E.play(name, o); else if (loading) queue.push([name, o, performance.now()]); }
export function setMuted(m: boolean): void { S.muted = m; E?.setMuted(m); }
export function setMusic(on: boolean): void { S.music = on; E?.setMusic(on); }
export function setSfx(on: boolean): void { S.sfx = on; E?.setSfx(on); }
export function setWorld(i: number): void { S.world = i; E?.setWorld(i); }
export function setPaused(p: boolean): void { S.paused = p; E?.setPaused(p); }
export function duckMusic(amount?: number, hold?: number): void { E?.duckMusic(amount, hold); }
export function wantOiia(): void { S.oiia = true; E?.wantOiia(); }
export function oiiaStart(): void { E?.oiiaStart(); }
export function oiiaStop(): void { E?.oiiaStop(); }
/** 現在的拍位（音樂還沒起來就用牆鐘推，跟引擎沒 AudioContext 時一樣） */
export function beatPos(): number { return E ? E.beatPos() : (performance.now() / 1000) * 110 / 60; }
