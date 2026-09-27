import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const mat = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, ...o });
const makePose = () => ({
  bob: 0, lean: 0, twist: 0, head: 0,
  arms: [{ x: 0, z: 0.12, e: 0.3 }, { x: 0, z: 0.12, e: 0.3 }],
  legs: [{ x: 0, z: 0, k: 0 }, { x: 0, z: 0, k: 0 }],
});

export function createCharacter() {
  const M = {
    skin: mat(0xe3a57c, { roughness: 0.55, sheen: 0.4, sheenColor: 0xffc9a8 }),
    shirt: mat(0xff5a36, { roughness: 0.45, clearcoat: 0.3 }),
    white: mat(0xffffff, { roughness: 0.4 }),
    shorts: mat(0x1d3a94, { roughness: 0.6 }),
    shoe: mat(0x7dff3a, { roughness: 0.3, clearcoat: 0.8 }),
    hair: mat(0x2f1b10, { roughness: 0.65, sheen: 0.6, sheenColor: 0x8a5a3a }),
    band: mat(0xffd21f, { roughness: 0.4 }),
    pupil: mat(0x1a120c, { roughness: 0.05, clearcoat: 1 }),
    mouth: mat(0x8a2a2a, { roughness: 0.6 }),
  };
  const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; return o; };
  const cap = (r, l, m) => mesh(new THREE.CapsuleGeometry(r, l, 6, 14), m);
  const add = (parent, o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); parent.add(o); return o; };

  // Hierarchy: root (feet at y=0) > body (tumble pivot at hips) > hips > spine > neck > head
  const root = new THREE.Group();
  const body = add(root, new THREE.Group(), 0, 0.985, 0);
  const hips = add(body, new THREE.Group());
  add(hips, mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.22, 16), M.shorts), 0, -0.02).scale.z = 0.8;

  const spine = add(hips, new THREE.Group(), 0, 0.08);
  add(spine, cap(0.19, 0.22, M.shirt), 0, 0.22).scale.set(1.12, 1, 0.78);
  const stripe = add(spine, mesh(new THREE.TorusGeometry(0.19, 0.022, 8, 24), M.white), 0, 0.3);
  stripe.rotation.x = Math.PI / 2; stripe.scale.set(1.13, 0.79, 1);

  const neck = add(spine, new THREE.Group(), 0, 0.5);
  add(neck, mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.14, 12), M.skin), 0, 0.04);
  const head = add(neck, new THREE.Group(), 0, 0.17);
  add(head, mesh(new THREE.SphereGeometry(0.15, 28, 20), M.skin)).scale.set(0.95, 1.05, 1);
  add(head, mesh(new THREE.SphereGeometry(0.022, 10, 8), M.skin), 0, -0.01, 0.15); // nose
  const smile = add(head, mesh(new THREE.TorusGeometry(0.04, 0.009, 6, 16, Math.PI), M.mouth), 0, -0.035, 0.132);
  smile.rotation.z = Math.PI;
  for (const s of [-1, 1]) {
    add(head, mesh(new THREE.SphereGeometry(0.035, 10, 8), M.skin), 0.145 * s, 0, 0).scale.set(0.6, 1, 0.8); // ear
    add(head, mesh(new THREE.SphereGeometry(0.03, 12, 10), M.white), 0.055 * s, 0.02, 0.125).scale.z = 0.6;
    add(head, mesh(new THREE.SphereGeometry(0.017, 10, 8), M.pupil), 0.055 * s, 0.02, 0.143);
    add(head, mesh(new THREE.BoxGeometry(0.06, 0.013, 0.015), M.hair), 0.055 * s, 0.072, 0.135).rotation.z = -0.15 * s;
  }
  // Original hairstyle: swept-forward quiff + headband
  const hairCap = add(head, mesh(new THREE.SphereGeometry(0.158, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair), 0, 0.012, -0.01);
  hairCap.rotation.x = -0.25;
  add(head, mesh(new THREE.SphereGeometry(0.15, 16, 12), M.hair), 0, -0.02, -0.05).scale.set(1, 0.9, 0.8);
  for (let i = 0; i < 3; i++) add(head, cap(0.045, 0.1, M.hair), -0.05 + i * 0.05, 0.14, 0.06).rotation.set(1.0, 0, (i - 1) * 0.2);
  const hb = add(head, mesh(new THREE.TorusGeometry(0.153, 0.02, 8, 28), M.band), 0, 0.06, 0);
  hb.rotation.x = Math.PI / 2 - 0.2;

  const arms = [], legs = [];
  for (const s of [1, -1]) {
    const sh = add(spine, new THREE.Group(), 0.25 * s, 0.44, 0);
    add(sh, mesh(new THREE.SphereGeometry(0.085, 14, 10), M.shirt), 0, -0.03).scale.y = 1.1;
    add(sh, cap(0.058, 0.2, M.skin), 0, -0.16);
    const el = add(sh, new THREE.Group(), 0, -0.3);
    add(el, cap(0.05, 0.18, M.skin), 0, -0.13);
    add(el, mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.05, 12), M.band), 0, -0.2);
    add(el, mesh(new THREE.SphereGeometry(0.06, 12, 10), M.skin), 0, -0.28).scale.set(0.85, 1.1, 0.7);
    arms.push({ sh, el, s });

    const hip = add(hips, new THREE.Group(), 0.1 * s, -0.04, 0);
    add(hip, mesh(new THREE.CylinderGeometry(0.1, 0.095, 0.2, 14), M.shorts), 0, -0.08);
    add(hip, cap(0.078, 0.28, M.skin), 0, -0.22);
    const knee = add(hip, new THREE.Group(), 0, -0.43);
    add(knee, cap(0.066, 0.3, M.skin), 0, -0.2);
    add(knee, mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.07, 12), M.white), 0, -0.36);
    const foot = add(knee, new THREE.Group(), 0, -0.42);
    add(foot, mesh(new RoundedBoxGeometry(0.13, 0.09, 0.26, 3, 0.04), M.shoe), 0, -0.03, 0.05);
    add(foot, mesh(new RoundedBoxGeometry(0.14, 0.035, 0.28, 2, 0.015), M.white), 0, -0.075, 0.05);
    legs.push({ hip, knee, foot, s });
  }

  const cur = makePose(), T = makePose();
  const A = (a, x, z, e) => { a.x = x; a.z = z; a.e = e; };
  const L = (l, x, k, z = 0) => { l.x = x; l.k = k; l.z = z; };
  const lerp = THREE.MathUtils.lerp;

  // Target pose per animation state. ph = run phase or climb progress, sp = speed 0..1
  function compute(state, t, ph, sp) {
    T.bob = 0; T.lean = 0; T.twist = 0; T.head = 0;
    const s = Math.sin(ph), c = Math.cos(ph);
    switch (state) {
      case 'run':
        L(T.legs[0], -s * 0.95 * sp, 0.25 + Math.max(0, c) * 1.4 * sp);
        L(T.legs[1], s * 0.95 * sp, 0.25 + Math.max(0, -c) * 1.4 * sp);
        A(T.arms[0], s * 0.9 * sp, 0.12, 1.3); A(T.arms[1], -s * 0.9 * sp, 0.12, 1.3);
        T.lean = 0.28 * sp; T.bob = Math.abs(s) * 0.07 * sp - 0.03; T.twist = s * 0.15 * sp; break;
      case 'jump':
        L(T.legs[0], -0.9, 1.4); L(T.legs[1], 0.25, 0.5);
        A(T.arms[0], -2.4, 0.3, 0.3); A(T.arms[1], 0.6, 0.3, 0.6); T.lean = 0.15; break;
      case 'fall':
        L(T.legs[0], -0.4 + Math.sin(t * 12) * 0.3, 0.6); L(T.legs[1], -0.2 - Math.sin(t * 12) * 0.3, 0.7);
        A(T.arms[0], -2.6 + Math.sin(t * 14) * 0.4, 0.6, 0.3); A(T.arms[1], -2.6 - Math.sin(t * 14) * 0.4, 0.6, 0.3);
        T.lean = -0.1; break;
      case 'land':
        L(T.legs[0], -0.6, 1.1); L(T.legs[1], -0.6, 1.1);
        A(T.arms[0], 0.3, 0.45, 0.8); A(T.arms[1], 0.3, 0.45, 0.8); T.bob = -0.2; T.lean = 0.45; break;
      case 'stumble':
        L(T.legs[0], -s * 0.8, 0.3 + Math.max(0, c) * 1.2); L(T.legs[1], s * 0.8, 0.3 + Math.max(0, -c) * 1.2);
        A(T.arms[0], Math.sin(t * 16) * 1.8, 0.8, 0.4); A(T.arms[1], -Math.sin(t * 16) * 1.8, 0.8, 0.4);
        T.lean = 0.6 + Math.sin(t * 18) * 0.1; break;
      case 'hit':
        L(T.legs[0], -0.6, 0.4); L(T.legs[1], 0.3, 0.8);
        A(T.arms[0], -1.2, 1.0, 0.2); A(T.arms[1], -1.2, 1.0, 0.2); T.lean = -0.5; T.head = -0.3; break;
      case 'ragdoll':
        for (let i = 0; i < 2; i++) {
          A(T.arms[i], Math.sin(t * 9 + i * 2) * 2, 1.2 + Math.sin(t * 7 + i) * 0.5, 0.5 + Math.sin(t * 11 + i) * 0.5);
          L(T.legs[i], Math.sin(t * 8 + i * 2) * 1.1, 0.8 + Math.sin(t * 10 + i) * 0.6, 0.2);
        }
        T.head = Math.sin(t * 6) * 0.4; break;
      case 'bounce':
        L(T.legs[0], 0.1, 0.15, 0.45); L(T.legs[1], 0.1, 0.15, 0.45);
        A(T.arms[0], -0.3, 2.3, 0.1); A(T.arms[1], -0.3, 2.3, 0.1); T.lean = -0.2; break;
      case 'climb': {
        const p = THREE.MathUtils.clamp(ph, 0, 1);
        A(T.arms[0], lerp(-2.9, -0.3, p), 0.3, lerp(0.2, 1.1, p)); A(T.arms[1], lerp(-2.9, -0.3, p), 0.3, lerp(0.2, 1.1, p));
        L(T.legs[0], lerp(-1.4, 0, p), lerp(1.8, 0.3, p)); L(T.legs[1], lerp(-0.2, 0, p), lerp(0.9, 0.2, p));
        T.lean = lerp(0.5, 0.1, p); T.bob = lerp(-0.25, 0, p); break; }
      case 'victory':
        A(T.arms[0], -2.8 + Math.sin(t * 8) * 0.3, 0.5, 0.2); A(T.arms[1], -2.8 - Math.sin(t * 8) * 0.3, 0.5, 0.2);
        L(T.legs[0], -0.1, 0.2 + Math.abs(Math.sin(t * 6)) * 0.3); L(T.legs[1], -0.1, 0.2 + Math.abs(Math.sin(t * 6)) * 0.3);
        T.bob = Math.abs(Math.sin(t * 6)) * 0.12; T.twist = Math.sin(t * 3) * 0.2; T.head = -0.15; break;
      case 'swim':
        A(T.arms[0], -2 + Math.sin(t * 5) * 0.6, 1.0, 0.4); A(T.arms[1], -2 - Math.sin(t * 5) * 0.6, 1.0, 0.4);
        L(T.legs[0], Math.sin(t * 7) * 0.5, 0.4); L(T.legs[1], -Math.sin(t * 7) * 0.5, 0.4); T.head = -0.3; break;
      default: { // idle
        const b = Math.sin(t * 2) * 0.02;
        A(T.arms[0], 0.05, 0.12, 0.25); A(T.arms[1], 0.05, 0.12, 0.25);
        L(T.legs[0], 0, 0.05); L(T.legs[1], 0, 0.05); T.lean = 0.03 + b; T.bob = b * 0.5; }
    }
  }

  function update(state, dt, t, ph = 0, sp = 1) {
    compute(state, t, ph, sp);
    const k = 1 - Math.exp(-dt * (state === 'run' || state === 'ragdoll' ? 22 : 14));
    for (const key of ['bob', 'lean', 'twist', 'head']) cur[key] = lerp(cur[key], T[key], k);
    for (let i = 0; i < 2; i++) {
      for (const f of ['x', 'z', 'e']) cur.arms[i][f] = lerp(cur.arms[i][f], T.arms[i][f], k);
      for (const f of ['x', 'z', 'k']) cur.legs[i][f] = lerp(cur.legs[i][f], T.legs[i][f], k);
    }
    hips.position.y = cur.bob;
    spine.rotation.set(cur.lean, cur.twist, 0);
    neck.rotation.x = cur.head;
    arms.forEach((a, i) => { a.sh.rotation.x = cur.arms[i].x; a.sh.rotation.z = cur.arms[i].z * a.s; a.el.rotation.x = -cur.arms[i].e; });
    legs.forEach((l, i) => {
      l.hip.rotation.x = cur.legs[i].x; l.hip.rotation.z = cur.legs[i].z * l.s;
      l.knee.rotation.x = cur.legs[i].k; l.foot.rotation.x = -(cur.legs[i].x + cur.legs[i].k) * 0.5;
    });
  }

  return { root, body, update };
}
