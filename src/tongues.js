// 舌頭材質貼圖（程式畫的 CanvasTexture，沿舌頭長度重複）：毛線＝斜紋麻花、藤蔓＝綠色莖＋葉節、蛛絲＝細亮絲線。
// 美術線重做模型時可以整個換掉；frog.js 只透過 setTongue(spec, tex) 吃這裡的結果。
import * as THREE from 'three';

const cache = {};
export function tongueTexture(kind) {
  if (!kind) return null;
  if (cache[kind]) return cache[kind];
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const g = c.getContext('2d');
  if (kind === 'yarn') {
    g.fillStyle = '#ff7ab8'; g.fillRect(0, 0, 64, 32);
    g.strokeStyle = '#ffd0e8'; g.lineWidth = 5;
    for (let x = -32; x < 96; x += 12) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 0); g.stroke(); }
    g.strokeStyle = '#d94f93'; g.lineWidth = 2;
    for (let x = -32; x < 96; x += 12) { g.beginPath(); g.moveTo(x + 5, 32); g.lineTo(x + 21, 0); g.stroke(); }
  } else if (kind === 'vine') {
    g.fillStyle = '#3d8f3a'; g.fillRect(0, 0, 64, 32);
    g.fillStyle = '#5fbf4a'; g.fillRect(0, 10, 64, 12);
    g.fillStyle = '#9be36b';
    for (const x of [8, 40]) { g.beginPath(); g.ellipse(x, 6, 9, 5, -0.5, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(x + 16, 26, 9, 5, 0.5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#2b6b2a'; g.fillRect(30, 8, 4, 16);
  } else if (kind === 'silk') {
    g.fillStyle = '#c9d2ff'; g.fillRect(0, 0, 64, 32);
    g.fillStyle = '#ffffff'; g.fillRect(0, 11, 64, 10);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (const x of [10, 42]) { g.beginPath(); g.arc(x, 16, 5, 0, Math.PI * 2); g.fill(); } // 小露珠
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return (cache[kind] = t);
}
