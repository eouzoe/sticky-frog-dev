// 排行榜：本機前 10 名（無盡模式分數）＋ CrazyGames SDK v3 的 user.submitScore。
// 官方文件（2026-10-26 查）：https://docs.crazygames.com/sdk/leaderboards/ 、https://docs.crazygames.com/sdk/leaderboards-client/
//   - 「The leaderboard feature is only available for invited games.」每款遊戲一個榜，設定與加密金鑰在 Developer Portal。
//   - 送分：CrazyGames.SDK.user.submitScore({ encryptedScore, score })；encryptedScore＝AES-GCM（32 bytes base64 金鑰、12 bytes 隨機 IV）加密 String(score)，
//     IV＋密文接起來 base64。伺服器一律回成功、後端驗證；榜單由平台顯示在遊戲外（側欄、遊戲頁），遊戲內沒有讀榜 API。
// 所以：LB_KEY 空字串＝不送（還沒被邀請）；拿到金鑰填進 config.js 的 LB_KEY 就會開始送。SDK 呼叫只在這一個檔，跟 src/cg.js 同一層。
import { cg } from './cg.js';
import { LB_KEY } from './config.js';

const TOP = 10;

// 本機榜：回傳這次的名次（1 起算；沒進前 10 回 0）。list 會被改成新的陣列內容
export function addLocal(list, entry) {
  const next = [...list, entry].sort((a, b) => b.score - a.score).slice(0, TOP);
  list.length = 0; list.push(...next);
  return next.indexOf(entry) + 1;
}

async function encryptScore(score, base64Key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const raw = Uint8Array.from(atob(base64Key), (ch) => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(String(score))));
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv, 0); packed.set(cipher, iv.length);
  return btoa(String.fromCharCode(...packed));
}

// 平台榜：沒有金鑰、沒有 SDK、SDK 沒有這個方法都安靜跳過；失敗只 warn（不能讓遊戲壞掉）
export async function submitPlatform(score) {
  const user = window.CrazyGames?.SDK?.user;
  if (!LB_KEY || !cg.ready || typeof user?.submitScore !== 'function') return false;
  try { user.submitScore({ encryptedScore: await encryptScore(score, LB_KEY), score }); return true; } catch (e) { console.warn('[leaderboard]', e); return false; }
}
