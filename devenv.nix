{ pkgs, ... }:

{
  # STICKY FROG 的開發環境（Bun + Vite 8 + TypeScript 7）。工具全由這裡提供，不靠機器上的全域安裝。
  # 日常：bun install → bun run dev（5173）／bun run build／bun run check（型別、lint、tests/*-check.mjs）。
  # 離線工具：tools/bake（無頭 Chrome 烘焙圖集，Chrome 由 playwright-core 的快取提供）、tools/cat（ffmpeg + yt-dlp 做旋轉貓素材）、tools/perf（Playwright 量測與截圖）。
  languages.javascript = {
    enable = true;
    bun.enable = true;
  };

  packages = [
    pkgs.ffmpeg # tools/cat：抽格、去背、oiia 音效響度
    pkgs.yt-dlp # tools/cat：抓綠幕範本
  ];

  scripts."check-all".exec = ''bun run check'';

  enterShell = ''
    echo "sticky-frog · bun $(bun --version)"
    echo "  bun install → bun run dev / bun run build · bun run check → 型別、lint、全部檢查"
  '';
}
