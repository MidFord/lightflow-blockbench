'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MODULES = [
    'light_manager.js',
    'shader_architect.js',
    'studio_render.js',
    'lightflow_environment.js',
    'lightflow_atmosphere.js',
    'lightflow_cinematic.js',
    'visual_shader_graph.js',
    'bedrock_structure_studio.js',
];

test('development snapshot contains all eight root modules', () => {
    for (const file of MODULES) {
        const full = path.join(ROOT, file);
        assert.equal(fs.existsSync(full), true, `${file} must exist`);
        assert.ok(fs.statSync(full).size > 1_000, `${file} must not be an empty placeholder`);
    }
});

test('Visual Shader Graph core API round-trips format 3 graphs', () => {
    const vsg = require(path.join(ROOT, 'visual_shader_graph.js'));
    assert.equal(vsg.GRAPH_FORMAT, 'lightflow_visual_shader_graph');
    assert.equal(vsg.GRAPH_FORMAT_VERSION, 3);
    assert.equal(Object.keys(vsg.NODE_DEFINITIONS).length, 111);

    const graph = vsg.createGraph('Development smoke test');
    const serialized = vsg.serializeGraph(graph);
    const parsed = vsg.parseGraphFile(serialized);

    assert.equal(parsed.name, 'Development smoke test');
    assert.equal(parsed.settings.graphKind, 'material');
    assert.ok(Array.isArray(parsed.nodes));
    assert.ok(parsed.nodes.some(node => node.type === 'surface_output'));
});

test('Visual Shader Graph exposes required staged authoring nodes', () => {
    const { NODE_DEFINITIONS } = require(path.join(ROOT, 'visual_shader_graph.js'));
    for (const id of [
        'vertex_output',
        'geometry_attribute',
        'varying',
        'surface_output',
        'uniform_reference',
        'scene_color',
        'scene_depth',
        'subgraph_instance',
        'custom_expression',
    ]) {
        assert.ok(NODE_DEFINITIONS[id], `missing node definition: ${id}`);
    }
});

test('Bedrock Structure Studio exposes the preserved codec/plugin core', () => {
    const bedrock = require(path.join(ROOT, 'bedrock_structure_studio.js'));
    assert.equal(bedrock.BedrockStructureStudioPlugin.VERSION, '2.2.1');
    assert.equal(typeof bedrock.LittleEndianNBTReader, 'function');
    assert.equal(typeof bedrock.LittleEndianNBTWriter, 'function');
    assert.equal(typeof bedrock.MinecraftBedrockStructure, 'function');
    assert.equal(typeof bedrock.MinecraftBedrockStructureEditor, 'function');
});

test('Bedrock logical shape resolver keeps full, cross and partial shapes distinct', () => {
    const { BedrockStructureStudioPlugin: studio } = require(path.join(ROOT, 'bedrock_structure_studio.js'));
    const full = studio.resolveBlockShape('minecraft:stone', {});
    const cross = studio.resolveBlockShape('minecraft:tall_grass', {});
    const slab = studio.resolveBlockShape('minecraft:oak_slab', {});

    assert.equal(full.key, 'full');
    assert.equal(full.boxes.length, 1);
    assert.equal(cross.key, 'cross');
    assert.equal(cross.quads.length, 2);
    assert.equal(slab.key, 'slab');
    assert.equal(slab.boxes.length, 1);
});
