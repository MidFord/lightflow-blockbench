# Changelog

All notable changes to Lightflow for Blockbench will be documented in this file.

Lightflow uses a suite release version for public downloads. Individual plugins also keep their own internal versions because they can evolve at different speeds.

## [Unreleased]

### Shader Architect 2.5.0

- Renamed **Luma Forge** to **Cinematic Craft** and tuned its defaults toward polished Minecraft-trailer-style hero renders.
- Kept the legacy `luma_forge` ID as a hidden compatibility alias for existing projects and material files.
- Added quick Material Override presets: Balanced, Trailer Hero, Soft Daylight, Night Drama, and Clean Product.
- Extended material assignment, persistence, selection tools, context menus, uniform updates, AO, SSR, promotional silhouettes, and geometry refresh events to Cube, Mesh, and Texture Mesh elements.
- Replaced the fixed 24-vertex UV attribute path with dynamic geometry-sized attributes and arbitrary indexed/non-indexed UV processing.
- Added zero-thickness Cube resolution for coincident faces, transparent opposite faces, correct two-sided interaction, and z-fighting prevention.
- Added texture alpha profiling, per-material-slot depth/distance shadow textures, proportional stochastic shadows for semitransparent texels, and cleanup of replaced shadow resources.
- Preserved native material slots and source texture lookup for Mesh and Texture Mesh objects.

### Light Manager 1.6.0

- Added Texture Mesh selection support to light fitting.
- Made Render-mode panel routing aware of Cube, Mesh, and Texture Mesh selections.

### Lightflow Atmosphere 0.2.0

- Generalized depth occluder collection, shared-depth validation, and volume fitting from Cubes to Cube, Mesh, and Texture Mesh render elements.

### Studio Render 1.4.0

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
