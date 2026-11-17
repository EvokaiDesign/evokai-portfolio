/* Evokai — small 3D pieces that sit in the empty space between the pictures on project pages.
   Each one is themed to its project. Built with three.js; renders only while on screen. */
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const live = new Set();
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let pointer = { x: 0, y: 0 };
addEventListener('pointermove', e => { pointer.x = e.clientX / innerWidth * 2 - 1; pointer.y = e.clientY / innerHeight * 2 - 1; }, { passive: true });

function stage(el, { fov = 35, z = 6 } = {}) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  el.appendChild(r.domElement);
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
  const cam = new THREE.PerspectiveCamera(fov, 1, .1, 100); cam.position.set(0, 0, z);
  const size = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  size();
  return { r, scene, cam, size };
}

function run(el, s, tick) {
  let vis = false, raf = 0, t0 = performance.now(), last = t0;
  const io = new IntersectionObserver(([e]) => { vis = e.isIntersecting; if (vis && !raf) raf = requestAnimationFrame(loop); }, { rootMargin: '100px' });
  io.observe(el);
  const ro = new ResizeObserver(s.size); ro.observe(el);
  function loop(now) {
    raf = 0; if (!vis) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const r = el.getBoundingClientRect(), k = 1 - (r.top + r.height / 2) / (innerHeight + r.height); // 0 → 1 as it scrolls through
    tick((now - t0) / 1000, dt, Math.max(0, Math.min(1, k)));
    s.r.render(s.scene, s.cam);
    if (!reduce) raf = requestAnimationFrame(loop);
  }
  const item = { dispose() { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); s.scene.traverse(o => { o.geometry && o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); }); s.r.dispose(); s.r.forceContextLoss(); } };
  live.add(item); return item;
}
const ease = (a, b, k) => a + (b - a) * k;

/* ---------- Infinite Chances: the glass ball over rising green light ---------- */
function ball(el) {
  const s = stage(el, { z: 7 });
  const g = new THREE.Group(); s.scene.add(g);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshPhysicalMaterial({ color: 0x0d3b12, metalness: .1, roughness: .05, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 1.6 }));
  g.add(sphere);
  const glow = new THREE.PointLight(0x55ff6a, 40, 12); glow.position.set(0, -2.2, 1.5); s.scene.add(glow);
  const rim = new THREE.PointLight(0xb6ff4a, 18, 10); rim.position.set(2.5, 2, 2); s.scene.add(rim);
  // rising lines
  const N = 70, pos = new Float32Array(N * 6), seeds = [];
  for (let i = 0; i < N; i++) seeds.push({ x: (Math.random() - .5) * 5.5, z: (Math.random() - .5) * 2 - 1.5, y: Math.random() * 8 - 4, v: .4 + Math.random() * .9, l: .25 + Math.random() * .9 });
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x5dff7a, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scene.add(lines);
  run(el, s, (t, dt, k) => {
    seeds.forEach((p, i) => { p.y += p.v * dt; if (p.y > 4.5) p.y = -4.5; pos.set([p.x, p.y, p.z, p.x, p.y + p.l, p.z], i * 6); });
    lg.attributes.position.needsUpdate = true;
    sphere.position.y = Math.sin(t * 1.4) * .28 + ease(.6, -.6, k);
    sphere.rotation.y = t * .3;
    g.rotation.x = ease(g.rotation.x, pointer.y * .12, .05); g.rotation.y = ease(g.rotation.y, pointer.x * .2, .05);
    glow.intensity = 34 + Math.sin(t * 2.2) * 8;
  });
}

/* ---------- Sans Chaînes: a gold chain that breaks free as you scroll ---------- */
function chain(el) {
  const s = stage(el, { z: 14 });
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xd9ad62, metalness: 1, roughness: .2, clearcoat: .6, envMapIntensity: 1.3 });
  const link = new THREE.TorusGeometry(.62, .17, 32, 96); link.scale(1, 1.55, 1);
  const g = new THREE.Group(); s.scene.add(g);
  const links = [];
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(link, gold); m.userData.i = i; links.push(m); g.add(m); }
  const key = new THREE.DirectionalLight(0xfff1d6, 2.2); key.position.set(3, 4, 5); s.scene.add(key);
  run(el, s, (t, dt, k) => {
    const brk = Math.max(0, Math.min(1, (k - .35) / .4)); // breaks between the 3rd and 4th link
    links.forEach((m, i) => {
      const y = (2.5 - i) * 1.42, side = i < 3 ? 1 : -1;
      m.position.set(Math.sin(t * .8 + i * .6) * .08 + side * brk * .5, y + side * brk * 1.1, 0);
      m.rotation.y = (i % 2 ? Math.PI / 2 : 0) + Math.sin(t * .6 + i) * .15 + side * brk * .5;
      m.rotation.z = side * brk * .35;
    });
    g.rotation.y = t * .25 + pointer.x * .3; g.rotation.x = pointer.y * .1;
  });
}

/* ---------- Combustion: embers rising from a hot core ---------- */
function embers(el) {
  const s = stage(el, { z: 6 });
  const N = 900, pos = new Float32Array(N * 3), life = new Float32Array(N), seed = new Float32Array(N);
  const reset = i => { const a = Math.random() * Math.PI * 2, r = Math.random() * .6; pos.set([Math.cos(a) * r, -1.7 + Math.random() * .4, Math.sin(a) * r], i * 3); life[i] = 0; seed[i] = Math.random(); };
  for (let i = 0; i < N; i++) { reset(i); life[i] = Math.random(); pos[i * 3 + 1] = -2.2 + Math.random() * 4.5; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('life', new THREE.BufferAttribute(life, 1)); geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { px: { value: s.r.getPixelRatio() } },
    vertexShader: `attribute float life; attribute float seed; uniform float px; varying float vL; varying float vS;
      void main(){ vL=life; vS=seed; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=(14.*(1.-life)+4.)*px*(.6+seed)/(-mv.z)*3.; }`,
    fragmentShader: `varying float vL; varying float vS; void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard; float a=smoothstep(.5,0.,d)*(1.-vL);
      vec3 hot=vec3(1.,.93,.7), mid=vec3(1.,.45,.1), cool=vec3(.6,.08,.02); vec3 c=mix(mix(hot,mid,smoothstep(0.,.35,vL)),cool,smoothstep(.35,1.,vL)); gl_FragColor=vec4(c,a); }` });
  s.scene.add(new THREE.Points(geo, mat));
  const core = new THREE.Mesh(new THREE.SphereGeometry(.55, 48, 32), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: .9 }));
  core.position.y = -1.5; s.scene.add(core);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.2, 32, 16), new THREE.MeshBasicMaterial({ color: 0xff4d1a, transparent: true, opacity: .18, blending: THREE.AdditiveBlending, depthWrite: false })); halo.position.y = -1.5; s.scene.add(halo);
  run(el, s, (t, dt) => {
    for (let i = 0; i < N; i++) { life[i] += dt * (.18 + seed[i] * .25); if (life[i] >= 1) reset(i);
      const j = i * 3; pos[j + 1] += dt * (1.1 + seed[i] * 1.4); pos[j] += Math.sin(t * 2 + seed[i] * 20) * dt * .35 + pointer.x * dt * .3; pos[j + 2] += Math.cos(t * 1.7 + seed[i] * 12) * dt * .25; }
    geo.attributes.position.needsUpdate = true; geo.attributes.life.needsUpdate = true;
    const f = 1 + Math.sin(t * 9) * .04 + Math.sin(t * 23) * .03; core.scale.setScalar(f); halo.scale.setScalar(f * (1 + Math.sin(t * 3) * .06));
  });
}

/* ---------- Ummy: wobbling pastel jelly blobs ---------- */
function jelly(el) {
  const s = stage(el, { z: 7 });
  const cols = [0xffb3c7, 0x9fd2ff, 0xb4f2c4, 0xffe08a], blobs = [];
  cols.forEach((c, i) => {
    const geo = new THREE.IcosahedronGeometry(1, 24); geo.userData.base = geo.attributes.position.array.slice();
    const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: c, roughness: .18, clearcoat: 1, clearcoatRoughness: .1, sheen: 1, sheenColor: new THREE.Color(0xffffff), envMapIntensity: 1.1 }));
    const a = i / cols.length * Math.PI * 2; m.userData = { a, r: 1.6, s: .55 + (i % 2) * .25, ph: Math.random() * 10 };
    m.scale.setScalar(m.userData.s); s.scene.add(m); blobs.push(m);
  });
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2, 4, 5); s.scene.add(key);
  run(el, s, t => {
    blobs.forEach((m, i) => {
      const u = m.userData, b = m.geometry.userData.base, p = m.geometry.attributes.position.array;
      for (let j = 0; j < p.length; j += 3) { const x = b[j], y = b[j + 1], z = b[j + 2]; const w = 1 + .08 * Math.sin(x * 3 + t * 2.4 + u.ph) * Math.sin(y * 3.2 + t * 2) + .05 * Math.sin(z * 4 + t * 3); p[j] = x * w; p[j + 1] = y * w; p[j + 2] = z * w; }
      m.geometry.attributes.position.needsUpdate = true; m.geometry.computeVertexNormals();
      const a = u.a + t * .25; m.position.set(Math.cos(a) * u.r + pointer.x * .3, Math.sin(a * 1.3) * .9 - pointer.y * .2, Math.sin(a) * .8);
      m.rotation.set(t * .2 + i, t * .3, 0);
    });
  });
}

/* ---------- Hero: an iridescent knot ---------- */
function knot(el) {
  const s = stage(el, { z: 7 });
  const m = new THREE.Mesh(new THREE.TorusKnotGeometry(1.1, .34, 260, 40, 2, 3), new THREE.MeshPhysicalMaterial({ color: 0x5a2790, metalness: .55, roughness: .12, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 900], clearcoat: 1, envMapIntensity: 1.4 }));
  s.scene.add(m);
  const l1 = new THREE.PointLight(0xff7a4d, 30, 12); l1.position.set(-3, 2, 3); s.scene.add(l1);
  const l2 = new THREE.PointLight(0x3a6bff, 30, 12); l2.position.set(3, -2, 3); s.scene.add(l2);
  run(el, s, (t, dt, k) => { m.rotation.x = t * .22 + k * 1.5; m.rotation.y = t * .3 + pointer.x * .4; m.position.y = Math.sin(t * .9) * .15; });
}

/* ---------- Evokai / Reel: glass coins flowing in a helix ---------- */
function coins(el, tint = 0xff6a1f, light = 0xffcf7a) {
  const s = stage(el, { z: 11 });
  const geo = new THREE.CylinderGeometry(.62, .62, .1, 64); geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshPhysicalMaterial({ color: tint, metalness: 0, roughness: .06, transmission: .85, thickness: .6, ior: 1.45, clearcoat: 1, attenuationColor: new THREE.Color(tint), attenuationDistance: .8, envMapIntensity: 1.3 });
  const edge = new THREE.MeshBasicMaterial({ color: light });
  const N = 14, items = [];
  for (let i = 0; i < N; i++) { const c = new THREE.Mesh(geo, mat); const e = new THREE.Mesh(new THREE.TorusGeometry(.62, .02, 8, 64), edge); c.add(e); s.scene.add(c); items.push(c); }
  const pl = new THREE.PointLight(light, 50, 14); pl.position.set(0, 0, 3); s.scene.add(pl);
  run(el, s, (t, dt, k) => {
    items.forEach((c, i) => { const u = (i / N + t * .05 + k * .3) % 1, a = u * Math.PI * 4;
      c.position.set(Math.cos(a) * 1.6, (u - .5) * 7, Math.sin(a) * 1.6 - 1); c.rotation.set(t * .8 + i, a + t * .5, 0); });
    pl.position.x = pointer.x * 2; pl.position.y = -pointer.y * 2;
  });
}

/* ---------- The Evokai figure loop (Fernando's own render) ---------- */
function figure(el) {
  const v = document.createElement('video'); Object.assign(v, { src: 'media/figure-loop2.mp4', muted: true, loop: true, playsInline: true, autoplay: true }); v.setAttribute('muted', '');
  v.className = 'fxvid'; el.appendChild(v);
  const io = new IntersectionObserver(([e]) => e.isIntersecting ? v.play().catch(() => {}) : v.pause()); io.observe(el);
  live.add({ dispose() { io.disconnect(); v.pause(); v.removeAttribute('src'); v.load(); } });
}

const KINDS = { ball, chain, embers, jelly, knot, coins, figure,
  coinsViolet: el => coins(el, 0x7b2cff, 0xff8ad8) };

export function mount(root) {
  dispose();
  root.querySelectorAll('.cfx[data-fx]').forEach(el => { try { KINDS[el.dataset.fx] && KINDS[el.dataset.fx](el); } catch (e) { console.warn('fx', e); el.remove(); } });
}
export function dispose() { live.forEach(i => i.dispose()); live.clear(); }
