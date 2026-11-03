// 自寫的精簡 WebGL2 渲染器：只做這個遊戲要的事（取代 Pixi，省掉約 85 KB gzip 與它的場景樹、擴充系統、合批著色器）。
// - 精靈：螢幕空間（CSS 像素）四邊形，一支著色器；換貼圖才送出一批（draw call）
// - 顏色：mul＝染色×透明度、add＝加色（霧化用：mul=(1-f)、add=霧色×f）；add.a=1 變成加法混色（發光）
// - clip：每個頂點帶一條「水線」（螢幕 y，CSS 像素），片段在水線以下就淡掉——物件立在水裡、掉進水裡都靠這個
// - 沒有全螢幕通道：天空、水面也是帶頂點顏色的四邊形（quadC）
// 貼圖一律 premultiplied alpha；混色 ONE, ONE_MINUS_SRC_ALPHA。

export interface Tex {
  t: WebGLTexture;
  w: number;
  h: number;
}
/** 圖集裡的一格：uv、像素尺寸、錨點（像素）、每像素幾個世界單位；px/py＝關節點（像素）；d＝烘焙時的深度（排序用） */
export interface Frame {
  tex: Tex;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  unit: number;
  px?: number;
  py?: number;
  d?: number;
}
/** 2D 仿射矩陣 [a, b, c, d, e, f]：x' = a·x + c·y + e、y' = b·x + d·y + f（螢幕座標，y 往下） */
export type Mat = Float64Array;

const VS = `#version 300 es
in vec2 aPos; in vec2 aUv; in vec4 aMul; in vec4 aAdd; in float aClip;
uniform vec2 uRes;
out vec2 vUv; out vec4 vMul; out vec4 vAdd; out float vClip;
void main() { vec2 p = aPos / uRes * 2.0 - 1.0; gl_Position = vec4(p.x, -p.y, 0.0, 1.0); vUv = aUv; vMul = aMul; vAdd = aAdd; vClip = aClip; }`;
const FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vMul; in vec4 vAdd; in float vClip;
uniform sampler2D uTex; uniform float uDpr; uniform float uH;
out vec4 o;
void main() {
  vec4 c = texture(uTex, vUv);
  float y = (uH - gl_FragCoord.y) / uDpr;
  float k = clamp((vClip - y) * uDpr + 0.5, 0.0, 1.0);
  float a = c.a * vMul.a * k;
  o = vec4(c.rgb * vMul.rgb * vMul.a * k + vAdd.rgb * a, a * (1.0 - vAdd.a));
}`;
const STRIDE = 28,
  MAXQ = 6000;
export const NOCLIP = 1e7;
/** 0xRRGGBB＋透明度 → 打包成頂點用的 u32（記憶體順序 R,G,B,A） */
export const rgba = (rgb: number, a = 1): number => ((Math.round(a * 255) << 24) | ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff)) >>> 0;
export const WHITE = rgba(0xffffff, 1),
  NOADD = 0;

export function createGL(canvas: HTMLCanvasElement) {
  // 正常情況 index.html 已經用同樣的屬性先建好（趁主程式下載時）；這裡拿到的就是那一個
  const ctx = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!ctx) throw new Error('WebGL2 unavailable');
  const gl: WebGL2RenderingContext = ctx;
  const compile = (vs: string, fs: string): WebGLProgram => {
    const p = gl.createProgram()!;
    for (const [type, src] of [
      [gl.VERTEX_SHADER, vs],
      [gl.FRAGMENT_SHADER, fs],
    ] as const) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.bindAttribLocation(p, 1, 'aUv');
    gl.bindAttribLocation(p, 2, 'aMul');
    gl.bindAttribLocation(p, 3, 'aAdd');
    gl.bindAttribLocation(p, 4, 'aClip');
    gl.linkProgram(p);
    return p;
  };
  // 連結狀態延後到第一次用才查（KHR_parallel_shader_compile 的精神：別讓編譯擋住主執行緒）
  let lost = false;
  const checked = new WeakSet<WebGLProgram>();
  const check = (p: WebGLProgram) => {
    if (lost || checked.has(p)) return;
    checked.add(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link failed');
  };

  const buf = new ArrayBuffer(MAXQ * 4 * STRIDE),
    F32 = new Float32Array(buf),
    U32 = new Uint32Array(buf);
  const idx = new Uint16Array(MAXQ * 6);
  for (let i = 0, v = 0; i < idx.length; i += 6, v += 4) {
    idx[i] = v;
    idx[i + 1] = v + 1;
    idx[i + 2] = v + 2;
    idx[i + 3] = v + 2;
    idx[i + 4] = v + 1;
    idx[i + 5] = v + 3;
  }
  // GL 物件全部由 setup() 建：開機建一次，context 掉了再恢復時整套重建（貼圖另外走 live 表）
  let prog!: WebGLProgram,
    uRes: WebGLUniformLocation | null = null,
    uDpr: WebGLUniformLocation | null = null,
    uH: WebGLUniformLocation | null = null,
    progReady = false;
  let vao!: WebGLVertexArrayObject, vbo!: WebGLBuffer;
  function setup(): void {
    prog = compile(VS, FS);
    progReady = false; // uniform 位置等第一次 begin 再查：一查就得同步等連結完
    vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, buf.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, STRIDE, 16);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, STRIDE, 20);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, STRIDE, 24);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  setup();

  let W = 1,
    H = 1,
    dpr = 1,
    n = 0,
    cur: Tex | null = null,
    drawCalls = 0,
    texBytes = 0;

  function flush(): void {
    if (!n || !cur) {
      n = 0;
      return;
    }
    check(prog);
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, F32, 0, n * 4 * 7);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cur.t);
    gl.drawElements(gl.TRIANGLES, n * 6, gl.UNSIGNED_SHORT, 0);
    drawCalls++;
    n = 0;
  }
  const use = (t: Tex) => {
    if (cur !== t) {
      flush();
      cur = t;
    } else if (n >= MAXQ) flush();
  };
  // 寫一個頂點
  const vtx = (o: number, x: number, y: number, u: number, v: number, mul: number, add: number, clip: number) => {
    F32[o] = x;
    F32[o + 1] = y;
    F32[o + 2] = u;
    F32[o + 3] = v;
    U32[o + 4] = mul;
    U32[o + 5] = add;
    F32[o + 6] = clip;
  };

  /** 任意四邊形（TL、TR、BL、BR） */
  function quad(
    t: Tex,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    mul: number,
    add: number,
    clip: number,
  ): void {
    use(t);
    const o = n * 28;
    n++;
    vtx(o, x0, y0, u0, v0, mul, add, clip);
    vtx(o + 7, x1, y1, u1, v0, mul, add, clip);
    vtx(o + 14, x2, y2, u0, v1, mul, add, clip);
    vtx(o + 21, x3, y3, u1, v1, mul, add, clip);
  }
  /** 帶 uv 的四邊形（緞帶、沙丘的一段：左右兩點 × 前後兩點） */
  function quadUV(
    t: Tex,
    x0: number,
    y0: number,
    u0: number,
    v0: number,
    x1: number,
    y1: number,
    u1: number,
    v1: number,
    x2: number,
    y2: number,
    u2: number,
    v2: number,
    x3: number,
    y3: number,
    u3: number,
    v3: number,
    mul: number,
    add: number,
    clip: number,
  ): void {
    use(t);
    const o = n * 28;
    n++;
    vtx(o, x0, y0, u0, v0, mul, add, clip);
    vtx(o + 7, x1, y1, u1, v1, mul, add, clip);
    vtx(o + 14, x2, y2, u2, v2, mul, add, clip);
    vtx(o + 21, x3, y3, u3, v3, mul, add, clip);
  }
  /** 四個角各自的顏色（天空、水面的漸層）：TL、TR、BL、BR；貼圖座標 u0..u1、v0..v1（配 repeat 貼圖可超出 0..1） */
  function quadC(
    t: Tex,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    m0: number,
    m1: number,
    m2: number,
    m3: number,
    add: number,
    clip: number,
  ): void {
    use(t);
    const o = n * 28;
    n++;
    vtx(o, x0, y0, u0, v0, m0, add, clip);
    vtx(o + 7, x1, y1, u1, v0, m1, add, clip);
    vtx(o + 14, x2, y2, u0, v1, m2, add, clip);
    vtx(o + 21, x3, y3, u1, v1, m3, add, clip);
  }
  /** 精靈：中心（錨點）在螢幕 (x, y)，旋轉 rot（螢幕角度，順時針為正），kx/ky＝每個圖集像素多少 CSS 像素（負的就是翻面）。fx0/fx1＝只畫寬度的一段（0..1） */
  function sprite(f: Frame, x: number, y: number, rot: number, kx: number, ky: number, mul: number, add = NOADD, clip = NOCLIP, fx0 = 0, fx1 = 1): void {
    const c = Math.cos(rot),
      s = Math.sin(rot);
    const a = c * kx,
      b = s * kx,
      cc = -s * ky,
      d = c * ky;
    const lx0 = f.w * fx0 - f.ax,
      lx1 = f.w * fx1 - f.ax,
      ly0 = -f.ay,
      ly1 = f.h - f.ay;
    const u0 = f.u0 + (f.u1 - f.u0) * fx0,
      u1 = f.u0 + (f.u1 - f.u0) * fx1;
    quad(
      f.tex,
      x + a * lx0 + cc * ly0,
      y + b * lx0 + d * ly0,
      x + a * lx1 + cc * ly0,
      y + b * lx1 + d * ly0,
      x + a * lx0 + cc * ly1,
      y + b * lx0 + d * ly1,
      x + a * lx1 + cc * ly1,
      y + b * lx1 + d * ly1,
      u0,
      f.v0,
      u1,
      f.v1,
      mul,
      add,
      clip,
    );
  }
  /** 精靈：用矩陣 m（圖集像素、以錨點為原點 → 螢幕）擺放 */
  function spriteM(f: Frame, m: Mat, mul: number, add = NOADD, clip = NOCLIP): void {
    const lx0 = -f.ax,
      lx1 = f.w - f.ax,
      ly0 = -f.ay,
      ly1 = f.h - f.ay;
    const T = (x: number, y: number, k: 0 | 1) => (k ? m[1] * x + m[3] * y + m[5] : m[0] * x + m[2] * y + m[4]);
    quad(f.tex, T(lx0, ly0, 0), T(lx0, ly0, 1), T(lx1, ly0, 0), T(lx1, ly0, 1), T(lx0, ly1, 0), T(lx0, ly1, 1), T(lx1, ly1, 0), T(lx1, ly1, 1), f.u0, f.v0, f.u1, f.v1, mul, add, clip);
  }

  /** 貼圖：premultiplied 上傳；mip＝產生兩層 mipmap（縮小時不閃）；
   *  restore＝context 恢復時怎麼拿回來源：沒給就留著 src 本身（小畫布可以），大圖請給重新下載解碼的函式，別把點陣圖留在記憶體 */
  interface TexOpts {
    repeat?: boolean | 'xy';
    mip?: boolean;
    restore?: () => TexImageSource | Promise<TexImageSource>;
  } // repeat：橫向重複；'xy'：兩個方向都重複
  interface Live {
    o: TexOpts;
    restore: () => TexImageSource | Promise<TexImageSource>;
  }
  const live = new Map<Tex, Live>(); // 活著的貼圖與它們的來源：context 恢復時逐張重建
  function upload(t: Tex, src: TexImageSource, o: TexOpts): void {
    gl.bindTexture(gl.TEXTURE_2D, t.t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const wrap = o.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, o.repeat === 'xy' ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (o.mip) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 2);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    cur = null;
  }
  function texture(src: TexImageSource, o: TexOpts = {}): Tex {
    const t: Tex = { t: gl.createTexture()!, w: (src as { width: number }).width, h: (src as { height: number }).height };
    upload(t, src, o);
    live.set(t, { o, restore: o.restore ?? (() => src) });
    texBytes += t.w * t.h * 4 * (o.mip ? 1.31 : 1);
    return t;
  }
  function freeTexture(t: Tex): void {
    const L = live.get(t);
    live.delete(t);
    gl.deleteTexture(t.t);
    texBytes -= t.w * t.h * 4 * (L?.o.mip ? 1.31 : 1);
    if (cur === t) cur = null;
  }

  function resize(w: number, h: number, d: number): void {
    W = w;
    H = h;
    dpr = d;
    // 尺寸沒變就不設：設定 canvas.width（就算同值）會重新配置並清空繪圖緩衝
    const cw = Math.max(1, Math.round(w * d)),
      ch = Math.max(1, Math.round(h * d));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
  function begin(): void {
    drawCalls = 0;
    if (!progReady) {
      check(prog);
      uRes = gl.getUniformLocation(prog, 'uRes');
      uDpr = gl.getUniformLocation(prog, 'uDpr');
      uH = gl.getUniformLocation(prog, 'uH');
      gl.useProgram(prog);
      gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
      progReady = true;
    }
    // 用實際配到的緩衝尺寸（瀏覽器記憶體不夠時會給得比 canvas.width 小）
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(prog);
    gl.uniform2f(uRes, W, H);
    gl.uniform1f(uDpr, dpr);
    gl.uniform1f(uH, gl.drawingBufferHeight);
    cur = null;
    n = 0;
  }

  // context 掉了（切 App 回來、記憶體吃緊、驅動重設）：不 preventDefault 就永遠拿不回來。
  // 恢復時重建程式與緩衝；貼圖先放 1×1 透明像素（不完整的貼圖會採樣成黑色），來源回來再補上。Tex 物件原地換掉 t，外面持有的 Frame 都不用動
  const restoreFns: (() => void)[] = [];
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    cur = null;
    n = 0;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    setup();
    const blank = new Uint8Array(4);
    for (const [t, L] of live) {
      t.t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t.t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, blank);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      Promise.resolve(L.restore())
        .then((src) => {
          if (!lost && live.get(t) === L) {
            upload(t, src, L.o);
            for (const fn of restoreFns) fn();
          }
        })
        .catch((e) => console.warn('[gl] restore texture', e));
    }
    for (const fn of restoreFns) fn();
  });

  return {
    gl,
    quad,
    quadUV,
    quadC,
    sprite,
    spriteM,
    texture,
    freeTexture,
    resize,
    begin,
    end: flush,
    /** context 恢復（含每張貼圖補回來）時呼叫：重畫 */
    onRestore(fn: () => void) {
      restoreFns.push(fn);
    },
    get lost() {
      return lost;
    },
    get W() {
      return W;
    },
    get H() {
      return H;
    },
    get dpr() {
      return dpr;
    },
    get drawCalls() {
      return drawCalls;
    },
    get texBytes() {
      return texBytes;
    },
  };
}
export type GL = ReturnType<typeof createGL>;

// ---------- 2D 仿射矩陣小工具（角色零件的階層變換用） ----------
export const mat = (): Mat => new Float64Array([1, 0, 0, 1, 0, 0]);
export function setTRS(m: Mat, x: number, y: number, rot: number, sx: number, sy: number): Mat {
  const c = Math.cos(rot),
    s = Math.sin(rot);
  m[0] = c * sx;
  m[1] = s * sx;
  m[2] = -s * sy;
  m[3] = c * sy;
  m[4] = x;
  m[5] = y;
  return m;
}
/** out = a · b */
export function mul(out: Mat, a: Mat, b: Mat): Mat {
  const a0 = a[0],
    a1 = a[1],
    a2 = a[2],
    a3 = a[3],
    a4 = a[4],
    a5 = a[5];
  const b0 = b[0],
    b1 = b[1],
    b2 = b[2],
    b3 = b[3],
    b4 = b[4],
    b5 = b[5];
  out[0] = a0 * b0 + a2 * b1;
  out[1] = a1 * b0 + a3 * b1;
  out[2] = a0 * b2 + a2 * b3;
  out[3] = a1 * b2 + a3 * b3;
  out[4] = a0 * b4 + a2 * b5 + a4;
  out[5] = a1 * b4 + a3 * b5 + a5;
  return out;
}
export const apply = (m: Mat, x: number, y: number, out: { x: number; y: number }) => {
  out.x = m[0] * x + m[2] * y + m[4];
  out.y = m[1] * x + m[3] * y + m[5];
  return out;
};
