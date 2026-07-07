# Lightflow v0.1.0 Alpha

The first public Open Alpha release of **Lightflow for Blockbench** is here.

Lightflow is a modular rendering suite built for artists who want more control over presentation without leaving Blockbench:

- **Light Manager 1.3.0** — animatable point, spot, and directional lights with configurable shadows, gizmos, profiles, and final-render shadow controls.
- **Shader Architect 2.0.0** — advanced scene, cube, and face materials; material instances; editable GLSL; `.samat` material files; stylized lighting; bevels; outlines; rim light; AO; and more.
- **Studio Render 1.0.0** — clean, tiled high-resolution exports with supersampling, adjustable framing, transparency, and PNG output options.

## Install

Load the included local plugins in Blockbench Desktop in this order:

1. `light_manager.js`
2. `shader_architect.js`
3. `studio_render.js`

Read the main README before starting. Shader Architect requires Light Manager, and `.bbmodel` is the recommended project format for preserving material overrides.

## Alpha notice

This is a pre-release. Visual output and performance can vary by GPU, driver, graphics settings, model complexity, and Blockbench version. Please report reproducible bugs with your Lightflow version, Blockbench version, operating system, GPU, screenshots, and a small test model when possible.

## Feedback

Use GitHub Issues for bugs and focused feature requests. Use Discussions for questions, ideas, renders, and setup help.

Thank you for testing Lightflow.
