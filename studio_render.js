(function () {
    'use strict';

    const PLUGIN_ID = 'studio_render';
    const STORAGE_KEY = 'studio_render.settings';
    const FRAME_STORAGE_KEY = 'studio_render.frame';
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
    let sceneComposerAction;
    let sceneComposerPanel;
    let sceneComposerProjectListener;
    let sceneComposerModeListener;
    let syncingSceneComposerPanel = false;
    let activeComposerDialog;
    let stylesheet;
    let activeDialog;
    let currentSettings = Object.assign({}, DEFAULT_SETTINGS);
    let gpuGuidanceShown = false;
    const BLOOM_MASK_STATE = {
        emissiveMaterials: new WeakMap(),
        occluderMaterials: new WeakMap(),
        resources: new Set()
    };
    const VIEWPORT_COMPOSER_STATE = new Map();

    const VIEWPORT_BLOOM_PROFILES = {
        adaptive: { scale: 0.42, minScale: 0.2, maxScale: 0.7, maxDimension: 1400, adaptive: true },
        performance: { scale: 0.25, maxDimension: 720 },
        balanced: { scale: 0.42, maxDimension: 1100 },
        high: { scale: 0.7, maxDimension: 1600 }
    };

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
            return fallback;
        }
    }

    function writeJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            // Ignore unavailable storage; defaults keep the renderer usable.
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
            'studio_render.action.reset_frame.desc': 'Restore the Studio Render frame to its centered default size.',
            'studio_render.action.capture': 'Render Now',
            'studio_render.action.capture.desc': 'Render the current Studio Render frame.',
            'studio_render.action.settings': 'Render Settings',
            'studio_render.action.settings.desc': 'Open Studio Render settings.',
            'studio_render.action.tile_grid': 'Tile Grid',
            'studio_render.action.tile_grid.desc': 'Show or hide render tile divisions.',
            'studio_render.action.close_frame': 'Close Frame',
            'studio_render.dialog.title': 'Studio Render',
            'studio_render.field.angle': 'Camera',
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
            'studio_render.group.output': 'Output',
            'studio_render.group.frame': 'Frame',
            'studio_render.group.look': 'Look',
            'studio_render.group.effects': 'Final Effects',
            'studio_render.group.export': 'Export',
            'studio_render.option.camera.view': 'Current View',
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
            'studio_render.status.preparing': 'Preparing studio render...',
            'studio_render.status.tile': 'Rendering tile',
            'studio_render.status.downsample': 'Compositing final image...',
            'studio_render.message.no_preview': 'No preview is available to render.',
            'studio_render.message.no_offscreen': 'Blockbench offscreen preview is not ready yet. Open a preview once and try again.',
            'studio_render.message.too_large': 'The requested output is too large for a safe browser canvas.',
            'studio_render.message.rendered': 'Studio render complete',
            'studio_render.message.copied': 'Studio render copied to clipboard',
            'studio_render.message.gpu_title': 'Studio Render GPU',
            'studio_render.message.gpu_dedicated': 'Studio Render is already using a renderer that looks like a dedicated GPU.',
            'studio_render.message.gpu_guidance': 'Blockbench chooses the WebGL GPU before plugins run. To force a dedicated GPU, set Blockbench.exe to High performance in Windows Graphics settings or your NVIDIA/AMD control panel, then restart Blockbench.',
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
            'studio_render.action.reset_frame.desc': 'Restaura el marco de Render de Estudio a su tamano centrado por defecto.',
            'studio_render.action.capture': 'Renderizar Ahora',
            'studio_render.action.capture.desc': 'Renderiza el marco actual de Render de Estudio.',
            'studio_render.action.settings': 'Ajustes de Render',
            'studio_render.action.settings.desc': 'Abre los ajustes de Render de Estudio.',
            'studio_render.action.tile_grid': 'Cuadricula de Tiles',
            'studio_render.action.tile_grid.desc': 'Muestra u oculta las divisiones de tiles de render.',
            'studio_render.action.close_frame': 'Cerrar Marco',
            'studio_render.dialog.title': 'Render de Estudio',
            'studio_render.field.angle': 'Camara',
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
            'studio_render.group.output': 'Salida',
            'studio_render.group.frame': 'Marco',
            'studio_render.group.look': 'Aspecto',
            'studio_render.group.effects': 'Efectos Finales',
            'studio_render.group.export': 'Exportacion',
            'studio_render.option.camera.view': 'Vista Actual',
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
            'studio_render.status.preparing': 'Preparando render de estudio...',
            'studio_render.status.tile': 'Renderizando tile',
            'studio_render.status.downsample': 'Componiendo imagen final...',
            'studio_render.message.no_preview': 'No hay preview disponible para renderizar.',
            'studio_render.message.no_offscreen': 'El preview offscreen de Blockbench no esta listo. Abre un preview e intenta de nuevo.',
            'studio_render.message.too_large': 'La salida solicitada es demasiado grande para un canvas seguro.',
            'studio_render.message.rendered': 'Render de estudio completado',
            'studio_render.message.copied': 'Render de estudio copiado al portapapeles',
            'studio_render.message.gpu_title': 'GPU de Render de Estudio',
            'studio_render.message.gpu_dedicated': 'Render de Estudio ya esta usando un renderer que parece una GPU dedicada.',
            'studio_render.message.gpu_guidance': 'Blockbench elige la GPU WebGL antes de que corran los plugins. Para forzar una GPU dedicada, asigna Blockbench.exe a Alto rendimiento en Graficos de Windows o en el panel NVIDIA/AMD, y reinicia Blockbench.',
            'studio_render.frame.label': 'Marco de Render'
        });
    }

    function loadSettings() {
        const stored = readJSON(STORAGE_KEY, {});
        const legacyViewportComposer = toNumber(stored.viewport_composer_revision, 0) < 2;
        const settings = Object.assign({}, DEFAULT_SETTINGS, stored);
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

    function normalizeForm(form) {
        const settings = Object.assign({}, DEFAULT_SETTINGS, form || {});
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
            Reserva espacio para bleed izquierdo + derecho.
            Esto aplica tanto a tiles centrales como a tiles de borde
            con overscan de Render Frame.
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
        const camera = renderPreview.camera;
        camera.position.copy(sourceCamera.position);
        camera.quaternion.copy(sourceCamera.quaternion);
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
            camera.zoom = sourceCamera.zoom;
            if (Number.isFinite(settings.zoom) && settings.zoom > 0) {
                camera.zoom = Math.max(0.01, settings.zoom / 100);
            }
        } else {
            camera.aspect = baseWidth / baseHeight;
            camera.fov = sourceCamera.fov;
            if (Number.isFinite(settings.zoom) && settings.zoom > 0) {
                camera.setFocalLength(settings.zoom);
            }
        }
        camera.updateProjectionMatrix();
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
            camera.setViewOffset(
                tile.fullViewWidth,
                tile.fullViewHeight,
                tile.viewX,
                tile.viewY,
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
            width: clamp(state.width, 0.02, 1) * width,
            height: clamp(state.height, 0.02, 1) * height
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
        const useEmissiveMap = getMaterialUniformValue(material, 'uUseEmissiveMap', false) === true && !useMERMap;
        const emissiveStrength = Math.max(
            0,
            Number(getMaterialUniformValue(material, 'uEmissiveStrength', material.emissiveIntensity || 1)) || 0
        );
        const hasStandardEmission = !!(
            material.emissiveMap ||
            (material.emissive && typeof material.emissive.getHex === 'function' && material.emissive.getHex() !== 0)
        );

        return {
            active: emissiveMode || additiveMode || useMERMap || useEmissiveMap || hasStandardEmission,
            mode: emissiveMode ? 1 : (additiveMode ? 2 : 0),
            useMERMap,
            useEmissiveMap: useEmissiveMap || !!material.emissiveMap,
            emissiveStrength,
            baseMap: getMaterialTexture(material, 'map'),
            emissiveMap: getMaterialTexture(material, 'uEmissiveMap', material.emissiveMap || null),
            merMap: getMaterialTexture(material, 'uMetallicRoughnessMap'),
            emissiveColor: getMaterialUniformValue(material, 'uEmissiveColor', material.emissive || null)
        };
    }

    function copyColorToVector(target, value) {
        if (!value) return target.set(1, 1, 1);
        if (value.isColor) return target.set(value.r, value.g, value.b);
        if (value.x !== undefined) return target.set(value.x, value.y, value.z);
        if (value.r !== undefined) return target.set(value.r, value.g, value.b);
        return target.set(1, 1, 1);
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
                    uEmissiveMap: { value: null },
                    uMERMap: { value: null },
                    uEmissiveColor: { value: new THREE.Vector3(1, 1, 1) },
                    uMode: { value: 0 },
                    uUseEmissiveMap: { value: false },
                    uUseMERMap: { value: false },
                    uEmissiveStrength: { value: 1 },
                    uAlphaCutoff: { value: 0.01 },
                    uEmit: { value: emissive }
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
                    uniform sampler2D uEmissiveMap;
                    uniform sampler2D uMERMap;
                    uniform vec3 uEmissiveColor;
                    uniform int uMode;
                    uniform bool uUseEmissiveMap;
                    uniform bool uUseMERMap;
                    uniform float uEmissiveStrength;
                    uniform float uAlphaCutoff;
                    uniform bool uEmit;
                    varying vec2 vUv;

                    void main() {
                        vec4 base = texture2D(map, vUv);
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
                        if (uUseEmissiveMap) {
                            emission += texture2D(uEmissiveMap, vUv).rgb * uEmissiveColor * uEmissiveStrength;
                        }
                        if (uUseMERMap) {
                            emission += base.rgb * texture2D(uMERMap, vUv).g * uEmissiveStrength;
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
        material.uniforms.uEmissiveMap.value = state.emissiveMap || state.baseMap || fallback;
        material.uniforms.uMERMap.value = state.merMap || state.baseMap || fallback;
        material.uniforms.uMode.value = state.mode || 0;
        material.uniforms.uUseEmissiveMap.value = !!state.useEmissiveMap;
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
            sourcePreview.render();

            await waitForFrame();
            window.LightManagerPrepareRender(sourcePreview, { force: true, studio: false });
            sourcePreview.render();
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
        const run = () => {
            if (state.disposed) return;
            state.scheduled = false;
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
            window.LightManagerStudioRenderSession = true;
            window.LightManagerStudioRenderActive = true;
            window.LightManagerStudioRenderPreview = renderPreview;

            const renderTiles = async () => {
                for (let index = 0; index < tiles.length; index++) {
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
                        renderPreview.render();
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
                    if (index % 3 === 0) await waitForFrame();
                }
            };

            await withoutStudioRenderHighlights(async () => {
                if (normalized.show_gizmos) {
                    await renderTiles();
                } else {
                    await withoutStudioRenderGizmos(renderTiles);
                }
            });

            Blockbench.setStatusBarText(translate('studio_render.status.downsample', 'Compositing final image...'));
            applyFinalBloom(canvas, normalized, bloomMaskCanvas);
            applyFinalColorGrade(canvas, normalized);
            const dataUrl = canvas.toDataURL('image/png');
            await deliverRender(dataUrl, outputSize, normalized);
        } catch (error) {
            Blockbench.showMessageBox({
                title: translate('studio_render.plugin.title', 'Studio Render'),
                message: error && error.message ? error.message : String(error),
                icon: 'error'
            });
        } finally {
            delete window.LightManagerStudioRenderSession;
            delete window.LightManagerStudioRenderActive;
            delete window.LightManagerStudioRenderPreview;
            StudioRenderFrame.clearTileProgress();
            if (blockbenchShading && typeof oldShading === 'boolean' && blockbenchShading.value !== oldShading) {
                blockbenchShading.set(oldShading);
            }
            restorePreviewState(renderPreview, previousState);
            clearCameraViewOffset(renderPreview.camera);
            await recoverPreviewShadowsAfterStudioRender(sourcePreview, renderPreview);
            Blockbench.setProgress();
            Blockbench.setStatusBarText();
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
            // Keep cleanup best-effort if Blockbench changed preview internals.
        }
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

        getState(preview, settings) {
            const stored = readJSON(FRAME_STORAGE_KEY, null);
            const width = Math.max(1, preview?.width || preview?.node?.clientWidth || 16);
            const height = Math.max(1, preview?.height || preview?.node?.clientHeight || 9);
            const aspect = settings?.resolution?.[0] && settings?.resolution?.[1]
                ? settings.resolution[0] / settings.resolution[1]
                : 16 / 9;

            if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
                return {
                    x: clamp(stored.x, 0, 0.95),
                    y: clamp(stored.y, 0, 0.95),
                    width: clamp(stored.width, 0.05, 1),
                    height: clamp(stored.height, 0.05, 1)
                };
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

        saveState() {
            if (!this.state) return;
            writeJSON(FRAME_STORAGE_KEY, this.state);
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
                    class: 'studio_render_frame_handle studio_render_' + name
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
            button.addEventListener('mousedown', event => event.stopPropagation());
            button.addEventListener('touchstart', event => event.stopPropagation(), { passive: false });
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                onClick();
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
            this.state = this.getState(preview, settings);
            if (this.node) this.updateNode();
        },

        remove(save) {
            if (save) this.saveState();
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
            const controlsWidth = 118;
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
            const stop = () => {
                removeEventListeners(document, 'mousemove touchmove', move);
                removeEventListeners(document, 'mouseup touchend', stop);
                this.saveState();
            };
            addEventListeners(document, 'mousemove touchmove', move);
            addEventListeners(document, 'mouseup touchend', stop);
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
            const stop = () => {
                removeEventListeners(document, 'mousemove touchmove', move);
                removeEventListeners(document, 'mouseup touchend', stop);
                this.saveState();
            };
            addEventListeners(document, 'mousemove touchmove', move);
            addEventListeners(document, 'mouseup touchend', stop);
        }
    };

    function createDialogForm(settings) {
        return {
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
        };
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
        patchAllViewportComposers();
        collectStudioRenderPreviews().forEach(preview => preview?.render?.());
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
            width: 620,
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
    }

    function addStyles() {
        const palette = Array.isArray(globalThis.markerColors) ? globalThis.markerColors : [];
        const previewColor = palette[0]?.pastel || '#A2EBFF';
        const bloomColor = palette[8]?.pastel || '#FFA5D5';
        stylesheet = Blockbench.addCSS(`
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
        StudioRenderFrame.remove(false);
        if (activeDialog) {
            activeDialog.hide();
            activeDialog = null;
        }
        if (activeComposerDialog) {
            activeComposerDialog.hide();
            activeComposerDialog = null;
        }
        if (exportAction) exportAction.delete();
        if (quickRenderAction) quickRenderAction.delete();
        if (frameAction) frameAction.delete();
        if (resetFrameAction) resetFrameAction.delete();
        if (sceneComposerAction) sceneComposerAction.delete();
        if (sceneComposerPanel) sceneComposerPanel.delete();
        if (sceneComposerProjectListener) sceneComposerProjectListener.delete?.();
        if (sceneComposerModeListener) sceneComposerModeListener.delete?.();
        disposeViewportComposers();
        if (stylesheet && typeof stylesheet.delete === 'function') stylesheet.delete();
        BLOOM_MASK_STATE.resources.forEach(resource => resource?.dispose?.());
        BLOOM_MASK_STATE.resources.clear();
        BLOOM_MASK_STATE.emissiveMaterials = new WeakMap();
        BLOOM_MASK_STATE.occluderMaterials = new WeakMap();
        delete window.StudioRender;
    }

    Plugin.register(PLUGIN_ID, {
        title: 'Studio Render',
        icon: 'photo_camera_back',
        author: 'MidFord327',
        description: 'Export polished Blockbench studio renders with tiled supersampling, 4K/8K-safe output, transparency, GPU guidance, and an adjustable frame. Complements Light Manager and Shader Architect in the Lightflow suite.',
        tags: ['Lightflow', 'Rendering', 'Export', 'Screenshots', 'Studio', 'Presentation'],
        version: '1.6.1',
        min_version: '4.9.0',
        variant: 'both',
        onload() {
            addTranslations();
            addStyles();
            currentSettings = loadSettings();

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
                    attached_to: window.Panels?.lightflow_environment_panel ? 'lightflow_environment_panel' : 'outliner',
                    attached_index: 2,
                    sidebar_index: 2
                },
                mode_positions: {
                    render: {
                        slot: 'right_bar',
                        height: 200,
                        folded: false,
                        attached_to: window.Panels?.lightflow_environment_panel ? 'lightflow_environment_panel' : 'outliner',
                        attached_index: 2,
                        sidebar_index: 2
                    }
                },
                insert_after: window.Panels?.lightflow_environment_panel ? 'lightflow_environment_panel' : 'outliner',
                form: createSceneComposerPanelForm(currentSettings)
            });

            sceneComposerPanel.form.on('change', ({ result }) => {
                if (syncingSceneComposerPanel) return;
                applySceneComposerForm(result, true);
            });

            MenuBar.addAction(exportAction, 'file.export');
            MenuBar.addAction(quickRenderAction, 'file.export');
            MenuBar.addAction(exportAction, 'view');
            MenuBar.addAction(quickRenderAction, 'view');
            MenuBar.addAction(frameAction, 'view');
            MenuBar.addAction(resetFrameAction, 'view');
            MenuBar.addAction(sceneComposerAction, 'view');

            patchAllViewportComposers();
            sceneComposerProjectListener = Blockbench.on('select_project', () => {
                currentSettings = loadSettings();
                syncSceneComposerPanel();
                patchAllViewportComposers();
                refreshSceneComposerPreviews();
            });
            sceneComposerModeListener = Blockbench.on('select_mode', () => {
                refreshSceneComposerPreviews();
            });

            window.StudioRender = {
                open: openStudioRenderDialog,
                render: renderWithSettings,
                quickRender: quickStudioRender,
                openComposer: openSceneComposerDialog,
                refreshComposer: refreshSceneComposerPreviews,
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
            };
        },
        onunload: unloadPlugin
    });
})();
