// 自動玩家（tests/sim-check.mjs 驗關卡用；__game.autoplay 給截圖巡覽用）。
// rel：擺過鉤點多遠（佔舌長比例）才放開；grabVy：下墜速度小於這個值才伸舌頭。
import { movePos } from './sim.js';

const tmp = { x: 0, y: 0 };
export function makeBot(rel, grabVy) {
  return (s) => {
    const tg = s.tongue;
    if (s.mode === 'perch') return true;
    // 在沙丘片區上方（或剛貼著沙面）：像想滑沙的玩家一樣先不出舌，讓青蛙落到沙上滑，滑到最後一座 lip 的一半才照一般規則找鉤點。
    // 只在有沙丘的關卡生效（1–75 關 dunes 是空的、duneT 是 -99，軌跡不變）
    if (tg.state !== 'stuck' && s.level.dunes.length) {
      for (const d of s.level.dunes) if (d.lip && !d.off && s.x <= d.x1) {
        let a = d.x0; for (const e of s.level.dunes) if (e.f === d.f && e.x0 < a) a = e.x0;
        if (s.x >= a - 2.5 && s.x < d.x0 + (d.x1 - d.x0) * 0.5) return false;
        break;
      }
    }
    if (tg.state === 'stuck') return !(s.vx > 1.5 && s.vy > 0 && s.x - tg.ax > rel * tg.L);
    if (tg.state === 'shoot') return true;
    if (s.target >= 0) {
      movePos(s.level.hooks[s.target], s.t, tmp);
      if (tmp.x > s.x + 1.5 && s.vy < grabVy) return true;
    }
    return false;
  };
}
