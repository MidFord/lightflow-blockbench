# Lightflow 3.0 — Known Issues and Open Risks

This is a development defect/risk register, not a promise that every item reproduces in every scene. Items are kept here until they are either fixed with a regression test or explicitly closed as obsolete.

## P0 — Release blockers

### Screen-space source is offset/scaled in screen-reading materials

**Area:** Shader Architect / Material Studio / screen access  
**State:** unresolved

Screen-reading material experiments have shown the captured scene appearing spatially offset and scaled even when distortion strength is effectively disabled. This invalidates glass/refraction-style materials because the baseline sample does not line up with the underlying scene.

Additional observations from development testing:

- the offset can persist without intentional distortion;
- repeated/duplicated scene geometry has also been observed in affected screen-material experiments;
- alpha can fall back to black instead of preserving the intended scene/background behavior;
- display/DPR scaling (including Windows scale factors such as 1.5) is a plausible coordinate-conversion suspect, but it must not be recorded as the root cause until demonstrated.

**Acceptance:** a zero-distortion material must reproduce the underlying screen 1:1 at multiple DPR values, viewport sizes, camera zooms and Studio Render configurations.

### Rendercraft / Lightflow performance is not release-proven

**Area:** Shader Architect / frame pipeline / warmup  
**State:** unresolved

Development builds have shown significant cost in complex Lightflow/Rendercraft modes, including long warmup transitions and frame-rate drops as scene complexity increases. The newer compiler/frame architecture is designed to reduce structural shader churn, but it still needs controlled benchmarks.

**Acceptance:** publish benchmark scenes and measure cold warmup, warm transition, steady viewport frame time, shadow update time and each major frame-graph pass separately.

### Marketplace/distribution packaging strategy is unresolved

**Area:** release engineering  
**State:** unresolved

The current development snapshot is much larger than the older public source. `shader_architect.js` is over 2 MB by itself. Any historical Marketplace size limit must be rechecked against current submission rules, and the project may need bundling/module-boundary changes before publication.

**Acceptance:** prove the intended distribution path accepts the packaged modules without removing required source functionality.

---

## P1 — High priority

### Bedrock optimized preview transform mismatch

**Area:** Bedrock Structure Studio  
**State:** unresolved

Optimized baked chunk geometry has shown a visible mesh offset relative to logical structure coordinates.

**Acceptance:** logical cell bounds, selection raycast, baked preview and editable bake occupy the same world-space coordinates for structures with non-zero origin, multiple chunks and partial block shapes.

### Bedrock Textured/Classic material parity

**Area:** Bedrock Structure Studio ↔ Shader Architect bridge  
**State:** unresolved

In development testing, optimized structure blocks can appear too opaque/different in normal Textured mode while appearing closer to expected Classic behavior after switching to Lightflow preview. The active view-mode material policy needs to be authoritative and symmetric.

**Acceptance:** opaque, alpha-test, translucent and vegetation pages match expected texture/alpha behavior in Textured and Lightflow view modes without one mode accidentally repairing another.

### Tall grass upper/lower state resolution

**Area:** Bedrock resource-pack resolver  
**State:** unresolved

`tall_grass` must reliably select the correct top/bottom texture based on `upper_block_bit`, including Bedrock aliases such as `tall_grass_top`, `tall_grass_bottom` and carried texture definitions.

**Acceptance:** structures containing both halves of tall grass resolve correctly from representative vanilla/resource-pack definitions and survive atlas rebuilds.

### Bush/grass biome tint parity

**Area:** Bedrock tint resolver  
**State:** validation required

Grass-family cross blocks, including `minecraft:bush`, must receive the same intended biome grass/foliage tint semantics as corresponding Bedrock terrain rendering.

### Texture Relief parity across final rendering

**Area:** Rendercraft / Studio Render  
**State:** validation required

Texture Relief must maintain meaningful edge detection, width and lighting response across camera distance, viewport, tiled rendering and multiple supersampling factors.

### Rendercraft rim/outline stability

**Area:** Shader Architect  
**State:** validation required

Promotional rim/outline behavior still needs an extreme-angle, distance, thin-geometry and occlusion pass.

---

## P2 — Important stabilization work

### Cinematic long-sequence robustness

Validate thousands of sequential frames, cancellation at arbitrary points, directory failures, project changes and partial-manifest correctness.

### Cinematic deterministic restoration

After preview/render, camera, Timeline, animation state, shader time, environment state, frame region and renderer settings must return to their prior values.

### Visual Shader Graph format-3 migration fixtures

Create saved graph fixtures for current and older formats. Import/parse/sanitize/export must be deterministic, and unsupported newer versions must fail with a useful error rather than partial corruption.

### Visual Shader Graph large-canvas performance

Stress 500–2,000 node graphs for interaction, validation and compile scheduling. The hard limit is not itself proof that the editor is usable near the limit.

### Atmosphere + Environment + renderer combined cost

Profile worst-case composition: multiple volumes, cloud environment, high shadow quality, Rendercraft, AO, SSR and realtime Bloom together.

### Project persistence/migration audit

Inventory every persisted Project property and custom element property. Assign a schema/version/migration decision to each subsystem before a release candidate.

---

## Historical issues that must stay in regression coverage

These were addressed or partially addressed during development and should not silently return:

- Rendercraft/PBR/Lightflow shader compile failures caused by duplicated declarations or invalid generated GLSL.
- Texture Relief derivative-basis compile failures in Studio Render.
- selective Bloom leaking from hidden emissive surfaces through foreground geometry.
- nearest-neighbor supersample overlay introducing seams/false high-frequency contrast.
- resource-pack atlas treating unused transparent atlas pixels as evidence that an opaque page should become alpha-tested.
- grass-side tinting the dirt/base layer instead of only the intended grass overlay.
- native Blockbench preview lights contaminating Lightflow-owned render modes.
- shadow-map recreation or redundant restoration work on every Studio Render tile.
- plugin unload leaving owned window bindings, timers, helpers or patched behavior behind.
