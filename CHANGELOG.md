# Changelog

All notable changes to Lightflow for Blockbench will be documented in this file.

Lightflow uses a suite release version for public downloads. Individual plugins also keep their own internal versions because they can evolve at different speeds.

## [Unreleased]

### RC 5 interactive performance and transparency

- **Studio Render 1.6.1:** preserves the destination alpha during additive viewport Bloom, so Blockbench's transparent checkerboard remains visible instead of becoming an opaque black background.
- **Shader Architect 2.8.0:** removes the full light/shadow preparation accidentally triggered by uniform-only updates and no longer treats ordinary Cube transforms as lighting changes.
- Geometry, face, and UV events now rebuild only the affected render element; light arrays, vectors, shadow-index maps, and active-preview rendering are reused or coalesced instead of recreated for every slider step.
- **Light Manager 1.6.5:** light transforms explicitly skip scene shadow-mesh traversal and reuse update scratch objects rather than allocating world-space vectors for every light and frame.
- **Lightflow Atmosphere 1.1.0:** separates depth and volume signatures. Light/color/intensity changes reuse the unchanged scene depth and rerun only the volumetric lighting pass; optical volume edits also retain depth, while actual geometry transforms invalidate it without rebuilding the scene partition.
- Atmosphere selection updates no longer invalidate volumetric rendering, preview requests are frame-coalesced, and light-element lookup no longer performs a repeated linear search inside the raymarch setup.
- **Lightflow Environment 1.2.0:** coalesces environment uniform updates and renders only the active preview, avoiding a second full render of every Blockbench preview during time animation and live panel edits.
- These changes target high-refresh interactive editing, but the achieved frame rate still depends on GPU, viewport size, shadow resolution, volume quality, scene complexity, and Blockbench itself.

### RC 4 native GPU viewport composition

- **Studio Render 1.6.0:** replaced the realtime CPU readback/Canvas2D overlay with a GPU-resident emissive mask, three-level downsample Bloom pyramid, and direct framebuffer composition.
- Fixed the 1.25× Bloom scale/offset on Windows display scaling by never passing physical render-target dimensions through Three r129's DPR-multiplying `setViewport()` path.
- Added Adaptive quality, automatic internal-resolution hysteresis, synchronized uncapped viewport updates, and optional FPS caps from 1–144.
- Moved Scene Composer scheduling to a coalesced microtask after AO/Atmosphere wrappers but before browser presentation, removing the extra frame of latency.
- **Lightflow Atmosphere 1.0.1:** preserves target-local viewport/scissor state when Atmosphere is composed into Bloom or other offscreen targets.
- **Light Manager 1.6.4:** Volume Domain selection proxies are explicitly excluded from shadow casting and receiving.
- Volume Domain proxy meshes now carry their own no-shadow marker and continuously enforce `castShadow = false`, preventing the invisible editing cube from occluding its contents or projecting a solid box shadow.

### RC 3 viewport and environment workflow

- **Studio Render 1.5.1:** moved Scene Composer into a resizable panel attached inside **Lightflow Render** instead of occupying a generic Blockbench sidebar slot.
- Replaced the realtime full-resolution visible-canvas Bloom capture with a reduced offscreen WebGL mask, reusable processing canvases, DPI-aware quality profiles, and a 30 FPS safety cap.
- Realtime Bloom now preserves the Shader Architect AO-composited base frame, excludes Blockbench helpers/gizmos from its mask, and only runs in Lightflow Render mode.
- **Lightflow Environment 1.1.0:** replaced the toolbar-only panel with an attached, resizable Lightflow Render panel and a complete advanced composer.
- Added custom day, sunrise, night, lower-sky, sun, moon, and cloud colors plus gradient, stars, cloud appearance, motion, and contrast controls.
- Added generated Vanilla-style cloud textures and project-texture selection for clouds, sun, and moon without bundling game assets.
- Stopped the animated day cycle from disposing and recreating the directional shadow map on every update.

### RC 2 shader hotfixes

- **Lightflow Environment 1.0.1:** fixed sky vertex/fragment assembly so array lines are joined with real newline characters instead of emitting literal `\\n` tokens into GLSL.
- **Shader Architect 2.7.1:** added punctual-light compatibility overloads locally to custom shaders that include `<lights_pars_begin>` without Three's `<bsdfs>` chunk.
- Added the missing custom shadow-index uniforms to Pixelated Lightflow.
- Suspended SSR capture samplers while their render target is bound, preventing framebuffer/texture feedback loops.
- **Light Manager 1.6.3:** removed global mutation of `THREE.ShaderChunk.common`; stock Lambert/Phong shaders now retain Three r129's single native punctual helper.

### Lightflow Environment 1.0.0

- Added a separately loadable procedural environment module with Minecraft time (`0`–`23999`), controllable day length, realtime playback, sun azimuth, moon phases, stars, and block-shaped clouds.
- Added independent **Vanilla** and **Vibrant Visuals** presets for sky gradients, sunset/night transitions, celestial bodies, cloud response, and ambient palettes.
- Added directional sun and moon lighting with artist-controlled shadow area, near/far range, resolution, bias, normal bias, and pixelated-shadow settings.
- Exposed a stable environment API and project-persisted lighting state for Shader Architect, Studio Render, and future Lightflow modules.

### Shader Architect 2.7.0

- Added environment ambient uniforms so sky, horizon, and ground light can tint compatible Lightflow materials in realtime.
- Extended depth-aware SSR with a world-space procedural environment fallback—including sky gradient, sun/moon, and clouds—when a reflection ray misses visible screen geometry.
- Added **Vibrant Visuals PBR**, a complete PBR starting preset with environment response, SSR, and pixel-shadow defaults.
- Added a switchable pixelated-shadow path with adjustable quantization steps and pixel scale to Pixelated Lightflow and Vibrant Visuals PBR.
- Added the Environment sun/moon as a synthetic Lightflow light source, including dynamic direction, color, strength, and shadow settings.

### Studio Render 1.5.0

- Added **Scene Composer** with realtime viewport Bloom, Bloom preview FPS, exposure, contrast, saturation, temperature, tint, vignette, and integrated environment controls.
- Reused the final renderer's emissive/atmosphere Bloom masks, geometry occlusion, threshold, multiscale blur, radius, and strength in the realtime viewport preview.
- Added one shared color-grade implementation for realtime preview and final tiled output.
- Added a persistent Scene Composer panel plus quick viewport-Bloom and strength controls.

### Light Manager 1.6.2

- Fixed the Three.js r129 compatibility path so Light Manager no longer injects a second `punctualLightIntensityToIrradianceFactor` body when Blockbench already provides it.

### Release-candidate validation

- Extended syntax/version coverage to all five modules and added regression guards for Scene Composer parity, environment integration, Vibrant Visuals PBR, SSR environment fallback, and pixelated shadows.

### Shader Architect 2.6.0

- Added lossless Cube material-slot collapsing: six equivalent face slots now render as one material batch while genuinely different textures, render modes, transparency states, and face overrides remain independent.
- Added a content-validated material pool across Cubes, reusing identical compiled GPU materials while keeping per-object transforms correct through draw-time uniforms.
- Moved world-normal synchronization to the per-draw boundary, eliminating full-scene matrix walks on every animation frame while remaining correct for transforms and shared render passes.
- Shared time, viewport-lighting, ambient, and Light Manager uniform objects across materials, reducing per-frame and light-update work from per-material array copies to constant-time updates.
- Added cached AO receiver partitions and cached SSR material/mesh discovery instead of scanning every Cube on every preview render.
- Added a lightweight alpha-aware AO depth-only material pass so AO receiver depth no longer evaluates complete Lightflow/PBR lighting shaders.
- Removed redundant shader/material reconstruction on selection-only changes.
- Added `LightflowPerformance()` diagnostics for live element, material-batch, saved-batch, AO, draw-call, and triangle counters.

- Fixed the Windows/DPI viewport and picking mismatch when AO was enabled without any shadow-casting lights. AO render targets now own physical-pixel viewports and no longer mutate Blockbench's logical viewport.
- Prevented AO captures from redundantly refreshing shadow maps, making AO behavior and cost independent of whether a light casts shadows.
- Calibrated Principled PBR direct radiance to Light Manager's artist-facing intensity scale so intensity `1` matches Lightflow much more closely while retaining the energy-conserving BRDF.

- Renamed **Luma Forge** to **Cinematic Craft** and tuned its defaults toward polished Minecraft-trailer-style hero renders.
- Kept the legacy `luma_forge` ID as a hidden compatibility alias for existing projects and material files.
- Added quick Material Override presets: Balanced, Trailer Hero, Soft Daylight, Night Drama, and Clean Product.
- Extended material assignment, persistence, selection tools, context menus, uniform updates, AO, SSR, promotional silhouettes, and geometry refresh events to Cube, Mesh, and Texture Mesh elements.
- Replaced the fixed 24-vertex UV attribute path with dynamic geometry-sized attributes and arbitrary indexed/non-indexed UV processing.
- Added zero-thickness Cube resolution for coincident faces, transparent opposite faces, correct two-sided interaction, and z-fighting prevention.
- Added texture alpha profiling, per-material-slot depth/distance shadow textures, proportional stochastic shadows for semitransparent texels, and cleanup of replaced shadow resources.
- Preserved native material slots and source texture lookup for Mesh and Texture Mesh objects.

### Light Manager 1.6.1

- Raised automatic normal bias from `0.72` to `4.4` shadow texels to eliminate voxel shadow acne at practical bounds and resolutions.
- Added migration recognition for values generated by the old automatic formula, preserving deliberate manual overrides while upgrading previous automatic values.

- Added Texture Mesh selection support to light fitting.
- Made Render-mode panel routing aware of Cube, Mesh, and Texture Mesh selections.

### Lightflow Atmosphere 1.0.0

- Promoted Atmosphere from its experimental series to the first stable release.
- Fixed the high-DPI viewport displacement by moving physical-pixel viewport and scissor state onto Atmosphere render targets instead of applying device-pixel ratio twice.
- Added separate Physical Medium and Additive Light Shafts composition. God Rays now contribute only illuminated in-scattering, so fully shadowed regions remain transparent instead of producing black volume.
- Migrated existing God Rays-style domains to the additive model without changing ordinary fog and cloud projects.
- Added an artist-facing multiple-scattering fill approximation for fog and cloud shadow softness.
- Added the Cinematic Dust quick setup and exposed rendering model and shadow fill in the volume UI with English and Spanish translations.
- Added conservative camera-frustum culling before volume upload and ray marching.
- Added static-frame signature caching that skips unchanged depth capture, light upload, and ray marching while preserving animated clouds, temporal jitter, camera movement, edits, shadows, and Studio Render tiles.
- Reused Shader Architect AO scene and receiver depth even when editor helpers are visible, eliminating redundant full-scene captures in the standard Lightflow pipeline.
- Added cached scene partitions and lightweight alpha-aware depth-only materials for standalone Atmosphere depth capture.
- Removed per-frame Matrix4, Vector3, Quaternion, light-entry, and active-volume allocations from hot paths.
- Added `LightflowAtmosphere.performance()` counters for raymarches, cache hits, depth captures, and cache-hit rate.
- Generalized depth occluder collection, shared-depth validation, and volume fitting from Cubes to Cube, Mesh, and Texture Mesh render elements.

### Studio Render 1.4.2

- Fixed Bloom leaking through foreground geometry when emissive and non-emissive texels share one material or texture atlas. Non-emissive fragments now remain depth-writing occluders in the GPU pass instead of being discarded.
- Kept those depth-only fragments transparent in the final mask, preventing the screen-space blocker from erasing all visible Bloom in geometry-filled close-up renders.
- Restored emission-weighted mask alpha for visible emitters while preserving nearest-surface depth rejection.

- Generalized selection-highlight suppression to every supported render-element type.

### Project quality

- Added a dependency-free Node validation harness for plugin syntax, version metadata, renderer coverage, migration compatibility, flat-surface handling, and transparency guards.
- Added an explicit renderer capability document that distinguishes the supported WebGL raster path from future colored-transmittance and ray-tracing research.

## [0.1.0-alpha] - 2026-07-07

### Added

- **Light Manager 1.3.0** with point, spot, and directional lights; animation support; shadow controls; lighting profiles; viewport gizmos; and separate Studio Render shadow resolution.
- **Shader Architect 2.0.0** with global, per-element, and per-face shader materials; reusable material instances; editable GLSL; `.samat` import/export; exposed uniforms; stylized lighting; bevels; outlines; rim lighting; ambient occlusion; shadows; and reflections.
- **Studio Render 1.0.0** with adjustable render framing, transparent or solid backgrounds, tiled high-resolution output, supersampling, GPU diagnostics, and PNG export destinations.
- A modular Lightflow workflow built around lighting, materials, and studio-quality output inside Blockbench.
- Initial Open Alpha documentation, issue forms, release tooling, contribution guidance, and release notes.

### Known alpha limitations

- Behavior and visual output can vary across GPUs, graphics drivers, WebGL implementations, and Blockbench versions.
- Shader Architect material overrides should be saved in `.bbmodel` projects to preserve them reliably.
- The API hooks used by advanced rendering plugins can require compatibility updates after future Blockbench releases.
- High-quality shadows and high supersampling output can be demanding on integrated GPUs and complex scenes.

[Unreleased]: https://github.com/MidFord/lightflow-blockbench/compare/v0.1.0-alpha...HEAD
[0.1.0-alpha]: https://github.com/MidFord/lightflow-blockbench/releases/tag/v0.1.0-alpha
