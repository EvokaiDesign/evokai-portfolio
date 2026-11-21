import * as THREE from 'three';

export const NOISE = /* glsl */`
float hash3(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + 1.7; a *= .5; } return s; }
float fbm3(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = p * 2.03 + 1.7; a *= .5; } return s * 1.14; }
`;

// shared sky colour so the ocean can reflect the same sky
export const SKYFN = /* glsl */`
vec3 sunsetSky(vec3 d, vec3 sun){
  float e = max(d.y, 0.0);
  vec3 c = vec3(1.0, 0.72, 0.30);                                  // golden horizon
  c = mix(c, vec3(1.0, 0.42, 0.12), smoothstep(0.00, 0.05, e));    // orange
  c = mix(c, vec3(0.86, 0.24, 0.22), smoothstep(0.04, 0.10, e));   // coral / warm red
  c = mix(c, vec3(0.62, 0.24, 0.44), smoothstep(0.09, 0.18, e));   // dusty pink
  c = mix(c, vec3(0.28, 0.14, 0.46), smoothstep(0.16, 0.32, e));   // violet
  c = mix(c, vec3(0.035, 0.035, 0.15), smoothstep(0.30, 0.72, e)); // deep blue
  float az = max(dot(normalize(vec3(d.x, 0., d.z)), normalize(vec3(sun.x, 0., sun.z))), 0.0);
  c *= mix(0.78, 1.12, az);                                         // warmer towards the sun
  float s = max(dot(d, sun), 0.0);
  c += vec3(1.0, 0.55, 0.22) * (pow(s, 10.0) * 0.45 + pow(s, 90.0) * 0.9);
  c = mix(c, vec3(1.0, 0.95, 0.78) * 3.0, smoothstep(0.99955, 0.9998, s)); // sun disc
  return c;
}
vec3 cosmicSky(vec3 d){
  vec3 c = vec3(0.025, 0.018, 0.075);
  float n = fbm(d * 2.6 + vec3(3.1, 0.0, 1.7));
  float m = fbm(d * 5.0 - vec3(1.0, 2.0, 0.5));
  c += vec3(0.42, 0.14, 0.70) * smoothstep(0.45, 0.85, n) * 0.9;   // violet clouds
  c += vec3(0.90, 0.20, 0.62) * smoothstep(0.62, 0.95, n * m * 1.6) * 0.8; // magenta cores
  c += vec3(0.15, 0.45, 1.00) * smoothstep(0.55, 0.9, m) * 0.55;  // electric blue
  return c;
}
`;

export function makeSky(sunDir){
  const uniforms = { uMix: { value: 0 }, uSun: { value: sunDir.clone() } };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: NOISE + SKYFN + `
      uniform float uMix; uniform vec3 uSun; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        // painterly cloud streaks low in the sunset sky
        float band = smoothstep(0.02, 0.07, d.y) * (1.0 - smoothstep(0.12, 0.26, d.y));
        float cl = fbm(vec3(d.x * 3.0 / (d.y + 0.25), d.y * 30.0, d.z * 3.0 / (d.y + 0.25)));
        vec3 sun = sunsetSky(d, uSun);
        sun = mix(sun, sun * vec3(1.18, 0.82, 0.92) + vec3(0.06, 0.02, 0.04), band * smoothstep(0.55, 0.75, cl));
        vec3 cos = cosmicSky(d);
        float below = 1.0 - smoothstep(-0.06, 0.01, d.y);         // under the horizon: the cosmos is always there
        vec3 c = mix(sun, cos, max(uMix, below));
        c += vec3(0.55, 0.32, 0.95) * exp(-abs(d.y + 0.05) * 22.0) * below * (1.0 - uMix) * 0.7; // glow of the cosmos under the edge
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), mat);
  mesh.renderOrder = -10; mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export function makeStars(n){
  const pos = new Float32Array(n * 3), aSize = new Float32Array(n), aPh = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos.set([r * Math.cos(a) * 1400, u * 1400, r * Math.sin(a) * 1400], i * 3);
    const big = Math.random() < 0.035; aSize[i] = big ? 2.6 + Math.random() * 2 : 0.8 + Math.random() * 1.2; aPh[i] = Math.random() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1)); g.setAttribute('aPh', new THREE.BufferAttribute(aPh, 1));
  const uniforms = { uMix: { value: 0 }, uTime: { value: 0 }, uPx: { value: Math.min(devicePixelRatio || 1, 2) } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aSize; attribute float aPh; uniform float uTime, uMix, uPx; varying float vA;
      void main(){ vec3 d = normalize(position); float e = d.y;
        float sunsetVis = smoothstep(0.16, 0.5, e) * 0.8;        // stars only in the upper sunset sky
        vA = mix(sunsetVis, 1.0, uMix) * (0.65 + 0.35 * sin(uTime * (1.2 + aPh * 0.3) + aPh * 10.0));
        gl_PointSize = aSize * uPx * mix(1.0, 1.25, uMix);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.9999; }`,
    fragmentShader: `varying float vA; void main(){ vec2 p = gl_PointCoord - .5; float d = length(p); float a = smoothstep(.5, 0., d); gl_FragColor = vec4(vec3(1.0, 0.96, 0.9) * a * vA, a * vA); }`
  });
  const points = new THREE.Points(g, mat); points.frustumCulled = false; points.renderOrder = -9;
  return { points, uniforms };
}
