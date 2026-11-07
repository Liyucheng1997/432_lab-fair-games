import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import RAPIER from '@dimforge/rapier3d-compat';
import './style.css';
import { buildEnvironment } from './environment.js';
import { updaters } from './props.js';
import { RingToss } from './ringToss.js';
import { BalloonGame } from './balloon.js';
import { Sound } from './audio.js';

const $ = id => document.getElementById(id);
const nextFrame = () => new Promise(r => setTimeout(r, 16));

// ───────────────────────── UI ─────────────────────────
class UI {
  constructor(app) {
    this.app = app;
    this.money = 0;
    this.assist = true;
    this.prizes = [];
    this.toastTimer = 0;
  }
  stats(html) { $('stats').innerHTML = html + `<div class="stat-row money"><span>已花费</span><b>¥${this.money}</b></div>`; this._statsHtml = html; }
  spend(n) { this.money += n; if (this._statsHtml) this.stats(this._statsHtml); }
  hint(html) { $('hint').innerHTML = html; $('hint').classList.toggle('show', !!html); }
  toast(msg, kind = '') {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'show ' + kind;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.className = ''; }, 2600);
  }
  addPrize(name, src) {
    this.prizes.push({ name, src });
    const list = $('bagList');
    const chip = document.createElement('span');
    chip.className = 'chip new';
    chip.textContent = name;
    chip.title = `来自：${src}`;
    list.prepend(chip);
    setTimeout(() => chip.classList.remove('new'), 1200);
    $('bagCount').textContent = this.prizes.length;
    $('bag').classList.add('has');
  }
  setSteady(v, tired) {
    const el = $('steady');
    if (v < 0) { el.classList.remove('show'); return; }
    el.classList.add('show');
    el.classList.toggle('ok', v > 0.97 && !tired);
    el.classList.toggle('tired', !!tired);
    $('steadyFill').style.width = `${Math.round(v * 100)}%`;
    $('steadyLabel').textContent = tired ? '手酸了…快出手！' : v > 0.97 ? '稳住了！松手' : '稳住…';
  }
  crosshair(ndc, visible = true, dim = false) {
    const el = $('crosshair');
    if (!ndc) { el.style.display = 'none'; return; }
    el.style.display = visible ? 'block' : 'none';
    this.cx = (ndc.x * 0.5 + 0.5) * innerWidth;
    this.cy = (-ndc.y * 0.5 + 0.5) * innerHeight;
    el.style.transform = `translate(${this.cx}px, ${this.cy}px)`;
    el.classList.toggle('dim', dim);
  }
  flashHit() {
    const el = $('hitmark');
    el.style.left = `${this.cx || innerWidth / 2}px`;
    el.style.top = `${this.cy || innerHeight / 2}px`;
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  }
  showRound({ title, lines, button, onClick }) {
    const p = $('roundPanel');
    p.querySelector('h2').textContent = title;
    p.querySelector('.lines').innerHTML = lines.map(l => `<div>${l}</div>`).join('');
    const b = p.querySelector('button');
    b.textContent = button;
    b.onclick = () => { p.classList.remove('show'); onClick(); };
    p.classList.add('show');
  }
  hideRound() { $('roundPanel').classList.remove('show'); }
}

// ───────────────────────── 启动 ─────────────────────────
async function main() {
  const loadText = $('loadText');
  loadText.textContent = '加载物理引擎…';
  await RAPIER.init();
  await nextFrame();

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  $('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.03, 600);
  scene.add(camera);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.16;

  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.55, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const audio = new Sound();
  const app = { renderer, scene, camera, RAPIER, audio, mode: 'overview' };
  const ui = new UI(app);
  app.ui = ui;

  loadText.textContent = '布置夜市广场…';
  await nextFrame();
  buildEnvironment(scene);
  loadText.textContent = '摆放套圈奖品…';
  await nextFrame();
  const ring = new RingToss(app, new THREE.Vector3(-4.6, 0, 0));
  loadText.textContent = '给气球打气…';
  await nextFrame();
  const balloon = new BalloonGame(app, new THREE.Vector3(4.6, 0, 0));
  const games = { ring, balloon };

  // 预编译着色器，避免进入时卡顿
  loadText.textContent = '点亮灯笼…';
  await nextFrame();
  camera.position.set(0, 2.7, 10.6);
  camera.lookAt(0, 1.3, -2.5);
  renderer.compile(scene, camera);
  composer.render();

  // 总览 → 摊位的可点击区域
  const hitboxes = [];
  for (const [key, g] of Object.entries(games)) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(4, 3.4, 6.5), new THREE.MeshBasicMaterial({ visible: false }));
    box.position.set(g.origin.x, 1.7, -2.6);
    box.userData.game = key;
    scene.add(box);
    hitboxes.push(box);
  }

  // ── 相机 ──
  const overview = { pos: new THREE.Vector3(0, 2.7, 10.6), look: new THREE.Vector3(0, 1.45, -2.5) };
  const ovLook = new THREE.Vector2();
  let tween = null;
  const lookQuat = (pos, look) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, look, new THREE.Vector3(0, 1, 0)));
  function flyTo(pose, done) {
    tween = {
      t: 0, dur: 1.7,
      p0: camera.position.clone(), q0: camera.quaternion.clone(),
      p1: pose.pos.clone(), q1: lookQuat(pose.pos, pose.look), done,
    };
  }

  function setMode(mode) {
    const prev = app.mode;
    if (prev === mode || tween) return;
    if (games[prev]) games[prev].exit();
    ui.hideRound();
    app.mode = 'moving';
    document.body.dataset.mode = 'moving';
    const target = mode === 'overview' ? overview : games[mode].getCameraPose();
    flyTo(target, () => {
      app.mode = mode;
      document.body.dataset.mode = mode;
      if (games[mode]) games[mode].enter();
      else { ui.hint('点击摊位或下方卡片开始游戏'); $('stats').innerHTML = ''; }
    });
  }
  app.setMode = setMode;
  window.__fair = { app, ring, balloon, setMode, composer };

  // ── 输入 ──
  const ndc = new THREE.Vector2();
  const canvas = renderer.domElement;
  const ray = new THREE.Raycaster();
  let hover = null;
  canvas.addEventListener('pointermove', e => {
    ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    for (const g of Object.values(games)) g.mouse.copy(ndc);
    if (app.mode === 'overview') {
      ray.setFromCamera(ndc, camera);
      const h = ray.intersectObjects(hitboxes)[0];
      hover = h ? h.object.userData.game : null;
      canvas.style.cursor = hover ? 'pointer' : 'default';
      document.querySelectorAll('.card').forEach(c => c.classList.toggle('hover', c.dataset.game === hover));
    }
  });
  canvas.addEventListener('pointerdown', e => {
    audio.init();
    if (app.mode === 'overview') { if (hover && e.button === 0) setMode(hover); return; }
    const g = games[app.mode];
    if (g) { canvas.setPointerCapture(e.pointerId); g.onPointerDown(e); }
  });
  canvas.addEventListener('pointerup', e => {
    const g = games[app.mode];
    if (g) g.onPointerUp(e);
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => { const g = games[app.mode]; if (g) { e.preventDefault(); g.onWheel(e); } }, { passive: false });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && games[app.mode]) setMode('overview');
    if (e.key === 'r' || e.key === 'R') { const g = games[app.mode]; if (g && g.roundOver) { ui.hideRound(); g.newRound(); } }
  });
  document.querySelectorAll('.card').forEach(c => c.addEventListener('click', () => { audio.init(); setMode(c.dataset.game); }));
  $('leaveBtn').addEventListener('click', () => setMode('overview'));
  $('musicBtn').addEventListener('click', () => {
    audio.init();
    audio.setMusic(!audio.musicOn);
    $('musicBtn').classList.toggle('off', !audio.musicOn);
  });
  $('assistBtn').addEventListener('click', () => {
    ui.assist = !ui.assist;
    $('assistBtn').classList.toggle('off', !ui.assist);
  });

  let sizeW = 0, sizeH = 0;
  function fitSize() {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    if (w === sizeW && h === sizeH) return;
    sizeW = w; sizeH = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
  }
  addEventListener('resize', fitSize);

  // ── 开始 ──
  $('loadText').textContent = '夜市已开张';
  $('startBtn').hidden = false;
  $('startBtn').addEventListener('click', () => {
    audio.init();
    $('loading').classList.add('gone');
    $('hud').hidden = false;
    document.body.dataset.mode = 'overview';
    ui.hint('点击摊位或下方卡片开始游戏');
  });

  // ── 主循环 ──
  const clock = new THREE.Clock();
  let t = 0;
  const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    fitSize();
    if (!innerWidth || !innerHeight) return;
    for (const u of updaters) u(t, dt);
    ring.update(dt, t);
    balloon.update(dt, t);

    if (tween) {
      tween.t += dt;
      const k = Math.min(1, tween.t / tween.dur);
      const e = ease(k);
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      camera.position.y += Math.sin(k * Math.PI) * 0.5;
      camera.quaternion.slerpQuaternions(tween.q0, tween.q1, e);
      if (k >= 1) { const d = tween.done; tween = null; d(); }
    } else if (app.mode === 'overview') {
      ovLook.lerp(ndc, 1 - Math.exp(-dt * 2));
      camera.position.copy(overview.pos);
      camera.position.x += ovLook.x * 0.6 + Math.sin(t * 0.15) * 0.3;
      camera.position.y += ovLook.y * 0.25;
      const look = overview.look.clone();
      look.x += ovLook.x * 1.6;
      look.y += ovLook.y * 0.8;
      camera.lookAt(look);
    } else if (games[app.mode]) {
      games[app.mode].updateCamera(camera, dt);
    }
    composer.render();
  });
}

main().catch(err => {
  console.error(err);
  $('loadText').textContent = '启动失败：' + err.message;
});
