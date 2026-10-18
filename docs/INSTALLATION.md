# Installing Lightflow

Lightflow is not currently published in the official Blockbench Plugin Marketplace. **Lightflow Hub** is the recommended installer and update manager. Direct module installation is a fallback for development or troubleshooting.

## Before you begin

- Use **Blockbench 4.9.0 or later**. Some optional plugins require Blockbench **5.0.0+**; consult the [module inventory](MODULES.md).
- Prefer Blockbench Desktop and a dedicated GPU for GPU-intensive workflows.
- Save a backup of important `.bbmodel` projects before changing channels.
- Keep coupled modules from the **same release or commit**. Do not mix independently downloaded `main` scripts with the Stable release.

## Recommended: Lightflow Hub

For a pinned installer, use the **Lightflow Hub v1.0.1** script from its release tag:

```text
https://raw.githubusercontent.com/MidFord/lightflow-blockbench/lightflow-hub-v1.0.1/lightflow_hub.js
```

1. Open Blockbench and go to **File → Plugins → Load Plugin from URL**.
2. Paste the URL above and load the plugin.
3. Open **Tools → Lightflow Hub**.
4. Leave **Stable** selected to install the published Lightflow suite snapshot, or explicitly select **Main** if you want the in-development build.
5. Install the recommended modules. Lightflow Hub handles declared dependencies and provides update and plugin-management actions.

The pinned Hub installer comes from the [v1.0.1 release](https://github.com/MidFord/lightflow-blockbench/releases/tag/lightflow-hub-v1.0.1). Hub's own version and the version of the Lightflow suite are **separate**.

### Which channel should I use?

| Channel | Meaning |
| --- | --- |
| **Stable** | Published, frozen Lightflow release snapshot. Recommended for normal use. |
| **Main** | The latest public `main` source, which is actively developed and not a stable release. |
| **Experimental** | A development channel only when a compatible experimental branch is available; do not assume it exists or is a stable download. |

The published [v0.1.0 suite preview](https://github.com/MidFord/lightflow-blockbench/releases/tag/v0.1.0) is distinct from the newer development manifest on `main`. Check [Development status](DEVELOPMENT_STATUS.md) when comparing features or versions.

## Manual installation (advanced fallback)

For manual testing of the current development revision, Blockbench supports **File → Plugins → Load Plugin from File/URL**. Install **Light Manager first**, followed by any dependent modules.

```text
https://raw.githubusercontent.com/MidFord/lightflow-blockbench/main/light_manager.js
https://raw.githubusercontent.com/MidFord/lightflow-blockbench/main/shader_architect.js
https://raw.githubusercontent.com/MidFord/lightflow-blockbench/main/lightflow_environment.js
https://raw.githubusercontent.com/MidFord/lightflow-blockbench/main/lightflow_atmosphere.js
https://raw.githubusercontent.com/MidFord/lightflow-blockbench/main/studio_render.js
```

**These are development URLs, not stable installers.** Each URL is loaded separately. For additional modules, consult the [manifest](../lightflow.manifest.json) for paths, dependencies and minimum Blockbench versions; some entries use `dist/` instead of a root file.

When working from a downloaded ZIP or a clone, load the corresponding local `.js` file rather than mixing release sources. Restart Blockbench after an update or reload affected plugins when testing development changes.

## Verify the installation

Open a `.bbmodel` project and confirm that the expected Lightflow modules load, the Lightflow Render workspace is available, and you can create a light and use the material/render tools. A specialized or experimental plugin may expose different UI or requirements. If a module fails, check **View → Developer Tools** for errors.

## Updating or uninstalling

Update through Lightflow Hub whenever possible. For manual installs, replace a matched set of module scripts from one revision, then restart Blockbench. After updating, reopen a **copy** of a project to verify saved materials, lighting and environment settings.

Uninstall through Blockbench's plugin interface or through Hub. Removing a plugin does not necessarily remove custom data already saved in a project.

## GPU configuration

On Windows, use **Settings → System → Display → Graphics**, select Blockbench, and choose **High performance** if a dedicated GPU is available. Other operating systems have equivalent controls.

For rendering issues, see [Troubleshooting](TROUBLESHOOTING.md); for local source validation, see [Development](DEVELOPMENT.md).
