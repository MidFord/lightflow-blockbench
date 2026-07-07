# Changelog

All notable changes to Lightflow for Blockbench will be documented in this file.

Lightflow uses a suite release version for public downloads. Individual plugins also keep their own internal versions because they can evolve at different speeds.

## [Unreleased]

### Added
- Nothing yet.

### Changed
- Nothing yet.

### Fixed
- Nothing yet.

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
