import * as THREE from 'three';
import { NOISE, SKYFN, LITE, LITE_DEF } from './sky.js';

// ---------- sunset ocean: Gerstner waves on a polar grid that is dense near the camera ----------
// waves: dir.x, dir.y, steepness, wavelength
const WAVES = [
  [0.95, 0.31, 0.20, 52], [-0.60, 0.80, 0.18, 33], [0.30, -0.95, 0.17, 21],
  [-0.85, -0.52, 0.15, 13], [0.70, 0.71, 0.13, 8], [-0.20, 0.98, 0.11, 5]
];
const GERSTNER = /* glsl */`
uniform vec4 uW[6];
vec3 gerstner(vec2 p, float t, float dist, inout vec3 N, out float crest){
  vec3 o = vec3(0.0); vec3 n = vec3(0.0, 1.0, 0.0); crest = 0.0;
  for (int i = 0; i < 6; i++){
    vec2 d = normalize(uW[i].xy); float L = uW[i].w, k = 6.2831853 / L, c = sqrt(9.8 / k);
    float fade = 1.0 - smoothstep(L * 7.0, L * 16.0, dist);
    float Q = uW[i].z * fade, A = Q / k * 0.55;
    float f = k * (dot(d, p) - c * t * 0.55);
    float cf = cos(f), sf = sin(f);
    o.x += Q * A * d.x * cf; o.z += Q * A * d.y * cf; o.y += A * sf;
    n.x -= d.x * k * A * cf; n.z -= d.y * k * A * cf; n.y -= Q * k * A * sf * 0.6;
    crest += sf * Q;
  }
  N = normalize(n); return o;
}`;

function polarGrid(rings, segs, rMax){
  const pos = [], idx = []; const g = Math.pow(rMax / 0.6, 1 / rings);
  pos.push(0, 0, 0);
  for (let i = 0; i <= rings; i++) { const r = 0.6 * Math.pow(g, i); for (let j = 0; j < segs; j++) { const a = j / segs * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); } }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + (j + 1) % segs, 1 + j);
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = 1 + i * segs + j, b = 1 + i * segs + (j + 1) % segs, c = a + segs, d = b + segs;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); return geo;
}

export function makeOcean({ rings, segs, edgeZ, sunDir }){
  const uniforms = {
    uTime: { value: 0 }, uMix: { value: 0 }, uEdge: { value: edgeZ }, uSun: { value: sunDir.clone() }, uCam: { value: new THREE.Vector3() },
    uShip: { value: new THREE.Vector4(0, 0, 0, -1) }, uWake: { value: 1 },
    uW: { value: WAVES.map(w => new THREE.Vector4(...w)) }
  };
  const mat = new THREE.ShaderMaterial({ defines: LITE_DEF,
    uniforms,
    vertexShader: GERSTNER + `
      uniform float uTime, uEdge; uniform vec3 uCam; varying vec3 vW; varying vec3 vN; varying float vCrest;
      void main(){
        vec3 w = vec3(position.x + uCam.x, 0.0, position.z + uCam.z);
        float dist = length(position.xz); vec3 N;
        vec3 o = gerstner(w.xz, uTime, dist, N, vCrest);
        w += o;
        float dz = (uEdge + 18.0) - w.z; if (dz > 0.0) w.y -= dz * dz * 0.026;   // water rolls over the lip
        vW = w; vN = N;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: NOISE + SKYFN + `
      uniform float uTime, uMix, uEdge, uWake; uniform vec3 uSun, uCam; uniform vec4 uShip;
      varying vec3 vW; varying vec3 vN; varying float vCrest;
      #ifdef LITE
      #define DETAIL_N 3
      #else
      #define DETAIL_N 7
      #endif
      vec2 detail(vec2 p, float t){
        vec2 g = vec2(0.0);
        for (int i = 0; i < DETAIL_N; i++){
          float fi = float(i); float a = fi * 2.399 + 0.6;
          vec2 d = vec2(cos(a), sin(a)); float k = 1.1 + fi * 0.62; float amp = 0.055 / (1.0 + fi * 0.55);
          g += d * k * amp * cos(dot(d, p) * k + t * (1.2 + fi * 0.35));
        }
        return g;
      }
      void main(){
        if (vW.z < uEdge) discard;
        vec3 V = normalize(uCam - vW); float dist = length(uCam - vW);
        vec2 g = detail(vW.xz, uTime) * (1.0 - smoothstep(25.0, 140.0, dist));
        vec3 N = normalize(vN + vec3(-g.x, 0.0, -g.y));
        vec3 L = uSun;
        // body colour: deep → turquoise where light passes through the crests
        float h = clamp(vW.y * 0.9 + 0.5, 0.0, 1.0);
        vec3 deep = vec3(0.006, 0.04, 0.075), mid = vec3(0.01, 0.16, 0.22), sss = vec3(0.04, 0.55, 0.52);
        vec3 body = mix(deep, mid, smoothstep(0.15, 0.7, h));
        float through = pow(max(dot(V, -vec3(L.x, -0.15, L.z)), 0.0), 3.0) * smoothstep(0.35, 0.95, h);
        body += sss * (through * 0.9 + smoothstep(0.55, 1.0, h) * 0.12);
        // reflection of the sky
        vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.01;
        vec3 refl = sunsetSky(normalize(R), uSun);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 c = mix(body, refl, clamp(fres, 0.0, 0.85));
        // sun: sharp core + wide glitter path
        float s = max(dot(R, L), 0.0);
        c += vec3(1.0, 0.72, 0.42) * (pow(s, 900.0) * 9.0 + pow(s, 120.0) * 0.9 + pow(s, 18.0) * 0.12);
        // crest foam
        float fn = fbm3(vec3(vW.xz * 0.5, uTime * 0.4));
        float foam = smoothstep(0.62, 0.95, vCrest * 0.9 + fn * 0.55) * (1.0 - smoothstep(60.0, 200.0, dist));
        // ship wake: kelvin V + turbulent trail
        if (uShip.w > -0.5 && uWake > 0.01) {
          vec2 dd = vW.xz - uShip.xy; vec2 dir = vec2(-sin(uShip.z), -cos(uShip.z));      // ship forward
          float along = dot(dd, -dir), lat = dot(dd, vec2(dir.y, -dir.x));
          if (along > -2.0 && along < 140.0) {
            float a = max(along, 0.0), w = 0.7 + a * 0.035;
            float arms = exp(-pow((abs(lat) - a * 0.36) / w, 2.0));
            float trail = exp(-pow(lat / (0.8 + a * 0.05), 2.0)) * smoothstep(-1.0, 6.0, along) * 0.7;
            float wake = (arms * 0.8 + trail) * (1.0 - smoothstep(40.0, 140.0, a)) * smoothstep(0.35, 0.75, fbm3(vec3(vW.xz * 0.7, uTime * 0.8)) + 0.25);
            foam = max(foam, wake * uWake);
          }
        }
        vec3 foamCol = mix(vec3(0.85, 0.9, 0.88), vec3(1.0, 0.85, 0.75), max(dot(N, L), 0.0));
        c = mix(c, foamCol, clamp(foam, 0.0, 1.0) * 0.55);
        // near the edge: water speeds up into streaks and glows
        if (vW.z < uEdge + 80.0) { float k = smoothstep(uEdge + 80.0, uEdge + 2.0, vW.z);
          float streak = smoothstep(0.55, 0.95, fbm3(vec3(vW.x * 0.25, vW.z * 0.03 + uTime * 1.1, 1.0)));
          c = mix(c, vec3(0.8, 0.97, 0.95), streak * k * 0.6); c += vec3(0.35, 0.25, 0.65) * k * k * 0.5; }
        // aerial perspective into the horizon
        vec3 hz = sunsetSky(normalize(vec3(-V.x, 0.015, -V.z)), uSun);
        c = mix(c, hz, 1.0 - exp(-dist * 0.0026));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(polarGrid(rings, segs, 1500), mat); mesh.frustumCulled = false;
  return {
    mesh, uniforms,
    update(t, cam, mix, ship, heading, wake){
      uniforms.uTime.value = t; uniforms.uMix.value = mix; uniforms.uCam.value.copy(cam);
      uniforms.uShip.value.set(ship.x, ship.z, heading, 1); uniforms.uWake.value = wake;
    }
  };
}

// ---------- waterfall at the edge of the world ----------
export function makeWaterfall(edgeZ, depth){
  const uniforms = { uTime: { value: 0 }, uMix: { value: 0 } };
  const g = new THREE.PlaneGeometry(1800, 1, 160, 50);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = 0.5 - pos.getY(i); // 0 top → 1 bottom
    pos.setXYZ(i, pos.getX(i), 0.2 - v * depth, edgeZ - 10 * (1 - Math.exp(-v * 6)));
  }
  const mat = new THREE.ShaderMaterial({ defines: LITE_DEF,
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.); }`,
    fragmentShader: NOISE + `
      uniform float uTime; varying vec2 vUv; varying vec3 vW;
      void main(){
        float v = 1.0 - vUv.y;
        float s = fbm(vec3(vW.x * 0.1, vW.y * 0.025 + uTime * 1.2, 2.0));
        float fine = fbm3(vec3(vW.x * 0.55, vW.y * 0.1 + uTime * 2.4, 5.0));
        vec3 c = mix(vec3(0.4, 0.9, 0.88), vec3(0.3, 0.35, 0.95), smoothstep(0.0, 0.4, v)); c = mix(c, vec3(0.75, 0.35, 1.0), smoothstep(0.35, 1.0, v));
        c += vec3(1.0) * smoothstep(0.55, 0.85, fine) * (1.0 - v) * 0.8;
        c *= 1.0 + (1.0 - v) * 0.6;
        float a = (0.2 + 0.5 * smoothstep(0.3, 0.75, s)) * (1.0 - smoothstep(0.45, 1.0, v));
        a *= 1.0 - smoothstep(650.0, 880.0, abs(vW.x));
        gl_FragColor = vec4(c, a);
      }`
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 2;
  return { mesh, update(t, mix){ uniforms.uTime.value = t; uniforms.uMix.value = mix; } };
}

// ---------- cosmic aura: glowing nebula layers below + floating nebula clouds (no ocean) ----------
function cloudTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const px = 128 + (Math.random() - .5) * 120, py = 128 + (Math.random() - .5) * 90, r = 40 + Math.random() * 70;
    const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function makeAura(edgeZ, endZ, n){
  const group = new THREE.Group();
  const shared = { uTime: { value: 0 }, uMix: { value: 0 }, uCam: { value: new THREE.Vector3() } };
  const layer = (y, scale, speed, bright) => {
    const m = new THREE.ShaderMaterial({ defines: LITE_DEF,
      uniforms: { ...shared, uY: { value: y }, uS: { value: scale }, uSp: { value: speed }, uB: { value: bright }, uEdge: { value: edgeZ } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `uniform vec3 uCam; uniform float uY; varying vec3 vW; void main(){ vW = position + vec3(uCam.x, uY, uCam.z); gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.); }`,
      fragmentShader: NOISE + `
        uniform float uTime, uMix, uS, uSp, uB, uEdge; uniform vec3 uCam; varying vec3 vW;
        void main(){
          vec2 p = vW.xz * uS;
          vec2 q = vec2(fbm3(vec3(p, uTime * uSp)), fbm3(vec3(p + 5.2, uTime * uSp)));
          float n = fbm(vec3(p + q * 2.2, uTime * uSp * 0.6));
          vec3 c = mix(vec3(0.25, 0.08, 0.55), vec3(0.95, 0.22, 0.65), smoothstep(0.45, 0.8, n));
          c = mix(c, vec3(0.2, 0.55, 1.0), smoothstep(0.62, 0.92, q.x));
          float d = length(vW.xz - uCam.xz);
          float a = smoothstep(0.32, 0.75, n) * uB * max(uMix, 0.35) * (1.0 - smoothstep(500.0, 1300.0, d));
          a *= smoothstep(uEdge, uEdge - 60.0, vW.z);
          gl_FragColor = vec4(c * a * 1.6, a);
        }`
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600).rotateX(-Math.PI / 2), m); mesh.frustumCulled = false; mesh.renderOrder = -5;
    group.add(mesh);
  };
  if (LITE) layer(-110, 0.0032, 0.012, 1.6);          // phones: one nebula layer instead of three
  else { layer(-45, 0.006, 0.02, 0.9); layer(-110, 0.0032, 0.012, 1.2); layer(-220, 0.0018, 0.008, 1.4); }

  // floating nebula clouds around the route (soft billboards)
  const tex = cloudTexture(); const pal = [0x8a3cff, 0xff3fa6, 0x3f7cff, 0xb05cff, 0x46d0ff];
  const clouds = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, color: pal[i % pal.length], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false });
    const s = new THREE.Sprite(m);
    const z = edgeZ - 30 - Math.random() * (edgeZ - endZ + 120);
    let x = (Math.random() - 0.5) * 360; if (Math.abs(x) < 40) x += Math.sign(x || 1) * 40;
    s.position.set(x, -40 + Math.random() * 90, z); const k = 60 + Math.random() * 120; s.scale.set(k, k * 0.7, 1);
    s.material.rotation = Math.random() * 6.28; s.userData.o = 0.12 + Math.random() * 0.22; s.userData.r = (Math.random() - .5) * 0.02;
    group.add(s); clouds.push(s);
  }
  return {
    group,
    update(t, cam, mix, near){
      shared.uTime.value = t; shared.uMix.value = mix; shared.uCam.value.copy(cam);
      group.visible = mix > 0.005 || near;
      for (const s of clouds) {
        const d = s.position.distanceTo(cam), k = s.scale.x;              // fade clouds out before the camera reaches them
        const f = THREE.MathUtils.smoothstep(d, k * 0.45, k * 1.3);
        s.material.opacity = s.userData.o * mix * f; s.material.rotation += s.userData.r * 0.016;
      }
    }
  };
}

// ---------- floating motes: warm embers over the sea, star dust in the cosmos ----------
export function makeMotes(n){
  const pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos.set([(Math.random() - .5) * 140, (Math.random() - .3) * 50, (Math.random() - .5) * 140], i * 3); ph[i] = Math.random() * 6.28; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const uniforms = { uTime: { value: 0 }, uMix: { value: 0 }, uCam: { value: new THREE.Vector3() }, uPx: { value: Math.min(devicePixelRatio || 1, 2) } };
  const mat = new THREE.ShaderMaterial({ defines: LITE_DEF,
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aPh; uniform float uTime, uMix, uPx; uniform vec3 uCam; varying float vA; varying float vM;
      void main(){
        vec3 p = position; p.y += uTime * mix(1.2, 0.4, uMix) + sin(uTime * 0.7 + aPh) * 1.5; p.x += sin(uTime * 0.3 + aPh * 3.0) * 2.0;
        vec3 w = uCam + mod(p - uCam + 70.0, 140.0) - 70.0; w.y = uCam.y + mod(p.y - uCam.y + 25.0, 50.0) - 20.0;
        vec4 mv = viewMatrix * vec4(w, 1.0);
        vA = (0.5 + 0.5 * sin(uTime * 2.0 + aPh * 7.0)) * smoothstep(-140.0, -6.0, mv.z) * (1.0 - smoothstep(-6.0, -1.0, mv.z)); vM = uMix;
        gl_PointSize = uPx * mix(55.0, 38.0, uMix) / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; varying float vM; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d) * vA;
      vec3 c = mix(vec3(2.4, 1.1, 0.35), vec3(1.0, 1.2, 2.2), vM); gl_FragColor = vec4(c * a, a); }`
  });
  const points = new THREE.Points(g, mat); points.frustumCulled = false;
  return { points, update(t, cam, mix){ uniforms.uTime.value = t; uniforms.uMix.value = mix; uniforms.uCam.value.copy(cam); } };
}
