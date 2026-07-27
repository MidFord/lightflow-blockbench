# Development Status

## What “stable development preview” means

This is the first Lightflow build intended for sustained artist testing rather than isolated technical experiments.

“Stable” currently means:

- the five-module pipeline can be loaded and used together;
- projects can persist the major Lightflow systems in `.bbmodel`;
- current builds include lifecycle recovery for plugins that finish loading after a project is already open;
- common interactions avoid many of the global rebuilds and stale cross-project tasks found in earlier release candidates;
- automated syntax and regression validation exists for core behavior.

It does **not** mean:

- final API or project-format stability;
- complete compatibility with every Blockbench format and plugin combination;
- finished UI and onboarding;
- Marketplace availability;
- zero rendering bugs;
- guaranteed performance on every GPU;
- a final semantic-versioned public release.

## Current module versions in the supplied development build

| Module | Version |
| --- | ---: |
| Light Manager | 1.7.0 |
| Lightflow Environment | 1.5.1 |
| Shader Architect | 2.9.1 |
| Lightflow Atmosphere | 1.2.0 |
| Studio Render | 1.9.0 |

These versions should be treated as one matched development build.

## Current priorities

- finish the shared Lightflow Render workspace and panel behavior;
- reduce interaction latency and avoid unnecessary shader/shadow rebuilds;
- improve large-scene behavior;
- validate project switching, closing, late plugin loading, and migration;
- make installation and first use understandable without prior project knowledge;
- publish visual examples and reproducible starter scenes;
- prepare package metadata and review requirements for the Blockbench Plugin Marketplace.

## Renderer boundary

The supported renderer is Blockbench's current Three.js/WebGL path. Lightflow provides raster lights and shadows, screen-space effects, procedural environment response, volumetric composition, and tiled supersampled still rendering.

Hardware ray tracing/path tracing is not exposed through the current host plugin surface and is not advertised as implemented. Colored transmissive shadows remain future renderer work.
