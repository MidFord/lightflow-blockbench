# Lightflow 3.0 — Source Synchronization Status

## Important

The engineering documentation in this branch describes the exact 2026-08-24 Lightflow 3.0 development snapshot recorded in `SNAPSHOT_MANIFEST.md`.

At branch creation time, the GitHub connector available to the preservation workflow could create/update UTF-8 repository files but could not ingest the local multi-megabyte source archive as a repository file payload. Therefore the remote branch was created from `main` and its documentation/validation scaffold was synchronized first, while the exact eight-module source payload was preserved separately as a complete Git bundle and ZIP snapshot.

**Do not assume the inherited root JavaScript files on the remote branch match the hashes in `SNAPSHOT_MANIFEST.md` until a source-sync commit replaces them.** The manifest hashes are the identity of the intended 3.0 snapshot.

The complete intended source set is:

- `light_manager.js` 1.8.2
- `shader_architect.js` 3.2.6
- `studio_render.js` 1.9.10
- `lightflow_environment.js` 1.9.0
- `lightflow_atmosphere.js` 1.2.0
- `lightflow_cinematic.js` 0.1.0
- `visual_shader_graph.js` 1.2.0
- `bedrock_structure_studio.js` 2.2.1

A source-sync commit is complete only when all eight root files match the SHA-256 values in `SNAPSHOT_MANIFEST.md`, after which `npm run validate` must report all syntax checks and smoke tests passing.
