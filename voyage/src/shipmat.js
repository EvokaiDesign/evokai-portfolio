import * as THREE from 'three';

export function shipMaterials(){
  const shared = { uTime: { value: 0 }, uMix: { value: 0 } };

  // pearl bone: baked cream/violet patches (vertex colour) + thin-film iridescence + ember glow in the hollows + neon rim
  const bone = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.32, metalness: 0.08, clearcoat: 0.55, clearcoatRoughness: 0.16,
    iridescence: 1, iridescenceIOR: 1.45, iridescenceThicknessMinimum: 260, iridescenceThicknessMaximum: 640, envMapIntensity: 1.15
  });
  bone.onBeforeCompile = s => {
    Object.assign(s.uniforms, shared);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _ember; varying float vEmber;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmber = _ember;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uMix; varying float vEmber;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float em = smoothstep(0.12, 0.85, vEmber);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.03, 0.01), em * 0.85);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fl = 0.85 + 0.15 * sin(uTime * 2.3 + vViewPosition.x * 0.7) * sin(uTime * 1.7 + vViewPosition.y);
        totalEmissiveRadiance += mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.45, 0.1), em) * em * em * 2.2 * fl;
        float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
        vec3 rim = mix(vec3(1.0, 0.18, 0.62), vec3(0.42, 0.32, 1.0), smoothstep(0.2, 0.6, fr));
        rim = mix(rim, vec3(0.2, 0.9, 1.0), smoothstep(0.6, 0.95, fr));
        totalEmissiveRadiance += rim * fr * (0.35 + uMix * 0.35);`);
  };

  // sails: baked fire gradient, gentle billow, torn outer edge, glow near the root
  const sail = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, metalness: 0, alphaTest: 0.5 });
  sail.onBeforeCompile = s => {
    Object.assign(s.uniforms, shared);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _t; varying float vT; varying vec3 vP; uniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vT = _t; vP = position;
        transformed += normal * sin(uTime * 1.6 + _t * 3.5 + position.x * 0.3) * _t * _t * 0.12;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uMix; varying float vT; varying vec3 vP;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <alphatest_fragment>', `
        float tear = n2(vP.xz * 2.2 + vP.y) * 0.6 + n2(vP.xz * 7.0) * 0.4;
        diffuseColor.a = (vT + tear * 0.32 < 1.2) ? 1.0 : 0.0;
        #include <alphatest_fragment>`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * (1.0 - vT) * 1.1 + diffuseColor.rgb * 0.18;`);
  };

  // engine glow: orange furnace, flares blue in the cosmic ocean
  const glow = new THREE.MeshBasicMaterial({ color: 0xff7a1e, toneMapped: false });
  const orange = new THREE.Color(1.6, 0.55, 0.12), blue = new THREE.Color(0.35, 0.7, 2.0);

  return {
    bone, sail, glow,
    update(t, mix){ shared.uTime.value = t; shared.uMix.value = mix; glow.color.copy(orange).lerp(blue, THREE.MathUtils.smoothstep(mix, 0.2, 0.9)); }
  };
}
