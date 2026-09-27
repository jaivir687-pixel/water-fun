import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V3 = THREE.Vector3;
export const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const PR = 0.35, PH = 1.75; // player capsule radius / height

// ---------------- RENDERER / SCENE ----------------
export const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.62;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe8f5, 180, 1100);
export const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 8000);

// Physical sky + image based lighting (reflections on every glossy surface)
export const sunDir = new V3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(35));
const sky = new Sky(); sky.scale.setScalar(5000);
const su = sky.material.uniforms;
su.turbidity.value = 3.5; su.rayleigh.value = 1.4; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.85;
su.sunPosition.value.copy(sunDir);
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene(); envScene.add(sky);
scene.environment = pmrem.fromScene(envScene).texture;
scene.add(sky);

scene.add(new THREE.HemisphereLight(0xd6ecff, 0x5a8a50, 0.9));
export const sun = new THREE.DirectionalLight(0xfff0d8, 3.4);
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 26, bottom: -26, near: 1, far: 220 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// Post processing: HDR + MSAA + bloom + ACES output
export const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
export const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.45, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());
export function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize); resize();

// ---------------- WATER ----------------
function waterNormals(size = 256) {
  const waves = [];
  for (let i = 0; i < 28; i++) {
    const kx = Math.round((Math.random() * 2 - 1) * 16), ky = Math.round((Math.random() * 2 - 1) * 16);
    if (kx || ky) waves.push([kx, ky, Math.random() * 6.283, 1 / Math.hypot(kx, ky)]);
  }
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0; for (const w of waves) v += Math.sin((x * w[0] + y * w[1]) * 6.283 / size + w[2]) * w[3];
    H[y * size + x] = v;
  }
  const d = new Uint8Array(size * size * 4), n = new V3();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = H[y * size + (x + 1) % size] - H[y * size + (x - 1 + size) % size];
    const dy = H[((y + 1) % size) * size + x] - H[((y - 1 + size) % size) * size + x];
    n.set(-dx * 3, -dy * 3, 1).normalize(); const i = (y * size + x) * 4;
    d[i] = (n.x * 0.5 + 0.5) * 255; d[i + 1] = (n.y * 0.5 + 0.5) * 255; d[i + 2] = (n.z * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}
export const POOL = { x0: -90, x1: 380, z0: -32, z1: 26 };
export const water = new Water(new THREE.PlaneGeometry(POOL.x1 - POOL.x0, POOL.z1 - POOL.z0), {
  textureWidth: 1024, textureHeight: 1024, waterNormals: waterNormals(), sunDirection: sunDir.clone(),
  sunColor: 0xffffff, waterColor: 0x0fb8c9, distortionScale: 2.4, fog: true,
});
water.rotation.x = -Math.PI / 2;
water.position.set((POOL.x0 + POOL.x1) / 2, 0, (POOL.z0 + POOL.z1) / 2);
water.material.uniforms.size.value = 3.2; water.receiveShadow = true;
scene.add(water);

// ---------------- MATERIALS / HELPERS ----------------
const pm = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, ...o });
export const MAT = {
  white: pm(0xf6f8fb), blue: pm(0x1f6fff), red: pm(0xff2e45), yellow: pm(0xffd21a), pink: pm(0xff3fa4),
  metal: new THREE.MeshStandardMaterial({ color: 0xdfe5ee, metalness: 0.85, roughness: 0.22 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2b3140, roughness: 0.6 }),
  cable: new THREE.MeshStandardMaterial({ color: 0x333a44, metalness: 0.6, roughness: 0.4 }),
};
const M = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; return o; };
function cylBetween(a, b, r, mat) {
  const d = new V3().subVectors(b, a), m = M(new THREE.CylinderGeometry(r, r, d.length(), 12), mat);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize()); return m;
}
function textTex(text, checker) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  if (checker) { for (let x = 0; x < 32; x++) for (let y = 0; y < 8; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 32, y * 32, 32, 32); } }
  else { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#2b8cff'); gr.addColorStop(1, '#0b4fc4'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 256); }
  if (text) {
    g.font = '900 170px Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 18; g.strokeStyle = checker ? '#ff2e45' : '#073a8f'; g.strokeText(text, 512, 138);
    g.fillStyle = checker ? '#ffd21a' : '#fff'; g.fillText(text, 512, 138);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// ---------------- STATIC ENVIRONMENT ----------------
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V3(), _p = new V3(), _c = new THREE.Color();
export const env = { clouds: [], buoys: null, buoyPos: [], flags: [] };
(function buildEnvironment() {
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ color: 0x58b04a, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.35; grass.receiveShadow = true; scene.add(grass);

  const rimM = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.55 });
  const W = POOL.x1 - POOL.x0, D = POOL.z1 - POOL.z0, cx = (POOL.x0 + POOL.x1) / 2, cz = (POOL.z0 + POOL.z1) / 2;
  [[W + 4, 2, cx, POOL.z0 - 1], [W + 4, 2, cx, POOL.z1 + 1], [2, D, POOL.x0 - 1, cz], [2, D, POOL.x1 + 1, cz]].forEach(([w, d, x, z]) => {
    const b = M(new THREE.BoxGeometry(w, 0.8, d), rimM); b.position.set(x, 0, z); scene.add(b);
  });

  const hillM = [0x4f9e44, 0x6bbf52, 0x3f8a3c].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
  for (let i = 0; i < 24; i++) {
    const r = 60 + Math.random() * 110, h = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 20), hillM[i % 3]);
    h.scale.y = 0.28 + Math.random() * 0.2; h.position.set(-320 + i * 40 + Math.random() * 30, -r * 0.02, -190 - Math.random() * 260);
    h.receiveShadow = true; scene.add(h);
  }

  const N = 280;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 8), new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 1 }), N);
  const leaf = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.2, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), N);
  for (let i = 0; i < N; i++) {
    const x = POOL.x0 - 40 + Math.random() * (W + 80), z = POOL.z0 - 10 - Math.random() * 120, sc = 0.7 + Math.random() * 0.9;
    _q.identity(); m4set(trunk, i, _p.set(x, 1.5 * sc - 0.35, z), _s.set(sc, sc, sc));
    m4set(leaf, i, _p.set(x, 3.6 * sc, z), _s.set(sc, sc * (1 + Math.random() * 0.5), sc));
    leaf.setColorAt(i, _c.setHSL(0.27 + Math.random() * 0.08, 0.55, 0.28 + Math.random() * 0.15));
  }
  trunk.castShadow = leaf.castShadow = true; scene.add(trunk, leaf);

  // Grandstands with colorful seat rows
  const seatM = [MAT.red, MAT.blue, MAT.yellow, MAT.white];
  for (let s = 0; s < 6; s++) for (let r = 0; r < 6; r++) {
    const b = M(new THREE.BoxGeometry(26, 0.8, 2), seatM[(r + s) % 4]);
    b.position.set(-20 + s * 60, r * 0.8 + 0.1, POOL.z0 - 6 - r * 2); scene.add(b);
  }
  // Light towers + foreground striped flag poles (depth layers)
  for (let i = 0; i < 6; i++) {
    const t = M(new THREE.CylinderGeometry(0.4, 0.6, 22, 12), MAT.metal); t.position.set(i * 65, 11, POOL.z0 - 20); scene.add(t);
    const l = M(new THREE.BoxGeometry(4, 2, 0.6), MAT.white); l.position.set(i * 65, 22.5, POOL.z0 - 20); scene.add(l);
  }
  const flagCols = [0xff2e45, 0xffd21a, 0x1f6fff, 0x22d36a];
  for (let x = -20; x < POOL.x1; x += 28) {
    const p = M(new THREE.CylinderGeometry(0.18, 0.22, 10, 12), MAT.white); p.position.set(x, 4.5, 7.5); scene.add(p);
    const f = M(new THREE.PlaneGeometry(1.8, 1, 6, 2), new THREE.MeshStandardMaterial({ color: flagCols[(x / 28 | 0) & 3], side: THREE.DoubleSide, roughness: 0.6 }));
    f.position.set(x + 0.9, 8.8, 7.5); scene.add(f); env.flags.push(f);
  }

  const cloudM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.25 });
  for (let i = 0; i < 20; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 7; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(8 + Math.random() * 8, 16, 12), cloudM);
      s.position.set((k - 3) * 9 + Math.random() * 4, Math.random() * 5, Math.random() * 6); s.scale.y = 0.6; g.add(s);
    }
    g.position.set(-300 + Math.random() * 1000, 80 + Math.random() * 70, -320 - Math.random() * 380); scene.add(g); env.clouds.push(g);
  }

  // Floating lane-rope buoys (foreground + background)
  for (let x = POOL.x0 + 2; x < POOL.x1 - 2; x += 1.2) env.buoyPos.push([x, 5.5], [x, -6]);
  env.buoys = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 12, 8), pm(0xffffff), env.buoyPos.length);
  env.buoyPos.forEach((b, i) => env.buoys.setColorAt(i, _c.set(((b[0] / 1.2) | 0) % 2 ? 0xff2e45 : 0xffffff)));
  env.buoys.castShadow = true; scene.add(env.buoys);
})();
function m4set(im, i, p, s) { _m4.compose(p, _q, s); im.setMatrixAt(i, _m4); }

export function updateEnv(dt, t) {
  for (const c of env.clouds) { c.position.x += dt * 1.5; if (c.position.x > 750) c.position.x = -350; }
  env.flags.forEach((f, i) => { f.rotation.y = Math.sin(t * 3 + i) * 0.25; });
  _q.identity(); _s.set(1, 1, 1);
  env.buoyPos.forEach((b, i) => m4set(env.buoys, i, _p.set(b[0], 0.05 + Math.sin(t * 1.5 + b[0] * 0.6) * 0.06, b[1]), _s));
  env.buoys.instanceMatrix.needsUpdate = true;
  water.material.uniforms.time.value += dt * 0.5;
}

// ---------------- PARTICLES / SPLASH / RIPPLES ----------------
class Particles {
  constructor(max, geo, mat) {
    this.m = new THREE.InstancedMesh(geo, mat, max); this.m.count = 0; this.m.frustumCulled = false;
    this.m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.m.setColorAt(0, new THREE.Color());
    this.max = max; this.p = []; scene.add(this.m);
  }
  spawn(pos, vel, o = {}) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({ pos: pos.clone(), vel: vel.clone(), life: o.life ?? 1, age: 0, size: o.size ?? 0.1, g: o.g ?? 20, drag: o.drag ?? 0.5,
      color: new THREE.Color(o.color ?? 0xffffff), rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), spin: o.spin ?? 0, water: !!o.water });
  }
  update(dt) {
    this.p = this.p.filter(p => (p.age += dt) < p.life);
    let n = 0;
    for (const p of this.p) {
      p.vel.y -= p.g * dt; p.vel.multiplyScalar(Math.exp(-p.drag * dt)); p.pos.addScaledVector(p.vel, dt);
      if (p.water && p.pos.y < 0 && p.vel.y < 0) { p.age = p.life; continue; }
      p.rot.x += p.spin * dt; p.rot.y += p.spin * 0.7 * dt;
      const k = 1 - p.age / p.life;
      _q.setFromEuler(p.rot); _s.setScalar(p.size * Math.min(1, k * 3));
      _m4.compose(p.pos, _q, _s); this.m.setMatrixAt(n, _m4); this.m.setColorAt(n, p.color); n++;
    }
    this.m.count = n; this.m.instanceMatrix.needsUpdate = true; this.m.instanceColor.needsUpdate = true;
  }
  clear() { this.p.length = 0; }
}
export const drops = new Particles(900, new THREE.SphereGeometry(1, 8, 6), pm(0xffffff, { roughness: 0.05, transparent: true, opacity: 0.85 }));
export const confetti = new Particles(700, new THREE.PlaneGeometry(1, 0.6), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5 }));
export const sparks = new Particles(300, new THREE.OctahedronGeometry(1), new THREE.MeshBasicMaterial({ toneMapped: false }));

const ripples = [], ringGeo = new THREE.RingGeometry(0.85, 1, 48), discGeo = new THREE.CircleGeometry(1, 40);
export function ripple(x, z, size = 1, delay = 0, foam = false) {
  const m = new THREE.Mesh(foam ? discGeo : ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.04, z); m.visible = false; scene.add(m);
  ripples.push({ m, age: -delay, life: foam ? 1.6 : 2.2, size, foam });
}
export function splash(x, z, power = 1) {
  const n = Math.round(110 * power);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, r = Math.random(), sp = (2 + Math.random() * 4) * power;
    drops.spawn(new V3(x + Math.cos(a) * 0.3, 0.1, z + Math.sin(a) * 0.3),
      new V3(Math.cos(a) * sp * r, (5 + Math.random() * 7) * power, Math.sin(a) * sp * r),
      { life: 1.8, size: 0.05 + Math.random() * 0.09, g: 18, drag: 0.4, color: Math.random() < 0.5 ? 0xffffff : 0xbff6ff, water: true });
  }
  for (let i = 0; i < 40; i++) drops.spawn(new V3(x + (Math.random() - 0.5) * 0.5, 0.2, z + (Math.random() - 0.5) * 0.5),
    new V3((Math.random() - 0.5) * 1.5, (9 + Math.random() * 5) * power, (Math.random() - 0.5) * 1.5),
    { life: 1.8, size: 0.12 + Math.random() * 0.1, g: 20, drag: 0.3, color: 0xe8fdff, water: true });
  ripple(x, z, 1.2 * power, 0, true);
  [0, 0.25, 0.5, 0.8].forEach((d, i) => ripple(x, z, (1 + i * 0.4) * power, d));
}
export function burst(sys, pos, n, color, speed = 4, o = {}) {
  for (let i = 0; i < n; i++) sys.spawn(pos, new V3((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed),
    { life: 0.8, size: 0.07, g: 6, drag: 1.5, color, spin: 6, ...o });
}
export function updateFX(dt) {
  drops.update(dt); confetti.update(dt); sparks.update(dt);
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i]; r.age += dt; if (r.age < 0) continue;
    const k = r.age / r.life; r.m.visible = true;
    r.m.scale.setScalar(r.size * (r.foam ? 0.8 + k * 1.5 : 0.4 + k * 4));
    r.m.material.opacity = r.foam ? 0.8 * (1 - k) ** 2 : 0.7 * (1 - k);
    if (k >= 1) { scene.remove(r.m); r.m.material.dispose(); ripples.splice(i, 1); }
  }
}

// ---------------- COURSE ----------------
function rng(seed) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

class Platform {
  constructor(c, o) {
    Object.assign(this, { x0: o.x0, x1: o.x1, top: o.y, cz: o.z ?? 0, hd: (o.d ?? 4) / 2, h: o.h ?? 0.9, rise: o.rise ?? 0,
      bounce: !!o.bounce, move: o.move ?? null, squash: 0, offset: new V3(), delta: new V3() });
    this.base = { x0: this.x0, x1: this.x1, top: this.top, cz: this.cz };
    this.mesh = this.bounce ? this.padMesh() : this.boxMesh(o.style);
    c.group.add(this.mesh); c.platforms.push(this);
    if (!this.move) {
      const w = this.x1 - this.x0, n = Math.max(1, Math.round(w / 4.5));
      const zs = this.hd > 0.8 ? [this.cz - this.hd + 0.4, this.cz + this.hd - 0.4] : [this.cz];
      for (let i = 0; i < n; i++) { const x = this.x0 + (i + 0.5) * w / n; for (const z of zs) c.poles.push([x, this.topAt(x) - this.h, z]); }
    }
  }
  get cx() { return (this.x0 + this.x1) / 2; }
  topAt(x) { return this.rise ? this.top + this.rise * clamp((x - this.x0) / (this.x1 - this.x0), 0, 1) : this.top; }
  boxMesh(style) {
    const w = this.x1 - this.x0, d = this.hd * 2, h = this.h, len = this.rise ? Math.hypot(w, this.rise) : w;
    const narrow = style === 'narrow', g = new THREE.Group();
    const slab = M(new RoundedBoxGeometry(len, 0.16, d, 2, 0.05), narrow ? MAT.red : MAT.white); slab.position.y = -0.08; g.add(slab);
    const body = M(new RoundedBoxGeometry(len - 0.06, h - 0.12, Math.max(0.2, d - 0.06), 2, 0.06), narrow ? MAT.white : this.move ? MAT.yellow : MAT.blue);
    body.position.y = -0.12 - (h - 0.12) / 2; g.add(body);
    if (d > 1.2) for (const s of [-1, 1]) {
      const rail = M(new THREE.CylinderGeometry(0.07, 0.07, len, 12), MAT.red); rail.rotation.z = Math.PI / 2; rail.position.set(0, -0.07, s * this.hd); g.add(rail);
    }
    if (this.rise) g.rotation.z = Math.atan2(this.rise, w);
    g.position.set(this.cx, this.top + this.rise / 2, this.cz); return g;
  }
  padMesh() {
    const r = Math.min(this.hd, (this.x1 - this.x0) / 2), g = new THREE.Group();
    const base = M(new THREE.CylinderGeometry(r, r * 1.05, this.h - 0.3, 32), MAT.dark); base.position.y = -0.3 - (this.h - 0.3) / 2; g.add(base);
    for (let i = 0; i < 2; i++) { const coil = M(new THREE.TorusGeometry(r * 0.6, 0.06, 8, 32), MAT.metal); coil.rotation.x = Math.PI / 2; coil.position.y = -0.22 - i * 0.06; g.add(coil); }
    this.padTop = new THREE.Group(); g.add(this.padTop);
    const top = M(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.2, 32), MAT.pink); top.position.y = -0.1; this.padTop.add(top);
    const ring = M(new THREE.TorusGeometry(r * 0.95, 0.07, 8, 32), MAT.yellow); ring.rotation.x = Math.PI / 2; ring.position.y = -0.02; this.padTop.add(ring);
    g.position.set(this.cx, this.top, this.cz); return g;
  }
  update(t, dt) {
    if (this.bounce) {
      this.squash *= Math.exp(-7 * dt);
      this.padTop.position.y = -0.2 * this.squash * Math.abs(Math.cos(this.squash * 9));
      this.padTop.scale.set(1 + 0.08 * this.squash, 1, 1 + 0.08 * this.squash);
    }
    if (!this.move) return;
    const m = this.move, s = Math.sin(t * m.speed + m.phase) * m.amp, nx = m.axis[0] * s, ny = m.axis[1] * s, nz = m.axis[2] * s;
    this.delta.set(nx - this.offset.x, ny - this.offset.y, nz - this.offset.z); this.offset.set(nx, ny, nz);
    this.x0 = this.base.x0 + nx; this.x1 = this.base.x1 + nx; this.top = this.base.top + ny; this.cz = this.base.cz + nz;
    this.mesh.position.set(this.cx, this.top, this.cz);
  }
}

// Rotating bars / rotating arm machines. levels: [{h, len, n, speed, r, phase}]
class Spinner {
  constructor(c, o) {
    Object.assign(this, { x: o.x, z: o.z ?? 0, top: o.top, levels: o.levels, cleared: false, hubR: 0.4 });
    this.clearX = o.x + Math.max(...o.levels.map(l => l.len)) + 0.4;
    this.hubH = Math.max(...o.levels.map(l => l.h)) + 0.5;
    const g = new THREE.Group(); g.position.set(this.x, this.top, this.z); c.group.add(g);
    const hub = M(new THREE.CylinderGeometry(0.32, 0.4, this.hubH, 24), MAT.red); hub.position.y = this.hubH / 2; g.add(hub);
    const cap = M(new THREE.SphereGeometry(0.36, 20, 12), MAT.yellow); cap.position.y = this.hubH; g.add(cap);
    for (const L of this.levels) {
      L.ang = L.phase ?? 0; L.group = new THREE.Group(); L.group.position.y = L.h; g.add(L.group);
      for (let i = 0; i < L.n; i++) {
        const a = new THREE.Group(); a.rotation.y = i * 2 * Math.PI / L.n; L.group.add(a);
        const bar = M(new THREE.CylinderGeometry(L.r, L.r, L.len, 18), i % 2 ? MAT.blue : MAT.white); bar.rotation.z = Math.PI / 2; bar.position.x = L.len / 2; a.add(bar);
        const tip = M(new THREE.SphereGeometry(L.r * 1.3, 16, 12), MAT.red); tip.position.x = L.len; a.add(tip);
      }
    }
  }
  update(t, dt) { for (const L of this.levels) { L.ang += L.speed * dt; L.group.rotation.y = L.ang; } }
  collide(P, hit) {
    const px = P.pos.x, pz = P.pos.z;
    if (Math.abs(px - this.x) > 5) return;
    // Solid hub column
    let hx = px - this.x, hz = pz - this.z, hd = Math.hypot(hx, hz);
    if (hd < PR + this.hubR && P.pos.y < this.top + this.hubH && P.pos.y + PH > this.top) {
      if (hd < 1e-4) { hx = -1; hz = 0; hd = 1; }
      let nx = hx / hd, nz = hz / hd;
      if (Math.abs(nz) < 0.35) { nz = (pz >= this.z ? 1 : -1) * 0.35; const l = Math.hypot(nx, nz); nx /= l; nz /= l; }
      const pen = PR + this.hubR - hd; P.pos.x += nx * pen; P.pos.z += nz * pen;
    }
    const y0 = P.pos.y + PR, y1 = P.pos.y + PH - PR;
    for (const L of this.levels) {
      const ay = this.top + L.h, dy = clamp(ay, y0, y1) - ay;
      if (Math.abs(dy) > PR + L.r) continue;
      for (let i = 0; i < L.n; i++) {
        const a = L.ang + i * 2 * Math.PI / L.n, dx = Math.cos(a), dz = -Math.sin(a);
        const t = clamp((px - this.x) * dx + (pz - this.z) * dz, 0, L.len);
        const ex = px - (this.x + dx * t), ez = pz - (this.z + dz * t), dist = Math.hypot(ex, ez, dy);
        if (dist < PR + L.r) {
          const hl = Math.hypot(ex, ez) || 1, pen = PR + L.r - dist;
          P.pos.x += ex / hl * pen; P.pos.z += ez / hl * pen;
          const vx = -Math.sin(a) * L.speed * t, vz = -Math.cos(a) * L.speed * t;
          hit(vx + ex / hl * 1.5, vz + ez / hl * 1.5, Math.abs(L.speed) * t + 1.5);
          return;
        }
      }
    }
  }
}

// Swinging heavy blocks (axis 'z') and pendulum balls (axis 'x')
class Pendulum {
  constructor(c, o) {
    Object.assign(this, o, { cleared: false, prevTh: 0, bob: new V3(), vel: new V3() });
    this.clearX = o.x + (o.axis === 'x' ? o.len * Math.sin(o.amp) : 0) + o.R + 0.3;
    const g = new THREE.Group(); g.position.set(o.x, o.pivotY, o.z); c.group.add(g); this.pivot = g;
    const cl = o.len - o.R, cable = M(new THREE.CylinderGeometry(0.04, 0.04, cl, 8), MAT.cable); cable.position.y = -cl / 2; g.add(cable);
    if (o.kind === 'ball') {
      const b = M(new THREE.SphereGeometry(o.R, 36, 24), MAT.red); b.position.y = -o.len; g.add(b);
      const st = M(new THREE.TorusGeometry(o.R * 1.01, 0.09, 10, 40), MAT.white); st.position.y = -o.len; g.add(st);
    } else {
      const b = M(new RoundedBoxGeometry(o.R * 1.7, o.R * 1.5, o.R * 1.7, 3, 0.2), MAT.blue); b.position.y = -o.len; g.add(b);
      const st = M(new RoundedBoxGeometry(o.R * 1.75, 0.18, o.R * 1.75, 2, 0.06), MAT.white); st.position.y = -o.len; g.add(st);
    }
  }
  update(t) {
    const w = t * this.speed + this.phase, th = this.amp * Math.sin(w), thd = this.amp * this.speed * Math.cos(w);
    if (this.axis === 'x') this.pivot.rotation.z = th; else this.pivot.rotation.x = -th;
    const s = Math.sin(th), c = Math.cos(th), L = this.len, ax = this.axis === 'x' ? 1 : 0, az = 1 - ax;
    this.bob.set(this.x + ax * s * L, this.pivotY - c * L, this.z + az * s * L);
    this.vel.set(ax * c * L * thd, s * L * thd, az * c * L * thd);
    if (Math.sign(th) !== Math.sign(this.prevTh) && world.onWhoosh) world.onWhoosh(this.bob);
    this.prevTh = th;
  }
  collide(P, hit) {
    const b = this.bob, dx = P.pos.x - b.x, dz = P.pos.z - b.z;
    const dy = clamp(b.y, P.pos.y + PR, P.pos.y + PH - PR) - b.y, d = Math.hypot(dx, dy, dz);
    if (d >= PR + this.R) return;
    const hl = Math.hypot(dx, dz) || 1, pen = PR + this.R - d;
    P.pos.x += dx / hl * pen; P.pos.z += dz / hl * pen;
    hit(this.vel.x + dx / hl * 1.5, this.vel.z + dz / hl * 1.5, Math.hypot(this.vel.x, this.vel.z) + 1);
  }
}

function addGantry(c, x0, x1, y, along) {
  if (along === 'x') { // A-frames at both ends, beam along travel direction
    for (const x of [x0, x1]) for (const s of [-1, 1]) c.group.add(cylBetween(new V3(x, -0.5, s * 3.2), new V3(x, y, 0), 0.14, MAT.metal));
    c.group.add(cylBetween(new V3(x0, y, 0), new V3(x1, y, 0), 0.16, MAT.red));
  } else { // posts on both sides, beam across the course
    for (const s of [-1, 1]) c.group.add(cylBetween(new V3(x0, -0.5, s * 3.4), new V3(x0, y, s * 3.4), 0.16, MAT.metal));
    c.group.add(cylBetween(new V3(x0, y, -3.4), new V3(x0, y, 3.4), 0.16, MAT.red));
  }
}
function addCheckpoint(c, x, top) {
  const g = new THREE.Group(); g.position.set(x, top, 0);
  for (const s of [-1, 1]) { const p = M(new THREE.CylinderGeometry(0.09, 0.09, 3.2, 12), MAT.metal); p.position.set(0, 1.6, s * 2.1); g.add(p); }
  const bar = M(new THREE.CylinderGeometry(0.08, 0.08, 4.3, 12), MAT.metal); bar.rotation.x = Math.PI / 2; bar.position.y = 3.2; g.add(bar);
  const flagM = new THREE.MeshStandardMaterial({ color: 0x9aa3b0, roughness: 0.6, side: THREE.DoubleSide });
  const flag = M(new THREE.PlaneGeometry(1.2, 0.7, 8, 1), flagM); flag.position.set(0.6, 2.8, 2.1); g.add(flag);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: 0x6bff9a, transparent: true, opacity: 0, toneMapped: false }));
  ring.rotation.y = Math.PI / 2; ring.position.y = 1.2; g.add(ring);
  c.group.add(g);
  c.checkpoints.push({ x, pos: new V3(x, top, 0), active: false, flagM, flag, ring, fx: 0 });
}
function addArch(c, x, top, text, checker) {
  const g = new THREE.Group(); g.position.set(x, top, 0);
  for (const s of [-1, 1]) { const col = M(new THREE.CylinderGeometry(0.3, 0.35, 6, 20), s > 0 ? MAT.red : MAT.blue); col.position.set(0, 3, s * 3.3); g.add(col); }
  const beam = M(new RoundedBoxGeometry(0.5, 0.5, 7.4, 2, 0.12), MAT.white); beam.position.y = 6.1; g.add(beam);
  const tex = textTex(text, false);
  const sign = M(new RoundedBoxGeometry(6.4, 1.7, 0.3, 2, 0.1), MAT.white); sign.position.set(0, 7.2, 0); g.add(sign);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.45), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3, roughness: 0.4 }));
  face.position.set(0, 7.2, 0.16); g.add(face);
  if (checker) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 6.6), new THREE.MeshStandardMaterial({ map: textTex('', true), roughness: 0.5 }));
    line.rotation.x = -Math.PI / 2; line.position.y = 0.012; line.receiveShadow = true; g.add(line);
  }
  c.group.add(g);
}

export const world = { course: null, onWhoosh: null };

// Course layout: START > simple > first jump > moving > rotating bars > CP > swinging > narrow > ramp/CP
// > bounce > CP > multiple hazards > hard (CP) > final challenge > FINISH. Difficulty scales per course level.
export function buildCourse(level = 1) {
  if (world.course) { scene.remove(world.course.group); world.course.group.traverse(o => o.geometry?.dispose()); }
  const R = rng(1234 + level * 977), D = 1 + (level - 1) * 0.18, dir = () => (R() < 0.5 ? -1 : 1);
  const c = { group: new THREE.Group(), platforms: [], hazards: [], checkpoints: [], poles: [], level };
  scene.add(c.group);
  const plat = o => new Platform(c, o), sp = o => c.hazards.push(new Spinner(c, o)), pend = o => c.hazards.push(new Pendulum(c, o));
  const Y = 3; let x;

  plat({ x0: -6, x1: 12, y: Y, d: 6 }); addArch(c, 2, Y, 'START'); c.start = new V3(-2, Y, 0); x = 12;
  plat({ x0: x + 1.2, x1: x + 8, y: Y }); x += 8;
  plat({ x0: x + 1.4, x1: x + 7, y: Y, d: 3.4 }); x += 7;
  plat({ x0: x + 2.6, x1: x + 9, y: Y }); x += 9;                                  // first jump
  plat({ x0: x + 2.2, x1: x + 5.2, y: Y, d: 3, move: { axis: [0, 0, 1], amp: 1.6, speed: 1.1 * D, phase: 0 } }); x += 5.2;
  plat({ x0: x + 2.2, x1: x + 5.2, y: Y, d: 3, move: { axis: [1, 0, 0], amp: 0.9, speed: 1.2 * D, phase: 1.5 } }); x += 5.2;
  plat({ x0: x + 2.2, x1: x + 5.2, y: Y + 0.3, d: 3, move: { axis: [0, 1, 0], amp: 0.7, speed: 1.3 * D, phase: 0.5 } }); x += 5.2;
  plat({ x0: x + 2.2, x1: x + 10, y: Y }); x += 10;

  plat({ x0: x + 1.5, x1: x + 18, y: Y, d: 5 });                                  // rotating bars
  sp({ x: x + 6, top: Y, levels: [{ h: 0.45, len: 2.8, n: 2, speed: 1.5 * D * dir(), r: 0.16 }] });
  sp({ x: x + 13, top: Y, levels: [{ h: 0.9, len: 2.8, n: 2, speed: 1.9 * D * dir(), r: 0.18 }] });
  x += 18;
  plat({ x0: x + 2.4, x1: x + 10, y: Y }); addCheckpoint(c, x + 5, Y); x += 10;

  plat({ x0: x + 1.6, x1: x + 20, y: Y, d: 5 });                                  // swinging section
  addGantry(c, x + 2.5, x + 19, Y + 6, 'x');
  for (let i = 0; i < 3; i++) pend({ x: x + 5.5 + i * 5, z: 0, pivotY: Y + 6, len: 5, amp: 0.95, speed: (1.7 + i * 0.15) * D, phase: i * 2.1 + R(), axis: 'z', kind: 'block', R: 0.65 });
  x += 20;

  plat({ x0: x + 1.8, x1: x + 7, y: Y, d: 0.9, style: 'narrow' }); x += 7;       // narrow
  plat({ x0: x + 1.6, x1: x + 6, y: Y, d: 0.9, z: 0.8, style: 'narrow' }); x += 6;
  plat({ x0: x + 1.6, x1: x + 7, y: Y, d: 0.9, z: -0.6, style: 'narrow' }); x += 7;
  plat({ x0: x + 1.8, x1: x + 10, y: Y, rise: 2.5 }); x += 10;                   // ramp
  const Y2 = Y + 2.5;
  plat({ x0: x, x1: x + 8, y: Y2 }); addCheckpoint(c, x + 4, Y2); x += 8;

  plat({ x0: x + 2, x1: x + 5, y: Y2 - 2.2, d: 3, bounce: true }); x += 5;        // bounce section
  plat({ x0: x + 2.5, x1: x + 5.5, y: Y2 - 1.6, d: 3, bounce: true }); x += 5.5;
  plat({ x0: x + 2.5, x1: x + 5.5, y: Y2 - 1.1, d: 3, bounce: true }); x += 5.5;
  const Y3 = Y2 + 1.5;
  plat({ x0: x + 3, x1: x + 12, y: Y3 }); addCheckpoint(c, x + 7, Y3); x += 12;

  plat({ x0: x + 2.2, x1: x + 16, y: Y3, d: 5 });                                 // multiple hazards
  sp({ x: x + 7, top: Y3, levels: [{ h: 0.55, len: 3, n: 4, speed: 1.3 * D * dir(), r: 0.17 }] });
  addGantry(c, x + 13, x + 13, Y3 + 6.5, 'z');
  pend({ x: x + 13, z: 0, pivotY: Y3 + 6.5, len: 5.4, amp: 0.85, speed: 1.6 * D, phase: R() * 6, axis: 'x', kind: 'ball', R: 0.8 });
  x += 16;

  plat({ x0: x + 2.4, x1: x + 7, y: Y3, d: 1.2, style: 'narrow', move: { axis: [0, 0, 1], amp: 1.8, speed: 1.4 * D, phase: 0 } }); x += 7; // hard
  plat({ x0: x + 2.2, x1: x + 14, y: Y3 }); addCheckpoint(c, x + 4, Y3);
  sp({ x: x + 10, top: Y3, levels: [{ h: 0.5, len: 2.4, n: 3, speed: 2.4 * D * dir(), r: 0.16 }] });
  x += 14;
  plat({ x0: x + 1.6, x1: x + 14, y: Y3, d: 1.2, style: 'narrow' });
  addGantry(c, x + 2.5, x + 13.5, Y3 + 6, 'x');
  for (let i = 0; i < 2; i++) pend({ x: x + 5.5 + i * 5, z: 0, pivotY: Y3 + 6, len: 5, amp: 1.0, speed: 2.0 * D, phase: i * 1.6 + R(), axis: 'z', kind: 'block', R: 0.6 });
  x += 14;

  plat({ x0: x + 2.2, x1: x + 16, y: Y3, d: 6 });                                 // final challenge
  sp({ x: x + 8, top: Y3, levels: [{ h: 0.45, len: 3.3, n: 2, speed: 1.7 * D, r: 0.17 }, { h: 1.75, len: 3.3, n: 2, speed: -1.25 * D, r: 0.2, phase: Math.PI / 2 }] });
  x += 16;
  plat({ x0: x, x1: x + 8, y: Y3, rise: -(Y3 - Y), d: 5 }); x += 8;
  plat({ x0: x, x1: x + 18, y: Y, d: 7 }); c.finishX = x + 4; addArch(c, x + 4, Y, 'FINISH', true);
  c.length = x + 18;

  // Instanced support poles into the water
  const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.13, 1, 10), MAT.metal, c.poles.length);
  _q.identity();
  c.poles.forEach(([px, yb, pz], i) => m4set(im, i, _p.set(px, (yb - 1.5) / 2, pz), _s.set(1, yb + 1.5, 1)));
  im.castShadow = im.receiveShadow = true; c.group.add(im);

  world.course = c; return c;
}

export function updateCourse(t, dt) {
  const c = world.course;
  for (const p of c.platforms) p.update(t, dt);
  for (const h of c.hazards) h.update(t, dt);
  for (const cp of c.checkpoints) {
    cp.flag.rotation.y = Math.sin(t * 4 + cp.x) * 0.2;
    if (cp.fx > 0) { cp.fx = Math.max(0, cp.fx - dt * 0.8); cp.ring.scale.setScalar(1 + (1 - cp.fx) * 1.5); cp.ring.material.opacity = cp.fx; }
  }
}

export function setQuality(q) {
  const ultra = q === 'ultra', perf = q === 'perf';
  renderer.setPixelRatio(Math.min(devicePixelRatio, perf ? 1 : ultra ? 2 : 1.5));
  const size = perf ? 1024 : ultra ? 4096 : 2048;
  if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  bloom.enabled = !perf; resize();
}
