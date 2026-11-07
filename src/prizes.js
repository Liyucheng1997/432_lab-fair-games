// 套圈奖品建模（单位：米，原点在底面中心）
import * as THREE from 'three';
import { porcelainTexture, drinkLabel, rng } from './textures.js';
import { shadowAll, bake } from './props.js';

const V2 = (r, y) => new THREE.Vector2(r, y);

// 车床体，uv.y 按高度归一（贴图不被拉扯）
function lathe(points, seg = 40, uvByHeight = true) {
  const g = new THREE.LatheGeometry(points.map(p => V2(p[0], p[1])), seg);
  if (uvByHeight) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of points) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - minY) / (maxY - minY));
  }
  return g;
}

// 平滑轮廓
function smooth(points, n = 48) {
  const c = new THREE.SplineCurve(points.map(p => V2(p[0], p[1])));
  return c.getPoints(n).map(v => [Math.max(0, v.x), v.y]);
}

const M = {};
function mats() {
  if (M.ready) return M;
  M.ready = true;
  M.white = new THREE.MeshPhysicalMaterial({ color: 0xf6f3ec, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06 });
  M.gold = new THREE.MeshStandardMaterial({ color: 0xd8a73a, metalness: 1, roughness: 0.28 });
  M.black = new THREE.MeshPhysicalMaterial({ color: 0x090909, roughness: 0.1, clearcoat: 1 });
  M.red = new THREE.MeshPhysicalMaterial({ color: 0xc8151c, roughness: 0.3, clearcoat: 0.8 });
  M.pink = new THREE.MeshPhysicalMaterial({ color: 0xf29bb5, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 });
  M.pinkDark = new THREE.MeshPhysicalMaterial({ color: 0xd9708f, roughness: 0.25, clearcoat: 1 });
  // 玻璃：不用 transmission（会额外渲染整场景一遍），用半透明 + 清漆高光
  M.glassGreen = new THREE.MeshPhysicalMaterial({
    color: 0x1f5e26, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.88, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1,
  });
  M.glassClear = new THREE.MeshPhysicalMaterial({
    color: 0xeaf6ff, roughness: 0.04, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false,
  });
  M.alu = new THREE.MeshStandardMaterial({ color: 0xd0d3d6, metalness: 1, roughness: 0.25 });
  M.steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 1, roughness: 0.18 });
  M.porcelain = [porcelainTexture(1), porcelainTexture(2)].map(t =>
    new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04 }));
  M.cola = new THREE.MeshStandardMaterial({ map: drinkLabel('cola'), metalness: 0.55, roughness: 0.28 });
  M.beerLabel = new THREE.MeshStandardMaterial({ map: drinkLabel('beer'), roughness: 0.5 });
  M.teaLabel = new THREE.MeshStandardMaterial({ map: drinkLabel('tea'), roughness: 0.35 });
  M.terracotta = new THREE.MeshStandardMaterial({ color: 0xb05a33, roughness: 0.92 });
  M.soil = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 1 });
  M.cactus = new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 0.6 });
  M.duck = new THREE.MeshPhysicalMaterial({ color: 0xffd21a, roughness: 0.3, clearcoat: 0.6 });
  M.beak = new THREE.MeshPhysicalMaterial({ color: 0xff7a12, roughness: 0.35, clearcoat: 0.5 });
  M.plushCache = {};
  return M;
}

function plush(color) {
  const m = mats();
  if (!m.plushCache[color]) {
    const c = new THREE.Color(color);
    m.plushCache[color] = new THREE.MeshPhysicalMaterial({
      color: c, roughness: 0.95, sheen: 1, sheenRoughness: 0.55, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.45),
    });
  }
  return m.plushCache[color];
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

// ───────────────────────── 啤酒瓶 ─────────────────────────
function beerBottle() {
  const m = mats();
  const g = new THREE.Group();
  const prof = [
    [0, 0.002], [0.027, 0], [0.031, 0.004], [0.0315, 0.012], [0.0315, 0.15],
    ...smooth([[0.0315, 0.15], [0.029, 0.172], [0.019, 0.198], [0.0135, 0.222]], 12).slice(1),
    [0.0132, 0.244], [0.0148, 0.247], [0.0148, 0.252], [0.0125, 0.254], [0.011, 0.254],
  ];
  g.add(mesh(lathe(prof, 36), m.glassGreen));
  const label = mesh(new THREE.CylinderGeometry(0.0322, 0.0322, 0.075, 36, 1, true), m.beerLabel, 0, 0.085, 0);
  g.add(label);
  const neck = mesh(new THREE.CylinderGeometry(0.0145, 0.0165, 0.025, 24, 1, true), m.beerLabel, 0, 0.21, 0);
  g.add(neck);
  const cap = mesh(new THREE.CylinderGeometry(0.0155, 0.0158, 0.009, 21), m.gold, 0, 0.2555, 0);
  g.add(cap);
  return finish(g, '啤酒', 0.26);
}

// ───────────────────────── 易拉罐 ─────────────────────────
function colaCan() {
  const m = mats();
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.0331, 0.0331, 0.096, 40, 1, true), m.cola, 0, 0.06, 0));
  const bot = lathe([[0, 0.006], [0.02, 0.002], [0.026, 0], [0.031, 0.004], [0.0331, 0.012]], 40, false);
  g.add(mesh(bot, m.alu));
  const top = lathe([[0.0331, 0.108], [0.03, 0.117], [0.0285, 0.121], [0.0282, 0.123], [0.027, 0.1225], [0.026, 0.119], [0, 0.119]], 40, false);
  g.add(mesh(top, m.alu));
  const tab = mesh(new THREE.BoxGeometry(0.012, 0.0015, 0.022), m.alu, 0, 0.1205, 0.006);
  g.add(tab);
  return finish(g, '可乐', 0.123);
}

// ───────────────────────── 绿茶瓶（PET） ─────────────────────────
function teaBottle() {
  const m = mats();
  const g = new THREE.Group();
  const prof = smooth([[0, 0.003], [0.026, 0], [0.031, 0.01], [0.031, 0.06], [0.029, 0.075], [0.031, 0.09], [0.031, 0.15],
    [0.024, 0.185], [0.0135, 0.205], [0.0135, 0.21]], 40);
  g.add(mesh(lathe(prof, 32), m.glassClear));
  // 茶水
  const liq = new THREE.MeshPhysicalMaterial({ color: 0xb8c430, roughness: 0.15, transparent: true, opacity: 0.85, clearcoat: 0.6 });
  g.add(mesh(new THREE.CylinderGeometry(0.0285, 0.0285, 0.15, 28), liq, 0, 0.08, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.0318, 0.0318, 0.06, 32, 1, true), m.teaLabel, 0, 0.115, 0));
  const capMat = new THREE.MeshPhysicalMaterial({ color: 0x2b8a3e, roughness: 0.35, clearcoat: 0.5 });
  g.add(mesh(new THREE.CylinderGeometry(0.0155, 0.0155, 0.018, 24), capMat, 0, 0.218, 0));
  return finish(g, '绿茶', 0.227);
}

// ───────────────────────── 青花瓷梅瓶 ─────────────────────────
function meiping(seed = 0) {
  const m = mats();
  const g = new THREE.Group();
  const prof = smooth([
    [0.001, 0], [0.034, 0], [0.036, 0.01], [0.038, 0.05], [0.046, 0.11], [0.055, 0.17], [0.057, 0.2],
    [0.05, 0.226], [0.032, 0.242], [0.017, 0.252], [0.0155, 0.262], [0.02, 0.27], [0.019, 0.276], [0.012, 0.277], [0.011, 0.26],
  ], 60);
  g.add(mesh(lathe(prof.map(([r, y]) => [r * 0.92, y]), 48), m.porcelain[seed % 2]));
  return finish(g, '青花瓷瓶', 0.277);
}

// 青花葫芦瓶
function gourd(seed = 1) {
  const m = mats();
  const g = new THREE.Group();
  const prof = smooth([
    [0.001, 0], [0.03, 0], [0.042, 0.015], [0.05, 0.05], [0.046, 0.085], [0.026, 0.11], [0.024, 0.12],
    [0.034, 0.145], [0.035, 0.165], [0.026, 0.188], [0.012, 0.2], [0.011, 0.212], [0.014, 0.218], [0.009, 0.219], [0.008, 0.21],
  ], 60);
  g.add(mesh(lathe(prof, 48), m.porcelain[seed % 2]));
  return finish(g, '青花葫芦', 0.219);
}

// ───────────────────────── 小猪存钱罐 ─────────────────────────
function piggy() {
  const m = mats();
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.05, 40, 28), m.pink, 0, 0.056, 0);
  body.scale.set(1.0, 0.9, 1.12); g.add(body);
  const snout = mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.018, 28), m.pink, 0, 0.056, 0.058);
  snout.rotation.x = Math.PI / 2; g.add(snout);
  const nm = new THREE.SphereGeometry(0.0045, 10, 8);
  g.add(mesh(nm, m.pinkDark, -0.007, 0.057, 0.0675), mesh(nm, m.pinkDark, 0.007, 0.057, 0.0675));
  const eye = new THREE.SphereGeometry(0.0055, 12, 10);
  g.add(mesh(eye, m.black, -0.022, 0.078, 0.045), mesh(eye, m.black, 0.022, 0.078, 0.045));
  const ear = new THREE.ConeGeometry(0.014, 0.024, 16);
  for (const s of [-1, 1]) {
    const e = mesh(ear, m.pink, s * 0.026, 0.1, 0.022);
    e.rotation.set(0.5, 0, -s * 0.4); g.add(e);
  }
  const leg = new THREE.CylinderGeometry(0.011, 0.012, 0.022, 16);
  for (const [x, z] of [[-0.025, 0.03], [0.025, 0.03], [-0.025, -0.03], [0.025, -0.03]]) g.add(mesh(leg, m.pink, x, 0.011, z));
  const slot = mesh(new THREE.BoxGeometry(0.004, 0.006, 0.03), m.black, 0, 0.1, -0.005); g.add(slot);
  const tail = mesh(new THREE.TorusGeometry(0.008, 0.0025, 8, 16, Math.PI * 1.6), m.pinkDark, 0, 0.065, -0.058);
  g.add(tail);
  // 腮红 + 小花
  const blush = new THREE.MeshBasicMaterial({ color: 0xff6f8f, transparent: true, opacity: 0.5 });
  for (const s of [-1, 1]) {
    const b = mesh(new THREE.CircleGeometry(0.008, 16), blush, s * 0.034, 0.066, 0.041);
    b.lookAt(s * 0.34 * 2, 0.066, 0.8); g.add(b);
  }
  return finish(g, '小猪存钱罐', 0.11);
}

// ───────────────────────── 招财猫 ─────────────────────────
function luckyCat() {
  const m = mats();
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.042, 36, 24), m.white, 0, 0.045, 0); body.scale.set(1, 1.08, 0.9); g.add(body);
  const head = mesh(new THREE.SphereGeometry(0.036, 36, 24), m.white, 0, 0.112, 0.004); head.scale.set(1.12, 0.95, 0.95); g.add(head);
  const ear = new THREE.ConeGeometry(0.014, 0.022, 3);
  const earIn = new THREE.ConeGeometry(0.008, 0.014, 3);
  for (const s of [-1, 1]) {
    const e = mesh(ear, m.white, s * 0.024, 0.145, 0); e.rotation.z = -s * 0.35; g.add(e);
    const ei = mesh(earIn, m.pink, s * 0.0235, 0.144, 0.004); ei.rotation.z = -s * 0.35; g.add(ei);
  }
  // 举起的招财手
  const arm = mesh(new THREE.CapsuleGeometry(0.011, 0.035, 8, 16), m.white, 0.04, 0.115, 0.012);
  arm.rotation.z = -0.15; g.add(arm);
  g.add(mesh(new THREE.SphereGeometry(0.004, 8, 6), m.pink, 0.043, 0.14, 0.022));
  // 抱金币
  const coin = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.005, 32), m.gold, -0.006, 0.05, 0.04);
  coin.rotation.x = Math.PI / 2 - 0.25; coin.scale.set(1, 1, 1.35); g.add(coin);
  const paw = mesh(new THREE.SphereGeometry(0.01, 12, 10), m.white, -0.02, 0.055, 0.044); g.add(paw);
  // 红项圈 + 铃铛
  const collar = mesh(new THREE.TorusGeometry(0.03, 0.004, 8, 32), m.red, 0, 0.08, 0.003);
  collar.rotation.x = Math.PI / 2 + 0.15; g.add(collar);
  g.add(mesh(new THREE.SphereGeometry(0.0075, 16, 12), m.gold, 0, 0.074, 0.034));
  // 五官
  const eye = new THREE.SphereGeometry(0.0045, 10, 8);
  for (const s of [-1, 1]) {
    const e = mesh(eye, m.black, s * 0.014, 0.117, 0.034); e.scale.set(1.5, 0.45, 0.6); g.add(e);
  }
  g.add(mesh(new THREE.SphereGeometry(0.0035, 8, 6), m.pink, 0, 0.108, 0.038));
  // 底座
  g.add(mesh(new THREE.CylinderGeometry(0.044, 0.046, 0.012, 32), m.red, 0, 0.006, 0));
  return finish(g, '招财猫', 0.16);
}

// ───────────────────────── 毛绒小熊 ─────────────────────────
export function plushBear(color = 0x9a6438, scale = 1, name = '小熊公仔') {
  const m = mats();
  const fur = plush(color);
  const light = plush(new THREE.Color(color).lerp(new THREE.Color(0xfff1d8), 0.6).getHex());
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.046, 32, 24), fur, 0, 0.052, 0); body.scale.set(1, 1.12, 0.92); g.add(body);
  const belly = mesh(new THREE.SphereGeometry(0.03, 24, 16), light, 0, 0.05, 0.022); belly.scale.set(1, 1.2, 0.6); g.add(belly);
  const head = mesh(new THREE.SphereGeometry(0.04, 32, 24), fur, 0, 0.128, 0.004); g.add(head);
  const muzzle = mesh(new THREE.SphereGeometry(0.017, 20, 14), light, 0, 0.121, 0.036); muzzle.scale.set(1.2, 0.85, 0.8); g.add(muzzle);
  g.add(mesh(new THREE.SphereGeometry(0.0065, 12, 10), m.black, 0, 0.127, 0.049));
  const eye = new THREE.SphereGeometry(0.0055, 12, 10);
  g.add(mesh(eye, m.black, -0.015, 0.138, 0.034), mesh(eye, m.black, 0.015, 0.138, 0.034));
  const earG = new THREE.SphereGeometry(0.015, 20, 14);
  for (const s of [-1, 1]) {
    const e = mesh(earG, fur, s * 0.031, 0.158, -0.002); e.scale.set(1, 1, 0.6); g.add(e);
    const ei = mesh(new THREE.SphereGeometry(0.009, 14, 10), light, s * 0.031, 0.157, 0.004); ei.scale.set(1, 1, 0.4); g.add(ei);
  }
  const limb = new THREE.CapsuleGeometry(0.0135, 0.03, 8, 16);
  for (const s of [-1, 1]) {
    const a = mesh(limb, fur, s * 0.044, 0.07, 0.012); a.rotation.set(0.5, 0, s * 0.55); g.add(a);
    const l = mesh(limb, fur, s * 0.024, 0.016, 0.03); l.rotation.x = Math.PI / 2 - 0.1; g.add(l);
    const pad = mesh(new THREE.CircleGeometry(0.01, 16), light, s * 0.024, 0.016, 0.0585); g.add(pad);
  }
  // 蝴蝶结
  const bow = new THREE.MeshPhysicalMaterial({ color: 0xd8203a, roughness: 0.4, sheen: 0.6 });
  for (const s of [-1, 1]) {
    const b = mesh(new THREE.ConeGeometry(0.011, 0.02, 12), bow, s * 0.01, 0.094, 0.034);
    b.rotation.z = s * Math.PI / 2; g.add(b);
  }
  g.add(mesh(new THREE.SphereGeometry(0.005, 10, 8), bow, 0, 0.094, 0.036));
  g.scale.setScalar(scale);
  return finish(g, name, 0.173 * scale);
}

// ───────────────────────── 小黄鸭 ─────────────────────────
function duck() {
  const m = mats();
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.038, 32, 24), m.duck, 0, 0.032, -0.004); body.scale.set(1, 0.82, 1.2); g.add(body);
  const tail = mesh(new THREE.ConeGeometry(0.015, 0.03, 16), m.duck, 0, 0.05, -0.048); tail.rotation.x = -1.1; g.add(tail);
  const head = mesh(new THREE.SphereGeometry(0.024, 28, 20), m.duck, 0, 0.074, 0.016); g.add(head);
  const beak = mesh(new THREE.SphereGeometry(0.012, 18, 12), m.beak, 0, 0.068, 0.04); beak.scale.set(1.2, 0.45, 1.1); g.add(beak);
  const eye = new THREE.SphereGeometry(0.004, 10, 8);
  g.add(mesh(eye, m.black, -0.011, 0.082, 0.035), mesh(eye, m.black, 0.011, 0.082, 0.035));
  return finish(g, '小黄鸭', 0.098);
}

// ───────────────────────── 仙人掌盆栽 ─────────────────────────
let cactusGeo;
function cactus() {
  const m = mats();
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0.002], [0.028, 0], [0.03, 0.004], [0.04, 0.06], [0.044, 0.062], [0.044, 0.072], [0.04, 0.072], [0.036, 0.066], [0, 0.066]], 32, false), m.terracotta));
  g.add(mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.004, 24), m.soil, 0, 0.066, 0));
  if (!cactusGeo) {
    cactusGeo = new THREE.CapsuleGeometry(0.02, 0.05, 12, 24);
    const p = cactusGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
      const k = 1 + 0.09 * Math.cos(a * 8);
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    cactusGeo.computeVertexNormals();
  }
  g.add(mesh(cactusGeo, m.cactus, 0, 0.108, 0));
  const arm = mesh(cactusGeo, m.cactus, 0.024, 0.11, 0); arm.scale.setScalar(0.5); arm.rotation.z = -0.5; g.add(arm);
  const fl = new THREE.MeshPhysicalMaterial({ color: 0xff5fa2, roughness: 0.5, sheen: 1 });
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const p = mesh(new THREE.SphereGeometry(0.006, 10, 8), fl, Math.cos(a) * 0.006, 0.152, Math.sin(a) * 0.006);
    p.scale.set(1, 0.5, 1); g.add(p);
  }
  // 白刺
  const spineMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
  const sp = new THREE.CylinderGeometry(0.0004, 0.0004, 0.006, 3);
  const r = rng(9);
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(r() * 8) / 8 * Math.PI * 2, y = 0.08 + r() * 0.06;
    const s = mesh(sp, spineMat, Math.cos(a) * 0.022, y, Math.sin(a) * 0.022);
    s.rotation.z = Math.PI / 2; s.rotation.y = -a; g.add(s);
  }
  return finish(g, '仙人掌盆栽', 0.16);
}

// ───────────────────────── 保温杯 ─────────────────────────
function thermos(color = 0x2fa6a0) {
  const m = mats();
  const g = new THREE.Group();
  const body = new THREE.MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.38, clearcoat: 0.6 });
  g.add(mesh(lathe(smooth([[0, 0.001], [0.03, 0], [0.034, 0.008], [0.034, 0.14], [0.031, 0.152]], 20), 40, false), body));
  g.add(mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.012, 40), m.steel, 0, 0.158, 0));
  g.add(mesh(lathe([[0.031, 0.164], [0.032, 0.17], [0.032, 0.195], [0.029, 0.2], [0, 0.201]], 40, false), body));
  const grip = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  g.add(mesh(new THREE.CylinderGeometry(0.0322, 0.0322, 0.012, 40, 1, true), grip, 0, 0.18, 0));
  return finish(g, '保温杯', 0.201);
}

function finish(g, name, height) {
  shadowAll(g);
  bake(g);
  g.userData.prize = { name, height };
  return g;
}

// 奖品等级（越往后越值钱）
export const TIERS = [
  [() => duck(), () => colaCan(), () => cactus()],
  [() => colaCan(), () => teaBottle(), () => duck(), () => cactus()],
  [() => teaBottle(), () => thermos(0x2fa6a0), () => beerBottle(), () => thermos(0xe86a8a)],
  [() => beerBottle(), () => piggy(), () => thermos(0x3a6fd8), () => gourd(1)],
  [() => piggy(), () => luckyCat(), () => gourd(0), () => plushBear(0xc49a6c)],
  [() => luckyCat(), () => meiping(0), () => plushBear(0x9a6438), () => plushBear(0xf3b7c9, 1, '粉色小熊')],
  [() => meiping(1), () => luckyCat(), () => plushBear(0xf4f1ea, 1, '白色小熊'), () => meiping(0)],
];

export function makePrize(tier, r) {
  const list = TIERS[Math.min(tier, TIERS.length - 1)];
  return list[Math.floor(r() * list.length)]();
}

// 取模型顶点，用于物理凸包
export function hullPoints(obj, max = 600) {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const pts = [];
  const v = new THREE.Vector3();
  obj.traverse(o => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 120));
    const mtx = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mtx);
      pts.push(v.x, v.y, v.z);
    }
  });
  // 下采样
  if (pts.length / 3 > max) {
    const out = [];
    const step = (pts.length / 3) / max;
    for (let i = 0; i < max; i++) { const k = Math.floor(i * step) * 3; out.push(pts[k], pts[k + 1], pts[k + 2]); }
    return new Float32Array(out);
  }
  return new Float32Array(pts);
}
