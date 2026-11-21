import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Procedural island outposts (stand-ins until the island character sheet is modelled):
// sculpted floating rock (plateau, layered cliffs, tapering underside), glowing crystals, hanging roots,
// a framed notice board with a replaceable image, torches with the site's own flame frames, lanterns on a rope.

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
function wood(){
  if (woodTex) return woodTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const x = c.getContext('2d');
  x.fillStyle = '#3a2416'; x.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 140; i++) { const y = Math.random() * 512, a = Math.random() * .25; x.strokeStyle = Math.random() < .5 ? `rgba(20,10,6,${a})` : `rgba(120,80,50,${a * .6})`; x.lineWidth = 1 + Math.random() * 3; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(80, y + (Math.random() - .5) * 20, 170, y + (Math.random() - .5) * 20, 256, y + (Math.random() - .5) * 10); x.stroke(); }
  for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(10,5,3,.5)'; x.fillRect(0, i * 128 + 126, 256, 3); }
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

function rockGeometry(seed, cosmic){
  let g = new THREE.IcosahedronGeometry(1, 5); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), v = new THREE.Vector3();
  const o = seed * 13.7;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n1 = fbm(v.x * 1.6 + o, v.y * 1.6, v.z * 1.6, 4), n2 = fbm(v.x * 5 + o, v.y * 5, v.z * 5, 3);
    let x = v.x, y = v.y, z = v.z, r = Math.hypot(x, z);
    if (y > 0.12) { y = 0.12 + (y - 0.12) * 0.12 + (n1 - .5) * 0.05; const k = 1.12 + (n1 - .5) * 0.25; x *= k; z *= k; } // plateau
    else if (y > -0.2) { const k = 1.12 + (n1 - .5) * 0.35; x *= k; z *= k; y += Math.sin(y * 30 + n1 * 4) * 0.025; } // cliffs with strata
    else { const d = (-y - 0.2) / 0.8; y = -0.2 - d * (2.2 + (n1 - .5) * 0.8); const k = (1 - Math.pow(d, 0.8) * 0.88) * (1.05 + (n2 - .5) * 0.5); x *= k; z *= k; } // tapering underside
    const bump = (n2 - .5) * 0.12; x *= 1 + bump; z *= 1 + bump;
    p.setXYZ(i, x * 7, y * 7, z * 7);
    // colour: grassy-earth plateau, warm layered stone, dark underside
    let c;
    if (v.y > 0.18) c = [0.16 + n2 * 0.08, 0.17 + n2 * 0.07, 0.09 + n1 * 0.04];
    else if (v.y > -0.25) { const band = 0.5 + 0.5 * Math.sin(v.y * 40 + n1 * 6); c = [0.22 + band * 0.1, 0.16 + band * 0.06, 0.15 + band * 0.05]; }
    else { const d = Math.min(1, (-v.y - 0.25) * 1.6); c = [0.12 - d * 0.07, 0.09 - d * 0.05, 0.13 - d * 0.05]; }
    const ao = 0.55 + n2 * 0.7;
    if (cosmic) c = [c[0] * 0.8, c[1] * 0.72, c[2] * 1.25];
    col.set([c[0] * ao, c[1] * ao, c[2] * ao], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}

export function makeIsland({ seed, title, image, cosmic }){
  const R = rnd(seed), group = new THREE.Group();
  const rockMat = rimmed(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 }), 0.45);
  const rock = new THREE.Mesh(rockGeometry(seed, cosmic), rockMat); group.add(rock);

  // glowing crystals under the island
  const cryCol = cosmic ? new THREE.Color(0.6, 0.35, 2.2) : new THREE.Color(2.4, 0.9, 0.25);
  const cryMat = new THREE.MeshStandardMaterial({ color: cosmic ? 0x6a3cff : 0xff8a3a, emissive: cryCol, emissiveIntensity: 1, roughness: 0.2, metalness: 0.1, flatShading: true });
  for (let k = 0; k < 7; k++) {
    const h = 1.2 + R() * 2.4, cr = new THREE.Mesh(new THREE.ConeGeometry(0.22 + R() * 0.25, h, 5), cryMat);
    const a = R() * 6.28, rr = 1.5 + R() * 3.2; cr.position.set(Math.cos(a) * rr, -2.2 - R() * 4.5, Math.sin(a) * rr); cr.rotation.set(Math.PI + (R() - .5) * .8, R() * 6, (R() - .5) * .8);
    group.add(cr);
  }
  // hanging roots
  const rootMat = new THREE.MeshStandardMaterial({ color: 0x120c0a, roughness: 1, envMapIntensity: 0.2 });
  for (let k = 0; k < 6; k++) {
    const a = R() * 6.28, r0 = 3.2 + R() * 2.2, x = Math.cos(a) * r0, z = Math.sin(a) * r0, len = 2.5 + R() * 4;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, -2.2, z), new THREE.Vector3(x * 1.05 + (R() - .5) * 1.5, -2.2 - len * 0.4, z * 1.05 + (R() - .5) * 1.5), new THREE.Vector3(x * 0.9 + (R() - .5) * 2, -2.2 - len * 0.75, z * 0.9 + (R() - .5) * 2), new THREE.Vector3(x * 0.85 + (R() - .5) * 2.5, -2.2 - len, z * 0.85 + (R() - .5) * 2.5)]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.05 + R() * 0.04, 5, false), rootMat));
  }

  // notice board: chunky frame, plank back, little plank roof, posts — image is a separate replaceable plane
  const wt = wood();
  const woodMat = rimmed(new THREE.MeshStandardMaterial({ map: wt, color: cosmic ? 0xb7a3d8 : 0xffffff, roughness: 0.82 }), 0.7);
  const bw = 7.2, bh = 4.05, top = 1.0, fy = top + 1.4 + bh / 2;
  const box = (w, h, d, x, y, z, ry = 0, rz = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), woodMat); m.position.set(x, y, z); m.rotation.set(0, ry, rz); group.add(m); return m; };
  box(bw + 0.9, 0.45, 0.45, 0, fy + bh / 2 + 0.22, 0); box(bw + 0.9, 0.45, 0.45, 0, fy - bh / 2 - 0.22, 0);
  box(0.45, bh + 0.9, 0.45, -bw / 2 - 0.22, fy, 0); box(0.45, bh + 0.9, 0.45, bw / 2 + 0.22, fy, 0);
  box(bw, bh, 0.12, 0, fy, -0.12);
  for (const s of [-1, 1]) box(0.42, fy + bh / 2 + 1.4 - top, 0.42, s * (bw / 2 + 0.22), (fy + bh / 2 + 1.4 + top) / 2, -0.1);
  box(bw + 2.2, 0.16, 1.4, 0, fy + bh / 2 + 1.25, 0.25, 0, 0).rotation.x = -0.32;
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1a1614, metalness: 0.8, roughness: 0.45, envMapIntensity: 0.5 });
  for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.5), ironMat); b.position.set(x * (bw / 2 + 0.22), fy + y * (bh / 2 + 0.22), 0.02); group.add(b); }
  const tex = image ? tl.load(image) : soonTexture(title); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const imgMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.12, roughness: 0.6 });
  const img = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), imgMat); img.position.set(0, fy, 0.0); group.add(img);

  // torches with the site's flame frames
  const fr = frames(), torches = [];
  for (const s of [-1, 1]) {
    const x = s * (bw / 2 + 1.6);
    box(0.18, 2.8, 0.18, x, top + 1.4, 0.8);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.16, 0.36, 8), ironMat); bowl.position.set(x, top + 2.9, 0.8); group.add(bowl);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: fr[0], color: new THREE.Color(2.2, 1.7, 1.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
    fl.position.set(x, top + 3.0, 0.8); fl.scale.set(1.4, 1.75, 1); fl.center.set(0.5, 0.12); group.add(fl);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: new THREE.Color(1.6, 1.1, 0.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .5, toneMapped: false, fog: false }));
    gl.position.set(x, top + 3.5, 0.8); gl.scale.set(5, 5, 1); group.add(gl);
    torches.push({ fl, gl, off: R() * 24 | 0 });
  }
  // lanterns on a rope across the back of the island
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 1 });
  const pA = new THREE.Vector3(-4.6, top + 3.2, -3.2), pB = new THREE.Vector3(4.8, top + 3.0, -2.6);
  for (const p of [pA, pB]) box(0.14, 3.2, 0.14, p.x, top + 1.6, p.z);
  const rope = new THREE.QuadraticBezierCurve3(pA, new THREE.Vector3(0, top + 1.8, -3.0), pB);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(rope, 16, 0.03, 4, false), ropeMat));
  const lanMat = new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: cosmic ? new THREE.Color(1.2, 0.6, 2.0) : new THREE.Color(2.2, 1.0, 0.35), roughness: 0.4 });
  const lanterns = [];
  for (let k = 1; k <= 4; k++) { const p = rope.getPoint(k / 5); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 6), lanMat); l.position.copy(p).add(new THREE.Vector3(0, -0.35, 0)); group.add(l); lanterns.push(l); }
  // flags
  const flagMat = new THREE.MeshStandardMaterial({ color: cosmic ? 0x7a3cff : 0xc8361f, side: THREE.DoubleSide, roughness: .85, emissive: cosmic ? 0x1a0a40 : 0x200500 });
  const flags = [];
  for (const [x, z] of [[-5.6, 1.5], [5.2, -0.8]]) {
    box(0.08, 4.6, 0.08, x, top + 2.3, z);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8, 10, 2), flagMat); flag.position.set(x + 0.8, top + 4.1, z); group.add(flag); flags.push(flag);
  }

  const baseY = { v: null };
  return {
    group, hit: img, labelAnchor: new THREE.Vector3(0, fy + bh / 2 + 1.9, 0), boardCenter: new THREE.Vector3(0, fy, 0),
    update(t, hover, mix){
      shared.uMix.value = mix; shared.uRim.value.setRGB(1.0 - mix * 0.5, 0.55 - mix * 0.15, 0.3 + mix * 0.7);
      if (baseY.v == null) baseY.v = group.position.y;
      group.position.y = baseY.v + Math.sin(t * 0.45 + seed) * 0.45; group.rotation.z = Math.sin(t * 0.3 + seed) * 0.012;
      imgMat.emissiveIntensity = 0.1 + hover * 0.22;
      for (const tc of torches) {
        tc.fl.material.map = fr[(((t * 24) | 0) + tc.off) % 24];
        const k = 1 + hover * 0.5; tc.fl.scale.set(1.4 * k, 1.75 * k, 1); tc.gl.material.opacity = 0.35 + hover * 0.5; tc.gl.scale.setScalar(4.5 + hover * 3);
      }
      for (const l of lanterns) l.rotation.z = Math.sin(t * 1.3 + l.position.x) * 0.15;
      for (const f of flags) { const a = f.geometry.attributes.position; for (let i = 0; i < a.count; i++) { const x = a.getX(i) + .8; a.setZ(i, Math.sin(t * 4 + x * 3.5 + seed) * 0.14 * x); } a.needsUpdate = true; }
    }
  };
}
