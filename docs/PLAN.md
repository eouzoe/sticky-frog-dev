# 接下來的計畫（2026-10-30 寫，給下一個會話接手）

讀這份之前先讀 `docs/PRODUCT.md`（定位、原則、主題設計）與 `docs/REVIEW-2026-10-30.md`（問題清單，標「已修」的不用再看）。

## 現況

- 工作資料夾 `/home/eouzoe/src/active/sticky-frog-2d`，jj 已 `git init --colocate`，**沒有推送、沒有開 PR**（使用者說可以之前禁止）。本機提交序列（舊→新）：
  1. migrate：three.js 3D → 自寫 WebGL2 偽 3D（177 檔）
  2. tooling：oxlint 進 check、oxfmt 只放設定
  3. docs：審查與產品方向
  4. render：背景改固定深度捲軸層、水天平塗、刪全螢幕著色器
  5. menu：首頁不畫世界裡起點那隻角色
  6. feel：跳字與成就門檻提高、進關卡前等世界圖集
  7. boot：開機量測點、內嵌腳本依存檔預抓
  8. feel：刪掉絕地救援、成就只有旋轉兩個用大貼紙
  9. boot：音效引擎／手感回饋／貓舞台用到才載
  10. boot：座標表拆到各圖集旁、小形狀離線烘焙；死亡特效改溫和
- 工作目錄裡未提交：`tools/perf/`（量測腳本，從會話暫存區搬進來的）、`.gitignore` 加了 `tools/perf/shots/`、這份 PLAN.md。要提交成「tools: 量測腳本」。
- `bun.lock` 被 `.git/info/exclude` 排除，沒進任何提交；要「處理好套件依賴」它該提交，等使用者決定。
- 伺服器：開發 `bun run dev`（5173）；正式版預覽要自己建：`VITE_WEB=1 bun x vite build --outDir <資料夾>` 再 `bun x vite preview --outDir <資料夾> --port 4180`（4173／4174 被別的 node 行程佔著）。
- 檢查：`bun run check`（型別、oxlint、13 項測試，約 2–3 分鐘）。oxfmt 先不套用（會重排 90/91 個檔案），重構逐檔重寫時再用。
- 已知過期但沒動的：`tests/feat-dist.mjs`（還提到 CLUTCH_*，不在 check 裡）、`docs/DEVNOTES.md`（three.js 時代）、`devenv.nix`（Node 24＋npm 的舊設定，應改成 Bun＋烘焙用的 Chrome／ffmpeg／yt-dlp）。
- 量測：這台 WSL 機器常被別的行程佔滿（負載 5–12），開機時間要用 `tools/perf/loadab.mjs` 交錯比較、同輪相對值才可信；位元組與填充量是可靠指標。真機數字等使用者在 Brave 用 `?perf=1` 與 `performance.getEntriesByName('menu-ready')` 回報。

## 量測與驗證腳本（tools/perf/，都用 `bun tools/perf/<名字> <網址>`）

| 腳本 | 用途 |
|---|---|
| bootmarks.mjs | 開機各階段 performance.measure（新分頁、暖機後）；參數 `gpu|swift` 與 CPU 降速倍數 |
| loadab.mjs | 多個建置資料夾交錯比較 menu-ready（`loadab.mjs A 10 dist1 dist2`） |
| loadtime.mjs | 單一建置、三種情境的開機時間 |
| playprof.mjs | 遊玩 CPU 取樣＋每幀四邊形數與填充面積（手機尺寸、CPU×4） |
| prodcheck.mjs | 正式版健康：錯誤、長任務、rAF 間隔；`gpu|swift|nogl` |
| rafcheck.mjs | 開機後 rAF 有沒有在跑、第二次載入是否暖 |
| worlds.mjs | 六個世界各截一張遊玩畫面＋貼圖常駐量 |
| fixcheck.mjs | SDK 晚到的存檔合併、強制 GL context 掉再恢復 |
| worldgate.mjs | 開關卡前等世界圖集、預抓下一世界 |
| sfxlevels.mjs | 每個音效的短期響度（K 加權近似） |
| diefx.mjs | 真的撞尖刺的死亡特效截圖 |
| catlooks.mjs | 旋轉貓三種質感的截圖（?catlook=） |
| perf-both.mjs | 原版 3D 與新版的整體量測（比較用） |

WSL 真 GPU：Chrome 參數 `--use-gl=angle --use-angle=gles-egl`，環境變數 `GALLIUM_DRIVER=d3d12 LD_LIBRARY_PATH=/usr/lib/wsl/lib`；SwiftShader 第一次建環境要 1 秒以上，不能拿來量。
nushell 坑：`open --raw f | ... | save -f f` 會先截斷再讀，檔案會被清空；要寫到暫存檔再 cp。

## 第一步：流程重做（下一個會話從這裡開始）

目標（使用者定案）：關卡結束**沒有任何按鈕**，顯示星星與金幣後無條件進下一關；顯示要短而刻意，分「豪爽」與「可惜再來」兩套固定節拍；廣告不放關與關之間；主線與無盡統一成一個流；金幣入帳要有「距離感」。

### 設計

- **狀態機顯式化**：新檔 `src/flow.ts`，純函式 `transition(state, action) → state`，狀態：`boot → menu → playing → dying → cleared → playing(下一關)`；無盡：`playing → dying → over → playing(新一局)`。把現在藏在 `restartT／winT／overT` 的計時子狀態收進這裡；無盡模式「死亡 0.8 s 內重來不結算」的 bug 在進 `dying` 時就結算，自然消失。
- **節拍表**：新檔 `src/beat.ts`，時間固定（剪影片才一致），任何點擊可提前：
  - 豪爽（3 星，或新紀錄）：落地定格 0.25 s → 星星一顆顆亮（間隔 0.18 s，各一聲）→ 金幣噴出、懸空 0.25 s、飛向左上角計數器（0.5 s）→ 停 0.6 s → 下一關。約 2.0 s。
  - 可惜（1–2 星）：落地定格 0.2 s → 星星（缺的那顆暗著）→ 短停 0.4 s → 下一關。約 1.4 s。
  - 無盡死亡：定格 → 距離與分數浮出 → 倒數 1.5 s 自動再來一局（可點擊提前）。
- **結算畫面變成不擋輸入的浮層**：星星、金幣數、「NEW BEST」，沒有按鈕；下一關的鉤子已經在畫面上，一按就走。「回選單」留在暫停選單。
- **金幣入帳**：遊戲中取得時在世界座標噴出 → 懸空 → 用 `view.project` 換到螢幕座標飛向 HUD 計數器 → 到達那一刻數字才跳（現有 `coinFly`、`hudCoins` 改造）。
- **渲染只讀**：`render` 裡改模擬狀態的地方（過關時改角度速度、計時器推進）移到 update；暫停中 resize 重畫不會推進時間。
- 可順便抽出：計分 `reduce(run, event) → effects`（純函式，補測試）；不是必要。

### 檔案與測試

- 改：`src/main.ts`（狀態機與計時器拆出去）、`src/ui.ts`（result／over 改浮層；`show()` 裡的 8 次強制重排與進度鈕 `left` 改 `transform`）、`index.html`（result／over 區塊改小）、`src/juice.ts`（節拍對應的特效）。
- 新：`src/flow.ts`、`src/beat.ts`，各自 `tests/flow-check.mjs`、`tests/beat-check.mjs`（純函式，bun 跑）。
- 驗證：13 項測試＋新測試；`tools/perf/worlds.mjs` 截圖；手動試玩節拍。

## 第二步：主題資料包與旋轉貓組合包

照 `docs/PRODUCT.md` 的「主題與地圖」：

1. `src/config.ts` 加 `THEMES`（skin、tongue、trail、sfx、props、levels、price、sale）；引擎不認識特定主題。
2. 存檔：`theme`（套用中的主題）、`owned` 沿用；`mergeSave` 跟著處理。
3. 道具替換：`render/level.ts` 的 `wf(key)` 查主題替換表（`props.fly → fish`、`props.start → catTower`、`props.pad → cushion`）；障礙物 `props.spike／props.saw` 也走這條（全年齡替換在美術那步做）。
4. 音效組：`audio.ts` 門面加 `setTheme(map)`，`play(name)` 先查替換。
5. 商店：最上面組合包卡（價格、限時特價倒數、「套用整套」）；單品照舊；集齊後也能一鍵套用。廣告購買留位置。
6. 系列關卡：選關頁多一個主題分頁，用現有產生器＋主題道具；擁有主題才解鎖。
7. 素材：小魚乾、貓跳台或貓窩、軟墊荷葉、毛線拖尾、音效組。畫法跟美術方向一起決定（見第三步），可先用 paint.ts 畫佔位。
8. 量測：每個「想買但不夠」的瞬間、試用、購買都進遙測。

## 第三步：美術方向與全年齡替換

- 先定方向（使用者要決定）：傾向向量卡通（跟介面同一種語言），SVG 離線光柵成圖集。
- 決定後一起做：背景層的構圖設計（現在只是原零件隨機擺放）、障礙物換成石頭／蝴蝶、主角零件、主題素材。
- 烘焙拆開背景零件與道具後，世界圖集只留道具，貼圖常駐可從約 12 MB 降回 8 MB 以下。

## 其餘開機項目（划算順序）

1. `boot:ui`（4× 降速約 114 ms）：i18n 只套可見畫面、`fit()` 只量可見元素、商店與結算畫面延後建構（第一步會重寫結算，順便）。
2. 重複造訪：Service Worker（CrazyGames iframe 能不能用待驗證）、字型檔名加雜湊；首訪在往返 > 60 ms 的網路物理上到不了 0.3 秒。
3. 商店畫面拆成動態載入（第二步重寫時順便）。
4. 開機時 GPU 第一幀的等待是真實成本，載入畫面已經用 fence 等它；真機上看 `boot:fence` 多長再決定要不要縮第一幀的貼圖量。

## 之後（不在第一版）

回放錄製（種子＋輸入進存檔）、導出 MP4、內建剪輯、批量剪輯工具、社交——見 `docs/PRODUCT.md` 第二階段。回放的地基（錄製格式、離屏任意解析度渲染、鏡頭可腳本）要在第一步重構時留好接口。
