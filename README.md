# STICKY FROG

**一句話賣點**：按住，青蛙的長舌頭黏上鉤點；放開，帶著擺盪的動量飛出去——空中翻滾賺分、順便吃蒼蠅，一路不碰水衝上終點荷葉。

## 語言

介面支援 12 種語言（`src/lang/` 每種一個檔，清單與順序在 `src/i18n.js` 的 `LANGS`）：English（en）、Español（es）、Português BR（pt）、Français（fr）、Deutsch（de）、Türkçe（tr）、Русский（ru）、日本語（ja）、한국어（ko）、Indonesia（id）、繁體中文（zh-Hant）、简体中文（zh-Hans）。偵測順序：`?lang=` > 玩家自選 > CrazyGames locale > 瀏覽器語言 > English；檢查用 `node tests/i18n-check.mjs`。

## 玩法

- 側視 2.5D（青蛙只在 XY 平面動，世界是 3D＋景深視差）。美術是「軟膠公仔」：亮面糖果色、邊緣光、黑亮大眼、圓滾滾（Blender 做的 GLB，來源 `hook-hero-art` d0f791d）；低畫質自動換成 Lambert＋邊緣光的便宜材質。
- **按住**：舌頭射向前方最近的鉤點花（目標會先出現白色光環），黏住後做單擺；按住期間舌頭會慢慢收短「打氣」，越擺越快。
- **放開**：帶著擺盪的速度飛出去，並依速度自動翻滾；轉滿一圈＝FLIP，兩圈 DOUBLE、三圈 TRIPLE FLIP（慢動作＋FOV 推近＝招牌時刻）。
- 蒼蠅靠近時舌頭自動舔掉；穿過金色圈圈加分＋慢動作；彈跳蘑菇把你彈回空中；風扇往上吹；尖刺球、鋸片碰到就失敗；掉進水（糖漿、霓虹運河、岩漿）＝失敗，0.5 秒內從頭重來。
- 落在終點大荷葉上＝過關（後面有一面大葉子牆擋住飛過頭的青蛙）。

## 操作

| 平台 | 操作 |
|---|---|
| 桌機 | 按住滑鼠左鍵或 Space（↑、W、→、D 也可以）；Esc／P 暫停；R 重來 |
| 手機 | 按住螢幕任何位置；右上角 56px 暫停鈕 |

一個按鍵就能玩完整款遊戲。過關沒有結算畫面（自動進下一關）；無盡模式結算 Space／Enter／點一下＝再一局。手機第一次玩時，螢幕下方有手指教學（HOLD／LET GO!）。

## 核心循環

選關（或直接 PLAY 最新一關）→ 15–40 秒的短關卡（擺盪、翻滾、吃蒼蠅；**金幣即時入帳**，HUD 右上角跳動）→ 落上荷葉 → 1.6 秒慶祝（慢動作＋彩帶＋CLEAR! +25）→ **自動進下一關**（沒有結算畫面、沒有星星：使用者決定，星星不夠不會讓人重玩、只留遺憾，停頓會讓人離開）。

- 90 關，每 15 關換一個世界：JUNGLE → CANDY → NEON CITY → VOLCANO → FROSTBITE PEAKS → SUNSET DUNES（色盤、天空、水、背景道具、障礙外觀全換；冰峰有極光帶與浮冰，音樂 84 bpm D 小調鈴音；夕陽沙丘有大太陽、砂岩平頂山／仙人掌／棕櫚，死亡地面是暗酒紅流沙，音樂 100 bpm 降 B 弗里吉安屬音階撥弦）。**滑沙**（76 關起，`lv.dunes`，`src/sim.js` `duneH`）：落在沙丘上不會死，沿坡面往前的速度至少 `DUNE_FLOOR`，尾端上翹坡頂（lip）用 `DUNE_LIP_FLOOR` 把青蛙往前上方拋起；沙丘只是安全網／捷徑，拿掉也能過（`tests/dune-check.mjs --nodune`）。61 關以後 `diff` 每世界 0.45→0.85，節奏表在 `src/level.js` `PLAN`，種子用 `tests/salt-search.mjs` 篩。
- 新元素依序解鎖：蘑菇（第 3 關）、蒼蠅串（4）、圈圈（5）、移動鉤點（6）、低處尖刺（8）、連續蘑菇（9）、風扇（11）、雙圈（12）、鋸片（14）、高處尖刺（20）、上下夾擊（24）。
- **無盡模式**（破 1-5 解鎖）：同一個段落產生器無限往後接，難度隨距離上升（上限＝第 60 關），每 450 單位換一個世界（閃光＋世界名）。分數＝距離 × 10 ＋ 翻滾、蒼蠅、圈圈等分數；死了就結算（距離、分數、最佳、本機名次）。
- **成就＝當下的捧場**（`src/feats.js`）：做出很強的操作時畫面中上方跳出大字＋一句話＋金幣：SPIN DOCTOR（一次滯空 5 圈）、FROGNADO（7 圈）、NONSTOP（整關幾乎沒停滯）、SPEED DEMON（超快通關）、WAVE KISSER（擦過水面又飛回去）、CLOSE SHAVE（擦過尖刺／鋸片）、CLUTCH SAVE（快落水時黏住拉回）。門檻用自動玩家分布訂（一般玩法約 14% 的關卡出現一次），選單皇冠鈕「MY HIGHLIGHTS」看第一次達成日期、最佳數值、次數＋無盡前 10 名。
- **商店**三個分頁：HEROES（看板角色 Spinny Cat 300 置頂、9 隻青蛙、Vine Ape 650、Silk Frog 900；買角色送招牌舌頭）、TONGUES（Frog Tongue、Yarn 180、Jungle Vine 260、Silk Thread 340：顏色、粗細、材質貼圖、捲曲、舌尖大小、黏上時的粒子都不同）、TRAILS。貓、猿人、蛛絲青蛙現在是青蛙換色佔位，模型等美術線。
- **選單沒有離開鈕**；退回選單時最顯眼的黃色鈕推「下一步」：新模式 → 新世界 → 買得起的東西（商店裡那件會發光標 CAN BUY）。買完跳「立即試玩」直接帶新造型進遊戲。
- **排行榜**：CrazyGames SDK v3 有 `user.submitScore`（只開放受邀遊戲、金鑰在 Developer Portal、榜單由平台在遊戲外顯示），接在 `src/leaderboard.js`；`src/config.js` 的 `LB_KEY` 填金鑰就開始送無盡分數，空字串＝只存本機前 10 名。
- 廣告：每破 3 關在換關空檔插一次 midgame；無盡結算按再一局插 midgame；無盡結算每 3 局一次「看影片 ×2 這局金幣」。

## 手感清單（18 項，全做）

| # | 項目 | 做在哪 |
|---|---|---|
| 1 | 創傷值式畫面震動（平方曲線、衰減、含微旋轉；**分級**：高頻小事件取 max、大事件累加；強度 `SHAKE_SCALE`、衰減 `SHAKE_DECAY`） | `src/fx.js` `shake`／`addTrauma`；`src/juice.js` 各事件配方 |
| 2 | Hit-stop（蘑菇 45 ms、落水 60 ms、尖刺 110 ms） | `src/main.js` `G.hitStop` |
| 3 | 慢動作（TRIPLE FLIP、穿圈、落荷葉；timeScale 漸變） | `src/main.js` `slowmo()`、`frame()` |
| 4 | 擠壓伸展（起跳、黏住、放開、彈跳、撞牆、落地；沿速度方向） | `src/frog.js` `squash()`（三層 pivot 沿任意軸縮放） |
| 5 | 粒子爆發（軟膠語彙：亮面糖果碎片、圓角彩紙、圓潤閃星、泡泡、3D 金幣；物件池＋InstancedMesh；7 圈翻滾有天上彩紙雨） | `src/fx.js` `burst()`、`src/juice.js` |
| 6 | 跳字（FLIP!、+50、BOING!、RING!、TRIPLE FLIP!，彈出縮放） | `src/ui.js` `popup()`、`index.html` `.pp` |
| 7 | 連擊（2.8 秒內沒新動作就斷；音高、字級、倍率隨連擊升高） | `src/main.js` `addCombo()`、`src/audio.js` flip／attach |
| 8 | 鏡頭：平滑跟隨＋速度前瞻＋隨速度拉遠＋放開時 FOV 衝擊＋慢動作推近 | `src/main.js` `render()` |
| 9 | 死亡閃白、大事件全螢幕閃光 | `src/ui.js` `flash()` |
| 10 | 速度拖尾緞帶＋高速速度線 | `src/fx.js` trail／lines |
| 11 | 果凍衝擊環（圓管、衝過頭回彈；可延遲連發，7 圈翻滾四圈彩色） | `src/fx.js` `shock()` |
| 12 | 每個動作都有音效（多層合成、音高隨機 ±7%） | `src/audio.js` `play()` |
| 13 | 程序音樂循環（每世界不同調）＋大時刻 ducking | `src/audio.js` `startMusic()`／`duckMusic()` |
| 14 | UI 動畫（按鈕 hover／按下彈跳、面板 overshoot 彈入、成就大字彈入、HUD 金幣跳動、無盡距離累加） | `index.html` CSS、`src/ui.js` `feat()`／`hudCoins()`／`showOver()` |
| 15 | 預備動作（起跳前蹲 70 ms、舌頭射出前張嘴） | `src/sim.js` `crouch`、`src/frog.js` |
| 16 | 待機動畫（呼吸、眨眼、鉤點花旋轉搖擺、蒼蠅嗡嗡、水面波浪、旗子飄） | `src/frog.js`、`src/levelview.js`、`src/scene.js` |
| 17 | 手機震動（包 try） | `src/main.js` `vibrate()` |
| 18 | 輕量後製（CSS 暈影；受擊色差脈衝，只有脈衝時多一個 pass，低畫質自動關） | `index.html` `#vignette`、`src/scene.js` `render()` |

另外：關卡進度條（含本關最遠紀錄標記）、死在 60% 之後跳「SO CLOSE! 87%」、擦過危險物「CLOSE CALL!」、每關開場大字標題、世界通關 `happytime`。

另外：舌頭是彈性緞帶（射出時抖動、黏上時舌尖「啵」放大、鉤點花彈簧晃動）、大眼睛瞳孔跟加速度晃、看向目標鉤點、快轉時縮成一團。

## 調參常數在哪

全部在 `src/config.js`：`TUNE`（物理、舌頭、翻滾、分數、鏡頭、慢動作）、`WORLDS`（四個世界的色盤）、`SKINS`／`TONGUES`／`TRAILS`（價格、舌頭外觀）、`LB_KEY`。關卡產生在 `src/level.js`（段落 `addSegment`、無盡 `endlessDiff`／`ENDLESS_WORLD_LEN`）。成就門檻在 `src/feats.js` `FEAT_T`；換關廣告間隔、慶祝秒數、金幣換算在 `src/main.js` 檔頭（`MIDGAME_EVERY`、`CELEBRATE`、`COIN_PTS`、`CLEAR_COINS`）；無盡解鎖關在 `src/save.js` `ENDLESS_UNLOCK`。

## 檔案

- `src/sim.js`：純物理（不依賴 three），可在 Node 跑。
- `src/level.js`：60 關種子程序產生＋`SALT` 換種子表。
- `src/scene.js`、`src/levelview.js`、`src/frog.js`、`src/fx.js`：渲染。`src/artkit.js`（美術線的執行時模組：載入、換色、高低畫質材質）、`src/art.js`（開機載入 26 個 GLB、把道具拆成 InstancedMesh 組）、`src/juice.js`（每個事件的特效配方：果凍、粒子、停格、慢動作、震動、音效層）。模型在 `public/models/`。
- `src/audio.js`：WebAudio 合成。`src/ui.js`：DOM 介面。`src/main.js`：主迴圈與狀態機。`src/cg.js`：CrazyGames SDK 包裝（未改）。
- `tests/sim-check.mjs`：自動玩家跑 60 關（12 組參數），全部可破才 exit 0。
- `tests/endless-check.mjs`：無盡模式自動玩家接力，12 個種子都要跑完四個世界（1800 單位）。`tests/feats-check.mjs`：成就偵測（每種達成／差一點）。`tests/save-check.mjs`：舊存檔相容、下一步推薦、本機榜。`tests/feat-dist.mjs`：成就門檻分布。`tests/smoke-*.json`：冒煙步驟。

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
13. **（第二輪改）結算畫面拿掉**：改成選單「下一步」推薦＋商店 CAN BUY 標記，把外層進度接回核心循環。
10. **新手提示用畫面上的小字**：第 1 關／前 6 次黏住前，目標鉤點旁顯示 HOLD、擺到前上方時在青蛙頭上顯示 RELEASE!，不用文字牆。

## 驗證

- `node tests/sim-check.mjs`：自動玩家 12 組參數跑 60 關，60/60 可破（exit 0）。`node tests/endless-check.mjs`、`node tests/feats-check.mjs`、`node tests/save-check.mjs` 都 exit 0。
- 冒煙（一律包 heavy.sh）：
  ```
  /Users/eason/Studio/games/crazygames/_tools/heavy.sh /Users/eason/Studio/games/crazygames/_tools/smoke.sh /Users/eason/Studio/games/crazygames/hook-hero 5715 /Users/eason/Studio/games/crazygames/hook-hero/tests/smoke-desktop.json <輸出資料夾> [--no-sdk]
  /Users/eason/Studio/games/crazygames/_tools/heavy.sh /Users/eason/Studio/games/crazygames/_tools/smoke.sh /Users/eason/Studio/games/crazygames/hook-hero 5715 /Users/eason/Studio/games/crazygames/hook-hero/tests/smoke-mobile.json <輸出資料夾> --mobile
  ```
  桌機步驟用真實的 Space 按住／放開序列玩第 1 關（序列取自自動玩家，在 Node 加 ±30 ms 抖動實測約 9 成能自然破關、過半會 TRIPLE FLIP），斷言黏上 ≥ 3 次、前進、分數 > 0；沒自然落地才用 `__game.forceWin()` 收尾。
- 巡覽截圖（非驗收）：`tests/tour-worlds.json`、`tests/tour-hazards.json`、`tests/tour-skins.json`（用 `__game.autoplay`／`__game.look()`）。
- 除錯掛鉤 `window.__game`：`state`、`level`、`score`、`attachesTotal`、`flips`、`bestFlip`、`maxX`、`deaths`、`fps`、`quality`、`drawCalls`、`result`；`start(n)`、`forceWin()`、`look(skin, trail)`、`autoplay = [rel, grabVy]`。

## 大小

`dist` 約 1.6 MB、28 個檔：index.html＋一支 JS（770 KB，gzip 208 KB，three.js 佔大部分）＋`models/` 26 個 meshopt 壓縮的 GLB（共約 880 KB）。沒有圖片、音檔、字型。

## 已知問題

- 音效／音樂只在無頭瀏覽器跑過（無錯誤），沒有人耳試聽過音量平衡。
- 難度只用自動玩家驗證「可破」，後段關卡（40 關以後）對真人可能偏難，需要真人試玩調 `src/level.js` 的間距與危險物高度。
- 失焦（點到 iframe 外）會自動暫停，這是刻意的。
