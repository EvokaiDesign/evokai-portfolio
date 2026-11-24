// Computer-only "realistic" pieces for the islands: sculpted smooth rock with surface detail, leafy trees, grass,
// iron torches with a real shader flame and embers, and flowing waterfalls with spray. Phones keep the light low-poly versions.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';

// ---- JS noise (sculpting) ----
const h3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function vn(x, y, z){
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf), l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), l(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
           l(l(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), l(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w);
}
const fb = (x, y, z, o = 4) => { let a = .5, s = 0; for (let i = 0; i < o; i++) { s += a * vn(x, y, z); x = x * 2.07 + 1.3; y = y * 2.07 + 1.3; z = z * 2.07 + 1.3; a *= .5; } return s / (1 - Math.pow(.5, o)); };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- GLSL noise ----
export const RNOISE = /* glsl */`
float rh(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(rh(i), rh(i + vec3(1,0,0)), f.x), mix(rh(i + vec3(0,1,0)), rh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(rh(i + vec3(0,0,1)), rh(i + vec3(1,0,1)), f.x), mix(rh(i + vec3(0,1,1)), rh(i + vec3(1,1,1)), f.x), f.y), f.z); }
float rf(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a * rn(p); p = p * 2.07 + 1.3; a *= .5; } return s / 0.9375; }
`;

export const RT = { uTime: { value: 0 } };       // shared clock for wind, flames, water

// ---- surface detail on any standard material: albedo grain, procedural bump, roughness variation (object space, so it doesn't swim) ----
export function detail(mat, { scale = 1, bump = 0.4, grain = 0.25, stretch = [1, 1, 1], flow = 0, glowCracks = false, key = '' } = {}){
  const prev = mat.onBeforeCompile && mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ? mat.onBeforeCompile : null;
  mat.onBeforeCompile = (s, r) => {
    if (prev) prev(s, r);
    Object.assign(s.uniforms, RT, { uDS: { value: scale }, uDB: { value: bump }, uDG: { value: grain }, uDSt: { value: new THREE.Vector3(...stretch) }, uDF: { value: flow } });
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vLP; uniform float uDS, uDB, uDG, uDF, uTime; uniform vec3 uDSt;
        ${RNOISE}
        vec3 dPerturb(vec3 sp, vec3 sn, float hgt){ vec3 sx = dFdx(sp), sy = dFdy(sp), r1 = cross(sy, sn), r2 = cross(sn, sx); float det = dot(sx, r1);
          vec3 grad = sign(det) * (dFdx(hgt) * r1 + dFdy(hgt) * r2); return normalize(abs(det) * sn - grad); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 dq = vLP * uDSt * uDS + vec3(0.0, 0.0, uTime * uDF);
        float dn = rf(dq), dn2 = rn(dq * 7.3);
        diffuseColor.rgb *= mix(1.0 - uDG, 1.0 + uDG, dn) * (0.92 + 0.16 * dn2);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.8 + 0.4 * dn2), 0.03, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float hh = (rf(dq * 1.6) + rn(dq * 6.0) * 0.12) * uDB; normal = dPerturb(-vViewPosition, normal, hh); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${glowCracks ? 'totalEmissiveRadiance *= smoothstep(0.42, 0.72, rn(vLP * 9.0 + uTime * 0.3)) * (0.8 + 0.2 * sin(uTime * 7.0 + vLP.x * 5.0));' : ''}`);
  };
  mat.customProgramCacheKey = () => 'detail' + (prev ? '+r' : '') + (glowCracks ? '+g' : '') + key;
  return mat;
}

// ---- sculpted island body: tessellate the low-poly slab, merge, displace with noise, smooth normals, paint by slope/height ----
export function hqBody(body, pal, seed){
  let g = body.geo.clone(); g.deleteAttribute('color'); g.deleteAttribute('normal');
  g = new TessellateModifier(0.6, 8).modify(g);
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, 1e-3);
  const P = g.attributes.position, top = body.top, o = seed * 13.7;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    if (y > top - 0.2) y += (fb(x * 0.3 + o, 0, z * 0.3) - 0.5) * 0.16;                          // gentle rolling top (things still sit on it)
    else {                                                                                       // rugged sides and underside
      const n = fb(x * 0.32 + o, y * 0.32, z * 0.32), r = fb(x * 1.1 + o, y * 1.4, z * 1.1, 3);
      const s = 1 + (n - 0.5) * 0.3 + (r - 0.5) * 0.12 * sm(top - 0.4, top - 2, y); x *= s; z *= s; y += (fb(x * 0.5, y * 0.5 + o, z * 0.5, 3) - 0.5) * 0.5 * sm(top - 0.6, top - 2.5, y);
    }
    P.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  const N = g.attributes.normal, cols = new Float32Array(P.count * 3), c = new THREE.Color(), t = new THREE.Color();
  const tops = pal.top.map(h => new THREE.Color(h)), side = new THREE.Color(pal.side), soil = pal.soil.map(h => new THREE.Color(h)), deep = new THREE.Color(pal.deep), stone = new THREE.Color(pal.stone[0]);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), ny = N.getY(i), d = top - y, n = fb(x * 0.6 + o, y * 0.6, z * 0.6, 3), m = fb(x * 2.3, y * 2.3 + o, z * 2.3, 2);
    c.copy(soil[(n * 2.99) | 0]).lerp(deep, Math.min(1, Math.max(0, d / 9)) * 0.85);              // earth darkening with depth
    if (m > 0.58) c.lerp(t.copy(stone).lerp(deep, d / 14), sm(0.58, 0.7, m) * 0.8);                  // rocky patches
    c.lerp(side, sm(1.5, 0.6, d) * sm(-0.2, 0.2, d) * 0.85);                                        // the thick rim of the slab
    const gr = sm(0.35, 0.75, ny) * sm(0.6, 0.2, d);                                                   // grass on flat, high ground
    if (gr > 0) { t.copy(tops[0]).lerp(tops[1], n).lerp(tops[2], sm(0.55, 0.8, m)); t.multiplyScalar(0.85 + n * 0.3); c.lerp(t, gr); }
    cols.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

// height of the (sculpted) top surface, sampled on a grid, for placing grass
export function heightGrid(geo, R = 9, n = 64){
  const H = new Float32Array(n * n).fill(-1e9), P = geo.attributes.position, I = geo.index, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
  const cell = 2 * R / n;
  for (let f = 0; f < I.count; f += 3) {
    a.fromBufferAttribute(P, I.getX(f)); b.fromBufferAttribute(P, I.getX(f + 1)); c.fromBufferAttribute(P, I.getX(f + 2));
    fn.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize(); if (Math.abs(fn.y) < 0.6) continue;
    const x0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) + R) / cell)), x1 = Math.min(n - 1, Math.floor((Math.max(a.x, b.x, c.x) + R) / cell));
    const z0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) + R) / cell)), z1 = Math.min(n - 1, Math.floor((Math.max(a.z, b.z, c.z) + R) / cell));
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const px = -R + (ix + 0.5) * cell, pz = -R + (iz + 0.5) * cell;
      const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z); if (Math.abs(d) < 1e-9) continue;
      const l1 = ((b.z - c.z) * (px - c.x) + (c.x - b.x) * (pz - c.z)) / d, l2 = ((c.z - a.z) * (px - c.x) + (a.x - c.x) * (pz - c.z)) / d, l3 = 1 - l1 - l2;
      if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
      const y = l1 * a.y + l2 * b.y + l3 * c.y, k = ix * n + iz; if (y > H[k]) H[k] = y;
    }
  }
  return (x, z) => { const ix = Math.floor((x + R) / cell), iz = Math.floor((z + R) / cell); if (ix < 0 || iz < 0 || ix >= n || iz >= n) return null; const y = H[ix * n + iz]; return y > -1e8 ? y : null; };
}

// ---- smooth sculpted rocks ----
export function hqRock(R, col, sx, sy, sz, detailLevel = 2, floor = -0.55){
  let g = new THREE.IcosahedronGeometry(1, detailLevel); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const P = g.attributes.position, o = R() * 100, cols = new Float32Array(P.count * 3), c = new THREE.Color(), base = col.map(h => new THREE.Color(h));
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), n = fb(x * 1.2 + o, y * 1.2, z * 1.2), r = Math.abs(fb(x * 3 + o, y * 3, z * 3, 3) - 0.5);
    const k = 0.72 + n * 0.5 - r * 0.25; P.setXYZ(i, x * k * sx, Math.max(y * k, floor) * sy, z * k * sz);   // flat-ish bottom so it sits
    c.copy(base[0]).lerp(base[1 % base.length], n).lerp(base[2 % base.length], sm(0.5, 0.8, fb(x * 4, y * 4 + o, z * 4, 2))).multiplyScalar(0.85 + y * 0.12);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.computeVertexNormals(); return g;
}

// ---- leafy trees: bark tube + branches + leaf cards with rounded normals, swaying in the wind ----
let leafTex = null;
function leaves(){
  if (leafTex) return leafTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.beginPath(); x.arc(S / 2, S / 2, 12, 0, 7); x.fill();                      // solid centre (used by the canopy fill)
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 78, cx = S / 2 + Math.cos(a) * r, cy = S / 2 + Math.sin(a) * r, L = 26 + Math.random() * 20, W = L * 0.42, rot = a + (Math.random() - 0.5) * 1.2;
    const g = 170 + Math.random() * 85 | 0;
    x.save(); x.translate(cx, cy); x.rotate(rot); x.fillStyle = `rgb(${g},${g},${g})`;
    x.beginPath(); x.moveTo(-L / 2, 0); x.quadraticCurveTo(0, -W, L / 2, 0); x.quadraticCurveTo(0, W, -L / 2, 0); x.fill();
    x.strokeStyle = `rgba(0,0,0,.25)`; x.lineWidth = 1.2; x.beginPath(); x.moveTo(-L / 2, 0); x.lineTo(L / 2, 0); x.stroke(); x.restore();
  }
  leafTex = new THREE.CanvasTexture(c); leafTex.colorSpace = THREE.SRGBColorSpace; leafTex.anisotropy = 4; return leafTex;
}
export function leafMaterial(){
  const m = new THREE.MeshStandardMaterial({ map: leaves(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, metalness: 0 });
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, RT);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float w = smoothstep(1.0, 4.5, position.y); transformed += vec3(sin(uTime * 1.3 + position.x * 0.9 + position.z * 0.7), sin(uTime * 2.1 + position.y * 1.7) * 0.4, cos(uTime * 1.1 + position.z * 0.8)) * 0.05 * w; }`);
    s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * 0.12;`);                                         // light passing through the leaves
  };
  m.customProgramCacheKey = () => 'leaf';
  return m;
}
export function hqTree(R, pal, h){
  // trunk: tapered, gently bent, flared roots
  const tr = new THREE.CylinderGeometry(1, 1, h, 12, 14, false); tr.translate(0, h / 2, 0); tr.deleteAttribute('uv');
  const TP = tr.attributes.position, bend = 0.3 + R() * 0.3, bz = (R() - 0.5) * 0.3;
  for (let i = 0; i < TP.count; i++) { const y = TP.getY(i), t = y / h, r = (0.26 - 0.16 * t) * (1 + 0.7 * sm(0.14, 0, t)) * (0.92 + vn(TP.getX(i) * 3, y * 2, TP.getZ(i) * 3) * 0.16);
    TP.setXYZ(i, TP.getX(i) * r + Math.sin(t * 2.2) * bend * t, y, TP.getZ(i) * r + bz * t * t); }
  const parts = [tr];
  const canopy = new THREE.Vector3(Math.sin(2.2) * bend, h + 0.4, bz);
  for (let b = 0; b < 4; b++) {                                     // branches into the canopy
    const a = b / 4 * Math.PI * 2 + R(), t0 = 0.55 + R() * 0.25, len = 1.1 + R() * 0.7;
    const br = new THREE.CylinderGeometry(0.035, 0.08, len, 6, 1); br.deleteAttribute('uv'); br.translate(0, len / 2, 0);
    br.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), 0.9, Math.sin(a)).normalize()));
    br.translate(Math.sin(t0 * 2.2) * bend * t0, t0 * h, bz * t0 * t0); parts.push(br);
  }
  const bark = mergeGeometries(parts); bark.computeVertexNormals();
  const bc = new THREE.Color(pal.trunk), bcol = new Float32Array(bark.attributes.position.count * 3); for (let i = 0; i < bcol.length; i += 3) bcol.set([bc.r, bc.g, bc.b], i);
  bark.setAttribute('color', new THREE.BufferAttribute(bcol, 3));

  // canopy: clusters of leaf cards around a few blobs, normals point away from the canopy centre so it shades like a soft ball
  const pos = [], nor = [], col = [], uv = [], idx = []; let vi = 0;
  const leafCols = pal.leaf.map(hh => new THREE.Color(hh)), cc = new THREE.Color(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), nn = new THREE.Vector3();
  const blobs = 3 + (R() * 3 | 0), spread = 1.0 + R() * 0.3;
  for (let i = 0; i < blobs; i++) {
    const bcn = canopy.clone().add(new THREE.Vector3((R() - 0.5) * 2.2 * spread, (R() - 0.3) * 1.1, (R() - 0.5) * 2.0 * spread)), br = 0.95 + R() * 0.6;
    const cards = 40 + (R() * 16 | 0);
    for (let k = 0; k < cards; k++) {
      const u = R() * 2 - 1, a = R() * Math.PI * 2, rr = Math.sqrt(1 - u * u), d = br * (0.45 + 0.55 * Math.sqrt(R()));
      const p = bcn.clone().add(v.set(rr * Math.cos(a) * d, u * d * 0.8, rr * Math.sin(a) * d)), s = 0.75 + R() * 0.55;
      nn.copy(p).sub(canopy).normalize(); nn.y += 0.35; nn.normalize();
      q.setFromEuler(e.set(R() * 6.28, R() * 6.28, R() * 6.28));
      cc.copy(leafCols[(R() * leafCols.length) | 0]).multiplyScalar((0.7 + R() * 0.35) * (0.75 + 0.35 * Math.max(0, (p.y - canopy.y + 1.5) / 3)));
      for (const [x, y, uu, vv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
        v.set(x * s * 0.5, y * s * 0.5, 0).applyQuaternion(q).add(p); pos.push(v.x, v.y, v.z); nor.push(nn.x, nn.y, nn.z); col.push(cc.r, cc.g, cc.b); uv.push(uu, vv);
      }
      idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3); vi += 4;
    }
    // inner fill so you can't see through the middle
    const fill = new THREE.IcosahedronGeometry(br * 0.62, 2), FP = fill.attributes.position;
    cc.copy(leafCols[0]).multiplyScalar(0.42);
    for (let j = 0; j < FP.count; j++) { v.fromBufferAttribute(FP, j); nn.copy(v).normalize(); v.add(bcn); pos.push(v.x, v.y, v.z); nor.push(nn.x, nn.y, nn.z); col.push(cc.r, cc.g, cc.b); uv.push(0.5, 0.5); idx.push(vi++); }
  }
  const leavesG = new THREE.BufferGeometry();
  leavesG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); leavesG.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  leavesG.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); leavesG.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); leavesG.setIndex(idx);
  return { bark, leaves: leavesG };
}

// ---- grass tufts on the island top (instanced, swaying) ----
export function grass(heightAt, pal, R, count, avoid){
  const blade = [], bn = [], bi = []; let vi = 0;
  for (let b = 0; b < 6; b++) {
    const a = R() * Math.PI * 2, ox = (R() - 0.5) * 0.4, oz = (R() - 0.5) * 0.4, hgt = 0.16 + R() * 0.2, w = 0.04 + R() * 0.025, lean = 0.08 + R() * 0.12;
    const ca = Math.cos(a), sa = Math.sin(a);
    const P = (x, y) => { const z = lean * y * y / hgt; return [ox + x * ca + z * sa, y, oz - x * sa + z * ca]; };
    for (const [x, y] of [[-w, 0], [w, 0], [-w * 0.6, hgt * 0.5], [w * 0.6, hgt * 0.5], [0, hgt]]) { blade.push(...P(x, y)); bn.push(0, 1, 0); }
    bi.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2, vi + 2, vi + 3, vi + 4); vi += 5;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(blade, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(bn, 3)); g.setIndex(bi);
  const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, RT);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying float vGH;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGH = clamp(position.y / 0.36, 0.0, 1.0);
        { vec4 ip = instanceMatrix[3]; float k = position.y * position.y;
          transformed.x += sin(uTime * 1.7 + ip.x * 0.55 + ip.z * 0.35) * 0.35 * k; transformed.z += cos(uTime * 1.3 + ip.z * 0.5) * 0.25 * k; }`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGH;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.7, 1.18, vGH);')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');   // both sides of a blade lit like the top
  };
  m.customProgramCacheKey = () => 'grass';
  const im = new THREE.InstancedMesh(g, m, count), M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const tops = pal.top.map(hh => new THREE.Color(hh));
  let n = 0;
  for (let tries = 0; tries < count * 4 && n < count; tries++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 7.6, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (avoid(x, z)) continue; const y = heightAt(x, z); if (y == null) continue;
    q.setFromAxisAngle(p.set(0, 1, 0), R() * 6.28); const k = 0.7 + R() * 0.7; sc.set(k, k * (0.8 + R() * 0.5), k);
    M.compose(p.set(x, y - 0.03, z), q, sc); im.setMatrixAt(n, M);
    c.copy(tops[(R() * tops.length) | 0]).lerp(tops[0], 0.4).multiplyScalar(1.0 + R() * 0.25); im.setColorAt(n, c); n++;
  }
  im.count = n; im.receiveShadow = true; im.castShadow = false; im.frustumCulled = false;
  return im;
}

// ---- torch: wooden pole with iron bands, an iron brazier basket of glowing coals, a shader flame and rising embers ----
function flameMaterial(seed){
  return new THREE.ShaderMaterial({
    uniforms: { ...RT, uSeed: { value: seed }, uK: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv;
      vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
      float sx = length(modelMatrix[0].xyz), sy = length(modelMatrix[1].xyz);
      vec3 w = c + right * position.x * sx + vec3(0.0, 1.0, 0.0) * position.y * sy;      // always faces the camera, stays upright
      gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
    fragmentShader: RNOISE + `uniform float uTime, uSeed, uK; varying vec2 vUv;
      void main(){
        float y = vUv.y, x = (vUv.x - 0.5) * 2.0, t = uTime;
        float n = rf(vec3(x * 1.8, y * 2.6 - t * 2.6, uSeed + t * 0.3));
        float n2 = rf(vec3(x * 4.0, y * 6.0 - t * 4.6, uSeed * 1.7));
        float xd = x + (n - 0.5) * 1.3 * y + sin(t * 3.1 + uSeed + y * 4.0) * 0.1 * y;      // licks sideways, more at the tip
        float width = mix(0.58, 0.04, pow(y, 0.7)) * (0.8 + n2 * 0.4);
        float body = 1.0 - smoothstep(width * 0.25, width, abs(xd));
        float hgt = y + (n2 - 0.5) * 0.5 + (n - 0.5) * 0.35;
        float f = body * (1.0 - smoothstep(0.3, 0.85, hgt)) * smoothstep(0.0, 0.08, y);
        f = clamp(f * (0.55 + n2 * 0.75), 0.0, 1.0);
        vec3 col = mix(vec3(0.55, 0.05, 0.0), vec3(1.0, 0.3, 0.02), smoothstep(0.02, 0.35, f));
        col = mix(col, vec3(1.0, 0.62, 0.18), smoothstep(0.4, 0.8, f));
        col = mix(col, vec3(1.0, 0.86, 0.6), smoothstep(0.82, 1.0, f) * (1.0 - smoothstep(0.1, 0.35, y)));
        gl_FragColor = vec4(col * f * 1.7 * uK, f);
      }`
  });
}
function embers(){
  const n = 26, pos = new Float32Array(n * 3), sd = new Float32Array(n);
  for (let i = 0; i < n; i++) sd[i] = Math.random();
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.BufferAttribute(sd, 1));
  const m = new THREE.ShaderMaterial({ uniforms: { ...RT, uPx: { value: Math.min(devicePixelRatio || 1, 2) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute float aS; uniform float uTime, uPx; varying float vA;
      void main(){ float life = fract(uTime * (0.3 + aS * 0.25) + aS * 7.0);
        vec3 p = vec3(sin(aS * 40.0 + uTime * (1.0 + aS)) * 0.35 * life, life * (2.2 + aS * 1.5), cos(aS * 31.0 + uTime * 1.3) * 0.35 * life);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vA = (1.0 - life) * smoothstep(0.0, 0.08, life) * (0.6 + 0.4 * sin(uTime * 13.0 + aS * 50.0));
        gl_PointSize = uPx * (14.0 + aS * 10.0) / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(2.4, 0.9, 0.25) * a, a); }` });
  const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
}
let coalMat = null, basketMat = null;
export function hqTorch(group, x, y0, z, woodMat, ironMat, seed, R, shadows){
  const add = (g, m, px, py, pz) => { const o = new THREE.Mesh(g, m); o.position.set(px, py, pz); o.castShadow = shadows; o.receiveShadow = shadows; group.add(o); return o; };
  add(new THREE.CylinderGeometry(0.085, 0.12, 2.8, 12), woodMat, x, y0 + 1.4, z);
  for (const y of [0.35, 1.6, 2.55]) add(new THREE.TorusGeometry(0.115 - y * 0.012, 0.022, 6, 16).rotateX(Math.PI / 2), ironMat, x, y0 + y, z);
  if (!basketMat) { basketMat = detail(new THREE.MeshStandardMaterial({ color: 0x1b1715, metalness: 0.85, roughness: 0.5, side: THREE.DoubleSide }), { scale: 6, bump: 0.5, grain: 0.3, key: 'basket' });
    coalMat = detail(new THREE.MeshStandardMaterial({ color: 0x140b07, roughness: 0.95, emissive: new THREE.Color(1.0, 0.32, 0.06), emissiveIntensity: 2.2 }), { scale: 4, bump: 0.6, grain: 0.3, glowCracks: true }); }
  const prof = [[0.07, 0], [0.16, 0.05], [0.25, 0.16], [0.32, 0.3], [0.35, 0.4]].map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(prof, 14), basketMat, x, y0 + 2.72, z);
  add(new THREE.TorusGeometry(0.35, 0.025, 6, 20).rotateX(Math.PI / 2), ironMat, x, y0 + 3.12, z);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, b = new THREE.CylinderGeometry(0.016, 0.016, 0.5, 4); b.rotateZ(-0.6); b.rotateY(-a); add(b, ironMat, x + Math.cos(a) * 0.24, y0 + 2.92, z + Math.sin(a) * 0.24); }
  for (let k = 0; k < 5; k++) { const a = R() * 6.28, r = R() * 0.16, s = 0.09 + R() * 0.06; add(hqRock(R, [0x221510, 0x1a0f0b, 0x2c1a12], s, s * 0.8, s, 1), coalMat, x + Math.cos(a) * r, y0 + 3.02, z + Math.sin(a) * r).castShadow = false; }
  const fm = flameMaterial(seed), fg = new THREE.PlaneGeometry(0.85, 1.5, 1, 1); fg.translate(0, 0.75, 0);
  const flame = new THREE.Mesh(fg, fm); flame.position.set(x, y0 + 2.98, z); flame.frustumCulled = false; flame.renderOrder = 3; group.add(flame);
  const em = embers(); em.position.set(x, y0 + 3.1, z); group.add(em);
  return { flame, mat: fm, embers: em };
}

// ---- island waterfall: flowing streaks, white water at the lip and the bottom, ragged edges, spray ----
export function hqWaterfallMat(col){
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...RT, uCol: { value: new THREE.Color(col) } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    vertexShader: `varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: RNOISE + `uniform float uTime; uniform vec3 uCol; varying vec2 vUv;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        float y = 1.0 - vUv.y, x = vUv.x;                                     // y: 0 at the lip, 1 at the bottom
        float n = rf(vec3(x * 4.0, y * 1.6 - uTime * 1.5, 1.0));
        float st = rf(vec3(x * 16.0, y * 0.9 - uTime * 2.1, 4.0));            // long vertical streaks pulled by gravity
        float fine = rn(vec3(x * 40.0, y * 3.0 - uTime * 3.4, 9.0));
        float foam = smoothstep(0.42, 0.72, st) * 0.9 + smoothstep(0.15, 0.0, y) * 0.9 + smoothstep(0.45, 1.0, y) * smoothstep(0.3, 0.65, n) + smoothstep(0.6, 0.95, fine) * 0.35;
        foam = clamp(foam, 0.0, 1.0);
        vec3 c = mix(uCol * 0.6 + vec3(0.02, 0.06, 0.08), vec3(0.95, 1.0, 1.0) * 1.2, foam) * (0.85 + 0.3 * n);
        float edge = smoothstep(0.0, 0.16 + n * 0.18, x) * smoothstep(1.0, 0.84 - n * 0.18, x);
        float a = edge * (0.55 + 0.45 * foam) * (1.0 - smoothstep(0.7, 1.0, y + (n - 0.5) * 0.35));
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
}
export function spray(col){
  const n = 60, pos = new Float32Array(n * 3), sd = new Float32Array(n); for (let i = 0; i < n; i++) sd[i] = Math.random();
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.BufferAttribute(sd, 1));
  const m = new THREE.ShaderMaterial({ uniforms: { ...RT, uPx: { value: Math.min(devicePixelRatio || 1, 2) }, uCol: { value: new THREE.Color(col).lerp(new THREE.Color(1, 1, 1), 0.6) } }, transparent: true, depthWrite: false, fog: false,
    vertexShader: `attribute float aS; uniform float uTime, uPx; varying float vA;
      void main(){ float life = fract(uTime * (0.5 + aS * 0.4) + aS * 9.0); float a = aS * 40.0;
        vec3 p = vec3(cos(a) * (0.3 + life * 1.6), life * (1.2 - life) * 2.2 - life * 1.2, sin(a) * (0.3 + life * 1.6));
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vA = (1.0 - life) * 0.55;
        gl_PointSize = uPx * (30.0 + aS * 50.0) * (0.5 + life) / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uCol; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a * vA; gl_FragColor = vec4(uCol, a); }` });
  const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
}

// ---- banner flags: swallowtail cloth in the island's colours with the Evokai figure, rippling in the wind ----
let logoImg = null;
function bannerTexture(base, trim, hq){
  const W = hq ? 512 : 256, H = W * 0.62, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const cut = () => { x.beginPath(); x.moveTo(0, 0); x.lineTo(W, 0); x.lineTo(W * 0.8, H / 2); x.lineTo(W, H); x.lineTo(0, H); x.closePath(); };   // swallowtail
  const draw = () => {
    x.clearRect(0, 0, W, H); x.save(); cut(); x.clip();
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, base); g.addColorStop(1, shade(base, 0.7)); x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < W * 1.5; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`; x.fillRect(Math.random() * W, 0, 1, H); }   // woven threads
    x.strokeStyle = trim; x.lineWidth = W * 0.035; cut(); x.stroke();                                                      // trim along the edges
    x.fillStyle = trim; x.fillRect(0, 0, W * 0.06, H);                                                                    // sleeve around the pole
    if (logoImg && logoImg.complete && logoImg.naturalWidth) {                                                             // the Evokai figure from the logo
      const sx = logoImg.naturalWidth * 0.82, sw = logoImg.naturalWidth - sx, sh = logoImg.naturalHeight, h = H * 0.66, w = h * sw / sh;
      x.globalAlpha = 0.95; x.drawImage(logoImg, sx, 0, sw, sh, W * 0.38 - w / 2, H / 2 - h / 2, w, h); x.globalAlpha = 1;
    }
    x.restore();
  };
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (!logoImg) { logoImg = new Image(); logoImg.src = 'media/logo-small.png'; }
  draw(); if (!logoImg.complete) logoImg.addEventListener('load', () => { draw(); t.needsUpdate = true; });
  return t;
}
const shade = (hex, k) => { const c = new THREE.Color(hex).multiplyScalar(k); return '#' + c.getHexString(); };
let poleMat = null;
export function makeFlag({ base, trim, hq, phase = 0, w = 2.3, h = 1.4, pole = 3.0 }){
  const grp = new THREE.Group();
  if (!poleMat) poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2220, metalness: 0.7, roughness: 0.4 });
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, pole, hq ? 10 : 6), poleMat); p.position.y = pole / 2; grp.add(p);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, hq ? 10 : 6), new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.9, roughness: 0.3 })); tip.position.y = pole + 0.14; grp.add(tip);
  const g = new THREE.PlaneGeometry(w, h, hq ? 28 : 10, hq ? 12 : 4); g.translate(w / 2 + 0.05, -h / 2, 0);
  const m = new THREE.MeshStandardMaterial({ map: bannerTexture(base, trim, hq), side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.8, metalness: 0 });
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, RT, { uW: { value: w }, uPh: { value: phase } });
    const wave = `uniform float uTime, uW, uPh;
      // travelling ripple, stronger towards the free end; returns the sideways offset
      float clothZ(vec2 p){ float k = clamp((p.x - 0.05) / uW, 0.0, 1.0); float t = uTime + uPh; p *= 1.7 / uW;
        return (sin(p.x * 3.2 - t * 4.2 + p.y * 0.8) * 0.16 + sin(p.x * 6.1 - t * 6.3 - p.y * 1.7) * 0.05) * k * (0.4 + 0.6 * k); }`;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + wave)
      .replace('#include <beginnormal_vertex>', `float cz = clothZ(position.xy), e = 0.02;
        vec3 objectNormal = normalize(vec3(-(clothZ(position.xy + vec2(e, 0.0)) - cz) / e, -(clothZ(position.xy + vec2(0.0, e)) - cz) / e, 1.0));
        #ifdef USE_TANGENT
        vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position); transformed.z += cz;
        transformed.y -= pow(clamp((position.x - 0.05) / uW, 0.0, 1.0), 2.0) * 0.12;      // the free end droops a little`);
    s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * 0.18;`);                                   // light glowing through the cloth
  };
  m.customProgramCacheKey = () => 'flag';
  const cloth = new THREE.Mesh(g, m); cloth.position.y = pole - 0.06; grp.add(cloth);
  return grp;
}
