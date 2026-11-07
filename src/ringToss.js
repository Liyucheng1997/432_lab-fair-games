// 套圈游戏：Rapier 刚体物理 —— 圈由 18 段胶囊拼成，奖品是凸包碰撞体
import * as THREE from 'three';
import {
  buildTent, buildLightbox, buildHangingBulb, buildBucket, buildStool, buildASign, buildCrate,
  shadowAll, stringLights,
} from './props.js';
import { feltTexture, woodTexture, signTexture, tapeTexture, priceCardTexture, glowTexture, rng, KAI } from './textures.js';
import { makePrize, hullPoints, plushBear, TIERS } from './prizes.js';

export const RING_R = 0.074, RING_TUBE = 0.0072, INNER = RING_R - RING_TUBE;
const RING_COLORS = [0xe8262d, 0xf6c21c, 0x1f7fe0, 0x23b04a, 0xff7a1a, 0xc23fd0];
const ROUND_RINGS = 15;
const G = 9.81;
const UP = new THREE.Vector3(0, 1, 0);

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const easeOut = x => 1 - Math.pow(1 - x, 3);

export class RingToss {
  constructor(app, origin) {
    this.app = app;
    this.R = app.RAPIER;
    this.origin = origin.clone();
    this.group = new THREE.Group();
    this.group.position.copy(origin);
    app.scene.add(this.group);
    this.active = false;
    this.rings = [];
    this.prizes = [];
    this.anims = [];
    this.inHand = ROUND_RINGS;
    this.thrown = 0;
    this.arc = 0.86;
    this.charging = false;
    this.chargeT = 0;
    this.cooldown = 0;
    this.mouse = new THREE.Vector2(0, -0.2);
    this.look = new THREE.Vector2();
    this.t = 0;
    this.rand = rng(2024);
    this.ray = new THREE.Raycaster();
    this.target = new THREE.Vector3();
    this.aimPoint = new THREE.Vector3();
    this.aimHeight = 0;
    this.wonRound = [];
    this.roundOver = false;
    this._initPhysics();
    this._buildStall();
    this._buildRingAssets();
    this._stockPrizes();
    this._buildAimUI();
  }

  // ───────────────────────── 物理 ─────────────────────────
  _initPhysics() {
    const R = this.R;
    this.world = new R.World({ x: 0, y: -G, z: 0 });
    this.world.timestep = 1 / 240;
    try { this.world.integrationParameters.numSolverIterations = 8; } catch (e) { /* 旧版本无此字段 */ }
    this.events = new R.EventQueue(true);
    this.kind = new Map();
    this.ringOf = new Map();
    this.acc = 0;
    const o = this.origin;
    const gb = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(o.x, -0.05, o.z - 2));
    const gc = this.world.createCollider(R.ColliderDesc.cuboid(5, 0.05, 7).setFriction(0.95).setRestitution(0.12), gb);
    this.kind.set(gc.handle, 'ground');
  }

  _fixedBox(x, y, z, hx, hy, hz, kind = 'wood', fr = 0.5, rest = 0.3) {
    const R = this.R, o = this.origin;
    const b = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(o.x + x, y, o.z + z));
    const c = this.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setFriction(fr).setRestitution(rest), b);
    this.kind.set(c.handle, kind);
    return c;
  }

  // ───────────────────────── 摊位 ─────────────────────────
  _buildStall() {
    const g = this.group;
    const tent = buildTent({ w: 3.9, d: 6.5, h: 2.5, roofH: 0.85, colA: '#c8141c', colB: '#f5d33a', stripes: 14 });
    tent.position.set(0, 0, -2.85);
    g.add(tent);

    // 红绒地毯
    const felt = feltTexture([150, 16, 22], 3);
    felt.repeat.set(3, 4.3);
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 4.3), new THREE.MeshStandardMaterial({ map: felt, roughness: 0.96 }));
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.004, -2.95);
    carpet.receiveShadow = true;
    g.add(carpet);
    // 金色包边
    const trim = new THREE.MeshStandardMaterial({ color: 0xd8aa3c, metalness: 0.6, roughness: 0.4 });
    for (const [w, d, x, z] of [[3.0, 0.03, 0, -0.8], [3.0, 0.03, 0, -5.1], [0.03, 4.3, -1.5, -2.95], [0.03, 4.3, 1.5, -2.95]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.006, d), trim);
      m.position.set(x, 0.006, z); m.receiveShadow = true; g.add(m);
    }

    // 木围栏（挡圈）
    const wood = woodTexture({ c1: [176, 124, 70], c2: [132, 86, 44], seed: 8 });
    const woodMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.72 });
    const fh = 0.14;
    const board = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), woodMat);
      m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m);
      this._fixedBox(x, y, z, w / 2, h / 2, d / 2, 'wood', 0.45, 0.35);
    };
    board(0.03, fh, 4.3, -1.53, fh / 2, -2.95);
    board(0.03, fh, 4.3, 1.53, fh / 2, -2.95);
    board(3.09, fh, 0.03, 0, fh / 2, -5.13);

    // 投掷线
    const tape = tapeTexture(); tape.repeat.set(6, 1);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.06), new THREE.MeshStandardMaterial({ map: tape, roughness: 0.6 }));
    line.rotation.x = -Math.PI / 2; line.position.set(0, 0.003, 0); line.receiveShadow = true;
    g.add(line);

    // 后排阶梯货架 + 大奖
    const shelfFelt = feltTexture([170, 20, 26], 5);
    shelfFelt.repeat.set(3, 1);
    const shelfMat = new THREE.MeshStandardMaterial({ map: shelfFelt, roughness: 0.95 });
    for (let i = 0; i < 3; i++) {
      const h = 0.3 + i * 0.3;
      const m = new THREE.Mesh(new THREE.BoxGeometry(3.5, h, 0.28), shelfMat);
      m.position.set(0, h / 2, -5.36 - i * 0.28); m.castShadow = m.receiveShadow = true; g.add(m);
    }
    // 背景红布墙
    const wallTex = feltTexture([120, 10, 16], 6); wallTex.repeat.set(3, 2);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(3.85, 2.5), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 }));
    wall.position.set(0, 1.25, -6.08); wall.receiveShadow = true; g.add(wall);
    const banner = buildLightbox(signTexture({ title: '套中即送', sub: '童叟无欺 · 套哪个送哪个', w: 1024, h: 300 }), 2.2, 0.64, { spacing: 0.09 });
    banner.position.set(0, 1.85, -6.0); g.add(banner);
    // 对联
    for (const [sx, txt] of [[-1, '眼疾手快套好运'], [1, '圈圈相扣喜连连']]) {
      const c = buildLightbox(signTexture({ title: txt, vertical: true, w: 160, h: 1024, titleColor: '#ffe08a' }), 0.2, 1.3, { bulbs: false, glow: 0.7 });
      c.position.set(sx * 1.62, 1.35, -6.0); g.add(c);
    }

    // 大奖摆台
    const bigs = [
      [plushBear(0x9a6438, 3.4, '大熊'), -1.25, 0.9, -5.92],
      [plushBear(0xf3b7c9, 2.8, '粉熊'), -0.55, 0.9, -5.92],
      [plushBear(0xf4f1ea, 3.0, '白熊'), 0.55, 0.9, -5.92],
      [plushBear(0x6aa8e0, 2.6, '蓝熊'), 1.25, 0.9, -5.92],
      [TIERS[6][0](), -1.0, 0.6, -5.64],
      [TIERS[5][0](), -0.35, 0.6, -5.64],
      [TIERS[4][0](), 0.35, 0.6, -5.64],
      [TIERS[6][3](), 1.0, 0.6, -5.64],
      [TIERS[3][1](), -0.8, 0.3, -5.36],
      [TIERS[2][1](), 0.0, 0.3, -5.36],
      [TIERS[2][3](), 0.8, 0.3, -5.36],
    ];
    for (const [obj, x, y, z] of bigs) {
      if (!obj.userData.prize.name.includes('熊')) obj.scale.multiplyScalar(1.7);
      obj.position.set(x, y, z); obj.rotation.y = (Math.random() - 0.5) * 0.4;
      g.add(obj);
    }

    // 正面招牌（总览时可见）
    const sign = buildLightbox(signTexture({ title: '套 圈', sub: '10元15个 · 20元35个', w: 1024, h: 320 }), 2.6, 0.8);
    sign.position.set(0, 3.0, 0.48);
    g.add(sign);
    // 支架
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.5 }));
      p.position.set(sx * 1.1, 2.6, 0.45); g.add(p);
    }

    // 灯
    const spot = new THREE.SpotLight(0xffe2b8, 13, 9, 1.0, 0.55, 1.4);
    spot.position.set(0, 2.42, -1.6);
    spot.target.position.set(0, 0, -3.3);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.015;
    spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 8;
    spot.shadow.radius = 3;
    g.add(spot, spot.target);
    const spot2 = new THREE.SpotLight(0xffd9a6, 6, 7, 0.9, 0.6, 1.4);
    spot2.position.set(0, 2.35, -4.6);
    spot2.target.position.set(0, 0.5, -5.9);
    g.add(spot2, spot2.target);
    const fill = new THREE.PointLight(0xffc890, 2.2, 6, 1.6);
    fill.position.set(0, 2.1, 0.2);
    g.add(fill);
    for (const z of [-0.6, -2.0, -3.4, -4.8]) {
      for (const x of [-0.9, 0.9]) {
        const b = buildHangingBulb(0.25 + Math.random() * 0.12, 0xffd6a0, 7);
        b.position.set(x, 2.5, z); g.add(b);
      }
    }
    // 顶棚内彩灯
    const cols = [0xff4040, 0xffd040, 0x40ff70, 0x40a0ff, 0xff60e0];
    g.add(stringLights(new THREE.Vector3(-1.9, 2.48, 0.38), new THREE.Vector3(1.9, 2.48, 0.38), { sag: 0.12, spacing: 0.16, colors: cols, size: 0.016 }));
    g.add(stringLights(new THREE.Vector3(-1.9, 2.48, 0.38), new THREE.Vector3(-1.9, 2.48, -6.0), { sag: 0.15, spacing: 0.2, colors: cols, size: 0.016 }));
    g.add(stringLights(new THREE.Vector3(1.9, 2.48, 0.38), new THREE.Vector3(1.9, 2.48, -6.0), { sag: 0.15, spacing: 0.2, colors: cols, size: 0.016 }));

    // 道具：装圈的桶、价目牌、凳子、箱子
    const bucket = buildBucket(0x2a6fd0);
    bucket.position.set(1.62, 0, 0.55);
    g.add(bucket);
    this.bucketRings = new THREE.Group();
    bucket.add(this.bucketRings);
    const price = buildASign(priceCardTexture([
      { text: '套 圈', size: 96, font: KAI },
      { text: '10元 15个', size: 64 },
      { text: '20元 35个', size: 64 },
      { text: '套中即送', size: 52, color: '#d4890a' },
    ], { w: 512, h: 640 }), 0.5, 0.65);
    price.position.set(-1.72, 0, 0.45); price.rotation.y = 0.5;
    g.add(price);
    const stool = buildStool(); stool.position.set(2.2, 0, -0.6); stool.rotation.y = 0.4; g.add(stool);
    const crate = buildCrate(0.55, 0.32, 0.4); crate.position.set(-2.25, 0, -1.4); crate.rotation.y = 0.2; g.add(crate);
    const crate2 = buildCrate(0.55, 0.32, 0.4); crate2.position.set(-2.25, 0.32, -1.4); crate2.rotation.y = -0.1; g.add(crate2);
  }

  // ───────────────────────── 圈 ─────────────────────────
  _buildRingAssets() {
    this.ringGeo = new THREE.TorusGeometry(RING_R, RING_TUBE, 14, 64);
    this.ringGeo.rotateX(Math.PI / 2);
    this.ringMats = RING_COLORS.map(c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 }));
    this.held = new THREE.Mesh(this.ringGeo, this.ringMats[0]);
    this.held.visible = false;
    this.held.castShadow = false;
    this.app.camera.add(this.held);
    this.heldPos = new THREE.Vector3(0.2, -0.25, -0.62);
    this._fillBucket();
  }

  _fillBucket() {
    while (this.bucketRings.children.length) this.bucketRings.remove(this.bucketRings.children[0]);
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(this.ringGeo, this.ringMats[i % RING_COLORS.length]);
      m.position.set((Math.random() - 0.5) * 0.08, 0.12 + i * 0.006, (Math.random() - 0.5) * 0.08);
      m.rotation.set((Math.random() - 0.5) * 0.9, Math.random() * 3, (Math.random() - 0.5) * 0.9);
      m.scale.setScalar(0.9);
      this.bucketRings.add(m);
    }
  }

  _spawnRing(pos, quat, vel, angvel, matIdx) {
    const R = this.R;
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
        .setLinvel(vel.x, vel.y, vel.z)
        .setAngvel({ x: angvel.x, y: angvel.y, z: angvel.z })
        .setCcdEnabled(true)
        .setLinearDamping(0.04)
        .setAngularDamping(0.25),
    );
    const ring = { body, state: 'flying', age: 0, still: 0, lastSound: -1, prevSpeed: 0 };
    const N = 18;
    const seg = 2 * RING_R * Math.sin(Math.PI / N);
    const rc = RING_R * Math.cos(Math.PI / N);
    const tan = new THREE.Vector3(), q = new THREE.Quaternion();
    for (let i = 0; i < N; i++) {
      const a = (i + 0.5) / N * Math.PI * 2;
      tan.set(-Math.sin(a), 0, Math.cos(a));
      q.setFromUnitVectors(UP, tan);
      const d = R.ColliderDesc.capsule(seg / 2, RING_TUBE)
        .setTranslation(Math.cos(a) * rc, 0, Math.sin(a) * rc)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setDensity(420).setFriction(0.5).setRestitution(0.28)
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
      const c = this.world.createCollider(d, body);
      this.kind.set(c.handle, 'ring');
      this.ringOf.set(c.handle, ring);
    }
    const mesh = new THREE.Mesh(this.ringGeo, this.ringMats[matIdx]);
    mesh.castShadow = true;
    mesh.position.copy(pos); mesh.quaternion.copy(quat);
    this.app.scene.add(mesh);
    ring.mesh = mesh;
    this.rings.push(ring);
    return ring;
  }

  _removeRing(ring) {
    if (ring.body) {
      const n = ring.body.numColliders();
      for (let i = 0; i < n; i++) { const c = ring.body.collider(i); this.kind.delete(c.handle); this.ringOf.delete(c.handle); }
      this.world.removeRigidBody(ring.body);
      ring.body = null;
    }
    if (ring.mesh) { this.app.scene.remove(ring.mesh); ring.mesh = null; }
    ring.state = 'gone';
  }

  // ───────────────────────── 奖品 ─────────────────────────
  _stockPrizes() {
    const R = this.R, r = this.rand, o = this.origin;
    const cols = [-1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2];
    for (let k = 0; k < 8; k++) for (let c = 0; c < cols.length; c++) {
      const id = k * cols.length + c;
      const old = this.prizes[id];
      if (old && !old.won) continue;
      const obj = makePrize(k, r);
      const x = cols[c] + (k % 2 ? 0.1 : -0.1) + (r() - 0.5) * 0.05, z = -1.22 - k * 0.44 + (r() - 0.5) * 0.05;
      obj.position.set(x, 0, z);
      obj.rotation.y = (r() - 0.5) * 0.9;
      obj.updateMatrix();
      const pts = hullPoints(obj, 1800);
      // 保证每件奖品理论上都能套进去（脚印半径 ≤ 5.8cm，圈内径 6.7cm）
      let rad = 0;
      for (let i = 0; i < pts.length; i += 3) rad = Math.max(rad, Math.hypot(pts[i], pts[i + 2]));
      const sc = rad > 0.058 ? 0.058 / rad : 1;
      if (sc < 1) { obj.scale.setScalar(sc); for (let i = 0; i < pts.length; i++) pts[i] *= sc; }
      this.group.add(obj);
      const qq = obj.quaternion;
      const body = this.world.createRigidBody(R.RigidBodyDesc.fixed()
        .setTranslation(o.x + x, 0, o.z + z)
        .setRotation({ x: qq.x, y: qq.y, z: qq.z, w: qq.w }));
      const desc = R.ColliderDesc.convexHull(pts);
      // 釉面/玻璃：滑、几乎不反弹（圈撞上去会顺着滑下，而不是被弹飞）
      desc.setFriction(this.prizeFriction ?? 0.12).setRestitution(this.prizeRest ?? 0.0)
        .setFrictionCombineRule(R.CoefficientCombineRule.Min)
        .setRestitutionCombineRule(R.CoefficientCombineRule.Min);
      const col = this.world.createCollider(desc, body);
      this.kind.set(col.handle, 'prize');
      // 世界坐标下的凸包点（判定用）
      const cs = Math.cos(obj.rotation.y), sn = Math.sin(obj.rotation.y);
      const wpts = new Float32Array(pts.length);
      for (let i = 0; i < pts.length; i += 3) {
        wpts[i] = o.x + x + pts[i] * cs + pts[i + 2] * sn;
        wpts[i + 1] = pts[i + 1];
        wpts[i + 2] = o.z + z - pts[i] * sn + pts[i + 2] * cs;
      }
      this.prizes[id] = { obj, body, info: obj.userData.prize, h: obj.userData.prize.height * sc, rad: rad * sc, sc, pts: wpts, won: false, tier: k, x: o.x + x, z: o.z + z };
      if (old) { obj.scale.setScalar(0.001); this.anims.push({ type: 'restock', obj, sc, t: -c * 0.06 - k * 0.04 }); }
    }
  }

  // ───────────────────────── 瞄准显示 ─────────────────────────
  _buildAimUI() {
    const sc = this.app.scene;
    const mk = (inner, outer, color, op) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 72),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 5; m.visible = false; sc.add(m);
      return m;
    };
    this.reticle = mk(INNER - 0.003, RING_R + 0.006, 0xffffff, 0.95);
    this.spread = mk(0.965, 1.0, 0xffffff, 0.28);
    this.centerDot = mk(0, 0.008, 0xffffff, 0.8);
    // 悬停奖品时脚下的金色光晕
    this.hoverGlow = new THREE.Mesh(new THREE.CircleGeometry(0.13, 40),
      new THREE.MeshBasicMaterial({ map: glowTexture('rgba(255,210,90,1)', 'rgba(255,180,40,0)'), color: 0xffc040, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.hoverGlow.rotation.x = -Math.PI / 2;
    this.hoverGlow.renderOrder = 4;
    this.hoverGlow.visible = false;
    sc.add(this.hoverGlow);
    const N = 34;
    this.trajGeo = new THREE.BufferGeometry();
    this.trajGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.traj = new THREE.Points(this.trajGeo, new THREE.PointsMaterial({
      size: 0.05, map: glowTexture(), transparent: true, depthWrite: false, color: 0xfff0c0, opacity: 0.7, toneMapped: false, blending: THREE.AdditiveBlending,
    }));
    this.traj.frustumCulled = false;
    this.traj.visible = false;
    this.trajN = N;
    sc.add(this.traj);
  }

  _sigma() {
    if (!this.charging) return 0.04;
    const h = this.chargeT;
    if (h < 0.8) return 0.04 - 0.0355 * easeOut(h / 0.8);
    if (h < 2.4) return 0.0045;
    return Math.min(0.06, 0.0045 + (h - 2.4) * 0.03);
  }

  _solve(P0, T, theta) {
    const dx = T.x - P0.x, dz = T.z - P0.z;
    const D = Math.max(0.05, Math.hypot(dx, dz));
    const dy = T.y - P0.y;
    let th = theta;
    if (D * Math.tan(th) - dy < 0.05) th = Math.atan((dy + 0.05) / D) + 0.05;
    const c = Math.cos(th);
    const v = Math.sqrt(G * D * D / (2 * c * c * (D * Math.tan(th) - dy)));
    return new THREE.Vector3(dx / D * v * c, v * Math.sin(th), dz / D * v * c);
  }

  // 瞄准奖品时，实际出手目标比“幻影圈”略往前：圈落下时后沿会碰到奖品背面，然后顺势套进去
  _physTarget(P0, pt) {
    const T = pt.clone();
    if (!this.hover) return T;
    // 前移量随奖品高度和落地角度变化：越高、落得越“平”，越要往后瞄
    const v = this._solve(P0, T, this.arc);
    const vh = Math.hypot(v.x, v.z), vy = Math.sqrt(v.y * v.y + 2 * G * Math.max(0, P0.y - T.y));
    const off = 0.015 + 0.17 * this.hover.h * vh / Math.max(vy, 0.5);
    const dx = T.x - P0.x, dz = T.z - P0.z, D = Math.hypot(dx, dz) || 1;
    T.x += dx / D * off; T.z += dz / D * off;
    return T;
  }

  _updateAim(dt) {
    const cam = this.app.camera;
    this.ray.setFromCamera(this.mouse, cam);
    const ro = this.ray.ray.origin, rd = this.ray.ray.direction;
    const o = this.origin;
    // 找鼠标指向的奖品（以其顶面高度为瞄准面）
    let best = null, bd = 0.085;
    const hh = rd.x * rd.x + rd.z * rd.z;
    for (const p of this.prizes) {
      if (!p || p.won || rd.y > -0.01) continue;
      const h = p.h;
      // 射线与奖品竖直轴（0..h）的最近距离
      let s = ((p.x - ro.x) * rd.x + (p.z - ro.z) * rd.z) / hh;
      let y = ro.y + rd.y * s;
      if (y > h) { s = (h - ro.y) / rd.y; y = h; }
      if (y < 0) continue;
      const d = Math.hypot(ro.x + rd.x * s - p.x, ro.z + rd.z * s - p.z);
      if (d < bd) {
        bd = d;
        // 轻微吸附到奖品中心：鼠标指着瓶身时也能自然瞄到瓶口
        const tt = (h - ro.y) / rd.y;
        const ox = ro.x + rd.x * tt - p.x, oz = ro.z + rd.z * tt - p.z;
        const ol = Math.hypot(ox, oz), keep = Math.min(ol, 0.04) / (ol || 1) * 0.6;
        best = { p, h, px: p.x + ox * keep, pz: p.z + oz * keep };
      }
    }
    let T;
    if (best) {
      T = new THREE.Vector3(best.px, best.h + 0.004, best.pz);
      this.hover = best.p;
    } else {
      this.hover = null;
      if (rd.y > -0.01) return;
      const t = (0.004 - ro.y) / rd.y;
      T = new THREE.Vector3(ro.x + rd.x * t, 0.004, ro.z + rd.z * t);
    }
    T.x = Math.max(o.x - 1.8, Math.min(o.x + 1.8, T.x));
    T.z = Math.max(o.z - 5.3, Math.min(o.z - 0.55, T.z));
    this.target.copy(T);

    const P0 = this.held.getWorldPosition(new THREE.Vector3());
    const D = Math.hypot(T.x - P0.x, T.z - P0.z);
    const sig = this._sigma();
    const amp = sig * D;
    const t = this.t;
    const sx = (Math.sin(t * 1.7) + 0.6 * Math.sin(t * 2.9 + 1.3) + 0.35 * Math.sin(t * 5.3 + 0.4)) / 1.95;
    const sz = (Math.sin(t * 1.3 + 2.1) + 0.6 * Math.sin(t * 3.7 + 0.2) + 0.35 * Math.sin(t * 4.9 + 2.2)) / 1.95;
    this.aimPoint.set(T.x + sx * amp, T.y, T.z + sz * amp * 1.3);
    this.amp = amp;

    const steady = this.charging && sig <= 0.006;
    const col = steady ? 0xffcf3a : (this.charging && this.chargeT > 2.4 ? 0xff6a50 : 0xffffff);
    this.reticle.material.color.setHex(col);
    this.centerDot.material.color.setHex(col);
    this.reticle.position.copy(this.aimPoint);
    this.centerDot.position.copy(this.aimPoint);
    this.spread.position.copy(T); this.spread.position.y += 0.001;
    this.spread.scale.setScalar(RING_R + amp * 1.25);
    const showAim = this.inHand > 0 && this.cooldown <= 0 && !this.roundOver;
    this.reticle.visible = this.centerDot.visible = this.spread.visible = showAim;
    this.hoverGlow.visible = showAim && !!this.hover;
    if (this.hover) {
      this.hoverGlow.position.set(this.hover.x, 0.009, this.hover.z);
      this.hoverGlow.scale.setScalar(1 + 0.06 * Math.sin(this.t * 6));
    }

    // 抛物线预览
    this.traj.visible = showAim && this.charging && this.app.ui.assist;
    if (this.traj.visible) {
      const PT = this._physTarget(P0, this.aimPoint);
      const v = this._solve(P0, PT, this.arc);
      const flight = (v.y + Math.sqrt(Math.max(0, v.y * v.y + 2 * G * (P0.y - PT.y)))) / G;
      const pos = this.trajGeo.attributes.position;
      for (let i = 0; i < this.trajN; i++) {
        const tt = (i + 1) / (this.trajN + 1) * flight;
        pos.setXYZ(i, P0.x + v.x * tt, P0.y + v.y * tt - 0.5 * G * tt * tt, P0.z + v.z * tt);
      }
      pos.needsUpdate = true;
      this.traj.material.opacity = 0.25 + 0.4 * Math.min(1, this.chargeT / 0.75);
    }
    this.app.ui.setSteady(this.charging ? Math.max(0, Math.min(1, (0.04 - sig) / 0.0355)) : -1, this.chargeT > 2.4);
  }

  _throw() {
    if (this.inHand <= 0 || this.cooldown > 0 || this.roundOver) return;
    const P0 = this.held.getWorldPosition(new THREE.Vector3());
    const T = this._physTarget(P0, this.aimPoint);
    const sig = this._sigma();
    const D = Math.hypot(T.x - P0.x, T.z - P0.z);
    T.x += gauss() * sig * D * 0.15;
    T.z += gauss() * sig * D * 0.2;
    const v = this._solve(P0, T, this.arc);
    const yaw = Math.atan2(v.x, v.z);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.12, yaw, (Math.random() - 0.5) * 0.12, 'YXZ'));
    const n = UP.clone().applyQuaternion(q);
    const spin = -(13 + Math.random() * 6);
    const w = n.multiplyScalar(spin);
    w.x += (Math.random() - 0.5) * 0.6; w.z += (Math.random() - 0.5) * 0.6;
    this._spawnRing(P0, q, v, w, this.thrown % RING_COLORS.length);
    this.thrown++;
    this.inHand--;
    this.cooldown = 0.5;
    this.held.visible = false;
    this.app.audio.whoosh(Math.min(1.3, v.length() / 5));
    this._hud();
  }

  // ───────────────────────── 判定 ─────────────────────────
  _settle(ring) {
    ring.state = 'rest';
    const C = ring.mesh.position;
    const n = UP.clone().applyQuaternion(ring.mesh.quaternion);
    if (Math.abs(n.y) < 0.2) return;
    for (const p of this.prizes) {
      if (!p || p.won) continue;
      const dx = C.x - p.x, dz = C.z - p.z;
      if (dx * dx + dz * dz > 0.05) continue;
      const t = C.y - (n.x * (p.x - C.x) + n.z * (p.z - C.z)) / n.y;
      const X = new THREE.Vector3(p.x, t, p.z);
      // 1) 奖品轴线穿过圈孔，且交点在奖品高度以内
      if (!(t > -0.02 && t < p.h * 0.92 && X.distanceTo(C) < INNER)) continue;
      // 2) 圈平面以下的奖品部分，竖直投影后必须全部落在圈孔里（防止圈压在奖品身上也算）
      if (this._encircles(p, C, n)) {
        this._win(ring, p);
        return;
      }
    }
  }

  _encircles(p, C, n) {
    const P = p.pts;
    const lim = (INNER + 0.004) * (INNER + 0.004);
    for (let i = 0; i < P.length; i += 3) {
      const dx = P[i] - C.x, dy = P[i + 1] - C.y, dz = P[i + 2] - C.z;
      const sd = n.x * dx + n.y * dy + n.z * dz;
      if (sd > 0) continue;                      // 在圈平面之上的部分不管
      const s = -sd / n.y;                       // 竖直投影到圈平面
      const qx = dx, qy = dy + s, qz = dz;
      if (qx * qx + qy * qy + qz * qz > lim) return false;
    }
    return true;
  }

  // 圈孔已经罩住奖品轴线、并且落到奖品顶部以下时：圈会“裹”住奖品往下掉，水平动量被吃掉
  _wrapAssist(ring, C, v, w, dt) {
    if (v.y > 0.2) return;
    for (const p of this.prizes) {
      if (!p || p.won) continue;
      const d = Math.hypot(C.x - p.x, C.z - p.z);
      if (d > INNER - p.rad * 0.55) continue;
      if (C.y > p.h + 0.012 || C.y < 0.01) continue;
      const k = Math.exp(-dt * (this.wrapK ?? 14));
      ring.body.setLinvel({ x: v.x * k, y: v.y, z: v.z * k }, true);
      ring.body.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, true);
      return;
    }
  }

  _win(ring, p) {
    p.won = true;
    ring.state = 'won';
    this.wonRound.push(p.info.name);
    this.app.audio.win();
    this.app.ui.toast(`套中啦！ ${p.info.name}`, 'win');
    this.app.ui.addPrize(p.info.name, '套圈');
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd04a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    halo.position.set(p.x, p.h * 0.5, p.z);
    halo.scale.setScalar(0.01);
    this.app.scene.add(halo);
    this.anims.push({ type: 'win', t: 0, p, ring, halo, base: p.obj.position.clone(), ringBase: ring.mesh.position.clone() });
    this._hud();
  }

  _drainEvents() {
    this.events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const k1 = this.kind.get(h1), k2 = this.kind.get(h2);
      let ring = null, other = null;
      if (k1 === 'ring') { ring = this.ringOf.get(h1); other = k2; }
      else if (k2 === 'ring') { ring = this.ringOf.get(h2); other = k1; }
      if (!ring || !ring.body) return;
      if (this.t - ring.lastSound < 0.07) return;
      ring.lastSound = this.t;
      const v = ring.body.linvel();
      const sp = Math.max(ring.prevSpeed, Math.hypot(v.x, v.y, v.z));
      this.app.audio.clack(sp / 4.5, other);
    });
  }

  // ───────────────────────── 每帧 ─────────────────────────
  update(dt, t) {
    this.t = t;
    // 物理
    this.acc += Math.min(dt, 1 / 20);
    const h = this.world.timestep;
    let n = 0;
    while (this.acc >= h && n < 14) { this.world.step(this.events); this._drainEvents(); this.acc -= h; n++; }
    if (n >= 14) this.acc = 0;

    for (const ring of this.rings) {
      if (!ring.body) continue;
      const p = ring.body.translation(), q = ring.body.rotation();
      if (ring.state !== 'won' || !ring.lifted) {
        ring.mesh.position.set(p.x, p.y, p.z);
        ring.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      }
      if (ring.state === 'flying') {
        ring.age += dt;
        const v = ring.body.linvel(), w = ring.body.angvel();
        const sp = Math.hypot(v.x, v.y, v.z), ws = Math.hypot(w.x, w.y, w.z);
        ring.prevSpeed = sp;
        this._wrapAssist(ring, p, v, w, dt);
        if ((sp < 0.035 && ws < 0.7) || ring.body.isSleeping()) ring.still += dt; else ring.still = 0;
        if (ring.still > 0.3 || ring.age > 7) this._settle(ring);
        if (p.y < -2) this._removeRing(ring);
      }
    }
    this.rings = this.rings.filter(r => r.state !== 'gone');

    this._anims(dt);

    if (!this.active) return;
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && this.inHand > 0) {
        this.held.visible = true;
        this.held.material = this.ringMats[this.thrown % RING_COLORS.length];
        this.heldPop = 0;
        this.app.audio.pickup();
      }
    }
    if (this.charging) this.chargeT += dt;
    this._updateHeld(dt);
    this._updateAim(dt);

    // 本轮结束
    if (this.inHand === 0 && !this.roundOver && !this.rings.some(r => r.state === 'flying') && !this.anims.some(a => a.type === 'win')) {
      this.roundOver = true;
      this._endRound();
    }
  }

  _updateHeld(dt) {
    const hp = this.held;
    if (!hp.visible) return;
    this.heldPop = Math.min(1, (this.heldPop ?? 1) + dt * 5);
    const k = this.charging ? Math.min(1, this.chargeT / 0.4) : 0;
    const tremble = this.amp ? this.amp * 0.15 : 0;
    const target = this.heldPos.clone().lerp(new THREE.Vector3(0.23, -0.2, -0.5), k);
    target.x += Math.sin(this.t * 7.1) * tremble * 0.3;
    target.y += Math.sin(this.t * 5.3 + 1) * tremble * 0.3 + Math.sin(this.t * 1.6) * 0.004;
    hp.position.lerp(target, 1 - Math.exp(-dt * 14));
    hp.rotation.set(0.95 - k * 0.25 + this.mouse.y * 0.1, 0.2 + this.mouse.x * 0.2, -0.25 - k * 0.15);
    hp.scale.setScalar(easeOut(this.heldPop));
  }

  _anims(dt) {
    for (const a of this.anims) {
      a.t += dt;
      if (a.type === 'restock') {
        const k = Math.max(0, Math.min(1, a.t / 0.45));
        const s = k <= 0 ? 0.001 : (1 + Math.sin(k * Math.PI) * 0.15) * easeOut(k);
        a.obj.scale.setScalar(Math.max(0.001, s * a.sc));
        if (k >= 1) { a.obj.scale.setScalar(a.sc); a.done = true; }
      } else if (a.type === 'win') {
        const { p, ring, halo } = a;
        const pulse = 0.5 + 0.5 * Math.sin(a.t * 10);
        halo.scale.setScalar(Math.min(1, a.t * 3) * (0.55 + 0.1 * pulse) * Math.max(0.6, p.h * 4));
        halo.material.opacity = a.t < 1.6 ? 0.9 : Math.max(0, 1 - (a.t - 1.6) / 0.8);
        if (a.t < 1.1) {
          const b = Math.abs(Math.sin(a.t * 9)) * Math.exp(-a.t * 3) * 0.06;
          p.obj.position.y = a.base.y + b;
        } else {
          if (!a.freed) {
            a.freed = true;
            this.world.removeRigidBody(p.body);
            if (ring.body) {
              const n = ring.body.numColliders();
              for (let i = 0; i < n; i++) { const c = ring.body.collider(i); this.kind.delete(c.handle); this.ringOf.delete(c.handle); }
              this.world.removeRigidBody(ring.body); ring.body = null;
            }
            ring.lifted = true;
            a.ringBase = ring.mesh.position.clone();
          }
          const k = Math.min(1, (a.t - 1.1) / 1.0);
          const e = k * k;
          p.obj.position.y = a.base.y + e * 0.9;
          p.obj.rotation.y += dt * 6 * k;
          p.obj.scale.setScalar(Math.max(0.001, (1 - e) * p.sc));
          if (ring.mesh) {
            ring.mesh.position.y = a.ringBase.y + e * 0.9;
            ring.mesh.scale.setScalar(Math.max(0.001, 1 - e));
          }
          halo.position.y = p.h * 0.5 + e * 0.9;
          if (k >= 1) {
            this.group.remove(p.obj);
            this.app.scene.remove(halo);
            if (ring.mesh) { this.app.scene.remove(ring.mesh); ring.mesh = null; }
            ring.state = 'gone';
            a.done = true;
          }
        }
      }
    }
    this.anims = this.anims.filter(a => !a.done);
  }

  _endRound() {
    const won = this.wonRound;
    this.app.ui.showRound({
      title: won.length ? `本轮套中 ${won.length} 件！` : '本轮没套中，再接再厉~',
      lines: won.length ? won : ['小技巧：按住鼠标让手稳下来（准星变金色）再松手', '滚轮调高抛物线，圈落得更“垂直”，更容易套进去'],
      button: '再来一轮（¥10 / 15个圈）',
      onClick: () => this.newRound(),
    });
  }

  newRound() {
    for (const r of this.rings) this._removeRing(r);
    this.rings = [];
    this._stockPrizes();
    this.inHand = ROUND_RINGS;
    this.wonRound = [];
    this.roundOver = false;
    this.cooldown = 0.3;
    this.app.ui.spend(10);
    this.app.audio.coin();
    this._fillBucket();
    this._hud();
  }

  // ───────────────────────── 交互 ─────────────────────────
  enter() {
    this.active = true;
    this.cooldown = 0.2;
    this.held.visible = false;
    if (!this.paid) { this.paid = true; this.app.ui.spend(10); this.app.audio.coin(); }
    this._hud();
    this.app.ui.hint('移动鼠标瞄准 · <b>按住左键</b>稳住手（准星变金色）· <b>松开</b>出手 · <b>滚轮</b>调抛物线高低');
  }

  exit() {
    this.active = false;
    this.charging = false;
    this.held.visible = false;
    this.reticle.visible = this.spread.visible = this.centerDot.visible = this.traj.visible = this.hoverGlow.visible = false;
    this.app.ui.setSteady(-1);
  }

  _hud() {
    const deg = Math.round(this.arc * 180 / Math.PI);
    const dots = Array.from({ length: ROUND_RINGS }, (_, i) =>
      `<i class="ringdot ${i < this.inHand ? 'on' : ''}" style="--c:#${RING_COLORS[(this.thrown + i - (ROUND_RINGS - this.inHand)) % RING_COLORS.length].toString(16).padStart(6, '0')}"></i>`).join('');
    this.app.ui.stats(`
      <div class="stat-title">套圈</div>
      <div class="rings">${dots}</div>
      <div class="stat-row"><span>剩余</span><b>${this.inHand}</b><span>/ ${ROUND_RINGS} 个圈</span></div>
      <div class="stat-row"><span>本轮套中</span><b>${this.wonRound.length}</b><span>件</span></div>
      <div class="stat-row"><span>出手角度</span><b>${deg}°</b><span>${deg > 56 ? '高抛' : deg < 42 ? '平抛' : '适中'}</span></div>`);
  }

  getCameraPose() {
    const o = this.origin;
    return {
      pos: new THREE.Vector3(o.x, 1.62, o.z + 1.0),
      look: new THREE.Vector3(o.x, 0.05, o.z - 2.9),
    };
  }

  updateCamera(cam, dt) {
    const pose = this.getCameraPose();
    this.look.x += (this.mouse.x - this.look.x) * (1 - Math.exp(-dt * 3));
    this.look.y += (this.mouse.y - this.look.y) * (1 - Math.exp(-dt * 3));
    const pos = pose.pos.clone();
    pos.x += this.look.x * 0.12;
    pos.y += Math.sin(this.t * 0.8) * 0.004;
    const look = pose.look.clone();
    look.x += this.look.x * 0.9;
    look.z += this.look.y * -0.9;
    cam.position.copy(pos);
    cam.lookAt(look);
  }

  onPointerDown(e) {
    if (e.button !== 0 || !this.active || this.roundOver) return;
    if (this.inHand <= 0 || this.cooldown > 0) return;
    this.charging = true;
    this.chargeT = 0;
  }
  onPointerUp(e) {
    if (e.button !== 0 || !this.charging) return;
    this.charging = false;
    this._throw();
    this.app.ui.setSteady(-1);
  }
  onWheel(e) {
    this.arc = Math.max(0.5, Math.min(1.18, this.arc - Math.sign(e.deltaY) * 0.035));
    this._hud();
  }
}
