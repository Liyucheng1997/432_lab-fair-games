// 程序化贴图：全部用 Canvas 现场绘制，不依赖外部图片
import * as THREE from 'three';

export const FONT = '"Microsoft YaHei","PingFang SC","Noto Sans SC","Source Han Sans SC","SimHei",sans-serif';
export const KAI = '"STKaiti","KaiTi","Kaiti SC","STXingkai","Noto Serif SC","SimSun",serif';

export function rng(seed = 1) {
  let s = (Math.imul(seed | 0, 2654435761) >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// 可平铺的值噪声
export function makeNoise(seed = 1) {
  const r = rng(seed);
  const perm = new Uint16Array(512), vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const mod = (a, p) => ((a % p) + p) % p;
  const h = (x, y) => vals[perm[perm[x & 255] + (y & 255)]];
  const sm = t => t * t * (3 - 2 * t);
  function noise(x, y, px = 0, py = 0) {
    let xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    let x1 = xi + 1, y1 = yi + 1;
    if (px) { xi = mod(xi, px); x1 = mod(x1, px); }
    if (py) { yi = mod(yi, py); y1 = mod(y1, py); }
    const a = h(xi, yi), b = h(x1, yi), c = h(xi, y1), d = h(x1, y1);
    const u = sm(xf), v = sm(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // x,y ∈ [0,1)，px/py 为基础频率（整数，保证平铺）
  noise.fbm = (x, y, px, py, oct = 4) => {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * noise(x * px * f, y * py * f, px * f, py * f);
      n += a; a *= 0.5; f *= 2;
    }
    return s / n;
  };
  return noise;
}

export function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export function toTex(c, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

const clamp = (v, a = 0, b = 255) => Math.max(a, Math.min(b, v));

// ───────────────────────── 广场花岗岩地砖 ─────────────────────────
export function pavingTextures() {
  const S = 1024;
  const [mc, m] = cv(S, S), [rc, rr] = cv(S, S), [bc, bb] = cv(S, S);
  m.fillStyle = '#34312e'; m.fillRect(0, 0, S, S);
  rr.fillStyle = '#f2f2f2'; rr.fillRect(0, 0, S, S);
  bb.fillStyle = '#1a1a1a'; bb.fillRect(0, 0, S, S);
  const rows = 8, rh = S / rows, tw = S / 4, g = 5;
  let seed = 100;
  for (let row = 0; row < rows; row++) {
    const off = (row % 2) * tw / 2;
    for (let k = -1; k < 4; k++) {
      const x = k * tw + off + g / 2, y = row * rh + g / 2, w = tw - g, h = rh - g;
      const tileSeed = seed++;
      for (const dx of [0, S, -S]) {
        if (x + dx + w < 0 || x + dx > S) continue;
        drawTile(x + dx, y, w, h, tileSeed);
      }
    }
  }
  function drawTile(x, y, w, h, s) {
    const r = rng(s);
    const base = 86 + r() * 36, warm = r() * 10 - 3;
    m.fillStyle = `rgb(${base + warm},${base + warm * 0.6},${base - 2})`;
    m.fillRect(x, y, w, h);
    // 边缘略暗（磨损）
    const eg = m.createLinearGradient(x, y, x, y + h);
    eg.addColorStop(0, 'rgba(0,0,0,0.12)'); eg.addColorStop(0.08, 'rgba(0,0,0,0)');
    eg.addColorStop(0.92, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,0.15)');
    m.fillStyle = eg; m.fillRect(x, y, w, h);
    // 花岗岩颗粒
    for (let i = 0; i < 1500; i++) {
      const px = x + r() * w, py = y + r() * h, v = r();
      const c = v < 0.55 ? base - 25 - r() * 35 : base + 15 + r() * 45;
      m.fillStyle = `rgba(${c},${c},${c - 3},${0.35 + r() * 0.6})`;
      const sz = r() < 0.92 ? 1 + r() : 2 + r() * 1.5;
      m.fillRect(px, py, sz, sz);
    }
    // 污渍
    for (let i = 0; i < 3; i++) {
      const gx = x + r() * w, gy = y + r() * h, gr = 15 + r() * 60;
      const grd = m.createRadialGradient(gx, gy, 0, gx, gy, gr);
      const a = 0.08 + r() * 0.18;
      grd.addColorStop(0, `rgba(25,20,16,${a})`); grd.addColorStop(1, 'rgba(25,20,16,0)');
      m.save(); m.beginPath(); m.rect(x, y, w, h); m.clip();
      m.fillStyle = grd; m.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
      m.restore();
    }
    // 粗糙度：每块砖不同，偶有湿亮斑
    const rough = 150 + r() * 70;
    rr.fillStyle = `rgb(${rough},${rough},${rough})`; rr.fillRect(x, y, w, h);
    if (r() < 0.35) {
      const gx = x + r() * w, gy = y + r() * h, gr = 30 + r() * 80;
      const grd = rr.createRadialGradient(gx, gy, 0, gx, gy, gr);
      grd.addColorStop(0, 'rgba(60,60,60,0.9)'); grd.addColorStop(1, 'rgba(60,60,60,0)');
      rr.save(); rr.beginPath(); rr.rect(x, y, w, h); rr.clip();
      rr.fillStyle = grd; rr.fillRect(gx - gr, gy - gr, gr * 2, gr * 2); rr.restore();
    }
    // 凹凸：砖面 + 微颗粒
    const bh = 175 + r() * 30;
    bb.fillStyle = `rgb(${bh},${bh},${bh})`; bb.fillRect(x, y, w, h);
    for (let i = 0; i < 600; i++) {
      const c = bh + (r() - 0.5) * 50;
      bb.fillStyle = `rgb(${c},${c},${c})`;
      bb.fillRect(x + r() * w, y + r() * h, 1.5, 1.5);
    }
  }
  return {
    map: toTex(mc),
    roughnessMap: toTex(rc, { srgb: false }),
    bumpMap: toTex(bc, { srgb: false }),
  };
}

// ───────────────────────── 绒布（套圈场地红毯） ─────────────────────────
export function feltTexture(rgb = [150, 16, 22], seed = 3, S = 512) {
  const [c, x] = cv(S, S);
  const n = makeNoise(seed);
  const img = x.createImageData(S, S), d = img.data;
  const r = rng(seed + 9);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const v = n.fbm(i / S, j / S, 6, 6, 4);
    const k = 0.82 + 0.3 * v + (r() - 0.5) * 0.14;
    const o = (j * S + i) * 4;
    d[o] = clamp(rgb[0] * k); d[o + 1] = clamp(rgb[1] * k); d[o + 2] = clamp(rgb[2] * k); d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  // 绒毛纤维
  for (let i = 0; i < 7000; i++) {
    const px = r() * S, py = r() * S, a = r() * Math.PI * 2, l = 2 + r() * 5;
    const light = r() < 0.5;
    x.strokeStyle = light ? 'rgba(255,190,190,0.07)' : 'rgba(30,0,0,0.09)';
    x.lineWidth = 0.8;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  return toTex(c);
}

// ───────────────────────── 木纹 ─────────────────────────
export function woodTexture({ c1 = [122, 76, 38], c2 = [82, 48, 22], seed = 5, rings = 26, S = 512, warp = 5 } = {}) {
  const [c, x] = cv(S, S);
  const n = makeNoise(seed);
  const img = x.createImageData(S, S), d = img.data;
  const r = rng(seed);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S, v = j / S;
    const w = n.fbm(u, v, 2, 4, 4);
    let t = Math.sin((v * rings + w * warp) * Math.PI * 2) * 0.5 + 0.5;
    t = Math.pow(t, 2.2);
    const fine = n.fbm(u, v, 64, 2, 2);
    const k = 0.9 + 0.2 * fine + (r() - 0.5) * 0.05;
    const o = (j * S + i) * 4;
    d[o] = clamp((c1[0] + (c2[0] - c1[0]) * t) * k);
    d[o + 1] = clamp((c1[1] + (c2[1] - c1[1]) * t) * k);
    d[o + 2] = clamp((c1[2] + (c2[2] - c1[2]) * t) * k);
    d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return toTex(c);
}

// ───────────────────────── 青花瓷 ─────────────────────────
export function porcelainTexture(seed = 1) {
  const W = 1024, H = 512;
  const [c, x] = cv(W, H);
  const r = rng(seed);
  // 釉面底色（略泛青）
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#f4f6f7'); bg.addColorStop(1, '#eef1f2');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const blue = a => `rgba(24,52,128,${a})`;
  const wash = a => `rgba(52,86,170,${a})`;
  x.filter = 'blur(0.7px)';
  // 注意：lathe 的 uv.y 从下(0)到上(1)，canvas y 从上往下，所以上方的画在 canvas 顶部
  const band = (y, hgt) => {
    x.strokeStyle = blue(0.9); x.lineWidth = 3;
    x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke();
    x.beginPath(); x.moveTo(0, y + hgt); x.lineTo(W, y + hgt); x.stroke();
  };
  // 顶部如意云头
  band(H * 0.12, H * 0.1);
  for (let i = 0; i < 12; i++) {
    const cx = (i + 0.5) * W / 12, cy = H * 0.17;
    x.fillStyle = wash(0.75);
    x.beginPath();
    x.moveTo(cx - 30, cy + 18);
    x.bezierCurveTo(cx - 40, cy - 10, cx - 12, cy - 22, cx, cy - 6);
    x.bezierCurveTo(cx + 12, cy - 22, cx + 40, cy - 10, cx + 30, cy + 18);
    x.closePath(); x.fill();
    x.strokeStyle = blue(0.95); x.lineWidth = 2; x.stroke();
  }
  // 主体缠枝莲
  const vineY = H * 0.5;
  x.strokeStyle = blue(0.85); x.lineWidth = 3.2;
  x.beginPath();
  for (let i = 0; i <= W; i += 4) {
    const y = vineY + Math.sin(i / W * Math.PI * 2 * 4) * 55;
    if (i === 0) x.moveTo(i, y); else x.lineTo(i, y);
  }
  x.stroke();
  for (let k = 0; k < 8; k++) {
    const fx = (k + 0.5) * W / 8;
    const fy = vineY + Math.sin(fx / W * Math.PI * 2 * 4) * 55 + (k % 2 ? 30 : -30);
    // 卷须与叶子
    for (let l = 0; l < 4; l++) {
      const a = r() * Math.PI * 2, d = 40 + r() * 25;
      const lx = fx + Math.cos(a) * d, ly = fy + Math.sin(a) * d * 0.7;
      x.strokeStyle = blue(0.8); x.lineWidth = 2;
      x.beginPath(); x.moveTo(fx, fy);
      x.quadraticCurveTo(fx + Math.cos(a + 0.8) * d * 0.6, fy + Math.sin(a + 0.8) * d * 0.4, lx, ly); x.stroke();
      x.save(); x.translate(lx, ly); x.rotate(a);
      x.fillStyle = wash(0.7);
      x.beginPath(); x.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = blue(0.9); x.lineWidth = 1.5; x.stroke();
      x.restore();
    }
    // 莲花
    for (let p = 0; p < 9; p++) {
      const a = p / 9 * Math.PI * 2;
      x.save(); x.translate(fx, fy); x.rotate(a);
      x.fillStyle = wash(0.55 + r() * 0.2);
      x.beginPath(); x.ellipse(0, -20, 9, 20, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = blue(0.95); x.lineWidth = 1.8; x.stroke();
      x.restore();
    }
    x.fillStyle = blue(0.95);
    x.beginPath(); x.arc(fx, fy, 9, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(240,244,246,1)';
    x.beginPath(); x.arc(fx, fy, 4, 0, Math.PI * 2); x.fill();
  }
  // 底部莲瓣纹
  band(H * 0.8, H * 0.12);
  for (let i = 0; i < 16; i++) {
    const cx = (i + 0.5) * W / 16, y0 = H * 0.92, y1 = H * 0.815;
    x.strokeStyle = blue(0.9); x.lineWidth = 2.2;
    x.beginPath(); x.moveTo(cx - 24, y0); x.quadraticCurveTo(cx - 26, y1, cx, y1 + 2);
    x.quadraticCurveTo(cx + 26, y1, cx + 24, y0); x.stroke();
    x.fillStyle = wash(0.6);
    x.beginPath(); x.moveTo(cx - 12, y0); x.quadraticCurveTo(cx, y1 + 18, cx + 12, y0); x.fill();
  }
  x.fillStyle = blue(0.85); x.fillRect(0, H * 0.965, W, 6);
  x.filter = 'none';
  // 釉面细微斑点
  for (let i = 0; i < 2500; i++) {
    x.fillStyle = `rgba(80,100,130,${r() * 0.06})`;
    x.fillRect(r() * W, r() * H, 1.5, 1.5);
  }
  return toTex(c);
}

// ───────────────────────── 饮料标签 ─────────────────────────
export function drinkLabel(kind) {
  const W = 512, H = 256;
  const [c, x] = cv(W, H);
  if (kind === 'cola') {
    x.fillStyle = '#c4101b'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#ffffff'; x.lineWidth = 14;
    x.beginPath();
    for (let i = 0; i <= W; i += 8) x.lineTo(i, H * 0.72 + Math.sin(i / W * Math.PI * 4) * 16);
    x.stroke();
    for (const ox of [0, W / 2]) {
      x.fillStyle = '#fff'; x.font = `bold 78px ${KAI}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('快乐可乐', ox + W / 4, H * 0.38);
    }
    x.fillStyle = 'rgba(255,255,255,0.8)'; x.font = `22px ${FONT}`;
    x.fillText('330ml', W * 0.5, H * 0.9);
  } else if (kind === 'beer') {
    x.fillStyle = 'rgba(0,0,0,0)'; x.clearRect(0, 0, W, H);
    x.fillStyle = '#f2e7c4'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#1f4f2a'; x.fillRect(0, 0, W, 26); x.fillRect(0, H - 26, W, 26);
    x.strokeStyle = '#b8902f'; x.lineWidth = 5; x.strokeRect(8, 34, W - 16, H - 68);
    for (const ox of [0, W / 2]) {
      x.fillStyle = '#b3141c'; x.font = `bold 70px ${KAI}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('清爽', ox + W / 4, H * 0.42);
      x.fillStyle = '#1f4f2a'; x.font = `bold 28px ${FONT}`;
      x.fillText('啤 酒', ox + W / 4, H * 0.7);
    }
  } else if (kind === 'tea') {
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2f8f3c'); g.addColorStop(1, '#bfe28a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (const ox of [0, W / 2]) {
      x.fillStyle = '#fff'; x.font = `bold 72px ${KAI}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('绿茶', ox + W / 4, H * 0.45);
    }
    x.fillStyle = '#1d5c23'; x.font = `22px ${FONT}`; x.textAlign = 'center';
    x.fillText('低糖 · 500ml', W / 2, H * 0.85);
  } else if (kind === 'thermos') {
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  }
  const t = toTex(c); t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ───────────────────────── 招牌（灯箱） ─────────────────────────
export function signTexture({
  w = 1024, h = 320, title = '套圈', sub = '', bg = ['#c3141c', '#86090f'],
  titleColor = '#ffd75e', subColor = '#fff3d0', font = KAI, titleSize = 0.62, border = '#ffd75e', vertical = false,
} = {}) {
  const [c, x] = cv(w, h);
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  // 云纹暗花
  x.strokeStyle = 'rgba(255,220,150,0.08)'; x.lineWidth = 3;
  for (let i = 0; i < 18; i++) {
    const cx = (i % 6 + 0.5) * w / 6, cy = (Math.floor(i / 6) + 0.5) * h / 3;
    x.beginPath(); x.arc(cx, cy, 30, 0.2, Math.PI * 1.6); x.stroke();
    x.beginPath(); x.arc(cx + 18, cy + 6, 14, Math.PI, Math.PI * 2.6); x.stroke();
  }
  x.strokeStyle = border; x.lineWidth = Math.max(6, h * 0.025);
  x.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
  x.lineWidth = 2; x.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  if (vertical) {
    const chars = [...title];
    const fs = Math.min(w * 0.7, (h * 0.86) / chars.length);
    x.font = `bold ${fs}px ${font}`;
    chars.forEach((ch, i) => {
      x.fillStyle = 'rgba(0,0,0,0.35)';
      x.fillText(ch, w / 2 + 3, h * 0.07 + fs * (i + 0.5) + 3);
      x.fillStyle = titleColor;
      x.fillText(ch, w / 2, h * 0.07 + fs * (i + 0.5));
    });
  } else {
    const ty = sub ? h * 0.42 : h * 0.52;
    x.font = `bold ${h * titleSize}px ${font}`;
    x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillText(title, w / 2 + 5, ty + 5);
    x.fillStyle = titleColor; x.fillText(title, w / 2, ty);
    if (sub) {
      x.font = `bold ${h * 0.17}px ${FONT}`;
      x.fillStyle = subColor; x.fillText(sub, w / 2, h * 0.79);
    }
  }
  return toTex(c);
}

// ───────────────────────── 帐篷顶篷（条纹） ─────────────────────────
export function canopyTexture(colA = '#c8141c', colB = '#f5d33a', stripes = 10) {
  const S = 512;
  const [c, x] = cv(S, S);
  const r = rng(stripes * 7);
  for (let i = 0; i < stripes; i++) {
    x.fillStyle = i % 2 ? colB : colA;
    x.fillRect(i * S / stripes, 0, S / stripes + 1, S);
  }
  // 缝线
  x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 2;
  for (let i = 0; i <= stripes; i++) { x.beginPath(); x.moveTo(i * S / stripes, 0); x.lineTo(i * S / stripes, S); x.stroke(); }
  // 帆布纹理
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    x.fillRect(r() * S, r() * S, 1 + r() * 2, 1);
  }
  // 雨水污渍 / 褶皱暗部
  for (let i = 0; i < 12; i++) {
    const gx = r() * S, gy = r() * S, gr = 20 + r() * 70;
    const g = x.createRadialGradient(gx, gy, 0, gx, gy, gr);
    g.addColorStop(0, 'rgba(0,0,0,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
  }
  return toTex(c);
}

// 帐篷围边（波浪下摆，带透明）
export function valanceTexture(colA = '#c8141c', colB = '#f5d33a', scallops = 4) {
  const W = 512, H = 128;
  const [c, x] = cv(W, H);
  x.clearRect(0, 0, W, H);
  const sw = W / scallops;
  for (let i = 0; i < scallops; i++) {
    x.fillStyle = i % 2 ? colB : colA;
    x.beginPath();
    x.moveTo(i * sw, 0); x.lineTo((i + 1) * sw, 0); x.lineTo((i + 1) * sw, H * 0.55);
    x.quadraticCurveTo((i + 0.5) * sw, H * 1.15, i * sw, H * 0.55);
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2; x.stroke();
  }
  x.fillStyle = '#e8c15a'; x.fillRect(0, 8, W, 7);
  x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(0, 15, W, 2);
  const t = toTex(c); t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ───────────────────────── 红灯笼 ─────────────────────────
export function lanternTextures() {
  const W = 512, H = 256;
  const [mc, m] = cv(W, H), [ec, e] = cv(W, H);
  const g = m.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#7a0a0c'); g.addColorStop(0.5, '#d4161c'); g.addColorStop(1, '#7a0a0c');
  m.fillStyle = g; m.fillRect(0, 0, W, H);
  const eg = e.createLinearGradient(0, 0, 0, H);
  eg.addColorStop(0, '#2a0300'); eg.addColorStop(0.25, '#c9300c'); eg.addColorStop(0.5, '#ff7a2a');
  eg.addColorStop(0.75, '#c9300c'); eg.addColorStop(1, '#2a0300');
  e.fillStyle = eg; e.fillRect(0, 0, W, H);
  // 12 道竹骨
  for (let i = 0; i <= 12; i++) {
    const u = i / 12 * W;
    for (const [ctx, col] of [[m, 'rgba(60,0,0,0.55)'], [e, 'rgba(0,0,0,0.55)']]) {
      ctx.strokeStyle = col; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(u, 0); ctx.lineTo(u, H); ctx.stroke();
    }
  }
  // 两面“福”字
  for (const u of [0.25, 0.75]) {
    m.font = `bold 120px ${KAI}`; m.textAlign = 'center'; m.textBaseline = 'middle';
    m.fillStyle = '#f6c645'; m.fillText('福', u * W, H * 0.52);
    e.font = `bold 120px ${KAI}`; e.textAlign = 'center'; e.textBaseline = 'middle';
    e.fillStyle = '#5a1000'; e.fillText('福', u * W, H * 0.52);
  }
  return { map: toTex(mc), emissiveMap: toTex(ec) };
}

export function tasselTexture() {
  const W = 128, H = 256;
  const [c, x] = cv(W, H);
  const r = rng(77);
  x.clearRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) {
    const u = r() * W, len = H * (0.75 + r() * 0.25);
    x.strokeStyle = r() < 0.15 ? '#f6c645' : `rgb(${190 + r() * 50},${10 + r() * 20},${20})`;
    x.lineWidth = 1 + r() * 1.5;
    x.beginPath(); x.moveTo(u, 0); x.lineTo(u + (r() - 0.5) * 6, len); x.stroke();
  }
  const t = toTex(c); t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ───────────────────────── 远处楼房窗户 ─────────────────────────
export function windowsTexture(seed = 3) {
  const W = 256, H = 512;
  const [c, x] = cv(W, H);
  const r = rng(seed);
  x.fillStyle = '#0b0c10'; x.fillRect(0, 0, W, H);
  const cols = 8, rows = 24;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const lit = r() < 0.38;
    if (!lit) {
      x.fillStyle = 'rgb(14,16,22)';
    } else {
      const warm = r() < 0.7;
      const k = 0.5 + r() * 0.5;
      x.fillStyle = warm ? `rgb(${255 * k},${190 * k},${110 * k})` : `rgb(${170 * k},${200 * k},${255 * k})`;
    }
    x.fillRect(i * W / cols + 6, j * H / rows + 5, W / cols - 12, H / rows - 9);
  }
  return toTex(c);
}

// 柔和光斑
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const S = 128;
  const [c, x] = cv(S, S);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function smokeTexture() {
  const S = 128;
  const [c, x] = cv(S, S);
  const n = makeNoise(31);
  const img = x.createImageData(S, S), d = img.data;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const dx = i / S - 0.5, dy = j / S - 0.5;
    const rad = Math.sqrt(dx * dx + dy * dy) * 2;
    const v = n.fbm(i / S, j / S, 4, 4, 4);
    const a = Math.max(0, 1 - rad) ** 1.6 * (0.5 + v);
    const o = (j * S + i) * 4;
    d[o] = d[o + 1] = d[o + 2] = 235; d[o + 3] = clamp(a * 255);
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 挂奖品用的网格
export function netTexture() {
  const S = 256;
  const [c, x] = cv(S, S);
  x.clearRect(0, 0, S, S);
  x.strokeStyle = '#d8d8d8'; x.lineWidth = 3;
  for (let i = 0; i <= 8; i++) {
    x.beginPath(); x.moveTo(i * S / 8, 0); x.lineTo(i * S / 8, S); x.stroke();
    x.beginPath(); x.moveTo(0, i * S / 8); x.lineTo(S, i * S / 8); x.stroke();
  }
  return toTex(c);
}

// 投掷线（黄黑警示胶带）
export function tapeTexture() {
  const W = 512, H = 32;
  const [c, x] = cv(W, H);
  x.fillStyle = '#f2c81c'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#151515';
  for (let i = -2; i < 20; i++) {
    x.beginPath();
    x.moveTo(i * 32, H); x.lineTo(i * 32 + 16, H); x.lineTo(i * 32 + 16 + H, 0); x.lineTo(i * 32 + H, 0);
    x.closePath(); x.fill();
  }
  const r = rng(4);
  for (let i = 0; i < 400; i++) {
    x.fillStyle = `rgba(0,0,0,${r() * 0.15})`; x.fillRect(r() * W, r() * H, 3, 2);
  }
  return toTex(c);
}

// 气球板的深蓝绒布（带星星）
export function boardFabricTexture() {
  const S = 512;
  const [c, x] = cv(S, S);
  const n = makeNoise(12);
  const img = x.createImageData(S, S), d = img.data;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const v = n.fbm(i / S, j / S, 8, 8, 3);
    const o = (j * S + i) * 4;
    const k = 0.8 + v * 0.4;
    d[o] = 18 * k; d[o + 1] = 34 * k; d[o + 2] = 92 * k; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const r = rng(5);
  for (let i = 0; i < 26; i++) {
    const cx = r() * S, cy = r() * S, R = 6 + r() * 12;
    x.fillStyle = `rgba(255,220,90,${0.25 + r() * 0.3})`;
    x.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? R * 0.42 : R;
      x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    x.closePath(); x.fill();
  }
  return toTex(c);
}

// 气球纸板文字小牌
export function priceCardTexture(lines, { w = 512, h = 384, bg = '#fff8e6', color = '#b3141c' } = {}) {
  const [c, x] = cv(w, h);
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.strokeStyle = color; x.lineWidth = 10; x.strokeRect(10, 10, w - 20, h - 20);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((ln, i) => {
    x.fillStyle = ln.color || color;
    x.font = `bold ${ln.size || 70}px ${ln.font || FONT}`;
    x.fillText(ln.text, w / 2, h * (i + 0.5) / lines.length + 4);
  });
  return toTex(c);
}
