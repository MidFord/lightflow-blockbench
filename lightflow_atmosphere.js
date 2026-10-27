(function () {
    'use strict';

    const PLUGIN_ID = 'lightflow_atmosphere';
    const PLUGIN_VERSION = '2.1.0';
    const MAX_VOLUMES = 4;
    const MAX_LIGHTS = 4;
    const MAX_SHADOWS = 2;
    const MAX_RAY_STEPS = 96;
    const STORAGE_KEY = 'lightflow_atmosphere.settings';
    const DEFAULT_SETTINGS = {
        enabled: true,
        temporal_jitter: false,
        helper_mask: true,
        static_cache: true,
        frustum_culling: true,
        preview_quality: 'balanced',
        render_quality: 'high',
        preview_scale: 0.5,
        render_scale: 1.0,
        global_fog_enabled: false,
        global_fog_mode: 'none',
        global_fog_color: [196, 214, 230],
        global_fog_start: 24,
        global_fog_end: 160,
        global_fog_density: 0.012,
        global_fog_distance_offset: 0,
        global_fog_max_opacity: 1,
        global_fog_strict_linear: false,
        global_fog_base_height: 0,
        global_fog_height_falloff: 0.08,
        global_fog_sync_background: true,
        volumetric_shadow_mode: 'auto',
        temporal_response: 'balanced',
        temporal_interleave: false,
        art_max_opacity: 1,
        art_saturation: 1,
        art_contrast: 1,
        art_posterize: 0,
        art_dither: 0,
        art_color_quantization: 0,
        art_near_color: [255, 255, 255],
        art_far_color: [255, 255, 255],
        art_ramp_strength: 0,
        art_ramp_curve: 1,
        art_bloom_response: 1
    };

    const PREVIEW_STEPS = { draft: 16, balanced: 24, high: 36, ultra: 48 };
    const RENDER_STEPS = { draft: 28, balanced: 44, high: 64, ultra: 96, reference: 96 };
    const QUALITY_OPTIONS = {
        draft: 'lightflow_atmosphere.option.quality_draft',
        balanced: 'lightflow_atmosphere.option.quality_balanced',
        high: 'lightflow_atmosphere.option.quality_high',
        ultra: 'lightflow_atmosphere.option.quality_ultra',
        reference: 'lightflow_atmosphere.option.quality_reference'
    };
    const GLOBAL_FOG_OPTIONS = {
        none: 'Off',
        minecraft: 'Minecraft / Distance',
        linear: 'Linear Distance',
        exp: 'Exponential',
        exp2: 'Exponential Squared',
        height: 'Exponential Height'
    };

    const VOLUME_PRESETS = {
        soft_mist: {
            composite_mode: 'physical', shadow_fill: 0.18,
            density_mode: 'height', density: 0.032, scattering_strength: 0.82,
            absorption: 0.16, anisotropy: 0.18, height_falloff: 1.35,
            height_offset: 0.12, edge_feather: 0.14, ambient: 0.22,
            scattering_color: [214, 229, 242], absorption_color: [226, 235, 242]
        },
        godrays: {
            composite_mode: 'shafts', shadow_fill: 0,
            density_mode: 'uniform', density: 0.06, scattering_strength: 1.4,
            absorption: 0.025, anisotropy: 0.68, edge_feather: 0.32,
            ambient: 0.0, receive_shadows: true,
            scattering_color: [255, 238, 205], absorption_color: [255, 248, 232]
        },
        clouds: {
            composite_mode: 'physical', shadow_fill: 0.12,
            density_mode: 'cloud', density: 0.095, scattering_strength: 1.0,
            absorption: 0.34, anisotropy: 0.42, edge_feather: 0.18,
            noise_scale: 3.6, noise_detail: 3, coverage: 0.46, erosion: 0.24,
            height_falloff: 0.65, height_offset: 0.18, ambient: 0.16,
            scattering_color: [244, 247, 255], absorption_color: [212, 224, 240]
        },
        stage_haze: {
            composite_mode: 'physical', shadow_fill: 0.08,
            density_mode: 'uniform', density: 0.018, scattering_strength: 0.72,
            absorption: 0.08, anisotropy: 0.58, edge_feather: 0.2,
            ambient: 0.04, scattering_color: [232, 238, 255],
            absorption_color: [242, 246, 255]
        },
        cinematic_dust: {
            composite_mode: 'shafts', shadow_fill: 0.02,
            density_mode: 'cloud', density: 0.024, scattering_strength: 0.86,
            absorption: 0.02, anisotropy: 0.74, edge_feather: 0.24,
            noise_scale: 8.0, noise_detail: 2, coverage: 0.32, erosion: 0.5,
            height_falloff: 0.25, height_offset: 0.05, ambient: 0.015,
            receive_shadows: true, bloom_contribution: 1.25,
            scattering_color: [255, 226, 184], absorption_color: [255, 240, 216]
        }
    };

    Object.assign(VOLUME_PRESETS, {
        minecraft_classic: { intent: 'minecraft_classic', density_mode: 'uniform', density: 0.018, scattering_strength: 0.55, absorption: 0.08, max_opacity: 1, scattering_color: [190, 210, 224] },
        minecraft_underwater: { intent: 'underwater', density_mode: 'uniform', density: 0.07, scattering_strength: 0.8, absorption: 0.35, scattering_color: [74, 150, 178], absorption_color: [30, 92, 116] },
        retro_distance: { intent: 'retro_distance', density_mode: 'uniform', density: 0.024, scattering_strength: 0.5, posterize: 6, dither: 0.65 },
        ps1_fade: { intent: 'ps1_distance_fade', density_mode: 'uniform', density: 0.03, scattering_strength: 0.42, posterize: 8, color_quantization: 12 },
        ground_fog: { intent: 'ground_fog', density_mode: 'height', density: 0.045, height_falloff: 2.8, height_offset: 0.08, scattering_strength: 0.8 },
        valley_haze: { intent: 'valley_haze', density_mode: 'height', density: 0.018, height_falloff: 0.7, scattering_strength: 0.62, max_opacity: 0.72 },
        golden_hour: { intent: 'golden_hour', density_mode: 'height', density: 0.016, scattering_strength: 0.8, anisotropy: 0.55, scattering_color: [255, 205, 148] },
        cold_morning: { intent: 'cold_morning', density_mode: 'height', density: 0.028, scattering_strength: 0.75, scattering_color: [202, 225, 244] },
        whiteout: { intent: 'dense_whiteout', density_mode: 'uniform', density: 0.12, scattering_strength: 1.1, absorption: 0.2, scattering_color: [248, 250, 252] },
        backlit_haze: { intent: 'backlit_haze', density_mode: 'uniform', density: 0.022, scattering_strength: 0.9, anisotropy: 0.7, composite_mode: 'physical' },
        window_shafts: { intent: 'god_rays', density_mode: 'uniform', composite_mode: 'shafts', density: 0.04, scattering_strength: 1.2, shaft_exposure: 1.3 },
        heavy_atmosphere: { intent: 'heavy_atmosphere', density_mode: 'height', density: 0.065, scattering_strength: 1.0, absorption: 0.28, max_opacity: 0.92 },
        anime_haze: { intent: 'anime_haze', density_mode: 'height', density: 0.018, scattering_strength: 0.68, saturation: 1.25, contrast: 1.08, posterize: 10 },
        dream_fog: { intent: 'dream', density_mode: 'uniform', density: 0.025, scattering_strength: 0.75, saturation: 1.3, near_color: [255, 216, 244], far_color: [174, 192, 255], fog_ramp_strength: 0.8 },
        pastel_fog: { intent: 'stylized', density_mode: 'uniform', density: 0.026, scattering_strength: 0.72, saturation: 0.82, contrast: 0.88, near_color: [255, 229, 238], far_color: [202, 226, 255], fog_ramp_strength: 0.72 },
        posterized_fog: { intent: 'stylized', density_mode: 'uniform', density: 0.03, scattering_strength: 0.7, posterize: 5 },
        pixel_dither_fog: { intent: 'stylized', density_mode: 'uniform', density: 0.025, scattering_strength: 0.65, posterize: 8, dither: 1, color_quantization: 12 },
        horror_fog: { intent: 'horror', density_mode: 'height', density: 0.055, scattering_strength: 0.55, absorption: 0.42, saturation: 0.45, contrast: 1.45, scattering_color: [132, 145, 126] },
        dense_cloud: { intent: 'cloud', density_mode: 'cloud', density: 0.14, scattering_strength: 1.05, absorption: 0.42, noise_detail: 3, coverage: 0.38, erosion: 0.18 },
        smoke: { intent: 'smoke', density_mode: 'cloud', density: 0.1, scattering_strength: 0.42, absorption: 0.68, noise_detail: 2, coverage: 0.44, scattering_color: [118, 122, 128] },
        rolling_mist: { intent: 'rolling_mist', density_mode: 'cloud', density: 0.04, scattering_strength: 0.7, height_falloff: 2.2, wind_speed: 0.12, noise_detail: 1 },
        volumetric_godrays: { intent: 'god_rays', density_mode: 'cloud', composite_mode: 'shafts', density: 0.045, scattering_strength: 1.25, receive_shadows: true, anisotropy: 0.76 }
    });

    // Keep the picker useful as a starting point, not as a preset browser.
    // Legacy presets remain in VOLUME_PRESETS so saved projects still load.
    const VOLUME_PRESET_OPTIONS = Object.freeze({
        custom: 'lightflow_atmosphere.option.keep_values',
        soft_mist: 'lightflow_atmosphere.preset.soft_mist',
        ground_fog: 'lightflow_atmosphere.preset.ground_fog',
        stage_haze: 'lightflow_atmosphere.preset.stage_haze',
        godrays: 'lightflow_atmosphere.preset.godrays',
        clouds: 'lightflow_atmosphere.preset.clouds',
        smoke: 'lightflow_atmosphere.preset.smoke',
        dream_fog: 'lightflow_atmosphere.preset.dream_fog'
    });

    const VOLUME_DEFAULTS = Object.freeze({
        shape: 'box',
        density_mode: 'uniform',
        composite_mode: 'physical',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        size: [32, 16, 32],
        visibility: true,
        enabled: true,
        density: 0.04,
        scattering_color: [232, 240, 255],
        scattering_strength: 0.9,
        absorption_color: [235, 242, 255],
        absorption: 0.18,
        anisotropy: 0.35,
        ambient: 0.12,
        shadow_fill: 0.1,
        receive_shadows: true,
        edge_feather: 0.12,
        height_falloff: 1.2,
        height_offset: 0.1,
        noise_scale: 3.2,
        noise_detail: 3,
        coverage: 0.45,
        erosion: 0.22,
        wind_direction: [1, 0, 0],
        wind_speed: 0,
        schema_version: 2,
        technique_override: 'auto',
        intent: '',
        light_uuid: '',
        light_type: '',
        shaft_length: 0.78,
        shaft_decay: 0.93,
        shaft_radius: 0.82,
        shaft_exposure: 1
    });

    let VolumeElement = null;
    let GodRayElement = null;
    let godRayController = null;
    let godRayPanel = null;
    let godRayRuntime = null;
    let godRayPanelSyncing = false;
    let ParticleEffectElement = null;
    let particleEffectController = null;
    let particleEffectScene = null;
    let particleEffectPanel = null;
    let particlePanelSyncing = false;
    let particlePanelTab = 'emission';
    const particleEffectRecords = new Map();
    const retiredParticleConfigs = new Set();
    let atmospherePanel = null;
    let addVolumeAction = null;
    let editVolumeAction = null;
    let settingsAction = null;
    let volumePreviewController = null;
    let animationFrame = null;
    let animationHandleType = '';
    let previewRenderFrame = null;
    let lastAnimatedFrame = 0;
    let storageWriteFailureReported = false;
    let lastPreviewPatchCheck = 0;
    let syncingPanel = false;
    let volumePanelMode = 'basic';
    let activeVolumePanelUndo = null;
    let scheduleVolumePanelAdaptiveLayout = () => {};
    let atmosphereRevision = 0;
    let atmosphereProject = null;
    let atmosphereProjectSettingsProperty = null;
    const deletables = [];
    const effectDialogs = new Set();
    deletables.push({delete() { for (const dialog of [...effectDialogs]) { dialog.cancel(); dialog.delete(); } }});
    const showEffectDialog = (id, config, sections = null) => {
        if (sections) config.form = window.LightManagerUI.taskDialogForm(config.form, sections);
        return window.LightManagerUI.showTaskDialog(id, config, effectDialogs);
    };
    const publishedWindowBindings = new Map();
    const volumePanelGroupsOpen = {
        look: true,
        look_setup: false,
        light_response: false,
        shape: true,
        height: false,
        cloud: false,
        motion: false,
        quality: true,
        quality_advanced: false
    };

    /*
     * VolumeElement stores project data, the panel edits that data, and
     * AtmosphereManager converts the active volumes into cached depth and
     * composite passes. Preview.render is wrapped only at this final boundary.
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
                console.warn('[Lightflow Atmosphere] Failed to release a registered resource.', error);
            }
        });
    }

    const ATMOSPHERE_ELEMENT_TYPES = new Set([
        'lightflow_volume',
        'lightflow_god_ray',
        'lightflow_particle_effect'
    ]);

    function atmosphereProjects() {
        const projects = [];
        const seen = new Set();
        const add = project => {
            if (!project || seen.has(project)) return;
            seen.add(project);
            projects.push(project);
        };
        (window.ModelProject?.all || []).forEach(add);
        add(window.Project);
        return projects;
    }

    function ensureAtmosphereReloadPlaceholder(element, project = window.Project) {
        if (!element || !project || !ATMOSPHERE_ELEMENT_TYPES.has(element.type) || typeof THREE === 'undefined') return null;
        const nodes = project.nodes_3d;
        if (!nodes) return null;
        let mesh = nodes[element.uuid];
        let createdPlaceholder = false;
        if (!mesh) {
            mesh = new THREE.Object3D();
            nodes[element.uuid] = mesh;
            createdPlaceholder = true;
        }
        // Do not relabel a surviving real preview from an interrupted/older
        // reload as a generic bridge node. The replacement preview controller
        // must be allowed to run its normal cleanup path for real previews.
        if (!createdPlaceholder && !mesh.userData?.lightflowAtmosphereReloadPlaceholder) {
            return mesh;
        }
        mesh.name = element.uuid;
        mesh.type = element.type;
        mesh.isElement = true;
        mesh.visible = element.visibility !== false;
        mesh.rotation.order = window.Format?.euler_order || 'ZYX';
        if (!mesh.geometry) {
            mesh.geometry = new THREE.BufferGeometry();
            mesh.geometry.boundingBox = new THREE.Box3().makeEmpty();
        }
        mesh.fix_position = mesh.fix_position || new THREE.Vector3();
        mesh.fix_rotation = mesh.fix_rotation || new THREE.Euler();
        mesh.userData = mesh.userData || {};
        mesh.userData.lightflowAtmosphereReloadPlaceholder = true;
        mesh.userData.lightflowNoShadow = true;
        if (!mesh.parent) {
            const parentMesh = element.parent?.type === 'armature_bone'
                ? element.parent.mesh
                : project.model_3d;
            parentMesh?.add?.(mesh);
        }
        return mesh;
    }

    function ensureAtmosphereReloadPlaceholders() {
        const reloadPreviewBridge = {
            setup() { },
            remove() { },
            updateAll() { },
            updateTransform() { },
            updateVisibility() { },
            updateSelection() { },
            updateRenderOrder() { }
        };
        atmosphereProjects().forEach(project => {
            (project?.elements || []).forEach(element => {
                if (ATMOSPHERE_ELEMENT_TYPES.has(element?.type)) {
                    ensureAtmosphereReloadPlaceholder(element, project);
                    // A surviving custom element still points at the constructor from
                    // the previous plugin evaluation. Blockbench refreshes every
                    // Outliner element synchronously from registerType(), so another
                    // plugin can otherwise call that retired controller after its
                    // closed-over runtime has already been disposed. Bridge only the
                    // retired constructor; the replacement class installs its real
                    // controller later in this same load.
                    const constructor = element.constructor;
                    if (constructor && constructor !== Object && constructor.preview_controller) {
                        constructor.preview_controller = reloadPreviewBridge;
                    }
                }
            });
        });
    }

    function allowAnimationModeInspection(ElementType) {
        // These effects have their own editors, not native keyframe channels.
        // A channel-free adapter permits native Outliner selection in Animate.
        class EffectInspectionAnimator extends BoneAnimator {
            constructor(...args){super(...args);this.position=[];this.rotation=[];this.scale=[];this.getGroup();}
            select(){this.getGroup();return this;}
            doRender(){return false;}
        }
        EffectInspectionAnimator.prototype.channels={};
        EffectInspectionAnimator.prototype.type='lightflow_inspection';
        ElementType.animator=EffectInspectionAnimator;
    }

    function prepareReloadedAtmosphereElements(ElementType, type) {
        if (!ElementType) return [];
        const elements = [];
        const seen = new Set();
        [window.Project?.elements, window.Outliner?.elements].forEach(collection => {
            if (!Array.isArray(collection)) return;
            collection.forEach(element => {
                if (!element || seen.has(element)) return;
                seen.add(element);
                elements.push(element);
            });
        });
        const migrated = [];
        elements.forEach(element => {
            if (element?.type !== type || element instanceof ElementType) return;
            Object.setPrototypeOf(element, ElementType.prototype);
            ensureAtmosphereReloadPlaceholder(element, window.Project);
            migrated.push(element);
        });
        if (migrated.length && !ElementType.preview_controller) {
            // registerType dispatches synchronously and Blockbench may refresh every
            // Outliner element before the real NodePreviewController exists.
            ElementType.preview_controller = {
                setup() { },
                remove() { },
                updateAll() { },
                updateTransform() { },
                updateVisibility() { },
                updateSelection() { },
                updateRenderOrder() { }
            };
        }
        return migrated;
    }

    function rebuildReloadedAtmosphereElementPreviews(elements, controller) {
        if (!controller || !Array.isArray(elements) || !elements.length) return;
        elements.forEach(element => {
            if (!element) return;
            const mesh = element.mesh;
            if (mesh?.userData?.lightflowAtmosphereReloadPlaceholder) {
                mesh.geometry?.dispose?.();
                mesh.parent?.remove?.(mesh);
                if (window.Project?.nodes_3d?.[element.uuid] === mesh) {
                    delete window.Project.nodes_3d[element.uuid];
                }
            } else if (mesh) {
                controller.remove?.(element);
            }
            controller.setup?.(element);
            controller.updateVisibility?.(element);
            controller.updateSelection?.(element);
        });
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, Number(value)));
    }

    function finite(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    /* LIGHTFLOW_ATMOSPHERE_V2_CORE_START */
    function createAtmosphereV2Core() {
        const Technique = Object.freeze({
            NONE: 'NONE',
            NATIVE_LINEAR: 'NATIVE_LINEAR',
            NATIVE_EXP: 'NATIVE_EXP',
            NATIVE_EXP2: 'NATIVE_EXP2',
            ANALYTIC_GLOBAL: 'ANALYTIC_GLOBAL',
            ANALYTIC_LOCAL: 'ANALYTIC_LOCAL',
            ANALYTIC_LOCAL_QUADRATURE: 'ANALYTIC_LOCAL_QUADRATURE',
            SCREEN_ARTISTIC: 'SCREEN_ARTISTIC',
            SCREEN_SHAFTS: 'SCREEN_SHAFTS',
            GEOMETRY_SHAFTS: 'GEOMETRY_SHAFTS',
            VOLUMETRIC_RAYMARCH: 'VOLUMETRIC_RAYMARCH',
            VOLUMETRIC_HQ: 'VOLUMETRIC_HQ'
        });
        const POST_TECHNIQUES = new Set([
            Technique.ANALYTIC_LOCAL,
            Technique.ANALYTIC_LOCAL_QUADRATURE,
            Technique.SCREEN_ARTISTIC,
            Technique.SCREEN_SHAFTS,
            Technique.VOLUMETRIC_RAYMARCH,
            Technique.VOLUMETRIC_HQ
        ]);
        const RAYMARCH_TECHNIQUES = new Set([
            Technique.VOLUMETRIC_RAYMARCH,
            Technique.VOLUMETRIC_HQ
        ]);
        const ANALYTIC_TECHNIQUES = new Set([
            Technique.NATIVE_LINEAR,
            Technique.NATIVE_EXP,
            Technique.NATIVE_EXP2,
            Technique.ANALYTIC_GLOBAL,
            Technique.ANALYTIC_LOCAL,
            Technique.ANALYTIC_LOCAL_QUADRATURE
        ]);
        const number = (value, fallback = 0) => {
            const result = Number(value);
            return Number.isFinite(result) ? result : fallback;
        };
        const clampValue = (value, minimum, maximum) => (
            Math.max(minimum, Math.min(maximum, number(value, minimum)))
        );
        const saturate = value => clampValue(value, 0, 1);
        const normalizeTechnique = value => {
            const key = String(value || '').trim().toUpperCase();
            return Object.prototype.hasOwnProperty.call(Technique, key) ? Technique[key] : null;
        };
        const isTechniqueCompatible = (technique, volume) => {
            const normalized = normalizeTechnique(technique);
            if (!normalized || normalized === Technique.NONE || !volume) return true;
            if ([Technique.SCREEN_SHAFTS, Technique.GEOMETRY_SHAFTS, Technique.SCREEN_ARTISTIC].includes(normalized)) return true;
            const densityMode = String(volume.density_mode || 'uniform').toLowerCase();
            const heterogeneous = ['cloud', 'custom', 'texture3d'].includes(densityMode);
            if (RAYMARCH_TECHNIQUES.has(normalized)) return heterogeneous;
            if ([Technique.ANALYTIC_LOCAL, Technique.ANALYTIC_LOCAL_QUADRATURE].includes(normalized)) return !heterogeneous;
            return true;
        };

        function linearFogFactor(distance, start, end, strictLinear = false) {
            const rangeStart = number(start, 0);
            const rangeEnd = Math.max(rangeStart + 1e-6, number(end, rangeStart + 1));
            const factor = saturate((number(distance, 0) - rangeStart) / (rangeEnd - rangeStart));
            return strictLinear ? factor : factor * factor * (3 - 2 * factor);
        }

        function exponentialFogFactor(distance, density, squared = false, options = {}) {
            const clearDistance = Math.max(0, number(options.distanceOffset, 0));
            const x = Math.max(0, number(distance, 0) - clearDistance) * Math.max(0, number(density, 0));
            const opacity = 1 - Math.exp(squared ? -(x * x) : -x);
            return Math.min(saturate(number(options.maximumOpacity, 1)), saturate(opacity));
        }

        function beerLambertTransmittance(extinction, pathLength) {
            return saturate(Math.exp(-Math.max(0, number(extinction, 0)) * Math.max(0, number(pathLength, 0))));
        }

        function integrateUniformDensity(density, t0, t1) {
            return Math.max(0, number(density, 0)) * Math.max(0, number(t1, 0) - number(t0, 0));
        }

        function integrateExponentialHeight(options = {}) {
            const density = Math.max(0, number(options.density, 0));
            const t0 = number(options.t0, 0);
            const t1 = Math.max(t0, number(options.t1, t0));
            if (density <= 0 || t1 <= t0) return 0;
            const falloff = Math.max(0, number(options.heightFalloff, 0));
            if (falloff <= 1e-8) return density * (t1 - t0);
            const originY = number(options.originY, 0);
            const directionY = number(options.directionY, 0);
            const baseHeight = number(options.baseHeight, 0);
            const exponentAtOrigin = clampValue(-falloff * (originY - baseHeight), -80, 80);
            const amplitude = density * Math.exp(exponentAtOrigin);
            const slope = falloff * directionY;
            if (Math.abs(slope) <= 1e-6) return amplitude * (t1 - t0);
            const startExponent = clampValue(-slope * t0, -80, 80);
            const endExponent = clampValue(-slope * t1, -80, 80);
            return Math.max(0, amplitude * (Math.exp(startExponent) - Math.exp(endExponent)) / slope);
        }

        function intersectSphere(origin, direction, center, radius) {
            const ox = number(origin?.[0]) - number(center?.[0]);
            const oy = number(origin?.[1]) - number(center?.[1]);
            const oz = number(origin?.[2]) - number(center?.[2]);
            const dx = number(direction?.[0]);
            const dy = number(direction?.[1]);
            const dz = number(direction?.[2]);
            const a = dx * dx + dy * dy + dz * dz;
            if (a <= 1e-12) return null;
            const b = ox * dx + oy * dy + oz * dz;
            const c = ox * ox + oy * oy + oz * oz - Math.max(0, number(radius)) ** 2;
            const discriminant = b * b - a * c;
            if (discriminant < 0) return null;
            const root = Math.sqrt(discriminant);
            const entry = (-b - root) / a;
            const exit = (-b + root) / a;
            return exit < 0 ? null : [entry, exit];
        }

        function intersectBox(origin, direction, minimum, maximum) {
            let entry = -Infinity;
            let exit = Infinity;
            for (let axis = 0; axis < 3; axis++) {
                const o = number(origin?.[axis]);
                const d = number(direction?.[axis]);
                const min = number(minimum?.[axis]);
                const max = number(maximum?.[axis]);
                if (Math.abs(d) <= 1e-12) {
                    if (o < min || o > max) return null;
                    continue;
                }
                const first = (min - o) / d;
                const second = (max - o) / d;
                entry = Math.max(entry, Math.min(first, second));
                exit = Math.min(exit, Math.max(first, second));
                if (exit < entry) return null;
            }
            return exit < 0 ? null : [entry, exit];
        }

        function resolve(input = {}) {
            const requested = normalizeTechnique(input.technique || input.renderTechnique);
            if (requested && requested !== Technique.NONE && isTechniqueCompatible(requested, input.volume)) return requested;
            const globalFog = input.globalFog || null;
            const volume = input.volume || null;
            const intent = String(input.intent || '').toLowerCase();
            const quality = String(input.quality || 'balanced').toLowerCase();
            const studio = !!input.studio;
            const trueVolumetricShadows = !!(
                input.trueVolumetricShadows || volume?.true_volumetric_shadows
            );

            if (globalFog?.enabled !== false && globalFog) {
                const mode = String(globalFog.mode || globalFog.type || '').toLowerCase();
                if (['minecraft', 'minecraft_classic', 'minecraft_render', 'linear', 'distance'].includes(mode)) {
                    return Technique.NATIVE_LINEAR;
                }
                if (mode === 'exp') return Technique.NATIVE_EXP;
                if (['exp2', 'exponential'].includes(mode)) return Technique.NATIVE_EXP2;
                if (['height', 'ground', 'horizon', 'atmospheric_perspective'].includes(mode)) {
                    return Technique.ANALYTIC_GLOBAL;
                }
                if (['artistic', 'screen', 'dream', 'stylized'].includes(mode)) {
                    return Technique.SCREEN_ARTISTIC;
                }
            }

            if (!volume || volume.enabled === false || volume.visibility === false) {
                if (['godray', 'god_rays', 'sun_shafts'].includes(intent)) {
                    return trueVolumetricShadows && studio && ['ultra', 'reference'].includes(quality)
                        ? Technique.VOLUMETRIC_HQ
                        : Technique.SCREEN_SHAFTS;
                }
                return Technique.NONE;
            }

            const densityMode = String(volume.density_mode || 'uniform').toLowerCase();
            const compositeMode = String(volume.composite_mode || 'physical').toLowerCase();
            if (compositeMode === 'shafts' || ['godray', 'god_rays', 'stage_beam'].includes(intent)) {
                if (trueVolumetricShadows && studio && ['ultra', 'reference'].includes(quality)) return Technique.VOLUMETRIC_HQ;
                const lightType = String(input.lightType || volume.light_type || '').toLowerCase();
                return lightType === 'spot' ? Technique.GEOMETRY_SHAFTS : Technique.SCREEN_SHAFTS;
            }
            if (densityMode === 'cloud' || densityMode === 'custom' || densityMode === 'texture3d') {
                return studio && ['ultra', 'reference'].includes(quality)
                    ? Technique.VOLUMETRIC_HQ
                    : Technique.VOLUMETRIC_RAYMARCH;
            }
            if (densityMode === 'height') {
                return Math.max(0, number(volume.edge_feather, 0)) > 1e-5
                    ? Technique.ANALYTIC_LOCAL_QUADRATURE
                    : Technique.ANALYTIC_LOCAL;
            }
            if (densityMode === 'screen' || volume.screen_space === true) return Technique.SCREEN_ARTISTIC;
            return Technique.ANALYTIC_LOCAL;
        }

        function resolveScene(input = {}) {
            const volumes = Array.isArray(input.volumes) ? input.volumes : [];
            const globalTechnique = resolve({
                globalFog: input.globalFog,
                technique: input.globalTechnique,
                quality: input.quality,
                studio: input.studio
            });
            const volumeRoutes = volumes.map(volume => ({
                volume,
                technique: resolve({
                    technique: volume?.technique_override,
                    volume,
                    quality: input.quality,
                    studio: input.studio,
                    intent: volume?.intent,
                    lightType: volume?.light_type,
                    trueVolumetricShadows: input.trueVolumetricShadows
                })
            })).filter(route => route.technique !== Technique.NONE);
            const techniques = [];
            if (globalTechnique !== Technique.NONE) techniques.push(globalTechnique);
            volumeRoutes.forEach(route => {
                if (!techniques.includes(route.technique)) techniques.push(route.technique);
            });
            const activeAnalyticVolumes = volumeRoutes.filter(route => ANALYTIC_TECHNIQUES.has(route.technique)).length;
            const activeRaymarchVolumes = volumeRoutes.filter(route => RAYMARCH_TECHNIQUES.has(route.technique)).length;
            return Object.freeze({
                globalTechnique,
                volumeRoutes,
                techniques: Object.freeze(techniques),
                resolvedTechnique: techniques.length === 1
                    ? techniques[0]
                    : techniques.length ? 'HYBRID' : Technique.NONE,
                requiresPostPass: techniques.some(technique => POST_TECHNIQUES.has(technique)),
                activeAnalyticVolumes,
                activeRaymarchVolumes,
                avoidedRaymarches: activeAnalyticVolumes
            });
        }

        return Object.freeze({
            Technique,
            POST_TECHNIQUES,
            RAYMARCH_TECHNIQUES,
            ANALYTIC_TECHNIQUES,
            normalizeTechnique,
            isTechniqueCompatible,
            linearFogFactor,
            exponentialFogFactor,
            beerLambertTransmittance,
            integrateUniformDensity,
            integrateExponentialHeight,
            intersectSphere,
            intersectBox,
            resolve,
            resolveScene
        });
    }
    /* LIGHTFLOW_ATMOSPHERE_V2_CORE_END */

    const AtmosphereV2Core = createAtmosphereV2Core();
    const AtmosphereTechniqueRouter = Object.freeze({
        Technique: AtmosphereV2Core.Technique,
        resolve: input => AtmosphereV2Core.resolve(input),
        resolveScene: input => AtmosphereV2Core.resolveScene(input)
    });

    function readSettings() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return Object.assign({}, DEFAULT_SETTINGS, parsed && typeof parsed === 'object' ? parsed : {});
        } catch (error) {
            console.warn('[Lightflow Atmosphere] Saved settings are invalid; using defaults.', error);
            return Object.assign({}, DEFAULT_SETTINGS);
        }
    }

    function saveSettings(settings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
            if (window.Project && atmosphereProjectSettingsProperty) {
                window.Project.lightflow_atmosphere_v2_settings_json = JSON.stringify({
                    schema_version: 2,
                    ...settings
                });
            }
        } catch (error) {
            if (!storageWriteFailureReported) {
                console.warn('[Lightflow Atmosphere] Settings could not be persisted; project volumes remain usable.', error);
                storageWriteFailureReported = true;
            }
        }
    }

    function hydrateProjectSettings(project) {
        const serialized = project?.lightflow_atmosphere_v2_settings_json;
        if (!serialized) return false;
        try {
            const parsed = JSON.parse(serialized);
            if (!parsed || typeof parsed !== 'object') return false;
            AtmosphereManager.settings = { ...DEFAULT_SETTINGS, ...parsed };
            AtmosphereManager.updateSurfaceFogUniforms?.();
            return true;
        } catch (error) {
            console.warn('[Lightflow Atmosphere] Project settings are invalid; keeping current settings.', error);
            return false;
        }
    }

    function tr(key, fallback) {
        if (typeof tl !== 'function') return fallback || key;
        const translated = tl(key);
        return translated === key ? (fallback || key) : translated;
    }

    function markerColor(index, tone = 'pastel', fallback = 'var(--color-accent)') {
        return window.LightManagerUI?.markerColor?.(index, tone, fallback) || fallback;
    }

    function colorArrayToHex(value) {
        const source = Array.isArray(value) ? value : [255, 255, 255];
        return '#' + source.slice(0, 3).map(channel => {
            return Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0');
        }).join('');
    }

    function hexToColorArray(value, fallback) {
        if (value && typeof value === 'object' && [value._r, value._g, value._b].every(Number.isFinite)) {
            return [value._r, value._g, value._b].map(channel => Math.round(clamp(channel, 0, 255)));
        }
        const match = String(value || '').trim().match(/^#?([0-9a-f]{6})$/i);
        if (!match) return Array.isArray(fallback) ? fallback.slice(0, 3) : [255, 255, 255];
        const integer = parseInt(match[1], 16);
        return [(integer >> 16) & 255, (integer >> 8) & 255, integer & 255];
    }

    function colorArrayToVector(value, target) {
        const source = Array.isArray(value) ? value : [255, 255, 255];
        target.set(
            clamp(finite(source[0], 255) / 255, 0, 8),
            clamp(finite(source[1], 255) / 255, 0, 8),
            clamp(finite(source[2], 255) / 255, 0, 8)
        );
        return target;
    }

    function getCubeMesh(cube) {
        if (!cube) return null;
        return cube.mesh || (window.Project && Project.nodes_3d ? Project.nodes_3d[cube.uuid] : null) || null;
    }

    function getRenderElements() {
        const elements = [];
        const seen = new Set();
        [window.Cube, window.Mesh, window.TextureMesh].forEach(Type => {
            const list = Type && Array.isArray(Type.all) ? Type.all : [];
            list.forEach(element => {
                if (!element || seen.has(element)) return;
                seen.add(element);
                elements.push(element);
            });
        });
        return elements;
    }

    function getSelectedRenderElements() {
        const elements = [];
        const seen = new Set();
        [window.Cube, window.Mesh, window.TextureMesh].forEach(Type => {
            const list = Type && Array.isArray(Type.selected) ? Type.selected : [];
            list.forEach(element => {
                if (!element || seen.has(element)) return;
                seen.add(element);
                elements.push(element);
            });
        });
        return elements;
    }

    function collectPreviews() {
        const previews = new Set();
        const add = preview => {
            if (preview && preview.renderer && typeof preview.render === 'function') previews.add(preview);
        };
        add(window.Preview && Preview.selected);
        add(window.Preview && Preview.all && Preview.all.main);
        add(window.main_preview);
        if (window.Preview && Array.isArray(Preview.all)) Preview.all.forEach(add);
        else if (window.Preview && Preview.all && typeof Preview.all === 'object') Object.values(Preview.all).forEach(add);
        return previews;
    }

    function requestPreviewRender() {
        if (window.LightManagerStudioRenderSession) return;
        if (typeof window.LightflowRequestPreviewRender === 'function') {
            window.LightflowRequestPreviewRender({ cause: 'atmosphere_update' });
            return;
        }
        if (previewRenderFrame !== null) return;
        const revision = atmosphereRevision;
        const project = window.Project || null;
        const render = () => {
            previewRenderFrame = null;
            if (window.LightManagerStudioRenderSession) return;
            if (
                revision !== atmosphereRevision ||
                project !== atmosphereProject ||
                project !== (window.Project || null)
            ) return;
            const preview = window.Preview && Preview.selected;
            if (preview && typeof preview.render === 'function') preview.render();
            else if (window.Canvas && typeof Canvas.updateView === 'function') Canvas.updateView({ elements: [], element_aspects: {} });
        };
        if (typeof requestAnimationFrame === 'function') previewRenderFrame = requestAnimationFrame(render);
        else {
            previewRenderFrame = 'microtask';
            queueMicrotask(render);
        }
    }

    function beginAtmosphereProject(project) {
        const nextProject = project || null;
        if (atmosphereProject === nextProject) return false;
        godRayRuntime?.clear();
        clearParticleEffects();
        AtmosphereManager.releaseProjectResources();
        atmosphereRevision += 1;
        atmosphereProject = nextProject;
        if (typeof previewRenderFrame === 'number' && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(previewRenderFrame);
        }
        previewRenderFrame = null;
        return true;
    }

    const FULLSCREEN_VERTEX_SHADER = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
        }
    `;

    const VOLUME_FRAGMENT_SHADER = `
        precision highp float;
        #define MAX_VOLUMES ${MAX_VOLUMES}
        #define MAX_LIGHTS ${MAX_LIGHTS}
        #define MAX_STEPS ${MAX_RAY_STEPS}
        #define PI 3.141592653589793

        uniform sampler2D tSceneDepth;
        uniform sampler2D tCubeDepth;
        uniform sampler2D uNoiseTexture;
        uniform sampler2D uShadowMap0;
        uniform sampler2D uShadowMap1;
        uniform mat4 uInverseProjection;
        uniform mat4 uCameraWorld;
        uniform mat4 uVolumeInverse[MAX_VOLUMES];
        uniform mat4 uShadowMatrix0;
        uniform mat4 uShadowMatrix1;
        uniform vec4 uVolumeShapeMode[MAX_VOLUMES];
        uniform vec4 uVolumeOptics[MAX_VOLUMES];
        uniform vec4 uVolumeHeightNoise[MAX_VOLUMES];
        uniform vec4 uVolumeCloudWind[MAX_VOLUMES];
        uniform vec4 uVolumeFlags[MAX_VOLUMES];
        uniform vec3 uVolumeColor[MAX_VOLUMES];
        uniform vec3 uVolumeAbsorptionColor[MAX_VOLUMES];
        uniform vec4 uLightPositionType[MAX_LIGHTS];
        uniform vec4 uLightDirectionRange[MAX_LIGHTS];
        uniform vec4 uLightColorIntensity[MAX_LIGHTS];
        uniform vec4 uLightConeShadow[MAX_LIGHTS];
        uniform vec4 uShadowParams0;
        uniform vec4 uShadowParams1;
        uniform vec2 uResolution;
        uniform vec2 uFrameOrigin;
        uniform vec2 uFramePixelScale;
        uniform vec3 uCameraPosition;
        uniform vec3 uAmbientColor;
        uniform float uCameraFar;
        uniform float uTime;
        uniform float uJitterTime;
        uniform int uVolumeCount;
        uniform int uLightCount;
        uniform int uSteps;
        uniform int uShadowSamples;
        uniform bool uOrthographic;
        uniform bool uTemporalJitter;
        uniform bool uCheckerboard;
        uniform float uCheckerboardPhase;
        uniform bool uHelperMask;
        uniform bool uBloomPass;
        uniform bool uLogEncode;
        varying vec2 vUv;

        bool solidDepth(float depth) {
            return depth > 0.000001 && depth < 0.999999;
        }

        vec3 viewPosition(vec2 uv, float depth) {
            vec4 point = uInverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            return point.xyz / max(abs(point.w), 0.000001);
        }

        vec3 worldPosition(vec2 uv, float depth) {
            return (uCameraWorld * vec4(viewPosition(uv, depth), 1.0)).xyz;
        }

        float hash13(vec3 point) {
            point = fract(point * 0.1031);
            point += dot(point, point.yzx + 33.33);
            return fract((point.x + point.y) * point.z);
        }

        float projectedNoise3D(vec3 point) {
            vec2 projectionA = point.xy + point.z * vec2(0.173, 0.317);
            vec2 projectionB = point.yz + point.x * vec2(0.271, 0.119);
            float first = texture2D(uNoiseTexture, projectionA).r;
            float second = texture2D(uNoiseTexture, projectionB).g;
            return mix(first, second, 0.5);
        }

        float fbm(vec3 point, float detail) {
            float result = 0.0;
            float weight = 0.55;
            float normalization = 0.0;
            for (int octave = 0; octave < 3; octave++) {
                // Detail is monotonic with octave: once an octave is disabled,
                // every later octave is disabled too. Stop instead of doing
                // point/weight bookkeeping for samples that cannot contribute.
                if (float(octave) > detail - 0.5) break;
                result += projectedNoise3D(point) * weight;
                normalization += weight;
                point = point * 2.03 + vec3(17.1, 7.7, 13.4);
                weight *= 0.5;
            }
            return result / max(normalization, 0.0001);
        }

        bool volumeInterval(
            int index,
            vec3 rayOrigin,
            vec3 rayDirection,
            out vec2 interval,
            out vec3 localOrigin,
            out vec3 localDirection
        ) {
            interval = vec2(0.0);
            // 2.5: Keep the ray in local volume space. Because the transform is
            // affine, localOrigin + localDirection * t is exactly the same
            // point as transforming the world-space ray sample every step.
            localOrigin = (uVolumeInverse[index] * vec4(rayOrigin, 1.0)).xyz;
            localDirection = (uVolumeInverse[index] * vec4(rayDirection, 0.0)).xyz;
            if (uVolumeShapeMode[index].x < 0.5) {
                vec3 safeDirection = localDirection;
                if (abs(safeDirection.x) < 0.000001) safeDirection.x = safeDirection.x < 0.0 ? -0.000001 : 0.000001;
                if (abs(safeDirection.y) < 0.000001) safeDirection.y = safeDirection.y < 0.0 ? -0.000001 : 0.000001;
                if (abs(safeDirection.z) < 0.000001) safeDirection.z = safeDirection.z < 0.0 ? -0.000001 : 0.000001;
                vec3 first = (-vec3(0.5) - localOrigin) / safeDirection;
                vec3 second = (vec3(0.5) - localOrigin) / safeDirection;
                vec3 nearPlane = min(first, second);
                vec3 farPlane = max(first, second);
                interval = vec2(max(max(nearPlane.x, nearPlane.y), nearPlane.z), min(min(farPlane.x, farPlane.y), farPlane.z));
            } else {
                float a = dot(localDirection, localDirection);
                float b = 2.0 * dot(localOrigin, localDirection);
                float c = dot(localOrigin, localOrigin) - 0.25;
                float discriminant = b * b - 4.0 * a * c;
                if (discriminant < 0.0 || a < 0.0000001) return false;
                float root = sqrt(discriminant);
                interval = vec2((-b - root) / (2.0 * a), (-b + root) / (2.0 * a));
            }
            interval.x = max(interval.x, 0.0);
            return interval.y > interval.x;
        }

        float sampleVolumeDensityLocal(
            int index,
            vec3 local,
            vec2 windOffset
        ) {
            float shape = uVolumeShapeMode[index].x;
            float mode = uVolumeShapeMode[index].y;
            float feather = max(uVolumeShapeMode[index].z, 0.0001);
            float edgeDistance = shape < 0.5
                ? 0.5 - max(abs(local.x), max(abs(local.y), abs(local.z)))
                : 0.5 - length(local);
            if (edgeDistance <= 0.0) return 0.0;
            float edge = smoothstep(0.0, feather * 0.5, edgeDistance);
            // Convert compact Blockbench units into a practical optical scale.
            // This prevents a normal 16-64 unit domain from flattening all
            // surface lighting while keeping density behavior predictable.
            float density = uVolumeOptics[index].x * 0.12;
            if (density <= 0.0) return 0.0;
            float normalizedHeight = clamp(local.y + 0.5, 0.0, 1.0);
            float heightFalloff = uVolumeHeightNoise[index].x;
            float heightOffset = uVolumeHeightNoise[index].y;
            if (mode > 0.5) {
                density *= exp(-heightFalloff * max(normalizedHeight - heightOffset, 0.0));
            }
            if (mode > 1.5) {
                float noiseScale = max(uVolumeHeightNoise[index].z, 0.01);
                float detail = uVolumeHeightNoise[index].w;
                // The per-volume time multiplication is prepared once per
                // fragment before raymarching, rather than once per step.
                vec3 wind = vec3(windOffset.x, 0.0, windOffset.y);
                float cloudNoise = fbm((local + 0.5) * noiseScale + wind, detail);
                float coverage = clamp(uVolumeCloudWind[index].x, 0.0, 0.99);
                float erosion = max(uVolumeCloudWind[index].y, 0.01);
                density *= smoothstep(coverage, min(1.0, coverage + erosion), cloudNoise);
            }
            return max(density * edge, 0.0);
        }

        float henyeyGreensteinPrepared(
            float cosTheta,
            float g,
            float gSquared,
            float numerator
        ) {
            float denominator = max(
                1.0 + gSquared - 2.0 * g * cosTheta,
                0.0001
            );
            // Light Manager uses artist-facing intensity units. Relative HG
            // normalization preserves the directional lobe without making an
            // intensity of 1 almost invisible after the physical 1/(4*pi).
            // x^1.5 == x * sqrt(x), avoiding a general pow() in the
            // innermost volumetric-lighting path.
            return numerator / (denominator * sqrt(denominator));
        }

        float unpackDepth(vec4 packedDepth) {
            const vec4 unpackFactors = vec4(
                0.000000059371814728,
                0.000015199184417725,
                0.0038909912109375,
                0.99609375
            );
            return dot(packedDepth, unpackFactors);
        }

        float shadowCompare0(vec3 worldPoint) {
            vec4 projected = uShadowMatrix0 * vec4(worldPoint, 1.0);
            vec3 coordinates = projected.xyz / max(projected.w, 0.000001);
            if (coordinates.x <= 0.0 || coordinates.x >= 1.0 || coordinates.y <= 0.0 || coordinates.y >= 1.0 || coordinates.z <= 0.0 || coordinates.z >= 1.0) return 1.0;
            vec2 offset = uShadowParams0.xy;
            float bias = uShadowParams0.z;
            float compareDepth = coordinates.z + bias;
            if (uShadowSamples <= 1) return step(compareDepth, unpackDepth(texture2D(uShadowMap0, coordinates.xy)));
            float visibility = 0.0;
            visibility += step(compareDepth, unpackDepth(texture2D(uShadowMap0, coordinates.xy + vec2(-offset.x, -offset.y))));
            visibility += step(compareDepth, unpackDepth(texture2D(uShadowMap0, coordinates.xy + vec2( offset.x, -offset.y))));
            visibility += step(compareDepth, unpackDepth(texture2D(uShadowMap0, coordinates.xy + vec2(-offset.x,  offset.y))));
            visibility += step(compareDepth, unpackDepth(texture2D(uShadowMap0, coordinates.xy + vec2( offset.x,  offset.y))));
            return visibility * 0.25;
        }

        float shadowCompare1(vec3 worldPoint) {
            vec4 projected = uShadowMatrix1 * vec4(worldPoint, 1.0);
            vec3 coordinates = projected.xyz / max(projected.w, 0.000001);
            if (coordinates.x <= 0.0 || coordinates.x >= 1.0 || coordinates.y <= 0.0 || coordinates.y >= 1.0 || coordinates.z <= 0.0 || coordinates.z >= 1.0) return 1.0;
            vec2 offset = uShadowParams1.xy;
            float bias = uShadowParams1.z;
            float compareDepth = coordinates.z + bias;
            if (uShadowSamples <= 1) return step(compareDepth, unpackDepth(texture2D(uShadowMap1, coordinates.xy)));
            float visibility = 0.0;
            visibility += step(compareDepth, unpackDepth(texture2D(uShadowMap1, coordinates.xy + vec2(-offset.x, -offset.y))));
            visibility += step(compareDepth, unpackDepth(texture2D(uShadowMap1, coordinates.xy + vec2( offset.x, -offset.y))));
            visibility += step(compareDepth, unpackDepth(texture2D(uShadowMap1, coordinates.xy + vec2(-offset.x,  offset.y))));
            visibility += step(compareDepth, unpackDepth(texture2D(uShadowMap1, coordinates.xy + vec2( offset.x,  offset.y))));
            return visibility * 0.25;
        }

        float lightShadow(int slot, vec3 worldPoint) {
            float visibility = 1.0;
            if (slot == 0) {
                visibility = shadowCompare0(worldPoint);
            } else if (slot == 1) {
                visibility = shadowCompare1(worldPoint);
            }
            return visibility;
        }

        vec3 volumeLighting(int volumeIndex, vec3 worldPoint, vec3 viewDirection) {
            vec3 lighting = uAmbientColor * uVolumeFlags[volumeIndex].y;
            float anisotropy = clamp(
                uVolumeOptics[volumeIndex].w,
                -0.92,
                0.92
            );
            float anisotropySquared = anisotropy * anisotropy;
            float phaseNumerator = 1.0 - anisotropySquared;
            float shadowFill = clamp(uVolumeShapeMode[volumeIndex].w, 0.0, 1.0);
            bool receiveShadows = uVolumeFlags[volumeIndex].x > 0.5;
            for (int lightIndex = 0; lightIndex < MAX_LIGHTS; lightIndex++) {
                if (lightIndex >= uLightCount) break;
                #ifdef LF_DIRECTIONAL_ONLY
                    if (lightIndex > 0) break;
                #endif
                vec4 positionType = uLightPositionType[lightIndex];
                vec4 directionRange = uLightDirectionRange[lightIndex];
                vec4 colorIntensity = uLightColorIntensity[lightIndex];
                if (colorIntensity.w <= 0.0) continue;
                if (max(colorIntensity.r, max(colorIntensity.g, colorIntensity.b)) <= 0.0) continue;
                vec4 coneShadow = uLightConeShadow[lightIndex];
                vec3 toLight;
                float attenuation = 1.0;
                if (positionType.w < 0.5) {
                    // Directions are normalized once when Light Manager data is
                    // uploaded; volumetric steps can consume them directly.
                    toLight = -directionRange.xyz;
                } else {
                    vec3 delta = positionType.xyz - worldPoint;
                    float distanceSquared = dot(delta, delta);
                    if (
                        directionRange.w > 0.001 &&
                        distanceSquared >= directionRange.w * directionRange.w
                    ) continue;
                    float distanceToLight = max(sqrt(max(distanceSquared, 0.0)), 0.0001);
                    toLight = delta / distanceToLight;
                    if (directionRange.w > 0.001) {
                        float normalizedDistance = distanceToLight / directionRange.w;
                        attenuation = 1.0 / (1.0 + 4.0 * normalizedDistance * normalizedDistance);
                        attenuation *= 1.0 - smoothstep(0.82, 1.0, normalizedDistance);
                    } else {
                        attenuation = 1.0 / (1.0 + 0.025 * distanceToLight * distanceToLight);
                    }
                    if (positionType.w > 1.5) {
                        float cone = dot(directionRange.xyz, -toLight);
                        attenuation *= smoothstep(coneShadow.x, max(coneShadow.y, coneShadow.x + 0.0001), cone);
                    }
                }
                if (attenuation <= 0.00001) continue;
                // viewDirection points from the camera into the scene, while
                // the phase function needs the direction from the sample back
                // to the camera. The old sign inverted forward scattering and
                // made real camera-facing shafts almost disappear.
                float phase = henyeyGreensteinPrepared(
                    dot(toLight, -viewDirection),
                    anisotropy,
                    anisotropySquared,
                    phaseNumerator
                );
                int shadowSlot = int(floor(coneShadow.z + 0.5));
                float visibility = (receiveShadows && shadowSlot >= 0)
                    ? lightShadow(shadowSlot, worldPoint)
                    : 1.0;
                // A small fill approximates unresolved multiple scattering for
                // fog and clouds. Light-shaft presets leave it at zero so a
                // fully occluded sample contributes no visible medium.
                visibility = mix(shadowFill, 1.0, visibility);
                lighting += colorIntensity.rgb * colorIntensity.w * attenuation * phase * visibility;
            }
            return max(lighting, vec3(0.0));
        }

        void main() {
            if (uCheckerboard) {
                float parity = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y) + uCheckerboardPhase, 2.0);
                if (parity > 0.5) {
                    gl_FragColor = vec4(0.0);
                    return;
                }
            }
            float sceneDepth = texture2D(tSceneDepth, vUv).x;
            float cubeDepth = texture2D(tCubeDepth, vUv).x;
            if (uHelperMask && solidDepth(sceneDepth)) {
                if (!solidDepth(cubeDepth)) {
                    gl_FragColor = vec4(0.0);
                    return;
                }
                float sceneZ = abs(viewPosition(vUv, sceneDepth).z);
                float cubeZ = abs(viewPosition(vUv, cubeDepth).z);
                if (abs(sceneZ - cubeZ) > max(0.012, cubeZ * 0.00045)) {
                    gl_FragColor = vec4(0.0);
                    return;
                }
            }

            vec3 nearView = viewPosition(vUv, 0.0);
            vec3 farView = viewPosition(vUv, 1.0);
            vec3 nearWorld = (uCameraWorld * vec4(nearView, 1.0)).xyz;
            vec3 farWorld = (uCameraWorld * vec4(farView, 1.0)).xyz;
            vec3 rayOrigin = uOrthographic ? nearWorld : uCameraPosition;
            vec3 rayDirection = normalize(farWorld - rayOrigin);
            float sceneDistance = uCameraFar;
            if (solidDepth(cubeDepth)) sceneDistance = length(worldPosition(vUv, cubeDepth) - rayOrigin);

            float rayStart = 1.0e20;
            float rayEnd = -1.0;
            float raymarchStart = 1.0e20;
            float raymarchEnd = -1.0;
            vec3 volumeLocalOrigins[MAX_VOLUMES];
            vec3 volumeLocalDirections[MAX_VOLUMES];
            vec2 volumeIntervals[MAX_VOLUMES];
            vec2 volumeWindOffsets[MAX_VOLUMES];
            for (int volumeIndex = 0; volumeIndex < MAX_VOLUMES; volumeIndex++) {
                if (volumeIndex >= uVolumeCount) break;
                // ANGLE's D3D backend does not reliably prove that GLSL out
                // parameters are written on every control-flow path. Seed the
                // values explicitly so a rejected sphere interval cannot leave
                // undefined data in the fixed-size arrays below.
                vec2 interval = vec2(0.0);
                vec3 localOrigin = vec3(0.0);
                vec3 localDirection = vec3(0.0);
                volumeIntervals[volumeIndex] = vec2(1.0e20, -1.0);
                volumeWindOffsets[volumeIndex] =
                    uVolumeCloudWind[volumeIndex].zw * uTime;
                if (volumeInterval(
                    volumeIndex,
                    rayOrigin,
                    rayDirection,
                    interval,
                    localOrigin,
                    localDirection
                )) {
                    vec2 clippedInterval = vec2(
                        max(interval.x, 0.0),
                        min(interval.y, sceneDistance)
                    );
                    volumeIntervals[volumeIndex] = clippedInterval;
                    rayStart = min(rayStart, clippedInterval.x);
                    rayEnd = max(rayEnd, clippedInterval.y);
                    if (uVolumeShapeMode[volumeIndex].y > 1.5) {
                        raymarchStart = min(raymarchStart, clippedInterval.x);
                        raymarchEnd = max(raymarchEnd, clippedInterval.y);
                    }
                }
                volumeLocalOrigins[volumeIndex] = localOrigin;
                volumeLocalDirections[volumeIndex] = localDirection;
            }
            if (rayEnd <= rayStart || rayStart >= sceneDistance) {
                gl_FragColor = vec4(0.0);
                return;
            }

            rayStart = max(rayStart, 0.0);
            rayEnd = min(rayEnd, sceneDistance);
            raymarchStart = max(raymarchStart, 0.0);
            raymarchEnd = min(raymarchEnd, sceneDistance);
            float stepLength = max(raymarchEnd - raymarchStart, 0.0) / float(max(uSteps, 1));
            vec2 globalPixel = floor(gl_FragCoord.xy * uFramePixelScale + uFrameOrigin);
            float temporalSlice = uTemporalJitter ? floor(uJitterTime * 24.0) : 0.0;
            float jitter = hash13(vec3(globalPixel, temporalSlice));
            float distanceAlongRay = raymarchStart + stepLength * jitter;
            vec3 transmittance = vec3(1.0);
            vec3 accumulated = vec3(0.0);

            // Uniform and height-local media are integrated without marching.
            // Two-point Gauss-Legendre quadrature preserves smooth edge
            // feathering and height falloff while replacing 24-96 samples
            // with exactly two density evaluations per intersected volume.
            const float GAUSS_NODE = 0.5773502691896257;
            for (int analyticIndex = 0; analyticIndex < MAX_VOLUMES; analyticIndex++) {
                if (analyticIndex >= uVolumeCount) break;
                if (uVolumeShapeMode[analyticIndex].y > 1.5) continue;
                vec2 interval = volumeIntervals[analyticIndex];
                float segmentStart = max(interval.x, 0.0);
                float segmentEnd = min(interval.y, sceneDistance);
                float segmentLength = max(segmentEnd - segmentStart, 0.0);
                if (segmentLength <= 0.000001) continue;
                float midpoint = (segmentStart + segmentEnd) * 0.5;
                float halfLength = segmentLength * 0.5;
                float sampleDistance0 = midpoint - halfLength * GAUSS_NODE;
                float sampleDistance1 = midpoint + halfLength * GAUSS_NODE;
                vec3 localPoint0 = volumeLocalOrigins[analyticIndex] +
                    volumeLocalDirections[analyticIndex] * sampleDistance0;
                vec3 localPoint1 = volumeLocalOrigins[analyticIndex] +
                    volumeLocalDirections[analyticIndex] * sampleDistance1;
                float integratedDensity = halfLength * (
                    sampleVolumeDensityLocal(analyticIndex, localPoint0, vec2(0.0)) +
                    sampleVolumeDensityLocal(analyticIndex, localPoint1, vec2(0.0))
                );
                if (integratedDensity <= 0.000001) continue;
                float scattering = uVolumeOptics[analyticIndex].y;
                float absorption = uVolumeOptics[analyticIndex].z;
                bool lightShaft = uVolumeFlags[analyticIndex].w > 0.5;
                vec3 integratedSigmaS = uVolumeColor[analyticIndex] * scattering * integratedDensity;
                vec3 integratedSigmaA = uVolumeAbsorptionColor[analyticIndex] * absorption * integratedDensity;
                vec3 worldMidpoint = rayOrigin + rayDirection * midpoint;
                vec3 source = integratedSigmaS * volumeLighting(
                    analyticIndex,
                    worldMidpoint,
                    rayDirection
                );
                if (lightShaft) {
                    accumulated += transmittance * source;
                    continue;
                }
                float opticalDepth = dot(
                    integratedSigmaS + integratedSigmaA,
                    vec3(0.2126, 0.7152, 0.0722)
                );
                float segmentTransmission = exp(-max(opticalDepth, 0.0));
                float integrationScale = opticalDepth > 0.000001
                    ? (1.0 - segmentTransmission) / opticalDepth
                    : 1.0;
                accumulated += transmittance * source * integrationScale;
                transmittance *= segmentTransmission;
            }

            #ifndef LF_ANALYTIC_ONLY
            for (int stepIndex = 0; stepIndex < MAX_STEPS; stepIndex++) {
                if (stepIndex >= uSteps || distanceAlongRay >= raymarchEnd) break;
                // The union of several local domains may contain long empty
                // gaps. Jump directly to the next interval instead of burning
                // ray steps where no volume can contribute. Occupied segments
                // retain the exact same step length and visual integration.
                bool insideAnyVolume = false;
                float nextVolumeStart = raymarchEnd;
                for (int intervalIndex = 0; intervalIndex < MAX_VOLUMES; intervalIndex++) {
                    if (intervalIndex >= uVolumeCount) break;
                    if (uVolumeShapeMode[intervalIndex].y <= 1.5) continue;
                    vec2 interval = volumeIntervals[intervalIndex];
                    insideAnyVolume = insideAnyVolume || (
                        distanceAlongRay >= interval.x && distanceAlongRay <= interval.y
                    );
                    if (interval.x > distanceAlongRay) {
                        nextVolumeStart = min(nextVolumeStart, interval.x);
                    }
                }
                if (!insideAnyVolume) {
                    distanceAlongRay = max(distanceAlongRay + stepLength, nextVolumeStart);
                    continue;
                }
                vec3 worldPoint = rayOrigin + rayDirection * distanceAlongRay;
                vec3 scatteringSource = vec3(0.0);
                vec3 extinctionColor = vec3(0.0);
                for (int volumeIndex = 0; volumeIndex < MAX_VOLUMES; volumeIndex++) {
                    if (volumeIndex >= uVolumeCount) break;
                    if (uVolumeShapeMode[volumeIndex].y <= 1.5) continue;
                    vec2 activeInterval = volumeIntervals[volumeIndex];
                    if (
                        distanceAlongRay < activeInterval.x ||
                        distanceAlongRay > activeInterval.y
                    ) continue;
                    float scattering = uVolumeOptics[volumeIndex].y;
                    float absorption = uVolumeOptics[volumeIndex].z;
                    bool lightShaft = uVolumeFlags[volumeIndex].w > 0.5;
                    float bloomContribution = uVolumeFlags[volumeIndex].z;
                    // A volume with neither scattering nor physical absorption
                    // is optically empty; avoid density/noise work entirely.
                    if (scattering <= 0.0 && (lightShaft || absorption <= 0.0)) continue;
                    // Shaft media have no extinction. In a bloom-only pass a
                    // zero bloom contribution therefore makes them fully inert.
                    if (uBloomPass && lightShaft && bloomContribution <= 0.0) continue;
                    vec3 localPoint =
                        volumeLocalOrigins[volumeIndex] +
                        volumeLocalDirections[volumeIndex] * distanceAlongRay;
                    float density = sampleVolumeDensityLocal(
                        volumeIndex,
                        localPoint,
                        volumeWindOffsets[volumeIndex]
                    );
                    if (density <= 0.000001) continue;
                    vec3 sigmaS = uVolumeColor[volumeIndex] * scattering * density;
                    vec3 sigmaA = uVolumeAbsorptionColor[volumeIndex] * absorption * density;
                    float sourceScale = uBloomPass ? bloomContribution : 1.0;
                    // A black scattering carrier contributes exactly zero even
                    // when scalar scattering is enabled. Avoid the full light
                    // loop and its shadow/phase work in that case.
                    if (
                        scattering > 0.0 &&
                        sourceScale > 0.0 &&
                        max(sigmaS.r, max(sigmaS.g, sigmaS.b)) > 0.0
                    ) {
                        vec3 lightEnergy = volumeLighting(
                            volumeIndex,
                            worldPoint,
                            rayDirection
                        );
                        scatteringSource += sigmaS * lightEnergy * sourceScale;
                    }
                    // Physical media attenuate the scene with Beer-Lambert.
                    // Artistic God Rays are emissive shafts: applying the same
                    // extinction in a shadow produced an opaque black volume.
                    // Keeping their extinction at zero makes unlit samples
                    // transparent while lit samples compose additively.
                    if (!lightShaft) extinctionColor += sigmaS + sigmaA;
                }
                float extinction = dot(extinctionColor, vec3(0.2126, 0.7152, 0.0722));
                if (extinction > 0.000001) {
                    float stepTransmission = exp(-extinction * stepLength);
                    vec3 integratedScatter = scatteringSource * ((1.0 - stepTransmission) / extinction);
                    accumulated += transmittance * integratedScatter;
                    transmittance *= stepTransmission;
                } else {
                    accumulated += transmittance * scatteringSource * stepLength;
                }
                if (max(transmittance.r, max(transmittance.g, transmittance.b)) < 0.008) break;
                distanceAlongRay += stepLength;
            }
            #endif

            float opacity = 1.0 - dot(transmittance, vec3(0.2126, 0.7152, 0.0722));
            if (uBloomPass) opacity = clamp(max(accumulated.r, max(accumulated.g, accumulated.b)), 0.0, 1.0);
            vec3 outputScattering = max(accumulated, vec3(0.0));
            if (uLogEncode) {
                outputScattering = log2(vec3(1.0) + clamp(outputScattering, vec3(0.0), vec3(16.0))) * 0.2446505421;
            }
            gl_FragColor = vec4(outputScattering, clamp(opacity, 0.0, 1.0));
        }
    `;

    const COMPOSITE_FRAGMENT_SHADER = `
        precision highp float;
        uniform sampler2D tVolume;
        uniform sampler2D tSceneDepth;
        uniform sampler2D tCubeDepth;
        uniform mat4 uInverseProjection;
        uniform vec2 uVolumeTexel;
        uniform bool uHelperMask;
        uniform bool uBilateralUpsample;
        uniform bool uBloomComposite;
        uniform bool uBloomLinear;
        uniform float uBloomMultiplier;
        uniform bool uLogEncoded;
        uniform vec4 uArtParams;
        uniform vec2 uDitherQuantize;
        uniform vec3 uRampNearColor;
        uniform vec3 uRampFarColor;
        uniform vec2 uRampParams;
        uniform float uCompositeCameraFar;
        varying vec2 vUv;

        bool solidDepth(float depth) { return depth > 0.000001 && depth < 0.999999; }
        float viewZ(vec2 uv, float depth) {
            vec4 point = uInverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            return abs(point.z / max(abs(point.w), 0.000001));
        }
        float bilateralWeight(bool centerSolid, float centerViewDepth, vec2 uv) {
            float sampleDepth = texture2D(tCubeDepth, uv).x;
            bool sampleSolid = solidDepth(sampleDepth);
            if (centerSolid != sampleSolid) return 0.002;
            if (!centerSolid) return 1.0;
            float difference = abs(centerViewDepth - viewZ(uv, sampleDepth));
            return exp(-difference * 7.5);
        }
        vec3 toneMapPhysicalMedium(vec3 premultipliedRadiance, float opacity) {
            if (opacity <= 0.000001) return premultipliedRadiance;
            // The composite material bypasses Three's tone mapping. Convert the
            // integrated premultiplied scattering back to incident radiance,
            // apply a bounded display mapping, then premultiply again. Without
            // this step a low-opacity fog under an HDR sun becomes a flat white
            // additive plate instead of a translucent participating medium.
            vec3 radiance = max(premultipliedRadiance, vec3(0.0)) / opacity;
            return (radiance / (vec3(1.0) + radiance)) * opacity;
        }
        vec4 finalizeVolume(vec4 color) {
            if (uLogEncoded) {
                color.rgb = max(exp2(color.rgb / 0.2446505421) - vec3(1.0), vec3(0.0));
            }
            if (!uBloomComposite && color.a > 0.000001) {
                color.rgb = toneMapPhysicalMedium(color.rgb, color.a);
            }
            float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
            color.rgb = mix(vec3(luminance), color.rgb, uArtParams.y);
            color.rgb = max((color.rgb - vec3(0.5)) * uArtParams.z + vec3(0.5), vec3(0.0));
            if (uArtParams.w > 1.5) color.rgb = floor(color.rgb * uArtParams.w + 0.5) / uArtParams.w;
            if (uDitherQuantize.y > 1.5) color.rgb = floor(color.rgb * uDitherQuantize.y + 0.5) / uDitherQuantize.y;
            if (uDitherQuantize.x > 0.0001) {
                float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
                color.rgb = max(color.rgb + dither * uDitherQuantize.x / 255.0, vec3(0.0));
            }
            if (uRampParams.x > 0.0001) {
                float rampDepth = texture2D(tCubeDepth, vUv).r;
                float rampDistance = solidDepth(rampDepth)
                    ? viewZ(vUv, rampDepth) / max(uCompositeCameraFar, 0.001)
                    : 1.0;
                float rampT = pow(clamp(rampDistance, 0.0, 1.0), max(uRampParams.y, 0.05));
                vec3 rampColor = mix(uRampNearColor, uRampFarColor, rampT);
                color.rgb = mix(color.rgb, color.rgb * rampColor, uRampParams.x);
            }
            color.a = min(color.a, uArtParams.x);
            if (!uBloomComposite) return color;
            vec3 linearBloom = max(color.rgb * uBloomMultiplier, vec3(0.0));
            color.rgb = uBloomLinear
                ? linearBloom
                : log2(
                    vec3(1.0) + clamp(linearBloom, vec3(0.0), vec3(16.0))
                ) * 0.2446505421;
            color.a = clamp(
                max(linearBloom.r, max(linearBloom.g, linearBloom.b)),
                0.0,
                1.0
            );
            return color;
        }
        void main() {
            float sceneDepth = texture2D(tSceneDepth, vUv).x;
            float cubeDepth = texture2D(tCubeDepth, vUv).x;
            bool cubeSolid = solidDepth(cubeDepth);
            // 2.5: The center cube view depth is invariant for all four
            // bilateral neighbors. Reconstruct it once instead of 4-6 times.
            float cubeViewDepth = cubeSolid ? viewZ(vUv, cubeDepth) : 0.0;
            if (uHelperMask && solidDepth(sceneDepth)) {
                float sceneViewDepth = viewZ(vUv, sceneDepth);
                if (!cubeSolid || abs(sceneViewDepth - cubeViewDepth) > max(0.012, cubeViewDepth * 0.00045)) {
                    gl_FragColor = vec4(0.0);
                    return;
                }
            }
            if (!uBilateralUpsample) {
                gl_FragColor = finalizeVolume(texture2D(tVolume, vUv));
                return;
            }
            vec4 color = texture2D(tVolume, vUv) * 2.0;
            float weight = 2.0;
            vec2 uv0 = clamp(vUv + vec2(-uVolumeTexel.x, 0.0), vec2(0.0), vec2(1.0));
            vec2 uv1 = clamp(vUv + vec2( uVolumeTexel.x, 0.0), vec2(0.0), vec2(1.0));
            vec2 uv2 = clamp(vUv + vec2(0.0, -uVolumeTexel.y), vec2(0.0), vec2(1.0));
            vec2 uv3 = clamp(vUv + vec2(0.0,  uVolumeTexel.y), vec2(0.0), vec2(1.0));
            float weight0 = bilateralWeight(cubeSolid, cubeViewDepth, uv0);
            float weight1 = bilateralWeight(cubeSolid, cubeViewDepth, uv1);
            float weight2 = bilateralWeight(cubeSolid, cubeViewDepth, uv2);
            float weight3 = bilateralWeight(cubeSolid, cubeViewDepth, uv3);
            color += texture2D(tVolume, uv0) * weight0;
            color += texture2D(tVolume, uv1) * weight1;
            color += texture2D(tVolume, uv2) * weight2;
            color += texture2D(tVolume, uv3) * weight3;
            weight += weight0 + weight1 + weight2 + weight3;
            gl_FragColor = finalizeVolume(color / max(weight, 0.0001));
        }
    `;

    const TEMPORAL_FRAGMENT_SHADER = `
        precision highp float;
        uniform sampler2D tCurrent;
        uniform sampler2D tHistory;
        uniform sampler2D tCurrentDepth;
        uniform sampler2D tHistoryDepth;
        uniform vec2 uTexelSize;
        uniform float uHistoryBlend;
        uniform float uDepthRejectThreshold;
        uniform bool uCheckerboard;
        uniform float uCheckerboardPhase;
        uniform mat4 uInverseProjection;
        uniform mat4 uCameraWorld;
        uniform mat4 uPreviousViewProjection;
        varying vec2 vUv;

        vec3 temporalWorldPosition(vec2 uv, float depth) {
            vec4 viewPoint = uInverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            viewPoint /= max(abs(viewPoint.w), 0.000001);
            return (uCameraWorld * vec4(viewPoint.xyz, 1.0)).xyz;
        }

        void main() {
            vec4 current = texture2D(tCurrent, vUv);
            if (uHistoryBlend <= 0.0) {
                gl_FragColor = current;
                return;
            }
            vec4 left = texture2D(tCurrent, clamp(vUv - vec2(uTexelSize.x, 0.0), vec2(0.0), vec2(1.0)));
            vec4 right = texture2D(tCurrent, clamp(vUv + vec2(uTexelSize.x, 0.0), vec2(0.0), vec2(1.0)));
            vec4 down = texture2D(tCurrent, clamp(vUv - vec2(0.0, uTexelSize.y), vec2(0.0), vec2(1.0)));
            vec4 up = texture2D(tCurrent, clamp(vUv + vec2(0.0, uTexelSize.y), vec2(0.0), vec2(1.0)));
            vec4 lower = min(current, min(min(left, right), min(down, up)));
            vec4 upper = max(current, max(max(left, right), max(down, up)));
            float currentDepth = texture2D(tCurrentDepth, vUv).r;
            vec3 worldPoint = temporalWorldPosition(vUv, currentDepth);
            vec4 previousClip = uPreviousViewProjection * vec4(worldPoint, 1.0);
            if (previousClip.w <= 0.000001) {
                gl_FragColor = current;
                return;
            }
            vec3 previousNdc = previousClip.xyz / previousClip.w;
            vec2 previousUv = previousNdc.xy * 0.5 + 0.5;
            if (any(lessThan(previousUv, vec2(0.0))) || any(greaterThan(previousUv, vec2(1.0)))) {
                gl_FragColor = current;
                return;
            }
            float expectedPreviousDepth = previousNdc.z * 0.5 + 0.5;
            float storedPreviousDepth = texture2D(tHistoryDepth, previousUv).r;
            if (abs(expectedPreviousDepth - storedPreviousDepth) > uDepthRejectThreshold) {
                gl_FragColor = current;
                return;
            }
            vec4 reprojectedHistory = texture2D(tHistory, previousUv);
            float parity = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y) + uCheckerboardPhase, 2.0);
            if (uCheckerboard && parity > 0.5) {
                gl_FragColor = reprojectedHistory;
                return;
            }
            vec4 history = clamp(reprojectedHistory, lower - vec4(0.025), upper + vec4(0.025));
            gl_FragColor = mix(current, history, clamp(uHistoryBlend, 0.0, 0.92));
        }
    `;

    const DEPTH_HISTORY_FRAGMENT_SHADER = `
        precision highp float;
        uniform sampler2D tDepth;
        varying vec2 vUv;
        void main() {
            float depth = texture2D(tDepth, vUv).r;
            gl_FragColor = vec4(depth, depth, depth, 1.0);
        }
    `;

    const SCREEN_SHAFTS_FRAGMENT_SHADER = `
        precision highp float;
        #define MAX_SHAFT_SAMPLES 16
        uniform sampler2D tSceneDepth;
        uniform vec2 uLightUv;
        uniform vec3 uShaftColor;
        uniform vec4 uShaftParams;
        uniform vec2 uShaftViewport;
        uniform float uShaftSamples;
        varying vec2 vUv;

        float shaftSkyVisibility(vec2 uv) {
            float depth = texture2D(tSceneDepth, clamp(uv, vec2(0.0), vec2(1.0))).r;
            return smoothstep(0.985, 0.9998, depth);
        }

        void main() {
            vec2 direction = (uLightUv - vUv) * uShaftParams.x / max(uShaftSamples, 1.0);
            vec2 sampleUv = vUv;
            float illumination = 1.0;
            float accumulated = 0.0;
            float normalization = 0.0;
            for (int sampleIndex = 0; sampleIndex < MAX_SHAFT_SAMPLES; sampleIndex++) {
                if (float(sampleIndex) >= uShaftSamples) break;
                sampleUv += direction;
                float visibility = shaftSkyVisibility(sampleUv);
                accumulated += visibility * illumination * uShaftParams.w;
                normalization += illumination;
                illumination *= uShaftParams.y;
            }
            float radius = length((vUv - uLightUv) * vec2(
                uShaftViewport.x / max(uShaftViewport.y, 1.0), 1.0
            ));
            float radialFade = 1.0 - smoothstep(0.0, max(uShaftParams.z, 0.001), radius);
            float offscreenFade = smoothstep(-0.35, 0.05, uLightUv.x) *
                (1.0 - smoothstep(0.95, 1.35, uLightUv.x)) *
                smoothstep(-0.35, 0.05, uLightUv.y) *
                (1.0 - smoothstep(0.95, 1.35, uLightUv.y));
            float shaft = accumulated / max(normalization, 0.0001) * radialFade * offscreenFade;
            gl_FragColor = vec4(uShaftColor * shaft, clamp(shaft, 0.0, 1.0));
        }
    `;

    function createDepthTexture() {
        const texture = new THREE.DepthTexture(1, 1);
        texture.type = THREE.UnsignedIntType || THREE.UnsignedShortType;
        texture.format = THREE.DepthFormat;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        return texture;
    }

    function createDepthTarget() {
        const depthTexture = createDepthTexture();
        const target = new THREE.WebGLRenderTarget(1, 1, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            depthBuffer: true,
            stencilBuffer: false,
            depthTexture
        });
        if (!target.depthTexture) target.depthTexture = depthTexture;
        return target;
    }

    function configureRenderTarget(target, width, height) {
        if (!target) return;
        target.viewport?.set?.(0, 0, width, height);
        target.scissor?.set?.(0, 0, width, height);
        target.scissorTest = false;
    }

    function getPhysicalFramebufferViewport(renderer, preview) {
        const viewport = new THREE.Vector4();
        try {
            renderer?.getCurrentViewport?.(viewport);
        } catch (error) {}
        if (viewport.z > 0 && viewport.w > 0) return viewport;

        const target = renderer?.getRenderTarget?.() || null;
        if (target?.viewport && target.viewport.z > 0 && target.viewport.w > 0) {
            return viewport.copy(target.viewport);
        }

        const drawingSize = renderer?.getDrawingBufferSize
            ? renderer.getDrawingBufferSize(new THREE.Vector2())
            : new THREE.Vector2(
                renderer?.domElement?.width || preview?.canvas?.width || preview?.width || 800,
                renderer?.domElement?.height || preview?.canvas?.height || preview?.height || 600
            );
        return viewport.set(0, 0, drawingSize.x, drawingSize.y);
    }

    function setPhysicalFramebufferScissor(renderer, rect) {
        const physical = new THREE.Vector4(rect.x, rect.y, rect.width, rect.height);
        // Three r129 public viewport/scissor setters expect logical units and
        // multiply them by DPR. The render pipeline already works in physical
        // framebuffer pixels, so use WebGLState directly to avoid a second 1.5x
        // Windows display-scale multiplication.
        if (renderer?.state?.scissor && renderer.state?.setScissorTest) {
            renderer.state.scissor(physical);
            renderer.state.setScissorTest(true);
            return;
        }
        const pixelRatio = Math.max(0.0001, finite(renderer?.getPixelRatio?.(), window.devicePixelRatio || 1));
        renderer?.setScissor?.(
            physical.x / pixelRatio,
            physical.y / pixelRatio,
            physical.z / pixelRatio,
            physical.w / pixelRatio
        );
        renderer?.setScissorTest?.(true);
    }

    function createWhiteTexture() {
        const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        return texture;
    }

    function createNoiseTexture(size) {
        const dimension = Math.max(32, Math.round(size || 128));
        const data = new Uint8Array(dimension * dimension * 4);
        const hash = (x, y, seed) => {
            let value = (x * 374761393 + y * 668265263 + seed * 69069) | 0;
            value = (value ^ (value >>> 13)) * 1274126177;
            return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
        };
        const sampleGrid = (x, y, cells, seed) => {
            const gx = x / dimension * cells;
            const gy = y / dimension * cells;
            const x0 = Math.floor(gx) % cells;
            const y0 = Math.floor(gy) % cells;
            const x1 = (x0 + 1) % cells;
            const y1 = (y0 + 1) % cells;
            let tx = gx - Math.floor(gx);
            let ty = gy - Math.floor(gy);
            tx = tx * tx * (3 - 2 * tx);
            ty = ty * ty * (3 - 2 * ty);
            const bottom = hash(x0, y0, seed) * (1 - tx) + hash(x1, y0, seed) * tx;
            const top = hash(x0, y1, seed) * (1 - tx) + hash(x1, y1, seed) * tx;
            return bottom * (1 - ty) + top * ty;
        };
        for (let y = 0; y < dimension; y++) {
            for (let x = 0; x < dimension; x++) {
                for (let channel = 0; channel < 3; channel++) {
                    let value = 0;
                    let amplitude = 0.56;
                    let total = 0;
                    for (let octave = 0; octave < 4; octave++) {
                        value += sampleGrid(x, y, 4 << octave, 17 + channel * 37 + octave * 11) * amplitude;
                        total += amplitude;
                        amplitude *= 0.5;
                    }
                    data[(y * dimension + x) * 4 + channel] = Math.round(clamp(value / total, 0, 1) * 255);
                }
                data[(y * dimension + x) * 4 + 3] = 255;
            }
        }
        const texture = new THREE.DataTexture(data, dimension, dimension, THREE.RGBAFormat);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter || THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        return texture;
    }

    /* LIGHTFLOW_GOD_RAY_CORE_START */
    // A separate scene element: no volume routing, depth capture or raymarch.
    function createGodRayRuntime(THREE, onTopologyChange = () => {}) {
        const fields = {
            length: { default: 48, min: 0.01, max: 100000, label: 'Length', es: 'Longitud' },
            width: { default: 4, min: 0, max: 100000, label: 'Source width', es: 'Ancho inicial' },
            end_width: { default: 18, min: 0, max: 100000, label: 'End width', es: 'Ancho final' },
            taper: { default: 1, min: 0.05, max: 8, step: 0.01, label: 'Spread curve', es: 'Curva de apertura' },
            roll: { default: 0, min: -180, max: 180, label: 'Plane rotation', es: 'Giro del plano' },
            opacity: { default: 0.22, min: 0, max: 1, step: 0.01, label: 'Opacity', es: 'Opacidad' },
            intensity: { default: 1, min: 0, max: 32, step: 0.01, label: 'Brightness', es: 'Brillo' },
            color: { type: 'vector', default: [255, 233, 185], label: 'Source color', es: 'Color inicial' },
            end_color: { type: 'vector', default: [168, 200, 255], label: 'End color', es: 'Color final' },
            gradient_curve: { default: 1, min: 0.05, max: 8, step: 0.01, label: 'Gradient curve', es: 'Curva del degradado' },
            edge_softness: { default: 0.12, min: 0, max: 1, step: 0.01, label: 'Edge softness', es: 'Suavidad de bordes' },
            fade_start: { default: 0.02, min: 0, max: 1, step: 0.01, label: 'Source fade', es: 'Desvanecer origen' },
            fade_end: { default: 0.7, min: 0, max: 1, step: 0.01, label: 'End fade', es: 'Desvanecer extremo' },
            falloff: { default: 1, min: 0.05, max: 8, step: 0.01, label: 'Fade curve', es: 'Curva de desvanecimiento' },
            bloom: { default: 0.15, min: 0, max: 8, step: 0.01, label: 'Bloom contribution', es: 'Aporte al Bloom' },
            near_fade: { default: 0, min: 0, max: 100000, label: 'Near-camera fade', es: 'Desvanecer cerca de cámara' },
            far_start: { default: 0, min: 0, max: 100000, label: 'Distance fade start', es: 'Inicio del desvanecimiento' },
            far_end: { default: 0, min: 0, max: 100000, label: 'Distance fade end (0: off)', es: 'Fin del desvanecimiento (0: desactivado)' },
            orientation: { type: 'string', default: 'camera', options: { camera: 'Camera / ray axis', y: 'Camera / world Y', fixed: 'Fixed plane' }, label: 'Orientation', es: 'Orientación' },
            blend: { type: 'string', default: 'additive', options: { additive: 'Additive', normal: 'Alpha' }, label: 'Blend', es: 'Mezcla' },
            light_uuid: { type: 'string', default: '', label: 'Linked light', es: 'Luz vinculada' },
            inherit_color: { type: 'boolean', default: false, label: 'Use light color', es: 'Usar color de la luz' },
            occlusion: { type: 'string', default: 'scene', options: { scene: 'Scene depth', shadow: 'Scene + light shadows', none: 'Always visible' }, label: 'Occlusion', es: 'Oclusión' },
            shadow_strength: { default: 1, min: 0, max: 1, step: 0.01, label: 'Shadow strength', es: 'Intensidad de oclusión' }
        };
        const number = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
        function sanitize(data) {
            for (const [key, field] of Object.entries(fields)) {
                if (field.type === 'vector') {
                    data[key] = field.default.map((v, i) => Math.max(0, Math.min(255, number(data[key]?.[i], v))));
                } else if (field.type === 'boolean') data[key] = data[key] === undefined ? field.default : !!data[key];
                else if (field.type === 'string') data[key] = field.options
                    ? (Object.hasOwn(field.options, data[key]) ? data[key] : field.default)
                    : String(data[key] || '');
                else data[key] = Math.max(field.min, Math.min(field.max, number(data[key], field.default)));
            }
            return data;
        }
        const vertexShader = `
            uniform vec3 uOrigin, uAxis, uRight, uCamera, uCameraBack;
            uniform vec4 uShape;
            uniform float uOrientation, uOrtho, uRoll;
            varying vec2 vRayUv;
            varying vec3 vWorld;
            void main() {
                vRayUv = uv;
                vec3 axis = normalize(uAxis);
                vec3 right = normalize(uRight);
                vec3 view = uOrtho > 0.5 ? uCameraBack : uCamera - (uOrigin + axis * uShape.x * 0.5);
                if (uOrientation > 0.5) {
                    if (uOrientation > 1.5) view.y = 0.0;
                    vec3 candidate = cross(axis, view);
                    // Looking along the ray must never produce NaNs or a sudden
                    // zero-width ribbon. Keep the authored basis at the pole.
                    if (dot(candidate, candidate) > 0.000001) right = normalize(candidate);
                }
                right = right * cos(uRoll) + cross(axis, right) * sin(uRoll);
                float width = mix(uShape.y, uShape.z, pow(uv.y, uShape.w));
                vWorld = uOrigin + axis * (uv.y * uShape.x) + right * ((uv.x - 0.5) * width);
                gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
            }
        `;
        const fragmentShader = `
            #include <packing>
            uniform vec3 uColor, uEndColor, uCamera;
            uniform vec4 uFade, uLook, uDistance;
            uniform sampler2D uShadowMap;
            uniform mat4 uShadowMatrix;
            uniform vec4 uShadow;
            uniform vec2 uShadowTexel;
            uniform sampler2D uSceneDepth;
            uniform vec2 uSceneViewport;
            uniform float uSceneDepthActive, uBloomEncoded;
            varying vec2 vRayUv;
            varying vec3 vWorld;
            float shadowSample(vec2 uv, float depth) {
                vec4 sampleValue = texture2D(uShadowMap, uv);
                if (uShadow.w > 0.5) {
                    vec2 distribution = unpackRGBATo2Half(sampleValue);
                    float hard = step(depth, distribution.x);
                    float variance = max(0.00002, distribution.y * distribution.y);
                    float delta = depth - distribution.x;
                    float probability = variance / (variance + delta * delta);
                    return max(hard, clamp((probability - 0.3) / 0.7, 0.0, 1.0));
                }
                return step(depth, unpackRGBAToDepth(sampleValue));
            }
            void main() {
                if (uSceneDepthActive > 0.5 && gl_FragCoord.z > texture2D(uSceneDepth, gl_FragCoord.xy / uSceneViewport).r + 0.0000002) discard;
                float x = abs(vRayUv.x * 2.0 - 1.0);
                float aa = max(fwidth(x), 0.00001);
                float edge = 1.0 - smoothstep(1.0 - max(uFade.x, aa), 1.0, x);
                float start = uFade.y > 0.0 ? smoothstep(0.0, uFade.y, vRayUv.y) : 1.0;
                float end = uFade.z > 0.0 ? 1.0 - smoothstep(1.0 - uFade.z, 1.0, vRayUv.y) : 1.0;
                float distanceToCamera = length(uCamera - vWorld);
                float distanceFade = uDistance.x > 0.0 ? smoothstep(0.0, uDistance.x, distanceToCamera) : 1.0;
                if (uDistance.z > 0.0) distanceFade *= 1.0 - smoothstep(uDistance.y, max(uDistance.y + 0.001, uDistance.z), distanceToCamera);
                float shadow = 1.0;
                if (uShadow.x > 0.5) {
                    vec4 projected = uShadowMatrix * vec4(vWorld, 1.0);
                    vec3 coord = projected.xyz / max(projected.w, 0.00001);
                    if (projected.w > 0.0 && all(greaterThanEqual(coord, vec3(0.0))) && all(lessThanEqual(coord, vec3(1.0)))) {
                        float depth = coord.z + uShadow.y;
                        float visibility = shadowSample(coord.xy, depth);
                        visibility += shadowSample(coord.xy + vec2(uShadowTexel.x, 0.0), depth);
                        visibility += shadowSample(coord.xy - vec2(uShadowTexel.x, 0.0), depth);
                        visibility += shadowSample(coord.xy + vec2(0.0, uShadowTexel.y), depth);
                        visibility += shadowSample(coord.xy - vec2(0.0, uShadowTexel.y), depth);
                        shadow = mix(1.0, visibility * 0.2, uShadow.z);
                    }
                }
                float alpha = clamp(edge * pow(max(start * end, 0.0), uFade.w) * uLook.x * distanceFade * shadow, 0.0, 1.0);
                if (alpha < 0.00001) discard;
                vec3 color = mix(uColor, uEndColor, pow(vRayUv.y, uLook.z)) * uLook.y;
                #ifdef LIGHTFLOW_GOD_RAY_BLOOM
                    vec3 emission = color * alpha * uLook.w;
                    if (uBloomEncoded > 0.5) emission = clamp(log2(vec3(1.0) + max(emission, vec3(0.0))) / 4.0874628413, 0.0, 1.0);
                    gl_FragColor = vec4(emission, 0.0);
                #else
                    gl_FragColor = vec4(color, alpha);
                    #include <tonemapping_fragment>
                    #include <encodings_fragment>
                    gl_FragColor.rgb *= alpha;
                #endif
            }
        `;
        const resources = new Map();
        const bloomScene = new THREE.Scene();
        const group = new THREE.Group();
        group.name = 'Lightflow God Rays';
        group.userData.lightflowNoShadow = true;
        const fallback = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
        fallback.needsUpdate = true;
        const scratch = { target: new THREE.Vector3(), position: new THREE.Vector3(), scale: new THREE.Vector3(), color: new THREE.Color() };
        function make() {
            const uniforms = {
                uOrigin: { value: new THREE.Vector3() }, uAxis: { value: new THREE.Vector3(0, -1, 0) },
                uRight: { value: new THREE.Vector3(1, 0, 0) }, uCamera: { value: new THREE.Vector3() },
                uCameraBack: { value: new THREE.Vector3(0, 0, 1) }, uShape: { value: new THREE.Vector4() },
                uOrientation: { value: 1 }, uOrtho: { value: 0 }, uRoll: { value: 0 },
                uColor: { value: new THREE.Color() }, uEndColor: { value: new THREE.Color() },
                uFade: { value: new THREE.Vector4() }, uLook: { value: new THREE.Vector4() },
                uDistance: { value: new THREE.Vector4() }, uShadow: { value: new THREE.Vector4() },
                uShadowTexel: { value: new THREE.Vector2() }, uShadowMatrix: { value: new THREE.Matrix4() },
                uShadowMap: { value: fallback }, uSceneDepth: { value: fallback },
                uSceneViewport: { value: new THREE.Vector2(1, 1) }, uSceneDepthActive: { value: 0 }, uBloomEncoded: { value: 1 }
            };
            const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader,
                transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
                blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
                blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
                extensions: { derivatives: true } });
            material.userData.lightflowGodRay = true;
            const bloom = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader,
                defines: { LIGHTFLOW_GOD_RAY_BLOOM: 1 }, extensions: { derivatives: true },
                transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
                blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
                blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, toneMapped: false });
            material.userData.lightflowBloomMaterial = bloom;
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 32), material);
            mesh.name = 'God Ray';
            mesh.frustumCulled = false; // Authored world-space vertices; the unit plane bounds do not apply.
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            mesh.userData.lightflowNoShadow = true;
            mesh.userData.lightflowGodRay = true;
            mesh.raycast = () => {};
            mesh.onBeforeRender = (renderer, scene, camera) => {
                camera.getWorldPosition(uniforms.uCamera.value);
                uniforms.uCameraBack.value.setFromMatrixColumn(camera.matrixWorld, 2).normalize();
                uniforms.uOrtho.value = camera.isOrthographicCamera ? 1 : 0;
                const light = mesh.userData.linkedLight;
                const shadow = light?.shadow;
                const available = mesh.userData.shadowRequested && light?.visible !== false && light?.castShadow && shadow?.map?.texture;
                uniforms.uShadow.value.set(available ? 1 : 0, shadow?.bias || 0, mesh.userData.shadowStrength || 0,
                    renderer.shadowMap?.type === THREE.VSMShadowMap ? 1 : 0);
                uniforms.uShadowMap.value = available ? shadow.map.texture : fallback;
                if (available) {
                    uniforms.uShadowMatrix.value.copy(shadow.matrix);
                    uniforms.uShadowTexel.value.set(1 / shadow.map.width, 1 / shadow.map.height);
                }
                material.uniformsNeedUpdate = true;
                bloom.uniformsNeedUpdate = true;
            };
            group.add(mesh);
            const bloomMesh = new THREE.Mesh(mesh.geometry, bloom);
            bloomMesh.frustumCulled = false;
            bloomMesh.onBeforeRender = mesh.onBeforeRender;
            bloomScene.add(bloomMesh);
            mesh.userData.bloomMesh = bloomMesh;
            onTopologyChange();
            return mesh;
        }
        function remove(key, mesh) {
            mesh.parent?.remove(mesh);
            bloomScene.remove(mesh.userData.bloomMesh);
            mesh.geometry.dispose();
            mesh.material.userData.lightflowBloomMaterial.dispose();
            mesh.material.dispose();
            resources.delete(key);
            onTopologyChange();
        }
        function sync(elements, scene, lights = {}) {
            if (group.parent !== scene) scene?.add(group);
            const active = new Set();
            for (const element of elements || []) {
                if (!element?.mesh || element.visibility === false || element.enabled === false || element.export === false) continue;
                // The element's node is a hidden editor helper. Its own visible
                // flag is deliberately ignored; hidden parent groups still apply.
                let hidden = false;
                for (let parent = element.parent; parent && typeof parent === 'object'; parent = parent.parent) {
                    if (parent.visibility === false) { hidden = true; break; }
                }
                if (hidden) continue;
                element.preview_controller?.updateAttachment?.(element);
                active.add(element.uuid);
                let mesh = resources.get(element.uuid);
                if (!mesh) { mesh = make(); resources.set(element.uuid, mesh); }
                mesh.visible = true;
                const u = mesh.material.uniforms;
                element.mesh.updateWorldMatrix(true, false);
                const matrix = element.mesh.matrixWorld;
                u.uOrigin.value.setFromMatrixPosition(matrix);
                u.uAxis.value.set(0, -1, 0).transformDirection(matrix);
                u.uRight.value.set(1, 0, 0).transformDirection(matrix);
                scratch.scale.setFromMatrixScale(matrix);
                const light = lights[element.light_uuid];
                if ((light?.isDirectionalLight || light?.isSpotLight) && light.target) {
                    light.getWorldPosition(scratch.position);
                    light.target.getWorldPosition(scratch.target);
                    scratch.target.sub(scratch.position);
                    if (scratch.target.lengthSq() > 0.000001) u.uAxis.value.copy(scratch.target).normalize();
                    // Project authored right onto the new axis' perpendicular plane.
                    u.uRight.value.addScaledVector(u.uAxis.value, -u.uRight.value.dot(u.uAxis.value));
                    if (u.uRight.value.lengthSq() < 0.000001) {
                        u.uRight.value.set(Math.abs(u.uAxis.value.x) < 0.9 ? 1 : 0, Math.abs(u.uAxis.value.x) < 0.9 ? 0 : 1, 0);
                        u.uRight.value.addScaledVector(u.uAxis.value, -u.uRight.value.dot(u.uAxis.value));
                    }
                    u.uRight.value.normalize();
                }
                u.uShape.value.set(element.length * scratch.scale.y, element.width * scratch.scale.x, element.end_width * scratch.scale.x, element.taper);
                u.uOrientation.value = { fixed: 0, camera: 1, y: 2 }[element.orientation];
                u.uRoll.value = element.roll * Math.PI / 180;
                u.uFade.value.set(element.edge_softness, element.fade_start, element.fade_end, element.falloff);
                u.uLook.value.set(element.opacity, element.intensity, element.gradient_curve, element.bloom);
                u.uDistance.value.set(element.near_fade, element.far_start, element.far_end, 0);
                u.uColor.value.fromArray(element.color.map(v => v / 255)).convertSRGBToLinear();
                u.uEndColor.value.fromArray(element.end_color.map(v => v / 255)).convertSRGBToLinear();
                if (element.inherit_color && light?.color) { u.uColor.value.copy(light.color); u.uEndColor.value.copy(light.color); }
                mesh.material.blendDst = element.blend === 'normal' ? THREE.OneMinusSrcAlphaFactor : THREE.OneFactor;
                mesh.material.depthTest = element.occlusion !== 'none';
                mesh.material.userData.lightflowBloomMaterial.depthTest = mesh.material.depthTest;
                mesh.userData.linkedLight = light;
                mesh.userData.shadowRequested = element.occlusion === 'shadow';
                mesh.userData.shadowStrength = element.shadow_strength;
                // Sort translucent rays using their actual center, including tiles.
                mesh.position.copy(u.uOrigin.value).addScaledVector(u.uAxis.value, element.length * scratch.scale.y * 0.5);
                mesh.updateMatrixWorld(true);
                mesh.userData.bloomMesh.position.copy(mesh.position);
            }
            for (const [key, mesh] of resources) if (!active.has(key)) remove(key, mesh);
        }
        function clear() { for (const [key, mesh] of resources) remove(key, mesh); }
        function hasBloom() { return [...resources.values()].some(mesh => { const u = mesh.material.uniforms.uLook.value; return mesh.visible && u.x > 0 && u.y > 0 && u.w > 0; }); }
        function renderBloomContribution(preview, { target, depthTexture } = {}) {
            const renderer = preview?.renderer;
            if (!renderer || !target || !hasBloom() || !depthTexture) return false;
            const previousTarget = renderer.getRenderTarget();
            const autoClear = renderer.autoClear;
            try {
                for (const mesh of resources.values()) {
                    const u = mesh.material.uniforms;
                    u.uSceneDepth.value = depthTexture;
                    u.uSceneViewport.value.set(target.width, target.height);
                    u.uSceneDepthActive.value = mesh.material.depthTest ? 1 : 0;
                    u.uBloomEncoded.value = 0;
                    mesh.userData.bloomMesh.visible = mesh.visible;
                }
                renderer.autoClear = false;
                renderer.setRenderTarget(target);
                renderer.render(bloomScene, preview.camera);
                return true;
            } finally {
                for (const mesh of resources.values()) {
                    mesh.material.uniforms.uSceneDepthActive.value = 0;
                    mesh.material.uniforms.uBloomEncoded.value = 1;
                    mesh.material.uniforms.uSceneDepth.value = fallback;
                }
                renderer.setRenderTarget(previousTarget);
                renderer.autoClear = autoClear;
            }
        }
        function dispose() { clear(); group.parent?.remove(group); fallback.dispose(); }
        return { fields, sanitize, sync, clear, dispose, hasBloom, renderBloomContribution, group, resources, vertexShader, fragmentShader };
    }
    /* LIGHTFLOW_GOD_RAY_CORE_END */

    const AtmosphereManager = {
        version: 'adaptive-temporal-v2',
        architectureVersion: 'hybrid-router-v2',
        settings: readSettings(),
        states: new Map(),
        patchedPreviews: new Map(),
        whiteTexture: null,
        noiseTexture: null,
        studioTile: null,
        studioTime: null,
        studioSampleIndex: 0,
        sceneRevision: 1,
        scenePartitionCache: null,
        depthMaterialCache: new WeakMap(),
        depthMaterialResources: new Set(),
        activeVolumeCandidates: [],
        activeVolumes: [],
        activeVolumeScratch: null,
        framePipelineRegistration: null,
        framePipelineResources: [],
        lastTechniqueResolution: null,
        surfaceFogUniforms: null,
        surfaceFogStructuralStable: true,
        ownedSceneFog: null,
        previousSceneFog: null,
        ownedBackground: null,
        previousBackground: null,
        geometryShaftGroup: null,
        geometryShaftMeshes: new Map(),
        disposed: false,

        init() {
            this.disposed = false;
            this.sceneRevision = 1;
            this.lastTechniqueResolution = null;
            this.surfaceFogUniforms = {
                lfAtmosphereFogColor: { value: new THREE.Vector3() },
                lfAtmosphereFogNearColor: { value: new THREE.Vector3() },
                // Plain numeric arrays are intentional. They remain valid
                // uniform4fv payloads across Three's material clone/cache
                // boundaries, where class-like vec4 objects may lose their
                // iterable contract in Blockbench's renderer realm.
                lfAtmosphereFogParams: { value: [0, 0, 1, 0] },
                lfAtmosphereHeightParams: { value: [0, 0, 1, 0] },
                lfAtmosphereStyleParams: { value: [1, 0, 0, 0] },
                lfAtmosphereArtParams: { value: [1, 0, 0, 24] },
                lfAtmosphereSkyParams: { value: [1, 1, 0, 0] },
                lfAtmosphereSkyGradient: { value: null },
                lfAtmosphereFrameParams: { value: [1, 1, 0, 0] },
                lfAtmosphereGradeParams: { value: [0, 0, 1, 0] },
                lfAtmosphereGradeLook: { value: [1, 1, 0, 0] },
                lfAtmosphereGradeTint: { value: new THREE.Vector3(1, 1, 1) },
                lfAtmosphereCameraHeight: { value: 0 }
            };
            this.updateSurfaceFogUniforms();
            this.invalidateSceneCache();
            this.activeVolumeScratch = {
                cameraPosition: new THREE.Vector3(),
                center: new THREE.Vector3(),
                scale: new THREE.Vector3(),
                sphere: new THREE.Sphere(),
                viewProjection: new THREE.Matrix4(),
                frustum: new THREE.Frustum()
            };
            this.whiteTexture = createWhiteTexture();
            this.noiseTexture = createNoiseTexture(128);
            this.geometryShaftGroup = new THREE.Group();
            this.geometryShaftGroup.name = 'Lightflow Atmosphere Geometry Shafts';
            this.geometryShaftGroup.userData.lightflowAtmosphereProxy = true;
            window.Canvas?.scene?.add?.(this.geometryShaftGroup);
            this.patchAllPreviews();
        },

        dispose() {
            this.disposed = true;
            this.restoreSceneFog();
            this.geometryShaftMeshes.forEach(mesh => {
                mesh.geometry?.dispose?.();
                mesh.material?.dispose?.();
            });
            this.geometryShaftMeshes.clear();
            this.geometryShaftGroup?.parent?.remove?.(this.geometryShaftGroup);
            this.geometryShaftGroup = null;
            this.detachFramePipeline();
            this.detachPreviewWrappers();
            this.states.forEach(state => {
                const capabilities = this.getRendererCapabilities(state?.renderer);
                this.disposeState(state, {
                    contextLost: !!capabilities?.lost ||
                        state?.generation !== Number(capabilities?.generation || 0)
                });
            });
            this.states.clear();
            this.depthMaterialResources.forEach(material => material?.dispose?.());
            this.depthMaterialResources.clear();
            this.depthMaterialCache = new WeakMap();
            this.invalidateSceneCache();
            this.activeVolumeCandidates.length = 0;
            this.activeVolumes.length = 0;
            this.activeVolumeScratch = null;
            this.whiteTexture?.dispose?.();
            this.noiseTexture?.dispose?.();
            this.whiteTexture = null;
            this.noiseTexture = null;
            this.studioTile = null;
            this.studioTime = null;
        },

        releaseProjectResources() {
            this.depthMaterialResources.forEach(material => material?.dispose?.());
            this.depthMaterialResources.clear();
            this.depthMaterialCache = new WeakMap();
            this.states.forEach(state => {
                const capabilities = this.getRendererCapabilities(state?.renderer);
                this.disposeState(state, {
                    contextLost: !!capabilities?.lost ||
                        state?.generation !== Number(capabilities?.generation || 0)
                });
            });
            this.states.clear();
            this.invalidateSceneCache();
        },

        pruneInactivePreviews(activePreviews = collectPreviews()) {
            const active = activePreviews instanceof Set
                ? activePreviews
                : new Set(activePreviews || []);
            this.patchedPreviews.forEach((record, preview) => {
                if (active.has(preview)) return;
                if (preview?.render === record.patchedRender) preview.render = record.originalRender;
                this.patchedPreviews.delete(preview);
            });
            this.states.forEach((state, preview) => {
                if (active.has(preview)) return;
                const capabilities = this.getRendererCapabilities(state?.renderer);
                this.releasePreview(preview, {
                    contextLost: !!capabilities?.lost ||
                        state?.generation !== Number(capabilities?.generation || 0)
                });
            });
        },

        getTechniqueResolution(preview, options = {}, volumes = null) {
            const studio = !!(
                options.studio ||
                preview?.sa_studio_render_active ||
                window.LightManagerStudioRenderSession
            );
            const activeVolumes = Array.isArray(volumes)
                ? volumes
                : this.getActiveVolumes(preview?.camera);
            const quality = studio ? this.settings.render_quality : this.settings.preview_quality;
            const resolution = AtmosphereTechniqueRouter.resolveScene({
                globalFog: this.getGlobalFogConfig(),
                volumes: activeVolumes,
                quality,
                studio,
                trueVolumetricShadows: ['ultra', 'reference'].includes(quality)
            });
            this.lastTechniqueResolution = resolution;
            return resolution;
        },

        getGlobalFogConfig() {
            const environmentFog = window.LightflowEnvironment?.getDistanceFogConfig?.();
            if (environmentFog?.enabled) return environmentFog;
            const mode = String(this.settings.global_fog_mode || 'none').toLowerCase();
            return {
                enabled: this.settings.enabled !== false &&
                    this.settings.global_fog_enabled === true && mode !== 'none',
                mode,
                color: this.settings.global_fog_color,
                start: Math.max(0, finite(this.settings.global_fog_start, 24)),
                end: Math.max(0.001, finite(this.settings.global_fog_end, 160)),
                density: Math.max(0, finite(this.settings.global_fog_density, 0.012)),
                distanceOffset: Math.max(0, finite(this.settings.global_fog_distance_offset, 0)),
                maximumOpacity: clamp(finite(this.settings.global_fog_max_opacity, 1), 0, 1),
                strictLinear: !!this.settings.global_fog_strict_linear,
                baseHeight: finite(this.settings.global_fog_base_height, 0),
                heightFalloff: Math.max(0, finite(this.settings.global_fog_height_falloff, 0.08)),
                nearColor: this.settings.global_fog_color,
                smoothness: this.settings.global_fog_strict_linear ? 0 : 1,
                gradientStrength: 0,
                dither: 0,
                syncBackground: this.settings.global_fog_sync_background !== false
            };
        },

        updateSurfaceFogUniforms() {
            if (!this.surfaceFogUniforms) return;
            const fog = this.getGlobalFogConfig();
            const grade = window.LightflowEnvironment?.getDistanceGradeConfig?.() || { enabled: false };
            const mode = fog.enabled
                ? ({ linear: 1, minecraft: 1, distance: 1, exp: 2, exp2: 3, exponential: 3, height: 4, ground: 4 }[fog.mode] || 0)
                : 0;
            colorArrayToVector(fog.color, this.surfaceFogUniforms.lfAtmosphereFogColor.value);
            colorArrayToVector(fog.nearColor || fog.color, this.surfaceFogUniforms.lfAtmosphereFogNearColor.value);
            const setVec4 = (uniform, x, y, z, w) => {
                const value = uniform.value;
                value[0] = x;
                value[1] = y;
                value[2] = z;
                value[3] = w;
            };
            setVec4(this.surfaceFogUniforms.lfAtmosphereFogParams,
                mode,
                fog.start + fog.distanceOffset,
                Math.max(fog.start + fog.distanceOffset + 0.001, fog.end),
                fog.density
            );
            setVec4(this.surfaceFogUniforms.lfAtmosphereHeightParams,
                fog.baseHeight,
                fog.heightFalloff,
                fog.maximumOpacity,
                fog.strictLinear ? 1 : 0
            );
            setVec4(this.surfaceFogUniforms.lfAtmosphereStyleParams,
                clamp(finite(fog.smoothness, fog.strictLinear ? 0 : 1), 0, 1),
                clamp(finite(fog.dither, 0), 0, 1),
                clamp(finite(fog.gradientStrength, 0), 0, 1),
                0
            );
            setVec4(this.surfaceFogUniforms.lfAtmosphereGradeParams,
                grade.enabled ? 1 : 0,
                Math.max(0, finite(grade.start, 32)),
                Math.max(finite(grade.start, 32) + 0.001, finite(grade.end, 160)),
                clamp(finite(grade.curve, 1), 0.25, 4)
            );
            setVec4(this.surfaceFogUniforms.lfAtmosphereGradeLook,
                clamp(finite(grade.saturation, 1), 0, 2),
                clamp(finite(grade.contrast, 1), 0, 2),
                clamp(finite(grade.tintStrength, 0), 0, 1),
                clamp(finite(grade.pivot, 0.5), 0, 1)
            );
            colorArrayToVector(grade.tint || [255, 255, 255], this.surfaceFogUniforms.lfAtmosphereGradeTint.value);
            const skyGradient = fog.enabled && fog.skyBlend > 0
                ? window.LightflowEnvironment?.getSkyGradientTexture?.() : null;
            // Borrow Environment's texture. Atmosphere never owns or disposes it.
            this.surfaceFogUniforms.lfAtmosphereSkyGradient.value = skyGradient || this.whiteTexture || null;
            setVec4(this.surfaceFogUniforms.lfAtmosphereArtParams,
                clamp(finite(fog.curve, 1), 0.25, 4),
                skyGradient ? clamp(finite(fog.skyBlend, 0), 0, 1) : 0,
                clamp(finite(fog.noise, 0), 0, 1),
                Math.max(0.25, finite(fog.noiseScale, 24))
            );
            setVec4(this.surfaceFogUniforms.lfAtmosphereSkyParams,
                Math.max(0, finite(fog.skyIntensity, 1)),
                Math.max(0.1, finite(fog.skyGradientPower, 1)), 0, 0
            );
        },

        decorateSurfaceProgram(program = {}) {
            const vertexShader = String(program.vertexShader || '');
            const fragmentShader = String(program.fragmentShader || '');
            // Fog is a runtime uniform, including on/off. Do not create another
            // family of large surface programs every time the checkbox changes.
            if (!vertexShader || !fragmentShader) return null;
            const vertexEnd = vertexShader.lastIndexOf('}');
            const fragmentEnd = fragmentShader.lastIndexOf('}');
            if (vertexEnd < 0 || fragmentEnd < 0 || !fragmentShader.includes('gl_FragColor')) return null;
            // Horizontal whitespace only: with /m, \s* rescans long runs of
            // stripped shader lines quadratically on every material rebuild.
            const version300 = /^[\t ]*#version[\t ]+300[\t ]+es\b/m;
            const glsl3 = version300.test(vertexShader) || version300.test(fragmentShader);
            const vertexPreamble = `
${glsl3 ? 'out' : 'varying'} vec3 lfAtmosphereViewPosition;
${glsl3 ? 'out' : 'varying'} float lfAtmosphereWorldHeight;
${glsl3 ? 'out' : 'varying'} vec3 lfAtmosphereWorldPosition;
`;
            const fragmentPreamble = `
${glsl3 ? 'in' : 'varying'} vec3 lfAtmosphereViewPosition;
${glsl3 ? 'in' : 'varying'} float lfAtmosphereWorldHeight;
${glsl3 ? 'in' : 'varying'} vec3 lfAtmosphereWorldPosition;
uniform vec3 lfAtmosphereFogColor;
uniform vec3 lfAtmosphereFogNearColor;
uniform vec4 lfAtmosphereFogParams;
uniform vec4 lfAtmosphereHeightParams;
uniform vec4 lfAtmosphereStyleParams;
uniform vec4 lfAtmosphereArtParams;
uniform vec4 lfAtmosphereSkyParams;
uniform sampler2D lfAtmosphereSkyGradient;
uniform vec4 lfAtmosphereFrameParams;
uniform vec4 lfAtmosphereGradeParams;
uniform vec4 lfAtmosphereGradeLook;
uniform vec3 lfAtmosphereGradeTint;
uniform float lfAtmosphereCameraHeight;
float lfAtmosphereDistanceRamp(float distanceValue, float start, float end, float curve) {
    float t = clamp((distanceValue - start) / max(end - start, 0.0001), 0.0, 1.0);
    return pow(t, curve);
}
float lfAtmosphereNoiseHash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}
float lfAtmosphereNoise(vec3 p) {
    vec3 cell = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(lfAtmosphereNoiseHash(cell), lfAtmosphereNoiseHash(cell + vec3(1,0,0)), f.x),
                   mix(lfAtmosphereNoiseHash(cell + vec3(0,1,0)), lfAtmosphereNoiseHash(cell + vec3(1,1,0)), f.x), f.y),
               mix(mix(lfAtmosphereNoiseHash(cell + vec3(0,0,1)), lfAtmosphereNoiseHash(cell + vec3(1,0,1)), f.x),
                   mix(lfAtmosphereNoiseHash(cell + vec3(0,1,1)), lfAtmosphereNoiseHash(cell + vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 lfAtmosphereDecodeDisplay(vec3 color) {
    color = max(color, vec3(0.0));
    return mix(color / 12.92, pow((color + 0.055) / 1.055, vec3(2.4)),
        step(vec3(0.04045), color));
}
vec3 lfAtmosphereEncodeDisplay(vec3 color) {
    color = max(color, vec3(0.0));
    return mix(color * 12.92, 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055,
        step(vec3(0.0031308), color));
}
float lfAtmosphereFogFactor(float distanceToCamera, float worldHeight) {
    float mode = lfAtmosphereFogParams.x;
    if (mode < 0.5) return 0.0;
    float fogStart = lfAtmosphereFogParams.y;
    float fogEnd = lfAtmosphereFogParams.z;
    float density = max(lfAtmosphereFogParams.w, 0.0);
    float maximumOpacity = clamp(lfAtmosphereHeightParams.z, 0.0, 1.0);
    float distanceValue = max(distanceToCamera - fogStart, 0.0);
    float factor = 0.0;
    if (mode < 1.5) {
        float linearFactor = lfAtmosphereDistanceRamp(distanceToCamera, fogStart, fogEnd, lfAtmosphereArtParams.x);
        float smoothFactor = linearFactor * linearFactor * (3.0 - 2.0 * linearFactor);
        factor = mix(linearFactor, smoothFactor, lfAtmosphereStyleParams.x);
    } else if (mode < 2.5) {
        factor = 1.0 - exp(-density * distanceValue);
    } else if (mode < 3.5) {
        float extinction = density * distanceValue;
        factor = 1.0 - exp(-(extinction * extinction));
    } else {
        float falloff = max(lfAtmosphereHeightParams.y, 0.0);
        float rayLength = max(distanceValue, 0.0);
        float originDensity = density * exp(clamp(-falloff * (lfAtmosphereCameraHeight - lfAtmosphereHeightParams.x), -40.0, 40.0));
        float directionY = (worldHeight - lfAtmosphereCameraHeight) / max(distanceToCamera, 0.0001);
        float slope = falloff * directionY;
        originDensity *= exp(clamp(-slope * fogStart, -40.0, 40.0));
        float densityIntegral = abs(slope) < 0.00001
            ? originDensity * rayLength
            : originDensity * (1.0 - exp(clamp(-slope * rayLength, -40.0, 40.0))) / slope;
        factor = 1.0 - exp(-max(densityIntegral, 0.0));
    }
    // Endpoint envelope protects the foreground and fully covered silhouettes.
    float envelope = factor * (1.0 - factor) * 4.0;
    if (lfAtmosphereArtParams.z > 0.0001) {
        factor += (lfAtmosphereNoise(lfAtmosphereWorldPosition / lfAtmosphereArtParams.w) - 0.5)
            * lfAtmosphereArtParams.z * envelope * 0.35;
    }
    if (lfAtmosphereStyleParams.y > 0.0001 && envelope > 0.0) {
        vec2 framePixel = gl_FragCoord.xy * lfAtmosphereFrameParams.xy + lfAtmosphereFrameParams.zw;
        float dither = (fract(52.9829189 * fract(dot(framePixel, vec2(0.06711056, 0.00583715)))) - 0.5) * envelope;
        factor += dither * lfAtmosphereStyleParams.y / 255.0;
    }
    return min(clamp(factor, 0.0, 1.0), maximumOpacity);
}
`;
            const prependPreamble = (source, preamble) => {
                const version = source.match(/^\s*#version[^\n]*\n/);
                if (!version) return preamble + source;
                return version[0] + preamble + source.slice(version[0].length);
            };
            const decoratedVertex = vertexShader.slice(0, vertexEnd) + `
    vec4 lfFogLocalPosition = vec4(position, 1.0);
#ifdef USE_INSTANCING
    lfFogLocalPosition = instanceMatrix * lfFogLocalPosition;
#endif
    lfAtmosphereViewPosition = (modelViewMatrix * lfFogLocalPosition).xyz;
    lfAtmosphereWorldHeight = (modelMatrix * lfFogLocalPosition).y;
    lfAtmosphereWorldPosition = (modelMatrix * lfFogLocalPosition).xyz;
` + vertexShader.slice(vertexEnd);
            const surfaceAtmosphereFragment = `
    // Interpolate position, then measure distance. Interpolated vertex lengths
    // change with triangulation and exaggerate fog on large merged terrain.
    float lfDistance = length(lfAtmosphereViewPosition);
    if (lfAtmosphereGradeParams.x > 0.5) {
        float lfGradeWeight = smoothstep(lfAtmosphereGradeParams.y, lfAtmosphereGradeParams.z, lfDistance);
        lfGradeWeight = pow(lfGradeWeight, lfAtmosphereGradeParams.w);
        vec3 lfSource = gl_FragColor.rgb;
        float lfLuma = dot(lfSource, vec3(0.2126, 0.7152, 0.0722));
        vec3 lfGraded = mix(vec3(lfLuma), lfSource, lfAtmosphereGradeLook.x);
        lfGraded = (lfGraded - lfAtmosphereGradeLook.w) * lfAtmosphereGradeLook.y + lfAtmosphereGradeLook.w;
        float lfTintLuma = max(dot(lfAtmosphereGradeTint, vec3(0.2126, 0.7152, 0.0722)), 0.001);
        vec3 lfTinted = lfGraded * lfAtmosphereGradeTint / lfTintLuma;
        lfGraded = mix(lfGraded, lfTinted, lfAtmosphereGradeLook.z);
        gl_FragColor.rgb = mix(lfSource, max(lfGraded, vec3(0.0)), lfGradeWeight);
    }
    float lfFogFactor = lfAtmosphereFogFactor(lfDistance, lfAtmosphereWorldHeight);
    float lfFogProgress = lfAtmosphereDistanceRamp(lfDistance, lfAtmosphereFogParams.y, lfAtmosphereFogParams.z, lfAtmosphereArtParams.x);
    vec3 lfFogColor = lfAtmosphereFogColor;
    if (lfAtmosphereStyleParams.z > 0.0001) {
        // Keep the authored transition shape, independently of the opacity cap
        // and texture. Neutral settings retain the previous color ramp.
        float lfFogRampFactor = mix(lfFogProgress, lfFogProgress * lfFogProgress * (3.0 - 2.0 * lfFogProgress), lfAtmosphereStyleParams.x);
        float lfFogGradient = pow(lfFogRampFactor, 0.72);
        vec3 lfFogRampColor = mix(lfAtmosphereFogNearColor, lfAtmosphereFogColor, lfFogGradient);
        lfFogColor = mix(lfAtmosphereFogColor, lfFogRampColor, lfAtmosphereStyleParams.z);
    }
    if (lfAtmosphereArtParams.y > 0.0001 && lfFogFactor > 0.0) {
        float up = clamp((lfAtmosphereWorldHeight - lfAtmosphereCameraHeight) / max(lfDistance, 0.0001), -1.0, 1.0);
        float skyPosition = 0.5 + sign(up) * 0.5 * pow(abs(up), lfAtmosphereSkyParams.y);
        vec3 skyColor = ${glsl3 ? 'texture' : 'texture2D'}(lfAtmosphereSkyGradient, vec2(skyPosition, 0.5)).rgb * lfAtmosphereSkyParams.x;
        lfFogColor = mix(lfFogColor, skyColor, lfAtmosphereArtParams.y * smoothstep(0.0, 1.0, lfFogProgress));
    }
    // Beauty and authored fog colors are display encoded here. Mix light in
    // display-linear space to avoid dark seams around bright silhouettes.
    // The zero-fog path stays exact and does not pay for transfer functions.
    if (lfFogFactor > 0.0) {
        gl_FragColor.rgb = lfAtmosphereEncodeDisplay(mix(
            lfAtmosphereDecodeDisplay(gl_FragColor.rgb),
            lfAtmosphereDecodeDisplay(lfFogColor),
            lfFogFactor
        ));
    }
`;
            // The unlit texture path returns before the shared surface epilogue.
            // Apply the same atmosphere there, while leaving emission/data passes
            // untouched and preserving the unlit alpha and MRT emission export.
            const surfaceBody = fragmentShader.slice(0, fragmentEnd).replace(
                '// SA_UNLIT_EMISSION_EXPORT',
                `// SA_UNLIT_EMISSION_EXPORT
#if !defined(SA_RENDERCRAFT_RIM_GLOW) && !defined(SA_RENDERCRAFT_GLOW_BLOOM) && !defined(SA_RENDERCRAFT_STUDIO_BLOOM)
        {${surfaceAtmosphereFragment.replace(
                    '    // Interpolate position, then measure distance.',
                    '    // Unlit atmosphere uses the same interpolated position.'
                )}}
#endif`
            );
            const decoratedFragment = surfaceBody + surfaceAtmosphereFragment + fragmentShader.slice(fragmentEnd);
            return {
                vertexShader: prependPreamble(decoratedVertex, vertexPreamble),
                fragmentShader: prependPreamble(decoratedFragment, fragmentPreamble),
                uniforms: this.surfaceFogUniforms,
                family: 'lightflow_surface_fog_v7'
            };
        },

        prepareSurfaceFog(preview, options = {}) {
            godRayRuntime?.sync(GodRayElement?.all, window.Canvas?.scene, window.three_lights || {});
            syncParticleEffects(preview?.camera);
            if (options.uniformsReady !== true) this.updateSurfaceFogUniforms();
            if (preview?.camera && this.surfaceFogUniforms) {
                preview.camera.updateMatrixWorld?.(true);
                this.surfaceFogUniforms.lfAtmosphereCameraHeight.value = finite(
                    preview.camera.matrixWorld?.elements?.[13],
                    0
                );
                const tile = this.studioTile?.preview === preview &&
                    (preview.sa_studio_render_active || window.LightManagerStudioRenderSession) ? this.studioTile.tile : null;
                const frame = this.surfaceFogUniforms.lfAtmosphereFrameParams.value;
                frame[0] = tile ? finite(tile.viewWidth, tile.renderWidth) / Math.max(1, finite(tile.renderWidth, 1)) : 1;
                frame[1] = tile ? finite(tile.viewHeight, tile.renderHeight) / Math.max(1, finite(tile.renderHeight, 1)) : 1;
                frame[2] = tile ? finite(tile.viewX, 0) : 0;
                frame[3] = tile ? finite(tile.fullViewHeight, 0) - finite(tile.viewY, 0) - finite(tile.viewHeight, 0) : 0;
            }
            // Distance-fog sliders only change shared uniforms and the native
            // scene fog/background. Re-resolving volumetric shaft geometry for
            // every pointer event is unrelated work and made a single slider
            // update scale with the complete scene.
            if (options.skipGeometryShafts !== true) this.syncGeometryShafts(preview);
            const scene = window.Canvas?.scene;
            if (!scene) return;
            const fog = this.getGlobalFogConfig();
            if (!fog.enabled) {
                this.restoreSceneFog(scene);
                return;
            }
            const color = new THREE.Color().fromArray((fog.color || [196, 214, 230]).map(value => clamp(finite(value, 0), 0, 255) / 255));
            if (this.ownedSceneFog && scene.fog !== this.ownedSceneFog) {
                this.previousSceneFog = scene.fog || null;
            } else if (!this.ownedSceneFog) {
                this.previousSceneFog = scene.fog || null;
            }
            const linearMode = ['linear', 'minecraft', 'distance'].includes(fog.mode);
            if (!this.ownedSceneFog || (!!this.ownedSceneFog.isFogExp2) === linearMode) {
                this.ownedSceneFog = linearMode
                    ? new THREE.Fog(color, fog.start + fog.distanceOffset, Math.max(fog.end, fog.start + fog.distanceOffset + 0.001))
                    : new THREE.FogExp2(color, fog.density);
            } else {
                this.ownedSceneFog.color.copy(color);
                if (linearMode) {
                    this.ownedSceneFog.near = fog.start + fog.distanceOffset;
                    this.ownedSceneFog.far = Math.max(fog.end, this.ownedSceneFog.near + 0.001);
                } else {
                    this.ownedSceneFog.density = fog.density;
                }
            }
            scene.fog = this.ownedSceneFog;
            if (fog.syncBackground !== false && (!scene.background || scene.background.isColor)) {
                if (!this.ownedBackground || scene.background !== this.ownedBackground) {
                    this.previousBackground = scene.background || null;
                }
                if (!this.ownedBackground) this.ownedBackground = color.clone();
                else this.ownedBackground.copy(color);
                scene.background = this.ownedBackground;
            } else if (this.ownedBackground) {
                if (scene.background === this.ownedBackground) scene.background = this.previousBackground || null;
                this.ownedBackground = null;
                this.previousBackground = null;
            }
        },

        restoreSceneFog(scene = window.Canvas?.scene) {
            if (!scene) return;
            if (scene.fog === this.ownedSceneFog) scene.fog = this.previousSceneFog || null;
            if (scene.background === this.ownedBackground) scene.background = this.previousBackground || null;
            this.ownedSceneFog = null;
            this.previousSceneFog = null;
            this.ownedBackground = null;
            this.previousBackground = null;
        },

        syncGeometryShafts(preview) {
            if (!this.geometryShaftGroup || !preview?.camera) return;
            const volumes = this.settings.enabled ? this.getActiveVolumes(preview.camera) : [];
            const resolution = this.getTechniqueResolution(preview, {}, volumes);
            const routes = resolution.volumeRoutes.filter(route => (
                route.technique === AtmosphereV2Core.Technique.GEOMETRY_SHAFTS
            ));
            const active = new Set();
            const lights = window.three_lights || {};
            routes.forEach(route => {
                const volume = route.volume;
                const light = (volume.light_uuid && lights[volume.light_uuid]) ||
                    Object.values(lights).find(candidate => candidate?.isSpotLight && candidate.visible !== false);
                if (!light?.isSpotLight) return;
                const key = volume.uuid;
                active.add(key);
                let mesh = this.geometryShaftMeshes.get(key);
                if (!mesh) {
                    const geometry = new THREE.ConeGeometry(1, 1, 20, 1, true);
                    geometry.translate(0, -0.5, 0);
                    const material = new THREE.ShaderMaterial({
                        uniforms: {
                            uColor: { value: new THREE.Vector3(1, 1, 1) },
                            uExposure: { value: 1 },
                            uFeather: { value: 0.25 }
                        },
                        vertexShader: `
                            varying vec3 vLocal;
                            void main() {
                                vLocal = position;
                                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                            }
                        `,
                        fragmentShader: `
                            precision highp float;
                            varying vec3 vLocal;
                            uniform vec3 uColor;
                            uniform float uExposure;
                            uniform float uFeather;
                            void main() {
                                float lengthFade = smoothstep(0.0, 0.18, -vLocal.y) * (1.0 - smoothstep(0.72, 1.0, -vLocal.y));
                                float normalizedRadius = length(vLocal.xz) / max(-vLocal.y, 0.001);
                                float radial = 1.0 - smoothstep(max(0.0, 1.0 - uFeather), 1.0, normalizedRadius);
                                float alpha = radial * lengthFade * uExposure;
                                gl_FragColor = vec4(uColor * alpha, alpha);
                            }
                        `,
                        transparent: true,
                        blending: THREE.AdditiveBlending,
                        depthTest: true,
                        depthWrite: false,
                        side: THREE.DoubleSide,
                        toneMapped: false
                    });
                    mesh = new THREE.Mesh(geometry, material);
                    mesh.frustumCulled = true;
                    mesh.renderOrder = 950;
                    mesh.userData.lightflowAtmosphereProxy = true;
                    mesh.userData.lightflowNoShadow = true;
                    this.geometryShaftMeshes.set(key, mesh);
                    this.geometryShaftGroup.add(mesh);
                    this.scenePartitionCache = null;
                }
                light.getWorldPosition?.(mesh.position);
                const target = new THREE.Vector3();
                if (light.target?.getWorldPosition) light.target.getWorldPosition(target);
                else target.copy(mesh.position).add(new THREE.Vector3(0, -1, 0));
                const direction = target.clone().sub(mesh.position).normalize();
                const range = Math.max(0.1, finite(light.distance, 32) || 32);
                const radius = Math.tan(clamp(finite(light.angle, Math.PI / 4), 0.01, Math.PI * 0.49)) * range;
                mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction);
                mesh.scale.set(radius, range, radius);
                colorArrayToVector(volume.scattering_color, mesh.material.uniforms.uColor.value);
                mesh.material.uniforms.uExposure.value = clamp(finite(volume.shaft_exposure, 1), 0, 8) * 0.18;
                mesh.material.uniforms.uFeather.value = clamp(finite(volume.edge_feather, 0.2), 0.01, 1);
                mesh.visible = true;
            });
            this.geometryShaftMeshes.forEach((mesh, key) => {
                if (active.has(key)) return;
                this.geometryShaftGroup.remove(mesh);
                mesh.geometry?.dispose?.();
                mesh.material?.dispose?.();
                this.geometryShaftMeshes.delete(key);
                this.scenePartitionCache = null;
            });
        },

        getResourceDiagnostics(preview = window.Preview?.selected || null) {
            let renderTargets = 0;
            let estimatedBytes = 0;
            let activeLights = 0;
            let candidateLights = 0;
            let shadowedLights = 0;
            let effectiveSteps = 0;
            let noiseOctaves = 0;
            let projectedCoverage = 0;
            let fogPixelsSubmitted = 0;
            let historyRejectReason = null;
            let hdrFormat = null;
            let shaderFamily = null;
            const activeBounds = [];
            this.states.forEach(state => {
                [
                    'sceneTarget', 'cubeTarget', 'volumeTarget',
                    'volumeHistoryTarget', 'volumeResolveTarget', 'historyDepthTarget'
                ].forEach(name => {
                    const target = state?.[name];
                    if (!target) return;
                    renderTargets += 1;
                    const colorBytes = Math.max(1, target.width || 1) *
                        Math.max(1, target.height || 1) * 4;
                    const depthBytes = target.depthTexture
                        ? Math.max(1, target.width || 1) * Math.max(1, target.height || 1) * 4
                        : 0;
                    estimatedBytes += colorBytes + depthBytes;
                });
                activeLights = Math.max(activeLights, Number(state?.stats?.lastActiveLights) || 0);
                candidateLights = Math.max(candidateLights, Number(state?.stats?.lastCandidateLights) || 0);
                shadowedLights = Math.max(shadowedLights, Number(state?.stats?.lastShadowedLights) || 0);
                effectiveSteps = Math.max(effectiveSteps, Number(state?.stats?.lastEffectiveSteps) || 0);
                noiseOctaves = Math.max(noiseOctaves, Number(state?.stats?.lastNoiseOctaves) || 0);
                if (state?.lastProjectedBounds) {
                    projectedCoverage = Math.max(projectedCoverage, Number(state.lastProjectedBounds.coverage) || 0);
                    fogPixelsSubmitted += Number(state.lastProjectedBounds.pixels) || 0;
                    activeBounds.push({ ...state.lastProjectedBounds.sceneRect });
                }
                if (state?.stats?.lastHistoryRejectReason) historyRejectReason = state.stats.lastHistoryRejectReason;
                if (state?.stats?.lastHdrFormat) hdrFormat = state.stats.lastHdrFormat;
                if (state?.stats?.lastShaderFamily) shaderFamily = state.stats.lastShaderFamily;
            });
            const volumes = this.settings.enabled
                ? this.getActiveVolumes(preview?.camera)
                : [];
            const resolution = this.getTechniqueResolution(preview, {}, volumes);
            const performance = this.performance();
            return {
                version: this.version,
                architectureVersion: this.architectureVersion,
                projectRevision: atmosphereRevision,
                resolvedTechnique: resolution.resolvedTechnique,
                activeFogLayers: resolution.globalTechnique === AtmosphereV2Core.Technique.NONE ? 0 : 1,
                activeAnalyticVolumes: resolution.activeAnalyticVolumes,
                activeRaymarchVolumes: resolution.activeRaymarchVolumes,
                culledVolumes: Math.max(0, (VolumeElement?.all?.length || 0) - volumes.length),
                projectedCoverage,
                culledPixelPercent: clamp(1 - projectedCoverage, 0, 1) * 100,
                activeBounds,
                fogPixelsSubmitted,
                activeLights,
                candidateLights,
                shadowedLights,
                raymarches: performance.raymarches,
                analyticPasses: performance.analyticPasses,
                effectiveSteps,
                estimatedRaySamples: performance.raymarches * effectiveSteps,
                noiseOctaves,
                shadowSamples: shadowedLights * performance.raymarches,
                canonicalDepthHits: performance.canonicalDepthHits,
                legacyDepthHits: performance.legacyDepthHits,
                depthFallbackCaptures: performance.depthFallbackCaptures,
                historyAcceptanceRate: performance.temporalResolves
                    ? performance.temporalHistoryHits / performance.temporalResolves
                    : 0,
                historyRejections: Math.max(0, performance.temporalResolves - performance.temporalHistoryHits),
                historyRejectReason,
                staticCacheHits: performance.cacheHits,
                bloomReuseHits: performance.bloomReuseHits,
                bloomExtraRaymarches: performance.bloomExtraRaymarches,
                avoidedRaymarches: resolution.avoidedRaymarches + performance.avoidedRaymarches,
                states: this.states.size,
                patchedPreviews: this.patchedPreviews.size,
                depthDerivedMaterials: this.depthMaterialResources.size,
                renderTargets,
                estimatedBytes,
                renderTargetBytes: estimatedBytes,
                atmosphereGpuMs: window.LightflowRenderer?.getPassStats?.('atmosphere')?.gpu?.p50 || null,
                hdrFormat,
                shaderFamily,
                performance
            };
        },

        detachPreviewWrappers() {
            this.patchedPreviews.forEach((record, preview) => {
                if (preview && preview.render === record.patchedRender) preview.render = record.originalRender;
            });
            this.patchedPreviews.clear();
        },

        attachFramePipeline() {
            if (this.framePipelineRegistration || window.LightflowFramePipeline?.disposed !== false) return;
            const registerResource = (name, descriptor) => {
                const registration = window.LightflowFramePipeline.registerResource?.(name, descriptor);
                if (registration) this.framePipelineResources.push(registration);
            };
            registerResource('atmosphereVolume', {
                owner: 'atmosphere', format: 'rgba8', scale: 0.5
            });
            registerResource('atmosphereResolve', {
                owner: 'atmosphere', format: 'rgba8', scale: 0.5
            });
            registerResource('atmosphereHistory', {
                owner: 'atmosphere', format: 'rgba8', scale: 0.5, persistent: true
            });
            this.framePipelineRegistration = window.LightflowFramePipeline.registerPass?.('atmosphere', {
                priority: 100,
                reads: ['sceneDepth'],
                writes: [
                    'atmosphereVolume', 'atmosphereResolve',
                    'atmosphereHistory', 'framebuffer'
                ],
                dependsOn: ['main_scene'],
                enabled: preview => {
                    if (this.disposed || !this.settings.enabled) return false;
                    return this.getTechniqueResolution(preview).requiresPostPass;
                },
                execute: (preview, context) => this.composite(preview, { frameContext: context })
            }) || null;
        },

        detachFramePipeline() {
            this.framePipelineRegistration?.delete?.();
            this.framePipelineRegistration = null;
            this.framePipelineResources.forEach(registration => registration?.delete?.());
            this.framePipelineResources.length = 0;
        },

        getRendererCapabilities(renderer) {
            return window.LightflowRenderer?.getCapabilities?.(renderer) || null;
        },

        disposeState(state, options = {}) {
            if (!state) return;
            if (options.contextLost === true) return;
            [state.sceneTarget, state.cubeTarget].forEach(target => {
                const depthTexture = target?.depthTexture || null;
                target?.dispose?.();
                depthTexture?.dispose?.();
            });
            state.volumeTarget?.dispose?.();
            state.volumeHistoryTarget?.dispose?.();
            state.volumeResolveTarget?.dispose?.();
            state.historyDepthTarget?.dispose?.();
            state.volumeMaterial?.dispose?.();
            state.temporalMaterial?.dispose?.();
            state.depthHistoryMaterial?.dispose?.();
            state.shaftMaterial?.dispose?.();
            state.compositeMaterial?.dispose?.();
            state.volumeQuad?.geometry?.dispose?.();
            state.temporalQuad?.geometry?.dispose?.();
            state.depthHistoryQuad?.geometry?.dispose?.();
            state.shaftQuad?.geometry?.dispose?.();
            state.compositeQuad?.geometry?.dispose?.();
        },

        suspendPreview(preview) {
            if (!preview) return false;
            if (this.studioTile?.preview === preview) this.studioTile = null;
            const state = this.states.get(preview);
            if (!state) return false;

            state.sceneTarget?.setSize?.(2, 2);
            state.cubeTarget?.setSize?.(2, 2);
            state.volumeTarget?.setSize?.(2, 2);
            state.volumeHistoryTarget?.setSize?.(2, 2);
            state.volumeResolveTarget?.setSize?.(2, 2);
            state.historyDepthTarget?.setSize?.(2, 2);
            state.sceneWidth = 2;
            state.sceneHeight = 2;
            state.volumeWidth = 2;
            state.volumeHeight = 2;
            state.depthWidth = 2;
            state.depthHeight = 2;
            state.rendering = false;
            state.lastNormalVolumeReady = false;
            state.lastFrameSignature = null;
            state.lastDepthSignature = null;
            state.lastDepthSources = null;
            state.temporalHistoryValid = false;
            state.temporalHistorySignature = null;
            state.previousCameraValid = false;
            state.stableUniformSignature = null;
            state.volumeUniforms?.uResolution?.value?.set?.(2, 2);
            state.compositeUniforms?.uVolumeTexel?.value?.set?.(0.5, 0.5);
            return true;
        },

        releasePreview(preview, options = {}) {
            if (!preview) return false;
            if (this.studioTile?.preview === preview) this.studioTile = null;
            const state = this.states.get(preview);
            if (!state) return false;
            this.disposeState(state, { contextLost: options.contextLost === true });
            this.states.delete(preview);
            return true;
        },

        getPreviewState(preview) {
            if (!preview?.renderer) return null;
            const capabilities = this.getRendererCapabilities(preview.renderer);
            const generation = Number(capabilities?.generation) || 0;
            let state = this.states.get(preview);
            if (state && state.generation === generation && !capabilities?.lost) return state;
            if (state) {
                this.releasePreview(preview, {
                    contextLost: !!capabilities?.lost || state.generation !== generation
                });
            }
            if (capabilities?.lost) return null;
            return this.createState(preview, { generation });
        },

        invalidateSceneCache() {
            this.scenePartitionCache = null;
            this.invalidateDepthCache();
        },

        invalidateDepthCache() {
            this.sceneRevision = (this.sceneRevision + 1) >>> 0;
            this.states.forEach(state => {
                state.lastFrameSignature = null;
                state.lastNormalVolumeReady = false;
                state.lastDepthSignature = null;
                state.temporalHistoryValid = false;
                state.temporalHistorySignature = null;
                state.previousCameraValid = false;
                state.stableUniformSignature = null;
            });
        },

        invalidateVolumeCache() {
            this.states.forEach(state => {
                state.lastFrameSignature = null;
                state.lastNormalVolumeReady = false;
                state.temporalHistoryValid = false;
                state.temporalHistorySignature = null;
                state.previousCameraValid = false;
                state.stableUniformSignature = null;
            });
        },

        getActiveVolumes(camera) {
            if (!VolumeElement || !Array.isArray(VolumeElement.all)) return [];
            const scratch = this.activeVolumeScratch;
            if (!scratch || !camera) return VolumeElement.all.filter(volume => volume?.visibility !== false && volume?.enabled !== false).slice(0, MAX_VOLUMES);
            camera.updateMatrixWorld?.(true);
            camera.getWorldPosition?.(scratch.cameraPosition);
            scratch.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            scratch.frustum.setFromProjectionMatrix(scratch.viewProjection);
            let candidateIndex = 0;
            for (let index = 0; index < VolumeElement.all.length; index++) {
                const volume = VolumeElement.all[index];
                if (!volume || volume.visibility === false || volume.enabled === false || !volume.mesh || finite(volume.density, 0) <= 0) continue;
                // Only the volume and its ancestors are needed here. Updating
                // descendants also walks every gizmo attached to the volume.
                if (volume.mesh.updateWorldMatrix) volume.mesh.updateWorldMatrix(true, false);
                else volume.mesh.updateMatrixWorld?.(false);
                scratch.center.setFromMatrixPosition(volume.mesh.matrixWorld);
                scratch.scale.setFromMatrixScale(volume.mesh.matrixWorld);
                const size = Array.isArray(volume.size) ? volume.size : [16, 16, 16];
                const radius = 0.5 * Math.hypot(
                    Math.abs(finite(size[0], 16) * scratch.scale.x),
                    Math.abs(finite(size[1], 16) * scratch.scale.y),
                    Math.abs(finite(size[2], 16) * scratch.scale.z)
                );
                scratch.sphere.center.copy(scratch.center);
                scratch.sphere.radius = Math.max(0.001, radius);
                if (this.settings.frustum_culling && !scratch.frustum.intersectsSphere(scratch.sphere)) continue;
                const candidate = this.activeVolumeCandidates[candidateIndex] || (this.activeVolumeCandidates[candidateIndex] = {});
                candidate.volume = volume;
                candidate.score = finite(volume.density, 0) * 256 + radius * 0.02 - scratch.center.distanceToSquared(scratch.cameraPosition) * 0.0001;
                candidateIndex++;
            }
            this.activeVolumeCandidates.length = candidateIndex;
            this.activeVolumeCandidates.sort((first, second) => second.score - first.score);
            const activeCount = Math.min(MAX_VOLUMES, candidateIndex);
            this.activeVolumes.length = activeCount;
            for (let index = 0; index < activeCount; index++) this.activeVolumes[index] = this.activeVolumeCandidates[index].volume;
            return this.activeVolumes;
        },

        computeProjectedBounds(preview, volumes, state) {
            const camera = preview?.camera;
            if (!camera || !state || !volumes?.length) return null;
            const width = Math.max(1, state.sceneWidth);
            const height = Math.max(1, state.sceneHeight);
            const scratch = state.scratch;
            camera.updateMatrixWorld?.(true);
            camera.getWorldPosition?.(scratch.cameraPosition);
            let minX = 1;
            let minY = 1;
            let maxX = -1;
            let maxY = -1;
            let hasPoint = false;
            for (const volume of volumes) {
                if (!volume?.mesh) continue;
                if (volume.mesh.updateWorldMatrix) volume.mesh.updateWorldMatrix(true, false);
                else volume.mesh.updateMatrixWorld?.(true);
                const size = Array.isArray(volume.size) ? volume.size : [16, 16, 16];
                scratch.scaleMatrix.makeScale(
                    Math.max(0.001, Math.abs(finite(size[0], 16))),
                    Math.max(0.001, Math.abs(finite(size[1], 16))),
                    Math.max(0.001, Math.abs(finite(size[2], 16)))
                );
                scratch.boundsMatrix.copy(volume.mesh.matrixWorld).multiply(scratch.scaleMatrix);
                scratch.boundsInverse.copy(scratch.boundsMatrix);
                if (scratch.boundsInverse.invert) scratch.boundsInverse.invert();
                else scratch.boundsInverse.getInverse(scratch.boundsMatrix);
                scratch.boundsLocalCamera.copy(scratch.cameraPosition).applyMatrix4(scratch.boundsInverse);
                const inside = volume.shape === 'sphere'
                    ? scratch.boundsLocalCamera.lengthSq() <= 0.250001
                    : Math.max(
                        Math.abs(scratch.boundsLocalCamera.x),
                        Math.abs(scratch.boundsLocalCamera.y),
                        Math.abs(scratch.boundsLocalCamera.z)
                    ) <= 0.500001;
                if (inside) {
                    minX = minY = -1;
                    maxX = maxY = 1;
                    hasPoint = true;
                    break;
                }
                for (let corner = 0; corner < 8; corner++) {
                    scratch.boundsCorner.set(
                        corner & 1 ? 0.5 : -0.5,
                        corner & 2 ? 0.5 : -0.5,
                        corner & 4 ? 0.5 : -0.5
                    ).applyMatrix4(scratch.boundsMatrix);
                    scratch.boundsView.copy(scratch.boundsCorner).applyMatrix4(camera.matrixWorldInverse);
                    if (!camera.isOrthographicCamera && scratch.boundsView.z >= -Math.max(0.001, finite(camera.near, 0.1))) {
                        // A bound crossing the near plane can cover the whole
                        // view; stay conservative instead of clipping fog.
                        minX = minY = -1;
                        maxX = maxY = 1;
                        hasPoint = true;
                        break;
                    }
                    scratch.boundsProjected.copy(scratch.boundsCorner).project(camera);
                    if (![scratch.boundsProjected.x, scratch.boundsProjected.y].every(Number.isFinite)) continue;
                    minX = Math.min(minX, scratch.boundsProjected.x);
                    minY = Math.min(minY, scratch.boundsProjected.y);
                    maxX = Math.max(maxX, scratch.boundsProjected.x);
                    maxY = Math.max(maxY, scratch.boundsProjected.y);
                    hasPoint = true;
                }
                if (minX <= -1 && minY <= -1 && maxX >= 1 && maxY >= 1) break;
            }
            if (!hasPoint) return null;
            minX = clamp(minX, -1, 1);
            minY = clamp(minY, -1, 1);
            maxX = clamp(maxX, -1, 1);
            maxY = clamp(maxY, -1, 1);
            const padding = 3;
            const x = clamp(Math.floor((minX * 0.5 + 0.5) * width) - padding, 0, width);
            const y = clamp(Math.floor((minY * 0.5 + 0.5) * height) - padding, 0, height);
            const right = clamp(Math.ceil((maxX * 0.5 + 0.5) * width) + padding, 0, width);
            const top = clamp(Math.ceil((maxY * 0.5 + 0.5) * height) + padding, 0, height);
            if (right <= x || top <= y) return null;
            const sceneRect = { x, y, width: right - x, height: top - y };
            const scaleX = state.volumeWidth / width;
            const scaleY = state.volumeHeight / height;
            const volumeX = Math.floor(x * scaleX);
            const volumeY = Math.floor(y * scaleY);
            const volumeRight = Math.ceil(right * scaleX);
            const volumeTop = Math.ceil(top * scaleY);
            const volumeRect = {
                x: volumeX,
                y: volumeY,
                width: Math.max(1, volumeRight - volumeX),
                height: Math.max(1, volumeTop - volumeY)
            };
            return {
                sceneRect,
                volumeRect,
                pixels: sceneRect.width * sceneRect.height,
                coverage: (sceneRect.width * sceneRect.height) / Math.max(1, width * height)
            };
        },

        createState(preview, options = {}) {
            const renderer = preview?.renderer;
            if (!renderer || !THREE.WebGLRenderTarget || !THREE.DepthTexture) return null;
            const sceneTarget = createDepthTarget();
            const cubeTarget = createDepthTarget();
            const volumeTarget = new THREE.WebGLRenderTarget(1, 1, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                depthBuffer: false,
                stencilBuffer: false
            });
            const volumeHistoryTarget = new THREE.WebGLRenderTarget(1, 1, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                depthBuffer: false,
                stencilBuffer: false
            });
            const volumeResolveTarget = new THREE.WebGLRenderTarget(1, 1, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                depthBuffer: false,
                stencilBuffer: false
            });
            const historyDepthTarget = new THREE.WebGLRenderTarget(1, 1, {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.RGBAFormat,
                depthBuffer: false,
                stencilBuffer: false
            });
            const volumeInverse = Array.from({ length: MAX_VOLUMES }, () => new THREE.Matrix4());
            const volumeShapeMode = Array.from({ length: MAX_VOLUMES }, () => new THREE.Vector4());
            const volumeOptics = Array.from({ length: MAX_VOLUMES }, () => new THREE.Vector4());
            const volumeHeightNoise = Array.from({ length: MAX_VOLUMES }, () => new THREE.Vector4());
            const volumeCloudWind = Array.from({ length: MAX_VOLUMES }, () => new THREE.Vector4());
            const volumeFlags = Array.from({ length: MAX_VOLUMES }, () => new THREE.Vector4());
            const volumeColor = Array.from({ length: MAX_VOLUMES }, () => new THREE.Vector3());
            const volumeAbsorptionColor = Array.from({ length: MAX_VOLUMES }, () => new THREE.Vector3());
            const lightPositionType = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4());
            const lightDirectionRange = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4());
            const lightColorIntensity = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4());
            const lightConeShadow = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4());
            const volumeUniforms = {
                tSceneDepth: { value: sceneTarget.depthTexture },
                tCubeDepth: { value: cubeTarget.depthTexture },
                uNoiseTexture: { value: this.noiseTexture },
                uShadowMap0: { value: this.whiteTexture },
                uShadowMap1: { value: this.whiteTexture },
                uInverseProjection: { value: new THREE.Matrix4() },
                uCameraWorld: { value: new THREE.Matrix4() },
                uVolumeInverse: { value: volumeInverse },
                uShadowMatrix0: { value: new THREE.Matrix4() },
                uShadowMatrix1: { value: new THREE.Matrix4() },
                uVolumeShapeMode: { value: volumeShapeMode },
                uVolumeOptics: { value: volumeOptics },
                uVolumeHeightNoise: { value: volumeHeightNoise },
                uVolumeCloudWind: { value: volumeCloudWind },
                uVolumeFlags: { value: volumeFlags },
                uVolumeColor: { value: volumeColor },
                uVolumeAbsorptionColor: { value: volumeAbsorptionColor },
                uLightPositionType: { value: lightPositionType },
                uLightDirectionRange: { value: lightDirectionRange },
                uLightColorIntensity: { value: lightColorIntensity },
                uLightConeShadow: { value: lightConeShadow },
                uShadowParams0: { value: new THREE.Vector4(1, 1, 0.0005, 1) },
                uShadowParams1: { value: new THREE.Vector4(1, 1, 0.0005, 1) },
                uResolution: { value: new THREE.Vector2(1, 1) },
                uFrameOrigin: { value: new THREE.Vector2() },
                uFramePixelScale: { value: new THREE.Vector2(1, 1) },
                uCameraPosition: { value: new THREE.Vector3() },
                uAmbientColor: { value: new THREE.Vector3(1, 1, 1) },
                uCameraFar: { value: 1000 },
                uTime: { value: 0 },
                uJitterTime: { value: 0 },
                uVolumeCount: { value: 0 },
                uLightCount: { value: 0 },
                uSteps: { value: 40 },
                uShadowSamples: { value: 1 },
                uOrthographic: { value: false },
                uTemporalJitter: { value: true },
                uCheckerboard: { value: false },
                uCheckerboardPhase: { value: 0 },
                uHelperMask: { value: true },
                uBloomPass: { value: false },
                uLogEncode: { value: false }
            };
            const volumeMaterial = new THREE.ShaderMaterial({
                uniforms: volumeUniforms,
                vertexShader: FULLSCREEN_VERTEX_SHADER,
                fragmentShader: VOLUME_FRAGMENT_SHADER,
                depthTest: false,
                depthWrite: false,
                transparent: false,
                blending: THREE.NoBlending,
                toneMapped: false
            });
            const temporalUniforms = {
                tCurrent: { value: volumeTarget.texture },
                tHistory: { value: volumeHistoryTarget.texture },
                tCurrentDepth: { value: sceneTarget.depthTexture },
                tHistoryDepth: { value: historyDepthTarget.texture },
                uTexelSize: { value: new THREE.Vector2(1, 1) },
                uHistoryBlend: { value: 0 },
                uDepthRejectThreshold: { value: 0.004 },
                uCheckerboard: { value: false },
                uCheckerboardPhase: { value: 0 },
                uInverseProjection: { value: new THREE.Matrix4() },
                uCameraWorld: { value: new THREE.Matrix4() },
                uPreviousViewProjection: { value: new THREE.Matrix4() }
            };
            const temporalMaterial = new THREE.ShaderMaterial({
                uniforms: temporalUniforms,
                vertexShader: FULLSCREEN_VERTEX_SHADER,
                fragmentShader: TEMPORAL_FRAGMENT_SHADER,
                depthTest: false,
                depthWrite: false,
                transparent: false,
                blending: THREE.NoBlending,
                toneMapped: false
            });
            const depthHistoryUniforms = {
                tDepth: { value: sceneTarget.depthTexture }
            };
            const depthHistoryMaterial = new THREE.ShaderMaterial({
                uniforms: depthHistoryUniforms,
                vertexShader: FULLSCREEN_VERTEX_SHADER,
                fragmentShader: DEPTH_HISTORY_FRAGMENT_SHADER,
                depthTest: false,
                depthWrite: false,
                transparent: false,
                blending: THREE.NoBlending,
                toneMapped: false
            });
            const shaftUniforms = {
                tSceneDepth: { value: sceneTarget.depthTexture },
                uLightUv: { value: new THREE.Vector2(0.5, 0.5) },
                uShaftColor: { value: new THREE.Vector3(1, 1, 1) },
                uShaftParams: { value: new THREE.Vector4(0.75, 0.93, 0.75, 1.0) },
                uShaftViewport: { value: new THREE.Vector2(1, 1) },
                uShaftSamples: { value: 12 }
            };
            const shaftMaterial = new THREE.ShaderMaterial({
                uniforms: shaftUniforms,
                vertexShader: FULLSCREEN_VERTEX_SHADER,
                fragmentShader: SCREEN_SHAFTS_FRAGMENT_SHADER,
                depthTest: false,
                depthWrite: false,
                transparent: true,
                blending: THREE.AdditiveBlending,
                toneMapped: false
            });
            const compositeUniforms = {
                tVolume: { value: volumeTarget.texture },
                tSceneDepth: { value: sceneTarget.depthTexture },
                tCubeDepth: { value: cubeTarget.depthTexture },
                uInverseProjection: { value: new THREE.Matrix4() },
                uVolumeTexel: { value: new THREE.Vector2(1, 1) },
                uHelperMask: { value: true },
                uBilateralUpsample: { value: true },
                uBloomComposite: { value: false },
                uBloomLinear: { value: false },
                uBloomMultiplier: { value: 1 },
                uLogEncoded: { value: false }
                ,uArtParams: { value: new THREE.Vector4(1, 1, 1, 0) }
                ,uDitherQuantize: { value: new THREE.Vector2(0, 0) }
                ,uRampNearColor: { value: new THREE.Vector3(1, 1, 1) }
                ,uRampFarColor: { value: new THREE.Vector3(1, 1, 1) }
                ,uRampParams: { value: new THREE.Vector2(0, 1) }
                ,uCompositeCameraFar: { value: 1000 }
            };
            const compositeMaterial = new THREE.ShaderMaterial({
                uniforms: compositeUniforms,
                vertexShader: FULLSCREEN_VERTEX_SHADER,
                fragmentShader: COMPOSITE_FRAGMENT_SHADER,
                depthTest: false,
                depthWrite: false,
                transparent: true,
                blending: THREE.CustomBlending,
                blendEquation: THREE.AddEquation,
                blendSrc: THREE.OneFactor,
                blendDst: THREE.OneMinusSrcAlphaFactor,
                blendSrcAlpha: THREE.OneFactor,
                blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
                toneMapped: false
            });
            const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            const volumeScene = new THREE.Scene();
            const temporalScene = new THREE.Scene();
            const depthHistoryScene = new THREE.Scene();
            const shaftScene = new THREE.Scene();
            const compositeScene = new THREE.Scene();
            const volumeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), volumeMaterial);
            const temporalQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), temporalMaterial);
            const depthHistoryQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), depthHistoryMaterial);
            const shaftQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shaftMaterial);
            const compositeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMaterial);
            volumeQuad.frustumCulled = false;
            temporalQuad.frustumCulled = false;
            depthHistoryQuad.frustumCulled = false;
            shaftQuad.frustumCulled = false;
            compositeQuad.frustumCulled = false;
            volumeScene.add(volumeQuad);
            temporalScene.add(temporalQuad);
            depthHistoryScene.add(depthHistoryQuad);
            shaftScene.add(shaftQuad);
            compositeScene.add(compositeQuad);
            const state = {
                preview, renderer, sceneTarget, cubeTarget, volumeTarget,
                volumeHistoryTarget, volumeResolveTarget, historyDepthTarget,
                generation: Number(
                    options.generation ?? this.getRendererCapabilities(renderer)?.generation
                ) || 0,
                volumeMaterial, volumeUniforms, temporalMaterial, temporalUniforms,
                depthHistoryMaterial, depthHistoryUniforms,
                shaftMaterial, shaftUniforms,
                compositeMaterial, compositeUniforms,
                postCamera, volumeScene, temporalScene, depthHistoryScene, shaftScene, compositeScene,
                volumeQuad, temporalQuad, depthHistoryQuad, shaftQuad, compositeQuad,
                sceneWidth: 1, sceneHeight: 1, volumeWidth: 1, volumeHeight: 1,
                framebufferViewport: new THREE.Vector4(0, 0, 1, 1),
                depthWidth: 1, depthHeight: 1,
                rendering: false, ownDepthStamp: 0,
                lastNormalVolumeReady: false,
                lastNormalStudio: false,
                lastBloomMultiplier: 1,
                lastFrameSignature: null,
                lastDepthSignature: null,
                lastDepthSources: null,
                temporalHistoryValid: false,
                temporalHistorySignature: null,
                previousViewProjection: new THREE.Matrix4(),
                previousCameraPosition: new THREE.Vector3(),
                previousCameraQuaternion: new THREE.Quaternion(),
                previousCameraValid: false,
                stableUniformSignature: null,
                currentTemporalSignature: null,
                lightCandidates: [],
                lightElementByUuid: new Map(),
                lightVolumeBounds: [],
                scratch: {
                    scaleMatrix: new THREE.Matrix4(),
                    worldMatrix: new THREE.Matrix4(),
                    boundsMatrix: new THREE.Matrix4(),
                    boundsInverse: new THREE.Matrix4(),
                    position: new THREE.Vector3(),
                    targetPosition: new THREE.Vector3(),
                    direction: new THREE.Vector3(),
                    cameraPosition: new THREE.Vector3(),
                    boundsCorner: new THREE.Vector3(),
                    boundsView: new THREE.Vector3(),
                    boundsProjected: new THREE.Vector3(),
                    boundsLocalCamera: new THREE.Vector3(),
                    quaternion: new THREE.Quaternion()
                },
                stats: {
                    raymarches: 0,
                    analyticPasses: 0,
                    cacheHits: 0,
                    depthCaptures: 0,
                    sceneDepthCaptures: 0,
                    geometryDepthCaptures: 0,
                    canonicalDepthHits: 0,
                    legacyDepthHits: 0,
                    depthFallbackCaptures: 0,
                    bloomReuseHits: 0,
                    bloomExtraRaymarches: 0,
                    avoidedRaymarches: 0,
                    culledFrames: 0,
                    temporalResolves: 0,
                    temporalHistoryHits: 0,
                    lastCandidateLights: 0,
                    lastActiveLights: 0,
                    lastShadowedLights: 0,
                    lastEffectiveSteps: 0
                }
            };
            this.states.set(preview, state);
            return state;
        },

        isStudioPass(preview, options = {}) {
            // A render target alone is not Studio: viewport Bloom also renders
            // into one and explicitly requests preview quality.
            return !!(preview?.sa_studio_render_active ||
                window.LightManagerStudioRenderSession || options.studio === true);
        },

        canReuseBeautyIntegration(state, preview, volumes, studio, options = {}) {
            return !!(options.bloomMask && state.lastNormalVolumeReady &&
                state.lastNormalStudio === studio &&
                state.lastFrameSignature === this.computeFrameSignature(state, preview, volumes, studio));
        },

        resize(state, studio) {
            const renderer = state.renderer;
            const physicalViewport = getPhysicalFramebufferViewport(renderer, state.preview);
            state.framebufferViewport.copy(physicalViewport);
            const sceneWidth = Math.max(2, Math.floor(physicalViewport.z));
            const sceneHeight = Math.max(2, Math.floor(physicalViewport.w));
            const requestedScale = studio ? this.settings.render_scale : this.settings.preview_scale;
            const frameBudgetScale = studio
                ? 1
                : clamp(finite(window.LightflowFrameBudget?.get?.()?.atmosphereScale, 1), 0.5, 1);
            // Studio samples are independent jittered renders at output
            // resolution. Do not divide the volumetric buffer by the sample
            // count; that workaround belonged to the removed NxN raster SSAA.
            const scale = studio
                ? clamp(finite(requestedScale, 1), 0.125, 1.0)
                : clamp(finite(requestedScale, 0.5) * frameBudgetScale, 0.25, 1.0);
            const volumeWidth = Math.max(2, Math.floor(sceneWidth * scale));
            const volumeHeight = Math.max(2, Math.floor(sceneHeight * scale));
            if (state.sceneWidth !== sceneWidth || state.sceneHeight !== sceneHeight) {
                state.sceneWidth = sceneWidth;
                state.sceneHeight = sceneHeight;
            }
            if (state.volumeWidth !== volumeWidth || state.volumeHeight !== volumeHeight) {
                state.volumeWidth = volumeWidth;
                state.volumeHeight = volumeHeight;
                state.volumeTarget.setSize(volumeWidth, volumeHeight);
                state.volumeHistoryTarget.setSize(volumeWidth, volumeHeight);
                state.volumeResolveTarget.setSize(volumeWidth, volumeHeight);
                state.historyDepthTarget.setSize(volumeWidth, volumeHeight);
                configureRenderTarget(state.volumeTarget, volumeWidth, volumeHeight);
                configureRenderTarget(state.volumeHistoryTarget, volumeWidth, volumeHeight);
                configureRenderTarget(state.volumeResolveTarget, volumeWidth, volumeHeight);
                configureRenderTarget(state.historyDepthTarget, volumeWidth, volumeHeight);
                state.volumeUniforms.uResolution.value.set(volumeWidth, volumeHeight);
                state.temporalUniforms.uTexelSize.value.set(1 / volumeWidth, 1 / volumeHeight);
                state.compositeUniforms.uVolumeTexel.value.set(1 / volumeWidth, 1 / volumeHeight);
                state.lastNormalVolumeReady = false;
                state.lastFrameSignature = null;
                state.temporalHistoryValid = false;
                state.temporalHistorySignature = null;
                state.previousCameraValid = false;
            }
            if (state.depthWidth !== volumeWidth || state.depthHeight !== volumeHeight) {
                state.depthWidth = volumeWidth;
                state.depthHeight = volumeHeight;
                state.sceneTarget.setSize(volumeWidth, volumeHeight);
                state.cubeTarget.setSize(volumeWidth, volumeHeight);
                configureRenderTarget(state.sceneTarget, volumeWidth, volumeHeight);
                configureRenderTarget(state.cubeTarget, volumeWidth, volumeHeight);
                state.lastFrameSignature = null;
                state.lastDepthSignature = null;
            }
            state.compositeUniforms.uBilateralUpsample.value = volumeWidth < sceneWidth || volumeHeight < sceneHeight;
        },

        findFreshSharedSceneDepth(preview, state) {
            const manager = window.LightflowAmbientOcclusion;
            const shared = manager?.states?.get?.(preview);
            // SceneDepth belongs to the coordinated frame even when AO itself
            // is disabled; only cubeTarget below depends on an AO geometry pass.
            if (!shared || !shared.sceneTarget?.depthTexture) return null;
            const stamp = finite(shared.lightflowDepthStamp, 0);
            if (!stamp || performance.now() - stamp > 80) return null;
            if (shared.sceneWidth !== state.sceneWidth || shared.sceneHeight !== state.sceneHeight) return null;
            return shared.sceneTarget.depthTexture;
        },

        findFreshSharedDepthSources(preview, state) {
            const manager = window.LightflowAmbientOcclusion;
            const shared = manager?.states?.get?.(preview);
            if (!manager?.settings?.enabled || !shared?.sceneTarget?.depthTexture || !shared?.cubeTarget?.depthTexture) return null;
            const stamp = finite(shared.lightflowDepthStamp, 0);
            if (!stamp || performance.now() - stamp > 80) return null;
            if (shared.sceneWidth !== state.sceneWidth || shared.sceneHeight !== state.sceneHeight) return null;
            if (shared.width < state.depthWidth || shared.height < state.depthHeight) return null;

            const allVisibleCubesCovered = getRenderElements().every(cube => {
                const mesh = getCubeMesh(cube);
                if (!mesh || mesh.visible === false) return true;
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                return materials.some(material => manager.materialReceivesAO?.(material));
            });
            if (!allVisibleCubesCovered) return null;
            return {
                sceneDepth: this.settings.helper_mask ? shared.sceneTarget.depthTexture : shared.cubeTarget.depthTexture,
                cubeDepth: shared.cubeTarget.depthTexture,
                source: 'legacy_shared'
            };
        },

        getCanonicalSceneDepth(frameContext, state) {
            const bundle = frameContext?.resources;
            const resource = bundle?.resources?.sceneDepth;
            const contracts = frameContext?.resourceContracts ||
                frameContext?.pipeline?.resourceContracts ||
                window.LightflowFrameResourceContracts || null;
            if (!resource?.texture || !contracts?.validate) return null;
            const compatible = contracts.validate(resource, {
                encoding: 'raw_depth_01',
                frameId: bundle.frameId,
                width: bundle.width,
                height: bundle.height
            }, 'atmosphere_sceneDepth');
            if (!compatible || resource.space !== 'device_depth') return null;
            return {
                sceneDepth: resource.texture,
                frameId: resource.frameId,
                cameraRevision: resource.cameraRevision,
                width: resource.width,
                height: resource.height,
                source: 'canonical'
            };
        },

        getScenePartition() {
            if (this.scenePartitionCache) return this.scenePartitionCache;
            const cubeObjects = new WeakSet();
            const cubeMeshes = [];
            const nonCubeObjects = [];
            getRenderElements().forEach(element => {
                const mesh = getCubeMesh(element);
                if (!mesh) return;
                const addObject = object => {
                    if (!object || cubeObjects.has(object)) return;
                    cubeObjects.add(object);
                    if (object.isMesh && object.material) cubeMeshes.push(object);
                };
                if (mesh.traverse) mesh.traverse(addObject);
                else addObject(mesh);
            });
            window.Canvas?.scene?.traverse?.(object => {
                const renderable = object?.isMesh || object?.isSprite || object?.isLine || object?.isLineSegments || object?.isPoints;
                if (renderable && !cubeObjects.has(object)) nonCubeObjects.push(object);
            });
            this.scenePartitionCache = { cubeObjects, cubeMeshes, nonCubeObjects };
            return this.scenePartitionCache;
        },

        collectCubeObjects() {
            return this.getScenePartition().cubeObjects;
        },

        collectNonCubeVisibilityChanges(cubeObjects) {
            const changes = [];
            this.getScenePartition().nonCubeObjects.forEach(object => {
                if (object?.visible) {
                    changes.push(object);
                    object.visible = false;
                }
            });
            return changes;
        },

        forceDepthWriting(scene, predicate) {
            const changes = [];
            scene?.traverse?.(object => {
                if (!object?.visible || !predicate(object) || !object.material) return;
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                materials.forEach(material => {
                    if (!material || material.depthWrite === true) return;
                    changes.push({ material, depthWrite: material.depthWrite });
                    material.depthWrite = true;
                });
            });
            return changes;
        },

        hasVisibleHelpers(scene, cubeObjects) {
            let found = false;
            this.getScenePartition().nonCubeObjects.forEach(object => {
                if (found || !object?.visible) return;
                let ancestor = object.parent;
                while (ancestor && ancestor !== scene) {
                    if (ancestor.visible === false) return;
                    ancestor = ancestor.parent;
                }
                if (object.isLine || object.isLineSegments || object.isSprite || object.isPoints) found = true;
            });
            return found;
        },

        getDepthOnlyMaterial(sourceMaterial) {
            if (!sourceMaterial) return sourceMaterial;
            const sharedManager = window.LightflowAmbientOcclusion;
            if (sharedManager?.getDepthOnlyMaterial) {
                const sharedMaterial = sharedManager.getDepthOnlyMaterial(sourceMaterial);
                if (sharedMaterial) sharedMaterial.depthWrite = true;
                return sharedMaterial;
            }
            let material = this.depthMaterialCache.get(sourceMaterial);
            if (!material) {
                material = new THREE.ShaderMaterial({
                    uniforms: {
                        map: { value: null },
                        uHasMap: { value: false },
                        uOpacity: { value: 1 },
                        uAlphaTest: { value: 0.01 }
                    },
                    vertexShader: `
                        varying vec2 vUv;
                        void main() {
                            vUv = uv;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        }
                    `,
                    fragmentShader: `
                        precision highp float;
                        uniform sampler2D map;
                        uniform bool uHasMap;
                        uniform float uOpacity;
                        uniform float uAlphaTest;
                        varying vec2 vUv;
                        void main() {
                            float alpha = uOpacity;
                            if (uHasMap) alpha *= texture2D(map, vUv).a;
                            if (alpha < uAlphaTest) discard;
                            gl_FragColor = vec4(1.0);
                        }
                    `,
                    depthTest: true,
                    depthWrite: true,
                    colorWrite: false,
                    transparent: false,
                    blending: THREE.NoBlending,
                    side: sourceMaterial.shadowSide !== undefined
                        ? sourceMaterial.shadowSide
                        : (sourceMaterial.side !== undefined ? sourceMaterial.side : THREE.FrontSide)
                });
                material.name = 'LightflowAtmosphere_DepthOnly';
                this.depthMaterialCache.set(sourceMaterial, material);
                this.depthMaterialResources.add(material);
            }
            const map = sourceMaterial.uniforms?.map?.value || sourceMaterial.map || null;
            const baseAlpha = sourceMaterial.uniforms?.uBaseAlpha?.value;
            material.uniforms.map.value = map;
            material.uniforms.uHasMap.value = !!map;
            material.uniforms.uOpacity.value = Number.isFinite(Number(baseAlpha))
                ? clamp(Number(baseAlpha), 0, 1)
                : clamp(finite(sourceMaterial.opacity, 1), 0, 1);
            material.uniforms.uAlphaTest.value = Math.max(0.001, finite(sourceMaterial.alphaTest, 0.01));
            material.side = sourceMaterial.shadowSide !== undefined
                ? sourceMaterial.shadowSide
                : (sourceMaterial.side !== undefined ? sourceMaterial.side : THREE.FrontSide);
            return material;
        },

        useDepthOnlyCubeMaterials() {
            const changes = [];
            this.getScenePartition().cubeMeshes.forEach(mesh => {
                if (!mesh?.material) return;
                const original = mesh.material;
                mesh.material = Array.isArray(original)
                    ? original.map(material => this.getDepthOnlyMaterial(material))
                    : this.getDepthOnlyMaterial(original);
                changes.push({ mesh, material: original });
            });
            return changes;
        },

        restoreCubeMaterials(changes) {
            (changes || []).forEach(entry => {
                if (entry?.mesh) entry.mesh.material = entry.material;
            });
        },

        restoreMaterialChanges(changes) {
            for (let index = changes.length - 1; index >= 0; index--) {
                changes[index].material.depthWrite = changes[index].depthWrite;
            }
        },

        captureDepth(state, preview, options = {}) {
            const renderer = state.renderer;
            const camera = preview.camera;
            const scene = window.Canvas?.scene;
            if (!scene || !camera) return null;
            const previousTarget = renderer.getRenderTarget?.() || null;
            const previousTargetViewport = previousTarget?.viewport?.clone?.() || null;
            const previousTargetScissor = previousTarget?.scissor?.clone?.() || null;
            const previousTargetScissorTest = previousTarget?.scissorTest ?? false;
            const previousAutoClear = renderer.autoClear;
            const previousViewport = renderer.getViewport?.(new THREE.Vector4()) || null;
            const previousScissor = renderer.getScissor?.(new THREE.Vector4()) || null;
            const previousScissorTest = renderer.getScissorTest?.() ?? false;
            const previousShadowAutoUpdate = renderer.shadowMap ? renderer.shadowMap.autoUpdate : undefined;
            const clearColor = new THREE.Color();
            const clearAlpha = renderer.getClearAlpha?.() ?? 1;
            renderer.getClearColor?.(clearColor);
            const sharedSceneDepth = options.sceneDepth || this.findFreshSharedSceneDepth(preview, state);
            try {
                renderer.autoClear = true;
                renderer.setScissorTest?.(false);
                if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;
                const cubeObjects = this.collectCubeObjects();
                const needsHelperDepth = !!this.settings.helper_mask && this.hasVisibleHelpers(scene, cubeObjects);
                if (needsHelperDepth && !sharedSceneDepth) {
                    const helperDepthChanges = this.forceDepthWriting(scene, object => {
                        return !cubeObjects.has(object) && (object.isLine || object.isLineSegments || object.isSprite || object.isPoints);
                    });
                    renderer.setRenderTarget(state.sceneTarget);
                    renderer.setClearColor?.(0x000000, 0);
                    renderer.clear?.(true, true, true);
                    try {
                        renderer.render(scene, camera);
                        state.stats.sceneDepthCaptures++;
                    } finally {
                        this.restoreMaterialChanges(helperDepthChanges);
                    }
                }
                const hidden = this.collectNonCubeVisibilityChanges(cubeObjects);
                const cubeMaterialChanges = this.useDepthOnlyCubeMaterials();
                renderer.setRenderTarget(state.cubeTarget);
                renderer.setClearColor?.(0x000000, 0);
                renderer.clear?.(true, true, true);
                try {
                    renderer.render(scene, camera);
                    state.stats.geometryDepthCaptures++;
                } finally {
                    this.restoreCubeMaterials(cubeMaterialChanges);
                    hidden.forEach(object => { object.visible = true; });
                }
                state.ownDepthStamp = performance.now();
                state.stats.depthCaptures++;
                return {
                    sceneDepth: needsHelperDepth ? (sharedSceneDepth || state.sceneTarget.depthTexture) : state.cubeTarget.depthTexture,
                    cubeDepth: state.cubeTarget.depthTexture,
                    source: options.source || (sharedSceneDepth ? 'legacy_scene_plus_geometry' : 'own_fallback')
                };
            } finally {
                if (previousTarget) {
                    if (previousTargetViewport && previousTarget.viewport) previousTarget.viewport.copy(previousTargetViewport);
                    if (previousTargetScissor && previousTarget.scissor) previousTarget.scissor.copy(previousTargetScissor);
                    previousTarget.scissorTest = previousTargetScissorTest;
                    renderer.setRenderTarget?.(previousTarget);
                } else {
                    renderer.setRenderTarget?.(null);
                    if (previousViewport) renderer.setViewport?.(previousViewport);
                    if (previousScissor) renderer.setScissor?.(previousScissor);
                    renderer.setScissorTest?.(previousScissorTest);
                }
                renderer.autoClear = previousAutoClear;
                renderer.setClearColor?.(clearColor, clearAlpha);
                if (renderer.shadowMap && previousShadowAutoUpdate !== undefined) renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
            }
        },

        updateVolumeUniforms(state, volumeRoutes) {
            const uniforms = state.volumeUniforms;
            const scaleMatrix = state.scratch.scaleMatrix;
            const worldMatrix = state.scratch.worldMatrix;
            for (let index = 0; index < MAX_VOLUMES; index++) {
                const volume = volumeRoutes[index]?.volume;
                if (!volume) {
                    uniforms.uVolumeInverse.value[index].identity();
                    uniforms.uVolumeShapeMode.value[index].set(0, 0, 0.1, 0);
                    uniforms.uVolumeOptics.value[index].set(0, 0, 0, 0);
                    uniforms.uVolumeHeightNoise.value[index].set(0, 0, 1, 1);
                    uniforms.uVolumeCloudWind.value[index].set(0.5, 0.2, 0, 0);
                    uniforms.uVolumeFlags.value[index].set(0, 0, 0, 0);
                    uniforms.uVolumeColor.value[index].set(1, 1, 1);
                    uniforms.uVolumeAbsorptionColor.value[index].set(1, 1, 1);
                    continue;
                }
                // Uniform uploads must not force a matrix rebuild of the
                // entire model. Refresh this ancestry even before beauty draw.
                if (volume.mesh.updateWorldMatrix) volume.mesh.updateWorldMatrix(true, false);
                else volume.mesh.updateMatrixWorld?.(true);
                const size = Array.isArray(volume.size) ? volume.size : [16, 16, 16];
                scaleMatrix.makeScale(
                    Math.max(0.001, Math.abs(finite(size[0], 16))),
                    Math.max(0.001, Math.abs(finite(size[1], 16))),
                    Math.max(0.001, Math.abs(finite(size[2], 16)))
                );
                worldMatrix.copy(volume.mesh.matrixWorld).multiply(scaleMatrix);
                uniforms.uVolumeInverse.value[index].copy(worldMatrix);
                if (uniforms.uVolumeInverse.value[index].invert) uniforms.uVolumeInverse.value[index].invert();
                else uniforms.uVolumeInverse.value[index].getInverse(worldMatrix);
                const shape = volume.shape === 'sphere' ? 1 : 0;
                const mode = volume.density_mode === 'cloud' ? 2 : (volume.density_mode === 'height' ? 1 : 0);
                uniforms.uVolumeShapeMode.value[index].set(
                    shape,
                    mode,
                    clamp(finite(volume.edge_feather, 0.12), 0.001, 1),
                    clamp(finite(volume.shadow_fill, 0.1), 0, 1)
                );
                uniforms.uVolumeOptics.value[index].set(
                    clamp(finite(volume.density, 0.04), 0, 4),
                    clamp(finite(volume.scattering_strength, 0.9), 0, 8),
                    clamp(finite(volume.absorption, 0.18), 0, 8),
                    clamp(finite(volume.anisotropy, 0.35), -0.92, 0.92)
                );
                uniforms.uVolumeHeightNoise.value[index].set(
                    clamp(finite(volume.height_falloff, 1.2), 0, 16),
                    clamp(finite(volume.height_offset, 0.1), 0, 1),
                    clamp(finite(volume.noise_scale, 3.2), 0.01, 64),
                    Math.min(
                        clamp(finite(volume.noise_detail, 3), 1, 3),
                        Math.max(1, finite(state.activeNoiseOctaves, 3))
                    )
                );
                const speed = finite(volume.wind_speed, 0);
                const wind = Array.isArray(volume.wind_direction) ? volume.wind_direction : [1, 0];
                uniforms.uVolumeCloudWind.value[index].set(
                    clamp(finite(volume.coverage, 0.45), 0, 0.99),
                    clamp(finite(volume.erosion, 0.22), 0.01, 1),
                    finite(wind[0], 1) * speed,
                    finite(wind[1], 0) * speed
                );
                uniforms.uVolumeFlags.value[index].set(
                    volume.receive_shadows === false ? 0 : 1,
                    clamp(finite(volume.ambient, 0.12), 0, 4),
                    clamp(finite(this.settings.art_bloom_response, 1), 0, 4),
                    volume.composite_mode === 'shafts' ? 1 : 0
                );
                colorArrayToVector(volume.scattering_color, uniforms.uVolumeColor.value[index]);
                colorArrayToVector(volume.absorption_color, uniforms.uVolumeAbsorptionColor.value[index]);
            }
            uniforms.uVolumeCount.value = volumeRoutes.length;
        },

        updateLightUniforms(state, volumes = []) {
            const uniforms = state.volumeUniforms;
            const candidates = state.lightCandidates;
            const elementByUuid = state.lightElementByUuid;
            const volumeBounds = state.lightVolumeBounds;
            let volumeCount = 0;
            for (const volume of volumes) {
                if (!volume?.mesh) continue;
                const bound = volumeBounds[volumeCount] || (volumeBounds[volumeCount] = {});
                volume.mesh.getWorldPosition?.(state.scratch.targetPosition);
                bound.x = state.scratch.targetPosition.x;
                bound.y = state.scratch.targetPosition.y;
                bound.z = state.scratch.targetPosition.z;
                const size = Array.isArray(volume.size) ? volume.size : [16, 16, 16];
                bound.radius = Math.max(0.001, Math.hypot(
                    finite(size[0], 16), finite(size[1], 16), finite(size[2], 16)
                ) * 0.5);
                volumeCount++;
            }
            volumeBounds.length = volumeCount;
            elementByUuid.clear();
            window.LightElement?.all?.forEach?.(element => {
                if (element?.uuid) elementByUuid.set(element.uuid, element);
            });
            let candidateCount = 0;
            const lights = window.three_lights || {};
            for (const uuid in lights) {
                if (!Object.prototype.hasOwnProperty.call(lights, uuid)) continue;
                const light = lights[uuid];
                if (!light || light.visible === false || finite(light.intensity, 0) <= 0) continue;
                const candidate = candidates[candidateCount] || (candidates[candidateCount] = {});
                candidate.uuid = uuid;
                candidate.light = light;
                candidate.intensity = finite(light.intensity, 0);
                const element = elementByUuid.get(uuid);
                if (light.isDirectionalLight) {
                    candidate.score = candidate.intensity * (light.castShadow === false ? 3.5 : 4.25);
                } else {
                    light.getWorldPosition?.(state.scratch.position);
                    const range = Math.max(1, finite(light.distance, finite(element?.distance, 32)) || 32);
                    const outerCone = light.isSpotLight ? Math.cos(finite(light.angle, Math.PI / 4)) : 0;
                    if (light.isSpotLight) {
                        if (light.target?.getWorldPosition) {
                            light.target.getWorldPosition(state.scratch.direction);
                            state.scratch.direction.sub(state.scratch.position).normalize();
                        } else {
                            state.scratch.direction.set(0, 0, -1)
                                .applyQuaternion(light.getWorldQuaternion(state.scratch.quaternion)).normalize();
                        }
                    }
                    let bestInfluence = 0;
                    for (let volumeIndex = 0; volumeIndex < volumeCount; volumeIndex++) {
                        const bound = volumeBounds[volumeIndex];
                        state.scratch.targetPosition.set(bound.x, bound.y, bound.z);
                        const radius = bound.radius;
                        const centerDistance = state.scratch.position.distanceTo(state.scratch.targetPosition);
                        const normalizedDistance = Math.max(0, centerDistance - radius) / range;
                        let influence = 1 / (1 + 4 * normalizedDistance * normalizedDistance);
                        influence *= 1 + Math.min(1.5, radius / range);
                        if (light.isSpotLight) {
                            state.scratch.targetPosition.sub(state.scratch.position).normalize();
                            const cone = state.scratch.direction.dot(state.scratch.targetPosition);
                            influence *= clamp(
                                (cone - outerCone) * 8 + 0.5,
                                0.05,
                                1
                            );
                        }
                        bestInfluence = Math.max(bestInfluence, influence);
                    }
                    candidate.score = candidate.intensity * Math.max(0.01, bestInfluence) *
                        (light.castShadow === false ? 1 : 1.12);
                }
                candidateCount++;
            }
            candidates.length = candidateCount;
            candidates.sort((first, second) => second.score - first.score);
            const lightCount = Math.min(MAX_LIGHTS, candidateCount);
            const position = state.scratch.position;
            const targetPosition = state.scratch.targetPosition;
            const direction = state.scratch.direction;
            let shadowCount = 0;
            for (let index = 0; index < MAX_LIGHTS; index++) {
                const entry = index < lightCount ? candidates[index] : null;
                if (!entry) {
                    uniforms.uLightPositionType.value[index].set(0, 0, 0, 1);
                    uniforms.uLightDirectionRange.value[index].set(0, -1, 0, 0);
                    uniforms.uLightColorIntensity.value[index].set(0, 0, 0, 0);
                    uniforms.uLightConeShadow.value[index].set(-1, 1, -1, 0);
                    continue;
                }
                const { uuid, light } = entry;
                const element = elementByUuid.get(uuid);
                const type = light.isDirectionalLight ? 0 : (light.isSpotLight ? 2 : 1);
                light.getWorldPosition?.(position);
                if (type !== 1) {
                    if (light.target?.getWorldPosition) {
                        light.target.getWorldPosition(targetPosition);
                        direction.copy(targetPosition).sub(position).normalize();
                    } else {
                        direction.set(0, 0, -1).applyQuaternion(light.getWorldQuaternion(state.scratch.quaternion)).normalize();
                    }
                } else {
                    // Point-light direction is never consumed by the volume shader.
                    direction.set(0, -1, 0);
                }
                const range = Math.max(0, finite(light.distance, finite(element?.distance, 0)));
                uniforms.uLightPositionType.value[index].set(position.x, position.y, position.z, type);
                uniforms.uLightDirectionRange.value[index].set(direction.x, direction.y, direction.z, range);
                uniforms.uLightColorIntensity.value[index].set(
                    finite(light.color?.r, 1), finite(light.color?.g, 1), finite(light.color?.b, 1),
                    clamp(finite(light.intensity, finite(element?.render_intensity, 1)), 0, 100000)
                );
                const angle = clamp(finite(light.angle, THREE.MathUtils.degToRad(finite(element?.angle, 45))), 0.001, Math.PI * 0.499);
                const penumbra = clamp(finite(light.penumbra, finite(element?.penumbra, 0)), 0, 1);
                const outerCos = Math.cos(angle);
                const innerCos = Math.cos(angle * (1 - penumbra));
                let shadowSlot = -1;
                const mayShadow = state.shadowMode !== 'none' && type !== 1 &&
                    element?.has_shadow !== false && light.castShadow !== false &&
                    light.shadow?.map?.texture && shadowCount < MAX_SHADOWS;
                if (mayShadow) {
                    shadowSlot = shadowCount++;
                    const textureUniform = shadowSlot === 0 ? uniforms.uShadowMap0 : uniforms.uShadowMap1;
                    const matrixUniform = shadowSlot === 0 ? uniforms.uShadowMatrix0 : uniforms.uShadowMatrix1;
                    const paramsUniform = shadowSlot === 0 ? uniforms.uShadowParams0 : uniforms.uShadowParams1;
                    textureUniform.value = light.shadow.map.texture;
                    matrixUniform.value.copy(light.shadow.matrix);
                    const mapWidth = finite(light.shadow.map.width, finite(light.shadow.mapSize?.x, 1024));
                    const mapHeight = finite(light.shadow.map.height, finite(light.shadow.mapSize?.y, 1024));
                    const shadowRadius = Math.max(
                        clamp(finite(element?.shadow_softness, 1), 0, 12),
                        0.75
                    );
                    paramsUniform.value.set(
                        shadowRadius / Math.max(1, mapWidth),
                        shadowRadius / Math.max(1, mapHeight),
                        finite(light.shadow.bias, finite(element?.shadow_bias, -0.0005)),
                        0
                    );
                }
                uniforms.uLightConeShadow.value[index].set(outerCos, innerCos, shadowSlot, 0);
            }
            if (shadowCount < 1) {
                uniforms.uShadowMap0.value = this.whiteTexture;
                uniforms.uShadowMatrix0.value.identity();
                uniforms.uShadowParams0.value.set(0, 0, 0, 0);
            }
            if (shadowCount < 2) {
                uniforms.uShadowMap1.value = this.whiteTexture;
                uniforms.uShadowMatrix1.value.identity();
                uniforms.uShadowParams1.value.set(0, 0, 0, 0);
            }
            uniforms.uLightCount.value = lightCount;
            state.directionalOnlyLights = lightCount === 1 && !!candidates[0].light?.isDirectionalLight;
            state.stats.lastCandidateLights = candidateCount;
            state.stats.lastActiveLights = lightCount;
            state.stats.lastShadowedLights = shadowCount;
        },

        updateScreenShaftUniforms(state, preview, volume, depthSources) {
            const lights = window.three_lights || {};
            const requestedLight = volume?.light_uuid ? lights[volume.light_uuid] : null;
            const light = requestedLight || Object.values(lights).find(candidate => (
                candidate?.visible !== false && finite(candidate?.intensity, 0) > 0 &&
                (candidate.isDirectionalLight || candidate.isSpotLight || candidate.isPointLight)
            ));
            if (!light) return false;
            const uniforms = state.shaftUniforms;
            const camera = preview.camera;
            const sourcePoint = state.scratch.position;
            if (light.isDirectionalLight) {
                light.getWorldPosition?.(sourcePoint);
                if (light.target?.getWorldPosition) {
                    light.target.getWorldPosition(state.scratch.targetPosition);
                    state.scratch.direction.copy(sourcePoint).sub(state.scratch.targetPosition).normalize();
                } else {
                    state.scratch.direction.set(0, 0, 1)
                        .applyQuaternion(light.getWorldQuaternion(state.scratch.quaternion)).normalize();
                }
                camera.getWorldPosition?.(sourcePoint);
                sourcePoint.addScaledVector(state.scratch.direction, Math.max(100, finite(camera.far, 1000) * 0.5));
            } else {
                light.getWorldPosition?.(sourcePoint);
            }
            state.scratch.boundsProjected.copy(sourcePoint).project(camera);
            uniforms.uLightUv.value.set(
                state.scratch.boundsProjected.x * 0.5 + 0.5,
                state.scratch.boundsProjected.y * 0.5 + 0.5
            );
            uniforms.tSceneDepth.value = depthSources?.sceneDepth || state.sceneTarget.depthTexture;
            colorArrayToVector(volume?.scattering_color, uniforms.uShaftColor.value);
            uniforms.uShaftParams.value.set(
                clamp(finite(volume?.shaft_length, 0.78), 0.05, 1.5),
                clamp(finite(volume?.shaft_decay, 0.93), 0.5, 0.999),
                clamp(finite(volume?.shaft_radius, 0.82), 0.05, 2),
                clamp(finite(volume?.shaft_exposure, 1), 0, 8)
            );
            uniforms.uShaftViewport.value.set(state.sceneWidth, state.sceneHeight);
            const quality = preview?.sa_studio_render_active || window.LightManagerStudioRenderSession
                ? this.settings.render_quality
                : this.settings.preview_quality;
            uniforms.uShaftSamples.value = quality === 'draft' ? 8 : (quality === 'balanced' ? 12 : 16);
            return true;
        },

        hashNumber(hash, value) {
            const quantized = Math.round(finite(value, 0) * 100000);
            return Math.imul((hash ^ quantized) >>> 0, 16777619) >>> 0;
        },

        hashString(hash, value) {
            const text = String(value || '');
            for (let index = 0; index < text.length; index++) {
                hash = Math.imul((hash ^ text.charCodeAt(index)) >>> 0, 16777619) >>> 0;
            }
            return hash;
        },

        hashArray(hash, values) {
            if (!values) return this.hashNumber(hash, 0);
            for (let index = 0; index < values.length; index++) hash = this.hashNumber(hash, values[index]);
            return hash;
        },

        computeFrameSignature(state, preview, volumes, studio, options = {}) {
            let hash = 2166136261;
            hash = this.hashNumber(hash, this.sceneRevision);
            hash = this.hashNumber(hash, window.LightflowAnimationRuntime?.getSceneMotionEpoch?.() || 0);
            hash = this.hashNumber(hash, state.sceneWidth);
            hash = this.hashNumber(hash, state.sceneHeight);
            hash = this.hashNumber(hash, state.volumeWidth);
            hash = this.hashNumber(hash, state.volumeHeight);
            hash = this.hashString(hash, studio ? this.settings.render_quality : this.settings.preview_quality);
            hash = this.hashNumber(hash, this.settings.helper_mask ? 1 : 0);
            hash = this.hashNumber(hash, this.settings.temporal_jitter ? 1 : 0);
            const camera = preview.camera;
            let animated = !!this.settings.temporal_jitter;
            volumes.forEach(volume => {
                hash = this.hashString(hash, volume.uuid);
                hash = this.hashArray(hash, volume.mesh?.matrixWorld?.elements);
                hash = this.hashArray(hash, volume.size);
                hash = this.hashString(hash, volume.shape);
                hash = this.hashString(hash, volume.density_mode);
                hash = this.hashString(hash, volume.composite_mode);
                hash = this.hashString(hash, volume.technique_override);
                hash = this.hashString(hash, volume.intent);
                hash = this.hashNumber(hash, volume.density);
                hash = this.hashNumber(hash, volume.scattering_strength);
                hash = this.hashNumber(hash, volume.absorption);
                hash = this.hashNumber(hash, volume.anisotropy);
                hash = this.hashNumber(hash, volume.ambient);
                hash = this.hashNumber(hash, volume.shadow_fill);
                hash = this.hashNumber(hash, volume.edge_feather);
                hash = this.hashNumber(hash, volume.height_falloff);
                hash = this.hashNumber(hash, volume.height_offset);
                hash = this.hashNumber(hash, volume.noise_scale);
                hash = this.hashNumber(hash, volume.noise_detail);
                hash = this.hashNumber(hash, volume.coverage);
                hash = this.hashNumber(hash, volume.erosion);
                hash = this.hashNumber(hash, volume.wind_speed);
                hash = this.hashArray(hash, volume.wind_direction);
                hash = this.hashArray(hash, volume.scattering_color);
                hash = this.hashArray(hash, volume.absorption_color);
                hash = this.hashNumber(hash, volume.receive_shadows === false ? 0 : 1);
                if (volume.density_mode === 'cloud' && Math.abs(finite(volume.wind_speed, 0)) > 0.00001) animated = true;
            });

            const lights = window.three_lights || {};
            for (const uuid in lights) {
                if (!Object.prototype.hasOwnProperty.call(lights, uuid)) continue;
                const light = lights[uuid];
                if (!light || light.visible === false || finite(light.intensity, 0) <= 0) continue;
                hash = this.hashString(hash, uuid);
                hash = this.hashArray(hash, light.matrixWorld?.elements);
                hash = this.hashArray(hash, light.target?.matrixWorld?.elements);
                hash = this.hashNumber(hash, light.intensity);
                hash = this.hashNumber(hash, light.distance);
                hash = this.hashNumber(hash, light.angle);
                hash = this.hashNumber(hash, light.penumbra);
                hash = this.hashNumber(hash, light.color?.r);
                hash = this.hashNumber(hash, light.color?.g);
                hash = this.hashNumber(hash, light.color?.b);
                hash = this.hashNumber(hash, light.castShadow === false ? 0 : 1);
                hash = this.hashArray(hash, light.shadow?.matrix?.elements);
                hash = this.hashNumber(hash, light.shadow?.bias);
            }
            const tile = studio && this.studioTile?.preview === preview ? this.studioTile.tile : null;
            if (tile) {
                hash = this.hashNumber(hash, tile.viewX);
                hash = this.hashNumber(hash, tile.viewY);
                hash = this.hashNumber(hash, tile.viewWidth);
                hash = this.hashNumber(hash, tile.viewHeight);
                hash = this.hashNumber(hash, tile.sampleX);
                hash = this.hashNumber(hash, tile.sampleY);
            }
            // The temporal/uniform key shares all content with the beauty key.
            // Save it before camera and time instead of hashing every light and
            // volume a second time during the same composite.
            if (options.captureTemporal) state.currentTemporalSignature = hash >>> 0;
            if (options.includeCamera !== false) {
                hash = this.hashArray(hash, camera?.matrixWorld?.elements);
                hash = this.hashArray(hash, camera?.projectionMatrix?.elements);
                hash = this.hashNumber(hash, camera?.near);
                hash = this.hashNumber(hash, camera?.far);
            }
            if (window.Timeline?.playing) animated = true;
            const cinematicFrame = window.LightflowCinematicFrameContext;
            if (options.includeAnimationTick !== false && cinematicFrame?.deterministic && Number.isFinite(cinematicFrame.timeSeconds)) {
                hash = this.hashNumber(hash, cinematicFrame.timeSeconds);
            }
            if (animated && !studio && options.includeAnimationTick !== false &&
                !(cinematicFrame?.deterministic && Number.isFinite(cinematicFrame.timeSeconds))) {
                hash = this.hashNumber(hash, Math.floor(performance.now() / 33));
            }
            return hash >>> 0;
        },

        computeDepthSignature(state, preview, studio) {
            let hash = 2166136261;
            hash = this.hashNumber(hash, this.sceneRevision);
            hash = this.hashNumber(hash, window.LightflowAnimationRuntime?.getSceneMotionEpoch?.() || 0);
            hash = this.hashNumber(hash, state.depthWidth);
            hash = this.hashNumber(hash, state.depthHeight);
            hash = this.hashNumber(hash, this.settings.helper_mask ? 1 : 0);
            const camera = preview.camera;
            hash = this.hashArray(hash, camera?.matrixWorld?.elements);
            hash = this.hashArray(hash, camera?.projectionMatrix?.elements);
            hash = this.hashNumber(hash, camera?.near);
            hash = this.hashNumber(hash, camera?.far);
            const tile = studio && this.studioTile?.preview === preview ? this.studioTile.tile : null;
            if (tile) {
                hash = this.hashNumber(hash, tile.viewX);
                hash = this.hashNumber(hash, tile.viewY);
                hash = this.hashNumber(hash, tile.viewWidth);
                hash = this.hashNumber(hash, tile.viewHeight);
                hash = this.hashNumber(hash, tile.sampleX);
                hash = this.hashNumber(hash, tile.sampleY);
            }
            return hash >>> 0;
        },

        performance() {
            const result = {
                states: this.states.size,
                raymarches: 0,
                analyticPasses: 0,
                cacheHits: 0,
                depthCaptures: 0,
                sceneDepthCaptures: 0,
                geometryDepthCaptures: 0,
                canonicalDepthHits: 0,
                legacyDepthHits: 0,
                depthFallbackCaptures: 0,
                bloomReuseHits: 0,
                bloomExtraRaymarches: 0,
                avoidedRaymarches: 0,
                temporalResolves: 0,
                temporalHistoryHits: 0,
                stableUniformUploads: 0,
                stableUniformReuses: 0,
                cacheHitRate: 0
            };
            this.states.forEach(state => {
                result.raymarches += state.stats.raymarches;
                result.analyticPasses += state.stats.analyticPasses || 0;
                result.cacheHits += state.stats.cacheHits;
                result.depthCaptures += state.stats.depthCaptures;
                result.sceneDepthCaptures += state.stats.sceneDepthCaptures || 0;
                result.geometryDepthCaptures += state.stats.geometryDepthCaptures || 0;
                result.canonicalDepthHits += state.stats.canonicalDepthHits || 0;
                result.legacyDepthHits += state.stats.legacyDepthHits || 0;
                result.depthFallbackCaptures += state.stats.depthFallbackCaptures || 0;
                result.bloomReuseHits += state.stats.bloomReuseHits || 0;
                result.bloomExtraRaymarches += state.stats.bloomExtraRaymarches || 0;
                result.avoidedRaymarches += state.stats.avoidedRaymarches || 0;
                result.temporalResolves += state.stats.temporalResolves || 0;
                result.temporalHistoryHits += state.stats.temporalHistoryHits || 0;
                result.stableUniformUploads += state.stats.stableUniformUploads || 0;
                result.stableUniformReuses += state.stats.stableUniformReuses || 0;
            });
            const total = result.raymarches + result.cacheHits;
            result.cacheHitRate = total ? result.cacheHits / total : 0;
            return result;
        },

        updateUniforms(state, preview, volumeRoutes, studio, bloomPass, depthSources, stableSignature = null) {
            const volumes = volumeRoutes.map(route => route.volume);
            const camera = preview.camera;
            camera.updateMatrixWorld?.(true);
            const inverseProjection = state.volumeUniforms.uInverseProjection.value;
            if (camera.projectionMatrixInverse) inverseProjection.copy(camera.projectionMatrixInverse);
            else if (inverseProjection.invert) inverseProjection.copy(camera.projectionMatrix).invert();
            else inverseProjection.getInverse(camera.projectionMatrix);
            state.volumeUniforms.uCameraWorld.value.copy(camera.matrixWorld);
            camera.getWorldPosition?.(state.volumeUniforms.uCameraPosition.value);
            state.volumeUniforms.uCameraFar.value = Math.max(1, finite(camera.far, 1000));
            state.volumeUniforms.uOrthographic.value = !!camera.isOrthographicCamera;
            state.volumeUniforms.uTemporalJitter.value = !!this.settings.temporal_jitter;
            state.volumeUniforms.uHelperMask.value = !!this.settings.helper_mask;
            state.volumeUniforms.uBloomPass.value = !!bloomPass;
            const quality = studio ? this.settings.render_quality : this.settings.preview_quality;
            const table = studio ? RENDER_STEPS : PREVIEW_STEPS;
            const frameBudgetScale = studio
                ? 1
                : clamp(finite(window.LightflowFrameBudget?.get?.()?.atmosphereScale, 1), 0.5, 1);
            const raymarchedVolumes = volumeRoutes
                .filter(route => AtmosphereV2Core.RAYMARCH_TECHNIQUES.has(route.technique))
                .map(route => route.volume);
            let contentStepScale = 0.55;
            raymarchedVolumes.forEach(volume => {
                if (volume?.density_mode === 'cloud') {
                    contentStepScale = Math.max(
                        contentStepScale,
                        0.82 + 0.06 * clamp(finite(volume.noise_detail, 3), 1, 3)
                    );
                } else if (volume?.density_mode === 'height') {
                    contentStepScale = Math.max(contentStepScale, 0.68);
                }
                if (volume?.receive_shadows !== false) {
                    contentStepScale = Math.max(contentStepScale, 0.82);
                }
                if (volume?.composite_mode === 'shafts') {
                    contentStepScale = Math.max(contentStepScale, 0.88);
                }
            });
            if (bloomPass) contentStepScale = Math.min(contentStepScale, 0.78);
            const requestedSteps = table[quality] || (studio ? 64 : 24);
            const stepProfiles = studio
                ? {
                    draft: [12, 36, 3.5], balanced: [16, 56, 2.5],
                    high: [20, 76, 1.8], ultra: [28, 96, 1.25], reference: [32, 96, 1.0]
                }
                : {
                    draft: [8, 20, 5.0], balanced: [10, 36, 3.25],
                    high: [14, 52, 2.35], ultra: [18, 72, 1.75]
                };
            const [minimumSteps, maximumSteps, desiredWorldStep] = stepProfiles[quality] || stepProfiles.balanced;
            let pathDrivenSteps = minimumSteps;
            raymarchedVolumes.forEach(volume => {
                const size = Array.isArray(volume?.size) ? volume.size : [16, 16, 16];
                const pathLength = Math.hypot(
                    Math.abs(finite(size[0], 16)),
                    Math.abs(finite(size[1], 16)),
                    Math.abs(finite(size[2], 16))
                );
                const noiseFrequency = Math.sqrt(Math.max(1, finite(volume?.noise_scale, 3.2) / 3.2));
                const opticalDepth = Math.max(0.5, Math.sqrt(1 + finite(volume?.density, 0.04) * pathLength));
                pathDrivenSteps = Math.max(
                    pathDrivenSteps,
                    pathLength / desiredWorldStep * noiseFrequency * opticalDepth
                );
            });
            const octavePolicy = { draft: 1, balanced: 2, high: 2, ultra: 3, reference: 3 };
            state.activeNoiseOctaves = Math.max(
                1,
                (octavePolicy[quality] || 2) - (!studio && frameBudgetScale < 0.72 ? 1 : 0)
            );
            state.volumeUniforms.uSteps.value = raymarchedVolumes.length
                ? Math.min(
                    MAX_RAY_STEPS, maximumSteps,
                    Math.max(minimumSteps, Math.round(Math.min(
                        requestedSteps * contentStepScale,
                        pathDrivenSteps
                    ) * Math.sqrt(frameBudgetScale)))
                )
                : 0;
            state.stats.lastRequestedSteps = requestedSteps;
            state.stats.lastEffectiveSteps = state.volumeUniforms.uSteps.value;
            state.stats.lastRaymarchedVolumes = raymarchedVolumes.length;
            state.stats.lastAnalyticVolumes = Math.max(0, volumes.length - raymarchedVolumes.length);
            state.stats.lastContentStepScale = contentStepScale;
            state.stats.lastNoiseOctaves = raymarchedVolumes.length ? state.activeNoiseOctaves : 0;
            const requestedShadowMode = String(this.settings.volumetric_shadow_mode || 'auto');
            state.shadowMode = requestedShadowMode === 'auto'
                ? (studio && ['ultra', 'reference'].includes(quality) ? 'full' : 'cheap')
                : (['none', 'cheap', 'full'].includes(requestedShadowMode) ? requestedShadowMode : 'cheap');
            state.volumeUniforms.uShadowSamples.value = state.shadowMode === 'full' ? 4 : 1;
            const cinematicFrame = window.LightflowCinematicFrameContext;
            if (cinematicFrame?.deterministic && Number.isFinite(cinematicFrame.timeSeconds)) {
                state.volumeUniforms.uTime.value = cinematicFrame.timeSeconds;
                state.volumeUniforms.uJitterTime.value = cinematicFrame.timeSeconds +
                    (studio ? this.studioSampleIndex * 0.61803398875 : 0);
            } else if (studio) {
                if (this.studioTime === null) this.studioTime = performance.now() * 0.001;
                state.volumeUniforms.uTime.value = this.studioTime + this.studioSampleIndex * 0.61803398875;
                state.volumeUniforms.uJitterTime.value = state.volumeUniforms.uTime.value;
            } else {
                this.studioTime = null;
                state.volumeUniforms.uTime.value = performance.now() * 0.001;
                state.volumeUniforms.uJitterTime.value = state.volumeUniforms.uTime.value;
            }
            const tile = studio && this.studioTile?.preview === preview ? this.studioTile.tile : null;
            const volumeToRenderX = state.sceneWidth / Math.max(1, state.volumeWidth);
            const volumeToRenderY = state.sceneHeight / Math.max(1, state.volumeHeight);
            const viewScaleX = tile ? finite(tile.viewWidth, state.sceneWidth) / Math.max(1, finite(tile.renderWidth, state.sceneWidth)) : 1;
            const viewScaleY = tile ? finite(tile.viewHeight, state.sceneHeight) / Math.max(1, finite(tile.renderHeight, state.sceneHeight)) : 1;
            state.volumeUniforms.uFrameOrigin.value.set(
                tile ? finite(tile.viewX, finite(tile.sampleX, 0) - finite(tile.cropX, 0)) : 0,
                tile ? finite(tile.fullViewHeight, state.sceneHeight) - finite(tile.viewY, 0) - finite(tile.viewHeight, state.sceneHeight) : 0
            );
            state.volumeUniforms.uFramePixelScale.value.set(
                volumeToRenderX * viewScaleX,
                volumeToRenderY * viewScaleY
            );
            state.volumeUniforms.tSceneDepth.value = depthSources.sceneDepth;
            state.volumeUniforms.tCubeDepth.value = depthSources.cubeDepth;
            state.compositeUniforms.tSceneDepth.value = depthSources.sceneDepth;
            state.compositeUniforms.tCubeDepth.value = depthSources.cubeDepth;
            state.compositeUniforms.uInverseProjection.value.copy(inverseProjection);
            state.compositeUniforms.uHelperMask.value = !!this.settings.helper_mask;
            const artSource = this.settings;
            state.compositeUniforms.uArtParams.value.set(
                clamp(finite(artSource.art_max_opacity, 1), 0, 1),
                clamp(finite(artSource.art_saturation, 1), 0, 2),
                clamp(finite(artSource.art_contrast, 1), 0, 3),
                Math.round(clamp(finite(artSource.art_posterize, 0), 0, 32))
            );
            state.compositeUniforms.uDitherQuantize.value.set(
                clamp(finite(artSource.art_dither, 0), 0, 1),
                Math.round(clamp(finite(artSource.art_color_quantization, 0), 0, 32))
            );
            colorArrayToVector(artSource.art_near_color, state.compositeUniforms.uRampNearColor.value);
            colorArrayToVector(artSource.art_far_color, state.compositeUniforms.uRampFarColor.value);
            state.compositeUniforms.uRampParams.value.set(
                clamp(finite(artSource.art_ramp_strength, 0), 0, 1),
                clamp(finite(artSource.art_ramp_curve, 1), 0.05, 8)
            );
            state.compositeUniforms.uCompositeCameraFar.value = Math.max(1, finite(camera.far, 1000));
            if (state.stableUniformSignature !== stableSignature) {
                this.updateVolumeUniforms(state, volumeRoutes);
                this.updateLightUniforms(state, volumes);
                const shaderFamily = raymarchedVolumes.length === 0
                    ? 'analytic_local'
                    : (state.directionalOnlyLights
                        ? 'volumetric_sun'
                        : (state.stats.lastShadowedLights > 0 ? 'volumetric_shadowed' : 'volumetric_lit'));
                if (state.shaderFamily !== shaderFamily) {
                    state.shaderFamily = shaderFamily;
                    state.volumeMaterial.defines = {
                        ...(shaderFamily === 'analytic_local' ? { LF_ANALYTIC_ONLY: 1 } : {}),
                        ...(shaderFamily === 'volumetric_sun' ? { LF_DIRECTIONAL_ONLY: 1 } : {})
                    };
                    state.volumeMaterial.needsUpdate = true;
                }
                state.stats.lastShaderFamily = shaderFamily;
                state.stableUniformSignature = stableSignature;
                state.stats.stableUniformUploads = (state.stats.stableUniformUploads || 0) + 1;
            } else {
                state.stats.stableUniformReuses = (state.stats.stableUniformReuses || 0) + 1;
            }
        },

        composite(preview, options) {
            const settings = options || {};
            if (
                !settings.studio &&
                !settings.bloomMask &&
                !preview?.sa_studio_render_active &&
                !window.LightManagerStudioRenderSession &&
                window.ShaderEngine?.shouldDeferProjectPreviewEffect?.(3, preview)
            ) return false;
            if (this.disposed || !this.settings.enabled || !preview?.renderer || !window.Canvas?.scene) return false;
            const volumes = this.getActiveVolumes(preview.camera);
            if (!volumes.length) return false;
            const state = this.getPreviewState(preview);
            if (!state || state.rendering) return false;
            const renderer = state.renderer;
            const studio = this.isStudioPass(preview, settings);
            const quality = studio ? this.settings.render_quality : this.settings.preview_quality;
            const gl = renderer.getContext?.();
            const floatColorSupported = !!(
                renderer.capabilities?.isWebGL2 &&
                gl?.getExtension?.('EXT_color_buffer_float') &&
                THREE.HalfFloatType
            );
            const useHalfFloat = !!(studio && ['high', 'ultra', 'reference'].includes(quality) && floatColorSupported);
            const targetType = useHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
            if (state.atmosphereTargetType !== targetType) {
                state.atmosphereTargetType = targetType;
                [state.volumeTarget, state.volumeHistoryTarget, state.volumeResolveTarget].forEach(target => {
                    target.texture.type = targetType;
                    target.dispose?.();
                });
                state.lastNormalVolumeReady = false;
                state.temporalHistoryValid = false;
            }
            state.useLogEncoding = !useHalfFloat;
            state.volumeUniforms.uLogEncode.value = state.useLogEncoding;
            state.compositeUniforms.uLogEncoded.value = state.useLogEncoding;
            state.stats.lastHdrFormat = useHalfFloat ? 'rgba16f' : 'rgba8_log';
            const techniqueResolution = this.getTechniqueResolution(preview, { studio }, volumes);
            state.lastTechniqueResolution = techniqueResolution;
            const screenShaftVolumes = techniqueResolution.volumeRoutes
                .filter(route => route.technique === AtmosphereV2Core.Technique.SCREEN_SHAFTS)
                .map(route => route.volume);
            const integratedRoutes = techniqueResolution.volumeRoutes
                .filter(route => ![
                    AtmosphereV2Core.Technique.SCREEN_SHAFTS,
                    AtmosphereV2Core.Technique.GEOMETRY_SHAFTS
                ].includes(route.technique));
            const renderMode = String(window.ShaderEngine?.globalRenderMode || '');
            if (state.renderMode !== renderMode) {
                state.renderMode = renderMode;
                state.lastNormalVolumeReady = false;
                state.lastFrameSignature = null;
                state.lastDepthSignature = null;
                state.lastDepthSources = null;
                state.temporalHistoryValid = false;
                state.temporalHistorySignature = null;
                state.stableUniformSignature = null;
            }
            state.rendering = true;
            // Bloom may have a smaller target than beauty. Resizing the shared
            // integration here destroys its cache and forces both consumers to
            // raymarch again on every frame. Keep beauty's normalized texture
            // and depth mapping when the scene/camera signature still matches.
            const outputViewport = getPhysicalFramebufferViewport(renderer, preview);
            if (!this.canReuseBeautyIntegration(state, preview, volumes, studio, settings)) {
                this.resize(state, studio);
            }
            const projectedBounds = this.computeProjectedBounds(preview, volumes, state);
            if (!projectedBounds) {
                state.stats.culledFrames++;
                state.lastProjectedBounds = null;
                state.rendering = false;
                return false;
            }
            state.lastProjectedBounds = projectedBounds;
            const frameSignature = this.computeFrameSignature(state, preview, volumes, studio, { captureTemporal: true });
            const temporalSignature = state.currentTemporalSignature;
            const depthSignature = this.computeDepthSignature(state, preview, studio);
            const hasMovingClouds = volumes.some(volume => (
                volume?.density_mode === 'cloud' &&
                Math.abs(finite(volume?.wind_speed, 0)) > 0.00001
            ));
            const temporalEnabled = this.settings.temporal_response !== 'off' && !studio && !settings.bloomMask && (
                !!this.settings.temporal_jitter || hasMovingClouds
            );
            preview.camera.getWorldPosition?.(state.scratch.cameraPosition);
            preview.camera.getWorldQuaternion?.(state.scratch.quaternion);
            const currentCameraCut = !!(
                state.previousCameraValid && (
                    state.previousCameraPosition.distanceTo(state.scratch.cameraPosition) >
                        Math.max(8, finite(preview.camera.far, 1000) * 0.2) ||
                    Math.abs(state.previousCameraQuaternion.dot(state.scratch.quaternion)) < 0.82
                )
            );
            const checkerboardEnabled = !!(
                this.settings.temporal_interleave && temporalEnabled &&
                state.temporalHistoryValid &&
                state.temporalHistorySignature === temporalSignature &&
                !currentCameraCut
            );
            state.volumeUniforms.uCheckerboard.value = checkerboardEnabled;
            state.volumeUniforms.uCheckerboardPhase.value = state.stats.raymarches % 2;
            const previousTarget = renderer.getRenderTarget?.() || null;
            const previousTargetViewport = previousTarget?.viewport?.clone?.() || null;
            const previousTargetScissor = previousTarget?.scissor?.clone?.() || null;
            const previousTargetScissorTest = previousTarget?.scissorTest ?? false;
            const previousAutoClear = renderer.autoClear;
            const previousViewport = renderer.getViewport?.(new THREE.Vector4()) || null;
            const previousScissor = renderer.getScissor?.(new THREE.Vector4()) || null;
            const previousScissorTest = renderer.getScissorTest?.() ?? false;
            const previousClearColor = new THREE.Color();
            const previousClearAlpha = renderer.getClearAlpha?.() ?? 1;
            renderer.getClearColor?.(previousClearColor);
            try {
                const sameNormalFrame = state.lastNormalVolumeReady &&
                    state.lastNormalStudio === studio &&
                    state.lastFrameSignature === frameSignature;
                const useCachedBloom = !!settings.bloomMask && sameNormalFrame;
                const useCachedNormal = !settings.bloomMask && !!this.settings.static_cache && sameNormalFrame;
                if (!useCachedBloom && !useCachedNormal) {
                    // The frame graph owns SceneDepth. Atmosphere consumes its
                    // typed canonical resource first, then a compatible legacy
                    // AO pair, and captures its own depth only as a final
                    // fallback. Cube depth remains a separate helper/geometry
                    // mask until the frame graph exposes that contract too.
                    const canonicalDepth = this.getCanonicalSceneDepth(settings.frameContext, state);
                    const sharedDepth = canonicalDepth
                        ? null
                        : this.findFreshSharedDepthSources(preview, state);
                    const cachedDepth = state.lastDepthSignature === depthSignature
                        ? state.lastDepthSources
                        : null;
                    let depthSources = null;
                    if (canonicalDepth) {
                        state.stats.canonicalDepthHits++;
                        if (cachedDepth?.cubeDepth) {
                            depthSources = {
                                sceneDepth: this.settings.helper_mask
                                    ? canonicalDepth.sceneDepth
                                    : cachedDepth.cubeDepth,
                                cubeDepth: cachedDepth.cubeDepth,
                                source: 'canonical_plus_cached_geometry',
                                frameId: canonicalDepth.frameId
                            };
                        } else {
                            depthSources = this.captureDepth(state, preview, {
                                sceneDepth: canonicalDepth.sceneDepth,
                                source: 'canonical_plus_geometry'
                            });
                            if (depthSources) depthSources.frameId = canonicalDepth.frameId;
                        }
                    } else if (sharedDepth) {
                        state.stats.legacyDepthHits++;
                        depthSources = sharedDepth;
                    } else if (cachedDepth) {
                        depthSources = cachedDepth;
                    } else {
                        state.stats.depthFallbackCaptures++;
                        depthSources = this.captureDepth(state, preview, { source: 'own_fallback' });
                    }
                    if (!depthSources) return false;
                    state.lastDepthSources = depthSources;
                    state.lastDepthSignature = depthSignature;
                    this.updateUniforms(
                        state,
                        preview,
                        integratedRoutes,
                        studio,
                        false,
                        depthSources,
                        temporalSignature
                    );
                    renderer.autoClear = true;
                    configureRenderTarget(state.volumeTarget, state.volumeWidth, state.volumeHeight);
                    renderer.setRenderTarget?.(state.volumeTarget);
                    renderer.setClearColor?.(0x000000, 0);
                    renderer.clear?.(true, true, true);
                    state.volumeTarget.scissor?.set?.(
                        projectedBounds.volumeRect.x,
                        projectedBounds.volumeRect.y,
                        projectedBounds.volumeRect.width,
                        projectedBounds.volumeRect.height
                    );
                    state.volumeTarget.scissorTest = true;
                    setPhysicalFramebufferScissor(renderer, projectedBounds.volumeRect);
                    renderer.render(state.volumeScene, state.postCamera);
                    if (techniqueResolution.activeRaymarchVolumes > 0) {
                        state.stats.raymarches++;
                    }
                    if (techniqueResolution.activeAnalyticVolumes > 0) {
                        state.stats.analyticPasses++;
                        state.stats.avoidedRaymarches += techniqueResolution.activeAnalyticVolumes;
                    }
                    if (!settings.bloomMask) {
                        if (temporalEnabled) {
                            preview.camera.getWorldPosition?.(state.scratch.cameraPosition);
                            preview.camera.getWorldQuaternion?.(state.scratch.quaternion);
                            const historyCompatible = !!(
                                state.temporalHistoryValid &&
                                state.temporalHistorySignature === temporalSignature &&
                                !currentCameraCut
                            );
                            state.temporalUniforms.tCurrent.value = state.volumeTarget.texture;
                            state.temporalUniforms.tHistory.value = state.volumeHistoryTarget.texture;
                            state.temporalUniforms.tCurrentDepth.value = depthSources.sceneDepth;
                            state.temporalUniforms.tHistoryDepth.value = state.historyDepthTarget.texture;
                            state.temporalUniforms.uInverseProjection.value.copy(state.volumeUniforms.uInverseProjection.value);
                            state.temporalUniforms.uCameraWorld.value.copy(preview.camera.matrixWorld);
                            state.temporalUniforms.uPreviousViewProjection.value.copy(state.previousViewProjection);
                            state.temporalUniforms.uCheckerboard.value = checkerboardEnabled;
                            state.temporalUniforms.uCheckerboardPhase.value = state.volumeUniforms.uCheckerboardPhase.value;
                            const historyWeights = { stable: 0.9, balanced: 0.82, responsive: 0.58, off: 0 };
                            state.temporalUniforms.uHistoryBlend.value = historyCompatible
                                ? (historyWeights[this.settings.temporal_response] ?? 0.82)
                                : 0;
                            state.stats.lastHistoryRejectReason = historyCompatible
                                ? null
                                : (currentCameraCut ? 'camera_cut' : (state.temporalHistoryValid ? 'topology_change' : 'history_unavailable'));
                            renderer.setRenderTarget?.(state.volumeResolveTarget);
                            renderer.setScissorTest?.(false);
                            renderer.clear?.(true, false, false);
                            renderer.render(state.temporalScene, state.postCamera);
                            const resolvedTarget = state.volumeResolveTarget;
                            state.volumeResolveTarget = state.volumeHistoryTarget;
                            state.volumeHistoryTarget = resolvedTarget;
                            state.compositeUniforms.tVolume.value = state.volumeHistoryTarget.texture;
                            state.temporalHistoryValid = true;
                            state.temporalHistorySignature = temporalSignature;
                            state.stats.temporalResolves++;
                            if (historyCompatible) state.stats.temporalHistoryHits++;
                            else state.stats.temporalHistoryRejections = (state.stats.temporalHistoryRejections || 0) + 1;

                            state.depthHistoryUniforms.tDepth.value = depthSources.sceneDepth;
                            renderer.setRenderTarget?.(state.historyDepthTarget);
                            renderer.setScissorTest?.(false);
                            renderer.clear?.(true, false, false);
                            renderer.render(state.depthHistoryScene, state.postCamera);
                            state.previousViewProjection.multiplyMatrices(
                                preview.camera.projectionMatrix,
                                preview.camera.matrixWorldInverse
                            );
                            state.previousCameraPosition.copy(state.scratch.cameraPosition);
                            state.previousCameraQuaternion.copy(state.scratch.quaternion);
                            state.previousCameraValid = true;
                        } else {
                            state.compositeUniforms.tVolume.value = state.volumeTarget.texture;
                            state.temporalHistoryValid = false;
                            state.temporalHistorySignature = null;
                            state.previousCameraValid = false;
                        }
                    } else {
                        state.compositeUniforms.tVolume.value = state.volumeTarget.texture;
                    }
                    // Beauty integration is canonical for Bloom too. A Bloom
                    // request may build this target first, but it never runs a
                    // Bloom-specific second raymarch. The following beauty or
                    // Bloom consumer reuses the exact integrated medium.
                    state.lastNormalVolumeReady = true;
                    state.lastNormalStudio = studio;
                    state.lastFrameSignature = frameSignature;
                    state.lastBloomMultiplier = clamp(finite(this.settings.art_bloom_response, 1), 0, 4);
                } else {
                    state.stats.cacheHits++;
                    if (useCachedBloom) {
                        state.stats.bloomReuseHits++;
                        state.stats.avoidedRaymarches++;
                    }
                }

                renderer.autoClear = false;
                const compositeTarget = settings.target || previousTarget;
                const framebufferViewport = outputViewport;
                const outputScaleX = framebufferViewport.z / state.sceneWidth;
                const outputScaleY = framebufferViewport.w / state.sceneHeight;
                const physicalSceneRect = {
                    x: Math.floor(framebufferViewport.x + projectedBounds.sceneRect.x * outputScaleX),
                    y: Math.floor(framebufferViewport.y + projectedBounds.sceneRect.y * outputScaleY),
                    width: Math.ceil(projectedBounds.sceneRect.width * outputScaleX),
                    height: Math.ceil(projectedBounds.sceneRect.height * outputScaleY)
                };
                if (compositeTarget) {
                    if (settings.target) {
                        compositeTarget.viewport?.set?.(
                            0,
                            0,
                            Math.max(1, Number(compositeTarget.width) || state.sceneWidth || 1),
                            Math.max(1, Number(compositeTarget.height) || state.sceneHeight || 1)
                        );
                        compositeTarget.scissorTest = true;
                    }
                    if (previousTargetViewport && previousTarget.viewport) previousTarget.viewport.copy(previousTargetViewport);
                    if (previousTargetScissor && previousTarget.scissor) previousTarget.scissor.copy(previousTargetScissor);
                    compositeTarget.scissor?.set?.(
                        physicalSceneRect.x,
                        physicalSceneRect.y,
                        physicalSceneRect.width,
                        physicalSceneRect.height
                    );
                    compositeTarget.scissorTest = true;
                    renderer.setRenderTarget?.(compositeTarget);
                } else {
                    renderer.setRenderTarget?.(null);
                    if (previousViewport) renderer.setViewport?.(previousViewport);
                    setPhysicalFramebufferScissor(renderer, physicalSceneRect);
                }
                state.compositeUniforms.uBloomComposite.value = !!settings.bloomMask;
                state.compositeUniforms.uBloomLinear.value = !!settings.linearBloom;
                state.compositeUniforms.uBloomMultiplier.value = settings.bloomMask
                    ? state.lastBloomMultiplier
                    : 1;
                renderer.render(state.compositeScene, state.postCamera);
                if (screenShaftVolumes.length && this.updateScreenShaftUniforms(
                    state,
                    preview,
                    screenShaftVolumes[0],
                    state.lastDepthSources
                )) {
                    renderer.setScissorTest?.(false);
                    renderer.render(state.shaftScene, state.postCamera);
                    state.stats.screenShaftPasses = (state.stats.screenShaftPasses || 0) + 1;
                }
                preview.lightflow_atmosphere_done = true;
                return true;
            } catch (error) {
                console.warn('[Lightflow Atmosphere] volume pass failed', error);
                if (!this.renderFailureShown) {
                    this.renderFailureShown = true;
                    Blockbench.showQuickMessage?.(tr('lightflow_atmosphere.message.render_failed', 'Atmosphere disabled after a GPU render error'), 3200);
                }
                this.settings.enabled = false;
                saveSettings(this.settings);
                return false;
            } finally {
                if (previousTarget) {
                    if (previousTargetViewport && previousTarget.viewport) previousTarget.viewport.copy(previousTargetViewport);
                    if (previousTargetScissor && previousTarget.scissor) previousTarget.scissor.copy(previousTargetScissor);
                    previousTarget.scissorTest = previousTargetScissorTest;
                    renderer.setRenderTarget?.(previousTarget);
                } else {
                    renderer.setRenderTarget?.(null);
                    if (previousViewport) renderer.setViewport?.(previousViewport);
                    if (previousScissor) renderer.setScissor?.(previousScissor);
                    renderer.setScissorTest?.(previousScissorTest);
                }
                renderer.autoClear = previousAutoClear;
                renderer.setClearColor?.(previousClearColor, previousClearAlpha);
                state.rendering = false;
            }
        },

        prepareStudioTile(event) {
            if (!event?.preview) return;
            godRayRuntime?.sync(GodRayElement?.all, window.Canvas?.scene, window.three_lights || {});
            this.studioTile = { preview: event.preview, tile: event.tile || {}, settings: event.settings || {} };
            const state = this.states.get(event.preview);
            if (state) state.lastNormalVolumeReady = false;
            this.patchPreview(event.preview);
        },

        prepareStudioSample(event) {
            if (!event?.preview) return;
            this.studioSampleIndex = Math.max(0, Math.round(finite(event.sampleIndex, 0)));
            if (!this.studioTile || this.studioTile.preview !== event.preview) {
                this.prepareStudioTile(event);
            } else {
                this.studioTile.tile = event.tile || this.studioTile.tile;
                this.studioTile.settings = event.settings || this.studioTile.settings;
            }
            const state = this.states.get(event.preview);
            if (state) {
                state.stats.lastStudioSampleIndex = this.studioSampleIndex;
                state.stats.lastStudioTile = {
                    viewX: finite(event.tile?.viewX, 0),
                    viewY: finite(event.tile?.viewY, 0),
                    viewWidth: finite(event.tile?.viewWidth, 0),
                    viewHeight: finite(event.tile?.viewHeight, 0),
                    fullViewWidth: finite(event.tile?.fullViewWidth, 0),
                    fullViewHeight: finite(event.tile?.fullViewHeight, 0)
                };
            }
        },

        patchPreview(preview) {
            if (!preview?.renderer || this.patchedPreviews.has(preview) || typeof preview.render !== 'function') return;
            if (window.LightflowFramePipeline?.disposed === false) {
                window.LightflowFramePipeline.patchPreview?.(preview);
                return;
            }
            const originalRender = preview.render;
            const manager = this;
            const patchedRender = function lightflowAtmosphereRender() {
                const hostOwnsPipeline = !!this.lightflow_atmosphere_host_cycle;
                if (!hostOwnsPipeline) {
                    this.lightflow_atmosphere_cycle = true;
                    this.lightflow_atmosphere_done = false;
                }
                let result;
                try {
                    manager.prepareSurfaceFog(this);
                    result = originalRender.apply(this, arguments);
                    if (!hostOwnsPipeline && !this.lightflow_atmosphere_done) manager.composite(this);
                } finally {
                    if (!hostOwnsPipeline) {
                        delete this.lightflow_atmosphere_cycle;
                        delete this.lightflow_atmosphere_done;
                    }
                }
                return result;
            };
            preview.render = patchedRender;
            this.patchedPreviews.set(preview, { originalRender, patchedRender });
        },

        patchAllPreviews() {
            const activePreviews = collectPreviews();
            this.pruneInactivePreviews(activePreviews);
            activePreviews.forEach(preview => this.patchPreview(preview));
        }
    };

    function sanitizeVolume(volume) {
        if (!volume) return volume;
        volume.shape = volume.shape === 'sphere' ? 'sphere' : 'box';
        volume.density_mode = ['uniform', 'height', 'cloud'].includes(volume.density_mode) ? volume.density_mode : 'uniform';
        volume.composite_mode = volume.composite_mode === 'shafts' ? 'shafts' : 'physical';
        volume.schema_version = 2;
        volume.technique_override = AtmosphereV2Core.normalizeTechnique?.(volume.technique_override)
            ? String(volume.technique_override).toUpperCase()
            : 'auto';
        volume.intent = String(volume.intent || '');
        volume.shaft_length = clamp(finite(volume.shaft_length, 0.78), 0.05, 1.5);
        volume.shaft_decay = clamp(finite(volume.shaft_decay, 0.93), 0.5, 0.999);
        volume.shaft_radius = clamp(finite(volume.shaft_radius, 0.82), 0.05, 2);
        volume.shaft_exposure = clamp(finite(volume.shaft_exposure, 1), 0, 8);
        volume.size = Array.isArray(volume.size) ? volume.size.slice(0, 3) : [32, 16, 32];
        while (volume.size.length < 3) volume.size.push(16);
        volume.size = volume.size.map(value => Math.max(0.01, Math.abs(finite(value, 16))));
        volume.density = clamp(finite(volume.density, 0.04), 0, 4);
        volume.scattering_strength = clamp(finite(volume.scattering_strength, 0.9), 0, 8);
        volume.absorption = clamp(finite(volume.absorption, 0.18), 0, 8);
        volume.anisotropy = clamp(finite(volume.anisotropy, 0.35), -0.92, 0.92);
        volume.edge_feather = clamp(finite(volume.edge_feather, 0.12), 0.001, 1);
        volume.height_falloff = clamp(finite(volume.height_falloff, 1.2), 0, 16);
        volume.height_offset = clamp(finite(volume.height_offset, 0.1), 0, 1);
        volume.noise_scale = clamp(finite(volume.noise_scale, 3.2), 0.01, 64);
        volume.noise_detail = Math.round(clamp(finite(volume.noise_detail, 3), 1, 3));
        volume.coverage = clamp(finite(volume.coverage, 0.45), 0, 0.99);
        volume.erosion = clamp(finite(volume.erosion, 0.22), 0.01, 1);
        volume.wind_speed = clamp(finite(volume.wind_speed, 0), -8, 8);
        volume.ambient = clamp(finite(volume.ambient, 0.12), 0, 4);
        volume.shadow_fill = clamp(finite(volume.shadow_fill, 0.1), 0, 1);
        return volume;
    }

    function canShowVolumeGizmos() {
        return !window.Canvas || Canvas.show_gizmos !== false;
    }

    function refreshVolumeGizmoVisibility() {
        if (!VolumeElement || !Array.isArray(VolumeElement.all)) return;
        VolumeElement.all.forEach(volume => updateVolumeGizmo(volume));
    }

    function updateVolumeGizmo(volume) {
        const mesh = volume?.mesh;
        if (!mesh) return;
        sanitizeVolume(volume);
        const size = volume.size;
        const showGizmos = canShowVolumeGizmos() && (window.LightManagerUI?.workspace?.helperVisible({selected: !!volume.selected}) ?? true);
        mesh.visible = volume.visibility !== false && showGizmos;
        if (mesh.boxGizmo) {
            mesh.boxGizmo.visible = showGizmos && volume.shape !== 'sphere';
            mesh.boxGizmo.scale.set(size[0], size[1], size[2]);
        }
        if (mesh.sphereGizmo) {
            mesh.sphereGizmo.visible = showGizmos && volume.shape === 'sphere';
            mesh.sphereGizmo.scale.set(size[0], size[1], size[2]);
        }
        if (mesh.boxSelection) {
            mesh.boxSelection.visible = showGizmos && volume.shape !== 'sphere';
            mesh.boxSelection.scale.set(size[0], size[1], size[2]);
        }
        if (mesh.sphereSelection) {
            mesh.sphereSelection.visible = showGizmos && volume.shape === 'sphere';
            mesh.sphereSelection.scale.set(size[0], size[1], size[2]);
        }
        const selected = !!volume.selected;
        [mesh.boxSelection, mesh.sphereSelection].forEach(proxy => {
            if (!proxy) return;
            proxy.castShadow = false;
            proxy.receiveShadow = false;
            proxy.userData = proxy.userData || {};
            proxy.userData.lightflowNoShadow = true;
            proxy.userData.lightflowVolumeSelectionProxy = true;
        });
        [mesh.boxGizmo, mesh.sphereGizmo].forEach(gizmo => {
            if (!gizmo?.material) return;
            gizmo.material.color.set(selected ? 0x5ba7ff : 0x67d7e8);
            gizmo.material.opacity = selected ? 0.65 : 0.18;
            window.LightManagerUI?.gizmos?.style?.(gizmo, 'outline', selected);
        });
    }

    function updateGodRayHelper(element, camera, renderer) {
        const node = element.mesh;
        if (!node) return;
        godRayRuntime.sanitize(element);
        node.visible = element.visibility !== false;
        const shown = canShowVolumeGizmos() && (window.LightManagerUI?.workspace?.helperVisible({ selected: !!element.selected }) ?? true);
        godRayController?.updateAttachment?.(element);
        const frame = godRayFrame(element, camera?.isCamera ? camera : Preview.selected?.camera || window.main_preview?.camera);
        const points = [];
        // The outline follows both the rendered direction and the taper curve.
        for (let index = 0; index < 12; index++) {
            for (const sign of [-1, 1]) for (const t of [index / 12, (index + 1) / 12]) {
                const width = THREE.MathUtils.lerp(frame.width, frame.endWidth, Math.pow(t, element.taper));
                points.push(node.worldToLocal(frame.origin.clone().addScaledVector(frame.axis, t * frame.length).addScaledVector(frame.right, sign * width / 2)));
            }
        }
        for (const t of [0, 1]) for (const sign of [-1, 1]) points.push(node.worldToLocal(frame.origin.clone().addScaledVector(frame.axis, t * frame.length).addScaledVector(frame.right, sign * (t ? frame.endWidth : frame.width) / 2)));
        let attribute = node.rayGizmo.geometry.getAttribute('position');
        if (!attribute || attribute.count !== points.length) {
            attribute = new THREE.Float32BufferAttribute(new Float32Array(points.length*3),3);
            node.rayGizmo.geometry.setAttribute('position',attribute);
        }
        points.forEach((point,index)=>attribute.setXYZ(index,point.x,point.y,point.z));
        attribute.needsUpdate = true;
        node.rayGizmo.geometry.computeBoundingSphere();
        node.rayGizmo.visible = shown;
        const proxy = node.raySelection;
        proxy.position.copy(node.worldToLocal(frame.origin.clone().addScaledVector(frame.axis, frame.length / 2)));
        const up = frame.axis.clone().negate(), back = new THREE.Vector3().crossVectors(frame.right, up).normalize();
        proxy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.right, up, back)).premultiply(node.getWorldQuaternion(new THREE.Quaternion()).invert());
        proxy.scale.set(Math.max(.5, frame.width, frame.endWidth) / frame.scale.x, element.length, .5 / frame.scale.z);
        proxy.visible = shown;
        const editing = shown && element.selected && !element.locked && Toolbox.selected?.id === 'lightflow_god_ray_gizmos';
        const positions = {length:frame.origin.clone().addScaledVector(frame.axis,frame.length),width:frame.origin.clone().addScaledVector(frame.right,frame.width/2),end_width:frame.origin.clone().addScaledVector(frame.axis,frame.length).addScaledVector(frame.right,frame.endWidth/2)};
        for (const [key, handle] of Object.entries(node.rayHandles || {})) {
            handle.position.copy(node.worldToLocal(positions[key]));
            const preview = Preview.selected || window.main_preview;
            const size = window.LightManagerUI?.gizmos?.screenWorldSize?.(handle, camera || preview?.camera, renderer, 5)
                ?? Math.max(.12, (preview?.calculateControlScale?.(positions[key]) || .5) * .6);
            handle.scale.set(size/frame.scale.x,size/frame.scale.y,size/frame.scale.z);
            handle.updateWorldMatrix(true, false);
            handle.visible = editing;
            window.LightManagerUI?.gizmos?.style?.(handle, key === 'length' ? 'w' : 'u', true);
        }
        if (node.rayGizmo) {
            node.rayGizmo.material.color.set(element.selected ? 0x5ba7ff : 0xffd99a);
            node.rayGizmo.material.opacity = element.selected ? 0.8 : 0.3;
            window.LightManagerUI?.gizmos?.style?.(node.rayGizmo, 'outline', !!element.selected);
        }
    }

    function godRayFrame(element, camera = Preview.selected?.camera || window.main_preview?.camera) {
        const node = element.mesh;
        node.updateWorldMatrix(true, false);
        const origin = node.getWorldPosition(new THREE.Vector3());
        const axis = new THREE.Vector3(0, -1, 0).transformDirection(node.matrixWorld);
        const right = new THREE.Vector3(1, 0, 0).transformDirection(node.matrixWorld);
        const light = window.three_lights?.[element.light_uuid];
        if ((light?.isDirectionalLight || light?.isSpotLight) && light.target) {
            const direction = light.target.getWorldPosition(new THREE.Vector3()).sub(light.getWorldPosition(new THREE.Vector3()));
            if (direction.lengthSq() > 1e-6) axis.copy(direction.normalize());
        }
        right.addScaledVector(axis, -right.dot(axis));
        if (right.lengthSq() < 1e-6) right.set(Math.abs(axis.x)<.9?1:0,Math.abs(axis.x)<.9?0:1,0).addScaledVector(axis,-right.dot(axis));
        right.normalize();
        const scale = node.getWorldScale(new THREE.Vector3());
        if (element.orientation !== 'fixed' && camera) {
            const view = camera.isOrthographicCamera ? new THREE.Vector3(0,0,1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())) : camera.getWorldPosition(new THREE.Vector3()).sub(origin.clone().addScaledVector(axis,element.length*scale.y/2));
            if (element.orientation === 'y') view.y = 0;
            const candidate = new THREE.Vector3().crossVectors(axis, view);
            if (candidate.lengthSq() > 1e-6) right.copy(candidate.normalize());
        }
        right.applyAxisAngle(axis, element.roll*Math.PI/180);
        return {origin,axis,right,scale,length:element.length*scale.y,width:element.width*scale.x,endWidth:element.end_width*scale.x};
    }

    function setGodRayAttachment(element, attached, lightUUID = element.light_uuid) {
        godRayController.updateAttachment(element);
        const frame = godRayFrame(element), node = element.mesh;
        element.light_uuid = lightUUID;
        element.light_attached = attached;
        const lightElement = window.LightElement?.all?.find(light=>light.uuid===lightUUID);
        if (attached && lightElement) element.addTo(lightElement);
        else if (!attached && element.parent?.type === 'light') element.addTo(element.parent.parent);
        NodePreviewController.prototype.updateTransform.call(godRayController,element);
        if (attached && lightElement?.mesh) lightElement.mesh.add(node);
        const position = node.parent.worldToLocal(frame.origin.clone());
        element.position = position.toArray();
        if (attached) {
            const lightNode = window.Project?.nodes_3d?.[lightUUID];
            if (lightNode) {
                const anchor = node.parent.worldToLocal(lightNode.getWorldPosition(new THREE.Vector3()));
                element.attachment_position = anchor.toArray();
                element.position = position.sub(anchor).toArray();
            }
        } else {
            const right = frame.right.clone().applyAxisAngle(frame.axis,-element.roll*Math.PI/180);
            const up = frame.axis.clone().negate(), back = new THREE.Vector3().crossVectors(right,up).normalize();
            const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,back));
            quaternion.premultiply(node.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
            const rotation = new THREE.Euler().setFromQuaternion(quaternion,node.rotation.order);
            element.rotation = [rotation.x,rotation.y,rotation.z].map(THREE.MathUtils.radToDeg);
        }
        godRayController.updateTransform(element);
    }

    function installGodRayGizmoControls() {
        let drag = null, hovered = null, hoveredHandle = null;
        const raycaster = new THREE.Raycaster();
        const stop = event => {event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();};
        const restoreStatus = () => {
            window.LightManagerUI?.gizmos?.highlight?.(hoveredHandle, false); hoveredHandle = null;
            if (hovered) {if(window.Prop?.file_name===hovered)Blockbench.setStatusBarText();hovered=null;}
        };
        const project = (event, preview) => {
            const rect=preview.canvas.getBoundingClientRect();
            raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),preview.camera);
        };
        const finish = cancelled => {
            if (!drag) return;
            const current=drag;drag=null;
            if(cancelled){current.element.extend(current.before);if(current.element.mesh)godRayController.updateTransform(current.element);if(Project===current.project)Undo.cancelEdit(false);}
            else if(current.changed)Undo.finishEdit(uiText('edit_ray'));else Undo.cancelEdit(false);
            syncGodRayPanel();requestPreviewRender();restoreStatus();
        };
        const move = event => {
            if(drag){
                stop(event);project(event,drag.preview);
                const point=raycaster.ray.intersectPlane(drag.plane,new THREE.Vector3());if(!point)return;
                let value=drag.before[drag.key]+point.sub(drag.start).dot(drag.axis)*drag.factor;
                if(event.shiftKey||event.ctrlKey||event.metaKey){const step=typeof canvasGridSize==='function'?canvasGridSize(event.shiftKey,event.ctrlKey||event.metaKey):event.ctrlKey?.1:1;value=Math.round(value/step)*step;}
                value=Math.max(drag.key==='length'?.01:0,Math.min(100000,value));drag.element[drag.key]=value;drag.changed=drag.before[drag.key]!==value;
                updateGodRayHelper(drag.element);requestPreviewRender();return;
            }
            restoreStatus();
            if(Toolbox.selected?.id!=='lightflow_god_ray_gizmos'||!event.target?.closest?.('.preview'))return;
            const preview=Preview.all.find(p=>p.canvas===event.target)||Preview.selected;if(!preview)return;project(event,preview);
            const handles=GodRayElement.selected.flatMap(e=>Object.values(e.mesh?.rayHandles||{}).filter(h=>h.visible&&h.parent?.visible));
            const hit=raycaster.intersectObjects(handles,false)[0];
            if(hit){hoveredHandle=hit.object;window.LightManagerUI?.gizmos?.highlight?.(hoveredHandle,true);hovered=tl('lightflow_god_ray.'+hit.object.userData.rayKey);Blockbench.setStatusBarText(hovered);}
        };
        const down = event => {
            if(event.button!==0||Toolbox.selected?.id!=='lightflow_god_ray_gizmos'||!event.target?.closest?.('.preview'))return;
            const preview=Preview.all.find(p=>p.canvas===event.target)||Preview.selected;if(!preview)return;project(event,preview);
            for(const element of GodRayElement.selected){
                if(element.locked||!element.mesh?.visible)continue;
                const hit=raycaster.intersectObjects(Object.values(element.mesh.rayHandles||{}).filter(h=>h.visible),false)[0];if(!hit)continue;
                const frame=godRayFrame(element,preview.camera),key=hit.object.userData.rayKey;
                restoreStatus();hoveredHandle=hit.object;window.LightManagerUI?.gizmos?.highlight?.(hoveredHandle,true);
                const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(preview.camera.getWorldDirection(new THREE.Vector3()),hit.point);
                drag={element,key,preview,project:Project,plane,start:hit.point.clone(),axis:key==='length'?frame.axis:frame.right,factor:key==='length'?1/frame.scale.y:2/frame.scale.x,before:{length:element.length,width:element.width,end_width:element.end_width},changed:false};
                Undo.initEdit({elements:[element]});stop(event);return;
            }
        };
        const up=event=>{if(drag){stop(event);finish(false);}};
        const cancel=()=>finish(true);
        const key=event=>{if(drag&&event.key==='Escape'){stop(event);finish(true);}};
        document.addEventListener('pointerdown',down,true);document.addEventListener('pointermove',move,true);document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',cancel,true);document.addEventListener('keydown',key,true);window.addEventListener('blur',cancel);
        const tool=new Tool('lightflow_god_ray_gizmos',{name:'lightflow_atmosphere.ui.ray_gizmos',icon:'control_camera',modes:['edit','render'],selectElements:false,condition:()=>!!(Modes.edit||Modes.render)&&!!GodRayElement?.selected?.some(ray=>ray.selected),onSelect(){GodRayElement.all.forEach(updateGodRayHelper);},onUnselect(){cancel();restoreStatus();GodRayElement?.all.forEach(updateGodRayHelper);}});
        window.LightManagerUI?.removeToolbarAction?.(tool);
        deletables.push(tool,Blockbench.on('unselect_project',cancel),Blockbench.on('select_project',cancel),Blockbench.on('update_selection',()=>{if(drag&&!drag.element.selected)cancel();GodRayElement?.all.forEach(updateGodRayHelper);}),{delete(){cancel();restoreStatus();document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',cancel,true);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel);}});
    }

    let godRayTab = 'look';
    let godRayUndo = null;
    const inspectorFrames = new Set();
    deletables.push({delete() {inspectorFrames.forEach(cancelAnimationFrame); inspectorFrames.clear();}});
    const uiText = key => tr('lightflow_atmosphere.ui.' + key, key);
    const effectTones = { light:'var(--color-axis-w)', space:'#A6DCB5', motion:'#8BD5E8', finish:'#C5AFE9' };
    const effectControlIdentity = {
        intensity:['light_mode','light'], opacity:['opacity','finish'], gradient_curve:['gradient','finish'], bloom:['flare','light'],
        length:['straighten','space'], width:['swap_horiz','space'], end_width:['open_in_full','space'], taper:['show_chart','space'],
        roll:['rotate_right','motion'], edge_softness:['blur_on','finish'], fade_start:['first_page','finish'], fade_end:['last_page','finish'],
        falloff:['show_chart','finish'], shadow_strength:['tonality','light'], near_fade:['near_me','finish'], far_start:['first_page','finish'], far_end:['last_page','finish'],
        density:['blur_on','space'], scattering_strength:['light_mode','light'], anisotropy:['sync_alt','light'], absorption:['tonality','light'],
        ambient:['wb_twilight','light'], shadow_fill:['brightness_6','light'], edge_feather:['blur_on','finish'],
        height_falloff:['height','space'], height_offset:['vertical_align_center','space'], noise_scale:['ac_unit','space'], coverage:['cloud','space'], erosion:['blur_on','finish'], wind_speed:['air','motion'],
        particle_time:['schedule','motion'], spawn_rate:['scatter_plot','light'], max_particles:['filter_9_plus','finish'], lifetime:['hourglass_empty','motion'], speed:['speed','motion'],
        active_time:['timelapse','motion'], sleep_time:['pause','motion'], emitter_radius:['radio_button_unchecked','space'], drag:['air','finish'],
        particle_size:['open_in_full','space'], particle_bloom:['flare','light'], size_x:['swap_horiz','space'], size_y:['height','space'],
        preview_scale:['preview','finish'], render_scale:['photo_size_select_large','finish']
    };
    function identifyEffectControls(form) {
        for (const [key, control] of Object.entries(form)) {
            const identity = effectControlIdentity[key.replace(/^quality_/, '')];
            if (!identity || control?.type !== 'combo_slider') continue;
            control.icon = identity[0];
            control.color = effectTones[identity[1]];
            control.slider_fill = true;
        }
        return form;
    }
    const effectAction = (text, icon, click, extra = {}) => ({type: 'action_button', semantic_button: true, text, icon, background:'var(--color-button)', click, ...extra});
    function emptyEffectForm(ElementType, action, label) {
        return {
            _empty: {type:'bar_display', paragraph:true, expand:true, icon:ElementType?.prototype?.icon || 'touch_app', value:uiText('select_effect'), color:'var(--color-subtle_text)'},
            _pick: effectAction(uiText('select_existing'), 'list', event => new Menu('lightflow_pick_effect', (ElementType?.all || []).map(element => ({name:element.name, icon:element.icon, click:()=>element.select()})), {searchable:true}).open(event?.target || document.activeElement), {condition:()=>!!ElementType?.all?.length}),
            _create: effectAction(label, 'add', ()=>BarItems[action]?.trigger())
        };
    }
    function rememberInspectorScroll(panel, key) {
        const cache = panel._lightflowScroll || (panel._lightflowScroll = {key:null, positions:new Map()});
        if (cache.key !== null) cache.positions.set(cache.key, panel.form.node.scrollTop);
        cache.key = key;
        const top = cache.positions.get(key) || 0;
        return () => {
            panel.form.node.scrollTop = top;
            const frame = requestAnimationFrame(()=>{inspectorFrames.delete(frame); if(panel.form?.node?.isConnected && cache.key===key)panel.form.node.scrollTop=top;});
            inspectorFrames.add(frame);
        };
    }
    function beginGodRayUndo() {
        if (godRayUndo || godRayPanelSyncing || !GodRayElement?.selected?.length) return false;
        godRayUndo = { elements: GodRayElement.selected.slice(), changed: false };
        Undo.initEdit({ elements: godRayUndo.elements, outliner: true });
        return true;
    }
    function finishGodRayUndo() {
        if (!godRayUndo) return;
        const changed = godRayUndo.changed;
        godRayUndo = null;
        if (changed) Undo.finishEdit('Edit God Ray');
        else Undo.cancelEdit(false);
    }
    const godRayGroupsOpen = { color:false, finish:false, direction:false, softness:false, shadows:false, depth:false };
    function godRayForm(element, dialog = false) {
        if (!element) return emptyEffectForm(GodRayElement, 'add_lightflow_god_ray', tr('lightflow_atmosphere.action.add_god_ray','Add God Ray'));
        const design = window.LightManagerUI.formDesign;
        const form = {
            _ray_tab: design.tabs({ value: godRayTab, options: { look: { name: uiText('look') }, shape: { name: uiText('shape') }, light: { name: uiText('light') } } }),
            _ray_search: design.search()
        };
        if (dialog) {delete form._ray_tab; delete form._ray_search;form.name={type:'text',label:'generic.name',value:element.name};form.enabled={type:'checkbox',label:'lightflow_atmosphere.field.enabled',value:element.enabled};}
        else if(element.enabled===false)form._activate=effectAction(uiText('activate_effect'),'visibility',()=>{
            Undo.initEdit({elements:[element]});element.extend({enabled:true,visibility:true});Undo.finishEdit(uiText('activate_effect'));syncGodRayPanel();requestPreviewRender();
        });
        const tabs = {
            look: ['intensity', 'opacity', 'color', 'end_color', 'gradient_curve', 'blend', 'bloom'],
            shape: ['length', 'width', 'end_width', 'taper', 'orientation', 'roll', 'edge_softness', 'fade_start', 'fade_end', 'falloff'],
            light: ['light_uuid', 'light_attached', '_attachment_help', 'inherit_color', 'occlusion', 'shadow_strength', 'near_fade', 'far_start', 'far_end']
        };
        for (const key of Object.values(tabs).flat()) {
            const field = godRayRuntime.fields[key];
            if (!field) continue;
            const base = { label: 'lightflow_god_ray.' + key, value: element[key], ...(!dialog ? {onBefore: beginGodRayUndo, onAfter: finishGodRayUndo} : {}) };
            if (field.type === 'vector') form[key] = design.color({ ...base, value: colorArrayToHex(element[key]) });
            else if (field.type === 'boolean') form[key] = { ...base, type: 'checkbox' };
            else if (field.options || key === 'light_uuid') {
                const optionKeys = {
                    orientation: {camera:'ray_camera_axis',y:'ray_world_y',fixed:'ray_fixed'},
                    blend: {additive:'ray_additive',normal:'ray_alpha'},
                    occlusion: {scene:'ray_scene_depth',shadow:'ray_scene_shadows',none:'ray_always_visible'}
                };
                const options = field.options
                    ? Object.fromEntries(Object.entries(field.options).map(([value,label]) => [value, optionKeys[key]?.[value] ? uiText(optionKeys[key][value]) : label]))
                    : { '': uiText('ray_free_direction') };
                if (key === 'light_uuid') {
                    for (const light of window.LightElement?.all || []) {
                        if (['directional', 'spot'].includes(light.light_type)) options[light.uuid] = light.name;
                    }
                    if (element.light_uuid && !options[element.light_uuid]) options[element.light_uuid] = uiText('ray_missing_light');
                }
                form[key] = design.enum({ ...base, options:getAtmosphereSelectOptions(key,options) });
            } else {
                const spatialMax = {length:128,width:32,end_width:64,near_fade:64,far_start:128,far_end:256}[key];
                form[key] = { ...base, type:'combo_slider', full_track:true, min:field.min, max:spatialMax || field.max,
                    allow_higher:!!spatialMax, step:field.step || 0.1, resettable:true, reset_value:field.default };
                if (key==='roll') form[key].marks = [-180,0,180].map(value=>({value,label:value+'°',short_label:value+'°'}));
            }
            form[key].panel_category_visible = dialog || tabs[godRayTab].includes(key);
        }
        form._shadow_help = {
            panel_category_visible: dialog || godRayTab==='light',
            type: 'info', text: tr('lightflow_god_ray.shadow_help', 'Light shadows require a linked Directional or Spot light with shadows enabled. The ray stays at its own position. No linked shadow map: scene occlusion only.')
        };
        form.light_attached = {type:'checkbox',label:uiText('ray_attached'),value:element.light_attached,condition:result=>!!result.light_uuid,panel_category_visible:dialog||godRayTab==='light'};
        form._attachment_help = {type:'info',text:uiText('ray_attachment_help'),condition:result=>result.light_attached,panel_category_visible:dialog||godRayTab==='light'};
        // Keep the shared native control grammar, including slider transactions.
        const enhanced = identifyEffectControls(enhanceAtmosphereDialogForm(form));
        if (!dialog) {
            const sections = {
                look:[['intensity','opacity','color','end_color'],['color',uiText('ray_color_detail'),'gradient',['gradient_curve']],['finish',uiText('ray_compositing'),'flare',['blend','bloom']]],
                shape:[['length','width','end_width','taper'],['direction',uiText('ray_plane'),'rotate_right',['orientation','roll']],['softness',uiText('ray_soft_edges'),'blur_on',['edge_softness','fade_start','fade_end','falloff']]],
                light:[['light_uuid','light_attached','_attachment_help','inherit_color','occlusion'],['shadows',uiText('ray_shadow_detail'),'tonality',['shadow_strength','_shadow_help']],['depth',uiText('ray_camera_fade'),'distance',['near_fade','far_start','far_end']]]
            };
            const ordered = {_ray_tab:enhanced._ray_tab,_ray_search:enhanced._ray_search};
            if (enhanced._activate) ordered._activate = enhanced._activate;
            for (const [category, groups] of Object.entries(sections)) {
                for (const spec of groups) {
                    if (spec.length===4 && Array.isArray(spec[3])) {
                        const [id,label,icon,keys]=spec,groupKey='_ray_group_'+id;
                        ordered[groupKey]=design.group({label,label_icon:icon,value:godRayGroupsOpen[id],panel_category_visible:category===godRayTab});
                        for (const key of keys) if (enhanced[key]) {
                            const condition=enhanced[key].condition;
                            ordered[key]={...enhanced[key],condition:result=>result[groupKey]===true&&(!condition||Condition(condition,result))};
                        }
                    } else for (const key of spec) if (enhanced[key]) ordered[key]=enhanced[key];
                }
            }
            return ordered;
        }
        return dialog ? window.LightManagerUI.taskDialogForm(enhanced, Object.entries(tabs).map(([id,entries]) => ({id, label:uiText(id), entries:id==='light' ? [...entries,'_shadow_help'] : entries}))) : enhanced;
    }
    function applyGodRayValues(elements, result, keys) {
        let changed = false;
        for (const element of elements) {
            const lightUUID = result.light_uuid === undefined ? element.light_uuid : result.light_uuid;
            const attached = !!lightUUID && (result.light_attached === undefined ? element.light_attached : result.light_attached);
            if (attached !== element.light_attached || (attached && lightUUID !== element.light_uuid)) {
                setGodRayAttachment(element, attached, lightUUID); changed = true;
            }
            for (const key of keys) {
                if (key === 'light_attached') continue;
                if (!GodRayElement.properties[key]) continue;
                const field = godRayRuntime.fields[key];
                const value = field?.type === 'vector' ? hexToColorArray(result[key], element[key]) : result[key];
                if (JSON.stringify(value) === JSON.stringify(element[key])) continue;
                element[key] = Array.isArray(value) ? value.slice() : value;
                changed = true;
            }
            element.sanitizeName();
            godRayRuntime.sanitize(element);
            godRayController.updateTransform(element);
        }
        if (changed) requestPreviewRender();
        return changed;
    }
    function syncGodRayPanel() {
        if (!godRayPanel?.form) return;
        finishGodRayUndo();
        const restore = rememberInspectorScroll(godRayPanel, `${GodRayElement.selected[0]?.uuid || 'empty'}:${godRayTab}`);
        godRayPanelSyncing = true;
        try {
            godRayPanel.form.form_config = (window.LightManagerUI?.prepareForm || (form => form))(godRayForm(GodRayElement.selected[0]));
            godRayPanel.form.buildForm();
            restore();
        } finally { godRayPanelSyncing = false; }
    }
    function registerGodRayElement() {
        godRayRuntime = createGodRayRuntime(THREE, () => window.LightflowAmbientOcclusion?.invalidateSceneCache?.());
        class LightflowGodRayElement extends OutlinerElement {
            constructor(data, uuid) {
                super(data, uuid);
                for (const prop of Object.values(LightflowGodRayElement.properties)) prop.reset(this);
                if (data) this.extend(data);
                godRayRuntime.sanitize(this);
            }
            get origin() { return this.position; }
            getWorldCenter() { return this.mesh.getWorldPosition(new THREE.Vector3()); }
            extend(data) {
                for (const prop of Object.values(LightflowGodRayElement.properties)) prop.merge(this, data);
                godRayRuntime.sanitize(this);
                this.sanitizeName();
                return this;
            }
            getUndoCopy() { const copy = new LightflowGodRayElement(this, this.uuid); delete copy.parent; return copy; }
            getSaveCopy() {
                const copy = { type: 'lightflow_god_ray', uuid: this.uuid };
                for (const prop of Object.values(LightflowGodRayElement.properties)) prop.copy(this, copy);
                return copy;
            }
            select(...args) { super.select(...args); updateGodRayHelper(this); syncGodRayPanel(); return this; }
            unselect(...args) { super.unselect(...args); updateGodRayHelper(this); syncGodRayPanel(); }
            static behavior = { unique_name: true, movable: true, rotatable: true,
                parent_types: ['root', 'group', 'armature_bone', 'light'], hide_in_screenshot: true };
        }
        GodRayElement = LightflowGodRayElement;
        Object.assign(GodRayElement.prototype, { title: 'God Ray', type: 'lightflow_god_ray', icon: 'lightflow:godray', movable: true,
            rotatable: true, needsUniqueName: true, name_regex: () => window.Format?.node_name_regex ?? 'a-zA-Z0-9_' });
        GodRayElement.prototype.buttons = [Outliner.buttons.export, Outliner.buttons.locked, Outliner.buttons.visibility];
        GodRayElement.prototype.menu = new Menu(['edit_lightflow_god_ray', '_', ...Outliner.control_menu_group, '_', 'rename', 'delete']);
        for (const [key, type, value] of [['name', 'string', 'God Ray'], ['position', 'vector', [0, 32, 0]],
            ['rotation', 'vector', [0, 0, 0]], ['visibility', 'boolean', true], ['enabled', 'boolean', true],
            ['export', 'boolean', true], ['locked', 'boolean', false],
            ['light_attached','boolean',false], ['attachment_position','vector',[0,0,0]]]) {
            deletables.push(new Property(GodRayElement, type, key, { default: value }));
        }
        const en = {}, es = {};
        for (const [key, field] of Object.entries(godRayRuntime.fields)) {
            deletables.push(new Property(GodRayElement, field.type || 'number', key, { default: field.default }));
            en['lightflow_god_ray.' + key] = field.label;
            es['lightflow_god_ray.' + key] = field.es;
        }
        en['lightflow_god_ray.shadow_help'] = 'Light shadows require a linked Directional or Spot light with shadows enabled. The ray stays at its own position. No linked shadow map: scene occlusion only.';
        es['lightflow_god_ray.shadow_help'] = 'Las sombras requieren una luz Directional o Spot vinculada, con sombras activadas. El rayo conserva su posición; sin mapa de sombras solo se usa la oclusión de la escena.';
        Language.addTranslations('en', en); Language.addTranslations('es', es);
        allowAnimationModeInspection(GodRayElement);
        const reloadedGodRayElements = prepareReloadedAtmosphereElements(GodRayElement, 'lightflow_god_ray');
        OutlinerElement.registerType(GodRayElement, 'lightflow_god_ray');
        publishWindowBinding('LightflowGodRayElement', GodRayElement);
        publishWindowBinding('LightflowGodRays', godRayRuntime);
        godRayController = new NodePreviewController(GodRayElement, {
            setup(element) {
                const node = new THREE.Object3D();
                Project.nodes_3d[element.uuid] = node;
                node.name = element.uuid; node.type = element.type; node.isElement = true;
                node.userData.lightflowNoShadow = true;
                node.rotation.order = window.Format?.euler_order || 'ZYX';
                const box = new THREE.BoxGeometry(1, 1, 1);
                node.rayGizmo = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd99a, transparent: true, opacity: 0.4, depthWrite: false }));
                node.rayGizmo.raycast = () => {};
                const proxy = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
                proxy.name = element.uuid; proxy.type = element.type; proxy.isElement = true;
                proxy.userData.lightflowNoShadow = true;
                proxy.userData.lightflowVolumeSelectionProxy = true;
                node.add(node.rayGizmo, proxy);
                node.raySelection = proxy;
                node.rayHandles = {};
                for (const [key,color] of [['length',0x67d7e8],['width',0xffd99a],['end_width',0xb2a5ff]]) {
                    const handle = new THREE.Mesh(key==='length'?new THREE.OctahedronGeometry(1):new THREE.BoxGeometry(1.4,1.4,1.4), new THREE.MeshBasicMaterial({color,transparent:true,depthTest:false,depthWrite:false}));
                    handle.userData.rayKey=key;handle.userData.lightflowNoShadow=true;handle.renderOrder=1100;node.rayHandles[key]=handle;node.add(handle);
                }
                node.rayGizmo.onBeforeRender = (renderer,_scene,camera) => updateGodRayHelper(element,camera,renderer);
                node.geometry = new THREE.BufferGeometry();
                node.geometry.boundingBox = new THREE.Box3().makeEmpty();
                node.raycast = (raycaster, hits) => {
                    if (!proxy.visible || !node.visible) return;
                    proxy.updateWorldMatrix(true, false); proxy.raycast(raycaster, hits);
                };
                this.updateTransform(element);
                this.dispatchEvent('setup', { element });
            },
            updateTransform(element) {
                NodePreviewController.prototype.updateTransform.call(this, element);
                if (element.parent?.type === 'light' && element.parent.mesh) {
                    element.parent.mesh.add(element.mesh);
                    element.mesh.position.fromArray(element.position);
                    element.mesh.updateMatrixWorld(true);
                }
                updateGodRayHelper(element);
                requestPreviewRender();
                this.dispatchEvent('update_transform', { element });
            },
            updateAttachment(element) {
                if (!element.light_attached || !element.mesh?.parent) return;
                const node=element.mesh,lightNode=window.Project?.nodes_3d?.[element.light_uuid];
                const anchor=lightNode ? node.parent.worldToLocal(lightNode.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3().fromArray(element.attachment_position);
                element.attachment_position=anchor.toArray();
                node.position.copy(anchor).add(new THREE.Vector3().fromArray(element.position));node.updateMatrixWorld(true);
            },
            remove(element) {
                const node = element.mesh;
                NodePreviewController.prototype.remove.call(this, element);
                // Native remove only releases the root geometry, not helper children.
                node?.children.forEach(child => { child.geometry?.dispose(); child.material?.dispose(); });
                requestPreviewRender();
            },
            updateSelection(element) { updateGodRayHelper(element); this.dispatchEvent('update_selection', { element }); }
        });
        rebuildReloadedAtmosphereElementPreviews(reloadedGodRayElements, godRayController);
        installGodRayGizmoControls();
        const createAttached = new Action('lightflow_god_ray_from_light', {name:'lightflow_atmosphere.ui.ray_from_light',icon:'lightflow:godray',category:'edit',
            condition:()=>window.LightElement?.selected?.some(light=>['spot','directional'].includes(light.light_type)),
            click(){
                const light=window.LightElement.selected.find(light=>['spot','directional'].includes(light.light_type));if(!light)return;
                Undo.initEdit({outliner:true,elements:[],selection:true});
                const ray=new GodRayElement({name:light.name+' Ray',light_uuid:light.uuid,light_attached:true,position:[0,0,0],inherit_color:true,occlusion:light.has_shadow?'shadow':'scene'}).addTo(light).init();
                light.isOpen=true;light.preview_controller.updateSelection(light);
                unselectAll();ray.select();
                Undo.finishEdit(uiText('ray_from_light'),{outliner:true,elements:[ray],selection:true});
                godRayPanel?.selectTab?.();BarItems.lightflow_god_ray_gizmos.select();requestPreviewRender();
            }
        });
        const detach = new Action('lightflow_god_ray_detach',{name:'lightflow_atmosphere.ui.ray_detach',icon:'link_off',category:'edit',condition:()=>GodRayElement?.selected?.some(ray=>ray.light_attached),click(){
            const rays=GodRayElement.selected.filter(ray=>ray.light_attached);Undo.initEdit({elements:rays,outliner:true});for(const ray of rays)setGodRayAttachment(ray,false,'');Undo.finishEdit(uiText('ray_detach'));syncGodRayPanel();requestPreviewRender();
        }});
        deletables.push(createAttached,detach);
        GodRayElement.prototype.menu.structure.unshift('lightflow_god_ray_gizmos','lightflow_god_ray_detach','_');
        const addAction = new Action('add_lightflow_god_ray', {
            name: 'lightflow_atmosphere.action.add_god_ray', icon: 'lightflow:godray', category: 'edit', condition: () => !!window.Project && !!(Modes.edit || Modes.render),
            click() {
                Undo.initEdit({ outliner: true, elements: [], selection: true });
                const ray = new GodRayElement().addTo().init();
                unselectAll(); ray.select();
                Undo.finishEdit('Add God Ray', { outliner: true, elements: [ray], selection: true });
                godRayPanel?.selectTab?.(); requestPreviewRender();
            }
        });
        const editAction = new Action('edit_lightflow_god_ray', {
            name: 'Edit God Ray', icon: 'tune', category: 'edit', condition: () => !!GodRayElement.selected.length,
            click() {
                const elements = GodRayElement.selected.slice();
                showEffectDialog('lightflow_god_ray_dialog', { title: 'God Ray', width: 560, form: godRayForm(elements[0], true),
                    onConfirm(result) {
                        Undo.initEdit({ elements, outliner: true });
                        applyGodRayValues(elements, result, Object.keys(result));
                        Undo.finishEdit('Edit God Ray'); syncGodRayPanel();
                    }
                });
            }
        });
        deletables.push(addAction, editAction);
        godRayPanel = new Panel('lightflow_god_ray_properties', { name: 'lightflow_atmosphere.ui.ray', icon: 'lightflow:godray', growable: true, resizable: true,
            condition: { modes: ['render'], project: true },
            default_position: { slot: 'right_bar', height: 480, folded: false, attached_to: 'light_properties', attached_index: 2 },
            form: (window.LightManagerUI?.prepareForm || (form => form))(godRayForm(null)) });
        const change = godRayPanel.form.on('change', ({ result, changed_keys }) => {
            if (godRayPanelSyncing) return;
            const keys = changed_keys?.length ? changed_keys : Object.keys(result);
            if (keys.includes('_ray_tab')) { godRayTab = result._ray_tab; syncGodRayPanel(); return; }
            if (keys.every(key=>key.startsWith('_ray_group_'))) {for (const key of keys) godRayGroupsOpen[key.slice('_ray_group_'.length)]=result[key]===true;return;}
            const direct = beginGodRayUndo();
            if (!godRayUndo) return;
            godRayUndo.changed = applyGodRayValues(godRayUndo.elements, result, keys) || godRayUndo.changed;
            if (direct) finishGodRayUndo();
        });
        deletables.push(change, godRayPanel, window.LightManagerUI.addDesignedPanelStyles('lightflow_god_ray_properties', { row_padding: '3px 4px' }));
        window.LightManagerUI.workspace?.register(godRayPanel);
        deletables.push(Blockbench.on('update_selection', syncGodRayPanel));
        deletables.push(Blockbench.on('update_view', () => GodRayElement.all.forEach(updateGodRayHelper)));
        const gizmos = () => GodRayElement.all.forEach(updateGodRayHelper);
        window.addEventListener('lightflow_gizmo_visibility_changed', gizmos);
        deletables.push({ delete() { window.removeEventListener('lightflow_gizmo_visibility_changed', gizmos); } });
    }

    function disposeGodRays() {
        finishGodRayUndo();
        godRayRuntime?.dispose();
        for (const project of window.ModelProject?.all || [window.Project]) {
            for (const element of project?.elements || []) {
                if (element.type !== 'lightflow_god_ray') continue;
                const node = project.nodes_3d?.[element.uuid];
                node?.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
                node?.parent?.remove(node);
                if (node) delete project.nodes_3d[element.uuid];
            }
        }
        if (OutlinerElement.types.lightflow_god_ray === GodRayElement) delete OutlinerElement.types.lightflow_god_ray;
        if (NodePreviewController.controllers?.lightflow_god_ray === godRayController) godRayController.delete();
        godRayRuntime = null; godRayPanel = null; GodRayElement = null; godRayController = null;
    }

    function installParticleEmitterLifecycle() {
        const prototype = window.Wintersky?.Emitter?.prototype;
        if (!prototype || typeof prototype.delete !== 'function') return;
        const previous = prototype.delete;
        const remove = function(...args) {
            // Wintersky.delete disposes its material but leaves playLoop's
            // interval alive; a controller state can delete a running emitter.
            clearInterval(this.tick_interval);
            delete this.tick_interval;
            if (!this.material) return this;
            return previous.apply(this, args);
        };
        prototype.delete = remove;
        deletables.push({delete(){if(prototype.delete === remove) prototype.delete = previous;}});
    }

    function particleEffectRecordForIdentifier(identifier) {
        for (const record of particleEffectRecords.values()) {
            if (record.config.identifier === identifier) return record;
        }
        return null;
    }

    function ensureParticleEffectScene() {
        if (!window.Wintersky?.Scene || !window.Wintersky?.Config || !window.Wintersky?.Emitter) return null;
        if (!particleEffectScene) {
            particleEffectScene = new window.Wintersky.Scene({
                fetchTexture: config => config.preview_texture ||
                    particleEffectRecordForIdentifier(config.identifier)?.element.particle_texture ||
                    window.WinterskyScene?.fetchTexture?.(config),
                fetchParticleFile: (identifier, config) => {
                    const imported = particleEffectRecordForIdentifier(identifier);
                    return imported ? { json: JSON.parse(imported.json), file_path: imported.path } :
                        window.WinterskyScene?.fetchParticleFile?.(identifier, config);
                }
            });
            particleEffectScene.global_options.scale = 16;
            particleEffectScene.global_options.loop_mode = 'auto';
            particleEffectScene.global_options.parent_mode = 'entity';
            publishWindowBinding('LightflowParticleScene', particleEffectScene);
            publishWindowBinding('LightflowParticleBloom', { hasBloom: hasParticleBloom, renderBloomContribution: renderParticleBloomContribution });
        }
        if (window.settings?.particle_tick_rate?.value) {
            particleEffectScene.global_options.tick_rate = window.settings.particle_tick_rate.value;
        }
        const canvasScene = window.Canvas?.scene;
        if (canvasScene && particleEffectScene.space.parent !== canvasScene) {
            canvasScene.add(particleEffectScene.space);
        }
        return particleEffectScene;
    }

    function ensureParticleBloomMaterial(emitter) {
        const material = emitter?.material;
        if (!material) return null;
        if (material.userData.lightflowParticleBloomMaterial) return material.userData.lightflowParticleBloomMaterial;
        // Keep Wintersky's texture UV and per-particle color/alpha in Studio's
        // selective emission pass, including emitters spawned by events.
        const bloomMaterial = new THREE.ShaderMaterial({
            uniforms: {
                map: material.uniforms.map,
                materialType: material.uniforms.materialType,
                uBloom: { value: 0 },
                uBloomEncoded: { value: 1 },
                uSceneDepth: { value: material.uniforms.map.value },
                uSceneViewport: { value: new THREE.Vector2(1, 1) },
                uSceneDepthActive: { value: 0 }
            },
            vertexShader: 'attribute vec4 clr; varying vec2 vUv; varying vec4 vColor; void main() { vUv = uv; vColor = clr; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: `uniform sampler2D map; uniform int materialType; uniform float uBloom;
                uniform sampler2D uSceneDepth; uniform vec2 uSceneViewport;
                uniform float uSceneDepthActive, uBloomEncoded;
                varying vec2 vUv; varying vec4 vColor;
                void main() {
                    if (uSceneDepthActive > 0.5 && gl_FragCoord.z > texture2D(uSceneDepth, gl_FragCoord.xy / uSceneViewport).r + 0.0000002) discard;
                    vec4 texel = texture2D(map, vUv);
                    if (materialType == 0 && texel.a < 0.5) discard;
                    float alpha = materialType < 2 ? 1.0 : texel.a * vColor.a;
                    vec3 emission = max(texel.rgb * vColor.rgb * alpha * uBloom, vec3(0.0));
                    gl_FragColor = vec4(uBloomEncoded > 0.5 ? clamp(log2(vec3(1.0) + emission) / 4.0874628413, 0.0, 1.0) : emission, 0.0);
                }`,
            transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
            blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
            blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor
        });
        material.depthWrite = material.uniforms.materialType.value < 2;
        material.userData.lightflowParticleNative = true;
        material.userData.lightflowParticleBloomMaterial = bloomMaterial;
        // Wintersky changes its meshes outside Blockbench's element events.
        // Refresh native MRT routing only when that topology changes; otherwise
        // a newly spawned single-output shader can inherit MRT draw buffers.
        let particleMeshes = new Set();
        const syncTopology = () => {
            const next = new Set((emitter.particles || []).map(particle => particle.mesh));
            if (next.size !== particleMeshes.size || [...next].some(mesh => !particleMeshes.has(mesh))) {
                particleMeshes = next;
                window.LightflowAmbientOcclusion?.invalidateSceneCache?.();
            }
        };
        const originalSpawn = emitter.spawnParticles;
        if (typeof originalSpawn === 'function') emitter.spawnParticles = function(...args) {
            const result = originalSpawn.apply(this, args); syncTopology(); return result;
        };
        emitter.on?.('ticked', syncTopology);
        window.LightflowAmbientOcclusion?.invalidateSceneCache?.();
        const originalDelete = emitter.delete;
        let disposed = false;
        emitter.delete = function(...args) {
            if (!disposed) {
                emitter.removeEventListener?.('ticked', syncTopology);
                particleMeshes.clear();
                bloomMaterial.dispose(); disposed = true;
                window.LightflowAmbientOcclusion?.invalidateSceneCache?.();
            }
            return originalDelete.apply(this, args);
        };
        return bloomMaterial;
    }

    function hasParticleBloom() {
        let active = false;
        window.Canvas?.scene?.traverseVisible(object => {
            if (object.isMesh && object.material?.visible !== false && Number(object.material?.userData?.lightflowParticleBloom) > 0) active = true;
        });
        return active;
    }

    function renderParticleBloomContribution(preview, { target, depthTexture } = {}) {
        const renderer = preview?.renderer, scene = window.Canvas?.scene;
        if (!renderer || !scene || !target || !depthTexture || !hasParticleBloom()) return false;
        const changes = [], previousTarget = renderer.getRenderTarget(), autoClear = renderer.autoClear;
        const background = scene.background, overrideMaterial = scene.overrideMaterial;
        const shadowAutoUpdate = renderer.shadowMap?.autoUpdate, shadowNeedsUpdate = renderer.shadowMap?.needsUpdate;
        try {
            // Render particles in their actual scene hierarchy, including local
            // emitters and event children. Geometry depth comes from the frame.
            scene.traverseVisible(object => {
                if (!(object.isMesh || object.isLine || object.isPoints || object.isSprite)) return;
                const source = object.material, bloom = source?.userData?.lightflowParticleBloomMaterial;
                changes.push({ object, source, visible: object.visible, bloom });
            });
            for (const { object, source, bloom } of changes) {
                if (!bloom || source.visible === false || !(source.userData.lightflowParticleBloom > 0)) { object.visible = false; continue; }
                const u = bloom.uniforms;
                u.uSceneDepth.value = depthTexture;
                u.uSceneViewport.value.set(target.width, target.height);
                u.uSceneDepthActive.value = source.depthTest === false ? 0 : 1;
                u.uBloomEncoded.value = 0;
                object.material = bloom;
            }
            scene.background = null; scene.overrideMaterial = null;
            if (renderer.shadowMap) { renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false; }
            renderer.autoClear = false;
            renderer.setRenderTarget(target);
            renderer.render(scene, preview.camera);
            return true;
        } finally {
            for (const { object, source, visible, bloom } of changes) {
                object.material = source; object.visible = visible;
                if (bloom) {
                    bloom.uniforms.uSceneDepthActive.value = 0;
                    bloom.uniforms.uBloomEncoded.value = 1;
                    bloom.uniforms.uSceneDepth.value = source.uniforms.map.value;
                }
            }
            scene.background = background; scene.overrideMaterial = overrideMaterial;
            if (renderer.shadowMap) { renderer.shadowMap.autoUpdate = shadowAutoUpdate; renderer.shadowMap.needsUpdate = shadowNeedsUpdate; }
            renderer.setRenderTarget(previousTarget); renderer.autoClear = autoClear;
        }
    }

    function syncParticleEmitterBloom(emitter, element) {
        const bloomMaterial = ensureParticleBloomMaterial(emitter);
        if (bloomMaterial) {
            emitter.material.depthWrite = emitter.material.uniforms.materialType.value < 2;
            bloomMaterial.depthWrite = emitter.material.depthWrite;
            bloomMaterial.uniforms.uBloom.value = Math.max(0, finite(element?.particle_bloom, 0));
            bloomMaterial.side = emitter.material.side;
            emitter.material.userData.lightflowParticleBloom = bloomMaterial.uniforms.uBloom.value;
        }
        for (const child of emitter?.child_emitters || []) {
            syncParticleEmitterBloom(child, particleEffectRecordForIdentifier(child.config.identifier)?.element);
        }
    }

    function releaseParticleEffect(uuid) {
        const record = particleEffectRecords.get(uuid);
        if (!record) return;
        particleEffectRecords.delete(uuid);
        record.emitter?.stopLoop?.();
        record.emitter?.delete?.();
        record.config?.texture?.dispose?.();
        if (record.config?.identifier && particleEffectScene?.child_configs) {
            const childConfig = particleEffectScene.child_configs[record.config.identifier];
            if (childConfig) retiredParticleConfigs.add(childConfig);
            delete particleEffectScene.child_configs[record.config.identifier];
        }
    }

    function clearParticleEffects() {
        for (const uuid of particleEffectRecords.keys()) releaseParticleEffect(uuid);
        for (const config of Object.values(particleEffectScene?.child_configs || {})) retiredParticleConfigs.add(config);
        for (const config of retiredParticleConfigs) config.texture?.dispose?.();
        retiredParticleConfigs.clear();
        if (particleEffectScene?.child_configs) particleEffectScene.child_configs = {};
        particleEffectScene?.space?.parent?.remove(particleEffectScene.space);
    }

    function getParticlePreviewTexture(element, json) {
        if (element.particle_texture) return window.LightManagerUI.textureSource.url(element.particle_texture) || element.particle_texture;
        const packs = (window.LightflowTerrainRender || window.BedrockStructureStudio)?.packs;
        return packs?.textureURL?.(json?.particle_effect?.description?.basic_render_parameters?.texture, window.Project) || '';
    }

    function syncParticleEffect(element) {
        if (!element?.mesh || !element.particle_json) {
            if (element?.uuid) releaseParticleEffect(element.uuid);
            return;
        }
        const scene = ensureParticleEffectScene();
        if (!scene) return;
        let record = particleEffectRecords.get(element.uuid);
        if (record && (record.json !== element.particle_json || record.path !== element.particle_path ||
            record.texture !== element.particle_texture || record.node !== element.mesh)) {
            releaseParticleEffect(element.uuid);
            record = null;
        }
        if (!record) {
            try {
                const json = JSON.parse(element.particle_json);
                if (!json?.particle_effect) return;
                const config = new window.Wintersky.Config(scene, json, { path: element.particle_path || '' });
                const textureSource = getParticlePreviewTexture(element, json);
                if (textureSource) {
                    config.preview_texture = textureSource;
                    config.updateTexture();
                }
                const emitter = new window.Wintersky.Emitter(scene, config);
                ensureParticleBloomMaterial(emitter);
                const oldVariableHandler = emitter.Molang?.variableHandler;
                if (typeof oldVariableHandler === 'function') {
                    emitter.Molang.variableHandler = (key, params) => {
                        const value = oldVariableHandler.call(emitter, key, params);
                        return value !== undefined ? value : window.Animator?.MolangParser?.variableHandler?.(key);
                    };
                }
                emitter.parent_mode = 'entity';
                record = { json: element.particle_json, path: element.particle_path,
                    texture: element.particle_texture, node: element.mesh, element, config, emitter,
                    previewTime: null, previewAge: null, valid:!!json?.particle_effect?.components };
                particleEffectRecords.set(element.uuid, record);
            } catch (error) {
                console.warn('[Lightflow Atmosphere] Invalid Bedrock particle effect.', error);
                return;
            }
        }
        const node = element.mesh;
        const emitter = record.emitter;
        // A one-shot Bedrock effect should still be useful as a looping art
        // element. Keep the source JSON intact and override only the preview
        // emitter's loop mode; artists can switch back to native behavior.
        const loopMode=['once','looping'].includes(element.particle_preview_mode) ? element.particle_preview_mode : element.particle_loop ? 'looping' : 'auto';
        if(emitter.loop_mode!==loopMode)record.previewTime=null;
        emitter.loop_mode=loopMode;
        node.updateWorldMatrix?.(true, false);
        const worldPosition = node.getWorldPosition(new THREE.Vector3());
        const worldRotation = node.getWorldQuaternion(new THREE.Quaternion());
        const worldScale = node.getWorldScale(new THREE.Vector3());
        const size = Math.max(0.01, finite(element.particle_size, 1));
        syncParticleEmitterBloom(emitter, element);
        // Wintersky adds local_space's world origin to global particles and
        // again when spawning a child event. Parenting local_space to this
        // element for global effects applies the element position twice (or
        // three times for children). Keep the reference at scene origin while
        // retaining the node's world rotation for initial directions.
        if (emitter.config.space_local_position) {
            if (emitter.local_space.parent !== node) node.add(emitter.local_space);
            emitter.local_space.position.set(0, 0, 0);
            emitter.local_space.quaternion.identity();
            emitter.local_space.scale.setScalar(16 * size);
        } else {
            if (emitter.local_space.parent !== scene.space) scene.space.add(emitter.local_space);
            emitter.local_space.position.set(0, 0, 0);
            emitter.local_space.quaternion.copy(worldRotation);
            emitter.local_space.scale.set(1, 1, 1);
        }
        emitter.global_space.position.copy(worldPosition);
        if (emitter.config.space_local_position) emitter.global_space.quaternion.copy(worldRotation);
        else emitter.global_space.quaternion.identity();
        emitter.global_space.scale.set(16 * size * worldScale.x, 16 * size * worldScale.y, 16 * size * worldScale.z);
        const visible = element.visibility !== false && element.enabled !== false;
        emitter.global_space.visible = visible;
        emitter.local_space.visible = visible;
        const cinematic = window.LightflowCinematicFrameContext;
        const offline = cinematic?.source === 'lightflow_cinematic_render';
        const playing = !offline && element.enabled !== false && element.particle_playing !== false;
        if (playing && !emitter.tick_interval) emitter.playLoop();
        // toggleLoop pauses in place; stopLoop clears particles and age while
        // leaving view_age intact, which breaks jumpTo at the saved pose.
        if (!playing && emitter.tick_interval) emitter.toggleLoop();
        if (!playing && element.enabled !== false) {
            const previewTime = Math.max(0, offline && element.particle_playing !== false
                ? finite(cinematic.timeSeconds, 0) : finite(element.particle_time, 0));
            // Undo/Redo and native emitter resets can rewind age without
            // changing the requested still-frame time.
            if (record.previewTime !== previewTime ||
                Math.abs(finite(emitter.age, -1) - finite(record.previewAge, -2)) > 0.0001) {
                emitter.jumpTo(previewTime);
                record.previewTime = previewTime;
                record.previewAge = emitter.age;
            }
        } else {
            record.previewTime = null;
            record.previewAge = null;
        }
        updateParticleHelper(element, record);
    }

    function updateParticleHelper(element, record, camera = Preview.selected?.camera || window.main_preview?.camera, renderer) {
        const node=element.mesh;if(!node?.particleGizmo)return;
        const workspace=window.LightManagerUI?.workspace;
        const show=element.visibility!==false && canShowVolumeGizmos();
        const marker=show && (workspace?.helperVisible({selected:!!element.selected,kind:'marker'})??true);
        const bounds=show && (workspace?.helperVisible({selected:!!element.selected})??true);
        node.particleOrigin.visible=marker;
        const origin=node.getWorldPosition(new THREE.Vector3()), preview=Preview.all.find(p=>p.camera===camera)||Preview.selected;
        const scale=window.LightManagerUI?.gizmos?.screenWorldSize?.(node, camera, renderer, 6)
            ?? Math.max(.08,(preview?.calculateControlScale?.(origin)||.5)*.65);
        const parentScale=node.getWorldScale(new THREE.Vector3());
        node.particleOrigin.scale.set(scale/Math.max(.0001,Math.abs(parentScale.x)),scale/Math.max(.0001,Math.abs(parentScale.y)),scale/Math.max(.0001,Math.abs(parentScale.z)));
        node.particleSelection.visible=marker;node.particleSelection.scale.copy(node.particleOrigin.scale).multiplyScalar(2);
        node.particleOrigin.updateWorldMatrix(true,false);node.particleSelection.updateWorldMatrix(true,false);
        node.particleOrigin.material.color.set(element.selected?0x5ba7ff:0x78ddff);
        node.particleOrigin.material.opacity=element.selected ? .9 : .45;
        window.LightManagerUI?.gizmos?.style?.(node.particleOrigin, 'outline', !!element.selected);
        window.LightManagerUI?.gizmos?.style?.(node.particleGizmo, 'outline', !!element.selected);
        const config=record?.config;
        const literal=value=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value))?Number(value):null;
        const vector=(value,fallback)=>Array.isArray(value)?value.map(literal):fallback;
        const mode=config?.emitter_shape_mode||'point', offset=vector(config?.emitter_shape_offset,[0,0,0]);
        const half=vector(config?.emitter_shape_half_dimensions,[0,0,0]),radius=literal(config?.emitter_shape_radius);
        const dynamic=offset.includes(null)||(mode==='box'&&half.includes(null))||(['sphere','disc'].includes(mode)&&radius===null);
        node.userData.particleShape=mode;node.userData.particleShapeDynamic=dynamic;
        node.particleGizmo.visible=bounds&&!dynamic;
        if(dynamic)return;
        node.particleGizmo.material.color.set(element.selected?0x5ba7ff:0x78ddff);node.particleGizmo.material.opacity=element.selected ? .65 : .18;
        window.LightManagerUI?.gizmos?.style?.(node.particleGizmo, 'outline', !!element.selected);
        const signature=JSON.stringify([mode,offset,half,radius,config?.emitter_shape_plane_normal,element.particle_size,element.selected,mode==='point'?scale:0]);
        if(node.userData.particleShapeSignature===signature)return;
        node.userData.particleShapeSignature=signature;
        const unit=16*Math.max(.01,finite(element.particle_size,1)),center=new THREE.Vector3().fromArray(offset).multiplyScalar(unit),points=[];
        const line=(a,b)=>points.push(a,b);
        if(mode==='box'||mode==='entity_aabb') {
            // The imported entity AABB is unavailable in a standalone scene.
            if(mode==='entity_aabb'){node.particleGizmo.visible=false;return;}
            const corners=Array.from({length:8},(_,i)=>center.clone().add(new THREE.Vector3((i&1?1:-1)*half[0]*unit,(i&2?1:-1)*half[1]*unit,(i&4?1:-1)*half[2]*unit)));
            for(let i=0;i<8;i++)for(const bit of[1,2,4])if(!(i&bit))line(corners[i],corners[i|bit]);
        } else if(mode==='sphere'||mode==='disc') {
            let rotation=new THREE.Quaternion();
            if(mode==='disc'){
                const normal=vector(config.emitter_shape_plane_normal,[0,1,0]);
                if(normal.includes(null)){node.particleGizmo.visible=false;return;}
                const axis=new THREE.Vector3().fromArray(normal);if(axis.lengthSq()<1e-6)axis.set(0,1,0);
                rotation.setFromUnitVectors(new THREE.Vector3(0,1,0),axis.normalize());
            }
            for(const plane of mode==='disc'?['xz']:['xy','xz','yz'])for(let i=0;i<48;i++) {
                const point=angle=>{const p=new THREE.Vector3();p[plane[0]]=Math.cos(angle)*Math.max(0,radius)*unit;p[plane[1]]=Math.sin(angle)*Math.max(0,radius)*unit;return p.applyQuaternion(rotation).add(center);};
                line(point(i/48*Math.PI*2),point((i+1)/48*Math.PI*2));
            }
        } else {
            for(const axis of['x','y','z']){const a=center.clone(),b=center.clone();a[axis]-=scale;b[axis]+=scale;line(a,b);}
        }
        if(element.selected&&center.lengthSq()>.001)line(new THREE.Vector3(),center);
        let attribute=node.particleGizmo.geometry.getAttribute('position');
        if(!attribute||attribute.count!==points.length){attribute=new THREE.Float32BufferAttribute(new Float32Array(points.length*3),3);node.particleGizmo.geometry.setAttribute('position',attribute);}
        points.forEach((point,index)=>attribute.setXYZ(index,point.x,point.y,point.z));attribute.needsUpdate=true;node.particleGizmo.geometry.computeBoundingSphere();
    }

    function syncParticleEffects(camera) {
        if (!ParticleEffectElement) return;
        const elements = ParticleEffectElement.all || [];
        const active = new Set(elements.map(element => element.uuid));
        for (const uuid of particleEffectRecords.keys()) if (!active.has(uuid)) releaseParticleEffect(uuid);
        elements.forEach(syncParticleEffect);
        if (camera) particleEffectScene?.updateFacingRotation?.(camera);
    }

    function importParticleJSON(existingElement = null) {
        Blockbench.import({ resource_id: 'lightflow_particle', extensions: ['json'], type: 'Bedrock Particle' }, files => {
            const file = files?.[0];
            if (!file) return;
            let json;
            try { json = typeof file.content === 'string' ? JSON.parse(file.content) : file.content; }
            catch (error) { json = null; }
            if (!json?.particle_effect || typeof json.particle_effect.components !== 'object') {
                Blockbench.showToastNotification({ text: 'Invalid .particle.json particle_effect', icon: 'error', expire: 5000 });
                return;
            }
            const textureRef = String(json.particle_effect.description?.basic_render_parameters?.texture || '');
            let previousTextureRef = '';
            if (existingElement?.particle_json) {
                try { previousTextureRef = String(JSON.parse(existingElement.particle_json)
                    .particle_effect?.description?.basic_render_parameters?.texture || ''); }
                catch (error) { /* The replacement JSON remains authoritative. */ }
            }
            const values = { particle_json: JSON.stringify(json), particle_path: file.path || '',
                particle_texture: existingElement && previousTextureRef === textureRef ? existingElement.particle_texture : '',
                particle_bloom: json.particle_effect.description?.basic_render_parameters?.material === 'particles_add' ? 0.6 : 0 };
            let element = existingElement;
            if (existingElement) {
                Undo.initEdit({ elements: [existingElement] });
                existingElement.extend(values);
                Undo.finishEdit('Replace particle effect');
                syncParticleEffect(existingElement);
            } else {
                Undo.initEdit({ outliner: true, elements: [], selection: true });
                element = new ParticleEffectElement({ name: file.name?.replace(/\.particle\.json$|\.json$/i, '') || 'Particle Effect', ...values }).addTo().init();
                unselectAll(); element.select();
                Undo.finishEdit('Import particle effect', { outliner: true, elements: [element], selection: true });
                syncParticleEffect(element);
            }
            // Match Blockbench's native particle import: ask for a PNG when the
            // JSON names an external texture that the runtime did not resolve.
            const textureSource = particleEffectRecords.get(element.uuid)?.config?.texture?.image?.src;
            if (!element.particle_texture && textureRef && textureRef !== 'textures/particle/particles' &&
                !textureRef.startsWith('atlas.') && (!textureSource || textureSource.startsWith('data:'))) {
                setTimeout(() => importParticleTexture(element, file.path || ''), 0);
            }
            requestPreviewRender();
        });
    }

    function importParticleTexture(element, startpath = '') {
        Blockbench.import({ extensions: ['png'], type: 'Particle Texture', readtype: 'image', startpath }, files => {
            const file = files?.[0];
            if (!file) return;
            window.LightManagerUI.textureSource.fromFile(file).then(texture => {
            if (!texture || !ParticleEffectElement.all.includes(element)) return;
            Undo.initEdit({ elements: [element] });
            element.extend({ particle_texture: texture });
            Undo.finishEdit('Change particle texture');
            syncParticleEffect(element);
            syncParticlePanel();
            requestPreviewRender();
            });
        });
    }

    function particleJSONControls(element) {
        let json;
        try { json = JSON.parse(element?.particle_json || '{}'); } catch (error) { return { json: null, values: {} }; }
        const components = json.particle_effect?.components || {};
        const rate = components['minecraft:emitter_rate_steady'];
        const active = components['minecraft:emitter_lifetime_once'] || components['minecraft:emitter_lifetime_looping'];
        const billboard = components['minecraft:particle_appearance_billboard'];
        const tint = components['minecraft:particle_appearance_tinting'];
        const values = {};
        const addNumber = (key, value) => { if (typeof value === 'number' && Number.isFinite(value)) values[key] = value; };
        values.emitter_cycle=['once','looping','expression'].find(kind=>components['minecraft:emitter_lifetime_'+kind]) || 'looping';
        addNumber('spawn_rate', rate?.spawn_rate);
        addNumber('max_particles', rate?.max_particles);
        if(values.emitter_cycle!=='expression')addNumber('active_time', active?.active_time ?? 10);
        if(values.emitter_cycle==='looping')addNumber('sleep_time',active?.sleep_time ?? 0);
        addNumber('lifetime', components['minecraft:particle_lifetime_expression']?.max_lifetime);
        addNumber('speed', components['minecraft:particle_initial_speed']);
        addNumber('size_x', billboard?.size?.[0]);
        addNumber('size_y', billboard?.size?.[1]);
        const shape=['point','box','sphere','disc','entity_aabb'].find(kind=>components['minecraft:emitter_shape_'+kind]);
        values.emitter_shape=shape||'point';
        const shapeConfig=components['minecraft:emitter_shape_'+values.emitter_shape]||{};
        if(Array.isArray(shapeConfig.half_dimensions)&&shapeConfig.half_dimensions.every(v=>typeof v==='number'))values.emitter_dimensions=shapeConfig.half_dimensions.map(v=>v*2);
        addNumber('emitter_radius',shapeConfig.radius);
        const motion=components['minecraft:particle_motion_dynamic'];
        if(Array.isArray(motion?.linear_acceleration)&&motion.linear_acceleration.every(v=>typeof v==='number'))values.acceleration=motion.linear_acceleration.slice();
        addNumber('drag',motion?.linear_drag_coefficient);
        if (typeof tint?.color === 'string' && /^#[0-9a-f]{6}$/i.test(tint.color)) values.color = tint.color;
        return { json, values };
    }

    function particleChildIdentifiers(json) {
        const found = new Set();
        const visit = value => {
            if (!value || typeof value !== 'object') return;
            if (typeof value.particle_effect?.effect === 'string') found.add(value.particle_effect.effect);
            for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
        };
        visit(json?.particle_effect?.events);
        return [...found];
    }

    function applyParticleJSONControl(element, key, value) {
        const { json, values } = particleJSONControls(element);
        if (!json?.particle_effect?.components || !Object.prototype.hasOwnProperty.call(values, key) || JSON.stringify(values[key]) === JSON.stringify(value)) return false;
        const components = json.particle_effect.components;
        if (key === 'spawn_rate' || key === 'max_particles') components['minecraft:emitter_rate_steady'][key] = value;
        else if (key === 'active_time' || key === 'sleep_time') {
            const id='minecraft:emitter_lifetime_'+values.emitter_cycle;
            components[id] ||= {};components[id][key]=value;
        }
        else if(key==='emitter_cycle'){
            if(!['once','looping','expression'].includes(value))return false;
            const previous=components['minecraft:emitter_lifetime_'+values.emitter_cycle]||{};
            for(const kind of['once','looping','expression'])delete components['minecraft:emitter_lifetime_'+kind];
            components['minecraft:emitter_lifetime_'+value]=value==='expression'?{activation_expression:1,expiration_expression:0}:{active_time:previous.active_time ?? 10,...(value==='looping'?{sleep_time:previous.sleep_time ?? 0}:{})};
        }
        else if (key === 'lifetime') components['minecraft:particle_lifetime_expression'].max_lifetime = value;
        else if (key === 'speed') components['minecraft:particle_initial_speed'] = value;
        else if (key === 'size_x' || key === 'size_y') components['minecraft:particle_appearance_billboard'].size[key === 'size_x' ? 0 : 1] = value;
        else if (key === 'color') components['minecraft:particle_appearance_tinting'].color = value;
        else if(key==='emitter_shape'){
            if(!['point','box','sphere'].includes(value))return false;
            const previous=components['minecraft:emitter_shape_'+values.emitter_shape]||{};
            for(const kind of['point','box','sphere','disc','entity_aabb'])delete components['minecraft:emitter_shape_'+kind];
            components['minecraft:emitter_shape_'+value]={offset:previous.offset||[0,0,0],direction:previous.direction||[0,1,0],...(value==='box'?{half_dimensions:[1,1,1]}:value==='sphere'?{radius:1}:{}),...(typeof previous.surface_only==='boolean'?{surface_only:previous.surface_only}:{})};
        }
        else if(key==='emitter_dimensions'&&components['minecraft:emitter_shape_box'])components['minecraft:emitter_shape_box'].half_dimensions=value.map(v=>Math.max(.001,v)/2);
        else if(key==='emitter_radius'&&components['minecraft:emitter_shape_'+values.emitter_shape])components['minecraft:emitter_shape_'+values.emitter_shape].radius=value;
        else if(key==='acceleration'&&components['minecraft:particle_motion_dynamic'])components['minecraft:particle_motion_dynamic'].linear_acceleration=value.slice();
        else if(key==='drag'&&components['minecraft:particle_motion_dynamic'])components['minecraft:particle_motion_dynamic'].linear_drag_coefficient=value;
        else return false;
        element.extend({ particle_json: JSON.stringify(json) });
        return true;
    }

    function editParticleJSON(element) {
        if (!element) return;
        let formatted = element.particle_json;
        try { formatted = JSON.stringify(JSON.parse(formatted), null, 2); } catch (error) { /* Show source unchanged. */ }
        let dialog;
        const validate = source => {
            try {
                const parsed = JSON.parse(source);
                const effect = parsed?.particle_effect;
                if (!effect?.description || typeof effect.description !== 'object' || Array.isArray(effect.description) || !effect.components || typeof effect.components !== 'object' || Array.isArray(effect.components)) return {error:uiText('missing_particle_components')};
                return {parsed, count:Object.keys(effect.components).length};
            } catch (error) { return {error:uiText('invalid_particle_json') + ': ' + error.message}; }
        };
        const updateStatus = result => {
            if (!dialog?.validationNode) return;
            const state = validate(result.source);
            dialog.validationNode.textContent = state.error || uiText('json_valid').replace('{count}', String(state.count));
            dialog.validationNode.style.color = state.error ? 'var(--color-error)' : 'var(--color-subtle_text)';
            dialog.form.form_data.source.bar.querySelector('textarea')?.setAttribute('aria-invalid', String(!!state.error));
        };
        dialog = showEffectDialog('lightflow_particle_json_dialog', { title: uiText('edit_json'), width: 720, resizable:true,
            form: {
                source: window.LightManagerUI.formDesign.code({label:'Bedrock .particle.json',language:'json',mode:'visual',height:280,value:formatted,validate:source=>validate(source).error||''})
            },
            onFormChange: updateStatus,
            onConfirm(result) {
                const {parsed,error} = validate(result.source);
                if (error) { updateStatus(result); return false; }
                if (!ParticleEffectElement.all.includes(element)) return;
                if (JSON.stringify(parsed) === element.particle_json) return;
                Undo.initEdit({ elements: [element] });
                element.extend({ particle_json: JSON.stringify(parsed) });
                Undo.finishEdit('Edit particle JSON');
                syncParticleEffect(element); syncParticlePanel(); requestPreviewRender();
            } });
        dialog.validationNode = document.createElement('p');
        dialog.validationNode.setAttribute('role','status');
        dialog.validationNode.setAttribute('aria-live','polite');
        dialog.validationNode.style.cssText='font-size:12px;line-height:1.4;margin:8px 0 0;overflow-wrap:anywhere';
        dialog.form.node.append(dialog.validationNode);
        const source = dialog.form.form_data.source.bar.querySelector('textarea');
        source.spellcheck = false;

        source.setSelectionRange(0,0); source.scrollTop = 0;
        updateStatus(dialog.getFormResult());
    }

    function particlePresetJSON(kind) {
        const snow=kind==='snow',rain=kind==='rain';
        const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
        canvas.getContext('2d').fillStyle='#ffffff';canvas.getContext('2d').fillRect(0,0,1,1);
        const json={format_version:'1.10.0',particle_effect:{description:{identifier:'lightflow:'+kind,basic_render_parameters:{material:kind==='sparks'?'particles_add':'particles_alpha',texture:'textures/particle/particles'}},components:{
            'minecraft:emitter_rate_steady':{spawn_rate:rain?45:snow?18:12,max_particles:rain?160:snow?160:80},
            'minecraft:emitter_lifetime_looping':{active_time:1},
            [snow||rain?'minecraft:emitter_shape_box':'minecraft:emitter_shape_point']:snow||rain?{offset:[0,12,0],half_dimensions:[6,.1,6],direction:[0,-1,0]}:{offset:[0,0,0],direction:[0,1,0]},
            'minecraft:particle_lifetime_expression':{max_lifetime:snow?5:rain?1.5:1},
            'minecraft:particle_initial_speed':rain?8:snow?.5:2,
            'minecraft:particle_motion_dynamic':{linear_acceleration:[snow?.08:0,snow?-.2:rain?-2:-1,0],linear_drag_coefficient:snow?.2:0},
            'minecraft:particle_appearance_billboard':{size:rain?[.025,.2]:snow?[.08,.08]:[.04,.04],facing_camera_mode:'rotate_xyz',uv:{texturewidth:1,textureheight:1,uv:[0,0],uv_size:[1,1]}},
            'minecraft:particle_appearance_tinting':{color:rain?'#aaccee':snow?'#ffffff':'#ffcc66'}
        }}};
        return{particle_json:JSON.stringify(json),particle_texture:canvas.toDataURL(),particle_path:'',particle_playing:true,particle_size:1,particle_bloom:kind==='sparks'?.6:0,enabled:true,visibility:true};
    }

    function editParticleExpressions(element) {
        const {json,values}=particleJSONControls(element);
        if(!json?.particle_effect?.components)return editParticleJSON(element);
        const components=json.particle_effect.components;
        const specs={
            emitter_start:['minecraft:emitter_initialization','creation_expression','emitter','variables_start','variable.speed = 2;'],
            emitter_update:['minecraft:emitter_initialization','per_update_expression','emitter','variables_update','variable.phase = variable.emitter_age;'],
            particle_update:['minecraft:particle_initialization','per_update_expression','particle','variables_particle_update','variable.speed = variable.speed + 0.01;'],
            particle_render:['minecraft:particle_initialization','per_render_expression','particle','variables_particle_render',''],
            cycle_active:['minecraft:emitter_lifetime_'+values.emitter_cycle,'active_time','cycle','duration',''],
            cycle_sleep:['minecraft:emitter_lifetime_looping','sleep_time','cycle','sleep_time',''],
            cycle_activation:['minecraft:emitter_lifetime_expression','activation_expression','cycle','activation_expression',''],
            cycle_expiration:['minecraft:emitter_lifetime_expression','expiration_expression','cycle','expiration_expression','']
        };
        const form={_expression_tab:window.LightManagerUI.formDesign.tabs({presentation:'flat',value:'emitter',options:{emitter:{name:uiText('emitter')},particle:{name:uiText('particle')},cycle:{name:uiText('cycle')}}})};
        const initial={};
        for(const[id,[component,key,category,label,placeholder]]of Object.entries(specs)){
            if(category==='cycle' && (component!=='minecraft:emitter_lifetime_'+values.emitter_cycle || (id==='cycle_active'&&values.emitter_cycle==='expression')))continue;
            const value=components[component]?.[key];
            const scalar=value==null||typeof value==='string'||typeof value==='number';
            initial[id]=value==null?'':scalar?String(value):JSON.stringify(value);
            form[id]=window.LightManagerUI.formDesign.code({language:scalar?'molang':'json',height:100,label:uiText(label),value:initial[id],placeholder,readonly:!scalar,condition:result=>result._expression_tab===category});
        }
        form._help={type:'info',text:uiText('variables_help')};
        showEffectDialog('lightflow_particle_expressions',{title:uiText('variables').replace(/…$/,''),width:720,resizable:true,form,onConfirm(result){
            if(!ParticleEffectElement.all.includes(element))return;
            const current=particleJSONControls(element).json;if(!current?.particle_effect?.components)return false;
            const next=current.particle_effect.components;let changed=false;
            for(const[id,[component,key]]of Object.entries(specs)){
                if(!form[id]||form[id].readonly||result[id]===initial[id])continue;
                const value=String(result[id]||'').trim();
                if(value){next[component] ||= {};next[component][key]=/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)?Number(value):value;}
                else if(next[component]){delete next[component][key];if(!Object.keys(next[component]).length)delete next[component];}
                changed=true;
            }
            if(!changed)return;
            Undo.initEdit({elements:[element]});element.extend({particle_json:JSON.stringify(current)});Undo.finishEdit(uiText('variables'));
            syncParticleEffect(element);syncParticlePanel();requestPreviewRender();
        }});
    }
    function applyParticlePreset(kind,element) {
        const values=particlePresetJSON(kind);
        if(element){Undo.initEdit({elements:[element]});element.extend(values);Undo.finishEdit(uiText('particle_setup'));}
        else{
            Undo.initEdit({outliner:true,elements:[],selection:true});
            element=new ParticleEffectElement({name:uiText('preset_'+kind),...values}).addTo().init();
            unselectAll();element.select();Undo.finishEdit(uiText('particle_setup'),{outliner:true,elements:[element],selection:true});
        }
        syncParticleEffect(element);syncParticlePanel();requestPreviewRender();
    }
    function particlePresetItems(element) {
        return [
            ...[['snow','ac_unit'],['rain','water_drop'],['sparks','auto_awesome']].map(([kind,icon])=>({name:uiText('preset_'+kind),icon,click:()=>applyParticlePreset(kind,element)})),
            new MenuSeparator(),{name:uiText('import_effect'),icon:'upload_file',click:()=>importParticleJSON(element)}
        ];
    }
    function particlePresetMenu(element,event) {
        const anchor = event?.currentTarget || event?.target?.closest?.('button,.tool') || event?.target || event || document.activeElement;
        new Menu('lightflow_particle_presets', particlePresetItems(element)).open(anchor);
    }
    async function particleSnowstormURL(element) {
        const compress=async bytes=>{
            const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
            const buffer=new Uint8Array(await new Response(stream).arrayBuffer());
            let binary='';for(let i=0;i<buffer.length;i+=8192)binary+=String.fromCharCode(...buffer.subarray(i,i+8192));
            return btoa(binary);
        };
        let json;try{json=JSON.parse(element.particle_json);}catch(error){editParticleJSON(element);return null;}
        const url=new URL('https://snowstorm.app/');
        url.searchParams.set('loadParticle',await compress(new TextEncoder().encode(JSON.stringify(json))));
        const source=window.LightManagerUI.textureSource.url(element.particle_texture) || particleEffectRecords.get(element.uuid)?.config?.texture?.image?.src;
        if(source){
            try{
                const blob=await (await fetch(source)).blob();
                if(blob.type==='image/png'&&blob.size<200000){
                    const texture=await compress(new Uint8Array(await blob.arrayBuffer()));
                    if(url.href.length+texture.length<28000)url.searchParams.set('loadParticleTexture',texture);
                }
            }catch(error){/* An unresolved optional texture does not prevent editing the JSON. */}
        }
        if(url.href.length>28000){Blockbench.showQuickMessage(uiText('snowstorm_export_help'),4500);return null;}
        return url.href;
    }
    async function openParticleSnowstorm(element) {
        const url=await particleSnowstormURL(element);if(url){
            if(element.particle_texture&&!new URL(url).searchParams.has('loadParticleTexture'))Blockbench.showQuickMessage(uiText('snowstorm_texture_help'),4500);
            Blockbench.openLink(url);
        }
        return url;
    }
    function exportParticleJSON(element) {
        let content=element.particle_json;try{content=JSON.stringify(JSON.parse(content),null,2);}catch(error){/* Keep invalid source editable. */}
        Blockbench.export({type:'Bedrock Particle',extensions:['json'],name:element.name.replace(/[<>:"/\\|?*]/g,'_')+'.particle',content,savetype:'text'});
    }

    function reloadParticleEffect(element) {
        const rebuild=()=>{releaseParticleEffect(element.uuid);syncParticleEffect(element);syncParticlePanel();requestPreviewRender();};
        if (!element.particle_path || typeof isApp === 'undefined' || !isApp) {rebuild();return;}
        const project=window.Project;
        Blockbench.read(element.particle_path,{readtype:'text'},files=>{
            if(window.Project!==project || !ParticleEffectElement.all.includes(element))return;
            let json;try{json=JSON.parse(files?.[0]?.content);}catch(error){}
            if(!json?.particle_effect?.components){Blockbench.showQuickMessage(uiText('invalid_source'));return;}
            Undo.initEdit({elements:[element]});
            element.particle_json=JSON.stringify(json);
            Undo.finishEdit(uiText('reload'));
            rebuild();
        });
    }

    function restartParticleEffect(element) {
        const record = particleEffectRecords.get(element?.uuid);
        if (!record) return;
        record.emitter.stopLoop();
        record.previewTime = null;
        record.previewAge = null;
        if (element.particle_playing) record.emitter.playLoop();
        else {
            record.emitter.start();
            record.emitter.jumpTo(0);
            record.previewTime = 0;
            record.previewAge = record.emitter.age;
        }
        requestPreviewRender();
    }

    let particleSourceOpen = false;
    let particleDistributionOpen=false,particleMotionOpen=false,particleBehaviourOpen=false;
    let particlePanelUndo = null;
    function beginParticlePanelUndo() {
        if (particlePanelUndo || particlePanelSyncing) return false;
        const elements = ParticleEffectElement?.selected?.slice();
        if (!elements?.length) return false;
        particlePanelUndo = {elements,changed:false};
        Undo.initEdit({elements});
        return true;
    }
    function finishParticlePanelUndo() {
        if (!particlePanelUndo) return;
        const changed = particlePanelUndo.changed;
        particlePanelUndo = null;
        if (changed) Undo.finishEdit(uiText('edit_particle')); else Undo.cancelEdit(false);
        if (changed && particlePanelTab === 'playback') {
            const frame = requestAnimationFrame(()=>{inspectorFrames.delete(frame);syncParticlePanel();});
            inspectorFrames.add(frame);
        }
    }
    deletables.push({delete() {if(particlePanelUndo){particlePanelUndo=null;Undo.cancelEdit(false);}}});
    function particlePanelForm(element) {
        if (!element) return emptyEffectForm(ParticleEffectElement,'lightflow_particle_create',tr('lightflow_atmosphere.action.add_particle','Add Particle'));
        const design = window.LightManagerUI.formDesign;
        const tabs = design.tabs({ value: particlePanelTab,
            options: { emission: { name: uiText('emission') }, look: { name: uiText('look') }, playback: { name: uiText('preview') } } });
        const form = { _particle_tab: tabs, _particle_search:design.search(),
            _setup:effectAction('','auto_awesome',event=>particlePresetMenu(element,event),{semantic_button:false,aria_label:uiText('particle_setup'),description:uiText('particle_setup')}) };
        if(element.enabled===false)form._activate=effectAction(uiText('activate_effect'),'visibility',()=>{
            Undo.initEdit({elements:[element]});element.extend({enabled:true,visibility:true});Undo.finishEdit(uiText('activate_effect'));syncParticleEffect(element);syncParticlePanel();requestPreviewRender();
        });
        const { json, values } = particleJSONControls(element);
        const slider = (key, label, min, max, step, value, allow_higher=false) => ({type:'combo_slider', full_track:true, label, min,max,step,value,allow_higher, onBefore:beginParticlePanelUndo,onAfter:finishParticlePanelUndo});
        if (!json?.particle_effect?.components) form._invalid = {type:'bar_display',paragraph:true,expand:true,icon:'warning',color:'var(--color-warning)',value:uiText('invalid_json')};
        else if (element.enabled===false || element.visibility===false) form._disabled = {type:'bar_display',paragraph:true,expand:true,color:'var(--color-warning)',value:uiText('particle_inactive')};
        {
            form._play = effectAction(uiText(element.particle_playing?'pause':'play'),element.particle_playing?'pause':'play_arrow',()=>{
                const playing = !element.particle_playing;
                const record = particleEffectRecords.get(element.uuid);
                const time = !playing ? Math.max(0, finite(record?.emitter?.view_age, element.particle_time)) : element.particle_time;
                Undo.initEdit({ elements: [element] });
                element.extend({ enabled: true, particle_playing: playing, particle_time: time });
                Undo.finishEdit(uiText(playing?'play':'pause'));
                syncParticleEffect(element); syncParticlePanel(); requestPreviewRender();
            });
            form._restart = effectAction(uiText('restart'),'replay',()=>{restartParticleEffect(element);syncParticlePanel();});
            form.particle_time = slider('particle_time',uiText('frame'),0,Math.max(10,(values.active_time||1)+(values.lifetime||1)),.05,element.particle_time,true);
            form.particle_loop = design.checkbox({label:uiText('repeat'),value:element.particle_loop,condition:()=>!!json?.particle_effect?.components?.['minecraft:emitter_lifetime_once']});
            form._playback_help = {type:'bar_display',paragraph:true,expand:true,font_size:'12px',color:'var(--color-subtle_text)',value:uiText('scrub_help')};
        }
        {
            const specs = { spawn_rate: [uiText('spawn_rate'), 0, 100, 1],
                lifetime: [uiText('lifetime'), 0.01, 10, 0.1],
                speed: [uiText('speed'), 0, 20, 0.1] };
            for (const [key, [label, min, max, step]] of Object.entries(specs)) {
                if (Object.prototype.hasOwnProperty.call(values, key)) form[key] = slider(key,label,min,max,step,values[key],true);
            }
            form._emission_help = {type:'bar_display',paragraph:true,expand:true,font_size:'12px',color:'var(--color-subtle_text)',value:uiText('numeric_help'),condition:()=>!['spawn_rate','lifetime','speed'].every(key=>values[key]!==undefined)};
            form._behaviour=design.group({label:uiText('behaviour'),label_icon:'repeat',value:particleBehaviourOpen,condition:()=>!!json?.particle_effect?.components});
            const behaviourVisible=result=>!!json?.particle_effect?.components&&result._behaviour===true;
            if(values.max_particles!==undefined)form.max_particles={...slider('max_particles',uiText('particle_limit'),1,500,1,values.max_particles,true),condition:behaviourVisible};
            form.emitter_cycle=design.enum({label:uiText('cycle'),value:values.emitter_cycle,options:{once:uiText('cycle_once'),looping:uiText('cycle_loop'),expression:uiText('cycle_expression')},condition:behaviourVisible});
            for(const[key,label,min]of[['active_time','duration',.01],['sleep_time','sleep_time',0]])if(values[key]!==undefined)form[key]={...slider(key,uiText(label),min,10,.1,values[key],true),condition:behaviourVisible};
            form._variables=effectAction(uiText('variables'),'functions',()=>editParticleExpressions(element),{condition:behaviourVisible});
            form._distribution=design.group({label:uiText('particle_distribution'),label_icon:'select_all',value:particleDistributionOpen});
            const shapeOptions={point:uiText('emitter_point'),box:uiText('emitter_box'),sphere:uiText('emitter_sphere')};
            if(!shapeOptions[values.emitter_shape])shapeOptions[values.emitter_shape]=values.emitter_shape;
            form.emitter_shape=design.enum({label:uiText('emitter_shape'),value:values.emitter_shape,options:shapeOptions,condition:result=>result._distribution===true});
            if(values.emitter_dimensions)form.emitter_dimensions=design.vector({label:uiText('emitter_size'),value:values.emitter_dimensions,dimensions:3,min:.001,step:.1,onBefore:beginParticlePanelUndo,onAfter:finishParticlePanelUndo,condition:result=>result._distribution===true});
            if(values.emitter_radius!==undefined)form.emitter_radius={...slider('emitter_radius',uiText('emitter_radius'),.01,20,.1,values.emitter_radius,true),condition:result=>result._distribution===true};
            form._motion=design.group({label:uiText('particle_motion'),label_icon:'air',value:particleMotionOpen});
            if(values.acceleration)form.acceleration=design.vector({label:uiText('acceleration'),value:values.acceleration,dimensions:3,step:.1,onBefore:beginParticlePanelUndo,onAfter:finishParticlePanelUndo,condition:result=>result._motion===true});
            if(values.drag!==undefined)form.drag={...slider('drag',uiText('drag'),0,5,.1,values.drag,true),condition:result=>result._motion===true};
        }
        {
            form.particle_texture = design.texture({label:uiText('particle_texture'),value:element.particle_texture,
                preview_source:()=>particleEffectRecords.get(element.uuid)?.config?.texture?.image?.src || '',
                onBefore:beginParticlePanelUndo,onAfter:finishParticlePanelUndo});
            form.particle_size = slider('particle_size',uiText('scene_scale'),.01,4,.05,element.particle_size,true);
            for (const [key, label] of [['size_x',uiText('width')], ['size_y',uiText('height')]]) {
                if (Object.prototype.hasOwnProperty.call(values, key)) form[key] = slider(key,label,.001,2,.01,values[key],true);
            }
            if (values.color) form.color = design.color({label:uiText('tint'),value:values.color,onBefore:beginParticlePanelUndo,onAfter:finishParticlePanelUndo});
            form.particle_bloom = slider('particle_bloom',uiText('bloom'),0,8,.1,element.particle_bloom);
        }
        const categories = {playback:['_play','_restart','particle_time','particle_loop','_playback_help'],emission:['spawn_rate','max_particles','lifetime','speed','_emission_help','_behaviour','emitter_cycle','active_time','sleep_time','_variables','_distribution','emitter_shape','emitter_dimensions','emitter_radius','_motion','acceleration','drag'],look:['particle_texture','particle_size','particle_bloom','size_x','size_y','color']};
        Object.entries(categories).forEach(([category,keys])=>keys.forEach(key=>{if(form[key])form[key].panel_category_visible=category===particlePanelTab;}));
        form._particle_source = design.group({label:uiText('source'),label_icon:'code',value:particleSourceOpen});
        const sourceVisible = result=>result._particle_source===true;
        form._source_info = {type:'bar_display',paragraph:true,expand:true,font_size:'12px',color:'var(--color-subtle_text)',value:json?.particle_effect?.description?.identifier || uiText('invalid_json'),condition:sourceVisible};
        form._json = effectAction(uiText('edit_json'),'code',()=>editParticleJSON(element),{condition:sourceVisible});
        form._snowstorm=effectAction(uiText('snowstorm'),'open_in_new',()=>openParticleSnowstorm(element),{condition:sourceVisible});
        form._export=effectAction(uiText('export_effect'),'download',()=>exportParticleJSON(element),{condition:sourceVisible});
        form._roundtrip_help={type:'bar_display',paragraph:true,expand:true,font_size:'12px',value:uiText('snowstorm_help'),condition:sourceVisible,color:'var(--color-subtle_text)'};
        form._replace = effectAction(uiText('replace'),'upload_file',()=>importParticleJSON(element),{condition:sourceVisible});
        for (const [index, identifier] of particleChildIdentifiers(json).entries()) {
            const child = particleEffectRecordForIdentifier(identifier)?.element;
            form['_child_'+index] = effectAction((child?uiText('select_child'):uiText('import_child'))+': '+identifier,'account_tree',()=>child?child.select():importParticleJSON(),{condition:sourceVisible});
        }
        return identifyEffectControls(form);
    }

    function syncParticlePanel() {
        if (!particleEffectPanel?.form || particlePanelUndo) return;
        const restore = rememberInspectorScroll(particleEffectPanel, `${ParticleEffectElement?.selected?.[0]?.uuid || 'empty'}:${particlePanelTab}`);
        particlePanelSyncing = true;
        try {
            particleEffectPanel.form.form_config = (window.LightManagerUI?.prepareForm || (form => form))(particlePanelForm(ParticleEffectElement?.selected?.[0]));
            particleEffectPanel.form.buildForm();
            window.LightManagerUI.applyFormGroups?.(particleEffectPanel.form,[
                {elements:['_particle_tab','_setup'],gap:'4px',class_name:'lf-particle-tabs-row',flex:{_particle_tab:'1 1 0',_setup:'0 0 30px'}},
                {elements:['_play','_restart'],gap:'6px',flex:{_play:'1 1 0',_restart:'1 1 0'}}
            ]);
            particleEffectPanel.update();
            restore();
        } finally { particlePanelSyncing = false; }
    }

    function registerParticleEffectElement() {
        class LightflowParticleEffectElement extends OutlinerElement {
            constructor(data, uuid) {
                super(data, uuid);
                for (const prop of Object.values(LightflowParticleEffectElement.properties)) prop.reset(this);
                if (data) this.extend(data);
            }
            get origin() { return this.position; }
            getWorldCenter() { return this.mesh.getWorldPosition(new THREE.Vector3()); }
            extend(data) {
                for (const prop of Object.values(LightflowParticleEffectElement.properties)) prop.merge(this, data);
                this.sanitizeName();
                if (particleEffectRecords.get(this.uuid)?.element === this) syncParticleEffect(this);
                return this;
            }
            getUndoCopy() { const copy = new LightflowParticleEffectElement(this, this.uuid); delete copy.parent; return copy; }
            getSaveCopy() {
                const copy = { type: 'lightflow_particle_effect', uuid: this.uuid };
                for (const prop of Object.values(LightflowParticleEffectElement.properties)) prop.copy(this, copy);
                return copy;
            }
            select(...args) {
                super.select(...args); syncParticleEffect(this); syncParticlePanel();
                particleEffectPanel?.selectTab?.();
                return this;
            }
            unselect(...args) { super.unselect(...args); syncParticleEffect(this); syncParticlePanel(); }
            static behavior = { unique_name: true, movable: true, rotatable: true,
                parent_types: ['root', 'group', 'armature_bone'], hide_in_screenshot: true };
        }
        ParticleEffectElement = LightflowParticleEffectElement;
        Object.assign(ParticleEffectElement.prototype, { title: 'Particle Effect', type: 'lightflow_particle_effect',
            icon: 'ac_unit', movable: true, rotatable: true, needsUniqueName: true,
            name_regex: () => window.Format?.node_name_regex ?? 'a-zA-Z0-9_' });
        ParticleEffectElement.prototype.buttons = [Outliner.buttons.export, Outliner.buttons.locked, Outliner.buttons.visibility];
        ParticleEffectElement.prototype.menu = new Menu(['lightflow_particle_replace', 'lightflow_particle_texture', 'lightflow_particle_settings', '_',
            ...Outliner.control_menu_group, '_', 'rename', 'delete']);
        for (const [key, type, value] of [['name', 'string', 'Particle Effect'], ['position', 'vector', [0, 16, 0]],
            ['rotation', 'vector', [0, 0, 0]], ['visibility', 'boolean', true], ['enabled', 'boolean', true],
            ['export', 'boolean', true], ['locked', 'boolean', false], ['particle_size', 'number', 1],
            ['particle_playing', 'boolean', true], ['particle_loop', 'boolean', true], ['particle_time', 'number', 0.5],
            ['particle_preview_mode','string','auto'],
            ['particle_bloom', 'number', 0],
            ['particle_json', 'string', ''], ['particle_path', 'string', ''], ['particle_texture', 'string', '']]) {
            deletables.push(new Property(ParticleEffectElement, type, key, { default: value }));
        }
        allowAnimationModeInspection(ParticleEffectElement);
        const reloadedParticleElements = prepareReloadedAtmosphereElements(ParticleEffectElement, 'lightflow_particle_effect');
        OutlinerElement.registerType(ParticleEffectElement, 'lightflow_particle_effect');
        publishWindowBinding('LightflowParticleEffectElement', ParticleEffectElement);
        let transportElement=null;
        const transportChanged=()=>window.dispatchEvent(new Event('lightflow_particle_transport_changed'));
        const transportSelected=()=>ParticleEffectElement.selected.length===1?ParticleEffectElement.selected[0]:null;
        const transportCommit=(element,values)=>{
            if(!element||!ParticleEffectElement.all.includes(element))return;
            const changed=Object.keys(values).some(key=>element[key]!==values[key]);if(!changed)return;
            Undo.initEdit({elements:[element]});element.extend(values);Undo.finishEdit(uiText('edit_particle'));
            syncParticleEffect(element);syncParticlePanel();requestPreviewRender();transportChanged();
        };
        const transport={
            state(){
                const element=transportSelected();if(!element)return null;
                const record=particleEffectRecords.get(element.uuid),config=record?.config;
                const time=element.particle_playing?Math.max(0,finite(record?.emitter?.view_age,element.particle_time)):element.particle_time;
                return{uuid:element.uuid,name:element.name,playing:element.particle_playing,time,
                    loop:element.particle_preview_mode==='looping'||(element.particle_preview_mode!=='once'&&(element.particle_loop||config?.emitter_lifetime_mode==='looping')),
                    max:Math.max(10,Math.ceil(time),finite(record?.emitter?.active_time,1)+finite(record?.emitter?.sleep_time,0)+finite(config?.particle_lifetime_max_lifetime,1)),
                    available:!!record?.valid&&element.visibility!==false};
            },
            toggle(){
                const element=transportSelected();if(!element)return;
                const playing=!element.particle_playing,record=particleEffectRecords.get(element.uuid);
                transportCommit(element,{enabled:true,particle_playing:playing,particle_time:playing?element.particle_time:Math.max(0,finite(record?.emitter?.view_age,element.particle_time))});
            },
            restart(){const element=transportSelected();if(!element)return;transportCommit(element,{particle_time:0});restartParticleEffect(element);syncParticlePanel();transportChanged();},
            loop(){const element=transportSelected();if(!element)return;const loop=!this.state().loop;transportCommit(element,{particle_loop:loop,particle_preview_mode:loop?'looping':'once'});},
            begin(){if(transportElement)return true;if(beginParticlePanelUndo())transportElement=transportSelected();return !!transportElement;},
            seek(value){
                const element=transportElement||transportSelected();if(!element)return;
                const time=Math.max(0,finite(value,0));
                if(transportElement){
                    if(element.particle_time===time&&!element.particle_playing)return;
                    element.extend({particle_time:time,particle_playing:false});if(particlePanelUndo)particlePanelUndo.changed=true;
                    syncParticleEffect(element);requestPreviewRender();transportChanged();
                }else transportCommit(element,{particle_time:time,particle_playing:false});
            },
            end(){if(!transportElement)return;transportElement=null;finishParticlePanelUndo();syncParticlePanel();transportChanged();}
        };
        publishWindowBinding('LightflowParticleTransport',transport);
        deletables.push(Blockbench.on('update_selection',()=>{if(transportElement&&transportSelected()!==transportElement)transport.end();}),{delete(){transportElement=null;}});
        particleEffectController = new NodePreviewController(ParticleEffectElement, {
            setup(element) {
                const node = new THREE.Object3D();
                node.name = element.uuid; node.type = element.type; node.isElement = true;
                node.geometry = new THREE.BufferGeometry();
                node.geometry.boundingBox = new THREE.Box3().makeEmpty();
                node.particleGizmo = new THREE.LineSegments(
                    new THREE.BufferGeometry(),
                    new THREE.LineBasicMaterial({ color: 0x78ddff, transparent: true, opacity: 0.7, depthWrite: false })
                );
                node.particleGizmo.name = 'lightflow_particle_gizmo';
                node.particleGizmo.raycast = () => {};
                node.particleOrigin = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(-.5,0,0),new THREE.Vector3(.5,0,0),new THREE.Vector3(0,-.5,0),new THREE.Vector3(0,.5,0),new THREE.Vector3(0,0,-.5),new THREE.Vector3(0,0,.5)
                ]),new THREE.LineBasicMaterial({color:0x78ddff,transparent:true,opacity:.7,depthTest:false,depthWrite:false}));
                node.particleOrigin.raycast=()=>{};node.particleOrigin.renderOrder=1100;
                node.particleOrigin.onBeforeRender=(renderer,_scene,camera)=>updateParticleHelper(element,particleEffectRecords.get(element.uuid),camera,renderer);
                node.particleSelection = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2),
                    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
                node.particleSelection.name = element.uuid;
                node.particleSelection.type = element.type;
                node.particleSelection.isElement = true;
                node.particleSelection.userData.lightflowNoShadow = true;
                node.particleSelection.userData.lightflowVolumeSelectionProxy = true;
                node.add(node.particleGizmo, node.particleOrigin, node.particleSelection);
                node.raycast = (raycaster, hits) => {
                    if (!node.particleSelection.visible || !node.visible) return;
                    node.particleSelection.updateWorldMatrix(true, false);
                    node.particleSelection.raycast(raycaster, hits);
                };
                Project.nodes_3d[element.uuid] = node;
                this.updateTransform(element);
                syncParticleEffect(element);
                this.dispatchEvent('setup', { element });
            },
            updateTransform(element) {
                NodePreviewController.prototype.updateTransform.call(this, element);
                syncParticleEffect(element);
                requestPreviewRender();
                this.dispatchEvent('update_transform', { element });
            },
            remove(element) {
                releaseParticleEffect(element.uuid);
                const node = element.mesh;
                NodePreviewController.prototype.remove.call(this, element);
                node?.particleGizmo?.geometry?.dispose?.();
                node?.particleGizmo?.material?.dispose?.();
                node?.particleOrigin?.geometry?.dispose?.();
                node?.particleOrigin?.material?.dispose?.();
                node?.particleSelection?.geometry?.dispose?.();
                node?.particleSelection?.material?.dispose?.();
            },
            updateSelection(element) { syncParticleEffect(element); this.dispatchEvent('update_selection', { element }); }
        });
        rebuildReloadedAtmosphereElementPreviews(reloadedParticleElements, particleEffectController);
        const addAction = new Action('lightflow_particle_import', { name: 'lightflow_atmosphere.action.add_particle',
            icon: 'ac_unit', category: 'edit', condition: () => !!window.Project && !!(Modes.edit || Modes.render), click: () => importParticleJSON() });
        deletables.push(Blockbench.on('lightflow_resource_packs_changed', event => {
            if (event?.project && event.project !== window.Project) return;
            for (const element of ParticleEffectElement.all) {
                if (element.particle_texture) continue;
                releaseParticleEffect(element.uuid);
                syncParticleEffect(element);
            }
            requestPreviewRender();
        }));
        const replaceAction = new Action('lightflow_particle_replace', { name: 'Replace Particle Effect', icon: 'upload_file',
            category: 'edit', condition: () => !!ParticleEffectElement.selected.length,
            click: () => importParticleJSON(ParticleEffectElement.selected[0]) });
        const textureAction = new Action('lightflow_particle_texture', { name: 'Set Particle Texture', icon: 'image',
            category: 'edit', condition: () => !!ParticleEffectElement.selected.length,
            click: () => importParticleTexture(ParticleEffectElement.selected[0]) });
        const settingsAction = new Action('lightflow_particle_settings', { name: 'Particle Effect Settings', icon: 'tune',
            category: 'edit', condition: () => !!ParticleEffectElement.selected.length,
            click() {
                const element = ParticleEffectElement.selected[0];
                new Dialog('lightflow_particle_settings_dialog', { title: 'Particle Effect', form: (window.LightManagerUI?.prepareForm || (form => form))({
                    enabled: { label: 'Enabled', type: 'checkbox', value: element.enabled },
                    particle_playing: { label: 'Play animation', type: 'checkbox', value: element.particle_playing },
                    particle_loop: { label: 'Repeat one-shot effect', type: 'checkbox', value: element.particle_loop },
                    particle_time: { label: 'Preview time (s)', type: 'number', value: element.particle_time, min: 0, max: 3600, step: 0.1 },
                    particle_size: { label: 'Size', type: 'number', value: element.particle_size, min: 0.01, max: 100, step: 0.1 },
                    particle_bloom: { label: 'Bloom', type: 'number', value: element.particle_bloom, min: 0, max: 8, step: 0.1 }
                }), onConfirm(result) {
                    if(result.particle_loop!==element.particle_loop)result.particle_preview_mode='auto';
                    Undo.initEdit({ elements: [element] });
                    element.extend(result);
                    Undo.finishEdit('Edit particle effect');
                    syncParticleEffect(element);
                } }).show();
            } });
        const jsonAction = new Action('lightflow_particle_edit_json', { name: 'Edit Particle JSON / Molang', icon: 'code',
            category: 'edit', condition: () => !!ParticleEffectElement.selected.length,
            click: () => editParticleJSON(ParticleEffectElement.selected[0]) });
        const createAction=new Action('lightflow_particle_create',{name:'lightflow_atmosphere.action.add_particle',icon:'ac_unit',category:'edit',condition:()=>!!Project && !!(Modes.edit || Modes.render),children:()=>particlePresetItems(null)});
        const reloadAction = new Action('lightflow_particle_reload', {name:uiText('reload'),icon:'refresh',category:'edit',
            condition:()=>!!ParticleEffectElement.selected.length,click:()=>{
                for(const element of ParticleEffectElement.selected.slice())reloadParticleEffect(element);
                requestPreviewRender();
            }});
        deletables.push(reloadAction);
        const snowstormAction=new Action('lightflow_particle_snowstorm',{name:'lightflow_atmosphere.ui.snowstorm',icon:'open_in_new',category:'edit',condition:()=>!!ParticleEffectElement.selected.length,click:()=>openParticleSnowstorm(ParticleEffectElement.selected[0])});
        ParticleEffectElement.prototype.menu = new Menu(['lightflow_particle_snowstorm', 'lightflow_particle_settings', 'lightflow_particle_edit_json',
            'lightflow_particle_replace', 'lightflow_particle_reload', 'lightflow_particle_texture', '_', ...Outliner.control_menu_group, '_', 'rename', 'delete']);
        deletables.push(addAction, replaceAction, textureAction, settingsAction, jsonAction,createAction,snowstormAction);
        particleEffectPanel = new Panel('lightflow_particle_properties', { name: 'lightflow_atmosphere.ui.particles', icon: 'ac_unit',
            growable: true, resizable: true,
            condition: { modes: ['render'], project: true },
            default_position: { slot: 'right_bar', height: 460, folded: false, attached_to: 'light_properties', attached_index: 3 },
            form: (window.LightManagerUI?.prepareForm || (form => form))(particlePanelForm(null)) });
        const panelChange = particleEffectPanel.form.on('change', ({ result, changed_keys }) => {
            if (particlePanelSyncing) return;
            const keys = changed_keys?.length ? changed_keys : Object.keys(result);
            if (keys.includes('_particle_tab')) { particlePanelTab = result._particle_tab; syncParticlePanel(); return; }
            if (keys.includes('_particle_source')) particleSourceOpen = result._particle_source===true;
            if(keys.includes('_distribution'))particleDistributionOpen=result._distribution===true;
            if(keys.includes('_motion'))particleMotionOpen=result._motion===true;
            if(keys.includes('_behaviour'))particleBehaviourOpen=result._behaviour===true;
            const element = ParticleEffectElement.selected[0];
            if (!element) return;
            const propKeys = ['name', 'enabled', 'particle_playing', 'particle_loop', 'particle_time', 'particle_size', 'particle_bloom','particle_texture'];
            const sourceKeys = ['spawn_rate', 'max_particles', 'active_time', 'sleep_time','emitter_cycle','lifetime', 'speed', 'size_x', 'size_y', 'color','emitter_shape','emitter_dimensions','emitter_radius','acceleration','drag'];
            const changed = keys.some(key => (propKeys.includes(key) && result[key] !== element[key]) ||
                (sourceKeys.includes(key) && particleJSONControls(element).values[key] !== result[key]));
            if (!changed) return;
            const directUndo = !particlePanelUndo && beginParticlePanelUndo();
            const props = {};
            for (const key of keys) if (propKeys.includes(key)) props[key] = result[key];
            // Scrubbing is a still-frame operation; pause automatically instead
            // of letting the running emitter ignore the entered time.
            if (keys.includes('particle_time')) props.particle_playing = false;
            if(keys.includes('particle_loop'))props.particle_preview_mode='auto';
            if(keys.includes('emitter_cycle')){props.particle_loop=false;props.particle_preview_mode='auto';}
            if (keys.includes('particle_playing') && result.particle_playing === false && element.particle_playing) {
                props.particle_time = Math.max(0, finite(particleEffectRecords.get(element.uuid)?.emitter?.view_age,
                    element.particle_time));
            }
            if (Object.keys(props).length) element.extend(props);
            for (const key of keys) if (sourceKeys.includes(key)) applyParticleJSONControl(element, key, result[key]);
            if (particlePanelUndo) particlePanelUndo.changed = true;
            if (directUndo) finishParticlePanelUndo();
            syncParticleEffect(element); requestPreviewRender();
            if(keys.includes('emitter_shape')||keys.includes('emitter_cycle'))syncParticlePanel();
        });
        deletables.push(panelChange, particleEffectPanel,
            window.LightManagerUI.addDesignedPanelStyles('lightflow_particle_properties', { row_padding: '3px 4px' }));
        window.LightManagerUI.workspace?.register(particleEffectPanel);
        deletables.push(Blockbench.on('update_selection', syncParticlePanel));
        deletables.push(Blockbench.on('update_view', () => ParticleEffectElement.all.forEach(syncParticleEffect)));
        const refreshHelpers = () => ParticleEffectElement.all.forEach(syncParticleEffect);
        window.addEventListener('lightflow_gizmo_visibility_changed', refreshHelpers);
        deletables.push({ delete() { window.removeEventListener('lightflow_gizmo_visibility_changed', refreshHelpers); } });
    }

    function disposeParticleEffectElement() {
        clearParticleEffects();
        if (ParticleEffectElement) {
            for (const project of window.ModelProject?.all || [window.Project]) {
                for (const element of project?.elements || []) {
                    if (element.type !== 'lightflow_particle_effect') continue;
                    const node = project.nodes_3d?.[element.uuid];
                    node?.particleGizmo?.geometry?.dispose?.();
                    node?.particleGizmo?.material?.dispose?.();
                    node?.particleOrigin?.geometry?.dispose?.();
                    node?.particleOrigin?.material?.dispose?.();
                    node?.particleSelection?.geometry?.dispose?.();
                    node?.particleSelection?.material?.dispose?.();
                    node?.geometry?.dispose?.();
                    node?.parent?.remove?.(node);
                    if (node) delete project.nodes_3d[element.uuid];
                }
            }
            if (OutlinerElement.types.lightflow_particle_effect === ParticleEffectElement) delete OutlinerElement.types.lightflow_particle_effect;
        }
        if (NodePreviewController.controllers?.lightflow_particle_effect === particleEffectController) particleEffectController.delete();
        particleEffectScene = null; ParticleEffectElement = null; particleEffectController = null; particleEffectPanel = null;
    }

    function registerVolumeElement() {
        class LightflowVolumeElement extends OutlinerElement {
            constructor(data, uuid) {
                super(data, uuid);
                for (const key in LightflowVolumeElement.properties) LightflowVolumeElement.properties[key].reset(this);
                if (data && typeof data === 'object') this.extend(data);
                const legacyGodRays = data && !Object.prototype.hasOwnProperty.call(data, 'composite_mode') &&
                    this.density_mode === 'uniform' && finite(this.scattering_strength, 0) >= 1.15 &&
                    finite(this.absorption, 1) <= 0.05 && finite(this.anisotropy, 0) >= 0.55 &&
                    finite(this.ambient, 1) <= 0.02;
                if (legacyGodRays) {
                    this.composite_mode = 'shafts';
                    this.shadow_fill = 0;
                    this.ambient = 0;
                }
                sanitizeVolume(this);
            }

            get origin() { return this.position; }
            getWorldCenter() { return this.mesh.getWorldPosition(new THREE.Vector3()); }

            resize(value, axis, negative, allowNegative, bidirectional) {
                if (axis < 0 || axis > 2) return this;

                const oldSize = this.temp_data.old_size || this.size;
                const initialSize = Math.max(0.01, Math.abs(finite(oldSize[axis], this.size[axis])));
                const modify = value instanceof Function ? value : size => size + finite(value, 0);
                // A Volume Domain is already centered on its origin. Blockbench's
                // NumSlider and resize gizmo both pass the requested dimension
                // through `modify`; doubling that delta made a typed 32 jump to
                // 0.01/63.99. Change only the dimension and keep the origin fixed.
                const requestedSize = value instanceof Function
                    ? modify(initialSize)
                    : initialSize + (negative ? -finite(value, 0) : finite(value, 0));
                const nextSize = Math.max(0.01, Math.abs(finite(requestedSize, initialSize)));
                this.size[axis] = nextSize;

                this.preview_controller.updateTransform(this);
                TickUpdates.selection = true;
                return this;
            }

            extend(object) {
                for (const key in LightflowVolumeElement.properties) LightflowVolumeElement.properties[key].merge(this, object);
                sanitizeVolume(this);
                this.sanitizeName();
                return this;
            }

            getUndoCopy() {
                const copy = new LightflowVolumeElement(this);
                copy.uuid = this.uuid;
                delete copy.parent;
                return copy;
            }

            getSaveCopy() {
                const copy = {};
                for (const key in LightflowVolumeElement.properties) LightflowVolumeElement.properties[key].copy(this, copy);
                copy.type = 'lightflow_volume';
                copy.uuid = this.uuid;
                return copy;
            }

            select(event, isOutlinerClick) {
                super.select(event, isOutlinerClick);
                updateVolumeGizmo(this);
                syncAtmospherePanel();
                return this;
            }

            unselect(...args) {
                super.unselect(...args);
                updateVolumeGizmo(this);
                syncAtmospherePanel();
            }

            static behavior = {
                unique_name: true,
                movable: true,
                rotatable: true,
                resizable: true,
                hide_in_screenshot: true
            };
        }

        VolumeElement = LightflowVolumeElement;
        publishWindowBinding('LightflowVolumeElement', VolumeElement);
        VolumeElement.prototype.title = 'Volume Domain';
        VolumeElement.prototype.type = 'lightflow_volume';
        VolumeElement.prototype.icon = 'blur_on';
        VolumeElement.prototype.movable = true;
        VolumeElement.prototype.rotatable = true;
        VolumeElement.prototype.resizable = true;
        VolumeElement.prototype.needsUniqueName = true;
        VolumeElement.prototype.name_regex = () => window.Format?.node_name_regex ?? 'a-zA-Z0-9_';
        VolumeElement.prototype.menu = new Menu([
            'edit_lightflow_volume',
            'fit_lightflow_volume',
            '_',
            ...Outliner.control_menu_group,
            '_',
            'rename',
            'delete'
        ]);
        VolumeElement.prototype.buttons = [Outliner.buttons.export, Outliner.buttons.locked, Outliner.buttons.visibility];

        const volumeProperties = [
            new Property(VolumeElement, 'string', 'name', { default: 'Volume Domain' }),
            new Property(VolumeElement, 'string', 'shape', { default: 'box' }),
            new Property(VolumeElement, 'string', 'density_mode', { default: 'uniform' }),
            new Property(VolumeElement, 'string', 'composite_mode', { default: 'physical' }),
            new Property(VolumeElement, 'vector', 'position'),
            new Property(VolumeElement, 'vector', 'rotation'),
            new Property(VolumeElement, 'vector', 'size', { default: [32, 16, 32] }),
            new Property(VolumeElement, 'boolean', 'visibility', { default: true }),
            new Property(VolumeElement, 'boolean', 'enabled', { default: true }),
            new Property(VolumeElement, 'number', 'density', { default: 0.04, min: 0 }),
            new Property(VolumeElement, 'vector', 'scattering_color', { default: [232, 240, 255] }),
            new Property(VolumeElement, 'number', 'scattering_strength', { default: 0.9, min: 0 }),
            new Property(VolumeElement, 'vector', 'absorption_color', { default: [235, 242, 255] }),
            new Property(VolumeElement, 'number', 'absorption', { default: 0.18, min: 0 }),
            new Property(VolumeElement, 'number', 'anisotropy', { default: 0.35 }),
            new Property(VolumeElement, 'number', 'ambient', { default: 0.12, min: 0 }),
            new Property(VolumeElement, 'number', 'shadow_fill', { default: 0.1, min: 0 }),
            new Property(VolumeElement, 'boolean', 'receive_shadows', { default: true }),
            new Property(VolumeElement, 'number', 'edge_feather', { default: 0.12, min: 0 }),
            new Property(VolumeElement, 'number', 'height_falloff', { default: 1.2, min: 0 }),
            new Property(VolumeElement, 'number', 'height_offset', { default: 0.1, min: 0 }),
            new Property(VolumeElement, 'number', 'noise_scale', { default: 3.2, min: 0.01 }),
            new Property(VolumeElement, 'number', 'noise_detail', { default: 3, min: 1 }),
            new Property(VolumeElement, 'number', 'coverage', { default: 0.45, min: 0 }),
            new Property(VolumeElement, 'number', 'erosion', { default: 0.22, min: 0.01 }),
            new Property(VolumeElement, 'vector', 'wind_direction', { default: [1, 0, 0] }),
            new Property(VolumeElement, 'number', 'wind_speed', { default: 0 }),
            new Property(VolumeElement, 'number', 'schema_version', { default: 2 }),
            new Property(VolumeElement, 'string', 'technique_override', { default: 'auto' }),
            new Property(VolumeElement, 'string', 'intent', { default: '' }),
            new Property(VolumeElement, 'string', 'light_uuid', { default: '' }),
            new Property(VolumeElement, 'string', 'light_type', { default: '' }),
            new Property(VolumeElement, 'number', 'shaft_length', { default: 0.78, min: 0.05 }),
            new Property(VolumeElement, 'number', 'shaft_decay', { default: 0.93, min: 0.5 }),
            new Property(VolumeElement, 'number', 'shaft_radius', { default: 0.82, min: 0.05 }),
            new Property(VolumeElement, 'number', 'shaft_exposure', { default: 1, min: 0 })
        ];
        deletables.push(...volumeProperties);

        allowAnimationModeInspection(VolumeElement);
        const reloadedVolumeElements = prepareReloadedAtmosphereElements(VolumeElement, 'lightflow_volume');
        OutlinerElement.registerType(VolumeElement, 'lightflow_volume');

        volumePreviewController = new NodePreviewController(VolumeElement, {
            setup(element) {
                const mesh = new THREE.Object3D();
                Project.nodes_3d[element.uuid] = mesh;
                mesh.name = element.uuid;
                mesh.type = element.type;
                mesh.isElement = true;
                mesh.userData = mesh.userData || {};
                mesh.userData.lightflowNoShadow = true;
                mesh.rotation.order = window.Format?.euler_order || 'ZYX';

                const lineMaterial = new THREE.LineBasicMaterial({
                    color: 0x67d7e8,
                    transparent: true,
                    opacity: 0.42,
                    depthTest: true,
                    depthWrite: false
                });
                const boxSourceGeometry = new THREE.BoxGeometry(1, 1, 1);
                const sphereSourceGeometry = new THREE.SphereGeometry(0.5, 16, 10);
                const boxGeometry = new THREE.EdgesGeometry(boxSourceGeometry);
                const sphereGeometry = window.LightManagerUI?.gizmos?.sphereOutline?.() || new THREE.WireframeGeometry(sphereSourceGeometry);
                boxSourceGeometry.dispose();
                sphereSourceGeometry.dispose();
                mesh.boxGizmo = new THREE.LineSegments(boxGeometry, lineMaterial);
                mesh.sphereGizmo = new THREE.LineSegments(sphereGeometry, lineMaterial.clone());
                mesh.boxGizmo.raycast = () => { };
                mesh.sphereGizmo.raycast = () => { };
                [mesh.boxGizmo, mesh.sphereGizmo].forEach(gizmo => {
                    gizmo.onBeforeRender = () => window.LightManagerUI?.gizmos?.style?.(gizmo, 'outline', !!element.selected);
                });
                mesh.add(mesh.boxGizmo, mesh.sphereGizmo);

                const selectionMaterial = new THREE.MeshBasicMaterial({
                    transparent: true,
                    opacity: 0,
                    colorWrite: false,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
                mesh.boxSelection = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), selectionMaterial);
                mesh.sphereSelection = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), selectionMaterial.clone());
                [mesh.boxSelection, mesh.sphereSelection].forEach(proxy => {
                    proxy.name = element.uuid;
                    proxy.type = element.type;
                    proxy.isElement = true;
                    proxy.castShadow = false;
                    proxy.receiveShadow = false;
                    proxy.userData = proxy.userData || {};
                    proxy.userData.lightflowNoShadow = true;
                    proxy.userData.lightflowVolumeSelectionProxy = true;
                });
                mesh.add(mesh.boxSelection, mesh.sphereSelection);
                mesh.geometry = new THREE.BufferGeometry();
                mesh.geometry.boundingBox = new THREE.Box3().makeEmpty();
                mesh.raycast = function (raycaster, intersects) {
                    const proxy = element.shape === 'sphere' ? this.sphereSelection : this.boxSelection;
                    if (!canShowVolumeGizmos() || !proxy || this.visible === false) return;
                    proxy.updateMatrixWorld(true);
                    proxy.raycast(raycaster, intersects);
                };
                this.updateTransform(element);
                this.dispatchEvent('setup', { element });
            },
            updateTransform(element) {
                NodePreviewController.prototype.updateTransform.call(this, element);
                updateVolumeGizmo(element);
                AtmosphereManager.invalidateDepthCache();
                requestPreviewRender();
                this.dispatchEvent('update_transform', { element });
            },
            updateSelection(element) {
                updateVolumeGizmo(element);
                this.dispatchEvent('update_selection', { element });
            }
        });
        rebuildReloadedAtmosphereElementPreviews(reloadedVolumeElements, volumePreviewController);
    }

    function getSelectedVolumes() {
        return VolumeElement && Array.isArray(VolumeElement.selected) ? VolumeElement.selected.slice() : [];
    }

    function findSelectionBounds() {
        const selected = getSelectedRenderElements();
        return findRenderElementBounds(selected);
    }

    function findRenderElementBounds(elements) {
        if (!Array.isArray(elements) || !elements.length) return null;
        const bounds = new THREE.Box3();
        let found = false;
        elements.forEach(cube => {
            const mesh = getCubeMesh(cube);
            if (!mesh) return;
            mesh.updateMatrixWorld?.(true);
            bounds.expandByObject(mesh);
            found = true;
        });
        if (!found || bounds.isEmpty()) return null;
        return bounds;
    }

    function findSceneBounds() {
        const sceneElements = [];
        if (Array.isArray(window.Cube?.all)) sceneElements.push(...Cube.all);
        if (Array.isArray(window.Mesh?.all)) sceneElements.push(...Mesh.all);
        return findRenderElementBounds(sceneElements.filter(element => element?.visibility !== false));
    }

    function fitVolumeToSelection(volume, padding) {
        const bounds = findSelectionBounds();
        if (!volume || !bounds) return false;
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const extra = Math.max(0, finite(padding, 2));
        volume.position = [center.x, center.y, center.z];
        volume.rotation = [0, 0, 0];
        volume.size = [Math.max(0.1, size.x + extra * 2), Math.max(0.1, size.y + extra * 2), Math.max(0.1, size.z + extra * 2)];
        VolumeElement.preview_controller?.updateTransform(volume);
        return true;
    }

    function applyVolumeConfig(volume, config) {
        if (!volume || !config) return;
        const transformKeys = new Set(['position', 'rotation', 'size', 'shape', 'visibility']);
        let transformChanged = false;
        Object.keys(config).forEach(key => {
            if (!VolumeElement.properties[key]) return;
            volume[key] = Array.isArray(config[key]) ? config[key].slice() : config[key];
            if (transformKeys.has(key)) transformChanged = true;
        });
        sanitizeVolume(volume);
        if (Object.prototype.hasOwnProperty.call(config, 'name')) volume.sanitizeName?.();
        if (transformChanged) {
            VolumeElement.preview_controller?.updateTransform(volume);
        } else {
            updateVolumeGizmo(volume);
            AtmosphereManager.invalidateVolumeCache();
        }
        VolumeElement.preview_controller?.updateSelection(volume);
    }

    function applyPresetArtDirection(preset) {
        if (!preset) return false;
        const mapping = {
            max_opacity: 'art_max_opacity', saturation: 'art_saturation', contrast: 'art_contrast',
            posterize: 'art_posterize', dither: 'art_dither', color_quantization: 'art_color_quantization',
            near_color: 'art_near_color', far_color: 'art_far_color',
            fog_ramp_strength: 'art_ramp_strength', fog_ramp_curve: 'art_ramp_curve',
            bloom_contribution: 'art_bloom_response'
        };
        let changed = false;
        const next = { ...AtmosphereManager.settings };
        Object.entries(mapping).forEach(([presetKey, settingKey]) => {
            if (!Object.prototype.hasOwnProperty.call(preset, presetKey)) return;
            next[settingKey] = Array.isArray(preset[presetKey]) ? preset[presetKey].slice() : preset[presetKey];
            changed = true;
        });
        if (!changed) return false;
        AtmosphereManager.settings = next;
        saveSettings(next);
        persistProjectSettings();
        AtmosphereManager.invalidateSceneCache();
        return true;
    }

    function nextLocalizedVolumeName() {
        const base = tr('lightflow_atmosphere.name.volume', 'Volume Domain');
        const used = new Set((VolumeElement?.all || []).map(item => String(item?.name || '').toLocaleLowerCase()));
        let index = 1;
        let candidate;
        do {
            candidate = `${base} ${String(index++).padStart(2, '0')}`;
        } while (used.has(candidate.toLocaleLowerCase()));
        return candidate;
    }

    function createVolume(presetKey) {
        try {
            if (!localStorage.getItem('lightflow_creation_guide_v1_volume')) {
                localStorage.setItem('lightflow_creation_guide_v1_volume', 'pending');
            }
        } catch (_) { /* Keep volume creation usable when storage is unavailable. */ }
        Undo.initEdit({ outliner: true, elements: [], selection: true });
        const volume = new VolumeElement({ name: nextLocalizedVolumeName() }).addTo().init();
        const preset = VOLUME_PRESETS[presetKey] || VOLUME_PRESETS.soft_mist;
        applyVolumeConfig(volume, preset);
        applyPresetArtDirection(preset);
        // Capture the model selection before selecting the new domain. Reuse
        // the existing fit operation inside this creation's single Undo entry.
        const fitted = fitVolumeToSelection(volume, 2);
        const bounds = !fitted && findSceneBounds();
        if (bounds) {
            const center = bounds.getCenter(new THREE.Vector3());
            volume.position = [center.x, center.y, center.z];
            VolumeElement.preview_controller?.updateTransform(volume);
        } else if (!fitted) {
            volume.position = [0, 8, 0];
            VolumeElement.preview_controller?.updateTransform(volume);
        }
        unselectAll();
        volume.select();
        Undo.finishEdit(tr('lightflow_atmosphere.undo.add', 'Add Volume Domain'), { outliner: true, elements: [volume], selection: true });
        Blockbench.dispatchEvent?.('add_lightflow_volume', { object: volume });
        syncAtmospherePanel();
        requestPreviewRender();
        return volume;
    }

    const ATMOSPHERE_DIALOG_SECTIONS = {
        _domain: { label: 'lightflow_atmosphere.group.domain', icon: 'blur_on' },
        _optics: { label: 'lightflow_atmosphere.group.optics', icon: 'lens_blur' },
        _density_shape: { label: 'lightflow_atmosphere.group.shape', icon: 'gradient' },
        _art_direction: { label: 'lightflow_atmosphere.group.art_direction', icon: 'palette' },
        _viewport: { label: 'lightflow_atmosphere.group.viewport', icon: 'visibility' },
        _render: { label: 'lightflow_atmosphere.group.render', icon: 'photo_camera' },
        _advanced: { label: 'lightflow_atmosphere.group.performance', icon: 'speed' }
    };

    const ATMOSPHERE_SELECT_ICONS = {
        preset: { custom: 'tune', soft_mist: 'blur_on', godrays: 'lightflow:godray', clouds: 'cloud', stage_haze: 'filter_hdr', cinematic_dust: 'auto_awesome' },
        shape: { box: 'check_box_outline_blank', sphere: 'circle' },
        density_mode: { uniform: 'blur_on', height: 'gradient', cloud: 'cloud' },
        composite_mode: { physical: 'air', shafts: 'lightflow:godray' },
        preview_quality: { draft: 'speed', balanced: 'balance', high: 'high_quality', ultra: 'auto_awesome' },
        render_quality: { draft: 'speed', balanced: 'balance', high: 'high_quality', ultra: 'auto_awesome', reference: 'diamond' }
    };

    function getAtmosphereFormUI() {
        const api = window.LightManagerUI;
        const required = [
            'bar_display', 'combo_slider', 'compact_select', 'enum_select',
            'compact_text', 'advanced_color', 'custom_checkbox', 'custom_vector', 'panel_search'
        ];
        return api && api.formDesign && typeof api.addDesignedPanelStyles === 'function' &&
            required.every(type => api.formElementTypes?.includes(type)) ? api : null;
    }

    function getAtmosphereSelectOptions(key, options) {
        const source = typeof options === 'function' ? options() : (options || {});
        const iconMap = ATMOSPHERE_SELECT_ICONS[key] || {};
        return Object.fromEntries(Object.entries(source).map(([optionKey, option]) => {
            if (option && typeof option === 'object') {
                return [optionKey, {
                    ...option,
                    name: tr(option.name || optionKey, option.name || optionKey),
                    icon: option.icon || iconMap[optionKey] || 'tune'
                }];
            }
            return [optionKey, {
                name: tr(option, option || optionKey),
                icon: iconMap[optionKey] || 'tune'
            }];
        }));
    }

    function enhanceAtmosphereDialogForm(form) {
        if (!getAtmosphereFormUI()) return form;
        const enhanced = {};
        Object.entries(form).forEach(([key, original]) => {
            const section = ATMOSPHERE_DIALOG_SECTIONS[key];
            if (section) {
                enhanced[`atmosphere_section${key}`] = {
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
                    options: getAtmosphereSelectOptions(key, original.options),
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
            enhanced[key] = original;
        });
        return enhanced;
    }

    function addAtmosphereDialogStyles() {
        const style = Blockbench.addCSS(`
            #lightflow_atmosphere_volume_dialog .dialog_content,
            #lightflow_atmosphere_settings_dialog .dialog_content {
                scrollbar-gutter: stable;
            }
            #lightflow_atmosphere_volume_dialog [class*="form_bar_atmosphere_section_"],
            #lightflow_atmosphere_settings_dialog [class*="form_bar_atmosphere_section_"] {
                min-height: 34px;
                margin: 10px 0 4px;
                padding: 0 8px;
                border-left: 3px solid var(--color-accent);
                border-bottom: 1px solid var(--color-border);
                background: color-mix(in srgb, var(--color-ui) 84%, var(--color-back));
            }
            #lightflow_atmosphere_volume_dialog [class*="form_bar_atmosphere_section_"]:first-child,
            #lightflow_atmosphere_settings_dialog [class*="form_bar_atmosphere_section_"]:first-child {
                margin-top: 0;
            }
            #lightflow_atmosphere_volume_dialog [class*="form_bar_atmosphere_section_"] .bar_display,
            #lightflow_atmosphere_settings_dialog [class*="form_bar_atmosphere_section_"] .bar_display {
                justify-content: flex-start;
                gap: 7px;
                font-weight: 600;
            }
            #lightflow_atmosphere_volume_dialog .compact_dropdown_select:focus-visible,
            #lightflow_atmosphere_volume_dialog .custom_checkbox:focus-visible,
            #lightflow_atmosphere_settings_dialog .compact_dropdown_select:focus-visible,
            #lightflow_atmosphere_settings_dialog .custom_checkbox:focus-visible {
                outline: 2px solid var(--color-accent);
                outline-offset: 2px;
            }
            #lightflow_atmosphere_volume_dialog .custom_checkbox:hover,
            #lightflow_atmosphere_settings_dialog .custom_checkbox:hover {
                background: var(--color-button);
            }
        `);
        deletables.push(style);
    }

    function volumeDialogForm(volume) {
        return enhanceAtmosphereDialogForm({
            _domain: '_',
            preset: {
                type: 'select',
                label: 'lightflow_atmosphere.field.preset',
                value: 'custom',
                options: VOLUME_PRESET_OPTIONS
            },
            name: { type: 'text', label: 'generic.name', value: volume.name },
            enabled: { type: 'checkbox', label: 'lightflow_atmosphere.field.enabled', value: volume.enabled !== false },
            shape: {
                type: 'select', label: 'lightflow_atmosphere.field.shape', value: volume.shape,
                options: { box: 'lightflow_atmosphere.option.box', sphere: 'lightflow_atmosphere.option.sphere' }
            },
            size: { type: 'vector', dimensions: 3, label: 'lightflow_atmosphere.field.size', value: volume.size, min: 0.01 },
            density_mode: {
                type: 'select', label: 'lightflow_atmosphere.field.density_mode', value: volume.density_mode,
                options: { uniform: 'lightflow_atmosphere.option.uniform', height: 'lightflow_atmosphere.option.height', cloud: 'lightflow_atmosphere.option.cloud' }
            },
            composite_mode: {
                type: 'select', label: 'lightflow_atmosphere.field.composite_mode', value: volume.composite_mode,
                options: { physical: 'lightflow_atmosphere.option.physical', shafts: 'lightflow_atmosphere.option.shafts' }
            },
            _optics: '_',
            density: { type: 'number', label: 'lightflow_atmosphere.field.density', value: volume.density, min: 0, max: 4, step: 0.001 },
            scattering_color: { type: 'color', label: 'lightflow_atmosphere.field.scattering_color', value: colorArrayToHex(volume.scattering_color) },
            scattering_strength: { type: 'number', label: 'lightflow_atmosphere.field.scattering', value: volume.scattering_strength, min: 0, max: 8, step: 0.01 },
            absorption_color: { type: 'color', label: 'lightflow_atmosphere.field.absorption_color', value: colorArrayToHex(volume.absorption_color) },
            absorption: { type: 'number', label: 'lightflow_atmosphere.field.absorption', value: volume.absorption, min: 0, max: 8, step: 0.01 },
            anisotropy: { type: 'range', label: 'lightflow_atmosphere.field.anisotropy', value: volume.anisotropy, min: -0.92, max: 0.92, step: 0.01 },
            ambient: { type: 'range', label: 'lightflow_atmosphere.field.ambient', value: volume.ambient, min: 0, max: 2, step: 0.01 },
            receive_shadows: { type: 'checkbox', label: 'lightflow_atmosphere.field.receive_shadows', value: volume.receive_shadows !== false },
            shadow_fill: { type: 'range', label: 'lightflow_atmosphere.field.shadow_fill', value: volume.shadow_fill, min: 0, max: 1, step: 0.01 },
            _density_shape: '_',
            edge_feather: { type: 'range', label: 'lightflow_atmosphere.field.edge_feather', value: volume.edge_feather, min: 0.001, max: 1, step: 0.005 },
            height_falloff: {
                type: 'number', label: 'lightflow_atmosphere.field.height_falloff', value: volume.height_falloff, min: 0, max: 16, step: 0.05,
                condition: form => form.density_mode === 'height' || form.density_mode === 'cloud'
            },
            height_offset: {
                type: 'range', label: 'lightflow_atmosphere.field.height_offset', value: volume.height_offset, min: 0, max: 1, step: 0.01,
                condition: form => form.density_mode === 'height' || form.density_mode === 'cloud'
            },
            noise_scale: {
                type: 'number', label: 'lightflow_atmosphere.field.noise_scale', value: volume.noise_scale, min: 0.01, max: 64, step: 0.05,
                condition: form => form.density_mode === 'cloud'
            },
            noise_detail: {
                type: 'select', label: 'lightflow_atmosphere.field.noise_detail', value: String(volume.noise_detail),
                options: {
                    '1': 'lightflow_atmosphere.option.detail_low',
                    '2': 'lightflow_atmosphere.option.detail_medium',
                    '3': 'lightflow_atmosphere.option.detail_high'
                },
                condition: form => form.density_mode === 'cloud'
            },
            coverage: {
                type: 'range', label: 'lightflow_atmosphere.field.coverage', value: volume.coverage, min: 0, max: 0.99, step: 0.01,
                condition: form => form.density_mode === 'cloud'
            },
            erosion: {
                type: 'range', label: 'lightflow_atmosphere.field.erosion', value: volume.erosion, min: 0.01, max: 1, step: 0.01,
                condition: form => form.density_mode === 'cloud'
            },
            wind_direction: {
                type: 'vector', dimensions: 2, label: 'lightflow_atmosphere.field.wind_direction', value: [volume.wind_direction?.[0] || 0, volume.wind_direction?.[1] || 0],
                condition: form => form.density_mode === 'cloud'
            },
            wind_speed: {
                type: 'number', label: 'lightflow_atmosphere.field.wind_speed', value: volume.wind_speed, min: -8, max: 8, step: 0.01,
                condition: form => form.density_mode === 'cloud'
            },
            _advanced: '_',
            technique_override: {
                type: 'select', label: 'lightflow_atmosphere.field.technique', value: volume.technique_override || 'auto',
                options: Object.assign({
                    auto: 'lightflow_atmosphere.option.auto',
                    SCREEN_SHAFTS: 'Screen Shafts',
                    GEOMETRY_SHAFTS: 'Geometry Shafts'
                }, volume.density_mode === 'cloud'
                    ? { VOLUMETRIC_RAYMARCH: 'Volumetric Raymarch', VOLUMETRIC_HQ: 'Volumetric HQ' }
                    : { ANALYTIC_LOCAL: 'Analytic Local', ANALYTIC_LOCAL_QUADRATURE: 'Fixed Quadrature' })
            },
            shaft_length: { type: 'range', label: 'lightflow_atmosphere.field.shaft_length', value: volume.shaft_length, min: 0.05, max: 1.5, step: 0.01, condition: form => form.composite_mode === 'shafts' },
            shaft_decay: { type: 'range', label: 'lightflow_atmosphere.field.shaft_decay', value: volume.shaft_decay, min: 0.5, max: 0.999, step: 0.001, condition: form => form.composite_mode === 'shafts' },
            shaft_radius: { type: 'range', label: 'lightflow_atmosphere.field.shaft_radius', value: volume.shaft_radius, min: 0.05, max: 2, step: 0.01, condition: form => form.composite_mode === 'shafts' },
            shaft_exposure: { type: 'range', label: 'lightflow_atmosphere.field.shaft_exposure', value: volume.shaft_exposure, min: 0, max: 8, step: 0.05, condition: form => form.composite_mode === 'shafts' }
        });
    }

    function normalizeDialogResult(result, volume) {
        return {
            name: String(result.name || volume.name || 'Volume Domain'),
            enabled: !!result.enabled,
            shape: result.shape === 'sphere' ? 'sphere' : 'box',
            size: Array.isArray(result.size) ? result.size.slice(0, 3) : volume.size,
            density_mode: ['uniform', 'height', 'cloud'].includes(result.density_mode) ? result.density_mode : 'uniform',
            composite_mode: result.composite_mode === 'shafts' ? 'shafts' : 'physical',
            density: finite(result.density, volume.density),
            scattering_color: hexToColorArray(result.scattering_color, volume.scattering_color),
            scattering_strength: finite(result.scattering_strength, volume.scattering_strength),
            absorption_color: hexToColorArray(result.absorption_color, volume.absorption_color),
            absorption: finite(result.absorption, volume.absorption),
            anisotropy: finite(result.anisotropy, volume.anisotropy),
            ambient: finite(result.ambient, volume.ambient),
            shadow_fill: finite(result.shadow_fill, volume.shadow_fill),
            receive_shadows: !!result.receive_shadows,
            edge_feather: finite(result.edge_feather, volume.edge_feather),
            height_falloff: finite(result.height_falloff, volume.height_falloff),
            height_offset: finite(result.height_offset, volume.height_offset),
            noise_scale: finite(result.noise_scale, volume.noise_scale),
            noise_detail: finite(result.noise_detail, volume.noise_detail),
            coverage: finite(result.coverage, volume.coverage),
            erosion: finite(result.erosion, volume.erosion),
            wind_direction: Array.isArray(result.wind_direction) ? [finite(result.wind_direction[0], 0), finite(result.wind_direction[1], 0), 0] : volume.wind_direction,
            wind_speed: finite(result.wind_speed, volume.wind_speed),
            technique_override: result.technique_override || volume.technique_override || 'auto',
            shaft_length: finite(result.shaft_length, volume.shaft_length),
            shaft_decay: finite(result.shaft_decay, volume.shaft_decay),
            shaft_radius: finite(result.shaft_radius, volume.shaft_radius),
            shaft_exposure: finite(result.shaft_exposure, volume.shaft_exposure)
        };
    }

    function openVolumeDialog() {
        const selected = getSelectedVolumes();
        const volume = selected[0];
        if (!volume) return;
        showEffectDialog('lightflow_atmosphere_volume_dialog', {
            title: selected.length > 1
                ? tr('lightflow_atmosphere.dialog.edit_many', 'Edit Volume Domains') + ` (${selected.length})`
                : tr('lightflow_atmosphere.dialog.edit', 'Volume Domain'),
            width: 560,
            form: volumeDialogForm(volume),
            onConfirm(result) {
                const preset = VOLUME_PRESETS[result.preset];
                const normalized = normalizeDialogResult(result, volume);
                if (preset) applyPresetArtDirection(preset);
                Undo.initEdit({ elements: selected });
                selected.forEach((target, index) => {
                    if (preset) applyVolumeConfig(target, preset);
                    const config = preset
                        ? { enabled: normalized.enabled, shape: normalized.shape, size: normalized.size }
                        : normalized;
                    if (selected.length > 1 || index > 0) delete config.name;
                    applyVolumeConfig(target, config);
                });
                Undo.finishEdit(tr('lightflow_atmosphere.undo.edit', 'Edit Volume Domain'));
                syncAtmospherePanel();
                requestPreviewRender();
            }
        }, [
            {id:'look',label:uiText('look'),entries:['preset','density','scattering_color','composite_mode','scattering_strength']},
            {id:'shape',label:uiText('shape'),entries:['shape','size','density_mode','edge_feather','height_falloff','height_offset','noise_scale','noise_detail','coverage','erosion','wind_direction','wind_speed']},
            {id:'light',label:uiText('light'),entries:['anisotropy','absorption_color','absorption','ambient','receive_shadows','shadow_fill']},
            {id:'advanced',label:tr('lightflow_atmosphere.panel.quality_advanced','Advanced'),entries:['technique_override','shaft_length','shaft_decay','shaft_radius','shaft_exposure']}
        ]);
    }

    const VOLUME_PANEL_GROUP_PREFIX = '_volume_group_';
    const VOLUME_PANEL_SETTING_PREFIX = 'quality_';
    const VOLUME_PANEL_GROUPS = [
        {
            id: 'look', label: 'lightflow_atmosphere.panel.look', icon: 'blur_on', color: '#67D7E8',
            entries: ['density', 'scattering_color', 'scattering_strength']
        },
        {id:'look_setup',label:'lightflow_atmosphere.ui.volume_recipe',icon:'auto_awesome',color:'#C5AFE9',entries:['preset','composite_mode']},
        {
            id: 'light_response', label: 'lightflow_atmosphere.panel.light_response', icon: 'light_mode', color: '#F1D27D',
            entries: ['anisotropy', 'absorption_color', 'absorption', 'ambient', 'receive_shadows', 'shadow_fill']
        },
        {
            id: 'shape', label: 'lightflow_atmosphere.panel.shape_distribution', icon: 'gradient', color: '#67D7E8',
            entries: [
                'shape', 'size', 'density_mode', 'edge_feather'
            ]
        },
        {id:'height',label:'lightflow_atmosphere.ui.height_distribution',icon:'height',color:'#A6DCB5',condition:form=>['height','cloud'].includes(form.density_mode),entries:['height_falloff','height_offset']},
        { id:'cloud', label:'lightflow_atmosphere.ui.cloud_detail', icon:'cloud', color:'#67D7E8', condition:form=>form.density_mode==='cloud', entries:['noise_scale','noise_detail','coverage','erosion'] },
        { id:'motion', label:'lightflow_atmosphere.ui.motion', icon:'air', color:'#67D7E8', condition:form=>form.density_mode==='cloud', entries:['wind_direction','wind_speed'] },
        {
            id: 'quality', label: 'lightflow_atmosphere.panel.quality', icon: 'speed', color: '#67D7E8',
            quality: true,
            entries: ['quality_enabled', 'quality_preview_quality', 'quality_render_quality']
        },
        {
            id: 'quality_advanced', label: 'lightflow_atmosphere.panel.quality_advanced', icon: 'tune', color: '#67D7E8',
            quality: true,
            entries: [
                'quality_preview_scale', 'quality_render_scale', 'quality_temporal_jitter',
                'quality_helper_mask', 'quality_static_cache', 'quality_frustum_culling'
            ]
        }
    ];

    const VOLUME_PANEL_MODE_GROUPS = Object.freeze({
        basic: new Set(['look','look_setup','light_response']),
        shape: new Set(['shape','height','cloud','motion']),
        quality: new Set(['quality','quality_advanced']),
        advanced: new Set(['light_response', 'quality_advanced'])
    });

    function volumePanelValuesEqual(left, right) {
        if (Array.isArray(left) || Array.isArray(right)) {
            return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
        }
        return left === right;
    }

    function beginVolumePanelUndo() {
        if (syncingPanel || activeVolumePanelUndo) return !!activeVolumePanelUndo;
        const elements = getSelectedVolumes();
        if (!elements.length) return false;
        Undo.initEdit({ elements });
        activeVolumePanelUndo = { elements, changed: false };
        return true;
    }

    function finishVolumePanelUndo() {
        const active = activeVolumePanelUndo;
        if (!active) return false;
        activeVolumePanelUndo = null;
        if (active.changed) Undo.finishEdit(tr('lightflow_atmosphere.undo.edit', 'Edit Volume Domain'));
        else Undo.cancelEdit(false);
        return true;
    }

    function cancelVolumePanelUndo(revert = false) {
        if (!activeVolumePanelUndo) return false;
        activeVolumePanelUndo = null;
        Undo.cancelEdit(!!revert);
        return true;
    }

    function normalizeVolumePanelValue(volume, key, value) {
        switch (key) {
            case 'name': return String(value || volume.name || 'Volume Domain');
            case 'enabled':
            case 'visibility':
            case 'receive_shadows': return !!value;
            case 'shape': return value === 'sphere' ? 'sphere' : 'box';
            case 'density_mode': return ['uniform', 'height', 'cloud'].includes(value) ? value : 'uniform';
            case 'composite_mode': return value === 'shafts' ? 'shafts' : 'physical';
            case 'position':
            case 'rotation':
            case 'size': {
                const fallback = Array.isArray(volume[key]) ? volume[key] : VOLUME_DEFAULTS[key];
                return new Array(3).fill(0).map((_, index) => finite(value?.[index], fallback[index]));
            }
            case 'scattering_color':
            case 'absorption_color': return hexToColorArray(value, volume[key]);
            case 'wind_direction': return [finite(value?.[0], 0), finite(value?.[1], 0), 0];
            case 'noise_detail': return Math.round(clamp(finite(value, volume[key]), 1, 3));
            default: return finite(value, volume[key]);
        }
    }

    function applyVolumePanelConfig(config, options = {}) {
        const targets = options.elements || activeVolumePanelUndo?.elements || getSelectedVolumes();
        if (!targets.length || !config || !Object.keys(config).length) return false;
        let changed = false;
        targets.forEach(volume => {
            const normalized = {};
            Object.entries(config).forEach(([key, value]) => {
                if (!VolumeElement.properties[key]) return;
                const nextValue = normalizeVolumePanelValue(volume, key, value);
                if (!volumePanelValuesEqual(volume[key], nextValue)) normalized[key] = nextValue;
            });
            if (!Object.keys(normalized).length) return;
            changed = true;
            applyVolumeConfig(volume, normalized);
        });
        if (!changed) return false;
        if (activeVolumePanelUndo) activeVolumePanelUndo.changed = true;
        requestPreviewRender();
        return true;
    }

    function applyVolumePanelSettings(config) {
        const current = AtmosphereManager.settings;
        const next = {};
        Object.entries(config || {}).forEach(([key, value]) => {
            switch (key) {
                case 'enabled':
                case 'temporal_jitter':
                case 'helper_mask':
                case 'static_cache':
                case 'frustum_culling': next[key] = !!value; break;
                case 'preview_quality': next[key] = PREVIEW_STEPS[value] ? value : 'balanced'; break;
                case 'render_quality': next[key] = RENDER_STEPS[value] ? value : 'high'; break;
                case 'preview_scale': next[key] = clamp(finite(value, current.preview_scale), 0.25, 1); break;
                case 'render_scale': next[key] = clamp(finite(value, current.render_scale), 0.5, 1); break;
            }
        });
        const changed = Object.entries(next).some(([key, value]) => current[key] !== value);
        if (!changed) return false;
        Object.assign(current, next);
        saveSettings(current);
        AtmosphereManager.invalidateSceneCache();
        requestPreviewRender();
        return true;
    }

    function combineVolumePanelCondition(groupKey, groupOpen, originalCondition) {
        return form => {
            const isOpen = form && Object.prototype.hasOwnProperty.call(form, groupKey)
                ? form[groupKey] !== false
                : groupOpen;
            if (!isOpen) return false;
            if (!originalCondition) return true;
            if (typeof Condition === 'function') return Condition(originalCondition, form);
            return typeof originalCondition === 'function' ? !!originalCondition(form) : !!originalCondition;
        };
    }

    function withVolumePanelUndo(control) {
        const originalBefore = control.onBefore;
        const originalAfter = control.onAfter;
        return Object.assign(control, {
            onBefore(event) {
                beginVolumePanelUndo();
                originalBefore?.(event);
            },
            onAfter(event) {
                try {
                    originalAfter?.(event);
                } finally {
                    finishVolumePanelUndo();
                }
            }
        });
    }

    function createVolumePanelControl(key, original, groupKey, groupOpen) {
        const design = window.LightManagerUI.formDesign;
        const base = Object.assign({}, original, {
            default: VOLUME_DEFAULTS[key],
            condition: combineVolumePanelCondition(groupKey, groupOpen, original.condition),
            title: original.title || original.description || original.label,
            description: original.description || original.label
        });
        const designedOptions = Object.assign({}, base);
        delete designedOptions.type;
        const defaultValue = VOLUME_DEFAULTS[key];
        if (base.type === 'select') {
            return withVolumePanelUndo(design.enum(Object.assign(designedOptions, {
                options: getAtmosphereSelectOptions(key, base.options),
                default: base.default ?? defaultValue,
                resettable: key !== 'preset'
            })));
        }
        if (base.type === 'checkbox') {
            return withVolumePanelUndo(design.checkbox(Object.assign(designedOptions, { icon_size: '22px' })));
        }
        if (base.type === 'color') {
            return withVolumePanelUndo(design.color(Object.assign(designedOptions, {
                default: colorArrayToHex(defaultValue)
            })));
        }
        if (base.type === 'vector') {
            return withVolumePanelUndo(design.vector(Object.assign(designedOptions, {
                default: Array.isArray(defaultValue) ? defaultValue.slice(0, base.dimensions || 3) : undefined,
                resettable: true
            })));
        }
        if (base.type === 'number' || base.type === 'range') {
            return withVolumePanelUndo(Object.assign(base, {
                type: 'combo_slider',
                full_track: true,
                max: key === 'density' ? 0.15 : base.max,
                resettable: Number.isFinite(defaultValue),
                reset_value: Number.isFinite(defaultValue) ? defaultValue : base.value,
                allow_higher: key === 'density' || !Number.isFinite(base.max),
                allow_lower: !Number.isFinite(base.min)
            }));
        }
        return base;
    }

    function createVolumePanelSource(volume) {
        return {
            size: {type:'vector', dimensions:3, label:'lightflow_atmosphere.field.size', value:volume.size.slice(), min:0.01},
            preset: {
                type: 'select', label: 'lightflow_atmosphere.field.preset', value: 'custom', default: 'custom',
                options: VOLUME_PRESET_OPTIONS
            },
            enabled: { type: 'checkbox', label: 'lightflow_atmosphere.field.volume_enabled', description: 'lightflow_atmosphere.help.volume_enabled', value: volume.enabled !== false },
            visibility: { type: 'checkbox', label: 'lightflow_atmosphere.field.visibility', description: 'lightflow_atmosphere.help.visibility', value: volume.visibility !== false },
            shape: {
                type: 'select', label: 'lightflow_atmosphere.field.shape', value: volume.shape,
                options: { box: 'lightflow_atmosphere.option.box', sphere: 'lightflow_atmosphere.option.sphere' }
            },
            density_mode: {
                type: 'select', label: 'lightflow_atmosphere.field.density_mode', value: volume.density_mode,
                options: { uniform: 'lightflow_atmosphere.option.uniform', height: 'lightflow_atmosphere.option.height', cloud: 'lightflow_atmosphere.option.cloud' }
            },
            composite_mode: {
                type: 'select', label: 'lightflow_atmosphere.field.composite_mode', value: volume.composite_mode,
                options: { physical: 'lightflow_atmosphere.option.physical', shafts: 'lightflow_atmosphere.option.shafts' }
            },
            density: { type: 'number', label: 'lightflow_atmosphere.field.density', description: 'lightflow_atmosphere.help.density', value: volume.density, min: 0, max: 4, step: 0.001 },
            scattering_color: { type: 'color', label: 'lightflow_atmosphere.field.scattering_color', description: 'lightflow_atmosphere.help.scattering_color', value: colorArrayToHex(volume.scattering_color) },
            scattering_strength: { type: 'number', label: 'lightflow_atmosphere.field.scattering', description: 'lightflow_atmosphere.help.scattering', value: volume.scattering_strength, min: 0, max: 8, step: 0.01 },
            absorption_color: { type: 'color', label: 'lightflow_atmosphere.field.absorption_color', description: 'lightflow_atmosphere.help.absorption_color', value: colorArrayToHex(volume.absorption_color) },
            absorption: { type: 'number', label: 'lightflow_atmosphere.field.absorption', description: 'lightflow_atmosphere.help.absorption', value: volume.absorption, min: 0, max: 8, step: 0.01 },
            anisotropy: { type: 'number', label: 'lightflow_atmosphere.field.anisotropy', description: 'lightflow_atmosphere.help.anisotropy', value: volume.anisotropy, min: -0.92, max: 0.92, step: 0.01 },
            ambient: { type: 'number', label: 'lightflow_atmosphere.field.ambient', description: 'lightflow_atmosphere.help.ambient', value: volume.ambient, min: 0, max: 2, step: 0.01 },
            receive_shadows: { type: 'checkbox', label: 'lightflow_atmosphere.field.receive_shadows', value: volume.receive_shadows !== false },
            shadow_fill: { type: 'number', label: 'lightflow_atmosphere.field.shadow_fill', value: volume.shadow_fill, min: 0, max: 1, step: 0.01 },
            edge_feather: { type: 'number', label: 'lightflow_atmosphere.field.edge_feather', description: 'lightflow_atmosphere.help.edge_feather', value: volume.edge_feather, min: 0.001, max: 1, step: 0.005 },
            height_falloff: {
                type: 'number', label: 'lightflow_atmosphere.field.height_falloff', value: volume.height_falloff, min: 0, max: 16, step: 0.05,
                condition: form => form.density_mode === 'height' || form.density_mode === 'cloud'
            },
            height_offset: {
                type: 'range', label: 'lightflow_atmosphere.field.height_offset', value: volume.height_offset, min: 0, max: 1, step: 0.01,
                condition: form => form.density_mode === 'height' || form.density_mode === 'cloud'
            },
            noise_scale: {
                type: 'number', label: 'lightflow_atmosphere.field.noise_scale', value: volume.noise_scale, min: 0.01, max: 64, step: 0.05,
                condition: form => form.density_mode === 'cloud'
            },
            noise_detail: {
                type: 'select', label: 'lightflow_atmosphere.field.noise_detail', value: String(volume.noise_detail),
                options: {
                    '1': 'lightflow_atmosphere.option.detail_low',
                    '2': 'lightflow_atmosphere.option.detail_medium',
                    '3': 'lightflow_atmosphere.option.detail_high'
                },
                condition: form => form.density_mode === 'cloud'
            },
            coverage: {
                type: 'range', label: 'lightflow_atmosphere.field.coverage', value: volume.coverage, min: 0, max: 0.99, step: 0.01,
                condition: form => form.density_mode === 'cloud'
            },
            erosion: {
                type: 'range', label: 'lightflow_atmosphere.field.erosion', value: volume.erosion, min: 0.01, max: 1, step: 0.01,
                condition: form => form.density_mode === 'cloud'
            },
            wind_direction: {
                type: 'vector', dimensions: 2, label: 'lightflow_atmosphere.field.wind_direction', value: [volume.wind_direction?.[0] || 0, volume.wind_direction?.[1] || 0],
                condition: form => form.density_mode === 'cloud'
            },
            wind_speed: {
                type: 'number', label: 'lightflow_atmosphere.field.wind_speed', value: volume.wind_speed, min: -8, max: 8, step: 0.01,
                condition: form => form.density_mode === 'cloud'
            }
        };
    }

    function createVolumeQualityPanelSource() {
        const settings = AtmosphereManager.settings;
        return {
            quality_enabled: { type: 'checkbox', label: 'lightflow_atmosphere.settings.enabled', value: settings.enabled !== false },
            quality_preview_quality: {
                type: 'select', label: 'lightflow_atmosphere.settings.preview_quality', value: settings.preview_quality,
                options: QUALITY_OPTIONS
            },
            quality_preview_scale: {
                type: 'range', label: 'lightflow_atmosphere.settings.preview_scale', value: settings.preview_scale,
                min: 0.25, max: 1, step: 0.05, reset_value: DEFAULT_SETTINGS.preview_scale
            },
            quality_render_quality: {
                type: 'select', label: 'lightflow_atmosphere.settings.render_quality', value: settings.render_quality,
                options: QUALITY_OPTIONS
            },
            quality_render_scale: {
                type: 'range', label: 'lightflow_atmosphere.settings.render_scale', value: settings.render_scale,
                min: 0.5, max: 1, step: 0.05, reset_value: DEFAULT_SETTINGS.render_scale
            },
            quality_temporal_jitter: { type: 'checkbox', label: 'lightflow_atmosphere.settings.jitter', value: !!settings.temporal_jitter },
            quality_helper_mask: { type: 'checkbox', label: 'lightflow_atmosphere.settings.helper_mask', value: settings.helper_mask !== false },
            quality_static_cache: { type: 'checkbox', label: 'lightflow_atmosphere.settings.static_cache', value: settings.static_cache !== false },
            quality_frustum_culling: { type: 'checkbox', label: 'lightflow_atmosphere.settings.frustum_culling', value: settings.frustum_culling !== false }
        };
    }

    function createVolumeQualityPanelControl(key, original, groupKey, groupOpen) {
        const design = window.LightManagerUI.formDesign;
        const base = Object.assign({}, original, {
            condition: combineVolumePanelCondition(groupKey, groupOpen, original.condition),
            title: original.label,
            description: original.label
        });
        if (key.endsWith('_scale')) base.search_terms = 'scale resolution escala resolución';
        const designedOptions = Object.assign({}, base);
        delete designedOptions.type;
        if (base.type === 'select') {
            return design.enum(Object.assign(designedOptions, {
                options: getAtmosphereSelectOptions(key.replace(VOLUME_PANEL_SETTING_PREFIX, ''), base.options),
                default: DEFAULT_SETTINGS[key.replace(VOLUME_PANEL_SETTING_PREFIX, '')],
                resettable: true
            }));
        }
        if (base.type === 'checkbox') return design.checkbox(Object.assign(designedOptions, { icon_size: '22px' }));
        return Object.assign(base, {
            type: base.type==='range' ? 'combo_slider' : 'number',
            full_track: true,
            resettable: true,
            reset_value: base.reset_value
        });
    }

    function createVolumePanelForm() {
        const selected = getSelectedVolumes();
        const volume = selected[0];
        const design = window.LightManagerUI.formDesign;
        const form = {};
        if (!volume) return emptyEffectForm(VolumeElement,'add_lightflow_volume',tr('lightflow_atmosphere.action.add','Add Volume Domain'));
        if (volume) {
            form.summary = {
                condition:()=>selected.length>1,
                type: 'bar_display',
                value: selected.length > 1
                    ? tr('lightflow_atmosphere.panel.multiple', 'Volume Domains') + ` (${selected.length})`
                    : volume.name,
                icon: volume.density_mode === 'cloud' ? 'cloud' : (volume.density_mode === 'height' ? 'gradient' : 'blur_on'),
                icon_color: markerColor(0, 'pastel', '#A2EBFF'),
                paragraph: false,
                expand: true,
                separator: true,
                separator_color: 'color-mix(in srgb, #67D7E8 50%, var(--color-border))',
                color: 'var(--color-text)',
                title: selected.length > 1
                    ? 'lightflow_atmosphere.panel.multiple_hint'
                    : 'lightflow_atmosphere.panel.summary_hint'
            };
        } else {
            form.no_volume = {
                type: 'bar_display', value: tr('lightflow_atmosphere.panel.none', 'Select a Volume Domain'),
                icon: 'blur_on', icon_color: markerColor(0, 'pastel', '#A2EBFF'), paragraph: false,
                expand: true, separator: true, color: 'var(--color-subtle_text)'
            };
        }

        const source = volume ? createVolumePanelSource(volume) : {};
        const qualitySource = createVolumeQualityPanelSource();
        if (volume) {
            const inactive = volume.enabled === false || volume.visibility === false || AtmosphereManager.settings.enabled === false;
            form._volume_effective_state = {
                type: 'bar_display', search_ignore: true, paragraph: true, expand: true, font_size: '12px',
                condition: () => inactive,
                value: tr('lightflow_atmosphere.panel.inactive_reason', 'Not rendered: check Enabled, Visible and global Atmosphere.'),
                color: 'var(--color-warning)'
            };
            form._activate_volume = effectAction(uiText('activate_effect'),'visibility',()=>{
                beginVolumePanelUndo();applyVolumePanelConfig({enabled:true,visibility:true});finishVolumePanelUndo();syncAtmospherePanel();
            },{condition:()=>volume.enabled===false});
        }
        form._volume_mode = design.tabs({
            value: volumePanelMode,
            description: tr('lightflow_atmosphere.panel.title', 'Volume'),
            options: {
                basic: { name: uiText('look'), description: tr('lightflow_atmosphere.panel.basic_desc', 'The visible result') },
                shape: { name: tr('lightflow_atmosphere.panel.shape', 'Shape'), description: tr('lightflow_atmosphere.panel.shape_desc', 'Where the effect exists') },
                quality: { name: tr('lightflow_atmosphere.panel.quality', 'Quality'), description: tr('lightflow_atmosphere.panel.quality_desc', 'Viewport and final render') }
            }
        });
        form._volume_search = design.search();
        form._volume_quality_scope = {type:'bar_display',paragraph:true,expand:true,font_size:'12px',color:'var(--color-subtle_text)',value:uiText('quality_scope'),panel_category_visible:volumePanelMode==='quality'};
        form._enable_atmosphere = effectAction(uiText('enable_atmosphere'),'visibility',()=>{applyVolumePanelSettings({enabled:true});syncAtmospherePanel();},{condition:()=>AtmosphereManager.settings.enabled===false,search_ignore:true});
        VOLUME_PANEL_GROUPS.forEach(group => {
            if (!volume && !group.quality) return;
            const categoryVisible = !!VOLUME_PANEL_MODE_GROUPS[volumePanelMode]?.has(group.id);
            const groupKey = VOLUME_PANEL_GROUP_PREFIX + group.id;
            const isTabHeading = group.id === 'look' || group.id === 'shape';
            const groupOpen = isTabHeading || volumePanelGroupsOpen[group.id] !== false;
            const groupSource = group.quality ? qualitySource : source;
            const modified = group.entries.filter(entry => typeof entry === 'string').some(key => {
                const settingKey = group.quality ? key.replace(VOLUME_PANEL_SETTING_PREFIX, '') : key;
                const defaultValue = group.quality ? DEFAULT_SETTINGS[settingKey] : VOLUME_DEFAULTS[key];
                return defaultValue !== undefined && !volumePanelValuesEqual(groupSource[key]?.value, defaultValue);
            });
            form[groupKey] = design.group({
                panel_category_visible: categoryVisible,
                label: group.label,
                label_icon: group.icon,
                label_icon_color: group.color,
                value: groupOpen,
                icon_size: '20px',
                icon_color_on: group.color,
                icon_color_off: `color-mix(in srgb, ${group.color} 55%, var(--color-subtle_text))`,
                description: group.label,
                condition: isTabHeading ? false : group.condition,
                modified: formResult => group.entries.filter(entry => typeof entry === 'string').some(key => {
                    const settingKey = group.quality ? key.replace(VOLUME_PANEL_SETTING_PREFIX, '') : key;
                    const defaultValue = group.quality ? DEFAULT_SETTINGS[settingKey] : VOLUME_DEFAULTS[key];
                    const currentValue = formResult && Object.prototype.hasOwnProperty.call(formResult, key)
                        ? formResult[key]
                        : groupSource[key]?.value;
                    return defaultValue !== undefined && !volumePanelValuesEqual(currentValue, defaultValue);
                }),
                modified_label: 'Contains modified settings',
                modified_color: group.color,
                active: group.id === 'look' ? volume?.enabled !== false : true
            });

            let subsectionIndex = 0;
            group.entries.forEach(entry => {
                if (group.id === 'look' && (entry === 'enabled' || entry === 'visibility')) return;
                if (entry && typeof entry === 'object' && entry.subsection) {
                    const subsectionKey = `_volume_subsection_${group.id}_${subsectionIndex++}`;
                    const subsectionCondition = (group.condition || entry.condition)
                        ? form => (!group.condition || group.condition(form)) && (!entry.condition || entry.condition(form))
                        : null;
                    form[subsectionKey] = design.subsection({
                        panel_category_visible: categoryVisible,
                        value: tr(entry.subsection, entry.subsection),
                        icon: entry.icon,
                        icon_color: group.color,
                        separator_color: `color-mix(in srgb, ${group.color} 58%, var(--color-border))`,
                        border_left: `1px solid color-mix(in srgb, ${group.color} 72%, var(--color-border))`,
                        background: `color-mix(in srgb, ${group.color} 4%, transparent)`,
                        margin_left: '4px',
                        margin_right: '4px',
                        condition: combineVolumePanelCondition(groupKey, groupOpen, subsectionCondition)
                    });
                    return;
                }
                const control = group.quality ? qualitySource[entry] : source[entry];
                if (!control) return;
                form[entry] = group.quality
                    ? createVolumeQualityPanelControl(entry, control, groupKey, groupOpen)
                    : createVolumePanelControl(entry, control, groupKey, groupOpen);
                form[entry].panel_category_visible = categoryVisible;
            });
        });
        Object.assign(form, window.LightManagerUI.creationGuide?.('volume') || {});
        return identifyEffectControls(form);
    }

    function syncAtmospherePanel(options = {}) {
        if (!atmospherePanel?.form) return;
        finishVolumePanelUndo();
        const restore = rememberInspectorScroll(atmospherePanel, `${getSelectedVolumes()[0]?.uuid || 'empty'}:${volumePanelMode}`);
        syncingPanel = true;
        try {
            atmospherePanel.form.form_config = (window.LightManagerUI?.prepareForm || (form => form))(createVolumePanelForm());
            atmospherePanel.form.buildForm();
            window.LightManagerUI?.applyFormGroups?.(atmospherePanel.form, [{
                elements: ['_lightflow_creation_guide', '_lightflow_creation_guide_dismiss'], gap: '4px',
                flex: { _lightflow_creation_guide: '1 1 0', _lightflow_creation_guide_dismiss: '0 0 26px' }
            }, {
                elements: ['summary', '#', 'enabled', 'visibility'],
                gap: '2px',
                class_name: 'lightflow_volume_overview_row',
                aria_label: tr('lightflow_atmosphere.panel.summary_hint', 'Selected Volume Domain'),
                flex: { summary: '1 1 100%', enabled: '1 1 0', visibility: '1 1 0' }
            }]);
        } finally {
            syncingPanel = false;
        }
        restore();
        scheduleVolumePanelAdaptiveLayout();
    }

    function createAtmospherePanel() {
        atmospherePanel = new Panel('lightflow_atmosphere_properties', {
            name: 'lightflow_atmosphere.panel.title',
            icon: 'blur_on',
            growable: true,
            resizable: true,
            condition: { modes: ['render'], project: true },
            default_position: {
                slot: 'right_bar', float_position: [0, 0], float_size: [340, 600], height: 520,
                folded: false, fixed_height: false,
                attached_to: 'light_properties', attached_index: 1, sidebar_index: 1
            },
            mode_positions: {
                edit: { slot: 'right_bar', height: 440, folded: false, fixed_height: false, attached_to: 'light_properties', attached_index: 1, sidebar_index: 1 },
                render: { slot: 'right_bar', height: 440, folded: false, fixed_height: false, attached_to: 'light_properties', attached_index: 1, sidebar_index: 1 }
            },
            form: (window.LightManagerUI?.prepareForm || (form => form))(createVolumePanelForm())
        });
        window.LightManagerUI?.applyFormGroups?.(atmospherePanel.form, [{
            elements: ['_lightflow_creation_guide', '_lightflow_creation_guide_dismiss'], gap: '4px',
            flex: { _lightflow_creation_guide: '1 1 0', _lightflow_creation_guide_dismiss: '0 0 26px' }
        }, {
            elements: ['summary', '#', 'enabled', 'visibility'],
            gap: '2px',
            class_name: 'lightflow_volume_overview_row',
            aria_label: tr('lightflow_atmosphere.panel.summary_hint', 'Selected Volume Domain'),
            flex: { summary: '1 1 100%', enabled: '1 1 0', visibility: '1 1 0' }
        }]);
        const atmospherePanelListener = atmospherePanel.form.on('change', ({ result, changed_keys }) => {
            if (syncingPanel) return;
            const keys = Array.isArray(changed_keys) && changed_keys.length ? changed_keys : Object.keys(result || {});
            keys.forEach(key => {
                if (key === '_volume_mode' && VOLUME_PANEL_MODE_GROUPS[result?.[key]]) {
                    if (volumePanelMode !== result[key]) {
                        volumePanelMode = result[key];
                        setTimeout(() => syncAtmospherePanel({ preserveScroll: false }), 0);
                    }
                    return;
                }
                if (!key.startsWith(VOLUME_PANEL_GROUP_PREFIX)) return;
                const groupId = key.slice(VOLUME_PANEL_GROUP_PREFIX.length);
                if (Object.prototype.hasOwnProperty.call(volumePanelGroupsOpen, groupId)) {
                    volumePanelGroupsOpen[groupId] = result?.[key] !== false;
                }
            });
            scheduleVolumePanelAdaptiveLayout();

            const qualityConfig = {};
            keys.forEach(key => {
                if (!key.startsWith(VOLUME_PANEL_SETTING_PREFIX)) return;
                qualityConfig[key.slice(VOLUME_PANEL_SETTING_PREFIX.length)] = result[key];
            });
            if (Object.keys(qualityConfig).length) applyVolumePanelSettings(qualityConfig);

            const volumes = activeVolumePanelUndo?.elements || getSelectedVolumes();
            if (!volumes.length) return;
            if (keys.includes('preset') && result.preset !== 'custom' && VOLUME_PRESETS[result.preset]) {
                const directUndo = !activeVolumePanelUndo && beginVolumePanelUndo();
                applyPresetArtDirection(VOLUME_PRESETS[result.preset]);
                applyVolumePanelConfig(VOLUME_PRESETS[result.preset]);
                if (directUndo) finishVolumePanelUndo();
                setTimeout(() => syncAtmospherePanel({ preserveScroll: true }), 0);
                return;
            }

            const propertyKeys = keys.filter(key => VolumeElement.properties[key]);
            if (!propertyKeys.length) return;
            const directUndo = !activeVolumePanelUndo && beginVolumePanelUndo();
            const config = {};
            propertyKeys.forEach(key => { config[key] = result[key]; });
            applyVolumePanelConfig(config, { elements: volumes });
            if (directUndo) finishVolumePanelUndo();
        });
        const panelStyles = window.LightManagerUI.addDesignedPanelStyles('lightflow_atmosphere_properties', {
            scrollbar_width: 4,
            row_padding: '3px 4px'
        });
        const volumePanelStyles = Blockbench.addCSS(`
            #panel_lightflow_atmosphere_properties .form_bar_summary,
            #panel_lightflow_atmosphere_properties .form_bar_no_volume {
                margin-bottom: 3px !important;
                padding: 3px 5px !important;
                background: color-mix(in srgb, #67D7E8 5%, transparent);
                border-left: 1px solid color-mix(in srgb, #67D7E8 66%, var(--color-border));
            }
            #panel_lightflow_atmosphere_properties .light_manager_advanced_color_control.is_expanded {
                flex: 0 1 92px !important;
                width: 92px !important;
                min-width: 64px !important;
                max-width: 92px !important;
            }
            #panel_lightflow_atmosphere_properties .light_manager_vector_header {
                margin-bottom: 2px !important;
            }
            #panel_lightflow_atmosphere_properties .light_manager_form_variant_subsection {
                margin-top: 2px !important;
            }
            #panel_lightflow_atmosphere_properties .light_manager_form_variant_panel_tabs {
                position: sticky;
                top: 0;
                z-index: 2;
                padding-top: 2px !important;
                background: var(--color-ui);
            }
            #panel_lightflow_atmosphere_properties .lightflow_volume_overview_row .custom_checkbox {
                height: 28px !important;
                padding: 1px 4px !important;
            }
            #panel_lightflow_atmosphere_properties .lightflow_volume_overview_row .custom_checkbox span {
                font-size: 13px !important;
            }
            #panel_lightflow_atmosphere_properties .lightflow_volume_overview_row > .form_bar_enabled,
            #panel_lightflow_atmosphere_properties .lightflow_volume_overview_row > .form_bar_visibility {
                width: auto !important;
                min-width: 0;
            }
            #panel_lightflow_atmosphere_properties .lightflow_volume_overview_row .light_manager_control_separator {
                display: none !important;
            }
        `);
        // Each inspector scrolls inside its native host. Never fold or resize the
        // Outliner in response to content or selection changes.
        scheduleVolumePanelAdaptiveLayout = () => {};
        window.LightManagerUI.workspace?.register(atmospherePanel);
        deletables.push(atmospherePanel, panelStyles, volumePanelStyles, atmospherePanelListener, {
            delete() { cancelVolumePanelUndo(false); }
        });
    }


    function openSettingsDialog() {
        const settings = AtmosphereManager.settings;
        const diagnostics = AtmosphereManager.getResourceDiagnostics?.(window.Preview?.selected || null) || {};
        const resolutionSummary = [
            diagnostics.resolvedTechnique || 'NONE',
            `${diagnostics.activeRaymarchVolumes || 0} raymarched`,
            `${diagnostics.activeAnalyticVolumes || 0} analytic`,
            `${diagnostics.effectiveSteps || 0} steps`,
            diagnostics.hdrFormat || 'not allocated'
        ].join(' · ');
        const qualityDialog = {
            title: tr('lightflow_atmosphere.settings.title', 'Atmosphere Quality'),
            width: 560,
            form: enhanceAtmosphereDialogForm({
                _global_fog: '_',
                global_fog_enabled: { type: 'checkbox', label: 'lightflow_atmosphere.settings.global_fog_enabled', value: settings.global_fog_enabled === true },
                global_fog_mode: { type: 'select', label: 'lightflow_atmosphere.settings.global_fog_mode', value: settings.global_fog_mode || 'none', options: GLOBAL_FOG_OPTIONS },
                global_fog_color: { type: 'color', label: 'lightflow_atmosphere.settings.global_fog_color', value: colorArrayToHex(settings.global_fog_color) },
                global_fog_start: { type: 'number', label: 'lightflow_atmosphere.settings.global_fog_start', value: settings.global_fog_start, min: 0 },
                global_fog_end: { type: 'number', label: 'lightflow_atmosphere.settings.global_fog_end', value: settings.global_fog_end, min: 0.001 },
                global_fog_density: { type: 'number', label: 'lightflow_atmosphere.settings.global_fog_density', value: settings.global_fog_density, min: 0, step: 0.001 },
                global_fog_distance_offset: { type: 'number', label: 'lightflow_atmosphere.settings.global_fog_distance_offset', value: settings.global_fog_distance_offset, min: 0 },
                global_fog_max_opacity: { type: 'range', label: 'lightflow_atmosphere.settings.global_fog_max_opacity', value: settings.global_fog_max_opacity, min: 0, max: 1, step: 0.01 },
                global_fog_strict_linear: { type: 'checkbox', label: 'lightflow_atmosphere.settings.global_fog_strict_linear', value: !!settings.global_fog_strict_linear },
                global_fog_base_height: { type: 'number', label: 'lightflow_atmosphere.settings.global_fog_base_height', value: settings.global_fog_base_height },
                global_fog_height_falloff: { type: 'number', label: 'lightflow_atmosphere.settings.global_fog_height_falloff', value: settings.global_fog_height_falloff, min: 0, step: 0.01 },
                global_fog_sync_background: { type: 'checkbox', label: 'lightflow_atmosphere.settings.global_fog_sync_background', value: settings.global_fog_sync_background !== false },
                _art_direction: '_',
                art_max_opacity: { type: 'range', label: 'lightflow_atmosphere.field.max_opacity', value: settings.art_max_opacity, min: 0, max: 1, step: 0.01 },
                art_saturation: { type: 'range', label: 'lightflow_atmosphere.field.saturation', value: settings.art_saturation, min: 0, max: 2, step: 0.01 },
                art_contrast: { type: 'range', label: 'lightflow_atmosphere.field.contrast', value: settings.art_contrast, min: 0, max: 3, step: 0.01 },
                art_posterize: { type: 'number', label: 'lightflow_atmosphere.field.posterize', value: settings.art_posterize, min: 0, max: 32, step: 1 },
                art_dither: { type: 'range', label: 'lightflow_atmosphere.field.dither', value: settings.art_dither, min: 0, max: 1, step: 0.01 },
                art_color_quantization: { type: 'number', label: 'lightflow_atmosphere.field.color_quantization', value: settings.art_color_quantization, min: 0, max: 32, step: 1 },
                art_near_color: { type: 'color', label: 'lightflow_atmosphere.field.near_color', value: colorArrayToHex(settings.art_near_color) },
                art_far_color: { type: 'color', label: 'lightflow_atmosphere.field.far_color', value: colorArrayToHex(settings.art_far_color) },
                art_ramp_strength: { type: 'range', label: 'lightflow_atmosphere.field.fog_ramp_strength', value: settings.art_ramp_strength, min: 0, max: 1, step: 0.01 },
                art_ramp_curve: { type: 'range', label: 'lightflow_atmosphere.field.fog_ramp_curve', value: settings.art_ramp_curve, min: 0.05, max: 8, step: 0.05 },
                art_bloom_response: { type: 'range', label: 'lightflow_atmosphere.field.bloom', value: settings.art_bloom_response, min: 0, max: 4, step: 0.05 },
                _viewport: '_',
                enabled: { type: 'checkbox', label: 'lightflow_atmosphere.field.enabled', value: settings.enabled },
                preview_quality: { type: 'select', label: 'lightflow_atmosphere.settings.preview_quality', value: settings.preview_quality, options: QUALITY_OPTIONS },
                preview_scale: { type: 'range', label: 'lightflow_atmosphere.settings.preview_scale', value: settings.preview_scale, min: 0.25, max: 1, step: 0.05 },
                _render: '_',
                render_quality: { type: 'select', label: 'lightflow_atmosphere.settings.render_quality', value: settings.render_quality, options: QUALITY_OPTIONS },
                render_scale: { type: 'range', label: 'lightflow_atmosphere.settings.render_scale', value: settings.render_scale, min: 0.5, max: 1, step: 0.05 },
                _advanced: '_',
                resolved_technique: { type: 'bar_display', icon: 'route', label: 'Resolved as', value: resolutionSummary, color: 'var(--color-text)' },
                temporal_jitter: { type: 'checkbox', label: 'lightflow_atmosphere.settings.jitter', value: settings.temporal_jitter },
                temporal_response: { type: 'select', label: 'lightflow_atmosphere.settings.temporal_response', value: settings.temporal_response || 'balanced', options: { off: 'Off', responsive: 'Responsive', balanced: 'Balanced', stable: 'Stable' } },
                temporal_interleave: { type: 'checkbox', label: 'lightflow_atmosphere.settings.temporal_interleave', value: !!settings.temporal_interleave },
                volumetric_shadow_mode: { type: 'select', label: 'lightflow_atmosphere.settings.shadow_mode', value: settings.volumetric_shadow_mode || 'auto', options: { auto: 'Auto', none: 'None', cheap: 'Cheap', full: 'Full' } },
                helper_mask: { type: 'checkbox', label: 'lightflow_atmosphere.settings.helper_mask', value: settings.helper_mask },
                static_cache: { type: 'checkbox', label: 'lightflow_atmosphere.settings.static_cache', value: settings.static_cache !== false },
                frustum_culling: { type: 'checkbox', label: 'lightflow_atmosphere.settings.frustum_culling', value: settings.frustum_culling !== false }
            }),
            onConfirm(result) {
                AtmosphereManager.settings = Object.assign({}, settings, {
                    enabled: !!result.enabled,
                    global_fog_enabled: !!result.global_fog_enabled,
                    global_fog_mode: Object.prototype.hasOwnProperty.call(GLOBAL_FOG_OPTIONS, result.global_fog_mode) ? result.global_fog_mode : 'none',
                    global_fog_color: hexToColorArray(result.global_fog_color, settings.global_fog_color),
                    global_fog_start: Math.max(0, finite(result.global_fog_start, 24)),
                    global_fog_end: Math.max(0.001, finite(result.global_fog_end, 160)),
                    global_fog_density: Math.max(0, finite(result.global_fog_density, 0.012)),
                    global_fog_distance_offset: Math.max(0, finite(result.global_fog_distance_offset, 0)),
                    global_fog_max_opacity: clamp(finite(result.global_fog_max_opacity, 1), 0, 1),
                    global_fog_strict_linear: !!result.global_fog_strict_linear,
                    global_fog_base_height: finite(result.global_fog_base_height, 0),
                    global_fog_height_falloff: Math.max(0, finite(result.global_fog_height_falloff, 0.08)),
                    global_fog_sync_background: !!result.global_fog_sync_background,
                    art_max_opacity: clamp(finite(result.art_max_opacity, 1), 0, 1),
                    art_saturation: clamp(finite(result.art_saturation, 1), 0, 2),
                    art_contrast: clamp(finite(result.art_contrast, 1), 0, 3),
                    art_posterize: Math.round(clamp(finite(result.art_posterize, 0), 0, 32)),
                    art_dither: clamp(finite(result.art_dither, 0), 0, 1),
                    art_color_quantization: Math.round(clamp(finite(result.art_color_quantization, 0), 0, 32)),
                    art_near_color: hexToColorArray(result.art_near_color, settings.art_near_color),
                    art_far_color: hexToColorArray(result.art_far_color, settings.art_far_color),
                    art_ramp_strength: clamp(finite(result.art_ramp_strength, 0), 0, 1),
                    art_ramp_curve: clamp(finite(result.art_ramp_curve, 1), 0.05, 8),
                    art_bloom_response: clamp(finite(result.art_bloom_response, 1), 0, 4),
                    preview_quality: PREVIEW_STEPS[result.preview_quality] ? result.preview_quality : 'balanced',
                    preview_scale: clamp(finite(result.preview_scale, 0.5), 0.25, 1),
                    render_quality: RENDER_STEPS[result.render_quality] ? result.render_quality : 'high',
                    render_scale: clamp(finite(result.render_scale, 1), 0.5, 1),
                    temporal_jitter: !!result.temporal_jitter,
                    temporal_response: ['off', 'responsive', 'balanced', 'stable'].includes(result.temporal_response) ? result.temporal_response : 'balanced',
                    temporal_interleave: !!result.temporal_interleave,
                    volumetric_shadow_mode: ['auto', 'none', 'cheap', 'full'].includes(result.volumetric_shadow_mode) ? result.volumetric_shadow_mode : 'auto',
                    helper_mask: !!result.helper_mask,
                    static_cache: !!result.static_cache,
                    frustum_culling: !!result.frustum_culling
                });
                saveSettings(AtmosphereManager.settings);
                AtmosphereManager.updateSurfaceFogUniforms();
                if (!AtmosphereManager.getGlobalFogConfig().enabled) AtmosphereManager.restoreSceneFog();
                AtmosphereManager.invalidateSceneCache();
                window.Canvas?.updateAllFaces?.();
                requestPreviewRender();
            }
        };
        const keys = Object.keys(qualityDialog.form);
        const advanced = ['resolved_technique','temporal_jitter','temporal_response','temporal_interleave','volumetric_shadow_mode','helper_mask','static_cache','frustum_culling'];
        showEffectDialog('lightflow_atmosphere_settings_dialog', qualityDialog, [
            {id:'quality',label:tr('lightflow_atmosphere.panel.quality','Quality'),entries:keys.filter(key=>!key.startsWith('art_')&&!key.startsWith('global_fog_')&&!advanced.includes(key))},
            {id:'fog',label:tr('lightflow_atmosphere.panel.global_fog','Fog'),entries:keys.filter(key=>key.startsWith('global_fog_'))},
            {id:'look',label:uiText('look'),entries:keys.filter(key=>key.startsWith('art_'))},
            {id:'advanced',label:tr('lightflow_atmosphere.panel.quality_advanced','Advanced'),entries:advanced}
        ]);
    }

    function installActions() {
        addVolumeAction = new Action('add_lightflow_volume', {
            name: 'lightflow_atmosphere.action.add',
            description: 'lightflow_atmosphere.action.add.desc',
            icon: 'blur_on', category: 'edit', condition: () => !!window.Project && !!(Modes.edit || Modes.render),
            click() { createVolume('soft_mist'); }
        });
        editVolumeAction = new Action('edit_lightflow_volume', {
            name: 'lightflow_atmosphere.action.edit', icon: 'tune', category: 'edit',
            condition: () => getSelectedVolumes().length > 0,
            click() { openVolumeDialog(); }
        });
        const fitAction = new Action('fit_lightflow_volume', {
            name: 'lightflow_atmosphere.action.fit', icon: 'fit_screen', category: 'edit',
            condition: () => getSelectedVolumes().length > 0 && getSelectedRenderElements().length > 0,
            click() {
                const volumes = getSelectedVolumes();
                Undo.initEdit({ elements: volumes });
                volumes.forEach(volume => fitVolumeToSelection(volume, 2));
                Undo.finishEdit(tr('lightflow_atmosphere.undo.fit', 'Fit Volume Domain'));
                syncAtmospherePanel();
                requestPreviewRender();
            }
        });
        settingsAction = new Action('lightflow_atmosphere_settings', {
            name: 'lightflow_atmosphere.action.settings', icon: 'tune', category: 'view',
            click() { openSettingsDialog(); }
        });
        [addVolumeAction, editVolumeAction, fitAction, settingsAction].forEach(action => deletables.push(action));
        const addVfxAction = new Action('lightflow_atmosphere_add_vfx', {
            name: 'lightflow_atmosphere.action.add_vfx',
            description: 'lightflow_atmosphere.action.add_vfx.desc',
            icon: 'auto_awesome',
            category: 'edit',
            condition: () => !!window.Project && !window.BarItems?.light_manager_add_light_menu,
            children: [
                'add_lightflow_volume',
                'add_lightflow_god_ray',
                'lightflow_particle_import'
            ],
            click() {
                const fallback = this.children
                    .map(id => BarItems[id])
                    .find(action => action && Condition(action.condition));
                if (fallback) fallback.click();
            }
        });
        deletables.push(addVfxAction);
        MenuBar.menus.edit.addAction(addVfxAction, '9');
        Panels.outliner.menu.addAction(addVfxAction, '2');
        MenuBar.menus.edit.addAction(editVolumeAction, '9');
        MenuBar.menus.view.addAction(settingsAction, '9');
    }

    function installTranslations() {
        Language.addTranslations('en', {
            'lightflow_atmosphere.ui.look':'Look', 'lightflow_atmosphere.ui.shape':'Shape', 'lightflow_atmosphere.ui.light':'Lighting',
            'lightflow_atmosphere.ui.ray_gizmos':'Edit ray shape', 'lightflow_atmosphere.ui.edit_ray':'Edit God Ray',
            'lightflow_atmosphere.ui.ray_from_light':'Create attached God Ray', 'lightflow_atmosphere.ui.ray_detach':'Detach God Ray',
            'lightflow_atmosphere.ui.ray_attached':'Follow light position',
            'lightflow_atmosphere.ui.ray_color_detail':'Color transition',
            'lightflow_atmosphere.ui.ray_compositing':'Blending & Bloom',
            'lightflow_atmosphere.ui.ray_plane':'Plane & orientation',
            'lightflow_atmosphere.ui.ray_soft_edges':'Soft edges & fading',
            'lightflow_atmosphere.ui.ray_shadow_detail':'Light occlusion',
            'lightflow_atmosphere.ui.ray_camera_fade':'Camera distance fade',
            'lightflow_atmosphere.ui.volume_recipe':'Presets & blending',
            'lightflow_atmosphere.ui.height_distribution':'Height distribution',
            'lightflow_atmosphere.ui.ray_attachment_help':'Moving the ray changes its offset from the light. Detach it to keep its current position and direction.',
            'lightflow_atmosphere.ui.activate_effect':'Enable effect', 'lightflow_atmosphere.ui.particle_texture':'Particle texture',
            'lightflow_atmosphere.ui.particle_setup':'Quick setup…', 'lightflow_atmosphere.ui.preset_snow':'Snow', 'lightflow_atmosphere.ui.preset_rain':'Rain', 'lightflow_atmosphere.ui.preset_sparks':'Sparks',
            'lightflow_atmosphere.ui.import_effect':'Import .particle.json…', 'lightflow_atmosphere.ui.export_effect':'Export .particle.json…',
            'lightflow_atmosphere.ui.snowstorm':'Edit in Snowstorm…', 'lightflow_atmosphere.ui.snowstorm_help':'Snowstorm opens this effect in its visual editor. Save a .particle.json there and use Replace JSON to bring it back here.',
            'lightflow_atmosphere.ui.snowstorm_export_help':'This effect is too large for a link. Export its .particle.json and open it in Snowstorm.',
            'lightflow_atmosphere.ui.snowstorm_texture_help':'Import this texture separately in Snowstorm; the link includes compact PNG images.',
            'lightflow_atmosphere.ui.particle_distribution':'Emitter shape', 'lightflow_atmosphere.ui.particle_motion':'Motion',
            'lightflow_atmosphere.ui.emitter_point':'Point', 'lightflow_atmosphere.ui.emitter_box':'Box', 'lightflow_atmosphere.ui.emitter_sphere':'Sphere',
            'lightflow_atmosphere.ui.emitter_shape':'Shape', 'lightflow_atmosphere.ui.emitter_size':'Emitter size', 'lightflow_atmosphere.ui.emitter_radius':'Emitter radius',
            'lightflow_atmosphere.ui.acceleration':'Acceleration', 'lightflow_atmosphere.ui.drag':'Air drag',
            'lightflow_atmosphere.ui.quality_scope':'These quality settings apply to every volume in the project.',
            'lightflow_atmosphere.ui.enable_atmosphere':'Enable global Atmosphere',
            'lightflow_atmosphere.ui.ray':'God ray', 'lightflow_atmosphere.ui.particles':'Particles',
            'lightflow_atmosphere.ui.ray_camera_axis':'Camera / ray axis', 'lightflow_atmosphere.ui.ray_world_y':'Camera / world Y',
            'lightflow_atmosphere.ui.ray_fixed':'Fixed plane', 'lightflow_atmosphere.ui.ray_additive':'Additive', 'lightflow_atmosphere.ui.ray_alpha':'Alpha',
            'lightflow_atmosphere.ui.ray_scene_depth':'Scene depth', 'lightflow_atmosphere.ui.ray_scene_shadows':'Scene + light shadows',
            'lightflow_atmosphere.ui.ray_always_visible':'Always visible', 'lightflow_atmosphere.ui.ray_free_direction':'Free direction',
            'lightflow_atmosphere.ui.ray_missing_light':'Linked light unavailable',
            'lightflow_atmosphere.ui.preview':'Preview', 'lightflow_atmosphere.ui.emission':'Emission',
            'lightflow_atmosphere.ui.select_effect':'Select an effect in the Outliner or add one here.',
            'lightflow_atmosphere.ui.select_existing':'Select existing…', 'lightflow_atmosphere.ui.cloud_detail':'Cloud detail',
            'lightflow_atmosphere.ui.motion':'Motion', 'lightflow_atmosphere.ui.edit_particle':'Edit particle effect',
            'lightflow_atmosphere.ui.play':'Play', 'lightflow_atmosphere.ui.pause':'Pause', 'lightflow_atmosphere.ui.restart':'Restart', 'lightflow_atmosphere.ui.reload':'Reload particle source', 'lightflow_atmosphere.ui.invalid_source':'Invalid particle source; current effect was kept.',
            'lightflow_atmosphere.ui.frame':'Preview time (s)', 'lightflow_atmosphere.ui.repeat':'Repeat one-shot effect',
            'lightflow_atmosphere.ui.scrub_help':'Move the time slider to pause and preview a still frame.',
            'lightflow_atmosphere.ui.numeric_help':'Numeric components are shown here. Expressions and events are available under JSON / Molang.',
            'lightflow_atmosphere.ui.spawn_rate':'Particles per second', 'lightflow_atmosphere.ui.particle_limit':'Particle limit',
            'lightflow_atmosphere.ui.duration':'Emitter duration (s)', 'lightflow_atmosphere.ui.lifetime':'Particle lifetime (s)',
            'lightflow_atmosphere.ui.speed':'Initial speed', 'lightflow_atmosphere.ui.scene_scale':'Scene scale',
            'lightflow_atmosphere.ui.bloom':'Bloom contribution', 'lightflow_atmosphere.ui.width':'Particle width',
            'lightflow_atmosphere.ui.height':'Particle height', 'lightflow_atmosphere.ui.tint':'Tint',
            'lightflow_atmosphere.ui.texture':'Choose texture PNG…', 'lightflow_atmosphere.ui.source':'JSON / Molang',
            'lightflow_atmosphere.ui.edit_json':'Edit JSON / Molang…', 'lightflow_atmosphere.ui.replace':'Replace effect JSON…',
            'lightflow_atmosphere.ui.select_child':'Select child effect', 'lightflow_atmosphere.ui.import_child':'Import child effect',
            'lightflow_atmosphere.ui.invalid_json':'The effect JSON is invalid. Open JSON / Molang to fix or replace it.',
            'lightflow_atmosphere.ui.invalid_particle_json':'Invalid particle JSON',
            'lightflow_atmosphere.ui.json_valid':'Valid JSON · {count} components',
            'lightflow_atmosphere.ui.json_format':'Format JSON',
            'lightflow_atmosphere.ui.json_format_shortcut':'Format JSON · Ctrl+Shift+F',
            'lightflow_atmosphere.ui.missing_particle_components':'The JSON needs particle_effect.description and components',
            'lightflow_atmosphere.ui.behaviour':'Behaviour', 'lightflow_atmosphere.ui.cycle':'Cycle',
            'lightflow_atmosphere.ui.cycle_once':'Once', 'lightflow_atmosphere.ui.cycle_loop':'Loop', 'lightflow_atmosphere.ui.cycle_expression':'Expression',
            'lightflow_atmosphere.ui.sleep_time':'Pause between cycles', 'lightflow_atmosphere.ui.variables':'Variables & expressions…',
            'lightflow_atmosphere.ui.emitter':'Emitter', 'lightflow_atmosphere.ui.particle':'Particle',
            'lightflow_atmosphere.ui.variables_start':'When the emitter starts', 'lightflow_atmosphere.ui.variables_update':'Each emitter update',
            'lightflow_atmosphere.ui.variables_particle_update':'Each particle update', 'lightflow_atmosphere.ui.variables_particle_render':'Each particle render',
            'lightflow_atmosphere.ui.activation_expression':'Activate when', 'lightflow_atmosphere.ui.expiration_expression':'Finish when',
            'lightflow_atmosphere.ui.variables_help':'Use Molang, for example: variable.speed = 2; Changes apply on Confirm. Complex legacy expressions remain available in JSON / Molang.',
            'lightflow_atmosphere.ui.particle_inactive':'Not rendered: enable the effect and its visibility in the Outliner.',
            'lightflow_atmosphere.plugin.title': 'Lightflow Atmosphere',
            'lightflow_atmosphere.name.volume': 'Volume Domain',
            'lightflow_atmosphere.action.add_vfx': 'Add VFX',
            'lightflow_atmosphere.action.add_vfx.desc': 'Add a volume, God Ray, or particle effect',
            'lightflow_atmosphere.action.add_particle': 'Add Particle Effect',
            'lightflow_atmosphere.action.add': 'Add Volume Domain',
            'lightflow_atmosphere.action.add.desc': 'Add a local fog, cloud, or light-shaft rendering domain',
            'lightflow_atmosphere.action.add_god_ray': 'Add God Ray',
            'lightflow_atmosphere.action.import_particle': 'Import Particle Effect (.particle.json)',
            'lightflow_atmosphere.action.edit': 'Edit Volume Domain',
            'lightflow_atmosphere.action.fit': 'Fit Volume to Selection',
            'lightflow_atmosphere.action.settings': 'Atmosphere Quality...',
            'lightflow_atmosphere.panel.title': 'VOLUME',
            'lightflow_atmosphere.panel.none': 'Select a Volume Domain',
            'lightflow_atmosphere.panel.multiple': 'Volume Domains',
            'lightflow_atmosphere.panel.multiple_hint': 'Changes apply to all selected volumes.',
            'lightflow_atmosphere.panel.summary_hint': 'Selected Volume Domain',
            'lightflow_atmosphere.panel.look': 'Look',
            'lightflow_atmosphere.panel.look_desc': 'Color, density and effect',
            'lightflow_atmosphere.panel.basic': 'Basic',
            'lightflow_atmosphere.panel.basic_desc': 'The visible result',
            'lightflow_atmosphere.panel.shape': 'Shape',
            'lightflow_atmosphere.panel.shape_desc': 'Size, distribution and motion',
            'lightflow_atmosphere.panel.advanced': 'Advanced',
            'lightflow_atmosphere.panel.advanced_desc': 'Lighting and performance controls',
            'lightflow_atmosphere.panel.shape_distribution': 'Shape & Distribution',
            'lightflow_atmosphere.panel.light_response': 'Advanced Light Response',
            'lightflow_atmosphere.panel.quality': 'Quality',
            'lightflow_atmosphere.panel.quality_desc': 'Viewport and final render',
            'lightflow_atmosphere.panel.quality_advanced': 'Advanced Quality',
            'lightflow_atmosphere.panel.quick_setup': 'Quick Setup',
            'lightflow_atmosphere.panel.geometry': 'Transform & Size',
            'lightflow_atmosphere.panel.rendering_model': 'Rendering Model',
            'lightflow_atmosphere.panel.optics': 'Optics',
            'lightflow_atmosphere.panel.scattering': 'Scattering Medium',
            'lightflow_atmosphere.panel.absorption': 'Absorption & Ambient',
            'lightflow_atmosphere.panel.lighting': 'Lighting Response',
            'lightflow_atmosphere.panel.density_shape': 'Density Shape',
            'lightflow_atmosphere.panel.height_profile': 'Height Profile',
            'lightflow_atmosphere.panel.cloud_structure': 'Cloud Structure',
            'lightflow_atmosphere.panel.motion': 'Wind & Motion',
            'lightflow_atmosphere.dialog.edit': 'Volume Domain',
            'lightflow_atmosphere.dialog.edit_many': 'Edit Volume Domains',
            'lightflow_atmosphere.group.domain': 'Domain Setup',
            'lightflow_atmosphere.group.optics': 'Optics & Lighting',
            'lightflow_atmosphere.group.shape': 'Shape & Motion',
            'lightflow_atmosphere.group.art_direction': 'Scene Art Direction',
            'lightflow_atmosphere.group.viewport': 'Viewport',
            'lightflow_atmosphere.group.render': 'Studio Render',
            'lightflow_atmosphere.group.performance': 'Performance',
            'lightflow_atmosphere.field.preset': 'Starting Point',
            'lightflow_atmosphere.field.enabled': 'Enabled',
            'lightflow_atmosphere.field.volume_enabled': 'Enabled',
            'lightflow_atmosphere.field.visibility': 'Visible',
            'lightflow_atmosphere.help.volume_enabled': 'Enable this volume in the viewport and final render.',
            'lightflow_atmosphere.help.visibility': 'Outliner visibility. Hidden volumes do not render. Hide only helpers in Scene instead.',
            'lightflow_atmosphere.panel.inactive_reason': 'Not rendered: check Enabled, Visible and global Atmosphere.',
            'lightflow_atmosphere.field.position': 'Position',
            'lightflow_atmosphere.field.rotation': 'Rotation',
            'lightflow_atmosphere.field.shape': 'Shape',
            'lightflow_atmosphere.field.size': 'Volume Size',
            'lightflow_atmosphere.field.density_mode': 'Distribution',
            'lightflow_atmosphere.field.composite_mode': 'Effect',
            'lightflow_atmosphere.field.density': 'Amount',
            'lightflow_atmosphere.field.scattering_color': 'Lit Color',
            'lightflow_atmosphere.field.scattering': 'Light Scatter',
            'lightflow_atmosphere.field.absorption_color': 'Shadow Color',
            'lightflow_atmosphere.field.absorption': 'Darkness',
            'lightflow_atmosphere.field.anisotropy': 'Scattering Direction',
            'lightflow_atmosphere.field.ambient': 'Ambient Light',
            'lightflow_atmosphere.field.receive_shadows': 'Receive Shadows',
            'lightflow_atmosphere.field.shadow_fill': 'Scattering Fill',
            'lightflow_atmosphere.field.bloom': 'Bloom Contribution',
            'lightflow_atmosphere.field.edge_feather': 'Soft Edges',
            'lightflow_atmosphere.field.height_falloff': 'Height Falloff',
            'lightflow_atmosphere.field.height_offset': 'Height Base',
            'lightflow_atmosphere.field.noise_scale': 'Cloud Scale',
            'lightflow_atmosphere.field.noise_detail': 'Cloud Detail',
            'lightflow_atmosphere.field.coverage': 'Cloud Coverage',
            'lightflow_atmosphere.field.erosion': 'Cloud Softness',
            'lightflow_atmosphere.field.wind_direction': 'Wind Direction',
            'lightflow_atmosphere.field.wind_speed': 'Wind Speed',
            'lightflow_atmosphere.field.technique': 'Render Technique',
            'lightflow_atmosphere.option.auto': 'Auto (recommended)',
            'lightflow_atmosphere.option.quality_draft': 'Draft',
            'lightflow_atmosphere.option.quality_balanced': 'Balanced',
            'lightflow_atmosphere.option.quality_high': 'High',
            'lightflow_atmosphere.option.quality_ultra': 'Ultra',
            'lightflow_atmosphere.option.quality_reference': 'Reference',
            'lightflow_atmosphere.field.shaft_length': 'Shaft Length',
            'lightflow_atmosphere.field.shaft_decay': 'Shaft Decay',
            'lightflow_atmosphere.field.shaft_radius': 'Shaft Radius',
            'lightflow_atmosphere.field.shaft_exposure': 'Shaft Exposure',
            'lightflow_atmosphere.field.max_opacity': 'Maximum Opacity',
            'lightflow_atmosphere.field.saturation': 'Saturation',
            'lightflow_atmosphere.field.contrast': 'Contrast',
            'lightflow_atmosphere.field.posterize': 'Posterize Levels',
            'lightflow_atmosphere.field.dither': 'Dither',
            'lightflow_atmosphere.field.color_quantization': 'Color Quantization',
            'lightflow_atmosphere.field.near_color': 'Fog Ramp Near Color',
            'lightflow_atmosphere.field.far_color': 'Fog Ramp Far Color',
            'lightflow_atmosphere.field.fog_ramp_strength': 'Fog Ramp Strength',
            'lightflow_atmosphere.field.fog_ramp_curve': 'Fog Ramp Curve',
            'lightflow_atmosphere.option.keep_values': 'Current Values',
            'lightflow_atmosphere.option.box': 'Box',
            'lightflow_atmosphere.option.sphere': 'Sphere / Ellipsoid',
            'lightflow_atmosphere.option.uniform': 'Uniform Fog',
            'lightflow_atmosphere.option.height': 'Height Fog',
            'lightflow_atmosphere.option.cloud': 'Procedural Clouds',
            'lightflow_atmosphere.option.detail_low': '1 - Low',
            'lightflow_atmosphere.option.detail_medium': '2 - Medium',
            'lightflow_atmosphere.option.detail_high': '3 - High',
            'lightflow_atmosphere.option.detail_ultra': '4 - Ultra',
            'lightflow_atmosphere.option.physical': 'Fog / Clouds',
            'lightflow_atmosphere.option.shafts': 'Additive Light Shafts',
            'lightflow_atmosphere.preset.soft_mist': 'Soft Mist',
            'lightflow_atmosphere.preset.godrays': 'God Rays',
            'lightflow_atmosphere.preset.clouds': 'Cloud Volume',
            'lightflow_atmosphere.preset.stage_haze': 'Stage Haze',
            'lightflow_atmosphere.preset.cinematic_dust': 'Cinematic Dust',
            'lightflow_atmosphere.preset.ground_fog': 'Ground Fog',
            'lightflow_atmosphere.preset.smoke': 'Smoke',
            'lightflow_atmosphere.preset.dream_fog': 'Dream Fog',
            'lightflow_atmosphere.help.density': 'Overall amount of fog or cloud inside the domain.',
            'lightflow_atmosphere.help.scattering_color': 'Color the medium takes when it catches light.',
            'lightflow_atmosphere.help.scattering': 'How strongly the medium catches scene lights.',
            'lightflow_atmosphere.help.absorption_color': 'Color that remains in the darker parts of the medium.',
            'lightflow_atmosphere.help.absorption': 'How much light the medium blocks.',
            'lightflow_atmosphere.help.anisotropy': 'Negative values favor backscattering; positive values favor forward scattering.',
            'lightflow_atmosphere.help.ambient': 'Minimum light visible away from direct lights.',
            'lightflow_atmosphere.help.edge_feather': 'Softens the boundary of the volume.',
            'lightflow_atmosphere.button.advanced': 'Advanced Volume Settings...',
            'lightflow_atmosphere.settings.title': 'Atmosphere Quality',
            'lightflow_atmosphere.settings.global_fog_enabled': 'Global fog',
            'lightflow_atmosphere.settings.global_fog_mode': 'Global fog model',
            'lightflow_atmosphere.settings.global_fog_color': 'Fog color',
            'lightflow_atmosphere.settings.global_fog_start': 'Start / clear zone',
            'lightflow_atmosphere.settings.global_fog_end': 'End distance',
            'lightflow_atmosphere.settings.global_fog_density': 'Density',
            'lightflow_atmosphere.settings.global_fog_distance_offset': 'Distance offset',
            'lightflow_atmosphere.settings.global_fog_max_opacity': 'Maximum opacity',
            'lightflow_atmosphere.settings.global_fog_strict_linear': 'Strict linear interpolation',
            'lightflow_atmosphere.settings.global_fog_base_height': 'Base height',
            'lightflow_atmosphere.settings.global_fog_height_falloff': 'Height falloff',
            'lightflow_atmosphere.settings.global_fog_sync_background': 'Match color background',
            'lightflow_atmosphere.settings.enabled': 'Atmosphere Renderer',
            'lightflow_atmosphere.settings.preview_quality': 'Viewport Steps',
            'lightflow_atmosphere.settings.preview_scale': 'Viewport Resolution',
            'lightflow_atmosphere.settings.render_quality': 'Studio Render Steps',
            'lightflow_atmosphere.settings.render_scale': 'Studio Render Resolution',
            'lightflow_atmosphere.settings.jitter': 'Temporal Jitter',
            'lightflow_atmosphere.settings.temporal_response': 'Temporal Response',
            'lightflow_atmosphere.settings.temporal_interleave': 'Checkerboard Temporal Interleave',
            'lightflow_atmosphere.settings.shadow_mode': 'Volumetric Shadows',
            'lightflow_atmosphere.settings.helper_mask': 'Keep Helpers Clear',
            'lightflow_atmosphere.settings.static_cache': 'Cache Unchanged Frames',
            'lightflow_atmosphere.settings.frustum_culling': 'Skip Off-Screen Volumes',
            'lightflow_atmosphere.undo.add': 'Add Volume Domain',
            'lightflow_atmosphere.undo.edit': 'Edit Volume Domain',
            'lightflow_atmosphere.undo.fit': 'Fit Volume Domain',
            'lightflow_atmosphere.message.render_failed': 'Atmosphere disabled after a GPU render error',
            'lightflow_atmosphere.message.light_manager_required': 'Lightflow Atmosphere requires Light Manager.'
        });
        Language.addTranslations('es', {
            'lightflow_atmosphere.ui.look':'Aspecto', 'lightflow_atmosphere.ui.shape':'Forma', 'lightflow_atmosphere.ui.light':'Luz',
            'lightflow_atmosphere.ui.ray_gizmos':'Editar forma del rayo', 'lightflow_atmosphere.ui.edit_ray':'Editar rayo de luz',
            'lightflow_atmosphere.ui.ray_from_light':'Crear rayo de luz vinculado', 'lightflow_atmosphere.ui.ray_detach':'Desvincular rayo de luz',
            'lightflow_atmosphere.ui.ray_attached':'Seguir posición de la luz',
            'lightflow_atmosphere.ui.ray_color_detail':'Transición de color',
            'lightflow_atmosphere.ui.ray_compositing':'Mezcla y Bloom',
            'lightflow_atmosphere.ui.ray_plane':'Plano y orientación',
            'lightflow_atmosphere.ui.ray_soft_edges':'Bordes y desvanecimiento',
            'lightflow_atmosphere.ui.ray_shadow_detail':'Oclusión de la luz',
            'lightflow_atmosphere.ui.ray_camera_fade':'Desvanecer con la distancia',
            'lightflow_atmosphere.ui.volume_recipe':'Preajustes y mezcla',
            'lightflow_atmosphere.ui.height_distribution':'Distribución en altura',
            'lightflow_atmosphere.ui.ray_attachment_help':'Mover el rayo ajusta su posición relativa a la luz. Desvincúlalo para conservar su posición y dirección actuales.',
            'lightflow_atmosphere.ui.activate_effect':'Activar efecto', 'lightflow_atmosphere.ui.particle_texture':'Textura de la partícula',
            'lightflow_atmosphere.ui.particle_setup':'Configuración rápida…', 'lightflow_atmosphere.ui.preset_snow':'Nieve', 'lightflow_atmosphere.ui.preset_rain':'Lluvia', 'lightflow_atmosphere.ui.preset_sparks':'Chispas',
            'lightflow_atmosphere.ui.import_effect':'Importar .particle.json…', 'lightflow_atmosphere.ui.export_effect':'Exportar .particle.json…',
            'lightflow_atmosphere.ui.snowstorm':'Editar en Snowstorm…', 'lightflow_atmosphere.ui.snowstorm_help':'Edita el efecto en Snowstorm, guarda el archivo .particle.json y usa Reemplazar JSON para importarlo de nuevo.',
            'lightflow_atmosphere.ui.snowstorm_export_help':'Este efecto es demasiado grande para un enlace. Exporta su .particle.json y ábrelo en Snowstorm.',
            'lightflow_atmosphere.ui.snowstorm_texture_help':'Importa esta textura por separado en Snowstorm; el enlace incluye imágenes PNG compactas.',
            'lightflow_atmosphere.ui.particle_distribution':'Forma del emisor', 'lightflow_atmosphere.ui.particle_motion':'Movimiento',
            'lightflow_atmosphere.ui.emitter_point':'Punto', 'lightflow_atmosphere.ui.emitter_box':'Caja', 'lightflow_atmosphere.ui.emitter_sphere':'Esfera',
            'lightflow_atmosphere.ui.emitter_shape':'Forma', 'lightflow_atmosphere.ui.emitter_size':'Tamaño del emisor', 'lightflow_atmosphere.ui.emitter_radius':'Radio del emisor',
            'lightflow_atmosphere.ui.acceleration':'Aceleración', 'lightflow_atmosphere.ui.drag':'Resistencia del aire',
            'lightflow_atmosphere.ui.quality_scope':'Estos ajustes de calidad afectan a todos los volúmenes del proyecto.',
            'lightflow_atmosphere.ui.enable_atmosphere':'Activar Atmósfera global',
            'lightflow_atmosphere.ui.ray':'Rayo de luz', 'lightflow_atmosphere.ui.particles':'Partículas',
            'lightflow_atmosphere.ui.ray_camera_axis':'Cámara / eje del rayo', 'lightflow_atmosphere.ui.ray_world_y':'Cámara / eje Y del mundo',
            'lightflow_atmosphere.ui.ray_fixed':'Plano fijo', 'lightflow_atmosphere.ui.ray_additive':'Aditiva', 'lightflow_atmosphere.ui.ray_alpha':'Alfa',
            'lightflow_atmosphere.ui.ray_scene_depth':'Profundidad de la escena', 'lightflow_atmosphere.ui.ray_scene_shadows':'Escena y sombras de la luz',
            'lightflow_atmosphere.ui.ray_always_visible':'Siempre visible', 'lightflow_atmosphere.ui.ray_free_direction':'Dirección libre',
            'lightflow_atmosphere.ui.ray_missing_light':'La luz vinculada no está disponible',
            'lightflow_atmosphere.ui.preview':'Vista', 'lightflow_atmosphere.ui.emission':'Emisión',
            'lightflow_atmosphere.ui.select_effect':'Selecciona un efecto en el Outliner o añade uno aquí.',
            'lightflow_atmosphere.ui.select_existing':'Seleccionar existente…', 'lightflow_atmosphere.ui.cloud_detail':'Detalle de nubes',
            'lightflow_atmosphere.ui.motion':'Movimiento', 'lightflow_atmosphere.ui.edit_particle':'Editar partículas',
            'lightflow_atmosphere.ui.play':'Reproducir', 'lightflow_atmosphere.ui.pause':'Pausar', 'lightflow_atmosphere.ui.restart':'Reiniciar', 'lightflow_atmosphere.ui.reload':'Recargar origen de partícula', 'lightflow_atmosphere.ui.invalid_source':'El origen no es válido; se conservó el efecto actual.',
            'lightflow_atmosphere.ui.frame':'Tiempo de vista previa (s)', 'lightflow_atmosphere.ui.repeat':'Repetir emisión única',
            'lightflow_atmosphere.ui.scrub_help':'Desliza el tiempo para pausar y ver un instante del efecto.',
            'lightflow_atmosphere.ui.numeric_help':'Aquí puedes editar valores numéricos. Las expresiones y eventos están en JSON / Molang.',
            'lightflow_atmosphere.ui.spawn_rate':'Partículas por segundo', 'lightflow_atmosphere.ui.particle_limit':'Límite de partículas',
            'lightflow_atmosphere.ui.duration':'Duración del emisor (s)', 'lightflow_atmosphere.ui.lifetime':'Vida de cada partícula (s)',
            'lightflow_atmosphere.ui.speed':'Velocidad inicial', 'lightflow_atmosphere.ui.scene_scale':'Escala en la escena',
            'lightflow_atmosphere.ui.bloom':'Aporte al Bloom', 'lightflow_atmosphere.ui.width':'Ancho de partícula',
            'lightflow_atmosphere.ui.height':'Alto de partícula', 'lightflow_atmosphere.ui.tint':'Tinte',
            'lightflow_atmosphere.ui.texture':'Elegir textura PNG…', 'lightflow_atmosphere.ui.source':'JSON / Molang',
            'lightflow_atmosphere.ui.edit_json':'Editar JSON / Molang…', 'lightflow_atmosphere.ui.replace':'Reemplazar JSON del efecto…',
            'lightflow_atmosphere.ui.select_child':'Seleccionar efecto hijo', 'lightflow_atmosphere.ui.import_child':'Importar efecto hijo',
            'lightflow_atmosphere.ui.invalid_json':'El JSON del efecto no es válido. Abre JSON / Molang para corregirlo o reemplazarlo.',
            'lightflow_atmosphere.ui.invalid_particle_json':'JSON de partícula no válido',
            'lightflow_atmosphere.ui.json_valid':'JSON válido · {count} componentes',
            'lightflow_atmosphere.ui.json_format':'Formatear JSON',
            'lightflow_atmosphere.ui.json_format_shortcut':'Formatear JSON · Ctrl+Shift+F',
            'lightflow_atmosphere.ui.missing_particle_components':'El JSON necesita particle_effect.description y components',
            'lightflow_atmosphere.ui.behaviour':'Comportamiento', 'lightflow_atmosphere.ui.cycle':'Ciclo',
            'lightflow_atmosphere.ui.cycle_once':'Una vez', 'lightflow_atmosphere.ui.cycle_loop':'Repetir', 'lightflow_atmosphere.ui.cycle_expression':'Expresión',
            'lightflow_atmosphere.ui.sleep_time':'Pausa entre ciclos', 'lightflow_atmosphere.ui.variables':'Variables y expresiones…',
            'lightflow_atmosphere.ui.emitter':'Emisor', 'lightflow_atmosphere.ui.particle':'Partícula',
            'lightflow_atmosphere.ui.variables_start':'Al iniciar el emisor', 'lightflow_atmosphere.ui.variables_update':'En cada actualización del emisor',
            'lightflow_atmosphere.ui.variables_particle_update':'En cada actualización de la partícula', 'lightflow_atmosphere.ui.variables_particle_render':'En cada render de la partícula',
            'lightflow_atmosphere.ui.activation_expression':'Activar cuando', 'lightflow_atmosphere.ui.expiration_expression':'Finalizar cuando',
            'lightflow_atmosphere.ui.variables_help':'Usa Molang, por ejemplo: variable.speed = 2; Los cambios se aplican al confirmar. Las expresiones complejas antiguas siguen disponibles en JSON / Molang.',
            'lightflow_atmosphere.ui.particle_inactive':'No se renderiza: activa el efecto y su visibilidad en el Outliner.',
            'lightflow_atmosphere.plugin.title': 'Atmósfera Lightflow',
            'lightflow_atmosphere.name.volume': 'Dominio de volumen',
            'lightflow_atmosphere.action.add_vfx': 'Añadir VFX',
            'lightflow_atmosphere.action.add_vfx.desc': 'Añade un volumen, un rayo de luz o un efecto de partículas',
            'lightflow_atmosphere.action.add_particle': 'Añadir efecto de partículas',
            'lightflow_atmosphere.action.add': 'Añadir dominio volumétrico',
            'lightflow_atmosphere.action.add.desc': 'Añade un área local de niebla, nubes o rayos de luz',
            'lightflow_atmosphere.action.add_god_ray': 'Añadir rayo de luz',
            'lightflow_atmosphere.action.import_particle': 'Importar efecto de partículas (.particle.json)',
            'lightflow_atmosphere.action.edit': 'Editar dominio volumétrico',
            'lightflow_atmosphere.action.fit': 'Ajustar volumen a la selección',
            'lightflow_atmosphere.action.settings': 'Calidad de atmósfera...',
            'lightflow_atmosphere.panel.title': 'VOLUMEN',
            'lightflow_atmosphere.panel.multiple': 'Dominios volumétricos',
            'lightflow_atmosphere.panel.multiple_hint': 'Los cambios se aplican a todos los volúmenes seleccionados.',
            'lightflow_atmosphere.panel.summary_hint': 'Dominio volumétrico seleccionado',
            'lightflow_atmosphere.panel.look': 'Aspecto',
            'lightflow_atmosphere.panel.look_desc': 'Color, densidad y efecto',
            'lightflow_atmosphere.panel.basic': 'Básico',
            'lightflow_atmosphere.panel.basic_desc': 'El resultado visible',
            'lightflow_atmosphere.panel.shape': 'Forma',
            'lightflow_atmosphere.panel.shape_desc': 'Tamaño, distribución y movimiento',
            'lightflow_atmosphere.panel.advanced': 'Avanzado',
            'lightflow_atmosphere.panel.advanced_desc': 'Iluminación y rendimiento',
            'lightflow_atmosphere.panel.shape_distribution': 'Forma y distribución',
            'lightflow_atmosphere.panel.light_response': 'Respuesta de luz avanzada',
            'lightflow_atmosphere.panel.quality': 'Calidad',
            'lightflow_atmosphere.panel.quality_desc': 'Vista previa y render final',
            'lightflow_atmosphere.panel.quality_advanced': 'Calidad avanzada',
            'lightflow_atmosphere.panel.quick_setup': 'Configuración rápida',
            'lightflow_atmosphere.panel.geometry': 'Transformación y tamaño',
            'lightflow_atmosphere.panel.rendering_model': 'Modelo de renderizado',
            'lightflow_atmosphere.panel.optics': 'Óptica',
            'lightflow_atmosphere.panel.scattering': 'Dispersión de luz',
            'lightflow_atmosphere.panel.absorption': 'Absorción y ambiente',
            'lightflow_atmosphere.panel.lighting': 'Respuesta a la luz',
            'lightflow_atmosphere.panel.density_shape': 'Forma de densidad',
            'lightflow_atmosphere.panel.height_profile': 'Perfil de altura',
            'lightflow_atmosphere.panel.cloud_structure': 'Estructura de nubes',
            'lightflow_atmosphere.panel.motion': 'Viento y movimiento',
            'lightflow_atmosphere.panel.none': 'Selecciona un dominio volumétrico',
            'lightflow_atmosphere.dialog.edit': 'Dominio volumétrico',
            'lightflow_atmosphere.dialog.edit_many': 'Editar dominios volumétricos',
            'lightflow_atmosphere.field.preset': 'Punto de partida',
            'lightflow_atmosphere.field.enabled': 'Activado',
            'lightflow_atmosphere.field.volume_enabled': 'Activado',
            'lightflow_atmosphere.field.visibility': 'Visible',
            'lightflow_atmosphere.help.volume_enabled': 'Activar este volumen en la vista y el render final.',
            'lightflow_atmosphere.help.visibility': 'Visibilidad del Outliner. Un volumen oculto no se renderiza. Para ocultar solo sus guías, usa Escena.',
            'lightflow_atmosphere.panel.inactive_reason': 'No se renderiza: revisa Activado, Visible y Atmósfera global.',
            'lightflow_atmosphere.field.position': 'Posición',
            'lightflow_atmosphere.field.rotation': 'Rotación',
            'lightflow_atmosphere.field.shape': 'Forma',
            'lightflow_atmosphere.field.size': 'Tamaño del volumen',
            'lightflow_atmosphere.field.density_mode': 'Distribución',
            'lightflow_atmosphere.field.composite_mode': 'Efecto',
            'lightflow_atmosphere.field.density': 'Densidad',
            'lightflow_atmosphere.field.scattering_color': 'Color iluminado',
            'lightflow_atmosphere.field.scattering': 'Dispersión de luz',
            'lightflow_atmosphere.field.absorption_color': 'Color de sombra',
            'lightflow_atmosphere.field.absorption': 'Oscuridad',
            'lightflow_atmosphere.field.anisotropy': 'Dirección de dispersión',
            'lightflow_atmosphere.field.ambient': 'Luz ambiental',
            'lightflow_atmosphere.field.receive_shadows': 'Recibir sombras',
            'lightflow_atmosphere.field.shadow_fill': 'Relleno por dispersión',
            'lightflow_atmosphere.field.bloom': 'Aporte al Bloom',
            'lightflow_atmosphere.field.edge_feather': 'Bordes suaves',
            'lightflow_atmosphere.field.height_falloff': 'Caída por altura',
            'lightflow_atmosphere.field.height_offset': 'Base de altura',
            'lightflow_atmosphere.field.noise_scale': 'Escala de nubes',
            'lightflow_atmosphere.field.noise_detail': 'Detalle de nubes',
            'lightflow_atmosphere.field.coverage': 'Cobertura de nubes',
            'lightflow_atmosphere.field.erosion': 'Suavidad de nubes',
            'lightflow_atmosphere.field.wind_direction': 'Dirección del viento',
            'lightflow_atmosphere.field.wind_speed': 'Velocidad del viento',
            'lightflow_atmosphere.field.technique': 'Técnica de render',
            'lightflow_atmosphere.option.auto': 'Auto (recomendado)',
            'lightflow_atmosphere.option.quality_draft': 'Borrador',
            'lightflow_atmosphere.option.quality_balanced': 'Equilibrada',
            'lightflow_atmosphere.option.quality_high': 'Alta',
            'lightflow_atmosphere.option.quality_ultra': 'Ultra',
            'lightflow_atmosphere.option.quality_reference': 'Referencia',
            'lightflow_atmosphere.field.shaft_length': 'Longitud del haz',
            'lightflow_atmosphere.field.shaft_decay': 'Decaimiento del haz',
            'lightflow_atmosphere.field.shaft_radius': 'Radio del haz',
            'lightflow_atmosphere.field.shaft_exposure': 'Exposición del haz',
            'lightflow_atmosphere.field.max_opacity': 'Opacidad máxima',
            'lightflow_atmosphere.field.saturation': 'Saturación',
            'lightflow_atmosphere.field.contrast': 'Contraste',
            'lightflow_atmosphere.field.posterize': 'Niveles de posterizado',
            'lightflow_atmosphere.field.dither': 'Dither',
            'lightflow_atmosphere.field.color_quantization': 'Cuantización de color',
            'lightflow_atmosphere.field.near_color': 'Color cercano de la rampa',
            'lightflow_atmosphere.field.far_color': 'Color lejano de la rampa',
            'lightflow_atmosphere.field.fog_ramp_strength': 'Intensidad de la rampa',
            'lightflow_atmosphere.field.fog_ramp_curve': 'Curva de la rampa',
            'lightflow_atmosphere.option.keep_values': 'Valores actuales',
            'lightflow_atmosphere.option.box': 'Caja',
            'lightflow_atmosphere.option.sphere': 'Esfera / Elipsoide',
            'lightflow_atmosphere.option.uniform': 'Niebla uniforme',
            'lightflow_atmosphere.option.height': 'Niebla por altura',
            'lightflow_atmosphere.option.cloud': 'Nubes procedurales',
            'lightflow_atmosphere.option.detail_low': '1 - Bajo',
            'lightflow_atmosphere.option.detail_medium': '2 - Medio',
            'lightflow_atmosphere.option.detail_high': '3 - Alto',
            'lightflow_atmosphere.option.detail_ultra': '4 - Ultra',
            'lightflow_atmosphere.option.physical': 'Niebla / nubes',
            'lightflow_atmosphere.option.shafts': 'Haces de luz aditivos',
            'lightflow_atmosphere.preset.soft_mist': 'Niebla suave',
            'lightflow_atmosphere.preset.godrays': 'God Rays',
            'lightflow_atmosphere.preset.clouds': 'Volumen de nubes',
            'lightflow_atmosphere.preset.stage_haze': 'Bruma de escenario',
            'lightflow_atmosphere.preset.cinematic_dust': 'Polvo cinematográfico',
            'lightflow_atmosphere.preset.ground_fog': 'Niebla de suelo',
            'lightflow_atmosphere.preset.smoke': 'Humo',
            'lightflow_atmosphere.preset.dream_fog': 'Niebla onírica',
            'lightflow_atmosphere.help.density': 'Densidad total de niebla o nube dentro del dominio.',
            'lightflow_atmosphere.help.scattering_color': 'Color que toma el medio cuando recibe luz.',
            'lightflow_atmosphere.help.scattering': 'Qué tanto responde el medio a las luces de la escena.',
            'lightflow_atmosphere.help.absorption_color': 'Color que permanece en las partes oscuras del medio.',
            'lightflow_atmosphere.help.absorption': 'Cuánta luz bloquea el medio.',
            'lightflow_atmosphere.help.anisotropy': 'Los valores negativos favorecen la retrodispersión; los positivos, la dispersión hacia delante.',
            'lightflow_atmosphere.help.ambient': 'Luz mínima visible lejos de las luces directas.',
            'lightflow_atmosphere.help.edge_feather': 'Suaviza el límite del volumen.',
            'lightflow_atmosphere.button.advanced': 'Ajustes avanzados del volumen...',
            'lightflow_atmosphere.settings.title': 'Calidad de atmósfera',
            'lightflow_atmosphere.settings.global_fog_enabled': 'Niebla global',
            'lightflow_atmosphere.settings.global_fog_mode': 'Modelo de niebla global',
            'lightflow_atmosphere.settings.global_fog_color': 'Color de niebla',
            'lightflow_atmosphere.settings.global_fog_start': 'Inicio / zona despejada',
            'lightflow_atmosphere.settings.global_fog_end': 'Distancia final',
            'lightflow_atmosphere.settings.global_fog_density': 'Densidad',
            'lightflow_atmosphere.settings.global_fog_distance_offset': 'Desplazamiento de distancia',
            'lightflow_atmosphere.settings.global_fog_max_opacity': 'Opacidad máxima',
            'lightflow_atmosphere.settings.global_fog_strict_linear': 'Interpolación lineal estricta',
            'lightflow_atmosphere.settings.global_fog_base_height': 'Altura base',
            'lightflow_atmosphere.settings.global_fog_height_falloff': 'Caída por altura',
            'lightflow_atmosphere.settings.global_fog_sync_background': 'Igualar fondo de color',
            'lightflow_atmosphere.settings.preview_quality': 'Pasos en el viewport',
            'lightflow_atmosphere.settings.enabled': 'Renderizador atmosférico',
            'lightflow_atmosphere.settings.preview_scale': 'Resolución del viewport',
            'lightflow_atmosphere.settings.render_quality': 'Pasos en Studio Render',
            'lightflow_atmosphere.settings.render_scale': 'Resolución de Studio Render',
            'lightflow_atmosphere.settings.jitter': 'Jitter temporal',
            'lightflow_atmosphere.settings.temporal_response': 'Respuesta temporal',
            'lightflow_atmosphere.settings.temporal_interleave': 'Intercalado temporal checkerboard',
            'lightflow_atmosphere.settings.shadow_mode': 'Sombras volumétricas',
            'lightflow_atmosphere.settings.helper_mask': 'Mantener guías despejadas',
            'lightflow_atmosphere.settings.static_cache': 'Reutilizar fotogramas sin cambios',
            'lightflow_atmosphere.settings.frustum_culling': 'Omitir volúmenes fuera de cámara',
            'lightflow_atmosphere.undo.add': 'Añadir dominio volumétrico',
            'lightflow_atmosphere.undo.edit': 'Editar dominio volumétrico',
            'lightflow_atmosphere.undo.fit': 'Ajustar dominio volumétrico',
            'lightflow_atmosphere.group.domain': 'Configuración del dominio',
            'lightflow_atmosphere.group.optics': 'Óptica e iluminación',
            'lightflow_atmosphere.group.shape': 'Forma y movimiento',
            'lightflow_atmosphere.group.art_direction': 'Dirección artística de escena',
            'lightflow_atmosphere.group.viewport': 'Viewport',
            'lightflow_atmosphere.group.render': 'Studio Render',
            'lightflow_atmosphere.group.performance': 'Rendimiento',
            'lightflow_atmosphere.message.render_failed': 'La atmósfera se desactivó tras un error de render de la GPU',
            'lightflow_atmosphere.message.light_manager_required': 'Lightflow Atmosphere requiere Light Manager.'
        });
    }

    function startAnimationLoop() {
        if (animationHandleType === 'frame' && animationFrame !== null) {
            cancelAnimationFrame(animationFrame);
        } else if (animationHandleType === 'timeout' && animationFrame !== null) {
            clearTimeout(animationFrame);
        }
        animationFrame = null;
        animationHandleType = '';
        lastAnimatedFrame = 0;
        lastPreviewPatchCheck = 0;
        const tick = (time = performance.now()) => {
            if (AtmosphereManager.disposed) return;
            if (time - lastPreviewPatchCheck >= 1000) {
                lastPreviewPatchCheck = time;
                AtmosphereManager.patchAllPreviews();
            }
            const animated = AtmosphereManager.settings.enabled && VolumeElement?.all?.some?.(volume => {
                return volume?.enabled !== false && volume?.visibility !== false && finite(volume?.density, 0) > 0 &&
                    volume?.density_mode === 'cloud' && Math.abs(finite(volume.wind_speed, 0)) > 0.00001;
            });
            const shouldAnimate = animated && !window.LightManagerStudioRenderSession;
            if (shouldAnimate && time - lastAnimatedFrame >= 33) {
                lastAnimatedFrame = time;
                requestPreviewRender();
            }
            if (shouldAnimate) {
                animationHandleType = 'frame';
                animationFrame = requestAnimationFrame(tick);
            } else {
                animationHandleType = 'timeout';
                animationFrame = setTimeout(() => tick(performance.now()), 250);
            }
        };
        AtmosphereManager.patchAllPreviews();
        animationHandleType = 'frame';
        animationFrame = requestAnimationFrame(tick);
    }

    installTranslations();

    let atmosphereRuntimeLoaded = false;
    let deferredAtmosphereLightManagerInit = null;

    function atmosphereDependenciesReady() {
        return !!(
            window.LIGHT_MANAGER_LOADED &&
            getAtmosphereFormUI() &&
            typeof window.applyIndestructibleFormGroups === 'function'
        );
    }

    Plugin.register(PLUGIN_ID, {
        title: 'Lightflow Atmosphere',
        icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAABGElEQVR4AayUsa5BQRCGJ9Pd5Gp0Kr3OM3g67+IVPINOTUUUIiFRcr7Dz1i7LCG+zOzsv3Nmd84eH09Op1/i1vw6f2bQuE//0dAsx5PwGvCYKPq9rhlcddXG90ezCCupaNA3A8Y50IDm8MGpAjQRfcU+se0ZpgvmS7MaprP7Snzw1dYMNIVfC2s4d8HY2fc7EKbEJJojlt2yBKnlfMV/86rlqEqoHdB1kT5M46qEEtdYpzM53nW5lPyhQg5V1HY61bUJlSQ+lRhjWZ1jyaKFNiFXL9cxOkoci7iG23sosbqYWs2XrCpvKyyJvom7uqnFGke7WJfvtt4Q6W93OXbr0HzSIpvd5b4Tizp8FYIP2S3TpBQWEsO+4gwAAP//FK356AAAAAZJREFUAwBufQo06ukMYgAAAABJRU5ErkJggg==',
        author: 'MidFord327',
        description: 'Production-ready local fog, occluded additive light shafts, and procedural cloud domains for the Lightflow rendering suite.',
        tags: ['Lightflow', 'Rendering', 'Volumetrics'],
        version: PLUGIN_VERSION,
        min_version: '4.9.0',
        variant: 'both',
        dependencies: ['light_manager'],

        onload: function loadLightflowAtmosphere() {
            if (atmosphereRuntimeLoaded) return;
            if (!atmosphereDependenciesReady()) {
                if (!deferredAtmosphereLightManagerInit) {
                    deferredAtmosphereLightManagerInit = () => {
                        if (!atmosphereDependenciesReady()) return;
                        window.removeEventListener('light_manager_initialized', deferredAtmosphereLightManagerInit);
                        deferredAtmosphereLightManagerInit = null;
                        loadLightflowAtmosphere();
                    };
                    window.addEventListener('light_manager_initialized', deferredAtmosphereLightManagerInit);
                }
                const lightManagerInstalled = window.Plugins?.all?.some?.(plugin => plugin?.id === 'light_manager' && plugin.installed !== false);
                if (!lightManagerInstalled) {
                    Blockbench.showToastNotification({
                        text: tr('lightflow_atmosphere.message.light_manager_required', 'Lightflow Atmosphere requires Light Manager.'),
                        icon: 'error',
                        expire: 10000
                    });
                }
                return;
            }
            atmosphereRuntimeLoaded = true;
            addAtmosphereDialogStyles();
            // Full developer reloads can load another Outliner plugin after our old
            // runtime is unloaded but before this one registers its element classes.
            // Keep every surviving Atmosphere element core-safe before the first
            // registerType dispatch refreshes Blockbench selection/highlights.
            ensureAtmosphereReloadPlaceholders();
            registerVolumeElement();
            registerGodRayElement();
            installParticleEmitterLifecycle();
            registerParticleEffectElement();
            if (window.ModelProject && window.Property) {
                atmosphereProjectSettingsProperty = new Property(
                    ModelProject,
                    'string',
                    'lightflow_atmosphere_v2_settings_json',
                    { default: '' }
                );
                deletables.push(atmosphereProjectSettingsProperty);
            }
            deletables.push(Blockbench.on('lightflow_cinematic_frame_evaluated', () => syncParticleEffects(window.Preview?.selected?.camera)));
            deletables.push(Blockbench.on('lightflow_cinematic_render_complete', () => syncParticleEffects(window.Preview?.selected?.camera)));
            installActions();
            createAtmospherePanel();
            AtmosphereManager.init();
            publishWindowBinding('LightflowAtmosphereV2Core', AtmosphereV2Core);
            publishWindowBinding('AtmosphereTechniqueRouter', AtmosphereTechniqueRouter);
            publishWindowBinding('LightflowAtmosphere', AtmosphereManager);
            AtmosphereManager.attachFramePipeline();

            const studioListener = Blockbench.on('studio_render_pre_tile', event => AtmosphereManager.prepareStudioTile(event));
            const studioSampleListener = Blockbench.on('studio_render_pre_sample', event => AtmosphereManager.prepareStudioSample(event));
            const selectionListener = Blockbench.on('update_selection', () => {
                syncAtmospherePanel();

                if (atmospherePanel.isVisible() && LightflowVolumeElement.selected.length === 0) {
                    if (Project.mode === 'edit') {
                        Panels.transform.selectTab(Panels.transform);
                    }
                }

                const renderElementSelected = [window.Cube, window.Mesh, window.TextureMesh, window.LightElement].some(ElementType => (
                    ElementType && Array.isArray(ElementType.selected) && ElementType.selected.length > 0
                ));
                if (Project.mode === 'render' && LightflowVolumeElement.selected.length > 0 && !renderElementSelected) {
                    Panels.light_properties?.selectTab(atmospherePanel);
                }
            });
            const lifecycleHydrator = window.LightflowLifecycle?.registerHydrator?.(
                'lightflow_atmosphere',
                ({ project, model, isCurrent, deferred }) => {
                    beginAtmosphereProject(project);
                    if (deferred) return;
                    if (!project || !isCurrent()) {
                        AtmosphereManager.invalidateSceneCache();
                        return;
                    }
                    window.LightflowLifecycle.restoreCustomElements(model, 'lightflow_volume', VolumeElement);
                    window.LightflowLifecycle.restoreCustomElements(model, 'lightflow_god_ray', GodRayElement);
                    window.LightflowLifecycle.restoreCustomElements(model, 'lightflow_particle_effect', ParticleEffectElement);
                    if (!isCurrent()) return;
                    const projectSettingsHydrated = hydrateProjectSettings(project);
                    if (projectSettingsHydrated) window.Canvas?.updateAllFaces?.();
                    AtmosphereManager.invalidateSceneCache();
                    AtmosphereManager.patchAllPreviews();
                    syncParticleEffects(window.Preview?.selected?.camera);
                    syncAtmospherePanel();
                    requestPreviewRender();
                }
            );
            if (lifecycleHydrator) deletables.push(lifecycleHydrator);
            else beginAtmosphereProject(window.Project || null);
            const lightManagerListener = () => {
                AtmosphereManager.invalidateSceneCache();
                AtmosphereManager.patchAllPreviews();
                requestPreviewRender();
            };
            window.addEventListener('light_manager_initialized', lightManagerListener);
            const gizmoVisibilityListener = () => refreshVolumeGizmoVisibility();
            const viewListener = Blockbench.on('update_view', gizmoVisibilityListener);
            window.addEventListener('lightflow_gizmo_visibility_changed', gizmoVisibilityListener);
            const framePipelineReadyListener = () => {
                AtmosphereManager.detachPreviewWrappers();
                AtmosphereManager.attachFramePipeline();
            };
            const framePipelineDisposedListener = () => {
                AtmosphereManager.detachFramePipeline();
                AtmosphereManager.patchAllPreviews();
            };
            window.addEventListener('lightflow_frame_pipeline_ready', framePipelineReadyListener);
            window.addEventListener('lightflow_frame_pipeline_disposed', framePipelineDisposedListener);
            const depthMutationListeners = [
                'update_transform', 'update_geometry', 'update_faces', 'update_uv'
            ].map(eventName => Blockbench.on(eventName, () => AtmosphereManager.invalidateDepthCache()));
            const sceneMutationListeners = [
                'add_cube', 'add_mesh', 'add_texture_mesh', 'remove_cube', 'remove_mesh',
                'undo', 'redo'
            ].map(eventName => Blockbench.on(eventName, () => AtmosphereManager.invalidateSceneCache()));
            deletables.push(studioListener, studioSampleListener, selectionListener, viewListener, ...depthMutationListeners, ...sceneMutationListeners, {
                delete() {
                    window.removeEventListener('light_manager_initialized', lightManagerListener);
                    window.removeEventListener('lightflow_gizmo_visibility_changed', gizmoVisibilityListener);
                    window.removeEventListener('lightflow_frame_pipeline_ready', framePipelineReadyListener);
                    window.removeEventListener('lightflow_frame_pipeline_disposed', framePipelineDisposedListener);
                }
            });
            refreshVolumeGizmoVisibility();
            syncAtmospherePanel();
            startAnimationLoop();
            requestPreviewRender();
        },

        onunload() {
            for(const Type of [VolumeElement,GodRayElement,ParticleEffectElement])if(Type?.animator?.prototype.type==='lightflow_inspection')delete Type.animator;
            for (const project of window.ModelProject?.all || []) window.LightflowLifecycle?.preserveLiveElements?.(project, ['lightflow_volume','lightflow_god_ray','lightflow_particle_effect']);
            atmosphereRuntimeLoaded = false;
            if (deferredAtmosphereLightManagerInit) {
                window.removeEventListener('light_manager_initialized', deferredAtmosphereLightManagerInit);
                deferredAtmosphereLightManagerInit = null;
            }
            beginAtmosphereProject(null);
            if (animationHandleType === 'frame' && animationFrame !== null) {
                cancelAnimationFrame(animationFrame);
            } else if (animationHandleType === 'timeout' && animationFrame !== null) {
                clearTimeout(animationFrame);
            }
            animationFrame = null;
            animationHandleType = '';
            if (typeof previewRenderFrame === 'number') cancelAnimationFrame(previewRenderFrame);
            previewRenderFrame = null;
            window.LightManagerUI?.workspace?.unregister?.(particleEffectPanel);
            window.LightManagerUI?.workspace?.unregister?.(godRayPanel);
            window.LightManagerUI?.workspace?.unregister?.(atmospherePanel);
            // Blockbench recalculates sidebar order while panels/actions are deleted.
            // Keep the element classes alive until those conditions have finished
            // evaluating, then tear down their runtime controllers.
            disposeRegisteredResources();
            AtmosphereManager.dispose();
            disposeParticleEffectElement();
            disposeGodRays();
            if (VolumeElement?.all) {
                VolumeElement.all.forEach(volume => {
                    const mesh = volume?.mesh;
                    mesh?.boxGizmo?.geometry?.dispose?.();
                    mesh?.sphereGizmo?.geometry?.dispose?.();
                    mesh?.boxGizmo?.material?.dispose?.();
                    mesh?.sphereGizmo?.material?.dispose?.();
                    mesh?.boxSelection?.geometry?.dispose?.();
                    mesh?.sphereSelection?.geometry?.dispose?.();
                    mesh?.boxSelection?.material?.dispose?.();
                    mesh?.sphereSelection?.material?.dispose?.();
                    mesh?.geometry?.dispose?.();
                    mesh?.parent?.remove?.(mesh);
                    if (window.Project?.nodes_3d?.[volume.uuid] === mesh) {
                        delete Project.nodes_3d[volume.uuid];
                    }
                });
            }
            if (OutlinerElement.types.lightflow_volume === VolumeElement) {
                delete OutlinerElement.types.lightflow_volume;
            }
            if (NodePreviewController.controllers?.lightflow_volume === volumePreviewController) {
                volumePreviewController.delete();
            }
            // The project keeps custom Outliner elements across a plugin reload.
            // Other plugins may register their element types before Atmosphere loads
            // again, and Blockbench's registration listeners expect every live
            // element to expose mesh.geometry during that gap.
            ensureAtmosphereReloadPlaceholders();
            restoreWindowBindings();
            VolumeElement = null;
            volumePreviewController = null;
            atmospherePanel = null;
            addVolumeAction = null;
            editVolumeAction = null;
            settingsAction = null;
        }
    });
})();
