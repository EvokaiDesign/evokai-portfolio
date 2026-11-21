import * as THREE from 'three';
import { NOISE, SKYFN } from './sky.js';

const WAVES = /* glsl */`
float waveH(vec2 p, float t){
  float h = 0.0;
  h += 0.38 * sin(dot(p, vec2( 0.96, 0.28)) * 0.165 + t * 0.85);
  h += 0.24 * sin(dot(p, vec2(-0.55, 0.83)) * 0.300 + t * 1.15);
  h += 0.13 * sin(dot(p, vec2( 0.30,-0.95)) * 0.570 + t * 1.60);
  h += 0.07 * sin(dot(p, vec2(-0.86,-0.51)) * 1.050 + t * 2.20);
  return h;
}`;

export function makeOcean({ segments, size, mode, edgeZ, sunDir, level = 0 }){
  const uniforms = {
    uTime: { value: 0 }, uMix: { value: mode }, uMode: { value: mode }, uEdge: { value: edgeZ },
    uSun: { value: sunDir.clone() }, uCam: { value: new THREE.Vector3() }, uOff: { value: new THREE.Vector2() }, uLevel: { value: level }
  };
  const g = new THREE.PlaneGeometry(size, size, segments, segments); g.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: false,
    vertexShader: WAVES + `
      uniform float uTime, uEdge, uMode, uLevel; uniform vec2 uOff; varying vec3 vW; varying float vH;
      void main(){
        vec3 w = position + vec3(uOff.x, 0.0, uOff.y);
        float h = waveH(w.xz, uTime);
        w.y = uLevel + h; vH = h;
        if (uMode < 0.5) { float dz = (uEdge + 16.0) - w.z; if (dz > 0.0) w.y -= dz * dz * 0.028; } // water rolls over the lip
        vW = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: NOISE + SKYFN + WAVES + `
      uniform float uTime, uMix, uMode, uEdge, uLevel; uniform vec3 uSun, uCam; varying vec3 vW; varying float vH;
      void main(){
        if (uMode < 0.5 && vW.z < uEdge) discard;
        vec2 p = vW.xz; float e = 0.25;
        float h0 = waveH(p, uTime);
        vec3 N = normalize(vec3(-(waveH(p + vec2(e, 0.), uTime) - h0) / e, 1.0, -(waveH(p + vec2(0., e), uTime) - h0) / e));
        float ripple = fbm3(vec3(p * 0.35, uTime * 0.25));
        N = normalize(N + vec3(ripple - 0.5, 0.0, vnoise(vec3(p * 0.5 + 9.0, uTime * 0.25)) - 0.5) * 0.09);
        vec3 V = normalize(uCam - vW); float dist = length(uCam - vW);
        float warp = vnoise(vec3(p * 0.045, uTime * 0.05)); float t01 = clamp(h0 * 0.7 + 0.5 + (ripple - 0.5) * 0.35 + (warp - 0.5) * 0.6, 0.0, 1.0);
        // painterly bands: deep → turquoise → cyan crests
        vec3 deepA = vec3(0.008, 0.05, 0.10), midA = vec3(0.015, 0.22, 0.30), crestA = vec3(0.10, 0.52, 0.58);
        vec3 deepB = vec3(0.02, 0.01, 0.07), midB = vec3(0.09, 0.035, 0.24), crestB = vec3(0.20, 0.30, 0.85);
        float cm = uMode > 0.5 ? 1.0 : uMix;
        vec3 c = mix(mix(deepA, deepB, cm), mix(midA, midB, cm), smoothstep(0.30, 0.48, t01));
        c = mix(c, mix(crestA, crestB, cm), smoothstep(0.76, 0.92, t01) * mix(0.8, 0.35, cm));
        // reflection of the sky + sun glitter
        vec3 R = reflect(-V, N); R.y = abs(R.y);
        vec3 refl = cm < 0.01 ? sunsetSky(R, uSun) : (cm > 0.99 ? cosmicSky(R) : mix(sunsetSky(R, uSun), cosmicSky(R), cm));
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        c = mix(c, refl * mix(0.7, 0.5, cm), clamp(fres, 0.0, mix(0.45, 0.4, cm)));
        float s = max(dot(R, uSun), 0.0);
        c += mix(vec3(1.0, 0.72, 0.4), vec3(0.6, 0.7, 1.0), cm) * (pow(s, 350.0) * 2.6 + pow(s, 30.0) * 0.22) * (1.0 - cm * 0.6);
        // crest foam
        float foam = smoothstep(0.84, 0.97, t01 + (vnoise(vec3(p * 1.4, uTime * 0.6)) - 0.5) * 0.5);
        c = mix(c, mix(vec3(0.85, 0.95, 0.92), vec3(0.75, 0.7, 1.0), cm), foam * 0.3 * (1.0 - cm * 0.85));
        // cosmic water: star glints
        if (cm > 0.01) { vec2 cell = floor(p * 0.9); float st = step(0.985, hash3(vec3(cell, 3.0))) * (0.6 + 0.4 * sin(uTime * 3.0 + hash3(vec3(cell, 7.0)) * 30.0));
          c += vec3(0.8, 0.85, 1.0) * st * cm * smoothstep(0.35, 0.0, length(fract(p * 0.9) - 0.5)); }
        // near the edge: water speeds up into streaks
        if (uMode < 0.5 && vW.z < uEdge + 70.0) { float k = smoothstep(uEdge + 70.0, uEdge + 2.0, vW.z);
          float streak = smoothstep(0.6, 0.95, fbm3(vec3(vW.x * 0.25, vW.z * 0.02 + uTime * 0.9, 1.0)));
          c = mix(c, vec3(0.75, 0.95, 0.95), streak * k * 0.55); c += vec3(0.25, 0.4, 0.45) * k * k * 0.35; }
        // distance haze into the horizon colour
        vec3 hzS = sunsetSky(normalize(vec3(-V.x, 0.02, -V.z)), uSun); vec3 hz = cm < 0.01 ? hzS : mix(hzS, cosmicSky(normalize(vec3(-V.x, -0.05, -V.z))) * 1.4, cm);
        c = mix(c, hz, 1.0 - exp(-dist * mix(0.0032, 0.0022, cm)));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
  const cell = size / segments;
  return {
    mesh, uniforms,
    update(t, cam, mix){
      uniforms.uTime.value = t; uniforms.uMix.value = mode ? 1 : mix; uniforms.uCam.value.copy(cam);
      uniforms.uOff.value.set(Math.round(cam.x / cell) * cell, Math.round(cam.z / cell) * cell);
    }
  };
}

export function makeWaterfall(edgeZ, bottom){
  const uniforms = { uTime: { value: 0 }, uMix: { value: 0 } };
  const g = new THREE.PlaneGeometry(1600, 1, 120, 40);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = 0.5 - pos.getY(i); // 0 top → 1 bottom
    const y = 0.25 - v * (Math.abs(bottom) + 18), z = edgeZ - 9 * (1 - Math.exp(-v * 5));
    pos.setXYZ(i, pos.getX(i), y, z);
  }
  g.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.); }`,
    fragmentShader: NOISE + `
      uniform float uTime, uMix; varying vec2 vUv; varying vec3 vW;
      void main(){
        float v = 1.0 - vUv.y;
        float s = fbm(vec3(vW.x * 0.12, vW.y * 0.03 + uTime * 1.4, 2.0));
        float fine = fbm(vec3(vW.x * 0.6, vW.y * 0.12 + uTime * 2.6, 5.0));
        vec3 top = vec3(0.35, 0.85, 0.85), mid = vec3(0.25, 0.35, 0.85), bot = vec3(0.55, 0.25, 0.9);
        vec3 c = mix(top, mid, smoothstep(0.0, 0.45, v)); c = mix(c, bot, smoothstep(0.4, 1.0, v));
        c += vec3(0.9) * smoothstep(0.55, 0.85, fine) * (1.0 - v) * 0.6;
        float a = (0.22 + 0.45 * smoothstep(0.3, 0.75, s)) * (1.0 - smoothstep(0.55, 1.0, v)) * smoothstep(0.0, 0.02, v + 0.02);
        a *= 1.0 - smoothstep(600.0, 790.0, abs(vW.x));
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 2;
  return { mesh, update(t, mix){ uniforms.uTime.value = t; uniforms.uMix.value = mix; } };
}

export function makeMist(edgeZ, bottom, n){
  const pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos.set([(Math.random() - 0.5) * 700, bottom * Math.pow(Math.random(), 0.7) + 4, edgeZ - 4 - Math.random() * 30], i * 3); ph[i] = Math.random() * 6.28;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const uniforms = { uTime: { value: 0 }, uPx: { value: Math.min(devicePixelRatio || 1, 2) } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aPh; uniform float uTime, uPx; varying float vA;
      void main(){ vec3 p = position; p.y += sin(uTime * 0.4 + aPh) * 3.0; p.x += sin(uTime * 0.2 + aPh * 2.0) * 4.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.); vA = 0.12 + 0.08 * sin(uTime + aPh);
        gl_PointSize = uPx * 900.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d) * vA; gl_FragColor = vec4(vec3(0.75, 0.8, 1.0) * a, a); }`
  });
  const points = new THREE.Points(g, mat); points.frustumCulled = false; points.renderOrder = 3;
  return { points, update(t){ uniforms.uTime.value = t; } };
}
