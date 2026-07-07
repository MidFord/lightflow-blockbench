# Lightflow Open Alpha

## What Open Alpha means

Lightflow is publicly usable, but it is still under active development. Features are present because they already create useful results, not because every workflow is final or guaranteed stable.

The purpose of this phase is to learn from real artists using real Blockbench projects: different GPU vendors, different model scales, different texture styles, and different export goals.

## What testers should expect

- Visual output can vary by GPU, driver, graphics settings, and Blockbench version.
- Some settings are technical and may change names, ranges, defaults, or behavior during Alpha.
- High-resolution Studio Render output can take time or require lower samples on weaker hardware.
- A Blockbench update can temporarily affect advanced rendering integration until Lightflow is updated.
- Save work as `.bbmodel` when Shader Architect material instances or overrides matter.

## Who should try it now

Lightflow Alpha is a good fit for artists who want to:

- Make portfolio or commission renders without leaving Blockbench.
- Test stylized lighting, rim light, bevels, outlines, and material variation.
- Create transparent cutouts, thumbnails, or social-media showcases.
- Help find bugs and share feedback.

## How to install

1. Download one complete Lightflow release package.
2. In Blockbench Desktop, load the plugins in this order:
   1. `light_manager.js`
   2. `shader_architect.js`
   3. `studio_render.js`
3. Restart or reload plugins after updates.
4. Start from the Quick Start workflow in the main README.

## How to provide useful feedback

The best report includes:

- What you were trying to make.
- What happened and what you expected instead.
- Exact reproduction steps.
- Lightflow version, Blockbench version, operating system, and GPU.
- A small `.bbmodel` file or screenshots if you can share them legally.
- Whether the issue appears in preview, Studio Render, or both.

## Alpha feedback priorities

Please prioritize reports about:

- Plugin installation or load-order failures.
- Crashes, broken previews, or unusable UI.
- Missing or incorrect shadows.
- Material assignments not persisting in `.bbmodel` files.
- Render seams, transparency problems, or unexpectedly low-quality output.
- Major performance regressions.
