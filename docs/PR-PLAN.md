# 定版收尾與 PR 拆分計畫（2026-10-30，等使用者說「開始」才執行；禁止推送）

這個資料夾是 CrazyGames 那條線的成品（jj 書籤 `mvp-crazygames`）。目標：把它收乾淨，然後拆成一疊小而原子、好理解、好審閱的 PR，給另一位作者看。remote 是 `io-software-games/sticky-frog`（私有），基底 `origin/main`（最後一個上游提交＝夕陽沙丘 w6 合併）。

## 一、定版細節（收尾清單，每項一個小提交）

| 項目 | 現況 | 建議 |
|---|---|---|
| `tests/smoke-*.json`（5 支提到 `#result`、`ui.showResult`、`finishResult`） | 結算畫面已刪，這些步驟一定紅；執行器不在 repo、不在 `check` 裡 | 改寫成新流程（等 `cleared`／`#clear`、點畫面提前），或刪除無法執行的；二選一，不留壞的 |
| `tests/feat-dist.mjs` | 還提到 CLUTCH_*，分析用腳本 | 刪 CLUTCH 相關行，或整支刪（feats-check 已覆蓋） |
| `docs/DEVNOTES.md` | three.js 時代的說明 | 縮成一頁指向 docs/PLAN.md 與 REVIEW，或刪 |
| `README.md` | 要確認是否還在講 GLB、three.js、dist 大小 | 快速開始、專案結構、架構圖改成現況（WebGL2、圖集、Bun） |
| `devenv.nix` | Node 24＋npm 舊設定 | 改成 Bun、Chrome（烘焙與截圖）、ffmpeg／yt-dlp（貓素材）；`bun run check` 在 devenv shell 裡能跑 |
| `bun.lock` | 被 `.git/info/exclude` 排除，沒進任何提交；`package-lock.json` 是否還在要確認 | 提交 `bun.lock`、刪 `package-lock.json`，exclude 清掉 |
| oxfmt | 只有設定，套用會重排 90 檔 | 不在這疊 PR 裡套；審完之後再一支「純格式」PR，或不套 |
| `window.__game` 測試掛鉤進正式版 | 審查清單的中度問題 | 用 `import.meta.env.DEV` 或 `?debug=1` 才掛，獨立小 PR |
| 佔位美術（石頭、蝴蝶、小魚乾、貓跳台、軟墊） | `paint.ts` 向量佔位 | CrazyGames 版就用這些；PR 說明寫清楚是佔位 |
| 經濟數字、組合包價 | 第一版猜的 | 保留，PR 說明寫「等遙測調」 |
| 剩餘開機項目（boot:ui、Service Worker、商店拆分） | 未做，理由在 PLAN | 不進這一版 |

## 〇、流程（2026-10-30 使用者定，取代第四節的 GitHub 機制）

- 倉庫：`eouzoe/sticky-frog-dev`（私有、可分享；上游禁止 fork，所以用鏡像）。jj remote 名稱 `fork`（SSH）。
- 三個分支：`main`＝上游原樣；`dev`、`exp` 從 `main` 分出。
- 階段一（實驗）：全部批次依序疊在 `exp`，每批結束手動跑一次 CI（`gh workflow run check.yml --ref batch/<X>`）。CI 只有 `workflow_dispatch`，推送不觸發。手動觸發的 workflow 必須在預設分支上，所以實驗期間預設分支是 `exp`。發現問題就用 jj 直接改寫該提交（`jj edit`、`jj new -A`、`jj describe`），後代自動重疊、change ID 不變。
- 階段二（投放）：全部批次跑完、修好之後，照同樣順序每批一個 PR 合進 `dev`（merge commit，不 squash），每批結束手動跑 CI。
- 階段三：一個 `dev → main` PR；預設分支改回 `main`。
- 批 A0 擴大為「測試與 CI」六個 PR：CI workflow、收資料端 Vitest 工具鏈（`@cloudflare/vitest-pool-workers`，在 workerd 裡跑、每檔獨立 D1）、設定、測試、CI 步驟、README。舊的 `test-worker.mjs` 只留給已部署端點（`--remote`），本機跑會和 `wrangler dev` 搶同一份本機 D1 而中途斷線。

## 二、PR 拆分（2026-10-30 使用者改定：不復用本機提交，直接比對 `origin/main` 與定版，每個 PR 單獨可接受）

原則（使用者）：本機的原子提交只是我們的工作紀錄，**不拿來直接當 PR**。要拿「上游 `origin/main`」與「定版」兩個版本的整體差異，重新切成一組 PR，條件是：對方非常好理解、好測試、好審閱；**任何一個 PR 單獨接受都可行**（不是只能照順序疊的 stack）；夠獨立但不龐大。

做法：
1. `jj diff --from origin/main --to mvp-crazygames --summary` 列出全部檔案差異，按「概念」而不是按「當時怎麼改」分組。
2. 每組 PR 從 `origin/main` 開一條新線（`jj new origin/main`），只用 `jj restore --from mvp-crazygames <paths>` 拉它需要的檔案，必要時手改到能獨立建置與過檢查；不是把本機提交 rebase 過去。
3. 無法獨立於地基的功能，就以「地基 PR」為 base，彼此之間仍互相獨立（任一個可先合）。

**粒度定義（2026-10-30 使用者再定）**：兩層。
- **批（batch）**＝一類／一個功能統合的一群 PR。接受的單位是「批」：整批一次接受之後必須可建置、可跑、`bun run check` 全綠。批與批之間獨立（任一批可先合，依賴只能指向地基批）。
- **PR**＝批裡的一個改動：一個功能、一個修改、通常一個檔案（同一件事的 12 個語系檔算一個）。單一 PR 的要求是可審閱、好理解、優雅；它不必自己能跑。批裡的 PR 有順序，說明開頭寫「批 X 的第 n／N 個」。

批與 PR 清單（真的 diff 出來後逐一核對；每個 PR 一行＝一個檔案或一件事）：

**批 A1 存檔對帳**（基於上游，JS）：A1-1 `save.js` 加 v／updatedAt／mergeSave；A1-2 `tests/save-check.mjs` 合併案例；A1-3 `main.js` 開機不等 SDK、就緒後合併；A1-4 `cg.js` `getItem(from)`＋setItem 本機鏡像。
**批 A2 語言存檔**：取消（2026-10-30）。選了未下載語言會存錯 code 的問題，是重寫版把語系改成延後載入時才引進的；上游 `i18n.js` 同步載入全部語系，沒有這個 bug。REVIEW 的那一條只適用於重寫版，修正留在批 B 的 `i18n` PR 裡。
**批 A3 商店遙測**（切完，七個 PR）：A3-1 `telemetry.js` want／buy；A3-2 `schema.sql`＋`migrate-0001-shop.sql`（item／price／coins 欄位；舊資料庫跑一次 ALTER）；A3-3 `server/telemetry/src/index.js` 驗證表＋INSERT 欄位；A3-4 `telemetry-check.mjs`；A3-5 `test-worker.mjs`；A3-6 `main.js` 接點；A3-7 README。比對時發現定版的收資料端只加了驗證表、沒加欄位與 INSERT 對應，品項與價格會被丟掉；定版同步補上。
**批 A4 無盡結算小修**（上游版）：A4-1 `main.js` 死亡那一刻結算。
**批 A5 lint**：A5-1 `.oxlintrc.json`；A5-2 `package.json` scripts；A5-3～n 各檔的 lint 修正（每檔一個 PR，純機械）。
**批 B 地基：渲染器與工具鏈**（大批，PR 很多但每個小）：
- 工具鏈：B-01 `package.json`＋`bun.lock`；B-02 `tsconfig.json`；B-03 `vite.config.ts`（含預抓內嵌腳本）；B-04 `.gitignore`。
- TS 化（行為不變，每檔一個 PR）：B-05 `types.ts`；B-06 `config`；B-07 `sim`；B-08 `level`；B-09 `save`；B-10 `feats`；B-11 `bot`；B-12 `i18n`；B-13 `lang/*`（12 檔一個）；B-14 `telemetry`；B-15 `leaderboard`；B-16 `quality`；B-17 `cg`。
- 渲染器（每檔一個 PR，先新增、不接線）：B-18 `render/gl.ts`；B-19 `render/atlas.ts`；B-20 `render/palette.ts`；B-21 `render/paint.ts`；B-22 `render/view.ts`；B-23 `render/level.ts`；B-24 `render/character.ts`；B-25 `render/fx.ts`；B-26 `render/portraits.ts`；B-27 `render/cat-stage.ts`。
- 烘焙與素材：B-28 `tools/bake/`（run.mjs、index.html、paint.html、paint.js）；B-29 `tools/cat/`；B-30 `src/art/atlas-shared`＋`atlas-fx`；B-31 `src/art/atlas-w0..w5`；B-32 `src/art/atlas-c_*`（造型）；B-33 `src/art/cat-spin`＋`oiia`。
- 接線（每檔一個 PR）：B-34 `audio.ts` 門面＋`audio-engine.ts`；B-35 `juice.ts`；B-36 `ui.ts`；B-37 `index.html`（含早期 WebGL 內嵌腳本）；B-38 `main.ts`；B-39 刪 three.js 相依與舊檔（`scene.js`、`frog.js`、`art.js`、`levelview.js`、`fx.js`、`packs-table.js`、`tongues.js`、`public/` 模型包）；B-40 `README.md`＋`DEVNOTES.md` 改現況。
- 開機路徑（可獨立成批 B'，依賴 B）：B'-1 性能量測點；B'-2 預抓腳本；B'-3 GPU fence；B'-4 延後載入（audio／juice／cat-stage）；B'-5 各圖集 json 拆分；B'-6 世界圖集門檻（worldReady）。
**批 C1 回饋門檻**（依賴 B）：C1-1 `main.ts` 門檻常數與跳字；C1-2 `feats.ts` 門檻與刪 clutch；C1-3 `juice.ts` 翻轉特效與死亡特效；C1-4 `lang/*` 刪鍵；C1-5 `tests/feats-check.mjs`。
**批 C2 一局結束流程**（依賴 B）：C2-1 `flow.ts`＋`tests/flow-check.mjs`；C2-2 `beat.ts`＋`tests/beat-check.mjs`；C2-3 `index.html` 浮層與樣式；C2-4 `ui.ts` 浮層函式；C2-5 `main.ts` 接狀態機與節拍、金幣入帳；C2-6 `lang/*` 刪結算鍵；C2-7 `tests/i18n-check.mjs`；C2-8 `tools/perf/flowcheck.mjs`。
**批 C3 全年齡障礙物**（依賴 B）：C3-1 `paint.ts` rock／bfly；C3-2 `atlas-fx` 重烘；C3-3 `palette.ts` 每世界色；C3-4 `render/level.ts` 畫法；C3-5 `audio-engine.ts` 撞擊聲；C3-6 `feats.ts`＋`lang/*` 文字；C3-7 `tools/perf/hazards.mjs`。
**批 C4 金幣經濟**（依賴 B）：C4-1 `main.ts` 來源；C4-2 `feats.ts` 成就金幣；C4-3 `config.ts` 物價；C4-4 遙測接點（若 A3 已合則只剩接點）。
**批 C5 主題資料包**（依賴 B，建議在 C2、C4 後）：C5-1 `config.ts` THEMES；C5-2 `save.ts` theme／saleAt＋測試；C5-3 `level.ts` 系列關卡；C5-4 `render/view.ts` wf 替換；C5-5 `render/level.ts` 蒼蠅替換；C5-6 `paint.ts`＋`atlas-fx` 貓道具；C5-7 `audio.ts` setTheme；C5-8 `ui.ts` 組合包與選關主題卡；C5-9 `index.html`；C5-10 `main.ts` shopSet／applyTheme；C5-11 `lang/*`；C5-12 `tools/perf/themecheck.mjs`。
**批 C6 掛鉤門控**：C6-1 `main.ts` `__game` 只在 DEV 或 `?debug=1`；C6-2 `tools/perf/*` 加 `?debug=1`。
**批 D 文件與量測**：D-1 `tools/perf/` 每支腳本一個 PR（或同類合併）；D-2 `docs/REVIEW`；D-3 `docs/PRODUCT`；D-4 `docs/PLAN`。
**批 E devenv**：E-1 `devenv.nix`（Bun 版）；E-2 `devenv.yaml`＋`devenv.lock`。

舊的分組草案（留做對照）：

**A. 獨立修正（基於 `origin/main`，對方現在就能合，各自一個 PR，JS 版）**：這些是上游也有的 bug，在上游的 JS 程式碼上重做一次、附測試。
- A1 存檔對帳：`mergeSave`、`v`／`updatedAt`、SDK 晚到不丟進度（save-check）。
- A2 `cg.setItem` 本機永遠鏡像、`getItem(from)`。
- A3 選未下載語言時存錯語言（i18n `onPick(code)`）。
- A4 遙測 `shop_want`／`shop_buy` 事件與收資料端驗證表（telemetry-check、worker 測試）。
- A5 WebGL context lost／restored（若上游 three.js 版適用則獨立做，否則併進 B）。
- A6 無盡模式 0.8 s 內重來不結算——上游版的小修（不等流程重做）。
- A7 工具鏈：oxlint 進 check（規則檔、`--deny-warnings`），不含格式化。

**B. 地基（一個 PR，大但只有一個概念）**：three.js → 自寫 WebGL2 偽 3D 渲染器＋離線烘焙圖集＋Bun／Vite 8／TS 7。包含 `src/render/*`、`tools/bake/`、`tools/cat/`、`src/art/*`、`.js→.ts`、`main.ts`／`ui.ts`／`index.html` 的接線、刪 three.js 與 `public/` 模型包、背景捲軸層與平塗水天、開機路徑（預抓、fence、延後載入、圖集 json）。審閱重點：量測數字（填充 3.35→0.5 螢幕、下載 733→206 KB、核心 194→141 KB）、渲染器設計、烘焙管線、授權。說明裡附「怎麼在本機建置與截圖」。

**C. 功能（各自基於 B，彼此獨立，任一個可先合）**：
- C1 回饋門檻與成就（跳字門檻、刪絕地救援、大貼紙只給旋轉）。
- C2 一局結束流程：狀態機、節拍、無按鈕浮層、金幣入帳（flow／beat 測試＋flowcheck）。
- C3 全年齡障礙物（石頭、蝴蝶）。
- C4 金幣經濟（來源、物價）。
- C5 主題資料包與旋轉貓組合包（含系列關卡）。
- C6 `window.__game` 掛鉤門控（DEV 或 `?debug=1`）。
C2～C5 都碰 `main.ts`，任兩個同時合會有小衝突；PR 說明寫明「獨立可合，合併順序任意，衝突只在 main.ts 的鄰近行」。

**D. 文件與工具（不含程式）**：D1 `tools/perf/` 量測與驗證腳本；D2 `docs/`（REVIEW、PRODUCT、PLAN、PR-PLAN）；D3 README 與 DEVNOTES 改成現況（跟 B 一起合才正確，說明寫清楚）。

**E. devenv（選配，一個 PR）**：`devenv.nix`／`devenv.yaml`／`devenv.lock` 現在被 `.git/info/exclude` 擋在 repo 外。建議放進去：對方不用 nix 可以完全忽略，但它把 Bun、Chrome（烘焙與截圖）、ffmpeg／yt-dlp（貓素材）的版本釘住，`bun run check` 在 devenv shell 裡一定能跑。先把它改成 Bun 版再放。

估計：A 組每個半天內；B 一個會話（含重做接線與逐步驗證）；C 每個一兩小時；D、E 小。順序建議：先送 A（對方可以邊審邊合），再 B，再 C。

| # | 書籤 | 內容 | 審閱重點 | 大小 |
|---|---|---|---|---|
| 01 | `pr/01-toolchain-ts` | Bun、Vite 8、TS 7、tsconfig、scripts；純邏輯模組 .js→.ts（sim、level、save、feats、config、bot、i18n、lang/*、telemetry、leaderboard、quality、cg、types）；`bun.lock` | 行為不變：sim-check、traj-hash、save-check 等全綠；tsconfig 要 allowJs 讓 main.js 先留著 | 中（多是改名） |
| 02 | `pr/02-render-engine` | 新增 `src/render/*`（gl、atlas、view、level、character、fx、paint、palette、portraits、cat-stage）、`tools/bake/`、`tools/cat/`、`src/art/*` 圖集；尚未接線 | 渲染器設計（28 byte 頂點、批次、premultiplied、context lost）、烘焙管線；圖集是二進位，審大小與授權 | 大（程式約 2k 行＋圖集） |
| 03 | `pr/03-switch-renderer` | `main.ts`、`ui.ts`、`index.html`、`audio`、`juice`、`fx` 接到新渲染器；刪 three.js、`scene.js`、`frog.js`、`art.js`、`levelview.js`、`packs`、`public/` 模型包 | 這是「切換」PR：審接線與刪除；效能量測數字附在說明（填充 3.35→0.5 螢幕、下載 733→206 KB） | 大 |
| 04 | `pr/04-oxlint` | oxlint 進 check、oxfmt 設定 | 規則選擇 | 小 |
| 05 | `pr/05-parallax-bg` | 背景改固定深度捲軸層、水天平塗、刪全螢幕著色器 | 填充量與 CPU 的量測 | 中 |
| 06 | `pr/06-menu-hero` | 首頁不畫世界裡的角色 | 一行 | 極小 |
| 07 | `pr/07-feedback-thresholds` | 跳字與成就門檻提高、進關前等世界圖集 | 數字依據（使用者指示） | 小 |
| 08 | `pr/08-boot-marks-prefetch` | 開機量測點、內嵌預抓腳本 | 量測方法 | 小 |
| 09 | `pr/09-remove-clutch` | 刪絕地救援、大貼紙只給旋轉 | 12 語系刪鍵 | 小 |
| 10 | `pr/10-lazy-modules` | 音效引擎、juice、貓舞台延後載入 | 門面設計、排隊 300 ms | 中 |
| 11 | `pr/11-atlas-json-fx-bake` | 座標表拆到各圖集旁、fx 離線烘焙、死亡特效改溫和 | 兩件事可再拆：圖集 json／死亡特效 | 中 |
| 12 | `pr/12-flow-beats` | 流程狀態機、節拍、無按鈕浮層、金幣入帳（含 flow／beat 測試） | 純函式測試、瀏覽器驗證腳本 | 中大 |
| 13 | `pr/13-hazards-all-ages` | 石頭、蝴蝶 | 12 語系字、palette 色 | 小 |
| 14 | `pr/14-economy` | 金幣來源與物價、shop_want／shop_buy 遙測（含伺服端驗證表） | 數字是第一版 | 小 |
| 15 | `pr/15-themes` | 主題資料包、組合包、系列關卡（含音效替換表留空那筆併進來） | 資料包結構、存檔相容、關卡號 91+ | 中大 |
| 16 | `pr/16-perf-tools-docs` | tools/perf 腳本、docs（PLAN、PRODUCT、REVIEW） | 不含程式 | 中（純文件） |
| 17 | `pr/17-cleanup` | 第一節的收尾（過期測試與文件、devenv、`__game` 掛鉤門控） | 刪東西為主 | 小 |

每個 PR 的說明固定格式：**理由**（使用者指示或 REVIEW 條目）、**改了什麼**、**依據**（量測數字、測試）、**涉及檔案**、**驗證**（`bun run check` 與對應的 tools/perf 腳本與截圖）、**風險與沒做的**。一個 PR 只做一件事；格式化、改名、搬檔不跟行為改動混；測試跟行為在同一個 PR。

## 五、文字規格與自我審閱（2026-10-30 使用者定）

- **Issue 與 PR 的文字**：精簡、技術散文、**英式英語**、結構化、完全不廢話、只有事實。PR 說明附完整證據鏈：量測數字與取得方式、來源（REVIEW 條目、使用者指示、外部文獻）、必要的說明、決策理由（為什麼這樣不那樣）。標題與章節名固定（見第四節模板），用詞一致（renderer、atlas、batch、stem）。
- **自我審閱**：每一批切完後，用審閱者的身分把該批每個 PR 從頭讀一次（`/code-review` 或人工），檢查：一個 PR 一件事、diff 裡沒有無關改動、說明與 diff 一致、驗證指令真的跑過並貼結果、機械 PR 真的只是機械。自審結果寫在批 issue 的草稿裡（`docs/pr/<batch>.md`），修完才算該批完成。
- **已完成的收尾**：bun.lock 進版控、刪 feat-dist、`__game` 掛鉤門控（含 tools/perf 帶 `?debug=1`）、devenv 改 Bun 版並進版控（`devenv shell -- bun --version` 1.4.4）。**還沒做**：四支 smoke JSON（smoke-i18n、smoke-mobile、smoke-desktop、smoke-stars 的結算步驟）、README（14 處 three.js／npm）、DEVNOTES 的「檔案」「驗證」「大小」三節（其餘玩法、操作、手感清單仍正確）。

## 四、從對方（審閱者）的角度安排（2026-10-30）

對方的處境：他寫了上游那套 three.js 版，熟它的每個檔案；他沒看過我們的重寫；他要回答的問題永遠是四個——為什麼改、玩家會差在哪、風險在哪、我怎麼跑起來驗證。所以：

**1. 機制：批用整合分支，主幹永遠可跑**
- 每一批開一條整合分支 `batch/<X>`（從 `main` 分出）。批裡的每個 PR 都以 `batch/<X>` 為目標、以前一個 PR 的分支為基底（stacked），所以每個 PR 的 diff 只有自己那件事。
- 批裡全部核准後，最後一個 PR 是 `batch/<X> → main`（merge、不 squash），說明就是該批 issue 的摘要。這樣 `main` 在任何時刻都是可建置可跑的，單一 PR 又能各自審。
- 依賴 B 的批（C 系列）在 B 合進 `main` 之前，先以 `batch/B` 為基底開；B 合併後 GitHub 會自動改基底。

**2. 一個 issue 配一批 PR**
- 先開「總覽 issue」：兩個版本的計畫（CrazyGames 版定版、精緻版另做）、全部批的順序、每批預估審閱時間、建議的審閱節奏（一天一批 A，B 分一週）。
- 每批一個 issue，標題 `[批 B] 渲染器換成自寫 WebGL2 偽 3D`，內容固定八段：**背景與問題**（量測數字：填充 3.35→0.5 螢幕、下載 733→206 KB、核心 194→141 KB、冷啟動）；**目標與非目標**（明說 sim、關卡產生、存檔、i18n、遙測不動）；**設計摘要**（一張圖：資料流與模組）；**PR 清單**（checkbox，按審閱順序，每個標「機械」或「設計」與預估分鐘）；**怎麼審**（先看什麼、可以跳過什麼、改名用 GitHub 的 rename 偵測）；**怎麼驗證整批**（一鍵指令、預期輸出、截圖對照）；**相容性與風險**（存檔格式、CrazyGames SDK、裝置）；**完成定義**（整批合併後 `bun run check` 綠、截圖一致、效能數字達標）。
- 每個 PR 的第一行 `Part of #<issue>`，標籤 `batch:B`、`kind:mechanical`／`kind:design`。設計討論留在 issue，PR 只談這個 diff。
- 大批（B）先只開 issue、不開 PR，給對方一兩天表態（他可能有理由想留 three.js）；附一支可以本機跑的分支與一段 GIF，讓他先玩到再審。

**3. 順序（信任先建立，再談大改）**
1. 批 A1 存檔對帳 → A2 語言存檔 → A4 無盡結算小修 → A3 商店遙測（碰伺服端）：都是他認得的程式碼裡的真 bug，小、有測試、半天內合得完，順便把測試與 PR 說明的慣例定下來。
2. 批 A5 lint：機械，放在 B 之前讓 B 的 diff 乾淨。
3. 批 B 地基：分段貼標籤——B-工具鏈 → B-TS 化 → B-渲染器 → B-烘焙與素材 → B-接線 → B-刪除 → B-開機。TS 化拆成「純改名 .js→.ts、0 行內容變更」一個 PR（GitHub 顯示為 rename，一分鐘審完）＋ 每檔一個「型別標註、行為不變、測試綠」PR。渲染器由下往上：gl → atlas → palette／paint → view → level／character／fx → portraits／cat-stage，每個 PR 說「這一層只依賴上面已審的層」。
4. 批 C1 門檻 → C2 流程 → C3 障礙物 → C4 經濟 → C5 主題 → C6 門控：依賴越來越多、玩家可見的改變越來越大，順序照此；每批 issue 附 `tools/perf` 腳本的截圖與數字當「玩家會差在哪」的證據。
5. 批 E devenv（選配）與跨批的文件（PRODUCT.md 願景）最後；各批自己的文件（REVIEW 條目、PLAN 段落）放在該批裡，不集中。

**4. 單一 PR 的說明模板**
- 標題：`[批 B 18/40] render: gl.ts——WebGL2 精靈批次渲染器`（批、序號、範圍、一句話）。
- 內文：`Part of #N` → **一句話**（做了什麼）→ **為什麼**（指向 issue 的哪一條或哪個量測）→ **改了什麼**（三到六點）→ **怎麼審**（看哪裡、不用看哪裡、建議順序、預估時間；機械 PR 寫「可用 rename 檢視一次看完」）→ **怎麼驗證**（指令、預期輸出；有畫面就附截圖或 GIF）→ **風險與相容性**（存檔、平台、效能）→ **刻意不做**（留給哪個 PR）→ **依賴**（基底 PR）。
- 規矩：一個 PR 一件事；不混格式化；不混改名與修改；測試與行為同 PR；機械 PR 要能被對方在兩分鐘內確認「只是機械」；設計 PR 要有一張圖或一段五句話的設計說明。

**5. 對方可能的反對與我們的準備**
- 「為什麼不留 three.js 只優化」：issue 裡放上游版在手機的量測（每幀 141 ms、下載 733 KB）與我們試過的中間方案，說明是結構問題不是調參。
- 「圖集二進位我沒法審」：烘焙工具在 B-28／29，說明「跑 `bun tools/bake/run.mjs` 會得到同一份」，附雜湊。
- 「40 個 PR 太多」：issue 的 PR 清單標了機械／設計與分鐘數，機械的加總不到一小時；他也可以只審設計的十個。

## 三、怎麼在本機做（jj）

1. `jj new origin/main` 開一條新線；用 `jj restore --from <migrate> <paths…>` 把 migrate 的檔案分三批拉進來（01 工具鏈＋TS、02 渲染器與圖集、03 切換），每批 `bun run check`（01 要讓舊 main.js 還能建置，tsconfig 暫開 allowJs）。
2. 其餘 18 個提交用 `jj rebase -s <first> -d <03>` 整段疊上去，再把「docs」與「theme 音效留空」那幾個 squash 進所屬 PR，每個提交打 `pr/NN-*` 書籤。
3. 每個書籤跑一次 `bun run check` 與對應驗證腳本，截圖存 `tools/perf/shots/`（不進版本控制），數字寫進 PR 說明草稿 `docs/pr/NN.md`。
4. 全部綠了再整理 `docs/PR-PLAN.md` 成最終版；推送要等使用者說。

預估：拆 migrate 與逐個驗證約一個會話；收尾清單半個會話。
