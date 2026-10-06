# Lightflow Hub 1.0.1

This release corrects the installation and update workflow described in issue #12. Stable installs the frozen Lightflow v0.1.0 suite. Main and Experimental remain explicit development choices.

The Hub provides a redesigned catalog, standalone pixel icons, Markdown release notes, one-step essential installation, verified dependency order, installation progress, retry and recovery after loader failures. Daily checks notify artists of available updates; replacements require confirmation.

## Frozen stable modules

| Module | Version |
| --- | --- |
| Light Manager | 1.7.0 |
| Shader Architect | 2.9.1 |
| Lightflow Environment | 1.5.1 |
| Lightflow Atmosphere | 1.2.0 |
| Studio Render | 1.9.0 |

## Existing users

Save your projects. The originally published Hub 1.0.0 rejects the JSON manifest filename and cannot discover this update through Stable. Replace only that Hub: uninstall **Lightflow Hub** in Blockbench's Plugins dialog, leave the suite modules installed, then load the versioned Hub 1.0.1 URL below. Select **Installation and updates → GitHub → Stable → Latest stable**, then apply the offered source migration. This can replace a newer development build with the intended older stable version. The Hub preserves explicit channel choices and does not migrate automatically.

Use **Latest stable** for this catalog. The legacy `v0.1.0` tag predates the Hub manifest and cannot be selected directly through the Hub.

Install the Hub from the versioned release URL:

https://raw.githubusercontent.com/MidFord/lightflow-blockbench/refs/tags/lightflow-hub-v1.0.1/lightflow_hub.js

For local installation, extract the ZIP and load `lightflow_hub.js` from the extracted directory. Choose Local folder / Use Hub folder to install the bundled frozen modules.

This release addresses distribution and installation. It does not claim to resolve rendering issues #9 or #11; those reports still require reproduction with the frozen suite.
