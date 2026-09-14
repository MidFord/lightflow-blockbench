(function () {
    'use strict';

    const PLUGIN_ID = 'studio_render';
    const STORAGE_KEY = 'studio_render.settings';
    const FRAME_STORAGE_KEY = 'studio_render.frame';
    const PROJECT_CAMERA_PRESETS_PROPERTY = 'studio_render_camera_presets_json';
    const SCENE_COMPOSER_UNDO_ASPECT = 'studio_render_scene_composer';
    const CAMERA_PRESET_SCHEMA_VERSION = 2;
    const MAX_OUTPUT_DIMENSION = 16384;
    const MAX_OUTPUT_PIXELS = 140000000;
    const DEFAULT_TILE_SIZE = 2048;
    const DEFAULT_ZOOM = 42;
    const PROMOTIONAL_RIM_MAX_RENDER_RADIUS = 192;


    const RESOLUTION_PRESETS = {
        hd: [1920, 1080],
        uhd: [3840, 2160],
        dci_4k: [4096, 2160],
        square_4k: [4096, 4096],
        eight_k: [7680, 4320],
        custom: [3840, 2160]
    };

    const DEFAULT_SETTINGS = {
        camera_preset_id: '',
        angle_preset: 'view',
        resolution_preset: 'uhd',
        resolution: [3840, 2160],
        output_scale: 1,
        samples: '4',
        tile_size: 'auto',
        capture_area: 'full',
        match_frame_ratio: true,
        background_mode: 'transparent',
        background_color: '#101218',
        shading: true,
        show_gizmos: false,
        show_tile_grid: false,
        show_advanced: false,
        bloom_enabled: false,
        bloom_threshold: 0.78,
        bloom_soft_knee: 0.22,
        bloom_strength: 0.9,
        bloom_core_strength: 0.28,
        bloom_core_radius: 1.25,
        bloom_halo_strength: 0.72,
        bloom_radius: 24,
        bloom_hdr_strength: 0.75,
        bloom_emissive_strength: 1.25,
        bloom_occlusion: true,
        bloom_pipeline_revision: 3,
        viewport_bloom_enabled: true,
        // 0 follows every viewport render. A numeric value is an optional cap.
        viewport_bloom_fps: 0,
        viewport_bloom_quality: 'adaptive',
        viewport_composer_revision: 3,
        color_grading_enabled: false,
        exposure: 1.0,
        contrast: 1.0,
        saturation: 1.0,
        temperature: 0.0,
        tint: 0.0,
        vignette: 0.0,
        zoom: null,
        destination: 'preview',
        file_name: 'studio_render'
    };

    let exportAction;
    let quickRenderAction;
    let frameAction;
    let resetFrameAction;
    let cameraPresetsAction;
    let sceneComposerAction;
    let sceneComposerPanel;
    let sceneComposerProjectListener;
    let sceneComposerModeListener;
    let sceneComposerCloseListener;
    let sceneComposerLifecycleHydrator;
    let sceneComposerFormListener;
    let sceneComposerPanelStyles;
    let sceneComposerAttachmentEstablished = false;
    let sceneComposerAttachmentTimers = [];
    let sceneComposerAttachmentListener;
    let sceneComposerUndoHooks;
    let framePipelineReadyListener;
    let framePipelineDisposedListener;
    let framePipelineRegistration;
    let framePipelineResources = [];
    let activeSceneComposerUndo = null;
    let sceneComposerRefreshFrame = null;
    let sceneComposerRevision = 0;
    let syncingSceneComposerPanel = false;
    let sceneComposerPanelMode = 'essentials';
    const sceneComposerPanelGroupsOpen = {
        preview: true,
        bloom: true,
        grading: false
    };
    let syncingSceneComposerDialog = false;
    let activeComposerDialog;
    let activeCameraPresetDialog;
    let cameraPresetsProjectProperty;
    let cameraPresetsParsedListener;
    let cameraPositionListener;
    let cameraNavigationMoveHandler;
    let cameraNavigationEndHandler;
    let cameraPresetPersistenceWarningShown = false;
    let stylesheet;
    let activeDialog;
    let currentSettings = Object.assign({}, DEFAULT_SETTINGS);
    let gpuGuidanceShown = false;
    let activeRenderSession = null;
    const studioRenderPreviewOwner = {
        preview: null,
        familyKey: '',
        generation: 0,
        created: 0,
        retired: 0,
        lastRetireReason: ''
    };
    const publishedWindowBindings = new Map();
    const studioRenderReportedWarnings = new Set();
    const studioCameraPresetPreviews = new WeakSet();
    const cameraNavigationIntent = new WeakSet();
    const cameraNavigationBindings = new Map();
    const cameraNavigationStarts = new Map();
    const BLOOM_MASK_STATE = {
        emissiveMaterials: new WeakMap(),
        occluderMaterials: new WeakMap(),
        rendercraftMaterials: new WeakMap(),
        rendercraftBloomSupport: new WeakMap(),
        resources: new Set(),
        derivedResources: new Set()
    };
    const VIEWPORT_COMPOSER_STATE = new Map();
    const BLOOM_PIPELINE_BY_RENDERER = new WeakMap();
    const BLOOM_PIPELINE_INSTANCES = new Set();
    // Capability cache for the 2.3.1 temporal-AA accumulator. The render
    // path prefers RGBA16F linear accumulation and keeps Canvas2D as the
    // compatibility fallback when the framebuffer probe fails.
    const STUDIO_HDR_CAPABILITIES = new WeakMap();
    let activeStudioAccumulatorBytes = 0;
    let lastStudioAccumulationMode = 'cpu_srgb8';

    /*
     * Dialog and panel input is normalized into one settings object. The main
     * render path then plans tiles, drives Blockbench's offscreen preview,
     * composites optional masks/effects, and hands one final image to the
     * selected destination. Viewport Bloom uses a separate preview wrapper.
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

    function claimStudioRenderFlags(session, preview) {
        const values = {
            LightManagerStudioRenderSession: true,
            LightManagerStudioRenderActive: true,
            LightManagerStudioRenderPreview: preview
        };
        session.windowFlags = Object.entries(values).map(([name, ownedValue]) => ({
            name,
            ownedValue,
            hadOwnValue: Object.prototype.hasOwnProperty.call(window, name),
            previousValue: window[name]
        }));
        session.windowFlags.forEach(binding => {
            window[binding.name] = binding.ownedValue;
        });
    }

    function restoreStudioRenderFlags(session) {
        if (!session?.windowFlags) return;
        session.windowFlags.reverse().forEach(binding => {
            if (window[binding.name] !== binding.ownedValue) return;
            if (binding.hadOwnValue) window[binding.name] = binding.previousValue;
            else delete window[binding.name];
        });
        session.windowFlags = null;
        // A scene/material update may have reached its RAF while Studio owned
        // the offscreen compiler. Its causes were intentionally preserved; queue
        // a fresh flush now that material mutation is safe again.
        try {
            if (window.ShaderEngine?.pendingSceneUpdateCauses?.size) {
                window.ShaderEngine.requestSceneUpdate?.('studio_render_release');
            }
        } catch (error) {}
        // Studio pauses the normal shader warm-up queue for the whole async
        // session. Resume it only after shared camera/shadow state is restored.
        try {
            window.ShaderEngine?.scheduleNextShaderWarmup?.();
        } catch (error) {}
        // Non-Studio previews are intentionally frozen while the offscreen
        // renderer owns the GPU. Repaint once ownership is released.
        try {
            window.LightflowRequestPreviewRender?.({ cause: 'studio_render_complete' });
        } catch (error) {}
    }

    const VIEWPORT_BLOOM_PROFILES = Object.freeze({
        adaptive: Object.freeze({
            scale: 1 / 3,
            scaleStates: Object.freeze([0.25, 1 / 3, 0.5, 2 / 3]),
            tier: 1,
            maxLevels: 4,
            minMipSize: 10,
            downsampleKernel: 'hq13_karis_first',
            upsampleKernel: 'tent9',
            maxDimension: 4096,
            adaptive: true
        }),
        performance: Object.freeze({
            scale: 0.25,
            maxLevels: 4,
            minMipSize: 8,
            downsampleKernel: 'dual_kawase',
            upsampleKernel: 'bilinear',
            maxDimension: 2048,
            adaptive: false
        }),
        balanced: Object.freeze({
            scale: 0.5,
            maxLevels: 5,
            minMipSize: 10,
            downsampleKernel: 'hq13_karis_first',
            upsampleKernel: 'tent9',
            maxDimension: 4096,
            adaptive: false
        }),
        high: Object.freeze({
            scale: 2 / 3,
            maxLevels: 6,
            minMipSize: 12,
            downsampleKernel: 'hq13_karis_first',
            upsampleKernel: 'tent9',
            maxDimension: MAX_OUTPUT_DIMENSION,
            adaptive: false
        })
    });
    const STUDIO_BLOOM_PROFILE = Object.freeze({
        ...VIEWPORT_BLOOM_PROFILES.high,
        quality: 'studio_high',
        adaptive: false
    });
    const STUDIO_POST_QUALITY_CONTRACT = Object.freeze({
        version: 'studio-post-max-v1',
        ambientOcclusion: Object.freeze({
            quality: 'studio',
            scale: 1,
            effectiveSPP: 18,
            hierarchyLevels: 0
        }),
        bloom: Object.freeze({
            quality: STUDIO_BLOOM_PROFILE.quality,
            scale: STUDIO_BLOOM_PROFILE.scale,
            maxLevels: STUDIO_BLOOM_PROFILE.maxLevels,
            downsampleKernel: STUDIO_BLOOM_PROFILE.downsampleKernel,
            upsampleKernel: STUDIO_BLOOM_PROFILE.upsampleKernel
        })
    });

    function warnStudioRenderOnce(key, message, error) {
        if (studioRenderReportedWarnings.has(key)) return;
        studioRenderReportedWarnings.add(key);
        console.warn(message, error);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function toNumber(value, fallback) {
        const number = parseFloat(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function roundDimension(value) {
        return Math.max(1, Math.round(toNumber(value, 1)));
    }

    function readJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : fallback;
        } catch (error) {
            warnStudioRenderOnce(`storage-read:${key}`, `[Studio Render] Stored data for "${key}" is invalid; using defaults.`, error);
            return fallback;
        }
    }

    function writeJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            warnStudioRenderOnce(`storage-write:${key}`, `[Studio Render] Could not persist "${key}"; the current session remains usable.`, error);
        }
    }

    function translate(key, fallback) {
        if (typeof tl !== 'function') return fallback || key;
        const value = tl(key);
        return value === key ? (fallback || key) : value;
    }

    function isLightflowRenderMode() {
        const selected = window.Modes?.selected;
        if (!!selected && (selected.id === 'render' || selected === window.Modes?.render)) return true;
        const engine = window.ShaderEngine;
        const viewMode = String(engine?.getActiveViewMode?.() || '').toLowerCase();
        if (viewMode === 'lightflow' || viewMode === 'render') return true;
        const globalMode = String(engine?.globalRenderMode || '').toLowerCase();
        return !!globalMode && globalMode !== 'classic' && globalMode !== 'textured';
    }

    function getViewportBloomProfile(settings) {
        return VIEWPORT_BLOOM_PROFILES[settings?.viewport_bloom_quality] || VIEWPORT_BLOOM_PROFILES.adaptive;
    }

    function truncateText(text, maxLength) {
        const value = String(text || '');
        if (value.length <= maxLength) return value;
        return value.slice(0, Math.max(1, maxLength - 3)) + '...';
    }

    function getRendererContext(renderer) {
        try {
            return renderer && typeof renderer.getContext === 'function'
                ? renderer.getContext()
                : null;
        } catch (error) {
            return null;
        }
    }

    function getGLParameter(gl, parameter, fallback) {
        try {
            const value = gl && parameter !== undefined
                ? gl.getParameter(parameter)
                : null;
            return value || fallback;
        } catch (error) {
            return fallback;
        }
    }

    function classifyGpuRenderer(vendor, rendererName) {
        const text = `${vendor || ''} ${rendererName || ''}`.toLowerCase();

        if (/swiftshader|software|llvmpipe|warp|microsoft basic/.test(text)) {
            return 'software';
        }

        if (/nvidia|geforce|rtx|gtx|quadro|tesla|radeon rx|radeon pro|\brx\s*\d|intel\(r\) arc|arc\(tm\) a|arc\(tm\) b/.test(text)) {
            return 'dedicated';
        }

        if (/intel|uhd|iris|hd graphics|integrated|radeon graphics|vega|apple/.test(text)) {
            return 'integrated';
        }

        return 'unknown';
    }

    function getGpuProfile(renderer) {
        const gl = getRendererContext(renderer);

        if (!gl) {
            return {
                available: false,
                vendor: '',
                renderer: '',
                classification: 'unknown',
                maxTextureSize: 4096,
                maxRenderbufferSize: 4096,
                maxViewportSize: 4096
            };
        }

        let debugInfo = null;
        try {
            debugInfo = gl.getExtension && gl.getExtension('WEBGL_debug_renderer_info');
        } catch (error) {
            debugInfo = null;
        }

        const vendor = debugInfo
            ? getGLParameter(gl, debugInfo.UNMASKED_VENDOR_WEBGL, '')
            : getGLParameter(gl, gl.VENDOR, '');

        const rendererName = debugInfo
            ? getGLParameter(gl, debugInfo.UNMASKED_RENDERER_WEBGL, '')
            : getGLParameter(gl, gl.RENDERER, '');

        const viewportDims = getGLParameter(gl, gl.MAX_VIEWPORT_DIMS, null);
        const maxViewportSize = viewportDims && viewportDims.length >= 2
            ? Math.min(Number(viewportDims[0]) || 4096, Number(viewportDims[1]) || 4096)
            : 4096;

        return {
            available: true,
            vendor: String(vendor || ''),
            renderer: String(rendererName || ''),
            classification: classifyGpuRenderer(vendor, rendererName),
            maxTextureSize: Number(getGLParameter(gl, gl.MAX_TEXTURE_SIZE, 4096)) || 4096,
            maxRenderbufferSize: Number(getGLParameter(gl, gl.MAX_RENDERBUFFER_SIZE, 4096)) || 4096,
            maxViewportSize
        };
    }

    function getGpuClassLabel(profile) {
        const key = profile && profile.classification ? profile.classification : 'unknown';
        const labels = {
            dedicated: translate('studio_render.option.gpu.dedicated', 'Dedicated GPU'),
            integrated: translate('studio_render.option.gpu.integrated', 'Integrated GPU'),
            software: translate('studio_render.option.gpu.software', 'Software Renderer'),
            unknown: translate('studio_render.option.gpu.unknown', 'GPU Unknown')
        };
        return labels[key] || labels.unknown;
    }

    function getGpuDisplayName(profile) {
        if (!profile || !profile.available) {
            return translate('studio_render.option.gpu.unavailable', 'WebGL renderer unavailable');
        }
        return profile.renderer || profile.vendor || translate('studio_render.option.gpu.unknown', 'GPU Unknown');
    }

    function getGpuStatusLabel(renderer) {
        const profile = getGpuProfile(renderer);
        return truncateText(
            `${getGpuClassLabel(profile)} - ${getGpuDisplayName(profile)}`,
            32
        );
    }

    function getGpuGuidanceMessage(profile) {
        const lines = [
            `${translate('studio_render.field.gpu', 'GPU')}: ${getGpuClassLabel(profile)}`,
            `${translate('studio_render.field.gpu_renderer', 'Renderer')}: ${getGpuDisplayName(profile)}`
        ];

        if (profile && profile.available) {
            lines.push(
                `MAX_TEXTURE_SIZE: ${profile.maxTextureSize}`,
                `MAX_RENDERBUFFER_SIZE: ${profile.maxRenderbufferSize}`,
                `MAX_VIEWPORT: ${profile.maxViewportSize}`
            );
        }

        lines.push('');

        if (profile && profile.classification === 'dedicated') {
            lines.push(translate(
                'studio_render.message.gpu_dedicated',
                'Studio Render is already using a renderer that looks like a dedicated GPU.'
            ));
        } else {
            lines.push(translate(
                'studio_render.message.gpu_guidance',
                'Blockbench chooses the WebGL GPU before plugins run. To force a dedicated GPU, set Blockbench.exe to High performance in Windows Graphics settings or your NVIDIA/AMD control panel, then restart Blockbench.'
            ));
        }

        return lines.join('\n');
    }

    function showGpuProfileDetails(renderer) {
        const profile = getGpuProfile(renderer);
        Blockbench.showMessageBox({
            title: translate('studio_render.message.gpu_title', 'Studio Render GPU'),
            message: getGpuGuidanceMessage(profile),
            icon: profile.classification === 'dedicated' ? 'memory' : 'settings_suggest'
        });
    }

    function showGpuGuidanceIfNeeded(profile) {
        if (
            gpuGuidanceShown ||
            !profile ||
            profile.classification === 'dedicated'
        ) {
            return;
        }

        gpuGuidanceShown = true;
        Blockbench.showMessageBox({
            title: translate('studio_render.message.gpu_title', 'Studio Render GPU'),
            message: getGpuGuidanceMessage(profile),
            icon: 'settings_suggest'
        });
    }

    function addTranslations() {
        Language.addTranslations('en', {
            'studio_render.plugin.title': 'Studio Render',
            'studio_render.plugin.description': 'Export clean, high-resolution studio renders with tiled supersampling, transparent backgrounds, GPU guidance, and an adjustable capture frame. Complements Light Manager and Shader Architect in the Lightflow suite.',
            'studio_render.action.export': 'Studio Render',
            'studio_render.action.export.desc': 'Open the adjustable Studio Render frame and capture controls.',
            'studio_render.action.quick': 'Quick Studio Render',
            'studio_render.action.quick.desc': 'Render the current preview immediately with polished 4K studio defaults.',
            'studio_render.action.frame': 'Studio Render Frame',
            'studio_render.action.frame.desc': 'Show or hide the adjustable capture frame for Studio Render.',
            'studio_render.action.reset_frame': 'Reset Studio Render Frame',
            'studio_render.action.reset_frame.desc': 'Crop the Studio Render frame to the visible canvas content.',
            'studio_render.action.capture': 'Render Now',
            'studio_render.action.capture.desc': 'Render the current Studio Render frame.',
            'studio_render.action.settings': 'Render Settings',
            'studio_render.action.settings.desc': 'Open Studio Render settings.',
            'studio_render.action.camera_presets': 'Camera Presets',
            'studio_render.action.camera_presets.desc': 'Create and manage complete camera and render-frame presets for this project.',
            'studio_render.action.view_mode': 'Render Mode',
            'studio_render.action.global_material': 'Global Material',
            'studio_render.action.tile_grid': 'Tile Grid',
            'studio_render.action.tile_grid.desc': 'Show or hide render tile divisions.',
            'studio_render.action.close_frame': 'Close Frame',
            'studio_render.dialog.title': 'Studio Render',
            'studio_render.field.angle': 'Camera',
            'studio_render.field.camera_preset': 'Project Camera Preset',
            'studio_render.field.camera_preset_name': 'Preset Name',
            'studio_render.field.resolution_preset': 'Resolution',
            'studio_render.field.resolution': 'Custom Size',
            'studio_render.field.output_scale': 'Resolution Scale',
            'studio_render.field.samples': 'AA Samples',
            'studio_render.field.tile_size': 'Tile Size',
            'studio_render.field.capture_area': 'Capture Area',
            'studio_render.field.match_frame_ratio': 'Match Frame Ratio',
            'studio_render.field.background_mode': 'Background',
            'studio_render.field.background_color': 'Color',
            'studio_render.field.shading': 'Use Shading',
            'studio_render.field.show_gizmos': 'Show Gizmos',
            'studio_render.field.show_tile_grid': 'Show Tile Grid',
            'studio_render.field.show_advanced': 'Advanced Controls',
            'studio_render.field.bloom_enabled': 'Bloom',
            'studio_render.field.bloom_threshold': 'Bloom Threshold',
            'studio_render.field.bloom_soft_knee': 'Threshold Soft Knee',
            'studio_render.field.bloom_strength': 'Bloom Strength',
            'studio_render.field.bloom_core_strength': 'Hot Core Strength',
            'studio_render.field.bloom_core_radius': 'Hot Core Radius',
            'studio_render.field.bloom_halo_strength': 'Soft Halo Strength',
            'studio_render.field.bloom_radius': 'Soft Halo Radius',
            'studio_render.field.bloom_hdr_strength': 'Bright Surface Bloom',
            'studio_render.field.bloom_emissive_strength': 'Emissive Texture Bloom',
            'studio_render.field.bloom_occlusion': 'Block Bloom Behind Geometry',
            'studio_render.field.viewport_bloom_enabled': 'Preview Bloom in Viewport',
            'studio_render.field.viewport_bloom_fps': 'Bloom FPS Limit (0 = Sync)',
            'studio_render.field.viewport_bloom_quality': 'Viewport Bloom Quality',
            'studio_render.option.viewport_bloom.adaptive': 'Adaptive',
            'studio_render.option.viewport_bloom.performance': 'Performance',
            'studio_render.option.viewport_bloom.balanced': 'Balanced',
            'studio_render.option.viewport_bloom.high': 'High',
            'studio_render.action.open_advanced': 'Advanced Scene Composer...',
            'studio_render.field.color_grading_enabled': 'Color Grading',
            'studio_render.field.exposure': 'Exposure',
            'studio_render.field.contrast': 'Contrast',
            'studio_render.field.saturation': 'Saturation',
            'studio_render.field.temperature': 'Temperature',
            'studio_render.field.tint': 'Tint',
            'studio_render.field.vignette': 'Vignette',
            'studio_render.action.scene_composer': 'Scene Composer...',
            'studio_render.action.scene_composer.desc': 'Match realtime viewport post-processing to Studio Render and coordinate the Lightflow environment',
            'studio_render.panel.composer': 'Image',
            'studio_render.workflow.camera': 'Camera & frame',
            'studio_render.workflow.essentials': 'Essentials',
            'studio_render.workflow.advanced': 'Advanced',
            'studio_render.workflow.output': 'Output',
            'studio_render.workflow.image': 'Image',
            'studio_render.workflow.preview_off': 'Bloom is enabled for export, but its viewport preview is off.',
            'studio_render.workflow.preview_on': 'Bloom preview enabled · Export uses final quality.',
            'studio_render.workflow.bloom_off': 'Bloom disabled in viewport and export.',
            'studio_render.workflow.cancel': 'Cancel render',
            'studio_render.workflow.cancelling': 'Cancelling; restoring the scene…',
            'studio_render.composer.summary': 'Realtime Post-Processing',
            'studio_render.composer.summary.desc': 'Coordinate viewport preview and Studio Render finishing effects.',
            'studio_render.composer.group.preview': 'Viewport Preview',
            'studio_render.composer.group.bloom': 'Bloom',
            'studio_render.composer.group.grading': 'Color Grading',
            'studio_render.composer.section.playback': 'Preview Performance',
            'studio_render.composer.section.threshold': 'Threshold & Response',
            'studio_render.composer.section.core': 'Hot Core',
            'studio_render.composer.section.halo': 'Soft Halo',
            'studio_render.composer.section.sources': 'Light Sources',
            'studio_render.composer.section.image': 'Image Balance',
            'studio_render.composer.section.white_balance': 'White Balance',
            'studio_render.composer.section.finishing': 'Finishing',
            'studio_render.composer.action.advanced': 'Advanced Composer',
            'studio_render.undo.edit_composer': 'Edit Scene Composer',
            'studio_render.field.zoom': 'Focal Length',
            'studio_render.field.gpu': 'GPU',
            'studio_render.field.gpu_renderer': 'Renderer',
            'studio_render.field.destination': 'After Render',
            'studio_render.field.file_name': 'File Name',
            'studio_render.group.camera': 'Camera',
            'studio_render.group.camera_presets': 'Project Camera Presets',
            'studio_render.group.output': 'Output',
            'studio_render.group.frame': 'Frame',
            'studio_render.group.look': 'Look',
            'studio_render.group.effects': 'Final Effects',
            'studio_render.group.export': 'Export',
            'studio_render.option.camera.view': 'Current View',
            'studio_render.option.camera_preset.none': 'No Preset Selected',
            'studio_render.option.resolution.hd': 'HD - 1920 x 1080',
            'studio_render.option.resolution.uhd': '4K UHD - 3840 x 2160',
            'studio_render.option.resolution.dci_4k': '4K DCI - 4096 x 2160',
            'studio_render.option.resolution.square_4k': 'Square 4K - 4096 x 4096',
            'studio_render.option.resolution.eight_k': '8K UHD - 7680 x 4320',
            'studio_render.option.resolution.custom': 'Custom',
            'studio_render.option.samples.1': '1 sample',
            'studio_render.option.samples.2': '2 samples',
            'studio_render.option.samples.3': '3 samples',
            'studio_render.option.samples.4': '4 samples',
            'studio_render.option.samples.6': '6 samples',
            'studio_render.option.samples.8': '8 samples',
            'studio_render.option.tile.auto': 'Auto',
            'studio_render.option.tile.1024': '1024 px',
            'studio_render.option.tile.1536': '1536 px',
            'studio_render.option.tile.2048': '2048 px',
            'studio_render.option.tile.3072': '3072 px',
            'studio_render.option.gpu.dedicated': 'Dedicated GPU',
            'studio_render.option.gpu.integrated': 'Integrated GPU',
            'studio_render.option.gpu.software': 'Software Renderer',
            'studio_render.option.gpu.unknown': 'GPU Unknown',
            'studio_render.option.gpu.unavailable': 'WebGL renderer unavailable',
            'studio_render.option.area.full': 'Full Composition',
            'studio_render.option.area.frame': 'Render Frame',
            'studio_render.option.background.transparent': 'Transparent',
            'studio_render.option.background.solid': 'Solid Color',
            'studio_render.option.destination.preview': 'Open Preview',
            'studio_render.option.destination.save': 'Save PNG',
            'studio_render.option.destination.clipboard': 'Copy PNG',
            'studio_render.option.destination.texture': 'Load as Texture',
            'studio_render.button.render': 'Render',
            'studio_render.button.edit_frame': 'Edit Frame',
            'studio_render.button.reset_frame': 'Reset Frame',
            'studio_render.button.open_frame': 'Open Frame',
            'studio_render.button.apply_preset': 'Apply',
            'studio_render.button.create_preset': 'Create',
            'studio_render.button.update_preset': 'Update',
            'studio_render.button.rename_preset': 'Rename',
            'studio_render.button.delete_preset': 'Delete',
            'studio_render.button.save_preset': 'Save Preset',
            'studio_render.status.preparing': 'Preparing studio render...',
            'studio_render.status.tile': 'Rendering tile',
            'studio_render.status.downsample': 'Compositing final image...',
            'studio_render.status.encoding': 'Encoding PNG in the background...',
            'studio_render.status.handoff': 'Handing off rendered frame...',
            'studio_render.message.no_preview': 'No preview is available to render.',
            'studio_render.message.no_offscreen': 'Blockbench offscreen preview is not ready yet. Open a preview once and try again.',
            'studio_render.message.too_large': 'The requested output is too large for a safe browser canvas.',
            'studio_render.message.rendered': 'Studio render complete',
            'studio_render.message.render_in_progress': 'A Studio Render session is already in progress.',
            'studio_render.message.copied': 'Studio render copied to clipboard',
            'studio_render.message.gpu_title': 'Studio Render GPU',
            'studio_render.message.gpu_dedicated': 'Studio Render is already using a renderer that looks like a dedicated GPU.',
            'studio_render.message.gpu_guidance': 'Blockbench chooses the WebGL GPU before plugins run. To force a dedicated GPU, set Blockbench.exe to High performance in Windows Graphics settings or your NVIDIA/AMD control panel, then restart Blockbench.',
            'studio_render.message.preset_select': 'Select a project camera preset first.',
            'studio_render.message.preset_created': 'Camera preset created',
            'studio_render.message.preset_updated': 'Camera preset updated',
            'studio_render.message.preset_applied': 'Camera preset applied',
            'studio_render.message.preset_deleted': 'Camera preset deleted',
            'studio_render.message.preset_delete_confirm': 'Delete camera preset "{name}" from this project?',
            'studio_render.message.preset_temporary': 'Camera presets are temporary in this format. Save as .bbmodel to keep them.',
            'studio_render.message.preset_invalid_clipping': 'Far clipping must be greater than near clipping.',
            'studio_render.dialog.camera_presets': 'Project Camera Presets',
            'studio_render.dialog.create_camera_preset': 'Create Camera Preset',
            'studio_render.dialog.edit_camera_preset': 'Edit Camera Preset',
            'studio_render.dialog.rename_camera_preset': 'Rename Camera Preset',
            'studio_render.menu.camera_presets.empty': 'No Camera Presets Yet',
            'studio_render.menu.camera_presets.create': 'Save Current Camera...',
            'studio_render.menu.camera_presets.update': 'Update from Current View',
            'studio_render.menu.camera_presets.manage': 'Manage Presets...',
            'studio_render.field.rotation_mode': 'Rotation Mode',
            'studio_render.field.camera_position': 'Camera Position',
            'studio_render.field.camera_target': 'Focal Point',
            'studio_render.field.camera_rotation': 'Rotation',
            'studio_render.field.camera_up': 'Up Axis',
            'studio_render.field.fov': 'Field of View',
            'studio_render.field.ortho_height': 'Orthographic Height',
            'studio_render.field.near_clip': 'Near Clipping',
            'studio_render.field.far_clip': 'Far Clipping',
            'studio_render.field.focus_distance': 'Focus Distance',
            'studio_render.field.film_gauge': 'Film Gauge',
            'studio_render.field.lens_shift': 'Lens Shift',
            'studio_render.field.projection_shift': 'Projection Shift',
            'studio_render.field.camera_zoom': 'Camera Zoom',
            'studio_render.field.exact_projection': 'Exact Projection',
            'studio_render.field.frame_position': 'Frame Position',
            'studio_render.field.frame_size': 'Frame Size',
            'studio_render.option.rotation.target': 'Focal Point',
            'studio_render.option.rotation.euler': 'Rotation',
            'studio_render.frame.resize_hint': 'Resize Frame - Alt: Resize from Center, Ctrl: Square, Shift: Lock Aspect Ratio',
            'studio_render.frame.label': 'Studio Render Frame'
        });

        Language.addTranslations('es', {
            'studio_render.plugin.title': 'Render de Estudio',
            'studio_render.plugin.description': 'Exporta renders de estudio en alta resolucion con supersampling por tiles, fondos transparentes y un marco opcional. Complementa Light Manager y Shader Architect dentro de la suite Lightflow.',
            'studio_render.action.export': 'Render de Estudio',
            'studio_render.action.export.desc': 'Abre el marco ajustable y los controles de captura de Studio Render.',
            'studio_render.action.quick': 'Render Rapido de Estudio',
            'studio_render.action.quick.desc': 'Renderiza el preview actual de inmediato con defaults de estudio 4K pulidos.',
            'studio_render.action.frame': 'Marco de Render de Estudio',
            'studio_render.action.frame.desc': 'Muestra u oculta el marco ajustable de captura para Render de Estudio.',
            'studio_render.action.reset_frame': 'Reiniciar Marco de Render',
            'studio_render.action.reset_frame.desc': 'Recorta el marco de Render de Estudio al contenido visible del canvas.',
            'studio_render.action.capture': 'Renderizar Ahora',
            'studio_render.action.capture.desc': 'Renderiza el marco actual de Render de Estudio.',
            'studio_render.action.settings': 'Ajustes de Render',
            'studio_render.action.settings.desc': 'Abre los ajustes de Render de Estudio.',
            'studio_render.action.camera_presets': 'Presets de Camara',
            'studio_render.action.camera_presets.desc': 'Crea y administra presets completos de camara y marco de render para este proyecto.',
            'studio_render.action.view_mode': 'Modo de Render',
            'studio_render.action.global_material': 'Material Global',
            'studio_render.action.tile_grid': 'Cuadricula de Tiles',
            'studio_render.action.tile_grid.desc': 'Muestra u oculta las divisiones de tiles de render.',
            'studio_render.action.close_frame': 'Cerrar Marco',
            'studio_render.dialog.title': 'Render de Estudio',
            'studio_render.field.angle': 'Camara',
            'studio_render.field.camera_preset': 'Preset de Camara del Proyecto',
            'studio_render.field.camera_preset_name': 'Nombre del Preset',
            'studio_render.field.resolution_preset': 'Resolucion',
            'studio_render.field.resolution': 'Tamano Personalizado',
            'studio_render.field.output_scale': 'Escala de Resolucion',
            'studio_render.field.samples': 'Muestras AA',
            'studio_render.field.tile_size': 'Tamano de Tile',
            'studio_render.field.capture_area': 'Area de Captura',
            'studio_render.field.match_frame_ratio': 'Igualar Proporcion',
            'studio_render.field.background_mode': 'Fondo',
            'studio_render.field.background_color': 'Color',
            'studio_render.field.shading': 'Usar Sombreado',
            'studio_render.field.show_gizmos': 'Mostrar Gizmos',
            'studio_render.field.show_tile_grid': 'Mostrar Tiles',
            'studio_render.field.show_advanced': 'Controles Avanzados',
            'studio_render.field.bloom_enabled': 'Bloom',
            'studio_render.field.bloom_threshold': 'Umbral de Bloom',
            'studio_render.field.bloom_soft_knee': 'Suavidad del umbral',
            'studio_render.field.bloom_strength': 'Fuerza de Bloom',
            'studio_render.field.bloom_core_strength': 'Fuerza del nucleo brillante',
            'studio_render.field.bloom_core_radius': 'Radio del nucleo brillante',
            'studio_render.field.bloom_halo_strength': 'Fuerza del halo suave',
            'studio_render.field.bloom_radius': 'Radio del halo suave',
            'studio_render.field.bloom_hdr_strength': 'Bloom de superficies brillantes',
            'studio_render.field.bloom_emissive_strength': 'Bloom de texturas emisivas',
            'studio_render.field.bloom_occlusion': 'Bloquear Bloom detrás de geometría',
            'studio_render.field.viewport_bloom_enabled': 'Previsualizar Bloom en viewport',
            'studio_render.field.viewport_bloom_fps': 'Límite FPS de Bloom (0 = sincronizado)',
            'studio_render.field.viewport_bloom_quality': 'Calidad de Bloom en viewport',
            'studio_render.option.viewport_bloom.adaptive': 'Adaptativa',
            'studio_render.option.viewport_bloom.performance': 'Rendimiento',
            'studio_render.option.viewport_bloom.balanced': 'Equilibrada',
            'studio_render.option.viewport_bloom.high': 'Alta',
            'studio_render.action.open_advanced': 'Compositor de escena avanzado...',
            'studio_render.field.color_grading_enabled': 'Gradación de color',
            'studio_render.field.exposure': 'Exposición',
            'studio_render.field.contrast': 'Contraste',
            'studio_render.field.saturation': 'Saturación',
            'studio_render.field.temperature': 'Temperatura',
            'studio_render.field.tint': 'Tinte',
            'studio_render.field.vignette': 'Viñeta',
            'studio_render.action.scene_composer': 'Compositor de escena...',
            'studio_render.action.scene_composer.desc': 'Iguala el postprocesado del viewport con Studio Render y coordina el entorno Lightflow',
            'studio_render.panel.composer': 'Imagen',
            'studio_render.workflow.camera': 'Cámara y encuadre',
            'studio_render.workflow.essentials': 'Básicos',
            'studio_render.workflow.advanced': 'Avanzados',
            'studio_render.workflow.output': 'Salida',
            'studio_render.workflow.image': 'Imagen',
            'studio_render.workflow.preview_off': 'Bloom activo para exportar, pero su previsualización está desactivada.',
            'studio_render.workflow.preview_on': 'Bloom previsualizado · La exportación usa calidad final.',
            'studio_render.workflow.bloom_off': 'Bloom desactivado en vista y exportación.',
            'studio_render.workflow.cancel': 'Cancelar render',
            'studio_render.workflow.cancelling': 'Cancelando; restaurando la escena…',
            'studio_render.composer.summary': 'Postprocesado en tiempo real',
            'studio_render.composer.summary.desc': 'Coordina la previsualización del viewport y el acabado de Studio Render.',
            'studio_render.composer.group.preview': 'Previsualización',
            'studio_render.composer.group.bloom': 'Bloom',
            'studio_render.composer.group.grading': 'Corrección de color',
            'studio_render.composer.section.playback': 'Rendimiento del preview',
            'studio_render.composer.section.threshold': 'Umbral y respuesta',
            'studio_render.composer.section.core': 'Núcleo brillante',
            'studio_render.composer.section.halo': 'Halo suave',
            'studio_render.composer.section.sources': 'Fuentes luminosas',
            'studio_render.composer.section.image': 'Balance de imagen',
            'studio_render.composer.section.white_balance': 'Balance de blancos',
            'studio_render.composer.section.finishing': 'Acabado',
            'studio_render.composer.action.advanced': 'Compositor avanzado',
            'studio_render.undo.edit_composer': 'Editar compositor de escena',
            'studio_render.field.zoom': 'Distancia Focal',
            'studio_render.field.gpu': 'GPU',
            'studio_render.field.gpu_renderer': 'Renderer',
            'studio_render.field.destination': 'Despues de Render',
            'studio_render.field.file_name': 'Nombre de Archivo',
            'studio_render.group.camera': 'Camara',
            'studio_render.group.camera_presets': 'Presets de Camara del Proyecto',
            'studio_render.group.output': 'Salida',
            'studio_render.group.frame': 'Marco',
            'studio_render.group.look': 'Aspecto',
            'studio_render.group.effects': 'Efectos Finales',
            'studio_render.group.export': 'Exportacion',
            'studio_render.option.camera.view': 'Vista Actual',
            'studio_render.option.camera_preset.none': 'Ningun Preset Seleccionado',
            'studio_render.option.resolution.hd': 'HD - 1920 x 1080',
            'studio_render.option.resolution.uhd': '4K UHD - 3840 x 2160',
            'studio_render.option.resolution.dci_4k': '4K DCI - 4096 x 2160',
            'studio_render.option.resolution.square_4k': 'Cuadrado 4K - 4096 x 4096',
            'studio_render.option.resolution.eight_k': '8K UHD - 7680 x 4320',
            'studio_render.option.resolution.custom': 'Personalizada',
            'studio_render.option.samples.1': '1 muestra',
            'studio_render.option.samples.2': '2 muestras',
            'studio_render.option.samples.3': '3 muestras',
            'studio_render.option.samples.4': '4 muestras',
            'studio_render.option.samples.6': '6 muestras',
            'studio_render.option.samples.8': '8 muestras',
            'studio_render.option.tile.auto': 'Auto',
            'studio_render.option.tile.1024': '1024 px',
            'studio_render.option.tile.1536': '1536 px',
            'studio_render.option.tile.2048': '2048 px',
            'studio_render.option.tile.3072': '3072 px',
            'studio_render.option.gpu.dedicated': 'GPU dedicada',
            'studio_render.option.gpu.integrated': 'GPU integrada',
            'studio_render.option.gpu.software': 'Renderer por software',
            'studio_render.option.gpu.unknown': 'GPU desconocida',
            'studio_render.option.gpu.unavailable': 'Renderer WebGL no disponible',
            'studio_render.option.area.full': 'Composicion Completa',
            'studio_render.option.area.frame': 'Marco de Render',
            'studio_render.option.background.transparent': 'Transparente',
            'studio_render.option.background.solid': 'Color Solido',
            'studio_render.option.destination.preview': 'Abrir Preview',
            'studio_render.option.destination.save': 'Guardar PNG',
            'studio_render.option.destination.clipboard': 'Copiar PNG',
            'studio_render.option.destination.texture': 'Cargar como Textura',
            'studio_render.button.render': 'Renderizar',
            'studio_render.button.edit_frame': 'Editar Marco',
            'studio_render.button.reset_frame': 'Reiniciar Marco',
            'studio_render.button.open_frame': 'Abrir Marco',
            'studio_render.button.apply_preset': 'Aplicar',
            'studio_render.button.create_preset': 'Crear',
            'studio_render.button.update_preset': 'Actualizar',
            'studio_render.button.rename_preset': 'Renombrar',
            'studio_render.button.delete_preset': 'Eliminar',
            'studio_render.button.save_preset': 'Guardar Preset',
            'studio_render.status.preparing': 'Preparando render de estudio...',
            'studio_render.status.tile': 'Renderizando tile',
            'studio_render.status.downsample': 'Componiendo imagen final...',
            'studio_render.status.encoding': 'Codificando PNG en segundo plano...',
            'studio_render.status.handoff': 'Entregando fotograma renderizado...',
            'studio_render.message.no_preview': 'No hay preview disponible para renderizar.',
            'studio_render.message.no_offscreen': 'El preview offscreen de Blockbench no esta listo. Abre un preview e intenta de nuevo.',
            'studio_render.message.too_large': 'La salida solicitada es demasiado grande para un canvas seguro.',
            'studio_render.message.rendered': 'Render de estudio completado',
            'studio_render.message.render_in_progress': 'Ya hay una sesión de Studio Render en curso.',
            'studio_render.message.copied': 'Render de estudio copiado al portapapeles',
            'studio_render.message.gpu_title': 'GPU de Render de Estudio',
            'studio_render.message.gpu_dedicated': 'Render de Estudio ya esta usando un renderer que parece una GPU dedicada.',
            'studio_render.message.gpu_guidance': 'Blockbench elige la GPU WebGL antes de que corran los plugins. Para forzar una GPU dedicada, asigna Blockbench.exe a Alto rendimiento en Graficos de Windows o en el panel NVIDIA/AMD, y reinicia Blockbench.',
            'studio_render.message.preset_select': 'Selecciona primero un preset de camara del proyecto.',
            'studio_render.message.preset_created': 'Preset de camara creado',
            'studio_render.message.preset_updated': 'Preset de camara actualizado',
            'studio_render.message.preset_applied': 'Preset de camara aplicado',
            'studio_render.message.preset_deleted': 'Preset de camara eliminado',
            'studio_render.message.preset_delete_confirm': 'Eliminar el preset de camara "{name}" de este proyecto?',
            'studio_render.message.preset_temporary': 'Los presets de camara son temporales en este formato. Guarda como .bbmodel para conservarlos.',
            'studio_render.message.preset_invalid_clipping': 'El recorte lejano debe ser mayor que el recorte cercano.',
            'studio_render.dialog.camera_presets': 'Presets de Camara del Proyecto',
            'studio_render.dialog.create_camera_preset': 'Crear Preset de Camara',
            'studio_render.dialog.edit_camera_preset': 'Editar Preset de Camara',
            'studio_render.dialog.rename_camera_preset': 'Renombrar Preset de Camara',
            'studio_render.menu.camera_presets.empty': 'Aun no hay Presets de Camara',
            'studio_render.menu.camera_presets.create': 'Guardar Camara Actual...',
            'studio_render.menu.camera_presets.update': 'Actualizar desde la Vista Actual',
            'studio_render.menu.camera_presets.manage': 'Administrar Presets...',
            'studio_render.field.rotation_mode': 'Modo de Rotacion',
            'studio_render.field.camera_position': 'Posicion de Camara',
            'studio_render.field.camera_target': 'Punto Focal',
            'studio_render.field.camera_rotation': 'Rotacion',
            'studio_render.field.camera_up': 'Eje Superior',
            'studio_render.field.fov': 'Campo de Vision',
            'studio_render.field.ortho_height': 'Altura Ortografica',
            'studio_render.field.near_clip': 'Recorte Cercano',
            'studio_render.field.far_clip': 'Recorte Lejano',
            'studio_render.field.focus_distance': 'Distancia de Enfoque',
            'studio_render.field.film_gauge': 'Tamano de Pelicula',
            'studio_render.field.lens_shift': 'Desplazamiento de Lente',
            'studio_render.field.projection_shift': 'Desplazamiento de Proyeccion',
            'studio_render.field.camera_zoom': 'Zoom de Camara',
            'studio_render.field.exact_projection': 'Proyeccion Exacta',
            'studio_render.field.frame_position': 'Posicion del Marco',
            'studio_render.field.frame_size': 'Tamano del Marco',
            'studio_render.option.rotation.target': 'Punto Focal',
            'studio_render.option.rotation.euler': 'Rotacion',
            'studio_render.frame.resize_hint': 'Redimensionar Marco - Alt: Desde el Centro, Ctrl: Cuadrado, Shift: Bloquear Proporcion',
            'studio_render.frame.label': 'Marco de Render'
        });
    }

    function loadSettings() {
        const stored = readJSON(STORAGE_KEY, {});
        const legacyViewportComposer = toNumber(stored.viewport_composer_revision, 0) < 2;
        const legacyBloomPipeline = toNumber(stored.bloom_pipeline_revision, 0) < 2;
        const settings = Object.assign({}, DEFAULT_SETTINGS, stored);
        if (legacyBloomPipeline) {
            const migrateLegacyDefault = (key, previousValue, nextValue) => {
                if (
                    !Object.prototype.hasOwnProperty.call(stored, key) ||
                    Math.abs(toNumber(stored[key], previousValue) - previousValue) < 0.000001
                ) {
                    settings[key] = nextValue;
                }
            };
            migrateLegacyDefault('bloom_threshold', 0.72, DEFAULT_SETTINGS.bloom_threshold);
            migrateLegacyDefault('bloom_strength', 0.8, DEFAULT_SETTINGS.bloom_strength);
            migrateLegacyDefault('bloom_radius', 18, DEFAULT_SETTINGS.bloom_radius);
            migrateLegacyDefault('bloom_hdr_strength', 1, DEFAULT_SETTINGS.bloom_hdr_strength);
            migrateLegacyDefault('bloom_emissive_strength', 1.35, DEFAULT_SETTINGS.bloom_emissive_strength);
        }
        settings.camera_preset_id = typeof settings.camera_preset_id === 'string' ? settings.camera_preset_id : '';
        if (!Array.isArray(settings.resolution)) {
            settings.resolution = DEFAULT_SETTINGS.resolution.slice();
        }
        settings.resolution = [
            roundDimension(settings.resolution[0]),
            roundDimension(settings.resolution[1])
        ];
        settings.output_scale = clamp(toNumber(settings.output_scale, 1), 0.1, 8);
        settings.samples = String(settings.samples || '4');
        settings.tile_size = String(settings.tile_size || 'auto');
        settings.shading = typeof settings.shading === 'boolean'
            ? settings.shading
            : !!settings.shading;
        settings.show_gizmos = !!settings.show_gizmos;
        settings.show_tile_grid = !!settings.show_tile_grid;
        settings.show_advanced = !!settings.show_advanced;
        settings.bloom_enabled = !!settings.bloom_enabled;
        settings.bloom_threshold = clamp(toNumber(settings.bloom_threshold, DEFAULT_SETTINGS.bloom_threshold), 0, 4);
        settings.bloom_soft_knee = clamp(toNumber(settings.bloom_soft_knee, DEFAULT_SETTINGS.bloom_soft_knee), 0, 1);
        settings.bloom_strength = clamp(toNumber(settings.bloom_strength, DEFAULT_SETTINGS.bloom_strength), 0, 3);
        settings.bloom_core_strength = clamp(toNumber(settings.bloom_core_strength, DEFAULT_SETTINGS.bloom_core_strength), 0, 2);
        settings.bloom_core_radius = clamp(toNumber(settings.bloom_core_radius, DEFAULT_SETTINGS.bloom_core_radius), 0.25, 12);
        settings.bloom_halo_strength = clamp(toNumber(settings.bloom_halo_strength, DEFAULT_SETTINGS.bloom_halo_strength), 0, 2);
        settings.bloom_radius = clamp(toNumber(settings.bloom_radius, DEFAULT_SETTINGS.bloom_radius), 1, 128);
        settings.bloom_hdr_strength = clamp(toNumber(settings.bloom_hdr_strength, DEFAULT_SETTINGS.bloom_hdr_strength), 0, 4);
        settings.bloom_emissive_strength = clamp(toNumber(settings.bloom_emissive_strength, DEFAULT_SETTINGS.bloom_emissive_strength), 0, 8);
        settings.bloom_occlusion = settings.bloom_occlusion !== false;
        settings.bloom_pipeline_revision = 3;
        settings.viewport_bloom_enabled = settings.viewport_bloom_enabled !== false;
        settings.viewport_bloom_fps = legacyViewportComposer
            ? 0
            : clamp(toNumber(settings.viewport_bloom_fps, 0), 0, 144);
        settings.viewport_bloom_quality = VIEWPORT_BLOOM_PROFILES[settings.viewport_bloom_quality]
            ? settings.viewport_bloom_quality
            : 'adaptive';
        settings.viewport_composer_revision = 3;
        settings.color_grading_enabled = !!settings.color_grading_enabled;
        settings.exposure = clamp(toNumber(settings.exposure, 1), 0.1, 4);
        settings.contrast = clamp(toNumber(settings.contrast, 1), 0, 3);
        settings.saturation = clamp(toNumber(settings.saturation, 1), 0, 3);
        settings.temperature = clamp(toNumber(settings.temperature, 0), -1, 1);
        settings.tint = clamp(toNumber(settings.tint, 0), -1, 1);
        settings.vignette = clamp(toNumber(settings.vignette, 0), 0, 1);
        delete settings.gpu_status;
        return settings;
    }

    function saveSettings(settings) {
        currentSettings = Object.assign({}, settings);
        writeJSON(STORAGE_KEY, currentSettings);
    }

    function syncFrameAction() {
        if (frameAction) {
            frameAction.value = !!StudioRenderFrame.node;
            frameAction.updateEnabledState?.();
        }
    }

    function getFrameSettings() {
        currentSettings = normalizeForm(currentSettings);
        return Object.assign({}, currentSettings, { capture_area: 'frame' });
    }

    function openStudioRenderFrame() {
        currentSettings = loadSettings();
        currentSettings.capture_area = 'frame';
        saveSettings(currentSettings);
        StudioRenderFrame.show(getPreview(), currentSettings);
        syncFrameAction();
    }

    function getQuickRenderSettings() {
        const saved = loadSettings();
        const useVisibleFrame = !!StudioRenderFrame.node;
        return normalizeForm({
            ...saved,
            resolution_preset: 'uhd',
            resolution: RESOLUTION_PRESETS.uhd.slice(),
            output_scale: 1,
            destination: 'preview',
            samples: '4',
            tile_size: 'auto',
            capture_area: useVisibleFrame ? 'frame' : 'full',
            match_frame_ratio: true,
            background_mode: 'transparent',
            shading: true,
            show_gizmos: false,
            show_tile_grid: false
        });
    }

    function quickStudioRender() {
        currentSettings = getQuickRenderSettings();
        renderWithSettings(currentSettings, { save: false });
    }

    function closeActiveDialog() {
        if (activeDialog) {
            activeDialog.hide();
            activeDialog = null;
        }
    }

    function getPreview() {
        return (typeof Preview !== 'undefined' && Preview.selected) || window.main_preview || null;
    }

    // Mirrors Preview.screenshot({crop: true}): render without gizmos, then
    // use the non-transparent pixel bounds that CanvasFrame.autoCrop() finds.
    function getVisibleCanvasBounds(preview) {
        if (!preview || !preview.canvas) return null;

        const findBounds = () => {
            try {
                preview.render?.();
                const canvas = preview.canvas;
                const ctx = canvas.getContext?.('2d', { willReadFrequently: true });
                if (!ctx || !canvas.width || !canvas.height) return null;

                const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let left = canvas.width;
                let top = canvas.height;
                let right = -1;
                let bottom = -1;

                for (let index = 3; index < pixels.length; index += 4) {
                    if (pixels[index] === 0) continue;
                    const pixel = (index - 3) / 4;
                    const x = pixel % canvas.width;
                    const y = Math.floor(pixel / canvas.width);
                    if (x < left) left = x;
                    if (x > right) right = x;
                    if (y < top) top = y;
                    if (y > bottom) bottom = y;
                }

                if (right < left || bottom < top) return null;
                return {
                    x: left / canvas.width,
                    y: top / canvas.height,
                    width: (right - left + 1) / canvas.width,
                    height: (bottom - top + 1) / canvas.height
                };
            } catch (error) {
                return null;
            }
        };

        if (typeof window.Canvas?.withoutGizmos === 'function') {
            let bounds = null;
            window.Canvas.withoutGizmos(() => {
                bounds = findBounds();
            });
            return bounds;
        }
        return findBounds();
    }

    function getOffscreenPreview() {
        if (window.Screencam && Screencam.NoAAPreview) return Screencam.NoAAPreview;
        if (window.MediaPreview) return MediaPreview;
        return null;
    }

    function getStudioRendererFamilyKey() {
        const architectKey = window.ShaderArchitectGetStudioRendererFamilyKey?.();
        if (architectKey) return String(architectKey);
        const mode = window.ShaderEngine?.globalRenderMode || 'classic';
        const overrides = window.ShaderEngine?.projectHasMaterialOverrides?.() ? 'overrides' : 'global';
        return `studio_renderer_family_fallback:${mode}:${overrides}`;
    }

    function isStudioPreviewContextLost(preview) {
        try { return !!preview?.renderer?.getContext?.()?.isContextLost?.(); }
        catch (error) { return true; }
    }

    function copyStudioRendererTemplate(preview, template) {
        const renderer = preview?.renderer;
        const templateRenderer = template?.renderer;
        if (!renderer || !templateRenderer) return preview;

        const templateSize = templateRenderer.getSize?.(new THREE.Vector2()) || null;
        const width = roundDimension(template?.width || templateSize?.x || 512);
        const height = roundDimension(template?.height || templateSize?.y || 512);
        preview.width = width;
        preview.height = height;
        renderer.setPixelRatio?.(templateRenderer.getPixelRatio?.() || 1);
        renderer.setSize(width, height, false);

        renderer.shadowMap.enabled = !!templateRenderer.shadowMap?.enabled;
        renderer.shadowMap.type = templateRenderer.shadowMap?.type;
        renderer.shadowMap.autoUpdate = !!templateRenderer.shadowMap?.autoUpdate;
        renderer.outputEncoding = templateRenderer.outputEncoding;
        renderer.toneMapping = templateRenderer.toneMapping;
        renderer.toneMappingExposure = templateRenderer.toneMappingExposure;
        renderer.physicallyCorrectLights = templateRenderer.physicallyCorrectLights;
        renderer.localClippingEnabled = templateRenderer.localClippingEnabled;
        renderer.sortObjects = templateRenderer.sortObjects;
        return preview;
    }

    function createOwnedStudioRenderPreview(familyKey, template) {
        if (typeof window.Preview !== 'function' || !template?.renderer) return null;
        const generation = studioRenderPreviewOwner.generation + 1;
        const preview = new window.Preview({
            id: `studio_render_owned_${generation}`,
            offscreen: true,
            antialias: false
        });
        copyStudioRendererTemplate(preview, template);
        preview.sa_studio_owned_preview = true;
        preview.sa_studio_renderer_family = familyKey;
        preview.sa_studio_renderer_generation = generation;
        return preview;
    }

    function retireOwnedStudioRenderPreview(preview, reason = 'retired', options = {}) {
        if (!preview?.sa_studio_owned_preview) return false;
        preview.sa_studio_intentional_context_retire = true;
        const renderer = preview.renderer;
        const contextLost = options.contextLost === true || isStudioPreviewContextLost(preview);
        try {
            window.LightflowRenderer?.releaseExternal?.(preview, {
                contextLost,
                hibernate: false,
                trimPool: true
            });
        } catch (error) {
            warnStudioRenderOnce(
                'owned-preview-release',
                '[Studio Render] Failed to release the owned offscreen pipeline.',
                error
            );
        }

        let loseContext = null;
        if (!contextLost) {
            try { loseContext = renderer?.getContext?.().getExtension?.('WEBGL_lose_context'); }
            catch (error) {}
        }
        try { renderer?.renderLists?.dispose?.(); } catch (error) {}
        try { renderer?.dispose?.(); } catch (error) {}
        try { preview.node?.remove?.(); } catch (error) {}
        if (Array.isArray(window.Preview?.all)) {
            const index = Preview.all.indexOf(preview);
            if (index >= 0) Preview.all.splice(index, 1);
        }
        try { loseContext?.loseContext?.(); } catch (error) {}

        studioRenderPreviewOwner.retired += 1;
        studioRenderPreviewOwner.lastRetireReason = reason;
        return true;
    }

    function releaseOwnedStudioRenderPreview(reason = 'release', options = {}) {
        const preview = studioRenderPreviewOwner.preview;
        if (!preview) return false;
        if (activeRenderSession?.renderPreview === preview && options.force !== true) {
            activeRenderSession.retireOwnedPreviewOnFinish = true;
            activeRenderSession.retireOwnedPreviewReason = reason;
            return false;
        }
        studioRenderPreviewOwner.preview = null;
        studioRenderPreviewOwner.familyKey = '';
        return retireOwnedStudioRenderPreview(preview, reason, options);
    }

    function acquireOwnedStudioRenderPreview(familyKey = getStudioRendererFamilyKey()) {
        const existing = studioRenderPreviewOwner.preview;
        const existingLost = isStudioPreviewContextLost(existing);
        if (existing && !existingLost && studioRenderPreviewOwner.familyKey === familyKey) {
            copyStudioRendererTemplate(existing, getOffscreenPreview());
            return existing;
        }

        const template = getOffscreenPreview();
        const next = createOwnedStudioRenderPreview(familyKey, template);
        if (!next) return null;

        const previous = studioRenderPreviewOwner.preview;
        studioRenderPreviewOwner.preview = next;
        studioRenderPreviewOwner.familyKey = familyKey;
        studioRenderPreviewOwner.generation = next.sa_studio_renderer_generation;
        studioRenderPreviewOwner.created += 1;
        if (previous) {
            retireOwnedStudioRenderPreview(
                previous,
                existingLost ? 'context_lost' : 'material_family_changed',
                { contextLost: existingLost }
            );
        }
        return next;
    }

    function addStudioRenderHiddenObject(objects, object) {
        if (!object || typeof object.visible !== 'boolean') return;
        objects.add(object);
    }

    function collectStudioRenderHiddenObjects() {
        const objects = new Set();
        const add = object => addStudioRenderHiddenObject(objects, object);
        const canvasApi = window.Canvas;

        if (canvasApi) {
            if (Array.isArray(canvasApi.gizmos)) {
                canvasApi.gizmos.forEach(add);
            }
            [
                'brush_outline',
                'hover_helper_line',
                'hover_helper_vertex',
                'ground_plane',
                'outlines',
                'pivot_marker'
            ].forEach(key => add(canvasApi[key]));
            add(canvasApi.side_grids?.x);
            add(canvasApi.side_grids?.z);
        }

        [
            window.three_grid,
            window.Transformer,
            window.SplineGizmos,
            window.LightManagerAreaGizmos?.group
        ].forEach(add);

        if (window.Outliner && Array.isArray(Outliner.elements)) {
            Outliner.elements.forEach(element => {
                const mesh = element && element.mesh;
                if (!mesh) return;

                if (element.selected && mesh.outline) add(mesh.outline);
                if (mesh.grid_box) add(mesh.grid_box);
                if (mesh.gizmo) add(mesh.gizmo);
                if (mesh.sprite && (element.type === 'light' || element.type === 'locator')) add(mesh.sprite);

                const isLocator = element.type === 'locator' || (window.Locator && element instanceof window.Locator);
                const hideInScreenshot = typeof element.getTypeBehavior === 'function' && element.getTypeBehavior('hide_in_screenshot');
                const isLight = element.type === 'light' || (window.LightElement && element instanceof window.LightElement);

                if (isLocator && mesh.children && mesh.children[0]) add(mesh.children[0]);
                if (isLocator || isLight || hideInScreenshot) add(mesh);
            });
        }

        const scene = canvasApi?.scene || window.scene;
        if (scene && typeof scene.traverse === 'function') {
            scene.traverse(object => {
                if (!object || object.isElement) return;
                const name = String(object.name || '').toLowerCase();
                const type = String(object.type || '').toLowerCase();
                if (
                    name === 'grid_group' ||
                    name === 'side_grid_x' ||
                    name === 'side_grid_z' ||
                    name === 'light_manager_area_gizmos' ||
                    name.includes('gizmo') ||
                    type.includes('transformcontrols')
                ) {
                    add(object);
                }
            });
        }

        return objects;
    }

    async function withoutStudioRenderGizmos(callback) {
        const hiddenObjects = collectStudioRenderHiddenObjects();
        const previousVisibility = new Map();
        const canvasApi = window.Canvas;
        const groundAnimationBefore = canvasApi ? canvasApi.ground_animation : undefined;

        hiddenObjects.forEach(object => {
            previousVisibility.set(object, object.visible);
            object.visible = false;
        });

        if (window.Modes?.display && canvasApi?.ground_animation) {
            canvasApi.ground_animation = false;
        }

        try {
            return await callback();
        } finally {
            previousVisibility.forEach((visible, object) => {
                if (object) object.visible = visible;
            });

            if (window.Modes?.display && groundAnimationBefore && canvasApi) {
                canvasApi.ground_animation = groundAnimationBefore;
            }

        }
    }

    async function withoutStudioRenderHighlights(callback) {
        const snapshots = [];

        [window.Cube, window.Mesh, window.TextureMesh, window.Billboard].forEach(ElementType => {
            if (ElementType && Array.isArray(ElementType.all)) ElementType.all.forEach(cube => {
                const mesh = cube && cube.mesh;
                const attribute = mesh?.geometry?.attributes?.highlight;
                if (!attribute || !attribute.array) return;

                let hasHighlight = false;
                for (let index = 0; index < attribute.array.length; index++) {
                    if (attribute.array[index] !== 0) {
                        hasHighlight = true;
                        break;
                    }
                }
                if (!hasHighlight) return;

                snapshots.push({ element: cube, attribute, selected: !!cube.selected, values: attribute.array.slice(), clearedVersion: (attribute.version || 0) + 1 });
                attribute.array.fill(0);
                attribute.needsUpdate = true;
            });
        });

        try {
            return await callback();
        } finally {
            snapshots.forEach(snapshot => {
                const current = snapshot.element?.mesh?.geometry?.attributes?.highlight;
                if (current !== snapshot.attribute || !!snapshot.element.selected !== snapshot.selected || snapshot.attribute.version !== snapshot.clearedVersion) {
                    snapshot.element.preview_controller?.updateHighlight?.(snapshot.element);
                    return;
                }
                snapshot.attribute.array.set(snapshot.values);
                snapshot.attribute.needsUpdate = true;
            });
        }
    }

    async function withoutStudioRenderArtKeyMarkers(callback) {
        const markers = (window.ArtKeyElement?.all || [])
            .map(element => element?.mesh?.sourceGizmo)
            .filter(Boolean);
        const previousVisibility = markers.map(marker => [marker, marker.visible]);
        markers.forEach(marker => { marker.visible = false; });
        try {
            return await callback();
        } finally {
            previousVisibility.forEach(([marker, visible]) => { marker.visible = visible; });
        }
    }

    function captureStudioRenderBillboards() {
        const snapshots = [];
        const billboards = Array.isArray(window.Billboard?.all) ? Billboard.all : [];
        billboards.forEach(element => {
            const mesh = element?.mesh;
            if (!mesh?.quaternion) return;
            snapshots.push({ mesh, quaternion: mesh.quaternion.clone() });
        });
        return snapshots;
    }

    function restoreStudioRenderBillboards(snapshots) {
        Array.from(snapshots || []).forEach(snapshot => {
            if (!snapshot?.mesh?.quaternion || !snapshot.quaternion) return;
            snapshot.mesh.quaternion.copy(snapshot.quaternion);
            snapshot.mesh.updateMatrixWorld?.(true);
        });
    }

    function updateStudioRenderBillboards(camera) {
        if (!camera) return;
        const billboards = Array.isArray(window.Billboard?.all) ? Billboard.all : [];
        const cameraPosition = new THREE.Vector3();
        const cameraQuaternion = new THREE.Quaternion();
        if (typeof camera.getWorldPosition === 'function') camera.getWorldPosition(cameraPosition);
        else cameraPosition.copy(camera.position);
        if (typeof camera.getWorldQuaternion === 'function') camera.getWorldQuaternion(cameraQuaternion);
        else cameraQuaternion.copy(camera.quaternion);

        billboards.forEach(element => {
            if (element?.visibility === false) return;
            const mesh = element?.mesh;
            if (!mesh) return;
            const mode = element.facing_mode || 'lookat';
            if (mode === 'lookat' || mode === 'lookat_y') {
                const target = cameraPosition.clone();
                if (mode === 'lookat_y') {
                    mesh.updateWorldMatrix?.(true, false);
                    target.y = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld).y;
                }
                mesh.lookAt(target);
            } else {
                const facingQuaternion = cameraQuaternion.clone();
                if (mode === 'rotate_y') {
                    const facingEuler = new THREE.Euler().setFromQuaternion(facingQuaternion, 'YXZ');
                    facingEuler.x = 0;
                    facingEuler.z = 0;
                    facingQuaternion.setFromEuler(facingEuler);
                }
                if (mesh.parent?.getWorldQuaternion) {
                    facingQuaternion.premultiply(
                        mesh.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
                    );
                }
                mesh.quaternion.copy(facingQuaternion);
            }
            mesh.updateMatrixWorld?.(true);
        });
    }

    function getAnglePresetOptions() {
        const options = {
            view: 'studio_render.option.camera.view'
        };
        if (typeof DefaultCameraPresets !== 'undefined') {
            DefaultCameraPresets.forEach(preset => {
                if (!preset || (preset.condition && !Condition(preset.condition))) return;
                options[preset.id] = preset.name ? translate(preset.name, preset.name) : preset.id;
            });
        }
        const custom = readJSON('camera_presets', []);
        if (Array.isArray(custom)) {
            custom.forEach((preset, index) => {
                if (!preset || (preset.condition && !Condition(preset.condition))) return;
                options['custom_' + index] = preset.name || ('Custom ' + (index + 1));
            });
        }
        return options;
    }

    function getAnglePreset(id) {
        if (!id || id === 'view') return null;
        if (typeof DefaultCameraPresets !== 'undefined') {
            const preset = DefaultCameraPresets.find(entry => entry && entry.id === id);
            if (preset) return preset;
        }
        if (String(id).startsWith('custom_')) {
            const index = parseInt(String(id).replace('custom_', ''), 10);
            const custom = readJSON('camera_presets', []);
            return Array.isArray(custom) ? custom[index] : null;
        }
        return null;
    }

    function snapshotCameraSource(preview, fallbackWidth, fallbackHeight) {
        if (!preview) return null;
        return {
            width: preview.width || fallbackWidth || 1,
            height: preview.height || fallbackHeight || 1,
            node: preview.node,
            isOrtho: preview.isOrtho,
            controls: {
                unlinked: preview.controls?.unlinked,
                target: preview.controls?.target?.clone ? preview.controls.target.clone() : new THREE.Vector3()
            },
            camPers: preview.camPers?.clone ? preview.camPers.clone() : preview.camPers,
            camOrtho: preview.camOrtho?.clone ? preview.camOrtho.clone() : preview.camOrtho
        };
    }

    function createCameraPresetId() {
        if (typeof guid === 'function') return guid();
        return 'studio_camera_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    }

    function finiteArray(value, length, fallback) {
        if (!Array.isArray(value) || value.length < length) return fallback.slice();
        const result = value.slice(0, length).map(Number);
        return result.every(Number.isFinite) ? result : fallback.slice();
    }

    function normalizeFrameState(frame) {
        const source = frame && typeof frame === 'object' ? frame : {};
        const width = clamp(toNumber(source.width, 0.82), 0.001, 1);
        const height = clamp(toNumber(source.height, 0.82), 0.001, 1);
        const normalized = {
            x: clamp(toNumber(source.x, (1 - width) / 2), 0, 1 - width),
            y: clamp(toNumber(source.y, (1 - height) / 2), 0, 1 - height),
            width,
            height
        };
        const referenceAspect = Number(source.reference_aspect);
        if (Number.isFinite(referenceAspect) && referenceAspect > 0) {
            normalized.reference_aspect = referenceAspect;
        }
        return normalized;
    }

    function normalizeCameraPreset(entry) {
        if (!entry || typeof entry !== 'object' || !entry.camera) return null;
        const camera = entry.camera;
        const projection = camera.projection === 'orthographic' ? 'orthographic' : 'perspective';
        const output = entry.output && typeof entry.output === 'object' ? entry.output : {};
        const resolution = finiteArray(output.resolution, 2, DEFAULT_SETTINGS.resolution)
            .map(roundDimension);
        const normalized = {
            id: String(entry.id || createCameraPresetId()),
            name: String(entry.name || 'Camera Preset').trim().slice(0, 80) || 'Camera Preset',
            schema: CAMERA_PRESET_SCHEMA_VERSION,
            created_at: toNumber(entry.created_at, Date.now()),
            updated_at: toNumber(entry.updated_at, Date.now()),
            camera: {
                projection,
                position: finiteArray(camera.position, 3, [0, 0, 0]),
                quaternion: finiteArray(camera.quaternion, 4, [0, 0, 0, 1]),
                up: finiteArray(camera.up, 3, [0, 1, 0]),
                target: finiteArray(camera.target, 3, [0, 0, 0]),
                controls_unlinked: !!camera.controls_unlinked,
                exact_projection: !!camera.exact_projection,
                near: Math.max(0.0001, toNumber(camera.near, 0.1)),
                far: Math.max(0.001, toNumber(camera.far, 1000)),
                reference_aspect: Math.max(0.0001, toNumber(camera.reference_aspect, 16 / 9)),
                fov: clamp(toNumber(camera.fov, 45), 0.01, 179),
                zoom: Math.max(0.0001, toNumber(camera.zoom, 1)),
                film_gauge: Math.max(0.0001, toNumber(camera.film_gauge, 35)),
                lens_shift_x: toNumber(camera.lens_shift_x, 0),
                projection_shift_x: camera.projection_shift_x != null && Number.isFinite(Number(camera.projection_shift_x)) ? Number(camera.projection_shift_x) : null,
                projection_shift_y: camera.projection_shift_y != null && Number.isFinite(Number(camera.projection_shift_y)) ? Number(camera.projection_shift_y) : null,
                focus: Math.max(0.0001, toNumber(camera.focus, 10)),
                ortho_world_height: Math.max(0.0001, toNumber(camera.ortho_world_height, 1)),
                layers_mask: Math.floor(toNumber(camera.layers_mask, 1)) >>> 0
            },
            frame: normalizeFrameState(entry.frame),
            output: {
                resolution_preset: RESOLUTION_PRESETS[output.resolution_preset] ? output.resolution_preset : 'custom',
                resolution,
                output_scale: clamp(toNumber(output.output_scale, 1), 0.1, 8),
                capture_area: output.capture_area === 'full' ? 'full' : 'frame',
                match_frame_ratio: output.match_frame_ratio !== false
            }
        };
        normalized.camera.far = Math.max(normalized.camera.near + 0.001, normalized.camera.far);
        return normalized;
    }

    function getActiveProject() {
        return typeof Project !== 'undefined' ? Project : null;
    }

    function registerCameraPresetProjectProperty() {
        if (cameraPresetsProjectProperty || typeof Property === 'undefined') return cameraPresetsProjectProperty;
        const project = getActiveProject();
        const projectClass = typeof ModelProject !== 'undefined'
            ? ModelProject
            : (project?.constructor && project.constructor !== Object ? project.constructor : null);
        if (!projectClass) return null;
        cameraPresetsProjectProperty = new Property(projectClass, 'string', PROJECT_CAMERA_PRESETS_PROPERTY, {
            default: '',
            exposed: true
        });
        return cameraPresetsProjectProperty;
    }

    function hydrateCameraPresetProject(project, model) {
        if (!project) return;
        if (
            (!project[PROJECT_CAMERA_PRESETS_PROPERTY] || !String(project[PROJECT_CAMERA_PRESETS_PROPERTY]).trim()) &&
            typeof model?.[PROJECT_CAMERA_PRESETS_PROPERTY] === 'string'
        ) {
            project[PROJECT_CAMERA_PRESETS_PROPERTY] = model[PROJECT_CAMERA_PRESETS_PROPERTY];
        }
    }

    function getProjectCameraPresetDocument(project = getActiveProject()) {
        const empty = {
            version: CAMERA_PRESET_SCHEMA_VERSION,
            presets: [],
            active_frame: null
        };
        if (!project) return empty;
        try {
            const raw = project[PROJECT_CAMERA_PRESETS_PROPERTY];
            if (!raw || !String(raw).trim()) return empty;
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const entries = Array.isArray(parsed) ? parsed : parsed?.presets;
            return {
                version: CAMERA_PRESET_SCHEMA_VERSION,
                presets: Array.isArray(entries) ? entries.map(normalizeCameraPreset).filter(Boolean) : [],
                active_frame: parsed?.active_frame ? normalizeFrameState(parsed.active_frame) : null
            };
        } catch (error) {
            warnStudioRenderOnce('camera-preset-document', '[Studio Render] Camera preset data is invalid; using an empty document.', error);
            return empty;
        }
    }

    function getProjectCameraPresets(project = getActiveProject()) {
        return getProjectCameraPresetDocument(project).presets;
    }

    function isBBModelProject(project = getActiveProject()) {
        if (!project) return false;
        const savePath = typeof project.save_path === 'string' ? project.save_path.toLowerCase() : '';
        return savePath.endsWith('.bbmodel') || project.format?.id === 'free' || window.Format?.id === 'free';
    }

    function saveProjectCameraPresetDocument(document, project = getActiveProject(), options = {}) {
        if (!project) return false;
        registerCameraPresetProjectProperty();
        project[PROJECT_CAMERA_PRESETS_PROPERTY] = JSON.stringify({
            version: CAMERA_PRESET_SCHEMA_VERSION,
            presets: (Array.isArray(document?.presets) ? document.presets : []).map(normalizeCameraPreset).filter(Boolean),
            active_frame: document?.active_frame ? normalizeFrameState(document.active_frame) : null
        });
        if (typeof project.saved === 'boolean') project.saved = false;
        if (options.warn !== false && !isBBModelProject(project) && !cameraPresetPersistenceWarningShown) {
            cameraPresetPersistenceWarningShown = true;
            Blockbench.showQuickMessage(translate(
                'studio_render.message.preset_temporary',
                'Camera presets are temporary in this format. Save as .bbmodel to keep them.'
            ), 4200);
        }
        return true;
    }

    function saveProjectCameraPresets(presets, project = getActiveProject()) {
        const document = getProjectCameraPresetDocument(project);
        document.presets = Array.isArray(presets) ? presets : [];
        return saveProjectCameraPresetDocument(document, project);
    }

    function getProjectFrameState(project = getActiveProject()) {
        return getProjectCameraPresetDocument(project).active_frame;
    }

    function saveProjectFrameState(frame, project = getActiveProject()) {
        if (!project || !frame) return false;
        const document = getProjectCameraPresetDocument(project);
        document.active_frame = normalizeFrameState(frame);
        return saveProjectCameraPresetDocument(document, project, { warn: false });
    }

    function getCameraPresetOptions() {
        const options = {
            '': 'studio_render.option.camera_preset.none'
        };
        getProjectCameraPresets().forEach(preset => {
            options[preset.id] = preset.name;
        });
        return options;
    }

    function getCameraPresetById(id) {
        if (!id) return null;
        return getProjectCameraPresets().find(preset => preset.id === id) || null;
    }

    function getEffectiveCameraForPreset(preview, settings) {
        const source = preview?.isOrtho ? preview.camOrtho : preview?.camPers;
        if (!source) return null;
        const camera = source.clone?.() || source;
        if (Number.isFinite(settings?.zoom) && settings.zoom > 0) {
            if (preview.isOrtho) {
                camera.zoom = Math.max(0.01, settings.zoom / 100);
            } else if (typeof camera.setFocalLength === 'function') {
                camera.setFocalLength(settings.zoom);
            }
        }
        camera.updateProjectionMatrix?.();
        return camera;
    }

    function captureCameraPreset(name, preview = getPreview(), settings = currentSettings, existing = null, options = {}) {
        if (!preview) return null;
        const normalizedSettings = normalizeForm(settings);
        const camera = getEffectiveCameraForPreset(preview, normalizedSettings);
        if (!camera) return null;
        const width = Math.max(1, preview.width || preview.node?.clientWidth || 1);
        const height = Math.max(1, preview.height || preview.node?.clientHeight || 1);
        const frame = StudioRenderFrame.preview === preview && StudioRenderFrame.state
            ? StudioRenderFrame.state
            : StudioRenderFrame.getState(preview, normalizedSettings);
        const filmWidth = typeof camera.getFilmWidth === 'function' ? camera.getFilmWidth() : 35;
        const projectionShift = getCameraProjectionShift(camera);
        const now = Date.now();
        return normalizeCameraPreset({
            id: existing?.id || createCameraPresetId(),
            name,
            created_at: existing?.created_at || now,
            updated_at: now,
            camera: {
                projection: preview.isOrtho ? 'orthographic' : 'perspective',
                position: camera.position?.toArray?.() || [0, 0, 0],
                quaternion: camera.quaternion?.toArray?.() || [0, 0, 0, 1],
                up: camera.up?.toArray?.() || [0, 1, 0],
                target: preview.controls?.target?.toArray?.() || [0, 0, 0],
                controls_unlinked: !!preview.controls?.unlinked,
                exact_projection: options.exact_projection === true || existing?.camera?.exact_projection === true,
                near: camera.near,
                far: camera.far,
                reference_aspect: width / height,
                fov: camera.fov,
                zoom: camera.zoom,
                film_gauge: camera.filmGauge,
                lens_shift_x: filmWidth ? toNumber(camera.filmOffset, 0) / filmWidth : 0,
                projection_shift_x: projectionShift.x,
                projection_shift_y: projectionShift.y,
                focus: camera.focus,
                layers_mask: camera.layers?.mask,
                ortho_world_height: preview.isOrtho
                    ? (height / 40) / Math.max(0.0001, camera.zoom)
                    : 1
            },
            frame,
            output: {
                resolution_preset: normalizedSettings.resolution_preset,
                resolution: normalizedSettings.resolution.slice(),
                output_scale: normalizedSettings.output_scale,
                capture_area: normalizedSettings.capture_area,
                match_frame_ratio: normalizedSettings.match_frame_ratio
            }
        });
    }

    function adaptCameraPresetFrame(preset, targetAspect) {
        const frame = normalizeFrameState(preset.frame);
        const referenceAspect = Math.max(0.0001, preset.camera.reference_aspect);
        const aspectRatio = referenceAspect / Math.max(0.0001, targetAspect);
        const left = 2 * frame.x - 1;
        const right = 2 * (frame.x + frame.width) - 1;
        const top = 1 - 2 * frame.y;
        const bottom = 1 - 2 * (frame.y + frame.height);
        const extent = Math.max(
            Math.abs(aspectRatio * left),
            Math.abs(aspectRatio * right),
            Math.abs(top),
            Math.abs(bottom),
            0.0001
        );
        const scale = Math.min(1, 0.999 / extent);
        return {
            scale,
            frame: normalizeFrameState({
                x: (1 + scale * aspectRatio * left) / 2,
                y: (1 - scale * top) / 2,
                width: scale * aspectRatio * frame.width,
                height: scale * frame.height
            })
        };
    }

    function releaseStudioCameraPreset(preview, options = {}) {
        if (!preview) return false;
        const wasStudioPreset = (
            studioCameraPresetPreviews.has(preview) ||
            (!!currentSettings.camera_preset_id && preview === getPreview())
        );
        if (!wasStudioPreset && !options.force) return false;

        studioCameraPresetPreviews.delete(preview);
        cameraNavigationIntent.delete(preview);
        cameraNavigationStarts.delete(preview);
        const controls = preview.controls;
        const activeCamera = preview.camera;
        if (controls) {
            controls.unlinked = false;
            controls.enabled = true;
            controls.enableRotate = true;
            controls.object = activeCamera;
        }

        [preview.camPers, preview.camOrtho].forEach(camera => {
            if (!camera) return;
            clearCameraViewOffset(camera);
            camera.up?.set?.(0, 1, 0);
            if ('filmOffset' in camera) camera.filmOffset = 0;
            camera.updateProjectionMatrix?.();
        });

        const defaultFov = Number(
            typeof Settings !== 'undefined' && typeof Settings.get === 'function'
                ? Settings.get('fov')
                : window.settings?.fov?.value
        );
        if (Number.isFinite(defaultFov) && defaultFov > 0) {
            if (typeof preview.setFOV === 'function') {
                preview.setFOV(defaultFov);
            } else if (preview.camPers) {
                preview.camPers.fov = defaultFov;
                preview.camPers.updateProjectionMatrix?.();
            }
        }

        if (options.loadDefault && typeof DefaultCameraPresets !== 'undefined' && DefaultCameraPresets[0]) {
            preview.setProjectionMode?.(false);
            preview.loadAnglePreset?.(DefaultCameraPresets[0]);
        } else if (activeCamera && controls?.target) {
            activeCamera.lookAt?.(controls.target);
            activeCamera.updateMatrixWorld?.(true);
        }

        currentSettings.camera_preset_id = '';
        saveSettings(currentSettings);
        refreshCameraPresetForms();
        return true;
    }

    function resetStudioCameraPresetsForProjectChange() {
        const previews = typeof Preview !== 'undefined' && Array.isArray(Preview.all)
            ? Preview.all
            : [];
        const activePreview = getPreview();
        if (activePreview && !previews.includes(activePreview)) previews.push(activePreview);
        previews.forEach(preview => {
            if (
                studioCameraPresetPreviews.has(preview) ||
                (!!currentSettings.camera_preset_id && preview === activePreview)
            ) {
                releaseStudioCameraPreset(preview, { force: true, loadDefault: true });
            }
        });
    }

    function bindStudioCameraNavigation(preview) {
        if (!preview?.node || cameraNavigationBindings.has(preview)) return;
        const beginNavigation = event => {
            if (!studioCameraPresetPreviews.has(preview)) return;
            if (event.target?.closest?.('#studio_render_frame')) return;
            cameraNavigationIntent.add(preview);
            if (event.type === 'wheel') {
                releaseStudioCameraPreset(preview);
                return;
            }
            const point = event.touches?.[0] || event;
            cameraNavigationStarts.set(preview, {
                x: Number(point.clientX) || 0,
                y: Number(point.clientY) || 0
            });
        };
        preview.node.addEventListener('pointerdown', beginNavigation, true);
        preview.node.addEventListener('touchstart', beginNavigation, true);
        preview.node.addEventListener('wheel', beginNavigation, { capture: true, passive: true });
        cameraNavigationBindings.set(preview, () => {
            preview.node?.removeEventListener?.('pointerdown', beginNavigation, true);
            preview.node?.removeEventListener?.('touchstart', beginNavigation, true);
            preview.node?.removeEventListener?.('wheel', beginNavigation, true);
        });
    }

    function bindStudioCameraNavigationPreviews() {
        const previews = typeof Preview !== 'undefined' && Array.isArray(Preview.all)
            ? Preview.all
            : [];
        previews.forEach(bindStudioCameraNavigation);
        bindStudioCameraNavigation(getPreview());
    }

    function applyCameraPreset(id, options = {}) {
        const preset = typeof id === 'object' ? normalizeCameraPreset(id) : getCameraPresetById(id);
        const preview = options.preview || getPreview();
        if (!preset || !preview) return false;
        const width = Math.max(1, preview.width || preview.node?.clientWidth || 1);
        const height = Math.max(1, preview.height || preview.node?.clientHeight || 1);
        const targetAspect = width / height;
        const adaptsRenderFrame = preset.output.capture_area === 'frame';
        const adapted = adaptsRenderFrame
            ? adaptCameraPresetFrame(preset, targetAspect)
            : { scale: 1, frame: normalizeFrameState(preset.frame) };
        const isOrtho = preset.camera.projection === 'orthographic';
        const hasExactProjectionShift = !isOrtho && preset.camera.exact_projection === true && (
            Number.isFinite(preset.camera.projection_shift_x) ||
            Number.isFinite(preset.camera.projection_shift_y)
        );
        // Keep off-axis rays invariant when the saved render frame is fitted to a new viewport aspect.
        const projectionShiftScaleX = adaptsRenderFrame
            ? adapted.scale * preset.camera.reference_aspect / Math.max(0.0001, targetAspect)
            : 1;
        const projectionShiftScaleY = adaptsRenderFrame ? adapted.scale : 1;
        const exactProjectionShiftX = (Number(preset.camera.projection_shift_x) || 0) * projectionShiftScaleX;
        const exactProjectionShiftY = (Number(preset.camera.projection_shift_y) || 0) * projectionShiftScaleY;

        preview.setProjectionMode?.(isOrtho);
        const camera = isOrtho ? preview.camOrtho : preview.camPers;
        if (!camera) return false;
        clearCameraViewOffset(camera);
        camera.position.fromArray(preset.camera.position);
        camera.quaternion.fromArray(preset.camera.quaternion);
        camera.up?.fromArray?.(preset.camera.up);
        if (camera.layers) camera.layers.mask = preset.camera.layers_mask;
        camera.near = preset.camera.near;
        camera.far = preset.camera.far;
        camera.focus = preset.camera.focus;

        if (isOrtho) {
            camera.left = -width / 80;
            camera.right = width / 80;
            camera.top = height / 80;
            camera.bottom = -height / 80;
            const fullWorldHeight = preset.camera.ortho_world_height / adapted.scale;
            camera.zoom = Math.max(0.0001, (camera.top - camera.bottom) / fullWorldHeight);
        } else {
            camera.aspect = targetAspect;
            camera.zoom = preset.camera.zoom;
            const tangent = Math.tan(THREE.MathUtils.degToRad(preset.camera.fov) / 2) / adapted.scale;
            camera.fov = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(tangent)), 0.01, 179);
            camera.filmGauge = preset.camera.film_gauge;
            const filmWidth = typeof camera.getFilmWidth === 'function' ? camera.getFilmWidth() : camera.filmGauge;
            camera.filmOffset = hasExactProjectionShift ? 0 : preset.camera.lens_shift_x * filmWidth;
        }

        if (preview.controls?.target) preview.controls.target.fromArray(preset.camera.target);
        if (preview.controls) preview.controls.unlinked = preset.camera.controls_unlinked;
        studioCameraPresetPreviews.add(preview);
        bindStudioCameraNavigation(preview);
        camera.updateProjectionMatrix?.();
        if (hasExactProjectionShift) {
            applyCameraProjectionShift(
                camera,
                width,
                height,
                exactProjectionShiftX,
                exactProjectionShiftY
            );
        }
        camera.updateMatrixWorld?.(true);
        preview.controls?.update?.();
        camera.position.fromArray(preset.camera.position);
        camera.quaternion.fromArray(preset.camera.quaternion);
        if (hasExactProjectionShift) {
            applyCameraProjectionShift(
                camera,
                width,
                height,
                exactProjectionShiftX,
                exactProjectionShiftY
            );
        }
        camera.updateMatrixWorld?.(true);

        if (options.transient !== true) {
            currentSettings = normalizeForm({
                ...currentSettings,
                ...preset.output,
                resolution: preset.output.resolution.slice(),
                camera_preset_id: preset.id,
                angle_preset: 'view',
                zoom: null
            });
            saveSettings(currentSettings);
            StudioRenderFrame.setState(adapted.frame, preview, currentSettings);
            if (currentSettings.capture_area === 'frame') {
                StudioRenderFrame.show(preview, currentSettings);
            } else {
                StudioRenderFrame.remove(false);
            }
        }
        renderPreviewWithExactCameraPose(preview);
        if (options.transient !== true) {
            syncFrameAction();
            refreshSceneComposerPreviews();
        }
        if (options.notify !== false) {
            Blockbench.showQuickMessage(translate('studio_render.message.preset_applied', 'Camera preset applied') + ': ' + preset.name);
        }
        return true;
    }

    function normalizeForm(form) {
        const settings = Object.assign({}, DEFAULT_SETTINGS, form || {});
        delete settings._studio_workflow_tab;
        delete settings._studio_summary;
        settings.camera_preset_id = typeof settings.camera_preset_id === 'string' ? settings.camera_preset_id : '';
        if (!Array.isArray(settings.resolution)) {
            settings.resolution = DEFAULT_SETTINGS.resolution.slice();
        }
        const preset = RESOLUTION_PRESETS[settings.resolution_preset] || RESOLUTION_PRESETS.custom;
        if (settings.resolution_preset !== 'custom') {
            settings.resolution = preset.slice();
        } else {
            settings.resolution = [
                roundDimension(settings.resolution[0]),
                roundDimension(settings.resolution[1])
            ];
        }
        settings.output_scale = clamp(toNumber(settings.output_scale, 1), 0.1, 8);
        settings.samples = String(settings.samples || '4');
        settings.tile_size = String(settings.tile_size || 'auto');
        settings.match_frame_ratio = !!settings.match_frame_ratio;
        settings.shading = !!settings.shading;
        settings.show_gizmos = !!settings.show_gizmos;
        settings.show_tile_grid = !!settings.show_tile_grid;
        settings.show_advanced = !!settings.show_advanced;
        settings.bloom_enabled = !!settings.bloom_enabled;
        settings.bloom_threshold = clamp(toNumber(settings.bloom_threshold, DEFAULT_SETTINGS.bloom_threshold), 0, 4);
        settings.bloom_soft_knee = clamp(toNumber(settings.bloom_soft_knee, DEFAULT_SETTINGS.bloom_soft_knee), 0, 1);
        settings.bloom_strength = clamp(toNumber(settings.bloom_strength, DEFAULT_SETTINGS.bloom_strength), 0, 3);
        settings.bloom_core_strength = clamp(toNumber(settings.bloom_core_strength, DEFAULT_SETTINGS.bloom_core_strength), 0, 2);
        settings.bloom_core_radius = clamp(toNumber(settings.bloom_core_radius, DEFAULT_SETTINGS.bloom_core_radius), 0.25, 12);
        settings.bloom_halo_strength = clamp(toNumber(settings.bloom_halo_strength, DEFAULT_SETTINGS.bloom_halo_strength), 0, 2);
        settings.bloom_radius = clamp(toNumber(settings.bloom_radius, DEFAULT_SETTINGS.bloom_radius), 1, 128);
        settings.bloom_hdr_strength = clamp(toNumber(settings.bloom_hdr_strength, DEFAULT_SETTINGS.bloom_hdr_strength), 0, 4);
        settings.bloom_emissive_strength = clamp(toNumber(settings.bloom_emissive_strength, DEFAULT_SETTINGS.bloom_emissive_strength), 0, 8);
        settings.bloom_occlusion = settings.bloom_occlusion !== false;
        settings.bloom_pipeline_revision = 3;
        settings.viewport_bloom_enabled = settings.viewport_bloom_enabled !== false;
        settings.viewport_bloom_fps = clamp(toNumber(settings.viewport_bloom_fps, 0), 0, 144);
        settings.viewport_bloom_quality = VIEWPORT_BLOOM_PROFILES[settings.viewport_bloom_quality]
            ? settings.viewport_bloom_quality
            : 'adaptive';
        settings.viewport_composer_revision = 3;
        settings.color_grading_enabled = !!settings.color_grading_enabled;
        settings.exposure = clamp(toNumber(settings.exposure, 1), 0.1, 4);
        settings.contrast = clamp(toNumber(settings.contrast, 1), 0, 3);
        settings.saturation = clamp(toNumber(settings.saturation, 1), 0, 3);
        settings.temperature = clamp(toNumber(settings.temperature, 0), -1, 1);
        settings.tint = clamp(toNumber(settings.tint, 0), -1, 1);
        settings.vignette = clamp(toNumber(settings.vignette, 0), 0, 1);
        settings.zoom = settings.zoom === null || settings.zoom === undefined || settings.zoom === ''
            ? null
            : toNumber(settings.zoom, DEFAULT_ZOOM);
        settings.file_name = String(settings.file_name || DEFAULT_SETTINGS.file_name).trim() || DEFAULT_SETTINGS.file_name;
        delete settings.camera_preset_tools;
        delete settings.camera_preset_apply;
        delete settings.camera_preset_manage;
        delete settings.camera_preset_create;
        delete settings.camera_preset_update;
        delete settings.camera_preset_rename;
        delete settings.camera_preset_delete;
        delete settings.frame_edit;
        delete settings.frame_reset;
        delete settings.gpu_status;
        return settings;
    }

    function getEnvironmentBloomProfile(sourceSettings) {
        const getter = window.LightflowEnvironment?.getBloomSettings;
        if (typeof getter !== 'function') return null;
        try {
            const profile = getter.call(window.LightflowEnvironment, {
                studioBloomEnabled: !!sourceSettings?.bloom_enabled
            });
            return profile && typeof profile === 'object' ? profile : null;
        } catch (error) {
            warnStudioRenderOnce(
                'environment_bloom_profile',
                '[Studio Render] Lightflow Environment Bloom settings could not be read.',
                error
            );
            return null;
        }
    }

    function resolveBloomSettings(sourceSettings) {
        const resolved = Object.assign({}, DEFAULT_SETTINGS, sourceSettings || {});
        const profile = getEnvironmentBloomProfile(resolved);
        /*
         * Studio Render owns the master switch. Environment contributes its
         * live profile only while its own Bloom is enabled; it must neither
         * force Studio Bloom on nor turn authored/emissive Bloom off.
         */
        if (profile?.enabled === true) {
            const assignAlias = (targetKey, aliases) => {
                const key = aliases.find(alias => profile[alias] !== undefined);
                if (key !== undefined) resolved[targetKey] = profile[key];
            };
            assignAlias('bloom_threshold', ['bloom_threshold', 'threshold']);
            assignAlias('bloom_soft_knee', ['bloom_soft_knee', 'soft_knee', 'softKnee']);
            assignAlias('bloom_strength', ['bloom_strength', 'strength']);
            assignAlias('bloom_core_strength', ['bloom_core_strength', 'core_strength', 'coreStrength']);
            assignAlias('bloom_core_radius', ['bloom_core_radius', 'core_radius', 'coreRadius']);
            assignAlias('bloom_halo_strength', ['bloom_halo_strength', 'halo_strength', 'haloStrength']);
            assignAlias('bloom_radius', ['bloom_radius', 'halo_radius', 'haloRadius']);
            assignAlias('bloom_hdr_strength', ['bloom_hdr_strength', 'hdr_strength', 'hdrStrength']);
            assignAlias('bloom_emissive_strength', ['bloom_emissive_strength', 'emissive_strength', 'emissiveStrength']);
            assignAlias('bloom_occlusion', ['bloom_occlusion', 'occlusion']);
        }
        resolved.bloom_enabled = !!resolved.bloom_enabled;
        resolved.bloom_threshold = clamp(toNumber(resolved.bloom_threshold, DEFAULT_SETTINGS.bloom_threshold), 0, 4);
        resolved.bloom_soft_knee = clamp(toNumber(resolved.bloom_soft_knee, DEFAULT_SETTINGS.bloom_soft_knee), 0, 1);
        resolved.bloom_strength = clamp(toNumber(resolved.bloom_strength, DEFAULT_SETTINGS.bloom_strength), 0, 3);
        resolved.bloom_core_strength = clamp(toNumber(resolved.bloom_core_strength, DEFAULT_SETTINGS.bloom_core_strength), 0, 2);
        resolved.bloom_core_radius = clamp(toNumber(resolved.bloom_core_radius, DEFAULT_SETTINGS.bloom_core_radius), 0.25, 12);
        resolved.bloom_halo_strength = clamp(toNumber(resolved.bloom_halo_strength, DEFAULT_SETTINGS.bloom_halo_strength), 0, 2);
        resolved.bloom_radius = clamp(toNumber(resolved.bloom_radius, DEFAULT_SETTINGS.bloom_radius), 1, 128);
        resolved.bloom_hdr_strength = clamp(toNumber(resolved.bloom_hdr_strength, DEFAULT_SETTINGS.bloom_hdr_strength), 0, 4);
        resolved.bloom_emissive_strength = clamp(toNumber(resolved.bloom_emissive_strength, DEFAULT_SETTINGS.bloom_emissive_strength), 0, 8);
        resolved.bloom_occlusion = resolved.bloom_occlusion !== false;
        return resolved;
    }

    function normalizeColor(value) {
        if (!value) return DEFAULT_SETTINGS.background_color;
        if (typeof value === 'string') return value;
        if (typeof value.toHexString === 'function') return value.toHexString();
        if (typeof value.toString === 'function') return value.toString();
        return DEFAULT_SETTINGS.background_color;
    }

    function computeOutputSize(settings, frameRect) {
        let width = roundDimension(settings.resolution[0] * settings.output_scale);
        let height = roundDimension(settings.resolution[1] * settings.output_scale);

        if (
            settings.capture_area === 'frame' &&
            settings.match_frame_ratio &&
            frameRect &&
            frameRect.width > 1 &&
            frameRect.height > 1
        ) {
            height = roundDimension(width * frameRect.height / frameRect.width);
        }

        width = clamp(width, 1, MAX_OUTPUT_DIMENSION);
        height = clamp(height, 1, MAX_OUTPUT_DIMENSION);
        return { width, height };
    }

    function validateOutputSize(size) {
        if (!size || size.width < 1 || size.height < 1) return false;
        if (size.width > MAX_OUTPUT_DIMENSION || size.height > MAX_OUTPUT_DIMENSION) return false;
        return (size.width * size.height) <= MAX_OUTPUT_PIXELS;
    }

    // Studio tile safety is learned per renderer + workload family. The cold
    // start for heavy Lightflow/Rendercraft is intentionally conservative:
    // the user's RTX 5050 report proved that a legal 1920x1080/2048-class
    // single tile can still trigger a device reset. Capability limits answer
    // "can this texture exist?"; they do not answer "can this shader finish
    // this many pixels without tripping the GPU watchdog?".
    const studioTileSafetyByRenderer = new WeakMap();
    const STUDIO_HEAVY_TILE_TIERS = Object.freeze([512, 768, 1024, 1280, 1536]);

    function getStudioWorkloadTileCeiling(workloadClass) {
        // Live RTX 5050 validation certifies Rendercraft at 1024 (16 tiles for
        // 4096², 87 ms max fence). 1280 keeps the same tile count while raising
        // watchdog pressure, so it cannot improve that workload's throughput.
        return workloadClass === 'rendercraft' ? 1024 : 1536;
    }

    function getStudioWorkloadClass() {
        const mode = String(window.ShaderEngine?.globalRenderMode || '').toLowerCase();
        if (mode === 'cinematic_craft' || mode === 'luma_forge') return 'rendercraft';
        if (mode === 'lightflow' || mode === 'shaded_lightflow' || mode === 'pixelated_shaded_lightflow') return 'lightflow';
        if (mode === 'pbr' || mode === 'realview_pbr') return 'pbr';
        return isLightflowRenderMode() ? 'lightflow_other' : 'classic';
    }

    function isStudioHeavyWorkloadClass(workloadClass) {
        return workloadClass === 'rendercraft' ||
            workloadClass === 'lightflow' ||
            workloadClass === 'lightflow_other';
    }

    function getStudioTileSafetyState(renderer, workloadClass = getStudioWorkloadClass()) {
        if (!renderer || (typeof renderer !== 'object' && typeof renderer !== 'function')) {
            return { workloadClass, target: 768, contextLosses: 0, successes: 0, consecutiveSuccesses: 0, lastFenceMs: 0 };
        }
        let byWorkload = studioTileSafetyByRenderer.get(renderer);
        if (!byWorkload) {
            byWorkload = new Map();
            studioTileSafetyByRenderer.set(renderer, byWorkload);
        }
        let state = byWorkload.get(workloadClass);
        if (!state) {
            state = {
                workloadClass,
                target: 768,
                contextLosses: 0,
                successes: 0,
                consecutiveSuccesses: 0,
                lastFenceMs: 0,
                lastTileSize: 0,
                lastOutcome: 'cold'
            };
            byWorkload.set(workloadClass, state);
        }
        return state;
    }

    function getAdaptiveStudioHeavyTileTarget(renderer, sampleCount = 1, workloadClass = getStudioWorkloadClass()) {
        const state = getStudioTileSafetyState(renderer, workloadClass);
        const multiSample = Math.max(1, Number(sampleCount) || 1) > 1;
        // Multisample renders multiply the exact same heavy fragment work; do
        // not exceed the currently certified single-sample tier.
        const target = Math.min(
            getStudioWorkloadTileCeiling(workloadClass),
            Math.max(512, Number(state.target) || 768)
        );
        return multiSample ? Math.min(target, 768) : target;
    }

    function recordStudioTileSafetySuccess(renderer, session) {
        if (!renderer || !session || !session.heavyLightflowSession || session.studioContextLost) return;
        const state = getStudioTileSafetyState(renderer, session.workloadClass);
        state.successes += 1;
        state.consecutiveSuccesses = Math.max(0, Number(state.consecutiveSuccesses) || 0) + 1;
        state.lastFenceMs = Math.max(0, Number(session.maxGpuFenceMs) || 0);
        state.lastTileSize = Math.max(0, Number(session.tileSize) || 0);
        state.lastOutcome = 'success';

        // Promote only between renders, never mid-render. A full certified tile
        // with bounded fence latency earns one tier for the next invocation.
        // This keeps cold-start correctness while allowing fast hardware to
        // recover throughput naturally without any vendor-name heuristic.
        const certifiedTiers = STUDIO_HEAVY_TILE_TIERS.filter(
            value => value <= getStudioWorkloadTileCeiling(session.workloadClass)
        );
        const currentIndex = certifiedTiers.indexOf(state.target);
        const fullTierWasExercised = state.lastTileSize >= state.target * 0.95;
        if (
            currentIndex >= 0 &&
            currentIndex < certifiedTiers.length - 1 &&
            fullTierWasExercised &&
            state.lastFenceMs > 0 &&
            state.lastFenceMs <= 260 &&
            state.consecutiveSuccesses >= 2
        ) {
            state.target = certifiedTiers[currentIndex + 1];
            state.consecutiveSuccesses = 0;
            state.lastOutcome = 'promoted';
        }
    }

    function recordStudioTileSafetyFailure(renderer, session) {
        if (!renderer || !session) return;
        const state = getStudioTileSafetyState(renderer, session.workloadClass);
        state.contextLosses += 1;
        state.consecutiveSuccesses = 0;
        state.lastFenceMs = Math.max(0, Number(session.maxGpuFenceMs) || 0);
        state.lastTileSize = Math.max(0, Number(session.tileSize) || 0);
        state.lastOutcome = 'context_lost';
        const current = Math.max(512, Number(state.target) || 768);
        const lower = STUDIO_HEAVY_TILE_TIERS.filter(value => value < current).pop();
        state.target = lower || 512;
    }

    function resolveTileSize(settings, renderer, sampleFactor, sampleCount = 1) {
        const gpuProfile = getGpuProfile(renderer);
        const maxTextureSize = Math.max(
            sampleFactor,
            Math.min(
                gpuProfile.maxTextureSize || 4096,
                gpuProfile.maxRenderbufferSize || 4096,
                gpuProfile.maxViewportSize || 4096
            )
        );

        // Resource legality and workload safety are separate contracts. Heavy
        // Lightflow/Rendercraft starts at a watchdog-safe tier and can only grow
        // after this exact renderer/workload has completed a certified render.
        const workloadClass = getStudioWorkloadClass();
        const heavyLightflowSession = isStudioHeavyWorkloadClass(workloadClass);
        const multiSample = Math.max(1, Number(sampleCount) || 1) > 1;
        const portableWorkloadTarget = heavyLightflowSession
            ? getAdaptiveStudioHeavyTileTarget(renderer, sampleCount, workloadClass)
            : 2048;
        const autoTileSize = Math.min(maxTextureSize, portableWorkloadTarget);

        const requested = settings.tile_size === 'auto'
            ? autoTileSize
            : parseInt(settings.tile_size, 10);

        /*
            Reserve space for left and right bleed.
            This applies to both center tiles and edge tiles with
            Render Frame overscan.
        */
        const maxBleed = Math.max(
            32,
            sampleFactor * 32,
            PROMOTIONAL_RIM_MAX_RENDER_RADIUS + 4
        );

        const safeRenderExtent = Math.floor(
            maxTextureSize * 0.75
        );

        const safeCoreExtent = Math.max(
            sampleFactor,
            safeRenderExtent - maxBleed * 2
        );

        const safeMax = Math.max(
            sampleFactor,
            Math.floor(safeCoreExtent / sampleFactor) *
            sampleFactor
        );

        const minimumTile = Math.min(256, safeMax);

        const workloadCap = heavyLightflowSession
            ? Math.min(safeMax, portableWorkloadTarget)
            : safeMax;
        const tile = clamp(
            requested || DEFAULT_TILE_SIZE,
            minimumTile,
            Math.min(safeMax, workloadCap)
        );

        return Math.max(sampleFactor, Math.floor(tile / sampleFactor) * sampleFactor);
    }

    function resolveTileBleed(sampleFactor, tileSize) {
        /*
            The rim can reach up to 192 internal pixels after Render Frame zoom.
            This margin prevents cropped frame edges and visible tile seams.
        */
        const requiredBleed = Math.max(
            32,
            sampleFactor * 32,
            PROMOTIONAL_RIM_MAX_RENDER_RADIUS + 4
        );

        return Math.max(
            0,
            Math.min(
                Math.floor(tileSize / 2),
                requiredBleed
            )
        );
    }

    function createCanvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }

    function prepareFinalCanvas(size, settings) {
        const canvas = createCanvas(size.width, size.height);
        const ctx = canvas.getContext('2d', { alpha: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (settings.background_mode === 'solid') {
            ctx.fillStyle = normalizeColor(settings.background_color);
            ctx.fillRect(0, 0, size.width, size.height);
        }
        return { canvas, ctx };
    }

    function copyPreviewCamera(renderPreview, sourcePreview, settings, baseWidth, baseHeight) {
        if (renderPreview.isOrtho !== sourcePreview.isOrtho) {
            renderPreview.setProjectionMode(sourcePreview.isOrtho);
        }
        renderPreview.controls.unlinked = sourcePreview.controls.unlinked;
        renderPreview.controls.target.copy(sourcePreview.controls.target);

        const sourceCamera = sourcePreview.isOrtho ? sourcePreview.camOrtho : sourcePreview.camPers;
        const sourceViewShift = sourcePreview.isOrtho ? { x: 0, y: 0 } : getCameraViewOffsetShift(sourceCamera);
        const camera = renderPreview.camera;
        clearCameraViewOffset(camera);
        camera.position.copy(sourceCamera.position);
        camera.quaternion.copy(sourceCamera.quaternion);
        camera.up.copy(sourceCamera.up);
        camera.near = sourceCamera.near;
        camera.far = sourceCamera.far;
        camera.zoom = sourceCamera.zoom;
        if (sourceCamera.layers && camera.layers) {
            camera.layers.mask = sourceCamera.layers.mask;
        }

        if (sourcePreview.isOrtho) {
            camera.left = -baseWidth / 80;
            camera.right = baseWidth / 80;
            camera.top = baseHeight / 80;
            camera.bottom = -baseHeight / 80;
            const sourceHeight = Math.max(
                1,
                sourcePreview.height || sourcePreview.node?.clientHeight || baseHeight
            );
            const sourceWorldHeight = (sourceHeight / 40) / Math.max(0.0001, sourceCamera.zoom);
            camera.zoom = (baseHeight / 40) / Math.max(0.0001, sourceWorldHeight);
            if (Number.isFinite(settings.zoom) && settings.zoom > 0) {
                camera.zoom = Math.max(0.01, settings.zoom / 100);
            }
        } else {
            camera.aspect = baseWidth / baseHeight;
            camera.fov = sourceCamera.fov;
            camera.focus = sourceCamera.focus;
            camera.filmGauge = sourceCamera.filmGauge;
            // Convert the physical film offset at the effective render FOV
            // into a normalized shift. Perspective Matcher's view offset is
            // added separately so regular Studio zoom overrides remain stable.
            camera.filmOffset = sourceCamera.filmOffset;
            if (Number.isFinite(settings.zoom) && settings.zoom > 0) {
                camera.setFocalLength(settings.zoom);
            }
        }
        camera.updateProjectionMatrix();
        const filmShift = sourcePreview.isOrtho ? { x: 0, y: 0 } : getCameraProjectionShift(camera);
        renderPreview.studio_render_projection_shift = {
            x: sourceViewShift.x + filmShift.x,
            y: sourceViewShift.y + filmShift.y
        };
        if (!sourcePreview.isOrtho) {
            camera.filmOffset = 0;
            camera.updateProjectionMatrix();
        }
    }

    function renderPreviewWithExactCameraPose(renderPreview, options = {}) {
        const camera = renderPreview?.camera;
        const controls = renderPreview?.controls;
        if (!camera || !controls || typeof controls.update !== 'function') {
            return renderPreview?.render?.();
        }

        const exactPosition = camera.position.clone();
        const exactQuaternion = camera.quaternion.clone();
        const exactUp = camera.up.clone();
        const originalControlsUpdate = controls.update;
        const restoreExactPose = () => {
            camera.position.copy(exactPosition);
            camera.quaternion.copy(exactQuaternion);
            camera.up.copy(exactUp);
            camera.updateMatrixWorld?.(true);
        };

        /*
         * Preview.render() always calls controls.update() before drawing.
         * OrbitControls can rebuild an exact/unlinked camera from its target
         * and world-up axis, removing the roll stored by camera presets and
         * Perspective Matcher. Let the controls update their internal state,
         * then restore the immutable Studio pose before renderer.render().
         */
        const exactCameraUpdate = function studioRenderExactCameraUpdate(...args) {
            const result = originalControlsUpdate.apply(this, args);
            restoreExactPose();
            return result;
        };
        controls.update = exactCameraUpdate;

        try {
            restoreExactPose();
            if (typeof window.LightflowRenderer?.renderExternal === 'function') {
                return window.LightflowRenderer.renderExternal(renderPreview, {
                    profile: 'studio',
                    exactCameraPose: true,
                    requiredResources: options.requiredResources,
                    onFrameResources: options.onFrameResources
                });
            }
            return renderPreview.render();
        } finally {
            if (controls.update === exactCameraUpdate) {
                controls.update = originalControlsUpdate;
            }
            restoreExactPose();
        }
    }


    function getCameraProjectionShift(camera) {
        if (!camera) return { x: 0, y: 0 };
        camera.updateProjectionMatrix?.();
        const elements = camera.projectionMatrix?.elements || [];
        return {
            x: Number.isFinite(elements[8]) ? -elements[8] : 0,
            y: Number.isFinite(elements[9]) ? -elements[9] : 0
        };
    }

    function getCameraViewOffsetShift(camera) {
        if (!camera?.view?.enabled) return { x: 0, y: 0 };
        const clone = camera.clone?.();
        if (!clone) return getCameraProjectionShift(camera);
        clone.filmOffset = 0;
        clone.updateProjectionMatrix?.();
        return getCameraProjectionShift(clone);
    }

    function applyCameraProjectionShift(camera, width, height, shiftX, shiftY) {
        if (!camera) return;
        clearCameraViewOffset(camera);
        const safeWidth = Math.max(1, Number(width) || 1);
        const safeHeight = Math.max(1, Number(height) || 1);
        if (typeof camera.setViewOffset === 'function' && (Math.abs(shiftX) > 1e-10 || Math.abs(shiftY) > 1e-10)) {
            camera.setViewOffset(
                safeWidth,
                safeHeight,
                -shiftX * safeWidth * 0.5,
                shiftY * safeHeight * 0.5,
                safeWidth,
                safeHeight
            );
        }
        camera.updateProjectionMatrix?.();
    }

    function clearCameraViewOffset(camera) {
        if (camera && typeof camera.clearViewOffset === 'function') {
            camera.clearViewOffset();
        } else if (camera && camera.view) {
            camera.view = null;
            camera.updateProjectionMatrix();
        }
    }

    function applyOrthographicTileFallback(camera, base, fullWidth, fullHeight, x, y, width, height) {
        const viewLeft = base.left + (base.right - base.left) * (x / fullWidth);
        const viewRight = base.left + (base.right - base.left) * ((x + width) / fullWidth);
        const viewTop = base.top - (base.top - base.bottom) * (y / fullHeight);
        const viewBottom = base.top - (base.top - base.bottom) * ((y + height) / fullHeight);
        camera.left = viewLeft;
        camera.right = viewRight;
        camera.top = viewTop;
        camera.bottom = viewBottom;
        camera.updateProjectionMatrix();
    }

    function getStudioSampleJitters(sampleCount) {
        const count = Math.max(1, Math.floor(Number(sampleCount) || 1));
        if (count === 1) return [{ x: 0, y: 0 }];
        const halton = (index, base) => {
            let result = 0;
            let fraction = 1 / base;
            let value = index;
            while (value > 0) {
                result += fraction * (value % base);
                value = Math.floor(value / base);
                fraction /= base;
            }
            return result;
        };
        const samples = Array.from({ length: count }, (unused, index) => ({
            x: halton(index + 1, 2) - 0.5,
            y: halton(index + 1, 3) - 0.5
        }));
        const mean = samples.reduce(
            (sum, sample) => ({ x: sum.x + sample.x, y: sum.y + sample.y }),
            { x: 0, y: 0 }
        );
        mean.x /= count;
        mean.y /= count;
        samples.forEach(sample => {
            sample.x -= mean.x;
            sample.y -= mean.y;
        });
        return samples;
    }

    function configureTileCamera(renderPreview, sourcePreview, settings, tile, sampleJitter = null) {
        const baseWidth = tile.fullViewWidth;
        const baseHeight = tile.fullViewHeight;
        const renderWidth = Math.max(1, Number(tile.renderWidth || tile.sampleWidth) || 1);
        const renderHeight = Math.max(1, Number(tile.renderHeight || tile.sampleHeight) || 1);
        const jitterX = Number(sampleJitter?.x) || 0;
        const jitterY = Number(sampleJitter?.y) || 0;
        const jitteredViewX = tile.viewX + jitterX * tile.viewWidth / renderWidth;
        const jitteredViewY = tile.viewY + jitterY * tile.viewHeight / renderHeight;

        copyPreviewCamera(renderPreview, sourcePreview, settings, baseWidth, baseHeight);
        // Projection changes replace the active camera, including on tile one.
        const camera = renderPreview.camera;

        if (typeof camera.setViewOffset === 'function') {
            const projectionShift = renderPreview.studio_render_projection_shift || { x: 0, y: 0 };
            camera.setViewOffset(
                tile.fullViewWidth,
                tile.fullViewHeight,
                jitteredViewX - projectionShift.x * tile.fullViewWidth * 0.5,
                jitteredViewY + projectionShift.y * tile.fullViewHeight * 0.5,
                tile.viewWidth,
                tile.viewHeight
            );
            camera.updateProjectionMatrix();
        } else if (sourcePreview.isOrtho) {
            applyOrthographicTileFallback(
                camera,
                {
                    left: camera.left,
                    right: camera.right,
                    top: camera.top,
                    bottom: camera.bottom
                },
                tile.fullViewWidth,
                tile.fullViewHeight,
                jitteredViewX,
                jitteredViewY,
                tile.viewWidth,
                tile.viewHeight
            );
        }
    }

    function getFrameRectForPreview(preview, settings, frameState = null) {
        if (!preview) return null;
        const state = frameState
            ? normalizeFrameState(frameState)
            : StudioRenderFrame.getState(preview, settings);
        const width = preview.width || preview.node?.clientWidth || 1;
        const height = preview.height || preview.node?.clientHeight || 1;
        return {
            x: clamp(state.x, 0, 0.98) * width,
            y: clamp(state.y, 0, 0.98) * height,
            width: clamp(state.width, 0.001, 1) * width,
            height: clamp(state.height, 0.001, 1) * height
        };
    }

    function buildTileList(size, sampleFactor, tileSize, preview, settings, frameRect) {
        const sampleWidth = size.width * sampleFactor;
        const sampleHeight = size.height * sampleFactor;

        const tiles = [];

        const useFrame = settings.capture_area === 'frame' && frameRect;

        const sourceWidth = Math.max(
            1,
            preview.width || preview.node?.clientWidth || size.width
        );

        const sourceHeight = Math.max(
            1,
            preview.height || preview.node?.clientHeight || size.height
        );

        /*
            The rim scales from final output pixels to the actually captured
            area. The geometric mean keeps circular screen-space dilation
            stable when the frame aspect ratio differs from the viewport.
        */
        const rimReferenceWidth = useFrame
            ? Math.max(frameRect.width, 1)
            : sourceWidth;

        const rimReferenceHeight = useFrame
            ? Math.max(frameRect.height, 1)
            : sourceHeight;

        const rimScaleX = size.width / rimReferenceWidth;
        const rimScaleY = size.height / rimReferenceHeight;

        const promotionalRimFrameScale = Math.max(
            1.0,
            Math.sqrt(rimScaleX * rimScaleY)
        );

        /*
            Shared tile bleed also acts as outer frame overscan. It is larger
            than the maximum rim radius so screen-space dilation has source data.
        */
        const bleed = resolveTileBleed(sampleFactor, tileSize);

        for (let y = 0; y < sampleHeight; y += tileSize) {
            const tileHeight = Math.min(
                tileSize,
                sampleHeight - y
            );

            for (let x = 0; x < sampleWidth; x += tileSize) {
                const tileWidth = Math.min(
                    tileSize,
                    sampleWidth - x
                );

                /*
                    Shared bleed between neighboring tiles.
                */
                const sharedBleedLeft = Math.min(bleed, x);
                const sharedBleedTop = Math.min(bleed, y);
                const sharedBleedRight = Math.min(
                    bleed,
                    sampleWidth - (x + tileWidth)
                );
                const sharedBleedBottom = Math.min(
                    bleed,
                    sampleHeight - (y + tileHeight)
                );

                /*
                    Extra overscan outside the render frame, only on the outer
                    frame edges.
                */
                const frameBleedLeft =
                    useFrame && x === 0 ? bleed : 0;

                const frameBleedTop =
                    useFrame && y === 0 ? bleed : 0;

                const frameBleedRight =
                    useFrame && x + tileWidth === sampleWidth
                        ? bleed
                        : 0;

                const frameBleedBottom =
                    useFrame && y + tileHeight === sampleHeight
                        ? bleed
                        : 0;

                const cropX =
                    sharedBleedLeft +
                    frameBleedLeft;

                const cropY =
                    sharedBleedTop +
                    frameBleedTop;

                const cropRight =
                    sharedBleedRight +
                    frameBleedRight;

                const cropBottom =
                    sharedBleedBottom +
                    frameBleedBottom;

                const renderX = x - cropX;
                const renderY = y - cropY;

                const renderWidth =
                    tileWidth +
                    cropX +
                    cropRight;

                const renderHeight =
                    tileHeight +
                    cropY +
                    cropBottom;

                let fullViewWidth = sampleWidth;
                let fullViewHeight = sampleHeight;

                let viewX = renderX;
                let viewY = renderY;
                let viewWidth = renderWidth;
                let viewHeight = renderHeight;

                if (useFrame) {
                    fullViewWidth = sourceWidth;
                    fullViewHeight = sourceHeight;

                    /*
                        renderX/renderY can go negative on frame edges. That is
                        intentional: the camera renders beyond the final crop so
                        the rim pass has enough source pixels.
                    */
                    viewX =
                        frameRect.x +
                        (renderX / sampleWidth) *
                        frameRect.width;

                    viewY =
                        frameRect.y +
                        (renderY / sampleHeight) *
                        frameRect.height;

                    viewWidth =
                        (renderWidth / sampleWidth) *
                        frameRect.width;

                    viewHeight =
                        (renderHeight / sampleHeight) *
                        frameRect.height;
                }

                tiles.push({
                    sampleX: x,
                    sampleY: y,

                    sampleWidth: tileWidth,
                    sampleHeight: tileHeight,

                    renderWidth,
                    renderHeight,

                    cropX,
                    cropY,

                    promotionalRimFrameScale,

                    outputX: x / sampleFactor,
                    outputY: y / sampleFactor,

                    outputWidth: tileWidth / sampleFactor,
                    outputHeight: tileHeight / sampleFactor,

                    fullViewWidth,
                    fullViewHeight,

                    viewX,
                    viewY,
                    viewWidth,
                    viewHeight
                });
            }
        }

        return tiles;
    }

    function prepareRendererForTile(
        renderPreview,
        sourcePreview,
        settings,
        tile,
        renderSession,
        sampleJitter = null,
        sampleIndex = 0
    ) {
        const renderWidth = tile.renderWidth || tile.sampleWidth;
        const renderHeight = tile.renderHeight || tile.sampleHeight;
        const renderer = renderPreview.renderer;

        /*
            The physical canvas must match tile and rim units instead of
            inheriting monitor DPI.
        */
        if (renderer && typeof renderer.setPixelRatio === 'function' && renderer.getPixelRatio?.() !== 1) {
            renderer.setPixelRatio(1);
        }

        // Native Preview.resize -> renderer.setSize resets canvas storage even
        // at the same size. Supersamples only change the projection jitter.
        if (
            renderPreview.width !== renderWidth || renderPreview.height !== renderHeight ||
            renderPreview.canvas?.width !== renderWidth || renderPreview.canvas?.height !== renderHeight
        ) {
            renderPreview.resize(renderWidth, renderHeight);
        }
        configureTileCamera(renderPreview, sourcePreview, settings, tile, sampleJitter);
        updateStudioRenderBillboards(renderPreview.camera);
        if (typeof renderPreview.renderer?.setClearColor === 'function') {
            renderPreview.renderer.setClearColor(0x000000, 0);
        }
        if (typeof renderPreview.renderer?.setViewport === 'function') {
            renderPreview.renderer.setViewport(0, 0, renderWidth, renderHeight);
        }
        if (typeof renderPreview.renderer?.setScissorTest === 'function') {
            renderPreview.renderer.setScissorTest(false);
        }
        const studioSampleScale = 1;
        const studioFrameScale = Math.max(
            1.0,
            Number(tile.promotionalRimFrameScale) || 1.0
        );
        if (typeof window.ShaderArchitectSetStudioRenderSampleScale === 'function') {
            window.ShaderArchitectSetStudioRenderSampleScale(
                studioSampleScale,
                studioFrameScale,
                sampleIndex
            );
        }

        let lightManagerPrepared = !!renderSession?.lightManagerPrepared;
        if (!lightManagerPrepared && typeof window.LightManagerPrepareRender === 'function') {
            window.LightManagerPrepareRender(renderPreview, { studio: true });
            lightManagerPrepared = true;
            if (renderSession) renderSession.lightManagerPrepared = true;
        }
        if (typeof Blockbench !== 'undefined' && typeof Blockbench.dispatchEvent === 'function') {
            const event = {
                preview: renderPreview,
                source_preview: sourcePreview,
                tile,
                settings,
                sampleIndex,
                lightManagerPrepared,

                promotionalRimFrameScale: Math.max(
                    1.0,
                    Number(tile.promotionalRimFrameScale) || 1.0
                )
            };
            if (sampleIndex === 0) {
                Blockbench.dispatchEvent('studio_render_pre_tile', event);
            }
            Blockbench.dispatchEvent('studio_render_pre_sample', event);
        }
    }

    function previewHasPromotionalRimPreparation(preview, sampleScale, frameScale) {
        if (!preview) return false;
        const currentSampleScale = Number(preview.sa_promotional_rim_sample_scale);
        const currentFrameScale = Number(preview.sa_promotional_rim_frame_scale);

        return (
            Number.isFinite(currentSampleScale) &&
            Number.isFinite(currentFrameScale) &&
            Math.abs(currentSampleScale - sampleScale) < 0.0001 &&
            Math.abs(currentFrameScale - frameScale) < 0.0001
        );
    }

    function studioRenderNeedsShadowWarmup() {
        if (!window.LightElement || !Array.isArray(LightElement.all)) return false;

        return LightElement.all.some(element => {
            if (!element || element.has_shadow === false) return false;
            const previewResolution = Number(element.shadow_resolution) || 0;
            const studioResolution = Number(element.studio_shadow_resolution) || 0;
            return studioResolution > 0 && studioResolution !== previewResolution;
        });
    }

    function synchronizeStudioRenderLighting(renderPreview, renderSession) {
        if (renderSession?.lightingPrepared) return;
        /*
         * Fancy Shader materials calculate their direct light and shadow index
         * uniforms manually. Keep them synchronized immediately before the
         * tile's warmup/final renders, rather than waiting for a queued preview
         * refresh which is intentionally suppressed during the Studio session.
         */
        if (typeof window.UpdateShaderArchitectLights === 'function') {
            window.UpdateShaderArchitectLights({
                studio: true,
                preview: renderPreview,
                source: 'studio_render_pre_tile'
            });
        } else if (typeof window.updateLights === 'function') {
            window.updateLights({
                studio: true,
                preview: renderPreview,
                source: 'studio_render_pre_tile'
            });
        }
        if (renderSession) renderSession.lightingPrepared = true;
    }

    function freezeStudioShadowMapAfterFirstTile(renderPreview, renderSession) {
        if (
            !renderSession ||
            renderSession.shadowMapPrimed ||
            !renderSession.lightManagerPrepared
        ) return;
        const shadowMap = renderPreview?.renderer?.shadowMap;
        if (!shadowMap) return;

        /*
         * Every tile sees the same static scene and lights. Once Three has
         * populated the Studio shadow targets on the first beauty render, keep
         * them for all remaining camera view-offset tiles instead of drawing
         * every shadow caster again for every tile.
         */
        shadowMap.autoUpdate = false;
        shadowMap.needsUpdate = false;
        renderPreview.sa_studio_render_reuse_shadows = true;
        renderSession.shadowMapPrimed = true;
    }

    function compositeStudioRenderPostEffects(
        renderPreview,
        settings,
        tile,
        destinationTarget = null
    ) {
        const manager = window.MinecraftPromotionalSilhouetteManager;
        if (!manager || typeof manager.renderSilhouette !== 'function') return;

        const renderer = renderPreview && renderPreview.renderer;
        if (!renderer) return;

        const sampleScale = 1;
        const frameScale = Math.max(
            1.0,
            Number(tile.promotionalRimFrameScale) || 1.0
        );

        if (typeof manager.preparePreviewForRender === 'function') {
            if (!previewHasPromotionalRimPreparation(renderPreview, sampleScale, frameScale)) {
                manager.preparePreviewForRender(renderPreview, {
                    sampleScale,
                    frameScale
                });
            }
        }

        const previousTarget = typeof renderer.getRenderTarget === 'function'
            ? renderer.getRenderTarget()
            : undefined;
        const previousViewport = typeof renderer.getViewport === 'function' && window.THREE
            ? renderer.getViewport(new THREE.Vector4())
            : null;
        const previousScissor = typeof renderer.getScissor === 'function' && window.THREE
            ? renderer.getScissor(new THREE.Vector4())
            : null;
        const previousScissorTest = typeof renderer.getScissorTest === 'function'
            ? renderer.getScissorTest()
            : null;

        try {
            if (typeof renderer.setRenderTarget === 'function') {
                renderer.setRenderTarget(destinationTarget);
            }
            if (typeof renderer.setViewport === 'function') {
                renderer.setViewport(
                    0,
                    0,
                    tile.renderWidth || tile.sampleWidth,
                    tile.renderHeight || tile.sampleHeight
                );
            }
            if (typeof renderer.setScissorTest === 'function') {
                renderer.setScissorTest(false);
            }

            manager.renderSilhouette(renderPreview);
        } finally {
            if (previousTarget !== undefined && typeof renderer.setRenderTarget === 'function') {
                renderer.setRenderTarget(previousTarget);
            }
            if (previousViewport && typeof renderer.setViewport === 'function') {
                renderer.setViewport(previousViewport);
            }
            if (previousScissor && typeof renderer.setScissor === 'function') {
                renderer.setScissor(previousScissor);
            }
            if (previousScissorTest !== null && typeof renderer.setScissorTest === 'function') {
                renderer.setScissorTest(previousScissorTest);
            }
        }
    }

    function getMaterialUniformValue(material, name, fallback) {
        const uniform = material?.uniforms?.[name];
        return uniform ? uniform.value : fallback;
    }

    function getMaterialTexture(material, name, fallback = null) {
        const value = getMaterialUniformValue(material, name, null);
        if (value && value.isTexture) return value;
        if (name === 'map' && material?.map?.isTexture) return material.map;
        return fallback;
    }

    function getMaterialEmissiveState(material) {
        if (!material) return { active: false, mode: 0 };

        const shaderId = String(material.sa_shader_id || '').toLowerCase();
        const isRendercraftMaterial = !!(
            (shaderId === 'cinematic_craft' || shaderId === 'luma_forge') &&
            material.uniforms?.SA_RENDERCRAFT_OUTPUT_MODE &&
            material.vertexShader &&
            material.fragmentShader
        );
        let supportsSelectiveRendercraftBloom = false;
        if (isRendercraftMaterial) {
            let support = BLOOM_MASK_STATE.rendercraftBloomSupport.get(material);
            if (!support || support.source !== material.fragmentShader) {
                support = {
                    source: material.fragmentShader,
                    supported: /SA_RENDERCRAFT_OUTPUT_MODE\s*==\s*2/.test(material.fragmentShader)
                };
                BLOOM_MASK_STATE.rendercraftBloomSupport.set(material, support);
            }
            supportsSelectiveRendercraftBloom = support.supported;
        }
        const renderMode = String(material.sa_source_render_mode || '').toLowerCase();
        const emissiveMode = renderMode === 'emissive' ||
            getMaterialUniformValue(material, 'EMISSIVE', false) === true;
        const additiveMode = renderMode === 'additive' ||
            getMaterialUniformValue(material, 'ADDITIVE', false) === true ||
            material.blending === THREE.AdditiveBlending;
        const merMap = getMaterialTexture(material, 'uMetallicRoughnessMap');
        const emissiveMap = getMaterialTexture(material, 'uEmissiveMap', material.emissiveMap || null);
        const useMERMap = !!(
            merMap &&
            getMaterialUniformValue(material, 'uUseBlockbenchMERMap', false) === true
        );
        const useShaderEmissiveMap = !!(
            emissiveMap &&
            getMaterialUniformValue(material, 'uUseEmissiveMap', false) === true
        );
        const useStandardEmissiveMap = !!(material.emissiveMap && material.emissiveMap.isTexture);
        const useEmissiveMap = useShaderEmissiveMap || useStandardEmissiveMap;
        const useTextureEmission = getMaterialUniformValue(material, 'uEmissiveUseTexture', false) === true;
        const hasShaderEmission = !!material.uniforms?.uEmissiveStrength;
        const fallbackEmissiveStrength = Number.isFinite(Number(material.emissiveIntensity))
            ? Number(material.emissiveIntensity)
            : 1;
        const emissiveStrength = Math.max(
            0,
            Number(getMaterialUniformValue(material, 'uEmissiveStrength', fallbackEmissiveStrength)) || 0
        );
        const emissiveColor = getMaterialUniformValue(material, 'uEmissiveColor', material.emissive || null);
        const emissiveColorEnergy = emissiveColor
            ? Math.max(
                Number(emissiveColor.x ?? emissiveColor.r) || 0,
                Number(emissiveColor.y ?? emissiveColor.g) || 0,
                Number(emissiveColor.z ?? emissiveColor.b) || 0
            )
            : 0;
        const useShaderEmission = !!(
            hasShaderEmission &&
            emissiveStrength > 0.0005 &&
            (useTextureEmission || emissiveColorEnergy > 0.0005)
        );
        const hasStandardEmissiveColor = !!(
            material.emissive &&
            typeof material.emissive.getHex === 'function' &&
            material.emissive.getHex() !== 0
        );
        const useStandardColorEmission = !!(
            hasStandardEmissiveColor &&
            !useStandardEmissiveMap &&
            emissiveStrength > 0.0005
        );
        const useMapEmission = !!(useEmissiveMap && emissiveStrength > 0.0005);
        const useMEREmission = !!(useMERMap && emissiveStrength > 0.0005);
        const bevelGlowIntensity = getMaterialUniformValue(
            material,
            'BEVEL_GLOW_SYNC_TO_PROMO_RIM',
            false
        ) === true &&
            Number(getMaterialUniformValue(material, 'BEVEL_GLOW_MODE', 0)) !== 1 &&
            Number(getMaterialUniformValue(material, 'PROMO_RIM_COLOR_MODE', 0)) !== 3
            ? Number(getMaterialUniformValue(material, 'PROMO_RIM_INTENSITY', 0)) || 0
            : Number(getMaterialUniformValue(material, 'BEVEL_GLOW_INTENSITY', 0)) || 0;
        const hasExplicitEmission = !!(
            emissiveMode ||
            additiveMode ||
            useShaderEmission ||
            useStandardColorEmission ||
            useMEREmission ||
            useMapEmission
        );
        const hasRendercraftEdgeEmission = !!(
            supportsSelectiveRendercraftBloom &&
            getMaterialUniformValue(material, 'BEVEL_GLOW_ENABLED', false) === true &&
            Number(getMaterialUniformValue(material, 'BEVEL_GLOW_WIDTH', 0)) > 0.00001 &&
            bevelGlowIntensity > 0.0005
        );
        const useRendercraftBloom = !!(
            supportsSelectiveRendercraftBloom &&
            (hasExplicitEmission || hasRendercraftEdgeEmission)
        );

        return {
            active: useRendercraftBloom || hasExplicitEmission,
            mode: emissiveMode ? 1 : (additiveMode ? 2 : 0),
            useRendercraftBloom,
            hasRendercraftEdgeEmission,
            useShaderEmission: useShaderEmission || useStandardColorEmission,
            useTextureEmission,
            useMERMap: useMEREmission,
            useEmissiveMap: useMapEmission,
            tintEmissiveMap: useStandardEmissiveMap && !useShaderEmissiveMap,
            emissiveStrength,
            baseMap: getMaterialTexture(material, 'map'),
            baseColorMap: getMaterialTexture(material, 'uBaseColorMap'),
            emissiveMap,
            merMap,
            emissiveColor,
            baseColor: getMaterialUniformValue(material, 'uBaseColor', material.color || null),
            baseAlpha: Math.max(
                0,
                Number(getMaterialUniformValue(
                    material,
                    'uBaseAlpha',
                    material.opacity !== undefined ? material.opacity : 1
                )) || 0
            ),
            useBaseColorMap: getMaterialUniformValue(material, 'uUseBaseColorMap', false) === true,
            autoTile: getMaterialUniformValue(material, 'AUTO_TILE', false) === true,
            tiling: getMaterialUniformValue(material, 'TILING', null),
            textureSize: getMaterialUniformValue(material, 'TEXTURE_SIZE', null),
            baseColorMapScale: getMaterialUniformValue(material, 'uBaseColorMapScale', null),
            emissiveMapScale: getMaterialUniformValue(material, 'uEmissiveMapScale', null),
            merMapScale: getMaterialUniformValue(material, 'uMetallicRoughnessMapScale', null)
        };
    }

    function copyColorToVector(target, value) {
        if (!value) return target.set(1, 1, 1);
        if (value.isColor) return target.set(value.r, value.g, value.b);
        if (value.x !== undefined) return target.set(value.x, value.y, value.z);
        if (value.r !== undefined) return target.set(value.r, value.g, value.b);
        return target.set(1, 1, 1);
    }

    function copyScaleToVector(target, value, fallbackX = 1, fallbackY = 1) {
        if (Array.isArray(value)) {
            return target.set(
                Number.isFinite(Number(value[0])) ? Number(value[0]) : fallbackX,
                Number.isFinite(Number(value[1])) ? Number(value[1]) : fallbackY
            );
        }
        if (value && value.x !== undefined) {
            return target.set(
                Number.isFinite(Number(value.x)) ? Number(value.x) : fallbackX,
                Number.isFinite(Number(value.y)) ? Number(value.y) : fallbackY
            );
        }
        return target.set(fallbackX, fallbackY);
    }

    function getBloomFallbackTexture(white) {
        const key = white ? 'whiteTexture' : 'blackTexture';
        if (BLOOM_MASK_STATE[key]) return BLOOM_MASK_STATE[key];
        const channel = white ? 255 : 0;
        const texture = new THREE.DataTexture(
            new Uint8Array([channel, channel, channel, 255]),
            1,
            1,
            THREE.RGBAFormat
        );
        texture.name = white
            ? 'StudioRender_BloomWhiteFallback'
            : 'StudioRender_BloomBlackFallback';
        texture.needsUpdate = true;
        BLOOM_MASK_STATE[key] = texture;
        BLOOM_MASK_STATE.resources.add(texture);
        return texture;
    }

    function disposeBloomDerivedResources() {
        BLOOM_MASK_STATE.derivedResources.forEach(resource => resource?.dispose?.());
        BLOOM_MASK_STATE.derivedResources.clear();
        BLOOM_MASK_STATE.emissiveMaterials = new WeakMap();
        BLOOM_MASK_STATE.occluderMaterials = new WeakMap();
        BLOOM_MASK_STATE.rendercraftMaterials = new WeakMap();
        BLOOM_MASK_STATE.rendercraftBloomSupport = new WeakMap();
    }

    // Specialized Studio passes are derived from the immutable base shader
    // source recorded by Shader Architect's program recipe. Studio never
    // removes MRT declarations with regular expressions and never mutates the
    // interactive beauty program to create an auxiliary pass.
    function getStudioPassShaderSource(sourceMaterial, pass, features = {}) {
        const glowRecipe = sourceMaterial?.userData?.lightflowProgramRecipe;
        if (pass === 'studio_bloom' && sourceMaterial?.uniforms?.BEVEL_GLOW_ENABLED?.value &&
            glowRecipe?.baseVertexShader && glowRecipe?.baseFragmentShader?.includes('SA_RENDERCRAFT_GLOW_BLOOM')) {
            return {
                vertexShader: glowRecipe.baseVertexShader,
                fragmentShader: '#define SA_RENDERCRAFT_GLOW_BLOOM 1\n' + glowRecipe.baseFragmentShader
            };
        }
        const resolved = window.LightflowRenderer?.getPassShaderSource?.(
            sourceMaterial,
            { pass, features }
        );
        if (resolved?.vertexShader && resolved?.fragmentShader) return resolved;

        const metadata = sourceMaterial?.userData?.lightflowProgramRecipe;
        if (metadata?.baseVertexShader && metadata?.baseFragmentShader) {
            return {
                recipe: metadata.recipe || null,
                vertexShader: metadata.baseVertexShader,
                fragmentShader: metadata.baseFragmentShader,
                sourceAudit: null
            };
        }

        // Legacy/non-Lightflow materials are safe only if they are already
        // single-output. An MRT beauty shader is never heuristically rewritten.
        const vertexShader = String(sourceMaterial?.vertexShader || '');
        const fragmentShader = String(sourceMaterial?.fragmentShader || '');
        if (
            vertexShader.includes('SA_LIGHTFLOW_MRT_VERTEX') ||
            fragmentShader.includes('SA_LIGHTFLOW_MRT_FRAGMENT')
        ) {
            console.warn('[Studio Render] Refusing to derive studio_bloom from an MRT beauty shader without a program recipe.');
            return null;
        }
        return { vertexShader, fragmentShader, recipe: null, sourceAudit: null };
    }

    function getRendercraftBloomMaterial(sourceMaterial) {
        let material = BLOOM_MASK_STATE.rendercraftMaterials.get(sourceMaterial);
        const sourceUniforms = sourceMaterial.uniforms || {};
        const selectiveOutputMode = 2;
        const passSource = getStudioPassShaderSource(sourceMaterial, 'studio_bloom', {
            selectiveBloom: true
        });
        if (!passSource) return null;
        const studioVertexShader = passSource.vertexShader;
        const studioFragmentShader = passSource.fragmentShader;

        if (!material) {
            const uniforms = {};
            Object.entries(sourceUniforms).forEach(([name, uniform]) => {
                uniforms[name] = { value: uniform?.value };
            });
            uniforms.SA_RENDERCRAFT_OUTPUT_MODE = { value: selectiveOutputMode };
            material = new THREE.ShaderMaterial({
                uniforms,
                vertexShader: studioVertexShader,
                fragmentShader: studioFragmentShader,
                defines: {
                    ...(sourceMaterial.defines || {}),
                    SA_RENDERCRAFT_STUDIO_BLOOM: 1
                },
                lights: !!sourceMaterial.lights,
                fog: !!sourceMaterial.fog,
                clipping: !!sourceMaterial.clipping,
                extensions: {
                    ...(sourceMaterial.extensions || {}),
                    derivatives: true
                },
                depthTest: sourceMaterial.depthTest !== false,
                depthWrite: true,
                transparent: false,
                blending: THREE.NoBlending,
                side: sourceMaterial.side !== undefined
                    ? sourceMaterial.side
                    : THREE.FrontSide
            });
            material.name = 'StudioRender_RendercraftLinearBloomMask';
            material.toneMapped = false;
            material.glslVersion = null;
            material.userData = material.userData || {};
            material.userData.saStudioSingleOutput = true;
            if (material.extensions && Object.prototype.hasOwnProperty.call(material.extensions, 'drawBuffers')) {
                delete material.extensions.drawBuffers;
            }
            BLOOM_MASK_STATE.rendercraftMaterials.set(sourceMaterial, material);
            BLOOM_MASK_STATE.derivedResources.add(material);
        }

        let programChanged = false;
        if (material.vertexShader !== studioVertexShader) {
            material.vertexShader = studioVertexShader;
            programChanged = true;
        }
        if (material.fragmentShader !== studioFragmentShader) {
            material.fragmentShader = studioFragmentShader;
            programChanged = true;
        }
        if (!!material.lights !== !!sourceMaterial.lights) {
            material.lights = !!sourceMaterial.lights;
            programChanged = true;
        }
        const sourceDefines = {
            ...(sourceMaterial.defines || {}),
            SA_RENDERCRAFT_STUDIO_BLOOM: 1
        };
        const currentDefines = material.defines || {};
        const sourceDefineKeys = Object.keys(sourceDefines);
        const currentDefineKeys = Object.keys(currentDefines);
        const definesChanged = sourceDefineKeys.length !== currentDefineKeys.length ||
            sourceDefineKeys.some(key => currentDefines[key] !== sourceDefines[key]);
        if (definesChanged) {
            material.defines = sourceDefines;
            programChanged = true;
        }
        Object.entries(sourceUniforms).forEach(([name, uniform]) => {
            if (name === 'SA_RENDERCRAFT_OUTPUT_MODE') return;
            if (!material.uniforms[name]) material.uniforms[name] = { value: uniform?.value };
            else material.uniforms[name].value = uniform?.value;
        });
        material.uniforms.SA_RENDERCRAFT_OUTPUT_MODE =
            material.uniforms.SA_RENDERCRAFT_OUTPUT_MODE || { value: selectiveOutputMode };
        material.uniforms.SA_RENDERCRAFT_OUTPUT_MODE.value = selectiveOutputMode;
        material.side = sourceMaterial.side !== undefined
            ? sourceMaterial.side
            : THREE.FrontSide;
        material.alphaTest = sourceMaterial.alphaTest || 0.01;
        material.depthTest = sourceMaterial.depthTest !== false;
        material.depthWrite = true;
        material.uniformsNeedUpdate = true;
        if (programChanged) material.needsUpdate = true;
        return material;
    }

    function getBloomMaskMaterial(sourceMaterial, emissive, state = getMaterialEmissiveState(sourceMaterial)) {
        // Explicit Rendercraft emission does not need the 181K beauty shader.
        // The generic Studio emission pass below already preserves base/emissive/MER
        // semantics and linear bloom encoding. Only edge-glow still needs the current
        // Rendercraft-specialized path until that bevel module is split in Phase 2.
        if (emissive && state.hasRendercraftEdgeEmission) {
            const specializedMaterial = getRendercraftBloomMaterial(sourceMaterial);
            if (specializedMaterial) return specializedMaterial;
        }

        const cache = emissive
            ? BLOOM_MASK_STATE.emissiveMaterials
            : BLOOM_MASK_STATE.occluderMaterials;
        let material = cache.get(sourceMaterial);

        if (!material) {
            material = new THREE.ShaderMaterial({
                uniforms: {
                    map: { value: null },
                    uBaseColorMap: { value: null },
                    uEmissiveMap: { value: null },
                    uMERMap: { value: null },
                    uBaseColor: { value: new THREE.Vector3(1, 1, 1) },
                    uEmissiveColor: { value: new THREE.Vector3(1, 1, 1) },
                    uBaseAlpha: { value: 1 },
                    uAutoTile: { value: false },
                    uTiling: { value: new THREE.Vector2(1, 1) },
                    uTextureSize: { value: new THREE.Vector2(16, 16) },
                    uBaseColorMapScale: { value: new THREE.Vector2(1, 1) },
                    uEmissiveMapScale: { value: new THREE.Vector2(1, 1) },
                    uMERMapScale: { value: new THREE.Vector2(1, 1) },
                    uMode: { value: 0 },
                    uUseShaderEmission: { value: false },
                    uUseTextureEmission: { value: false },
                    uUseBaseColorMap: { value: false },
                    uUseEmissiveMap: { value: false },
                    uTintEmissiveMap: { value: false },
                    uUseMERMap: { value: false },
                    uEmissiveStrength: { value: 1 },
                    uAlphaCutoff: { value: 0.01 },
                    uEmit: { value: emissive }
                },
                vertexShader: `
                    attribute vec2 globalFaceSize;
                    attribute float autoTile;
                    uniform bool uAutoTile;
                    uniform vec2 uTiling;
                    uniform vec2 uTextureSize;
                    varying vec2 vMaterialUv;
                    void main() {
                        float useAutoTile = max(autoTile, uAutoTile ? 1.0 : 0.0);
                        vec2 tiling = useAutoTile > 0.5
                            ? abs(globalFaceSize) / max(abs(uTextureSize), vec2(1.0))
                            : uTiling;
                        vMaterialUv = uv * tiling;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    precision highp float;
                    uniform sampler2D map;
                    uniform sampler2D uBaseColorMap;
                    uniform sampler2D uEmissiveMap;
                    uniform sampler2D uMERMap;
                    uniform vec3 uBaseColor;
                    uniform vec3 uEmissiveColor;
                    uniform float uBaseAlpha;
                    uniform vec2 uBaseColorMapScale;
                    uniform vec2 uEmissiveMapScale;
                    uniform vec2 uMERMapScale;
                    uniform int uMode;
                    uniform bool uUseShaderEmission;
                    uniform bool uUseTextureEmission;
                    uniform bool uUseBaseColorMap;
                    uniform bool uUseEmissiveMap;
                    uniform bool uTintEmissiveMap;
                    uniform bool uUseMERMap;
                    uniform float uEmissiveStrength;
                    uniform float uAlphaCutoff;
                    uniform bool uEmit;
                    varying vec2 vMaterialUv;

                    vec3 bloomSRGBToLinear(vec3 color) {
                        vec3 lower = color / 12.92;
                        vec3 upper = pow(
                            max((color + 0.055) / 1.055, vec3(0.0)),
                            vec3(2.4)
                        );
                        return mix(lower, upper, step(vec3(0.04045), color));
                    }

                    vec3 encodeBloomSignal(vec3 linearColor) {
                        const float inverseLogRange = 0.2446505421;
                        return log2(
                            vec3(1.0) +
                            clamp(linearColor, vec3(0.0), vec3(16.0))
                        ) * inverseLogRange;
                    }

                    void main() {
                        vec4 base = texture2D(map, vMaterialUv);
                        base.rgb *= uBaseColor;
                        base.a *= clamp(uBaseAlpha, 0.0, 1.0);
                        if (uUseBaseColorMap) {
                            base.rgb *= texture2D(
                                uBaseColorMap,
                                vMaterialUv * uBaseColorMapScale
                            ).rgb;
                        }
                        if (base.a < uAlphaCutoff) discard;
                        vec3 baseLinear = bloomSRGBToLinear(
                            clamp(base.rgb, vec3(0.0), vec3(1.0))
                        );

                        if (!uEmit) {
                            gl_FragColor = vec4(
                                0.0,
                                0.0,
                                0.0,
                                clamp(base.a, 0.0, 1.0)
                            );
                            return;
                        }

                        vec3 emission = vec3(0.0);
                        if (uMode == 1) {
                            // Render Mode Emissive is an independent bloom source.
                            emission += baseLinear;
                        } else if (uMode == 2) {
                            emission += baseLinear * base.a;
                        }
                        if (uUseShaderEmission) {
                            emission += (
                                uUseTextureEmission
                                    ? baseLinear
                                    : bloomSRGBToLinear(clamp(
                                        uEmissiveColor,
                                        vec3(0.0),
                                        vec3(1.0)
                                    ))
                            ) * uEmissiveStrength;
                        }
                        if (uUseEmissiveMap) {
                            vec3 mapEmission = bloomSRGBToLinear(texture2D(
                                uEmissiveMap,
                                vMaterialUv * uEmissiveMapScale
                            ).rgb);
                            if (uTintEmissiveMap) {
                                mapEmission *= uEmissiveColor;
                            }
                            emission += mapEmission * uEmissiveStrength;
                        }
                        if (uUseMERMap) {
                            emission += baseLinear * texture2D(
                                uMERMap,
                                vMaterialUv * uMERMapScale
                            ).g * uEmissiveStrength;
                        }

                        float energy = max(emission.r, max(emission.g, emission.b));
                        if (energy <= 0.0005) {
                            /*
                                A material can contain both emissive and ordinary
                                texels (atlas textures and MER maps). Discarding an
                                ordinary texel also discarded its depth, turning a
                                foreground nose/limb into a hole through which an
                                emissive surface behind it leaked into Bloom.

                                Keep the fragment in the depth buffer, but leave
                                its mask coverage transparent. This blocks hidden
                                emitters during the GPU depth test without making
                                the final 2D blocker erase Bloom from every
                                ordinary surface in a close-up render.
                            */
                            gl_FragColor = vec4(0.0);
                            return;
                        }
                        gl_FragColor = vec4(
                            encodeBloomSignal(max(emission, vec3(0.0))),
                            clamp(base.a, 0.0, 1.0)
                        );
                    }
                `,
                depthTest: true,
                depthWrite: true,
                transparent: false,
                blending: THREE.NoBlending,
                side: sourceMaterial.side !== undefined ? sourceMaterial.side : THREE.FrontSide
            });
            material.name = emissive ? 'StudioRender_EmissiveMask' : 'StudioRender_BloomOccluder';
            cache.set(sourceMaterial, material);
            BLOOM_MASK_STATE.derivedResources.add(material);
        }

        const whiteFallback = getBloomFallbackTexture(true);
        const blackFallback = getBloomFallbackTexture(false);
        const fallback = sourceMaterial.map || getMaterialTexture(sourceMaterial, 'map') || whiteFallback;
        material.uniforms.map.value = state.baseMap || fallback;
        material.uniforms.uBaseColorMap.value = state.baseColorMap || whiteFallback;
        material.uniforms.uEmissiveMap.value = state.emissiveMap || blackFallback;
        material.uniforms.uMERMap.value = state.merMap || blackFallback;
        copyColorToVector(material.uniforms.uBaseColor.value, state.baseColor);
        material.uniforms.uBaseAlpha.value = state.baseAlpha;
        material.uniforms.uAutoTile.value = !!state.autoTile;
        copyScaleToVector(material.uniforms.uTiling.value, state.tiling);
        copyScaleToVector(material.uniforms.uTextureSize.value, state.textureSize, 16, 16);
        copyScaleToVector(material.uniforms.uBaseColorMapScale.value, state.baseColorMapScale);
        copyScaleToVector(material.uniforms.uEmissiveMapScale.value, state.emissiveMapScale);
        copyScaleToVector(material.uniforms.uMERMapScale.value, state.merMapScale);
        material.uniforms.uMode.value = state.mode || 0;
        material.uniforms.uUseShaderEmission.value = !!state.useShaderEmission;
        material.uniforms.uUseTextureEmission.value = !!state.useTextureEmission;
        material.uniforms.uUseBaseColorMap.value = !!state.useBaseColorMap;
        material.uniforms.uUseEmissiveMap.value = !!state.useEmissiveMap;
        material.uniforms.uTintEmissiveMap.value = !!state.tintEmissiveMap;
        material.uniforms.uUseMERMap.value = !!state.useMERMap;
        material.uniforms.uEmissiveStrength.value = state.emissiveStrength;
        copyColorToVector(material.uniforms.uEmissiveColor.value, state.emissiveColor);
        material.uniforms.uAlphaCutoff.value = Math.max(0.001, Number(sourceMaterial.alphaTest) || 0.01);
        material.uniforms.uEmit.value = !!emissive;
        material.side = sourceMaterial.side !== undefined ? sourceMaterial.side : THREE.FrontSide;
        return material;
    }

    function buildBloomMaskManifest(scene) {
        const changes = [];
        const visit = object => {
            if (!object || !object.visible || !(object.isMesh || object.isSprite) || !object.material) return;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            if (!materials.some(material => material?.visible !== false)) return;
            changes.push({
                object,
                material: object.material,
                replacement: null
            });
        };
        if (typeof scene.traverseVisible === 'function') scene.traverseVisible(visit);
        else scene.traverse(visit);
        return changes;
    }

    function bloomMaskManifestIsValid(changes) {
        return Array.isArray(changes) && changes.every(change => (
            change?.object && change.object.material === change.material
        ));
    }

    function createBloomMaskMaterialResolver() {
        // Uniforms may animate without material.version changing. Share work
        // within this pass only, so the next frame always reads current values.
        const statesBySource = new Map();
        const replacementsBySource = new Map();
        const getState = source => {
            if (!statesBySource.has(source)) {
                statesBySource.set(source, getMaterialEmissiveState(source));
            }
            return statesBySource.get(source);
        };
        const getReplacement = source => {
            if (replacementsBySource.has(source)) return replacementsBySource.get(source);
            const state = getState(source);
            const replacement = getBloomMaskMaterial(source, state.active, state);
            replacementsBySource.set(source, replacement);
            return replacement;
        };
        return { getState, getReplacement };
    }

    function refreshBloomMaskManifest(changes, resolver = createBloomMaskMaterialResolver()) {
        changes.forEach(change => {
            const sources = Array.isArray(change.material)
                ? change.material
                : [change.material];
            const replacements = sources.map(resolver.getReplacement);
            change.replacement = Array.isArray(change.material)
                ? replacements
                : replacements[0];
        });
    }

    function renderBloomMaskTileFallback(renderPreview, targetContext, tile, sampleFactor, renderSession = null) {
        if (!renderPreview?.renderer || !targetContext || !window.Canvas?.scene) return;

        const scene = Canvas.scene;
        const renderer = renderPreview.renderer;
        const gl = renderer.getContext?.();
        if (gl?.isContextLost?.()) {
            throw new Error('Studio Render WebGL context was lost before the bloom mask pass.');
        }
        let changes = renderSession?.bloomMaskManifest;
        let refreshManifest = false;

        /*
         * The object/material topology is stable for a Studio Render session.
         * Retain it across tiles and only refresh one mask material per unique
         * source material. This avoids traversing the complete scene and
         * resolving the same emissive state for every object on every tile.
         */
        if (!bloomMaskManifestIsValid(changes)) {
            changes = buildBloomMaskManifest(scene);
            refreshManifest = true;
            if (renderSession) renderSession.bloomMaskManifest = changes;
        }
        if (refreshManifest || changes.some(change => !change.replacement)) {
            refreshBloomMaskManifest(changes);
        }

        const previousTarget = renderer.getRenderTarget?.();
        const previousAutoClear = renderer.autoClear;
        const previousShadowAutoUpdate = renderer.shadowMap ? renderer.shadowMap.autoUpdate : undefined;
        const previousClearColor = new THREE.Color();
        const previousClearAlpha = renderer.getClearAlpha?.() ?? 1;
        renderer.getClearColor?.(previousClearColor);

        try {
            changes.forEach(change => {
                change.object.material = change.replacement;
            });
            renderer.autoClear = true;
            if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;
            renderer.setRenderTarget?.(null);
            renderer.setClearColor?.(0x000000, 0);
            renderer.clear?.(true, true, true);
            renderer.render(scene, renderPreview.camera);
            if (window.LightflowAtmosphere && typeof window.LightflowAtmosphere.composite === 'function') {
                window.LightflowAtmosphere.composite(renderPreview, {
                    studio: true,
                    bloomMask: true
                });
            }
            drawTile(targetContext, renderPreview, tile, sampleFactor);
        } finally {
            for (let index = changes.length - 1; index >= 0; index--) {
                changes[index].object.material = changes[index].material;
            }
            renderer.setRenderTarget?.(previousTarget || null);
            renderer.autoClear = previousAutoClear;
            if (renderer.shadowMap && previousShadowAutoUpdate !== undefined) renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
            renderer.setClearColor?.(previousClearColor, previousClearAlpha);
        }
    }

    function getStudioUniformValue(uniform) {
        if (uniform && typeof uniform === 'object' && 'value' in uniform) {
            return uniform.value;
        }
        return uniform;
    }

    function isStudioUniformEnabled(uniform) {
        const value = getStudioUniformValue(uniform);
        return value === true || value === 1 || value === '1' || value === 'true';
    }

    function materialUsesStudioSurfaceDetail(material) {
        const uniforms = material?.uniforms;
        if (!uniforms) return false;

        const reliefEnabled =
            Object.prototype.hasOwnProperty.call(uniforms, 'TEXTURE_RELIEF_ENABLED') &&
            isStudioUniformEnabled(uniforms.TEXTURE_RELIEF_ENABLED);
        const reliefStrength = Number(
            getStudioUniformValue(uniforms.TEXTURE_RELIEF_STRENGTH) || 0
        );
        const reliefWidthUniform = uniforms.TEXTURE_RELIEF_WIDTH;
        const reliefWidth = reliefWidthUniform === undefined
            ? 1
            : Number(getStudioUniformValue(reliefWidthUniform) || 0);
        const rendercraftRelief =
            reliefEnabled && reliefStrength > 0.0001 && reliefWidth > 0.00001;

        const nativePbrUniform = uniforms.uUseNativePBR;
        const nativePbrEnabled = nativePbrUniform === undefined ||
            isStudioUniformEnabled(nativePbrUniform);
        const heightDetail =
            nativePbrEnabled &&
            isStudioUniformEnabled(uniforms.uUseHeightMap) &&
            Math.abs(Number(getStudioUniformValue(uniforms.uHeightScale) || 0)) > 0.0001;
        const normalDetail =
            nativePbrEnabled &&
            isStudioUniformEnabled(uniforms.uUseNormalMap) &&
            Math.abs(Number(getStudioUniformValue(uniforms.uNormalScale) || 0)) > 0.0001;

        return rendercraftRelief || heightDetail || normalDetail;
    }

    function sceneUsesStudioSurfaceDetail() {
        if (typeof window.ShaderArchitectGetStudioRenderCapabilities === 'function') {
            try {
                const capabilities = window.ShaderArchitectGetStudioRenderCapabilities();
                if (
                    capabilities &&
                    typeof capabilities === 'object' &&
                    Object.prototype.hasOwnProperty.call(capabilities, 'requiresDetailResolve')
                ) {
                    return capabilities.requiresDetailResolve === true;
                }
            } catch (error) {
                console.warn('[Studio Render] Shader Architect capability query failed:', error);
            }
        }

        const scene = window.Canvas?.scene;
        if (!scene || typeof scene.traverse !== 'function') return false;
        let found = false;
        scene.traverse(object => {
            if (found || object?.visible === false || !object?.material) return;
            const materials = Array.isArray(object.material)
                ? object.material
                : [object.material];
            found = materials.some(materialUsesStudioSurfaceDetail);
        });
        return found;
    }

    const studioSurfaceDetailResolveScratch = [];

    function getStudioSurfaceDetailResolveScratch(index, width, height) {
        let canvas = studioSurfaceDetailResolveScratch[index];
        if (!canvas) {
            canvas = document.createElement('canvas');
            studioSurfaceDetailResolveScratch[index] = canvas;
        }
        const safeWidth = Math.max(1, Math.ceil(width));
        const safeHeight = Math.max(1, Math.ceil(height));
        if (canvas.width !== safeWidth) canvas.width = safeWidth;
        if (canvas.height !== safeHeight) canvas.height = safeHeight;
        return canvas;
    }

    function releaseStudioSurfaceDetailResolveScratch() {
        studioSurfaceDetailResolveScratch.forEach(canvas => {
            if (!canvas) return;
            /* Resizing releases Chromium's retained backing store. */
            canvas.width = 1;
            canvas.height = 1;
        });
        studioSurfaceDetailResolveScratch.length = 0;
    }

    function resolveStudioSurfaceDetailSource(
        sourceCanvas,
        sourceWidth,
        sourceHeight,
        destinationWidth,
        destinationHeight
    ) {
        /*
         * Chromium's one-step 4x/8x canvas reduction can erase narrow normal
         * lighting bands. Progressively halve the tile until it is at most 2x
         * the output size. This keeps the resolve deterministic, bounds memory
         * to two tile-sized scratch canvases and avoids sampling one arbitrary
         * sub-pixel directly from the original 4x/8x image.
         */
        const detailWidth = Math.max(1, Math.ceil(destinationWidth * 2));
        const detailHeight = Math.max(1, Math.ceil(destinationHeight * 2));
        let currentCanvas = sourceCanvas;
        let currentWidth = Math.max(1, Math.ceil(sourceWidth));
        let currentHeight = Math.max(1, Math.ceil(sourceHeight));
        let scratchIndex = 0;

        while (currentWidth > detailWidth || currentHeight > detailHeight) {
            const nextWidth = Math.max(detailWidth, Math.ceil(currentWidth / 2));
            const nextHeight = Math.max(detailHeight, Math.ceil(currentHeight / 2));
            if (nextWidth === currentWidth && nextHeight === currentHeight) break;

            const nextCanvas = getStudioSurfaceDetailResolveScratch(
                scratchIndex % 2,
                nextWidth,
                nextHeight
            );
            const nextContext = nextCanvas.getContext('2d', { alpha: true });
            nextContext.save();
            nextContext.setTransform(1, 0, 0, 1, 0, 0);
            nextContext.globalCompositeOperation = 'copy';
            nextContext.globalAlpha = 1;
            nextContext.imageSmoothingEnabled = true;
            if ('imageSmoothingQuality' in nextContext) {
                nextContext.imageSmoothingQuality = 'high';
            }
            nextContext.clearRect(0, 0, nextWidth, nextHeight);
            nextContext.drawImage(
                currentCanvas,
                0,
                0,
                currentWidth,
                currentHeight,
                0,
                0,
                nextWidth,
                nextHeight
            );
            nextContext.restore();

            currentCanvas = nextCanvas;
            currentWidth = nextWidth;
            currentHeight = nextHeight;
            scratchIndex++;
        }

        return {
            canvas: currentCanvas,
            width: currentWidth,
            height: currentHeight
        };
    }

    function drawTile(
        ctx,
        renderPreview,
        tile,
        sampleFactor,
        preserveSurfaceDetail = false,
        sourceCanvas = null
    ) {
        const scale = Math.max(1, Number(sampleFactor) || 1);

        const cropLeft = Number(tile.cropX || 0);
        const cropTop = Number(tile.cropY || 0);

        const sourceWidth = Number(
            tile.renderWidth ||
            (tile.sampleWidth + cropLeft + Number(tile.cropRight || 0))
        );

        const sourceHeight = Number(
            tile.renderHeight ||
            (tile.sampleHeight + cropTop + Number(tile.cropBottom || 0))
        );

        const destinationX = tile.outputX - cropLeft / scale;
        const destinationY = tile.outputY - cropTop / scale;
        const destinationWidth = sourceWidth / scale;
        const destinationHeight = sourceHeight / scale;

        ctx.save();

        ctx.beginPath();
        ctx.rect(
            tile.outputX,
            tile.outputY,
            tile.outputWidth,
            tile.outputHeight
        );
        ctx.clip();

        const renderCanvas = sourceCanvas || renderPreview.canvas;
        const resolvedSource = preserveSurfaceDetail && scale > 1
            ? resolveStudioSurfaceDetailSource(
                renderCanvas,
                sourceWidth,
                sourceHeight,
                destinationWidth,
                destinationHeight
            )
            : {
                canvas: renderCanvas,
                width: sourceWidth,
                height: sourceHeight
            };

        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
            resolvedSource.canvas,
            0,
            0,
            resolvedSource.width,
            resolvedSource.height,
            destinationX,
            destinationY,
            destinationWidth,
            destinationHeight
        );

        /*
         * Do not blend a nearest-neighbour copy over the resolved tile. Even a
         * deterministic 2x source still selects one phase of the supersample
         * grid and can produce tile seams, false edge contrast and AA-dependent
         * material changes. Texture Relief now guarantees its own final-pixel
         * coverage in the shader, so progressive high-quality reduction is the
         * only resolve required here.
         */

        ctx.restore();
    }

    async function waitForFrame() {
        await new Promise(resolve => {
            // Electron can suspend animation frames when minimized/occluded.
            // Keep render cancellation and its finally cleanup reachable there.
            let frame = null;
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                clearTimeout(fallback);
                if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
                resolve();
            };
            const fallback = setTimeout(finish, typeof document !== 'undefined' && document.hidden ? 0 : 250);
            if (typeof requestAnimationFrame === 'function') {
                frame = requestAnimationFrame(finish);
            }
        });
    }

    async function recoverPreviewShadowsAfterStudioRender(sourcePreview, renderPreview) {
        const targetPreview = sourcePreview || renderPreview;
        if (!targetPreview) return;

        /*
         * THREE.Light shadow maps are shared by every preview. Restore their
         * normal resolution/state once; forcing both renderers and then forcing
         * the source again caused the visible pause after every photograph.
         * Light Manager already detects whether resolution/quality changed and
         * marks the map dirty only when required.
         */
        if (typeof window.LightManagerPrepareRender === 'function') {
            window.LightManagerPrepareRender(targetPreview, {
                studio: false,
                source: 'studio_render_restore',
                allowStudioRestore: true
            });
        }

        const updateContext = {
            studio: true,
            preview: targetPreview,
            source: 'studio_render_restore'
        };
        if (typeof window.UpdateShaderArchitectLights === 'function') {
            window.UpdateShaderArchitectLights(updateContext);
        } else if (typeof window.updateLights === 'function') {
            window.updateLights(updateContext);
        }

        // Do not render the source preview while Studio still owns the shared
        // GPU/shadow state. restoreStudioRenderFlags() schedules exactly one
        // repaint after every restore step has completed.
    }

    async function encodeCanvasWithWorker(canvas) {
        if (
            typeof Worker === 'undefined' ||
            typeof OffscreenCanvas === 'undefined' ||
            typeof createImageBitmap !== 'function' ||
            typeof URL === 'undefined' ||
            typeof Blob === 'undefined'
        ) return null;

        const workerSource = `
            self.onmessage = async event => {
                const payload = event.data || {};
                try {
                    const canvas = new OffscreenCanvas(payload.width, payload.height);
                    const context = canvas.getContext('2d', { alpha: true });
                    if (!context) throw new Error('Offscreen 2D context is unavailable.');
                    context.drawImage(payload.bitmap, 0, 0);
                    payload.bitmap.close?.();
                    const blob = await canvas.convertToBlob({ type: 'image/png' });
                    self.postMessage({ ok: true, blob });
                } catch (error) {
                    self.postMessage({
                        ok: false,
                        message: error && error.message ? error.message : String(error)
                    });
                }
            };
        `;

        const workerUrl = URL.createObjectURL(new Blob([workerSource], {
            type: 'text/javascript'
        }));
        let worker = null;
        let bitmap = null;

        try {
            bitmap = await createImageBitmap(canvas);
            return await new Promise((resolve, reject) => {
                worker = new Worker(workerUrl);
                const timeout = setTimeout(() => {
                    reject(new Error('Background PNG encoding timed out.'));
                }, 120000);

                worker.onmessage = event => {
                    clearTimeout(timeout);
                    const payload = event.data || {};
                    if (payload.ok && payload.blob) resolve(payload.blob);
                    else reject(new Error(payload.message || 'Background PNG encoding failed.'));
                };
                worker.onerror = event => {
                    clearTimeout(timeout);
                    reject(event.error || new Error(event.message || 'Background PNG worker failed.'));
                };
                worker.postMessage({
                    bitmap,
                    width: canvas.width,
                    height: canvas.height
                }, [bitmap]);
                bitmap = null;
            });
        } finally {
            bitmap?.close?.();
            worker?.terminate?.();
            URL.revokeObjectURL(workerUrl);
        }
    }

    async function canvasToPngBlob(canvas) {
        if (!canvas) throw new Error('Studio Render canvas is unavailable.');

        try {
            const workerBlob = await encodeCanvasWithWorker(canvas);
            if (workerBlob) return workerBlob;
        } catch (error) {
            warnStudioRenderOnce(
                'png-worker-fallback',
                '[Studio Render] Background PNG encoding was unavailable; using the canvas fallback.',
                error
            );
        }

        if (typeof canvas.toBlob === 'function') {
            return new Promise((resolve, reject) => {
                canvas.toBlob(result => {
                    if (result) resolve(result);
                    else reject(new Error('PNG encoding returned an empty image.'));
                }, 'image/png');
            });
        }

        const response = await fetch(canvas.toDataURL('image/png'));
        return response.blob();
    }

    async function blobToDataUrl(blob) {
        if (!blob) return '';
        if (typeof FileReader === 'undefined') {
            return URL.createObjectURL(blob);
        }
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('Could not read the encoded PNG.'));
            reader.readAsDataURL(blob);
        });
    }

    function createTemporaryImageUrl(blob) {
        const url = URL.createObjectURL(blob);
        setTimeout(() => URL.revokeObjectURL(url), 120000);
        return url;
    }

    async function copyImageToClipboard(image) {
        if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') {
            Blockbench.showQuickMessage('message.screenshot.right_click');
            return false;
        }
        const blob = image instanceof Blob
            ? image
            : await (await fetch(image)).blob();
        await navigator.clipboard.write([
            new ClipboardItem({
                [blob.type || 'image/png']: blob
            })
        ]);
        Blockbench.showQuickMessage(translate('studio_render.message.copied', 'Studio render copied to clipboard'));
        return true;
    }

    function studioBloomHasVisibleContribution(settings) {
        if (!settings?.bloom_enabled) return false;
        const strength = clamp(
            toNumber(settings.bloom_strength, DEFAULT_SETTINGS.bloom_strength),
            0,
            3
        );
        const coreStrength = clamp(
            toNumber(settings.bloom_core_strength, DEFAULT_SETTINGS.bloom_core_strength),
            0,
            2
        );
        const haloStrength = clamp(
            toNumber(settings.bloom_halo_strength, DEFAULT_SETTINGS.bloom_halo_strength),
            0,
            2
        );
        const hdrStrength = clamp(
            toNumber(settings.bloom_hdr_strength, DEFAULT_SETTINGS.bloom_hdr_strength),
            0,
            4
        );
        const emissiveStrength = clamp(
            toNumber(settings.bloom_emissive_strength, DEFAULT_SETTINGS.bloom_emissive_strength),
            0,
            8
        );
        return strength > 0 &&
            (coreStrength > 0 || haloStrength > 0) &&
            (hdrStrength > 0 || emissiveStrength > 0);
    }

    const CPU_FALLBACK_BLOOM_DIVISORS = Object.freeze([2, 4, 8]);

    function createCPUFallbackBloomPyramidPlan(width, height, settings, radiusScale = 1) {
        const safeWidth = Math.max(1, Math.round(width || 1));
        const safeHeight = Math.max(1, Math.round(height || 1));
        const strength = clamp(toNumber(settings.bloom_strength, DEFAULT_SETTINGS.bloom_strength), 0, 3);
        const coreStrength = clamp(toNumber(settings.bloom_core_strength, DEFAULT_SETTINGS.bloom_core_strength), 0, 2);
        const haloStrength = clamp(toNumber(settings.bloom_halo_strength, DEFAULT_SETTINGS.bloom_halo_strength), 0, 2);
        const coreRadius = clamp(
            toNumber(settings.bloom_core_radius, DEFAULT_SETTINGS.bloom_core_radius),
            0.25,
            12
        ) * radiusScale;
        const haloRadius = clamp(
            toNumber(settings.bloom_radius, DEFAULT_SETTINGS.bloom_radius),
            1,
            128
        ) * radiusScale;
        const weights = [coreStrength, haloStrength * 0.62, haloStrength * 0.38];
        return Object.freeze(CPU_FALLBACK_BLOOM_DIVISORS.map((divisor, index) => Object.freeze({
            index,
            divisor,
            width: Math.max(2, Math.round(safeWidth / divisor)),
            height: Math.max(2, Math.round(safeHeight / divisor)),
            sourceRadius: index === 0 ? coreRadius : haloRadius,
            weight: weights[index] * strength
        })));
    }

    function applyFinalBloomCPUFallback(canvas, settings, sourceMaskCanvas, options = {}) {
        if (!canvas || !studioBloomHasVisibleContribution(settings)) return canvas;

        const sourceMask = sourceMaskCanvas || canvas;
        const maxMaskDimension = Math.max(64, Number(options.maxDimension) || 4096);
        const sourceScale = Math.min(
            1,
            maxMaskDimension / Math.max(canvas.width || 1, canvas.height || 1)
        );
        const width = Math.max(1, Math.round(Number(options.processingWidth) || canvas.width * sourceScale));
        const height = Math.max(1, Math.round(Number(options.processingHeight) || canvas.height * sourceScale));
        const radiusScale = Math.min(width / Math.max(canvas.width || 1, 1), height / Math.max(canvas.height || 1, 1));
        const threshold = clamp(toNumber(settings.bloom_threshold, DEFAULT_SETTINGS.bloom_threshold), 0, 4);
        const softKnee = clamp(toNumber(settings.bloom_soft_knee, DEFAULT_SETTINGS.bloom_soft_knee), 0, 1);
        const hdrStrength = clamp(toNumber(settings.bloom_hdr_strength, DEFAULT_SETTINGS.bloom_hdr_strength), 0, 4);
        const emissiveStrength = clamp(toNumber(settings.bloom_emissive_strength, DEFAULT_SETTINGS.bloom_emissive_strength), 0, 8);
        const useOcclusion = settings.bloom_occlusion !== false;
        const includeSceneSignal = options.emissiveOnly !== true;
        const workspace = options.workspace || null;
        const getSizedWorkingCanvas = (key, targetWidth, targetHeight) => {
            let target = workspace?.[key];
            if (!target) {
                target = document.createElement('canvas');
                if (workspace) workspace[key] = target;
            }
            if (target.width !== targetWidth) target.width = targetWidth;
            if (target.height !== targetHeight) target.height = targetHeight;
            return target;
        };
        const getWorkingCanvas = key => getSizedWorkingCanvas(key, width, height);

        const mask = getWorkingCanvas('processingMask');
        const maskContext = mask.getContext('2d', { willReadFrequently: true });
        maskContext.clearRect(0, 0, width, height);
        maskContext.drawImage(sourceMask, 0, 0, width, height);

        let sceneImage = null;
        if (includeSceneSignal) {
            const sceneSample = getWorkingCanvas('sceneSample');
            const sceneContext = sceneSample.getContext('2d', { willReadFrequently: true });
            sceneContext.clearRect(0, 0, width, height);
            sceneContext.drawImage(canvas, 0, 0, width, height);
            sceneImage = sceneContext.getImageData(0, 0, width, height);
        }

        const blocker = getWorkingCanvas('blocker');
        const blockerContext = blocker.getContext('2d', { willReadFrequently: true });

        const maskImage = maskContext.getImageData(0, 0, width, height);
        const blockerImage = blockerContext.createImageData(width, height);
        const pixels = maskImage.data;
        const scenePixels = sceneImage?.data || null;
        const blockerPixels = blockerImage.data;
        const bloomLogRange = 4.0874628413;
        const decodeBloomChannel = value => Math.max(
            0,
            Math.pow(2, clamp(value, 0, 1) * bloomLogRange) - 1
        );
        const sRGBToLinearChannel = value => value <= 0.04045
            ? value / 12.92
            : Math.pow((value + 0.055) / 1.055, 2.4);
        const bloomContribution = signal => {
            if (signal <= 0.000001) return 0;
            if (softKnee <= 0.000001 || threshold <= 0.000001) {
                return clamp((signal - threshold) / signal, 0, 1);
            }
            const knee = Math.max(threshold * softKnee, 0.00001);
            let soft = clamp(signal - threshold + knee, 0, 2 * knee);
            soft = soft * soft / Math.max(4 * knee, 0.00001);
            return clamp(Math.max(signal - threshold, soft) / signal, 0, 1);
        };

        for (let index = 0; index < pixels.length; index += 4) {
            const geometryAlpha = pixels[index + 3] / 255;
            const emissionR = decodeBloomChannel(pixels[index] / 255) * emissiveStrength;
            const emissionG = decodeBloomChannel(pixels[index + 1] / 255) * emissiveStrength;
            const emissionB = decodeBloomChannel(pixels[index + 2] / 255) * emissiveStrength;
            const sceneR = scenePixels
                ? sRGBToLinearChannel(scenePixels[index] / 255) * hdrStrength
                : 0;
            const sceneG = scenePixels
                ? sRGBToLinearChannel(scenePixels[index + 1] / 255) * hdrStrength
                : 0;
            const sceneB = scenePixels
                ? sRGBToLinearChannel(scenePixels[index + 2] / 255) * hdrStrength
                : 0;

            const hdrSignal = geometryAlpha > 0.001
                ? Math.max(sceneR, sceneG, sceneB)
                : 0;
            const emissiveSignal = Math.max(emissionR, emissionG, emissionB);
            const emissiveContribution = emissiveSignal > 0.000001 ? 1 : 0;
            const hdrContribution = bloomContribution(hdrSignal);
            const contribution = Math.max(emissiveContribution, hdrContribution);

            const combinedR = Math.max(
                sceneR * hdrContribution,
                emissionR * emissiveContribution
            );
            const combinedG = Math.max(
                sceneG * hdrContribution,
                emissionG * emissiveContribution
            );
            const combinedB = Math.max(
                sceneB * hdrContribution,
                emissionB * emissiveContribution
            );
            const combinedPeak = Math.max(combinedR, combinedG, combinedB, 0.0001);
            const mappedPeak = clamp(
                Math.log2(1 + combinedPeak) / bloomLogRange,
                0,
                1
            );
            const bloomScale = mappedPeak / combinedPeak;
            pixels[index] = Math.round(255 * clamp(combinedR * bloomScale, 0, 1));
            pixels[index + 1] = Math.round(255 * clamp(combinedG * bloomScale, 0, 1));
            pixels[index + 2] = Math.round(255 * clamp(combinedB * bloomScale, 0, 1));
            pixels[index + 3] = Math.round(255 * contribution * geometryAlpha);

            const blockerAlpha = useOcclusion && geometryAlpha > 0.001
                ? geometryAlpha * (1 - contribution)
                : 0;
            blockerPixels[index] = 0;
            blockerPixels[index + 1] = 0;
            blockerPixels[index + 2] = 0;
            blockerPixels[index + 3] = Math.round(255 * clamp(blockerAlpha, 0, 1));
        }
        maskContext.putImageData(maskImage, 0, 0);
        blockerContext.putImageData(blockerImage, 0, 0);

        const bloomLayer = getWorkingCanvas('bloomLayer');
        const bloomContext = bloomLayer.getContext('2d');
        bloomContext.clearRect(0, 0, width, height);
        bloomContext.globalCompositeOperation = 'lighter';
        bloomContext.filter = 'none';

        const pyramidPlan = createCPUFallbackBloomPyramidPlan(width, height, settings, radiusScale);
        let pyramidInput = mask;
        pyramidPlan.forEach(level => {
            const levelCanvas = getSizedWorkingCanvas(
                `bloomPyramid${level.index}`,
                level.width,
                level.height
            );
            const levelContext = levelCanvas.getContext('2d');
            levelContext.clearRect(0, 0, level.width, level.height);
            levelContext.globalCompositeOperation = 'copy';
            levelContext.globalAlpha = 1;
            levelContext.filter = `blur(${Math.max(0.5, level.sourceRadius / level.divisor)}px)`;
            levelContext.drawImage(pyramidInput, 0, 0, level.width, level.height);
            levelContext.filter = 'none';
            pyramidInput = levelCanvas;

            if (level.weight <= 0.000001) return;
            bloomContext.globalAlpha = clamp(level.weight, 0, 1);
            bloomContext.drawImage(levelCanvas, 0, 0, width, height);
        });

        if (useOcclusion) {
            bloomContext.globalCompositeOperation = 'destination-out';
            bloomContext.globalAlpha = 1;
            bloomContext.filter = 'none';
            bloomContext.drawImage(blocker, 0, 0, width, height);
        }

        const output = canvas.getContext('2d');
        output.save();
        output.globalCompositeOperation = 'lighter';
        output.globalAlpha = 1;
        output.filter = 'none';
        output.drawImage(bloomLayer, 0, 0, canvas.width, canvas.height);
        output.restore();
        return canvas;
    }

    function applyFinalColorGrade(canvas, settings) {
        if (!canvas || !settings?.color_grading_enabled) return canvas;
        const width = canvas.width || 1;
        const height = canvas.height || 1;
        const source = document.createElement('canvas');
        source.width = width;
        source.height = height;
        source.getContext('2d').drawImage(canvas, 0, 0);

        const context = canvas.getContext('2d');
        context.save();
        context.clearRect(0, 0, width, height);
        context.filter = [
            'brightness(' + clamp(toNumber(settings.exposure, 1), 0.1, 4) + ')',
            'contrast(' + clamp(toNumber(settings.contrast, 1), 0, 3) + ')',
            'saturate(' + clamp(toNumber(settings.saturation, 1), 0, 3) + ')'
        ].join(' ');
        context.drawImage(source, 0, 0);
        context.filter = 'none';

        const temperature = clamp(toNumber(settings.temperature, 0), -1, 1);
        const tint = clamp(toNumber(settings.tint, 0), -1, 1);
        if (Math.abs(temperature) > 0.001 || Math.abs(tint) > 0.001) {
            context.globalCompositeOperation = 'soft-light';
            context.globalAlpha = Math.min(0.42, (Math.abs(temperature) + Math.abs(tint)) * 0.24);
            const red = clamp(128 + temperature * 127 + tint * 26, 0, 255);
            const green = clamp(128 - Math.abs(tint) * 92, 0, 255);
            const blue = clamp(128 - temperature * 127 + tint * 26, 0, 255);
            context.fillStyle = 'rgb(' + Math.round(red) + ', ' + Math.round(green) + ', ' + Math.round(blue) + ')';
            context.fillRect(0, 0, width, height);
        }

        const vignette = clamp(toNumber(settings.vignette, 0), 0, 1);
        if (vignette > 0.001) {
            const gradient = context.createRadialGradient(
                width * 0.5, height * 0.5, Math.min(width, height) * 0.18,
                width * 0.5, height * 0.5, Math.max(width, height) * 0.72
            );
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
            gradient.addColorStop(0.62, 'rgba(0, 0, 0, 0)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, ' + (vignette * 0.82) + ')');
            context.globalCompositeOperation = 'source-over';
            context.globalAlpha = 1;
            context.fillStyle = gradient;
            context.fillRect(0, 0, width, height);
        }
        context.restore();
        return canvas;
    }

    function configureViewportPostTarget(target, width, height) {
        if (!target) return;
        if (target.width !== width || target.height !== height) target.setSize(width, height);
        target.viewport?.set?.(0, 0, width, height);
        target.scissor?.set?.(0, 0, width, height);
        target.scissorTest = false;
    }

    function supportsViewportHalfFloat(renderer) {
        if (!renderer || THREE.HalfFloatType === undefined) return false;
        const centralCapabilities = window.LightflowRenderer?.getCapabilities?.(renderer, {
            probeHalfFloat: true
        });
        if (centralCapabilities && typeof centralCapabilities.halfFloatRenderable === 'boolean') {
            return centralCapabilities.halfFloatRenderable;
        }
        const extensions = renderer.extensions;
        const hasExtension = name => !!(
            extensions?.has?.(name) ||
            extensions?.get?.(name)
        );
        if (renderer.capabilities?.isWebGL2) {
            return hasExtension('EXT_color_buffer_float') ||
                hasExtension('EXT_color_buffer_half_float');
        }
        return hasExtension('OES_texture_half_float') &&
            hasExtension('EXT_color_buffer_half_float');
    }

    function probeStudioHalfFloatFramebuffer(renderer) {
        if (!renderer || THREE.HalfFloatType === undefined || !THREE.WebGLRenderTarget) {
            return false;
        }
        if (STUDIO_HDR_CAPABILITIES.has(renderer)) {
            return STUDIO_HDR_CAPABILITIES.get(renderer);
        }
        const centralCapabilities = window.LightflowRenderer?.getCapabilities?.(renderer, {
            probeHalfFloat: true
        });
        if (centralCapabilities && typeof centralCapabilities.halfFloatRenderable === 'boolean') {
            STUDIO_HDR_CAPABILITIES.set(renderer, centralCapabilities.halfFloatRenderable);
            return centralCapabilities.halfFloatRenderable;
        }
        if (!supportsViewportHalfFloat(renderer)) {
            STUDIO_HDR_CAPABILITIES.set(renderer, false);
            return false;
        }

        let target = null;
        let supported = false;
        const snapshot = snapshotViewportRendererState(renderer);
        try {
            target = new THREE.WebGLRenderTarget(2, 2, {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.RGBAFormat,
                type: THREE.HalfFloatType,
                depthBuffer: false,
                stencilBuffer: false
            });
            target.texture.generateMipmaps = false;
            if (THREE.LinearEncoding !== undefined) target.texture.encoding = THREE.LinearEncoding;
            renderer.setRenderTarget(target);
            renderer.clear(true, false, false);
            const gl = renderer.getContext?.();
            supported = !!(
                gl &&
                gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
            );
        } catch (error) {
            supported = false;
        } finally {
            restoreViewportRendererState(renderer, snapshot);
            target?.dispose?.();
        }
        STUDIO_HDR_CAPABILITIES.set(renderer, supported);
        return supported;
    }

    const STUDIO_SRGB_TO_LINEAR_LUT = (() => {
        const lut = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
            const value = i / 255;
            lut[i] = value <= 0.04045
                ? value / 12.92
                : Math.pow((value + 0.055) / 1.055, 2.4);
        }
        return lut;
    })();

    function studioLinearToSRGB(value) {
        const v = Math.max(0, Math.min(1, Number(value) || 0));
        return v <= 0.0031308
            ? v * 12.92
            : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    }

    function studioDither01(x, y, seed) {
        // Deterministic integer hash: stable across tiles/runs, no Math.sin cost.
        let h = ((x + 1) * 0x1f123bb5) ^ ((y + 1) * 0x05491333) ^ ((seed | 0) * 0x27d4eb2d);
        h ^= h >>> 15;
        h = Math.imul(h, 0x85ebca6b);
        h ^= h >>> 13;
        return ((h >>> 24) & 255) / 255;
    }

    function createStudioCpuLinearAccumulator(width, height) {
        const scratchCanvas = createCanvas(width, height);
        const scratchContext = scratchCanvas?.getContext('2d', {
            alpha: true,
            willReadFrequently: true
        }) || null;
        const outputCanvas = createCanvas(width, height);
        const outputContext = outputCanvas?.getContext('2d', {
            alpha: true,
            willReadFrequently: true
        }) || null;
        if (!scratchContext || !outputContext) return null;

        let average = new Float32Array(width * height * 4);
        let disposed = false;
        activeStudioAccumulatorBytes = average.byteLength + width * height * 8;
        lastStudioAccumulationMode = 'cpu_linear_float32';

        return {
            canvas: outputCanvas,
            async accumulate(sampleIndex, sourceCanvas) {
                if (disposed || !sourceCanvas) return false;
                scratchContext.setTransform(1, 0, 0, 1, 0, 0);
                scratchContext.globalCompositeOperation = 'copy';
                scratchContext.globalAlpha = 1;
                scratchContext.drawImage(sourceCanvas, 0, 0, width, height);
                const pixels = scratchContext.getImageData(0, 0, width, height).data;
                const weight = 1 / Math.max(1, sampleIndex + 1);
                const lut = STUDIO_SRGB_TO_LINEAR_LUT;
                const length = pixels.length;
                for (let i = 0; i < length; i += 4) {
                    average[i] += (lut[pixels[i]] - average[i]) * weight;
                    average[i + 1] += (lut[pixels[i + 1]] - average[i + 1]) * weight;
                    average[i + 2] += (lut[pixels[i + 2]] - average[i + 2]) * weight;
                    const alpha = pixels[i + 3] / 255;
                    average[i + 3] += (alpha - average[i + 3]) * weight;
                }
                // Give Chromium a delivery point for context-loss/input events
                // between supersamples instead of monopolizing one JS turn.
                await waitForFrame();
                return true;
            },
            resolveToCanvas(seed = 0) {
                if (disposed) return outputCanvas;
                const image = outputContext.createImageData(width, height);
                const out = image.data;
                let pixelIndex = 0;
                for (let i = 0; i < out.length; i += 4, pixelIndex++) {
                    const x = pixelIndex % width;
                    const y = Math.floor(pixelIndex / width);
                    const dither = (studioDither01(x, y, seed) - 0.5) / 255;
                    out[i] = Math.max(0, Math.min(255, Math.round((studioLinearToSRGB(average[i]) + dither) * 255)));
                    out[i + 1] = Math.max(0, Math.min(255, Math.round((studioLinearToSRGB(average[i + 1]) + dither) * 255)));
                    out[i + 2] = Math.max(0, Math.min(255, Math.round((studioLinearToSRGB(average[i + 2]) + dither) * 255)));
                    out[i + 3] = Math.max(0, Math.min(255, Math.round(average[i + 3] * 255)));
                }
                outputContext.putImageData(image, 0, 0);
                return outputCanvas;
            },
            dispose() {
                if (disposed) return;
                disposed = true;
                average = new Float32Array(0);
                scratchCanvas.width = scratchCanvas.height = 1;
                outputCanvas.width = outputCanvas.height = 1;
                activeStudioAccumulatorBytes = 0;
            }
        };
    }

    function getStudioWebGLErrorName(gl, error) {
        if (!gl) return String(error);
        const names = [
            'INVALID_ENUM', 'INVALID_VALUE', 'INVALID_OPERATION',
            'INVALID_FRAMEBUFFER_OPERATION', 'OUT_OF_MEMORY', 'CONTEXT_LOST_WEBGL'
        ];
        return names.find(name => gl[name] === error) || `0x${Number(error).toString(16)}`;
    }

    function drainStudioWebGLErrors(renderer) {
        const central = window.LightflowRenderer?.drainErrors?.(renderer);
        if (Array.isArray(central)) return central;
        const gl = getRendererContext(renderer);
        if (!gl?.getError) return [];
        const errors = [];
        for (let index = 0; index < 16; index++) {
            const error = gl.getError();
            if (error === gl.NO_ERROR) break;
            errors.push(error);
        }
        return errors;
    }

    function beginStudioWebGLErrorScope(renderer) {
        drainStudioWebGLErrors(renderer);
    }

    function assertStudioWebGLHealthy(renderer, stage, session = null) {
        const gl = getRendererContext(renderer);
        if (!gl || gl.isContextLost?.()) {
            throw new Error(`Studio Render lost its WebGL context during ${stage}.`);
        }
        const errors = drainStudioWebGLErrors(renderer);
        if (!errors.length) return true;
        const names = errors.map(error => getStudioWebGLErrorName(gl, error));
        if (session) {
            session.webglErrorCount = (session.webglErrorCount || 0) + errors.length;
            session.lastWebGLErrorStage = stage;
            session.lastWebGLErrors = names.slice();
        }
        throw new Error(`Studio Render WebGL error during ${stage}: ${names.join(', ')}`);
    }

    async function waitForStudioGpuFence(renderer, session = null, maxFrames = 180) {
        const fenceStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const finishFenceTelemetry = outcome => {
            if (!session) return;
            const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const durationMs = Math.max(0, finishedAt - fenceStartedAt);
            session.gpuFenceCount = (session.gpuFenceCount || 0) + 1;
            session.maxGpuFenceMs = Math.max(Number(session.maxGpuFenceMs) || 0, durationMs);
            session.lastGpuFenceOutcome = outcome || 'unknown';
            if (outcome === 'failed') session.gpuFenceFailures = (session.gpuFenceFailures || 0) + 1;
            if (outcome === 'timeout') session.gpuFenceTimeouts = (session.gpuFenceTimeouts || 0) + 1;
            if (window.LightflowStudioRenderDiagnostics) {
                window.LightflowStudioRenderDiagnostics.gpuFenceCount = session.gpuFenceCount;
                window.LightflowStudioRenderDiagnostics.maxGpuFenceMs = session.maxGpuFenceMs;
                window.LightflowStudioRenderDiagnostics.lastGpuFenceOutcome = session.lastGpuFenceOutcome;
                window.LightflowStudioRenderDiagnostics.gpuFenceFailures = session.gpuFenceFailures || 0;
                window.LightflowStudioRenderDiagnostics.gpuFenceTimeouts = session.gpuFenceTimeouts || 0;
            }
        };
        const gl = getRendererContext(renderer);
        if (!gl || gl.isContextLost?.()) {
            throw new Error('Studio Render WebGL context was lost while waiting for the GPU.');
        }
        if (typeof gl.fenceSync !== 'function' || typeof gl.clientWaitSync !== 'function') {
            await waitForFrame();
            finishFenceTelemetry('frame_fallback');
            return true;
        }
        let sync = null;
        try {
            sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
            gl.flush();
            for (let frame = 0; frame < maxFrames; frame++) {
                if (session?.cancelled) return false;
                if (gl.isContextLost?.()) {
                    throw new Error('Studio Render WebGL context was lost while the GPU was finishing a tile.');
                }
                const status = gl.clientWaitSync(sync, 0, 0);
                if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
                    finishFenceTelemetry('signaled');
                    return true;
                }
                if (status === gl.WAIT_FAILED) {
                    finishFenceTelemetry('failed');
                    return false;
                }
                await waitForFrame();
            }
            finishFenceTelemetry('timeout');
            return false;
        } finally {
            if (sync && !gl.isContextLost?.()) {
                try { gl.deleteSync(sync); } catch (error) {}
            }
        }
    }

    async function requireStudioGpuFence(renderer, session = null, maxFrames = 180) {
        const completed = await waitForStudioGpuFence(renderer, session, maxFrames);
        if (!completed && !session?.cancelled) {
            throw new Error('Studio Render GPU fence failed or timed out; refusing to read or reuse incomplete GPU work.');
        }
        return completed;
    }

    function shouldUseStudioGpuAccumulator(renderer, sampleCount = 1) {
        if (Math.max(1, Number(sampleCount) || 1) <= 1) return false;
        if (!renderer?.capabilities?.isWebGL2) return false;
        // Capability-driven only. Vendor/renderer strings are diagnostics, not
        // correctness or feature gates.
        return probeStudioHalfFloatFramebuffer(renderer);
    }

    function createStudioGpuAccumulator(renderer, width, height, linearHDR, sampleCount = 1) {
        if (!probeStudioHalfFloatFramebuffer(renderer)) return null;
        const targetOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            depthBuffer: false,
            stencilBuffer: false
        };
        const averageTarget = new THREE.WebGLRenderTarget(width, height, targetOptions);
        averageTarget.texture.name = 'StudioRender_AverageAdditive';
        averageTarget.texture.generateMipmaps = false;
        if (THREE.LinearEncoding !== undefined) averageTarget.texture.encoding = THREE.LinearEncoding;
        configureViewportPostTarget(averageTarget, width, height);

        const geometry = new (THREE.PlaneGeometry || THREE.PlaneBufferGeometry)(2, 2);
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const scene = new THREE.Scene();
        const accumulationMaterial = new THREE.ShaderMaterial({
            depthTest: false,
            depthWrite: false,
            transparent: true,
            toneMapped: false,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneFactor,
            blendEquationAlpha: THREE.AddEquation,
            blendSrcAlpha: THREE.OneFactor,
            blendDstAlpha: THREE.OneFactor,
            uniforms: {
                tSample: { value: null },
                uWeight: { value: 1 / Math.max(1, Number(sampleCount) || 1) },
                uDecodeSRGB: { value: linearHDR ? 0 : 1 }
            },
            vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
            fragmentShader: `
                precision highp float;
                varying vec2 vUv;
                uniform sampler2D tSample;
                uniform float uWeight;
                uniform float uDecodeSRGB;
                vec3 srgbToLinear(vec3 value) {
                    vec3 lower = value / 12.92;
                    vec3 upper = pow(max((value + 0.055) / 1.055, vec3(0.0)), vec3(2.4));
                    return mix(lower, upper, step(vec3(0.04045), value));
                }
                void main() {
                    vec4 sampleValue = texture2D(tSample, vUv);
                    if (uDecodeSRGB > 0.5) sampleValue.rgb = srgbToLinear(sampleValue.rgb);
                    gl_FragColor = sampleValue * uWeight;
                }
            `
        });
        const resolveMaterial = new THREE.ShaderMaterial({
            depthTest: false,
            depthWrite: false,
            transparent: false,
            toneMapped: false,
            uniforms: {
                tAverage: { value: averageTarget.texture },
                uApplyToneMap: { value: linearHDR ? 1 : 0 },
                uResolution: { value: new THREE.Vector2(width, height) },
                uDitherSeed: { value: 0 }
            },
            vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
            fragmentShader: `
                precision highp float;
                varying vec2 vUv;
                uniform sampler2D tAverage;
                uniform float uApplyToneMap;
                uniform vec2 uResolution;
                uniform float uDitherSeed;
                vec3 neutralToneMap(vec3 color) {
                    color = max(color, vec3(0.0));
                    float startCompression = 0.76;
                    float desaturation = 0.15;
                    float darkest = min(color.r, min(color.g, color.b));
                    float offset = darkest < 0.08
                        ? darkest - 6.25 * darkest * darkest
                        : 0.04;
                    color -= vec3(offset);
                    float peak = max(color.r, max(color.g, color.b));
                    if (peak < startCompression) return max(color, vec3(0.0));
                    float distanceToWhite = 1.0 - startCompression;
                    float compressedPeak = 1.0 - distanceToWhite * distanceToWhite /
                        max(peak + distanceToWhite - startCompression, 0.0001);
                    color *= compressedPeak / max(peak, 0.0001);
                    float amount = 1.0 - 1.0 /
                        (desaturation * max(peak - compressedPeak, 0.0) + 1.0);
                    return mix(color, vec3(compressedPeak), amount);
                }
                vec3 linearToSRGB(vec3 value) {
                    value = max(value, vec3(0.0));
                    vec3 lower = value * 12.92;
                    vec3 upper = 1.055 * pow(value, vec3(1.0 / 2.4)) - 0.055;
                    return mix(lower, upper, step(vec3(0.0031308), value));
                }
                float noise(vec2 pixel) {
                    return fract(sin(dot(pixel + uDitherSeed, vec2(12.9898, 78.233))) * 43758.5453);
                }
                void main() {
                    vec4 averageValue = texture2D(tAverage, vUv);
                    vec3 linearColor = uApplyToneMap > 0.5
                        ? neutralToneMap(averageValue.rgb)
                        : max(averageValue.rgb, vec3(0.0));
                    vec3 outputColor = linearToSRGB(linearColor);
                    float dither = (noise(gl_FragCoord.xy) - 0.5) / 255.0;
                    gl_FragColor = vec4(clamp(outputColor + dither, 0.0, 1.0), averageValue.a);
                }
            `
        });
        const quad = new THREE.Mesh(geometry, accumulationMaterial);
        quad.frustumCulled = false;
        scene.add(quad);
        let disposed = false;
        let cleared = false;
        // One RGBA16F additive target plus the RGBA8 canvas upload. Compared
        // with the old ping-pong average this halves half-float residency and
        // removes the previous-average texture fetch from every sample.
        activeStudioAccumulatorBytes = width * height * (8 + 4);
        lastStudioAccumulationMode = linearHDR ? 'gpu_additive_linear_hdr' : 'gpu_additive_linear_sdr';

        const renderFullscreen = material => {
            quad.material = material;
            renderer.render(scene, camera);
        };
        const primePrograms = () => {
            // Framebuffer dimensions do not make GLSL translation/link cheaper.
            // Compile with the exact target/output contexts and a 1x1 viewport so
            // helper programs are discovered before a full-tile draw without doing
            // meaningful raster work. Rendercraft itself is precompiled separately.
            const snapshot = snapshotViewportRendererState(renderer);
            try {
                renderer.setRenderTarget(averageTarget);
                renderer.setViewport(0, 0, 1, 1);
                renderer.setScissorTest(false);
                quad.material = accumulationMaterial;
                renderer.compile(scene, camera);

                renderer.setRenderTarget(null);
                renderer.setViewport(0, 0, 1, 1);
                renderer.setScissorTest(false);
                quad.material = resolveMaterial;
                renderer.compile(scene, camera);
            } finally {
                quad.material = accumulationMaterial;
                restoreViewportRendererState(renderer, snapshot);
            }
            return true;
        };
        return {
            linearHDR,
            primePrograms,
            accumulate(sampleIndex, sampleTexture) {
                if (!sampleTexture?.isTexture) return false;
                const snapshot = snapshotViewportRendererState(renderer);
                try {
                    accumulationMaterial.uniforms.tSample.value = sampleTexture;
                    renderer.autoClear = false;
                    renderer.setRenderTarget(averageTarget);
                    renderer.setViewport(0, 0, width, height);
                    renderer.setScissorTest(false);
                    if (!cleared || sampleIndex === 0) {
                        const oldColor = new THREE.Color();
                        renderer.getClearColor?.(oldColor);
                        const oldAlpha = renderer.getClearAlpha?.() ?? 1;
                        renderer.setClearColor?.(0x000000, 0);
                        renderer.clear(true, false, false);
                        renderer.setClearColor?.(oldColor, oldAlpha);
                        cleared = true;
                    }
                    renderFullscreen(accumulationMaterial);
                } finally {
                    restoreViewportRendererState(renderer, snapshot);
                }
                return true;
            },
            resolveToCanvas(seed = 0) {
                resolveMaterial.uniforms.tAverage.value = averageTarget.texture;
                resolveMaterial.uniforms.uDitherSeed.value = Number(seed) || 0;
                renderer.autoClear = true;
                renderer.setRenderTarget(null);
                renderer.setViewport(0, 0, width, height);
                renderer.setScissorTest(false);
                renderer.clear(true, true, true);
                renderFullscreen(resolveMaterial);
            },
            dispose() {
                if (disposed) return;
                disposed = true;
                averageTarget.dispose?.();
                accumulationMaterial.dispose?.();
                resolveMaterial.dispose?.();
                geometry.dispose?.();
                activeStudioAccumulatorBytes = 0;
            }
        };
    }

    function createViewportPostTarget(
        width,
        height,
        name,
        depthBuffer = false,
        hdr = false,
        renderer = null
    ) {
        const useHalfFloat = hdr && supportsViewportHalfFloat(renderer);
        const target = new THREE.WebGLRenderTarget(width, height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: useHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
            depthBuffer,
            stencilBuffer: false
        });
        target.texture.name = name;
        target.texture.userData = target.texture.userData || {};
        target.texture.userData.studioRenderHDR = useHalfFloat;
        target.texture.generateMipmaps = false;
        configureViewportPostTarget(target, width, height);
        return target;
    }

    function restoreViewportRendererState(renderer, snapshot) {
        if (!renderer || !snapshot) return;
        if (snapshot.target) {
            if (snapshot.targetViewport && snapshot.target.viewport) snapshot.target.viewport.copy(snapshot.targetViewport);
            if (snapshot.targetScissor && snapshot.target.scissor) snapshot.target.scissor.copy(snapshot.targetScissor);
            snapshot.target.scissorTest = snapshot.targetScissorTest;
            renderer.setRenderTarget?.(snapshot.target);
        } else {
            renderer.setRenderTarget?.(null);
            if (snapshot.viewport) renderer.setViewport?.(snapshot.viewport);
            if (snapshot.scissor) renderer.setScissor?.(snapshot.scissor);
            renderer.setScissorTest?.(snapshot.scissorTest);
        }
        renderer.autoClear = snapshot.autoClear;
        renderer.setClearColor?.(snapshot.clearColor, snapshot.clearAlpha);
        if (renderer.shadowMap && snapshot.shadowAutoUpdate !== undefined) {
            renderer.shadowMap.autoUpdate = snapshot.shadowAutoUpdate;
        }
    }

    function snapshotViewportRendererState(renderer) {
        const target = renderer.getRenderTarget?.() || null;
        const clearColor = new THREE.Color();
        renderer.getClearColor?.(clearColor);
        return {
            target,
            targetViewport: target?.viewport?.clone?.() || null,
            targetScissor: target?.scissor?.clone?.() || null,
            targetScissorTest: target?.scissorTest ?? false,
            viewport: renderer.getViewport?.(new THREE.Vector4()) || null,
            currentViewport: renderer.getCurrentViewport?.(new THREE.Vector4()) || null,
            scissor: renderer.getScissor?.(new THREE.Vector4()) || null,
            scissorTest: renderer.getScissorTest?.() ?? false,
            autoClear: renderer.autoClear,
            clearColor,
            clearAlpha: renderer.getClearAlpha?.() ?? 1,
            shadowAutoUpdate: renderer.shadowMap?.autoUpdate
        };
    }

    function createBloomLevelPlan(width, height, settings, profile) {
        const levels = [{ width: Math.max(1, width), height: Math.max(1, height), index: 0 }];
        const haloRadius = clamp(toNumber(settings.bloom_radius, DEFAULT_SETTINGS.bloom_radius), 1, 128);
        const desiredLevels = clamp(
            2 + Math.ceil(Math.log2(1 + haloRadius / 4)),
            2,
            Math.max(2, Number(profile.maxLevels) || 5)
        );
        while (levels.length < desiredLevels) {
            const previous = levels[levels.length - 1];
            const nextWidth = Math.max(1, Math.round(previous.width / 2));
            const nextHeight = Math.max(1, Math.round(previous.height / 2));
            if (
                levels.length >= 2 &&
                Math.min(nextWidth, nextHeight) < Math.max(4, Number(profile.minMipSize) || 8)
            ) break;
            levels.push({ width: nextWidth, height: nextHeight, index: levels.length });
            if (nextWidth <= 2 || nextHeight <= 2) break;
        }

        const strength = clamp(toNumber(settings.bloom_strength, DEFAULT_SETTINGS.bloom_strength), 0, 3);
        const coreStrength = clamp(toNumber(settings.bloom_core_strength, DEFAULT_SETTINGS.bloom_core_strength), 0, 2);
        const haloStrength = clamp(toNumber(settings.bloom_halo_strength, DEFAULT_SETTINGS.bloom_halo_strength), 0, 2);
        const coreRadius = clamp(toNumber(settings.bloom_core_radius, DEFAULT_SETTINGS.bloom_core_radius), 0.25, 12);
        const coreSigma = Math.max(0.55, Math.log2(coreRadius + 1) * 0.55);
        const haloCenter = clamp(Math.log2(Math.max(2, haloRadius * (profile.scale || 0.5))) - 0.5, 1, levels.length - 1);
        const haloSigma = Math.max(0.8, haloCenter * 0.42);
        const coreRaw = levels.map(level => Math.exp(-(level.index * level.index) / (2 * coreSigma * coreSigma)));
        const haloRaw = levels.map(level => Math.exp(-Math.pow(level.index - haloCenter, 2) / (2 * haloSigma * haloSigma)));
        const coreTotal = Math.max(0.000001, coreRaw.reduce((sum, value) => sum + value, 0));
        const haloTotal = Math.max(0.000001, haloRaw.reduce((sum, value) => sum + value, 0));
        levels.forEach((level, index) => {
            level.weight = strength * (
                coreStrength * coreRaw[index] / coreTotal +
                haloStrength * haloRaw[index] / haloTotal
            );
        });
        return levels;
    }

    function getAdaptiveBloomProfile(state, baseProfile) {
        if (!baseProfile?.adaptive) return baseProfile;
        const states = baseProfile.scaleStates || [0.25, 1 / 3, 0.5, 2 / 3];
        const tier = clamp(Math.round(Number(state.adaptiveTier ?? baseProfile.tier ?? 2)), 0, states.length - 1);
        return {
            ...baseProfile,
            scale: states[tier],
            maxLevels: tier <= 1 ? 4 : (tier >= 3 ? 6 : 5),
            downsampleKernel: tier <= 1 ? 'dual_kawase' : 'hq13_karis_first',
            upsampleKernel: tier <= 1 ? 'bilinear' : 'tent9',
            tier
        };
    }

    class LightflowBloomPipeline {
        constructor(renderer, preview = null) {
            this.renderer = renderer;
            this.preview = preview;
            this.capabilities = window.LightflowRenderer?.getCapabilities?.(renderer, { probeHalfFloat: true }) || null;
            this.generation = Number(this.capabilities?.generation) || 0;
            this.useHalfFloat = !!(
                THREE.HalfFloatType !== undefined &&
                this.capabilities?.halfFloatRenderable
            );
            this.sourceTarget = null;
            this.compatibilityTarget = null;
            this.downTargets = [];
            this.upTargets = [];
            this.studioGlobalTarget = null;
            this.studioSampleTarget = null;
            this.studioAverageTargets = [null, null];
            this.lastResult = null;
            this.lastDiagnostics = null;
            this.disposed = false;
            this.createResources();
        }

        createResources() {
            const vertexShader = `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `;
            this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            this.scene = new THREE.Scene();
            this.geometry = new (THREE.PlaneGeometry || THREE.PlaneBufferGeometry)(2, 2);
            this.quad = new THREE.Mesh(this.geometry, null);
            this.quad.frustumCulled = false;
            this.scene.add(this.quad);

            this.extractMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    tEmission: { value: null },
                    tScene: { value: null },
                    tCompatibility: { value: null },
                    tDepth: { value: null },
                    uHasEmission: { value: 0 },
                    uHasScene: { value: 0 },
                    uHasCompatibility: { value: 0 },
                    uHasDepth: { value: 0 },
                    uEmissionUsesCoverageAlpha: { value: 0 },
                    uUvScale: { value: new THREE.Vector2(1, 1) },
                    uUvOffset: { value: new THREE.Vector2(0, 0) },
                    uThreshold: { value: DEFAULT_SETTINGS.bloom_threshold },
                    uSoftKnee: { value: DEFAULT_SETTINGS.bloom_soft_knee },
                    uHDRStrength: { value: DEFAULT_SETTINGS.bloom_hdr_strength },
                    uEmissiveStrength: { value: DEFAULT_SETTINGS.bloom_emissive_strength },
                    uOcclusion: { value: 1 }
                },
                vertexShader,
                fragmentShader: `
                    precision highp float;
                    varying vec2 vUv;
                    uniform sampler2D tEmission;
                    uniform sampler2D tScene;
                    uniform sampler2D tCompatibility;
                    uniform sampler2D tDepth;
                    uniform float uHasEmission;
                    uniform float uHasScene;
                    uniform float uHasCompatibility;
                    uniform float uHasDepth;
                    uniform float uEmissionUsesCoverageAlpha;
                    uniform vec2 uUvScale;
                    uniform vec2 uUvOffset;
                    uniform float uThreshold;
                    uniform float uSoftKnee;
                    uniform float uHDRStrength;
                    uniform float uEmissiveStrength;
                    uniform float uOcclusion;

                    vec3 decodeBloomSignal(vec3 encodedColor) {
                        return exp2(clamp(encodedColor, vec3(0.0), vec3(1.0)) * 4.0874628413) - vec3(1.0);
                    }
                    vec3 srgbToLinear(vec3 color) {
                        vec3 lower = color / 12.92;
                        vec3 upper = pow(max((color + 0.055) / 1.055, vec3(0.0)), vec3(2.4));
                        return mix(lower, upper, step(vec3(0.04045), color));
                    }
                    float bloomContribution(float signal) {
                        if (signal <= 0.000001) return 0.0;
                        if (uSoftKnee <= 0.000001 || uThreshold <= 0.000001) {
                            return clamp((signal - uThreshold) / signal, 0.0, 1.0);
                        }
                        float knee = max(uThreshold * uSoftKnee, 0.00001);
                        float soft = clamp(signal - uThreshold + knee, 0.0, 2.0 * knee);
                        soft = soft * soft / max(4.0 * knee, 0.00001);
                        return clamp(max(signal - uThreshold, soft) / signal, 0.0, 1.0);
                    }
                    void main() {
                        vec2 uv = uUvOffset + vUv * uUvScale;
                        vec3 emission = vec3(0.0);
                        float coverage = 0.0;
                        if (uHasEmission > 0.5) {
                            vec4 encoded = texture2D(tEmission, uv);
                            float emissionCoverage = mix(1.0, encoded.a, uEmissionUsesCoverageAlpha);
                            emission = decodeBloomSignal(encoded.rgb) * uEmissiveStrength * emissionCoverage;
                            coverage = max(coverage, encoded.a * uEmissionUsesCoverageAlpha);
                        }
                        if (uHasCompatibility > 0.5) {
                            vec4 compatibility = texture2D(tCompatibility, uv);
                            emission += max(compatibility.rgb, vec3(0.0)) * uEmissiveStrength;
                            coverage = max(coverage, compatibility.a);
                        }
                        vec3 sceneSignal = vec3(0.0);
                        if (uHasScene > 0.5) {
                            vec4 sceneSample = texture2D(tScene, uv);
                            sceneSignal = srgbToLinear(sceneSample.rgb) * uHDRStrength * sceneSample.a;
                            if (uHasCompatibility > 0.5 && uHasDepth > 0.5) {
                                float depth = texture2D(tDepth, uv).x;
                                float background = step(0.99999, depth);
                                float compatibilityCoverage = texture2D(tCompatibility, uv).a;
                                sceneSignal *= 1.0 - background * clamp(compatibilityCoverage, 0.0, 1.0);
                            }
                        }
                        // Authored emission (render mode, emissive map or MER)
                        // is already a selective Bloom signal. The luminance
                        // threshold belongs only to ordinary bright surfaces;
                        // applying it again erased dark-colored emitters.
                        float emissionSignal = max(emission.r, max(emission.g, emission.b));
                        float emissionContribution = step(0.000001, emissionSignal);
                        float sceneSignalPeak = max(sceneSignal.r, max(sceneSignal.g, sceneSignal.b));
                        float sceneContribution = bloomContribution(sceneSignalPeak);
                        vec3 color = max(
                            emission * emissionContribution,
                            sceneSignal * sceneContribution
                        );
                        float contribution = max(emissionContribution, sceneContribution);
                        float blocker = clamp(coverage, 0.0, 1.0) *
                            (1.0 - contribution) * uOcclusion;
                        gl_FragColor = vec4(color, blocker);
                    }
                `,
                depthTest: false,
                depthWrite: false,
                transparent: false,
                blending: THREE.NoBlending,
                toneMapped: false
            });
            this.extractMaterial.name = 'Lightflow_BloomV3_Source';

            this.downsampleMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    tInput: { value: null },
                    uTexel: { value: new THREE.Vector2(1, 1) },
                    uHighQuality: { value: 1 },
                    uKaris: { value: 0 }
                },
                vertexShader,
                fragmentShader: `
                    precision highp float;
                    varying vec2 vUv;
                    uniform sampler2D tInput;
                    uniform vec2 uTexel;
                    uniform float uHighQuality;
                    uniform float uKaris;
                    float luma(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }
                    float sampleWeight(vec3 color) {
                        return mix(1.0, 1.0 / (1.0 + luma(color)), uKaris);
                    }
                    void main() {
                        vec2 d = uTexel;
                        vec4 s0 = texture2D(tInput, vUv + vec2(-d.x, -d.y));
                        vec4 s1 = texture2D(tInput, vUv + vec2( d.x, -d.y));
                        vec4 s2 = texture2D(tInput, vUv + vec2(-d.x,  d.y));
                        vec4 s3 = texture2D(tInput, vUv + vec2( d.x,  d.y));
                        float w0 = sampleWeight(s0.rgb);
                        float w1 = sampleWeight(s1.rgb);
                        float w2 = sampleWeight(s2.rgb);
                        float w3 = sampleWeight(s3.rgb);
                        vec3 cheap = (
                            s0.rgb * w0 + s1.rgb * w1 +
                            s2.rgb * w2 + s3.rgb * w3
                        ) / max(w0 + w1 + w2 + w3, 0.00001);
                        float blocker = max(max(s0.a, s1.a), max(s2.a, s3.a));
                        if (uHighQuality < 0.5) {
                            gl_FragColor = vec4(cheap, blocker);
                            return;
                        }
                        vec4 a = texture2D(tInput, vUv + vec2(-2.0 * d.x, -2.0 * d.y));
                        vec4 b = texture2D(tInput, vUv + vec2(0.0, -2.0 * d.y));
                        vec4 c = texture2D(tInput, vUv + vec2(2.0 * d.x, -2.0 * d.y));
                        vec4 e = texture2D(tInput, vUv + vec2(-2.0 * d.x, 0.0));
                        vec4 f = texture2D(tInput, vUv);
                        vec4 g = texture2D(tInput, vUv + vec2(2.0 * d.x, 0.0));
                        vec4 h = texture2D(tInput, vUv + vec2(-2.0 * d.x, 2.0 * d.y));
                        vec4 i = texture2D(tInput, vUv + vec2(0.0, 2.0 * d.y));
                        vec4 j = texture2D(tInput, vUv + vec2(2.0 * d.x, 2.0 * d.y));
                        float wa = sampleWeight(a.rgb);
                        float wb = sampleWeight(b.rgb);
                        float wc = sampleWeight(c.rgb);
                        float we = sampleWeight(e.rgb);
                        float wf = sampleWeight(f.rgb);
                        float wg = sampleWeight(g.rgb);
                        float wh = sampleWeight(h.rgb);
                        float wi = sampleWeight(i.rgb);
                        float wj = sampleWeight(j.rgb);
                        vec3 high = (a.rgb * wa + c.rgb * wc + h.rgb * wh + j.rgb * wj) * 0.03125;
                        high += (b.rgb * wb + e.rgb * we + g.rgb * wg + i.rgb * wi) * 0.0625;
                        high += f.rgb * wf * 0.125;
                        high += (s0.rgb * w0 + s1.rgb * w1 + s2.rgb * w2 + s3.rgb * w3) * 0.125;
                        float highWeight = (wa + wc + wh + wj) * 0.03125;
                        highWeight += (wb + we + wg + wi) * 0.0625;
                        highWeight += wf * 0.125;
                        highWeight += (w0 + w1 + w2 + w3) * 0.125;
                        high /= max(highWeight, 0.00001);
                        blocker = max(blocker, max(max(a.a, c.a), max(h.a, j.a)));
                        gl_FragColor = vec4(mix(cheap, high, uHighQuality), blocker);
                    }
                `,
                depthTest: false,
                depthWrite: false,
                transparent: false,
                blending: THREE.NoBlending,
                toneMapped: false
            });
            this.downsampleMaterial.name = 'Lightflow_BloomV3_Downsample';

            this.upsampleMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    tHigh: { value: null },
                    tLow: { value: null },
                    uLowTexel: { value: new THREE.Vector2(1, 1) },
                    uHighWeight: { value: 1 },
                    uLowWeight: { value: 1 },
                    uTent: { value: 1 }
                },
                vertexShader,
                fragmentShader: `
                    precision highp float;
                    varying vec2 vUv;
                    uniform sampler2D tHigh;
                    uniform sampler2D tLow;
                    uniform vec2 uLowTexel;
                    uniform float uHighWeight;
                    uniform float uLowWeight;
                    uniform float uTent;
                    vec3 lowFrequency() {
                        vec3 center = texture2D(tLow, vUv).rgb;
                        vec2 d = uLowTexel;
                        vec3 tent = center * 4.0;
                        tent += texture2D(tLow, vUv + vec2(-d.x, 0.0)).rgb * 2.0;
                        tent += texture2D(tLow, vUv + vec2( d.x, 0.0)).rgb * 2.0;
                        tent += texture2D(tLow, vUv + vec2(0.0, -d.y)).rgb * 2.0;
                        tent += texture2D(tLow, vUv + vec2(0.0,  d.y)).rgb * 2.0;
                        tent += texture2D(tLow, vUv + vec2(-d.x, -d.y)).rgb;
                        tent += texture2D(tLow, vUv + vec2( d.x, -d.y)).rgb;
                        tent += texture2D(tLow, vUv + vec2(-d.x,  d.y)).rgb;
                        tent += texture2D(tLow, vUv + vec2( d.x,  d.y)).rgb;
                        return mix(center, tent / 16.0, uTent);
                    }
                    void main() {
                        vec4 high = texture2D(tHigh, vUv);
                        vec3 color = high.rgb * uHighWeight + lowFrequency() * uLowWeight;
                        gl_FragColor = vec4(color, high.a);
                    }
                `,
                depthTest: false,
                depthWrite: false,
                transparent: false,
                blending: THREE.NoBlending,
                toneMapped: false
            });
            this.upsampleMaterial.name = 'Lightflow_BloomV3_Upsample';

            this.copyMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    tInput: { value: null },
                    uUvScale: { value: new THREE.Vector2(1, 1) },
                    uUvOffset: { value: new THREE.Vector2(0, 0) },
                    uWeight: { value: 1 }
                },
                vertexShader,
                fragmentShader: `
                    precision highp float;
                    varying vec2 vUv;
                    uniform sampler2D tInput;
                    uniform vec2 uUvScale;
                    uniform vec2 uUvOffset;
                    uniform float uWeight;
                    void main() {
                        gl_FragColor = texture2D(tInput, uUvOffset + vUv * uUvScale) * uWeight;
                    }
                `,
                depthTest: false,
                depthWrite: false,
                transparent: false,
                blending: THREE.NoBlending,
                toneMapped: false
            });
            this.copyMaterial.name = 'Lightflow_BloomV3_Copy';

            this.averageMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    tPrevious: { value: null },
                    tSample: { value: null },
                    uWeight: { value: 1 }
                },
                vertexShader,
                fragmentShader: `
                    precision highp float;
                    varying vec2 vUv;
                    uniform sampler2D tPrevious;
                    uniform sampler2D tSample;
                    uniform float uWeight;
                    void main() {
                        gl_FragColor = mix(texture2D(tPrevious, vUv), texture2D(tSample, vUv), uWeight);
                    }
                `,
                depthTest: false,
                depthWrite: false,
                transparent: false,
                blending: THREE.NoBlending,
                toneMapped: false
            });
            this.averageMaterial.name = 'Lightflow_BloomV3_StudioAverage';

            this.studioCompositeMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    tBeauty: { value: null },
                    tBloom: { value: null },
                    uBloomUvScale: { value: new THREE.Vector2(1, 1) },
                    uBloomUvOffset: { value: new THREE.Vector2(0, 0) }
                },
                vertexShader,
                fragmentShader: `
                    precision highp float;
                    varying vec2 vUv;
                    uniform sampler2D tBeauty;
                    uniform sampler2D tBloom;
                    uniform vec2 uBloomUvScale;
                    uniform vec2 uBloomUvOffset;
                    vec3 srgbToLinear(vec3 color) {
                        vec3 lower = color / 12.92;
                        vec3 upper = pow(max((color + 0.055) / 1.055, vec3(0.0)), vec3(2.4));
                        return mix(lower, upper, step(vec3(0.04045), color));
                    }
                    vec3 linearToSRGB(vec3 color) {
                        color = max(color, vec3(0.0));
                        vec3 lower = color * 12.92;
                        vec3 upper = 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055;
                        return mix(lower, upper, step(vec3(0.0031308), color));
                    }
                    void main() {
                        vec4 beauty = texture2D(tBeauty, vUv);
                        vec4 bloom = texture2D(tBloom, uBloomUvOffset + vUv * uBloomUvScale);
                        vec3 color = srgbToLinear(beauty.rgb) + bloom.rgb * (1.0 - bloom.a);
                        gl_FragColor = vec4(clamp(linearToSRGB(color), 0.0, 1.0), beauty.a);
                    }
                `,
                depthTest: false,
                depthWrite: false,
                transparent: false,
                blending: THREE.NoBlending,
                toneMapped: false
            });
            this.studioCompositeMaterial.name = 'Lightflow_BloomV3_StudioComposite';
        }

        profile(name, callback) {
            const profiler = window.LightflowRenderer?.profilePass;
            return typeof profiler === 'function'
                ? profiler(this.preview, name, callback)
                : callback();
        }

        ensureTarget(target, width, height, name, hdr = true) {
            const expectedType = hdr && this.useHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
            if (target && target.texture?.type !== expectedType) {
                target.dispose?.();
                target = null;
            }
            if (!target) {
                target = createViewportPostTarget(width, height, name, false, hdr, this.renderer);
            } else {
                configureViewportPostTarget(target, width, height);
            }
            return target;
        }

        renderTarget(target, material, passName) {
            this.quad.material = material;
            configureViewportPostTarget(target, target.width, target.height);
            return this.profile(passName, () => {
                this.renderer.setRenderTarget(target);
                this.renderer.setScissorTest?.(false);
                this.renderer.render(this.scene, this.camera);
            });
        }

        clearTarget(target) {
            const oldColor = new THREE.Color();
            this.renderer.getClearColor?.(oldColor);
            const oldAlpha = this.renderer.getClearAlpha?.() ?? 1;
            this.renderer.setRenderTarget(target);
            this.renderer.setScissorTest?.(false);
            this.renderer.setClearColor?.(0x000000, 0);
            this.renderer.clear?.(true, false, false);
            this.renderer.setClearColor?.(oldColor, oldAlpha);
        }

        extractInto(target, options = {}) {
            const emissionTexture = options.emissionTexture || null;
            const sceneTexture = options.sceneTexture || null;
            const compatibilityTexture = options.compatibilityTexture || null;
            const depthTexture = options.depthTexture || null;
            const fallbackTexture = emissionTexture || sceneTexture || compatibilityTexture || depthTexture;
            if (!fallbackTexture) return false;
            const uniforms = this.extractMaterial.uniforms;
            uniforms.tEmission.value = emissionTexture || fallbackTexture;
            uniforms.tScene.value = sceneTexture || fallbackTexture;
            uniforms.tCompatibility.value = compatibilityTexture || fallbackTexture;
            uniforms.tDepth.value = depthTexture || fallbackTexture;
            uniforms.uHasEmission.value = emissionTexture ? 1 : 0;
            uniforms.uHasScene.value = sceneTexture ? 1 : 0;
            uniforms.uHasCompatibility.value = compatibilityTexture ? 1 : 0;
            uniforms.uHasDepth.value = depthTexture ? 1 : 0;
            uniforms.uEmissionUsesCoverageAlpha.value = options.emissionUsesCoverageAlpha ? 1 : 0;
            uniforms.uUvScale.value.copy(options.uvScale || new THREE.Vector2(1, 1));
            uniforms.uUvOffset.value.copy(options.uvOffset || new THREE.Vector2(0, 0));
            uniforms.uThreshold.value = clamp(toNumber(options.settings?.bloom_threshold, DEFAULT_SETTINGS.bloom_threshold), 0, 4);
            uniforms.uSoftKnee.value = clamp(toNumber(options.settings?.bloom_soft_knee, DEFAULT_SETTINGS.bloom_soft_knee), 0, 1);
            uniforms.uHDRStrength.value = clamp(toNumber(options.settings?.bloom_hdr_strength, DEFAULT_SETTINGS.bloom_hdr_strength), 0, 4);
            uniforms.uEmissiveStrength.value = clamp(toNumber(options.settings?.bloom_emissive_strength, DEFAULT_SETTINGS.bloom_emissive_strength), 0, 8);
            uniforms.uOcclusion.value = options.settings?.bloom_occlusion === false ? 0 : 1;
            this.renderTarget(target, this.extractMaterial, options.passName || 'bloom_source');
            return true;
        }

        renderCompatibilitySource(preview, width, height, studio = false) {
            const atmosphere = window.LightflowAtmosphere;
            const environment = window.LightflowEnvironment;
            const volumes = atmosphere?.settings?.enabled
                ? atmosphere.getActiveVolumes?.(preview?.camera)
                : null;
            const hasAtmosphere = !!(
                typeof atmosphere?.composite === 'function' &&
                Array.isArray(volumes) &&
                volumes.length
            );
            const environmentBloom = environment?.getBloomSettings?.({ studioBloomEnabled: true });
            const hasEnvironment = !!(
                environmentBloom?.active &&
                typeof environment?.renderBloomContribution === 'function'
            );
            this.lastCompatibilityDiagnostics = null;
            if (!hasAtmosphere && !hasEnvironment) return null;
            this.compatibilityTarget = this.ensureTarget(
                this.compatibilityTarget,
                width,
                height,
                'Lightflow_BloomV3_Compatibility',
                true
            );
            const snapshot = snapshotViewportRendererState(this.renderer);
            try {
                this.clearTarget(this.compatibilityTarget);
                let rendered = false;
                let environmentResult = null;
                const beforeCalls = Number(this.renderer.info?.render?.calls) || 0;
                if (hasEnvironment) {
                    environmentResult = environment.renderBloomContribution(preview, {
                        studio,
                        target: this.compatibilityTarget
                    });
                    this.lastEnvironmentContribution = environmentResult || null;
                    rendered = !!environmentResult;
                }
                if (hasAtmosphere) {
                    rendered = atmosphere.composite(preview, {
                        studio,
                        bloomMask: true,
                        linearBloom: true,
                        target: this.compatibilityTarget
                    }) || rendered;
                }
                this.lastCompatibilityDiagnostics = {
                    rendered,
                    drawCalls: Math.max(
                        0,
                        (Number(this.renderer.info?.render?.calls) || 0) - beforeCalls
                    ),
                    extraGeometrySubmissions: Math.max(
                        0,
                        Number(environmentResult?.submissions) || 0
                    ),
                    extraGeometryDrawCalls: Math.max(
                        0,
                        Number(environmentResult?.drawCalls) || 0
                    ),
                    atmospherePasses: hasAtmosphere ? 1 : 0
                };
                return rendered ? this.compatibilityTarget.texture : null;
            } finally {
                restoreViewportRendererState(this.renderer, snapshot);
            }
        }

        runHierarchy(sourceTexture, width, height, settings, profile, sourceMode) {
            const plan = createBloomLevelPlan(width, height, settings, profile);
            let inputTexture = sourceTexture;
            let inputWidth = width;
            let inputHeight = height;
            for (let index = 1; index < plan.length; index++) {
                const level = plan[index];
                this.downTargets[index - 1] = this.ensureTarget(
                    this.downTargets[index - 1],
                    level.width,
                    level.height,
                    'Lightflow_BloomV3_Down' + index,
                    true
                );
                const uniforms = this.downsampleMaterial.uniforms;
                uniforms.tInput.value = inputTexture;
                uniforms.uTexel.value.set(1 / Math.max(1, inputWidth), 1 / Math.max(1, inputHeight));
                uniforms.uHighQuality.value = profile.downsampleKernel === 'dual_kawase' ? 0 : 1;
                uniforms.uKaris.value = index === 1 && profile.downsampleKernel === 'hq13_karis_first' ? 1 : 0;
                this.renderTarget(this.downTargets[index - 1], this.downsampleMaterial, `bloom_downsample_${index - 1}`);
                inputTexture = this.downTargets[index - 1].texture;
                inputWidth = level.width;
                inputHeight = level.height;
            }
            while (this.downTargets.length > plan.length - 1) this.downTargets.pop()?.dispose?.();

            let lowTexture = inputTexture;
            let lowWidth = inputWidth;
            let lowHeight = inputHeight;
            for (let index = plan.length - 2; index >= 0; index--) {
                const level = plan[index];
                const highTexture = index === 0
                    ? sourceTexture
                    : this.downTargets[index - 1].texture;
                this.upTargets[index] = this.ensureTarget(
                    this.upTargets[index],
                    level.width,
                    level.height,
                    'Lightflow_BloomV3_Up' + index,
                    true
                );
                const uniforms = this.upsampleMaterial.uniforms;
                uniforms.tHigh.value = highTexture;
                uniforms.tLow.value = lowTexture;
                uniforms.uLowTexel.value.set(1 / Math.max(1, lowWidth), 1 / Math.max(1, lowHeight));
                uniforms.uHighWeight.value = plan[index].weight;
                uniforms.uLowWeight.value = index === plan.length - 2
                    ? plan[index + 1].weight
                    : 1;
                uniforms.uTent.value = profile.upsampleKernel === 'tent9' ? 1 : 0;
                this.renderTarget(this.upTargets[index], this.upsampleMaterial, `bloom_upsample_${index}`);
                lowTexture = this.upTargets[index].texture;
                lowWidth = level.width;
                lowHeight = level.height;
            }
            while (this.upTargets.length > plan.length - 1) this.upTargets.pop()?.dispose?.();

            const finalTexture = plan.length > 1 ? this.upTargets[0].texture : sourceTexture;
            const bytes = this.estimateBytes();
            this.lastResult = {
                texture: finalTexture,
                sourceTexture,
                width,
                height,
                plan,
                sourceMode,
                initialScale: profile.scale || 1,
                workingFormat: this.useHalfFloat ? 'rgba16f_linear' : 'rgba8_linear_clamped',
                downsampleKernel: profile.downsampleKernel,
                upsampleKernel: profile.upsampleKernel,
                estimatedBytes: bytes,
                activeTargets: this.getActiveTargets().length,
                drawCalls: Math.max(0, (plan.length - 1) * 2),
                targetSwitches: Math.max(0, (plan.length - 1) * 2)
            };
            this.lastDiagnostics = this.lastResult;
            return this.lastResult;
        }

        run(options = {}) {
            const settings = options.settings || DEFAULT_SETTINGS;
            const profile = options.profile || VIEWPORT_BLOOM_PROFILES.balanced;
            const width = Math.max(2, Math.round(options.width || 2));
            const height = Math.max(2, Math.round(options.height || 2));
            this.sourceTarget = this.ensureTarget(
                this.sourceTarget,
                width,
                height,
                'Lightflow_BloomV3_Source',
                true
            );
            const snapshot = snapshotViewportRendererState(this.renderer);
            try {
                if (!this.extractInto(this.sourceTarget, options)) return null;
                const result = this.runHierarchy(
                    this.sourceTarget.texture,
                    width,
                    height,
                    settings,
                    profile,
                    options.sourceMode || 'mrt'
                );
                result.drawCalls += 1;
                result.targetSwitches += 1;
                const compatibility = options.compatibilityTexture
                    ? this.lastCompatibilityDiagnostics
                    : null;
                result.compatibilityDrawCalls = Math.max(0, Number(compatibility?.drawCalls) || 0);
                result.extraGeometrySubmissions = Math.max(
                    0,
                    Number(compatibility?.extraGeometrySubmissions) || 0
                );
                result.extraGeometryDrawCalls = Math.max(
                    0,
                    Number(compatibility?.extraGeometryDrawCalls) || 0
                );
                result.drawCalls += result.compatibilityDrawCalls;
                if (compatibility?.rendered) result.targetSwitches += 1;
                return result;
            } finally {
                restoreViewportRendererState(this.renderer, snapshot);
            }
        }

        beginStudio(preview, outputSize, settings, profile) {
            this.preview = preview;
            const maxTextureSize = Math.max(64, Number(this.capabilities?.maxTextureSize) || 4096);
            const maxDimension = Math.min(
                maxTextureSize,
                Math.max(1024, Math.min(4096, Number(profile.maxDimension) || 4096))
            );
            const scale = Math.min(
                profile.scale,
                maxDimension / Math.max(outputSize.width, outputSize.height)
            );
            const width = Math.max(2, Math.round(outputSize.width * scale));
            const height = Math.max(2, Math.round(outputSize.height * scale));
            this.studioGlobalTarget = this.ensureTarget(
                this.studioGlobalTarget,
                width,
                height,
                'Lightflow_BloomV3_StudioGlobal',
                true
            );
            const snapshot = snapshotViewportRendererState(this.renderer);
            try { this.clearTarget(this.studioGlobalTarget); }
            finally { restoreViewportRendererState(this.renderer, snapshot); }
            const pipeline = this;
            const session = {
                width,
                height,
                scale,
                outputSize,
                settings,
                profile,
                sourceMode: 'mrt',
                extraGeometrySubmissions: 0,
                extraGeometryDrawCalls: 0,
                compatibilityDrawCalls: 0,
                compatibilityTargetPasses: 0,
                capturedSamples: 0,
                committedTiles: 0,
                currentAverage: null,
                tileBounds: null,
                result: null,
                captureSample(resources, tile, sampleIndex, sampleCount) {
                    const x0 = Math.round(tile.outputX / outputSize.width * width);
                    const x1 = Math.round((tile.outputX + tile.outputWidth) / outputSize.width * width);
                    const y0 = height - Math.round((tile.outputY + tile.outputHeight) / outputSize.height * height);
                    const y1 = height - Math.round(tile.outputY / outputSize.height * height);
                    const tileWidth = Math.max(1, x1 - x0);
                    const tileHeight = Math.max(1, y1 - y0);
                    session.tileBounds = { x: x0, y: y0, width: tileWidth, height: tileHeight };
                    pipeline.studioSampleTarget = pipeline.ensureTarget(
                        pipeline.studioSampleTarget,
                        tileWidth,
                        tileHeight,
                        'Lightflow_BloomV3_StudioSample',
                        true
                    );
                    pipeline.studioAverageTargets[0] = pipeline.ensureTarget(
                        pipeline.studioAverageTargets[0],
                        tileWidth,
                        tileHeight,
                        'Lightflow_BloomV3_StudioAverageA',
                        true
                    );
                    pipeline.studioAverageTargets[1] = pipeline.ensureTarget(
                        pipeline.studioAverageTargets[1],
                        tileWidth,
                        tileHeight,
                        'Lightflow_BloomV3_StudioAverageB',
                        true
                    );
                    const renderWidth = Math.max(1, Number(tile.renderWidth) || resources.width || 1);
                    const renderHeight = Math.max(1, Number(tile.renderHeight) || resources.height || 1);
                    const cropBottom = Math.max(
                        0,
                        renderHeight - Number(tile.cropY || 0) - Number(tile.sampleHeight || renderHeight)
                    );
                    const uvScale = new THREE.Vector2(
                        Math.max(0.000001, Number(tile.sampleWidth || renderWidth) / renderWidth),
                        Math.max(0.000001, Number(tile.sampleHeight || renderHeight) / renderHeight)
                    );
                    const uvOffset = new THREE.Vector2(
                        Math.max(0, Number(tile.cropX || 0) / renderWidth),
                        Math.max(0, cropBottom / renderHeight)
                    );
                    const compatibilityTexture = pipeline.renderCompatibilitySource(
                        preview,
                        Math.max(tileWidth, Math.round(tileWidth / uvScale.x)),
                        Math.max(tileHeight, Math.round(tileHeight / uvScale.y)),
                        true
                    );
                    const compatibilityDiagnostics = pipeline.lastCompatibilityDiagnostics || {};
                    const snapshot = snapshotViewportRendererState(pipeline.renderer);
                    try {
                        pipeline.extractInto(pipeline.studioSampleTarget, {
                            emissionTexture: resources.emissionTexture,
                            sceneTexture: resources.colorTexture,
                            compatibilityTexture,
                            depthTexture: resources.depthTexture,
                            emissionUsesCoverageAlpha: false,
                            uvScale,
                            uvOffset,
                            settings,
                            passName: 'studio_bloom_source_accumulation'
                        });
                        if (sampleIndex === 0) {
                            pipeline.copyMaterial.uniforms.tInput.value = pipeline.studioSampleTarget.texture;
                            pipeline.copyMaterial.uniforms.uUvScale.value.set(1, 1);
                            pipeline.copyMaterial.uniforms.uUvOffset.value.set(0, 0);
                            pipeline.copyMaterial.uniforms.uWeight.value = 1;
                            pipeline.renderTarget(
                                pipeline.studioAverageTargets[0],
                                pipeline.copyMaterial,
                                'studio_bloom_average_0'
                            );
                            session.currentAverage = pipeline.studioAverageTargets[0];
                        } else {
                            const next = session.currentAverage === pipeline.studioAverageTargets[0]
                                ? pipeline.studioAverageTargets[1]
                                : pipeline.studioAverageTargets[0];
                            pipeline.averageMaterial.uniforms.tPrevious.value = session.currentAverage.texture;
                            pipeline.averageMaterial.uniforms.tSample.value = pipeline.studioSampleTarget.texture;
                            pipeline.averageMaterial.uniforms.uWeight.value = 1 / Math.max(1, sampleIndex + 1);
                            pipeline.renderTarget(next, pipeline.averageMaterial, `studio_bloom_average_${sampleIndex}`);
                            session.currentAverage = next;
                        }
                        session.capturedSamples += 1;
                        const compatibility = resources.compatibilityOccluders || {};
                        session.extraGeometrySubmissions += Math.max(0, Number(compatibility.submissions) || 0);
                        session.extraGeometryDrawCalls += Math.max(0, Number(compatibility.drawCalls) || 0);
                        session.extraGeometrySubmissions += Math.max(
                            0,
                            Number(compatibilityDiagnostics.extraGeometrySubmissions) || 0
                        );
                        session.extraGeometryDrawCalls += Math.max(
                            0,
                            Number(compatibilityDiagnostics.extraGeometryDrawCalls) || 0
                        );
                        session.compatibilityDrawCalls += Math.max(
                            0,
                            Number(compatibilityDiagnostics.drawCalls) || 0
                        );
                        if (compatibilityTexture) session.compatibilityTargetPasses += 1;
                        if (compatibility.submissions > 0 && compatibilityTexture) {
                            session.sourceMode = 'mrt_plus_compatibility';
                        } else if (compatibility.submissions > 0) {
                            session.sourceMode = 'mrt_plus_compatibility_occluders';
                        } else if (compatibilityTexture) {
                            session.sourceMode = 'mrt_plus_environment_atmosphere';
                        }
                        if (sampleIndex === sampleCount - 1) session.commitTile();
                    } finally {
                        restoreViewportRendererState(pipeline.renderer, snapshot);
                    }
                },
                commitTile() {
                    if (!session.currentAverage || !session.tileBounds) return false;
                    const target = pipeline.studioGlobalTarget;
                    const previousViewport = target.viewport?.clone?.() || null;
                    const previousScissor = target.scissor?.clone?.() || null;
                    const previousScissorTest = target.scissorTest;
                    const snapshot = snapshotViewportRendererState(pipeline.renderer);
                    try {
                        target.viewport?.set?.(
                            session.tileBounds.x,
                            session.tileBounds.y,
                            session.tileBounds.width,
                            session.tileBounds.height
                        );
                        target.scissorTest = false;
                        pipeline.copyMaterial.uniforms.tInput.value = session.currentAverage.texture;
                        pipeline.copyMaterial.uniforms.uUvScale.value.set(1, 1);
                        pipeline.copyMaterial.uniforms.uUvOffset.value.set(0, 0);
                        pipeline.copyMaterial.uniforms.uWeight.value = 1;
                        pipeline.quad.material = pipeline.copyMaterial;
                        pipeline.profile('studio_bloom_commit_tile', () => {
                            pipeline.renderer.autoClear = false;
                            pipeline.renderer.setRenderTarget(target);
                            pipeline.renderer.setScissorTest?.(false);
                            pipeline.renderer.render(pipeline.scene, pipeline.camera);
                        });
                        session.committedTiles += 1;
                        return true;
                    } finally {
                        if (previousViewport && target.viewport) target.viewport.copy(previousViewport);
                        if (previousScissor && target.scissor) target.scissor.copy(previousScissor);
                        target.scissorTest = previousScissorTest;
                        configureViewportPostTarget(target, width, height);
                        restoreViewportRendererState(pipeline.renderer, snapshot);
                    }
                },
                finish() {
                    const snapshot = snapshotViewportRendererState(pipeline.renderer);
                    try {
                        session.result = pipeline.runHierarchy(
                            pipeline.studioGlobalTarget.texture,
                            width,
                            height,
                            settings,
                            profile,
                            session.sourceMode
                        );
                        session.result.studioSourceResolution = [width, height];
                        session.result.initialScale = scale;
                        session.result.extraGeometrySubmissions = session.extraGeometrySubmissions;
                        session.result.extraGeometryDrawCalls = session.extraGeometryDrawCalls;
                        session.result.sourcePasses = session.capturedSamples;
                        session.result.accumulationPasses = session.capturedSamples;
                        session.result.tileCommitPasses = session.committedTiles;
                        session.result.compatibilityDrawCalls = session.compatibilityDrawCalls;
                        session.result.drawCalls += session.capturedSamples * 2 +
                            session.committedTiles + session.compatibilityDrawCalls;
                        session.result.targetSwitches += session.capturedSamples * 2 +
                            session.committedTiles + session.compatibilityTargetPasses;
                        return session.result;
                    } finally {
                        restoreViewportRendererState(pipeline.renderer, snapshot);
                    }
                },
                async compositeCanvas(canvas, tiles, renderPreview, renderSession) {
                    if (!canvas || !session.result?.texture) return false;
                    const outputContext = canvas.getContext('2d', { alpha: true });
                    const scratch = createCanvas(2, 2);
                    const scratchContext = scratch.getContext('2d', { alpha: true });
                    const beautyTexture = new THREE.CanvasTexture(scratch);
                    beautyTexture.generateMipmaps = false;
                    beautyTexture.minFilter = THREE.LinearFilter;
                    beautyTexture.magFilter = THREE.LinearFilter;
                    const material = pipeline.studioCompositeMaterial;
                    material.uniforms.tBeauty.value = beautyTexture;
                    material.uniforms.tBloom.value = session.result.texture;
                    const gl = getRendererContext(pipeline.renderer);
                    const snapshot = snapshotViewportRendererState(pipeline.renderer);
                    try {
                        for (let index = 0; index < tiles.length; index++) {
                            const tile = tiles[index];
                            const x0 = Math.max(0, Math.round(tile.outputX));
                            const y0 = Math.max(0, Math.round(tile.outputY));
                            const x1 = Math.min(canvas.width, Math.round(tile.outputX + tile.outputWidth));
                            const y1 = Math.min(canvas.height, Math.round(tile.outputY + tile.outputHeight));
                            const tileWidth = Math.max(1, x1 - x0);
                            const tileHeight = Math.max(1, y1 - y0);
                            scratch.width = tileWidth;
                            scratch.height = tileHeight;
                            scratchContext.globalCompositeOperation = 'copy';
                            scratchContext.globalAlpha = 1;
                            scratchContext.drawImage(canvas, x0, y0, tileWidth, tileHeight, 0, 0, tileWidth, tileHeight);
                            beautyTexture.needsUpdate = true;
                            material.uniforms.uBloomUvScale.value.set(
                                tileWidth / canvas.width,
                                tileHeight / canvas.height
                            );
                            material.uniforms.uBloomUvOffset.value.set(
                                x0 / canvas.width,
                                1 - y1 / canvas.height
                            );
                            pipeline.renderer.setSize?.(tileWidth, tileHeight, false);
                            pipeline.renderer.setRenderTarget(null);
                            pipeline.renderer.setScissorTest?.(false);
                            pipeline.renderer.autoClear = true;
                            pipeline.renderer.setClearColor?.(0x000000, 0);
                            if (gl) gl.viewport(0, 0, tileWidth, tileHeight);
                            pipeline.quad.material = material;
                            pipeline.profile('studio_bloom_composite', () => (
                                pipeline.renderer.render(pipeline.scene, pipeline.camera)
                            ));
                            await requireStudioGpuFence(pipeline.renderer, renderSession);
                            if (renderSession?.cancelled) return false;
                            outputContext.save();
                            outputContext.beginPath();
                            outputContext.rect(x0, y0, tileWidth, tileHeight);
                            outputContext.clip();
                            outputContext.clearRect(x0, y0, tileWidth, tileHeight);
                            outputContext.globalCompositeOperation = 'source-over';
                            outputContext.globalAlpha = 1;
                            outputContext.drawImage(
                                renderPreview.canvas,
                                0,
                                0,
                                tileWidth,
                                tileHeight,
                                x0,
                                y0,
                                tileWidth,
                                tileHeight
                            );
                            outputContext.restore();
                        }
                        session.result.compositePasses = tiles.length;
                        session.result.drawCalls += tiles.length;
                        session.result.targetSwitches += tiles.length;
                        return true;
                    } finally {
                        beautyTexture.dispose?.();
                        scratch.width = scratch.height = 1;
                        restoreViewportRendererState(pipeline.renderer, snapshot);
                    }
                },
                dispose(options = {}) {
                    pipeline.releaseStudioResources(options);
                }
            };
            return session;
        }

        getActiveTargets() {
            return Array.from(new Set([
                this.sourceTarget,
                this.compatibilityTarget,
                this.studioGlobalTarget,
                this.studioSampleTarget,
                ...this.studioAverageTargets,
                ...this.downTargets,
                ...this.upTargets
            ].filter(Boolean)));
        }

        estimateBytes() {
            const targets = this.getActiveTargets();
            let bytes = 0;
            targets.forEach(target => {
                const type = target.texture?.type;
                const bytesPerChannel = type === THREE.FloatType ? 4 : (type === THREE.HalfFloatType ? 2 : 1);
                bytes += Math.max(1, target.width || 1) * Math.max(1, target.height || 1) * 4 * bytesPerChannel;
            });
            return bytes;
        }

        releaseStudioResources(options = {}) {
            if (options.contextLost !== true) {
                this.studioGlobalTarget?.dispose?.();
                this.studioSampleTarget?.dispose?.();
                this.studioAverageTargets.forEach(target => target?.dispose?.());
            }
            this.studioGlobalTarget = null;
            this.studioSampleTarget = null;
            this.studioAverageTargets = [null, null];
        }

        dispose(options = {}) {
            if (this.disposed) return;
            this.disposed = true;
            if (options.contextLost !== true) {
                [
                    this.sourceTarget,
                    this.compatibilityTarget,
                    this.studioGlobalTarget,
                    this.studioSampleTarget,
                    ...this.studioAverageTargets,
                    ...this.downTargets,
                    ...this.upTargets
                ].forEach(target => target?.dispose?.());
                [
                    this.extractMaterial,
                    this.downsampleMaterial,
                    this.upsampleMaterial,
                    this.copyMaterial,
                    this.averageMaterial,
                    this.studioCompositeMaterial,
                    this.geometry
                ].forEach(resource => resource?.dispose?.());
            }
            BLOOM_PIPELINE_INSTANCES.delete(this);
        }
    }

    function getLightflowBloomPipeline(preview) {
        const renderer = preview?.renderer;
        if (!renderer) return null;
        const capabilities = window.LightflowRenderer?.getCapabilities?.(renderer, { probeHalfFloat: true }) || null;
        const generation = Number(capabilities?.generation) || 0;
        let pipeline = BLOOM_PIPELINE_BY_RENDERER.get(renderer);
        if (pipeline && (pipeline.disposed || pipeline.generation !== generation || capabilities?.lost)) {
            pipeline.dispose({ contextLost: !!capabilities?.lost || pipeline.generation !== generation });
            BLOOM_PIPELINE_BY_RENDERER.delete(renderer);
            pipeline = null;
        }
        if (!pipeline && !capabilities?.lost) {
            pipeline = new LightflowBloomPipeline(renderer, preview);
            BLOOM_PIPELINE_BY_RENDERER.set(renderer, pipeline);
            BLOOM_PIPELINE_INSTANCES.add(pipeline);
        }
        if (pipeline) pipeline.preview = preview;
        return pipeline;
    }

    function renderViewportBloomMaskFallback(preview, state, width, height) {
        const renderer = preview?.renderer;
        const scene = window.Canvas?.scene;
        if (!renderer || !scene || !THREE.WebGLRenderTarget) return false;

        let maskSizeChanged = false;
        if (!state.maskTarget) {
            state.maskTarget = createViewportPostTarget(
                width,
                height,
                'Lightflow_ViewportBloomMask',
                true,
                true,
                renderer
            );
            maskSizeChanged = true;
        } else {
            maskSizeChanged = state.maskTarget.width !== width || state.maskTarget.height !== height;
            configureViewportPostTarget(state.maskTarget, width, height);
        }

        const snapshot = snapshotViewportRendererState(renderer);
        const hiddenVisibility = new Map();
        let materialChanges = [];
        let succeeded = false;
        try {
            collectStudioRenderHiddenObjects().forEach(object => {
                if (!object || hiddenVisibility.has(object)) return;
                hiddenVisibility.set(object, object.visible);
                object.visible = false;
            });
            // Visit the visible hierarchy once. Thousands of cubes can share a
            // source material: resolve its emission and mask uniforms once per
            // pass, including the detection step, instead of once per face.
            materialChanges = buildBloomMaskManifest(scene);
            const resolver = createBloomMaskMaterialResolver();
            const hasEncodedEmission = materialChanges.some(change => {
                const materials = Array.isArray(change.material) ? change.material : [change.material];
                return materials.some(material => (
                    material?.visible !== false && resolver.getState(material).active
                ));
            });
            const atmosphere = window.LightflowAtmosphere;
            const atmosphereVolumes = atmosphere?.settings?.enabled
                ? atmosphere.getActiveVolumes?.(preview.camera)
                : null;
            const hasAtmosphereEmission = Array.isArray(atmosphereVolumes) && atmosphereVolumes.length > 0;
            if (!hasEncodedEmission && !hasAtmosphereEmission) {
                if (state.maskIsBlack && !maskSizeChanged) return true;
                renderer.autoClear = true;
                if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;
                configureViewportPostTarget(state.maskTarget, width, height);
                renderer.setRenderTarget(state.maskTarget);
                renderer.setClearColor?.(0x000000, 0);
                renderer.clear?.(true, true, true);
                state.maskIsBlack = true;
                return true;
            }
            refreshBloomMaskManifest(materialChanges, resolver);
            materialChanges.forEach(change => {
                change.object.material = change.replacement;
            });
            renderer.autoClear = true;
            if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;
            /*
             * In Three r129 setViewport() always multiplies by renderer DPR,
             * even when a render target is active. The target viewport is
             * already expressed in physical target pixels, so calling it here
             * produced the exact 1.25x offset seen with Windows scaling at 125%.
             * setRenderTarget() consumes target.viewport without a second DPR.
             */
            configureViewportPostTarget(state.maskTarget, width, height);
            renderer.setRenderTarget(state.maskTarget);
            renderer.setClearColor?.(0x000000, 0);
            renderer.clear?.(true, true, true);
            const renderFallbackMask = () => renderer.render(scene, preview.camera);
            if (typeof window.LightflowRenderer?.profilePass === 'function') {
                window.LightflowRenderer.profilePass(
                    preview,
                    'bloom_fallback_mask_geometry',
                    renderFallbackMask
                );
            } else {
                renderFallbackMask();
            }
            if (window.LightflowAtmosphere?.composite) {
                // Viewport Bloom consumes the current preview-quality Atmosphere
                // integration. Marking this as Studio forced a different frame
                // signature and could trigger a second volumetric raymarch.
                window.LightflowAtmosphere.composite(preview, { studio: false, bloomMask: true });
                renderer.setRenderTarget(state.maskTarget);
            }
            state.maskIsBlack = false;
            succeeded = true;
        } finally {
            for (let index = materialChanges.length - 1; index >= 0; index--) {
                materialChanges[index].object.material = materialChanges[index].material;
            }
            hiddenVisibility.forEach((visible, object) => { object.visible = visible; });
            restoreViewportRendererState(renderer, snapshot);
        }
        return succeeded;
    }

    function createViewportComposerResources(state) {
        if (state.postScene) return;
        state.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        state.postScene = new THREE.Scene();
        state.postGeometry = new THREE.PlaneGeometry(2, 2);

        state.compositeMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tBeauty: { value: null },
                tBloom: { value: null },
                uUseBeauty: { value: false },
                uUseBloom: { value: true },
                uUseColorGrade: { value: false },
                uExposure: { value: 1 },
                uContrast: { value: 1 },
                uSaturation: { value: 1 },
                uTemperature: { value: 0 },
                uTint: { value: 0 },
                uVignette: { value: 0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform sampler2D tBeauty;
                uniform sampler2D tBloom;
                uniform bool uUseBeauty;
                uniform bool uUseBloom;
                uniform bool uUseColorGrade;
                uniform float uExposure;
                uniform float uContrast;
                uniform float uSaturation;
                uniform float uTemperature;
                uniform float uTint;
                uniform float uVignette;
                varying vec2 vUv;

                vec3 colorGrade(vec3 color) {
                    color *= uExposure;
                    color = (color - 0.5) * uContrast + 0.5;
                    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
                    color = mix(vec3(luminance), color, uSaturation);
                    color += vec3(uTemperature * 0.12 + uTint * 0.025, -abs(uTint) * 0.07, -uTemperature * 0.12 + uTint * 0.025);
                    float edge = smoothstep(0.38, 0.78, length(vUv - 0.5));
                    color *= 1.0 - edge * uVignette * 0.82;
                    return max(color, vec3(0.0));
                }

                void main() {
                    vec4 beauty = uUseBeauty ? texture2D(tBeauty, vUv) : vec4(0.0);
                    vec3 bloom = vec3(0.0);
                    if (uUseBloom) {
                        vec4 bloomSample = texture2D(tBloom, vUv);
                        bloom = bloomSample.rgb * (1.0 - bloomSample.a);
                    }
                    vec3 color = beauty.rgb + bloom;
                    if (uUseColorGrade) color = colorGrade(color);
                    gl_FragColor = vec4(color, uUseBeauty ? beauty.a : 1.0);
                }
            `,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneFactor,
            blendEquationAlpha: THREE.AddEquation,
            blendSrcAlpha: THREE.ZeroFactor,
            blendDstAlpha: THREE.OneFactor
        });
        state.compositeMaterial.name = 'Lightflow_ViewportGPUComposer';
        state.postQuad = new THREE.Mesh(state.postGeometry, state.compositeMaterial);
        state.postQuad.frustumCulled = false;
        state.postScene.add(state.postQuad);
    }

    function ensureViewportBeautyTexture(state, renderer, snapshot, width, height) {
        let needsInitialization = false;
        if (!state.beautyTarget) {
            state.beautyTarget = createViewportPostTarget(
                width,
                height,
                'Lightflow_ViewportBeauty',
                false,
                false,
                renderer
            );
            needsInitialization = true;
        } else {
            needsInitialization = state.beautyTarget.width !== width || state.beautyTarget.height !== height;
            configureViewportPostTarget(state.beautyTarget, width, height);
        }
        // Initializing a WebGLRenderTarget gives r129 copyFramebufferToTexture
        // a real GPU texture without allocating or reading a CPU-side image.
        if (needsInitialization) {
            renderer.setRenderTarget(state.beautyTarget);
            restoreViewportRendererState(renderer, snapshot);
        }
        return state.beautyTarget.texture;
    }

    function getViewportBeautyTexture(state) {
        return state?.sharedBeautyTexture || state?.beautyTarget?.texture || null;
    }

    function renderViewportGPUComposite(preview, state, snapshot, bloomSettings, useBloom, useColorGrade) {
        const renderer = preview.renderer;
        createViewportComposerResources(state);
        const material = state.compositeMaterial;
        const uniforms = material.uniforms;
        const beautyTexture = getViewportBeautyTexture(state);
        const fallback = state.bloomResult?.texture || state.sharedEmissionTexture || state.maskTarget?.texture || beautyTexture;
        uniforms.tBeauty.value = beautyTexture || fallback;
        uniforms.tBloom.value = state.bloomResult?.texture || fallback;
        uniforms.uUseBeauty.value = !!useColorGrade;
        uniforms.uUseBloom.value = !!useBloom;
        uniforms.uUseColorGrade.value = !!useColorGrade;
        uniforms.uExposure.value = clamp(toNumber(currentSettings.exposure, 1), 0.1, 4);
        uniforms.uContrast.value = clamp(toNumber(currentSettings.contrast, 1), 0, 3);
        uniforms.uSaturation.value = clamp(toNumber(currentSettings.saturation, 1), 0, 3);
        uniforms.uTemperature.value = clamp(toNumber(currentSettings.temperature, 0), -1, 1);
        uniforms.uTint.value = clamp(toNumber(currentSettings.tint, 0), -1, 1);
        uniforms.uVignette.value = clamp(toNumber(currentSettings.vignette, 0), 0, 1);

        state.postQuad.material = material;
        material.transparent = !useColorGrade;
        if (useColorGrade) {
            material.blending = THREE.NoBlending;
        } else {
            /*
             * Add Bloom to RGB without touching the destination alpha. The
             * Blockbench checkerboard is CSS behind a transparent WebGL
             * canvas; ordinary AdditiveBlending also adds source alpha and
             * turns those transparent pixels opaque black.
             */
            material.blending = THREE.CustomBlending;
            material.blendEquation = THREE.AddEquation;
            material.blendSrc = THREE.OneFactor;
            material.blendDst = THREE.OneFactor;
            material.blendEquationAlpha = THREE.AddEquation;
            material.blendSrcAlpha = THREE.ZeroFactor;
            material.blendDstAlpha = THREE.OneFactor;
        }
        renderer.setRenderTarget?.(null);
        if (snapshot.viewport) renderer.setViewport?.(snapshot.viewport);
        if (snapshot.scissor) renderer.setScissor?.(snapshot.scissor);
        renderer.setScissorTest?.(snapshot.scissorTest);
        renderer.autoClear = false;
        const renderComposite = () => renderer.render(state.postScene, state.postCamera);
        if (typeof window.LightflowRenderer?.profilePass === 'function') {
            window.LightflowRenderer.profilePass(preview, 'bloom_composite', renderComposite);
        } else {
            renderComposite();
        }
    }

    function getViewportComposerState(preview) {
        if (!preview?.canvas || !preview.renderer) return null;
        let state = VIEWPORT_COMPOSER_STATE.get(preview);
        if (state) return state;
        state = {
            preview,
            maskTarget: null,
            maskIsBlack: false,
            sharedEmissionTexture: null,
            bloomResult: null,
            beautyTarget: null,
            copyPosition: new THREE.Vector2(),
            postScene: null,
            postCamera: null,
            postQuad: null,
            postGeometry: null,
            compositeMaterial: null,
            adaptiveTier: VIEWPORT_BLOOM_PROFILES.adaptive.tier,
            dynamicScale: VIEWPORT_BLOOM_PROFILES.adaptive.scale,
            composerMs: 0,
            adaptiveFrames: 0,
            lastRender: 0,
            rendering: false,
            scheduled: false,
            disposed: false
        };
        VIEWPORT_COMPOSER_STATE.set(preview, state);
        return state;
    }

    function hideViewportComposerOverlay() {
        // GPU composition is drawn into the viewport framebuffer, so there is
        // no persistent DOM overlay to hide or accidentally misalign.
    }

    function updateAdaptiveViewportBloom(state, elapsed, profile) {
        if (!profile.adaptive) return;
        state.composerMs = state.composerMs > 0 ? state.composerMs * 0.9 + elapsed * 0.1 : elapsed;
        const budget = window.LightflowFrameBudget?.get?.() || {};
        const bloomScale = clamp(toNumber(budget.bloomScale, 1), 0.5, 1);
        const pressure = bloomScale < 0.82;
        const spare = bloomScale > 0.98;
        state.adaptivePressureFrames = pressure ? (state.adaptivePressureFrames || 0) + 1 : 0;
        state.adaptiveSpareFrames = spare ? (state.adaptiveSpareFrames || 0) + 1 : 0;
        const states = profile.scaleStates || [0.25, 1 / 3, 0.5, 2 / 3];
        let tier = clamp(Math.round(Number(state.adaptiveTier ?? profile.tier ?? 2)), 0, states.length - 1);
        if (state.adaptivePressureFrames >= 90 && tier > 0) {
            tier -= 1;
            state.adaptivePressureFrames = 0;
            state.adaptiveSpareFrames = 0;
        } else if (state.adaptiveSpareFrames >= 180 && tier < states.length - 1) {
            tier += 1;
            state.adaptivePressureFrames = 0;
            state.adaptiveSpareFrames = 0;
        }
        state.adaptiveTier = tier;
        state.dynamicScale = states[tier];
    }

    function renderViewportComposer(preview) {
        if (!preview?.renderer || !preview.canvas || window.LightManagerStudioRenderSession || preview.sa_studio_render_active) return;
        if (window.ShaderEngine?.shouldDeferProjectPreviewEffect?.(3, preview)) return;
        if (!isLightflowRenderMode()) return;
        const bloomSettings = resolveBloomSettings(currentSettings);
        const useBloom = !!(
            currentSettings.viewport_bloom_enabled &&
            studioBloomHasVisibleContribution(bloomSettings)
        );
        const useColorGrade = !!currentSettings.color_grading_enabled;
        if (!useBloom && !useColorGrade) return;

        const state = getViewportComposerState(preview);
        if (!state || state.rendering || state.disposed) return;
        const now = performance.now();
        const fpsLimit = clamp(toNumber(currentSettings.viewport_bloom_fps, 0), 0, 144);
        const interval = fpsLimit > 0 ? 1000 / fpsLimit : 0;
        if (interval > 0 && now - state.lastRender < interval) return;

        const renderer = preview.renderer;
        const snapshot = snapshotViewportRendererState(renderer);
        // The compositor is designed for the visible framebuffer. Nested
        // Studio/SSR/AO render-target passes must finish before it runs.
        if (snapshot.target) return;
        const currentViewport = snapshot.currentViewport;
        const drawingBuffer = renderer.getDrawingBufferSize?.(new THREE.Vector2()) || null;
        const viewWidth = Math.max(1, Math.round(currentViewport?.z || drawingBuffer?.x || preview.canvas.width || 1));
        const viewHeight = Math.max(1, Math.round(currentViewport?.w || drawingBuffer?.y || preview.canvas.height || 1));
        const baseProfile = getViewportBloomProfile(currentSettings);
        const profile = getAdaptiveBloomProfile(state, baseProfile);
        const rendererCapabilities = window.LightflowRenderer?.getCapabilities?.(renderer) || {};
        const legalDimension = Math.max(64, Number(rendererCapabilities.maxTextureSize) || profile.maxDimension);
        const bloomScale = Math.min(
            profile.scale,
            Math.min(profile.maxDimension, legalDimension) / Math.max(viewWidth, viewHeight)
        );
        const maskWidth = Math.max(2, Math.round(viewWidth * bloomScale));
        const maskHeight = Math.max(2, Math.round(viewHeight * bloomScale));
        const started = performance.now();

        state.rendering = true;
        try {
            const sharedFrame = window.LightflowFramePipeline?.getFrameResources?.(preview);
            const canonicalSceneTexture = sharedFrame?.colorTexture || null;
            const hasCompositedRim = (window.MinecraftPromotionalSilhouetteManager?.getGroups?.()?.size || 0) > 0;
            state.sharedBeautyTexture = !useColorGrade && !hasCompositedRim
                ? canonicalSceneTexture
                : null;
            state.sharedEmissionTexture = useBloom ? (sharedFrame?.emissionTexture || null) : null;
            const needsBeautyTexture = useColorGrade || hasCompositedRim || (
                useBloom && bloomSettings.bloom_hdr_strength > 0.0001
            );
            if (needsBeautyTexture && !state.sharedBeautyTexture) {
                const beauty = ensureViewportBeautyTexture(state, renderer, snapshot, viewWidth, viewHeight);
                if (!beauty || typeof renderer.copyFramebufferToTexture !== 'function') return;
                const originX = Math.max(0, Math.round(currentViewport?.x || 0));
                const originY = Math.max(0, Math.round(currentViewport?.y || 0));
                renderer.copyFramebufferToTexture(state.copyPosition.set(originX, originY), beauty);
            }
            let bloomReady = false;
            state.bloomResult = null;
            if (useBloom) {
                const bloomPipeline = getLightflowBloomPipeline(preview);
                let emissionTexture = state.sharedEmissionTexture;
                let emissionUsesCoverageAlpha = false;
                let compatibilityTexture = null;
                let sourceMode = emissionTexture ? 'mrt' : 'fallback_mask';
                if (emissionTexture && bloomPipeline) {
                    compatibilityTexture = bloomPipeline.renderCompatibilitySource(
                        preview,
                        maskWidth,
                        maskHeight,
                        false
                    );
                    if (sharedFrame?.compatibilityOccluders?.submissions > 0) {
                        sourceMode = 'mrt_plus_compatibility_occluders';
                    }
                    if (compatibilityTexture) {
                        sourceMode = sharedFrame?.compatibilityOccluders?.submissions > 0
                            ? 'mrt_plus_compatibility'
                            : 'mrt_plus_environment_atmosphere';
                    }
                } else if (renderViewportBloomMaskFallback(preview, state, maskWidth, maskHeight)) {
                    emissionTexture = state.maskTarget?.texture || null;
                    emissionUsesCoverageAlpha = true;
                }
                if (bloomPipeline && (emissionTexture || canonicalSceneTexture || getViewportBeautyTexture(state))) {
                    state.bloomResult = bloomPipeline.run({
                        emissionTexture,
                        sceneTexture: canonicalSceneTexture || getViewportBeautyTexture(state),
                        compatibilityTexture,
                        depthTexture: sharedFrame?.depthTexture || null,
                        emissionUsesCoverageAlpha,
                        settings: bloomSettings,
                        profile,
                        width: maskWidth,
                        height: maskHeight,
                        sourceMode
                    });
                    bloomReady = !!state.bloomResult;
                }
            }
            renderViewportGPUComposite(preview, state, snapshot, bloomSettings, bloomReady, useColorGrade);
            state.lastRender = now;
        } catch (error) {
            if (!state.failureReported) {
                state.failureReported = true;
                console.warn('[Studio Render] realtime GPU composer failed', error);
            }
        } finally {
            restoreViewportRendererState(renderer, snapshot);
            state.sharedBeautyTexture = null;
            state.sharedEmissionTexture = null;
            state.rendering = false;
            updateAdaptiveViewportBloom(state, performance.now() - started, baseProfile);
        }
    }

    function collectStudioRenderPreviews() {
        const previews = new Set();
        if (window.Preview?.selected) previews.add(Preview.selected);
        if (Array.isArray(window.Preview?.all)) Preview.all.forEach(preview => previews.add(preview));
        [window.main_preview, window.MediaPreview, window.Screencam?.NoAAPreview].forEach(preview => {
            if (preview) previews.add(preview);
        });
        return previews;
    }

    function collectStudioRenderRenderers() {
        const renderers = [];
        const canvases = new Set();
        collectStudioRenderPreviews().forEach(preview => {
            const renderer = preview?.renderer;
            const canvas = renderer?.domElement;
            if (!renderer || !canvas || canvases.has(canvas)) return;
            canvases.add(canvas);
            renderers.push(renderer);
        });
        return renderers;
    }

    function patchViewportComposer(preview) {
        if (!preview?.renderer || typeof preview.render !== 'function') return;
        if (window.LightflowFramePipeline?.disposed === false) {
            window.LightflowFramePipeline.patchPreview?.(preview);
            return;
        }
        const existingState = VIEWPORT_COMPOSER_STATE.get(preview);
        if (existingState && !existingState.wrapperDetached) return;
        const originalRender = preview.render;
        const patchedRender = function lightflowSceneComposerRender() {
            const result = originalRender.apply(this, arguments);
            scheduleViewportComposer(this);
            return result;
        };
        const state = getViewportComposerState(preview);
        if (!state) return;
        state.originalRender = originalRender;
        state.patchedRender = patchedRender;
        state.wrapperDetached = false;
        preview.render = patchedRender;
    }

    function scheduleViewportComposer(preview) {
        const state = getViewportComposerState(preview);
        if (!state || state.scheduled) return;
        state.scheduled = true;
        const scheduledRevision = sceneComposerRevision;
        const scheduledProject = window.Project || null;
        const run = () => {
            state.scheduled = false;
            if (state.disposed) return;
            if (scheduledRevision !== sceneComposerRevision || scheduledProject !== (window.Project || null)) return;
            const activePreview = getPreview();
            if (activePreview && preview !== activePreview) return;
            renderViewportComposer(preview);
        };
        // A microtask runs after every synchronous preview wrapper (including
        // AO and Atmosphere) but before the browser presents the frame. This
        // avoids both the old AO load-order race and a one-frame Bloom lag.
        if (typeof queueMicrotask === 'function') {
            queueMicrotask(run);
        } else if (typeof Promise !== 'undefined') {
            Promise.resolve().then(run);
        } else {
            setTimeout(run, 0);
        }
    }

    function patchAllViewportComposers() {
        if (window.LightflowFramePipeline?.disposed === false) {
            attachViewportComposerToFramePipeline();
            return;
        }
        collectStudioRenderPreviews().forEach(patchViewportComposer);
    }

    function attachViewportComposerToFramePipeline() {
        if (framePipelineRegistration || window.LightflowFramePipeline?.disposed !== false) return;
        const registerResource = (name, descriptor) => {
            const registration = window.LightflowFramePipeline.registerResource?.(name, descriptor);
            if (registration) framePipelineResources.push(registration);
        };
        registerResource('viewportComposerBeauty', {
            owner: 'studio_viewport', format: 'rgba8', scale: 1
        });
        registerResource('viewportBloomSource', {
            owner: 'studio_viewport', format: 'rgba16f', scale: 0.5
        });
        for (let index = 1; index <= 5; index++) {
            registerResource(`viewportBloomDown${index}`, {
                owner: 'studio_viewport',
                format: 'rgba16f',
                scale: Math.pow(0.5, index + 1)
            });
            registerResource(`viewportBloomUp${index - 1}`, {
                owner: 'studio_viewport',
                format: 'rgba16f',
                scale: Math.pow(0.5, index)
            });
        }
        const bloomActive = () => !!(
            currentSettings.viewport_bloom_enabled &&
            studioBloomHasVisibleContribution(resolveBloomSettings(currentSettings))
        );
        const gradingActive = () => !!currentSettings.color_grading_enabled;
        framePipelineRegistration = window.LightflowFramePipeline.registerPass?.('viewport_composer', {
            priority: 300,
            reads: ['framebuffer'],
            dynamicReads: () => bloomActive()
                ? ['sceneColor', 'sceneDepth', 'sceneEmission']
                : [],
            writes: ['framebuffer'],
            dynamicWrites: () => [
                ...(gradingActive() ? ['viewportComposerBeauty'] : []),
                ...(bloomActive() ? [
                    'viewportBloomSource',
                    'viewportBloomDown1', 'viewportBloomDown2', 'viewportBloomDown3',
                    'viewportBloomDown4', 'viewportBloomDown5',
                    'viewportBloomUp0', 'viewportBloomUp1', 'viewportBloomUp2',
                    'viewportBloomUp3', 'viewportBloomUp4'
                ] : [])
            ],
            dependsOn: ['rendercraft_rim', 'atmosphere'],
            enabled: preview => !!(
                preview &&
                !preview.sa_studio_render_active &&
                !window.LightManagerStudioRenderSession &&
                isLightflowRenderMode() &&
                (
                    bloomActive() || gradingActive()
                )
            ),
            execute: preview => renderViewportComposer(preview)
        }) || null;
    }

    function detachViewportComposerFromFramePipeline() {
        framePipelineRegistration?.delete?.();
        framePipelineRegistration = null;
        framePipelineResources.forEach(registration => registration?.delete?.());
        framePipelineResources = [];
    }

    function estimateViewportTargetBytes(target) {
        if (!target) return 0;
        const textureCount = Array.isArray(target.texture) ? target.texture.length : 1;
        const type = Array.isArray(target.texture) ? target.texture[0]?.type : target.texture?.type;
        const bytesPerChannel = type === THREE.FloatType ? 4 : (type === THREE.HalfFloatType ? 2 : 1);
        const colorBytes = Math.max(1, target.width || 1) * Math.max(1, target.height || 1) * 4 * bytesPerChannel * textureCount;
        const depthBytes = target.depthBuffer ? Math.max(1, target.width || 1) * Math.max(1, target.height || 1) * 4 : 0;
        return colorBytes + depthBytes;
    }

    function releaseViewportComposerResources(state) {
        if (!state) return;
        state.maskTarget?.dispose?.();
        state.beautyTarget?.dispose?.();
        state.compositeMaterial?.dispose?.();
        state.postGeometry?.dispose?.();
        state.maskTarget = null;
        state.beautyTarget = null;
        state.compositeMaterial = null;
        state.postGeometry = null;
        state.postQuad = null;
        state.postScene = null;
        state.postCamera = null;
        state.sharedBeautyTexture = null;
        state.sharedEmissionTexture = null;
        state.maskIsBlack = false;
        state.rendering = false;
    }

    function pruneViewportComposers(activePreviews = collectStudioRenderPreviews()) {
        const active = activePreviews instanceof Set
            ? activePreviews
            : new Set(activePreviews || []);
        VIEWPORT_COMPOSER_STATE.forEach((state, preview) => {
            if (active.has(preview)) return;
            if (preview?.render === state.patchedRender) preview.render = state.originalRender;
            releaseViewportComposerResources(state);
            state.disposed = true;
            VIEWPORT_COMPOSER_STATE.delete(preview);
        });
    }

    function getStudioResourceDiagnostics() {
        let renderTargets = 0;
        let estimatedBytes = 0;
        VIEWPORT_COMPOSER_STATE.forEach(state => {
            [state.maskTarget, state.beautyTarget].forEach(target => {
                if (!target) return;
                renderTargets += 1;
                estimatedBytes += estimateViewportTargetBytes(target);
            });
        });
        const bloomPipelines = Array.from(BLOOM_PIPELINE_INSTANCES).filter(pipeline => !pipeline.disposed);
        const latestBloom = bloomPipelines
            .map(pipeline => pipeline.lastDiagnostics)
            .filter(Boolean)
            .sort((left, right) => (right.estimatedBytes || 0) - (left.estimatedBytes || 0))[0] || null;
        const bloomEstimatedBytes = bloomPipelines.reduce(
            (sum, pipeline) => sum + pipeline.estimateBytes(),
            0
        );
        const bloomTargetCount = bloomPipelines.reduce(
            (sum, pipeline) => sum + pipeline.getActiveTargets().length,
            0
        );
        return {
            bloomPipeline: 'native-mip-progressive-v3',
            bloomSourceMode: latestBloom?.sourceMode || 'inactive',
            bloomWorkingFormat: latestBloom?.workingFormat || 'unallocated',
            bloomInitialScale: latestBloom?.initialScale || 0,
            bloomExtractPasses: latestBloom?.sourcePasses || (latestBloom ? 1 : 0),
            bloomLevels: latestBloom?.plan?.length || 0,
            bloomDownsampleKernel: latestBloom?.downsampleKernel || 'none',
            bloomUpsampleKernel: latestBloom?.upsampleKernel || 'none',
            bloomActiveTargets: bloomTargetCount,
            bloomEstimatedBytes,
            bloomExtraGeometrySubmissions: latestBloom?.extraGeometrySubmissions || 0,
            bloomDrawCalls: latestBloom?.drawCalls || 0,
            bloomTargetSwitches: latestBloom?.targetSwitches || 0,
            studioBloomSourceResolution: latestBloom?.studioSourceResolution || null,
            bloomDerivedMaterials: BLOOM_MASK_STATE.derivedResources.size,
            pluginResources: BLOOM_MASK_STATE.resources.size,
            viewportComposerStates: VIEWPORT_COMPOSER_STATE.size,
            viewportComposerRenderTargets: renderTargets,
            viewportComposerEstimatedBytes: estimatedBytes,
            studioAccumulationMode: lastStudioAccumulationMode,
            studioAccumulatorBytes: activeStudioAccumulatorBytes,
            ownedPreview: !!studioRenderPreviewOwner.preview,
            ownedPreviewFamily: studioRenderPreviewOwner.familyKey || null,
            ownedPreviewGeneration: studioRenderPreviewOwner.generation,
            ownedPreviewCreated: studioRenderPreviewOwner.created,
            ownedPreviewRetired: studioRenderPreviewOwner.retired,
            ownedPreviewLastRetireReason: studioRenderPreviewOwner.lastRetireReason || null,
            ownedPreviewPrograms: studioRenderPreviewOwner.preview?.renderer?.info?.programs?.length || 0,
            ownedPreviewContextLost: isStudioPreviewContextLost(studioRenderPreviewOwner.preview)
        };
    }

    function resetSceneComposerLifecycle() {
        sceneComposerRevision += 1;
        if (typeof sceneComposerRefreshFrame === 'number' && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(sceneComposerRefreshFrame);
        }
        sceneComposerRefreshFrame = null;
        disposeBloomDerivedResources();
        pruneViewportComposers();
        VIEWPORT_COMPOSER_STATE.forEach(state => {
            state.scheduled = false;
            releaseViewportComposerResources(state);
        });
    }

    function detachViewportComposerWrappers() {
        VIEWPORT_COMPOSER_STATE.forEach((state, preview) => {
            if (preview?.render !== state.patchedRender) return;
            preview.render = state.originalRender;
            state.wrapperDetached = true;
        });
    }

    function disposeViewportComposers() {
        VIEWPORT_COMPOSER_STATE.forEach((state, preview) => {
            if (preview?.render === state.patchedRender) preview.render = state.originalRender;
            state.disposed = true;
            releaseViewportComposerResources(state);
        });
        VIEWPORT_COMPOSER_STATE.clear();
    }

    async function exportPngBlob(blob, name, type) {
        /*
         * Blockbench desktop expects image exports as data URLs. A binary
         * Buffer/Uint8Array export may silently return without opening the
         * native save dialog, so keep the proven savetype "image" route.
         */
        const dataUrl = await blobToDataUrl(blob);
        if (!dataUrl || !dataUrl.startsWith('data:image/png')) {
            throw new Error('Studio Render could not prepare a valid PNG for export.');
        }
        Blockbench.export({
            resource_id: 'studio_render',
            extensions: ['png'],
            type,
            savetype: 'image',
            name,
            content: dataUrl
        });
        return dataUrl;
    }

    async function deliverRender(imageBlob, size, settings) {
        const name = settings.file_name.replace(/[\\/:*?"<>|]+/g, '_') || DEFAULT_SETTINGS.file_name;
        if (settings.destination === 'save') {
            await exportPngBlob(imageBlob, name, translate('data.image', 'Image'));
        } else if (settings.destination === 'clipboard') {
            await copyImageToClipboard(imageBlob);
        } else {
            // Blockbench image codecs and screenshot preview reliably consume
            // data URLs, while blob: URLs can be rejected by Electron.
            const dataUrl = await blobToDataUrl(imageBlob);
            if (settings.destination === 'texture' && window.Codecs?.image) {
                Codecs.image.load(dataUrl, '', [size.width, size.height]);
                if (Texture.all[0]) Texture.all[0].name = name;
            } else if (window.Screencam?.returnScreenshot) {
                Screencam.returnScreenshot(dataUrl);
            } else {
                Blockbench.export({
                    resource_id: 'studio_render',
                    extensions: ['png'],
                    type: 'PNG Image',
                    savetype: 'image',
                    name,
                    content: dataUrl
                });
            }
        }
        Blockbench.showQuickMessage(translate('studio_render.message.rendered', 'Studio render complete'));
    }

    function waitForStudioContextRestore(renderer, timeoutMs = 8000) {
        const gl = getRendererContext(renderer);
        if (!gl?.isContextLost?.()) return Promise.resolve(true);
        const canvas = renderer?.domElement;
        if (!canvas?.addEventListener) return Promise.resolve(false);
        return new Promise(resolve => {
            let settled = false;
            let timer = null;
            const finish = value => {
                if (settled) return;
                settled = true;
                canvas.removeEventListener('webglcontextrestored', onRestored, false);
                if (timer !== null) clearTimeout(timer);
                resolve(value);
            };
            const onRestored = () => finish(true);
            canvas.addEventListener('webglcontextrestored', onRestored, false);
            timer = setTimeout(() => finish(false), Math.max(250, Number(timeoutMs) || 8000));
        });
    }

    async function waitForAllStudioContextRestores(timeoutMs = 10000) {
        const renderers = collectStudioRenderRenderers();
        if (!renderers.length) return true;
        const results = await Promise.all(renderers.map(renderer => (
            waitForStudioContextRestore(renderer, timeoutMs)
        )));
        const restored = results.every(Boolean);
        // Three rebuilds renderer internals synchronously from its restored event,
        // but Lightflow/Blockbench managers repaint from RAF/microtask callbacks.
        // Do not release Studio ownership into that same event turn.
        if (restored) {
            await waitForFrame();
            await waitForFrame();
        }
        return restored;
    }

    function attachStudioContextMonitor(session) {
        if (!session) return;
        session.contextListeners = [];
        collectStudioRenderRenderers().forEach(renderer => {
            const canvas = renderer?.domElement;
            if (!canvas?.addEventListener) return;
            const onLost = event => {
                const preview = canvas.preview || null;
                if (preview?.sa_studio_intentional_context_retire) return;
                const studioRendererLost = renderer === session.renderRenderer;
                const statusMessage = event?.statusMessage || '';
                session.anyContextLost = true;
                session.contextLossCount = (session.contextLossCount || 0) + 1;
                if (statusMessage) session.contextStatusMessages.push(statusMessage);
                if (studioRendererLost) {
                    session.studioContextLost = true;
                    if (!session.tileSafetyDowngraded) {
                        session.tileSafetyDowngraded = true;
                        recordStudioTileSafetyFailure(session.renderRenderer, session);
                    }
                }
                if (window.LightflowStudioRenderDiagnostics) {
                    window.LightflowStudioRenderDiagnostics.anyContextLost = true;
                    window.LightflowStudioRenderDiagnostics.contextLost = !!session.studioContextLost;
                    window.LightflowStudioRenderDiagnostics.contextLossCount = session.contextLossCount;
                    window.LightflowStudioRenderDiagnostics.contextStatusMessages = session.contextStatusMessages.slice();
                    if (studioRendererLost) {
                        window.LightflowStudioRenderDiagnostics.tileSafetyOutcome = 'context_lost';
                    }
                }
            };
            const onRestored = () => {
                session.contextRestoreCount = (session.contextRestoreCount || 0) + 1;
                if (window.LightflowStudioRenderDiagnostics) {
                    window.LightflowStudioRenderDiagnostics.contextRestoreCount = session.contextRestoreCount;
                }
            };
            canvas.addEventListener('webglcontextlost', onLost, false);
            canvas.addEventListener('webglcontextrestored', onRestored, false);
            session.contextListeners.push({ canvas, onLost, onRestored });
        });
    }

    function detachStudioContextMonitor(session) {
        (session?.contextListeners || []).forEach(record => {
            try { record.canvas.removeEventListener('webglcontextlost', record.onLost, false); } catch (error) {}
            try { record.canvas.removeEventListener('webglcontextrestored', record.onRestored, false); } catch (error) {}
        });
        if (session) session.contextListeners = [];
    }

    async function renderWithSettings(inputSettings, options = {}) {
        const sourcePreview = getPreview();
        if (!sourcePreview) {
            Blockbench.showQuickMessage(translate('studio_render.message.no_preview', 'No preview is available to render.'));
            return;
        }

        const normalized = normalizeForm(inputSettings);
        if (options.save !== false) {
            saveSettings(normalized);
        } else {
            currentSettings = Object.assign({}, normalized);
        }
        const bloomSettings = resolveBloomSettings(normalized);
        const anglePreset = getAnglePreset(normalized.angle_preset);
        const frameRect = normalized.capture_area === 'frame' && !anglePreset
            ? getFrameRectForPreview(sourcePreview, normalized, options.frameState)
            : null;
        const outputSize = computeOutputSize(normalized, frameRect);

        if (!validateOutputSize(outputSize)) {
            Blockbench.showMessageBox({
                title: translate('studio_render.plugin.title', 'Studio Render'),
                message: translate('studio_render.message.too_large', 'The requested output is too large for a safe browser canvas.'),
                icon: 'broken_image'
            });
            return;
        }

        if (activeRenderSession || window.LightManagerStudioRenderSession) {
            Blockbench.showQuickMessage(translate(
                'studio_render.message.render_in_progress',
                'A Studio Render session is already in progress.'
            ));
            return;
        }

        const renderFamilyKey = getStudioRendererFamilyKey();
        const renderPreview = acquireOwnedStudioRenderPreview(renderFamilyKey);
        if (!renderPreview) {
            Blockbench.showQuickMessage(translate('studio_render.message.no_offscreen', 'Blockbench offscreen preview is not ready yet. Open a preview once and try again.'));
            return;
        }

        const sampleCount = clamp(parseInt(normalized.samples, 10) || 1, 1, 8);
        const rasterScale = 1;
        Blockbench.setStatusBarText(translate('studio_render.status.preparing', 'Preparing studio render...'));
        Blockbench.setProgress(0);
        const blockbenchShading = window.settings && window.settings.shading;
        const oldShading = blockbenchShading ? blockbenchShading.value : undefined;
        const previousState = capturePreviewState(renderPreview);
        const gpuProfile = getGpuProfile(renderPreview.renderer);
        const renderSession = {
            startedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
            cancelled: false,
            lightManagerPrepared: false,
            lightingPrepared: false,
            shadowMapPrimed: false,
            shaderBakeVisible: false,
            preserveSurfaceDetail: false,
            studioContextLost: false,
            anyContextLost: false,
            contextLossCount: 0,
            contextRestoreCount: 0,
            contextStatusMessages: [],
            contextListeners: [],
            gpuFenceCount: 0,
            maxGpuFenceMs: 0,
            tileSize: 0,
            tileCount: 0,
            sampleCount,
            workloadClass: getStudioWorkloadClass(),
            heavyLightflowSession: false,
            renderPreview,
            renderRenderer: renderPreview.renderer,
            renderFamilyKey,
            renderPreviewGeneration: renderPreview.sa_studio_renderer_generation || 0,
            tileSafetyDowngraded: false
        };
        renderSession.billboardSnapshots = captureStudioRenderBillboards();
        renderSession.heavyLightflowSession = isStudioHeavyWorkloadClass(renderSession.workloadClass);
        // Reserve the session before the first await. Otherwise two invocations
        // in the same animation-frame gap can both pass the active-session guard.
        activeRenderSession = renderSession;
        if (options.silent !== true && sourcePreview?.node) {
            const node = document.createElement('div');
            node.className = 'lightflow_render_progress';
            const label = document.createElement('span');
            label.setAttribute('role', 'status');
            label.setAttribute('aria-live', 'polite');
            label.textContent = translate('studio_render.status.preparing', 'Preparing studio render…');
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.textContent = translate('studio_render.workflow.cancel', 'Cancel render');
            cancel.addEventListener('click', () => {
                renderSession.cancelled = true;
                renderSession.cancelReason = 'ui_cancel';
                cancel.disabled = true;
                label.textContent = translate('studio_render.workflow.cancelling', 'Cancelling; restoring the scene…');
            });
            node.append(label, cancel);
            sourcePreview.node.append(node);
            renderSession.progressUI = {node, label};
        }
        let renderResult = null;
        let frameConsumed = false;
        const cancelledRenderResult = () => (renderResult = {
            ok: false,
            cancelled: true,
            cancelReason: renderSession.cancelReason || 'cancelled',
            delivered: false,
            consumed: frameConsumed,
            width: outputSize.width,
            height: outputSize.height,
            samples: sampleCount,
            tileSize: renderSession.tileSize,
            tileCount: renderSession.tileCount,
            imageBytes: null
        });
        let canvas = null;
        let ctx = null;
        let bloomMaskCanvas = null;
        let bloomMaskContext = null;
        let studioBloomPipeline = null;
        let studioBloomSession = null;
        let studioBloomGpuEnabled = false;
        const studioBloomProfile = STUDIO_BLOOM_PROFILE;
        window.LightflowStudioRenderDiagnostics = {
            active: true,
            postQualityContract: STUDIO_POST_QUALITY_CONTRACT.version,
            ambientOcclusion: null,
            aoQualityTarget: STUDIO_POST_QUALITY_CONTRACT.ambientOcclusion.quality,
            aoScaleTarget: STUDIO_POST_QUALITY_CONTRACT.ambientOcclusion.scale,
            aoEffectiveSPPTarget: STUDIO_POST_QUALITY_CONTRACT.ambientOcclusion.effectiveSPP,
            aoQualityForced: false,
            bloomPipeline: 'native-mip-progressive-v3',
            bloomRequestedQuality: String(normalized.viewport_bloom_quality || 'adaptive'),
            bloomRuntimeQuality: studioBloomProfile.quality,
            bloomQualityForced: true,
            bloomProfile: {
                scale: studioBloomProfile.scale,
                maxLevels: studioBloomProfile.maxLevels,
                minMipSize: studioBloomProfile.minMipSize,
                downsampleKernel: studioBloomProfile.downsampleKernel,
                upsampleKernel: studioBloomProfile.upsampleKernel,
                maxDimension: studioBloomProfile.maxDimension
            },
            bloomCpuFallbackProfile: {
                maxDimension: 4096,
                divisors: CPU_FALLBACK_BLOOM_DIVISORS.slice()
            },
            bloomSourceMode: 'disabled',
            bloomWorkingFormat: 'unallocated',
            bloomInitialScale: 0,
            bloomLevels: 0,
            bloomDownsampleKernel: 'none',
            bloomUpsampleKernel: 'none',
            bloomActiveTargets: 0,
            bloomEstimatedBytes: 0,
            bloomExtraGeometrySubmissions: 0,
            bloomDrawCalls: 0,
            bloomTargetSwitches: 0,
            studioBloomSourceResolution: [0, 0],
            outputWidth: outputSize.width,
            outputHeight: outputSize.height,
            samples: sampleCount,
            tileSize: 0,
            tileCount: 0,
            accumulationMode: '',
            contextLost: false,
            anyContextLost: false,
            contextLossCount: 0,
            contextRestoreCount: 0,
            contextStatusMessages: [],
            gpuFenceCount: 0,
            maxGpuFenceMs: 0,
            gpuAccumulatorEnabled: false,
            gpuFenceCadence: 0,
            shaderPrepareMs: 0,
            shaderPrepareProgramDelta: 0,
            shaderPrepareResult: null,
            tileRenderMs: 0,
            finalCompositeMs: 0,
            encodeMs: 0,
            totalMs: 0,
            workloadClass: renderSession.workloadClass,
            adaptiveTileTarget: renderSession.heavyLightflowSession
                ? getAdaptiveStudioHeavyTileTarget(renderPreview.renderer, sampleCount, renderSession.workloadClass)
                : null,
            renderPreviewOwned: true,
            renderPreviewFamily: renderFamilyKey,
            renderPreviewGeneration: renderSession.renderPreviewGeneration,
            tileSafetyOutcome: 'pending'
        };
        try {
            // Keep all post-reservation work inside the guarded lifetime. Even UI
            // guidance can throw through host/plugin integrations; the finally
            // below must always own cleanup once activeRenderSession is reserved.
            // Diagnostic/Test Lab renders are intentionally silent and must never
            // show a misleading "GPU unknown" modal after a poisoned context.
            if (options.silent !== true) showGpuGuidanceIfNeeded(gpuProfile);

            // Claim exclusive Studio ownership before preflight or shader
            // preparation. Those phases can await for many frames and must not
            // race the main preview warm-up/shadow pipeline.
            claimStudioRenderFlags(renderSession, renderPreview);
            attachStudioContextMonitor(renderSession);

            // Let the click/progress feedback paint only after the session has
            // been reserved. Canvas allocation can be large and must not reopen
            // the double-start race while yielding to requestAnimationFrame.
            await waitForFrame();
            if (renderSession.cancelled) return cancelledRenderResult();
            ({ canvas, ctx } = prepareFinalCanvas(outputSize, normalized));

            const studioGl = getRendererContext(renderPreview.renderer);
            if (!studioGl) {
                throw new Error('Studio Render preflight failed: WebGL context unavailable.');
            }
            if (studioGl.isContextLost?.()) {
                throw new Error('Studio Render preflight failed: offscreen WebGL context is already lost.');
            }
            beginStudioWebGLErrorScope(renderPreview.renderer);
            assertStudioWebGLHealthy(renderPreview.renderer, 'preflight', renderSession);

            if (blockbenchShading && blockbenchShading.value !== normalized.shading) {
                blockbenchShading.set(normalized.shading);
            }

            let cameraSourcePreview = sourcePreview;
            if (anglePreset) {
                renderPreview.loadAnglePreset(anglePreset);
                cameraSourcePreview = snapshotCameraSource(renderPreview, outputSize.width, outputSize.height);
            }

            const tileSize = resolveTileSize(normalized, renderPreview.renderer, rasterScale, sampleCount);
            const tiles = buildTileList(outputSize, rasterScale, tileSize, cameraSourcePreview, normalized, frameRect);
            renderSession.tileSize = tileSize;
            renderSession.tileCount = tiles.length;
            if (window.LightflowStudioRenderDiagnostics) {
                window.LightflowStudioRenderDiagnostics.tileSize = tileSize;
                window.LightflowStudioRenderDiagnostics.tileCount = tiles.length;
            }
            if (studioBloomHasVisibleContribution(bloomSettings)) {
                const rendererCapabilities = window.LightflowRenderer?.getCapabilities?.(
                    renderPreview.renderer,
                    { probeHalfFloat: true }
                ) || null;
                const mrtAvailable = !!(
                    renderPreview.renderer?.capabilities?.isWebGL2 &&
                    Number(rendererCapabilities?.maxDrawBuffers) >= 3 &&
                    Number(rendererCapabilities?.maxColorAttachments) >= 3 &&
                    typeof window.LightflowRenderer?.renderExternal === 'function'
                );
                if (mrtAvailable) {
                    studioBloomPipeline = getLightflowBloomPipeline(renderPreview);
                    studioBloomSession = studioBloomPipeline?.beginStudio(
                        renderPreview,
                        outputSize,
                        bloomSettings,
                        studioBloomProfile
                    ) || null;
                    studioBloomGpuEnabled = !!studioBloomSession;
                }
                if (!studioBloomGpuEnabled) {
                    bloomMaskCanvas = createCanvas(outputSize.width, outputSize.height);
                    bloomMaskContext = bloomMaskCanvas.getContext('2d', { alpha: true });
                }
                if (window.LightflowStudioRenderDiagnostics) {
                    window.LightflowStudioRenderDiagnostics.bloomSourceMode = studioBloomGpuEnabled
                        ? 'mrt'
                        : 'cpu_fallback';
                    window.LightflowStudioRenderDiagnostics.bloomWorkingFormat = studioBloomPipeline?.useHalfFloat
                        ? 'rgba16f_linear'
                        : (studioBloomGpuEnabled ? 'rgba8_linear_clamped' : 'canvas2d_encoded');
                    window.LightflowStudioRenderDiagnostics.bloomInitialScale = studioBloomSession?.scale || 0;
                    window.LightflowStudioRenderDiagnostics.studioBloomSourceResolution = studioBloomSession
                        ? [studioBloomSession.width, studioBloomSession.height]
                        : [outputSize.width, outputSize.height];
                }
            }
            const sampleJitters = getStudioSampleJitters(sampleCount);
            StudioRenderFrame.prepareTileProgress(tiles, outputSize, normalized);

            Blockbench.setStatusBarText(
                translate('studio_render.status.preparing', 'Preparing studio render...') +
                ' - ' +
                getGpuClassLabel(gpuProfile)
            );
            Blockbench.setProgress(0);

            if (typeof window.ShaderArchitectBeginStudioRenderBake === 'function') {
                renderSession.shaderBakeVisible =
                    window.ShaderArchitectBeginStudioRenderBake(renderPreview) === true;
                if (renderSession.shaderBakeVisible) {
                    // Paint the panel before the exact offscreen renderer links.
                    await waitForFrame();
                    await waitForFrame();
                    if (renderSession.cancelled) return cancelledRenderResult();
                }
            }

            // Studio owns a different WebGLRenderer/context, so viewport programs are
            // not reusable here. Compile that context explicitly before tile timing;
            // otherwise the first tile/fence misleadingly absorbs 20-60 seconds of
            // cold shader linking and a compile failure is discovered halfway through
            // an image instead of during preparation.
            if (typeof window.ShaderArchitectPrepareStudioRenderer === 'function') {
                const shaderPrepareStartedAt = typeof performance !== 'undefined'
                    ? performance.now()
                    : Date.now();
                const prepareResult = await window.ShaderArchitectPrepareStudioRenderer(
                    renderPreview,
                    {
                        targetRenderMode: window.ShaderEngine?.globalRenderMode || '',
                        isTaskValid: () => !renderSession.cancelled
                    }
                );
                const shaderPrepareFinishedAt = typeof performance !== 'undefined'
                    ? performance.now()
                    : Date.now();
                if (renderSession.cancelled) return cancelledRenderResult();
                if (window.LightflowStudioRenderDiagnostics) {
                    window.LightflowStudioRenderDiagnostics.shaderPrepareMs = Math.max(
                        0,
                        shaderPrepareFinishedAt - shaderPrepareStartedAt
                    );
                    window.LightflowStudioRenderDiagnostics.shaderPrepareProgramDelta =
                        Number(prepareResult?.programDelta) || 0;
                    window.LightflowStudioRenderDiagnostics.shaderPrepareResult = prepareResult || null;
                }
                if (prepareResult && prepareResult.success === false) {
                    throw new Error(
                        `Studio shader preparation failed: ${prepareResult.reason || 'unknown warm-up failure'}`
                    );
                }
            }

            /*
             * Shader Architect may rebuild or pool materials during the bake.
             * Synchronize the newly active materials even when the global scale
             * already equals the physical raster scale, then inspect the
             * post-bake scene. Samples are camera jitters, not a linear
             * framebuffer multiplier.
             */
            window.ShaderArchitectSetStudioRenderSampleScale?.(
                rasterScale,
                Math.max(1.0, Number(tiles[0]?.promotionalRimFrameScale) || 1.0),
                0
            );
            renderSession.preserveSurfaceDetail = sceneUsesStudioSurfaceDetail();

            const renderTiles = async () => {
                for (let index = 0; index < tiles.length; index++) {
                    if (renderSession.cancelled) return;
                    const tile = tiles[index];
                    StudioRenderFrame.setTileProgress(index, 'rendering');
                    Blockbench.setStatusBarText(
                        translate('studio_render.status.tile', 'Rendering tile') + ' ' + (index + 1) + ' / ' + tiles.length
                    );
                    renderPreview.sa_studio_render_manual_silhouette = true;
                    renderPreview.sa_studio_render_active = true;
                    const accumulationWidth = Math.max(
                        1,
                        Number(tile.renderWidth || tile.sampleWidth) || 1
                    );
                    const accumulationHeight = Math.max(
                        1,
                        Number(tile.renderHeight || tile.sampleHeight) || 1
                    );
                    // Phase 1.6: the Phase 1.5 CPU Float32 accumulator proved
                    // stable, but a 4K x8 render spent enormous time doing
                    // getImageData + per-pixel JS conversion for every sample.
                    // Dedicated WebGL2 GPUs now use a single-target additive
                    // RGBA16F accumulator (sample / N), under exclusive Studio
                    // ownership and explicit GPU backpressure.
                    // Integrated/software paths retain the conservative CPU fallback.
                    const useGpuAccumulator = shouldUseStudioGpuAccumulator(
                        renderPreview.renderer,
                        sampleCount
                    );
                    const gpuAccumulator = useGpuAccumulator
                        ? createStudioGpuAccumulator(
                            renderPreview.renderer,
                            accumulationWidth,
                            accumulationHeight,
                            false,
                            sampleCount
                        )
                        : null;
                    gpuAccumulator?.primePrograms?.();
                    const gpuSampleTexture = gpuAccumulator
                        ? new THREE.CanvasTexture(renderPreview.canvas)
                        : null;
                    if (gpuSampleTexture) {
                        gpuSampleTexture.generateMipmaps = false;
                        gpuSampleTexture.minFilter = THREE.LinearFilter;
                        gpuSampleTexture.magFilter = THREE.LinearFilter;
                    }
                    const linearAccumulator = sampleCount > 1 && !gpuAccumulator
                        ? createStudioCpuLinearAccumulator(
                            accumulationWidth,
                            accumulationHeight
                        )
                        : null;
                    const accumulationCanvas = gpuAccumulator || linearAccumulator
                        ? null
                        : createCanvas(accumulationWidth, accumulationHeight);
                    const accumulationContext = accumulationCanvas?.getContext('2d', {
                        alpha: true
                    }) || null;
                    accumulationContext?.clearRect(
                        0,
                        0,
                        accumulationWidth,
                        accumulationHeight
                    );
                    if (!gpuAccumulator && !linearAccumulator) {
                        lastStudioAccumulationMode = 'direct_single_sample';
                    }
                    if (window.LightflowStudioRenderDiagnostics) {
                        window.LightflowStudioRenderDiagnostics.accumulationMode = lastStudioAccumulationMode;
                        window.LightflowStudioRenderDiagnostics.gpuAccumulatorEnabled = !!gpuAccumulator;
                        window.LightflowStudioRenderDiagnostics.gpuFenceCadence = gpuAccumulator ? 1 : 0;
                    }
                    try {
                        for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
                            if (renderSession.cancelled) return;
                            prepareRendererForTile(
                                renderPreview,
                                cameraSourcePreview,
                                normalized,
                                tile,
                                renderSession,
                                sampleJitters[sampleIndex],
                                sampleIndex
                            );
                            synchronizeStudioRenderLighting(renderPreview, renderSession);
                            if (index === 0 && sampleIndex === 0 && !renderSession.preserveSurfaceDetail) {
                                renderSession.preserveSurfaceDetail = sceneUsesStudioSurfaceDetail();
                            }

                            beginStudioWebGLErrorScope(renderPreview.renderer);
                            renderPreviewWithExactCameraPose(renderPreview, studioBloomGpuEnabled ? {
                                requiredResources: ['sceneColor', 'sceneDepth', 'sceneEmission'],
                                onFrameResources: resources => {
                                    studioBloomSession.captureSample(
                                        resources,
                                        tile,
                                        sampleIndex,
                                        sampleCount
                                    );
                                }
                            } : {});
                            freezeStudioShadowMapAfterFirstTile(renderPreview, renderSession);
                            compositeStudioRenderPostEffects(
                                renderPreview,
                                normalized,
                                tile,
                                null
                            );
                            assertStudioWebGLHealthy(
                                renderPreview.renderer,
                                `tile ${index + 1}/${tiles.length} sample ${sampleIndex + 1}/${sampleCount}`,
                                renderSession
                            );
                            if (index === 0 && sampleIndex === 0 && renderSession.shaderBakeVisible) {
                                window.ShaderArchitectFinishStudioRenderBake?.(true);
                                renderSession.shaderBakeVisible = false;
                            }

                            if (gpuAccumulator && gpuSampleTexture) {
                                // GPU command ordering guarantees that the canvas
                                // sample precedes this upload/accumulation pass. Keep
                                // the running average in RGBA16F and quantize only once
                                // when the tile resolves.
                                gpuSampleTexture.needsUpdate = true;
                                gpuAccumulator.accumulate(sampleIndex, gpuSampleTexture);
                            } else {
                                // CPU readback must wait for the beauty pass to finish;
                                // this remains the conservative fallback for iGPUs and
                                // contexts without a proven half-float framebuffer.
                                await requireStudioGpuFence(renderPreview.renderer, renderSession);
                                if (renderSession.cancelled) return;
                                if (linearAccumulator) {
                                    await linearAccumulator.accumulate(sampleIndex, renderPreview.canvas);
                                    if (renderSession.cancelled) return;
                                } else if (accumulationContext) {
                                    accumulationContext.save();
                                    accumulationContext.globalCompositeOperation = 'copy';
                                    accumulationContext.globalAlpha = 1;
                                    accumulationContext.drawImage(renderPreview.canvas, 0, 0);
                                    accumulationContext.restore();
                                }
                            }

                            if (bloomMaskContext) {
                                bloomMaskContext.save();
                                bloomMaskContext.globalCompositeOperation = 'lighter';
                                bloomMaskContext.globalAlpha = 1 / sampleCount;
                                renderBloomMaskTileFallback(
                                    renderPreview,
                                    bloomMaskContext,
                                    tile,
                                    rasterScale,
                                    renderSession
                                );
                                bloomMaskContext.restore();
                            }

                            // One fence for the complete GPU sample is enough.
                            // Phase 1.5 fenced beauty and bloom separately (576 fences
                            // in the user's 4K x8 run). A dedicated 2048px 4K render
                            // needs only 4*8 = 32 sample fences (+ one resolve fence
                            // per tile) while still bounding queue depth to one sample.
                            if (gpuAccumulator) {
                                await requireStudioGpuFence(renderPreview.renderer, renderSession);
                            } else if (bloomMaskContext) {
                                await requireStudioGpuFence(renderPreview.renderer, renderSession);
                            }
                            if (renderSession.cancelled) return;

                            const completedSamples = index * sampleCount + sampleIndex + 1;
                            const totalSamples = Math.max(1, tiles.length * sampleCount);
                            Blockbench.setProgress(completedSamples / totalSamples);
                            if (renderSession.progressUI && !renderSession.cancelled) renderSession.progressUI.label.textContent = `${Math.round(completedSamples / totalSamples * 100)}% · ${outputSize.width} × ${outputSize.height} px`;
                        }
                        let resolvedTileCanvas = accumulationCanvas || renderPreview.canvas;
                        if (gpuAccumulator) {
                            gpuAccumulator.resolveToCanvas(index * 131 + sampleCount * 17);
                            await requireStudioGpuFence(renderPreview.renderer, renderSession);
                            if (renderSession.cancelled) return;
                            resolvedTileCanvas = renderPreview.canvas;
                        } else if (linearAccumulator) {
                            resolvedTileCanvas = linearAccumulator.resolveToCanvas(
                                index * 131 + sampleCount * 17
                            );
                        }
                        drawTile(
                            ctx,
                            renderPreview,
                            tile,
                            rasterScale,
                            false,
                            resolvedTileCanvas
                        );
                    } finally {
                        // A lost context has already invalidated every GPU object.
                        // Calling Three .dispose() after ANGLE restored a replacement
                        // context emits "object does not belong to this context" and
                        // can contaminate the next diagnostic render. Abandon those
                        // handles; the lost context owns their destruction.
                        if (!renderSession.studioContextLost) {
                            gpuSampleTexture?.dispose?.();
                            gpuAccumulator?.dispose?.();
                        }
                        linearAccumulator?.dispose?.();
                        delete renderPreview.sa_studio_render_manual_silhouette;
                        delete renderPreview.sa_studio_render_active;
                    }
                    StudioRenderFrame.setTileProgress(index, 'done');
                    if (index % 3 === 0) {
                        await waitForFrame();
                        if (renderSession.cancelled) return;
                    }
                }
            };

            const tileRenderStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
            await withoutStudioRenderArtKeyMarkers(() => withoutStudioRenderHighlights(async () => {
                if (normalized.show_gizmos) {
                    await renderTiles();
                } else {
                    await withoutStudioRenderGizmos(renderTiles);
                }
            }));
            const tileRenderFinishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
            if (window.LightflowStudioRenderDiagnostics) {
                window.LightflowStudioRenderDiagnostics.tileRenderMs =
                    Math.max(0, tileRenderFinishedAt - tileRenderStartedAt);
                const ambientOcclusion = window.LightflowAmbientOcclusion?.getDiagnostics?.(
                    renderPreview
                ) || null;
                window.LightflowStudioRenderDiagnostics.ambientOcclusion = ambientOcclusion;
                window.LightflowStudioRenderDiagnostics.aoQualityForced = !!(
                    ambientOcclusion &&
                    ambientOcclusion.quality === STUDIO_POST_QUALITY_CONTRACT.ambientOcclusion.quality &&
                    Math.abs(
                        Number(ambientOcclusion.scale) -
                        STUDIO_POST_QUALITY_CONTRACT.ambientOcclusion.scale
                    ) < 0.0001 &&
                    Number(ambientOcclusion.effectiveSPP) ===
                        STUDIO_POST_QUALITY_CONTRACT.ambientOcclusion.effectiveSPP &&
                    Number(ambientOcclusion.hierarchyLevels) ===
                        STUDIO_POST_QUALITY_CONTRACT.ambientOcclusion.hierarchyLevels
                );
            }

            if (renderSession.cancelled) return cancelledRenderResult();

            recordStudioTileSafetySuccess(renderPreview.renderer, renderSession);
            if (window.LightflowStudioRenderDiagnostics) {
                const safetyState = getStudioTileSafetyState(renderPreview.renderer, renderSession.workloadClass);
                window.LightflowStudioRenderDiagnostics.tileSafetyOutcome = safetyState.lastOutcome;
                window.LightflowStudioRenderDiagnostics.nextAdaptiveTileTarget = safetyState.target;
            }

            const compositeStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
            Blockbench.setStatusBarText(translate('studio_render.status.downsample', 'Compositing final image...'));
            if (studioBloomGpuEnabled && studioBloomSession) {
                const bloomResult = studioBloomSession.finish();
                await studioBloomSession.compositeCanvas(canvas, tiles, renderPreview, renderSession);
                if (renderSession.cancelled) return cancelledRenderResult();
                if (window.LightflowStudioRenderDiagnostics && bloomResult) {
                    window.LightflowStudioRenderDiagnostics.bloomSourceMode = bloomResult.sourceMode;
                    window.LightflowStudioRenderDiagnostics.bloomWorkingFormat = bloomResult.workingFormat;
                    window.LightflowStudioRenderDiagnostics.bloomLevels = bloomResult.plan?.length || 0;
                    window.LightflowStudioRenderDiagnostics.bloomDownsampleKernel = bloomResult.downsampleKernel;
                    window.LightflowStudioRenderDiagnostics.bloomUpsampleKernel = bloomResult.upsampleKernel;
                    window.LightflowStudioRenderDiagnostics.bloomActiveTargets =
                        bloomResult.activeTargets || studioBloomPipeline?.getActiveTargets?.().length || 0;
                    window.LightflowStudioRenderDiagnostics.bloomEstimatedBytes = bloomResult.estimatedBytes || 0;
                    window.LightflowStudioRenderDiagnostics.bloomExtraGeometrySubmissions =
                        bloomResult.extraGeometrySubmissions || 0;
                    window.LightflowStudioRenderDiagnostics.bloomDrawCalls = bloomResult.drawCalls || 0;
                    window.LightflowStudioRenderDiagnostics.bloomTargetSwitches = bloomResult.targetSwitches || 0;
                    window.LightflowStudioRenderDiagnostics.studioBloomSourceResolution =
                        bloomResult.studioSourceResolution || [studioBloomSession.width, studioBloomSession.height];
                }
            } else {
                applyFinalBloomCPUFallback(canvas, bloomSettings, bloomMaskCanvas, {
                    maxDimension: Math.min(4096, studioBloomProfile.maxDimension)
                });
            }
            applyFinalColorGrade(canvas, normalized);
            const compositeFinishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
            if (window.LightflowStudioRenderDiagnostics) {
                window.LightflowStudioRenderDiagnostics.finalCompositeMs =
                    Math.max(0, compositeFinishedAt - compositeStartedAt);
            }
            if (typeof options.consumeFrame === 'function') {
                Blockbench.setStatusBarText(translate('studio_render.status.handoff', 'Handing off rendered frame...'));
                await waitForFrame();
                if (renderSession.cancelled) return cancelledRenderResult();
                await options.consumeFrame({
                    canvas,
                    width: outputSize.width,
                    height: outputSize.height,
                    settings: Object.assign({}, normalized, {
                        resolution: normalized.resolution.slice()
                    }),
                    samples: sampleCount,
                    tileSize: renderSession.tileSize,
                    tileCount: renderSession.tileCount
                });
                frameConsumed = true;
                if (renderSession.cancelled) return cancelledRenderResult();
                renderResult = {
                    ok: true,
                    delivered: false,
                    consumed: true,
                    width: outputSize.width,
                    height: outputSize.height,
                    samples: sampleCount,
                    tileSize: renderSession.tileSize,
                    tileCount: renderSession.tileCount,
                    imageBytes: null
                };
            } else {
                Blockbench.setStatusBarText(translate('studio_render.status.encoding', 'Encoding PNG in the background...'));
                await waitForFrame();
                if (renderSession.cancelled) return cancelledRenderResult();
                const encodeStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
                const imageBlob = await canvasToPngBlob(canvas);
                if (renderSession.cancelled) return cancelledRenderResult();
                if (options.deliver !== false) {
                    await deliverRender(imageBlob, outputSize, normalized);
                    if (renderSession.cancelled) return cancelledRenderResult();
                }
                const encodeFinishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
                if (window.LightflowStudioRenderDiagnostics) {
                    window.LightflowStudioRenderDiagnostics.encodeMs =
                        Math.max(0, encodeFinishedAt - encodeStartedAt);
                }
                renderResult = {
                    ok: true,
                    delivered: options.deliver !== false,
                    consumed: false,
                    width: outputSize.width,
                    height: outputSize.height,
                    samples: sampleCount,
                    tileSize: renderSession.tileSize,
                    tileCount: renderSession.tileCount,
                    imageBytes: imageBlob?.size ?? null
                };
            }
        } catch (error) {
            if (renderSession.cancelled) return cancelledRenderResult();
            const gl = getRendererContext(renderPreview?.renderer);
            renderSession.studioContextLost = !!(renderSession.studioContextLost || gl?.isContextLost?.());
            if (window.LightflowStudioRenderDiagnostics) {
                window.LightflowStudioRenderDiagnostics.contextLost = renderSession.studioContextLost;
                window.LightflowStudioRenderDiagnostics.error = error?.message || String(error);
            }
            renderResult = {
                ok: false,
                delivered: false,
                error: error?.message || String(error),
                contextLost: !!renderSession.studioContextLost
            };
            console.error('[Studio Render] Render failed.', error);
            if (options.silent !== true) Blockbench.showMessageBox({
                title: translate('studio_render.plugin.title', 'Studio Render'),
                message: error && error.message ? error.message : String(error),
                icon: 'error'
            });
        } finally {
            // Keep Studio ownership until every shared renderer/camera/shadow
            // restore is complete. Releasing the flags earlier lets a queued
            // main-preview repaint observe Studio state for one frame.
            if (renderSession.anyContextLost || renderSession.studioContextLost) {
                try {
                    const restored = await waitForAllStudioContextRestores(10000);
                    if (window.LightflowStudioRenderDiagnostics) {
                        window.LightflowStudioRenderDiagnostics.contextRestoredBeforeRelease = restored;
                    }
                } catch (error) {}
            }
            if (renderSession.shaderBakeVisible) {
                window.ShaderArchitectFinishStudioRenderBake?.(false);
                renderSession.shaderBakeVisible = false;
            }
            delete renderPreview.sa_studio_render_reuse_shadows;
            restoreStudioRenderBillboards(renderSession.billboardSnapshots);
            window.ShaderArchitectSetStudioRenderSampleScale?.(1, 1, 0);
            releaseStudioSurfaceDetailResolveScratch();
            StudioRenderFrame.clearTileProgress();
            studioBloomSession?.dispose?.({
                contextLost: !!renderSession.studioContextLost
            });
            studioBloomSession = null;

            try {
                if (blockbenchShading && typeof oldShading === 'boolean' && blockbenchShading.value !== oldShading) {
                    blockbenchShading.set(oldShading);
                }
            } catch (error) {
                console.warn('[Studio Render] Failed to restore Blockbench shading state.', error);
            }
            try {
                restorePreviewState(renderPreview, previousState);
                clearCameraViewOffset(renderPreview.camera);
            } catch (error) {
                console.warn('[Studio Render] Failed to restore offscreen preview camera state.', error);
            }
            try {
                const externalRelease = window.LightflowRenderer?.releaseExternal?.(renderPreview, {
                    contextLost: !!renderSession.studioContextLost,
                    hibernate: true,
                    trimPool: true
                }) || null;
                if (window.LightflowStudioRenderDiagnostics) {
                    window.LightflowStudioRenderDiagnostics.externalRelease = externalRelease;
                }
            } catch (error) {
                console.warn('[Studio Render] Failed to release Lightflow offscreen resources.', error);
            }
            try {
                await recoverPreviewShadowsAfterStudioRender(sourcePreview, renderPreview);
            } catch (error) {
                console.warn('[Studio Render] Failed to restore preview shadow state.', error);
            }

            detachStudioContextMonitor(renderSession);
            restoreStudioRenderFlags(renderSession);

            if (window.LightflowStudioRenderDiagnostics) {
                window.LightflowStudioRenderDiagnostics.active = false;
                window.LightflowStudioRenderDiagnostics.accumulationMode = lastStudioAccumulationMode;
                const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
                window.LightflowStudioRenderDiagnostics.totalMs =
                    Math.max(0, finishedAt - (Number(renderSession.startedAt) || finishedAt));
            }
            if (typeof Blockbench !== 'undefined' && typeof Blockbench.dispatchEvent === 'function') {
                Blockbench.dispatchEvent('studio_render_complete', {
                    preview: renderPreview,
                    source_preview: sourcePreview,
                    settings: normalized,
                    result: renderResult,
                    cancelled: !!renderSession.cancelled
                });
            }
            Blockbench.setProgress();
            renderSession.progressUI?.node.remove();
            Blockbench.setStatusBarText();
            if (activeRenderSession === renderSession) activeRenderSession = null;
            if (renderPreview?.sa_studio_owned_preview) {
                const mustRetirePreview = !!(
                    renderSession.studioContextLost ||
                    renderSession.retireOwnedPreviewOnFinish
                );
                const retireReason = mustRetirePreview
                    ? (renderSession.retireOwnedPreviewReason || 'studio_context_lost')
                    : 'retained_for_reuse';
                const retired = mustRetirePreview
                    ? releaseOwnedStudioRenderPreview(retireReason, {
                        contextLost: !!renderSession.studioContextLost
                    })
                    : false;
                if (window.LightflowStudioRenderDiagnostics) {
                    window.LightflowStudioRenderDiagnostics.renderPreviewRetired = retired;
                    window.LightflowStudioRenderDiagnostics.renderPreviewRetireReason = retireReason;
                }
            }
        }
        return renderResult;
    }

    function capturePreviewState(preview) {
        if (!preview) return null;
        return {
            width: preview.width,
            height: preview.height,
            isOrtho: preview.isOrtho,
            controlsTarget: preview.controls?.target?.clone?.(),
            controlsUnlinked: preview.controls?.unlinked,
            camPers: preview.camPers?.clone?.(),
            camOrtho: preview.camOrtho?.clone?.(),
            cameraPosition: preview.camera?.position?.clone?.(),
            cameraQuaternion: preview.camera?.quaternion?.clone?.(),
            promotionalRimSampleScale: preview.sa_promotional_rim_sample_scale,
            hadPromotionalRimSampleScale: Object.prototype.hasOwnProperty.call(
                preview,
                'sa_promotional_rim_sample_scale'
            ),

            promotionalRimFrameScale: preview.sa_promotional_rim_frame_scale,
            hadPromotionalRimFrameScale: Object.prototype.hasOwnProperty.call(
                preview,
                'sa_promotional_rim_frame_scale'
            ),
            manualSilhouette: preview.sa_studio_render_manual_silhouette,
            hadManualSilhouette: Object.prototype.hasOwnProperty.call(preview, 'sa_studio_render_manual_silhouette')
        };
    }

    function restorePreviewState(preview, state) {
        if (!preview || !state) return;
        try {
            preview.setProjectionMode(state.isOrtho);
            if (state.controlsTarget && preview.controls?.target) preview.controls.target.copy(state.controlsTarget);
            if (typeof state.controlsUnlinked === 'boolean' && preview.controls) preview.controls.unlinked = state.controlsUnlinked;
            if (state.width && state.height) preview.resize(state.width, state.height);
            if (state.camPers && preview.camPers) preview.camPers.copy(state.camPers);
            if (state.camOrtho && preview.camOrtho) preview.camOrtho.copy(state.camOrtho);
            clearCameraViewOffset(preview.camPers);
            clearCameraViewOffset(preview.camOrtho);
            if (state.hadPromotionalRimSampleScale) {
                preview.sa_promotional_rim_sample_scale = state.promotionalRimSampleScale;
            } else {
                delete preview.sa_promotional_rim_sample_scale;
            }
            if (state.hadPromotionalRimFrameScale) {
                preview.sa_promotional_rim_frame_scale =
                    state.promotionalRimFrameScale;
            } else {
                delete preview.sa_promotional_rim_frame_scale;
            }
            if (state.hadManualSilhouette) {
                preview.sa_studio_render_manual_silhouette = state.manualSilhouette;
            } else {
                delete preview.sa_studio_render_manual_silhouette;
            }
            preview.camPers?.updateProjectionMatrix?.();
            preview.camOrtho?.updateProjectionMatrix?.();
        } catch (error) {
            console.warn('[Studio Render] Failed to restore the offscreen preview state.', error);
        }
    }

    function constrainFrameResize(options) {
        const {
            original,
            pointerX,
            pointerY,
            xEdge,
            yEdge,
            previewWidth,
            previewHeight,
            pixelAspect,
            fromCenter = false
        } = options;
        const centerX = original.x + original.width / 2;
        const centerY = original.y + original.height / 2;
        const anchorX = fromCenter
            ? centerX
            : (xEdge === 'left' ? original.x + original.width : original.x);
        const anchorY = fromCenter
            ? centerY
            : (yEdge === 'top' ? original.y + original.height : original.y);
        const sizeFactor = fromCenter ? 2 : 1;
        const rawWidth = Math.max(0, (
            xEdge === 'left' ? anchorX - pointerX : pointerX - anchorX
        ) * previewWidth * sizeFactor);
        const rawHeight = Math.max(0, (
            yEdge === 'top' ? anchorY - pointerY : pointerY - anchorY
        ) * previewHeight * sizeFactor);
        const aspect = Math.max(0.0001, toNumber(pixelAspect, 1));

        let height = rawHeight;
        let width = rawWidth;
        if (rawWidth / Math.max(0.0001, rawHeight) > aspect) {
            height = rawWidth / aspect;
        } else {
            width = rawHeight * aspect;
        }

        const maxWidth = (fromCenter
            ? 2 * Math.min(anchorX, 1 - anchorX)
            : (xEdge === 'left' ? anchorX : 1 - anchorX)) * previewWidth;
        const maxHeight = (fromCenter
            ? 2 * Math.min(anchorY, 1 - anchorY)
            : (yEdge === 'top' ? anchorY : 1 - anchorY)) * previewHeight;
        const minHeight = Math.max(0.05 * previewHeight, (0.05 * previewWidth) / aspect);
        const maxConstrainedHeight = Math.max(0, Math.min(maxHeight, maxWidth / aspect));
        height = Math.min(Math.max(height, Math.min(minHeight, maxConstrainedHeight)), maxConstrainedHeight);
        width = height * aspect;

        const normalizedWidth = width / previewWidth;
        const normalizedHeight = height / previewHeight;
        return {
            x: clamp(fromCenter
                ? anchorX - normalizedWidth / 2
                : (xEdge === 'left' ? anchorX - normalizedWidth : anchorX), 0, 1 - normalizedWidth),
            y: clamp(fromCenter
                ? anchorY - normalizedHeight / 2
                : (yEdge === 'top' ? anchorY - normalizedHeight : anchorY), 0, 1 - normalizedHeight),
            width: normalizedWidth,
            height: normalizedHeight
        };
    }

    function getStudioPreviewAspect(preview) {
        const width = Math.max(1, preview?.width || preview?.node?.clientWidth || 16);
        const height = Math.max(1, preview?.height || preview?.node?.clientHeight || 9);
        return width / height;
    }

    function stampFrameReferenceAspect(frame, preview) {
        return normalizeFrameState(Object.assign({}, frame, {
            reference_aspect: getStudioPreviewAspect(preview)
        }));
    }

    function fitFramePixelAspect(frame, preview, pixelAspect) {
        const normalized = normalizeFrameState(frame);
        const previewAspect = getStudioPreviewAspect(preview);
        const safePixelAspect = Math.max(0.0001, toNumber(pixelAspect, previewAspect));
        const centerX = normalized.x + normalized.width / 2;
        const centerY = normalized.y + normalized.height / 2;
        const maxWidth = Math.max(0.05, 2 * Math.min(centerX, 1 - centerX));
        const maxHeight = Math.max(0.05, 2 * Math.min(centerY, 1 - centerY));
        let height = Math.min(normalized.height, maxHeight);
        let width = height * safePixelAspect / previewAspect;
        if (width > maxWidth) {
            width = maxWidth;
            height = width * previewAspect / safePixelAspect;
        }
        width = clamp(width, 0.05, maxWidth);
        height = clamp(height, 0.05, maxHeight);
        return normalizeFrameState({
            x: centerX - width / 2,
            y: centerY - height / 2,
            width,
            height,
            reference_aspect: previewAspect
        });
    }

    function resolveStoredFrameState(stored, preview, settings) {
        if (!stored || !Number.isFinite(stored.x) || !Number.isFinite(stored.y)) return null;
        const frame = normalizeFrameState(stored);
        const previewAspect = getStudioPreviewAspect(preview);
        const storedReference = Number(stored.reference_aspect);
        if (Number.isFinite(storedReference) && storedReference > 0) {
            const pixelAspect = frame.width * storedReference / Math.max(0.0001, frame.height);
            return Math.abs(storedReference - previewAspect) > 0.0001
                ? fitFramePixelAspect(frame, preview, pixelAspect)
                : stampFrameReferenceAspect(frame, preview);
        }

        const pixelAspect = frame.width * previewAspect / Math.max(0.0001, frame.height);
        const outputAspect = settings?.resolution?.[0] && settings?.resolution?.[1]
            ? settings.resolution[0] / settings.resolution[1]
            : 16 / 9;
        const aspectRatio = pixelAspect / Math.max(0.0001, outputAspect);
        // Older frame records had no viewport reference. A drastic mismatch is
        // normally stale normalized geometry from another sidebar/canvas size,
        // which produced outputs such as 7680 x 14185 on open.
        if (settings?.match_frame_ratio !== false && (aspectRatio < 0.55 || aspectRatio > 1.82)) {
            return null;
        }
        return stampFrameReferenceAspect(frame, preview);
    }

    const StudioRenderFrame = {
        node: null,
        label: null,
        toolbar: null,
        tileGrid: null,
        tileButton: null,
        tileProgressNodes: [],
        preview: null,
        state: null,
        pointerInteractionCleanup: null,
        persistProjectState: true,
        stateOwner: '',

        getDefaultState(preview, settings) {
            const width = Math.max(1, preview?.width || preview?.node?.clientWidth || 16);
            const height = Math.max(1, preview?.height || preview?.node?.clientHeight || 9);
            const aspect = settings?.resolution?.[0] && settings?.resolution?.[1]
                ? settings.resolution[0] / settings.resolution[1]
                : 16 / 9;
            let normalizedWidth = 0.82;
            let normalizedHeight = normalizedWidth * width / aspect / height;
            if (normalizedHeight > 0.82) {
                normalizedHeight = 0.82;
                normalizedWidth = normalizedHeight * height * aspect / width;
            }
            return {
                x: (1 - normalizedWidth) / 2,
                y: (1 - normalizedHeight) / 2,
                width: normalizedWidth,
                height: normalizedHeight,
                reference_aspect: width / height
            };
        },

        getState(preview, settings) {
            const project = getActiveProject();
            const stored = getProjectFrameState(project) || (!project ? readJSON(FRAME_STORAGE_KEY, null) : null);

            const resolved = resolveStoredFrameState(stored, preview, settings);
            if (resolved) return resolved;
            return this.getDefaultState(preview, settings);
        },

        saveState(projectScoped = false) {
            if (!this.state) return;
            const persists = this.persistProjectState !== false;
            if (persists) writeJSON(FRAME_STORAGE_KEY, this.state);
            if (projectScoped && persists) saveProjectFrameState(this.state);
            if (projectScoped) {
                Blockbench.dispatchEvent('studio_render_frame_changed', {
                    frame: Object.assign({}, this.state),
                    preview: this.preview || getPreview(),
                    owner: this.stateOwner || '',
                    projectScoped: persists
                });
            }
        },

        setState(state, preview = getPreview(), settings = currentSettings, options = {}) {
            this.persistProjectState = options.persistProjectState !== false;
            this.stateOwner = String(options.owner || '');
            this.state = stampFrameReferenceAspect(state, preview);
            this.saveState(true);
            if (this.node && this.preview === preview) {
                this.updateNode();
            } else if (settings?.capture_area === 'frame') {
                this.show(preview, settings, {
                    state: this.state,
                    persistProjectState: this.persistProjectState,
                    owner: this.stateOwner
                });
            }
            return Object.assign({}, this.state);
        },

        show(preview = getPreview(), settings = currentSettings, options = {}) {
            if (!preview || !preview.node) {
                Blockbench.showQuickMessage(translate('studio_render.message.no_preview', 'No preview is available to render.'));
                return;
            }
            this.persistProjectState = options.persistProjectState !== false;
            this.stateOwner = String(options.owner || '');
            if (this.node && this.preview === preview) {
                if (options.state) this.state = stampFrameReferenceAspect(options.state, preview);
                this.updateNode();
                syncFrameAction();
                return;
            }
            this.remove(false);
            this.preview = preview;
            this.persistProjectState = options.persistProjectState !== false;
            this.stateOwner = String(options.owner || '');
            this.state = options.state
                ? stampFrameReferenceAspect(options.state, preview)
                : this.getState(preview, settings);
            this.node = Interface.createElement('div', {
                id: 'studio_render_frame',
                class: 'studio_render_frame'
            });
            this.label = Interface.createElement('div', {
                class: 'studio_render_frame_label'
            });
            this.node.append(this.label);

            this.tileGrid = Interface.createElement('div', {
                class: 'studio_render_tile_grid'
            });
            this.node.append(this.tileGrid);

            const handles = [
                ['nw', 'left', 'top'],
                ['ne', 'right', 'top'],
                ['se', 'right', 'bottom'],
                ['sw', 'left', 'bottom']
            ];
            handles.forEach(([name, xEdge, yEdge]) => {
                const handle = Interface.createElement('div', {
                    class: 'studio_render_frame_handle studio_render_' + name,
                    title: translate(
                        'studio_render.frame.resize_hint',
                        'Resize Frame - Alt: Resize from Center, Ctrl: Square, Shift: Lock Aspect Ratio'
                    ),
                    'aria-label': translate(
                        'studio_render.frame.resize_hint',
                        'Resize Frame - Alt: Resize from Center, Ctrl: Square, Shift: Lock Aspect Ratio'
                    )
                });
                handle.addEventListener('mousedown', event => this.startResize(event, xEdge, yEdge));
                handle.addEventListener('touchstart', event => this.startResize(event, xEdge, yEdge), { passive: false });
                this.node.append(handle);
            });

            this.toolbar = this.createToolbar();
            this.node.append(this.toolbar);
            this.node.addEventListener('mousedown', event => {
                if (event.target === this.node) this.startDrag(event);
            });
            this.node.addEventListener('touchstart', event => {
                if (event.target === this.node) this.startDrag(event);
            }, { passive: false });
            this.label.addEventListener('mousedown', event => this.startDrag(event));
            this.label.addEventListener('touchstart', event => this.startDrag(event), { passive: false });
            preview.node.append(this.node);
            this.updateNode();
            syncFrameAction();
        },

        createButton(className, icon, titleKey, fallback, onClick, color) {
            const button = Interface.createElement('button', {
                type: 'button',
                class: 'studio_render_frame_button ' + className,
                title: translate(titleKey, fallback),
                'aria-label': translate(titleKey, fallback)
            }, Blockbench.getIconNode(icon, color));
            if (
                className.includes('studio_render_camera_presets_button') ||
                className.includes('studio_render_view_mode_button') ||
                className.includes('studio_render_global_material_button')
            ) {
                button.setAttribute('aria-haspopup', 'menu');
            }
            button.addEventListener('mousedown', event => event.stopPropagation());
            button.addEventListener('touchstart', event => event.stopPropagation(), { passive: false });
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                onClick(event, button);
            });
            return button;
        },

        createToolbar() {
            const toolbar = Interface.createElement('div', {
                class: 'studio_render_frame_controls'
            });
            toolbar.append(
                this.createButton(
                    'studio_render_capture_button',
                    'photo_camera',
                    'studio_render.action.capture',
                    'Render Now',
                    () => renderWithSettings(getFrameSettings())
                ),
                this.createButton(
                    'studio_render_settings_button',
                    'tune',
                    'studio_render.action.settings',
                    'Render Settings',
                    () => openStudioRenderDialog()
                ),
                this.createButton(
                    'studio_render_view_mode_button',
                    'view_in_ar',
                    'studio_render.action.view_mode',
                    'Render Mode',
                    event => openStudioRenderViewModeMenu(event)
                ),
                this.createButton(
                    'studio_render_global_material_button',
                    'texture',
                    'studio_render.action.global_material',
                    'Global Material',
                    event => openStudioRenderGlobalMaterialMenu(event)
                ),
                this.createButton(
                    'studio_render_camera_presets_button',
                    'videocam',
                    'studio_render.action.camera_presets',
                    'Camera Presets',
                    event => openCameraPresetMenu(event)
                ),
                this.createButton(
                    'studio_render_reset_button',
                    'center_focus_strong',
                    'studio_render.button.reset_frame',
                    'Reset Frame',
                    () => this.reset(getPreview(), currentSettings)
                )
            );
            this.tileButton = this.createButton(
                'studio_render_tile_button',
                'grid_view',
                'studio_render.action.tile_grid',
                'Tile Grid',
                () => this.toggleTileGrid()
            );
            toolbar.append(
                this.tileButton,
                this.createButton(
                    'studio_render_close_button',
                    'close',
                    'studio_render.action.close_frame',
                    'Close Frame',
                    () => this.remove(true)
                )
            );
            return toolbar;
        },

        toggle() {
            if (this.node) {
                this.remove(true);
            } else {
                openStudioRenderFrame();
            }
        },

        toggleTileGrid() {
            currentSettings.show_tile_grid = !currentSettings.show_tile_grid;
            saveSettings(currentSettings);
            this.updateTileGrid();
            this.updateToolbarState();
        },

        reset(preview = getPreview(), settings = currentSettings) {
            if (this.persistProjectState !== false) {
                localStorage.removeItem(FRAME_STORAGE_KEY);
                const document = getProjectCameraPresetDocument();
                document.active_frame = null;
                saveProjectCameraPresetDocument(document, getActiveProject(), { warn: false });
            }
            const visibleBounds = getVisibleCanvasBounds(preview);
            this.state = visibleBounds || (
                this.persistProjectState === false
                    ? this.getDefaultState(preview, settings)
                    : this.getState(preview, settings)
            );
            this.state = stampFrameReferenceAspect(this.state, preview);
            this.saveState(true);
            if (this.node) this.updateNode();
        },

        remove(save) {
            if (save) this.saveState(true);
            this.cancelPointerInteraction();
            if (this.node && this.node.parentNode) this.node.parentNode.removeChild(this.node);
            this.node = null;
            this.label = null;
            this.toolbar = null;
            this.tileGrid = null;
            this.tileButton = null;
            this.tileProgressNodes = [];
            this.preview = null;
            this.persistProjectState = true;
            this.stateOwner = '';
            syncFrameAction();
        },

        cancelPointerInteraction() {
            if (typeof this.pointerInteractionCleanup === 'function') {
                this.pointerInteractionCleanup();
            }
            this.pointerInteractionCleanup = null;
        },

        bindPointerInteraction(move, onStop) {
            this.cancelPointerInteraction();
            const stop = () => {
                this.cancelPointerInteraction();
                onStop?.();
            };
            addEventListeners(document, 'mousemove touchmove', move);
            addEventListeners(document, 'mouseup touchend', stop);
            this.pointerInteractionCleanup = () => {
                removeEventListeners(document, 'mousemove touchmove', move);
                removeEventListeners(document, 'mouseup touchend', stop);
            };
        },

        getPixelRect() {
            if (!this.preview || !this.state) return null;
            const width = this.preview.width || this.preview.node?.clientWidth || 1;
            const height = this.preview.height || this.preview.node?.clientHeight || 1;
            return {
                x: this.state.x * width,
                y: this.state.y * height,
                width: this.state.width * width,
                height: this.state.height * height
            };
        },

        updateNode() {
            if (!this.node || !this.preview || !this.state) return;
            const rect = this.getPixelRect();
            this.node.style.left = rect.x + 'px';
            this.node.style.top = rect.y + 'px';
            this.node.style.width = rect.width + 'px';
            this.node.style.height = rect.height + 'px';
            this.updateLabel();
            this.updateTileGrid();
            this.updateToolbarLayout(rect);
            this.updateToolbarState();
            this.saveState();
        },

        updateLabel() {
            if (!this.label || !this.preview) return;
            const rect = this.getPixelRect();
            const size = computeOutputSize(getFrameSettings(), rect);
            this.label.textContent = /*'Studio - ' + */size.width + ' x ' + size.height;
        },

        updateToolbarState() {
            if (!this.node) return;
            this.node.classList.toggle('show_tile_grid', !!currentSettings.show_tile_grid);
            if (this.tileButton) {
                this.tileButton.classList.toggle('active', !!currentSettings.show_tile_grid);
            }
        },

        updateToolbarLayout(rect = this.getPixelRect()) {
            if (!this.node || !this.toolbar || !this.preview || !rect) return;
            const previewWidth = Math.max(1, this.preview.width || this.preview.node?.clientWidth || 1);
            const previewHeight = Math.max(1, this.preview.height || this.preview.node?.clientHeight || 1);
            const controlsWidth = Math.max(118, (this.toolbar.children?.length || 3) * 39 + 4);
            const controlsHeight = 28;
            const controlsGap = 8;
            const availableBelow = previewHeight - (rect.y + rect.height);
            const centerLeft = rect.x + rect.width / 2 - controlsWidth / 2;
            const centerRight = centerLeft + controlsWidth;
            const overflowsHorizontally = centerLeft < 0 || centerRight > previewWidth;
            const vertical = rect.width < controlsWidth || previewWidth < 260 || overflowsHorizontally;
            const side = vertical && previewWidth - (rect.x + rect.width) >= controlsHeight + controlsGap;
            const outside = !vertical && availableBelow >= controlsHeight + controlsGap + 4;
            const localLeft = clamp(
                rect.width / 2,
                controlsWidth / 2 - rect.x,
                previewWidth - rect.x - controlsWidth / 2
            );

            this.node.classList.toggle('controls_outside', outside);
            this.node.classList.toggle('controls_side', side);
            this.node.classList.toggle('controls_inside', !outside && !side);
            this.node.classList.toggle('controls_vertical', vertical);
            this.toolbar.style.left = (!vertical && (outside || !side)) ? localLeft + 'px' : '';
        },

        updateTileGrid() {
            if (!this.tileGrid || !this.preview) return;
            this.tileGrid.innerHTML = '';
            this.tileProgressNodes = [];
            if (!currentSettings.show_tile_grid) return;

            const rect = this.getPixelRect();
            if (!rect || rect.width < 1 || rect.height < 1) return;

            const settings = getFrameSettings();
            const size = computeOutputSize(settings, rect);
            const sampleFactor = 1;
            const sampleCount = clamp(parseInt(settings.samples, 10) || 1, 1, 8);
            const renderPreview = getOffscreenPreview();
            const tileSize = resolveTileSize(settings, renderPreview?.renderer, sampleFactor, sampleCount);
            const sampleWidth = size.width * sampleFactor;
            const sampleHeight = size.height * sampleFactor;

            for (let x = tileSize; x < sampleWidth; x += tileSize) {
                const line = Interface.createElement('div', {
                    class: 'studio_render_tile_line vertical'
                });
                line.style.left = (x / sampleWidth * 100) + '%';
                this.tileGrid.append(line);
            }
            for (let y = tileSize; y < sampleHeight; y += tileSize) {
                const line = Interface.createElement('div', {
                    class: 'studio_render_tile_line horizontal'
                });
                line.style.top = (y / sampleHeight * 100) + '%';
                this.tileGrid.append(line);
            }
        },

        prepareTileProgress(tiles, outputSize, settings) {
            this.clearTileProgress();
            if (!this.tileGrid || !this.node || !settings?.show_tile_grid || settings.capture_area !== 'frame') return;
            if (!Array.isArray(tiles) || !tiles.length || !outputSize?.width || !outputSize?.height) return;

            this.tileProgressNodes = tiles.map((tile, index) => {
                const cell = Interface.createElement('div', {
                    class: 'studio_render_tile_progress pending'
                });
                cell.style.left = (tile.outputX / outputSize.width * 100) + '%';
                cell.style.top = (tile.outputY / outputSize.height * 100) + '%';
                cell.style.width = (tile.outputWidth / outputSize.width * 100) + '%';
                cell.style.height = (tile.outputHeight / outputSize.height * 100) + '%';
                cell.dataset.tileIndex = String(index);
                this.tileGrid.append(cell);
                return cell;
            });
        },

        setTileProgress(index, state) {
            const cell = this.tileProgressNodes?.[index];
            if (!cell) return;
            cell.classList.toggle('rendering', state === 'rendering');
            cell.classList.toggle('done', state === 'done');
            cell.classList.toggle('pending', state !== 'rendering' && state !== 'done');
        },

        clearTileProgress() {
            if (this.tileProgressNodes?.length) {
                this.tileProgressNodes.forEach(node => node?.parentNode?.removeChild(node));
            }
            this.tileProgressNodes = [];
        },

        startDrag(event) {
            convertTouchEvent(event);
            event.preventDefault();
            const startX = event.clientX;
            const startY = event.clientY;
            const original = Object.assign({}, this.state);
            const previewWidth = Math.max(1, this.preview.width || this.preview.node?.clientWidth || 1);
            const previewHeight = Math.max(1, this.preview.height || this.preview.node?.clientHeight || 1);

            const move = moveEvent => {
                convertTouchEvent(moveEvent);
                const dx = (moveEvent.clientX - startX) / previewWidth;
                const dy = (moveEvent.clientY - startY) / previewHeight;
                this.state.x = clamp(original.x + dx, 0, 1 - original.width);
                this.state.y = clamp(original.y + dy, 0, 1 - original.height);
                this.updateNode();
            };
            this.bindPointerInteraction(move, () => {
                this.state = stampFrameReferenceAspect(this.state, this.preview);
                this.saveState(true);
            });
        },

        startResize(event, xEdge, yEdge) {
            convertTouchEvent(event);
            event.preventDefault();
            event.stopPropagation();
            const startX = event.clientX;
            const startY = event.clientY;
            const original = Object.assign({}, this.state);
            const previewWidth = Math.max(1, this.preview.width || this.preview.node?.clientWidth || 1);
            const previewHeight = Math.max(1, this.preview.height || this.preview.node?.clientHeight || 1);

            const move = moveEvent => {
                convertTouchEvent(moveEvent);
                const dx = (moveEvent.clientX - startX) / previewWidth;
                const dy = (moveEvent.clientY - startY) / previewHeight;
                const lockSquare = !!(moveEvent.ctrlKey || moveEvent.metaKey);
                const lockCurrentAspect = !lockSquare && !!moveEvent.shiftKey;
                const fromCenter = !!moveEvent.altKey;
                if (lockSquare || lockCurrentAspect) {
                    const constrained = constrainFrameResize({
                        original,
                        pointerX: (xEdge === 'left' ? original.x : original.x + original.width) + dx,
                        pointerY: (yEdge === 'top' ? original.y : original.y + original.height) + dy,
                        xEdge,
                        yEdge,
                        previewWidth,
                        previewHeight,
                        fromCenter,
                        pixelAspect: lockSquare
                            ? 1
                            : (original.width * previewWidth) / Math.max(0.0001, original.height * previewHeight)
                    });
                    Object.assign(this.state, constrained);
                    this.updateNode();
                    return;
                }
                let left = original.x;
                let top = original.y;
                let right = original.x + original.width;
                let bottom = original.y + original.height;

                if (fromCenter) {
                    const centerX = original.x + original.width / 2;
                    const centerY = original.y + original.height / 2;
                    const widthDelta = (xEdge === 'left' ? -dx : dx) * 2;
                    const heightDelta = (yEdge === 'top' ? -dy : dy) * 2;
                    const width = clamp(
                        original.width + widthDelta,
                        0.05,
                        2 * Math.min(centerX, 1 - centerX)
                    );
                    const height = clamp(
                        original.height + heightDelta,
                        0.05,
                        2 * Math.min(centerY, 1 - centerY)
                    );
                    left = centerX - width / 2;
                    right = centerX + width / 2;
                    top = centerY - height / 2;
                    bottom = centerY + height / 2;
                } else {

                    if (xEdge === 'left') left = clamp(original.x + dx, 0, right - 0.05);
                    if (xEdge === 'right') right = clamp(original.x + original.width + dx, left + 0.05, 1);
                    if (yEdge === 'top') top = clamp(original.y + dy, 0, bottom - 0.05);
                    if (yEdge === 'bottom') bottom = clamp(original.y + original.height + dy, top + 0.05, 1);
                }

                this.state.x = left;
                this.state.y = top;
                this.state.width = right - left;
                this.state.height = bottom - top;
                this.updateNode();
            };
            this.bindPointerInteraction(move, () => {
                this.state = stampFrameReferenceAspect(this.state, this.preview);
                this.saveState(true);
            });
        }
    };

    function getCameraPresetDialogSettings(dialog) {
        const result = dialog?.getFormResult?.() || {};
        currentSettings = normalizeForm({ ...currentSettings, ...result });
        return currentSettings;
    }

    function refreshCameraPresetForms() {
        if (activeDialog?.form) {
            activeDialog.form.form_config = createDialogForm(currentSettings);
            activeDialog.form.buildForm?.();
        }
        if (activeCameraPresetDialog?.form) {
            activeCameraPresetDialog.form.form_config = createCameraPresetManagerForm(currentSettings);
            activeCameraPresetDialog.form.buildForm?.();
        }
    }

    function promptCameraPresetName(options = {}) {
        const preset = options.preset || null;
        const dialog = new Dialog({
            id: options.rename ? 'studio_render_rename_camera_preset' : 'studio_render_create_camera_preset',
            title: options.rename
                ? 'studio_render.dialog.rename_camera_preset'
                : 'studio_render.dialog.create_camera_preset',
            width: 420,
            form: {
                name: {
                    type: 'text',
                    label: 'studio_render.field.camera_preset_name',
                    value: preset?.name || ''
                }
            },
            buttons: ['studio_render.button.save_preset', 'dialog.cancel'],
            onConfirm(form) {
                const name = String(form?.name || '').trim().slice(0, 80);
                if (!name) return false;
                this.hide();
                options.onConfirm?.(name);
            }
        });
        dialog.show();
    }

    function createProjectCameraPreset(name, settings = currentSettings, options = {}) {
        const preset = captureCameraPreset(name, getPreview(), settings, null, options);
        if (!preset) return null;
        const presets = getProjectCameraPresets();
        presets.push(preset);
        if (!saveProjectCameraPresets(presets)) return null;
        currentSettings.camera_preset_id = preset.id;
        saveSettings(currentSettings);
        refreshCameraPresetForms();
        Blockbench.showQuickMessage(translate('studio_render.message.preset_created', 'Camera preset created') + ': ' + preset.name);
        return preset;
    }

    function updateProjectCameraPreset(id, settings = currentSettings) {
        const presets = getProjectCameraPresets();
        const index = presets.findIndex(preset => preset.id === id);
        if (index < 0) return false;
        const captureSettings = normalizeForm({
            ...settings,
            angle_preset: 'view',
            zoom: null
        });
        const updated = captureCameraPreset(
            presets[index].name,
            getPreview(),
            captureSettings,
            presets[index],
            { exact_projection: presets[index].camera?.exact_projection === true }
        );
        if (!updated) return false;
        presets[index] = updated;
        saveProjectCameraPresets(presets);
        currentSettings.camera_preset_id = updated.id;
        saveSettings(currentSettings);
        refreshCameraPresetForms();
        Blockbench.showQuickMessage(translate('studio_render.message.preset_updated', 'Camera preset updated') + ': ' + updated.name);
        return true;
    }

    function renameProjectCameraPreset(id, name) {
        const presets = getProjectCameraPresets();
        const preset = presets.find(entry => entry.id === id);
        if (!preset) return false;
        preset.name = name;
        preset.updated_at = Date.now();
        saveProjectCameraPresets(presets);
        currentSettings.camera_preset_id = preset.id;
        saveSettings(currentSettings);
        refreshCameraPresetForms();
        Blockbench.showQuickMessage(translate('studio_render.message.preset_updated', 'Camera preset updated') + ': ' + preset.name);
        return true;
    }

    function deleteProjectCameraPreset(id) {
        const presets = getProjectCameraPresets();
        const preset = presets.find(entry => entry.id === id);
        if (!preset) return false;
        const message = translate(
            'studio_render.message.preset_delete_confirm',
            'Delete camera preset "{name}" from this project?'
        ).replace('{name}', preset.name);
        Blockbench.showMessageBox({
            title: translate('studio_render.dialog.camera_presets', 'Project Camera Presets'),
            message,
            icon: 'delete',
            buttons: ['studio_render.button.delete_preset', 'dialog.cancel'],
            confirm: 0,
            cancel: 1
        }, result => {
            if (result !== 0 && result !== 'studio_render.button.delete_preset') return;
            saveProjectCameraPresets(presets.filter(entry => entry.id !== id));
            if (currentSettings.camera_preset_id === id) currentSettings.camera_preset_id = '';
            saveSettings(currentSettings);
            refreshCameraPresetForms();
            Blockbench.showQuickMessage(translate('studio_render.message.preset_deleted', 'Camera preset deleted') + ': ' + preset.name);
        });
        return true;
    }

    function roundCameraValue(value) {
        return Math.round(toNumber(value, 0) * 10000) / 10000;
    }

    function roundCameraVector(value, length = 3) {
        return finiteArray(value, length, new Array(length).fill(0)).map(roundCameraValue);
    }

    function getCameraPresetEuler(preset) {
        const quaternion = new THREE.Quaternion().fromArray(preset.camera.quaternion);
        const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
        return [euler.x, euler.y, euler.z].map(value =>
            roundCameraValue(THREE.MathUtils.radToDeg(value))
        );
    }

    function getCameraPresetQuaternion(position, target, up = [0, 1, 0]) {
        const camera = new THREE.PerspectiveCamera();
        camera.position.fromArray(position);
        camera.up.fromArray(up);
        camera.lookAt(new THREE.Vector3().fromArray(target));
        return camera.quaternion.toArray();
    }

    function getCameraTargetFromRotation(position, rotation, distance) {
        const euler = new THREE.Euler(
            THREE.MathUtils.degToRad(toNumber(rotation?.[0], 0)),
            THREE.MathUtils.degToRad(toNumber(rotation?.[1], 0)),
            THREE.MathUtils.degToRad(toNumber(rotation?.[2], 0)),
            'YXZ'
        );
        const direction = new THREE.Vector3(0, 0, -1).applyEuler(euler);
        return new THREE.Vector3().fromArray(position)
            .addScaledVector(direction, Math.max(0.0001, toNumber(distance, 16)))
            .toArray();
    }

    function saveEditedCameraPreset(sourcePreset, form) {
        const presets = getProjectCameraPresets();
        const index = presets.findIndex(entry => entry.id === sourcePreset.id);
        const position = roundCameraVector(form.position);
        const up = roundCameraVector(form.up);
        const oldDistance = new THREE.Vector3().fromArray(sourcePreset.camera.position)
            .distanceTo(new THREE.Vector3().fromArray(sourcePreset.camera.target));
        const target = form.rotation_mode === 'rotation'
            ? getCameraTargetFromRotation(position, form.rotation, oldDistance)
            : roundCameraVector(form.target);
        const quaternion = form.rotation_mode === 'rotation'
            ? new THREE.Quaternion().setFromEuler(new THREE.Euler(
                THREE.MathUtils.degToRad(toNumber(form.rotation?.[0], 0)),
                THREE.MathUtils.degToRad(toNumber(form.rotation?.[1], 0)),
                THREE.MathUtils.degToRad(toNumber(form.rotation?.[2], 0)),
                'YXZ'
            )).toArray()
            : getCameraPresetQuaternion(position, target, up);
        const framePosition = finiteArray(form.frame_position, 2, [sourcePreset.frame.x, sourcePreset.frame.y]);
        const frameSize = finiteArray(form.frame_size, 2, [sourcePreset.frame.width, sourcePreset.frame.height]);
        const resolutionPreset = RESOLUTION_PRESETS[form.resolution_preset] ? form.resolution_preset : 'custom';
        const resolution = resolutionPreset === 'custom'
            ? finiteArray(form.resolution, 2, sourcePreset.output.resolution).map(roundDimension)
            : RESOLUTION_PRESETS[resolutionPreset].slice();
        const edited = normalizeCameraPreset({
            ...sourcePreset,
            name: String(form.name || '').trim().slice(0, 80),
            updated_at: Date.now(),
            camera: {
                ...sourcePreset.camera,
                projection: form.projection,
                position,
                quaternion,
                up,
                target,
                exact_projection: !!form.exact_projection,
                near: form.near,
                far: form.far,
                fov: form.fov,
                focus: form.focus,
                film_gauge: form.film_gauge,
                lens_shift_x: form.lens_shift,
                projection_shift_x: form.exact_projection ? toNumber(form.projection_shift?.[0], 0) : null,
                projection_shift_y: form.exact_projection ? toNumber(form.projection_shift?.[1], 0) : null,
                zoom: form.camera_zoom,
                ortho_world_height: form.ortho_height
            },
            frame: {
                x: framePosition[0],
                y: framePosition[1],
                width: frameSize[0],
                height: frameSize[1]
            },
            output: {
                ...sourcePreset.output,
                resolution_preset: resolutionPreset,
                resolution,
                output_scale: form.output_scale,
                capture_area: form.capture_area,
                match_frame_ratio: !!form.match_frame_ratio
            }
        });
        if (!edited || !edited.name) return false;
        if (index < 0) {
            presets.push(edited);
        } else {
            presets[index] = edited;
        }
        if (!saveProjectCameraPresets(presets)) return false;
        currentSettings.camera_preset_id = edited.id;
        saveSettings(currentSettings);
        refreshCameraPresetForms();
        Blockbench.showQuickMessage(translate(
            index < 0 ? 'studio_render.message.preset_created' : 'studio_render.message.preset_updated',
            index < 0 ? 'Camera preset created' : 'Camera preset updated'
        ) + ': ' + edited.name);
        return edited;
    }

    function createCameraPresetEditorForm(preset) {
        return {
            name: {
                type: 'text',
                label: 'studio_render.field.camera_preset_name',
                value: preset.name
            },
            projection: {
                type: 'select',
                label: 'dialog.save_angle.projection',
                value: preset.camera.projection,
                options: {
                    perspective: 'dialog.save_angle.projection.perspective',
                    orthographic: 'dialog.save_angle.projection.orthographic'
                }
            },
            divider_camera: '_',
            rotation_mode: {
                type: 'inline_select',
                label: 'studio_render.field.rotation_mode',
                value: 'target',
                options: {
                    target: 'studio_render.option.rotation.target',
                    rotation: 'studio_render.option.rotation.euler'
                }
            },
            position: {
                type: 'vector',
                dimensions: 3,
                label: 'studio_render.field.camera_position',
                value: roundCameraVector(preset.camera.position)
            },
            target: {
                type: 'vector',
                dimensions: 3,
                label: 'studio_render.field.camera_target',
                value: roundCameraVector(preset.camera.target),
                condition: form => form.rotation_mode === 'target'
            },
            rotation: {
                type: 'vector',
                dimensions: 3,
                label: 'studio_render.field.camera_rotation',
                value: getCameraPresetEuler(preset),
                condition: form => form.rotation_mode === 'rotation'
            },
            up: {
                type: 'vector',
                dimensions: 3,
                label: 'studio_render.field.camera_up',
                value: roundCameraVector(preset.camera.up)
            },
            fov: {
                type: 'number',
                label: 'studio_render.field.fov',
                value: roundCameraValue(preset.camera.fov),
                min: 0.01,
                max: 179,
                condition: form => form.projection === 'perspective'
            },
            ortho_height: {
                type: 'number',
                label: 'studio_render.field.ortho_height',
                value: roundCameraValue(preset.camera.ortho_world_height),
                min: 0.0001,
                condition: form => form.projection === 'orthographic'
            },
            near: {
                type: 'number',
                label: 'studio_render.field.near_clip',
                value: roundCameraValue(preset.camera.near),
                min: 0.0001
            },
            far: {
                type: 'number',
                label: 'studio_render.field.far_clip',
                value: roundCameraValue(preset.camera.far),
                min: 0.001
            },
            focus: {
                type: 'number',
                label: 'studio_render.field.focus_distance',
                value: roundCameraValue(preset.camera.focus),
                min: 0.0001,
                condition: form => form.projection === 'perspective'
            },
            film_gauge: {
                type: 'number',
                label: 'studio_render.field.film_gauge',
                value: roundCameraValue(preset.camera.film_gauge),
                min: 0.0001,
                condition: form => form.projection === 'perspective'
            },
            lens_shift: {
                type: 'number',
                label: 'studio_render.field.lens_shift',
                value: roundCameraValue(preset.camera.lens_shift_x),
                condition: form => form.projection === 'perspective'
            },
            camera_zoom: {
                type: 'number',
                label: 'studio_render.field.camera_zoom',
                value: roundCameraValue(preset.camera.zoom),
                min: 0.0001,
                condition: form => form.projection === 'perspective'
            },
            exact_projection: {
                type: 'checkbox',
                label: 'studio_render.field.exact_projection',
                value: preset.camera.exact_projection
            },
            projection_shift: {
                type: 'vector',
                dimensions: 2,
                label: 'studio_render.field.projection_shift',
                value: [
                    toNumber(preset.camera.projection_shift_x, 0),
                    toNumber(preset.camera.projection_shift_y, 0)
                ].map(roundCameraValue),
                condition: form => form.projection === 'perspective' && form.exact_projection
            },
            divider_frame: '_',
            frame_position: {
                type: 'vector',
                dimensions: 2,
                label: 'studio_render.field.frame_position',
                value: [preset.frame.x, preset.frame.y].map(roundCameraValue),
                min: 0,
                max: 1
            },
            frame_size: {
                type: 'vector',
                dimensions: 2,
                label: 'studio_render.field.frame_size',
                value: [preset.frame.width, preset.frame.height].map(roundCameraValue),
                min: 0.001,
                max: 1
            },
            resolution_preset: {
                type: 'select',
                label: 'studio_render.field.resolution_preset',
                value: preset.output.resolution_preset,
                options: {
                    hd: 'studio_render.option.resolution.hd',
                    uhd: 'studio_render.option.resolution.uhd',
                    dci_4k: 'studio_render.option.resolution.dci_4k',
                    square_4k: 'studio_render.option.resolution.square_4k',
                    eight_k: 'studio_render.option.resolution.eight_k',
                    custom: 'studio_render.option.resolution.custom'
                }
            },
            resolution: {
                type: 'vector',
                dimensions: 2,
                label: 'studio_render.field.resolution',
                value: preset.output.resolution.slice(),
                min: 1,
                condition: form => form.resolution_preset === 'custom'
            },
            output_scale: {
                type: 'number',
                label: 'studio_render.field.output_scale',
                value: preset.output.output_scale,
                min: 0.1,
                max: 8,
                step: 0.25
            },
            capture_area: {
                type: 'select',
                label: 'studio_render.field.capture_area',
                value: preset.output.capture_area,
                options: {
                    full: 'studio_render.option.area.full',
                    frame: 'studio_render.option.area.frame'
                }
            },
            match_frame_ratio: {
                type: 'checkbox',
                label: 'studio_render.field.match_frame_ratio',
                value: preset.output.match_frame_ratio,
                condition: form => form.capture_area === 'frame'
            }
        };
    }

    function openCameraPresetEditor(preset = null) {
        const isNew = !preset;
        const source = preset || captureCameraPreset(
            'Camera ' + (getProjectCameraPresets().length + 1),
            getPreview(),
            normalizeForm({ ...currentSettings, angle_preset: 'view', zoom: null }),
            null,
            { exact_projection: true }
        );
        if (!source) return;
        let rotationMode = 'target';
        const dialog = new Dialog({
            id: isNew ? 'studio_render_create_camera_preset' : 'studio_render_edit_camera_preset',
            title: isNew
                ? 'studio_render.dialog.create_camera_preset'
                : 'studio_render.dialog.edit_camera_preset',
            width: 640,
            form: createCameraPresetEditorForm(source),
            buttons: ['dialog.confirm', 'dialog.cancel'],
            onFormChange(form) {
                if (form.rotation_mode === rotationMode) return;
                rotationMode = form.rotation_mode;
                if (rotationMode === 'rotation') {
                    const quaternion = getCameraPresetQuaternion(form.position, form.target, form.up);
                    const euler = new THREE.Euler().setFromQuaternion(
                        new THREE.Quaternion().fromArray(quaternion),
                        'YXZ'
                    );
                    this.setFormValues({
                        rotation: [euler.x, euler.y, euler.z].map(value =>
                            roundCameraValue(THREE.MathUtils.radToDeg(value))
                        )
                    });
                } else {
                    const distance = new THREE.Vector3().fromArray(source.camera.position)
                        .distanceTo(new THREE.Vector3().fromArray(source.camera.target));
                    this.setFormValues({
                        target: getCameraTargetFromRotation(form.position, form.rotation, distance)
                            .map(roundCameraValue)
                    });
                }
            },
            onConfirm(form) {
                if (!String(form?.name || '').trim()) return false;
                if (toNumber(form.far, 0) <= toNumber(form.near, 0)) {
                    Blockbench.showQuickMessage(translate(
                        'studio_render.message.preset_invalid_clipping',
                        'Far clipping must be greater than near clipping.'
                    ));
                    return false;
                }
                const saved = saveEditedCameraPreset(source, form);
                if (!saved) return false;
                this.hide();
            }
        });
        dialog.show();
    }

    function createCameraPresetMenuItems() {
        const presets = getProjectCameraPresets();
        const items = presets.map(preset => ({
            id: 'studio_render_camera_preset_' + preset.id,
            name: preset.name,
            icon: preset.camera.projection === 'orthographic' ? 'videocam' : 'photo_camera',
            click: () => applyCameraPreset(preset),
            children: [
                {
                    icon: 'edit',
                    name: 'studio_render.dialog.edit_camera_preset',
                    click: () => openCameraPresetEditor(preset)
                },
                {
                    icon: 'save',
                    name: 'studio_render.menu.camera_presets.update',
                    click: () => updateProjectCameraPreset(preset.id, currentSettings)
                },
                {
                    icon: 'drive_file_rename_outline',
                    name: 'studio_render.button.rename_preset',
                    click: () => promptCameraPresetName({
                        rename: true,
                        preset,
                        onConfirm: name => renameProjectCameraPreset(preset.id, name)
                    })
                },
                {
                    icon: 'delete',
                    name: 'studio_render.button.delete_preset',
                    click: () => deleteProjectCameraPreset(preset.id)
                }
            ]
        }));
        if (!items.length) {
            items.push({
                name: 'studio_render.menu.camera_presets.empty',
                icon: 'bookmark_border',
                click() {}
            });
        }
        items.push(
            '_',
            {
                id: 'studio_render_camera_preset_create',
                name: 'studio_render.menu.camera_presets.create',
                icon: 'add_a_photo',
                click: () => openCameraPresetEditor()
            },
            {
                id: 'studio_render_camera_preset_manage',
                name: 'studio_render.menu.camera_presets.manage',
                icon: 'video_settings',
                click: () => openCameraPresetManagerDialog()
            }
        );
        return items;
    }

    function openCameraPresetMenu(anchor) {
        if (typeof Menu === 'undefined') {
            openCameraPresetManagerDialog();
            return;
        }
        const menu = new Menu(
            'studio_render_camera_presets_menu',
            createCameraPresetMenuItems(),
            { class: 'studio_render_camera_presets_menu' }
        );
        menu.open(anchor?.currentTarget || anchor?.target || anchor || cameraPresetsAction?.node);
    }

    function openStudioRenderSelectorMenu(anchor, id, options, currentValue, onSelect) {
        if (typeof Menu === 'undefined') return;
        const source = typeof options === 'function' ? options() : (options || {});
        const items = Object.entries(source).map(([key, option]) => {
            const normalized = option && typeof option === 'object'
                ? option
                : { name: option || key };
            return {
                id: id + '_' + key,
                name: normalized.name || key,
                icon: normalized.icon || (key === currentValue ? 'radio_button_checked' : 'radio_button_unchecked'),
                color: normalized.color,
                condition: normalized.condition,
                marked: key === currentValue,
                click: event => onSelect(key, event)
            };
        });
        if (!items.length) return;
        new Menu(id, items, { class: 'studio_render_quick_selector_menu' })
            .open(anchor?.currentTarget || anchor?.target || anchor);
    }

    function openStudioRenderViewModeMenu(anchor) {
        const barItems = typeof BarItems !== 'undefined' ? BarItems : window.BarItems;
        const selector = barItems?.view_mode;
        if (!selector) return;

        for (var option_ in selector.options){
            if (selector.options[option_].name === true){
                selector.options[option_].name = tl('action.view_mode.'+option_);
            }
        }
        openStudioRenderSelectorMenu(
            anchor,
            'studio_render_view_mode_menu',
            selector.options,
            selector.value,
            (value, event) => {
                if (typeof selector.change === 'function') selector.change(value, event);
                else selector.set?.(value);
            }
        );
    }

    function openStudioRenderGlobalMaterialMenu(anchor) {
        const barItems = typeof BarItems !== 'undefined' ? BarItems : window.BarItems;
        const selector = barItems?.sa_global_mode;
        const materialOptions = selector?.options || Object.fromEntries(
            Object.entries(window.MaterialManager?.materials || {}).map(([id, material]) => [
                'sa_' + id,
                {
                    name: material?.name || id,
                    icon: material?.icon || 'texture',
                    color: material?.color
                }
            ])
        );
        const currentValue = selector?.value || ('sa_' + (window.ShaderEngine?.globalRenderMode || 'classic'));
        openStudioRenderSelectorMenu(
            anchor,
            'studio_render_global_material_menu',
            materialOptions,
            currentValue,
            (value, event) => {
                if (selector && typeof selector.change === 'function') {
                    selector.change(value, event);
                    return;
                }
                window.ShaderEngine?.requestGlobalRenderModeChange?.(String(value).replace(/^sa_/, ''));
            }
        );
    }

    function requireSelectedCameraPreset(settings) {
        const preset = getCameraPresetById(settings.camera_preset_id);
        if (preset) return preset;
        Blockbench.showQuickMessage(translate('studio_render.message.preset_select', 'Select a project camera preset first.'));
        return null;
    }

    function handleCameraPresetCommand(index, dialog) {
        const settings = getCameraPresetDialogSettings(dialog);
        if (index === 0) {
            const preset = requireSelectedCameraPreset(settings);
            if (!preset) return;
            activeDialog?.hide?.();
            activeDialog = null;
            activeCameraPresetDialog?.hide?.();
            activeCameraPresetDialog = null;
            applyCameraPreset(preset);
            return;
        }
        if (index === 1) {
            openCameraPresetEditor();
            return;
        }

        const preset = requireSelectedCameraPreset(settings);
        if (!preset) return;
        if (index === 2) {
            openCameraPresetEditor(preset);
        } else if (index === 3) {
            updateProjectCameraPreset(preset.id, settings);
        } else if (index === 4) {
            deleteProjectCameraPreset(preset.id);
        }
    }

    const STUDIO_RENDER_SECTION_META = {
        _camera_presets: { label: 'studio_render.group.camera_presets', icon: 'photo_camera' },
        _camera: { label: 'studio_render.group.camera', icon: 'videocam' },
        _output: { label: 'studio_render.group.output', icon: 'photo_size_select_large' },
        _frame: { label: 'studio_render.group.frame', icon: 'crop_free' },
        _look: { label: 'studio_render.group.look', icon: 'palette' },
        _effects: { label: 'studio_render.group.effects', icon: 'auto_awesome' },
        _export: { label: 'studio_render.group.export', icon: 'save_alt' }
    };

    const STUDIO_RENDER_SELECT_ICONS = {
        camera_preset_id: { '': 'center_focus_weak' },
        angle_preset: { view: 'visibility' },
        resolution_preset: {
            hd: 'crop_landscape', uhd: 'photo_size_select_large', dci_4k: 'movie',
            square_4k: 'crop_square', eight_k: 'high_quality', custom: 'tune'
        },
        samples: { 1: 'filter_1', 2: 'filter_2', 3: 'filter_3', 4: 'filter_4', 6: 'filter_6', 8: 'filter_8' },
        tile_size: { auto: 'auto_awesome', 1024: 'grid_4x4', 1536: 'grid_4x4', 2048: 'grid_on', 3072: 'grid_on' },
        capture_area: { full: 'fullscreen', frame: 'crop_free' },
        background_mode: { transparent: 'texture', solid: 'format_color_fill' },
        viewport_bloom_quality: { adaptive: 'auto_awesome', performance: 'speed', balanced: 'balance', high: 'high_quality' },
        destination: { preview: 'visibility', save: 'save_alt', clipboard: 'content_copy', texture: 'texture' }
    };

    function getStudioRenderFormUI() {
        const api = window.LightManagerUI;
        const required = ['bar_display', 'combo_slider', 'compact_select', 'horizontal_select', 'custom_checkbox', 'action_button', 'panel_search'];
        return api && required.every(type => api.formElementTypes?.includes(type)) ? api : null;
    }

    function getStudioRenderSelectOptions(key, options) {
        const source = typeof options === 'function' ? options() : (options || {});
        const iconMap = STUDIO_RENDER_SELECT_ICONS[key] || {};
        const fallbackIcon = key === 'camera_preset_id' ? 'photo_camera' : 'tune';
        return Object.fromEntries(Object.entries(source).map(([optionKey, option]) => {
            if (option && typeof option === 'object') {
                return [optionKey, {
                    ...option,
                    name: translate(option.name || optionKey, option.name || optionKey),
                    icon: option.icon || iconMap[optionKey] || fallbackIcon
                }];
            }
            return [optionKey, {
                name: translate(option, option || optionKey),
                icon: iconMap[optionKey] || fallbackIcon
            }];
        }));
    }

    function makeStudioRenderAction(text, icon, click, extra = {}) {
        return {
            type: 'action_button',
            text,
            title: text,
            icon,
            background: 'var(--color-button)',
            click,
            ...extra
        };
    }

    function enhanceStudioRenderForm(form, options = {}) {
        if (!getStudioRenderFormUI()) return form;
        const enhanced = {};

        Object.entries(form).forEach(([key, original]) => {
            const section = STUDIO_RENDER_SECTION_META[key];
            if (section) {
                enhanced[`studio_section${key}`] = {
                    type: 'bar_display',
                    icon: section.icon,
                    value: translate(section.label, section.label),
                    expand: true,
                    color: 'var(--color-text)'
                };
                return;
            }

            if (key === 'camera_preset_tools') {
                if (options.manager) {
                    const definitions = [
                        ['camera_preset_apply', 'studio_render.button.apply_preset', 'check', 0],
                        ['camera_preset_create', 'studio_render.button.create_preset', 'add', 1],
                        ['camera_preset_edit', 'studio_render.dialog.edit_camera_preset', 'edit', 2],
                        ['camera_preset_update', 'studio_render.button.update_preset', 'save', 3],
                        ['camera_preset_delete', 'studio_render.button.delete_preset', 'delete', 4]
                    ];
                    definitions.forEach(([id, text, icon, index]) => {
                        enhanced[id] = makeStudioRenderAction(text, icon, () => original.click(index));
                    });
                } else {
                    enhanced.camera_preset_apply = makeStudioRenderAction(
                        'studio_render.button.apply_preset', 'check', () => original.click(0)
                    );
                    enhanced.camera_preset_manage = makeStudioRenderAction(
                        'studio_render.action.camera_presets', 'video_settings', () => {
                            getCameraPresetDialogSettings(activeDialog);
                            openCameraPresetManagerDialog();
                        }
                    );
                }
                return;
            }

            if (key === 'frame_tools') {
                enhanced.frame_edit = makeStudioRenderAction(
                    'studio_render.button.edit_frame', 'crop_free', () => original.click(0)
                );
                enhanced.frame_reset = makeStudioRenderAction(
                    'studio_render.button.reset_frame', 'restart_alt', () => original.click(1)
                );
                return;
            }

            if (!original || typeof original !== 'object') {
                enhanced[key] = original;
                return;
            }

            if (original.type === 'select') {
                const selectOptions = getStudioRenderSelectOptions(key, original.options);
                if (key === 'capture_area' || key === 'background_mode') {
                    enhanced[key] = {
                        ...original,
                        type: 'horizontal_select',
                        options: selectOptions,
                        multi_select: false,
                        allow_empty: false,
                        expand: true
                    };
                } else {
                    enhanced[key] = {
                        ...original,
                        type: 'compact_select',
                        options: selectOptions,
                        show_value_text: true,
                        expand: true
                    };
                }
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

            if (original.type === 'range' || key === 'output_scale') {
                const defaultValue = DEFAULT_SETTINGS[key];
                enhanced[key] = {
                    ...original,
                    type: 'combo_slider',
                    resettable: Number.isFinite(defaultValue),
                    reset_value: Number.isFinite(defaultValue) ? defaultValue : original.value,
                    color: key.startsWith('bloom_') ? 'var(--color-accent)' : undefined
                };
                return;
            }

            enhanced[key] = original;
        });

        return enhanced;
    }

    function applyStudioRenderFormLayout(dialog, manager = false) {
        const api = getStudioRenderFormUI();
        if (!api || !dialog?.form) return;
        const groups = manager
            ? [{
                elements: ['camera_preset_apply', 'camera_preset_create', 'camera_preset_edit', 'camera_preset_update', 'camera_preset_delete'],
                gap: '6px'
            }]
            : [
                { elements: ['camera_preset_apply', 'camera_preset_manage'], gap: '6px', flex: { camera_preset_apply: '0 0 auto' } },
                { elements: ['frame_edit', 'frame_reset'], gap: '6px' }
            ];
        api.applyFormGroups(dialog.form, groups);
    }

    function createCameraPresetManagerForm(settings = currentSettings) {
        return enhanceStudioRenderForm({
            _camera_presets: '_',
            camera_preset_id: {
                type: 'select',
                label: 'studio_render.field.camera_preset',
                value: getCameraPresetById(settings.camera_preset_id) ? settings.camera_preset_id : '',
                options: getCameraPresetOptions
            },
            camera_preset_tools: {
                type: 'buttons',
                buttons: [
                    'studio_render.button.apply_preset',
                    'studio_render.button.create_preset',
                    'studio_render.dialog.edit_camera_preset',
                    'studio_render.button.update_preset',
                    'studio_render.button.delete_preset'
                ],
                click(index) {
                    handleCameraPresetCommand(index, activeCameraPresetDialog);
                }
            }
        }, { manager: true });
    }

    function openCameraPresetManagerDialog() {
        activeCameraPresetDialog?.hide?.();
        activeCameraPresetDialog = new Dialog({
            id: 'studio_render_camera_presets',
            title: 'studio_render.dialog.camera_presets',
            width: 600,
            form: createCameraPresetManagerForm(currentSettings),
            buttons: ['dialog.close'],
            onFormChange(form) {
                currentSettings.camera_preset_id = String(form?.camera_preset_id || '');
            },
            onConfirm() {
                saveSettings(currentSettings);
                activeCameraPresetDialog = null;
            },
            onCancel() {
                activeCameraPresetDialog = null;
            }
        });
        activeCameraPresetDialog.show();
        applyStudioRenderFormLayout(activeCameraPresetDialog, true);
    }

    function createDialogForm(settings) {
        return enhanceStudioRenderForm({
            _camera_presets: '_',
            camera_preset_id: {
                type: 'select',
                label: 'studio_render.field.camera_preset',
                value: getCameraPresetById(settings.camera_preset_id) ? settings.camera_preset_id : '',
                options: getCameraPresetOptions
            },
            camera_preset_tools: {
                type: 'buttons',
                buttons: [
                    'studio_render.button.apply_preset',
                    'studio_render.button.create_preset',
                    'studio_render.dialog.edit_camera_preset',
                    'studio_render.button.update_preset',
                    'studio_render.button.delete_preset'
                ],
                click(index) {
                    handleCameraPresetCommand(index, activeDialog);
                }
            },
            _camera: '_',
            angle_preset: {
                type: 'select',
                label: 'studio_render.field.angle',
                value: settings.angle_preset,
                options: getAnglePresetOptions
            },
            zoom: {
                type: 'number',
                label: 'studio_render.field.zoom',
                value: settings.zoom || DEFAULT_ZOOM,
                min: 1,
                max: 200,
                step: 1,
                toggle_enabled: true,
                toggle_default: settings.zoom !== null && settings.zoom !== undefined
            },
            _output: '_',
            resolution_preset: {
                type: 'select',
                label: 'studio_render.field.resolution_preset',
                value: settings.resolution_preset,
                options: {
                    hd: 'studio_render.option.resolution.hd',
                    uhd: 'studio_render.option.resolution.uhd',
                    dci_4k: 'studio_render.option.resolution.dci_4k',
                    square_4k: 'studio_render.option.resolution.square_4k',
                    eight_k: 'studio_render.option.resolution.eight_k',
                    custom: 'studio_render.option.resolution.custom'
                }
            },
            resolution: {
                type: 'vector',
                label: 'studio_render.field.resolution',
                dimensions: 2,
                value: settings.resolution,
                min: 1,
                linked_ratio: false,
                condition: form => form.resolution_preset === 'custom'
            },
            output_scale: {
                type: 'number',
                label: 'studio_render.field.output_scale',
                value: settings.output_scale,
                min: 0.1,
                max: 8,
                step: 0.25,
                condition: form => !!form.show_advanced
            },
            samples: {
                type: 'select',
                label: 'studio_render.field.samples',
                value: settings.samples,
                options: {
                    1: 'studio_render.option.samples.1',
                    2: 'studio_render.option.samples.2',
                    3: 'studio_render.option.samples.3',
                    4: 'studio_render.option.samples.4',
                    6: 'studio_render.option.samples.6',
                    8: 'studio_render.option.samples.8'
                }
            },
            show_advanced: {
                type: 'checkbox',
                label: 'studio_render.field.show_advanced',
                value: settings.show_advanced
            },
            tile_size: {
                type: 'select',
                label: 'studio_render.field.tile_size',
                value: settings.tile_size,
                options: {
                    auto: 'studio_render.option.tile.auto',
                    1024: 'studio_render.option.tile.1024',
                    1536: 'studio_render.option.tile.1536',
                    2048: 'studio_render.option.tile.2048',
                    3072: 'studio_render.option.tile.3072'
                },
                condition: form => !!form.show_advanced
            },
            gpu_status: {
                type: 'buttons',
                label: 'studio_render.field.gpu',
                buttons: [
                    getGpuStatusLabel(
                        getOffscreenPreview()?.renderer ||
                        getPreview()?.renderer
                    )
                ],
                click() {
                    const preview =
                        getOffscreenPreview() ||
                        getPreview();
                    showGpuProfileDetails(preview && preview.renderer);
                },
                condition: form => !!form.show_advanced
            },
            _frame: '_',
            capture_area: {
                type: 'select',
                label: 'studio_render.field.capture_area',
                value: settings.capture_area,
                options: {
                    full: 'studio_render.option.area.full',
                    frame: 'studio_render.option.area.frame'
                }
            },
            match_frame_ratio: {
                type: 'checkbox',
                label: 'studio_render.field.match_frame_ratio',
                value: settings.match_frame_ratio,
                condition: form => form.capture_area === 'frame'
            },
            frame_tools: {
                type: 'buttons',
                buttons: ['studio_render.button.edit_frame', 'studio_render.button.reset_frame'],
                click(index) {
                    const formValues = activeDialog?.getFormResult ? activeDialog.getFormResult() : currentSettings;
                    currentSettings = normalizeForm(formValues);
                    if (index === 0) {
                        currentSettings.capture_area = 'frame';
                        saveSettings(currentSettings);
                        closeActiveDialog();
                        StudioRenderFrame.show(getPreview(), currentSettings);
                    } else {
                        StudioRenderFrame.reset(getPreview(), currentSettings);
                        StudioRenderFrame.show(getPreview(), currentSettings);
                    }
                }
            },
            _look: '_',
            background_mode: {
                type: 'select',
                label: 'studio_render.field.background_mode',
                value: settings.background_mode,
                options: {
                    transparent: 'studio_render.option.background.transparent',
                    solid: 'studio_render.option.background.solid'
                }
            },
            background_color: {
                type: 'color',
                label: 'studio_render.field.background_color',
                value: settings.background_color,
                condition: form => form.background_mode === 'solid'
            },
            shading: {
                type: 'checkbox',
                label: 'studio_render.field.shading',
                value: settings.shading
            },
            show_gizmos: {
                type: 'checkbox',
                label: 'studio_render.field.show_gizmos',
                value: settings.show_gizmos,
                condition: form => !!form.show_advanced
            },
            show_tile_grid: {
                type: 'checkbox',
                label: 'studio_render.field.show_tile_grid',
                value: settings.show_tile_grid,
                condition: form => !!form.show_advanced
            },
            _effects: '_',
            bloom_enabled: {
                type: 'checkbox',
                label: 'studio_render.field.bloom_enabled',
                value: settings.bloom_enabled
            },
            bloom_threshold: {
                type: 'range',
                label: 'studio_render.field.bloom_threshold',
                value: settings.bloom_threshold,
                min: 0,
                max: 4,
                step: 0.01,
                condition: form => !!form.bloom_enabled && !!form.show_advanced
            },
            bloom_soft_knee: {
                type: 'range',
                label: 'studio_render.field.bloom_soft_knee',
                value: settings.bloom_soft_knee,
                min: 0,
                max: 1,
                step: 0.01,
                condition: form => !!form.bloom_enabled && !!form.show_advanced
            },
            bloom_strength: {
                type: 'range',
                label: 'studio_render.field.bloom_strength',
                value: settings.bloom_strength,
                min: 0,
                max: 3,
                step: 0.05,
                condition: form => !!form.bloom_enabled
            },
            bloom_core_strength: {
                type: 'range',
                label: 'studio_render.field.bloom_core_strength',
                value: settings.bloom_core_strength,
                min: 0,
                max: 2,
                step: 0.02,
                condition: form => !!form.bloom_enabled && !!form.show_advanced
            },
            bloom_core_radius: {
                type: 'range',
                label: 'studio_render.field.bloom_core_radius',
                value: settings.bloom_core_radius,
                min: 0.25,
                max: 12,
                step: 0.05,
                condition: form => !!form.bloom_enabled && !!form.show_advanced
            },
            bloom_halo_strength: {
                type: 'range',
                label: 'studio_render.field.bloom_halo_strength',
                value: settings.bloom_halo_strength,
                min: 0,
                max: 2,
                step: 0.02,
                condition: form => !!form.bloom_enabled && !!form.show_advanced
            },
            bloom_radius: {
                type: 'range',
                label: 'studio_render.field.bloom_radius',
                value: settings.bloom_radius,
                min: 1,
                max: 128,
                step: 1,
                condition: form => !!form.bloom_enabled && !!form.show_advanced
            },
            bloom_hdr_strength: {
                type: 'range',
                label: 'studio_render.field.bloom_hdr_strength',
                value: settings.bloom_hdr_strength,
                min: 0,
                max: 4,
                step: 0.05,
                condition: form => !!form.bloom_enabled && !!form.show_advanced
            },
            bloom_emissive_strength: {
                type: 'range',
                label: 'studio_render.field.bloom_emissive_strength',
                value: settings.bloom_emissive_strength,
                min: 0,
                max: 6,
                step: 0.05,
                condition: form => !!form.bloom_enabled
            },
            bloom_occlusion: {
                type: 'checkbox',
                label: 'studio_render.field.bloom_occlusion',
                value: settings.bloom_occlusion,
                condition: form => !!form.bloom_enabled && !!form.show_advanced
            },
            viewport_bloom_enabled: {
                type: 'checkbox',
                label: 'studio_render.field.viewport_bloom_enabled',
                value: settings.viewport_bloom_enabled,
                condition: form => !!form.bloom_enabled
            },
            viewport_bloom_fps: {
                type: 'range',
                label: 'studio_render.field.viewport_bloom_fps',
                value: settings.viewport_bloom_fps,
                min: 0,
                max: 144,
                step: 1,
                condition: form => !!form.bloom_enabled && !!form.viewport_bloom_enabled && !!form.show_advanced
            },
            viewport_bloom_quality: {
                type: 'select',
                label: 'studio_render.field.viewport_bloom_quality',
                value: settings.viewport_bloom_quality,
                options: {
                    adaptive: 'studio_render.option.viewport_bloom.adaptive',
                    performance: 'studio_render.option.viewport_bloom.performance',
                    balanced: 'studio_render.option.viewport_bloom.balanced',
                    high: 'studio_render.option.viewport_bloom.high'
                },
                condition: form => !!form.bloom_enabled && !!form.viewport_bloom_enabled && !!form.show_advanced
            },
            color_grading_enabled: {
                type: 'checkbox',
                label: 'studio_render.field.color_grading_enabled',
                value: settings.color_grading_enabled
            },
            exposure: {
                type: 'range',
                label: 'studio_render.field.exposure',
                value: settings.exposure,
                min: 0.1,
                max: 4,
                step: 0.05,
                condition: form => !!form.color_grading_enabled
            },
            contrast: {
                type: 'range',
                label: 'studio_render.field.contrast',
                value: settings.contrast,
                min: 0,
                max: 3,
                step: 0.05,
                condition: form => !!form.color_grading_enabled
            },
            saturation: {
                type: 'range',
                label: 'studio_render.field.saturation',
                value: settings.saturation,
                min: 0,
                max: 3,
                step: 0.05,
                condition: form => !!form.color_grading_enabled
            },
            temperature: {
                type: 'range',
                label: 'studio_render.field.temperature',
                value: settings.temperature,
                min: -1,
                max: 1,
                step: 0.02,
                condition: form => !!form.color_grading_enabled && !!form.show_advanced
            },
            tint: {
                type: 'range',
                label: 'studio_render.field.tint',
                value: settings.tint,
                min: -1,
                max: 1,
                step: 0.02,
                condition: form => !!form.color_grading_enabled && !!form.show_advanced
            },
            vignette: {
                type: 'range',
                label: 'studio_render.field.vignette',
                value: settings.vignette,
                min: 0,
                max: 1,
                step: 0.02,
                condition: form => !!form.color_grading_enabled
            },
            _export: '_',
            destination: {
                type: 'select',
                label: 'studio_render.field.destination',
                value: settings.destination,
                options: {
                    preview: 'studio_render.option.destination.preview',
                    save: 'studio_render.option.destination.save',
                    clipboard: 'studio_render.option.destination.clipboard',
                    texture: 'studio_render.option.destination.texture'
                }
            },
            file_name: {
                type: 'text',
                label: 'studio_render.field.file_name',
                value: settings.file_name
            }
        });
    }

    function createSceneComposerForm(settings) {
        const environment = window.LightflowEnvironment?.settings || {};
        return {
            _realtime: '_',
            viewport_bloom_enabled: {
                type: 'checkbox',
                label: 'studio_render.field.viewport_bloom_enabled',
                value: settings.viewport_bloom_enabled
            },
            viewport_bloom_fps: {
                type: 'range',
                label: 'studio_render.field.viewport_bloom_fps',
                value: settings.viewport_bloom_fps,
                min: 0,
                max: 144,
                step: 1,
                condition: form => !!form.viewport_bloom_enabled
            },
            viewport_bloom_quality: {
                type: 'select',
                label: 'studio_render.field.viewport_bloom_quality',
                value: settings.viewport_bloom_quality,
                options: {
                    adaptive: 'studio_render.option.viewport_bloom.adaptive',
                    performance: 'studio_render.option.viewport_bloom.performance',
                    balanced: 'studio_render.option.viewport_bloom.balanced',
                    high: 'studio_render.option.viewport_bloom.high'
                },
                condition: form => !!form.viewport_bloom_enabled
            },
            _bloom: '_',
            bloom_enabled: {
                type: 'checkbox',
                label: 'studio_render.field.bloom_enabled',
                value: settings.bloom_enabled
            },
            bloom_threshold: {
                type: 'range',
                label: 'studio_render.field.bloom_threshold',
                value: settings.bloom_threshold,
                min: 0,
                max: 4,
                step: 0.01,
                condition: form => !!form.bloom_enabled
            },
            bloom_soft_knee: {
                type: 'range',
                label: 'studio_render.field.bloom_soft_knee',
                value: settings.bloom_soft_knee,
                min: 0,
                max: 1,
                step: 0.01,
                condition: form => !!form.bloom_enabled
            },
            bloom_strength: {
                type: 'range',
                label: 'studio_render.field.bloom_strength',
                value: settings.bloom_strength,
                min: 0,
                max: 3,
                step: 0.05,
                condition: form => !!form.bloom_enabled
            },
            bloom_core_strength: {
                type: 'range',
                label: 'studio_render.field.bloom_core_strength',
                value: settings.bloom_core_strength,
                min: 0,
                max: 2,
                step: 0.02,
                condition: form => !!form.bloom_enabled
            },
            bloom_core_radius: {
                type: 'range',
                label: 'studio_render.field.bloom_core_radius',
                value: settings.bloom_core_radius,
                min: 0.25,
                max: 12,
                step: 0.05,
                condition: form => !!form.bloom_enabled
            },
            bloom_halo_strength: {
                type: 'range',
                label: 'studio_render.field.bloom_halo_strength',
                value: settings.bloom_halo_strength,
                min: 0,
                max: 2,
                step: 0.02,
                condition: form => !!form.bloom_enabled
            },
            bloom_radius: {
                type: 'range',
                label: 'studio_render.field.bloom_radius',
                value: settings.bloom_radius,
                min: 1,
                max: 128,
                step: 1,
                condition: form => !!form.bloom_enabled
            },
            bloom_hdr_strength: {
                type: 'range',
                label: 'studio_render.field.bloom_hdr_strength',
                value: settings.bloom_hdr_strength,
                min: 0,
                max: 4,
                step: 0.05,
                condition: form => !!form.bloom_enabled
            },
            bloom_emissive_strength: {
                type: 'range',
                label: 'studio_render.field.bloom_emissive_strength',
                value: settings.bloom_emissive_strength,
                min: 0,
                max: 6,
                step: 0.05,
                condition: form => !!form.bloom_enabled
            },
            bloom_occlusion: {
                type: 'checkbox',
                label: 'studio_render.field.bloom_occlusion',
                value: settings.bloom_occlusion,
                condition: form => !!form.bloom_enabled
            },
            _grade: '_',
            color_grading_enabled: {
                type: 'checkbox',
                label: 'studio_render.field.color_grading_enabled',
                value: settings.color_grading_enabled
            },
            exposure: {
                type: 'range',
                label: 'studio_render.field.exposure',
                value: settings.exposure,
                min: 0.1,
                max: 4,
                step: 0.05,
                condition: form => !!form.color_grading_enabled
            },
            contrast: {
                type: 'range',
                label: 'studio_render.field.contrast',
                value: settings.contrast,
                min: 0,
                max: 3,
                step: 0.05,
                condition: form => !!form.color_grading_enabled
            },
            saturation: {
                type: 'range',
                label: 'studio_render.field.saturation',
                value: settings.saturation,
                min: 0,
                max: 3,
                step: 0.05,
                condition: form => !!form.color_grading_enabled
            },
            temperature: {
                type: 'range',
                label: 'studio_render.field.temperature',
                value: settings.temperature,
                min: -1,
                max: 1,
                step: 0.02,
                condition: form => !!form.color_grading_enabled
            },
            tint: {
                type: 'range',
                label: 'studio_render.field.tint',
                value: settings.tint,
                min: -1,
                max: 1,
                step: 0.02,
                condition: form => !!form.color_grading_enabled
            },
            vignette: {
                type: 'range',
                label: 'studio_render.field.vignette',
                value: settings.vignette,
                min: 0,
                max: 1,
                step: 0.02,
                condition: form => !!form.color_grading_enabled
            },
            _environment: '_',
            environment_enabled: {
                type: 'checkbox',
                label: 'lightflow_environment.field.enabled',
                value: environment.enabled !== false,
                condition: () => !!window.LightflowEnvironment
            },
            environment_preset: {
                type: 'select',
                label: 'lightflow_environment.field.preset',
                value: environment.preset || 'vanilla',
                options: {
                    vanilla: 'Minecraft Vanilla',
                    vibrant_visuals: 'Minecraft Vibrant Visuals',
                    rendercraft: 'Rendercraft'
                },
                condition: () => !!window.LightflowEnvironment
            },
            environment_time: {
                type: 'range',
                label: 'lightflow_environment.field.time',
                value: Number(environment.time) || 6000,
                min: 0,
                max: 23999,
                step: 100,
                condition: () => !!window.LightflowEnvironment
            },
            environment_strength: {
                type: 'range',
                label: 'lightflow_environment.field.environment',
                value: Number(environment.environment_strength) || 0.75,
                min: 0,
                max: 4,
                step: 0.05,
                condition: () => !!window.LightflowEnvironment
            }
        };
    }

    function refreshSceneComposerPreviews() {
        const preview = getPreview();
        if (!preview) return;
        patchViewportComposer(preview);
        if (typeof window.LightflowRequestPreviewRender === 'function') {
            window.LightflowRequestPreviewRender({ cause: 'scene_composer_update' });
            return;
        }
        if (sceneComposerRefreshFrame !== null) return;
        const revision = sceneComposerRevision;
        const project = window.Project || null;
        const render = () => {
            sceneComposerRefreshFrame = null;
            if (revision !== sceneComposerRevision || project !== (window.Project || null)) return;
            const activePreview = getPreview();
            activePreview?.render?.();
        };
        if (typeof requestAnimationFrame === 'function') {
            sceneComposerRefreshFrame = requestAnimationFrame(render);
        } else {
            sceneComposerRefreshFrame = 'microtask';
            queueMicrotask(render);
        }
    }

    function beginSceneComposerUndo() {
        if (activeSceneComposerUndo || typeof Undo === 'undefined') return !!activeSceneComposerUndo;
        const aspects = { [SCENE_COMPOSER_UNDO_ASPECT]: true };
        Undo.initEdit(aspects);
        activeSceneComposerUndo = { aspects, changed: false };
        return true;
    }

    function markSceneComposerUndoChanged() {
        if (activeSceneComposerUndo) activeSceneComposerUndo.changed = true;
    }

    function finishSceneComposerUndo() {
        const active = activeSceneComposerUndo;
        if (!active) return false;
        activeSceneComposerUndo = null;
        if (active.changed) Undo.finishEdit(translate('studio_render.undo.edit_composer', 'Edit Scene Composer'), active.aspects);
        else Undo.cancelEdit(false);
        return true;
    }

    function cancelSceneComposerUndo(revert = false) {
        if (!activeSceneComposerUndo) return false;
        activeSceneComposerUndo = null;
        Undo.cancelEdit(!!revert);
        return true;
    }

    function registerSceneComposerUndoHooks() {
        if (sceneComposerUndoHooks || typeof Blockbench === 'undefined') return;
        const createSaveListener = Blockbench.on('create_undo_save', event => {
            if (!event?.aspects?.[SCENE_COMPOSER_UNDO_ASPECT] || !event.save) return;
            event.save[SCENE_COMPOSER_UNDO_ASPECT] = JSON.stringify(currentSettings);
        });
        const loadSaveListener = Blockbench.on('load_undo_save', event => {
            const serialized = event?.save?.[SCENE_COMPOSER_UNDO_ASPECT];
            if (serialized === undefined) return;
            try {
                currentSettings = normalizeForm(Object.assign({}, DEFAULT_SETTINGS, JSON.parse(serialized)));
                saveSettings(currentSettings);
                syncSceneComposerPanel();
                refreshSceneComposerPreviews();
            } catch (error) {
                console.warn('[Studio Render] Could not restore Scene Composer undo state.', error);
            }
        });
        sceneComposerUndoHooks = {
            delete() {
                createSaveListener?.delete?.();
                loadSaveListener?.delete?.();
                sceneComposerUndoHooks = null;
            }
        };
    }

    const SCENE_COMPOSER_PANEL_GROUP_PREFIX = '_composer_group_';
    const SCENE_COMPOSER_PANEL_GROUPS = [
        {
            id: 'preview', label: 'studio_render.composer.group.preview', icon: 'visibility', color: '#75D7FF',
            entries: [
                { subsection: 'studio_render.composer.section.playback', icon: 'speed' },
                'viewport_bloom_enabled', 'viewport_bloom_quality', 'viewport_bloom_fps'
            ]
        },
        {
            id: 'bloom', label: 'studio_render.composer.group.bloom', icon: 'flare', color: '#F58BC4',
            entries: [
                'bloom_enabled',
                { subsection: 'studio_render.composer.section.threshold', icon: 'filter_alt' },
                'bloom_threshold', 'bloom_soft_knee', 'bloom_strength',
                { subsection: 'studio_render.composer.section.core', icon: 'brightness_high' },
                'bloom_core_strength', 'bloom_core_radius',
                { subsection: 'studio_render.composer.section.halo', icon: 'blur_on' },
                'bloom_halo_strength', 'bloom_radius',
                { subsection: 'studio_render.composer.section.sources', icon: 'auto_awesome' },
                'bloom_hdr_strength', 'bloom_emissive_strength', 'bloom_occlusion'
            ]
        },
        {
            id: 'grading', label: 'studio_render.composer.group.grading', icon: 'palette', color: '#C5A6E8',
            entries: [
                'color_grading_enabled',
                { subsection: 'studio_render.composer.section.image', icon: 'tonality' },
                'exposure', 'contrast', 'saturation',
                { subsection: 'studio_render.composer.section.white_balance', icon: 'thermostat' },
                'temperature', 'tint',
                { subsection: 'studio_render.composer.section.finishing', icon: 'center_focus_weak' },
                'vignette'
            ]
        }
    ];

    const SCENE_COMPOSER_ESSENTIAL_ENTRIES = Object.freeze({
        preview: new Set(['viewport_bloom_enabled', 'viewport_bloom_quality', 'viewport_bloom_fps']),
        bloom: new Set(['bloom_enabled', 'bloom_threshold', 'bloom_strength', 'bloom_halo_strength', 'bloom_radius']),
        grading: new Set(['color_grading_enabled', 'exposure', 'contrast', 'saturation'])
    });

    function sceneComposerValuesEqual(left, right) {
        if (typeof left === 'boolean' || typeof right === 'boolean') return left === right;
        if (left === '' || right === '' || left === null || right === null) return left === right;
        if (Number.isFinite(Number(left)) && Number.isFinite(Number(right))) {
            return Math.abs(Number(left) - Number(right)) < 1e-6;
        }
        return left === right;
    }

    function getSceneComposerGroupState(group, settings) {
        const keys = group.entries.filter(entry => typeof entry === 'string');
        const modified = keys.some(key => Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)
            && !sceneComposerValuesEqual(settings[key], DEFAULT_SETTINGS[key]));
        const enabledKey = keys.find(key => /_enabled$/.test(key));
        const active = enabledKey ? settings[enabledKey] !== false : true;
        const summaries = {
            preview: `${translate('studio_render.field.viewport_bloom_quality', 'Quality')}: ${settings.viewport_bloom_quality || 'adaptive'}`,
            bloom: `${Number(settings.bloom_strength || 0).toFixed(2)} · Halo ${Number(settings.bloom_halo_strength || 0).toFixed(2)}`,
            grading: `Exp ${Number(settings.exposure || 0).toFixed(2)} · Sat ${Number(settings.saturation || 0).toFixed(2)}`
        };
        return { modified, active, summary: summaries[group.id] || '' };
    }

    function combineSceneComposerPanelCondition(groupKey, groupOpen, originalCondition) {
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

    function createSceneComposerPanelControl(key, source, groupKey, groupOpen, color) {
        const design = window.LightManagerUI.formDesign;
        const control = {
            ...source,
            default: DEFAULT_SETTINGS[key],
            modified: result => !sceneComposerValuesEqual(result?.[key] ?? source.value, DEFAULT_SETTINGS[key]),
            title: source.description || source.label,
            description: source.description || source.label,
            condition: combineSceneComposerPanelCondition(groupKey, groupOpen, source.condition)
        };
        const originalOnBefore = control.onBefore;
        const originalOnAfter = control.onAfter;
        const withUndo = config => Object.assign(config, {
            onBefore: event => {
                beginSceneComposerUndo();
                originalOnBefore?.(event);
            },
            onAfter: event => {
                try {
                    originalOnAfter?.(event);
                } finally {
                    finishSceneComposerUndo();
                }
            }
        });
        if (control.type === 'select') {
            control.options = getStudioRenderSelectOptions(key, control.options);
            delete control.type;
            return withUndo(design.enum(control));
        }
        if (control.type === 'checkbox') {
            delete control.type;
            return withUndo(design.checkbox({ ...control, icon_size: '22px' }));
        }
        if (control.type === 'range' || control.type === 'number') {
            const defaultValue = Number(DEFAULT_SETTINGS[key]);
            return withUndo({
                ...control,
                type: 'combo_slider',
                color,
                resettable: Number.isFinite(defaultValue),
                reset_value: Number.isFinite(defaultValue) ? defaultValue : control.value
            });
        }
        return withUndo(control);
    }

    function createSceneComposerPanelForm(settings) {
        const design = window.LightManagerUI?.formDesign;
        if (!design?.tabs || !design?.search) {
            return {
                viewport_bloom_enabled: {
                    type: 'checkbox', label: 'studio_render.field.viewport_bloom_enabled', value: settings.viewport_bloom_enabled
                },
                bloom_enabled: {
                    type: 'checkbox', label: 'studio_render.field.bloom_enabled', value: settings.bloom_enabled
                },
                bloom_strength: {
                    type: 'range', label: 'studio_render.field.bloom_strength', value: settings.bloom_strength,
                    min: 0, max: 3, step: 0.05, condition: form => !!form.bloom_enabled
                },
                composer_advanced: {
                    type: 'buttons', buttons: ['studio_render.action.open_advanced'], click: openSceneComposerDialog
                }
            };
        }
        const source = createSceneComposerForm(settings);
        const form = {
            _composer_mode: design.tabs({
                value: sceneComposerPanelMode,
                description: 'Composer control level',
                options: {
                    essentials: { name: translate('studio_render.workflow.essentials') },
                    advanced: { name: translate('studio_render.workflow.advanced') }
                }
            }),
            _composer_search: design.search({
                placeholder: 'Find setting',
                active_label: 'Active only',
                collapse_label: 'Collapse all'
            })
        };

        SCENE_COMPOSER_PANEL_GROUPS.forEach(group => {
            const groupKey = SCENE_COMPOSER_PANEL_GROUP_PREFIX + group.id;
            const groupOpen = sceneComposerPanelGroupsOpen[group.id] !== false;
            const groupState = getSceneComposerGroupState(group, settings);
            form[groupKey] = design.group({
                label: group.label,
                label_icon: group.icon,
                label_icon_color: group.color,
                value: groupOpen,
                icon_size: '20px',
                icon_color_on: group.color,
                icon_color_off: `color-mix(in srgb, ${group.color} 55%, var(--color-subtle_text))`,
                description: group.label,
                summary: groupOpen ? '' : groupState.summary,
                modified: form => group.entries.filter(entry => typeof entry === 'string').some(key => (
                    Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key) &&
                    !sceneComposerValuesEqual(
                        form && Object.prototype.hasOwnProperty.call(form, key) ? form[key] : settings[key],
                        DEFAULT_SETTINGS[key]
                    )
                )),
                modified_label: 'Contains modified settings',
                modified_color: group.color,
                active: groupState.active
            });
            let subsectionIndex = 0;
            group.entries.forEach(entry => {
                if (
                    sceneComposerPanelMode === 'essentials' &&
                    typeof entry === 'string' &&
                    !SCENE_COMPOSER_ESSENTIAL_ENTRIES[group.id]?.has(entry)
                ) return;
                if (entry && typeof entry === 'object' && entry.subsection) {
                    if (sceneComposerPanelMode === 'essentials') return;
                    form[`_composer_subsection_${group.id}_${subsectionIndex++}`] = design.subsection({
                        value: translate(entry.subsection, entry.subsection),
                        icon: entry.icon,
                        icon_color: group.color,
                        separator_color: `color-mix(in srgb, ${group.color} 58%, var(--color-border))`,
                        border_left: `1px solid color-mix(in srgb, ${group.color} 72%, var(--color-border))`,
                        background: `color-mix(in srgb, ${group.color} 4%, transparent)`,
                        margin_left: '4px',
                        margin_right: '4px',
                        condition: combineSceneComposerPanelCondition(groupKey, groupOpen)
                    });
                    return;
                }
                if (source[entry]) {
                    form[entry] = createSceneComposerPanelControl(entry, source[entry], groupKey, groupOpen, group.color);
                }
            });
        });
        const modifiedCount = SCENE_COMPOSER_PANEL_GROUPS.reduce((count, group) => (
            count + (getSceneComposerGroupState(group, settings).modified ? 1 : 0)
        ), 0);
        const composerStatus = {
            type: 'bar_display',
            value: translate(!settings.bloom_enabled ? 'studio_render.workflow.bloom_off' : settings.viewport_bloom_enabled ? 'studio_render.workflow.preview_on' : 'studio_render.workflow.preview_off'),
            search_ignore: true,
            paragraph: true,
            expand: true,
            color: settings.bloom_enabled && !settings.viewport_bloom_enabled ? 'var(--color-warning)' : 'var(--color-text)',
            font_size: '12px'
        };
        return {_composer_status: composerStatus, ...form};
    }

    function syncSceneComposerPanel() {
        if (!sceneComposerPanel?.form || syncingSceneComposerPanel) return;
        syncingSceneComposerPanel = true;
        const scrollContainer = sceneComposerPanel.node?.querySelector?.('.form');
        const scrollTop = scrollContainer?.scrollTop || 0;
        sceneComposerPanel.form.form_config = createSceneComposerPanelForm(currentSettings);
        sceneComposerPanel.form.buildForm();
        const nextScrollContainer = sceneComposerPanel.node?.querySelector?.('.form');
        if (nextScrollContainer) nextScrollContainer.scrollTop = scrollTop;
        syncingSceneComposerPanel = false;
    }

    function establishSceneComposerPanelAttachment() {
        if (window.LightManagerUI?.workspace && sceneComposerPanel) {
            sceneComposerAttachmentEstablished = true;
            return window.LightManagerUI.workspace.register(sceneComposerPanel);
        }
        if (sceneComposerAttachmentEstablished || !sceneComposerPanel) return false;
        const overridesPanel = window.Panels?.material_properties;
        if (!overridesPanel) return false;
        if (sceneComposerPanel.getHostPanel?.() !== overridesPanel) {
            overridesPanel.attachPanel(sceneComposerPanel, 2);
        } else {
            overridesPanel.update?.();
        }
        sceneComposerAttachmentEstablished = true;
        return true;
    }

    function applySceneComposerForm(form, persist) {
        const previousSettings = JSON.stringify(currentSettings);
        const next = Object.assign({}, currentSettings, form || {});
        delete next.environment_enabled;
        delete next.environment_preset;
        delete next.environment_time;
        delete next.environment_strength;
        currentSettings = normalizeForm(next);
        if (previousSettings !== JSON.stringify(currentSettings)) markSceneComposerUndoChanged();
        if (persist) saveSettings(currentSettings);

        if (window.LightflowEnvironment && form) {
            const environmentSettings = {};
            let appliedEnvironmentPreset = false;
            if (Object.prototype.hasOwnProperty.call(form, 'environment_enabled')) environmentSettings.enabled = form.environment_enabled;
            const requestedEnvironmentPreset = Object.prototype.hasOwnProperty.call(form, 'environment_preset')
                ? form.environment_preset
                : null;
            const currentEnvironmentPreset = window.LightflowEnvironment.settings?.preset;
            if (
                requestedEnvironmentPreset &&
                requestedEnvironmentPreset !== currentEnvironmentPreset &&
                typeof window.LightflowEnvironment.applyPreset === 'function'
            ) {
                window.LightflowEnvironment.applyPreset(requestedEnvironmentPreset, {
                    cause: 'scene_composer_preset',
                    render: false,
                    forceShadow: false,
                    syncPanel: true
                });
                appliedEnvironmentPreset = true;
            } else if (requestedEnvironmentPreset) {
                environmentSettings.preset = requestedEnvironmentPreset;
            }
            if (Object.prototype.hasOwnProperty.call(form, 'environment_time')) environmentSettings.time = form.environment_time;
            if (!appliedEnvironmentPreset && Object.prototype.hasOwnProperty.call(form, 'environment_strength')) {
                environmentSettings.environment_strength = form.environment_strength;
            }
            if (Object.keys(environmentSettings).length) {
                window.LightflowEnvironment.setSettings(environmentSettings, {
                    cause: 'scene_composer',
                    render: false,
                    forceShadow: false
                });
            }
            if (appliedEnvironmentPreset && activeComposerDialog?.form) {
                syncingSceneComposerDialog = true;
                try {
                    activeComposerDialog.form.form_config = createSceneComposerForm(currentSettings);
                    activeComposerDialog.form.buildForm();
                } finally {
                    syncingSceneComposerDialog = false;
                }
            }
        }

        refreshSceneComposerPreviews();
    }

    function openSceneComposerDialog() {
        currentSettings = loadSettings();
        const initialEnvironment = window.LightflowEnvironment?.settings || null;
        beginSceneComposerUndo();
        activeComposerDialog = new Dialog('lightflow_scene_composer_dialog', {
            title: 'studio_render.action.scene_composer',
            width: 680,
            form: createSceneComposerForm(currentSettings),
            onFormChange(form) {
                if (syncingSceneComposerDialog) return;
                applySceneComposerForm(form, false);
            },
            onConfirm(form) {
                applySceneComposerForm(form, true);
                finishSceneComposerUndo();
                activeComposerDialog = null;
            },
            onCancel() {
                currentSettings = loadSettings();
                if (initialEnvironment && window.LightflowEnvironment) {
                    window.LightflowEnvironment.setSettings(initialEnvironment, {
                        cause: 'scene_composer_cancel',
                        render: false,
                        forceShadow: true
                    });
                }
                refreshSceneComposerPreviews();
                cancelSceneComposerUndo(false);
                activeComposerDialog = null;
            }
        });
        activeComposerDialog.show();
    }

    let studioWorkflowTab = 'output';
    function studioOutputSummary(settings) {
        const size = computeOutputSize(normalizeForm(settings), null);
        return `${size.width} × ${size.height} px · ${translate('studio_render.option.background.' + settings.background_mode, settings.background_mode)} · ${settings.samples || 1}×`;
    }
    function createStudioWorkflowForm(settings) {
        const source = createDialogForm(settings);
        // Keep every original control/data binding; tabs filter presentation only.
        const form = {
            _studio_workflow_tab: {
                type: FormElement.types.horizontal_select ? 'horizontal_select' : 'select',
                label: false, value: studioWorkflowTab,
                options: FormElement.types.horizontal_select
                    ? {camera: {name: 'studio_render.workflow.camera'}, output: {name: 'studio_render.workflow.output'}, image: {name: 'studio_render.workflow.image'}}
                    : {camera: 'studio_render.workflow.camera', output: 'studio_render.workflow.output', image: 'studio_render.workflow.image'}
            },
            _studio_summary: {type: 'info', text: studioOutputSummary(settings)},
            show_advanced: {...source.show_advanced, condition: result => (result._studio_workflow_tab || studioWorkflowTab) !== 'camera'}
        };
        let section = 'camera';
        Object.entries(source).forEach(([key, value]) => {
            if (key === 'show_advanced') return;
            if (/^(studio_section)?_(camera_presets|camera|frame)$/.test(key)) section = 'camera';
            if (/^(studio_section)?_(output|export)$/.test(key)) section = 'output';
            if (/^(studio_section)?_(look|effects)$/.test(key)) section = 'image';
            const tab = section;
            const control = typeof value === 'object' ? {...value} : {type: 'info', text: ''};
            const condition = control.condition;
            control.condition = result => (result._studio_workflow_tab || studioWorkflowTab) === tab && (!condition || Condition(condition, result));
            form[key] = control;
        });
        return form;
    }

    function openStudioRenderDialog() {
        currentSettings = loadSettings();
        activeDialog = new Dialog({
            id: 'studio_render',
            title: 'studio_render.dialog.title',
            width: 680,
            form: createStudioWorkflowForm(currentSettings),
            buttons: ['studio_render.button.render', 'dialog.cancel'],
            onFormChange(form) {
                if (['camera', 'output', 'image'].includes(form._studio_workflow_tab)) studioWorkflowTab = form._studio_workflow_tab;
                const next = normalizeForm(form);
                if (next.resolution_preset !== 'custom') {
                    this.setFormValues({ resolution: next.resolution }, false);
                }
                currentSettings = next;
                const summary = this.form?.form_data?._studio_summary?.bar?.querySelector('.small_text');
                if (summary) summary.textContent = studioOutputSummary(next);
                StudioRenderFrame.updateNode();
                refreshSceneComposerPreviews();
            },
            onConfirm(form) {
                const settings = normalizeForm(form);
                saveSettings(settings);
                this.hide();
                activeDialog = null;
                renderWithSettings(settings);
            },
            onCancel() {
                currentSettings = loadSettings();
                StudioRenderFrame.updateNode();
                refreshSceneComposerPreviews();
                activeDialog = null;
            }
        });
        activeDialog.show();
        applyStudioRenderFormLayout(activeDialog);
    }

    function addStyles() {
        const palette = Array.isArray(globalThis.markerColors) ? globalThis.markerColors : [];
        const previewColor = palette[0]?.pastel || '#A2EBFF';
        const bloomColor = palette[8]?.pastel || '#FFA5D5';
        stylesheet = Blockbench.addCSS(`
            .lightflow_render_progress {
                position: absolute; left: 12px; bottom: 12px; z-index: 35;
                display: flex; align-items: center; gap: 12px; max-width: calc(100% - 24px);
                padding: 6px 8px; border: 1px solid var(--color-border); border-radius: 4px;
                background: var(--color-ui); color: var(--color-text); font-size: 13px;
            }
            .lightflow_render_progress span { min-width: 0; overflow-wrap: anywhere; }
            .lightflow_render_progress button { min-height: 28px; flex-shrink: 0; }
            #studio_render .form_bar__studio_workflow_tab { position: sticky; top: 0; z-index: 2; background: var(--color-ui); }
            #studio_render .dialog_content {
                scrollbar-gutter: stable;
            }
            #studio_render .form_bar_studio_section_camera_presets,
            #studio_render .form_bar_studio_section_camera,
            #studio_render .form_bar_studio_section_output,
            #studio_render .form_bar_studio_section_frame,
            #studio_render .form_bar_studio_section_look,
            #studio_render .form_bar_studio_section_effects,
            #studio_render .form_bar_studio_section_export,
            #studio_render_camera_presets .form_bar_studio_section_camera_presets {
                min-height: 34px;
                margin: 12px 0 5px;
                padding: 0 !important;
                border-left: 3px solid ${previewColor};
                border-bottom: 1px solid var(--color-border);
                background: color-mix(in srgb, var(--color-back) 78%, transparent) !important;
            }
            #studio_render .form_bar_studio_section_camera_presets,
            #studio_render_camera_presets .form_bar_studio_section_camera_presets {
                margin-top: 0;
            }
            #studio_render .form_bar_studio_section_effects {
                border-left-color: ${bloomColor};
            }
            #studio_render [class*="form_bar_studio_section_"] .bar_display,
            #studio_render_camera_presets [class*="form_bar_studio_section_"] .bar_display {
                min-height: 34px;
                padding: 0 10px;
                gap: 8px;
                justify-content: flex-start !important;
                letter-spacing: 0.02em;
            }
            #studio_render .compact_dropdown_select,
            #studio_render_camera_presets .compact_dropdown_select {
                min-width: 148px;
            }
            #studio_render .compact_dropdown_select:focus-visible,
            #studio_render .custom_checkbox:focus-visible,
            #studio_render .light_manager_action_button:focus-visible,
            #studio_render_camera_presets .compact_dropdown_select:focus-visible,
            #studio_render_camera_presets .light_manager_action_button:focus-visible {
                outline: 2px solid var(--color-accent);
                outline-offset: -2px;
            }
            #studio_render .custom_checkbox,
            #studio_render .light_manager_action_button,
            #studio_render_camera_presets .light_manager_action_button {
                border-radius: 3px;
                transition: background-color 120ms ease, color 120ms ease;
            }
            #studio_render .custom_checkbox:hover,
            #studio_render .light_manager_action_button:hover,
            #studio_render_camera_presets .light_manager_action_button:hover {
                background-color: var(--color-button);
            }
            #studio_render .form_row_group,
            #studio_render_camera_presets .form_row_group {
                margin: 3px 0;
            }
            #studio_render_frame {
                position: absolute;
                z-index: 30;
                box-sizing: border-box;
                border: 2px dashed var(--color-accent);
                outline: 1px solid rgba(0, 0, 0, 0.55);
                background: transparent;
                cursor: move;
                pointer-events: auto;
                min-width: 48px;
                min-height: 48px;
            }
            #studio_render_frame::before {
                content: "";
                position: absolute;
                inset: 0;
                box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.23);
                pointer-events: none;
            }
            .studio_render_frame_label {
                position: absolute;
                left: 50%;
                top: 0px;
                transform: translateX(-50%);
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 22px;
                max-width: calc(100% - 16px);
                padding: 1px 10px;
                box-sizing: border-box;
                background: rgba(18, 22, 29, 0.86);
                color: var(--color-light);
                //border: 1px solid rgba(45, 143, 255, 0.70);
                border-radius: 3px;
                //font-size: 12px;
                line-height: 16px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                user-select: none;
                font-family: var(--font-code);
            }
            .studio_render_frame_handle {
                position: absolute;
                width: 20px;
                height: 20px;
                box-sizing: border-box;
                background: transparent;
                border-color: rgba(230, 236, 248, 0.96);
                border-style: solid;
                border-width: 0;
                filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.75));
            }
            .studio_render_nw {
                left: 3px;
                top: 3px;
                border-left-width: 3px;
                border-top-width: 3px;
                cursor: nwse-resize;
            }
            .studio_render_ne {
                right: 3px;
                top: 3px;
                border-right-width: 3px;
                border-top-width: 3px;
                cursor: nesw-resize;
            }
            .studio_render_se {
                right: 3px;
                bottom: 3px;
                border-right-width: 3px;
                border-bottom-width: 3px;
                cursor: nwse-resize;
            }
            .studio_render_sw {
                left: 3px;
                bottom: 3px;
                border-left-width: 3px;
                border-bottom-width: 3px;
                cursor: nesw-resize;
            }
            .studio_render_frame_controls {
                position: absolute;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 3px;
                min-height: 26px;
                padding: 2px;
                box-sizing: border-box;
                background: rgba(20, 24, 32, 0.70);
                border: 0;
                border-radius: 3px;
                box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
                cursor: default;
            }
            #studio_render_frame.controls_inside .studio_render_frame_controls {
                bottom: 8px;
            }
            #studio_render_frame.controls_outside .studio_render_frame_controls {
                top: calc(100% + 8px);
            }
            #studio_render_frame.controls_vertical .studio_render_frame_controls {
                flex-direction: column;
            }
            #studio_render_frame.controls_side .studio_render_frame_controls {
                left: calc(100% + 8px);
                top: 50%;
                bottom: auto;
                transform: translateY(-50%);
            }
            #studio_render_frame.controls_vertical.controls_inside .studio_render_frame_controls {
                left: auto;
                right: 8px;
                bottom: 8px;
                transform: none;
            }
            .studio_render_frame_button {
                display: grid;
                place-items: center;
                position: relative;
                width: 36px;
                min-width: 36px;
                max-width: 36px;
                height: 36px;
                min-height: 36px;
                max-height: 36px;
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                background: transparent;
                color: var(--color-light);
                border: 0;
                border-radius: 2px;
                cursor: pointer;
            }
            .studio_render_frame_button:hover,
            .studio_render_frame_button.active {
                background: var(--color-accent);
                color: #ffffff;
            }
            .studio_render_frame_button > * {
                display: block;
                margin: 0;
                padding: 0;
            }
            .studio_render_frame_button i,
            .studio_render_frame_button svg,
            .studio_render_frame_button .icon {
                display: block;
                width: 22px;
                height: 22px;
                font-size: 22px;
                line-height: 1;
                text-align: center;
                pointer-events: none;
            }
            .studio_render_camera_presets_menu {
                min-width: 270px;
            }
            .studio_render_quick_selector_menu {
                min-width: 220px;
            }
            .studio_render_capture_button i {
                font-size: 22px;
            }
            .studio_render_reset_button i {
                font-size: 22px;
            }
            .studio_render_tile_grid {
                position: absolute;
                inset: 0;
                overflow: hidden;
                pointer-events: none;
                display: none;
            }
            #studio_render_frame.show_tile_grid .studio_render_tile_grid {
                display: block;
            }
            .studio_render_tile_line {
                position: absolute;
                opacity: 0.72;
            }
            .studio_render_tile_line.vertical {
                top: 0;
                bottom: 0;
                width: 1px;
                background: repeating-linear-gradient(
                    to bottom,
                    rgba(66, 170, 255, 0.36) 0,
                    rgba(66, 170, 255, 0.36) 7px,
                    transparent 7px,
                    transparent 13px
                );
            }
            .studio_render_tile_line.horizontal {
                left: 0;
                right: 0;
                height: 1px;
                background: repeating-linear-gradient(
                    to right,
                    rgba(66, 170, 255, 0.36) 0,
                    rgba(66, 170, 255, 0.36) 7px,
                    transparent 7px,
                    transparent 13px
                );
            }
            .studio_render_tile_progress {
                position: absolute;
                box-sizing: border-box;
                border: 1px solid transparent;
                background: transparent;
                pointer-events: none;
                transition: background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
            }
            .studio_render_tile_progress.rendering {
                border-color: rgba(255, 255, 255, 0.42);
                background: rgba(255, 255, 255, 0.06);
                box-shadow: inset 0 0 0 1px rgba(45, 143, 255, 0.38);
            }
            .studio_render_tile_progress.done {
                border-color: rgba(72, 210, 125, 0.42);
                background: rgba(72, 210, 125, 0.12);
                box-shadow: inset 0 0 0 1px rgba(72, 210, 125, 0.24);
            }
        `);
    }

    function unloadPlugin() {
        if (activeRenderSession) {
            // Cancellation is cooperative. Keep Studio ownership until the async
            // render reaches its finally block, where camera/shadow/context state
            // is restored before the flags are released.
            activeRenderSession.cancelled = true;
            activeRenderSession.retireOwnedPreviewOnFinish = true;
            activeRenderSession.retireOwnedPreviewReason = 'plugin_unload';
        } else {
            releaseOwnedStudioRenderPreview('plugin_unload');
        }
        resetStudioCameraPresetsForProjectChange();
        if (cameraPositionListener) cameraPositionListener.delete?.();
        if (cameraNavigationMoveHandler) {
            removeEventListeners(document, 'pointermove touchmove', cameraNavigationMoveHandler);
        }
        if (cameraNavigationEndHandler) {
            removeEventListeners(document, 'pointerup pointercancel touchend touchcancel', cameraNavigationEndHandler);
        }
        cameraNavigationBindings.forEach(cleanup => cleanup());
        cameraNavigationBindings.clear();
        cameraNavigationStarts.clear();
        StudioRenderFrame.remove(false);
        if (activeDialog) {
            activeDialog.hide();
            activeDialog = null;
        }
        if (activeComposerDialog) {
            activeComposerDialog.hide();
            activeComposerDialog = null;
        }
        if (activeCameraPresetDialog) {
            activeCameraPresetDialog.hide();
            activeCameraPresetDialog = null;
        }
        if (exportAction) exportAction.delete();
        if (quickRenderAction) quickRenderAction.delete();
        if (frameAction) frameAction.delete();
        if (resetFrameAction) resetFrameAction.delete();
        if (cameraPresetsAction) cameraPresetsAction.delete();
        if (sceneComposerAction) sceneComposerAction.delete();
        if (sceneComposerFormListener) sceneComposerFormListener.delete?.();
        cancelSceneComposerUndo(false);
        if (sceneComposerUndoHooks) sceneComposerUndoHooks.delete?.();
        if (sceneComposerAttachmentListener) sceneComposerAttachmentListener.delete?.();
        sceneComposerAttachmentTimers.forEach(timer => clearTimeout(timer));
        sceneComposerAttachmentTimers = [];
        sceneComposerAttachmentEstablished = false;
        if (sceneComposerPanelStyles) sceneComposerPanelStyles.delete?.();
        if (sceneComposerPanel) sceneComposerPanel.delete();
        if (sceneComposerProjectListener) sceneComposerProjectListener.delete?.();
        if (sceneComposerModeListener) sceneComposerModeListener.delete?.();
        if (sceneComposerCloseListener) sceneComposerCloseListener.delete?.();
        if (sceneComposerLifecycleHydrator) sceneComposerLifecycleHydrator.delete?.();
        if (cameraPresetsParsedListener) cameraPresetsParsedListener.delete?.();
        if (cameraPresetsProjectProperty) cameraPresetsProjectProperty.delete?.();
        if (framePipelineReadyListener) {
            window.removeEventListener('lightflow_frame_pipeline_ready', framePipelineReadyListener);
        }
        if (framePipelineDisposedListener) {
            window.removeEventListener('lightflow_frame_pipeline_disposed', framePipelineDisposedListener);
        }
        detachViewportComposerFromFramePipeline();
        cameraPresetsProjectProperty = null;
        resetSceneComposerLifecycle();
        disposeViewportComposers();
        if (stylesheet && typeof stylesheet.delete === 'function') stylesheet.delete();
        BLOOM_MASK_STATE.resources.forEach(resource => resource?.dispose?.());
        BLOOM_MASK_STATE.resources.clear();
        disposeBloomDerivedResources();
        BLOOM_PIPELINE_INSTANCES.forEach(pipeline => pipeline.dispose());
        BLOOM_PIPELINE_INSTANCES.clear();
        restoreWindowBindings();
        exportAction = null;
        quickRenderAction = null;
        frameAction = null;
        resetFrameAction = null;
        cameraPresetsAction = null;
        sceneComposerAction = null;
        sceneComposerPanel = null;
        sceneComposerPanelStyles = null;
        sceneComposerAttachmentListener = null;
        sceneComposerUndoHooks = null;
        framePipelineReadyListener = null;
        framePipelineDisposedListener = null;
        framePipelineRegistration = null;
        sceneComposerFormListener = null;
        sceneComposerProjectListener = null;
        sceneComposerModeListener = null;
        sceneComposerCloseListener = null;
        sceneComposerLifecycleHydrator = null;
        cameraPresetsParsedListener = null;
        cameraPositionListener = null;
        cameraNavigationMoveHandler = null;
        cameraNavigationEndHandler = null;
        stylesheet = null;
    }

    Plugin.register(PLUGIN_ID, {
        title: 'Studio Render',
        icon: 'photo_camera_back',
        author: 'MidFord327',
        description: 'Export polished Blockbench studio renders with tiled supersampling, 4K/8K-safe output, transparency, GPU guidance, and an adjustable frame. Complements Light Manager and Shader Architect in the Lightflow suite.',
        tags: ['Lightflow', 'Rendering', 'Export'],
        version: '1.9.10',
        min_version: '4.9.0',
        variant: 'both',
        onload() {
            addTranslations();
            registerSceneComposerUndoHooks();
            addStyles();
            registerCameraPresetProjectProperty();
            currentSettings = loadSettings();
            bindStudioCameraNavigationPreviews();
            cameraPositionListener = Blockbench.on('update_camera_position', event => {
                const preview = event?.preview;
                if (!preview || !cameraNavigationIntent.has(preview)) return;
                releaseStudioCameraPreset(preview);
            });
            cameraNavigationMoveHandler = event => {
                const point = event.touches?.[0] || event;
                const x = Number(point.clientX) || 0;
                const y = Number(point.clientY) || 0;
                cameraNavigationStarts.forEach((start, preview) => {
                    const dx = x - start.x;
                    const dy = y - start.y;
                    if (dx * dx + dy * dy <= 12) return;
                    cameraNavigationStarts.delete(preview);
                    releaseStudioCameraPreset(preview);
                });
            };
            cameraNavigationEndHandler = () => {
                const previews = typeof Preview !== 'undefined' && Array.isArray(Preview.all)
                    ? Preview.all
                    : [];
                previews.forEach(preview => cameraNavigationIntent.delete(preview));
                cameraNavigationStarts.clear();
            };
            addEventListeners(document, 'pointermove touchmove', cameraNavigationMoveHandler);
            addEventListeners(document, 'pointerup pointercancel touchend touchcancel', cameraNavigationEndHandler);

            exportAction = new Action('studio_render_export', {
                name: 'studio_render.action.export',
                description: 'studio_render.action.export.desc',
                icon: 'photo_camera',
                category: 'file',
                condition: () => !!getPreview(),
                click: openStudioRenderFrame
            });

            quickRenderAction = new Action('studio_render_quick', {
                name: 'studio_render.action.quick',
                description: 'studio_render.action.quick.desc',
                icon: 'bolt',
                category: 'file',
                condition: () => !!getPreview(),
                click: quickStudioRender
            });

            frameAction = new Toggle('studio_render_toggle_frame', {
                name: 'studio_render.action.frame',
                description: 'studio_render.action.frame.desc',
                icon: 'crop_free',
                category: 'view',
                condition: () => !!getPreview(),
                value: false,
                onChange() {
                    StudioRenderFrame.toggle();
                    this.value = !!StudioRenderFrame.node;
                }
            });

            resetFrameAction = new Action('studio_render_reset_frame', {
                name: 'studio_render.action.reset_frame',
                description: 'studio_render.action.reset_frame.desc',
                icon: 'center_focus_strong',
                category: 'view',
                condition: () => !!getPreview(),
                click() {
                    StudioRenderFrame.reset(getPreview(), currentSettings);
                    openStudioRenderFrame();
                }
            });

            cameraPresetsAction = new Action('studio_render_camera_presets', {
                name: 'studio_render.action.camera_presets',
                description: 'studio_render.action.camera_presets.desc',
                icon: 'videocam',
                category: 'view',
                condition: () => !!getPreview() && !!getActiveProject(),
                click: openCameraPresetMenu
            });

            sceneComposerAction = new Action('lightflow_scene_composer', {
                name: 'studio_render.action.scene_composer',
                description: 'studio_render.action.scene_composer.desc',
                icon: 'auto_fix_high',
                category: 'view',
                condition: () => !!getPreview(),
                click: openSceneComposerDialog
            });

            sceneComposerPanel = new Panel('lightflow_scene_composer_panel', {
                name: 'studio_render.panel.composer',
                icon: 'auto_fix_high',
                growable: true,
                resizable: true,
                expand_button: true,
                condition: { modes: ['render'], project: true },
                default_position: {
                    slot: 'left_bar',
                    float_position: [0, 0],
                    float_size: [314, 520],
                    height: 420,
                    folded: false,
                    fixed_height: false,
                    attached_to: window.Panels?.material_properties ? 'material_properties' : (window.Panels?.lightflow_scene ? 'lightflow_scene' : ''),
                    attached_index: 2,
                    sidebar_index: 2
                },
                mode_positions: {
                    render: {
                        slot: 'left_bar',
                        height: 420,
                        folded: false,
                        fixed_height: false,
                        attached_to: window.Panels?.material_properties ? 'material_properties' : (window.Panels?.lightflow_scene ? 'lightflow_scene' : ''),
                        attached_index: 2,
                        sidebar_index: 2
                    }
                },
                insert_after: 'material_properties',
                form: createSceneComposerPanelForm(currentSettings)
            });

            sceneComposerFormListener = sceneComposerPanel.form.on('change', ({ result, changed_keys }) => {
                if (syncingSceneComposerPanel) return;
                const changedKeys = Array.isArray(changed_keys) && changed_keys.length
                    ? changed_keys
                    : Object.keys(result || {});
                changedKeys.forEach(key => {
                    if (key === '_composer_mode' && (result?.[key] === 'essentials' || result?.[key] === 'advanced')) {
                        if (sceneComposerPanelMode !== result[key]) {
                            sceneComposerPanelMode = result[key];
                            setTimeout(syncSceneComposerPanel, 0);
                        }
                        return;
                    }
                    if (!key.startsWith(SCENE_COMPOSER_PANEL_GROUP_PREFIX)) return;
                    const groupId = key.slice(SCENE_COMPOSER_PANEL_GROUP_PREFIX.length);
                    if (Object.prototype.hasOwnProperty.call(sceneComposerPanelGroupsOpen, groupId)) {
                        sceneComposerPanelGroupsOpen[groupId] = result?.[key] !== false;
                    }
                });
                const settingKeys = changedKeys.filter(key => Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key));
                if (!settingKeys.length) return;
                const panelResult = {};
                settingKeys.forEach(key => {
                    if (result && Object.prototype.hasOwnProperty.call(result, key)) panelResult[key] = result[key];
                });
                applySceneComposerForm(panelResult, true);
            });
            sceneComposerPanelStyles = window.LightManagerUI?.addDesignedPanelStyles?.('lightflow_scene_composer_panel', {
                scrollbar_width: 4,
                row_padding: '3px 4px'
            });
            establishSceneComposerPanelAttachment();
            sceneComposerAttachmentTimers = [0, 500, 1500].map(delay => setTimeout(establishSceneComposerPanelAttachment, delay));
            sceneComposerAttachmentListener = Blockbench.on('select_mode', establishSceneComposerPanelAttachment);

            MenuBar.addAction(exportAction, 'file.export');
            MenuBar.addAction(quickRenderAction, 'file.export');
            MenuBar.addAction(exportAction, 'view');
            MenuBar.addAction(quickRenderAction, 'view');
            MenuBar.addAction(frameAction, 'view');
            MenuBar.addAction(cameraPresetsAction, 'view');
            Toolbars.main_tools.add(frameAction);
            //MenuBar.addAction(resetFrameAction, 'view');
            MenuBar.addAction(sceneComposerAction, 'view');

            patchAllViewportComposers();
            framePipelineReadyListener = () => {
                detachViewportComposerWrappers();
                attachViewportComposerToFramePipeline();
            };
            framePipelineDisposedListener = () => {
                detachViewportComposerFromFramePipeline();
                patchAllViewportComposers();
            };
            window.addEventListener('lightflow_frame_pipeline_ready', framePipelineReadyListener);
            window.addEventListener('lightflow_frame_pipeline_disposed', framePipelineDisposedListener);
            sceneComposerLifecycleHydrator = window.LightflowLifecycle?.registerHydrator?.(
                'studio_render',
                ({ project, model, deferred }) => {
                    if (deferred) {
                        releaseOwnedStudioRenderPreview('project_change');
                        resetStudioCameraPresetsForProjectChange();
                        resetSceneComposerLifecycle();
                        return;
                    }
                    if (!project) return;
                    releaseOwnedStudioRenderPreview('project_hydrate');
                    hydrateCameraPresetProject(project, model);
                    cameraPresetPersistenceWarningShown = false;
                    StudioRenderFrame.remove(false);
                    currentSettings = loadSettings();
                    if (!getCameraPresetById(currentSettings.camera_preset_id)) currentSettings.camera_preset_id = '';
                    bindStudioCameraNavigationPreviews();
                    syncSceneComposerPanel();
                    refreshSceneComposerPreviews();
                }
            );
            if (!sceneComposerLifecycleHydrator) {
                sceneComposerProjectListener = Blockbench.on('select_project', event => {
                    releaseOwnedStudioRenderPreview('project_change');
                    resetStudioCameraPresetsForProjectChange();
                    resetSceneComposerLifecycle();
                    hydrateCameraPresetProject(event?.project || getActiveProject(), null);
                    cameraPresetPersistenceWarningShown = false;
                    StudioRenderFrame.remove(false);
                    currentSettings = loadSettings();
                    if (!getCameraPresetById(currentSettings.camera_preset_id)) currentSettings.camera_preset_id = '';
                    bindStudioCameraNavigationPreviews();
                    syncSceneComposerPanel();
                    refreshSceneComposerPreviews();
                });
                sceneComposerCloseListener = Blockbench.on('close_project', () => {
                    releaseOwnedStudioRenderPreview('project_close');
                    resetStudioCameraPresetsForProjectChange();
                    resetSceneComposerLifecycle();
                });
            }
            cameraPresetsParsedListener = window.Codecs?.project?.on?.('parsed', event => {
                hydrateCameraPresetProject(getActiveProject(), event?.model || event);
            });
            sceneComposerModeListener = Blockbench.on('select_mode', () => {
                refreshSceneComposerPreviews();
            });

            publishWindowBinding('StudioRender', {
                open: openStudioRenderDialog,
                render: renderWithSettings,
                renderFrame(settings, consumeFrame, options = {}) {
                    if (typeof consumeFrame !== 'function') {
                        return Promise.resolve({
                            ok: false,
                            delivered: false,
                            consumed: false,
                            error: 'StudioRender.renderFrame requires a frame consumer callback.'
                        });
                    }
                    return renderWithSettings(settings, Object.assign({}, options, {
                        save: false,
                        deliver: false,
                        silent: options.silent !== false,
                        consumeFrame
                    }));
                },
                quickRender: quickStudioRender,
                openComposer: openSceneComposerDialog,
                openCameraPresets: openCameraPresetManagerDialog,
                openCameraPresetMenu,
                refreshComposer: refreshSceneComposerPreviews,
                renderViewportComposer,
                detachViewportComposers: detachViewportComposerWrappers,
                getResourceDiagnostics: getStudioResourceDiagnostics,
                get cameraPresets() { return getProjectCameraPresets().map(preset => JSON.parse(JSON.stringify(preset))); },
                applyCameraPreset,
                captureCameraPreset(name) {
                    return createProjectCameraPreset(name, currentSettings);
                },
                captureCurrentCameraPreset(name) {
                    return createProjectCameraPreset(name, normalizeForm({
                        ...currentSettings,
                        angle_preset: 'view',
                        zoom: null
                    }), { exact_projection: true });
                },
                captureShot(name = 'Studio Shot', options = {}) {
                    return captureCameraPreset(
                        name,
                        options.preview || getPreview(),
                        normalizeForm({
                            ...currentSettings,
                            angle_preset: 'view',
                            zoom: null
                        }),
                        null,
                        { exact_projection: options.exact_projection !== false }
                    );
                },
                applyShot(shot, options = {}) {
                    return applyCameraPreset(shot, Object.assign({}, options, {
                        notify: options.notify === true,
                        transient: options.transient !== false
                    }));
                },
                updateCameraPreset(id) {
                    return updateProjectCameraPreset(id, currentSettings);
                },
                deleteCameraPreset: deleteProjectCameraPreset,
                cancelRender(reason = 'external_cancel') {
                    if (!activeRenderSession) return false;
                    activeRenderSession.cancelled = true;
                    activeRenderSession.cancelReason = String(reason || 'external_cancel');
                    return true;
                },
                get isRendering() { return !!activeRenderSession; },
                get settings() { return Object.assign({}, currentSettings); },
                setComposerSettings(next) {
                    currentSettings = normalizeForm(Object.assign({}, currentSettings, next || {}));
                    saveSettings(currentSettings);
                    syncSceneComposerPanel();
                    refreshSceneComposerPreviews();
                    return Object.assign({}, currentSettings);
                },
                getFrameState(options = {}) {
                    const preview = options.preview || getPreview();
                    const settings = normalizeForm(Object.assign({}, currentSettings, options.settings || {}));
                    if (
                        StudioRenderFrame.node && StudioRenderFrame.state &&
                        (!options.owner || StudioRenderFrame.stateOwner === options.owner)
                    ) {
                        return Object.assign({}, StudioRenderFrame.state);
                    }
                    return Object.assign({}, StudioRenderFrame.getState(preview, settings));
                },
                setFrameState(frame, options = {}) {
                    const preview = options.preview || getPreview();
                    const settings = normalizeForm(Object.assign({}, currentSettings, options.settings || {}, {
                        capture_area: 'frame'
                    }));
                    return StudioRenderFrame.setState(frame, preview, settings, {
                        persistProjectState: options.persistProjectState !== false,
                        owner: options.owner || ''
                    });
                },
                showFrame(options = {}, frameState = null) {
                    const preview = options.preview || getPreview();
                    const settings = normalizeForm(Object.assign({}, currentSettings, options.settings || options, {
                        capture_area: 'frame'
                    }));
                    StudioRenderFrame.show(preview, settings, {
                        state: frameState,
                        persistProjectState: options.persistProjectState !== false,
                        owner: options.owner || ''
                    });
                    return Object.assign({}, StudioRenderFrame.state || StudioRenderFrame.getState(preview, settings));
                },
                hideFrame: () => StudioRenderFrame.remove(true),
                resetFrame(options = {}) {
                    const preview = options.preview || getPreview();
                    const settings = normalizeForm(Object.assign({}, currentSettings, options.settings || {}));
                    StudioRenderFrame.reset(preview, settings);
                    return Object.assign({}, StudioRenderFrame.state || StudioRenderFrame.getState(preview, settings));
                }
            });
        },
        onunload: unloadPlugin
    });
})();
