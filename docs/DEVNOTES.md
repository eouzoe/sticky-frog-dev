# STICKY FROG 開發筆記

> 這份是開發過程的筆記（手感清單、設計決定的原因、驗證方式），部分段落記的是當時的狀態。遊戲現況以根目錄的 [README](../README.md) 為準。

**一句話賣點**：按住，青蛙的長舌頭黏上鉤點；放開，帶著擺盪的動量飛出去——空中翻滾賺分、順便吃蒼蠅，一路不碰水衝上終點荷葉。

## 語言

介面支援 12 種語言（`src/lang/` 每種一個檔，清單與順序在 `src/i18n.ts` 的 `LANGS`）：English（en）、Español（es）、Português BR（pt）、Français（fr）、Deutsch（de）、Türkçe（tr）、Русский（ru）、日本語（ja）、한국어（ko）、Indonesia（id）、繁體中文（zh-Hant）、简体中文（zh-Hans）。偵測順序：`?lang=` > 玩家自選 > CrazyGames locale > 瀏覽器語言 > English；檢查用 `bun tests/i18n-check.mjs`。

## 玩法

- 側視 2.5D（青蛙只在 XY 平面動，世界是偽 3D：原版 GLB 離線烘焙成精靈圖集，執行時用透視投影＋固定深度的視差捲軸層）。美術是「軟膠公仔」：亮面糖果色、邊緣光、黑亮大眼、圓滾滾（Blender 做的 GLB，來源 `hook-hero-art` d0f791d，只在 `tools/bake/` 用）。
- **按住**：舌頭射向前方最近的鉤點花（目標會先出現白色光環），黏住後做單擺；按住期間舌頭會慢慢收短「打氣」，越擺越快。
- **放開**：帶著擺盪的速度飛出去，並依速度自動翻滾；轉滿一圈＝FLIP，兩圈 DOUBLE、三圈 TRIPLE FLIP（慢動作＋FOV 推近＝招牌時刻）。
- 蒼蠅靠近時舌頭自動舔掉；穿過金色圈圈加分＋慢動作；彈跳蘑菇把你彈回空中；風扇往上吹；尖刺球、鋸片碰到就失敗；掉進水（糖漿、霓虹運河、岩漿）＝失敗，0.5 秒內從頭重來。
- 落在終點大荷葉上＝過關（後面有一面大葉子牆擋住飛過頭的青蛙）。

## 操作

| 平台 | 操作 |
|---|---|
| 桌機 | 按住滑鼠左鍵或 Space（↑、W、→、D 也可以）；Esc／P 暫停；R 重來 |
| 手機 | 按住螢幕任何位置；右上角 56px 暫停鈕 |

一個按鍵就能玩完整款遊戲。過關後有結算畫面（三星，按 NEXT 進下一關）；無盡模式結算 Space／Enter／點一下＝再一局。手機第一次玩時，螢幕下方有手指教學（HOLD／LET GO!）。

## 核心循環

選關（或直接 PLAY 最新一關）→ 15–40 秒的短關卡（擺盪、翻滾、吃蒼蠅；**金幣即時入帳**，HUD 右上角跳動）→ 落上荷葉 → 1.6 秒慶祝（慢動作＋彩帶＋CLEAR! +25）→ 結算畫面（三星、停住等玩家按下一關）。第二輪一度拿掉結算改成自動進下一關，2026-10-26 使用者決定完整加回。

- 90 關，每 15 關換一個世界：JUNGLE → CANDY → NEON CITY → VOLCANO → FROSTBITE PEAKS → SUNSET DUNES（色盤、天空、水、背景道具、障礙外觀全換；冰峰有極光帶與浮冰，音樂 84 bpm D 小調鈴音；夕陽沙丘有大太陽、砂岩平頂山／仙人掌／棕櫚，死亡地面是會轉的流沙，音樂 100 bpm 降 B 弗里吉安屬音階撥弦）。**滑沙**（76 關起，`lv.dunes`，`src/sim.ts` `duneH`）：落在沙丘上不會死，沿坡面往前的速度至少 `DUNE_FLOOR`，尾端 lip 用 `DUNE_LIP_FLOOR` 把青蛙往前上方拋起，背坡也往前上方拋；沙面上一排金圈（`ring.trail`，每片最多 8 個）引路；沙丘只是安全網，拿掉也過得了（`tests/dune-check.mjs --nodune`）。61 關以後 `diff` 每世界 0.45→0.85，節奏表在 `src/level.ts` `PLAN`，種子用 `tests/salt-search.mjs` 篩。
- 新元素依序解鎖：蘑菇（第 3 關）、蒼蠅串（4）、圈圈（5）、移動鉤點（6）、低處尖刺（8）、連續蘑菇（9）、風扇（11）、雙圈（12）、鋸片（14）、高處尖刺（20）、上下夾擊（24）。
- **無盡模式**（破 1-5 解鎖）：同一個段落產生器無限往後接，難度隨距離上升（上限＝第 60 關），每 450 單位換一個世界（閃光＋世界名）。分數＝距離 × 10 ＋ 翻滾、蒼蠅、圈圈等分數；死了就結算（距離、分數、最佳、本機名次）。
- **成就＝當下的捧場**（`src/feats.ts`）：SPIN DOCTOR（一次滯空 7 圈）與 FROGNADO（10 圈）用大貼紙＋一句話＋金幣，NONSTOP（整關幾乎沒停滯）、SPEED DEMON（超快通關）、WAVE KISSER（擦過水面又飛回去）、CLOSE SHAVE（擦過石頭／蝴蝶）在角色旁簡單跳字。門檻刻意偏嚴（使用者：常跳就廉價），選單皇冠鈕「MY HIGHLIGHTS」看第一次達成日期、最佳數值、次數＋無盡前 10 名。
- **商店**三個分頁：HEROES（看板角色 Spinny Cat 300 置頂、9 隻青蛙、Vine Ape 650、Silk Frog 900；買角色送招牌舌頭）、TONGUES（Frog Tongue、Yarn 180、Jungle Vine 260、Silk Thread 340：顏色、粗細、材質貼圖、捲曲、舌尖大小、黏上時的粒子都不同）、TRAILS。貓、猿人、蛛絲青蛙現在是青蛙換色佔位，模型等美術線。
- **選單沒有離開鈕**；退回選單時最顯眼的黃色鈕推「下一步」：新模式 → 新世界 → 買得起的東西（商店裡那件會發光標 CAN BUY）。買完跳「立即試玩」直接帶新造型進遊戲。
- **排行榜**：CrazyGames SDK v3 有 `user.submitScore`（只開放受邀遊戲、金鑰在 Developer Portal、榜單由平台在遊戲外顯示），接在 `src/leaderboard.ts`；`src/config.ts` 的 `LB_KEY` 填金鑰就開始送無盡分數，空字串＝只存本機前 10 名。
- 廣告：目前不接（Basic Launch 期間平台不放廣告）。Full Launch 時再依 docs.crazygames.com/sdk/video-ads 加回。

## 手感清單（18 項，全做）

| # | 項目 | 做在哪 |
|---|---|---|
| 1 | 創傷值式畫面震動（平方曲線、衰減、含微旋轉；**分級**：高頻小事件取 max、大事件累加；強度 `SHAKE_SCALE`、衰減 `SHAKE_DECAY`） | `src/render/fx.ts` `shake`／`addTrauma`；`src/juice.ts` 各事件配方 |
| 2 | Hit-stop（蘑菇 45 ms、落水 60 ms、尖刺 110 ms） | `src/main.ts` `G.hitStop` |
| 3 | 慢動作（TRIPLE FLIP、穿圈、落荷葉；timeScale 漸變） | `src/main.ts` `slowmo()`、`frame()` |
| 4 | 擠壓伸展（起跳、黏住、放開、彈跳、撞牆、落地；沿速度方向） | `src/render/character.ts` `squash()`／`jelly()` |
| 5 | 粒子爆發（軟膠語彙：亮面糖果碎片、圓角彩紙、圓潤閃星、泡泡、3D 金幣；物件池＋一個批次；7 圈翻滾有天上彩紙雨） | `src/render/fx.ts` `burst()`、`src/juice.ts` |
| 6 | 跳字（7 圈以上的翻轉、RING!、CLOSE CALL、正中紅心，彈出縮放；門檻偏嚴） | `src/ui.ts` `popup()`、`index.html` `.pp` |
| 7 | 連擊（2.8 秒內沒新動作就斷；音高、字級、倍率隨連擊升高） | `src/main.ts` `addCombo()`、`src/audio-engine.ts` flip／attach |
| 8 | 鏡頭：平滑跟隨＋速度前瞻＋隨速度拉遠＋放開時 FOV 衝擊＋慢動作推近 | `src/main.ts` `render()` |
| 9 | 死亡閃白、大事件全螢幕閃光 | `src/ui.ts` `flash()` |
| 10 | 速度拖尾緞帶＋高速速度線 | `src/render/fx.ts` trail／lines |
| 11 | 果凍衝擊環（圓管、衝過頭回彈；可延遲連發，7 圈翻滾四圈彩色） | `src/render/fx.ts` `shock()` |
| 12 | 每個動作都有音效（多層合成、音高隨機 ±7%） | `src/audio-engine.ts` `play()` |
| 13 | 程序音樂循環（每世界不同調）＋大時刻 ducking | `src/audio-engine.ts` `startMusic()`／`duckMusic()` |
| 14 | UI 動畫（按鈕 hover／按下彈跳、面板 overshoot 彈入、成就大字彈入、HUD 金幣飛到才跳、無盡距離累加） | `index.html` CSS、`src/ui.ts` `feat()`／`hudCoins()`／`overDist()` |
| 15 | 預備動作（起跳前蹲 70 ms、舌頭射出前張嘴） | `src/sim.ts` `crouch`、`src/render/character.ts` |
| 16 | 待機動畫（呼吸、眨眼、鉤點花旋轉搖擺、蒼蠅嗡嗡、水面波浪、旗子飄） | `src/render/character.ts`、`src/render/level.ts`、`src/render/view.ts` |
| 17 | 手機震動（包 try） | `src/main.ts` `vibrate()` |
| 18 | 輕量後製（CSS 暈影；沒有全螢幕著色器 pass） | `index.html` `#vignette` |

另外：關卡進度條（含本關最遠紀錄標記）、死在 60% 之後跳「SO CLOSE! 87%」、擦過危險物「CLOSE CALL!」、每關開場大字標題、世界通關 `happytime`。

另外：舌頭是彈性緞帶（射出時抖動、黏上時舌尖「啵」放大、鉤點花彈簧晃動）、大眼睛瞳孔跟加速度晃、看向目標鉤點、快轉時縮成一團。

## 調參常數在哪

全部在 `src/config.ts`：`TUNE`（物理、舌頭、翻滾、分數、鏡頭、慢動作）、`WORLDS`（六個世界的色盤）、`SKINS`／`TONGUES`／`TRAILS`（價格、外觀）、`THEMES`（主題資料包：組合包價、道具與音效替換表）、`LB_KEY`。關卡產生在 `src/level.ts`（段落 `addSegment`、無盡 `createEndless`、主題系列關卡從第 91 關起）。成就門檻在 `src/feats.ts` `FEAT_T`；跳字門檻與金幣換算在 `src/main.ts` 檔頭（`FLIP_POP`、`CLOSE_GAP`、`COIN_PTS`、`CLEAR_COINS`、`PERFECT_COINS`）；一局結束的節拍秒數在 `src/beat.ts`；無盡解鎖關在 `src/save.ts` `ENDLESS_UNLOCK`。

## 檔案

- `src/sim.ts`：純物理（不依賴渲染器），可在 Node／Bun 跑。
- `src/level.ts`：90 關種子程序產生＋`SALT` 換種子表；主題系列關卡接在後面。
- `src/render/`：自寫 WebGL2 偽 3D——`gl.ts`（精靈批次、貼圖表、context lost 重建）、`atlas.ts`（圖集用到才載）、`view.ts`（鏡頭投影、天空、水面、固定深度的視差捲軸層）、`level.ts`（關卡物件）、`character.ts`（角色）、`fx.ts`（粒子）、`paint.ts`＋`palette.ts`（小形狀與世界色盤）、`portraits.ts`／`cat-stage.ts`（頭像與旋轉貓）。素材是 `tools/bake/` 離線烘焙的圖集（`src/art/atlas-*.webp`＋同名 json），原版 GLB 只在烘焙時用。
- `src/audio.ts`（門面）＋`src/audio-engine.ts`（WebAudio 合成，第一次手勢才載）。`src/ui.ts`：DOM 介面。`src/main.ts`：主迴圈與輸入；流程狀態機在 `src/flow.ts`、一局結束的節拍在 `src/beat.ts`；`src/juice.ts`：事件特效配方（選單出來後才載）。`src/cg.ts`：CrazyGames SDK 包裝。
- `tests/*-check.mjs`：`bun run check` 全跑（sim、endless、feats、save、flow、beat、i18n、telemetry、unlock、quality、pad、boost、burst、dune、ring-score）。`tests/smoke-*.json`：冒煙步驟（執行器不在 repo）。`tools/perf/`：Playwright 量測與驗證腳本（用法見 docs/PLAN.md）。

## 設計上改了什麼、為什麼

1. **舌頭黏上後會像橡皮筋縮回 8.5 單位**（`ROPE_REST`、`ELASTIC_RATE`）：原設計「舌頭長度＝黏上時的距離」，自動玩家實測遠距離黏住時擺盪最低點會沉進水裡，60 關只破 21 關。改成彈性縮回後，遠距離黏住＝被「咻」地拉過去，手感更彈、也不會莫名淹死。
2. **終點荷葉加寬（12 單位）＋後面一面大葉子牆**：原本荷葉 7 單位寬，大擺盪甩出去常直接飛過頭掉水裡（第 8 關自動玩家 12 組參數全滅都是這個原因）。終點應該是慶祝，不是考驗。
3. **鉤點最低高度拉到 10.5**：配合彈性舌頭，讓「擺盪最低點」離水面有餘裕；失敗多半來自放開時機，感覺是「我的錯」。
4. **部分關卡換種子**（`SALT`）：用自動玩家篩，前 10 關要求 12 組參數至少 5 組能破、11–30 關至少 3 組，避免早期就出現卡關。
5. **翻滾加快**（`SPIN_PER_SPEED` 0.52 → 0.85、`SPIN_MAX` 22）：原本每秒約 1 圈，兩個鉤點之間的滯空只有 0.7 秒，一般擺盪幾乎拿不到 FLIP，分數核心空掉。現在一般擺盪約 1 個 FLIP，衝向終點的大跳能 TRIPLE。
6. **重力 30 → 36、舌頭回彈長度 8.5 → 7.5**：擺盪週期 3.3 秒 → 約 2.9 秒，手感更脆；自動玩家實測可破比例 55% → 59%、平均過關時間 14.1 → 12.5 秒（12 組參數 × 60 關）。
7. **新增 CLOSE CALL**（擦過尖刺／鋸片 1 單位內）：+50 分＋短慢動作，讓「差一點」變成爽點而不只是驚嚇。
8. **鏡頭最低高度拉高**（`CAM_MIN_Y` 8.2）：原本畫面下半部全是水，鉤點上方的圈圈與鋸片會出框。
9. **死亡也算中斷**：死亡時 `gameplayStop`、0.5 秒後重生 `gameplayStart`（SPEC「復活」也是開始點）。
11. **踩到蘑菇頂＝固定的往前上方彈出**（`MUSH_VX`／`MUSH_VY`）：原本照圓頂法線反彈，落點靠運氣（自動玩家死因第一名是「蘑菇附近落水」），還會被斜面彈回頭。改成可預測後，玩家要練的是「落在蘑菇上」，連續蘑菇的間距剛好一跳，BOING BOING BOING 變成穩定的爽點；蘑菇也加寬（半徑 1.5 → 1.9）。
12. **多四種段落**：蒼蠅串（沿擺盪弧線，盪低才吃得到一整串）、連續蘑菇、雙圈（甩高連穿）、上下夾擊（尖刺上下各一）。後段關卡不再只是「鉤點＋一個障礙」重複。
13. **（第二輪改，之後又改回）結算畫面拿掉**：改成選單「下一步」推薦＋商店 CAN BUY 標記，把外層進度接回核心循環。
10. **新手提示用畫面上的小字**：第 1 關／前 6 次黏住前，目標鉤點旁顯示 HOLD、擺到前上方時在青蛙頭上顯示 RELEASE!，不用文字牆。

## 驗證

- `bun run check`：型別、oxlint、全部 `tests/*-check.mjs`（約 2–3 分鐘），任一失敗 exit 1。
- 瀏覽器驗證：`bun tools/perf/<腳本>.mjs <網址>`（flowcheck 一局結束流程、themecheck 主題資料包、hazards 障礙物、worlds 六世界截圖、bootmarks 開機量測……），截圖輸出到 `tools/perf/shots/`（不進版本控制）。正式建置要帶 `?debug=1` 才有 `window.__game`。
- 冒煙 JSON（`tests/smoke-*.json`）的執行器在原作者本機，不在 repo；桌機步驟用真實的 Space 按住／放開序列玩第 1 關，斷言黏上 ≥ 3 次、前進、分數 > 0；沒自然落地才用 `__game.forceWin()` 收尾。
- 巡覽截圖（非驗收）：`tests/tour-worlds.json`、`tests/tour-hazards.json`、`tests/tour-skins.json`（用 `__game.autoplay`／`__game.look()`）。
- 除錯掛鉤 `window.__game`（只在開發伺服器或 `?debug=1` 掛）：`state`、`flow`、`beat`、`level`、`score`、`attachesTotal`、`flips`、`bestFlip`、`maxX`、`deaths`、`fps`、`quality`、`result`、`levelResult`、`theme`；`start(n)`、`startEndless()`、`forceWin()`、`forceDie()`、`skip()`、`buySet(id)`、`look(skin, trail, tongue)`、`autoplay = [rel, grabVy]`、`camOverride`、`freeze`。

## 大小

核心 JS 約 142 KB（gzip 57 KB）；語系、音效引擎、手感回饋、貓舞台是各自的小檔，用到才載；圖集 webp 每張數十到數百 KB，依世界與造型用到才載；沒有 GLB、沒有字型檔以外的大檔。

## 已知問題

- 音效／音樂只在無頭瀏覽器跑過（無錯誤），沒有人耳試聽過音量平衡。
- 難度只用自動玩家驗證「可破」，後段關卡（40 關以後）對真人可能偏難，需要真人試玩調 `src/level.ts` 的間距與危險物高度。
- 失焦（點到 iframe 外）會自動暫停，這是刻意的。
