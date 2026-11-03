// 遊戲流程的狀態機（純函式：沒有 DOM、沒有計時器、不碰模擬）。哪個狀態下哪個動作合法、合法的話到哪裡。
// 一局之內只有四個狀態，沒有結算畫面、沒有按鈕：
//   playing → dying（主線死亡：節拍播完就從荷葉重生）
//   playing → over（無盡死亡：進來那一刻就結算，倒數完自動新一局）
//   playing → cleared（過關：節拍播完無條件下一關；最後一關回選單）
// 節拍的時間表在 beat.ts，這裡只管「播完之後去哪」；主迴圈每個動作都經過 transition()，回 null 就忽略（例如死亡中再按 R、過關中再撞到東西）。
export type Phase = 'boot' | 'menu' | 'levels' | 'shop' | 'records' | 'playing' | 'paused' | 'dying' | 'cleared' | 'over';
export type Action =
  | 'ready' // 開機完成
  | 'start'
  | 'startLast'
  | 'startEndless' // 開一關／開最後一關／開無盡：選單、選關、商店、暫停重來、結算提前都走這裡
  | 'die'
  | 'win'
  | 'beatEnd' // 節拍播完（或玩家點擊提前）
  | 'pause'
  | 'resume'
  | 'menu'
  | 'levels'
  | 'shop'
  | 'records';
export interface Flow {
  phase: Phase;
  endless: boolean;
  last: boolean;
  prev: Phase;
} // prev：暫停前的狀態（繼續要回到同一個節拍）
export const RUN: ReadonlySet<Phase> = new Set(['playing', 'dying', 'cleared', 'over']); // 一局之內（模擬在跑、HUD 在）
export const BOOT_FLOW: Flow = { phase: 'boot', endless: false, last: false, prev: 'menu' };

export function transition(f: Flow, a: Action): Flow | null {
  const p = f.phase,
    go = (phase: Phase, patch: Partial<Flow> = {}): Flow => ({ ...f, ...patch, phase });
  switch (a) {
    case 'ready':
      return p === 'boot' ? go('menu') : null;
    case 'start':
    case 'startLast':
    case 'startEndless':
      return p === 'boot' ? null : go('playing', { endless: a === 'startEndless', last: a === 'startLast' });
    case 'die':
      return p === 'playing' ? go(f.endless ? 'over' : 'dying') : null;
    case 'win':
      return p === 'playing' && !f.endless ? go('cleared') : null;
    case 'beatEnd':
      return p === 'dying' || p === 'over' ? go('playing') : p === 'cleared' ? go(f.last ? 'menu' : 'playing') : null;
    case 'pause':
      return RUN.has(p) ? go('paused', { prev: p }) : null;
    case 'resume':
      return p === 'paused' ? go(f.prev) : null;
    case 'menu':
    case 'levels':
    case 'shop':
    case 'records':
      return p === 'boot' ? null : go(a);
  }
}
