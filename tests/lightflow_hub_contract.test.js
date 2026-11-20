'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const hubSource = fs.readFileSync(path.join(root, 'lightflow_hub.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'lightflow.manifest.json'), 'utf8'));
const embeddedSplash = hubSource.match(/const HUB_SPLASH_ART = 'data:image\/webp;base64,([^']+)'/);
assert(embeddedSplash, 'Hub must embed its offline splash artwork');
assert.strictEqual(manifest.artwork, 'assets/hub/lightflow-showcase.webp');
assert.deepStrictEqual(
    fs.readFileSync(path.join(root, manifest.artwork)),
    Buffer.from(embeddedSplash[1], 'base64'),
    'The published splash asset must match the Hub offline artwork'
);
const storage = new Map();
let registration = null;
let lastDialogConfig = null;
const testConsole = Object.create(console);
testConsole.error = (...args) => {
    if (String(args[0] || '').startsWith('[Lightflow Hub]')) return;
    console.error(...args);
};

class MockPlugin {
    constructor(id = 'unknown', data = {}) {
        this.id = id;
        this.installed = false;
        this.disabled = !!data.disabled;
        this.tags = [];
        this.contributors = [];
        this.dependencies = [];
    }
    static register(id, data) {
        registration = {id, data};
        data.onload();
    }
    async loadFromURL(url) {
        this.id = path.basename(new URL(url).pathname, '.js');
        this.path = url;
        this.source = 'url';
        this.version = this.id === 'shader_architect' && url.includes('/refs/tags/v1/') ? '1.0.0' : manifest.modules.find(module => module.id === this.id)?.version || manifest.hub.version;
        this.installed = true;
        if (!context.Plugins.all.includes(this)) context.Plugins.all.push(this);
        context.Plugins.registered[this.id] = this;
        context.Plugins.installed.push({id: this.id, version: this.version, path: url, source: 'url'});
        return this;
    }
    async loadFromFile(file) {
        this.id = path.basename(file.path, '.js');
        this.path = file.path; this.source = 'file'; this.installed = true;
        this.version = manifest.modules.find(module => module.id === this.id)?.version || manifest.hub.version;
        if (!context.Plugins.all.includes(this)) context.Plugins.all.push(this); context.Plugins.registered[this.id] = this;
        context.Plugins.installed.push({id: this.id, path: this.path, source: 'file'});
        return this;
    }
    unload() { this.unloaded = true; }
    toggleDisabled() {
        this.disabled = !this.disabled;
        const entry = context.Plugins.installed.find(item => item.id === this.id);
        if (entry) entry.disabled = this.disabled || undefined;
    }
    uninstall() {
        this.installed = false;
        context.Plugins.all = context.Plugins.all.filter(item => item !== this);
        context.Plugins.installed = context.Plugins.installed.filter(item => item.id !== this.id);
        delete context.Plugins.registered[this.id];
    }
}

class MockAction {
    constructor(id, data) { this.id = id; this.data = data; }
    delete() {}
}

const context = {
    console: testConsole,
    setTimeout() { return 1; },
    clearTimeout() {},
    fetch: async url => {
        if (String(url).endsWith('.js')) {
            const file = path.basename(new URL(url).pathname);
            return {ok: true, text: async () => fs.readFileSync(path.join(root, file), 'utf8')};
        }
        throw new Error('Network disabled in contract test');
    },
    AbortController,
    navigator: {language: 'es-MX'},
    localStorage: {
        getItem(key) { return storage.has(key) ? storage.get(key) : null; },
        setItem(key, value) { storage.set(key, String(value)); },
        removeItem(key) { storage.delete(key); }
    },
    settings: {language: {value: 'es'}},
    Plugin: MockPlugin,
    Action: MockAction,
    MenuBar: {addAction() {}},
    Dialog: class {
        constructor(config) { this.config = config; lastDialogConfig = config; }
        show() {}
        hide() {}
    },
    Plugins: {all: [], installed: [], registered: {}},
    Blockbench: {
        version: '5.0.0',
        isOlderThan(version) { return Number(version.split('.')[0]) > 5; },
        addCSS() { return {delete() {}}; },
        showMessageBox(config, callback) { callback?.(0); },
        showToastNotification() {},
        openLink() {}
    }
};
context.globalThis = context;
context.window = context;
vm.runInNewContext(hubSource, context, {filename: 'lightflow_hub.js'});

assert(registration, 'Hub must register itself');
assert.strictEqual(registration.id, 'lightflow_hub');
assert.strictEqual(registration.data.version, manifest.hub.version);
assert.strictEqual(typeof context.LightflowHub.open, 'function');

const api = context.LightflowHub.__test;
assert.strictEqual(api.compareVersions('1.10.0', '1.9.9'), 1);
assert.strictEqual(api.compareVersions('2.0.0-beta.1', '2.0.0'), -1);
assert.strictEqual(api.compareVersions('v2.0', '2.0.0'), 0);
assert.strictEqual(api.sanitizeRef('../main'), '');
assert.strictEqual(api.sanitizeRef('feature/hub-v2'), 'feature/hub-v2');
assert.strictEqual(api.sanitizeFile('../module.js'), '');
assert.strictEqual(api.sanitizeFile('modules/example.js'), 'modules/example.js');
assert.strictEqual(
    api.rawUrl('main', 'light_manager.js'),
    'https://raw.githubusercontent.com/MidFord/lightflow-blockbench/main/light_manager.js'
);
assert.strictEqual(api.rawUrl('refs/heads/main', 'lightflow.manifest.json'),
    'https://raw.githubusercontent.com/MidFord/lightflow-blockbench/refs/heads/main/lightflow.manifest.json');
assert.throws(() => api.rawUrl('main', '../lightflow.manifest.json'), /Invalid Lightflow source/);

const cleanManifest = api.sanitizeManifest(manifest);
assert.strictEqual(cleanManifest.modules.length, manifest.modules.length);
assert.strictEqual(new Set(cleanManifest.modules.map(module => module.id)).size, cleanManifest.modules.length);

const ordered = api.dependencyOrder(cleanManifest.modules, ['shader_architect']);
assert.strictEqual(api.extractPluginVersion(`const metadata = {version: 'unrelated'}; Plugin.register('fixture', {icon: 'data:image/png;base64,${'A'.repeat(3000)}', version: '2.3.4'});`, {version:'0.0.0'}), '2.3.4', 'Embedded icons must not hide the registered plugin version');
assert.deepStrictEqual(Array.from(ordered, module => module.id), ['light_manager', 'shader_architect']);

const stableCandidates = api.stableReleaseCandidates([
    {tag_name: 'draft-v1', draft: true, prerelease: false},
    {tag_name: 'preview-v1', draft: false, prerelease: true},
    {tag_name: '../invalid', draft: false, prerelease: false},
    {tag_name: 'lightflow-hub-v1.0.0', draft: false, prerelease: false}
]);
assert.deepStrictEqual(Array.from(stableCandidates, release => release.tag_name), ['lightflow-hub-v1.0.0']);
assert.deepStrictEqual(Array.from(api.stableReleaseCandidates([
    {tag_name:'lightflow-hub-v1.1.1'}, {tag_name:'v0.2.0'}, {tag_name:'v0.10.0'},
    {tag_name:'v1.0.0-beta.1',prerelease:true}, {tag_name:'v0.1.0'}, {tag_name:'lightflow-hub-v1.0.1'}
]), release => release.tag_name), ['v0.10.0','v0.2.0','v0.1.0','lightflow-hub-v1.1.1','lightflow-hub-v1.0.1'],
'Published suite versions outrank later Hub-only catalogs; numeric order handles 0.10 correctly');

for (const module of cleanManifest.modules) {
    const filePath = path.join(root, module.file);
    assert(fs.existsSync(filePath), `Manifest file missing: ${module.file}`);
    const source = fs.readFileSync(filePath, 'utf8');
    assert(source.includes(`Plugin.register`) || source.includes(`root.Plugin.register`), `${module.file} is not a Blockbench plugin`);
    assert.strictEqual(api.extractPluginVersion(source, module), module.version, `Version drift in ${module.file}`);
    for (const dependency of module.dependencies) {
        assert(cleanManifest.modules.some(candidate => candidate.id === dependency), `${module.id} has unknown dependency ${dependency}`);
    }
}

registration.data.onunload();
assert.strictEqual(context.LightflowHub, undefined, 'Hub API must be removed on unload');

// Re-load once to exercise the UI controller and the GitHub installation path.
registration.data.onload();
context.LightflowHub.open();
assert(lastDialogConfig?.component?.template.includes('lfhub-module'), 'Hub dialog must expose the module list');
assert(/<h1><span class="lfhub-hero-title-lead">\{\{ t\('heroTaglineLead'\) \}\}<\/span> <span class="lfhub-hero-title-worlds">\{\{ t\('heroTaglineWorlds'\) \}\}<\/span> <span class="lfhub-hero-title-accent">\{\{ t\('heroTaglineAccent'\) \}\}<\/span><\/h1>/.test(lastDialogConfig.component.template), 'Hero heading must render three localized, naturally spaced text segments');
assert(hubSource.includes("heroTaglineLead: 'Your'") && hubSource.includes("heroTaglineWorlds: 'worlds,'") && hubSource.includes("heroTaglineAccent: 'reframed.'"), 'English hero heading must match Reframed');
assert(hubSource.includes("heroTaglineLead: 'Tus'") && hubSource.includes("heroTaglineWorlds: 'mundos,'") && hubSource.includes("heroTaglineAccent: 'desde otra perspectiva.'"), 'Spanish hero must preserve its localized headline');
assert(hubSource.includes("heroDescription: 'Lighting, materials, worldbuilding, animation, and rendering — all inside Blockbench.'"), 'English hero description must represent the full Lightflow toolkit');
assert(hubSource.includes("heroDescription: 'Iluminación, materiales, creación de mundos, animación y renderizado. Todo dentro de Blockbench.'"), 'Spanish hero description must represent the full Lightflow toolkit');
assert(hubSource.includes('--lfhub-reframed-yellow:#fffcd9;--lfhub-reframed-blue:#c5f9ff;--lfhub-reframed-rose:#ffbcce'), 'The hero must use the Reframed Hub palette');
assert(hubSource.includes('.lfhub-hero-title-lead {color:var(--lfhub-reframed-yellow)}') && hubSource.includes('.lfhub-hero-title-worlds {color:var(--lfhub-reframed-blue)}') && hubSource.includes('.lfhub-hero-title-accent {color:var(--lfhub-reframed-rose)}'), 'All three hero title segments must use the intended logo colors');
assert(/<figure class="lfhub-splash-artwork">\s*<img class="lfhub-splash"[^>]+>\s*<figcaption class="lfhub-splash-caption">/.test(lastDialogConfig.component.template), 'Artwork credit must be inside the image figure, not beneath the CTA');
assert(lastDialogConfig.component.template.includes("t('heroArtworkCredit')"), 'Artwork credit must be localized');
assert(!lastDialogConfig.component.template.includes('lfhub-hero-render-proof'), 'Artwork credit must not also appear next to the CTA');
assert(hubSource.includes('.lfhub-splash-caption {position:absolute;left:24px;bottom:18px'), 'Artwork credit must be anchored bottom-left on the image');
assert(Array.isArray(lastDialogConfig.buttons) && lastDialogConfig.buttons.length === 0, 'Hub must not waste vertical space on a redundant close button bar');
assert(!lastDialogConfig.component.template.includes('fa-github'), 'Hub must use icons available in Blockbench');
assert(!lastDialogConfig.component.template.includes('𝕏'), 'Hub must not rely on an unsupported X glyph');
assert(lastDialogConfig.component.template.includes("module.maturity && module.maturity !== 'stable'"), 'Maturity badges must not render empty placeholders');
assert(hubSource.includes('overflow-x:hidden'), 'The module list must prevent horizontal text overlap');
const component = lastDialogConfig.component;
const viewModel = component.data();
for (const [name, method] of Object.entries(component.methods)) viewModel[name] = method.bind(viewModel);
for (const [name, getter] of Object.entries(component.computed)) {
    Object.defineProperty(viewModel, name, {get: getter.bind(viewModel)});
}

(async () => {
    const essentialsView = {localMode: true, sourceReady: true, modulesAll: [
        {id: 'available', recommended: true, compatible: true, localExists: true},
        {id: 'disabled', recommended: true, compatible: true, localExists: true, installed: true, disabled: true},
        {id: 'missing_file', recommended: true, compatible: true, localExists: false},
        {id: 'archived', recommended: true, compatible: true, installed: true, disabled: true, unavailableInSource: true},
        {id: 'unsupported', recommended: true, compatible: false, localExists: true},
    ]};
    for (const key of ['essentials', 'essentialsSetupTargets', 'essentialsNeedSetup', 'essentialsNeedActivation']) {
        Object.defineProperty(essentialsView, key, {get: component.computed[key]});
    }
    assert(essentialsView.essentialsNeedSetup && essentialsView.essentialsNeedActivation);
    let batchIds;
    essentialsView.installBatch = ids => { batchIds = Array.from(ids); };
    await component.methods.installRecommended.call(essentialsView);
    assert.deepStrictEqual(batchIds, ['available', 'disabled'], 'Setup should install or activate only eligible modules from the selected source');
    essentialsView.modulesAll.shift();
    essentialsView.modulesAll.shift();
    assert(!essentialsView.essentialsNeedSetup && !essentialsView.essentialsNeedActivation);

    viewModel.preferences.source = 'github';
    viewModel.preferences.channel = 'stable';
    await viewModel.refresh();
    assert.strictEqual(viewModel.sourceReady, false, 'Stable must not silently fall through to main when no release exists');
    assert(viewModel.error, 'Unavailable stable releases must be explained in the UI');
    viewModel.preferences.channel = 'main';
    await viewModel.refresh();
    assert.strictEqual(viewModel.sourceReady, true, 'Main fallback must remain installable when its manifest is not online yet');
    const shader = viewModel.modulesAll.find(module => module.id === 'shader_architect');
    await viewModel.install(shader);
    assert.deepStrictEqual(
        Array.from(context.Plugins.installed, item => item.id),
        ['light_manager', 'shader_architect'],
        'Installing a module must install dependencies first'
    );
    const installedShader = viewModel.modulesAll.find(module => module.id === 'shader_architect');
    await viewModel.toggle(installedShader);
    assert.strictEqual(context.Plugins.registered.shader_architect.disabled, true, 'Disable must use Blockbench plugin state');
    viewModel.stateFilter = 'installedFilter';
    assert.strictEqual(viewModel.modules.length, 2, 'Installed filter must follow native records');
    viewModel.stateFilter = 'availableFilter';
    assert.strictEqual(viewModel.modules.length, cleanManifest.modules.length - 2, 'Available filter must exclude installed tools');
    viewModel.clearFilters();
    assert.strictEqual(viewModel.modules.length, cleanManifest.modules.length);
    assert.strictEqual(viewModel.dependencyNames(installedShader), 'Light Manager');
    const disabledUpdate = {...installedShader, disabled: true, updateAvailable: true};
    assert.strictEqual(viewModel.statusText(disabledUpdate), 'Desactivado');
    assert.strictEqual(viewModel.statusClass(disabledUpdate), 'disabled', 'Disabled badge color and text must agree');

    // A source change during the first asynchronous download must not redirect
    // the remaining dependency to a different origin.
    const originalFetch = context.fetch;
    let enteredDownload, releaseDownload;
    const downloadStarted = new Promise(resolve => { enteredDownload = resolve; });
    const downloadGate = new Promise(resolve => { releaseDownload = resolve; });
    let firstDownload = true;
    context.fetch = async url => {
        if (firstDownload && String(url).endsWith('.js')) {
            firstDownload = false; enteredDownload(); await downloadGate;
        }
        return originalFetch(url);
    };
    const replacement = viewModel.forceReplace(installedShader);
    await Promise.race([downloadStarted, new Promise((_, reject) => setTimeout(() => reject(new Error(`Download did not start: busy=${viewModel.busy}, ready=${viewModel.sourceReady}, error=${viewModel.error}`)), 1000))]);
    viewModel.preferences.source = 'local';
    viewModel.preferences.localDirectory = 'different-folder';
    releaseDownload();
    await replacement;
    assert.strictEqual(viewModel.error, '', 'Batch dependencies must retain the origin captured before downloads');
    assert(context.Plugins.installed.every(item => item.path.includes('/refs/heads/main/')));
    viewModel.preferences.source = 'github';
    context.fetch = originalFetch;

    // Published version selection includes previews, pins download URLs and
    // cannot reuse another release's offline cache after a failed switch.
    const releaseList = [
        {tag_name: 'v2', name: 'Release 2', published_at: '2026-10-01T12:00:00Z'},
        {tag_name: 'v1', name: 'Release 1', published_at: '2026-09-01T12:00:00Z'},
        {tag_name: 'v3-preview', prerelease: true, published_at: '2026-10-02T12:00:00Z'},
        {tag_name: 'draft', draft: true}, {tag_name: '../unsafe'}
    ];
    const olderManifest = JSON.parse(JSON.stringify(manifest));
    olderManifest.artwork = 'assets/hub/copper-golem.png';
    olderManifest.modules.find(m => m.id === 'shader_architect').version = '1.0.0';
    context.fetch = async url => {
        if (String(url).includes('/releases?')) return {ok:true, json:async()=>releaseList};
        if (String(url).endsWith('.js')) return originalFetch(url);
        return {ok:true, json:async()=>String(url).includes('/refs/tags/v1/') ? olderManifest : manifest};
    };
    viewModel.preferences.channel = 'stable';
    viewModel.preferences.releaseTag = '';
    await viewModel.refresh();
    assert.strictEqual(context.LightflowHub.getState().ref, 'refs/tags/v2', 'Automatic selection must skip previews');
    assert.deepStrictEqual(Array.from(viewModel.releases, r => r.tag_name), ['v2', 'v1', 'v3-preview']);
    assert(viewModel.latestReleaseDate, 'Published dates must be displayed in the current language');
    const recordsBeforeSelection = JSON.stringify(context.Plugins.installed);
    viewModel.preferences.releaseTag = 'v1';
    await viewModel.changeRelease();
    assert.strictEqual(JSON.stringify(context.Plugins.installed), recordsBeforeSelection, 'Selecting a version must not install it');
    assert.strictEqual(context.LightflowHub.getState().ref, 'refs/tags/v1');
    assert.strictEqual(viewModel.artwork, `data:image/webp;base64,${embeddedSplash[1]}`, 'Switching to an older release must keep the active Hub artwork');
    assert.strictEqual(JSON.parse(storage.get('lightflow_hub_preferences_v1')).releaseTag, 'v1', 'Pinned release must survive reopening');
    const olderShader = viewModel.modulesAll.find(m => m.id === 'shader_architect');
    assert.strictEqual(olderShader.version, '1.0.0');
    assert.strictEqual(olderShader.updateAvailable, false);
    assert.strictEqual(olderShader.sourceMismatch, true, 'Older versions must remain applicable as an explicit source change');
    await viewModel.forceReplace(olderShader);
    assert(context.Plugins.all.filter(p => p.id === 'shader_architect').every(p => p.path.includes('/refs/tags/v1/')), 'Version switch must download the selected tag');
    context.fetch = async()=>{throw new Error('Offline');};
    await viewModel.refresh();
    assert.strictEqual(viewModel.sourceReady, true, 'Matching pinned cache must work offline');
    viewModel.preferences.releaseTag = 'v2';
    await viewModel.changeRelease();
    assert.strictEqual(viewModel.sourceReady, false, 'Failed switch must never install the previously cached version');
    context.fetch = async url => String(url).includes('/releases?') ? {ok:true,json:async()=>[]} : originalFetch(url);
    viewModel.preferences.releaseTag = '';
    await viewModel.changeRelease();
    assert.strictEqual(viewModel.sourceReady, false, 'Empty releases cannot fall back to a stale stable catalog');
    assert.strictEqual(viewModel.releasesLoaded, true);
    assert.strictEqual(viewModel.releases.length, 0);
    assert.strictEqual(viewModel.releaseLabel, '', 'Failed source must not advertise the last successful release');
    const cacheKey = 'lightflow_hub_manifest_cache_v1';
    const cachedCatalog = storage.get(cacheKey);
    storage.delete(cacheKey);
    const fallbackRequests = [];
    for (const status of [403, 429]) {
        context.fetch = async url => {
            const address = String(url);
            fallbackRequests.push(address);
            if (address.includes('/releases?')) {
                return {ok:false, status, headers:new Headers({'x-ratelimit-remaining':'0'})};
            }
            return {ok:true, json:async()=>manifest};
        };
        await viewModel.refresh();
        assert.strictEqual(viewModel.sourceReady, true, 'Fresh Stable must work during a release-list rate limit');
        assert.strictEqual(context.LightflowHub.getState().ref, 'refs/tags/lightflow-hub-v1.0.1');
    }
    assert(fallbackRequests.filter(url => url.includes('/refs/tags/lightflow-hub-v1.0.1/')).length === 2);
    assert(fallbackRequests.every(url => !url.includes('/refs/heads/')));
    viewModel.preferences.releaseTag = 'v2';
    await viewModel.changeRelease();
    assert.strictEqual(viewModel.sourceReady, false, 'A rate limit must never substitute a different pinned release');
    viewModel.preferences.releaseTag = '';
    context.fetch = async () => ({ok:false, status:403, headers:new Headers()});
    await viewModel.changeRelease();
    assert.strictEqual(viewModel.sourceReady, false, 'A generic authorization failure is not a rate limit');
    if (cachedCatalog) storage.set(cacheKey, cachedCatalog);
    // Every published page is browsable, even when there are over 100 releases.
    const pages=[];
    const longReleaseBody = `# Reframed\n${'See the new features.\n'.repeat(2000)}\n## A note from me`;
    context.fetch = async url => {
        const page=Number(new URL(url).searchParams.get('page'));pages.push(page);
        return {ok:true,json:async()=>page===1 ? Array.from({length:100},(_,i)=>({tag_name:`archive-${i}`})) : [{tag_name:'archive-100',body:longReleaseBody}]};
    };
    const paginatedReleases = await api.fetchPublishedReleases();
    assert.strictEqual(paginatedReleases.length, 101);
    assert.ok(paginatedReleases.at(-1).body === longReleaseBody, 'The release body must keep the end of a full README');
    assert.deepStrictEqual(pages, [1,2], 'Version list must follow API pagination');
    context.fetch = async url => String(url).includes('/releases?') ? {ok:true,json:async()=>releaseList} : {ok:false,status:404};
    viewModel.preferences.releaseTag='v1';
    await viewModel.changeRelease();
    assert.strictEqual(viewModel.sourceReady,false,'An archived release without a manifest must not use another catalog');
    assert(viewModel.error.includes('v1'), 'Missing archived manifest must identify the selected version');
    viewModel.preferences.releaseTag='removed';
    await viewModel.changeRelease();
    assert.strictEqual(viewModel.sourceReady,false);
    assert(viewModel.error.includes('removed'), 'Removed release must remain actionable in the version selector');
    viewModel.preferences.releaseTag='';
    viewModel.preferences.channel = 'main';
    context.fetch = originalFetch;

    const linkedModule = cleanManifest.modules.find(m => m.id === 'lightflow_scene_links');
    assert(linkedModule, 'Scene Links must be included in the packaged manifest');
    assert.strictEqual(linkedModule.variant, 'desktop');
    assert.deepStrictEqual(Array.from(api.dependencyOrder(cleanManifest.modules, [linkedModule.id]),m=>m.id), ['light_manager','lightflow_scene_links']);
    const scenePlugin = new MockPlugin('lightflow_scene_links');
    Object.assign(scenePlugin,{installed:true,source:'file',path:'C:/plugins/lightflow_scene_links.js',version:'0.1.0'});
    context.Plugins.all.push(scenePlugin);context.Plugins.registered[scenePlugin.id]=scenePlugin;
    context.Plugins.installed.push({id:scenePlugin.id,version:scenePlugin.version,source:'file',path:scenePlugin.path});
    context.fetch = async url => ({ok:true,json:async()=>String(url).includes('/releases?') ? releaseList : {...manifest,modules:manifest.modules.slice(0,5)}});
    viewModel.preferences.channel='stable';
    await viewModel.refresh();
    const archivedScene = viewModel.modulesAll.find(m=>m.id==='lightflow_scene_links');
    assert(archivedScene?.installed, 'Newer installed Scene Links must stay visible with an older five-module release');
    assert.strictEqual(archivedScene.unavailableInSource,true);
    assert.strictEqual(archivedScene.sourceMismatch,false);
    assert.strictEqual(viewModel.canWrite(archivedScene),false, 'An older release cannot replace Scene Links with a nonexistent file');
    let sceneOpened=0;
    context.Project={};context.BarItems={lightflow_scene_link_add:{name:'Linked scene',condition:()=>!!context.Project,trigger(){sceneOpened++;}}};
    context.Condition=condition=>typeof condition==='function'?condition():condition!==false;
    assert.strictEqual(viewModel.canOpen(archivedScene),true);
    viewModel.openTool(archivedScene);
    assert.strictEqual(sceneOpened,1,'Scene Links Open must invoke the source picker action');
    delete context.Project;
    assert.strictEqual(viewModel.canOpen(archivedScene),false,'Scene Links must wait for an open project');
    context.isApp=false;
    assert.strictEqual(viewModel.modulesAll.find(m=>m.id==='lightflow_scene_links').compatible,false,'Desktop-only module must not be installable on Web');
    assert.strictEqual(viewModel.compatibilityHint(archivedScene),'Solo Blockbench Desktop');
    delete context.isApp;delete context.BarItems;delete context.Condition;
    scenePlugin.uninstall();context.fetch=originalFetch;viewModel.preferences.channel='main';

    // A manifest response arriving after unload cannot hydrate the retired Hub.
    let enteredManifest, releaseManifest;
    const manifestStarted = new Promise(resolve => { enteredManifest = resolve; });
    const manifestGate = new Promise(resolve => { releaseManifest = resolve; });
    context.fetch = async () => {
        enteredManifest(); await manifestGate;
        return {ok: true, json: async () => manifest};
    };
    const originBefore = context.LightflowHub.getState().origin;
    const beforeRefresh = {busy: viewModel.busy, source: viewModel.preferences.source, channel: viewModel.preferences.channel, destroyed: viewModel._hubDestroyed};
    const refreshing = viewModel.refresh();
    await Promise.race([manifestStarted, new Promise((_, reject) => setTimeout(() => reject(new Error(`Manifest did not start: before=${JSON.stringify(beforeRefresh)}, busy=${viewModel.busy}, ready=${viewModel.sourceReady}, error=${viewModel.error}, notice=${viewModel.notice}`)), 1000))]);
    registration.data.onunload();
    releaseManifest();
    await refreshing;
    assert.strictEqual(viewModel.sourceReady, false, 'Retired view must not be reactivated by a late response');
    registration.data.onload();
    assert.strictEqual(context.LightflowHub.getState().origin, originBefore, 'Late response must not replace the shared manifest');
    context.fetch = originalFetch;
    // Updating the Hub from a local catalog must reload its .js file, never a
    // GitHub URL assembled from a Windows directory.
    context.require = name => name === 'fs' ? fs : name === 'path' ? path : undefined;
    storage.set('lightflow_hub_preferences_v1', JSON.stringify({source: 'local', localDirectory: root, automaticChecks: false}));
    context.LightflowHub.open();
    const localComponent = lastDialogConfig.component, localView = localComponent.data();
    for (const [name, method] of Object.entries(localComponent.methods)) localView[name] = method.bind(localView);
    for (const [name, getter] of Object.entries(localComponent.computed)) Object.defineProperty(localView, name, {get: getter.bind(localView)});
    await localView.refresh();
    assert(localView.artwork.startsWith('data:image/webp;base64,'), 'Local catalog must display the updated WebP artwork');
    assert.strictEqual(Buffer.from(localView.artwork.split(',')[1], 'base64').equals(fs.readFileSync(path.join(root, manifest.artwork))), true);
    const updateCallbacks = [];
    context.setTimeout = (callback, delay) => { if (delay === 50) updateCallbacks.push(callback); return 1; };
    await localView.updateHub();
    assert.strictEqual(updateCallbacks.length, 1);
    updateCallbacks[0]();
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(context.Plugins.registered.lightflow_hub.path, path.join(root, 'lightflow_hub.js'));
    assert.strictEqual(context.Plugins.registered.lightflow_hub.source, 'file');
    console.log(`Lightflow Hub contract passed (${cleanManifest.modules.length} managed modules).`);
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
