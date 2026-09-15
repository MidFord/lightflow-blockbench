/**
 * @typedef {Object} IconOptions
 * @property {string} [fontFamily='Material Icons'] - The CSS font-family name for the icons.
 * @property {string}[color='rgba(0, 0, 0, 1)'] - CSS color string (hex, rgb, rgba).
 * @property {string} [format='image/png'] - The output image MIME type.
 * @property {number} [quality=1.0] - Image quality for lossy formats (0.0 to 1.0).
 */

const lightManagerOwnedWindowBindings = new Map();
const lightManagerScheduledTaskCancellations = new Set();
const lightManagerReportedWarnings = new Set();
let ownedThreeLightsGroup = null;

function warnLightManagerOnce(key, message, error) {
    if (lightManagerReportedWarnings.has(key)) return;
    lightManagerReportedWarnings.add(key);
    console.warn(message, error);
}

function trackLightManagerWindowBinding(name) {
    lightManagerOwnedWindowBindings.set(name, window[name]);
}

function clearOwnedLightManagerWindowBindings() {
    Array.from(lightManagerOwnedWindowBindings.entries()).reverse().forEach(([name, ownedValue]) => {
        if (window[name] === ownedValue) delete window[name];
    });
    lightManagerOwnedWindowBindings.clear();
}

function scheduleLightManagerTimeout(callback, delay = 0) {
    let cancellation;
    const timer = setTimeout(() => {
        lightManagerScheduledTaskCancellations.delete(cancellation);
        callback();
    }, delay);
    cancellation = () => clearTimeout(timer);
    lightManagerScheduledTaskCancellations.add(cancellation);
    return timer;
}

function cancelScheduledLightManagerTasks() {
    Array.from(lightManagerScheduledTaskCancellations).forEach(cancel => cancel());
    lightManagerScheduledTaskCancellations.clear();
}

/**
 * Converts a font icon ligature or code into a Base64 encoded PNG/WebP.
 * @param {string} iconName - The name/ligature of the icon (e.g., 'settings').
 * @param {number} size - The square dimension of the output in pixels.
 * @param {IconOptions} [options={}] - Configuration for styling and output.
 * @returns {Promise<string>} A promise that resolves to the Base64 data URL.
 * @throws {Error} If the font fails to load or canvas context cannot be initialized.
 */
async function generateIconBase64(iconName, size, {
    fontFamily = 'Material Icons',
    color = 'rgba(0, 0, 0, 1)',
    format = 'image/png',
    quality = 1.0
} = {}) {
    try {
        await document.fonts.load(`${size}px "${fontFamily}"`);
    } catch (error) {
        throw new Error(`Failed to load font family "${fontFamily}": ${error?.message || error}`);
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Canvas 2D context is not supported.');
    }

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = color;
    ctx.font = `${size}px "${fontFamily}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(iconName, size / 2, size / 2);
    return canvas.toDataURL(format, quality);
}

window.generateIconBase64 = generateIconBase64;

/*
 * Shared project lifecycle for the Lightflow suite.
 *
 * Blockbench only deserializes properties and custom outliner types that are
 * registered when the project codec starts parsing. A plugin installed or
 * enabled after a project is already open therefore needs the original model
 * JSON to recover those fields. Keep that recovery in one place and give all
 * Lightflow plugins the same project-generation guard so work queued by the
 * previous project can never render into the next one.
 */
function createLightflowLifecycleRuntime() {
    const modelByProject = new WeakMap();
    const modelRequestByProject = new WeakMap();
    const parsingProjects = new WeakSet();
    const projectsAwaitingGeometry = new WeakSet();
    const hydrators = new Map();
    const listeners = [];
    let activeProject = typeof Project !== 'undefined' ? (Project || null) : null;
    let generation = activeProject ? 1 : 0;
    let geometryReadyFrame = null;
    let hydrationFrame = null;
    let hydrationQueue = [];
    let geometrySelectionRevision = 0;
    let geometryQuietFrames = 0;
    let disposed = false;
    let ownerAttached = true;
    let runtimeApi = null;
    const lifecycleMetrics = {
        transitionStartedAt: 0,
        hydrationStartedAt: 0,
        lastReason: '',
        lastHydrationMs: 0,
        lastCompletedGeneration: -1,
        hydrators: Object.create(null)
    };
    const lifecycleNow = () => (
        typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now()
    );

    const parseModel = content => {
        if (content && typeof content === 'object') return content;
        if (typeof content !== 'string' || !content.trim()) return null;
        try {
            return typeof autoParseJSON === 'function'
                ? autoParseJSON(content, false)
                : JSON.parse(content);
        } catch (error) {
            console.warn('[Lightflow Lifecycle] Could not parse the project model.', error);
            return null;
        }
    };

    const captureModel = (project, model) => {
        if (!project || !model || typeof model !== 'object') return null;
        modelByProject.set(project, model);
        return model;
    };

    const readProjectModel = project => {
        if (!project) return Promise.resolve(null);
        const captured = modelByProject.get(project);
        if (captured) return Promise.resolve(captured);
        const pending = modelRequestByProject.get(project);
        if (pending) return pending;

        const path = project.save_path || project.path || '';
        if (!path || typeof Blockbench?.read !== 'function') return Promise.resolve(null);

        const request = new Promise(resolve => {
            let settled = false;
            const fallbackTimer = setTimeout(() => finish(null), 5000);
            const finish = value => {
                if (settled) return;
                settled = true;
                clearTimeout(fallbackTimer);
                resolve(value || null);
            };
            try {
                const result = Blockbench.read([path], { errorbox: false }, files => {
                    const model = parseModel(files?.[0]?.content);
                    if (model) captureModel(project, model);
                    finish(model);
                });
                if (result === false) finish(null);
            } catch (error) {
                console.warn('[Lightflow Lifecycle] Could not read the project model.', error);
                finish(null);
            }
        });
        modelRequestByProject.set(project, request);
        return request;
    };

    const isCurrent = (project, expectedGeneration = generation) => {
        return !disposed && expectedGeneration === generation && project === activeProject && project === window.Project;
    };

    const runHydrator = async (entry, reason) => {
        if (!entry || entry.lastGeneration === generation) return;
        const runGeneration = generation;
        const project = activeProject;
        entry.lastGeneration = runGeneration;
        let model = project ? (modelByProject.get(project) || null) : null;
        if (project && !model && (project.save_path || project.path)) {
            model = await readProjectModel(project);
        }
        if (disposed || runGeneration !== generation || project !== activeProject) return;
        const startedAt = lifecycleNow();
        try {
            await entry.callback({
                project,
                model,
                reason,
                generation: runGeneration,
                isCurrent: () => isCurrent(project, runGeneration)
            });
        } catch (error) {
            console.warn(`[Lightflow] Project hydration failed for ${entry.id}`, error);
        } finally {
            if (!disposed && runGeneration === generation) {
                const elapsed = Math.max(0, lifecycleNow() - startedAt);
                lifecycleMetrics.hydrators[entry.id] = {
                    generation: runGeneration,
                    reason,
                    durationMs: elapsed
                };
            }
        }
    };

    const cancelHydrationQueue = () => {
        if (typeof hydrationFrame === 'number' && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(hydrationFrame);
        } else if (hydrationFrame?.type === 'timeout') {
            clearTimeout(hydrationFrame.id);
        }
        hydrationFrame = null;
        hydrationQueue.length = 0;
    };

    const getHydratorPriority = entry => {
        const priorities = {
            light_manager_elements: 0,
            shader_architect: 1,
            lightflow_environment: 2,
            lightflow_atmosphere: 3,
            studio_render: 4
        };
        return priorities[entry?.id] ?? 10;
    };

    const hydrateAll = reason => {
        cancelHydrationQueue();
        const hydrateGeneration = generation;
        lifecycleMetrics.hydrationStartedAt = lifecycleNow();
        lifecycleMetrics.lastReason = reason || '';
        hydrationQueue = Array.from(hydrators.values())
            .filter(entry => entry.lastGeneration !== hydrateGeneration)
            .sort((left, right) => getHydratorPriority(left) - getHydratorPriority(right));

        const runNext = () => {
            hydrationFrame = null;
            if (disposed || hydrateGeneration !== generation) {
                hydrationQueue.length = 0;
                return;
            }
            const entry = hydrationQueue.shift();
            if (!entry) {
                lifecycleMetrics.lastHydrationMs = Math.max(
                    0,
                    lifecycleNow() - lifecycleMetrics.hydrationStartedAt
                );
                lifecycleMetrics.lastCompletedGeneration = hydrateGeneration;
                return;
            }
            Promise.resolve(runHydrator(entry, reason)).finally(() => {
                if (disposed || hydrateGeneration !== generation || !hydrationQueue.length) {
                    hydrationQueue.length = 0;
                    if (!disposed && hydrateGeneration === generation) {
                        lifecycleMetrics.lastHydrationMs = Math.max(
                            0,
                            lifecycleNow() - lifecycleMetrics.hydrationStartedAt
                        );
                        lifecycleMetrics.lastCompletedGeneration = hydrateGeneration;
                    }
                    return;
                }
                if (typeof requestAnimationFrame === 'function') {
                    hydrationFrame = requestAnimationFrame(runNext);
                } else {
                    const id = setTimeout(runNext, 0);
                    hydrationFrame = { type: 'timeout', id };
                }
            });
        };

        runNext();
    };

    const notifyDeferredTransition = reason => {
        const transitionGeneration = generation;
        const project = activeProject;
        hydrators.forEach(entry => {
            try {
                Promise.resolve(entry.callback({
                    project,
                    model: project ? (modelByProject.get(project) || null) : null,
                    reason,
                    deferred: true,
                    generation: transitionGeneration,
                    isCurrent: () => isCurrent(project, transitionGeneration)
                })).catch(error => {
                    console.warn(`[Lightflow] Project transition failed for ${entry.id}`, error);
                });
            } catch (error) {
                console.warn(`[Lightflow] Project transition failed for ${entry.id}`, error);
            }
        });
    };

    const begin = (project, reason, model, options = {}) => {
        const nextProject = project || null;
        if (model && nextProject) captureModel(nextProject, model);
        const changed = nextProject !== activeProject || options.force === true;
        if (changed) {
            cancelHydrationQueue();
            if (typeof geometryReadyFrame === 'number' && typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(geometryReadyFrame);
            }
            geometryReadyFrame = null;
            geometrySelectionRevision = 0;
            geometryQuietFrames = 0;
            activeProject = nextProject;
            generation += 1;
            lifecycleMetrics.transitionStartedAt = lifecycleNow();
            lifecycleMetrics.lastReason = reason || '';
        }
        if (changed && options.deferHydration === true) {
            notifyDeferredTransition(reason);
        } else if (changed || options.hydrate === true) {
            hydrateAll(reason);
        }
    };

    const scheduleGeometryReadyHydration = project => {
        if (
            !project ||
            project !== activeProject ||
            !projectsAwaitingGeometry.has(project)
        ) return;
        if (typeof geometryReadyFrame === 'number' && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(geometryReadyFrame);
        }
        cancelHydrationQueue();
        geometryReadyFrame = null;

        const readyGeneration = generation;
        const readyRevision = geometrySelectionRevision;
        const settleGeometry = () => {
            geometryReadyFrame = null;
            if (
                disposed ||
                readyGeneration !== generation ||
                project !== activeProject ||
                project !== window.Project ||
                !projectsAwaitingGeometry.has(project)
            ) return;
            if (readyRevision !== geometrySelectionRevision) {
                geometryQuietFrames = 0;
                scheduleGeometryReadyHydration(project);
                return;
            }
            geometryQuietFrames += 1;
            if (geometryQuietFrames < 2) {
                scheduleGeometryReadyHydration(project);
                return;
            }
            geometryQuietFrames = 0;
            projectsAwaitingGeometry.delete(project);
            begin(project, 'project_geometry_ready', null, { hydrate: true });
        };
        if (typeof requestAnimationFrame === 'function') {
            geometryReadyFrame = requestAnimationFrame(settleGeometry);
        } else {
            geometryReadyFrame = 'microtask';
            queueMicrotask(settleGeometry);
        }
    };

    const registerHydrator = (id, callback) => {
        const entry = { id, callback, lastGeneration: -1 };
        hydrators.set(id, entry);
        Promise.resolve().then(() => runHydrator(entry, 'plugin_ready'));
        return {
            delete() {
                if (hydrators.get(id) === entry) hydrators.delete(id);
                if (!ownerAttached && hydrators.size === 0) disposeRuntime();
            }
        };
    };

    const restoreCustomElements = (model, type, ElementType) => {
        if (!model || !Array.isArray(model.elements) || !ElementType || !window.Outliner) {
            return { restored: 0, updated: 0 };
        }
        let restored = 0;
        let updated = 0;
        model.elements.filter(template => template?.type === type && template.uuid).forEach(template => {
            const existing = (Outliner.elements || []).find(element => element?.uuid === template.uuid);
            if (existing instanceof ElementType) {
                existing.extend?.(template);
                updated += 1;
                return;
            }

            const parent = existing?.parent || 'root';
            const parentArray = existing?.getParentArray?.() || (parent === 'root' ? Outliner.root : parent?.children);
            const index = Array.isArray(parentArray) ? parentArray.indexOf(existing) : -1;
            const wasSelected = !!existing?.selected;
            existing?.remove?.();

            const replacement = new ElementType(template, template.uuid).init();
            replacement.addTo(parent, index >= 0 ? index : -1);
            replacement.preview_controller?.updateTransform?.(replacement);
            if (wasSelected) replacement.markAsSelected?.();
            restored += 1;
        });
        if (restored && typeof Blockbench?.dispatchEvent === 'function') {
            Blockbench.dispatchEvent('update_selection');
        }
        return { restored, updated };
    };

    if (typeof Blockbench?.on === 'function') {
        listeners.push(Blockbench.on('load_project', event => {
            const project = window.Project || activeProject;
            if (project && event?.model) captureModel(project, event.model);
            begin(project, 'load_project', event?.model, { force: true, deferHydration: true });
        }));
        listeners.push(Blockbench.on('select_project', event => {
            const project = event?.project || window.Project || null;
            begin(project, 'select_project', null, { force: true, deferHydration: true });
            const selectedGeneration = generation;
            Promise.resolve().then(() => {
                if (disposed || selectedGeneration !== generation || project !== activeProject) return;
                if (
                    project &&
                    (parsingProjects.has(project) || projectsAwaitingGeometry.has(project))
                ) return;
                begin(project, 'select_project_ready', null, { hydrate: true });
            });
        }));
        listeners.push(Blockbench.on('new_project', event => {
            begin(event?.project || window.Project || null, 'new_project', null, { force: true, hydrate: true });
        }));
        listeners.push(Blockbench.on('close_project', () => {
            // Blockbench emits close_project before it clears ProjectData and
            // Outliner registries. Cancel old work immediately, then hydrate
            // the empty state once its synchronous close cleanup has run.
            begin(null, 'close_project', null, { force: true, deferHydration: true });
            const closeGeneration = generation;
            Promise.resolve().then(() => {
                if (disposed || closeGeneration !== generation || activeProject !== null) return;
                begin(null, 'close_project_ready', null, { hydrate: true });
            });
        }));
    }
    const parsingListener = window.Codecs?.project?.on?.('parse', () => {
        const project = window.Project || activeProject;
        if (project) parsingProjects.add(project);
    });
    if (parsingListener) listeners.push(parsingListener);
    const parsedListener = window.Codecs?.project?.on?.('parsed', () => {
        const project = window.Project || activeProject;
        if (project) parsingProjects.delete(project);
        if (project) {
            projectsAwaitingGeometry.add(project);
            geometryQuietFrames = 0;
            scheduleGeometryReadyHydration(project);
        }
    });
    if (parsedListener) listeners.push(parsedListener);
    listeners.push(Blockbench.on('update_selection', () => {
        const project = window.Project || activeProject;
        if (
            project &&
            project === activeProject &&
            (parsingProjects.has(project) || projectsAwaitingGeometry.has(project))
        ) {
            geometrySelectionRevision += 1;
        }
        if (
            !project ||
            project !== activeProject ||
            !projectsAwaitingGeometry.has(project)
        ) return;
        geometryQuietFrames = 0;
        scheduleGeometryReadyHydration(project);
    }));

    const disposeRuntime = () => {
        if (disposed) return;
        disposed = true;
        generation += 1;
        if (typeof geometryReadyFrame === 'number' && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(geometryReadyFrame);
        }
        geometryReadyFrame = null;
        geometryQuietFrames = 0;
        hydrators.clear();
        listeners.splice(0).forEach(listener => listener?.delete?.());
        if (window.LightflowLifecycle === runtimeApi) delete window.LightflowLifecycle;
    };

    runtimeApi = {
        apiVersion: 1,
        get disposed() { return disposed; },
        get hydratorCount() { return hydrators.size; },
        get generation() { return generation; },
        get project() { return activeProject; },
        snapshot() {
            return {
                generation,
                projectId: activeProject?.uuid || activeProject?.id || activeProject?.name || null,
                lastReason: lifecycleMetrics.lastReason,
                hydrateProjectMs: lifecycleMetrics.lastHydrationMs,
                transitionAgeMs: lifecycleMetrics.transitionStartedAt
                    ? Math.max(0, lifecycleNow() - lifecycleMetrics.transitionStartedAt)
                    : 0,
                lastCompletedGeneration: lifecycleMetrics.lastCompletedGeneration,
                pendingHydrators: hydrationQueue.length,
                hydrationScheduled: hydrationFrame !== null,
                geometryReadyScheduled: geometryReadyFrame !== null,
                hydrators: Object.assign({}, lifecycleMetrics.hydrators)
            };
        },
        captureModel,
        readProjectModel,
        isCurrent,
        registerHydrator,
        restoreCustomElements,
        attachOwner() {
            if (!disposed) ownerAttached = true;
        },
        releaseOwner() {
            ownerAttached = false;
            if (hydrators.size === 0) disposeRuntime();
        },
        dispose: disposeRuntime
    };
    return runtimeApi;
}

const LIGHT_MANAGER_STORAGE_KEYS = {
    areaGizmos: 'light_manager_show_area_gizmos'
};

const LIGHT_MANAGER_SHADOW_RESOLUTIONS = [256, 512, 1024, 2048, 4096];
const LIGHT_MANAGER_STUDIO_SHADOW_RESOLUTIONS = [256, 512, 1024, 2048, 4096, 8192, 16384];
const LIGHT_MANAGER_SHADOW_NORMAL_BIAS_DEFAULTS = {
    256: 0.3,
    512: 0.05,
    1024: 0.01,
    2048: 0.01,
    4096: 0.01
};
const LIGHT_MANAGER_SHADOW_NORMAL_BIAS_LEGACY_DEFAULTS = [0.012, 0.008];
// Three.js normalBias is expressed in world units. Voxel faces and grazing
// directional light need several texels of separation to eliminate acne
// reliably; the previous 0.72-texel calibration was consistently too small.
const LIGHT_MANAGER_NORMAL_BIAS_TEXEL_FACTOR = 4.4;
const LIGHT_MANAGER_LEGACY_NORMAL_BIAS_TEXEL_FACTOR = 0.72;
const LIGHT_MANAGER_AUTO_NORMAL_BIAS_PROPERTIES = [
    'light_type',
    'shadow_resolution',
    'shadow_bounds',
    'shadow_near',
    'shadow_far',
    'distance',
    'angle'
];

const DEFAULT_SHADOW_BIAS = -0.0005;
const DEFAULT_SHADOW_NORMAL_BIAS = 0.01;
const DEFAULT_SHADOW_SOFTNESS = 1.75;

const LIGHT_MANAGER_ACTION_IDS = [
    'add_art_key',
    'add_light',
    'add_spot_light',
    'add_directional_light',
    'edit_light_properties',
    'fit_light_bounds_to_selection',
    'light_manager_edit_tool',
    'light_manager_free_move',
    'toggle_light_area_gizmos'
];

// These IDs belonged to the pre-form Light Properties toolbars. Keep them only
// as cleanup targets so plugin reloads cannot leave obsolete BarItems behind.
const LIGHT_MANAGER_LEGACY_BAR_ITEM_IDS = [
    'light_type_select',
    'light_color_picker',
    'light_temperature_slider',
    'cast_shadows',
    'light_shadow_resolution_select',
    'light_studio_shadow_resolution_select',
    'light_intensity_slider',
    'light_distance_slider',
    'light_cone_angle_slider',
    'light_cone_penumbra_slider',
    'light_shadow_near_sliderbox',
    'light_shadow_far_sliderbox',
    'light_shadow_bounds_slider',
    'light_shadow_softness_sliderbox',
    'light_shadow_bias_sliderbox',
    'light_shadow_normal_bias_sliderbox'
];

const LIGHT_MANAGER_LEGACY_TOOLBAR_IDS = [
    'light_gizmo_tools',
    'light_quickbuttons',
    'light_shadow_quality',
    'light_settings',
    'light_shadow_clip_settings',
    'light_shadow_bounds_settings',
    'light_shadow_bias_settings'
];

function deleteLightManagerRegistryItem(registry, id) {
    if (!registry || !id) return;

    const item = registry[id];
    if (item && typeof item.delete === 'function') {
        try {
            item.delete();
        } catch (error) {
            console.warn(`[Light Manager] Failed to remove stale registry item "${id}".`, error);
        }
    }

    if (registry[id] === item) {
        delete registry[id];
    }
}

function cleanupLightManagerRegistries() {
    const barItems = typeof BarItems !== 'undefined' ? BarItems : window.BarItems;
    const toolbars = typeof Toolbars !== 'undefined' ? Toolbars : window.Toolbars;

    LIGHT_MANAGER_ACTION_IDS.forEach(id => deleteLightManagerRegistryItem(barItems, id));
    LIGHT_MANAGER_LEGACY_BAR_ITEM_IDS.forEach(id => deleteLightManagerRegistryItem(barItems, id));
    LIGHT_MANAGER_LEGACY_TOOLBAR_IDS.forEach(id => deleteLightManagerRegistryItem(toolbars, id));
}

function removeLightManagerLegacyStoredToolbarLayouts() {
    const bars = typeof BARS !== 'undefined' ? BARS : window.BARS;

    if (bars && bars.stored) {
        LIGHT_MANAGER_LEGACY_TOOLBAR_IDS.forEach(id => delete bars.stored[id]);
    }

    if (typeof localStorage !== 'undefined') {
        try {
            const storedToolbars = JSON.parse(localStorage.getItem('toolbars') || '{}');
            let changed = false;
            LIGHT_MANAGER_LEGACY_TOOLBAR_IDS.forEach(id => {
                if (!Object.prototype.hasOwnProperty.call(storedToolbars, id)) return;
                delete storedToolbars[id];
                changed = true;
            });
            if (changed) localStorage.setItem('toolbars', JSON.stringify(storedToolbars));
        } catch (error) {
            console.warn('[Light Manager] Stored toolbar data is invalid; live registries were still cleaned.', error);
        }
    }
}

const LIGHT_MANAGER_SHADOW_STATE = {
    dirty: true,
    sceneDirty: true,
    allLightsDirty: true,
    dirtyLightUuids: new Set(),
    shadowSignatures: null,
    dirtyRenderers: new Set(),
    configuredRenderers: new Set(),
    previousRendererShadowSettings: new WeakMap(),
    rendererLimits: new WeakMap(),
    rendererLimitListeners: new Map()
};

const LIGHT_MANAGER_SHADOW_DEBUG_STATE = {
    lastLogs: new Map()
};

// A point-light shadow is six shadow renders and also expands every lit Three
// program by another cube-shadow slot. Large art scenes can otherwise ask ANGLE
// to link 90-100 KB fragment programs and block the UI for minutes. Studio keeps
// the authored set; the realtime preview retains the three most influential
// requested point shadows and leaves every light's illumination intact.
const LIGHT_MANAGER_PREVIEW_POINT_SHADOW_LIMIT = 3;
const LIGHT_MANAGER_PREVIEW_SHADOW_BUDGET_STATE = {
    allowedPointUuids: new Set(),
    cameraPosition: new THREE.Vector3(),
    lightPosition: new THREE.Vector3()
};

function writeLightManagerDebugLog(label, payload) {
    if (typeof console === 'undefined') return;
    if (typeof console.debug !== 'function') return;
    console.debug(label, JSON.stringify(payload));
}

const LIGHT_MANAGER_UPDATE_STATE = {
    frame: null,
    running: false,
    rerun: false,
    options: null,
    preparingLights: false,
    activeUuids: new Set(),
    worldPosition: new THREE.Vector3(),
    worldQuaternion: new THREE.Quaternion(),
    worldDirection: new THREE.Vector3()
};

const LIGHT_MANAGER_DEFAULT_UPDATE_OPTIONS = {
    shadows: true,
    scene: true,
    gizmos: true,
    studio: false,
    elements: null,
    cleanup: true,
    preserveTopology: true,
    render: true
};

const LIGHT_MANAGER_RETIRED_LIGHT_STATE = {
    entries: [],
    maxEntries: 8
};

/*
 * LightElement is the persisted/UI-facing model. Changes converge through
 * update_light_element_callback, which synchronizes the owned THREE lights,
 * invalidates shadows, refreshes gizmos, and finally notifies Shader Architect.
 */

function disposeLightManagerThreeLightObject(light) {
    if (!light) return;
    if (light.parent) light.parent.remove(light);
    if (light.target?.parent) light.target.parent.remove(light.target);
    if (light.shadow?.map) {
        light.shadow.map.dispose?.();
        light.shadow.map = null;
    }
    light.dispose?.();
}

function disposeRetiredLightManagerLights() {
    LIGHT_MANAGER_RETIRED_LIGHT_STATE.entries.splice(0).forEach(entry => {
        disposeLightManagerThreeLightObject(entry.light);
    });
}

function retireLightManagerThreeLight(light) {
    if (!light || light.userData?.lightflowEnvironmentVirtual) return false;
    if (LIGHT_MANAGER_RETIRED_LIGHT_STATE.entries.some(entry => entry.light === light)) return true;

    light.userData = light.userData || {};
    light.userData.lightManagerRetired = true;
    light.visible = true;
    light.intensity = 0;

    const shadowAutoUpdate = light.shadow?.autoUpdate;
    if (light.shadow) {
        light.shadow.autoUpdate = false;
        light.shadow.needsUpdate = false;
        // The shader topology depends on castShadow, not on retaining a large
        // GPU target. Release the map while the zero-intensity slot is parked.
        if (light.shadow.map) {
            light.shadow.map.dispose?.();
            light.shadow.map = null;
        }
    }

    LIGHT_MANAGER_RETIRED_LIGHT_STATE.entries.push({
        light,
        constructor: light.constructor,
        shadowAutoUpdate
    });

    while (
        LIGHT_MANAGER_RETIRED_LIGHT_STATE.entries.length >
        LIGHT_MANAGER_RETIRED_LIGHT_STATE.maxEntries
    ) {
        const evicted = LIGHT_MANAGER_RETIRED_LIGHT_STATE.entries.shift();
        disposeLightManagerThreeLightObject(evicted?.light);
    }
    return true;
}

function acquireRetiredLightManagerThreeLight(LightConstructor) {
    const index = LIGHT_MANAGER_RETIRED_LIGHT_STATE.entries.findIndex(entry =>
        entry.light && entry.constructor === LightConstructor
    );
    if (index < 0) return null;

    const [entry] = LIGHT_MANAGER_RETIRED_LIGHT_STATE.entries.splice(index, 1);
    const light = entry.light;
    if (light.userData) delete light.userData.lightManagerRetired;
    light.visible = true;
    if (light.shadow) {
        light.shadow.autoUpdate = entry.shadowAutoUpdate ?? false;
        light.shadow.needsUpdate = true;
    }
    return light;
}

function translateLightManager(key, fallback) {
    if (typeof tl !== 'function') return fallback || key;
    const value = tl(key);
    return value === key ? (fallback || key) : value;
}

function formatLightManagerMessage(key, values, fallback) {
    return translateLightManager(key, fallback).replace(/\{(\w+)\}/g, (match, name) => {
        return values && values[name] !== undefined ? values[name] : match;
    });
}

function formatLightManagerCount(count, singularKey, pluralKey) {
    return formatLightManagerMessage(count === 1 ? singularKey : pluralKey, { count });
}

function resetLightManagerShadowState() {
    if (typeof LIGHT_MANAGER_PREVIEW_SHADOW_BUDGET_STATE !== 'undefined') {
        LIGHT_MANAGER_PREVIEW_SHADOW_BUDGET_STATE.allowedPointUuids.clear();
    }
    LIGHT_MANAGER_SHADOW_STATE.rendererLimitListeners.forEach((entry) => {
        entry.canvas.removeEventListener?.('webglcontextrestored', entry.invalidate);
    });
    LIGHT_MANAGER_SHADOW_STATE.rendererLimitListeners.clear();
    LIGHT_MANAGER_SHADOW_STATE.rendererLimits = new WeakMap();
    LIGHT_MANAGER_SHADOW_STATE.dirty = true;
    LIGHT_MANAGER_SHADOW_STATE.sceneDirty = true;
    LIGHT_MANAGER_SHADOW_STATE.allLightsDirty = true;
    LIGHT_MANAGER_SHADOW_STATE.dirtyLightUuids.clear();
    LIGHT_MANAGER_SHADOW_STATE.shadowSignatures = null;
    LIGHT_MANAGER_SHADOW_STATE.dirtyRenderers = new Set();
    LIGHT_MANAGER_SHADOW_STATE.configuredRenderers = new Set();
    LIGHT_MANAGER_SHADOW_STATE.previousRendererShadowSettings = new WeakMap();
    LIGHT_MANAGER_SHADOW_DEBUG_STATE.lastLogs.clear();
}

function markLightManagerShadowsDirty(options = {}) {
    LIGHT_MANAGER_SHADOW_STATE.dirty = true;
    LIGHT_MANAGER_SHADOW_STATE.dirtyRenderers.clear();
    if (options.scene) LIGHT_MANAGER_SHADOW_STATE.sceneDirty = true;
    const elements = Array.isArray(options.elements)
        ? options.elements.filter(element => element?.uuid)
        : (options.element?.uuid ? [options.element] : []);
    if (elements.length && options.all !== true) {
        elements.forEach(element => LIGHT_MANAGER_SHADOW_STATE.dirtyLightUuids.add(element.uuid));
    } else {
        LIGHT_MANAGER_SHADOW_STATE.allLightsDirty = true;
        LIGHT_MANAGER_SHADOW_STATE.dirtyLightUuids.clear();
    }
}

function lightManagerHasActiveShadowLights() {
    const hasElementRegistry = !!(window.LightElement && Array.isArray(LightElement.all));
    const hasElementShadowLight = hasElementRegistry
        ? LightElement.all.some(element => {
            return element && isLightManagerElementHierarchyVisible(element) && element.has_shadow !== false;
        })
        : false;

    if (hasElementShadowLight) return true;

    /*
     * Environment lights are deliberately virtual: they live in the THREE
     * scene/three_lights registry but not in LightElement.all. Looking only at
     * outliner lights disabled the renderer shadow map and caster/receiver
     * preparation until an unrelated LightElement also enabled shadows.
     */
    const environmentLight =
        window.LightflowEnvironment?.getDirectionalLight?.() ||
        window.LightflowEnvironmentSunLight ||
        null;
    if (
        environmentLight &&
        environmentLight.visible !== false &&
        environmentLight.castShadow === true &&
        environmentLight.shadow
    ) {
        return true;
    }

    return Object.values(window.three_lights || {}).some(light => {
        return !!(
            light &&
            light.visible !== false &&
            light.castShadow === true &&
            light.shadow &&
            (!hasElementRegistry || light.userData?.lightflowEnvironmentVirtual)
        );
    });
}

function isLightManagerElementHierarchyVisible(element) {
    if (!element || element.visibility === false) return false;
    const visited = new Set();
    let parent = element.parent;
    while (parent && parent !== 'root' && typeof parent === 'object') {
        if (visited.has(parent)) break;
        visited.add(parent);
        if (parent.visibility === false) return false;
        parent = parent.parent;
    }
    return true;
}

function getLightManagerPreviewPointShadowSet(options = {}) {
    const renderOptions = normalizeLightManagerUpdateOptions(options);
    if (
        renderOptions.studio ||
        window.LightManagerStudioRenderSession ||
        window.LightManagerStudioRenderActive
    ) return null;
    const elements = window.LightElement && Array.isArray(LightElement.all)
        ? LightElement.all
        : [];
    const preview = renderOptions.preview || window.Preview?.selected || window.main_preview || null;
    const cameraPosition = preview?.camera?.getWorldPosition && window.THREE
        ? preview.camera.getWorldPosition(LIGHT_MANAGER_PREVIEW_SHADOW_BUDGET_STATE.cameraPosition)
        : preview?.camera?.position || null;
    const candidates = elements.filter(element => {
        if (!element || element.light_type !== 'point') return false;
        if (element.has_shadow === false || !isLightManagerElementHierarchyVisible(element)) return false;
        const light = window.three_lights?.[element.uuid];
        return !!(light && light.shadow);
    }).map(element => {
        const light = window.three_lights[element.uuid];
        const intensity = Math.max(0, Number(element.render_intensity ?? element.intensity) || 0);
        let distance = 0;
        if (cameraPosition && light?.getWorldPosition && window.THREE) {
            const position = light.getWorldPosition(
                LIGHT_MANAGER_PREVIEW_SHADOW_BUDGET_STATE.lightPosition
            );
            distance = position.distanceTo(cameraPosition);
        }
        const range = Math.max(8, Number(element.distance) || 64);
        // A small hysteresis bonus prevents two similarly influential torches
        // from exchanging shadow slots on every tiny camera movement.
        const retained = LIGHT_MANAGER_PREVIEW_SHADOW_BUDGET_STATE.allowedPointUuids.has(element.uuid);
        const score = intensity / (1 + distance / range) * (retained ? 1.12 : 1);
        return { element, score };
    });
    candidates.sort((left, right) => (
        right.score - left.score || String(left.element.uuid).localeCompare(String(right.element.uuid))
    ));
    const allowed = new Set(
        candidates.slice(0, LIGHT_MANAGER_PREVIEW_POINT_SHADOW_LIMIT)
            .map(entry => entry.element.uuid)
    );
    LIGHT_MANAGER_PREVIEW_SHADOW_BUDGET_STATE.allowedPointUuids = allowed;
    return allowed;
}

function applyLightManagerPreviewShadowBudget(options = {}) {
    const allowedPointShadows = getLightManagerPreviewPointShadowSet(options);
    let changed = false;
    const suppressed = [];
    const elements = window.LightElement && Array.isArray(LightElement.all)
        ? LightElement.all
        : [];
    elements.forEach(element => {
        if (!element?.uuid || element.light_type === 'art_key') return;
        const light = window.three_lights?.[element.uuid];
        if (!light) return;
        light.userData = light.userData || {};
        const requested = element.has_shadow !== false && isLightManagerElementHierarchyVisible(element);
        const budgetSuppressed = !!(
            allowedPointShadows && element.light_type === 'point' && requested &&
            !allowedPointShadows.has(element.uuid)
        );
        if (light.userData.lightManagerPreviewShadowSuppressed !== budgetSuppressed) {
            light.userData.lightManagerPreviewShadowSuppressed = budgetSuppressed;
            changed = true;
        }
        const desiredCastShadow = requested && !budgetSuppressed;
        if (light.castShadow !== desiredCastShadow) {
            light.castShadow = desiredCastShadow;
            changed = true;
        }
        if (light.shadow && budgetSuppressed) {
            light.shadow.autoUpdate = false;
            light.shadow.needsUpdate = false;
        }
        if (budgetSuppressed) suppressed.push(element.uuid);
    });
    window.LightManagerPreviewShadowBudget = {
        pointLimit: LIGHT_MANAGER_PREVIEW_POINT_SHADOW_LIMIT,
        suppressed,
        studio: allowedPointShadows === null
    };
    return changed;
}

function lightManagerShadowValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric * 1000) / 1000;
}

function lightManagerShadowVector(values = []) {
    return [
        lightManagerShadowValue(values[0]),
        lightManagerShadowValue(values[1]),
        lightManagerShadowValue(values[2])
    ].join(',');
}

function getLightManagerShadowSignatures() {
    const elements = window.LightElement && Array.isArray(LightElement.all) ? LightElement.all : [];
    const signatures = new Map();
    elements.forEach(element => {
            if (!element) return null;

            const mesh = element.mesh;
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();

            if (mesh) {
                mesh.updateMatrixWorld?.(true);
                mesh.getWorldPosition(position);
                mesh.getWorldQuaternion(quaternion);
            } else {
                position.fromArray(Array.isArray(element.position) ? element.position : [0, 0, 0]);
                const rotation = Array.isArray(element.render_rotation) ? element.render_rotation : element.rotation;
                if (Array.isArray(rotation)) {
                    const euler = new THREE.Euler(
                        THREE.MathUtils.degToRad(rotation[0] || 0),
                        THREE.MathUtils.degToRad(rotation[1] || 0),
                        THREE.MathUtils.degToRad(rotation[2] || 0)
                    );
                    quaternion.setFromEuler(euler);
                }
            }

            signatures.set(element.uuid, [
                element.uuid || element.name || '',
                isLightManagerElementHierarchyVisible(element) ? 1 : 0,
                element.has_shadow !== false ? 1 : 0,
                element.light_type || 'point',
                lightManagerShadowVector(position.toArray()),
                [
                    lightManagerShadowValue(quaternion.x),
                    lightManagerShadowValue(quaternion.y),
                    lightManagerShadowValue(quaternion.z),
                    lightManagerShadowValue(quaternion.w)
                ].join(','),
                lightManagerShadowValue(element.distance),
                lightManagerShadowValue(element.angle),
                lightManagerShadowValue(element.penumbra),
                lightManagerShadowValue(element.shadow_resolution),
                lightManagerShadowValue(element.studio_shadow_resolution),
                lightManagerShadowValue(element.shadow_bias),
                lightManagerShadowValue(element.shadow_normal_bias),
                lightManagerShadowValue(element.shadow_softness),
                lightManagerShadowValue(element.shadow_near),
                lightManagerShadowValue(element.shadow_far),
                lightManagerShadowValue(element.shadow_bounds)
            ].join('|'));
        });
    return signatures;
}

function rememberLightManagerRendererShadowSettings(renderer) {
    if (!renderer || !renderer.shadowMap || LIGHT_MANAGER_SHADOW_STATE.configuredRenderers.has(renderer)) return;

    LIGHT_MANAGER_SHADOW_STATE.configuredRenderers.add(renderer);
    LIGHT_MANAGER_SHADOW_STATE.previousRendererShadowSettings.set(renderer, {
        enabled: renderer.shadowMap.enabled,
        type: renderer.shadowMap.type,
        autoUpdate: renderer.shadowMap.autoUpdate
    });
}

function restoreLightManagerRendererShadowSettings() {
    LIGHT_MANAGER_SHADOW_STATE.configuredRenderers.forEach(renderer => {
        const previous = LIGHT_MANAGER_SHADOW_STATE.previousRendererShadowSettings.get(renderer);
        if (!renderer || !renderer.shadowMap || !previous) return;

        renderer.shadowMap.enabled = previous.enabled;
        renderer.shadowMap.type = previous.type;
        renderer.shadowMap.autoUpdate = previous.autoUpdate;
        renderer.shadowMap.needsUpdate = true;
    });
}

const LIGHT_MANAGER_PROFILES = {
    keep: null,
    point_fill: {
        light_type: 'point',
        intensity: 1.4,
        distance: 0,
        angle: 45,
        penumbra: 0,
        has_shadow: true,
        shadow_resolution: 1024,
        shadow_bias: DEFAULT_SHADOW_BIAS,
        shadow_normal_bias: DEFAULT_SHADOW_NORMAL_BIAS,
        shadow_softness: 2.25,
        shadow_near: 0.05,
        shadow_far: 24,
        shadow_bounds: 35
    },
    spot_key: {
        light_type: 'spot',
        intensity: 2.5,
        distance: 0,
        angle: 32,
        penumbra: 0.35,
        has_shadow: true,
        shadow_resolution: 1024,
        shadow_bias: DEFAULT_SHADOW_BIAS,
        shadow_normal_bias: DEFAULT_SHADOW_NORMAL_BIAS,
        shadow_softness: 2,
        shadow_near: 0.1,
        shadow_far: 32,
        shadow_bounds: 35
    },
    directional_sun: {
        light_type: 'directional',
        intensity: 1.0,
        distance: 0,
        angle: 45,
        penumbra: 0,
        has_shadow: true,
        shadow_resolution: 2048,
        shadow_bias: DEFAULT_SHADOW_BIAS,
        shadow_normal_bias: DEFAULT_SHADOW_NORMAL_BIAS,
        shadow_softness: DEFAULT_SHADOW_SOFTNESS,
        shadow_near: 0.1,
        shadow_far: 240,
        shadow_bounds: 48
    },
    minecraft_optimized: {
        light_type: 'directional',
        intensity: 1.2,
        distance: 0,
        angle: 45,
        penumbra: 0,
        has_shadow: true,
        shadow_resolution: 4096,
        shadow_bias: -0.00035,
        shadow_normal_bias: 0.008,
        shadow_softness: 1.35,
        shadow_near: 0.1,
        shadow_far: 200,
        shadow_bounds: 48
    }
};

const LIGHT_MANAGER_SHADOW_PRESETS = {
    custom: null,
    off: { has_shadow: false },
    preview: { has_shadow: true, shadow_resolution: 512, shadow_bias: -0.0005, shadow_normal_bias: 0.05, shadow_softness: 2.5 },
    balanced: { has_shadow: true, shadow_resolution: 1024, shadow_bias: -0.0005, shadow_normal_bias: 0.01, shadow_softness: 2 },
    crisp: { has_shadow: true, shadow_resolution: 4096, shadow_bias: -0.00035, shadow_normal_bias: 0.008, shadow_softness: 1.35 },
    minecraft: { has_shadow: true, shadow_resolution: 4096, shadow_bias: -0.00035, shadow_normal_bias: 0.008, shadow_softness: 1.35, shadow_near: 0.1, shadow_far: 200, shadow_bounds: 48 },
};

function lightManagerSafeGet(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
    } catch (error) {
        warnLightManagerOnce('storage-read', '[Light Manager] Local storage is unavailable; defaults will be used.', error);
        return fallback;
    }
}

function lightManagerSafeSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (error) {
        warnLightManagerOnce('storage-write', '[Light Manager] Local storage is unavailable; settings will not persist.', error);
    }
}

function lightManagerFallbackIconDataUrl(label, color = '#ffffff') {
    const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">',
        '<rect width="128" height="128" rx="28" fill="rgba(0,0,0,0)"/>',
        `<circle cx="64" cy="64" r="38" fill="none" stroke="${color}" stroke-width="10"/>`,
        `<text x="64" y="74" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="${color}">${label}</text>`,
        '</svg>'
    ].join('');
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const LightManagerUtils = {
    num(value, fallback = 0, min = -Infinity, max = Infinity) {
        const parsed = Number(value);
        const safe = Number.isFinite(parsed) ? parsed : fallback;
        return Math.max(min, Math.min(max, safe));
    },

    int(value, fallback = 0, min = -Infinity, max = Infinity) {
        return Math.round(this.num(value, fallback, min, max));
    },

    bool(value, fallback = false) {
        if (typeof value === 'boolean') return value;
        if (value === 'true') return true;
        if (value === 'false') return false;
        return fallback;
    },

    lightType(value) {
        return ['point', 'directional', 'spot'].includes(value) ? value : 'point';
    },

    shadowResolution(value) {
        const parsed = this.int(value, 1024, 1);
        return LIGHT_MANAGER_SHADOW_RESOLUTIONS.includes(parsed) ? parsed : 1024;
    },

    shadowNormalBiasContext(source, overrides = {}) {
        const config = (source && typeof source === 'object') ? source : { shadow_resolution: source };
        const context = { ...config, ...overrides };
        const shadowNear = this.num(context.shadow_near, 0.1, 0, 99999);
        const shadowFar = Math.max(shadowNear + 0.001, this.num(context.shadow_far, 200, 0.001, 100000));

        return {
            light_type: this.lightType(context.light_type),
            shadow_resolution: this.shadowResolution(context.shadow_resolution),
            shadow_bounds: this.num(context.shadow_bounds, 35, 0.001, 100000),
            distance: this.num(context.distance, 0, 0, 100000),
            angle: this.num(context.angle, 45, 0.1, 89.9),
            shadow_near: shadowNear,
            shadow_far: shadowFar
        };
    },

    calculateShadowNormalBias(source, overrides = {}, texelFactor = LIGHT_MANAGER_NORMAL_BIAS_TEXEL_FACTOR) {
        const context = this.shadowNormalBiasContext(source, overrides);
        const resolution = Math.max(256, context.shadow_resolution);
        const depthRange = Math.max(0.001, context.shadow_far - context.shadow_near);
        let worldSpan;

        if (context.light_type === 'directional') {
            worldSpan = Math.max(0.001, context.shadow_bounds * 2);
        } else if (context.light_type === 'spot') {
            const usefulDepth = Math.min(
                depthRange,
                context.distance > 0 ? context.distance : depthRange
            );
            worldSpan = Math.max(
                0.001,
                usefulDepth * 2 * Math.tan(THREE.MathUtils.degToRad(context.angle))
            );
        } else {
            worldSpan = Math.max(
                0.001,
                Math.min(depthRange, context.distance > 0 ? context.distance : depthRange) * 2
            );
        }

        const worldUnitsPerTexel = worldSpan / resolution;
        const bias = worldUnitsPerTexel * Math.max(0, Number(texelFactor) || 0);
        return Math.round(Math.max(0.00025, Math.min(0.12, bias)) * 100000) / 100000;
    },

    defaultShadowNormalBias(source, overrides = {}) {
        return this.calculateShadowNormalBias(
            source,
            overrides,
            LIGHT_MANAGER_NORMAL_BIAS_TEXEL_FACTOR
        );
    },

    legacyShadowNormalBias(source, overrides = {}) {
        return this.calculateShadowNormalBias(
            source,
            overrides,
            LIGHT_MANAGER_LEGACY_NORMAL_BIAS_TEXEL_FACTOR
        );
    },

    defaultShadowBias(source, overrides = {}) {
        const context = this.shadowNormalBiasContext(source, overrides);
        const resolutionFactor = Math.pow(1024 / Math.max(256, context.shadow_resolution), 0.72);
        const depthRange = Math.max(0.001, context.shadow_far - context.shadow_near);
        const depthFactor = Math.max(0.35, Math.min(2.5, depthRange / 200));
        const boundsFactor = context.light_type === 'directional'
            ? Math.max(0.4, Math.min(3.0, context.shadow_bounds / 35))
            : 1.0;
        const bias = -0.0005 * resolutionFactor * depthFactor * boundsFactor;
        return Math.round(Math.max(-0.005, Math.min(-0.00002, bias)) * 1000000) / 1000000;
    },

    shadowBias(value, source) {
        const automaticValues = [DEFAULT_SHADOW_BIAS, -0.00035];
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || automaticValues.some(item => Math.abs(parsed - item) <= 0.000001)) {
            return this.defaultShadowBias(source);
        }
        return this.num(parsed, this.defaultShadowBias(source), -1, 1);
    },

    isAutomaticShadowNormalBiasValue(value, source = null) {
        if (value === undefined || value === null || value === '') return true;
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return true;
        const defaults = [
            ...Object.values(LIGHT_MANAGER_SHADOW_NORMAL_BIAS_DEFAULTS),
            ...LIGHT_MANAGER_SHADOW_NORMAL_BIAS_LEGACY_DEFAULTS
        ];
        if (source) {
            defaults.push(this.defaultShadowNormalBias(source));
            // Migrate values produced by Light Manager <= 1.6.0 instead of
            // mistaking them for intentional manual overrides.
            defaults.push(this.legacyShadowNormalBias(source));
        }
        return defaults.some(defaultValue => (
            Math.abs(parsed - defaultValue) <= 0.000001
        ));
    },

    shadowNormalBias(value, source) {
        const fallback = this.defaultShadowNormalBias(source);
        if (this.isAutomaticShadowNormalBiasValue(value, source)) return fallback;
        return this.num(value, fallback, -1, 1);
    },

    applyAutomaticShadowNormalBias(light, previousContext = light) {
        if (!light || !this.isAutomaticShadowNormalBiasValue(light.shadow_normal_bias, previousContext)) return false;
        const nextBias = this.defaultShadowNormalBias(light);
        if (Math.abs(Number(light.shadow_normal_bias) - nextBias) <= 0.000001) return false;
        light.shadow_normal_bias = nextBias;
        return true;
    },

    shadowSoftness(value) {
        return this.num(value, DEFAULT_SHADOW_SOFTNESS, 0, 16);
    },

    studioShadowResolution(value) {
        const parsed = this.int(value, 0, 0);
        if (parsed === 0) return 0;
        return LIGHT_MANAGER_STUDIO_SHADOW_RESOLUTIONS.includes(parsed) ? parsed : 0;
    },

    getRenderShadowResolution(element, options = {}) {
        const studio = !!(options && (options.studio || options.studioRender));
        const studioResolution = studio
            ? this.studioShadowResolution(element && element.studio_shadow_resolution)
            : 0;
        const requestedResolution = studioResolution > 0
            ? studioResolution
            : this.shadowResolution(element && element.shadow_resolution);
        const preview = options?.preview || (
            studio ? window.LightManagerStudioRenderPreview : null
        );
        const light = options?.light || (
            element?.uuid ? window.three_lights?.[element.uuid] : null
        );
        return getLightManagerLegalShadowResolution(
            light,
            requestedResolution,
            preview?.renderer || null
        ).logicalResolution;
    },

    colorArray(value, fallback = [255, 255, 255]) {
        const source = Array.isArray(value) ? value : fallback;
        return [
            this.int(source[0], fallback[0], 0, 255),
            this.int(source[1], fallback[1], 0, 255),
            this.int(source[2], fallback[2], 0, 255)
        ];
    },

    colorHex(value) {
        const color = this.colorArray(value);
        if (typeof tinycolor === 'function') {
            return tinycolor({ r: color[0], g: color[1], b: color[2] }).toHexString();
        }
        return `#${color.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
    },

    colorFromHex(value, fallback = [255, 255, 255]) {
        if (typeof tinycolor === 'function') {
            const color = tinycolor(value);
            if (color.isValid()) {
                const rgb = color.toRgb();
                return [rgb.r, rgb.g, rgb.b];
            }
        }

        if (typeof value === 'string') {
            const match = value.trim().match(/^#?([0-9a-f]{6})$/i);
            if (match) {
                return [
                    parseInt(match[1].slice(0, 2), 16),
                    parseInt(match[1].slice(2, 4), 16),
                    parseInt(match[1].slice(4, 6), 16)
                ];
            }
        }

        return this.colorArray(fallback);
    },

    resolveConfig(formResult, currentLight) {
        const base = {
            light_type: formResult.light_type,
            color: this.colorFromHex(formResult.color, currentLight?.color),
            intensity: formResult.intensity,
            key_light_enabled: formResult.key_light_enabled ?? currentLight?.key_light_enabled ?? true,
            key_light_weight: formResult.key_light_weight ?? currentLight?.key_light_weight ?? 1,
            distance: formResult.distance,
            angle: formResult.angle,
            penumbra: formResult.penumbra,
            has_shadow: formResult.has_shadow,
            shadow_resolution: formResult.shadow_resolution,
            studio_shadow_resolution: formResult.studio_shadow_resolution,
            shadow_bias: formResult.shadow_bias,
            shadow_normal_bias: formResult.shadow_normal_bias,
            shadow_softness: formResult.shadow_softness,
            shadow_near: formResult.shadow_near,
            shadow_far: formResult.shadow_far,
            shadow_bounds: formResult.shadow_bounds
        };

        const profile = LIGHT_MANAGER_PROFILES[formResult.profile];
        const shadowPreset = LIGHT_MANAGER_SHADOW_PRESETS[formResult.shadow_preset];

        return this.sanitizeConfig({
            ...base,
            ...(profile || {}),
            ...(shadowPreset || {}),
            color: base.color
        });
    },

    sanitizeConfig(config = {}) {
        const lightType = this.lightType(config.light_type);
        const shadowNear = this.num(config.shadow_near, 0.1, 0, 99999);
        const shadowFar = Math.max(shadowNear + 0.001, this.num(config.shadow_far, 200, 0.001, 100000));

        const shadowResolution = this.shadowResolution(config.shadow_resolution);
        const studioShadowResolution = this.studioShadowResolution(config.studio_shadow_resolution);
        const shadowBounds = this.num(config.shadow_bounds, 35, 0.001, 100000);
        const shadowContext = {
            ...config,
            light_type: lightType,
            shadow_resolution: shadowResolution,
            shadow_near: shadowNear,
            shadow_far: shadowFar,
            shadow_bounds: shadowBounds
        };

        return {
            light_type: lightType,
            color: this.colorArray(config.color),
            intensity: this.num(config.intensity, 1, 0, 100000),
            key_light_enabled: this.bool(config.key_light_enabled, true),
            key_light_weight: this.num(config.key_light_weight, 1, 0, 100),
            distance: this.num(config.distance, 0, 0, 100000),
            angle: this.num(config.angle, 45, 0.1, 89.9),
            penumbra: this.num(config.penumbra, 0, 0, 1),
            has_shadow: lightType !== 'art_key' && this.bool(config.has_shadow, true),
            shadow_resolution: shadowResolution,
            studio_shadow_resolution: studioShadowResolution,
            shadow_bias: this.num(config.shadow_bias, DEFAULT_SHADOW_BIAS, -1, 1),
            shadow_normal_bias: this.shadowNormalBias(config.shadow_normal_bias, shadowContext),
            shadow_softness: this.shadowSoftness(config.shadow_softness),
            shadow_near: shadowNear,
            shadow_far: shadowFar,
            shadow_bounds: shadowBounds
        };
    },

    sanitizeLight(light) {
        if (!light) return null;
        const config = this.sanitizeConfig(light);
        Object.assign(light, config);
        light.render_color = this.colorArray(light.render_color || light.color, config.color);
        light.render_intensity = this.num(light.render_intensity ?? light.intensity, config.intensity, 0, 100000);
        if (!Array.isArray(light.rotation)) light.rotation = [0, 0, 0];
        if (!Array.isArray(light.render_rotation)) light.render_rotation = light.rotation.slice();
        return light;
    },

    sanitizeArtKey(element) {
        if (!element) return null;
        element.light_type = 'art_key';
        element.color = this.colorArray(element.color, [255, 210, 140]);
        element.render_color = this.colorArray(element.render_color || element.color, element.color);
        element.intensity = this.num(element.intensity, 1, 0, 100000);
        element.render_intensity = this.num(element.render_intensity ?? element.intensity, element.intensity, 0, 100000);
        element.key_light_enabled = this.bool(element.key_light_enabled, true);
        element.key_light_weight = this.num(element.key_light_weight, 1, 0, 100);
        element.art_mode = element.art_mode === 'direction' ? 'direction' : 'point';
        element.art_scope = element.art_scope === 'include' ? 'include' : 'box';
        element.art_include = Array.isArray(element.art_include) ? element.art_include.filter(Boolean) : [];
        element.art_exclude = Array.isArray(element.art_exclude) ? element.art_exclude.filter(Boolean) : [];
        element.art_softness = this.num(element.art_softness, 0.15, 0, 1);
        element.art_radius = this.num(element.art_radius, 8, 0, 100000);
        if (!Array.isArray(element.origin)) element.origin = [0, 0, 0];
        if (!Array.isArray(element.rotation)) element.rotation = [0, 0, 0];
        if (!Array.isArray(element.scale)) element.scale = [1, 1, 1];
        element.scale = [0, 1, 2].map(i => this.num(element.scale[i], 1, 0.001, 100000));
        return element;
    },

    applyConfig(light, config) {
        if (!light) return;
        Object.assign(light, this.sanitizeConfig(config));
        light.render_color = light.color.slice();
        light.render_intensity = light.intensity;
        light.render_rotation = Array.isArray(light.rotation) ? light.rotation.slice() : [0, 0, 0];
    }
};




window.LightManagerArtKeys = {
    maxPerObject: 8,
    baseSize: 32,
    meshElementCache: new WeakMap(),
    frameCacheEnabled: true,
    frameState: null,
    performance: { frames: 0, resolutions: 0, cacheHits: 0, preparedKeys: 0 },
    beginFrame() {
        const previous = this.frameState;
        this.frameState = this.frameCacheEnabled
            ? { prepared: null, meshes: new WeakMap() } : null;
        this.performance.frames++;
        return previous;
    },
    endFrame(previous) {
        this.frameState = previous;
    },
    invalidateFrame() {
        if (this.frameState) {
            this.frameState.prepared = null;
            this.frameState.meshes = new WeakMap();
        }
    },
    prepareKeys() {
        // Independent of the receiving object: doing this in every draw used
        // to repeat hierarchy updates, inversion and allocations for every face
        // material, then repeat all of it for the silhouette pass.
        return this.active().map(element => {
            const mesh = element.mesh;
            mesh.updateWorldMatrix(true, false);
            const origin = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
            const rotation = mesh.getWorldQuaternion(new THREE.Quaternion());
            const native = element.type === 'art_key';
            const vector = native
                ? new THREE.Vector3(0, 0, -1).applyQuaternion(rotation)
                : new THREE.Vector3().fromArray(element.art_point || [0, 0, 0]).applyQuaternion(rotation);
            if (element.art_mode === 'direction') {
                if (vector.lengthSq() < 1e-8) vector.set(0, 0, -1);
                vector.normalize();
            } else if (native) vector.copy(origin);
            else vector.add(origin);
            this.performance.preparedKeys++;
            return {
                element, origin, vector, native,
                inverse: native ? mesh.matrixWorld.clone().invert() : rotation.clone().invert(),
                half: native ? [this.baseSize / 2, this.baseSize / 2, this.baseSize / 2]
                    : this.size(element).map(value => value / 2)
            };
        });
    },
    size(element) {
        if (element?.type === 'art_key') {
            return [0, 1, 2].map(i => this.baseSize * Math.max(0.001, Math.abs(Number(element.scale?.[i]) || 1)));
        }
        return [0, 1, 2].map(i => LightManagerUtils.num(element.art_size?.[i], 32, 0.01, 100000));
    },
    active() {
        const nativeKeys = Array.isArray(window.ArtKeyElement?.all) ? window.ArtKeyElement.all : [];
        const legacyKeys = (window.LightElement?.all || []).filter(element => element.light_type === 'art_key');
        return [...nativeKeys, ...legacyKeys].filter(element =>
            element.mesh && element.key_light_enabled !== false && Number(element.key_light_weight) > 0 &&
            isLightManagerElementHierarchyVisible(element));
    },
    boxVertices(element) {
        const half = this.size(element).map(v => v / 2), vertices = [];
        for (let axis = 0; axis < 3; axis++) {
            const a = (axis + 1) % 3, b = (axis + 2) % 3;
            for (const x of [-1, 1]) for (const y of [-1, 1]) {
                const p = [0, 0, 0]; p[a] = x * half[a]; p[b] = y * half[b];
                p[axis] = -half[axis]; vertices.push(...p);
                p[axis] = half[axis]; vertices.push(...p);
            }
        }
        return vertices;
    },
    resolve(mesh) {
        // A merged draw must use a real member's object scope and coverage,
        // never the merged geometry's center/name. Shader Architect verifies
        // that all members still agree before submitting the coordinated frame.
        if (mesh?.userData?.saArtKeySourceMesh) mesh = mesh.userData.saArtKeySourceMesh;
        if (!mesh?.geometry) return [];
        const state = this.frameState;
        const geometry = mesh.geometry;
        const matrix = mesh.matrixWorld?.elements;
        const cached = state?.meshes.get(mesh);
        // World matrices may change between beauty and an auxiliary pass (for
        // example a native billboard). Never reuse a different pose or geometry.
        if (cached && cached.geometry === geometry && cached.position === geometry.attributes?.position &&
            cached.positionVersion === geometry.attributes?.position?.version &&
            matrix?.every((value, index) => value === cached.matrix[index])) {
            this.performance.cacheHits++;
            return cached.keys;
        }
        const prepared = state ? (state.prepared ||= this.prepareKeys()) : this.prepareKeys();
        if (!prepared.length) return [];
        this.performance.resolutions++;
        let sourceElement = this.meshElementCache.get(mesh);
        if (!sourceElement) {
            const elementTypes = [window.Cube, window.Mesh, window.TextureMesh, window.Billboard, window.BedrockBlockElement].filter(Boolean);
            sourceElement = elementTypes.flatMap(Type => Array.isArray(Type.all) ? Type.all : []).find(element => element?.mesh === mesh) || null;
            if (sourceElement) this.meshElementCache.set(mesh, sourceElement);
        }
        const node = sourceElement || window.OutlinerNode?.uuids?.[mesh.name] || window.OutlinerNode?.uuids?.[mesh.userData?.element_uuid];
        const ids = new Set([mesh.name, mesh.userData?.element_uuid, node?.uuid, node?.name].filter(Boolean));
        for (let parent = node?.parent; parent && parent !== 'root'; parent = parent.parent) ids.add(parent.uuid);
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        if (!mesh.geometry.boundingBox || mesh.geometry.boundingBox.isEmpty()) return [];
        const center = mesh.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
        const result = [];
        for (const key of prepared) {
            const { element, origin, inverse, native: isNativeArtKey, half, vector } = key;
            if ((element.art_exclude || []).some(id => ids.has(id))) continue;
            const included = (element.art_include || []).some(id => ids.has(id));
            if (element.art_scope === 'include' && !included) continue;
            const local = isNativeArtKey
                ? center.clone().applyMatrix4(inverse)
                : center.clone().sub(origin).applyQuaternion(inverse);
            const edge = Math.max(Math.abs(local.x) / half[0], Math.abs(local.y) / half[1], Math.abs(local.z) / half[2]);
            if (!included && edge > 1) continue;
            const softness = Math.max(0, Math.min(1, Number(element.art_softness) || 0));
            let coverage = included || softness === 0 ? 1 : Math.max(0, Math.min(1, (1 - edge) / softness));
            coverage = coverage * coverage * (3 - 2 * coverage);
            if (coverage <= 0) continue;
            result.push({ element, vector, coverage, weight: Math.max(0, Number(element.key_light_weight) || 0) });
        }
        const keys = result.sort((a, b) => b.weight - a.weight || a.element.uuid.localeCompare(b.element.uuid)).slice(0, this.maxPerObject);
        if (state && matrix) state.meshes.set(mesh, {
            geometry, position: geometry.attributes?.position,
            positionVersion: geometry.attributes?.position?.version,
            matrix: Array.from(matrix), keys
        });
        return keys;
    },
    getBatchSignature(mesh) {
        // Key identity fixes vector/color/mode/weight/radius for all receivers;
        // coverage is the only receiver-dependent uniform. Preserve exact
        // values and order: rounding soft boundaries would alter the image.
        return JSON.stringify(this.resolve(mesh).map(key => [key.element.uuid, key.coverage]));
    },
    syncUniforms(mesh, material) {
        const uniforms = material?.uniforms;
        if (!uniforms?.uArtKeyCount) return;
        const keys = this.resolve(mesh);
        uniforms.uArtKeyCount.value = keys.length;
        keys.forEach((key, index) => {
            uniforms.uArtKeyVector.value[index].copy(key.vector);
            uniforms.uArtKeyColor.value[index].fromArray(LightManagerUtils.colorArray(key.element.render_color || key.element.color).map(c => c / 255));
            uniforms.uArtKeyParams.value[index].set(key.element.art_mode === 'direction' ? 1 : 0,
                Math.max(0, Number(key.element.render_intensity ?? key.element.intensity) || 0) * key.weight * key.coverage,
                Math.max(0, Number(key.element.art_radius) || 0));
        });
    }
};

window.three_lights = window.three_lights || {};

function configureLightManagerRendererShadows(renderer) {
    if (!renderer || !renderer.shadowMap) return false;

    let changed = false;
    const hasShadowLights = lightManagerHasActiveShadowLights();
    if (renderer.shadowMap.enabled !== hasShadowLights) {
        rememberLightManagerRendererShadowSettings(renderer);
        renderer.shadowMap.enabled = hasShadowLights;
        changed = true;
    }

    if (!hasShadowLights) {
        if (changed) markLightManagerShadowsDirty();
        return changed;
    }

    if (!LIGHT_MANAGER_SHADOW_STATE.configuredRenderers.has(renderer)) {
        rememberLightManagerRendererShadowSettings(renderer);
        changed = true;
    }

    // PCFShadowMap uses LightShadow.radius; PCFSoft can ignore it in older Three builds.
    const shadowType = THREE.PCFShadowMap || THREE.PCFSoftShadowMap || renderer.shadowMap.type;
    if (shadowType !== undefined && renderer.shadowMap.type !== shadowType) {
        renderer.shadowMap.type = shadowType;
        changed = true;
    }

    /*
     * Shadow maps are the most expensive part of an otherwise simple slider
     * interaction. Lightflow tracks every transform, geometry and shadow
     * mutation, so normal viewports can render them on demand. Studio Render
     * temporarily opts its own renderer back into automatic updates while it
     * owns the shared shadow targets.
     */
    if (renderer.shadowMap.autoUpdate !== false) {
        renderer.shadowMap.autoUpdate = false;
        changed = true;
    }

    if (changed) {
        renderer.shadowMap.needsUpdate = true;
        markLightManagerShadowsDirty();
    }

    return changed;
}

function forEachLightManagerPreview(callback) {
    const previews = new Set();

    if (window.Preview && Array.isArray(Preview.all)) {
        Preview.all.forEach(preview => {
            if (preview) previews.add(preview);
        });
    }

    [window.main_preview, window.MediaPreview, window.Screencam?.NoAAPreview].forEach(preview => {
        if (preview) previews.add(preview);
    });

    previews.forEach(callback);
}

function configureLightManagerRenderers() {
    let changed = false;
    forEachLightManagerPreview(preview => {
        if (configureLightManagerRendererShadows(preview.renderer)) changed = true;
    });
    return changed;
}

function prepareLightManagerStudioShadowRenderer(renderer) {
    if (!renderer || !renderer.shadowMap) return false;

    rememberLightManagerRendererShadowSettings(renderer);

    let changed = false;
    if (renderer.shadowMap.autoUpdate !== true) {
        renderer.shadowMap.autoUpdate = true;
        changed = true;
    }

    renderer.shadowMap.needsUpdate = true;
    return changed;
}

function prepareLightManagerDirtyRenderers() {
    if (LIGHT_MANAGER_SHADOW_STATE.dirtyRenderers.size > 0) return;

    forEachLightManagerPreview(preview => {
        if (preview?.renderer?.shadowMap) {
            LIGHT_MANAGER_SHADOW_STATE.dirtyRenderers.add(preview.renderer);
        }
    });
}

function getLightManagerMeshShadowPolicy(element, object) {
    const userData = object?.userData || {};
    const suppressAllShadows = (
        element?.type === 'lightflow_volume' ||
        userData.lightflowNoShadow === true
    );
    return {
        cast: !suppressAllShadows &&
            element?.sa_cast_shadow !== false &&
            userData.lightflowNoCastShadow !== true,
        receive: !suppressAllShadows &&
            userData.lightflowNoReceiveShadow !== true
    };
}

function configureLightManagerSceneShadowMeshes(force = false) {
    if (!force && !LIGHT_MANAGER_SHADOW_STATE.sceneDirty) return false;
    if (!lightManagerHasActiveShadowLights()) return false;

    let changed = false;
    const elements = Array.isArray(window.Outliner?.elements) ? window.Outliner.elements : [];

    elements.forEach(element => {
        if (
            !element ||
            element.type === 'light' ||
            (window.LightElement && element instanceof window.LightElement)
        ) return;

        const mesh = element.mesh;
        if (!mesh || typeof mesh.traverse !== 'function') return;

        mesh.traverse(object => {
            if (!object || object.isLight || object.isCamera) return;
            if (object.isMesh) {
                const policy = getLightManagerMeshShadowPolicy(element, object);
                if (object.castShadow !== policy.cast) {
                    object.castShadow = policy.cast;
                    changed = true;
                }
                if (object.receiveShadow !== policy.receive) {
                    object.receiveShadow = policy.receive;
                    changed = true;
                }
            }
        });
    });

    LIGHT_MANAGER_SHADOW_STATE.sceneDirty = false;
    if (changed) markLightManagerShadowsDirty();
    return changed;
}

function isLightManagerShadowDebugEnabled() {
    const config = window.LightManagerShadowDebug;
    return config === true || !!(config && config.enabled);
}

function getLightManagerShadowDebugConfig() {
    const config = window.LightManagerShadowDebug;
    if (config === true) return {};
    return config && typeof config === 'object' ? config : {};
}

function getLightManagerShadowDebugStages(config) {
    if (Array.isArray(config.stages)) {
        return new Set(config.stages.map(stage => String(stage)));
    }
    if (config.verbose || config.prepareAll) return null;
    if (config.prepare) return new Set(['prepare-start', 'prepare-end', 'three-light-sync', 'resolution-change', 'shadow-quality-change', 'shadow-flag-repair']);
    return new Set(['three-light-sync', 'resolution-change', 'shadow-quality-change', 'shadow-flag-repair', 'warning']);
}

function shouldLogLightManagerPrepareDebug(stage, snapshot, options = {}, extra = {}, config = {}) {
    if (stage !== 'prepare-start' && stage !== 'prepare-end') return true;
    if (config.verbose || config.prepareAll) return true;

    if (!snapshot.activeShadowLights && !snapshot.lights.length) return false;
    if (options.force || options.studio || options.studioRender) return true;
    if (snapshot.dirty || snapshot.sceneDirty) return true;

    if (stage === 'prepare-end') {
        return !!(
            extra.lightObjectsChanged ||
            extra.shadowFlagsChanged ||
            extra.resolutionChanged ||
            extra.studioAutoUpdateChanged
        );
    }

    return false;
}

function getLightManagerPreviewDebugName(preview) {
    if (!preview) return 'none';
    if (preview === window.main_preview) return 'main_preview';
    if (preview === window.MediaPreview) return 'MediaPreview';
    if (preview === window.Screencam?.NoAAPreview) return 'Screencam.NoAAPreview';
    if (preview.id) return String(preview.id);
    if (preview.uuid) return String(preview.uuid);
    return 'preview';
}

function getLightManagerRendererShadowDebug(renderer) {
    const shadowMap = renderer && renderer.shadowMap;
    if (!shadowMap) return null;
    return {
        enabled: !!shadowMap.enabled,
        autoUpdate: shadowMap.autoUpdate,
        needsUpdate: shadowMap.needsUpdate,
        type: shadowMap.type
    };
}

function getLightManagerShadowTargetDebug(shadow) {
    if (!shadow || !shadow.map) return null;

    return {
        targetUuid: shadow.map.uuid || null,
        textureUuid: shadow.map.texture?.uuid || null,
        width: shadow.map.width,
        height: shadow.map.height,
        textureWidth: shadow.map.texture?.image?.width,
        textureHeight: shadow.map.texture?.image?.height,
        hasMapPass: !!shadow.mapPass,
        mapPassWidth: shadow.mapPass?.width,
        mapPassHeight: shadow.mapPass?.height
    };
}

function getLightManagerShadowTargetLayout(light) {
    const isPointLight = !!(
        light && (
            light.isPointLight ||
            light.shadow?.isPointLightShadow
        )
    );

    return isPointLight
        ? {
            kind: 'point-cube-atlas',
            widthMultiplier: 4,
            heightMultiplier: 2
        }
        : {
            kind: 'single-shadow-map',
            widthMultiplier: 1,
            heightMultiplier: 1
        };
}

function getLightManagerExpectedShadowTargetSize(light, resolution) {
    const safeResolution = Math.max(1, Math.round(Number(resolution) || 1));
    const layout = getLightManagerShadowTargetLayout(light);

    return {
        width: safeResolution * layout.widthMultiplier,
        height: safeResolution * layout.heightMultiplier,
        layout: layout.kind
    };
}

function getLightManagerRendererLimits(renderer) {
    const gl = renderer?.getContext?.();
    const capabilities = renderer?.capabilities;
    const cached = renderer && LIGHT_MANAGER_SHADOW_STATE.rendererLimits.get(renderer);
    if (cached && cached.gl === gl && cached.capabilities === capabilities &&
        cached.capabilityTextureSize === capabilities?.maxTextureSize) {
        return cached.limits;
    }
    const fallbackTextureSize = Math.max(
        1,
        Number(renderer?.capabilities?.maxTextureSize) || 4096
    );
    const readParameter = (parameter, fallback) => {
        if (!gl || parameter === undefined) return fallback;
        try {
            const value = gl.getParameter(parameter);
            return value === null || value === undefined ? fallback : value;
        } catch (error) {
            return fallback;
        }
    };
    const maxTextureSize = Math.max(
        1,
        Number(readParameter(gl?.MAX_TEXTURE_SIZE, fallbackTextureSize)) || fallbackTextureSize
    );
    const maxRenderbufferSize = Math.max(
        1,
        Number(readParameter(gl?.MAX_RENDERBUFFER_SIZE, maxTextureSize)) || maxTextureSize
    );
    const viewportDimsRaw = readParameter(gl?.MAX_VIEWPORT_DIMS, [maxTextureSize, maxTextureSize]);
    const viewportDims = Array.from(viewportDimsRaw || [maxTextureSize, maxTextureSize]);
    const maxViewportWidth = Math.max(1, Number(viewportDims[0]) || maxTextureSize);
    const maxViewportHeight = Math.max(1, Number(viewportDims[1]) || maxTextureSize);

    const limits = {
        maxTextureSize,
        maxRenderbufferSize,
        maxViewportWidth,
        maxViewportHeight,
        legalWidth: Math.max(1, Math.min(maxTextureSize, maxRenderbufferSize, maxViewportWidth)),
        legalHeight: Math.max(1, Math.min(maxTextureSize, maxRenderbufferSize, maxViewportHeight))
    };
    if (renderer && gl) {
        // Hardware limits do not change between lights or frames. Querying
        // WebGL synchronously for every shadow map stalls the render thread.
        LIGHT_MANAGER_SHADOW_STATE.rendererLimits.set(renderer, {
            gl, capabilities, capabilityTextureSize: capabilities?.maxTextureSize, limits
        });
        if (!LIGHT_MANAGER_SHADOW_STATE.rendererLimitListeners.has(renderer) && renderer.domElement?.addEventListener) {
            const canvas = renderer.domElement;
            const invalidate = () => LIGHT_MANAGER_SHADOW_STATE.rendererLimits.delete(renderer);
            canvas.addEventListener('webglcontextrestored', invalidate);
            LIGHT_MANAGER_SHADOW_STATE.rendererLimitListeners.set(renderer, { canvas, invalidate });
        }
    }
    return limits;
}

function getLightManagerLegalShadowResolution(light, requestedResolution, renderer = null) {
    const requested = Math.max(1, Math.round(Number(requestedResolution) || 1));
    const layout = getLightManagerShadowTargetLayout(light);
    if (!renderer) {
        return {
            requestedResolution: requested,
            logicalResolution: requested,
            clamped: false,
            layout: layout.kind,
            physicalWidth: requested * layout.widthMultiplier,
            physicalHeight: requested * layout.heightMultiplier,
            limits: null
        };
    }

    const limits = getLightManagerRendererLimits(renderer);
    const maxLogicalWidth = Math.max(1, Math.floor(limits.legalWidth / layout.widthMultiplier));
    const maxLogicalHeight = Math.max(1, Math.floor(limits.legalHeight / layout.heightMultiplier));
    const logicalResolution = Math.max(1, Math.min(requested, maxLogicalWidth, maxLogicalHeight));

    return {
        requestedResolution: requested,
        logicalResolution,
        clamped: logicalResolution !== requested,
        layout: layout.kind,
        physicalWidth: logicalResolution * layout.widthMultiplier,
        physicalHeight: logicalResolution * layout.heightMultiplier,
        limits
    };
}

function disposeLightManagerShadowTargets(shadow) {
    const mapBefore = getLightManagerShadowTargetDebug(shadow);
    const targets = new Set();
    const errors = [];

    if (shadow?.map) targets.add(shadow.map);
    if (shadow?.mapPass) targets.add(shadow.mapPass);

    targets.forEach(target => {
        try {
            target?.dispose?.();
        } catch (error) {
            errors.push(error?.message || String(error));
        }
    });

    if (shadow) {
        shadow.map = null;
        if ('mapPass' in shadow) shadow.mapPass = null;
    }

    return {
        mapBefore,
        disposedTargets: targets.size,
        disposeErrors: errors
    };
}

/*
 * Shadow ownership contract:
 * - Light Manager owns the requested logical LightShadow.mapSize.
 * - Three.js owns the physical WebGLRenderTarget allocation and atlas layout.
 * - A stale target is disposed, never resized in place by the plugin.
 *
 * This is essential for PointLightShadow: Three r129 expands one logical map
 * into a 4x2 atlas and applies renderer limits before allocating GPU memory.
 */
function resizeLightManagerShadowMap(light, targetResolution, renderer = null) {
    const shadow = light?.shadow;
    if (!shadow) return { changed: false };

    const legality = getLightManagerLegalShadowResolution(
        light,
        targetResolution,
        renderer
    );
    const safeResolution = legality.logicalResolution;
    const expectedTarget = getLightManagerExpectedShadowTargetSize(light, safeResolution);
    const fromWidth = Number(shadow.mapSize?.width) || 0;
    const fromHeight = Number(shadow.mapSize?.height) || 0;
    const mapBefore = getLightManagerShadowTargetDebug(shadow);
    const resolutionAlreadyMatches = (
        fromWidth === safeResolution &&
        fromHeight === safeResolution
    );
    const targetAlreadyMatches = !shadow.map || (
        Number(shadow.map.width) === expectedTarget.width &&
        Number(shadow.map.height) === expectedTarget.height
    );

    if (resolutionAlreadyMatches && targetAlreadyMatches) {
        return {
            changed: false,
            requestedResolution: legality.requestedResolution,
            to: safeResolution,
            expectedTarget,
            legality
        };
    }

    /*
     * Ownership rule: Light Manager configures the public LightShadow.mapSize,
     * but never resizes Three's private WebGLRenderTarget in place. Three r129
     * derives the physical target from LightShadow.getFrameExtents() (4x2 for
     * PointLightShadow), clamps it against the renderer limits, and allocates it
     * during WebGLShadowMap.render(). If the old target no longer matches the
     * requested logical resolution, dispose it and let Three recreate it on the
     * next shadow pass.
     */
    let targetReset = null;
    if (shadow.map && !targetAlreadyMatches) {
        targetReset = disposeLightManagerShadowTargets(shadow);
    }

    if (shadow.mapSize && typeof shadow.mapSize.set === 'function') {
        shadow.mapSize.set(safeResolution, safeResolution);
    } else if (shadow.mapSize) {
        shadow.mapSize.width = safeResolution;
        shadow.mapSize.height = safeResolution;
    }

    shadow.needsUpdate = true;

    return {
        changed: true,
        requestedResolution: legality.requestedResolution,
        from: { width: fromWidth, height: fromHeight },
        to: safeResolution,
        expectedTarget,
        legality,
        resizeStrategy: targetReset
            ? 'three-owned-target-reallocation'
            : 'logical-map-size-update',
        targetReused: !targetReset && !!shadow.map,
        textureIdentityPreserved: !targetReset && !!shadow.map,
        mapBefore,
        mapAfter: getLightManagerShadowTargetDebug(shadow),
        targetReset,
        resizeErrors: targetReset?.disposeErrors || []
    };
}

function collectLightManagerShadowDebug(preview, options = {}) {
    const renderOptions = normalizeLightManagerUpdateOptions(options);
    const lights = [];

    if (window.LightElement && Array.isArray(LightElement.all)) {
        LightElement.all.forEach(element => {
            if (!element) return;
            const light = window.three_lights && window.three_lights[element.uuid];
            const shadow = light && light.shadow;
            const targetResolution = LightManagerUtils.getRenderShadowResolution(element, renderOptions);
            const map = getLightManagerShadowTargetDebug(shadow);
            const expectedTarget = getLightManagerExpectedShadowTargetSize(light, targetResolution);
            lights.push({
                name: element.name || element.uuid,
                uuid: element.uuid,
                threeType: light && light.constructor ? light.constructor.name : null,
                threeIsLight: !!(light && light.isLight),
                hasThreeLight: !!light,
                hasShadowObject: !!shadow,
                type: element.light_type,
                visible: element.visibility !== false,
                elementShadow: element.has_shadow !== false,
                threeVisible: light ? light.visible !== false : false,
                castShadow: !!(light && light.castShadow),
                targetResolution,
                previewResolution: LightManagerUtils.shadowResolution(element.shadow_resolution),
                studioResolution: LightManagerUtils.studioShadowResolution(element.studio_shadow_resolution),
                mapSize: shadow ? {
                    width: shadow.mapSize?.width,
                    height: shadow.mapSize?.height
                } : null,
                expectedTarget,
                map,
                mapMatchesExpected: !map || (
                    map.width === expectedTarget.width &&
                    map.height === expectedTarget.height
                ),
                shadowNeedsUpdate: shadow ? shadow.needsUpdate : undefined,
                bias: shadow ? shadow.bias : undefined,
                normalBias: shadow ? shadow.normalBias : undefined,
                radius: shadow ? shadow.radius : undefined,
                elementSoftness: LightManagerUtils.shadowSoftness(element.shadow_softness)
            });
        });
    }

    const studioSessionActive = !!window.LightManagerStudioRenderSession;
    const studioPreviewName = getLightManagerPreviewDebugName(window.LightManagerStudioRenderPreview);
    const previewName = getLightManagerPreviewDebugName(preview);
    const allowStudioRestore = options.allowStudioRestore === true || options.source === 'studio_render_restore';

    return {
        preview: previewName,
        mode: renderOptions.studio ? 'studio' : 'preview',
        force: !!options.force,
        dirty: LIGHT_MANAGER_SHADOW_STATE.dirty,
        sceneDirty: LIGHT_MANAGER_SHADOW_STATE.sceneDirty,
        studioSessionActive,
        studioPreview: studioPreviewName,
        previewRestoreDeferred: !!(
            studioSessionActive &&
            !renderOptions.studio &&
            previewName !== studioPreviewName &&
            !allowStudioRestore
        ),
        renderer: getLightManagerRendererShadowDebug(preview && preview.renderer),
        activeShadowLights: lightManagerHasActiveShadowLights(),
        lights
    };
}

function logLightManagerShadowDebug(stage, preview, options = {}, extra = {}) {
    if (!isLightManagerShadowDebugEnabled()) return;
    const snapshot = collectLightManagerShadowDebug(preview, options);
    const config = getLightManagerShadowDebugConfig();
    const stages = getLightManagerShadowDebugStages(config);

    if (stages && !stages.has(stage)) return;
    if (!shouldLogLightManagerPrepareDebug(stage, snapshot, options, extra, config)) return;

    const throttleMs = Math.max(0, Number(config.throttleMs ?? config.interval ?? 750) || 0);
    const lightSignature = snapshot.lights.map(light => [
        light.uuid,
        light.castShadow ? 1 : 0,
        light.targetResolution,
        light.mapSize?.width || 0,
        light.mapSize?.height || 0,
        light.map?.width || 0,
        light.map?.height || 0,
        light.shadowNeedsUpdate ? 1 : 0
    ].join(':')).join(',');
    const extraSignature = extra && Object.keys(extra).length
        ? JSON.stringify(extra)
        : '';
    const signature = [
        snapshot.preview,
        snapshot.mode,
        snapshot.force ? 1 : 0,
        snapshot.dirty ? 1 : 0,
        snapshot.renderer?.enabled ? 1 : 0,
        snapshot.renderer?.needsUpdate ? 1 : 0,
        lightSignature,
        extraSignature
    ].join('|');
    const key = [
        stage,
        snapshot.preview,
        snapshot.mode
    ].join('|');
    const now = Date.now();
    const previous = LIGHT_MANAGER_SHADOW_DEBUG_STATE.lastLogs.get(key);

    if (
        previous &&
        previous.signature === signature &&
        throttleMs > 0 &&
        now - previous.time < throttleMs
    ) {
        return;
    }

    LIGHT_MANAGER_SHADOW_DEBUG_STATE.lastLogs.set(key, {
        signature,
        time: now
    });

    writeLightManagerDebugLog('[Light Manager Shadows] ' + stage, {
        ...snapshot,
        ...extra
    });
}

function getLightManagerShadowDebugIssues(snapshot) {
    const issues = [];
    const previewRestoreDeferred = !!snapshot.previewRestoreDeferred;

    if (snapshot.activeShadowLights && !snapshot.renderer) {
        issues.push('active shadow lights but no preview renderer shadowMap was found');
    } else if (snapshot.activeShadowLights && snapshot.renderer && !snapshot.renderer.enabled) {
        issues.push('active shadow lights but renderer.shadowMap.enabled is false');
    }

    if (
        snapshot.activeShadowLights &&
        snapshot.renderer &&
        snapshot.renderer.autoUpdate === false &&
        snapshot.renderer.needsUpdate !== true &&
        snapshot.lights.some(light => light.visible && light.elementShadow && !light.map)
    ) {
        issues.push('a shadow target is missing while renderer.shadowMap.autoUpdate is false; the next scene render cannot rebuild it');
    }

    snapshot.lights.forEach(light => {
        if (!light.visible || !light.elementShadow) return;
        if (!light.hasThreeLight) {
            issues.push(`${light.name}: no THREE light was registered for this LightElement`);
            return;
        }
        if (!light.threeIsLight) {
            issues.push(`${light.name}: registered THREE light does not expose isLight (${light.threeType || 'unknown'})`);
        }
        if (!light.castShadow) {
            if (light.userData?.lightManagerPreviewShadowSuppressed) return;
            issues.push(`${light.name}: THREE light castShadow is false`);
        }
        if (
            !previewRestoreDeferred &&
            light.mapSize &&
            (
                light.mapSize.width !== light.targetResolution ||
                light.mapSize.height !== light.targetResolution
            )
        ) {
            issues.push(`${light.name}: shadow mapSize ${light.mapSize.width}x${light.mapSize.height} expected ${light.targetResolution}`);
        }
        if (light.map && !light.mapMatchesExpected) {
            issues.push(
                `${light.name}: GPU shadow target ${light.map.width}x${light.map.height} ` +
                `does not match ${light.expectedTarget.width}x${light.expectedTarget.height} ` +
                `(${light.expectedTarget.layout}, resolution ${light.targetResolution})`
            );
        }
    });

    return issues;
}

function logLightManagerShadowDebugIssues(preview, options = {}, extra = {}) {
    if (!isLightManagerShadowDebugEnabled()) return;
    const snapshot = collectLightManagerShadowDebug(preview, options);
    const issues = getLightManagerShadowDebugIssues(snapshot);
    if (!issues.length) return;
    logLightManagerShadowDebug('warning', preview, options, {
        ...extra,
        issues
    });
}

function syncLightManagerThreeLightShadowFlags(options = {}) {
    const repairs = [];

    if (!window.LightElement || !Array.isArray(LightElement.all)) return false;

    const budgetChanged = typeof applyLightManagerPreviewShadowBudget === 'function'
        ? applyLightManagerPreviewShadowBudget(options)
        : false;

    LightElement.all.forEach(element => {
        if (!element || !element.uuid) return;

        const light = window.three_lights && window.three_lights[element.uuid];
        if (!light) return;

        light.userData = light.userData || {};
        const requestedCastShadow = element.has_shadow !== false;
        if (requestedCastShadow) light.userData.lightManagerRetainShadowSlot = true;
        const desiredVisible = true;
        const previewShadowSuppressed = light.userData.lightManagerPreviewShadowSuppressed === true;
        const desiredCastShadow = !previewShadowSuppressed && (
            requestedCastShadow || light.userData.lightManagerRetainShadowSlot === true
        );
        const activeIntensity = Number(light.userData.lightManagerActiveIntensity);
        const desiredIntensity = !isLightManagerElementHierarchyVisible(element)
            ? 0
            : (Number.isFinite(activeIntensity) ? activeIntensity : light.intensity);
        const before = {
            visible: light.visible !== false,
            castShadow: light.castShadow === true
        };
        let repaired = false;

        if (Number.isFinite(desiredIntensity) && light.intensity !== desiredIntensity) {
            light.intensity = desiredIntensity;
            repaired = true;
        }

        if (light.visible !== desiredVisible) {
            light.visible = desiredVisible;
            repaired = true;
        }

        if (light.castShadow !== desiredCastShadow) {
            light.castShadow = desiredCastShadow;
            if (light.shadow && requestedCastShadow) {
                light.shadow.needsUpdate = true;
            }
            repaired = true;
        }

        if (light.shadow && !requestedCastShadow && desiredCastShadow) {
            light.shadow.autoUpdate = false;
            light.shadow.needsUpdate = false;
        }

        /*
         * Do not set shadow.needsUpdate on every prepare call. That left every
         * point-light map permanently invalidated while a normal renderer was
         * still configured for manual updates. Actual changes are already
         * handled by the repaired branch, signature invalidation, and the
         * resolution-resize path.
         */

        if (repaired) {
            repairs.push({
                name: element.name || element.uuid,
                uuid: element.uuid,
                before,
                after: {
                    visible: desiredVisible,
                    castShadow: desiredCastShadow
                },
                mode: normalizeLightManagerUpdateOptions(options).studio ? 'studio' : 'preview'
            });
        }
    });

    if (!repairs.length && !budgetChanged) return false;

    markLightManagerShadowsDirty();
    logLightManagerShadowDebug('shadow-flag-repair', null, options, {
        repairs,
        previewShadowBudget: window.LightManagerPreviewShadowBudget || null
    });
    return true;
}

function notifyLightManagerShadowStateRepaired(options = {}) {
    if (typeof window.on_light_element_updated !== 'function') return;
    window.on_light_element_updated({
        ...normalizeLightManagerUpdateOptions(options),
        shadows: true,
        scene: false,
        gizmos: false,
        repaired: true
    });
}

function syncLightManagerRenderShadowResolution(options = {}) {
    const renderOptions = normalizeLightManagerUpdateOptions(options);
    const preview = options.preview || null;
    const allowStudioRestore = options.allowStudioRestore === true || options.source === 'studio_render_restore';
    let changed = false;
    const resolutionChanges = [];

    if (!window.LightElement || !Array.isArray(LightElement.all)) return false;
    if (
        window.LightManagerStudioRenderSession &&
        !renderOptions.studio &&
        preview !== window.LightManagerStudioRenderPreview &&
        !allowStudioRestore
    ) {
        logLightManagerShadowDebug('resolution-skip', preview, renderOptions, {
            reason: 'studio-session-preview-restore-blocked',
            studioPreview: getLightManagerPreviewDebugName(window.LightManagerStudioRenderPreview)
        });
        return false;
    }

    LightElement.all.forEach(element => {
        if (!element || element.has_shadow === false) return;
        const light = window.three_lights && window.three_lights[element.uuid];
        if (!light || !light.shadow) return;

        const targetResolution = LightManagerUtils.getRenderShadowResolution(element, renderOptions);
        const resize = resizeLightManagerShadowMap(light, targetResolution, preview?.renderer || null);
        if (!resize.changed) return;

        resolutionChanges.push({
            name: element.name || element.uuid,
            uuid: element.uuid,
            mode: renderOptions.studio ? 'studio' : 'preview',
            ...resize
        });
        changed = true;
    });

    if (changed) {
        markLightManagerShadowsDirty();
        logLightManagerShadowDebug('resolution-change', preview, renderOptions, { resolutionChanges });
    }
    return changed;
}

function syncLightManagerSingleShadowSettings(light, element, options = {}) {
    if (!light || !light.shadow || !element) return false;

    const shadow = light.shadow;
    const camera = shadow.camera;
    let changed = false;
    let cameraChanged = false;

    // Three r129 only honors shadow.needsUpdate per light when that shadow's
    // own autoUpdate flag is disabled. Renderer.shadowMap.autoUpdate=false by
    // itself still redraws every shadow light whenever the global map is dirty.
    if (shadow.autoUpdate !== false) {
        shadow.autoUpdate = false;
        shadow.needsUpdate = true;
        changed = true;
    }

    const activeResolution = LightManagerUtils.getRenderShadowResolution(
        element,
        options
    );
    // These are the only inputs used by automatic bias. An OutlinerElement
    // also contains reactive UI/animation data, which must not be copied on
    // every shadow preparation pass.
    const shadowContext = {
        light_type: element.light_type,
        shadow_resolution: activeResolution,
        shadow_bounds: element.shadow_bounds,
        shadow_near: element.shadow_near,
        shadow_far: element.shadow_far,
        distance: element.distance,
        angle: element.angle
    };
    const bias = LightManagerUtils.shadowBias(element.shadow_bias, shadowContext);
    if (shadow.bias !== bias) {
        shadow.bias = bias;
        changed = true;
    }

    const normalBias = LightManagerUtils.shadowNormalBias(element.shadow_normal_bias, shadowContext);
    if (shadow.normalBias !== normalBias) {
        shadow.normalBias = normalBias;
        changed = true;
    }

    const configuredRadius = LightManagerUtils.shadowSoftness(
        element.shadow_softness
    );
    const lowQualityScale = activeResolution < 1024
        ? Math.sqrt(1024 / Math.max(256, activeResolution))
        : 1.0;
    const radius = Math.min(
        4.0,
        configuredRadius * lowQualityScale
    );
    if (shadow.radius !== radius) {
        shadow.radius = radius;
        changed = true;
    }

    if (camera) {
        const near = LightManagerUtils.num(element.shadow_near, 0.1, 0, 99999);
        const far = Math.max(near + 0.001, LightManagerUtils.num(element.shadow_far, 200, 0.001, 100000));

        if (camera.near !== near || camera.far !== far) {
            camera.near = near;
            camera.far = far;
            cameraChanged = true;
        }

        if (element.light_type === 'directional') {
            const bounds = LightManagerUtils.num(element.shadow_bounds, 35, 0.001, 100000);
            if (
                camera.top !== bounds ||
                camera.bottom !== -bounds ||
                camera.left !== -bounds ||
                camera.right !== bounds
            ) {
                camera.top = bounds;
                camera.bottom = -bounds;
                camera.left = -bounds;
                camera.right = bounds;
                cameraChanged = true;
            }
        }

        if (cameraChanged && typeof camera.updateProjectionMatrix === 'function') {
            camera.updateProjectionMatrix();
        }
    }

    if (changed || cameraChanged) {
        shadow.needsUpdate = true;
        return true;
    }

    return false;
}

function syncLightManagerShadowQuality(options = {}) {
    let changed = false;
    const qualityChanges = [];

    if (!window.LightElement || !Array.isArray(LightElement.all)) return false;

    LightElement.all.forEach(element => {
        if (!element || element.has_shadow === false) return;
        const light = window.three_lights && window.three_lights[element.uuid];
        if (!light || !light.shadow) return;

        if (!syncLightManagerSingleShadowSettings(light, element, options)) return;

        qualityChanges.push({
            name: element.name || element.uuid,
            uuid: element.uuid,
            bias: light.shadow.bias,
            normalBias: light.shadow.normalBias,
            radius: light.shadow.radius,
            near: light.shadow.camera?.near,
            far: light.shadow.camera?.far,
            bounds: element.light_type === 'directional' ? element.shadow_bounds : undefined
        });
        changed = true;
    });

    if (changed) {
        markLightManagerShadowsDirty();
        logLightManagerShadowDebug('shadow-quality-change', options.preview || null, options, { qualityChanges });
    }

    return changed;
}

function invalidateLightManagerShadowMaps(options = {}) {
    if (typeof options === 'boolean') options = { force: options };
    const force = !!options.force;
    const preview = options.preview || null;

    if (!force && !LIGHT_MANAGER_SHADOW_STATE.dirty) return false;

    if (!lightManagerHasActiveShadowLights()) {
        LIGHT_MANAGER_SHADOW_STATE.dirty = false;
        LIGHT_MANAGER_SHADOW_STATE.dirtyRenderers.clear();
        LIGHT_MANAGER_SHADOW_STATE.allLightsDirty = false;
        LIGHT_MANAGER_SHADOW_STATE.dirtyLightUuids.clear();
        return false;
    }

    const invalidateDirtyLights = () => {
        const invalidateAll = force || LIGHT_MANAGER_SHADOW_STATE.allLightsDirty;
        const elementsByUuid = new Map(
            (window.LightElement && Array.isArray(LightElement.all) ? LightElement.all : [])
                .filter(element => element?.uuid)
                .map(element => [element.uuid, element])
        );
        Object.keys(window.three_lights || {}).forEach(uuid => {
            if (!invalidateAll && !LIGHT_MANAGER_SHADOW_STATE.dirtyLightUuids.has(uuid)) return;
            const light = window.three_lights[uuid];
            const element = elementsByUuid.get(uuid);
            const inactiveEnvironmentShadow = !!(
                light?.userData?.lightflowEnvironmentVirtual &&
                window.LightflowEnvironment?.getVirtualLight?.()?.has_shadow !== true
            );
            if (light?.shadow && (
                inactiveEnvironmentShadow ||
                (element && (
                    !isLightManagerElementHierarchyVisible(element) ||
                    element.has_shadow === false
                ))
            )) {
                light.shadow.autoUpdate = false;
                light.shadow.needsUpdate = false;
                return;
            }
            if (light?.shadow) light.shadow.needsUpdate = true;
        });
    };

    if (preview?.renderer?.shadowMap) {
        prepareLightManagerDirtyRenderers();
        if (!force && !LIGHT_MANAGER_SHADOW_STATE.dirtyRenderers.has(preview.renderer)) {
            return false;
        }

        invalidateDirtyLights();

        preview.renderer.shadowMap.needsUpdate = true;
        LIGHT_MANAGER_SHADOW_STATE.dirtyRenderers.delete(preview.renderer);
        if (LIGHT_MANAGER_SHADOW_STATE.dirtyRenderers.size === 0) {
            LIGHT_MANAGER_SHADOW_STATE.dirty = false;
            LIGHT_MANAGER_SHADOW_STATE.allLightsDirty = false;
            LIGHT_MANAGER_SHADOW_STATE.dirtyLightUuids.clear();
        }
    } else {
        invalidateDirtyLights();

        forEachLightManagerPreview(candidate => {
            if (candidate?.renderer?.shadowMap) {
                candidate.renderer.shadowMap.needsUpdate = true;
            }
        });
        LIGHT_MANAGER_SHADOW_STATE.dirtyRenderers.clear();
        LIGHT_MANAGER_SHADOW_STATE.dirty = false;
        LIGHT_MANAGER_SHADOW_STATE.allLightsDirty = false;
        LIGHT_MANAGER_SHADOW_STATE.dirtyLightUuids.clear();
    }

    return true;
}

function syncLightManagerShadowSignature(options = {}) {
    const nextSignatures = getLightManagerShadowSignatures();
    const previousSignatures = LIGHT_MANAGER_SHADOW_STATE.shadowSignatures;
    LIGHT_MANAGER_SHADOW_STATE.shadowSignatures = nextSignatures;

    if (!(previousSignatures instanceof Map)) {
        markLightManagerShadowsDirty();
        return true;
    }

    const changedElements = [];
    const elementsByUuid = new Map(
        (window.LightElement && Array.isArray(LightElement.all) ? LightElement.all : [])
            .filter(element => element?.uuid)
            .map(element => [element.uuid, element])
    );
    nextSignatures.forEach((signature, uuid) => {
        if (previousSignatures.get(uuid) !== signature) {
            const element = elementsByUuid.get(uuid);
            if (element) changedElements.push(element);
        }
    });
    const removedLight = Array.from(previousSignatures.keys()).some(uuid => !nextSignatures.has(uuid));
    if (!changedElements.length && !removedLight) return false;

    // Light topology changes do not alter the shadow image of every surviving
    // light. New/edited lights need their own map once; removed lights need no
    // redraw at all. Scene edits still invalidate every shadow caster below.
    if (options.scene) {
        markLightManagerShadowsDirty({ scene: true });
    } else if (changedElements.length) {
        markLightManagerShadowsDirty({ elements: changedElements });
    }
    return true;
}

function getLightManagerThreeLightConstructor(element) {
    if (!element || !window.THREE || element.light_type === 'art_key') return null;
    if (element.light_type === 'directional') return THREE.DirectionalLight;
    if (element.light_type === 'spot') return THREE.SpotLight;
    return THREE.PointLight;
}

function lightManagerNeedsThreeLightSync() {
    if (!window.scene) return false;
    if (!window.LightElement || !Array.isArray(LightElement.all)) return false;
    if (!LightElement.all.length) return false;
    if (!window.three_lights_group) return true;
    if (!window.three_lights) return true;

    return LightElement.all.some(element => {
        if (!element || !element.uuid) return false;
        if (element.light_type === 'art_key') return !!window.three_lights[element.uuid];
        const light = window.three_lights[element.uuid];
        const LightConstructor = getLightManagerThreeLightConstructor(element);
        return !light || (LightConstructor && light.constructor !== LightConstructor);
    });
}

function lightManagerUpdateChangesTopology(options = {}) {
    if (lightManagerNeedsThreeLightSync()) return true;
    if (!options.cleanup || !window.three_lights) return false;

    const activeUuids = new Set(
        (window.LightElement && Array.isArray(LightElement.all) ? LightElement.all : [])
            .filter(element => element?.uuid)
            .map(element => element.uuid)
    );
    return Object.keys(window.three_lights).some(uuid => {
        const light = window.three_lights[uuid];
        return !light?.userData?.lightflowEnvironmentVirtual && !activeUuids.has(uuid);
    });
}

function ensureLightManagerThreeLights(options = {}) {
    if (!lightManagerNeedsThreeLightSync()) return false;
    if (LIGHT_MANAGER_UPDATE_STATE.preparingLights) return false;
    if (typeof runLightManagerElementUpdate !== 'function') return false;

    const beforeMissing = [];
    if (window.LightElement && Array.isArray(LightElement.all)) {
        LightElement.all.forEach(element => {
            if (!element || !element.uuid || element.light_type === 'art_key') return;
            const light = window.three_lights && window.three_lights[element.uuid];
            const LightConstructor = getLightManagerThreeLightConstructor(element);
            if (!light || (LightConstructor && light.constructor !== LightConstructor)) {
                beforeMissing.push({
                    name: element.name || element.uuid,
                    uuid: element.uuid,
                    expected: LightConstructor ? LightConstructor.name : null,
                    actual: light && light.constructor ? light.constructor.name : null
                });
            }
        });
    }

    LIGHT_MANAGER_UPDATE_STATE.preparingLights = true;
    try {
        runLightManagerElementUpdate({
            ...normalizeLightManagerUpdateOptions(options),
            shadows: true,
            scene: true,
            gizmos: false
        });
    } finally {
        LIGHT_MANAGER_UPDATE_STATE.preparingLights = false;
    }

    logLightManagerShadowDebug('three-light-sync', null, options, { beforeMissing });
    return true;
}

window.LightManagerMarkShadowsDirty = markLightManagerShadowsDirty;
window.LightManagerDebugShadows = function LightManagerDebugShadows(preview, options = {}) {
    if (preview && !preview.renderer && typeof preview === 'object') {
        options = preview;
        preview = null;
    }

    const targetPreview =
        preview ||
        (typeof Preview !== 'undefined' && Preview.selected) ||
        window.main_preview ||
        window.MediaPreview ||
        window.Screencam?.NoAAPreview ||
        null;
    const snapshot = collectLightManagerShadowDebug(targetPreview, options);
    writeLightManagerDebugLog('[Light Manager Shadows] manual-snapshot', snapshot);
    return snapshot;
};

window.LightManagerSyncLights = function LightManagerSyncLights(options = {}) {
    const updateOptions = {
        ...normalizeLightManagerUpdateOptions(options),
        shadows: true,
        scene: true,
        gizmos: false
    };
    const lightObjectsChanged = ensureLightManagerThreeLights(updateOptions);
    const shadowFlagsChanged = syncLightManagerThreeLightShadowFlags(updateOptions);
    const resolutionChanged = syncLightManagerRenderShadowResolution(updateOptions);
    const qualityChanged = syncLightManagerShadowQuality(updateOptions);
    invalidateLightManagerShadowMaps({
        force: lightObjectsChanged || shadowFlagsChanged || resolutionChanged || qualityChanged
    });
    if (lightObjectsChanged || shadowFlagsChanged) {
        notifyLightManagerShadowStateRepaired(updateOptions);
    }
    const snapshot = collectLightManagerShadowDebug(null, updateOptions);
    writeLightManagerDebugLog('[Light Manager Shadows] manual-sync', {
        lightObjectsChanged,
        shadowFlagsChanged,
        resolutionChanged,
        qualityChanged,
        ...snapshot
    });
    return snapshot;
};

window.LightManagerPrepareRender = function LightManagerPrepareRender(preview, options = {}) {
    const studioPreview = window.LightManagerStudioRenderPreview || null;
    const allowStudioRestore = options.allowStudioRestore === true || options.source === 'studio_render_restore';

    /*
     * A Three.Light owns one shared shadow object, including shadow.map.
     * While Studio Render temporarily switches that map to the Studio
     * resolution, a normal preview must not configure, invalidate, or render
     * against the same shadow object. Previously only the resolution switch
     * was blocked; the rest of this function still invalidated the shared map.
     * That is why main_preview appeared in the logs with 256 mapSize while
     * Studio was rendering at 256, even though main_preview expects 1024.
     */
    const foreignPreviewDuringStudioSession = !!(
        window.LightManagerStudioRenderSession &&
        studioPreview &&
        preview &&
        preview !== studioPreview &&
        !preview.sa_studio_render_active &&
        !allowStudioRestore
    );

    if (foreignPreviewDuringStudioSession) {
        logLightManagerShadowDebug('studio-foreign-preview-skip', preview, options, {
            reason: 'studio-session-owns-shared-light-shadow-state',
            studioPreview: getLightManagerPreviewDebugName(studioPreview)
        });
        return {
            skipped: true,
            reason: 'studio-session-owns-shared-light-shadow-state'
        };
    }

    const previewIsStudioRender = !!(
        preview &&
        (
            preview === studioPreview ||
            preview.sa_studio_render_active
        )
    );
    const implicitStudioRender = !!(
        window.LightManagerStudioRenderActive &&
        (
            previewIsStudioRender ||
            (!preview && studioPreview)
        )
    );
    const renderOptions = {
        ...options,
        studio: !!(
            options.studio ||
            options.studioRender ||
            previewIsStudioRender ||
            implicitStudioRender
        )
    };
    const force = !!renderOptions.force;
    const renderPreview = preview || (renderOptions.studio ? studioPreview : null);
    logLightManagerShadowDebug('prepare-start', renderPreview, renderOptions);

    /*
     * Studio Render uses one static scene/light setup for every camera tile.
     * Once its first beauty pass has populated the shared shadow targets,
     * Shader Architect still enters this hook for SSR/AO/post renders. Do not
     * re-enable autoUpdate or invalidate those maps again until the session
     * explicitly clears the reuse flag.
     */
    if (renderOptions.studio && renderPreview?.sa_studio_render_reuse_shadows) {
        const shadowMap = renderPreview.renderer?.shadowMap;
        if (shadowMap) {
            shadowMap.autoUpdate = false;
            shadowMap.needsUpdate = false;
        }
        Object.values(window.three_lights || {}).forEach(light => {
            if (!light?.shadow) return;
            light.shadow.autoUpdate = false;
            light.shadow.needsUpdate = false;
        });
        logLightManagerShadowDebug('studio-static-shadow-reuse', renderPreview, renderOptions);
        return {
            skipped: true,
            reason: 'studio-static-shadow-reuse'
        };
    }

    if (renderPreview?.renderer) {
        configureLightManagerRendererShadows(renderPreview.renderer);
    } else {
        configureLightManagerRenderers();
    }

    // ensureLightManagerThreeLights can run the element updater. Re-enable
    // automatic updates on the Studio renderer afterwards so the newly
    // allocated target is populated before the final tile is sampled.
    const lightObjectsChanged = ensureLightManagerThreeLights(renderOptions);
    const studioAutoUpdateChanged = renderOptions.studio && renderPreview?.renderer
        ? prepareLightManagerStudioShadowRenderer(renderPreview.renderer)
        : false;
    configureLightManagerSceneShadowMeshes(force);
    const shadowFlagsChanged = syncLightManagerThreeLightShadowFlags(renderOptions);
    const resolutionChanged = syncLightManagerRenderShadowResolution({
        ...renderOptions,
        preview: renderPreview
    });
    const qualityChanged = syncLightManagerShadowQuality({
        ...renderOptions,
        preview: renderPreview
    });
    invalidateLightManagerShadowMaps({
        force: force || lightObjectsChanged || shadowFlagsChanged || resolutionChanged || qualityChanged,
        preview: renderPreview
    });
    if (lightObjectsChanged || shadowFlagsChanged) {
        notifyLightManagerShadowStateRepaired(renderOptions);
    }
    logLightManagerShadowDebug('prepare-end', renderPreview, renderOptions, { lightObjectsChanged, shadowFlagsChanged, resolutionChanged, qualityChanged, studioAutoUpdateChanged });
    logLightManagerShadowDebugIssues(renderPreview, renderOptions, { lightObjectsChanged, shadowFlagsChanged, resolutionChanged, qualityChanged, studioAutoUpdateChanged });
};

function cancelLightManagerElementUpdate() {
    if (
        typeof LIGHT_MANAGER_UPDATE_STATE.frame === 'number' &&
        typeof cancelAnimationFrame === 'function'
    ) {
        cancelAnimationFrame(LIGHT_MANAGER_UPDATE_STATE.frame);
    }

    LIGHT_MANAGER_UPDATE_STATE.frame = null;
    LIGHT_MANAGER_UPDATE_STATE.rerun = false;
    LIGHT_MANAGER_UPDATE_STATE.options = null;
}

function normalizeLightManagerUpdateOptions(options = {}) {
    const requestedElements = Array.isArray(options.elements)
        ? options.elements.filter(Boolean)
        : (options.element ? [options.element] : null);
    return {
        shadows: options.shadows !== false,
        scene: options.scene !== false,
        gizmos: options.gizmos !== false,
        studio: !!(options.studio || options.studioRender),
        preview: options.preview || null,
        elements: requestedElements,
        cleanup: options.cleanup === true || (options.cleanup !== false && !requestedElements),
        preserveTopology: options.preserveTopology !== false,
        render: options.render !== false
    };
}

function mergeLightManagerUpdateOptions(previous, next) {
    if (!previous) return next;

    const elements = previous.elements === null || next.elements === null
        ? null
        : Array.from(new Set([...(previous.elements || []), ...(next.elements || [])]));

    return {
        shadows: previous.shadows || next.shadows,
        scene: previous.scene || next.scene,
        gizmos: previous.gizmos || next.gizmos,
        studio: previous.studio || next.studio,
        preview: next.preview || previous.preview || null,
        elements,
        cleanup: previous.cleanup || next.cleanup || elements === null,
        preserveTopology: previous.preserveTopology && next.preserveTopology,
        render: previous.render || next.render
    };
}

function registerLightManagerCanvasGizmo(object) {
    if (!object || !window.Canvas || !Array.isArray(Canvas.gizmos)) return;
    if (!Canvas.gizmos.includes(object)) Canvas.gizmos.push(object);
}

function unregisterLightManagerCanvasGizmo(object) {
    if (!object || !window.Canvas || !Array.isArray(Canvas.gizmos)) return;
    const index = Canvas.gizmos.indexOf(object);
    if (index >= 0) Canvas.gizmos.splice(index, 1);
}

if (window.LightManagerAreaGizmos && typeof window.LightManagerAreaGizmos.clear === 'function') {
    window.LightManagerAreaGizmos.clear();
}

function notifyLightflowGizmoVisibilityChanged(source = 'light_manager') {
    const detail = {
        source,
        showGizmos: !window.Canvas || Canvas.show_gizmos !== false,
        showLightAreaGizmos: window.LightManagerAreaGizmos?.enabled !== false
    };
    let event;
    if (typeof CustomEvent === 'function') {
        event = new CustomEvent('lightflow_gizmo_visibility_changed', { detail });
    } else {
        event = document.createEvent('Event');
        event.initEvent('lightflow_gizmo_visibility_changed', false, false);
        event.detail = detail;
    }
    window.dispatchEvent(event);
}

window.LightManagerAreaGizmos = {
    enabled: lightManagerSafeGet(LIGHT_MANAGER_STORAGE_KEYS.areaGizmos, 'true') !== 'false',
    helpers: new Map(),
    group: null,

    getGroup() {
        if (!window.scene || !this.enabled || (window.Canvas && Canvas.show_gizmos === false)) return null;
        if (!this.group || this.group.parent !== window.scene) {
            if (this.group && this.group.parent) this.group.parent.remove(this.group);
            this.group = new THREE.Group();
            this.group.name = 'light_manager_area_gizmos';
            this.group.raycast = () => { };
            window.scene.add(this.group);
        }
        registerLightManagerCanvasGizmo(this.group);
        return this.group;
    },

    num(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    },

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    },

    pushLine(vertices, ax, ay, az, bx, by, bz) {
        vertices.push(ax, ay, az, bx, by, bz);
    },

    pushCircle(vertices, radius, z, plane = 'xy', segments = 64) {
        for (let i = 0; i < segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            const b = ((i + 1) / segments) * Math.PI * 2;
            const ax = Math.cos(a) * radius;
            const ay = Math.sin(a) * radius;
            const bx = Math.cos(b) * radius;
            const by = Math.sin(b) * radius;

            if (plane === 'xy') this.pushLine(vertices, ax, ay, z, bx, by, z);
            else if (plane === 'xz') this.pushLine(vertices, ax, z, ay, bx, z, by);
            else this.pushLine(vertices, z, ax, ay, z, bx, by);
        }
    },

    buildDirectionalVertices(element) {
        const bounds = Math.max(0.001, this.num(element.shadow_bounds, 35));
        const near = Math.max(0, this.num(element.shadow_near, 0.1));
        const far = Math.max(near + 0.001, this.num(element.shadow_far, 200));
        const zn = -near;
        const zf = -far;
        const vertices = [];
        const corners = [
            [-bounds, -bounds, zn], [bounds, -bounds, zn],
            [bounds, bounds, zn], [-bounds, bounds, zn],
            [-bounds, -bounds, zf], [bounds, -bounds, zf],
            [bounds, bounds, zf], [-bounds, bounds, zf]
        ];
        const edges = [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7]
        ];

        edges.forEach(edge => {
            const a = corners[edge[0]];
            const b = corners[edge[1]];
            this.pushLine(vertices, a[0], a[1], a[2], b[0], b[1], b[2]);
        });

        this.pushLine(vertices, 0, 0, zn, 0, 0, zf);
        this.pushLine(vertices, -bounds, 0, zf, bounds, 0, zf);
        this.pushLine(vertices, 0, -bounds, zf, 0, bounds, zf);
        return vertices;
    },

    getRange(element, fallback = 8) {
        const distance = this.num(element.distance, 0);
        if (distance > 0) return distance;
        // A zero distance means an infinite light. Shadow clipping is a render
        // concern, not a useful on-canvas size: using shadow_far here can turn
        // a helper into a viewport-sized wall of lines.
        return fallback;
    },

    buildSpotVertices(element) {
        const range = Math.max(0.001, this.getRange(element, 8));
        const angle = THREE.MathUtils.degToRad(this.clamp(this.num(element.angle, 45), 0.1, 89.9));
        const radius = Math.tan(angle) * range;
        const vertices = [];
        const segments = 48;

        this.pushCircle(vertices, radius, -range, 'xy', segments);

        const spokes = 4;
        for (let i = 0; i < spokes; i++) {
            const theta = (i / spokes) * Math.PI * 2;
            const x = Math.cos(theta) * radius;
            const y = Math.sin(theta) * radius;
            this.pushLine(vertices, 0, 0, 0, x, y, -range);
        }

        if (element.has_shadow !== false) {
            const near = this.clamp(this.num(element.shadow_near, 0.1), 0, Math.max(0, range - 0.001));
            if (near > 0.001) {
                this.pushCircle(vertices, Math.tan(angle) * near, -near, 'xy', 32);
            }
        }

        return vertices;
    },

    buildPointVertices(element) {
        const radius = Math.max(0.001, this.getRange(element, Math.max(4, Math.sqrt(this.num(element.render_intensity ?? element.intensity, 1)) * 4)));
        const vertices = [];
        this.pushCircle(vertices, radius, 0, 'xy', 48);
        this.pushCircle(vertices, radius, 0, 'xz', 48);
        this.pushCircle(vertices, radius, 0, 'yz', 48);
        return vertices;
    },

    buildVertices(element) {
        if (element.light_type === 'art_key') return window.LightManagerArtKeys.boxVertices(element);
        if (element.light_type === 'directional') return this.buildDirectionalVertices(element);
        if (element.light_type === 'spot') return this.buildSpotVertices(element);
        return this.buildPointVertices(element);
    },

    getSignature(element) {
        return [
            element.light_type || 'point',
            ...(element.art_size || []), ...(element.art_point || []), element.art_mode,
            this.num(element.distance, 0),
            this.num(element.angle, 45),
            this.num(element.shadow_near, 0.1),
            this.num(element.shadow_far, 200),
            this.num(element.shadow_bounds, 35),
            element.has_shadow !== false ? 1 : 0,
            this.num(element.render_intensity ?? element.intensity, 1)
        ].join('|');
    },

    getColor01(element) {
        const spriteColor = element.mesh?.sprite?.material?.color;
        if (spriteColor) return [spriteColor.r, spriteColor.g, spriteColor.b];

        const color = element.render_color || element.color || [255, 255, 255];
        return [
            this.clamp(this.num(color[0], 255) / 255, 0, 1),
            this.clamp(this.num(color[1], 255) / 255, 0, 1),
            this.clamp(this.num(color[2], 255) / 255, 0, 1)
        ];
    },

    createHelper(element, group) {
        const root = new THREE.Object3D();
        root.name = `light_area_${element.uuid}`;
        root.raycast = () => { };
        root.renderOrder = 999;

        const material = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.28,
            // Draw after opaque scene geometry, but still let its depth buffer
            // occlude the directional shadow-bounds frustum normally.
            depthTest: true,
            depthWrite: false
        });

        const line = new THREE.LineSegments(new THREE.BufferGeometry(), material);
        line.name = `light_area_lines_${element.uuid}`;
        line.raycast = () => { };
        root.add(line);
        group.add(root);

        const helper = { root, line, material, signature: '' };
        this.helpers.set(element.uuid, helper);
        return helper;
    },

    updateHelper(element, group) {
        if (!element || !element.uuid || !element.mesh) return;

        let helper = this.helpers.get(element.uuid);
        if (!helper) helper = this.createHelper(element, group);
        if (helper.root.parent !== group) group.add(helper.root);

        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        element.mesh.getWorldPosition(worldPos);
        element.mesh.getWorldQuaternion(worldQuat);
        helper.root.position.copy(worldPos);
        helper.root.quaternion.copy(worldQuat);
        helper.root.scale.setScalar(1);
        helper.root.visible = window.LightManagerUI?.workspace?.helperVisible({visible: element.visibility !== false, selected: !!element.selected}) ?? element.visibility !== false;

        const color = this.getColor01(element);
        helper.material.color.setRGB(color[0], color[1], color[2]);
        helper.material.opacity = element.selected ? 0.5 : 0.16;
        helper.material.needsUpdate = true;

        const signature = this.getSignature(element);
        if (helper.signature !== signature) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.buildVertices(element), 3));
            helper.line.geometry.dispose();
            helper.line.geometry = geometry;
            helper.signature = signature;
        }
    },

    destroyHelper(uuid) {
        const helper = this.helpers.get(uuid);
        if (!helper) return;
        if (helper.root && helper.root.parent) helper.root.parent.remove(helper.root);
        if (helper.line && helper.line.geometry) helper.line.geometry.dispose();
        if (helper.material) helper.material.dispose();
        this.helpers.delete(uuid);
    },

    updateAll() {
        if (!this.enabled || (window.Canvas && Canvas.show_gizmos === false)) {
            this.clear();
            return;
        }

        const lights = (window.LightElement && Array.isArray(window.LightElement.all)) ? window.LightElement.all : [];
        const group = this.getGroup();
        if (!group) return;

        const active = new Set();
        lights.forEach(element => {
            active.add(element.uuid);
            this.updateHelper(element, group);
        });

        Array.from(this.helpers.keys()).forEach(uuid => {
            if (!active.has(uuid)) this.destroyHelper(uuid);
        });
    },

    clear() {
        Array.from(this.helpers.keys()).forEach(uuid => this.destroyHelper(uuid));
        unregisterLightManagerCanvasGizmo(this.group);
        if (this.group && this.group.parent) this.group.parent.remove(this.group);
        this.group = null;
    },

    setEnabled(enabled, options = {}) {
        this.enabled = !!enabled;
        lightManagerSafeSet(LIGHT_MANAGER_STORAGE_KEYS.areaGizmos, this.enabled ? 'true' : 'false');
        if (this.enabled) this.updateAll();
        else this.clear();
        window.LightManagerViewportControls?.updateAll();
        if (options.notify !== false) {
            notifyLightflowGizmoVisibilityChanged('light_area_gizmos');
        }
    },

    toggle() {
        this.setEnabled(!this.enabled);
        return this.enabled;
    }
};

if (window.LightManagerViewportControls && typeof window.LightManagerViewportControls.dispose === 'function') {
    window.LightManagerViewportControls.dispose();
}

window.LightManagerViewportControls = {
    helpers: new Map(),
    group: null,
    raycaster: new THREE.Raycaster(),
    mouse: new THREE.Vector2(),
    drag: null,
    pendingFreeMove: false,
    installed: false,
    listeners: [],
    materials: [],
    handleGeometry: null,
    lineGeometry: null,
    moveIndicator: null,
    boundPointerDown: null,
    boundPointerMove: null,
    boundPointerUp: null,
    boundKeyDown: null,

    axisVectors: {
        x: new THREE.Vector3(1, 0, 0),
        y: new THREE.Vector3(0, 1, 0),
        z: new THREE.Vector3(0, 0, 1)
    },

    colors: {
        aim: '#58C0FF',
        range: '#00CE71',
        cone: '#fbda01',
        penumbra: '#F96BC5',
        bounds: '#9301fb',
        near: '#EC9218',
        far: '#FA565D',
        moving: '#AFFF62'
    },

    install() {
        if (this.installed || typeof document === 'undefined') return;
        this.boundPointerDown = event => this.onPointerDown(event);
        this.boundPointerMove = event => this.onPointerMove(event);
        this.boundPointerUp = event => this.onPointerUp(event);
        this.boundPointerCancel = () => { this.pendingFreeMove = false; this.cancelDrag(true); };
        this.boundKeyDown = event => this.onKeyDown(event);
        document.addEventListener('pointerdown', this.boundPointerDown, true);
        document.addEventListener('pointermove', this.boundPointerMove, true);
        document.addEventListener('pointerup', this.boundPointerUp, true);
        document.addEventListener('pointercancel', this.boundPointerCancel, true);
        window.addEventListener('blur', this.boundPointerCancel);
        document.addEventListener('keydown', this.boundKeyDown, true);
        if (window.Blockbench && typeof Blockbench.on === 'function') {
            this.listeners.push(Blockbench.on('update_selection', () => this.updateAll()));
            this.listeners.push(Blockbench.on('select_mode', () => this.updateAll()));
            this.listeners.push(Blockbench.on('select_tool', () => { this.cancelDrag(true); this.updateAll(); }));
            this.listeners.push(Blockbench.on('update_view', () => this.updateAll()));
            this.listeners.push(Blockbench.on('change_project', () => this.updateAll()));
        }
        this.installed = true;
    },

    dispose() {
        if (typeof document !== 'undefined') {
            if (this.boundPointerDown) document.removeEventListener('pointerdown', this.boundPointerDown, true);
            if (this.boundPointerMove) document.removeEventListener('pointermove', this.boundPointerMove, true);
            if (this.boundPointerUp) document.removeEventListener('pointerup', this.boundPointerUp, true);
            if (this.boundPointerCancel) document.removeEventListener('pointercancel', this.boundPointerCancel, true);
            if (this.boundPointerCancel) window.removeEventListener('blur', this.boundPointerCancel);
            if (this.boundKeyDown) document.removeEventListener('keydown', this.boundKeyDown, true);
        }
        this.listeners.forEach(listener => listener && typeof listener.delete === 'function' && listener.delete());
        this.listeners = [];
        this.cancelDrag(true);
        this.clearMoveIndicator();
        this.clear();
        if (this.handleGeometry) this.handleGeometry.dispose();
        if (this.lineGeometry) this.lineGeometry.dispose();
        this.materials.forEach(material => material && material.dispose && material.dispose());
        this.materials = [];
        this.handleGeometry = null;
        this.lineGeometry = null;
        this.installed = false;
    },

    getGroup() {
        if (!window.scene) return null;
        if (!this.group || this.group.parent !== window.scene) {
            if (this.group && this.group.parent) this.group.parent.remove(this.group);
            this.group = new THREE.Group();
            this.group.name = 'light_manager_viewport_controls';
            this.group.raycast = () => { };
            window.scene.add(this.group);
        }
        registerLightManagerCanvasGizmo(this.group);
        return this.group;
    },

    createMoveIndicator() {
        const group = this.getGroup();
        if (!group) return null;
        if (this.moveIndicator && this.moveIndicator.root.parent === group) return this.moveIndicator;

        this.clearMoveIndicator();
        const root = new THREE.Object3D();
        root.name = 'light_manager_move_indicator';
        root.renderOrder = 1005;
        root.raycast = () => { };

        const material = this.createLineMaterial(0x8cff7a, 0.9);
        const line = new THREE.LineSegments(new THREE.BufferGeometry(), material);
        line.raycast = () => { };
        root.add(line);

        const marker = new THREE.Mesh(this.getHandleGeometry(), this.createMaterial(this.colors.moving, 0.95));
        marker.name = 'light_manager_move_marker';
        marker.renderOrder = 1006;
        root.add(marker);
        group.add(root);
        this.moveIndicator = { root, line, marker };
        return this.moveIndicator;
    },

    updateMoveIndicator(start, end, axis) {
        const indicator = this.createMoveIndicator();
        if (!indicator || !start || !end) return;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([
            start.x, start.y, start.z,
            end.x, end.y, end.z
        ], 3));
        indicator.line.geometry.dispose();
        indicator.line.geometry = geometry;
        const scale = this.getControlScale(end) * 0.55;
        indicator.marker.position.copy(end);
        indicator.marker.scale.setScalar(axis ? scale * 0.9 : scale * 0.75);
        indicator.marker.visible = true;
        indicator.root.visible = true;
    },

    clearMoveIndicator() {
        const indicator = this.moveIndicator;
        if (!indicator) return;
        if (indicator.root && indicator.root.parent) indicator.root.parent.remove(indicator.root);
        if (indicator.root) {
            indicator.root.traverse(object => {
                if (object.geometry && typeof object.geometry.dispose === 'function') object.geometry.dispose();
                const materials = Array.isArray(object.material) ? object.material : (object.material ? [object.material] : []);
                materials.forEach(material => {
                    const index = this.materials.indexOf(material);
                    if (index >= 0) this.materials.splice(index, 1);
                    if (material && material.map && typeof material.map.dispose === 'function') material.map.dispose();
                    if (material && typeof material.dispose === 'function') material.dispose();
                });
            });
        }
        this.moveIndicator = null;
    },

    getHandleGeometry() {
        if (!this.handleGeometry) this.handleGeometry = new THREE.SphereGeometry(1, 16, 8);
        return this.handleGeometry;
    },

    createMaterial(color, opacity = 0.95) {
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthTest: false,
            depthWrite: false
        });
        this.materials.push(material);
        return material;
    },

    createLineMaterial(color, opacity = 0.5, depthTest = false) {
        const material = new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthTest,
            depthWrite: false
        });
        this.materials.push(material);
        return material;
    },

    createHandle(element, type, color, extra = {}) {
        const mesh = new THREE.Mesh(this.getHandleGeometry(), this.createMaterial(color));
        mesh.name = `light_manager_handle_${type}_${element.uuid}`;
        mesh.renderOrder = 1003;
        mesh.userData.lightManagerHandle = { uuid: element.uuid, type, ...extra };
        return mesh;
    },

    createHelper(element, group) {
        const root = new THREE.Object3D();
        root.name = `light_manager_controls_${element.uuid}`;
        root.raycast = () => { };
        root.renderOrder = 1002;

        const lineMaterial = this.createLineMaterial(0xffffff, 0.28, true);
        const guideLine = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial);
        guideLine.name = `light_manager_control_guides_${element.uuid}`;
        guideLine.raycast = () => { };
        root.add(guideLine);

        const handles = {
            artPoint: this.createHandle(element, 'art_point', this.colors.aim),
            artX: this.createHandle(element, 'art_size', this.colors.bounds, { axis: 'x' }),
            artY: this.createHandle(element, 'art_size', this.colors.bounds, { axis: 'y' }),
            artZ: this.createHandle(element, 'art_size', this.colors.bounds, { axis: 'z' }),
            aim: this.createHandle(element, 'aim', this.colors.aim),
            range: this.createHandle(element, 'range', this.colors.range),
            cone: this.createHandle(element, 'cone_angle', this.colors.cone),
            penumbra: this.createHandle(element, 'penumbra', this.colors.penumbra),
            boundPX: this.createHandle(element, 'shadow_bounds', this.colors.bounds, { axis: 'x', sign: 1 }),
            boundNX: this.createHandle(element, 'shadow_bounds', this.colors.bounds, { axis: 'x', sign: -1 }),
            boundPY: this.createHandle(element, 'shadow_bounds', this.colors.bounds, { axis: 'y', sign: 1 }),
            boundNY: this.createHandle(element, 'shadow_bounds', this.colors.bounds, { axis: 'y', sign: -1 }),
            near: this.createHandle(element, 'shadow_near', this.colors.near),
            far: this.createHandle(element, 'shadow_far', this.colors.far)
        };
        Object.values(handles).forEach(handle => root.add(handle));
        group.add(root);

        const helper = { root, guideLine, lineMaterial, handles };
        this.helpers.set(element.uuid, helper);
        return helper;
    },

    isEditMode() {
        return !window.Modes || !!Modes.edit || !!Modes.render;
    },

    canShowViewportGizmos() {
        if (window.Canvas && Canvas.show_gizmos === false) return false;
        if (window.LightManagerAreaGizmos && LightManagerAreaGizmos.enabled === false) return false;
        return true;
    },

    isHandleToolAllowed() {
        const id = window.Toolbox && Toolbox.selected && Toolbox.selected.id;
        return id === 'light_manager_edit_tool';
    },

    getSelectedLights() {
        if (!window.LightElement || !Array.isArray(LightElement.selected)) return [];
        return LightElement.selected.filter(light => light && light.mesh && !light.locked);
    },

    num(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    },

    getRange(element, fallback = 8) {
        const distance = this.num(element.distance, 0);
        if (distance > 0) return distance;
        return fallback;
    },

    getControlScale(position) {
        const preview = window.Preview && Preview.selected;
        if (!preview || typeof preview.calculateControlScale !== 'function') return 0.35;
        return Math.max(0.08, preview.calculateControlScale(position) || 0.35);
    },

    setHandleVisible(handle, visible, position, scale) {
        if (!handle) return;
        handle.visible = !!visible;
        if (position) handle.position.copy(position);
        handle.scale.setScalar(scale);
    },

    setHandle(helper, key, visible, position, scale) {
        this.setHandleVisible(helper.handles[key], visible, position, scale);
    },

    setGuideVertices(helper, vertices) {
        const geometry = helper.guideLine.geometry;
        let position = geometry.getAttribute('position');
        if (!position || position.array.length !== vertices.length) {
            position = new THREE.Float32BufferAttribute(vertices, 3);
            geometry.setAttribute('position', position);
        } else {
            position.array.set(vertices);
            position.needsUpdate = true;
        }
        geometry.computeBoundingSphere();
    },

    updateHelper(element, group) {
        let helper = this.helpers.get(element.uuid);
        if (!helper) helper = this.createHelper(element, group);
        if (helper.root.parent !== group) group.add(helper.root);

        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        element.mesh.updateMatrixWorld(true);
        element.mesh.getWorldPosition(worldPos);
        element.mesh.getWorldQuaternion(worldQuat);
        helper.root.position.copy(worldPos);
        helper.root.quaternion.copy(worldQuat);
        helper.root.scale.setScalar(1);
        helper.root.visible = element.visibility !== false;

        Object.values(helper.handles).forEach(handle => {
            if (handle.userData && handle.userData.lightManagerHandle) {
                handle.userData.lightManagerHandle.uuid = element.uuid;
            }
        });

        const scale = this.getControlScale(worldPos) * 0.48;
        const vertices = [];
        const lightType = element.light_type || 'point';
        ['artPoint', 'artX', 'artY', 'artZ'].forEach(key => this.setHandle(helper, key, false, new THREE.Vector3(), 0));
        if (lightType === 'art_key') {
            Object.values(helper.handles).forEach(handle => { handle.visible = false; });
            const half = window.LightManagerArtKeys.size(element).map(value => value / 2);
            this.setHandle(helper, 'artPoint', true, new THREE.Vector3().fromArray(element.art_point), scale);
            ['x', 'y', 'z'].forEach((axis, i) => {
                const position = new THREE.Vector3(); position[axis] = half[i];
                this.setHandle(helper, 'art' + axis.toUpperCase(), true, position, scale);
            });
            helper.handles.artPoint.material.color.setRGB(...LightManagerUtils.colorArray(element.color).map(c => c / 255));
            this.setGuideVertices(helper, window.LightManagerArtKeys.boxVertices(element));
            return;
        }
        const hasShadow = element.has_shadow !== false;
        const range = Math.max(0.001, this.getRange(element, lightType === 'directional' ? 16 : 8));
        const angle = THREE.MathUtils.degToRad(LightManagerUtils.num(element.angle, 45, 0.1, 89.9));
        const radius = Math.tan(angle) * range;
        const penumbra = LightManagerUtils.num(element.penumbra, 0, 0, 1);
        const innerRadius = radius * (1 - penumbra);
        const near = Math.max(0, this.num(element.shadow_near, 0.1));
        const far = Math.max(near + 0.001, this.num(element.shadow_far, lightType === 'directional' ? 200 : range));
        const bounds = Math.max(0.001, this.num(element.shadow_bounds, 35));
        const aimDistance = lightType === 'directional'
            ? Math.max(4, Math.min(far, 24))
            : Math.max(4, Math.min(range, 48));

        this.setHandle(helper, 'aim', lightType === 'directional' || lightType === 'spot', new THREE.Vector3(0, 0, -aimDistance), scale);
        if (lightType === 'directional' || lightType === 'spot') {
            vertices.push(0, 0, 0, 0, 0, -aimDistance);
        }

        this.setHandle(helper, 'range', lightType === 'point', new THREE.Vector3(range, 0, 0), scale);
        if (lightType === 'point') vertices.push(0, 0, 0, range, 0, 0);

        this.setHandle(helper, 'cone', lightType === 'spot', new THREE.Vector3(radius, 0, -range), scale);
        this.setHandle(helper, 'penumbra', lightType === 'spot', new THREE.Vector3(innerRadius, 0, -range * 0.96), scale * 0.82);
        if (lightType === 'spot') {
            vertices.push(0, 0, 0, radius, 0, -range);
            vertices.push(0, 0, 0, innerRadius, 0, -range * 0.96);
            this.setHandle(helper, 'range', true, new THREE.Vector3(0, 0, -range), scale);
        }

        const midDepth = -(near + far) * 0.5;
        const showDirectionalBounds = lightType === 'directional' && hasShadow;
        this.setHandle(helper, 'boundPX', showDirectionalBounds, new THREE.Vector3(bounds, 0, midDepth), scale);
        this.setHandle(helper, 'boundNX', showDirectionalBounds, new THREE.Vector3(-bounds, 0, midDepth), scale);
        this.setHandle(helper, 'boundPY', showDirectionalBounds, new THREE.Vector3(0, bounds, midDepth), scale);
        this.setHandle(helper, 'boundNY', showDirectionalBounds, new THREE.Vector3(0, -bounds, midDepth), scale);
        if (showDirectionalBounds) {
            vertices.push(-bounds, 0, midDepth, bounds, 0, midDepth);
            vertices.push(0, -bounds, midDepth, 0, bounds, midDepth);
        }

        const showClip = hasShadow && (lightType === 'directional' || lightType === 'spot');
        this.setHandle(helper, 'near', showClip, new THREE.Vector3(0, 0, -near), scale * 0.75);
        this.setHandle(helper, 'far', showClip, new THREE.Vector3(0, 0, -far), scale * 0.75);
        if (showClip) vertices.push(0, 0, -near, 0, 0, -far);

        this.setGuideVertices(helper, vertices.length ? vertices : [0, 0, 0, 0, 0, 0]);
    },

    destroyHelper(uuid) {
        const helper = this.helpers.get(uuid);
        if (!helper) return;
        if (helper.root && helper.root.parent) helper.root.parent.remove(helper.root);
        if (helper.root) {
            helper.root.traverse(object => {
                const materials = Array.isArray(object.material) ? object.material : (object.material ? [object.material] : []);
                materials.forEach(material => {
                    const index = this.materials.indexOf(material);
                    if (index >= 0) this.materials.splice(index, 1);
                    if (material && material.map && typeof material.map.dispose === 'function') material.map.dispose();
                    if (material && typeof material.dispose === 'function') material.dispose();
                });
            });
        }
        if (helper.guideLine && helper.guideLine.geometry) helper.guideLine.geometry.dispose();
        this.helpers.delete(uuid);
    },

    updateAll() {
        if (!this.isEditMode() || !this.canShowViewportGizmos() || !this.isHandleToolAllowed()) {
            this.clearHelpersOnly();
            return;
        }
        const lights = this.getSelectedLights();
        const group = this.getGroup();
        if (!group || !lights.length) {
            this.clearHelpersOnly();
            return;
        }

        const active = new Set();
        lights.forEach(light => {
            active.add(light.uuid);
            this.updateHelper(light, group);
        });
        Array.from(this.helpers.keys()).forEach(uuid => {
            if (!active.has(uuid)) this.destroyHelper(uuid);
        });
    },

    clearHelpersOnly() {
        Array.from(this.helpers.keys()).forEach(uuid => this.destroyHelper(uuid));
    },

    clear() {
        this.clearMoveIndicator();
        this.clearHelpersOnly();
        unregisterLightManagerCanvasGizmo(this.group);
        if (this.group && this.group.parent) this.group.parent.remove(this.group);
        this.group = null;
    },

    getPreviewFromEvent(event) {
        if (!event || !event.target) return window.Preview && Preview.selected;
        const target = event.target;
        const canvas = target.tagName === 'CANVAS'
            ? target
            : (typeof target.closest === 'function' ? target.closest('.preview canvas') : null);
        return (canvas && canvas.preview) || (window.Preview && Preview.selected) || null;
    },

    getRayFromEvent(event, preview) {
        if (!preview || !preview.canvas || !preview.camera) return null;
        const rect = preview.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, preview.camera);
        return this.raycaster.ray.clone();
    },

    raycastHandles(event, preview) {
        const group = this.group;
        if (!group || !group.visible) return null;
        const ray = this.getRayFromEvent(event, preview);
        if (!ray) return null;
        const objects = [];
        group.traverse(object => {
            if (object.visible !== false && object.userData && object.userData.lightManagerHandle) objects.push(object);
        });
        if (!objects.length) return null;
        const intersects = this.raycaster.intersectObjects(objects, false);
        return intersects.find(hit => hit.object?.userData?.lightManagerHandle) || null;
    },

    createCameraPlane(preview, point) {
        const normal = new THREE.Vector3(0, 0, -1);
        if (preview && preview.camera) preview.camera.getWorldDirection(normal);
        return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
    },

    projectEventToPlane(event, preview, plane) {
        const ray = this.getRayFromEvent(event, preview);
        if (!ray) return null;
        const point = new THREE.Vector3();
        return ray.intersectPlane(plane, point) ? point : null;
    },

    stopEvent(event) {
        if (!event) return;
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    },

    getLightByUuid(uuid) {
        return window.OutlinerNode && OutlinerNode.uuids ? OutlinerNode.uuids[uuid] : null;
    },

    beginHandleDrag(light, handleData, hitPoint, preview, event) {
        if (!light || !handleData || !hitPoint || !preview) return;
        Undo.initEdit({ elements: [light] });
        this.drag = {
            mode: 'light_handle',
            light,
            handle: handleData.type,
            axis: handleData.axis || null,
            sign: handleData.sign || 1,
            preview,
            plane: this.createCameraPlane(preview, hitPoint),
            label: this.getHandleUndoLabel(handleData.type),
            startPoint: hitPoint.clone(),
            start: {
                distance: light.distance,
                angle: light.angle,
                penumbra: light.penumbra,
                shadow_near: light.shadow_near,
                shadow_far: light.shadow_far,
                shadow_bounds: light.shadow_bounds,
                rotation: Array.isArray(light.rotation) ? light.rotation.slice() : [0, 0, 0]
            }
        };
        this.stopEvent(event);
        this.updateHandleDrag(event);
    },

    getHandleUndoLabel(handle) {
        if (handle.startsWith('art_')) return translateLightManager('light_manager.art.edit');
        if (handle === 'aim') return translateLightManager('light_manager.undo.aim_light');
        if (handle === 'range') return translateLightManager('light_manager.undo.adjust_range');
        if (handle === 'cone_angle') return translateLightManager('light_manager.undo.change_cone_angle');
        if (handle === 'penumbra') return translateLightManager('light_manager.undo.change_penumbra');
        if (handle === 'shadow_bounds') return translateLightManager('light_manager.undo.change_shadow_bounds');
        return translateLightManager('light_manager.undo.change_shadow_clip');
    },

    getLocalDragPoint(light, worldPoint) {
        const helper = light && this.helpers.get(light.uuid);
        if (!helper || !helper.root) return null;
        const local = worldPoint.clone();
        helper.root.worldToLocal(local);
        return local;
    },

    updateHandleDrag(event) {
        const drag = this.drag;
        if (!drag || drag.mode !== 'light_handle') return;
        const point = this.projectEventToPlane(event, drag.preview, drag.plane);
        if (!point) return;
        const light = drag.light;
        const local = this.getLocalDragPoint(light, point);
        if (!local) return;

        if (drag.handle === 'art_point') {
            light.art_point = local.toArray();
            this.refreshLight(light, 'art_point');
            return;
        }
        if (drag.handle === 'art_size') {
            light.art_size = window.LightManagerArtKeys.size(light);
            light.art_size[['x', 'y', 'z'].indexOf(drag.axis)] = Math.max(0.01, Math.abs(local[drag.axis]) * 2);
            this.refreshLight(light, 'art_size');
            return;
        }
        if (drag.handle === 'aim') {
            window.LightManagerFitTool?.setLightLookAt(light, point);
            this.refreshLight(light, 'rotation');
            return;
        }

        if (drag.handle === 'range') {
            const value = light.light_type === 'spot'
                ? Math.max(0.001, -local.z)
                : Math.max(0, Math.sqrt(local.x * local.x + local.y * local.y + local.z * local.z));
            light.distance = LightManagerUtils.num(value, drag.start.distance || value, 0, 100000);
            this.refreshLight(light, 'distance');
            return;
        }

        if (drag.handle === 'cone_angle') {
            const depth = Math.max(0.001, -local.z);
            const radial = Math.sqrt(local.x * local.x + local.y * local.y);
            light.angle = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(Math.atan2(radial, depth)), 0.1, 89.9);
            this.refreshLight(light, 'angle');
            return;
        }

        if (drag.handle === 'penumbra') {
            const range = Math.max(0.001, this.getRange(light, 8));
            const angle = THREE.MathUtils.degToRad(LightManagerUtils.num(light.angle, 45, 0.1, 89.9));
            const outerRadius = Math.max(0.001, Math.tan(angle) * range);
            const innerRadius = Math.sqrt(local.x * local.x + local.y * local.y);
            light.penumbra = THREE.MathUtils.clamp(1 - innerRadius / outerRadius, 0, 1);
            this.refreshLight(light, 'penumbra');
            return;
        }

        if (drag.handle === 'shadow_bounds') {
            const previousShadowContext = { ...light };
            const value = drag.axis === 'y' ? Math.abs(local.y) : Math.abs(local.x);
            light.shadow_bounds = LightManagerUtils.num(value, drag.start.shadow_bounds || value, 0.001, 100000);
            LightManagerUtils.applyAutomaticShadowNormalBias(light, previousShadowContext);
            this.refreshLight(light, 'shadow_bounds');
            return;
        }

        if (drag.handle === 'shadow_near') {
            const previousShadowContext = { ...light };
            light.shadow_near = LightManagerUtils.num(Math.max(0, -local.z), drag.start.shadow_near || 0.1, 0, 99999);
            if (light.shadow_far <= light.shadow_near) light.shadow_far = light.shadow_near + 0.001;
            LightManagerUtils.applyAutomaticShadowNormalBias(light, previousShadowContext);
            this.refreshLight(light, 'shadow_near');
            return;
        }

        if (drag.handle === 'shadow_far') {
            const previousShadowContext = { ...light };
            light.shadow_far = Math.max((light.shadow_near ?? 0.1) + 0.001, LightManagerUtils.num(Math.max(0.001, -local.z), drag.start.shadow_far || 200, 0.001, 100000));
            LightManagerUtils.applyAutomaticShadowNormalBias(light, previousShadowContext);
            this.refreshLight(light, 'shadow_far');
        }
    },

    getLightUpdateOptions(property) {
        if (property.startsWith('art_')) return { shadows: false, scene: false, gizmos: true };
        if (property === 'distance') return { shadows: false, scene: false, gizmos: true };
        if (['angle', 'penumbra', 'rotation', 'shadow_bounds', 'shadow_near', 'shadow_far'].includes(property)) {
            return { shadows: true, scene: false, gizmos: true };
        }
        return {};
    },

    refreshLight(light, property) {
        LightManagerUtils.sanitizeLight(light);
        if (property === 'rotation' && Array.isArray(light.rotation)) {
            light.render_rotation = light.rotation.slice();
        }
        if (window.LightElement?.preview_controller) {
            if (property === 'rotation' || property === 'position') {
                LightElement.preview_controller.updateTransform(light);
            }
            LightElement.preview_controller.updateSelection(light, { gizmos: false });
        }
        window.update_light_element_callback?.({
            ...this.getLightUpdateOptions(property),
            elements: [light],
            cleanup: false,
            artKey: light.light_type === 'art_key' || property.startsWith('art_')
        });
    },

    getMovableSelection() {
        const selected = window.Outliner && Array.isArray(Outliner.selected) ? Outliner.selected : [];
        return selected.filter(element => {
            if (!element || element.locked) return false;
            if (window.LightElement && element instanceof LightElement) return true;
            if (Array.isArray(element.position)) return true;
            if (Array.isArray(element.from) && Array.isArray(element.to)) return true;
            return false;
        });
    },

    requestFreeMove(event) {
        if (!this.getMovableSelection().length) {
            Blockbench.showQuickMessage(translateLightManager('light_manager.message.free_move_none'));
            return false;
        }
        this.pendingFreeMove = true;
        Blockbench.showQuickMessage(translateLightManager('light_manager.message.free_move_wait'));
        if (event) this.stopEvent(event);
        return true;
    },

    captureElementTransform(element) {
        const world = this.getElementWorldPosition(element);
        return {
            element,
            world,
            position: Array.isArray(element.position) ? element.position.slice() : null,
            from: Array.isArray(element.from) ? element.from.slice() : null,
            to: Array.isArray(element.to) ? element.to.slice() : null,
            origin: Array.isArray(element.origin) ? element.origin.slice() : null
        };
    },

    getElementWorldPosition(element) {
        const world = new THREE.Vector3();
        if (element && element.mesh) {
            element.mesh.updateMatrixWorld(true);
            element.mesh.getWorldPosition(world);
        } else if (Array.isArray(element.origin)) {
            world.fromArray(element.origin);
        } else if (Array.isArray(element.position)) {
            world.fromArray(element.position);
        }
        return world;
    },

    getFreeMoveGridSize(event) {
        const overrides = typeof Pressing !== 'undefined' ? Pressing.overrides : window.Pressing?.overrides;
        const shift = !!(event?.shiftKey || overrides?.shift);
        const ctrl = !!(
            event?.ctrlOrCmd
            || event?.ctrlKey
            || event?.metaKey
            || overrides?.ctrl
        );
        if (typeof canvasGridSize === 'function') {
            const nativeSize = canvasGridSize(shift, ctrl);
            if (Number.isFinite(nativeSize) && nativeSize > 0) return nativeSize;
        }

        const settingId = ctrl && shift
            ? 'ctrl_shift_size'
            : ctrl
                ? 'ctrl_size'
                : shift
                    ? 'shift_size'
                    : 'edit_size';
        const fallbackResolution = settingId === 'edit_size' ? 16 : settingId === 'shift_size' ? 64 : settingId === 'ctrl_size' ? 160 : 640;
        const nativeSettings = typeof settings !== 'undefined' ? settings : window.settings;
        const configuredResolution = Number(nativeSettings?.[settingId]?.value);
        const resolution = THREE.MathUtils.clamp(
            Number.isFinite(configuredResolution) ? configuredResolution : fallbackResolution,
            1,
            settingId === 'edit_size' ? 512 : 4096
        );
        return 16 / resolution;
    },

    snapFreeMoveDelta(delta, event) {
        const gridSize = this.getFreeMoveGridSize(event);
        delta.x = Math.round(delta.x / gridSize) * gridSize;
        delta.y = Math.round(delta.y / gridSize) * gridSize;
        delta.z = Math.round(delta.z / gridSize) * gridSize;
        return delta;
    },

    beginFreeMoveDrag(event, preview) {
        const elements = this.getMovableSelection();
        if (!elements.length || !preview) {
            this.pendingFreeMove = false;
            return;
        }
        const center = new THREE.Vector3();
        elements.forEach(element => center.add(this.getElementWorldPosition(element)));
        center.divideScalar(elements.length || 1);
        const plane = this.createCameraPlane(preview, center);
        const startPoint = this.projectEventToPlane(event, preview, plane);
        if (!startPoint) return;

        Undo.initEdit({ elements });
        this.drag = {
            mode: 'free_move',
            preview,
            plane,
            startPoint,
            axis: null,
            label: translateLightManager('light_manager.undo.free_move'),
            elements: elements.map(element => this.captureElementTransform(element))
        };
        this.pendingFreeMove = false;
        this.updateMoveIndicator(startPoint, startPoint, null);
        this.stopEvent(event);
    },

    applyFreeMoveDrag(event) {
        const drag = this.drag;
        if (!drag || drag.mode !== 'free_move') return;
        const point = this.projectEventToPlane(event, drag.preview, drag.plane);
        if (!point) return;
        let delta = point.clone().sub(drag.startPoint);
        if (drag.axis && this.axisVectors[drag.axis]) {
            const axis = this.axisVectors[drag.axis];
            delta = axis.clone().multiplyScalar(delta.dot(axis));
        }
        this.snapFreeMoveDelta(delta, event);
        drag.elements.forEach(entry => this.applyWorldDelta(entry, delta));
        this.refreshMovedElements(drag.elements.map(entry => entry.element));
        this.updateMoveIndicator(drag.startPoint, drag.startPoint.clone().add(delta), drag.axis);
    },

    applyWorldDelta(entry, worldDelta) {
        const element = entry.element;
        const localDelta = this.getLocalDelta(element, entry.world, worldDelta);
        const add = (array, original) => {
            if (!array || !original) return;
            array[0] = original[0] + localDelta.x;
            array[1] = original[1] + localDelta.y;
            array[2] = original[2] + localDelta.z;
        };
        add(element.position, entry.position);
        add(element.from, entry.from);
        add(element.to, entry.to);
        if (entry.origin && (!entry.position || entry.from || entry.to)) add(element.origin, entry.origin);
    },

    getLocalDelta(element, worldStart, worldDelta) {
        if (!element || !element.mesh || !element.mesh.parent) return worldDelta.clone();
        const parent = element.mesh.parent;
        parent.updateMatrixWorld(true);
        const localStart = worldStart.clone();
        const localEnd = worldStart.clone().add(worldDelta);
        parent.worldToLocal(localStart);
        parent.worldToLocal(localEnd);
        return localEnd.sub(localStart);
    },

    refreshMovedElements(elements) {
        const lightElements = elements.filter(element => window.LightElement && element instanceof LightElement);
        if (window.Canvas && typeof Canvas.updateView === 'function') {
            Canvas.updateView({
                elements,
                element_aspects: { transform: true }
            });
        }
        lightElements.forEach(light => {
            LightManagerUtils.sanitizeLight(light);
            LightElement.preview_controller?.updateSelection(light, { gizmos: false });
        });
        if (lightElements.length) {
            window.update_light_element_callback?.({
                shadows: true,
                scene: false,
                gizmos: false,
                elements: lightElements,
                cleanup: false
            });
        }
        window.LightManagerAreaGizmos?.updateAll();
        this.updateAll();
    },

    finishDrag() {
        if (!this.drag) return;
        const label = this.drag.label;
        Undo.finishEdit(label);
        this.drag = null;
        this.clearMoveIndicator();
        updateSelection();
        window.LightManagerAreaGizmos?.updateAll();
        this.updateAll();
    },

    cancelDrag(revert = false) {
        if (!this.drag) return;
        Undo.cancelEdit(!!revert);
        this.drag = null;
        this.clearMoveIndicator();
        updateSelection();
        window.LightManagerAreaGizmos?.updateAll();
        this.updateAll();
    },

    onPointerDown(event) {
        if (!this.isEditMode() || event.button !== 0) return;
        if (!this.canShowViewportGizmos()) return;
        const preview = this.getPreviewFromEvent(event);
        if (!preview || !preview.canvas || event.target !== preview.canvas) return;

        if (this.pendingFreeMove) {
            this.beginFreeMoveDrag(event, preview);
            return;
        }

        if (!this.isHandleToolAllowed()) return;
        const hit = this.raycastHandles(event, preview);
        if (!hit) return;
        const handleData = hit.object.userData.lightManagerHandle;
        const light = this.getLightByUuid(handleData.uuid);
        if (!light || light.locked) return;
        this.beginHandleDrag(light, handleData, hit.point, preview, event);
    },

    onPointerMove(event) {
        if (!this.drag) return;
        this.stopEvent(event);
        if (this.drag.mode === 'light_handle') this.updateHandleDrag(event);
        else if (this.drag.mode === 'free_move') this.applyFreeMoveDrag(event);
    },

    onPointerUp(event) {
        if (!this.drag) return;
        this.stopEvent(event);
        this.finishDrag();
    },

    onKeyDown(event) {
        if (!this.drag && !this.pendingFreeMove) return;
        const key = String(event.key || '').toLowerCase();
        if (key === 'escape') {
            this.pendingFreeMove = false;
            this.cancelDrag(true);
            this.stopEvent(event);
            return;
        }
        if (!this.drag || this.drag.mode !== 'free_move') return;
        if (['x', 'y', 'z'].includes(key)) {
            this.drag.axis = this.drag.axis === key ? null : key;
            const message = this.drag.axis
                ? formatLightManagerMessage('light_manager.message.free_move_axis', { axis: this.drag.axis.toUpperCase() })
                : translateLightManager('light_manager.message.free_move_axis_free');
            Blockbench.showQuickMessage(message);
            this.stopEvent(event);
        }
    }
};

window.LightManagerFitTool = {
    getSelectedLights() {
        if (!window.LightElement || !Array.isArray(window.LightElement.selected)) return [];
        return window.LightElement.selected.filter(light => light && light.mesh);
    },

    addSelectionList(target, list) {
        if (!list) return;
        if (Array.isArray(list)) {
            list.forEach(item => target.push(item));
        } else if (typeof list[Symbol.iterator] === 'function') {
            Array.from(list).forEach(item => target.push(item));
        } else {
            target.push(list);
        }
    },

    getRawSelection() {
        const nodes = [];

        if (typeof selected !== 'undefined') this.addSelectionList(nodes, selected);
        if (typeof Cube !== 'undefined') this.addSelectionList(nodes, Cube.selected);
        if (typeof Group !== 'undefined') this.addSelectionList(nodes, Group.selected);
        if (typeof Mesh !== 'undefined') this.addSelectionList(nodes, Mesh.selected);
        if (typeof TextureMesh !== 'undefined') this.addSelectionList(nodes, TextureMesh.selected);
        if (typeof Billboard !== 'undefined') this.addSelectionList(nodes, Billboard.selected);
        if (typeof Locator !== 'undefined') this.addSelectionList(nodes, Locator.selected);
        if (typeof NullObject !== 'undefined') this.addSelectionList(nodes, NullObject.selected);
        if (window.BedrockBlockElement) this.addSelectionList(nodes, window.BedrockBlockElement.selected);
        if (window.BedrockBakedChunkElement) this.addSelectionList(nodes, window.BedrockBakedChunkElement.selected);

        return nodes.filter(Boolean);
    },

    isLightNode(node) {
        return !!node && (
            node.type === 'light' ||
            (window.LightElement && node instanceof window.LightElement)
        );
    },

    addTargetNode(node, target, seen) {
        if (!node || this.isLightNode(node) || node.visibility === false) return;

        const key = node.uuid || node;
        if (seen.has(key)) return;
        seen.add(key);

        if (node.mesh) target.push(node);

        // Bedrock Structure Studio parents its real chunk geometry under the
        // selected structure/layer Group mesh. Descending into its logical
        // Outliner children would collect the same vertices repeatedly.
        if (node.mcstructure_baked_group === true || node.mcstructure_baked_layer) return;

        if (Array.isArray(node.children)) {
            node.children.forEach(child => this.addTargetNode(child, target, seen));
        }
    },

    getSelectedTargets() {
        const targets = [];
        const seen = new Set();

        this.getRawSelection().forEach(node => this.addTargetNode(node, targets, seen));

        return targets;
    },

    canFit() {
        return this.getSelectedLights().length > 0 && this.getSelectedTargets().length > 0;
    },

    collectObjectPoints(object, points) {
        if (!object) return;
        if (typeof object.updateMatrixWorld === 'function') object.updateMatrixWorld(true);

        const isEffectivelyVisible = child => {
            let current = child;
            while (current) {
                if (current.visible === false) return false;
                current = current.parent;
            }
            return true;
        };

        const startCount = points.length;
        const visit = child => {
            if (!child || child.type === 'Sprite') return;
            if (!isEffectivelyVisible(child)) return;
            if (!child.geometry || !child.geometry.attributes || !child.geometry.attributes.position) return;

            if (typeof child.updateMatrixWorld === 'function') child.updateMatrixWorld(true);
            const position = child.geometry.attributes.position;
            for (let i = 0; i < position.count; i++) {
                points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld));
            }
        };

        if (typeof object.traverse === 'function') object.traverse(visit);
        else visit(object);

        if (points.length !== startCount) return;

        // The vertex path above already covers visible descendant geometry.
        // Restrict the fallback to the target's own geometry: setFromObject on
        // a Group ignores child visibility and would make hidden Bedrock render
        // layers leak back into Light Manager / Environment fit bounds.
        if (!object.isObject3D || !object.geometry || !isEffectivelyVisible(object)) return;

        const box = new THREE.Box3().setFromObject(object);
        if (box.isEmpty()) return;

        const min = box.min;
        const max = box.max;
        points.push(
            new THREE.Vector3(min.x, min.y, min.z),
            new THREE.Vector3(max.x, min.y, min.z),
            new THREE.Vector3(max.x, max.y, min.z),
            new THREE.Vector3(min.x, max.y, min.z),
            new THREE.Vector3(min.x, min.y, max.z),
            new THREE.Vector3(max.x, min.y, max.z),
            new THREE.Vector3(max.x, max.y, max.z),
            new THREE.Vector3(min.x, max.y, max.z)
        );
    },

    collectTargetPoints(targets) {
        const points = [];
        targets.forEach(target => this.collectObjectPoints(target.mesh, points));
        return points;
    },

    getPointsBox(points) {
        const box = new THREE.Box3();
        points.forEach(point => box.expandByPoint(point));
        return box;
    },

    getLightBasis(light) {
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        light.mesh.updateMatrixWorld(true);
        light.mesh.getWorldPosition(position);
        light.mesh.getWorldQuaternion(quaternion);
        return { position, quaternion, inverse: quaternion.clone().invert() };
    },

    getLightSpacePoints(light, points) {
        const basis = this.getLightBasis(light);
        return {
            basis,
            points: points.map(point => point.clone().sub(basis.position).applyQuaternion(basis.inverse))
        };
    },

    setLightLookAt(light, target) {
        if (!light.mesh) return false;

        const position = new THREE.Vector3();
        light.mesh.updateMatrixWorld(true);
        light.mesh.getWorldPosition(position);

        const direction = target.clone().sub(position);
        if (direction.lengthSq() < 1e-8) return false;
        direction.normalize();

        const worldQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
        const localQuaternion = worldQuaternion.clone();

        if (light.mesh.parent) {
            const parentQuaternion = new THREE.Quaternion();
            light.mesh.parent.updateMatrixWorld(true);
            light.mesh.parent.getWorldQuaternion(parentQuaternion);
            localQuaternion.copy(parentQuaternion.invert()).multiply(worldQuaternion);
        }

        const order = Format.euler_order || 'ZYX';
        const euler = new THREE.Euler().setFromQuaternion(localQuaternion, order);
        light.rotation = [
            THREE.MathUtils.radToDeg(euler.x),
            THREE.MathUtils.radToDeg(euler.y),
            THREE.MathUtils.radToDeg(euler.z)
        ];
        light.render_rotation = light.rotation.slice();
        light.mesh.rotation.copy(euler);
        light.mesh.updateMatrixWorld(true);
        return true;
    },

    getDistanceStats(light, points) {
        const position = new THREE.Vector3();
        light.mesh.getWorldPosition(position);

        let minDistance = Infinity;
        let maxDistance = 0;
        points.forEach(point => {
            const distance = point.distanceTo(position);
            minDistance = Math.min(minDistance, distance);
            maxDistance = Math.max(maxDistance, distance);
        });

        return { minDistance, maxDistance };
    },

    fitPoint(light, points, margin) {
        const stats = this.getDistanceStats(light, points);
        const far = Math.max(0.001, stats.maxDistance + margin);
        const near = Math.max(0.01, Math.min(far - 0.001, stats.minDistance - margin));

        light.distance = far;
        light.shadow_near = near;
        light.shadow_far = Math.max(near + 0.001, far);
    },

    fitDirectional(light, points, margin) {
        const data = this.getLightSpacePoints(light, points);
        let maxXY = 0;
        let minDepth = Infinity;
        let maxDepth = 0;
        let hasBehindPoints = false;

        data.points.forEach(point => {
            maxXY = Math.max(maxXY, Math.abs(point.x), Math.abs(point.y));
            const depth = -point.z;
            if (depth <= 0) hasBehindPoints = true;
            minDepth = Math.min(minDepth, depth);
            maxDepth = Math.max(maxDepth, depth);
        });

        const depthSpan = Math.max(0.001, maxDepth - minDepth);
        const safetyMargin = Math.max(
            margin,
            maxXY * 0.08,
            depthSpan * 0.08,
            0.25
        );

        const bounds = Math.max(0.001, maxXY + safetyMargin);
        const far = Math.max(0.001, maxDepth + safetyMargin);
        const near = Math.max(
            0.01,
            Math.min(far - 0.001, minDepth - safetyMargin)
        );

        light.shadow_bounds = bounds;
        light.shadow_near = near;
        light.shadow_far = Math.max(near + 0.001, far);
        return { hasBehindPoints };
    },

    fitSpot(light, points, margin, angleMargin) {
        const data = this.getLightSpacePoints(light, points);
        const stats = this.getDistanceStats(light, points);
        let minDepth = Infinity;
        let maxDepth = 0;
        let maxAngle = 0;
        let hasBehindPoints = false;

        data.points.forEach(point => {
            const depth = -point.z;
            const radial = Math.sqrt(point.x * point.x + point.y * point.y);
            if (depth <= 0) {
                hasBehindPoints = true;
                maxAngle = Math.PI / 2;
            } else {
                maxAngle = Math.max(maxAngle, Math.atan2(radial + margin, depth));
            }
            minDepth = Math.min(minDepth, depth);
            maxDepth = Math.max(maxDepth, depth);
        });

        const far = Math.max(0.001, stats.maxDistance + margin, maxDepth + margin);
        const near = Math.max(0.01, Math.min(far - 0.001, minDepth - margin));
        const angle = THREE.MathUtils.clamp(
            THREE.MathUtils.radToDeg(maxAngle) + angleMargin,
            0.1,
            89.9
        );

        light.distance = far;
        light.angle = angle;
        light.shadow_near = near;
        light.shadow_far = Math.max(near + 0.001, far);
        return { hasBehindPoints };
    },

    fit(options = {}) {
        const margin = Math.max(0, this.num(options.margin, 0));
        const angleMargin = Math.max(0, this.num(options.angle_margin, 0));
        const aimToCenter = options.aim_to_center !== false;
        const lights = this.getSelectedLights();
        const targets = this.getSelectedTargets();
        const points = this.collectTargetPoints(targets);

        if (!lights.length) {
            Blockbench.showQuickMessage(translateLightManager('light_manager.message.select_lights_first'));
            return;
        }
        if (!targets.length || !points.length) {
            Blockbench.showQuickMessage(translateLightManager('light_manager.message.select_targets_first'));
            return;
        }

        const center = this.getPointsBox(points).getCenter(new THREE.Vector3());
        let clippedLights = 0;

        Undo.initEdit({ elements: lights });
        lights.forEach(light => {
            const previousShadowContext = { ...light };
            if (aimToCenter && (light.light_type === 'directional' || light.light_type === 'spot')) {
                this.setLightLookAt(light, center);
            }

            let result = null;
            if (light.light_type === 'directional') result = this.fitDirectional(light, points, margin);
            else if (light.light_type === 'spot') result = this.fitSpot(light, points, margin, angleMargin);
            else this.fitPoint(light, points, margin);

            if (result && result.hasBehindPoints) clippedLights++;

            LightManagerUtils.applyAutomaticShadowNormalBias(light, previousShadowContext);
            light.render_rotation = light.rotation.slice();
            light.render_intensity = light.intensity;
            light.render_color = light.color;

            if (window.LightElement?.preview_controller) {
                window.LightElement.preview_controller.updateTransform(light);
                window.LightElement.preview_controller.updateSelection(light);
            }
        });
        Undo.finishEdit(translateLightManager('light_manager.undo.fit_to_selection'));

        updateSelection();
        window.update_light_element_callback?.();
        window.LightManagerAreaGizmos?.updateAll();

        const targetText = formatLightManagerCount(targets.length, 'light_manager.count.target.one', 'light_manager.count.target.many');
        const lightText = formatLightManagerCount(lights.length, 'light_manager.count.light.one', 'light_manager.count.light.many');
        Blockbench.showQuickMessage(formatLightManagerMessage('light_manager.message.fit_complete', {
            lights: lightText,
            targets: targetText
        }));
        if (clippedLights > 0 && !aimToCenter) {
            Blockbench.showQuickMessage(translateLightManager('light_manager.message.behind_points'));
        }
    },

    num(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    },

    openDialog() {
        if (!this.getSelectedLights().length) {
            Blockbench.showQuickMessage(translateLightManager('light_manager.message.select_lights_first'));
            return;
        }
        if (!this.getSelectedTargets().length) {
            Blockbench.showQuickMessage(translateLightManager('light_manager.message.select_targets_too'));
            return;
        }

        new Dialog('fit_light_bounds_dialog', {
            title: translateLightManager('light_manager.dialog.fit.title'),
            form: {
                margin: {
                    label: translateLightManager('light_manager.dialog.fit.margin'),
                    type: 'number',
                    value: 0,
                    min: 0,
                    step: 0.1,
                    description: translateLightManager('light_manager.dialog.fit.margin.desc')
                },
                angle_margin: {
                    label: translateLightManager('light_manager.dialog.fit.angle_margin'),
                    type: 'number',
                    value: 0,
                    min: 0,
                    max: 45,
                    step: 0.1,
                    description: translateLightManager('light_manager.dialog.fit.angle_margin.desc')
                },
                aim_to_center: {
                    label: translateLightManager('light_manager.dialog.fit.aim_to_center'),
                    type: 'checkbox',
                    value: true,
                    description: translateLightManager('light_manager.dialog.fit.aim_to_center.desc')
                }
            },
            onConfirm: form => {
                this.fit(form);
            }
        }).show();
    }
};

/*
 * Do not patch THREE.ShaderChunk.common here. Three r129 owns the punctual
 * attenuation helper in <bsdfs>; a global copy collides with stock
 * Lambert/Phong materials. Shader Architect provides its compatibility
 * overload only inside custom shaders that consume <lights_pars_begin>
 * without also consuming <bsdfs>.
 */

if (typeof window.on_light_element_updated !== 'function') {
    window.on_light_element_updated = () => { };
}

function runLightManagerElementUpdate(options = LIGHT_MANAGER_DEFAULT_UPDATE_OPTIONS) {
    if (!window.scene) return;

    const updateOptions = normalizeLightManagerUpdateOptions(options);

    if (updateOptions.shadows) {
        configureLightManagerRenderers();
    }

    if (updateOptions.scene) {
        configureLightManagerSceneShadowMeshes();
    }

    if (!window.three_lights_group) {
        window.three_lights_group = new THREE.Group();
        window.three_lights_group.name = 'light_manager_group';
        ownedThreeLightsGroup = window.three_lights_group;
        window.scene.add(window.three_lights_group);
    }

    // A direct control edit only needs to touch the edited light. Full
    // registry scans are reserved for project/lifecycle and deletion updates.
    const allLights = typeof LightElement !== 'undefined' && Array.isArray(LightElement.all)
        ? LightElement.all
        : [];
    const targetLights = updateOptions.elements
        ? updateOptions.elements.filter(element => allLights.includes(element))
        : allLights;

    // Keep track of active UUIDs to remove deleted lights on full updates.
    const activeUuids = LIGHT_MANAGER_UPDATE_STATE.activeUuids;
    if (updateOptions.cleanup) {
        activeUuids.clear();
        // A scoped deletion notification may contain only removed elements.
        // Ownership still comes from the complete live registry; otherwise a
        // scoped cleanup would retire unrelated lights that remain in the model.
        allLights.forEach(element => activeUuids.add(element.uuid));
    }

    if (targetLights.length) {
        targetLights.forEach(element => {
            LightManagerUtils.sanitizeLight(element);
            if (updateOptions.cleanup) activeUuids.add(element.uuid);

            let light = window.three_lights[element.uuid];
            if (element.light_type === 'art_key') {
                if (light) disposeLightManagerThreeLightObject(light);
                delete window.three_lights[element.uuid];
                return;
            }

            // Determine required THREE light type based on user config
            let LightConstructor = getLightManagerThreeLightConstructor(element) || THREE.PointLight;

            // Recreate if type changed or it doesn't exist
            if (!light || light.constructor !== LightConstructor) {
                if (light) {
                    if (updateOptions.preserveTopology) {
                        retireLightManagerThreeLight(light);
                    } else {
                        disposeLightManagerThreeLightObject(light);
                    }
                }

                const safeColor = LightManagerUtils.colorArray(element.color);
                const colorHex = new THREE.Color(safeColor[0] / 255, safeColor[1] / 255, safeColor[2] / 255).getHex();
                light = updateOptions.preserveTopology
                    ? acquireRetiredLightManagerThreeLight(LightConstructor)
                    : null;
                if (!light) light = new LightConstructor(colorHex, element.intensity);

                // Shadow initialization is now handled dynamically in the sync phase below

                window.three_lights_group.add(light);
                if (light.target) {
                    window.three_lights_group.add(light.target);
                }
                window.three_lights[element.uuid] = light;
            }

            // Sync properties
            const safeColor = LightManagerUtils.colorArray(element.render_color || element.color);
            light.color.setRGB(safeColor[0] / 255, safeColor[1] / 255, safeColor[2] / 255);
            const activeIntensity = LightManagerUtils.num(
                element.render_intensity ?? element.intensity,
                element.intensity,
                0,
                100000
            );
            light.userData = light.userData || {};
            light.userData.lightManagerElementUuid = element.uuid;
            light.userData.lightManagerActiveIntensity = activeIntensity;
            light.intensity = isLightManagerElementHierarchyVisible(element) ? activeIntensity : 0;
            light.visible = true;

            const requestedCastShadow = element.has_shadow !== false;
            if (requestedCastShadow) light.userData.lightManagerRetainShadowSlot = true;
            light.castShadow = requestedCastShadow ||
                light.userData.lightManagerRetainShadowSlot === true;
            if (light.shadow) {
                if (updateOptions.shadows && requestedCastShadow) {
                    light.shadow.needsUpdate = true;
                } else if (light.castShadow) {
                    light.shadow.autoUpdate = false;
                    if (!requestedCastShadow) light.shadow.needsUpdate = false;
                }
            }

            // Sync dynamic shadow properties
            if (updateOptions.shadows && light.shadow) {
                const targetResolution = LightManagerUtils.getRenderShadowResolution(element, updateOptions);
                const resize = resizeLightManagerShadowMap(
                    light,
                    targetResolution,
                    updateOptions.preview?.renderer ||
                    window.LightManagerStudioRenderPreview?.renderer ||
                    window.Preview?.selected?.renderer ||
                    window.main_preview?.renderer ||
                    null
                );
                if (resize.changed) {
                    markLightManagerShadowsDirty({ elements: [element] });
                    logLightManagerShadowDebug('resolution-change', null, updateOptions, {
                        source: 'element-update',
                        resolutionChanges: [{
                            name: element.name || element.uuid,
                            uuid: element.uuid,
                            mode: updateOptions.studio ? 'studio' : 'preview',
                            ...resize
                        }]
                    });
                }

                if (syncLightManagerSingleShadowSettings(light, element, updateOptions)) {
                    markLightManagerShadowsDirty({ elements: [element] });
                }
                if (!requestedCastShadow && light.castShadow) {
                    light.shadow.autoUpdate = false;
                    light.shadow.needsUpdate = false;
                }
            }

            if (element.distance !== undefined) {
                light.distance = LightManagerUtils.num(element.distance, 0, 0, 100000);
                // Define decay explicitly to keep the shader path stable.
                // 2 is physically realistic; 0 disables decay.
                light.decay = light.distance === 0 ? 0 : 2;
            }

            if (element.light_type === 'spot') {
                if (element.angle !== undefined) light.angle = THREE.MathUtils.degToRad(LightManagerUtils.num(element.angle, 45, 0.1, 89.9));
                if (element.penumbra !== undefined) light.penumbra = LightManagerUtils.num(element.penumbra, 0, 0, 1);
            }

            // Sync Position and Rotation
            if (element.mesh) {
                const worldPos = LIGHT_MANAGER_UPDATE_STATE.worldPosition;
                const worldQuat = LIGHT_MANAGER_UPDATE_STATE.worldQuaternion;
                element.mesh.getWorldPosition(worldPos);
                element.mesh.getWorldQuaternion(worldQuat);

                light.position.copy(worldPos);

                if (light.target) {
                    const direction = LIGHT_MANAGER_UPDATE_STATE.worldDirection.set(0, 0, -1);
                    direction.applyQuaternion(worldQuat);
                    light.target.position.copy(worldPos).add(direction);
                    light.target.updateMatrixWorld(true);
                }
            }
        });
    }

    // Cleanup deleted lights only when the caller requested a registry pass.
    if (updateOptions.cleanup) {
        for (const uuid in window.three_lights) {
            const light = window.three_lights[uuid];
            if (light?.userData?.lightflowEnvironmentVirtual) continue;
            if (!activeUuids.has(uuid)) {
                if (light) {
                    if (updateOptions.preserveTopology) {
                        retireLightManagerThreeLight(light);
                    } else {
                        disposeLightManagerThreeLightObject(light);
                    }
                }
                delete window.three_lights[uuid];
            }
        }
    }

    if (updateOptions.gizmos) {
        window.LightManagerAreaGizmos?.updateAll();
        window.LightManagerViewportControls?.updateAll();
    }

    // Reconcile the complete registry once after scoped edits. This happens
    // before Shader Architect receives the update event, so its warm-up key
    // observes the bounded preview topology instead of compiling a transient
    // all-point-shadows variant.
    if (typeof applyLightManagerPreviewShadowBudget === 'function') {
        applyLightManagerPreviewShadowBudget(updateOptions);
    }

    if (updateOptions.shadows) {
        syncLightManagerShadowSignature(updateOptions);
        invalidateLightManagerShadowMaps();
    }

    window.on_light_element_updated?.(updateOptions);
}

function flushLightManagerElementUpdate() {
    LIGHT_MANAGER_UPDATE_STATE.frame = null;
    const options = LIGHT_MANAGER_UPDATE_STATE.options || LIGHT_MANAGER_DEFAULT_UPDATE_OPTIONS;
    LIGHT_MANAGER_UPDATE_STATE.options = null;

    if (LIGHT_MANAGER_UPDATE_STATE.running) {
        LIGHT_MANAGER_UPDATE_STATE.rerun = true;
        LIGHT_MANAGER_UPDATE_STATE.options = mergeLightManagerUpdateOptions(
            LIGHT_MANAGER_UPDATE_STATE.options,
            options
        );
        return;
    }

    LIGHT_MANAGER_UPDATE_STATE.running = true;
    try {
        runLightManagerElementUpdate(options);
    } finally {
        LIGHT_MANAGER_UPDATE_STATE.running = false;
    }

    if (LIGHT_MANAGER_UPDATE_STATE.rerun) {
        const rerunOptions = LIGHT_MANAGER_UPDATE_STATE.options || LIGHT_MANAGER_DEFAULT_UPDATE_OPTIONS;
        LIGHT_MANAGER_UPDATE_STATE.options = null;
        LIGHT_MANAGER_UPDATE_STATE.rerun = false;
        window.update_light_element_callback?.(rerunOptions);
    }
}

window.update_light_element_callback = (options = {}) => {
    const updateOptions = normalizeLightManagerUpdateOptions(options);

    // Art Keys are render-only sources. Their box, color, filters and point
    // change the per-object Glow/Rim mask without creating a THREE.Light, so
    // notify Shader Architect directly and keep the silhouette cache current.
    if (options?.artKey || (Array.isArray(options?.elements) && options.elements.some(element => element?.light_type === 'art_key'))) {
        window.ShaderArchitectInvalidateArtKeys?.();
    }

    if (lightManagerUpdateChangesTopology(updateOptions)) {
        window.ShaderEngine?.beginLightTopologyTransaction?.('light_structure_update');
    }

    if (options && options.immediate) {
        cancelLightManagerElementUpdate();
        runLightManagerElementUpdate(updateOptions);
        return;
    }

    LIGHT_MANAGER_UPDATE_STATE.options = mergeLightManagerUpdateOptions(
        LIGHT_MANAGER_UPDATE_STATE.options,
        updateOptions
    );

    if (LIGHT_MANAGER_UPDATE_STATE.frame !== null) return;

    if (typeof requestAnimationFrame === 'function') {
        LIGHT_MANAGER_UPDATE_STATE.frame = requestAnimationFrame(flushLightManagerElementUpdate);
    } else if (typeof queueMicrotask === 'function') {
        LIGHT_MANAGER_UPDATE_STATE.frame = 'microtask';
        queueMicrotask(flushLightManagerElementUpdate);
    } else {
        LIGHT_MANAGER_UPDATE_STATE.frame = 'promise';
        Promise.resolve().then(flushLightManagerElementUpdate);
    }
};

/** Converts a Kelvin color temperature to a tinycolor instance.
 * @param {number} kelvin
 * @returns {tinycolor}
 */
function kelvinToTinyColor(kelvin) {
    let temp = Math.max(1000, Math.min(40000, kelvin)) / 100;

    let r, g, b;

    if (temp <= 66) {
        r = 255;
    } else {
        r = temp - 60;
        r = 329.698727446 * Math.pow(r, -0.1332047592);
    }
    if (temp <= 66) {
        g = temp;
        g = 99.4708025861 * Math.log(g) - 161.1195681661;
    } else {
        g = temp - 60;
        g = 288.1221695283 * Math.pow(g, -0.0755148492);
    }

    if (temp >= 66) {
        b = 255;
    } else if (temp <= 19) {
        b = 0;
    } else {
        b = temp - 10;
        b = 138.5177312231 * Math.log(b) - 305.0447927307;
    }

    const clamp = (c) => Math.max(0, Math.min(255, Math.round(c)));

    return tinycolor({
        r: clamp(r),
        g: clamp(g),
        b: clamp(b)
    });
}

/**
 * Converts a CSS variable to a tinycolor instance.
 *
 * @param {string} cssVariable - The CSS variable (e.g., "var(--primary)" or "--primary").
 * @param {HTMLElement} [element=document.documentElement] - The DOM element to evaluate the variable against. Defaults to the :root element.
 * @returns {tinycolor.Instance} A tinycolor object representing the resolved color.
 */
function getTinyColorFromCssVar(cssVariable, element = document.documentElement) {
    if (typeof window === "undefined" || !window.getComputedStyle) {
        console.warn("getTinyColorFromCssVar: DOM is not available (SSR environment).");
        return tinycolor(null);
    }

    const varName = cssVariable.trim().startsWith("var(")
        ? cssVariable.slice(4, -1).trim()
        : cssVariable.trim();

    if (!varName.startsWith("--")) {
        return tinycolor(cssVariable);
    }

    const computedStyles = window.getComputedStyle(element);
    const colorValue = computedStyles.getPropertyValue(varName).trim();

    if (!colorValue) {
        console.warn(`getTinyColorFromCssVar: CSS variable "${varName}" is not defined on the provided element.`);
        return tinycolor(null);
    }

    return tinycolor(colorValue);
}

const lightIconSources = {};

[
    'generateIconBase64',
    'LightManagerMarkShadowsDirty',
    'LightManagerDebugShadows',
    'LightManagerSyncLights',
    'LightManagerPrepareRender',
    'LightManagerFlushAnimatedLights',
    'LightManagerAreaGizmos',
    'LightManagerArtKeys',
    'ArtKeyElement',
    'LightManagerViewportControls',
    'LightManagerFitTool',
    'update_light_element_callback'
].forEach(trackLightManagerWindowBinding);

/**
 * @name Light Manager
 * @author MidFord327
 * @description Adds animatable point, spot, directional lights, and render-only Art Keys to the Blockbench outliner.
 */

function initializeLightManagerPlugin() {
    Language.addTranslations('en', {
        'light_manager.ui.filter_all': 'All',
        'light_manager.ui.filter_active': 'Active',
        'light_manager.ui.filter_modified': 'Modified',
        'light_manager.ui.filter_label': 'Filter settings',
        'light_manager.ui.filter_empty': 'No matching settings. Clear the search or choose All.',
        'light_manager.ui.search': 'Find setting',
        'light_manager.ui.collapse': 'Collapse all',
        'light_manager.ui.scene': 'Scene',
        'light_manager.ui.inspector': 'Properties',
        'light_manager.ui.camera_output': 'Camera & output',
        'light_manager.ui.helpers': 'Viewport helpers',
        'light_manager.ui.helpers_contextual': 'Contextual',
        'light_manager.ui.helpers_all': 'All helpers',
        'light_manager.ui.helpers_clean': 'Clean preview',
        'light_manager.ui.helpers_hint': 'Editing guides only. Lighting, materials and environment stay the same.',
        'light_manager.ui.view_options': 'View options',
        'light_manager.ui.scene_hint': 'Adjust the scene here. Select an object in the viewport or Outliner to edit its properties.',
        'light_manager.ui.camera_hint': 'Use the current view, save a camera, or configure the output in Studio Render.',
        'light_manager.ui.layout': 'Lightflow workspace layout',
        'light_manager.ui.layout_apply': 'Use recommended layout',
        'light_manager.ui.layout_restore': 'Restore previous layout',
        'light_manager.ui.layout_description': 'Keep Material and scene settings on the left; lights and volumes on the right. Your previous Lightflow layout is kept for restoration.',
        'light_manager.ui.sun_region': 'Edit sun shadow region',
        'light_manager.ui.light_details': 'Light & shadow details',
        'light_manager.ui.selected_scope': 'Changes apply to the selected lights.',
        'light_manager.ui.no_light': 'Select a light in the viewport or Outliner to edit it.',
        'light_manager.ui.saved_cameras': 'Saved cameras',
        'light_manager.ui.add_light': 'Add light',
        'light_manager.ui.add_volume': 'Add volume',
        'light_manager.ui.create': 'Add to scene',
        'mode.render': 'Render',
        'mode.render.desc': 'Render the scene with lights and shadows.',
        'dialog.preview_options.show_light_area_gizmos': 'Show Light Area Gizmos',
        'panel.light_properties': 'LIGHT',
        'property.light_settings': 'Light Settings',
        'property.shadow_settings': 'Shadow Settings',
        'property.light_settings.compact': 'Light',
        'property.shadow_settings.compact': 'Shadows',
        'property.light_color': 'Light Color',
        'property.light_intensity': 'Intensity',
        'property.light_intensity.desc': 'The brightness of the light. Higher values produce brighter illumination.',
        'property.light_temperature': 'Temperature',
        'property.light_temperature.desc': 'Color temperature in Kelvin. Lower is warmer; higher is cooler.',
        'property.light_type': 'Light Type',
        'light_manager.art.name': 'Art Key',
        'light_manager.art.add': 'Add Art Key (Glow / Rim)',
        'light_manager.art.edit': 'Edit Art Key',
        'light_manager.art.hint': 'Controls Glow / Rim only. The box selects object centers; Include can reach outside. Drag the colored point and box handles with Edit light gizmos. Up to 8 keys per object, highest influence first.',
        'light_manager.art.source': 'Source',
        'light_manager.art.point': 'Glow point',
        'light_manager.art.direction': 'Direction',
        'light_manager.art.radius': 'Point radius',
        'light_manager.art.radius.desc': 'Broadens the Glow / Rim response around the point. The wire sphere previews the reach.',
        'light_manager.art.transform_hint': 'Move: Glow point · Rotate: direction · Scale: influence box',
        'light_manager.art.size': 'Box size',
        'light_manager.art.softness': 'Box falloff',
        'light_manager.art.scope': 'Affects',
        'light_manager.art.box': 'Inside box + included',
        'light_manager.art.only': 'Included only',
        'light_manager.art.targets': 'Include / exclude elements',
        'light_manager.art.auto': 'Box',
        'light_manager.art.include': 'Include',
        'light_manager.art.exclude': 'Exclude',
        'light_manager.art.strength': 'Glow / Rim strength',

        'property.light_type.point': 'Point',
        'property.light_type.directional': 'Directional',
        'property.light_directional_settings.disabled.desc': 'Only for directional lights.',
        'property.light_type.spot': 'Spot',
        'property.light_spot_settings.disabled.desc': 'Only for spot lights.',
        'property.distance': 'Distance',
        'property.distance.desc': 'Maximum range of the light. 0 means no limit.',
        'property.light_cone_settings': 'Spot Cone Settings',
        'property.angle': 'Cone Angle',
        'property.angle.desc': 'Angle of the spot light cone in degrees.',
        'property.penumbra': 'Penumbra',
        'property.penumbra.desc': 'Softness of the spot light cone edge (0 to 1).',
        'property.cone_angle': 'Cone Angle',
        'property.cone_angle.desc': 'Angle of the spot light cone in degrees.',
        'property.cone_penumbra': 'Penumbra',
        'property.cone_penumbra.desc': 'Softness of the spot light cone edge (0 to 1).',
        'property.cast_shadows': 'Cast Shadows',
        'property.cast_shadows.desc': 'Whether the light casts shadows. Disabling can improve performance.',
        'property.cast_shadows_off.desc': 'Cast Shadows is off.',
        'property.shadow_near': 'Shadow Near',
        'property.shadow_far': 'Shadow Far',
        'property.shadow_bounds': 'Shadow Bounds',
        'property.shadow_bounds.desc': 'Size of the shadow area for directional lights. Adjust to reduce shadow artifacts.',
        'property.shadow_clip': 'Shadow Clip',
        'property.shadow_clip.desc': 'Distance from the light where shadows start to be rendered. Adjust to reduce shadow artifacts.',
        'property.shadow_biases': 'Shadow Tuning',
        'property.shadow_biases.desc': 'Adjust shadow depth to reduce artifacts.',
        'property.shadow_resolution': 'Resolution',
        'property.shadow_resolution.desc': 'Shadow map resolution. Higher values produce sharper shadows but may reduce performance.',
        'property.studio_shadow_resolution': 'Studio Shadow',
        'property.studio_shadow_resolution.desc': 'Shadow size used only while Studio Render captures. Same keeps the viewport resolution.',
        'property.shadow_softness': 'Softness',
        'property.shadow_softness.desc': 'Softens shadow edges in shadow-map texels. Higher values reduce jagged edges; 0 keeps hard shadows.',
        'property.shadow_bias': 'Bias',
        'property.shadow_bias.desc': 'Adjusts shadow depth to reduce artifacts. Positive values can reduce shadow acne but may cause peter-panning. Default: -0.0005',
        'property.shadow_normal_bias': 'Normal Bias',
        'property.shadow_normal_bias.desc': 'Adjusts bias based on surface normal. Auto default follows shadow resolution, directional bounds, and the near/far shadow range.',
        'action.edit_light_properties': 'Edit Light Properties',
        'action.fit_light_bounds_to_selection': 'Fit Light Bounds to Selection',
        'light_manager.plugin.title': 'Light Manager',
        'light_manager.plugin.description': 'Adds animatable point, spot, directional, and render-only Art Key sources with viewport gizmos, Glow/Rim controls, shadow controls, and production presets. It is the lighting foundation for Shader Architect and Studio Render in the Lightflow suite.',
        'light_manager.action.add_point': 'Add Point Light',
        'light_manager.action.add_point.desc': 'Add a soft point light with balanced shadows.',
        'light_manager.action.add_spot': 'Add Spot Light',
        'light_manager.action.add_spot.desc': 'Add an aimable cone light for key lighting.',
        'light_manager.action.add_directional': 'Add Directional Light',
        'light_manager.action.add_directional.desc': 'Add a sun-style light for broad scene lighting.',
        'light_manager.action.show_area_gizmos': 'Show Light Area Gizmos',
        'light_manager.action.hide_area_gizmos': 'Hide Light Area Gizmos',
        'light_manager.action.fit_to_selection': 'Fit Lights to Selection...',
        'light_manager.action.fit_to_selection.desc': 'Fit selected lights to the selected objects or groups.',
        'light_manager.tool.edit_gizmos': 'Light Edit Gizmos',
        'light_manager.tool.edit_gizmos.desc': 'Drag viewport handles for aim, range, cone angle, penumbra, shadow clip, and shadow bounds.',
        'light_manager.action.free_move': 'Free Move From View',
        'light_manager.action.free_move.desc': 'Move the selected elements on a camera-facing plane using Blockbench snapping. Shift, Ctrl/Cmd, or both use their configured snapping resolutions.',
        'light_manager.action.edit_properties': 'Light Properties...',
        'light_manager.action.edit_properties.desc': 'Edit the selected light values, presets, and shadow settings.',
        'light_manager.action.block_snap': 'Minecraft Block Snap',
        'light_manager.action.block_snap.desc': 'Move and resize selections in Minecraft block-sized steps. Use the arrow for position, size, step, and global-grid options.',
        'light_manager.action.texture_mesh_properties': 'Textured Mesh Properties...',
        'light_manager.action.texture_mesh_properties.desc': 'Edit texture, rotation, scale, and pivot for the selected textured meshes.',
        'light_manager.texture_mesh.texture': 'Texture',
        'light_manager.texture_mesh.rotation': 'Rotation',
        'light_manager.texture_mesh.scale': 'Scale',
        'light_manager.texture_mesh.pivot': 'Pivot',
        'light_manager.texture_mesh.keep_geometry': 'Keep Geometry in Place',
        'light_manager.texture_mesh.keep_geometry.desc': 'Move only the pivot. Disable to move the textured mesh together with its pivot.',
        'light_manager.texture_mesh.keep_mixed': 'Keep current textures',
        'light_manager.block_snap.enabled': 'Enabled',
        'light_manager.block_snap.position': 'Affect Position',
        'light_manager.block_snap.position.desc': 'Use the configured step while moving cubes, elements, or groups.',
        'light_manager.block_snap.scale': 'Affect Size',
        'light_manager.block_snap.scale.desc': 'Use the configured step while resizing cubes or other resizable elements.',
        'light_manager.block_snap.step': 'Block Size',
        'light_manager.block_snap.step.desc': 'Scene-unit step used for movement and resizing. Minecraft blocks use 16.',
        'light_manager.block_snap.grid': 'Snap to Global Grid',
        'light_manager.block_snap.grid.desc': 'Align the selection center to absolute block cells instead of only moving by a relative step.',
        'light_manager.message.select_lights_first': 'Select one or more lights first.',
        'light_manager.message.select_targets_first': 'Select at least one target object or group.',
        'light_manager.message.select_targets_too': 'Select target objects or groups too.',
        'light_manager.message.free_move_none': 'Select a movable element first.',
        'light_manager.message.free_move_wait': 'Move: drag in a viewport. Shift and Ctrl/Cmd change snapping; X/Y/Z constrain the axis.',
        'light_manager.message.free_move_axis': 'Move axis: {axis}',
        'light_manager.message.free_move_axis_free': 'Move axis: free',
        'light_manager.message.fit_complete': 'Fitted {lights} to {targets}.',
        'light_manager.message.behind_points': 'Some target points are behind a fitted directional/spot light.',
        'light_manager.count.light.one': '1 light',
        'light_manager.count.light.many': '{count} lights',
        'light_manager.count.target.one': '1 target',
        'light_manager.count.target.many': '{count} targets',
        'light_manager.dialog.fit.title': 'Fit Lights to Selection',
        'light_manager.dialog.fit.margin': 'Extra Margin',
        'light_manager.dialog.fit.margin.desc': 'Adds scene-unit padding to distance, bounds, near/far, and spot cone fitting.',
        'light_manager.dialog.fit.angle_margin': 'Spot Angle Margin',
        'light_manager.dialog.fit.angle_margin.desc': 'Additional spot cone padding in degrees.',
        'light_manager.dialog.fit.aim_to_center': 'Aim Directional/Spot',
        'light_manager.dialog.fit.aim_to_center.desc': 'Rotate directional and spot lights toward the center of the target selection.',
        'light_manager.dialog.edit.title_one': 'Edit Light',
        'light_manager.dialog.edit.title_many': 'Edit {count} Lights',
        'light_manager.field.quick_setup': 'Quick Setup',
        'light_manager.field.quick_setup.desc': 'Choose a profile to replace the technical values below on confirm.',
        'light_manager.option.keep_values': 'Keep values below',
        'light_manager.profile.point_fill': 'Point fill light',
        'light_manager.profile.spot_key': 'Spot key light',
        'light_manager.profile.directional_sun': 'Directional sun light',
        'light_manager.profile.minecraft_optimized': 'Minecraft Optimized (Directional)',
        'light_manager.option.point_radius': 'Point - radius light',
        'light_manager.option.directional_sun': 'Directional - sun light',
        'light_manager.option.spot_cone': 'Spot - cone light',
        'light_manager.property.color': 'Color',
        'light_manager.property.brightness': 'Brightness',
        'light_manager.property.key_light_enabled': 'Affect Rendercraft Key Light',
        'light_manager.property.key_light_weight': 'Key influence',
        'light_manager.property.key_light_weight.desc': 'Priority for Glow and RIM direction/color. 1 is neutral, higher values favor this light, 0 excludes it. Does not change illumination or shadows.',
        'light_manager.property.range': 'Range',
        'light_manager.property.range.desc': 'Point/spot range. 0 means no hard cutoff.',
        'light_manager.property.spot_cone': 'Spot Cone',
        'light_manager.property.spot_cone.desc': 'Spot only. Values near 90 are very wide.',
        'light_manager.property.spot_soft_edge': 'Spot Soft Edge',
        'light_manager.property.shadow_preset': 'Shadow Preset',
        'light_manager.property.casts_shadows': 'Casts Shadows',
        'light_manager.property.shadow_size': 'Shadow Size',
        'light_manager.property.shadow_near': 'Shadow Near',
        'light_manager.property.shadow_far': 'Shadow Far',
        'light_manager.property.sun_shadow_area': 'Sun Shadow Area',
        'light_manager.property.sun_shadow_area.desc': 'Directional only. Smaller is sharper; larger covers more scene.',
        'light_manager.option.use_values_below': 'Use values below',
        'light_manager.option.shadow_off': 'Off',
        'light_manager.option.shadow_preview': 'Preview - fast',
        'light_manager.option.shadow_balanced': 'Balanced',
        'light_manager.option.shadow_crisp': 'Crisp - heavier',
        'light_manager.option.shadow_minecraft': 'Minecraft Optimized',
        'light_manager.option.shadow_same_preview': 'Same as Preview',
        'light_manager.generic.reset_value': 'Reset value',
        'light_manager.generic.reset': 'Reset',
        'light_manager.gradient.add_stop': 'Add color stop',
        'light_manager.gradient.remove_stop': 'Remove color stop',
        'light_manager.gradient.distribute': 'Distribute stops evenly',
        'light_manager.gradient.reverse': 'Reverse gradient',
        'light_manager.gradient.reset': 'Reset gradient',
        'light_manager.gradient.options': 'Gradient options',
        'light_manager.gradient.color': 'Selected stop color',
        'light_manager.gradient.hex': 'Hex color',
        'light_manager.gradient.position': 'Stop position',
        'light_manager.gradient.midpoint': 'Fade midpoint',
        'light_manager.gradient.color_space': 'Color interpolation space',
        'light_manager.gradient.interpolation': 'Transition curve',
        'light_manager.gradient.space.oklab': 'OKLab · perceptual',
        'light_manager.gradient.space.srgb': 'sRGB · direct',
        'light_manager.gradient.space.linear_rgb': 'Linear RGB · light',
        'light_manager.gradient.space.hsl': 'HSL · hue path',
        'light_manager.gradient.interpolation.linear': 'Linear',
        'light_manager.gradient.interpolation.smooth': 'Smooth',
        'light_manager.gradient.interpolation.quadratic': 'Quadratic',
        'light_manager.gradient.interpolation.hard': 'Hard steps',
        'light_manager.undo.add_point': 'Add point light',
        'light_manager.undo.add_spot': 'Add spot light',
        'light_manager.undo.add_directional': 'Add directional light',
        'light_manager.undo.aim_light': 'Aim light',
        'light_manager.undo.free_move': 'Free move selection',
        'light_manager.undo.adjust_range': 'Adjust light range',
        'light_manager.undo.fit_to_selection': 'Fit light bounds to selection',
        'light_manager.undo.edit_properties': 'Edit light properties',
        'light_manager.undo.change_type': 'Change light type',
        'light_manager.undo.change_color': 'Change light color',
        'light_manager.undo.change_temperature': 'Change light temperature',
        'light_manager.undo.toggle_shadows': 'Toggle shadows',
        'light_manager.undo.change_shadow_resolution': 'Change shadow resolution',
        'light_manager.undo.change_studio_shadow_resolution': 'Change Studio Render shadow resolution',
        'light_manager.undo.change_intensity': 'Change light intensity',
        'light_manager.undo.change_distance': 'Change light distance',
        'light_manager.undo.change_cone_angle': 'Change light cone angle',
        'light_manager.undo.change_penumbra': 'Change light penumbra',
        'light_manager.undo.change_shadow_clip': 'Change shadow clip',
        'light_manager.undo.change_shadow_bounds': 'Change shadow bounds',
        'light_manager.undo.change_shadow_softness': 'Change shadow softness',
        'light_manager.undo.change_shadow_bias': 'Change shadow bias',
        'light_manager.undo.change_shadow_normal_bias': 'Change shadow normal bias',
        'light_manager.undo.edit_texture_mesh': 'Edit textured mesh properties'
    });

    Language.addTranslations('es', {
        'light_manager.ui.filter_all': 'Todos',
        'light_manager.ui.filter_active': 'Activos',
        'light_manager.ui.filter_modified': 'Modificados',
        'light_manager.ui.filter_label': 'Filtrar ajustes',
        'light_manager.ui.filter_empty': 'No hay ajustes coincidentes. Limpia la búsqueda o elige Todos.',
        'light_manager.ui.scene': 'Escena',
        'light_manager.ui.inspector': 'Propiedades',
        'light_manager.ui.camera_output': 'Cámara y salida',
        'light_manager.ui.helpers': 'Ayudas de la vista',
        'light_manager.ui.helpers_contextual': 'Contextuales',
        'light_manager.ui.helpers_all': 'Todas las ayudas',
        'light_manager.ui.helpers_clean': 'Vista limpia',
        'light_manager.ui.helpers_hint': 'Solo guías de edición. La iluminación, los materiales y el entorno se conservan.',
        'light_manager.ui.view_options': 'Opciones de vista',
        'light_manager.ui.scene_hint': 'Ajusta la escena aquí. Selecciona un objeto en la vista o el Outliner para editar sus propiedades.',
        'light_manager.ui.camera_hint': 'Usa la vista actual, guarda una cámara o configura la salida en Studio Render.',
        'light_manager.ui.layout': 'Layout del espacio Lightflow',
        'light_manager.ui.layout_apply': 'Usar layout recomendado',
        'light_manager.ui.layout_restore': 'Restaurar layout anterior',
        'light_manager.ui.layout_description': 'Mantiene Material y los ajustes de escena a la izquierda; luces y volúmenes a la derecha. Conserva el layout anterior para restaurarlo.',
        'light_manager.ui.sun_region': 'Editar región de sombras del sol',
        'light_manager.ui.light_details': 'Detalles de luz y sombras',
        'light_manager.ui.selected_scope': 'Los cambios se aplican a las luces seleccionadas.',
        'light_manager.ui.no_light': 'Selecciona una luz en la vista o el Outliner para editarla.',
        'light_manager.ui.search': 'Buscar ajuste',
        'light_manager.ui.collapse': 'Contraer todo',
        'light_manager.ui.saved_cameras': 'Cámaras guardadas',
        'light_manager.ui.add_light': 'Añadir luz',
        'light_manager.ui.add_volume': 'Añadir volumen',
        'light_manager.ui.create': 'Añadir a la escena',
        'mode.render': 'Renderizar',
        'mode.render.desc': 'Renderiza la escena con luces y sombras.',
        'dialog.preview_options.show_light_area_gizmos': 'Mostrar gizmos de area de luz',
        'panel.light_properties': 'LUZ',
        'property.light_settings': 'Ajustes de luz',
        'property.shadow_settings': 'Ajustes de sombras',
        'property.light_settings.compact': 'Luz',
        'property.shadow_settings.compact': 'Sombras',
        'property.light_color': 'Color de luz',
        'property.light_intensity': 'Intensidad',
        'property.light_intensity.desc': 'Brillo de la luz. Valores mas altos producen mas iluminacion.',
        'property.light_temperature': 'Temperatura',
        'property.light_temperature.desc': 'Temperatura de color en Kelvin. Menor es mas calida; mayor es mas fria.',
        'property.light_type': 'Tipo de luz',
        'light_manager.art.name': 'Key artística',
        'light_manager.art.add': 'Agregar Key artística (Glow / Rim)',
        'light_manager.art.edit': 'Editar Key artística',
        'light_manager.art.hint': 'Controla solo Glow / Rim. La caja selecciona centros de objetos; Incluir permite salir de ella. Arrastra el punto de color y los tiradores con Editar gizmos. Hasta 8 Keys por objeto, primero las de mayor influencia.',
        'light_manager.art.source': 'Fuente',
        'light_manager.art.point': 'Punto de Glow',
        'light_manager.art.direction': 'Dirección',
        'light_manager.art.radius': 'Radio del punto',
        'light_manager.art.radius.desc': 'Amplía la respuesta de Glow / Rim alrededor del punto. La esfera de alambre muestra el alcance.',
        'light_manager.art.transform_hint': 'Mover: punto de Glow · Rotar: dirección · Escalar: caja de influencia',
        'light_manager.art.size': 'Tamaño de caja',
        'light_manager.art.softness': 'Transición de caja',
        'light_manager.art.scope': 'Afecta a',
        'light_manager.art.box': 'Dentro de caja + incluidos',
        'light_manager.art.only': 'Solo incluidos',
        'light_manager.art.targets': 'Incluir / excluir elementos',
        'light_manager.art.auto': 'Caja',
        'light_manager.art.include': 'Incluir',
        'light_manager.art.exclude': 'Excluir',
        'light_manager.art.strength': 'Fuerza Glow / Rim',

        'property.light_type.point': 'Punto',
        'property.light_type.directional': 'Direccional',
        'property.light_directional_settings.disabled.desc': 'Solo disponible para luces direccionales.',
        'property.light_type.spot': 'Spot',
        'property.light_spot_settings.disabled.desc': 'Solo disponible para luces spot.',
        'property.distance': 'Distancia',
        'property.distance.desc': 'Rango maximo de la luz. 0 significa sin limite.',
        'property.light_cone_settings': 'Ajustes del cono de luz',
        'property.angle': 'Angulo del cono',
        'property.angle.desc': 'Angulo del cono de la luz spot en grados.',
        'property.penumbra': 'Penumbra',
        'property.penumbra.desc': 'Suavidad del borde del cono spot (0 a 1).',
        'property.cone_angle': 'Angulo del cono',
        'property.cone_angle.desc': 'Angulo del cono de la luz spot en grados.',
        'property.cone_penumbra': 'Penumbra',
        'property.cone_penumbra.desc': 'Suavidad del borde del cono spot (0 a 1).',
        'property.cast_shadows': 'Proyecta sombras',
        'property.cast_shadows.desc': 'Si la luz proyecta sombras. Desactivar puede mejorar el rendimiento.',
        'property.cast_shadows_off.desc': 'La proyeccion de sombras esta desactivada.',
        'property.shadow_near': 'Recorte Cercano',
        'property.shadow_far': 'Recorte Lejano',
        'property.shadow_bounds': 'Area de sombra',
        'property.shadow_bounds.desc': 'Tamano del area de sombras para luces direccionales. Ajustalo para reducir artefactos.',
        'property.shadow_clip': 'Recorte de sombra',
        'property.shadow_clip.desc': 'Distancia desde la luz donde comienzan a renderizarse las sombras. Ajusta para reducir artefactos de sombra.',
        'property.shadow_biases': 'Ajustes de sombra',
        'property.shadow_biases.desc': 'Ajusta la profundidad de sombra para reducir artefactos.',
        'property.shadow_resolution': 'Resolucion',
        'property.shadow_resolution.desc': 'Resolucion del mapa de sombras. Valores mas altos producen sombras mas nítidas pero pueden reducir el rendimiento.',
        'property.studio_shadow_resolution': 'Sombra Studio',
        'property.studio_shadow_resolution.desc': 'Tamano de sombra usado solo durante capturas de Studio Render. Igual conserva la resolucion del preview.',
        'property.shadow_softness': 'Suavidad',
        'property.shadow_softness.desc': 'Suaviza los bordes de sombra en texeles del shadow map. Valores mas altos reducen bordes serrados; 0 mantiene sombras duras.',
        'property.shadow_bias': 'Bias',
        'property.shadow_bias.desc': 'Ajusta la profundidad de sombra para reducir artefactos. Valores positivos pueden reducir acne, pero pueden separar sombras. Por defecto: -0.0005',
        'property.shadow_normal_bias': 'Bias normal',
        'property.shadow_normal_bias.desc': 'Ajusta el bias segun la normal de la superficie. El default automatico sigue la resolucion, el area direccional y el rango near/far de sombra.',
        'action.edit_light_properties': 'Editar propiedades de luz',
        'action.fit_light_bounds_to_selection': 'Ajustar luces a seleccion',
        'light_manager.plugin.title': 'Light Manager',
        'light_manager.plugin.description': 'Agrega luces de punto, spot, direccionales y fuentes Art Key de render con gizmos de viewport, controles de Glow/Rim, sombras y presets listos para produccion. Es la base de iluminacion para Shader Architect y Studio Render en la suite Lightflow.',
        'light_manager.action.add_point': 'Agregar luz de punto',
        'light_manager.action.add_point.desc': 'Agrega una luz de punto suave con sombras balanceadas.',
        'light_manager.action.add_spot': 'Agregar luz spot',
        'light_manager.action.add_spot.desc': 'Agrega una luz de cono orientable para luz principal.',
        'light_manager.action.add_directional': 'Agregar luz direccional',
        'light_manager.action.add_directional.desc': 'Agrega una luz tipo sol para iluminacion amplia de escena.',
        'light_manager.action.show_area_gizmos': 'Mostrar gizmos de area de luz',
        'light_manager.action.hide_area_gizmos': 'Ocultar gizmos de area de luz',
        'light_manager.action.fit_to_selection': 'Ajustar luces a seleccion...',
        'light_manager.action.fit_to_selection.desc': 'Ajusta las luces seleccionadas a los objetos o grupos seleccionados.',
        'light_manager.tool.edit_gizmos': 'Gizmos de edicion de luz',
        'light_manager.tool.edit_gizmos.desc': 'Arrastra handles en el viewport para apuntar, rango, angulo del cono, penumbra, recorte y area de sombra.',
        'light_manager.action.free_move': 'Mover libre desde vista',
        'light_manager.action.free_move.desc': 'Mueve los elementos seleccionados en un plano frente a la camara con el ajuste de Blockbench. Shift, Ctrl/Cmd o ambos usan sus resoluciones configuradas.',
        'light_manager.action.edit_properties': 'Propiedades de luz...',
        'light_manager.action.edit_properties.desc': 'Edita valores, presets y ajustes de sombra de las luces seleccionadas.',
        'light_manager.action.block_snap': 'Ajuste a bloques de Minecraft',
        'light_manager.action.block_snap.desc': 'Mueve y redimensiona selecciones en pasos del tamano de un bloque. Usa la flecha para configurar posicion, tamano, paso y cuadricula global.',
        'light_manager.action.texture_mesh_properties': 'Propiedades de Textured Mesh...',
        'light_manager.action.texture_mesh_properties.desc': 'Edita textura, rotacion, escala y pivot de los Textured Mesh seleccionados.',
        'light_manager.texture_mesh.texture': 'Textura',
        'light_manager.texture_mesh.rotation': 'Rotacion',
        'light_manager.texture_mesh.scale': 'Escala',
        'light_manager.texture_mesh.pivot': 'Pivot',
        'light_manager.texture_mesh.keep_geometry': 'Conservar geometria en su lugar',
        'light_manager.texture_mesh.keep_geometry.desc': 'Mueve solo el pivot. Desactivalo para mover el Textured Mesh junto con su pivot.',
        'light_manager.texture_mesh.keep_mixed': 'Mantener texturas actuales',
        'light_manager.block_snap.enabled': 'Activado',
        'light_manager.block_snap.position': 'Afectar posicion',
        'light_manager.block_snap.position.desc': 'Usa el paso configurado al mover cubos, elementos o grupos.',
        'light_manager.block_snap.scale': 'Afectar tamano',
        'light_manager.block_snap.scale.desc': 'Usa el paso configurado al redimensionar cubos u otros elementos redimensionables.',
        'light_manager.block_snap.step': 'Tamano del bloque',
        'light_manager.block_snap.step.desc': 'Paso en unidades de escena usado para mover y redimensionar. Los bloques de Minecraft usan 16.',
        'light_manager.block_snap.grid': 'Ajustar a cuadricula global',
        'light_manager.block_snap.grid.desc': 'Alinea el centro de la seleccion a celdas absolutas de bloque en vez de usar solamente pasos relativos.',
        'light_manager.message.select_lights_first': 'Selecciona una o mas luces primero.',
        'light_manager.message.select_targets_first': 'Selecciona al menos un objeto o grupo objetivo.',
        'light_manager.message.select_targets_too': 'Selecciona tambien objetos o grupos objetivo.',
        'light_manager.message.free_move_none': 'Selecciona primero un elemento movible.',
        'light_manager.message.free_move_wait': 'Mover: arrastra en un viewport. Shift y Ctrl/Cmd cambian el ajuste; X/Y/Z limitan el eje.',
        'light_manager.message.free_move_axis': 'Eje de movimiento: {axis}',
        'light_manager.message.free_move_axis_free': 'Eje de movimiento: libre',
        'light_manager.message.fit_complete': 'Se ajusto {lights} a {targets}.',
        'light_manager.message.behind_points': 'Algunos puntos objetivo quedan detras de una luz direccional/spot ajustada.',
        'light_manager.count.light.one': '1 luz',
        'light_manager.count.light.many': '{count} luces',
        'light_manager.count.target.one': '1 objetivo',
        'light_manager.count.target.many': '{count} objetivos',
        'light_manager.dialog.fit.title': 'Ajustar luces a seleccion',
        'light_manager.dialog.fit.margin': 'Margen extra',
        'light_manager.dialog.fit.margin.desc': 'Agrega margen en unidades de escena a distancia, area, near/far y cono spot.',
        'light_manager.dialog.fit.angle_margin': 'Margen del cono spot',
        'light_manager.dialog.fit.angle_margin.desc': 'Margen adicional del cono spot en grados.',
        'light_manager.dialog.fit.aim_to_center': 'Apuntar direccional/spot',
        'light_manager.dialog.fit.aim_to_center.desc': 'Rota luces direccionales y spot hacia el centro de la seleccion objetivo.',
        'light_manager.dialog.edit.title_one': 'Editar luz',
        'light_manager.dialog.edit.title_many': 'Editar {count} luces',
        'light_manager.field.quick_setup': 'Ajuste rapido',
        'light_manager.field.quick_setup.desc': 'Elige un preset para reemplazar los valores tecnicos al confirmar.',
        'light_manager.option.keep_values': 'Mantener valores actuales',
        'light_manager.profile.point_fill': 'Luz de relleno de punto',
        'light_manager.profile.spot_key': 'Luz spot principal',
        'light_manager.profile.directional_sun': 'Luz solar direccional',
        'light_manager.profile.minecraft_optimized': 'Optimizada para Minecraft (Direccional)',
        'light_manager.option.point_radius': 'Punto - luz radial',
        'light_manager.option.directional_sun': 'Direccional - luz solar',
        'light_manager.option.spot_cone': 'Spot - luz de cono',
        'light_manager.property.color': 'Color',
        'light_manager.property.brightness': 'Brillo',
        'light_manager.property.key_light_enabled': 'Participar como Key Light de Rendercraft',
        'light_manager.property.key_light_weight': 'Influencia Key',
        'light_manager.property.key_light_weight.desc': 'Prioridad para dirección/color del Glow y RIM. 1 es neutro, valores altos favorecen esta luz y 0 la excluye. No cambia iluminación ni sombras.',
        'light_manager.property.range': 'Rango',
        'light_manager.property.range.desc': 'Rango de punto/spot. 0 significa sin corte duro.',
        'light_manager.property.spot_cone': 'Cono spot',
        'light_manager.property.spot_cone.desc': 'Solo spot. Valores cercanos a 90 son muy amplios.',
        'light_manager.property.spot_soft_edge': 'Borde suave spot',
        'light_manager.property.shadow_preset': 'Preset de sombra',
        'light_manager.property.casts_shadows': 'Proyecta sombras',
        'light_manager.property.shadow_size': 'Tamano de sombra',
        'light_manager.property.shadow_near': 'Sombra cerca',
        'light_manager.property.shadow_far': 'Sombra lejos',
        'light_manager.property.sun_shadow_area': 'Area de sombra solar',
        'light_manager.property.sun_shadow_area.desc': 'Solo direccional. Menor es mas nitido; mayor cubre mas escena.',
        'light_manager.option.use_values_below': 'Usar valores inferiores',
        'light_manager.option.shadow_off': 'Apagada',
        'light_manager.option.shadow_preview': 'Preview - rapida',
        'light_manager.option.shadow_balanced': 'Balanceada',
        'light_manager.option.shadow_crisp': 'Nitida - mas pesada',
        'light_manager.option.shadow_minecraft': 'Optimizada para Minecraft',
        'light_manager.option.shadow_same_preview': 'Igual que preview',
        'light_manager.generic.reset_value': 'Reiniciar valor',
        'light_manager.generic.reset': 'Reiniciar',
        'light_manager.gradient.add_stop': 'Agregar punto de color',
        'light_manager.gradient.remove_stop': 'Eliminar punto de color',
        'light_manager.gradient.distribute': 'Distribuir puntos uniformemente',
        'light_manager.gradient.reverse': 'Invertir gradiente',
        'light_manager.gradient.reset': 'Restablecer gradiente',
        'light_manager.gradient.options': 'Opciones del gradiente',
        'light_manager.gradient.color': 'Color del punto seleccionado',
        'light_manager.gradient.hex': 'Color hexadecimal',
        'light_manager.gradient.position': 'Posición del punto',
        'light_manager.gradient.midpoint': 'Centro del desvanecimiento',
        'light_manager.gradient.color_space': 'Espacio de interpolación de color',
        'light_manager.gradient.interpolation': 'Curva de transición',
        'light_manager.gradient.space.oklab': 'OKLab · perceptual',
        'light_manager.gradient.space.srgb': 'sRGB · directo',
        'light_manager.gradient.space.linear_rgb': 'RGB lineal · luz',
        'light_manager.gradient.space.hsl': 'HSL · recorrido de tono',
        'light_manager.gradient.interpolation.linear': 'Lineal',
        'light_manager.gradient.interpolation.smooth': 'Suavizado',
        'light_manager.gradient.interpolation.quadratic': 'Cuadrático',
        'light_manager.gradient.interpolation.hard': 'Cortes duros',
        'light_manager.undo.add_point': 'Agregar luz de punto',
        'light_manager.undo.add_spot': 'Agregar luz spot',
        'light_manager.undo.add_directional': 'Agregar luz direccional',
        'light_manager.undo.aim_light': 'Apuntar luz',
        'light_manager.undo.free_move': 'Mover seleccion libre',
        'light_manager.undo.adjust_range': 'Ajustar rango de luz',
        'light_manager.undo.fit_to_selection': 'Ajustar limites de luz a seleccion',
        'light_manager.undo.edit_properties': 'Editar propiedades de luz',
        'light_manager.undo.change_type': 'Cambiar tipo de luz',
        'light_manager.undo.change_color': 'Cambiar color de luz',
        'light_manager.undo.change_temperature': 'Cambiar temperatura de luz',
        'light_manager.undo.toggle_shadows': 'Alternar sombras',
        'light_manager.undo.change_shadow_resolution': 'Cambiar resolucion de sombra',
        'light_manager.undo.change_studio_shadow_resolution': 'Cambiar resolucion de sombra Studio Render',
        'light_manager.undo.change_intensity': 'Cambiar intensidad de luz',
        'light_manager.undo.change_distance': 'Cambiar distancia de luz',
        'light_manager.undo.change_cone_angle': 'Cambiar angulo del cono',
        'light_manager.undo.change_penumbra': 'Cambiar penumbra de luz',
        'light_manager.undo.change_shadow_clip': 'Cambiar recorte de sombra',
        'light_manager.undo.change_shadow_bounds': 'Cambiar area de sombra',
        'light_manager.undo.change_shadow_softness': 'Cambiar suavidad de sombra',
        'light_manager.undo.change_shadow_bias': 'Cambiar bias de sombra',
        'light_manager.undo.change_shadow_normal_bias': 'Cambiar bias normal de sombra',
        'light_manager.undo.edit_texture_mesh': 'Editar propiedades de Textured Mesh'
    });


    let deletables = [];
    let lightManagerUIApi = null;
    let lightTextures = {}; // THREE.Texture instances will be loaded here
    let originalAnimatorPreview = null;
    let patchedAnimatorPreview = null;
    let lightflowLifecycle = null;
    let lightPreviewController = null;
    let artKeyPreviewController = null;
    let parentedLightCache = [];
    let parentedLightCacheDirty = true;
    let parentedLightRegistry = null;
    let parentedLightRegistrySize = -1;
    let parentedLightMatrixCache = new WeakMap();
    const pendingAnimatedLights = new Set();
    const activeDocumentInteractionCleanups = new Set();

    const animationSign = Blockbench.isNewerThan('4.99') ? 1 : -1;

    function invalidateLightManagerParentedLightCache() {
        parentedLightCacheDirty = true;
    }

    function queueLightManagerAnimatedLight(light) {
        if (light) pendingAnimatedLights.add(light);
    }

    function flushLightManagerAnimatedLights(options = {}) {
        if (!pendingAnimatedLights.size) return 0;
        const elements = Array.from(pendingAnimatedLights);
        pendingAnimatedLights.clear();
        runLightManagerElementUpdate({
            shadows: true,
            scene: false,
            gizmos: false,
            elements,
            cleanup: false,
            preserveTopology: true,
            render: options.render !== false
        });
        return elements.length;
    }

    function getLightManagerParentedLights(nodes = null) {
        if (!window.LightElement || !Array.isArray(LightElement.all)) return [];
        if (
            parentedLightCacheDirty ||
            parentedLightRegistry !== LightElement.all ||
            parentedLightRegistrySize !== LightElement.all.length
        ) {
            parentedLightRegistry = LightElement.all;
            parentedLightRegistrySize = LightElement.all.length;
            parentedLightCache = LightElement.all.filter(light => (
                light?.mesh && light.parent && light.parent !== 'root'
            ));
            parentedLightCacheDirty = false;
        }
        if (!nodes) return parentedLightCache;
        const affectedNodes = nodes ? new Set(nodes.filter(Boolean)) : null;
        return parentedLightCache.filter(light => {
            const visited = new Set();
            let parent = light.parent;
            while (parent && parent !== 'root' && typeof parent === 'object') {
                if (affectedNodes.has(parent)) return true;
                if (visited.has(parent)) break;
                visited.add(parent);
                parent = parent.parent;
            }
            return false;
        });
    }

    function syncLightManagerParentedLights(nodes = null, options = {}) {
        const lights = getLightManagerParentedLights(nodes);
        if (!lights.length) return false;
        const changedLights = [];
        lights.forEach(light => {
            light.mesh.updateMatrixWorld?.(true);
            const elements = light.mesh.matrixWorld?.elements;
            if (!elements) {
                changedLights.push(light);
                return;
            }
            let signature = parentedLightMatrixCache.get(light);
            // Parent visibility can change without changing matrixWorld.
            // Keep it in the cached state so hiding/showing an armature bone
            // still synchronizes its light while static transforms stay cheap.
            const visible = isLightManagerElementHierarchyVisible(light) ? 1 : 0;
            let changed = !signature || signature.length !== elements.length + 1;
            if (!signature || signature.length !== elements.length + 1) {
                signature = new Float64Array(elements.length + 1);
                parentedLightMatrixCache.set(light, signature);
            }
            for (let index = 0; index < elements.length; index++) {
                if (signature[index] !== elements[index]) changed = true;
                signature[index] = elements[index];
            }
            if (signature[elements.length] !== visible) changed = true;
            signature[elements.length] = visible;
            if (changed) changedLights.push(light);
        });
        if (!changedLights.length) return false;
        window.update_light_element_callback?.({
            shadows: options.shadows !== false,
            scene: false,
            gizmos: options.gizmos !== false,
            elements: changedLights,
            cleanup: false,
            immediate: options.immediate === true,
            render: options.render !== false
        });
        return true;
    }

    function markLightManagerAnimationFrameShadowsDirty() {
        if (!lightManagerHasActiveShadowLights()) return;
        markLightManagerShadowsDirty();
        invalidateLightManagerShadowMaps();
    }

    function patchLightManagerAnimatorPreview() {
        if (!window.Animator || typeof Animator.preview !== 'function') return;
        if (originalAnimatorPreview) return;

        originalAnimatorPreview = Animator.preview;
        patchedAnimatorPreview = function lightManagerAnimatorPreviewPatch() {
            const result = originalAnimatorPreview.apply(this, arguments);
            const nativeHostRenderPending = arguments[0] === true && window.Timeline?.playing === true;
            syncLightManagerParentedLights(null, {
                gizmos: true,
                shadows: false,
                immediate: true,
                render: !nativeHostRenderPending
            });
            flushLightManagerAnimatedLights({ render: !nativeHostRenderPending });
            markLightManagerAnimationFrameShadowsDirty();
            return result;
        };
        Animator.preview = patchedAnimatorPreview;
    }

    function restoreLightManagerAnimatorPreview() {
        if (originalAnimatorPreview && window.Animator && Animator.preview === patchedAnimatorPreview) {
            Animator.preview = originalAnimatorPreview;
        }
        originalAnimatorPreview = null;
        patchedAnimatorPreview = null;
        parentedLightCache = [];
        parentedLightCacheDirty = true;
        parentedLightRegistry = null;
        parentedLightRegistrySize = -1;
        parentedLightMatrixCache = new WeakMap();
        pendingAnimatedLights.clear();
    }

    function disposeLightManagerResources() {
        const resources = deletables.slice();
        deletables.length = 0;
        resources.reverse().forEach(item => {
            if (!item || typeof item.delete !== 'function') return;
            try {
                item.delete();
            } catch (error) {
                console.warn('[Light Manager] Failed to release a registered resource.', error);
            }
        });
    }

    function trackDocumentInteraction(cleanup) {
        const release = () => {
            if (!activeDocumentInteractionCleanups.delete(release)) return;
            cleanup();
        };
        activeDocumentInteractionCleanups.add(release);
        return release;
    }

    function disposeDocumentInteractions() {
        Array.from(activeDocumentInteractionCleanups).forEach(release => release());
    }

    function installLightManagerTextureMeshEnhancements() {
        const ElementType = window.TextureMesh;
        const controller = ElementType?.preview_controller;
        if (!ElementType || !controller || !ElementType.prototype) return null;

        const prototype = ElementType.prototype;
        const originalBehavior = ElementType.behavior;
        const originalInit = prototype.init;
        const originalApplyTexture = prototype.applyTexture;
        const originalTransferOrigin = prototype.transferOrigin;
        const originalGetWorldCenter = prototype.getWorldCenter;
        const originalUpdateGeometry = controller.updateGeometry;
        const originalUpdateFaces = controller.updateFaces;
        const originalUpdateUV = controller.updateUV;
        const originalTextureApply = window.Texture?.prototype?.apply;
        const textureAnimator = window.TextureAnimator;
        const originalTextureAnimatorUpdate = textureAnimator?.update;
        const originalTextureAnimatorReset = textureAnimator?.reset;
        const nativeAddAction = window.BarItems?.add_texture_mesh;
        const originalAddCondition = nativeAddAction?.condition;
        let patchedAddCondition = null;
        let patchedBehavior = null;
        let patchedInit = null;
        let patchedApplyTexture = null;
        let patchedTransferOrigin = null;
        let patchedGetWorldCenter = null;
        let patchedUpdateGeometry = null;
        let patchedUpdateFaces = null;
        let patchedUpdateUV = null;
        let patchedTextureApply = null;
        let patchedTextureAnimatorUpdate = null;
        let patchedTextureAnimatorReset = null;
        const patchedSizeSliders = [];
        const listeners = [];
        const flipbookRenderGuards = new Map();
        let flipbookFrameCanvases = new WeakMap();
        let propertiesAction = null;
        let refreshTimer = null;
        let disposed = false;

        const isTextureMesh = element => (
            !!element && (element instanceof ElementType || element.type === 'texture_mesh')
        );
        const selectedTextureMeshes = () => {
            const selection = Array.isArray(window.Outliner?.selected) ? Outliner.selected : [];
            return selection.filter(isTextureMesh);
        };
        const getColorTexture = texture => {
            if (!texture || texture.pbr_channel === 'color' || typeof texture.getGroup !== 'function') {
                return texture || null;
            }
            const group = texture.getGroup();
            return group?.getTextures?.().find(candidate => candidate?.pbr_channel === 'color') || texture;
        };
        const findTexture = reference => {
            if (!reference || !Array.isArray(window.Texture?.all)) return null;
            const text = String(reference);
            return Texture.all.find(texture => texture?.uuid === text)
                || Texture.all.find(texture => texture?.id === text)
                || Texture.all.find(texture => texture?.name === text)
                || Texture.all.find(texture => texture?.path === text)
                || null;
        };
        const resolveTexture = (element, allowDefault = true) => {
            const assigned = getColorTexture(findTexture(element?.texture_name));
            if (assigned || !allowDefault) return assigned;
            return getColorTexture(window.Texture?.getDefault?.()) || null;
        };
        const getFlipbookFrame = texture => {
            const width = Math.max(1, Math.floor(Number(texture?.width) || Number(texture?.img?.naturalWidth) || 1));
            const fullHeight = Math.max(1, Math.floor(Number(texture?.height) || Number(texture?.img?.naturalHeight) || 1));
            const uvWidth = Math.max(1, Number(texture?.getUVWidth?.()) || Number(texture?.uv_width) || width);
            const uvHeight = Math.max(1, Number(texture?.getUVHeight?.()) || Number(texture?.uv_height) || width);
            const inferredFrameCount = Math.max(1, Math.ceil(((uvWidth / uvHeight) / (width / fullHeight)) - 0.05));
            const frameCount = Math.max(1, Math.floor(Number(texture?.frameCount) || inferredFrameCount));
            if (frameCount <= 1) return null;
            const frameHeight = Math.max(1, Math.round(fullHeight / frameCount));
            const frame = ((Math.floor(Number(texture?.currentFrame) || 0) % frameCount) + frameCount) % frameCount;
            const sourceY = Math.min(Math.max(0, fullHeight - frameHeight), frame * frameHeight);
            return { frame, frameCount, frameHeight, fullHeight, sourceY, width };
        };
        const getFlipbookFrameTexture = texture => {
            const info = getFlipbookFrame(texture);
            if (!info || typeof document === 'undefined') return { texture, info: null };

            let state = flipbookFrameCanvases.get(texture);
            if (!state || state.width !== info.width || state.frameHeight !== info.frameHeight) {
                state = { width: info.width, frameHeight: info.frameHeight, frames: new Map() };
                flipbookFrameCanvases.set(texture, state);
            }
            let canvas = state.frames.get(info.frame);
            if (!canvas) {
                canvas = document.createElement('canvas');
                state.frames.set(info.frame, canvas);
            }
            if (canvas.width !== info.width) canvas.width = info.width;
            if (canvas.height !== info.frameHeight) canvas.height = info.frameHeight;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            const canvasSource = texture.canvas;
            const imageSource = texture.img;
            const source = texture.internal !== false
                ? (canvasSource || imageSource)
                : ((imageSource?.complete && imageSource?.naturalWidth) ? imageSource : (canvasSource || imageSource));
            if (!context || !source) return { texture, info: null };
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.imageSmoothingEnabled = false;
            context.drawImage(
                source,
                0, info.sourceY, info.width, info.frameHeight,
                0, 0, info.width, info.frameHeight
            );

            const frameTexture = Object.create(texture);
            Object.assign(frameTexture, {
                width: info.width,
                height: info.frameHeight,
                img: canvas,
                canvas,
                currentFrame: 0,
                lightflowSourceTexture: texture
            });
            return { texture: frameTexture, info };
        };
        const applyFlipbookUV = (element, sourceTexture, info, captureBase = false) => {
            const uv = element?.mesh?.geometry?.getAttribute?.('uv') || element?.mesh?.geometry?.attributes?.uv;
            if (!uv?.array || !info) return false;
            const geometry = element.mesh.geometry;
            geometry.userData = geometry.userData || {};
            if (
                captureBase ||
                !(geometry.userData.lightflowTextureMeshBaseUV instanceof Float32Array) ||
                geometry.userData.lightflowTextureMeshBaseUV.length !== uv.array.length
            ) {
                geometry.userData.lightflowTextureMeshBaseUV = new Float32Array(uv.array);
            }
            const baseUV = geometry.userData.lightflowTextureMeshBaseUV;
            const frameBottom = 1 - ((info.frame + 1) / info.frameCount);
            for (let index = 1; index < uv.array.length; index += 2) {
                uv.array[index - 1] = baseUV[index - 1];
                uv.array[index] = frameBottom + (baseUV[index] / info.frameCount);
            }
            uv.needsUpdate = true;
            geometry.userData.lightflowTextureMeshFlipbook = {
                texture: sourceTexture?.uuid || '',
                frame: info.frame,
                frameCount: info.frameCount,
                frameBottom,
                frameTop: frameBottom + (1 / info.frameCount)
            };
            return true;
        };
        const installFlipbookRenderGuard = element => {
            const mesh = element?.mesh;
            if (!mesh || flipbookRenderGuards.has(mesh)) return;
            const previous = mesh.onBeforeRender;
            const guard = function lightManagerTextureMeshFlipbookRenderGuard(...args) {
                const previousResult = typeof previous === 'function'
                    ? previous.apply(this, args)
                    : undefined;
                const texture = resolveTexture(element, false);
                const info = getFlipbookFrame(texture);
                if (info) applyFlipbookUV(element, texture, info, false);
                return previousResult;
            };
            flipbookRenderGuards.set(mesh, { previous, guard });
            mesh.onBeforeRender = guard;
        };
        const pinTexture = (element, allowDefault = true) => {
            if (!isTextureMesh(element)) return null;
            const texture = resolveTexture(element, allowDefault);
            if (texture?.uuid && element.texture_name !== texture.uuid) {
                element.texture_name = texture.uuid;
            }
            return texture;
        };
        const updateElement = (element, options = {}) => {
            if (!isTextureMesh(element)) return;
            const texture = pinTexture(element, true);
            controller.updateTransform?.(element);
            if (options.faces === false) controller.updateGeometry?.(element, texture || undefined);
            else controller.updateFaces?.(element);
        };
        const refreshAll = () => {
            const elements = Array.isArray(ElementType.all) ? ElementType.all.slice() : [];
            elements.forEach(element => updateElement(element));
            if (elements.length) {
                window.Canvas?.updateView?.({
                    elements,
                    element_aspects: { transform: true, geometry: true, faces: true },
                    selection: true
                });
            }
        };

        patchedBehavior = Object.assign({}, originalBehavior || {}, {
            movable: true,
            scalable: true,
            rotatable: true,
            has_pivot: true
        });
        ElementType.behavior = patchedBehavior;

        if (typeof originalInit === 'function') {
            patchedInit = function lightManagerTextureMeshInit(...args) {
                pinTexture(this, true);
                return originalInit.apply(this, args);
            };
            prototype.init = patchedInit;
        }

        patchedApplyTexture = function lightManagerTextureMeshApplyTexture(texture) {
            const colorTexture = getColorTexture(texture);
            if (!colorTexture?.uuid) {
                return typeof originalApplyTexture === 'function'
                    ? originalApplyTexture.apply(this, arguments)
                    : this;
            }
            this.texture_name = colorTexture.uuid;
            controller.updateFaces?.(this);
            window.Canvas?.updateView?.({
                elements: [this],
                element_aspects: { geometry: true, faces: true },
                selection: true
            });
            return this;
        };
        prototype.applyTexture = patchedApplyTexture;

        if (typeof originalTextureApply === 'function') {
            patchedTextureApply = function lightManagerApplyTextureToElements(all) {
                const textureMeshes = selectedTextureMeshes();
                if (all !== true || !textureMeshes.length) {
                    return originalTextureApply.apply(this, arguments);
                }

                let affectedElements = [];
                if (window.Format?.per_group_texture) {
                    const groups = Array.from(window.Group?.multi_selected || []).filter(group => group instanceof Group);
                    Outliner.selected.forEach(element => {
                        if (!element?.faces || !(element.parent instanceof Group) || groups.includes(element.parent)) return;
                        groups.push(element.parent);
                    });
                    Undo.initEdit({ groups, elements: textureMeshes });
                    groups.forEach(group => {
                        group.texture = this.uuid;
                        group.forEachChild(child => {
                            if (child?.faces && !affectedElements.includes(child)) affectedElements.push(child);
                        });
                    });
                } else {
                    const faceElements = Outliner.selected.filter(element => element?.faces && !isTextureMesh(element));
                    affectedElements = faceElements.concat(textureMeshes);
                    Undo.initEdit({ elements: affectedElements });
                    faceElements.forEach(element => {
                        Object.values(element.faces || {}).forEach(face => {
                            if (face) face.texture = this.uuid;
                        });
                    });
                }

                textureMeshes.forEach(element => element.applyTexture(this, true));
                textureMeshes.forEach(element => {
                    if (!affectedElements.includes(element)) affectedElements.push(element);
                });
                window.Canvas?.updateView?.({
                    elements: affectedElements,
                    element_aspects: { faces: true, uv: true, geometry: true }
                });
                window.UVEditor?.loadData?.();
                Undo.finishEdit('Apply texture');
                return this;
            };
            Texture.prototype.apply = patchedTextureApply;
        }

        patchedTransferOrigin = function lightManagerTextureMeshTransferOrigin(targetOrigin) {
            if (!Array.isArray(targetOrigin) || !Array.isArray(this.origin) || !Array.isArray(this.local_pivot)) {
                return typeof originalTransferOrigin === 'function'
                    ? originalTransferOrigin.apply(this, arguments)
                    : this;
            }

            const oldOrigin = new THREE.Vector3().fromArray(this.origin);
            const nextOrigin = new THREE.Vector3().fromArray(targetOrigin);
            const localCompensation = oldOrigin.sub(nextOrigin);
            const quaternion = this.mesh?.quaternion
                ? new THREE.Quaternion().copy(this.mesh.quaternion)
                : new THREE.Quaternion().setFromEuler(new THREE.Euler(
                    Math.degToRad(this.rotation?.[0] || 0),
                    Math.degToRad(this.rotation?.[1] || 0),
                    Math.degToRad(this.rotation?.[2] || 0),
                    window.Format?.euler_order || 'ZYX'
                ));
            localCompensation.applyQuaternion(quaternion.invert());
            this.local_pivot[0] += localCompensation.x;
            this.local_pivot[1] += localCompensation.y;
            this.local_pivot[2] += localCompensation.z;
            this.origin[0] = nextOrigin.x;
            this.origin[1] = nextOrigin.y;
            this.origin[2] = nextOrigin.z;
            return this;
        };
        prototype.transferOrigin = patchedTransferOrigin;

        patchedGetWorldCenter = function lightManagerTextureMeshGetWorldCenter() {
            const mesh = this.mesh;
            const geometry = mesh?.geometry;
            if (mesh && geometry) {
                if (!geometry.boundingBox) geometry.computeBoundingBox?.();
                if (geometry.boundingBox) {
                    mesh.updateWorldMatrix?.(true, false);
                    return geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
                }
            }
            return typeof originalGetWorldCenter === 'function'
                ? originalGetWorldCenter.apply(this, arguments)
                : new THREE.Vector3().fromArray(this.origin || [0, 0, 0]);
        };
        prototype.getWorldCenter = patchedGetWorldCenter;

        if (typeof originalUpdateGeometry === 'function') {
            patchedUpdateGeometry = function lightManagerTextureMeshUpdateGeometry(element, texture) {
                const sourceTexture = texture?.lightflowSourceTexture || texture || resolveTexture(element, true) || undefined;
                const frameSource = sourceTexture ? getFlipbookFrameTexture(sourceTexture) : { texture: sourceTexture, info: null };
                const nativeDispatchEvent = this.dispatchEvent;
                let deferredGeometryEvent = null;
                let deferredDispatchEvent = null;
                if (frameSource.info && typeof nativeDispatchEvent === 'function') {
                    deferredDispatchEvent = function lightManagerDeferTextureMeshGeometryEvent(eventName, event) {
                        if (eventName === 'update_geometry' && event?.element === element) {
                            deferredGeometryEvent = event || { element };
                            return;
                        }
                        return nativeDispatchEvent.apply(this, arguments);
                    };
                    this.dispatchEvent = deferredDispatchEvent;
                }
                let result;
                try {
                    result = originalUpdateGeometry.call(this, element, frameSource.texture || undefined);
                } finally {
                    if (this.dispatchEvent === deferredDispatchEvent) this.dispatchEvent = nativeDispatchEvent;
                }
                applyFlipbookUV(element, sourceTexture, frameSource.info, true);
                if (frameSource.info) installFlipbookRenderGuard(element);
                if (deferredGeometryEvent && typeof nativeDispatchEvent === 'function') {
                    nativeDispatchEvent.call(this, 'update_geometry', {
                        ...deferredGeometryEvent,
                        element,
                        texture: sourceTexture,
                        frame: frameSource.info.frame,
                        frameCount: frameSource.info.frameCount
                    });
                }
                return result;
            };
            controller.updateGeometry = patchedUpdateGeometry;
        }
        if (typeof originalUpdateFaces === 'function') {
            patchedUpdateFaces = function lightManagerTextureMeshUpdateFaces(element, ...args) {
                const texture = resolveTexture(element, true);
                const getDefault = window.Texture?.getDefault;
                if (!texture || typeof getDefault !== 'function') {
                    return originalUpdateFaces.call(this, element, ...args);
                }
                Texture.getDefault = () => texture;
                try {
                    return originalUpdateFaces.call(this, element, ...args);
                } finally {
                    if (Texture.getDefault !== getDefault) Texture.getDefault = getDefault;
                }
            };
            controller.updateFaces = patchedUpdateFaces;
        }
        patchedUpdateUV = function lightManagerTextureMeshUpdateUV(element, animationFrame = false) {
            const texture = resolveTexture(element, true);
            controller.updateGeometry?.(element, texture || undefined);
            this.dispatchEvent?.('update_uv', {
                element,
                texture,
                animationFrame,
                frame: texture?.currentFrame || 0,
                frameCount: texture?.frameCount || 1
            });
            return element;
        };
        controller.updateUV = patchedUpdateUV;

        if (textureAnimator && typeof originalTextureAnimatorUpdate === 'function') {
            patchedTextureAnimatorUpdate = function lightManagerTextureAnimatorUpdate(animatedTextures) {
                const result = originalTextureAnimatorUpdate.apply(this, arguments);
                const changedTextures = new Set(
                    Array.from(animatedTextures || []).map(getColorTexture).filter(Boolean)
                );
                if (!changedTextures.size) return result;
                const elements = Array.isArray(ElementType.all) ? ElementType.all : [];
                elements.forEach(element => {
                    const texture = resolveTexture(element, false);
                    if (texture && changedTextures.has(texture)) controller.updateUV(element, true);
                });
                return result;
            };
            textureAnimator.update = patchedTextureAnimatorUpdate;
        }
        if (textureAnimator && typeof originalTextureAnimatorReset === 'function') {
            patchedTextureAnimatorReset = function lightManagerTextureAnimatorReset() {
                const result = originalTextureAnimatorReset.apply(this, arguments);
                const elements = Array.isArray(ElementType.all) ? ElementType.all : [];
                elements.forEach(element => {
                    const texture = resolveTexture(element, false);
                    if (texture?.frameCount > 1) controller.updateUV(element, true);
                });
                return result;
            };
            textureAnimator.reset = patchedTextureAnimatorReset;
        }

        if (nativeAddAction) {
            patchedAddCondition = () => {
                const genericModel = window.Format?.id === 'free' || window.Format?.id === 'generic_model';
                return !!(window.Modes?.edit && (window.Format?.texture_meshes || genericModel));
            };
            nativeAddAction.condition = patchedAddCondition;
            window.BARS?.updateConditions?.();
        }

        ['slider_size_x', 'slider_size_y', 'slider_size_z'].forEach(id => {
            const slider = window.BarItems?.[id];
            if (!slider || typeof slider.onBefore !== 'function') return;
            const nativeOnBefore = slider.onBefore;
            const patchedOnBefore = function lightManagerTextureMeshScaleUndo(...args) {
                if (selectedTextureMeshes().length) {
                    const elements = Outliner.selected.filter(element => (
                        element?.getTypeBehavior?.('resizable') || element?.getTypeBehavior?.('scalable')
                    ));
                    Undo.initEdit({ elements });
                    return;
                }
                return nativeOnBefore.apply(this, args);
            };
            slider.onBefore = patchedOnBefore;
            patchedSizeSliders.push({ slider, nativeOnBefore, patchedOnBefore });
        });

        const openPropertiesDialog = () => {
            const elements = selectedTextureMeshes();
            const first = elements[0];
            if (!first) return;

            const textureOptions = {};
            if (elements.length > 1) {
                textureOptions.__keep__ = translateLightManager('light_manager.texture_mesh.keep_mixed');
            }
            (Texture.all || []).forEach(texture => {
                if (!texture?.uuid) return;
                const colorTexture = getColorTexture(texture);
                if (!colorTexture?.uuid || textureOptions[colorTexture.uuid]) return;
                textureOptions[colorTexture.uuid] = colorTexture.name || colorTexture.id || colorTexture.uuid;
            });
            const currentTexture = resolveTexture(first, true);
            if (!Object.keys(textureOptions).length) textureOptions.__keep__ = translateLightManager('light_manager.texture_mesh.keep_mixed');

            new Dialog('light_manager_texture_mesh_properties_dialog', {
                title: translateLightManager('light_manager.action.texture_mesh_properties'),
                form: {
                    texture: {
                        label: translateLightManager('light_manager.texture_mesh.texture'),
                        type: 'select',
                        options: textureOptions,
                        value: elements.length > 1 ? '__keep__' : (currentTexture?.uuid || Object.keys(textureOptions)[0])
                    },
                    rotation: {
                        label: translateLightManager('light_manager.texture_mesh.rotation'),
                        type: 'vector', dimensions: 3, value: first.rotation.slice(), step: 1
                    },
                    scale: {
                        label: translateLightManager('light_manager.texture_mesh.scale'),
                        type: 'vector', dimensions: 3, value: first.scale.slice(), step: 0.05
                    },
                    pivot: {
                        label: translateLightManager('light_manager.texture_mesh.pivot'),
                        type: 'vector', dimensions: 3, value: first.origin.slice(), step: 0.25
                    },
                    keep_geometry: {
                        label: translateLightManager('light_manager.texture_mesh.keep_geometry'),
                        description: translateLightManager('light_manager.texture_mesh.keep_geometry.desc'),
                        type: 'checkbox', value: true
                    }
                },
                onConfirm(result) {
                    const vector = (value, fallback, minimum = -Infinity) => [0, 1, 2].map(index => {
                        const number = Number(value?.[index]);
                        return Number.isFinite(number) ? Math.max(minimum, number) : fallback[index];
                    });
                    Undo.initEdit({ elements });
                    elements.forEach(element => {
                        const rotation = vector(result.rotation, element.rotation);
                        const scale = vector(result.scale, element.scale).map(value => (
                            Math.abs(value) < 0.0001 ? (value < 0 ? -0.0001 : 0.0001) : value
                        ));
                        const pivot = vector(result.pivot, element.origin);
                        element.rotation.splice(0, 3, ...rotation);
                        element.scale.splice(0, 3, ...scale);
                        controller.updateTransform?.(element);
                        if (result.keep_geometry) element.transferOrigin(pivot);
                        else element.origin.splice(0, 3, ...pivot);
                        if (result.texture !== '__keep__') {
                            const texture = findTexture(result.texture);
                            if (texture) element.texture_name = getColorTexture(texture)?.uuid || texture.uuid;
                        }
                        updateElement(element);
                    });
                    Undo.finishEdit(translateLightManager('light_manager.undo.edit_texture_mesh'));
                    window.Canvas?.updateView?.({
                        elements,
                        element_aspects: { transform: true, geometry: true, faces: true },
                        selection: true
                    });
                    window.updateSelection?.();
                }
            }).show();
        };

        propertiesAction = new Action('light_manager_texture_mesh_properties', {
            name: 'light_manager.action.texture_mesh_properties',
            description: 'light_manager.action.texture_mesh_properties.desc',
            icon: 'tune',
            category: 'edit',
            condition: () => selectedTextureMeshes().length > 0,
            click: openPropertiesDialog
        });
        prototype.menu?.addAction?.(propertiesAction, 'settings');

        const scheduleRefresh = () => {
            const run = () => {
                refreshTimer = null;
                if (!disposed) refreshAll();
            };
            if (typeof Vue !== 'undefined' && typeof Vue.nextTick === 'function') Vue.nextTick(run);
            else refreshTimer = setTimeout(run, 0);
        };
        listeners.push(Blockbench.on('load_project', scheduleRefresh));
        listeners.push(Blockbench.on('select_project', scheduleRefresh));
        listeners.push(Blockbench.on('add_texture', scheduleRefresh));
        scheduleRefresh();

        return {
            delete() {
                disposed = true;
                if (refreshTimer !== null) clearTimeout(refreshTimer);
                listeners.forEach(listener => listener?.delete?.());
                const menuStructure = prototype.menu?.structure;
                if (Array.isArray(menuStructure)) {
                    let index = menuStructure.indexOf(propertiesAction);
                    if (index < 0) index = menuStructure.indexOf('light_manager_texture_mesh_properties');
                    if (index >= 0) menuStructure.splice(index, 1);
                }
                propertiesAction?.delete?.();
                flipbookRenderGuards.forEach(({ previous, guard }, mesh) => {
                    if (mesh?.onBeforeRender === guard) mesh.onBeforeRender = previous;
                    const geometry = mesh?.geometry;
                    const baseUV = geometry?.userData?.lightflowTextureMeshBaseUV;
                    const uv = geometry?.getAttribute?.('uv') || geometry?.attributes?.uv;
                    if (baseUV instanceof Float32Array && uv?.array?.length === baseUV.length) {
                        uv.array.set(baseUV);
                        uv.needsUpdate = true;
                    }
                    if (geometry?.userData) {
                        delete geometry.userData.lightflowTextureMeshBaseUV;
                        delete geometry.userData.lightflowTextureMeshFlipbook;
                    }
                });
                flipbookRenderGuards.clear();
                patchedSizeSliders.forEach(({ slider, nativeOnBefore, patchedOnBefore }) => {
                    if (slider.onBefore === patchedOnBefore) slider.onBefore = nativeOnBefore;
                });
                if (nativeAddAction?.condition === patchedAddCondition) {
                    nativeAddAction.condition = originalAddCondition;
                    window.BARS?.updateConditions?.();
                }
                if (controller.updateGeometry === patchedUpdateGeometry) controller.updateGeometry = originalUpdateGeometry;
                if (controller.updateFaces === patchedUpdateFaces) controller.updateFaces = originalUpdateFaces;
                if (controller.updateUV === patchedUpdateUV) {
                    if (originalUpdateUV) controller.updateUV = originalUpdateUV;
                    else delete controller.updateUV;
                }
                if (textureAnimator?.update === patchedTextureAnimatorUpdate) textureAnimator.update = originalTextureAnimatorUpdate;
                if (textureAnimator?.reset === patchedTextureAnimatorReset) textureAnimator.reset = originalTextureAnimatorReset;
                if (window.Texture?.prototype?.apply === patchedTextureApply) Texture.prototype.apply = originalTextureApply;
                if (prototype.init === patchedInit) prototype.init = originalInit;
                if (prototype.applyTexture === patchedApplyTexture) {
                    if (originalApplyTexture) prototype.applyTexture = originalApplyTexture;
                    else delete prototype.applyTexture;
                }
                if (prototype.transferOrigin === patchedTransferOrigin) {
                    if (originalTransferOrigin) prototype.transferOrigin = originalTransferOrigin;
                    else delete prototype.transferOrigin;
                }
                if (prototype.getWorldCenter === patchedGetWorldCenter) prototype.getWorldCenter = originalGetWorldCenter;
                if (ElementType.behavior === patchedBehavior) ElementType.behavior = originalBehavior;
                flipbookFrameCanvases = new WeakMap();
            }
        };
    }

    function installLightManagerBillboardEnhancements() {
        const ElementType = window.Billboard;
        const controller = ElementType?.preview_controller;
        const originalUpdateUV = controller?.updateUV;
        if (!ElementType || !controller || typeof originalUpdateUV !== 'function') return null;

        const patchedUpdateUV = function lightManagerBillboardUpdateUV(element, animation = true) {
            const mesh = element?.mesh;
            const geometry = mesh?.geometry;
            const vertexUVs = geometry?.getAttribute?.('uv') || geometry?.attributes?.uv;
            const face = element?.faces?.front;
            if (!vertexUVs?.array || !face || face.texture === null) return geometry;

            const texture = face.getTexture?.() || null;
            const frameCount = Math.max(1, Math.floor(Number(texture?.frameCount) || 1));
            const frame = animation === true
                ? ((Math.floor(Number(texture?.currentFrame) || 0) % frameCount) + frameCount) % frameCount
                : 0;
            const projectUVWidth = Number(window.Project?.getUVWidth?.(texture));
            const projectUVHeight = Number(window.Project?.getUVHeight?.(texture));
            const width = Math.max(1, Number.isFinite(projectUVWidth)
                ? projectUVWidth
                : (Number(texture?.getUVWidth?.()) || Number(window.Project?.texture_width) || 16));
            const height = Math.max(1, Number.isFinite(projectUVHeight)
                ? projectUVHeight
                : (Number(texture?.getUVHeight?.()) || Number(window.Project?.texture_height) || 16));
            const uv = face.uv || [0, 0, width, height];
            const frameOffset = frame / frameCount;
            let values = [
                [uv[0] / width, 1 - (uv[1] / height) / frameCount - frameOffset],
                [uv[2] / width, 1 - (uv[1] / height) / frameCount - frameOffset],
                [uv[0] / width, 1 - (uv[3] / height) / frameCount - frameOffset],
                [uv[2] / width, 1 - (uv[3] / height) / frameCount - frameOffset]
            ];

            let rotation = ((Number(face.rotation) || 0) % 360 + 360) % 360;
            while (rotation >= 90) {
                values = [values[2], values[0], values[3], values[1]];
                rotation -= 90;
            }
            values.forEach((value, index) => vertexUVs.array.set(value, index * 2));
            vertexUVs.needsUpdate = true;

            this.dispatchEvent?.('update_uv', {
                element,
                texture,
                animation,
                frame,
                frameCount
            });
            return geometry;
        };
        controller.updateUV = patchedUpdateUV;

        const cameraListener = Blockbench.on('update_camera_position', () => {
            const billboards = Array.isArray(ElementType.all) ? ElementType.all : [];
            if (!billboards.some(element => (
                element?.visibility !== false && element?.sa_cast_shadow !== false
            ))) return;
            markLightManagerShadowsDirty({ scene: true });
        });

        return {
            delete() {
                cameraListener?.delete?.();
                if (controller.updateUV === patchedUpdateUV) controller.updateUV = originalUpdateUV;
            }
        };
    }

    function disposeThreeLight(light) {
        disposeLightManagerThreeLightObject(light);
    }

    function disposeLightElementPreviewResources(ElementType) {
        if (!ElementType || !Array.isArray(ElementType.all)) return;
        ElementType.all.forEach(element => {
            const mesh = element?.mesh;
            if (!mesh) return;
            const geometries = new Set();
            const materials = new Set();
            mesh.traverse?.(object => {
                if (object.geometry) geometries.add(object.geometry);
                const objectMaterials = Array.isArray(object.material)
                    ? object.material
                    : (object.material ? [object.material] : []);
                objectMaterials.forEach(material => materials.add(material));
            });
            geometries.forEach(geometry => geometry?.dispose?.());
            materials.forEach(material => material?.dispose?.());
            mesh.parent?.remove?.(mesh);
            if (window.Project?.nodes_3d?.[element.uuid] === mesh) {
                delete Project.nodes_3d[element.uuid];
            }
        });
    }

    /**
     * Groups Blockbench form elements into horizontal rows.
     * Intercepts `buildForm` to ensure the grouping survives any DOM updates/rebuilds.
     * Supports Blockbench toolbar-style separators:
     * '_' (vertical border), '-' (horizontal divider), '+' (spacer), and '#' (linebreak).
     *
     * @param {InputForm} form - The form instance (e.g., panel.form)
     * @param {Array<Object>} groups - List of group configurations
     * @param {Array<string>} groups[].elements - The IDs of the form elements and separators
     * @param {string} [groups[].gap='8px'] - Flexbox gap between elements
     * @param {Object} [groups[].flex={}] - Flexbox grow/shrink/basis rules per element ID
     * @param {string} [groups[].divider_color='var(--color-elevated)'] - Color for '_' and '-' dividers
     * @param {string} [groups[].class_name] - Optional semantic styling class for the row
     * @param {string} [groups[].aria_label] - Accessible name for the grouped controls
     */
    function applyIndestructibleFormGroups(form, groups) {
        if (!form) return;
        const separatorTokens = new Set(['_', '+', '#', '-']);
        const isSeparator = id => typeof id === 'string' && separatorTokens.has(id);
        const groupedRows = new Set();

        const syncGroupedRowVisibility = () => {
            groupedRows.forEach(row => {
                const bars = [...row.children].filter(child => child.classList?.contains('dialog_bar'));
                const hasVisibleControl = bars.some(bar => !bar.hidden && bar.style.display !== 'none');
                row.style.display = hasVisibleControl ? 'flex' : 'none';
            });
        };

        const getFormBar = (formNode, id) => {
            const directBar = form.form_data?.[id]?.bar;
            if (directBar && directBar.nodeType === 1 && formNode.contains(directBar)) return directBar;
            const className = `form_bar_${id}`;
            return [...formNode.querySelectorAll('.dialog_bar, .full_width_dialog_bar')]
                .find(node => node.classList.contains(className)) || null;
        };

        // Internal function that handles the visual restructuring
        const groupElements = () => {
            if (!form.node) return;
            let formNode = form.node;
            groupedRows.clear();

            groups.forEach(config => {
                let {
                    elements,
                    gap = '8px',
                    flex = {},
                    divider_color = 'var(--color-elevated)',
                    class_name = '',
                    aria_label = ''
                } = config;

                if (!elements || elements.length === 0) return;

                // Find the first actual form element to use as an insertion anchor (ignoring separators)
                let firstRealId = elements.find(id => typeof id === 'string' && !isSeparator(id));
                if (!firstRealId) return;

                let firstBar = getFormBar(formNode, firstRealId);
                if (!firstBar) return;

                // Reuse an existing row after dynamic form rebuilds. Blockbench can preserve
                // the first bar while replacing later bars, so returning early here would leave
                // the replacement controls stacked vertically.
                let row = firstBar.parentElement.classList.contains('form_row_group')
                    ? firstBar.parentElement
                    : null;
                if (!row) {
                    row = document.createElement('div');
                    row.className = 'form_row_group full_width_dialog_bar';
                    firstBar.parentNode.insertBefore(row, firstBar);
                }
                row.querySelectorAll(':scope > .light_manager_form_separator').forEach(separator => separator.remove());
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.gap = gap;
                row.style.width = '100%';
                row.style.background = 'transparent';
                row.style.padding = '0';
                row.style.boxSizing = 'border-box';
                if (class_name) {
                    String(class_name).split(/\s+/).filter(Boolean).forEach(name => row.classList.add(name));
                }
                row.setAttribute('role', 'group');
                if (aria_label) row.setAttribute('aria-label', aria_label);
                groupedRows.add(row);

                // Move elements and separators into the row
                elements.forEach(id => {
                    // Check if the item is a separator/spacer
                    if (isSeparator(id)) {
                        let char = id.substring(0, 1);
                        let sep = document.createElement('div');

                        let typeClass = '';
                        if (char === '_') typeClass = 'border';
                        else if (char === '+') typeClass = 'spacer';
                        else if (char === '#') typeClass = 'linebreak';
                        else if (char === '-') typeClass = 'horizontal_divider';

                        sep.className = `toolbar_separator light_manager_form_separator ${typeClass}`;

                        if (char === '+') {
                            // Spacer: flexes to push elements apart
                            sep.style.flex = '1 1 auto';
                            sep.style.minWidth = '0px';
                        } else if (char === '_') {
                            // Border: renders a vertical line
                            sep.style.flex = '0 0 auto';
                            sep.style.height = '24px';
                            sep.style.width = '2px';
                            sep.style.backgroundColor = divider_color;
                            sep.style.margin = '0 4px';
                        } else if (char === '-') {
                            // Horizontal divider: renders a full-width horizontal line and forces a line break
                            sep.style.flex = '1 1 100%';
                            sep.style.height = '2px';
                            sep.style.backgroundColor = divider_color;
                            sep.style.margin = '4px 0';
                            row.style.flexWrap = 'wrap'; // Ensure the row allows wrapping
                        } else if (char === '#') {
                            // Linebreak: forces next items to a new line inside the flex container
                            sep.style.flex = '1 1 100%';
                            sep.style.height = '0';
                            row.style.flexWrap = 'wrap';
                        }

                        row.appendChild(sep);
                        return;
                    }

                    // Handle normal form elements
                    let bar = getFormBar(formNode, id);
                    if (bar) {
                        bar.style.padding = '0';
                        bar.style.margin = '0';
                        bar.style.border = 'none';
                        bar.style.minHeight = '0';
                        bar.style.flex = flex[id] !== undefined ? flex[id] : '1 1 auto';
                        row.appendChild(bar);
                    }
                });
            });
            syncGroupedRowVisibility();
        };

        // Apply the initial group state before the form becomes interactive.
        groupElements();

        // Reapply grouping after Blockbench rebuilds the form.
        let originalBuildForm = form.buildForm;
        form.buildForm = function (...args) {
            // Let Blockbench build the entire form natively first
            const response = originalBuildForm.apply(this, args);

            // Re-apply our groups immediately after
            groupElements();
            return response;
        };
        let originalUpdate = form.update;
        form.update = function (...args) {
            const response = originalUpdate.apply(this, args);
            syncGroupedRowVisibility();
            return response;
        };
    }

    const LIGHT_MANAGER_UI_MARKER_PRESETS = Object.freeze([
        { id: 'light_blue', name: 'Light Blue', standard: '#55baff', pastel: '#9bd7ff' },
        { id: 'yellow', name: 'Yellow', standard: '#ffd500', pastel: '#ffe875' },
        { id: 'orange', name: 'Orange', standard: '#f29216', pastel: '#ffc36f' },
        { id: 'red', name: 'Red', standard: '#ff5c64', pastel: '#ff9ba0' },
        { id: 'purple', name: 'Purple', standard: '#a75afa', pastel: '#c9a0ff' },
        { id: 'blue', name: 'Blue', standard: '#518cff', pastel: '#95b7ff' },
        { id: 'green', name: 'Green', standard: '#00c97b', pastel: '#7be4b7' },
        { id: 'lime', name: 'Lime', standard: '#9dff57', pastel: '#c6ff9e' },
        { id: 'pink', name: 'Pink', standard: '#f663b7', pastel: '#f9a2d5' },
        { id: 'silver', name: 'Silver', standard: '#bed1f2', pastel: '#dce7f8' }
    ].map(entry => Object.freeze(entry)));

    class LightManagerGridMenu {
        constructor(menu, options = {}) {
            this.menu = menu;
            this.options = options;
            this.groups = [];
        }

        static calculateColumns(itemCount, options = {}) {
            const count = Math.max(0, Number(itemCount) || 0);
            if (!count) return 0;
            const minColumns = Math.max(1, Math.floor(Number(options.minColumns) || 1));
            const maxColumns = Math.max(minColumns, Math.floor(Number(options.maxColumns) || 4));
            const requested = Number(options.columns);
            if (Number.isFinite(requested) && requested > 0) {
                return Math.min(count, Math.max(minColumns, Math.min(maxColumns, Math.floor(requested))));
            }
            return Math.min(count, Math.max(minColumns, Math.min(maxColumns, Math.ceil(Math.sqrt(count)))));
        }

        apply() {
            const root = this.menu?.node;
            if (!root) return this;
            const selector = this.options.itemSelector || 'li[menu_item]';
            const matchingItems = Array.from(root.querySelectorAll(selector));
            const groupedItems = new Map();
            matchingItems.forEach(item => {
                const parent = item.parentElement;
                if (!parent) return;
                if (!groupedItems.has(parent)) groupedItems.set(parent, []);
                groupedItems.get(parent).push(item);
            });

            const cellSize = Math.max(28, Math.round(Number(this.options.cellSize) || 40));
            const padding = Math.max(0, Math.round(Number(this.options.padding) || 4));
            groupedItems.forEach((items, container) => {
                const columns = LightManagerGridMenu.calculateColumns(items.length, this.options);
                if (!columns) return;
                const rows = Math.ceil(items.length / columns);
                container.classList.add('light_manager_grid_menu');
                container.style.setProperty('--light-manager-grid-columns', String(columns));
                container.style.setProperty('--light-manager-grid-cell-size', `${cellSize}px`);
                container.style.setProperty('--light-manager-grid-padding', `${padding}px`);
                container.style.setProperty('--light-manager-grid-width', `${columns * cellSize + padding * 2}px`);
                container.setAttribute('data-grid-columns', String(columns));
                container.setAttribute('data-grid-rows', String(rows));

                items.forEach(item => {
                    item.classList.add('light_manager_grid_menu_item');
                    item.setAttribute('aria-selected', item.classList.contains('marked') ? 'true' : 'false');
                });
                this.groups.push({ container, items, columns, rows });
            });
            return this;
        }

        static decorate(menu, options = {}) {
            return new LightManagerGridMenu(menu, options).apply();
        }
    }

    class LightManagerIdentityMenu {
        static getItemNode(menu, itemId) {
            if (!menu?.node) return null;
            const safeItemId = String(itemId || '').replace(/"/g, '\\"');
            return menu.node.querySelector(`li[menu_item="${safeItemId}"]`);
        }

        static decorateItem(menu, itemId, color, options = {}) {
            const item = this.getItemNode(menu, itemId);
            if (!item) return null;
            if (color) {
                item.classList.add('light_manager_identity_colored_item');
                item.style.setProperty('--light-manager-identity-color', color);
            }
            if (options.className) item.classList.add(options.className);
            if (options.title) item.title = options.title;
            return item;
        }
    }

    function getLightManagerMarkerColor(index, tone = 'pastel', fallback = 'var(--color-accent)') {
        const palette = globalThis.markerColors;
        const entry = Array.isArray(palette) ? palette[index] : null;
        return entry?.[tone] || entry?.pastel || entry?.standard || fallback;
    }

    function addLightManagerCompactPanelStyles(panelId) {
        const safeId = String(panelId || '').replace(/[^a-z0-9_-]/gi, '');
        if (!safeId || typeof Blockbench?.addCSS !== 'function') return null;
        const selector = `#panel_${safeId}`;
        return Blockbench.addCSS(`
            ${selector} {
                overflow-y: auto !important;
                overflow-x: hidden;
                background: var(--color-ui);
            }
            ${selector} .dialog_bar,
            ${selector} .full_width_dialog_bar {
                margin-top: 0;
                margin-bottom: 0;
            }
            ${selector} .form_row_group {
                min-width: 0;
                min-height: 30px;
            }
            ${selector}::-webkit-scrollbar {
                width: 6px;
            }
            ${selector}::-webkit-scrollbar-thumb {
                background-color: var(--color-button);
                border-radius: 3px;
            }
        `);
    }

    function addLightManagerDesignedPanelStyles(panelId, options = {}) {
        const safeId = String(panelId || '').replace(/[^a-z0-9_-]/gi, '');
        if (!safeId || typeof Blockbench?.addCSS !== 'function') return null;
        const selector = `#panel_${safeId}`;
        const scrollbarWidth = Math.max(3, Math.min(8, Number(options.scrollbar_width) || 4));
        const rowPadding = options.row_padding || '3px 4px';
        return Blockbench.addCSS(`
            ${selector} {
                overflow-x: hidden;
                background: var(--color-ui);
                container-type: inline-size;
            }
            ${selector} .panel_handle {
                position: sticky;
                top: 0;
                z-index: 3;
                background: color-mix(in srgb, var(--color-ui) 94%, transparent);
                backdrop-filter: blur(8px);
                border-bottom: 1px solid var(--color-border);
            }
            ${selector} .form {
                flex: 1 1 auto;
                min-height: 0;
                overflow-y: auto !important;
                overflow-x: hidden;
                scrollbar-gutter: stable;
                padding: 4px !important;
                box-sizing: border-box;
            }
            ${selector} .dialog_bar {
                margin: 0 !important;
                padding: ${rowPadding} !important;
                border: 0;
                border-radius: 4px;
                background: transparent;
            }
            ${selector} .dialog_bar:hover {
                background: color-mix(in srgb, var(--color-selected) 16%, transparent);
            }
            ${selector} .dialog_bar label {
                font-size: 13px;
                color: var(--color-text);
            }
            /* Native dialogs reserve a fixed label width. A sidebar must share
               its actual width with the input instead of squeezing it to 50px. */
            ${selector} .dialog_bar > label.name_space_left {
                flex: 0 1 48%;
                width: 48%;
                min-width: 0;
                padding-right: 6px;
                white-space: normal;
                overflow-wrap: anywhere;
                line-height: 1.3;
            }
            ${selector} .dialog_bar > label.name_space_left > span:first-child {
                white-space: normal !important;
                overflow: visible !important;
            }
            ${selector} .dialog_bar > .numeric_input {
                flex: 1 1 84px;
                min-width: 84px;
            }
            ${selector} .dialog_bar > .numeric_input input {
                padding-right: 24px;
                min-width: 0;
            }
            ${selector} .dialog_bar > .dialog_form_description {
                flex: 0 0 12px;
                text-align: center;
                margin-left: 3px;
            }
            ${selector} .dialog_bar > .light_manager_enum_select_input {
                flex: 1 1 112px !important;
                min-width: 100px !important;
            }
            ${selector} .dialog_bar > .light_manager_horizontal_select {
                min-height: 34px;
                box-sizing: border-box;
            }
            ${selector} .light_manager_horizontal_select .horizontal_select_btn.selected {
                background: color-mix(in srgb, var(--color-accent) 68%, #000) !important;
                color: #fff !important;
            }
            ${selector} .dialog_form_description {
                font-size: 12px;
                line-height: 1.4;
                color: var(--color-text);
            }
            ${selector} .light_manager_enum_select_input {
                font-size: 13px !important;
                font-weight: 400 !important;
                color: var(--color-text) !important;
            }
            ${selector} .light_manager_advanced_color_control.is_expanded .sp-replacer {
                display: flex !important;
                align-items: center;
                width: 100% !important;
                height: 28px !important;
                padding: 3px 6px !important;
                box-sizing: border-box;
                border-color: var(--color-border) !important;
                background: var(--color-button) !important;
            }
            ${selector} .light_manager_advanced_color_control.is_expanded .sp-preview {
                flex: 1 1 auto;
                width: auto !important;
                height: 18px !important;
                margin: 0 6px 0 0 !important;
                border-color: color-mix(in srgb, var(--color-text) 24%, transparent) !important;
            }
            ${selector} .light_manager_advanced_color_control.is_expanded .sp-dd {
                flex: 0 0 12px;
                height: 18px;
                line-height: 18px;
                color: var(--color-text);
            }
            ${selector} .form::-webkit-scrollbar {
                width: ${scrollbarWidth}px;
            }
            ${selector} .form::-webkit-scrollbar-track {
                background: transparent;
            }
            ${selector} .form::-webkit-scrollbar-thumb {
                background-color: color-mix(in srgb, var(--color-text) 22%, transparent);
                border-radius: ${scrollbarWidth}px;
            }
            ${selector} .form:hover::-webkit-scrollbar-thumb {
                background-color: color-mix(in srgb, var(--color-text) 34%, transparent);
            }
            ${selector} .light_manager_form_variant_group {
                margin-top: 3px !important;
                padding: 0 !important;
                background: transparent !important;
                border: 0;
                border-bottom: 1px solid var(--color-border);
                border-radius: 0;
            }
            ${selector} .light_manager_form_variant_group .custom_checkbox {
                min-height: 28px !important;
                height: 28px !important;
                padding: 1px 6px !important;
                font-weight: 600;
            }
            ${selector} .light_manager_form_variant_group .custom_checkbox .material-icons {
                color: var(--color-subtle_text) !important;
            }
            ${selector} .light_manager_form_variant_group .custom_checkbox:hover .material-icons {
                color: var(--color-accent) !important;
            }
            ${selector} .light_manager_form_variant_panel_tabs {
                padding: 0 !important;
                margin-bottom: 3px !important;
            }
            ${selector} .light_manager_form_variant_panel_tabs .light_manager_horizontal_select {
                min-height: 29px;
                border-radius: 3px;
                overflow: hidden;
            }
            ${selector} .light_manager_form_variant_panel_tabs .horizontal_select_btn {
                min-height: 28px;
                padding: 3px 8px;
            }
            ${selector} .light_manager_panel_search_bar {
                margin: 0 0 3px !important;
            }
            ${selector} .light_manager_panel_search {
                display: grid;
                grid-template-columns: minmax(78px, 1fr) minmax(86px, auto) 32px;
                gap: 4px;
                width: 100%;
                min-width: 0;
            }
            ${selector} .light_manager_panel_search_input,
            ${selector} .light_manager_panel_search_active,
            ${selector} .light_manager_panel_search_collapse {
                display: flex;
                align-items: center;
                min-width: 0;
                min-height: 29px;
                box-sizing: border-box;
                border: 1px solid var(--color-border);
                border-radius: 3px;
                background: var(--color-back);
                color: var(--color-subtle_text);
            }
            ${selector} .light_manager_panel_search_input {
                gap: 5px;
                padding: 0 6px;
            }
            ${selector} .light_manager_panel_search_input > i {
                flex: 0 0 auto;
                font-size: 17px;
            }
            ${selector} .light_manager_panel_search_input input {
                width: 100%;
                min-width: 0;
                height: 26px;
                padding: 0;
                border: 0;
                outline: 0;
                background: transparent;
                color: var(--color-text);
                font: inherit;
            }
            ${selector} .light_manager_panel_search_active,
            ${selector} .light_manager_panel_search_collapse {
                justify-content: center;
                gap: 5px;
                padding: 0 7px;
                font: inherit;
                cursor: pointer;
            }
            ${selector} .light_manager_panel_search_active > i,
            ${selector} .light_manager_panel_search_collapse > i {
                font-size: 17px;
            }
            ${selector} .light_manager_panel_search_collapse {
                flex: 0 0 32px;
                width: 32px;
                height: 29px;
                min-width: 32px;
                min-height: 32px;
                padding: 0;
                text-align: center;
            }
            ${selector} .light_manager_panel_search_collapse > i {
                display: block;
                line-height: 1;
            }
            ${selector} .light_manager_panel_search_active:hover,
            ${selector} .light_manager_panel_search_collapse:hover {
                border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-border));
                background: color-mix(in srgb, var(--color-accent) 10%, var(--color-back));
                color: var(--color-accent) !important;
            }
            @container (max-width: 285px) {
                ${selector} .light_manager_panel_search_active {
                    min-width: 76px;
                }
            }
            ${selector} .light_manager_panel_search_active > span {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            ${selector} .lightflow_search_empty,
            ${selector} .lightflow_disabled_reason {
                color: var(--color-text);
                font-size: 12px;
                line-height: 1.4;
                padding: 6px 4px;
            }
            ${selector} .lightflow_disabled_reason { flex: 1 0 100%; }
            ${selector} .dialog_bar:has(> .lightflow_disabled_reason:not([hidden])) { flex-wrap: wrap; }
            ${selector} .lightflow_search_expanded { border-left: 2px solid var(--color-accent); }
            ${selector} .light_manager_panel_search_active.selected {
                border-color: var(--color-accent);
                color: var(--color-text) !important;
                background: color-mix(in srgb, var(--color-accent) 18%, var(--color-back));
            }
            ${selector} .light_manager_panel_search_active:focus-visible,
            ${selector} .light_manager_panel_search_collapse:focus-visible,
            ${selector} .light_manager_panel_search_input:focus-within {
                color: var(--color-text);
                outline: 2px solid var(--color-accent);
                outline-offset: -2px;
            }
            ${selector} .light_manager_panel_filter_hidden {
                display: none !important;
            }
            ${selector} .light_manager_group_summary {
                min-width: 0;
                margin-left: 6px;
                overflow: hidden;
                color: var(--color-subtle_text);
                font-size: 12px;
                font-weight: 400;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            ${selector} .light_manager_modified_dot {
                width: 7px;
                height: 7px;
                margin-left: 5px;
                flex: 0 0 7px;
                border-radius: 50%;
                background: var(--color-accent);
                box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-ui) 68%, transparent);
            }
        `);
    }

    /* LIGHTFLOW_UI_STATE_CORE_START */
    function createLightflowUIStateCore() {
        const normalize = value => {
            if (value && typeof value.toArray === 'function') return value.toArray().map(normalize);
            if (value && typeof value.getHexString === 'function') return value.getHexString();
            if (Array.isArray(value)) return value.map(normalize);
            if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]));
            return value;
        };
        const equal = (left, right) => JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
        const evaluate = (value, result, fallback) => {
            try { return value === undefined ? fallback : (typeof value === 'function' ? !!value(result) : !!value); }
            catch (_) { return fallback; }
        };
        const fieldState = (options, value, result = {}) => {
            const group = options.variant === 'group';
            const baseline = options.reset_value !== undefined ? options.reset_value : options.default;
            return {
                active: evaluate(options.active, result, group ? false : typeof value === 'boolean' && value),
                modified: evaluate(options.modified, result, !group && baseline !== undefined && !equal(value, baseline))
            };
        };
        const filterRows = (rows, query = '', mode = 'all') => {
            const needle = String(query).trim().toLocaleLowerCase();
            const textMatch = row => !needle || String(row.text || '').toLocaleLowerCase().includes(needle);
            const stateMatch = row => mode === 'all' || !!row[mode === 'modified' ? 'modified' : 'active'];
            const groups = new Map(rows.filter(row => row.group).map(row => [row.id, row]));
            const visible = new Set();
            rows.forEach(row => {
                if (row.applicable === false) return;
                const parent = groups.get(row.parent);
                if (stateMatch(row) && (textMatch(row) || (parent && textMatch(parent)))) {
                    visible.add(row.id);
                    if (parent) visible.add(parent.id);
                }
            });
            return visible;
        };
        const helperVisible = ({ policy = 'contextual', global = true, visible = true, selected = false, tool = false, kind = 'guide' } = {}) =>
            global !== false && visible !== false && policy !== 'clean' &&
            (kind === 'handle' ? !!(selected && tool) : policy === 'all' || kind === 'marker' || !!selected);
        return { equal, fieldState, filterRows, helperVisible };
    }
    /* LIGHTFLOW_UI_STATE_CORE_END */
    const LightflowUIState = createLightflowUIStateCore();

    function captureLightflowFormView(form) {
        const focused = typeof document !== 'undefined' ? document.activeElement : null;
        const elements = Object.values(form.form_data || {});
        const owner = focused && elements.find(element => element.bar?.contains(focused));
        const focusIndex = owner ? [...owner.bar.querySelectorAll('input,button,select,textarea,[contenteditable],.nslide,[tabindex]')].indexOf(focused) : -1;
        return {
            scroll: form.node?.scrollTop || 0,
            owner: owner?.id,
            focusIndex,
            selectionStart: focused?.selectionStart,
            selectionEnd: focused?.selectionEnd,
            filters: elements.filter(element => element.options?.type === 'panel_search').map(element => ({
                id: element.id, query: element.getValue(), mode: element.filter_mode || 'all'
            }))
        };
    }

    function restoreLightflowFormView(form, state) {
        if (!state) return;
        state.filters.forEach(filter => {
            const element = form.form_data?.[filter.id];
            if (!element) return;
            element.filter_mode = filter.mode;
            element.filter_select?.set?.(filter.mode);
            element.setValue(filter.query);
        });
        if (form.node) form.node.scrollTop = state.scroll;
        if (!state.owner || state.focusIndex < 0) return;
        const target = form.form_data?.[state.owner]?.bar?.querySelectorAll('input,button,select,textarea,[contenteditable],.nslide,[tabindex]')[state.focusIndex];
        if (!target || target.disabled) return;
        target.focus?.({ preventScroll: true });
        if (typeof state.selectionStart === 'number' && target.setSelectionRange) {
            try { target.setSelectionRange(state.selectionStart, state.selectionEnd); } catch (_) { /* Non-text inputs do not expose a caret. */ }
        }
        if (form.node) form.node.scrollTop = state.scroll;
    }

    // Reusable form grammar for Lightflow panels:
    // const design = LightManagerUI.formDesign;
    // const style = LightManagerUI.addDesignedPanelStyles('panel_id');
    // formConfig.enabled = design.checkbox({ label: 'Enabled', value: true });
    const LightManagerFormDesign = Object.freeze({
        checkbox(options = {}) {
            return Object.assign({
                type: 'custom_checkbox',
                layout: 'space_between',
                separator: true,
                icon_on: 'check_box',
                icon_off: 'check_box_outline_blank',
                icon_color_on: 'var(--color-accent)',
                icon_color_off: 'var(--color-subtle_text)',
                padding: '2px 8px',
                animate: false
            }, options);
        },
        group(options = {}) {
            return Object.assign({
                type: 'custom_checkbox',
                variant: 'group',
                layout: 'space_between',
                icon_on: 'expand_more',
                icon_off: 'chevron_right',
                label_color: 'var(--color-text)',
                padding: '2px 8px'
            }, options);
        },
        tabs(options = {}) {
            return Object.assign({
                type: 'horizontal_select',
                allow_empty: false,
                multi_select: false,
                expand: true,
                variant: 'panel_tabs'
            }, options);
        },
        search(options = {}) {
            return Object.assign({
                type: 'panel_search',
                placeholder: 'Find setting',
                active_label: 'Active only',
                variant: 'panel_search'
            }, options);
        },
        subsection(options = {}) {
            return Object.assign({
                type: 'bar_display',
                variant: 'subsection',
                color: 'var(--color-text)',
                font_size: '13px',
                font_weight: 500,
                separator: true,
                separator_thickness: '1px',
                leading_line_width: '6px'
            }, options);
        },
        enum(options = {}) {
            return Object.assign({ type: 'enum_select' }, options);
        },
        color(options = {}) {
            return Object.assign({ type: 'advanced_color', expand_control: true }, options);
        },
        vector(options = {}) {
            return Object.assign({ type: 'custom_vector' }, options);
        },
        actionToggle(options = {}) {
            return Object.assign({ type: 'action_toggle' }, options);
        },
        gradient(options = {}) {
            return Object.assign({
                type: 'gradient_editor',
                compact: true,
                height: 28,
                handle_size: 14
            }, options);
        }
    });

    // Native panel positions remain user-owned. Defaults are applied only to modes
    // without saved customization; the explicit layout action has a reversible backup.
    function createLightflowWorkspace() {
        const read = (key, fallback) => {
            try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; }
        };
        const registered = new Map();
        const appliedDefaults = new WeakMap();
        const listeners = [];
        const layoutKey = 'lightflow_workspace_layout_v3';
        const helperKey = 'lightflow_helper_policy_v3';
        let helperPolicy = read(helperKey, 'contextual');
        if (!['contextual', 'all', 'clean'].includes(helperPolicy)) helperPolicy = 'contextual';
        let cleanSnapshot = null;
        const hideCleanHelpers = () => {
            if (!cleanSnapshot) return;
            const nodes = [...(Canvas.gizmos || []), typeof three_grid !== 'undefined' ? three_grid : null, Canvas.side_grids?.x, Canvas.side_grids?.z];
            (window.Outliner?.elements || []).forEach(element => {
                const mesh = element.mesh;
                if (!mesh) return;
                nodes.push(mesh.outline, mesh.grid_box);
                if (element.getTypeBehavior?.('hide_in_screenshot')) nodes.push(mesh);
            });
            nodes.filter(Boolean).forEach(node => {
                if (!cleanSnapshot.nodes.has(node)) cleanSnapshot.nodes.set(node, node.visible);
                node.visible = false;
            });
        };
        const restoreCleanHelpers = () => {
            if (!cleanSnapshot) return;
            cleanSnapshot.nodes.forEach((visible, node) => { if (node.visible === false) node.visible = visible; });
            Canvas.show_gizmos = cleanSnapshot.show;
            cleanSnapshot = null;
        };
        const modeId = () => window.Interface?.getUIMode?.() || window.Project?.mode || 'edit';
        const layoutFor = (id, mode) => {
            const right = {slot: 'right_bar', height: 300, fixed_height: true, folded: false, sidebar_index: 1};
            const left = {slot: 'left_bar', height: 520, fixed_height: false, folded: false, sidebar_index: 1};
            if (id === 'lightflow_scene') return {...left, attached_to: Panels.material_properties ? 'material_properties' : '', attached_index: 3};
            if (id === 'material_properties') return {...left, attached_to: ''};
            if (id === 'light_properties' || id === 'lightflow_atmosphere_properties') {
                return {...right, attached_to: id === 'light_properties' ? '' : 'light_properties', attached_index: id === 'light_properties' ? 0 : 1};
            }
            if (id === 'lightflow_environment_panel' || id === 'lightflow_scene_composer_panel') {
                return {...left, attached_to: Panels.material_properties ? 'material_properties' : (Panels.lightflow_scene ? 'lightflow_scene' : ''), attached_index: id === 'lightflow_environment_panel' ? 1 : 2};
            }
            return null;
        };
        const updateDefaults = () => {
            const savedPanels = read('panel_customization', {});
            for (const [id, panel] of registered) {
                panel.default_configuration.mode_positions ||= {};
                const applied = appliedDefaults.get(panel) || {};
                for (const mode of ['edit', 'render']) {
                    const next = layoutFor(id, mode);
                    if (!next) continue;
                    panel.default_configuration.mode_positions[mode] = {...panel.default_configuration.mode_positions[mode], ...next};
                    const current = panel.mode_position_data[mode];
                    const stillDefault = !applied[mode] || Object.entries(applied[mode]).every(([key, value]) => current?.[key] === value);
                    if (!savedPanels[id]?.[mode] && current && stillDefault) {
                        Object.assign(panel.mode_position_data[mode], next);
                        applied[mode] = {...next};
                    }
                }
                appliedDefaults.set(panel, applied);
                panel.updateSlot?.();
            }
        };
        const notifyHelpers = () => {
            window.updateSelection?.();
            window.LightElement?.all?.forEach(light => LightElement.preview_controller?.updateSelection(light, {gizmos: false}));
            window.LightManagerAreaGizmos?.updateAll?.();
            window.LightManagerViewportControls?.updateAll?.();
            Blockbench.dispatchEvent('lightflow_gizmo_visibility_changed', {policy: helperPolicy});
            hideCleanHelpers();
            window.Preview?.all?.forEach(preview => preview.render?.());
        };
        const api = {
            version: 3,
            get helperPolicy() { return helperPolicy; },
            helperVisible(options) { return LightflowUIState.helperVisible({policy: helperPolicy, global: window.Canvas?.show_gizmos !== false, ...options}); },
            setHelperPolicy(value) {
                if (!['contextual', 'all', 'clean'].includes(value)) return;
                if (value === 'clean' && !cleanSnapshot) {
                    cleanSnapshot = {show: Canvas.show_gizmos, nodes: new Map()};
                    Canvas.show_gizmos = false;
                } else if (value !== 'clean' && cleanSnapshot) {
                    // Do not write project/environment visibility; only restore the UI flag.
                    restoreCleanHelpers();
                }
                helperPolicy = value;
                localStorage.setItem(helperKey, JSON.stringify(value));
                notifyHelpers();
            },
            register(panel) {
                if (!panel || registered.get(panel.id) === panel) return true;
                registered.set(panel.id, panel);
                updateDefaults();
                return true;
            },
            select(panel) {
                if (!panel) return;
                (panel.getHostPanel?.() || panel).selectTab?.(panel);
            },
            applyLayout() {
                const mode = modeId();
                const previous = read(layoutKey, {});
                previous[mode] ||= {};
                for (const [id, panel] of registered) {
                    previous[mode][id] ||= {...panel.position_data};
                    panel.customizePosition?.(layoutFor(id, mode));
                    panel.updateSlot?.();
                }
                const outliner = Panels.outliner;
                if (outliner) {
                    previous[mode].outliner ||= {...outliner.position_data};
                    outliner.customizePosition?.({slot: 'right_bar', attached_to: '', sidebar_index: 3, height: 300, folded: false});
                    outliner.updateSlot?.();
                }
                localStorage.setItem(layoutKey, JSON.stringify(previous));
                window.updateInterfacePanels?.();
            },
            restoreLayout() {
                const previous = read(layoutKey, {});
                const mode = modeId();
                for (const [id, data] of Object.entries(previous[mode] || {})) {
                    Panels[id]?.customizePosition?.(data);
                    Panels[id]?.updateSlot?.();
                }
                delete previous[mode];
                localStorage.setItem(layoutKey, JSON.stringify(previous));
                window.updateInterfacePanels?.();
            },
            installScene() {
                const t = key => translateLightManager('light_manager.ui.' + key);
                const run = id => window.BarItems?.[id]?.trigger?.();
                const scene = new Panel('lightflow_scene', {
                    name: t('scene'), icon: 'view_in_ar', growable: true, resizable: true,
                    condition: {modes: ['render'], project: true},
                    default_position: {slot: 'left_bar', height: 520, fixed_height: false, sidebar_index: 1},
                    form: {
                        _scene_hint: {type: 'info', text: t('scene_hint')},
                        _scene_camera: {type: 'buttons', buttons: [t('camera_output')], click: () => run('studio_render_export')},
                        _scene_shots: {type: 'buttons', buttons: [t('saved_cameras')], click: () => run('studio_render_camera_presets')},
                        _scene_add: {type: 'buttons', label: t('create'), buttons: [t('add_light'), t('add_volume')], click: index => run(index ? 'add_lightflow_volume' : 'add_light')},
                        _scene_helpers: {type: 'select', label: t('helpers'), description: t('helpers_hint'), value: helperPolicy, options: {contextual: t('helpers_contextual'), all: t('helpers_all'), clean: t('helpers_clean')}},
                        _scene_layout: {type: 'buttons', label: t('layout'), description: t('layout_description'), buttons: [t('layout_apply'), t('layout_restore')], click: index => index ? api.restoreLayout() : api.applyLayout()}
                    }
                });
                listeners.push(scene, scene.form.on('change', ({result, changed_keys}) => {
                    if (changed_keys?.includes('_scene_helpers')) api.setHelperPolicy(result._scene_helpers);
                }), addLightManagerDesignedPanelStyles('lightflow_scene'), Blockbench.addCSS(`
                    #panel_lightflow_scene .form { --max_label_width: 120px !important; }
                    #panel_lightflow_scene .dialog_bar[form_type="buttons"] { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px; padding: 6px 4px !important; }
                    #panel_lightflow_scene .dialog_bar[form_type="buttons"] > label { grid-column: 1; width: auto; }
                    #panel_lightflow_scene .dialog_bar[form_type="buttons"] > .dialog_form_description { grid-column: 2; grid-row: 1; }
                    #panel_lightflow_scene .dialog_form_buttons { grid-column: 1 / -1; grid-row: 2; }
                    #panel_lightflow_scene .name_space_left { width: auto; max-width: 45%; white-space: normal; }
                    #panel_lightflow_scene .dialog_bar[form_type="buttons"] .name_space_left { max-width: 100%; }
                    #panel_lightflow_scene .dialog_form_buttons { display: flex; flex-wrap: wrap; gap: 6px; }
                    #panel_lightflow_scene button { width: auto !important; min-width: 0 !important; height: auto !important; min-height: 30px; padding: 5px 8px; line-height: 1.3; white-space: normal; flex: 1 1 110px; margin: 0; }
                `));
                api.register(scene);
                if (helperPolicy === 'clean') api.setHelperPolicy('clean');
            },
            delete() {
                restoreCleanHelpers();
                listeners.forEach(listener => listener?.delete?.());
                registered.clear();
            }
        };
        ['update_selection', 'update_view', 'select_project', 'select_mode'].forEach(event => listeners.push(Blockbench.on(event, () => {
            if (helperPolicy !== 'clean' || !cleanSnapshot) return;
            if (Canvas.show_gizmos === true) {
                cleanSnapshot.show = true;
                api.setHelperPolicy('contextual');
            } else hideCleanHelpers();
        })));
        return api;
    }

    Plugin.register('light_manager', {
        title: 'Light Manager',
        icon: 'light_mode',
        author: 'MidFord327',
        description: 'Add production-ready point, spot, and directional lights to Blockbench with viewport gizmos, animation support, shadows, and Studio Render controls. Provides the Lightflow lighting foundation for Shader Architect and Studio Render.',
        tags: ['Lightflow', 'Lighting', 'Shadows'],
        version: '1.8.2',
        min_version: '4.9.0',
        variant: 'both',

        onload() {
            disposeLightManagerResources();
            disposeRetiredLightManagerLights();
            cleanupLightManagerRegistries();
            removeLightManagerLegacyStoredToolbarLayouts();
            restoreLightManagerRendererShadowSettings();
            restoreLightManagerAnimatorPreview();
            resetLightManagerShadowState();
            window.LightManagerMarkShadowsDirty = markLightManagerShadowsDirty;
            window.LightManagerFlushAnimatedLights = flushLightManagerAnimatedLights;
            patchLightManagerAnimatorPreview();
            deletables.push(Blockbench.on('display_animation_frame', event => {
                flushLightManagerAnimatedLights({ render: event?.in_loop !== true });
            }));
            const existingLifecycle = window.LightflowLifecycle;
            if (
                existingLifecycle?.apiVersion === 1 &&
                existingLifecycle.disposed === false &&
                typeof existingLifecycle.registerHydrator === 'function'
            ) {
                lightflowLifecycle = existingLifecycle;
                lightflowLifecycle.attachOwner?.();
            } else {
                existingLifecycle?.dispose?.();
                lightflowLifecycle = createLightflowLifecycleRuntime();
                window.LightflowLifecycle = lightflowLifecycle;
            }

            // Shared condition/disabled-state support for Light Manager custom FormElements.
            // `show_condition` is normalized to Blockbench's native form condition path. The
            // custom disabled path joins the same form.update pass instead of adding event listeners.
            const ensureLightManagerFormStateBridge = (form) => {
                if (form._lightManagerFormStateBridge) return form._lightManagerFormStateBridge;

                const updaters = new Map();
                const originalUpdate = form.update;
                const originalBuildForm = form.buildForm;

                form.update = function (formResult) {
                    const result = formResult === undefined ? this.getResult() : formResult;
                    const response = originalUpdate.call(this, result);
                    for (const updateElementState of updaters.values()) {
                        updateElementState({ result, cause: 'form_update' });
                    }
                    Object.values(this.form_data || {}).forEach(element => element.applyFilter?.());
                    return response;
                };
                form.buildForm = function (...args) {
                    const viewState = captureLightflowFormView(this);
                    updaters.clear();
                    const response = originalBuildForm.apply(this, args);
                    this.update();
                    restoreLightflowFormView(this, viewState);
                    return response;
                };

                form._lightManagerFormStateBridge = { updaters };
                return form._lightManagerFormStateBridge;
            };
            const setupLightManagerFormElementState = (element) => {
                const data = element.options || {};
                const bridge = ensureLightManagerFormStateBridge(element.form);

                if (data.show_condition !== undefined) {
                    data.condition = data.show_condition;
                    element.condition = data.show_condition;
                }

                const rawAccessibleLabel = data.title || data.description || data.label;
                if (rawAccessibleLabel && typeof rawAccessibleLabel !== 'function' && element.bar) {
                    const accessibleLabel = typeof tl === 'function' ? tl(rawAccessibleLabel) : String(rawAccessibleLabel);
                    if (!element.bar.title) element.bar.title = accessibleLabel;
                    if (!element.bar.getAttribute('aria-label')) element.bar.setAttribute('aria-label', accessibleLabel);
                }

                const hasDynamicDisable = data.disable_condition !== undefined && typeof data.disable_condition !== 'boolean';
                const hasStaticDisable = !!data.disable || data.disable_condition === true;
                element.is_disabled = false;
                if (!hasDynamicDisable && !hasStaticDisable) return;

                const roots = [...new Set([
                    element.node,
                    element.slider_node,
                    element.inputs_container,
                    element.toggle_btn,
                    element.reset_button,
                    element.colorpicker && element.colorpicker.node,
                    element.popup_panel
                ].filter(node => node && node.nodeType === 1))];
                const controls = [...new Set(roots.flatMap(root => {
                    const found = [...root.querySelectorAll('input, button, select, textarea, [contenteditable], .nslide')];
                    if (/^(INPUT|BUTTON|SELECT|TEXTAREA)$/.test(root.tagName) || root.hasAttribute('contenteditable') || root.classList.contains('nslide')) {
                        found.unshift(root);
                    }
                    return found;
                }))];
                const disabledIconColor = data.disable_icon_color || data.disabled_icon_color || data.disable_color;
                const icons = disabledIconColor ? [...new Set(roots.flatMap(root => {
                    const found = [...root.querySelectorAll('.material-icons, .fa, .fas, .far, .fab')];
                    if (root.classList.contains('material-icons') || root.classList.contains('fa')) found.unshift(root);
                    return found;
                }))] : [];
                const defaultFilter = ['combo_slider', 'compact_select', 'enum_select', 'horizontal_select', 'compact_text', 'panel_search', 'custom_checkbox', 'action_toggle', 'action_button', 'custom_vector', 'gradient_editor'].includes(data.type)
                    ? 'grayscale(100%)'
                    : 'none';
                const rootStyles = new Map(roots.map(root => [root, {
                    opacity: root.style.opacity,
                    filter: root.style.filter,
                    cursor: root.style.cursor,
                    pointerEvents: root.style.pointerEvents,
                    tabIndex: root.tabIndex
                }]));
                const controlStates = new Map(controls.map(control => [control, {
                    disabled: 'disabled' in control ? control.disabled : false,
                    contenteditable: control.getAttribute('contenteditable')
                }]));
                const rootTitles = new Map();
                const iconColors = new Map();
                let lastTooltip;

                const translateText = (text, result) => {
                    if (typeof text === 'function') text = text(result, element);
                    if (text === undefined || text === null) return '';
                    return typeof tl === 'function' ? tl(text) : String(text);
                };
                const evaluate = (condition, result, fallback) => {
                    try {
                        return !!Condition(condition, result);
                    } catch (error) {
                        warnLightManagerOnce('form-condition', '[Light Manager] A form condition failed; its fallback state will be used.', error);
                        return fallback;
                    }
                };
                const updateTooltip = (disabled, result) => {
                    const disableDesc = disabled ? translateText(data.disable_desc, result) : '';
                    if (data.show_disabled_reason && data.disable_desc && element.bar) {
                        if (!element.disabled_reason) {
                            element.disabled_reason = document.createElement('small');
                            element.disabled_reason.className = 'lightflow_disabled_reason';
                            element.bar.append(element.disabled_reason);
                        }
                        element.disabled_reason.textContent = disableDesc;
                        element.disabled_reason.hidden = !disableDesc;
                    }
                    const tooltip = disableDesc || translateText(data.description, result);
                    if (tooltip === lastTooltip) return;
                    element.bar.title = tooltip;
                    if (disabled && disableDesc) {
                        for (const root of roots) root.title = disableDesc;
                    }
                    lastTooltip = tooltip;
                };
                const applyDisabledState = (disabled, result) => {
                    disabled = !!disabled;
                    const previousDisabled = element.is_disabled;
                    if (disabled === previousDisabled) {
                        updateTooltip(disabled, result);
                        return;
                    }

                    const effectEnabled = data.disable_effect !== false;
                    const disabledOpacity = effectEnabled
                        ? (data.disable_opacity !== undefined ? String(data.disable_opacity) : '0.5')
                        : '1';
                    const disabledFilter = effectEnabled
                        ? (data.disable_filter !== undefined ? String(data.disable_filter) : defaultFilter)
                        : 'none';

                    if (disabled && element.closePopup && element._isOpen) {
                        element.closePopup({ type: 'mousedown', target: document.body });
                    }

                    for (const root of roots) {
                        const original = rootStyles.get(root);
                        root.setAttribute('aria-disabled', disabled ? 'true' : 'false');
                        root.classList.toggle('form_element_disabled', disabled);
                        if (disabled) {
                            rootTitles.set(root, root.title);
                            root.style.opacity = disabledOpacity;
                            root.style.filter = disabledFilter;
                            root.style.cursor = 'not-allowed';
                            root.style.pointerEvents = data.disable_pointer_events === false ? original.pointerEvents : 'none';
                            if (root.getAttribute('role') === 'button' && !('disabled' in root)) root.tabIndex = -1;
                        } else {
                            root.style.opacity = original.opacity;
                            root.style.filter = original.filter;
                            root.style.cursor = original.cursor;
                            root.style.pointerEvents = original.pointerEvents;
                            if (root.getAttribute('role') === 'button' && !('disabled' in root)) root.tabIndex = original.tabIndex;
                            if (rootTitles.has(root)) root.title = rootTitles.get(root);
                        }
                    }

                    for (const control of controls) {
                        const original = controlStates.get(control);
                        if ('disabled' in control) control.disabled = disabled || original.disabled;
                        if (control.hasAttribute('contenteditable')) {
                            control.setAttribute('contenteditable', disabled ? 'false' : (original.contenteditable || 'false'));
                        }
                        control.setAttribute('aria-disabled', disabled ? 'true' : 'false');
                    }

                    for (const icon of icons) {
                        if (disabled) {
                            iconColors.set(icon, icon.style.color || '');
                            icon.style.color = disabledIconColor;
                        } else if (iconColors.has(icon)) {
                            icon.style.color = iconColors.get(icon);
                        }
                    }

                    if (element.colorpicker && element.colorpicker.jq && typeof element.colorpicker.jq.spectrum === 'function') {
                        try {
                            element.colorpicker.jq.spectrum(disabled ? 'disable' : 'enable');
                        } catch (error) {
                            warnLightManagerOnce('spectrum-state', '[Light Manager] Spectrum state sync failed; native input state remains active.', error);
                        }
                    }

                    element.is_disabled = disabled;
                    if (!disabled && previousDisabled && typeof element.updateVisuals === 'function') {
                        element.updateVisuals(false);
                    }
                    updateTooltip(disabled, result);
                };
                const updateState = (event) => {
                    const result = event && event.result !== undefined ? event.result : element.form.getResult();
                    const conditionalDisable = hasDynamicDisable
                        ? evaluate(data.disable_condition, result, true)
                        : false;
                    applyDisabledState(hasStaticDisable || conditionalDisable, result);
                };

                element.applyDisabledState = (disabled) => applyDisabledState(disabled, element.form.getResult());
                element._lightManagerFormStateUpdate = updateState;
                if (hasDynamicDisable) {
                    bridge.updaters.set(element.id, updateState);
                } else {
                    updateState();
                }
            };

            class ComboSlider extends Widget {
                constructor(id, data) {
                    if (typeof id === 'object') {
                        data = id;
                        id = data.id;
                    }
                    super(id, data);
                    const scope = this;

                    this.type = 'combo_slider';
                    this.icon = 'fa-sliders-h';
                    this.value = data.value !== undefined ? data.value : 0;

                    // Tracks active range dragging so the reset button cannot steal focus.
                    this.isDragging = false;

                    this.settings = {
                        min: data.min !== undefined ? data.min : 0,
                        max: data.max !== undefined ? data.max : 10,
                        step: data.step !== undefined ? data.step : 1,
                        circular: data.circular,
                        allow_lower: !!data.allow_lower,
                        allow_higher: !!data.allow_higher,
                        resettable: !!data.resettable || data.reset_value !== undefined,
                        reset_value: data.reset_value !== undefined ? data.reset_value : (data.value !== undefined ? data.value : 0)
                    };

                    // Range slider input.
                    let rangeInput = Interface.createElement('input', {
                        type: 'range',
                        value: this.value,
                        min: this.settings.min,
                        max: this.settings.max,
                        step: this.settings.step,
                        class: 'tool disp_range',
                        style: `margin: 0;flex: 1 1 auto;width: 100%;min-width: 30px;transition: opacity 0.2s, filter 0.2s;${data.color ? '--color-thumb: ' + data.color + ';' : ''}`
                    });

                    let numberInputOptions = {
                        type: 'number',
                        value: this.value,
                        step: this.settings.step,
                        class: 'dark_bordered focusable_input',
                        style: `width: 100%;min-width: 45px;height: 24px;box-sizing: border-box;text-align: center;margin: 0;padding: 0 2px;flex: 0 0 auto;`
                    };

                    if (!this.settings.allow_lower) numberInputOptions.min = this.settings.min;
                    if (!this.settings.allow_higher) numberInputOptions.max = this.settings.max;

                    let numberInput = Interface.createElement('input', numberInputOptions);
                    const accessibleName = data.label
                        ? (typeof tl !== 'undefined' ? tl(data.label) : data.label)
                        : (data.description ? (typeof tl !== 'undefined' ? tl(data.description) : data.description) : 'Value');
                    rangeInput.setAttribute('aria-label', accessibleName);
                    numberInput.setAttribute('aria-label', `${accessibleName} value`);
                    this.rangeInput = rangeInput;
                    this.numberInput = numberInput;

                    let numberContainer = Interface.createElement('div', {
                        class: 'numeric_input tool disp_text',
                        style: `display: flex;align-items: center;margin: 0;flex: 0 0 auto; `
                    }, [numberInput]);

                    let comboWrapper = Interface.createElement('div', {
                        class: 'bar slider_input_combo',
                        title: data.description ? (typeof tl !== 'undefined' ? tl(data.description) : data.description) : (data.title ? (typeof tl !== 'undefined' ? tl(data.title) : data.title) : ''),
                        style: `display: flex;align-items: center;height: 100%;margin: 0 5px;flex: 1 1 auto;min-width: 0;width: auto; `
                    }, [rangeInput, numberContainer]);

                    // Build the final widget structure.
                    let containerChildren = [];

                    // Optional icon.
                    if (data.icon) {
                        let isFa = data.icon.startsWith('fa-') || data.icon.startsWith('fas ') || data.icon.startsWith('fab ');
                        let iconElement = Interface.createElement('i', {
                            class: isFa ? `fa ${data.icon}` : 'material-icons',
                            style: 'margin-right: 4px; font-size: 18px; color: var(--color-text); display: flex; align-items: center;'
                        }, isFa ? '' : data.icon);
                        containerChildren.push(iconElement);
                    }

                    // Optional label.
                    if (data.label) {
                        let labelElement = Interface.createElement('span', {
                            style: 'margin-right: 5px; font-size: 13px; color: var(--color-subtle_text); white-space: nowrap; display: flex; align-items: center;'
                        }, typeof tl !== 'undefined' ? tl(data.label) : data.label);
                        containerChildren.push(labelElement);

                        // Add a help icon for the description.
                        if (data.description) {
                            let infoIcon = Interface.createElement('i', {
                                class: 'fa fa-question dialog_form_description',
                                title: typeof tl !== 'undefined' ? tl(data.description) : data.description,
                                style: 'font-size: 14px; cursor: help; margin-right: 5px; color: var(--color-subtle_text); display: flex; align-items: center;'
                            });
                            containerChildren.push(infoIcon);
                            comboWrapper.title = '';
                        }
                    }

                    containerChildren.push(comboWrapper);

                    // Optional reset button.
                    if (this.settings.resettable) {
                        this.resetBtn = Interface.createElement('i', {
                            class: 'material-icons icon',
                            title: translateLightManager('light_manager.generic.reset_value'),
                            style: `font-size: 18px;cursor: pointer;display: none;margin-left: 2px;color: var(--color-subtle_text);display: flex;align-items: center;`
                        }, 'replay');

                        this.resetBtn.onclick = (e) => {
                            if (typeof this.onBefore === 'function') this.onBefore(e);
                            this.change(this.settings.reset_value, e);
                            if (typeof this.onAfter === 'function') this.onAfter(e);
                        };

                        containerChildren.push(this.resetBtn);
                    }

                    // Dynamic toolbar sizing.
                    let rootStyles = `display: flex;flex-direction: row;align-items: center;height: 30px;padding: 0 4px;min-width: 0;`;

                    if (data.grow) {
                        rootStyles += `flex: 1 1 auto;width: auto;min-width: ${data.min_width ? data.min_width + 'px' : '160px'};`;
                    } else {
                        rootStyles += `flex: 0 0 auto;width: ${data.width ? data.width + 'px' : '160px'};min-width: ${data.width ? data.width + 'px' : '160px'};`;
                    }

                    this.node = Interface.createElement('div', {
                        class: 'tool widget',
                        toolbar_item: this.id,
                        style: rootStyles
                    }, containerChildren);

                    // Assign callbacks.
                    if (typeof data.onChange === 'function') {
                        this.onChange = data.onChange;
                    }
                    if (typeof data.onBefore === 'function') {
                        this.onBefore = data.onBefore;
                    }
                    if (typeof data.onAfter === 'function') {
                        this.onAfter = data.onAfter;
                    }
                    this.onDrag = typeof data.onDrag === 'function'
                        ? data.onDrag
                        : (typeof data.onMove === 'function' ? data.onMove : null);

                    // Keep both inputs synchronized.
                    let $inputs = $(this.node).find('input');
                    let $range = $(this.node).find('input[type="range"]');
                    let $number = $(this.node).find('input[type="number"]');

                    $inputs.on('input', function (event) {
                        let val = parseFloat($(event.target).val());
                        if (isNaN(val)) return;
                        const isNumberInput = event.target === $number[0];
                        scope.change(val, event.originalEvent, isNumberInput);
                        if (scope.onDrag && (scope.isDragging || event.target === $range[0])) {
                            scope.onDrag(val, event.originalEvent, isNumberInput);
                        }
                    });

                    $number.on('blur', function (event) {
                        let val = parseFloat($(this).val());
                        if (isNaN(val)) {
                            val = scope.settings.reset_value;
                        }
                        scope.change(val, event.originalEvent, false);
                    });

                    $number.on('keydown', function (event) {
                        if (event.key === 'Enter' || event.key === 'Escape') {
                            this.blur();
                        }
                    });

                    // Track dragging state.
                    $range.on('mousedown touchstart', function (event) {
                        scope.isDragging = true;
                        if (scope.onBefore) scope.onBefore(event.originalEvent);
                    });

                    // Finish dragging and refresh reset button visibility.
                    $range.on('mouseup touchend', function (event) {
                        scope.isDragging = false;
                        scope.updateResetButton();
                    });

                    $number.on('focus', function (event) {
                        if (scope.onBefore) scope.onBefore(event.originalEvent);
                    });

                    $inputs.on('change', function (event) {
                        scope.isDragging = false;
                        scope.updateResetButton();
                        if (scope.onAfter) scope.onAfter(event.originalEvent);
                    });

                    // Keyboard shortcuts.
                    this.addSubKeybind('increase', 'keybindings.item.num_slider.increase', data.sub_keybinds?.increase, (event) => {
                        if (!Condition(this.condition)) return false;
                        if (typeof this.onBefore === 'function') this.onBefore(event);
                        let value = this.get() + this.settings.step;
                        if (this.settings.circular && value > this.settings.max) value = this.settings.min;
                        this.change(value, event);
                        if (typeof this.onAfter === 'function') this.onAfter(event);
                    });

                    this.addSubKeybind('decrease', 'keybindings.item.num_slider.decrease', data.sub_keybinds?.decrease, (event) => {
                        if (!Condition(this.condition)) return false;
                        if (typeof this.onBefore === 'function') this.onBefore(event);
                        let value = this.get() - this.settings.step;
                        if (this.settings.circular && value < this.settings.min) value = this.settings.max;
                        this.change(value, event);
                        if (typeof this.onAfter === 'function') this.onAfter(event);
                    });

                    this.set(this.value);
                }

                // Updates reset button visibility.
                updateResetButton() {
                    if (!this.settings.resettable || !this.resetBtn) return;

                    // Do not change visibility while dragging; it can steal pointer capture.
                    if (this.isDragging) return;

                    if (parseFloat(this.value) !== parseFloat(this.settings.reset_value)) {
                        this.resetBtn.style.display = 'flex';
                    } else {
                        this.resetBtn.style.display = 'none';
                    }
                }

                setResetValue(value, refreshButton = true) {
                    this.settings.reset_value = value;
                    if (refreshButton) {
                        this.updateResetButton();
                    }
                    return this;
                }

                setColor(color) {
                    const normalizedColor = color || '';
                    if (this.rangeInput) {
                        this.rangeInput.style.setProperty('--color-thumb', normalizedColor);
                        this.rangeInput.style.accentColor = normalizedColor;
                        this.rangeInput.style.color = normalizedColor;
                    }
                    if (this.resetBtn) {
                        this.resetBtn.style.color = normalizedColor || 'var(--color-subtle_text)';
                    }
                    return this;
                }

                change(value, event, skip_number_input_update = false) {
                    if (!this.settings.allow_lower && value < this.settings.min) {
                        value = this.settings.min;
                    }
                    if (!this.settings.allow_higher && value > this.settings.max) {
                        value = this.settings.max;
                    }

                    this.set(value, skip_number_input_update);
                    if (this.onChange) {
                        this.onChange(event);
                    }
                    this.dispatchEvent('change', { value: this.value });
                }

                set(value, skip_number_input_update = false) {
                    this.value = value;
                    let $range = $(this.node).find('input[type="range"]');
                    let $number = $(this.node).find('input[type="number"]');

                    $range.val(value);
                    if (!skip_number_input_update) {
                        $number.val(value);
                    }

                    // Visual out-of-range state.
                    let isOutOfBounds = false;

                    if (this.settings.allow_lower && value < this.settings.min) isOutOfBounds = true;
                    if (this.settings.allow_higher && value > this.settings.max) isOutOfBounds = true;

                    if (isOutOfBounds) {
                        $range.css({
                            'opacity': '0.3',
                            'filter': 'grayscale(100%)'
                        });
                    } else {
                        $range.css({
                            'opacity': '1',
                            'filter': 'none'
                        });
                    }

                    // This internally no-ops while dragging.
                    this.updateResetButton();
                }

                get() {
                    return this.value;
                }
            }

            window.ComboSlider = ComboSlider;

            class CompactDropdownSelect extends Widget {
                constructor(id, data) {
                    super(id, data);
                    this.type = 'select';
                    this.value = data.value;
                    this.values = [];
                    this.options = data.options || {};
                    this.onChange = data.onChange;
                    this.description = data.description || data.title || '';

                    // Collect available option keys.
                    for (let key in this.options) {
                        if (!this.value) this.value = key;
                        this.values.push(key);
                    }

                    // Main DOM node.
                    this.node = document.createElement('div');
                    this.node.className = 'tool widget compact_dropdown_select';
                    this.node.setAttribute('toolbar_item', this.id);

                    // Main icon container.
                    this.icon_wrapper = document.createElement('div');
                    this.icon_wrapper.className = 'main_icon_wrapper';

                    // Native-style dropdown arrow.
                    this.arrow_node = document.createElement('i');
                    this.arrow_node.className = 'fas fa-caret-down dropdown_arrow';

                    this.node.append(this.icon_wrapper, this.arrow_node);

                    this.node.addEventListener('click', (event) => {
                        this.open(event);
                    });

                    // Mouse wheel support for quick option switching.
                    $(this.node).on('wheel', event => {
                        let e = event.originalEvent;
                        let index = this.values.indexOf(this.value);
                        index += e.deltaY < 0 ? -1 : 1;
                        if (index < 0) index = this.values.length - 1;
                        if (index >= this.values.length) index = 0;
                        this.change(this.values[index], e);
                    });

                    this.nodes.push(this.node);
                    this.set(this.value);
                }

                // Opens the native Blockbench menu with this widget's options.
                open(event) {
                    if (Menu.closed_in_this_click == this.id) return this;
                    let scope = this;
                    let items = [];

                    for (let key in this.options) {
                        let opt = this.options[key];
                        if (opt) {
                            items.push({
                                name: opt.name || key,
                                icon: opt.icon,
                                color: opt.color,
                                condition: opt.condition,
                                click: (e) => {
                                    scope.change(key, e);
                                }
                            });
                        }
                    }

                    // Pass a single base class to the Menu constructor.
                    let menu = new Menu(this.id, items, { class: 'select_menu' });

                    // Add the custom menu class safely through classList.
                    if (menu.node) {
                        menu.node.classList.add('compact_dropdown_menu');
                        // Match the menu width to the button.
                        menu.node.style['min-width'] = this.node.clientWidth + 'px';
                    }

                    menu.open(this.node, this);
                }

                // Changes the value and dispatches widget events.
                change(value, event) {
                    this.set(value);
                    if (this.onChange) {
                        this.onChange(this, event);
                    }
                    this.dispatchEvent('change', { value, event });
                    return this;
                }

                // Updates the DOM to show the selected option icon.
                set(key) {
                    if (!this.options[key]) return this;
                    this.value = key;
                    let opt = this.options[key];

                    // Include the widget name, current option, and description when available.
                    let baseName = this.name ? this.name + ': ' : '';
                    let optName = opt.name || key;
                    let desc = this.description ? '\n' + (typeof tl !== 'undefined' ? tl(this.description) : this.description) : '';
                    this.node.title = `${baseName}${optName}${desc}`;

                    // Replace the visible icon in every widget instance.
                    this.nodes.forEach(n => {
                        let wrapper = n.querySelector('.main_icon_wrapper');
                        if (wrapper) {
                            wrapper.innerHTML = '';

                            let iconElement = Blockbench.getIconNode(opt.icon || 'help');

                            // Apply custom color to the main icon.
                            if (opt.color) {
                                iconElement.style.color = opt.color;
                            }

                            wrapper.append(iconElement);
                        }
                    });

                    return this;
                }

                setOptions(options) {
                    this.options = options || {};
                    this.values = [];

                    // Collect the new option keys.
                    for (let key in this.options) {
                        this.values.push(key);
                    }

                    // Fallback to the first option when the current value no longer exists.
                    if (!this.options[this.value] && this.values.length > 0) {
                        this.value = this.values[0];
                    }

                    // Refresh the displayed value.
                    this.set(this.value);
                    return this;
                }

                update() {
                    this.set(this.value);
                    if (this.onUpdate) {
                        this.onUpdate(this);
                    }
                    return this;
                }

                get() {
                    return this.value;
                }
            }

            window.CompactDropdownSelect = CompactDropdownSelect;

            class BarDisplay extends Widget {
                constructor(id, data) {
                    // Standard Blockbench constructor handling.
                    if (typeof id == 'object') {
                        data = id;
                        id = data.id;
                    }
                    super(id, data);
                    this.type = 'bar_display';

                    // Display state.
                    this.text = data.text || '';
                    this.label = data.label || '';
                    this.color = data.color || '';
                    this.icon_name = data.icon || '';
                    this.is_paragraph = !!data.paragraph;
                    this.expand = !!data.expand;
                    this.text_alignment = data.text_alignment || 'left';
                    this.onUpdate = data.onUpdate;
                    this.description = data.description || data.title || '';

                    // DOM node.
                    this.node = document.createElement('div');
                    this.node.className = `tool widget bar_display ${this.is_paragraph ? 'bar_display_paragraph' : ''}`;
                    this.node.setAttribute('toolbar_item', this.id);

                    // Visual-only toolbar item.
                    this.node.style.display = 'flex';
                    this.node.style.alignItems = this.is_paragraph ? 'flex-start' : 'center';
                    this.node.style.gap = '6px';
                    this.node.style.padding = '0 8px';
                    this.node.style.cursor = 'default';
                    if (this.expand) {
                        this.node.style.flex = '1 1 0';
                        this.node.style.minWidth = '0';
                        this.node.style.width = 'auto';
                    }
                    if (this.color) this.node.style.color = this.color;

                    // Initialize node tracking.
                    this.nodes = [this.node];
                    this.buildDOM();

                    // Apply initial state.
                    this.update();
                }

                /**
                 * Builds or rebuilds internal DOM nodes.
                 */
                buildDOM() {
                    this.node.innerHTML = '';

                    // Optional icon.
                    if (this.icon_name) {
                        const iconNode = Blockbench.getIconNode(this.icon_name);
                        iconNode.style.fontSize = '1.1em';
                        this.node.append(iconNode);
                    }

                    // Optional label.
                    if (this.label) {
                        const labelNode = document.createElement('span');
                        labelNode.className = 'bar_display_label';
                        labelNode.style.fontWeight = 'bold';
                        labelNode.style.opacity = '0.85';
                        labelNode.innerText = this.label;
                        this.node.append(labelNode);
                    }

                    // Text container.
                    const textNode = document.createElement('span');
                    textNode.className = 'bar_display_content';
                    if (this.expand) {
                        textNode.style.flex = '1 1 0';
                        textNode.style.minWidth = '0';
                    }
                    textNode.style.textAlign = this.text_alignment;
                    if (this.is_paragraph) {
                        textNode.style.whiteSpace = 'pre-wrap';
                        textNode.style.lineHeight = '1.4';
                        textNode.style.maxWidth = '250px';
                    }
                    textNode.textContent = String(this.text ?? '');
                    this.node.append(textNode);
                }

                /**
                 * Updates the main text.
                 */
                set(text) {
                    this.text = text;
                    this.nodes.forEach(node => {
                        let content = node.querySelector('.bar_display_content');
                        if (content) content.textContent = String(text ?? '');
                    });
                    return this;
                }

                /**
                 * Updates the label.
                 */
                setLabel(label) {
                    this.label = label;
                    this.buildDOM();
                    return this;
                }

                /**
                 * Updates the description tooltip.
                 */
                setDescription(desc) {
                    this.description = desc;
                    this.buildDOM();
                    return this;
                }

                /**
                 * Updates the icon dynamically.
                 */
                setIcon(icon) {
                    this.icon_name = icon;
                    this.buildDOM();
                    return this;
                }

                /**
                 * Changes text and icon color.
                 */
                setColor(color) {
                    this.color = color;
                    this.nodes.forEach(node => {
                        node.style.color = color;
                    });
                    return this;
                }

                /**
                 * Called by Blockbench or manually to refresh the widget.
                 */
                update() {
                    // Evaluate the native Blockbench display condition.
                    const conditionMet = Condition(this.condition);
                    this.nodes.forEach(node => {
                        // Keep flex display so the toolbar layout remains stable.
                        node.style.display = conditionMet ? 'flex' : 'none';
                    });

                    // Run the optional custom update callback.
                    if (typeof this.onUpdate === 'function') {
                        this.onUpdate(this);
                    }

                    this.dispatchEvent('update', {});
                    return this;
                }
            }

            window.BarDisplay = BarDisplay;

            class TextInputWidget extends Widget {
                constructor(id, data) {
                    // Handle standard Blockbench constructor pattern
                    if (typeof id === 'object') {
                        data = id;
                        id = data.id;
                    }
                    super(id, data);

                    // Define widget properties
                    this.type = 'text_input';
                    this.value = data.default_text || '';
                    this.placeholder = data.placeholder || '';
                    this.icon_name = data.icon || '';
                    this.expand = data.expand || false;
                    this.width = typeof data.width === 'number' ? data.width + 'px' : (data.width || '120px');
                    this.description = data.description || data.title || '';

                    // Callbacks
                    this.onEdit = data.onEdit;
                    this.onFinishEdit = data.onFinishEdit;

                    // Outer Container Node
                    this.node = document.createElement('div');
                    this.node.className = 'tool wide widget text_input_widget';
                    this.node.setAttribute('toolbar_item', this.id);

                    if (this.description) {
                        this.node.title = typeof tl !== 'undefined' ? tl(this.description) : this.description;
                    }

                    // Styling the container to blend with Blockbench toolbars
                    this.node.style.display = 'flex';
                    this.node.style.alignItems = 'center';
                    this.node.style.width = this.expand ? 'auto' : this.width + 'px';
                    this.node.style.background = 'var(--color-back)';
                    this.node.style.border = '1px solid var(--color-border)';
                    this.node.style.borderRadius = '2px';
                    this.node.style.padding = '0 4px';
                    this.node.style.boxSizing = 'border-box';

                    if (this.expand) {
                        this.node.style.flex = '1 1 0';
                        this.node.style.minWidth = '0';
                    }

                    if (this.color) {
                        this.node.style.borderColor = this.color;
                    }

                    // Build internal DOM
                    this.buildDOM();

                    // jQuery wrapper for robust event handling (matches Blockbench native style)
                    this.jq_input = $(this.input_node);
                    this.bindEvents();

                    // Initial condition check
                    this.update();
                }

                /**
                 * Constructs the internal DOM elements (Icon and Input field)
                 */
                buildDOM() {
                    this.node.innerHTML = ''; // Clear previous

                    // Add the optional leading icon.
                    if (this.icon_name) {
                        const iconNode = Blockbench.getIconNode(this.icon_name);
                        iconNode.style.fontSize = '1em';
                        iconNode.style.marginRight = '4px';
                        iconNode.style.color = this.color || 'var(--color-text)';
                        this.node.append(iconNode);
                    }

                    // Add the standard input element.
                    this.input_node = document.createElement('input');
                    this.input_node.type = 'text';
                    this.input_node.value = this.value;
                    this.input_node.placeholder = this.placeholder;

                    // Style the input to remove default web styling and fit Blockbench
                    this.input_node.style.flex = '1';
                    this.input_node.style.width = '100%';
                    this.input_node.style.minWidth = '10px'; // Prevent collapsing
                    this.input_node.style.background = 'transparent';
                    this.input_node.style.border = 'none';
                    this.input_node.style.color = 'var(--color-text)';
                    this.input_node.style.outline = 'none';

                    this.node.append(this.input_node);
                }

                /**
                 * Binds all necessary events for the input field
                 */
                bindEvents() {
                    const scope = this;

                    this.jq_input
                        // Triggered every time a character is typed or deleted
                        .on('input', function (e) {
                            scope.value = this.value;

                            if (typeof scope.onEdit === 'function') {
                                scope.onEdit(scope.value, e);
                            }
                            scope.dispatchEvent('edit', { value: scope.value });
                        })
                        // Handle specific keys and prevent Blockbench hotkeys from firing
                        .on('keydown', function (e) {
                            // Prevent Blockbench global keybinds (like Delete removing a cube) while typing
                            e.stopPropagation();

                            if (e.key === 'Enter') {
                                e.preventDefault();
                                this.blur(); // Triggers focusout
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                this.blur();
                            }
                        })
                        // Triggered when clicking outside or hitting Enter
                        .on('focusout', function (e) {
                            if (typeof scope.onFinishEdit === 'function') {
                                scope.onFinishEdit(scope.value, e);
                            }
                            scope.dispatchEvent('finish_edit', { value: scope.value });
                        })
                        // Allow easy selection of text
                        .on('dblclick', function () {
                            this.select();
                        });
                }

                /**
                 * Get the current text value
                 * @returns {string}
                 */
                get() {
                    return this.value;
                }

                /**
                 * Set the text value programmatically
                 * @param {string} text
                 */
                set(text) {
                    this.value = text;
                    if (this.input_node) {
                        this.input_node.value = text;
                    }
                    return this;
                }

                /**
                 * Change the placeholder dynamically
                 * @param {string} text
                 */
                setPlaceholder(text) {
                    this.placeholder = text;
                    if (this.input_node) {
                        this.input_node.placeholder = text;
                    }
                    return this;
                }

                /**
                 * Adjust the width of the widget
                 * @param {number} width
                 */
                setWidth(width) {
                    this.width = width;
                    this.node.style.width = width + 'px';
                    return this;
                }

                /**
                 * Standard update method called by Blockbench
                 */
                update() {
                    // Evaluate the native Blockbench condition to show/hide
                    const conditionMet = Condition(this.condition);
                    this.node.style.display = conditionMet ? 'flex' : 'none';

                    // Keep input synchronized if value was modified externally
                    if (this.input_node.value !== this.value) {
                        this.input_node.value = this.value;
                    }

                    this.dispatchEvent('update', {});
                    return this;
                }
            }

            window.TextInputWidget = TextInputWidget;


            // Compact CSS tuned for Spectrum's fixed width.
            const advancedColorPickerStyles = Blockbench.addCSS(`
    .advanced_color_ui {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        background: var(--color-back);
        border-top: 1px solid var(--color-border);
        border-bottom: 1px solid var(--color-border);
        margin-bottom: 4px;
    }
    .ac_mode_btn {
        flex: 0 0 auto;
        width: 36px;
        height: 24px;
        background: var(--color-button);
        border: 1px solid var(--color-border);
        color: var(--color-text);
        border-radius: 2px;
        font-size: 10px;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        transition: background 0.1s;
    }
    .ac_mode_btn:hover {
        background: var(--color-accent);
        color: var(--color-light);
        border-color: var(--color-accent);
    }
    .ac_screen_picker_btn {
        width: 22px;
        height: 22px;
        margin: 0 5px 0 0;
        padding: 2px;
        color: var(--color-text);
        text-decoration: none;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        vertical-align: middle;
        box-sizing: border-box;
    }
    .ac_screen_picker_btn:hover,
    .ac_screen_picker_btn:focus-visible {
        color: var(--color-light);
        outline: none;
    }
    .ac_screen_picker_btn.disabled {
        opacity: 0.5;
        cursor: wait;
        pointer-events: none;
    }
    .ac_screen_picker_btn .material-icons {
        font-size: 17px;
    }
    .ac_inputs {
        display: flex;
        flex: 1 1 auto;
        gap: 4px;
        min-width: 0;
    }
    /* Restyle inputs so four values fit in one row. */
    .ac_inputs input {
        flex: 1 1 0;
        width: 100%;
        min-width: 10px;
        height: 24px;
        text-align: center;
        padding: 0;
        font-size: 12px;
        box-sizing: border-box;
    }
    /* Hide native number input steppers. */
    .ac_inputs input[type=number]::-webkit-inner-spin-button,
    .ac_inputs input[type=number]::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }
    /* Hide Spectrum's native text input container. */
    .sp-picker-container .sp-input-container {
        display: none !important;
    }
`);
            deletables.push(advancedColorPickerStyles);


            // MARK: Advanced color picker widget
            class AdvancedColorPicker extends Widget {
                constructor(id, data) {
                    if (typeof id === 'object') {
                        data = id;
                        id = data.id;
                    }
                    super(id, data);
                    const scope = this;

                    this.type = 'advanced_color_picker';
                    this.icon = data.icon || 'color_lens';
                    this.value = tinycolor(data.value || '#ffffff');
                    this.hasAlpha = data.alpha !== undefined ? data.alpha : true;

                    this.onChange = data.onChange;
                    this.onMove = data.onMove;
                    this.onBefore = data.onBefore;
                    this.onAfter = data.onAfter;

                    this.node = Interface.createElement('div', { class: 'tool widget', toolbar_item: this.id }, [
                        Interface.createElement('input', { class: 'f_left', type: 'text' })
                    ]);

                    this.addLabel();
                    this.jq = $(this.node).find('input');

                    this.jq.spectrum({
                        preferredFormat: "hex",
                        color: this.value.toHex8String(),
                        showAlpha: this.hasAlpha,
                        showInput: true,
                        maxSelectionSize: 128,
                        // Match the native picker: hidden by default.
                        showPalette: data.palette === true,
                        palette: data.palette ? [] : undefined,
                        resetText: tl('generic.reset'),
                        cancelText: tl('dialog.cancel'),
                        chooseText: tl('dialog.confirm'),

                        show: function () {
                            if (typeof scope.onBefore === 'function') scope.onBefore();
                            open_interface = scope;
                            scope.injectAdvancedUI();
                        },
                        hide: function () {
                            open_interface = false;
                            if (typeof scope.onAfter === 'function') scope.onAfter();
                        },
                        change: function (c) {
                            scope.change(c);
                        },
                        move: function (c) {
                            scope.handleMove(c, false);
                        }
                    });

                }

                injectAdvancedUI() {
                    let spContainer = this.jq.spectrum("container");
                    let pickerContainer = spContainer.find(".sp-picker-container");

                    if (pickerContainer.find(".advanced_color_ui").length > 0) {
                        this.updateAdvancedUI(this.value);
                        return;
                    }

                    const scope = this;
                    this.formats = ['HEX', 'RGB', 'HSL', 'HSV'];
                    this.currentFormatIndex = 0;

                    // Base UI.
                    this.ui_wrapper = $('<div class="advanced_color_ui"></div>');

                    // Cyclic mode button.
                    this.modeBtn = $('<div class="ac_mode_btn" title="Change Format">HEX</div>');

                    // Input container.
                    this.inputsContainer = $('<div class="ac_inputs"></div>');

                    this.ui_wrapper.append(this.modeBtn).append(this.inputsContainer);

                    if (this.canPickScreenColor()) {
                        const screenPickerLabel = tl('action.pick_screen_color');
                        this.screenPickerBtn = $('<a href="#" class="ac_screen_picker_btn"></a>');
                        this.screenPickerBtn.attr({
                            title: screenPickerLabel,
                            'aria-label': screenPickerLabel
                        });
                        this.screenPickerBtn.append(Blockbench.getIconNode('colorize'));
                        this.screenPickerBtn.on('click', event => {
                            event.preventDefault();
                            event.stopPropagation();
                            scope.pickScreenColor();
                        });
                        const resetButton = pickerContainer.find('.sp-button-container .sp-reset');
                        if (resetButton.length) {
                            this.screenPickerBtn.insertAfter(resetButton);
                        } else {
                            pickerContainer.find('.sp-button-container').prepend(this.screenPickerBtn);
                        }
                    }

                    this.inputs = {};

                    this.buildInputLayout = (format) => {
                        this.inputsContainer.empty();
                        this.inputs = {};

                        // Helper for native-styled inputs.
                        const createInput = (id, placeholder, type = "number") => {
                            let inp = $(`<input type="${type}" class="dark_bordered focusable_input" placeholder="${placeholder}" title="${placeholder}" ${type === 'number' ? 'step="any"' : ''}>`);

                            inp.on('input', () => scope.handleCustomInput());
                            inp.on('keydown', (e) => e.stopPropagation());

                            this.inputs[id] = inp;
                            this.inputsContainer.append(inp);
                        };

                        if (format === 'HEX') {
                            createInput('hex', '#HEX', 'text');
                        } else if (format === 'RGB') {
                            createInput('r', 'R'); createInput('g', 'G'); createInput('b', 'B'); createInput('a', 'A');
                        } else if (format === 'HSL') {
                            createInput('h', 'H'); createInput('s', 'S%'); createInput('l', 'L%'); createInput('a', 'A');
                        } else if (format === 'HSV') {
                            createInput('h', 'H'); createInput('s', 'S%'); createInput('v', 'V%'); createInput('a', 'A');
                        }
                        this.updateAdvancedUI(this.value);
                    };

                    // Cycle the editing format when the mode button is clicked.
                    this.modeBtn.on('click', () => {
                        this.currentFormatIndex = (this.currentFormatIndex + 1) % this.formats.length;
                        let newFormat = this.formats[this.currentFormatIndex];
                        this.modeBtn.text(newFormat);
                        this.buildInputLayout(newFormat);
                    });

                    // Initial setup.
                    this.buildInputLayout(this.formats[this.currentFormatIndex]);

                    // Inject into the popup.
                    pickerContainer.find(".sp-input-container").after(this.ui_wrapper);
                }

                canPickScreenColor() {
                    if (Blockbench.platform === 'linux' || typeof EyeDropper !== 'function') return false;
                    if (Blockbench.platform === 'win32') {
                        return !!globalThis.BarItems?.pick_screen_color;
                    }
                    return true;
                }

                setScreenPickerBusy(busy) {
                    if (!this.screenPickerBtn) return;
                    this.screenPickerBtn.toggleClass('disabled', !!busy);
                    this.screenPickerBtn.attr({
                        'aria-busy': busy ? 'true' : 'false',
                        'aria-disabled': busy ? 'true' : 'false'
                    });
                }

                applyScreenColor(color) {
                    const sampledColor = tinycolor(color);
                    if (!sampledColor.isValid()) return false;
                    if (this.hasAlpha) {
                        sampledColor.setAlpha(this.value.getAlpha());
                    }

                    if (sampledColor.toHex8String() === this.value.toHex8String()) {
                        this.set(sampledColor);
                        return false;
                    }

                    if (typeof this.onBefore === 'function') this.onBefore();
                    try {
                        this.set(sampledColor);
                        this.change(sampledColor);
                    } finally {
                        if (typeof this.onAfter === 'function') this.onAfter();
                    }
                    return true;
                }

                async pickScreenColor() {
                    if (!this.canPickScreenColor() || this.screenPickerPending) return;
                    this.screenPickerPending = true;
                    this.setScreenPickerBusy(true);

                    const finish = color => {
                        this.screenPickerPending = false;
                        this.setScreenPickerBusy(false);
                        if (color) this.applyScreenColor(color);
                    };

                    if (Blockbench.platform !== 'win32') {
                        try {
                            const dropper = new EyeDropper();
                            const result = await dropper.open();
                            finish(result?.sRGBHex);
                        } catch (error) {
                            finish();
                            if (error?.name !== 'AbortError') {
                                console.warn('[Light Manager] Failed to pick a screen color.', error);
                            }
                        }
                        return;
                    }

                    const colorPanel = globalThis.ColorPanel;
                    const nativeAction = globalThis.BarItems?.pick_screen_color;
                    if (!colorPanel || typeof colorPanel.set !== 'function' || !nativeAction) {
                        finish();
                        return;
                    }

                    const originalSet = colorPanel.set;
                    let timeout = null;
                    let releaseCapture = null;
                    let settled = false;
                    // Windows returns through the paint ColorPanel. Capture that one result so
                    // the native picker updates this widget without replacing the paint color.
                    const wrappedSet = function lightManagerScreenColorResult(color, secondary, noSync) {
                        if (!secondary) {
                            settled = true;
                            releaseCapture?.();
                            finish(color);
                            return;
                        }
                        return originalSet.call(this, color, secondary, noSync);
                    };
                    releaseCapture = trackDocumentInteraction(() => {
                        if (timeout !== null) clearTimeout(timeout);
                        if (colorPanel.set === wrappedSet) colorPanel.set = originalSet;
                        if (!settled && this.screenPickerPending) finish();
                    });
                    colorPanel.set = wrappedSet;
                    timeout = setTimeout(releaseCapture, 120000);

                    try {
                        if (nativeAction.trigger() !== true) releaseCapture();
                    } catch (error) {
                        releaseCapture();
                        console.warn('[Light Manager] Failed to start the native screen color picker.', error);
                    }
                }

                handleCustomInput() {
                    let newColor = tinycolor();
                    let format = this.formats[this.currentFormatIndex];

                    if (format === 'HEX') {
                        newColor = tinycolor(this.inputs['hex'].val());
                    } else if (format === 'RGB') {
                        newColor = tinycolor({
                            r: parseFloat(this.inputs['r'].val()) || 0,
                            g: parseFloat(this.inputs['g'].val()) || 0,
                            b: parseFloat(this.inputs['b'].val()) || 0,
                            a: parseFloat(this.inputs['a'].val() ?? 1)
                        });
                    } else if (format === 'HSL') {
                        newColor = tinycolor({
                            h: parseFloat(this.inputs['h'].val()) || 0,
                            s: (parseFloat(this.inputs['s'].val()) || 0) / 100,
                            l: (parseFloat(this.inputs['l'].val()) || 0) / 100,
                            a: parseFloat(this.inputs['a'].val() ?? 1)
                        });
                    } else if (format === 'HSV') {
                        newColor = tinycolor({
                            h: parseFloat(this.inputs['h'].val()) || 0,
                            s: (parseFloat(this.inputs['s'].val()) || 0) / 100,
                            v: (parseFloat(this.inputs['v'].val()) || 0) / 100,
                            a: parseFloat(this.inputs['a'].val() ?? 1)
                        });
                    }

                    if (newColor.isValid()) {
                        this.jq.spectrum("set", newColor);
                        this.handleMove(newColor, true);
                    }
                }

                updateAdvancedUI(color) {
                    if (!this.inputs || Object.keys(this.inputs).length === 0) return;

                    let c = tinycolor(color);
                    let format = this.formats[this.currentFormatIndex];

                    if (format === 'HEX') {
                        this.inputs['hex'].val(c.getAlpha() < 1 ? c.toHex8String() : c.toHexString());
                    } else if (format === 'RGB') {
                        let rgb = c.toRgb();
                        this.inputs['r'].val(Math.round(rgb.r));
                        this.inputs['g'].val(Math.round(rgb.g));
                        this.inputs['b'].val(Math.round(rgb.b));
                        this.inputs['a'].val(Math.round(rgb.a * 100) / 100);
                    } else if (format === 'HSL') {
                        let hsl = c.toHsl();
                        this.inputs['h'].val(Math.round(hsl.h));
                        this.inputs['s'].val(Math.round(hsl.s * 100));
                        this.inputs['l'].val(Math.round(hsl.l * 100));
                        this.inputs['a'].val(Math.round(hsl.a * 100) / 100);
                    } else if (format === 'HSV') {
                        let hsv = c.toHsv();
                        this.inputs['h'].val(Math.round(hsv.h));
                        this.inputs['s'].val(Math.round(hsv.s * 100));
                        this.inputs['v'].val(Math.round(hsv.v * 100));
                        this.inputs['a'].val(Math.round(hsv.a * 100) / 100);
                    }
                }

                handleMove(color, fromCustomInput = false) {
                    this.value = tinycolor(color);
                    if (!fromCustomInput) {
                        this.updateAdvancedUI(this.value);
                    }
                    if (this.onMove) {
                        this.onMove(this.value);
                    }
                    this.dispatchEvent('modify_color', { color: this.value });
                }

                change(color) {
                    this.value = tinycolor(color);
                    if (this.onChange) {
                        this.onChange(this.value);
                    }
                    this.dispatchEvent('change', { color: this.value });
                }

                set(color) {
                    this.value = tinycolor(color);
                    this.jq.spectrum('set', this.value.toHex8String());
                    this.updateAdvancedUI(this.value);
                    return this;
                }

                get() {
                    this.value = this.jq.spectrum('get');
                    return this.value;
                }
            }

            window.AdvancedColorPicker = AdvancedColorPicker;


            // MARK: Advanced color form element
            FormElement.types.advanced_color = class FormElementAdvancedColor extends FormElement {

                get uses_wide_inputs() { return false; }

                setup() {
                    let tempDesc = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = tempDesc;
                }

                build(bar) {
                    this.bar = bar;

                    bar.classList.add('full_width_dialog_bar');
                    bar.style.padding = '0';
                    bar.style.background = 'transparent';
                    bar.style.display = 'flex';
                    bar.style.alignItems = 'center';
                    bar.style.gap = '7px';

                    let data = this.options;
                    let helpText = '';
                    if (data.description) {
                        helpText = tl(data.description);
                    } else if (data.title) {
                        helpText = tl(data.title);
                    }

                    if (data.label) {
                        let labelWrapper = document.createElement('div');
                        labelWrapper.className = 'light_manager_control_label';
                        labelWrapper.style = 'display: flex; align-items: center; gap: 7px; flex: 1 1 auto; min-width: 0;';
                        if (helpText) {
                            labelWrapper.title = helpText;
                            labelWrapper.style.cursor = 'help';
                        }

                        let labelElement = document.createElement('span');
                        labelElement.style = 'font-size: 13px; color: var(--color-subtle_text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto;';
                        labelElement.innerText = tl(data.label);
                        labelWrapper.append(labelElement);

                        let separator = document.createElement('span');
                        separator.className = 'light_manager_control_separator';
                        separator.setAttribute('aria-hidden', 'true');
                        separator.style = `height: 1px; flex: 1 1 12px; min-width: 12px; background: ${data.separator_color || 'color-mix(in srgb, var(--color-border) 62%, transparent)'}; pointer-events: none;`;
                        labelWrapper.append(separator);
                        bar.append(labelWrapper);
                    }

                    if (this.options.colorpicker) this.colorpicker = this.options.colorpicker;

                    if (!this.colorpicker) {
                        this.colorpicker = new AdvancedColorPicker('cp_' + this.id + '_' + guid(), {
                            name: data.label ? tl(data.label) : '',
                            value: data.value !== undefined ? data.value : (data.default || '#ffffff'),
                            palette: data.palette === true,
                            private: true,
                            onMove: (tinycolor) => {
                                this.change();
                            },
                            onChange: (tinycolor) => {
                                this.change();
                            },
                            onBefore: data.onBefore,
                            onAfter: data.onAfter,
                            alpha: data.alpha !== undefined ? data.alpha : true
                        });
                    } else {
                        this.colorpicker.onBefore = data.onBefore;
                        this.colorpicker.onAfter = data.onAfter;
                    }

                    const expandControl = data.expand_control === true;
                    this.colorpicker.node.classList.add('light_manager_advanced_color_control');
                    this.colorpicker.node.classList.toggle('is_expanded', expandControl);
                    this.colorpicker.node.style.flex = expandControl ? '0 1 174px' : '0 0 auto';
                    this.colorpicker.node.style.width = expandControl ? '174px' : 'auto';
                    this.colorpicker.node.style.minWidth = expandControl ? '92px' : '0';
                    this.colorpicker.node.style.maxWidth = expandControl ? '174px' : 'none';
                    this.colorpicker.node.style.height = '28px';
                    this.colorpicker.node.style.margin = '0';

                    bar.append(this.colorpicker.getNode());
                }

                getValue() {
                    return this.colorpicker ? this.colorpicker.get() : tinycolor('#ffffff');
                }

                setValue(value) {
                    if (this.colorpicker) this.colorpicker.set(value);
                }

                getDefault() {
                    return tinycolor('#ffffff');
                }
            };

            // MARK: Combo Slider Form Element
            FormElement.types.combo_slider = class FormElementComboSlider extends FormElement {
                get uses_wide_inputs() { return true; }

                setup() {
                    let tempDesc = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = tempDesc;
                }

                build(bar) {
                    this.bar = bar;

                    let data = this.options;
                    this.value = data.value !== undefined ? data.value : (data.default !== undefined ? data.default : 0);
                    this.isDragging = false;
                    this.is_compact = !!data.compact; // COMPACT MODE

                    // Almacenar callbacks
                    this.onBefore = typeof data.onBefore === 'function' ? data.onBefore : null;
                    this.onAfter = typeof data.onAfter === 'function' ? data.onAfter : null;
                    this.onDrag = typeof data.onDrag === 'function'
                        ? data.onDrag
                        : (typeof data.onMove === 'function' ? data.onMove : null);

                    this.settings = {
                        min: data.min !== undefined ? data.min : 0,
                        max: data.max !== undefined ? data.max : 10,
                        step: data.step !== undefined ? data.step : 1,
                        circular: data.circular,
                        allow_lower: !!data.allow_lower,
                        allow_higher: !!data.allow_higher,
                        resettable: !!data.resettable || data.reset_value !== undefined,
                        reset_value: data.reset_value !== undefined ? data.reset_value : this.value,
                        slider_fill: !!data.slider_fill,
                        slider_fill_color: data.slider_fill_color || data.color || null
                    };

                    // Build the internal slider UI.
                    let rangeInput = Interface.createElement('input', {
                        type: 'range',
                        value: this.value,
                        min: this.settings.min,
                        max: this.settings.max,
                        step: this.settings.step,
                        class: 'tool disp_range',
                        style: `margin: 0;flex: 1 1 auto;width: 100%;min-width: 30px;transition: opacity 0.2s, filter 0.2s;${data.color ? '--color-thumb: ' + data.color + ';' : ''}`
                    });

                    // Match Blockbench's text input with inputmode so native browser
                    // spinner buttons do not interfere visually with the "<>" icon.
                    let numberInputOptions = {
                        type: 'text',
                        inputmode: this.settings.min >= 0 ? 'decimal' : '',
                        lang: 'en',
                        value: this.value,
                        class: 'dark_bordered focusable_input',
                        style: `width: 100%;min-width: 45px;height: 24px;box-sizing: border-box;text-align: center;margin: 0;padding-right: 18px;`
                    };

                    let numberInput = Interface.createElement('input', numberInputOptions);
                    const accessibleName = data.label
                        ? (typeof tl !== 'undefined' ? tl(data.label) : data.label)
                        : (data.description ? (typeof tl !== 'undefined' ? tl(data.description) : data.description) : 'Value');
                    rangeInput.setAttribute('aria-label', accessibleName);
                    numberInput.setAttribute('aria-label', `${accessibleName} value`);
                    this.rangeInput = rangeInput;
                    this.numberInput = numberInput;

                    let numSliderIcon = Interface.createElement('div', {
                        class: 'tool numeric_input_slider'
                    }, [
                        Interface.createElement('i', { class: 'material-icons' }, 'code')
                    ]);

                    let numberContainer = Interface.createElement('div', {
                        class: 'numeric_input tool disp_text',
                        style: `margin: 0; flex: 0 0 auto; position: relative;`
                    }, [numberInput, numSliderIcon]);

                    // Initialize slider fill if enabled
                    if (this.settings.slider_fill && this.settings.slider_fill_color) {
                        rangeInput.style.setProperty('--color-thumb', this.settings.slider_fill_color);
                    }

                    let comboWrapper = Interface.createElement('div', {
                        class: 'bar slider_input_combo',
                        style: `display: flex;align-items: center;height: 100%;margin: 0 5px;flex: 1 1 auto;min-width: 0;width: auto;`
                    }, [rangeInput, numberContainer]);

                    let containerChildren = [];

                    // Internal label and icon
                    if (data.icon && !this.is_compact) {
                        let isFa = data.icon.startsWith('fa-') || data.icon.startsWith('fas ') || data.icon.startsWith('fab ');
                        let iconElement = Interface.createElement('i', {
                            class: isFa ? `fa ${data.icon}` : 'material-icons',
                            style: 'margin-right: 4px; font-size: 18px; color: var(--color-text); display: flex; align-items: center;'
                        }, isFa ? '' : data.icon);
                        containerChildren.push(iconElement);
                    }

                    if (data.label) {
                        let labelOptions = {
                            style: 'margin-right: 5px; font-size: 13px; color: var(--color-subtle_text); white-space: nowrap; display: flex; align-items: center;'
                        };
                        if (data.description) {
                            labelOptions.title = typeof tl !== 'undefined' ? tl(data.description) : data.description;
                            labelOptions.style += ' cursor: help;';
                        }
                        let labelElement = Interface.createElement('span', labelOptions, typeof tl !== 'undefined' ? tl(data.label) : data.label);
                        containerChildren.push(labelElement);
                    }

                    if (!data.label && data.description) {
                        comboWrapper.title = typeof tl !== 'undefined' ? tl(data.description) : data.description;
                    }

                    containerChildren.push(comboWrapper);

                    if (this.settings.resettable) {
                        this.resetBtn = Interface.createElement('i', {
                            class: 'material-icons icon',
                            title: 'Reset',
                            style: `font-size: 18px;cursor: pointer;display: none;margin-left: 2px;color: var(--color-subtle_text);display: flex;align-items: center;`
                        }, 'replay');
                        this.resetBtn.tabIndex = 0;
                        this.resetBtn.setAttribute('role', 'button');
                        this.resetBtn.setAttribute('aria-label', `Reset ${accessibleName}`);

                        this.resetBtn.onclick = (e) => {
                            if (this.is_disabled) return;
                            if (this.onBefore) this.onBefore(e);
                            this.setValue(this.settings.reset_value, true);
                            if (this.onAfter) this.onAfter(e);
                        };
                        this.resetBtn.onkeydown = e => {
                            if (e.key !== 'Enter' && e.key !== ' ') return;
                            e.preventDefault();
                            this.resetBtn.onclick(e);
                        };
                        containerChildren.push(this.resetBtn);
                    }

                    // Main slider container
                    this.slider_node = Interface.createElement('div', {
                        class: 'tool widget',
                        style: `display: flex;flex-direction: row;align-items: center;height: 30px;padding: 0 4px;min-width: 0; width: 100%; box-sizing: border-box;`
                    }, containerChildren);


                    // Configure the selected interaction mode.
                    if (this.is_compact) {
                        bar.classList.add('full_width_dialog_bar');
                        bar.style.padding = '0';
                        bar.style.background = 'transparent';

                        this.node = document.createElement('div');
                        this.node.className = 'tool widget compact_dropdown_select';
                        this.node.style = `display: flex; align-items: center; cursor: pointer; padding: 2px 6px; background: ${data.background || 'var(--color-button)'}; border-radius: 2px; height: 30px; box-sizing: border-box; flex-shrink: 0;`;
                        this.node.tabIndex = 0;
                        this.node.setAttribute('role', 'button');
                        this.node.setAttribute('aria-haspopup', 'dialog');
                        this.node.setAttribute('aria-expanded', 'false');
                        this.node.setAttribute('aria-label', accessibleName);

                        const iconWrapper = document.createElement('div');
                        iconWrapper.className = 'main_icon_wrapper';
                        iconWrapper.style = 'display: flex; align-items: center; margin-right: 4px;';

                        const mainIcon = Blockbench.getIconNode(data.icon || 'settings');
                        if (data.icon_color) {
                            mainIcon.style.color = data.icon_color;
                        }
                        iconWrapper.append(mainIcon);

                        const arrowNode = document.createElement('i');
                        arrowNode.className = 'fas fa-caret-down dropdown_arrow';
                        arrowNode.style = 'font-size: 12px; color: var(--color-text); display: flex; align-items: center;';

                        this.node.append(iconWrapper, arrowNode);
                        bar.append(this.node);

                        this.popup_panel = document.createElement('div');
                        this.popup_panel.className = 'context_menu combo_slider_popup';
                        Object.assign(this.popup_panel.style, {
                            position: 'fixed',
                            display: 'none',
                            zIndex: '1000',
                            background: 'var(--color-menu_bg, var(--color-ui))',
                            border: '1px solid var(--color-border)',
                            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                            padding: '4px',
                            borderRadius: '4px',
                            width: data.popup_width || '220px',
                            boxSizing: 'border-box'
                        });
                        this.popup_panel.append(this.slider_node);

                        this._isOpen = false;

                        this.closePopup = (e) => {
                            if (!this._isOpen) return;
                            if (e.type === 'keydown' && e.key !== 'Escape') return;
                            if (e.type === 'mousedown' && (this.popup_panel.contains(e.target) || this.node.contains(e.target))) return;

                            this.popup_panel.style.display = 'none';
                            if (this.popup_panel.parentNode) this.popup_panel.parentNode.removeChild(this.popup_panel);
                            this._isOpen = false;
                            this.node.setAttribute('aria-expanded', 'false');
                            this.releasePopupDocumentListeners?.();
                            this.releasePopupDocumentListeners = null;
                        };

                        this.node.addEventListener('mousedown', (e) => {
                            if (this.is_disabled) return;
                            if (this._isOpen) {
                                this.closePopup({ type: 'mousedown', target: document.body });
                                return;
                            }

                            this.popup_panel.style.display = 'block';
                            document.body.appendChild(this.popup_panel);

                            let rect = this.node.getBoundingClientRect();
                            this.popup_panel.style.top = (rect.bottom + 4) + 'px';

                            let popupRect = this.popup_panel.getBoundingClientRect();
                            let leftPos = rect.left;
                            if (leftPos + popupRect.width > window.innerWidth) {
                                leftPos = window.innerWidth - popupRect.width - 4;
                            }
                            this.popup_panel.style.left = leftPos + 'px';

                            this._isOpen = true;
                            this.node.setAttribute('aria-expanded', 'true');

                            scheduleLightManagerTimeout(() => {
                                if (!this._isOpen) return;
                                document.addEventListener('mousedown', this.closePopup);
                                document.addEventListener('keydown', this.closePopup);
                                this.releasePopupDocumentListeners = trackDocumentInteraction(() => {
                                    document.removeEventListener('mousedown', this.closePopup);
                                    document.removeEventListener('keydown', this.closePopup);
                                    if (this.popup_panel.parentNode) this.popup_panel.parentNode.removeChild(this.popup_panel);
                                    this._isOpen = false;
                                    this.node.setAttribute('aria-expanded', 'false');
                                });
                            }, 10);
                        });
                        this.node.addEventListener('keydown', e => {
                            if (this.is_disabled || (e.key !== 'Enter' && e.key !== ' ')) return;
                            e.preventDefault();
                            this.node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                        });

                    } else {
                        bar.classList.add('full_width_dialog_bar');
                        bar.style.padding = '0';
                        bar.style.background = 'transparent';
                        this.node = this.slider_node;
                        bar.append(this.node);
                    }

                    // Bind the internal slider events.
                    let scope = this;
                    let $inputs = $(this.slider_node).find('input');
                    let $range = $(this.slider_node).find('input[type="range"]');
                    let $number = $(this.slider_node).find('input[type="text"]');

                    // Drag behavior for the input's mini slider ("<>").
                    if (typeof addEventListeners !== 'undefined') {
                        addEventListeners(numSliderIcon, 'mousedown touchstart', e1 => {
                            if (scope.is_disabled) return;
                            if (typeof convertTouchEvent !== 'undefined') convertTouchEvent(e1);

                            let lastDifference = 0;
                            const startValue = parseFloat(scope.numberInput.value) || 0;

                            if (scope.onBefore) scope.onBefore(e1);
                            scope.isDragging = true;

                            let move = e2 => {
                                if (typeof convertTouchEvent !== 'undefined') convertTouchEvent(e2);
                                let difference = Math.trunc((e2.clientX - e1.clientX) / 10) * (scope.settings.step || 1);

                                if (difference !== lastDifference) {
                                    let newValue = startValue + difference;

                                    if (!scope.settings.allow_lower && newValue < scope.settings.min) newValue = scope.settings.min;
                                    if (!scope.settings.allow_higher && newValue > scope.settings.max) newValue = scope.settings.max;

                                    if (typeof trimFloatNumber !== 'undefined') {
                                        newValue = trimFloatNumber(newValue, 8);
                                    } else {
                                        newValue = Math.round(newValue * 100000000) / 100000000;
                                    }

                                    scope.setValue(newValue, true, false);
                                    if (scope.onDrag) scope.onDrag(newValue, e2, true);
                                    lastDifference = difference;
                                }
                            };

                            let stop = e2 => {
                                if (typeof removeEventListeners !== 'undefined') {
                                    removeEventListeners(document, 'mousemove touchmove', move);
                                    removeEventListeners(document, 'mouseup touchend', stop);
                                }
                                scope.isDragging = false;
                                scope.updateResetButton();
                                if (scope.onAfter) scope.onAfter(e2);
                            };

                            addEventListeners(document, 'mousemove touchmove', move);
                            addEventListeners(document, 'mouseup touchend', stop);
                        });
                    }

                    // Trigger continuous updates without onBefore/onAfter.
                    $inputs.on('input', function (event) {
                        let val = parseFloat($(event.target).val());
                        if (isNaN(val)) return;
                        const isNumberInput = event.target === $number[0];
                        scope.setValue(val, true, isNumberInput);
                        if (scope.onDrag && (scope.isDragging || event.target === $range[0])) {
                            scope.onDrag(val, event.originalEvent, isNumberInput);
                        }
                    });

                    // Trigger onBefore with the same behavior as a Widget.
                    $range.on('mousedown touchstart', function (event) {
                        scope.isDragging = true;
                        if (scope.onBefore) scope.onBefore(event.originalEvent);
                    });

                    $number.on('focus', function (event) {
                        if (scope.onBefore) scope.onBefore(event.originalEvent);
                    });

                    // Trigger onAfter when editing finishes.
                    $range.on('mouseup touchend', function (event) {
                        scope.isDragging = false;
                        scope.updateResetButton();
                        if (scope.onAfter) scope.onAfter(event.originalEvent);
                    });

                    $inputs.on('change', function (event) {
                        scope.isDragging = false;
                        scope.updateResetButton();
                        if (scope.onAfter) scope.onAfter(event.originalEvent);
                    });

                    // Special handling for the number input.
                    $number.on('blur', function (event) {
                        let val = parseFloat($(this).val());
                        if (isNaN(val)) {
                            val = scope.settings.reset_value;
                        }
                        scope.setValue(val, true, false);
                        if (scope.onAfter) scope.onAfter(event.originalEvent);
                    });

                    $number.on('keydown', function (event) {
                        if (event.key === 'Enter' || event.key === 'Escape') {
                            this.blur();
                            if (scope.is_compact && event.key === 'Enter') {
                                scope.closePopup({ type: 'mousedown', target: document.body });
                            }
                        }
                    });

                    this.setValue(this.value, false);
                }

                updateResetButton() {
                    if (!this.settings.resettable || !this.resetBtn) return;
                    if (this.isDragging) return;

                    if (parseFloat(this.value) !== parseFloat(this.settings.reset_value)) {
                        this.resetBtn.style.display = 'flex';
                    } else {
                        this.resetBtn.style.display = 'none';
                    }
                }

                updateSliderFill() {
                    if (!this.settings.slider_fill || !this.rangeInput) return;
                    
                    const min = parseFloat(this.settings.min) || 0;
                    const max = parseFloat(this.settings.max) || 100;
                    const value = parseFloat(this.value);
                    
                    const progress = ((value - min) / (max - min)) * 100;
                    
                    this.rangeInput.style.setProperty('--color-track',
                        `linear-gradient(
                            to right,
                            var(--color-thumb) 0%,
                            var(--color-thumb) calc(${progress}% - 6px),
                            var(--color-grid) ${progress}%,
                            var(--color-grid) 100%
                        )`
                    );
                }

                setResetValue(value, refreshButton = true) {
                    this.settings.reset_value = value;
                    if (refreshButton) {
                        this.updateResetButton();
                    }
                    return this;
                }

                setColor(color) {
                    const normalizedColor = color || '';
                    if (this.rangeInput) {
                        this.rangeInput.style.setProperty('--color-thumb', normalizedColor);
                        this.rangeInput.style.accentColor = normalizedColor;
                        this.rangeInput.style.color = normalizedColor;
                    }
                    // Update slider fill color if enabled
                    if (this.settings.slider_fill && normalizedColor) {
                        this.settings.slider_fill_color = normalizedColor;
                        this.updateSliderFill();
                    }
                    return this;
                }

                getValue() {
                    return this.value;
                }

                setValue(value, dispatch = true, skip_number_input_update = false) {
                    if (!this.settings.allow_lower && value < this.settings.min) value = this.settings.min;
                    if (!this.settings.allow_higher && value > this.settings.max) value = this.settings.max;

                    this.value = value;
                    let $range = $(this.slider_node).find('input[type="range"]');
                    let $number = $(this.slider_node).find('input[type="text"]');

                    $range.val(value);
                    if (!skip_number_input_update) {
                        $number.val(value);
                    }

                    let isOutOfBounds = false;
                    if (this.settings.allow_lower && value < this.settings.min) isOutOfBounds = true;
                    if (this.settings.allow_higher && value > this.settings.max) isOutOfBounds = true;

                    if (isOutOfBounds) {
                        $range.css({ 'opacity': '0.3', 'filter': 'grayscale(100%)' });
                    } else {
                        $range.css({ 'opacity': '1', 'filter': 'none' });
                    }

                    this.updateResetButton();
                    this.updateSliderFill();

                    if (this.is_compact) {
                        let baseName = this.options.label ? (typeof tl !== 'undefined' ? tl(this.options.label) : this.options.label) + ': ' : '';
                        let desc = (this.options.description && !this.options.label) ? '\n' + (typeof tl !== 'undefined' ? tl(this.options.description) : this.options.description) : '';
                        this.node.title = `${baseName}${this.value}${desc}`;
                    }

                    if (dispatch) this.change(); // Trigger Blockbench's global update.
                }

                getDefault() {
                    return this.settings.reset_value !== undefined ? this.settings.reset_value : 0;
                }
            };

            // MARK: Compact Dropdown Select
            FormElement.types.compact_select = class FormElementCompactDropdown extends FormElement {
                get uses_wide_inputs() { return false; }
                setup() {
                    let tempDesc = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = tempDesc;
                }
                build(bar) {
                    this.bar = bar;
                    bar.classList.add('full_width_dialog_bar');
                    bar.style.padding = '0';
                    bar.style.background = 'transparent';

                    let data = this.options;
                    this.options_dict = data.options || {};
                    this.values = Object.keys(this.options_dict);
                    this.value = data.value !== undefined ? data.value : (data.default !== undefined ? data.default : this.values[0]);

                    // Button DOM mirrors the original widget.
                    this.node = document.createElement('div');
                    this.node.className = 'tool widget compact_dropdown_select';
                    this.node.style = `display: flex; align-items: center; cursor: pointer; padding: 2px 6px; background: ${data.background ? data.background : 'var(--color-button)'}; border-radius: 2px; height: 30px; box-sizing: border-box; flex: ${data.expand ? '1 1 auto' : '0 0 auto'}; min-width: 0;`;
                    this.node.tabIndex = 0;
                    this.node.setAttribute('role', 'button');
                    this.node.setAttribute('aria-haspopup', 'menu');
                    this.node.setAttribute('aria-expanded', 'false');

                    this.icon_wrapper = document.createElement('div');
                    this.icon_wrapper.className = 'main_icon_wrapper';
                    this.icon_wrapper.style = 'display: flex; align-items: center; margin-right: 4px;';

                    this.arrow_node = document.createElement('i');
                    this.arrow_node.className = 'fas fa-caret-down dropdown_arrow';
                    this.arrow_node.style = 'font-size: 12px; color: var(--color-text); display: flex; align-items: center; margin-left: auto;';

                    this.value_label = document.createElement('span');
                    this.value_label.className = 'compact_dropdown_value';
                    this.value_label.style = 'font-size: 13px; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1 1 auto;';
                    this.value_label.hidden = !data.show_value_text;

                    this.node.append(this.icon_wrapper, this.value_label, this.arrow_node);

                    // Group with the label when present without splitting the row in half.
                    let outerContainer = document.createElement('div');
                    outerContainer.style = 'display: flex; align-items: center; gap: 8px; width: 100%; height: 30px; padding: 0 4px; box-sizing: border-box;';

                    if (data.label && !data.hide_label) {
                        let labelElement = document.createElement('span');
                        labelElement.style = 'font-size: 13px; color: var(--color-text); white-space: nowrap;';
                        labelElement.innerText = typeof tl !== 'undefined' ? tl(data.label) : data.label;
                        outerContainer.append(labelElement);

                        if (data.description) {
                            let infoIcon = document.createElement('i');
                            infoIcon.className = 'fa fa-question dialog_form_description';
                            infoIcon.style = 'font-size: 14px; cursor: help; margin-left: 4px; color: var(--color-subtle_text);';
                            infoIcon.title = typeof tl !== 'undefined' ? tl(data.description) : data.description;
                            outerContainer.append(infoIcon);
                        }
                    }

                    outerContainer.append(this.node);
                    bar.append(outerContainer);

                    // Events.
                    this.node.addEventListener('click', (event) => {
                        if (this.is_disabled) return;
                        this.open(event);
                    });

                    this.node.addEventListener('keydown', event => {
                        if (this.is_disabled) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            this.open(event);
                        }
                    });

                    $(this.node).on('wheel', event => {
                        if (this.is_disabled || document.activeElement !== this.node) return;
                        event.preventDefault();
                        let e = event.originalEvent;
                        let index = this.values.indexOf(this.value);
                        index += e.deltaY < 0 ? -1 : 1;
                        if (index < 0) index = this.values.length - 1;
                        if (index >= this.values.length) index = 0;
                        this.setValue(this.values[index]);
                        this.change();
                    });

                    this.updateVisuals();
                }

                open(event) {
                    if (this.is_disabled) return;
                    if (Menu.closed_in_this_click == this.id) return;
                    let scope = this;
                    let items = [];

                    for (let key in this.options_dict) {
                        let opt = this.options_dict[key];
                        if (opt) {
                            items.push({
                                id: key,
                                name: opt.name || key,
                                icon: opt.icon,
                                color: undefined,
                                condition: opt.condition,
                                marked: key === this.value,
                                click: (e) => {
                                    scope.node.setAttribute('aria-expanded', 'false');
                                    scope.setValue(key);
                                    scope.change();
                                }
                            });
                        }
                    }

                    let menu = new Menu(this.id, items, { class: 'select_menu' });
                    if (menu.node) {
                        menu.node.classList.add('compact_dropdown_menu');
                        menu.node.style['min-width'] = this.node.clientWidth + 'px';
                    }

                    menu.open(this.node);
                    this.node.setAttribute('aria-expanded', 'true');

                    // Inject custom hover and selection styles
                    let styleBlock = document.createElement('style');
                    let cssRules = '';

                    for (let key in this.options_dict) {
                        let opt = this.options_dict[key];

                        if (opt && opt.color) {
                            let safeKey = key.replace(/"/g, '\\"');
                            let li = menu.node.querySelector(`li[menu_item="${safeKey}"]`);

                            if (li) {
                                let customClass = 'custom_hover_' + key.replace(/[^a-zA-Z0-9]/g, '_');
                                li.classList.add(customClass);

                                cssRules += `
                                    
                                    .${customClass} {
                                        /*color: ${opt.color} !important;
                                        
                                        -webkit-text-stroke: 1px color-mix(in oklab, ${opt.color} 80%, var(--color-accent_text)) !important;*/
                                        
                                       background: linear-gradient(90deg, ${opt.color} 0px, var(--color-bright_ui) 32px);
                                    }

                                    /*.${customClass}:hover i,
                                    .${customClass}.focused i,
                                    .${customClass}.marked i {
                                        color: color-mix(in oklab, ${opt.color} 60%, var(--color-accent_text)) !important;
                                    }*/

                                    
                                    .${customClass}:hover,
                                    .${customClass}.focused {
                                        /*background-color: color-mix(in oklab, ${opt.color} 25%, var(--color-bright_ui)) !important;*/
                                        background: linear-gradient(90deg, ${opt.color} 0px, var(--color-bright_ui) 50%);
                                        color: var(--color-accent_text) !important;
                                    }

                                    .${customClass}.marked {
                                        /*background-color: ${opt.color} !important;*/
                                        background: linear-gradient(90deg, ${opt.color} 0px, var(--color-bright_ui) 100%);
                                        color: var(--color-accent_text) !important;
                                    }

                                    
                                    /*.${customClass}:hover *,
                                    .${customClass}.focused *,
                                    .${customClass}.marked * {
                                        background: linear-gradient(90deg, ${opt.color} 0px, var(--color-bright_ui) 32px);
                                    }*/
                                `;
                            }
                        }
                    }

                    if (cssRules !== '') {
                        styleBlock.innerHTML = cssRules;
                        menu.node.appendChild(styleBlock);
                    }
                }

                updateVisuals() {
                    let opt = this.options_dict[this.value];
                    if (!opt) return;

                    let baseName = this.options.label ? (typeof tl !== 'undefined' ? tl(this.options.label) : this.options.label) + ': ' : '';
                    let optName = opt.name || this.value;
                    let desc = (this.options.description /*&& !this.options.label*/) ? '\n' + (typeof tl !== 'undefined' ? tl(this.options.description) : this.options.description) : '';
                    this.node.title = `${baseName}${optName}${desc}`;
                    this.node.setAttribute('aria-label', `${baseName}${optName}`);
                    this.value_label.textContent = optName;

                    this.icon_wrapper.innerHTML = '';
                    let iconElement = Blockbench.getIconNode(opt.icon || 'help');
                    if (opt.color) {
                        iconElement.style.color = opt.color;
                    }
                    this.icon_wrapper.append(iconElement);
                }

                getValue() {
                    return this.value;
                }

                setValue(value) {
                    this.value = value;
                    this.updateVisuals();
                }

                getDefault() {
                    return this.values[0] || '';
                }
            };

            // MARK: Enum Select
            // Named discrete values using Blockbench's own SelectInput. This preserves
            // the native form row, menu and sizing instead of nesting another form grid.
            FormElement.types.enum_select = class FormElementEnumSelect extends FormElement {
                setup() {
                    const description = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = description;

                    const label = this.bar?.querySelector(':scope > label');
                    if (label && description) {
                        label.title = typeof tl !== 'undefined' ? tl(description) : description;
                        label.style.cursor = 'help';
                    }
                }

                build(bar) {
                    super.build(bar);

                    const data = this.options;
                    const label = bar.querySelector(':scope > label');
                    if (label) {
                        const labelText = document.createElement('span');
                        labelText.textContent = label.textContent;
                        Object.assign(labelText.style, {
                            minWidth: '0',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            flex: '0 1 auto'
                        });
                        label.textContent = '';
                        Object.assign(label.style, {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '7px',
                            minWidth: '0',
                            color: 'var(--color-subtle_text)'
                        });
                        label.append(labelText);
                        const separator = document.createElement('span');
                        separator.className = 'light_manager_control_separator';
                        separator.setAttribute('aria-hidden', 'true');
                        Object.assign(separator.style, {
                            height: '1px',
                            flex: '1 1 12px',
                            minWidth: '12px',
                            background: data.separator_color || 'color-mix(in srgb, var(--color-border) 62%, transparent)',
                            pointerEvents: 'none'
                        });
                        label.append(separator);
                    }
                    this.options_dict = data.options || {};
                    this.values = Object.keys(this.options_dict);
                    this.value = String(data.value !== undefined
                        ? data.value
                        : (data.default !== undefined ? data.default : (this.values[0] || '')));
                    const scope = this;
                    this.select_input = new Interface.CustomElements.SelectInput(this.id, {
                        options: this.options_dict,
                        value: this.value,
                        onInput() {
                            const nextValue = scope.select_input.node.getAttribute('value') || scope.value;
                            if (nextValue === scope.value) return;
                            if (typeof data.onBefore === 'function') data.onBefore();
                            try {
                                scope.value = nextValue;
                                scope.updateResetButton();
                                scope.updateTooltip();
                                scope.change();
                            } finally {
                                if (typeof data.onAfter === 'function') data.onAfter();
                            }
                        }
                    });
                    this.node = this.select_input.node;
                    this.node.classList.remove('half');
                    this.node.classList.add('light_manager_enum_select_input');
                    this.node.setAttribute('aria-label', typeof tl !== 'undefined'
                        ? tl(data.label || data.description || this.id)
                        : (data.label || data.description || this.id));
                    Object.assign(this.node.style, {
                        flex: '1 1 0',
                        width: 'auto',
                        minWidth: '0',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        height: '28px',
                        boxSizing: 'border-box',
                        fontSize: '13px',
                        fontWeight: '400',
                        color: 'var(--color-text)'
                    });
                    bar.append(this.node);

                    if (data.resettable) {
                        this.reset_button = document.createElement('div');
                        this.reset_button.className = 'form_input_tool tool light_manager_enum_reset';
                        this.reset_button.tabIndex = 0;
                        this.reset_button.setAttribute('role', 'button');
                        this.reset_button.title = typeof tl !== 'undefined' ? tl('generic.reset') : 'Reset';
                        this.reset_button.setAttribute('aria-label', this.reset_button.title);
                        this.reset_button.append(Blockbench.getIconNode('restart_alt'));
                        Object.assign(this.reset_button.style, {
                            flex: '0 0 30px',
                            color: data.accent_color || 'var(--color-subtle_text)'
                        });
                        this.reset_button.addEventListener('click', event => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (this.is_disabled) return;
                            if (typeof data.onBefore === 'function') data.onBefore(event);
                            try {
                                this.setValue(data.reset_value !== undefined ? data.reset_value : this.getDefault());
                                this.change();
                            } finally {
                                if (typeof data.onAfter === 'function') data.onAfter(event);
                            }
                        });
                        this.reset_button.addEventListener('keydown', event => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            this.reset_button.click();
                        });
                        bar.append(this.reset_button);
                    }
                    this.setValue(this.value);
                }

                updateTooltip() {
                    if (!this.node) return;
                    const option = this.options_dict[this.value];
                    const optionName = option && typeof option === 'object'
                        ? (option.name || option.label || this.value)
                        : (option || this.value);
                    const label = typeof tl !== 'undefined' ? tl(optionName) : optionName;
                    const description = this.options.description
                        ? (typeof tl !== 'undefined' ? tl(this.options.description) : this.options.description)
                        : '';
                    this.node.title = description ? `${label}\n${description}` : label;
                }

                updateResetButton() {
                    if (!this.reset_button) return;
                    const resetValue = String(this.options.reset_value !== undefined
                        ? this.options.reset_value
                        : this.getDefault());
                    const changed = String(this.value) !== resetValue;
                    this.reset_button.style.display = changed ? '' : 'none';
                    this.reset_button.tabIndex = changed ? 0 : -1;
                    this.reset_button.setAttribute('aria-hidden', changed ? 'false' : 'true');
                }

                getValue() { return this.value; }
                setValue(value) {
                    const normalized = String(value ?? '');
                    this.value = this.values.includes(normalized) ? normalized : (this.values[0] || '');
                    if (this.select_input) this.select_input.set(this.value);
                    this.updateTooltip();
                    this.updateResetButton();
                }
                getDefault() {
                    return String(this.options.default !== undefined
                        ? this.options.default
                        : (this.values[0] || ''));
                }
            };

            // MARK: Horizontal Select
            // Full-width segmented control implemented directly as a FormElement, without
            // registering a BarItem or Toolbar child.
            FormElement.types.horizontal_select = class FormElementHorizontalSelect extends FormElement {
                get uses_wide_inputs() { return true; }

                setup() {
                    const description = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = description;
                }

                build(bar) {
                    this.bar = bar;
                    bar.classList.add('full_width_dialog_bar');
                    bar.style.padding = '0';
                    bar.style.margin = '0';
                    bar.style.background = 'transparent';

                    const data = this.options;
                    this.options_dict = data.options || {};
                    this.allow_empty = data.allow_empty !== undefined ? !!data.allow_empty : true;
                    this.multi_select = data.multi_select !== false;
                    this.selected = [];

                    this.node = document.createElement('div');
                    this.node.className = 'horizontal_select_widget light_manager_horizontal_select';
                    this.node.setAttribute('role', 'group');
                    this.node.setAttribute('aria-label', typeof tl === 'function'
                        ? tl(data.description || data.label || this.id)
                        : (data.description || data.label || this.id));
                    this.node.style.backgroundColor = data.background || data.bg_color || 'var(--color-back)';
                    this.node.style.border = `1px solid ${data.divider_color || 'var(--color-border)'}`;
                    this.node.style.display = 'flex';
                    this.node.style.width = data.expand === false ? 'auto' : '100%';
                    this.node.style.flex = data.expand === false ? '0 0 auto' : '1 1 auto';
                    this.button_nodes = {};

                    Object.entries(this.options_dict).forEach(([key, option], index, entries) => {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.className = 'horizontal_select_btn';
                        button.dataset.key = key;
                        button.style.flex = data.expand === false ? '0 0 auto' : '1 1 0';
                        button.style.border = '0';
                        button.style.borderRadius = '0';
                        button.style.fontFamily = 'inherit';
                        if (index < entries.length - 1) {
                            button.style.borderRight = `1px solid ${data.divider_color || 'var(--color-border)'}`;
                        }
                        if (option.color) button.style.color = option.color;
                        if (option.disabled) button.classList.add('disabled');

                        if (option.icon) {
                            const icon = Blockbench.getIconNode(option.icon);
                            icon.classList.add('horizontal_select_icon');
                            button.append(icon);
                        }
                        if (option.name) {
                            const label = document.createElement('span');
                            label.className = 'horizontal_select_label';
                            label.textContent = typeof tl === 'function' ? tl(option.name) : option.name;
                            button.append(label);
                        } else {
                            button.classList.add('icon_only');
                        }

                        const title = option.description || option.name || key;
                        button.title = typeof tl === 'function' ? tl(title) : title;
                        button.setAttribute('aria-label', button.title);
                        button.addEventListener('click', event => {
                            if (this.is_disabled || option.disabled) return;
                            const toggle = this.multi_select && (event.ctrlKey || event.shiftKey);
                            if (toggle) {
                                if (this.selected.includes(key)) {
                                    if (this.allow_empty || this.selected.length > 1) {
                                        this.selected = this.selected.filter(selected => selected !== key);
                                    }
                                } else {
                                    this.selected.push(key);
                                }
                            } else if (this.selected.length === 1 && this.selected[0] === key && this.allow_empty) {
                                this.selected = [];
                            } else {
                                this.selected = [key];
                            }
                            this.updateVisuals();
                            this.change();
                        });

                        this.button_nodes[key] = button;
                        this.node.append(button);
                    });

                    bar.append(this.node);
                    this.setValue(data.value !== undefined ? data.value : data.default);
                }

                updateVisuals() {
                    Object.entries(this.button_nodes || {}).forEach(([key, button]) => {
                        const selected = this.selected.includes(key);
                        const option = this.options_dict[key] || {};
                        button.classList.toggle('selected', selected);
                        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
                        button.style.color = selected ? '' : (option.color || '');
                    });
                }

                getValue() {
                    if (!this.selected.length) return null;
                    return this.selected.length === 1 ? this.selected[0] : this.selected.slice();
                }

                setValue(value) {
                    const requested = value === undefined || value === null
                        ? []
                        : (Array.isArray(value) ? value : [value]);
                    this.selected = requested.filter(key => this.options_dict[key]);
                    if (!this.selected.length && !this.allow_empty) {
                        const first = Object.keys(this.options_dict)[0];
                        if (first) this.selected = [first];
                    }
                    this.updateVisuals();
                }

                getDefault() {
                    if (this.options.default !== undefined) return this.options.default;
                    return this.allow_empty ? null : (Object.keys(this.options_dict)[0] || null);
                }
            };

            // MARK: Compact Text
            FormElement.types.compact_text = class FormElementCompactText extends FormElement {
                get uses_wide_inputs() { return true; }

                setup() {
                    const description = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = description;
                }

                build(bar) {
                    this.bar = bar;
                    bar.classList.add('full_width_dialog_bar');
                    bar.style.padding = '0';
                    bar.style.margin = '0';
                    bar.style.background = 'transparent';

                    const data = this.options;
                    const translatedLabel = data.label
                        ? (typeof tl === 'function' ? tl(data.label) : data.label)
                        : '';
                    const helpText = data.description
                        ? (typeof tl === 'function' ? tl(data.description) : data.description)
                        : translatedLabel;
                    if (translatedLabel) {
                        bar.style.display = 'flex';
                        bar.style.alignItems = 'center';
                        bar.style.gap = '7px';

                        const labelGroup = document.createElement('div');
                        labelGroup.className = 'light_manager_control_label';
                        labelGroup.style = 'display: flex; align-items: center; gap: 5px; min-width: 0; flex: 0 1 auto;';
                        if (helpText) {
                            labelGroup.title = helpText;
                            labelGroup.style.cursor = 'help';
                        }
                        if (data.icon) {
                            const icon = document.createElement('i');
                            icon.className = 'material-icons';
                            icon.textContent = data.icon;
                            icon.setAttribute('aria-hidden', 'true');
                            icon.style = `font-size: ${data.icon_size || '18px'}; color: ${data.icon_color || 'var(--color-subtle_text)'}; flex: 0 0 auto;`;
                            labelGroup.append(icon);
                        }
                        const label = document.createElement('span');
                        label.textContent = translatedLabel;
                        label.style = 'font-size: 13px; color: var(--color-subtle_text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
                        labelGroup.append(label);
                        bar.append(labelGroup);

                        const separator = document.createElement('span');
                        separator.className = 'light_manager_control_separator';
                        separator.setAttribute('aria-hidden', 'true');
                        separator.style = `height: 1px; min-width: 10px; flex: 1 1 12px; background: ${data.separator_color || 'color-mix(in srgb, var(--color-border) 62%, transparent)'}; pointer-events: none;`;
                        bar.append(separator);
                    }
                    this.value = String(data.value ?? data.default ?? '');
                    this.node = document.createElement('input');
                    this.node.type = 'text';
                    this.node.className = 'dark_bordered focusable_input light_manager_compact_text';
                    this.node.value = this.value;
                    this.node.placeholder = typeof tl === 'function'
                        ? tl(data.placeholder || '')
                        : (data.placeholder || '');
                    this.node.title = typeof tl === 'function'
                        ? tl(data.description || data.label || '')
                        : (data.description || data.label || '');
                    this.node.setAttribute('aria-label', this.node.title || this.node.placeholder || this.id);
                    Object.assign(this.node.style, {
                        width: translatedLabel ? 'auto' : '100%',
                        minWidth: '45px',
                        height: data.height || '30px',
                        margin: '0',
                        padding: '0 8px',
                        boxSizing: 'border-box',
                        flex: translatedLabel ? '0 1 58%' : '1 1 auto'
                    });
                    this.node.addEventListener('input', () => {
                        this.value = this.node.value;
                    });
                    this.node.addEventListener('change', () => {
                        this.value = this.node.value;
                        this.change();
                    });
                    this.node.addEventListener('keydown', event => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            this.node.blur();
                        }
                    });
                    bar.append(this.node);
                }

                getValue() { return this.value; }
                setValue(value) {
                    this.value = String(value ?? '');
                    if (this.node && this.node.value !== this.value) this.node.value = this.value;
                }
                getDefault() { return String(this.options.default ?? ''); }
            };

            // MARK: Bar Display
            FormElement.types.bar_display = class FormElementBarDisplay extends FormElement {
                get uses_wide_inputs() { return true; }
                setup() {
                    let tempDesc = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = tempDesc;
                }
                build(bar) {
                    this.bar = bar;
                    bar.classList.add('full_width_dialog_bar');
                    bar.classList.add('light_manager_bar_display_row');
                    bar.style.setProperty('height', 'auto', 'important');
                    bar.style.setProperty('min-height', '0', 'important');
                    bar.style.setProperty('padding', '0', 'important');
                    bar.style.setProperty('margin-top', '0', 'important');
                    bar.style.setProperty('margin-bottom', '0', 'important');
                    bar.style.setProperty('overflow', 'visible', 'important');
                    bar.style.background = 'transparent';

                    let data = this.options;
                    const cssLength = (value, fallback = '0px') => {
                        if (value === undefined || value === null || value === '') return fallback;
                        return typeof value === 'number' ? `${value}px` : String(value);
                    };
                    this.text = data.text !== undefined ? data.text : (data.value ?? '');
                    this.inline_label = data.label || '';
                    this.color = data.color || '';
                    this.icon_name = data.icon || '';
                    this.icon_color = data.icon_color || data.iconColor || '';
                    this.icon_size = data.icon_size || data.iconSize || '1.1em';
                    this.font_size = data.font_size || data.fontSize || '';
                    this.font_weight = data.font_weight || data.fontWeight || '';
                    this.letter_spacing = data.letter_spacing || data.letterSpacing || '';
                    this.is_paragraph = !!data.paragraph;
                    this.expand = !!data.expand;
                    const requestedAlignment = data.text_alignment || data.alignment || data.align;
                    this.text_alignment = ['left', 'center', 'right'].includes(requestedAlignment)
                        ? requestedAlignment
                        : 'left';
                    this.description = data.description || data.title || '';
                    this.show_separator = !!(data.separator ?? data.divider ?? data.header_line);
                    this.separator_color = data.separator_color || data.divider_color || 'var(--color-border)';
                    this.separator_thickness = cssLength(data.separator_thickness, '1px');
                    this.separator_gap = cssLength(data.separator_gap, '7px');
                    this.leading_line_width = cssLength(data.leading_line_width, '12px');

                    const verticalPadding = cssLength(data.padding_vertical, '0px');
                    this.padding_top = cssLength(data.padding_top, verticalPadding);
                    this.padding_bottom = cssLength(data.padding_bottom, verticalPadding);
                    this.padding_left = cssLength(data.padding_left, '4px');
                    this.padding_right = cssLength(data.padding_right, '4px');
                    this.line_height = cssLength(data.line_height, this.is_paragraph ? '1.4em' : '20px');

                    if (this.is_paragraph) {
                        // Native Blockbench form bars default to a single-row height. A wrapped
                        // paragraph must participate in layout normally or it overlaps the next
                        // form element (especially visible above the Gradient Editor).
                        bar.style.setProperty('height', 'auto', 'important');
                        bar.style.setProperty('min-height', '0', 'important');
                        bar.style.setProperty('overflow', 'visible', 'important');
                        bar.style.setProperty('align-items', 'flex-start', 'important');
                    }

                    this.node = document.createElement('div');
                    this.node.className = `tool widget bar_display ${this.is_paragraph ? 'bar_display_paragraph' : ''}`;
                    if (this.show_separator) this.node.classList.add('bar_display_separator');
                    this.node.classList.add(`bar_display_align_${this.text_alignment}`);
                    Object.assign(this.node.style, {
                        display: 'flex',
                        paddingTop: this.padding_top,
                        paddingRight: this.padding_right,
                        paddingBottom: this.padding_bottom,
                        paddingLeft: this.padding_left,
                        cursor: 'default',
                        width: '100%',
                        minHeight: '0',
                        lineHeight: this.line_height,
                        boxSizing: 'border-box',
                        alignItems: this.is_paragraph ? 'flex-start' : 'center'
                    });

                    if (data.background) this.node.style.background = data.background;
                    if (data.border) this.node.style.border = data.border;
                    if (data.border_left) this.node.style.borderLeft = data.border_left;
                    if (data.border_radius !== undefined) this.node.style.borderRadius = cssLength(data.border_radius);
                    if (data.margin_top !== undefined) bar.style.marginTop = cssLength(data.margin_top);
                    if (data.margin_bottom !== undefined) bar.style.marginBottom = cssLength(data.margin_bottom);
                    if (data.margin_left !== undefined) this.node.style.marginLeft = cssLength(data.margin_left);
                    if (data.margin_right !== undefined) this.node.style.marginRight = cssLength(data.margin_right);
                    if (this.font_size) this.node.style.fontSize = cssLength(this.font_size);
                    if (this.font_weight) this.node.style.fontWeight = String(this.font_weight);
                    if (this.letter_spacing) this.node.style.letterSpacing = cssLength(this.letter_spacing);

                    if (this.color) this.node.style.color = this.color;

                    bar.append(this.node);
                    this.buildDOM();
                }

                buildDOM() {
                    this.node.innerHTML = '';

                    const appendSeparator = side => {
                        const separator = document.createElement('span');
                        separator.className = `bar_display_separator_line bar_display_separator_${side}`;
                        Object.assign(separator.style, {
                            display: 'block',
                            height: this.separator_thickness,
                            background: this.separator_color,
                            minWidth: '0',
                            alignSelf: 'center',
                            pointerEvents: 'none'
                        });
                        if (this.text_alignment === 'center') {
                            separator.style.flex = '1 1 0';
                        } else if (
                            (this.text_alignment === 'left' && side === 'before') ||
                            (this.text_alignment === 'right' && side === 'after')
                        ) {
                            separator.style.flex = `0 0 ${this.leading_line_width}`;
                        } else {
                            separator.style.flex = '1 1 0';
                        }
                        this.node.append(separator);
                        return separator;
                    };

                    if (this.show_separator) appendSeparator('before');

                    this.main_node = document.createElement('span');
                    this.main_node.className = 'bar_display_main';
                    Object.assign(this.main_node.style, {
                        display: 'flex',
                        alignItems: this.is_paragraph ? 'flex-start' : 'center',
                        justifyContent: this.text_alignment === 'center'
                            ? 'center'
                            : (this.text_alignment === 'right' ? 'flex-end' : 'flex-start'),
                        gap: this.text || this.inline_label ? '6px' : '0',
                        minWidth: '0',
                        flex: this.show_separator
                            ? '0 1 auto'
                            : ((this.expand || this.text_alignment !== 'left') ? '1 1 0' : '0 1 auto')
                    });
                    if (this.show_separator) {
                        this.main_node.style.marginLeft = this.separator_gap;
                        this.main_node.style.marginRight = this.separator_gap;
                    }
                    this.node.append(this.main_node);

                    if (this.icon_name) {
                        const iconNode = Blockbench.getIconNode(this.icon_name);
                        iconNode.style.fontSize = this.icon_size;
                        iconNode.style.display = 'flex';
                        iconNode.style.alignItems = 'center';
                        if (this.icon_color) iconNode.style.color = this.icon_color;
                        this.main_node.append(iconNode);
                    }

                    if (this.inline_label) {
                        const labelNode = document.createElement('span');
                        labelNode.className = 'bar_display_label';
                        labelNode.style.fontWeight = 'bold';
                        labelNode.style.opacity = '0.85';
                        labelNode.style.display = 'flex';
                        labelNode.style.alignItems = 'center';
                        labelNode.innerText = typeof tl !== 'undefined' ? tl(this.inline_label) : this.inline_label;
                        this.main_node.append(labelNode);

                        if (this.description) {
                            let infoIcon = document.createElement('i');
                            infoIcon.className = 'fa fa-question dialog_form_description';
                            infoIcon.style = 'font-size: 14px; cursor: help; margin-left: 4px; color: var(--color-subtle_text); display: flex; align-items: center;';
                            infoIcon.title = typeof tl !== 'undefined' ? tl(this.description) : this.description;
                            this.main_node.append(infoIcon);
                        }
                    } else if (this.description) {
                        this.node.title = typeof tl !== 'undefined' ? tl(this.description) : this.description;
                    }

                    this.content_node = document.createElement('span');
                    this.content_node.className = 'bar_display_content';
                    if (this.expand && !this.show_separator) {
                        this.content_node.style.flex = '1 1 0';
                        this.content_node.style.minWidth = '0';
                    }
                    this.content_node.style.textAlign = this.text_alignment;

                    if (this.is_paragraph) {
                        this.content_node.style.whiteSpace = 'pre-wrap';
                        this.content_node.style.lineHeight = '1.4';
                    } else {
                        this.content_node.style.display = 'flex';
                        this.content_node.style.alignItems = 'center';
                        this.content_node.style.justifyContent = this.text_alignment === 'center'
                            ? 'center'
                            : (this.text_alignment === 'right' ? 'flex-end' : 'flex-start');
                    }

                    this.content_node.textContent = String(this.text ?? '');
                    this.main_node.append(this.content_node);

                    if (this.show_separator) appendSeparator('after');
                }

                getValue() {
                    return this.text;
                }

                setValue(value) {
                    this.text = value;
                    if (this.content_node) {
                        this.content_node.textContent = String(value ?? '');
                    }
                    if (this.main_node) {
                        this.main_node.style.gap = this.text || this.inline_label ? '6px' : '0';
                    }
                }

                getDefault() {
                    return '';
                }
            };

            // MARK: Custom Checkbox
            FormElement.types.custom_checkbox = class FormElementCustomCheckbox extends FormElement {
                // Prevents Blockbench from splitting the row in half
                get uses_wide_inputs() { return true; }

                setup() {
                    // Temporarily hide the description during base setup to avoid the default '?' icon
                    let tempDesc = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = tempDesc;
                }

                build(bar) {
                    this.bar = bar;
                    bar.classList.add('full_width_dialog_bar');
                    bar.style.padding = '0';
                    bar.style.background = 'transparent';

                    let data = this.options;
                    this.onBefore = typeof data.onBefore === 'function' ? data.onBefore : null;
                    this.onAfter = typeof data.onAfter === 'function' ? data.onAfter : null;
                    const commitVectorChange = (callback, event) => {
                        this.onBefore?.(event);
                        try {
                            return callback();
                        } finally {
                            this.onAfter?.(event);
                        }
                    };
                    this.value = data.value !== undefined ? !!data.value : (data.default !== undefined ? !!data.default : false);

                    // Customization settings.
                    this.icon_on = data.icon_on || 'check_box';
                    this.icon_off = data.icon_off || 'check_box_outline_blank';
                    this.icon_color_on = data.icon_color_on || 'var(--color-text)';
                    this.icon_color_off = data.icon_color_off || 'var(--color-subtle_text)';
                    this.label_color = data.label_color || 'var(--color-subtle_text)';
                    this.layout = data.layout || 'icon_left'; // Options: 'icon_left', 'icon_right', 'space_between'
                    this.icon_size = data.icon_size || '18px';
                    this.background_on = data.background_on || 'transparent';
                    this.background_off = data.background_off || 'transparent';
                    this.animate = data.animate !== false; // Respect explicit animate: false

                    let paddingValue = data.padding !== undefined ? data.padding : '0 4px';
                    if (data.padding_left !== undefined || data.padding_right !== undefined || data.padding_top !== undefined || data.padding_bottom !== undefined) {
                        let top = data.padding_top || '0';
                        let right = data.padding_right || '0';
                        let bottom = data.padding_bottom || '0';
                        let left = data.padding_left || '0';
                        paddingValue = `${top} ${right} ${bottom} ${left}`;
                    }

                    // Main Interactive Container
                    this.node = document.createElement('div');
                    this.node.className = 'tool widget custom_checkbox';
                    this.node.tabIndex = 0;
                    this.node.setAttribute('role', 'checkbox');
                    Object.assign(this.node.style, {
                        display: 'flex',
                        alignItems: 'center',
                        height: '30px',
                        padding: paddingValue,
                        boxSizing: 'border-box',
                        width: '100%',
                        cursor: 'pointer',
                        userSelect: 'none'
                    });

                    // Native Tooltip (Description)
                    if (data.description) {
                        this.node.title = typeof tl !== 'undefined' ? tl(data.description) : data.description;
                    }
                    if (data.label) {
                        this.node.setAttribute('aria-label', typeof tl !== 'undefined' ? tl(data.label) : data.label);
                    }

                    // Create the icon and label nodes.
                    this.icon_wrapper = document.createElement('div');
                    Object.assign(this.icon_wrapper.style, {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: '0',
                        // Slightly larger than the icon to prevent cropping during bounce animation
                        width: `calc(${this.icon_size} + 10px)`,
                        height: `calc(${this.icon_size} + 10px)`,
                        backgroundColor: this.value ? this.background_on : this.background_off,
                        borderRadius: (this.background_on !== 'transparent' || this.background_off !== 'transparent') ? '4px' : '0',
                        transition: 'background-color 0.25s ease'
                    });

                    this.icon_node = document.createElement('i');
                    Object.assign(this.icon_node.style, {
                        fontSize: this.icon_size,
                        lineHeight: '1', // Prevents font ascender/descender clipping
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transformOrigin: 'center', // Perfect center scaling
                        transition: 'color 0.25s ease, transform 0.15s cubic-bezier(0.2, 1.5, 0.4, 1)'
                    });

                    this.icon_wrapper.append(this.icon_node);

                    this.label_node = document.createElement('span');
                    Object.assign(this.label_node.style, {
                        fontSize: '13px',
                        color: this.label_color,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        flexShrink: '1'
                    });

                    if (data.label) {
                        this.label_node.innerText = typeof tl !== 'undefined' ? tl(data.label) : data.label;
                    }

                    this.label_container = document.createElement('span');
                    Object.assign(this.label_container.style, {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '7px',
                        minWidth: '0',
                        flex: data.separator ? '1 1 auto' : '0 1 auto'
                    });
                    if (data.label_icon) {
                        const labelIcon = Blockbench.getIconNode(data.label_icon);
                        labelIcon.style.color = data.label_icon_color || this.icon_color_on;
                        labelIcon.style.fontSize = data.label_icon_size || '17px';
                        labelIcon.style.flex = '0 0 auto';
                        labelIcon.setAttribute('aria-hidden', 'true');
                        this.label_container.append(labelIcon);
                    }
                    this.label_container.append(this.label_node);
                    if (data.summary !== undefined && data.summary !== null && data.summary !== '') {
                        this.summary_node = document.createElement('span');
                        this.summary_node.className = 'light_manager_group_summary';
                        this.summary_node.textContent = typeof data.summary === 'function'
                            ? String(data.summary())
                            : String(data.summary);
                        this.summary_node.title = this.summary_node.textContent;
                        this.label_container.append(this.summary_node);
                    }
                    if (data.modified !== undefined) {
                        this.modified_node = document.createElement('span');
                        this.modified_node.className = 'light_manager_modified_dot';
                        this.modified_node.setAttribute('aria-label', typeof tl === 'function'
                            ? tl(data.modified_label || 'Modified settings')
                            : (data.modified_label || 'Modified settings'));
                        this.modified_node.title = this.modified_node.getAttribute('aria-label');
                        this.modified_node.style.setProperty('--light-manager-modified-color', data.modified_color || data.label_icon_color || 'var(--color-accent)');
                        this.label_container.append(this.modified_node);
                        this.updateMetadata = result => {
                            let modified = data.modified;
                            try {
                                if (typeof modified === 'function') modified = modified(result || this.form?.getResult?.() || {}, this);
                            } catch (error) {
                                modified = false;
                            }
                            modified = !!modified;
                            this.modified_node.hidden = !modified;
                            this.node.classList.toggle('light_manager_group_modified', modified);
                        };
                        this.updateMetadata();
                        ensureLightManagerFormStateBridge(this.form).updaters.set(`${this.id}:metadata`, ({ result }) => {
                            this.updateMetadata?.(result);
                        });
                    }
                    if (data.active !== undefined) {
                        this.node.classList.toggle('light_manager_group_active', !!data.active);
                    }
                    if (data.separator) {
                        this.separator_node = document.createElement('span');
                        this.separator_node.className = 'light_manager_control_separator';
                        this.separator_node.setAttribute('aria-hidden', 'true');
                        Object.assign(this.separator_node.style, {
                            height: '1px',
                            flex: '1 1 12px',
                            minWidth: '12px',
                            background: data.separator_color || 'color-mix(in srgb, var(--color-border) 62%, transparent)',
                            pointerEvents: 'none'
                        });
                        this.label_container.append(this.separator_node);
                    }

                    // Apply the requested layout.
                    if (this.layout === 'icon_left') {
                        this.node.style.justifyContent = 'flex-start';
                        this.node.style.gap = '8px';
                        this.node.append(this.icon_wrapper, this.label_container);

                    } else if (this.layout === 'icon_right') {
                        this.node.style.justifyContent = 'flex-start';
                        this.node.style.gap = '8px';
                        this.node.append(this.label_container, this.icon_wrapper);

                    } else if (this.layout === 'space_between') {
                        this.node.style.justifyContent = 'space-between';
                        this.node.append(this.label_container, this.icon_wrapper);
                    }

                    bar.append(this.node);

                    // Click Event Listener
                    this.node.addEventListener('click', event => {
                        if (this.is_disabled) return;
                        this.onBefore?.(event);
                        try {
                            this.setValue(!this.value);
                        } finally {
                            this.onAfter?.(event);
                        }
                    });
                    this.node.addEventListener('keydown', event => {
                        if (this.is_disabled) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            this.onBefore?.(event);
                            try {
                                this.setValue(!this.value);
                            } finally {
                                this.onAfter?.(event);
                            }
                        }
                    });

                    // Apply initial visual state
                    this.updateVisuals(false);
                }

                updateVisuals(animate = true) {
                    const currentIcon = this.value ? this.icon_on : this.icon_off;
                    const currentColor = this.value ? this.icon_color_on : this.icon_color_off;
                    const currentBackground = this.value ? this.background_on : this.background_off;
                    this.node.setAttribute('aria-checked', this.value ? 'true' : 'false');

                    // Reset classes
                    this.icon_node.className = '';
                    this.icon_node.innerText = '';

                    // Detect FontAwesome vs Material Icons
                    const isFa = /^(fa-|fas |fab |far )/.test(currentIcon);

                    if (isFa) {
                        this.icon_node.className = `fa ${currentIcon}`;
                    } else {
                        this.icon_node.className = 'material-icons';
                        this.icon_node.innerText = currentIcon;
                    }

                    this.icon_node.style.color = currentColor;
                    this.icon_wrapper.style.backgroundColor = currentBackground;
                    this.icon_wrapper.style.borderRadius = (this.background_on !== 'transparent' || this.background_off !== 'transparent') ? '4px' : '0';

                    // Trigger scale "pop" animation
                    if (animate) {
                        this.icon_node.style.transform = 'scale(0.7)';
                        scheduleLightManagerTimeout(() => {
                            this.icon_node.style.transform = 'scale(1)';
                        }, 50); // Slight delay allows the browser to register the transform change
                    } else {
                        this.icon_node.style.transform = 'scale(1)';
                    }
                }

                getValue() {
                    return this.value;
                }

                setValue(val, dispatch = true) {
                    this.value = !!val; // Enforce boolean
                    this.updateVisuals(this.animate);
                    if (dispatch) this.change(); // Notify form of the change
                }

                getDefault() {
                    return false;
                }
            };

            // MARK: Panel Search
            // Shared, non-persistent filtering row for dense Lightflow inspectors.
            FormElement.types.panel_search = class FormElementPanelSearch extends FormElement {
                get uses_wide_inputs() { return true; }

                setup() {
                    const description = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = description;
                }

                build(bar) {
                    this.bar = bar;
                    bar.classList.add('full_width_dialog_bar', 'light_manager_panel_search_bar');
                    bar.style.padding = '0';
                    bar.style.background = 'transparent';
                    const data = this.options;
                    this.value = '';
                    this.filter_mode = 'all';

                    this.node = document.createElement('div');
                    this.node.className = 'light_manager_panel_search';
                    this.node.setAttribute('role', 'search');

                    const searchWrap = document.createElement('label');
                    searchWrap.className = 'light_manager_panel_search_input';
                    searchWrap.append(Blockbench.getIconNode('search'));
                    this.input = document.createElement('input');
                    this.input.type = 'text';
                    this.input.inputMode = 'search';
                    this.input.placeholder = !data.placeholder || ['Find setting', 'Search'].includes(data.placeholder) ? translateLightManager('light_manager.ui.search') : tl(data.placeholder);
                    this.input.setAttribute('aria-label', this.input.placeholder);
                    this.input.autocomplete = 'off';
                    searchWrap.append(this.input);

                    this.filter_select = new Interface.CustomElements.SelectInput(`lightflow_filter_${this.id}`, {
                        value: 'all',
                        options: {
                            all: translateLightManager('light_manager.ui.filter_all'),
                            active: translateLightManager('light_manager.ui.filter_active'),
                            modified: translateLightManager('light_manager.ui.filter_modified')
                        },
                        onInput: () => {
                            this.filter_mode = this.filter_select.node.getAttribute('value') || 'all';
                            this.form.update();
                        }
                    });
                    this.active_button = this.filter_select.node;
                    this.active_button.classList.remove('half');
                    this.active_button.style.width = '100%';
                    this.active_button.classList.add('light_manager_panel_search_active');
                    this.active_button.setAttribute('aria-label', translateLightManager('light_manager.ui.filter_label'));

                    this.collapse_button = document.createElement('button');
                    this.collapse_button.type = 'button';
                    this.collapse_button.className = 'light_manager_panel_search_collapse';
                    this.collapse_button.title = !data.collapse_label || data.collapse_label === 'Collapse all' ? translateLightManager('light_manager.ui.collapse') : tl(data.collapse_label);
                    this.collapse_button.setAttribute('aria-label', this.collapse_button.title);
                    
                    const collapse_icon_node = Blockbench.getIconNode('collapse_content');
                    collapse_icon_node.style.fontSize = '22px';
                    collapse_icon_node.style.paddingLeft = '2px'
                    this.collapse_button.append(collapse_icon_node);

                    this.node.append(searchWrap, this.active_button, this.collapse_button);
                    bar.append(this.node);
                    this.empty_node = document.createElement('div');
                    this.empty_node.className = 'lightflow_search_empty';
                    this.empty_node.setAttribute('role', 'status');
                    this.empty_node.textContent = translateLightManager('light_manager.ui.filter_empty');
                    this.empty_node.hidden = true;
                    bar.append(this.empty_node);

                    const applyFilter = () => {
                        if (!this.form?.node) return;
                        const elements = Object.values(this.form.form_data || {});
                        const start = elements.indexOf(this);
                        const candidates = elements.slice(start + 1).filter(element => element.bar && this.form.node.contains(element.bar) && !element.options?.search_ignore);
                        const result = this.form.getResult();
                        const filtering = !!this.value.trim() || this.filter_mode !== 'all';
                        const expanded = Object.assign({}, result);
                        candidates.forEach(element => {
                            if (element.options.variant === 'group') expanded[element.id] = true;
                        });
                        let parent = null;
                        let parentActive = false;
                        const rows = candidates.map(element => {
                            const options = element.options || {};
                            const group = options.variant === 'group';
                            if (group) {
                                parent = element.id;
                                parentActive = LightflowUIState.fieldState(options, element.getValue?.(), result).active;
                            }
                            let applicable = true;
                            try { applicable = Condition(element.condition, filtering ? expanded : result); } catch (_) { /* Keep the native fallback. */ }
                            const state = LightflowUIState.fieldState(options, element.getValue?.(), result);
                            if (!group && options.active === undefined && typeof element.getValue?.() !== 'boolean') state.active = parentActive;
                            try { if (options.disable || (options.disable_condition !== undefined && Condition(options.disable_condition, expanded))) state.active = false; } catch (_) {}
                            return Object.assign({
                                id: element.id, group, parent: group ? null : parent,
                                text: `${options.label || ''} ${options.description || ''} ${options.search_terms || ''} ${element.bar.textContent || ''} ${element.bar.title || ''}`,
                                applicable
                            }, state);
                        });
                        const shown = filtering ? LightflowUIState.filterRows(rows, this.value, this.filter_mode) : new Set(rows.filter(row => row.applicable).map(row => row.id));
                        candidates.forEach((element, index) => {
                            const visible = shown.has(element.id) && rows[index].applicable;
                            element.bar.classList.toggle('light_manager_panel_filter_hidden', !visible);
                            element.bar.style.display = visible ? '' : 'none';
                            if (rows[index].group) element.bar.classList.toggle('lightflow_search_expanded', filtering && visible);
                        });
                        this.active_button.classList.toggle('selected', this.filter_mode !== 'all');
                        this.empty_node.hidden = !filtering || shown.size > 0;
                        this.collapse_button.disabled = filtering;
                    };
                    this.applyFilter = applyFilter;
                    this.input.addEventListener('input', () => {
                        this.value = this.input.value;
                        this.form.update();
                    });
                    this.input.addEventListener('keydown', event => {
                        if (event.key !== 'Escape') return;
                        event.stopPropagation();
                        this.filter_mode = 'all';
                        this.filter_select.set('all');
                        this.setValue('');
                        this.form.update();
                    });
                    this.collapse_button.addEventListener('click', () => {
                        const changedKeys = [];
                        Object.values(this.form?.form_data || {}).forEach(element => {
                            if (element === this || element?.options?.variant !== 'group' || element.getValue?.() === false) return;
                            element.setValue?.(false);
                            changedKeys.push(element.id);
                        });
                        if (changedKeys.length) this.form.updateValues({ cause: 'input', changed_keys: changedKeys });
                    });
                }

                getValue() { return this.value; }
                setValue(value) {
                    this.value = String(value || '');
                    if (this.input) this.input.value = this.value;
                    this.applyFilter?.();
                }
                getDefault() { return ''; }
            };

            /**
             * Toggle action with the native optional side menu plus a reusable
             * FormElement descriptor. The same action instance can therefore
             * live in a toolbar, a menu, and a Light Manager-designed form.
             */
            class LightManagerActionToggle extends Toggle {
                asFormElement(options = {}) {
                    return Object.assign({
                        type: 'action_toggle',
                        action: this,
                        value: this.value,
                        icon_on: this.icon,
                        icon_off: this.icon
                    }, options);
                }
            }

            const resolveFormActionToggle = data => {
                const candidate = typeof data?.action === 'string'
                    ? BarItems[data.action]
                    : data?.action;
                return candidate instanceof Toggle ? candidate : null;
            };

            // MARK: Custom Action Toggle
            FormElement.types.action_toggle = class FormElementActionToggle extends FormElement {
                get uses_wide_inputs() { return true; }

                setup() {
                    let tempDesc = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = tempDesc;
                }

                build(bar) {
                    this.bar = bar;
                    bar.classList.add('full_width_dialog_bar');

                    bar.style.padding = '0';
                    bar.style.margin = '0';
                    bar.style.background = 'transparent';
                    bar.style.display = 'flex';
                    bar.style.alignItems = 'center';
                    bar.style.gap = '8px';

                    let data = this.options;
                    this.action = resolveFormActionToggle(data);
                    this.value = data.value !== undefined ? !!data.value : (data.default !== undefined ? !!data.default : false);
                    if (this.action) this.value = !!this.action.value;

                    this.icon_on = data.icon_on || 'check_box';
                    this.icon_off = data.icon_off || 'check_box_outline_blank';
                    this.bg_on = data.bg_on || 'var(--color-accent)';
                    this.bg_off = data.bg_off || 'transparent';
                    this.color_on = data.color_on || 'var(--color-light)';
                    this.color_off = data.color_off || 'var(--color-text)';

                    this.animate_click = data.animate !== false;
                    this.icon_size = data.icon_size || '18px';
                    this.button_size = data.button_size || '30px';

                    const hasLabel = !!data.label;
                    if (hasLabel) {
                        bar.style.width = '100%';
                        bar.style.justifyContent = 'space-between';

                        let labelWrapper = document.createElement('div');
                        labelWrapper.style = 'display: flex; align-items: center; gap: 4px; flex: 1 1 auto; min-width: 0;';

                        let labelElement = document.createElement('span');
                        labelElement.style = 'font-size: 13px; color: var(--color-subtle_text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
                        labelElement.innerText = typeof tl !== 'undefined' ? tl(data.label) : data.label;
                        labelWrapper.append(labelElement);

                        if (data.description) {
                            let infoIcon = document.createElement('i');
                            infoIcon.className = 'fa fa-question dialog_form_description';
                            infoIcon.style = 'font-size: 14px; cursor: help; margin: 0; color: var(--color-subtle_text);';
                            infoIcon.title = typeof tl !== 'undefined' ? tl(data.description) : data.description;
                            labelWrapper.append(infoIcon);
                        }
                        bar.append(labelWrapper);
                    } else {
                        bar.style.width = 'auto';
                        bar.style.justifyContent = 'flex-start';
                    }

                    this.toggle_btn = this.action ? this.action.getNode() : document.createElement('div');
                    this.toggle_btn.classList.add('tool', 'widget', 'action_toggle_btn');
                    this.toggle_btn.tabIndex = 0;
                    this.toggle_btn.setAttribute('role', 'switch');
                    Object.assign(this.toggle_btn.style, {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: this.action?.side_menu ? 'auto' : this.button_size,
                        minWidth: this.button_size,
                        height: this.button_size,
                        borderRadius: '2px',
                        cursor: 'pointer',
                        flexShrink: '0',
                        margin: '0',
                        position: 'relative', // Keep the tooltip positioned against this control.
                        transition: this.animate_click ? 'background 0.2s ease, color 0.2s ease' : 'none'
                    });

                    const tooltipText = data.title || data.description || data.label;
                    if (tooltipText) {
                        this.toggle_btn.title = typeof tl !== 'undefined' ? tl(tooltipText) : tooltipText;
                        this.toggle_btn.setAttribute('aria-label', typeof tl !== 'undefined' ? tl(tooltipText) : tooltipText);
                    }

                    this.icon_node = this.action
                        ? (this.toggle_btn.querySelector(':scope > .icon, :scope > .material-icons, :scope > i, :scope > svg') || document.createElement('i'))
                        : document.createElement('i');
                    Object.assign(this.icon_node.style, {
                        fontSize: this.icon_size,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: this.animate_click ? 'transform 0.15s cubic-bezier(0.2, 1.5, 0.4, 1)' : 'none'
                    });

                    if (!this.action) this.toggle_btn.append(this.icon_node);
                    bar.append(this.toggle_btn);

                    this.toggle_btn.addEventListener('click', event => {
                        if (this.is_disabled) return;
                        if (event.target?.closest?.('.action_more_options')) return;
                        if (this.action) {
                            queueMicrotask(() => {
                                const nextValue = !!this.action.value;
                                if (nextValue === this.value) return;
                                this.value = nextValue;
                                this.updateVisuals(false);
                                this.change();
                            });
                        } else {
                            this.setValue(!this.value);
                        }
                    });
                    this.toggle_btn.addEventListener('keydown', event => {
                        if (this.is_disabled) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            if (this.action) {
                                this.action.trigger(event);
                                this.value = !!this.action.value;
                                this.updateVisuals(false);
                                this.change();
                            } else {
                                this.setValue(!this.value);
                            }
                        }
                    });

                    this.updateVisuals(false);
                }

                updateVisuals(triggerAnimation = true) {
                    if (this.action) {
                        this.value = !!this.action.value;
                        this.action.updateEnabledState();
                        this.toggle_btn.setAttribute('aria-checked', this.value ? 'true' : 'false');
                        return;
                    }
                    const currentIcon = this.value ? this.icon_on : this.icon_off;
                    const currentBackground = this.value ? this.bg_on : this.bg_off;
                    const currentColor = this.value ? this.color_on : this.color_off;
                    this.toggle_btn.setAttribute('aria-checked', this.value ? 'true' : 'false');

                    this.toggle_btn.style.background = currentBackground;
                    this.icon_node.style.color = currentColor;

                    this.icon_node.className = '';
                    this.icon_node.innerText = '';

                    const isFa = /^(fa-|fas |fab |far )/.test(currentIcon);
                    if (isFa) {
                        this.icon_node.className = `fa ${currentIcon}`;
                    } else {
                        this.icon_node.className = 'material-icons';
                        this.icon_node.innerText = currentIcon;
                    }

                    if (this.animate_click && triggerAnimation) {
                        this.icon_node.style.transform = 'scale(0.6)';
                        scheduleLightManagerTimeout(() => {
                            this.icon_node.style.transform = 'scale(1)';
                        }, 50);
                    } else {
                        this.icon_node.style.transform = 'scale(1)';
                    }
                }

                getValue() { return this.action ? !!this.action.value : this.value; }
                setValue(val, dispatch = true) {
                    if (this.action) {
                        this.action.set(!!val);
                        this.value = !!this.action.value;
                    } else {
                        this.value = !!val;
                    }
                    this.updateVisuals(true);
                    if (dispatch) this.change();
                }
                getDefault() { return false; }
            };

            // MARK: Compact Action Button
            FormElement.types.action_button = class FormElementActionButton extends FormElement {
                get uses_wide_inputs() { return true; }

                setup() {
                    const description = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = description;
                }

                build(bar) {
                    this.bar = bar;
                    bar.classList.add('full_width_dialog_bar');

                    // Match the toggle's base bar styles.
                    bar.style.padding = '0';
                    bar.style.margin = '0';
                    bar.style.background = 'transparent';
                    bar.style.display = 'flex';
                    bar.style.alignItems = 'center';
                    bar.style.gap = '8px';

                    const data = this.options;
                    this.animate_click = data.animate !== false;
                    this.button_size = data.button_size || '30px';
                    this.icon_size = data.icon_size || '18px'; // Match the toggle's 18 px icon size.

                    const hasLabel = !!data.label;
                    if (hasLabel) {
                        bar.style.width = '100%';
                        bar.style.justifyContent = 'space-between';

                        let labelWrapper = document.createElement('div');
                        labelWrapper.style = 'display: flex; align-items: center; gap: 4px; flex: 1 1 auto; min-width: 0;';

                        let labelElement = document.createElement('span');
                        labelElement.style = 'font-size: 13px; color: var(--color-subtle_text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
                        labelElement.innerText = typeof tl !== 'undefined' ? tl(data.label) : data.label;
                        labelWrapper.append(labelElement);

                        if (data.description) {
                            let infoIcon = document.createElement('i');
                            infoIcon.className = 'fa fa-question dialog_form_description';
                            infoIcon.style = 'font-size: 14px; cursor: help; margin: 0; color: var(--color-subtle_text);';
                            infoIcon.title = typeof tl !== 'undefined' ? tl(data.description) : data.description;
                            labelWrapper.append(infoIcon);
                        }
                        bar.append(labelWrapper);
                    } else {
                        bar.style.width = 'auto';
                        bar.style.justifyContent = 'flex-start';
                    }

                    // Keep the legacy div option for existing forms, while allowing
                    // selected controls to opt into native button semantics.
                    this.node = document.createElement(data.semantic_button ? 'button' : 'div');
                    this.node.className = 'tool widget light_manager_action_button';
                    if (data.semantic_button) this.node.type = 'button';
                    this.node.tabIndex = 0;
                    this.node.setAttribute('role', 'button');

                    const tooltipText = data.title || data.description || data.label;
                    if (tooltipText) {
                        this.node.title = typeof tl !== 'undefined' ? tl(tooltipText) : tooltipText;
                        this.node.setAttribute('aria-label', typeof tl !== 'undefined' ? tl(tooltipText) : tooltipText);
                    }

                    Object.assign(this.node.style, {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: data.text ? '6px' : '0', // Set data.text to display text inside the button.
                        minWidth: this.button_size,
                        width: data.text ? 'auto' : this.button_size,
                        height: this.button_size,
                        padding: data.text ? '0 8px' : '0',
                        margin: '0',
                        border: 'none',
                        outline: 'none',
                        borderRadius: '2px',
                        boxSizing: 'border-box',
                        background: data.background || 'transparent',
                        color: data.color || 'var(--color-text)',
                        cursor: 'pointer',
                        flexShrink: '0',
                        position: 'relative',
                        transition: this.animate_click ? 'background 0.2s ease, color 0.2s ease' : 'none'
                    });

                    const icon = Blockbench.getIconNode(data.icon || 'tune');
                    Object.assign(icon.style, {
                        fontSize: this.icon_size,
                        color: data.icon_color || data.color || 'var(--color-text)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: this.animate_click ? 'transform 0.15s cubic-bezier(0.2, 1.5, 0.4, 1)' : 'none'
                    });
                    this.node.append(icon);

                    if (data.text) {
                        const textNode = document.createElement('span');
                        textNode.textContent = typeof tl !== 'undefined' ? tl(data.text) : data.text;
                        textNode.style.whiteSpace = 'nowrap';
                        this.node.append(textNode);
                    }

                    const trigger = event => {
                        if (this.is_disabled) return;

                        // Trigger the click animation.
                        if (this.animate_click) {
                            icon.style.transform = 'scale(0.6)';
                            scheduleLightManagerTimeout(() => {
                                icon.style.transform = 'scale(1)';
                            }, 50);
                        }

                        if (typeof data.click === 'function') data.click(event, this);
                    };

                    this.node.addEventListener('click', trigger);
                    this.node.addEventListener('keydown', event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            trigger(event);
                        }
                    });
                    bar.append(this.node);
                }

                getValue() { return undefined; }
                setValue() { }
                getDefault() { return undefined; }
            };

            // MARK: Custom Vector
            FormElement.types.custom_vector = class FormElementCustomVector extends FormElement {
                get uses_wide_inputs() { return true; }

                setup() {
                    // Own the help icon placement so it sits natively beside the title.
                    let tempDesc = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = tempDesc;
                }

                build(bar) {
                    this.bar = bar;
                    bar.classList.add('full_width_dialog_bar');
                    bar.style.padding = '0';
                    bar.style.background = 'transparent';
                    bar.style.display = 'flex';
                    bar.style.flexDirection = 'column';

                    let data = this.options;
                    this.onBefore = typeof data.onBefore === 'function' ? data.onBefore : null;
                    this.onAfter = typeof data.onAfter === 'function' ? data.onAfter : null;
                    this.dimensions = data.dimensions || 3;
                    const translatedLabel = data.label
                        ? (typeof tl !== 'undefined' ? tl(data.label) : data.label)
                        : 'Vector';
                    const getDefaultVector = () => {
                        const source = Array.isArray(data.default)
                            ? data.default
                            : new Array(this.dimensions).fill(data.default !== undefined ? data.default : 0);
                        return new Array(this.dimensions).fill(0).map((_, index) => {
                            const value = parseFloat(source[index]);
                            return Number.isFinite(value) ? value : 0;
                        });
                    };

                    // Initialize values and parse them safely as floats.
                    this.value = Array.isArray(data.value) ? data.value.slice() : new Array(this.dimensions).fill(0);
                    if (!data.value && Array.isArray(data.default)) {
                        this.value = data.default.slice();
                    }

                    for (let i = 0; i < this.dimensions; i++) {
                        this.value[i] = parseFloat(this.value[i]) || 0;
                    }

                    let molangParseFailureReported = false;
                    const parseNumericInput = (text, currentValue) => {
                        const numericValue = parseFloat(text);
                        if (!Number.isNaN(numericValue)) return numericValue;
                        if (typeof NumSlider === 'undefined' || !NumSlider.MolangParser) return 0;

                        try {
                            return NumSlider.MolangParser.parse(text, { val: currentValue, n: 0 });
                        } catch (error) {
                            if (!molangParseFailureReported) {
                                console.warn('[Light Manager] Could not parse a vector input as Molang.', error);
                                molangParseFailureReported = true;
                            }
                            return 0;
                        }
                    };

                    const axes = [
                        { name: 'X', key: 'x', color: 'x', css: 'var(--color-axis-x)' },
                        { name: 'Y', key: 'y', color: 'y', css: 'var(--color-axis-y)' },
                        { name: 'Z', key: 'z', color: 'z', css: 'var(--color-axis-z)' },
                        { name: 'W', key: 'w', color: 'w', css: 'var(--color-axis-w, var(--color-text))' }
                    ];

                    const showAxisLabels = data.axis_labels === true;
                    let hasAnyRange = false;
                    for (let i = 0; i < this.dimensions; i++) {
                        let axis = axes[i] || { key: String(i) };
                        let cConfig = (data.ranges && data.ranges[axis.key]) ? data.ranges[axis.key] : {};

                        let minCheck = cConfig.min !== undefined ? cConfig.min : (Array.isArray(data.min) ? data.min[i] : data.min);
                        let maxCheck = cConfig.max !== undefined ? cConfig.max : (Array.isArray(data.max) ? data.max[i] : data.max);

                        if (minCheck !== undefined && maxCheck !== undefined) {
                            hasAnyRange = true;
                            break;
                        }
                    }

                    // Title and reset button.
                    let labelWrapper = document.createElement('div');
                    labelWrapper.className = 'light_manager_vector_header';
                    labelWrapper.style = 'margin-bottom: 3px; display: flex; align-items: center; gap: 7px; width: 100%; min-width: 0; height: 24px;';

                    let titleGroup = document.createElement('div');
                    titleGroup.style = 'display: flex; align-items: center; min-width: 0; flex: 0 1 auto; height: 24px;';

                    if (data.label) {
                        let labelElement = document.createElement('span');
                        // Match combo_slider label color.
                        labelElement.style = 'font-size: 13px; color: var(--color-subtle_text); display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
                        labelElement.innerText = translatedLabel;
                        if (data.description) {
                            labelElement.title = typeof tl !== 'undefined' ? tl(data.description) : data.description;
                            labelElement.style.cursor = 'help';
                        }
                        titleGroup.append(labelElement);
                    }

                    labelWrapper.append(titleGroup);

                    const headerSeparator = document.createElement('span');
                    headerSeparator.className = 'light_manager_control_separator';
                    headerSeparator.setAttribute('aria-hidden', 'true');
                    headerSeparator.style = `height: 1px; flex: 1 1 12px; min-width: 12px; background: ${data.separator_color || 'color-mix(in srgb, var(--color-border) 62%, transparent)'}; pointer-events: none;`;
                    labelWrapper.append(headerSeparator);

                    let resetBtn = null;
                    let updateResetButtonVisibility = () => {
                        const defaultArr = getDefaultVector();
                        const isChanged = this.value.some((value, index) => {
                            const current = parseFloat(value) || 0;
                            const expected = defaultArr[index];
                            const epsilon = Math.max(1e-6, Math.abs(expected) * 1e-6);
                            return Math.abs(current - expected) > epsilon;
                        });

                        if (resetBtn) {
                            const visible = data.resettable !== false && isChanged;
                            resetBtn.style.display = visible ? 'flex' : 'none';
                            resetBtn.tabIndex = visible ? 0 : -1;
                            resetBtn.setAttribute('aria-hidden', visible ? 'false' : 'true');
                        }
                    };

                    if (data.resettable !== false) {
                        resetBtn = document.createElement('i');
                        resetBtn.className = 'material-icons icon';
                        resetBtn.innerText = 'replay';
                        resetBtn.title = typeof tl !== 'undefined' ? tl('generic.reset') : 'Reset';
                        resetBtn.setAttribute('role', 'button');
                        resetBtn.setAttribute('aria-label', `${resetBtn.title} ${translatedLabel}`);
                        // Match the icon size and spacing used by the other controls.
                        resetBtn.style = 'font-size: 18px; width: 28px; height: 24px; padding: 0; color: var(--color-subtle_text); cursor: pointer; display: none; align-items: center; justify-content: center; flex: 0 0 28px;';
                        resetBtn.onclick = event => commitVectorChange(() => this.setValue(getDefaultVector()), event);
                        resetBtn.addEventListener('keydown', event => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            resetBtn.click();
                        });
                        this.reset_button = resetBtn;
                        labelWrapper.append(resetBtn);
                    }

                    this.updateResetButtonVisibility = updateResetButtonVisibility;

                    bar.append(labelWrapper);

                    // Input container.
                    this.inputs_container = document.createElement('div');
                    this.inputs_container.style = hasAnyRange
                        ? 'display: flex; flex-direction: column; gap: 4px; width: 100%;'
                        : 'display: flex; flex-direction: row; gap: 4px; width: 100%; height: 28px;';

                    bar.append(this.inputs_container);
                    this.inputs = [];
                    this.native_vector_sliders = [];

                    for (let i = 0; i < this.dimensions; i++) {
                        let axis = axes[i] || { name: String(i), key: String(i), color: '', css: 'var(--color-text)' };
                        let val = parseFloat(this.value[i]) || 0;

                        let cConfig = (data.ranges && data.ranges[axis.key]) ? data.ranges[axis.key] : {};

                        let minVal = cConfig.min !== undefined ? cConfig.min : (Array.isArray(data.min) ? data.min[i] : data.min);
                        let maxVal = cConfig.max !== undefined ? cConfig.max : (Array.isArray(data.max) ? data.max[i] : data.max);
                        let stepVal = cConfig.step !== undefined ? cConfig.step : (data.step !== undefined ? data.step : (data.integer ? 1 : 0.1));

                        let allowLower = cConfig.allow_lower !== undefined ? cConfig.allow_lower : (Array.isArray(data.allow_lower) ? data.allow_lower[i] : !!data.allow_lower);
                        let allowHigher = cConfig.allow_higher !== undefined ? cConfig.allow_higher : (cConfig.allow_greater !== undefined ? cConfig.allow_greater : (Array.isArray(data.allow_higher) ? data.allow_higher[i] : !!data.allow_higher));

                        const isRange = minVal !== undefined && maxVal !== undefined;

                        // Row wrapper, used only when the vector has at least one slider.
                        let rowContainer = null;
                        if (hasAnyRange || showAxisLabels) {
                            rowContainer = document.createElement('div');
                            rowContainer.style = hasAnyRange
                                ? 'display: flex; flex-direction: row; align-items: center; height: 30px; width: 100%; box-sizing: border-box;'
                                : 'display: flex; flex: 1 1 0; flex-direction: row; align-items: center; height: 30px; min-width: 0; width: auto; box-sizing: border-box;';

                            let axisLabel = document.createElement('span');
                            axisLabel.style = `margin-right: 5px; font-size: 13px; color: ${axis.css}; font-weight: bold; white-space: nowrap; display: flex; align-items: center; width: 14px; justify-content: center; font-family: monospace;`;
                            axisLabel.innerText = axis.name;
                            rowContainer.append(axisLabel);
                        }

                        if (isRange) {
                            // Combo-slider style mode.
                            let sliderInitVal = val;
                            if (!allowLower && sliderInitVal < minVal) sliderInitVal = minVal;
                            if (!allowHigher && sliderInitVal > maxVal) sliderInitVal = maxVal;

                            let rangeInput = Interface.createElement('input', {
                                type: 'range',
                                value: sliderInitVal,
                                min: minVal,
                                max: maxVal,
                                step: stepVal,
                                class: 'tool disp_range',
                                style: `margin: 0; flex: 1 1 auto; width: 100%; min-width: 30px; transition: opacity 0.2s, filter 0.2s; --color-thumb: ${axis.css};`
                            });
                            rangeInput.setAttribute('aria-label', `${translatedLabel} ${axis.name}`);

                            let numberInputAttrs = {
                                type: 'number',
                                value: val,
                                step: stepVal,
                                class: 'dark_bordered focusable_input',
                                style: `width: 100%; min-width: 45px; height: 24px; box-sizing: border-box; text-align: center; margin: 0; padding: 0 2px; flex: 0 0 auto;`
                            };
                            if (!allowLower) numberInputAttrs.min = minVal;
                            if (!allowHigher) numberInputAttrs.max = maxVal;

                            let numberInput = Interface.createElement('input', numberInputAttrs);
                            numberInput.setAttribute('aria-label', `${translatedLabel} ${axis.name} value`);

                            let numberContainer = Interface.createElement('div', {
                                class: 'numeric_input tool disp_text',
                                style: `display: flex; align-items: center; margin: 0; flex: 0 0 auto;`
                            }, [numberInput]);

                            let comboWrapper = Interface.createElement('div', {
                                class: 'bar slider_input_combo',
                                style: `display: flex; align-items: center; height: 100%; margin: 0; flex: 1 1 auto; min-width: 0; width: auto;`
                            }, [rangeInput, numberContainer]);

                            if (rowContainer) {
                                rowContainer.append(comboWrapper);
                                this.inputs_container.append(rowContainer);
                            }

                            // combo_slider-style out-of-range visuals.
                            let updateVisuals = (currentVal) => {
                                let isOutOfBounds = false;
                                if (allowLower && currentVal < minVal) isOutOfBounds = true;
                                if (allowHigher && currentVal > maxVal) isOutOfBounds = true;

                                if (isOutOfBounds) {
                                    rangeInput.style.opacity = '0.3';
                                    rangeInput.style.filter = 'grayscale(100%)';
                                } else {
                                    rangeInput.style.opacity = '1';
                                    rangeInput.style.filter = 'none';
                                }
                            };
                            updateVisuals(val);

                            let sync = (e) => {
                                let num = parseFloat(e.target.value);
                                if (isNaN(num)) {
                                    if (e.target.value === "" || e.target.value === "-") return;
                                    num = 0;
                                }
                                if (data.integer) num = Math.round(num);

                                let clampedNum = num;
                                if (!allowLower && clampedNum < minVal) clampedNum = minVal;
                                if (!allowHigher && clampedNum > maxVal) clampedNum = maxVal;

                                let sliderNum = clampedNum;
                                if (sliderNum < minVal) sliderNum = minVal;
                                if (sliderNum > maxVal) sliderNum = maxVal;

                                rangeInput.value = sliderNum;
                                if (e.target === rangeInput || num !== clampedNum) {
                                    numberInput.value = clampedNum;
                                }

                                let finalVal = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(parseFloat(clampedNum) || 0) : parseFloat(clampedNum);
                                this.value[i] = finalVal;
                                updateVisuals(clampedNum);
                                this.change();
                                this.updateResetButtonVisibility();
                            };

                            let rangeEditActive = false;
                            let numberEditActive = false;
                            $(rangeInput).on('mousedown touchstart', event => {
                                if (rangeEditActive) return;
                                rangeEditActive = true;
                                this.onBefore?.(event.originalEvent);
                            });
                            $(rangeInput).on('input', sync);
                            $(rangeInput).on('change mouseup touchend', event => {
                                if (!rangeEditActive) return;
                                rangeEditActive = false;
                                this.onAfter?.(event.originalEvent);
                            });
                            $(numberInput).on('focus', event => {
                                if (numberEditActive) return;
                                numberEditActive = true;
                                this.onBefore?.(event.originalEvent);
                            });
                            $(numberInput).on('input', sync);
                            $(numberInput).on('blur', (e) => {
                                let num = parseFloat(e.target.value);
                                if (isNaN(num)) num = 0;
                                if (data.integer) num = Math.round(num);

                                let clampedNum = num;
                                if (!allowLower && clampedNum < minVal) clampedNum = minVal;
                                if (!allowHigher && clampedNum > maxVal) clampedNum = maxVal;

                                e.target.value = clampedNum;
                                this.value[i] = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(parseFloat(clampedNum) || 0) : clampedNum;
                                updateVisuals(clampedNum);
                                this.change();
                                if (numberEditActive) {
                                    numberEditActive = false;
                                    this.onAfter?.(e.originalEvent);
                                }
                            });

                            this.inputs.push({
                                is_custom: true,
                                range: rangeInput,
                                number: numberInput,
                                min: minVal,
                                max: maxVal,
                                allowLower,
                                allowHigher,
                                updateVisuals
                            });

                            // Context menu for combo slider inputs
                            const showContextMenu = (event) => {
                                event.preventDefault();
                                if (typeof Menu !== 'undefined') {
                                    new Menu([
                                        '_',
                                        {
                                            id: 'copy',
                                            name: 'action.copy',
                                            icon: 'content_copy',
                                            click: () => {
                                                if (typeof Clipbench !== 'undefined') Clipbench.setText(this.value[i].toString());
                                            }
                                        },
                                        {
                                            id: 'copy_vector',
                                            name: 'menu.text_edit.copy_vector',
                                            icon: 'content_copy',
                                            condition: () => this.dimensions > 1,
                                            click: () => {
                                                let text = this.value.map(v => typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(v) : v).join(' ');
                                                if (typeof Clipbench !== 'undefined') Clipbench.setText(text);
                                            }
                                        },
                                        {
                                            id: 'paste',
                                            name: 'action.paste',
                                            icon: 'content_paste',
                                            click: async () => {
                                                let text = await navigator.clipboard.readText();
                                                let components = text.split(/\s+/g);
                                                if (components.length === this.dimensions) {
                                                    let vec = components.map(c => {
                                                        let num = parseFloat(c);
                                                        return isNaN(num) ? 0 : num;
                                                    });
                                                    commitVectorChange(() => this.setValue(vec));
                                                } else {
                                                    const num = parseNumericInput(text, parseFloat(this.value[i]) || 0);
                                                    let newValue = this.value.slice();
                                                    newValue[i] = num;
                                                    commitVectorChange(() => this.setValue(newValue));
                                                }
                                            }
                                        },
                                        '_',
                                        {
                                            id: 'round',
                                            name: 'menu.slider.round_value',
                                            icon: 'percent',
                                            click: () => {
                                                const oldValue = parseFloat(this.value[i]) || 0;
                                                const rounded = Math.round(oldValue);
                                                let newValue = this.value.slice();
                                                newValue[i] = rounded;
                                                commitVectorChange(() => this.setValue(newValue));
                                            }
                                        },
                                        {
                                            id: 'reset_vector',
                                            name: 'menu.slider.reset_vector',
                                            icon: 'replay',
                                            condition: () => this.dimensions > 1,
                                            click: () => {
                                                let defaultArr = Array.isArray(data.default) ? data.default : new Array(this.dimensions).fill(0);
                                                commitVectorChange(() => this.setValue(defaultArr));
                                            }
                                        }
                                    ]).open(event);
                                }
                            };

                            rangeInput.addEventListener('contextmenu', showContextMenu);
                            numberInput.addEventListener('contextmenu', showContextMenu);

                        } else {
                            // Use Blockbench's real NumSlider whenever it is available. Besides
                            // matching the native visuals, this preserves its pointer-lock drag,
                            // modifier sensitivity, direct editing and vector paste behavior.
                            if (typeof NumSlider !== 'undefined') {
                                let nativeSlider = null;
                                const defaultValue = getDefaultVector()[i];
                                const nativeGetInterval = event => {
                                    if (event && event.ctrlOrCmd && event.shiftKey) return stepVal * 0.025;
                                    if (event && event.ctrlOrCmd) return stepVal * 0.1;
                                    if (event && event.shiftKey) return stepVal * 0.25;
                                    return stepVal;
                                };
                                const updateNativeSliderValue = (num, dispatch = true) => {
                                    num = parseFloat(num);
                                    if (isNaN(num)) num = 0;
                                    if (data.integer) num = Math.round(num);

                                    const trimmed = typeof trimFloatNumber !== 'undefined'
                                        ? trimFloatNumber(num)
                                        : num;
                                    this.value[i] = trimmed;
                                    if (nativeSlider) {
                                        nativeSlider.setValue(trimmed, false);
                                        nativeSlider.jq_inner.attr('aria-valuenow', String(trimmed));
                                    }
                                    if (dispatch) this.change();
                                    if (this.updateResetButtonVisibility) this.updateResetButtonVisibility();
                                };

                                nativeSlider = new NumSlider(`light_manager_vector_${this.id}_${axis.key}_${guid()}`, {
                                    private: true,
                                    name: `${translatedLabel} ${axis.name}`,
                                    description: data.description || '',
                                    color: axis.color,
                                    sensitivity: data.sensitivity || 30,
                                    settings: {
                                        default: defaultValue,
                                        step: stepVal
                                    },
                                    getInterval: nativeGetInterval,
                                    onBefore: () => this.onBefore?.(),
                                    onAfter: () => this.onAfter?.(),
                                    change: modify => {
                                        const current = parseFloat(this.value[i]) || 0;
                                        updateNativeSliderValue(modify(current));
                                    }
                                });
                                nativeSlider.setValue(val, false);
                                nativeSlider.node.querySelector(':scope > .tooltip')?.remove();
                                nativeSlider.node.style.flex = '1 1 0';
                                nativeSlider.node.style.minWidth = '0';
                                nativeSlider.node.style.width = 'auto';
                                nativeSlider.node.style.height = '28px';
                                nativeSlider.node.style.borderRadius = '4px';
                                nativeSlider.node.style.overflow = 'hidden';
                                nativeSlider.node.title = `${translatedLabel} ${axis.name}`;
                                nativeSlider.jq_inner.attr({
                                    role: 'spinbutton',
                                    'aria-label': `${translatedLabel} ${axis.name}`,
                                    'aria-valuenow': String(val)
                                });
                                nativeSlider.jq_inner.css({
                                    'font-size': '13px',
                                    'line-height': '28px'
                                });

                                if (rowContainer) {
                                    rowContainer.append(nativeSlider.getNode());
                                    this.inputs_container.append(rowContainer);
                                } else {
                                    this.inputs_container.append(nativeSlider.getNode());
                                }
                                this.native_vector_sliders.push(nativeSlider);
                                this.inputs.push({
                                    is_custom: false,
                                    native_slider: nativeSlider,
                                    updateCustomSliderValue: updateNativeSliderValue
                                });
                                continue;
                            }

                            // Manual safe NumSlider mode.
                            let numSliderNode = document.createElement('div');
                            numSliderNode.className = 'tool wide widget nslide_tool';
                            numSliderNode.setAttribute('aria-label', `${translatedLabel} ${axis.name}`);
                            numSliderNode.title = `${translatedLabel} ${axis.name}`;

                            if (axis.color) {
                                const cssColor = 'uvwxyz'.includes(axis.color.toString()) ? `var(--color-axis-${axis.color})` : axis.color;
                                numSliderNode.style.setProperty('--corner-color', cssColor);
                                numSliderNode.classList.add('is_colored');
                            }

                            let nslideInner = document.createElement('div');
                            nslideInner.className = 'nslide tab_target';
                            nslideInner.setAttribute('inputmode', 'decimal');
                            nslideInner.setAttribute('role', 'spinbutton');
                            nslideInner.setAttribute('aria-label', `${translatedLabel} ${axis.name}`);
                            nslideInner.setAttribute('aria-valuenow', String(val));
                            nslideInner.innerText = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(parseFloat(val) || 0) : val;
                            nslideInner.style.fontSize = '13px';
                            nslideInner.style.lineHeight = '28px';
                            numSliderNode.append(nslideInner);

                            const $outer = $(numSliderNode);
                            const $inner = $(nslideInner);

                            let defaultVal = data.default ? (Array.isArray(data.default) ? data.default[i] : data.default) : 0;
                            let sensitivity = 30;

                            let getInterval = (e) => {
                                let interval = stepVal;
                                if (e && !e.shiftKey && !e.ctrlOrCmd) return interval;
                                if (e && e.ctrlOrCmd && e.shiftKey) return interval * 0.025;
                                if (e && e.ctrlOrCmd) return interval * 0.1;
                                if (e && e.shiftKey) return interval * 0.25;
                                return interval;
                            };

                            let updateCustomSliderValue = (num, dispatch = true) => {
                                num = parseFloat(num);
                                if (isNaN(num)) num = 0;
                                if (data.integer) num = Math.round(num);

                                // Safe float to prevent the "i.toFixed is not a function" error.
                                let trimmed = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(num) : num;
                                this.value[i] = trimmed;
                                nslideInner.innerText = trimmed;
                                nslideInner.setAttribute('aria-valuenow', String(trimmed));
                                if (dispatch) this.change();
                                if (this.updateResetButtonVisibility) this.updateResetButtonVisibility();
                            };

                            let lastValue = val;

                            $inner.on('mousedown touchstart', async (event) => {
                                if ($inner.hasClass('editing')) return;
                                lastValue = parseFloat(this.value[i]) || 0;

                                const dragEvent = await new Promise((resolve) => {
                                    let releaseDragProbe;
                                    function move(e2) {
                                        if (!e2.clientX || Math.abs(e2.clientX - event.clientX) > 2) {
                                            releaseDragProbe();
                                            resolve(e2);
                                        }
                                    }
                                    function stop(e2) {
                                        releaseDragProbe();
                                        if (event.target == e2.target) startInput();
                                        resolve(false);
                                    }
                                    document.addEventListener('mousemove', move);
                                    document.addEventListener('touchmove', move);
                                    document.addEventListener('mouseup', stop);
                                    document.addEventListener('touchend', stop);
                                    releaseDragProbe = trackDocumentInteraction(() => {
                                        document.removeEventListener('mousemove', move);
                                        document.removeEventListener('touchmove', move);
                                        document.removeEventListener('mouseup', stop);
                                        document.removeEventListener('touchend', stop);
                                        resolve(false);
                                    });
                                });

                                if (!dragEvent) return;

                                if (typeof convertTouchEvent !== 'undefined') convertTouchEvent(dragEvent);
                                this.onBefore?.(dragEvent);
                                let clientX = dragEvent.clientX;
                                let pre = 0;
                                const slidingStartPosition = clientX;
                                let moveCalls = 0;

                                if (!('touches' in dragEvent)) $inner.get(0).requestPointerLock();

                                let move = (e) => {
                                    if (typeof convertTouchEvent !== 'undefined') convertTouchEvent(e);
                                    if (dragEvent && 'touches' in dragEvent) {
                                        clientX = e.clientX;
                                    } else {
                                        const limit = moveCalls <= 2 ? 1 : 160;
                                        clientX += Math.clamp(e.movementX, -limit, limit);
                                    }

                                    let offset = Math.round((clientX - slidingStartPosition) / sensitivity);
                                    let difference = (offset - pre) * getInterval(e);
                                    pre = offset;

                                    if (difference) {
                                        const oldValue = parseFloat(this.value[i]) || 0;
                                        updateCustomSliderValue(oldValue + difference);

                                        const newValue = parseFloat(this.value[i]) || 0;
                                        const displayOffset = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(newValue - lastValue) : (newValue - lastValue);
                                        if (typeof Blockbench !== 'undefined' && !Blockbench.isMobile) {
                                            Blockbench.setStatusBarText(displayOffset);
                                        }
                                    }
                                    moveCalls++;
                                };

                                let releaseSliderDrag;
                                let stop = () => {
                                    releaseSliderDrag();
                                };
                                document.addEventListener('mousemove', move);
                                document.addEventListener('touchmove', move);
                                document.addEventListener('mouseup', stop);
                                document.addEventListener('touchend', stop);
                                releaseSliderDrag = trackDocumentInteraction(() => {
                                    document.removeEventListener('mousemove', move);
                                    document.removeEventListener('touchmove', move);
                                    document.removeEventListener('mouseup', stop);
                                    document.removeEventListener('touchend', stop);
                                    if (document.pointerLockElement) document.exitPointerLock();
                                    if (typeof Blockbench !== 'undefined') Blockbench.setStatusBarText();
                                    this.onAfter?.();
                                });
                            });

                            let startInput = () => {
                                this.onBefore?.();
                                $inner.find('.nslide_arrow').remove();
                                $inner.attr('contenteditable', 'true');
                                $inner.addClass('editing');
                                $inner.focus();
                                document.execCommand('selectAll');
                            };

                            let stopInput = () => {
                                if (!$inner.hasClass('editing')) return;
                                let text = $inner.text();

                                if (lastValue.toString() !== text) {
                                    if (text.split(/\s+/g).length === this.dimensions) {
                                        let components = text.split(/\s+/g);
                                        components.forEach((inputStr, axisIndex) => {
                                            let number = parseFloat(inputStr);
                                            if (isNaN(number)) number = 0;

                                            let targetInput = this.inputs[axisIndex];
                                            if (targetInput) {
                                                if (targetInput.is_custom) {
                                                    let clampedNum = number;
                                                    if (!targetInput.allowLower && targetInput.min !== undefined && clampedNum < targetInput.min) clampedNum = targetInput.min;
                                                    if (!targetInput.allowHigher && targetInput.max !== undefined && clampedNum > targetInput.max) clampedNum = targetInput.max;
                                                    targetInput.range.value = clampedNum;
                                                    targetInput.number.value = number;
                                                    this.value[axisIndex] = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(parseFloat(number) || 0) : number;
                                                    if (targetInput.updateVisuals) targetInput.updateVisuals(number);
                                                } else {
                                                    targetInput.updateCustomSliderValue(number, false);
                                                }
                                            }
                                        });
                                        this.change();
                                    } else {
                                        text = text.replace(/,(?=\d+$)/, '.');
                                        const num = parseNumericInput(text, parseFloat(this.value[i]) || 0);
                                        updateCustomSliderValue(num);
                                    }
                                }
                                $inner.removeClass('editing');
                                $inner.attr('contenteditable', 'false');
                                nslideInner.innerText = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(parseFloat(this.value[i]) || 0) : this.value[i];
                                this.onAfter?.();
                            };

                            $inner
                                .on('keypress', function (e) {
                                    if (e.keyCode === 10 || e.keyCode === 13) {
                                        e.preventDefault();
                                        stopInput();
                                    }
                                })
                                .on('keyup', (e) => {
                                    if (e.keyCode !== 10 && e.keyCode !== 13) { lastValue = parseFloat(this.value[i]) || 0; }
                                    if (e.keyCode === 27) {
                                        if (!$inner.hasClass('editing')) return;
                                        e.preventDefault();
                                        $inner.removeClass('editing');
                                        $inner.attr('contenteditable', 'false');
                                        nslideInner.innerText = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(parseFloat(this.value[i]) || 0) : this.value[i];
                                        this.onAfter?.();
                                    }
                                })
                                .on('focusout', function () { stopInput(); })
                                .on('dblclick', function (event) {
                                    if (event.target != this) return;
                                    $inner.text(defaultVal.toString());
                                    stopInput();
                                })
                                .on('contextmenu', (event) => {
                                    event.preventDefault();
                                    if (typeof Menu !== 'undefined') {
                                        new Menu([
                                            '_',
                                            {
                                                id: 'copy',
                                                name: 'action.copy',
                                                icon: 'content_copy',
                                                click: () => {
                                                    if (typeof Clipbench !== 'undefined') Clipbench.setText(this.value[i].toString());
                                                }
                                            },
                                            {
                                                id: 'copy_vector',
                                                name: 'menu.text_edit.copy_vector',
                                                icon: 'content_copy',
                                                condition: () => this.dimensions > 1,
                                                click: () => {
                                                    let text = this.value.map(v => typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(v) : v).join(' ');
                                                    if (typeof Clipbench !== 'undefined') Clipbench.setText(text);
                                                }
                                            },
                                            {
                                                id: 'paste',
                                                name: 'action.paste',
                                                icon: 'content_paste',
                                                click: async () => {
                                                    let text = await navigator.clipboard.readText();
                                                    let components = text.split(/\s+/g);
                                                    if (components.length === this.dimensions) {
                                                        let vec = components.map(c => {
                                                            let num = parseFloat(c);
                                                            return isNaN(num) ? 0 : num;
                                                        });
                                                        commitVectorChange(() => this.setValue(vec));
                                                    } else {
                                                        const num = parseNumericInput(text, parseFloat(this.value[i]) || 0);
                                                        commitVectorChange(() => updateCustomSliderValue(num));
                                                    }
                                                }
                                            },
                                            '_',
                                            {
                                                id: 'round',
                                                name: 'menu.slider.round_value',
                                                icon: 'percent',
                                                click: () => {
                                                    const oldValue = parseFloat(this.value[i]) || 0;
                                                    commitVectorChange(() => updateCustomSliderValue(Math.round(oldValue)));
                                                }
                                            },
                                            {
                                                id: 'reset_vector',
                                                name: 'menu.slider.reset_vector',
                                                icon: 'replay',
                                                condition: () => this.dimensions > 1,
                                                click: () => {
                                                    let defaultArr = Array.isArray(data.default) ? data.default : new Array(this.dimensions).fill(0);
                                                    commitVectorChange(() => this.setValue(defaultArr));
                                                }
                                            }
                                        ]).open(event);
                                    }
                                });

                            $outer
                                .on('mouseenter', () => {
                                    $outer.append(
                                        '<div class="nslide_arrow na_left" ><i class="material-icons">navigate_before</i></div>' +
                                        '<div class="nslide_arrow na_right"><i class="material-icons">navigate_next</i></div>'
                                    );
                                    let n = Math.clamp(numSliderNode.clientWidth / 2 - 22, 6, 1000);
                                    $outer.find('.nslide_arrow.na_left').click((e) => {
                                        this.onBefore?.(e);
                                        const oldValue = parseFloat(this.value[i]) || 0;
                                        updateCustomSliderValue(oldValue - getInterval(e));
                                        this.onAfter?.(e);
                                    }).css('margin-left', (-n - 22) + 'px');

                                    $outer.find('.nslide_arrow.na_right').click((e) => {
                                        this.onBefore?.(e);
                                        const oldValue = parseFloat(this.value[i]) || 0;
                                        updateCustomSliderValue(oldValue + getInterval(e));
                                        this.onAfter?.(e);
                                    }).css('margin-left', (n) + 'px');
                                })
                                .on('mouseleave', () => {
                                    $outer.find('.nslide_arrow').remove();
                                });

                            if (rowContainer) {
                                numSliderNode.style.height = '24px'; // Visually match the row's number input.
                                numSliderNode.style.flex = '1 1 auto';
                                rowContainer.append(numSliderNode);
                                this.inputs_container.append(rowContainer);
                            } else {
                                numSliderNode.style.flex = '1 1 0';
                                numSliderNode.style.minWidth = '0';
                                numSliderNode.style.width = 'auto';
                                numSliderNode.style.height = '28px';
                                numSliderNode.style.borderRadius = '4px';
                                numSliderNode.style.overflow = 'hidden';
                                this.inputs_container.append(numSliderNode);
                            }

                            this.inputs.push({ is_custom: false, updateCustomSliderValue });
                        }
                    }
                    if (this.native_vector_sliders.length > 1) {
                        this.native_vector_sliders.forEach(slider => {
                            slider.slider_vector = this.native_vector_sliders;
                        });
                    }
                    this.updateResetButtonVisibility();
                }

                getValue() {
                    return this.value.map(val => parseFloat(val) || 0);
                }

                setValue(arr, dispatch = true) {
                    for (let i = 0; i < this.dimensions; i++) {
                        let val = arr[i] !== undefined ? arr[i] : 0;
                        val = parseFloat(val) || 0;
                        this.value[i] = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(val) : val;

                        let inputObj = this.inputs[i];
                        if (!inputObj) continue;

                        if (inputObj.is_custom) {
                            let sliderNum = val;
                            if (!inputObj.allowLower && inputObj.min !== undefined && sliderNum < inputObj.min) sliderNum = inputObj.min;
                            if (!inputObj.allowHigher && inputObj.max !== undefined && sliderNum > inputObj.max) sliderNum = inputObj.max;

                            inputObj.range.value = sliderNum;
                            inputObj.number.value = val;
                            if (inputObj.updateVisuals) inputObj.updateVisuals(val);
                        } else {
                            inputObj.updateCustomSliderValue(val, false);
                        }
                    }
                    if (dispatch) this.change();
                    if (this.updateResetButtonVisibility) this.updateResetButtonVisibility();
                }

                getDefault() {
                    const dimensions = this.dimensions || this.options.dimensions || 3;
                    const source = Array.isArray(this.options.default)
                        ? this.options.default
                        : new Array(dimensions).fill(this.options.default !== undefined ? this.options.default : 0);
                    return new Array(dimensions).fill(0).map((_, index) => parseFloat(source[index]) || 0);
                }
            };



            // MARK: Gradient Editor Form Element
            // Reusable, GPU-friendly gradient authoring control for the Lightflow suite.
            // Value schema:
            // {
            //   version: 1,
            //   color_space: 'oklab' | 'srgb' | 'linear_rgb' | 'hsl',
            //   interpolation: 'linear' | 'smooth' | 'quadratic' | 'hard',
            //   stops: [{ id, position: 0..1, color: '#rrggbb', midpoint: 0.05..0.95 }]
            // }
            const LightManagerGradient = (() => {
                const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
                const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
                const makeId = () => typeof guid === 'function'
                    ? guid()
                    : `gradient_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
                const normalizeHex = (value, fallback = '#ffffff') => {
                    const source = String(value || '').trim();
                    const short = source.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i);
                    if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
                    const full = source.match(/^#?([0-9a-f]{6})$/i);
                    return full ? `#${full[1].toLowerCase()}` : fallback;
                };
                const hexToRgb = hex => {
                    const value = parseInt(normalizeHex(hex).slice(1), 16);
                    return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
                };
                const rgbToHex = rgb => `#${rgb.map(channel => (
                    Math.round(clamp01(channel) * 255).toString(16).padStart(2, '0')
                )).join('')}`;
                const srgbToLinear = value => value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
                const linearToSrgb = value => value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(Math.max(value, 0), 1 / 2.4) - 0.055;
                const rgbToOklab = rgb => {
                    const r = srgbToLinear(rgb[0]);
                    const g = srgbToLinear(rgb[1]);
                    const b = srgbToLinear(rgb[2]);
                    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
                    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
                    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
                    return [
                        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
                        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
                        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
                    ];
                };
                const oklabToRgb = lab => {
                    const l = lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2];
                    const m = lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2];
                    const s = lab[0] - 0.0894841775 * lab[1] - 1.2914855480 * lab[2];
                    const l3 = l * l * l;
                    const m3 = m * m * m;
                    const s3 = s * s * s;
                    return [
                        linearToSrgb(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
                        linearToSrgb(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
                        linearToSrgb(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3)
                    ].map(clamp01);
                };
                const rgbToHsl = rgb => {
                    const [r, g, b] = rgb;
                    const max = Math.max(r, g, b);
                    const min = Math.min(r, g, b);
                    const delta = max - min;
                    let hue = 0;
                    if (delta > 1e-8) {
                        if (max === r) hue = ((g - b) / delta) % 6;
                        else if (max === g) hue = (b - r) / delta + 2;
                        else hue = (r - g) / delta + 4;
                        hue = ((hue * 60) + 360) % 360;
                    }
                    const lightness = (max + min) * 0.5;
                    const saturation = delta <= 1e-8 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
                    return [hue, saturation, lightness];
                };
                const hslToRgb = hsl => {
                    const hue = ((hsl[0] % 360) + 360) % 360;
                    const saturation = clamp01(hsl[1]);
                    const lightness = clamp01(hsl[2]);
                    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
                    const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
                    const m = lightness - chroma * 0.5;
                    let rgb;
                    if (hue < 60) rgb = [chroma, x, 0];
                    else if (hue < 120) rgb = [x, chroma, 0];
                    else if (hue < 180) rgb = [0, chroma, x];
                    else if (hue < 240) rgb = [0, x, chroma];
                    else if (hue < 300) rgb = [x, 0, chroma];
                    else rgb = [chroma, 0, x];
                    return rgb.map(channel => channel + m);
                };
                const mix = (a, b, amount) => a.map((value, index) => value + (b[index] - value) * amount);
                const applyCurve = (amount, interpolation) => {
                    const t = clamp01(amount);
                    if (interpolation === 'smooth') return t * t * (3 - 2 * t);
                    if (interpolation === 'quadratic') return t * t;
                    if (interpolation === 'hard') return t < 0.5 ? 0 : 1;
                    return t;
                };
                const applyMidpoint = (amount, midpoint) => {
                    const t = clamp01(amount);
                    const middle = clamp(midpoint, 0.05, 0.95);
                    return t <= middle
                        ? 0.5 * t / middle
                        : 0.5 + 0.5 * (t - middle) / (1 - middle);
                };
                const interpolate = (from, to, amount, colorSpace) => {
                    const t = clamp01(amount);
                    if (colorSpace === 'linear_rgb') {
                        return mix(from.map(srgbToLinear), to.map(srgbToLinear), t).map(linearToSrgb).map(clamp01);
                    }
                    if (colorSpace === 'oklab') {
                        return oklabToRgb(mix(rgbToOklab(from), rgbToOklab(to), t));
                    }
                    if (colorSpace === 'hsl') {
                        const a = rgbToHsl(from);
                        const b = rgbToHsl(to);
                        let delta = ((b[0] - a[0] + 540) % 360) - 180;
                        return hslToRgb([a[0] + delta * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
                    }
                    return mix(from, to, t);
                };
                const defaultValue = () => ({
                    version: 1,
                    color_space: 'oklab',
                    interpolation: 'smooth',
                    stops: [
                        { id: makeId(), position: 0, color: '#26344f', midpoint: 0.5 },
                        { id: makeId(), position: 1, color: '#a7d8ff', midpoint: 0.5 }
                    ]
                });
                const normalize = (source, options = {}) => {
                    const fallback = options.fallback || defaultValue();
                    const input = Array.isArray(source) ? { stops: source } : (source && typeof source === 'object' ? source : fallback);
                    const sourceStops = Array.isArray(input.stops) ? input.stops : fallback.stops;
                    const minimum = Math.max(2, Math.round(Number(options.min_stops) || 2));
                    const maximum = Math.max(minimum, Math.round(Number(options.max_stops) || 12));
                    const stops = sourceStops.slice(0, maximum).map((stop, index) => ({
                        id: typeof stop?.id === 'string' && stop.id ? stop.id : makeId(),
                        position: clamp01(stop?.position !== undefined ? stop.position : (sourceStops.length <= 1 ? 0 : index / (sourceStops.length - 1))),
                        color: normalizeHex(stop?.color, index ? '#ffffff' : '#000000'),
                        midpoint: clamp(stop?.midpoint !== undefined ? stop.midpoint : 0.5, 0.05, 0.95)
                    })).sort((a, b) => a.position - b.position);
                    while (stops.length < minimum) {
                        const position = stops.length <= 1 ? stops.length : stops.length / minimum;
                        stops.push({ id: makeId(), position, color: stops[stops.length - 1]?.color || '#ffffff', midpoint: 0.5 });
                    }
                    stops.sort((a, b) => a.position - b.position);
                    if (options.lock_endpoints !== false && stops.length) {
                        stops[0].position = 0;
                        stops[stops.length - 1].position = 1;
                    }
                    return {
                        version: 1,
                        color_space: ['oklab', 'srgb', 'linear_rgb', 'hsl'].includes(input.color_space) ? input.color_space : 'oklab',
                        interpolation: ['linear', 'smooth', 'quadratic', 'hard'].includes(input.interpolation) ? input.interpolation : 'smooth',
                        stops
                    };
                };
                const sample = (source, position, options = {}) => {
                    const gradient = normalize(source, options);
                    const stops = gradient.stops;
                    const t = clamp01(position);
                    if (t <= stops[0].position) return hexToRgb(stops[0].color);
                    if (t >= stops[stops.length - 1].position) return hexToRgb(stops[stops.length - 1].color);
                    let index = 0;
                    while (index < stops.length - 2 && t > stops[index + 1].position) index += 1;
                    const start = stops[index];
                    const end = stops[index + 1];
                    const span = Math.max(1e-6, end.position - start.position);
                    const local = applyCurve(applyMidpoint((t - start.position) / span, start.midpoint), gradient.interpolation);
                    return interpolate(hexToRgb(start.color), hexToRgb(end.color), local, gradient.color_space);
                };
                const css = (source, samples = 32) => {
                    const count = Math.max(2, Math.min(128, Math.round(samples)));
                    const colors = [];
                    for (let i = 0; i < count; i++) {
                        const position = i / (count - 1);
                        colors.push(`${rgbToHex(sample(source, position))} ${(position * 100).toFixed(2)}%`);
                    }
                    return `linear-gradient(90deg, ${colors.join(', ')})`;
                };
                const clone = source => JSON.parse(JSON.stringify(normalize(source)));
                return { clamp01, normalizeHex, hexToRgb, rgbToHex, normalize, sample, css, clone, defaultValue, makeId };
            })();

            FormElement.types.gradient_editor = class FormElementGradientEditor extends FormElement {
                get uses_wide_inputs() { return true; }

                setup() {
                    const description = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = description;
                }

                build(bar) {
                    this.bar = bar;
                    this.data = this.options || {};
                    this.minimumStops = Math.max(2, Math.round(Number(this.data.min_stops) || 2));
                    this.maximumStops = Math.max(this.minimumStops, Math.round(Number(this.data.max_stops) || 12));
                    this.lockEndpoints = this.data.lock_endpoints !== false;
                    this.value = LightManagerGradient.normalize(
                        this.data.value !== undefined ? this.data.value : this.data.default,
                        { min_stops: this.minimumStops, max_stops: this.maximumStops, lock_endpoints: this.lockEndpoints }
                    );
                    this.defaultValue = LightManagerGradient.normalize(
                        this.data.default !== undefined ? this.data.default : this.value,
                        { min_stops: this.minimumStops, max_stops: this.maximumStops, lock_endpoints: this.lockEndpoints }
                    );
                    this.hasExplicitDefault = this.data.default !== undefined;
                    this.selectedStopId = this.value.stops[0]?.id || null;
                    this.pendingChangeFrame = null;
                    this.stopColorPicker = null;
                    this.stopColorPickerHost = null;
                    this.onBefore = typeof this.data.onBefore === 'function' ? this.data.onBefore : null;
                    this.onAfter = typeof this.data.onAfter === 'function' ? this.data.onAfter : null;
                    this.editDepth = 0;
                    this.finishEditAfterChange = false;

                    bar.classList.add('full_width_dialog_bar', 'light_manager_gradient_form_bar');
                    bar.style.padding = this.data.padding || '4px 0';
                    bar.style.background = 'transparent';
                    // Blockbench's native form rows are optimized for one-line controls.
                    // The gradient editor is a multi-row element, so explicitly release the
                    // fixed row sizing and clipping that otherwise collapse/overlap its UI.
                    bar.style.setProperty('height', 'auto', 'important');
                    bar.style.setProperty('min-height', '0', 'important');
                    bar.style.setProperty('overflow', 'visible', 'important');
                    bar.style.setProperty('align-items', 'stretch', 'important');

                    this.node = document.createElement('div');
                    this.node.className = `light_manager_gradient_editor${this.data.compact ? ' compact' : ''}`;
                    const trackHeight = Math.max(18, Number(this.data.height) || (this.data.compact ? 28 : 38));
                    const handleSize = Math.max(12, Number(this.data.handle_size) || (this.data.compact ? 14 : 18));
                    this.node.style.setProperty('--gradient-track-height', `${trackHeight}px`);
                    this.node.style.setProperty('--gradient-handle-size', `${handleSize}px`);
                    this.node.style.setProperty('--gradient-edge-inset', `${handleSize * 0.5 + 3}px`);
                    if (this.data.track_radius !== undefined) this.node.style.setProperty('--gradient-track-radius', `${Number(this.data.track_radius) || 0}px`);
                    if (this.data.accent) this.node.style.setProperty('--gradient-accent', this.data.accent);

                    const header = document.createElement('div');
                    header.className = 'light_manager_gradient_header';
                    const title = document.createElement('div');
                    title.className = 'light_manager_gradient_title';
                    if (this.data.icon) {
                        const icon = document.createElement('i');
                        icon.className = 'material-icons icon';
                        icon.textContent = this.data.icon;
                        title.append(icon);
                    }
                    if (this.data.label && !this.data.hide_label) {
                        const label = document.createElement('span');
                        label.textContent = typeof tl === 'function' ? tl(this.data.label) : this.data.label;
                        title.append(label);
                    }
                    const description = this.data.description ? (typeof tl === 'function' ? tl(this.data.description) : this.data.description) : '';
                    if (description) {
                        title.title = description;
                        title.classList.add('has_description');
                    }
                    header.append(title);

                    const toolbar = document.createElement('div');
                    toolbar.className = 'light_manager_gradient_toolbar';
                    const makeButton = (iconName, titleText, callback) => {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.className = 'tool light_manager_gradient_tool';
                        button.title = typeof tl === 'function' ? tl(titleText) : titleText;
                        const icon = document.createElement('i');
                        icon.className = 'material-icons';
                        icon.textContent = iconName;
                        button.append(icon);
                        button.addEventListener('click', event => {
                            event.preventDefault();
                            event.stopPropagation();
                            callback(event);
                        });
                        toolbar.append(button);
                        return button;
                    };
                    if (this.data.show_toolbar !== false) {
                        this.removeButton = makeButton('delete', 'light_manager.gradient.remove_stop', () => this.performEdit(() => this.removeSelectedStop()));
                        if (this.hasExplicitDefault && this.data.resettable !== false) {
                            this.resetButton = makeButton('restart_alt', 'light_manager.gradient.reset', () => this.performEdit(() => this.setValue(this.defaultValue, true)));
                        }
                        this.optionsButton = makeButton('tune', 'light_manager.gradient.options', event => this.openOptionsMenu(event));
                        header.append(toolbar);
                    }
                    if (this.data.show_toolbar !== false || this.data.label) this.node.append(header);

                    this.track = document.createElement('div');
                    this.track.className = 'light_manager_gradient_track';
                    this.track.tabIndex = 0;
                    this.track.setAttribute('role', 'group');
                    this.track.setAttribute('aria-label', this.data.label ? (typeof tl === 'function' ? tl(this.data.label) : this.data.label) : 'Gradient');
                    this.canvas = document.createElement('canvas');
                    this.canvas.width = Math.max(128, Math.round(Number(this.data.preview_resolution) || 512));
                    this.canvas.height = Math.max(18, Math.round(trackHeight));
                    this.canvas.className = 'light_manager_gradient_canvas';
                    this.handles = document.createElement('div');
                    this.handles.className = 'light_manager_gradient_handles';
                    this.track.append(this.canvas, this.handles);
                    this.node.append(this.track);

                    this.canvas.addEventListener('click', event => this.openOptionsMenu(event, this.positionFromEvent(event)));
                    this.canvas.addEventListener('contextmenu', event => {
                        event.preventDefault();
                        this.openOptionsMenu(event, this.positionFromEvent(event));
                    });
                    this.track.addEventListener('keydown', event => this.onTrackKeyDown(event));

                    this.stopColorPickerHost = document.createElement('div');
                    this.stopColorPickerHost.className = 'light_manager_gradient_picker_host';
                    this.stopColorPicker = new AdvancedColorPicker(`gradient_cp_${this.id}_${guid()}`, {
                        name: this.data.label ? (typeof tl === 'function' ? tl(this.data.label) : this.data.label) : '',
                        value: this.getSelectedStop()?.color || '#ffffff',
                        private: true,
                        alpha: false,
                        onMove: color => this.updateSelectedColor(color.toHexString()),
                        onChange: color => this.updateSelectedColor(color.toHexString()),
                        onBefore: () => this.beginEdit(),
                        onAfter: () => this.endEdit()
                    });
                    this.stopColorPicker.node.classList.add('light_manager_gradient_hidden_picker');
                    this.stopColorPickerHost.append(this.stopColorPicker.getNode());
                    this.node.append(this.stopColorPickerHost);
                    bar.append(this.node);
                    this.render();
                }

                positionFromEvent(event) {
                    // Stops are aligned to the visible canvas, not to the outer track box.
                    // The track includes side insets so endpoint handles remain fully visible.
                    const rect = (this.canvas || this.track).getBoundingClientRect();
                    return LightManagerGradient.clamp01((event.clientX - rect.left) / Math.max(1, rect.width));
                }

                translate(key, fallback = key) {
                    if (typeof tl !== 'function') return fallback;
                    const translated = tl(key);
                    return translated === key ? fallback : translated;
                }

                beginEdit() {
                    if (this.editDepth++ === 0) {
                        this.finishEditAfterChange = false;
                        this.onBefore?.();
                    }
                }

                endEdit() {
                    if (this.editDepth <= 0) return;
                    this.editDepth -= 1;
                    if (this.editDepth !== 0) return;
                    if (this.pendingChangeFrame !== null) this.finishEditAfterChange = true;
                    else this.onAfter?.();
                }

                performEdit(callback) {
                    this.beginEdit();
                    try {
                        return callback();
                    } finally {
                        this.endEdit();
                    }
                }

                setColorSpace(colorSpace) {
                    if (!['oklab', 'srgb', 'linear_rgb', 'hsl'].includes(colorSpace)) return;
                    this.performEdit(() => {
                        this.value.color_space = colorSpace;
                        this.render();
                        this.queueChange();
                    });
                }

                setInterpolation(interpolation) {
                    if (!['linear', 'smooth', 'quadratic', 'hard'].includes(interpolation)) return;
                    this.performEdit(() => {
                        this.value.interpolation = interpolation;
                        this.render();
                        this.queueChange();
                    });
                }

                openOptionsMenu(anchor, suggestedPosition) {
                    if (typeof Menu === 'undefined') return;
                    const spaces = {
                        oklab: ['light_manager.gradient.space.oklab', 'visibility'],
                        srgb: ['light_manager.gradient.space.srgb', 'palette'],
                        linear_rgb: ['light_manager.gradient.space.linear_rgb', 'light_mode'],
                        hsl: ['light_manager.gradient.space.hsl', 'colorize']
                    };
                    const interpolations = {
                        linear: ['light_manager.gradient.interpolation.linear', 'show_chart'],
                        smooth: ['light_manager.gradient.interpolation.smooth', 'ssid_chart'],
                        quadratic: ['light_manager.gradient.interpolation.quadratic', 'trending_up'],
                        hard: ['light_manager.gradient.interpolation.hard', 'stairs']
                    };
                    const makeChoiceItems = (entries, current, setter) => Object.entries(entries).map(([value, data]) => ({
                        id: `light_manager_gradient_${this.id}_${value}`,
                        name: data[0],
                        icon: data[1],
                        marked: current === value,
                        click: () => setter.call(this, value)
                    }));
                    const currentSpace = spaces[this.value.color_space]?.[0] || this.value.color_space;
                    const currentInterpolation = interpolations[this.value.interpolation]?.[0] || this.value.interpolation;
                    const menu = new Menu(`light_manager_gradient_options_${this.id}`, [
                        {
                            icon: 'palette',
                            name: `${this.translate('light_manager.gradient.color_space', 'Color space')}: ${this.translate(currentSpace, this.value.color_space)}`,
                            children: makeChoiceItems(spaces, this.value.color_space, this.setColorSpace)
                        },
                        {
                            icon: 'timeline',
                            name: `${this.translate('light_manager.gradient.interpolation', 'Transition')}: ${this.translate(currentInterpolation, this.value.interpolation)}`,
                            children: makeChoiceItems(interpolations, this.value.interpolation, this.setInterpolation)
                        },
                        '_',
                        {
                            icon: 'add',
                            name: 'light_manager.gradient.add_stop',
                            condition: () => this.value.stops.length < this.maximumStops,
                            click: () => this.performEdit(() => this.addStop(Number.isFinite(suggestedPosition) ? suggestedPosition : undefined))
                        },
                        {
                            icon: 'horizontal_distribute',
                            name: 'light_manager.gradient.distribute',
                            click: () => this.performEdit(() => this.distributeStops())
                        },
                        {
                            icon: 'swap_horiz',
                            name: 'light_manager.gradient.reverse',
                            click: () => this.performEdit(() => this.reverseStops())
                        },
                        '_',
                        {
                            icon: 'restart_alt',
                            name: 'light_manager.gradient.reset',
                            condition: () => this.hasExplicitDefault && this.data.resettable !== false,
                            click: () => this.performEdit(() => this.setValue(this.defaultValue, true))
                        }
                    ]);
                    const menuAnchor = Number.isFinite(anchor?.clientX)
                        ? anchor
                        : (anchor?.currentTarget || anchor?.target || anchor || this.canvas);
                    menu.open(menuAnchor);
                }

                openStopMenu(stopId, anchor) {
                    if (typeof Menu === 'undefined') return;
                    this.selectStop(stopId);
                    const stop = this.getSelectedStop();
                    if (!stop) return;
                    new Menu(`light_manager_gradient_stop_${this.id}`, [
                        {
                            icon: 'colorize',
                            name: 'light_manager.gradient.color',
                            click: () => this.openStopColorPicker(stopId)
                        },
                        {
                            icon: 'delete',
                            name: 'light_manager.gradient.remove_stop',
                            condition: () => this.value.stops.length > this.minimumStops,
                            click: () => this.performEdit(() => this.removeSelectedStop())
                        }
                    ]).open(Number.isFinite(anchor?.clientX)
                        ? anchor
                        : (anchor?.currentTarget || anchor?.target || anchor));
                }

                openStopColorPicker(stopId) {
                    this.selectStop(stopId);
                    const stop = this.getSelectedStop();
                    if (!stop || !this.stopColorPicker || !this.stopColorPickerHost) return;
                    const safeStopId = String(stop.id).replace(/"/g, '\\"');
                    const handle = this.handles?.querySelector(`[data-stop-id="${safeStopId}"]`);
                    if (handle && this.node) {
                        const handleRect = handle.getBoundingClientRect();
                        const nodeRect = this.node.getBoundingClientRect();
                        this.stopColorPickerHost.style.left = `${handleRect.left + handleRect.width * 0.5 - nodeRect.left}px`;
                        this.stopColorPickerHost.style.top = `${handleRect.bottom - nodeRect.top}px`;
                    }
                    this.stopColorPicker.set(stop.color);
                    this.stopColorPicker.jq.spectrum('show');
                }

                getSelectedStop() {
                    return this.value.stops.find(stop => stop.id === this.selectedStopId) || this.value.stops[0] || null;
                }

                selectStop(id, focus = false) {
                    if (!this.value.stops.some(stop => stop.id === id)) return;
                    this.selectedStopId = id;
                    this.renderHandles();
                    this.updateControls();
                    if (focus) this.track.focus();
                }

                normalizeValue() {
                    const selectedId = this.selectedStopId;
                    this.value = LightManagerGradient.normalize(this.value, {
                        min_stops: this.minimumStops,
                        max_stops: this.maximumStops,
                        lock_endpoints: this.lockEndpoints
                    });
                    this.selectedStopId = this.value.stops.some(stop => stop.id === selectedId)
                        ? selectedId
                        : this.value.stops[0]?.id || null;
                }

                addStop(position) {
                    if (this.value.stops.length >= this.maximumStops) return;
                    let target = Number(position);
                    if (!Number.isFinite(target)) {
                        let largestGap = -1;
                        target = 0.5;
                        for (let index = 0; index < this.value.stops.length - 1; index++) {
                            const gap = this.value.stops[index + 1].position - this.value.stops[index].position;
                            if (gap > largestGap) {
                                largestGap = gap;
                                target = this.value.stops[index].position + gap * 0.5;
                            }
                        }
                    }
                    target = LightManagerGradient.clamp01(target);
                    const stop = {
                        id: LightManagerGradient.makeId(),
                        position: target,
                        color: LightManagerGradient.rgbToHex(LightManagerGradient.sample(this.value, target)),
                        midpoint: 0.5
                    };
                    this.value.stops.push(stop);
                    this.selectedStopId = stop.id;
                    this.normalizeValue();
                    this.render();
                    this.queueChange();
                }

                removeSelectedStop() {
                    if (this.value.stops.length <= this.minimumStops) return;
                    const index = this.value.stops.findIndex(stop => stop.id === this.selectedStopId);
                    if (index < 0) return;
                    this.value.stops.splice(index, 1);
                    const fallback = this.value.stops[Math.min(index, this.value.stops.length - 1)];
                    this.selectedStopId = fallback?.id || null;
                    this.normalizeValue();
                    this.render();
                    this.queueChange();
                }

                distributeStops() {
                    const count = this.value.stops.length;
                    this.value.stops.forEach((stop, index) => {
                        stop.position = count <= 1 ? 0 : index / (count - 1);
                    });
                    this.render();
                    this.queueChange();
                }

                reverseStops() {
                    const old = this.value.stops.map(stop => ({ ...stop }));
                    const reversed = old.slice().reverse().map((stop, index) => {
                        const originalSegment = old.length - 2 - index;
                        return {
                            ...stop,
                            position: 1 - stop.position,
                            midpoint: originalSegment >= 0 ? 1 - old[originalSegment].midpoint : 0.5
                        };
                    });
                    this.value.stops = reversed.sort((a, b) => a.position - b.position);
                    this.render();
                    this.queueChange();
                }

                updateSelectedColor(value) {
                    const stop = this.getSelectedStop();
                    if (!stop) return;
                    stop.color = LightManagerGradient.normalizeHex(value, stop.color);
                    this.render();
                    this.queueChange();
                }

                updateSelectedPosition(position) {
                    const stop = this.getSelectedStop();
                    if (!stop) return;
                    const index = this.value.stops.findIndex(candidate => candidate.id === stop.id);
                    if (this.lockEndpoints && (index === 0 || index === this.value.stops.length - 1)) return;
                    stop.position = LightManagerGradient.clamp01(position);
                    this.normalizeValue();
                    this.render();
                    this.queueChange();
                }

                beginDrag(event, kind, id, segmentIndex) {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.stopPropagation();
                    if (kind === 'stop') this.selectStop(id, true);
                    this.beginEdit();
                    const startX = event.clientX;
                    let dragged = false;
                    const move = moveEvent => {
                        moveEvent.preventDefault();
                        if (Math.abs(moveEvent.clientX - startX) > 2) dragged = true;
                        const position = this.positionFromEvent(moveEvent);
                        if (kind === 'stop') {
                            const stop = this.value.stops.find(candidate => candidate.id === id);
                            if (!stop) return;
                            const index = this.value.stops.findIndex(candidate => candidate.id === id);
                            if (this.lockEndpoints && (index === 0 || index === this.value.stops.length - 1)) return;
                            stop.position = position;
                            this.normalizeValue();
                        } else {
                            const start = this.value.stops[segmentIndex];
                            const end = this.value.stops[segmentIndex + 1];
                            if (!start || !end) return;
                            start.midpoint = Math.max(0.05, Math.min(0.95, (position - start.position) / Math.max(1e-6, end.position - start.position)));
                        }
                        this.render();
                        this.queueChange();
                    };
                    const up = () => {
                        document.removeEventListener('pointermove', move, true);
                        document.removeEventListener('pointerup', up, true);
                        this.endEdit();
                        if (kind === 'stop' && !dragged) this.openStopColorPicker(id);
                    };
                    document.addEventListener('pointermove', move, true);
                    document.addEventListener('pointerup', up, true);
                }

                onTrackKeyDown(event) {
                    const stop = this.getSelectedStop();
                    if (!stop) return;
                    if (event.key === 'Delete' || event.key === 'Backspace') {
                        event.preventDefault();
                        this.performEdit(() => this.removeSelectedStop());
                        return;
                    }
                    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                    event.preventDefault();
                    const step = (event.shiftKey ? 0.01 : 0.001) * (event.key === 'ArrowLeft' ? -1 : 1);
                    this.performEdit(() => this.updateSelectedPosition(stop.position + step));
                }

                renderCanvas() {
                    if (!this.canvas) return;
                    const context = this.canvas.getContext('2d');
                    if (!context) return;
                    const width = this.canvas.width;
                    const height = this.canvas.height;
                    if (this.data.checkerboard) {
                        const size = 8;
                        for (let y = 0; y < height; y += size) {
                            for (let x = 0; x < width; x += size) {
                                context.fillStyle = ((x / size + y / size) % 2) ? '#8c8c8c' : '#c8c8c8';
                                context.fillRect(x, y, size, size);
                            }
                        }
                    }
                    const image = context.createImageData(width, height);
                    for (let x = 0; x < width; x++) {
                        const rgb = LightManagerGradient.sample(this.value, width <= 1 ? 0 : x / (width - 1));
                        const red = Math.round(rgb[0] * 255);
                        const green = Math.round(rgb[1] * 255);
                        const blue = Math.round(rgb[2] * 255);
                        for (let y = 0; y < height; y++) {
                            const offset = (y * width + x) * 4;
                            image.data[offset] = red;
                            image.data[offset + 1] = green;
                            image.data[offset + 2] = blue;
                            image.data[offset + 3] = 255;
                        }
                    }
                    context.putImageData(image, 0, 0);
                }

                renderHandles() {
                    if (!this.handles) return;
                    this.handles.replaceChildren();
                    this.value.stops.forEach((stop, index) => {
                        const handle = document.createElement('button');
                        handle.type = 'button';
                        handle.className = `light_manager_gradient_stop${stop.id === this.selectedStopId ? ' selected' : ''}`;
                        handle.style.left = `${stop.position * 100}%`;
                        handle.style.setProperty('--stop-color', stop.color);
                        handle.dataset.stopId = stop.id;
                        handle.title = `${stop.color.toUpperCase()} · ${(stop.position * 100).toFixed(1)}%`;
                        handle.setAttribute('aria-label', handle.title);
                        handle.addEventListener('pointerdown', event => this.beginDrag(event, 'stop', stop.id));
                        handle.addEventListener('click', event => {
                            event.preventDefault();
                            event.stopPropagation();
                        });
                        handle.addEventListener('keydown', event => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            this.openStopColorPicker(stop.id);
                        });
                        handle.addEventListener('contextmenu', event => {
                            event.preventDefault();
                            event.stopPropagation();
                            this.openStopMenu(stop.id, event);
                        });
                        this.handles.append(handle);
                        if (this.data.show_midpoints === false || index >= this.value.stops.length - 1) return;
                        const next = this.value.stops[index + 1];
                        const midpointPosition = stop.position + (next.position - stop.position) * stop.midpoint;
                        const midpoint = document.createElement('button');
                        midpoint.type = 'button';
                        midpoint.className = 'light_manager_gradient_midpoint';
                        midpoint.style.left = `${midpointPosition * 100}%`;
                        midpoint.title = `${typeof tl === 'function' ? tl('light_manager.gradient.midpoint') : 'Fade midpoint'}: ${(stop.midpoint * 100).toFixed(0)}%`;
                        midpoint.addEventListener('pointerdown', event => this.beginDrag(event, 'midpoint', null, index));
                        this.handles.append(midpoint);
                    });
                }

                updateControls() {
                    const stop = this.getSelectedStop();
                    if (!stop) return;
                    if (this.removeButton) this.removeButton.disabled = this.value.stops.length <= this.minimumStops;
                    if (this.resetButton) {
                        const changed = JSON.stringify(this.value) !== JSON.stringify(this.defaultValue);
                        this.resetButton.style.display = changed ? 'inline-flex' : 'none';
                        this.resetButton.tabIndex = changed ? 0 : -1;
                        this.resetButton.setAttribute('aria-hidden', changed ? 'false' : 'true');
                    }
                    if (this.optionsButton) {
                        const space = this.translate(`light_manager.gradient.space.${this.value.color_space}`, this.value.color_space);
                        const interpolation = this.translate(`light_manager.gradient.interpolation.${this.value.interpolation}`, this.value.interpolation);
                        this.optionsButton.title = `${this.translate('light_manager.gradient.options', 'Gradient options')} · ${space} · ${interpolation}`;
                    }
                }

                render() {
                    this.normalizeValue();
                    this.renderCanvas();
                    this.renderHandles();
                    this.updateControls();
                }

                queueChange() {
                    if (this.pendingChangeFrame !== null) return;
                    const dispatch = () => {
                        this.pendingChangeFrame = null;
                        this.change();
                        if (this.finishEditAfterChange && this.editDepth === 0) {
                            this.finishEditAfterChange = false;
                            this.onAfter?.();
                        }
                    };
                    if (typeof requestAnimationFrame === 'function') this.pendingChangeFrame = requestAnimationFrame(dispatch);
                    else {
                        this.pendingChangeFrame = setTimeout(dispatch, 0);
                    }
                }

                getValue() {
                    return LightManagerGradient.clone(this.value);
                }

                setValue(value, dispatch = false) {
                    this.value = LightManagerGradient.normalize(value, {
                        min_stops: this.minimumStops || 2,
                        max_stops: this.maximumStops || 12,
                        lock_endpoints: this.lockEndpoints !== false
                    });
                    if (!this.selectedStopId || !this.value.stops.some(stop => stop.id === this.selectedStopId)) {
                        this.selectedStopId = this.value.stops[0]?.id || null;
                    }
                    if (this.node) this.render();
                    if (dispatch) this.queueChange();
                }

                getDefault() {
                    return LightManagerGradient.clone(this.defaultValue || LightManagerGradient.defaultValue());
                }
            };

            const gradientEditorStyles = Blockbench.addCSS(`
                .light_manager_gradient_form_bar {
                    min-width: 0;
                    height: auto !important;
                    min-height: 0 !important;
                    overflow: visible !important;
                    align-items: stretch !important;
                }
                .light_manager_gradient_editor {
                    --gradient-accent: var(--color-accent);
                    --gradient-track-height: 38px;
                    --gradient-handle-size: 18px;
                    --gradient-track-radius: 3px;
                    --gradient-handle-space: 22px;
                    --gradient-edge-inset: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    width: 100%;
                    min-width: 0;
                    box-sizing: border-box;
                    position: relative;
                    user-select: none;
                }
                .light_manager_gradient_header,
                .light_manager_gradient_title,
                .light_manager_gradient_toolbar,
                .light_manager_gradient_controls {
                    display: flex;
                    align-items: center;
                    min-width: 0;
                }
                .light_manager_gradient_header {
                    justify-content: space-between;
                    gap: 8px;
                    min-height: 28px;
                    position: relative;
                    z-index: 6;
                }
                .light_manager_gradient_title {
                    gap: 6px;
                    color: var(--color-subtle_text);
                    font-size: 13px;
                    font-weight: 600;
                    line-height: 1.2;
                    overflow: hidden;
                }
                .light_manager_gradient_title > span {
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .light_manager_gradient_title > .icon {
                    flex: 0 0 auto;
                    font-size: 18px;
                    color: var(--gradient-accent);
                }
                .light_manager_gradient_title.has_description {
                    cursor: help;
                }
                .light_manager_gradient_toolbar {
                    flex: 0 0 auto;
                    gap: 1px;
                }
                .light_manager_gradient_tool,
                .light_manager_gradient_remove {
                    -webkit-appearance: none !important;
                    appearance: none !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    flex: 0 0 28px !important;
                    width: 28px !important;
                    min-width: 28px !important;
                    max-width: 28px !important;
                    height: 28px !important;
                    min-height: 28px !important;
                    max-height: 28px !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    border: 0 !important;
                    border-radius: 3px !important;
                    box-sizing: border-box !important;
                    background: transparent;
                    color: var(--color-subtle_text);
                    line-height: 1 !important;
                }
                .light_manager_gradient_tool:hover:not(:disabled),
                .light_manager_gradient_remove:hover:not(:disabled) {
                    background: var(--color-button);
                    color: var(--color-text);
                }
                .light_manager_gradient_tool:focus-visible,
                .light_manager_gradient_remove:focus-visible {
                    outline: 2px solid var(--gradient-accent);
                    outline-offset: -2px;
                }
                .light_manager_gradient_tool:disabled,
                .light_manager_gradient_remove:disabled {
                    opacity: .35;
                    cursor: default;
                }
                .light_manager_gradient_tool .material-icons,
                .light_manager_gradient_remove .material-icons {
                    font-size: 18px;
                    line-height: 1;
                }
                .light_manager_gradient_track {
                    position: relative;
                    width: 100%;
                    height: calc(var(--gradient-track-height) + var(--gradient-handle-space));
                    min-height: calc(var(--gradient-track-height) + var(--gradient-handle-space));
                    padding: 0 var(--gradient-edge-inset) var(--gradient-handle-space);
                    box-sizing: border-box;
                    outline: none;
                    overflow: visible;
                    cursor: pointer;
                }
                .light_manager_gradient_track:focus-visible .light_manager_gradient_canvas {
                    outline: 2px solid var(--gradient-accent);
                    outline-offset: 2px;
                }
                .light_manager_gradient_canvas {
                    display: block;
                    width: 100%;
                    height: var(--gradient-track-height);
                    border: 1px solid var(--color-border);
                    border-radius: var(--gradient-track-radius);
                    box-sizing: border-box;
                    box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
                    image-rendering: auto;
                }
                .light_manager_gradient_handles {
                    position: absolute;
                    top: 0;
                    right: var(--gradient-edge-inset);
                    bottom: var(--gradient-handle-space);
                    left: var(--gradient-edge-inset);
                    pointer-events: none;
                    overflow: visible;
                }
                .light_manager_gradient_stop,
                .light_manager_gradient_midpoint {
                    -webkit-appearance: none !important;
                    appearance: none !important;
                    position: absolute !important;
                    display: block !important;
                    flex: none !important;
                    min-width: 0 !important;
                    max-width: none !important;
                    min-height: 0 !important;
                    max-height: none !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    box-sizing: border-box !important;
                    font-size: 0 !important;
                    line-height: 0 !important;
                    pointer-events: auto;
                    transform-origin: center center;
                    z-index: 2;
                }
                .light_manager_gradient_stop {
                    top: calc(var(--gradient-track-height) - 3px) !important;
                    width: var(--gradient-handle-size) !important;
                    min-width: var(--gradient-handle-size) !important;
                    max-width: var(--gradient-handle-size) !important;
                    height: calc(var(--gradient-handle-size) + 5px) !important;
                    min-height: calc(var(--gradient-handle-size) + 5px) !important;
                    max-height: calc(var(--gradient-handle-size) + 5px) !important;
                    border: 0 !important;
                    border-radius: 0 !important;
                    background: var(--color-ui) !important;
                    clip-path: polygon(50% 0, 100% 7px, 100% 100%, 0 100%, 0 7px);
                    filter: drop-shadow(0 1px 1px rgba(0,0,0,.65));
                    transform: translateX(-50%) !important;
                    cursor: ew-resize;
                }
                .light_manager_gradient_stop::after {
                    content: '';
                    position: absolute;
                    inset: 8px 3px 3px;
                    background: var(--stop-color);
                    border: 1px solid rgba(255,255,255,.72);
                    box-shadow: 0 0 0 1px rgba(0,0,0,.7);
                    box-sizing: border-box;
                }
                .light_manager_gradient_stop.selected {
                    background: var(--gradient-accent) !important;
                    z-index: 4;
                }
                .light_manager_gradient_stop:focus-visible {
                    outline: 2px solid var(--gradient-accent);
                    outline-offset: 2px;
                }
                .light_manager_gradient_midpoint {
                    top: var(--gradient-track-height) !important;
                    width: 10px !important;
                    min-width: 10px !important;
                    max-width: 10px !important;
                    height: 10px !important;
                    min-height: 10px !important;
                    max-height: 10px !important;
                    border: 2px solid var(--color-ui) !important;
                    border-radius: 1px !important;
                    background: var(--color-text) !important;
                    box-shadow: 0 0 0 1px rgba(0,0,0,.55);
                    transform: translate(-50%, -50%) rotate(45deg) !important;
                    opacity: .72;
                    cursor: ew-resize;
                    z-index: 1;
                }
                .light_manager_gradient_midpoint::before,
                .light_manager_gradient_midpoint::after {
                    content: none !important;
                    display: none !important;
                }
                .light_manager_gradient_midpoint:hover,
                .light_manager_gradient_midpoint:focus-visible {
                    opacity: 1;
                    background: var(--gradient-accent) !important;
                    z-index: 5;
                    outline: none;
                }
                .light_manager_gradient_controls {
                    gap: 4px;
                    flex-wrap: wrap;
                    min-height: 28px;
                }
                .light_manager_gradient_controls input,
                .light_manager_gradient_controls select {
                    -webkit-appearance: auto;
                    appearance: auto;
                    height: 28px !important;
                    min-height: 28px !important;
                    max-height: 28px !important;
                    min-width: 0 !important;
                    margin: 0 !important;
                    border: 1px solid var(--color-border);
                    border-radius: 0;
                    background: var(--color-back);
                    color: var(--color-text);
                    box-sizing: border-box;
                }
                .light_manager_gradient_controls input:focus-visible,
                .light_manager_gradient_controls select:focus-visible {
                    outline: 2px solid var(--gradient-accent);
                    outline-offset: -2px;
                }
                .light_manager_gradient_color {
                    flex: 0 0 42px;
                    width: 42px !important;
                    min-width: 42px !important;
                    max-width: 42px !important;
                    padding: 2px !important;
                    cursor: pointer;
                }
                .light_manager_gradient_hex {
                    flex: 0 0 98px;
                    width: 98px !important;
                    min-width: 86px !important;
                    padding: 0 7px;
                    font-family: var(--font-code, monospace);
                    text-transform: uppercase;
                }
                .light_manager_gradient_position {
                    flex: 0 0 76px;
                    width: 76px !important;
                    min-width: 66px !important;
                    padding: 0 5px;
                    text-align: right;
                }
                .light_manager_gradient_percent {
                    margin-left: -3px;
                    color: var(--color-subtle_text);
                    font-size: 12px;
                    line-height: 28px;
                }
                .light_manager_gradient_space,
                .light_manager_gradient_interpolation {
                    flex: 1 1 150px;
                    width: auto !important;
                    padding: 0 24px 0 7px;
                }
                .light_manager_gradient_editor.compact {
                    --gradient-handle-space: 14px;
                    --gradient-edge-inset: 10px;
                    gap: 2px;
                }
                .light_manager_gradient_editor.compact .light_manager_gradient_header { min-height: 24px; }
                .light_manager_gradient_editor.compact .light_manager_gradient_toolbar { gap: 0; }
                .light_manager_gradient_editor.compact .light_manager_gradient_tool {
                    flex-basis: 24px !important;
                    width: 24px !important;
                    min-width: 24px !important;
                    max-width: 24px !important;
                    height: 24px !important;
                    min-height: 24px !important;
                    max-height: 24px !important;
                }
                .light_manager_gradient_editor.compact .light_manager_gradient_controls { display: none; }
                .light_manager_gradient_editor.compact .light_manager_gradient_stop {
                    transform: translateX(-50%) scale(.9) !important;
                    transform-origin: top center;
                }
                .light_manager_gradient_picker_host {
                    position: absolute;
                    z-index: 30;
                    width: 1px;
                    height: 1px;
                    pointer-events: none;
                }
                .light_manager_gradient_picker_host .light_manager_gradient_hidden_picker {
                    position: absolute !important;
                    inset: 0 auto auto 0;
                    width: 1px !important;
                    min-width: 1px !important;
                    height: 1px !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    opacity: 0;
                    overflow: visible;
                    pointer-events: none;
                }
                .light_manager_gradient_picker_host .sp-replacer {
                    width: 1px !important;
                    min-width: 1px !important;
                    height: 1px !important;
                    min-height: 1px !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    border: 0 !important;
                    opacity: 0;
                    pointer-events: none;
                }
            `);
            deletables.push(gradientEditorStyles);

            const panelSearchStateStyles = Blockbench.addCSS(
                `button.light_manager_panel_search_active.selected,
                button.light_manager_panel_search_active:focus-visible,
                button.light_manager_panel_search_collapse:focus-visible {
                    color: var(--color-text) !important;
                }
                button.light_manager_panel_search_active:hover,
                button.light_manager_panel_search_collapse:hover {
                    color: var(--color-accent) !important;
                }
                button.horizontal_select_btn:hover:not(.disabled) {
                    color: var(--color-text) !important;
                }`,
                'base'
            );
            deletables.push(panelSearchStateStyles);


            const lightManagerFormElementTypes = [
                'advanced_color',
                'combo_slider',
                'compact_select',
                'enum_select',
                'horizontal_select',
                'compact_text',
                'bar_display',
                'panel_search',
                'custom_checkbox',
                'action_toggle',
                'action_button',
                'custom_vector',
                'gradient_editor'
            ];
            for (const typeId of lightManagerFormElementTypes) {
                const Type = FormElement.types[typeId];
                if (!Type || Type.prototype._lightManagerFormStateWrapped) continue;
                const originalSetup = Type.prototype.setup;
                Type.prototype.setup = function () {
                    originalSetup.call(this);
                    const variant = String(this.options?.variant || '').replace(/[^a-z0-9_-]/gi, '');
                    if (variant && this.bar) {
                        this.bar.classList.add(`light_manager_form_variant_${variant}`);
                    }
                    setupLightManagerFormElementState(this);
                };
                Type.prototype._lightManagerFormStateWrapped = true;
            }

            window.applyIndestructibleFormGroups = applyIndestructibleFormGroups;
            lightManagerUIApi = {
                designVersion: 3,
                state: LightflowUIState,
                captureFormView: captureLightflowFormView,
                restoreFormView: restoreLightflowFormView,
                applyFormGroups: window.applyIndestructibleFormGroups,
                addCompactPanelStyles: addLightManagerCompactPanelStyles,
                addDesignedPanelStyles: addLightManagerDesignedPanelStyles,
                formDesign: LightManagerFormDesign,
                markerColor: getLightManagerMarkerColor,
                markerPresets: LIGHT_MANAGER_UI_MARKER_PRESETS,
                GridMenu: LightManagerGridMenu,
                IdentityMenu: LightManagerIdentityMenu,
                ActionToggle: LightManagerActionToggle,
                formElementTypes: lightManagerFormElementTypes.slice(),
                gradient: LightManagerGradient,
                GradientEditor: FormElement.types.gradient_editor
            };
            window.LightManagerUI = lightManagerUIApi;
            lightManagerUIApi.workspace = createLightflowWorkspace();
            deletables.push(lightManagerUIApi.workspace);

            const compactWidgetStyles = Blockbench.addCSS(
                `.select_menu li.marked > span {
                    text-decoration: underline;
                }

                li.light_manager_identity_colored_item {
                    background: linear-gradient(90deg, var(--light-manager-identity-color) 0px, var(--color-bright_ui) 32px) !important;
                }
                li.light_manager_identity_colored_item:hover,
                li.light_manager_identity_colored_item.focused {
                    background: linear-gradient(90deg, var(--light-manager-identity-color) 0px, var(--color-bright_ui) 50%) !important;
                    color: var(--color-accent_text) !important;
                }
                li.light_manager_identity_colored_item.marked {
                    background: linear-gradient(90deg, var(--light-manager-identity-color) 0px, var(--color-bright_ui) 100%) !important;
                    color: var(--color-accent_text) !important;
                }
                li.light_manager_identity_colored_item > i:first-child,
                li.light_manager_identity_colored_item > .icon:first-child,
                li.light_manager_identity_colored_item > svg:first-child {
                    color: #17191f !important;
                    fill: #17191f !important;
                }

                .compact_dropdown_select {
                    display: flex !important;
                    align-items: center;
                    justify-content: center;
                    padding: 0 4px !important;
                    cursor: pointer;
                    position: relative;
                    width: auto !important;
                    min-width: 32px;
                }

                .compact_dropdown_select:hover {
                    background-color: var(--color-button);
                }

                .compact_dropdown_select .main_icon_wrapper {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px; /* Icon size. */
                }

                .compact_dropdown_select .dropdown_arrow {
                    font-size: 10px;
                    margin-left: 4px;
                    color: var(--color-text);
                    opacity: 0.6;
                }

                ul.light_manager_grid_menu {
                    width: var(--light-manager-grid-width) !important;
                    min-width: var(--light-manager-grid-width) !important;
                    max-width: var(--light-manager-grid-width) !important;
                    padding: var(--light-manager-grid-padding) !important;
                    white-space: normal !important;
                    font-size: 0;
                    box-sizing: border-box;
                }
                ul.light_manager_grid_menu > li.light_manager_grid_menu_item {
                    position: relative;
                    display: inline-flex !important;
                    align-items: center;
                    justify-content: center;
                    vertical-align: top;
                    width: var(--light-manager-grid-cell-size) !important;
                    min-width: var(--light-manager-grid-cell-size) !important;
                    height: var(--light-manager-grid-cell-size) !important;
                    min-height: var(--light-manager-grid-cell-size) !important;
                    padding: 3px !important;
                    margin: 0 !important;
                    border: 0 !important;
                    border-radius: 7px;
                    box-sizing: border-box;
                    background: transparent !important;
                    background-clip: content-box !important;
                    transition: background-color 90ms ease, transform 90ms ease;
                }
                ul.light_manager_grid_menu > li.light_manager_grid_menu_item > span,
                ul.light_manager_grid_menu > li.light_manager_grid_menu_item > label {
                    display: none !important;
                }
                ul.light_manager_grid_menu > li.light_manager_grid_menu_item > i,
                ul.light_manager_grid_menu > li.light_manager_grid_menu_item > svg,
                ul.light_manager_grid_menu > li.light_manager_grid_menu_item > .icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    height: 100%;
                    margin: 0 !important;
                    font-size: 24px;
                    line-height: 1;
                    pointer-events: none;
                }
                ul.light_manager_grid_menu > li.light_manager_grid_menu_item::after {
                    content: '';
                    position: absolute;
                    inset: 3px;
                    border: 1px solid transparent;
                    border-radius: 5px;
                    box-sizing: border-box;
                    pointer-events: none;
                }
                ul.light_manager_grid_menu > li.light_manager_grid_menu_item:hover:not(.marked),
                ul.light_manager_grid_menu > li.light_manager_grid_menu_item.focused:not(.marked) {
                    background: color-mix(in srgb, var(--color-accent) 20%, transparent) !important;
                    background-clip: content-box !important;
                }
                ul.light_manager_grid_menu > li.light_manager_grid_menu_item:hover:not(.marked)::after,
                ul.light_manager_grid_menu > li.light_manager_grid_menu_item.focused:not(.marked)::after {
                    /*border-color: color-mix(in srgb, var(--color-accent) 46%, transparent);*/
                }
                ul.light_manager_grid_menu > li.light_manager_grid_menu_item.marked {
                    background: color-mix(in srgb, var(--color-accent) 28%, transparent) !important;
                    background-clip: content-box !important;
                }
                ul.light_manager_grid_menu > li.light_manager_grid_menu_item.marked::after {
                    border: 2px solid var(--color-accent);
                    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-accent) 28%, transparent);
                }
                ul.light_manager_grid_menu > li.light_manager_grid_menu_item.marked > i,
                ul.light_manager_grid_menu > li.light_manager_grid_menu_item.marked > svg,
                ul.light_manager_grid_menu > li.light_manager_grid_menu_item.marked > .icon {
                    transform: scale(1.08);
                    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.28));
                }
                ul.light_manager_grid_menu > li.light_manager_identity_custom_icon_item {
                    background: color-mix(in srgb, var(--color-axis-y) 22%, transparent) !important;
                    background-clip: content-box !important;
                }

                .horizontal_select_widget {
                    display: flex;
                    align-items: stretch;
                    border-radius: 2px;
                    overflow: hidden;
                    box-sizing: border-box;
                    height: 30px; /* Standard Blockbench toolbar height */
                    user-select: none;
                }
                .horizontal_select_btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 10px;
                    cursor: pointer;
                    transition: background 0.15s ease, color 0.15s ease;
                    color: var(--color-text);
                    background: transparent;
                    min-width: 32px;
                }
                .horizontal_select_btn:hover:not(.disabled) {
                    background: var(--color-button);
                }
                .horizontal_select_btn.selected {
                    background: var(--color-accent);
                    color: var(--color-light) !important; /* Overrides custom colors when selected for readability */
                }
                .horizontal_select_btn.disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                    filter: grayscale(100%);
                }
                .horizontal_select_icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.1em;
                }
                .horizontal_select_btn:not(.icon_only) .horizontal_select_icon {
                    margin-right: 6px;
                }
                .horizontal_select_label {
                    font-size: 13px;
                    white-space: nowrap;
                }
            `
            );
            deletables.push(compactWidgetStyles);


            const installLightIconTextures = sources => {
                Object.entries(sources || {}).forEach(([key, source]) => {
                    if (!source) return;
                    const previous = lightTextures[key];
                    let texture = null;
                    texture = new THREE.TextureLoader().load(source, () => {
                        if (lightTextures[key] !== texture) {
                            texture.dispose?.();
                            return;
                        }
                        if (previous && previous !== texture) previous.dispose?.();
                        window.LightElement?.all?.forEach?.(element => {
                            if (element?.light_type === key) {
                                window.LightElement.preview_controller?.updateSelection?.(element, { gizmos: false });
                            }
                        });
                    });
                    texture.magFilter = texture.minFilter = THREE.NearestFilter;
                    lightTextures[key] = texture;
                });
            };
            installLightIconTextures(lightIconSources);
            window.LightManagerRefreshIconTextures = installLightIconTextures;

            // Safe until the panel factory below replaces it. Keeping this in
            // the element scope lets select/unselect refresh immediately.
            let refreshLightPropertiesPanel = () => {};

            class LightElement extends OutlinerElement {
                constructor(data, uuid) {
                    super(data, uuid);
                    for (let key in LightElement.properties) {
                        LightElement.properties[key].reset(this);
                    }
                    if (data && typeof data === 'object') {
                        this.extend(data);
                    }
                    LightManagerUtils.sanitizeLight(this);
                    this.updateLightIcon();
                }
                // Dynamically updates the Blockbench icon depending on the light type
                updateLightIcon() {
                    const iconMap = { point: 'lightbulb', directional: 'light_mode', spot: 'highlight' };
                    this.icon = iconMap[this.light_type] || 'lightbulb';
                    if (typeof this.updateElement === 'function') {
                        this.updateElement();
                    }
                    this.render_color = this.color;
                    this.render_intensity = this.intensity;
                }

                get origin() { return this.position; }

                getWorldCenter() { return THREE.fastWorldPosition(this.mesh, Reusable.vec2); }

                extend(object) {
                    for (let key in LightElement.properties) {
                        LightElement.properties[key].merge(this, object);
                    }
                    LightManagerUtils.sanitizeLight(this);
                    this.sanitizeName();
                    this.updateLightIcon(); // Call update on extend/undo changes
                    return this;
                }

                getUndoCopy() {
                    let copy = new LightElement(this);
                    copy.uuid = this.uuid;
                    delete copy.parent;
                    return copy;
                }

                getSaveCopy() {
                    let el = {};
                    for (let key in LightElement.properties) {
                        LightElement.properties[key].copy(this, el);
                    }
                    el.type = 'light';
                    el.uuid = this.uuid;
                    return el;
                }

                select(event, isOutlinerClick) {
                    this.render_rotation = this.rotation;
                    super.select(event, isOutlinerClick);
                    window.LightManagerViewportControls?.updateAll();
                    refreshLightPropertiesPanel();
                    if (Animator.open && Animation.selected) {
                        let animator = Animation.selected.getBoneAnimator(this);
                        if (animator) animator.select(true);
                    }
                    return this;
                }

                unselect(...args) {
                    super.unselect(...args);
                    window.LightManagerViewportControls?.updateAll();
                    refreshLightPropertiesPanel();
                    if (Animator.open && Timeline.selected_animator && Timeline.selected_animator.element === this) {
                        Timeline.selected_animator.selected = false;
                    }
                }

                static behavior = {
                    unique_name: true,
                    movable: true,
                    rotatable: true, // Allowing rotation is now necessary to orient Directional and Spot lights
                    parent_types: ['root', 'group', 'armature_bone'],
                    hide_in_screenshot: true,
                }
            }
            window.LightElement = LightElement;

            LightElement.prototype.title = 'Light';
            LightElement.prototype.type = 'light';
            LightElement.prototype.icon = 'lightbulb';
            LightElement.prototype.movable = true;
            LightElement.prototype.rotatable = true; // Enable rotation gizmo
            LightElement.prototype.name_regex = () => Format.node_name_regex ?? 'a-zA-Z0-9_';
            LightElement.prototype.needsUniqueName = true;

            LightElement.prototype.menu = new Menu([
                'edit_light_properties',
                'fit_light_bounds_to_selection',
                '_',
                ...Outliner.control_menu_group,
                '_',
                'rename',
                'delete'
            ]);

            LightElement.prototype.buttons = [
                Outliner.buttons.export,
                Outliner.buttons.locked,
                Outliner.buttons.visibility,
            ];

            const lightElementProperties = [
                new Property(LightElement, 'string', 'name', { default: 'light' }),
                new Property(LightElement, 'string', 'light_type', { default: 'point' }),
                new Property(LightElement, 'vector', 'position'),
                new Property(LightElement, 'vector', 'rotation'),
                new Property(LightElement, 'vector', 'render_rotation', { default: [0, 0, 0] }),
                new Property(LightElement, 'vector', 'color', { default: [255, 255, 255] }),
                new Property(LightElement, 'vector', 'render_color', { default: [255, 255, 255] }),
                new Property(LightElement, 'number', 'intensity', { default: 1, min: 0 }),
                new Property(LightElement, 'number', 'render_intensity', { default: 1, min: 0 }),
                new Property(LightElement, 'boolean', 'key_light_enabled', { default: true }),
                new Property(LightElement, 'number', 'key_light_weight', { default: 1, min: 0, max: 100 }),
                new Property(LightElement, 'number', 'temperature', { default: 6500, min: 2700, max: 6500 }),
                new Property(LightElement, 'number', 'distance', { default: 0, min: 0 }),
                new Property(LightElement, 'number', 'angle', { default: 45, min: 0, max: 90 }),
                new Property(LightElement, 'number', 'penumbra', { default: 0, min: 0, max: 1 }),
                new Property(LightElement, 'boolean', 'visibility', { default: true }),
                new Property(LightElement, 'boolean', 'has_shadow', { default: true }),
                new Property(LightElement, 'number', 'shadow_resolution', { default: 1024 }),
                new Property(LightElement, 'number', 'studio_shadow_resolution', { default: 0 }),
                new Property(LightElement, 'number', 'shadow_bias', { default: DEFAULT_SHADOW_BIAS }),
                new Property(LightElement, 'number', 'shadow_normal_bias', { default: DEFAULT_SHADOW_NORMAL_BIAS, description: 'property.shadow_normal_bias.desc' }),
                new Property(LightElement, 'number', 'shadow_softness', { default: DEFAULT_SHADOW_SOFTNESS, min: 0, description: 'property.shadow_softness.desc' }),
                new Property(LightElement, 'number', 'shadow_near', { default: 0.1, min: 0 }),
                new Property(LightElement, 'number', 'shadow_far', { default: 200, min: 0 }),
                new Property(LightElement, 'number', 'shadow_bounds', { default: 35, min: 0 })
            ];
            deletables.push(...lightElementProperties);

            OutlinerElement.registerType(LightElement, 'light');

            class ArtKeyElement extends OutlinerElement {
                constructor(data, uuid) {
                    super(data, uuid);
                    for (const key in ArtKeyElement.properties) ArtKeyElement.properties[key].reset(this);
                    if (data && typeof data === 'object') this.extend(data);
                    LightManagerUtils.sanitizeArtKey(this);
                }

                get position() { return this.origin; }
                getWorldCenter() { return THREE.fastWorldPosition(this.mesh, Reusable.vec2); }
                size(axis) {
                    const dimensions = [0, 1, 2].map(index => (
                        window.LightManagerArtKeys.baseSize * Math.max(0.001, Math.abs(Number(this.scale?.[index]) || 1))
                    ));
                    return Number.isInteger(axis) ? dimensions[axis] : dimensions;
                }

                moveVector(value, axis, update = true) {
                    const vector = typeof value === 'number'
                        ? [axis === 0 ? value : 0, axis === 1 ? value : 0, axis === 2 ? value : 0]
                        : value instanceof THREE.Vector3 ? value.toArray() : value;
                    if (!Array.isArray(vector)) return this;
                    vector.forEach((entry, index) => { this.origin[index] += Number(entry) || 0; });
                    if (update) this.preview_controller?.updateTransform?.(this);
                    TickUpdates.selection = true;
                    return this;
                }

                resize(value, axis, negative) {
                    const current = Math.max(0.001, Number(this.scale?.[axis]) || 1);
                    let next;
                    if (typeof value === 'function') {
                        next = value(current);
                    } else {
                        const signedWorldDelta = (Number(value) || 0) * (negative ? -1 : 1);
                        let originalWorldSize = this.temp_data?.old_size;
                        if (Array.isArray(originalWorldSize)) originalWorldSize = originalWorldSize[axis];
                        if (!Number.isFinite(Number(originalWorldSize))) originalWorldSize = current * window.LightManagerArtKeys.baseSize;
                        next = (Number(originalWorldSize) + signedWorldDelta) / window.LightManagerArtKeys.baseSize;
                    }
                    this.scale[axis] = Math.max(0.001, Number(next) || 0.001);
                    this.preview_controller?.updateTransform?.(this);
                    TickUpdates.selection = true;
                    return this;
                }

                extend(object) {
                    const source = object?.type === 'light' && object?.light_type === 'art_key'
                        ? {
                            ...object,
                            origin: object.position || object.origin,
                            scale: Array.isArray(object.scale) ? object.scale : (object.art_size || [32, 32, 32]).map(value => (Number(value) || 32) / 32),
                            art_radius: object.art_radius ?? 8
                        }
                        : object;
                    for (const key in ArtKeyElement.properties) ArtKeyElement.properties[key].merge(this, source || {});
                    LightManagerUtils.sanitizeArtKey(this);
                    this.sanitizeName();
                    return this;
                }

                getUndoCopy() {
                    const copy = new ArtKeyElement(this);
                    copy.uuid = this.uuid;
                    delete copy.parent;
                    return copy;
                }

                getSaveCopy() {
                    const copy = {};
                    for (const key in ArtKeyElement.properties) ArtKeyElement.properties[key].copy(this, copy);
                    copy.type = 'art_key';
                    copy.uuid = this.uuid;
                    return copy;
                }

                select(event, isOutlinerClick) {
                    super.select(event, isOutlinerClick);
                    this.preview_controller?.updateSelection?.(this);
                    refreshLightPropertiesPanel();
                    return this;
                }

                unselect(...args) {
                    super.unselect(...args);
                    this.preview_controller?.updateSelection?.(this);
                    refreshLightPropertiesPanel();
                }

                static behavior = {
                    unique_name: true,
                    movable: true,
                    scalable: true,
                    resizable: true,
                    rotatable: true,
                    has_pivot: true,
                    parent_types: ['root', 'group', 'armature_bone'],
                    hide_in_screenshot: true
                };
            }

            window.ArtKeyElement = ArtKeyElement;
            ArtKeyElement.prototype.title = 'Art Key';
            ArtKeyElement.prototype.type = 'art_key';
            ArtKeyElement.prototype.icon = 'flare';
            ArtKeyElement.prototype.movable = true;
            ArtKeyElement.prototype.scalable = true;
            ArtKeyElement.prototype.resizable = true;
            ArtKeyElement.prototype.rotatable = true;
            ArtKeyElement.prototype.name_regex = () => Format.node_name_regex ?? 'a-zA-Z0-9_';
            ArtKeyElement.prototype.needsUniqueName = true;
            ArtKeyElement.prototype.menu = new Menu([
                'edit_light_properties',
                '_',
                ...Outliner.control_menu_group,
                '_',
                'rename',
                'delete'
            ]);
            ArtKeyElement.prototype.buttons = [Outliner.buttons.export, Outliner.buttons.locked, Outliner.buttons.visibility];

            const artKeyElementProperties = [
                new Property(ArtKeyElement, 'string', 'name', { default: 'Art_Key' }),
                new Property(ArtKeyElement, 'string', 'light_type', { default: 'art_key' }),
                new Property(ArtKeyElement, 'vector', 'origin'),
                new Property(ArtKeyElement, 'vector', 'rotation'),
                new Property(ArtKeyElement, 'vector', 'scale', { default: [1, 1, 1] }),
                new Property(ArtKeyElement, 'vector', 'color', { default: [255, 210, 140] }),
                new Property(ArtKeyElement, 'vector', 'render_color', { default: [255, 210, 140] }),
                new Property(ArtKeyElement, 'number', 'intensity', { default: 1, min: 0 }),
                new Property(ArtKeyElement, 'number', 'render_intensity', { default: 1, min: 0 }),
                new Property(ArtKeyElement, 'boolean', 'key_light_enabled', { default: true }),
                new Property(ArtKeyElement, 'number', 'key_light_weight', { default: 1, min: 0, max: 100 }),
                new Property(ArtKeyElement, 'string', 'art_mode', { default: 'point' }),
                new Property(ArtKeyElement, 'number', 'art_radius', { default: 8, min: 0 }),
                new Property(ArtKeyElement, 'string', 'art_scope', { default: 'box' }),
                new Property(ArtKeyElement, 'array', 'art_include', { default: [] }),
                new Property(ArtKeyElement, 'array', 'art_exclude', { default: [] }),
                new Property(ArtKeyElement, 'number', 'art_softness', { default: 0.15, min: 0, max: 1 }),
                new Property(ArtKeyElement, 'boolean', 'visibility', { default: true }),
                new Property(ArtKeyElement, 'boolean', 'locked', { default: false })
            ];
            deletables.push(...artKeyElementProperties);
            OutlinerElement.registerType(ArtKeyElement, 'art_key');

            const updateArtKeyPreview = element => {
                const mesh = element?.mesh;
                if (!mesh) return;
                const helperVisible = lightManagerUIApi?.workspace?.helperVisible || (options => options.visible !== false);
                const visible = helperVisible({
                    visible: element.visibility !== false,
                    selected: !!element.selected
                });
                const markerVisible = helperVisible({
                    visible: element.visibility !== false,
                    selected: !!element.selected,
                    kind: 'marker'
                });
                const color = LightManagerUtils.colorArray(element.color).map(channel => channel / 255);
                mesh.boxGizmo?.material?.color?.setRGB(...color);
                mesh.sourceGizmo?.material?.color?.setRGB(...color);
                mesh.directionGizmo?.material?.color?.setRGB(...color);
                if (mesh.boxGizmo) {
                    mesh.boxGizmo.visible = visible;
                    mesh.boxGizmo.material.opacity = element.selected ? 0.9 : 0.38;
                }
                const radius = Math.max(0, Number(element.art_radius) || 0);
                if (mesh.sourceGizmo) {
                    mesh.sourceGizmo.visible = markerVisible && element.art_mode !== 'direction';
                    mesh.updateWorldMatrix(true, false);
                    mesh.getWorldPosition(mesh.sourceGizmo.position);
                    mesh.sourceGizmo.scale.setScalar(radius);
                }
                const scale = [0, 1, 2].map(index => Math.max(0.001, Math.abs(Number(element.scale?.[index]) || 1)));
                if (mesh.directionGizmo) {
                    mesh.directionGizmo.visible = markerVisible && element.art_mode === 'direction';
                    mesh.directionGizmo.scale.set(1 / scale[0], 1 / scale[1], 1 / scale[2]);
                }
                if (mesh.selectionProxy) mesh.selectionProxy.visible = element.visibility !== false;
            };

            artKeyPreviewController = new NodePreviewController(ArtKeyElement, {
                setup(element) {
                    const mesh = new THREE.Object3D();
                    Project.nodes_3d[element.uuid] = mesh;
                    mesh.name = element.uuid;
                    mesh.type = element.type;
                    mesh.isElement = true;
                    mesh.userData.lightflowNoShadow = true;
                    mesh.rotation.order = Format.euler_order || 'ZYX';

                    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffd28c, transparent: true, opacity: 0.38, depthWrite: false });
                    const boxSource = new THREE.BoxGeometry(window.LightManagerArtKeys.baseSize, window.LightManagerArtKeys.baseSize, window.LightManagerArtKeys.baseSize);
                    mesh.boxGizmo = new THREE.LineSegments(new THREE.EdgesGeometry(boxSource), lineMaterial);
                    boxSource.dispose();
                    mesh.boxGizmo.raycast = () => {};
                    mesh.add(mesh.boxGizmo);

                    const ringPoints = [];
                    for (let index = 0; index < 64; index++) {
                        const angle = index / 64 * Math.PI * 2;
                        ringPoints.push(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0));
                    }
                    mesh.sourceGizmo = new THREE.LineLoop(
                        new THREE.BufferGeometry().setFromPoints(ringPoints),
                        lineMaterial.clone()
                    );
                    mesh.sourceGizmo.raycast = () => {};
                    mesh.sourceGizmo.frustumCulled = false;
                    mesh.sourceGizmo.name = `art_key_glow_point_gizmo_${element.uuid}`;
                    mesh.sourceGizmo.renderOrder = 1002;
                    mesh.sourceGizmo.material.depthTest = false;
                    mesh.sourceGizmo.onBeforeRender = (_renderer, _scene, camera) => {
                        mesh.updateWorldMatrix(true, false);
                        mesh.getWorldPosition(mesh.sourceGizmo.position);
                        mesh.sourceGizmo.quaternion.copy(camera.quaternion);
                        mesh.sourceGizmo.updateMatrixWorld(true);
                    };
                    (Canvas.scene || mesh).add(mesh.sourceGizmo);

                    const arrowVertices = new Float32Array([0,0,0, 0,0,-12, 0,0,-12, -1.5,0,-9.5, 0,0,-12, 1.5,0,-9.5, 0,0,-12, 0,-1.5,-9.5, 0,0,-12, 0,1.5,-9.5]);
                    const arrowGeometry = new THREE.BufferGeometry();
                    arrowGeometry.setAttribute('position', new THREE.BufferAttribute(arrowVertices, 3));
                    mesh.directionGizmo = new THREE.LineSegments(arrowGeometry, lineMaterial.clone());
                    mesh.directionGizmo.raycast = () => {};
                    mesh.add(mesh.directionGizmo);

                    const proxyMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
                    mesh.selectionProxy = new THREE.Mesh(new THREE.BoxGeometry(window.LightManagerArtKeys.baseSize, window.LightManagerArtKeys.baseSize, window.LightManagerArtKeys.baseSize), proxyMaterial);
                    mesh.selectionProxy.name = element.uuid;
                    mesh.selectionProxy.type = element.type;
                    mesh.selectionProxy.isElement = true;
                    mesh.selectionProxy.userData.lightflowNoShadow = true;
                    mesh.add(mesh.selectionProxy);
                    mesh.geometry = new THREE.BufferGeometry();
                    mesh.geometry.boundingBox = new THREE.Box3().makeEmpty();
                    mesh.raycast = function(raycaster, intersects) {
                        if (!this.selectionProxy || this.visible === false) return;
                        this.selectionProxy.updateMatrixWorld(true);
                        this.selectionProxy.raycast(raycaster, intersects);
                    };
                    this.updateTransform(element);
                    this.dispatchEvent('setup', { element });
                },
                updateTransform(element) {
                    NodePreviewController.prototype.updateTransform.call(this, element);
                    updateArtKeyPreview(element);
                    window.ShaderArchitectInvalidateArtKeys?.();
                    window.ShaderEngine?.requestPreviewRender?.({ cause: 'art_key_transform' });
                    this.dispatchEvent('update_transform', { element });
                },
                updateSelection(element) {
                    updateArtKeyPreview(element);
                    this.dispatchEvent('update_selection', { element });
                },
                remove(element) {
                    const mesh = element?.mesh;
                    [mesh?.boxGizmo, mesh?.sourceGizmo, mesh?.directionGizmo, mesh?.selectionProxy].forEach(object => {
                        object?.geometry?.dispose?.();
                        object?.material?.dispose?.();
                    });
                    mesh?.geometry?.dispose?.();
                    mesh?.removeFromParent?.();
                    if (Project?.nodes_3d?.[element.uuid] === mesh) delete Project.nodes_3d[element.uuid];
                    this.dispatchEvent('remove', { element });
                }
            });

            const armatureBoneChildTypes = window.ArmatureBone?.behavior?.child_types;
            const ownsArmatureBoneLightChildType = Array.isArray(armatureBoneChildTypes) &&
                !armatureBoneChildTypes.includes('light');
            if (ownsArmatureBoneLightChildType) armatureBoneChildTypes.push('light');
            if (ownsArmatureBoneLightChildType) {
                deletables.push({
                    delete() {
                        if (window.ArmatureBone?.behavior?.child_types !== armatureBoneChildTypes) return;
                        const index = armatureBoneChildTypes.indexOf('light');
                        if (index >= 0) armatureBoneChildTypes.splice(index, 1);
                    }
                });
            }
            if (Array.isArray(armatureBoneChildTypes) && !armatureBoneChildTypes.includes('art_key')) {
                armatureBoneChildTypes.push('art_key');
                deletables.push({ delete() {
                    const index = armatureBoneChildTypes.indexOf('art_key');
                    if (index >= 0) armatureBoneChildTypes.splice(index, 1);
                }});
            }

            lightPreviewController = new NodePreviewController(LightElement, {
                setup(element) {
                    let mesh = new THREE.Object3D();
                    Project.nodes_3d[element.uuid] = mesh;

                    mesh.name = element.uuid;
                    mesh.type = element.type;
                    mesh.isElement = true;
                    mesh.visible = element.visibility;

                    mesh.rotation.order = Format.euler_order || 'ZYX';

                    let initialTexture = lightTextures[element.light_type] || lightTextures.point;
                    let material = new THREE.SpriteMaterial({
                        map: initialTexture,
                        alphaTest: 0.1,
                        sizeAttenuation: false
                    });

                    let sprite = new THREE.Sprite(material);
                    sprite.name = element.uuid;
                    sprite.type = element.type;
                    sprite.isElement = true;

                    mesh.add(sprite);
                    mesh.sprite = sprite;
                    // Blockbench only raycasts non-locator custom elements when element.mesh has geometry.
                    // Use a valid empty geometry so Box3.expandByObject can inspect it without changing model bounds.
                    let selectionGeometry = new THREE.BufferGeometry();
                    selectionGeometry.boundingBox = new THREE.Box3().makeEmpty();
                    mesh.geometry = selectionGeometry;
                    mesh.raycast = function (raycaster, intersects) {
                        if (!this.sprite || this.sprite.visible === false) return;
                        this.sprite.updateMatrixWorld(true);
                        this.sprite.raycast(raycaster, intersects);
                    };

                    // Directional and spot-light orientation guides share one material.
                    let gizmo = new THREE.Object3D();
                    let gizmoMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });

                    let arrowGeometry = new THREE.BufferGeometry();
                    let arrowVertices = new Float32Array([
                        0, 0, 0, 0, 0, -8,
                        0, 0, -8, -1.5, 0, -6.5,
                        0, 0, -8, 1.5, 0, -6.5,
                        0, 0, -8, 0, -1.5, -6.5,
                        0, 0, -8, 0, 1.5, -6.5
                    ]);
                    arrowGeometry.setAttribute('position', new THREE.BufferAttribute(arrowVertices, 3));
                    let arrow = new THREE.LineSegments(arrowGeometry, gizmoMaterial);
                    arrow.raycast = () => { };
                    gizmo.add(arrow);
                    gizmo.arrow = arrow;

                    let ringGeometry = new THREE.BufferGeometry();
                    let ringVertices = [];
                    let segments = 32;
                    for (let i = 0; i <= segments; i++) {
                        let theta = (i / segments) * Math.PI * 2;
                        ringVertices.push(Math.cos(theta), Math.sin(theta), -1);
                    }
                    ringGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ringVertices, 3));
                    let ring = new THREE.Line(ringGeometry, gizmoMaterial);
                    ring.raycast = () => { };
                    gizmo.add(ring);
                    gizmo.ring = ring;

                    let spotLinesGeometry = new THREE.BufferGeometry();
                    let spotLineVertices = new Float32Array([
                        0, 0, 0, 1, 0, -1,
                        0, 0, 0, -1, 0, -1,
                        0, 0, 0, 0, 1, -1,
                        0, 0, 0, 0, -1, -1
                    ]);
                    spotLinesGeometry.setAttribute('position', new THREE.BufferAttribute(spotLineVertices, 3));
                    let spotLines = new THREE.LineSegments(spotLinesGeometry, gizmoMaterial);
                    spotLines.raycast = () => { };
                    gizmo.add(spotLines);
                    gizmo.spot_lines = spotLines;

                    mesh.add(gizmo);
                    mesh.gizmo = gizmo;

                    mesh.fix_position = new THREE.Vector3();
                    mesh.fix_rotation = new THREE.Euler();

                    this.updateTransform(element);
                    this.dispatchEvent('setup', { element });
                },
                remove(element) {
                    const mesh = element?.mesh;
                    const disposedMaterials = new Set();

                    // NodePreviewController only disposes mesh.geometry. Light
                    // previews also own three child gizmo geometries and their
                    // per-light material, so removing many lights otherwise leaves
                    // exactly three renderer geometries alive for every light.
                    mesh?.gizmo?.children?.forEach(child => {
                        child?.geometry?.dispose?.();
                        const materials = Array.isArray(child?.material)
                            ? child.material
                            : [child?.material];
                        materials.forEach(material => {
                            if (!material || disposedMaterials.has(material)) return;
                            disposedMaterials.add(material);
                            material.dispose?.();
                        });
                    });
                    mesh?.sprite?.material?.dispose?.();

                    NodePreviewController.prototype.remove.call(this, element);
                },
                updateTransform(element) {
                    NodePreviewController.prototype.updateTransform.call(this, element);
                    if (
                        element.parent?.type === 'armature_bone' &&
                        element.parent.mesh &&
                        element.mesh.parent !== element.parent.mesh
                    ) {
                        element.parent.mesh.add(element.mesh);
                        element.mesh.updateMatrixWorld(true);
                    }
                    element.mesh.fix_position.copy(element.mesh.position);
                    element.mesh.fix_rotation.copy(element.mesh.rotation);
                    this.updateWindowSize(element);
                    window.update_light_element_callback?.({
                        shadows: true,
                        scene: false,
                        gizmos: true,
                        elements: [element],
                        cleanup: false
                    });
                },
                updateSelection(element, options = {}) {
                    let { mesh } = element;
                    if (!mesh?.sprite) return;

                    let desiredTexture = lightTextures[element.light_type] || lightTextures.point;
                    if (mesh.sprite.material.map !== desiredTexture) {
                        mesh.sprite.material.map = desiredTexture;
                        mesh.sprite.material.needsUpdate = true;
                    }

                    const previewColor = LightManagerUtils.colorArray(element.render_color || element.color);
                    let r = previewColor[0] / 255;
                    let g = previewColor[1] / 255;
                    let b = previewColor[2] / 255;
                    mesh.sprite.material.color.setRGB(r, g, b);

                    if (mesh.gizmo) {
                        mesh.gizmo.children.forEach(child => {
                            if (child.material) {
                                child.material.color.setRGB(r, g, b);
                                child.material.opacity = element.selected ? 1.0 : 0.25;
                            }
                        });

                        if (element.light_type === 'directional') {
                            mesh.gizmo.arrow.visible = true;
                            mesh.gizmo.ring.visible = false;
                            mesh.gizmo.spot_lines.visible = false;
                        } else if (element.light_type === 'spot') {
                            mesh.gizmo.arrow.visible = false;
                            mesh.gizmo.ring.visible = true;
                            mesh.gizmo.spot_lines.visible = true;

                            let dist = 8;
                            let safeAngle = LightManagerUtils.num(element.angle, 45, 0.1, 89.9);
                            let angleRadians = THREE.MathUtils.degToRad(safeAngle);
                            let radius = dist * Math.tan(angleRadians);

                            mesh.gizmo.ring.scale.set(radius, radius, dist);
                            mesh.gizmo.spot_lines.scale.set(radius, radius, dist);
                        } else {
                            mesh.gizmo.arrow.visible = false;
                            mesh.gizmo.ring.visible = false;
                            mesh.gizmo.spot_lines.visible = false;
                        }
                    }

                    const meshScale = element.selected ? 1.15 : 0.9;
                    mesh.scale.setScalar(meshScale);

                    // Marker size is a UI affordance, not a brightness meter.
                    // Keep the world-space guide independent from its screen marker.
                    if (mesh.gizmo) mesh.gizmo.scale.setScalar(1 / meshScale);
                    if (mesh.gizmo) mesh.gizmo.visible = lightManagerUIApi.workspace.helperVisible({visible: element.visibility !== false, selected: !!element.selected});
                    mesh.sprite.visible = lightManagerUIApi.workspace.helperVisible({visible: element.visibility !== false, selected: !!element.selected, kind: 'marker'});

                    mesh.sprite.material.depthTest = !element.selected;
                    mesh.renderOrder = element.selected ? 100 : 0;

                    if (options.gizmos !== false) {
                        window.LightManagerAreaGizmos?.updateAll();
                        window.LightManagerViewportControls?.updateAll();
                    }
                    this.dispatchEvent('update_selection', { element });
                },
                updateWindowSize(element) {
                    const sprite = element?.mesh?.sprite;
                    if (
                        sprite?.scale &&
                        Preview.selected &&
                        Preview.selected.camera &&
                        Preview.selected.height > 0
                    ) {
                        let size = 0.4 * Preview.selected.camera.fov / Preview.selected.height;
                        sprite.scale.setScalar(size);
                    }
                }
            });

            const migrateLegacyArtKeyTemplate = template => {
                const position = new THREE.Vector3().fromArray(template.position || template.origin || [0, 0, 0]);
                const offset = new THREE.Vector3().fromArray(template.art_point || [0, 0, 0]);
                const rotation = Array.isArray(template.rotation) ? template.rotation : [0, 0, 0];
                offset.applyEuler(new THREE.Euler(
                    THREE.MathUtils.degToRad(Number(rotation[0]) || 0),
                    THREE.MathUtils.degToRad(Number(rotation[1]) || 0),
                    THREE.MathUtils.degToRad(Number(rotation[2]) || 0),
                    Format.euler_order || 'ZYX'
                ));
                return {
                    ...template,
                    type: 'art_key',
                    origin: position.add(offset).toArray(),
                    scale: Array.isArray(template.scale) ? template.scale : (template.art_size || [32, 32, 32]).map(value => (Number(value) || 32) / 32),
                    art_radius: template.art_radius ?? 8
                };
            };

            const lightProjectHydrator = lightflowLifecycle?.registerHydrator?.(
                'light_manager_elements',
                ({ project, model, isCurrent, deferred }) => {
                    cancelLightManagerElementUpdate();
                    if (deferred) return;
                    if (project && !isCurrent()) return;
                    disposeRetiredLightManagerLights();
                    if (project) {
                        const modelElements = Array.isArray(model?.elements) ? model.elements : [];
                        const physicalModel = {
                            ...model,
                            elements: modelElements.filter(template => !(template?.type === 'light' && template?.light_type === 'art_key'))
                        };
                        const artKeyModel = {
                            ...model,
                            elements: modelElements.filter(template => template?.type === 'art_key').concat(
                                modelElements.filter(template => template?.type === 'light' && template?.light_type === 'art_key').map(migrateLegacyArtKeyTemplate)
                            )
                        };
                        lightflowLifecycle.restoreCustomElements(physicalModel, 'light', LightElement);
                        lightflowLifecycle.restoreCustomElements(artKeyModel, 'art_key', ArtKeyElement);
                    }
                    if (project && !isCurrent()) return;

                    // A project can legitimately contain no lights. Always do
                    // one full registry pass so lights owned by the previous
                    // tab/project are removed instead of leaking into it.
                    markLightManagerShadowsDirty({ scene: true });
                    window.update_light_element_callback?.({
                        immediate: true,
                        shadows: true,
                        scene: true,
                        gizmos: !!project,
                        cleanup: true,
                        preserveTopology: false
                    });
                }
            );
            if (lightProjectHydrator) deletables.push(lightProjectHydrator);

            // Timeline channel adapters
            const originalYCondition = KeyframeDataPoint.properties.y.condition;
            const originalZCondition = KeyframeDataPoint.properties.z.condition;
            const originalXDefault = KeyframeDataPoint.properties.x.default;
            const originalYDefault = KeyframeDataPoint.properties.y.default;
            const originalZDefault = KeyframeDataPoint.properties.z.default;

            const lightManagerYCondition = point => {
                if (point.keyframe.channel === 'intensity') return false;
                return typeof originalYCondition === 'function' ? originalYCondition(point) : true;
            };
            const lightManagerZCondition = point => {
                if (point.keyframe.channel === 'intensity') return false;
                return typeof originalZCondition === 'function' ? originalZCondition(point) : true;
            };

            const lightManagerXDefault = point => {
                let el = point.keyframe.animator.element;
                if (point.keyframe.channel === 'intensity') return el?.intensity ?? 1;
                if (point.keyframe.channel === 'color') return el?.color[0] ?? 255;
                if (point.keyframe.channel === 'rotation') return el?.rotation[0] ?? 0;
                return typeof originalXDefault === 'function' ? originalXDefault(point) : (originalXDefault || 0);
            };
            const lightManagerYDefault = point => {
                let el = point.keyframe.animator.element;
                if (point.keyframe.channel === 'color') return el?.color[1] ?? 255;
                if (point.keyframe.channel === 'rotation') return el?.rotation[1] ?? 0;
                return typeof originalYDefault === 'function' ? originalYDefault(point) : (originalYDefault || 0);
            };
            const lightManagerZDefault = point => {
                let el = point.keyframe.animator.element;
                if (point.keyframe.channel === 'color') return el?.color[2] ?? 255;
                if (point.keyframe.channel === 'rotation') return el?.rotation[2] ?? 0;
                return typeof originalZDefault === 'function' ? originalZDefault(point) : (originalZDefault || 0);
            };

            KeyframeDataPoint.properties.y.condition = lightManagerYCondition;
            KeyframeDataPoint.properties.z.condition = lightManagerZCondition;
            KeyframeDataPoint.properties.x.default = lightManagerXDefault;
            KeyframeDataPoint.properties.y.default = lightManagerYDefault;
            KeyframeDataPoint.properties.z.default = lightManagerZDefault;

            deletables.push({
                delete: () => {
                    if (KeyframeDataPoint.properties.y.condition === lightManagerYCondition) {
                        KeyframeDataPoint.properties.y.condition = originalYCondition;
                    }
                    if (KeyframeDataPoint.properties.z.condition === lightManagerZCondition) {
                        KeyframeDataPoint.properties.z.condition = originalZCondition;
                    }
                    if (KeyframeDataPoint.properties.x.default === lightManagerXDefault) {
                        KeyframeDataPoint.properties.x.default = originalXDefault;
                    }
                    if (KeyframeDataPoint.properties.y.default === lightManagerYDefault) {
                        KeyframeDataPoint.properties.y.default = originalYDefault;
                    }
                    if (KeyframeDataPoint.properties.z.default === lightManagerZDefault) {
                        KeyframeDataPoint.properties.z.default = originalZDefault;
                    }
                }
            });

            class LightAnimator extends BoneAnimator {
                constructor(uuid, animation, name) {
                    super(uuid, animation);
                    this.uuid = uuid;
                    this._name = name;
                }
                get name() {
                    let element = this.getElement();
                    return element ? element.name : this._name;
                }
                set name(name) {
                    this._name = name;
                }
                getElement() {
                    this.element = OutlinerNode.uuids[this.uuid];
                    return this.element;
                }
                select(element_is_selected) {
                    if (!this.getElement()) {
                        unselectAll();
                        return this;
                    }
                    if (this.getElement().locked) return;

                    if (element_is_selected !== true && this.element) {
                        this.element.select();
                    }
                    GeneralAnimator.prototype.select.call(this);

                    if (this[Toolbox.selected.animation_channel] && (Timeline.selected.length == 0 || Timeline.selected[0].animator != this)) {
                        let nearest;
                        this[Toolbox.selected.animation_channel].forEach(kf => {
                            if (Math.abs(kf.time - Timeline.time) < 0.002) nearest = kf;
                        });
                        if (nearest) nearest.select();
                    }

                    if (this.element && this.element.parent && this.element.parent !== 'root') {
                        this.element.parent.openUp();
                    }
                    return this;
                }
                doRender() {
                    this.getElement();
                    return (this.element && this.element.mesh);
                }
                displayPosition(arr, multiplier = 1) {
                    let mesh = this.element.mesh;
                    if (arr && mesh) {
                        mesh.position.x += arr[0] * multiplier * animationSign;
                        mesh.position.y += arr[1] * multiplier;
                        mesh.position.z += arr[2] * multiplier;
                    }
                    return this;
                }
                displayRotation(arr, multiplier = 1) {
                    if (!arr) return this;
                    let mesh = this.element.mesh;
                    if (arr && mesh) {
                        // The main mesh rotates. The Gizmo, being its child, will visually rotate automatically!
                        mesh.rotation.x += THREE.MathUtils.degToRad(arr[0] * multiplier);
                        mesh.rotation.y += THREE.MathUtils.degToRad(arr[1] * multiplier);
                        mesh.rotation.z += THREE.MathUtils.degToRad(arr[2] * multiplier);
                    }
                    this.element.render_rotation = [
                        arr[0] * multiplier,
                        arr[1] * multiplier,
                        arr[2] * multiplier
                    ];
                    return this;
                }
                displayColor(arr, multiplier = 1) {
                    let mesh = this.element.mesh;
                    if (arr && mesh && mesh.sprite) {
                        let base = LightManagerUtils.colorArray(this.element.color);
                        let r = base[0] + (arr[0] - base[0]) * multiplier;
                        let g = base[1] + (arr[1] - base[1]) * multiplier;
                        let b = base[2] + (arr[2] - base[2]) * multiplier;

                        mesh.sprite.material.color.setRGB(r / 255, g / 255, b / 255);
                        this.element.render_color = [r, g, b];

                        // Also update the directional Gizmo color during animation
                        if (mesh.gizmo) {
                            mesh.gizmo.children.forEach(child => {
                                if (child.material) {
                                    child.material.color.setRGB(r / 255, g / 255, b / 255);
                                }
                            });
                        }
                    }
                    return this;
                }
                displayIntensity(arr, multiplier = 1) {
                    let mesh = this.element.mesh;
                    if (arr && mesh) {
                        let baseIntensity = LightManagerUtils.num(this.element.intensity, 1, 0, 100000);
                        let finalIntensity = Math.max(0, baseIntensity + (arr[0] - baseIntensity) * multiplier);
                        let baseScale = Math.max(0.1, Math.sqrt(finalIntensity));
                        mesh.scale.setScalar(this.element.selected ? baseScale * 1.2 : baseScale);
                        this.element.render_intensity = finalIntensity;
                    }
                    return this;
                }
                displayFrame(multiplier = 1) {
                    if (!this.doRender()) return;
                    this.getElement();

                    if (!this.muted.position) this.displayPosition(this.interpolate('position'), multiplier);
                    if (!this.muted.rotation) this.displayRotation(this.interpolate('rotation'), multiplier);
                    if (!this.muted.color) this.displayColor(this.interpolate('color'), multiplier);
                    if (!this.muted.intensity) this.displayIntensity(this.interpolate('intensity'), multiplier);

                    this.element.mesh.updateMatrixWorld();
                    queueLightManagerAnimatedLight(this.element);
                }
            }

            window.LightAnimator = LightAnimator;
            LightAnimator.prototype.type = 'light';

            LightAnimator.prototype.channels = {
                position: { name: tl('timeline.position'), mutable: true, transform: true, max_data_points: 3 },
                rotation: { name: tl('timeline.rotation'), mutable: true, transform: true, max_data_points: 3 },
                color: { name: tl('property.light_color'), mutable: true, transform: true, max_data_points: 3 },
                intensity: { name: tl('property.light_intensity'), mutable: true, transform: true, max_data_points: 1 },
            };
            LightElement.animator = LightAnimator;

            let modeObserver = Blockbench.on('select_mode', (arg) => {
                if (arg.mode.id === 'animate') return;
                for (let light of LightElement.all) {
                    if (LightElement.preview_controller) {
                        LightElement.preview_controller.updateSelection(light);
                    }
                }
                for (const artKey of ArtKeyElement.all || []) {
                    ArtKeyElement.preview_controller?.updateSelection?.(artKey);
                }
            });
            deletables.push(modeObserver);

            const createLightFromProfile = (profileKey, undoLabel) => {
                const isArtKey = profileKey === 'art_key';
                const profile = isArtKey ? { light_type: 'art_key', intensity: 1, color: [255, 210, 140], art_radius: 8 } : (LIGHT_MANAGER_PROFILES[profileKey] || LIGHT_MANAGER_PROFILES.point_fill);
                Undo.initEdit({ outliner: true, elements: [], selection: true });

                const selectedNode = Array.isArray(window.Outliner?.selected) && Outliner.selected.length
                    ? Outliner.selected[Outliner.selected.length - 1]
                    : null;
                const selectedChildTypes = selectedNode?.getTypeBehavior?.('child_types');
                const parent = selectedNode?.getTypeBehavior?.('parent') &&
                    (!Array.isArray(selectedChildTypes) || selectedChildTypes.includes(isArtKey ? 'art_key' : 'light'))
                    ? selectedNode
                    : getCurrentGroup();
                let light = new (isArtKey ? ArtKeyElement : LightElement)().addTo(parent).init();

                if (Format.bone_rig && parent?.type === 'group' && Array.isArray(parent.origin)) {
                    light.extend(isArtKey ? { origin: parent.origin.slice() } : { position: parent.origin.slice() });
                }

                if (isArtKey) {
                    light.extend(profile);
                    light.name = 'Art_Key';
                    ArtKeyElement.preview_controller?.updateTransform?.(light);
                } else {
                    LightManagerUtils.applyConfig(light, profile);
                    light.updateLightIcon();
                }

                unselectAll();
                light.select();

                Undo.finishEdit(undoLabel, { outliner: true, elements: [light], selection: true });
                Blockbench.dispatchEvent(isArtKey ? 'add_art_key' : 'add_light', { object: light });
                window.update_light_element_callback?.({
                    shadows: !isArtKey,
                    scene: false,
                    gizmos: true,
                    elements: [light],
                    cleanup: false,
                    artKey: isArtKey
                });

                return light;
            };

            const normalizeBlockSnapStep = value => {
                const step = Math.abs(Number(value));
                return Number.isFinite(step) && step >= 0.001 ? step : 16;
            };
            const getBlockSnapOptions = action => {
                const options = action?.tool_config?.options || {};
                return {
                    position: options.position !== false,
                    scale: options.scale !== false,
                    snapToGrid: options.snap_to_grid === true,
                    step: normalizeBlockSnapStep(options.step)
                };
            };
            const snapBlockCoordinate = (value, step, anchor = 0) => (
                Math.round((value - anchor) / step) * step + anchor
            );
            const getBlockGridAnchor = step => Format?.centered_grid ? 0 : step / 2;

            const installBlockSnapRuntime = action => {
                const restorers = [];
                const isEnabled = () => !!action?.value && !!Modes?.edit;
                const editTransformModule = window.TransformerModule?.modules?.edit;

                if (editTransformModule && typeof editTransformModule.calculateOffset === 'function') {
                    const originalCalculateOffset = editTransformModule.calculateOffset;
                    const patchedCalculateOffset = function lightflowBlockSnapCalculateOffset(context) {
                        const options = getBlockSnapOptions(action);
                        const toolId = Toolbox?.selected?.id;

                        if (isEnabled() && toolId === 'move_tool' && options.position) {
                            const rawValue = Number(context?.point?.[context.axis]) || 0;
                            const transformSpace = window.getEditTransformSpace?.();
                            const canUseGlobalGrid = options.snapToGrid && (transformSpace === 0 || transformSpace === undefined);

                            if (canUseGlobalGrid) {
                                if (this.previous_value == null) {
                                    const selectionCenter = window.getSelectionCenter?.();
                                    this._lightflowBlockSnapStartCenter = Array.isArray(selectionCenter)
                                        ? selectionCenter.slice(0, 3)
                                        : null;
                                    return 0;
                                }
                                const axisNumber = Number(context.axis_number);
                                const startCenter = this._lightflowBlockSnapStartCenter?.[axisNumber];
                                if (Number.isFinite(startCenter)) {
                                    const target = snapBlockCoordinate(
                                        startCenter + rawValue,
                                        options.step,
                                        getBlockGridAnchor(options.step)
                                    );
                                    return target - startCenter;
                                }
                            }
                            return Math.round(rawValue / options.step) * options.step;
                        }

                        if (isEnabled() && toolId === 'resize_tool' && options.scale) {
                            let axis = context.axis;
                            if (context.second_axis) {
                                if (axis === 'y') axis = 'z';
                                else if (context.second_axis === 'y') axis = 'y';
                                else if (context.second_axis === 'z') axis = 'x';
                            }
                            let resizeValue = axis === 'e'
                                ? context.point.length() * Math.sign(context.point.y || context.point.x)
                                : Number(context.point?.[axis]) || 0;
                            return Math.round(resizeValue / options.step) * options.step;
                        }

                        return originalCalculateOffset.call(this, context);
                    };
                    editTransformModule.calculateOffset = patchedCalculateOffset;
                    restorers.push(() => {
                        if (editTransformModule.calculateOffset === patchedCalculateOffset) {
                            editTransformModule.calculateOffset = originalCalculateOffset;
                        }
                        delete editTransformModule._lightflowBlockSnapStartCenter;
                    });
                }

                const patchSliderIntervals = (ids, optionKey) => {
                    ids.forEach(id => {
                        const slider = BarItems[id];
                        if (!slider || typeof slider.getInterval !== 'function') return;
                        const originalInterval = slider.interval;
                        const patchedInterval = function lightflowBlockSnapSliderInterval(event) {
                            const options = getBlockSnapOptions(action);
                            if (isEnabled() && options[optionKey]) return options.step;
                            return typeof originalInterval === 'function'
                                ? originalInterval.call(this, event)
                                : originalInterval;
                        };
                        slider.interval = patchedInterval;
                        restorers.push(() => {
                            if (slider.interval === patchedInterval) slider.interval = originalInterval;
                        });
                    });
                };
                patchSliderIntervals(['slider_pos_x', 'slider_pos_y', 'slider_pos_z'], 'position');
                patchSliderIntervals(['slider_size_x', 'slider_size_y', 'slider_size_z'], 'scale');

                const getRelativeMovementMapping = index => {
                    const preview = Preview?.selected;
                    if (!preview) return null;
                    const facing = preview.getFacingDirection();
                    const height = preview.getFacingHeight();
                    const axes = (facing === 'north' || facing === 'south')
                        ? [0, 2, 1]
                        : [2, 0, 1];
                    let mappedIndex = index;
                    let multiplier = 1;
                    if (height !== 'middle') {
                        if (mappedIndex === 1) mappedIndex = 2;
                        else if (mappedIndex === 2) mappedIndex = 1;
                    }
                    if (facing === 'south' && (mappedIndex === 0 || mappedIndex === 1)) multiplier *= -1;
                    if (facing === 'west' && mappedIndex === 0) multiplier *= -1;
                    if (facing === 'east' && mappedIndex === 1) multiplier *= -1;
                    if (mappedIndex === 2 && height !== 'down') multiplier *= -1;
                    if (mappedIndex === 1 && height === 'up') multiplier *= -1;
                    return { axis: axes[mappedIndex], multiplier };
                };
                const getNextBlockGridDelta = (position, direction, step) => {
                    const anchor = getBlockGridAnchor(step);
                    const normalized = (position - anchor) / step;
                    const targetIndex = direction > 0
                        ? Math.floor(normalized + 1e-7) + 1
                        : Math.ceil(normalized - 1e-7) - 1;
                    return anchor + targetIndex * step - position;
                };
                const moveActions = {
                    move_up: [-1, 2],
                    move_down: [1, 2],
                    move_left: [-1, 0],
                    move_right: [1, 0],
                    move_forth: [-1, 1],
                    move_back: [1, 1]
                };
                Object.entries(moveActions).forEach(([id, spec]) => {
                    const item = BarItems[id];
                    if (!item || typeof item.onClick !== 'function') return;
                    const originalOnClick = item.onClick;
                    const patchedOnClick = function lightflowBlockSnapMoveAction(event) {
                        const options = getBlockSnapOptions(action);
                        if (!isEnabled() || !options.position || Prop?.active_panel === 'uv') {
                            return originalOnClick.call(this, event);
                        }

                        const [baseDifference, index] = spec;
                        let inputDifference = baseDifference * options.step;
                        if (options.snapToGrid) {
                            const mapping = getRelativeMovementMapping(index);
                            const center = window.getSelectionCenter?.();
                            const centerValue = mapping && Array.isArray(center) ? center[mapping.axis] : NaN;
                            if (mapping && Number.isFinite(centerValue)) {
                                const direction = Math.sign(baseDifference * mapping.multiplier) || 1;
                                const targetDelta = getNextBlockGridDelta(centerValue, direction, options.step);
                                inputDifference = targetDelta / mapping.multiplier;
                            }
                        }
                        return window.moveElementsRelative?.(inputDifference, index, null);
                    };
                    item.onClick = patchedOnClick;
                    restorers.push(() => {
                        if (item.onClick === patchedOnClick) item.onClick = originalOnClick;
                    });
                });

                return {
                    delete() {
                        restorers.reverse().forEach(restore => restore());
                    }
                };
            };

            let blockSnapAction;
            const blockSnapToolConfig = new ToolConfig('lightflow_block_snap_options', {
                title: 'light_manager.action.block_snap',
                form: {
                    enabled: {
                        type: 'checkbox',
                        label: 'light_manager.block_snap.enabled',
                        value: false
                    },
                    position: {
                        type: 'checkbox',
                        label: 'light_manager.block_snap.position',
                        description: 'light_manager.block_snap.position.desc',
                        value: true
                    },
                    scale: {
                        type: 'checkbox',
                        label: 'light_manager.block_snap.scale',
                        description: 'light_manager.block_snap.scale.desc',
                        value: true
                    },
                    step: {
                        type: 'number',
                        label: 'light_manager.block_snap.step',
                        description: 'light_manager.block_snap.step.desc',
                        value: 16,
                        min: 0.001,
                        max: 1024,
                        step: 1
                    },
                    snap_to_grid: {
                        type: 'checkbox',
                        label: 'light_manager.block_snap.grid',
                        description: 'light_manager.block_snap.grid.desc',
                        value: false
                    }
                },
                onFormChange(result) {
                    if (blockSnapAction && blockSnapAction.value !== !!result.enabled) {
                        blockSnapAction.set(!!result.enabled);
                    }
                }
            });
            blockSnapAction = new LightManagerActionToggle('lightflow_block_snap', {
                name: 'light_manager.action.block_snap',
                description: 'light_manager.action.block_snap.desc',
                icon: 'grid_on',
                category: 'edit',
                condition: { modes: ['edit'] },
                default: false,
                save_on_restart: true,
                tool_config: blockSnapToolConfig,
                onChange(value) {
                    blockSnapToolConfig.options.enabled = value;
                    blockSnapToolConfig.form?.setValues?.({ enabled: value });
                    blockSnapToolConfig.save();
                }
            });
            blockSnapToolConfig.options.enabled = blockSnapAction.value;
            blockSnapToolConfig.save();
            deletables.push(blockSnapToolConfig, blockSnapAction);
            MenuBar.menus.edit.addAction(blockSnapAction, '9');
            Toolbars.main_tools?.add?.(blockSnapAction);
            deletables.push(installBlockSnapRuntime(blockSnapAction));

            const textureMeshEnhancements = installLightManagerTextureMeshEnhancements();
            if (textureMeshEnhancements) deletables.push(textureMeshEnhancements);
            const billboardEnhancements = installLightManagerBillboardEnhancements();
            if (billboardEnhancements) deletables.push(billboardEnhancements);

            const addArtKeyAction = new Action('add_art_key', {
                name: 'light_manager.art.add', icon: 'flare', category: 'edit',
                description: 'light_manager.art.hint', condition: () => Modes.edit || Modes.render,
                click() {
                    return createLightFromProfile('art_key', translateLightManager('light_manager.art.add'));
                }
            });
            deletables.push(addArtKeyAction);
            BarItems.add_element.side_menu.addAction(addArtKeyAction, '3');
            MenuBar.menus.edit.addAction(addArtKeyAction, '9');

            let addLightAction = new Action('add_light', {
                name: 'light_manager.action.add_point',
                description: 'light_manager.action.add_point.desc',
                icon: 'lightbulb',
                category: 'edit',
                condition: () => Modes.edit || Modes.render,
                click() {
                    return createLightFromProfile('point_fill', translateLightManager('light_manager.undo.add_point'));
                }
            });
            deletables.push(addLightAction);
            BarItems.add_element.side_menu.addAction(addLightAction, '3');
            MenuBar.menus.edit.addAction(addLightAction, '9');

            let addSpotLightAction = new Action('add_spot_light', {
                name: 'light_manager.action.add_spot',
                description: 'light_manager.action.add_spot.desc',
                icon: 'highlight',
                category: 'edit',
                condition: () => Modes.edit || Modes.render,
                click() {
                    return createLightFromProfile('spot_key', translateLightManager('light_manager.undo.add_spot'));
                }
            });
            deletables.push(addSpotLightAction);
            BarItems.add_element.side_menu.addAction(addSpotLightAction, '3');
            MenuBar.menus.edit.addAction(addSpotLightAction, '9');

            let addDirectionalLightAction = new Action('add_directional_light', {
                name: 'light_manager.action.add_directional',
                description: 'light_manager.action.add_directional.desc',
                icon: 'light_mode',
                category: 'edit',
                condition: () => Modes.edit || Modes.render,
                click() {
                    return createLightFromProfile('directional_sun', translateLightManager('light_manager.undo.add_directional'));
                }
            });
            deletables.push(addDirectionalLightAction);
            BarItems.add_element.side_menu.addAction(addDirectionalLightAction, '3');
            MenuBar.menus.edit.addAction(addDirectionalLightAction, '9');

            let lightManagerEditTool = new Tool('light_manager_edit_tool', {
                name: 'light_manager.tool.edit_gizmos',
                description: 'light_manager.tool.edit_gizmos.desc',
                icon: 'control_camera',
                category: 'tools',
                modes: ['edit', 'render'],
                selectElements: true,
                onSelect() {
                    window.LightManagerViewportControls?.updateAll();
                },
                onUnselect() {
                    window.LightManagerViewportControls?.updateAll();
                }
            });
            deletables.push(lightManagerEditTool);

            let lightManagerFreeMoveAction = new Action('light_manager_free_move', {
                name: 'light_manager.action.free_move',
                description: 'light_manager.action.free_move.desc',
                icon: 'open_with',
                category: 'edit',
                keybind: new Keybind({ key: 'g', shift: true }),
                condition: () => Modes.edit,
                click(event) {
                    window.LightManagerViewportControls?.requestFreeMove(event);
                }
            });
            deletables.push(lightManagerFreeMoveAction);
            MenuBar.menus.edit.addAction(lightManagerFreeMoveAction, '9');

            const updateAreaGizmoActionState = (action) => {
                const enabled = window.LightManagerAreaGizmos.enabled;
                action.name = translateLightManager(enabled ? 'light_manager.action.hide_area_gizmos' : 'light_manager.action.show_area_gizmos');
                action.icon = enabled ? 'visibility' : 'visibility_off';
                if (typeof action.update === 'function') action.update();
            };

            ViewOptionsDialog.form_config.show_light_area_gizmos = {
                label: 'dialog.preview_options.show_light_area_gizmos', type: 'checkbox',
                style: 'toggle_switch', value: window.LightManagerAreaGizmos.enabled
            };
            let previousViewOptionsOnFormChange = ViewOptionsDialog.onFormChange;
            let lightManagerViewOptionsOnFormChange = (result) => {
                if (result.show_light_area_gizmos !== undefined) {
                    window.LightManagerAreaGizmos.setEnabled(result.show_light_area_gizmos, { notify: false });
                }
                if (typeof previousViewOptionsOnFormChange === 'function') {
                    previousViewOptionsOnFormChange(result);
                }
                if (result.show_gizmos !== undefined || result.show_light_area_gizmos !== undefined) {
                    window.LightManagerAreaGizmos.updateAll();
                    window.LightManagerViewportControls?.updateAll();
                    notifyLightflowGizmoVisibilityChanged('view_options');
                }
            };
            ViewOptionsDialog.onFormChange = lightManagerViewOptionsOnFormChange;
            deletables.push({
                delete: () => {
                    if (ViewOptionsDialog.onFormChange === lightManagerViewOptionsOnFormChange) {
                        ViewOptionsDialog.onFormChange = previousViewOptionsOnFormChange;
                    }
                    delete ViewOptionsDialog.form_config.show_light_area_gizmos;
                }
            });

            let fitLightBoundsAction = new Action('fit_light_bounds_to_selection', {
                name: 'light_manager.action.fit_to_selection',
                description: 'light_manager.action.fit_to_selection.desc',
                icon: 'center_focus_strong',
                category: 'edit',
                condition: () => window.LightManagerFitTool.getSelectedLights().length > 0,
                click() {
                    window.LightManagerFitTool.openDialog();
                }
            });
            deletables.push(fitLightBoundsAction);
            MenuBar.menus.edit.addAction(fitLightBoundsAction, '9');

            let editLightPropertiesAction = new Action('edit_light_properties', {
                name: 'light_manager.action.edit_properties',
                description: 'light_manager.action.edit_properties.desc',
                icon: 'settings',
                category: 'edit',
                condition: () => (Array.isArray(LightElement.selected) && LightElement.selected.length > 0) ||
                    (Array.isArray(ArtKeyElement.selected) && ArtKeyElement.selected.length > 0),
                click() {
                    if (Array.isArray(ArtKeyElement.selected) && ArtKeyElement.selected.length) {
                        lightManagerUIApi.workspace.select(lightPropertiesPanel);
                        refreshLightPropertiesPanel(ArtKeyElement.selected[0]);
                        return;
                    }
                    let firstLight = LightElement.selected[0];
                    if (!firstLight) return;
                    LightManagerUtils.sanitizeLight(firstLight);

                    let currentHex = LightManagerUtils.colorHex(firstLight.color);
                    const selectedCount = LightElement.selected.length;

                    new Dialog('edit_light_properties_dialog', {
                        title: selectedCount === 1
                            ? translateLightManager('light_manager.dialog.edit.title_one')
                            : formatLightManagerMessage('light_manager.dialog.edit.title_many', { count: selectedCount }),
                        form: {
                            profile: {
                                label: translateLightManager('light_manager.field.quick_setup'),
                                type: 'select',
                                options: {
                                    keep: translateLightManager('light_manager.option.keep_values'),
                                    point_fill: translateLightManager('light_manager.profile.point_fill'),
                                    spot_key: translateLightManager('light_manager.profile.spot_key'),
                                    directional_sun: translateLightManager('light_manager.profile.directional_sun'),
                                    minecraft_optimized: translateLightManager('light_manager.profile.minecraft_optimized')
                                },
                                value: 'keep',
                                description: translateLightManager('light_manager.field.quick_setup.desc')
                            },
                            light_type: {
                                label: translateLightManager('property.light_type'),
                                type: 'select',
                                options: {
                                    point: translateLightManager('light_manager.option.point_radius'),
                                    directional: translateLightManager('light_manager.option.directional_sun'),
                                    spot: translateLightManager('light_manager.option.spot_cone')
                                },
                                value: firstLight.light_type
                            },
                            color: { label: translateLightManager('light_manager.property.color'), type: 'color', value: currentHex },
                            intensity: { label: translateLightManager('light_manager.property.brightness'), type: 'number', value: firstLight.intensity, min: 0, step: 0.1 },
                            key_light_enabled: { label: translateLightManager('light_manager.property.key_light_enabled'), type: 'checkbox', value: firstLight.key_light_enabled !== false },
                            key_light_weight: { label: translateLightManager('light_manager.property.key_light_weight'), description: translateLightManager('light_manager.property.key_light_weight.desc'), type: 'number', value: firstLight.key_light_weight ?? 1, min: 0, max: 100, step: 0.25, condition: form => form.key_light_enabled !== false },
                            distance: {
                                label: translateLightManager('light_manager.property.range'),
                                type: 'number',
                                value: firstLight.distance,
                                min: 0,
                                step: 0.5,
                                description: translateLightManager('light_manager.property.range.desc')
                            },
                            angle: {
                                label: translateLightManager('light_manager.property.spot_cone'),
                                type: 'number',
                                value: firstLight.angle,
                                min: 0.1,
                                max: 89.9,
                                step: 0.1,
                                description: translateLightManager('light_manager.property.spot_cone.desc')
                            },
                            penumbra: { label: translateLightManager('light_manager.property.spot_soft_edge'), type: 'number', value: firstLight.penumbra, min: 0, max: 1, step: 0.01 },
                            shadow_preset: {
                                label: translateLightManager('light_manager.property.shadow_preset'),
                                type: 'select',
                                options: {
                                    custom: translateLightManager('light_manager.option.use_values_below'),
                                    off: translateLightManager('light_manager.option.shadow_off'),
                                    preview: translateLightManager('light_manager.option.shadow_preview'),
                                    balanced: translateLightManager('light_manager.option.shadow_balanced'),
                                    crisp: translateLightManager('light_manager.option.shadow_crisp'),
                                    minecraft: translateLightManager('light_manager.option.shadow_minecraft')
                                },
                                value: 'custom'
                            },
                            has_shadow: { label: translateLightManager('light_manager.property.casts_shadows'), type: 'checkbox', value: firstLight.has_shadow },
                            shadow_resolution: { label: translateLightManager('light_manager.property.shadow_size'), type: 'select', options: { '256': '256', '512': '512', '1024': '1024', '2048': '2048', '4096': '4096' }, value: firstLight.shadow_resolution ? firstLight.shadow_resolution.toString() : '1024' },
                            studio_shadow_resolution: {
                                label: translateLightManager('property.studio_shadow_resolution'),
                                type: 'select',
                                options: {
                                    '0': translateLightManager('light_manager.option.shadow_same_preview'),
                                    '256': '256',
                                    '512': '512',
                                    '1024': '1024',
                                    '2048': '2048',
                                    '4096': '4096',
                                    '8192': '8192 — Render Pro',
                                    '16384': '16384 — Render Ultra'
                                },
                                value: firstLight.studio_shadow_resolution ? firstLight.studio_shadow_resolution.toString() : '0',
                                description: translateLightManager('property.studio_shadow_resolution.desc')
                            },
                            shadow_softness: {
                                label: translateLightManager('property.shadow_softness'),
                                type: 'number',
                                value: firstLight.shadow_softness !== undefined ? firstLight.shadow_softness : DEFAULT_SHADOW_SOFTNESS,
                                min: 0,
                                max: 16,
                                step: 0.05,
                                description: translateLightManager('property.shadow_softness.desc')
                            },
                            shadow_bias: { label: translateLightManager('property.shadow_bias'), type: 'number', value: firstLight.shadow_bias !== undefined ? firstLight.shadow_bias : DEFAULT_SHADOW_BIAS, step: 0.0001, description: translateLightManager('property.shadow_bias.desc') },
                            shadow_normal_bias: { label: translateLightManager('property.shadow_normal_bias'), type: 'number', value: firstLight.shadow_normal_bias !== undefined ? firstLight.shadow_normal_bias : LightManagerUtils.defaultShadowNormalBias(firstLight), step: 0.0001, description: translateLightManager('property.shadow_normal_bias.desc') },
                            shadow_near: { label: translateLightManager('light_manager.property.shadow_near'), type: 'number', value: firstLight.shadow_near !== undefined ? firstLight.shadow_near : 0.1, min: 0, step: 0.1 },
                            shadow_far: { label: translateLightManager('light_manager.property.shadow_far'), type: 'number', value: firstLight.shadow_far !== undefined ? firstLight.shadow_far : 200, min: 0.001, step: 1 },
                            shadow_bounds: {
                                label: translateLightManager('light_manager.property.sun_shadow_area'),
                                type: 'number',
                                value: firstLight.shadow_bounds !== undefined ? firstLight.shadow_bounds : 35,
                                min: 0.001,
                                step: 1,
                                description: translateLightManager('light_manager.property.sun_shadow_area.desc')
                            }
                        },
                        onConfirm(form_result) {
                            const selectedLights = LightElement.selected.slice();
                            const config = LightManagerUtils.resolveConfig(form_result, firstLight);

                            Undo.initEdit({ elements: selectedLights });

                            selectedLights.forEach(light => {
                                LightManagerUtils.applyConfig(light, config);
                                light.updateLightIcon();
                                LightElement.preview_controller?.updateSelection(light);
                            });

                            Undo.finishEdit(translateLightManager('light_manager.undo.edit_properties'));
                            updateSelection();
                            window.update_light_element_callback?.();
                        }
                    }).show();
                }
            });
            deletables.push(editLightPropertiesAction);
            MenuBar.menus.edit.addAction(editLightPropertiesAction, '9');

            window.LightManagerAreaGizmos.updateAll();
            window.LightManagerViewportControls.install();
            window.LightManagerViewportControls.updateAll();

            let syncingLightSettings = false;
            let activeLightUndoLabel = null;

            let lightPropertiesPanel;

            const getSelectedLights = () => [
                ...(Array.isArray(LightElement.selected) ? LightElement.selected : []),
                ...(Array.isArray(ArtKeyElement.selected) ? ArtKeyElement.selected : [])
            ].filter(Boolean);
            const getSelectedLight = () => getSelectedLights()[0] || null;
            const hasExclusiveLightSelection = () => {
                const lights = getSelectedLights();
                if (!lights.length) return false;
                const outlinerSelection = Array.isArray(window.Outliner?.selected) ? Outliner.selected : [];
                const hasNonLightElement = outlinerSelection.some(element => !(element instanceof LightElement) && !(element instanceof ArtKeyElement));
                const hasSelectedGroup = Array.isArray(window.Group?.selected) && Group.selected.length > 0;
                return !hasNonLightElement && !hasSelectedGroup;
            };

            const selectedLightCondition = () => !!getSelectedLight();
            const artLightCondition = () => getSelectedLight() instanceof ArtKeyElement || getSelectedLight()?.type === 'art_key';
            const physicalLightCondition = () => selectedLightCondition() && !artLightCondition();
            const artLabel = key => translateLightManager('light_manager.art.' + key);
            const editArtTargets = () => {
                const light = getSelectedLight(); if (!light || !artLightCondition()) return;
                const nodes = Array.from(new Set([
                    ...(Array.isArray(Outliner.elements) ? Outliner.elements : []),
                    ...(Array.isArray(window.Group?.all) ? Group.all : [])
                ])).filter(node => node?.type !== 'light' && node?.type !== 'art_key');
                const form = {};
                nodes.forEach((node, i) => { form['target_' + i] = { type: 'select', label: node.name,
                    options: { auto: artLabel('auto'), include: artLabel('include'), exclude: artLabel('exclude') },
                    value: light.art_exclude.includes(node.uuid) ? 'exclude' : light.art_include.includes(node.uuid) ? 'include' : 'auto' }; });
                new Dialog({ id: 'art_key_targets', title: artLabel('targets'), form,
                    onConfirm(result) {
                        Undo.initEdit({ elements: [light] });
                        light.art_include = nodes.filter((node, i) => result['target_' + i] === 'include').map(node => node.uuid);
                        light.art_exclude = nodes.filter((node, i) => result['target_' + i] === 'exclude').map(node => node.uuid);
                        Undo.finishEdit(artLabel('targets'));
                        window.update_light_element_callback?.({ elements: [light], shadows: false, scene: false, gizmos: true, cleanup: false, artKey: true });
                    }
                }).show();
            };
            const spotLightCondition = () => {
                const light = getSelectedLight();
                return !!light && light.light_type === 'spot';
            };
            const distanceLightCondition = () => {
                const light = getSelectedLight();
                return !!light && light.light_type !== 'directional' && light.light_type !== 'art_key';
            };
            const shadowLightCondition = () => {
                const light = getSelectedLight();
                return !!light && light.light_type !== 'art_key' && light.has_shadow !== false;
            };
            const directionalShadowCondition = () => {
                const light = getSelectedLight();
                return !!light && light.has_shadow !== false && light.light_type === 'directional';
            };

            const lightValuesEqual = (a, b) => {
                if (Array.isArray(a) || Array.isArray(b)) {
                    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
                }
                return a === b;
            };

            const beginLightEdit = (label) => {
                if (syncingLightSettings || activeLightUndoLabel) return;
                Undo.initEdit({ elements: getSelectedLights() });
                activeLightUndoLabel = label;
            };

            const finishLightEdit = (label) => {
                if (syncingLightSettings || !activeLightUndoLabel) return;
                Undo.finishEdit(label || activeLightUndoLabel);
                activeLightUndoLabel = null;
            };

            const normalizeLightPanelValue = (light, property, value) => {
                switch (property) {
                    case 'art_radius': return LightManagerUtils.num(value, light.art_radius ?? 8, 0, 100000);
                    case 'light_type':
                        return LightManagerUtils.lightType(value);
                    case 'color':
                        return LightManagerUtils.colorArray(value, light.color);
                    case 'intensity':
                        return LightManagerUtils.num(value, light.intensity, 0, 100000);
                    case 'temperature':
                        return LightManagerUtils.num(value, light.temperature || 6500, 2700, 6500);
                    case 'distance':
                        return LightManagerUtils.num(value, light.distance || 0, 0, 100000);
                    case 'angle':
                        return LightManagerUtils.num(value, light.angle || 45, 0.1, 89.9);
                    case 'penumbra':
                        return LightManagerUtils.num(value, light.penumbra || 0, 0, 1);
                    case 'has_shadow':
                        return !!value;
                    case 'shadow_resolution':
                        return LightManagerUtils.shadowResolution(value);
                    case 'studio_shadow_resolution':
                        return LightManagerUtils.studioShadowResolution(value);
                    case 'shadow_bias':
                        return LightManagerUtils.num(value, light.shadow_bias ?? DEFAULT_SHADOW_BIAS, -1, 1);
                    case 'shadow_normal_bias':
                        return LightManagerUtils.num(value, light.shadow_normal_bias ?? DEFAULT_SHADOW_NORMAL_BIAS, -1, 1);
                    case 'shadow_softness':
                        return LightManagerUtils.shadowSoftness(value);
                    case 'shadow_near':
                        return LightManagerUtils.num(value, light.shadow_near ?? 0.1, 0, 99999);
                    case 'shadow_far':
                        return Math.max((light.shadow_near ?? 0.1) + 0.001, LightManagerUtils.num(value, light.shadow_far ?? 200, 0.001, 100000));
                    case 'shadow_bounds':
                        return LightManagerUtils.num(value, light.shadow_bounds ?? 35, 0.001, 100000);
                    default:
                        return value;
                }
            };

            const getLightPanelUpdateOptions = (property, light) => {
                const partial = {
                    elements: light ? [light] : [],
                    cleanup: false
                };
                if (property.startsWith('art_') || property === 'light_type' || light?.light_type === 'art_key') return { ...partial, shadows: false, scene: false, gizmos: true, artKey: true };
                if (property === 'studio_shadow_resolution') {
                    return {
                        ...partial,
                        shadows: false,
                        scene: false,
                        gizmos: false
                    };
                }

                if (['color', 'temperature', 'intensity', 'key_light_enabled', 'key_light_weight'].includes(property)) {
                    return {
                        ...partial,
                        shadows: false,
                        scene: false,
                        gizmos: false
                    };
                }

                if (['distance'].includes(property)) {
                    return {
                        ...partial,
                        shadows: false,
                        scene: false,
                        gizmos: true
                    };
                }

                if (['shadow_bias', 'shadow_normal_bias', 'shadow_softness'].includes(property)) {
                    return {
                        ...partial,
                        shadows: true,
                        scene: false,
                        gizmos: false
                    };
                }

                if (property === 'has_shadow') {
                    return {
                        ...partial,
                        shadows: true,
                        // Caster/receiver flags only need the expensive scene
                        // walk when the first active shadow is enabled.
                        scene: light?.has_shadow !== false && LIGHT_MANAGER_SHADOW_STATE.sceneDirty,
                        gizmos: true
                    };
                }

                return {
                    ...partial,
                    shadows: true,
                    scene: false,
                    gizmos: true
                };
            };

            const applyLightPanelValue = (property, value, undoLabel) => {
                if (syncingLightSettings) return false;
                const selectedLights = getSelectedLights();
                if (!selectedLights.length) return false;

                const plans = selectedLights.map(light => {
                    const nextValue = normalizeLightPanelValue(light, property, value);
                    const updateAutomaticNormalBias = (
                        LIGHT_MANAGER_AUTO_NORMAL_BIAS_PROPERTIES.includes(property) &&
                        LightManagerUtils.isAutomaticShadowNormalBiasValue(light.shadow_normal_bias, light)
                    );
                    let nextAutomaticNormalBias = null;
                    let normalBiasNeedsAutoUpdate = false;
                    const valueChanged = !lightValuesEqual(light[property], nextValue);
                    if (updateAutomaticNormalBias) {
                        const nextNormalBiasContext = { ...light, [property]: nextValue };
                        if (property === 'shadow_near' && nextNormalBiasContext.shadow_far <= nextNormalBiasContext.shadow_near) {
                            nextNormalBiasContext.shadow_far = nextNormalBiasContext.shadow_near + 0.001;
                        }
                        nextAutomaticNormalBias = LightManagerUtils.defaultShadowNormalBias(nextNormalBiasContext);
                        normalBiasNeedsAutoUpdate = !lightValuesEqual(light.shadow_normal_bias, nextAutomaticNormalBias);
                    }
                    return {
                        light,
                        nextValue,
                        nextAutomaticNormalBias,
                        updateAutomaticNormalBias,
                        normalBiasNeedsAutoUpdate,
                        willChange: valueChanged || normalBiasNeedsAutoUpdate
                    };
                }).filter(plan => plan.willChange);
                if (!plans.length) return false;

                const changedLights = plans.map(plan => plan.light);
                const directUndo = undoLabel && !activeLightUndoLabel;
                if (directUndo) Undo.initEdit({ elements: changedLights });

                let shadows = false;
                let scene = false;
                let gizmos = false;
                let artKey = false;
                let automaticNormalBiasChanged = false;
                plans.forEach(plan => {
                    const { light, nextValue, updateAutomaticNormalBias, nextAutomaticNormalBias } = plan;
                    light[property] = Array.isArray(nextValue) ? nextValue.slice() : nextValue;
                    if (updateAutomaticNormalBias) {
                        light.shadow_normal_bias = nextAutomaticNormalBias;
                        automaticNormalBiasChanged ||= plan.normalBiasNeedsAutoUpdate;
                    }
                    if (property === 'shadow_near' && light.shadow_far <= light.shadow_near) {
                        light.shadow_far = light.shadow_near + 0.001;
                    }
                    if (property === 'temperature') {
                        const tempColor = kelvinToTinyColor(light.temperature);
                        light.color = [tempColor._r, tempColor._g, tempColor._b];
                        light.render_color = light.color.slice();
                    }
                    if (property === 'color') light.render_color = light.color.slice();
                    if (property === 'intensity') light.render_intensity = light.intensity;

                    if (property === 'light_type' && light instanceof LightElement) {
                        light.updateLightIcon();
                        light.preview_controller?.updateSelection?.(light, { gizmos: false });
                    }
                    if (light instanceof ArtKeyElement) light.preview_controller?.updateSelection?.(light);
                    if (light instanceof LightElement && ['temperature', 'color', 'intensity'].includes(property)) {
                        light.preview_controller?.updateSelection?.(light, { gizmos: false });
                    }

                    const updateOptions = getLightPanelUpdateOptions(property, light);
                    shadows ||= updateOptions.shadows !== false;
                    scene ||= updateOptions.scene === true;
                    gizmos ||= updateOptions.gizmos !== false;
                    artKey ||= updateOptions.artKey === true;
                });

                window.update_light_element_callback?.({
                    elements: changedLights,
                    cleanup: false,
                    shadows,
                    scene,
                    gizmos,
                    artKey
                });
                if (gizmos) window.LightManagerViewportControls?.updateAll();

                const referenceLight = getSelectedLight();
                if (referenceLight && ['light_type', 'has_shadow', 'key_light_enabled', 'art_mode'].includes(property)) {
                    syncLightSettingsPanel(referenceLight);
                } else if (referenceLight && automaticNormalBiasChanged) {
                    const normalBiasControl = lightPropertiesPanel?.form?.form_data?.shadow_normal_bias;
                    normalBiasControl?.setResetValue?.(LightManagerUtils.defaultShadowNormalBias(referenceLight));
                    normalBiasControl?.setValue?.(referenceLight.shadow_normal_bias);
                }

                if (directUndo) Undo.finishEdit(undoLabel);
                return true;
            };

            let renderWorkspaceMode = new Mode('render', {
                name: tl('mode.render'),
                icon: 'photo_camera_back',
                category: 'navigate',
                condition: () => Project,
                onSelect() {
                    if (
                        Modes.previous_id === 'animate' &&
                        window.Animator &&
                        typeof Animator.preview === 'function'
                    ) {
                        Animator.preview();
                    }
                }
            });
            deletables.push(renderWorkspaceMode);
            lightManagerUIApi.workspace.installScene();

            if (!Panels.outliner.condition.modes.includes('render')) {
                Panels.outliner.condition.modes.push('render');
            }

            if (!Panels.outliner.default_configuration.mode_positions) {
                Panels.outliner.default_configuration.mode_positions = {};
            }
            Panels.outliner.default_configuration.mode_positions.render = {
                slot: 'right_bar',
                sidebar_index: 2,
                height: 400
            };

            // Keep the panel shell alive in Render mode, but build its contents from
            // the current selection. This mirrors Atmosphere's panel contract and
            // prevents controls for a previously selected light from going stale.
            const panelForm = (light) => {
                if (!light) {
                    return {
                        no_light: {
                            type: 'bar_display',
                            value: translateLightManager('light_manager.ui.no_light'),
                            icon: 'lightbulb',
                            paragraph: true,
                            expand: true,
                            color: 'var(--color-text)'
                        }
                    };
                }

                return {
                    /*light_panel_search: LightManagerFormDesign.search({
                        placeholder: 'Find setting', active_label: 'Active only', collapse_label: 'Collapse all'
                    }),*/
                    light_gizmo_action: {type: 'action_button', icon: 'control_camera', description: tl('light_manager.tool.edit_gizmos'), click: () => BarItems.light_manager_edit_tool.select(), show_condition: physicalLightCondition},
                    light_properties_label: {
                        type: 'bar_display',
                        variant: 'subsection',
                        value: light.name || tl('property.light_settings.compact'),
                        description: artLightCondition() ? artLabel('transform_hint') : tl('property.light_settings'),
                        icon: artLightCondition() ? 'flare' : 'light',
                        icon_color: 'var(--color-warning)',
                        separator: true,
                        separator_color: 'color-mix(in srgb, var(--color-warning) 48%, var(--color-border))',
                        paragraph: false,
                        expand: true,
                        color: 'var(--color-text)',
                        show_condition: () => { return selectedLightCondition(); }
                    },
                    light_type: {
                        type: 'compact_select',
                        value: light.light_type,
                        description: tl('property.light_type'),
                        background: 'transparent',
                        icon_mode: true,
                        options: {
                            point: { name: tl('property.light_type.point'), icon: 'lightbulb' },
                            directional: { name: tl('property.light_type.directional'), icon: 'light_mode' },
                            spot: { name: tl('property.light_type.spot'), icon: 'highlight' }
                        },
                        show_condition: () => { return physicalLightCondition(); }
                    },
                    light_color: {
                        type: 'advanced_color',
                        value: tinycolor(LightManagerUtils.colorHex(light.color)),
                        title: tl('property.light_color'),
                        description: tl('property.light_color'),
                        alpha: false,
                        show_condition: () => { return selectedLightCondition(); }
                    },
                    light_temperature: {
                        type: 'combo_slider',
                        label: tl('property.light_temperature'),
                        description: tl('property.light_temperature.desc'),
                        icon: 'thermostat',
                        background: 'transparent',
                        color: 'var(--color-warning)',
                        compact: true,
                        popup_width: '340px',
                        value: light.temperature || 6500,
                        resettable: true,
                        reset_value: 6500,
                        min: 2700,
                        max: 6500,
                        step: 100,
                        onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_temperature')),
                        onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_temperature')),
                        onDrag: (value, event, isNumberInput) => {
                            lightPropertiesPanel.form.form_data.light_color.setValue(kelvinToTinyColor(value));
                        },
                        show_condition: () => { return physicalLightCondition(); },
                        slider_fill: true,
                    },
                    cast_shadows: {
                        type: 'action_toggle',
                        description: tl('property.cast_shadows') + '\n' + tl('property.cast_shadows.desc'),
                        icon_size: '24px',
                        animate: false,
                        icon_on: 'stroke_partial',
                        icon_off: 'contrast_rtl_off',
                        bg_on: 'var(--color-accent)',       // Red background when locked
                        bg_off: 'transparent',
                        color_on: 'var(--color-ui)',    // White icon when locked
                        color_off: 'var(--color-subtle_text)', // Dimmed icon when unlocked
                        value: light.has_shadow !== false,
                        show_condition: () => { return physicalLightCondition(); }
                    },
                    shadow_resolution: {
                        type: 'compact_select',
                        value: String(LightManagerUtils.shadowResolution(light.shadow_resolution)),
                        label: tl('property.shadow_resolution'),
                        hide_label: true,
                        description: tl('property.shadow_resolution.desc'),
                        background: 'transparent',
                        icon_mode: true,
                        disable: false,
                        disable_condition: () => { return false; },
                        options: {
                            256: { name: '256', icon: 'switch_access' },
                            512: { name: '512', icon: 'high_density' },
                            1024: { name: '1024', icon: '1k' },
                            2048: { name: '2048', icon: '2k' },
                            4096: { name: '4096', icon: '4k' }
                        },
                        disable: false,
                        disable_condition: () => { return !shadowLightCondition(); },
                        disable_desc: tl('property.cast_shadows_off.desc'),
                        show_condition: () => { return physicalLightCondition(); }
                    },
                    studio_shadow_resolution: {
                        type: 'compact_select',
                        value: String(LightManagerUtils.studioShadowResolution(light.studio_shadow_resolution)),
                        label: tl('property.studio_shadow_resolution'),
                        hide_label: true,
                        description: tl('property.studio_shadow_resolution.desc'),
                        background: 'transparent',
                        icon_mode: true,
                        options: {
                            0: { name: tl('light_manager.option.shadow_same_preview'), icon: 'monitor' },
                            256: { name: '256', icon: 'switch_access' },
                            512: { name: '512', icon: 'high_density' },
                            1024: { name: '1024', icon: '1k' },
                            2048: { name: '2048', icon: '2k' },
                            4096: { name: '4096', icon: '4k' },
                            8192: { name: '8192 — Pro', icon: '8k' },
                            16384: { name: '16384 — Ultra', icon: 'pages' }
                        },
                        disable: false,
                        disable_condition: () => { return !shadowLightCondition(); },
                        disable_desc: tl('property.cast_shadows_off.desc'),
                        show_condition: () => { return physicalLightCondition(); }
                    },
                    light_intensity: {
                        type: 'combo_slider',
                        label: tl('property.light_intensity'),
                        description: tl('property.light_intensity.desc'),
                        color: 'var(--color-axis-w)',
                        value: light.intensity,
                        resettable: true,
                        reset_value: 1.0,
                        min: 0.0,
                        max: 10.0,
                        step: 0.1,
                        allow_higher: true,
                        onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_intensity')),
                        onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_intensity')),
                        show_condition: () => { return physicalLightCondition(); },
                        slider_fill: true,
                    },

                    art_enabled: { type: 'action_toggle', icon_on: 'flare', icon_off: 'flare', animate: false,
                        description: translateLightManager('light_manager.property.key_light_enabled'), bg_off: 'transparent',
                        color_off: 'var(--color-subtle_text)', value: light.key_light_enabled !== false,
                        condition: artLightCondition, show_condition: artLightCondition },
                    art_strength: { type: 'combo_slider', label: artLabel('strength'), value: light.intensity, min: 0, max: 10, step: 0.1, resettable: true, reset_value: 1,
                        onBefore: () => beginLightEdit(artLabel('edit')), onAfter: () => finishLightEdit(artLabel('edit')),
                        condition: artLightCondition, show_condition: artLightCondition },
                    art_mode: { type: 'select', label: artLabel('source'), value: light.art_mode || 'point',
                        options: { point: artLabel('point'), direction: artLabel('direction') },
                        condition: artLightCondition, show_condition: artLightCondition },
                    art_radius: { type: 'combo_slider', label: artLabel('radius'), description: artLabel('radius.desc'), value: light.art_radius ?? 8,
                        min: 0, max: 64, step: 0.5, allow_higher: true, resettable: true, reset_value: 8,
                        onBefore: () => beginLightEdit(artLabel('edit')), onAfter: () => finishLightEdit(artLabel('edit')),
                        condition: () => artLightCondition() && getSelectedLight()?.art_mode !== 'direction',
                        show_condition: () => artLightCondition() && getSelectedLight()?.art_mode !== 'direction' },
                    art_softness: { type: 'combo_slider', label: artLabel('softness'), value: light.art_softness ?? 0.15, min: 0, max: 1, step: 0.01,
                        onBefore: () => beginLightEdit(artLabel('edit')), onAfter: () => finishLightEdit(artLabel('edit')),
                        condition: artLightCondition, show_condition: artLightCondition },
                    art_influence: { type: 'combo_slider', label: translateLightManager('light_manager.property.key_light_weight'),
                        description: translateLightManager('light_manager.property.key_light_weight.desc'), value: light.key_light_weight ?? 1,
                        min: 0, max: 10, step: 0.25, allow_higher: true, resettable: true, reset_value: 1,
                        onBefore: () => beginLightEdit(artLabel('edit')), onAfter: () => finishLightEdit(artLabel('edit')),
                        condition: artLightCondition, show_condition: artLightCondition },
                    art_scope: { type: 'select', label: artLabel('scope'), value: light.art_scope || 'box',
                        options: { box: artLabel('box'), include: artLabel('only') },
                        condition: artLightCondition, show_condition: artLightCondition },
                    art_targets: { type: 'action_button', icon: 'filter_alt', label: '', description: artLabel('targets'), click: editArtTargets,
                        condition: artLightCondition, show_condition: artLightCondition },
                    key_light_enabled: {
                        type: 'action_toggle', icon_on: 'flare', icon_off: 'flare', animate: false,
                        description: translateLightManager('light_manager.property.key_light_enabled'),
                        bg_off: 'transparent', color_off: 'var(--color-subtle_text)',
                        value: light.key_light_enabled !== false, show_condition: physicalLightCondition
                    },
                    key_light_weight: {
                        type: 'combo_slider', label: translateLightManager('light_manager.property.key_light_weight'),
                        description: translateLightManager('light_manager.property.key_light_weight.desc'),
                        value: light.key_light_weight ?? 1, min: 0, max: 10, step: 0.25,
                        allow_higher: true, allow_lower: false, resettable: true, reset_value: 1,
                        onBefore: () => beginLightEdit(translateLightManager('light_manager.property.key_light_weight')),
                        onAfter: () => finishLightEdit(translateLightManager('light_manager.property.key_light_weight')),
                        show_condition: () => physicalLightCondition() && LightElement.selected.some(entry => entry.key_light_enabled !== false)
                    },
                    light_area_label: {
                        type: 'bar_display',
                        icon: 'wb_incandescent',
                        paragraph: false,
                        expand: false,
                        color: 'var(--color-subtle_text)',
                        description: tl('property.light_settings'),
                        show_condition: () => { return distanceLightCondition(); }
                    },

                    light_distance: {
                        type: 'combo_slider',
                        label: tl('property.distance'),
                        description: tl('property.distance.desc'),
                        icon: 'filter_tilt_shift',
                        background: 'transparent',
                        color: markerColors ? (markerColors.length >= 7 ? markerColors[7].pastel : '#BDFFA6') : '#BDFFA6',
                        icon_color: markerColors ? (markerColors.length >= 7 ? markerColors[7].pastel : '#BDFFA6') : '#BDFFA6',
                        compact: true,
                        popup_width: '340px',
                        value: light.distance,
                        resettable: true,
                        reset_value: 0.0,
                        min: 0.0,
                        max: 128.0,
                        step: 0.01,
                        allow_higher: true,
                        onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_distance')),
                        onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_distance')),
                        show_condition: () => { return distanceLightCondition(); },
                        slider_fill: true,
                    },

                    light_cone_settings_label: {
                        type: 'bar_display',
                        icon: 'highlight',
                        paragraph: false,
                        expand: false,
                        color: 'var(--color-subtle_text)',
                        description: tl('property.light_cone_settings'),
                        show_condition: () => { return spotLightCondition(); }
                    },

                    light_cone_angle: {
                        type: 'combo_slider',
                        label: tl('property.cone_angle'),
                        description: tl('property.cone_angle.desc'),
                        icon: 'wifi_tethering',
                        background: 'transparent',
                        color: markerColors ? (markerColors.length >= 1 ? markerColors[1].pastel : '#FFF899') : '#FFF899',
                        icon_color: markerColors ? (markerColors.length >= 1 ? markerColors[1].pastel : '#FFF899') : '#FFF899',
                        compact: true,
                        popup_width: '340px',
                        value: light.angle,
                        resettable: true,
                        reset_value: 45.0,
                        min: 0.1,
                        max: 89.9,
                        step: 0.01,
                        disable: false,
                        disable_condition: () => { return !spotLightCondition(); },
                        disable_desc: tl('property.light_spot_settings.disabled.desc'),
                        onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_cone_angle')),
                        onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_cone_angle')),
                        show_condition: () => { return spotLightCondition(); },
                        slider_fill: true,
                    },

                    light_cone_penumbra: {
                        type: 'combo_slider',
                        label: tl('property.cone_penumbra'),
                        description: tl('property.cone_penumbra.desc'),
                        icon: 'deblur',
                        background: 'transparent',
                        color: markerColors ? (markerColors.length >= 0 ? markerColors[0].pastel : '#A2EBFF') : '#A2EBFF',
                        icon_color: markerColors ? (markerColors.length >= 0 ? markerColors[0].pastel : '#A2EBFF') : '#A2EBFF',
                        compact: true,
                        popup_width: '340px',
                        value: light.penumbra,
                        resettable: true,
                        reset_value: 0.0,
                        min: 0.0,
                        max: 1.0,
                        step: 0.01,
                        disable: false,
                        disable_condition: () => { return !spotLightCondition(); },
                        disable_desc: tl('property.light_spot_settings.disabled.desc'),
                        onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_penumbra')),
                        onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_penumbra')),
                        show_condition: () => { return spotLightCondition(); },
                        slider_fill: true,
                    },


                    shadow_properties_label: {
                        type: 'bar_display',
                        variant: 'subsection',
                        value: tl('property.shadow_settings.compact'),
                        description: tl('property.shadow_settings'),
                        icon: 'sunny_snowing',
                        icon_color: 'var(--color-axis-z)',
                        separator: true,
                        separator_color: 'color-mix(in srgb, var(--color-axis-z) 48%, var(--color-border))',
                        paragraph: false,
                        expand: true,
                        color: 'var(--color-text)',
                        disable: false,
                        disable_condition: () => { return !shadowLightCondition(); },
                        disable_desc: tl('property.cast_shadows_off.desc'),
                        show_condition: () => { return physicalLightCondition(); }
                    },

                    shadow_softness: {
                        type: 'combo_slider',
                        label: tl('property.shadow_softness'),
                        description: tl('property.shadow_softness.desc'),
                        color: markerColors ? (markerColors.length >= 9 ? markerColors[9].pastel : '#E0E9FB') : '#E0E9FB',
                        icon_color: markerColors ? (markerColors.length >= 9 ? markerColors[9].pastel : '#E0E9FB') : '#E0E9FB',
                        popup_width: '340px',
                        value: light.shadow_softness,
                        resettable: true,
                        reset_value: DEFAULT_SHADOW_SOFTNESS,
                        min: 0.0,
                        max: 8.0,
                        step: 0.05,
                        disable: false,
                        disable_condition: () => { return !shadowLightCondition(); },
                        disable_desc: tl('property.cast_shadows_off.desc'),
                        onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_shadow_softness')),
                        onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_shadow_softness')),
                        show_condition: () => { return physicalLightCondition(); },
                        slider_fill: true,
                    },
                    shadow_clip_label: {
                        type: 'bar_display',
                        icon: 'content_cut',
                        paragraph: false,
                        expand: false,
                        color: 'var(--color-subtle_text)',
                        description: tl('property.shadow_clip') + '\n' + tl('property.shadow_clip.desc'),
                        show_condition: () => { return physicalLightCondition(); }
                    },
                    shadow_near: {
                        type: 'combo_slider',
                        label: tl('property.shadow_near'),
                        icon: 'arrows_input',
                        background: 'transparent',
                        color: markerColors ? (markerColors.length >= 2 ? markerColors[2].pastel : '#F1BB75') : '#F1BB75',
                        icon_color: markerColors ? (markerColors.length >= 2 ? markerColors[2].pastel : '#F1BB75') : '#F1BB75',
                        compact: true,
                        popup_width: '340px',
                        value: light.shadow_near,
                        resettable: true,
                        reset_value: 0.1,
                        min: 0.0,
                        max: 1.0,
                        step: 0.1,
                        allow_higher: true,
                        disable: false,
                        disable_condition: () => { return !shadowLightCondition(); },
                        disable_desc: tl('property.cast_shadows_off.desc'),
                        onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_shadow_clip')),
                        onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_shadow_clip')),
                        show_condition: () => { return physicalLightCondition(); }
                    },
                    shadow_far: {
                        type: 'combo_slider',
                        label: tl('property.shadow_far'),
                        icon: 'arrows_output',
                        background: 'transparent',
                        color: markerColors ? (markerColors.length >= 3 ? markerColors[3].pastel : '#FF9B97') : '#FF9B97',
                        icon_color: markerColors ? (markerColors.length >= 3 ? markerColors[3].pastel : '#FF9B97') : '#FF9B97',
                        compact: true,
                        popup_width: '340px',
                        value: light.shadow_far,
                        resettable: true,
                        reset_value: 128.0,
                        min: 0.1,
                        max: 128.0,
                        step: 0.1,
                        allow_higher: true,
                        disable: false,
                        disable_condition: () => { return !shadowLightCondition(); },
                        disable_desc: tl('property.cast_shadows_off.desc'),
                        onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_shadow_clip')),
                        onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_shadow_clip')),
                        show_condition: () => { return physicalLightCondition(); }
                    },
                    shadow_bounds: {
                        type: 'combo_slider',
                        label: tl('property.shadow_bounds'),
                        description: tl('property.shadow_bounds.desc'),
                        icon: 'activity_zone',
                        background: 'transparent',
                        color: markerColors ? (markerColors.length >= 4 ? markerColors[4].pastel : '#C5A6E8') : '#C5A6E8',
                        icon_color: markerColors ? (markerColors.length >= 4 ? markerColors[4].pastel : '#C5A6E8') : '#C5A6E8',
                        compact: true,
                        popup_width: '340px',
                        value: light.shadow_bounds,
                        resettable: true,
                        reset_value: 32.0,
                        min: 1.0,
                        max: 64.0,
                        step: 1.0,
                        allow_higher: true,
                        disable: false,
                        disable_condition: () => { return !directionalShadowCondition(); },
                        disable_desc: tl('property.cast_shadows_off.desc'),
                        onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_shadow_bounds')),
                        onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_shadow_bounds')),
                        show_condition: () => { return directionalShadowCondition(); }
                    },
                    shadow_biases_label: {
                        type: 'bar_display',
                        icon: 'transition_fade',
                        paragraph: false,
                        expand: false,
                        color: 'var(--color-subtle_text)',
                        description: tl('property.shadow_biases') + '\n' + tl('property.shadow_biases.desc'),
                        show_condition: () => { return physicalLightCondition(); }
                    },
                    shadow_bias: {
                        type: 'combo_slider',
                        label: tl('property.shadow_bias'),
                        description: tl('property.shadow_bias.desc'),
                        icon: 'blur_circular',
                        background: 'transparent',
                        color: markerColors ? (markerColors.length >= 5 ? markerColors[5].pastel : '#A6C8FF') : '#A6C8FF',
                        icon_color: markerColors ? (markerColors.length >= 5 ? markerColors[5].pastel : '#A6C8FF') : '#A6C8FF',
                        compact: true,
                        popup_width: '340px',
                        value: light.shadow_bias,
                        resettable: true,
                        reset_value: DEFAULT_SHADOW_BIAS,
                        min: -0.05,
                        max: 0.05,
                        step: 0.0001,
                        allow_higher: true,
                        allow_lower: true,
                        disable_condition: () => { return !shadowLightCondition(); },
                        disable_desc: tl('property.cast_shadows_off.desc'),
                        onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_shadow_bias')),
                        onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_shadow_bias')),
                        show_condition: () => { return physicalLightCondition(); }
                    },
                    shadow_normal_bias: {
                        type: 'combo_slider',
                        label: tl('property.shadow_normal_bias'),
                        description: tl('property.shadow_normal_bias.desc'),
                        icon: 'stroke_full',
                        background: 'transparent',
                        color: markerColors ? (markerColors.length >= 6 ? markerColors[6].pastel : '#7BFFA3') : '#7BFFA3',
                        icon_color: markerColors ? (markerColors.length >= 6 ? markerColors[6].pastel : '#7BFFA3') : '#7BFFA3',
                        compact: true,
                        popup_width: '340px',
                        value: light.shadow_normal_bias,
                        resettable: true,
                        reset_value: DEFAULT_SHADOW_NORMAL_BIAS,
                        min: -1.0,
                        max: 1.0,
                        step: 0.05,
                        allow_higher: false,
                        allow_lower: false,
                        disable_condition: () => { return !shadowLightCondition(); },
                        disable_desc: tl('property.cast_shadows_off.desc'),
                        onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_shadow_normal_bias')),
                        onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_shadow_normal_bias')),
                        show_condition: () => { return selectedLightCondition(); }
                    }
                };
            };

            lightPropertiesPanel = new Panel('light_properties', {
                icon: 'lightbulb',
                growable: false,
                resizable: true,
                fixed_height: true,
                min_height: 230,
                condition: {
                    modes: ['render'],
                    project: true,
                    method: () => Modes.render
                },
                default_position: {
                    slot: 'right_bar',
                    float_position: [0, 0],
                    float_size: [340, 300],
                    height: 300,
                    fixed_height: true,
                    attached_to: '',
                    attached_index: 0,
                    sidebar_index: 2,
                },
                mode_positions: {
                    edit: { slot: 'right_bar', height: 300, folded: false, fixed_height: true, sidebar_index: 1, attached_to: '', attached_index: 0 },
                    render: { slot: 'right_bar', height: 300, folded: false, fixed_height: true, sidebar_index: 1, attached_to: '', attached_index: 0 }
                },
                insert_after: 'transform',
                form: panelForm(getSelectedLight())
            });
            window.light_properties_panel = lightPropertiesPanel;

            lightManagerUIApi.workspace.register(lightPropertiesPanel);
            const syncContextualLightPropertiesPanel = () => {
                if (!hasExclusiveLightSelection()) return false;
                lightManagerUIApi.workspace.select(lightPropertiesPanel);
                return true;
            };


            const lightPanelFormGroups = [
                {
                    elements: ['light_properties_label', '+', 'light_type', 'light_color', 'light_temperature', 'light_gizmo_action'],
                    gap: '2px',
                    class_name: 'lf-light-toolbar-row lf-light-primary-row',
                    aria_label: tl('property.light_settings'),
                    flex: {
                        light_properties_label: '1 1 auto',
                        light_type: '0 0 auto',
                        light_color: '0 0 auto',
                        light_temperature: '0 0 auto'
                    }
                },
                {
                    elements: ['light_intensity'],
                    gap: '2px',
                    class_name: 'lf-light-value-row',
                    aria_label: tl('property.light_intensity'),
                    flex: {
                        light_intensity: '1 1 100%'
                    }
                },
                {
                    elements: ['art_enabled', 'art_strength'],
                    gap: '4px',
                    class_name: 'lf-light-value-row lf-art-key-strength-row',
                    aria_label: translateLightManager('light_manager.art.strength'),
                    flex: { art_enabled: '0 0 30px', art_strength: '1 1 0%' }
                },
                {
                    elements: ['art_mode'],
                    gap: '4px',
                    class_name: 'lf-light-toolbar-row lf-art-key-mode-row',
                    aria_label: translateLightManager('light_manager.art.source'),
                    flex: { art_mode: '1 1 100%' }
                },
                {
                    elements: ['art_radius'],
                    gap: '2px',
                    class_name: 'lf-light-value-row lf-art-key-radius-row',
                    aria_label: translateLightManager('light_manager.art.radius'),
                    flex: { art_radius: '1 1 100%' }
                },
                {
                    elements: ['art_influence'],
                    gap: '2px',
                    class_name: 'lf-light-value-row lf-art-key-influence-row',
                    aria_label: translateLightManager('light_manager.property.key_light_weight'),
                    flex: { art_influence: '1 1 100%' }
                },
                {
                    elements: ['art_softness'], gap: '2px', class_name: 'lf-light-value-row lf-art-key-softness-row',
                    aria_label: translateLightManager('light_manager.art.softness'), flex: { art_softness: '1 1 100%' }
                },
                {
                    elements: ['art_scope', 'art_targets'], gap: '4px', class_name: 'lf-light-toolbar-row lf-art-key-filter-row',
                    aria_label: translateLightManager('light_manager.art.targets'), flex: { art_scope: '1 1 0%', art_targets: '0 0 auto' }
                },
                {
                    elements: ['key_light_enabled', 'key_light_weight'], gap: '4px',
                    class_name: 'lf-light-value-row',
                    aria_label: translateLightManager('light_manager.property.key_light_weight'),
                    flex: { key_light_enabled: '0 0 30px', key_light_weight: '1 1 0%' }
                },
                {
                    elements: ['light_area_label', 'light_distance', '+', '_', '+', 'light_cone_settings_label', 'light_cone_angle', 'light_cone_penumbra'],
                    gap: '2px',
                    divider_color: 'var(--color-grid)',
                    class_name: 'lf-light-toolbar-row lf-light-shape-row',
                    aria_label: tl('property.light_settings'),
                    flex: {
                        light_area_label: '0 0 auto',
                        light_distance: '0 0 auto',
                        light_cone_settings_label: '0 0 auto',
                        light_cone_angle: '0 0 auto',
                        light_cone_penumbra: '0 0 auto'
                    }
                },
                {
                    elements: ['shadow_properties_label', '+', 'cast_shadows', 'shadow_resolution', 'studio_shadow_resolution'],
                    gap: '2px',
                    class_name: 'lf-light-toolbar-row lf-light-shadow-header-row',
                    aria_label: tl('property.shadow_settings'),
                    flex: {
                        shadow_properties_label: '1 1 auto',
                        cast_shadows: '0 0 auto',
                        shadow_resolution: '0 0 auto',
                        studio_shadow_resolution: '0 0 auto'
                    }
                },
                {
                    elements: ['shadow_softness'],
                    gap: '2px',
                    class_name: 'lf-light-value-row lf-light-softness-row',
                    aria_label: tl('property.shadow_softness'),
                    flex: {
                        shadow_softness: '1 1 100%'
                    }
                },
                {
                    elements: ['shadow_clip_label', 'shadow_near', 'shadow_far', 'shadow_bounds', '+', '_', '+', 'shadow_biases_label', 'shadow_bias', 'shadow_normal_bias'],
                    gap: '2px',
                    divider_color: 'var(--color-grid)',
                    class_name: 'lf-light-toolbar-row lf-light-shadow-technical-row',
                    aria_label: tl('property.shadow_settings'),
                    flex: {
                        shadow_clip_label: '0 0 auto',
                        shadow_near: '0 0 auto',
                        shadow_far: '0 0 auto',
                        shadow_bounds: '0 0 auto',
                        shadow_biases_label: '0 0 auto',
                        shadow_bias: '0 0 auto',
                        shadow_normal_bias: '0 0 auto'
                    }
                }
            ];

            let lightPanelFormGroupsInstalled = false;
            const applyLightPanelFormGroups = () => {
                if (lightPanelFormGroupsInstalled || !lightPropertiesPanel?.form?.form_data?.light_type) return;
                window.applyIndestructibleFormGroups(lightPropertiesPanel.form, lightPanelFormGroups);
                lightPanelFormGroupsInstalled = true;
            };
            applyLightPanelFormGroups();

            const lightPanelStyles = Blockbench.addCSS(`
                #panel_light_properties {
                    flex: 1 1 auto;
                    min-height: 0;
                    overflow: hidden !important;
                    overflow-x: hidden;
                    background: var(--color-ui);
                    container-type: inline-size;
                }
                #panel_light_properties > .form {
                    flex: 1 1 auto;
                    min-height: 0;
                    overflow-y: auto;
                    overflow-x: hidden;
                    padding: 3px 2px 6px;
                    box-sizing: border-box;
                }
                #panel_light_properties .light_manager_panel_search_bar {
                    margin: 0 2px 3px !important;
                }
                #panel_light_properties .light_manager_panel_search {
                    display: grid;
                    grid-template-columns: minmax(78px, 1fr) minmax(30px, auto) 30px;
                    gap: 4px;
                }
                #panel_light_properties .light_manager_panel_search_input,
                #panel_light_properties .light_manager_panel_search_active,
                #panel_light_properties .light_manager_panel_search_collapse {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 29px;
                    min-width: 0;
                    border: 1px solid var(--color-border);
                    border-radius: 3px;
                    background: var(--color-back);
                    color: var(--color-subtle_text);
                }

                #panel_light_properties .light_manager_panel_search_input {
                    justify-content: flex-start;
                    gap: 5px;
                    padding: 0 6px;
                }
                #panel_light_properties .light_manager_panel_search_input input {
                    width: 100%; min-width: 0; height: 26px; padding: 0; border: 0;
                    outline: 0; background: transparent; color: var(--color-text); font: inherit;
                }
                #panel_light_properties .light_manager_panel_search_active,
                #panel_light_properties .light_manager_panel_search_collapse {
                    gap: 4px; padding: 0 6px; font: inherit; cursor: pointer;
                }
                #panel_light_properties .light_manager_panel_search_collapse {
                    flex: 0 0 29px;
                    width: 29px;
                    height: 29px;
                    min-width: 29px;
                    min-height: 29px;
                    padding: 0;
                    box-sizing: border-box;
                    text-align: center;
                }
                #panel_light_properties .light_manager_panel_search_collapse > i {
                    display: block;
                    line-height: 1;
                }
                #panel_light_properties .light_manager_panel_search_active:hover,
                #panel_light_properties .light_manager_panel_search_collapse:hover {
                    border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-border));
                    background: color-mix(in srgb, var(--color-accent) 10%, var(--color-back));
                    color: var(--color-accent) !important;
                }
                #panel_light_properties .light_manager_panel_search_active.selected {
                    border-color: var(--color-accent);
                    color: var(--color-text) !important;
                    background: color-mix(in srgb, var(--color-accent) 18%, var(--color-back));
                }

                #panel_light_properties .light_manager_panel_search_active:focus-visible,
                #panel_light_properties .light_manager_panel_search_collapse:focus-visible,
                #panel_light_properties .light_manager_panel_search_input:focus-within {
                    color: var(--color-accent);
                    outline: 2px solid var(--color-accent);
                    outline-offset: -2px;
                }
                #panel_light_properties .light_manager_panel_filter_hidden {
                    display: none !important;
                }
                @container (max-width: 285px) {
                    #panel_light_properties .light_manager_panel_search_active > span { display: none; }
                    #panel_light_properties .light_manager_panel_search_active { width: 30px; padding: 0; }
                }
                #panel_light_properties .lf-light-toolbar-row,
                #panel_light_properties .lf-light-value-row {
                    width: 100% !important;
                    min-height: 30px;
                    margin: 2px 0 !important;
                    padding: 1px 2px !important;
                    border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
                    border-radius: 4px;
                    background: color-mix(in srgb, var(--color-button) 16%, transparent) !important;
                }
                #panel_light_properties .lf-light-primary-row {
                    border-left-color: color-mix(in srgb, var(--color-warning) 72%, var(--color-border));
                }
                #panel_light_properties .lf-light-shadow-header-row,
                #panel_light_properties .lf-light-softness-row,
                #panel_light_properties .lf-light-shadow-technical-row {
                    border-left-color: color-mix(in srgb, var(--color-axis-z) 64%, var(--color-border));
                }
                #panel_light_properties [class*="lf-art-key-"] {
                    margin: 0 !important;
                    padding: 4px 5px !important;
                    border: 0 !important;
                    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent) !important;
                    border-radius: 0 !important;
                    background: transparent !important;
                }
                #panel_light_properties .lf-art-key-strength-row {
                    margin-top: 2px !important;
                    border-left: 2px solid var(--color-warning) !important;
                    background: color-mix(in srgb, var(--color-warning) 7%, transparent) !important;
                }
                #panel_light_properties .lf-art-key-mode-row .dialog_bar,
                #panel_light_properties .lf-art-key-filter-row .dialog_bar {
                    min-width: 0;
                }
                #panel_light_properties .lf-art-key-strength-row .form_bar_art_enabled {
                    flex: 0 0 30px !important;
                    width: 30px !important;
                    min-width: 30px !important;
                }
                #panel_light_properties .lf-art-key-filter-row .form_bar_art_targets {
                    flex: 0 0 30px !important;
                    width: 30px !important;
                    min-width: 30px !important;
                    overflow: hidden;
                }
                #panel_light_properties .lf-light-toolbar-row > .dialog_bar {
                    min-width: 28px;
                    min-height: 28px !important;
                    border-radius: 3px;
                }
                #panel_light_properties .lf-light-toolbar-row .compact_dropdown_select {
                    min-width: 28px;
                    padding-left: 2px !important;
                    padding-right: 2px !important;
                }
                #panel_light_properties .lf-light-toolbar-row .compact_dropdown_select .dropdown_arrow {
                    margin-left: 2px;
                }
                #panel_light_properties .lf-light-toolbar-row > .dialog_bar:not(.form_bar_light_properties_label):not(.form_bar_shadow_properties_label):hover {
                    background: color-mix(in srgb, var(--color-button) 72%, transparent) !important;
                }
                #panel_light_properties .lf-light-toolbar-row > .dialog_bar:focus-within,
                #panel_light_properties .lf-light-value-row > .dialog_bar:focus-within {
                    outline: 1px solid var(--color-accent);
                    outline-offset: -1px;
                }
                #panel_light_properties .lf-light-toolbar-row .light_manager_form_separator.border {
                    width: 1px !important;
                    height: 18px !important;
                    margin: 0 2px !important;
                    opacity: .55;
                }
                #panel_light_properties .lf-light-toolbar-row .light_manager_form_variant_subsection {
                    min-width: 82px;
                    padding-left: 4px !important;
                    background: transparent !important;
                    border: 0 !important;
                }
                #panel_light_properties .lf-light-toolbar-row .light_manager_form_variant_subsection .bar_display_main,
                #panel_light_properties .lf-light-toolbar-row .light_manager_form_variant_subsection .bar_display_content {
                    white-space: nowrap !important;
                    flex-wrap: nowrap !important;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                #panel_light_properties .lf-light-toolbar-row .light_manager_form_variant_subsection .bar_display_content {
                    display: block !important;
                    font-size: 13px;
                    line-height: 20px;
                }
                #panel_light_properties .lf-light-toolbar-row .form_element_disabled {
                    opacity: .42 !important;
                    filter: saturate(.55);
                }
                #panel_light_properties .lf-light-value-row {
                    padding-left: 5px !important;
                    padding-right: 5px !important;
                }
                #panel_light_properties .lf-light-panel {
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                    padding: 10px;
                    box-sizing: border-box;
                    color: var(--color-text);
                }
                #panel_light_properties .lf-light-identity {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    min-height: 48px;
                    padding: 8px 10px;
                    border: 1px solid var(--color-border);
                    border-radius: 7px;
                    background: var(--color-back);
                }
                #panel_light_properties .lf-light-identity > .material-icons {
                    color: var(--color-accent);
                    font-size: 26px;
                }
                #panel_light_properties .lf-light-identity strong,
                #panel_light_properties .lf-light-identity span {
                    display: block;
                }
                #panel_light_properties .lf-light-identity span {
                    margin-top: 2px;
                    font-size: 11px;
                    opacity: .65;
                    text-transform: capitalize;
                }
                #panel_light_properties .lf-light-section {
                    padding-top: 2px;
                    border-top: 1px solid var(--color-border);
                }
                #panel_light_properties .lf-light-section h3 {
                    margin: 0 0 9px;
                    font-size: 12px;
                    font-weight: 650;
                    letter-spacing: .04em;
                    text-transform: uppercase;
                    opacity: .75;
                }
                #panel_light_properties .lf-light-section-title {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                #panel_light_properties .lf-light-grid {
                    display: grid;
                    gap: 8px;
                    margin-bottom: 9px;
                }
                #panel_light_properties .lf-light-grid.two {
                    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
                }
                #panel_light_properties .lf-light-section label {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    min-width: 0;
                    margin: 0 0 9px;
                    font-size: 12px;
                    color: var(--color-text);
                    opacity: .88;
                }
                #panel_light_properties .lf-light-section input,
                #panel_light_properties .lf-light-section select {
                    width: 100%;
                    min-height: 28px;
                    box-sizing: border-box;
                }
                #panel_light_properties .lf-light-section input[type="color"] {
                    padding: 2px;
                    cursor: pointer;
                }
                #panel_light_properties .lf-light-range {
                    position: relative;
                    padding-right: 48px;
                }
                #panel_light_properties .lf-light-range input[type="range"] {
                    min-height: 18px;
                    margin: 2px 0 0;
                }
                #panel_light_properties .lf-light-range output {
                    position: absolute;
                    right: 0;
                    bottom: 0;
                    width: 42px;
                    text-align: right;
                    font-variant-numeric: tabular-nums;
                    color: var(--color-light);
                }
                #panel_light_properties .lf-light-switch {
                    display: inline-flex !important;
                    flex-direction: row !important;
                    align-items: center;
                    width: 34px;
                    min-width: 34px;
                    margin: -3px 0 8px !important;
                    cursor: pointer;
                }
                #panel_light_properties .lf-light-switch input { display: none; }
                #panel_light_properties .lf-light-switch span {
                    position: relative;
                    display: block;
                    width: 32px;
                    height: 18px;
                    border-radius: 10px;
                    background: var(--color-button);
                    transition: background 120ms ease;
                }
                #panel_light_properties .lf-light-switch span::after {
                    content: '';
                    position: absolute;
                    top: 3px;
                    left: 3px;
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    background: var(--color-light);
                    transition: transform 120ms ease;
                }
                #panel_light_properties .lf-light-switch input:checked + span { background: var(--color-accent); }
                #panel_light_properties .lf-light-switch input:checked + span::after { transform: translateX(14px); }
                #panel_light_properties .lf-light-empty {
                    display: grid;
                    place-items: center;
                    gap: 8px;
                    min-height: 160px;
                    padding: 20px;
                    box-sizing: border-box;
                    color: var(--color-subtle_text);
                    text-align: center;
                }
                #panel_light_properties .lf-light-empty .material-icons { font-size: 30px; opacity: .65; }
                #panel_light_properties::-webkit-scrollbar {
                    width: 4px;
                }
                #panel_light_properties::-webkit-scrollbar-thumb {
                    background-color: color-mix(in srgb, var(--color-text) 24%, transparent);
                    border-radius: 4px;
                }

            `);
            deletables.push(lightPanelStyles);

            const bindLightPanelColorControl = () => {
                const colorpicker = lightPropertiesPanel?.form?.form_data?.light_color?.colorpicker;
                if (!colorpicker) return;

                colorpicker.onChange = (color) => {
                    if (syncingLightSettings) return;
                    const newColor = tinycolor(color);
                    applyLightPanelValue('color', [newColor._r, newColor._g, newColor._b], translateLightManager('light_manager.undo.change_color'));
                };
                colorpicker.onBefore = () => beginLightEdit(translateLightManager('light_manager.undo.change_color'));
                colorpicker.onAfter = () => finishLightEdit(translateLightManager('light_manager.undo.change_color'));
            };
            bindLightPanelColorControl();
            const lightPropertiesPanelListener = lightPropertiesPanel.form.on('change', ({ result }) => {
                if (syncingLightSettings) return;

                if (result.light_type !== undefined && physicalLightCondition()) {
                    applyLightPanelValue('light_type', result.light_type, translateLightManager('light_manager.undo.change_type'));
                }

                if (result.light_color !== undefined) {
                    const newColor = tinycolor(result.light_color);
                    applyLightPanelValue('color', [newColor._r, newColor._g, newColor._b], translateLightManager('light_manager.undo.change_color'));
                }

                if (result.light_temperature !== undefined) {
                    applyLightPanelValue('temperature', result.light_temperature);
                    lightPropertiesPanel.form.form_data.light_temperature.setColor(kelvinToTinyColor(result.light_temperature));
                }

                if (result.light_intensity !== undefined && !artLightCondition()) {
                    applyLightPanelValue('intensity', result.light_intensity);
                }
                for (const property of ['art_mode', 'art_radius', 'art_scope', 'art_softness']) {
                    if (result[property] !== undefined && artLightCondition()) applyLightPanelValue(property, result[property], artLabel('edit'));
                }
                if (result.art_strength !== undefined && artLightCondition()) applyLightPanelValue('intensity', result.art_strength, artLabel('edit'));
                if (result.art_enabled !== undefined && artLightCondition()) applyLightPanelValue('key_light_enabled', result.art_enabled, artLabel('edit'));
                if (result.art_influence !== undefined && artLightCondition()) applyLightPanelValue('key_light_weight', Math.max(0, Math.min(100, Number(result.art_influence) || 0)), artLabel('edit'));
                if (result.key_light_enabled !== undefined) applyLightPanelValue('key_light_enabled', result.key_light_enabled, translateLightManager('light_manager.property.key_light_enabled'));
                if (result.key_light_weight !== undefined) applyLightPanelValue('key_light_weight', Math.max(0, Math.min(100, Number(result.key_light_weight) || 0)));

                if (result.light_distance !== undefined) {
                    applyLightPanelValue('distance', result.light_distance);
                }

                if (result.light_cone_angle !== undefined) {
                    applyLightPanelValue('angle', result.light_cone_angle);
                }

                if (result.light_cone_penumbra !== undefined) {
                    applyLightPanelValue('penumbra', result.light_cone_penumbra);
                }

                if (result.cast_shadows !== undefined) {
                    applyLightPanelValue('has_shadow', result.cast_shadows, translateLightManager('light_manager.undo.toggle_shadows'));
                }

                if (result.shadow_resolution !== undefined) {
                    applyLightPanelValue('shadow_resolution', result.shadow_resolution, translateLightManager('light_manager.undo.change_shadow_resolution'));
                }

                if (result.studio_shadow_resolution !== undefined) {
                    applyLightPanelValue('studio_shadow_resolution', result.studio_shadow_resolution, translateLightManager('light_manager.undo.change_studio_shadow_resolution'));
                }

                if (result.shadow_softness !== undefined) {
                    applyLightPanelValue('shadow_softness', result.shadow_softness);
                }

                if (result.shadow_near !== undefined) {
                    applyLightPanelValue('shadow_near', result.shadow_near);
                }

                if (result.shadow_far !== undefined) {
                    applyLightPanelValue('shadow_far', result.shadow_far);
                }

                if (result.shadow_bounds !== undefined) {
                    applyLightPanelValue('shadow_bounds', result.shadow_bounds);
                }

                if (result.shadow_bias !== undefined) {
                    applyLightPanelValue('shadow_bias', result.shadow_bias);
                }

                if (result.shadow_normal_bias !== undefined) {
                    applyLightPanelValue('shadow_normal_bias', result.shadow_normal_bias);
                }
            });

            const syncLightSettingsPanel = (light) => {
                if (!light) return;
                if (!lightPropertiesPanel) return;
                if (!lightPropertiesPanel.form.form_data) return;
                syncingLightSettings = true;
                try {
                    const selectedCount = getSelectedLights().length;
                    lightPropertiesPanel.form.form_data.light_properties_label?.setValue?.(selectedCount > 1 ? `${selectedCount} · ${tl('panel.light_properties')}` : light.name);
                    for (const property of ['art_mode', 'art_radius', 'art_scope', 'art_softness']) lightPropertiesPanel.form.form_data[property]?.setValue(light[property]);
                    lightPropertiesPanel.form.form_data.art_strength?.setValue(light.intensity);
                    lightPropertiesPanel.form.form_data.art_enabled?.setValue(light.key_light_enabled !== false);
                    lightPropertiesPanel.form.form_data.art_influence?.setValue(light.key_light_weight ?? 1);
                    lightPropertiesPanel.form.form_data.light_type?.setValue(light.light_type);
                    lightPropertiesPanel.form.form_data.light_intensity?.setValue(light.intensity);
                    lightPropertiesPanel.form.form_data.key_light_enabled?.setValue(light.key_light_enabled !== false);
                    lightPropertiesPanel.form.form_data.key_light_weight?.setValue(light.key_light_weight ?? 1);
                    lightPropertiesPanel.form.form_data.light_color.setValue(LightManagerUtils.colorHex(light.color));

                    let selectedTemp = light.temperature || 6500;
                    lightPropertiesPanel.form.form_data.light_temperature?.setValue(selectedTemp);
                    lightPropertiesPanel.form.form_data.light_temperature?.setColor(kelvinToTinyColor(selectedTemp));
                    lightPropertiesPanel.form.form_data.light_distance?.setValue(light.distance);
                    lightPropertiesPanel.form.form_data.light_cone_angle?.setValue(light.angle);
                    lightPropertiesPanel.form.form_data.light_cone_penumbra?.setValue(light.penumbra);

                    lightPropertiesPanel.form.form_data.cast_shadows?.setValue(light.has_shadow !== false);
                    lightPropertiesPanel.form.form_data.shadow_resolution.setValue(String(LightManagerUtils.shadowResolution(light.shadow_resolution)));
                    lightPropertiesPanel.form.form_data.studio_shadow_resolution.setValue(String(LightManagerUtils.studioShadowResolution(light.studio_shadow_resolution)));
                    lightPropertiesPanel.form.form_data.shadow_near.setValue(light.shadow_near);
                    lightPropertiesPanel.form.form_data.shadow_far.setValue(light.shadow_far);
                    lightPropertiesPanel.form.form_data.shadow_bounds.setValue(light.shadow_bounds);
                    lightPropertiesPanel.form.form_data.shadow_softness.setValue(light.shadow_softness);
                    lightPropertiesPanel.form.form_data.shadow_bias.setValue(light.shadow_bias);
                    lightPropertiesPanel.form.form_data.shadow_normal_bias.setResetValue(LightManagerUtils.defaultShadowNormalBias(light));
                    lightPropertiesPanel.form.form_data.shadow_normal_bias.setValue(light.shadow_normal_bias);
                } finally {
                    syncingLightSettings = false;
                }
                lightPropertiesPanel.form.update();
            };

            refreshLightPropertiesPanel = (light = getSelectedLight()) => {
                if (!lightPropertiesPanel?.form) return;
                syncingLightSettings = true;
                try {
                    lightPropertiesPanel.form.form_config = panelForm(light);
                    lightPropertiesPanel.form.buildForm();
                    applyLightPanelFormGroups();
                    bindLightPanelColorControl();
                } finally {
                    syncingLightSettings = false;
                }
                if (light) syncLightSettingsPanel(light);
            };

            const syncLightManagerShadows = (options = {}) => {
                markLightManagerShadowsDirty(options);
                configureLightManagerRenderers();
                const lightObjectsChanged = ensureLightManagerThreeLights(options);
                configureLightManagerSceneShadowMeshes();
                const shadowFlagsChanged = syncLightManagerThreeLightShadowFlags(options);
                invalidateLightManagerShadowMaps();
                if (lightObjectsChanged || shadowFlagsChanged) {
                    notifyLightManagerShadowStateRepaired(options);
                }
            };

            const viewUpdateShadowListener = Blockbench.on('update_view', (options = {}) => {
                const elementAspects = options.element_aspects || {};
                const groupAspects = options.group_aspects || {};
                const editedElements = Array.isArray(options.elements) ? options.elements : [];
                if (editedElements.some(element => element?.type === 'art_key')) {
                    window.ShaderArchitectInvalidateArtKeys?.();
                    window.ShaderEngine?.requestPreviewRender?.({ cause: 'art_key_transform' });
                }
                const elements = Array.isArray(options.elements) ? options.elements : [];
                const groups = Array.isArray(options.groups) ? options.groups : [];
                const touchesElements = elements.length > 0 && (
                    !options.element_aspects ||
                    elementAspects.transform ||
                    elementAspects.geometry ||
                    elementAspects.faces ||
                    elementAspects.visibility
                );
                const touchesGroups = groups.length > 0 && (
                    !options.group_aspects ||
                    groupAspects.transform ||
                    groupAspects.visibility
                );

                if (!touchesElements && !touchesGroups) return;

                const hierarchyNodes = [];
                if (touchesElements && (elementAspects.transform || elementAspects.visibility || !options.element_aspects)) {
                    hierarchyNodes.push(...elements);
                }
                if (touchesGroups && (groupAspects.transform || groupAspects.visibility || !options.group_aspects)) {
                    hierarchyNodes.push(...groups);
                }
                if (hierarchyNodes.length) {
                    syncLightManagerParentedLights(hierarchyNodes, {
                        gizmos: true,
                        shadows: false
                    });
                }

                const sceneMembershipChanged = elements.some(element => {
                    const renderElement = element && element.type !== 'light' && element.type !== 'art_key' &&
                        !(window.LightElement && element instanceof window.LightElement) &&
                        !(window.ArtKeyElement && element instanceof window.ArtKeyElement);
                    return !!(renderElement && (
                        !options.element_aspects ||
                        elementAspects.geometry ||
                        elementAspects.visibility
                    ));
                }) || groups.some(group => group && (
                    !options.group_aspects ||
                    groupAspects.visibility
                ));

                if (sceneMembershipChanged) {
                    // Geometry replacement and visibility can change the set of
                    // shadow casters/receivers, so keep the complete repair path.
                    syncLightManagerShadows({ scene: true });
                } else {
                    // A transform or face edit changes only the shadow image.
                    // Match Animator.preview's lightweight path instead of
                    // rebuilding light objects and walking the scene per pointer
                    // event while the gizmo is moving.
                    markLightManagerAnimationFrameShadowsDirty();
                }
            });
            deletables.push(viewUpdateShadowListener);

            const finishEditShadowListener = Blockbench.on('finish_edit', ({ aspects } = {}) => {
                // Direct light controls and transform previews already enqueue
                // their precise updates. Only an outliner edit can add/remove
                // registry entries and needs the full cleanup pass.
                if (!aspects?.outliner) return;
                invalidateLightManagerParentedLightCache();
                window.update_light_element_callback?.({
                    shadows: true,
                    scene: false,
                    gizmos: false,
                    cleanup: true,
                    artKey: true
                });
            });
            deletables.push(finishEditShadowListener);

            /*
             * Shader Architect can replace a mesh material and its custom
             * depth/distance materials without emitting Blockbench's usual
             * update_view event. Since this renderer intentionally uses
             * manual shadow updates, that first material change previously
             * left the shadow target stale until a light control dirtied it.
             * Coalesce a full material pass into one shadow invalidation, but
             * do not mark the scene dirty: Shader Architect owns the mesh's
             * cast/receive flags for the material that was just applied.
             */
            let shaderMaterialShadowSyncPending = false;
            let shaderMaterialShadowSyncFrame = null;
            const shaderMaterialShadowListener = Blockbench.on('shader_material_applied', () => {
                if (shaderMaterialShadowSyncPending) return;
                shaderMaterialShadowSyncPending = true;

                const sync = () => {
                    shaderMaterialShadowSyncFrame = null;
                    if (!shaderMaterialShadowSyncPending) return;
                    shaderMaterialShadowSyncPending = false;
                    markLightManagerShadowsDirty();
                    configureLightManagerRenderers();
                    invalidateLightManagerShadowMaps();
                };

                if (typeof requestAnimationFrame === 'function') {
                    shaderMaterialShadowSyncFrame = requestAnimationFrame(sync);
                } else if (typeof queueMicrotask === 'function') {
                    shaderMaterialShadowSyncFrame = 'microtask';
                    queueMicrotask(sync);
                } else {
                    shaderMaterialShadowSyncFrame = 'promise';
                    Promise.resolve().then(sync);
                }
            });
            deletables.push(shaderMaterialShadowListener);
            deletables.push({
                delete: () => {
                    shaderMaterialShadowSyncPending = false;
                    if (typeof shaderMaterialShadowSyncFrame === 'number' && typeof cancelAnimationFrame === 'function') {
                        cancelAnimationFrame(shaderMaterialShadowSyncFrame);
                    }
                    shaderMaterialShadowSyncFrame = null;
                }
            });

            const undoSaveListener = Blockbench.on('load_undo_save', ({ save, reference } = {}) => {
                invalidateLightManagerParentedLightCache();
                const snapshots = [
                    ...Object.values(save?.elements || {}),
                    ...Object.values(reference?.elements || {})
                ];
                const lightOnly = snapshots.length > 0 && snapshots.every(element => (
                    element?.type === 'light' ||
                    element?.type === 'art_key' ||
                    (window.LightElement && element instanceof window.LightElement) ||
                    (window.ArtKeyElement && element instanceof window.ArtKeyElement)
                ));

                if (lightOnly) {
                    window.ShaderEngine?.beginLightTopologyTransaction?.('light_undo');
                }
                if (!lightOnly) markLightManagerShadowsDirty({ scene: true });
                window.update_light_element_callback?.({
                    shadows: true,
                    scene: !lightOnly,
                    gizmos: true,
                    cleanup: true,
                    artKey: snapshots.some(element => element?.type === 'art_key' || element?.light_type === 'art_key')
                });
            });
            deletables.push(undoSaveListener);

            const parentedLightRegistryListeners = ['add_light', 'remove_light', 'add_art_key', 'remove_art_key'].map(eventName => (
                Blockbench.on(eventName, invalidateLightManagerParentedLightCache)
            ));
            deletables.push(...parentedLightRegistryListeners);

            ['add_cube', 'add_mesh', 'add_texture_mesh', 'add_billboard', 'add_lightflow_volume'].forEach(eventName => {
                const listener = Blockbench.on(eventName, () => {
                    markLightManagerShadowsDirty({ scene: true });
                });
                deletables.push(listener);
            });

            let lightPanelSelectionListener = Blockbench.on('update_selection', () => {
                const light = getSelectedLight();
                if (light && lightPropertiesPanel?.form?.form_data?.light_type) {
                    syncLightSettingsPanel(light);
                } else {
                    refreshLightPropertiesPanel(light);
                }
                syncContextualLightPropertiesPanel();
                const renderElementSelected = [window.Cube, window.Mesh, window.TextureMesh, window.Billboard, window.LightflowVolumeElement].some(ElementType => (
                    ElementType && Array.isArray(ElementType.selected) && ElementType.selected.length > 0
                ));
                if (Project.mode === 'render' && getSelectedLights().length > 0 && !renderElementSelected) {
                    lightPropertiesPanel.selectTab(lightPropertiesPanel);
                }
            });
            deletables.push(lightPanelSelectionListener);
            deletables.push({
                delete() {
                    const uvPanel = window.Panels?.uv;
                    if (uvPanel?.open_attached_panel === lightPropertiesPanel) {
                        uvPanel.selectTab(uvPanel);
                    }
                }
            });
            deletables.push(lightPropertiesPanel, lightPropertiesPanelListener);

            window.LIGHT_MANAGER_LOADED = true;
            [
                'LIGHT_MANAGER_LOADED',
                'LightManagerMarkShadowsDirty',
                'ComboSlider',
                'CompactDropdownSelect',
                'BarDisplay',
                'TextInputWidget',
                'AdvancedColorPicker',
                'applyIndestructibleFormGroups',
                'LightManagerUI',
                'LightManagerRefreshIconTextures',
                'LightElement',
                'ArtKeyElement',
                'LightAnimator',
                'light_properties_panel'
            ].forEach(trackLightManagerWindowBinding);
            window.LightManagerPrepareRender?.();
            window.dispatchEvent(new CustomEvent('light_manager_initialized', {
                detail: 'Light Manager plugin has been initialized and is ready to use.'
            }));

        },

        onunload() {
            cancelLightManagerElementUpdate();
            cancelScheduledLightManagerTasks();
            disposeDocumentInteractions();
            const ownedLightElement = lightManagerOwnedWindowBindings.get('LightElement');
            const ownedArtKeyElement = lightManagerOwnedWindowBindings.get('ArtKeyElement');
            lightManagerOwnedWindowBindings.get('LightManagerAreaGizmos')?.clear?.();
            lightManagerOwnedWindowBindings.get('LightManagerViewportControls')?.dispose?.();
            disposeLightElementPreviewResources(ownedLightElement);
            disposeLightManagerResources();
            cleanupLightManagerRegistries();

            Object.keys(window.three_lights || {}).forEach(uuid => {
                const light = window.three_lights[uuid];
                if (!light?.userData?.lightManagerElementUuid) return;
                disposeThreeLight(light);
                delete window.three_lights[uuid];
            });
            disposeRetiredLightManagerLights();

            if (ownedThreeLightsGroup) {
                const fallbackParent = window.Canvas?.scene || ownedThreeLightsGroup.parent;
                if (fallbackParent) {
                    ownedThreeLightsGroup.children.slice().forEach(child => fallbackParent.add(child));
                }
                ownedThreeLightsGroup.parent?.remove?.(ownedThreeLightsGroup);
                if (window.three_lights_group === ownedThreeLightsGroup) {
                    delete window.three_lights_group;
                }
            }
            ownedThreeLightsGroup = null;

            Object.keys(lightTextures).forEach(key => {
                if (lightTextures[key] && typeof lightTextures[key].dispose === 'function') {
                    lightTextures[key].dispose();
                }
                delete lightTextures[key];
            });
            lightTextures = {};

            if (OutlinerElement.types.light === ownedLightElement) {
                delete OutlinerElement.types.light;
            }
            if (NodePreviewController.controllers?.light === lightPreviewController) {
                lightPreviewController.delete();
            }
            lightPreviewController = null;
            (ownedArtKeyElement?.all || []).slice().forEach(element => {
                artKeyPreviewController?.remove?.(element);
            });
            if (OutlinerElement.types.art_key === ownedArtKeyElement) {
                delete OutlinerElement.types.art_key;
            }
            if (NodePreviewController.controllers?.art_key === artKeyPreviewController) {
                artKeyPreviewController.delete();
            }
            artKeyPreviewController = null;

            lightManagerUIApi = null;
            if (window.LightflowLifecycle === lightflowLifecycle) {
                lightflowLifecycle?.releaseOwner?.();
            }
            lightflowLifecycle = null;
            restoreLightManagerAnimatorPreview();
            restoreLightManagerRendererShadowSettings();
            resetLightManagerShadowState();
            clearOwnedLightManagerWindowBindings();
        }
    });
}

// Asynchronous initialization of all exclusive textures that will visually represent each light type
async function loadLightIconSources() {
    const specs = [
        ['point', 'lightbulb', 'P'],
        ['directional', 'light_mode', 'D'],
        ['spot', 'highlight', 'S']
    ];

    const generated = await Promise.all(specs.map(async ([key, icon, fallbackLabel]) => {
        try {
            const source = await generateIconBase64(icon, 128, {
                fontFamily: 'Material Icons',
                color: 'rgba(255, 255, 255, 1)'
            });
            return [key, source];
        } catch (error) {
            warnLightManagerOnce(`icon-${key}`, `[Light Manager] Could not render the ${key} Material icon; using a fallback.`, error);
            return [key, lightManagerFallbackIconDataUrl(fallbackLabel)];
        }
    }));
    generated.forEach(([key, source]) => { lightIconSources[key] = source; });
    window.LightManagerRefreshIconTextures?.(lightIconSources);
}

// Register the plugin and its custom outliner type synchronously. Icon polish
// is cosmetic and must never delay project parsing.
lightIconSources.point = lightManagerFallbackIconDataUrl('P');
lightIconSources.directional = lightManagerFallbackIconDataUrl('D');
lightIconSources.spot = lightManagerFallbackIconDataUrl('S');
initializeLightManagerPlugin();

const scheduleLightManagerIconUpgrade = callback => {
    if (typeof requestIdleCallback === 'function') {
        let cancellation;
        const idleRequest = requestIdleCallback(() => {
            lightManagerScheduledTaskCancellations.delete(cancellation);
            callback();
        }, { timeout: 1800 });
        cancellation = () => {
            if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleRequest);
        };
        lightManagerScheduledTaskCancellations.add(cancellation);
    } else {
        scheduleLightManagerTimeout(callback, 0);
    }
};
scheduleLightManagerIconUpgrade(() => {
    loadLightIconSources().catch(error => {
        console.warn('[Light Manager] Material icon upgrade failed; fallback icons remain active.', error);
    });
});
