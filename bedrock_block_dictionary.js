'use strict';

// Lightflow Terrain / Bedrock Structure Studio block dictionary.
// Edit BLOCK_TAGS and BLOCK_RULES here; the bundled plugin uses this same file.
// A rule can match exact IDs, RegExp patterns, tags, and block states. Later
// rules override earlier fields; matching permutations apply in declaration order.
// An omitted field leaves the vanilla/resource-pack resolution untouched.
const BedrockBlockDictionary = (() => {
    const catalog = typeof BedrockBlockCatalogEmbedded !== 'undefined' ? BedrockBlockCatalogEmbedded
        : typeof require === 'function' ? require('./bedrock_block_catalog.js') : null;
    const BLOCK_TAGS = {
        'lightflow:slabs': [/_slab$/],
        'lightflow:stairs': [/_stairs$/],
        'lightflow:logs': [/(?:_log|_wood|_stem|_hyphae|_pillar)$/],
        'lightflow:ground_placed': [/_rail$/, /(?:^|_)(?:rail|carpet|pressure_plate)$/],
        'lightflow:wall_placed': [/(?:ladder|wall_sign|wall_banner)$/],
        'lightflow:torches': [/(?:^|_)torch$/],
        'lightflow:doors': [/^minecraft:(?:wooden_door|\w+_door)$/],
        'lightflow:trapdoors': [/^minecraft:(?:trapdoor|\w+_trapdoor)$/],
        'lightflow:fences': [/^minecraft:\w+_fence$/],
        'lightflow:walls': [/^minecraft:\w+_wall$/],
        'lightflow:panes': [/^minecraft:(?:glass_pane|\w+_glass_pane|iron_bars)$/],
    };

    const BLOCK_RULES = [
        // Bedrock draws these block items as flat sprites, using carried_textures
        // when supplied by the pack. World geometry remains independent.
        {id:'vanilla_item_sprites', match:{pattern:/^minecraft:(?:(?:(?:soul|redstone|unlit_redstone)_)?torch|(?:(?:golden|detector|activator)_)?rail|ladder|vine|pink_petals|waterlily|bamboo|(?:\w+_)?lantern|(?:\w+_)?candle|(?:\w+_)?chain|bell|redstone_wire)$/},
            inventory:{render:'sprite'}},
        {id:'repeater_item',match:{id:['minecraft:unpowered_repeater','minecraft:powered_repeater']},inventory:{item:'minecraft:repeater'}},
        {id:'comparator_item',match:{id:['minecraft:unpowered_comparator','minecraft:powered_comparator']},inventory:{item:'minecraft:comparator'}},
        {id:'redstone_item',match:{id:'minecraft:redstone_wire'},inventory:{item:'minecraft:redstone'}},
        {id:'rail_item',match:{id:'minecraft:rail'},inventory:{icon:'rail_normal'}},
        {id: 'ground_placement', match: {tag: 'lightflow:ground_placed'}, placement: {allowedFaces: ['up']}},
        {id: 'wall_placement', match: {tag: 'lightflow:wall_placed'}, placement: {allowedFaces: ['north', 'south', 'east', 'west']}},
        {id: 'torch_placement', match: {tag: 'lightflow:torches'}, placement: {allowedFaces: ['up', 'north', 'south', 'east', 'west']}},
        // Example of a custom block (uncomment and adapt the id to activate):
        // {id: 'custom_lamp', match: {id: 'demo:lamp'},
        //  model: {boxes: [[2, 0, 2, 14, 12, 14]], occludes: false},
        //  appearance: {textures: {all: 'textures/blocks/glowstone'}, renderLayer: 'solid'},
        //  placement: {allowedFaces: ['up'], states: {'minecraft:cardinal_direction': '$playerFacing'}},
        //  permutations: [
        //      {when: {states: {lit: true}}, appearance: {textures: {all: 'glowstone'}}},
        //  ]},
        // For native models: model: {shape: 'stairs'} or
        // model: {reference: 'minecraft:oak_stairs'}.
        // For installed Java textures: appearance: {textures: {all: 'java:block/oak_planks'}}.
    ];

    const rules = BLOCK_RULES.slice();
    const listeners = new Set();
    let revision = 0;
    function notify() {
        revision++;
        for (const callback of listeners) callback(revision);
    }
    function normalizeId(id) {
        const name = String(id || '').toLowerCase();
        return name.includes(':') ? name : 'minecraft:' + name;
    }
    function testPattern(pattern, blockId, visited = new Set()) {
        if (Array.isArray(pattern)) return pattern.some(item => testPattern(item, blockId, visited));
        if (pattern instanceof RegExp) {
            pattern.lastIndex = 0;
            return pattern.test(blockId) || (!blockId.startsWith('minecraft:') ? false :
                (pattern.lastIndex = 0, pattern.test(blockId.slice('minecraft:'.length))));
        }
        if (typeof pattern === 'function') return Boolean(pattern(blockId));
        if (typeof pattern !== 'string') return false;
        if (pattern.startsWith('#')) return hasTag(blockId, pattern.slice(1), {}, visited);
        const normalized = normalizeId(pattern);
        if (normalized.includes('*')) {
            const regex = new RegExp('^' + normalized.split('*').map(part =>
                part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
            return regex.test(blockId);
        }
        return blockId === normalized;
    }
    function hasTag(blockId, tag, states = {}, visited = new Set()) {
        const key = String(tag).replace(/^#/, '');
        if (visited.has(key)) return false;
        const next = new Set(visited).add(key);
        const contents = Object.hasOwn(BLOCK_TAGS, key) ? BLOCK_TAGS[key] : null;
        if (contents) return testPattern(contents, normalizeId(blockId), next);
        // Explicit vanilla membership, never infer Minecraft tags from suffixes.
        if (catalog?.blockTags?.[normalizeId(blockId)]?.includes(key)) return true;
        // Tags declared by a rule may vary by state. Do not recursively resolve
        // tag-matching rules here: they consume tags, they do not define them.
        let tags = [];
        for (const rule of rules) {
            if (rule.match?.tag || !matches(rule.match, normalizeId(blockId), states)) continue;
            if (rule.tags) tags = rule.tags;
            for (const permutation of rule.permutations || []) {
                if (permutation.tags && !permutation.when?.tag && matches(permutation.when, normalizeId(blockId), states)) tags = permutation.tags;
            }
        }
        return tags.includes(key);
    }
    function tagsFor(block, states = {}) {
        const candidates = new Set([...(catalog?.blockTags?.[normalizeId(block)] || []), ...Object.keys(BLOCK_TAGS)]);
        for (const rule of rules) {
            for (const tag of rule.tags || []) candidates.add(tag);
            for (const permutation of rule.permutations || []) for (const tag of permutation.tags || []) candidates.add(tag);
        }
        return [...candidates].filter(tag => hasTag(block, tag, states));
    }
    function itemInfo(item) {
        const id = normalizeId(item);
        return {id, tags: [...(catalog?.itemTags?.[id] || [])], ...(catalog?.itemGroups?.[id] || {})};
    }
    function stateValue(states, key) {
        const plain = String(key).replace(/^minecraft:/, '');
        return Object.entries(states || {}).find(([candidate]) =>
            candidate.replace(/^minecraft:/, '') === plain)?.[1];
    }
    function matchesStates(expected, states) {
        return Object.entries(expected || {}).every(([key, value]) => {
            const actual = stateValue(states, key);
            if (value instanceof RegExp) { value.lastIndex = 0; return value.test(String(actual)); }
            if (Array.isArray(value)) return value.includes(actual);
            return actual === value;
        });
    }
    function matches(match, blockId, states) {
        if (!match) return false;
        if (typeof match === 'string' || match instanceof RegExp || Array.isArray(match)) {
            return testPattern(match, blockId);
        }
        if (match.id != null && !testPattern(match.id, blockId)) return false;
        if (match.pattern != null && !testPattern(match.pattern, blockId)) return false;
        if (match.tag != null && ![].concat(match.tag).some(tag => hasTag(blockId, tag, states))) return false;
        if (match.states && !matchesStates(match.states, states)) return false;
        if (typeof match.when === 'function' && !match.when({block: blockId, states})) return false;
        return match.id != null || match.pattern != null || match.tag != null
            || match.states != null || typeof match.when === 'function';
    }
    function merge(base, patch) {
        if (!patch || typeof patch !== 'object') return base;
        const result = {...base};
        for (const [key, value] of Object.entries(patch)) {
            if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
            // A permutation selects one complete model/texture map. Combining
            // the old boxes with a new shape, or old face slots with an 'all'
            // texture, would leave the previous appearance partially active.
            if (key !== 'model' && key !== 'textures'
                && value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof RegExp)) {
                result[key] = merge(base[key] && typeof base[key] === 'object' ? base[key] : {}, value);
            } else result[key] = value;
        }
        return result;
    }
    function fields(source) {
        return Object.fromEntries(['model', 'appearance', 'placement', 'inventory', 'states', 'tags']
            .filter(key => source[key] !== undefined).map(key => [key, source[key]]));
    }
    function resolve(block, states = {}) {
        const id = normalizeId(block);
        let result = null;
        for (const rule of rules) {
            if (!matches(rule.match, id, states)) continue;
            result = merge(result || {}, fields(rule));
            for (const permutation of rule.permutations || []) {
                if (matches(permutation.when, id, states)) result = merge(result, fields(permutation));
            }
        }
        return result;
    }
    function faceTexture(block, states, face) {
        const textures = resolve(block, states)?.appearance?.textures;
        if (typeof textures === 'string') return textures;
        if (!textures || typeof textures !== 'object') return null;
        const axis = stateValue(states, 'pillar_axis') || 'y';
        const end = axis === 'x' ? ['east','west'].includes(face)
            : axis === 'z' ? ['north','south'].includes(face) : ['up','down'].includes(face);
        return textures[face] || (end ? textures.end : null)
            || (['north','south','east','west'].includes(face) ? textures.side : null)
            || textures.all || null;
    }
    function inventoryInfo(block, states = {}) {
        const info = resolve(block, states)?.inventory || {};
        const item = itemInfo(info.item || block);
        return {...item, ...info, block: normalizeId(block), blockTags: tagsFor(block, states),
            itemTags: [...(info.itemTags || item.tags)]};
    }
    function defaultStates(block) {
        const schema = resolve(block)?.states || {};
        return Object.fromEntries(Object.entries(schema).map(([key, values]) => [key,
            Array.isArray(values) ? values[0] : values?.min]).filter(([, value]) => value !== undefined));
    }
    // Domains are global to a property; they are not block-specific restrictions.
    function vanillaStateSchema(block, key) {
        const reference = catalog?.blockStates;
        const names = reference?.blocks?.[normalizeId(block)];
        if (!names?.includes(key)) return null;
        return reference.properties[key] || null;
    }
    const permutations = catalog?.blockPermutations;
    const variantCache = new Map();
    const domainCache = new Map();
    // The first palette tuple is the canonical editor baseline. Read it directly:
    // materializing every permutation just to display a stateful block is expensive.
    function vanillaDefaultStates(block) {
        const id = normalizeId(block);
        const entry = permutations?.blocks?.[id];
        if (!entry) return {};
        const [keys, rows] = entry;
        return Object.fromEntries(keys.map((key, index) => [key, rows[0]?.[index]]));
    }
    function vanillaVariants(block) {
        const id = normalizeId(block);
        if (!Object.hasOwn(permutations?.blocks || {}, id)) return [];
        if (!variantCache.has(id)) {
            const [keys, rows] = permutations.blocks[id];
            variantCache.set(id, Object.freeze(rows.map(row => Object.freeze({
                statesJson: JSON.stringify(Object.fromEntries(keys.map((key, i) => [key, row[i]]))),
                version: permutations.metadata.blockVersion,
                count: 0,
                exactPermutation: true,
            }))));
        }
        return variantCache.get(id);
    }
    function vanillaStateValues(block, key) {
        const id = normalizeId(block);
        if (!Object.hasOwn(permutations?.blocks || {}, id)) return null;
        const [keys, rows] = permutations.blocks[id];
        const index = keys.indexOf(key);
        if (index < 0) return null;
        const cacheKey = id + '/' + key;
        if (!domainCache.has(cacheKey)) {
            domainCache.set(cacheKey, Object.freeze([...new Set(rows.map(row => row[index]))]));
        }
        return domainCache.get(cacheKey);
    }
    function placementStates(block, states, context) {
        const placement = resolve(block, states)?.placement;
        const result = {};
        const direction = placement?.traits?.['minecraft:placement_direction'];
        const position = placement?.traits?.['minecraft:placement_position'];
        const horizontal = ['north', 'east', 'south', 'west'];
        for (const key of direction?.enabled_states || []) {
            if (key === 'minecraft:cardinal_direction') {
                const offset = Number(direction.y_rotation_offset || 0);
                if (!Number.isFinite(offset) || offset % 90) throw new TypeError('Placement rotation must be axis aligned.');
                const index = horizontal.indexOf(context.playerFacing);
                result[key] = horizontal[((index + offset / 90) % 4 + 4) % 4];
            } else if (key === 'minecraft:facing_direction') result[key] = context.playerFacing6;
        }
        for (const key of position?.enabled_states || []) {
            if (key === 'minecraft:block_face') result[key] = context.face;
            if (key === 'minecraft:vertical_half') result[key] = context.half;
        }
        for (const [key, value] of Object.entries(placement?.states || {})) {
            result[key] = typeof value === 'string' && value.startsWith('$') && Object.hasOwn(context, value.slice(1))
                ? context[value.slice(1)] : value;
        }
        return result;
    }
    function canPlace(block, states, face, support) {
        const placement = resolve(block, states)?.placement;
        if (!placement) return null;
        if (Array.isArray(placement.allowedFaces) && !placement.allowedFaces.includes(face)) return false;
        if (Array.isArray(placement.conditions)) return placement.conditions.some(condition => {
            if (condition.allowedFaces && !condition.allowedFaces.includes(face)) return false;
            if (!condition.blockFilter) return true;
            if (!support) return false;
            return condition.blockFilter.some(filter => matches(typeof filter === 'string' ? {id: filter} : filter,
                normalizeId(support.block), support.states || {}));
        });
        return Array.isArray(placement.allowedFaces) ? true : null;
    }
    function registerRule(rule) {
        if (!rule || typeof rule.id !== 'string' || !rule.id || !rule.match) {
            throw new TypeError('A block rule requires id and match.');
        }
        const index = rules.findIndex(item => item.id === rule.id);
        const previous = index >= 0 ? rules.splice(index, 1)[0] : null;
        rules.push(rule);
        notify();
        return () => {
            const at = rules.indexOf(rule);
            if (at >= 0) {
                rules.splice(at, 1);
                if (previous) rules.splice(Math.min(index, rules.length), 0, previous);
                notify();
            }
        };
    }
    function defineTag(tag, matchers) {
        if (!tag || !Array.isArray(matchers)) throw new TypeError('A tag needs an id and matchers array.');
        tag = String(tag).replace(/^#/, '');
        if (['__proto__', 'constructor', 'prototype'].includes(tag)) throw new TypeError('Invalid tag id.');
        const previous = BLOCK_TAGS[tag];
        BLOCK_TAGS[tag] = matchers.slice();
        notify();
        return () => {
            if (previous === undefined) delete BLOCK_TAGS[tag];
            else BLOCK_TAGS[tag] = previous;
            notify();
        };
    }
    return Object.freeze({
        BLOCK_TAGS, BLOCK_RULES, rules, resolve, faceTexture, hasTag, tagsFor,
        itemInfo, inventoryInfo, defaultStates, vanillaDefaultStates, vanillaStateSchema, vanillaVariants, vanillaStateValues, placementStates, canPlace,
        vanillaBlockIds: Object.freeze(Object.keys(permutations?.blocks || {})),
        catalogRevision: catalog?.revision,
        matches, registerRule, defineTag, onChange(callback) {
            listeners.add(callback);
            return () => listeners.delete(callback);
        },
        get revision() { return revision; },
    });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = BedrockBlockDictionary;
