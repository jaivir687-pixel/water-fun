import * as THREE from 'three';
import { createCharacter } from './character.js';
import { AudioFX } from './audio.js';
import {
  scene, camera, composer, sun, sunDir, world, buildCourse, updateCourse, updateEnv, updateFX,
  drops, confetti, sparks, splash, burst, setQuality, clamp, lerp, damp, PR, PH,
} from './world.js';

const V3 = THREE.Vector3, $ = id => document.getElementById(id);
const sfx = new AudioFX();
const RUN = 6.5, GRAV = 30, JUMP_V = Math.sqrt(2 * GRAV * 1.9), BOUNCE_V = 15.5;
const SIDE = new V3(-2.6, 4.2, 15.5); // ~80° to travel direction, slight downward pitch

const hero = createCharacter(); scene.add(hero.root);
const P = {
  pos: new V3(), vel: new V3(), prevY: 0, grounded: false, ground: null, state: 'idle', st: 0, face: Math.PI / 2,
  coyote: 0, jumpBuf: 0, airTime: 0, takeoff: null, jumped: false, chain: 0, ph: 0, cool: 0, stun: 0, stumble: 0,
  ragdoll: false, climb: null, lastGroundY: 3, inWater: false, spin: new V3(),
};
const game = { state: 'menu', mode: 'play', level: 1, time: 0, best: 0, score: 0, obstacles: 0, cp: null,
  failT: 0, waterT: 0, finT: 0, cdT: 0, cdStep: -1, slow: 0, clock: 0, pausedFrom: null, fx: 0 };
const cam = { pos: new V3(), look: new V3(), trackY: 3, shake: 0 };

// ---------------- INPUT ----------------
const keys = {}, touch = { left: false, right: false, up: false, down: false };
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if ((e.code === 'Space' || e.code === 'KeyJ') && game.state === 'playing') P.jumpBuf = 0.14;
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
});
addEventListener('keyup', e => { keys[e.code] = false; });
document.querySelectorAll('#touch button').forEach(b => {
  const k = b.dataset.k, on = v => e => { e.preventDefault(); if (k === 'jump') { if (v && game.state === 'playing') P.jumpBuf = 0.14; } else touch[k] = v; };
  b.addEventListener('pointerdown', on(true)); b.addEventListener('pointerup', on(false)); b.addEventListener('pointerleave', on(false));
});
const axis = () => [
  (keys.KeyD || keys.ArrowRight || touch.right ? 1 : 0) - (keys.KeyA || keys.ArrowLeft || touch.left ? 1 : 0),
  (keys.KeyS || keys.ArrowDown || touch.down ? 1 : 0) - (keys.KeyW || keys.ArrowUp || touch.up ? 1 : 0),
];
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));

// ---------------- PLAYER ----------------
function setState(s) { if (P.state !== s) { P.state = s; P.st = 0; } }

function placePlayer(pos) {
  Object.assign(P, { grounded: true, ground: null, inWater: false, ragdoll: false, stun: 0, stumble: 0, climb: null,
    chain: 0, airTime: 0, jumped: false, face: Math.PI / 2, lastGroundY: pos.y, cool: 0 });
  P.pos.copy(pos); P.vel.set(0, 0, 0); P.spin.set(0, 0, 0); hero.body.rotation.set(0, 0, 0);
  cam.trackY = pos.y; setState('idle');
}

// Impact levels: LIGHT = push + stumble, MEDIUM = big push + balance loss, HEAVY = launch + ragdoll
function hitPlayer(dx, dz, speed) {
  if (P.cool > 0 || P.inWater || game.state !== 'playing') return;
  const lvl = speed < 3.2 ? 0 : speed < 6.2 ? 1 : 2, n = Math.hypot(dx, dz) || 1;
  dx /= n; dz /= n; P.cool = 0.45; P.grounded = false; P.jumped = false;
  if (lvl === 0) { P.vel.x += dx * 3.5; P.vel.z += dz * 3.5; P.vel.y = Math.max(P.vel.y, 2.5); P.stumble = 0.6; setState('stumble'); }
  else if (lvl === 1) { P.vel.set(dx * 7, 5, dz * 7); P.stun = 0.8; setState('hit'); }
  else { P.vel.set(dx * 10.5, 8, dz * 10.5); P.ragdoll = true; P.stun = 9; P.spin.set((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 14); setState('ragdoll'); }
  sfx.hit(lvl); cam.shake = 0.3 + lvl * 0.35;
  burst(sparks, P.pos.clone().setY(P.pos.y + 1.1), 16, 0xffe066, 6);
}

function tryClimb(p, side) {
  const dy = p.top - P.pos.y;
  if (P.ragdoll || P.stun > 0 || game.state !== 'playing' || dy < 0.25 || dy > 1.35 || P.vel.y > 5) return false;
  const tx = side > 0 ? p.x0 + 0.45 : p.x1 - 0.45;
  P.climb = { from: P.pos.clone(), to: new V3(tx, p.top, clamp(P.pos.z, p.cz - p.hd + 0.3, p.cz + p.hd - 0.3)), t: 0, plat: p };
  P.vel.set(0, 0, 0); setState('climb'); return true;
}
function climbUpdate(dt) {
  const c = P.climb; c.t = Math.min(1, c.t + dt / 0.5);
  const ky = Math.min(1, c.t / 0.7), kx = Math.max(0, (c.t - 0.5) / 0.5);
  P.pos.set(lerp(c.from.x, c.to.x, kx), lerp(c.from.y, c.to.y, ky * ky * (3 - 2 * ky)), lerp(c.from.z, c.to.z, kx));
  if (c.t >= 1) { P.climb = null; P.grounded = true; P.ground = c.plat; P.lastGroundY = P.pos.y; setState('idle'); }
}

function onLand(p) {
  if (p.bounce) {
    P.vel.y = BOUNCE_V; p.squash = 1; P.chain++; P.jumped = false; P.airTime = 0; setState('bounce'); sfx.bounce();
    burst(sparks, P.pos, 24, 0xff7ad9, 6);
    const pts = 20 * P.chain; addScore(pts, `+${pts} BOUNCE x${P.chain}`);
    return true;
  }
  P.chain = 0;
  if (P.airTime > 0.3) {
    sfx.land(); burst(drops, P.pos, 10, 0xffffff, 3, { g: 4, size: 0.05 });
    if (P.jumped && P.takeoff && P.takeoff !== p) addScore(50, '+50 JUMP');
  }
  if (P.ragdoll) { P.ragdoll = false; P.stun = 0.55; P.spin.set(0, 0, 0); setState('land'); }
  else if (P.airTime > 0.35 && P.state !== 'hit' && P.state !== 'stumble') setState('land');
  P.jumped = false; P.airTime = 0; return false;
}

// Capsule approximated as AABB vs platform boxes; ramps use a height function
function collideWorld() {
  const was = P.grounded, r = PR * 0.6; let landed = null; P.grounded = false;
  for (const p of world.course.platforms) {
    if (p.rise) {
      if (P.pos.x < p.x0 || P.pos.x > p.x1 || Math.abs(P.pos.z - p.cz) > p.hd + 0.1) continue;
      const top = p.topAt(P.pos.x);
      if (P.vel.y <= 0.01 && P.pos.y <= top + (was ? 0.35 : 0.02) && P.prevY >= top - 0.45) { P.pos.y = top; landed = p; }
      continue;
    }
    const minX = p.x0, maxX = p.x1, minZ = p.cz - p.hd, maxZ = p.cz + p.hd, minY = p.top - p.h, maxY = p.top;
    if (P.pos.x + r <= minX || P.pos.x - r >= maxX || P.pos.z + r <= minZ || P.pos.z - r >= maxZ) continue;
    const py0 = P.pos.y, py1 = P.pos.y + PH;
    if (P.vel.y <= 0.01 && py0 >= maxY - 0.001 && py0 <= maxY + (was ? 0.12 : 0.001)) { P.pos.y = maxY; landed = p; continue; }
    if (py1 <= minY || py0 >= maxY) continue;
    if (P.vel.y <= 0.01 && (P.prevY >= maxY - 0.05 - Math.max(0, p.delta.y) || maxY - py0 < 0.25)) { P.pos.y = maxY; landed = p; continue; }
    const left = P.pos.x + r - minX, right = maxX - (P.pos.x - r), back = P.pos.z + r - minZ, front = maxZ - (P.pos.z - r), down = py1 - minY;
    const m = Math.min(left, right, back, front, down);
    if (m === down) { P.pos.y -= down; if (P.vel.y > 0) P.vel.y = 0; }
    else if (m === left) { P.pos.x -= left; if (tryClimb(p, 1)) return; if (P.vel.x > 0) P.vel.x = 0; }
    else if (m === right) { P.pos.x += right; if (tryClimb(p, -1)) return; if (P.vel.x < 0) P.vel.x = 0; }
    else if (m === back) { P.pos.z -= back; if (P.vel.z > 0) P.vel.z = 0; }
    else { P.pos.z += front; if (P.vel.z < 0) P.vel.z = 0; }
  }
  if (landed && !(!was && onLand(landed))) {
    P.vel.y = 0; P.grounded = true; P.ground = landed; P.coyote = 0.1; P.lastGroundY = P.pos.y;
  }
}

function updatePlayer(dt) {
  P.st += dt; P.cool -= dt; P.jumpBuf -= dt; P.coyote -= dt; P.stun -= dt; P.stumble -= dt;
  if (P.inWater) { // keep momentum, sink under the surface
    P.vel.multiplyScalar(Math.exp(-3 * dt)); P.pos.x += P.vel.x * dt; P.pos.z += P.vel.z * dt;
    P.pos.y = damp(P.pos.y, -1.4, 2.5, dt); return;
  }
  if (P.climb) return climbUpdate(dt);
  const live = game.state === 'playing';
  const ctrl = !live || P.ragdoll || P.stun > 0 ? 0 : P.stumble > 0 ? 0.35 : 1;
  if (ctrl) {
    const [ix, iz] = axis(), a = (P.grounded ? 42 : 26) * ctrl, dec = P.grounded ? 34 : 10;
    P.vel.x = approach(P.vel.x, ix * RUN, (ix ? a : dec) * dt);
    P.vel.z = approach(P.vel.z, iz * RUN * 0.8, (iz ? a : dec) * dt);
  } else if (P.grounded) { P.vel.x = approach(P.vel.x, 0, 12 * dt); P.vel.z = approach(P.vel.z, 0, 12 * dt); }

  if (ctrl >= 1 && P.jumpBuf > 0 && (P.grounded || P.coyote > 0)) {
    P.vel.y = JUMP_V; P.grounded = false; P.coyote = 0; P.jumpBuf = 0;
    P.takeoff = P.ground; P.jumped = true; P.airTime = 0; setState('jump'); sfx.jump();
  }
  if (!P.grounded) P.airTime += dt;
  P.vel.y = Math.max(P.vel.y - GRAV * dt, -30);
  P.prevY = P.pos.y; P.pos.addScaledVector(P.vel, dt);
  collideWorld();
  if (live && !P.climb) for (const h of world.course.hazards) h.collide(P, hitPlayer);
}

function animState() {
  if (P.inWater) return setState('swim');
  if (P.climb) return setState('climb');
  if (game.state === 'finishing' || game.state === 'results') return setState('victory');
  if (P.ragdoll) return setState('ragdoll');
  if (P.state === 'hit' && P.st < 0.4) return;
  if (!P.grounded) {
    if ((P.state === 'bounce' || P.state === 'jump') && P.vel.y > 0) return;
    if (P.state !== 'hit' && (P.airTime > 0.12 || P.vel.y < -2)) setState('fall');
    return;
  }
  if (P.stumble > 0) return setState('stumble');
  if (P.state === 'land' && P.st < 0.16) return;
  setState(Math.hypot(P.vel.x, P.vel.z) > 0.6 ? 'run' : 'idle');
}

function updateHero(dt) {
  const sp = Math.hypot(P.vel.x, P.vel.z);
  if (P.state === 'run' || P.state === 'stumble') {
    const prev = Math.sin(P.ph); P.ph += dt * (4 + sp * 1.5);
    if (P.grounded && Math.sign(Math.sin(P.ph)) !== Math.sign(prev)) sfx.step();
  }
  let tf = P.face;
  if (game.state === 'finishing' || game.state === 'results') tf = 0.5; // face the cinematic camera
  else if (sp > 0.5 && !P.ragdoll && P.stun <= 0) tf = Math.atan2(P.vel.x, P.vel.z);
  const d = Math.atan2(Math.sin(tf - P.face), Math.cos(tf - P.face));
  P.face += d * (1 - Math.exp(-12 * dt));
  hero.root.position.copy(P.pos); hero.root.rotation.y = P.face;
  const b = hero.body.rotation;
  if (P.ragdoll) { b.x += P.spin.x * dt; b.z += P.spin.z * dt; }
  else {
    b.x = damp(Math.atan2(Math.sin(b.x), Math.cos(b.x)), 0, 8, dt);
    b.z = damp(Math.atan2(Math.sin(b.z), Math.cos(b.z)), 0, 8, dt);
  }
  hero.update(P.state, dt, game.clock, P.climb ? P.climb.t : P.ph, clamp(sp / RUN, 0.3, 1));
}

// ---------------- GAME FLOW ----------------
function platformBelow() {
  return world.course.platforms.some(p => P.pos.x > p.x0 - 0.3 && P.pos.x < p.x1 + 0.3 &&
    Math.abs(P.pos.z - p.cz) < p.hd + 0.3 && p.topAt(P.pos.x) < P.pos.y + 0.1);
}
function enterWater() {
  P.inWater = true; P.ragdoll = false; game.waterT = 0; game.slow = 0.7;
  splash(P.pos.x, P.pos.z, clamp(-P.vel.y / 12, 0.7, 1.6)); sfx.splash(); cam.shake = 0.4;
  P.vel.multiplyScalar(0.25); setState('swim');
  if (game.state === 'playing') { game.state = 'failing'; game.failT = 0; }
}
function activateCP(cp) {
  cp.active = true; game.cp = cp; cp.fx = 1; cp.flagM.color.set(0x22d36a); cp.flagM.emissive.set(0x0b5a2a);
  sfx.checkpoint(); notify('CHECKPOINT', 'cp'); addScore(100, '+100 CHECKPOINT');
  burst(sparks, cp.pos.clone().setY(cp.pos.y + 1.5), 40, 0x6bff9a, 7);
}
function confettiBurst() {
  const cols = [0xff3b5c, 0xffd21a, 0x3aa0ff, 0x22d36a, 0xff8a1a, 0xb14dff], c = world.course;
  for (const s of [-1, 1]) for (let i = 0; i < 90; i++)
    confetti.spawn(new V3(c.finishX, c.start.y + 6, s * 3.3),
      new V3((Math.random() - 0.5) * 7, 4 + Math.random() * 7, -s * Math.random() * 4 + (Math.random() - 0.5) * 3),
      { life: 4, size: 0.14, g: 4, drag: 1.6, color: cols[i % 6], spin: 8 });
}
function finish() {
  game.state = 'finishing'; game.finT = 0; P.stumble = 0; P.stun = 0;
  addScore(500, '+500 FINISH', true);
  const bonus = Math.max(0, Math.round((90 - game.time) * 15)); if (bonus) addScore(bonus, `+${bonus} FAST`, true);
  sfx.finish(); sfx.victory(); confettiBurst();
  const key = `waterfun_best_${game.mode}_${game.level}`, best = parseFloat(localStorage.getItem(key));
  game.best = isNaN(best) || game.time < best ? game.time : best; localStorage.setItem(key, game.best);
}

function gameLogic(rdt) {
  const c = world.course;
  if (game.state === 'playing') {
    game.time += rdt;
    for (const h of c.hazards) if (!h.cleared && P.grounded && P.pos.x > h.clearX) { h.cleared = true; game.obstacles++; addScore(25, '+25 OBSTACLE'); }
    for (const cp of c.checkpoints) if (!cp.active && P.grounded && P.pos.x > cp.x && Math.abs(P.pos.y - cp.pos.y) < 1) activateCP(cp);
    if (P.pos.x > c.finishX && P.pos.y > c.start.y - 0.5) return finish();
    if (!P.grounded && !P.climb && P.pos.y < P.lastGroundY - 1.2 && !platformBelow()) { game.state = 'failing'; game.failT = 0; }
  }
  if (!P.inWater && P.pos.y < 0) enterWater();
  if (game.state === 'failing') {
    game.failT += rdt;
    if (!P.inWater && P.grounded) game.state = 'playing'; // saved by a lower platform
    if (P.inWater && (game.waterT += rdt) > 1.8) {
      if (game.mode === 'free') respawn();
      else { game.state = 'failed'; show('failScreen'); sfx.fail(); }
    }
  }
  if (game.state === 'finishing') {
    game.finT += rdt;
    if (game.finT > 0.7 && game.fx === 0) { game.fx = 1; confettiBurst(); }
    if (game.finT > 2.4) {
      game.state = 'results'; game.fx = 0;
      $('rTime').textContent = fmt(game.time); $('rBest').textContent = fmt(game.best);
      $('rScore').textContent = game.score; $('rObs').textContent = `${game.obstacles} / ${c.hazards.length}`;
      show('results');
    }
  }
}

let cdTimer = 0;
function countdown(rdt) {
  game.cdT += rdt; const step = Math.floor(game.cdT / 0.8), el = $('countdown');
  if (step === game.cdStep) return; game.cdStep = step;
  if (step < 3) { el.textContent = 3 - step; el.className = ''; sfx.beep(); }
  else { el.textContent = 'GO!'; el.className = 'go'; sfx.go(); game.state = 'playing'; P.jumpBuf = 0; cdTimer = setTimeout(() => { el.textContent = ''; }, 700); }
}

function startRun(mode, level = game.level) {
  sfx.init(); sfx.resume();
  game.mode = mode;
  if (!world.course || world.course.level !== level) buildCourse(level);
  game.level = level;
  Object.assign(game, { score: 0, time: 0, obstacles: 0, cp: null, cdT: 0, cdStep: -1, slow: 0, fx: 0, state: 'countdown' });
  world.course.hazards.forEach(h => { h.cleared = false; });
  world.course.checkpoints.forEach(cp => { cp.active = false; cp.flagM.color.set(0x9aa3b0); cp.flagM.emissive.set(0); });
  clearTimeout(cdTimer); $('countdown').textContent = ''; $('notify').innerHTML = '';
  $('cpBtn').classList.toggle('hidden', mode === 'trial');
  placePlayer(world.course.start); snapCamera(); show(null);
}
function respawn() {
  if (!game.cp || game.mode === 'trial') return startRun(game.mode, game.level);
  placePlayer(game.cp.pos.clone().add(new V3(0.6, 0, 0)));
  game.state = 'playing'; game.slow = 0; snapCamera(); show(null);
}
function toMenu() {
  game.state = 'menu'; clearTimeout(cdTimer); $('countdown').textContent = '';
  placePlayer(world.course.start); show('mainMenu'); sfx.resume();
}
function togglePause(force) {
  if (game.state === 'paused') { if (force !== true) { game.state = game.pausedFrom; show(null); sfx.resume(); } return; }
  if (['playing', 'countdown', 'failing'].includes(game.state) && force !== false) {
    game.pausedFrom = game.state; game.state = 'paused'; show('pauseMenu'); sfx.suspend();
  }
}

// ---------------- UI ----------------
const pad = n => String(n).padStart(2, '0');
const fmt = t => `${pad(Math.floor(t / 60))}:${pad(Math.floor(t % 60))}:${pad(Math.floor((t * 100) % 100))}`;
function notify(text, cls = '') {
  const d = document.createElement('div'); d.className = 'note ' + cls; d.textContent = text;
  $('notify').appendChild(d); setTimeout(() => d.remove(), 1400);
}
function addScore(v, label, force) { if (game.state !== 'playing' && !force) return; game.score += v; if (label) notify(label); }
const SCREENS = ['mainMenu', 'pauseMenu', 'failScreen', 'results', 'settings'];
function show(id) {
  SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id));
  const inRun = ['countdown', 'playing', 'failing', 'paused'].includes(game.state);
  $('hud').classList.toggle('hidden', !inRun);
  $('touch').classList.toggle('hidden', !(inRun && 'ontouchstart' in window));
}
function act(a) {
  switch (a) {
    case 'play': return startRun('play', 1);
    case 'trial': return startRun('trial', 1);
    case 'free': return startRun('free', 1);
    case 'settings': return show('settings');
    case 'back': return show('mainMenu');
    case 'resume': return togglePause(false);
    case 'restart': return startRun(game.mode, game.level);
    case 'checkpoint': return respawn();
    case 'menu': return toMenu();
    case 'next': return startRun(game.mode, game.level + 1);
  }
}
document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
  sfx.init(); sfx.resume(); sfx.click(); act(b.dataset.act);
}));
$('pauseBtn').addEventListener('click', () => { sfx.click(); togglePause(); });
$('vol').addEventListener('input', e => sfx.setVolume(+e.target.value));
$('quality').addEventListener('change', e => setQuality(e.target.value));
$('fps').addEventListener('change', e => $('fpsMeter').classList.toggle('hidden', !e.target.checked));
world.onWhoosh = b => { if (game.state !== 'playing') return; const d = b.distanceTo(P.pos); if (d < 14) sfx.whoosh(1 - d / 14); };

// ---------------- CAMERA ----------------
const tp = new V3(), tl = new V3();
function updateCamera(dt) {
  const s = game.state, p = P.pos; let k = 5, ky = 2.5;
  if (s === 'menu') { // slow cinematic pan across the arena
    const c = world.course, mx = 8 + (Math.sin(game.clock * 0.05) * 0.5 + 0.5) * (c.length - 30);
    tl.set(mx, 4, 0); tp.set(mx - 6, 8, 22); k = ky = 1.2;
  } else if (s === 'failing' || s === 'failed') { // EPIC FAIL: zoom in, front 3/4, drop to water level
    const f = clamp(game.failT / 1.2, 0, 1), wy = Math.max(p.y, -0.4);
    tl.set(p.x, wy + 0.5, p.z); tp.set(p.x + 3.8, lerp(wy + 2.8, 0.9, f), p.z + 6.5 - f * 1.2); k = ky = 2.8;
  } else if (s === 'finishing' || s === 'results') { // celebration close-up, player right of results panel
    tl.set(p.x - 0.8, p.y + 1.1, p.z); tp.set(p.x + 2.6, p.y + 1.7, p.z + 5.2); k = ky = 2.5;
  } else { // NORMAL: 2.5D side-scrolling, limited vertical follow
    const gy = P.grounded ? p.y : lerp(P.lastGroundY, p.y, 0.35);
    cam.trackY = damp(cam.trackY, gy, 2.2, dt);
    tl.set(p.x + 3.6, cam.trackY + 0.9, p.z * 0.25); tp.copy(tl).add(SIDE);
    if (P.ragdoll) k = 2.5;
  }
  cam.pos.set(damp(cam.pos.x, tp.x, k, dt), damp(cam.pos.y, tp.y, ky, dt), damp(cam.pos.z, tp.z, k, dt));
  cam.look.set(damp(cam.look.x, tl.x, k * 1.2, dt), damp(cam.look.y, tl.y, ky * 1.2, dt), damp(cam.look.z, tl.z, k * 1.2, dt));
  cam.shake = Math.max(0, cam.shake - dt * 2.5);
  const sh = cam.shake * 0.15;
  camera.position.copy(cam.pos).add(tp.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0));
  camera.lookAt(cam.look);
  sun.target.position.set(cam.look.x + 4, 0, 0);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, 90);
}
function snapCamera() { updateCamera(10); }

// ---------------- MAIN LOOP ----------------
let last = performance.now(), fpsT = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.05, (now - last) / 1000); last = now;
  fpsT += rdt; fpsN++; if (fpsT > 0.5) { $('fpsMeter').textContent = `${Math.round(fpsN / fpsT)} FPS`; fpsT = 0; fpsN = 0; }

  if (game.state !== 'paused') {
    game.slow = Math.max(0, game.slow - rdt);
    const dt = rdt * (game.slow > 0 ? 0.3 : 1); // brief slow motion on splash
    game.clock += dt;
    updateCourse(game.clock, dt);
    if (P.grounded && P.ground?.move) P.pos.add(P.ground.delta); // ride moving platforms
    if (game.state === 'countdown') countdown(rdt);
    const steps = Math.max(1, Math.ceil(dt * 120));
    for (let i = 0; i < steps; i++) updatePlayer(dt / steps);
    gameLogic(rdt);
    animState(); updateHero(dt);
    updateEnv(dt, game.clock); updateFX(dt);
    updateCamera(rdt);
    $('time').textContent = 'TIME ' + fmt(game.time);
    $('score').textContent = 'SCORE ' + game.score;
  }
  composer.render();
}

// ---------------- BOOT ----------------
buildCourse(1);
$('quality').value = 'high'; setQuality('high');
placePlayer(world.course.start); snapCamera();
$('loading').remove(); show('mainMenu');
requestAnimationFrame(frame);
