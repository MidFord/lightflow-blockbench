# Lightflow for Blockbench

**Bring your models to light.**

Lightflow is a creative rendering toolkit built for [Blockbench](https://www.blockbench.net/). From a simple character to a carefully staged scene, it helps you tell a story with **light, shadows, materials, atmosphere, and a final render**—right where you made your model.

<p align="center">
  <img src="assets/lightflow_beta_showcase.png" width="480" alt="An early Lightflow showcase render: a grassy Minecraft-style block with a small red flower, softly lit against a bright blue sky.">
</p>
<p align="center"><sub>Artwork from an early Lightflow preview. The renderer and its visual identity continue to evolve.</sub></p>

<p align="center">
  <a href="https://github.com/MidFord/lightflow-blockbench/releases"><img alt="GitHub releases" src="https://img.shields.io/badge/Get%20Lightflow-Releases-2ea6a6?style=flat-square"></a>
  <a href="docs/INSTALLATION.md"><img alt="Installation guide" src="https://img.shields.io/badge/Install-with%20Lightflow%20Hub-3b82f6?style=flat-square"></a>
  <a href="LICENSE"><img alt="License Apache 2.0" src="https://img.shields.io/badge/License-Apache%202.0-6b7280?style=flat-square"></a>
</p>

## A little more than a viewport

Sometimes a model is finished, but the image doesn't feel finished yet. Maybe the shadows aren't telling the right story, the world needs a sunset, or the final shot deserves a little more atmosphere.

That's what I'm building Lightflow for: a way to go from **"I made this"** to **"this is how I imagined it"** without leaving Blockbench.

With Lightflow, you can:

- **Shape the lighting.** Place and aim lights, soften shadows, and make the important details stand out.
- **Find your look.** Work with stylized and PBR-inspired materials, including Lightflow and Rendercraft.
- **Build the mood.** Create skies, day-and-night lighting, clouds, fog, and light shafts.
- **Finish the shot.** Adjust composition, color, and Bloom, then export a high-resolution image.
- **Explore more.** Optional tools for camera sequences, shader graphs, linked scenes, and structure/terrain workflows are also in development.

Lightflow focuses on **real-time, artist-friendly rendering**. It's not an offline path tracer; the idea is to give you creative control while you keep working in the editor you know.

## Get started in a few minutes

The easiest way to install and manage Lightflow is with **Lightflow Hub**.

1. Install [Lightflow Hub v1.0.1](https://github.com/MidFord/lightflow-blockbench/releases/tag/lightflow-hub-v1.0.1) using the [step-by-step installation guide](docs/INSTALLATION.md).
2. In Blockbench, open **Tools → Lightflow Hub** and install the recommended modules from the **Stable** channel.
3. Open a model and follow [Your first Lightflow render](docs/FIRST_RENDER.md) to build your first scene.

**You'll need:** Blockbench 4.9 or newer and a WebGL-capable GPU. Blockbench Desktop is recommended, especially for demanding renders. Some optional modules need newer versions of Blockbench.

> **Which version should I install?** The [v0.1.0 suite preview](https://github.com/MidFord/lightflow-blockbench/releases/tag/v0.1.0) is a frozen pre-release snapshot. Meanwhile, `main` is where the next generation of Lightflow is being developed, currently targeting `0.2.0-rc.1`. The Hub's **Stable** channel is the safer starting point; choose **Main** only if you want to try development builds. [Read about the channels](docs/INSTALLATION.md).

## Made of small tools that work together

You can start with the essentials and bring in other modules as your project needs them.

| Module | What it brings to your scene |
| --- | --- |
| **Light Manager** | Place lights, control their shadows, and animate lighting |
| **Shader Architect** | Create and assign Lightflow, Rendercraft, and other materials |
| **Lightflow Environment** | Skies, the sun and moon, changing time of day, and clouds |
| **Lightflow Atmosphere** | Mist, atmospheric volumes, and light shafts |
| **Studio Render** | Final composition, effects, and high-resolution image export |

There are also **optional and experimental tools** such as Lightflow Cinematic, Visual Shader Graph, Scene Links, and Lightflow Terrain Render. Their maturity and requirements vary; they are not all part of the frozen Stable preview.

[Explore every module →](docs/MODULES.md)

## Learn and create

| Where to go | What you'll find |
| --- | --- |
| [Install Lightflow](docs/INSTALLATION.md) | Installation, updates, and release channels |
| [Make your first render](docs/FIRST_RENDER.md) | A friendly walkthrough from first light to final image |
| [Try different workflows](docs/WORKFLOWS.md) | Ideas for cinematic, outdoor, product, and atmospheric scenes |
| [Explore the modules](docs/MODULES.md) | Each tool, its purpose, and its dependencies |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Solutions for common issues and performance problems |
| [Full documentation](docs/README.md) | More guides, technical details, and historical notes |

## Building Lightflow in the open

Lightflow is an evolving project. There are still things to improve, experiments to validate, and ideas I want to explore. I care about making it **useful, approachable, visually consistent, and enjoyable to create with**.

Found a bug? Have an idea? Made something you want to show?

**[Open an issue or share feedback →](https://github.com/MidFord/lightflow-blockbench/issues)**

If you're interested in helping develop Lightflow, start with the [contribution guide](CONTRIBUTING.md) and [developer documentation](docs/DEVELOPMENT.md). The repository keeps its installable JavaScript entry points at their established paths for compatibility with Blockbench and Lightflow Hub.

You can also follow the project at [@ford_mid_wells](https://x.com/ford_mid_wells).

## License

Lightflow is licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for legal attribution and project affiliations.

Lightflow is an independent community project and is not affiliated with or endorsed by Blockbench, Mojang Studios, or Microsoft. Minecraft and related trademarks belong to their respective owners.

**Created by MidFord.**
