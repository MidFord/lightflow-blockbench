(function () {
    'use strict';

    const PLUGIN_ID = 'lightflow_environment';
    const PLUGIN_VERSION = '1.5.1';
    const STORAGE_KEY = 'lightflow_environment.settings';
    const PROJECT_PROPERTY = 'lightflow_environment_settings';
    const TWO_PI = Math.PI * 2;

    const VANILLA_SUN_TEXTURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABGdBTUEAALGPC/xhBQAAAcJJREFUWMPVl01OwzAQRsduchMkfjbsgTMgARfgaFwAkDgDsGcDReImaWw0ccfz2ZlUZeUSyfLYjfyeZ5I0cUQUaY/DOfrTEeN+5zlLYAm2r8QS3JovBGqAjF3+IUK8BInbZSWeg3GcBXDdEpygHMq4lKICxktyzEORsUQkngkgSMG0jeciuBcEa1yKCLgQsODeK3AeL9c4BJWoY0vCEFCI9x5i7blh1mRBhggU+xBCJWcIaJoVklo91nPwKIHYyjktkSmgsNXKZzjGaeyq6yCldhxL8DgGI8ZrAwR0Z7QFJpDAOcY5vV50RwwRidTXc2Gaw3LwGtM2MN0MSCBsvoglY1JLFEgNY53DssjtnEtQ7txR1/lZLL2dgUibTSj6OpZM5BKIgGSAJWpY16WY28/L1c4n4dH16wRMLRpSIWfAFOi6VQYyvO99hvP89/Ml0dm9Tf98oOObtwksEsOg8DQ/Lgtgurkp3OV+/SQC5xX9YxI4uUWBmCVECEuxUwDhfa9Z+Xq82Clwevee4cMwziT+j0CTEjS/CJvehk0fRE0fxc3/jA7m77j5C0nzV7KmL6XNX8sP4sOk+afZQXyctvg8/wWeuMZGas8GCwAAAABJRU5ErkJggg==';
    const VIBRANT_VISUALS_SUN_TEXTURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAF9JREFUWIXt0sENQEAQheGfqIaDPlShNFXow4F21l2QzNib/7vtJPvykhmQJP1dE/1Q9qm8Bg5rKLOLFgCgn+/nxxKOyhUAYLy8t1RKmy9QhwU+3EBu53UKJK5dkqQnJ26fCV8qCo4LAAAAAElFTkSuQmCC';

    // Shared by the Vanilla and Vibrant Visuals presets.
    const VANILLA_MOON_PHASES_TEXTURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAABACAIAAABdtOgoAAAABGdBTUEAALGPC/xhBQAABC1JREFUeNrtm0ty00AQhi3L73cSOwkJBZQDmKosss0xWLFlBxdgRRV3oIoFJ2CdbQ6RC7DnHvDPtGcy0cMZhxZykT/V5ZIl+evM/OoeW+puNO75SyLsb/7Iv5eYNDfZ1v7Ij0HbDyfNFNZI8NoqNHtIzsk7I387fhbtuO1m2kmaxppp15vbg9e295RzQ34839FDtEDTVi9t91udQdq+Nfu2j0PO2V03ZQMgv4SfoRtVDdpyW51huztu9yZZ645xSDxZ2Y2bEh/kb+bfBlcqwkK6EN3pz7qDfWPDA2N2GzvvuGn1RGpAygZAfgnfyYswgVCOPvLo3mjeGy364yNveIud3g1OFh9W51YgMvkx/EBeBIundwd70FPQg+nJcHY6mBqzGyfixgq+533YlBeKTH4Mv5GIvCa4TF4bBvTD/vgY0NHes9H+8/HBCxg28BY7cQgnBD6G+LgNNCtyMADyN/AT52AtL9KWiSxLH0yeDGdPQZzMl5P52WTx0hg25kvsxCGcID5MrJl8txbZOUjIv4/v4stlN5F330bWsaOfTQ9fTw9Xs6M3MGzgLXaKD6vzAh9Zi2wz3Z2lhvxN/PUKs44vkRcLiM1rp0L/+eu3t6/ff+D17bsP7z9+Fh821pDv5iKyj7JwAJF8MM8vLk0IW9PlA14RX8gZeDQ/cGDiy8mLZQSJDKEEMWXer65vwpmCWZ2XNt+dBCIPygYQww+HocvPz5EWH1hckZnZj+Y7B/aXxdoBFMNS7oJrFU6QvH768s0KsHKBZkQWB4DYNJcdQCRfYksGo8svEkCHn7/2t+HnHQwPJL6woGNJQVKTeYeF0wTDIZyA0yTK8MGoAWzkhwLo8vPXqRa/8PKP5kc4kLzvr1MZDExrACFfpNUVQPjVCVAWAQ8VoCiEZd7FqkhBHl5RCvIXze6moA2LDKZb5kXMv9VaxDJ89UU45O/uIhzzNSucJsWvoSG/0q+JVfMf/jV0+x8aq+niVZU/ZB4Pn7cK6r4VwZtltfN5u7j229F8YFL3Axk+Mqz5kSQfmtf6UJ5lI7XzWThVd2EWSwdr57N4dif4LB/fLT4niP0B7A/gIsn+APYH8IcY+wPYH8CbcewPYH8AH8iwP4D9AXwoz/6AR9YfcH5xWWhahU1hMROwvgJMnQ84yFIod3V9UwUf/7YvolXrDygsfMROrdK+PFm3/yAkY/ZhUoeqy/dwX+qq1h9QLoBOcWshXLH4N4P1c6TI92SJgG34EeXXZQJolXcXwhX7D/ICIEXAFPk+c0r1+Db8XRVAsf8gn9wkRegK4JcWb2r9Af9fCnI5WjkFiT0wBe3UIqzbf5AXQDRQX4R9/4RrYFHqD/j3X0N1+w8K4TvDZ/0++wPYH8CbZewPYH8AH5iwP4D9AXxozv4A9gewcIr9AewPYPEs+wMeC/8P/KdOUa7fl/QAAAAASUVORK5CYII=';

    const VANILLA_CLOUDS = 'data:image/png;base64,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';

    const DEFAULT_SETTINGS = {
        enabled: true,
        preset: 'vanilla',
        time: 6000,
        animate_time: false,
        day_length_seconds: 120,
        sun_azimuth: 0,
        palette_mode: 'preset',
        zenith_color: '#79a7ff',
        horizon_color: '#bdd6ff',
        sunrise_zenith_color: '#647db5',
        sunrise_horizon_color: '#f59a62',
        night_zenith_color: '#05091d',
        night_horizon_color: '#151d3d',
        ground_color: '#bdd6ff',
        sun_color: '#fff3c4',
        moon_color: '#dbe4ff',
        cloud_color: '#f3f5f7',
        sky_intensity: 1,
        sky_gradient_power: 2.3,
        star_density: 1,
        environment_strength: 0.75,
        sun_enabled: true,
        sun_intensity: 2.2,
        moon_intensity: 0.28,
        celestial_size: 0.1,
        moon_phase: 0,
        sun_mode: 'vanilla',
        moon_mode: 'vanilla',
        sun_texture_uuid: '',
        moon_texture_uuid: '',
        // Moon atlas frames are read left-to-right, top-to-bottom:
        // full, waning gibbous, third quarter, waning crescent,
        // new, waxing crescent, first quarter, waxing gibbous.
        moon_texture_layout: 'atlas',
        moon_atlas_columns: 4,
        moon_atlas_rows: 2,
        moon_phase_offset: 0,
        sun_horizon_scale: 1.34,
        sun_gaze_scale: 1.16,
        sun_glare: 0.25,
        sunset_directional_glow: 1,
        stars_enabled: true,
        star_brightness: 0.72,
        clouds_enabled: true,
        cloud_mode: 'vanilla',
        cloud_texture_uuid: '',
        cloud_coverage: 0.54,
        cloud_opacity: 0.78,
        cloud_speed: 0.016,
        cloud_scale: 1,
        cloud_direction: 0,
        cloud_contrast: 1,
        cloud_brightness: 1,
        cloud_height: 512,
        cloud_thickness: 4,
        cloud_extrusion: 1,
        sun_cast_shadows: true,
        shadow_area: 48,
        shadow_near: 0.1,
        shadow_far: 480,
        shadow_resolution: 2048,
        shadow_bias: -0.00035,
        shadow_normal_bias: 0.025,
        shadow_auto_fit: true,
        shadow_fit_corners: null,
        show_shadow_gizmo: true,
        pixelated_shadows: false,
        pixel_shadow_steps: 4,
        pixel_shadow_scale: 2
    };

    const PRESETS = {
        vanilla: {
            name: 'Minecraft Vanilla',
            zenith: '#79a7ff', horizon: '#bdd6ff',
            sunrise_zenith: '#647db5', sunrise_horizon: '#f59a62',
            night_zenith: '#05091d', night_horizon: '#151d3d',
            ground: '#bdd6ff', sun: '#fff3c4', moon: '#dbe4ff', cloud: '#f3f5f7',
            ambient_day: 0.78, ambient_night: 0.17
        },
        vibrant_visuals: {
            name: 'Minecraft Vibrant Visuals',
            zenith: '#3184ff', horizon: '#a6dcff',
            sunrise_zenith: '#6b69bd', sunrise_horizon: '#ff874d',
            night_zenith: '#030824', night_horizon: '#1f2b5b',
            ground: '#416579', sun: '#fff1b0', moon: '#cbdcff', cloud: '#fff7ec',
            ambient_day: 0.92, ambient_night: 0.21
        }
    };

    let settings = loadSettings();
    let skyMesh = null;
    let skyMaterial = null;
    let starMesh = null;
    let starMaterial = null;
    let starAttemptIndexCounts = null;
    let cloudMesh = null;
    let cloudMaterial = null;
    let sunLight = null;
    let sunTarget = null;
    let sunShadowGizmo = null;
    let sunShadowGizmoDrag = null;
    let sunShadowGizmoRaycaster = null;
    let storageWriteFailureReported = false;
    let sunShadowGizmoMouse = null;
    let effectiveShadowFrustum = null;
    const sunShadowGizmoListeners = [];
    let settingsAction = null;
    let environmentPanel = null;
    let syncingEnvironmentPanel = false;
    let vanillaSunTexture = null;
    let vibrantVisualsSunTexture = null;
    let vanillaMoonPhasesTexture = null;
    let vanillaCloudTexture = null;
    let fallbackTexture = null;
    let embeddedTexturesStarted = false;
    let embeddedTextureGeneration = 0;
    let projectTextureCache = new WeakMap();
    let projectEnvironmentTextures = new Set();
    let projectProperty = null;
    let animationFrame = null;
    let previewRenderFrame = null;
    let lastFrameTime = 0;
    let lastRenderTime = 0;
    let environmentRevision = 0;
    let environmentProject = null;
    let lastSunShadowConfig = '';
    let lastSunShadowDirection = null;
    let lastSunShadowRefresh = 0;
    let lastSunShadowGizmoSignature = '';
    const deletables = [];
    const publishedWindowBindings = new Map();

    /*
     * UI settings flow through updateScene(), which owns the sky mesh and the
     * THREE directional light. getVirtualLight() exposes the same state to
     * Shader Architect so both render paths agree on light and shadow state.
     */

    function publishWindowBinding(name, value) {
        if (!publishedWindowBindings.has(name)) {
            publishedWindowBindings.set(name, {
                hadOwnValue: Object.prototype.hasOwnProperty.call(window, name),
                previousValue: window[name],
                ownedValue: value
            });
        } else {
            publishedWindowBindings.get(name).ownedValue = value;
        }
        window[name] = value;
        return value;
    }

    function restoreWindowBindings() {
        Array.from(publishedWindowBindings.entries()).reverse().forEach(([name, binding]) => {
            if (window[name] !== binding.ownedValue) return;
            if (binding.hadOwnValue) window[name] = binding.previousValue;
            else delete window[name];
        });
        publishedWindowBindings.clear();
    }

    function disposeRegisteredResources() {
        deletables.splice(0).reverse().forEach(resource => {
            if (!resource || typeof resource.delete !== 'function') return;
            try {
                resource.delete();
            } catch (error) {
                console.warn('[Lightflow Environment] Failed to release a registered resource.', error);
            }
        });
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, Number(value)));
    }

    function finite(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function mod(value, divisor) {
        return ((value % divisor) + divisor) % divisor;
    }

    function tr(key, fallback) {
        if (typeof tl !== 'function') return fallback || key;
        const translated = tl(key);
        return translated === key ? (fallback || key) : translated;
    }

    function markerColor(index, tone = 'pastel', fallback = 'var(--color-accent)') {
        return window.LightManagerUI?.markerColor?.(index, tone, fallback) || fallback;
    }

    function normalizeHex(value, fallback) {
        const match = String(value || '').trim().match(/^#?([0-9a-f]{6})$/i);
        return match ? '#' + match[1].toLowerCase() : fallback;
    }

    function normalizeSettings(source) {
        const result = Object.assign({}, DEFAULT_SETTINGS, source || {});
        result.enabled = result.enabled !== false;
        result.preset = PRESETS[result.preset] ? result.preset : 'vanilla';
        result.time = mod(finite(result.time, 6000), 24000);
        result.animate_time = !!result.animate_time;
        result.day_length_seconds = clamp(finite(result.day_length_seconds, 120), 10, 3600);
        result.sun_azimuth = mod(finite(result.sun_azimuth, 0), 360);
        result.palette_mode = result.palette_mode === 'custom' ? 'custom' : 'preset';
        result.zenith_color = normalizeHex(result.zenith_color, DEFAULT_SETTINGS.zenith_color);
        result.horizon_color = normalizeHex(result.horizon_color, DEFAULT_SETTINGS.horizon_color);
        result.sunrise_zenith_color = normalizeHex(result.sunrise_zenith_color, DEFAULT_SETTINGS.sunrise_zenith_color);
        result.sunrise_horizon_color = normalizeHex(result.sunrise_horizon_color, DEFAULT_SETTINGS.sunrise_horizon_color);
        result.night_zenith_color = normalizeHex(result.night_zenith_color, DEFAULT_SETTINGS.night_zenith_color);
        result.night_horizon_color = normalizeHex(result.night_horizon_color, DEFAULT_SETTINGS.night_horizon_color);
        result.ground_color = normalizeHex(result.ground_color, DEFAULT_SETTINGS.ground_color);
        result.sun_color = normalizeHex(result.sun_color, DEFAULT_SETTINGS.sun_color);
        result.moon_color = normalizeHex(result.moon_color, DEFAULT_SETTINGS.moon_color);
        result.cloud_color = normalizeHex(result.cloud_color, DEFAULT_SETTINGS.cloud_color);
        result.sky_intensity = clamp(finite(result.sky_intensity, 1), 0, 4);
        result.sky_gradient_power = clamp(finite(result.sky_gradient_power, 2.3), 0.5, 8);
        result.star_density = clamp(finite(result.star_density, 1), 0.1, 4);
        result.environment_strength = clamp(finite(result.environment_strength, 0.75), 0, 4);
        result.sun_enabled = result.sun_enabled !== false;
        result.sun_intensity = clamp(finite(result.sun_intensity, 2.2), 0, 20);
        result.moon_intensity = clamp(finite(result.moon_intensity, 0.28), 0, 5);
        result.celestial_size = clamp(finite(result.celestial_size, 0.055), 0.012, 0.18);
        result.moon_phase = Math.round(clamp(finite(result.moon_phase, 0), 0, 7));
        result.sun_mode = ['vanilla', 'texture', 'hidden'].includes(result.sun_mode) ? result.sun_mode : 'vanilla';
        result.moon_mode = ['vanilla', 'texture', 'hidden'].includes(result.moon_mode) ? result.moon_mode : 'vanilla';
        result.sun_texture_uuid = typeof result.sun_texture_uuid === 'string' ? result.sun_texture_uuid : '';
        result.moon_texture_uuid = typeof result.moon_texture_uuid === 'string' ? result.moon_texture_uuid : '';
        result.moon_texture_layout = ['atlas', 'single'].includes(result.moon_texture_layout)
            ? result.moon_texture_layout
            : 'atlas';
        result.moon_atlas_columns = Math.round(clamp(finite(result.moon_atlas_columns, 4), 1, 16));
        result.moon_atlas_rows = Math.round(clamp(finite(result.moon_atlas_rows, 2), 1, 16));
        result.moon_phase_offset = Math.round(clamp(finite(result.moon_phase_offset, 0), -64, 64));
        result.sun_horizon_scale = clamp(finite(result.sun_horizon_scale, 1.34), 1, 2.5);
        result.sun_gaze_scale = clamp(finite(result.sun_gaze_scale, 1.16), 1, 2.5);
        result.sun_glare = clamp(finite(result.sun_glare, 0.25), 0, 3);
        result.sunset_directional_glow = clamp(finite(result.sunset_directional_glow, 1), 0, 3);
        result.stars_enabled = result.stars_enabled !== false;
        result.star_brightness = clamp(finite(result.star_brightness, 0.72), 0, 3);
        result.clouds_enabled = result.clouds_enabled !== false;
        result.cloud_mode = ['procedural', 'vanilla', 'texture'].includes(result.cloud_mode) ? result.cloud_mode : 'vanilla';
        result.cloud_texture_uuid = typeof result.cloud_texture_uuid === 'string' ? result.cloud_texture_uuid : '';
        result.cloud_coverage = clamp(finite(result.cloud_coverage, 0.54), 0, 1);
        result.cloud_opacity = clamp(finite(result.cloud_opacity, 0.78), 0, 1);
        result.cloud_speed = clamp(finite(result.cloud_speed, 0.016), -1, 1);
        result.cloud_scale = clamp(finite(result.cloud_scale, 1), 0.05, 16);
        result.cloud_direction = mod(finite(result.cloud_direction, 0), 360);
        result.cloud_contrast = clamp(finite(result.cloud_contrast, 1), 0.1, 4);
        result.cloud_brightness = clamp(finite(result.cloud_brightness, 1), 0, 4);
        result.cloud_height = clamp(finite(result.cloud_height, 96), 8, 1024);
        result.cloud_thickness = clamp(finite(result.cloud_thickness, 7.5), 0.25, 128);
        result.cloud_extrusion = clamp(finite(result.cloud_extrusion, 0.62), 0, 1);
        result.sun_cast_shadows = result.sun_cast_shadows !== false;
        result.shadow_area = clamp(finite(result.shadow_area, 48), 2, 100000);
        result.shadow_near = clamp(finite(result.shadow_near, 0.1), 0.001, 100000);
        result.shadow_far = Math.max(result.shadow_near + 1, clamp(finite(result.shadow_far, 480), 2, 100000));
        result.shadow_resolution = [256, 512, 1024, 2048, 4096, 8192].includes(Number(result.shadow_resolution))
            ? Number(result.shadow_resolution) : 2048;
        result.shadow_bias = clamp(finite(result.shadow_bias, -0.00035), -0.1, 0.1);
        result.shadow_normal_bias = clamp(finite(result.shadow_normal_bias, 0.025), 0, 2);
        result.shadow_auto_fit = result.shadow_auto_fit !== false;
        result.shadow_fit_corners = Array.isArray(result.shadow_fit_corners) && result.shadow_fit_corners.length === 24 &&
            result.shadow_fit_corners.every(value => Number.isFinite(Number(value)))
            ? result.shadow_fit_corners.map(Number)
            : null;
        result.show_shadow_gizmo = result.show_shadow_gizmo !== false;
        result.pixelated_shadows = !!result.pixelated_shadows;
        result.pixel_shadow_steps = Math.round(clamp(finite(result.pixel_shadow_steps, 4), 2, 16));
        result.pixel_shadow_scale = Math.round(clamp(finite(result.pixel_shadow_scale, 2), 1, 16));
        return result;
    }

    function loadSettings() {
        try {
            return normalizeSettings(Object.assign(
                {},
                DEFAULT_SETTINGS,
                JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
            ));
        } catch (error) {
            console.warn('[Lightflow Environment] Saved settings are invalid; using defaults.', error);
            return Object.assign({}, DEFAULT_SETTINGS);
        }
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (error) {
            if (!storageWriteFailureReported) {
                console.warn('[Lightflow Environment] Settings could not be persisted; the current session remains usable.', error);
                storageWriteFailureReported = true;
            }
        }
        if (typeof Project !== 'undefined' && Project) {
            Project[PROJECT_PROPERTY] = JSON.stringify(settings);
            if (typeof Project.saved === 'boolean') Project.saved = false;
        }
    }

    function hexToRgb(hex) {
        const match = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
        const value = match ? parseInt(match[1], 16) : 0xffffff;
        return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
    }

    function mixColor(a, b, amount) {
        const t = clamp(amount, 0, 1);
        return [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t
        ];
    }

    function multiplyColor(color, scalar) {
        return color.map(channel => Math.max(0, channel * scalar));
    }

    function smoothstep(edge0, edge1, value) {
        const t = clamp((value - edge0) / Math.max(edge1 - edge0, 0.000001), 0, 1);
        return t * t * (3 - 2 * t);
    }

    function getPalette() {
        if (settings.palette_mode !== 'custom') return PRESETS[settings.preset] || PRESETS.vanilla;
        return {
            name: 'Custom',
            zenith: settings.zenith_color,
            horizon: settings.horizon_color,
            sunrise_zenith: settings.sunrise_zenith_color,
            sunrise_horizon: settings.sunrise_horizon_color,
            night_zenith: settings.night_zenith_color,
            night_horizon: settings.night_horizon_color,
            ground: settings.ground_color,
            sun: settings.sun_color,
            moon: settings.moon_color,
            cloud: settings.cloud_color,
            ambient_day: (PRESETS[settings.preset] || PRESETS.vanilla).ambient_day,
            ambient_night: (PRESETS[settings.preset] || PRESETS.vanilla).ambient_night
        };
    }

    function getTextureOptions() {
        const options = { '': tr('lightflow_environment.option.texture_none', 'Select a project texture') };
        if (typeof Texture !== 'undefined' && Array.isArray(Texture.all)) {
            Texture.all.forEach((texture, index) => {
                if (!texture?.uuid) return;
                options[texture.uuid] = texture.name || texture.path || `Texture ${index + 1}`;
            });
        }
        return options;
    }

    function configureEnvironmentTexture(texture, options = {}) {
        if (!texture || !window.THREE) return texture;
        const repeat = options.repeat === true;
        texture.name = options.name || texture.name || 'Lightflow Environment Texture';
        texture.flipY = false;
        texture.premultiplyAlpha = false;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        return texture;
    }

    function getProjectTextureImage(texture, sourceMap) {
        return texture?.canvas || texture?.img || texture?.image ||
            sourceMap?.image || sourceMap?.source?.data || null;
    }

    function getBlockbenchTextureMap(uuid, usage = 'celestial') {
        if (!uuid || typeof Texture === 'undefined' || !Array.isArray(Texture.all) || !window.THREE) return null;
        const texture = Texture.all.find(candidate => candidate?.uuid === uuid);
        if (!texture) return null;
        const material = texture.getOwnMaterial?.() || texture.getMaterial?.() || texture.material;
        const sourceMap = material?.map || material?.uniforms?.map?.value || texture.texture || texture.three_texture;
        const image = getProjectTextureImage(texture, sourceMap);
        if (!image) return sourceMap?.isTexture ? sourceMap : null;

        let cachedByUsage = projectTextureCache.get(texture);
        if (!cachedByUsage) {
            cachedByUsage = new Map();
            projectTextureCache.set(texture, cachedByUsage);
        }
        const repeat = usage === 'cloud';
        const sourceStamp = [
            image,
            texture.currentFrame || 0,
            texture.saved === false ? 1 : 0,
            Number(image.width || image.naturalWidth || 0),
            Number(image.height || image.naturalHeight || 0)
        ];
        const cached = cachedByUsage.get(usage);
        if (cached && cached.sourceStamp.every((value, index) => value === sourceStamp[index])) {
            return cached.texture;
        }
        if (cached?.texture) {
            projectEnvironmentTextures.delete(cached.texture);
            cached.texture.dispose?.();
        }

        const environmentTexture = configureEnvironmentTexture(new THREE.Texture(image), {
            name: `Lightflow_${usage}_${texture.name || texture.uuid}`,
            repeat
        });
        cachedByUsage.set(usage, { texture: environmentTexture, sourceStamp });
        projectEnvironmentTextures.add(environmentTexture);
        return environmentTexture;
    }

    function clearProjectTextureCache() {
        projectEnvironmentTextures.forEach(texture => texture?.dispose?.());
        projectEnvironmentTextures.clear();
        projectTextureCache = new WeakMap();
    }

    function createCanvasTexture(canvas, name, options = {}) {
        const texture = THREE.CanvasTexture ? new THREE.CanvasTexture(canvas) : new THREE.Texture(canvas);
        return configureEnvironmentTexture(texture, {
            name,
            repeat: options.repeat === true
        });
    }

    function createEmbeddedTexture(dataUri, name, options = {}) {
        if (!window.THREE || typeof Image === 'undefined' || typeof document === 'undefined') return null;
        const placeholder = document.createElement('canvas');
        placeholder.width = placeholder.height = 1;
        const texture = configureEnvironmentTexture(new THREE.Texture(placeholder), {
            name,
            repeat: options.repeat === true
        });
        const image = new Image();
        image.decoding = 'async';
        const generation = options.generation;
        image.onload = () => {
            if (generation !== embeddedTextureGeneration || !embeddedTexturesStarted) {
                texture.dispose?.();
                return;
            }
            texture.image = image;
            texture.needsUpdate = true;
            updateScene({ forceShadow: false });
            requestPreviewRender();
        };
        image.onerror = error => {
            if (generation !== embeddedTextureGeneration) return;
            console.warn(`[Lightflow Environment] Failed to load embedded texture: ${name}`, error);
        };
        image.src = dataUri;
        return texture;
    }

    function ensureSkyTextures() {
        if (!window.THREE || typeof document === 'undefined') return;
        if (!fallbackTexture) {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, 1, 1);
            fallbackTexture = createCanvasTexture(canvas, 'Lightflow_Environment_Fallback');
        }
        if (embeddedTexturesStarted) return;
        embeddedTexturesStarted = true;
        const generation = ++embeddedTextureGeneration;
        vanillaSunTexture = createEmbeddedTexture(
            VANILLA_SUN_TEXTURE,
            'Lightflow_Vanilla_Sun',
            { generation }
        );
        vibrantVisualsSunTexture = createEmbeddedTexture(
            VIBRANT_VISUALS_SUN_TEXTURE,
            'Lightflow_Vibrant_Visuals_Sun',
            { generation }
        );
        vanillaMoonPhasesTexture = createEmbeddedTexture(
            VANILLA_MOON_PHASES_TEXTURE,
            'Lightflow_Vanilla_Moon_Phases',
            { generation }
        );
        vanillaCloudTexture = createEmbeddedTexture(
            VANILLA_CLOUDS,
            'Lightflow_Vanilla_Clouds',
            { repeat: true, generation }
        );
    }

    function getSunDirection(timeValue = settings.time) {
        const angle = mod(timeValue, 24000) / 24000 * TWO_PI;
        const azimuth = settings.sun_azimuth / 180 * Math.PI;
        const horizontal = Math.cos(angle);
        return [
            horizontal * Math.cos(azimuth),
            Math.sin(angle),
            horizontal * Math.sin(azimuth)
        ];
    }

    function getCloudMotionTime() {
        return performance.now() * 0.001 * settings.cloud_speed;
    }

    function getLightingState() {
        const preset = getPalette();
        const sunDirection = getSunDirection();
        const sunHeight = sunDirection[1];
        const daylight = smoothstep(-0.12, 0.16, sunHeight);
        const night = 1 - smoothstep(-0.28, 0.04, sunHeight);
        const twilight = clamp(1 - Math.abs(sunHeight) / 0.28, 0, 1) * (1 - night * 0.35);

        let zenith = mixColor(hexToRgb(preset.night_zenith), hexToRgb(preset.zenith), daylight);
        let horizon = mixColor(hexToRgb(preset.night_horizon), hexToRgb(preset.horizon), daylight);
        zenith = mixColor(zenith, hexToRgb(preset.sunrise_zenith), twilight * 0.72);
        horizon = mixColor(horizon, hexToRgb(preset.sunrise_horizon), twilight);
        const ground = mixColor(hexToRgb('#0a0c16'), hexToRgb(preset.ground), daylight);
        const ambientColor = mixColor(zenith, horizon, 0.58);
        const ambientIntensity = (preset.ambient_night +
            (preset.ambient_day - preset.ambient_night) * daylight) * settings.environment_strength;
        const celestialDirection = sunHeight >= -0.04 ? sunDirection : sunDirection.map(value => -value);
        const sunColor = sunHeight >= -0.04 ? hexToRgb(preset.sun) : hexToRgb(preset.moon);
        const sunIntensity = settings.sun_enabled
            ? (sunHeight >= -0.04 ? settings.sun_intensity * daylight : settings.moon_intensity * night)
            : 0;

        return {
            enabled: !!settings.enabled,
            preset: settings.preset,
            time: settings.time,
            daylight,
            night,
            twilight,
            sunDirection,
            celestialDirection,
            sunColor,
            sunIntensity,
            celestialSize: settings.celestial_size,
            sunHorizonScale: settings.sun_horizon_scale,
            sunGazeScale: settings.sun_gaze_scale,
            sunGlare: settings.sun_glare,
            sunsetDirectionalGlow: settings.sunset_directional_glow,
            zenithColor: multiplyColor(zenith, settings.sky_intensity),
            horizonColor: multiplyColor(horizon, settings.sky_intensity),
            groundColor: multiplyColor(ground, settings.sky_intensity),
            cloudColor: hexToRgb(preset.cloud),
            cloudCoverage: settings.cloud_coverage,
            cloudOpacity: settings.clouds_enabled ? settings.cloud_opacity : 0,
            cloudMode: settings.cloud_mode,
            cloudScale: settings.cloud_scale,
            cloudDirection: settings.cloud_direction,
            cloudContrast: settings.cloud_contrast,
            cloudBrightness: settings.cloud_brightness,
            cloudHeight: settings.cloud_height,
            cloudThickness: settings.cloud_thickness,
            cloudExtrusion: settings.cloud_extrusion,
            cloudTime: getCloudMotionTime(),
            skyGradientPower: settings.sky_gradient_power,
            starDensity: settings.star_density,
            vibrant: settings.preset === 'vibrant_visuals',
            ambientColor,
            ambientIntensity,
            environmentIntensity: settings.environment_strength,
            pixelatedShadows: settings.pixelated_shadows,
            pixelShadowSteps: settings.pixel_shadow_steps,
            pixelShadowScale: settings.pixel_shadow_scale
        };
    }

    const SKY_VERTEX = [
        'varying vec3 vSkyDirection;',
        'void main() {',
        '    vSkyDirection = normalize(position);',
        '    mat4 rotationOnlyView = mat4(mat3(modelViewMatrix));',
        '    vec4 clipPosition = projectionMatrix * rotationOnlyView * vec4(position, 1.0);',
        '    gl_Position = clipPosition.xyww;',
        '}'
    ].join('\n');

    const SKY_FRAGMENT = [
        'precision highp float;',
        'uniform vec3 uZenith;',
        'uniform vec3 uHorizon;',
        'uniform vec3 uGround;',
        'uniform vec3 uSunDirection;',
        'uniform vec3 uViewDirection;',
        'uniform vec3 uSunColor;',
        'uniform vec3 uMoonColor;',
        'uniform vec3 uSunsetColor;',
        'uniform float uDaylight;',
        'uniform float uNight;',
        'uniform float uTwilight;',
        'uniform float uCelestialSize;',
        'uniform float uMoonPhase;',
        'uniform float uMoonPhaseOffset;',
        'uniform vec2 uMoonAtlasGrid;',
        'uniform float uVibrant;',
        'uniform float uSkyGradientPower;',
        'uniform float uSunHorizonScale;',
        'uniform float uSunGazeScale;',
        'uniform float uSunGlare;',
        'uniform float uSunsetDirectionalGlow;',
        'uniform int uSunMode;',
        'uniform int uMoonMode;',
        'uniform sampler2D uSunTexture;',
        'uniform sampler2D uMoonTexture;',
        'varying vec3 vSkyDirection;',
        'float saturate(float value) { return clamp(value, 0.0, 1.0); }',
        'vec3 horizontalDirection(vec3 direction) {',
        '    vec3 horizontal = vec3(direction.x, 0.0, direction.z);',
        '    float lengthSquared = dot(horizontal, horizontal);',
        '    return lengthSquared > .000001 ? horizontal * inversesqrt(lengthSquared) : vec3(1,0,0);',
        '}',
        'vec2 celestialCoordinates(vec3 direction, vec3 center) {',
        '    vec3 normalizedCenter = normalize(center);',
        '    vec3 reference = abs(normalizedCenter.y) > .96 ? vec3(1.0,0.0,0.0) : vec3(0.0,1.0,0.0);',
        '    vec3 tangent = normalize(cross(reference, normalizedCenter));',
        '    vec3 bitangent = normalize(cross(normalizedCenter, tangent));',
        '    float forward = max(dot(direction, normalizedCenter), .0001);',
        '    return vec2(dot(direction, tangent), dot(direction, bitangent)) / forward;',
        '}',
        'float celestialMask(vec4 texel) {',
        '    float rgbMask = step(.001, max(texel.r, max(texel.g, texel.b)));',
        '    return texel.a < .999 ? texel.a : rgbMask;',
        '}',
        'vec4 sampleMoonAtlas(vec2 localUv) {',
        '    vec2 grid = max(floor(uMoonAtlasGrid + .5), vec2(1.0));',
        '    float frameCount = max(grid.x * grid.y, 1.0);',
        '    float frame = mod(floor(uMoonPhase + uMoonPhaseOffset + .5), frameCount);',
        '    if (frame < 0.0) frame += frameCount;',
        '    vec2 cell = vec2(mod(frame, grid.x), floor(frame / grid.x));',
        '    vec2 safeUv = clamp(localUv, vec2(.001), vec2(.999));',
        '    return texture2D(uMoonTexture, (cell + safeUv) / grid);',
        '}',
        'void main() {',
        '    vec3 direction = normalize(vSkyDirection);',
        '    float up = direction.y;',
        '    float horizon = pow(1.0-saturate(abs(up)),max(.1,uSkyGradientPower+uVibrant*1.1));',
        '    vec3 color = up >= 0.0 ? mix(uZenith,uHorizon,horizon) : mix(uGround,uHorizon,exp(up*7.0));',
        '',
        '    vec3 sunHorizontal = horizontalDirection(uSunDirection);',
        '    vec3 viewHorizontal = horizontalDirection(direction);',
        '    float sunFacing = pow(saturate(dot(viewHorizontal,sunHorizontal)), 4.0);',
        '    float horizonBand = exp(-abs(up)*7.5);',
        '    float directionalSunset = uTwilight * horizonBand * sunFacing * uSunsetDirectionalGlow;',
        '    color += uSunsetColor * directionalSunset * (.44 + .18*uVibrant);',
        '',
        '    float horizonGrowth = 1.0-smoothstep(.035,.32,abs(uSunDirection.y));',
        '    float gazeAlignment = pow(saturate(dot(normalize(uViewDirection),uSunDirection)), 52.0);',
        '    float sunScale = mix(1.0,uSunHorizonScale,horizonGrowth) * mix(1.0,uSunGazeScale,gazeAlignment);',
        '    vec2 sunCoord = celestialCoordinates(direction,uSunDirection);',
        '    vec2 sunLocal = vec2(.5 + sunCoord.x/max(uCelestialSize*2.0*sunScale,.001), .5 - sunCoord.y/max(uCelestialSize*2.0*sunScale,.001));',
        '    float sunInside = step(0.0,sunLocal.x)*step(sunLocal.x,1.0)*step(0.0,sunLocal.y)*step(sunLocal.y,1.0);',
        '    vec4 sunTexel = texture2D(uSunTexture,clamp(sunLocal,0.0,1.0));',
        '    float sunVisibility = smoothstep(-.055,.015,uSunDirection.y);',
        '    float sunAlpha = uSunMode == 1 ? sunInside*celestialMask(sunTexel)*sunVisibility : 0.0;',
        '    vec3 sunDisplay = sunTexel.rgb*uSunColor;',
        '    color += sunDisplay * sunAlpha * uDaylight;',
        '    float sunAngle = saturate(dot(direction,uSunDirection));',
        '    float tightGlare = pow(sunAngle, mix(540.0,250.0,horizonGrowth));',
        '    float broadGlare = pow(sunAngle, mix(38.0,18.0,horizonGrowth));',
        '    color += uSunColor * uDaylight * uSunGlare * sunVisibility * (tightGlare*.58 + broadGlare*.12) * (1.0+.45*gazeAlignment);',
        '',
        '    vec3 moonDirection = -uSunDirection;',
        '    vec2 moonCoord = celestialCoordinates(direction,moonDirection);',
        '    vec2 moonLocal = vec2(.5 + moonCoord.x/max(uCelestialSize*2.0,.001), .5 - moonCoord.y/max(uCelestialSize*2.0,.001));',
        '    float moonInside = step(0.0,moonLocal.x)*step(moonLocal.x,1.0)*step(0.0,moonLocal.y)*step(moonLocal.y,1.0);',
        '    vec4 moonTexel = uMoonMode == 1 ? sampleMoonAtlas(moonLocal) : texture2D(uMoonTexture,clamp(moonLocal,0.0,1.0));',
        '    float moonVisibility = smoothstep(-.055,.015,moonDirection.y);',
        '    float moonAlpha = uMoonMode > 0 ? moonInside*celestialMask(moonTexel)*moonVisibility : 0.0;',
        '    color += moonTexel.rgb*uMoonColor*moonAlpha*uNight;',
        '',
        '    gl_FragColor = vec4(max(color,vec3(0)),1);',
        '}'
    ].join('\n');


    const STAR_VERTEX = [
        'precision highp float;',
        'varying vec3 vStarDirection;',
        'void main() {',
        '    vStarDirection = normalize(mat3(modelMatrix) * position);',
        '    mat4 rotationOnlyView = mat4(mat3(modelViewMatrix));',
        '    vec4 clipPosition = projectionMatrix * rotationOnlyView * vec4(position, 1.0);',
        '    gl_Position = clipPosition.xyww;',
        '}'
    ].join('\n');

    const STAR_FRAGMENT = [
        'precision highp float;',
        'uniform float uOpacity;',
        'uniform vec3 uMoonDirection;',
        'uniform float uCelestialRadius;',
        'varying vec3 vStarDirection;',
        'void main() {',
        '    vec3 direction = normalize(vStarDirection);',
        '    if(direction.y <= .015) discard;',
        '    if(dot(direction,normalize(uMoonDirection)) > cos(max(uCelestialRadius, .001) * 1.42)) discard;',
        '    gl_FragColor = vec4(vec3(1.0), clamp(uOpacity, 0.0, 1.0));',
        '}'
    ].join('\n');

    const CLOUD_VERTEX = [
        'varying vec3 vSkyDirection;',
        'void main() {',
        '    vSkyDirection = normalize(position);',
        '    mat4 rotationOnlyView = mat4(mat3(modelViewMatrix));',
        '    vec4 clipPosition = projectionMatrix * rotationOnlyView * vec4(position, 1.0);',
        '    gl_Position = clipPosition.xyww;',
        '}'
    ].join('\n');

    /*
     * Fancy Vanilla clouds are columns created from cloud-texture cells. This
     * shader traverses those cells with a 2D DDA while the ray is inside the
     * cloud slab, so silhouettes and side faces are geometrically coherent
     * instead of being inferred from a few displaced texture samples.
     */
    const CLOUD_FRAGMENT = [
        'precision highp float;',
        'uniform vec3 uCameraWorldPosition;',
        'uniform vec3 uCloudColor;',
        'uniform vec3 uSunsetColor;',
        'uniform vec3 uSunDirection;',
        'uniform float uDaylight;',
        'uniform float uNight;',
        'uniform float uTwilight;',
        'uniform float uCloudCoverage;',
        'uniform float uCloudOpacity;',
        'uniform float uCloudTime;',
        'uniform float uCloudScale;',
        'uniform float uCloudDirection;',
        'uniform float uCloudContrast;',
        'uniform float uCloudBrightness;',
        'uniform float uCloudHeight;',
        'uniform float uCloudThickness;',
        'uniform float uCloudExtrusion;',
        'uniform int uCloudMode;',
        'uniform sampler2D uCloudTexture;',
        'uniform vec2 uCloudTextureSize;',
        'varying vec3 vSkyDirection;',
        'float saturate(float value) { return clamp(value, 0.0, 1.0); }',
        'float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
        'float valueNoise(vec2 p) {',
        '    vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);',
        '    return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);',
        '}',
        'float blockClouds(vec2 p) {',
        '    p = floor(p * 0.5) * 0.5;',
        '    return valueNoise(p*.18)*.58 + valueNoise(p*.43+17.0)*.28 + valueNoise(p*.91+31.0)*.14;',
        '}',
        'float textureAlpha(vec4 texel) {',
        '    float luminance = dot(texel.rgb, vec3(.299,.587,.114));',
        '    return texel.a < .999 ? texel.a : luminance;',
        '}',
        'vec2 wrapCell(vec2 cell, vec2 size) {',
        '    return mod(mod(cell,size)+size,size);',
        '}',
        'float cloudSourceCell(vec2 cell) {',
        '    if(uCloudMode == 0) return blockClouds(cell);',
        '    vec2 size = max(floor(uCloudTextureSize + .5), vec2(1.0));',
        '    vec2 uv = (wrapCell(cell,size)+.5)/size;',
        '    return textureAlpha(texture2D(uCloudTexture,uv));',
        '}',
        'float cloudCell(vec2 cell) {',
        '    float source = saturate((cloudSourceCell(cell)-.5)*uCloudContrast+.5);',
        '    return step(.0001,uCloudCoverage)*step(1.0-uCloudCoverage,source);',
        '}',
        'vec3 horizontalDirection(vec3 direction) {',
        '    vec3 horizontal = vec3(direction.x,0.0,direction.z);',
        '    float lengthSquared = dot(horizontal,horizontal);',
        '    return lengthSquared > .000001 ? horizontal*inversesqrt(lengthSquared) : vec3(1,0,0);',
        '}',
        'void main() {',
        '    vec3 ray = normalize(vSkyDirection);',
        '    if(abs(ray.y)<.0005 || uCloudOpacity<=0.0) discard;',
        '    float extrusion = mix(.025,1.0,saturate(uCloudExtrusion));',
        '    float baseHeight = uCloudHeight;',
        '    float topHeight = baseHeight + max(.05,uCloudThickness*extrusion);',
        '    float firstPlane = (baseHeight-uCameraWorldPosition.y)/ray.y;',
        '    float secondPlane = (topHeight-uCameraWorldPosition.y)/ray.y;',
        '    float tEnter = max(min(firstPlane,secondPlane),0.0);',
        '    float tExit = max(firstPlane,secondPlane);',
        '    if(tExit<=tEnter || tExit<=0.0) discard;',
        '    float maxDistance = 1536.0/max(.35,sqrt(max(uCloudScale,.01)));',
        '    tExit = min(tExit,maxDistance);',
        '    if(tExit<=tEnter) discard;',
        '    float cellSize = 12.0/max(uCloudScale,.01);',
        '    vec2 motionDirection = vec2(cos(uCloudDirection),sin(uCloudDirection));',
        '    vec2 motion = motionDirection*uCloudTime*24.0;',
        '    float epsilon = min(.01,cellSize*.0005);',
        '    float t = tEnter+epsilon;',
        '    vec2 world = uCameraWorldPosition.xz+ray.xz*t+motion;',
        '    vec2 cell = floor(world/cellSize);',
        '    vec2 stepDirection = sign(ray.xz);',
        '    vec2 boundary = vec2(stepDirection.x>0.0 ? (cell.x+1.0)*cellSize : cell.x*cellSize, stepDirection.y>0.0 ? (cell.y+1.0)*cellSize : cell.y*cellSize);',
        '    float tMaxX = abs(ray.x)<.000001 ? 1.0e20 : t+(boundary.x-world.x)/ray.x;',
        '    float tMaxZ = abs(ray.z)<.000001 ? 1.0e20 : t+(boundary.y-world.y)/ray.z;',
        '    vec2 tMax = vec2(tMaxX,tMaxZ);',
        '    vec2 tDelta = vec2(abs(ray.x)<.000001 ? 1.0e20 : cellSize/abs(ray.x), abs(ray.z)<.000001 ? 1.0e20 : cellSize/abs(ray.z));',
        '    vec3 hitNormal = ray.y>0.0 ? vec3(0,-1,0) : vec3(0,1,0);',
        '    float hitDistance = tEnter;',
        '    float hit = cloudCell(cell);',
        '    for(int iteration=0; iteration<112; ++iteration) {',
        '        if(hit>.5) break;',
        '        if(tMax.x<tMax.y) {',
        '            hitDistance=tMax.x;',
        '            if(hitDistance>tExit) break;',
        '            cell.x+=stepDirection.x;',
        '            tMax.x+=tDelta.x;',
        '            hitNormal=vec3(-stepDirection.x,0,0);',
        '        } else {',
        '            hitDistance=tMax.y;',
        '            if(hitDistance>tExit) break;',
        '            cell.y+=stepDirection.y;',
        '            tMax.y+=tDelta.y;',
        '            hitNormal=vec3(0,0,-stepDirection.y);',
        '        }',
        '        hit=cloudCell(cell);',
        '    }',
        '    if(hit<.5 || hitDistance>tExit) discard;',
        '    float faceLight = hitNormal.y>.5 ? 1.0 : (hitNormal.y<-.5 ? .70 : (abs(hitNormal.x)>.5 ? .90 : .80));',
        '    vec3 dayColor = uCloudColor*mix(.43,1.0,uDaylight);',
        '    vec3 nightColor = uCloudColor*vec3(.16,.19,.27);',
        '    vec3 cloudColor = mix(nightColor,dayColor,1.0-uNight*.72)*faceLight*uCloudBrightness;',
        '    vec3 sunHorizontal = horizontalDirection(uSunDirection);',
        '    vec3 hitDirection = horizontalDirection(uCameraWorldPosition+ray*hitDistance);',
        '    float sunsetFacing = pow(saturate(dot(hitDirection,sunHorizontal)),3.0);',
        '    cloudColor = mix(cloudColor,uSunsetColor*faceLight,uTwilight*sunsetFacing*.34);',
        '    float distanceFade = 1.0-smoothstep(maxDistance*.70,maxDistance,hitDistance);',
        '    float horizonFade = smoothstep(.002,.035,abs(ray.y));',
        '    float alpha = uCloudOpacity*distanceFade*horizonFade;',
        '    gl_FragColor = vec4(max(cloudColor,vec3(0.0)),alpha);',
        '}'
    ].join('\n');

    class JavaRandom {
        constructor(seed) {
            this.mask = (1n << 48n) - 1n;
            this.seed = (BigInt(seed) ^ 0x5DEECE66Dn) & this.mask;
        }
        next(bits) {
            this.seed = (this.seed * 0x5DEECE66Dn + 0xBn) & this.mask;
            return Number(this.seed >> BigInt(48 - bits));
        }
        nextFloat() {
            return this.next(24) / 16777216;
        }
        nextDouble() {
            return (this.next(26) * 134217728 + this.next(27)) / 9007199254740992;
        }
    }

    function createVanillaStarGeometry(maxAttempts = 6000) {
        const random = new JavaRandom(10842);
        const positions = [];
        const indices = [];
        const attemptCounts = new Uint32Array(maxAttempts + 1);
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            let x = random.nextFloat() * 2 - 1;
            let y = random.nextFloat() * 2 - 1;
            let z = random.nextFloat() * 2 - 1;
            const size = 0.15 + random.nextFloat() * 0.1;
            let lengthSquared = x * x + y * y + z * z;
            if (lengthSquared < 1 && lengthSquared > 0.01) {
                const inverseLength = 1 / Math.sqrt(lengthSquared);
                x *= inverseLength;
                y *= inverseLength;
                z *= inverseLength;
                const centerX = x * 100;
                const centerY = y * 100;
                const centerZ = z * 100;
                const longitude = Math.atan2(x, z);
                const sinLongitude = Math.sin(longitude);
                const cosLongitude = Math.cos(longitude);
                const latitude = Math.atan2(Math.sqrt(x * x + z * z), y);
                const sinLatitude = Math.sin(latitude);
                const cosLatitude = Math.cos(latitude);
                const roll = random.nextDouble() * TWO_PI;
                const sinRoll = Math.sin(roll);
                const cosRoll = Math.cos(roll);
                const firstVertex = positions.length / 3;
                for (let corner = 0; corner < 4; corner++) {
                    const localX = ((corner & 2) - 1) * size;
                    const localY = (((corner + 1) & 2) - 1) * size;
                    const rotatedX = localX * cosRoll - localY * sinRoll;
                    const rotatedY = localY * cosRoll + localX * sinRoll;
                    const vertical = rotatedX * sinLatitude;
                    const radial = -rotatedX * cosLatitude;
                    const offsetX = radial * sinLongitude - rotatedY * cosLongitude;
                    const offsetZ = rotatedY * sinLongitude + radial * cosLongitude;
                    positions.push(centerX + offsetX, centerY + vertical, centerZ + offsetZ);
                }
                indices.push(firstVertex, firstVertex + 1, firstVertex + 2, firstVertex, firstVertex + 2, firstVertex + 3);
            }
            attemptCounts[attempt + 1] = indices.length;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();
        return { geometry, attemptCounts };
    }

    function createVanillaStars() {
        if (!window.THREE || !window.Canvas?.scene || starMesh) return;
        const generated = createVanillaStarGeometry();
        starAttemptIndexCounts = generated.attemptCounts;
        starMaterial = new THREE.ShaderMaterial({
            name: 'Lightflow_Vanilla_Stars',
            uniforms: {
                uOpacity: { value: 0 },
                uMoonDirection: { value: new THREE.Vector3(0, -1, 0) },
                uCelestialRadius: { value: settings.celestial_size }
            },
            vertexShader: STAR_VERTEX,
            fragmentShader: STAR_FRAGMENT,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            fog: false,
            toneMapped: false
        });
        starMesh = new THREE.Mesh(generated.geometry, starMaterial);
        starMesh.name = 'Lightflow Vanilla Stars';
        starMesh.frustumCulled = false;
        starMesh.renderOrder = -99999;
        starMesh.userData.lightflowEnvironment = true;
        Canvas.scene.add(starMesh);
    }

    function getTextureSize(texture, fallbackWidth = 256, fallbackHeight = 256) {
        const image = texture?.image || texture?.source?.data;
        return [
            Math.max(1, finite(image?.naturalWidth || image?.videoWidth || image?.width, fallbackWidth)),
            Math.max(1, finite(image?.naturalHeight || image?.videoHeight || image?.height, fallbackHeight))
        ];
    }

    function createVoxelClouds() {
        if (!window.THREE || !window.Canvas?.scene || cloudMesh) return;
        cloudMaterial = new THREE.ShaderMaterial({
            name: 'Lightflow_Vanilla_Voxel_Clouds',
            uniforms: {
                uCameraWorldPosition: { value: new THREE.Vector3() },
                uCloudColor: { value: new THREE.Color(0xf3f5f7) },
                uSunsetColor: { value: new THREE.Color(0xf59a62) },
                uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
                uDaylight: { value: 1 },
                uNight: { value: 0 },
                uTwilight: { value: 0 },
                uCloudCoverage: { value: settings.cloud_coverage },
                uCloudOpacity: { value: settings.cloud_opacity },
                uCloudTime: { value: 0 },
                uCloudScale: { value: settings.cloud_scale },
                uCloudDirection: { value: settings.cloud_direction / 180 * Math.PI },
                uCloudContrast: { value: settings.cloud_contrast },
                uCloudBrightness: { value: settings.cloud_brightness },
                uCloudHeight: { value: settings.cloud_height },
                uCloudThickness: { value: settings.cloud_thickness },
                uCloudExtrusion: { value: settings.cloud_extrusion },
                uCloudMode: { value: 1 },
                uCloudTexture: { value: vanillaCloudTexture || fallbackTexture },
                uCloudTextureSize: { value: new THREE.Vector2(256, 256) }
            },
            vertexShader: CLOUD_VERTEX,
            fragmentShader: CLOUD_FRAGMENT,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            side: THREE.BackSide,
            fog: false,
            toneMapped: false
        });
        cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), cloudMaterial);
        cloudMesh.name = 'Lightflow Vanilla Voxel Clouds';
        cloudMesh.frustumCulled = false;
        cloudMesh.renderOrder = -99998;
        cloudMesh.userData.lightflowEnvironment = true;
        cloudMesh.onBeforeRender = (renderer, scene, camera) => {
            if (!cloudMaterial || !camera) return;
            camera.getWorldPosition?.(cloudMaterial.uniforms.uCameraWorldPosition.value);
        };
        Canvas.scene.add(cloudMesh);
    }

    function updateVanillaStars(state) {
        if (!starMesh || !starMaterial || !starAttemptIndexCounts) return;
        const attempts = Math.round(clamp(settings.star_density, .1, 4) * 1500);
        const safeAttempt = Math.min(attempts, starAttemptIndexCounts.length - 1);
        starMesh.geometry.setDrawRange(0, starAttemptIndexCounts[safeAttempt]);
        starMaterial.uniforms.uOpacity.value = settings.stars_enabled
            ? clamp(state.night * settings.star_brightness, 0, 1)
            : 0;
        starMaterial.uniforms.uMoonDirection.value.fromArray(state.sunDirection).multiplyScalar(-1);
        starMaterial.uniforms.uCelestialRadius.value = settings.celestial_size;
        starMesh.visible = !!(settings.enabled && settings.stars_enabled && starMaterial.uniforms.uOpacity.value > .0005);
        const orbit = mod(settings.time, 24000) / 24000 * TWO_PI;
        const azimuth = settings.sun_azimuth / 180 * Math.PI;
        const orbitRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), orbit);
        const azimuthRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -azimuth);
        starMesh.quaternion.copy(azimuthRotation).multiply(orbitRotation);
    }

    function createSky() {
        if (!window.THREE || !window.Canvas?.scene) return false;
        if (skyMesh) {
            createVanillaStars();
            createVoxelClouds();
            return false;
        }
        ensureSkyTextures();
        skyMaterial = new THREE.ShaderMaterial({
            name: 'Lightflow_Minecraft_Sky',
            uniforms: {
                uZenith: { value: new THREE.Color(0x78a7ff) },
                uHorizon: { value: new THREE.Color(0xb8d2ff) },
                uGround: { value: new THREE.Color(0x536b78) },
                uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
                uViewDirection: { value: new THREE.Vector3(0, 0, -1) },
                uCameraWorldPosition: { value: new THREE.Vector3() },
                uSunColor: { value: new THREE.Color(0xfff3c4) },
                uMoonColor: { value: new THREE.Color(0xdbe4ff) },
                uCloudColor: { value: new THREE.Color(0xf3f5f7) },
                uSunsetColor: { value: new THREE.Color(0xf59a62) },
                uDaylight: { value: 1 },
                uNight: { value: 0 },
                uTwilight: { value: 0 },
                uCelestialSize: { value: settings.celestial_size },
                uMoonPhase: { value: settings.moon_phase },
                uMoonPhaseOffset: { value: settings.moon_phase_offset },
                uMoonAtlasGrid: { value: new THREE.Vector2(4, 2) },
                uStars: { value: settings.star_brightness },
                uCloudCoverage: { value: settings.cloud_coverage },
                uCloudOpacity: { value: settings.cloud_opacity },
                uCloudTime: { value: 0 },
                uVibrant: { value: 0 },
                uSkyGradientPower: { value: settings.sky_gradient_power },
                uStarDensity: { value: settings.star_density },
                uSunHorizonScale: { value: settings.sun_horizon_scale },
                uSunGazeScale: { value: settings.sun_gaze_scale },
                uSunGlare: { value: settings.sun_glare },
                uSunsetDirectionalGlow: { value: settings.sunset_directional_glow },
                uSunMode: { value: 1 },
                uMoonMode: { value: 1 },
                uCloudMode: { value: 1 },
                uSunTexture: { value: vanillaSunTexture || fallbackTexture },
                uMoonTexture: { value: vanillaMoonPhasesTexture || fallbackTexture },
                uCloudTexture: { value: vanillaCloudTexture || fallbackTexture },
                uCloudScale: { value: settings.cloud_scale },
                uCloudDirection: { value: settings.cloud_direction / 180 * Math.PI },
                uCloudContrast: { value: settings.cloud_contrast },
                uCloudBrightness: { value: settings.cloud_brightness },
                uCloudHeight: { value: settings.cloud_height },
                uCloudThickness: { value: settings.cloud_thickness },
                uCloudExtrusion: { value: settings.cloud_extrusion }
            },
            vertexShader: SKY_VERTEX,
            fragmentShader: SKY_FRAGMENT,
            side: THREE.BackSide,
            depthWrite: false,
            depthTest: false,
            fog: false,
            transparent: false,
            toneMapped: false
        });
        skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), skyMaterial);
        skyMesh.name = 'Lightflow Environment Sky';
        skyMesh.frustumCulled = false;
        skyMesh.renderOrder = -100000;
        skyMesh.userData.lightflowEnvironment = true;
        skyMesh.onBeforeRender = (renderer, scene, camera) => {
            if (!skyMaterial || !camera) return;
            camera.getWorldDirection?.(skyMaterial.uniforms.uViewDirection.value);
            camera.getWorldPosition?.(skyMaterial.uniforms.uCameraWorldPosition.value);
        };
        Canvas.scene.add(skyMesh);
        createVanillaStars();
        createVoxelClouds();
        return true;
    }

    function ensureSunLightParent() {
        if (!sunLight || !sunTarget || !window.Canvas?.scene) return;
        const preferredParent = window.three_lights_group || Canvas.scene;
        if (sunLight.parent !== preferredParent) preferredParent.add(sunLight);
        if (sunTarget.parent !== preferredParent) preferredParent.add(sunTarget);
        window.three_lights = window.three_lights || {};
        window.three_lights[sunLight.uuid] = sunLight;
    }

    function createSunLight() {
        if (!window.THREE || !window.Canvas?.scene || sunLight) return false;
        sunLight = new THREE.DirectionalLight(0xfff3c4, 1);
        sunLight.name = 'Lightflow Environment Sun';
        sunLight.userData.lightflowEnvironment = true;
        sunLight.userData.lightflowEnvironmentVirtual = true;
        sunTarget = new THREE.Object3D();
        sunTarget.name = 'Lightflow Environment Sun Target';
        sunLight.target = sunTarget;
        ensureSunLightParent();
        configureSunShadow(true);
        publishWindowBinding('LightflowEnvironmentSunLight', sunLight);
        return true;
    }

    function getActiveShadowFrustum() {
        return effectiveShadowFrustum || {
            area: settings.shadow_area,
            near: settings.shadow_near,
            far: settings.shadow_far
        };
    }

    function getShadowViewQuaternion(position, target) {
        const matrix = new THREE.Matrix4();
        matrix.lookAt(position, target, new THREE.Vector3(0, 1, 0));
        return new THREE.Quaternion().setFromRotationMatrix(matrix);
    }

    function buildShadowFrustumWorldCorners(frustum, position, quaternion) {
        const area = Math.max(0.001, finite(frustum.area, settings.shadow_area));
        const near = Math.max(0.001, finite(frustum.near, settings.shadow_near));
        const far = Math.max(near + 0.001, finite(frustum.far, settings.shadow_far));
        const corners = [];
        [-near, -far].forEach(z => {
            [-area, area].forEach(x => {
                [-area, area].forEach(y => {
                    corners.push(new THREE.Vector3(x, y, z).applyQuaternion(quaternion).add(position));
                });
            });
        });
        return corners;
    }

    function getBoxWorldCorners(box) {
        const min = box.min;
        const max = box.max;
        return [
            new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(max.x, min.y, min.z),
            new THREE.Vector3(max.x, max.y, min.z), new THREE.Vector3(min.x, max.y, min.z),
            new THREE.Vector3(min.x, min.y, max.z), new THREE.Vector3(max.x, min.y, max.z),
            new THREE.Vector3(max.x, max.y, max.z), new THREE.Vector3(min.x, max.y, max.z)
        ];
    }

    function getWorldAlignedShadowCorners(corners) {
        const box = new THREE.Box3().setFromPoints(corners);
        return box.isEmpty() ? [] : getBoxWorldCorners(box);
    }

    function getReferenceShadowFitCorners() {
        const referenceDirection = new THREE.Vector3().fromArray(getSunDirection(6000)).normalize();
        const referenceDistance = Math.max(160, settings.shadow_far * 0.38);
        const position = referenceDirection.multiplyScalar(referenceDistance);
        const target = new THREE.Vector3(0, 0, 0);
        const quaternion = getShadowViewQuaternion(position, target);
        return getWorldAlignedShadowCorners(buildShadowFrustumWorldCorners({
            area: settings.shadow_area,
            near: settings.shadow_near,
            far: settings.shadow_far
        }, position, quaternion));
    }

    function getShadowFitCorners() {
        if (Array.isArray(settings.shadow_fit_corners) && settings.shadow_fit_corners.length === 24) {
            const corners = [];
            for (let index = 0; index < settings.shadow_fit_corners.length; index += 3) {
                corners.push(new THREE.Vector3(
                    settings.shadow_fit_corners[index],
                    settings.shadow_fit_corners[index + 1],
                    settings.shadow_fit_corners[index + 2]
                ));
            }
            return getWorldAlignedShadowCorners(corners);
        }
        return getReferenceShadowFitCorners();
    }

    function updateSunShadowPlacement(celestialDirection) {
        if (!sunLight || !sunTarget) return;
        const direction = new THREE.Vector3().fromArray(celestialDirection);
        if (direction.lengthSq() < 1e-8) direction.set(0, 1, 0);
        else direction.normalize();

        /*
         * The marked region stays fixed in world space. Only the directional
         * shadow camera moves with the celestial light, so refit its symmetric
         * orthographic bounds and depth range around the same eight corners.
        */
        const fitCorners = settings.shadow_auto_fit ? getShadowFitCorners() : null;
        const targetPosition = fitCorners
            ? new THREE.Box3().setFromPoints(fitCorners).getCenter(new THREE.Vector3())
            : new THREE.Vector3(0, 0, 0);
        const nearestRegionProjection = fitCorners
            ? fitCorners.reduce((projection, corner) => Math.max(
                projection,
                corner.clone().sub(targetPosition).dot(direction)
            ), -Infinity)
            : 0;
        const distance = settings.shadow_auto_fit
            ? Math.max(160, nearestRegionProjection + 1)
            : Math.max(160, settings.shadow_far * 0.38);
        const lightPosition = targetPosition.clone().add(direction.multiplyScalar(distance));
        sunLight.position.copy(lightPosition);
        sunTarget.position.copy(targetPosition);
        sunLight.updateMatrixWorld(true);
        sunTarget.updateMatrixWorld(true);

        if (!fitCorners) {
            effectiveShadowFrustum = {
                area: settings.shadow_area,
                near: settings.shadow_near,
                far: settings.shadow_far
            };
            return;
        }

        const viewQuaternion = getShadowViewQuaternion(lightPosition, targetPosition);
        const inverseViewQuaternion = viewQuaternion.clone().invert();
        let area = 0;
        let near = Infinity;
        let far = -Infinity;
        fitCorners.forEach(corner => {
            const local = corner.clone().sub(lightPosition).applyQuaternion(inverseViewQuaternion);
            area = Math.max(area, Math.abs(local.x), Math.abs(local.y));
            const depth = -local.z;
            near = Math.min(near, depth);
            far = Math.max(far, depth);
        });

        const lateralPadding = Math.max(0.25, area * 0.015);
        const depthSpan = Math.max(1, far - near);
        const depthPadding = Math.max(0.5, depthSpan * 0.01);
        effectiveShadowFrustum = {
            area: Math.max(2, area + lateralPadding),
            near: Math.max(0.001, near - depthPadding),
            far: Math.max(Math.max(0.001, near - depthPadding) + 1, far + depthPadding)
        };
    }

    function captureShadowFitRegion(frustum) {
        if (!sunLight || !sunTarget) return;
        const position = new THREE.Vector3();
        const target = new THREE.Vector3();
        sunLight.getWorldPosition(position);
        sunTarget.getWorldPosition(target);
        if (sunShadowGizmoDrag?.viewPosition) position.copy(sunShadowGizmoDrag.viewPosition);
        const quaternion = sunShadowGizmoDrag?.viewQuaternion
            ? sunShadowGizmoDrag.viewQuaternion.clone()
            : sunShadowGizmo?.root
                ? sunShadowGizmo.root.quaternion.clone()
                : getShadowViewQuaternion(position, target);
        const corners = getWorldAlignedShadowCorners(
            buildShadowFrustumWorldCorners(frustum, position, quaternion)
        );
        settings.shadow_fit_corners = corners.flatMap(corner => corner.toArray());
    }

    function isSunShadowActive(state = getLightingState()) {
        return !!(
            state.enabled &&
            settings.sun_enabled &&
            settings.sun_cast_shadows &&
            state.sunIntensity > 0.0001
        );
    }

    function configureSunShadow(force, options = {}) {
        if (!sunLight?.shadow) return false;
        const renderer = window.Preview?.selected?.renderer || window.main_preview?.renderer;
        let maxTextureSize = 4096;
        try {
            const gl = renderer?.getContext?.();
            if (gl) maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || maxTextureSize;
        } catch (error) {
            // Use the conservative fallback.
        }
        const resolution = Math.min(settings.shadow_resolution, maxTextureSize);
        const frustum = getActiveShadowFrustum();
        const area = frustum.area;
        const shadow = sunLight.shadow;
        const state = options.state || getLightingState();
        // An intensity-zero environment sun must also leave Three's shadow
        // topology. Regular materials hide this naturally, but pixelated
        // shadow shaders sample the shadow map independently of direct light.
        const castsShadow = isSunShadowActive(state);
        const radius = settings.pixelated_shadows ? 0 : 1;
        const configSignature = [
            castsShadow ? 1 : 0,
            resolution,
            area,
            frustum.near,
            frustum.far,
            settings.shadow_bias,
            settings.shadow_normal_bias,
            radius
        ].map(value => Number(value).toFixed(5)).join('|');
        const configChanged = configSignature !== lastSunShadowConfig;
        const resolutionChanged = shadow.mapSize.width !== resolution || shadow.mapSize.height !== resolution;
        let cameraChanged = false;

        if (sunLight.castShadow !== castsShadow) sunLight.castShadow = castsShadow;
        if (resolutionChanged) {
            shadow.mapSize.set(resolution, resolution);
            if (shadow.map?.setSize) {
                shadow.map.setSize(resolution, resolution);
            } else if (shadow.map) {
                shadow.map.dispose?.();
                shadow.map = null;
            }
        }
        const cameraValues = {
            left: -area, right: area, top: area, bottom: -area,
            near: frustum.near, far: frustum.far
        };
        Object.entries(cameraValues).forEach(([key, value]) => {
            if (shadow.camera[key] === value) return;
            shadow.camera[key] = value;
            cameraChanged = true;
        });
        if (shadow.bias !== settings.shadow_bias) shadow.bias = settings.shadow_bias;
        if (shadow.normalBias !== settings.shadow_normal_bias) shadow.normalBias = settings.shadow_normal_bias;
        if (shadow.radius !== radius) shadow.radius = radius;
        if (cameraChanged) shadow.camera.updateProjectionMatrix?.();

        const direction = sunLight.position.clone().sub(sunTarget?.position || new THREE.Vector3()).normalize();
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const directionAngle = lastSunShadowDirection
            ? Math.acos(clamp(lastSunShadowDirection.dot(direction), -1, 1))
            : Infinity;
        const animatedDirectionDue = options.animation === true
            ? (directionAngle >= THREE.MathUtils.degToRad(0.35) || now - lastSunShadowRefresh >= 100)
            : directionAngle > 0.000001;
        const changed = !!(force || configChanged || resolutionChanged || cameraChanged || animatedDirectionDue);
        lastSunShadowConfig = configSignature;
        if (changed) {
            if (!lastSunShadowDirection) lastSunShadowDirection = new THREE.Vector3();
            lastSunShadowDirection.copy(direction);
            lastSunShadowRefresh = now;
            shadow.needsUpdate = true;
        }
        return changed;
    }

    function registerSunShadowCanvasGizmo(object) {
        if (!object || !window.Canvas || !Array.isArray(Canvas.gizmos)) return;
        if (!Canvas.gizmos.includes(object)) Canvas.gizmos.push(object);
    }

    function unregisterSunShadowCanvasGizmo(object) {
        if (!object || !window.Canvas || !Array.isArray(Canvas.gizmos)) return;
        const index = Canvas.gizmos.indexOf(object);
        if (index >= 0) Canvas.gizmos.splice(index, 1);
    }

    function pushSunShadowGizmoLine(vertices, a, b) {
        vertices.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }

    function getShadowFitBox() {
        return new THREE.Box3().setFromPoints(getShadowFitCorners());
    }

    function buildSunShadowGizmoVertices() {
        const size = getShadowFitBox().getSize(new THREE.Vector3()).multiplyScalar(0.5);
        const x = Math.max(0.001, size.x);
        const y = Math.max(0.001, size.y);
        const z = Math.max(0.001, size.z);
        const vertices = [];
        const corners = [
            [-x, -y, -z], [x, -y, -z],
            [x, y, -z], [-x, y, -z],
            [-x, -y, z], [x, -y, z],
            [x, y, z], [-x, y, z]
        ];
        [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7]
        ].forEach(edge => pushSunShadowGizmoLine(vertices, corners[edge[0]], corners[edge[1]]));
        pushSunShadowGizmoLine(vertices, [-x, 0, 0], [x, 0, 0]);
        pushSunShadowGizmoLine(vertices, [0, -y, 0], [0, y, 0]);
        pushSunShadowGizmoLine(vertices, [0, 0, -z], [0, 0, z]);
        return vertices;
    }

    function makeSunShadowGizmoHandle(root, name, color, axis, sign) {
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
            depthWrite: false
        });
        const handle = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), material);
        handle.name = `lightflow_environment_shadow_${name}`;
        handle.renderOrder = 1003;
        handle.userData.lightflowEnvironmentShadowHandle = { name, axis, sign };
        root.add(handle);
        return handle;
    }

    function createSunShadowGizmo() {
        if (!window.THREE || !window.Canvas?.scene || sunShadowGizmo) return sunShadowGizmo;
        const root = new THREE.Group();
        root.name = 'lightflow_environment_shadow_gizmo';
        root.renderOrder = 1001;
        root.raycast = () => { };

        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0xfff3c4,
            transparent: true,
            opacity: 0.38,
            depthTest: false,
            depthWrite: false
        });
        const line = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial);
        line.name = 'lightflow_environment_shadow_area';
        line.raycast = () => { };
        root.add(line);

        const handles = {
            boundPX: makeSunShadowGizmoHandle(root, 'bound_px', 0x9301fb, 'x', 1),
            boundNX: makeSunShadowGizmoHandle(root, 'bound_nx', 0x9301fb, 'x', -1),
            boundPY: makeSunShadowGizmoHandle(root, 'bound_py', 0x9301fb, 'y', 1),
            boundNY: makeSunShadowGizmoHandle(root, 'bound_ny', 0x9301fb, 'y', -1),
            near: makeSunShadowGizmoHandle(root, 'near', 0xec9218, 'z', 1),
            far: makeSunShadowGizmoHandle(root, 'far', 0xfa565d, 'z', -1)
        };
        Canvas.scene.add(root);
        registerSunShadowCanvasGizmo(root);
        sunShadowGizmo = { root, line, lineMaterial, handles, signature: '' };
        return sunShadowGizmo;
    }

    function getSunShadowGizmoControlScale(localPosition) {
        const preview = window.Preview?.selected || window.main_preview;
        if (!preview || typeof preview.calculateControlScale !== 'function' || !sunShadowGizmo?.root) return 0.45;
        const worldPosition = localPosition.clone();
        sunShadowGizmo.root.localToWorld(worldPosition);
        return Math.max(0.08, preview.calculateControlScale(worldPosition) || 0.45) * 0.52;
    }

    function canShowEnvironmentShadowGizmo() {
        return (!window.Canvas || Canvas.show_gizmos !== false) &&
            (!window.LightManagerAreaGizmos || LightManagerAreaGizmos.enabled !== false);
    }

    function updateSunShadowGizmo() {
        const gizmo = createSunShadowGizmo();
        if (!gizmo || !sunLight || !sunTarget) return;
        const shouldShow = !!(
            settings.show_shadow_gizmo &&
            settings.enabled &&
            settings.sun_enabled &&
            settings.sun_cast_shadows &&
            settings.shadow_auto_fit &&
            canShowEnvironmentShadowGizmo()
        );
        gizmo.root.visible = shouldShow;
        if (!shouldShow) return;

        const fitBox = getShadowFitBox();
        const center = fitBox.getCenter(new THREE.Vector3());
        const halfSize = fitBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
        gizmo.root.position.copy(center);
        gizmo.root.quaternion.identity();
        gizmo.root.scale.setScalar(1);
        gizmo.lineMaterial.color.copy(sunLight.color);

        const signature = [
            fitBox.min.x, fitBox.min.y, fitBox.min.z,
            fitBox.max.x, fitBox.max.y, fitBox.max.z
        ].join('|');
        if (gizmo.signature !== signature) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(buildSunShadowGizmoVertices(), 3));
            gizmo.line.geometry.dispose();
            gizmo.line.geometry = geometry;
            gizmo.signature = signature;
        }

        const positions = {
            boundPX: new THREE.Vector3(halfSize.x, 0, 0),
            boundNX: new THREE.Vector3(-halfSize.x, 0, 0),
            boundPY: new THREE.Vector3(0, halfSize.y, 0),
            boundNY: new THREE.Vector3(0, -halfSize.y, 0),
            near: new THREE.Vector3(0, 0, halfSize.z),
            far: new THREE.Vector3(0, 0, -halfSize.z)
        };
        Object.keys(gizmo.handles).forEach(key => {
            const handle = gizmo.handles[key];
            handle.position.copy(positions[key]);
            handle.scale.setScalar(getSunShadowGizmoControlScale(positions[key]));
        });
    }

    function disposeSunShadowGizmo() {
        sunShadowGizmoDrag = null;
        sunShadowGizmoListeners.splice(0).forEach(listener => listener());
        if (!sunShadowGizmo) return;
        unregisterSunShadowCanvasGizmo(sunShadowGizmo.root);
        sunShadowGizmo.root.parent?.remove?.(sunShadowGizmo.root);
        sunShadowGizmo.root.traverse(object => {
            object.geometry?.dispose?.();
            const materials = Array.isArray(object.material) ? object.material : (object.material ? [object.material] : []);
            materials.forEach(material => material?.dispose?.());
        });
        sunShadowGizmo = null;
        sunShadowGizmoRaycaster = null;
        sunShadowGizmoMouse = null;
        effectiveShadowFrustum = null;
    }

    function getSunShadowGizmoPreview(event) {
        const target = event?.target;
        if (!target) return window.Preview?.selected || window.main_preview || null;
        const canvas = target.tagName === 'CANVAS'
            ? target
            : (typeof target.closest === 'function' ? target.closest('.preview canvas') : null);
        return (canvas && canvas.preview) || window.Preview?.selected || window.main_preview || null;
    }

    function setSunShadowGizmoRay(event, preview) {
        if (!preview?.canvas || !preview.camera) return null;
        sunShadowGizmoRaycaster = sunShadowGizmoRaycaster || new THREE.Raycaster();
        sunShadowGizmoMouse = sunShadowGizmoMouse || new THREE.Vector2();
        const rect = preview.canvas.getBoundingClientRect();
        sunShadowGizmoMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        sunShadowGizmoMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        sunShadowGizmoRaycaster.setFromCamera(sunShadowGizmoMouse, preview.camera);
        return sunShadowGizmoRaycaster.ray;
    }

    function projectSunShadowGizmoEvent(event, drag) {
        const ray = setSunShadowGizmoRay(event, drag.preview);
        if (!ray) return null;
        const point = new THREE.Vector3();
        return ray.intersectPlane(drag.plane, point) ? point : null;
    }

    function stopSunShadowGizmoEvent(event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
    }

    function updateSunShadowGizmoDrag(event) {
        const drag = sunShadowGizmoDrag;
        if (!drag || !sunShadowGizmo?.root) return;
        const worldPoint = projectSunShadowGizmoEvent(event, drag);
        if (!worldPoint) return;
        const localPoint = drag.viewPosition && drag.inverseViewQuaternion
            ? worldPoint.clone().sub(drag.viewPosition).applyQuaternion(drag.inverseViewQuaternion)
            : sunShadowGizmo.root.worldToLocal(worldPoint.clone());
        const axis = drag.handle.axis;
        if (!['x', 'y', 'z'].includes(axis)) return;
        const halfSize = drag.startHalfSize.clone();
        halfSize[axis] = clamp(Math.abs(localPoint[axis]), 0.001, 100000);
        const min = drag.startCenter.clone().sub(halfSize);
        const max = drag.startCenter.clone().add(halfSize);
        const corners = getBoxWorldCorners(new THREE.Box3(min, max));
        applySettings({
            shadow_auto_fit: true,
            shadow_fit_corners: corners.flatMap(corner => corner.toArray())
        }, {
            cause: 'shadow_gizmo',
            forceShadow: false,
            syncPanel: false
        });
    }

    function installSunShadowGizmoInteraction() {
        if (typeof document === 'undefined' || sunShadowGizmoListeners.length) return;
        const onPointerDown = event => {
            if (event.button !== 0 || !sunShadowGizmo?.root?.visible || !canShowEnvironmentShadowGizmo()) return;
            const preview = getSunShadowGizmoPreview(event);
            if (!preview?.canvas || event.target !== preview.canvas) return;
            setSunShadowGizmoRay(event, preview);
            const handles = Object.values(sunShadowGizmo.handles).filter(handle => handle.visible !== false);
            const hit = sunShadowGizmoRaycaster.intersectObjects(handles, false)[0];
            const handle = hit?.object?.userData?.lightflowEnvironmentShadowHandle;
            if (!hit || !handle) return;
            const normal = new THREE.Vector3(0, 0, -1);
            preview.camera.getWorldDirection(normal);
            const fitBox = getShadowFitBox();
            sunShadowGizmoDrag = {
                handle,
                preview,
                plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.point),
                viewPosition: sunShadowGizmo.root.position.clone(),
                viewQuaternion: sunShadowGizmo.root.quaternion.clone(),
                inverseViewQuaternion: sunShadowGizmo.root.quaternion.clone().invert(),
                startCenter: fitBox.getCenter(new THREE.Vector3()),
                startHalfSize: fitBox.getSize(new THREE.Vector3()).multiplyScalar(0.5),
                original: {
                    shadow_auto_fit: settings.shadow_auto_fit,
                    shadow_fit_corners: Array.isArray(settings.shadow_fit_corners)
                        ? settings.shadow_fit_corners.slice()
                        : null
                }
            };
            stopSunShadowGizmoEvent(event);
        };
        const onPointerMove = event => {
            if (!sunShadowGizmoDrag) return;
            stopSunShadowGizmoEvent(event);
            updateSunShadowGizmoDrag(event);
        };
        const onPointerUp = event => {
            if (!sunShadowGizmoDrag) return;
            stopSunShadowGizmoEvent(event);
            sunShadowGizmoDrag = null;
        };
        const onKeyDown = event => {
            if (!sunShadowGizmoDrag || event.key !== 'Escape') return;
            const original = sunShadowGizmoDrag.original;
            sunShadowGizmoDrag = null;
            stopSunShadowGizmoEvent(event);
            applySettings(original, {
                cause: 'shadow_gizmo_cancel',
                forceShadow: false,
                captureShadowFitRegion: false
            });
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('pointermove', onPointerMove, true);
        document.addEventListener('pointerup', onPointerUp, true);
        document.addEventListener('keydown', onKeyDown, true);
        sunShadowGizmoListeners.push(
            () => document.removeEventListener('pointerdown', onPointerDown, true),
            () => document.removeEventListener('pointermove', onPointerMove, true),
            () => document.removeEventListener('pointerup', onPointerUp, true),
            () => document.removeEventListener('keydown', onKeyDown, true)
        );
    }

    function setColor(target, value) {
        target?.setRGB?.(value[0], value[1], value[2]);
    }

    function updateScene(options = {}) {
        if (!window.THREE || !window.Canvas?.scene) return;
        createSky();
        createSunLight();
        ensureSunLightParent();
        ensureSkyTextures();
        const state = getLightingState();
        const preset = getPalette();

        if (skyMesh) skyMesh.visible = !!settings.enabled;
        if (cloudMesh) cloudMesh.visible = !!(settings.enabled && settings.clouds_enabled);
        updateVanillaStars(state);
        if (skyMaterial) {
            setColor(skyMaterial.uniforms.uZenith.value, state.zenithColor);
            setColor(skyMaterial.uniforms.uHorizon.value, state.horizonColor);
            setColor(skyMaterial.uniforms.uGround.value, state.groundColor);
            skyMaterial.uniforms.uSunDirection.value.fromArray(state.sunDirection);
            setColor(skyMaterial.uniforms.uSunColor.value, hexToRgb(preset.sun));
            setColor(skyMaterial.uniforms.uMoonColor.value, hexToRgb(preset.moon));
            setColor(skyMaterial.uniforms.uCloudColor.value, hexToRgb(preset.cloud));
            setColor(skyMaterial.uniforms.uSunsetColor.value, hexToRgb(preset.sunrise_horizon));
            skyMaterial.uniforms.uDaylight.value = state.daylight;
            skyMaterial.uniforms.uNight.value = state.night;
            skyMaterial.uniforms.uTwilight.value = state.twilight;
            skyMaterial.uniforms.uCelestialSize.value = settings.celestial_size;
            skyMaterial.uniforms.uMoonPhase.value = settings.moon_phase;
            skyMaterial.uniforms.uMoonPhaseOffset.value = settings.moon_mode === 'texture' ? settings.moon_phase_offset : 0;
            skyMaterial.uniforms.uStars.value = settings.stars_enabled ? settings.star_brightness : 0;
            skyMaterial.uniforms.uCloudCoverage.value = settings.cloud_coverage;
            skyMaterial.uniforms.uCloudOpacity.value = settings.clouds_enabled ? settings.cloud_opacity : 0;
            skyMaterial.uniforms.uCloudTime.value = getCloudMotionTime();
            skyMaterial.uniforms.uVibrant.value = settings.preset === 'vibrant_visuals' ? 1 : 0;
            skyMaterial.uniforms.uSkyGradientPower.value = settings.sky_gradient_power;
            skyMaterial.uniforms.uStarDensity.value = settings.star_density;
            skyMaterial.uniforms.uSunHorizonScale.value = settings.sun_horizon_scale;
            skyMaterial.uniforms.uSunGazeScale.value = settings.sun_gaze_scale;
            skyMaterial.uniforms.uSunGlare.value = settings.sun_glare;
            skyMaterial.uniforms.uSunsetDirectionalGlow.value = settings.sunset_directional_glow;

            const customSunTexture = getBlockbenchTextureMap(settings.sun_texture_uuid, 'sun');
            const customMoonTexture = getBlockbenchTextureMap(settings.moon_texture_uuid, 'moon');
            const customCloudTexture = getBlockbenchTextureMap(settings.cloud_texture_uuid, 'cloud');
            const presetSunTexture = settings.preset === 'vibrant_visuals'
                ? vibrantVisualsSunTexture
                : vanillaSunTexture;
            const selectedSunTexture = settings.sun_mode === 'texture' && customSunTexture
                ? customSunTexture
                : presetSunTexture;
            const selectedMoonTexture = settings.moon_mode === 'texture' && customMoonTexture
                ? customMoonTexture
                : vanillaMoonPhasesTexture;
            const customMoonUsesAtlas = settings.moon_mode !== 'texture' || settings.moon_texture_layout === 'atlas';

            skyMaterial.uniforms.uSunMode.value = settings.sun_mode === 'hidden' ? 0 : 1;
            skyMaterial.uniforms.uMoonMode.value = settings.moon_mode === 'hidden'
                ? 0
                : (customMoonUsesAtlas ? 1 : 2);
            skyMaterial.uniforms.uMoonAtlasGrid.value.set(
                settings.moon_mode === 'texture' ? settings.moon_atlas_columns : 4,
                settings.moon_mode === 'texture' ? settings.moon_atlas_rows : 2
            );
            skyMaterial.uniforms.uCloudMode.value = settings.cloud_mode === 'procedural' ? 0 : 1;
            skyMaterial.uniforms.uSunTexture.value = selectedSunTexture || fallbackTexture;
            skyMaterial.uniforms.uMoonTexture.value = selectedMoonTexture || fallbackTexture;
            const activeCloudTexture = settings.cloud_mode === 'texture' && customCloudTexture
                ? customCloudTexture
                : (vanillaCloudTexture || fallbackTexture);
            skyMaterial.uniforms.uCloudTexture.value = activeCloudTexture;
            if (cloudMaterial) {
                setColor(cloudMaterial.uniforms.uCloudColor.value, hexToRgb(preset.cloud));
                setColor(cloudMaterial.uniforms.uSunsetColor.value, hexToRgb(preset.sunrise_horizon));
                cloudMaterial.uniforms.uSunDirection.value.fromArray(state.sunDirection);
                cloudMaterial.uniforms.uDaylight.value = state.daylight;
                cloudMaterial.uniforms.uNight.value = state.night;
                cloudMaterial.uniforms.uTwilight.value = state.twilight;
                cloudMaterial.uniforms.uCloudCoverage.value = settings.cloud_coverage;
                cloudMaterial.uniforms.uCloudOpacity.value = settings.clouds_enabled ? settings.cloud_opacity : 0;
                cloudMaterial.uniforms.uCloudTime.value = getCloudMotionTime();
                cloudMaterial.uniforms.uCloudMode.value = settings.cloud_mode === 'procedural' ? 0 : 1;
                cloudMaterial.uniforms.uCloudTexture.value = activeCloudTexture;
                const cloudTextureSize = getTextureSize(activeCloudTexture);
                cloudMaterial.uniforms.uCloudTextureSize.value.set(cloudTextureSize[0], cloudTextureSize[1]);
                cloudMaterial.uniforms.uCloudScale.value = settings.cloud_scale;
                cloudMaterial.uniforms.uCloudDirection.value = settings.cloud_direction / 180 * Math.PI;
                cloudMaterial.uniforms.uCloudContrast.value = settings.cloud_contrast;
                cloudMaterial.uniforms.uCloudBrightness.value = settings.cloud_brightness;
                cloudMaterial.uniforms.uCloudHeight.value = settings.cloud_height;
                cloudMaterial.uniforms.uCloudThickness.value = settings.cloud_thickness;
                cloudMaterial.uniforms.uCloudExtrusion.value = settings.cloud_extrusion;
            }
            skyMaterial.uniforms.uCloudScale.value = settings.cloud_scale;
            skyMaterial.uniforms.uCloudDirection.value = settings.cloud_direction / 180 * Math.PI;
            skyMaterial.uniforms.uCloudContrast.value = settings.cloud_contrast;
            skyMaterial.uniforms.uCloudBrightness.value = settings.cloud_brightness;
            skyMaterial.uniforms.uCloudHeight.value = settings.cloud_height;
            skyMaterial.uniforms.uCloudThickness.value = settings.cloud_thickness;
            skyMaterial.uniforms.uCloudExtrusion.value = settings.cloud_extrusion;
        }

        let shadowChanged = false;
        if (sunLight) {
            const activeSun = !!(settings.enabled && settings.sun_enabled && state.sunIntensity > 0.0001);
            // Keep the directional light in Three's light list. Toggling
            // Object3D.visible changes NUM_DIR_LIGHTS and recompiles every
            // material; intensity zero is visually identical without the
            // shader-program hitch.
            sunLight.visible = true;
            sunLight.intensity = activeSun ? state.sunIntensity : 0;
            setColor(sunLight.color, state.sunColor);
            updateSunShadowPlacement(state.celestialDirection);
            shadowChanged = configureSunShadow(!!options.forceShadow, {
                animation: !!options.animation,
                state
            });
            sunLight.updateMatrixWorld(true);
            sunTarget.updateMatrixWorld(true);
            const frustum = getActiveShadowFrustum();
            const gizmoSignature = [
                settings.show_shadow_gizmo ? 1 : 0,
                settings.enabled ? 1 : 0,
                settings.sun_enabled ? 1 : 0,
                settings.sun_cast_shadows ? 1 : 0,
                settings.shadow_auto_fit ? 1 : 0,
                frustum.area,
                frustum.near,
                frustum.far,
                Array.isArray(settings.shadow_fit_corners) ? settings.shadow_fit_corners.join(',') : ''
            ].join('|');
            if (gizmoSignature !== lastSunShadowGizmoSignature) {
                lastSunShadowGizmoSignature = gizmoSignature;
                updateSunShadowGizmo();
            }
        }

        if (window.ShaderEngine) {
            window.ShaderEngine.environmentState = state;
            if (typeof window.ShaderEngine.requestLightUniformUpdate === 'function') {
                window.ShaderEngine.requestLightUniformUpdate('environment_update', { render: false });
            } else {
                window.ShaderEngine.updateLightUniforms?.('environment_update', { render: false });
            }
        }
        if (shadowChanged && typeof window.LightManagerMarkShadowsDirty === 'function') {
            window.LightManagerMarkShadowsDirty({ scene: !!options.forceShadow });
        }
        if (shadowChanged && typeof window.LightManagerPrepareRender === 'function') {
            const preview = window.Preview?.selected || window.main_preview || window.MediaPreview || null;
            window.LightManagerPrepareRender(preview, { force: !!options.forceShadow });
        }
    }

    function requestPreviewRender() {
        if (window.LightManagerStudioRenderSession) return;
        if (previewRenderFrame !== null) return;
        const revision = environmentRevision;
        const project = window.Project || null;
        const render = () => {
            previewRenderFrame = null;
            if (window.LightManagerStudioRenderSession) return;
            if (
                revision !== environmentRevision ||
                project !== environmentProject ||
                project !== (window.Project || null)
            ) return;
            const preview = window.Preview?.selected || window.main_preview || window.MediaPreview;
            preview?.render?.();
        };
        if (typeof requestAnimationFrame === 'function') previewRenderFrame = requestAnimationFrame(render);
        else {
            previewRenderFrame = 'microtask';
            queueMicrotask(render);
        }
    }

    function dispatchChanged(cause) {
        const detail = { cause: cause || 'settings', settings: Object.assign({}, settings), state: getLightingState() };
        try {
            window.dispatchEvent(new CustomEvent('lightflow_environment_changed', { detail }));
        } catch (error) {
            // CustomEvent is unavailable in headless validation.
        }
        Blockbench.dispatchEvent?.('lightflow_environment_changed', detail);
    }

    function syncEnvironmentPanel(options = {}) {
        if (!environmentPanel?.form || syncingEnvironmentPanel) return;
        const controls = environmentPanel.form.form_data;
        if (!controls) return;
        syncingEnvironmentPanel = true;
        try {
            controls.time?.setValue?.(settings.time);
            if (options.timeOnly) return;
            controls.enabled?.setValue?.(settings.enabled);
            controls.preset?.setValue?.(settings.preset);
            controls.animate_time?.setValue?.(settings.animate_time);
            controls.sky_intensity?.setValue?.(settings.sky_intensity);
            controls.environment_strength?.setValue?.(settings.environment_strength);
            controls.cloud_mode?.setValue?.(settings.cloud_mode);
        } finally {
            syncingEnvironmentPanel = false;
        }
        environmentPanel.form.update();
    }

    function applySettings(next, options = {}) {
        const incoming = next || {};
        const frustumKeys = ['shadow_area', 'shadow_near', 'shadow_far'];
        const hasFrustumEdit = frustumKeys.some(key => Object.prototype.hasOwnProperty.call(incoming, key));
        const shouldCaptureFitRegion = hasFrustumEdit && (
            options.captureShadowFitRegion === true ||
            (
                options.captureShadowFitRegion !== false &&
                options.cause !== 'dialog_preview' &&
                options.cause !== 'dialog_confirm'
            )
        );
        const activeFrustum = getActiveShadowFrustum();
        const manualFrustum = {
            area: Object.prototype.hasOwnProperty.call(incoming, 'shadow_area') ? incoming.shadow_area : activeFrustum.area,
            near: Object.prototype.hasOwnProperty.call(incoming, 'shadow_near') ? incoming.shadow_near : activeFrustum.near,
            far: Object.prototype.hasOwnProperty.call(incoming, 'shadow_far') ? incoming.shadow_far : activeFrustum.far
        };
        const merged = Object.assign({}, settings, incoming);
        if (shouldCaptureFitRegion) {
            merged.shadow_area = manualFrustum.area;
            merged.shadow_near = manualFrustum.near;
            merged.shadow_far = manualFrustum.far;
        }
        settings = normalizeSettings(merged);
        if (shouldCaptureFitRegion) captureShadowFitRegion(manualFrustum);
        saveSettings();
        if (options.syncPanel !== false) syncEnvironmentPanel();
        updateScene({
            forceShadow: options.forceShadow === true,
            animation: !!options.animation
        });
        dispatchChanged(options.cause || 'settings');
        if (options.render !== false) requestPreviewRender();
        return Object.assign({}, settings);
    }

    function applyPreset(presetId, options = {}) {
        const preset = PRESETS[presetId] ? presetId : 'vanilla';
        const vibrant = preset === 'vibrant_visuals';
        return applySettings({
            preset,
            palette_mode: 'preset',
            sky_intensity: vibrant ? 1.08 : 1,
            environment_strength: vibrant ? 0.92 : 0.75,
            sun_intensity: vibrant ? 2.8 : 2.2,
            shadow_resolution: vibrant ? 2048 : settings.shadow_resolution,
            pixelated_shadows: vibrant,
            pixel_shadow_steps: vibrant ? 4 : settings.pixel_shadow_steps,
            pixel_shadow_scale: vibrant ? 2 : settings.pixel_shadow_scale,
            cloud_coverage: vibrant ? 0.5 : 0.54,
            cloud_opacity: vibrant ? 0.86 : 0.78,
            cloud_height: vibrant ? 128 : 128,
            cloud_thickness: vibrant ? 6 : 4,
            cloud_extrusion: 1,
            cloud_mode: 'vanilla',
            sun_mode: 'vanilla',
            moon_mode: 'vanilla'
        }, { cause: options.cause || 'preset', forceShadow: true });
    }

    function getVirtualLight() {
        const state = getLightingState();
        if (!sunLight || !state.enabled || !settings.sun_enabled || state.sunIntensity <= 0.0001) return null;
        return {
            uuid: sunLight.uuid,
            light_type: 'directional',
            visibility: true,
            has_shadow: isSunShadowActive(state),
            render_intensity: state.sunIntensity,
            intensity: state.sunIntensity,
            render_color: state.sunColor.map(channel => Math.round(clamp(channel, 0, 1) * 255)),
            color: state.sunColor.map(channel => Math.round(clamp(channel, 0, 1) * 255)),
            threeLight: sunLight,
            mesh: sunLight
        };
    }

    function collectEnvironmentSceneFitTargets(fitTool) {
        const targets = [];
        const seen = new Set();
        const roots = Array.isArray(window.Outliner?.root) && Outliner.root.length
            ? Outliner.root
            : (Array.isArray(window.Outliner?.elements) ? Outliner.elements : []);
        roots.forEach(node => fitTool.addTargetNode(node, targets, seen));
        return targets;
    }

    function getEnvironmentShadowFitSource() {
        const fitTool = window.LightManagerFitTool;
        if (!fitTool) return null;

        const selectedTargets = fitTool.getSelectedTargets();
        const selectedPoints = fitTool.collectTargetPoints(selectedTargets);
        if (selectedTargets.length && selectedPoints.length) {
            return { targets: selectedTargets, points: selectedPoints, mode: 'selection' };
        }

        const sceneTargets = collectEnvironmentSceneFitTargets(fitTool);
        const scenePoints = fitTool.collectTargetPoints(sceneTargets);
        if (!sceneTargets.length || !scenePoints.length) return null;
        return { targets: sceneTargets, points: scenePoints, mode: 'scene' };
    }

    function fitEnvironmentShadowRegion() {
        const source = getEnvironmentShadowFitSource();
        if (!source) {
            Blockbench.showQuickMessage(tr(
                'lightflow_environment.message.fit_no_geometry',
                'No geometry is available to fit the environment shadow region.'
            ));
            return false;
        }

        const box = window.LightManagerFitTool.getPointsBox(source.points);
        if (!box || box.isEmpty()) return false;
        const size = box.getSize(new THREE.Vector3());
        const margin = Math.max(0.25, Math.max(size.x, size.y, size.z) * 0.015);
        box.expandByScalar(margin);
        const min = box.min;
        const max = box.max;
        const corners = [
            [min.x, min.y, min.z], [max.x, min.y, min.z],
            [max.x, max.y, min.z], [min.x, max.y, min.z],
            [min.x, min.y, max.z], [max.x, min.y, max.z],
            [max.x, max.y, max.z], [min.x, max.y, max.z]
        ];
        applySettings({
            shadow_auto_fit: true,
            shadow_fit_corners: corners.flat()
        }, {
            cause: 'fit_shadow_region',
            forceShadow: false,
            syncPanel: true
        });

        const messageKey = source.mode === 'selection'
            ? 'lightflow_environment.message.fit_selection'
            : 'lightflow_environment.message.fit_scene';
        const fallback = source.mode === 'selection'
            ? 'Environment shadows fitted to the selected geometry.'
            : 'Environment shadows fitted to all scene geometry.';
        Blockbench.showQuickMessage(tr(messageKey, fallback));
        return true;
    }

    const ENVIRONMENT_DIALOG_SECTIONS = {
        _time: { label: 'lightflow_environment.group.time', icon: 'schedule' },
        _sky_colors: { label: 'lightflow_environment.group.sky', icon: 'palette' },
        _celestial: { label: 'lightflow_environment.group.celestial', icon: 'wb_sunny' },
        _sky: { label: 'lightflow_environment.group.weather', icon: 'cloud' },
        _shadows: { label: 'lightflow_environment.group.shadows', icon: 'ev_shadow' }
    };

    const ENVIRONMENT_SELECT_ICONS = {
        preset: { vanilla: 'landscape', vibrant_visuals: 'auto_awesome' },
        palette_mode: { preset: 'palette', custom: 'colorize' },
        moon_phase: { 0: 'brightness_1', 1: 'brightness_2', 2: 'brightness_3', 3: 'brightness_4', 4: 'brightness_5', 5: 'brightness_6', 6: 'brightness_7', 7: 'brightness_2' },
        sun_mode: { vanilla: 'wb_sunny', texture: 'texture', hidden: 'visibility_off' },
        moon_mode: { vanilla: 'nights_stay', texture: 'texture', hidden: 'visibility_off' },
        moon_texture_layout: { atlas: 'grid_view', single: 'crop_square' },
        cloud_mode: { procedural: 'grain', vanilla: 'cloud', texture: 'texture' },
        shadow_resolution: { 256: 'grid_4x4', 512: 'grid_4x4', 1024: 'grid_on', 2048: 'grid_on', 4096: 'high_quality', 8192: 'high_quality' }
    };

    function getEnvironmentFormUI() {
        const api = window.LightManagerUI;
        const required = ['bar_display', 'combo_slider', 'compact_select', 'custom_checkbox', 'action_button'];
        return api && required.every(type => api.formElementTypes?.includes(type)) ? api : null;
    }

    function getEnvironmentSelectOptions(key, options) {
        const source = typeof options === 'function' ? options() : (options || {});
        const iconMap = ENVIRONMENT_SELECT_ICONS[key] || {};
        const fallbackIcon = key.includes('texture') ? 'texture' : 'tune';
        return Object.fromEntries(Object.entries(source).map(([optionKey, option]) => {
            if (option && typeof option === 'object') {
                return [optionKey, {
                    ...option,
                    name: tr(option.name || optionKey, option.name || optionKey),
                    icon: option.icon || iconMap[optionKey] || fallbackIcon
                }];
            }
            return [optionKey, {
                name: tr(option, option || optionKey),
                icon: iconMap[optionKey] || fallbackIcon
            }];
        }));
    }

    function enhanceEnvironmentDialogForm(form) {
        if (!getEnvironmentFormUI()) return form;
        const enhanced = {};
        Object.entries(form).forEach(([key, original]) => {
            const section = ENVIRONMENT_DIALOG_SECTIONS[key];
            if (section) {
                enhanced[`environment_section${key}`] = {
                    type: 'bar_display',
                    icon: section.icon,
                    value: tr(section.label, section.label),
                    expand: true,
                    color: 'var(--color-text)'
                };
                return;
            }
            if (!original || typeof original !== 'object') {
                enhanced[key] = original;
                return;
            }
            if (original.type === 'select') {
                enhanced[key] = {
                    ...original,
                    type: 'compact_select',
                    options: getEnvironmentSelectOptions(key, original.options),
                    show_value_text: true,
                    expand: true
                };
                return;
            }
            if (original.type === 'checkbox') {
                enhanced[key] = {
                    ...original,
                    type: 'custom_checkbox',
                    layout: 'space_between',
                    icon_on: 'check_box',
                    icon_off: 'check_box_outline_blank',
                    icon_size: '24px',
                    icon_color_on: 'var(--color-accent)',
                    icon_color_off: 'var(--color-subtle_text)'
                };
                return;
            }
            if (original.type === 'range') {
                const resetValue = DEFAULT_SETTINGS[key];
                enhanced[key] = {
                    ...original,
                    type: 'combo_slider',
                    resettable: Number.isFinite(resetValue),
                    reset_value: Number.isFinite(resetValue) ? resetValue : original.value
                };
                return;
            }
            if (original.type === 'buttons') {
                const text = original.buttons?.[0] || 'lightflow_environment.action.fit_shadow_region';
                enhanced[key] = {
                    ...original,
                    type: 'action_button',
                    text,
                    title: text,
                    icon: 'center_focus_strong',
                    background: 'var(--color-button)',
                    click: () => original.click?.(0)
                };
                return;
            }
            enhanced[key] = original;
        });
        return enhanced;
    }

    function addEnvironmentDialogStyles() {
        const style = Blockbench.addCSS(`
            #lightflow_environment_composer_dialog .dialog_content {
                scrollbar-gutter: stable;
            }
            #lightflow_environment_composer_dialog [class*="form_bar_environment_section_"] {
                min-height: 34px;
                margin: 10px 0 4px;
                padding: 0 8px;
                border-left: 3px solid var(--color-accent);
                border-bottom: 1px solid var(--color-border);
                background: color-mix(in srgb, var(--color-ui) 84%, var(--color-back));
            }
            #lightflow_environment_composer_dialog [class*="form_bar_environment_section_"]:first-child {
                margin-top: 0;
            }
            #lightflow_environment_composer_dialog [class*="form_bar_environment_section_"] .bar_display {
                justify-content: flex-start;
                gap: 7px;
                font-weight: 600;
            }
            #lightflow_environment_composer_dialog .compact_dropdown_select,
            #lightflow_environment_composer_dialog .custom_checkbox {
                min-width: 0;
            }
            #lightflow_environment_composer_dialog .compact_dropdown_select:focus-visible,
            #lightflow_environment_composer_dialog .custom_checkbox:focus-visible,
            #lightflow_environment_composer_dialog .light_manager_action_button:focus-visible {
                outline: 2px solid var(--color-accent);
                outline-offset: 2px;
            }
            #lightflow_environment_composer_dialog .custom_checkbox:hover,
            #lightflow_environment_composer_dialog .light_manager_action_button:hover {
                background: var(--color-button);
            }
        `);
        deletables.push(style);
    }

    function createDialogForm() {
        const textureOptions = getTextureOptions();
        const shadowFrustum = getActiveShadowFrustum();
        const form = {
            preset: { type: 'select', label: 'lightflow_environment.field.preset', value: settings.preset,
                options: { vanilla: 'Minecraft Vanilla', vibrant_visuals: 'Minecraft Vibrant Visuals' } },
            enabled: { type: 'checkbox', label: 'lightflow_environment.field.enabled', value: settings.enabled },
            _time: '_',
            time: { type: 'range', label: 'lightflow_environment.field.time', value: settings.time, min: 0, max: 23999, step: 100 },
            animate_time: { type: 'checkbox', label: 'lightflow_environment.field.animate', value: settings.animate_time },
            day_length_seconds: { type: 'number', label: 'lightflow_environment.field.day_length', value: settings.day_length_seconds, min: 10, max: 3600, step: 10, condition: form => !!form.animate_time },
            sun_azimuth: { type: 'range', label: 'lightflow_environment.field.azimuth', value: settings.sun_azimuth, min: 0, max: 360, step: 1 },
            _sky_colors: '_',
            palette_mode: { type: 'select', label: 'lightflow_environment.field.palette_mode', value: settings.palette_mode,
                options: { preset: 'lightflow_environment.option.palette_preset', custom: 'lightflow_environment.option.palette_custom' } },
            zenith_color: { type: 'color', label: 'lightflow_environment.field.zenith_color', value: settings.zenith_color, condition: form => form.palette_mode === 'custom' },
            horizon_color: { type: 'color', label: 'lightflow_environment.field.horizon_color', value: settings.horizon_color, condition: form => form.palette_mode === 'custom' },
            sunrise_zenith_color: { type: 'color', label: 'lightflow_environment.field.sunrise_zenith_color', value: settings.sunrise_zenith_color, condition: form => form.palette_mode === 'custom' },
            sunrise_horizon_color: { type: 'color', label: 'lightflow_environment.field.sunrise_horizon_color', value: settings.sunrise_horizon_color, condition: form => form.palette_mode === 'custom' },
            night_zenith_color: { type: 'color', label: 'lightflow_environment.field.night_zenith_color', value: settings.night_zenith_color, condition: form => form.palette_mode === 'custom' },
            night_horizon_color: { type: 'color', label: 'lightflow_environment.field.night_horizon_color', value: settings.night_horizon_color, condition: form => form.palette_mode === 'custom' },
            ground_color: { type: 'color', label: 'lightflow_environment.field.ground_color', value: settings.ground_color, condition: form => form.palette_mode === 'custom' },
            sun_color: { type: 'color', label: 'lightflow_environment.field.sun_color', value: settings.sun_color, condition: form => form.palette_mode === 'custom' },
            moon_color: { type: 'color', label: 'lightflow_environment.field.moon_color', value: settings.moon_color, condition: form => form.palette_mode === 'custom' },
            cloud_color: { type: 'color', label: 'lightflow_environment.field.cloud_color', value: settings.cloud_color, condition: form => form.palette_mode === 'custom' },
            sky_intensity: { type: 'range', label: 'lightflow_environment.field.sky_intensity', value: settings.sky_intensity, min: 0, max: 4, step: 0.05 },
            sky_gradient_power: { type: 'range', label: 'lightflow_environment.field.gradient_power', value: settings.sky_gradient_power, min: 0.5, max: 8, step: 0.05 },
            environment_strength: { type: 'range', label: 'lightflow_environment.field.environment', value: settings.environment_strength, min: 0, max: 4, step: 0.05 },
            _celestial: '_',
            sun_enabled: { type: 'checkbox', label: 'lightflow_environment.field.sun_enabled', value: settings.sun_enabled },
            sun_intensity: { type: 'range', label: 'lightflow_environment.field.sun_intensity', value: settings.sun_intensity, min: 0, max: 10, step: 0.05, condition: form => !!form.sun_enabled },
            moon_intensity: { type: 'range', label: 'lightflow_environment.field.moon_intensity', value: settings.moon_intensity, min: 0, max: 2, step: 0.02, condition: form => !!form.sun_enabled },
            celestial_size: { type: 'range', label: 'lightflow_environment.field.celestial_size', value: settings.celestial_size, min: 0.012, max: 0.18, step: 0.002 },
            moon_phase: { type: 'select', label: 'lightflow_environment.field.moon_phase', value: String(settings.moon_phase),
                options: {
                    '0': 'lightflow_environment.option.moon_full',
                    '1': 'lightflow_environment.option.moon_waning_gibbous',
                    '2': 'lightflow_environment.option.moon_third_quarter',
                    '3': 'lightflow_environment.option.moon_waning_crescent',
                    '4': 'lightflow_environment.option.moon_new',
                    '5': 'lightflow_environment.option.moon_waxing_crescent',
                    '6': 'lightflow_environment.option.moon_first_quarter',
                    '7': 'lightflow_environment.option.moon_waxing_gibbous'
                } },
            sun_mode: { type: 'select', label: 'lightflow_environment.field.sun_mode', value: settings.sun_mode,
                options: { vanilla: 'lightflow_environment.option.celestial_vanilla', texture: 'lightflow_environment.option.celestial_texture', hidden: 'lightflow_environment.option.hidden' } },
            sun_texture_uuid: { type: 'select', label: 'lightflow_environment.field.sun_texture', value: settings.sun_texture_uuid,
                options: textureOptions, condition: form => form.sun_mode === 'texture' },
            moon_mode: { type: 'select', label: 'lightflow_environment.field.moon_mode', value: settings.moon_mode,
                options: { vanilla: 'lightflow_environment.option.celestial_vanilla', texture: 'lightflow_environment.option.celestial_texture', hidden: 'lightflow_environment.option.hidden' } },
            moon_texture_uuid: { type: 'select', label: 'lightflow_environment.field.moon_texture', value: settings.moon_texture_uuid,
                options: textureOptions, condition: form => form.moon_mode === 'texture' },
            moon_texture_layout: { type: 'select', label: 'lightflow_environment.field.moon_texture_layout', value: settings.moon_texture_layout,
                options: { atlas: 'lightflow_environment.option.moon_atlas', single: 'lightflow_environment.option.moon_single' }, condition: form => form.moon_mode === 'texture' },
            moon_atlas_columns: { type: 'number', label: 'lightflow_environment.field.moon_atlas_columns', value: settings.moon_atlas_columns, min: 1, max: 16, step: 1,
                condition: form => form.moon_mode === 'texture' && form.moon_texture_layout === 'atlas' },
            moon_atlas_rows: { type: 'number', label: 'lightflow_environment.field.moon_atlas_rows', value: settings.moon_atlas_rows, min: 1, max: 16, step: 1,
                condition: form => form.moon_mode === 'texture' && form.moon_texture_layout === 'atlas' },
            moon_phase_offset: { type: 'number', label: 'lightflow_environment.field.moon_phase_offset', value: settings.moon_phase_offset, min: -64, max: 64, step: 1,
                condition: form => form.moon_mode === 'texture' && form.moon_texture_layout === 'atlas' },
            sun_horizon_scale: { type: 'range', label: 'lightflow_environment.field.sun_horizon_scale', value: settings.sun_horizon_scale, min: 1, max: 2.5, step: 0.01 },
            sun_gaze_scale: { type: 'range', label: 'lightflow_environment.field.sun_gaze_scale', value: settings.sun_gaze_scale, min: 1, max: 2.5, step: 0.01 },
            sun_glare: { type: 'range', label: 'lightflow_environment.field.sun_glare', value: settings.sun_glare, min: 0, max: 3, step: 0.02 },
            sunset_directional_glow: { type: 'range', label: 'lightflow_environment.field.sunset_directional_glow', value: settings.sunset_directional_glow, min: 0, max: 3, step: 0.02 },
            _sky: '_',
            stars_enabled: { type: 'checkbox', label: 'lightflow_environment.field.stars', value: settings.stars_enabled },
            star_brightness: { type: 'range', label: 'lightflow_environment.field.star_brightness', value: settings.star_brightness, min: 0, max: 3, step: 0.05, condition: form => !!form.stars_enabled },
            star_density: { type: 'range', label: 'lightflow_environment.field.star_density', value: settings.star_density, min: 0.1, max: 4, step: 0.05, condition: form => !!form.stars_enabled },
            clouds_enabled: { type: 'checkbox', label: 'lightflow_environment.field.clouds', value: settings.clouds_enabled },
            cloud_mode: { type: 'select', label: 'lightflow_environment.field.cloud_mode', value: settings.cloud_mode,
                options: { procedural: 'lightflow_environment.option.cloud_procedural', vanilla: 'lightflow_environment.option.cloud_vanilla', texture: 'lightflow_environment.option.cloud_texture' }, condition: form => !!form.clouds_enabled },
            cloud_texture_uuid: { type: 'select', label: 'lightflow_environment.field.cloud_texture', value: settings.cloud_texture_uuid,
                options: textureOptions, condition: form => !!form.clouds_enabled && form.cloud_mode === 'texture' },
            cloud_coverage: { type: 'range', label: 'lightflow_environment.field.cloud_coverage', value: settings.cloud_coverage, min: 0, max: 1, step: 0.01, condition: form => !!form.clouds_enabled },
            cloud_opacity: { type: 'range', label: 'lightflow_environment.field.cloud_opacity', value: settings.cloud_opacity, min: 0, max: 1, step: 0.01, condition: form => !!form.clouds_enabled },
            cloud_speed: { type: 'range', label: 'lightflow_environment.field.cloud_speed', value: settings.cloud_speed, min: -0.2, max: 0.2, step: 0.002, condition: form => !!form.clouds_enabled },
            cloud_scale: { type: 'range', label: 'lightflow_environment.field.cloud_scale', value: settings.cloud_scale, min: 0.05, max: 16, step: 0.05, condition: form => !!form.clouds_enabled },
            cloud_direction: { type: 'range', label: 'lightflow_environment.field.cloud_direction', value: settings.cloud_direction, min: 0, max: 360, step: 1, condition: form => !!form.clouds_enabled },
            cloud_contrast: { type: 'range', label: 'lightflow_environment.field.cloud_contrast', value: settings.cloud_contrast, min: 0.1, max: 4, step: 0.05, condition: form => !!form.clouds_enabled },
            cloud_brightness: { type: 'range', label: 'lightflow_environment.field.cloud_brightness', value: settings.cloud_brightness, min: 0, max: 4, step: 0.05, condition: form => !!form.clouds_enabled },
            cloud_height: { type: 'range', label: 'lightflow_environment.field.cloud_height', value: settings.cloud_height, min: 8, max: 512, step: 1, condition: form => !!form.clouds_enabled },
            cloud_thickness: { type: 'range', label: 'lightflow_environment.field.cloud_thickness', value: settings.cloud_thickness, min: 0.25, max: 64, step: 0.25, condition: form => !!form.clouds_enabled },
            cloud_extrusion: { type: 'range', label: 'lightflow_environment.field.cloud_extrusion', value: settings.cloud_extrusion, min: 0, max: 1, step: 0.01, condition: form => !!form.clouds_enabled },
            _shadows: '_',
            sun_cast_shadows: { type: 'checkbox', label: 'lightflow_environment.field.cast_shadows', value: settings.sun_cast_shadows, condition: form => !!form.sun_enabled },
            fit_shadow_region: {
                type: 'buttons',
                buttons: ['lightflow_environment.action.fit_shadow_region'],
                click: fitEnvironmentShadowRegion,
                condition: form => !!form.sun_cast_shadows
            },
            shadow_auto_fit: { type: 'checkbox', label: 'lightflow_environment.field.shadow_auto_fit', value: settings.shadow_auto_fit, condition: form => !!form.sun_cast_shadows },
            show_shadow_gizmo: { type: 'checkbox', label: 'lightflow_environment.field.show_shadow_gizmo', value: settings.show_shadow_gizmo, condition: form => !!form.sun_cast_shadows && !!form.shadow_auto_fit },
            shadow_area: { type: 'number', label: 'lightflow_environment.field.shadow_area', value: shadowFrustum.area, min: 2, max: 100000, step: 1, condition: form => !!form.sun_cast_shadows && !form.shadow_auto_fit },
            shadow_resolution: { type: 'select', label: 'lightflow_environment.field.shadow_resolution', value: String(settings.shadow_resolution),
                options: { '256': '256', '512': '512', '1024': '1024', '2048': '2048', '4096': '4096', '8192': '8192' }, condition: form => !!form.sun_cast_shadows },
            shadow_near: { type: 'number', label: 'lightflow_environment.field.shadow_near', value: shadowFrustum.near, min: 0.001, step: 0.1, condition: form => !!form.sun_cast_shadows && !form.shadow_auto_fit },
            shadow_far: { type: 'number', label: 'lightflow_environment.field.shadow_far', value: shadowFrustum.far, min: 2, step: 1, condition: form => !!form.sun_cast_shadows && !form.shadow_auto_fit },
            shadow_bias: { type: 'number', label: 'lightflow_environment.field.shadow_bias', value: settings.shadow_bias, min: -0.1, max: 0.1, step: 0.00005, condition: form => !!form.sun_cast_shadows },
            shadow_normal_bias: { type: 'number', label: 'lightflow_environment.field.normal_bias', value: settings.shadow_normal_bias, min: 0, max: 2, step: 0.005, condition: form => !!form.sun_cast_shadows },
            pixelated_shadows: { type: 'checkbox', label: 'lightflow_environment.field.pixelated_shadows', value: settings.pixelated_shadows, condition: form => !!form.sun_cast_shadows },
            pixel_shadow_steps: { type: 'range', label: 'lightflow_environment.field.pixel_shadow_steps', value: settings.pixel_shadow_steps, min: 2, max: 16, step: 1, condition: form => !!form.pixelated_shadows },
            pixel_shadow_scale: { type: 'range', label: 'lightflow_environment.field.pixel_shadow_scale', value: settings.pixel_shadow_scale, min: 1, max: 16, step: 1, condition: form => !!form.pixelated_shadows }
        };
        return enhanceEnvironmentDialogForm(form);
    }

    function createPanelForm() {
        return {
            enabled: {
                type: 'action_toggle', value: settings.enabled, description: 'lightflow_environment.field.enabled',
                icon_on: 'public', icon_off: 'public_off', bg_on: markerColor(0, 'standard', '#58C0FF'),
                color_on: 'var(--color-ui)', color_off: 'var(--color-subtle_text)', icon_size: '22px'
            },
            preset: {
                type: 'compact_select', label: 'lightflow_environment.field.preset', hide_label: true,
                description: 'lightflow_environment.field.preset', background: 'transparent', value: settings.preset,
                show_value_text: true, expand: true,
                options: {
                    vanilla: { name: 'Minecraft Vanilla', icon: 'landscape', color: markerColor(0, 'pastel', '#A2EBFF') },
                    vibrant_visuals: { name: 'Minecraft Vibrant Visuals', icon: 'auto_awesome', color: markerColor(1, 'pastel', '#FFF899') }
                }
            },
            animate_time: {
                type: 'action_toggle', value: settings.animate_time, description: 'lightflow_environment.field.animate',
                icon_on: 'pause_circle', icon_off: 'play_circle', bg_on: markerColor(6, 'standard', '#00CE71'),
                color_on: 'var(--color-ui)', color_off: markerColor(6, 'pastel', '#7BFFA3')
            },
            panel_advanced: {
                type: 'action_button', icon: 'tune', description: 'lightflow_environment.action.open',
                color: markerColor(4, 'pastel', '#C5A6E8'), click: openSettingsDialog
            },
            fit_shadow_region: {
                type: 'action_button', icon: 'center_focus_strong',
                description: 'lightflow_environment.action.fit_shadow_region.desc',
                color: markerColor(4, 'pastel', '#C5A6E8'), click: fitEnvironmentShadowRegion
            },
            time: {
                type: 'combo_slider', label: 'lightflow_environment.field.time', icon: 'schedule',
                color: markerColor(1, 'pastel', '#FFF899'), value: settings.time,
                resettable: true, reset_value: DEFAULT_SETTINGS.time, min: 0, max: 23999, step: 100
            },
            sky_label: {
                type: 'bar_display', icon: 'wb_twilight', paragraph: false, expand: false,
                color: 'var(--color-subtle_text)', description: 'lightflow_environment.field.sky_intensity'
            },
            sky_intensity: {
                type: 'combo_slider', label: 'lightflow_environment.field.sky_intensity', icon: 'wb_sunny',
                background: 'transparent', color: markerColor(2, 'pastel', '#F1BB75'),
                icon_color: markerColor(2, 'pastel', '#F1BB75'), compact: true, popup_width: '300px',
                value: settings.sky_intensity, resettable: true, reset_value: DEFAULT_SETTINGS.sky_intensity,
                min: 0, max: 4, step: 0.05
            },
            environment_strength: {
                type: 'combo_slider', label: 'lightflow_environment.field.environment', icon: 'language',
                background: 'transparent', color: markerColor(6, 'pastel', '#7BFFA3'),
                icon_color: markerColor(6, 'pastel', '#7BFFA3'), compact: true, popup_width: '300px',
                value: settings.environment_strength, resettable: true, reset_value: DEFAULT_SETTINGS.environment_strength,
                min: 0, max: 4, step: 0.05
            },
            cloud_mode: {
                type: 'compact_select', label: 'lightflow_environment.field.cloud_mode', hide_label: true,
                description: 'lightflow_environment.field.cloud_mode', background: 'transparent', value: settings.cloud_mode,
                show_value_text: true, expand: true,
                options: {
                    procedural: { name: tr('lightflow_environment.option.cloud_procedural', 'Procedural'), icon: 'grain', color: markerColor(9, 'pastel', '#E0E9FB') },
                    vanilla: { name: tr('lightflow_environment.option.cloud_vanilla', 'Vanilla Clouds'), icon: 'cloud', color: markerColor(0, 'pastel', '#A2EBFF') },
                    texture: { name: tr('lightflow_environment.option.cloud_texture', 'Project Texture'), icon: 'texture', color: markerColor(8, 'pastel', '#FFA5D5') }
                }
            }
        };
    }

    function openSettingsDialog() {
        const formConfig = createDialogForm();
        const initialSettings = JSON.parse(JSON.stringify(settings));
        let previousShadowFrustum = {
            shadow_area: formConfig.shadow_area.value,
            shadow_near: formConfig.shadow_near.value,
            shadow_far: formConfig.shadow_far.value
        };
        const applyDialogSettings = (form, options) => {
            const shadowFrustumChanged = ['shadow_area', 'shadow_near', 'shadow_far'].some(key => (
                Math.abs(finite(form[key], previousShadowFrustum[key]) - finite(previousShadowFrustum[key], 0)) > 1e-6
            ));
            previousShadowFrustum = {
                shadow_area: form.shadow_area,
                shadow_near: form.shadow_near,
                shadow_far: form.shadow_far
            };
            applySettings(form, { ...options, captureShadowFitRegion: shadowFrustumChanged });
        };
        new Dialog('lightflow_environment_composer_dialog', {
            title: 'lightflow_environment.dialog.title',
            width: 720,
            form: formConfig,
            onFormChange(form) {
                applyDialogSettings(form, { cause: 'dialog_preview', forceShadow: false, syncPanel: false });
            },
            onConfirm(form) {
                applyDialogSettings(form, { cause: 'dialog_confirm', forceShadow: true, syncPanel: true });
            },
            onCancel() {
                applySettings(initialSettings, {
                    cause: 'dialog_cancel',
                    forceShadow: true,
                    syncPanel: true,
                    captureShadowFitRegion: false
                });
            }
        }).show();
    }

    function installUI() {
        settingsAction = new Action('lightflow_environment_composer', {
            name: 'lightflow_environment.action.open',
            description: 'lightflow_environment.action.open.desc',
            icon: 'wb_twilight',
            category: 'view',
            condition: () => !!window.Project,
            click: openSettingsDialog
        });
        environmentPanel = new Panel('lightflow_environment_panel', {
            name: 'lightflow_environment.panel.title',
            icon: 'wb_twilight',
            condition: { modes: ['render'], project: true },
            default_position: {
                slot: 'right_bar', float_position: [0, 0], float_size: [314, 200], height: 200,
                folded: false, attached_to: 'outliner', attached_index: 1, sidebar_index: 1
            },
            mode_positions: {
                render: {
                    slot: 'right_bar', height: 200, folded: false,
                    attached_to: Panels.global_renderer_properties ? 'global_renderer_properties': Panels?.light_properties ? 'light_properties' : 'outliner', attached_index: 1, sidebar_index: 1
                }
            },
            insert_after: 'outliner',
            form: createPanelForm()
        });
        const environmentPanelListener = environmentPanel.form.on('change', ({ result }) => {
            if (syncingEnvironmentPanel) return;
            const panelResult = {};
            ['enabled', 'preset', 'time', 'animate_time', 'sky_intensity', 'environment_strength', 'cloud_mode'].forEach(key => {
                if (result && Object.prototype.hasOwnProperty.call(result, key)) panelResult[key] = result[key];
            });
            applySettings(panelResult, { cause: 'environment_panel', forceShadow: false, syncPanel: false });
        });
        deletables.push(environmentPanelListener);
        window.applyIndestructibleFormGroups(environmentPanel.form, [
            {
                elements: ['enabled', 'preset', '+', 'animate_time', 'fit_shadow_region', 'panel_advanced'], gap: '2px',
                divider_color: 'var(--color-grid)',
                flex: { enabled: '0 0 auto', preset: '0 0 auto', animate_time: '0 0 auto', fit_shadow_region: '0 0 auto', panel_advanced: '0 0 auto' }
            },
            { elements: ['time'], gap: '2px', flex: { time: '1 1 100%' } },
            {
                elements: ['sky_label', 'sky_intensity', 'environment_strength', 'cloud_mode'], gap: '2px',
                flex: { sky_label: '0 0 auto', sky_intensity: '0 0 auto', environment_strength: '0 0 auto', cloud_mode: '0 0 auto' }
            }
        ]);
        const panelStyles = window.LightManagerUI.addCompactPanelStyles('lightflow_environment_panel');
        MenuBar.menus.view.addAction(settingsAction, '9');
        deletables.push(settingsAction, environmentPanel, panelStyles);
        syncEnvironmentPanel();
    }

    function installTranslations() {
        const translations = {
            'lightflow_environment.plugin.title': 'Lightflow Environment',
            'lightflow_environment.panel.title': 'ENVIRONMENT',
            'lightflow_environment.action.open': 'Environment Composer...',
            'lightflow_environment.action.open.desc': 'Compose a Minecraft sky, time, sun, moon, clouds, ambient response, and directional shadows',
            'lightflow_environment.action.fit_shadow_region': 'Fit Shadow Region to Selection / Scene',
            'lightflow_environment.action.fit_shadow_region.desc': 'Fit environment shadows to selected geometry, or to all scene geometry when nothing is selected',
            'lightflow_environment.dialog.title': 'Minecraft Environment Composer',
            'lightflow_environment.group.time': 'Time & Cycle',
            'lightflow_environment.group.sky': 'Sky & Ambient',
            'lightflow_environment.group.celestial': 'Sun & Moon',
            'lightflow_environment.group.weather': 'Stars & Clouds',
            'lightflow_environment.group.shadows': 'Shadows',
            'lightflow_environment.field.preset': 'Sky Model',
            'lightflow_environment.field.enabled': 'Render Environment',
            'lightflow_environment.field.time': 'Minecraft Time',
            'lightflow_environment.field.animate': 'Animate Day Cycle',
            'lightflow_environment.field.day_length': 'Full Day Length (seconds)',
            'lightflow_environment.field.azimuth': 'Sun Path Rotation',
            'lightflow_environment.field.palette_mode': 'Sky Color Source',
            'lightflow_environment.option.palette_preset': 'Use Preset Palette',
            'lightflow_environment.option.palette_custom': 'Custom Palette',
            'lightflow_environment.field.zenith_color': 'Day Zenith',
            'lightflow_environment.field.horizon_color': 'Day Horizon',
            'lightflow_environment.field.sunrise_zenith_color': 'Sunrise Zenith',
            'lightflow_environment.field.sunrise_horizon_color': 'Sunrise Horizon',
            'lightflow_environment.field.night_zenith_color': 'Night Zenith',
            'lightflow_environment.field.night_horizon_color': 'Night Horizon',
            'lightflow_environment.field.ground_color': 'Lower Sky / Ground',
            'lightflow_environment.field.sun_color': 'Sun Color',
            'lightflow_environment.field.moon_color': 'Moon Color',
            'lightflow_environment.field.cloud_color': 'Cloud Color',
            'lightflow_environment.field.sky_intensity': 'Sky Brightness',
            'lightflow_environment.field.gradient_power': 'Sky Gradient Shape',
            'lightflow_environment.field.environment': 'Environment Influence',
            'lightflow_environment.field.sun_enabled': 'Sun / Moon Light',
            'lightflow_environment.field.sun_intensity': 'Sun Intensity',
            'lightflow_environment.field.moon_intensity': 'Moon Intensity',
            'lightflow_environment.field.celestial_size': 'Sun / Moon Size',
            'lightflow_environment.field.moon_phase': 'Moon Phase',
            'lightflow_environment.option.moon_full': 'Full Moon',
            'lightflow_environment.option.moon_waning_gibbous': 'Waning Gibbous',
            'lightflow_environment.option.moon_third_quarter': 'Third Quarter',
            'lightflow_environment.option.moon_waning_crescent': 'Waning Crescent',
            'lightflow_environment.option.moon_new': 'New Moon',
            'lightflow_environment.option.moon_waxing_crescent': 'Waxing Crescent',
            'lightflow_environment.option.moon_first_quarter': 'First Quarter',
            'lightflow_environment.option.moon_waxing_gibbous': 'Waxing Gibbous',
            'lightflow_environment.field.sun_mode': 'Sun Appearance',
            'lightflow_environment.field.moon_mode': 'Moon Appearance',
            'lightflow_environment.field.sun_texture': 'Sun Project Texture',
            'lightflow_environment.field.moon_texture': 'Moon Project Texture',
            'lightflow_environment.field.moon_texture_layout': 'Moon Texture Layout',
            'lightflow_environment.field.moon_atlas_columns': 'Moon Atlas Columns',
            'lightflow_environment.field.moon_atlas_rows': 'Moon Atlas Rows',
            'lightflow_environment.field.moon_phase_offset': 'Moon Phase Offset',
            'lightflow_environment.field.sun_horizon_scale': 'Sunset Sun Scale',
            'lightflow_environment.field.sun_gaze_scale': 'Direct-view Sun Scale',
            'lightflow_environment.field.sun_glare': 'Sun Glare',
            'lightflow_environment.field.sunset_directional_glow': 'Directional Sunset Glow',
            'lightflow_environment.option.celestial_vanilla': 'Minecraft Texture',
            'lightflow_environment.option.celestial_texture': 'Project Texture',
            'lightflow_environment.option.moon_atlas': 'Phase Atlas',
            'lightflow_environment.option.moon_single': 'Single Texture',
            'lightflow_environment.option.hidden': 'Hidden',
            'lightflow_environment.option.texture_none': 'Select a project texture',
            'lightflow_environment.field.stars': 'Stars',
            'lightflow_environment.field.star_brightness': 'Star Brightness',
            'lightflow_environment.field.star_density': 'Star Density',
            'lightflow_environment.field.clouds': 'Minecraft Clouds',
            'lightflow_environment.field.cloud_mode': 'Cloud Source',
            'lightflow_environment.field.cloud_texture': 'Cloud Project Texture',
            'lightflow_environment.option.cloud_procedural': 'Procedural Blocks',
            'lightflow_environment.option.cloud_vanilla': 'Generated Vanilla-style Texture',
            'lightflow_environment.option.cloud_texture': 'Project Texture',
            'lightflow_environment.field.cloud_coverage': 'Cloud Coverage',
            'lightflow_environment.field.cloud_opacity': 'Cloud Opacity',
            'lightflow_environment.field.cloud_speed': 'Cloud Speed',
            'lightflow_environment.field.cloud_scale': 'Cloud Scale',
            'lightflow_environment.field.cloud_direction': 'Cloud Direction',
            'lightflow_environment.field.cloud_contrast': 'Cloud Contrast',
            'lightflow_environment.field.cloud_brightness': 'Cloud Brightness',
            'lightflow_environment.field.cloud_height': 'Cloud Layer Height',
            'lightflow_environment.field.cloud_thickness': 'Cloud Thickness',
            'lightflow_environment.field.cloud_extrusion': '3D Cloud Extrusion',
            'lightflow_environment.field.cast_shadows': 'Sun Cast Shadows',
            'lightflow_environment.field.shadow_auto_fit': 'Fixed World Shadow Coverage Box',
            'lightflow_environment.field.show_shadow_gizmo': 'Show Editable Fixed Shadow Box',
            'lightflow_environment.field.shadow_area': 'Shadow Capture Area',
            'lightflow_environment.field.shadow_resolution': 'Shadow Resolution',
            'lightflow_environment.field.shadow_near': 'Shadow Near Plane',
            'lightflow_environment.field.shadow_far': 'Shadow Far Plane',
            'lightflow_environment.field.shadow_bias': 'Shadow Bias',
            'lightflow_environment.field.normal_bias': 'Shadow Normal Bias',
            'lightflow_environment.field.pixelated_shadows': 'Vibrant Visuals Pixel Shadows',
            'lightflow_environment.field.pixel_shadow_steps': 'Shadow Tone Steps',
            'lightflow_environment.field.pixel_shadow_scale': 'Shadow Pixel Size',
            'lightflow_environment.message.light_manager_required': 'Lightflow Environment requires Light Manager.',
            'lightflow_environment.message.fit_selection': 'Environment shadows fitted to the selected geometry.',
            'lightflow_environment.message.fit_scene': 'Environment shadows fitted to all scene geometry.',
            'lightflow_environment.message.fit_no_geometry': 'No geometry is available to fit the environment shadow region.'
        };
        Language.addTranslations('en', translations);
        Language.addTranslations('es', Object.assign({}, translations, {
            'lightflow_environment.plugin.title': 'Entorno Lightflow',
            'lightflow_environment.panel.title': 'ENTORNO',
            'lightflow_environment.action.open': 'Compositor de entorno...',
            'lightflow_environment.action.open.desc': 'Compón un cielo de Minecraft con hora, sol, luna, nubes, respuesta ambiental y sombras direccionales',
            'lightflow_environment.action.fit_shadow_region': 'Ajustar región de sombras a selección / escena',
            'lightflow_environment.action.fit_shadow_region.desc': 'Ajusta las sombras a la geometría seleccionada o a toda la escena cuando no hay selección',
            'lightflow_environment.dialog.title': 'Compositor de entorno Minecraft',
            'lightflow_environment.group.time': 'Hora y ciclo',
            'lightflow_environment.group.sky': 'Cielo y ambiente',
            'lightflow_environment.group.celestial': 'Sol y luna',
            'lightflow_environment.group.weather': 'Estrellas y nubes',
            'lightflow_environment.group.shadows': 'Sombras',
            'lightflow_environment.field.preset': 'Modelo de cielo',
            'lightflow_environment.field.enabled': 'Renderizar entorno',
            'lightflow_environment.field.time': 'Hora de Minecraft',
            'lightflow_environment.field.animate': 'Animar ciclo del día',
            'lightflow_environment.field.day_length': 'Duración del día completo (segundos)',
            'lightflow_environment.field.azimuth': 'Rotación de la trayectoria solar',
            'lightflow_environment.field.palette_mode': 'Origen de colores del cielo',
            'lightflow_environment.option.palette_preset': 'Usar paleta del preset',
            'lightflow_environment.option.palette_custom': 'Paleta personalizada',
            'lightflow_environment.field.zenith_color': 'Cénit diurno',
            'lightflow_environment.field.horizon_color': 'Horizonte diurno',
            'lightflow_environment.field.sunrise_zenith_color': 'Cénit del amanecer',
            'lightflow_environment.field.sunrise_horizon_color': 'Horizonte del amanecer',
            'lightflow_environment.field.night_zenith_color': 'Cénit nocturno',
            'lightflow_environment.field.night_horizon_color': 'Horizonte nocturno',
            'lightflow_environment.field.ground_color': 'Cielo inferior / suelo',
            'lightflow_environment.field.sun_color': 'Color del sol',
            'lightflow_environment.field.moon_color': 'Color de la luna',
            'lightflow_environment.field.cloud_color': 'Color de las nubes',
            'lightflow_environment.field.sky_intensity': 'Brillo del cielo',
            'lightflow_environment.field.gradient_power': 'Forma del gradiente del cielo',
            'lightflow_environment.field.environment': 'Influencia del entorno',
            'lightflow_environment.field.sun_enabled': 'Luz del sol / luna',
            'lightflow_environment.field.sun_intensity': 'Intensidad del sol',
            'lightflow_environment.field.moon_intensity': 'Intensidad de la luna',
            'lightflow_environment.field.celestial_size': 'Tamaño del sol / luna',
            'lightflow_environment.field.moon_phase': 'Fase lunar',
            'lightflow_environment.option.moon_full': 'Luna llena',
            'lightflow_environment.option.moon_waning_gibbous': 'Gibosa menguante',
            'lightflow_environment.option.moon_third_quarter': 'Cuarto menguante',
            'lightflow_environment.option.moon_waning_crescent': 'Menguante',
            'lightflow_environment.option.moon_new': 'Luna nueva',
            'lightflow_environment.option.moon_waxing_crescent': 'Creciente',
            'lightflow_environment.option.moon_first_quarter': 'Cuarto creciente',
            'lightflow_environment.option.moon_waxing_gibbous': 'Gibosa creciente',
            'lightflow_environment.field.sun_mode': 'Apariencia del sol',
            'lightflow_environment.field.moon_mode': 'Apariencia de la luna',
            'lightflow_environment.field.sun_texture': 'Textura del proyecto para el sol',
            'lightflow_environment.field.moon_texture': 'Textura del proyecto para la luna',
            'lightflow_environment.field.moon_texture_layout': 'Formato de textura lunar',
            'lightflow_environment.field.moon_atlas_columns': 'Columnas del atlas lunar',
            'lightflow_environment.field.moon_atlas_rows': 'Filas del atlas lunar',
            'lightflow_environment.field.moon_phase_offset': 'Desfase de fase lunar',
            'lightflow_environment.field.sun_horizon_scale': 'Escala del sol al atardecer',
            'lightflow_environment.field.sun_gaze_scale': 'Escala del sol al mirarlo',
            'lightflow_environment.field.sun_glare': 'Resplandor solar',
            'lightflow_environment.field.sunset_directional_glow': 'Resplandor direccional del atardecer',
            'lightflow_environment.option.celestial_vanilla': 'Textura de Minecraft',
            'lightflow_environment.option.celestial_texture': 'Textura del proyecto',
            'lightflow_environment.option.moon_atlas': 'Atlas de fases',
            'lightflow_environment.option.moon_single': 'Textura individual',
            'lightflow_environment.option.hidden': 'Oculto',
            'lightflow_environment.option.texture_none': 'Selecciona una textura del proyecto',
            'lightflow_environment.field.stars': 'Estrellas',
            'lightflow_environment.field.star_brightness': 'Brillo de las estrellas',
            'lightflow_environment.field.star_density': 'Densidad de estrellas',
            'lightflow_environment.field.clouds': 'Nubes de Minecraft',
            'lightflow_environment.field.cloud_mode': 'Origen de las nubes',
            'lightflow_environment.field.cloud_texture': 'Textura del proyecto para nubes',
            'lightflow_environment.option.cloud_procedural': 'Bloques procedurales',
            'lightflow_environment.option.cloud_vanilla': 'Textura estilo Vanilla generada',
            'lightflow_environment.option.cloud_texture': 'Textura del proyecto',
            'lightflow_environment.field.cloud_coverage': 'Cobertura de nubes',
            'lightflow_environment.field.cloud_opacity': 'Opacidad de las nubes',
            'lightflow_environment.field.cloud_speed': 'Velocidad de las nubes',
            'lightflow_environment.field.cloud_scale': 'Escala de nubes',
            'lightflow_environment.field.cloud_direction': 'Dirección de nubes',
            'lightflow_environment.field.cloud_contrast': 'Contraste de nubes',
            'lightflow_environment.field.cloud_brightness': 'Brillo de nubes',
            'lightflow_environment.field.cloud_height': 'Altura de la capa de nubes',
            'lightflow_environment.field.cloud_thickness': 'Grosor de las nubes',
            'lightflow_environment.field.cloud_extrusion': 'Extrusión 3D de las nubes',
            'lightflow_environment.field.cast_shadows': 'El sol proyecta sombras',
            'lightflow_environment.field.shadow_auto_fit': 'Caja fija mundial de cobertura de sombras',
            'lightflow_environment.field.show_shadow_gizmo': 'Mostrar caja fija de sombras editable',
            'lightflow_environment.field.shadow_area': 'Área de captura de sombras',
            'lightflow_environment.field.shadow_resolution': 'Resolución de sombras',
            'lightflow_environment.field.shadow_near': 'Plano cercano de sombras',
            'lightflow_environment.field.shadow_far': 'Plano lejano de sombras',
            'lightflow_environment.field.shadow_bias': 'Bias de sombras',
            'lightflow_environment.field.normal_bias': 'Bias normal de sombras',
            'lightflow_environment.field.pixelated_shadows': 'Sombras pixeladas Vibrant Visuals',
            'lightflow_environment.field.pixel_shadow_steps': 'Niveles de tono de sombra',
            'lightflow_environment.field.pixel_shadow_scale': 'Tamaño del píxel de sombra',
            'lightflow_environment.message.light_manager_required': 'Lightflow Environment requiere Light Manager.',
            'lightflow_environment.message.fit_selection': 'Sombras del entorno ajustadas a la geometría seleccionada.',
            'lightflow_environment.message.fit_scene': 'Sombras del entorno ajustadas a toda la geometría de la escena.',
            'lightflow_environment.message.fit_no_geometry': 'No hay geometría disponible para ajustar la región de sombras.'
        }));
    }

    function registerProjectProperty() {
        if (projectProperty || typeof Property === 'undefined') return projectProperty;
        const projectClass = typeof ModelProject !== 'undefined'
            ? ModelProject
            : (window.Project?.constructor && Project.constructor !== Object ? Project.constructor : null);
        if (!projectClass) return null;
        projectProperty = new Property(projectClass, 'string', PROJECT_PROPERTY, { default: '', exposed: true });
        deletables.push(projectProperty);
        return projectProperty;
    }

    function beginEnvironmentProject(project) {
        environmentRevision += 1;
        environmentProject = project || null;
        if (typeof previewRenderFrame === 'number' && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(previewRenderFrame);
        }
        previewRenderFrame = null;
        lastSunShadowConfig = '';
        lastSunShadowDirection = null;
        lastSunShadowRefresh = 0;
        lastSunShadowGizmoSignature = '';
    }

    function loadProjectSettings(project, model) {
        const activeProject = project || null;
        beginEnvironmentProject(activeProject);
        if (!activeProject) {
            if (skyMesh) skyMesh.visible = false;
            if (starMesh) starMesh.visible = false;
            if (cloudMesh) cloudMesh.visible = false;
            if (sunLight) {
                sunLight.intensity = 0;
            }
            return;
        }
        effectiveShadowFrustum = null;
        if (
            (!activeProject[PROJECT_PROPERTY] || !String(activeProject[PROJECT_PROPERTY]).trim()) &&
            typeof model?.[PROJECT_PROPERTY] === 'string'
        ) {
            activeProject[PROJECT_PROPERTY] = model[PROJECT_PROPERTY];
        }
        const raw = activeProject[PROJECT_PROPERTY];
        if (typeof raw === 'string' && raw.trim()) {
            try {
                settings = normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)));
            } catch (error) {
                console.warn('[Lightflow Environment] Project settings are invalid; using saved defaults.', error);
                settings = loadSettings();
            }
        } else {
            settings = loadSettings();
        }
        syncEnvironmentPanel();
        updateScene({ forceShadow: true, animation: false });
        dispatchChanged('project_load');
        requestPreviewRender();
    }

    function startAnimation() {
        if (animationFrame !== null) cancelAnimationFrame(animationFrame);
        lastFrameTime = 0;
        const tick = timestamp => {
            animationFrame = requestAnimationFrame(tick);
            if (!lastFrameTime) lastFrameTime = timestamp;
            const deltaSeconds = Math.min(0.1, Math.max(0, (timestamp - lastFrameTime) / 1000));
            lastFrameTime = timestamp;
            ensureSunLightParent();
            if (window.LightManagerStudioRenderSession || !settings.enabled) return;
            const animateTime = !!settings.animate_time;
            const animateClouds = !!(settings.clouds_enabled && Math.abs(settings.cloud_speed) > 0.000001);
            if (!animateTime && !animateClouds) return;
            if (animateTime) {
                settings.time = mod(settings.time + deltaSeconds * 24000 / Math.max(settings.day_length_seconds, 1), 24000);
            }
            if (timestamp - lastRenderTime < 33) return;
            lastRenderTime = timestamp;
            if (animateTime) {
                syncEnvironmentPanel({ timeOnly: true });
                updateScene({ forceShadow: false, animation: true });
                dispatchChanged('animation');
            } else if (cloudMaterial) {
                cloudMaterial.uniforms.uCloudTime.value = getCloudMotionTime();
            }
            requestPreviewRender();
        };
        animationFrame = requestAnimationFrame(tick);
    }

    function disposeScene() {
        disposeSunShadowGizmo();
        if (sunLight) {
            if (window.three_lights?.[sunLight.uuid] === sunLight) delete window.three_lights[sunLight.uuid];
            sunLight.parent?.remove?.(sunLight);
            sunLight.shadow?.map?.dispose?.();
        }
        sunTarget?.parent?.remove?.(sunTarget);
        starMesh?.parent?.remove?.(starMesh);
        starMesh?.geometry?.dispose?.();
        starMaterial?.dispose?.();
        cloudMesh?.parent?.remove?.(cloudMesh);
        cloudMesh?.geometry?.dispose?.();
        cloudMaterial?.dispose?.();
        skyMesh?.parent?.remove?.(skyMesh);
        skyMesh?.geometry?.dispose?.();
        skyMaterial?.dispose?.();
        vanillaSunTexture?.dispose?.();
        vibrantVisualsSunTexture?.dispose?.();
        vanillaMoonPhasesTexture?.dispose?.();
        vanillaCloudTexture?.dispose?.();
        fallbackTexture?.dispose?.();
        clearProjectTextureCache();
        sunLight = null;
        sunTarget = null;
        skyMesh = null;
        skyMaterial = null;
        starMesh = null;
        starMaterial = null;
        starAttemptIndexCounts = null;
        cloudMesh = null;
        cloudMaterial = null;
        vanillaSunTexture = null;
        vibrantVisualsSunTexture = null;
        vanillaMoonPhasesTexture = null;
        vanillaCloudTexture = null;
        fallbackTexture = null;
        embeddedTexturesStarted = false;
        embeddedTextureGeneration += 1;
    }

    installTranslations();

    Plugin.register(PLUGIN_ID, {
        title: 'Lightflow Environment',
        icon: 'wb_twilight',
        author: 'MidFord327',
        description: 'Minecraft Vanilla and Vibrant Visuals environment rendering with deterministic Vanilla star geometry, voxel-traced fancy clouds, textured celestial atlases, ambient response, reflections, and directional shadows.',
        tags: ['Lightflow', 'Minecraft', 'Environment'],
        version: PLUGIN_VERSION,
        min_version: '4.9.0',
        variant: 'both',
        dependencies: ['light_manager'],

        onload() {
            if (!window.LIGHT_MANAGER_LOADED || !window.LightManagerUI || typeof window.applyIndestructibleFormGroups !== 'function') {
                Blockbench.showToastNotification({
                    text: tr('lightflow_environment.message.light_manager_required', 'Lightflow Environment requires Light Manager.'),
                    icon: 'error',
                    expire: 10000
                });
                return;
            }
            addEnvironmentDialogStyles();
            registerProjectProperty();
            installUI();
            createSky();
            createSunLight();
            installSunShadowGizmoInteraction();

            publishWindowBinding('LightflowEnvironment', {
                get settings() { return Object.assign({}, settings); },
                setSettings: applySettings,
                applyPreset,
                open: openSettingsDialog,
                getLightingState,
                getVirtualLight,
                getDirectionalLight: () => sunLight,
                refresh() {
                    updateScene({ forceShadow: true });
                    requestPreviewRender();
                }
            });

            const lifecycleHydrator = window.LightflowLifecycle?.registerHydrator?.(
                'lightflow_environment',
                ({ project, model, isCurrent, deferred }) => {
                    if (deferred) {
                        beginEnvironmentProject(project);
                        return;
                    }
                    if (project && !isCurrent()) return;
                    loadProjectSettings(project, model);
                }
            );
            if (lifecycleHydrator) {
                deletables.push(lifecycleHydrator);
            } else {
                loadProjectSettings(window.Project || null, null);
                const selectListener = Blockbench.on('select_project', event => loadProjectSettings(event?.project || window.Project, null));
                const parsedListener = window.Codecs?.project?.on?.('parsed', () => loadProjectSettings(window.Project || null, null));
                deletables.push(selectListener, parsedListener);
            }
            const textureChanged = () => {
                clearProjectTextureCache();
                syncEnvironmentPanel();
                updateScene({ forceShadow: false });
                requestPreviewRender();
            };
            const textureListeners = ['add_texture', 'remove_texture', 'update_texture']
                .map(eventName => Blockbench.on(eventName, textureChanged));
            const gizmoVisibilityListener = () => {
                if (!canShowEnvironmentShadowGizmo()) sunShadowGizmoDrag = null;
                updateSunShadowGizmo();
            };
            const viewListener = Blockbench.on('update_view', gizmoVisibilityListener);
            const lightManagerListener = () => {
                ensureSunLightParent();
                updateScene({ forceShadow: true });
            };
            window.addEventListener('light_manager_initialized', lightManagerListener);
            window.addEventListener('lightflow_gizmo_visibility_changed', gizmoVisibilityListener);
            deletables.push(...textureListeners, viewListener, {
                delete() {
                    window.removeEventListener('light_manager_initialized', lightManagerListener);
                    window.removeEventListener('lightflow_gizmo_visibility_changed', gizmoVisibilityListener);
                }
            });
            startAnimation();
        },

        onunload() {
            beginEnvironmentProject(null);
            if (animationFrame !== null) cancelAnimationFrame(animationFrame);
            animationFrame = null;
            if (typeof previewRenderFrame === 'number') cancelAnimationFrame(previewRenderFrame);
            previewRenderFrame = null;
            disposeScene();
            disposeRegisteredResources();
            restoreWindowBindings();
            window.ShaderEngine?.updateLightUniforms?.();
        }
    });
})();
