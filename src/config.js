// 所有調參常數集中在這裡（README 有說明）。單位：世界單位（青蛙半徑 ≈ 0.55）、秒。
export const TUNE = {
  DT: 1 / 120, // 物理固定步長
  GRAVITY: 30,
  AIR_DRAG: 0.04,
  MAX_SPEED: 36,
  FROG_R: 0.55,
  FROG_VIS: 1.5, // 青蛙外觀放大倍率（碰撞半徑不變，對尖刺比較寬容）
  JUMP_V: [6.5, 13], // 從起點木樁跳起的速度
  JUMP_DELAY: 0.07, // 起跳前蹲下（預備動作）
  TONGUE_RANGE: 16, // 舌頭能黏到的最遠距離
  TONGUE_SPEED: 150, // 舌頭射出速度（越快越跟手）
  ROPE_MIN: 2.6,
  ROPE_MAX: 19,
  ROPE_REST: 8.5, // 黏上後舌頭會像橡皮筋一樣縮回這個長度（遠距離黏上＝被拉過去）
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
  MUSH_MIN_BOUNCE: 17,
  MUSH_REST: 1.0,
  FAN_ACC: 64,
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
  CAM_MIN_Y: 8.2, // 鏡頭最低高度：讓鉤點上方的圈圈、鋸片也在畫面內
  // 招牌時刻
  SLOWMO_SCALE: 0.28,
  SLOWMO_TIME: 0.8, // 真實秒
  RESTART_DELAY: 0.5,
  PAR_SPEED: 10.5, // 3 星時間：關卡長度 / 這個速度 + 3 秒
};

// 世界：每 15 關換一個（色盤、背景、障礙外觀）
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
];

// 外層進度：可解鎖項（價格單位：金幣）
export const SKINS = [
  { id: 'tree', name: 'Tree Frog', price: 0, body: '#2ecc71', belly: '#d4f7a8', eye: '#ff3b3b', cheek: '#ff8fb5' },
  { id: 'dart', name: 'Poison Dart', price: 60, body: '#2f6bff', belly: '#9cc4ff', eye: '#111111', cheek: '#7fd0ff', spots: '#111133' },
  { id: 'tomato', name: 'Tomato Frog', price: 120, body: '#ff5a3c', belly: '#ffc29a', eye: '#ffd23f', cheek: '#ffd0c0' },
  { id: 'candy', name: 'Candy Frog', price: 200, body: '#ff8fd0', belly: '#b8ffe4', eye: '#7a3cff', cheek: '#ffffff', spots: '#ffffff' },
  { id: 'glass', name: 'Glass Frog', price: 300, body: '#b6ff6b', belly: '#eaffd0', eye: '#ffe14d', cheek: '#ffffff', glass: true },
  { id: 'ninja', name: 'Ninja Frog', price: 450, body: '#2b2d42', belly: '#555b78', eye: '#ffffff', cheek: '#ff3b3b', band: '#ff2e2e' },
  { id: 'gold', name: 'Golden Frog', price: 600, body: '#ffc93c', belly: '#fff0b0', eye: '#2b2b2b', cheek: '#ff9f43', shiny: true },
  { id: 'astro', name: 'Astro Frog', price: 800, body: '#7ad151', belly: '#ffffff', eye: '#111111', cheek: '#ff8fb5', helmet: true },
  { id: 'king', name: 'Toad King', price: 1200, body: '#9c6b3c', belly: '#e8c89a', eye: '#ffcc00', cheek: '#c05a3c', spots: '#6b4422', crown: true },
];

export const TRAILS = [
  { id: 'none', name: 'Breeze', price: 0, colors: ['#ffffff', '#ffffff'] },
  { id: 'rainbow', name: 'Rainbow', price: 150, colors: ['#ff4757', '#ffa502', '#ffd23f', '#2ed573', '#1e90ff', '#9b5de5'] },
  { id: 'fire', name: 'Fire', price: 250, colors: ['#ffe066', '#ff8c1a', '#ff3b1f'] },
  { id: 'bubble', name: 'Bubbles', price: 350, colors: ['#bff4ff', '#7be0ff'] },
  { id: 'star', name: 'Stardust', price: 500, colors: ['#fff6a0', '#ffd23f', '#ff9ff3'] },
];
