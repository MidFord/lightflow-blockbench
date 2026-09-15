# Lightflow Development Guide

This document describes the current development workflow for Lightflow for Blockbench.

Lightflow is intentionally developed close to the environment in which it runs: Blockbench Desktop, its Three.js/WebGL renderer, and the five independently loadable Lightflow modules.

## Repository layout

The primary distributable modules live at the repository root:

| File | Responsibility |
| --- | --- |
| `light_manager.js` | Core lighting, light objects, gizmos, animation, and shadow management. |
| `shader_architect.js` | Material system, shader tooling, PBR/stylized rendering, and material overrides. |
| `studio_render.js` | Scene composition, post-processing, framing, supersampling, and final still rendering. |
| `lightflow_atmosphere.js` | Fog, clouds, dust, volumetric composition, and light shafts. |
| `lightflow_environment.js` | Sky, time of day, celestial elements, ambient response, reflections, and environment lighting. |

Supporting material lives in:

- `docs/` — user and developer documentation;
- `tests/` — automated release-candidate regression tests;
- `assets/` — repository documentation assets;
- `package.json` — Node.js validation harness.

There is currently no production bundling step. The root JavaScript modules are the source files loaded by Blockbench.

## Requirements

- Node.js 18 or newer.
- npm.
- Blockbench 4.9.0 or newer.
- Blockbench Desktop for reliable GPU/rendering validation.
- A WebGL-capable GPU.

## Automated validation

Install the local validation harness:

```bash
npm install
```

Run the complete validation suite:

```bash
npm run validate
```

This runs syntax checks for all five modules followed by the Node.js regression suite.

You can also run the stages separately:

```bash
npm run check
npm test
```

Automated validation is intentionally conservative. It catches syntax and known regression conditions, but it cannot reproduce the complete Blockbench rendering environment or replace GPU testing.

## Loading the development build in Blockbench

Use **File → Plugins → Load Plugin from File** and load:

1. `light_manager.js`
2. `shader_architect.js`
3. `studio_render.js`
4. `lightflow_atmosphere.js`
5. `lightflow_environment.js`

Light Manager is the foundation module and should be loaded first. Keep all five files on the same commit/revision while testing cross-module behavior.

After changing a plugin, reload it or restart Blockbench before judging the result. For lifecycle changes, explicitly test unload and reload behavior as well.

## Recommended development loop

1. Reproduce the issue or establish the expected baseline in Blockbench.
2. Make the smallest coherent source change.
3. Run `npm run validate`.
4. Reload the affected module(s) in Blockbench.
5. Inspect **View → Developer Tools** for new warnings or errors.
6. Test the changed path with a minimal scene.
7. Test a representative real scene when the change affects rendering or performance.
8. Verify neighboring modules when shared globals, render targets, materials, cameras, or project data are involved.
9. Document behavior changes that affect users.

## Manual regression checklist

Use the relevant parts of this checklist before submitting rendering or architecture changes:

- plugins load in the documented order without new console errors;
- plugins can unload/reload without duplicate handlers or stale global state;
- Lightflow Render mode can be entered and exited normally;
- lights and gizmos remain synchronized with the scene;
- material assignment and per-element/per-face overrides remain intact;
- atmosphere and environment systems can be enabled and disabled independently;
- Scene Composer preview remains consistent with Studio Render where expected;
- transparent output preserves alpha when requested;
- save/reopen preserves expected Lightflow data in `.bbmodel` projects;
- high-resolution rendering completes without leaving stale render targets or broken viewport state;
- behavior remains sensible when an optional Lightflow module is absent;
- performance-sensitive changes are checked in both small and larger scenes.

Visual changes should be compared at identical camera, resolution, material, lighting, and environment settings whenever possible.

## GPU and performance work

Performance changes should be measured rather than inferred from code shape alone. Record enough context to make comparisons meaningful, including:

- Blockbench version;
- operating system;
- GPU;
- display scaling when relevant;
- scene complexity;
- active Lightflow modules/effects;
- preview or final-render resolution;
- before/after measurements.

Avoid turning expensive final-quality work into unconditional viewport work. Lightflow deliberately separates interactive preview quality from final-render quality where possible.

## Cross-module changes

The five plugins are independently loadable but intentionally cooperate. When changing shared behavior:

- establish which module owns the state;
- define cleanup behavior;
- avoid silently depending on module load order beyond documented requirements;
- guard optional integrations;
- keep compatibility code explicit;
- test mixed enable/disable states;
- avoid duplicate global event handlers, render loops, or render targets.

If a change requires a new cross-module contract, document it in code and in the pull request.

## Third-party code and dependencies

Lightflow is licensed under Apache-2.0. Do not copy source, shader code, assets, or substantial implementation material from another project unless its license is known, compatible, and its attribution requirements are satisfied.

When proposing a new dependency or incorporated third-party component, include in the pull request:

- project/component name;
- source URL;
- license and version;
- why it is needed;
- whether attribution or NOTICE changes are required.

Prefer host APIs and small project-owned implementations when they are sufficient.

## Documentation

Update documentation when behavior visible to artists changes. Useful starting points are:

- [Installation Guide](INSTALLATION.md)
- [Module Guide](MODULES.md)
- [Workflows](WORKFLOWS.md)
- [Performance & Troubleshooting](TROUBLESHOOTING.md)
- [Development Status](DEVELOPMENT_STATUS.md)
- [Next Update Progress](NEXT_UPDATE.md)

Contributor policy and pull-request expectations are in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Licensing

The repository is distributed under the [Apache License 2.0](../LICENSE). Contributions intentionally submitted for inclusion in Lightflow are accepted under the same license unless explicitly stated otherwise.
