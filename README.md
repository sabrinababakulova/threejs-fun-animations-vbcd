# Crescent Rose

An interactive Three.js reconstruction of Ruby Rose’s Crescent Rose from RWBY, in its fully extended scythe form.

## Run locally

Requires Node 22.13 or newer.

```sh
npm install
npm run dev
```

Open the address printed by the development server. Drag to orbit, scroll or pinch to zoom, and right-drag or use two fingers to pan. Keyboard users can choose camera presets, zoom, reset, and focus each of the five assemblies through the controls.

The viewer includes studio and matte materials, wireframe inspection, a ground grid, optional rotation, separation of the five assemblies, PNG capture, and GLB export. Exports always contain the assembled scythe with the original studio materials.

## Model and sources

- `lib/crescent-rose.ts`: editable procedural geometry. The profile coordinates are traced proportionally from the production render, then converted into independent extruded, beveled, and cylindrical meshes.
- `lib/viewer-scene.ts`: lighting, environment, camera, interaction, and export.
- `components/crescent-viewer.tsx`: responsive viewer interface.
- [Crescent Rose — RWBY Wiki](https://rwby.fandom.com/wiki/Crescent_Rose)
- [Production images and model reference](https://rwby.fandom.com/wiki/Crescent_Rose/Image_Gallery)
- [Production render used for silhouette proportions](https://vignette.wikia.nocookie.net/rwby/images/5/55/Crescent_Rose.jpg/revision/latest/scale-to-width-down/2000?cb=20161012125928&path-prefix=de)

This is an independently constructed fan model, not an official asset. Dimensions and thicknesses are estimated from reference images, and the model uses arbitrary scene units. The folding/transformation sequence is not implemented. RWBY and Crescent Rose belong to their respective rights holders.

## Verification

```sh
npx tsc --noEmit
npx oxlint app components/crescent-viewer.tsx lib tests
node --experimental-strip-types tests/model.mjs
npm run build
```

The model check verifies finite vertices/normals, assembly separation/reset, and an actual GLB export/import round trip preserving meshes and bounds. It also writes `outputs/crescent-rose.glb` for reuse. A separate offline Three.js SVG render was inspected against the source silhouette. The entire starter's lint command reports existing findings in unused vendored UI components; project-specific code is checked separately.

A feature-detected `inspect_crescent_rose` WebMCP tool exposes part focusing and material selection when the browser supports `document.modelContext`. Inputs are validated and registrations are removed on unmount. No supported WebMCP validation context was available during implementation; its browser contract remains unverified. Browser UI interaction tests were not run.
