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
    'lightflow_environment.js',
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
        'light_manager.js': '1.6.4',
        'shader_architect.js': '2.7.1',
        'lightflow_atmosphere.js': '1.0.1',
        'lightflow_environment.js': '1.1.0',
        'studio_render.js': '1.6.0'
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

test('high-object-count rendering collapses equivalent Cube slots and removes per-object frame work', () => {
    const source = read('shader_architect.js');
    assert.match(source, /materialsCanCollapse\(left, right\)/);
    assert.match(source, /mesh\.material = pooled/);
    assert.match(source, /saCollapsedMaterialSlots/);
    assert.match(source, /saOriginalMaterialSlotCount/);
    assert.match(source, /poolMaterial\(material\)/);
    assert.match(source, /sourceMaterial\.is_sa_pooled/);
    assert.match(source, /bindSharedFrameUniforms\(targetMaterial\)/);
    assert.match(source, /bindSharedLightUniforms\(targetMaterial\)/);
    assert.match(source, /shaderArchitectPerDrawUniformSync/);
    assert.match(source, /colorWrite: false/);
    assert.match(source, /LightflowPerformance/);
    assert.doesNotMatch(source, /self\.updateWorldNormalMatrices\(animationTargets\)/);
    assert.doesNotMatch(source, /requestSceneUpdate\('update_selection',[\s\S]{0,160}partial: true/);
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

test('Scene Composer keeps realtime Bloom GPU-resident, DPI-safe, and AO-order-safe', () => {
    const source = read('studio_render.js');
    assert.match(source, /function renderViewportComposer\(preview\)/);
    assert.match(source, /function scheduleViewportComposer\(preview\)/);
    assert.match(source, /const result = originalRender\.apply\(this, arguments\);\s*scheduleViewportComposer\(this\);/);
    assert.match(source, /renderViewportBloomMask\(preview, state, maskWidth, maskHeight\)/);
    assert.match(source, /renderViewportBloomPyramid\(preview, state, maskWidth, maskHeight, viewWidth, viewHeight\)/);
    assert.match(source, /renderViewportGPUComposite\(preview, state, snapshot, bloomReady, useColorGrade\)/);
    assert.match(source, /renderer\.copyFramebufferToTexture\(state\.copyPosition\.set\(originX, originY\), beauty\)/);
    assert.match(source, /renderer\.getCurrentViewport\?\.\(new THREE\.Vector4\(\)\)/);
    assert.match(source, /state\.bloomTargets\[index\] = createViewportPostTarget/);
    assert.match(source, /Lightflow_ViewportBloomDownsample/);
    assert.match(source, /Lightflow_ViewportGPUComposer/);
    assert.match(source, /queueMicrotask\(run\)/);
    assert.match(source, /viewport_bloom_fps: 0/);
    assert.match(source, /max: 144/);
    assert.match(source, /adaptive: \{ scale:/);
    assert.match(source, /id: 'lightflow_scene_composer_toolbar'/);
    assert.match(source, /viewport_bloom_fps/);
    assert.match(source, /new THREE\.WebGLRenderTarget\(width, height/);
    assert.doesNotMatch(source, /renderer\.readRenderTargetPixels\(state\.maskTarget/);
    assert.doesNotMatch(source, /lightflow_scene_composer_overlay/);
    assert.doesNotMatch(source, /state\.maskPixels/);
    assert.match(source, /collectStudioRenderHiddenObjects\(\)\.forEach/);
    assert.match(source, /if \(!isLightflowRenderMode\(\)\)/);
    assert.match(source, /condition: \{ modes: \['render'\], project: true \}/);
    assert.match(source, /attached_to: window\.Panels\?\.lightflow_environment_panel \? 'lightflow_environment_panel' : 'outliner'/);
    assert.match(source, /applyFinalBloom\(canvas, normalized, bloomMaskCanvas\)/);
    assert.match(source, /applyFinalColorGrade\(canvas, normalized\)/);
    const maskSection = source.slice(
        source.indexOf('function renderViewportBloomMask'),
        source.indexOf('function createViewportComposerResources')
    );
    assert.match(maskSection, /configureViewportPostTarget\(state\.maskTarget, width, height\);\s*renderer\.setRenderTarget\(state\.maskTarget\)/);
    assert.doesNotMatch(maskSection, /renderer\.setViewport/);
});

test('Minecraft environment drives sky, time, ambient response, sun shadows, and project persistence', () => {
    const source = read('lightflow_environment.js');
    assert.match(source, /preset: 'vanilla'/);
    assert.match(source, /vibrant_visuals:/);
    assert.match(source, /function getLightingState\(\)/);
    assert.match(source, /new THREE\.DirectionalLight/);
    assert.match(source, /shadow\.camera\.left/);
    assert.match(source, /pixelated_shadows/);
    assert.match(source, /lightflow_environment_settings/);
    assert.match(source, /getVirtualLight/);
    assert.match(source, /palette_mode: 'preset'/);
    assert.match(source, /cloud_mode: 'vanilla'/);
    assert.match(source, /sun_texture_uuid/);
    assert.match(source, /moon_texture_uuid/);
    assert.match(source, /cloud_texture_uuid/);
    assert.match(source, /Generated Vanilla-style Texture/);
    assert.match(source, /condition: \{ modes: \['render'\], project: true \}/);
    assert.match(source, /attached_to: 'outliner'/);
    assert.match(source, /updateScene\(\{ forceShadow: false \}\);\s*dispatchChanged\('animation'\)/);
    assert.equal((source.match(/\.join\('\\n'\)/g) || []).length, 2);
    assert.doesNotMatch(source, /\.join\('\\\\n'\)/);
});

test('environment sky shaders assemble with real line breaks', () => {
    const source = read('lightflow_environment.js');
    const start = source.indexOf('const SKY_VERTEX =');
    const end = source.indexOf('function createSky()', start);
    assert.ok(start >= 0 && end > start);

    const buildShaders = new Function(`${source.slice(start, end)}\nreturn { SKY_VERTEX, SKY_FRAGMENT };`);
    const { SKY_VERTEX, SKY_FRAGMENT } = buildShaders();
    [SKY_VERTEX, SKY_FRAGMENT].forEach(shader => {
        assert.match(shader, /\nvoid main\(\)/);
        assert.doesNotMatch(shader, /\\\\n/);
    });
    assert.match(SKY_FRAGMENT, /uniform sampler2D uSunTexture;/);
    assert.match(SKY_FRAGMENT, /uniform sampler2D uMoonTexture;/);
    assert.match(SKY_FRAGMENT, /uniform sampler2D uCloudTexture;/);
    assert.match(SKY_FRAGMENT, /uniform int uCloudMode;/);
});

test('Vibrant Visuals PBR uses native MER semantics, environment lighting, SSR fallback, and switchable pixel shadows', () => {
    const source = read('shader_architect.js');
    assert.match(source, /id: 'vibrant_visuals_pbr'/);
    assert.match(source, /uUseBlockbenchMERMap/);
    assert.match(source, /uSAEnvironmentAmbient/);
    assert.match(source, /"uSAEnvironmentEnabled": \{ type: "int", value: 0, expose: false \}/);
    assert.match(source, /saSSRSampleEnvironment/);
    assert.match(source, /uPixelatedShadows/);
    assert.match(source, /uniform bool PIXELATED_SHADOWS/);
    assert.match(source, /\/\* Lightflow lights \*\/[\s\S]*?uniform int uLightCastShadow\[16\];[\s\S]*?uniform int uLightShadowIndex\[16\];/);
});

test('Three r129 punctual-light compatibility stays local to custom shaders', () => {
    const lights = read('light_manager.js');
    const shaders = read('shader_architect.js');
    assert.doesNotMatch(lights, /ShaderChunk\.common\s*\+=/);
    assert.doesNotMatch(lights, /float punctualLightIntensityToIrradianceFactor/);
    assert.match(shaders, /const LIGHTFLOW_PUNCTUAL_LIGHT_COMPAT/);
    assert.equal((shaders.match(/\$\{LIGHTFLOW_PUNCTUAL_LIGHT_COMPAT\}/g) || []).length, 5);
});

test('SSR capture never samples the render target currently being written', () => {
    const source = read('shader_architect.js');
    const suspend = source.indexOf('material.uniforms.uSA_SSRScene.value = fallbackTexture');
    const bind = source.indexOf('renderer.setRenderTarget(state.captureTarget)', suspend);
    assert.ok(suspend >= 0 && bind > suspend);
    assert.match(source, /material\.uniforms\.uSA_SSRDepth\.value = fallbackTexture/);
    assert.match(source, /material\.uniforms\.uSA_SSRHasDepth\.value = 0/);
});

test('supporting modules include Mesh and TextureMesh render elements', () => {
    const atmosphere = read('lightflow_atmosphere.js');
    const studio = read('studio_render.js');
    const lights = read('light_manager.js');
    assert.match(atmosphere, /\[window\.Cube, window\.Mesh, window\.TextureMesh\]/);
    assert.match(studio, /\[window\.Cube, window\.Mesh, window\.TextureMesh\]/);
    assert.match(lights, /TextureMesh\.selected/);
});

test('Atmosphere 1.0 keeps volume targets DPI-safe and shadowed God Rays transparent', () => {
    const source = read('lightflow_atmosphere.js');
    assert.match(source, /function configureRenderTarget\(target, width, height\)/);
    assert.match(source, /configureRenderTarget\(state\.volumeTarget, volumeWidth, volumeHeight\)/);
    assert.match(source, /configureRenderTarget\(state\.sceneTarget, volumeWidth, volumeHeight\)/);
    assert.match(source, /configureRenderTarget\(state\.cubeTarget, volumeWidth, volumeHeight\)/);
    assert.doesNotMatch(source, /setRenderTarget\??\.?(?:\(state\.(?:volume|scene|cube)Target\)|\(state\.(?:volume|scene|cube)Target)[\s\S]{0,100}setViewport/);
    assert.match(source, /godrays:\s*\{[\s\S]{0,100}composite_mode: 'shafts', shadow_fill: 0/);
    assert.match(source, /if \(!lightShaft\) extinctionColor \+= sigmaS \+ sigmaA/);
    assert.match(source, /accumulated \+= transmittance \* scatteringSource \* stepLength/);
    assert.match(source, /const legacyGodRays =/);
    assert.match(source, /previousTargetViewport = previousTarget\?\.viewport\?\.clone/);
    assert.match(source, /if \(previousTarget\) \{[\s\S]{0,500}renderer\.setRenderTarget\?\.\(previousTarget\);[\s\S]{0,120}\} else \{/);
    assert.match(source, /proxy\.userData\.lightflowNoShadow = true/);
    assert.match(source, /proxy\.castShadow = false/);
    const lightManager = read('light_manager.js');
    assert.match(lightManager, /const suppressElementShadows = element\.type === 'lightflow_volume'/);
    assert.match(lightManager, /suppressElementShadows \|\| object\.userData\?\.lightflowNoShadow/);
});

test('Atmosphere 1.0 skips redundant realtime volume work', () => {
    const source = read('lightflow_atmosphere.js');
    assert.match(source, /frustum\.intersectsSphere/);
    assert.match(source, /computeFrameSignature\(state, preview, volumes, studio\)/);
    assert.match(source, /const useCachedNormal =/);
    assert.match(source, /state\.stats\.cacheHits\+\+/);
    assert.match(source, /getScenePartition\(\)/);
    assert.match(source, /useDepthOnlyCubeMaterials\(\)/);
    assert.match(source, /findFreshSharedDepthSources/);
    assert.match(source, /performance\(\) \{/);
});

test('renderer documentation does not misrepresent WebGL as hardware RTX', () => {
    const docs = read('docs/RENDER_BACKENDS.md');
    assert.match(docs, /does not expose a hardware ray-tracing pipeline/i);
    assert.match(docs, /colored transmissive shadows/i);
});
