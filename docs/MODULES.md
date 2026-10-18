# Lightflow modules

Lightflow is a **suite of independent Blockbench plugins**, not a single monolithic plugin. The five foundational rendering modules can be combined with optional creative, specialized and developer tools. **Lightflow Hub** is the installer and update manager; it is listed separately from the suite modules.

This inventory is based on [lightflow.manifest.json](../lightflow.manifest.json) in `main`. Versions below are **development-manifest versions, not promises about the Stable release**. For installation channels, see [Installation](INSTALLATION.md).

## Lightflow Hub

- Script: `lightflow_hub.js`
- Version on `main`: `1.1.0`
- Purpose: install, update, enable, disable and manage module versions and their dependencies.
- Recommended installer: the pinned [Lightflow Hub v1.0.1 release](https://github.com/MidFord/lightflow-blockbench/releases/tag/lightflow-hub-v1.0.1).

## Core rendering suite

| Module | Development version | Entry point | Dependencies |
| --- | --- | --- | --- |
| **Light Manager** | `1.9.0` | `light_manager.js` | None |
| **Shader Architect** | `3.3.0` | `shader_architect.js` | `light_manager` |
| **Lightflow Environment** | `1.10.0` | `lightflow_environment.js` | `light_manager` |
| **Lightflow Atmosphere** | `2.1.0` | `lightflow_atmosphere.js` | `light_manager` |
| **Studio Render** | `1.10.0` | `studio_render.js` | None |

### Light Manager

Lights, gizmos, animation, and shadows for the entire suite. It provides the shared lighting foundation for dependent plugins.

### Shader Architect

Lightflow, PBR, and Rendercraft materials, instances, and screen effects. Use this to assign materials globally, to elements, or to individual cube faces.

### Lightflow Environment

Sky, sun, moon, clouds, reflections, and environment lighting. 

### Lightflow Atmosphere

Local fog, light shafts, dust, and procedural volumes. 

### Studio Render

High-resolution scene composition and supersampled image export. Use it to compose and export the final still image.

## Optional creative, specialized and developer tools

| Module | Group | Maturity | Version | Entry point | Declared dependencies |
| --- | --- | --- | --- | --- | --- |
| **Scene Links** | creative | experimental | `0.1.0` | `lightflow_scene_links.js` | `light_manager` |
| **Lightflow Cinematic** | creative | experimental | `0.2.0` | `lightflow_cinematic.js` | `studio_render` |
| **Visual Shader Graph** | creative | beta | `1.3.0` | `visual_shader_graph.js` | `light_manager`, `shader_architect` |
| **Lightflow Terrain Render** | specialized | beta | `2.6.0` | `dist/bedrock_structure_studio.js` | `light_manager` |
| **Lightflow Test Lab** | developer | developer | `2.0.0` | `lightflow_test_lab.js` | `light_manager`, `shader_architect` |
| **Lightflow UI Lab** | developer | developer | `1.0.0` | `lightflow_ui_lab.js` | `light_manager` |
| **Lightflow UI Diagnostics** | developer | developer | `1.1.0` | `lightflow_ui_diagnostics.js` | `light_manager` |

### Scene Links

Compose scenes from linked Blockbench projects with independent poses.

### Lightflow Cinematic

Deterministic sequences, physical cameras, and animation rendering.

### Visual Shader Graph

A visual shader editor connected to Shader Architect.

### Lightflow Terrain Render

Compose terrain with Bedrock and Java structures, logical block editing and local resource packs. Requires **Blockbench 5.0.0+**.

### Lightflow Test Lab

Renderer diagnostics and benchmarks for development.

### Lightflow UI Lab

Development-only fixtures using real shared controls in a Panel and Dialog.

### Lightflow UI Diagnostics

Visual and accessibility auditing for panels and dialogs.

## Recommended combinations

| Goal | Start with |
| --- | --- |
| Better lighting and shadow control | Light Manager |
| Stylized and PBR materials | Light Manager + Shader Architect |
| Minecraft-inspired day/night and sky | Light Manager + Environment + Shader Architect |
| Fog and light shafts | Core modules + Atmosphere |
| Finished still image | Light Manager + Shader Architect + Studio Render |
| Animation and camera-sequence experiments | Core modules + Cinematic (experimental) |
| Structure/terrain authoring | Light Manager + Lightflow Terrain Render (beta) |

Module IDs, direct file paths, current versions and declared dependencies are maintained in the [manifest](../lightflow.manifest.json). Some internal helper scripts are **not** independently installable plugins. Do not move or rename manifest-listed entry points without updating Hub, installation URLs and release packaging.
