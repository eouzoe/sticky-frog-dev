# STICKY FROG 介面語言

模組從 BONK BEANS 搬來（`src/i18n.js`、`src/i18n.css`）。這一輪只有 `en`（來源語言）；其他 11 種（`es` `pt` `fr` `de` `tr` `ru` `ja` `ko` `id` `zh-Hant` `zh-Hans`）由翻譯線補。
檢查：`node tests/i18n-check.mjs`（index.html／src/ui.js 不准有寫死的英文玩家字串、key 對得上、插值一致）。

## 寫法規則

- 程式裡一律 `t('key', { vars })`；HTML 靜態字用 `data-i18n="key"`（文字）、`data-i18n-aria="key"`（aria-label），元素本身留空。
- 數字、名字、關卡編號、距離一律走插值（`{level}`、`{n}`、`{dist}`），不准字串相加。
- 資料名稱的英文留在資料旁邊當備援：角色／舌頭／拖尾在 `config.js`（翻成 `it.<skins|tongues|trails>.<id>`）、世界名與落水字在 `config.js` WORLDS（`world.<0-3>`、`die.<0-3>`）、成就名與稱讚在 `feats.js`（`feat.<id>`、`featLine.<id>`）。用 `itemName(tab, it)`／`t('world.2', null, w.name)` 取。
- 名稱類用 CSS `text-transform: uppercase` 轉大寫（尊重 `<html lang>`，土耳其文 i → İ），翻譯檔照正常大小寫寫即可；UI 鈕字本身就寫全大寫。
- 缺翻譯顯示英文；完全沒有的 key 會原樣顯示並記在 `__game.i18n.audit().missing`。

## 刻意保持英文

- Logo `STICKY FROG`（品牌，`#logo` 永遠用 Baloo 2）與它的 aria 名稱。
- 關卡編號 `1-2`、分數與金幣數字（`toLocaleString('en-US')` 的千分位）、`x2`／`x12` 這類倍數、`★`。
- 其他都走 key，包括跳字（`FLIP!`、`BOING!`、`SPLASH!`…）：翻譯線可以決定擬聲字要不要在地化。

## 版面要給長語言留空間

德文、法文比英文長約 40%。做法：

- 有父層寬度的元件（一排按鈕、分頁、面板標題貼紙、頁標題、卡片名稱、價格膠囊）加 `data-fit`：字太長就逐步縮字（最小 55%），換語言或改尺寸時重算（`fit()`，ResizeObserver）。
- 一排的按鈕 `flex: 1 1 auto; min-width: 0`，一起分寬度再各自縮字；說明句（`#nextUp small`、`.fl`）可以換行。
- 版面測試用假語言：`?lang=xx` 會把每個英文字串加長 40%（`ÉÀÖÜÇÑÄ` 補字），`_out/hook-hero/round2/ui/tools/game-shots.mjs` 會用它重拍並檢查溢出。

## 字型

Baloo 2 ExtraBold 只打包 Basic Latin（10.6 KB）。`i18n.css` 依 `<html lang>` 換字型堆疊：西葡法德印尼的重音字母逐字退回 Arial Rounded／Arial Black；俄文、土耳其文整段用系統圓體；中日韓的漢字假名諺文用系統字型（PingFang、Hiragino、Apple SD Gothic Neo、Microsoft JhengHei…），拉丁字母與數字仍是 Baloo。

## 加一種語言

1. 複製 `en.js` 成 `<code>.js` 翻譯，再補 `it.*`、`world.*`、`die.*`、`feat.*`、`featLine.*`（英文原文見 config.js、feats.js；`i18n-check` 會列出缺的）。
2. `src/i18n.js`：`import`、`DICTS`、`LANGS`（選單上的母語名稱）。
3. 需要的話在 `src/i18n.css` 調字型堆疊，重跑 `node tests/i18n-check.mjs` 與 `game-shots.mjs`。
