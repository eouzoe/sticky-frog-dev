// 自動玩家（tests/sim-check.mjs 驗關卡用；__game.autoplay 給截圖巡覽用）。
// rel：擺過鉤點多遠（佔舌長比例）才放開；grabVy：下墜速度小於這個值才伸舌頭。
import { movePos } from './sim.js';

const tmp = { x: 0, y: 0 };
export function makeBot(rel, grabVy) {
  return (s) => {
    const tg = s.tongue;
    if (s.mode === 'perch') return true;
    if (tg.state === 'stuck') return !(s.vx > 1.5 && s.vy > 0 && s.x - tg.ax > rel * tg.L);
    if (tg.state === 'shoot') return true;
    if (s.target >= 0) {
      movePos(s.level.hooks[s.target], s.t, tmp);
      if (tmp.x > s.x + 1.5 && s.vy < grabVy) return true;
    }
    return false;
  };
}
