import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { RT, detail, hqBody, heightGrid, hqRock, hqTree, leafMaterial, grass, hqTorch, hqWaterfallMat, spray, makeFlag } from './realism.js';

// Low-poly floating islands (style reference: faceted orange grass slab, dark rock underside studded with stones,
// a turquoise pond spilling into a waterfall, round red trees, sometimes a grey peak) carrying a notice board
// with the project image and two torches. Flat-shaded, a few thousand triangles each, so phones stay fast.

// ---- small 3D value noise for sculpting ----
const hash = (x, y, z) => { let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
function vnoise(x, y, z){
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
           l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
}
const fbm = (x, y, z, o = 5) => { let a = .5, s = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x, y, z); x = x * 2.03 + 1.7; y = y * 2.03 + 1.7; z = z * 2.03 + 1.7; a *= .5; } return s; };
function rnd(seed){ let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

let flameFrames = null, glowTex = null, woodTex = null;
const tl = new THREE.TextureLoader();
function frames(){
  if (!flameFrames) flameFrames = Array.from({ length: 24 }, (_, i) => { const t = tl.load(`media/flame/f${String(i + 1).padStart(2, '0')}.webp`); t.colorSpace = THREE.SRGBColorSpace; return t; });
  return flameFrames;
}
function glow(){
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,180,90,1)'); g.addColorStop(.3, 'rgba(255,110,30,.45)'); g.addColorStop(1, 'rgba(255,80,20,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace; return glowTex;
}
function wood(hq){
  if (woodTex) return woodTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const x = c.getContext('2d');
  if (hq) { c.width = 512; c.height = 1024; x.scale(2, 2); }
  x.fillStyle = '#3a2416'; x.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 140; i++) { const y = Math.random() * 512, a = Math.random() * .25; x.strokeStyle = Math.random() < .5 ? `rgba(20,10,6,${a})` : `rgba(120,80,50,${a * .6})`; x.lineWidth = 1 + Math.random() * 3; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(80, y + (Math.random() - .5) * 20, 170, y + (Math.random() - .5) * 20, 256, y + (Math.random() - .5) * 10); x.stroke(); }
  for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(10,5,3,.5)'; x.fillRect(0, i * 128 + 126, 256, 3); }
  if (hq) { for (let i = 0; i < 260; i++) { const y = Math.random() * 512; x.strokeStyle = `rgba(${Math.random() < .5 ? '15,8,4' : '140,95,60'},${Math.random() * .18})`; x.lineWidth = .5; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(90, y + (Math.random() - .5) * 8, 170, y + (Math.random() - .5) * 8, 256, y); x.stroke(); }
    for (let i = 0; i < 6; i++) { const kx = Math.random() * 256, ky = Math.random() * 512, g = x.createRadialGradient(kx, ky, 0, kx, ky, 9); g.addColorStop(0, 'rgba(15,7,3,.85)'); g.addColorStop(.5, 'rgba(60,30,15,.5)'); g.addColorStop(1, 'rgba(60,30,15,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(kx, ky, 6, 11, 0, 0, 7); x.fill(); } }
  woodTex = new THREE.CanvasTexture(c); woodTex.colorSpace = THREE.SRGBColorSpace; woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; return woodTex;
}
function soonTexture(title){
  const c = document.createElement('canvas'); c.width = 1024; c.height = 576; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 1024, 576); g.addColorStop(0, '#140b22'); g.addColorStop(.55, '#33122c'); g.addColorStop(1, '#5a200c');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 576);
  for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(255,${150 + Math.random() * 80 | 0},90,${Math.random() * .5})`; x.beginPath(); x.arc(Math.random() * 1024, Math.random() * 576, Math.random() * 2.2, 0, 7); x.fill(); }
  x.strokeStyle = 'rgba(255,200,150,.25)'; x.lineWidth = 2; x.strokeRect(40, 40, 944, 496);
  x.fillStyle = 'rgba(255,214,170,.92)'; x.textAlign = 'center'; x.font = '600 66px Outfit, "Avant Garde", sans-serif'; x.fillText(title, 512, 300);
  x.fillStyle = 'rgba(255,190,140,.55)'; x.font = '400 24px Jost, Futura, sans-serif'; x.fillText('AN EXPERIMENT IS BEING CHARTED', 512, 352);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// rim light + cosmic tint for every island material
const shared = { uRim: { value: new THREE.Color(1.0, 0.55, 0.3) }, uMix: { value: 0 } };
function rimmed(mat, strength = 1){
  mat.envMapIntensity = 0.22;
  mat.onBeforeCompile = s => {
    Object.assign(s.uniforms, shared); s.uniforms.uRimK = { value: strength };
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform float uRimK, uMix;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += uRim * fr * 0.4 * uRimK;`);
  };
  return mat;
}


// ---- low-poly building blocks (non-indexed triangles, per-face colours, flat normals) ----
function faceted(pos, cols){
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals(); return g;
}
const C = (hex, R, j = 0.06) => { const c = new THREE.Color(hex); const k = 1 + (R() - 0.5) * 2 * j; return [c.r * k, c.g * k, c.b * k]; };
function tri(pos, cols, a, b, c, col){ pos.push(...a, ...b, ...c); cols.push(...col, ...col, ...col); }

const PAL = {
  sea:    { top: [0xd8662a, 0xe2783a, 0xc95a24], side: 0xb04a1e, soil: [0x5a3a2c, 0x4c3127, 0x63402f], deep: 0x2a1d1a, stone: [0x6d6a6c, 0x5c595c, 0x7c787a], peak: [0xb8b6b8, 0xa5a3a7, 0xcfcdcf, 0x929095], water: 0x3fd6b5, leaf: [0xc4485a, 0xb23c4e, 0xd25a68], trunk: 0x5a3b2a },
  cosmic: { top: [0x7d4fd6, 0x8c5fe0, 0x6a42c4], side: 0x5a36a6, soil: [0x2f2548, 0x281f3f, 0x372b54], deep: 0x16112a, stone: [0x4a4766, 0x3f3c58, 0x56527a], peak: [0x8d8aa8, 0x7c7898, 0xa29fbe, 0x6e6a8c], water: 0x5fe0ff, leaf: [0x3fc6ff, 0x5a8cff, 0x8a6cff], trunk: 0x2b2140 },
  // per-project islands: each one wears its project's look
  ummy:   { top: [0xffb3c7, 0xf7c6e0, 0xc9b6ff], side: 0xff9fbf, soil: [0xd9b8f0, 0xc8a6e6, 0xe6c6f5], deep: 0x8f6fbf, stone: [0xffffff, 0xf1e8f5, 0xe4daee], peak: [0xfff0f6, 0xf6e2f0, 0xe9dcf5, 0xffffff], water: 0x8fd8ff, leaf: [0xb4f2c4, 0x9fd2ff, 0xffb3c7], trunk: 0xf3e6ef,
            wood: 0xffd9e6, torch: 'orb', orb: [1.6, 0.9, 1.3], gummies: [[0xffb21e, 'stand'], [0xff5c5c, 'wave'], [0x7d80ff, 'sit'], [0x45c46e, 'shy']], backTrees: true },
  gulag:  { top: [0x1d1b1c, 0x262324, 0x161415], side: 0xa50f18, soil: [0x2a2526, 0x231f20, 0x302a2b], deep: 0x0c0a0a, stone: [0x3a3637, 0x2f2c2d, 0x4a4546], peak: [0x403b3c, 0x353132, 0x4d4748, 0x2c2829], water: null, leaf: [0x8a0b12, 0x6e0910, 0xa50f18], trunk: 0x1a1616,
            wood: 0x5a4444, ring: true, noTrees: true }
};

// Ummy: the project's jelly characters - round head flowing into the body, two white eyes, stubby arms and legs, glossy jelly
const POSES = {
  stand: { head: [0, 1.45, 0], body: [[0, 0.98, 0, 0.44], [0, 0.62, 0, 0.42]], arms: [[[-0.34, 1.02, 0], [-0.74, 0.78, 0.05]], [[0.34, 1.02, 0], [0.74, 0.78, 0.05]]], legs: [[[-0.2, 0.45, 0], [-0.21, 0.12, 0.02]], [[0.2, 0.45, 0], [0.21, 0.12, 0.02]]] },
  wave:  { head: [0, 1.45, 0], body: [[0, 0.98, 0, 0.44], [0, 0.62, 0, 0.42]], arms: [[[-0.34, 1.02, 0], [-0.7, 0.76, 0.08]], [[0.34, 1.05, 0], [0.66, 1.42, 0.1]]], legs: [[[-0.2, 0.45, 0], [-0.26, 0.12, 0.08]], [[0.2, 0.45, 0], [0.22, 0.12, -0.06]]] },
  sit:   { head: [0, 1.08, 0], body: [[0, 0.64, 0, 0.46], [0, 0.38, 0, 0.44]], arms: [[[-0.4, 0.68, 0], [-0.86, 0.6, 0.12]], [[0.4, 0.68, 0], [0.86, 0.6, 0.12]]], legs: [[[-0.26, 0.24, 0.12], [-0.34, 0.2, 0.55]], [[0.26, 0.24, 0.12], [0.34, 0.2, 0.55]]], feet: 0.24 },
  shy:   { head: [0, 1.45, 0], body: [[0, 0.98, 0, 0.44], [0, 0.62, 0, 0.42]], arms: [[[-0.34, 1.0, 0.05], [-0.36, 1.12, 0.38], [-0.12, 1.24, 0.5]], [[0.34, 1.0, 0.05], [0.34, 1.08, 0.36], [0.12, 1.2, 0.5]]], legs: [[[-0.2, 0.45, 0], [-0.22, 0.12, 0.06]], [[0.2, 0.45, 0], [0.24, 0.12, -0.04]]] },
};
const gummyGeo = {};
function jellyGeometry(pose){
  if (gummyGeo[pose]) return gummyGeo[pose];
  const P = POSES[pose], S = 2.4, RES = 56, SUB = 110, mc = new MarchingCubes(RES, new THREE.MeshBasicMaterial(), false, false, 60000);
  mc.isolation = 80; mc.reset();
  const ball = (x, y, z, r) => mc.addBall(x / S + 0.5, y / S + 0.04, z / S + 0.5, (80 + SUB) * (r / S) * (r / S), SUB);
  ball(...P.head, 0.5);
  for (const [x, y, z, r] of P.body) ball(x, y, z, r);
  const chain = (pts, r0, r1) => { for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; for (let k = 0; k <= 4; k++) { const t = k / 4, u = (i + t) / (pts.length - 1); ball(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, r0 + (r1 - r0) * u); } } };
  for (const a of P.arms) chain(a, 0.15, 0.13);
  for (const l of P.legs) chain(l, 0.2, P.feet || 0.18);
  mc.update();
  const n = mc.count, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), sp = mc.positionArray, sn = mc.normalArray;
  for (let i = 0; i < n; i++) { pos[i * 3] = sp[i * 3] * S / 2; pos[i * 3 + 1] = (sp[i * 3 + 1] + 1) / 2 * S - 0.04 * S; pos[i * 3 + 2] = sp[i * 3 + 2] * S / 2; nor[i * 3] = sn[i * 3]; nor[i * 3 + 1] = sn[i * 3 + 1]; nor[i * 3 + 2] = sn[i * 3 + 2]; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const eyeAt = ex => { let best = -9; for (let i = 0; i < n; i++) if (Math.abs(pos[i * 3] - ex) < 0.06 && Math.abs(pos[i * 3 + 1] - (P.head[1] + 0.07)) < 0.06) best = Math.max(best, pos[i * 3 + 2]); return best > -9 ? best : 0.48; };
  return (gummyGeo[pose] = { g, eyes: [-0.17, 0.17].map(ex => [ex, P.head[1] + 0.07, eyeAt(ex)]) });
}
const eyeGeo = new THREE.SphereGeometry(1, 16, 12), eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, emissive: 0xffffff, emissiveIntensity: 0.25 });
function gummy(col, pose, hq){
  const { g, eyes } = jellyGeometry(pose), c = new THREE.Color(col);
  const m = hq ? new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, transparent: true, opacity: 0.9, emissive: c, emissiveIntensity: 0.32, envMapIntensity: 1.3, sheen: 0.5, sheenColor: c.clone().lerp(new THREE.Color(1, 1, 1), 0.5) })
               : new THREE.MeshStandardMaterial({ color: c, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.9, emissive: c, emissiveIntensity: 0.3 });
  const grp = new THREE.Group(), body = new THREE.Mesh(g, m); grp.add(body);
  for (const [x, y, z] of eyes) { const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(x, y, z - 0.03); e.scale.set(0.085, 0.1, 0.05); grp.add(e); }
  grp.userData.body = body; return grp;
}
// The Gulag Fight: a fight-night ring in front of the board, red corner pads, ropes, a heavy bag
function fightRing(group, R, top, side, shadows){
  const red = new THREE.MeshStandardMaterial({ color: 0xa50f18, roughness: 0.55, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141213, roughness: 0.7, flatShading: true });
  const rope = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.6 });
  const add = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = shadows; group.add(o); return o; };
  add(new THREE.BoxGeometry(10.2, 0.14, 4.4), dark, 0, top + 0.26, 2.4);                       // canvas
  add(new THREE.BoxGeometry(10.4, 0.1, 0.22), red, 0, top + 0.36, 4.5);                         // red apron edge
  const corners = [[-4.9, 4.3], [4.9, 4.3], [-5.2, 0.8], [5.2, 0.8]];                            // back corners sit on the torch posts
  for (const [x, z] of corners.slice(0, 2)) { add(new THREE.BoxGeometry(0.22, 1.7, 0.22), dark, x, top + 1.1, z); add(new THREE.BoxGeometry(0.42, 1.25, 0.42), red, x, top + 1.15, z); }
  const seg = (a, b, y) => { const ax = a[0], az = a[1], bx = b[0], bz = b[1], len = Math.hypot(bx - ax, bz - az);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 5), rope); c.position.set((ax + bx) / 2, top + y, (az + bz) / 2);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx - ax, 0, bz - az).normalize()); group.add(c); };
  for (const y of [0.5, 0.9, 1.3]) { seg(corners[0], corners[1], y); seg(corners[0], corners[2], y); seg(corners[1], corners[3], y); }
  // heavy bag on a post, off to one side behind the ring
  const bx = side * 5.4, bz = -2.2;
  add(new THREE.BoxGeometry(0.28, 5.4, 0.28), dark, bx, top + 2.7, bz);
  add(new THREE.BoxGeometry(1.7, 0.22, 0.22), dark, bx - side * 0.75, top + 5.3, bz);
  add(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 4), dark, bx - side * 1.4, top + 4.7, bz);
  add(new THREE.CylinderGeometry(0.55, 0.55, 2.0, 10), red, bx - side * 1.4, top + 3.1, bz);
  add(new THREE.CylinderGeometry(0.57, 0.57, 0.12, 10), dark, bx - side * 1.4, top + 4.08, bz); add(new THREE.CylinderGeometry(0.57, 0.57, 0.12, 10), dark, bx - side * 1.4, top + 2.12, bz);
  mergeStatic(group, red); mergeStatic(group, dark); mergeStatic(group, rope);
}

// slab + underside as one faceted mesh. Returns geometry and helpers to sample the ground.
function islandBody(R, pal, scale = 1, depth = 10.5){
  const N = 14, out = [], ring = (y, s, jr, jy) => Array.from({ length: N }, (_, k) => { const a = k / N * Math.PI * 2 + (R() - 0.5) * 0.18, r = out[k] * s * (1 + (R() - 0.5) * jr); return [Math.cos(a) * r, y + (R() - 0.5) * jy, Math.sin(a) * r]; });
  for (let k = 0; k < N; k++) out.push(7.2 * scale * (0.86 + R() * 0.26));
  const top = 0.9 * scale;
  const inner = ring(top + 0.12, 0.55, 0.15, 0.22), A = ring(top, 1, 0.02, 0.12), B = ring(top - 1.0 * scale, 1.04, 0.03, 0.15);
  const under = [ring(top - 1.6 * scale, 0.9, 0.08, 0.3), ring(top - 3.6 * scale, 0.68, 0.14, 0.5), ring(top - 6.0 * scale, 0.42, 0.2, 0.6), ring(top - 8.3 * scale, 0.17, 0.3, 0.5)];
  const apex = [(R() - 0.5) * 1.5 * scale, top - depth * scale, (R() - 0.5) * 1.5 * scale], centre = [0, top + 0.2, 0];
  const pos = [], cols = [], nx = k => (k + 1) % N;
  for (let k = 0; k < N; k++) {                                     // grassy top: centre fan + bumpy inner ring
    tri(pos, cols, centre, inner[nx(k)], inner[k], C(pal.top[k % 3], R));
    tri(pos, cols, inner[k], inner[nx(k)], A[k], C(pal.top[(k + 1) % 3], R)); tri(pos, cols, inner[nx(k)], A[nx(k)], A[k], C(pal.top[(k + 2) % 3], R));
  }
  const band = (U, D, col) => { for (let k = 0; k < N; k++) { tri(pos, cols, U[k], U[nx(k)], D[k], col(k, 0)); tri(pos, cols, U[nx(k)], D[nx(k)], D[k], col(k, 1)); } };
  band(A, B, () => C(pal.side, R, 0.08));                           // the thick orange rim of the slab
  band(B, under[0], () => C(pal.soil[(R() * 3) | 0], R));
  for (let i = 0; i < under.length - 1; i++) { const d = i / 3; band(under[i], under[i + 1], () => { const c = new THREE.Color(pal.soil[(R() * 3) | 0]).lerp(new THREE.Color(pal.deep), d * 0.8 + R() * 0.15); return [c.r, c.g, c.b]; }); }
  const last = under[under.length - 1]; for (let k = 0; k < N; k++) tri(pos, cols, last[k], last[nx(k)], apex, C(pal.deep, R));
  const avgR = r => r.reduce((s, p) => s + Math.hypot(p[0], p[2]), 0) / r.length, avgY = r => r.reduce((s, p) => s + p[1], 0) / r.length;
  const profile = [[apex[1], 0], ...[...under].reverse().map(r => [avgY(r), avgR(r)]), [avgY(B), avgR(B)], [avgY(A), avgR(A)]];   // bottom to top
  return { geo: faceted(pos, cols), top, rim: A, under, outR: out, profile };
}

// carve a shallow basin under the pond and the stream, so the water never cuts through the bumpy ground
function carve(geo, top, at, rim, pr = 2.1){
  const P = geo.attributes.position, [px, pz] = at, len = Math.hypot(px, pz), dx = px / len, dz = pz / len;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i); if (y < top - 0.35) continue;
    const dp = Math.hypot(x - px, (z - pz) / 0.8), along = x * dx + z * dz, lat = Math.abs(-x * dz + z * dx);
    if (dp < pr + 0.5) P.setY(i, Math.min(y, top + 0.02 + Math.max(0, dp - pr) * 0.2));
    else if (along > len && along < rim + 0.5 && lat < 0.75) P.setY(i, Math.min(y, top + 0.06));
  }
  P.needsUpdate = true; geo.computeVertexNormals();
}

function lowRock(R, col, sx, sy, sz, detail = 0){
  const g = new THREE.IcosahedronGeometry(1, detail), P = g.attributes.position;
  const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`, jit = {};
  for (let i = 0; i < P.count; i++) { const k = key(P.getX(i), P.getY(i), P.getZ(i)); jit[k] = jit[k] || 0.78 + R() * 0.4; const j = jit[k]; P.setXYZ(i, P.getX(i) * j * sx, P.getY(i) * j * sy, P.getZ(i) * j * sz); }
  const cols = []; for (let f = 0; f < P.count / 3; f++) { const c = C(col[f % col.length], R, 0.08); cols.push(...c, ...c, ...c); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals(); return g;
}

function lowTree(R, pal, h = 3.2){
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.24, h, 5, 2).toNonIndexed(); trunk.translate(0, h / 2, 0);
  const TP = trunk.attributes.position; for (let i = 0; i < TP.count; i++) { const y = TP.getY(i) / h; TP.setX(i, TP.getX(i) + Math.sin(y * 2.2) * 0.35 * y); }
  const tc = []; for (let i = 0; i < TP.count / 3; i++) { const c = C(pal.trunk, R, 0.1); tc.push(...c, ...c, ...c); } trunk.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3));
  parts.push(trunk);
  for (let b = 0; b < 2; b++) {                                     // two little branches
    const br = new THREE.CylinderGeometry(0.05, 0.09, 1.2, 4).toNonIndexed(); br.translate(0, 0.6, 0); br.rotateZ((b ? 1 : -1) * 0.9); br.translate(0.2 * (b ? -1 : 1) + 0.25, h * (0.55 + b * 0.1), 0);
    const c = C(pal.trunk, R); br.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: br.attributes.position.count }, () => c).flat(), 3)); parts.push(br);
  }
  const blobs = 3 + (R() * 3 | 0);
  for (let i = 0; i < blobs; i++) {                                 // round canopy from a few faceted blobs
    const s = 0.9 + R() * 0.7, g = lowRock(R, pal.leaf, s * 1.25, s * 0.85, s * 1.15, 1);
    g.translate(0.3 + (R() - 0.5) * 2.2, h + 0.3 + (R() - 0.3) * 1.1, (R() - 0.5) * 2.0); parts.push(g);
  }
  const g = mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); if (!p.attributes.normal) p.computeVertexNormals(); return p; })); g.computeVertexNormals();
  return g;
}

const waterU = { uTime: { value: 0 } };
function waterfallMat(col){
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...waterU, uCol: { value: new THREE.Color(col) } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    vertexShader: `varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform vec3 uCol; varying vec2 vUv;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        float s = fract(vUv.y * 5.0 + uTime * 1.6 + floor(vUv.x * 3.0) * 0.37);
        float streak = smoothstep(0.0, 0.25, s) * smoothstep(1.0, 0.55, s);
        vec3 c = mix(uCol * 0.75, uCol * 1.35 + 0.15, streak);
        float a = smoothstep(0.0, 0.25, vUv.y) * (0.75 + streak * 0.25) * smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
}

// pond in the slab + a stream over the rim + a free-falling waterfall
function pondMaterial(pal, cosmic){
  return detail(new THREE.MeshStandardMaterial({ color: pal.water, roughness: 0.05, metalness: 0.1, emissive: pal.water, emissiveIntensity: cosmic ? 0.45 : 0.1, envMapIntensity: 1.4 }), { scale: 1.6, bump: 0.12, grain: 0.06, flow: 0.5, key: 'pond' });
}
function waterworks(group, R, pal, body, at, cosmic, shadows, hq){
  const [px, pz] = at, ang = Math.atan2(pz, px);
  let rimR = 7; { const k = Math.round(((ang / (Math.PI * 2)) % 1 + 1) % 1 * 14) % 14; rimR = Math.hypot(body.rim[k][0], body.rim[k][2]) - 0.25; }
  const pondMat = hq ? pondMaterial(pal, cosmic) : new THREE.MeshStandardMaterial({ color: pal.water, roughness: 0.15, metalness: 0.1, flatShading: true, emissive: pal.water, emissiveIntensity: cosmic ? 0.55 : 0.12 });
  const pond = new THREE.Mesh(new THREE.CircleGeometry(2.1, hq ? 40 : 9).rotateX(-Math.PI / 2), pondMat); pond.position.set(px, body.top + 0.2, pz); pond.scale.set(1, 1, 0.8); pond.rotation.y = R() * 6; group.add(pond);
  const dir = new THREE.Vector2(px, pz).normalize(), len = rimR - Math.hypot(px, pz) + 0.3;
  const ch = new THREE.Mesh(new THREE.PlaneGeometry(0.9, len).rotateX(-Math.PI / 2), pondMat);
  ch.position.set(px + dir.x * len / 2, body.top + 0.19, pz + dir.y * len / 2); ch.rotation.y = -Math.atan2(dir.y, dir.x) + Math.PI / 2; group.add(ch);
  const H = 9.5, fallG = new THREE.PlaneGeometry(hq ? 1.25 : 0.95, H, hq ? 8 : 3, hq ? 40 : 12); fallG.translate(0, -H / 2, 0);
  const FP = fallG.attributes.position; for (let i = 0; i < FP.count; i++) { const y = -FP.getY(i) / H; FP.setZ(i, FP.getZ(i) + y * y * 1.4); FP.setX(i, FP.getX(i) * (1 + y * 0.6)); }
  const fall = new THREE.Mesh(fallG, hq ? hqWaterfallMat(pal.water) : waterfallMat(pal.water)); fall.position.set(dir.x * rimR, body.top + 0.15, dir.y * rimR);
  fall.lookAt(dir.x * 40, body.top + 0.15, dir.y * 40); group.add(fall);
  const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: new THREE.Color(pal.water).multiplyScalar(0.8), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
  mist.position.set(dir.x * (rimR + 1.6), body.top - H + 1, dir.y * (rimR + 1.6)); mist.scale.setScalar(3.2); group.add(mist);
  if (hq) { const sp = spray(pal.water); sp.position.set(dir.x * (rimR + 1.7), body.top - H + 1.6, dir.y * (rimR + 1.7)); group.add(sp);
    const lip = spray(pal.water); lip.position.set(dir.x * (rimR + 0.1), body.top + 0.1, dir.y * (rimR + 0.1)); lip.scale.setScalar(0.35); group.add(lip); }
}

function populate(group, R, pal, body, cosmic, opts){
  const rock = opts.hq ? (r, c, sx, sy, sz, d) => hqRock(r, c, sx, sy, sz, d ? 3 : 2) : lowRock;
  const mat = opts.mat, add = (g, x, y, z, cast = true) => { const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.castShadow = cast && opts.shadows; m.receiveShadow = opts.shadows; group.add(m); return m; };
  // stones studded into the underside
  for (const r of body.under.slice(0, 3)) for (let k = 0; k < r.length; k += 2) if (R() < 0.65) {
    const v = r[k], s = 0.22 + R() * 0.38; add(rock(R, pal.stone, s, s * 0.8, s), v[0] * 1.02, v[1] + (R() - 0.5) * 0.8, v[2] * 1.02, false);
  }
  // little stones and bushes on top
  for (let i = 0; i < 6; i++) { const a = R() * 6.28, r = 4.6 + R() * 1.8, s = 0.18 + R() * 0.3; add(rock(R, pal.stone, s, s * 0.7, s), Math.cos(a) * r, body.top + (opts.hq ? 0.08 : 0.2), Math.sin(a) * r); }
  // trees around the back and sides, clear of the board
  const spots = pal.noTrees ? [] : pal.backTrees && !opts.small ? [[-2.9, -5.0], [2.7, -5.2]] : opts.small ? [[0.6, -0.4]] : (opts.peak ? [[-5.7, -1.6], [5.6, -2.0], [-4.4, -4.4]] : [[-5.7, -1.6], [5.6, -2.0], [-2.9, -5.0], [2.7, -5.2]]).filter(() => R() < 0.85);
  for (const [x, z] of spots) {
    const h = opts.small ? 2.2 : 2.8 + R() * 1.4, px = x * (opts.small ? 0.4 : 1), pz = z * (opts.small ? 0.4 : 1);
    if (!opts.hq) { add(lowTree(R, pal, h), px, body.top + 0.1, pz).rotation.y = R() * 6.28; continue; }
    const t = hqTree(R, pal, h * 1.1), ry = R() * 6.28;
    for (const [g, m] of [[t.bark, opts.barkMat], [t.leaves, opts.leafMat]]) { const o = new THREE.Mesh(g, m); o.position.set(px, body.top - 0.05, pz); o.rotation.y = ry; o.castShadow = o.receiveShadow = opts.shadows; group.add(o); }
  }
  // a grey peak behind the board on some islands
  if (opts.peak) { const g = opts.hq ? hqRock(R, pal.peak, 3.4, 7.5, 2.8, 4, -2) : lowRock(R, pal.peak, 3.4, 7.5, 2.8, 1); g.translate(0, 5.4, 0); const p = add(g, (R() - 0.5) * 3, body.top - 0.6, -4.6); p.rotation.y = R() * 6; }
}

// merge the static parts that share a material into one mesh (one draw call instead of dozens)
function mergeStatic(group, mat, keepUV = false){
  const ms = group.children.filter(o => o.isMesh && o.material === mat);
  if (ms.length < 2) return;
  const geos = ms.map(m => { m.updateMatrix(); const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrix); if (!keepUV) g.deleteAttribute('uv'); return g; });
  const merged = new THREE.Mesh(mergeGeometries(geos), mat);
  merged.castShadow = ms.some(m => m.castShadow); merged.receiveShadow = ms.some(m => m.receiveShadow);
  ms.forEach(m => group.remove(m)); group.add(merged); return merged;
}

export function makeIsland({ seed, title, image, cosmic, shadows = true, hq = false, theme = null }){
  const R = rnd(seed), group = new THREE.Group(), pal = PAL[theme] || (cosmic ? PAL.cosmic : PAL.sea);
  // computers: smooth sculpted rock with surface detail; phones: the light flat-shaded low-poly look
  const mat = hq ? detail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.35 }), { scale: 0.9, bump: 0.35, grain: 0.22, key: 'rock' })
                 : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.35 });
  const barkMat = hq ? detail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { scale: 2.2, bump: 0.8, grain: 0.35, stretch: [3, 0.35, 3], key: 'bark' }) : null;
  const leafMat = hq ? leafMaterial() : null;
  const body = islandBody(R, pal);
  const front = R() < 0.5 ? -1 : 1, pondAt = [front * 3.4, 3.2];
  if (pal.water) carve(body.geo, body.top, pondAt, 7.6);
  const rockGeo = hq ? hqBody(body, pal, seed) : body.geo;
  if (hq && pal.water) carve(rockGeo, body.top, pondAt, 7.6);
  const heightAt = hq ? heightGrid(rockGeo) : null;
  const rock = new THREE.Mesh(rockGeo, mat); rock.castShadow = rock.receiveShadow = shadows; group.add(rock);
  if (pal.water) waterworks(group, R, pal, body, pondAt, cosmic, shadows, hq);
  populate(group, R, pal, body, cosmic, { mat, shadows, hq, barkMat, leafMat, peak: seed % 2 === 1 });
  const keepClear = pal.gummies ? [[-front * 4.3, 3.4], [-front * 5.9, 2.0], [front * 6.1, -1.0], [-front * 2.3, 4.9]] : [];   // no grass over the jelly figures
  if (hq && !pal.noTrees) group.add(grass(heightAt, pal, R, pal.gummies ? 1600 : 2600, (x, z) => (pal.water && Math.hypot(x - pondAt[0], (z - pondAt[1]) / 0.8) < 2.5) || (Math.abs(x) < 4.6 && Math.abs(z) < 0.6) || keepClear.some(([gx, gz]) => Math.hypot(x - gx, z - gz) < 1.1)));

  // a small satellite chunk drifting below and behind (like the reference)
  const chunks = [];
  { const s = 0.42, cb = islandBody(R, pal, s, 9); const cg = new THREE.Group();
    if (pal.water) carve(cb.geo, cb.top, [-0.5, 0.6], 0, 1.0);
    const cgeo = hq ? hqBody(cb, pal, seed + 7) : cb.geo; if (hq && pal.water) carve(cgeo, cb.top, [-0.5, 0.6], 0, 1.0);
    const cm = new THREE.Mesh(cgeo, mat); cm.castShadow = cm.receiveShadow = shadows; cg.add(cm);
    populate(cg, R, pal, cb, cosmic, { mat, shadows, hq, barkMat, leafMat, small: true }); mergeStatic(cg, mat); if (hq) { mergeStatic(cg, barkMat); mergeStatic(cg, leafMat, true); }
    if (pal.water) { const pond = new THREE.Mesh(new THREE.CircleGeometry(1.0, hq ? 28 : 8).rotateX(-Math.PI / 2), hq ? pondMaterial(pal, cosmic) : new THREE.MeshStandardMaterial({ color: pal.water, roughness: 0.15, flatShading: true, emissive: pal.water, emissiveIntensity: cosmic ? 0.5 : 0.1 }));
    pond.position.set(-0.5, cb.top + 0.16, 0.6); cg.add(pond); }
    cg.position.set(-front * (11 + R() * 3), -5 - R() * 3, -5 - R() * 4); cg.userData = { y: cg.position.y, ph: R() * 6 }; group.add(cg); chunks.push(cg); }

  if (cosmic) {                                                      // glowing crystals under the cosmic islands
    const cryMat = new THREE.MeshStandardMaterial({ color: 0x6a3cff, emissive: new THREE.Color(0.6, 0.35, 2.2), roughness: 0.2, flatShading: true });
    for (let k = 0; k < 6; k++) { const h = 1.2 + R() * 2.4, cr = new THREE.Mesh(new THREE.ConeGeometry(0.22 + R() * 0.25, h, 5), cryMat);
      const a = R() * 6.28, rr = 1.2 + R() * 2.6; cr.position.set(Math.cos(a) * rr, -3 - R() * 5, Math.sin(a) * rr); cr.rotation.set(Math.PI + (R() - .5) * .8, R() * 6, (R() - .5) * .8); group.add(cr); }
    mergeStatic(group, cryMat);
  }
  const top = body.top;
  // notice board: chunky frame, plank back, little plank roof, posts — image is a separate replaceable plane
  const wt = wood(hq);
  const woodMat = rimmed(new THREE.MeshStandardMaterial({ map: wt, color: pal.wood || (cosmic ? 0xb7a3d8 : 0xffffff), roughness: 0.82, ...(hq ? { bumpMap: wt, bumpScale: 2.5 } : {}) }), 0.7);
  const bw = 7.2, bh = 4.05, fy = top + 1.4 + bh / 2;
  const box = (w, h, d, x, y, z, ry = 0, rz = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), woodMat); m.position.set(x, y, z); m.rotation.set(0, ry, rz); m.castShadow = m.receiveShadow = shadows; group.add(m); return m; };
  box(bw + 0.9, 0.45, 0.45, 0, fy + bh / 2 + 0.22, 0); box(bw + 0.9, 0.45, 0.45, 0, fy - bh / 2 - 0.22, 0);
  box(0.45, bh + 0.9, 0.45, -bw / 2 - 0.22, fy, 0); box(0.45, bh + 0.9, 0.45, bw / 2 + 0.22, fy, 0);
  box(bw, bh, 0.12, 0, fy, -0.12);
  for (const s of [-1, 1]) box(0.42, fy + bh / 2 + 1.4 - top, 0.42, s * (bw / 2 + 0.22), (fy + bh / 2 + 1.4 + top) / 2, -0.1);
  box(bw + 2.2, 0.16, 1.4, 0, fy + bh / 2 + 1.25, 0.25, 0, 0).rotation.x = -0.32;
  // banner flags on both ends of the roof, blowing the same way in the wind
  const FLAG = { ummy: ['#ff8fb5', '#ffffff'], gulag: ['#a50f18', '#1a1616'] }[theme] || (cosmic ? ['#5b2fb3', '#d8dcff'] : ['#a3161d', '#e3aa45']);
  for (const s of [-1, 1]) { const f = makeFlag({ base: FLAG[0], trim: FLAG[1], hq, phase: seed * 1.7 + s * 0.9 }); f.position.set(s * (bw / 2 + 0.22), fy + bh / 2 + 1.1, -0.1); group.add(f); }
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1a1614, metalness: 0.8, roughness: 0.45, envMapIntensity: 0.5 });
  if (hq) detail(ironMat, { scale: 5, bump: 0.45, grain: 0.35, key: 'iron' });
  for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.5), ironMat); b.position.set(x * (bw / 2 + 0.22), fy + y * (bh / 2 + 0.22), 0.02); group.add(b); }
  const tex = image ? tl.load(image) : soonTexture(title); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const imgMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.12, roughness: 0.6 });
  const img = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), imgMat); img.position.set(0, fy, 0.0); img.receiveShadow = shadows; group.add(img);

  if (pal.ring) fightRing(group, R, top, -front, shadows);
  if (pal.gummies) { const spots = [[-front * 4.3, 3.4, 0.35], [-front * 5.9, 2.0, -0.4], [front * 6.1, -1.0, 0.2]];
    spots.push([-front * 2.3, 4.9, 0.1]);
    pal.gummies.forEach(([c, pose], i) => { const g = gummy(c, pose, hq), [x, z, ry] = spots[i], gy = heightAt ? heightAt(x, z) : null;
      g.position.set(x, (gy != null ? gy : top + 0.2) - 0.02, z); g.rotation.y = ry; g.scale.setScalar(0.85 + R() * 0.15); g.userData.body.castShadow = shadows; group.add(g); }); }
  // torches with the site's flame frames (Ummy: soft pastel orbs instead)
  const fr = frames(), torches = [];
  for (const s of [-1, 1]) {
    const x = s * (bw / 2 + 1.6);
    const orb = pal.torch === 'orb';
    if (hq && !orb) {                                                 // computers: modelled iron torch, shader flame, embers
      const ht = hqTorch(group, x, top, 0.8, woodMat, ironMat, seed * 3.1 + s, R, shadows);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: new THREE.Color(1.6, 1.1, 0.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .5, toneMapped: false, fog: false }));
      gl.position.set(x, top + 3.5, 0.8); gl.scale.set(5, 5, 1); group.add(gl);
      torches.push({ hq: ht, gl, off: R() * 24 | 0, ph: R() * 10 }); continue;
    }
    box(0.18, 2.8, 0.18, x, top + 1.4, 0.8);
    const bowl = new THREE.Mesh(orb ? new THREE.IcosahedronGeometry(0.42, hq ? 5 : 1) : new THREE.CylinderGeometry(0.34, 0.16, 0.36, 8), orb ? new THREE.MeshStandardMaterial({ color: 0xfff2f8, emissive: new THREE.Color(...pal.orb), emissiveIntensity: 1, flatShading: !hq, roughness: hq ? 0.15 : 1 }) : ironMat); bowl.position.set(x, top + (orb ? 3.15 : 2.9), 0.8); group.add(bowl);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: fr[0], color: new THREE.Color(2.2, 1.7, 1.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
    fl.position.set(x, top + 3.0, 0.8); fl.scale.set(1.4, 1.75, 1); fl.center.set(0.5, 0.12); fl.visible = !orb; group.add(fl);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: orb ? new THREE.Color(...pal.orb) : new THREE.Color(1.6, 1.1, 0.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .5, toneMapped: false, fog: false }));
    gl.position.set(x, top + 3.5, 0.8); gl.scale.set(5, 5, 1); group.add(gl);
    torches.push({ fl, gl, off: R() * 24 | 0 });
  }
  mergeStatic(group, mat); mergeStatic(group, woodMat, true); mergeStatic(group, ironMat); if (hq) { mergeStatic(group, barkMat); mergeStatic(group, leafMat, true); }
  const baseY = { v: null };
  return {
    group, profile: body.profile, hit: img, labelAnchor: new THREE.Vector3(0, fy + bh / 2 + 1.9, 0), boardCenter: new THREE.Vector3(0, fy, 0),
    update(t, hover, mix){
      shared.uMix.value = mix; waterU.uTime.value = t; RT.uTime.value = t; for (const c of chunks) c.position.y = c.userData.y + Math.sin(t * 0.6 + c.userData.ph) * 0.35; shared.uRim.value.setRGB(1.0 - mix * 0.5, 0.55 - mix * 0.15, 0.3 + mix * 0.7);
      if (baseY.v == null) baseY.v = group.position.y;
      group.position.y = baseY.v + Math.sin(t * 0.45 + seed) * 0.45; group.rotation.z = Math.sin(t * 0.3 + seed) * 0.012;
      imgMat.emissiveIntensity = 0.1 + hover * 0.22;
      for (const tc of torches) {
        if (tc.hq) { const fl = 0.85 + 0.15 * Math.sin(t * 9 + tc.ph) * Math.sin(t * 5.3 + tc.ph * 2), k = 1 + hover * 0.5;
          tc.hq.mat.uniforms.uK.value = k * (0.9 + 0.1 * fl); tc.hq.flame.scale.set(k, k, 1); tc.gl.material.opacity = (0.35 + hover * 0.5) * fl; tc.gl.scale.setScalar((4.5 + hover * 3) * (0.95 + 0.05 * fl)); continue; }
        tc.fl.material.map = fr[(((t * 24) | 0) + tc.off) % 24];
        const k = 1 + hover * 0.5; tc.fl.scale.set(1.4 * k, 1.75 * k, 1); tc.gl.material.opacity = 0.35 + hover * 0.5; tc.gl.scale.setScalar(4.5 + hover * 3);
      }
    }
  };
}
