import * as THREE from 'three';

export const LITE = typeof matchMedia !== 'undefined' && (matchMedia('(hover: none)').matches || /[?&]vlite/.test(location.search));   // phones (?vlite forces the phone version on a computer, for testing)
export const LITE_DEF = LITE ? { LITE: 1 } : {};
// phones: value noise read from a small random texture (2 lookups) instead of 8 hashes per sample — same look, much cheaper
function noiseTexture(){
  const n = 256, d = new Uint8Array(n * n); let st = 20261123;
  for (let i = 0; i < d.length; i++) { st = (st * 16807) % 2147483647; d[i] = st & 255; }
  const t = new THREE.DataTexture(d, n, n, THREE.RedFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
export const NOISE_TEX = LITE ? noiseTexture() : null;
export const TEX_DEF = LITE ? { LITE: 1, TEXNOISE: 1 } : {};
export const NOISE = /* glsl */`
float hash3(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
#ifdef TEXNOISE
uniform sampler2D tNoise;
float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); vec2 u = f.xy * f.xy * (3.0 - 2.0 * f.xy);
  vec2 uv = (i.xy + u + 0.5 + i.z * vec2(37.0, 17.0)) / 256.0;
  return mix(texture2D(tNoise, uv).r, texture2D(tNoise, uv + vec2(37.0, 17.0) / 256.0).r, f.z * f.z * (3.0 - 2.0 * f.z)); }
#else
float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z); }
#endif
#if defined(TEXNOISE)
#define FBM_N 4
#define FBM3_N 3
#elif defined(LITE)
#define FBM_N 3
#define FBM3_N 2
#else
#define FBM_N 5
#define FBM3_N 3
#endif
float fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < FBM_N; i++){ s += a * vnoise(p); p = p * 2.03 + 1.7; a *= .5; } return s; }
float fbm3(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < FBM3_N; i++){ s += a * vnoise(p); p = p * 2.03 + 1.7; a *= .5; } return s * 1.14; }
`;

// shared sky colour so the ocean can reflect the same sky
export const SKYFN = /* glsl */`
vec3 sunsetSky(vec3 d, vec3 sun){
  float e = max(d.y, 0.0);
  vec3 c = vec3(1.0, 0.72, 0.30);                                  // golden horizon
  c = mix(c, vec3(1.0, 0.42, 0.12), smoothstep(0.00, 0.05, e));    // orange
  c = mix(c, vec3(0.86, 0.24, 0.22), smoothstep(0.04, 0.10, e));   // coral / warm red
  c = mix(c, vec3(0.62, 0.24, 0.44), smoothstep(0.09, 0.18, e));   // dusty pink
  c = mix(c, vec3(0.28, 0.14, 0.46), smoothstep(0.13, 0.26, e));   // violet
  c = mix(c, vec3(0.03, 0.03, 0.13), smoothstep(0.22, 0.52, e));   // deep blue dusk, where the stars come out
  float az = max(dot(normalize(vec3(d.x, 0., d.z)), normalize(vec3(sun.x, 0., sun.z))), 0.0);
  c *= mix(0.78, 1.12, az);                                         // warmer towards the sun
  float s = max(dot(d, sun), 0.0);
  c += vec3(1.0, 0.55, 0.22) * (pow(s, 10.0) * 0.34 + pow(s, 90.0) * 0.55);
  c = mix(c, vec3(1.0, 0.9, 0.72) * 1.7, smoothstep(0.99955, 0.9998, s)); // sun disc (toned down: was blinding)
  return c;
}

vec3 cloudLayer(vec3 d, vec3 sun, vec3 base, float t){
  if (d.y < 0.004) return base;
  vec2 uv = d.xz / (d.y + 0.07) * 0.8 + vec2(t * 0.0035, t * 0.001);
  float n = fbm(vec3(uv * 0.85, 1.3)), n2 = fbm3(vec3(uv * 2.6 + 5.0, 2.1));
  float dens = smoothstep(0.52, 0.8, n * 0.78 + n2 * 0.32) * smoothstep(0.004, 0.05, d.y) * (1.0 - smoothstep(0.22, 0.5, d.y));
  float toSun = max(dot(normalize(vec3(d.x, 0., d.z)), normalize(vec3(sun.x, 0., sun.z))), 0.0);
  float lit = smoothstep(0.35, 0.85, n2);
  vec3 shade = mix(vec3(0.26, 0.12, 0.32), vec3(0.5, 0.2, 0.3), toSun);
  vec3 rim = mix(vec3(1.0, 0.5, 0.32), vec3(1.0, 0.8, 0.48), toSun) * (0.7 + 2.2 * pow(toSun, 8.0));
  vec3 cc = mix(shade, rim, clamp(lit * 0.75 + pow(toSun, 4.0) * 0.35, 0.0, 1.0));
  return mix(base, cc, dens * 0.92);
}
// a galactic band of dust lanes and star clouds across the sky
vec3 milkyWay(vec3 d){
  vec3 nb = normalize(vec3(0.85, 0.42, 0.28));
  float h = dot(d, nb);
  float band = exp(-h * h * 34.0), core = exp(-h * h * 140.0);
  vec3 q = d * 7.0;
  float clouds = fbm(q), lanes = fbm3(q * 2.2 + 4.0);
  float dust = smoothstep(0.45, 0.72, lanes) * exp(-h * h * 260.0);          // dark lane along the middle
  float along = 0.5 + 0.5 * dot(normalize(d - nb * h), normalize(vec3(-0.6, 0.55, -0.58)));
  vec3 col = mix(vec3(0.45, 0.55, 1.0), vec3(1.0, 0.78, 0.55), pow(along, 3.0));   // warm bulge, blue arms
  #ifdef LITE
  float grain = 0.0;
#else
  float grain = smoothstep(0.58, 0.9, fbm3(d * 34.0)) * 0.6;            // soft star clouds (the old fine noise broke into blocky specks on screen)
#endif               // unresolved star clumps
  return col * (band * (0.18 + clouds * 0.55) + core * 0.35 * along + grain * band * 0.5) * (1.0 - dust * 0.85);
}
vec3 cosmicSky(vec3 d){
  vec3 c = vec3(0.025, 0.018, 0.075);
  float n = fbm(d * 2.6 + vec3(3.1, 0.0, 1.7));
  float m = fbm(d * 5.0 - vec3(1.0, 2.0, 0.5));
  c += vec3(0.42, 0.14, 0.70) * smoothstep(0.45, 0.85, n) * 0.9;   // violet clouds
  c += vec3(0.90, 0.20, 0.62) * smoothstep(0.62, 0.95, n * m * 1.6) * 0.8; // magenta cores
  c += vec3(0.15, 0.45, 1.00) * smoothstep(0.55, 0.9, m) * 0.55;  // electric blue
  c += milkyWay(d) * 1.1;
  return c;
}
`;

// phones: the same sky, painted once into two cube textures at load (full detail), then the dome only looks them up
// bake: 1 = sunset final look (uMix 0), 2 = cosmic final look (uMix 1); written tone-mapped + sRGB, like the screen
const BAKE_OUT = /* glsl */`
vec3 bakeFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 bakeOut(vec3 c){
  c *= 0.95 / 0.6;                                                    // same exposure + ACES as the renderer
  c = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777)) * c;
  c = bakeFit(c);
  c = clamp(mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602)) * c, 0.0, 1.0);
  return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}`;
export async function bakeSky(gl, sunDir){
  const rts = [768, 512].map(n => new THREE.WebGLCubeRenderTarget(n, { type: THREE.UnsignedByteType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
  const sc = new THREE.Scene(), cam = new THREE.CubeCamera(1, 4000, rts[0]);
  const skies = [1, 2].map(part => makeSky(sunDir, { bake: part }));
  skies.forEach(s => sc.add(s.mesh)); gl.setRenderTarget(rts[0]);                  // compile both bake shaders in the background first (no freeze)
  const p = gl.compileAsync(sc, new THREE.PerspectiveCamera()); gl.setRenderTarget(null); try { await p; } catch (e) {}
  skies.forEach((s, i) => {
    skies.forEach(o => o.mesh.visible = o === s);
    cam.renderTarget = rts[i]; cam.update(gl, sc);
  });
  skies.forEach(s => { sc.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); });
  return rts.map(r => r.texture);
}
export function makeBakedSky(tex){
  const uniforms = { uMix: { value: 0 }, uTime: { value: 0 }, tA: { value: tex[0] }, tB: { value: tex[1] } };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform samplerCube tA, tB; uniform float uMix; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); vec3 c = textureCube(tA, d).rgb; if (uMix > 0.001) c = mix(c, textureCube(tB, d).rgb, uMix); gl_FragColor = vec4(c, 1.0); }`
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
  mesh.renderOrder = -10; mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export function makeSky(sunDir, { bake = 0 } = {}){
  const uniforms = { uMix: { value: bake === 2 ? 1 : 0 }, uSun: { value: sunDir.clone() }, uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    defines: bake ? { BAKE: bake } : LITE_DEF, uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: NOISE + SKYFN + (bake ? BAKE_OUT : '') + `
      uniform float uMix, uTime; uniform vec3 uSun; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float below = 1.0 - smoothstep(-0.06, 0.01, d.y);         // under the horizon: the cosmos is always there
        vec3 c;
        if (uMix < 0.999) { vec3 s = sunsetSky(d, uSun); s += milkyWay(d) * smoothstep(0.1, 0.4, d.y) * 0.7; c = cloudLayer(d, uSun, s, uTime); }
        if (uMix > 0.001 || below > 0.001) { vec3 cs = cosmicSky(d); c = uMix < 0.999 ? mix(c, cs, max(uMix, below)) : cs; }
        c += vec3(0.55, 0.32, 0.95) * exp(-abs(d.y + 0.05) * 22.0) * below * (1.0 - uMix) * 0.7; // glow of the cosmos under the edge
        #ifdef BAKE
        gl_FragColor = vec4(bakeOut(c), 1.0);
        #else
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #endif
      }`
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), mat);
  mesh.renderOrder = -10; mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export function makeStars(n){
  const pos = new Float32Array(n * 3), aCol = new Float32Array(n * 3), aSize = new Float32Array(n), aPh = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos.set([r * Math.cos(a) * 1400, u * 1400, r * Math.sin(a) * 1400], i * 3);
    const big = Math.random() < 0.03; aSize[i] = big ? 2.4 + Math.random() * 2.2 : 0.7 + Math.random() * 1.1; aPh[i] = Math.random() * 6.28;
    const tk = Math.random(); aCol.set(tk < 0.2 ? [0.7, 0.8, 1.0] : tk < 0.32 ? [1.0, 0.78, 0.55] : [1.0, 0.97, 0.92], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1)); g.setAttribute('aPh', new THREE.BufferAttribute(aPh, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(aCol, 3));
  const uniforms = { uMix: { value: 0 }, uTime: { value: 0 }, uPx: { value: Math.min(devicePixelRatio || 1, 2) } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aSize; attribute float aPh; attribute vec3 aCol; uniform float uTime, uMix, uPx; varying float vA; varying vec3 vC;
      void main(){ vec3 d = normalize(position); float e = d.y;
        vC = aCol; float sunsetVis = smoothstep(0.04, 0.26, e);        // stars only in the upper sunset sky
        vA = mix(sunsetVis, 1.0, uMix) * (0.65 + 0.35 * sin(uTime * (1.2 + aPh * 0.3) + aPh * 10.0));
        gl_PointSize = aSize * uPx * 1.15;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.9999; }`,
    fragmentShader: `varying float vA; varying vec3 vC; void main(){ vec2 p = gl_PointCoord - .5; float d = length(p); float a = smoothstep(.5, 0., d); a = a * a + exp(-d * 18.0) * 0.6; gl_FragColor = vec4(vC * a * vA * 1.4, a * vA); }`
  });
  const points = new THREE.Points(g, mat); points.frustumCulled = false; points.renderOrder = -9;
  return { points, uniforms };
}

// ---------- distant galaxies: procedural spiral textures on tilted planes around the sky ----------
function galaxyTexture(seed, kind){
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  let st = seed * 7919 + 13; const R = () => ((st = (st * 16807) % 2147483647) / 2147483647);
  x.globalCompositeOperation = 'lighter';
  const core = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.3);
  core.addColorStop(0, 'rgba(255,240,215,1)'); core.addColorStop(0.25, 'rgba(255,200,150,.55)'); core.addColorStop(1, 'rgba(255,170,120,0)');
  x.fillStyle = core; x.fillRect(0, 0, S, S);
  if (kind === 'elliptical') {
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.48); g.addColorStop(0, 'rgba(255,215,180,.5)'); g.addColorStop(1, 'rgba(255,190,160,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
  } else {
    const arms = 2 + (R() * 2 | 0), twist = 1.05 + R() * 0.55, hue = R(), st0 = st;
    for (let pass = 0; pass < 2; pass++) { st = st0; x.filter = pass ? 'none' : 'blur(7px)'; x.globalAlpha = pass ? 0.22 : 1;
    for (let i = 0; i < 2600; i++) {
      const arm = i % arms, t = Math.pow(R(), 0.7), r = t * S * 0.46;
      const a = arm / arms * Math.PI * 2 + t * twist * Math.PI + (R() - 0.5) * (0.9 - t * 0.35);
      const px = S / 2 + Math.cos(a) * r, py = S / 2 + Math.sin(a) * r;
      const blue = t > 0.35 && R() < 0.6, pink = R() < 0.08;
      x.fillStyle = pink ? 'rgba(255,120,190,.5)' : blue ? (hue < .5 ? 'rgba(150,180,255,.32)' : 'rgba(170,150,255,.32)') : 'rgba(255,215,170,.25)';
      const sz = (R() * 2.2 + 0.4) * (pass ? 0.7 : 1.6); x.beginPath(); x.arc(px, py, sz, 0, 7); x.fill();
    } }
    x.filter = 'none'; x.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const lerpN = (a, b, t) => a + (b - a) * t;
export function makeGalaxies(n){
  let gs = 20261121; const rg = () => ((gs = (gs * 16807) % 2147483647) / 2147483647);   // fixed layout
  const group = new THREE.Group(); group.renderOrder = -8; const list = [];
  for (let i = 0; i < n; i++) {
    const high = i < Math.ceil(n * 0.6);                                  // most sit high enough to show above the sunset
    const el = high ? 0.16 + rg() * (i % 2 ? 0.14 : 0.45) : -0.6 + rg() * 0.9, az = high ? -Math.PI / 2 + (rg() - 0.5) * 2.6 : rg() * Math.PI * 2, ce = Math.sqrt(1 - el * el);
    const dir = new THREE.Vector3(Math.cos(az) * ce, el, Math.sin(az) * ce);
    const kind = i % 4 === 3 ? 'elliptical' : 'spiral', size = (kind === 'elliptical' ? 40 : 60) + rg() * (high ? 70 : 140);
    const m = new THREE.MeshBasicMaterial({ map: galaxyTexture(i + 3, kind), color: new THREE.Color(1.7, 1.6, 1.7), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0, toneMapped: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
    mesh.position.copy(dir).multiplyScalar(1300); mesh.lookAt(0, 0, 0);
    mesh.rotateZ(rg() * Math.PI); mesh.rotateX((rg() - 0.5) * 2.2);          // inclination
    mesh.frustumCulled = false; mesh.renderOrder = -8;
    group.add(mesh); list.push({ m, high, k: 0.6 + rg() * 0.6, dusk: THREE.MathUtils.smoothstep(el, 0.16, 0.42) });
  }
  return { group, update(cam, mix){ group.position.copy(cam); for (const g of list) g.m.opacity = g.k * (g.high ? lerpN(0.22 + g.dusk * 0.5, 1, mix) : mix); } };
}
