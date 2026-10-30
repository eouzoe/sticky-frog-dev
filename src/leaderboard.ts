// 排行榜：本機前 10 名（無盡模式分數）＋ CrazyGames SDK v3 的 user.submitScore。
// 官方文件：https://docs.crazygames.com/sdk/leaderboards/ —— 只開放受邀遊戲；encryptedScore＝AES-GCM 加密 String(score)，IV＋密文接起來 base64。
// LB_KEY 空字串＝不送（還沒被邀請）；拿到金鑰填進 config.ts 的 LB_KEY 就會開始送。
import { cg } from './cg.ts';
import { LB_KEY } from './config.ts';
import type { LbEntry } from './save.ts';

const TOP = 10;

// 本機榜：回傳這次的名次（1 起算；沒進前 10 回 0）。list 會被改成新的陣列內容
export function addLocal(list: LbEntry[], entry: LbEntry): number {
  const next = [...list, entry].sort((a, b) => b.score - a.score).slice(0, TOP);
  list.length = 0; list.push(...next);
  return next.indexOf(entry) + 1;
}

async function encryptScore(score: number, base64Key: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const raw = Uint8Array.from(atob(base64Key), (ch) => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(String(score))));
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv, 0); packed.set(cipher, iv.length);
  return btoa(String.fromCharCode(...packed));
}

// 平台榜：沒有金鑰、沒有 SDK、SDK 沒有這個方法都安靜跳過；失敗只 warn（包含 SDK 回傳的 promise 被拒絕）
export async function submitPlatform(score: number): Promise<boolean> {
  const user = window.CrazyGames?.SDK?.user;
  if (!LB_KEY || !cg.ready || typeof user?.submitScore !== 'function') return false;
  try { await user.submitScore({ encryptedScore: await encryptScore(score, LB_KEY), score }); return true; } catch (e) { console.warn('[leaderboard]', e); return false; }
}
