# Lightflow for Blockbench

> **A production-oriented rendering suite for Blockbench** — animatable lights, advanced shader materials, and studio-quality image exports without leaving the editor.

**Status:** Release Candidate / final compatibility testing  
**Minimum Blockbench version:** `4.9.0`  
**Recommended environment:** Blockbench Desktop with a WebGL-capable dedicated GPU

Lightflow is a modular suite for artists who want more control over how Blockbench scenes look before they are shown, shared, or exported. It is designed around a simple pipeline:

1. **Light Manager** creates and animates the lighting.
2. **Lightflow Environment** creates a controllable Minecraft-inspired sky, sun, moon, and ambient light.
3. **Shader Architect** gives the scene a material and stylized surface response.
4. **Lightflow Atmosphere** adds local fog, God Rays, and procedural cloud volumes.
5. **Studio Render** previews the final post-process stack and captures a polished, high-resolution image.

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
| **Light Manager** | `1.6.3` | Adds production-oriented point, spot, and directional lights with adaptive shadows, gizmos, animation support, and lighting profiles. | None |
| **Lightflow Environment** | `1.0.1` | Adds procedural Vanilla and Vibrant Visuals sky presets, Minecraft time, sun/moon lighting, ambient sky influence, and controlled shadow coverage. | **Light Manager recommended**; integrates with Shader Architect |
| **Shader Architect** | `2.7.1` | Builds and assigns advanced materials with PBR controls, environment lighting, SSR fallback reflections, Vibrant Visuals PBR, pixel-shadow controls, editable GLSL, and material instances. | **Light Manager required** |
| **Lightflow Atmosphere** | `1.0.0` | Adds production-ready local fog, correctly occluded additive light shafts, height fog, and procedural cloud domains with render-element depth occlusion. | **Light Manager recommended**; integrates with Shader Architect and Studio Render |
| **Studio Render** | `1.5.0` | Adds Scene Composer, final-parity realtime Bloom and color grading, plus tiled supersampling, geometry-occluded emissive Bloom, transparency, and 4K/8K-safe exports. | Works alone; integrates with the other Lightflow modules |

### Why Lightflow exists

Blockbench is fast and approachable, but a showcase render often needs more control than a screenshot: lighting that can be placed and animated, materials that can react to that light, clean edge treatment, and a reliable high-resolution export path. Lightflow brings those pieces together inside the Blockbench workflow.

Lightflow is **not** a replacement for an offline ray tracer or a game engine. It is a real-time, artist-oriented rendering toolkit built around Blockbench and WebGL. Results depend on your GPU, model complexity, texture setup, material settings, and the current Blockbench version.

---

## Requirements

- Blockbench **4.9.0 or newer**.
- A WebGL-capable GPU. A dedicated GPU is strongly recommended for high-resolution Studio Render output.
- The five plugin files from the same Lightflow release.
- Save working scenes as **`.bbmodel`** when you need Shader Architect material assignments and material instances to persist.

> **Important:** Shader Architect requires Light Manager. Install and enable Light Manager first.

---

## Installation

### Manual installation from a release

1. Download the five JavaScript files from the latest Lightflow release:
   - `light_manager.js`
   - `lightflow_environment.js`
   - `shader_architect.js`
   - `lightflow_atmosphere.js`
   - `studio_render.js`
2. Open Blockbench.
3. Open the Plugin menu and load each local plugin file, or drag the JavaScript files into Blockbench.
4. Load them in this order:
   1. **Light Manager**
   2. **Lightflow Environment**
   3. **Shader Architect**
   4. **Lightflow Atmosphere**
   5. **Studio Render**
5. Reload Blockbench or reload plugins after an update. During development, Blockbench can reload plugins with `Ctrl/Cmd + J`.

### Recommended release layout

```text
lightflow-blockbench/
├─ plugins/
│  ├─ light_manager/
│  │  └─ light_manager.js
│  ├─ lightflow_environment/
│  │  └─ lightflow_environment.js
│  ├─ shader_architect/
│  │  └─ shader_architect.js
│  ├─ lightflow_atmosphere/
│  │  └─ lightflow_atmosphere.js
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

### 3. Set the environment (optional)

With **Lightflow Environment** enabled:

1. Open **Environment Composer** and choose **Vanilla** or **Vibrant Visuals**.
2. Set Minecraft time from `0` to `23999`, or enable realtime animation.
3. Adjust sun azimuth, shadow coverage, bias, and preview shadow resolution around the subject.
4. Tune sky ambient strength when materials should pick up the blue sky or warm horizon colors.

### 4. Apply a material

With **Shader Architect** enabled:

1. Open **Material Studio**.
2. Choose a built-in material such as **Lightflow**, **Cinematic Craft**, **Lightflow Principled PBR**, or **Vibrant Visuals PBR**.
3. Apply it globally or to selected Cubes, Meshes, and Texture Meshes. Cubes also support per-face overrides.
4. Use exposed controls to tune lighting, ambient contribution, shadows, bevels, outlines, rim light, AO, or reflections as appropriate. Lightflow's **Shadows** toggle switches cast shadows without changing presets.
5. Create a **Material Instance** when different parts of the same model need different values without duplicating the shader code.

### 5. Add atmosphere (optional)

With **Lightflow Atmosphere** enabled:

1. Choose **Edit → Add Volume Domain**.
2. Select the domain in the Outliner and fit it around selected Cubes, Meshes, or Texture Meshes when useful.
3. Choose **Soft Mist**, **God Rays**, **Cloud Volume**, or **Stage Haze** as a starting point.
4. For visible shafts, use a directional or spot light with shadows and enable **Receive Volumetric Shadows** on the domain.
5. Keep viewport quality on **Balanced** while composing; use **High** or **Ultra** only for Studio Render.

### 6. Compose and render the image

With **Studio Render** enabled:

1. Open **Scene Composer** to enable realtime viewport Bloom and tune Bloom, exposure, contrast, saturation, temperature, tint, and vignette.
2. Open **Studio Render** or use **Quick Studio Render**. The final image reuses the same Bloom and color-grade pipeline shown by Scene Composer.
3. Choose **4K UHD** for a first high-quality export.
4. Choose **Transparent** or **Solid Color** background.
5. Use **Studio SSAA – 4x** for clean promotional output. Use lower samples while iterating.
6. Select a full composition or the adjustable render frame.
7. Click **Render** and choose whether to preview, save, copy, or load the image as a texture.

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
- Render-only 8K and 16K shadow maps for professional output, automatically capped to the GPU's supported texture size.
- Resolution-, range-, cone-, clipping-, and bounds-aware automatic bias to reduce shadow acne without detaching shadows from surfaces.
- Lighting profiles and shadow profiles for faster setup.
- Fit selected lights to selected Cubes, Meshes, Texture Meshes, or groups.
- Free movement from the current camera view.
- Animation channels for position, rotation, color, and intensity.

**Good starting setup**

- Use one directional light as the key light.
- Start with **Balanced** shadows before moving to higher resolutions.
- Keep shadow bounds tight around the subject. Large directional bounds reduce useful shadow-map detail.
- Use a low-to-medium preview shadow resolution while you work, then raise only the Studio Shadow Resolution for final output.

### Lightflow Environment

Lightflow Environment is a procedural preview-scene module. It drives a sky dome, Minecraft-style day cycle, square sun and moon, stars, clouds, directional lighting, and the ambient colors consumed by Lightflow materials and SSR.

**Main capabilities**

- Minecraft time from `0` to `23999`, realtime playback, configurable day length, and sun azimuth.
- **Vanilla** and **Vibrant Visuals** presets with tailored day, sunset, night, cloud, sun, moon, and ambient palettes.
- Procedural square sun, moon phases, stars, and block-shaped clouds without bundled game textures.
- Directional sun and moon lights with editable shadow area, near/far range, resolution, bias, normal bias, and pixelated shadow controls.
- Sky, horizon, and ground ambient colors exposed to Shader Architect for material tinting and SSR miss-ray reflections.
- Project persistence and a compact Environment panel for time and preset changes.

The presets are independent procedural approximations tuned to reproduce the visual behavior of the named Minecraft render modes; they do not copy Minecraft source code or bundled textures.

### Shader Architect

Shader Architect is Lightflow's material and shader workspace. It can drive an entire scene with one material or assign individual material instances to Cubes, Meshes, and Texture Meshes. Cubes additionally support individual face assignments.

**Main capabilities**

- Global scene materials and per-element materials across Cubes, Meshes, and Texture Meshes, plus per-face Cube overrides.
- Reusable Material Instances with independent exposed values.
- Editable GLSL vertex and fragment shaders.
- GLSL formatting plus compile/link validation inside Material Studio.
- Import and export of custom `.samat` material files.
- Exposed uniforms for artist-facing controls and advanced technical controls for shader authors.
- Dynamic Light Manager uniforms for light positions, directions, colors, intensities, attenuation, cones, and shadow behavior.
- Procedural environment ambient lighting and world-space SSR fallback reflections when a screen-space ray leaves the viewport or misses visible geometry.
- Built-in surface systems including PBR-style controls, thickness-aware real-time subsurface scattering, stylized lighting, voxel-style AO, shadows, screen-space reflections, bevels, alpha-edge treatment, outlines, and promotional rim lighting.
- Independently switchable PBR layers for clearcoat, anisotropy, sheen, transmission, and iridescence, plus specular and clearcoat tint controls.
- UV-derived tangent frames for proper tangent-space normal maps and genuinely directional anisotropic GGX highlights, even when Blockbench geometry has no exported tangent attribute.
- Native Blockbench `MER Subsurface` support: its alpha channel becomes a per-pixel SSS mask instead of being treated as glass transmission.
- Native Blockbench texture semantics for `emissive`, `additive`, and `layered` render modes, including MER green-channel emission.
- **Cinematic Craft**, the successor to Luma Forge, tuned as a Minecraft-trailer-oriented hero material with alpha-aware rim/outline masking, bevel shaping, tone mapping, and dynamic Lightflow shadows.
- One-click Material Override presets: **Balanced**, **Trailer Hero**, **Soft Daylight**, **Night Drama**, and **Clean Product**.
- Automatic zero-thickness Cube handling: coincident faces render as separate front-facing surfaces, and a fully transparent side inherits the visible side without z-fighting or incorrect shared lighting.
- Alpha-profile-aware cutouts, per-material-slot shadow textures, and stochastic semitransparent shadow density in the raster shadow pipeline.
- A **Vibrant Visuals PBR** preset and a **Pixelated Shadows** toggle with adjustable steps and pixel scale.

**Material-instance workflow**

1. Choose a base material.
2. Select the render elements—or Cube faces—that should differ from the global material.
3. Create a Material Instance, then optionally choose a quick Material Override preset.
4. Change only the exposed values needed for that part: for example rim intensity, bevel width, metallic response, outline strength, or emissive behavior.
5. Save as `.bbmodel` before closing the project.

### Lightflow Atmosphere

Lightflow Atmosphere adds bounded participating media to the Blockbench scene. Each **Volume Domain** is a normal Outliner element with position, rotation, size, visibility, save/undo support, and a wireframe editing gizmo.

**Main capabilities**

- Box and sphere/ellipsoid domains.
- Uniform fog, exponential height fog, and animated procedural cloud density.
- Beer–Lambert transmittance and Henyey–Greenstein anisotropic single scattering.
- Separate **Physical Medium** and **Additive Light Shafts** rendering models, so a shadowed God Ray remains transparent instead of darkening the scene.
- Artist-controlled multiple-scattering fill for softer fog and cloud shadows.
- Direct contribution from up to four Light Manager lights.
- Geometry-occluded volumetric shadows from up to two directional or spot lights.
- Depth-aware stopping at Cubes, Meshes, and Texture Meshes, so light shafts and Bloom do not pass through foreground geometry.
- Helper masking so light icons, locators, grids, selection helpers, and volume gizmos remain clear.
- Separate viewport and Studio Render step counts and internal resolution.
- Tile-stable spatial jitter and frozen cloud time during Studio Render to prevent seams.
- DPI-correct viewport composition, alpha-tested foliage shadows, and camera-facing phase scattering for stable, visible God Rays.
- SSAA-aware raymarch resolution, reusable AO depth, cached static raymarches, cached Atmosphere Bloom masks, and frustum culling for off-screen domains.
- Lightweight alpha-aware depth-only captures when Shader Architect AO depth is unavailable.
- Quick setups for Soft Mist, God Rays, Cloud Volume, Stage Haze, and Cinematic Dust.
- Per-domain scattering, absorption, ambient fill, edge feather, shadow reception, and Bloom contribution.

Live counters are available from the Blockbench developer console through `LightflowAtmosphere.performance()`; they report raymarches, cache hits, depth captures, and cache-hit rate.

The implementation is physically grounded real-time **single scattering**. It is not path-traced multiple scattering, fluid simulation, or Blender Cycles; procedural clouds are shader density fields rather than simulated weather.

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
- Realtime viewport Bloom that uses the same emissive/atmosphere mask, occlusion, blur scales, threshold, radius, and strength as final output.
- **Scene Composer** controls for viewport Bloom, preview refresh rate, exposure, contrast, saturation, temperature, tint, vignette, and environment settings.
- One shared Canvas2D color-grade path for the viewport preview and final render.
- Emissive-only Bloom masking: emissive render-mode alpha, MER maps, dedicated emissive maps, and additive materials glow without blooming ordinary bright surfaces.
- Atmosphere-aware Bloom masking, including per-domain Bloom contribution for bright shafts and cloud highlights.
- Selection highlight suppression during final capture so editing state cannot leak into exported pixels.
- A two-column, sectioned render dialog that collapses responsively on narrow windows.
- A compact default form; tile size, GPU diagnostics, resolution scaling, and technical effect controls stay under **Advanced Controls**.

---

## Shader Architect presets

The current built-in preset library includes:

| Preset | Best use |
| --- | --- |
| **Classic Shader** | Familiar Blockbench-like rendering with simple controls. |
| **Lightflow Principled PBR** | Layered physically based controls for metal/roughness, SSS, clearcoat, sheen, transmission, iridescence, and reflections. |
| **Vibrant Visuals PBR** | A Vibrant Visuals-oriented PBR starting point with environment response, SSR, restrained roughness, and pixel-shadow defaults. |
| **Lightflow** | General-purpose stylized lighting. Use its **Shadows** toggle for shadowed or shadow-free rendering without switching materials. |
| **Pixelated Lightflow** | A deliberately stepped or pixel-oriented shaded response with independently switchable pixelated shadows. |
| **Cinematic Craft** | Minecraft-trailer-oriented hero lighting, promotional edge treatment, bevel shaping, alpha-aware silhouettes, and a polished default grade. Existing `luma_forge` assignments migrate automatically. |
| **Minecraft Promotional Bevel** | A specialized promotional bevel treatment for blocky, illustrated presentation renders. |

Use the preset name as a starting point, not as a guarantee of a specific visual style. A good render comes from the interaction between the preset, texture content, cube scale, lighting, camera angle, and export settings.

### Subsurface scattering workflow

Use **Lightflow Principled PBR** for wax, skin-like stylization, leaves, thin fabric, candles, or translucent organic materials:

1. Enable **Subsurface** and raise **SSS Weight** gradually from `0.15` to `0.5`.
2. Set **SSS Color** to the color that should appear in backlit areas.
3. Use **SSS Radius** to control how far light wraps around the form, and **SSS Thickness** to control how much backlight survives the material.
4. Put a point, spot, or directional light behind or beside the subject to evaluate the transmitted-light lobe.
5. For per-pixel control, use a Blockbench **MER Subsurface** texture. Lightflow reads its alpha channel automatically while **Native PBR SSS** is enabled.
6. Open advanced material controls to tune **SSS Direction**, **SSS Focus**, **SSS Ambient**, and **SSS Shadows**.

Lightflow's SSS is a stable real-time approximation designed for Blockbench's WebGL pipeline. It models light wrapping, forward/back scattering, thickness absorption, shadow response, and texture masks, but it is not Blender Cycles' path-traced random-walk SSS.

---

## Recommended workflows

### Clean Minecraft-style showcase

1. Use **Cinematic Craft** with the **Trailer Hero** override preset, or start from **Lightflow** for a quieter result.
2. Add one directional key light and one weak colored fill light.
3. Enable a restrained bevel or alpha bevel only where it improves the silhouette.
4. Add a subtle rim light to separate the model from a transparent or pale background.
5. Render at 4K with 2×–4× SSAA.

### Sharp pixel-art render

1. Start with **Pixelated Lightflow**.
2. Enable **Pixelated Shadows**, then tune shadow steps and pixel scale for the model scale and camera distance.
3. Keep bevel, blur-like effects, and high softness values subtle.
4. Test native samples first; increase SSAA only when it improves the outer contour without softening the intended pixel language.
5. Use a transparent background for later compositing.

### Vibrant Visuals scene

1. Choose the **Vibrant Visuals** Environment preset and set the Minecraft time.
2. Apply **Vibrant Visuals PBR** to the subject.
3. Keep environment ambient and SSR enabled so the sky and horizon influence rough materials and reflections.
4. Enable pixelated shadows where the stylized shadow edge is desired; disable it for a continuous PCF edge without changing material.
5. Finish Bloom and grading in Scene Composer, then use the same settings in Studio Render.

### Product-card or thumbnail render

1. Use **Cinematic Craft** or **Lightflow Principled PBR**.
2. Keep the background transparent or use a single neutral color.
3. Frame the subject using Studio Render's adjustable capture frame.
4. Use 4× SSAA for a final export after checking the composition with 1× or 2×.

### Animated lighting preview

1. Create lights in Light Manager.
2. Open the Animate workspace.
3. Animate position, rotation, color, and/or intensity.
4. Use Shader Architect materials that react to Light Manager lights.
5. Preview the animation before capture; final image capture is currently optimized around still render output.

### God Rays

1. Add a **God Rays** Volume Domain and place the camera inside or in front of it.
2. Add a directional or spot light and enable its cast shadows.
3. Place render geometry between the light and the visible part of the volume so its silhouette shapes the shafts.
4. Raise **Anisotropy** toward `0.6–0.8` for stronger forward scattering when looking toward the light.
5. Tune density before scattering strength; excessive density quickly hides the model.
6. Enable Bloom in Studio Render and adjust the domain's **Bloom Contribution** only after the shaft exposure looks correct.

---

## Saving and compatibility

### Save format

Save active Lightflow projects as **`.bbmodel`**. Shader Architect material assignments, material instances, Lightflow Environment settings, and Lightflow Atmosphere Volume Domains use custom project/outliner properties that may not survive every export format.

### Compatibility expectations

- Lightflow targets Blockbench `4.9.0+`.
- Shader Architect, Atmosphere depth occlusion, selection fitting, and Studio Render highlight cleanup support `Cube`, `Mesh`, and `TextureMesh` elements.
- The old `luma_forge` material ID remains readable and resolves to **Cinematic Craft**, so existing `.bbmodel` and `.samat` content does not need a manual migration.
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
- Atmosphere viewport quality: Balanced at 50–70% internal resolution

### Final promotional preset

- Resolution: 3840×2160 or 4096×4096
- SSAA: 4×
- Tile size: Auto or 2048 px
- Transparent background when compositing is planned
- Studio shadow resolution: 2048 or 4096 only when the model and camera need it
- Atmosphere render quality: High at 100%; Ultra only for difficult close-up shafts or dense clouds. Atmosphere automatically compensates for Studio SSAA so 4×/8× does not multiply the raymarch resolution again.

### Important tradeoffs

- Higher supersampling improves edge quality but raises render time and memory use.
- Larger shadow maps can improve detail but will not fix poor shadow bounds, unsuitable near/far planes, or a bad camera/light relationship.
- Many lights, high-resolution shadows, screen-space effects, and 8K output can become expensive quickly.
- Volumetric cost grows with ray steps, internal resolution, visible domains, active lights, and shadow-map samples. Up to four visible domains are rendered at once; off-screen domains are culled and unchanged frames reuse their previous raymarch by default.
- Semitransparent textures use stochastic alpha coverage in ordinary WebGL shadow maps. This produces proportional shadow density without requiring ray tracing; colored transmissive shadows are outside the depth-only shadow-map model.
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

### A flat Cube flickers or lights incorrectly

- Confirm the render element is using a Lightflow material after updating Shader Architect to `2.5.1` or newer.
- Keep the intended textured face and fully transparent opposite face; Lightflow detects the collapsed axis and resolves the two-sided surface automatically.
- If both coincident faces contain visible pixels, each remains independent and is lit from its own direction.

### A transparent material casts the wrong shadow

- Cutout alpha is respected by the custom depth and distance shadow materials.
- Semitransparent alpha casts a proportional dithered shadow. Increase Studio Render samples for a cleaner final integration.
- WebGL shadow maps store depth, not transmitted RGB color, so colored glass shadows require a future transmittance-buffer backend; see `docs/RENDER_BACKENDS.md`.

### FPS drops in scenes with many Cubes

- Shader Architect `2.6.0+` automatically collapses equivalent Cube face slots and pools identical materials across elements. Different face textures, transparency modes, or Material Overrides remain independent.
- Reload Shader Architect after updating so existing scene materials are rebuilt through the optimized path.
- In Blockbench Developer Tools, run `LightflowPerformance()` to inspect `collapsedCubes`, `savedMaterialBatches`, `estimatedSceneDrawsPerFrame`, and the renderer's latest draw-call count.
- Compare the same camera and effect settings. AO intentionally adds scene passes, but its receiver depth now uses a lightweight cached shader rather than evaluating the complete surface lighting again.

### Gizmos appear where they should not

Studio Render hides gizmos by default. Verify that **Show Gizmos** is disabled in Studio Render settings, then render again.

### Bloom differs between viewport and final render

- Open **Scene Composer** and ensure **Realtime Viewport Bloom** is enabled.
- Use the same Bloom threshold, strength, and radius that Studio Render will use; both paths share the same mask and compositing implementation.
- Realtime Bloom is throttled by **Preview FPS** to keep editing responsive. Raise it only when the GPU has enough headroom.
- Transparent final output can composite differently over an external background; compare against the intended destination background when judging edge glow.

### The environment does not affect a material or reflection

- Confirm Lightflow Environment and Shader Architect `2.7.0+` are both enabled.
- Use **Lightflow Principled PBR**, **Vibrant Visuals PBR**, or another environment-aware Lightflow preset.
- Raise environment ambient strength for diffuse tinting and enable SSR for reflections.
- SSR reflects visible screen geometry first and uses the procedural environment only for miss rays; fully off-screen objects are not reconstructed.

### Volumetric shafts are missing

- Confirm the Volume Domain is enabled and surrounds the visible ray path.
- Use a directional or spot light; point-light volumetric illumination works, but point-light volumetric shadow maps are not part of this first release.
- Enable cast shadows on the light and **Receive Volumetric Shadows** on the domain.
- Increase density gradually and verify anisotropy is not aimed away from the camera.
- For leaf cards or other cutout textures, keep transparent pixels at alpha 0 so the light shadow map can filter the shafts through the silhouette.

### Fog is noisy, banded, or too slow

- Increase viewport steps before increasing viewport resolution.
- Use **High** at 100% for normal final renders and reserve **Ultra** for difficult scenes.
- Disable temporal jitter for a stable viewport pattern; Studio Render freezes time across all tiles automatically.
- Reduce the number of overlapping domains and active shadowed lights.

### A plugin error appears

Open Blockbench Developer Tools and include the Console error, Blockbench version, operating system, GPU/renderer information, plugin versions, a minimal `.bbmodel`, and a screenshot when reporting the issue.

---

## Project structure

A release-candidate checkout keeps each independently loadable plugin at the repository root, with validation and renderer notes beside it:

```text
lightflow-blockbench/
├─ light_manager.js
├─ lightflow_environment.js
├─ shader_architect.js
├─ lightflow_atmosphere.js
├─ studio_render.js
├─ docs/
│  └─ RENDER_BACKENDS.md
├─ tests/
│  └─ release_candidate.test.js
├─ package.json
├─ README.md
└─ CHANGELOG.md
```

Keep plugin IDs, JavaScript file names, and release package names consistent:

- `light_manager`
- `lightflow_environment`
- `shader_architect`
- `lightflow_atmosphere`
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
- Refinement of AO, screen-space reflection history, bevel behavior, and rim consistency between viewport and final render.
- Optional temporal stabilization and GPU post-processing for Scene Composer on capable hardware.
- A transmittance-buffer experiment for colored raster shadows, gated by GPU capabilities.
- Evaluation of a future native/WebGPU renderer only when Blockbench and the browser graphics stack expose a stable ray-tracing path; the current WebGL backend does not advertise hardware RTX.
- Higher-order multiple scattering, point-light volumetric shadows, artist-authored 3D density textures, and improved temporal accumulation for Atmosphere.
- Expanded documentation, visual examples, and troubleshooting coverage.
- Packaging and validation for a Blockbench Plugin Store submission.

---

## License

A public release should include a clear license before accepting external contributions or redistribution. The recommended default for a broadly reusable Blockbench plugin suite is the **MIT License**. Add the final license text as `LICENSE` at the repository root and, if needed, inside each Plugin Store package.

---

## Credits and trademarks

Lightflow is an independent community project and is not affiliated with Blockbench, Mojang Studios, or Microsoft. Blockbench, Minecraft, and related marks belong to their respective owners.

Built for Blockbench artists by **MidFord327**.
