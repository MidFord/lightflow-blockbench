(function () {
    'use strict';

    const HUB_ID = 'lightflow_hub';
    const HUB_VERSION = '1.0.0';
    const MANIFEST_FILE = 'lightflow.manifest.json';
    const REPOSITORY = Object.freeze({
        owner: 'MidFord',
        name: 'lightflow-blockbench',
        github: 'https://github.com/MidFord/lightflow-blockbench',
        issues: 'https://github.com/MidFord/lightflow-blockbench/issues',
        x: 'https://x.com/ford_mid_wells'
    });
    const STORAGE_KEY = 'lightflow_hub_preferences_v1';
    const CACHE_KEY = 'lightflow_hub_manifest_cache_v1';
    const VALID_GROUPS = new Set(['essential', 'creative', 'specialized', 'developer']);
    const DEFAULT_PREFERENCES = Object.freeze({
        channel: 'stable',
        experimentalBranch: 'experimental',
        source: 'github',
        localDirectory: '',
        automaticChecks: true,
        lastAutomaticCheck: 0
    });

    const FALLBACK_MODULES = Object.freeze([
        {id: 'light_manager', file: 'light_manager.js', title: 'Light Manager', description: 'Lights, gizmos, animation, and shadows for the entire suite.', description_es: 'Luces, gizmos, animación y sombras para toda la suite.', version: '1.8.2', min_blockbench: '4.9.0', icon: 'light_mode', group: 'essential', recommended: true, dependencies: []},
        {id: 'shader_architect', file: 'shader_architect.js', title: 'Shader Architect', description: 'Lightflow, PBR, and Rendercraft materials, instances, and screen effects.', description_es: 'Materiales Lightflow, PBR, Rendercraft, instancias y efectos de pantalla.', version: '3.2.6', min_blockbench: '4.9.0', icon: 'architecture', group: 'essential', recommended: true, dependencies: ['light_manager']},
        {id: 'lightflow_environment', file: 'lightflow_environment.js', title: 'Lightflow Environment', description: 'Sky, sun, moon, clouds, reflections, and environment lighting.', description_es: 'Cielo, sol, luna, nubes, reflejos e iluminación ambiental.', version: '1.9.0', min_blockbench: '4.9.0', icon: 'wb_twilight', group: 'essential', recommended: true, dependencies: ['light_manager']},
        {id: 'lightflow_atmosphere', file: 'lightflow_atmosphere.js', title: 'Lightflow Atmosphere', description: 'Local fog, light shafts, dust, and procedural volumes.', description_es: 'Niebla local, haces de luz, polvo y volúmenes procedurales.', version: '2.0.0', min_blockbench: '4.9.0', icon: 'blur_on', group: 'essential', recommended: true, dependencies: ['light_manager']},
        {id: 'studio_render', file: 'studio_render.js', title: 'Studio Render', description: 'High-resolution scene composition and supersampled image export.', description_es: 'Composición y exportación de imágenes con alta resolución y supersampling.', version: '1.9.10', min_blockbench: '4.9.0', icon: 'photo_camera_back', group: 'essential', recommended: true, dependencies: []},
        {id: 'lightflow_cinematic', file: 'lightflow_cinematic.js', title: 'Lightflow Cinematic', description: 'Deterministic sequences, physical cameras, and animation rendering.', description_es: 'Secuencias deterministas, cámaras físicas y render de animación.', version: '0.1.0', min_blockbench: '4.9.0', icon: 'movie_creation', group: 'creative', maturity: 'experimental', recommended: false, dependencies: ['studio_render']},
        {id: 'visual_shader_graph', file: 'visual_shader_graph.js', title: 'Visual Shader Graph', description: 'A visual shader editor connected to Shader Architect.', description_es: 'Editor visual de shaders conectado con Shader Architect.', version: '1.2.0', min_blockbench: '4.9.0', icon: 'schema', group: 'creative', maturity: 'beta', recommended: false, dependencies: ['light_manager', 'shader_architect']},
        {id: 'bedrock_structure_studio', file: 'bedrock_structure_studio.js', title: 'Bedrock Structure Studio', description: 'Open, edit, and export Bedrock .mcstructure files.', description_es: 'Abrir, editar y exportar estructuras .mcstructure de Bedrock.', version: '2.5.0', min_blockbench: '5.0.0', icon: 'view_in_ar', group: 'specialized', maturity: 'beta', recommended: false, dependencies: ['light_manager']},
        {id: 'lightflow_test_lab', file: 'lightflow_test_lab.js', title: 'Lightflow Test Lab', description: 'Renderer diagnostics and benchmarks for development.', description_es: 'Diagnósticos y benchmarks del renderer para desarrollo.', version: '2.0.0', min_blockbench: '4.9.0', icon: 'speed', group: 'developer', maturity: 'developer', recommended: false, dependencies: ['light_manager', 'shader_architect']},
        {id: 'lightflow_ui_diagnostics', file: 'lightflow_ui_diagnostics.js', title: 'Lightflow UI Diagnostics', description: 'Visual and accessibility auditing for panels and dialogs.', description_es: 'Auditoría visual y de accesibilidad de paneles y diálogos.', version: '1.1.0', min_blockbench: '4.9.0', icon: 'troubleshoot', group: 'developer', maturity: 'developer', recommended: false, dependencies: ['light_manager']}
    ]);

    const TEXT = {
        es: {
            title: 'Lightflow Hub', subtitle: 'Instala, actualiza y organiza la suite desde un solo lugar.',
            sourceLabel: 'Origen', channelLabel: 'Canal de actualización',
            github: 'GitHub', local: 'Carpeta local', stable: 'Estable', main: 'Main', experimental: 'Experimental',
            stableHelp: 'Último GitHub Release publicado', mainHelp: 'Último código de la rama main', experimentalHelp: 'Rama de pruebas configurable',
            refresh: 'Buscar actualizaciones', installRecommended: 'Instalar esenciales', updateAll: 'Actualizar todo',
            chooseFolder: 'Elegir carpeta', siblingFolder: 'Usar carpeta del Hub', chooseFiles: 'Elegir archivos .js',
            search: 'Buscar módulos', all: 'Todos', essential: 'Esenciales', creative: 'Creativos', specialized: 'Especializados', developer: 'Desarrollo',
            installed: 'Instalado', disabled: 'Desactivado', available: 'Disponible', update: 'Actualización', incompatible: 'No compatible',
            install: 'Instalar', enable: 'Activar', disable: 'Desactivar', uninstall: 'Desinstalar', replace: 'Cambiar origen', reload: 'Recargar',
            sourceGithub: 'Gestionado desde GitHub', sourceLocal: 'Instalación local', sourceOther: 'Origen externo',
            noFolder: 'Elige una carpeta que contenga los módulos .js.', missingLocal: 'No está en la carpeta local',
            dependencies: 'Requiere', noResults: 'No hay módulos que coincidan.', upToDate: 'Todo está actualizado.',
            automaticChecks: 'Comprobar automáticamente una vez al día', branch: 'Rama',
            viewGithub: 'Repositorio', reportIssue: 'Reportar problema', followX: 'Novedades en X',
            confirmInstallMany: 'Se instalarán {count} módulos y sus dependencias.',
            confirmUpdateMany: 'Se actualizarán {count} módulos. Guarda tus proyectos antes de continuar.',
            confirmUninstall: '¿Desinstalar {name}?', dependencyWarning: 'Otros módulos instalados dependen de este: {names}.',
            confirmReplace: '{name} usa otro origen. Se descargará de {source} y se reemplazará su registro en Blockbench.',
            operationDone: 'Operación completada.', operationFailed: 'No se pudo completar la operación.',
            releaseUnavailable: 'No hay un release estable con manifiesto disponible. Puedes usar Main mientras publicas el primero.',
            folderDetected: 'Carpeta local detectada.', manifestFallback: 'El manifiesto remoto no estuvo disponible; se muestra el catálogo integrado.',
            channelBadgeStable: 'Release', channelBadgeMain: 'Desarrollo', channelBadgeExperimental: 'Pruebas',
            hubUpdate: 'Hay una actualización de Lightflow Hub ({version}).', updateHub: 'Actualizar Hub',
            migrateSummary: '{count} módulos instalados usan otro origen. Puedes migrarlos juntos o elegir módulo por módulo.',
            useSource: 'Usar {source}', manifestMissingRelease: 'El release “{release}” no contiene {file}. Publica el manifiesto dentro del tag o selecciona Main.',
            manifestMissingBranch: 'No se encontró {file} en la rama “{branch}”.',
            close: 'Cerrar'
        },
        en: {
            title: 'Lightflow Hub', subtitle: 'Install, update, and organize the suite from one place.',
            sourceLabel: 'Source', channelLabel: 'Update channel',
            github: 'GitHub', local: 'Local folder', stable: 'Stable', main: 'Main', experimental: 'Experimental',
            stableHelp: 'Latest published GitHub Release', mainHelp: 'Latest code from the main branch', experimentalHelp: 'Configurable testing branch',
            refresh: 'Check for updates', installRecommended: 'Install essentials', updateAll: 'Update all',
            chooseFolder: 'Choose folder', siblingFolder: 'Use Hub folder', chooseFiles: 'Choose .js files',
            search: 'Search modules', all: 'All', essential: 'Essentials', creative: 'Creative', specialized: 'Specialized', developer: 'Developer',
            installed: 'Installed', disabled: 'Disabled', available: 'Available', update: 'Update', incompatible: 'Not compatible',
            install: 'Install', enable: 'Enable', disable: 'Disable', uninstall: 'Uninstall', replace: 'Change source', reload: 'Reload',
            sourceGithub: 'Managed from GitHub', sourceLocal: 'Local installation', sourceOther: 'External source',
            noFolder: 'Choose a folder containing the module .js files.', missingLocal: 'Missing from local folder',
            dependencies: 'Requires', noResults: 'No matching modules.', upToDate: 'Everything is up to date.',
            automaticChecks: 'Check automatically once a day', branch: 'Branch',
            viewGithub: 'Repository', reportIssue: 'Report an issue', followX: 'Updates on X',
            confirmInstallMany: '{count} modules and their dependencies will be installed.',
            confirmUpdateMany: '{count} modules will be updated. Save your projects before continuing.',
            confirmUninstall: 'Uninstall {name}?', dependencyWarning: 'Other installed modules depend on this: {names}.',
            confirmReplace: '{name} uses another source. It will be downloaded from {source} and its Blockbench registration will be replaced.',
            operationDone: 'Operation completed.', operationFailed: 'The operation could not be completed.',
            releaseUnavailable: 'No stable release with a manifest is available. You can use Main until the first one is published.',
            folderDetected: 'Local folder detected.', manifestFallback: 'The remote manifest was unavailable; the built-in catalog is shown.',
            channelBadgeStable: 'Release', channelBadgeMain: 'Development', channelBadgeExperimental: 'Testing',
            hubUpdate: 'A Lightflow Hub update is available ({version}).', updateHub: 'Update Hub', close: 'Close',
            migrateSummary: '{count} installed modules use a different source. Migrate them together or choose module by module.',
            useSource: 'Use {source}', manifestMissingRelease: 'Release “{release}” does not contain {file}. Publish the manifest in the tag or select Main.',
            manifestMissingBranch: '{file} was not found in branch “{branch}”.'
        }
    };

    let openAction = null;
    let stylesheet = null;
    let hubDialog = null;
    let manifestState = makeEmbeddedManifest();
    let currentRef = 'main';
    let manifestOrigin = 'embedded';
    let operationLock = Promise.resolve();
    let disposed = false;

    function language() {
        const value = String(globalThis.settings?.language?.value || navigator?.language || 'en').toLowerCase();
        return value.startsWith('es') ? 'es' : 'en';
    }

    function tr(key, values) {
        let value = TEXT[language()][key] || TEXT.en[key] || key;
        Object.entries(values || {}).forEach(([name, replacement]) => {
            value = value.replaceAll(`{${name}}`, String(replacement));
        });
        return value;
    }

    function makeEmbeddedManifest() {
        return {
            schema_version: 1,
            suite: 'Lightflow',
            repository: {...REPOSITORY},
            hub: {id: HUB_ID, file: 'lightflow_hub.js', version: HUB_VERSION, min_blockbench: '4.9.0'},
            modules: FALLBACK_MODULES.map(module => ({
                ...module,
                description: language() === 'es' ? module.description_es : module.description,
                dependencies: [...module.dependencies]
            }))
        };
    }

    function readJsonStorage(key, fallback) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || 'null');
            return parsed && typeof parsed === 'object' ? parsed : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function loadPreferences() {
        const stored = readJsonStorage(STORAGE_KEY, {});
        const preferences = {...DEFAULT_PREFERENCES, ...stored};
        if (!['stable', 'main', 'experimental'].includes(preferences.channel)) preferences.channel = 'stable';
        if (!['github', 'local'].includes(preferences.source)) preferences.source = 'github';
        preferences.experimentalBranch = sanitizeRef(preferences.experimentalBranch) || 'experimental';
        preferences.localDirectory = String(preferences.localDirectory || '');
        return preferences;
    }

    function savePreferences(preferences) {
        const safe = {
            channel: preferences.channel,
            experimentalBranch: sanitizeRef(preferences.experimentalBranch) || 'experimental',
            source: preferences.source,
            localDirectory: String(preferences.localDirectory || ''),
            automaticChecks: preferences.automaticChecks !== false,
            lastAutomaticCheck: Number(preferences.lastAutomaticCheck) || 0
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
        return safe;
    }

    function sanitizeRef(value) {
        const ref = String(value || '').trim();
        return /^[A-Za-z0-9._/-]{1,120}$/.test(ref) && !ref.includes('..') && !ref.startsWith('/') && !ref.endsWith('/') ? ref : '';
    }

    function sanitizeFile(value) {
        const file = String(value || '').replace(/\\/g, '/').trim();
        return /^[A-Za-z0-9._/-]+\.js$/.test(file) && !file.includes('..') && !file.startsWith('/') ? file : '';
    }

    function normalizeVersion(value) {
        const match = String(value || '0.0.0').trim().match(/^(?:v)?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/);
        if (!match) return {numbers: [0, 0, 0], prerelease: ''};
        return {numbers: [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)], prerelease: match[4] || ''};
    }

    function compareVersions(left, right) {
        const a = normalizeVersion(left);
        const b = normalizeVersion(right);
        for (let index = 0; index < 3; index++) {
            if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] > b.numbers[index] ? 1 : -1;
        }
        if (a.prerelease === b.prerelease) return 0;
        if (!a.prerelease) return 1;
        if (!b.prerelease) return -1;
        return a.prerelease.localeCompare(b.prerelease, undefined, {numeric: true});
    }

    function sanitizeModule(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const id = String(raw.id || '').trim();
        const file = sanitizeFile(raw.file);
        if (!/^[a-z][a-z0-9_]{1,63}$/.test(id) || !file) return null;
        const dependencies = Array.isArray(raw.dependencies)
            ? [...new Set(raw.dependencies.map(String).filter(value => /^[a-z][a-z0-9_]{1,63}$/.test(value) && value !== id))]
            : [];
        const descriptionEn = String(raw.description_en || raw.description || '').slice(0, 320);
        const descriptionEs = String(raw.description_es || raw.description || '').slice(0, 320);
        return {
            id, file,
            title: String(raw.title || id).slice(0, 80),
            description: language() === 'es' ? descriptionEs : descriptionEn,
            description_en: descriptionEn,
            description_es: descriptionEs,
            version: String(raw.version || '0.0.0').slice(0, 32),
            min_blockbench: String(raw.min_blockbench || '4.9.0').slice(0, 24),
            icon: String(raw.icon || 'extension').slice(0, 64),
            group: VALID_GROUPS.has(raw.group) ? raw.group : 'specialized',
            recommended: raw.recommended === true,
            maturity: ['stable', 'beta', 'experimental', 'developer'].includes(raw.maturity) ? raw.maturity : 'stable',
            dependencies
        };
    }

    function sanitizeManifest(raw) {
        if (!raw || Number(raw.schema_version) !== 1 || !Array.isArray(raw.modules)) throw new Error('Unsupported Lightflow manifest');
        const modules = raw.modules.map(sanitizeModule).filter(Boolean);
        if (!modules.length || new Set(modules.map(module => module.id)).size !== modules.length) throw new Error('Invalid Lightflow module catalog');
        const ids = new Set(modules.map(module => module.id));
        modules.forEach(module => { module.dependencies = module.dependencies.filter(id => ids.has(id)); });
        const rawHub = raw.hub || {};
        return {
            schema_version: 1,
            suite: String(raw.suite || 'Lightflow').slice(0, 64),
            repository: {...REPOSITORY},
            hub: {
                id: HUB_ID,
                file: sanitizeFile(rawHub.file) || 'lightflow_hub.js',
                version: String(rawHub.version || HUB_VERSION).slice(0, 32),
                min_blockbench: String(rawHub.min_blockbench || '4.9.0').slice(0, 24)
            },
            modules
        };
    }

    async function fetchJson(url, timeout = 12000) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
        try {
            const response = await fetch(url, {cache: 'no-store', signal: controller?.signal, headers: {Accept: 'application/vnd.github+json, application/json'}});
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    async function fetchText(url, timeout = 16000) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
        try {
            const response = await fetch(url, {cache: 'no-store', signal: controller?.signal});
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.text();
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    async function probeRemotePlugin(url, moduleId) {
        const source = await fetchText(url);
        if (source.length < 80 || !/(?:root\.)?Plugin\.register\s*\(/.test(source) || !source.includes(moduleId)) {
            throw new Error(`Invalid plugin source: ${moduleId}`);
        }
        return source;
    }

    function rawUrl(ref, file) {
        const safeRef = sanitizeRef(ref);
        const safeFile = sanitizeFile(file);
        if (!safeRef || !safeFile) throw new Error('Invalid Lightflow source reference');
        return `https://raw.githubusercontent.com/${REPOSITORY.owner}/${REPOSITORY.name}/${safeRef.split('/').map(encodeURIComponent).join('/')}/${safeFile.split('/').map(encodeURIComponent).join('/')}`;
    }

    function stableReleaseCandidates(releases) {
        if (!Array.isArray(releases)) return [];
        return releases.filter(release => release && !release.draft && !release.prerelease && sanitizeRef(release.tag_name));
    }

    async function fetchStableManifest() {
        const releases = stableReleaseCandidates(await fetchJson(`https://api.github.com/repos/${REPOSITORY.owner}/${REPOSITORY.name}/releases?per_page=30`));
        for (const release of releases) {
            const tag = sanitizeRef(release.tag_name);
            const ref = `refs/tags/${tag}`;
            try {
                const manifest = sanitizeManifest(await fetchJson(rawUrl(ref, MANIFEST_FILE)));
                return {
                    manifest,
                    ref,
                    label: String(release.name || release.tag_name || 'Stable'),
                    origin: 'github'
                };
            } catch (_) {
                // Stable releases that predate Lightflow Hub (or are unrelated)
                // are intentionally skipped instead of making the channel unusable.
            }
        }
        throw new Error(tr('releaseUnavailable'));
    }

    async function fetchGitHubManifest(channel, experimentalBranch) {
        if (channel === 'stable') return fetchStableManifest();

        let ref = 'refs/heads/main';
        let label = 'main';
        if (channel === 'experimental') {
            const branch = sanitizeRef(experimentalBranch) || 'experimental';
            ref = `refs/heads/${branch}`;
            label = branch;
        }
        let manifest;
        try {
            manifest = sanitizeManifest(await fetchJson(rawUrl(ref, MANIFEST_FILE)));
        } catch (error) {
            throw new Error(tr('manifestMissingBranch', {branch: label, file: MANIFEST_FILE}));
        }
        return {manifest, ref, label, origin: 'github'};
    }

    function desktopModules() {
        if (typeof require !== 'function') return null;
        try { return {fs: require('fs'), path: require('path')}; } catch (_) { return null; }
    }

    function inferSiblingDirectory() {
        const modules = desktopModules();
        const plugin = getPlugin(HUB_ID);
        if (!modules || !plugin?.path || /^https:/i.test(plugin.path)) return '';
        try { return modules.path.dirname(plugin.path); } catch (_) { return ''; }
    }

    function extractPluginVersion(source, module) {
        const patterns = [
            /const\s+(?:PLUGIN_VERSION|VERSION|LAB_VERSION)\s*=\s*['"]([^'"]+)['"]/,
            /(?:root\.)?Plugin\.register\([\s\S]{0,900}?version\s*:\s*['"]([^'"]+)['"]/,
            /version\s*:\s*['"]([^'"]+)['"]/
        ];
        for (const pattern of patterns) {
            const match = String(source || '').match(pattern);
            if (match) return match[1];
        }
        return module.version;
    }

    function readLocalManifest(directory) {
        const modules = desktopModules();
        if (!modules || !directory) throw new Error(tr('noFolder'));
        const manifestPath = modules.path.join(directory, MANIFEST_FILE);
        let manifest = makeEmbeddedManifest();
        if (modules.fs.existsSync(manifestPath)) manifest = sanitizeManifest(JSON.parse(modules.fs.readFileSync(manifestPath, 'utf8')));
        manifest.modules = manifest.modules.map(module => {
            const filePath = modules.path.join(directory, ...module.file.split('/'));
            const exists = modules.fs.existsSync(filePath) && modules.fs.statSync(filePath).isFile();
            let version = module.version;
            if (exists) version = extractPluginVersion(modules.fs.readFileSync(filePath, 'utf8'), module);
            return {...module, localPath: filePath, localExists: exists, version};
        });
        const hubPath = modules.path.join(directory, manifest.hub.file);
        manifest.hub.localPath = hubPath;
        manifest.hub.localExists = modules.fs.existsSync(hubPath);
        return {manifest, ref: directory, label: modules.path.basename(directory), origin: 'local'};
    }

    function getPlugin(id) {
        return globalThis.Plugins?.all?.find(plugin => plugin?.id === id && plugin.installed)
            || globalThis.Plugins?.registered?.[id]
            || null;
    }

    function getInstallation(id) {
        return globalThis.Plugins?.installed?.find(entry => entry?.id === id) || null;
    }

    function isManagedGitHubPath(path) {
        return typeof path === 'string' && path.startsWith(`https://raw.githubusercontent.com/${REPOSITORY.owner}/${REPOSITORY.name}/`);
    }

    function isCompatible(module) {
        if (!globalThis.Blockbench?.version || typeof Blockbench.isOlderThan !== 'function') return true;
        return !Blockbench.isOlderThan(module.min_blockbench || '4.9.0');
    }

    function sourceKind(plugin, installation) {
        const source = plugin?.source || installation?.source || '';
        const path = plugin?.path || installation?.path || '';
        if (source === 'file') return 'local';
        if (source === 'url' && isManagedGitHubPath(path)) return 'github';
        return source ? 'other' : 'none';
    }

    function moduleView(module, preferences) {
        const plugin = getPlugin(module.id);
        const installation = getInstallation(module.id);
        const installed = !!(plugin?.installed || installation);
        const installedVersion = String(plugin?.version || installation?.version || '');
        const disabled = !!(plugin?.disabled || installation?.disabled);
        const source = sourceKind(plugin, installation);
        const installedPath = String(plugin?.path || installation?.path || '');
        const compatible = isCompatible(module);
        const updateAvailable = installed && compatible && compareVersions(module.version, installedVersion) > 0;
        const expectedSource = preferences.source;
        let sourceMismatch = installed && source !== expectedSource;
        if (installed && !sourceMismatch && expectedSource === 'github') {
            try { sourceMismatch = installedPath !== rawUrl(currentRef, module.file); } catch (_) { sourceMismatch = true; }
        } else if (installed && !sourceMismatch && expectedSource === 'local' && module.localPath) {
            sourceMismatch = installedPath.replace(/\\/g, '/').toLowerCase() !== String(module.localPath).replace(/\\/g, '/').toLowerCase();
        }
        return {...module, plugin, installation, installed, installedVersion, disabled, source, compatible, updateAvailable, sourceMismatch};
    }

    function dependencyOrder(modules, requestedIds) {
        const byId = new Map(modules.map(module => [module.id, module]));
        const result = [];
        const visiting = new Set();
        const visited = new Set();
        function visit(id) {
            if (visited.has(id)) return;
            if (visiting.has(id)) throw new Error(`Circular dependency: ${id}`);
            const module = byId.get(id);
            if (!module) throw new Error(`Missing dependency: ${id}`);
            visiting.add(id);
            module.dependencies.forEach(visit);
            visiting.delete(id);
            visited.add(id);
            result.push(module);
        }
        requestedIds.forEach(visit);
        return result;
    }

    function confirmBox(message, confirmLabel) {
        return new Promise(resolve => {
            Blockbench.showMessageBox({
                title: tr('title'), message, icon: 'extension',
                buttons: [confirmLabel || 'dialog.continue', 'dialog.cancel'], confirm: 0, cancel: 1
            }, result => resolve(result === 0));
        });
    }

    function resetPluginMetadata(plugin) {
        ['tags', 'contributors', 'dependencies'].forEach(key => {
            if (Array.isArray(plugin?.[key])) plugin[key].length = 0;
        });
        if (plugin) {
            plugin.details = null;
            plugin.about_fetched = false;
            plugin.changelog_fetched = false;
        }
    }

    async function replaceWithUrl(module, url, options = {}) {
        await probeRemotePlugin(url, module.id);
        let plugin = getPlugin(module.id);
        const wasDisabled = !!plugin?.disabled;
        if (plugin && sourceKind(plugin, getInstallation(module.id)) !== 'github' && !options.sourceApproved) {
            const approved = await confirmBox(tr('confirmReplace', {name: module.title, source: 'GitHub'}), tr('replace'));
            if (!approved) return false;
        }
        if (plugin) {
            if (!plugin.disabled) plugin.unload?.();
            if (plugin.source === 'file' || plugin.source === 'store') {
                plugin.uninstall?.();
                plugin = null;
            }
        }
        if (!plugin) plugin = new Plugin(module.id, {disabled: wasDisabled});
        resetPluginMetadata(plugin);
        plugin.disabled = wasDisabled;
        await plugin.loadFromURL(url, false);
        return true;
    }

    async function replaceWithFile(module, filePath, options = {}) {
        const desktop = desktopModules();
        if (!desktop || !desktop.fs.existsSync(filePath)) throw new Error(`${tr('missingLocal')}: ${module.file}`);
        let plugin = getPlugin(module.id);
        const wasDisabled = !!plugin?.disabled;
        if (plugin && sourceKind(plugin, getInstallation(module.id)) !== 'local' && !options.sourceApproved) {
            const approved = await confirmBox(tr('confirmReplace', {name: module.title, source: tr('local')}), tr('replace'));
            if (!approved) return false;
        }
        if (plugin) {
            if (!plugin.disabled) plugin.unload?.();
            if (plugin.source !== 'file') {
                plugin.uninstall?.();
                plugin = null;
            }
        }
        if (!plugin) plugin = new Plugin(module.id, {disabled: wasDisabled});
        resetPluginMetadata(plugin);
        plugin.disabled = wasDisabled;
        await plugin.loadFromFile({path: filePath, name: module.file.split('/').pop(), content: ''}, false);
        return true;
    }

    function moduleSource(module, preferences) {
        if (preferences.source === 'local') {
            if (!module.localPath || !module.localExists) throw new Error(`${tr('missingLocal')}: ${module.file}`);
            return {kind: 'local', value: module.localPath};
        }
        return {kind: 'github', value: rawUrl(currentRef, module.file)};
    }

    async function installModules(requestedIds, preferences, options = {}) {
        const ordered = dependencyOrder(manifestState.modules, requestedIds);
        for (const module of ordered) {
            if (!isCompatible(module)) throw new Error(`${module.title}: ${tr('incompatible')} (Blockbench ${module.min_blockbench}+)`);
            const view = moduleView(module, preferences);
            const source = moduleSource(module, preferences);
            const sameSource = view.source === source.kind;
            const needsWrite = !view.installed || view.updateAvailable || !sameSource || options.force;
            if (!needsWrite) continue;
            if (source.kind === 'local') await replaceWithFile(module, source.value, options);
            else await replaceWithUrl(module, source.value, options);
        }
    }

    function queueOperation(work) {
        const next = operationLock.then(work, work);
        operationLock = next.catch(() => {});
        return next;
    }

    function openUrl(url) {
        if (globalThis.Blockbench?.openLink) Blockbench.openLink(url);
        else if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    }

    function installedDependents(id) {
        return manifestState.modules.filter(module => module.dependencies.includes(id) && !!getInstallation(module.id));
    }

    function statusText(view) {
        if (!view.compatible) return tr('incompatible');
        if (!view.installed) return tr('available');
        if (view.disabled) return tr('disabled');
        if (view.updateAvailable) return tr('update');
        return tr('installed');
    }

    function statusClass(view) {
        if (!view.compatible) return 'incompatible';
        if (!view.installed) return 'available';
        if (view.updateAvailable) return 'update';
        if (view.disabled) return 'disabled';
        return 'installed';
    }

    function sourceText(view) {
        if (view.source === 'github') return tr('sourceGithub');
        if (view.source === 'local') return tr('sourceLocal');
        return tr('sourceOther');
    }

    async function loadManifestForPreferences(preferences, allowFallback = true) {
        if (preferences.source === 'local') {
            const directory = preferences.localDirectory || inferSiblingDirectory();
            if (!directory) throw new Error(tr('noFolder'));
            preferences.localDirectory = directory;
            savePreferences(preferences);
            return readLocalManifest(directory);
        }
        try {
            const result = await fetchGitHubManifest(preferences.channel, preferences.experimentalBranch);
            localStorage.setItem(CACHE_KEY, JSON.stringify({time: Date.now(), channel: preferences.channel, branch: preferences.experimentalBranch, result}));
            return result;
        } catch (error) {
            const cached = readJsonStorage(CACHE_KEY, null);
            if (cached?.result?.manifest && cached.channel === preferences.channel && cached.branch === preferences.experimentalBranch) {
                return {...cached.result, manifest: sanitizeManifest(cached.result.manifest), warning: tr('manifestFallback')};
            }
            if (!allowFallback || preferences.channel === 'stable') throw error;
            return {manifest: makeEmbeddedManifest(), ref: `refs/heads/${preferences.channel === 'experimental' ? preferences.experimentalBranch : 'main'}`, label: preferences.channel, origin: 'embedded', warning: tr('manifestFallback')};
        }
    }

    function applyManifestResult(result) {
        manifestState = result.manifest;
        currentRef = result.ref;
        manifestOrigin = result.origin;
        return result;
    }

    function notifyError(error) {
        console.error('[Lightflow Hub]', error);
        Blockbench.showMessageBox({title: tr('title'), message: error?.message || String(error), icon: 'error'});
    }

    function createComponent() {
        return {
            data() {
                const preferences = loadPreferences();
                return {
                    preferences,
                    revision: 0,
                    busy: false,
                    error: '',
                    notice: '',
                    search: '',
                    group: 'all',
                    releaseLabel: '',
                    manifestOrigin,
                    hubRemoteVersion: manifestState.hub.version,
                    sourceReady: false
                };
            },
            computed: {
                modules() {
                    void this.revision;
                    const query = this.search.trim().toLowerCase();
                    return manifestState.modules
                        .map(module => moduleView(module, this.preferences))
                        .filter(module => this.group === 'all' || module.group === this.group)
                        .filter(module => !query || `${module.title} ${module.description} ${module.id}`.toLowerCase().includes(query));
                },
                updates() { return this.modulesAll.filter(module => module.updateAvailable || module.sourceMismatch); },
                modulesAll() { void this.revision; return manifestState.modules.map(module => moduleView(module, this.preferences)); },
                sourceMismatchCount() { return this.modulesAll.filter(module => module.sourceMismatch).length; },
                recommendedMissing() { return this.modulesAll.filter(module => module.recommended && !module.installed && module.compatible); },
                localMode() { return this.preferences.source === 'local'; },
                channelHelp() { return tr(`${this.preferences.channel}Help`); },
                channelBadge() { return tr(`channelBadge${this.preferences.channel[0].toUpperCase()}${this.preferences.channel.slice(1)}`); },
                hubUpdateAvailable() { return compareVersions(this.hubRemoteVersion, HUB_VERSION) > 0; }
            },
            methods: {
                t: tr,
                statusText,
                statusClass,
                sourceText,
                targetSourceText() { return this.preferences.source === 'local' ? tr('local') : tr('github'); },
                targetSourceButton() { return tr('useSource', {source: this.targetSourceText()}); },
                bump() { this.revision++; },
                async run(work) {
                    if (this.busy) return;
                    this.busy = true; this.error = ''; this.notice = '';
                    try { await queueOperation(work); if (!this.notice) this.notice = tr('operationDone'); }
                    catch (error) { this.error = error?.message || String(error); console.error('[Lightflow Hub]', error); }
                    finally { this.busy = false; this.bump(); }
                },
                async refresh() {
                    this.sourceReady = false;
                    await this.run(async () => {
                        const result = applyManifestResult(await loadManifestForPreferences(this.preferences, true));
                        this.releaseLabel = result.label;
                        this.manifestOrigin = result.origin;
                        this.hubRemoteVersion = result.manifest.hub.version;
                        this.sourceReady = true;
                        this.notice = result.warning || tr('upToDate');
                    });
                },
                async changeSource() { savePreferences(this.preferences); await this.refresh(); },
                async changeChannel() { savePreferences(this.preferences); await this.refresh(); },
                branchChanged() {
                    this.preferences.experimentalBranch = sanitizeRef(this.preferences.experimentalBranch) || 'experimental';
                    savePreferences(this.preferences);
                },
                automaticChanged() { savePreferences(this.preferences); },
                chooseFolder() {
                    if (typeof Blockbench.pickDirectory !== 'function') { this.error = tr('noFolder'); return; }
                    const directory = Blockbench.pickDirectory({title: tr('chooseFolder'), resource_id: 'lightflow_modules'});
                    if (!directory) return;
                    this.preferences.localDirectory = directory;
                    savePreferences(this.preferences);
                    this.refresh();
                },
                useSiblingFolder() {
                    const directory = inferSiblingDirectory();
                    if (!directory) { this.error = tr('noFolder'); return; }
                    this.preferences.localDirectory = directory;
                    savePreferences(this.preferences);
                    this.notice = tr('folderDetected');
                    this.refresh();
                },
                chooseFiles() {
                    Blockbench.import({extensions: ['js'], multiple: true, type: 'JavaScript', resource_id: 'lightflow_modules'}, async files => {
                        if (!files?.length) return;
                        await this.run(async () => {
                            for (const file of files) {
                                const module = manifestState.modules.find(item => item.file.split('/').pop() === file.name || item.id === String(file.name).replace(/\.js$/i, ''));
                                if (!module) continue;
                                if (typeof require === 'function' && file.path) await replaceWithFile(module, file.path);
                                else await new Plugin().loadFromFile(file, true);
                            }
                        });
                    });
                },
                async install(module) {
                    if (!this.sourceReady) return;
                    await this.run(() => installModules([module.id], this.preferences));
                },
                async forceReplace(module) {
                    if (!this.sourceReady) return;
                    await this.run(() => installModules([module.id], this.preferences, {force: true}));
                },
                async installRecommended() {
                    if (!this.sourceReady) return;
                    const ids = this.modulesAll.filter(module => module.recommended && module.compatible && (!module.installed || module.sourceMismatch)).map(module => module.id);
                    if (!ids.length) { this.notice = tr('upToDate'); return; }
                    if (!await confirmBox(tr('confirmInstallMany', {count: ids.length}), tr('installRecommended'))) return;
                    await this.run(() => installModules(ids, this.preferences, {sourceApproved: true}));
                },
                async updateAll() {
                    if (!this.sourceReady) return;
                    const ids = this.modulesAll.filter(module => module.installed && module.compatible && (module.updateAvailable || module.sourceMismatch)).map(module => module.id);
                    if (!ids.length) { this.notice = tr('upToDate'); return; }
                    if (!await confirmBox(tr('confirmUpdateMany', {count: ids.length}), tr('updateAll'))) return;
                    await this.run(() => installModules(ids, this.preferences, {force: true, sourceApproved: true}));
                },
                async toggle(module) {
                    if (!module.disabled) {
                        const dependents = installedDependents(module.id).filter(item => !getPlugin(item.id)?.disabled);
                        if (dependents.length && !await confirmBox(tr('dependencyWarning', {names: dependents.map(item => item.title).join(', ')}), tr('disable'))) return;
                    }
                    await this.run(async () => {
                        const plugin = getPlugin(module.id);
                        if (!plugin?.toggleDisabled) throw new Error(`${module.title}: plugin record unavailable`);
                        plugin.toggleDisabled();
                    });
                },
                async remove(module) {
                    const dependents = installedDependents(module.id);
                    let message = tr('confirmUninstall', {name: module.title});
                    if (dependents.length) message += `\n\n${tr('dependencyWarning', {names: dependents.map(item => item.title).join(', ')})}`;
                    if (!await confirmBox(message, tr('uninstall'))) return;
                    await this.run(async () => {
                        const plugin = getPlugin(module.id);
                        if (!plugin?.uninstall) throw new Error(`${module.title}: plugin record unavailable`);
                        plugin.uninstall();
                    });
                },
                async reload(module) {
                    await this.run(async () => {
                        const source = moduleSource(module, this.preferences);
                        if (source.kind === 'local') await replaceWithFile(module, source.value, {sourceApproved: true});
                        else await replaceWithUrl(module, source.value, {sourceApproved: true});
                    });
                },
                async updateHub() {
                    await this.run(async () => {
                        const module = {id: HUB_ID, file: manifestState.hub.file, title: tr('title')};
                        const url = rawUrl(currentRef, manifestState.hub.file);
                        setTimeout(() => replaceWithUrl(module, url, {sourceApproved: true}).catch(notifyError), 50);
                        hubDialog?.hide?.();
                    });
                },
                openUrl
            },
            mounted() {
                this.$nextTick(() => this.refresh());
            },
            template: `
                <div class="lfhub-root">
                    <header class="lfhub-header">
                        <div class="lfhub-brand"><span class="lfhub-mark"><i class="material-icons">flare</i></span><div class="lfhub-brand-copy"><div class="lfhub-title">{{ t('title') }}</div><p>{{ t('subtitle') }}</p></div></div>
                        <div class="lfhub-links">
                            <button @click="openUrl('${REPOSITORY.github}')" :title="t('viewGithub')"><i class="material-icons">code</i><span>GitHub</span></button>
                            <button @click="openUrl('${REPOSITORY.x}')" :title="t('followX')"><i class="material-icons">campaign</i><span>X</span></button>
                            <button @click="openUrl('${REPOSITORY.issues}')" :title="t('reportIssue')"><i class="material-icons">bug_report</i><span>{{ t('reportIssue') }}</span></button>
                        </div>
                    </header>

                    <section class="lfhub-sourcebar">
                        <div class="lfhub-control-group">
                            <span class="lfhub-control-label">{{ t('sourceLabel') }}</span>
                            <div class="lfhub-segment" role="group">
                                <button :class="{active: preferences.source === 'github'}" @click="preferences.source='github'; changeSource()"><i class="material-icons">cloud_download</i>{{ t('github') }}</button>
                                <button :class="{active: preferences.source === 'local'}" @click="preferences.source='local'; changeSource()"><i class="material-icons">folder</i>{{ t('local') }}</button>
                            </div>
                        </div>
                        <div v-if="!localMode" class="lfhub-control-group lfhub-channel-group">
                            <span class="lfhub-control-label">{{ t('channelLabel') }}</span>
                            <div class="lfhub-segment lfhub-channels" role="group">
                                <button v-for="channel in ['stable','main','experimental']" :key="channel" :class="{active: preferences.channel === channel}" @click="preferences.channel=channel; changeChannel()">{{ t(channel) }}</button>
                            </div>
                        </div>
                        <label v-if="!localMode && preferences.channel === 'experimental'" class="lfhub-branch"><span>{{ t('branch') }}</span><input v-model="preferences.experimentalBranch" @change="branchChanged(); refresh()"></label>
                        <div v-if="localMode" class="lfhub-local-path"><span :title="preferences.localDirectory">{{ preferences.localDirectory || t('noFolder') }}</span><button @click="chooseFolder"><i class="material-icons">folder_open</i>{{ t('chooseFolder') }}</button><button @click="useSiblingFolder" :title="t('siblingFolder')"><i class="material-icons">my_location</i></button><button @click="chooseFiles" :title="t('chooseFiles')"><i class="material-icons">note_add</i></button></div>
                        <button class="lfhub-refresh" @click="refresh" :disabled="busy" :title="t('refresh')"><i class="material-icons" :class="{spin:busy}">sync</i></button>
                    </section>

                    <div class="lfhub-context">
                        <span class="lfhub-channel-badge">{{ localMode ? t('local') : channelBadge }}</span>
                        <span>{{ releaseLabel || channelHelp }}</span>
                        <label class="lfhub-auto"><input type="checkbox" v-model="preferences.automaticChecks" @change="automaticChanged">{{ t('automaticChecks') }}</label>
                    </div>
                    <div v-if="hubUpdateAvailable" class="lfhub-banner update"><i class="material-icons">system_update</i><span>{{ t('hubUpdate', {version: hubRemoteVersion}) }}</span><button @click="updateHub">{{ t('updateHub') }}</button></div>
                    <div v-if="error" class="lfhub-banner error"><i class="material-icons">error_outline</i><span>{{ error }}</span><button @click="error=''">×</button></div>
                    <div v-else-if="notice" class="lfhub-banner notice"><i class="material-icons">info_outline</i><span>{{ notice }}</span><button @click="notice=''">×</button></div>
                    <div v-if="sourceMismatchCount && sourceReady" class="lfhub-banner migration"><i class="material-icons">swap_horiz</i><span>{{ t('migrateSummary', {count: sourceMismatchCount}) }}</span><button @click="updateAll" :disabled="busy">{{ targetSourceButton() }}</button></div>

                    <section class="lfhub-toolbar">
                        <div class="lfhub-toolbar-main">
                            <label class="lfhub-search"><i class="material-icons">search</i><input v-model="search" :placeholder="t('search')"></label>
                            <div class="lfhub-bulk">
                                <button @click="installRecommended" :disabled="busy || !sourceReady"><i class="material-icons">playlist_add_check</i>{{ t('installRecommended') }}</button>
                                <button class="accent" @click="updateAll" :disabled="busy || !sourceReady || !updates.length"><i class="material-icons">system_update_alt</i>{{ t('updateAll') }}<span v-if="updates.length" class="count">{{ updates.length }}</span></button>
                            </div>
                        </div>
                        <nav class="lfhub-filters">
                            <button v-for="item in ['all','essential','creative','specialized','developer']" :key="item" :class="{active:group===item}" @click="group=item">{{ t(item) }}</button>
                        </nav>
                    </section>

                    <main class="lfhub-list" :aria-busy="busy">
                        <article class="lfhub-module" v-for="module in modules" :key="module.id" :class="{dimmed:!module.compatible}">
                            <div class="lfhub-icon"><i class="material-icons">{{ module.icon }}</i></div>
                            <div class="lfhub-copy">
                            <div class="lfhub-module-title"><strong>{{ module.title }}</strong><span v-if="module.maturity && module.maturity !== 'stable'" class="lfhub-maturity">{{ module.maturity }}</span></div>
                                <p>{{ module.description }}</p>
                                <div class="lfhub-meta">
                                    <span :class="['lfhub-status', statusClass(module)]">{{ statusText(module) }}</span>
                                    <span v-if="module.installed">v{{ module.installedVersion }}</span><i v-if="module.updateAvailable" class="material-icons arrow">arrow_forward</i><span v-if="module.updateAvailable">v{{ module.version }}</span>
                                    <span v-if="module.installed" class="lfhub-source">{{ sourceText(module) }}</span>
                                    <span v-if="localMode && !module.localExists" class="lfhub-missing"><i class="material-icons">insert_drive_file</i>{{ t('missingLocal') }}</span>
                                    <span v-if="module.dependencies.length" class="lfhub-deps">{{ t('dependencies') }}: {{ module.dependencies.join(', ') }}</span>
                                    <span v-if="!module.compatible">Blockbench {{ module.min_blockbench }}+</span>
                                </div>
                            </div>
                            <div class="lfhub-actions">
                                <button v-if="!module.installed" class="primary" @click="install(module)" :disabled="busy || !sourceReady || !module.compatible || (localMode && !module.localExists)"><i class="material-icons">download</i>{{ t('install') }}</button>
                                <button v-else-if="module.sourceMismatch" class="source-change" @click="forceReplace(module)" :disabled="busy || !sourceReady"><i class="material-icons">swap_horiz</i>{{ targetSourceButton() }}</button>
                                <button v-else-if="module.updateAvailable" class="primary" @click="install(module)" :disabled="busy || !sourceReady"><i class="material-icons">system_update_alt</i>{{ t('update') }}</button>
                                <button v-else @click="reload(module)" :disabled="busy || !sourceReady || (localMode && !module.localExists)" :title="t('reload')"><i class="material-icons">refresh</i></button>
                                <button v-if="module.installed" @click="toggle(module)" :disabled="busy" :title="module.disabled ? t('enable') : t('disable')"><i class="material-icons">{{ module.disabled ? 'toggle_off' : 'toggle_on' }}</i></button>
                                <button v-if="module.installed" class="danger" @click="remove(module)" :disabled="busy" :title="t('uninstall')"><i class="material-icons">delete_outline</i></button>
                            </div>
                        </article>
                        <div v-if="!modules.length" class="lfhub-empty"><i class="material-icons">search_off</i><span>{{ t('noResults') }}</span></div>
                    </main>
                    <footer class="lfhub-footer"><span>Lightflow Hub v${HUB_VERSION}</span><span>{{ manifestOrigin === 'local' ? t('sourceLocal') : t('sourceGithub') }}</span></footer>
                </div>
            `
        };
    }

    function openHub() {
        hubDialog?.hide?.();
        hubDialog = new Dialog({
            id: 'lightflow_hub_dialog',
            title: tr('title'),
            width: 940,
            buttons: [],
            component: createComponent(),
            onConfirm() { hubDialog = null; },
            onCancel() { hubDialog = null; }
        });
        hubDialog.show();
    }

    function addStyles() {
        stylesheet = Blockbench.addCSS(`
            #lightflow_hub_dialog .dialog_content { padding:0; overflow:hidden; }
            #lightflow_hub_dialog .dialog_wrapper { width:min(940px, calc(100vw - 28px)); max-width:calc(100vw - 28px); }
            #lightflow_hub_dialog .dialog_bar.button_bar:empty { display:none; }
            .lfhub-root, .lfhub-root * { box-sizing:border-box; }
            .lfhub-root { height:min(760px, calc(100vh - 104px)); min-height:520px; display:flex; flex-direction:column; overflow:hidden; color:var(--color-text); background:var(--color-ui); font-size:13px; }
            .lfhub-header { min-height:72px; display:flex; align-items:center; justify-content:space-between; gap:20px; padding:14px 16px 15px; border-bottom:1px solid var(--color-border); background:var(--color-back); }
            .lfhub-brand { display:flex; align-items:center; gap:12px; min-width:0; }
            .lfhub-brand-copy { min-width:0; }
            .lfhub-mark { width:40px; height:40px; flex:0 0 40px; display:grid; place-items:center; color:white; background:var(--color-accent); border-radius:5px; }
            .lfhub-mark i { font-size:23px; }
            .lfhub-title { margin:0; font-size:19px; line-height:24px; font-weight:600; letter-spacing:-.2px; }
            .lfhub-brand p { max-width:58ch; margin:2px 0 0; color:color-mix(in srgb, var(--color-text) 68%, var(--color-ui)); line-height:18px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .lfhub-links, .lfhub-segment, .lfhub-actions, .lfhub-bulk, .lfhub-filters { display:flex; align-items:center; gap:6px; }
            .lfhub-links button, .lfhub-sourcebar button, .lfhub-toolbar button, .lfhub-actions button, .lfhub-banner button { min-height:34px; border:1px solid var(--color-border); border-radius:4px; background:var(--color-button); color:var(--color-text); cursor:pointer; transition:background-color 120ms ease, border-color 120ms ease, color 120ms ease, transform 80ms ease; }
            .lfhub-links button { padding:0 10px; display:flex; align-items:center; justify-content:center; gap:6px; color:color-mix(in srgb, var(--color-text) 82%, var(--color-ui)); }
            .lfhub-links button:hover, .lfhub-sourcebar button:hover, .lfhub-toolbar button:hover, .lfhub-actions button:hover { background:var(--color-selected); border-color:color-mix(in srgb, var(--color-text) 28%, var(--color-border)); }
            .lfhub-root button:active:not(:disabled) { transform:translateY(1px); }
            .lfhub-root button:focus-visible, .lfhub-root input:focus-visible { outline:2px solid var(--color-accent); outline-offset:2px; }
            .lfhub-sourcebar { min-height:66px; display:grid; grid-template-columns:auto minmax(290px, 1fr) auto auto; align-items:end; gap:16px; padding:9px 14px 10px; border-bottom:1px solid var(--color-border); }
            .lfhub-control-group { min-width:0; display:flex; flex-direction:column; align-items:flex-start; gap:5px; }
            .lfhub-control-label { color:color-mix(in srgb, var(--color-text) 62%, var(--color-ui)); font-size:11px; line-height:13px; font-weight:500; letter-spacing:.3px; }
            .lfhub-channel-group { justify-self:start; }
            .lfhub-segment { gap:0; }
            .lfhub-segment button { min-width:102px; border-radius:0; margin-left:-1px; padding:6px 12px; display:flex; justify-content:center; align-items:center; gap:7px; }
            .lfhub-channels button { min-width:98px; }
            .lfhub-segment button:first-child { margin-left:0; border-radius:4px 0 0 4px; }
            .lfhub-segment button:last-child { border-radius:0 4px 4px 0; }
            .lfhub-segment button.active, .lfhub-filters button.active { color:white; background:var(--color-accent); border-color:var(--color-accent); }
            .lfhub-branch { align-self:end; display:flex; flex-direction:column; align-items:flex-start; gap:5px; min-width:160px; }
            .lfhub-branch span { color:color-mix(in srgb, var(--color-text) 62%, var(--color-ui)); font-size:11px; }
            .lfhub-branch input, .lfhub-search input { min-width:0; height:34px; border:1px solid var(--color-border); background:var(--color-back); color:var(--color-text); border-radius:4px; padding:0 10px; }
            .lfhub-local-path { min-width:0; align-self:end; display:flex; align-items:center; gap:6px; }
            .lfhub-local-path > span { min-width:80px; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:color-mix(in srgb, var(--color-text) 68%, var(--color-ui)); }
            .lfhub-local-path button { padding:5px 10px; display:flex; align-items:center; gap:6px; white-space:nowrap; }
            .lfhub-local-path button:not(:first-of-type) { width:34px; justify-content:center; padding:0; }
            .lfhub-refresh { width:36px; align-self:end; display:grid; place-items:center; padding:0; }
            .lfhub-context { min-height:34px; display:flex; align-items:center; gap:9px; padding:6px 14px; border-bottom:1px solid var(--color-border); color:color-mix(in srgb, var(--color-text) 68%, var(--color-ui)); font-size:12px; }
            .lfhub-channel-badge { padding:2px 7px; border:1px solid var(--color-border); border-radius:3px; color:var(--color-text); background:var(--color-back); font-weight:500; }
            .lfhub-auto { margin-left:auto; display:flex; align-items:center; gap:7px; white-space:nowrap; }
            .lfhub-banner { margin:8px 14px 0; min-height:40px; display:flex; align-items:center; gap:9px; padding:7px 9px; border:1px solid var(--color-border); border-left-width:3px; border-radius:4px; background:var(--color-back); line-height:17px; }
            .lfhub-banner > i { flex:0 0 auto; }
            .lfhub-banner span { min-width:0; flex:1; }
            .lfhub-banner.error { border-left-color:var(--color-error); }
            .lfhub-banner.update, .lfhub-banner.migration { border-left-color:var(--color-accent); }
            .lfhub-banner.notice { border-left-color:color-mix(in srgb, var(--color-text) 45%, var(--color-border)); }
            .lfhub-banner button { flex:0 0 auto; min-height:30px; padding:4px 10px; }
            .lfhub-toolbar { display:flex; flex-direction:column; align-items:stretch; gap:8px; padding:10px 14px 11px; border-bottom:1px solid var(--color-border); }
            .lfhub-toolbar-main { display:flex; align-items:center; gap:10px; min-width:0; }
            .lfhub-search { min-width:210px; max-width:360px; flex:1; position:relative; display:flex; align-items:center; }
            .lfhub-search i { position:absolute; left:9px; color:color-mix(in srgb, var(--color-text) 58%, var(--color-ui)); pointer-events:none; }
            .lfhub-search input { width:100%; padding-left:34px; }
            .lfhub-filters { min-width:0; flex-wrap:wrap; gap:5px; }
            .lfhub-filters button { min-height:30px; padding:4px 11px; white-space:nowrap; }
            .lfhub-bulk { margin-left:auto; }
            .lfhub-bulk button { display:flex; align-items:center; gap:6px; padding:5px 11px; white-space:nowrap; }
            .lfhub-bulk button.accent, .lfhub-actions button.primary { color:white; background:var(--color-accent); border-color:var(--color-accent); }
            .lfhub-bulk .count { min-width:18px; height:18px; display:grid; place-items:center; border-radius:3px; background:rgba(0,0,0,.24); color:white; font-size:11px; font-variant-numeric:tabular-nums; }
            .lfhub-list { flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; padding:0 14px; scrollbar-gutter:stable; }
            .lfhub-module { min-height:88px; display:grid; grid-template-columns:42px minmax(0,1fr) auto; align-items:center; gap:12px; padding:12px 3px; border-bottom:1px solid var(--color-border); }
            .lfhub-module.dimmed { opacity:.64; }
            .lfhub-icon { width:40px; height:40px; display:grid; place-items:center; border:1px solid var(--color-border); border-radius:5px; color:color-mix(in srgb, var(--color-text) 88%, var(--color-ui)); background:var(--color-back); }
            .lfhub-icon i { font-size:21px; }
            .lfhub-copy { min-width:0; }
            .lfhub-module-title { display:flex; align-items:center; gap:8px; min-width:0; }
            .lfhub-module-title strong { overflow:hidden; text-overflow:ellipsis; font-size:14px; line-height:18px; font-weight:600; }
            .lfhub-maturity { padding:1px 5px; border:1px solid var(--color-border); border-radius:2px; color:color-mix(in srgb, var(--color-text) 66%, var(--color-ui)); font-size:10px; line-height:15px; letter-spacing:.35px; text-transform:uppercase; }
            .lfhub-copy p { max-width:68ch; margin:4px 0 7px; color:color-mix(in srgb, var(--color-text) 72%, var(--color-ui)); line-height:18px; text-wrap:pretty; }
            .lfhub-meta { display:flex; flex-wrap:wrap; align-items:center; gap:5px 9px; color:color-mix(in srgb, var(--color-text) 64%, var(--color-ui)); font-size:12px; line-height:18px; font-variant-numeric:tabular-nums; }
            .lfhub-status { padding:1px 6px; border-radius:3px; border:1px solid var(--color-border); color:var(--color-text); line-height:17px; }
            .lfhub-status.installed { border-color:#4d9667; color:#7fd39b; }
            .lfhub-status.update { border-color:var(--color-accent); color:white; background:var(--color-accent); }
            .lfhub-status.disabled { border-color:#a17a3f; color:#d7ad6d; }
            .lfhub-status.incompatible { border-color:var(--color-error); color:#ef8d98; }
            .lfhub-meta .arrow { font-size:14px; }
            .lfhub-source, .lfhub-deps { padding-left:9px; border-left:1px solid var(--color-border); }
            .lfhub-missing { color:var(--color-error); display:flex; align-items:center; gap:4px; }
            .lfhub-missing i { font-size:14px; }
            .lfhub-actions { justify-content:flex-end; }
            .lfhub-actions button { min-width:36px; height:36px; padding:5px 9px; display:flex; justify-content:center; align-items:center; gap:6px; white-space:nowrap; }
            .lfhub-actions button.source-change { color:var(--color-text); background:transparent; border-color:color-mix(in srgb, var(--color-accent) 55%, var(--color-border)); }
            .lfhub-actions button.source-change:hover { color:white; background:var(--color-accent); border-color:var(--color-accent); }
            .lfhub-actions button.danger:hover { color:white; background:var(--color-error); border-color:var(--color-error); }
            .lfhub-empty { height:100%; min-height:180px; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:9px; color:color-mix(in srgb, var(--color-text) 62%, var(--color-ui)); }
            .lfhub-empty i { font-size:34px; }
            .lfhub-footer { min-height:30px; display:flex; justify-content:space-between; align-items:center; padding:5px 14px; border-top:1px solid var(--color-border); color:color-mix(in srgb, var(--color-text) 58%, var(--color-ui)); font-size:11px; }
            .lfhub-root button:disabled { opacity:.42; cursor:default; }
            .lfhub-root .material-icons { font-size:18px; }
            .lfhub-root .spin { animation:lfhub-spin .8s linear infinite; }
            @keyframes lfhub-spin { to { transform:rotate(360deg); } }
            @media (max-width: 760px) {
                .lfhub-root { height:calc(100vh - 78px); min-height:420px; }
                .lfhub-header { align-items:flex-start; }
                .lfhub-links button span { display:none; }
                .lfhub-links button { width:34px; padding:0; }
                .lfhub-sourcebar { grid-template-columns:1fr auto; }
                .lfhub-channel-group, .lfhub-local-path, .lfhub-branch { grid-column:1 / -1; }
                .lfhub-refresh { grid-column:2; grid-row:1; }
                .lfhub-toolbar-main { align-items:stretch; flex-direction:column; }
                .lfhub-search { width:100%; max-width:none; }
                .lfhub-bulk { width:100%; margin-left:0; }
                .lfhub-bulk button { flex:1; justify-content:center; }
                .lfhub-module { grid-template-columns:36px minmax(0,1fr); }
                .lfhub-actions { grid-column:2; justify-content:flex-start; }
                .lfhub-deps { display:none; }
            }
            @media (max-width: 520px) {
                .lfhub-brand p, .lfhub-context > span:not(.lfhub-channel-badge) { display:none; }
                .lfhub-sourcebar { gap:10px; }
                .lfhub-segment { width:100%; }
                .lfhub-segment button { min-width:0; flex:1; }
                .lfhub-auto { font-size:11px; }
                .lfhub-actions button.source-change { max-width:150px; overflow:hidden; text-overflow:ellipsis; }
            }
        `);
    }

    async function automaticCheck() {
        const preferences = loadPreferences();
        if (!preferences.automaticChecks || Date.now() - preferences.lastAutomaticCheck < 24 * 60 * 60 * 1000) return;
        preferences.lastAutomaticCheck = Date.now();
        savePreferences(preferences);
        if (preferences.source !== 'github') return;
        try {
            const result = applyManifestResult(await loadManifestForPreferences(preferences, false));
            const count = manifestState.modules.map(module => moduleView(module, preferences)).filter(module => module.updateAvailable).length;
            if (count || compareVersions(result.manifest.hub.version, HUB_VERSION) > 0) {
                Blockbench.showToastNotification?.({
                    text: count ? `${count} Lightflow update${count === 1 ? '' : 's'} available` : tr('hubUpdate', {version: result.manifest.hub.version}),
                    icon: 'system_update_alt', expire: 9000, click: openHub
                });
            }
        } catch (error) {
            console.info('[Lightflow Hub] Automatic update check skipped:', error?.message || error);
        }
    }

    function unload() {
        disposed = true;
        hubDialog?.hide?.();
        hubDialog = null;
        openAction?.delete?.();
        openAction = null;
        stylesheet?.delete?.();
        stylesheet = null;
        if (globalThis.LightflowHub?.version === HUB_VERSION) delete globalThis.LightflowHub;
    }

    Plugin.register(HUB_ID, {
        title: 'Lightflow Hub',
        icon: 'hub',
        author: 'MidFord327',
        description: 'Install, update, enable, disable, and organize every Lightflow module from GitHub releases, development branches, or a local folder.',
        about: 'Lightflow Hub is the modular suite manager. It never silently replaces local modules and only installs updates after an explicit action.',
        tags: ['Lightflow', 'Utility', 'Developer Tools'],
        version: HUB_VERSION,
        min_version: '4.9.0',
        variant: 'both',
        website: REPOSITORY.github,
        repository: REPOSITORY.github,
        bug_tracker: REPOSITORY.issues,
        onload() {
            disposed = false;
            addStyles();
            openAction = new Action('open_lightflow_hub', {
                name: 'Lightflow Hub',
                description: tr('subtitle'),
                icon: 'hub',
                category: 'tools',
                click: openHub
            });
            MenuBar.addAction(openAction, 'tools');
            globalThis.LightflowHub = Object.freeze({
                version: HUB_VERSION,
                open: openHub,
                checkForUpdates: async () => applyManifestResult(await loadManifestForPreferences(loadPreferences(), true)),
                getCatalog: () => manifestState.modules.map(module => ({...module, dependencies: [...module.dependencies]})),
                getState: () => ({ref: currentRef, origin: manifestOrigin, preferences: loadPreferences()}),
                __test: Object.freeze({compareVersions, sanitizeManifest, sanitizeRef, sanitizeFile, dependencyOrder, rawUrl, extractPluginVersion, stableReleaseCandidates})
            });
            setTimeout(() => { if (!disposed) automaticCheck(); }, 3500);
        },
        onunload: unload
    });
})();
