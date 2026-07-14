# Lightflow rendering backends

This document defines what the release candidate can promise on Blockbench's current renderer and separates implemented features from future renderer research.

## Current production backend: WebGL raster

Lightflow runs inside Blockbench's Three.js/WebGL renderer. This backend is available in the desktop and web variants, works with Blockbench's scene and plugin APIs, and remains the supported production path.

| Capability | Release-candidate status | Implementation |
| --- | --- | --- |
| Cube, Mesh, and Texture Mesh materials | Supported | Generic render-element discovery, dynamic geometry attributes, native material-slot preservation, and project persistence |
| Opaque and cutout shadows | Supported | Alpha-tested custom depth and distance materials with GPU-capped per-slot texture selection for multi-material elements |
| Semitransparent shadow density | Supported approximation | Stable stochastic alpha coverage in the existing shadow map |
| Zero-thickness Cubes | Supported | Coincident faces are resolved as independent front-facing surfaces; a fully transparent face inherits the visible opposite surface |
| Colored transmissive shadows | Not yet supported | Requires RGB transmittance accumulation rather than a depth-only shadow map |
| Hardware RTX/ray tracing | Not exposed | Blockbench's current Three.js/WebGL plugin surface does not expose a hardware ray-tracing pipeline |

The stochastic shadow path approximates how much light passes through a texel. Studio supersampling integrates the coverage more cleanly in final stills. It does not tint the receiving surface because the standard shadow map contains depth visibility, not transmitted RGB energy.

## Why there is no cosmetic “RTX” switch

An option named RTX would be misleading unless the renderer can build acceleration structures, trace rays, manage denoising, and report a supported hardware path. WebGL and the Three.js revision bundled by the targeted Blockbench versions do not provide those facilities to plugins. GPU model names or vendor extensions are not a safe substitute for an actual ray-tracing API.

Lightflow therefore uses capability-based behavior:

- the WebGL raster path is always the compatibility baseline;
- expensive quality improvements are opt-in through existing render, shadow, atmosphere, AO, reflection, and supersampling controls;
- unsupported hardware ray tracing is never silently emulated or advertised as RTX.

## Practical next step for colored transparency

Colored transmissive shadows do not require hardware ray tracing. A future optional raster experiment can render light-space RGB transmittance into an additional texture, blur or filter it, and sample it alongside the depth shadow map. That work must solve multi-light memory cost, material arrays, texture animation, alpha compositing order, point-light cube maps, tile stability, and fallback behavior before it can be enabled by default.

## Future native or WebGPU research

A separate backend can be evaluated when the host renderer exposes a stable integration point. A production-quality ray path would need:

1. explicit runtime capability detection;
2. acceleration-structure construction and invalidation for animated Blockbench geometry;
3. material translation for Lightflow and native Blockbench texture modes;
4. temporal accumulation and denoising that remain stable across Studio Render tiles;
5. strict memory budgets and an automatic raster fallback;
6. visual regression scenes for opaque, cutout, semitransparent, emissive, Mesh, and Texture Mesh content.

Until those requirements are met, the supported high-quality path is the optimized WebGL renderer plus Studio Render supersampling—not a simulated RTX label.
