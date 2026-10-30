// 遊戲邏輯層共用的型別：關卡資料、物理狀態、物理事件。邏輯層（sim、level、feats、save、bot）只依賴這裡，不碰畫面。

export interface XY { x: number; y: number }

// ---------- 關卡 ----------
export interface Move { ax: number; ay: number; f: number; ph: number }
export interface Hook { x: number; y: number; move?: Move }
export interface Mush { x: number; y: number; r: number }
export interface Spike { x: number; y: number; r: number; pole?: boolean; hang?: boolean }
export interface Saw { x: number; y: number; r: number; move: Move }
/** 蒸汽噴泉（火山世界的風扇）：P 週期、ph 相位、dur 噴發長度 */
export interface Burst { P: number; ph: number; dur: number }
export interface Fan { x: number; y0: number; y1: number; w: number; burst?: Burst }
/** trail＝沙丘軌跡上的金圈（片區編號），k＝軌跡上的順序 */
export interface Ring { x: number; y: number; trail?: number; k?: number }
export interface Fly { x: number; y: number; ph: number }
export interface Pad { x: number; y: number; w: number }
export interface Boost { x: number; y: number; dx: number; dy: number; off?: boolean; checked?: boolean }
/** f＝片區編號；first＝片區左緣（有緩坡）；lip＝尾端上翹坡頂；off＝出口淨空不成立、整片當作沒有 */
export interface Dune { x0: number; x1: number; H: number; f: number; first?: boolean; lip?: boolean; off?: boolean; checked?: boolean }
export interface Goal { x: number; y: number; w: number; wall: number }

/** 段落產生器的游標（關卡與無盡模式共用） */
export interface GenCursor {
  r: () => number;
  x: number; y: number; prevType: string;
  force?: string | null; calm?: number; end?: number;
}

export interface Level {
  n: number; world: number; diff: number;
  start: XY;
  hooks: Hook[]; mush: Mush[]; spikes: Spike[]; saws: Saw[]; fans: Fan[]; rings: Ring[]; flies: Fly[]; pads: Pad[]; boosts: Boost[]; dunes: Dune[];
  goal: Goal; length: number; par: number;
  // 無盡模式
  endless?: boolean; seed?: number; cap?: number; gen?: GenCursor;
}

// ---------- 物理狀態 ----------
export type TongueState = 'idle' | 'shoot' | 'stuck' | 'retract' | 'miss';
export interface Tongue {
  state: TongueState; hook: number;
  tip: number; rest: number; dx: number; dy: number; tx: number; ty: number;
  L: number; ax: number; ay: number;
}
export type SimMode = 'perch' | 'air' | 'swing' | 'dead' | 'won';
export type DeathCause = 'spike' | 'saw' | 'water';

export type SimEvent =
  | { type: 'crouch' }
  | { type: 'jump' }
  | { type: 'miss' }
  | { type: 'shoot'; hook: number }
  | { type: 'release'; speed: number; hook: number }
  | { type: 'attach'; hook: number; x: number; y: number; speed: number; flips: number; fy: number; fvy: number }
  | { type: 'die'; cause: DeathCause; x: number; y: number; vx: number; vy: number }
  | { type: 'fan'; i: number }
  | { type: 'flip'; n: number; x: number; y: number }
  | { type: 'bounce'; i: number; speed: number; x: number; y: number }
  | { type: 'launch'; i: number; x: number; y: number; vx: number; vy: number; back?: boolean }
  | { type: 'dune'; i: number; x: number; y: number; speed: number; vx: number }
  | { type: 'close'; x: number; y: number; gap: number }
  | { type: 'ring'; i: number; x: number; y: number; speed: number; flips: number }
  | { type: 'fly'; i: number; x: number; y: number }
  | { type: 'boost'; i: number; x: number; y: number; dx: number; dy: number; speed: number }
  | { type: 'pad'; i: number; x: number; y: number; speed: number }
  | { type: 'wall'; x: number; y: number }
  | { type: 'win'; x: number; y: number; vx: number; vy: number };
export type SimEventType = SimEvent['type'];

/** 中途荷葉的存檔快照：createSim(level, snapshot) 從那座荷葉重生 */
export interface PadSnapshot { pad: number; flies: boolean[]; rings: boolean[]; boostUsed: boolean[]; fliesGot: number; time: number }

export interface Sim {
  level: Level;
  t: number; time: number; started: boolean;
  x: number; y: number; vx: number; vy: number;
  angle: number; omega: number;
  mode: SimMode; crouch: number;
  prevHold: boolean; hold: boolean;
  target: number;
  tongue: Tongue;
  airRot: number; airFlips: number; airTime: number;
  flies: boolean[]; rings: boolean[];
  fliesGot: number; attaches: number; flipsTotal: number; bounces: number; maxX: number;
  fanIn: number; cause: DeathCause | null;
  near: number[]; nearMin: number[];
  onDune: number; duneT: number; backT: number; checkpoint: number;
  boostUsed: boolean[]; boosts: number; boostT: number;
  events: SimEvent[];
}
