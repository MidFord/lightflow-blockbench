# Publish Lightflow Hub 1.0.1

The prepared ZIP contains the new Hub, the stable manifest, five verified frozen modules, offline artwork and checksums. The development manifest in the working checkout is not the release manifest.

## Required Git tag contents

A prepared Git bundle, `lightflow-hub-1.0.1.bundle`, contains the release commit and tag, with the existing stable Hub tag as its parent. To import it into your publishing clone without checking out or changing your working files, run `git fetch <absolute-path-to-bundle> refs/tags/lightflow-hub-v1.0.1:refs/tags/lightflow-hub-v1.0.1`. Review the tag and push only this tag to GitHub when ready. No push was performed during preparation.

Create `lightflow-hub-v1.0.1` from an isolated checkout based on `lightflow-hub-v1.0.0`. Copy the package's `lightflow_hub.js`, `lightflow.manifest.json`, five module files and `assets/hub/copper-golem.png` to their matching root paths, then commit that release tree and tag it. Keep the existing dirty development checkout intact.

Do not tag the current development checkout. GitHub release attachments alone are insufficient: both old and new Hub installers download the manifest and scripts from the tag's raw Git tree.

Create a GitHub Release for `lightflow-hub-v1.0.1`, leave Draft and Pre-release disabled, paste RELEASE_NOTES.md, and attach the ZIP, ZIP checksum and `lightflow_hub.js`. Stable discovery excludes pre-releases.

For the currently advertised main-branch installer URL, also update only the Hub JS and the Hub version in main's development manifest. Do not overwrite main's module catalog with the stable catalog or bring development module JS into the release tag.

## Publication validation

Before publishing, verify all entries in SHA256SUMS.txt. After publishing, use a clean Blockbench profile to install the versioned Hub URL and choose Stable / Latest stable. Check the five versions listed in RELEASE_NOTES.md, and verify their plugin paths point at `refs/tags/lightflow-hub-v1.0.1`.

The actual published Hub 1.0.0 has a manifest filename validation bug and cannot discover its update through Stable. Tell existing users to replace only the Hub through Blockbench's native Plugins dialog as documented in RELEASE_NOTES.md. Once 1.0.1 is installed, subsequent Hub self-updates use the repaired manifest path. Test changing previously installed Main modules to Stable with explicit confirmation. Re-test the projects from issues #9 and #11 before closing those reports.

No GitHub publishing, pushing, issue comments or issue closure is performed by the local build script.

## Rebuild

Run `python scripts/build_lightflow_hub_release.py` from this checkout. The builder downloads from both reviewed frozen tags, checks their SHA-256 equality, validates JS syntax, and builds `releases/lightflow-hub-1.0.1.zip` with a release-specific stable manifest. It never copies the local development module JS.
