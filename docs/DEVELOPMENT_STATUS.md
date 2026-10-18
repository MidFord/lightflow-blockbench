# Development status

**As of 2026-10-18, `main` is a development branch, not the frozen Stable release.** This page describes the repository state, not a guarantee that every in-progress module is production-ready.

## Releases and the current development target

- **Suite stable preview:** [v0.1.0](https://github.com/MidFord/lightflow-blockbench/releases/tag/v0.1.0), a frozen snapshot intended for artist testing. The GitHub release itself is marked as a pre-release.
- **Hub stable installer:** [Lightflow Hub v1.0.1](https://github.com/MidFord/lightflow-blockbench/releases/tag/lightflow-hub-v1.0.1). The Hub and the rendering suite have independent versions.
- **`main` suite target:** `0.2.0-rc.1`; manifest status: `development`. This is active work and may change without a new tagged release.
- **Historical branch:** `development/lightflow-3.0` describes a preserved older engineering snapshot. It is not a recommended installation channel.

## Development-manifest module versions

| Module | Version on `main` | Maturity / group |
| --- | --- | --- |
| Light Manager | `1.9.0` | essential |
| Shader Architect | `3.3.0` | essential |
| Lightflow Environment | `1.10.0` | essential |
| Lightflow Atmosphere | `2.1.0` | essential |
| Studio Render | `1.10.0` | essential |
| Scene Links | `0.1.0` | experimental |
| Lightflow Cinematic | `0.2.0` | experimental |
| Visual Shader Graph | `1.3.0` | beta |
| Lightflow Terrain Render | `2.6.0` | beta |
| Lightflow Test Lab | `2.0.0` | developer |
| Lightflow UI Lab | `1.0.0` | developer |
| Lightflow UI Diagnostics | `1.1.0` | developer |

For installable script paths and dependencies, consult the [Module Guide](MODULES.md) and [manifest](../lightflow.manifest.json). The manifest is the source of truth for **this revision**, not for older tagged releases.

## What is still subject to change

The development branch includes systems at different maturity levels. API contracts, rendering performance, material/persistence formats, user interfaces and optional modules may change as issues are resolved. Rendering correctness requires manual testing inside Blockbench on real GPUs; source syntax tests alone are not sufficient.

The active [GitHub issues](https://github.com/MidFord/lightflow-blockbench/issues) and [pull requests](https://github.com/MidFord/lightflow-blockbench/pulls) are better places to verify specific bug fixes than an older development checklist. [Next Update Progress](NEXT_UPDATE.md) and [Lightflow 3.0 notes](development-3.0/README.md) are useful historical references but may not match `main` today.

## Renderer boundary

Lightflow works with the Blockbench graphics environment and a real-time WebGL pipeline. It includes raster lights and shadows, procedural environments, screen-space effects, volumetrics and high-resolution still rendering. These capabilities should not be presented as hardware path tracing.

## For developers

Run `npm run validate`, and then test affected workflows in Blockbench Desktop. See [Development](DEVELOPMENT.md) and [Contribution guidelines](../CONTRIBUTING.md).
