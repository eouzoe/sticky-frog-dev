// 瀏覽器啟動設定，tools/perf 與 tools/bake 共用。
// BASE：環境變數 CHROME 指定執行檔時用它；否則用 playwright-core 安裝的 Chromium（第一次：bun x playwright-core install chromium），
//       channel 'chromium' 讓無頭模式跑完整版 Chromium（WebGL 與有畫面時一致），不是精簡的 headless shell。
// GPU：WSL2 上走 d3d12（Windows 的 GPU 驅動在 /usr/lib/wsl/lib）；其他機器用 Chromium 自己的 GPU 路徑。
import { existsSync } from 'node:fs';

export const BASE = process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chromium' };
export const WSL = existsSync('/usr/lib/wsl/lib');
export const GPU = WSL
  ? { args: ['--use-gl=angle', '--use-angle=gles-egl', '--ignore-gpu-blocklist', '--enable-gpu'], env: { ...process.env, GALLIUM_DRIVER: 'd3d12', LD_LIBRARY_PATH: '/usr/lib/wsl/lib' } }
  : { args: ['--ignore-gpu-blocklist', '--enable-gpu'] };
