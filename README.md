# Lightflow for Blockbench

> **A production-oriented rendering suite for Blockbench** — animatable lights, advanced shader materials, and studio-quality image exports without leaving the editor.

**Status:** Release Candidate / final compatibility testing  
**Minimum Blockbench version:** `4.9.0`  
**Recommended environment:** Blockbench Desktop with a WebGL-capable dedicated GPU

Lightflow is a modular suite for artists who want more control over how Blockbench scenes look before they are shown, shared, or exported. It is designed around a simple pipeline:

1. **Light Manager** creates and animates the lighting.
2. **Shader Architect** gives the scene a material and stylized surface response.
3. **Studio Render** captures a polished, high-resolution final image.

The plugins work independently where possible, but they are designed to be used together.

---

## Contents

- [What Lightflow includes](#what-lightflow-includes)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Plugin guide](#plugin-guide)
- [Shader Architect presets](#shader-architect-presets)
- [Recommended workflows](#recommended-workflows)
- [Saving and compatibility](#saving-and-compatibility)
- [Performance and quality](#performance-and-quality)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)
- [Contributing and feedback](#contributing-and-feedback)
- [Roadmap](#roadmap)
- [License](#license)

---

## What Lightflow includes

| Plugin | Current version | Purpose | Dependency |
| --- | ---: | --- | --- |
| **Light Manager** | `1.3.1` | Adds production-oriented point, spot, and directional lights with shadows, gizmos, animation support, and lighting profiles. | None |
| **Shader Architect** | `2.1.0` | Builds and assigns advanced materials, exposes shader controls, supports editable GLSL, material instances, and `.samat` material files. | **Light Manager required** |
| **Studio Render** | `1.1.0` | Exports clean images with tiled supersampling, adjustable framing, optional final Bloom, transparency, and 4K/8K-safe output controls. | Works alone; integrates with the other two plugins |

### Why Lightflow exists

Blockbench is fast and approachable, but a showcase render often needs more control than a screenshot: lighting that can be placed and animated, materials that can react to that light, clean edge treatment, and a reliable high-resolution export path. Lightflow brings those pieces together inside the Blockbench workflow.

Lightflow is **not** a replacement for an offline ray tracer or a game engine. It is a real-time, artist-oriented rendering toolkit built around Blockbench and WebGL. Results depend on your GPU, model complexity, texture setup, material settings, and the current Blockbench version.

---

## Requirements

- Blockbench **4.9.0 or newer**.
- A WebGL-capable GPU. A dedicated GPU is strongly recommended for high-resolution Studio Render output.
- The three plugin files from the same Lightflow release.
- Save working scenes as **`.bbmodel`** when you need Shader Architect material assignments and material instances to persist.

> **Important:** Shader Architect requires Light Manager. Install and enable Light Manager first.

---

## Installation

### Manual installation from a release

1. Download the three JavaScript files from the latest Lightflow release:
   - `light_manager.js`
   - `shader_architect.js`
   - `studio_render.js`
2. Open Blockbench.
3. Open the Plugin menu and load each local plugin file, or drag the JavaScript files into Blockbench.
4. Load them in this order:
   1. **Light Manager**
   2. **Shader Architect**
   3. **Studio Render**
5. Reload Blockbench or reload plugins after an update. During development, Blockbench can reload plugins with `Ctrl/Cmd + J`.

### Recommended release layout

```text
lightflow-blockbench/
├─ plugins/
│  ├─ light_manager/
│  │  └─ light_manager.js
│  ├─ shader_architect/
│  │  └─ shader_architect.js
│  └─ studio_render/
│     └─ studio_render.js
├─ docs/
│  ├─ screenshots/
│  ├─ workflows/
│  └─ troubleshooting.md
├─ examples/
├─ README.md
├─ CHANGELOG.md
└─ LICENSE
```

### Future Plugin Store installation

Once Lightflow is accepted into the Blockbench Plugin Store, install each module from **File → Plugins**. Until then, use the manual installation workflow above.

---

## Quick start

This first workflow creates a clean, lit presentation render from a normal Blockbench model.

### 1. Prepare a model

Open or create your model in Blockbench. Verify that your texture assignments, UVs, transparent pixels, and cube hierarchy are already correct.

### 2. Add a light

With **Light Manager** enabled:

1. Add a **Point**, **Spot**, or **Directional** light from the Light Manager actions or toolbar.
2. Select the light in the outliner.
3. Use the Light Properties panel to adjust color, intensity, distance, cone angle, penumbra, and shadow settings.
4. Start with a directional key light for broad shape definition, then add a soft point or spot fill light only where it helps.

### 3. Apply a material

With **Shader Architect** enabled:

1. Open **Material Studio**.
2. Choose a built-in material such as **Lightflow**, **LumaForge**, or **PBR Metallic/Roughness**.
3. Apply it globally, to selected cubes, or to selected faces.
4. Use exposed controls to tune lighting, ambient contribution, shadows, bevels, outlines, rim light, AO, or reflections as appropriate. Lightflow's **Shadows** toggle switches cast shadows without changing presets.
5. Create a **Material Instance** when different parts of the same model need different values without duplicating the shader code.

### 4. Render the image

With **Studio Render** enabled:

1. Open **Studio Render** or use **Quick Studio Render**.
2. Choose **4K UHD** for a first high-quality export.
3. Choose **Transparent** or **Solid Color** background.
4. Use **Studio SSAA – 4x** for clean promotional output. Use lower samples while iterating.
5. Select a full composition or the adjustable render frame.
6. Click **Render** and choose whether to preview, save, copy, or load the image as a texture.

---

## Plugin guide

### Light Manager

Light Manager is the foundation of the suite. It introduces real scene lights to the Blockbench outliner and connects those lights to Lightflow materials and Studio Render.

**Main capabilities**

- Point, spot, and directional light types.
- Light color, intensity, color temperature, range, cone angle, and penumbra controls.
- Viewport gizmos for positioning, aiming, range, cone, clipping, and shadow bounds.
- Shadow controls for resolution, bias, normal bias, softness, near/far planes, and directional bounds.
- Separate **Studio Shadow Resolution** for final renders without forcing the viewport to use the same cost.
- Lighting profiles and shadow profiles for faster setup.
- Fit selected lights to selected cubes or groups.
- Free movement from the current camera view.
- Animation channels for position, rotation, color, and intensity.

**Good starting setup**

- Use one directional light as the key light.
- Start with **Balanced** shadows before moving to higher resolutions.
- Keep shadow bounds tight around the subject. Large directional bounds reduce useful shadow-map detail.
- Use a low-to-medium preview shadow resolution while you work, then raise only the Studio Shadow Resolution for final output.

### Shader Architect

Shader Architect is Lightflow's material and shader workspace. It can drive an entire scene with one material or assign individual material instances to cubes and faces.

**Main capabilities**

- Global scene materials, per-cube materials, and per-face overrides.
- Reusable Material Instances with independent exposed values.
- Editable GLSL vertex and fragment shaders.
- GLSL formatting plus compile/link validation inside Material Studio.
- Import and export of custom `.samat` material files.
- Exposed uniforms for artist-facing controls and advanced technical controls for shader authors.
- Dynamic Light Manager uniforms for light positions, directions, colors, intensities, attenuation, cones, and shadow behavior.
- Built-in surface systems including PBR-style controls, stylized lighting, voxel-style AO, shadows, screen-space reflections, bevels, alpha-edge treatment, outlines, and promotional rim lighting.

**Material-instance workflow**

1. Choose a base material.
2. Select the cubes or faces that should differ from the global material.
3. Create a Material Instance.
4. Change only the exposed values needed for that part: for example rim intensity, bevel width, metallic response, outline strength, or emissive behavior.
5. Save as `.bbmodel` before closing the project.

### Studio Render

Studio Render is the export layer. It is intended for portfolio images, social-media posts, thumbnails, transparent cutouts, and clean documentation renders.

**Main capabilities**

- Full-composition or adjustable-frame capture.
- HD, 4K UHD, 4K DCI, square 4K, 8K, and custom output sizes.
- Tiled rendering to avoid relying on one enormous render target.
- Supersampling options from native output through 8× SSAA.
- Tile-bleed handling to reduce visible seams in high-quality renders.
- Transparent and solid-color backgrounds.
- Preview, PNG save, clipboard, and load-as-texture destinations.
- GPU diagnostics showing the detected renderer and relevant WebGL limits.
- Temporary Studio Render sessions that coordinate with Light Manager so final shadow settings do not permanently disturb the viewport.
- Optional final-image Bloom with a simple strength control and advanced threshold/radius controls.
- A compact default form; tile size, GPU diagnostics, resolution scaling, and technical effect controls stay under **Advanced Controls**.

---

## Shader Architect presets

The current built-in preset library includes:

| Preset | Best use |
| --- | --- |
| **Classic Shader** | Familiar Blockbench-like rendering with simple controls. |
| **PBR Metallic/Roughness** | A more technical material workflow with metallic/roughness-style behavior. |
| **Lightflow** | General-purpose stylized lighting. Use its **Shadows** toggle for shadowed or shadow-free rendering without switching materials. |
| **Pixelated Lightflow** | A deliberately stepped or pixel-oriented shaded response. |
| **LumaForge** | A more stylized studio material with artistic Lightflow features. |
| **Minecraft Promotional Bevel** | A specialized promotional bevel treatment for blocky, illustrated presentation renders. |

Use the preset name as a starting point, not as a guarantee of a specific visual style. A good render comes from the interaction between the preset, texture content, cube scale, lighting, camera angle, and export settings.

---

## Recommended workflows

### Clean Minecraft-style showcase

1. Use **Shaded Lightflow** or **LumaForge**.
2. Add one directional key light and one weak colored fill light.
3. Enable a restrained bevel or alpha bevel only where it improves the silhouette.
4. Add a subtle rim light to separate the model from a transparent or pale background.
5. Render at 4K with 2×–4× SSAA.

### Sharp pixel-art render

1. Start with **Pixelated Shaded Lightflow**.
2. Keep bevel, blur-like effects, and high softness values subtle.
3. Test native samples first; increase SSAA only when it improves the outer contour without softening the intended pixel language.
4. Use a transparent background for later compositing.

### Product-card or thumbnail render

1. Use **LumaForge** or **RealView PBR**.
2. Keep the background transparent or use a single neutral color.
3. Frame the subject using Studio Render's adjustable capture frame.
4. Use 4× SSAA for a final export after checking the composition with 1× or 2×.

### Animated lighting preview

1. Create lights in Light Manager.
2. Open the Animate workspace.
3. Animate position, rotation, color, and/or intensity.
4. Use Shader Architect materials that react to Light Manager lights.
5. Preview the animation before capture; final image capture is currently optimized around still render output.

---

## Saving and compatibility

### Save format

Save active Lightflow projects as **`.bbmodel`**. Shader Architect material assignments and instances use project/cube properties that may not survive every export format.

### Compatibility expectations

- Lightflow targets Blockbench `4.9.0+`.
- The plugin metadata declares support for both Desktop and Web variants, but **Desktop is recommended** for high-resolution image export and the most predictable file behavior.
- Browser security restrictions, GPU drivers, texture size limits, and WebGL capabilities can affect the web version.
- A shader result in the Blockbench viewport is not guaranteed to transfer to a game engine or game exporter. Lightflow materials are designed for Blockbench rendering.

---

## Performance and quality

### Fast iteration preset

- Resolution: 1920×1080
- SSAA: 1× or 2×
- Tile size: Auto
- Preview shadow resolution: 512 or 1024
- Studio shadow resolution: leave equal to preview until the final render

### Final promotional preset

- Resolution: 3840×2160 or 4096×4096
- SSAA: 4×
- Tile size: Auto or 2048 px
- Transparent background when compositing is planned
- Studio shadow resolution: 2048 or 4096 only when the model and camera need it

### Important tradeoffs

- Higher supersampling improves edge quality but raises render time and memory use.
- Larger shadow maps can improve detail but will not fix poor shadow bounds, unsuitable near/far planes, or a bad camera/light relationship.
- Many lights, high-resolution shadows, screen-space effects, and 8K output can become expensive quickly.
- Keep the scene simple while tuning. Add expensive effects only after the core composition works.

---

## Troubleshooting

### Shader Architect says Light Manager is required

Install and enable **Light Manager** first, then reload Shader Architect. Shader Architect intentionally waits for Light Manager so its materials can receive the expected lighting and shadow data.

### The final render is too slow or fails at high resolution

- Lower SSAA first.
- Use **Auto** tile size or reduce tile size.
- Reduce Studio Shadow Resolution.
- Temporarily disable expensive material controls such as reflections, large rim radii, or complex bevel treatment.
- Confirm Studio Render detects the dedicated GPU rather than an integrated or software renderer.

### Shadows look jagged, detached, or acne-like

- Start from a shadow profile instead of manually changing every value.
- Tighten directional shadow bounds around the subject.
- Check near/far planes.
- Raise resolution only after bounds are correct.
- Adjust normal bias carefully; too little may create acne, while too much can make shadows detach from objects.

### Material overrides disappear after reopening a project

Save the project as **`.bbmodel`**. Other formats may not preserve Lightflow's custom material-instance data.

### Gizmos appear where they should not

Studio Render hides gizmos by default. Verify that **Show Gizmos** is disabled in Studio Render settings, then render again.

### A plugin error appears

Open Blockbench Developer Tools and include the Console error, Blockbench version, operating system, GPU/renderer information, plugin versions, a minimal `.bbmodel`, and a screenshot when reporting the issue.

---

## Project structure

A public source repository should keep the suite understandable and independently releasable:

```text
lightflow-blockbench/
├─ plugins/
│  ├─ light_manager/
│  │  ├─ light_manager.js
│  │  ├─ about.md
│  │  ├─ changelog.json
│  │  └─ icon.svg
│  ├─ shader_architect/
│  │  ├─ shader_architect.js
│  │  ├─ about.md
│  │  ├─ changelog.json
│  │  └─ icon.svg
│  └─ studio_render/
│     ├─ studio_render.js
│     ├─ about.md
│     ├─ changelog.json
│     └─ icon.svg
├─ docs/
│  ├─ screenshots/
│  ├─ workflows/
│  ├─ compatibility.md
│  └─ troubleshooting.md
├─ examples/
│  ├─ basic_lighting.bbmodel
│  ├─ material_instances.bbmodel
│  └─ studio_showcase.bbmodel
├─ README.md
├─ CHANGELOG.md
├─ CONTRIBUTING.md
├─ CODE_OF_CONDUCT.md
└─ LICENSE
```

Keep plugin IDs, JavaScript file names, and release package names consistent:

- `light_manager`
- `shader_architect`
- `studio_render`

---

## Contributing and feedback

Lightflow is being developed in the open to learn what Blockbench artists actually need.

Useful feedback includes:

- A minimal project that reproduces the issue.
- Expected result versus actual result.
- Blockbench version and Lightflow module versions.
- Operating system and GPU renderer shown by Studio Render.
- Console error text or a screenshot of it.
- Screenshots at both viewport size and final Studio Render size for visual bugs.

For feature requests, explain the artistic result you are trying to achieve rather than only the setting you want added. A clear before/after image is especially useful.

---

## Roadmap

This roadmap is directional, not a release promise.

- More artist-friendly preset packs and reusable lighting rigs.
- Better first-run guidance and sample `.bbmodel` scenes.
- More robust quality presets for low-, mid-, and high-end GPUs.
- Refinement of AO, shadows, screen-space effects, bevel behavior, and rim consistency between viewport and final render.
- Expanded documentation, visual examples, and troubleshooting coverage.
- Packaging and validation for a Blockbench Plugin Store submission.

---

## License

A public release should include a clear license before accepting external contributions or redistribution. The recommended default for a broadly reusable Blockbench plugin suite is the **MIT License**. Add the final license text as `LICENSE` at the repository root and, if needed, inside each Plugin Store package.

---

## Credits and trademarks

Lightflow is an independent community project and is not affiliated with Blockbench, Mojang Studios, or Microsoft. Blockbench, Minecraft, and related marks belong to their respective owners.

Built for Blockbench artists by **MidFord327**.
