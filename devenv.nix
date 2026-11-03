{ ... }:

{
  # STICKY FROG 的開發環境：只需要 Bun。遊戲在瀏覽器跑、收資料端在 workerd 跑，沒有 Node。
  # devenv test 跑全部檢查；CI 跑的是同一份設定。
  languages.javascript = {
    enable = true;
    bun.enable = true;
    nodejs.enable = false; # 預設會裝 Node，這裡用不到
    lsp.enable = false; # 預設會裝 typescript-language-server，編輯器自己管
  };

  tasks = {
    "check:typecheck" = { exec = "bun run typecheck"; before = [ "devenv:enterTest" ]; };
    "check:lint" = { exec = "bun run lint"; before = [ "devenv:enterTest" ]; };
    "check:rules" = { exec = "bun run test"; before = [ "devenv:enterTest" ]; };
    "check:build" = { exec = "bun run build"; before = [ "devenv:enterTest" ]; };
    "check:telemetry" = { exec = "bun run typecheck && bun run test"; cwd = "server/telemetry"; before = [ "devenv:enterTest" ]; };
  };
}
