# Lightflow 3.0 Development Changelog

## 2026-08-24 — Development preservation snapshot

Created the dedicated `development/lightflow-3.0` line to preserve the integrated post-Rendercraft development state before release hardening.

### Renderer/material platform

- Shader Architect advanced to 3.2.6.
- Rendercraft evolved into the current stylized promotional renderer direction with rewritten bevel, connected clipping, edge glow, rim/silhouette, Texture Relief, artistic blend modes, transparency and Bloom integration.
- Introduced/expanded dedicated Rendercraft, PBR and Lightflow surface program compilers.
- Added shared frame-pipeline architecture, diagnostics, performance isolation and frame-budget controls.
- Added current-frame clean scene color/depth screen access and global SSR resolve architecture.
- Expanded AO toward Hi-Z/temporal GTAO-oriented processing.
- Expanded warmup/external-render preparation for Studio Render.

### Lighting/environment/composition

- Light Manager advanced to 1.8.2 with stronger lifecycle, shadow preparation, gizmo/tooling and shared UI foundations.
- Environment 1.9.0 includes full-sky editable gradients and expanded Rendercraft cloud lighting/bevel/fog behavior.
- Atmosphere 1.2.0 remains the local volumetric domain system.
- Studio Render advanced to 1.9.10 with stronger tiled supersampling, Rendercraft-selective Bloom, high-frequency detail preservation, PNG worker encoding and renderer integration.

### New development systems

- Added Lightflow Cinematic 0.1.0: deterministic sequence/camera/frame foundations and streaming PNG-sequence rendering.
- Added Visual Shader Graph 1.2.0: graph format 3, 111 node definitions, vertex/fragment Stage I/O, attributes, varyings, subgraphs, screen/scene nodes and Shader Architect compilation.
- Added Bedrock Structure Studio 2.2.1: complete little-endian NBT/`.mcstructure` workflow, logical block editing, resource-pack resolution, biome tinting and optimized chunk/atlas preview with Lightflow bridge.

### Known development blockers retained intentionally

- screen-space source alignment/scale mismatch;
- Rendercraft/warmup/large-scene performance validation;
- Bedrock optimized-preview transform and material parity;
- tall-grass/bush texture/tint validation;
- final viewport/Studio Render parity;
- Cinematic, Shader Graph and Structure Studio stabilization;
- distribution/package-size strategy.
