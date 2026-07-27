# Lightflow Module Guide

Lightflow is distributed as five independently loadable Blockbench plugins. They are designed to behave as one suite, but each module owns a clear part of the rendering pipeline.

## Light Manager

The foundation module for real scene lights.

Use it for:

- Point, Spot, and Directional lights;
- viewport handles for position, direction, range, cone, and bounds;
- color, temperature, intensity, attenuation, and penumbra;
- adaptive raster shadows with preview/final quality separation;
- light and shadow profiles;
- fitting lights or directional bounds to selected content;
- animation channels for position, rotation, color, and intensity.

Install this module first.

## Lightflow Environment

A Minecraft-inspired procedural world and ambient-light system.

Use it for:

- Minecraft time from 0 to 23999;
- realtime day-cycle playback;
- Vanilla and Vibrant Visuals presets;
- custom sky gradients and palettes;
- deterministic stars;
- square sun and moon textures with moon phases;
- voxel-style clouds and cloud motion;
- project texture overrides;
- sky, horizon, and ground ambient colors;
- environment reflections and sun/moon shadows.

The environment is not only a background. Compatible materials consume its ambient and reflection response.

## Shader Architect

The material workspace and programmable surface system.

Use it for:

- global materials;
- per-element materials for Cubes, Meshes, and Texture Meshes;
- per-face Cube overrides;
- Material Instances and reusable override presets;
- Lightflow, Cinematic Craft, Principled PBR, Vibrant Visuals PBR, and pixelated workflows;
- AO, SSR, SSS, bevels, rim light, outlines, transmission, clearcoat, sheen, anisotropy, and iridescence;
- editable GLSL with formatting and validation;
- `.samat` import/export;
- native Blockbench emissive, additive, layered, and MER texture semantics.

Shader Architect requires Light Manager.

## Lightflow Atmosphere

A local volumetric system based on editable Volume Domains.

Use it for:

- uniform fog;
- height fog;
- local mist;
- additive God Rays;
- procedural clouds;
- cinematic dust;
- physically composited or shaft-style volumes;
- depth occlusion and volumetric shadow reception;
- separate preview and render quality.

Atmosphere is one of the most expensive modules. Use the smallest domain and lowest preview quality that still communicates the intended result.

## Studio Render

The final composition and still-output module.

Use it for:

- Scene Composer inside Lightflow Render mode;
- realtime GPU Bloom;
- exposure, contrast, saturation, temperature, tint, and vignette;
- saved camera presets;
- adjustable render frame;
- transparent or solid backgrounds;
- tiled high-resolution output;
- supersampling;
- preview, save, clipboard, or texture destinations;
- 4K, DCI 4K, square 4K, 8K, and custom resolutions.

Studio Render can operate independently, but it becomes most useful when it receives lighting, material, environment, and atmosphere data from the rest of the suite.

## Recommended module combinations

| Goal | Modules |
| --- | --- |
| Better viewport lighting | Light Manager |
| Stylized material preview | Light Manager + Shader Architect |
| Minecraft environment scene | Light Manager + Environment + Shader Architect |
| Cinematic volumetric image | Light Manager + Environment + Shader Architect + Atmosphere + Studio Render |
| Clean transparent product render | Light Manager + Shader Architect + Studio Render |
