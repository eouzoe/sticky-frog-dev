// 自動玩家（tests/sim-check.mjs 驗關卡用；__game.autoplay 給截圖巡覽用）。
// makeBot＝一般 bot（fbc7662 原版：看到鉤點就出舌、在沙丘上也不會等）：diff-gate、sim-check、--nodune、traj-hash 都用它。
// makeSurfBot＝滑沙 bot：追沙丘上的拾取物軌跡（從鉤點放手時算落點，對準軌跡起點）、在沙丘片區上方不出舌、滑到 lip 一半才找鉤點；只用在 tests/dune-check.mjs 的滑行量測。
// rel：擺過鉤點多遠（佔舌長比例）才放開；grabVy：下墜速度小於這個值才伸舌頭。
import { movePos } from './sim.js';
import { TUNE as T } from './config.js';

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

export function makeSurfBot(rel, grabVy) {
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
    if (tg.state === 'stuck') {
      // 前面（40 單位內）有沙丘片區：在鉤點上握著，直到「現在放手的落點」到軌跡起點（第一個拾取物）才放手；繩子盪不到就退回一般放手規則
      const lv = s.level, d0 = lv.dunes.find((d) => d.first && !d.off && d.x0 > tg.ax && d.x0 - tg.ax < 5);
      if (d0) {
        const r0 = lv.rings.find((r) => r.trail === d0.f && r.k === 0);
        if (r0) {
          const g = T.GRAVITY, vy = s.vy, disc = vy * vy + 4 * (g / 2) * (s.y - r0.y);
          const t = disc >= 0 ? (vy + Math.sqrt(disc)) / g : 0, landX = s.x + s.vx * t;
          if (s.vx > 1.5 && s.vy > -2 && landX >= r0.x - 0.3) return false;
          if (s.vx > 1.5 && s.x - tg.ax < tg.L * 1.6) return true;
        }
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
