# Lightflow 3.0 Development

> **Development branch:** `development/lightflow-3.0`  
> **Status:** active internal development snapshot — **not release-ready, not Marketplace-ready, and not a stable public build**.  
> **Snapshot date:** 2026-08-24

Lightflow 3.0 is the current integrated development line for the Lightflow rendering ecosystem inside Blockbench. This branch exists to preserve the complete state of the project while the renderer architecture, cinematics, shader authoring, Bedrock structure workflow, performance work, and release packaging are still evolving.

Do not treat this branch as a drop-in replacement for the public/release branches. Project data, material schemas, internal APIs, render behavior, UI, defaults, and plugin boundaries may still change without migration guarantees.

## What is in this snapshot

| Module | Version | Role | Development state |
| --- | ---: | --- | --- |
| `light_manager.js` | 1.8.2 | Shared Lightflow foundation: lights, shadows, gizmos, lifecycle, UI primitives | Integrated / stabilization |
| `shader_architect.js` | 3.2.6 | Material system, Rendercraft, PBR, screen-space pipeline, AO/SSR, warmup and renderer orchestration | Major active development |
| `studio_render.js` | 1.9.10 | High-resolution still renderer, Scene Composer, Bloom, grading, camera presets | Integrated / validation |
| `lightflow_environment.js` | 1.9.0 | Sky, time, stars, celestial bodies, clouds, reflections and environment lighting | Integrated / validation |
| `lightflow_atmosphere.js` | 1.2.0 | Local volumetrics, fog, shafts, procedural cloud domains | Functional / active beta |
| `lightflow_cinematic.js` | 0.1.0 | Sequences, physical cameras, deterministic frame evaluation and streaming render foundations | New / experimental |
| `visual_shader_graph.js` | 1.2.0 | Typed vertex/fragment shader graph compiled into Shader Architect materials | New / experimental |
| `bedrock_structure_studio.js` | 2.2.1 | `.mcstructure` editing, Bedrock NBT, resource-pack resolution and chunk-atlas preview | New / experimental |

All eight JavaScript modules in this snapshot pass `node --check`.

## The Lightflow 3.0 system

```text
                             ┌───────────────────────────┐
                             │      Light Manager        │
                             │ lifecycle • lights • UI   │
                             └─────────────┬─────────────┘
                                           │
                ┌──────────────────────────┼───────────────────────────┐
                │                          │                           │
                ▼                          ▼                           ▼
      ┌───────────────────┐      ┌──────────────────────┐    ┌────────────────────┐
      │ Environment       │      │ Shader Architect     │    │ Atmosphere         │
      │ sky • clouds      │      │ materials • renderer│    │ fog • shafts       │
      └─────────┬─────────┘      └──────────┬───────────┘    └─────────┬──────────┘
                │                            │                          │
                └────────────────────────────┼──────────────────────────┘
                                             ▼
                                  ┌──────────────────────┐
                                  │ Studio Render        │
                                  │ compose • export     │
                                  └──────────┬───────────┘
                                             │
                       ┌─────────────────────┼─────────────────────┐
                       ▼                     ▼                     ▼
            ┌──────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
            │ Cinematic        │  │ Visual Shader Graph  │  │ Bedrock Structure    │
            │ timeline/render  │  │ author/compile       │  │ world-data workflow  │
            └──────────────────┘  └──────────────────────┘  └──────────────────────┘
```

The important architectural shift in 3.0 is that Lightflow is no longer only a collection of five artist-facing plugins. It is becoming a shared rendering platform with explicit runtime contracts between modules: lifecycle hydration, shader/material compilation, frame resources, screen access, Studio Render preparation, deterministic frame context, and specialized import/render bridges.

## Documentation for this branch

Start here:

- [`DEVELOPMENT.md`](DEVELOPMENT.md) — branch policy, current milestone and release gates.
- [`docs/development-3.0/MODULE_STATUS.md`](docs/development-3.0/MODULE_STATUS.md) — detailed subsystem-by-subsystem implementation inventory.
- [`docs/development-3.0/ARCHITECTURE.md`](docs/development-3.0/ARCHITECTURE.md) — cross-module architecture and runtime contracts.
- [`docs/development-3.0/KNOWN_ISSUES.md`](docs/development-3.0/KNOWN_ISSUES.md) — known regressions, unresolved behavior and validation risks.
- [`docs/development-3.0/ROADMAP.md`](docs/development-3.0/ROADMAP.md) — stabilization roadmap from this snapshot to a publishable build.
- [`docs/development-3.0/VALIDATION.md`](docs/development-3.0/VALIDATION.md) — testing matrix and release acceptance criteria.
- [`docs/development-3.0/SNAPSHOT_MANIFEST.md`](docs/development-3.0/SNAPSHOT_MANIFEST.md) — exact source inventory, sizes and checksums.

The older documentation under `docs/` remains useful historical context, but the documents above are authoritative for this development branch.

## Development rules

1. **Do not publish directly from this branch.** Release candidates must be cut into a separate branch after the validation gates are satisfied.
2. **Preserve project compatibility deliberately.** Any change to persisted properties, graph formats, material IDs or project JSON must include a migration decision.
3. **Keep module contracts explicit.** Shared `window.*` APIs must be versioned or documented before widening their use.
4. **Treat viewport and final render parity as a feature.** A visual feature is not complete until it is validated in both paths where applicable.
5. **Performance regressions are release blockers.** Shader warmup, frame cost, shadow cost, screen-space passes, large structures and high-resolution export must be measured separately.
6. **Experimental does not mean undocumented.** New Cinematic, Shader Graph and Structure Studio behavior belongs in the development documentation before it is considered stable.

## Validation

```bash
npm install
npm run check
npm test
npm run validate
```

`npm run check` validates the syntax of all eight development modules. Runtime validation still requires Blockbench Desktop and representative GPU testing.

## Publication status

This branch intentionally makes no promise of Marketplace compatibility. In particular, the current source size and module boundaries need a packaging review before publication. Shader Architect alone is larger than two megabytes in this snapshot, so packaging constraints must be revalidated rather than assumed.

Lightflow remains an independent project by MidFord and is not affiliated with or endorsed by Blockbench, Mojang Studios, Microsoft, or their respective trademarks.
