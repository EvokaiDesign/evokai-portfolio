import * as THREE from 'three';

// Stand-in islands until the island character sheet is modelled.
// Same layout as the brief: floating rock, small outpost, framed billboard, two torches.
let flameFrames = null, glowTex = null;
const tl = new THREE.TextureLoader();
function frames(){
  if (!flameFrames) flameFrames = Array.from({ length: 24 }, (_, i) => { const t = tl.load(`media/flame/f${String(i + 1).padStart(2, '0')}.webp`); t.colorSpace = THREE.SRGBColorSpace; return t; });
  return flameFrames;
}
function glow(){
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,170,80,1)'); g.addColorStop(.35, 'rgba(255,110,30,.45)'); g.addColorStop(1, 'rgba(255,80,20,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace; return glowTex;
}
function soonTexture(title){
  const c = document.createElement('canvas'); c.width = 1024; c.height = 576; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 1024, 576); g.addColorStop(0, '#1a1028'); g.addColorStop(.55, '#3a1530'); g.addColorStop(1, '#5a2410');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 576);
  for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,${150 + Math.random() * 80 | 0},90,${Math.random() * .5})`; x.beginPath(); x.arc(Math.random() * 1024, Math.random() * 576, Math.random() * 2.2, 0, 7); x.fill(); }
  x.fillStyle = 'rgba(255,214,170,.92)'; x.textAlign = 'center'; x.font = '600 64px Outfit, "Avant Garde", sans-serif'; x.fillText(title, 512, 300);
  x.fillStyle = 'rgba(255,190,140,.55)'; x.font = '400 26px Jost, Futura, sans-serif'; x.fillText('AN EXPERIMENT IS BEING CHARTED', 512, 352);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function rnd(seed){ let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

export function makeIsland({ seed, title, image, cosmic }){
  const R = rnd(seed), group = new THREE.Group();
  // rock: flattened top, long tapering underside, faceted
  const geo = new THREE.IcosahedronGeometry(6, 3); const p = geo.attributes.position; const col = [];
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 1.7 + seed) * Math.cos(z * 1.3 - seed) * 0.6 + Math.sin(y * 2.1 + x) * 0.35;
    if (y > 0) { y = y * 0.22 + 0.4; x *= 1.08; z *= 1.08; } else { const k = -y / 6; y = y * (1.9 + R() * 0.25); x *= 1 - k * 0.72; z *= 1 - k * 0.72; }
    x += n * 0.5; z += n * 0.4; y += n * 0.3; p.setXYZ(i, x, y, z);
    const dark = THREE.MathUtils.clamp(0.35 + y * 0.05, 0.12, 0.5);
    col.push(dark * (cosmic ? 0.75 : 0.95), dark * (cosmic ? 0.62 : 0.82), dark * (cosmic ? 1.05 : 0.9));
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }));
  group.add(rock);

  // billboard: thick dark frame + replaceable image plane
  const frameMat = new THREE.MeshStandardMaterial({ color: cosmic ? 0x241a2e : 0x2a1a12, roughness: 0.85 });
  const bw = 7.2, bh = 4.05, fy = 1.1 + bh / 2 + 1.2;
  const bars = [[0, fy + bh / 2 + .2, bw + .9, .42], [0, fy - bh / 2 - .2, bw + .9, .42], [-bw / 2 - .25, fy, .42, bh + .8], [bw / 2 + .25, fy, .42, bh + .8]];
  for (const [x, y, w, h] of bars) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, .4), frameMat); b.position.set(x, y, 0); group.add(b); }
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.35, fy - bh / 2, .35), frameMat); leg.position.set(s * (bw / 2 - .4), (fy - bh / 2) / 2 + .4, 0); group.add(leg); }
  const tex = image ? tl.load(image) : soonTexture(title); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const imgMat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.6, 0.6, 0.6), toneMapped: false });
  const img = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), imgMat); img.position.set(0, fy, 0.21); group.add(img);

  // torches
  const fr = frames(), torches = [];
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.09, .13, 2.6, 6), frameMat); post.position.set(s * (bw / 2 + 1.3), 1.7, 0.6); group.add(post);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: fr[0], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    fl.position.set(s * (bw / 2 + 1.3), 3.45, 0.6); fl.scale.set(1.3, 1.6, 1); fl.center.set(0.5, 0.15); group.add(fl);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .5, toneMapped: false }));
    gl.position.copy(fl.position); gl.position.y += .4; gl.scale.set(5, 5, 1); group.add(gl);
    torches.push({ fl, gl, off: R() * 24 | 0 });
  }
  // a few flags on poles
  const flagMat = new THREE.MeshStandardMaterial({ color: cosmic ? 0x7a3cff : 0xd2402a, side: THREE.DoubleSide, roughness: .8, emissive: cosmic ? 0x1a0a40 : 0x200500 });
  for (let k = 0; k < 2; k++) { const a = R() * 6.28, r = 3.5 + R() * 1.5;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 3.2, 5), frameMat); pole.position.set(Math.cos(a) * r, 2.0, Math.sin(a) * r - 1.5); group.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .6, 6, 1), flagMat); flag.position.set(pole.position.x + .55, 3.2, pole.position.z); group.add(flag); torches.push({ flag }); }

  const baseY = { v: null };
  return {
    group, hit: img, labelAnchor: new THREE.Vector3(0, fy + bh / 2 + 1.4, 0),
    update(t, hover, mix){
      if (baseY.v == null) baseY.v = group.position.y;
      group.position.y = baseY.v + Math.sin(t * 0.5 + seed) * 0.35;
      const b = 0.55 + hover * 0.45; imgMat.color.setRGB(b, b, b);
      for (const tc of torches) {
        if (tc.flag) { const a = tc.flag.geometry.attributes.position; for (let i = 0; i < a.count; i++) { const x = a.getX(i) + .55; a.setZ(i, Math.sin(t * 4 + x * 4 + seed) * 0.12 * x); } a.needsUpdate = true; continue; }
        tc.fl.material.map = fr[(((t * 24) | 0) + tc.off) % 24];
        const k = 1 + hover * 0.55; tc.fl.scale.set(1.3 * k, 1.6 * k, 1); tc.gl.material.opacity = 0.35 + hover * 0.5; tc.gl.scale.setScalar(4.5 + hover * 3);
      }
    }
  };
}
