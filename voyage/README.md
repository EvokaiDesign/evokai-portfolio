# AI Voyage (`#voyage`)

Scroll-driven 3D section: sunset ocean → edge of the world → cosmic ocean, with project islands.

- `voyage.js` is the built file the site loads (only when someone opens `#voyage`).
- `src/` is the source. Rebuild after editing:
  ```
  npm i three@0.187.0 esbuild
  npx esbuild voyage/src/main.js --bundle --format=esm --minify --target=es2020 --outfile=voyage/voyage.js
  ```
- Ship model: `media/voyage/ship-v1.glb` (exported from Blender, meshopt-compressed, ~0.6 MB).
  Objects are matched by name: `Web_Bone`, `Web_Sails`, `Web_Glow`. Custom attributes `_ember` (bone glow) and `_t` (sail gradient position).
  Replacing it: give the new file a new name (media is cached for 30 days) and update `SHIP_URL` in `src/main.js`.
- Islands: `STOPS` in `src/main.js`. `slug` = a project from `P` in index.html; `null` = "Coming soon" placeholder.
- Testing: `?vu=0.5#voyage` starts the journey half way (0 = start, 0.62 = the edge, 1 = end).

## v4 notes
- Islands are low-poly and built in `src/islands.js` (`islandBody`, `lowTree`, `lowRock`, `waterworks`); static parts are merged per material.
- Going to an earlier stop turns the ship round first (`face` in `main.js`); it turns back on the next forward step.
- Loading screen: `.v-load` in `index.html`; progress = 12% code, then GLB bytes + texture count, 90% shader warm-up (`compileAsync`), 100% → instructions → fades after 2.4 s or any input.
- Phones (`hover: none`): 1× resolution, no post passes or shadows, `LITE` shader define (fewer noise octaves), one nebula layer, fewer particles.
- Tests: `?vu=0.42&vsnap` starts at a stop and settles the camera instantly (also skips the shader warm-up).
