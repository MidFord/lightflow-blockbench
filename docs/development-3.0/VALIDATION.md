# Lightflow 3.0 — Validation Matrix

Automated syntax validation is necessary but not sufficient. Lightflow is a Blockbench/WebGL system, so release confidence requires deterministic runtime fixtures.

## Automated baseline

### Syntax

All root plugin modules must pass:

```bash
node --check light_manager.js
node --check shader_architect.js
node --check studio_render.js
node --check lightflow_environment.js
node --check lightflow_atmosphere.js
node --check lightflow_cinematic.js
node --check visual_shader_graph.js
node --check bedrock_structure_studio.js
```

### Existing regression harness

Run:

```bash
npm test
```

The existing release-candidate tests should be expanded so new 3.0 subsystems are not syntax-only.

## Required runtime matrix

### Host matrix

At minimum test:

- supported Blockbench Desktop version used for development;
- one current Chromium/web build when web behavior is intentionally supported;
- Windows DPR/display scales 100%, 125%, 150%, 200% for screen-space coordinates;
- dedicated-GPU execution and at least one lower-capability GPU profile where practical.

### Material/render fixtures

Every fixture should be captured in Textured/Classic and Lightflow modes where relevant, plus a Studio Render output.

1. Classic textured cube.
2. Alpha-test vegetation.
3. Transparent glass/water-like material.
4. Emissive surface behind opaque occluder.
5. Rendercraft bevel + connected clip.
6. Rendercraft inner glow + rim.
7. Texture Relief with hard pixel boundaries and flat regions.
8. PBR metallic/roughness with normal/height detail.
9. Screen-color passthrough at zero distortion.
10. SSR reflective surface with moving camera.
11. AO contact fixture with moving geometry.

### Lighting fixtures

- one point light;
- one spot light;
- one directional light;
- mixed colored lights;
- shadow preset transitions;
- animated light;
- light hidden through hierarchy;
- environment directional light together with Light Manager lights.

### Studio Render fixtures

For key material fixtures render:

- 1×, 2×, 4× and 8× supersampling where supported;
- tiled and single-tile cases;
- transparent and opaque backgrounds;
- Bloom on/off;
- color grading on/off;
- frame/crop region;
- 1080p and 4K baseline, with 8K stress cases.

Compare edge alignment, alpha, relief width, rim width, Bloom radius and camera framing.

### Cinematic fixtures

- 24, 30 and 60 fps sequences;
- fractional-rate preset where supported;
- static camera repeated frames (must be pixel-stable except intentional temporal effects);
- animated camera;
- animated model + animated light + time-driven shader;
- project switch while idle;
- cancel mid-render;
- filesystem failure/permission failure;
- partial manifest creation;
- final state restoration.

### Shader Graph fixtures

- empty surface;
- exact Classic/Lightflow/PBR/Rendercraft graphs;
- vertex displacement through Geometry Attribute/Varying/Vertex Output;
- scene color/depth sampling;
- subgraph nesting;
- invalid type connection;
- cyclic/invalid graph handling;
- import/export round trip;
- project save/reopen round trip.

### Bedrock Structure fixtures

Use small deterministic `.mcstructure` fixtures containing:

- solid cubes;
- slab/stair partial shapes;
- cross vegetation;
- bush/short grass;
- both halves of tall grass;
- leaves;
- water;
- glass;
- animated texture block;
- block entity;
- entity;
- non-zero structure/world origin;
- dimensions crossing 16×16 chunk boundaries.

Validate NBT round trip independently from visual preview.

## Performance measurements

For every reference scene record:

- cold plugin load;
- first Lightflow-mode activation;
- shader warmup duration;
- steady viewport FPS/frame time;
- shadow-only update time;
- AO cost;
- SSR cost;
- Bloom cost;
- Atmosphere cost;
- structure chunk rebuild time;
- atlas build time;
- Studio Render time per megapixel/sample;
- Cinematic time per frame and output-write throughput.

Performance numbers are only comparable when the scene, camera, resolution, DPR, module versions and GPU are recorded.

## Release acceptance

A release candidate needs:

- zero known P0 issues;
- all P1 issues fixed or explicitly deferred with a safe disabled default;
- deterministic project persistence for supported formats;
- no uncaught errors during normal load/unload/project-switch cycles;
- no repeatable WebGL errors/context loss in reference fixtures;
- documentation matching the actual UI and dependency order;
- packaging validated on the intended distribution channel.
