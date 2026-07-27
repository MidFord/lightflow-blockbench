# Installing Lightflow

Lightflow is currently a **manual development preview**. It has not yet been published in the official Blockbench Plugin Marketplace.

## Before you install

- Use Blockbench 4.9.0 or newer.
- **Prefer Blockbench Desktop.**
- Install every Lightflow module from the same commit, branch, or release package.
- Back up important `.bbmodel` projects before moving between development builds.
- If your computer has both integrated and dedicated graphics, configure your operating system to run Blockbench with the **high-performance / dedicated GPU**. This makes realtime previews and final renders faster.

> **Current maturity:** Light Manager, Shader Architect, and Studio Render are the most complete and polished modules. Lightflow Atmosphere and Lightflow Environment are still in a more active beta stage, so their interfaces and behavior may change more frequently.

## Install directly from URLs

This is the fastest installation method and does not require downloading the repository first.

1. Open Blockbench Desktop.
2. Open **File → Plugins**.
3. Choose **Load Plugin from URL**.
4. Copy, paste, and install each URL **one at a time in this order**.

### 1. Light Manager

```text
https://raw.githubusercontent.com/MidFord/lightflow-blockbench/refs/heads/main/light_manager.js
```

### 2. Shader Architect

```text
https://raw.githubusercontent.com/MidFord/lightflow-blockbench/refs/heads/main/shader_architect.js
```

### 3. Studio Render

```text
https://raw.githubusercontent.com/MidFord/lightflow-blockbench/refs/heads/main/studio_render.js
```

### 4. Lightflow Atmosphere

```text
https://raw.githubusercontent.com/MidFord/lightflow-blockbench/refs/heads/main/lightflow_atmosphere.js
```

### 5. Lightflow Environment

```text
https://raw.githubusercontent.com/MidFord/lightflow-blockbench/refs/heads/main/lightflow_environment.js
```

Each URL is placed in its own code field so it can be copied easily with the copy button shown by GitHub and most Markdown viewers.

Restart Blockbench or reload the plugins after the installation. Light Manager must be installed first because it provides the shared lighting foundation and lifecycle used by the other modules.

## Install from downloaded files

1. Download the repository as a ZIP or clone it with Git.
2. Extract it to a permanent folder. Do not load plugins directly from a temporary ZIP preview.
3. Open Blockbench.
4. Open **File → Plugins**.
5. Use **Load Plugin from File** for each JavaScript file.
6. Load them in this order:

```text
1. light_manager.js
2. shader_architect.js
3. studio_render.js
4. lightflow_atmosphere.js
5. lightflow_environment.js
```

## Use the dedicated GPU

Blockbench Desktop is strongly recommended for Lightflow. When a computer includes both integrated graphics and a dedicated GPU, configure the operating system or GPU control panel to run Blockbench in **high-performance mode** with the dedicated GPU.

On Windows, this is usually available under **Settings → System → Display → Graphics**. Add or select Blockbench, open **Options**, and choose **High performance**. Equivalent settings may also be available in the NVIDIA, AMD, or Intel graphics control panel.

Using the dedicated GPU can improve viewport responsiveness, realtime Bloom and atmosphere previews, high-resolution shadows, and Studio Render performance.

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
