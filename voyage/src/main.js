// AI Voyage — scroll from island to island: sunset ocean → edge of the world → floating through a cosmic aura.
// Source for voyage/voyage.js. Rebuild: see voyage/README.md
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { makeSky, makeStars, makeGalaxies } from './sky.js';
import { makeOcean, makeWaterfall, makeAura, makeMotes } from './ocean.js';
import { makeIsland } from './islands.js';
import { shipMaterials } from './shipmat.js';
import { makePost } from './post.js';
import { Sound } from './sound.js';

const SHIP_URL = 'media/voyage/ship-v1.glb';
const L = 620;                       // length of the route (world units, -Z is forward)
const EDGE_U = 0.62;                 // where the sunset ocean ends
const EDGE_Z = -EDGE_U * L;
const FLY_Y = 6;                     // height the ship floats at beyond the edge
const SUN_DIR = new THREE.Vector3(-0.42, 0.075, -1).normalize();
const KEY_DIR = new THREE.Vector3(-0.5, 0.42, -1).normalize();   // light comes from the sunset side, a little higher than the disc so shapes read

// Islands along the route. slug = project page; null = placeholder.
const ISLANDS = [
  { u: 0.12, side: 1,  slug: 'ummy', theme: 'ummy' },
  { u: 0.27, side: -1, slug: 'the-gulag', theme: 'gulag' },
  { u: 0.42, side: 1,  slug: null },
  { u: 0.80, side: -1, slug: null },
  { u: 0.93, side: 1,  slug: null },
];
// every scroll step moves to the next stop: start, islands, and the edge of the world
const STOPS = [{ u: 0 }, ...ISLANDS.map((s, i) => ({ u: s.u, island: i })), { u: EDGE_U + 0.004, edge: true }].sort((a, b) => a.u - b.u);

const touch = matchMedia('(hover: none)').matches;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// cubic-bezier(0.65, 0, 0.35, 1) — ease in and out
function bezier(x1, y1, x2, y2){
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t, dX = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => { let t = x; for (let i = 0; i < 6; i++) { const e = X(t) - x, d = dX(t); if (Math.abs(e) < 1e-5 || !d) break; t -= e / d; } return Y(Math.min(1, Math.max(0, t))); };
}
const ease = bezier(0.65, 0, 0.35, 1);

// ---------- route ----------
function routeY(u){
  const lift = smooth(EDGE_U - 0.08, EDGE_U - 0.004, u) * FLY_Y;
  const drift = smooth(EDGE_U, EDGE_U + 0.06, u) * Math.sin(u * 46) * 1.1;     // gentle floating beyond the edge
  return lift + drift;
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
  try { gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); }
  catch (e) { root.classList.add('v-nogl'); return { enter(){}, exit(){} }; }
  const maxDpr = touch ? 1 : 1.75; let dpr = Math.min(devicePixelRatio || 1, maxDpr);   // phones render at 1× — the biggest single saving
  gl.setPixelRatio(dpr); gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 0.95;
  if (!touch) { gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFShadowMap; }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 4000);
  scene.fog = new THREE.FogExp2(0xe8946a, 0.0022);

  // ---------- world ----------
  const sky = makeSky(SUN_DIR); scene.add(sky.mesh);
  const stars = makeStars(touch ? 1400 : 5200); scene.add(stars.points);
  const galaxies = makeGalaxies(touch ? 5 : 11); scene.add(galaxies.group);
  const ocean = makeOcean({ rings: touch ? 72 : 150, segs: touch ? 120 : 288, edgeZ: EDGE_Z, sunDir: SUN_DIR }); scene.add(ocean.mesh);
  const fall = makeWaterfall(EDGE_Z, 150); scene.add(fall.mesh);
  const aura = makeAura(EDGE_Z, -L, touch ? 22 : 70); scene.add(aura.group);
  const motes = makeMotes(touch ? 140 : 520); scene.add(motes.points);

  const sun = new THREE.DirectionalLight(0xffc49a, 2.4); sun.position.copy(KEY_DIR).multiplyScalar(100); scene.add(sun); scene.add(sun.target);
  if (!touch) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = sc.bottom = -38; sc.right = sc.top = 38; sc.near = 1; sc.far = 260;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3; }
  const hemi = new THREE.HemisphereLight(0xe8d6ff, 0x0a3340, 0.7); scene.add(hemi);
  const back = new THREE.DirectionalLight(0x9a7dff, 0.9); back.position.set(40, 25, 60); scene.add(back);
  const engineLight = new THREE.PointLight(0xff7a2a, 22, 14, 2);
  const islandLight = new THREE.PointLight(0xffa050, 0, 26, 2); scene.add(islandLight);

  // environment maps for the pearl reflections (one per world, built once)
  const pm = new THREE.PMREMGenerator(gl);
  const envScene = new THREE.Scene(); const envSky = makeSky(SUN_DIR); envScene.add(envSky.mesh);
  envSky.uniforms.uMix.value = 0; const envSunset = pm.fromScene(envScene, 0.02).texture;
  envSky.uniforms.uMix.value = 1; const envCosmic = pm.fromScene(envScene, 0.02).texture;
  scene.environment = envSunset;

  const post = makePost(gl, scene, camera, { mobile: touch });

  // ---------- loading screen: water rises with real progress (12% = code downloaded, then models/textures, then shader warm-up) ----------
  const loadEl = root.querySelector('.v-load'), portEl = loadEl.querySelector('.v-port'), pctEl = loadEl.querySelector('.v-pct b');
  portEl.dataset.own = 1;
  let shownP = parseFloat(pctEl.textContent) || 0, glbFrac = 0, items = [0, 0], loadState = 'loading';
  const setP = p => { p = Math.max(shownP, Math.min(100, p)); shownP = p; portEl.style.setProperty('--p', p.toFixed(1)); pctEl.textContent = p | 0; };
  const upd = () => setP(12 + 78 * (0.65 * glbFrac + 0.35 * (items[1] ? items[0] / items[1] : 0)));
  THREE.DefaultLoadingManager.onProgress = (url, l, t) => { items = [l, t]; upd(); };
  const creep = setInterval(() => { if (loadState !== 'loading') return clearInterval(creep); if (!glbFrac) setP(shownP + (60 - shownP) * 0.03); }, 200);   // keeps moving if sizes are unknown
  if (touch) { loadEl.querySelector('.v-how1').textContent = 'Swipe up to set sail'; loadEl.querySelector('.v-how2').textContent = 'Swipe down to sail back'; }
  const dismiss = () => { if (loadState !== 'loaded') return; loadState = 'done'; root.classList.add('v-ready'); hint(stop === 0 && !anim); };
  for (const ev of ['wheel', 'pointerdown', 'touchstart']) loadEl.addEventListener(ev, e => { if (ev === 'wheel') e.preventDefault(); dismiss(); }, { passive: ev !== 'wheel' });

  // ---------- ship ----------
  const ship = new THREE.Group(); scene.add(ship);
  const shipInner = new THREE.Group(); ship.add(shipInner);
  engineLight.position.set(0, 0.9, 5.2); ship.add(engineLight);
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
    m.position.x = -5; m.position.y = 0.15;            // model: bow at -X, 10 units long → centre it…
    shipInner.add(m); shipInner.rotation.y = -Math.PI / 2; // …and turn the bow to -Z
    shipReady = true; onShip();
  }, e => { if (e.total) { glbFrac = e.loaded / e.total; upd(); } }, err => { console.error('AI Voyage: ship failed to load', err); root.classList.add('v-noship'); shipReady = true; onShip(); });

  // ---------- islands ----------
  const islands = ISLANDS.map((s, i) => {
    const p = s.slug && bySlug[s.slug];
    const isl = makeIsland({ seed: i + 1, title: p ? p.title : 'Coming soon', image: p ? `media/${p.slug}/poster.jpg` : null, cosmic: s.u > EDGE_U, shadows: !touch, theme: s.theme });
    const at = routePos(s.u), dir = routeDir(s.u);
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(s.side);
    isl.group.position.copy(at).addScaledVector(side, s.side > 0 ? 26 : 34).add(new THREE.Vector3(0, s.u > EDGE_U ? 3 : 5, 0)).addScaledVector(dir, 6);   // beside the stop, so it works sailing either way
    const look = at.clone(); look.y = isl.group.position.y;   // board faces the route
    isl.group.lookAt(look);
    scene.add(isl.group); isl.group.updateMatrixWorld(true);
    const el = document.createElement(s.slug ? 'a' : 'div');
    el.className = 'v-label' + (s.slug ? '' : ' soon');
    if (s.slug) el.href = '#' + s.slug;
    el.innerHTML = `<b>${p ? p.title : 'Coming soon'}</b><span>${p ? (p.year || '') + ' · View project →' : 'A new experiment is on its way'}</span>`;
    ui.querySelector('.v-labels').appendChild(el);
    return { ...s, ...isl, el, hover: 0, board: new THREE.Vector3() };
  });

  // progress rail: one button per stop
  const rail = ui.querySelector('.v-rail');
  rail.innerHTML = STOPS.map((s, i) => s.edge
    ? `<button type="button" class="edge" style="top:${(s.u * 100).toFixed(1)}%" data-i="${i}" aria-label="Sail to the edge of the world"></button>`
    : `<button type="button" style="top:${(s.u * 100).toFixed(1)}%" data-i="${i}" aria-label="${s.island == null ? 'Back to the start' : 'Sail to ' + (ISLANDS[s.island].slug ? (bySlug[ISLANDS[s.island].slug] || {}).title : 'island ' + (s.island + 1))}"></button>`).join('')
    + `<i class="ship"></i>`;
  const railShip = rail.querySelector('.ship'), railBtns = [...rail.querySelectorAll('button')]; let railStop = -1;
  rail.addEventListener('click', e => { const b = e.target.closest('button'); if (b) goTo(+b.dataset.i); });
  const cap = ui.querySelector('.v-cap');

  // ---------- stop-to-stop travel ----------
  const qU = parseFloat(new URLSearchParams(location.search).get('vu'));
  const SNAP = new URLSearchParams(location.search).has('vsnap'); // ?vu=0.5 starts there (testing)
  let stop = isFinite(qU) ? STOPS.reduce((b, s, i) => Math.abs(s.u - qU) < Math.abs(STOPS[b].u - qU) ? i : b, 0) : 0;
  let prog = STOPS[stop].u, anim = null, arrived = performance.now(), inspect = 0, vel = 0;
  // the ship always sails bow-first: heading back means turning around first (face 0 = towards the edge, 1 = back home)
  let face = 0, faceTo = 0, turnA = null;
  const TURN_MS = reduce ? 300 : 1500;
  function goTo(i){
    i = Math.max(0, Math.min(STOPS.length - 1, i)); if (i === stop && !anim) return;
    const from = prog, to = STOPS[i].u, span = Math.abs(to - from), now = performance.now();
    const crossesEdge = (from - EDGE_U) * (to - EDGE_U) < 0;
    const want = to < from ? 1 : 0; let delay = 0;
    if (want !== faceTo) { turnA = { from: face, to: want, t0: now }; faceTo = want; delay = TURN_MS * 0.72; }   // start sailing as the turn finishes
    anim = { from, to, t0: now + delay, dur: (reduce ? 600 : Math.min(5200, 1700 + span * 9000 + (crossesEdge ? 1200 : 0))) };
    stop = i; hint(false);
  }
  const step = d => { if (loadState !== 'done') { dismiss(); return; } if (anim) return; goTo(stop + d); };

  // ---------- input ----------
  const mouse = new THREE.Vector2(0, 0), mouseS = new THREE.Vector2(0, 0); let hasMouse = false;
  let acc = 0, accT = 0;
  const onWheel = e => {
    e.preventDefault(); const now = performance.now(); if (now - accT > 380) acc = 0; accT = now;
    acc += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (!anim && Math.abs(acc) > 45) { step(Math.sign(acc)); acc = 0; }
  };
  let ty = null, tAcc = 0;
  const onTS = e => { ty = e.touches[0].clientY; tAcc = 0; };
  const onTM = e => { if (ty == null) return; const y = e.touches[0].clientY; tAcc += ty - y; ty = y; e.preventDefault(); if (Math.abs(tAcc) > 50) { step(Math.sign(tAcc)); tAcc = 0; ty = null; } };
  const onTE = () => { ty = null; };
  const onKey = e => {
    if (['ArrowDown', 'PageDown', ' ', 'ArrowRight'].includes(e.key)) { e.preventDefault(); step(1); }
    else if (['ArrowUp', 'PageUp', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); step(-1); }
    else if (e.key === 'Escape') location.hash = '';
  };
  const ray = new THREE.Raycaster(); let hoverI = -1;
  const glowEl = ui.querySelector('.v-glow');
  const onMove = e => { if (!hasMouse) root.classList.remove('v-nomouse'); hasMouse = true; mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); if (glowEl) glowEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; };
  const onClick = () => {
    if (hoverI < 0) return; const s = islands[hoverI];
    if (s.slug) location.hash = '#' + s.slug; else { s.el.classList.add('pulse'); setTimeout(() => s.el.classList.remove('pulse'), 700); }
  };

  // ---------- hint + sound ----------
  const hintEl = ui.querySelector('.v-hint');
  const hint = on => hintEl.classList.toggle('off', !on);
  const sound = new Sound(); const sBtn = ui.querySelector('.v-sound');
  sBtn.addEventListener('click', () => { const on = sound.toggle(); sBtn.setAttribute('aria-pressed', on); sBtn.querySelector('span').textContent = on ? 'Sound on' : 'Sound off'; });

  // ---------- adaptive quality ----------
  let fpsT = 0, fpsN = 0, quality = touch ? 3 : 2;
  const degrade = () => {
    if (touch) {                                       // phones: drop resolution further, then the extras
      if (quality === 3) { dpr = 0.85; motes.points.visible = false; galaxies.group.visible = false; }
      else if (quality === 2) { dpr = 0.7; stars.points.visible = false; aura.group.visible = false; }
      else if (quality === 1) { dpr = 0.55; fall.mesh.visible = false; }
    } else if (quality === 2) { dpr = Math.max(1, dpr * 0.75); post.lower(); }
    else if (quality === 1) { post.noBloom(); motes.points.visible = false; dpr = 1; }
    quality--; resize();
  };
  // ?vfps: small live readout (frames per second + quality level) for testing on a real phone
  const fpsEl = new URLSearchParams(location.search).has('vfps') ? Object.assign(document.createElement('div'), { style: 'position:absolute;left:8px;top:8px;z-index:9;font:12px/1.3 monospace;color:#fff;background:rgba(0,0,0,.6);padding:4px 8px;border-radius:6px;pointer-events:none' }) : null;
  if (fpsEl) root.appendChild(fpsEl);
  let fpsShowT = 0, fpsShowN = 0;
  let lastDraw = 0;                                    // phones: never draw faster than 60 fps (120 Hz screens would double the work and the heat)
  let W = 1, H = 1;
  function resize(){
    W = root.clientWidth || innerWidth; H = root.clientHeight || innerHeight;
    gl.setPixelRatio(dpr); gl.setSize(W, H, false); post.setSize(W, H, dpr);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  }

  // ---------- frame ----------
  const clock = new THREE.Clock();
  const shipPos = new THREE.Vector3(), fwd = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const camPosS = new THREE.Vector3(), camLookS = new THREE.Vector3(); let first = true, first2 = true, fovS = 50;
  const tmp = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), fogA = new THREE.Color(0xe39a74), fogB = new THREE.Color(0x1c0f33);
  let raf = 0, active = false, lastU = prog, wasMoving = false, lastMix = -1;
  function frame(){
    raf = requestAnimationFrame(frame);
    if (touch) { const n = performance.now(); if (n - lastDraw < 15.5) return; lastDraw = n; }
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime, now = performance.now();
    if (turnA) { const k = Math.min(1, (now - turnA.t0) / TURN_MS); face = lerp(turnA.from, turnA.to, ease(k)); if (k >= 1) turnA = null; }
    if (anim) {
      const k = Math.min(1, Math.max(0, now - anim.t0) / anim.dur); prog = lerp(anim.from, anim.to, ease(k));
      if (k >= 1) { anim = null; arrived = now; }
    }
    vel = lerp(vel, (prog - lastU) / Math.max(dt, 1e-3), 1 - Math.exp(-dt * 6)); lastU = prog;
    const u = prog, mix = smooth(EDGE_U - 0.015, EDGE_U + 0.1, u);
    const st = STOPS[stop];
    const wantInspect = !anim && st.island != null ? 1 : 0;
    inspect += (wantInspect - inspect) * (1 - Math.exp(-dt * (wantInspect ? 9 : 5)));   // snappy zoom on arrival (~0.5 s)
    if (SNAP) { inspect = wantInspect; first = true; }                 // ?vsnap: settle instantly (headless tests)
    const insp = ease(Math.min(1, Math.max(0, inspect)));

    // ship on the route
    routePos(u, shipPos); routeDir(u, fwd);
    const bob = reduce ? 0 : Math.sin(t * 1.1) * 0.16 + Math.sin(t * 0.63) * 0.09;
    ship.position.copy(shipPos); ship.position.y += bob;
    const fc = Math.cos(face * Math.PI), swing = Math.sin(face * Math.PI);           // 1 → -1 while turning; swing peaks mid-turn
    const yaw = Math.atan2(-fwd.x, -fwd.z) + face * Math.PI;
    const turn = (routeDir(Math.min(1, u + 0.01), tmp).x - fwd.x) * 30;     // bank into the curves
    ship.position.addScaledVector(tmp.set(-fwd.z, 0, fwd.x), swing * 2.2);         // turns in a small arc, not on the spot
    ship.rotation.set(Math.asin(Math.max(-0.3, Math.min(0.3, fwd.y))) * 0.8 * fc + (reduce ? 0 : Math.sin(t * 0.9) * 0.02), yaw,
      (reduce ? 0 : Math.sin(t * 0.7) * 0.035) - THREE.MathUtils.clamp(turn * vel * 3 * fc, -0.25, 0.25) - swing * 0.2, 'YXZ');

    // follow camera: behind and to the left, ship on the right third
    mouseS.lerp(hasMouse && !touch ? mouse : tmp.set(0, 0, 0), 1 - Math.exp(-dt * 3));
    const fwdH = new THREE.Vector3(fwd.x, 0, fwd.z).normalize().applyAxisAngle(up, face * Math.PI);   // camera swings round with the ship
    right.crossVectors(fwdH, up).normalize();
    const tall = camera.aspect < 0.85;
    const dip = smooth(EDGE_U - 0.02, EDGE_U + 0.01, u) * (1 - smooth(EDGE_U + 0.04, EDGE_U + 0.1, u));
    camPos.copy(shipPos).addScaledVector(fwdH, tall ? -30 : -21).addScaledVector(right, (tall ? -3.5 : -13) + mouseS.x * 1.6)
      .add(tmp.set(0, (tall ? 7.5 : 5.6) + mouseS.y * 1.2 + dip * 5, 0));
    camLook.copy(shipPos).addScaledVector(fwdH, tall ? 12 : 18).addScaledVector(right, tall ? -1 : -5).add(tmp.set(0, 3.4 - dip * 7.5, 0));   // a touch more sky so the dusk stars show

    // inspect view: ease in towards the island's notice board, slow drift
    if (st.island != null && insp > 0.001) {
      const isl = islands[st.island];
      isl.board.copy(isl.boardCenter).applyMatrix4(isl.group.matrixWorld);
      // stand between the board and the ship (ship stays behind the camera, never in the shot)
      const toShip = shipPos.clone().sub(isl.board).setY(0); const sd = toShip.length(); toShip.normalize();
      const away = toShip.applyAxisAngle(up, -0.5 * isl.side * (face > 0.5 ? -1 : 1)).normalize();
      const ip = isl.board.clone().addScaledVector(away, tall ? 34 : 26).add(tmp.set(0, 4.2, 0)).addScaledVector(right, Math.sin(t * 0.22) * 0.8);
      camPos.lerp(ip, insp); camLook.lerp(isl.board, insp * 0.96);
    }
    if (hoverI >= 0 && !anim) camLook.lerp(islands[hoverI].board.lengthSq() ? islands[hoverI].board : islands[hoverI].group.position, 0.1);
    if (first) { camPosS.copy(camPos); camLookS.copy(camLook); first = false; }
    const camK = 3.5 + insp * 5; camPosS.lerp(camPos, 1 - Math.exp(-dt * camK)); camLookS.lerp(camLook, 1 - Math.exp(-dt * camK));   // camera follows faster while zooming in
    if (insp < 0.5) {                                                  // while swinging round, never cut through the ship or dip low
      tmp.copy(camPosS).sub(ship.position); tmp.y = 0; const dd = tmp.length(), minD = tall ? 22 : 17;
      if (dd < minD) camPosS.addScaledVector(tmp.normalize(), minD - dd);
      camPosS.y = Math.max(camPosS.y, ship.position.y + (tall ? 5 : 3.8));
    }
    camera.position.copy(camPosS); camera.lookAt(camLookS);
    const baseFov = tall ? 62 : (touch ? 56 : 48);
    fovS = lerp(fovS, baseFov - insp * 7 + Math.min(1, Math.abs(vel) * 6) * 4, 1 - Math.exp(-dt * 3));
    camera.fov = fovS; camera.updateProjectionMatrix();

    // world look
    sky.uniforms.uMix.value = mix; sky.uniforms.uTime.value = t; sky.mesh.position.copy(camera.position);
    stars.points.position.copy(camera.position); stars.uniforms.uMix.value = mix; stars.uniforms.uTime.value = t;
    galaxies.update(camera.position, mix);
    ocean.mesh.visible = u < EDGE_U + 0.14;
    ocean.update(t, camera.position, mix, ship.position, yaw, (0.2 + Math.min(0.8, Math.abs(vel) * 18 + swing * 0.5)) * (1 - smooth(0.3, 2.5, ship.position.y)));
    const nearEdge = Math.abs(u - EDGE_U) < 0.22;
    fall.mesh.visible = nearEdge; fall.update(t, mix);
    aura.group.visible = u > EDGE_U - 0.2;                                   // nebula only near and past the edge
    if (aura.group.visible) aura.update(t, camera.position, mix, nearEdge); motes.update(t, camera.position, mix);
    scene.fog.color.copy(fogA).lerp(fogB, mix); scene.fog.density = lerp(0.0022, 0.0016, mix);
    sun.color.setRGB(lerp(1, 0.6, mix), lerp(0.77, 0.55, mix), lerp(0.6, 1, mix)); sun.intensity = lerp(2.4, 1.2, mix);
    hemi.color.setRGB(lerp(0.91, 0.5, mix), lerp(0.84, 0.42, mix), 1); hemi.groundColor.setRGB(lerp(0.04, 0.12, mix), lerp(0.16, 0.04, mix), lerp(0.22, 0.25, mix));
    back.intensity = lerp(0.7, 1.1, mix);
    engineLight.color.setRGB(lerp(1, 0.35, mix), lerp(0.48, 0.6, mix), lerp(0.16, 1, mix));
    scene.environment = mix > 0.5 ? envCosmic : envSunset;
    mats.update(t, mix);

    // islands: hover, labels, torchlight on the nearest board
    ray.setFromCamera(mouse, camera); let hi = -1;
    if (hasMouse && !touch && !anim) {
      const hits = ray.intersectObjects(islands.map(s => s.hit), false);
      if (hits.length) hi = islands.findIndex(s => s.hit === hits[0].object);
    }
    if (hi !== hoverI) { hoverI = hi; root.classList.toggle('v-hov', hi >= 0); }
    let nearest = null, nd = 1;
    for (let i = 0; i < islands.length; i++) {
      const s = islands[i];
      const near = 1 - smooth(0.03, 0.09, Math.abs(s.u - u));
      if (Math.abs(s.u - u) < nd) { nd = Math.abs(s.u - u); nearest = s; }
      const focus = (st.island === i ? insp : 0);
      s.hover += ((i === hoverI ? 1 : focus) - s.hover) * (1 - Math.exp(-dt * 6));
      s.update(t, s.hover, mix);
      tmp.copy(s.labelAnchor).applyMatrix4(s.group.matrixWorld).project(camera);
      const vis = near > 0.05 && tmp.z < 1;
      s.el.style.opacity = vis ? Math.min(1, near * 1.4 * (0.35 + focus * 0.65 + (i === hoverI ? 0.65 : 0))).toFixed(2) : 0;
      s.el.style.pointerEvents = vis && near > 0.5 ? 'auto' : 'none';
      if (vis) { const lw = s.el.offsetWidth || 200, lh = s.el.offsetHeight || 60;
        const lx = Math.min(W - lw / 2 - 16, Math.max(lw / 2 + 16, (tmp.x + 1) / 2 * W)), ly = Math.min(H - 16, Math.max(lh + 84, (1 - tmp.y) / 2 * H));
        s.el.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px) translate(-50%, -100%)`; }
    }
    if (nearest && !touch) { const f = nd < 0.06 ? nearest.group.position : ship.position;
      sun.target.position.lerp(f, first2 ? 1 : 1 - Math.exp(-dt * 4)); first2 = false; sun.position.copy(sun.target.position).addScaledVector(KEY_DIR, 120); }
    if (nearest) { nearest.group.localToWorld(islandLight.position.set(0, 4.5, 5)); islandLight.intensity = (0.35 + nearest.hover) * 45 * (1 - smooth(0.04, 0.1, nd)); islandLight.color.setRGB(1, lerp(0.62, 0.5, mix), lerp(0.3, 0.6, mix)); }
    cap.classList.toggle('on', !anim && !!st.edge);
    const moving = !!anim || Math.abs(vel) > 0.004; if (moving !== wasMoving) { wasMoving = moving; root.classList.toggle('v-moving', moving); }
    if (glowEl && Math.abs(mix - lastMix) > 0.01) { lastMix = mix;
      glowEl.style.setProperty('--c1', `${lerp(255, 200, mix) | 0},${lerp(214, 190, mix) | 0},${lerp(150, 255, mix) | 0}`);
      glowEl.style.setProperty('--c2', `${lerp(255, 140, mix) | 0},${lerp(140, 90, mix) | 0},${lerp(60, 255, mix) | 0}`); }
    railShip.style.top = (u * 100).toFixed(2) + '%';
    if (railStop !== stop) { railStop = stop; railBtns.forEach((b, i) => b.toggleAttribute('aria-current', i === stop)); }
    root.style.setProperty('--v-mix', mix.toFixed(3));
    sound.update(mix, u);

    post.render(t, mix);

    if (quality > 0 && clock.elapsedTime > (touch ? 1 : 2)) {
      fpsT += dt; fpsN++;
      const win = touch ? 1.5 : 2;
      if (fpsT > win) { if (fpsN / fpsT < (touch ? 46 : 45)) degrade(); fpsT = 0; fpsN = 0; if (clock.elapsedTime > (touch ? 20 : 14)) quality = 0; }
    }
    if (fpsEl) { fpsShowT += dt; fpsShowN++; if (fpsShowT > 0.5) { fpsEl.textContent = `${Math.round(fpsShowN / fpsShowT)} fps · quality ${quality} · ${dpr.toFixed(2)}x`; fpsShowT = 0; fpsShowN = 0; } }
  }

  const vis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (active && !raf) { clock.getDelta(); frame(); } };

  return {
    enter(){
      if (active) return; active = true; root.hidden = false; resize(); if (!hasMouse) root.classList.add('v-nomouse');
      const go = async () => {
        if (loadState === 'done') { stop = 0; prog = STOPS[0].u; lastU = prog; anim = null; vel = 0; inspect = 0; arrived = performance.now(); face = faceTo = 0; turnA = null; first = true; hint(true); root.classList.add('v-ready');   /* every visit starts at the beginning */ if (!raf) { clock.getDelta(); frame(); } return; }
        if (loadState !== 'loading') return; loadState = 'warming'; glbFrac = 1; upd(); setP(90);
        if (!SNAP) try { await gl.compileAsync(scene, camera); } catch (e) {}      // compile shaders in parallel now, not on the first scroll
        if (!active) { loadState = 'loading'; return; }
        if (!raf) { clock.getDelta(); frame(); }                        // start drawing behind the loader
        await new Promise(r => setTimeout(r, 300));
        setP(100); loadState = 'loaded'; root.classList.add('v-loaded');
        setTimeout(dismiss, 2400);                                       // instructions stay up a moment, any input skips
      };
      shipReady ? go() : (onShip = go);
      addEventListener('resize', resize); addEventListener('keydown', onKey); document.addEventListener('visibilitychange', vis);
      canvas.addEventListener('wheel', onWheel, { passive: false }); ui.addEventListener('wheel', onWheel, { passive: false });
      root.addEventListener('touchstart', onTS, { passive: true }); root.addEventListener('touchmove', onTM, { passive: false }); root.addEventListener('touchend', onTE);
      root.addEventListener('pointermove', onMove); canvas.addEventListener('click', onClick);
      if (touch) hintEl.querySelector('span').textContent = 'Swipe up to set sail';
      hint(loadState === 'done' && stop === 0 && !anim);
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
