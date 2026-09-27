export class AudioFX {
  constructor() { this.ctx = null; this.master = null; this.volume = 0.8; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  suspend() { this.ctx?.suspend(); }
  resume() { this.ctx?.resume(); }
  get ok() { return !!this.ctx && this.ctx.state === 'running'; }

  // Basic oscillator voice with optional pitch slide
  tone({ f = 440, f2 = null, dur = 0.2, type = 'sine', vol = 0.2, delay = 0, attack = 0.005 }) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // Filtered noise voice (splashes, whooshes, impacts, crowd)
  noise({ dur = 0.3, vol = 0.3, type = 'lowpass', f = 1000, f2 = null, q = 1, delay = 0, attack = 0.005 }) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  step()   { this.noise({ dur: 0.06, vol: 0.12, type: 'bandpass', f: 1400 + Math.random() * 600, q: 2 }); }
  jump()   { this.tone({ f: 280, f2: 640, dur: 0.18, type: 'square', vol: 0.06 }); this.tone({ f: 420, f2: 900, dur: 0.15, vol: 0.1 }); }
  land()   { this.noise({ dur: 0.14, vol: 0.25, f: 500, f2: 150 }); this.tone({ f: 130, f2: 60, dur: 0.12, vol: 0.25 }); }
  hit(l = 1) { this.noise({ dur: 0.25, vol: 0.3 + 0.15 * l, f: 1400, f2: 200 }); this.tone({ f: 200, f2: 60, dur: 0.3, type: 'sawtooth', vol: 0.1 + 0.05 * l }); }
  bounce() { this.tone({ f: 180, f2: 760, dur: 0.35, vol: 0.3 }); this.tone({ f: 360, f2: 1200, dur: 0.28, type: 'triangle', vol: 0.12, delay: 0.03 }); }
  whoosh(v = 1) { this.noise({ dur: 0.45, vol: 0.25 * v, type: 'bandpass', f: 300, f2: 1400, q: 1.5, attack: 0.15 }); }
  checkpoint() {
    [660, 880, 1320].forEach((f, i) => this.tone({ f, dur: 0.25, type: 'triangle', vol: 0.18, delay: i * 0.09 }));
    this.tone({ f: 1760, dur: 0.4, vol: 0.08, delay: 0.27 });
  }
  splash() {
    this.noise({ dur: 1.1, vol: 0.7, f: 2500, f2: 250, attack: 0.01 });
    this.noise({ dur: 0.6, vol: 0.25, type: 'highpass', f: 3000, delay: 0.05 });
    this.tone({ f: 110, f2: 40, dur: 0.5, vol: 0.45 });
    this.noise({ dur: 1.4, vol: 0.12, type: 'bandpass', f: 5000, q: 0.7, delay: 0.35, attack: 0.1 }); // droplets
  }
  beep() { this.tone({ f: 520, dur: 0.18, type: 'square', vol: 0.12 }); }
  go()   { this.tone({ f: 1040, dur: 0.5, type: 'square', vol: 0.14 }); this.tone({ f: 1560, dur: 0.5, vol: 0.1 }); }
  finish() {
    [523, 659, 784, 1047].forEach((f, i) => {
      const d = i === 3 ? 0.6 : 0.18;
      this.tone({ f, dur: d, type: 'square', vol: 0.1, delay: i * 0.13 });
      this.tone({ f: f / 2, dur: d, type: 'triangle', vol: 0.12, delay: i * 0.13 });
    });
    this.noise({ dur: 2.6, vol: 0.18, type: 'bandpass', f: 1200, q: 0.6, attack: 0.5 }); // crowd cheer
  }
  victory() { [784, 988, 1175, 1568].forEach((f, i) => this.tone({ f, dur: 0.2, type: 'triangle', vol: 0.12, delay: 0.6 + i * 0.1 })); }
  fail()  { this.tone({ f: 440, f2: 210, dur: 0.6, type: 'triangle', vol: 0.15 }); this.tone({ f: 330, f2: 150, dur: 0.8, type: 'triangle', vol: 0.12, delay: 0.25 }); }
  click() { this.tone({ f: 900, f2: 1300, dur: 0.05, type: 'square', vol: 0.06 }); }
}
