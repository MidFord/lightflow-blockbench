# Lightflow Workflows

## Clean transparent product render

Use this for a model sheet, store image, portfolio thumbnail, or compositing asset.

1. Disable or simplify the environment background.
2. Use a directional key and soft point/spot fill.
3. Apply a restrained material with readable bevels and AO.
4. Avoid Atmosphere unless the image specifically needs it.
5. Use a transparent Studio Render background.
6. Keep Bloom off or very subtle.
7. Export 4K with 4x samples before attempting larger output.

## Minecraft-style outdoor scene

1. Enable Lightflow Environment.
2. Choose Vanilla or Vibrant Visuals.
3. Set time first; it controls the broad color story.
4. Fit environment shadow coverage around the subject.
5. Use environment ambient response in the material.
6. Add a local light only when the sun/moon cannot provide the needed focal emphasis.
7. Use pixelated shadows when the final style should retain block-scale visual rhythm.

## Cinematic hero render

1. Start with a low or dramatic camera angle.
2. Build a clear key/fill/rim hierarchy.
3. Try Cinematic Craft or a controlled PBR material.
4. Use material instances for focal details, not every object.
5. Add a restrained atmosphere domain behind or around the subject.
6. Use emissive details to support Bloom.
7. Grade the image in Scene Composer, then export with the same settings in Studio Render.

## God Rays

1. Add a Spot or Directional light.
2. Enable shadows and place an occluder between the light and volume.
3. Add a Volume Domain and choose God Rays or Cinematic Dust.
4. Enable volumetric shadow reception.
5. Align the domain with the visible beam area instead of filling the entire scene.
6. Tune density before scattering strength.
7. Keep the shadowed parts transparent; black boxes usually indicate incorrect placement, excessive absorption, or an incompatible build.

## Performance-first iteration

While composing:

- use Balanced or lower shadow resolution;
- keep Atmosphere preview quality at Balanced or Draft;
- use Adaptive or Performance Bloom quality;
- edit one active viewport;
- keep directional bounds and volume domains tight;
- disable effects that are not contributing to the current decision;
- render small previews before 4K/8K output.

For the final image, raise one quality setting at a time and compare the visible improvement.
