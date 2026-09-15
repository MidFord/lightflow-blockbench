# Lightflow 3.0 Development Branch Policy

## Purpose

`development/lightflow-3.0` is the preservation and integration branch for the complete Lightflow development state as of 2026-08-24.

It has four jobs:

1. preserve the current working source before further architectural changes;
2. make the actual implementation state explicit instead of hiding it behind a public-facing roadmap;
3. provide a stable point from which renderer, cinematics, shader graph and Bedrock work can continue;
4. define objective gates for the next release candidate.

This is **not** the release branch and should never be advertised as a stable install target.

## Current milestone

The project is in an **integration + stabilization milestone**. The major rendering direction is already implemented, but several systems are still being reconciled:

- Rendercraft fidelity and its newer program-compiler path;
- screen-space color/depth access and global SSR/AO frame resources;
- viewport versus Studio Render parity;
- shader warmup and large-scene performance;
- Visual Shader Graph compilation and authoring UX;
- deterministic Cinematic sequencing and export;
- Bedrock Structure Studio's optimized chunk/atlas renderer and Lightflow bridge;
- packaging and module-size strategy for publication.

## What “implemented” means on this branch

A feature can be present in code and still not be release-complete. The documentation uses these maturity labels:

- **Integrated** — connected to the current shared runtime and used by other modules.
- **Functional** — feature works in its primary path, but still needs broader validation.
- **Experimental** — behavior/API may change substantially and migration is not promised.
- **Validation required** — code exists, but parity/performance/edge cases are not proven.
- **Blocked** — a known defect or architectural decision prevents release acceptance.

## Source of truth

For this branch the source of truth is:

1. the eight JavaScript modules in the repository root;
2. `docs/development-3.0/*`;
3. automated syntax/regression tests;
4. reproducible Blockbench runtime tests.

Historical roadmap documents are evidence of prior work, not proof that a feature remains correct in the current implementation.

## Release gates

A release candidate must not be cut until all of the following are true:

- no known shader compile/link failures in supported render modes;
- no deterministic screen-space coordinate offset or scale mismatch;
- no major viewport/Studio Render parity break in Rendercraft, transparency, Bloom, Texture Relief, AO or SSR;
- large-scene warmup and steady-state performance is measured and acceptable;
- Bedrock optimized preview has correct chunk transforms, texture/material parity and state-driven vegetation handling;
- Cinematic frame evaluation is deterministic and cancellation/restoration is safe;
- Visual Shader Graph round-trips project data and produces stable Shader Architect material output;
- all persisted formats have version/migration handling;
- documentation reflects the actual UI and dependencies;
- packaging is compatible with the intended Blockbench distribution path.

## Branch discipline

Use focused commits and keep behavior changes separate from documentation-only changes when practical. For renderer work, commit messages should identify the affected stage (`warmup`, `beauty`, `depth`, `surface`, `SSR`, `AO`, `Bloom`, `Studio Render`, `bridge`, etc.). For persisted data changes, include the schema/property version in the commit body.

When an experiment is abandoned, remove or quarantine it rather than leaving unreachable production paths in the main renderer. Lightflow 3.0 already has enough moving parts that dead architecture is itself a maintenance and performance risk.
