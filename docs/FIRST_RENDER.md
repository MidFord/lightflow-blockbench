# Your First Lightflow Render

This tutorial creates a clean showcase image without requiring custom shaders or advanced volumetrics.

## 1. Prepare the model

Open a model with correct textures, UVs, transparency, hierarchy, and pose. Save a copy as `.bbmodel` before adding Lightflow-specific data.

Switch to **Lightflow Render** mode.

## 2. Create the key light

Use Light Manager to add a **Directional Light**.

Start with:

- one neutral or slightly warm key light;
- medium intensity;
- Balanced preview shadows;
- tight directional shadow bounds around the model;
- a separate higher Studio Shadow Resolution for the final render.

Aim the light from above and to one side so the model has a readable light side and shadow side.

## 3. Add a simple fill

Add a low-intensity Point or Spot light from the opposite side only when the shadows are too dark. The fill should recover information, not remove the lighting direction.

Two useful rules:

- keep the fill dimmer than the key;
- avoid giving every side the same brightness.

## 4. Choose an environment

Open Environment Composer.

- Use **Vanilla** for a familiar Minecraft-inspired presentation.
- Use **Vibrant Visuals** for stronger sky color and a more modern response.
- Change Minecraft time to move quickly between daylight, sunset, and night.
- Adjust ambient strength only after the key light already reads clearly.

The environment can provide sky color, horizon color, ground response, reflections, sun/moon light, stars, clouds, and directional shadows.

## 5. Apply a material

Open Material Studio and apply a built-in material globally.

Good starting choices:

- **Lightflow** for a flexible stylized result;
- **Cinematic Craft** for a stronger hero/trailer presentation;
- **Lightflow Principled PBR** for more physically inspired controls;
- **Vibrant Visuals PBR** for environment-aware Minecraft PBR presentation.

Use a Material Instance only when a specific part needs different values. Use per-face overrides sparingly; global consistency is easier to art-direct.

## 6. Refine the shape

Adjust only the controls that solve a visible problem:

- roughness/specular for highlight size;
- bevel or normal shaping for edge readability;
- ambient occlusion for contact depth;
- rim light for silhouette separation;
- outline for graphic definition;
- subsurface scattering for skin, wax, leaves, or other thin materials;
- pixelated shadows when the visual language should remain voxel-like.

Do not enable every effect by default.

## 7. Add atmosphere only when it helps

Create a Volume Domain and fit it around the relevant part of the scene.

- **Soft Mist** adds depth separation.
- **God Rays** creates additive shafts from a shadowed Spot or Directional light.
- **Cloud Volume** creates local procedural cloud forms.
- **Stage Haze** adds a restrained studio atmosphere.
- **Cinematic Dust** creates textured shafts and floating density variation.

Keep preview quality at Balanced while editing. Raise render quality only for the final image.

## 8. Compose the image

Open Scene Composer.

1. Frame the model with a clear silhouette.
2. Enable Bloom only when emissive or bright areas should glow.
3. Adjust exposure before contrast.
4. Use saturation, temperature, and tint in small amounts.
5. Add vignette only when it directs attention rather than hiding the frame.
6. Save a camera preset when the composition matters.

## 9. Export with Studio Render

For a first polished still:

- Resolution: 3840 × 2160 or a suitable square preset.
- Samples: 4x while learning; increase only when the improvement is visible.
- Background: Transparent for compositing, or Solid Color for a finished plate.
- Frame: use the adjustable render frame when the viewport composition and output ratio differ.
- Destination: Preview first, then Save.

Studio Render uses tiled output for high resolutions and can reuse the same Bloom and grading language shown in Scene Composer.

## A reliable order of decisions

When a render is not working, fix it in this order:

1. camera and silhouette;
2. key light direction;
3. shadow shape;
4. environment and fill;
5. material response;
6. atmosphere;
7. Bloom and color grading;
8. final sample count and resolution.

More effects cannot rescue a weak camera or unreadable light direction.
