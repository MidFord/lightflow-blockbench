# Contributing to Lightflow

Thank you for helping improve Lightflow for Blockbench.

Lightflow is an open-source rendering toolkit under active development. Contributions are welcome across rendering, performance, compatibility, UI/UX, documentation, tests, examples, and bug investigation.

## Before you start

Please keep contributions focused and easy to review. For larger changes, especially renderer architecture, persistence formats, material behavior, or cross-module APIs, open an issue first so the intended behavior can be discussed before substantial implementation work begins.

## Development requirements

- Blockbench 4.9.0 or newer.
- Blockbench Desktop is strongly recommended for rendering work.
- Node.js 18 or newer for automated validation.
- A WebGL-capable GPU for manual rendering tests.

Clone the repository and install the validation harness:

```bash
git clone https://github.com/MidFord/lightflow-blockbench.git
cd lightflow-blockbench
npm install
npm run validate
```

The repository currently has no build step for the five distributable modules. The JavaScript files in the repository root are loaded directly by Blockbench.

For the complete local-development workflow, see [Development Guide](docs/DEVELOPMENT.md).

## Loading a local development build

In Blockbench, use **File → Plugins → Load Plugin from File** and load the modules in this order:

1. `light_manager.js`
2. `shader_architect.js`
3. `studio_render.js`
4. `lightflow_atmosphere.js`
5. `lightflow_environment.js`

Keep all modules from the same revision when testing. Restart Blockbench or reload the plugins after updating local files.

## Before opening a pull request

Please:

- run `npm run validate`;
- verify every changed plugin loads without new console errors;
- manually test the affected workflow in Blockbench Desktop;
- test plugin unload/reload when lifecycle code changes;
- test save/reopen behavior when `.bbmodel` persistence changes;
- include screenshots or recordings for visible rendering or UI changes;
- document new user-facing behavior when appropriate;
- avoid unrelated formatting or refactoring in the same pull request;
- do not commit secrets, personal project files, generated caches, or unnecessary binary artifacts.

GPU rendering changes cannot be fully validated by the Node.js harness, so manual Blockbench testing is required for changes involving shaders, shadows, atmosphere, post-processing, render targets, or final output.

## Bug reports

A useful bug report includes:

- Blockbench version and operating system;
- GPU model and display scaling;
- Lightflow module versions or commit;
- exact reproduction steps;
- a minimal `.bbmodel` or reproducible scene when possible;
- screenshots or a short recording for visual problems;
- relevant console errors from **View → Developer Tools**.

Please distinguish reproducible defects from visual or workflow suggestions when possible.

## Code and architecture expectations

Lightflow consists of independently loadable modules that cooperate at runtime. Changes should preserve that property unless a broader architecture change has been intentionally agreed upon.

Prefer changes that are:

- explicit about ownership and cleanup of global state;
- safe across plugin reloads;
- compatible with current Blockbench/Three.js host behavior;
- conscious of realtime GPU cost;
- resilient when optional Lightflow modules are unavailable;
- readable in source form and practical to debug inside Blockbench.

Avoid introducing copied third-party source code without first confirming that its license is compatible with Apache-2.0 and documenting the origin and license in the pull request. New dependencies should have a clear technical reason and compatible licensing.

## Pull request description

Please explain:

1. what problem the change solves;
2. the behavior before and after;
3. which Lightflow modules are affected;
4. how the change was validated;
5. known limitations or follow-up work.

Small, reviewable pull requests are preferred over unrelated collections of changes.

## Licensing of contributions

Lightflow is licensed under the [Apache License 2.0](LICENSE).

Unless you explicitly state otherwise, by intentionally submitting a contribution for inclusion in Lightflow, you agree that the contribution is provided under the Apache License 2.0, consistent with Section 5 of that license. You must have the right to submit the code, documentation, assets, or other material you contribute.

Do not submit material whose license is unknown or incompatible with the project.

## Community

Be constructive, technically specific, and respectful when reviewing work or discussing problems. The goal is to make Lightflow reliable, understandable, and useful to artists and developers across the Blockbench ecosystem.
