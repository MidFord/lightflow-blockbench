# Lightflow 3.0 — Stabilization Roadmap

The roadmap is ordered by dependency and release risk rather than by visual excitement.

## Phase A — Freeze and reproduce

- Preserve this snapshot and its hashes.
- Build a small set of canonical `.bbmodel`, `.mcstructure`, resource-pack and shader-graph fixtures.
- Record Blockbench version, OS, GPU, DPR/display scale and module versions in every benchmark/repro.
- Stop changing persisted formats casually; version any unavoidable change.

**Exit:** every current P0/P1 defect has a minimal reproducible fixture or a written reason why it cannot yet be reproduced.

## Phase B — Renderer correctness

- Fix screen-access coordinate parity at DPR 1.0, 1.25, 1.5, 2.0 and representative viewport sizes.
- Prove clean-scene capture does not recursively include screen-reading materials.
- Validate frame-resource ownership and alpha behavior.
- Validate global SSR resolve and AO against animation/camera motion.
- Finish Rendercraft rim/outline and Texture Relief parity passes.
- Remove duplicate/dead renderer paths uncovered by the audit.

**Exit:** no known compile/link failure; zero-distortion screen sample is 1:1; viewport visual fixtures are stable.

## Phase C — Performance and warmup

- Add benchmark instrumentation for cold/warm program compilation.
- Measure compiler cache hit rate by material family and structural feature bucket.
- Profile depth, screen capture, surface, emission, AO, SSR, Bloom and beauty passes separately.
- Stress light counts/shadows and large numbers of cubes/meshes.
- Reassess warmup scheduling so switching to Lightflow does not create an avoidable long blocking tail.
- Verify frame-budget adaptation does not create visible instability.

**Exit:** agreed viewport targets are met on the reference development hardware/scene set, and performance regressions can be attributed to specific passes.

## Phase D — Bedrock Structure Studio stabilization

- Fix baked-chunk transform parity.
- Lock the logical-cell ↔ derived-chunk coordinate contract.
- Finish Classic/Textured/Lightflow material-policy parity.
- Add fixtures for grass, bush, tall grass halves, leaves, water, glass, stairs, slabs, doors, rails and animated blocks.
- Validate atlas page reuse and flipbook isolation.
- Stress multi-chunk selection, move, duplicate, delete and editable bake.
- Keep the Outliner focused on logical authoring; derived render nodes remain disposable implementation detail.

**Exit:** representative vanilla/resource-pack structures render and round-trip without spatial/state/texture corruption.

## Phase E — Visual Shader Graph stabilization

- Add serialization fixtures for graph format 3.
- Add compile fixtures for every major type conversion and stage boundary.
- Validate exact Lightflow/Rendercraft/PBR/Classic presets against their live Shader Architect material controls.
- Validate scene/screen nodes after renderer screen-access fixes.
- Test subgraph expansion, recursion rejection and identifier sanitization.
- Improve large-graph UX and author-facing error messages.

**Exit:** graph output is deterministic and can be trusted as a production authoring path rather than a demo surface.

## Phase F — Cinematic stabilization

- Lock deterministic frame semantics.
- Stress camera keyframes and interpolation.
- Prove Timeline/model/light/shader/environment state restoration.
- Render long PNG sequences with cancellation/restart tests.
- Decide the first supported final-video workflow: external FFmpeg from PNG sequence versus integrated encoder/muxer.
- Add job progress, failure diagnostics and resume policy if needed.
- Continue higher-level camera/sequence UX only after frame correctness is stable.

**Exit:** the same project/sequence produces repeatable frame outputs and survives long jobs safely.

## Phase G — Productization

- Audit UI consistency across eight modules.
- Simplify artist-facing controls without deleting expert capability.
- Reconcile plugin dependency order and missing-dependency messages.
- Audit all public/global API names.
- Update installation/documentation for the actual module set.
- Revalidate Marketplace/package size constraints.
- Split/bundle code only if it improves distribution without creating fragile runtime loading.
- Prepare visual examples and migration notes.

**Exit:** release candidate can be installed, updated, tested and removed without developer-only knowledge.

## Phase H — Release candidate

Cut a separate release-candidate branch. Do not rename the development branch into a release branch.

The release candidate should contain only features that passed the validation matrix. Experimental future work can continue on `development/lightflow-3.0` or a later development branch.

## Post-3.0 research

Potential work after stabilization includes deeper video encoding/muxing, particles, broader animation/editorial tooling, additional renderer backends/experiments, richer Bedrock geometry support and continued large-scene optimization.
