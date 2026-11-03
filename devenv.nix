{ pkgs, ... }:

{
  # STICKY FROG 的開發環境：只需要 Bun（執行工具鏈、Vite、檢查）。devenv test 跑全部檢查；CI 跑的是同一份。
  # tools/cat 的素材腳本另外需要 ffmpeg 與 yt-dlp，那是一次性的本機工作，不放進這裡。
  languages.javascript = {
    enable = true;
    bun.enable = true;
  };

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
