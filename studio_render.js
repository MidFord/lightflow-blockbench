(function () {
    'use strict';

    const PLUGIN_ID = 'studio_render';
    const STORAGE_KEY = 'studio_render.settings';
    const FRAME_STORAGE_KEY = 'studio_render.frame';
    const PROJECT_CAMERA_PRESETS_PROPERTY = 'studio_render_camera_presets_json';
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
        bloom_threshold: 0.72,
        bloom_strength: 0.8,
        bloom_radius: 18,
        bloom_hdr_strength: 1.0,
        bloom_emissive_strength: 1.35,
        bloom_occlusion: true,
        viewport_bloom_enabled: true,
        // 0 follows every viewport render. A numeric value is an optional cap.
        viewport_bloom_fps: 0,
        viewport_bloom_quality: 'adaptive',
        viewport_composer_revision: 2,
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
    let sceneComposerRefreshFrame = null;
    let sceneComposerRevision = 0;
    let syncingSceneComposerPanel = false;
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
    const publishedWindowBindings = new Map();
    const studioRenderReportedWarnings = new Set();
    const studioCameraPresetPreviews = new WeakSet();
    const cameraNavigationIntent = new WeakSet();
    const cameraNavigationBindings = new Map();
    const cameraNavigationStarts = new Map();
    const BLOOM_MASK_STATE = {
        emissiveMaterials: new WeakMap(),
        occluderMaterials: new WeakMap(),
        resources: new Set()
    };
    const VIEWPORT_COMPOSER_STATE = new Map();

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
    }

    const VIEWPORT_BLOOM_PROFILES = {
        adaptive: { scale: 0.42, minScale: 0.2, maxScale: 0.7, maxDimension: 1400, adaptive: true },
        performance: { scale: 0.25, maxDimension: 720 },
        balanced: { scale: 0.42, maxDimension: 1100 },
        high: { scale: 0.7, maxDimension: 1600 }
    };

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
        return !!selected && (selected.id === 'render' || selected === window.Modes?.render);
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
            'studio_render.field.samples': 'Antialiasing',
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
            'studio_render.field.bloom_strength': 'Bloom Strength',
            'studio_render.field.bloom_radius': 'Bloom Radius',
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
            'studio_render.panel.composer': 'COMPOSER',
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
            'studio_render.option.samples.1': 'Off - native pixels',
            'studio_render.option.samples.2': 'Clean SSAA - 2x',
            'studio_render.option.samples.3': 'Fine SSAA - 3x',
            'studio_render.option.samples.4': 'Studio SSAA - 4x',
            'studio_render.option.samples.6': 'Cinema SSAA - 6x',
            'studio_render.option.samples.8': 'Extreme SSAA - 8x',
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
            'studio_render.frame.resize_hint': 'Resize Frame - Ctrl: Square, Shift: Lock Aspect Ratio',
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
            'studio_render.field.samples': 'Antialiasing',
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
            'studio_render.field.bloom_strength': 'Fuerza de Bloom',
            'studio_render.field.bloom_radius': 'Radio de Bloom',
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
            'studio_render.panel.composer': 'COMPOSITOR',
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
            'studio_render.option.samples.1': 'Apagado - pixeles nativos',
            'studio_render.option.samples.2': 'SSAA Limpio - 2x',
            'studio_render.option.samples.3': 'SSAA Fino - 3x',
            'studio_render.option.samples.4': 'SSAA Estudio - 4x',
            'studio_render.option.samples.6': 'SSAA Cine - 6x',
            'studio_render.option.samples.8': 'SSAA Extremo - 8x',
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
            'studio_render.frame.resize_hint': 'Redimensionar Marco - Ctrl: Cuadrado, Shift: Bloquear Proporcion',
            'studio_render.frame.label': 'Marco de Render'
        });
    }

    function loadSettings() {
        const stored = readJSON(STORAGE_KEY, {});
        const legacyViewportComposer = toNumber(stored.viewport_composer_revision, 0) < 2;
        const settings = Object.assign({}, DEFAULT_SETTINGS, stored);
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
        settings.bloom_threshold = clamp(toNumber(settings.bloom_threshold, 0.72), 0, 1);
        settings.bloom_strength = clamp(toNumber(settings.bloom_strength, 0.8), 0, 3);
        settings.bloom_radius = clamp(toNumber(settings.bloom_radius, 18), 1, 96);
        settings.bloom_hdr_strength = clamp(toNumber(settings.bloom_hdr_strength, 1), 0, 4);
        settings.bloom_emissive_strength = clamp(toNumber(settings.bloom_emissive_strength, 1.35), 0, 6);
        settings.bloom_occlusion = settings.bloom_occlusion !== false;
        settings.viewport_bloom_enabled = settings.viewport_bloom_enabled !== false;
        settings.viewport_bloom_fps = legacyViewportComposer
            ? 0
            : clamp(toNumber(settings.viewport_bloom_fps, 0), 0, 144);
        settings.viewport_bloom_quality = VIEWPORT_BLOOM_PROFILES[settings.viewport_bloom_quality]
            ? settings.viewport_bloom_quality
            : 'adaptive';
        settings.viewport_composer_revision = 2;
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

        if (typeof window.updateCubeHighlights === 'function') {
            updateCubeHighlights(null, true);
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

            if (typeof window.updateCubeHighlights === 'function') {
                updateCubeHighlights();
            }
        }
    }

    async function withoutStudioRenderHighlights(callback) {
        const snapshots = [];

        [window.Cube, window.Mesh, window.TextureMesh].forEach(ElementType => {
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

                snapshots.push({ attribute, values: attribute.array.slice() });
                attribute.array.fill(0);
                attribute.needsUpdate = true;
            });
        });

        try {
            return await callback();
        } finally {
            snapshots.forEach(snapshot => {
                snapshot.attribute.array.set(snapshot.values);
                snapshot.attribute.needsUpdate = true;
            });
        }
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
        return {
            x: clamp(toNumber(source.x, (1 - width) / 2), 0, 1 - width),
            y: clamp(toNumber(source.y, (1 - height) / 2), 0, 1 - height),
            width,
            height
        };
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
        const adapted = preset.camera.exact_projection
            ? { scale: 1, frame: normalizeFrameState(preset.frame) }
            : (preset.output.capture_area === 'frame'
                ? adaptCameraPresetFrame(preset, targetAspect)
                : { scale: 1, frame: normalizeFrameState(preset.frame) });
        const isOrtho = preset.camera.projection === 'orthographic';
        const hasExactProjectionShift = !isOrtho && preset.camera.exact_projection === true && (
            Number.isFinite(preset.camera.projection_shift_x) ||
            Number.isFinite(preset.camera.projection_shift_y)
        );

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
                Number(preset.camera.projection_shift_x) || 0,
                Number(preset.camera.projection_shift_y) || 0
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
                Number(preset.camera.projection_shift_x) || 0,
                Number(preset.camera.projection_shift_y) || 0
            );
        }
        camera.updateMatrixWorld?.(true);

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
        renderPreviewWithExactCameraPose(preview);
        syncFrameAction();
        refreshSceneComposerPreviews();
        if (options.notify !== false) {
            Blockbench.showQuickMessage(translate('studio_render.message.preset_applied', 'Camera preset applied') + ': ' + preset.name);
        }
        return true;
    }

    function normalizeForm(form) {
        const settings = Object.assign({}, DEFAULT_SETTINGS, form || {});
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
        settings.bloom_threshold = clamp(toNumber(settings.bloom_threshold, 0.72), 0, 1);
        settings.bloom_strength = clamp(toNumber(settings.bloom_strength, 0.8), 0, 3);
        settings.bloom_radius = clamp(toNumber(settings.bloom_radius, 18), 1, 96);
        settings.bloom_hdr_strength = clamp(toNumber(settings.bloom_hdr_strength, 1), 0, 4);
        settings.bloom_emissive_strength = clamp(toNumber(settings.bloom_emissive_strength, 1.35), 0, 6);
        settings.bloom_occlusion = settings.bloom_occlusion !== false;
        settings.viewport_bloom_enabled = settings.viewport_bloom_enabled !== false;
        settings.viewport_bloom_fps = clamp(toNumber(settings.viewport_bloom_fps, 0), 0, 144);
        settings.viewport_bloom_quality = VIEWPORT_BLOOM_PROFILES[settings.viewport_bloom_quality]
            ? settings.viewport_bloom_quality
            : 'adaptive';
        settings.viewport_composer_revision = 2;
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

    function resolveTileSize(settings, renderer, sampleFactor) {
        const gpuProfile = getGpuProfile(renderer);
        const maxTextureSize = Math.max(
            sampleFactor,
            Math.min(
                gpuProfile.maxTextureSize || 4096,
                gpuProfile.maxRenderbufferSize || 4096,
                gpuProfile.maxViewportSize || 4096
            )
        );

        const autoTileSize = gpuProfile.classification === 'software'
            ? 1024
            : (
                gpuProfile.classification === 'integrated'
                    ? 1536
                    : DEFAULT_TILE_SIZE
            );

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

        const tile = clamp(
            requested || DEFAULT_TILE_SIZE,
            minimumTile,
            safeMax
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
        } else {
            ctx.clearRect(0, 0, size.width, size.height);
        }
        return { canvas, ctx };
    }

    function copyPreviewCamera(renderPreview, sourcePreview, settings, baseWidth, baseHeight) {
        renderPreview.setProjectionMode(sourcePreview.isOrtho);
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

    function renderPreviewWithExactCameraPose(renderPreview) {
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

    function configureTileCamera(renderPreview, sourcePreview, settings, tile) {
        const camera = renderPreview.camera;
        const baseWidth = tile.fullViewWidth;
        const baseHeight = tile.fullViewHeight;

        copyPreviewCamera(renderPreview, sourcePreview, settings, baseWidth, baseHeight);

        if (typeof camera.setViewOffset === 'function') {
            const projectionShift = renderPreview.studio_render_projection_shift || { x: 0, y: 0 };
            camera.setViewOffset(
                tile.fullViewWidth,
                tile.fullViewHeight,
                tile.viewX - projectionShift.x * tile.fullViewWidth * 0.5,
                tile.viewY + projectionShift.y * tile.fullViewHeight * 0.5,
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
                tile.viewX,
                tile.viewY,
                tile.viewWidth,
                tile.viewHeight
            );
        }
    }

    function getFrameRectForPreview(preview, settings) {
        if (!preview) return null;
        const state = StudioRenderFrame.getState(preview, settings);
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

    function prepareRendererForTile(renderPreview, sourcePreview, settings, tile) {
        const renderWidth = tile.renderWidth || tile.sampleWidth;
        const renderHeight = tile.renderHeight || tile.sampleHeight;
        const renderer = renderPreview.renderer;

        /*
            The physical canvas must match tile and rim units instead of
            inheriting monitor DPI.
        */
        if (renderer && typeof renderer.setPixelRatio === 'function') {
            renderer.setPixelRatio(1);
        }

        renderPreview.resize(renderWidth, renderHeight);
        configureTileCamera(renderPreview, sourcePreview, settings, tile);
        if (typeof renderPreview.renderer?.setClearColor === 'function') {
            renderPreview.renderer.setClearColor(0x000000, 0);
        }
        if (typeof renderPreview.renderer?.setViewport === 'function') {
            renderPreview.renderer.setViewport(0, 0, renderWidth, renderHeight);
        }
        if (typeof renderPreview.renderer?.setScissorTest === 'function') {
            renderPreview.renderer.setScissorTest(false);
        }
        if (typeof window.LightManagerPrepareRender === 'function') {
            window.LightManagerPrepareRender(renderPreview, { studio: true });
        }
        if (typeof Blockbench !== 'undefined' && typeof Blockbench.dispatchEvent === 'function') {
            Blockbench.dispatchEvent('studio_render_pre_tile', {
                preview: renderPreview,
                source_preview: sourcePreview,
                tile,
                settings,

                promotionalRimFrameScale: Math.max(
                    1.0,
                    Number(tile.promotionalRimFrameScale) || 1.0
                )
            });
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

    function synchronizeStudioRenderLighting(renderPreview) {
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
    }

    function compositeStudioRenderPostEffects(renderPreview, settings, tile) {
        const manager = window.MinecraftPromotionalSilhouetteManager;
        if (!manager || typeof manager.renderSilhouette !== 'function') return;

        const renderer = renderPreview && renderPreview.renderer;
        if (!renderer) return;

        const sampleScale = clamp(
            parseInt(settings.samples, 10) || 1,
            1,
            8
        );
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
                renderer.setRenderTarget(null);
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

        const renderMode = String(material.sa_source_render_mode || '').toLowerCase();
        const emissiveMode = renderMode === 'emissive' || getMaterialUniformValue(material, 'EMISSIVE', false) === true;
        const additiveMode = renderMode === 'additive' || material.blending === THREE.AdditiveBlending;
        const useMERMap = getMaterialUniformValue(material, 'uUseBlockbenchMERMap', false) === true;
        const useShaderEmissiveMap = getMaterialUniformValue(material, 'uUseEmissiveMap', false) === true;
        const useStandardEmissiveMap = !!material.emissiveMap;
        const useEmissiveMap = useShaderEmissiveMap || useStandardEmissiveMap;
        const useTextureEmission = getMaterialUniformValue(material, 'uEmissiveUseTexture', false) === true;
        const hasShaderEmission = !!material.uniforms?.uEmissiveStrength;
        const emissiveStrength = Math.max(
            0,
            Number(getMaterialUniformValue(material, 'uEmissiveStrength', material.emissiveIntensity || 1)) || 0
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

        return {
            active: emissiveMode || additiveMode || useShaderEmission || useStandardColorEmission || useMERMap || useEmissiveMap,
            mode: emissiveMode ? 1 : (additiveMode ? 2 : 0),
            useShaderEmission: useShaderEmission || useStandardColorEmission,
            useTextureEmission,
            useMERMap,
            useEmissiveMap,
            tintEmissiveMap: useStandardEmissiveMap && !useShaderEmissiveMap,
            emissiveStrength,
            baseMap: getMaterialTexture(material, 'map'),
            baseColorMap: getMaterialTexture(material, 'uBaseColorMap'),
            emissiveMap: getMaterialTexture(material, 'uEmissiveMap', material.emissiveMap || null),
            merMap: getMaterialTexture(material, 'uMetallicRoughnessMap'),
            emissiveColor,
            baseColor: getMaterialUniformValue(material, 'uBaseColor', null),
            baseAlpha: Math.max(0, Number(getMaterialUniformValue(material, 'uBaseAlpha', 1)) || 0),
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

    function getBloomMaskMaterial(sourceMaterial, emissive) {
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

                        if (!uEmit) {
                            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                            return;
                        }

                        vec3 emission = vec3(0.0);
                        if (uMode == 1) {
                            // Native Blockbench/Minecraft emissive semantics.
                            emission += base.rgb * (1.0 - base.a);
                        } else if (uMode == 2) {
                            emission += base.rgb * base.a;
                        }
                        if (uUseShaderEmission) {
                            emission += (
                                uUseTextureEmission
                                    ? base.rgb
                                    : uEmissiveColor
                            ) * uEmissiveStrength;
                        }
                        if (uUseEmissiveMap) {
                            vec3 mapEmission = texture2D(
                                uEmissiveMap,
                                vMaterialUv * uEmissiveMapScale
                            ).rgb;
                            if (uTintEmissiveMap) {
                                mapEmission *= uEmissiveColor;
                            }
                            emission += mapEmission * uEmissiveStrength;
                        }
                        if (uUseMERMap) {
                            emission += base.rgb * texture2D(
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
                        gl_FragColor = vec4(max(emission, vec3(0.0)), clamp(energy, 0.0, 1.0));
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
            BLOOM_MASK_STATE.resources.add(material);
        }

        const state = getMaterialEmissiveState(sourceMaterial);
        const fallback = sourceMaterial.map || getMaterialTexture(sourceMaterial, 'map');
        material.uniforms.map.value = state.baseMap || fallback;
        material.uniforms.uBaseColorMap.value = state.baseColorMap || state.baseMap || fallback;
        material.uniforms.uEmissiveMap.value = state.emissiveMap || state.baseMap || fallback;
        material.uniforms.uMERMap.value = state.merMap || state.baseMap || fallback;
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

    function renderBloomMaskTile(renderPreview, targetContext, tile, sampleFactor) {
        if (!renderPreview?.renderer || !targetContext || !window.Canvas?.scene) return;

        const scene = Canvas.scene;
        const renderer = renderPreview.renderer;
        const changes = [];

        scene.traverse(object => {
            if (!object || !object.visible || !(object.isMesh || object.isSprite) || !object.material) return;
            const original = object.material;
            const sourceMaterials = Array.isArray(original) ? original : [original];
            const replacements = sourceMaterials.map(source => {
                const state = getMaterialEmissiveState(source);
                return getBloomMaskMaterial(source, state.active);
            });
            changes.push({ object, material: original });
            object.material = Array.isArray(original) ? replacements : replacements[0];
        });

        const previousTarget = renderer.getRenderTarget?.();
        const previousAutoClear = renderer.autoClear;
        const previousShadowAutoUpdate = renderer.shadowMap ? renderer.shadowMap.autoUpdate : undefined;
        const previousClearColor = new THREE.Color();
        const previousClearAlpha = renderer.getClearAlpha?.() ?? 1;
        renderer.getClearColor?.(previousClearColor);

        try {
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

    function drawTile(ctx, renderPreview, tile, sampleFactor) {
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

        ctx.drawImage(
            renderPreview.canvas,
            0,
            0,
            sourceWidth,
            sourceHeight,
            destinationX,
            destinationY,
            destinationWidth,
            destinationHeight
        );

        ctx.restore();
    }

    async function waitForFrame() {
        await new Promise(resolve => {
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(resolve);
            } else {
                setTimeout(resolve, 0);
            }
        });
    }

    async function recoverPreviewShadowsAfterStudioRender(sourcePreview, renderPreview) {
        if (typeof window.LightManagerPrepareRender !== 'function') return;

        const previews = [];
        if (sourcePreview) previews.push(sourcePreview);
        if (renderPreview && renderPreview !== sourcePreview) previews.push(renderPreview);

        previews.forEach(preview => {
            window.LightManagerPrepareRender(preview, { force: true, studio: false });
        });

        if (typeof window.UpdateShaderArchitectLights === 'function') {
            window.UpdateShaderArchitectLights();
        } else if (typeof window.updateLights === 'function') {
            window.updateLights();
        }

        if (sourcePreview && typeof sourcePreview.render === 'function') {
            await waitForFrame();
            window.LightManagerPrepareRender(sourcePreview, { force: true, studio: false });
            renderPreviewWithExactCameraPose(sourcePreview);
        }
    }

    async function copyImageToClipboard(dataUrl) {
        if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') {
            Blockbench.showQuickMessage('message.screenshot.right_click');
            return false;
        }
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        await navigator.clipboard.write([
            new ClipboardItem({
                [blob.type]: blob
            })
        ]);
        Blockbench.showQuickMessage(translate('studio_render.message.copied', 'Studio render copied to clipboard'));
        return true;
    }

    function applyFinalBloom(canvas, settings, sourceMaskCanvas, options = {}) {
        if (!canvas || !settings?.bloom_enabled) return canvas;

        const sourceMask = sourceMaskCanvas || canvas;
        const maxMaskDimension = Math.max(64, Number(options.maxDimension) || 4096);
        const sourceScale = Math.min(
            1,
            maxMaskDimension / Math.max(canvas.width || 1, canvas.height || 1)
        );
        const width = Math.max(1, Math.round(Number(options.processingWidth) || canvas.width * sourceScale));
        const height = Math.max(1, Math.round(Number(options.processingHeight) || canvas.height * sourceScale));
        const radiusScale = Math.min(width / Math.max(canvas.width || 1, 1), height / Math.max(canvas.height || 1, 1));
        const threshold = clamp(toNumber(settings.bloom_threshold, 0.72), 0, 1);
        const strength = clamp(toNumber(settings.bloom_strength, 0.8), 0, 3);
        const radius = clamp(toNumber(settings.bloom_radius, 18), 1, 96) * radiusScale;
        const hdrStrength = clamp(toNumber(settings.bloom_hdr_strength, 1), 0, 4);
        const emissiveStrength = clamp(toNumber(settings.bloom_emissive_strength, 1.35), 0, 6);
        const useOcclusion = settings.bloom_occlusion !== false;
        const includeSceneSignal = options.emissiveOnly !== true;
        const workspace = options.workspace || null;
        const getWorkingCanvas = key => {
            let target = workspace?.[key];
            if (!target) {
                target = document.createElement('canvas');
                if (workspace) workspace[key] = target;
            }
            if (target.width !== width) target.width = width;
            if (target.height !== height) target.height = height;
            return target;
        };

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

        for (let index = 0; index < pixels.length; index += 4) {
            const geometryAlpha = pixels[index + 3] / 255;
            const emissionR = pixels[index] / 255 * emissiveStrength;
            const emissionG = pixels[index + 1] / 255 * emissiveStrength;
            const emissionB = pixels[index + 2] / 255 * emissiveStrength;
            const sceneR = scenePixels ? scenePixels[index] / 255 * hdrStrength : 0;
            const sceneG = scenePixels ? scenePixels[index + 1] / 255 * hdrStrength : 0;
            const sceneB = scenePixels ? scenePixels[index + 2] / 255 * hdrStrength : 0;

            const hdrSignal = geometryAlpha > 0.001
                ? Math.max(sceneR, sceneG, sceneB)
                : 0;
            const emissiveSignal = Math.max(emissionR, emissionG, emissionB);
            const signal = Math.max(hdrSignal, emissiveSignal);
            const contribution = clamp(
                (signal - threshold) / Math.max(0.001, 1 - threshold),
                0,
                1
            );

            const combinedR = Math.max(sceneR, emissionR);
            const combinedG = Math.max(sceneG, emissionG);
            const combinedB = Math.max(sceneB, emissionB);
            pixels[index] = Math.round(255 * clamp(combinedR * contribution, 0, 1));
            pixels[index + 1] = Math.round(255 * clamp(combinedG * contribution, 0, 1));
            pixels[index + 2] = Math.round(255 * clamp(combinedB * contribution, 0, 1));
            pixels[index + 3] = Math.round(255 * contribution);

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

        const drawBloomLayer = (blur, alpha) => {
            bloomContext.globalAlpha = clamp(alpha * strength, 0, 1);
            bloomContext.filter = `blur(${Math.max(0.5, blur)}px)`;
            bloomContext.drawImage(mask, 0, 0, width, height);
        };

        drawBloomLayer(radius * 2.4, 0.20);
        drawBloomLayer(radius * 1.05, 0.42);
        drawBloomLayer(radius * 0.38, 0.56);

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

    function createViewportPostTarget(width, height, name, depthBuffer = false) {
        const target = new THREE.WebGLRenderTarget(width, height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            depthBuffer,
            stencilBuffer: false
        });
        target.texture.name = name;
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

    function renderViewportBloomMask(preview, state, width, height) {
        const renderer = preview?.renderer;
        const scene = window.Canvas?.scene;
        if (!renderer || !scene || !THREE.WebGLRenderTarget) return false;

        if (!state.maskTarget) {
            state.maskTarget = createViewportPostTarget(width, height, 'Lightflow_ViewportBloomMask', true);
        } else {
            configureViewportPostTarget(state.maskTarget, width, height);
        }

        const hiddenVisibility = new Map();
        collectStudioRenderHiddenObjects().forEach(object => {
            if (!object || hiddenVisibility.has(object)) return;
            hiddenVisibility.set(object, object.visible);
            object.visible = false;
        });

        const materialChanges = [];
        const replaceMaterial = object => {
            if (!object?.visible || !(object.isMesh || object.isSprite) || !object.material) return;
            const original = object.material;
            const sourceMaterials = Array.isArray(original) ? original : [original];
            const replacements = sourceMaterials.map(source => {
                return getBloomMaskMaterial(source, getMaterialEmissiveState(source).active);
            });
            materialChanges.push({ object, material: original });
            object.material = Array.isArray(original) ? replacements : replacements[0];
        };
        if (typeof scene.traverseVisible === 'function') scene.traverseVisible(replaceMaterial);
        else scene.traverse(replaceMaterial);

        const snapshot = snapshotViewportRendererState(renderer);
        let succeeded = false;
        try {
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
            renderer.render(scene, preview.camera);
            if (window.LightflowAtmosphere?.composite) {
                window.LightflowAtmosphere.composite(preview, { studio: true, bloomMask: true });
                renderer.setRenderTarget(state.maskTarget);
            }
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

        state.downsampleMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tInput: { value: null },
                uTexel: { value: new THREE.Vector2(1, 1) },
                uOffset: { value: 1 },
                uThreshold: { value: 0.72 },
                uEmissiveStrength: { value: 1.35 },
                uApplyThreshold: { value: true }
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
                uniform sampler2D tInput;
                uniform vec2 uTexel;
                uniform float uOffset;
                uniform float uThreshold;
                uniform float uEmissiveStrength;
                uniform bool uApplyThreshold;
                varying vec2 vUv;

                vec3 bloomSample(vec2 uv) {
                    vec3 color = texture2D(tInput, uv).rgb;
                    if (!uApplyThreshold) return color;
                    color *= uEmissiveStrength;
                    float signal = max(color.r, max(color.g, color.b));
                    float contribution = clamp((signal - uThreshold) / max(0.001, 1.0 - uThreshold), 0.0, 1.0);
                    return color * contribution;
                }

                void main() {
                    vec2 d = uTexel * uOffset;
                    vec3 color = bloomSample(vUv) * 4.0;
                    color += bloomSample(vUv + vec2( d.x, 0.0)) * 2.0;
                    color += bloomSample(vUv + vec2(-d.x, 0.0)) * 2.0;
                    color += bloomSample(vUv + vec2(0.0,  d.y)) * 2.0;
                    color += bloomSample(vUv + vec2(0.0, -d.y)) * 2.0;
                    color += bloomSample(vUv + vec2( d.x,  d.y));
                    color += bloomSample(vUv + vec2(-d.x,  d.y));
                    color += bloomSample(vUv + vec2( d.x, -d.y));
                    color += bloomSample(vUv + vec2(-d.x, -d.y));
                    gl_FragColor = vec4(color * 0.0625, 1.0);
                }
            `,
            depthTest: false,
            depthWrite: false,
            transparent: false,
            blending: THREE.NoBlending
        });
        state.downsampleMaterial.name = 'Lightflow_ViewportBloomDownsample';

        state.compositeMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tBeauty: { value: null },
                tMask: { value: null },
                tBloom0: { value: null },
                tBloom1: { value: null },
                tBloom2: { value: null },
                uUseBeauty: { value: false },
                uUseBloom: { value: true },
                uUseColorGrade: { value: false },
                uThreshold: { value: 0.72 },
                uBloomStrength: { value: 0.8 },
                uEmissiveStrength: { value: 1.35 },
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
                uniform sampler2D tMask;
                uniform sampler2D tBloom0;
                uniform sampler2D tBloom1;
                uniform sampler2D tBloom2;
                uniform bool uUseBeauty;
                uniform bool uUseBloom;
                uniform bool uUseColorGrade;
                uniform float uThreshold;
                uniform float uBloomStrength;
                uniform float uEmissiveStrength;
                uniform float uExposure;
                uniform float uContrast;
                uniform float uSaturation;
                uniform float uTemperature;
                uniform float uTint;
                uniform float uVignette;
                varying vec2 vUv;

                vec3 extractCore(vec3 color) {
                    color *= uEmissiveStrength;
                    float signal = max(color.r, max(color.g, color.b));
                    float contribution = clamp((signal - uThreshold) / max(0.001, 1.0 - uThreshold), 0.0, 1.0);
                    return color * contribution;
                }

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
                        bloom += extractCore(texture2D(tMask, vUv).rgb) * 0.10;
                        bloom += texture2D(tBloom0, vUv).rgb * 0.42;
                        bloom += texture2D(tBloom1, vUv).rgb * 0.30;
                        bloom += texture2D(tBloom2, vUv).rgb * 0.18;
                        bloom *= uBloomStrength;
                    }
                    vec3 color = beauty.rgb + bloom;
                    if (uUseColorGrade) color = colorGrade(color);
                    gl_FragColor = vec4(color, uUseBeauty ? beauty.a : 1.0);
                }
            `,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
        state.compositeMaterial.name = 'Lightflow_ViewportGPUComposer';
        state.postQuad = new THREE.Mesh(state.postGeometry, state.downsampleMaterial);
        state.postQuad.frustumCulled = false;
        state.postScene.add(state.postQuad);
    }

    function ensureViewportBeautyTexture(state, renderer, snapshot, width, height) {
        let needsInitialization = false;
        if (!state.beautyTarget) {
            state.beautyTarget = createViewportPostTarget(width, height, 'Lightflow_ViewportBeauty');
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

    function renderViewportBloomPyramid(preview, state, maskWidth, maskHeight, viewWidth, viewHeight) {
        const renderer = preview.renderer;
        createViewportComposerResources(state);
        const sizes = [2, 4, 8].map(divisor => ({
            width: Math.max(2, Math.round(maskWidth / divisor)),
            height: Math.max(2, Math.round(maskHeight / divisor))
        }));
        state.bloomTargets = state.bloomTargets || [];
        sizes.forEach((size, index) => {
            if (!state.bloomTargets[index]) {
                state.bloomTargets[index] = createViewportPostTarget(
                    size.width,
                    size.height,
                    'Lightflow_ViewportBloomMip' + index
                );
            } else {
                configureViewportPostTarget(state.bloomTargets[index], size.width, size.height);
            }
        });

        const material = state.downsampleMaterial;
        const uniforms = material.uniforms;
        const radiusInMaskPixels = clamp(toNumber(currentSettings.bloom_radius, 18), 1, 96) * maskWidth / Math.max(1, viewWidth);
        state.postQuad.material = material;
        renderer.autoClear = true;
        renderer.setClearColor?.(0x000000, 0);

        let input = state.maskTarget.texture;
        let inputWidth = maskWidth;
        let inputHeight = maskHeight;
        for (let index = 0; index < state.bloomTargets.length; index++) {
            const target = state.bloomTargets[index];
            uniforms.tInput.value = input;
            uniforms.uTexel.value.set(1 / Math.max(1, inputWidth), 1 / Math.max(1, inputHeight));
            uniforms.uOffset.value = clamp(0.85 + radiusInMaskPixels * (0.055 + index * 0.035), 0.85, 5.5);
            uniforms.uThreshold.value = clamp(toNumber(currentSettings.bloom_threshold, 0.72), 0, 1);
            uniforms.uEmissiveStrength.value = clamp(toNumber(currentSettings.bloom_emissive_strength, 1.35), 0, 6);
            uniforms.uApplyThreshold.value = index === 0;
            renderer.setRenderTarget(target);
            renderer.clear?.(true, false, false);
            renderer.render(state.postScene, state.postCamera);
            input = target.texture;
            inputWidth = target.width;
            inputHeight = target.height;
        }
        return state.bloomTargets;
    }

    function renderViewportGPUComposite(preview, state, snapshot, useBloom, useColorGrade) {
        const renderer = preview.renderer;
        createViewportComposerResources(state);
        const material = state.compositeMaterial;
        const uniforms = material.uniforms;
        const fallback = state.maskTarget?.texture || state.beautyTarget?.texture;
        uniforms.tBeauty.value = state.beautyTarget?.texture || fallback;
        uniforms.tMask.value = state.maskTarget?.texture || fallback;
        uniforms.tBloom0.value = state.bloomTargets?.[0]?.texture || fallback;
        uniforms.tBloom1.value = state.bloomTargets?.[1]?.texture || uniforms.tBloom0.value;
        uniforms.tBloom2.value = state.bloomTargets?.[2]?.texture || uniforms.tBloom1.value;
        uniforms.uUseBeauty.value = !!useColorGrade;
        uniforms.uUseBloom.value = !!useBloom;
        uniforms.uUseColorGrade.value = !!useColorGrade;
        uniforms.uThreshold.value = clamp(toNumber(currentSettings.bloom_threshold, 0.72), 0, 1);
        uniforms.uBloomStrength.value = clamp(toNumber(currentSettings.bloom_strength, 0.8), 0, 3);
        uniforms.uEmissiveStrength.value = clamp(toNumber(currentSettings.bloom_emissive_strength, 1.35), 0, 6);
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
        renderer.render(state.postScene, state.postCamera);
    }

    function getViewportComposerState(preview) {
        if (!preview?.canvas || !preview.renderer) return null;
        let state = VIEWPORT_COMPOSER_STATE.get(preview);
        if (state) return state;
        state = {
            preview,
            maskTarget: null,
            bloomTargets: null,
            beautyTarget: null,
            copyPosition: new THREE.Vector2(),
            postScene: null,
            postCamera: null,
            postQuad: null,
            postGeometry: null,
            downsampleMaterial: null,
            compositeMaterial: null,
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
        state.composerMs = state.composerMs > 0 ? state.composerMs * 0.88 + elapsed * 0.12 : elapsed;
        state.adaptiveFrames++;
        if (state.adaptiveFrames < 24) return;
        state.adaptiveFrames = 0;
        const fpsLimit = clamp(toNumber(currentSettings.viewport_bloom_fps, 0), 0, 144);
        const frameBudget = 1000 / Math.max(30, fpsLimit || 60);
        if (state.composerMs > frameBudget * 0.46) {
            state.dynamicScale = Math.max(profile.minScale, state.dynamicScale * 0.88);
        } else if (state.composerMs < frameBudget * 0.22) {
            state.dynamicScale = Math.min(profile.maxScale, state.dynamicScale * 1.06);
        }
    }

    function renderViewportComposer(preview) {
        if (!preview?.renderer || !preview.canvas || window.LightManagerStudioRenderSession || preview.sa_studio_render_active) return;
        if (!isLightflowRenderMode()) return;
        const useBloom = !!(currentSettings.viewport_bloom_enabled && currentSettings.bloom_enabled);
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
        const profile = getViewportBloomProfile(currentSettings);
        const requestedScale = profile.adaptive ? state.dynamicScale : profile.scale;
        const bloomScale = Math.min(requestedScale, profile.maxDimension / Math.max(viewWidth, viewHeight));
        const maskWidth = Math.max(2, Math.round(viewWidth * bloomScale));
        const maskHeight = Math.max(2, Math.round(viewHeight * bloomScale));
        const started = performance.now();

        state.rendering = true;
        try {
            if (useColorGrade) {
                const beauty = ensureViewportBeautyTexture(state, renderer, snapshot, viewWidth, viewHeight);
                if (!beauty || typeof renderer.copyFramebufferToTexture !== 'function') return;
                const originX = Math.max(0, Math.round(currentViewport?.x || 0));
                const originY = Math.max(0, Math.round(currentViewport?.y || 0));
                renderer.copyFramebufferToTexture(state.copyPosition.set(originX, originY), beauty);
            }
            let bloomReady = false;
            if (useBloom && renderViewportBloomMask(preview, state, maskWidth, maskHeight)) {
                renderViewportBloomPyramid(preview, state, maskWidth, maskHeight, viewWidth, viewHeight);
                bloomReady = true;
            }
            renderViewportGPUComposite(preview, state, snapshot, bloomReady, useColorGrade);
            state.lastRender = now;
        } catch (error) {
            if (!state.failureReported) {
                state.failureReported = true;
                console.warn('[Studio Render] realtime GPU composer failed', error);
            }
        } finally {
            restoreViewportRendererState(renderer, snapshot);
            state.rendering = false;
            updateAdaptiveViewportBloom(state, performance.now() - started, profile);
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

    function patchViewportComposer(preview) {
        if (!preview?.renderer || typeof preview.render !== 'function' || VIEWPORT_COMPOSER_STATE.has(preview)) return;
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
        collectStudioRenderPreviews().forEach(patchViewportComposer);
    }

    function resetSceneComposerLifecycle() {
        sceneComposerRevision += 1;
        if (typeof sceneComposerRefreshFrame === 'number' && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(sceneComposerRefreshFrame);
        }
        sceneComposerRefreshFrame = null;
        VIEWPORT_COMPOSER_STATE.forEach(state => {
            state.scheduled = false;
        });
    }

    function disposeViewportComposers() {
        VIEWPORT_COMPOSER_STATE.forEach((state, preview) => {
            if (preview?.render === state.patchedRender) preview.render = state.originalRender;
            state.disposed = true;
            state.maskTarget?.dispose?.();
            state.bloomTargets?.forEach?.(target => target?.dispose?.());
            state.beautyTarget?.dispose?.();
            state.downsampleMaterial?.dispose?.();
            state.compositeMaterial?.dispose?.();
            state.postGeometry?.dispose?.();
            state.maskTarget = null;
            state.bloomTargets = null;
            state.beautyTarget = null;
        });
        VIEWPORT_COMPOSER_STATE.clear();
    }

    async function deliverRender(dataUrl, size, settings) {
        const name = settings.file_name.replace(/[\\/:*?"<>|]+/g, '_') || DEFAULT_SETTINGS.file_name;
        if (settings.destination === 'save') {
            Blockbench.export({
                resource_id: 'studio_render',
                extensions: ['png'],
                type: translate('data.image', 'Image'),
                savetype: 'image',
                name,
                content: dataUrl
            });
        } else if (settings.destination === 'clipboard') {
            await copyImageToClipboard(dataUrl);
        } else if (settings.destination === 'texture' && window.Codecs?.image) {
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
        Blockbench.showQuickMessage(translate('studio_render.message.rendered', 'Studio render complete'));
    }

    async function renderWithSettings(inputSettings, options = {}) {
        const sourcePreview = getPreview();
        if (!sourcePreview) {
            Blockbench.showQuickMessage(translate('studio_render.message.no_preview', 'No preview is available to render.'));
            return;
        }
        const renderPreview = getOffscreenPreview();
        if (!renderPreview) {
            Blockbench.showQuickMessage(translate('studio_render.message.no_offscreen', 'Blockbench offscreen preview is not ready yet. Open a preview once and try again.'));
            return;
        }

        const normalized = normalizeForm(inputSettings);
        if (options.save !== false) {
            saveSettings(normalized);
        } else {
            currentSettings = Object.assign({}, normalized);
        }
        const anglePreset = getAnglePreset(normalized.angle_preset);
        const frameRect = normalized.capture_area === 'frame' && !anglePreset
            ? getFrameRectForPreview(sourcePreview, normalized)
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

        if (activeRenderSession) {
            Blockbench.showQuickMessage(translate(
                'studio_render.message.render_in_progress',
                'A Studio Render session is already in progress.'
            ));
            return;
        }

        const sampleFactor = clamp(parseInt(normalized.samples, 10) || 1, 1, 8);
        const { canvas, ctx } = prepareFinalCanvas(outputSize, normalized);
        const bloomMaskCanvas = normalized.bloom_enabled
            ? createCanvas(outputSize.width, outputSize.height)
            : null;
        const bloomMaskContext = bloomMaskCanvas
            ? bloomMaskCanvas.getContext('2d', { alpha: true })
            : null;
        if (bloomMaskContext) {
            bloomMaskContext.clearRect(0, 0, outputSize.width, outputSize.height);
        }
        const blockbenchShading = window.settings && window.settings.shading;
        const oldShading = blockbenchShading ? blockbenchShading.value : undefined;
        const previousState = capturePreviewState(renderPreview);
        const gpuProfile = getGpuProfile(renderPreview.renderer);
        const renderSession = { cancelled: false };
        activeRenderSession = renderSession;
        showGpuGuidanceIfNeeded(gpuProfile);

        try {
            if (blockbenchShading && blockbenchShading.value !== normalized.shading) {
                blockbenchShading.set(normalized.shading);
            }

            let cameraSourcePreview = sourcePreview;
            if (anglePreset) {
                renderPreview.loadAnglePreset(anglePreset);
                cameraSourcePreview = snapshotCameraSource(renderPreview, outputSize.width, outputSize.height);
            }

            const tileSize = resolveTileSize(normalized, renderPreview.renderer, sampleFactor);
            const tiles = buildTileList(outputSize, sampleFactor, tileSize, cameraSourcePreview, normalized, frameRect);
            StudioRenderFrame.prepareTileProgress(tiles, outputSize, normalized);

            Blockbench.setStatusBarText(
                translate('studio_render.status.preparing', 'Preparing studio render...') +
                ' - ' +
                getGpuClassLabel(gpuProfile)
            );
            Blockbench.setProgress(0);

            /*
             * Keep the Studio ownership flags active for the complete async
             * session, including waitForFrame() gaps between tiles. Before
             * this, LightManagerStudioRenderActive was deleted after every
             * tile, which allowed queued preview refreshes to enter the normal
             * main_preview path while the shared shadow map still had the
             * Studio resolution.
             */
            claimStudioRenderFlags(renderSession, renderPreview);

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
                    try {
                        prepareRendererForTile(renderPreview, cameraSourcePreview, normalized, tile);
                        synchronizeStudioRenderLighting(renderPreview);

                        /*
                         * One synchronous render is enough: Three r129 updates
                         * WebGLShadowMap before drawing the scene. A second
                         * render plus force:true here repeatedly invalidated
                         * the same map for every tile and made the final tile
                         * race the shadow refresh.
                         */
                        renderPreviewWithExactCameraPose(renderPreview);
                        compositeStudioRenderPostEffects(renderPreview, normalized, tile);
                    } finally {
                        delete renderPreview.sa_studio_render_manual_silhouette;
                        delete renderPreview.sa_studio_render_active;
                    }
                    drawTile(ctx, renderPreview, tile, sampleFactor);
                    if (bloomMaskContext) {
                        renderBloomMaskTile(renderPreview, bloomMaskContext, tile, sampleFactor);
                    }
                    StudioRenderFrame.setTileProgress(index, 'done');
                    Blockbench.setProgress((index + 1) / tiles.length);
                    if (index % 3 === 0) {
                        await waitForFrame();
                        if (renderSession.cancelled) return;
                    }
                }
            };

            await withoutStudioRenderHighlights(async () => {
                if (normalized.show_gizmos) {
                    await renderTiles();
                } else {
                    await withoutStudioRenderGizmos(renderTiles);
                }
            });

            if (renderSession.cancelled) return;

            Blockbench.setStatusBarText(translate('studio_render.status.downsample', 'Compositing final image...'));
            applyFinalBloom(canvas, normalized, bloomMaskCanvas);
            applyFinalColorGrade(canvas, normalized);
            const dataUrl = canvas.toDataURL('image/png');
            await deliverRender(dataUrl, outputSize, normalized);
        } catch (error) {
            if (renderSession.cancelled) return;
            Blockbench.showMessageBox({
                title: translate('studio_render.plugin.title', 'Studio Render'),
                message: error && error.message ? error.message : String(error),
                icon: 'error'
            });
        } finally {
            restoreStudioRenderFlags(renderSession);
            StudioRenderFrame.clearTileProgress();
            if (blockbenchShading && typeof oldShading === 'boolean' && blockbenchShading.value !== oldShading) {
                blockbenchShading.set(oldShading);
            }
            restorePreviewState(renderPreview, previousState);
            clearCameraViewOffset(renderPreview.camera);
            await recoverPreviewShadowsAfterStudioRender(sourcePreview, renderPreview);
            Blockbench.setProgress();
            Blockbench.setStatusBarText();
            if (activeRenderSession === renderSession) activeRenderSession = null;
        }
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
            pixelAspect
        } = options;
        const anchorX = xEdge === 'left' ? original.x + original.width : original.x;
        const anchorY = yEdge === 'top' ? original.y + original.height : original.y;
        const rawWidth = Math.max(0, (
            xEdge === 'left' ? anchorX - pointerX : pointerX - anchorX
        ) * previewWidth);
        const rawHeight = Math.max(0, (
            yEdge === 'top' ? anchorY - pointerY : pointerY - anchorY
        ) * previewHeight);
        const aspect = Math.max(0.0001, toNumber(pixelAspect, 1));

        let height = rawHeight;
        let width = rawWidth;
        if (rawWidth / Math.max(0.0001, rawHeight) > aspect) {
            height = rawWidth / aspect;
        } else {
            width = rawHeight * aspect;
        }

        const maxWidth = (xEdge === 'left' ? anchorX : 1 - anchorX) * previewWidth;
        const maxHeight = (yEdge === 'top' ? anchorY : 1 - anchorY) * previewHeight;
        const minHeight = Math.max(0.05 * previewHeight, (0.05 * previewWidth) / aspect);
        const maxConstrainedHeight = Math.max(0, Math.min(maxHeight, maxWidth / aspect));
        height = Math.min(Math.max(height, Math.min(minHeight, maxConstrainedHeight)), maxConstrainedHeight);
        width = height * aspect;

        const normalizedWidth = width / previewWidth;
        const normalizedHeight = height / previewHeight;
        return {
            x: clamp(xEdge === 'left' ? anchorX - normalizedWidth : anchorX, 0, 1 - normalizedWidth),
            y: clamp(yEdge === 'top' ? anchorY - normalizedHeight : anchorY, 0, 1 - normalizedHeight),
            width: normalizedWidth,
            height: normalizedHeight
        };
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

        getState(preview, settings) {
            const project = getActiveProject();
            const stored = getProjectFrameState(project) || (!project ? readJSON(FRAME_STORAGE_KEY, null) : null);
            const width = Math.max(1, preview?.width || preview?.node?.clientWidth || 16);
            const height = Math.max(1, preview?.height || preview?.node?.clientHeight || 9);
            const aspect = settings?.resolution?.[0] && settings?.resolution?.[1]
                ? settings.resolution[0] / settings.resolution[1]
                : 16 / 9;

            if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
                return normalizeFrameState(stored);
            }

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
                height: normalizedHeight
            };
        },

        saveState(projectScoped = false) {
            if (!this.state) return;
            writeJSON(FRAME_STORAGE_KEY, this.state);
            if (projectScoped) saveProjectFrameState(this.state);
        },

        setState(state, preview = getPreview(), settings = currentSettings) {
            this.state = normalizeFrameState(state);
            this.saveState(true);
            if (this.node && this.preview === preview) {
                this.updateNode();
            } else if (settings?.capture_area === 'frame') {
                this.show(preview, settings);
            }
            return Object.assign({}, this.state);
        },

        show(preview = getPreview(), settings = currentSettings) {
            if (!preview || !preview.node) {
                Blockbench.showQuickMessage(translate('studio_render.message.no_preview', 'No preview is available to render.'));
                return;
            }
            if (this.node && this.preview === preview) {
                this.updateNode();
                syncFrameAction();
                return;
            }
            this.remove(false);
            this.preview = preview;
            this.state = this.getState(preview, settings);
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
                        'Resize Frame - Ctrl: Square, Shift: Lock Aspect Ratio'
                    ),
                    'aria-label': translate(
                        'studio_render.frame.resize_hint',
                        'Resize Frame - Ctrl: Square, Shift: Lock Aspect Ratio'
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
            localStorage.removeItem(FRAME_STORAGE_KEY);
            const document = getProjectCameraPresetDocument();
            document.active_frame = null;
            saveProjectCameraPresetDocument(document, getActiveProject(), { warn: false });
            const visibleBounds = getVisibleCanvasBounds(preview);
            this.state = visibleBounds || this.getState(preview, settings);
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
            const sampleFactor = clamp(parseInt(settings.samples, 10) || 1, 1, 8);
            const renderPreview = getOffscreenPreview();
            const tileSize = resolveTileSize(settings, renderPreview?.renderer, sampleFactor);
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
            this.bindPointerInteraction(move, () => this.saveState(true));
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
                if (lockSquare || lockCurrentAspect) {
                    const constrained = constrainFrameResize({
                        original,
                        pointerX: (xEdge === 'left' ? original.x : original.x + original.width) + dx,
                        pointerY: (yEdge === 'top' ? original.y : original.y + original.height) + dy,
                        xEdge,
                        yEdge,
                        previewWidth,
                        previewHeight,
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

                if (xEdge === 'left') left = clamp(original.x + dx, 0, right - 0.05);
                if (xEdge === 'right') right = clamp(original.x + original.width + dx, left + 0.05, 1);
                if (yEdge === 'top') top = clamp(original.y + dy, 0, bottom - 0.05);
                if (yEdge === 'bottom') bottom = clamp(original.y + original.height + dy, top + 0.05, 1);

                this.state.x = left;
                this.state.y = top;
                this.state.width = right - left;
                this.state.height = bottom - top;
                this.updateNode();
            };
            this.bindPointerInteraction(move, () => this.saveState(true));
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
        const required = ['bar_display', 'combo_slider', 'compact_select', 'horizontal_select', 'custom_checkbox', 'action_button'];
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
            bloom_radius: {
                type: 'range',
                label: 'studio_render.field.bloom_radius',
                value: settings.bloom_radius,
                min: 1,
                max: 96,
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
            bloom_radius: {
                type: 'range',
                label: 'studio_render.field.bloom_radius',
                value: settings.bloom_radius,
                min: 1,
                max: 96,
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
                    vibrant_visuals: 'Minecraft Vibrant Visuals'
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

    function createSceneComposerPanelForm(settings) {
        return {
            viewport_bloom_enabled: {
                type: 'checkbox', label: 'studio_render.field.viewport_bloom_enabled', value: settings.viewport_bloom_enabled
            },
            viewport_bloom_quality: {
                type: 'select', label: 'studio_render.field.viewport_bloom_quality', value: settings.viewport_bloom_quality,
                options: {
                    adaptive: 'studio_render.option.viewport_bloom.adaptive',
                    performance: 'studio_render.option.viewport_bloom.performance',
                    balanced: 'studio_render.option.viewport_bloom.balanced',
                    high: 'studio_render.option.viewport_bloom.high'
                },
                condition: form => !!form.viewport_bloom_enabled
            },
            viewport_bloom_fps: {
                type: 'range', label: 'studio_render.field.viewport_bloom_fps', value: settings.viewport_bloom_fps,
                min: 0, max: 144, step: 1, condition: form => !!form.viewport_bloom_enabled
            },
            bloom_enabled: {
                type: 'checkbox', label: 'studio_render.field.bloom_enabled', value: settings.bloom_enabled
            },
            bloom_strength: {
                type: 'range', label: 'studio_render.field.bloom_strength', value: settings.bloom_strength,
                min: 0, max: 3, step: 0.05, condition: form => !!form.bloom_enabled
            },
            composer_advanced: {
                type: 'buttons', buttons: ['studio_render.action.open_advanced'],
                click() { openSceneComposerDialog(); }
            }
        };
    }

    function syncSceneComposerPanel() {
        if (!sceneComposerPanel?.form || syncingSceneComposerPanel) return;
        syncingSceneComposerPanel = true;
        sceneComposerPanel.form.form_config = createSceneComposerPanelForm(currentSettings);
        sceneComposerPanel.form.buildForm();
        syncingSceneComposerPanel = false;
    }

    function applySceneComposerForm(form, persist) {
        const next = Object.assign({}, currentSettings, form || {});
        delete next.environment_enabled;
        delete next.environment_preset;
        delete next.environment_time;
        delete next.environment_strength;
        currentSettings = normalizeForm(next);
        if (persist) saveSettings(currentSettings);

        if (window.LightflowEnvironment && form) {
            const environmentSettings = {};
            if (Object.prototype.hasOwnProperty.call(form, 'environment_enabled')) environmentSettings.enabled = form.environment_enabled;
            if (Object.prototype.hasOwnProperty.call(form, 'environment_preset')) environmentSettings.preset = form.environment_preset;
            if (Object.prototype.hasOwnProperty.call(form, 'environment_time')) environmentSettings.time = form.environment_time;
            if (Object.prototype.hasOwnProperty.call(form, 'environment_strength')) environmentSettings.environment_strength = form.environment_strength;
            if (Object.keys(environmentSettings).length) {
                window.LightflowEnvironment.setSettings(environmentSettings, {
                    cause: 'scene_composer',
                    render: false,
                    forceShadow: false
                });
            }
        }

        refreshSceneComposerPreviews();
    }

    function openSceneComposerDialog() {
        currentSettings = loadSettings();
        const initialEnvironment = window.LightflowEnvironment?.settings || null;
        activeComposerDialog = new Dialog('lightflow_scene_composer_dialog', {
            title: 'studio_render.action.scene_composer',
            width: 680,
            form: createSceneComposerForm(currentSettings),
            onFormChange(form) {
                applySceneComposerForm(form, false);
            },
            onConfirm(form) {
                applySceneComposerForm(form, true);
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
                activeComposerDialog = null;
            }
        });
        activeComposerDialog.show();
    }

    function openStudioRenderDialog() {
        currentSettings = loadSettings();
        activeDialog = new Dialog({
            id: 'studio_render',
            title: 'studio_render.dialog.title',
            width: 680,
            form: createDialogForm(currentSettings),
            buttons: ['studio_render.button.render', 'dialog.cancel'],
            onFormChange(form) {
                const next = normalizeForm(form);
                if (next.resolution_preset !== 'custom') {
                    this.setFormValues({ resolution: next.resolution }, false);
                }
                currentSettings = next;
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
            #panel_lightflow_scene_composer_panel {
                overflow-y: auto !important;
                overflow-x: hidden;
                background: var(--color-ui);
            }
            #panel_lightflow_scene_composer_panel .dialog_bar {
                min-height: 27px;
                margin: 0;
                padding-top: 1px;
                padding-bottom: 1px;
                box-sizing: border-box;
            }
            #panel_lightflow_scene_composer_panel .form_bar_viewport_bloom_enabled,
            #panel_lightflow_scene_composer_panel .form_bar_bloom_enabled {
                border-left: 3px solid ${previewColor};
                padding-left: 7px;
            }
            #panel_lightflow_scene_composer_panel .form_bar_bloom_enabled {
                border-left-color: ${bloomColor};
            }
            #panel_lightflow_scene_composer_panel .form_bar_viewport_bloom_fps input[type="range"] {
                --color-thumb: ${previewColor};
            }
            #panel_lightflow_scene_composer_panel .form_bar_bloom_strength input[type="range"] {
                --color-thumb: ${bloomColor};
            }
            #panel_lightflow_scene_composer_panel::-webkit-scrollbar {
                width: 6px;
            }
            #panel_lightflow_scene_composer_panel::-webkit-scrollbar-thumb {
                background: var(--color-button);
                border-radius: 3px;
            }
        `);
    }

    function unloadPlugin() {
        if (activeRenderSession) {
            activeRenderSession.cancelled = true;
            restoreStudioRenderFlags(activeRenderSession);
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
        if (sceneComposerPanel) sceneComposerPanel.delete();
        if (sceneComposerProjectListener) sceneComposerProjectListener.delete?.();
        if (sceneComposerModeListener) sceneComposerModeListener.delete?.();
        if (sceneComposerCloseListener) sceneComposerCloseListener.delete?.();
        if (sceneComposerLifecycleHydrator) sceneComposerLifecycleHydrator.delete?.();
        if (cameraPresetsParsedListener) cameraPresetsParsedListener.delete?.();
        if (cameraPresetsProjectProperty) cameraPresetsProjectProperty.delete?.();
        cameraPresetsProjectProperty = null;
        resetSceneComposerLifecycle();
        disposeViewportComposers();
        if (stylesheet && typeof stylesheet.delete === 'function') stylesheet.delete();
        BLOOM_MASK_STATE.resources.forEach(resource => resource?.dispose?.());
        BLOOM_MASK_STATE.resources.clear();
        BLOOM_MASK_STATE.emissiveMaterials = new WeakMap();
        BLOOM_MASK_STATE.occluderMaterials = new WeakMap();
        restoreWindowBindings();
        exportAction = null;
        quickRenderAction = null;
        frameAction = null;
        resetFrameAction = null;
        cameraPresetsAction = null;
        sceneComposerAction = null;
        sceneComposerPanel = null;
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
        version: '1.9.0',
        min_version: '4.9.0',
        variant: 'both',
        onload() {
            addTranslations();
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
                    slot: 'right_bar',
                    float_position: [0, 0],
                    float_size: [314, 200],
                    height: 200,
                    folded: false,
                    attached_to: window.Panels?.lightflow_environment_panel ? 'light_properties' : 'outliner',
                    attached_index: 3,
                    sidebar_index: 3
                },
                mode_positions: {
                    render: {
                        slot: 'right_bar',
                        height: 200,
                        folded: false,
                        attached_to: window.Panels?.light_properties ? 'light_properties' : 'outliner',
                        attached_index: 3,
                        sidebar_index: 3
                    }
                },
                insert_after: window.Panels?.lightflow_environment_panel ? 'lightflow_environment_panel' : 'outliner',
                form: createSceneComposerPanelForm(currentSettings)
            });

            sceneComposerFormListener = sceneComposerPanel.form.on('change', ({ result }) => {
                if (syncingSceneComposerPanel) return;
                applySceneComposerForm(result, true);
            });

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
            sceneComposerLifecycleHydrator = window.LightflowLifecycle?.registerHydrator?.(
                'studio_render',
                ({ project, model, deferred }) => {
                    resetStudioCameraPresetsForProjectChange();
                    resetSceneComposerLifecycle();
                    if (deferred || !project) return;
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
                quickRender: quickStudioRender,
                openComposer: openSceneComposerDialog,
                openCameraPresets: openCameraPresetManagerDialog,
                openCameraPresetMenu,
                refreshComposer: refreshSceneComposerPreviews,
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
                updateCameraPreset(id) {
                    return updateProjectCameraPreset(id, currentSettings);
                },
                deleteCameraPreset: deleteProjectCameraPreset,
                get settings() { return Object.assign({}, currentSettings); },
                setComposerSettings(next) {
                    currentSettings = normalizeForm(Object.assign({}, currentSettings, next || {}));
                    saveSettings(currentSettings);
                    syncSceneComposerPanel();
                    refreshSceneComposerPreviews();
                    return Object.assign({}, currentSettings);
                },
                showFrame: () => StudioRenderFrame.show(getPreview(), currentSettings),
                hideFrame: () => StudioRenderFrame.remove(true),
                resetFrame: () => StudioRenderFrame.reset(getPreview(), currentSettings)
            });
        },
        onunload: unloadPlugin
    });
})();
