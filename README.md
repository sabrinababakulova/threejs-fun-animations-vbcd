# Crescent Rose

An interactive Three.js reconstruction of Ruby Rose’s Crescent Rose from RWBY, with reversible scythe-to-sniper-rifle transformation.

## Run locally

The **Hatsune Miku** tab opens `/miku`, a second Three.js viewer alongside the
existing Crescent Rose study. Her body holds a fixed portrait pose; fourteen
hair bones form two anchored chains with a spring simulation and adjustable
breeze. Dragging the camera acts as a virtual turntable: angular acceleration
and centrifugal forces make the hair lag, flare and swing through reversals.
Gravity, elastic stiffness and damping settle it after release. Capsule
colliders around the posed body and floor constraints limit clipping, while
fixed segment lengths prevent stretching. The simulation steps at 240 Hz,
independently of rendering. Camera presets, zoom/pan and tab visibility changes
do not inject turn impulses. Set Breeze to **Still air** to isolate the response
to dragging; the motion switch pauses the entire simulation.

The viewer includes Studio/Cel shaded finishes, face/outfit/back camera
presets, reduced-motion support, orbit/zoom controls, and PNG capture.

Miku uses the attributed Animasa v2.3 MMD mesh, converted to a local glTF asset
with refined hair/skin surfaces and materials. Costume additions include the
red `01` arm marking, sleeve control panels, and a chest nameplate. The detailed
iris and hair-strand effects are shaders. This is an adaptation of the classic
MMD model, not an exact Project DIVA asset. Full provenance and the original
distribution readme are in `public/models/miku/CREDITS.md`.

Rebuild the glTF with `node scripts/build-miku-model.mjs`. Run
`node --experimental-strip-types tests/miku.mjs` to verify the skinned asset,
stationary body, fixed hair roots, drag speed and release response, collisions,
settling, angle wrapping, pause behavior, 30/60/144 FPS consistency, and finishes.
Native mesh renders were used to check proportions and pose; browser shader
and UI interaction testing was not performed.

Requires Node 22.13 or newer.

```sh
npm install
npm run dev
```

Open the address printed by the development server. Drag to orbit, scroll or pinch to zoom, and right-drag or use two fingers to pan. Keyboard users can choose camera presets, zoom, reset, and focus each of the five assemblies through the controls.

Choose **Sniper rifle** or **Scythe** under Weapon form to transform. The 2-second sequence retracts the cutting edges and blade spine, folds the tips and lower blade, closes the main hinge, telescopes the shaft, and folds the pommel into a shoulder stock. The muzzle remains at the scythe head. Reverse playback follows the same path. Pause or scrub the progress slider to inspect a pose; the speed selector offers 0.5× (4 seconds), 1× (2 seconds), and 2× (1 second). In rifle mode, **Cycle bolt** shows the straight-pull action.

The viewer also includes studio and matte materials, wireframe inspection, an optional ground grid (off by default), optional rotation, separation of the five assemblies, PNG capture, and GLB export. Exports preserve the current pose with physical materials and baked surface shading and include the full transformation animation. The live studio finish adds procedural microscopic roughness, large softbox reflections, and contact shading; those rendering effects are not embedded in GLB files. Separated parts return smoothly before a conversion begins. Form selection respects reduced-motion preferences; the explicit play button allows users to choose to watch the sequence.

## Model and sources

- `lib/crescent-rose.ts`: editable procedural geometry. The profile coordinates are traced proportionally from the production render, then converted into independent extruded, beveled, and cylindrical meshes.
- `lib/crescent-rig.ts`: nested hinge and slide hierarchy, quintic stage easing, and animation clip sampling. Parts retain their geometry and scale throughout.
- `lib/studio-environment.ts`: photographic softboxes for enamel and steel reflections.
- `lib/surface-finish.ts`: baked surface variation and procedural roughness.
- `lib/transformation-playback.ts`: frame-rate-independent playback, pause, seeking, direction, and speed.
- `lib/viewer-scene.ts`: lighting, environment, camera, interaction, and export.
- `components/crescent-viewer.tsx`: responsive viewer interface.
- [Crescent Rose — RWBY Wiki](https://rwby.fandom.com/wiki/Crescent_Rose)
- [Production images and model reference](https://rwby.fandom.com/wiki/Crescent_Rose/Image_Gallery)
- [Production render used for silhouette proportions](https://vignette.wikia.nocookie.net/rwby/images/5/55/Crescent_Rose.jpg/revision/latest/scale-to-width-down/2000?cb=20161012125928&path-prefix=de)

- [Caroline Eden’s scythe and gun form study](https://carolineeden.net/projects/8b9DAm), consulted for layered construction, surface treatment, and the shoulder stock. This is a secondary artist interpretation, not production artwork.

This is an independently constructed fan model, not an official asset. Dimensions and thicknesses are estimated from reference images, and the model uses arbitrary scene units. The folding sequence is a reference-inspired visual interpretation: hidden mechanisms and precise timings are not an official mechanical blueprint or an engineering simulation. RWBY and Crescent Rose belong to their respective rights holders.

## Verification

```sh
npx tsc --noEmit
npx oxlint app components/crescent-viewer.tsx lib tests
node --experimental-strip-types tests/model.mjs
node --experimental-strip-types tests/transformation.mjs
npm run build
```

The model check verifies finite vertices/normals, assembly separation/reset, and an actual GLB export/import round trip preserving meshes and bounds. It also writes `outputs/crescent-rose.glb` for reuse. The animated GLB is reimported and its intermediate and rifle poses checked. The transformation checks sample 201 poses, verify fixed hinge axes and rigid geometry, exercise pause/seeking and 30/60/144 FPS timing, and test 30 return cycles for drift. Offline Three.js SVG pose sheets and native SceneKit renders of the exported geometry were inspected against the production silhouette and folded-form study. These inspect geometry and material proportions; they do not substitute for testing the website’s WebGL effects. Regression checks also keep the shoulder details attached, verify stock placement, and time the one-second fast mode. The entire starter's lint command reports existing findings in unused vendored UI components; project-specific code is checked separately.

Feature-detected `inspect_crescent_rose`, `start_crescent_rose_transformation`, and `read_crescent_rose_state` WebMCP tools expose inspection, animation start, and playback readback when the browser supports `document.modelContext`. Inputs are validated and registrations are removed on unmount. No supported WebMCP validation context was available during implementation; their browser contracts remain unverified. Browser UI interaction tests were not run.

## Navier–Stokes swirl

The **Navier–Stokes** tab opens `/navier-stokes`, a third Three.js study inspired
by the supplied vortex image. Eighty-four tapered, elliptical strands travel
inward and out along both ends of the axis. The controls provide viscosity
(0.015–0.300 in dimensionless units), playback speed (0.25–3×), pause, reset,
a singularity timeline, flow guides, three camera views, zoom, and PNG capture.
Reduced-motion preferences pause initial playback; explicitly pressing Play
opts into motion. Background tabs suspend rendering and resume without a jump.

The regular flow is an analytic **Burgers vortex**, using radial velocity
`u_r = -a r/2`, axial velocity `u_y = a y`, and angular velocity
`omega(r) = Gamma/(2 pi r²) (1 - exp(-a r²/(4 nu)))`.
Here `a = 0.65` and `Gamma = 22`. Increasing viscosity broadens the core
`sqrt(4 nu/a)` and lowers peak angular rotation. Path positions use analytic
radial/axial motion and Simpson integration of angular motion. Sampling becomes
finer at low viscosity. A single merged mesh uses a custom physical-material
vertex shader to move tapered packets along these paths without rebuilding
geometry each animation frame. Color encodes angular rate relative to the
current peak, not absolute linear speed. Changing playback speed changes only
the clock. Camera movement does not drive the fluid.

**Singularity is a schematic**, not the paper's full solution or a numerical
Navier–Stokes solver. It scales the Burgers geometry using the paper's Section 2
length exponents: radial `tau^0.5`, axial `tau^(0.5-h)`, with `h = 0.005` and
`tau = 1 - t/T`. Both dimensions shrink; radius shrinks faster. Its angular
clock accelerates as `tau^(-1-h)`. Playback stops at `t/T = 0.99` to keep all
values finite. Scrubbing pauses, and Replay restarts a finished collapse.
The construction's pressure, forcing, oscillatory corrections, and energy
balance are not computed in this viewer.

References consulted:

- [OpenAI — On the Navier–Stokes Millennium Prize Problem](https://openai.com/index/navier-stokes-solution/): visual reference and inward-flow/axial-stretching description.
- [OpenAI — Finite Time Blowup for Navier–Stokes, §2](https://cdn.openai.com/pdf/32d9f210-8b73-45e0-91bc-82a30aef8a9a/navier-stokes.pdf): shrinking-core and velocity scaling.
- [Gallay & Maekawa — Three-dimensional stability of Burgers vortices](https://arxiv.org/abs/1002.2489): analytic background vortex and viscous core.
- [Three.js — BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html): merged attributes for GPU rendering.

Implementation: `lib/navier-stokes-flow.ts` contains the field and playback,
`lib/navier-stokes-model.ts` builds the strands and their shader,
`lib/navier-stokes-scene.ts` owns the renderer and its lifecycle, and
`components/navier-stokes-viewer.tsx` supplies the interface.

Run `node --experimental-strip-types tests/navier-stokes.mjs` to check finite
geometry and normals across the viscosity range, incompressibility, trajectories
against velocity derivatives, inward packet motion, viscosity response,
30/60/144 FPS playback consistency, pause, and the singularity cutoff.
TypeScript, project-specific lint, and the production build are also checked.
A native SceneKit render of the baked strand geometry was inspected against
the reference; this checks shape and color placement, not the browser shader.
The local route returns HTTP 200. Browser/WebGL interaction testing has not
been performed.
