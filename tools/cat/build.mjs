// 旋轉貓素材：從 oiia 迷因的綠幕範本與原音做出遊戲用的檔案（手動執行，輸出檔提交進 src/art/）
//   src/art/cat-spin.webp  揣手手 9 個角度一列（原動畫的播放順序，從正面開始）
//   src/art/cat-spin.json  格子尺寸、跟站姿照片（src/art/cat.webp）對齊用的錨點與高度比例
//   src/art/oiia.mp3       原音一句：起音淡入、削刺耳頻段、壓縮音節尖峰、一點短空間感、響度 -20 LUFS
// 來源（下載到系統暫存資料夾，不進專案）：
//   綠幕範本 https://www.youtube.com/watch?v=I68Ehtbu84M（1080p、30fps、183 格）
//   原音     https://media.soundboardguys.com/sound-files/oiia-oiia-spinning-cat.mp3
// 執行：devenv -O packages:pkgs "ffmpeg yt-dlp" shell -- bun tools/cat/build.mjs
// 換來源、改 cat.webp、改處理參數時要重跑。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ART = new URL('../../src/art/', import.meta.url).pathname;
const CACHE = join(tmpdir(), 'sticky-frog-cat-src');
mkdirSync(CACHE, { recursive: true });
const run = (cmd, args, input) => {
  const r = spawnSync(cmd, args, { maxBuffer: 1 << 30, input });
  if (r.status) throw new Error(`${cmd} ${args.join(' ')}\n${r.stderr}`);
  return r.stdout;
};

// ---------- 來源 ----------
const VIDEO = join(CACHE, 'greenscreen-1080.mp4'),
  VOICE = join(CACHE, 'oiia-source.mp3');
if (!existsSync(VIDEO)) run('yt-dlp', ['-f', '270/614/248', '-o', VIDEO, 'https://www.youtube.com/watch?v=I68Ehtbu84M']);
if (!existsSync(VOICE)) writeFileSync(VOICE, Buffer.from(await (await fetch('https://media.soundboardguys.com/sound-files/oiia-oiia-spinning-cat.mp3')).arrayBuffer()));

// ---------- 畫面 ----------
// 影片格號：比對綠幕每一格與 9 個角度得到的（第二段慢速旋轉，一格影片＝一個角度）；站姿取中段
// 原動畫的播放順序是角度 9→8→…→1 循環，起手停在 1（正面）；圖集照這個順序排，從 1 開始
const W = 1920,
  H = 1080,
  ORDER = [1, 9, 8, 7, 6, 5, 4, 3, 2];
const PICK = { stand: 70, 1: 108, 2: 106, 3: 105, 4: 104, 5: 103, 6: 102, 7: 101, 8: 100, 9: 99 };
const SCALE = 0.5,
  PAD = 6; // 圖集解析度＝影片的一半（來源本來就是放大過的低解析畫面）；PAD＝每格四周透明邊（影片像素）
const grab = (n) => run('ffmpeg', ['-loglevel', 'error', '-i', VIDEO, '-vf', `select='eq(n,${n})'`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
// 去綠幕：綠色差 → alpha；半透明邊扣掉混進來的背景色、壓掉綠色溢出
function key(rgb) {
  const bs = [];
  for (let x = 0; x < W; x += 7)
    for (const y of [2, H - 3]) {
      const i = (y * W + x) * 3;
      bs.push([rgb[i], rgb[i + 1], rgb[i + 2]]);
    }
  const med = (k) => bs.map((b) => b[k]).sort((a, b) => a - b)[bs.length >> 1],
    bg = [med(0), med(1), med(2)],
    bgd = bg[1] - Math.max(bg[0], bg[2]);
  const out = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const r = rgb[p * 3],
      g = rgb[p * 3 + 1],
      b = rgb[p * 3 + 2],
      a = 1 - smooth(bgd * 0.18, bgd * 0.55, g - Math.max(r, b));
    let R = r,
      G = g,
      B = b;
    if (a > 0 && a < 1) {
      R = (r - (1 - a) * bg[0]) / a;
      G = (g - (1 - a) * bg[1]) / a;
      B = (b - (1 - a) * bg[2]) / a;
    }
    G = Math.min(G, Math.max(R, B) + 6);
    out[p * 4] = R;
    out[p * 4 + 1] = G;
    out[p * 4 + 2] = B;
    out[p * 4 + 3] = a * 255;
  }
  return out;
}
function bbox(px, w, h, th = 24) {
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3] > th) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const keyed = Object.fromEntries(Object.entries(PICK).map(([k, n]) => [k, key(grab(n))]));
const boxes = Object.fromEntries(Object.entries(keyed).map(([k, px]) => [k, bbox(px, W, H)]));
// 9 個角度共用一個框（保留影片裡的相對位置與大小）
const L = ORDER.map((k) => boxes[k]);
const U = { x0: Math.min(...L.map((b) => b.x0)) - PAD, y0: Math.min(...L.map((b) => b.y0)) - PAD, x1: Math.max(...L.map((b) => b.x1)) + PAD, y1: Math.max(...L.map((b) => b.y1)) + PAD };
U.w = U.x1 - U.x0 + 1;
U.h = U.y1 - U.y0 + 1;
const cw = Math.round(U.w * SCALE),
  ch = Math.round(U.h * SCALE);
// 一列 9 格：先拼成影片解析度的一長條，再交給 ffmpeg 縮放＋編 WebP（保留 alpha）
const strip = Buffer.alloc(U.w * ORDER.length * U.h * 4),
  SW = U.w * ORDER.length;
ORDER.forEach((k, i) => {
  const px = keyed[k];
  for (let y = 0; y < U.h; y++)
    for (let x = 0; x < U.w; x++) {
      const s = ((y + U.y0) * W + x + U.x0) * 4,
        d = (y * SW + i * U.w + x) * 4;
      for (let c = 0; c < 4; c++) strip[d + c] = px[s + c];
    }
});
// 像素格式用 bgra 交給 libwebp 自己轉：yuva420p 會讓透明處變成 alpha=1（描邊時被疊成方框）
run(
  'ffmpeg',
  [
    '-loglevel',
    'error',
    '-y',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-s',
    `${SW}x${U.h}`,
    '-i',
    '-',
    '-vf',
    `scale=${cw * ORDER.length}:${ch}:flags=lanczos`,
    '-c:v',
    'libwebp',
    '-quality',
    '82',
    '-compression_level',
    '6',
    '-pix_fmt',
    'bgra',
    join(ART, 'cat-spin.webp'),
  ],
  strip,
);

// 跟站姿照片對齊：cat.webp 的不透明外框 ↔ 影片站姿的外框（同一張照片）
const photo = run('ffmpeg', ['-loglevel', 'error', '-i', join(ART, 'cat.webp'), '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
const [pw, ph] = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', join(ART, 'cat.webp')])
  .toString()
  .trim()
  .split(',')
  .map(Number);
const PB = bbox(photo, pw, ph),
  SB = boxes.stand;
// 站姿照片的錨點（src/render/view.ts：寬 0.5、高 0.55）換到影片座標，再換成這一格裡的比例
const PHOTO_AX = 0.5,
  PHOTO_AY = 0.55;
const vx = SB.x0 + ((PHOTO_AX * pw - PB.x0) / PB.w) * SB.w,
  vy = SB.y0 + ((PHOTO_AY * ph - PB.y0) / PB.h) * SB.h;
const meta = {
  n: ORDER.length,
  cw,
  ch,
  ax: +((vx - U.x0) / U.w).toFixed(4),
  ay: +((vy - U.y0) / U.h).toFixed(4),
  // 一格的高度＝站姿照片整張高度的幾倍（照片高 hU 世界單位 → 一格 hU × h）
  h: +((U.h / SB.h) * (PB.h / ph)).toFixed(4),
  source: { video: 'youtube I68Ehtbu84M', frames: PICK, order: ORDER },
};
writeFileSync(join(ART, 'cat-spin.json'), `${JSON.stringify(meta, null, 1)}\n`);
console.log('cat-spin', meta);

// ---------- 聲音 ----------
// 原檔 0.90–2.99 秒是一整句（人聲在 0.925 秒起音、2.95 秒後自然衰減）；
// 淡入 60ms 蓋過起音（原本 10ms 內從 -47 跳到 -18dB，循環重播時「啪」一聲），收尾 70ms
const CHAIN = [
  'atrim=start=0.90:end=2.99',
  'asetpts=PTS-STARTPTS',
  'aformat=channel_layouts=mono',
  'highpass=f=120', // 去低頻雜音
  'equalizer=f=3000:t=q:w=1.2:g=-3', // 削刺耳的 3kHz
  'treble=g=-3:f=7000', // 高頻柔一點
  'acompressor=threshold=-20dB:ratio=3:attack=8:release=120', // 壓平音節尖峰
  'aecho=0.8:0.7:32|57:0.10|0.06', // 很短的空間感，跟合成音效比較融合
  'afade=t=in:d=0.06',
  'afade=t=out:st=2.02:d=0.07',
];
const tmp = join(CACHE, 'oiia-processed.wav');
run('ffmpeg', ['-loglevel', 'error', '-y', '-i', VOICE, '-af', CHAIN.join(','), '-ar', '44100', tmp]);
// 響度標準化到 -20 LUFS（遊戲裡的實際音量由 src/audio.ts 的增益決定）
// ebur128 會邊播邊印目前的累計值，最後一個 I: 才是整段的結果
const lufs = +[
  ...spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', tmp, '-af', 'ebur128', '-f', 'null', '-'])
    .stderr.toString()
    .matchAll(/I:\s+(-?[\d.]+) LUFS/g),
].at(-1)[1];
run('ffmpeg', ['-loglevel', 'error', '-y', '-i', tmp, '-af', `volume=${(-20 - lufs).toFixed(2)}dB`, '-c:a', 'libmp3lame', '-b:a', '64k', join(ART, 'oiia.mp3')]);
console.log('oiia.mp3', { before: lufs, after: -20 });
