'use strict';

// Declarative voxel planning. The host owns the snapshot, block catalog and transaction.
const BedrockWorldBrush = (() => {
    const FORMAT = 'lightflow.world-brush';
    const LIMIT = 65536;
    const MAX_FILE = 512 * 1024;
    const DIRECTIONS = Object.freeze({
        above: [0, 1, 0], below: [0, -1, 0], north: [0, 0, -1],
        south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0]
    });
    const SHAPES = ['disc', 'box', 'sphere', 'cylinder', 'ellipsoid', 'band', 'irregular', 'stamp', 'connected'];
    const FIELDS = ['uniform', 'white', 'perlin', 'fbm', 'gaussian', 'gaussianRandom', 'cellular', 'voronoi',
        'warp', 'distance', 'directional', 'poisson', 'patches', 'edge', 'surface', 'context',
        'multiply', 'add', 'mix', 'invert', 'threshold', 'remap', 'power'];
    const CONTEXTS = ['height', 'exposure', 'concavity', 'occlusion', 'waterDistance', 'humidity', 'depth', 'normal',
        'slope', 'temperature', 'biome'];
    const TRAITS = ['solid', 'nonSolid', 'liquid', 'vegetation', 'transparent', 'requiresSupport', 'unknown'];
    const OPERATORS = ['is', 'isNot', 'in', 'exists', 'missing', 'trait', 'hasState', 'stateEquals', 'stateRange',
        'chance', 'contextRange', 'contextIs', 'tagged', 'and', 'or', 'not'];
    const QUERIES = ['current', ...Object.keys(DIRECTIONS), 'neighbors', 'horizontal', 'vertical', 'radius', 'box', 'offset'];
    const METRICS = ['euclidean', 'manhattan', 'chebyshev', 'horizontal', 'vertical'];
    const RELATIONS = ['attract', 'repel', 'group', 'depend', 'exclude', 'transform', 'connect', 'separate', 'align', 'gradient'];
    const ACTIONS = ['replace', 'remove', 'place', 'states', 'palette', 'decorate', 'rule', 'tag'];
    const MODES = ['surface', 'volume', 'replace', 'decorate', 'rules'];
    const POLICIES = ['world', 'stroke', 'fixed', 'additive', 'evolve'];
    const ORIENTATIONS = ['fixed', 'random', 'surface', 'stroke', 'vector', 'neighbor'];
    // A compact, intentionally diverse default gallery. The complete built-in
    // library remains available for saved projects and existing preset IDs.
    const FEATURED_BUILTIN_IDS = Object.freeze([
        'builtin:dirt-gravel', 'builtin:muddy-ground', 'builtin:rocky-surface',
        'builtin:organic-stone', 'builtin:layered-terrain', 'builtin:path-flow',
        'builtin:wildflowers', 'builtin:moss', 'builtin:sparse-vegetation',
        'builtin:woodland-edge', 'builtin:grass-maintenance',
        'builtin:orientation', 'builtin:aging'
    ]);
    const key = p => p.join(',');
    const add = (p, q) => p.map((n, i) => n + q[i]);
    const sub = (p, q) => p.map((n, i) => n - q[i]);
    const clamp = n => Math.max(0, Math.min(1, n));
    const lerp = (a, b, t) => a + (b - a) * t;
    const distance = (a, b, metric = 'euclidean') => {
        const [x, y, z] = sub(a, b).map(Math.abs);
        switch (metric) {
            case 'manhattan': return x + y + z;
            case 'chebyshev': return Math.max(x, y, z);
            case 'horizontal': return Math.hypot(x, z);
            case 'vertical': return y;
            default: return Math.hypot(x, y, z);
        }
    };

    function fail(path, message) { throw new TypeError(`${path}: ${message}`); }
    function object(value, fields, path) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
        for (const name of Object.keys(value)) if (!fields.includes(name)) fail(path, 'unknown property ' + name);
        return value;
    }
    function list(value, max, path, parse, min = 0) {
        if (!Array.isArray(value) || value.length < min || value.length > max) fail(path, `expected ${min}–${max} entries`);
        return value.map((entry, i) => parse(entry, `${path}[${i}]`));
    }
    function number(value, min, max, path, integer = false) {
        if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
            fail(path, `expected ${integer ? 'an integer' : 'a number'} from ${min} to ${max}`);
        }
        return value;
    }
    function choice(value, choices, path) {
        if (!choices.includes(value)) fail(path, 'unsupported value ' + String(value).slice(0, 60));
        return value;
    }
    function string(value, max, path, empty = false) {
        if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail(path, 'invalid text');
        return value.trim();
    }
    function token(value, path) {
        if (typeof value !== 'string' || !/^[a-zA-Z0-9_][a-zA-Z0-9_.:-]{0,127}$/.test(value)
            || ['__proto__', 'constructor', 'prototype'].includes(value)) fail(path, 'invalid identifier');
        return value;
    }
    function block(value, path) {
        value = token(value, path);
        if (!/^(?:[a-z0-9_.-]+:)?[a-z0-9_][a-z0-9_.-]*$/.test(value)) fail(path, 'invalid block identifier');
        return value.includes(':') ? value : 'minecraft:' + value;
    }
    function stateValue(value, path) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return number(value, -2147483648, 2147483647, path, true);
        if (typeof value !== 'string' || value.length > 256) fail(path, 'invalid block state');
        return value;
    }
    function states(value, path) {
        if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 64) fail(path, 'invalid block states');
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [token(k, path), stateValue(v, path + '.' + k)]));
    }
    function bool(value, path) {
        if (typeof value !== 'boolean') fail(path, 'expected a boolean');
        return value;
    }
    function vector(value, path, bound = 2147483000) {
        return list(value, 3, path, (n, p) => number(n, -bound, bound, p, true), 3);
    }
    function range(value, path, min, max) {
        const pair = list(value, 2, path, (n, p) => number(n, min, max, p), 2);
        if (pair[0] > pair[1]) fail(path, 'range must be ordered');
        return pair;
    }
    function checkTree(value, path = 'recipe', depth = 0, budget = {nodes: 16000, chars: MAX_FILE}) {
        if (--budget.nodes < 0 || depth > 24) fail(path, 'data is too deeply nested or too large');
        if (typeof value === 'string' && (budget.chars -= value.length) < 0) fail(path, 'text budget exceeded');
        if (value && typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) {
                if (['__proto__', 'constructor', 'prototype'].includes(k)) fail(path, 'unsafe property');
                checkTree(v, path, depth + 1, budget);
            }
        }
    }
    function condition(value, path, depth = 0) {
        if (depth > 6) fail(path, 'condition nesting exceeds six levels');
        const v = object(value, ['op', 'query', 'value', 'state', 'children', 'radius', 'metric', 'offset', 'count', 'quantifier'], path);
        const op = choice(v.op, OPERATORS, path + '.op');
        if (op === 'and' || op === 'or' || op === 'not') return {op, children: list(v.children, op === 'not' ? 1 : 12, path,
            (child, p) => condition(child, p, depth + 1), 1)};
        const query = choice(v.query ?? 'current', QUERIES, path + '.query');
        const result = {op, query};
        if (query === 'radius' || query === 'box') result.radius = number(v.radius ?? 1, 1, 8, path + '.radius', true);
        if (query === 'radius') result.metric = choice(v.metric ?? 'euclidean', METRICS, path + '.metric');
        if (query === 'offset') result.offset = vector(v.offset, path + '.offset', 32);
        if (['radius', 'box', 'neighbors', 'horizontal', 'vertical'].includes(query)) {
            result.quantifier = choice(v.quantifier ?? 'atLeast', ['atLeast', 'exactly', 'fraction'], path);
            result.count = result.quantifier === 'fraction' ? number(v.count ?? .5, 0, 1, path)
                : number(v.count ?? 1, 0, 4912, path, true);
        }
        if (op === 'is' || op === 'isNot') result.value = block(v.value, path);
        if (op === 'in') result.value = list(v.value, 128, path, block, 1);
        if (op === 'trait') result.value = choice(v.value, TRAITS, path);
        if (op.startsWith('state') || op === 'hasState' || op.startsWith('context')) result.state = op.startsWith('context')
            ? choice(v.state, CONTEXTS, path) : token(v.state, path);
        if (op === 'stateEquals' || op === 'contextIs') result.value = stateValue(v.value, path);
        if (op === 'tagged') result.value = token(v.value, path);
        if (op === 'stateRange' || op === 'contextRange') result.value = range(v.value, path, -2147483000, 2147483000);
        if (op === 'chance') result.value = number(v.value, 0, 1, path);
        return result;
    }
    function field(value, path, depth = 0) {
        if (depth > 5) fail(path, 'field nesting exceeds five levels');
        const v = object(value, ['type', 'scale', 'octaves', 'strength', 'inputs', 'value', 'range', 'output',
            'axis', 'minRadius', 'maxRadius', 'spacing', 'chance', 'shape', 'context'], path);
        const type = choice(v.type, FIELDS, path + '.type');
        const f = {type};
        if (['perlin', 'fbm', 'cellular', 'voronoi', 'directional', 'warp', 'patches', 'poisson'].includes(type)) {
            f.scale = number(v.scale ?? 8, 1, 256, path + '.scale');
        }
        if (type === 'fbm') f.octaves = number(v.octaves ?? 4, 1, 6, path + '.octaves', true);
        if (['warp', 'gaussian', 'gaussianRandom', 'patches', 'directional'].includes(type)) {
            f.strength = number(v.strength ?? (type === 'warp' ? 4 : type === 'directional' ? 3 : .4), .01, type === 'warp' ? 32 : 8, path + '.strength');
        }
        if (type === 'directional') f.axis = choice(v.axis ?? 0, [0, 1, 2], path + '.axis');
        if (type === 'patches') {
            f.minRadius = number(v.minRadius ?? 2, 1, 24, path + '.minRadius');
            f.maxRadius = number(v.maxRadius ?? 5, f.minRadius, 32, path + '.maxRadius');
            f.chance = number(v.chance ?? .8, 0, 1, path + '.chance');
            f.shape = choice(v.shape ?? 'organic', ['round', 'square', 'ellipse', 'organic'], path + '.shape');
            if (f.maxRadius * (1 + f.strength / 2) / f.scale > 8) fail(path, 'increase scale or reduce patch radius and distortion');
        }
        if (type === 'poisson') f.spacing = number(v.spacing ?? 3, 1, 16, path + '.spacing');
        if (type === 'context') f.context = choice(v.context, CONTEXTS, path + '.context');
        if (['context', 'remap'].includes(type)) {
            f.range = range(v.range ?? [0, 1], path + '.range', -2147483000, 2147483000);
            f.output = list(v.output ?? [0, 1], 2, path, (n, p) => number(n, 0, 1, p), 2);
        }
        const inputs = {multiply: [2, 8], add: [2, 8], mix: [2, 3], warp: [1, 1], invert: [1, 1],
            threshold: [1, 1], remap: [1, 1], power: [1, 1]}[type];
        if (inputs) f.inputs = list(v.inputs, inputs[1], path + '.inputs', (child, p) => field(child, p, depth + 1), inputs[0]);
        if (['uniform', 'mix', 'threshold', 'power'].includes(type)) f.value = number(v.value ?? (type === 'uniform' ? 1 : .5),
            type === 'power' ? .01 : 0, type === 'power' ? 12 : 1, path + '.value');
        return f;
    }
    function paletteEntry(value, path) {
        const v = object(value, ['block', 'states', 'variants', 'weight', 'probability', 'priority', 'group', 'enabled',
            'locked', 'orientation', 'vector', 'when'], path);
        const result = {
            block: block(v.block, path), states: states(v.states ?? {}, path),
            variants: list(v.variants ?? [], 32, path, states),
            weight: number(v.weight ?? 1, 0, 1000000, path), probability: number(v.probability ?? 1, 0, 1, path),
            priority: number(v.priority ?? 0, -1000, 1000, path, true), group: string(v.group ?? '', 80, path, true),
            enabled: bool(v.enabled ?? true, path), locked: bool(v.locked ?? false, path),
            orientation: choice(v.orientation ?? 'fixed', ORIENTATIONS, path)
        };
        if (result.orientation === 'vector') result.vector = vector(v.vector ?? [1, 0, 0], path, 32);
        if (v.when !== undefined) result.when = condition(v.when, path);
        return result;
    }
    function relation(value, path) {
        const v = object(value, ['type', 'subject', 'target', 'radius', 'metric', 'strength', 'scope', 'output'], path);
        const type = choice(v.type, RELATIONS, path);
        const result = {type, subject: block(v.subject, path), target: block(v.target, path),
            radius: number(v.radius ?? 3, 1, 12, path, true), metric: choice(v.metric ?? 'euclidean', METRICS, path),
            strength: number(v.strength ?? 1, 0, 16, path), scope: choice(v.scope ?? 'terrain', ['terrain', 'proposals'], path)};
        if (type === 'transform') result.output = block(v.output, path);
        if (result.scope === 'proposals' && !['exclude', 'separate'].includes(type)) fail(path, 'proposal scope is available for exclude and separate');
        return result;
    }
    function rule(value, path) {
        const v = object(value, ['id', 'enabled', 'phase', 'priority', 'when', 'action'], path);
        const a = object(v.action, ['type', 'block', 'states', 'offset', 'rule', 'tag'], path + '.action');
        const type = choice(a.type, ACTIONS, path);
        const action = {type, offset: vector(a.offset ?? (type === 'decorate' ? [0, 1, 0] : [0, 0, 0]), path, 8)};
        if (['replace', 'place', 'decorate'].includes(type)) action.block = block(a.block, path);
        if (['replace', 'place', 'decorate', 'states'].includes(type)) action.states = states(a.states ?? {}, path);
        if (type === 'rule') action.rule = token(a.rule, path);
        if (type === 'tag') action.tag = token(a.tag, path);
        return {id: token(v.id, path), enabled: bool(v.enabled ?? true, path), phase: number(v.phase ?? 0, 0, 15, path, true),
            priority: number(v.priority ?? 0, -1000, 1000, path, true), when: condition(v.when, path), action};
    }
    function shape(value, path) {
        const v = object(value, ['type', 'radius', 'depth', 'height', 'width', 'rotation', 'falloff', 'hardness',
            'spacing', 'orientation', 'axes', 'variation', 'symmetry', 'cells'], path);
        const radius = number(v.radius ?? 4, 1, 32, path, true);
        const result = {type: choice(v.type ?? 'disc', SHAPES, path), radius,
            width: number(v.width ?? radius, 1, 32, path, true), height: number(v.height ?? radius, 1, 32, path, true),
            depth: number(v.depth ?? 1, 1, 32, path, true), rotation: number(v.rotation ?? 0, -360, 360, path),
            falloff: number(v.falloff ?? 0, 0, 1, path), hardness: number(v.hardness ?? 0, 0, 1, path),
            spacing: number(v.spacing ?? 1, .5, 32, path),
            orientation: choice(v.orientation ?? 'world', ['world', 'surface', 'stroke'], path),
            axes: list(v.axes ?? [true, true, true], 3, path, bool, 3),
            variation: number(v.variation ?? 0, 0, .75, path)};
        if (v.symmetry !== undefined) result.symmetry = vector(v.symmetry, path);
        if (result.type === 'stamp') result.cells = list(v.cells, 4096, path, (p, where) => vector(p, where, 32), 1);
        return result;
    }
    function pass(value, path) {
        const v = object(value, ['id', 'mode', 'density', 'field', 'palette', 'rules', 'relations', 'when', 'iterations'], path);
        const result = {id: token(v.id ?? 'paint', path), mode: choice(v.mode ?? 'surface', MODES, path),
            density: number(v.density ?? 1, 0, 1, path), field: field(v.field ?? {type: 'uniform'}, path + '.field'),
            palette: list(v.palette ?? [], 256, path + '.palette', paletteEntry),
            relations: list(v.relations ?? [], 32, path + '.relations', relation),
            rules: list(v.rules ?? [], 32, path + '.rules', rule), iterations: number(v.iterations ?? 1, 1, 4, path, true)};
        if (v.when !== undefined) result.when = condition(v.when, path + '.when');
        const byId = new Map(result.rules.map(r => [r.id, r]));
        if (byId.size !== result.rules.length) fail(path, 'duplicate rule identifier');
        for (const r of result.rules) {
            const seen = new Set();
            let next = r;
            while (next.action.type === 'rule') {
                if (seen.has(next.id)) fail(path, 'cyclic rule references');
                seen.add(next.id);
                next = byId.get(next.action.rule);
                if (!next) fail(path, 'unknown rule reference');
            }
        }
        return result;
    }
    function validate(value) {
        checkTree(value);
        const v = object(value, ['schema', 'version', 'id', 'name', 'description', 'category', 'author', 'icon', 'tags',
            'seed', 'policy', 'anchor', 'shape', 'passes', 'mask', 'compatibility'], 'recipe');
        const result = {
            schema: choice(v.schema, [1], 'schema'), version: number(v.version ?? 1, 1, 1000000, 'version', true),
            id: token(v.id, 'id'), name: string(v.name, 100, 'name'),
            description: string(v.description ?? '', 500, 'description', true), category: string(v.category ?? 'Terrain', 60, 'category'),
            author: string(v.author ?? '', 100, 'author', true), icon: token(v.icon ?? 'brush', 'icon'),
            tags: list(v.tags ?? [], 24, 'tags', (tag, p) => string(tag, 50, p)),
            seed: number(v.seed ?? 327, -2147483648, 2147483647, 'seed', true),
            policy: choice(v.policy ?? 'world', POLICIES, 'policy'),
            shape: shape(v.shape ?? {}, 'shape'), passes: list(v.passes, 12, 'passes', pass, 1),
            compatibility: list(v.compatibility ?? [], 24, 'compatibility', token)
        };
        if (v.anchor !== undefined) result.anchor = vector(v.anchor, 'anchor');
        if (v.mask !== undefined) {
            const m = object(v.mask, ['minimum', 'maximum', 'invert'], 'mask');
            result.mask = {minimum: vector(m.minimum, 'mask.minimum'), maximum: vector(m.maximum, 'mask.maximum'), invert: bool(m.invert ?? false, 'mask.invert')};
            if (result.mask.minimum.some((n, i) => n > result.mask.maximum[i])) fail('mask', 'bounds must be ordered');
        }
        if (new Set(result.passes.map(p => p.id)).size !== result.passes.length) fail('passes', 'duplicate pass identifier');
        return result;
    }
    function encode(recipe) {
        const text = JSON.stringify({format: FORMAT, version: 1, recipe: validate(recipe)}, null, 2);
        checkFileSize(text);
        return text;
    }
    function checkFileSize(text) {
        if (typeof text !== 'string' || text.length > MAX_FILE || new TextEncoder().encode(text).length > MAX_FILE) {
            fail('preset', 'expected a JSON file up to 512 KiB');
        }
    }
    function decode(text) {
        checkFileSize(text);
        const data = object(JSON.parse(text.replace(/^\uFEFF/, '')), ['format', 'version', 'recipe'], 'preset');
        choice(data.format, [FORMAT], 'preset.format');
        // Version one is the first public schema. Future migrations dispatch here.
        choice(data.version, [1], 'preset.version');
        return validate(data.recipe);
    }

    function salt(value) {
        let n = 2166136261;
        for (let i = 0; i < value.length; i++) n = Math.imul(n ^ value.charCodeAt(i), 16777619);
        return n;
    }
    function hash(seed, x, y, z) {
        let n = seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ Math.imul(z, 0xc2b2ae3d);
        n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
        n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
        return (n ^ (n >>> 16)) >>> 0;
    }
    const random = (seed, p) => hash(seed, ...p) / 4294967296;
    function perlin(p, seed, scale) {
        const grid = p.map(v => Math.floor(v / scale));
        const f = p.map((v, i) => v / scale - grid[i]);
        const t = f.map(v => v ** 3 * (v * (v * 6 - 15) + 10));
        const gradient = (x, y, z) => {
            const h = hash(seed, grid[0] + x, grid[1] + y, grid[2] + z) & 15;
            const a = f[0] - x, b = f[1] - y, c = f[2] - z;
            const u = h < 8 ? a : b, v = h < 4 ? b : h === 12 || h === 14 ? a : c;
            return (h & 1 ? -u : u) + (h & 2 ? -v : v);
        };
        const face = z => lerp(lerp(gradient(0, 0, z), gradient(1, 0, z), t[0]),
            lerp(gradient(0, 1, z), gradient(1, 1, z), t[0]), t[1]);
        return clamp(.5 + .5 * lerp(face(0), face(1), t[2]));
    }
    function featurePoint(x, y, z, seed, scale) {
        return [x, y, z].map((n, i) => (n + .15 + .7 * hash(seed ^ Math.imul(i + 1, 1367843), x, y, z) / 4294967296) * scale);
    }
    function cellular(p, seed, scale, regions) {
        const [gx, gy, gz] = p.map(v => Math.floor(v / scale));
        let nearest = Infinity, region = 0;
        for (let x = gx - 2; x <= gx + 2; x++) for (let y = gy - 2; y <= gy + 2; y++) for (let z = gz - 2; z <= gz + 2; z++) {
            const [a, b, c] = featurePoint(x, y, z, seed, scale);
            const d = (p[0] - a) ** 2 + (p[1] - b) ** 2 + (p[2] - c) ** 2;
            if (d < nearest) { nearest = d; region = hash(seed, x, y, z) / 4294967296; }
        }
        return regions ? region : clamp(Math.sqrt(nearest) / scale);
    }
    function patchField(p, seed, f) {
        const [px, , pz] = p;
        const noise = f.shape === 'organic' ? (perlin([px, 0, pz], seed ^ 4627, f.scale / 2) - .5) * f.strength : 0;
        const reach = f.maxRadius * Math.max(0, 1 + noise);
        let density = 0;
        for (let x = Math.floor((px - reach) / f.scale); x <= Math.floor((px + reach) / f.scale); x++) {
            for (let z = Math.floor((pz - reach) / f.scale); z <= Math.floor((pz + reach) / f.scale); z++) {
                if (random(seed ^ 513, [x, 0, z]) >= f.chance) continue;
                const [cx, , cz] = featurePoint(x, 0, z, seed, f.scale);
                const dx = Math.abs(px - cx), dz = Math.abs(pz - cz);
                const d = f.shape === 'square' ? Math.max(dx, dz) : Math.hypot(dx, dz * (f.shape === 'ellipse' ? 1.7 : 1));
                const r = lerp(f.minRadius, f.maxRadius, random(seed ^ 613, [x, 0, z])) * (1 + noise);
                if (r > 0) density = Math.max(density, clamp((1 - d / r) * 3));
            }
        }
        return density;
    }
    // Matérn type II on globally jittered candidate cells. The minimum distance
    // is invariant under crop and traversal. This is not Bridson sampling.
    function poissonField(p, seed, f) {
        const size = Math.max(1, Math.round(f.scale));
        const tx = Math.floor(p[0] / size), tz = Math.floor(p[2] / size);
        const point = (x, z) => {
            const [px, , pz] = featurePoint(x, 0, z, seed, size);
            return [Math.floor(px), 0, Math.floor(pz)];
        };
        const center = point(tx, tz);
        if (center[0] !== p[0] || center[2] !== p[2]) return 0;
        const rank = hash(seed ^ 79, tx, 0, tz), reach = Math.ceil(f.spacing / size);
        for (let x = tx - reach; x <= tx + reach; x++) for (let z = tz - reach; z <= tz + reach; z++) {
            const other = hash(seed ^ 79, x, 0, z);
            if (other > rank || (other === rank && (x > tx || x === tx && z >= tz))) continue;
            if (distance(center, point(x, z)) < f.spacing) return 0;
        }
        return 1;
    }
    function fieldValue(f, p, seed, context) {
        const child = (i, pos = p) => fieldValue(f.inputs[i], pos, seed ^ Math.imul(i + 1, 1293187), context);
        const value = () => random(seed, p.map(Math.floor));
        const remap = n => {
            if (n === null || !Number.isFinite(n)) return null;
            const [lo, hi] = f.range;
            return lerp(...f.output, hi === lo ? +(n >= hi) : clamp((n - lo) / (hi - lo)));
        };
        switch (f.type) {
            case 'uniform': return f.value;
            case 'white': return value();
            case 'perlin': return perlin(p, seed, f.scale);
            case 'fbm': {
                let sum = 0, weight = 0;
                for (let i = 0; i < f.octaves; i++) {
                    const w = 2 ** -i;
                    sum += w * perlin(p, seed ^ Math.imul(i, 263879), f.scale * w);
                    weight += w;
                }
                return sum / weight;
            }
            case 'gaussian': return Math.exp(-.5 * (context.radius / f.strength) ** 2);
            case 'gaussianRandom': return clamp(.5 + f.strength * Math.sqrt(-2 * Math.log(Math.max(1e-9, value())))
                * Math.cos(2 * Math.PI * random(seed ^ 1597, p.map(Math.floor))));
            case 'cellular': return cellular(p, seed, f.scale, false);
            case 'voronoi': return cellular(p, seed, f.scale, true);
            case 'warp': return child(0, p.map((n, i) => n + (perlin(p, seed ^ Math.imul(i + 1, 21379), f.scale) - .5) * f.strength));
            case 'directional': return perlin(p.map((n, i) => i === f.axis ? n / f.strength : n), seed, f.scale);
            case 'distance': return clamp(1 - context.radius);
            case 'edge': return clamp(context.radius);
            case 'surface': return context.surface ? 1 : 0;
            case 'patches': return patchField(p, seed, f);
            case 'poisson': return poissonField(p, seed, f);
            case 'context': return remap(context.get(f.context));
            case 'remap': return remap(child(0));
            default: {
                const values = f.inputs.map((_, i) => child(i));
                if (values.includes(null)) return null;
                const [a, b, c] = values;
                switch (f.type) {
                    case 'multiply': return values.reduce((x, y) => x * y, 1);
                    case 'add': return clamp(values.reduce((x, y) => x + y, 0));
                    case 'mix': return lerp(a, b, c ?? f.value);
                    case 'invert': return 1 - a;
                    case 'threshold': return +(a >= f.value);
                    case 'power': return a ** f.value;
                }
            }
        }
    }

    function dominant(v) {
        const axis = [0, 1, 2].reduce((a, b) => Math.abs(v[b]) > Math.abs(v[a]) ? b : a);
        return v[axis] ? [0, 1, 2].map(i => i === axis ? Math.sign(v[i]) : 0) : null;
    }
    function tangentBasis(normal) {
        if (normal[0]) return [[0, 0, -normal[0]], normal, [0, 1, 0]];
        if (normal[2]) return [[normal[2], 0, 0], normal, [0, 1, 0]];
        return [[1, 0, 0], normal, [0, 0, normal[1]]];
    }
    function brushPoint(p, origin, basis, yaw) {
        const d = sub(p, origin);
        const [x, y, z] = basis.map(axis => axis.reduce((sum, n, i) => sum + n * d[i], 0));
        return [x * Math.cos(yaw) + z * Math.sin(yaw), y, -x * Math.sin(yaw) + z * Math.cos(yaw)];
    }
    function* stampCells(s, stamp, seed, read) {
        const origin = stamp.position, normal = stamp.normal ?? DIRECTIONS.above, direction = stamp.direction ?? DIRECTIONS.east;
        const basis = tangentBasis(s.orientation === 'surface' ? normal : DIRECTIONS.above);
        const yaw = s.rotation * Math.PI / 180 + (s.orientation === 'stroke' ? Math.atan2(direction[2], direction[0]) : 0);
        const size = 1 + s.variation * (2 * random(seed ^ 231, stamp.pattern) - 1);
        const rx = (s.type === 'ellipsoid' || s.type === 'band' ? s.width : s.radius) * size;
        const rz = s.radius * size;
        const ry = s.type === 'ellipsoid' ? s.height * size : s.type === 'sphere' ? rx : s.depth * size;
        const horizontal = Math.ceil(Math.abs(Math.sin(yaw)) > 1e-6 ? Math.hypot(rx, rz) : Math.max(rx, rz));
        const bound = basis[1].map(n => n ? Math.ceil(ry) : horizontal);
        const emit = (p, r) => ({p, r, normal, direction});
        if (s.type === 'stamp') {
            for (const cell of s.cells) {
                const [x, y, z] = cell;
                const rotated = [x * Math.cos(yaw) - z * Math.sin(yaw), y, x * Math.sin(yaw) + z * Math.cos(yaw)];
                yield emit(add(origin, origin.map((_, i) => Math.round(rotated.reduce((sum, n, j) => sum + n * basis[j][i], 0)))), 0);
            }
            return;
        }
        if (s.type === 'connected') {
            const initial = read(origin)?.block;
            if (!initial) return;
            const queue = [origin], seen = new Set([key(origin)]);
            for (let i = 0; i < queue.length; i++) {
                const p = queue[i], r = distance(p, origin) / rx;
                if (r > 1 || read(p)?.block !== initial || s.axes.some((axis, j) => !axis && p[j] !== origin[j])) { yield null; continue; }
                yield emit(p, r);
                for (const d of Object.values(DIRECTIONS)) {
                    const next = add(p, d), k = key(next);
                    if (!seen.has(k)) { seen.add(k); queue.push(next); }
                }
            }
            return;
        }
        for (let x = -bound[0]; x <= bound[0]; x++) for (let y = -bound[1]; y <= bound[1]; y++) {
            for (let z = -bound[2]; z <= bound[2]; z++) {
                const delta = [x, y, z], p = add(origin, delta);
                if (s.axes.some((axis, i) => !axis && delta[i])) { yield null; continue; }
                const [u, v, w] = brushPoint(delta, [0, 0, 0], basis, yaw);
                const circular = Math.hypot(u / rx, w / rz);
                let r = s.type === 'box' || s.type === 'band' ? Math.max(Math.abs(u / rx), Math.abs(w / rz)) : circular;
                if (s.type === 'sphere' || s.type === 'ellipsoid') r = Math.hypot(circular, v / ry);
                else if (s.type === 'irregular') r /= .75 + .45 * perlin(add(stamp.pattern, delta), seed ^ 9941, 3);
                if (['disc', 'band', 'irregular'].includes(s.type) && Math.abs(v) >= Math.ceil(ry)) r = Infinity;
                else if (['box', 'cylinder'].includes(s.type)) r = Math.max(r, Math.abs(v / ry));
                yield r <= 1 ? emit(p, r) : null;
            }
        }
    }

    // Resample by travelled distance, with one final endpoint if required. The
    // caller starts a new segment after leaving the terrain rather than bridging a miss.
    function createStroke(spacing) {
        number(spacing, .5, 32, 'spacing');
        const stamps = [];
        let last = null, until = spacing;
        function stamp(position, normal, direction) {
            const p = position.map(Math.round), prev = stamps.at(-1);
            if (!prev || key(prev.position) !== key(p) || key(prev.normal) !== key(normal)) {
                if (stamps.length === 4096) throw new RangeError('Brush stroke exceeds 4,096 stamps.');
                stamps.push({position: p, normal, direction});
            }
        }
        return {
            stamps,
            push(position, normal) {
                const p = vector(position, 'stroke position');
                const n = dominant(normal) || DIRECTIONS.above;
                if (!last) { stamp(p, n, DIRECTIONS.east); last = {p, n, direction: DIRECTIONS.east}; return; }
                const d = sub(p, last.p), length = Math.hypot(...d);
                if (!length) { last.n = n; return; }
                for (; until <= length + 1e-9; until += spacing) {
                    stamp(add(last.p, d.map(v => v * until / length)), until / length < .5 ? last.n : n, d);
                }
                until -= length;
                last = {p, n, direction: d};
            },
            finish() { if (last) stamp(last.p, last.n, last.direction); },
            gap() { this.finish(); last = null; until = spacing; },
            preview() {
                const count = stamps.length;
                this.finish();
                const snapshot = stamps.slice();
                stamps.length = count;
                return snapshot;
            }
        };
    }
    function* offsets(radius, metric) {
        for (let x = -radius; x <= radius; x++) for (let y = -radius; y <= radius; y++) for (let z = -radius; z <= radius; z++) {
            if ((!x && !y && !z) || (metric === 'horizontal' && y) || (metric === 'vertical' && (x || z))) continue;
            if (distance([x, y, z], [0, 0, 0], metric) <= radius) yield [x, y, z];
        }
    }
    function queryOffsets(c) {
        if (c.query === 'current') return [[0, 0, 0]];
        if (Object.hasOwn(DIRECTIONS, c.query)) return [DIRECTIONS[c.query]];
        if (c.query === 'offset') return [c.offset];
        if (c.query === 'radius' || c.query === 'box') return offsets(c.radius, c.metric ?? 'chebyshev');
        return Object.values(DIRECTIONS).filter(d => c.query === 'neighbors' || (c.query === 'horizontal' ? !d[1] : d[1]));
    }
    function contextValue(name, p, env) {
        const supplied = env.adapter.context?.(name, p);
        if (supplied && supplied.status !== 'unsupported') return supplied;
        const result = (value, status = 'available') => ({status, value});
        switch (name) {
            case 'height': return result(p[1] + env.worldOffset[1]);
            case 'normal': return result(env.normal, 'estimated');
            case 'slope': {
                const surface = offset => {
                    for (let y = 4; y >= -4; y--) {
                        const b = env.read(add(p, [offset[0], y, offset[2]]));
                        if (b && env.adapter.traits?.(b)?.solid === true) return y;
                    }
                    return null;
                };
                const [east, west, north, south] = ['east', 'west', 'north', 'south'].map(d => surface(DIRECTIONS[d]));
                if ([east, west, north, south].includes(null)) return result(null, 'unknown');
                return result(Math.atan(Math.hypot(east - west, north - south) / 2) * 180 / Math.PI, 'estimated');
            }
            case 'exposure':
            case 'concavity':
            case 'occlusion': {
                const solid = Object.values(DIRECTIONS).map(d => {
                    const b = env.read(add(p, d));
                    return b ? env.adapter.traits?.(b)?.solid : false;
                });
                if (solid.includes(undefined)) return result(null, 'unknown');
                const fraction = solid.filter(Boolean).length / 6;
                return name === 'exposure' ? result(1 - fraction) : result(fraction, 'estimated');
            }
            case 'waterDistance':
            case 'humidity': {
                const nearest = findNearby(p, 4, 'euclidean', env.read, b => /^(minecraft:)?(flowing_)?water$/.test(b.block));
                if (name === 'humidity') return result(nearest ? 1 - nearest.distance / 5 : 0, 'estimated');
                return result(nearest?.distance ?? null, nearest ? 'available' : 'unknown');
            }
            case 'depth': {
                for (let dy = 0; dy <= 16; dy++) if (!env.read(add(p, [0, dy, 0]))) return result(dy);
                return result(null, 'unknown');
            }
            default: return result(null, 'unsupported');
        }
    }
    function testCondition(c, p, env, channel) {
        if (c.op === 'not') {
            const value = testCondition(c.children[0], p, env, channel + '.0');
            return value === null ? null : !value;
        }
        if (c.op === 'and' || c.op === 'or') {
            const short = c.op === 'or';
            let unknown = false;
            for (let i = 0; i < c.children.length; i++) {
                const value = testCondition(c.children[i], p, env, channel + '.' + i);
                if (value === short) return short;
                if (value === null) unknown = true;
            }
            return unknown ? null : !short;
        }
        const match = q => {
            if (c.op === 'chance') return random(env.seed ^ salt(channel), env.pattern(q)) < c.value;
            const b = env.read(q), state = b?.states?.[c.state];
            switch (c.op) {
                case 'exists': return !!b;
                case 'missing': return !b;
                case 'is': return b?.block === c.value;
                case 'isNot': return b?.block !== c.value;
                case 'in': return !!b && c.value.includes(b.block);
                case 'hasState': return state !== undefined;
                case 'stateEquals': return state === c.value;
                case 'stateRange': return Number.isFinite(state) && state >= c.value[0] && state <= c.value[1];
                case 'trait': return b ? env.adapter.traits?.(b)?.[c.value] ?? null : false;
                case 'tagged': return env.tags.get(key(q))?.has(c.value) ?? false;
                case 'contextIs': {
                    const value = contextValue(c.state, q, env).value;
                    return value == null ? null : value === c.value;
                }
                case 'contextRange': {
                    const value = contextValue(c.state, q, env).value;
                    return Number.isFinite(value) ? value >= c.value[0] && value <= c.value[1] : null;
                }
            }
        };
        let matched = 0, unknown = 0, count = 0;
        for (const d of queryOffsets(c)) {
            const result = match(add(p, d));
            if (!c.quantifier) return result;
            count++;
            if (result) matched++;
            if (result === null) unknown++;
            if (c.quantifier === 'atLeast' && matched >= c.count) return true;
            if (c.quantifier === 'exactly' && matched > c.count) return false;
        }
        const required = c.quantifier === 'fraction' ? c.count * count : c.count;
        if (c.quantifier === 'exactly') return matched === required && !unknown ? true : matched + unknown >= required ? null : false;
        return matched >= required ? true : matched + unknown >= required ? null : false;
    }
    function findNearby(p, radius, metric, read, match) {
        let nearest = null;
        for (const offset of offsets(radius, metric)) {
            const d = distance(offset, [0, 0, 0], metric);
            if (nearest && d >= nearest.distance) continue;
            const target = read(add(p, offset));
            if (target && match(target)) nearest = {offset, distance: d};
        }
        return nearest;
    }
    function paletteOutput(entries, p, env, relations, fallback) {
        const candidates = [];
        let priority = -Infinity, total = 0;
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            if (!e.enabled || !e.weight || e.priority < priority || (e.when && testCondition(e.when, p, env, 'entry' + i) !== true)) continue;
            const pattern = env.pattern(p);
            if (random(env.seed ^ salt('probability:' + i), pattern) >= e.probability) continue;
            let weight = e.weight, id = e.block, direction;
            for (const r of relations) {
                if (r.subject !== e.block || r.scope === 'proposals') continue;
                const near = findNearby(p, r.radius, r.metric, env.read, b => b.block === r.target);
                if ((!near && r.type === 'depend') || (near && ['exclude', 'separate'].includes(r.type))) { weight = 0; break; }
                if (!near) continue;
                const influence = 1 - near.distance / (r.radius + 1);
                if (['attract', 'group', 'connect', 'gradient'].includes(r.type)) weight *= 1 + r.strength * influence ** (r.type === 'group' ? 2 : 1);
                if (r.type === 'repel') weight /= 1 + r.strength * influence;
                if (r.type === 'align' || r.type === 'connect') direction = dominant(near.offset);
                if (r.type === 'transform') id = r.output;
            }
            if (!weight) continue;
            if (e.priority > priority) { priority = e.priority; total = 0; candidates.length = 0; }
            const variants = e.variants;
            const variant = variants[Math.floor(random(env.seed ^ salt('variant:' + i), pattern) * variants.length)];
            if (!direction && e.orientation === 'random') direction = Object.values(DIRECTIONS)[Math.floor(random(env.seed ^ salt('orientation'), pattern) * 6)];
            if (!direction && e.orientation === 'surface') direction = env.normal;
            if (!direction && e.orientation === 'stroke') direction = dominant(env.direction);
            if (!direction && e.orientation === 'vector') direction = dominant(e.vector);
            if (!direction && e.orientation === 'neighbor') direction = dominant(findNearby(p, 1, 'manhattan', env.read, () => true)?.offset ?? [0, 0, 0]);
            const states = id === e.block ? {...e.states, ...variant} : {};
            candidates.push({id, states, direction, total: total += weight});
        }
        const pick = random(env.seed ^ salt('palette'), env.pattern(p)) * total;
        const selected = candidates.find(c => pick < c.total);
        if (!selected) return null;
        const resolved = env.adapter.resolve({block: selected.id, states: selected.states, direction: selected.direction}, fallback);
        if (!resolved) env.invalid++;
        return resolved;
    }
    function ruleOutput(rule, p, env, pass, tags, depth = 0) {
        if (!rule.enabled) return null;
        const condition = testCondition(rule.when, p, env, 'rule:' + rule.id);
        if (condition === null) env.unknown++;
        if (condition !== true) return null;
        const a = rule.action, target = add(p, a.offset), prior = env.read(target);
        if (a.type === 'rule') {
            if (depth >= 31) return null;
            return ruleOutput(pass.rules.find(r => r.id === a.rule), target, env, pass, tags, depth + 1);
        }
        if (a.type === 'tag') {
            const k = key(target);
            if (!tags.has(k)) tags.set(k, new Set());
            tags.get(k).add(a.tag);
            return null;
        }
        if (a.type === 'remove') return prior ? {p: target, value: null, normal: env.normal} : null;
        if ((['replace', 'states'].includes(a.type) && !prior) || (['place', 'decorate'].includes(a.type) && prior)) return null;
        const value = a.type === 'palette' ? paletteOutput(pass.palette, target, env, pass.relations, prior)
            : env.adapter.resolve({block: a.block ?? prior.block, states: a.states}, prior);
        if (!value && a.type !== 'palette') env.invalid++;
        return value ? {p: target, value, normal: a.type === 'decorate' ? DIRECTIONS.above : env.normal} : null;
    }
    function comparePosition(a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; }
    function compareProposals(a, b) { return b.priority - a.priority || a.rank - b.rank || comparePosition(a.p, b.p) || comparePosition(a.source, b.source); }
    function sameBlock(a, b) {
        if (!a || !b) return !a && !b;
        if (a.block !== b.block || a.version !== b.version) return false;
        const x = a.states ?? {}, y = b.states ?? {}, keys = Object.keys(x);
        return keys.length === Object.keys(y).length && keys.every(k => x[k] === y[k]);
    }

    // The iterator yields work units, not deltas. Exhaust it for an immutable
    // plan, or abandon it at any yield before a host transaction begins.
    function* plan(recipe, adapter, request = {}) {
        const stamps = request.stamps ?? [];
        const bounds = request.bounds;
        const mask = recipe.mask;
        const worldOffset = adapter.worldOffset ?? [0, 0, 0];
        const anchor = recipe.anchor ?? stamps[0]?.position ?? bounds?.minimum ?? [0, 0, 0];
        const pattern = p => recipe.policy === 'fixed' ? sub(p, anchor) : add(p, worldOffset);
        const seed = recipe.seed ^ (['stroke', 'additive'].includes(recipe.policy) ? request.nonce ?? 0 : 0);
        const additive = request.additive === true || recipe.policy === 'additive';
        const candidates = new Map(), changes = new Map(), readCache = new Map();
        const trace = request.trace && key(request.trace), traceEntries = [];
        const stats = {visited: 0, candidates: 0, evaluated: 0, rejected: 0, unknown: 0, invalid: 0, changes: 0};
        let reads = 0, comparisons = 0, fieldWork = 0;
        const recordTrace = (p, data) => { if (trace && key(p) === trace && traceEntries.length < 128) traceEntries.push(data); };
        const base = p => {
            const k = key(p);
            if (!readCache.has(k)) {
                const value = adapter.read(p) ?? null;
                if (readCache.size < LIMIT * 2) readCache.set(k, value);
                return value;
            }
            return readCache.get(k);
        };
        const read = p => {
            if (++reads > 8e6) throw new RangeError('Brush spatial queries exceed the operation budget. Reduce the region or rule radius.');
            const changed = changes.get(key(p));
            return changed ? changed.value : base(p);
        };
        const inside = (p, box) => box.minimum.every((n, i) => p[i] >= n && p[i] <= box.maximum[i]);
        const allowedPosition = p => p.every(n => Math.abs(n) <= 2147483000) && (!mask || inside(p, mask) !== mask.invert)
            && (!bounds || inside(p, bounds)) && (!adapter.bounds || inside(p, adapter.bounds));
        const collect = c => {
            if (++stats.visited > LIMIT * 12) throw new RangeError('Brush footprint exceeds the work budget. Reduce its size or spacing.');
            if (!c || !allowedPosition(c.p)) return;
            const k = key(c.p), old = candidates.get(k);
            if (old && (old.r < c.r || old.r === c.r && comparePosition(old.normal, c.normal) <= 0)) return;
            if (!old && candidates.size === LIMIT) throw new RangeError('Brush exceeds 65,536 candidate cells.');
            candidates.set(k, c);
        };
        if (bounds) {
            const low = vector(bounds.minimum, 'region minimum'), high = vector(bounds.maximum, 'region maximum');
            const size = high.map((n, i) => n - low[i] + 1);
            if (size.some(n => n < 1) || size.reduce((a, b) => a * b, 1) > LIMIT) throw new RangeError('Brush region exceeds 65,536 cells or has invalid bounds.');
            for (let x = low[0]; x <= high[0]; x++) for (let y = low[1]; y <= high[1]; y++) for (let z = low[2]; z <= high[2]; z++) {
                collect({p: [x, y, z], r: 0, normal: DIRECTIONS.above, direction: DIRECTIONS.east}); yield;
            }
        } else for (const stamp of stamps) {
            for (const c of stampCells(recipe.shape, {...stamp, pattern: pattern(stamp.position)}, seed, read)) {
                collect(c);
                if (c && recipe.shape.symmetry) {
                    const p = c.p.map((v, i) => i === 0 ? 2 * recipe.shape.symmetry[0] - v : v);
                    collect({...c, p, normal: [-c.normal[0], c.normal[1], c.normal[2]],
                        direction: [-c.direction[0], c.direction[1], c.direction[2]]});
                }
                yield;
            }
        }
        stats.candidates = candidates.size;
        const tags = new Map();
        const fieldCost = f => {
            const own = {perlin: 8, fbm: f.octaves * 8, warp: 24, directional: 8, cellular: 125, voronoi: 125,
                patches: (2 * Math.ceil(f.maxRadius * (1 + f.strength / 2) / f.scale) + 2) ** 2,
                poisson: (2 * Math.ceil(f.spacing / f.scale) + 1) ** 2}[f.type] ?? 1;
            return own + (f.inputs?.reduce((sum, child) => sum + fieldCost(child), 0) ?? 0);
        };
        const makeProposal = (output, source, rank, priority = 0) => ({...output, source, rank, priority});
        for (const pass of recipe.passes) {
            const passSeed = seed ^ salt(pass.id);
            const cost = fieldCost(pass.field);
            const phases = pass.mode === 'rules' ? [...new Set(pass.rules.filter(r => r.enabled).map(r => r.phase))].sort((a, b) => a - b) : [0];
            for (let iteration = 0; iteration < pass.iterations; iteration++) {
                let edited = 0;
                for (const phase of phases) {
                    const proposals = [], phaseTags = new Map();
                    const rules = pass.rules.filter(r => r.enabled && r.phase === phase).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id, 'en'));
                    for (const c of candidates.values()) {
                        yield;
                        if (++stats.evaluated > LIMIT * 16) throw new RangeError('Brush passes exceed the evaluation budget.');
                        if ((fieldWork += cost) > 24e6) throw new RangeError('Brush fields exceed the operation budget. Reduce the region or field complexity.');
                        const {p, r, normal, direction} = c;
                        const env = {read, adapter, normal, direction, seed: passSeed, pattern, worldOffset, tags, unknown: 0, invalid: 0};
                        const initial = read(p), next = add(p, normal), surface = !!initial && !read(next);
                        const f = fieldValue(pass.field, pattern(p), passSeed ^ salt('field'), {
                            radius: r, surface, get: name => contextValue(name, p, env).value
                        });
                        if (f === null) { stats.unknown++; recordTrace(p, {pass: pass.id, reason: 'unknown field input'}); continue; }
                        const fade = recipe.shape.falloff;
                        const falloff = fade && r > 1 - fade ? ((1 - r) / fade) ** (1 - .95 * recipe.shape.hardness) : 1;
                        const density = f * pass.density * falloff;
                        if (random(passSeed ^ salt('density'), pattern(p)) >= density) { recordTrace(p, {pass: pass.id, density, reason: 'density'}); continue; }
                        const condition = pass.when ? testCondition(pass.when, p, env, 'pass') : true;
                        if (condition !== true) { if (condition === null) stats.unknown++; recordTrace(p, {pass: pass.id, density, reason: condition === null ? 'unknown condition' : 'condition'}); continue; }
                        const rank = hash(passSeed ^ salt('conflict'), ...pattern(p));
                        if (pass.mode === 'rules') {
                            for (const rule of rules) {
                                const output = ruleOutput(rule, p, env, pass, phaseTags);
                                if (output) { proposals.push(makeProposal(output, p, rank, rule.priority)); break; }
                            }
                            stats.unknown += env.unknown;
                            stats.invalid += env.invalid;
                            continue;
                        }
                        const target = pass.mode === 'decorate' ? next : p;
                        const prior = read(target);
                        if ((['surface', 'decorate'].includes(pass.mode) && !surface) || (pass.mode === 'replace' && !prior)
                            || (prior && additive)) continue;
                        const output = paletteOutput(pass.palette, target, env, pass.relations, prior);
                        stats.invalid += env.invalid;
                        if (output) proposals.push(makeProposal({p: target, value: output, normal}, p, rank));
                        recordTrace(p, {pass: pass.id, density, proposed: output?.block ?? null});
                    }
                    // Resolve one winner per cell and compare proposal relations
                    // against higher-ranked accepted operations in spatial buckets.
                    proposals.sort(compareProposals);
                    const winners = new Map(), buckets = new Map();
                    const spatial = pass.relations.filter(r => r.scope === 'proposals');
                    const bucketKey = p => key(p.map(v => Math.floor(v / 12)));
                    for (const entry of proposals) {
                        yield;
                        const {p, value, normal} = entry, k = key(p), prior = read(p);
                        const support = read(sub(p, normal));
                        if (!allowedPosition(p) || winners.has(k) || sameBlock(prior, value)
                            || (additive && prior)
                            || adapter.canWrite?.(p, value, {normal, support, prior}) === false) {
                            stats.rejected++; recordTrace(entry.source, {pass: pass.id, reason: 'blocked or unchanged'}); continue;
                        }
                        let blocked = false;
                        if (value && spatial.length) {
                            const center = p.map(v => Math.floor(v / 12));
                            for (let x = -1; x <= 1 && !blocked; x++) for (let y = -1; y <= 1 && !blocked; y++) {
                                for (let z = -1; z <= 1 && !blocked; z++) {
                                    blocked = (buckets.get(key(add(center, [x, y, z]))) ?? []).some(other => spatial.some(r => {
                                        if (++comparisons > 8e6) throw new RangeError('Brush conflicts exceed the operation budget.');
                                        return ((r.subject === value.block && r.target === other.value.block)
                                            || (r.target === value.block && r.subject === other.value.block))
                                            && distance(p, other.p, r.metric) <= r.radius;
                                    }));
                                }
                            }
                        }
                        if (blocked) { stats.rejected++; recordTrace(entry.source, {pass: pass.id, reason: 'proposal separation'}); continue; }
                        winners.set(k, entry);
                        if (value && spatial.length) {
                            const bucket = bucketKey(p);
                            if (!buckets.has(bucket)) buckets.set(bucket, []);
                            buckets.get(bucket).push(entry);
                        }
                        // Hold writes until this phase is resolved. Conditions
                        // and support use the same frozen view throughout it.
                    }
                    for (const [k, entry] of winners) {
                        changes.set(k, entry);
                        edited++;
                        yield;
                    }
                    for (const [k, values] of phaseTags) {
                        if (!tags.has(k)) tags.set(k, new Set());
                        for (const value of values) tags.get(k).add(value);
                        yield;
                    }
                }
                if (!edited) break;
            }
        }
        const operations = [...changes.values()].filter(e => !sameBlock(base(e.p), e.value))
            .sort((a, b) => comparePosition(a.p, b.p)).map(e => ({position: e.p, value: e.value, normal: e.normal}));
        stats.changes = operations.length;
        return {operations, stats, trace: traceEntries, tags};
    }
    function evaluate(recipe, adapter, request) {
        const steps = plan(recipe, adapter, request);
        let step;
        do { step = steps.next(); } while (!step.done);
        return step.value;
    }

    // Reference statistics retain six-neighbor connectivity in terrain-local
    // coordinates. A reference is summarized before building a fresh recipe.
    function* analyzeRegion(adapter, bounds) {
        const minimum = vector(bounds.minimum, 'region minimum'), maximum = vector(bounds.maximum, 'region maximum');
        const size = maximum.map((n, i) => n - minimum[i] + 1), volume = size.reduce((a, b) => a * b, 1);
        if (size.some(n => n < 1) || volume > LIMIT) throw new RangeError('Reference region exceeds 65,536 cells.');
        const cells = new Map(), materials = new Map(), neighbors = new Map(), seen = new Set();
        for (let x = minimum[0]; x <= maximum[0]; x++) for (let y = minimum[1]; y <= maximum[1]; y++) {
            for (let z = minimum[2]; z <= maximum[2]; z++) {
                yield;
                const p = [x, y, z], value = adapter.read(p);
                if (!value) continue;
                cells.set(key(p), {p, block: value.block});
                if (!materials.has(value.block)) materials.set(value.block, {block: value.block, count: 0, groups: 0, largest: 0});
                materials.get(value.block).count++;
            }
        }
        for (const [k, start] of cells) {
            yield;
            for (const d of [DIRECTIONS.above, DIRECTIONS.south, DIRECTIONS.east]) {
                const other = cells.get(key(add(start.p, d)));
                if (!other) continue;
                const pair = [start.block, other.block].sort().join('|');
                neighbors.set(pair, (neighbors.get(pair) ?? 0) + 1);
            }
            if (seen.has(k)) continue;
            const queue = [start];
            seen.add(k);
            for (let i = 0; i < queue.length; i++) {
                yield;
                for (const d of Object.values(DIRECTIONS)) {
                    const adjacent = key(add(queue[i].p, d)), next = cells.get(adjacent);
                    if (!seen.has(adjacent) && next?.block === start.block) { seen.add(adjacent); queue.push(next); }
                }
            }
            const material = materials.get(start.block);
            material.groups++;
            material.largest = Math.max(material.largest, queue.length);
        }
        return {schema: 1, volume, occupied: cells.size, size,
            materials: [...materials.values()].sort((a, b) => b.count - a.count || a.block.localeCompare(b.block, 'en')),
            neighbors: [...neighbors].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en'))};
    }

    function builtinRecipes() {
        const entry = (block, weight = 1) => ({block, weight});
        const paint = (mode, palette, extra = {}) => ({mode, palette, ...extra});
        const is = (value, query = 'current') => ({op: 'is', value, query});
        const trait = (value, query = 'current') => ({op: 'trait', value, query});
        const and = (...children) => ({op: 'and', children});
        const not = c => ({op: 'not', children: [c]});
        const ground = {op: 'in', value: ['grass_block', 'dirt', 'coarse_dirt', 'podzol', 'moss_block']};
        const patches = (scale, minRadius, maxRadius) => ({type: 'patches', scale, minRadius, maxRadius, chance: .9});
        const distribution = (type, scale) => ({type, scale});
        const recipe = (id, name, description, category, passes, shape = {}) => validate({
            schema: 1, id: 'builtin:' + id, name, description, category, passes, shape: {radius: 8, ...shape}
        });
        const worldRule = (id, when, action, extra = {}) => ({id, when, action, ...extra});
        const rules = (...rules) => ({mode: 'rules', rules});
        const weather = {op: 'contextRange', state: 'exposure', value: [.3, 1]};
        const wet = {op: 'contextRange', state: 'humidity', value: [.35, 1]};
        const surface = {op: 'missing', query: 'above'};
        const flowers = (id, palette, field, density) => paint('decorate', palette, {id, field, density, when: ground});
        const separate = (subject, target, radius) => ({type: 'separate', subject, target, radius, metric: 'horizontal', scope: 'proposals'});
        return [
            recipe('dirt-gravel', 'Dirt & Gravel', 'Natural surface mix of dirt, gravel and stone.', 'Terrain', [
                paint('surface', [entry('dirt', 60), entry('gravel', 25), entry('stone', 15)], {field: {type: 'remap',
                    inputs: [{type: 'fbm', scale: 9}], range: [.28, .62], output: [.1, 1]}})
            ]),
            recipe('muddy-ground', 'Muddy Ground', 'Organic mud islands across suitable ground.', 'Terrain', [
                paint('surface', [entry('mud', 4), entry('packed_mud')], {field: patches(12, 2, 5), when: ground})
            ]),
            recipe('rocky-surface', 'Rocky Surface', 'Rock clusters with spacing between cobblestone accents.', 'Terrain', [
                paint('decorate', [entry('cobblestone'), entry('andesite', 3)], {field: patches(11, 2, 4), density: .65,
                    relations: [separate('cobblestone', 'cobblestone', 3)]})
            ]),
            recipe('wildflowers', 'Wildflower Meadow', 'Three flower populations and a sparse undergrowth pass.', 'Ecosystem', [
                flowers('daisies', [entry('oxeye_daisy')], patches(11, 2, 5), .65),
                flowers('poppies', [entry('poppy')], patches(15, 2, 3), .4),
                {...flowers('cornflowers', [entry('cornflower')], patches(9, 2, 4), .55),
                    relations: [separate('cornflower', 'cornflower', 1)]},
                flowers('ground-cover', [entry('short_grass')], distribution('perlin', 8), .35)
            ], {radius: 13, falloff: .2}),
            recipe('moss', 'Moss Distribution', 'Patchy moss favored by estimated humidity near water.', 'Ecosystem', [
                paint('surface', [entry('moss_block')], {when: wet, field: patches(8, 1, 4)})
            ]),
            recipe('sparse-vegetation', 'Sparse Vegetation', 'Globally spaced plants on compatible ground.', 'Ecosystem', [
                flowers('scatter', [entry('fern'), entry('dandelion'), entry('short_grass', 4)], {type: 'poisson', scale: 2, spacing: 4}, 1)
            ]),
            recipe('dense-vegetation', 'Dense Vegetation', 'Grass and ferns under a broad continuous noise field.', 'Ecosystem', [
                flowers('cover', [entry('short_grass', 4), entry('fern', 3), entry('dandelion')], {type: 'remap',
                    inputs: [distribution('fbm', 12)], range: [.3, .58], output: [.2, 1]}, .9)
            ]),
            recipe('organic-stone', 'Organic Stone Patches', 'A warped field changes exposed dirt into stone.', 'Terrain', [
                paint('surface', [entry('stone', 5), entry('andesite')], {when: ground,
                    field: {type: 'warp', scale: 10, strength: 6, inputs: [patches(12, 2, 6)]}})
            ], {type: 'irregular'}),
            recipe('weathering', 'Surface Weathering', 'Exposure and humidity control stone-brick aging.', 'Rules', [
                {...rules(
                    worldRule('moss', and(is('stone_bricks'), weather, wet), {type: 'replace', block: 'mossy_stone_bricks'}, {priority: 2}),
                    worldRule('cracks', and(is('stone_bricks'), weather), {type: 'replace', block: 'cracked_stone_bricks'})
                ), field: distribution('fbm', 8), density: .8}
            ], {type: 'sphere', radius: 6}),
            recipe('surface-detail', 'Surface Detail', 'Sparse flowers and ferns on exposed ground.', 'Ecosystem', [
                flowers('details', [entry('fern'), entry('dandelion'), entry('azure_bluet')], {type: 'gaussian', strength: .45}, .5)
            ], {radius: 4}),
            recipe('path-edges', 'Path Edges', 'Flowers along existing dirt paths.', 'Ecosystem', [
                flowers('path-flowers', [entry('dandelion', 2), entry('azure_bluet')], distribution('perlin', 7), .85),
            ].map(p => ({...p, when: and(p.when, {...is('grass_path', 'horizontal'), quantifier: 'atLeast', count: 1})}))),
            validate({...recipe('grass-maintenance', 'Grass Maintenance',
                'Turns grass to dirt when covered by a known solid block; plants and air leave grass intact.', 'Rules', [
                    rules(worldRule('grass', and(is('grass_block'), {op: 'exists', query: 'above'}, trait('solid', 'above')),
                        {type: 'replace', block: 'dirt'}))
                ], {type: 'cylinder', depth: 2}), version: 2}),
            recipe('floating-cleanup', 'Floating Vegetation Cleanup', 'Removes support-dependent plants above empty cells.', 'Rules', [
                rules(worldRule('cleanup', and(trait('vegetation'), trait('requiresSupport'), {op: 'missing', query: 'below'}), {type: 'remove'}))
            ], {type: 'sphere', radius: 5}),
            recipe('clusters', 'Clustered Flowers', 'Mixed flower colonies with irregular boundaries.', 'Ecosystem', [
                flowers('colonies', [entry('oxeye_daisy', 5), entry('poppy', 2), entry('cornflower')], patches(13, 2, 6), .72)
            ], {radius: 15}),
            recipe('layered-terrain', 'Layered Terrain', 'Mixes andesite and stone one to three blocks below the surface.', 'Terrain', [
                paint('replace', [entry('stone', 4), entry('andesite')], {when: and(ground,
                    {op: 'contextRange', state: 'depth', value: [2, 4]}), field: distribution('perlin', 10)})
            ], {type: 'cylinder', depth: 4}),
            recipe('rocky-transition', 'Rocky Transition', 'Brings gravel and dirt toward existing stone.', 'Terrain', [
                paint('surface', [entry('gravel'), entry('dirt', 3)], {when: ground, relations: [
                    {type: 'gradient', subject: 'gravel', target: 'stone', radius: 5, metric: 'horizontal', strength: 12}
                ]})
            ]),
            recipe('surface-cleanup', 'Surface Cleanup', 'Removes selected kinds of exposed ground cover.', 'Rules', [
                rules(worldRule('trim', and({op: 'in', value: ['short_grass', 'fern']}, surface), {type: 'remove'}))
            ], {type: 'cylinder', depth: 2}),
            recipe('orientation', 'Orientation Fixer', 'Sets a supported oak-log pillar_axis to vertical.', 'Rules', [
                rules(worldRule('upright', and(is('oak_log'), {op: 'hasState', state: 'pillar_axis'}, not({op: 'stateEquals', state: 'pillar_axis', value: 'y'})),
                    {type: 'states', states: {pillar_axis: 'y'}}))
            ], {type: 'sphere', radius: 6}),
            recipe('path-flow', 'Path & Flow', 'A directional band of path material with weathered edges.', 'Terrain', [
                paint('surface', [entry('coarse_dirt', 3), entry('gravel')], {field: {type: 'directional', axis: 0, scale: 5, strength: 4}, when: ground}),
                paint('surface', [entry('grass_path')], {id: 'center', field: {type: 'gaussian', strength: .42},
                    when: {op: 'or', children: [ground, {op: 'in', value: ['gravel', 'coarse_dirt']}]}})
            ], {type: 'band', radius: 3, width: 5, orientation: 'stroke', falloff: .35}),
            recipe('woodland-edge', 'Woodland Edge', 'An artistic grassland-to-woodland gradient from the stroke center.', 'Ecosystem', [
                flowers('shade', [entry('fern', 5), entry('brown_mushroom')],
                    {type: 'multiply', inputs: [{type: 'gaussian', strength: .5}, patches(9, 2, 4)]}, .8),
                flowers('meadow', [entry('dandelion'), entry('short_grass', 3)],
                    {type: 'multiply', inputs: [{type: 'edge'}, patches(11, 2, 4)]}, .65)
            ], {radius: 13}),
            validate({...recipe('aging', 'Aging Stone', 'Successive strokes crack stone bricks and then allow moss in damp areas.', 'Rules', [
                rules(worldRule('crack', and(is('stone_bricks'), weather), {type: 'replace', block: 'cracked_stone_bricks'}),
                    worldRule('overgrow', and(is('cracked_stone_bricks'), wet), {type: 'replace', block: 'mossy_stone_bricks'}))
            ], {type: 'sphere', radius: 6}), policy: 'evolve'})
        ];
    }

    function featuredBuiltinRecipes() {
        const complete = new Map(builtinRecipes().map(recipe => [recipe.id, recipe]));
        return FEATURED_BUILTIN_IDS.map(id => {
            if (!complete.has(id)) fail('featured built-in', `missing ${id}`);
            return complete.get(id);
        });
    }

    // Projects store the whole selected recipe, so correcting a built-in does
    // not affect an already-selected copy. Upgrade only its unchanged legacy
    // rule, preserving user-edited shape, passes and metadata.
    function migrateBuiltinRecipe(value) {
        const recipe = validate(value);
        if (recipe.id !== 'builtin:grass-maintenance' || recipe.version !== 1) return recipe;
        const pass = recipe.passes[0], rule = pass?.rules[0];
        if (recipe.passes.length !== 1 || pass.mode !== 'rules' || pass.rules.length !== 1
            || rule.id !== 'grass' || rule.action.type !== 'replace'
            || rule.action.block !== 'minecraft:dirt' || rule.action.offset.some(n => n !== 0)) return recipe;
        const expected = condition({op: 'and', children: [
            {op: 'is', value: 'grass_block'}, {op: 'exists', query: 'above'},
            {op: 'trait', value: 'nonSolid', query: 'above'}
        ]}, 'legacy grass maintenance');
        if (JSON.stringify(rule.when) !== JSON.stringify(expected)) return recipe;
        const upgraded = JSON.parse(JSON.stringify(recipe));
        upgraded.version = 2;
        upgraded.passes[0].rules[0].when.children[2].value = 'solid';
        if (upgraded.description === 'Turns grass to dirt beneath an occupied, known non-solid block.') {
            upgraded.description = 'Turns grass to dirt when covered by a known solid block; plants and air leave grass intact.';
        }
        return validate(upgraded);
    }

    return {FORMAT, LIMIT, MAX_FILE, SHAPES, FIELDS, CONTEXTS, TRAITS, OPERATORS, QUERIES, METRICS, RELATIONS,
        ACTIONS, MODES, POLICIES, ORIENTATIONS, FEATURED_BUILTIN_IDS, validate, encode, decode, fieldValue, hash, salt, createStroke,
        plan, evaluate, contextValue, builtinRecipes, featuredBuiltinRecipes, migrateBuiltinRecipe, analyzeRegion};
})();

if (typeof module !== 'undefined' && module.exports) module.exports = BedrockWorldBrush;
