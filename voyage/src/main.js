// AI Voyage — scroll-driven 3D journey (sunset ocean → edge of the world → cosmic ocean).
// Source for voyage/voyage.js. Rebuild with: see voyage/README.md
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { makeSky, makeStars } from './sky.js';
import { makeOcean, makeWaterfall, makeMist } from './ocean.js';
import { makeIsland } from './islands.js';
import { shipMaterials } from './shipmat.js';
import { Sound } from './sound.js';

const SHIP_URL = 'media/voyage/ship-v1.glb';
const L = 620;                       // length of the route (world units, -Z is forward)
const EDGE_U = 0.62;                 // where the sunset ocean ends
const EDGE_Z = -EDGE_U * L;
const COSMIC_Y = -70;                // level of the cosmic ocean
const SUN_DIR = new THREE.Vector3(-0.42, 0.075, -1).normalize();

// Islands along the route. slug = project page; null = placeholder.
const STOPS = [
  { u: 0.12, side: 1,  slug: 'ummy' },
  { u: 0.27, side: -1, slug: null },
  { u: 0.42, side: 1,  slug: null },
  { u: 0.82, side: -1, slug: null },
  { u: 0.93, side: 1,  slug: null },
];

const touch = matchMedia('(hover: none)').matches;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- route ----------
function routeY(u){
  // sea level → lift before the edge → glide down to the cosmic ocean
  const up = smooth(EDGE_U - 0.07, EDGE_U - 0.005, u) * 7;
  const down = smooth(EDGE_U + 0.0, EDGE_U + 0.13, u);
  return lerp(up, COSMIC_Y + 0.0, down) ;
}
function routePos(u, out = new THREE.Vector3()){
  const x = 16 * Math.sin(u * Math.PI * 3.2) + 6 * Math.sin(u * Math.PI * 7.1);
  return out.set(x, routeY(u), -u * L);
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function routeDir(u, out = new THREE.Vector3()){
  routePos(Math.max(0, u - 0.002), _a); routePos(Math.min(1, u + 0.002), _b);
  return out.subVectors(_b, _a).normalize();
}

export function createVoyage(root){
  const canvas = root.querySelector('canvas');
  const ui = root.querySelector('.v-ui');
  const P = window.P || [];
  const bySlug = Object.fromEntries(P.map(p => [p.slug, p]));

  let gl;
  try { gl = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' }); }
  catch (e) { root.classList.add('v-nogl'); return { enter(){}, exit(){} }; }
  const maxDpr = touch ? 1.5 : 2; let dpr = Math.min(devicePixelRatio || 1, maxDpr);
  gl.setPixelRatio(dpr); gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 0.92;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(touch ? 62 : 50, 1, 0.3, 4000);

  // ---------- world ----------
  const sky = makeSky(SUN_DIR); scene.add(sky.mesh);
  const stars = makeStars(touch ? 1400 : 2600); scene.add(stars.points);
  const oceanA = makeOcean({ segments: touch ? 110 : 180, size: 900, mode: 0, edgeZ: EDGE_Z, sunDir: SUN_DIR }); scene.add(oceanA.mesh);
  const oceanB = makeOcean({ segments: touch ? 90 : 140, size: 1400, mode: 1, edgeZ: EDGE_Z, sunDir: SUN_DIR, level: COSMIC_Y }); scene.add(oceanB.mesh);
  const fall = makeWaterfall(EDGE_Z, COSMIC_Y); scene.add(fall.mesh);
  const mist = makeMist(EDGE_Z, COSMIC_Y, touch ? 160 : 320); scene.add(mist.points);

  const sun = new THREE.DirectionalLight(0xffc89a, 2.2); sun.position.copy(SUN_DIR).multiplyScalar(100); scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xe8d6ff, 0x0a3340, 0.75); scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x8a7dff, 0.8); fill.position.set(30, 20, 40); scene.add(fill);

  // environment maps for the pearl reflections (one per world, built once)
  const pm = new THREE.PMREMGenerator(gl);
  const envScene = new THREE.Scene(); const envSky = makeSky(SUN_DIR); envScene.add(envSky.mesh);
  envSky.uniforms.uMix.value = 0; const envSunset = pm.fromScene(envScene, 0.02).texture;
  envSky.uniforms.uMix.value = 1; const envCosmic = pm.fromScene(envScene, 0.02).texture;
  scene.environment = envSunset;

  // ---------- ship ----------
  const ship = new THREE.Group(); scene.add(ship);
  const shipInner = new THREE.Group(); ship.add(shipInner);
  const mats = shipMaterials();
  let shipReady = false, onShip = () => {};
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(SHIP_URL, g => {
    const m = g.scene;
    m.traverse(o => {
      if (!o.isMesh) return;
      const n = (o.name + ' ' + (o.parent ? o.parent.name : '')).toLowerCase();
      o.material = n.includes('sail') ? mats.sail : n.includes('glow') ? mats.glow : mats.bone;
      o.frustumCulled = false;
    });
    // model: bow at -X, 10 units long → centre it and turn the bow to -Z
    m.position.x = -5; m.position.y = 0.15;
    shipInner.add(m); shipInner.rotation.y = -Math.PI / 2;
    shipReady = true; onShip();
  }, undefined, err => { console.error('AI Voyage: ship failed to load', err); root.classList.add('v-noship'); shipReady = true; onShip(); });

  // ---------- islands ----------
  const islands = STOPS.map((s, i) => {
    const p = s.slug && bySlug[s.slug];
    const isl = makeIsland({ seed: i + 1, title: p ? p.title : 'Coming soon', image: p ? `media/${p.slug}/poster.jpg` : null, cosmic: s.u > EDGE_U });
    const at = routePos(s.u), dir = routeDir(s.u);
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(s.side);
    isl.group.position.copy(at).addScaledVector(side, s.side > 0 ? 20 : 36).add(new THREE.Vector3(0, 6, 0)).addScaledVector(dir, 34);
    // face where the camera will be when the ship stops here
    const look = at.clone().addScaledVector(dir, -14).addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), 13); look.y = isl.group.position.y;
    isl.group.lookAt(look);
    scene.add(isl.group);
    // HTML label
    const el = document.createElement(s.slug ? 'a' : 'div');
    el.className = 'v-label' + (s.slug ? '' : ' soon');
    if (s.slug) { el.href = '#' + s.slug; }
    el.innerHTML = `<b>${p ? p.title : 'Coming soon'}</b><span>${p ? (p.year || '') + ' · View project →' : 'A new experiment is on its way'}</span>`;
    ui.querySelector('.v-labels').appendChild(el);
    return { ...s, ...isl, el, hover: 0 };
  });

  // progress rail
  const rail = ui.querySelector('.v-rail');
  rail.innerHTML = islands.map((s, i) => `<button type="button" style="top:${(s.u * 100).toFixed(1)}%" data-i="${i}" aria-label="Sail to ${s.slug ? (bySlug[s.slug] || {}).title : 'island ' + (i + 1)}"></button>`).join('')
    + `<i class="edge" style="top:${(EDGE_U * 100).toFixed(1)}%"></i><i class="ship"></i>`;
  const railShip = rail.querySelector('.ship');
  rail.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { target = islands[+b.dataset.i].u; idleSince = 0; } });

  // ---------- input ----------
  const qU = parseFloat(new URLSearchParams(location.search).get('vu')); // ?vu=0.5 starts there (testing)
  let target = isFinite(qU) ? qU : 0.0, prog = target, idleSince = 0, active = false, raf = 0;
  const mouse = new THREE.Vector2(0, 0), mouseS = new THREE.Vector2(0, 0); let hasMouse = false;
  const clampT = v => Math.min(1, Math.max(0, v));
  const nudge = d => { target = clampT(target + d); idleSince = performance.now(); hint(false); };
  const onWheel = e => { e.preventDefault(); const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; nudge(d * 0.00018); };
  let ty = null;
  const onTS = e => { ty = e.touches[0].clientY; };
  const onTM = e => { if (ty == null) return; const y = e.touches[0].clientY; nudge((ty - y) * 0.0006); ty = y; e.preventDefault(); };
  const onTE = () => { ty = null; };
  const onKey = e => {
    if (!active) return;
    if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); jump(1); }
    else if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); jump(-1); }
    else if (e.key === 'Escape') location.hash = '';
  };
  const jump = dir => {
    const pts = islands.map(s => s.u);
    const next = dir > 0 ? pts.find(u => u > target + 0.01) : [...pts].reverse().find(u => u < target - 0.01);
    target = next != null ? next : (dir > 0 ? 1 : 0); idleSince = 0; hint(false);
  };
  const ray = new THREE.Raycaster(); let hoverI = -1;
  const onMove = e => { hasMouse = true; mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); };
  const onClick = e => {
    if (hoverI < 0) return; const s = islands[hoverI];
    if (s.slug) location.hash = '#' + s.slug; else { s.el.classList.add('pulse'); setTimeout(() => s.el.classList.remove('pulse'), 700); }
  };

  // ---------- hint + sound ----------
  const hintEl = ui.querySelector('.v-hint');
  const hint = on => hintEl.classList.toggle('off', !on);
  const sound = new Sound(); const sBtn = ui.querySelector('.v-sound');
  sBtn.addEventListener('click', () => { const on = sound.toggle(); sBtn.setAttribute('aria-pressed', on); sBtn.querySelector('span').textContent = on ? 'Sound on' : 'Sound off'; });

  // ---------- adaptive quality ----------
  let fpsT = 0, fpsN = 0, quality = 2;
  const degrade = () => {
    if (quality === 2) { dpr = Math.max(1, dpr * 0.75); gl.setPixelRatio(dpr); resize(); }
    else if (quality === 1) { mist.points.visible = false; stars.points.material.size *= 0.8; dpr = 1; gl.setPixelRatio(1); resize(); }
    quality--;
  };

  function resize(){
    const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight;
    gl.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 66 : (touch ? 58 : 50); camera.updateProjectionMatrix();
  }

  // ---------- frame ----------
  const clock = new THREE.Clock();
  const shipPos = new THREE.Vector3(), fwd = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const camPosS = new THREE.Vector3(), camLookS = new THREE.Vector3(); let first = true;
  const tmp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function frame(){
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
    // snap to the nearest island after a pause
    if (idleSince && performance.now() - idleSince > 650) {
      idleSince = 0; let best = null, bd = 0.045;
      for (const s of islands) { const d = Math.abs(s.u - target); if (d < bd) { bd = d; best = s.u; } }
      if (best != null) target = best;
    }
    prog += (target - prog) * (1 - Math.exp(-dt * (reduce ? 8 : 2.2)));
    const u = prog, mix = smooth(EDGE_U - 0.02, EDGE_U + 0.09, u);

    // ship on the route
    routePos(u, shipPos); routeDir(u, fwd);
    const bob = reduce ? 0 : Math.sin(t * 1.1) * 0.18 + Math.sin(t * 0.63) * 0.1;
    ship.position.copy(shipPos); ship.position.y += bob;
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    const speed = (target - prog);
    ship.rotation.set(Math.asin(Math.max(-0.35, Math.min(0.35, fwd.y))) + (reduce ? 0 : Math.sin(t * 0.9) * 0.02), yaw, (reduce ? 0 : Math.sin(t * 0.7) * 0.035) - speed * 1.2, 'YXZ');

    // camera: behind and to the left so the ship sits on the right third, sun ahead-left
    mouseS.lerp(hasMouse && !touch ? mouse : mouseS.set(0, 0), 1 - Math.exp(-dt * 3));
    const fwdH = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();   // camera keeps looking at the horizon, even while the ship dives
    const right = tmp.crossVectors(fwdH, up).normalize();
    const tall = camera.aspect < 0.85;   // phones in portrait: frame the ship from straight behind
    const dip = smooth(EDGE_U - 0.01, EDGE_U + 0.06, u) * (1 - smooth(EDGE_U + 0.08, EDGE_U + 0.14, u));
    camPos.copy(shipPos).addScaledVector(fwdH, tall ? -30 : -21).addScaledVector(right, (tall ? -3.5 : -13) + mouseS.x * 1.6).add(new THREE.Vector3(0, (tall ? 7.5 : 5.6) + mouseS.y * 1.2 + dip * 4, 0));
    camLook.copy(shipPos).addScaledVector(fwdH, tall ? 12 : 18).addScaledVector(right, tall ? -1 : -5).add(new THREE.Vector3(0, 1.6 - dip * 5, 0));
    // lean towards a hovered island
    if (hoverI >= 0) camLook.lerp(islands[hoverI].group.position, 0.12);
    if (first) { camPosS.copy(camPos); camLookS.copy(camLook); first = false; }
    camPosS.lerp(camPos, 1 - Math.exp(-dt * 4)); camLookS.lerp(camLook, 1 - Math.exp(-dt * 4));
    camera.position.copy(camPosS); camera.lookAt(camLookS);

    // world look
    sky.uniforms.uMix.value = mix; sky.mesh.position.copy(camera.position);
    stars.points.position.copy(camera.position); stars.uniforms.uMix.value = mix; stars.uniforms.uTime.value = t;
    oceanA.update(t, camera.position, mix); oceanB.update(t, camera.position, mix);
    oceanA.mesh.visible = u < EDGE_U + 0.12; oceanB.mesh.visible = u > EDGE_U - 0.08;
    fall.update(t, mix); fall.mesh.visible = mist.points.visible = Math.abs(u - EDGE_U) < 0.2;
    mist.update(t);
    sun.color.setRGB(lerp(1, 0.55, mix), lerp(0.78, 0.6, mix), lerp(0.6, 1, mix)); sun.intensity = lerp(2.2, 1.3, mix);
    hemi.color.setRGB(lerp(0.91, 0.5, mix), lerp(0.84, 0.42, mix), 1); hemi.groundColor.setRGB(lerp(0.04, 0.12, mix), lerp(0.2, 0.05, mix), lerp(0.25, 0.3, mix));
    scene.environment = mix > 0.5 ? envCosmic : envSunset;
    mats.update(t, mix);

    // islands: hover + labels
    ray.setFromCamera(mouse, camera); let hi = -1;
    if (hasMouse && !touch) {
      const hits = ray.intersectObjects(islands.map(s => s.hit), false);
      if (hits.length) hi = islands.findIndex(s => s.hit === hits[0].object);
    }
    if (hi !== hoverI) { hoverI = hi; root.classList.toggle('v-hov', hi >= 0); }
    const w = root.clientWidth, h = root.clientHeight;
    for (let i = 0; i < islands.length; i++) {
      const s = islands[i];
      const near = 1 - smooth(0.035, 0.09, Math.abs(s.u - u));
      s.hover += ((i === hoverI || near > 0.85 ? 1 : 0) - s.hover) * (1 - Math.exp(-dt * 6));
      s.update(t, s.hover, mix);
      tmp.copy(s.labelAnchor).applyMatrix4(s.group.matrixWorld).project(camera);
      const vis = near > 0.05 && tmp.z < 1;
      s.el.style.opacity = vis ? Math.min(1, near * 1.4).toFixed(2) : 0;
      s.el.style.pointerEvents = vis && near > 0.5 ? 'auto' : 'none';
      if (vis) { const lw = s.el.offsetWidth || 200, lh = s.el.offsetHeight || 60;
        const lx = Math.min(w - lw / 2 - 16, Math.max(lw / 2 + 16, (tmp.x + 1) / 2 * w)), ly = Math.min(h - 16, Math.max(lh + 84, (1 - tmp.y) / 2 * h));
        s.el.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px) translate(-50%, -100%)`; }
    }
    railShip.style.top = (u * 100).toFixed(2) + '%';
    root.style.setProperty('--v-mix', mix.toFixed(3));
    sound.update(mix, u);

    gl.render(scene, camera);

    // measure for the first few seconds and lower quality if it struggles
    if (quality > 0 && clock.elapsedTime > 1.5) {
      fpsT += dt; fpsN++;
      if (fpsT > 2) { if (fpsN / fpsT < 42) degrade(); fpsT = 0; fpsN = 0; if (clock.elapsedTime > 12) quality = 0; }
    }
  }

  const vis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (active && !raf) { clock.getDelta(); frame(); } };

  return {
    enter(){
      if (active) return; active = true; root.hidden = false; resize();
      const go = () => { root.classList.add('v-ready'); if (!raf) { clock.getDelta(); frame(); } };
      shipReady ? go() : (onShip = go);
      addEventListener('resize', resize); addEventListener('keydown', onKey); document.addEventListener('visibilitychange', vis);
      canvas.addEventListener('wheel', onWheel, { passive: false }); ui.addEventListener('wheel', onWheel, { passive: false });
      root.addEventListener('touchstart', onTS, { passive: true }); root.addEventListener('touchmove', onTM, { passive: false }); root.addEventListener('touchend', onTE);
      root.addEventListener('pointermove', onMove); canvas.addEventListener('click', onClick);
      if (touch) hintEl.querySelector('span').textContent = 'Swipe up to set sail';
      hint(prog < 0.01);
    },
    exit(){
      if (!active) return; active = false; root.hidden = true; cancelAnimationFrame(raf); raf = 0; sound.pause();
      removeEventListener('resize', resize); removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', vis);
      canvas.removeEventListener('wheel', onWheel); ui.removeEventListener('wheel', onWheel);
      root.removeEventListener('touchstart', onTS); root.removeEventListener('touchmove', onTM); root.removeEventListener('touchend', onTE);
      root.removeEventListener('pointermove', onMove); canvas.removeEventListener('click', onClick);
    }
  };
}
