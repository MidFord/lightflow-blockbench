# Lightflow 3.0 Development Documentation

> **Archived engineering snapshot (2026-08-24).** This directory documents the older `development/lightflow-3.0` preservation effort, not the current `main` build. See [current development status](../DEVELOPMENT_STATUS.md) and [SOURCE_SYNC_STATUS.md](SOURCE_SYNC_STATUS.md) for known synchronization caveats.

This directory is the authoritative engineering documentation for `development/lightflow-3.0`.

- **MODULE_STATUS.md** — what is implemented in each module and what still needs validation.
- **ARCHITECTURE.md** — ownership and cross-module contracts.
- **KNOWN_ISSUES.md** — active blockers and regression risks.
- **ROADMAP.md** — ordered stabilization plan.
- **VALIDATION.md** — runtime/test matrix and release acceptance criteria.
- **SNAPSHOT_MANIFEST.md** — exact preserved source inventory.

Do not remove an issue from the register merely because a later code path appears to work. Close it only after the relevant regression fixture passes.
