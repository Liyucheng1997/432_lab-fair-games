// 全部音效用 WebAudio 现场合成
export class Sound {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.lastClack = 0;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    this.ctx = new C();
    const ctx = this.ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.55; this.musicBus.connect(this.master);
    // 简单混响（给音乐和环境声一点空间感）
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(1.8, 2.5);
    const vg = ctx.createGain(); vg.gain.value = 0.22;
    this.verb.connect(vg); vg.connect(this.master);
    this.noise = this._noiseBuffer(3);
    this._ambience();
    this._music();
  }

  _noiseBuffer(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  _impulse(sec, decay) {
    const len = this.ctx.sampleRate * sec;
    const b = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  // 噪声冲击
  _hit({ t = 0, dur = 0.1, type = 'bandpass', freq = 1000, freqEnd, q = 1, gain = 0.5, attack = 0.001, out, pan = 0 }) {
    const ctx = this.ctx, now = ctx.currentTime + t;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, now); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(f); f.connect(g);
    let node = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    node.connect(out || this.sfx);
    src.start(now, Math.random() * 2, dur + 0.05);
  }

  _tone({ t = 0, freq = 440, freqEnd, type = 'sine', dur = 0.2, gain = 0.3, attack = 0.002, out, detune = 0 }) {
    const ctx = this.ctx, now = ctx.currentTime + t;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, now); o.detune.value = detune;
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(out || this.sfx);
    o.start(now); o.stop(now + dur + 0.05);
  }

  ok() { return !!this.ctx; }

  // ── 套圈 ──
  whoosh(power = 1) {
    if (!this.ok()) return;
    this._hit({ dur: 0.32, type: 'bandpass', freq: 380, freqEnd: 1500, q: 1.4, gain: 0.18 * power, attack: 0.09 });
  }
  clack(strength, kind) {
    if (!this.ok()) return;
    const now = this.ctx.currentTime;
    if (now - this.lastClack < 0.025) return;
    this.lastClack = now;
    const s = Math.min(1, strength);
    if (s < 0.04) return;
    if (kind === 'prize') {
      const f = 1900 + Math.random() * 1600;
      this._tone({ freq: f, dur: 0.35, gain: 0.12 * s, type: 'sine' });
      this._tone({ freq: f * 2.76, dur: 0.15, gain: 0.05 * s, type: 'sine' });
      this._hit({ dur: 0.03, type: 'highpass', freq: 3000, gain: 0.15 * s });
    } else if (kind === 'ring') {
      this._hit({ dur: 0.04, type: 'bandpass', freq: 2600, q: 3, gain: 0.3 * s });
      this._tone({ freq: 1100 + Math.random() * 300, dur: 0.05, gain: 0.06 * s, type: 'triangle' });
    } else if (kind === 'wood') {
      this._hit({ dur: 0.06, type: 'bandpass', freq: 700, q: 2, gain: 0.4 * s });
      this._tone({ freq: 320, dur: 0.06, gain: 0.12 * s, type: 'triangle' });
    } else {
      // 地毯 / 地面：闷一些
      this._hit({ dur: 0.07, type: 'lowpass', freq: 1300, gain: 0.35 * s });
      this._tone({ freq: 650 + Math.random() * 200, dur: 0.04, gain: 0.06 * s, type: 'triangle' });
    }
  }
  win() {
    if (!this.ok()) return;
    const notes = [784, 880, 1047, 1319, 1568];
    notes.forEach((f, i) => {
      this._tone({ t: i * 0.08, freq: f, dur: 0.9, gain: 0.12, type: 'sine' });
      this._tone({ t: i * 0.08, freq: f * 2, dur: 0.4, gain: 0.03, type: 'sine' });
    });
    // 小锣
    this._tone({ t: 0.42, freq: 420, freqEnd: 380, dur: 1.6, gain: 0.08, type: 'triangle' });
    this._hit({ t: 0.42, dur: 1.0, type: 'bandpass', freq: 1800, q: 6, gain: 0.05 });
  }
  coin() {
    if (!this.ok()) return;
    this._tone({ freq: 1320, dur: 0.12, gain: 0.12, type: 'square' });
    this._tone({ t: 0.08, freq: 1760, dur: 0.3, gain: 0.1, type: 'square' });
  }
  pickup() {
    if (!this.ok()) return;
    this._hit({ dur: 0.05, type: 'bandpass', freq: 2200, q: 2, gain: 0.12 });
  }

  // ── 打气球 ──
  shot() {
    if (!this.ok()) return;
    this._hit({ dur: 0.09, type: 'highpass', freq: 1200, gain: 0.55, attack: 0.001 });
    this._hit({ dur: 0.14, type: 'lowpass', freq: 400, gain: 0.5 });
    this._tone({ freq: 160, freqEnd: 60, dur: 0.1, gain: 0.35 });
    this._tone({ freq: 3400, dur: 0.02, gain: 0.06, type: 'square' });
  }
  reload() {
    if (!this.ok()) return;
    this._hit({ t: 0.0, dur: 0.04, type: 'bandpass', freq: 2400, q: 4, gain: 0.25 });
    this._hit({ t: 0.18, dur: 0.06, type: 'bandpass', freq: 1300, q: 3, gain: 0.3 });
    this._tone({ t: 0.18, freq: 900, dur: 0.04, gain: 0.05, type: 'square' });
  }
  pop() {
    if (!this.ok()) return;
    this._hit({ dur: 0.11, type: 'highpass', freq: 700, gain: 0.9, attack: 0.0008 });
    this._hit({ dur: 0.2, type: 'lowpass', freq: 600, gain: 0.5, attack: 0.0008 });
    this._tone({ freq: 120, freqEnd: 50, dur: 0.12, gain: 0.3 });
  }
  boing() {
    if (!this.ok()) return;
    this._tone({ freq: 260, freqEnd: 150, dur: 0.18, gain: 0.18, type: 'sine' });
    this._hit({ dur: 0.05, type: 'bandpass', freq: 900, q: 3, gain: 0.15 });
  }
  thunk() {
    if (!this.ok()) return;
    this._hit({ dur: 0.06, type: 'lowpass', freq: 700, gain: 0.3 });
    this._tone({ freq: 210, dur: 0.06, gain: 0.08, type: 'triangle' });
  }

  // ── 环境：人声嘈杂 ──
  _ambience() {
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0.06; out.connect(this.master);
    for (const [f, q, lfoF] of [[320, 0.8, 0.31], [780, 1.2, 0.53], [1500, 1.5, 0.77]]) {
      const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0.6;
      const lfo = ctx.createOscillator(); lfo.frequency.value = lfoF;
      const lg = ctx.createGain(); lg.gain.value = 0.35;
      lfo.connect(lg); lg.connect(g.gain);
      src.connect(bp); bp.connect(g); g.connect(out);
      src.start(0, Math.random() * 2); lfo.start();
    }
    this.ambOut = out;
  }

  // ── 背景音乐：五声音阶拨弦小调 ──
  _music() {
    const ctx = this.ctx;
    const scale = [392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    const delay = ctx.createDelay(); delay.delayTime.value = 0.36;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    delay.connect(fb); fb.connect(delay);
    const mOut = ctx.createGain(); mOut.gain.value = 1; mOut.connect(this.musicBus);
    delay.connect(mOut); mOut.connect(this.verb);
    const pluck = (time, f, g = 0.06) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f * 1.01, time);
      o.frequency.exponentialRampToValueAtTime(f, time + 0.05);
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(4000, time);
      lp.frequency.exponentialRampToValueAtTime(700, time + 0.5);
      const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, time);
      gg.gain.exponentialRampToValueAtTime(g, time + 0.004);
      gg.gain.exponentialRampToValueAtTime(0.0001, time + 1.1);
      const g2 = ctx.createGain(); g2.gain.value = 0.25;
      o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(gg); gg.connect(mOut); gg.connect(delay);
      o.start(time); o2.start(time); o.stop(time + 1.2); o2.stop(time + 1.2);
    };
    const bass = (time, f) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, time);
      gg.gain.exponentialRampToValueAtTime(0.07, time + 0.02);
      gg.gain.exponentialRampToValueAtTime(0.0001, time + 1.4);
      o.connect(gg); gg.connect(mOut); o.start(time); o.stop(time + 1.5);
    };
    const beat = 60 / 96 / 2;
    let next = ctx.currentTime + 0.3, step = 0, idx = 3;
    const motif = [0, 1, 2, 1, 3, 2, 1, 0, 2, 3, 4, 3, 2, 1, 2, -1];
    setInterval(() => {
      if (!this.musicOn) { next = ctx.currentTime + 0.1; return; }
      while (next < ctx.currentTime + 0.25) {
        const bar = Math.floor(step / 16);
        const m = motif[step % 16];
        if (m >= 0 && (step % 2 === 0 || Math.random() < 0.35)) {
          idx = Math.max(0, Math.min(scale.length - 1, m + (bar % 4 === 2 ? 2 : 0) + (Math.random() < 0.2 ? 1 : 0)));
          pluck(next, scale[idx], step % 4 === 0 ? 0.07 : 0.045);
        }
        if (step % 8 === 0) bass(next, [98, 110, 130.8, 98][bar % 4]);
        next += beat; step++;
      }
    }, 80);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.2);
  }
}
