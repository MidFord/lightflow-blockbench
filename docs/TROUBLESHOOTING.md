# Performance and Troubleshooting

## Start with these safe settings

- Preview shadows: Balanced.
- Studio shadows: High only for the lights that need it.
- Atmosphere preview: Balanced or Draft.
- Atmosphere render: High.
- Viewport Bloom: Adaptive.
- Studio Render: 4K, 4x samples.

## The viewport stutters

Check the most expensive systems first:

1. realtime Atmosphere;
2. high-resolution shadow maps;
3. multiple shadow-casting lights;
4. high-quality realtime Bloom;
5. AO and SSR on large or highly segmented scenes;
6. very large viewport dimensions or display scaling.

Reduce preview quality rather than final-render quality. Keep directional shadow bounds and atmosphere domains close to the subject.

## Shadows look detached or acne-covered

- Tighten light range, near/far clipping, cone, or directional bounds.
- Return bias and normal bias to an automatic or known preset value.
- Do not use an unnecessarily large shadow area.
- Raise shadow resolution only after correcting the projection area.

## Bloom appears through foreground objects

Use matching module versions and confirm Bloom occlusion is enabled. Foreground geometry must remain in the emissive mask depth path even when it does not glow.

## Bloom or Atmosphere is offset at Windows scaling above 100%

Use a recent matched build. Lightflow contains DPI-safe render-target viewport handling, but older mixed module versions can reintroduce scale or alignment errors.

## Transparent output becomes black

- Set Studio Render background to Transparent.
- Verify the destination supports alpha.
- Use current Studio Render Bloom composition.
- Inspect whether an atmosphere or material intentionally writes opacity.

## Lights or materials disappear after opening a project

- Confirm Light Manager loaded first.
- Confirm all modules come from the same build.
- Use `.bbmodel`.
- Check the developer console for parsing or hydration errors.
- Test with a backup copy after updating.

## A Volume Domain casts a box shadow

That is not intended. Use a current Atmosphere and Light Manager pair; the editing proxy should be excluded from scene shadow casting and receiving.

## A shader does not compile

Open Material Studio validation and inspect the complete GLSL error. Custom shaders that use Three.js chunks must remain compatible with the Three.js revision bundled by the target Blockbench version.

## Studio Render fails at a very large resolution

GPU texture size, renderbuffer size, memory, total pixel count, and browser/desktop process limits still apply. Try:

- 4K before 8K;
- lower samples;
- a smaller tile size;
- fewer high-resolution shadow maps;
- lower Atmosphere render quality;
- closing other GPU-heavy applications.

## Information to include in a bug report

- Blockbench version;
- operating system;
- GPU;
- display scaling;
- Lightflow module versions;
- model type and approximate scene size;
- active effects;
- exact reproduction steps;
- console error;
- minimal project or recording.
