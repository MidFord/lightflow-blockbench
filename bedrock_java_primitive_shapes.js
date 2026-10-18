'use strict';

// Optional local reference-model adapter for Minecraft Java 26.2's compact
// primitive library. The adapter reads geometry/UV and state rules from the
// user's own extracted assets, never its checkerboard test textures. Bedrock
// textures continue to come from the selected Bedrock resource pack.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {getMinecraftJar} = require('./bedrock_java_model_jar.js');

const FACE_VERTICES = {
    north: (a, b) => [[b[0],a[1],a[2]],[a[0],a[1],a[2]],[a[0],b[1],a[2]],[b[0],b[1],a[2]]],
    south: (a, b) => [[a[0],a[1],b[2]],[b[0],a[1],b[2]],[b[0],b[1],b[2]],[a[0],b[1],b[2]]],
    west: (a, b) => [[a[0],a[1],a[2]],[a[0],a[1],b[2]],[a[0],b[1],b[2]],[a[0],b[1],a[2]]],
    east: (a, b) => [[b[0],a[1],b[2]],[b[0],a[1],a[2]],[b[0],b[1],a[2]],[b[0],b[1],b[2]]],
    up: (a, b) => [[a[0],b[1],a[2]],[a[0],b[1],b[2]],[b[0],b[1],b[2]],[b[0],b[1],a[2]]],
    down: (a, b) => [[a[0],a[1],b[2]],[a[0],a[1],a[2]],[b[0],a[1],a[2]],[b[0],a[1],b[2]]],
};

function implicitFaceUv(face, from, to) {
    // Vanilla Java's BlockElementFace default UV mapping. Omitting "uv" in
    // block-model JSON does NOT mean mapping the whole 16x16 texture.
    // Thin elements (hopper/composter/scaffolding) rely on these cropped UVs.
    switch (face) {
        case 'down': return [from[0],16-to[2],to[0],16-from[2]];
        case 'up': return [from[0],from[2],to[0],to[2]];
        case 'north': return [16-to[0],16-to[1],16-from[0],16-from[1]];
        case 'south': return [from[0],16-to[1],to[0],16-from[1]];
        case 'west': return [from[2],16-to[1],to[2],16-from[1]];
        case 'east': return [16-to[2],16-to[1],16-from[2],16-from[1]];
        default: return [0,0,16,16];
    }
}

function rotate(vertex, axis, angle, origin = [8,8,8], rescale = false) {
    const radians = Number(angle || 0) * Math.PI / 180;
    if (!radians) return vertex.slice();
    const v = vertex.map((n, i) => n - origin[i]);
    if (rescale && (Math.abs(Number(angle || 0)) === 22.5 || Math.abs(Number(angle || 0)) === 45)) {
        // Java model element rotations with rescale keep planes at their
        // original nominal width after tilting around their pivot.
        const multiplier = 1 / Math.cos(radians);
        for (let index = 0; index < 3; index++) if ('xyz'[index] !== axis) v[index] *= multiplier;
    }
    const c = Math.cos(radians), s = Math.sin(radians);
    if (axis === 'x') [v[1],v[2]] = [v[1]*c-v[2]*s,v[1]*s+v[2]*c];
    else if (axis === 'y') [v[0],v[2]] = [v[0]*c+v[2]*s,-v[0]*s+v[2]*c];
    else if (axis === 'z') [v[0],v[1]] = [v[0]*c-v[1]*s,v[0]*s+v[1]*c];
    return v.map((n,i) => Math.abs(n + origin[i]) < 1e-9 ? 0 : Number((n + origin[i]).toFixed(6)));
}

function faceAfterRotation(face, transform, elementRotation = null) {
    const normals = {
        north:[0,0,-1], south:[0,0,1], west:[-1,0,0], east:[1,0,0],
        up:[0,1,0], down:[0,-1,0],
    };
    let normal = normals[face];
    if (!normal) return face;
    if (elementRotation) normal = rotate(normal,elementRotation.axis,elementRotation.angle,[0,0,0]);
    if (transform.x) normal = rotate(normal,'x',transform.x,[0,0,0]);
    if (transform.y) normal = rotate(normal,'y',transform.y,[0,0,0]);
    const axis = normal.reduce((best,value,index) => Math.abs(value)>Math.abs(normal[best]) ? index:best,0);
    const sign = normal[axis] >= 0;
    return [['west','east'],['down','up'],['north','south']][axis][Number(sign)];
}

function modelQuads(model, transform = {}, materialSelector = null) {
    const quads = [];
    const textureWidth = Number(model.uvWidth || 16);
    const textureHeight = Number(model.uvHeight || 16);
    for (let elementIndex = 0; elementIndex < (model.elements || []).length; elementIndex++) {
        const element = model.elements[elementIndex];
        for (const [face, definition] of Object.entries(element.faces || {})) {
            const verticesForFace = FACE_VERTICES[face];
            if (!verticesForFace) continue;
            // Java campfire fire planes each author two opposite faces. Emit
            // one explicitly double-sided quad to avoid coplanar duplicates.
            if (transform.campfireLit && elementIndex >= 5 && !['north','west'].includes(face)) continue;
            if (transform.lanternHandle && elementIndex >= 2 && !['north','west'].includes(face)) continue;
            let vertices = verticesForFace(element.from, element.to);
            if (element.rotation) {
                vertices = vertices.map(v => rotate(v, element.rotation.axis, element.rotation.angle,
                    element.rotation.origin, element.rotation.rescale));
            }
            if (transform.x) vertices = vertices.map(v => rotate(v, 'x', transform.x));
            if (transform.y) vertices = vertices.map(v => rotate(v, 'y', transform.y));
            const rect = definition.uv || implicitFaceUv(face,element.from,element.to);
            const uvs = [[rect[0]/textureWidth,1-rect[3]/textureHeight],
                [rect[2]/textureWidth,1-rect[3]/textureHeight],
                [rect[2]/textureWidth,1-rect[1]/textureHeight],
                [rect[0]/textureWidth,1-rect[1]/textureHeight]];
            let quarterTurns = (((Number(definition.rotation || 0) / 90) % 4) + 4) % 4;
            // Java's uvlock keeps an upward/downward face aligned to the world
            // when the blockstate rotates the model around Y. Without this,
            // the texture rotates on fence gates, signs and other templates.
            if (transform.uvlock === true && (face === 'up' || face === 'down') && transform.y) {
                const modelTurns = Math.round(Number(transform.y) / 90);
                quarterTurns = (quarterTurns + (face === 'up' ? 4-modelTurns : modelTurns) + 16) % 4;
            }
            for (let step = 0; step < quarterTurns; step++) uvs.unshift(uvs.pop());
            const quad = {
                face: faceAfterRotation(face, transform, element.rotation),
                vertices,
                uvs,
                ...(textureWidth !== 16 || textureHeight !== 16
                    ? {uvTextureSize:[textureWidth,textureHeight]} : {}),
                ...(materialSelector ? {materialInstance: materialSelector(elementIndex, face, definition)} : {}),
            };
            if (transform.campfireLit && elementIndex >= 5) {
                quad.doubleSided = true;
                // The crossed flame is a one-tile billboard, not a tiling log
                // face. Keep its no-repeat rule separate from the static base.
                quad.noTextureRepeat = true;
            }
            if (transform.lanternHandle && elementIndex >= 2) quad.doubleSided = true;
            if (!quad.materialInstance) delete quad.materialInstance;
            quads.push(quad);
        }
    }
    return quads;
}

function translateStates(name, bedrock = {}, originalName = name) {
    const value = (...names) => {
        for (const name of names) {
            if (Object.prototype.hasOwnProperty.call(bedrock, name)) return bedrock[name];
            if (Object.prototype.hasOwnProperty.call(bedrock, `minecraft:${name}`)) return bedrock[`minecraft:${name}`];
        }
        return undefined;
    };
    const flag = (...keys) => {
        const item = value(...keys);
        return item === true || item === 1 || item === 'true' || item === '1';
    };
    const values = {...bedrock};
    const direction = value('minecraft:cardinal_direction', 'cardinal_direction', 'facing');
    const legacyDirection = Number(value('direction'));
    // The four-valued Bedrock `direction` state is NOT universal. Doors use
    // east/south/west/north; trapdoor numeric states name their physical
    // occupied side, whereas Java `facing` names the swing direction.
    // Bed and other direction-based families retain south/west/north/east.
    const legacyCompass = originalName.endsWith('_trapdoor') || originalName === 'trapdoor'
        ? ['west','east','south','north']
        : originalName.endsWith('_door') || originalName === 'wooden_door'
            ? ['east','south','west','north']
            : ['south','west','north','east'];
    values.facing = typeof direction === 'string' ? direction.replace(/^minecraft:/,'')
        : Number.isInteger(legacyDirection) && legacyDirection >= 0 && legacyDirection <= 3
            ? legacyCompass[legacyDirection] : 'north';
    const directional = Number(value('facing_direction'));
    if (Number.isInteger(directional) && directional >= 2 && directional <= 5) {
        values.facing = {2:'north',3:'south',4:'west',5:'east'}[directional];
    }
    if (value('upper_block_bit', 'upper_block') !== undefined) values.half = flag('upper_block_bit','upper_block') ? 'upper' : 'lower';
    else if (value('upside_down_bit', 'top_slot_bit') !== undefined) values.half = flag('upside_down_bit','top_slot_bit') ? 'top' : 'bottom';
    else values.half = value('vertical_half') || (
        name.endsWith('_door') || /^(?:lilac|peony|rose_bush|sunflower|tall_grass|large_fern|pitcher_plant|small_dripleaf)$/.test(name)
            ? 'lower' : 'bottom');
    values.hinge = flag('door_hinge_bit') ? 'right' : 'left';
    values.open = flag('open_bit', 'open') ? 'true' : 'false';
    if (value('extinguished') !== undefined) values.lit = flag('extinguished') ? 'false' : 'true';
    else values.lit = flag('lit_bit','lit') ? 'true' : 'false';
    const count = value('candles', 'candle_count');
    values.candles = String(Math.max(1, Math.min(4, count === undefined ? 1 : Number(count) + 1)));
    const attachment = value('attachment');
    const attachmentName = attachment == null ? 'floor' : String(attachment).replace(/^minecraft:/, '');
    values.attachment = {standing:'floor',hanging:'ceiling',side:'single_wall',multiple:'double_wall'}[attachmentName]
        || attachmentName;
    const mount = value('face');
    values.face = mount == null ? 'floor' : String(mount).replace(/^minecraft:/, '');
    if (name === 'grindstone' && mount == null) {
        values.face = values.attachment === 'ceiling' ? 'ceiling'
            : ['single_wall','double_wall'].includes(values.attachment) ? 'wall' : 'floor';
    }
    values.hanging = flag('hanging') ? 'true' : 'false';
    values.attached = flag('attached_bit', 'attached') ? 'true' : 'false';
    values.part = flag('head_piece_bit') ? 'head' : 'foot';
    values.in_wall = flag('in_wall', 'in_wall_bit') ? 'true' : 'false';
    values.rotation = String(value('ground_sign_direction', 'rotation') ?? 0);
    values.waterlogged = flag('waterlogged', 'waterlogged_bit') ? 'true' : 'false';
    values.powered = originalName.startsWith('powered_') ? 'true'
        : originalName.startsWith('unpowered_') || originalName === 'unlit_redstone_torch' ? 'false'
        : value('output_lit_bit') !== undefined ? String(flag('output_lit_bit'))
        : originalName === 'redstone_torch' && value('lit_bit','lit') === undefined ? 'true'
        : String(flag('powered_bit','powered','lit_bit'));
    if (value('repeater_delay') !== undefined) {
        values.delay = String(Math.max(1, Math.min(4, 1 + Number(value('repeater_delay')))));
    }
    values.locked = String(flag('locked'));
    if (value('output_subtract_bit') !== undefined) {
        values.mode = flag('output_subtract_bit') ? 'subtract' : 'compare';
    }
    const lever = String(value('lever_direction') || '');
    if (lever.startsWith('up_') || lever.startsWith('down_')) {
        values.face = lever.startsWith('up_') ? 'floor' : 'ceiling';
        values.facing = lever.endsWith('east_west') ? 'east' : 'north';
    } else if (['north','south','west','east'].includes(lever)) {
        values.face = 'wall';
        values.facing = lever;
    }
    if (originalName === 'lever') values.powered = String(flag('open_bit'));
    values.vertical_direction = flag('hanging') ? 'down' : 'up';
    values.thickness = String(value('sulfur_spike_thickness','thickness') || 'base');
    if (value('growth','age') !== undefined) {
        const growth = Number(value('growth','age'));
        // Bedrock berry bushes expose eight growth values; Java's four render
        // stages group them in pairs (0–1, 2–3, 4–5, 6–7).
        values.age = name === 'sweet_berry_bush'
            ? String(Math.max(0,Math.min(3,Math.floor(growth / 2))))
            : String(value('growth','age'));
    }
    if (value('tip') !== undefined) values.tip = String(flag('tip'));
    const sculkPhase = value('sculk_sensor_phase');
    if (sculkPhase !== undefined) values.sculk_sensor_phase =
        typeof sculkPhase === 'number' || /^\d+$/.test(String(sculkPhase))
            ? (['inactive','active','cooldown'][Number(sculkPhase)] || 'inactive')
            : String(sculkPhase);
    if (value('can_summon') !== undefined) values.can_summon = String(flag('can_summon'));
    const torchFacing = value('torch_facing_direction');
    if (torchFacing != null && torchFacing !== 'top') values.facing = ({east:'west',west:'east'}[String(torchFacing)] || String(torchFacing));
    const axis = value('pillar_axis', 'axis');
    if (axis != null) values.axis = String(axis);
    return values;
}

function matchesWhen(when, states) {
    if (!when) return true;
    if (Array.isArray(when.OR)) return when.OR.some(entry => matchesWhen(entry, states));
    if (Array.isArray(when.AND)) return when.AND.every(entry => matchesWhen(entry, states));
    return Object.entries(when).every(([key, expected]) => String(expected).split('|').includes(String(states[key])));
}

function matchesVariant(key, states) {
    if (!key) return true;
    return key.split(',').every(pair => {
        const split = pair.indexOf('=');
        if (split < 0) return false;
        const actual = states[pair.slice(0,split)];
        return actual === undefined || String(actual) === pair.slice(split + 1);
    });
}

function materialToken(texture, textures) {
    let reference = texture;
    const visited = new Set();
    while (typeof reference === 'string' && reference.startsWith('#')) {
        const alias = reference.slice(1);
        if (visited.has(alias)) return null;
        visited.add(alias);
        reference = textures?.[alias];
    }
    if (reference && typeof reference === 'object') reference = reference.sprite || null;
    return typeof reference === 'string' ? `java:${reference}` : null;
}

function bellCube(from,size,baseUv) {
    const [x,y,z] = from, [w,h,d] = size, [u,v] = baseUv;
    return {from,to:[x+w,y+h,z+d],faces:{
        west:{uv:[u,v+d,u+d,v+d+h]},
        north:{uv:[u+d,v+d,u+d+w,v+d+h]},
        east:{uv:[u+d+w,v+d,u+d+w+d,v+d+h]},
        south:{uv:[u+d+w+d,v+d,u+d+w+d+w,v+d+h]},
        up:{uv:[u+d,v,u+d+w,v+d]},
        down:{uv:[u+d+w,v,u+d+w+w,v+d]},
    }};
}

class PrimitiveLibrary {
    constructor(root, jarOverride = null) {
        this.root = root;
        this.jar = jarOverride || getMinecraftJar();
        this.models = new Map();
        this.schemas = new Map();
        this.cache = new Map();
        this.faceTextureCache = new Map();
        this.primitiveFiles = new Map();
        if (!root) return; // Browser: JAR provides original models and states.
        for (const entry of fs.readdirSync(path.join(root, '01_PRIMITIVES'), {withFileTypes: true})) {
            if (!entry.isDirectory()) continue;
            for (const folder of fs.readdirSync(path.join(root, '01_PRIMITIVES', entry.name))) {
                const match = /^(p\d+)__/.exec(folder);
                if (match) this.primitiveFiles.set(match[1], path.join(root, '01_PRIMITIVES', entry.name, folder, 'model.json'));
            }
        }
        const schemaFiles = new Map();
        for (const entry of fs.readdirSync(path.join(root, '02_REUSABLE_STATE_SCHEMAS'), {withFileTypes: true})) {
            if (!entry.isDirectory()) continue;
            const match = /^(s\d+)__/.exec(entry.name);
            if (match) schemaFiles.set(match[1], path.join(root, '02_REUSABLE_STATE_SCHEMAS', entry.name, 'blockstate_template.json'));
        }
        for (const record of JSON.parse(fs.readFileSync(path.join(root, 'STATE_SCHEMA_CATALOG.json'), 'utf8'))) {
            const file = schemaFiles.get(record.id);
            if (file) for (const name of record.used_by || []) this.schemas.set(name, file);
        }
    }

    resolve(blockName, sourceStates = {}) {
        const originalName = String(blockName || '').replace(/^minecraft:/, '');
        const torchFacing = sourceStates.torch_facing_direction;
        const bedColors = ['white','orange','magenta','light_blue','yellow','lime','pink','gray',
            'light_gray','cyan','purple','blue','brown','green','red','black'];
        const bedColor = Math.floor(Number(sourceStates.bed_color ?? sourceStates.color ?? 14));
        // Bedrock's legacy block IDs are not always Java's blockstate IDs.
        // Keep the Bedrock block name on the resulting shape, but use the
        // matching authored Java model as a geometry/material reference.
        const bedrockToJava = {
            wooden_door: 'oak_door', trapdoor: 'oak_trapdoor', waterlily: 'lily_pad',
            powered_repeater: 'repeater', unpowered_repeater: 'repeater',
            powered_comparator: 'comparator', unpowered_comparator: 'comparator',
            stonecutter_block: 'stonecutter', deprecated_anvil: 'anvil',
            frog_spawn: 'frogspawn', reeds: 'sugar_cane',
            unlit_redstone_torch: 'redstone_torch',
            portal: 'nether_portal',
        };
        const name = originalName === 'bed'
            ? `${bedColors[bedColor] || 'red'}_bed`
            : originalName.endsWith('_hanging_sign') && sourceStates.hanging === true
            ? originalName.replace(/_hanging_sign$/,'_wall_hanging_sign')
            : originalName === 'torch' && torchFacing && torchFacing !== 'top'
            ? 'wall_torch'
            : (bedrockToJava[originalName] || originalName);
        const schemaPath = this.schemas.get(name);
        const jarState = this.jar?.blockstate(name) || null;
        if (!schemaPath && !jarState) return null;
        const states = translateStates(name, sourceStates, originalName);
        const signature = `${name}|${JSON.stringify(states)}`;
        if (this.cache.has(signature)) return this.cache.get(signature);
        let schema = jarState;
        if (!schema && schemaPath) {
            schema = this.models.get(schemaPath);
            if (!schema) {
                schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
                this.models.set(schemaPath, schema);
            }
        }
        let targets = [];
        if (schema.variants) {
            const variant = Object.entries(schema.variants).find(([rule]) => matchesVariant(rule, states));
            if (variant) targets = [Array.isArray(variant[1]) ? variant[1][0] : variant[1]];
        } else if (Array.isArray(schema.multipart)) {
            targets = schema.multipart.filter(part => matchesWhen(part.when, states))
                .map(part => Array.isArray(part.apply) ? part.apply[0] : part.apply);
        }
        if (!targets.length || targets.some(target => !target?.model)) {
            if (!this.jar?.isBrowserJar) this.cache.set(signature, null);
            return null;
        }
        const quads = [];
        for (const target of targets) {
            const id = /(p\d+)__/.exec(target.model)?.[1];
            const file = this.primitiveFiles.get(id);
            let model = id ? (file && this.models.get(file)) : this.jar?.model(target.model);
            if (!model && file) {
                model = JSON.parse(fs.readFileSync(file, 'utf8'));
                this.models.set(file,model);
            }
            if (!model) {
                if (!this.jar?.isBrowserJar) this.cache.set(signature, null);
                return null;
            }
            // Full-extent blocks, including grass with an additional overlay,
            // must stay on the optimized greedy-mesh path. Their face materials
            // are the Bedrock pack resolver's responsibility.
            if (model.elements?.some(element => !element.rotation
                && JSON.stringify(element.from) === '[0,0,0]'
                && JSON.stringify(element.to) === '[16,16,16]')) {
                if (!this.jar?.isBrowserJar) this.cache.set(signature,null);
                return null;
            }
            const isCampfire = originalName === 'campfire' || originalName === 'soul_campfire';
            const campfireLit = isCampfire && states.lit === 'true';
            const selector = (element, face, definition) => {
                if (!isCampfire) return materialToken(definition.texture,model.textures);
                // Vanilla defines the lit faces individually via #lit_log;
                // deducing them from element index/face paints the wrong parts
                // of the crossed logs. Prefer the resolved per-face material.
                const authentic = materialToken(definition.texture,model.textures)
                    ?.replace(/^java:(?:minecraft:)?block\//,'');
                if (/^(?:soul_)?campfire_(?:log|log_lit|fire)$/.test(authentic || '')) {
                    return authentic;
                }
                const soul = originalName === 'soul_campfire';
                if (element >= 5) return soul ? 'soul_campfire_fire' : 'campfire_fire';
                if (campfireLit && ((element <= 3 && (face === 'up' || face === 'north'))
                    || (element === 4 && face === 'up'))) {
                    return soul ? 'soul_campfire_log_lit' : 'campfire_log_lit';
                }
                return 'campfire_log';
            };
            quads.push(...modelQuads(model, {...target, campfireLit,
                lanternHandle: /lantern$/.test(originalName)}, selector));
        }
        // Bell supports are block models; the bell itself is a separately
        // rendered block entity. Include its locally supplied fixed pose.
        if (originalName === 'bell') {
            // Same 32x32 box-UV layout as bell_body_26.2.geo.json from the
            // user's dynamic-entity reference directory. The bell is static
            // here (animation still needs a block-entity renderer).
            const body = {uvWidth:32,uvHeight:32,elements:[
                bellCube([5,6,5],[6,7,6],[0,0]),
                bellCube([4,4,4],[8,2,8],[0,13]),
            ]};
            quads.push(...modelQuads(body,{},()=> 'java:minecraft:entity/bell/bell_body'));
        }
        // Java provides distinct up/down models and textures for sulfur
        // spikes. Never reflect an already-oriented model a second time.
        const key = originalName === 'bed' ? 'bed'
            : originalName === 'soul_campfire' ? 'campfire'
            : originalName === 'torch' && torchFacing && torchFacing !== 'top' ? `torch_wall_${torchFacing}`
                : originalName.endsWith('_fence_gate') && states.open === 'true' ? 'fence_gate_open' : originalName;
        if (!quads.length) {
            if (!this.jar?.isBrowserJar) this.cache.set(signature,null);
            return null;
        }
        const hasUnmodeledMotion = originalName === 'bell';
        const result = {key,
            boxes: [], quads, occludes: false, approximate: hasUnmodeledMotion, source: 'builtin'};
        this.cache.set(signature, result);
        return result;
    }

    referenceFaceTexture(blockName, sourceStates = {}, face = 'north') {
        if (!this.jar) return null;
        const name = String(blockName || '').replace(/^minecraft:/,'');
        const signature = `${name}|${JSON.stringify(sourceStates)}|${face}`;
        if (this.faceTextureCache.has(signature)) return this.faceTextureCache.get(signature);
        const schema = this.jar.blockstate(name);
        const states = translateStates(name,sourceStates);
        let targets = [];
        if (schema?.variants) {
            const matched = Object.entries(schema.variants).find(([rule])=>matchesVariant(rule,states));
            if (matched) targets = [Array.isArray(matched[1]) ? matched[1][0] : matched[1]];
        } else if (schema?.multipart) {
            targets = schema.multipart.filter(part=>matchesWhen(part.when,states))
                .map(part=>Array.isArray(part.apply) ? part.apply[0] : part.apply);
            // Bedrock exposes wall connections with different property names.
            // If none of its Java multipart conditions matched, a vanilla
            // model still provides the correct material reference for every
            // post/side piece, without modifying the Bedrock geometry.
            if (!targets.length && schema.multipart.length) {
                const sample = schema.multipart[0].apply;
                targets = [Array.isArray(sample) ? sample[0] : sample];
            }
        }
        let token = null;
        for (const target of targets) {
            const model = target?.model ? this.jar.model(target.model) : null;
            if (!model) continue;
            const element = (model.elements || []).find(candidate=>candidate.faces?.[face])
                || (model.elements || []).find(candidate=>Object.keys(candidate.faces||{}).length);
            const candidate = element?.faces?.[face] || Object.values(element?.faces||{})[0];
            token = materialToken(candidate?.texture,model.textures)
                || materialToken(model.textures?.[face],model.textures)
                || materialToken(model.textures?.particle,model.textures);
            if (token) break;
        }
        if (!this.jar.isBrowserJar || token) this.faceTextureCache.set(signature,token);
        return token;
    }
}

let cachedLibrary;
function setBrowserJar(jar) {
    cachedLibrary = jar ? new PrimitiveLibrary(null,jar) : null;
    return cachedLibrary;
}
function getLibrary() {
    if (cachedLibrary !== undefined) return cachedLibrary;
    if (!fs) return null;
    const root = (typeof process !== 'undefined' ? process.env?.LIGHTFLOW_PRIMITIVE_LIBRARY : null)
        || path.join(os.homedir(), 'Minecraft', 'Extras', 'Minecraft_26.2_Primitive_Model_Library');
    try {
        cachedLibrary = fs.existsSync(path.join(root, 'MANIFEST.json')) ? new PrimitiveLibrary(root) : null;
    } catch (error) {
        cachedLibrary = null;
    }
    return cachedLibrary;
}

module.exports = {PrimitiveLibrary, getLibrary, setBrowserJar, modelQuads, translateStates, implicitFaceUv};
