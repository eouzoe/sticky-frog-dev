// 阻尼彈簧（半隱式歐拉）：一幀拆成不超過 1/120 秒的子步長積分。
// 直接用整幀 dt 積分時，k·dt² 一大就發散：勁度 300、dt 0.1（選單夾住的上限、低階機卡一下）每幀放大 2 倍，
// 眼睛會膨脹到蓋滿整個畫面。60 fps 時拆成 1 步，跟原本完全一樣。
const MAX_STEP = 1 / 120;
const out = { x: 0, v: 0 };

/** 把 x 以勁度 k、阻尼 c 拉向 target（f＝額外加速度）；回傳共用物件 {x, v}，呼叫端立刻取用 */
export function spring(x: number, v: number, target: number, k: number, c: number, dt: number, f = 0): { x: number; v: number } {
  const n = Math.max(1, Math.ceil(dt / MAX_STEP)),
    h = dt / n;
  for (let i = 0; i < n; i++) {
    v += ((target - x) * k - v * c + f) * h;
    x += v * h;
  }
  out.x = x;
  out.v = v;
  return out;
}
