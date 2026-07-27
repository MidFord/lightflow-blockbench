# Changelog

All notable changes to Lightflow for Blockbench are documented here.

Lightflow currently uses a **suite development milestone** plus independent module versions. Until the first public release, entries may describe release candidates and matched development builds rather than strict semantic-versioned packages.

## [Unreleased]

### Documentation and first stable development preview

- Repositioned Lightflow as the first stable development version intended for real artist testing while clearly documenting that it is not feature-complete, not a final public release, and not yet available in the Blockbench Plugin Marketplace.
- Rebuilt the README around the artist workflow, project purpose, current limitations, manual installation, first-render path, honest renderer boundaries, feedback requirements, and Marketplace roadmap.
- Added dedicated guides for installation, the first render, module responsibilities, practical workflows, performance/troubleshooting, and development status.
- Documented the matched supplied module versions: Light Manager 1.7.0, Environment 1.5.1, Shader Architect 2.9.1, Atmosphere 1.2.0, and Studio Render 1.9.0.
- Clarified that the repository currently has no license file and therefore should not present an MIT badge or imply redistribution rights.

### Environment 1.5.1

- Expanded the Minecraft-inspired environment implementation with deterministic Vanilla star geometry, textured sun/moon atlas handling, project texture overrides, richer cloud rendering, ambient response, reflections, and directional-shadow controls.
- Updated Environment metadata and documentation to reflect the current matched development build.

### Shader Architect 2.9.1

- Updated the material system documentation for the current build, including Lightflow material presets, advanced PBR layers, native Blockbench texture semantics, material instances, per-element/per-face assignment, editable GLSL, AO, SSR, SSS, outlines, rim lighting, and pixelated shadows.

### Studio Render 1.9.0

- Updated documentation for the current Scene Composer and Studio Render workflow, including GPU Bloom, color grading, camera presets, adjustable framing, tiled supersampling, transparency, and high-resolution output.

### RC 6 — startup, project hydration, and interaction latency

- **Light Manager 1.7.0:** registers the plugin and its custom `light` outliner type synchronously. Material-icon generation runs later and no longer delays `.bbmodel` parsing.
- Added a shared, generation-guarded project lifecycle. When the suite becomes available after a scene is open, it can restore saved lights, Volume Domains, Environment settings, material assignments, face assignments, and Material Instances without requiring a close/reopen cycle.
- Project close and tab switching cancel stale queued scene, uniform, Environment, Atmosphere, and Scene Composer work.
- Light edits update only the affected light instead of rescanning all Lightflow lights, previews, and meshes on every input step.
- Viewport shadow maps use explicit invalidation; ordinary transforms update shadow content without globally rebuilding all caster/receiver state.
- Environment keeps directional-light topology stable during common toggles and updates shadow projection only when its signature changes.
- Shader Architect isolates queued material/uniform work by project revision and hydrates saved root, element, and face material state when loaded late.
- Atmosphere restores late-loaded Volume Domains and prevents queued volume rendering from crossing project transitions.
- Studio Render coalesces Scene Composer refreshes, composites only the active viewport, discards stale work after close/switch, and removes redundant recovery rendering.
- Added regression coverage for synchronous registration, late hydration, project isolation, partial light updates, manual shadow invalidation, stable Environment topology, and active-preview-only composition.

### RC 5 — interactive performance and transparency

- Studio Render 1.6.1 preserved destination alpha during additive viewport Bloom.
- Shader Architect 2.8.0 removed full light/shadow preparation from uniform-only updates and stopped treating ordinary Cube transforms as lighting changes.
- Geometry, face, and UV events rebuilt only affected render elements while reusing/coalescing light arrays, shadow maps, and active-preview rendering.
- Light Manager 1.6.5 removed scene shadow-mesh traversal from light transforms and reused hot-path scratch objects.
- Atmosphere 1.1.0 separated depth and volume signatures so lighting/optical edits could reuse unchanged scene depth.
- Environment 1.2.0 coalesced uniform updates and rendered only the active preview.

### RC 4 — native GPU viewport composition

- Studio Render 1.6.0 replaced realtime CPU readback/Canvas2D overlay with a GPU emissive mask, multilevel Bloom pyramid, and direct framebuffer composition.
- Fixed the 1.25× Bloom scale/offset on Windows display scaling through target-local physical viewport handling.
- Added Adaptive quality, internal-resolution hysteresis, synchronized uncapped updates, and optional FPS caps.
- Atmosphere 1.0.1 preserved target-local viewport/scissor state when composed into offscreen targets.
- Light Manager 1.6.4 excluded Volume Domain proxies from shadow casting and receiving.

### RC 3 — viewport and environment workflow

- Moved Scene Composer and Environment into attached, resizable Lightflow Render panels.
- Added reduced-resolution realtime Bloom, DPI-aware quality profiles, helper exclusion, and AO-compatible composition.
- Expanded Environment with editable sky colors, stars, clouds, texture selection, and stable animated sun shadows.

### RC 2 — shader hotfixes

- Fixed Environment shader source assembly.
- Added punctual-light compatibility for custom Three.js shader chunks.
- Added missing pixelated-shadow uniforms.
- Prevented SSR framebuffer/texture feedback loops.
- Removed unsafe global mutation of Three.js shader chunks.

### Initial Environment, material, and composer milestones

- Added the procedural Minecraft-time environment, Vanilla and Vibrant Visuals presets, sun/moon lights, stars, clouds, ambient palettes, and project persistence.
- Added environment ambient uniforms and procedural fallback reflections to Shader Architect.
- Added Vibrant Visuals PBR and configurable pixelated shadows.
- Added Scene Composer with realtime Bloom and shared color grading for viewport and final tiled output.
- Added the first stable Lightflow Atmosphere 1.0 with local fog, additive shafts, procedural clouds, depth occlusion, caching, culling, and quality profiles.
