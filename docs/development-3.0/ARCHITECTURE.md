# Lightflow 3.0 — Architecture

## Design direction

Lightflow 3.0 is evolving from loosely cooperating Blockbench plugins into a small rendering platform. The architecture is intentionally still plugin-based, but shared contracts now matter as much as individual UI features.

The practical layering is:

```text
Host: Blockbench + Three.js/WebGL
        │
        ├── Foundation: Light Manager
        │     ├── lifecycle hydration
        │     ├── shared UI primitives
        │     ├── LightElement / LightAnimator
        │     └── shadow/render preparation
        │
        ├── Scene providers
        │     ├── Environment
        │     └── Atmosphere
        │
        ├── Renderer/material core: Shader Architect
        │     ├── MaterialManager / material instances
        │     ├── program compilers
        │     ├── frame pipeline/resources
        │     ├── AO / SSR / screen access
        │     ├── warmup / diagnostics / frame budget
        │     └── external-render contracts
        │
        ├── Final renderer: Studio Render
        │     ├── tiled supersampling
        │     ├── Scene Composer / Bloom / grading
        │     └── still-frame API
        │
        └── Workflow extensions
              ├── Cinematic → deterministic repeated Studio Render frames
              ├── Visual Shader Graph → Shader Architect material generation
              └── Bedrock Structure Studio → optimized world-data geometry bridge
```

## Lifecycle and ownership

### Light Manager lifecycle

Light Manager provides `LightflowLifecycle`, which later modules use to hydrate/reattach project state after plugin load, project parse, selection and close operations. New modules should prefer this path rather than independently duplicating project lifecycle listeners.

A module must clean up only resources it owns. Window bindings, event handlers, Three.js groups, timers, helper objects and custom Outliner types need symmetrical unload behavior.

## Lighting contract

Light Manager owns logical lights and their Three.js counterparts. Renderer consumers should not infer lights by scanning arbitrary scene objects when the Light Manager integration API is available.

Important concepts:

- preview versus final shadow resolution;
- explicit shadow dirtying;
- render-time light preparation;
- global/native preview-light exclusion when Lightflow owns the lighting result;
- visibility-aware hierarchy.

Shader Architect consumes this contract and synchronizes material light uniforms. Studio Render asks Light Manager to prepare the target renderer before final frame rendering.

## Material and shader contract

### Material Manager

Shader Architect's `MaterialManager` is the canonical registry for Lightflow material definitions and project material instances. Element-level IDs should resolve through it instead of copying raw Three.js materials permanently.

Current major material families:

- `classic`
- `lightflow` / legacy Lightflow identity
- `pbr_metallic_roughness`
- `cinematic_craft` (Rendercraft)
- compatibility alias `luma_forge`

### Program compilers

Shader Architect 3.2.6 has dedicated program compilers for Rendercraft, PBR and Lightflow surfaces. Structural shader features are separated from runtime artistic parameters to reduce unnecessary program variation.

Rendercraft structural keys include pass type, bevel, relief, shadows, pixelated shadows, native detail and light-slot bucket. Glow, connected-bevel behavior and many artistic controls remain uniform-driven.

This separation is important for warmup performance and cache reuse.

## Frame pipeline

`LightflowRenderer` and `LightflowFramePipeline` define the newer render orchestration path.

The renderer exposes:

- external frame rendering;
- renderer capability validation;
- pass shader-source generation;
- graph description/diagnostics;
- screen-access architecture metadata;
- program compiler diagnostics and cache statistics;
- pass isolation for performance debugging.

### Screen access

Current architecture: **current-frame clean scene**.

The intent is to capture shared scene color/depth once before screen-reading materials consume them. Screen-reading materials should sample that clean source rather than recursively sampling themselves.

Canonical resources include:

- `SA_SCREEN_COLOR`
- `SA_SCREEN_DEPTH`

Legacy SSR uniform names remain compatibility aliases and should not become new API dependencies.

### SSR

Current documented path: **global screen resolve**.

The SSR resolve reads:

- scene color;
- scene depth;
- scene surface data;
- scene emission data;

and writes an SSR result buffer. The current high-end path expects WebGL2 MRT capability sufficient for its surface/emission contract.

### AO

Ambient occlusion has moved beyond a simple single-pass screen effect toward a Hi-Z/temporal GTAO-oriented implementation. It must be evaluated as part of the shared frame graph because depth production, temporal invalidation and animation state all affect correctness.

## Animation and deterministic frame context

Shader Architect publishes a shared animation/frame context so time-dependent shader behavior can be evaluated consistently. Cinematic extends this concept with `LightflowCinematicFrameContext`, which represents the exact cinematic frame currently being evaluated/rendered.

A final cinematic frame should have one deterministic interpretation of:

- timeline time;
- sequence frame;
- camera state;
- animated model state;
- animated lights;
- time-driven shader uniforms;
- environment state;
- render sample timing.

Any module that uses wall-clock time during Cinematic rendering risks nondeterministic output and should instead use the shared frame context when available.

## Studio Render contract

Studio Render is not a second unrelated renderer. It is an external consumer of the same scene/material systems.

Before a tile/frame it can:

1. ask Light Manager to prepare lights/shadows;
2. ask Shader Architect to prepare or warm required programs;
3. configure Studio Render sample scale/frame scale;
4. render the tile with the intended camera offset;
5. derive selective Bloom information;
6. resolve/downsample the tile;
7. restore renderer/project state.

Cinematic should call Studio Render's frame API rather than reimplementing still rendering.

## Visual Shader Graph contract

Visual Shader Graph should remain an authoring/compiler layer, not a parallel material runtime.

Its output is a Shader Architect material definition or material instance. This keeps:

- light integration;
- screen-resource binding;
- Studio Render preparation;
- material assignment;
- persistence;
- diagnostics

inside one canonical runtime.

The graph's typed Geometry Attribute + Varying system is the bridge between vertex and fragment stages. Subgraphs are expanded before final validation/compilation.

## Bedrock Structure Studio contract

Structure Studio separates **logical Minecraft cells** from **derived render geometry**.

Logical cells own:

- block identifier;
- block states;
- layer;
- block entity/NBT;
- logical position;
- export semantics.

Optimized preview owns derived, disposable data:

- culled chunk geometry;
- render-layer grouping;
- atlas UVs/pages;
- flipbook materials;
- Lightflow bridge materials.

Derived chunk elements must never become the source of truth for exported structure data.

### Chunking

The default fast path uses Minecraft-style 16×16 X/Z chunks across the structure height and separates solid, vegetation, translucent and animated layers.

### Atlas

Static texture appearances are baked into shared atlas pages. Tint is baked into atlas pixels rather than multiplied through material color. Animated flipbooks stay on a separate path.

The Lightflow bridge should adapt these derived meshes to Shader Architect's active view-mode policy without mutating logical structure data.

## Public API discipline

The development snapshot exposes multiple cross-module APIs on `window`. Before 3.0 stabilization, these should be audited and classified:

- stable public API;
- internal cross-module contract;
- debugging/diagnostics only;
- compatibility alias scheduled for removal.

At minimum, API objects that are intended to survive across releases should expose an `apiVersion` or architecture version and fail gracefully when a newer/older consumer is loaded.
