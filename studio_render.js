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
        zoom: null,
        destination: 'preview',
        file_name: 'studio_render'
    };

    let exportAction;
    let frameAction;
    let resetFrameAction;
    let stylesheet;
    let activeDialog;
    let currentSettings = Object.assign({}, DEFAULT_SETTINGS);
    let gpuGuidanceShown = false;

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
            72
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
            'studio_render.plugin.description': 'Exports high resolution studio stills with tiled supersampling, transparent backgrounds, and an optional render frame.',
            'studio_render.action.export': 'Studio Render',
            'studio_render.action.export.desc': 'Render the selected preview as a production still with tiled supersampling.',
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
            'studio_render.field.zoom': 'Focal Length',
            'studio_render.field.gpu': 'GPU',
            'studio_render.field.gpu_renderer': 'Renderer',
            'studio_render.field.destination': 'After Render',
            'studio_render.field.file_name': 'File Name',
            'studio_render.group.camera': 'Camera',
            'studio_render.group.output': 'Output',
            'studio_render.group.frame': 'Frame',
            'studio_render.group.look': 'Look',
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
            'studio_render.plugin.description': 'Exporta renders de estudio en alta resolucion con supersampling por tiles, fondos transparentes y un marco opcional.',
            'studio_render.action.export': 'Render de Estudio',
            'studio_render.action.export.desc': 'Renderiza la vista seleccionada como imagen de produccion con supersampling por tiles.',
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
            'studio_render.field.zoom': 'Distancia Focal',
            'studio_render.field.gpu': 'GPU',
            'studio_render.field.gpu_renderer': 'Renderer',
            'studio_render.field.destination': 'Despues de Render',
            'studio_render.field.file_name': 'Nombre de Archivo',
            'studio_render.group.camera': 'Camara',
            'studio_render.group.output': 'Salida',
            'studio_render.group.frame': 'Marco',
            'studio_render.group.look': 'Aspecto',
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
            El RIM puede alcanzar hasta 192 px internos despues de aplicar
            el zoom del Render Frame. Este margen evita cortes en los bordes
            del Frame y uniones visibles entre tiles.
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
            El RIM vive en screen-space. Para que conserve el mismo grosor
            visual que en el viewport, su radio debe crecer con la resolucion
            final y, si hay Render Frame, con el zoom de ese encuadre.
        */
        const outputPixelScale = Math.max(
            size.width / sourceWidth,
            size.height / sourceHeight,
            1.0
        );

        const frameZoomScale = useFrame
            ? Math.max(
                sourceWidth / Math.max(frameRect.width, 1),
                sourceHeight / Math.max(frameRect.height, 1)
            )
            : 1.0;

        const promotionalRimFrameScale = outputPixelScale * frameZoomScale;

        /*
            Margen compartido entre tiles.

            También se usa como overscan exterior del frame. Es mayor que
            MAX_RIM_RADIUS y protege efectos de dilatación screen-space.
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
                    Bleed normal entre tiles vecinos.
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
                    Overscan adicional fuera del Render Frame.
                    Solo existe en los límites externos del frame.
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
                        renderX/renderY pueden quedar negativos en los bordes
                        del frame. Eso es intencional: la cámara renderiza
                        temporalmente fuera del encuadre final para que el RIM
                        tenga información suficiente.
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

        renderPreview.resize(renderWidth, renderHeight);
        configureTileCamera(renderPreview, sourcePreview, settings, tile);

        if (typeof renderPreview.renderer?.setPixelRatio === 'function') {
            renderPreview.renderer.setPixelRatio(1);
        }
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

    function drawTile(ctx, renderPreview, tile) {
        ctx.drawImage(
            renderPreview.canvas,
            Math.round(tile.cropX || 0),
            Math.round(tile.cropY || 0),
            tile.sampleWidth,
            tile.sampleHeight,
            Math.round(tile.outputX),
            Math.round(tile.outputY),
            Math.ceil(tile.outputWidth),
            Math.ceil(tile.outputHeight)
        );
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

    async function renderWithSettings(inputSettings) {
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
        saveSettings(normalized);
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
                    drawTile(ctx, renderPreview, tile);
                    Blockbench.setProgress((index + 1) / tiles.length);
                    if (index % 3 === 0) await waitForFrame();
                }
            };

            if (normalized.show_gizmos) {
                await renderTiles();
            } else {
                await withoutStudioRenderGizmos(renderTiles);
            }

            Blockbench.setStatusBarText(translate('studio_render.status.downsample', 'Compositing final image...'));
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
                    'fiber_manual_record',
                    'studio_render.action.capture',
                    'Render Now',
                    () => renderWithSettings(getFrameSettings()),
                    'var(--color-close)'
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
                    'stop',
                    'studio_render.button.reset_frame',
                    'Reset Frame',
                    () => this.reset(getPreview(), currentSettings)
                )
            );
            this.tileButton = this.createButton(
                'studio_render_tile_button',
                'grid_on',
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
            this.updateToolbarState();
            this.saveState();
        },

        updateLabel() {
            if (!this.label || !this.preview) return;
            const rect = this.getPixelRect();
            const size = computeOutputSize(getFrameSettings(), rect);
            this.label.textContent = 'Studio - ' + size.width + ' x ' + size.height;
        },

        updateToolbarState() {
            if (!this.node) return;
            this.node.classList.toggle('show_tile_grid', !!currentSettings.show_tile_grid);
            if (this.tileButton) {
                this.tileButton.classList.toggle('active', !!currentSettings.show_tile_grid);
            }
        },

        updateTileGrid() {
            if (!this.tileGrid || !this.preview) return;
            this.tileGrid.innerHTML = '';
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
                step: 0.25
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
                }
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
                }
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
                value: settings.show_gizmos
            },
            show_tile_grid: {
                type: 'checkbox',
                label: 'studio_render.field.show_tile_grid',
                value: settings.show_tile_grid
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
                activeDialog = null;
            }
        });
        activeDialog.show();
    }

    function addStyles() {
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
                top: 6px;
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
                border: 1px solid rgba(45, 143, 255, 0.70);
                border-radius: 3px;
                font-size: 12px;
                line-height: 16px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                user-select: none;
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
                bottom: 10px;
                transform: translateX(-50%);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                min-height: 34px;
                padding: 5px 10px;
                box-sizing: border-box;
                background: rgba(30, 35, 45, 0.93);
                border: 1px solid rgba(255, 255, 255, 0.07);
                border-radius: 4px;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.38);
                cursor: default;
            }
            .studio_render_frame_button {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                background: transparent;
                color: var(--color-light);
                border: 0;
                border-radius: 3px;
                cursor: pointer;
            }
            .studio_render_frame_button:hover,
            .studio_render_frame_button.active {
                background: rgba(45, 143, 255, 0.22);
                color: #ffffff;
            }
            .studio_render_frame_button i {
                font-size: 19px;
                line-height: 1;
                pointer-events: none;
            }
            .studio_render_capture_button i {
                color: var(--color-close);
                font-size: 17px;
            }
            .studio_render_reset_button i {
                font-size: 16px;
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
                background: rgba(66, 170, 255, 0.46);
                box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.22);
            }
            .studio_render_tile_line.vertical {
                top: 0;
                bottom: 0;
                width: 1px;
            }
            .studio_render_tile_line.horizontal {
                left: 0;
                right: 0;
                height: 1px;
            }
        `);
    }

    function unloadPlugin() {
        StudioRenderFrame.remove(false);
        if (activeDialog) {
            activeDialog.hide();
            activeDialog = null;
        }
        if (exportAction) exportAction.delete();
        if (frameAction) frameAction.delete();
        if (resetFrameAction) resetFrameAction.delete();
        if (stylesheet && typeof stylesheet.delete === 'function') stylesheet.delete();
        delete window.StudioRender;
    }

    Plugin.register(PLUGIN_ID, {
        title: 'Studio Render',
        icon: 'photo_camera',
        author: 'MidFord',
        description: 'Exports professional high resolution model renders with tiled supersampling, 4K/8K-safe output, transparency, and an optional viewport render frame.',
        tags: ['Render', 'Screenshot', 'Export'],
        version: '1.0.0',
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

            MenuBar.addAction(exportAction, 'file.export');
            MenuBar.addAction(exportAction, 'view');
            MenuBar.addAction(frameAction, 'view');
            MenuBar.addAction(resetFrameAction, 'view');

            window.StudioRender = {
                open: openStudioRenderDialog,
                render: renderWithSettings,
                showFrame: () => StudioRenderFrame.show(getPreview(), currentSettings),
                hideFrame: () => StudioRenderFrame.remove(true),
                resetFrame: () => StudioRenderFrame.reset(getPreview(), currentSettings)
            };
        },
        onunload: unloadPlugin
    });
})();
