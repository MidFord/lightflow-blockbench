'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pluginFiles = [
    'light_manager.js',
    'shader_architect.js',
    'lightflow_atmosphere.js',
    'studio_render.js'
];

const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('all independently loadable plugins parse as JavaScript', () => {
    pluginFiles.forEach(file => {
        execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
    });
});

test('release candidate versions stay synchronized with the README', () => {
    const expected = {
        'light_manager.js': '1.6.1',
        'shader_architect.js': '2.5.1',
        'lightflow_atmosphere.js': '0.2.0',
        'studio_render.js': '1.4.2'
    };
    const readme = read('README.md');
    Object.entries(expected).forEach(([file, version]) => {
        assert.match(read(file), new RegExp(`version:\\s*['\"]${version.replaceAll('.', '\\.')}['\"]|PLUGIN_VERSION\\s*=\\s*['\"]${version.replaceAll('.', '\\.')}['\"]`));
        assert.ok(readme.includes(`\`${version}\``), `${version} is missing from README.md`);
    });
});

test('Shader Architect covers Cube, Mesh, and TextureMesh lifecycle paths', () => {
    const source = read('shader_architect.js');
    assert.match(source, /const getShaderElementTypes/);
    assert.match(source, /types\.push\(Cube\)/);
    assert.match(source, /types\.push\(Mesh\)/);
    assert.match(source, /types\.push\(TextureMesh\)/);
    assert.match(source, /getShaderElementTypes\(\)\.forEach\(ElementType => \{/);
    assert.match(source, /\['add_cube', 'add_mesh', 'add_texture_mesh'\]/);
    assert.match(source, /normalizedFaceUvData = new Float32Array\(vertexCount \* 2\)/);
});

test('Cinematic Craft keeps legacy project compatibility and quick presets', () => {
    const source = read('shader_architect.js');
    assert.match(source, /id: 'cinematic_craft'/);
    assert.match(source, /Object\.defineProperty\(this\.materials, 'luma_forge'/);
    assert.match(source, /MATERIAL_OVERRIDE_PRESETS/);
    assert.match(source, /trailer_hero/);
    assert.match(source, /applyMaterialOverridePreset/);
});

test('flat surfaces and semitransparent shadows retain regression guards', () => {
    const source = read('shader_architect.js');
    assert.match(source, /resolvePlanarCubeSurface/);
    assert.match(source, /saPlanarSurfaceResolved/);
    assert.match(source, /lightflow_alpha_shadow_v2/);
    assert.match(source, /sa_shadow_map_index/);
    assert.match(source, /saShadowAlpha/);
    assert.match(source, /getTextureAlphaProfile/);
});

test('AO render targets remain DPI-safe without relying on shadow-map passes', () => {
    const source = read('shader_architect.js');
    assert.match(source, /state\.sceneTarget\.viewport\?\.set\?\.\(0, 0, sceneWidth, sceneHeight\)/);
    assert.match(source, /state\.cubeTarget\.viewport\?\.set\?\.\(0, 0, width, height\)/);
    assert.match(source, /if \(renderer\.shadowMap\) renderer\.shadowMap\.autoUpdate = false/);
    assert.doesNotMatch(source, /setRenderTarget\(state\.sceneTarget\);\s*renderer\.setViewport/s);
    assert.doesNotMatch(source, /setRenderTarget\(state\.cubeTarget\);\s*renderer\.setViewport/s);
});

test('automatic normal bias migrates the old formula and PBR matches Lightflow intensity units', () => {
    const lights = read('light_manager.js');
    const shaders = read('shader_architect.js');
    assert.match(lights, /LIGHT_MANAGER_NORMAL_BIAS_TEXEL_FACTOR = 4\.4/);
    assert.match(lights, /LIGHT_MANAGER_LEGACY_NORMAL_BIAS_TEXEL_FACTOR = 0\.72/);
    assert.match(lights, /defaults\.push\(this\.legacyShadowNormalBias\(source\)\)/);
    const reportedCase = Math.round(Math.min(0.12, (11.384783338284386 * 2 / 1024) * 4.4) * 100000) / 100000;
    assert.equal(reportedCase, 0.09784);
    assert.match(shaders, /incoming direct radiance by PI/);
    assert.match(shaders, /\* attenuation\s*\* PI;/);
});

test('Bloom uses transparent depth-only texels to occlude hidden emitters without erasing visible glow', () => {
    const source = read('studio_render.js');
    assert.match(source, /if \(energy <= 0\.0005\) \{[\s\S]*?gl_FragColor = vec4\(0\.0\);[\s\S]*?return;/);
    assert.match(source, /gl_FragColor = vec4\(max\(emission, vec3\(0\.0\)\), clamp\(energy, 0\.0, 1\.0\)\);/);
    assert.match(source, /depthWrite: true/);
    assert.doesNotMatch(source, /if \(energy <= 0\.0005\) discard;/);
});

test('supporting modules include Mesh and TextureMesh render elements', () => {
    const atmosphere = read('lightflow_atmosphere.js');
    const studio = read('studio_render.js');
    const lights = read('light_manager.js');
    assert.match(atmosphere, /\[window\.Cube, window\.Mesh, window\.TextureMesh\]/);
    assert.match(studio, /\[window\.Cube, window\.Mesh, window\.TextureMesh\]/);
    assert.match(lights, /TextureMesh\.selected/);
});

test('renderer documentation does not misrepresent WebGL as hardware RTX', () => {
    const docs = read('docs/RENDER_BACKENDS.md');
    assert.match(docs, /does not expose a hardware ray-tracing pipeline/i);
    assert.match(docs, /colored transmissive shadows/i);
});
