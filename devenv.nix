{ pkgs, ... }:

{
  # STICKY FROG 的開發環境。工具全由這裡提供，不靠機器上的全域安裝。
  # 日常：bun install → bun run dev（5173）／bun run build；devenv test 跑全部檢查（型別、lint、遊戲規則、建置、收資料端）。
  # 離線工具：bun run bake（無頭 Chromium 烘焙圖集，Chromium 由 playwright-core 提供：bun x playwright-core install chromium）；tools/cat（ffmpeg + yt-dlp 做旋轉貓素材）。
  languages.javascript = {
    enable = true;
    bun.enable = true;
  };

  packages = [
    pkgs.ffmpeg # tools/cat：抽格、去背、oiia 音效響度
    pkgs.yt-dlp # tools/cat：抓綠幕範本
  ];

  # 檢查＝任務；devenv test 一次跑完（互不相依的並行）。單跑一項：devenv tasks run check:rules
  tasks = {
    "check:typecheck" = { exec = "bun run typecheck"; before = [ "devenv:enterTest" ]; };
    "check:lint" = { exec = "bun run lint"; before = [ "devenv:enterTest" ]; };
    "check:rules" = { exec = "for f in tests/*-check.mjs; do bun \"$f\" > /dev/null || { echo \"FAIL $f\"; exit 1; }; echo \"ok   $f\"; done"; before = [ "devenv:enterTest" ]; };
    "check:build" = { exec = "bun run build"; before = [ "devenv:enterTest" ]; };
    "check:telemetry" = { exec = "bun run typecheck && bun run test"; cwd = "server/telemetry"; before = [ "devenv:enterTest" ]; };
  };

  enterShell = ''
    echo "sticky-frog · bun $(bun --version) · devenv test 跑全部檢查"
  '';
}
