from pathlib import Path


def replace_once(path, old, new, label):
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


light_manager = Path("light_manager.js")
environment = Path("lightflow_environment.js")

replace_once(
    light_manager,
    """function lightManagerCanvasGizmosVisible() {
    return !window.Canvas || Canvas.show_gizmos !== false;
}

function refreshLightManagerGizmoVisibility() {
    const visible = lightManagerCanvasGizmosVisible();""",
    """function lightManagerCanvasGizmosVisible() {
    return !window.Canvas || Canvas.show_gizmos !== false;
}

function lightManagerLightGizmosVisible() {
    return lightManagerCanvasGizmosVisible() &&
        (!window.LightManagerAreaGizmos || LightManagerAreaGizmos.enabled !== false);
}

function refreshLightManagerGizmoVisibility() {
    const visible = lightManagerLightGizmosVisible();
    const viewportControls = window.LightManagerViewportControls;
    if (!visible && viewportControls) {
        viewportControls.pendingFreeMove = false;
        if (viewportControls.drag) viewportControls.cancelDrag?.(true);
    }""",
    "add unified light gizmo visibility state",
)
replace_once(
    light_manager,
    """    canShowViewportGizmos() {
        if (window.Canvas && Canvas.show_gizmos === false) return false;
        if (window.LightManagerAreaGizmos && LightManagerAreaGizmos.enabled === false) return false;
        return true;
    },""",
    """    canShowViewportGizmos() {
        return lightManagerLightGizmosVisible();
    },""",
    "unify viewport gizmo visibility",
)
replace_once(
    light_manager,
    "mesh.visible = element.visibility !== false && lightManagerCanvasGizmosVisible();",
    "mesh.visible = element.visibility !== false && lightManagerLightGizmosVisible();",
    "light setup area visibility",
)
replace_once(
    light_manager,
    "const canvasGizmosVisible = lightManagerCanvasGizmosVisible();",
    "const canvasGizmosVisible = lightManagerLightGizmosVisible();",
    "light update area visibility",
)

replace_once(
    environment,
    "const gizmoVisibilityListener = () => updateSunShadowGizmo();",
    """const gizmoVisibilityListener = () => {
                if (!canShowEnvironmentShadowGizmo()) sunShadowGizmoDrag = null;
                updateSunShadowGizmo();
            };""",
    "cancel hidden environment gizmo interaction",
)

for path, required in [
    (light_manager, "function lightManagerLightGizmosVisible()"),
    (light_manager, "viewportControls.cancelDrag?.(true)"),
    (environment, "sunShadowGizmoDrag = null"),
]:
    if required not in path.read_text(encoding="utf-8"):
        raise RuntimeError(f"{path}: missing {required}")
