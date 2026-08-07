# Next Update Progress

This document tracks the active development work planned for the next major Lightflow development update.

The checklist is intentionally more detailed than the public README. It separates work that is already implemented in the current development build from work that still needs implementation, validation, performance testing, documentation, or final UI polish.

- [x] Implemented in the current development build
- [ ] Pending, in progress, or awaiting validation

> **Current development build used for this checklist:** Light Manager 1.8.1, Lightflow Environment 1.9.0, Shader Architect 3.1.6, Lightflow Atmosphere 1.2.0, and Studio Render 1.9.6.
>
> These versions are ahead of the matched build currently published on `main` and should not be treated as a final release until the development update is completed and validated.

---

## Rendercraft — Major Shader Rewrite

### Core Rendercraft pipeline

- [x] Rewrite Rendercraft around the current Shader Architect architecture.
- [x] Preserve compatibility with legacy `luma_forge` / earlier Rendercraft material IDs where required.
- [x] Integrate Rendercraft directly with Light Manager lights and shadows.
- [x] Keep Rendercraft compatible with Shader Architect AO and SSR paths.
- [x] Add Rendercraft-specific neutral tone mapping.
- [x] Add a broad light-to-shadow face gradient.
- [x] Add adjustable face-gradient shaping.
- [x] Add Rendercraft palette saturation control.
- [x] Preserve Minecraft texture boundaries instead of smoothing away stylized pixel detail.
- [ ] Perform a final audit of every exposed Rendercraft parameter and remove controls that are redundant or visually ineffective.

### Rendercraft bevel

- [x] Rebuild the promotional-style bevel system.
- [x] Separate physical bevel width from the internal lighting ramp.
- [x] Keep the outer bevel boundary hard while allowing the lighting profile inside the bevel to be shaped.
- [x] Add adjustable bevel width.
- [x] Add bevel ramp / softness control.
- [x] Add bevel profile roundness.
- [x] Add bevel slope response.
- [x] Add independent bevel highlight intensity.
- [x] Add independent bevel shadow intensity.
- [x] Add Light Manager color influence for bevel highlights.
- [x] Add corner fading.
- [x] Add bevel line fading near corners.
- [x] Add a directional light-to-shadow gradient across each face.
- [x] Add directional-gradient curve control.
- [x] Add alpha-texture edge bevels.
- [x] Add camera / zoom-aware bevel scaling.
- [x] Add Connected Clip to suppress unwanted bevel seams between compatible connected surfaces.
- [x] Preserve articulated groups and real convex cube edges when Connected Clip is active.
- [x] Add smoothing for partial Connected Clip transitions.
- [ ] Run a final visual consistency pass across cubes, meshes, texture meshes, articulated models, and zero-thickness geometry.

### Creative blend modes

- [x] Add selectable blend modes for Rendercraft bevel highlights.
- [x] Add selectable blend modes for Rendercraft bevel shadows.
- [x] Add selectable blend modes for Rendercraft inner glow.
- [x] Add selectable blend modes for Texture Relief highlights.
- [x] Add selectable blend modes for Texture Relief shadows.
- [x] Add Normal.
- [x] Add Add / Linear Dodge.
- [x] Add Screen.
- [x] Add Lighten.
- [x] Add Color Dodge.
- [x] Add Overlay.
- [x] Add Soft Light.
- [x] Add Multiply.
- [x] Add Darken.
- [x] Add Color Burn.
- [x] Add Linear Burn.
- [x] Add Hard Light.
- [x] Add Vivid Light.
- [x] Add Linear Light.
- [x] Add Pin Light.
- [x] Add Difference.
- [x] Add Exclusion.
- [x] Add Subtract.
- [x] Add Divide.
- [x] Add Hue.
- [x] Add Saturation.
- [x] Add Color.
- [x] Add Luminosity.
- [x] Add custom HSV Value mode.
- [x] Add custom HSV Value + Saturation mode.
- [x] Add custom HSV Saturation mode.
- [x] Add independent blend-strength controls.
- [x] Add configurable HSV value shifts.
- [x] Add configurable HSV saturation shifts.
- [ ] Validate every blend mode against SDR, bright emissive, saturated, dark, and translucent material cases.

### Inner glow

- [x] Rebuild directional inner bevel glow.
- [x] Add independent glow width.
- [x] Add independent glow softness.
- [x] Add glow corner fading.
- [x] Add glow intensity.
- [x] Add Light Manager color tinting.
- [x] Add directional glow gradient.
- [x] Synchronize glow direction with the main light direction.
- [x] Allow glow direction to synchronize with the Rendercraft Rim.
- [x] Add face-angle requirement / face culling.
- [x] Add adjustable face threshold.
- [x] Add directional hotspot / focus controls.
- [x] Integrate Rendercraft inner glow into selective Studio Render Bloom.
- [ ] Validate glow behavior with multiple lights and strongly colored lighting setups.

### Rendercraft rim

- [x] Add promotional silhouette rim lighting.
- [x] Add adjustable rim width and intensity.
- [x] Add fixed rim color.
- [x] Add mixed light / rim color mode.
- [x] Add direct Light Manager color mode.
- [x] Add directional rim control.
- [x] Add rim direction softness.
- [x] Add directional focus.
- [x] Add nearby-geometry occlusion.
- [x] Add depth-tolerance control.
- [x] Add rim / texture-edge blending.
- [x] Add camera-distance / zoom scaling.
- [x] Add separate solid Rim Core and soft Halo components.
- [x] Add Halo intensity and falloff.
- [x] Add directional hotspot curve.
- [x] Add rim direction cutoff.
- [x] Add configurable residual backlight.
- [ ] Finish the final rim/outline stability pass at extreme camera angles and distances.

---

## Texture Relief

### Texture-derived geometry detail

- [x] Add Texture Relief to Rendercraft.
- [x] Detect relief from perceptual base-texture color boundaries.
- [x] Avoid treating every texture pixel as a relief edge.
- [x] Add configurable perceptual edge threshold.
- [x] Add independent model-space Relief Width.
- [x] Add Relief Strength.
- [x] Add internal Relief Ramp control.
- [x] Keep texture-edge detection and the outer relief boundary hard.
- [x] Generate a normal rolloff across the relief edge.
- [x] Add master Relief Lighting strength.
- [x] Add independent Relief Highlight.
- [x] Add independent Relief Shadow.
- [x] Add Light Manager color influence to Relief highlights.
- [x] Add independent highlight and shadow blend modes.
- [x] Add HSV value / saturation artistic controls.
- [x] Add Relief Polish / localized roughness reduction.

### Studio Render integration

- [x] Detect Texture Relief as high-frequency surface detail in Studio Render.
- [x] Pass Studio Render supersampling information into Rendercraft.
- [x] Preserve relief when rendering above viewport resolution.
- [x] Add final-pixel-aware relief handling.
- [x] Remove the earlier nearest-neighbour overlay used during supersample reduction.
- [x] Use progressive high-quality tile reduction instead.
- [x] Fix the derivative-basis GLSL compile failure affecting Texture Relief.
- [x] Enable derivatives in the Rendercraft Studio Render material path.

### Texture Relief validation

- [ ] Verify Relief remains visually consistent at different camera distances.
- [ ] Verify Relief remains consistent at 1x, 2x, 4x, and 8x supersampling.
- [ ] Verify Relief remains consistent with tiled `setViewOffset` rendering.
- [ ] Eliminate any remaining unwanted horizontal-line artifacts.
- [ ] Verify Relief is never generated where there is no meaningful texture color boundary.
- [ ] Verify edge width matches between viewport and Studio Render.
- [ ] Stress-test Texture Relief on transparent / cutout textures.
- [ ] Stress-test Texture Relief together with PBR heightmaps and normal maps.

---

## Rendercraft Transparency

- [x] Improve color preservation on translucent surfaces.
- [x] Add configurable transparency saturation.
- [x] Add Fresnel-based edge density.
- [x] Add Beer-Lambert-inspired absorption.
- [x] Add independent optical-density / alpha scaling.
- [x] Add configurable Fresnel power.
- [x] Add independent translucent specular response.
- [x] Add optional material tint.
- [x] Add tint-mixing strength.
- [ ] Validate water, glass, energy, and translucent Minecraft-style materials under different Environment presets.

---

## Rendercraft + Bloom

- [x] Add Rendercraft-specific selective Bloom output.
- [x] Preserve explicit emissive textures and MER emission.
- [x] Allow inner edge glow to contribute independently to Bloom.
- [x] Add Rendercraft Emission Bloom boost.
- [x] Add Rendercraft Edge Bloom boost.
- [x] Preserve foreground depth occlusion in the Bloom path.
- [ ] Validate Rendercraft Bloom with transparent and cutout materials.
- [ ] Validate Bloom consistency between realtime Scene Composer and Studio Render.

---

## Lightflow Environment 1.9

### Full-sky gradient system

- [x] Extend sky gradients below the horizon.
- [x] Integrate Ground Color directly into the gradient instead of treating it as an unrelated value.
- [x] Add editable Day Sky Gradient.
- [x] Add editable Sunrise Sky Gradient.
- [x] Add editable Night Sky Gradient.
- [x] Support multiple gradient stops.
- [x] Support stop midpoint control.
- [x] Preserve horizon and zenith sampling from the new full-sky gradient.
- [x] Automatically migrate legacy sky-gradient settings.
- [x] Generate the environment gradient as a reusable texture for other Lightflow systems.

### Rendercraft clouds

- [x] Add a dedicated Rendercraft cloud shading style.
- [x] Keep Vanilla cloud shading as an alternative.
- [x] Add Rendercraft-specific cloud presets.
- [x] Add customizable cloud top color.
- [x] Add sun-facing cloud color.
- [x] Add shadow-facing cloud color.
- [x] Add cloud bottom color.
- [x] Add bright bevel / edge color.
- [x] Add independent shadow-bevel color.
- [x] Add bevel width.
- [x] Add bevel strength.
- [x] Add bevel roundness.
- [x] Add Smooth / Hard bevel toggle.
- [x] Add Smoothstep-based bevel softness when smoothing is enabled.
- [x] Add camera-distance bevel scaling.
- [x] Add enable / disable toggle for distance fade.
- [x] Add minimum distant bevel scale.
- [x] Add independent bright-edge strength.
- [x] Add independent shadow-bevel strength.

### Cloud lighting

- [x] Add palette-based cloud lighting.
- [x] Add sky-derived cloud lighting.
- [x] Add mixed palette + sky lighting.
- [x] Add sky-tint strength.
- [x] Add sun-tint strength.
- [x] Allow clouds to respond to current sky and Environment colors.

### Cloud fog

- [x] Add fog specifically for Rendercraft clouds.
- [x] Add fog enable / disable toggle.
- [x] Allow fog color to come automatically from the sky.
- [x] Allow a custom fog color.
- [x] Add fog strength.
- [x] Add fog start distance.
- [x] Add fog end distance.
- [ ] Fine-tune cloud fog across a wider range of camera distances and sky presets.
- [ ] Continue tuning Rendercraft clouds against the visual language of Minecraft promotional and trailer renders.

---

## Studio Render 1.9.6

### Render pipeline

- [x] Preserve Rendercraft Texture Relief during final rendering.
- [x] Detect Rendercraft / PBR materials that need high-frequency detail preservation.
- [x] Integrate Rendercraft selective Bloom.
- [x] Reuse Studio Render shadow maps when possible.
- [x] Avoid redundant shadow-restoration passes after a render.
- [x] Improve tiled supersampling reduction.
- [x] Preserve transparent output.
- [x] Offload PNG encoding through Worker + OffscreenCanvas when available.
- [x] Keep a safe PNG encoding fallback.

### Shader preparation and stutter reduction

- [x] Add explicit Shader Architect shader preparation.
- [x] Show preparation progress instead of performing invisible shader work.
- [x] Cache reusable shader variants.
- [x] Track prepared shader variants per renderer.
- [x] Avoid repeatedly compiling already-prepared variants.
- [x] Coordinate Studio Render shader baking with the offscreen renderer.
- [x] Reuse compatible shadow state during Studio Render.

### Remaining render validation

- [ ] Re-test the initial pause when switching globally to Rendercraft.
- [ ] Re-test the pause when Studio Render begins capturing.
- [ ] Re-test the pause when Studio Render finishes and returns to the viewport.
- [ ] Compare Rendercraft appearance between viewport and Studio Render.
- [ ] Compare AO between viewport and Studio Render.
- [ ] Compare SSR between viewport and Studio Render.
- [ ] Compare Bevel between viewport and Studio Render.
- [ ] Compare Rim between viewport and Studio Render.
- [ ] Test 1080p, 1440p, 4K, and 8K rendering.
- [ ] Test 1x, 2x, 4x, and 8x sampling.
- [ ] Stress-test tiled exports for visible tile seams.
- [ ] Validate final-render memory cleanup after repeated captures.

---

## Light Manager 1.8

### Gizmos

- [x] Make all light gizmos respect Blockbench's global `Canvas.show_gizmos` setting.
- [x] Make Show Light Area Gizmos hide all Light Manager visual helpers.
- [x] Hide light icons and orientation helpers when gizmos are disabled.
- [x] Hide editing handles and move indicators.
- [x] Cancel active gizmo interactions cleanly when gizmos are disabled.
- [x] Synchronize Volume Domain gizmos.
- [x] Synchronize Environment shadow-region gizmos.

### Lights and shadows

- [x] Keep configurable light shadow softness.
- [x] Keep separate preview and Studio Render shadow quality.
- [x] Keep automatic / adaptive shadow handling.
- [ ] Improve UI discoverability of hard versus soft shadows.
- [ ] Document clearly that `Shadow Softness = 0` produces a hard shadow.
- [ ] Improve beginner-facing explanations for shadow bias, normal bias, bounds, and softness.

### Armature integration

- [ ] Support parenting Light Elements directly to armature bones. See [issue #4](https://github.com/MidFord/lightflow-blockbench/issues/4).
- [ ] Ensure parented lights inherit bone translation correctly.
- [ ] Ensure parented directional and spot lights inherit bone rotation correctly.
- [ ] Preserve bone parenting through save / reload.
- [ ] Verify animation channels continue working correctly with bone-parented lights.

---

## Lightflow Atmosphere

- [x] Local fog volumes.
- [x] Height fog.
- [x] Procedural volumetric clouds.
- [x] Physical Medium mode.
- [x] Additive Light Shafts.
- [x] Cinematic Dust workflow.
- [x] Depth-aware occlusion.
- [x] Volume culling and caching.
- [x] Preview / render quality separation.
- [x] Synchronize Volume Domain gizmos with Blockbench's global gizmo visibility.
- [ ] Continue improving volumetric scattering quality.
- [ ] Continue reducing realtime Atmosphere cost.
- [ ] Validate Atmosphere with the new Rendercraft and Environment paths.
- [ ] Improve Atmosphere presets and beginner-facing descriptions.

---

## UI / UX Redesign

- [ ] Finish visual consistency across all five Lightflow modules.
- [ ] Continue redesigning Material Studio.
- [ ] Continue redesigning Light Manager.
- [ ] Continue redesigning Environment Composer.
- [ ] Review where each major panel belongs in the Lightflow Render workspace.
- [ ] Reduce duplicated or unnecessarily technical controls.
- [ ] Hide advanced controls until they are needed.
- [ ] Improve naming and descriptions for artist-facing controls.
- [ ] Make existing features easier to discover instead of duplicating them.
- [ ] Audit every Rendercraft slider for a clear and visible purpose.
- [ ] Improve responsive panel behavior on smaller Blockbench layouts.
- [ ] Improve consistency of icons, spacing, section hierarchy, and collapsible groups.

---

## Performance & Stability

### Completed foundations

- [x] Synchronous Light Manager type registration.
- [x] Late project hydration.
- [x] Project-generation guards.
- [x] Cleanup of stale work when closing or switching projects.
- [x] Partial light updates instead of global rescans.
- [x] Explicit shadow invalidation.
- [x] Stable Environment sun / light topology.
- [x] Coalesced Shader Architect material and uniform updates.
- [x] Active-preview-only Scene Composer composition.
- [x] GPU realtime Bloom.
- [x] Material batching and pooling.
- [x] AO / SSR scene-discovery caches.
- [x] Atmosphere depth and cache reuse.

### Next performance pass

- [ ] Benchmark the complete new Rendercraft pipeline.
- [ ] Benchmark Texture Relief cost separately.
- [ ] Benchmark Rendercraft with multiple Light Manager lights.
- [ ] Benchmark AO + SSR + Rendercraft + Bloom together.
- [ ] Test large scenes with hundreds of cubes.
- [ ] Continue toward smooth scenes containing thousands of cubes.
- [ ] Profile shader compilation separately from runtime rendering.
- [ ] Profile shadow-map work separately from material updates.
- [ ] Test low-end GPU configurations.
- [ ] Test mid-range GPU configurations.
- [ ] Test high-end GPU configurations.
- [ ] Test Windows display scaling above 100%.
- [ ] Test repeated project switching for resource leaks.
- [ ] Test repeated Studio Render captures for GPU / resource leaks.
- [ ] Validate performance with currently supported Blockbench 5.x builds.

---

## Scene Composer

- [x] Realtime GPU Bloom.
- [x] Bloom depth occlusion.
- [x] Adaptive Bloom quality.
- [x] Exposure.
- [x] Contrast.
- [x] Saturation.
- [x] Temperature / tint.
- [x] Vignette.
- [x] Shared viewport / final-render grading.
- [ ] Improve temporal stability where useful.
- [ ] Validate new Rendercraft emissive / edge Bloom behavior.
- [ ] Continue reducing integrated viewport-effect overhead.

---

## Documentation & Onboarding

- [x] Rebuild the main README around the artist workflow.
- [x] Add Installation Guide.
- [x] Add Your First Render guide.
- [x] Add Module Guide.
- [x] Add Workflows guide.
- [x] Add Performance / Troubleshooting guide.
- [x] Add Development Status document.
- [ ] Document the new Rendercraft rewrite.
- [ ] Document Texture Relief.
- [ ] Document the creative blend-mode system.
- [ ] Document Bevel, Glow, and Rim separately with visual examples.
- [ ] Document Rendercraft transparency controls.
- [ ] Document the new Environment full-sky gradient editor.
- [ ] Document Rendercraft cloud controls.
- [ ] Explain hard versus soft Light Manager shadows more intuitively.
- [ ] Add screenshots for important controls.
- [ ] Add before / after Rendercraft examples.
- [ ] Add example `.bbmodel` scenes.
- [ ] Add beginner-friendly preset recipes.
- [ ] Update module version numbers after the next release candidate is finalized.
- [ ] Update the changelog with the new Rendercraft, Environment, and Studio Render work.

---

## First Public / Marketplace Release

- [ ] Finish UI / UX consistency.
- [ ] Finish real-project compatibility testing.
- [ ] Define safer migrations between development builds.
- [ ] Finalize defaults.
- [ ] Finalize beginner presets.
- [ ] Add more visual documentation.
- [ ] Prepare Plugin Marketplace metadata.
- [ ] Validate Marketplace packaging requirements.
- [ ] Decide and document the repository license.
- [ ] Run the final compatibility pass.
- [ ] Publish the first official Blockbench Plugin Marketplace release.

---

## Longer-term Roadmap

These goals remain important to Lightflow, but they should not block the current Rendercraft-focused development update.

### Animation & video

- [ ] Professional animation / video rendering workflow.
- [ ] Render animations directly instead of only still images.
- [ ] Image-sequence rendering.
- [ ] High-performance animation rendering targeting realtime-like throughput where practical.
- [ ] Video encoding / export workflow.
- [ ] Animated Scene Composer effects.

### Shader Graph

- [ ] Visual Shader Graph.
- [ ] Node-based material creation.
- [ ] Expose existing Shader Architect functionality through artist-friendly nodes.
- [ ] Reusable node groups / material graphs.

### Particles

- [ ] Lightflow particle system.
- [ ] Particle materials.
- [ ] Integration with lights, Environment, Atmosphere, and Bloom.

### Minecraft structure workflow

- [ ] `.mcstructure` visualization.
- [ ] `.mcstructure` import.
- [ ] `.mcstructure` editing.
- [ ] `.mcstructure` export.

### Renderer research

- [ ] Investigate an optional native / WebGPU rendering backend.
- [ ] Investigate better temporal SSR / history.
- [ ] Continue AO improvements.
- [ ] Continue Rim / Outline consistency improvements.
- [ ] Experiment with a transmittance buffer for colored / transmissive shadows.
- [ ] Expand physically inspired Atmosphere / scattering where it remains practical inside Blockbench.

---

This checklist is expected to change as the development build is tested on real projects. Completed items describe functionality already present in the current development branch; they do not imply that the next public release has shipped.