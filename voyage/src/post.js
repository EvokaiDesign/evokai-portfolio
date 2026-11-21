import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const GRADE = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uMix: { value: 0 }, uGrain: { value: 0.035 }, uAspect: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uMix, uGrain, uAspect; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5; float r = length(d * vec2(uAspect, 1.0));
      // tiny chromatic fringe towards the corners
      float ca = 0.0018 * smoothstep(0.35, 0.9, r);
      vec3 c = vec3(texture2D(tDiffuse, vUv + d * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * ca).b);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      // grade: lift shadows towards violet, keep highlights warm, a touch more saturation
      c = mix(vec3(l), c, 1.1);
      c += mix(vec3(0.035, 0.012, 0.06), vec3(0.03, 0.01, 0.07), uMix) * (1.0 - smoothstep(0.0, 0.45, l));
      c *= mix(vec3(1.03, 1.0, 0.96), vec3(0.98, 0.98, 1.04), uMix);
      // vignette
      c *= mix(1.0, 0.62, smoothstep(0.38, 1.0, r));
      // film grain
      c += (h(vUv * 931.7 + fract(uTime) * 17.0) - 0.5) * uGrain;
      gl_FragColor = vec4(c, 1.0);
    }`
};

export function makePost(gl, scene, camera, { mobile }){
  if (mobile) {                         // phones: draw straight to the screen (tone mapping happens in the materials), no bloom/grade passes
    return { setSize(){}, lower(){}, noBloom(){}, render(){ gl.render(scene, camera); } };
  }
  const composer = new EffectComposer(gl);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 1.05);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GRADE); composer.addPass(grade);
  let bloomScale = mobile ? 0.4 : 0.5, bk = 1;
  return {
    composer, bloom, grade,
    setSize(w, h, dpr){ composer.setPixelRatio(dpr); composer.setSize(w, h); bloom.resolution.set(w * bloomScale, h * bloomScale); grade.uniforms.uAspect.value = w / h; },
    lower(){ bloomScale = 0.33; bk = 0.85; grade.uniforms.uGrain.value = 0.02; },
    noBloom(){ bloom.enabled = false; },
    render(t, mix){ grade.uniforms.uTime.value = t; grade.uniforms.uMix.value = mix; bloom.strength = (0.42 + mix * 0.3) * bk; composer.render(); }
  };
}
