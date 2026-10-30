# 接下來的計畫（2026-10-30 寫，給下一個會話接手）

> **2026-10-30 晚的轉向（先讀這段）**：美術定案為 Alto's Odyssey 式剪影（角色也剪影、旋轉貓照片刻意突兀保留），調性從 CrazyGames 網頁小遊戲改成精緻獨立小遊戲，玩法與概念不變、流程拉長、地圖變大、可能加故事章節——細節在 `docs/PRODUCT.md`「定位改變」。這個資料夾（sticky-frog-2d）的版本已定檔為 jj 書籤 `mvp-crazygames`，之後不動；新美術在 `/home/eouzoe/src/active/sticky-frog-indie`（整個資料夾複製過去，含 jj 歷史）開始做。下面第三步的「方向等使用者決定」已經決定了；其餘內容（流程、主題資料包、量測腳本）兩邊共用。

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
  11. tools：量測腳本進 tools/perf、這份 PLAN.md
  12. flow：一局結束改成固定節拍的浮層、無按鈕自動下一關、金幣飛到才入帳（第一步，見下）
  13. docs：PLAN／REVIEW 更新、flowcheck 驗證腳本
- `bun.lock` 被 `.git/info/exclude` 排除，沒進任何提交；要「處理好套件依賴」它該提交，等使用者決定。
- 伺服器：開發 `bun run dev`（5173）；正式版預覽要自己建：`VITE_WEB=1 bun x vite build --outDir <資料夾>` 再 `bun x vite preview --outDir <資料夾> --port 4181`（4173／4174 被別的 node 行程佔著；4180 是流程重做之前的建置，留著對照）。
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
| flowcheck.mjs | 一局結束的流程在瀏覽器裡走一遍（22 項：節拍、星星、金幣入帳、死亡重生、點擊提前、暫停繼續、無盡倒數）＋截圖 flow-*.png |

WSL 真 GPU：Chrome 參數 `--use-gl=angle --use-angle=gles-egl`，環境變數 `GALLIUM_DRIVER=d3d12 LD_LIBRARY_PATH=/usr/lib/wsl/lib`；SwiftShader 第一次建環境要 1 秒以上，不能拿來量。
nushell 坑：`open --raw f | ... | save -f f` 會先截斷再讀，檔案會被清空；要寫到暫存檔再 cp。

## 第一步：流程重做（已做，2026-10-30；等使用者試玩）

目標（使用者定案）：關卡結束**沒有任何按鈕**，顯示星星與金幣後無條件進下一關；顯示要短而刻意，分「豪爽」與「可惜再來」兩套固定節拍；廣告不放關與關之間；主線與無盡統一成一個流；金幣入帳要有「距離感」。

### 做出來的樣子（試玩時看這些）

- 落荷葉：貼紙（LEVEL CLEAR!／PERFECT!／WORLD CLEAR!）→ 三顆星依序亮，星下寫依據（關卡、蒼蠅 n/m、時間/標準）；沒拿到的那顆留暗 → 金幣晶片 +N 出現、金幣從角色身上噴出、懸空、飛到右上角計數器，數字到達那一刻才跳 → NEW BEST 貼紙（有的話）→ 直接下一關。沒有任何按鈕；第三顆星亮了之後點畫面或按 Enter／Space／R 可提前。
- 主線死亡：0.5 s 定格（0.25 s 後可點擊提前）→ 從最後落地的荷葉重生。
- 無盡死亡：RUN OVER → 距離數上來 → 分數與最佳 → 倒數條 1.5 s → 自動新一局；點擊或 R 提前。新紀錄、本機榜、遙測在死亡那一刻就記，舊的「0.8 s 內重來不結算」bug 消失。
- 一局之內任何時候（含上面三種節拍中）Esc／P 或暫停鈕都能暫停；暫停面板蓋住浮層，繼續時節拍接著播。回選單只在暫停選單。
- 遊戲中拿到的金幣（每 100 分、成就）也走噴出 → 懸空 0.35 s → 飛入；大貼紙成就的金幣從貼紙上的 +N 飛入。存檔永遠立刻加，HUD 顯示「存檔 − 飛行中」。
- 預覽：`http://localhost:4181/`（正式建置）、`http://localhost:5173/`（開發）；4180 是改之前的版本可對照。

### 實作（要改節拍或流程時看這裡）

- `src/flow.ts`：`transition(flow, action)` 純函式，狀態 boot／menu／levels／shop／records／playing／paused／dying／cleared／over，flow 帶 endless／last／prev。main.ts 所有狀態改變都走 `dispatch(action)`，不合法就忽略（死亡中再撞、過關中再死、開機前開關、暫停中點畫面都擋掉）。
- `src/beat.ts`：`clearBeat(stars, newBest)`（豪爽 2.0 s：定格 0.25 → 星 0.25/0.43/0.61 → 噴出 0.79 → 飛入 1.04 → NEW BEST 1.54 → 結束 2.04；可惜 1.4 s：定格 0.2 → 星 → 飛入 0.71 → 結束 1.41）、`overBeat()`（距離 0.25、分數 0.5、倒數 0.8 起 1.5 s）、`dyingBeat(0.5)`。`fired(b, t0, t1)` 取這一幀跨過的提示點；時間用真實秒（慢動作不影響），每幀最多推 0.1 s（幀卡住節拍就慢）。
- `src/main.ts`：`startBeat／tickBeat／skipBeat／endBeat／onCue`；`updateRun()` 取代 updatePlaying（一局之內每幀）；`addCoins(n, fly)`、`flyCoins`、`lander`、`tickCoins`、`G.coinsInFlight`；`beginRun()` 開局前清上一局；render() 不再改模擬（過關後轉正、停下在 updateRun）。
- `src/ui.ts`：`clearShow／clearStar／clearCoins／clearBest／clearHide`、`overShow／overDist／overScore／overCountdown／overHide`；`coinFly` 回 boolean；`feat()` 多 onLand。`show('pause')` 不收浮層。
- `index.html`：`#result`／`#over` 畫面刪掉，`#clear`／`#over` 是浮層（pointer-events none、z-index 4、暫停時 visibility hidden）。
- 語系：刪 result.level／cleared／flies／score／coins／next／retry／menu、over.flips／rank／menu／retry、clear.clear／perfect（12 檔）。
- 測試：tests/flow-check.mjs、tests/beat-check.mjs 進 check（15 項）；tools/perf/flowcheck.mjs 跑真瀏覽器。
- 過期沒動：tests/smoke-*.json 還在等 `#result`／`ui.showResult`（執行器不在 repo、不在 check 裡）。
- 沒做：計分抽成 reduce(run, event)（原本就標非必要）；回放地基（錄製格式、離屏渲染）還沒留接口，第二階段再說。

### 原設計（留做對照）

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

## 插隊做掉的（2026-10-30，使用者點名）

- **障礙物全年齡**（提交 `art:`）：尖刺→石頭（立在石柱上或垂下來晃）、鋸片→蝴蝶（沿軌道拍翅）。模擬、關卡產生、事件 id 都不動；圖在 `src/render/paint.ts`（rock／bfly0／bfly1，灰階基底，`palette.ts` 每世界 rock／bfly 色）、字在 12 個語系檔（NEW 字卡、擦邊球）、撞到的聲音改軟。截圖：`bun tools/perf/hazards.mjs`。正式素材等美術方向定了再換。
- **金幣變珍貴**（提交 `economy:`）：每 500 分 1 枚（原 100）、過關 3 枚＋三星 3 枚（原 25）、成就 5–15 枚（原 20–60）；物價 ×0.4（貓 120、組合包 220／特價 160）。商店「想買但不夠」與「買了」進遙測（shop_want／shop_buy，收資料端驗證表同步）。這些數字是第一版猜的，等遙測回來再調。

## 第二步：主題資料包與旋轉貓組合包（已做，2026-10-30；等使用者試玩）

做出來的樣子：商店最上面是「整套組合」卡（特價 160、原價 220 劃掉、48 小時倒數從第一次開商店算）；買了＝貓、毛線舌、毛線拖尾、系列 10 關全部到手並一鍵套用；單品照舊在分頁裡買，集齊也算擁有整套（卡變「套用整套」）；套用中＝「裝備中」。套用主題後：起點是貓跳台、終點是軟墊、蒼蠅是小魚乾、黏住「喵」、吃到「鈴」。選關頁最後一張是「★ Spinny Cat」卡，擁有才開，10 關標 ★-1…★-10，難度對應主線中段，最後一關過了回選單。
實作：`src/config.ts` THEMES（資料包）、`save.theme／saleAt`、`level.ts` isThemeLevel／THEME_WORLD（關卡號 91 起）、`view.wf` 查替換表、`lvView.setTheme`（蒼蠅整張換）、`A.setTheme`（音效替換）、`main.ts` shopSet／applyTheme、`ui.ts` renderShop 展示台與 renderLevels 主題卡。素材是 `paint.ts` 的向量佔位（fish／catTower／cushion），正式素材跟美術方向一起換。驗證：`bun tools/perf/themecheck.mjs`。
沒做：看廣告試用／廣告購買（等有廣告）、第二個主題（人猿、蛛絲）——資料包結構已經在，加一筆 THEMES 與素材就好。
**使用者追加（2026-10-30）**：主題音效不另做（sfx 替換表留空，引擎裡的喵、鈴已刪）。**系列關卡不能只是森林換道具**：要是全新的世界（背景、主題、氛圍整個換）＋內容特別設計的關卡（手工排的段落，不是產生器隨機）。方向：貓的客廳——毛線球鉤點從天花板垂下、軟墊當荷葉、紙箱當彈跳蘑菇、盆栽小黃瓜當石頭、掃地機器人沿軌道當蝴蝶、泡泡浴缸當水；示意圖在美術那一輪。做法：THEMES 加 `world`（主題自己的背景層與配色，跟六個世界同一套捲軸層機制）與 `levels: PlanEntry[]`（每關手寫段落表，走 `addSegment` 的 force 機制擴充成可以指定順序與位置）。等美術方向定了跟素材一起做。

原計畫（留做對照）照 `docs/PRODUCT.md` 的「主題與地圖」：

1. `src/config.ts` 加 `THEMES`（skin、tongue、trail、sfx、props、levels、price、sale）；引擎不認識特定主題。
2. 存檔：`theme`（套用中的主題）、`owned` 沿用；`mergeSave` 跟著處理。
3. 道具替換：`render/level.ts` 的 `wf(key)` 查主題替換表（`props.fly → fish`、`props.start → catTower`、`props.pad → cushion`）；障礙物 `props.spike／props.saw` 也走這條（全年齡替換在美術那步做）。
4. 音效組：`audio.ts` 門面加 `setTheme(map)`，`play(name)` 先查替換。
5. 商店：最上面組合包卡（價格、限時特價倒數、「套用整套」）；單品照舊；集齊後也能一鍵套用。廣告購買留位置。
6. 系列關卡：選關頁多一個主題分頁，用現有產生器＋主題道具；擁有主題才解鎖。
7. 素材：小魚乾、貓跳台或貓窩、軟墊荷葉、毛線拖尾、音效組。畫法跟美術方向一起決定（見第三步），可先用 paint.ts 畫佔位。
8. 量測：每個「想買但不夠」的瞬間、試用、購買都進遙測。

## 第三步：美術方向與全年齡替換（障礙物已換；方向等使用者決定）

- 先定方向（使用者要決定）：傾向向量卡通（跟介面同一種語言），SVG 離線光柵成圖集。石頭、蝴蝶、小魚乾、貓跳台、軟墊目前都是 `paint.ts` 畫的向量佔位，已經是這個方向的樣子，可以拿來判斷喜不喜歡。
- 決定後一起做：背景層的構圖設計（現在只是原零件隨機擺放）、主角零件、主題正式素材、佔位的障礙物與貓道具。
- 烘焙拆開背景零件與道具後，世界圖集只留道具，貼圖常駐可從約 12 MB 降回 8 MB 以下。

## 其餘開機項目（划算順序；2026-10-30 沒動，原因在括號）

（結算畫面已經刪掉，boot:ui 少了一塊；其餘三項都要真機或平台驗證才知道值不值：Service Worker 要在 CrazyGames 的 iframe 裡實測能不能註冊、boot:ui 的剩餘成本要用 `tools/perf/bootmarks.mjs` 在負載低的時候量過再動、商店拆分省的是幾 KB。等使用者在 Brave 用 `?perf=1` 回報 `boot:ui`／`boot:fence` 之後再排。）

1. `boot:ui`（4× 降速約 114 ms）：i18n 只套可見畫面、`fit()` 只量可見元素、商店畫面延後建構。
2. 重複造訪：Service Worker（CrazyGames iframe 能不能用待驗證）、字型檔名加雜湊；首訪在往返 > 60 ms 的網路物理上到不了 0.3 秒。
3. 商店畫面拆成動態載入（第二步重寫時順便）。
4. 開機時 GPU 第一幀的等待是真實成本，載入畫面已經用 fence 等它；真機上看 `boot:fence` 多長再決定要不要縮第一幀的貼圖量。

## 之後（不在第一版）

回放錄製（種子＋輸入進存檔）、導出 MP4、內建剪輯、批量剪輯工具、社交——見 `docs/PRODUCT.md` 第二階段。回放的地基（錄製格式、離屏任意解析度渲染、鏡頭可腳本）要在第一步重構時留好接口。
