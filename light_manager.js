/**
 * @typedef {Object} IconOptions
 * @property {string} [fontFamily='Material Icons'] - The CSS font-family name for the icons.
 * @property {string}[color='rgba(0, 0, 0, 1)'] - CSS color string (hex, rgb, rgba).
 * @property {string} [format='image/png'] - The output image MIME type.
 * @property {number} [quality=1.0] - Image quality for lossy formats (0.0 to 1.0).
 */

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
    // 1. Validation & Font Loading
    try {
        await document.fonts.load(`${size}px "${fontFamily}"`);
    } catch (error) {
        throw new Error(`Failed to load font family: ${fontFamily}`);
    }

    // 2. Canvas Setup
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Canvas 2D context is not supported.');
    }

    // 3. Rendering Logic
    ctx.clearRect(0, 0, size, size); // Ensure background is fully transparent
    ctx.fillStyle = color;
    ctx.font = `${size}px "${fontFamily}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw icon at the center of the canvas
    ctx.fillText(iconName, size / 2, size / 2);

    // 4. Export
    return canvas.toDataURL(format, quality);
}

window.generateIconBase64 = generateIconBase64;

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
const LIGHT_MANAGER_SHADOW_NORMAL_BIAS_LEGACY_DEFAULTS = [0.012];
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

const LIGHT_MANAGER_BAR_ITEM_IDS = [
    'add_light',
    'add_spot_light',
    'add_directional_light',
    'edit_light_properties',
    'fit_light_bounds_to_selection',
    'light_manager_edit_tool',
    'light_manager_free_move',
    'toggle_light_area_gizmos',
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

const LIGHT_MANAGER_TOOLBAR_IDS = [
    'light_gizmo_tools',
    'light_quickbuttons',
    'light_shadow_quality',
    'light_settings',
    'light_shadow_clip_settings',
    'light_shadow_bounds_settings',
    'light_shadow_bias_settings'
];

const LIGHT_MANAGER_TOOLBAR_DEFAULT_CHILDREN = {
    light_gizmo_tools: ['light_manager_edit_tool', 'light_manager_free_move'],
    light_quickbuttons: ['light_type_select', 'light_color_picker', '#', 'light_temperature_slider'],
    light_shadow_quality: ['cast_shadows', '#', 'light_shadow_resolution_select', 'light_studio_shadow_resolution_select'],
    light_settings: ['light_intensity_slider', '#', 'light_distance_slider', '#', 'light_cone_angle_slider', '#', 'light_cone_penumbra_slider'],
    light_shadow_clip_settings: ['light_shadow_near_sliderbox', 'light_shadow_far_sliderbox'],
    light_shadow_bounds_settings: ['light_shadow_bounds_slider'],
    light_shadow_bias_settings: ['light_shadow_softness_sliderbox', '#', 'light_shadow_bias_sliderbox', '#', 'light_shadow_normal_bias_sliderbox']
};

function deleteLightManagerRegistryItem(registry, id) {
    if (!registry || !id) return;

    const item = registry[id];
    if (item && typeof item.delete === 'function') {
        try {
            item.delete();
        } catch (error) {
            // Ignore stale registry cleanup failures during plugin reload.
        }
    }

    if (registry[id] === item) {
        delete registry[id];
    }
}

function cleanupLightManagerRegistries() {
    const barItems = typeof BarItems !== 'undefined' ? BarItems : window.BarItems;
    const toolbars = typeof Toolbars !== 'undefined' ? Toolbars : window.Toolbars;

    LIGHT_MANAGER_BAR_ITEM_IDS.forEach(id => deleteLightManagerRegistryItem(barItems, id));
    LIGHT_MANAGER_TOOLBAR_IDS.forEach(id => deleteLightManagerRegistryItem(toolbars, id));
}

function lightManagerStoredToolbarMissingDefault(storedChildren, defaultChildren) {
    if (!Array.isArray(storedChildren) || !Array.isArray(defaultChildren)) return false;

    return defaultChildren.some(child => {
        if (typeof child !== 'string' || child.match(/^[_+#]/)) return false;
        return !storedChildren.includes(child);
    });
}

function resetLightManagerStoredToolbarLayouts() {
    const bars = typeof BARS !== 'undefined' ? BARS : window.BARS;
    let changed = false;

    if (bars && bars.stored) {
        LIGHT_MANAGER_TOOLBAR_IDS.forEach(id => {
            if (!lightManagerStoredToolbarMissingDefault(bars.stored[id], LIGHT_MANAGER_TOOLBAR_DEFAULT_CHILDREN[id])) return;
            delete bars.stored[id];
            changed = true;
        });
    }

    if (typeof localStorage !== 'undefined') {
        try {
            const storedToolbars = JSON.parse(localStorage.getItem('toolbars') || '{}');
            LIGHT_MANAGER_TOOLBAR_IDS.forEach(id => {
                if (!lightManagerStoredToolbarMissingDefault(storedToolbars[id], LIGHT_MANAGER_TOOLBAR_DEFAULT_CHILDREN[id])) return;
                delete storedToolbars[id];
                changed = true;
            });
            if (changed) localStorage.setItem('toolbars', JSON.stringify(storedToolbars));
        } catch (error) {
            // Ignore invalid toolbar storage; Blockbench will rebuild from defaults.
        }
    }
}

const LIGHT_MANAGER_SHADOW_STATE = {
    dirty: true,
    sceneDirty: true,
    shadowSignature: null,
    dirtyRenderers: new Set(),
    configuredRenderers: new Set(),
    previousRendererShadowSettings: new WeakMap()
};

const LIGHT_MANAGER_SHADOW_DEBUG_STATE = {
    lastLogs: new Map()
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
    preparingLights: false
};

const LIGHT_MANAGER_DEFAULT_UPDATE_OPTIONS = {
    shadows: true,
    scene: true,
    gizmos: true,
    studio: false
};

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
    LIGHT_MANAGER_SHADOW_STATE.dirty = true;
    LIGHT_MANAGER_SHADOW_STATE.sceneDirty = true;
    LIGHT_MANAGER_SHADOW_STATE.shadowSignature = null;
    LIGHT_MANAGER_SHADOW_STATE.dirtyRenderers = new Set();
    LIGHT_MANAGER_SHADOW_STATE.configuredRenderers = new Set();
    LIGHT_MANAGER_SHADOW_STATE.previousRendererShadowSettings = new WeakMap();
    LIGHT_MANAGER_SHADOW_DEBUG_STATE.lastLogs.clear();
}

function markLightManagerShadowsDirty(options = {}) {
    LIGHT_MANAGER_SHADOW_STATE.dirty = true;
    LIGHT_MANAGER_SHADOW_STATE.dirtyRenderers.clear();
    if (options.scene) LIGHT_MANAGER_SHADOW_STATE.sceneDirty = true;
}

function lightManagerHasActiveShadowLights() {
    if (window.LightElement && Array.isArray(LightElement.all)) {
        return LightElement.all.some(element => {
            return element && element.visibility !== false && element.has_shadow !== false;
        });
    }

    return Object.values(window.three_lights || {}).some(light => {
        return light && light.visible !== false && light.castShadow !== false;
    });
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

function getLightManagerShadowSignature() {
    const elements = window.LightElement && Array.isArray(LightElement.all) ? LightElement.all : [];
    return elements
        .map(element => {
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

            return [
                element.uuid || element.name || '',
                element.visibility !== false ? 1 : 0,
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
            ].join('|');
        })
        .filter(Boolean)
        .sort()
        .join(';');
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
        distance: 18,
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
        distance: 28,
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
        return fallback;
    }
}

function lightManagerSafeSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (error) {
        // Storage can be unavailable in restricted contexts; the plugin should still work.
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
        const shadow_near = this.num(context.shadow_near, 0.1, 0, 99999);
        const shadow_far = Math.max(shadow_near + 0.001, this.num(context.shadow_far, 200, 0.001, 100000));

        return {
            light_type: this.lightType(context.light_type),
            shadow_resolution: this.shadowResolution(context.shadow_resolution),
            shadow_bounds: this.num(context.shadow_bounds, 35, 0.001, 100000),
            distance: this.num(context.distance, 0, 0, 100000),
            angle: this.num(context.angle, 45, 0.1, 89.9),
            shadow_near,
            shadow_far
        };
    },

    defaultShadowNormalBias(source, overrides = {}) {
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
        const bias = worldUnitsPerTexel * 0.72;
        return Math.round(Math.max(0.00025, Math.min(0.12, bias)) * 100000) / 100000;
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
        if (source) defaults.push(this.defaultShadowNormalBias(source));
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
        if (options && (options.studio || options.studioRender)) {
            const studioResolution = this.studioShadowResolution(element && element.studio_shadow_resolution);
            if (studioResolution > 0) {
                const preview = options.preview || window.LightManagerStudioRenderPreview;
                const gpuMaximum = Number(
                    preview?.renderer?.capabilities?.maxTextureSize ||
                    preview?.renderer?.getContext?.()?.getParameter?.(
                        preview.renderer.getContext().MAX_TEXTURE_SIZE
                    )
                );
                if (Number.isFinite(gpuMaximum) && gpuMaximum > 0) {
                    return Math.min(studioResolution, gpuMaximum);
                }
                return studioResolution;
            }
        }
        return this.shadowResolution(element && element.shadow_resolution);
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
        const light_type = this.lightType(config.light_type);
        const shadow_near = this.num(config.shadow_near, 0.1, 0, 99999);
        const shadow_far = Math.max(shadow_near + 0.001, this.num(config.shadow_far, 200, 0.001, 100000));

        const shadow_resolution = this.shadowResolution(config.shadow_resolution);
        const studio_shadow_resolution = this.studioShadowResolution(config.studio_shadow_resolution);
        const shadow_bounds = this.num(config.shadow_bounds, 35, 0.001, 100000);
        const shadowContext = {
            ...config,
            light_type,
            shadow_resolution,
            shadow_near,
            shadow_far,
            shadow_bounds
        };

        return {
            light_type,
            color: this.colorArray(config.color),
            intensity: this.num(config.intensity, 1, 0, 100000),
            distance: this.num(config.distance, 0, 0, 100000),
            angle: this.num(config.angle, 45, 0.1, 89.9),
            penumbra: this.num(config.penumbra, 0, 0, 1),
            has_shadow: this.bool(config.has_shadow, true),
            shadow_resolution,
            studio_shadow_resolution,
            shadow_bias: this.num(config.shadow_bias, DEFAULT_SHADOW_BIAS, -1, 1),
            shadow_normal_bias: this.shadowNormalBias(config.shadow_normal_bias, shadowContext),
            shadow_softness: this.shadowSoftness(config.shadow_softness),
            shadow_near,
            shadow_far,
            shadow_bounds
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

    applyConfig(light, config) {
        if (!light) return;
        Object.assign(light, this.sanitizeConfig(config));
        light.render_color = light.color.slice();
        light.render_intensity = light.intensity;
        light.render_rotation = Array.isArray(light.rotation) ? light.rotation.slice() : [0, 0, 0];
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
     * A resolution change disposes shadow.map and creates a fresh GPU target.
     * Do not lock WebGLShadowMap in manual mode here: with autoUpdate = false,
     * a later normal preview render can sample the newly allocated-but-empty
     * target before a shadow pass has populated it, which makes the whole
     * scene look fully occluded.
     */
    if (renderer.shadowMap.autoUpdate !== true) {
        renderer.shadowMap.autoUpdate = true;
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

function configureLightManagerSceneShadowMeshes(force = false) {
    if (!force && !LIGHT_MANAGER_SHADOW_STATE.sceneDirty) return false;
    if (!lightManagerHasActiveShadowLights()) return false;

    let changed = false;
    const elements = Array.isArray(window.Outliner?.elements) ? window.Outliner.elements : [];

    elements.forEach(element => {
        if (!element || element.type === 'light' || (window.LightElement && element instanceof window.LightElement)) return;

        const mesh = element.mesh;
        if (!mesh || typeof mesh.traverse !== 'function') return;

        mesh.traverse(object => {
            if (!object || object.isLight || object.isCamera) return;
            if (object.isMesh) {
                if (object.castShadow !== true) {
                    object.castShadow = true;
                    changed = true;
                }
                if (object.receiveShadow !== true) {
                    object.receiveShadow = true;
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
 * IMPORTANT: keep the WebGLRenderTarget and its Texture object alive when a
 * shadow resolution changes.
 *
 * ShaderMaterial light uniforms hold references to pointShadowMap[]. Replacing
 * shadow.map with null creates a new Texture object. In Three r129, programs
 * can keep the previous sampler binding while light counts remain unchanged,
 * making getPointShadow() compare against an invalid/empty texture. The result
 * is a direct-light factor of zero across the model.
 *
 * WebGLRenderTarget.setSize() is the correct path. It updates the backing GPU
 * allocation through the target's dispose event but preserves the target and
 * texture JS identities already referenced by the shader uniforms.
 */
function resizeLightManagerShadowMap(light, targetResolution) {
    const shadow = light?.shadow;
    if (!shadow) return { changed: false };

    const safeResolution = Math.max(1, Math.round(Number(targetResolution) || 1));
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

    if (resolutionAlreadyMatches && targetAlreadyMatches && shadow.map) {
        return { changed: false };
    }

    const errors = [];
    let resizeStrategy = 'await-first-allocation';
    let targetReused = false;
    let mapPassResized = false;
    let fallbackReset = null;

    if (shadow.map && typeof shadow.map.setSize === 'function') {
        try {
            shadow.map.setSize(expectedTarget.width, expectedTarget.height);
            targetReused = true;
            resizeStrategy = 'in-place-render-target-resize';

            if (
                shadow.mapPass &&
                shadow.mapPass !== shadow.map &&
                typeof shadow.mapPass.setSize === 'function'
            ) {
                shadow.mapPass.setSize(expectedTarget.width, expectedTarget.height);
                mapPassResized = true;
            }
        } catch (error) {
            errors.push(error?.message || String(error));
        }
    }

    if (shadow.map && !targetReused) {
        /*
         * Conservative fallback for an unexpected non-WebGLRenderTarget.
         * Normal Three r129 shadows always take the in-place branch above.
         */
        fallbackReset = disposeLightManagerShadowTargets(shadow);
        resizeStrategy = 'fallback-target-replacement';
    }

    if (shadow.mapSize && typeof shadow.mapSize.set === 'function') {
        shadow.mapSize.set(safeResolution, safeResolution);
    } else if (shadow.mapSize) {
        shadow.mapSize.width = safeResolution;
        shadow.mapSize.height = safeResolution;
    }

    shadow.needsUpdate = true;

    const mapAfter = getLightManagerShadowTargetDebug(shadow);

    return {
        changed: true,
        from: { width: fromWidth, height: fromHeight },
        to: safeResolution,
        expectedTarget,
        resizeStrategy,
        targetReused,
        mapPassResized,
        textureIdentityPreserved: !!(
            mapBefore &&
            mapAfter &&
            mapBefore.targetUuid === mapAfter.targetUuid &&
            mapBefore.textureUuid === mapAfter.textureUuid
        ),
        mapBefore,
        mapAfter,
        fallbackReset,
        resizeErrors: errors
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
            previewName !== studioPreviewName
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

    LightElement.all.forEach(element => {
        if (!element || !element.uuid) return;

        const light = window.three_lights && window.three_lights[element.uuid];
        if (!light) return;

        const desiredVisible = element.visibility !== false;
        const desiredCastShadow = element.has_shadow !== false;
        const before = {
            visible: light.visible !== false,
            castShadow: light.castShadow === true
        };
        let repaired = false;

        if (light.visible !== desiredVisible) {
            light.visible = desiredVisible;
            repaired = true;
        }

        if (light.castShadow !== desiredCastShadow) {
            light.castShadow = desiredCastShadow;
            if (light.shadow) {
                light.shadow.needsUpdate = true;
            }
            repaired = true;
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

    if (!repairs.length) return false;

    markLightManagerShadowsDirty();
    logLightManagerShadowDebug('shadow-flag-repair', null, options, { repairs });
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
    let changed = false;
    const resolutionChanges = [];

    if (!window.LightElement || !Array.isArray(LightElement.all)) return false;
    if (
        window.LightManagerStudioRenderSession &&
        !renderOptions.studio &&
        preview !== window.LightManagerStudioRenderPreview
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
        const resize = resizeLightManagerShadowMap(light, targetResolution);
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

    const activeResolution = LightManagerUtils.getRenderShadowResolution(
        element,
        options
    );
    const shadowContext = {
        ...element,
        shadow_resolution: activeResolution
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
        return false;
    }

    if (preview?.renderer?.shadowMap) {
        prepareLightManagerDirtyRenderers();
        if (!force && !LIGHT_MANAGER_SHADOW_STATE.dirtyRenderers.has(preview.renderer)) {
            return false;
        }

        Object.keys(window.three_lights || {}).forEach(uuid => {
            const light = window.three_lights[uuid];
            if (light && light.shadow) {
                light.shadow.needsUpdate = true;
            }
        });

        preview.renderer.shadowMap.needsUpdate = true;
        LIGHT_MANAGER_SHADOW_STATE.dirtyRenderers.delete(preview.renderer);
        if (LIGHT_MANAGER_SHADOW_STATE.dirtyRenderers.size === 0) {
            LIGHT_MANAGER_SHADOW_STATE.dirty = false;
        }
    } else {
        Object.keys(window.three_lights || {}).forEach(uuid => {
            const light = window.three_lights[uuid];
            if (light && light.shadow) {
                light.shadow.needsUpdate = true;
            }
        });

        forEachLightManagerPreview(candidate => {
            if (candidate?.renderer?.shadowMap) {
                candidate.renderer.shadowMap.needsUpdate = true;
            }
        });
        LIGHT_MANAGER_SHADOW_STATE.dirtyRenderers.clear();
        LIGHT_MANAGER_SHADOW_STATE.dirty = false;
    }

    return true;
}

function syncLightManagerShadowSignature() {
    const nextSignature = getLightManagerShadowSignature();
    if (LIGHT_MANAGER_SHADOW_STATE.shadowSignature !== nextSignature) {
        LIGHT_MANAGER_SHADOW_STATE.shadowSignature = nextSignature;
        markLightManagerShadowsDirty();
        return true;
    }
    return false;
}

function getLightManagerThreeLightConstructor(element) {
    if (!element || !window.THREE) return null;
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
        const light = window.three_lights[element.uuid];
        const LightConstructor = getLightManagerThreeLightConstructor(element);
        return !light || (LightConstructor && light.constructor !== LightConstructor);
    });
}

function ensureLightManagerThreeLights(options = {}) {
    if (!lightManagerNeedsThreeLightSync()) return false;
    if (LIGHT_MANAGER_UPDATE_STATE.preparingLights) return false;
    if (typeof runLightManagerElementUpdate !== 'function') return false;

    const beforeMissing = [];
    if (window.LightElement && Array.isArray(LightElement.all)) {
        LightElement.all.forEach(element => {
            if (!element || !element.uuid) return;
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
        !preview.sa_studio_render_active
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
    return {
        shadows: options.shadows !== false,
        scene: options.scene !== false,
        gizmos: options.gizmos !== false,
        studio: !!(options.studio || options.studioRender)
    };
}

function mergeLightManagerUpdateOptions(previous, next) {
    if (!previous) return next;

    return {
        shadows: previous.shadows || next.shadows,
        scene: previous.scene || next.scene,
        gizmos: previous.gizmos || next.gizmos,
        studio: previous.studio || next.studio
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
        if (element.has_shadow !== false) return Math.max(0.001, this.num(element.shadow_far, fallback));
        return fallback;
    },

    buildSpotVertices(element) {
        const range = Math.max(0.001, this.getRange(element, 8));
        const angle = THREE.MathUtils.degToRad(this.clamp(this.num(element.angle, 45), 0.1, 89.9));
        const radius = Math.tan(angle) * range;
        const vertices = [];
        const segments = 64;

        this.pushCircle(vertices, radius, -range, 'xy', segments);

        const spokes = 8;
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
        this.pushCircle(vertices, radius, 0, 'xy', 64);
        this.pushCircle(vertices, radius, 0, 'xz', 64);
        this.pushCircle(vertices, radius, 0, 'yz', 64);
        return vertices;
    },

    buildVertices(element) {
        if (element.light_type === 'directional') return this.buildDirectionalVertices(element);
        if (element.light_type === 'spot') return this.buildSpotVertices(element);
        return this.buildPointVertices(element);
    },

    getSignature(element) {
        return [
            element.light_type || 'point',
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
            depthTest: false,
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
        helper.root.visible = element.visibility !== false;

        const color = this.getColor01(element);
        helper.material.color.setRGB(color[0], color[1], color[2]);
        helper.material.opacity = element.selected ? 0.72 : 0.26;
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

    setEnabled(enabled) {
        this.enabled = !!enabled;
        lightManagerSafeSet(LIGHT_MANAGER_STORAGE_KEYS.areaGizmos, this.enabled ? 'true' : 'false');
        if (this.enabled) this.updateAll();
        else this.clear();
        window.LightManagerViewportControls?.updateAll();
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
        cone: '#F4D714',
        penumbra: '#F96BC5',
        bounds: '#B55AF8',
        near: '#EC9218',
        far: '#FA565D',
        moving: '#AFFF62'
    },

    install() {
        if (this.installed || typeof document === 'undefined') return;
        this.boundPointerDown = event => this.onPointerDown(event);
        this.boundPointerMove = event => this.onPointerMove(event);
        this.boundPointerUp = event => this.onPointerUp(event);
        this.boundKeyDown = event => this.onKeyDown(event);
        document.addEventListener('pointerdown', this.boundPointerDown, true);
        document.addEventListener('pointermove', this.boundPointerMove, true);
        document.addEventListener('pointerup', this.boundPointerUp, true);
        document.addEventListener('keydown', this.boundKeyDown, true);
        if (window.Blockbench && typeof Blockbench.on === 'function') {
            this.listeners.push(Blockbench.on('update_selection', () => this.updateAll()));
            this.listeners.push(Blockbench.on('select_mode', () => this.updateAll()));
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

    createLineMaterial(color, opacity = 0.5) {
        const material = new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthTest: false,
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

        const lineMaterial = this.createLineMaterial(0xffffff, 0.42);
        const guideLine = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial);
        guideLine.name = `light_manager_control_guides_${element.uuid}`;
        guideLine.raycast = () => { };
        root.add(guideLine);

        const handles = {
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
        return !window.Modes || !!Modes.edit;
    },

    canShowViewportGizmos() {
        if (window.Canvas && Canvas.show_gizmos === false) return false;
        if (window.LightManagerAreaGizmos && LightManagerAreaGizmos.enabled === false) return false;
        return true;
    },

    isHandleToolAllowed() {
        const id = window.Toolbox && Toolbox.selected && Toolbox.selected.id;
        return !id || ['light_manager_edit_tool', 'move_tool', 'resize_tool', 'scale_tool', 'rotate_tool'].includes(id);
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
        if (element.has_shadow !== false) return Math.max(0.001, this.num(element.shadow_far, fallback));
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
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        helper.guideLine.geometry.dispose();
        helper.guideLine.geometry = geometry;
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
        if (!this.isEditMode() || !this.canShowViewportGizmos()) {
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
            LightElement.preview_controller.updateSelection(light);
        }
        window.update_light_element_callback?.(this.getLightUpdateOptions(property));
        window.LightManagerAreaGizmos?.updateAll();
        this.updateAll();
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
                element_aspects: { transform: true, geometry: true }
            });
        }
        lightElements.forEach(light => {
            LightManagerUtils.sanitizeLight(light);
            LightElement.preview_controller?.updateSelection(light);
        });
        if (lightElements.length) {
            window.update_light_element_callback?.({ shadows: true, scene: false, gizmos: true });
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
        if (typeof Locator !== 'undefined') this.addSelectionList(nodes, Locator.selected);
        if (typeof NullObject !== 'undefined') this.addSelectionList(nodes, NullObject.selected);

        return nodes.filter(Boolean);
    },

    isLightNode(node) {
        return !!node && (
            node.type === 'light' ||
            (window.LightElement && node instanceof window.LightElement)
        );
    },

    addTargetNode(node, target, seen) {
        if (!node || this.isLightNode(node)) return;

        const key = node.uuid || node;
        if (seen.has(key)) return;
        seen.add(key);

        if (node.mesh) target.push(node);

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

        const startCount = points.length;
        const visit = child => {
            if (!child || child.type === 'Sprite') return;
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

        if (!object.isObject3D) return;

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

if (!THREE.ShaderChunk.common.includes('PUNCTUAL_LIGHT_PATCH')) {
    THREE.ShaderChunk.common += `\n
    #ifndef PUNCTUAL_LIGHT_PATCH
    #define PUNCTUAL_LIGHT_PATCH
    float punctualLightIntensityToIrradianceFactor( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
        if( cutoffDistance > 0.0 && decayExponent > 0.0 ) {
            return pow( clamp( -lightDistance / cutoffDistance + 1.0, 0.0, 1.0 ), decayExponent );
        }
        return 1.0;
    }
    float punctualLightIntensityToIrradianceFactor( const in float lightDistance, const in float cutoffDistance ) {
        if( cutoffDistance > 0.0 ) {
            return clamp( 1.0 - lightDistance / cutoffDistance, 0.0, 1.0 );
        }
        return 1.0;
    }
    #endif
    `;
}

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

    // Ensure the main group exists in the scene
    if (!window.three_lights_group) {
        window.three_lights_group = new THREE.Group();
        window.three_lights_group.name = "light_manager_group";
        window.scene.add(window.three_lights_group);
    }

    // Keep track of active UUIDs to remove deleted lights
    const activeUuids = new Set();

    if (typeof LightElement !== 'undefined' && LightElement.all) {
        LightElement.all.forEach(element => {
            LightManagerUtils.sanitizeLight(element);
            activeUuids.add(element.uuid);

            let light = window.three_lights[element.uuid];

            // Determine required THREE light type based on user config
            let LightConstructor = getLightManagerThreeLightConstructor(element) || THREE.PointLight;

            // Recreate if type changed or it doesn't exist
            if (!light || light.constructor !== LightConstructor) {
                if (light) {
                    window.three_lights_group.remove(light);
                    if (light.target) window.three_lights_group.remove(light.target);
                    if (light.dispose) light.dispose();
                }

                const safeColor = LightManagerUtils.colorArray(element.color);
                const colorHex = new THREE.Color(safeColor[0] / 255, safeColor[1] / 255, safeColor[2] / 255).getHex();
                light = new LightConstructor(colorHex, element.intensity);

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
            light.intensity = LightManagerUtils.num(element.render_intensity ?? element.intensity, element.intensity, 0, 100000);
            light.visible = element.visibility;
            light.castShadow = element.has_shadow !== false;

            // Sync dynamic shadow properties
            if (updateOptions.shadows && light.shadow) {
                const targetResolution = LightManagerUtils.getRenderShadowResolution(element, updateOptions);
                const resize = resizeLightManagerShadowMap(light, targetResolution);
                if (resize.changed) {
                    markLightManagerShadowsDirty();
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
                    markLightManagerShadowsDirty();
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
                let worldPos = new THREE.Vector3();
                let worldQuat = new THREE.Quaternion();
                element.mesh.getWorldPosition(worldPos);
                element.mesh.getWorldQuaternion(worldQuat);

                light.position.copy(worldPos);

                if (light.target) {
                    let direction = new THREE.Vector3(0, 0, -1);
                    direction.applyQuaternion(worldQuat);
                    light.target.position.copy(worldPos).add(direction);
                    light.target.updateMatrixWorld(true);
                }
            }
        });
    }

    // Cleanup deleted lights
    for (const uuid in window.three_lights) {
        if (!activeUuids.has(uuid)) {
            const light = window.three_lights[uuid];
            if (light) {
                window.three_lights_group.remove(light);
                if (light.target) window.three_lights_group.remove(light.target);
                if (light.dispose) light.dispose();
            }
            delete window.three_lights[uuid];
        }
    }

    if (updateOptions.gizmos) {
        window.LightManagerAreaGizmos?.updateAll();
        window.LightManagerViewportControls?.updateAll();
    }

    if (updateOptions.shadows) {
        syncLightManagerShadowSignature();
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

// Dictionary to store Base64 textures for each light type
let light_icons_b64 = {};

/**
 * @name Light Manager
 * @author MidFord327
 * @description Adds animatable point, spot, and directional lights to the Blockbench outliner.
 */

function initialize_light_plugin() {
    Language.addTranslations('en', {
        'dialog.preview_options.show_light_area_gizmos': 'Show Light Area Gizmos',
        'panel.light_properties': 'LIGHT',
        'property.light_settings': 'Light Settings',
        'property.light_color': 'Light Color',
        'property.light_intensity': 'Intensity',
        'property.light_intensity.desc': 'The brightness of the light. Higher values produce brighter illumination.',
        'property.light_temperature': 'Temperature',
        'property.light_temperature.desc': 'Color temperature in Kelvin. Lower is warmer; higher is cooler.',
        'property.light_type': 'Light Type',
        'property.light_type.point': 'Point',
        'property.light_type.directional': 'Directional',
        'property.light_type.spot': 'Spot',
        'property.distance': 'Distance',
        'property.distance.desc': 'Maximum range of the light. 0 means no limit.',
        'property.angle': 'Cone Angle',
        'property.angle.desc': 'Angle of the spot light cone in degrees.',
        'property.penumbra': 'Penumbra',
        'property.penumbra.desc': 'Softness of the spot light cone edge (0 to 1).',
        'property.cone_angle': 'Cone Angle',
        'property.cone_angle.desc': 'Angle of the spot light cone in degrees.',
        'property.cone_penumbra': 'Penumbra',
        'property.cone_penumbra.desc': 'Softness of the spot light cone edge (0 to 1).',
        'property.light.viewport_tools': 'Viewport Tools',
        'property.light.quickbuttons': 'Light',
        'property.light.shadows': 'Shadows',
        'property.cast_shadows': 'Cast Shadows',
        'property.shadow_near': 'Near',
        'property.shadow_far': 'Far',
        'property.shadow_bounds': 'Bounds',
        'property.shadow_clip': 'Clip',
        'property.shadow_area': 'Shadow Area',
        'property.shadow_biases': 'Shadow Tuning',
        'property.shadow_resolution': 'Resolution',
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
        'light_manager.plugin.description': 'Adds animatable point, spot, and directional lights with viewport gizmos, shadow controls, and production presets. It is the lighting foundation for Shader Architect and Studio Render in the Lightflow suite.',
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
        'light_manager.action.free_move.desc': 'Move the selected elements on a camera-facing plane. Assign a shortcut such as G only if it does not conflict with your keymap.',
        'light_manager.action.edit_properties': 'Light Properties...',
        'light_manager.action.edit_properties.desc': 'Edit the selected light values, presets, and shadow settings.',
        'light_manager.message.select_lights_first': 'Select one or more lights first.',
        'light_manager.message.select_targets_first': 'Select at least one target object or group.',
        'light_manager.message.select_targets_too': 'Select target objects or groups too.',
        'light_manager.message.free_move_none': 'Select a movable element first.',
        'light_manager.message.free_move_wait': 'Move: drag in a viewport. Press X/Y/Z while dragging to constrain the axis.',
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
        'light_manager.undo.change_shadow_normal_bias': 'Change shadow normal bias'
    });

    Language.addTranslations('es', {
        'dialog.preview_options.show_light_area_gizmos': 'Mostrar gizmos de area de luz',
        'panel.light_properties': 'LUZ',
        'property.light_settings': 'Ajustes de luz',
        'property.light_color': 'Color de luz',
        'property.light_intensity': 'Intensidad',
        'property.light_intensity.desc': 'Brillo de la luz. Valores mas altos producen mas iluminacion.',
        'property.light_temperature': 'Temperatura',
        'property.light_temperature.desc': 'Temperatura de color en Kelvin. Menor es mas calida; mayor es mas fria.',
        'property.light_type': 'Tipo de luz',
        'property.light_type.point': 'Punto',
        'property.light_type.directional': 'Direccional',
        'property.light_type.spot': 'Spot',
        'property.distance': 'Distancia',
        'property.distance.desc': 'Rango maximo de la luz. 0 significa sin limite.',
        'property.angle': 'Angulo del cono',
        'property.angle.desc': 'Angulo del cono de la luz spot en grados.',
        'property.penumbra': 'Penumbra',
        'property.penumbra.desc': 'Suavidad del borde del cono spot (0 a 1).',
        'property.cone_angle': 'Angulo del cono',
        'property.cone_angle.desc': 'Angulo del cono de la luz spot en grados.',
        'property.cone_penumbra': 'Penumbra',
        'property.cone_penumbra.desc': 'Suavidad del borde del cono spot (0 a 1).',
        'property.light.viewport_tools': 'Herramientas de viewport',
        'property.light.quickbuttons': 'Luz',
        'property.light.shadows': 'Sombras',
        'property.cast_shadows': 'Proyecta sombras',
        'property.shadow_near': 'Cerca',
        'property.shadow_far': 'Lejos',
        'property.shadow_bounds': 'Area',
        'property.shadow_clip': 'Recorte',
        'property.shadow_area': 'Area de sombra',
        'property.shadow_biases': 'Ajuste de sombra',
        'property.shadow_resolution': 'Resolucion',
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
        'light_manager.plugin.description': 'Agrega luces de punto, spot y direccionales animables con gizmos de viewport, controles de sombra y presets listos para produccion. Es la base de iluminacion para Shader Architect y Studio Render en la suite Lightflow.',
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
        'light_manager.action.free_move.desc': 'Mueve los elementos seleccionados en un plano frente a la camara. Asigna un atajo como G solo si no entra en conflicto con tu mapa de teclas.',
        'light_manager.action.edit_properties': 'Propiedades de luz...',
        'light_manager.action.edit_properties.desc': 'Edita valores, presets y ajustes de sombra de las luces seleccionadas.',
        'light_manager.message.select_lights_first': 'Selecciona una o mas luces primero.',
        'light_manager.message.select_targets_first': 'Selecciona al menos un objeto o grupo objetivo.',
        'light_manager.message.select_targets_too': 'Selecciona tambien objetos o grupos objetivo.',
        'light_manager.message.free_move_none': 'Selecciona primero un elemento movible.',
        'light_manager.message.free_move_wait': 'Mover: arrastra en un viewport. Presiona X/Y/Z mientras arrastras para limitar el eje.',
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
        'light_manager.undo.change_shadow_normal_bias': 'Cambiar bias normal de sombra'
    });


    let deletables = [];
    let lightTextures = {}; // THREE.Texture instances will be loaded here
    let originalAnimatorPreview = null;

    const animationSign = Blockbench.isNewerThan('4.99') ? 1 : -1;

    function markLightManagerAnimationFrameShadowsDirty() {
        if (!lightManagerHasActiveShadowLights()) return;
        markLightManagerShadowsDirty();
    }

    function patchLightManagerAnimatorPreview() {
        if (!window.Animator || typeof Animator.preview !== 'function') return;
        if (originalAnimatorPreview) return;

        originalAnimatorPreview = Animator.preview;
        Animator.preview = function lightManagerAnimatorPreviewPatch() {
            const result = originalAnimatorPreview.apply(this, arguments);
            markLightManagerAnimationFrameShadowsDirty();
            return result;
        };
    }

    function restoreLightManagerAnimatorPreview() {
        if (originalAnimatorPreview && window.Animator && Animator.preview !== originalAnimatorPreview) {
            Animator.preview = originalAnimatorPreview;
        }
        originalAnimatorPreview = null;
    }

    function disposeLightManagerResources() {
        const resources = deletables.slice();
        deletables.length = 0;
        resources.forEach(item => {
            if (item && typeof item.delete === 'function') item.delete();
        });
    }

    function disposeThreeLight(light) {
        if (!light) return;
        if (light.parent) light.parent.remove(light);
        if (light.target && light.target.parent) light.target.parent.remove(light.target);
        if (light.shadow && light.shadow.map) light.shadow.map.dispose();
        if (typeof light.dispose === 'function') light.dispose();
    }

    Plugin.register('light_manager', {
        title: 'Light Manager',
        icon: 'light_mode',
        author: 'MidFord327',
        description: 'Add production-ready point, spot, and directional lights to Blockbench with viewport gizmos, animation support, shadows, and Studio Render controls. Provides the Lightflow lighting foundation for Shader Architect and Studio Render.',
        tags: ['Lightflow', 'Lighting', 'Shadows', 'Animation', 'Rendering', 'Studio'],
        version: '1.6.0',
        min_version: '4.9.0',
        variant: 'both',

        onload() {
            disposeLightManagerResources();
            cleanupLightManagerRegistries();
            resetLightManagerStoredToolbarLayouts();
            restoreLightManagerRendererShadowSettings();
            restoreLightManagerAnimatorPreview();
            resetLightManagerShadowState();
            window.LightManagerMarkShadowsDirty = markLightManagerShadowsDirty;
            patchLightManagerAnimatorPreview();

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

                    let numberContainer = Interface.createElement('div', {
                        class: 'numeric_input tool disp_text',
                        style: `display: flex;align-items: center;margin: 0;flex: 0 0 auto; `
                    }, [numberInput]);

                    let comboWrapper = Interface.createElement('div', {
                        class: 'bar slider_input_combo',
                        title: data.title ? tl(data.title) : '',
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
                        }, tl(data.label));
                        containerChildren.push(labelElement);
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

                    // Keep both inputs synchronized.
                    let $inputs = $(this.node).find('input');
                    let $range = $(this.node).find('input[type="range"]');
                    let $number = $(this.node).find('input[type="number"]');

                    $inputs.on('input', function (event) {
                        let val = parseFloat($(event.target).val());
                        if (isNaN(val)) return;
                        let is_number_input = event.target === $number[0];
                        scope.change(val, event.originalEvent, is_number_input);
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

                    // Tooltip includes the widget name and current option.
                    this.node.title = `${this.name ? this.name + ': ' : ''}${opt.name || key}`;

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
                        let icon_node = Blockbench.getIconNode(this.icon_name);
                        icon_node.style.fontSize = '1.1em';
                        this.node.append(icon_node);
                    }

                    // Optional label.
                    if (this.label) {
                        let label_node = document.createElement('span');
                        label_node.className = 'bar_display_label';
                        label_node.style.fontWeight = 'bold';
                        label_node.style.opacity = '0.85';
                        label_node.innerText = this.label;
                        this.node.append(label_node);
                    }

                    // Text container.
                    let text_node = document.createElement('span');
                    text_node.className = 'bar_display_content';
                    if (this.expand) {
                        text_node.style.flex = '1 1 0';
                        text_node.style.minWidth = '0';
                    }
                    text_node.style.textAlign = this.text_alignment;
                    if (this.is_paragraph) {
                        text_node.style.whiteSpace = 'pre-wrap';
                        text_node.style.lineHeight = '1.4';
                        text_node.style.maxWidth = '250px';
                    }
                    text_node.textContent = String(this.text ?? '');
                    this.node.append(text_node);
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
                    let condition_met = Condition(this.condition);
                    this.nodes.forEach(node => {
                        // Keep flex display so the toolbar layout remains stable.
                        node.style.display = condition_met ? 'flex' : 'none';
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

                    // Callbacks
                    this.onEdit = data.onEdit;
                    this.onFinishEdit = data.onFinishEdit;

                    // Outer Container Node
                    this.node = document.createElement('div');
                    this.node.className = 'tool wide widget text_input_widget';
                    this.node.setAttribute('toolbar_item', this.id);

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

                    // 1. Add Icon if defined
                    if (this.icon_name) {
                        let icon_node = Blockbench.getIconNode(this.icon_name);
                        icon_node.style.fontSize = '1em';
                        icon_node.style.marginRight = '4px';
                        icon_node.style.color = this.color || 'var(--color-text)';
                        this.node.append(icon_node);
                    }

                    // 2. Add standard Input element
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
                    let condition_met = Condition(this.condition);
                    this.node.style.display = condition_met ? 'flex' : 'none';

                    // Keep input synchronized if value was modified externally
                    if (this.input_node.value !== this.value) {
                        this.input_node.value = this.value;
                    }

                    this.dispatchEvent('update', {});
                    return this;
                }
            }

            window.TextInputWidget = TextInputWidget;

            class HorizontalSelectWidget extends Widget {
                constructor(id, data) {
                    if (typeof id === 'object') {
                        data = id;
                        id = data.id;
                    }
                    super(id, data);

                    this.type = 'horizontal_select';

                    // Settings
                    this.options = data.options || {};
                    this.selected = []; // Internally we always use an array to support multi-select
                    this.expand = !!data.expand;
                    this.bg_color = data.bg_color || 'var(--color-back)';
                    this.divider_color = data.divider_color || 'var(--color-border)';
                    this.allow_empty = data.allow_empty !== undefined ? data.allow_empty : true;

                    // Callbacks
                    this.onSelect = data.onSelect;
                    this.onChange = data.onChange;

                    // Ensure default selection
                    if (data.value !== undefined) {
                        this.selected = Array.isArray(data.value) ? [...data.value] : [data.value];
                    } else if (!this.allow_empty && Object.keys(this.options).length > 0) {
                        this.selected = [Object.keys(this.options)[0]];
                    }

                    // Main Container Node
                    this.node = document.createElement('div');
                    this.node.className = 'tool widget horizontal_select_widget';
                    this.node.setAttribute('toolbar_item', this.id);

                    // Container Styles
                    this.node.style.backgroundColor = this.bg_color;
                    this.node.style.border = `1px solid ${this.divider_color}`;

                    if (this.expand) {
                        this.node.style.flex = '1 1 auto';
                        this.node.style.width = '100%';
                    } else {
                        this.node.style.flex = '0 0 auto';
                        this.node.style.display = 'inline-flex';
                    }

                    this.nodes = [this.node];
                    this.button_nodes = {}; // Store references to individual buttons

                    this.buildDOM();
                    this.updateSelectionVisuals();
                }

                /**
                 * Builds the buttons and dividers inside the main container
                 */
                buildDOM() {
                    this.node.innerHTML = '';
                    this.button_nodes = {};

                    let keys = Object.keys(this.options);

                    keys.forEach((key, index) => {
                        let opt = this.options[key];

                        // Create Button Wrapper
                        let btn = document.createElement('div');
                        btn.className = 'horizontal_select_btn';
                        btn.setAttribute('data-key', key);

                        if (this.expand) {
                            btn.style.flex = '1 1 0';
                        }

                        // Divider logic
                        if (index < keys.length - 1) {
                            btn.style.borderRight = `1px solid ${this.divider_color}`;
                        }

                        // Disable State
                        if (opt.disabled) {
                            btn.classList.add('disabled');
                        }

                        // Custom Colors (Only applied when NOT selected, CSS handles the selected state)
                        if (opt.color) {
                            btn.style.color = opt.color;
                        }

                        // Icon Element
                        let hasIcon = !!opt.icon;
                        let hasName = !!opt.name;

                        if (!hasName) btn.classList.add('icon_only');

                        if (hasIcon) {
                            let iconElement = Blockbench.getIconNode(opt.icon);
                            iconElement.classList.add('horizontal_select_icon');
                            btn.appendChild(iconElement);
                        }

                        // Text Label Element
                        if (hasName) {
                            let labelElement = document.createElement('span');
                            labelElement.className = 'horizontal_select_label';
                            labelElement.innerText = tl(opt.name); // Using tl() for Blockbench localization
                            btn.appendChild(labelElement);
                        }

                        // Tooltip
                        if (opt.description || hasName) {
                            btn.title = opt.description ? tl(opt.description) : tl(opt.name);
                        }

                        // Click Event Listener
                        btn.addEventListener('click', (event) => {
                            if (this.options[key].disabled) return;
                            this.handleInteraction(key, event);
                        });

                        this.button_nodes[key] = btn;
                        this.node.appendChild(btn);
                    });
                }

                /**
                 * Handles user clicks, taking Ctrl/Shift modifiers into account
                 */
                handleInteraction(key, event) {
                    let isMulti = event.ctrlKey || event.shiftKey;

                    if (isMulti) {
                        // Toggle selection
                        if (this.selected.includes(key)) {
                            if (this.allow_empty || this.selected.length > 1) {
                                this.selected = this.selected.filter(k => k !== key);
                            }
                        } else {
                            this.selected.push(key);
                        }
                    } else {
                        // Single select: If clicking the only selected item, optionally allow deselect
                        if (this.selected.length === 1 && this.selected[0] === key) {
                            if (this.allow_empty) {
                                this.selected = [];
                            }
                        } else {
                            this.selected = [key];
                        }
                    }

                    this.updateSelectionVisuals();

                    let returnValue = this.get();
                    if (this.onSelect) this.onSelect(returnValue, event);
                    if (this.onChange) this.onChange(returnValue, event);
                    this.dispatchEvent('change', { value: returnValue, event });
                }

                /**
                 * Updates the CSS classes for selected buttons
                 */
                updateSelectionVisuals() {
                    for (let key in this.button_nodes) {
                        let btn = this.button_nodes[key];
                        if (this.selected.includes(key)) {
                            btn.classList.add('selected');
                            btn.style.color = ''; // Remove custom color so accent stands out
                        } else {
                            btn.classList.remove('selected');
                            if (this.options[key].color) {
                                btn.style.color = this.options[key].color; // Restore custom color
                            }
                        }
                    }
                }

                /**
                 * Set the selected options programmatically
                 * @param {string|Array<string>} value - Key or array of keys to select
                 */
                set(value) {
                    if (!value && this.allow_empty) {
                        this.selected = [];
                    } else {
                        this.selected = Array.isArray(value) ? [...value] : [value];
                        // Filter out non-existent keys
                        this.selected = this.selected.filter(k => this.options[k]);
                    }
                    this.updateSelectionVisuals();
                    return this;
                }

                /**
                 * Returns the selected key(s). 
                 * Returns a string if only one item is selected, or an Array if multiple are selected.
                 */
                get() {
                    if (this.selected.length === 0) return null;
                    if (this.selected.length === 1) return this.selected[0];
                    return [...this.selected];
                }

                /**
                 * Enable or disable a specific option
                 * @param {string} key - Option key
                 * @param {boolean} disabled - True to disable, false to enable
                 */
                setDisabled(key, disabled = true) {
                    if (this.options[key]) {
                        this.options[key].disabled = disabled;
                        if (this.button_nodes[key]) {
                            if (disabled) {
                                this.button_nodes[key].classList.add('disabled');
                                // Remove from selection if disabled
                                if (this.selected.includes(key)) {
                                    this.selected = this.selected.filter(k => k !== key);
                                    this.updateSelectionVisuals();
                                }
                            } else {
                                this.button_nodes[key].classList.remove('disabled');
                            }
                        }
                    }
                    return this;
                }

                /**
                 * Replaces all options and rebuilds the widget
                 */
                setOptions(newOptions) {
                    this.options = newOptions || {};
                    this.selected = this.selected.filter(k => this.options[k]);
                    this.buildDOM();
                    this.updateSelectionVisuals();
                    return this;
                }

                update() {
                    let condition_met = Condition(this.condition);
                    this.node.style.display = condition_met ? (this.expand ? 'flex' : 'inline-flex') : 'none';
                    this.dispatchEvent('update', {});
                    return this;
                }
            }

            window.HorizontalSelectWidget = HorizontalSelectWidget;

            // 1. Estilos CSS ultra-optimizados para encajar en el ancho fijo del Spectrum
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


            // 2. MARK: Widget AdvancedColorPicker
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

                    this.onChange = data.onChange;
                    this.onMove = data.onMove;

                    this.node = Interface.createElement('div', { class: 'tool widget', toolbar_item: this.id }, [
                        Interface.createElement('input', { class: 'f_left', type: 'text' })
                    ]);

                    this.addLabel();
                    this.jq = $(this.node).find('input');

                    this.jq.spectrum({
                        preferredFormat: "hex",
                        color: this.value.toHex8String(),
                        showAlpha: true,
                        showInput: true,
                        maxSelectionSize: 128,
                        // Match the native picker: hidden by default.
                        showPalette: data.palette === true,
                        palette: data.palette ? [] : undefined,
                        resetText: tl('generic.reset'),
                        cancelText: tl('dialog.cancel'),
                        chooseText: tl('dialog.confirm'),

                        show: function () {
                            open_interface = scope;
                            scope.injectAdvancedUI();
                        },
                        hide: function () {
                            open_interface = false;
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


            // 3. MARK: FormElement AdvancedColor
            FormElement.types.advanced_color = class FormElementAdvancedColor extends FormElement {

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
                    bar.style.background = 'transparent';
                    bar.style.display = 'flex';
                    bar.style.alignItems = 'center';
                    bar.style.gap = '8px';

                    let data = this.options;

                    if (data.label) {
                        let labelWrapper = document.createElement('div');
                        labelWrapper.style = 'display: flex; align-items: center; gap: 4px; flex-shrink: 0; min-width: 80px;';

                        let labelElement = document.createElement('span');
                        labelElement.style = 'font-size: 13px; color: var(--color-subtle_text); white-space: nowrap;';
                        labelElement.innerText = tl(data.label);
                        labelWrapper.append(labelElement);

                        if (data.description) {
                            let infoIcon = document.createElement('i');
                            infoIcon.className = 'fa fa-question dialog_form_description';
                            infoIcon.style = 'font-size: 14px; cursor: help; margin: 0; color: var(--color-subtle_text);';
                            infoIcon.title = tl(data.description);
                            labelWrapper.append(infoIcon);
                        }
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
                            }
                        });
                    }

                    this.colorpicker.node.style.flex = '1 1 auto';
                    this.colorpicker.node.style.width = '100%';
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

            // MARK: Combo Slider
            FormElement.types.combo_slider = class FormElementComboSlider extends FormElement {
                // Al devolver 'true', evitamos que Blockbench divida la fila en "Label Izquierda | Input Derecha"
                get uses_wide_inputs() { return true; }

                setup() {
                    let tempDesc = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = tempDesc;
                }

                build(bar) {
                    this.bar = bar;
                    // Make it fill the toolbar width without native margins.
                    bar.classList.add('full_width_dialog_bar');
                    bar.style.padding = '0';
                    bar.style.background = 'transparent';

                    let data = this.options;
                    this.value = data.value !== undefined ? data.value : (data.default !== undefined ? data.default : 0);
                    this.isDragging = false;

                    this.settings = {
                        min: data.min !== undefined ? data.min : 0,
                        max: data.max !== undefined ? data.max : 10,
                        step: data.step !== undefined ? data.step : 1,
                        circular: data.circular,
                        allow_lower: !!data.allow_lower,
                        allow_higher: !!data.allow_higher,
                        resettable: !!data.resettable || data.reset_value !== undefined,
                        reset_value: data.reset_value !== undefined ? data.reset_value : this.value
                    };

                    // Inputs.
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

                    let numberContainer = Interface.createElement('div', {
                        class: 'numeric_input tool disp_text',
                        style: `display: flex;align-items: center;margin: 0;flex: 0 0 auto;`
                    }, [numberInput]);

                    let comboWrapper = Interface.createElement('div', {
                        class: 'bar slider_input_combo',
                        title: data.description ? tl(data.description) : '',
                        style: `display: flex;align-items: center;height: 100%;margin: 0 5px;flex: 1 1 auto;min-width: 0;width: auto;`
                    }, [rangeInput, numberContainer]);

                    // Final widget layout.
                    let containerChildren = [];

                    // Optional left-aligned icon.
                    if (data.icon) {
                        let isFa = data.icon.startsWith('fa-') || data.icon.startsWith('fas ') || data.icon.startsWith('fab ');
                        let iconElement = Interface.createElement('i', {
                            class: isFa ? `fa ${data.icon}` : 'material-icons',
                            style: 'margin-right: 4px; font-size: 18px; color: var(--color-text); display: flex; align-items: center;'
                        }, isFa ? '' : data.icon);
                        containerChildren.push(iconElement);
                    }

                    // Inline label.
                    if (data.label) {
                        let labelElement = Interface.createElement('span', {
                            style: 'margin-right: 5px; font-size: 13px; color: var(--color-subtle_text); white-space: nowrap; display: flex; align-items: center;'
                        }, tl(data.label));
                        containerChildren.push(labelElement);
                    }

                    containerChildren.push(comboWrapper);

                    // Reset button.
                    if (this.settings.resettable) {
                        this.resetBtn = Interface.createElement('i', {
                            class: 'material-icons icon',
                            title: translateLightManager('light_manager.generic.reset'),
                            style: `font-size: 18px;cursor: pointer;display: none;margin-left: 2px;color: var(--color-subtle_text);display: flex;align-items: center;`
                        }, 'replay');

                        this.resetBtn.onclick = (e) => {
                            this.setValue(this.settings.reset_value);
                            this.change();
                        };

                        containerChildren.push(this.resetBtn);
                    }

                    // Root container.
                    this.node = Interface.createElement('div', {
                        class: 'tool widget',
                        style: `display: flex;flex-direction: row;align-items: center;height: 30px;padding: 0 4px;min-width: 0; width: 100%; box-sizing: border-box;`
                    }, containerChildren);

                    bar.append(this.node);

                    // Match native event behavior.
                    let scope = this;
                    let $inputs = $(this.node).find('input');
                    let $range = $(this.node).find('input[type="range"]');
                    let $number = $(this.node).find('input[type="number"]');

                    $inputs.on('input', function (event) {
                        let val = parseFloat($(event.target).val());
                        if (isNaN(val)) return;
                        let is_number_input = event.target === $number[0];
                        scope.setValue(val, false, is_number_input);
                        scope.change();
                    });

                    $number.on('blur', function (event) {
                        let val = parseFloat($(this).val());
                        if (isNaN(val)) {
                            val = scope.settings.reset_value;
                        }
                        scope.setValue(val, true, false);
                    });

                    $number.on('keydown', function (event) {
                        if (event.key === 'Enter' || event.key === 'Escape') {
                            this.blur();
                        }
                    });

                    $range.on('mousedown touchstart', function () { scope.isDragging = true; });
                    $range.on('mouseup touchend', function () { scope.isDragging = false; scope.updateResetButton(); });
                    $inputs.on('change', function () { scope.isDragging = false; scope.updateResetButton(); });

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

                getValue() {
                    return this.value;
                }

                setValue(value, dispatch = true, skip_number_input_update = false) {
                    if (!this.settings.allow_lower && value < this.settings.min) {
                        value = this.settings.min;
                    }
                    if (!this.settings.allow_higher && value > this.settings.max) {
                        value = this.settings.max;
                    }
                    this.value = value;
                    let $range = $(this.node).find('input[type="range"]');
                    let $number = $(this.node).find('input[type="number"]');

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
                    if (dispatch) this.change();
                }

                getDefault() {
                    return this.settings.reset_value !== undefined ? this.settings.reset_value : 0;
                }
            };

            // MARK: Compact Dropdown Select
            FormElement.types.compact_select = class FormElementCompactDropdown extends FormElement {
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
                    bar.style.background = 'transparent';

                    let data = this.options;
                    this.options_dict = data.options || {};
                    this.values = Object.keys(this.options_dict);
                    this.value = data.value !== undefined ? data.value : (data.default !== undefined ? data.default : this.values[0]);

                    // Button DOM mirrors the original widget.
                    this.node = document.createElement('div');
                    this.node.className = 'tool widget compact_dropdown_select';
                    this.node.style = 'display: flex; align-items: center; cursor: pointer; padding: 2px 6px; background: var(--color-button); border-radius: 2px; height: 30px; box-sizing: border-box; flex-shrink: 0;';

                    this.icon_wrapper = document.createElement('div');
                    this.icon_wrapper.className = 'main_icon_wrapper';
                    this.icon_wrapper.style = 'display: flex; align-items: center; margin-right: 4px;';

                    this.arrow_node = document.createElement('i');
                    this.arrow_node.className = 'fas fa-caret-down dropdown_arrow';
                    this.arrow_node.style = 'font-size: 12px; color: var(--color-text); display: flex; align-items: center;';

                    this.node.append(this.icon_wrapper, this.arrow_node);

                    // Group with the label when present without splitting the row in half.
                    let outerContainer = document.createElement('div');
                    outerContainer.style = 'display: flex; align-items: center; gap: 8px; width: 100%; height: 30px; padding: 0 4px; box-sizing: border-box;';

                    if (data.label) {
                        let labelElement = document.createElement('span');
                        labelElement.style = 'font-size: 13px; color: var(--color-text); white-space: nowrap;';
                        labelElement.innerText = tl(data.label);
                        outerContainer.append(labelElement);
                    }

                    outerContainer.append(this.node);
                    bar.append(outerContainer);

                    // Events.
                    this.node.addEventListener('click', (event) => {
                        this.open(event);
                    });

                    $(this.node).on('wheel', event => {
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
                    if (Menu.closed_in_this_click == this.id) return;
                    let scope = this;
                    let items = [];

                    for (let key in this.options_dict) {
                        let opt = this.options_dict[key];
                        if (opt) {
                            items.push({
                                name: opt.name || key,
                                icon: opt.icon,
                                color: opt.color,
                                condition: opt.condition,
                                click: (e) => {
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
                }

                updateVisuals() {
                    let opt = this.options_dict[this.value];
                    if (!opt) return;

                    let baseName = this.options.label ? tl(this.options.label) + ': ' : '';
                    this.node.title = `${baseName}${opt.name || this.value}`;

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
                    bar.style.padding = '0';
                    bar.style.background = 'transparent';

                    let data = this.options;
                    this.text = data.text !== undefined ? data.text : (data.value || '');
                    this.inline_label = data.label || '';
                    this.color = data.color || '';
                    this.icon_name = data.icon || '';
                    this.is_paragraph = !!data.paragraph;
                    this.expand = !!data.expand;
                    this.text_alignment = data.text_alignment || 'left';

                    this.node = document.createElement('div');
                    this.node.className = `tool widget bar_display ${this.is_paragraph ? 'bar_display_paragraph' : ''}`;
                    this.node.style = 'display: flex; gap: 6px; padding: 0 4px; cursor: default; width: 100%; box-sizing: border-box; align-items: ' + (this.is_paragraph ? 'flex-start' : 'center') + ';';

                    if (this.color) this.node.style.color = this.color;

                    bar.append(this.node);
                    this.buildDOM();
                }

                buildDOM() {
                    this.node.innerHTML = '';

                    if (this.icon_name) {
                        let icon_node = Blockbench.getIconNode(this.icon_name);
                        icon_node.style.fontSize = '1.1em';
                        icon_node.style.display = 'flex';
                        icon_node.style.alignItems = 'center';
                        this.node.append(icon_node);
                    }

                    if (this.inline_label) {
                        let label_node = document.createElement('span');
                        label_node.className = 'bar_display_label';
                        label_node.style.fontWeight = 'bold';
                        label_node.style.opacity = '0.85';
                        label_node.style.display = 'flex';
                        label_node.style.alignItems = 'center';
                        label_node.innerText = tl(this.inline_label);
                        this.node.append(label_node);
                    }

                    this.content_node = document.createElement('span');
                    this.content_node.className = 'bar_display_content';
                    if (this.expand) {
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
                    }

                    this.content_node.textContent = String(this.text ?? '');
                    this.node.append(this.content_node);
                }

                getValue() {
                    return this.text;
                }

                setValue(value) {
                    this.text = value;
                    if (this.content_node) {
                        this.content_node.textContent = String(value ?? '');
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
                    this.value = data.value !== undefined ? !!data.value : (data.default !== undefined ? !!data.default : false);

                    // --- Customization Settings ---
                    this.icon_on = data.icon_on || 'check_box';
                    this.icon_off = data.icon_off || 'check_box_outline_blank';
                    this.icon_color_on = data.icon_color_on || 'var(--color-text)';
                    this.icon_color_off = data.icon_color_off || 'var(--color-subtle_text)';
                    this.label_color = data.label_color || 'var(--color-subtle_text)';
                    this.layout = data.layout || 'icon_left'; // Options: 'icon_left', 'icon_right', 'space_between'
                    this.icon_size = data.icon_size || '18px';

                    // Dynamic Padding Compilation
                    let padding_value = data.padding !== undefined ? data.padding : '0 4px';
                    if (data.padding_left !== undefined || data.padding_right !== undefined || data.padding_top !== undefined || data.padding_bottom !== undefined) {
                        let top = data.padding_top || '0';
                        let right = data.padding_right || '0';
                        let bottom = data.padding_bottom || '0';
                        let left = data.padding_left || '0';
                        padding_value = `${top} ${right} ${bottom} ${left}`;
                    }

                    // Main Interactive Container
                    this.node = document.createElement('div');
                    this.node.className = 'tool widget custom_checkbox';
                    Object.assign(this.node.style, {
                        display: 'flex',
                        alignItems: 'center',
                        height: '30px',
                        padding: padding_value,
                        boxSizing: 'border-box',
                        width: '100%',
                        cursor: 'pointer',
                        userSelect: 'none'
                    });

                    // Native Tooltip (Description)
                    if (data.description) {
                        this.node.title = tl(data.description);
                    }

                    // --- Create Icon Wrapper & Node ---
                    this.icon_wrapper = document.createElement('div');
                    Object.assign(this.icon_wrapper.style, {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: '0',
                        // Slightly larger than the icon to prevent cropping during bounce animation
                        width: `calc(${this.icon_size} + 4px)`,
                        height: `calc(${this.icon_size} + 4px)`
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

                    // Create Label Node
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
                        this.label_node.innerText = tl(data.label);
                    }

                    // --- Layout Configuration ---
                    if (this.layout === 'icon_left') {
                        this.node.style.justifyContent = 'flex-start';
                        this.node.style.gap = '8px';
                        this.node.append(this.icon_wrapper, this.label_node);

                    } else if (this.layout === 'icon_right') {
                        this.node.style.justifyContent = 'flex-start';
                        this.node.style.gap = '8px';
                        this.node.append(this.label_node, this.icon_wrapper);

                    } else if (this.layout === 'space_between') {
                        this.node.style.justifyContent = 'space-between';
                        this.node.append(this.label_node, this.icon_wrapper);
                    }

                    bar.append(this.node);

                    // Click Event Listener
                    this.node.addEventListener('click', () => {
                        this.setValue(!this.value);
                    });

                    // Apply initial visual state
                    this.updateVisuals(false);
                }

                updateVisuals(animate = true) {
                    let current_icon = this.value ? this.icon_on : this.icon_off;
                    let current_color = this.value ? this.icon_color_on : this.icon_color_off;

                    // Reset classes
                    this.icon_node.className = '';
                    this.icon_node.innerText = '';

                    // Detect FontAwesome vs Material Icons
                    let isFa = /^(fa-|fas |fab |far )/.test(current_icon);

                    if (isFa) {
                        this.icon_node.className = `fa ${current_icon}`;
                    } else {
                        this.icon_node.className = 'material-icons';
                        this.icon_node.innerText = current_icon;
                    }

                    // Apply dynamic color
                    this.icon_node.style.color = current_color;

                    // Trigger scale "pop" animation
                    if (animate) {
                        this.icon_node.style.transform = 'scale(0.7)';
                        setTimeout(() => {
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
                    this.updateVisuals(true);
                    if (dispatch) this.change(); // Notify form of the change
                }

                getDefault() {
                    return false;
                }
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
                    this.dimensions = data.dimensions || 3;

                    // Initialize values and parse them safely as floats.
                    this.value = Array.isArray(data.value) ? data.value.slice() : new Array(this.dimensions).fill(0);
                    if (!data.value && Array.isArray(data.default)) {
                        this.value = data.default.slice();
                    }

                    for (let i = 0; i < this.dimensions; i++) {
                        this.value[i] = parseFloat(this.value[i]) || 0;
                    }

                    const axes = [
                        { name: 'X', key: 'x', color: 'x', css: 'var(--color-axis-x)' },
                        { name: 'Y', key: 'y', color: 'y', css: 'var(--color-axis-y)' },
                        { name: 'Z', key: 'z', color: 'z', css: 'var(--color-axis-z)' },
                        { name: 'W', key: 'w', color: 'w', css: 'var(--color-axis-w, var(--color-text))' }
                    ];

                    let has_any_range = false;
                    for (let i = 0; i < this.dimensions; i++) {
                        let axis = axes[i] || { key: String(i) };
                        let cConfig = (data.ranges && data.ranges[axis.key]) ? data.ranges[axis.key] : {};

                        let minCheck = cConfig.min !== undefined ? cConfig.min : (Array.isArray(data.min) ? data.min[i] : data.min);
                        let maxCheck = cConfig.max !== undefined ? cConfig.max : (Array.isArray(data.max) ? data.max[i] : data.max);

                        if (minCheck !== undefined && maxCheck !== undefined) {
                            has_any_range = true;
                            break;
                        }
                    }

                    // Title and reset button.
                    let labelWrapper = document.createElement('div');
                    labelWrapper.style = 'margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; width: 100%;';

                    let titleGroup = document.createElement('div');
                    titleGroup.style = 'display: flex; align-items: center; gap: 4px;  height: 22px;';

                    if (data.label) {
                        let labelElement = document.createElement('span');
                        // Match combo_slider label color.
                        labelElement.style = 'font-size: 13px; color: var(--color-subtle_text); display: flex; align-items: center; white-space: nowrap;';
                        labelElement.innerText = (typeof tl !== 'undefined' ? tl(data.label) : data.label);
                        titleGroup.append(labelElement);
                    }

                    if (data.description) {
                        let infoIcon = document.createElement('i');
                        infoIcon.className = 'fa fa-question dialog_form_description';
                        infoIcon.style = 'font-size: 14px; cursor: help; margin: 0; color: var(--color-subtle_text);';
                        infoIcon.title = typeof tl !== 'undefined' ? tl(data.description) : data.description;
                        titleGroup.append(infoIcon);
                    }

                    labelWrapper.append(titleGroup);

                    let resetBtn = null;
                    let updateResetButtonVisibility = () => {
                        let defaultArr = Array.isArray(data.default) ? data.default : new Array(this.dimensions).fill(0);
                        let isChanged = this.value.some((val, idx) => parseFloat(val) !== parseFloat(defaultArr[idx]));

                        if (resetBtn) {
                            resetBtn.style.display = (data.resettable !== false && isChanged) ? 'flex' : 'none';
                        }
                    };

                    if (data.resettable !== false) {
                        resetBtn = document.createElement('i');
                        resetBtn.className = 'material-icons icon';
                        resetBtn.innerText = 'replay';
                        resetBtn.title = 'Reset Vector';
                        // Match the icon size and spacing used by the other controls.
                        resetBtn.style = 'font-size: 18px; padding: 2px; color: var(--color-subtle_text); cursor: pointer; display: flex; align-items: center;';
                        resetBtn.onclick = () => {
                            let defaultArr = Array.isArray(data.default) ? data.default : new Array(this.dimensions).fill(0);
                            this.setValue(defaultArr);
                            updateResetButtonVisibility();
                        };
                        labelWrapper.append(resetBtn);
                    }

                    this.updateResetButtonVisibility = updateResetButtonVisibility;

                    bar.append(labelWrapper);

                    // Input container.
                    this.inputs_container = document.createElement('div');
                    this.inputs_container.style = has_any_range
                        ? 'display: flex; flex-direction: column; gap: 4px; width: 100%;'
                        : 'display: flex; flex-direction: row; gap: 4px; width: 100%;';

                    bar.append(this.inputs_container);
                    this.inputs = [];

                    for (let i = 0; i < this.dimensions; i++) {
                        let axis = axes[i] || { name: String(i), key: String(i), color: '', css: 'var(--color-text)' };
                        let val = parseFloat(this.value[i]) || 0;

                        let cConfig = (data.ranges && data.ranges[axis.key]) ? data.ranges[axis.key] : {};

                        let minVal = cConfig.min !== undefined ? cConfig.min : (Array.isArray(data.min) ? data.min[i] : data.min);
                        let maxVal = cConfig.max !== undefined ? cConfig.max : (Array.isArray(data.max) ? data.max[i] : data.max);
                        let stepVal = cConfig.step !== undefined ? cConfig.step : (data.step !== undefined ? data.step : (data.integer ? 1 : 0.1));

                        let allowLower = cConfig.allow_lower !== undefined ? cConfig.allow_lower : (Array.isArray(data.allow_lower) ? data.allow_lower[i] : !!data.allow_lower);
                        let allowHigher = cConfig.allow_higher !== undefined ? cConfig.allow_higher : (cConfig.allow_greater !== undefined ? cConfig.allow_greater : (Array.isArray(data.allow_higher) ? data.allow_higher[i] : !!data.allow_higher));

                        let is_range = minVal !== undefined && maxVal !== undefined;

                        // Row wrapper, used only when the vector has at least one slider.
                        let rowContainer = null;
                        if (has_any_range) {
                            rowContainer = document.createElement('div');
                            rowContainer.style = 'display: flex; flex-direction: row; align-items: center; height: 30px; width: 100%; box-sizing: border-box;';

                            let axisLabel = document.createElement('span');
                            axisLabel.style = `margin-right: 5px; font-size: 13px; color: ${axis.css}; font-weight: bold; white-space: nowrap; display: flex; align-items: center; width: 14px; justify-content: center; font-family: monospace;`;
                            axisLabel.innerText = axis.name;
                            rowContainer.append(axisLabel);
                        }

                        if (is_range) {
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

                            $(rangeInput).on('input', sync);
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
                                                    this.setValue(vec);
                                                } else {
                                                    let num = parseFloat(text);
                                                    if (isNaN(num)) {
                                                        try {
                                                            if (typeof NumSlider !== 'undefined' && NumSlider.MolangParser) {
                                                                num = NumSlider.MolangParser.parse(text, { val: parseFloat(this.value[i]) || 0, n: 0 });
                                                            } else { num = 0; }
                                                        } catch (err) { num = 0; }
                                                    }
                                                    let newValue = this.value.slice();
                                                    newValue[i] = num;
                                                    this.setValue(newValue);
                                                }
                                            }
                                        },
                                        '_',
                                        {
                                            id: 'round',
                                            name: 'menu.slider.round_value',
                                            icon: 'percent',
                                            click: () => {
                                                let old_val = parseFloat(this.value[i]) || 0;
                                                let rounded = Math.round(old_val);
                                                let newValue = this.value.slice();
                                                newValue[i] = rounded;
                                                this.setValue(newValue);
                                            }
                                        },
                                        {
                                            id: 'reset_vector',
                                            name: 'menu.slider.reset_vector',
                                            icon: 'replay',
                                            condition: () => this.dimensions > 1,
                                            click: () => {
                                                let defaultArr = Array.isArray(data.default) ? data.default : new Array(this.dimensions).fill(0);
                                                this.setValue(defaultArr);
                                            }
                                        }
                                    ]).open(event);
                                }
                            };

                            rangeInput.addEventListener('contextmenu', showContextMenu);
                            numberInput.addEventListener('contextmenu', showContextMenu);

                        } else {
                            // Manual safe NumSlider mode.
                            let numSliderNode = document.createElement('div');
                            numSliderNode.className = 'tool wide widget nslide_tool';

                            if (axis.color) {
                                let css_color = 'uvwxyz'.includes(axis.color.toString()) ? `var(--color-axis-${axis.color})` : axis.color;
                                numSliderNode.style.setProperty('--corner-color', css_color);
                                numSliderNode.classList.add('is_colored');
                            }

                            let nslideInner = document.createElement('div');
                            nslideInner.className = 'nslide tab_target';
                            nslideInner.setAttribute('inputmode', 'decimal');
                            nslideInner.innerText = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(parseFloat(val) || 0) : val;
                            numSliderNode.append(nslideInner);

                            let jq_outer = $(numSliderNode);
                            let jq_inner = $(nslideInner);

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
                                if (dispatch) this.change();
                                if (this.updateResetButtonVisibility) this.updateResetButtonVisibility();
                            };

                            let last_value = val;

                            jq_inner.on('mousedown touchstart', async (event) => {
                                if (jq_inner.hasClass('editing')) return;
                                last_value = parseFloat(this.value[i]) || 0;

                                let drag_event = await new Promise((resolve) => {
                                    function move(e2) {
                                        if (!e2.clientX || Math.abs(e2.clientX - event.clientX) > 2) {
                                            document.removeEventListener('mousemove', move);
                                            document.removeEventListener('touchmove', move);
                                            document.removeEventListener('mouseup', stop);
                                            document.removeEventListener('touchend', stop);
                                            resolve(e2);
                                        }
                                    }
                                    function stop(e2) {
                                        document.removeEventListener('mousemove', move);
                                        document.removeEventListener('touchmove', move);
                                        document.removeEventListener('mouseup', stop);
                                        document.removeEventListener('touchend', stop);
                                        if (event.target == e2.target) startInput();
                                        resolve(false);
                                    }
                                    document.addEventListener('mousemove', move);
                                    document.addEventListener('touchmove', move);
                                    document.addEventListener('mouseup', stop);
                                    document.addEventListener('touchend', stop);
                                });

                                if (!drag_event) return;

                                if (typeof convertTouchEvent !== 'undefined') convertTouchEvent(drag_event);
                                let clientX = drag_event.clientX;
                                let pre = 0;
                                let sliding_start_pos = clientX;
                                let move_calls = 0;

                                if (!('touches' in drag_event)) jq_inner.get(0).requestPointerLock();

                                let move = (e) => {
                                    if (typeof convertTouchEvent !== 'undefined') convertTouchEvent(e);
                                    if (drag_event && 'touches' in drag_event) {
                                        clientX = e.clientX;
                                    } else {
                                        let limit = move_calls <= 2 ? 1 : 160;
                                        clientX += Math.clamp(e.movementX, -limit, limit);
                                    }

                                    let offset = Math.round((clientX - sliding_start_pos) / sensitivity);
                                    let difference = (offset - pre) * getInterval(e);
                                    pre = offset;

                                    if (difference) {
                                        let old_val = parseFloat(this.value[i]) || 0;
                                        updateCustomSliderValue(old_val + difference);

                                        let new_val = parseFloat(this.value[i]) || 0;
                                        let display_offset = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(new_val - last_value) : (new_val - last_value);
                                        if (typeof Blockbench !== 'undefined' && !Blockbench.isMobile) {
                                            Blockbench.setStatusBarText(display_offset);
                                        }
                                    }
                                    move_calls++;
                                };

                                let stop = (e) => {
                                    document.removeEventListener('mousemove', move);
                                    document.removeEventListener('touchmove', move);
                                    document.removeEventListener('mouseup', stop);
                                    document.removeEventListener('touchend', stop);
                                    document.exitPointerLock();
                                    if (typeof Blockbench !== 'undefined') Blockbench.setStatusBarText();
                                };

                                document.addEventListener('mousemove', move);
                                document.addEventListener('touchmove', move);
                                document.addEventListener('mouseup', stop);
                                document.addEventListener('touchend', stop);
                            });

                            let startInput = () => {
                                jq_inner.find('.nslide_arrow').remove();
                                jq_inner.attr('contenteditable', 'true');
                                jq_inner.addClass('editing');
                                jq_inner.focus();
                                document.execCommand('selectAll');
                            };

                            let stopInput = () => {
                                if (!jq_inner.hasClass('editing')) return;
                                let text = jq_inner.text();

                                if (last_value.toString() !== text) {
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
                                        let num = parseFloat(text);
                                        if (isNaN(num)) {
                                            try {
                                                if (typeof NumSlider !== 'undefined' && NumSlider.MolangParser) {
                                                    num = NumSlider.MolangParser.parse(text, { val: parseFloat(this.value[i]) || 0, n: 0 });
                                                } else { num = 0; }
                                            } catch (err) { num = 0; }
                                        }
                                        updateCustomSliderValue(num);
                                    }
                                }
                                jq_inner.removeClass('editing');
                                jq_inner.attr('contenteditable', 'false');
                                nslideInner.innerText = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(parseFloat(this.value[i]) || 0) : this.value[i];
                            };

                            jq_inner
                                .on('keypress', function (e) {
                                    if (e.keyCode === 10 || e.keyCode === 13) {
                                        e.preventDefault();
                                        stopInput();
                                    }
                                })
                                .on('keyup', (e) => {
                                    if (e.keyCode !== 10 && e.keyCode !== 13) { last_value = parseFloat(this.value[i]) || 0; }
                                    if (e.keyCode === 27) {
                                        if (!jq_inner.hasClass('editing')) return;
                                        e.preventDefault();
                                        jq_inner.removeClass('editing');
                                        jq_inner.attr('contenteditable', 'false');
                                        nslideInner.innerText = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(parseFloat(this.value[i]) || 0) : this.value[i];
                                    }
                                })
                                .on('focusout', function () { stopInput(); })
                                .on('dblclick', function (event) {
                                    if (event.target != this) return;
                                    jq_inner.text(defaultVal.toString());
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
                                                        this.setValue(vec);
                                                    } else {
                                                        let num = parseFloat(text);
                                                        if (isNaN(num)) {
                                                            try {
                                                                if (typeof NumSlider !== 'undefined' && NumSlider.MolangParser) {
                                                                    num = NumSlider.MolangParser.parse(text, { val: parseFloat(this.value[i]) || 0, n: 0 });
                                                                } else { num = 0; }
                                                            } catch (err) { num = 0; }
                                                        }
                                                        updateCustomSliderValue(num);
                                                    }
                                                }
                                            },
                                            '_',
                                            {
                                                id: 'round',
                                                name: 'menu.slider.round_value',
                                                icon: 'percent',
                                                click: () => {
                                                    let old_val = parseFloat(this.value[i]) || 0;
                                                    updateCustomSliderValue(Math.round(old_val));
                                                }
                                            },
                                            {
                                                id: 'reset_vector',
                                                name: 'menu.slider.reset_vector',
                                                icon: 'replay',
                                                condition: () => this.dimensions > 1,
                                                click: () => {
                                                    let defaultArr = Array.isArray(data.default) ? data.default : new Array(this.dimensions).fill(0);
                                                    this.setValue(defaultArr);
                                                }
                                            }
                                        ]).open(event);
                                    }
                                });

                            jq_outer
                                .on('mouseenter', () => {
                                    jq_outer.append(
                                        '<div class="nslide_arrow na_left" ><i class="material-icons">navigate_before</i></div>' +
                                        '<div class="nslide_arrow na_right"><i class="material-icons">navigate_next</i></div>'
                                    );
                                    let n = Math.clamp(numSliderNode.clientWidth / 2 - 22, 6, 1000);
                                    jq_outer.find('.nslide_arrow.na_left').click((e) => {
                                        let old_val = parseFloat(this.value[i]) || 0;
                                        updateCustomSliderValue(old_val - getInterval(e));
                                    }).css('margin-left', (-n - 22) + 'px');

                                    jq_outer.find('.nslide_arrow.na_right').click((e) => {
                                        let old_val = parseFloat(this.value[i]) || 0;
                                        updateCustomSliderValue(old_val + getInterval(e));
                                    }).css('margin-left', (n) + 'px');
                                })
                                .on('mouseleave', () => {
                                    jq_outer.find('.nslide_arrow').remove();
                                });

                            if (rowContainer) {
                                numSliderNode.style.height = '24px'; // Emparejarlo visualmente con el numero input en la fila
                                numSliderNode.style.flex = '1 1 auto';
                                rowContainer.append(numSliderNode);
                                this.inputs_container.append(rowContainer);
                            } else {
                                numSliderNode.style.flex = '1 1 0';
                                numSliderNode.style.minWidth = '0';
                                numSliderNode.style.width = 'auto';
                                this.inputs_container.append(numSliderNode);
                            }

                            this.inputs.push({ is_custom: false, updateCustomSliderValue });
                        }
                    }
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
                    return new Array(this.dimensions).fill(0);
                }
            };




            window.HorizontalSelectWidget = HorizontalSelectWidget;

            const compactWidgetStyles = Blockbench.addCSS(
                `.compact_dropdown_select {
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


            // Configure three-dimensional textures based on the base64 dictionary
            for (let key in light_icons_b64) {
                let tex = new THREE.TextureLoader().load(light_icons_b64[key]);
                tex.magFilter = tex.minFilter = THREE.NearestFilter;
                lightTextures[key] = tex;
            }

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
                    if (Animator.open && Animation.selected) {
                        let animator = Animation.selected.getBoneAnimator(this);
                        if (animator) animator.select(true);
                    }
                    return this;
                }

                unselect(...args) {
                    super.unselect(...args);
                    window.LightManagerViewportControls?.updateAll();
                    if (Animator.open && Timeline.selected_animator && Timeline.selected_animator.element === this) {
                        Timeline.selected_animator.selected = false;
                    }
                }

                static behavior = {
                    unique_name: true,
                    movable: true,
                    rotatable: true, // Allowing rotation is now necessary to orient Directional and Spot lights
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

            // Base properties
            new Property(LightElement, 'string', 'name', { default: 'light' });
            new Property(LightElement, 'string', 'light_type', { default: 'point' }); // New
            new Property(LightElement, 'vector', 'position');
            new Property(LightElement, 'vector', 'rotation'); // New
            new Property(LightElement, 'vector', 'render_rotation', { default: [0, 0, 0] });
            new Property(LightElement, 'vector', 'color', { default: [255, 255, 255] });
            new Property(LightElement, 'vector', 'render_color', { default: [255, 255, 255] });
            new Property(LightElement, 'number', 'intensity', { default: 1, min: 0 });
            new Property(LightElement, 'number', 'render_intensity', { default: 1, min: 0 });
            new Property(LightElement, 'number', 'temperature', { default: 6500, min: 2700, max: 6500 });

            // New unique configuration options
            new Property(LightElement, 'number', 'distance', { default: 0, min: 0 });
            new Property(LightElement, 'number', 'angle', { default: 45, min: 0, max: 90 });
            new Property(LightElement, 'number', 'penumbra', { default: 0, min: 0, max: 1 });

            new Property(LightElement, 'boolean', 'visibility', { default: true });
            new Property(LightElement, 'boolean', 'has_shadow', { default: true });
            new Property(LightElement, 'number', 'shadow_resolution', { default: 1024 });
            new Property(LightElement, 'number', 'studio_shadow_resolution', { default: 0 });
            new Property(LightElement, 'number', 'shadow_bias', { default: DEFAULT_SHADOW_BIAS });
            new Property(LightElement, 'number', 'shadow_normal_bias', { default: DEFAULT_SHADOW_NORMAL_BIAS, description: 'property.shadow_normal_bias.desc' });
            new Property(LightElement, 'number', 'shadow_softness', { default: DEFAULT_SHADOW_SOFTNESS, min: 0, description: 'property.shadow_softness.desc' });
            new Property(LightElement, 'number', 'shadow_near', { default: 0.1, min: 0 });
            new Property(LightElement, 'number', 'shadow_far', { default: 200, min: 0 });
            new Property(LightElement, 'number', 'shadow_bounds', { default: 35, min: 0 });

            OutlinerElement.registerType(LightElement, 'light');

            new NodePreviewController(LightElement, {
                setup(element) {
                    let mesh = new THREE.Object3D();
                    Project.nodes_3d[element.uuid] = mesh;

                    mesh.name = element.uuid;
                    mesh.type = element.type;
                    mesh.isElement = true;
                    mesh.visible = element.visibility;

                    // Maintain correct rotation order
                    mesh.rotation.order = Format.euler_order || 'ZYX';

                    // Sprite visual configuration
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

                    // ==========================================
                    // DIRECTIONAL GIZMO SYSTEM
                    // ==========================================
                    let gizmo = new THREE.Object3D();
                    let gizmo_mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });

                    let arrow_geo = new THREE.BufferGeometry();
                    let arrow_verts = new Float32Array([
                        0, 0, 0, 0, 0, -8,
                        0, 0, -8, -1.5, 0, -6.5,
                        0, 0, -8, 1.5, 0, -6.5,
                        0, 0, -8, 0, -1.5, -6.5,
                        0, 0, -8, 0, 1.5, -6.5
                    ]);
                    arrow_geo.setAttribute('position', new THREE.BufferAttribute(arrow_verts, 3));
                    let arrow = new THREE.LineSegments(arrow_geo, gizmo_mat);
                    arrow.raycast = () => { };
                    gizmo.add(arrow);
                    gizmo.arrow = arrow;

                    let ring_geo = new THREE.BufferGeometry();
                    let ring_verts = [];
                    let segments = 32;
                    for (let i = 0; i <= segments; i++) {
                        let theta = (i / segments) * Math.PI * 2;
                        ring_verts.push(Math.cos(theta), Math.sin(theta), -1);
                    }
                    ring_geo.setAttribute('position', new THREE.Float32BufferAttribute(ring_verts, 3));
                    let ring = new THREE.Line(ring_geo, gizmo_mat);
                    ring.raycast = () => { };
                    gizmo.add(ring);
                    gizmo.ring = ring;

                    let spot_lines_geo = new THREE.BufferGeometry();
                    let spot_lines_verts = new Float32Array([
                        0, 0, 0, 1, 0, -1,
                        0, 0, 0, -1, 0, -1,
                        0, 0, 0, 0, 1, -1,
                        0, 0, 0, 0, -1, -1
                    ]);
                    spot_lines_geo.setAttribute('position', new THREE.BufferAttribute(spot_lines_verts, 3));
                    let spot_lines = new THREE.LineSegments(spot_lines_geo, gizmo_mat);
                    spot_lines.raycast = () => { };
                    gizmo.add(spot_lines);
                    gizmo.spot_lines = spot_lines;

                    mesh.add(gizmo);
                    mesh.gizmo = gizmo;

                    mesh.fix_position = new THREE.Vector3();
                    mesh.fix_rotation = new THREE.Euler();

                    this.updateTransform(element);
                    this.dispatchEvent('setup', { element });
                },
                updateTransform(element) {
                    NodePreviewController.prototype.updateTransform.call(this, element);
                    element.mesh.fix_position.copy(element.mesh.position);
                    element.mesh.fix_rotation.copy(element.mesh.rotation);
                    this.updateWindowSize(element);
                    window.update_light_element_callback?.();
                },
                updateSelection(element) {
                    let { mesh } = element;

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
                            let safe_angle = LightManagerUtils.num(element.angle, 45, 0.1, 89.9);
                            let angle_rad = THREE.MathUtils.degToRad(safe_angle);
                            let radius = dist * Math.tan(angle_rad);

                            mesh.gizmo.ring.scale.set(radius, radius, dist);
                            mesh.gizmo.spot_lines.scale.set(radius, radius, dist);
                        } else {
                            mesh.gizmo.arrow.visible = false;
                            mesh.gizmo.ring.visible = false;
                            mesh.gizmo.spot_lines.visible = false;
                        }
                    }

                    let base_scale = Math.max(0.1, Math.sqrt(LightManagerUtils.num(element.render_intensity ?? element.intensity, 1, 0, 100000)));
                    mesh.scale.setScalar(element.selected ? base_scale * 1.2 : base_scale);

                    mesh.sprite.material.depthTest = !element.selected;
                    mesh.renderOrder = element.selected ? 100 : 0;

                    window.LightManagerAreaGizmos?.updateAll();
                    window.LightManagerViewportControls?.updateAll();
                    this.dispatchEvent('update_selection', { element });
                },
                updateWindowSize(element) {
                    if (Preview.selected && Preview.selected.camera && Preview.selected.height > 0) {
                        let size = 0.4 * Preview.selected.camera.fov / Preview.selected.height;
                        element.mesh.sprite.scale.setScalar(size);
                    }
                }
            });

            // -------------------------------------------------------------
            // TIMELINE OVERRIDES
            // -------------------------------------------------------------
            let old_y_condition = KeyframeDataPoint.properties.y.condition;
            let old_z_condition = KeyframeDataPoint.properties.z.condition;
            let old_x_default = KeyframeDataPoint.properties.x.default;
            let old_y_default = KeyframeDataPoint.properties.y.default;
            let old_z_default = KeyframeDataPoint.properties.z.default;

            KeyframeDataPoint.properties.y.condition = (point) => {
                if (point.keyframe.channel === 'intensity') return false;
                return typeof old_y_condition === 'function' ? old_y_condition(point) : true;
            };
            KeyframeDataPoint.properties.z.condition = (point) => {
                if (point.keyframe.channel === 'intensity') return false;
                return typeof old_z_condition === 'function' ? old_z_condition(point) : true;
            };

            KeyframeDataPoint.properties.x.default = (point) => {
                let el = point.keyframe.animator.element;
                if (point.keyframe.channel === 'intensity') return el?.intensity ?? 1;
                if (point.keyframe.channel === 'color') return el?.color[0] ?? 255;
                if (point.keyframe.channel === 'rotation') return el?.rotation[0] ?? 0;
                return typeof old_x_default === 'function' ? old_x_default(point) : (old_x_default || 0);
            };
            KeyframeDataPoint.properties.y.default = (point) => {
                let el = point.keyframe.animator.element;
                if (point.keyframe.channel === 'color') return el?.color[1] ?? 255;
                if (point.keyframe.channel === 'rotation') return el?.rotation[1] ?? 0;
                return typeof old_y_default === 'function' ? old_y_default(point) : (old_y_default || 0);
            };
            KeyframeDataPoint.properties.z.default = (point) => {
                let el = point.keyframe.animator.element;
                if (point.keyframe.channel === 'color') return el?.color[2] ?? 255;
                if (point.keyframe.channel === 'rotation') return el?.rotation[2] ?? 0;
                return typeof old_z_default === 'function' ? old_z_default(point) : (old_z_default || 0);
            };

            deletables.push({
                delete: () => {
                    KeyframeDataPoint.properties.y.condition = old_y_condition;
                    KeyframeDataPoint.properties.z.condition = old_z_condition;
                    KeyframeDataPoint.properties.x.default = old_x_default;
                    KeyframeDataPoint.properties.y.default = old_y_default;
                    KeyframeDataPoint.properties.z.default = old_z_default;
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
                    window.update_light_element_callback?.();
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
            });
            deletables.push(modeObserver);

            const createLightFromProfile = (profileKey, undoLabel) => {
                const profile = LIGHT_MANAGER_PROFILES[profileKey] || LIGHT_MANAGER_PROFILES.point_fill;
                Undo.initEdit({ outliner: true, elements: [], selection: true });

                let group = getCurrentGroup();
                let light = new LightElement().addTo(group).init();

                if (Format.bone_rig && group && group !== Project) {
                    light.extend({ position: group.origin.slice() });
                }

                LightManagerUtils.applyConfig(light, profile);
                light.updateLightIcon();

                unselectAll();
                light.select();

                Undo.finishEdit(undoLabel, { outliner: true, elements: [light], selection: true });
                Blockbench.dispatchEvent('add_light', { object: light });
                window.update_light_element_callback?.();

                return light;
            };

            let addLightAction = new Action('add_light', {
                name: 'light_manager.action.add_point',
                description: 'light_manager.action.add_point.desc',
                icon: 'lightbulb',
                category: 'edit',
                condition: () => Modes.edit,
                click() {
                    return createLightFromProfile('point_fill', translateLightManager('light_manager.undo.add_point'));
                }
            });
            deletables.push(addLightAction);
            Interface.Panels.outliner.menu.addAction(addLightAction, '3');
            MenuBar.menus.edit.addAction(addLightAction, '9');

            let addSpotLightAction = new Action('add_spot_light', {
                name: 'light_manager.action.add_spot',
                description: 'light_manager.action.add_spot.desc',
                icon: 'highlight',
                category: 'edit',
                condition: () => Modes.edit,
                click() {
                    return createLightFromProfile('spot_key', translateLightManager('light_manager.undo.add_spot'));
                }
            });
            deletables.push(addSpotLightAction);
            Interface.Panels.outliner.menu.addAction(addSpotLightAction, '3');
            MenuBar.menus.edit.addAction(addSpotLightAction, '9');

            let addDirectionalLightAction = new Action('add_directional_light', {
                name: 'light_manager.action.add_directional',
                description: 'light_manager.action.add_directional.desc',
                icon: 'light_mode',
                category: 'edit',
                condition: () => Modes.edit,
                click() {
                    return createLightFromProfile('directional_sun', translateLightManager('light_manager.undo.add_directional'));
                }
            });
            deletables.push(addDirectionalLightAction);
            Interface.Panels.outliner.menu.addAction(addDirectionalLightAction, '3');
            MenuBar.menus.edit.addAction(addDirectionalLightAction, '9');

            let lightManagerEditTool = new Tool('light_manager_edit_tool', {
                name: 'light_manager.tool.edit_gizmos',
                description: 'light_manager.tool.edit_gizmos.desc',
                icon: 'control_camera',
                category: 'tools',
                modes: ['edit'],
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
                    window.LightManagerAreaGizmos.setEnabled(result.show_light_area_gizmos);
                }
                if (typeof previousViewOptionsOnFormChange === 'function') {
                    previousViewOptionsOnFormChange(result);
                }
                if (result.show_gizmos !== undefined || result.show_light_area_gizmos !== undefined) {
                    window.LightManagerAreaGizmos.updateAll();
                    window.LightManagerViewportControls?.updateAll();
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
                condition: () => Array.isArray(LightElement.selected) && LightElement.selected.length > 0,
                click() {
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

            let LIGHT_SETTINGS_GROUP = {};
            let syncingLightSettings = false;
            let activeLightUndoLabel = null;

            let light_type_select;
            let light_intensity_slider;

            let light_color_picker;
            let light_temperature_slider;
            let light_distance_slider;
            let light_cone_angle_slider;
            let light_cone_penumbra_slider;
            let cast_shadows_toggle;
            let light_shadow_resolution_select;
            let light_studio_shadow_resolution_select;
            let light_shadow_near_sliderbox;
            let light_shadow_far_sliderbox;
            let light_shadow_bounds_slider;
            let light_shadow_softness_sliderbox;
            let light_shadow_bias_sliderbox;
            let light_shadow_normal_bias_sliderbox;

            const getSelectedLight = () => LightElement.selected.length === 1 ? LightElement.selected[0] : null;
            const singleLightCondition = () => !!getSelectedLight();
            const rangeLightCondition = () => {
                const light = getSelectedLight();
                return !!light && (light.light_type === 'point' || light.light_type === 'spot');
            };
            const spotLightCondition = () => {
                const light = getSelectedLight();
                return !!light && light.light_type === 'spot';
            };
            const shadowLightCondition = () => {
                const light = getSelectedLight();
                return !!light && light.has_shadow !== false;
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
                Undo.initEdit({ elements: LightElement.selected.slice() });
                activeLightUndoLabel = label;
            };

            const finishLightEdit = (label) => {
                if (syncingLightSettings || !activeLightUndoLabel) return;
                Undo.finishEdit(label || activeLightUndoLabel);
                activeLightUndoLabel = null;
            };

            const setBarControl = (control, value) => {
                if (control && typeof control.set === 'function') control.set(value);
            };

            const setNumControl = (control, value) => {
                if (!control) return;
                if (typeof control.set === 'function') {
                    control.set(value);
                    return;
                }
                control.value = value;
                if (typeof control.update === 'function') control.update();
            };

            const updateConditionalLightToolbars = () => {
                [
                    'light_gizmo_tools_toolbar',
                    'light_settings_toolbar',
                    'light_quickbuttons_toolbar',
                    'light_shadow_quality_toolbar',
                    'light_shadow_clip_settings_toolbar',
                    'light_shadow_bounds_settings_toolbar',

                    'light_shadow_bias_settings_toolbar'
                ].forEach(key => LIGHT_SETTINGS_GROUP[key]?.update?.());
            };

            const normalizeLightPanelValue = (light, property, value) => {
                switch (property) {
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

            const getLightPanelUpdateOptions = (property) => {
                if (property === 'studio_shadow_resolution') {
                    return {
                        shadows: false,
                        scene: false,
                        gizmos: false
                    };
                }

                if (['color', 'temperature', 'intensity'].includes(property)) {
                    return {
                        shadows: false,
                        scene: false,
                        gizmos: false
                    };
                }

                if (['distance'].includes(property)) {
                    return {
                        shadows: false,
                        scene: false,
                        gizmos: true
                    };
                }

                if (['shadow_bias', 'shadow_normal_bias', 'shadow_softness'].includes(property)) {
                    return {
                        shadows: true,
                        scene: false,
                        gizmos: false
                    };
                }

                return {};
            };

            const syncLightSettingsPanel = (light) => {
                if (!light) return;
                syncingLightSettings = true;
                try {
                    setBarControl(light_type_select, light.light_type);
                    setBarControl(light_intensity_slider, light.intensity);

                    light_color_picker?.set?.(LightManagerUtils.colorHex(light.color));

                    let selectedTemp = light.temperature || 6500;
                    setBarControl(light_temperature_slider, selectedTemp);

                    setBarControl(light_distance_slider, light.distance);
                    setBarControl(light_cone_angle_slider, light.angle);
                    setBarControl(light_cone_penumbra_slider, light.penumbra);

                    cast_shadows_toggle?.set?.(light.has_shadow !== false);
                    setBarControl(light_shadow_resolution_select, String(LightManagerUtils.shadowResolution(light.shadow_resolution)));
                    setBarControl(light_studio_shadow_resolution_select, String(LightManagerUtils.studioShadowResolution(light.studio_shadow_resolution)));
                    setNumControl(light_shadow_near_sliderbox, light.shadow_near);
                    setNumControl(light_shadow_far_sliderbox, light.shadow_far);
                    setNumControl(light_shadow_bounds_slider, light.shadow_bounds);
                    setNumControl(light_shadow_softness_sliderbox, light.shadow_softness);
                    setNumControl(light_shadow_bias_sliderbox, light.shadow_bias);
                    if (light_shadow_normal_bias_sliderbox) {
                        light_shadow_normal_bias_sliderbox.reset_value = LightManagerUtils.defaultShadowNormalBias(light);
                    }
                    setNumControl(light_shadow_normal_bias_sliderbox, light.shadow_normal_bias);
                } finally {
                    syncingLightSettings = false;
                }
                updateConditionalLightToolbars();
            };

            const applyLightPanelValue = (property, value, undoLabel) => {
                if (syncingLightSettings) return false;

                const light = getSelectedLight();
                if (!light) return false;

                const nextValue = normalizeLightPanelValue(light, property, value);
                const updateAutomaticNormalBias = (
                    LIGHT_MANAGER_AUTO_NORMAL_BIAS_PROPERTIES.includes(property) &&
                    LightManagerUtils.isAutomaticShadowNormalBiasValue(light.shadow_normal_bias, light)
                );
                const nextNormalBiasContext = {
                    ...light,
                    [property]: nextValue
                };
                if (property === 'shadow_near' && nextNormalBiasContext.shadow_far <= nextNormalBiasContext.shadow_near) {
                    nextNormalBiasContext.shadow_far = nextNormalBiasContext.shadow_near + 0.001;
                }
                const nextAutomaticNormalBias = updateAutomaticNormalBias
                    ? LightManagerUtils.defaultShadowNormalBias(nextNormalBiasContext)
                    : null;
                const normalBiasNeedsAutoUpdate = (
                    updateAutomaticNormalBias &&
                    !lightValuesEqual(light.shadow_normal_bias, nextAutomaticNormalBias)
                );
                if (lightValuesEqual(light[property], nextValue) && !normalBiasNeedsAutoUpdate) return false;

                const directUndo = undoLabel && !activeLightUndoLabel;
                if (directUndo) Undo.initEdit({ elements: [light] });

                light[property] = Array.isArray(nextValue) ? nextValue.slice() : nextValue;
                if (updateAutomaticNormalBias) {
                    light.shadow_normal_bias = nextAutomaticNormalBias;
                }
                if (property === 'shadow_near' && light.shadow_far <= light.shadow_near) {
                    light.shadow_far = light.shadow_near + 0.001;
                }
                if (property === 'temperature') {
                    const tempColor = kelvinToTinyColor(light.temperature);
                    light.color = [tempColor._r, tempColor._g, tempColor._b];
                    light.render_color = light.color.slice();
                }
                if (property === 'color') {
                    light.render_color = light.color.slice();
                }
                if (property === 'intensity') {
                    light.render_intensity = light.intensity;
                }

                if (property === 'light_type') {
                    light.updateLightIcon();
                    LightElement.preview_controller?.updateSelection(light);
                }

                const updateOptions = getLightPanelUpdateOptions(property);
                window.update_light_element_callback?.(updateOptions);
                if (updateOptions.gizmos !== false) {
                    window.LightManagerViewportControls?.updateAll();
                }

                if (['light_type', 'has_shadow'].includes(property)) {
                    syncLightSettingsPanel(light);
                } else if (normalBiasNeedsAutoUpdate) {
                    setNumControl(light_shadow_normal_bias_sliderbox, light.shadow_normal_bias);
                } else if (['shadow_resolution', 'studio_shadow_resolution'].includes(property)) {
                    updateConditionalLightToolbars();
                }

                if (directUndo) Undo.finishEdit(undoLabel);
                return true;
            };

            light_type_select = new CompactDropdownSelect('light_type_select', {
                name: 'property.light_type',
                icon_mode: true,
                options: {
                    point: { name: 'property.light_type.point', icon: 'lightbulb' },
                    directional: { name: 'property.light_type.directional', icon: 'light_mode' },
                    spot: { name: 'property.light_type.spot', icon: 'highlight' }
                },
                condition: singleLightCondition,
                onChange: function () {
                    applyLightPanelValue('light_type', this.value, translateLightManager('light_manager.undo.change_type'));
                }
            });

            light_color_picker = new AdvancedColorPicker({
                id: 'light_color_picker',
                name: tl('property.light_color'),
                label: false,
                value: tinycolor('ffffff'),
                condition: singleLightCondition,
                onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_color')),
                onChange: function (color) {
                    let newColor = tinycolor(color);
                    applyLightPanelValue('color', [newColor._r, newColor._g, newColor._b], translateLightManager('light_manager.undo.change_color'));
                },
                onMove: function (color) {
                    let newColor = tinycolor(color);
                    applyLightPanelValue('color', [newColor._r, newColor._g, newColor._b], translateLightManager('light_manager.undo.change_color'));
                },
                onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_color'))
            });

            light_temperature_slider = new ComboSlider('light_temperature_slider', {
                label: 'property.light_temperature',
                title: 'property.light_temperature.desc',
                grow: true,
                color: 'var(--color-warning)',
                condition: singleLightCondition,
                value: 6500,
                reset_value: 6500,
                min: 2700,
                max: 6500,
                step: 100,
                circular: true,
                allow_higher: false,
                allow_lower: false,
                get: function () {
                    let light = getSelectedLight();
                    return light ? (light.temperature || 6500) : 6500;
                },
                onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_temperature')),
                onChange: function () {
                    applyLightPanelValue('temperature', this.value);
                },
                onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_temperature'))
            });

            cast_shadows_toggle = new Toggle('cast_shadows', {
                icon: 'ev_shadow',
                name: 'property.cast_shadows',
                category: 'edit',
                condition: singleLightCondition,
                default: true,
                onChange(toggle_value) {
                    applyLightPanelValue('has_shadow', toggle_value, translateLightManager('light_manager.undo.toggle_shadows'));
                }
            });

            light_shadow_resolution_select = new BarSelect('light_shadow_resolution_select', {
                name: 'property.shadow_resolution',
                options: {
                    256: { name: '256' },
                    512: { name: '512' },
                    1024: { name: '1024' },
                    2048: { name: '2048' },
                    4096: { name: '4096' }
                },
                condition: shadowLightCondition,
                onChange: function () {
                    applyLightPanelValue('shadow_resolution', this.value, translateLightManager('light_manager.undo.change_shadow_resolution'));
                }
            });

            light_studio_shadow_resolution_select = new BarSelect('light_studio_shadow_resolution_select', {
                name: 'property.studio_shadow_resolution',
                description: 'property.studio_shadow_resolution.desc',
                options: {
                    0: { name: 'light_manager.option.shadow_same_preview' },
                    256: { name: '256' },
                    512: { name: '512' },
                    1024: { name: '1024' },
                    2048: { name: '2048' },
                    4096: { name: '4096' },
                    8192: { name: '8192 — Render Pro' },
                    16384: { name: '16384 — Render Ultra' }
                },
                condition: shadowLightCondition,
                onChange: function () {
                    applyLightPanelValue('studio_shadow_resolution', this.value, translateLightManager('light_manager.undo.change_studio_shadow_resolution'));
                }
            });

            let light_quickbuttons_toolbar = new Toolbar({
                id: 'light_quickbuttons',
                name: 'property.light.quickbuttons',
                label: true,
                condition: singleLightCondition,
                children: ['light_type_select', 'light_color_picker', '#', 'light_temperature_slider']
            });

            let light_shadow_quality_toolbar = new Toolbar({
                id: 'light_shadow_quality',
                name: 'property.light.shadows',
                label: true,
                condition: singleLightCondition,
                children: ['cast_shadows', '#', 'light_shadow_resolution_select', 'light_studio_shadow_resolution_select']
            });

            let light_gizmo_tools_toolbar = new Toolbar({
                id: 'light_gizmo_tools',
                name: 'property.light.viewport_tools',
                label: true,
                condition: singleLightCondition,
                children: ['light_manager_edit_tool', 'light_manager_free_move']
            });

            light_intensity_slider = new ComboSlider('light_intensity_slider', {
                label: 'property.light_intensity',
                icon: 'flare',
                title: 'property.light_intensity.desc',
                grow: true,
                color: 'var(--color-axis-w)',
                value: 1.0,
                reset_value: 1.0,
                min: 0.0,
                max: 3.0,
                step: 0.1,
                allow_higher: true,
                allow_lower: false,
                get: function () {
                    let light = getSelectedLight();
                    return light ? light.intensity : 0;
                },
                onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_intensity')),
                onChange: function () {
                    applyLightPanelValue('intensity', this.value);
                },
                onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_intensity'))
            });

            light_distance_slider = new ComboSlider('light_distance_slider', {
                label: 'property.distance',
                title: 'property.distance.desc',
                grow: true,
                color: '#00CE71',
                condition: rangeLightCondition,
                value: 0,
                reset_value: 0,
                min: 0,
                max: 100,
                step: 0.5,
                allow_higher: true,
                allow_lower: false,
                get: function () {
                    let light = getSelectedLight();
                    return light ? light.distance : 0;
                },
                onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_distance')),
                onChange: function () {
                    applyLightPanelValue('distance', this.value);
                },
                onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_distance'))
            });

            light_cone_angle_slider = new ComboSlider('light_cone_angle_slider', {
                label: 'property.cone_angle',
                title: 'property.cone_angle.desc',
                grow: true,
                color: '#F4D714',
                condition: spotLightCondition,
                value: 45,
                reset_value: 45,
                min: 0.1,
                max: 89.9,
                step: 0.1,
                allow_higher: false,
                allow_lower: false,
                get: function () {
                    let light = getSelectedLight();
                    return light ? light.angle : 45;
                },
                onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_cone_angle')),
                onChange: function () {
                    applyLightPanelValue('angle', this.value);
                },
                onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_cone_angle'))
            });

            light_cone_penumbra_slider = new ComboSlider('light_cone_penumbra_slider', {
                label: 'property.cone_penumbra',
                title: 'property.cone_penumbra.desc',
                grow: true,
                color: '#F96BC5',
                condition: spotLightCondition,
                value: 0,
                reset_value: 0,
                min: 0,
                max: 1,
                step: 0.01,
                allow_higher: false,
                allow_lower: false,
                get: function () {
                    let light = getSelectedLight();
                    return light ? light.penumbra : 0;
                },
                onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_penumbra')),
                onChange: function () {
                    applyLightPanelValue('penumbra', this.value);
                },
                onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_penumbra'))
            });



            let light_settings_toolbar = new Toolbar({
                id: 'light_settings',
                name: 'property.light_settings',
                condition: singleLightCondition,
                label: true,
                children: ['light_intensity_slider', '#', 'light_distance_slider', '#', 'light_cone_angle_slider', '#', 'light_cone_penumbra_slider']
            });

            light_shadow_near_sliderbox = new ComboSlider('light_shadow_near_sliderbox', {
                label: 'property.shadow_near',
                title: 'light_manager.property.shadow_near',
                color: '#EC9218',
                grow: true,
                value: 0.1,
                reset_value: 0.1,
                min: 0,
                max: 100000,
                step: 0.05,
                allow_higher: true,
                condition: shadowLightCondition,
                onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_shadow_clip')),
                onChange: function () {
                    applyLightPanelValue('shadow_near', this.value);
                },
                onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_shadow_clip'))
            });

            light_shadow_far_sliderbox = new ComboSlider('light_shadow_far_sliderbox', {
                label: 'property.shadow_far',
                title: 'light_manager.property.shadow_far',
                color: '#FA565D',
                grow: true,
                value: 200,
                reset_value: 200,
                min: 0.001,
                max: 100000,
                step: 1,
                allow_higher: true,
                condition: shadowLightCondition,
                onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_shadow_clip')),
                onChange: function () {
                    applyLightPanelValue('shadow_far', this.value);
                },
                onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_shadow_clip'))
            });

            light_shadow_bounds_slider = new ComboSlider('light_shadow_bounds_slider', {
                label: 'property.shadow_bounds',
                title: 'light_manager.property.sun_shadow_area.desc',
                color: '#B55AF8',
                grow: true,
                value: 35,
                reset_value: 35,
                min: 1,
                max: 128,
                step: 1,
                allow_higher: true,
                condition: directionalShadowCondition,
                get: function () {
                    let light = getSelectedLight();
                    return light ? light.shadow_bounds : 35;
                },
                onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_shadow_bounds')),
                onChange: function () {
                    applyLightPanelValue('shadow_bounds', this.value);
                },
                onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_shadow_bounds'))
            });

            let light_shadow_clip_settings_toolbar = new Toolbar({
                id: 'light_shadow_clip_settings',
                name: 'property.shadow_clip',
                label: true,
                condition: shadowLightCondition,
                children: ['light_shadow_near_sliderbox', 'light_shadow_far_sliderbox']
            });

            let light_shadow_bounds_settings_toolbar = new Toolbar({
                id: 'light_shadow_bounds_settings',
                name: 'property.shadow_area',
                label: true,
                condition: directionalShadowCondition,
                children: ['light_shadow_bounds_slider']
            });

            light_shadow_softness_sliderbox = new ComboSlider('light_shadow_softness_sliderbox', {
                label: tl('property.shadow_softness'),
                title: 'property.shadow_softness.desc',
                color: 'var(--color-accent)',
                grow: true,
                value: DEFAULT_SHADOW_SOFTNESS,
                reset_value: DEFAULT_SHADOW_SOFTNESS,
                min: 0, max: 8, step: 0.05,
                condition: shadowLightCondition,
                onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_shadow_softness')),
                onChange: function () {
                    applyLightPanelValue('shadow_softness', this.value);
                },
                onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_shadow_softness'))
            });

            light_shadow_bias_sliderbox = new ComboSlider('light_shadow_bias_sliderbox', {
                label: tl('property.shadow_bias'),
                color: 'var(--color-axis-z)',
                grow: true,
                value: DEFAULT_SHADOW_BIAS,
                reset_value: DEFAULT_SHADOW_BIAS,
                min: -1, max: 1, step: 0.0001,
                condition: shadowLightCondition,
                onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_shadow_bias')),
                onChange: function () {
                    applyLightPanelValue('shadow_bias', this.value);
                },
                onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_shadow_bias'))
            });

            light_shadow_normal_bias_sliderbox = new ComboSlider('light_shadow_normal_bias_sliderbox', {
                label: tl('property.shadow_normal_bias'),
                color: 'var(--color-axis-u)',
                grow: true,
                description: tl('property.shadow_normal_bias.desc'),
                value: DEFAULT_SHADOW_NORMAL_BIAS,
                reset_value: DEFAULT_SHADOW_NORMAL_BIAS,
                min: -1, max: 1, step: 0.0001,
                condition: shadowLightCondition,
                onBefore: () => beginLightEdit(translateLightManager('light_manager.undo.change_shadow_normal_bias')),
                onChange: function () {
                    applyLightPanelValue('shadow_normal_bias', this.value);
                },
                onAfter: () => finishLightEdit(translateLightManager('light_manager.undo.change_shadow_normal_bias'))
            });

            let light_shadow_bias_settings_toolbar = new Toolbar({
                id: 'light_shadow_bias_settings',
                name: 'property.shadow_biases',
                label: true,
                condition: shadowLightCondition,
                children: ['light_shadow_softness_sliderbox', '#', 'light_shadow_bias_sliderbox', '#', 'light_shadow_normal_bias_sliderbox']
            });

            Object.assign(LIGHT_SETTINGS_GROUP, {
                light_type_select,
                light_intensity_slider,

                light_settings_toolbar,
                light_color_picker,
                light_temperature_slider,

                light_distance_slider,

                light_cone_angle_slider,

                light_cone_penumbra_slider,

                cast_shadows_toggle,
                light_shadow_resolution_select,
                light_studio_shadow_resolution_select,
                light_gizmo_tools_toolbar,
                light_quickbuttons_toolbar,
                light_shadow_quality_toolbar,
                light_shadow_near_sliderbox,
                light_shadow_far_sliderbox,
                light_shadow_clip_settings_toolbar,
                light_shadow_bounds_slider,
                light_shadow_bounds_settings_toolbar,

                light_shadow_softness_sliderbox,
                light_shadow_bias_sliderbox,
                light_shadow_normal_bias_sliderbox,
                light_shadow_bias_settings_toolbar
            });

            let lightPropertiesPanel = new Panel('light_properties', {
                icon: 'lightbulb',
                growable: true,
                resizable: true,
                condition: { modes: ['edit', 'render'], method: () => (LightElement.selected.length > 0) },
                display_condition: () => (LightElement.selected.length === 1),
                default_position: {
                    slot: 'right_bar',
                    float_position: [0, 0],
                    float_size: [320, 520],
                    height: 520,
                    attached_to: 'transform',
                    attached_index: 1,
                    sidebar_index: 2,
                },
                mode_positions: {
                    edit: {
                        slot: 'right_bar',
                        float_position: [0, 0],
                        float_size: [320, 520],
                        height: 520,
                        attached_to: 'transform',
                        attached_index: 1,
                        sidebar_index: 2,
                    },
                    render: {
                        slot: "left_bar",
                        float_position: [
                            1322,
                            57
                        ],
                        float_size: [
                            314,
                            520
                        ],
                        height: 520,
                        folded: false,
                        fixed_height: false,
                        attached_to: "material_properties",
                        sidebar_index: 1
                    }
                },
                toolbars: [
                    light_gizmo_tools_toolbar,
                    light_quickbuttons_toolbar,
                    light_shadow_quality_toolbar,
                    light_settings_toolbar,
                    light_shadow_clip_settings_toolbar,
                    light_shadow_bounds_settings_toolbar,
                    light_shadow_bias_settings_toolbar
                ]
            });
            window.light_properties_panel = lightPropertiesPanel;
            window.LIGHT_SETTINGS_GROUP = LIGHT_SETTINGS_GROUP;

            const lightPanelStyles = Blockbench.addCSS(`
                #panel_light_properties {
                    overflow-y: auto !important;
                    overflow-x: hidden;
                    background: var(--color-ui);
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
                    width: 6px;
                }
                #panel_light_properties::-webkit-scrollbar-thumb {
                    background-color: var(--color-button);
                    border-radius: 3px;
                }

            `);
            deletables.push(lightPanelStyles);

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

                const sceneChanged = touchesGroups || elements.some(element => {
                    return element && element.type !== 'light' && !(window.LightElement && element instanceof window.LightElement);
                });
                syncLightManagerShadows({ scene: sceneChanged });
            });
            deletables.push(viewUpdateShadowListener);

            ['finish_edit', 'undo', 'redo', 'load_undo_save', 'select_project'].forEach(eventName => {
                const listener = Blockbench.on(eventName, () => {
                    syncLightManagerShadows({ scene: true });
                });
                deletables.push(listener);
            });

            let lightPanelSelectionListener = Blockbench.on('update_selection', () => {
                const light = getSelectedLight();
                if (light) syncLightSettingsPanel(light);
                if (lightPropertiesPanel.isVisible() && LightElement.selected.length === 0) {
                    Panels.transform.selectTab();
                    if (Project.mode === 'render') {
                        Panels.material_properties.selectTab(Panels.material_properties);
                    }
                }
                const renderElementSelected = [window.Cube, window.Mesh, window.TextureMesh].some(ElementType => (
                    ElementType && Array.isArray(ElementType.selected) && ElementType.selected.length > 0
                ));
                if (Project.mode === 'render' && LightElement.selected.length > 0 && !renderElementSelected) {
                    Panels.material_properties.selectTab(Panels.light_properties);
                }
            });
            deletables.push(lightPanelSelectionListener);
            Object.values(LIGHT_SETTINGS_GROUP).forEach(item => {
                if (item && typeof item.delete === 'function') deletables.push(item);
            });
            deletables.push(lightPropertiesPanel);

            window.LIGHT_MANAGER_LOADED = true;
            window.LightManagerPrepareRender?.();
            window.dispatchEvent(new CustomEvent('light_manager_initialized', {
                detail: 'Light Manager plugin has been initialized and is ready to use.'
            }));

        },

        onunload() {
            cancelLightManagerElementUpdate();
            window.LightManagerAreaGizmos?.clear();
            window.LightManagerViewportControls?.dispose();
            disposeLightManagerResources();
            cleanupLightManagerRegistries();

            Object.keys(window.three_lights || {}).forEach(uuid => {
                const light = window.three_lights[uuid];
                disposeThreeLight(light);
                delete window.three_lights[uuid];
            });

            if (window.three_lights_group && window.three_lights_group.parent) {
                window.three_lights_group.parent.remove(window.three_lights_group);
            }
            delete window.three_lights_group;

            Object.keys(lightTextures).forEach(key => {
                if (lightTextures[key] && typeof lightTextures[key].dispose === 'function') {
                    lightTextures[key].dispose();
                }
                delete lightTextures[key];
            });
            lightTextures = {};

            delete OutlinerElement.types.light;
            if (NodePreviewController.controllers && NodePreviewController.controllers.light) {
                NodePreviewController.controllers.light.delete();
            }

            delete window.LIGHT_MANAGER_LOADED;
            delete window.ComboSlider;
            delete window.CompactDropdownSelect;
            delete window.BarDisplay;
            delete window.TextInputWidget;
            delete window.light_properties_panel;
            delete window.LIGHT_SETTINGS_GROUP;
            delete window.LightElement;
            delete window.LightAnimator;
            delete window.LightManagerAreaGizmos;
            delete window.LightManagerViewportControls;
            delete window.LightManagerFitTool;
            delete window.LightManagerPrepareRender;
            delete window.LightManagerMarkShadowsDirty;
            delete window.LightManagerDebugShadows;
            delete window.LightManagerSyncLights;
            delete window.update_light_element_callback;
            restoreLightManagerAnimatorPreview();
            restoreLightManagerRendererShadowSettings();
            resetLightManagerShadowState();
            if (window.generateIconBase64 === generateIconBase64) delete window.generateIconBase64;
        }
    });
}

// Asynchronous initialization of all exclusive textures that will visually represent each light type
async function load_textures() {
    const specs = [
        ['point', 'lightbulb', 'P'],
        ['directional', 'light_mode', 'D'],
        ['spot', 'highlight', 'S']
    ];

    for (const [key, icon, fallbackLabel] of specs) {
        try {
            light_icons_b64[key] = await generateIconBase64(icon, 128, {
                fontFamily: 'Material Icons',
                color: 'rgba(255, 255, 255, 1)'
            });
        } catch (error) {
            light_icons_b64[key] = lightManagerFallbackIconDataUrl(fallbackLabel);
        }
    }
}

load_textures().catch(() => {
    light_icons_b64.point = lightManagerFallbackIconDataUrl('P');
    light_icons_b64.directional = lightManagerFallbackIconDataUrl('D');
    light_icons_b64.spot = lightManagerFallbackIconDataUrl('S');
}).then(() => {
    initialize_light_plugin();
});
