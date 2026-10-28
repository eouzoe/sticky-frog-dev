// 所有調參常數集中在這裡（README 有說明）。單位：世界單位（青蛙半徑 ≈ 0.55）、秒。
export const TUNE = {
  DT: 1 / 120, // 物理固定步長
  GRAVITY: 36, // 30 → 36：擺盪週期從 3.3 秒縮到約 2.9 秒，手感比較脆
  AIR_DRAG: 0.04,
  MAX_SPEED: 36,
  FROG_R: 0.55,
  FROG_VIS: 1.72, // 外觀放大倍率（第二輪 1.5 → 1.72，擺盪畫面主角大約 15%；碰撞半徑 FROG_R 不變）
  JUMP_V: [6.5, 13], // 從起點木樁跳起的速度
  JUMP_DELAY: 0.07, // 起跳前蹲下（預備動作）
  TONGUE_RANGE: 16, // 舌頭能黏到的最遠距離
  TONGUE_SPEED: 150, // 舌頭射出速度（越快越跟手）
  ROPE_MIN: 2.6,
  ROPE_MAX: 19,
  ROPE_REST: 7.5, // 黏上後舌頭會像橡皮筋一樣縮回這個長度（遠距離黏上＝被拉過去）
  ELASTIC_RATE: 16, // 縮回速度（單位/秒）
  PUMP_RATE: 1.4, // 按住時舌頭收短的速度（打氣加速，角動量守恆）
  SWING_ASSIST: 5, // 擺盪時沿切線的助推（讓擺盪越擺越有力）
  RELEASE_BOOST: 1.07, // 放開時速度倍率
  RELEASE_UP: 2.2, // 放開時若往上飛，額外加的上升速度
  SPIN_PER_SPEED: 0.85, // 放開後翻滾角速度＝速度 × 這個值（15 單位/秒 ≈ 每秒 2 圈）
  SPIN_DAMP: 0.1,
  SPIN_MAX: 22,
  FLIP_TOLERANCE: 0.26, // 差 15° 內也算轉滿一圈
  FLY_EAT_R: 2.6, // 蒼蠅進入這個距離就自動舔掉
  RING_R: 1.9,
  BOOST_V: 12, // 加速圈：進圈時沿箭頭方向加的速度
  BOOST_R: 2.1, // 加速圈的觸發半徑
  MUSH_MIN_BOUNCE: 17,
  MUSH_REST: 1.0,
  MUSH_VX: 10, // 從上面踩到蘑菇：固定往前 10、往上 19 彈出（可預測，連續蘑菇間距剛好一跳）
  MUSH_VY: 19,
  FAN_ACC: 64,
  DUNE_BASE: 0.5, // 沙丘谷底離水面的高度（高於浪，青蛙貼著谷底不會泡在水裡）；沙丘高度 H 是疊在這個底上面的
  DUNE_FLOOR: 10, // 滑沙：貼著沙面時沿坡面往前的速度下限（單位/秒）；沒有它兩座沙丘之間的谷底會來回晃到停
  DUNE_LIP_FLOOR: 17, // 尾端上翹坡頂（lip）上的速度下限：離開坡頂時用這個速度沿坡面方向拋出去
  WATER_Y: 0,
  COMBO_WINDOW: 2.8, // 連擊：這麼多秒內沒有新動作就斷
  SCORE_FLIP: 100,
  SCORE_FLY: 50,
  SCORE_RING: 150,
  SCORE_BOUNCE: 25,
  SCORE_GRAB: 10,
  // 鏡頭
  CAM_FOV: 50,
  CAM_DIST: 19,
  CAM_DIST_SPEED: 0.38,
  CAM_DIST_MAX: 30,
  CAM_LOOKAHEAD: 0.33,
  CAM_MIN_Y: 7.8, // 鏡頭最低高度：讓鉤點上方的圈圈、鋸片也在畫面內
  CAM_MIN_Y_DUNE: 7.4, // 沙丘世界調低（7.8→7.4）：視野下緣 −1.5，連沙丘側壁（到 −1.4）都在畫面內；上緣 7.4＋8.9＝16.3，鉤點最高 16 還看得到
  // 招牌時刻
  SLOWMO_SCALE: 0.28,
  SLOWMO_TIME: 0.8, // 真實秒
  RESTART_DELAY: 0.5,
  // 畫面震動（src/fx.js addTrauma）：小事件取 max、大事件累加；使用者一句「太強／太弱」就調這兩個
  SHAKE_SCALE: 0.85, // 位移／旋轉幅度倍率
  SHAKE_DECAY: 1.9, // 每秒掉多少 trauma（越大停得越快）
  PAR_SPEED: 10.5, // 3 星時間：關卡長度 / 這個速度 + 3 秒
};

// 世界：每 15 關換一個（目前 6 個、90 關）（色盤、背景、障礙外觀）
export const WORLDS = [
  {
    name: 'JUNGLE', sky: ['#a8e6ff', '#fff3b0'], fog: '#d6f2d8', water: '#2ec4c4', waterEm: '#000000',
    petal: '#ff6fb5', bud: '#ffd23f', vine: '#27ae60', cap: '#ff4757', capSpot: '#ffffff', stem: '#f5e6c8',
    hazard: '#6b4f3a', hazardTip: '#e8e8e8', saw: '#c0c8d0', wood: '#8b5a2b', pad: '#2ecc71',
    hemi: ['#ffffff', '#4a8f5a'], props: 'jungle', die: 'SPLASH!', bgHill: '#7fcf9a', bgHill2: '#a7dfb4',
  },
  {
    name: 'CANDY', sky: ['#ffc6ec', '#fff1d6'], fog: '#ffe0f0', water: '#ff9fd4', waterEm: '#000000',
    petal: '#7be0ff', bud: '#ffffff', vine: '#ff7eb6', cap: '#9b5de5', capSpot: '#ffe066', stem: '#fff7fb',
    hazard: '#ffffff', hazardTip: '#ff3b6b', saw: '#ff3b6b', wood: '#c97b4a', pad: '#7ee0a8',
    hemi: ['#ffffff', '#d98bb8'], props: 'candy', die: 'SPLAT!', bgHill: '#ffb3d9', bgHill2: '#ffd6ea',
  },
  {
    name: 'NEON CITY', sky: ['#1a0b3d', '#ff3d8b'], fog: '#3a1450', water: '#123c5c', waterEm: '#0a5070',
    petal: '#00f0ff', bud: '#ff2bd6', vine: '#7a5cff', cap: '#00e0a0', capSpot: '#eaffff', stem: '#3a2a66',
    hazard: '#2a2440', hazardTip: '#ff2bd6', saw: '#ffe600', wood: '#3a2a66', pad: '#00e0a0',
    hemi: ['#b8a8ff', '#3a1450'], props: 'city', die: 'ZAP!', bgHill: '#2a1458', bgHill2: '#3d1d6e',
  },
  {
    name: 'VOLCANO', sky: ['#5a1a1a', '#ff9a3c'], fog: '#7a2e1e', water: '#ff5a1f', waterEm: '#ff3a00',
    petal: '#ffb020', bud: '#2b2020', vine: '#3b2b2b', cap: '#ff7a00', capSpot: '#2b2020', stem: '#5a4040',
    hazard: '#2b2020', hazardTip: '#ff5a1f', saw: '#ffcf40', wood: '#4a3030', pad: '#56b870',
    hemi: ['#ffd0a0', '#5a1a1a'], props: 'volcano', die: 'SIZZLE!', bgHill: '#5a2a24', bgHill2: '#7a3a2a',
  },
  {
    name: 'FROSTBITE PEAKS', sky: ['#3f8ddc', '#dcefff'], fog: '#e3f2fc', water: '#6fe0e4', waterEm: '#0d5663',
    petal: '#ff4d94', bud: '#ffd21f', vine: '#3d86c4', cap: '#8a5cff', capSpot: '#ffffff', stem: '#eaf6ff',
    hazard: '#17233f', hazardTip: '#ff9a14', saw: '#dfeaf5', wood: '#4d6f9a', pad: '#8ee6e6',
    hemi: ['#ffffff', '#86b4dc'], props: 'frost', die: 'BRRR!', bgHill: '#8fbbe6', bgHill2: '#c4def5',
    // 極光帶（scene.js）：三個色停靠點
    aurora: ['#3dffa8', '#38d8ff', '#b46cff'],
  },
  {
    name: 'SUNSET DUNES', sky: ['#5a2a86', '#ffb06a'], fog: '#ffb88c', water: '#7a2f3d', waterEm: '#3a0a16',
    petal: '#0fb3ae', bud: '#fff3b0', vine: '#1fa59a', cap: '#ff5aa5', capSpot: '#fff3b0', stem: '#fff1d6',
    hazard: '#2a1346', hazardTip: '#ff2e63', saw: '#dfe8ff', wood: '#8a4b2a', pad: '#46dc9a',
    hemi: ['#ffdcb4', '#7a3a63'], props: 'dunes', die: 'GULP!', bgHill: '#a8467e', bgHill2: '#d4628a',
    // 沙丘表面（levelview 程序網格）：谷底、坡面、頂緣高光、側面
    sand: ['#f0a14a', '#ffd070', '#fff0b8', '#c9722f'],
  },
];

// 外層進度：可解鎖項（價格單位：金幣）
// 角色：kind＝模型種類（cat／ape／silkfrog 的模型由美術線提供，現在先用青蛙換色當佔位）；tongue＝買角色送的招牌舌頭。
// 旋轉貓咪是看板角色：商店置頂（featured）、價格約 6–8 關的金幣。
export const SKINS = [
  { id: 'cat', kind: 'cat', name: 'Spinny Cat', price: 300, featured: true, tongue: 'yarn', body: '#ffa94d', belly: '#fff1d6', eye: '#3cd070', cheek: '#ff9fb2', spots: '#d9772b' },
  { id: 'tree', name: 'Tree Frog', price: 0, body: '#2ecc71', belly: '#d4f7a8', eye: '#ff3b3b', cheek: '#ff8fb5' },
  { id: 'dart', name: 'Poison Dart', price: 60, body: '#2f6bff', belly: '#9cc4ff', eye: '#111111', cheek: '#7fd0ff', spots: '#111133' },
  { id: 'tomato', name: 'Tomato Frog', price: 120, body: '#ff5a3c', belly: '#ffc29a', eye: '#ffd23f', cheek: '#ffd0c0' },
  { id: 'candy', name: 'Candy Frog', price: 200, body: '#ff8fd0', belly: '#b8ffe4', eye: '#7a3cff', cheek: '#ffffff', spots: '#ffffff' },
  { id: 'glass', name: 'Glass Frog', price: 300, body: '#b6ff6b', belly: '#eaffd0', eye: '#ffe14d', cheek: '#ffffff', glass: true },
  { id: 'ninja', name: 'Ninja Frog', price: 450, body: '#2b2d42', belly: '#555b78', eye: '#ffffff', cheek: '#ff3b3b', band: '#ff2e2e' },
  { id: 'gold', name: 'Golden Frog', price: 600, body: '#ffc93c', belly: '#fff0b0', eye: '#2b2b2b', cheek: '#ff9f43', shiny: true },
  { id: 'astro', name: 'Astro Frog', price: 800, body: '#7ad151', belly: '#ffffff', eye: '#111111', cheek: '#ff8fb5', helmet: true },
  { id: 'king', name: 'Toad King', price: 1200, body: '#9c6b3c', belly: '#e8c89a', eye: '#ffcc00', cheek: '#c05a3c', spots: '#6b4422', crown: true },
  { id: 'ape', kind: 'ape', name: 'Vine Ape', price: 650, tongue: 'vine', body: '#8a5a3c', belly: '#e8c39e', eye: '#3b2a1a', cheek: '#d98b6a', band: '#3fae4a' },
  { id: 'silkfrog', kind: 'silkfrog', name: 'Silk Frog', price: 900, tongue: 'silk', body: '#7d5cff', belly: '#f0eaff', eye: '#ffffff', cheek: '#c9b8ff', spots: '#ffffff' },
];

// 舌頭種類：顏色、粗細（width 倍率）、彎曲（wave：靜態的捲曲幅度）、材質貼圖（tex，src/tongues.js 畫）、舌尖（tip 色、tipScale）、黏上時的小特效（fx 粒子色、fxShape）
export const TONGUES = [
  { id: 'tongue', name: 'Frog Tongue', price: 0, color: '#ff4f7a', tip: '#ff3d6e', width: 1, wave: 0, tex: null, tipScale: 1, fx: ['#ff6fb5', '#ffffff'], fxShape: 0 },
  { id: 'yarn', name: 'Yarn', price: 180, color: '#ffffff', tip: '#ff6fb5', width: 0.62, wave: 0.1, tex: 'yarn', tipScale: 1.6, fx: ['#ff6fb5', '#ffd0e8', '#ffffff'], fxShape: 2 },
  { id: 'vine', name: 'Jungle Vine', price: 260, color: '#ffffff', tip: '#7ad151', width: 0.85, wave: 0.28, tex: 'vine', tipScale: 1.25, fx: ['#2ecc71', '#7ad151', '#c8f59a'], fxShape: 1 },
  { id: 'silk', name: 'Silk Thread', price: 340, color: '#ffffff', tip: '#ffffff', width: 0.3, wave: 0, tex: 'silk', tipScale: 0.75, fx: ['#ffffff', '#e6e9ff'], fxShape: 3 },
];

export const TRAILS = [
  { id: 'none', name: 'Breeze', price: 0, colors: ['#ffffff', '#ffffff'] },
  { id: 'rainbow', name: 'Rainbow', price: 150, colors: ['#ff4757', '#ffa502', '#ffd23f', '#2ed573', '#1e90ff', '#9b5de5'] },
  { id: 'fire', name: 'Fire', price: 250, colors: ['#ffe066', '#ff8c1a', '#ff3b1f'] },
  { id: 'bubble', name: 'Bubbles', price: 350, colors: ['#bff4ff', '#7be0ff'] },
  { id: 'star', name: 'Stardust', price: 500, colors: ['#fff6a0', '#ffd23f', '#ff9ff3'] },
];

// CrazyGames 排行榜加密金鑰（Developer Portal 產生；排行榜只開放受邀遊戲）。空字串＝不送分，只用本機前 10 名。見 src/leaderboard.js。
export const LB_KEY = '';

// CrazyGames Basic Launch 期間廣告是關的，看得見卻按了沒效果的 rewarded 按鈕違反廣告規則，
// 所以「看影片 x2」只在 Full Launch 版出現：`VITE_FULL_LAUNCH=1 npm run build`。
export const FULL_LAUNCH = (import.meta.env ?? {}).VITE_FULL_LAUNCH === '1';
