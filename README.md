# STICKY FROG

**一句話賣點**：按住，青蛙的長舌頭黏上鉤點；放開，帶著擺盪的動量飛出去——空中翻滾賺分、順便吃蒼蠅，一路不碰水衝上終點荷葉。

## 玩法

- 側視 2.5D（青蛙只在 XY 平面動，世界是 3D low-poly＋景深視差）。
- **按住**：舌頭射向前方最近的鉤點花（目標會先出現白色光環），黏住後做單擺；按住期間舌頭會慢慢收短「打氣」，越擺越快。
- **放開**：帶著擺盪的速度飛出去，並依速度自動翻滾；轉滿一圈＝FLIP，兩圈 DOUBLE、三圈 TRIPLE FLIP（慢動作＋FOV 推近＝招牌時刻）。
- 蒼蠅靠近時舌頭自動舔掉；穿過金色圈圈加分＋慢動作；彈跳蘑菇把你彈回空中；風扇往上吹；尖刺球、鋸片碰到就失敗；掉進水（糖漿、霓虹運河、岩漿）＝失敗，0.5 秒內從頭重來。
- 落在終點大荷葉上＝過關（後面有一面大葉子牆擋住飛過頭的青蛙）。

## 操作

| 平台 | 操作 |
|---|---|
| 桌機 | 按住滑鼠左鍵或 Space（↑、W、→、D 也可以）；Esc／P 暫停；R 重來 |
| 手機 | 按住螢幕任何位置；右上角 56px 暫停鈕 |

一個按鍵就能玩完整款遊戲。結算畫面 Space／Enter／點一下＝下一關。

## 核心循環

選關（或直接 PLAY 最新一關）→ 15–40 秒的短關卡（擺盪、翻滾、吃蒼蠅）→ 落上荷葉 → 3 顆星評等一顆顆砸下來（完成、蒼蠅 ≥ 70%、時間 ≤ 標準時間）＋金幣累加 → 金幣買青蛙造型與拖尾 → 下一關。

- 60 關，每 15 關換一個世界：JUNGLE → CANDY → NEON CITY → VOLCANO（色盤、天空、水、背景道具、障礙外觀全換）。
- 新元素依序解鎖：蘑菇（第 3 關）、蒼蠅串（4）、圈圈（5）、移動鉤點（6）、低處尖刺（8）、連續蘑菇（9）、風扇（11）、雙圈（12）、鋸片（14）、高處尖刺（20）、上下夾擊（24）。
- 可解鎖 12 項：9 隻青蛙（Tree、Poison Dart 60、Tomato 120、Candy 200、Glass 300、Ninja 450、Golden 600、Astro 800、Toad King 1200）＋ 4 種拖尾（Rainbow 150、Fire 250、Bubbles 350、Stardust 500）。第 1 關約 35–45 金幣，第 2 關就買得起第一隻。

## 手感清單（18 項，全做）

| # | 項目 | 做在哪 |
|---|---|---|
| 1 | 創傷值式畫面震動（平方曲線、衰減、含微旋轉） | `src/fx.js` `shake`／`addTrauma`；`src/main.js` 各事件 |
| 2 | Hit-stop（蘑菇 45 ms、落水 60 ms、尖刺 110 ms） | `src/main.js` `G.hitStop` |
| 3 | 慢動作（TRIPLE FLIP、穿圈、落荷葉；timeScale 漸變） | `src/main.js` `slowmo()`、`frame()` |
| 4 | 擠壓伸展（起跳、黏住、放開、彈跳、撞牆、落地；沿速度方向） | `src/frog.js` `squash()`（三層 pivot 沿任意軸縮放） |
| 5 | 粒子爆發（木屑、花瓣、水花、碎片、火花、彩帶；物件池＋InstancedMesh） | `src/fx.js` `burst()` |
| 6 | 跳字（FLIP!、+50、BOING!、RING!、TRIPLE FLIP!，彈出縮放） | `src/ui.js` `popup()`、`index.html` `.pp` |
| 7 | 連擊（2.8 秒內沒新動作就斷；音高、字級、倍率隨連擊升高） | `src/main.js` `addCombo()`、`src/audio.js` flip／attach |
| 8 | 鏡頭：平滑跟隨＋速度前瞻＋隨速度拉遠＋放開時 FOV 衝擊＋慢動作推近 | `src/main.js` `render()` |
| 9 | 死亡閃白、大事件全螢幕閃光 | `src/ui.js` `flash()` |
| 10 | 速度拖尾緞帶＋高速速度線 | `src/fx.js` trail／lines |
| 11 | 衝擊波環（黏住、蘑菇、圈圈、落荷葉、落水） | `src/fx.js` `shock()` |
| 12 | 每個動作都有音效（多層合成、音高隨機 ±7%） | `src/audio.js` `play()` |
| 13 | 程序音樂循環（每世界不同調）＋大時刻 ducking | `src/audio.js` `startMusic()`／`duckMusic()` |
| 14 | UI 動畫（按鈕 hover／按下彈跳、面板 overshoot 彈入、星星砸下、分數金幣跳動累加） | `index.html` CSS、`src/ui.js` `showResult()` |
| 15 | 預備動作（起跳前蹲 70 ms、舌頭射出前張嘴） | `src/sim.js` `crouch`、`src/frog.js` |
| 16 | 待機動畫（呼吸、眨眼、鉤點花旋轉搖擺、蒼蠅嗡嗡、水面波浪、旗子飄） | `src/frog.js`、`src/levelview.js`、`src/scene.js` |
| 17 | 手機震動（包 try） | `src/main.js` `vibrate()` |
| 18 | 輕量後製（CSS 暈影；受擊色差脈衝，只有脈衝時多一個 pass，低畫質自動關） | `index.html` `#vignette`、`src/scene.js` `render()` |

另外：關卡進度條（含本關最遠紀錄標記）、死在 60% 之後跳「SO CLOSE! 87%」、擦過危險物「CLOSE CALL!」、每關開場大字標題、世界通關 `happytime`。

另外：舌頭是彈性緞帶（射出時抖動、黏上時舌尖「啵」放大、鉤點花彈簧晃動）、大眼睛瞳孔跟加速度晃、看向目標鉤點、快轉時縮成一團。

## 調參常數在哪

全部在 `src/config.js`：`TUNE`（物理、舌頭、翻滾、分數、鏡頭、慢動作）、`WORLDS`（四個世界的色盤）、`SKINS`／`TRAILS`（價格）。關卡產生在 `src/level.js`（段落種類解鎖關卡、間距、難度曲線）。

## 檔案

- `src/sim.js`：純物理（不依賴 three），可在 Node 跑。
- `src/level.js`：60 關種子程序產生＋`SALT` 換種子表。
- `src/scene.js`、`src/levelview.js`、`src/frog.js`、`src/fx.js`：渲染。
- `src/audio.js`：WebAudio 合成。`src/ui.js`：DOM 介面。`src/main.js`：主迴圈與狀態機。`src/cg.js`：CrazyGames SDK 包裝（未改）。
- `tests/sim-check.mjs`：自動玩家跑 60 關（12 組參數），全部可破才 exit 0。`tests/smoke-*.json`：冒煙步驟。

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
12. **多四種段落**：蒼蠅串（沿擺盪弧線，想拿蒼蠅星要盪低）、連續蘑菇、雙圈（甩高連穿）、上下夾擊（尖刺上下各一）。後段關卡不再只是「鉤點＋一個障礙」重複。
13. **結算提示「NEW: XXX READY TO BUY!」＋選單 FROGS 鈕紅點**：金幣剛好夠買新造型時提醒，把外層進度接回核心循環。
10. **新手提示用畫面上的小字**：第 1 關／前 6 次黏住前，目標鉤點旁顯示 HOLD、擺到前上方時在青蛙頭上顯示 RELEASE!，不用文字牆。

## 驗證

- `node tests/sim-check.mjs`：自動玩家 12 組參數跑 60 關，60/60 可破（exit 0）。
- 冒煙（一律包 heavy.sh）：
  ```
  /Users/eason/Studio/games/crazygames/_tools/heavy.sh /Users/eason/Studio/games/crazygames/_tools/smoke.sh /Users/eason/Studio/games/crazygames/hook-hero 5715 /Users/eason/Studio/games/crazygames/hook-hero/tests/smoke-desktop.json <輸出資料夾> [--no-sdk]
  /Users/eason/Studio/games/crazygames/_tools/heavy.sh /Users/eason/Studio/games/crazygames/_tools/smoke.sh /Users/eason/Studio/games/crazygames/hook-hero 5715 /Users/eason/Studio/games/crazygames/hook-hero/tests/smoke-mobile.json <輸出資料夾> --mobile
  ```
  桌機步驟用真實的 Space 按住／放開序列玩第 1 關（序列取自自動玩家，在 Node 加 ±30 ms 抖動實測約 9 成能自然破關、過半會 TRIPLE FLIP），斷言黏上 ≥ 3 次、前進、分數 > 0；沒自然落地才用 `__game.forceWin()` 收尾。
- 巡覽截圖（非驗收）：`tests/tour-worlds.json`、`tests/tour-hazards.json`、`tests/tour-skins.json`（用 `__game.autoplay`／`__game.look()`）。
- 除錯掛鉤 `window.__game`：`state`、`level`、`score`、`attachesTotal`、`flips`、`bestFlip`、`maxX`、`deaths`、`fps`、`quality`、`drawCalls`、`result`；`start(n)`、`forceWin()`、`look(skin, trail)`、`autoplay = [rel, grabVy]`。

## 大小

`dist` 約 616 KB、2 個檔（index.html＋一支 JS，three.js 佔大部分；沒有任何圖片、音檔、字型）。

## 已知問題

- 音效／音樂只在無頭瀏覽器跑過（無錯誤），沒有人耳試聽過音量平衡。
- 難度只用自動玩家驗證「可破」，後段關卡（40 關以後）對真人可能偏難，需要真人試玩調 `src/level.js` 的間距與危險物高度。
- 失焦（點到 iframe 外）會自動暫停，這是刻意的。
