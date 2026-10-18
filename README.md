# Lightflow for Blockbench

> **Bring your models to light.** Real-time lighting, stylized materials, atmosphere, and cinematic presentation, without leaving Blockbench.

[![Blockbench 4.9+](https://img.shields.io/badge/Blockbench-4.9%2B-3b82f6?style=flat-square)](https://www.blockbench.net/)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-6b7280?style=flat-square)](LICENSE)
[![Development](https://img.shields.io/badge/channel-development-f0ad00?style=flat-square)](docs/DEVELOPMENT_STATUS.md)

**Lightflow** is a rendering toolkit for [Blockbench](https://www.blockbench.net/). It helps artists turn a model into a finished image: place lights, shape shadows, choose how materials respond, build an environment, add atmospheric effects, and render the result.

The toolkit uses Blockbench's real-time graphics pipeline. It is not a path tracer or a replacement for a full 3D animation package.

## Get started

**Recommended: install with Lightflow Hub.** It manages compatible modules and updates in one place.

1. Install [Lightflow Hub 1.0.1](https://github.com/MidFord/lightflow-blockbench/releases/tag/lightflow-hub-v1.0.1) in Blockbench. The [installation guide](docs/INSTALLATION.md) explains how to load the pinned Hub script.
2. Open **Tools → Lightflow Hub**, keep **Stable** selected for the published release snapshot, and install the recommended modules.
3. Open a model and follow [Your first Lightflow render](docs/FIRST_RENDER.md).

**Requirements:** Blockbench 4.9+ and a WebGL-capable GPU. Blockbench Desktop with a dedicated GPU is recommended for demanding scenes. Some optional modules have higher requirements; check the [module inventory](docs/MODULES.md).

> **Release channels:** The frozen [v0.1.0 preview](https://github.com/MidFord/lightflow-blockbench/releases/tag/v0.1.0) and the actively changing `main` branch are not the same build. `main` targets **0.2.0-rc.1** (development); its features and versions can change before release. For a predictable install, use the Hub's **Stable** channel, not raw `main` links.

## What Lightflow can do

| Capability | Module |
| --- | --- |
| Scene lights, gizmos, animation and shadow control | **Light Manager** |
| PBR/stylized materials, Rendercraft, material instances and screen effects | **Shader Architect** |
| Skies, sun and moon, clouds and environment lighting | **Lightflow Environment** |
| Local mist, volumetrics and light shafts | **Lightflow Atmosphere** |
| Scene composition and high-resolution still export | **Studio Render** |

Lightflow also has **optional creative and specialized tools**, including Cinematic, Visual Shader Graph, Scene Links, terrain/structure rendering, and developer diagnostics. Not all are intended for production use yet. See [all modules, availability and dependencies](docs/MODULES.md).

## Guides

| If you want to… | Go to… |
| --- | --- |
| Install or update Lightflow | [Installation](docs/INSTALLATION.md) |
| Make your first render | [First render](docs/FIRST_RENDER.md) |
| Understand the plugin ecosystem | [Modules](docs/MODULES.md) |
| Explore practical looks and setups | [Workflows](docs/WORKFLOWS.md) |
| Fix a problem or improve performance | [Troubleshooting](docs/TROUBLESHOOTING.md) |
| Check development status and release channels | [Development status](docs/DEVELOPMENT_STATUS.md) |
| Contribute or inspect the technical documentation | [Documentation index](docs/README.md) |

## Installation and compatibility

Lightflow Hub is the recommended installer. It installs from a selected release/development channel and resolves declared module dependencies.

The JavaScript entry points deliberately remain at the **repository root** because existing installation URLs, the Hub manifest, and Blockbench integrations depend on those paths. Do not move them into `src/` without a coordinated distribution migration. The manifest can also reference distributable files in `dist/`.

For manual installation, pinned URLs and update instructions, see [Installation](docs/INSTALLATION.md). Back up important `.bbmodel` projects before switching channels.

## Feedback and development

Lightflow is developed in public. [Report a bug or suggest a feature](https://github.com/MidFord/lightflow-blockbench/issues); include your Blockbench version, GPU, module versions and reproduction steps when reporting rendering problems.

Contributors can start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [development guide](docs/DEVELOPMENT.md). The current release manifest is [lightflow.manifest.json](lightflow.manifest.json).

## License and acknowledgements

Licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for attribution and project affiliation information.

Lightflow is an independent community project, not affiliated with or endorsed by Blockbench, Mojang Studios, or Microsoft. Minecraft and related trademarks belong to their respective owners.

Created by **MidFord**.
