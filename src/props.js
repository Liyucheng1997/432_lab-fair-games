// 通用道具：帐篷、灯箱招牌、红灯笼、串灯、灯泡、塑料凳、水桶……
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canopyTexture, valanceTexture, lanternTextures, tasselTexture, woodTexture, rng } from './textures.js';

export const updaters = []; // 每帧回调 (t, dt)

let _metal;
export function metalMat() {
  return _metal || (_metal = new THREE.MeshStandardMaterial({ color: 0xb4b8bd, metalness: 0.85, roughness: 0.32 }));
}

export function glowMat(color, intensity = 4) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false });
}

function shadowAll(obj, cast = true, receive = true) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}
export { shadowAll };

// 把一个静态物体里的小网格按材质合并，大幅减少 draw call（层级变换会被烘进几何体）
export function bake(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map();
  const remove = [];
  const m4 = new THREE.Matrix4();
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    // 位于 root 之下、被标记 noBake 的子树（比如会转动的部件）保持独立
    let skip = !!o.userData.noBake;
    for (let a = o.parent; a && a !== root; a = a.parent) if (a.userData.noBake) skip = true;
    if (skip) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.morphAttributes = {};
    g.clearGroups();
    g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
    const key = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '');
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
    buckets.get(key).geos.push(g);
    remove.push(o);
  });
  if (remove.length < 2) return root;
  for (const o of remove) {
    // 被移除网格下若还挂着别的东西（灯、精灵等），先转挂到 root
    for (const c of [...o.children]) if (!remove.includes(c)) root.attach(c);
    o.parent && o.parent.remove(o);
  }
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast; m.receiveShadow = b.recv;
    root.add(m);
  }
  return root;
}

// ───────────────────────── 帐篷 ─────────────────────────
function pyramidRoof(w, d, h) {
  const A = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  const pos = [], uv = [];
  for (let i = 0; i < 4; i++) {
    const a = A[i], b = A[(i + 1) % 4];
    pos.push(a[0], 0, a[1], 0, h, 0, b[0], 0, b[1]);
    uv.push(0, 0, 0.5, 1, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function buildTent({ w = 3.6, d = 3.6, h = 2.45, roofH = 0.75, colA = '#c8141c', colB = '#f5d33a', stripes = 12, valH = 0.28 } = {}) {
  const g = new THREE.Group();
  const metal = metalMat();
  const postGeo = new THREE.CylinderGeometry(0.024, 0.024, h, 12);
  const footGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.02, 16);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const p = new THREE.Mesh(postGeo, metal); p.position.set(sx * w / 2, h / 2, sz * d / 2); g.add(p);
    const f = new THREE.Mesh(footGeo, metal); f.position.set(sx * w / 2, 0.01, sz * d / 2); g.add(f);
  }
  const railX = new THREE.CylinderGeometry(0.018, 0.018, w, 8); railX.rotateZ(Math.PI / 2);
  const railZ = new THREE.CylinderGeometry(0.018, 0.018, d, 8); railZ.rotateX(Math.PI / 2);
  for (const sz of [-1, 1]) { const r = new THREE.Mesh(railX, metal); r.position.set(0, h, sz * d / 2); g.add(r); }
  for (const sx of [-1, 1]) { const r = new THREE.Mesh(railZ, metal); r.position.set(sx * w / 2, h, 0); g.add(r); }
  // 屋顶
  const roofMat = new THREE.MeshStandardMaterial({ map: canopyTexture(colA, colB, stripes), roughness: 0.9, side: THREE.DoubleSide });
  const roof = new THREE.Mesh(pyramidRoof(w + 0.08, d + 0.08, roofH), roofMat);
  roof.position.y = h + 0.005; g.add(roof);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), metal);
  finial.position.y = h + roofH + 0.02; g.add(finial);
  // 围边
  const vt = valanceTexture(colA, colB);
  const sides = [
    { len: w + 0.08, pos: [0, 0, d / 2 + 0.04], ry: 0 },
    { len: w + 0.08, pos: [0, 0, -d / 2 - 0.04], ry: Math.PI },
    { len: d + 0.08, pos: [w / 2 + 0.04, 0, 0], ry: Math.PI / 2 },
    { len: d + 0.08, pos: [-w / 2 - 0.04, 0, 0], ry: -Math.PI / 2 },
  ];
  for (const s of sides) {
    const t = vt.clone(); t.needsUpdate = true; t.repeat.set(Math.round(s.len / 1.0), 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.len, valH),
      new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }));
    m.position.set(s.pos[0], h - valH / 2 + 0.01, s.pos[2]); m.rotation.y = s.ry;
    g.add(m);
  }
  shadowAll(g, false, true);
  for (const c of g.children) if (c.geometry === postGeo) c.castShadow = true;
  return bake(g);
}

// ───────────────────────── 吊灯泡 ─────────────────────────
const bulbGeo = new THREE.SphereGeometry(0.035, 16, 12);
const socketGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.04, 12);
let cordMat, socketMat;
export function buildHangingBulb(cordLen = 0.4, color = 0xffd7a0, intensity = 6) {
  cordMat = cordMat || new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  socketMat = socketMat || new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.3 });
  const g = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, cordLen, 6), cordMat);
  cord.position.y = -cordLen / 2; g.add(cord);
  const s = new THREE.Mesh(socketGeo, socketMat); s.position.y = -cordLen - 0.02; g.add(s);
  const b = new THREE.Mesh(bulbGeo, glowMat(color, intensity)); b.position.y = -cordLen - 0.06; g.add(b);
  g.userData.bulb = b;
  return g;
}

// ───────────────────────── 灯箱招牌（带跑马灯） ─────────────────────────
export function buildLightbox(tex, w, h, { depth = 0.1, bulbs = true, bulbColor = 0xffe0a0, glow = 0.85, spacing = 0.085 } = {}) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, depth),
    new THREE.MeshStandardMaterial({ color: 0x1b1b1d, metalness: 0.6, roughness: 0.45 }));
  frame.castShadow = true;
  g.add(frame);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: glow, roughness: 0.35 }));
  face.position.z = depth / 2 + 0.002; g.add(face);
  if (bulbs) {
    const pts = [];
    const W = w + 0.02, H = h + 0.02;
    const nx = Math.round(W / spacing), ny = Math.round(H / spacing);
    for (let i = 0; i < nx; i++) pts.push([-W / 2 + i * W / nx, H / 2]);
    for (let i = 0; i < ny; i++) pts.push([W / 2, H / 2 - i * H / ny]);
    for (let i = 0; i < nx; i++) pts.push([W / 2 - i * W / nx, -H / 2]);
    for (let i = 0; i < ny; i++) pts.push([-W / 2, -H / 2 + i * H / ny]);
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.014, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), pts.length);
    const mtx = new THREE.Matrix4();
    pts.forEach((p, i) => { mtx.makeTranslation(p[0], p[1], depth / 2 + 0.015); im.setMatrixAt(i, mtx); });
    const on = new THREE.Color(bulbColor).multiplyScalar(5), off = new THREE.Color(bulbColor).multiplyScalar(0.5);
    for (let i = 0; i < pts.length; i++) im.setColorAt(i, on);
    g.add(im);
    let last = -1;
    updaters.push(t => {
      const step = Math.floor(t * 7);
      if (step === last) return; last = step;
      for (let i = 0; i < pts.length; i++) im.setColorAt(i, (i + step) % 3 === 0 ? off : on);
      im.instanceColor.needsUpdate = true;
    });
  }
  return g;
}

// ───────────────────────── 红灯笼 ─────────────────────────
let LANTERN;
function lanternParts() {
  if (LANTERN) return LANTERN;
  const geo = new THREE.SphereGeometry(0.2, 48, 28);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const crease = 1 - 0.045 * Math.pow(1 - Math.abs(Math.sin(a * 6)), 5);
    const flat = 1 - 0.08 * Math.pow(Math.abs(y / 0.2), 6);
    p.setXYZ(i, x * crease * flat, y * 0.86, z * crease * flat);
  }
  geo.computeVertexNormals();
  const tx = lanternTextures();
  const body = new THREE.MeshStandardMaterial({
    map: tx.map, emissiveMap: tx.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.7, roughness: 0.75,
  });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9962b, metalness: 0.9, roughness: 0.35 });
  const tassel = new THREE.MeshStandardMaterial({ map: tasselTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8, emissive: 0x330000 });
  LANTERN = {
    geo, body, gold, tassel,
    cap: new THREE.CylinderGeometry(0.075, 0.095, 0.035, 24),
    rim: new THREE.TorusGeometry(0.09, 0.008, 8, 32),
    tasselGeo: new THREE.CylinderGeometry(0.035, 0.075, 0.26, 20, 1, true),
    bead: new THREE.SphereGeometry(0.022, 12, 10),
    hook: new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6),
  };
  return LANTERN;
}

export function buildLantern(scale = 1) {
  const L = lanternParts();
  const g = new THREE.Group();
  const inner = new THREE.Group();
  const top = 0.172;
  const body = new THREE.Mesh(L.geo, L.body); inner.add(body);
  const c1 = new THREE.Mesh(L.cap, L.gold); c1.position.y = top + 0.012; inner.add(c1);
  const c2 = new THREE.Mesh(L.cap, L.gold); c2.position.y = -top - 0.012; c2.rotation.x = Math.PI; inner.add(c2);
  const r1 = new THREE.Mesh(L.rim, L.gold); r1.rotation.x = Math.PI / 2; r1.position.y = top - 0.004; inner.add(r1);
  const r2 = r1.clone(); r2.position.y = -top + 0.004; inner.add(r2);
  const bead = new THREE.Mesh(L.bead, L.gold); bead.position.y = -top - 0.05; inner.add(bead);
  const ts = new THREE.Mesh(L.tasselGeo, L.tassel); ts.position.y = -top - 0.07 - 0.13; inner.add(ts);
  const hook = new THREE.Mesh(L.hook, L.gold); hook.position.y = top + 0.09; inner.add(hook);
  inner.position.y = -(top + 0.15);
  g.add(inner);
  g.scale.setScalar(scale);
  inner.traverse(o => { if (o.isMesh) o.castShadow = false; });
  // 微风摇摆
  const ph = Math.random() * 10;
  updaters.push(t => {
    g.rotation.z = Math.sin(t * 0.9 + ph) * 0.035;
    g.rotation.x = Math.sin(t * 0.7 + ph * 1.3) * 0.025;
    inner.rotation.y = Math.sin(t * 0.3 + ph) * 0.3;
  });
  return g;
}
export function lanternMaterial() { return lanternParts().body; }

// ───────────────────────── 串灯 ─────────────────────────
export function catenary(a, b, sag, n = 32) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return pts;
}

let wireMat;
export function stringLights(a, b, { sag = 0.35, spacing = 0.32, colors = [0xffd59a], intensity = 5, size = 0.022, twinkle = true } = {}) {
  wireMat = wireMat || new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.7 });
  const g = new THREE.Group();
  const pts = catenary(a, b, sag, 40);
  const curve = new THREE.CatmullRomCurve3(pts);
  const len = curve.getLength();
  const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.004, 5, false), wireMat);
  g.add(wire);
  const n = Math.max(2, Math.floor(len / spacing));
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(size, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), n);
  const m = new THREE.Matrix4();
  const base = [];
  for (let i = 0; i < n; i++) {
    const p = curve.getPointAt((i + 0.5) / n);
    m.makeTranslation(p.x, p.y - size * 1.3, p.z);
    im.setMatrixAt(i, m);
    const c = new THREE.Color(colors[i % colors.length]).multiplyScalar(intensity);
    base.push(c);
    im.setColorAt(i, c);
  }
  g.add(im);
  if (twinkle) {
    const ph = base.map(() => Math.random() * 100);
    const tmp = new THREE.Color();
    let acc = 0;
    updaters.push((t, dt) => {
      acc += dt; if (acc < 0.05) return; acc = 0;
      for (let i = 0; i < n; i++) {
        const k = 0.75 + 0.25 * Math.sin(t * 3 + ph[i]);
        im.setColorAt(i, tmp.copy(base[i]).multiplyScalar(k));
      }
      im.instanceColor.needsUpdate = true;
    });
  }
  return g;
}

// 一串挂灯笼
export function lanternString(a, b, { sag = 0.3, every = 1.6, scale = 0.9, drop = 0.15 } = {}) {
  wireMat = wireMat || new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.7 });
  const g = new THREE.Group();
  const pts = catenary(a, b, sag, 40);
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.005, 5, false), wireMat));
  const len = curve.getLength();
  const n = Math.max(1, Math.floor(len / every));
  for (let i = 0; i < n; i++) {
    const p = curve.getPointAt((i + 0.5) / n);
    const l = buildLantern(scale);
    l.position.copy(p); l.position.y -= drop;
    g.add(l);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, drop, 4), wireMat);
    str.position.copy(p); str.position.y -= drop / 2; g.add(str);
  }
  return g;
}

// ───────────────────────── 红色塑料凳 ─────────────────────────
export function buildStool(color = 0xc8232a) {
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const g = new THREE.Group();
  const topShape = new THREE.Shape();
  const s = 0.15, rr = 0.04;
  topShape.moveTo(-s + rr, -s); topShape.lineTo(s - rr, -s); topShape.quadraticCurveTo(s, -s, s, -s + rr);
  topShape.lineTo(s, s - rr); topShape.quadraticCurveTo(s, s, s - rr, s); topShape.lineTo(-s + rr, s);
  topShape.quadraticCurveTo(-s, s, -s, s - rr); topShape.lineTo(-s, -s + rr); topShape.quadraticCurveTo(-s, -s, -s + rr, -s);
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.035, 0, Math.PI * 2, true);
  topShape.holes.push(hole);
  const tg = new THREE.ExtrudeGeometry(topShape, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 });
  tg.rotateX(-Math.PI / 2);
  const top = new THREE.Mesh(tg, mat); top.position.y = 0.42; g.add(top);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.05, 0.29), mat); skirt.position.y = 0.4; g.add(skirt);
  const legGeo = new THREE.BoxGeometry(0.05, 0.42, 0.05);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const l = new THREE.Mesh(legGeo, mat);
    l.position.set(sx * 0.155, 0.2, sz * 0.155);
    l.rotation.z = -sx * 0.08; l.rotation.x = sz * 0.08;
    g.add(l);
  }
  return bake(shadowAll(g));
}

// ───────────────────────── 塑料水桶 ─────────────────────────
export function buildBucket(color = 0x2266cc) {
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, clearcoat: 0.3, side: THREE.DoubleSide });
  const pts = [[0, 0.005], [0.12, 0], [0.125, 0.01], [0.15, 0.27], [0.158, 0.275], [0.16, 0.285], [0.152, 0.285], [0.145, 0.27], [0.118, 0.016], [0, 0.016]]
    .map(p => new THREE.Vector2(p[0], p[1]));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 40), mat));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.004, 6, 32, Math.PI), metalMat());
  handle.position.y = 0.27; handle.rotation.y = 0.3; g.add(handle);
  return bake(shadowAll(g));
}

// ───────────────────────── 木箱 ─────────────────────────
let crateTex;
export function buildCrate(w = 0.5, h = 0.35, d = 0.4) {
  crateTex = crateTex || woodTexture({ c1: [168, 128, 82], c2: [128, 92, 54], seed: 21, rings: 14 });
  const mat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85 });
  const g = new THREE.Group();
  const planks = 3, gap = 0.012;
  for (let i = 0; i < planks; i++) {
    const ph = (h - gap * (planks - 1)) / planks;
    const y = ph / 2 + i * (ph + gap);
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(w, ph, 0.015), mat); a.position.set(0, y, s * (d / 2 - 0.008)); g.add(a);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.015, ph, d), mat); b.position.set(s * (w / 2 - 0.008), y, 0); g.add(b);
    }
  }
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(w, 0.015, d), mat); bottom.position.y = 0.008; g.add(bottom);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, 0.03), mat);
    post.position.set(sx * (w / 2 - 0.03), h / 2, sz * (d / 2 - 0.03)); g.add(post);
  }
  return bake(shadowAll(g));
}

// 立式价目牌（A 字架）
export function buildASign(tex, w = 0.5, h = 0.7) {
  const g = new THREE.Group();
  const board = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  const back = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 });
  const geo = new THREE.BoxGeometry(w, h, 0.015);
  const mats = [back, back, back, back, board, back];
  const f = new THREE.Mesh(geo, mats); f.position.set(0, h / 2 * Math.cos(0.18), 0.06); f.rotation.x = -0.18; g.add(f);
  const b = new THREE.Mesh(geo, back); b.position.set(0, h / 2 * Math.cos(0.18), -0.06); b.rotation.x = 0.18; g.add(b);
  return shadowAll(g);
}

export const R = rng;
