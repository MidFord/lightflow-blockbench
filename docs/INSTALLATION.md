# Installing Lightflow

Lightflow is currently a **manual development preview**. It has not yet been published in the official Blockbench Plugin Marketplace.

## Before you install

- Use Blockbench 4.9.0 or newer.
- Prefer Blockbench Desktop.
- Download every Lightflow module from the same commit or release package.
- Back up important `.bbmodel` projects before moving between development builds.

## Install from the repository

1. Download the repository as a ZIP or clone it with Git.
2. Extract it to a permanent folder. Do not load plugins directly from a temporary ZIP preview.
3. Open Blockbench.
4. Open **File → Plugins**.
5. Use **Load Plugin from File** for each JavaScript file.
6. Load them in this order:

```text
1. light_manager.js
2. lightflow_environment.js
3. shader_architect.js
4. lightflow_atmosphere.js
5. studio_render.js
```

Light Manager must load first because it provides the shared lighting foundation and lifecycle used by other modules.

## Verify the installation

Open or create a project, then confirm that:

- **Lightflow Render** is available as a view mode;
- Light Manager actions can add a Point, Spot, or Directional light;
- the Environment, Material, Atmosphere, and Scene Composer panels appear in Lightflow Render mode;
- Studio Render is available from the relevant menu/actions;
- the developer console contains no red plugin-load errors.

## Updating

1. Save and close important projects.
2. Replace all five plugin files with files from the same newer build.
3. Reload the plugins or restart Blockbench.
4. Reopen a copy of a project first and verify lights, materials, environment settings, atmosphere domains, and camera presets.

Do not update only one dependency-sensitive module unless the changelog explicitly says the versions are compatible.

## Removing Lightflow

Disable or uninstall each local plugin from Blockbench's Plugin dialog. Removing the plugin does not automatically remove Lightflow data already stored inside a `.bbmodel` file.

Keep an untouched project backup when testing removal or migration behavior.

## Development validation

For contributors or local builds:

```bash
npm install
npm run validate
```

This runs JavaScript syntax checks and the repository regression tests. Node.js 18 or newer is required.

## Common installation problems

### Shader Architect or Atmosphere says Light Manager is required

Light Manager did not load first, failed to initialize, or came from an incompatible build. Reload Light Manager, inspect the console, then reload the dependent module.

### Saved lights or materials do not appear

Use `.bbmodel`, verify that every module loaded successfully, and avoid mixing files from different commits. Recent builds include late project hydration, but a failed dependency can still prevent a module from restoring its own data.

### The plugin loads but the panels are missing

Switch to **Lightflow Render** mode and select an applicable object when the panel depends on selection. Then check the developer console for initialization errors.
