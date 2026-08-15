# Lightflow v0.1.0 — First Stable Development Preview

> **The first frozen Lightflow suite snapshot for Blockbench.**
>
> This release preserves the first development build I consider stable enough for real artist use and testing before the next generation of Lightflow changes begins.

Lightflow started as an attempt to close the gap between creating a model in Blockbench and actually presenting it as a finished image. This snapshot is the first point where the complete workflow works together as a suite: lighting, Minecraft-inspired environment rendering, programmable materials, local volumetrics, realtime composition, and high-resolution still rendering without leaving Blockbench.

This is a **stable development preview**, not the final Marketplace release. It is intentionally frozen so artists can keep using this known build while newer Lightflow versions evolve independently.

## Release identity

- **Suite version:** `v0.1.0`
- **Release name:** `Lightflow v0.1.0 — First Stable Development Preview`
- **Recommended GitHub release type:** Pre-release
- **Frozen code source:** `ded65134e702f235506c8e1c751c0a95847263fa`
- **Frozen branch:** `release/v0.1.0`
- **Minimum Blockbench version:** `4.9.0`
- **Plugin variants:** Desktop + Web where Blockbench permits it; Desktop is strongly recommended for production rendering.

## Included module versions

| Module | Version | Role |
| --- | ---: | --- |
| **Light Manager** | **1.7.0** | Scene lights, gizmos, animation, shadow workflow, shared Lightflow UI/runtime foundation |
| **Shader Architect** | **2.9.1** | Lightflow materials, PBR/stylized shading, overrides, GLSL, AO/SSR and material instances |
| **Studio Render** | **1.9.0** | Scene Composer, camera/framing workflow and tiled supersampled final still rendering |
| **Lightflow Atmosphere** | **1.2.0** | Local fog, height fog, clouds, dust and light-shaft Volume Domains |
| **Lightflow Environment** | **1.5.1** | Minecraft time/sky/celestials/clouds, ambient response, reflections and sun shadows |

All five files in this snapshot are matched and should be installed together.

---

# Installation — pinned v0.1.0 snapshot

In Blockbench open **File → Plugins → Load Plugin from URL** and install the files **one at a time, in this order**.

### 1. Light Manager

```text
https://raw.githubusercontent.com/MidFord/lightflow-blockbench/refs/heads/release/v0.1.0/light_manager.js
```

### 2. Shader Architect

```text
https://raw.githubusercontent.com/MidFord/lightflow-blockbench/refs/heads/release/v0.1.0/shader_architect.js
```

### 3. Studio Render

```text
https://raw.githubusercontent.com/MidFord/lightflow-blockbench/refs/heads/release/v0.1.0/studio_render.js
```

### 4. Lightflow Atmosphere

```text
https://raw.githubusercontent.com/MidFord/lightflow-blockbench/refs/heads/release/v0.1.0/lightflow_atmosphere.js
```

### 5. Lightflow Environment

```text
https://raw.githubusercontent.com/MidFord/lightflow-blockbench/refs/heads/release/v0.1.0/lightflow_environment.js
```

Restart Blockbench or reload the plugins after installation.

> **Light Manager must be installed first.** Shader Architect, Atmosphere, and Environment depend on its Lightflow runtime/UI foundation. Studio Render can operate more independently, but is designed to consume data from the rest of the suite.

You can also download the source snapshot and use **File → Plugins → Load Plugin from File** with the same five `.js` files and the same installation order.

---

# What this release represents

This release is the first complete Lightflow workflow that can be described as:

```text
MODEL → LIGHT → ENVIRONMENT → MATERIAL → ATMOSPHERE → COMPOSE → RENDER
```

It includes a dedicated Lightflow render/view workflow, real scene lights, animated light properties, material assignment at several scopes, Minecraft-inspired skies, local volumetrics, realtime post-processing, camera presets, adjustable framing, transparent rendering, tiled high-resolution output, and extensive project persistence.

The suite is built on Blockbench's Three.js/WebGL renderer. It is an optimized raster rendering workflow rather than a ray tracer.

---

# Light Manager 1.7.0

Light Manager is the foundation of the suite and introduces Lightflow's custom `Light` outliner element, renderer synchronization, shadow management, shared UI components, and animation support.

## Light types

- **Point Light** — omnidirectional local illumination.
- **Spot Light** — aimable cone lighting with range, cone angle and penumbra.
- **Directional Light** — sun-style scene lighting with configurable orthographic shadow bounds.

Lights are real editable Blockbench outliner elements with position, rotation, visibility, locking, selection and undo integration.

## Artist controls

- Light color.
- Color temperature from warm to cool lighting.
- Intensity / brightness.
- Point/spot range, including unlimited range with `0`.
- Spot cone angle.
- Spot penumbra / soft edge.
- Shadow enable/disable.
- Shadow near/far clipping.
- Directional shadow bounds / sun shadow area.
- Shadow resolution.
- Separate **Studio Render shadow resolution**.
- Shadow softness.
- Depth bias.
- Normal bias with automatic calibration based on the current light/shadow configuration.

## Built-in light profiles

- **Point Fill Light**
- **Spot Key Light**
- **Directional Sun Light**
- **Minecraft Optimized (Directional)**

These profiles provide useful starting configurations without removing access to the technical controls underneath them.

## Built-in shadow profiles

- **Off**
- **Preview — Fast**
- **Balanced**
- **Crisp — Heavier**
- **Minecraft Optimized**

## Preview vs final shadow quality

Viewport shadow-map resolutions support:

`256`, `512`, `1024`, `2048`, `4096`

Studio Render can request:

`256`, `512`, `1024`, `2048`, `4096`, `8192`, `16384`

The final requested resolution is clamped to the GPU/WebGL maximum texture size when necessary. This allows a light to remain inexpensive while editing and use a much larger shadow map only for the final Studio Render capture.

## Viewport editing and actions

- **Add Point Light**
- **Add Spot Light**
- **Add Directional Light**
- **Edit Light Properties…**
- **Fit Lights to Selection…**
- **Light Edit Gizmos** tool
- **Free Move From View**
- **Show / Hide Light Area Gizmos**

The Light Edit Gizmos expose direct viewport handles for aim/direction, point/spot range, spot cone angle, penumbra, shadow clipping and directional shadow bounds.

**Fit Lights to Selection** can fit selected lights to selected objects/groups, add an extra scene-space margin, add a spot-angle margin, and optionally aim spot/directional lights toward the target center.

**Free Move From View** moves selected elements on a camera-facing plane and respects Blockbench snapping modifiers and axis constraints.

## Animation

Light Manager integrates custom lights into Blockbench's animation timeline with channels for:

- **Position**
- **Rotation**
- **Color**
- **Intensity**

The animated values are kept separate from the authored base values so playback can update the rendered light state without destructively rewriting the source properties.

## Color workflow

Lightflow ships a reusable advanced color picker/UI layer from Light Manager. It supports artist-facing color editing plus advanced representations including **HEX, RGB, HSL and HSV**, and is reused by other Lightflow panels.

## Performance and stability work included in this snapshot

- Partial light updates instead of rescanning/recreating the complete lighting system for ordinary property edits.
- Explicit shadow invalidation rather than permanent shadow-map refreshes.
- Reuse of existing Three.js light/shadow topology where possible.
- Hot-path scratch-object reuse.
- Stable shadow slots to reduce shader topology churn.
- Separate renderer preparation for normal preview and Studio Render.
- Cleanup/disposal of Lightflow-owned renderer resources on unload.
- Late project hydration for custom `light` elements.
- Project-generation guards so queued work from one project cannot leak into another tab/project.

---

# Lightflow Environment 1.5.1

Environment is a Minecraft-inspired world/ambient system. It is not just a decorative background: compatible Shader Architect materials can consume its ambient light, directional light, reflection response and shadow state.

## Environment presets

- **Minecraft Vanilla**
- **Minecraft Vibrant Visuals**

Both presets provide coordinated sky, horizon, sunrise, night, ground, sun, moon, cloud and ambient palettes.

## Time and day cycle

- Minecraft-style world time from **0 to 23999**.
- Realtime animated day/night playback.
- Configurable day length.
- Sun azimuth control.
- Stable sun/moon directional lighting as time changes.

## Sky and palette controls

- Day zenith color.
- Day horizon color.
- Sunrise zenith and horizon colors.
- Night zenith and horizon colors.
- Ground color.
- Sun color.
- Moon color.
- Cloud color.
- Sky intensity.
- Sky gradient response.
- Environment / ambient strength.
- Preset palette or fully custom palette mode.

## Sun and moon

- Embedded Vanilla-style sun texture.
- Embedded Vibrant Visuals sun texture.
- Embedded moon-phase atlas shared by the stock environment presets.
- 4×2 moon atlas support with eight phases.
- Custom project-texture override support for the sun and moon.
- Celestial size.
- Sun horizon scaling.
- Sun gaze scaling.
- Sun glare.
- Sunset directional glow.
- Moon intensity and phase controls.

## Stars

- Deterministic Vanilla-style star geometry.
- Adjustable star density.
- Adjustable star brightness.
- Stable geometry generation rather than visibly changing random stars every refresh.

## Clouds

- Embedded Vanilla cloud texture.
- Voxel-style/fancy cloud rendering path.
- Project texture overrides.
- Coverage.
- Opacity.
- Motion speed.
- Scale.
- Direction.
- Contrast.
- Brightness.
- Height.
- Thickness.
- Extrusion.

## Environment shadows

- Sun shadow enable/disable.
- Shadow area.
- Near/far range.
- Resolution.
- Bias and normal bias.
- Automatic shadow-region fitting.
- Visible shadow-region gizmo.
- **Fit Shadow Region to Selection / Scene** — uses selected geometry when available, otherwise the complete renderable scene.
- Optional pixelated-shadow controls used by compatible Lightflow materials.

## Environment UI/actions

- **Environment Composer…**
- Attached **ENVIRONMENT** panel in the Lightflow workflow.
- Quick preset switching.
- Day-cycle playback toggle.
- Time control.
- Environment/sky strength controls.
- Cloud mode controls.
- Shadow-region fitting.
- Advanced Environment Composer for the full setting set.

Environment shadow-region gizmos participate in Lightflow's global helper/gizmo visibility state, together with Light Manager and Atmosphere helpers.

---

# Shader Architect 2.9.1

Shader Architect is Lightflow's material and programmable surface system. It adds a dedicated Lightflow view mode, global material selection, material overrides, reusable material instances, programmable GLSL materials and several rendering systems that coordinate with Light Manager, Environment and Studio Render.

## Public global material presets

The enumerable global material selector in this release contains:

- **Lightflow**
- **Lightflow (PBR)**
- **Vibrant Visuals (PBR)**
- **Rendercraft**

### Compatibility detail that is easy to miss

The current source also preserves older/internal IDs so existing projects remain readable:

- `shaded_lightflow` is retained as a hidden compatibility alias for the public **Lightflow** preset.
- `luma_forge` is retained as a hidden compatibility alias for **Rendercraft** after the public rename.

The source also retains translation/prototype paths for Classic/legacy/pixelated/experimental material variants, but the normal global dropdown intentionally exposes the four public presets above.

## Lightflow view mode

Shader Architect injects a real **Lightflow** option into Blockbench's view-mode control. Applying a Lightflow material can activate this view mode automatically. Projects containing saved material overrides are also restored into the Lightflow rendering path during project hydration.

## Material assignment scopes

- Global material.
- Per-element material for **Cubes**.
- Per-element material for **Meshes**.
- Per-element material for **Texture Meshes**.
- Per-face Cube material override.
- Native Mesh face/material-slot compatibility.
- Group context assignment that recursively applies to supported render elements.

Every supported render element also has a Lightflow **Cast Shadows** property.

## Material Instances / Overrides

Shader Architect can create reusable project material instances based on a built-in or custom base material. Instances expose selected uniforms without duplicating the entire underlying shader.

Actions/workflow include:

- **Create Material Instance**
- **Delete Material Instance**
- Assign instance to elements/faces.
- Clear an override and return to the global material.
- Rename/configure an instance.
- Change base material.
- Edit exposed uniforms in realtime.
- Reset individual values or an entire override.
- Import/export reusable override presets.

### Shareable override format

Material Instances can be exported/imported as:

```text
.sami
```

The format identifies itself as `shader_architect_material_instance` and the current file schema version is `1.0`.

## Material Override quick presets

Depending on material compatibility, the override UI contains tuned starting points including:

- **Balanced**
- **Pixel Shadows**
- **Trailer Hero**
- **Soft Daylight**
- **Night Drama**
- **Clean Product**

These modify an existing override rather than replacing the instance itself.

## Auto Tile

Geometry-driven **Auto Tile** can be controlled at material, element and face scope. The current build also preserves Auto Tile state through native Blockbench geometry operations such as:

- **Convert to Mesh**
- **Merge Meshes**

That preservation logic includes element defaults and per-face overrides, which is easy to miss because it operates behind Blockbench's normal transform actions rather than through a separate Lightflow button.

## Material systems and effects

Depending on the selected preset/material, Shader Architect exposes systems for:

- Direct Light Manager lighting and shadows.
- Environment ambient response.
- Environment/fallback reflections.
- Metallic/roughness PBR.
- Ambient Occlusion.
- Screen-Space Reflections (SSR).
- Subsurface-style scattering controls (SSS).
- Bevel shading.
- Rim lighting.
- Promotional/cinematic silhouette lighting.
- Outlines.
- Transmission.
- Clearcoat.
- Sheen.
- Anisotropy.
- Iridescence.
- Pixelated shadows.
- Emissive workflows.
- Additive textures.
- Layered textures.
- Native MER-style texture semantics where supported.

Material controls are organized into groups such as **Core, Texture, Surface, Lighting, AO, Shadows, Reflections, Bevel, Outline, Rim,** and **Technical**.

## Ambient Occlusion

Shader Architect includes a project-aware AO manager with separate renderer integration rather than baking AO into source textures. Current default configuration includes strength/radius/bias/power controls, render scale and a multi-sample AO path.

## Screen-Space Reflections

SSR is integrated per preview and prepared specially for Studio Render so reflection sampling does not create framebuffer feedback loops. Reflective-material caches are invalidated only when necessary rather than rebuilt blindly every frame.

## Material Studio / custom GLSL

**Material Studio** provides:

- Material library.
- Custom shader creation.
- Duplicate/delete custom materials.
- Editable vertex and fragment GLSL.
- GLSL formatting.
- Shader preprocessing.
- Compile/link validation with mapped error reporting.
- Custom uniforms.
- Native Lightflow uniform insertion.
- Expose-to-UI metadata.
- Advanced/technical property flags.
- Slider ranges and reset values.
- Repeat/tiling metadata.
- Per-uniform descriptions and labels.
- Per-uniform custom translations.
- Live application to the current scene.

### Shareable full-material format

Custom Shader Architect materials can be imported/exported as:

```text
.samat
```

Imported materials receive a new internal ID to avoid collisions with existing project materials.

## Internationalized custom materials

Beyond the built-in English/Spanish suite translation, Shader Architect's custom uniform metadata can store label translations by language code. This means a custom `.samat` can carry translated artist-facing uniform labels instead of being permanently tied to one language.

## Developer/performance hooks hidden in the normal UI

The stable build publishes several Lightflow runtime objects for cross-module integration and debugging, including:

- `ShaderEngine`
- `MaterialManager`
- `ScreenSpaceReflectionManager`
- `LightflowAmbientOcclusion`
- `MinecraftPromotionalSilhouetteManager`
- `FancyShaderMaterial`
- `FancyShaderMaterialInstance`
- `LightflowPerformance()`

`LightflowPerformance()` returns Shader Architect performance counters and is intended for diagnostics rather than normal artist workflow.

---

# Lightflow Atmosphere 1.2.0

Atmosphere adds local volumetric **Volume Domain** elements to the Blockbench outliner. Domains are deliberately local rather than forcing one full-screen global fog model, allowing expensive atmospheric effects to be placed only where a shot needs them.

## Domain shapes

- **Box**
- **Sphere**

Each domain has its own transform, size, visibility and selectable viewport helper.

## Density modes

- **Uniform Fog**
- **Height Fog**
- **Procedural Clouds**

## Composition modes

- **Physical Medium**
- **Light Shafts**

This allows the same domain system to represent conventional participating media or more stylized additive God-ray/shaft effects.

## Built-in atmosphere presets

- **Soft Mist**
- **God Rays**
- **Clouds**
- **Stage Haze**
- **Cinematic Dust**

## Volume controls

- Enabled state.
- Shape and size.
- Density mode.
- Composite mode.
- Density.
- Scattering color.
- Scattering strength.
- Absorption color.
- Absorption strength.
- Anisotropy.
- Ambient contribution.
- Shadow reception.
- Shadow fill.
- Bloom contribution.
- Edge feather.
- Height falloff and height offset.
- Cloud noise scale.
- Cloud detail.
- Coverage.
- Erosion.
- Wind direction.
- Wind speed.

## Actions

- **Add Volume Domain**
- **Edit Volume Domain**
- **Fit Volume Domain to Selection**
- **Atmosphere Quality / Settings**

The attached Atmosphere panel exposes the most important density, compositing, scattering, anisotropy and shadow controls without requiring the full advanced dialog for every edit.

## Preview/render quality separation

Quality profiles:

- **Draft**
- **Balanced**
- **High**
- **Ultra**

Current ray-march step budgets are intentionally different for interactive preview and final rendering:

| Quality | Preview steps | Render steps |
| --- | ---: | ---: |
| Draft | 16 | 28 |
| Balanced | 24 | 44 |
| High | 36 | 64 |
| Ultra | 48 | 96 |

Preview resolution scale is independently configurable from final render scale.

## Performance controls

- Temporal jitter.
- Helper masking.
- Static-scene cache.
- Frustum culling.
- Separate preview/render scale.
- Separate preview/render quality.
- Scene-depth reuse when only optical/lighting parameters change.

### Current internal volumetric budget

The stable shader path is deliberately bounded to keep uniform/shadow cost predictable: it supports up to **4 active Volume Domains**, **4 relevant lights**, and **2 volumetric shadow maps** in the active composition path.

Volume helper geometry is explicitly excluded from normal Light Manager shadow casting/receiving so the editor visualization cannot accidentally become part of the rendered lighting solution.

---

# Studio Render 1.9.0

Studio Render turns the interactive Lightflow scene into a deliberate still-image output workflow. It handles realtime composition, camera presets, framing, supersampling, tiling, transparency and final image destinations.

## Main actions

- **Studio Render…**
- **Quick Studio Render**
- **Toggle Render Frame**
- **Reset Render Frame**
- **Project Camera Presets**
- **Scene Composer…**

Scene Composer is also available as an attached **COMPOSER** panel in Lightflow Render mode.

## Resolution presets

- **HD** — `1920 × 1080`
- **4K UHD** — `3840 × 2160`
- **4K DCI** — `4096 × 2160`
- **Square 4K** — `4096 × 4096`
- **8K UHD** — `7680 × 4320`
- **Custom**

The stable renderer supports a maximum requested dimension of **16384 px** and enforces a safe total-canvas pixel budget before attempting final composition.

Advanced output scale can further scale the selected output while remaining subject to those safety limits.

## Supersampling / antialiasing

Available SSAA levels:

- **Off / native pixels — 1×**
- **Clean SSAA — 2×**
- **Fine SSAA — 3×**
- **Studio SSAA — 4×**
- **Cinema SSAA — 6×**
- **Extreme SSAA — 8×**

## Tiled rendering

Large images are rendered in tiles rather than requiring one enormous WebGL target. Available tile modes include:

- Auto
- 1024 px
- 1536 px
- 2048 px
- 3072 px

The default internal tile target is 2048 px.

Studio Render plans the tile projection, renders each section through Blockbench's offscreen preview, applies compatible Lightflow preparation/effects, composites the result, and downsamples the supersampled image into the final output.

## Render frame

- Full Composition or **Render Frame** capture.
- Adjustable frame handles directly over the viewport.
- Match output ratio to the frame.
- Reset frame.
- Optional tile-grid visualization.
- Frame state stored with project camera-preset data when the project format supports it.

## Background and scene capture

- Transparent background.
- Solid-color background.
- Optional shading.
- Optional gizmo inclusion.

The Bloom path in this stable build preserves destination alpha, allowing transparent product renders without turning transparent pixels opaque simply because Bloom is active.

## After-render destinations

- **Open Preview**
- **Save PNG**
- **Copy PNG** to clipboard
- **Load as Texture** in Blockbench

## Scene Composer

Realtime Scene Composer coordinates viewport post-processing and final Studio Render settings.

### Bloom

- Enable/disable Bloom.
- Threshold.
- Strength.
- Radius.
- Bright-surface/HDR Bloom contribution.
- Emissive-texture Bloom contribution.
- Geometry occlusion so Bloom can be blocked correctly behind objects.
- Realtime viewport Bloom toggle.
- Optional viewport Bloom FPS limit.

Viewport Bloom quality profiles:

- **Adaptive**
- **Performance**
- **Balanced**
- **High**

The Adaptive path changes its internal scale within defined limits instead of rendering the effect at full viewport resolution at all times.

### Color grading

- Exposure.
- Contrast.
- Saturation.
- Temperature.
- Tint.
- Vignette.

The same look is intended to remain coherent between realtime composition and final tiled output.

## Project Camera Presets

Studio Render can save named project camera presets with more than just a position.

A preset can preserve:

- Perspective or orthographic projection.
- Camera position.
- Quaternion/orientation.
- Up axis.
- Focal target.
- Controls state.
- Near and far clipping.
- Reference aspect ratio.
- Field of view.
- Zoom.
- Film gauge.
- Horizontal lens/film offset.
- Projection shifts.
- Focus value.
- Orthographic world height.
- Camera layer mask.
- Render frame.
- Resolution preset and custom resolution.
- Output scale.
- Full/frame capture mode.
- Frame-ratio matching.

Preset workflow supports **create, apply, update from current view, edit/rename, manage and delete**.

Manual camera navigation intentionally releases the currently applied preset state rather than pretending the modified camera still exactly matches the saved preset.

Camera presets are persisted in `.bbmodel` project data. In formats that cannot safely carry the custom project property, Studio Render warns that the preset is temporary.

## GPU-aware rendering

Studio Render can inspect the active WebGL renderer and report whether it appears to be using a dedicated GPU, integrated GPU, software renderer or an unknown renderer. Because Blockbench chooses the WebGL GPU before plugins run, Lightflow provides guidance rather than pretending it can switch GPUs after initialization.

## Realtime compositor performance work

- GPU emissive mask rather than CPU readback.
- Multilevel Bloom pyramid.
- Direct framebuffer composition.
- Target-local physical viewport/scissor handling, including Windows display-scaling fixes.
- Internal-resolution quality profiles.
- Adaptive resolution hysteresis.
- Optional FPS caps.
- Active-preview-only composition.
- Coalesced Scene Composer refreshes.
- Cleanup of stale work when projects close or tabs switch.

---

# Languages and localization

The built-in Lightflow UI in this snapshot includes:

- **English (`en`)**
- **Spanish (`es`)**

All five modules register English and Spanish UI strings for their main artist-facing workflows.

Shader Architect additionally supports **custom per-uniform translations** in material metadata, so custom materials can provide labels for other language codes even though the suite itself currently ships with English and Spanish as its built-in translations.

---

# Project persistence and cross-module behavior

A large part of this stable milestone is not a visible shader effect: it is the work required for five independently loadable plugins to behave like one project-aware suite.

## `.bbmodel` persistence

Use `.bbmodel` for working files that need Lightflow state to persist reliably. Depending on module, saved project data includes:

- Light elements and their authored properties.
- Light animation data.
- Environment settings.
- Volume Domains.
- Global/element/face material assignments.
- Material Instances.
- Shader Architect AO settings.
- Auto Tile state and overrides.
- Studio Render camera presets.
- Studio Render frame state.

## Late hydration

The stable lifecycle can restore Lightflow data even when a module becomes ready after the project itself has already been parsed. This covers lights, Volume Domains, Environment state, material assignments, face assignments and Material Instances.

## Project/tab isolation

Queued scene, material, uniform, environment, atmosphere and compositor work is generation-guarded so stale work from a closed project or another project tab is discarded instead of mutating the newly active project.

## Native Blockbench semantics retained

The stable path contains compatibility work for:

- Meshes.
- Texture Meshes.
- Zero-thickness cubes.
- Transparent texture pixels.
- Emissive textures.
- Additive textures.
- Layered textures.
- Native material/face behavior where applicable.

---

# Complete milestone changelog

The list below preserves the major development milestones that led to this first frozen suite release.

## Initial environment, material and composer milestones

- Added procedural Minecraft-time Environment rendering.
- Added Minecraft Vanilla and Vibrant Visuals Environment presets.
- Added sun/moon lighting, stars, clouds, ambient palettes and Environment project persistence.
- Added Environment ambient uniforms and procedural fallback reflections to Shader Architect.
- Added Vibrant Visuals PBR.
- Added configurable pixelated shadows.
- Added Scene Composer with realtime Bloom and shared color grading for viewport/final output.
- Added the first stable Atmosphere implementation with local fog, additive shafts, procedural clouds, depth occlusion, caching, culling and quality profiles.

## RC 2 — shader hotfixes

- Fixed Environment shader-source assembly.
- Added punctual-light compatibility for custom Three.js shader chunks.
- Added missing pixelated-shadow uniforms.
- Prevented SSR framebuffer/texture feedback loops.
- Removed unsafe global mutation of Three.js shader chunks.

## RC 3 — viewport and environment workflow

- Moved Scene Composer and Environment into attached/resizable Lightflow Render panels.
- Added reduced-resolution realtime Bloom.
- Added DPI-aware quality profiles.
- Added helper exclusion and AO-compatible composition.
- Expanded Environment with editable sky colors, stars, clouds and project texture selection.
- Stabilized animated sun-shadow behavior.

## RC 4 — native GPU viewport composition

- Replaced realtime CPU readback/Canvas2D Bloom overlay with GPU emissive-mask composition.
- Added a multilevel Bloom pyramid and direct framebuffer composition.
- Fixed the 1.25× Bloom scale/offset issue on Windows display scaling with target-local physical viewport handling.
- Added Adaptive Bloom quality.
- Added internal-resolution hysteresis.
- Added synchronized uncapped updates and optional FPS caps.
- Updated Atmosphere to preserve target-local viewport/scissor state when rendering into offscreen targets.
- Excluded Volume Domain helper proxies from Light Manager shadow casting/receiving.

## RC 5 — interaction performance and transparency

- Preserved destination alpha during additive viewport Bloom.
- Removed full light/shadow preparation from Shader Architect uniform-only updates.
- Stopped treating ordinary Cube transforms as full lighting changes.
- Geometry, face and UV events rebuild only affected render elements where possible.
- Reused/coalesced light arrays and shadow state.
- Reduced unnecessary active-preview rendering.
- Removed full-scene shadow-mesh traversal from normal Light Manager light transforms.
- Reused scratch objects on hot paths.
- Split Atmosphere depth and volume signatures so optical/lighting edits can reuse unchanged scene depth.
- Coalesced Environment uniform work and rendered only the active preview.

## RC 6 — startup, hydration and interaction latency

- Light Manager registers its plugin and custom `light` outliner type synchronously so `.bbmodel` parsing does not wait for secondary asset/icon generation.
- Added the shared generation-guarded Lightflow project lifecycle.
- Added late restoration of lights, Volume Domains, Environment settings, material assignments, face assignments and Material Instances.
- Project close/tab switching cancels stale queued work.
- Light edits update only affected lights.
- Shadow maps use explicit invalidation.
- Environment keeps directional-light topology stable during common toggles.
- Environment shadow projection updates only when its configuration signature changes.
- Shader Architect isolates queued material/uniform work by project revision.
- Atmosphere restores late-loaded volumes and isolates queued volume rendering by project.
- Studio Render coalesces Scene Composer refreshes and composites only the active viewport.
- Removed redundant recovery rendering.
- Added regression coverage around registration, hydration, project isolation, partial light updates, shadow invalidation, Environment topology and active-preview-only composition.

## Final v0.1.0 snapshot polish

- Matched and documented module versions: Light Manager 1.7.0, Environment 1.5.1, Shader Architect 2.9.1, Atmosphere 1.2.0 and Studio Render 1.9.0.
- Expanded Environment with deterministic Vanilla stars, textured celestial atlases, project texture overrides, richer cloud controls, ambient response, reflections and directional-shadow tooling.
- Expanded Shader Architect documentation and surfaced the current PBR/stylized material workflow, native texture semantics, Material Instances, per-element/per-face assignment, editable GLSL, AO, SSR, SSS, outlines, rim and pixelated shadows.
- Expanded Studio Render around Scene Composer, GPU Bloom, grading, camera presets, adjustable framing, tiled supersampling, transparency and high-resolution output.
- Synchronized global gizmo visibility across Light Manager, Atmosphere Volume Domains and Environment helpers.

---

# Things that are present but easy to overlook

- Light animation includes **color and intensity**, not only transforms.
- Light Manager has separate **preview and Studio Render shadow resolutions**, with Studio options reaching 16K when the GPU supports them.
- The advanced Lightflow color UI understands **HEX/RGB/HSL/HSV**.
- Environment's stars are deterministic rather than regenerated randomly on every update.
- The moon uses a real multi-phase atlas and supports project texture overrides.
- Environment lighting is consumed by compatible materials; the sky is not only a background.
- Material overrides can be exported as **`.sami`**, while complete custom shader materials use **`.samat`**.
- Shader Architect keeps old `shaded_lightflow` and `luma_forge` IDs as hidden compatibility aliases.
- Auto Tile metadata survives **Convert to Mesh** and **Merge Meshes** operations.
- Shader Architect exposes a `LightflowPerformance()` diagnostics hook.
- Custom Shader Architect uniforms can carry their own localized labels.
- Atmosphere has separate render/preview ray budgets and resolution scales.
- Volume Domain helpers do not cast fake shadows into the scene.
- Studio Render camera presets save projection/framing/output metadata, not only camera position.
- Moving the camera manually releases an active camera preset instead of silently leaving a false “preset applied” state.
- Bloom distinguishes bright-surface and emissive-texture contribution and can occlude glow behind scene geometry.
- Transparent Studio Render output remains compatible with the Bloom composition path.
- Studio Render can copy a final PNG directly to the clipboard or load it back into Blockbench as a texture.
- The entire suite has late-hydration/project-generation guards to reduce corruption when opening/switching projects while plugins are still initializing.

---

# Requirements and recommended setup

- **Blockbench 4.9.0 or newer**.
- **Blockbench Desktop strongly recommended**.
- WebGL-capable GPU.
- Dedicated GPU recommended for Atmosphere, realtime Bloom, large shadow maps and high-resolution Studio Render captures.
- Configure Blockbench to use your high-performance/dedicated GPU at the operating-system/GPU-driver level when applicable.
- Install matched modules from this same snapshot.
- Prefer `.bbmodel` for Lightflow working projects.
- Back up important project files before moving between development generations.

Repository validation tooling expects Node.js 18+ when running `npm run validate`; Node is not required simply to load the plugins in Blockbench.

---

# Known boundaries of v0.1.0

Lightflow v0.1.0 deliberately documents what it is **not**:

- No hardware ray tracing.
- No path tracing.
- No cosmetic “RTX” toggle pretending raster rendering is ray tracing.
- No colored transmissive-shadow solution in the stable path.
- It remains a manual-install development preview and is not yet a Blockbench Plugin Marketplace package.
- Environment and Atmosphere are functional but remain more experimental than Light Manager, Shader Architect and Studio Render.
- Some UI/defaults/persistence formats may change in future generations.
- Large shadow maps, high SSAA, Atmosphere Ultra quality, realtime Bloom and 8K output can be expensive and are GPU-dependent.
- The repository currently has no license file; public source visibility alone does not grant redistribution/reuse rights.

Lightflow is not intended to replace Blender, a full game engine, an offline path tracer or a general-purpose renderer. It is a focused rendering/presentation toolkit designed specifically around Blockbench artists and Blockbench project semantics.

---

# Why freeze this version?

Future Lightflow development is already moving into deeper changes, especially around Rendercraft, rendering performance, UI/UX, animation and much larger scenes. Keeping this snapshot separate means:

1. existing users can stay on a known working build;
2. installation links do not silently change when `main` changes;
3. regressions in future work can be compared against a real historical baseline;
4. the evolution of Lightflow becomes visible in GitHub instead of every generation replacing the previous one;
5. future releases can use a proper suite-level changelog while module versions continue evolving independently.

This release is the baseline from which that history starts.

---

**Built by MidFord for artists who want their Blockbench work to feel finished.**
