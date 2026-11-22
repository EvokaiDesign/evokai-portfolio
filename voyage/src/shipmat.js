import * as THREE from 'three';

// Cel-shaded ship (Nov 2026, from the Blender cel test): three hard tone bands, calm lilac pearl bone,
// ember / fire / engine glow kept, hard rim band, and a black ink outline (inverted hull) that follows
// the wing flap and the sails' torn edges.

const FLAP = `{ float lat = abs(position.z), fl = max(lat - 0.9, 0.0);            // slow wing flap (same on ribs, sails and outlines)
  transformed.y += sin(uTime * 1.45 - lat * 0.22) * fl * 0.05;
  transformed.z += sign(position.z) * (cos(uTime * 1.45 - lat * 0.22) - 1.0) * fl * 0.012; }`;
const NOISE = `float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`;
const TEAR = `float tear = n2(vP.xz * 2.2 + vP.y) * 0.6 + n2(vP.xz * 7.0) * 0.4;`;

// three bands: shadow / mid / lit (sampled by the toon shader with nearest filtering = hard edges)
function bands(){
  const t = new THREE.DataTexture(new Uint8Array([50, 50, 115, 190, 190]), 5, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
}

export function shipMaterials(){
  const shared = { uTime: { value: 0 }, uMix: { value: 0 } };
  const gradientMap = bands();

  // pearl bone: calm lilac pearl (patches only as a light tint) + ember glow in the hollows + hard rim band
  const bone = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  bone.onBeforeCompile = s => {
    Object.assign(s.uniforms, shared);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _ember; varying float vEmber; uniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n vEmber = _ember;\n ${FLAP}`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uMix; varying float vEmber;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = mix(vec3(0.56, 0.45, 0.82), diffuseColor.rgb, 0.22);   // calm pearl, patches as a faint tint
        float em = smoothstep(0.12, 0.85, vEmber);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.03, 0.01), em * 0.85);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float flk = 0.85 + 0.15 * sin(uTime * 2.3 + vViewPosition.x * 0.7) * sin(uTime * 1.7 + vViewPosition.y);
        totalEmissiveRadiance += mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.45, 0.1), em) * em * em * 2.4 * flk;
        float fr = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        float rimB = step(0.62, fr);                                             // one hard rim band, like the cel test
        vec3 rim = mix(vec3(1.0, 0.86, 0.95), vec3(0.62, 0.55, 1.0), uMix);
        totalEmissiveRadiance += rim * rimB * (0.12 + uMix * 0.15);`);
  };

  // sails: fire gradient, gentle billow, torn outer edge, glow near the root - in bands
  const sail = new THREE.MeshToonMaterial({ vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5, gradientMap });
  sail.onBeforeCompile = s => {
    Object.assign(s.uniforms, shared);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _t; varying float vT; varying vec3 vP; uniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vT = _t; vP = position;
        transformed += normal * sin(uTime * 1.6 + _t * 3.5 + position.x * 0.3) * _t * _t * 0.08;
        ${FLAP}`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime, uMix; varying float vT; varying vec3 vP;\n${NOISE}`)
      .replace('#include <alphatest_fragment>', `${TEAR}
        diffuseColor.a = (vT + tear * 0.32 < 1.2) ? 1.0 : 0.0;
        #include <alphatest_fragment>`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * (floor((1.0 - vT) * 3.0 + 0.5) / 3.0) * 1.6 + diffuseColor.rgb * 0.22;   // root glow, stepped`);
  };

  // engine glow: orange furnace, flares blue in the cosmic ocean
  const glow = new THREE.MeshBasicMaterial({ color: 0xff7a1e, toneMapped: false });
  const orange = new THREE.Color(2.0, 0.7, 0.16), blue = new THREE.Color(0.45, 0.95, 2.4);

  // ink outline: back faces pushed out along the normal, flat dark ink (sails keep their torn edge)
  const ink = (sails, width) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...shared, uW: { value: width }, uCol: { value: new THREE.Color(0.035, 0.02, 0.05) } },
      side: sails ? THREE.DoubleSide : THREE.BackSide, fog: false,
      vertexShader: `uniform float uTime, uW; ${sails ? 'attribute float _t; varying float vT; varying vec3 vP;' : ''}
        void main(){ vec3 transformed = position;
          ${sails ? 'vT = _t; vP = position; transformed += normal * sin(uTime * 1.6 + _t * 3.5 + position.x * 0.3) * _t * _t * 0.08;' : ''}
          ${FLAP}
          transformed += normal * uW;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0); }`,
      fragmentShader: `uniform vec3 uCol; ${sails ? `varying float vT; varying vec3 vP; ${NOISE}` : ''}
        void main(){ ${sails ? `${TEAR} if (vT + tear * 0.32 >= 1.2 + 0.03) discard;` : ''}
          gl_FragColor = vec4(uCol, 1.0); }`
    });
    if (sails) { m.polygonOffset = true; m.polygonOffsetFactor = 2; m.polygonOffsetUnits = 2; }
    return m;
  };
  const inkBone = ink(false, 0.045);   // sails are flat sheets: their frame of ribs carries the ink

  return {
    bone, sail, glow, inkBone,
    update(t, mix){ shared.uTime.value = t; shared.uMix.value = mix; glow.color.copy(orange).lerp(blue, THREE.MathUtils.smoothstep(mix, 0.2, 0.9)); }
  };
}
