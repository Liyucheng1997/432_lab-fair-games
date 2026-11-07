// 打气球：气枪 + 气球墙
import * as THREE from 'three';
import {
  buildTent, buildLightbox, buildHangingBulb, buildStool, buildASign, shadowAll, stringLights, metalMat, bake,
} from './props.js';
import {
  woodTexture, signTexture, boardFabricTexture, netTexture, priceCardTexture, smokeTexture, feltTexture, KAI,
} from './textures.js';
import { plushBear } from './prizes.js';

const COLS = 12, ROWS = 8;
const SHOTS = 20;
const BALLOON_COLORS = [0xe8202a, 0xffcc1a, 0x1e78e6, 0x22b24c, 0xff6fae, 0xff7a12, 0x8a3fd6, 0xf2f2f2];
const BOARD_Z = -4.3, BOARD_Y = 1.45, BOARD_W = 3.0, BOARD_H = 1.95;

const easeOut = x => 1 - Math.pow(1 - x, 3);

// 气球轮廓（含扎口）
function balloonGeometry() {
  const pts = [];
  pts.push(new THREE.Vector2(0.0001, -0.024));
  pts.push(new THREE.Vector2(0.004, -0.023));
  pts.push(new THREE.Vector2(0.008, -0.018));
  pts.push(new THREE.Vector2(0.0085, -0.013));
  pts.push(new THREE.Vector2(0.005, -0.008));
  pts.push(new THREE.Vector2(0.0045, -0.004));
  pts.push(new THREE.Vector2(0.006, 0.0));
  const W = 0.086, H = 0.104;
  for (let i = 1; i <= 40; i++) {
    const f = 0.06 + (i / 40) * (Math.PI - 0.06);
    const r = Math.sin(f) * W * (1 - 0.16 * Math.cos(f));
    const y = (1 - Math.cos(f)) * H + 0.002;
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), y));
  }
  const g = new THREE.LatheGeometry(pts, 40);
  g.computeVertexNormals();
  return g;
}

// 气枪模型（原点在扳机处，枪口朝 -Z）
export function buildRifle() {
  const g = new THREE.Group();
  const stockTex = woodTexture({ c1: [128, 62, 28], c2: [72, 30, 12], seed: 33, rings: 30 });
  stockTex.repeat.set(3, 3);
  const woodMat = new THREE.MeshPhysicalMaterial({ map: stockTex, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.25 });
  const blued = new THREE.MeshStandardMaterial({ color: 0x1b1d21, metalness: 0.9, roughness: 0.32 });
  const s = new THREE.Shape();
  s.moveTo(-0.40, 0.03);
  s.lineTo(-0.40, -0.11);
  s.quadraticCurveTo(-0.25, -0.085, -0.10, -0.045);
  s.quadraticCurveTo(-0.06, -0.06, -0.045, -0.105);
  s.lineTo(-0.012, -0.105);
  s.quadraticCurveTo(-0.01, -0.06, 0.0, -0.03);
  s.lineTo(0.05, -0.027);
  s.lineTo(0.28, -0.018);
  s.quadraticCurveTo(0.31, -0.012, 0.31, 0.004);
  s.lineTo(0.29, 0.016);
  s.lineTo(0.03, 0.018);
  s.lineTo(-0.07, 0.02);
  s.quadraticCurveTo(-0.16, 0.022, -0.22, 0.038);
  s.lineTo(-0.40, 0.03);
  const depth = 0.032;
  const sg = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3, curveSegments: 10 });
  sg.translate(0, 0, -depth / 2);
  sg.rotateY(Math.PI / 2);
  const stock = new THREE.Mesh(sg, woodMat);
  g.add(stock);
  const cyl = (r, len, mat, s0, y) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(0, y, -(s0 + len / 2));
    g.add(m); return m;
  };
  cyl(0.012, 0.25, blued, -0.06, 0.034);           // 机匣
  cyl(0.0095, 0.46, blued, 0.17, 0.036);           // 枪管
  cyl(0.012, 0.035, blued, 0.6, 0.036);            // 枪口
  cyl(0.0125, 0.03, blued, 0.16, 0.035);           // 折管铰链
  const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.15, 0.012), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }));
  buttPad.position.set(0, -0.04, 0.404); g.add(buttPad);
  // 准星 / 照门
  // 准星（高于枪管，带护圈）
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.016, 0.02), blued);
  ramp.position.set(0, 0.049, -0.612); g.add(ramp);
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.012, 0.004), blued);
  front.position.set(0, 0.062, -0.615); g.add(front);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd23a }));
  bead.position.set(0, 0.0675, -0.6135); g.add(bead);
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0015, 6, 20, Math.PI), blued);
  hood.position.set(0, 0.058, -0.615); g.add(hood);
  // 照门（U 形缺口）
  const rb = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.012, 0.016), blued);
  rb.position.set(0, 0.048, -0.14); g.add(rb);
  for (const sx of [-1, 1]) {
    const rear = new THREE.Mesh(new THREE.BoxGeometry(0.0095, 0.016, 0.004), blued);
    rear.position.set(sx * 0.0068, 0.06, -0.14); g.add(rear);
  }
  // 扳机护圈 + 扳机
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.003, 6, 20, Math.PI), blued);
  guard.rotation.y = Math.PI / 2; guard.rotation.x = Math.PI;
  guard.position.set(0, -0.022, 0.0); g.add(guard);
  const trig = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.022, 0.006), blued);
  trig.position.set(0, -0.025, 0.004); trig.rotation.x = 0.3; g.add(trig);
  g.userData.muzzle = new THREE.Vector3(0, 0.036, -0.64);
  shadowAll(g, true, true);
  return bake(g);
}

export class BalloonGame {
  constructor(app, origin) {
    this.app = app;
    this.origin = origin.clone();
    this.group = new THREE.Group();
    this.group.position.copy(origin);
    app.scene.add(this.group);
    this.active = false;
    this.mouse = new THREE.Vector2();
    this.look = new THREE.Vector2();
    this.ray = new THREE.Raycaster();
    this.t = 0;
    this.shots = SHOTS;
    this.hits = 0;
    this.reload = 0;
    this.ads = false;
    this.adsT = 0;
    this.kick = 0; this.kickV = 0;
    this.pending = [];
    this.shards = [];
    this.puffs = [];
    this.holes = [];
    this.roundOver = false;
    this._newBias();
    this._buildStall();
    this._buildBalloons();
    this._buildGun();
    this._buildFx();
  }

  _buildStall() {
    const g = this.group;
    const tent = buildTent({ w: 3.7, d: 5.4, h: 2.55, roofH: 0.8, colA: '#1d5fb3', colB: '#f4f4f4', stripes: 14 });
    tent.position.set(0, 0, -2.3);
    g.add(tent);
    // 地垫
    const mat = feltTexture([40, 44, 52], 21); mat.repeat.set(3, 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 4.6), new THREE.MeshStandardMaterial({ map: mat, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.003, -2.3); floor.receiveShadow = true; g.add(floor);

    // 柜台
    const wt = woodTexture({ c1: [150, 100, 58], c2: [104, 64, 32], seed: 14 });
    wt.repeat.set(3, 1);
    const woodMat = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.65 });
    const cloth = feltTexture([170, 20, 26], 8); cloth.repeat.set(3, 1);
    const front = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.98, 0.5), new THREE.MeshStandardMaterial({ map: cloth, roughness: 0.95 }));
    front.position.set(0, 0.49, 0); front.castShadow = front.receiveShadow = true; g.add(front);
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 0.62), woodMat);
    top.position.set(0, 1.005, 0); top.castShadow = top.receiveShadow = true; g.add(top);
    this.counterTop = 1.03;
    const sign = buildLightbox(signTexture({ title: '打气球', sub: '10元20枪 · 打中有奖', w: 1024, h: 300, bg: ['#1d4fa8', '#0b2560'] }), 1.9, 0.56, { spacing: 0.09 });
    sign.position.set(0, 0.52, 0.26); g.add(sign);
    const sign2 = buildLightbox(signTexture({ title: '打 气 球', sub: '百发百中 · 大熊带回家', w: 1024, h: 320, bg: ['#1d4fa8', '#0b2560'] }), 2.6, 0.8);
    sign2.position.set(0, 3.05, 0.42); g.add(sign2);
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.5 }));
      p.position.set(sx * 1.1, 2.65, 0.4); g.add(p);
    }
    // 柜台上的备用枪、弹盒
    for (const [x, ry] of [[-1.05, 1.35], [1.0, -1.25]]) {
      const r = buildRifle();
      r.rotation.set(0, ry, Math.PI / 2 - 0.02);
      r.position.set(x, this.counterTop + 0.028, 0.02);
      g.add(r);
    }
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.025, 24), metalMat());
    tray.position.set(0.55, this.counterTop + 0.013, 0.12); g.add(tray);
    const bb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0045, 8, 6), new THREE.MeshStandardMaterial({ color: 0xc88a3a, metalness: 1, roughness: 0.3 }), 60);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * 0.05;
      m4.makeTranslation(0.55 + Math.cos(a) * rr, this.counterTop + 0.03 + Math.random() * 0.008, 0.12 + Math.sin(a) * rr);
      bb.setMatrixAt(i, m4);
    }
    g.add(bb);
    const price = buildASign(priceCardTexture([
      { text: '打气球', size: 92, font: KAI },
      { text: '10元 20枪', size: 64 },
      { text: '18个 送大熊', size: 52, color: '#d4890a' },
      { text: '13个 送公仔', size: 52, color: '#d4890a' },
    ], { w: 512, h: 640 }), 0.5, 0.65);
    price.position.set(1.75, 0, 0.55); price.rotation.y = -0.5; g.add(price);

    // 气球板
    const fab = boardFabricTexture(); fab.repeat.set(2, 1.3);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H), new THREE.MeshStandardMaterial({ map: fab, roughness: 0.92 }));
    panel.position.set(0, BOARD_Y, BOARD_Z); panel.receiveShadow = true; g.add(panel);
    this.panel = panel;
    const back = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W, BOARD_H, 0.05), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 }));
    back.position.set(0, BOARD_Y, BOARD_Z - 0.03); g.add(back);
    const frameT = woodTexture({ c1: [190, 140, 80], c2: [140, 96, 50], seed: 4 });
    const frameMat = new THREE.MeshStandardMaterial({ map: frameT, roughness: 0.6 });
    const fw = 0.09;
    for (const [w, h, x, y] of [
      [BOARD_W + fw * 2, fw, 0, BOARD_Y + BOARD_H / 2 + fw / 2], [BOARD_W + fw * 2, fw, 0, BOARD_Y - BOARD_H / 2 - fw / 2],
      [fw, BOARD_H, -BOARD_W / 2 - fw / 2, BOARD_Y], [fw, BOARD_H, BOARD_W / 2 + fw / 2, BOARD_Y]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), frameMat);
      f.position.set(x, y, BOARD_Z + 0.005); f.castShadow = f.receiveShadow = true; g.add(f);
    }
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, BOARD_Y, 0.08), frameMat);
      leg.position.set(sx * (BOARD_W / 2 - 0.2), BOARD_Y / 2 - BOARD_H / 2 + 0.05, BOARD_Z - 0.1); g.add(leg);
    }
    // 板子下方挡布（防弹）
    const skirtTex = feltTexture([25, 25, 30], 9); skirtTex.repeat.set(3, 1);
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W + 0.2, BOARD_Y - BOARD_H / 2), new THREE.MeshStandardMaterial({ map: skirtTex, roughness: 1 }));
    skirt.position.set(0, (BOARD_Y - BOARD_H / 2) / 2, BOARD_Z + 0.02); g.add(skirt);

    // 两侧挂奖品的网
    const net = netTexture(); net.repeat.set(10, 6);
    for (const sx of [-1, 1]) {
      const n = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.3), new THREE.MeshStandardMaterial({ map: net, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }));
      n.position.set(sx * 1.83, 1.3, -2.3); n.rotation.y = sx * Math.PI / 2; g.add(n);
      const hang = [0xf3b7c9, 0x9a6438, 0x6aa8e0, 0xf4f1ea, 0xe8c25a, 0xa8e0a0, 0xd88a6a];
      let k = 0;
      for (let zz = -0.6; zz > -4.1; zz -= 0.62) {
        for (const yy of [1.95, 1.25]) {
          const sc = yy > 1.5 ? 2.6 + Math.random() * 0.6 : 2.0 + Math.random() * 0.5;
          const b = plushBear(hang[(k++ + (sx > 0 ? 3 : 0)) % hang.length], sc);
          b.position.set(sx * 1.74, yy - 0.17 * sc * 0.5, zz + (Math.random() - 0.5) * 0.1);
          b.rotation.y = -sx * Math.PI / 2 + (Math.random() - 0.5) * 0.4;
          b.rotation.z = (Math.random() - 0.5) * 0.15;
          g.add(b);
        }
      }
    }
    // 大熊坐在凳子上
    const stool = buildStool(0x2a62c8); stool.position.set(-2.15, 0, 0.55); g.add(stool);
    const big = plushBear(0x9a6438, 4.2, '大熊'); big.position.set(-2.15, 0.45, 0.55); big.rotation.y = 0.5; g.add(big);

    // 灯
    const spot = new THREE.SpotLight(0xfff0d8, 10, 10, 0.75, 0.5, 1.3);
    spot.position.set(0, 2.45, -1.4);
    spot.target.position.set(0, BOARD_Y, BOARD_Z);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = 0.5; spot.shadow.camera.far = 8;
    spot.shadow.radius = 3;
    g.add(spot, spot.target);
    const fill = new THREE.PointLight(0xffd0a0, 2.5, 6, 1.6);
    fill.position.set(0, 2.2, 0.1); g.add(fill);
    const side = new THREE.PointLight(0xffc89a, 2.5, 5, 1.6);
    side.position.set(0, 2.1, -2.8); g.add(side);
    for (const z of [-0.2, -1.6, -3.0]) for (const x of [-1.2, 0, 1.2]) {
      const b = buildHangingBulb(0.18 + Math.random() * 0.15, 0xffe0b0, 7);
      b.position.set(x, 2.55, z); g.add(b);
    }
    const cols = [0xff4040, 0xffd040, 0x40ff70, 0x40a0ff, 0xff60e0];
    g.add(stringLights(new THREE.Vector3(-1.85, 2.53, 0.33), new THREE.Vector3(1.85, 2.53, 0.33), { sag: 0.12, spacing: 0.16, colors: cols, size: 0.016 }));
    g.add(stringLights(new THREE.Vector3(-1.5, BOARD_Y + BOARD_H / 2 + 0.12, BOARD_Z + 0.06), new THREE.Vector3(1.5, BOARD_Y + BOARD_H / 2 + 0.12, BOARD_Z + 0.06), { sag: 0.04, spacing: 0.1, colors: cols, size: 0.014 }));
  }

  _buildBalloons() {
    this.bGeo = balloonGeometry();
    this.bMats = BALLOON_COLORS.map(c => {
      const col = new THREE.Color(c);
      return new THREE.MeshPhysicalMaterial({
        color: col, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.25, sheenColor: col.clone().lerp(new THREE.Color(1, 1, 1), 0.5),
        emissive: col.clone().multiplyScalar(0.07),
      });
    });
    this.shardMats = BALLOON_COLORS.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, side: THREE.DoubleSide }));
    const pinHead = new THREE.SphereGeometry(0.006, 10, 8);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 1, roughness: 0.2 });
    const remnantGeo = new THREE.IcosahedronGeometry(0.012, 1);
    this.balloons = [];
    const sx = BOARD_W / COLS, sy = BOARD_H / ROWS;
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const x = -BOARD_W / 2 + sx * (i + 0.5) + (j % 2 ? sx * 0.25 : -sx * 0.25) + (Math.random() - 0.5) * 0.03;
      const y = BOARD_Y - BOARD_H / 2 + sy * (j + 0.42) + (Math.random() - 0.5) * 0.03;
      const pin = new THREE.Vector3(x, y, BOARD_Z + 0.008);
      const base = new THREE.Group();
      base.position.copy(pin);
      const axis = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.55 + Math.random() * 0.35, 1).normalize();
      base.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
      base.rotateY(Math.random() * Math.PI * 2);
      const piv = new THREE.Group();
      base.add(piv);
      const ci = Math.floor(Math.random() * BALLOON_COLORS.length);
      const mesh = new THREE.Mesh(this.bGeo, this.bMats[ci]);
      mesh.castShadow = true; mesh.receiveShadow = true;
      piv.add(mesh);
      const pinM = new THREE.Mesh(pinHead, pinMat);
      pinM.position.copy(pin); pinM.position.z += 0.004;
      this.group.add(pinM);
      const rem = new THREE.Mesh(remnantGeo, this.shardMats[ci]);
      rem.scale.set(1, 0.6, 1.3); rem.visible = false;
      base.add(rem);
      this.group.add(base);
      const s = (0.88 + Math.random() * 0.22) * 0.76;
      mesh.scale.setScalar(s);
      const b = { base, piv, mesh, rem, ci, alive: true, s, rx: 0, rz: 0, vx: 0, vz: 0, ph: Math.random() * 100, inflate: 1 };
      mesh.userData.balloon = b;
      this.balloons.push(b);
    }
  }

  _buildGun() {
    this.gun = buildRifle();
    this.gun.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    this.gun.visible = false;
    this.app.camera.add(this.gun);
    this.gunQ = new THREE.Quaternion();
    this.gunP = new THREE.Vector3(0.16, -0.2, -0.2);
  }

  _buildFx() {
    const sg = new THREE.PlaneGeometry(0.032, 0.022);
    for (let i = 0; i < 220; i++) {
      const m = new THREE.Mesh(sg, this.shardMats[0]);
      m.visible = false;
      this.app.scene.add(m);
      this.shards.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0 });
    }
    this.smokeTex = smokeTexture();
    this.holeGeo = new THREE.CircleGeometry(0.006, 10);
    this.holeMat = new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.85, depthWrite: false });
  }

  // 摊位气枪的“歪准星”：每轮随机偏一点（2~3.5cm@5m），要靠前几枪摸出规律
  _newBias() {
    const a = Math.random() * Math.PI * 2, r = 0.005 + Math.random() * 0.0045;
    this.bias = { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.8 - 0.002 };
  }

  // ───────────────────────── 射击 ─────────────────────────
  _swayNdc() {
    const t = this.t;
    const a = (this.ads ? 0.35 : 1) * (1 + this.kick * 2);
    const px = (Math.sin(t * 1.15) * 0.7 + Math.sin(t * 2.7 + 1.2) * 0.3) * 9 * a + Math.sin(t * 11) * 0.6;
    const py = (Math.sin(t * 0.9 + 0.5) * 0.7 + Math.sin(t * 2.1 + 2.0) * 0.3) * 7 * a + Math.sin(t * 13 + 1) * 0.5;
    return new THREE.Vector2(px / (innerWidth / 2), -py / (innerHeight / 2));
  }

  _aimNdc() {
    return this.mouse.clone().add(this._swayNdc());
  }

  _fire() {
    if (this.shots <= 0 || this.reload > 0 || this.roundOver) return;
    const cam = this.app.camera;
    const ndc = this._aimNdc();
    const spread = this.ads ? 0.0028 : 0.007;
    this.ray.setFromCamera(ndc, cam);
    const dir = this.ray.ray.direction.clone();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    dir.addScaledVector(right, this.bias.x + (Math.random() - 0.5) * 2 * spread);
    dir.addScaledVector(up, this.bias.y + (Math.random() - 0.5) * 2 * spread);
    dir.normalize();
    this.ray.set(this.ray.ray.origin.clone(), dir);
    const alive = this.balloons.filter(b => b.alive && b.inflate > 0.6).map(b => b.mesh);
    const hits = this.ray.intersectObjects([...alive, this.panel], false);
    this.shots--;
    this.reload = 0.62;
    this.kickV += 9;
    this.app.audio.shot();
    setTimeout(() => this.app.audio.reload(), 230);
    this._puff();
    if (hits.length) {
      const h = hits[0];
      const delay = h.distance / 120;
      this.pending.push({ t: delay, hit: h, dir });
    }
    this._hud();
  }

  _puff() {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, opacity: 0.5, depthWrite: false }));
    const mz = this.gun.userData.muzzle.clone();
    this.gun.localToWorld(mz);
    sp.position.copy(mz);
    sp.scale.setScalar(0.03);
    this.app.scene.add(sp);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.gun.getWorldQuaternion(new THREE.Quaternion()));
    this.puffs.push({ sp, life: 0, v: dir.multiplyScalar(0.6) });
  }

  _resolve(h, dir) {
    const b = h.object.userData.balloon;
    if (b && b.alive) {
      // 擦边：入射角太斜时，铅弹会从气球表面滑开
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      const cos = -n.dot(dir);
      if (cos < 0.42 && Math.random() < 0.6) {
        b.vx += (Math.random() - 0.5) * 14; b.vz += (Math.random() - 0.5) * 14;
        this.app.audio.boing();
        this.app.ui.toast('擦边了！气球没破', 'small');
        return;
      }
      this._pop(b, h.point);
    } else {
      // 弹孔
      const m = new THREE.Mesh(this.holeGeo, this.holeMat);
      m.position.copy(h.point); m.position.z += 0.002;
      this.app.scene.add(m);
      this.holes.push(m);
      if (this.holes.length > 80) this.app.scene.remove(this.holes.shift());
      this.app.audio.thunk();
      // 附近气球轻轻晃
      for (const o of this.balloons) {
        const d = o.base.getWorldPosition(new THREE.Vector3()).distanceTo(h.point);
        if (d < 0.25) { o.vx += (Math.random() - 0.5) * 1.5; o.vz += (Math.random() - 0.5) * 1.5; }
      }
    }
  }

  _pop(b, point) {
    b.alive = false;
    b.mesh.visible = false;
    b.rem.visible = true;
    b.rem.material = this.shardMats[b.ci];
    this.hits++;
    this.app.audio.pop();
    const center = b.mesh.getWorldPosition(new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(b.mesh.getWorldQuaternion(new THREE.Quaternion()));
    center.addScaledVector(up, 0.1 * b.s);
    let n = 0;
    for (const s of this.shards) {
      if (s.life > 0) continue;
      s.m.material = this.shardMats[b.ci];
      s.m.visible = true;
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      s.m.position.copy(center).addScaledVector(d, 0.05 + Math.random() * 0.04);
      s.v.copy(d).multiplyScalar(1.2 + Math.random() * 2.2);
      s.v.z += 0.6;
      s.w.set(Math.random() * 30 - 15, Math.random() * 30 - 15, Math.random() * 30 - 15);
      s.life = 0.9 + Math.random() * 0.5;
      s.m.scale.setScalar(0.6 + Math.random() * 0.9);
      s.m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      if (++n >= 16) break;
    }
    // 冲击波让邻居晃动
    for (const o of this.balloons) {
      if (!o.alive) continue;
      const d = o.base.position.distanceTo(b.base.position);
      if (d < 0.45) {
        const k = (0.45 - d) / 0.45;
        o.vx += (Math.random() - 0.5) * 9 * k;
        o.vz += (Math.random() - 0.5) * 9 * k;
      }
    }
    this.app.ui.flashHit();
    this._hud();
  }

  // ───────────────────────── 每帧 ─────────────────────────
  update(dt, t) {
    this.t = t;
    // 气球摇摆（弹簧）
    for (const b of this.balloons) {
      const wind = Math.sin(t * 0.7 + b.ph) * 0.5 + Math.sin(t * 1.9 + b.ph * 2) * 0.3;
      b.vx += (-38 * b.rx - 2.6 * b.vx + wind * 0.6) * dt;
      b.vz += (-38 * b.rz - 2.6 * b.vz + Math.cos(t * 0.8 + b.ph) * 0.4) * dt;
      b.rx += b.vx * dt; b.rz += b.vz * dt;
      b.piv.rotation.set(b.rx * 0.6, 0, b.rz * 0.6);
      if (b.inflate < 1) {
        b.inflate = Math.min(1, b.inflate + dt * 2.6);
        const k = Math.max(0, b.inflate);
        const s = k <= 0 ? 0.001 : easeOut(k) * (1 + Math.sin(k * Math.PI) * 0.12);
        b.mesh.scale.set(b.s * Math.max(0.001, s), b.s * Math.max(0.001, s * (0.85 + 0.15 * k)), b.s * Math.max(0.001, s));
      }
    }
    // 碎片
    for (const s of this.shards) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.v.y -= 4.5 * dt;
      s.v.multiplyScalar(1 - 2.2 * dt);
      s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += s.w.x * dt; s.m.rotation.y += s.w.y * dt; s.m.rotation.z += s.w.z * dt;
      if (s.m.position.y < 0.01) { s.m.position.y = 0.01; s.v.set(0, 0, 0); s.w.set(0, 0, 0); }
      if (s.life <= 0) s.m.visible = false;
    }
    // 枪口烟
    for (const p of this.puffs) {
      p.life += dt;
      p.sp.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(1 - 3 * dt);
      p.sp.scale.setScalar(0.03 + p.life * 0.25);
      p.sp.material.opacity = Math.max(0, 0.45 * (1 - p.life / 0.9));
      if (p.life > 0.9) { this.app.scene.remove(p.sp); p.dead = true; }
    }
    this.puffs = this.puffs.filter(p => !p.dead);
    // 子弹飞行
    for (const p of this.pending) { p.t -= dt; if (p.t <= 0) { this._resolve(p.hit, p.dir); p.done = true; } }
    this.pending = this.pending.filter(p => !p.done);

    if (!this.active) return;
    if (this.reload > 0) this.reload -= dt;
    // 后坐弹簧
    this.kickV += (-90 * this.kick - 13 * this.kickV) * dt;
    this.kick += this.kickV * dt;
    this.adsT += ((this.ads ? 1 : 0) - this.adsT) * (1 - Math.exp(-dt * 12));
    const cam = this.app.camera;
    const fov = 55 - 19 * this.adsT;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this._updateGun(dt);
    const ndc = this._aimNdc();
    this.app.ui.crosshair(ndc, this.adsT < 0.5, this.reload > 0);

    if (this.shots === 0 && !this.roundOver && this.pending.length === 0 && this.reload <= 0) {
      this.roundOver = true;
      setTimeout(() => this._endRound(), 600);
    }
  }

  _updateGun() {
    const cam = this.app.camera;
    const ndc = this._aimNdc();
    this.ray.setFromCamera(ndc, cam);
    const inv = cam.quaternion.clone().invert();
    const d = this.ray.ray.direction.clone().applyQuaternion(inv);
    const m = new THREE.Matrix4();
    // 腰射位
    const hipP = new THREE.Vector3(0.15, -0.19, -0.18);
    m.lookAt(hipP, d.clone().multiplyScalar(6), new THREE.Vector3(0, 1, 0));
    const hipQ = new THREE.Quaternion().setFromRotationMatrix(m);
    // 机瞄位：准星-照门连线与视线重合
    m.lookAt(new THREE.Vector3(), d, new THREE.Vector3(0, 1, 0));
    const adsQ = new THREE.Quaternion().setFromRotationMatrix(m);
    const upG = new THREE.Vector3(0, 1, 0).applyQuaternion(adsQ);
    const adsP = d.clone().multiplyScalar(0.1).addScaledVector(upG, -0.067);
    const k = this.adsT;
    const p = hipP.lerp(adsP, k);
    const q = hipQ.slerp(adsQ, k);
    // 换弹动作（折管）
    const r = this.reload > 0 ? Math.sin(Math.min(1, 1 - this.reload / 0.62) * Math.PI) : 0;
    const rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35 * r + this.kick * 0.09, 0, 0.25 * r));
    q.multiply(rq);
    const back = new THREE.Vector3(0, -0.04 * r, 0.03 * this.kick + 0.02 * r).applyQuaternion(q);
    p.add(back);
    p.y += Math.sin(this.t * 1.3) * 0.002 * (1 - k);
    this.gun.position.copy(p);
    this.gun.quaternion.copy(q);
  }

  _endRound() {
    const h = this.hits;
    let prize, tier;
    if (h >= 20) { prize = '特等奖 · 1.2米大熊'; tier = 0; }
    else if (h >= 18) { prize = '一等奖 · 大号毛绒熊'; tier = 1; }
    else if (h >= 13) { prize = '二等奖 · 中号公仔'; tier = 2; }
    else if (h >= 8) { prize = '三等奖 · 小挂件'; tier = 3; }
    else { prize = '参与奖 · 棒棒糖'; tier = 4; }
    this.app.ui.addPrize(prize.split(' · ')[1], '打气球');
    if (tier <= 2) this.app.audio.win(); else this.app.audio.coin();
    this.app.ui.showRound({
      title: `20 枪命中 ${h} 个！`,
      lines: [`获得：${prize}`, h < 13 ? '小技巧：按住右键开机瞄，准星对准照门再开枪，晃动会小很多' : '枪法不错！老板脸都绿了'],
      button: '再来一轮（¥10 / 20枪）',
      onClick: () => this.newRound(),
    });
  }

  newRound() {
    this.shots = SHOTS;
    this.hits = 0;
    this.roundOver = false;
    this.app.ui.spend(10);
    this.app.audio.coin();
    let k = 0;
    for (const b of this.balloons) {
      if (b.alive) continue;
      b.alive = true;
      b.ci = Math.floor(Math.random() * BALLOON_COLORS.length);
      b.mesh.material = this.bMats[b.ci];
      b.mesh.visible = true;
      b.rem.visible = false;
      b.inflate = -(k++) * 0.05;
      b.mesh.scale.setScalar(0.001);
    }
    for (const h of this.holes) this.app.scene.remove(h);
    this.holes = [];
    this._newBias();
    this._hud();
  }

  enter() {
    this.active = true;
    this.gun.visible = true;
    if (!this.paid) { this.paid = true; this.app.ui.spend(10); this.app.audio.coin(); }
    this._hud();
    this.app.ui.hint('移动鼠标瞄准 · <b>左键</b>开枪 · <b>按住右键</b>机瞄（准星和照门对齐，更稳）');
  }

  exit() {
    this.active = false;
    this.ads = false;
    this.adsT = 0;
    this.gun.visible = false;
    const cam = this.app.camera;
    cam.fov = 55; cam.updateProjectionMatrix();
    this.app.ui.crosshair(null);
  }

  _hud() {
    const pellets = Array.from({ length: SHOTS }, (_, i) => `<i class="pellet ${i < this.shots ? 'on' : ''}"></i>`).join('');
    this.app.ui.stats(`
      <div class="stat-title">打气球</div>
      <div class="pellets">${pellets}</div>
      <div class="stat-row"><span>剩余</span><b>${this.shots}</b><span>/ ${SHOTS} 枪</span></div>
      <div class="stat-row"><span>命中</span><b>${this.hits}</b><span>个气球</span></div>
      <div class="stat-row small"><span>18个送大熊 · 13个送公仔 · 8个送挂件</span></div>`);
  }

  getCameraPose() {
    const o = this.origin;
    return {
      pos: new THREE.Vector3(o.x, 1.52, o.z + 0.72),
      look: new THREE.Vector3(o.x, BOARD_Y - 0.05, o.z + BOARD_Z),
    };
  }

  updateCamera(cam, dt) {
    const pose = this.getCameraPose();
    const k = 1 - Math.exp(-dt * 2.5);
    this.look.x += (this.mouse.x - this.look.x) * k;
    this.look.y += (this.mouse.y - this.look.y) * k;
    const look = pose.look.clone();
    look.x += this.look.x * 0.55;
    look.y += this.look.y * 0.35;
    const pos = pose.pos.clone();
    pos.y += Math.sin(this.t * 1.1) * 0.003;
    cam.position.copy(pos);
    cam.lookAt(look);
  }

  onPointerDown(e) {
    if (!this.active) return;
    if (e.button === 2) { this.ads = true; return; }
    if (e.button === 0) this._fire();
  }
  onPointerUp(e) {
    if (e.button === 2) this.ads = false;
  }
  onWheel() { }
}
