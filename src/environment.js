// 夜市广场环境：夜空、地砖、远景楼房、摩天轮、邻近小吃摊、灯笼串
import * as THREE from 'three';
import { pavingTextures, windowsTexture, signTexture, rng, woodTexture, KAI } from './textures.js';
import {
  buildTent, buildLightbox, buildHangingBulb, stringLights, lanternString, buildLantern,
  buildStool, buildCrate, metalMat, glowMat, updaters, shadowAll, bake,
} from './props.js';

export function buildEnvironment(scene) {
  const env = new THREE.Group();
  scene.add(env);

  // ── 夜空 ──
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec3 vDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 top = vec3(0.004, 0.006, 0.02);
        vec3 mid = vec3(0.018, 0.016, 0.045);
        vec3 hor = vec3(0.16, 0.07, 0.05);
        vec3 col = mix(hor, mid, smoothstep(-0.02, 0.2, h));
        col = mix(col, top, smoothstep(0.18, 0.75, h));
        vec3 sp = d * 380.0; vec3 id = floor(sp);
        float s = hash(id);
        vec3 f = fract(sp) - 0.5;
        float star = step(0.9975, s) * smoothstep(0.25, 0.0, length(f)) * smoothstep(0.1, 0.4, h);
        col += star * (0.6 + 0.4 * sin(uTime * 2.0 + s * 300.0)) * 0.8;
        vec3 moonDir = normalize(vec3(0.45, 0.42, -0.78));
        float md = dot(d, moonDir);
        col += smoothstep(0.99945, 0.9996, md) * vec3(1.6, 1.55, 1.4);
        col += pow(max(md, 0.0), 600.0) * vec3(0.25, 0.25, 0.3) + pow(max(md, 0.0), 40.0) * vec3(0.02, 0.025, 0.04);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat);
  sky.renderOrder = -10;
  env.add(sky);
  updaters.push(t => { skyMat.uniforms.uTime.value = t; });

  scene.fog = new THREE.FogExp2(0x120d16, 0.013);

  // ── 地面 ──
  const pv = pavingTextures();
  const rep = 200 / 2.4;
  for (const k of ['map', 'roughnessMap', 'bumpMap']) pv[k].repeat.set(rep, rep);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ map: pv.map, roughnessMap: pv.roughnessMap, bumpMap: pv.bumpMap, bumpScale: 1.2, roughness: 1, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  env.add(ground);

  // ── 灯光 ──
  const hemi = new THREE.HemisphereLight(0x3a4a80, 0x1a120e, 0.5);
  env.add(hemi);
  const moon = new THREE.DirectionalLight(0x8fa6ff, 0.25);
  moon.position.set(30, 40, -50);
  env.add(moon);
  // 广场暖光
  for (const [x, z] of [[-2.5, 4], [2.5, 4], [0, 9]]) {
    const pl = new THREE.PointLight(0xff8a4a, 6, 14, 1.6);
    pl.position.set(x, 4.2, z);
    env.add(pl);
  }

  // ── 远景楼房 ──
  const winTex = windowsTexture(7);
  const bMat = new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.9, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.45 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 1 });
  const r = rng(42);
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + r() * 0.1;
    const dist = 85 + r() * 40;
    const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
    const w = 10 + r() * 14, h = 14 + r() * 40, d = 10 + r() * 10;
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv, nrm = geo.attributes.normal;
    for (let k = 0; k < uv.count; k++) {
      const ax = Math.abs(nrm.getX(k)) > 0.5 ? d : w;
      if (Math.abs(nrm.getY(k)) > 0.5) { uv.setXY(k, 0, 0); continue; }
      uv.setXY(k, uv.getX(k) * ax / 8, uv.getY(k) * h / 16);
    }
    const b = new THREE.Mesh(geo, [bMat, bMat, roofMat, roofMat, bMat, bMat]);
    b.position.set(x, h / 2, z);
    b.lookAt(0, h / 2, 0);
    env.add(b);
    // 楼顶红色航标灯
    if (h > 35) {
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), glowMat(0xff2010, 6));
      beacon.position.set(x, h + 0.4, z); env.add(beacon);
      const ph = r() * 6;
      updaters.push(t => { beacon.visible = Math.sin(t * 2.2 + ph) > 0.2; });
    }
  }

  // ── 摩天轮 ──
  env.add(buildFerrisWheel(new THREE.Vector3(-26, 0, -46)));

  // ── 树 ──
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x0f2414, roughness: 1, flatShading: true });
  const treePos = [[-11, -7], [-15, 2], [11, -7], [15, 3], [-9, 13], [9, 13], [-18, -10], [18, -11], [0, -12]];
  for (const [x, z] of treePos) {
    const t = new THREE.Group();
    const h = 2.6 + r() * 1.5;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, h, 8), trunkMat); tr.position.y = h / 2; t.add(tr);
    for (let k = 0; k < 5; k++) {
      const geo = new THREE.IcosahedronGeometry(0.9 + r() * 0.6, 1);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + r() * 0.3), p.getY(i) * (0.85 + r() * 0.3), p.getZ(i) * (0.85 + r() * 0.3));
      geo.computeVertexNormals();
      const l = new THREE.Mesh(geo, leafMat);
      l.position.set((r() - 0.5) * 1.4, h + (r() - 0.2) * 1.0, (r() - 0.5) * 1.4);
      t.add(l);
    }
    t.position.set(x, 0, z);
    shadowAll(t, false, true);
    env.add(bake(t));
    // 树上缠灯
    const cols = [0xffc870, 0xffe6b0];
    for (let k = 0; k < 3; k++) {
      const a = r() * Math.PI * 2;
      env.add(stringLights(
        new THREE.Vector3(x + Math.cos(a) * 1.4, h + 0.6, z + Math.sin(a) * 1.4),
        new THREE.Vector3(x + Math.cos(a + 2.4) * 1.3, h - 0.3, z + Math.sin(a + 2.4) * 1.3),
        { sag: 0.3, spacing: 0.18, colors: cols, intensity: 3.5, size: 0.016 }));
    }
  }

  // ── 灯杆 + 灯笼串 ──
  const poleH = 4.8;
  const poles = [[-9, 2.5], [9, 2.5], [-9, 7.5], [9, 7.5], [-3, 11], [3, 11]];
  for (const [x, z] of poles) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, poleH, 12), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.7, roughness: 0.5 }));
    pole.position.set(x, poleH / 2, z); pole.castShadow = true; env.add(pole);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.25, 12), new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.8 }));
    base.position.set(x, 0.125, z); env.add(base);
  }
  env.add(lanternString(new THREE.Vector3(-9, poleH - 0.1, 2.5), new THREE.Vector3(9, poleH - 0.1, 2.5), { sag: 0.6, every: 1.5, scale: 1 }));
  env.add(lanternString(new THREE.Vector3(-9, poleH - 0.1, 7.5), new THREE.Vector3(9, poleH - 0.1, 7.5), { sag: 0.6, every: 1.5, scale: 1 }));
  env.add(lanternString(new THREE.Vector3(-9, poleH - 0.3, 2.5), new THREE.Vector3(-9, poleH - 0.3, 7.5), { sag: 0.3, every: 1.6, scale: 0.8 }));
  env.add(lanternString(new THREE.Vector3(9, poleH - 0.3, 2.5), new THREE.Vector3(9, poleH - 0.3, 7.5), { sag: 0.3, every: 1.6, scale: 0.8 }));
  const bulbCols = [0xff4040, 0xffd040, 0x40ff70, 0x40a0ff, 0xff60e0];
  // 彩色串灯：之字形
  for (let k = 0; k < 4; k++) {
    const z0 = 2.5 + (k % 2) * 5, z1 = 2.5 + ((k + 1) % 2) * 5;
    env.add(stringLights(new THREE.Vector3(-9 + k * 4.5, poleH, z0), new THREE.Vector3(-9 + (k + 1) * 4.5, poleH, z1), { sag: 0.5, spacing: 0.3, colors: bulbCols, intensity: 4 }));
  }
  env.add(stringLights(new THREE.Vector3(-3, poleH, 11), new THREE.Vector3(3, poleH, 11), { sag: 0.5, colors: bulbCols, intensity: 4 }));
  env.add(stringLights(new THREE.Vector3(-9, poleH, 7.5), new THREE.Vector3(-3, poleH, 11), { sag: 0.5, colors: [0xffd59a], intensity: 4 }));
  env.add(stringLights(new THREE.Vector3(9, poleH, 7.5), new THREE.Vector3(3, poleH, 11), { sag: 0.5, colors: [0xffd59a], intensity: 4 }));

  // ── 邻近小吃摊（背景） ──
  const foods = [
    { x: -11.5, z: -1.2, title: '臭豆腐', sub: '长沙风味 · 10元一份', a: '#1d5fb3', b: '#f2f2f2', light: true },
    { x: 11.5, z: -1.2, title: '烤肠', sub: '火山石烤肠 5元一根', a: '#d8231e', b: '#f2f2f2', light: true },
    { x: 0, z: -3.6, title: '糖葫芦', sub: '冰糖葫芦 · 现做', a: '#c8141c', b: '#f6d33b', w: 2.6, d: 2.2, light: true },
    { x: -9, z: -11, title: '奶茶', sub: '珍珠奶茶 8元', a: '#7b3fb5', b: '#f2f2f2' },
    { x: -2.5, z: -11.5, title: '烤串', sub: '羊肉串 3元一串', a: '#d8231e', b: '#ffcf2f' },
    { x: 4, z: -11, title: '炸鸡', sub: '鸡排 12元', a: '#e2701a', b: '#f2f2f2' },
    { x: 10.5, z: -10.5, title: '凉皮', sub: '擀面皮 · 肉夹馍', a: '#1f8a4a', b: '#f2f2f2' },
    { x: -13, z: 9.5, title: '套娃', sub: '手工小玩具', a: '#1d5fb3', b: '#ffcf2f', ry: Math.PI / 2 },
    { x: 13, z: 9.5, title: '炒冰', sub: '水果捞 · 炒酸奶', a: '#18a0c8', b: '#f2f2f2', ry: -Math.PI / 2 },
  ];
  for (const f of foods) env.add(foodStall(f));

  // 中间的小桌凳
  for (const [x, z, c] of [[-1.4, 5.2, 0xc8232a], [1.2, 5.6, 0x2a62c8], [-0.2, 6.6, 0xc8232a], [2.0, 7.0, 0xc8232a]]) {
    const s = buildStool(c); s.position.set(x, 0, z); s.rotation.y = r() * 3; env.add(s);
  }

  return env;
}

// ───────────────────────── 背景小吃摊 ─────────────────────────
let counterTex;
function foodStall({ x, z, title, sub, a, b, w = 3, d = 2.4, ry = 0, light = false }) {
  const g = new THREE.Group();
  const tent = buildTent({ w, d, colA: a, colB: b, stripes: 10, h: 2.4 });
  g.add(tent);
  // 柜台
  counterTex = counterTex || woodTexture({ c1: [150, 105, 62], c2: [110, 72, 40], seed: 17 });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.9, 0.6), new THREE.MeshStandardMaterial({ map: counterTex, roughness: 0.8 }));
  counter.position.set(0, 0.45, d / 2 - 0.5); g.add(counter);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.04, 0.7), new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 0.8, roughness: 0.35 }));
  top.position.set(0, 0.92, d / 2 - 0.5); g.add(top);
  // 锅碗瓢盆
  const potMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.9, roughness: 0.3 });
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.14, 20), potMat);
    p.position.set(-0.7 + i * 0.7, 1.0, d / 2 - 0.55); g.add(p);
  }
  // 招牌
  const sign = buildLightbox(signTexture({ title, sub, w: 1024, h: 340, bg: ['#2a1206', '#120804'], titleColor: '#ffd75e' }), w * 0.7, w * 0.7 * 0.33, { spacing: 0.1 });
  sign.position.set(0, 2.62, d / 2 + 0.05); g.add(sign);
  // 灯
  for (const sx of [-0.6, 0.6]) {
    const bulb = buildHangingBulb(0.45, 0xffcf8a, 7);
    bulb.position.set(sx * w / 2, 2.42, 0.2); g.add(bulb);
  }
  if (light) {
    const pl = new THREE.PointLight(0xffb066, 5, 7, 1.8);
    pl.position.set(0, 1.9, 0.6);
    g.add(pl);
  }
  // 后面的蒸汽 / 货箱
  const crate = buildCrate(); crate.position.set(w / 2 - 0.4, 0, -d / 2 + 0.4); g.add(crate);
  bake(g);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return g;
}

// ───────────────────────── 摩天轮 ─────────────────────────
function buildFerrisWheel(pos) {
  const g = new THREE.Group();
  const R = 14, H = 17;
  const steel = new THREE.MeshStandardMaterial({ color: 0x8890a0, metalness: 0.7, roughness: 0.5 });
  // 支架
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const a = new THREE.Vector3(sx * 7, 0, sz * 2.5), b = new THREE.Vector3(0, H, sz * 1.2);
    const len = a.distanceTo(b);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, len, 8), steel);
    leg.position.copy(a).add(b).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(leg);
  }
  const wheel = new THREE.Group();
  wheel.position.y = H;
  g.add(wheel);
  for (const z of [-0.6, 0.6]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.12, 6, 96), steel); rim.position.z = z; wheel.add(rim);
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.08, 6, 64), steel); rim2.position.z = z; wheel.add(rim2);
  }
  const spokes = 24;
  for (let i = 0; i < spokes; i++) {
    const a = i / spokes * Math.PI * 2;
    for (const z of [-0.6, 0.6]) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, R, 4), steel);
      s.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, z); s.rotation.z = a - Math.PI / 2; wheel.add(s);
    }
  }
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2, 16).rotateX(Math.PI / 2), steel));
  // 灯珠
  const nLights = 240;
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), nLights);
  const mtx = new THREE.Matrix4();
  const info = [];
  let k = 0;
  for (let i = 0; i < 96; i++) {
    const a = i / 96 * Math.PI * 2;
    for (const z of [-0.65, 0.65]) { mtx.makeTranslation(Math.cos(a) * R, Math.sin(a) * R, z); im.setMatrixAt(k, mtx); info.push({ a, r: 1 }); k++; }
  }
  for (let i = 0; i < spokes && k < nLights; i++) {
    const a = i / spokes * Math.PI * 2;
    for (let j = 1; j <= 2 && k < nLights; j++) {
      const rr = R * j / 2.6;
      mtx.makeTranslation(Math.cos(a) * rr, Math.sin(a) * rr, 0.65); im.setMatrixAt(k, mtx); info.push({ a, r: j / 3 }); k++;
    }
  }
  im.count = k;
  wheel.add(im);
  // 吊舱
  const cabins = [];
  const cabinCols = [0xd83a3a, 0x3a8ad8, 0xe8c23a, 0x3ad87a, 0xd83ab8, 0xe8823a];
  const winGlow = glowMat(0xffd9a0, 1.6);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    const cab = new THREE.Group();
    cab.userData.noBake = true;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 1.4), new THREE.MeshStandardMaterial({ color: cabinCols[i % 6], roughness: 0.5, metalness: 0.2 }));
    body.position.y = -1.1; cab.add(body);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.6), winGlow); w.position.set(0, -0.95, 0.71); cab.add(w);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.4, 4).rotateY(Math.PI / 4), steel); roof.position.y = -0.2; cab.add(roof);
    cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    bake(cab);
    wheel.add(cab);
    cabins.push(cab);
  }
  bake(wheel);
  wheel.userData.noBake = true;
  bake(g);
  const c = new THREE.Color();
  updaters.push((t, dt) => {
    wheel.rotation.z += dt * 0.05;
    for (const cab of cabins) cab.rotation.z = -wheel.rotation.z;
    for (let i = 0; i < k; i++) {
      const { a, r } = info[i];
      const hue = (a / (Math.PI * 2) + t * 0.08 + r * 0.2) % 1;
      c.setHSL(hue, 0.9, 0.55).multiplyScalar(3.2);
      im.setColorAt(i, c);
    }
    im.instanceColor.needsUpdate = true;
  });
  g.position.copy(pos);
  g.rotation.y = 0.5;
  return g;
}
