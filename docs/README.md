# Lightflow documentation

This is the documentation hub for **Lightflow for Blockbench**. Start with the artist guides if you want to create renders; use the contributor guides if you want to modify Lightflow itself.

## For artists

| Guide | What it covers |
| --- | --- |
| [Installation](INSTALLATION.md) | Install Lightflow Hub, choose a channel, or load modules manually |
| [Your first render](FIRST_RENDER.md) | Create a scene from lighting to final image |
| [Modules](MODULES.md) | What each module does, dependencies, and maturity |
| [Workflows](WORKFLOWS.md) | Practical setups for different types of renders |
| [Troubleshooting](TROUBLESHOOTING.md) | Performance, rendering and installation problems |

## For contributors

| Resource | What it covers |
| --- | --- |
| [Contribution guidelines](../CONTRIBUTING.md) | Pull requests, bug reports and quality expectations |
| [Development guide](DEVELOPMENT.md) | Local workflow, validation and manual testing |
| [Development status](DEVELOPMENT_STATUS.md) | Current main-branch status and version source of truth |
| [Main-branch manifest](../lightflow.manifest.json) | Authoritative module paths, versions, groups and dependencies |
| [Changelog](../CHANGELOG.md) | Recorded historical changes |
| [GitHub issues](https://github.com/MidFord/lightflow-blockbench/issues) | Current reports and feature suggestions |

## Development notes and historical references

- [Next Update Progress](NEXT_UPDATE.md): an earlier engineering checklist; **verify each item against current code** before treating it as active.
- [Lightflow 3.0 snapshot documentation](development-3.0/README.md): historical engineering and preservation notes from August 2026; it is **not** the current release channel.
- [Historical branch policy](../DEVELOPMENT.md) and [3.0 development changelog](../CHANGELOG-3.0-development.md): dated documents for the older `development/lightflow-3.0` workflow.
- [Archived first-preview README](archive/README-2026-first-preview.md): the full original long-form README, preserved for reference.

## Documentation conventions

- The repository-root [README](../README.md) is a short public entry point, not an exhaustive manual.
- User-facing installation instructions belong in [INSTALLATION.md](INSTALLATION.md).
- Module inventories and compatibility descriptions must be reconciled with [lightflow.manifest.json](../lightflow.manifest.json) when they change.
- Prefer links to the canonical guide instead of duplicating the same instructions in multiple pages.
- A document describing an old snapshot must say so near the top. **Development builds are not stable releases.**
