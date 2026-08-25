# Lightflow 3.0 — Module Status

This document records what is actually present in the 2026-08-24 development snapshot. It deliberately distinguishes implementation from release readiness.

## 1. Light Manager 1.8.2

**Role:** foundation dependency for the Lightflow suite.

### Implemented

- Native Lightflow `LightElement` workflow for point, spot and directional lights.
- Dedicated Three.js light registration and shared `three_lights` / light group integration.
- Light presets including fill, key and directional/sun-oriented starting points.
- Preview and Studio Render shadow settings with separate resolution handling.
- Shadow bias, automatic/derived normal bias, softness, near/far and directional bounds controls.
- Shadow invalidation, dirty-state tracking and render preparation hooks.
- Visibility-aware light hierarchy handling.
- Area/direction gizmos and global gizmo visibility integration.
- Direct manipulation tools including free move, fit-to-selection and block/grid snapping.
- Light animation support through `LightAnimator`.
- Shared UI component infrastructure used by later Lightflow plugins.
- `LightflowLifecycle` hydration framework for project/module synchronization.
- Public integration hooks used by Shader Architect and Studio Render, including render preparation and shadow invalidation.

### Validation / unfinished

- Bone/armature parenting remains a development requirement; light hierarchy support is broader than the original release, but animation-rig parenting still requires a final supported workflow.
- Shadow quality must be benchmarked together with the newer Shader Architect frame pipeline instead of in isolation.
- Gizmo and selection behavior should be regression-tested with every custom Outliner element type introduced by Cinematic and Structure Studio.

---

## 2. Shader Architect 3.2.6

**Role:** material authoring system and central renderer orchestration layer.

### Material system

- Classic material path.
- Current Lightflow surface shader plus legacy compatibility identity.
- PBR metallic/roughness path.
- Rendercraft (`cinematic_craft`) with legacy `luma_forge` compatibility ID.
- Pixelated/stylized Lightflow variants.
- Custom GLSL materials and `.samat` import/export.
- Material instances with project persistence, rebasing, per-element and per-face assignment.
- Mesh, Texture Mesh, Cube and Bedrock Structure Studio element integration.
- Auto-tile state and per-face material behavior.

### Rendercraft

The current code represents the fourth-generation Rendercraft direction rather than the earlier BRDF-heavy experiment. The development line includes:

- directional stylized face shading;
- rewritten bevel with width/profile/light controls;
- connected-bevel / seam suppression logic;
- corner fading and directional edge response;
- inner/edge glow controls;
- promotional silhouette/rim system with core/halo behavior and occlusion handling;
- Texture Relief derived from meaningful texture boundaries;
- relief highlight/shadow/polish controls;
- extensive artistic blend modes and HSV-oriented adjustments;
- transparency controls, Fresnel density and absorption-oriented treatment;
- Rendercraft-specific Bloom signal integration;
- Light Manager color/direction integration;
- Studio Render sample-scale/high-frequency-detail cooperation.

### Renderer architecture

Shader Architect now exposes a substantially more explicit renderer platform:

- `LightflowRenderer` architecture version `renderer-architecture-v2-rendercraft-fidelity`.
- Separate program compilers for Rendercraft, PBR and Lightflow surface families.
- Structural shader feature bucketing and compiler caches.
- External renderer preparation for Studio Render.
- Shared shader warmup and asynchronous compilation support.
- Frame-resource graph and renderer pass isolation controls.
- Performance profiler, diagnostics and configurable frame-budget controller.
- Canonical animation/frame-time context.
- Shared screen access manager.
- Current-frame clean scene color/depth capture for screen-reading materials.
- Global SSR resolve architecture reading scene color, depth, surface and emission buffers.
- Hi-Z / temporal infrastructure and GTAO-oriented AO path.
- Explicit light/shadow synchronization with Light Manager.

### Validation / unfinished

- Screen-space scene sampling still needs final coordinate-system validation. Recent development exposed a reproducible offset/scale mismatch in screen-reading materials even with distortion disabled; DPR/display scaling is one suspected contributor, but the root cause must be proven in code.
- Material Studio screen access must not capture the reading object into its own source texture.
- Repeated/copy-like geometry artifacts in screen-reading materials remain a release blocker until reproduced against the current frame pipeline.
- Warmup latency and transition behavior need measurement after the recent architecture changes.
- Renderer performance remains a primary release gate for large scenes and high-complexity Rendercraft materials.
- Extreme camera-angle/distance behavior for promotional rim/outline still needs a final pass.
- Texture Relief must be validated across viewport, tiles and multiple supersampling factors.

---

## 3. Studio Render 1.9.10

**Role:** final still rendering and realtime composition.

### Implemented

- 1080p, UHD, DCI 4K, square 4K, 8K and custom output presets.
- Maximum-dimension/pixel safety guards.
- Tiled rendering with camera view offsets and shared tile bleed.
- Supersampling with progressive high-quality reduction rather than nearest-neighbor overlay.
- Sample jitter and frame-aware camera handling.
- Transparent output.
- PNG encoding with Worker + OffscreenCanvas fast path and fallback.
- Scene Composer UI.
- Realtime and final Bloom with Rendercraft-selective signal support.
- Bloom foreground-depth occlusion handling.
- Exposure, contrast, saturation, temperature, tint and vignette grading.
- Camera presets and frame/crop region management.
- Shader Architect external-program preparation and warmup integration.
- Light Manager render preparation and shadow-map reuse.
- WebGL error/context-loss detection and GPU completion handling.
- Public `StudioRender` API used by Cinematic.

### Validation / unfinished

- Full parity matrix with Shader Architect 3.2.6 is still required.
- Bloom parity between realtime Scene Composer and final tiled render must be verified on translucent/cutout Rendercraft materials.
- Texture Relief width/detail must remain stable across sample factors and tiles.
- High-resolution memory pressure must be tested on realistic 4K/8K scenes, not only minimal cases.
- Cancellation and state restoration must be stress-tested when Cinematic drives repeated frame renders.

---

## 4. Lightflow Environment 1.9.0

**Role:** global sky/environment visual and lighting state.

### Implemented

- Full-sky editable gradient model extending below the horizon.
- Day, sunrise and night gradient states with multiple stops and midpoint interpolation.
- Ground color integrated into the sky gradient system.
- Time-of-day control and deterministic sky state.
- Vanilla-style deterministic stars.
- Sun and moon rendering with textured celestial support.
- Environment ambient strength and directional response.
- Reflections/environment texture generation for other Lightflow systems.
- Directional environment shadow integration.
- Rendercraft and Vanilla-oriented cloud shading modes.
- Cloud top/sun/shadow/bottom/edge palette controls.
- Cloud bevel width, strength, roundness, smoothing and distance scaling.
- Palette, sky-derived and mixed cloud lighting.
- Cloud fog with sky-derived or custom color and distance controls.
- Project presets and migration support for older gradient settings.

### Validation / unfinished

- Wider camera-distance tuning for cloud bevel/fog.
- Broader parity testing with Rendercraft color response, transparency and Bloom.
- Performance validation with dense clouds plus Atmosphere volumes and screen-space renderer passes active together.

---

## 5. Lightflow Atmosphere 1.2.0

**Role:** localized volumetric effects.

### Implemented

- Volume Domains with local transform/shape control.
- Uniform, height and cloud density modes.
- Physical compositing and shaft-oriented compositing.
- Fog/mist, godray, cloud, stage haze and cinematic dust presets.
- Scattering, absorption, anisotropy, ambient contribution and edge feather controls.
- Procedural noise/coverage/erosion controls for cloud-like domains.
- Light and shadow reception with finite supported light/shadow budgets.
- Preview/render quality presets and independent render scale.
- Static caching, frustum culling and helper-mask behavior.
- Temporal jitter option and adaptive quality foundations.
- Global gizmo visibility participation.

### Validation / unfinished

- Still considered active beta relative to the core lighting/material path.
- Must be profiled together with the newer frame-budget controller.
- Multi-volume overlap and shadow correctness need broader scene testing.

---

## 6. Lightflow Cinematic 0.1.0

**Role:** deterministic sequence/camera and repeated-frame render orchestration.

### Implemented foundation

- Versioned project document persisted in the Blockbench project.
- Multiple named sequences.
- Frame-rate presets using numerator/denominator representation.
- Sequence start/end, timing conversion and frame timestamps.
- Active sequence/camera management.
- Physical camera model using sensor dimensions, focal length and FOV conversion.
- Camera creation from the current view and view update from a camera.
- Camera Outliner element and gizmo integration.
- Camera keyframes, interpolation controls and Blockbench Timeline integration.
- Deterministic frame evaluation and explicit frame context publication.
- Play/pause/jump tooling integrated with animation mode.
- Adaptation of cinematic sequences to the active animation.
- Studio Render frame consumption.
- Streaming PNG sequence rendering rather than accumulating all frames in memory.
- Per-sequence manifest writing, including partial manifest on abort.
- Desktop directory and Chromium File System Access targets.
- Capability reporting for Studio Render, WebCodecs, MediaRecorder and directory streaming.
- Recommended current desktop workflow: PNG sequence followed by FFmpeg encoding.
- Render cancellation and project-change cleanup.

### Experimental / unfinished

- Direct encoded video/muxing is not yet the production path.
- Long-sequence memory, filesystem throughput and cancellation behavior need stress tests.
- Animation + camera + Studio Render state restoration needs deterministic regression tests.
- Shot/sequence editing UX is early and may change.
- Audio, editorial tracks, transitions and higher-level cinematic tooling are not yet considered complete.

---

## 7. Visual Shader Graph 1.2.0

**Role:** node-based shader authoring that compiles to Shader Architect.

### Implemented foundation

- Graph format version 3 with project persistence and portable graph serialization.
- Typed connection model supporting bool, int, float, vectors, colors and textures.
- Separate vertex and fragment stages.
- Geometry Attribute nodes.
- Explicit custom Varying nodes from vertex to fragment.
- Vertex Output and Surface/Preset Output paths.
- Exact uniform references and exposed material parameters.
- Shader Architect material compilation and global/selection application.
- Exact preset graphs for Lightflow, Rendercraft, PBR and Classic.
- Native graph presets including unlit texture, Lightflow surface, PBR surface, toon, hologram, vertex wave and Stage I/O demo.
- Subgraphs with typed inputs/outputs and subgraph instances.
- Custom global GLSL and custom expression nodes.
- Scene/screen nodes for scene color, depth, view/world position and screen information.
- Texture Relief, triplanar, auto-tile and procedural texture utility nodes.
- Validation, diagnostics, graph repair and live preview foundations.
- English and Spanish UI strings.

### Node inventory

The snapshot contains **111 node definitions**:

- Stage I/O: 3
- Outputs: 2
- Texture: 8
- Parameters: 8
- Inputs: 20
- Scene & Screen: 8
- Math: 35
- Vector: 10
- Lighting: 4
- Utility: 8
- Advanced: 5

### Experimental / unfinished

- Needs compatibility tests against every supported Shader Architect compiler family.
- Screen nodes inherit any unresolved screen-access coordinate issue from the renderer.
- Graph migration/versioning needs fixtures before format 3 can be treated as stable.
- Large graph editor performance and compile debouncing need stress tests.
- More authoring ergonomics, documentation and production examples are required before public release.

---

## 8. Bedrock Structure Studio 2.2.1

**Role:** edit and render Minecraft Bedrock `.mcstructure` data directly in Blockbench.

### Data and editing layer

- Dependency-free little-endian NBT reader/writer.
- Complete classic NBT tag coverage and typed JSON support.
- `.mcstructure` validation and semantic model.
- Round-trip preservation of block palettes, states, block entities, entities, position data and related NBT.
- Logical 1×1×1 block-cell representation separated from visual shape.
- Custom shape resolution for slabs, stairs, plants and other partial geometry, with external resolver support.
- Block topology analysis and connected-state derivation.
- Custom Block Outliner element.
- Add/edit/move/duplicate/delete logical block operations.
- Entity editing.
- Exact structure bounds/world-origin handling.
- Export back to `.mcstructure`.

### Optimized preview architecture

- Derived baked chunk elements instead of one heavyweight editable cube per visible block.
- Default Minecraft-style **16×16 X/Z chunks** spanning the full structure height.
- Face culling against block topology.
- Render layers: solid, vegetation/cross, translucent and animated.
- Static resource-pack textures packed into shared atlas pages.
- Separate atlas pages/material policies for opaque, alpha-test and blend behavior.
- Animated flipbooks kept outside the static atlas fast path.
- Biome-aware grass, foliage and water tint logic.
- Layered grass-side handling where dirt remains untinted and the grass overlay receives biome color.
- Vanilla-oriented tint-method inference for vegetation.
- Resource-pack `terrain_texture` / block metadata resolution.
- Lightflow/Shader Architect bridge for optimized chunk meshes.
- Logical picking/selection while optimized meshes are displayed.
- Optional bake to native editable Blockbench meshes.

### Experimental / unfinished

- A mesh transform/alignment offset has been observed in the optimized preview path and must be resolved before declaring spatial parity.
- Textured/Classic view material parity has shown opacity/appearance differences versus Lightflow view and needs a single authoritative material policy.
- `minecraft:bush`/grass-family tint handling needs final verification.
- `minecraft:tall_grass` requires reliable upper/lower texture resolution from `upper_block_bit` state and the Bedrock texture aliases for top/bottom/carried variants.
- Resource-pack atlas readiness and bridge material synchronization need regression fixtures.
- Outliner presentation should continue to represent logical editing cleanly without exposing derived render internals as user-authored objects.
- Very large structures require performance/memory benchmarks with multiple atlas pages, vegetation and animated textures.

---

## Cross-module maturity summary

| Area | State |
| --- | --- |
| Core lighting | Integrated |
| Core material assignment | Integrated |
| Rendercraft visual feature set | Functional, validation required |
| Screen-space renderer architecture | Major active development |
| Still rendering | Integrated, parity validation required |
| Environment | Functional / integrated |
| Local volumetrics | Functional / beta |
| Cinematic sequencing | Experimental but substantial |
| Visual Shader Graph | Experimental but substantial |
| Bedrock structure workflow | Experimental but substantial |
| Release packaging | Not ready |
