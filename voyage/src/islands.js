import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NOISE } from './sky.js';

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
const LITE = matchMedia('(hover: none)').matches;   // phones: lighter islands
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

// ---- procedural rock surface: layered sandstone, moss/grass on top-facing ground, crevice darkening, bump detail ----
const ROCK = /* glsl */`
vec3 bumpN(vec3 p, vec3 n, float h, float k){
  vec3 sx = dFdx(p), sy = dFdy(p), r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1); vec2 dh = vec2(dFdx(h), dFdy(h)) * k;
  return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));
}`;
function rockMaterial(cosmic){
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, shared); sh.uniforms.uCos = { value: cosmic ? 1 : 0 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vObj = position; vObjN = normal;
        #ifdef USE_INSTANCING
          vObj = (instanceMatrix * vec4(position, 1.0)).xyz * 1.0 + instanceMatrix[3].xyz * 3.1; vObjN = mat3(instanceMatrix) * normal;
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj; varying vec3 vObjN; uniform vec3 uRim; uniform float uMix, uCos;' + NOISE + ROCK)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 on = normalize(vObjN);
        float big = fbm(vObj * 0.35), mid = fbm3(vObj * 1.1 + 3.0), fine = vnoise(vObj * 3.2);
        float vd = smoothstep(70.0, 12.0, length(vViewPosition));             // detail fades with distance (no shimmer)
        float crev = smoothstep(0.35, 0.62, mid);                                    // 0 in cracks
        float strata = 0.5 + 0.5 * sin(vObj.y * 3.1 + big * 5.0 + mid * 1.5);
        vec3 stoneA = mix(vec3(0.42, 0.29, 0.21), vec3(0.30, 0.25, 0.25), uCos);
        vec3 stoneB = mix(vec3(0.58, 0.44, 0.31), vec3(0.34, 0.29, 0.42), uCos);
        vec3 stone = mix(stoneA, stoneB, strata * 0.75 + fine * 0.25 * vd) * (0.74 + 0.26 * mix(1.0, crev, vd));
        stone = mix(stone, stone * vec3(0.78, 0.8, 0.95), smoothstep(0.0, -9.0, vObj.y));   // cooler, darker underneath
        float up = smoothstep(0.55, 0.85, on.y) * smoothstep(-0.5, 0.6, vObj.y + (big - 0.5) * 1.6);
        vec3 grassA = mix(vec3(0.20, 0.30, 0.09), vec3(0.10, 0.22, 0.26), uCos), grassB = mix(vec3(0.42, 0.44, 0.13), vec3(0.24, 0.16, 0.42), uCos);
        vec3 grass = mix(grassA, grassB, smoothstep(0.3, 0.75, big + fine * 0.25));
        float edge = smoothstep(0.35, 0.6, up + (mid - 0.5) * 0.6);              // ragged grass edge with drips of moss
        diffuseColor.rgb = mix(stone, grass, edge) * mix(vec3(1.0), diffuseColor.rgb, 0.85);
        float bumpH = mid * 0.9 + fine * 0.25 + strata * 0.25 * (1.0 - edge);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.92, 0.78, edge) - fine * 0.08;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = bumpN(-vViewPosition, normal, bumpH, mix(0.9, 0.35, edge) * vd);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += uRim * fr * 0.16;
        totalEmissiveRadiance += vec3(0.3, 0.45, 1.0) * uCos * (1.0 - smoothstep(0.3, 0.36, mid)) * smoothstep(0.0, -6.0, vObj.y) * 0.5 * vd; // faint veins glowing in the cosmos`);
  };
  return m;
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
  let g = new THREE.IcosahedronGeometry(1, LITE ? 5 : 6); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
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
    // vertex colour = ambient occlusion only (albedo is procedural in the shader)
    const under = v.y < -0.2 ? Math.min(1, (-v.y - 0.2) * 1.4) : 0;
    const ao = Math.min(1, (0.6 + n2 * 0.6) * (1 - under * 0.45));
    col.set([ao, ao, ao], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}

let leafTex = null;
function leafTexture(){
  if (leafTex) return leafTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d');
  x.clearRect(0, 0, 64, 256);
  for (let i = 0; i < 26; i++) {                         // leaflets along a central rib
    const y = 12 + i * 9, len = 28 * Math.sin(Math.PI * (0.15 + 0.85 * i / 26)) + 4;
    x.fillStyle = `rgb(${200 + Math.random() * 40 | 0},${220 + Math.random() * 30 | 0},${150 + Math.random() * 30 | 0})`;
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(32, y); x.quadraticCurveTo(32 + s * len * 0.6, y + 2, 32 + s * len, y + 14); x.quadraticCurveTo(32 + s * len * 0.5, y + 8, 32, y + 5); x.fill(); }
  }
  x.fillStyle = 'rgb(170,190,120)'; x.fillRect(30, 4, 4, 248);
  leafTex = new THREE.CanvasTexture(c); leafTex.colorSpace = THREE.SRGBColorSpace; return leafTex;
}
const windU = { uTime: { value: 0 } };
function swaying(mat, k){
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, windU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float h = max(position.y, 0.0) * ${k.toFixed(2)};
          transformed.x += sin(uTime * 1.7 + ip.x * 0.6 + ip.z * 0.4) * h * 0.12;
          transformed.z += cos(uTime * 1.3 + ip.z * 0.7) * h * 0.06; }`);
  };
  return mat;
}
function decorate(group, R, ground, near, cosmic, rockMat){
  if (!ground.length) return;
  const pick = () => ground[(R() * ground.length) | 0];
  const dummy = new THREE.Object3D();
  // grass tufts: three crossed tapered blades, darker at the root
  const blade = (a, h, lean) => { const g = new THREE.BufferGeometry(); const w = 0.07;
    const c = Math.cos(a), s = Math.sin(a);
    g.setAttribute('position', new THREE.Float32BufferAttribute([-w * c, 0, -w * s, w * c, 0, w * s, lean * c * 0.3 + lean * -s * 0.2, h, lean * s * 0.3], 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute([0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 1, 1, 1], 3)); g.computeVertexNormals(); return g; };
  const tuftGeo = mergeGeometries([0, 1, 2, 3, 4].map(i => blade(i * 1.25, 0.55 + (i % 3) * 0.18, (i % 2 ? 1 : -1) * 0.12)));
  tuftGeo.getAttribute('normal').array.fill(0).forEach((_, i, arr) => { if (i % 3 === 1) arr[i] = 1; });   // lit like the ground
  const grassCol = cosmic ? 0x34507a : 0x7f9a34;
  const grass = new THREE.InstancedMesh(tuftGeo, swaying(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), 1), LITE ? 220 : 520);
  for (let i = 0; i < grass.count; i++) {
    const p = pick(); dummy.position.set(p.x + (R() - .5) * 0.5, p.y - 0.05, p.z + (R() - .5) * 0.5);
    dummy.rotation.set(0, R() * 6.28, 0); const k = 0.7 + R() * 1.1; dummy.scale.set(k, k * (0.8 + R() * 0.6), k); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
    const tint = new THREE.Color(grassCol).multiplyScalar(0.75 + R() * 0.5); grass.setColorAt(i, tint);
  }
  grass.receiveShadow = true; group.add(grass);

  // boulders around the rim and a few loose stones
  let bg = new THREE.IcosahedronGeometry(1, 3); bg.deleteAttribute('uv'); bg.deleteAttribute('normal'); bg = mergeVertices(bg);
  { const P = bg.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); const n = fbm(v.x * 1.7, v.y * 1.7, v.z * 1.7, 3); v.multiplyScalar(0.75 + n * 0.55); v.y *= 0.7; P.setXYZ(i, v.x, v.y, v.z); }
    bg.computeVertexNormals(); bg.setAttribute('color', new THREE.Float32BufferAttribute(new Array(P.count * 3).fill(0.85), 3)); }
  const rim = ground.filter(p => Math.hypot(p.x, p.z) > 5.2);
  const boulders = new THREE.InstancedMesh(bg, rockMat, 16);
  for (let i = 0; i < boulders.count; i++) {
    const p = (rim.length && i < 11 ? rim[(R() * rim.length) | 0] : pick()); const k = i < 11 ? 0.45 + R() * 0.9 : 0.15 + R() * 0.25;
    dummy.position.set(p.x, p.y + k * 0.15, p.z); dummy.rotation.set(R() * 0.5, R() * 6.28, R() * 0.5); dummy.scale.setScalar(k); dummy.updateMatrix(); boulders.setMatrixAt(i, dummy.matrix);
  }
  boulders.castShadow = boulders.receiveShadow = true; group.add(boulders);

  if (!cosmic) {
    // palms: segmented, curving trunk + arched leaf fronds
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5038, roughness: 0.95 });
    const frondMat = swaying(new THREE.MeshStandardMaterial({ map: leafTexture(), color: 0x6f8f2c, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), 0.25);
    const spots = [[-6.2, -3.6], [5.9, -4.2], [6.6, 2.6]].slice(0, 2 + (R() < 0.6 ? 1 : 0));
    for (const [sx, sz] of spots) {
      const base = near(sx, sz); const h = 6 + R() * 2.5, lean = new THREE.Vector3((R() - .5) * 2.4, 0, (R() - .5) * 2.4).add(new THREE.Vector3(base.x, 0, base.z).normalize().multiplyScalar(1.4));
      const curve = new THREE.QuadraticBezierCurve3(base.clone().add(new THREE.Vector3(0, -0.3, 0)), base.clone().add(new THREE.Vector3(lean.x * 0.2, h * 0.55, lean.z * 0.2)), base.clone().add(new THREE.Vector3(lean.x, h, lean.z)));
      const parts = [];
      for (let k = 0; k < 14; k++) { const t0 = k / 14, t1 = (k + 1) / 14, a = curve.getPoint(t0), b = curve.getPoint(t1);
        const seg = new THREE.CylinderGeometry(0.22 - t1 * 0.08, 0.27 - t0 * 0.08, a.distanceTo(b) * 1.04, 7, 1);
        const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 0, 1)); const q = new THREE.Quaternion().setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
        seg.applyQuaternion(q); seg.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); parts.push(seg); }
      const trunk = new THREE.Mesh(mergeGeometries(parts), trunkMat); trunk.castShadow = trunk.receiveShadow = true; group.add(trunk);
      const top = curve.getPoint(1);
      for (let f = 0; f < 9; f++) {
        const g = new THREE.PlaneGeometry(1.1, 4.2, 1, 10); g.translate(0, 2.1, 0); g.rotateX(-Math.PI / 2);   // along +Z
        const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const z = P.getZ(i); P.setY(i, P.getY(i) + z * 0.35 - z * z * 0.11 + Math.abs(P.getX(i)) * 0.25); }
        g.computeVertexNormals();
        const fr = new THREE.Mesh(g, frondMat); fr.position.copy(top); fr.rotation.set(0, f / 9 * Math.PI * 2 + R() * 0.4, 0); fr.rotateX(-0.15 + R() * 0.25);
        fr.castShadow = true; group.add(fr);
      }
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), trunkMat); nut.position.copy(top).add(new THREE.Vector3(0.2, -0.35, 0.1)); group.add(nut);
    }
  } else {
    // crystal spires growing out of the cosmic ground
    const spireMat = new THREE.MeshStandardMaterial({ color: 0x7c5cff, emissive: new THREE.Color(0.5, 0.3, 1.6), emissiveIntensity: 1, roughness: 0.15, metalness: 0.2, flatShading: true, transparent: true, opacity: 0.92 });
    for (const [sx, sz] of [[-6, -3.5], [5.8, -4], [6.4, 2.4]]) {
      const b = near(sx, sz);
      for (let k = 0; k < 5; k++) { const h = 1.4 + R() * 3.2, c = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.25 + R() * 0.25, h, 6), spireMat);
        c.position.set(b.x + (R() - .5) * 1.4, b.y + h / 2 - 0.2, b.z + (R() - .5) * 1.4); c.rotation.set((R() - .5) * 0.6, R() * 6, (R() - .5) * 0.6); c.castShadow = true; group.add(c); }
    }
  }
}

export function makeIsland({ seed, title, image, cosmic }){
  const R = rnd(seed), group = new THREE.Group();
  const rockMat = rockMaterial(cosmic);
  const rockGeo = rockGeometry(seed, cosmic);
  const rock = new THREE.Mesh(rockGeo, rockMat); rock.castShadow = rock.receiveShadow = true; group.add(rock);
  // top-facing ground points to scatter grass, boulders and trees on
  const ground = [];
  { const P = rockGeo.attributes.position, N = rockGeo.attributes.normal;
    for (let i = 0; i < P.count; i++) if (N.getY(i) > 0.8 && P.getY(i) > 0.2) ground.push(new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i))); }
  const near = (x, z) => ground.reduce((b, p) => (p.x - x) ** 2 + (p.z - z) ** 2 < (b.x - x) ** 2 + (b.z - z) ** 2 ? p : b, ground[0]);
  const clear = p => !(Math.abs(p.x) < 5.4 && p.z > -1.2 && p.z < 2.2) && !(p.z < -2.2 && p.z > -3.8 && Math.abs(p.x) < 5.4); // keep the board and rope free
  decorate(group, R, ground.filter(clear), near, cosmic, rockMat);

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
  const box = (w, h, d, x, y, z, ry = 0, rz = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), woodMat); m.position.set(x, y, z); m.rotation.set(0, ry, rz); m.castShadow = m.receiveShadow = true; group.add(m); return m; };
  box(bw + 0.9, 0.45, 0.45, 0, fy + bh / 2 + 0.22, 0); box(bw + 0.9, 0.45, 0.45, 0, fy - bh / 2 - 0.22, 0);
  box(0.45, bh + 0.9, 0.45, -bw / 2 - 0.22, fy, 0); box(0.45, bh + 0.9, 0.45, bw / 2 + 0.22, fy, 0);
  box(bw, bh, 0.12, 0, fy, -0.12);
  for (const s of [-1, 1]) box(0.42, fy + bh / 2 + 1.4 - top, 0.42, s * (bw / 2 + 0.22), (fy + bh / 2 + 1.4 + top) / 2, -0.1);
  box(bw + 2.2, 0.16, 1.4, 0, fy + bh / 2 + 1.25, 0.25, 0, 0).rotation.x = -0.32;
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1a1614, metalness: 0.8, roughness: 0.45, envMapIntensity: 0.5 });
  for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.5), ironMat); b.position.set(x * (bw / 2 + 0.22), fy + y * (bh / 2 + 0.22), 0.02); group.add(b); }
  const tex = image ? tl.load(image) : soonTexture(title); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const imgMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.12, roughness: 0.6 });
  const img = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), imgMat); img.position.set(0, fy, 0.0); img.receiveShadow = true; group.add(img);

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
      shared.uMix.value = mix; windU.uTime.value = t; shared.uRim.value.setRGB(1.0 - mix * 0.5, 0.55 - mix * 0.15, 0.3 + mix * 0.7);
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
