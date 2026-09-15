'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const hubSource = fs.readFileSync(path.join(root, 'lightflow_hub.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'lightflow.manifest.json'), 'utf8'));
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
        this.version = manifest.modules.find(module => module.id === this.id)?.version || '0.0.1';
        this.installed = true;
        context.Plugins.all.push(this);
        context.Plugins.registered[this.id] = this;
        context.Plugins.installed.push({id: this.id, version: this.version, path: url, source: 'url'});
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
        showMessageBox() {},
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

const cleanManifest = api.sanitizeManifest(manifest);
assert.strictEqual(cleanManifest.modules.length, manifest.modules.length);
assert.strictEqual(new Set(cleanManifest.modules.map(module => module.id)).size, cleanManifest.modules.length);

const ordered = api.dependencyOrder(cleanManifest.modules, ['shader_architect']);
assert.deepStrictEqual(Array.from(ordered, module => module.id), ['light_manager', 'shader_architect']);

const stableCandidates = api.stableReleaseCandidates([
    {tag_name: 'draft-v1', draft: true, prerelease: false},
    {tag_name: 'preview-v1', draft: false, prerelease: true},
    {tag_name: '../invalid', draft: false, prerelease: false},
    {tag_name: 'lightflow-hub-v1.0.0', draft: false, prerelease: false}
]);
assert.deepStrictEqual(Array.from(stableCandidates, release => release.tag_name), ['lightflow-hub-v1.0.0']);

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
    console.log(`Lightflow Hub contract passed (${cleanManifest.modules.length} managed modules).`);
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
