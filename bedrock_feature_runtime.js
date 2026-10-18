/**
 * Minecraft Bedrock Feature Runtime
 * ================================
 *
 * Data-driven parser/interpreter for Bedrock behavior-pack features and
 * feature_rules. The runtime deliberately separates documented placement
 * semantics from engine-private procedural kernels (tree/ore/geode/carvers).
 * In strictParity mode an unverified/private kernel is never approximated: the
 * caller must inject an oracle-verified implementation through services.kernels.
 *
 * The file has no dependencies and works in Node.js, modern browsers and
 * Blockbench. A host may inject Molang, block-rule, biome, structure-template
 * and generator services without coupling the core runtime to Blockbench.
 */

const BedrockFeatureRuntime = (() => {
    'use strict';

    const PUBLIC_FEATURE_TYPES = Object.freeze([
        'minecraft:aggregate_feature',
        'minecraft:cave_carver_feature',
        'minecraft:fossil_feature',
        'minecraft:geode_feature',
        'minecraft:growing_plant_feature',
        'minecraft:height_difference_filter_feature',
        'minecraft:horizontal_tree_decoration_feature',
        'minecraft:multiface_feature',
        'minecraft:multipart_block_column_feature',
        'minecraft:multi_block_feature',
        'minecraft:nether_cave_carver_feature',
        'minecraft:ore_feature',
        'minecraft:partially_exposed_blob_feature',
        'minecraft:scatter_feature',
        'minecraft:search_feature',
        'minecraft:sequence_feature',
        'minecraft:single_block_feature',
        'minecraft:snap_to_surface_feature',
        'minecraft:structure_template_feature',
        'minecraft:surface_relative_threshold_feature',
        'minecraft:tree_feature',
        'minecraft:underwater_cave_carver_feature',
        'minecraft:vegetation_patch_feature',
        'minecraft:weighted_random_feature',
    ]);

    const PUBLIC_FEATURE_TYPE_SET = new Set(PUBLIC_FEATURE_TYPES);
    const INTERNAL_OR_LEGACY_FEATURE_TYPES = new Set([
        'minecraft:beards_and_shavers',
        'minecraft:conditional_list',
        'minecraft:rect_layout',
        'minecraft:scan_surface',
        'minecraft:sculk_patch_feature',
    ]);

    const PRIVATE_KERNEL_TYPES = new Set([
        'minecraft:cave_carver_feature',
        'minecraft:fossil_feature',
        'minecraft:geode_feature',
        'minecraft:growing_plant_feature',
        'minecraft:height_difference_filter_feature',
        'minecraft:horizontal_tree_decoration_feature',
        'minecraft:multiface_feature',
        'minecraft:multipart_block_column_feature',
        'minecraft:multi_block_feature',
        'minecraft:nether_cave_carver_feature',
        'minecraft:ore_feature',
        'minecraft:partially_exposed_blob_feature',
        'minecraft:structure_template_feature',
        'minecraft:tree_feature',
        'minecraft:underwater_cave_carver_feature',
        'minecraft:vegetation_patch_feature',
    ]);

    class BedrockFeatureError extends Error {
        constructor(message, details = {}) {
            super(message);
            this.name = 'BedrockFeatureError';
            this.code = details.code || 'BEDROCK_FEATURE_ERROR';
            this.path = details.path || null;
            this.featureId = details.featureId || null;
            this.featureType = details.featureType || null;
            this.sourceName = details.sourceName || null;
            if (details.cause !== undefined) this.cause = details.cause;
        }
    }

    class BedrockFeatureParseError extends BedrockFeatureError {
        constructor(message, details = {}) {
            super(message, {...details, code: details.code || 'BEDROCK_FEATURE_PARSE_ERROR'});
            this.name = 'BedrockFeatureParseError';
        }
    }

    class BedrockFeatureParityError extends BedrockFeatureError {
        constructor(message, details = {}) {
            super(message, {...details, code: details.code || 'BEDROCK_FEATURE_PARITY_UNAVAILABLE'});
            this.name = 'BedrockFeatureParityError';
        }
    }

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function deepClone(value) {
        if (Array.isArray(value)) return value.map(deepClone);
        if (!isObject(value)) return value;
        const out = Object.create(null);
        for (const [key, entry] of Object.entries(value)) out[key] = deepClone(entry);
        return out;
    }

    function asInteger(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.trunc(number) : fallback;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function normalizeIdentifier(value, kind = 'identifier') {
        if (typeof value !== 'string' || !value.trim()) {
            throw new BedrockFeatureParseError(`${kind} must be a non-empty string.`, {code: 'INVALID_IDENTIFIER'});
        }
        const id = value.trim();
        return id.includes(':') ? id : `minecraft:${id}`;
    }

    function normalizePosition(value, fallback = {x: 0, y: 0, z: 0}) {
        if (Array.isArray(value)) {
            return {x: asInteger(value[0]), y: asInteger(value[1]), z: asInteger(value[2])};
        }
        if (isObject(value)) {
            return {x: asInteger(value.x), y: asInteger(value.y), z: asInteger(value.z)};
        }
        return {x: fallback.x, y: fallback.y, z: fallback.z};
    }

    function addPosition(a, b) {
        return {x: a.x + b.x, y: a.y + b.y, z: a.z + b.z};
    }

    function positionKey(pos) {
        return `${pos.x},${pos.y},${pos.z}`;
    }

    function samePosition(a, b) {
        return a.x === b.x && a.y === b.y && a.z === b.z;
    }

    function compareVersion(a, b) {
        const pa = String(a || '0').split('.').map(v => asInteger(v));
        const pb = String(b || '0').split('.').map(v => asInteger(v));
        const length = Math.max(pa.length, pb.length);
        for (let i = 0; i < length; i++) {
            const delta = (pa[i] || 0) - (pb[i] || 0);
            if (delta) return Math.sign(delta);
        }
        return 0;
    }

    function parseJsonInput(input, sourceName = null) {
        if (typeof input === 'string') {
            try {
                return JSON.parse(input);
            } catch (cause) {
                throw new BedrockFeatureParseError(`Invalid JSON${sourceName ? ` in ${sourceName}` : ''}.`, {
                    code: 'INVALID_JSON', sourceName, cause,
                });
            }
        }
        if (!isObject(input)) {
            throw new BedrockFeatureParseError('Feature input must be a JSON object or JSON string.', {
                code: 'INVALID_DOCUMENT', sourceName,
            });
        }
        return input;
    }

    function featureKeys(document) {
        return Object.keys(document).filter(key => (
            key !== 'format_version' &&
            (PUBLIC_FEATURE_TYPE_SET.has(key) || INTERNAL_OR_LEGACY_FEATURE_TYPES.has(key) || /^minecraft:.+_feature$/.test(key))
        ));
    }

    function parseFeatureDocument(input, options = {}) {
        const sourceName = options.sourceName || null;
        const document = parseJsonInput(input, sourceName);
        const keys = featureKeys(document);
        if (keys.length !== 1) {
            throw new BedrockFeatureParseError(
                `Expected exactly one feature component; found ${keys.length}.`,
                {code: 'FEATURE_COMPONENT_COUNT', sourceName}
            );
        }
        const type = keys[0];
        const value = document[type];
        if (!isObject(value)) {
            throw new BedrockFeatureParseError(`${type} must contain an object.`, {
                code: 'INVALID_FEATURE_BODY', sourceName, featureType: type,
            });
        }
        const identifier = normalizeIdentifier(value.description?.identifier, 'Feature description.identifier');
        const formatVersion = String(document.format_version || value.format_version || options.defaultFormatVersion || '1.13.0');
        return Object.freeze({
            kind: 'feature',
            identifier,
            type,
            formatVersion,
            sourceName,
            body: deepClone(value),
            raw: deepClone(document),
            public: PUBLIC_FEATURE_TYPE_SET.has(type),
        });
    }

    function parseFeatureRuleDocument(input, options = {}) {
        const sourceName = options.sourceName || null;
        const document = parseJsonInput(input, sourceName);
        const value = document['minecraft:feature_rules'];
        if (!isObject(value)) {
            throw new BedrockFeatureParseError('Document does not contain minecraft:feature_rules.', {
                code: 'MISSING_FEATURE_RULES', sourceName,
            });
        }
        const identifier = normalizeIdentifier(value.description?.identifier, 'Feature rule description.identifier');
        const placesFeature = normalizeIdentifier(value.description?.places_feature || value.places_feature, 'Feature rule places_feature');
        const conditions = isObject(value.conditions) ? deepClone(value.conditions) : Object.create(null);
        const distribution = isObject(value.distribution) ? deepClone(value.distribution) : Object.create(null);
        return Object.freeze({
            kind: 'feature_rule',
            identifier,
            placesFeature,
            formatVersion: String(document.format_version || options.defaultFormatVersion || '1.13.0'),
            sourceName,
            conditions,
            distribution,
            body: deepClone(value),
            raw: deepClone(document),
        });
    }

    class FeatureRegistry {
        constructor() {
            this.features = new Map();
            this.rules = new Map();
        }

        registerFeature(document, options = {}) {
            const feature = document?.kind === 'feature' ? document : parseFeatureDocument(document, options);
            this.features.set(feature.identifier, feature);
            return feature;
        }

        registerRule(document, options = {}) {
            const rule = document?.kind === 'feature_rule' ? document : parseFeatureRuleDocument(document, options);
            this.rules.set(rule.identifier, rule);
            return rule;
        }

        registerDocument(document, options = {}) {
            const raw = parseJsonInput(document, options.sourceName || null);
            if (raw['minecraft:feature_rules']) return this.registerRule(raw, options);
            return this.registerFeature(raw, options);
        }

        getFeature(id) {
            return this.features.get(normalizeIdentifier(id)) || null;
        }

        getRule(id) {
            return this.rules.get(normalizeIdentifier(id)) || null;
        }

        requireFeature(id) {
            const feature = this.getFeature(id);
            if (!feature) throw new BedrockFeatureError(`Unknown feature '${id}'.`, {code: 'UNKNOWN_FEATURE', featureId: id});
            return feature;
        }

        requireRule(id) {
            const rule = this.getRule(id);
            if (!rule) throw new BedrockFeatureError(`Unknown feature rule '${id}'.`, {code: 'UNKNOWN_FEATURE_RULE', featureId: id});
            return rule;
        }

        clear() {
            this.features.clear();
            this.rules.clear();
        }
    }

    function registerBehaviorPackDocuments(registry, documents, options = {}) {
        const target = registry || new FeatureRegistry();
        const loaded = [];
        const errors = [];
        for (const entry of documents || []) {
            const sourceName = entry?.sourceName || entry?.name || null;
            const content = entry?.content ?? entry?.text ?? entry;
            try {
                loaded.push(target.registerDocument(content, {sourceName, defaultFormatVersion: options.defaultFormatVersion}));
            } catch (error) {
                if (options.strict !== false) throw error;
                errors.push({sourceName, error});
            }
        }
        return {registry: target, loaded, errors};
    }

    function loadBehaviorPackDirectory(rootPath, options = {}) {
        if (typeof require !== 'function') {
            throw new BedrockFeatureError('Directory loading is only available in a Node/Blockbench Desktop environment.', {
                code: 'FILESYSTEM_UNAVAILABLE',
            });
        }
        const fs = require('node:fs');
        const path = require('node:path');
        const root = path.resolve(String(rootPath || ''));
        const registry = options.registry || new FeatureRegistry();
        const loaded = [];
        const errors = [];
        const visit = (directory, kind) => {
            if (!fs.existsSync(directory)) return;
            const stack = [directory];
            while (stack.length) {
                const current = stack.pop();
                for (const item of fs.readdirSync(current, {withFileTypes: true})) {
                    const full = path.join(current, item.name);
                    if (item.isDirectory()) {
                        stack.push(full);
                        continue;
                    }
                    if (!item.isFile() || path.extname(item.name).toLowerCase() !== '.json') continue;
                    try {
                        const source = fs.readFileSync(full, 'utf8');
                        const parsed = kind === 'rule'
                            ? registry.registerRule(source, {sourceName: full})
                            : registry.registerFeature(source, {sourceName: full});
                        loaded.push(parsed);
                    } catch (error) {
                        if (options.strict !== false) throw error;
                        errors.push({sourceName: full, error});
                    }
                }
            }
        };
        visit(path.join(root, 'features'), 'feature');
        visit(path.join(root, 'feature_rules'), 'rule');
        return {root, registry, loaded, errors};
    }

    class TraceSink {
        constructor(enabled = true) {
            this.enabled = enabled !== false;
            this.events = [];
            this.sequence = 0;
        }

        push(type, data = {}) {
            if (!this.enabled) return null;
            const event = Object.freeze({index: this.sequence++, type, ...deepClone(data)});
            this.events.push(event);
            return event;
        }

        snapshot() {
            return this.events.slice();
        }
    }

    class SequenceRandom {
        constructor(values = []) {
            this.values = Array.from(values, Number);
            this.index = 0;
            this.exact = true;
            this.name = 'sequence';
        }

        _nextUnit() {
            if (this.index >= this.values.length) {
                throw new BedrockFeatureParityError('SequenceRandom exhausted.', {code: 'RNG_EXHAUSTED'});
            }
            const value = Number(this.values[this.index++]);
            if (!Number.isFinite(value)) throw new BedrockFeatureParityError('SequenceRandom contains a non-finite value.');
            return value >= 0 && value < 1 ? value : ((value % 1) + 1) % 1;
        }

        nextFloat() {
            return this._nextUnit();
        }

        nextInt(bound) {
            const n = asInteger(bound);
            if (n <= 0) throw new RangeError('nextInt(bound) requires bound > 0.');
            return Math.min(n - 1, Math.floor(this._nextUnit() * n));
        }

        nextU32() {
            return Math.floor(this._nextUnit() * 0x100000000) >>> 0;
        }
    }

    class DeterministicFallbackRandom {
        constructor(seed = 0x6d2b79f5) {
            this.state = (Number(seed) >>> 0) || 0x6d2b79f5;
            this.exact = false;
            this.name = 'mulberry32-fallback';
        }

        nextU32() {
            let t = this.state += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return (t ^ (t >>> 14)) >>> 0;
        }

        nextFloat() {
            return this.nextU32() / 0x100000000;
        }

        nextInt(bound) {
            const n = asInteger(bound);
            if (n <= 0) throw new RangeError('nextInt(bound) requires bound > 0.');
            return Math.floor(this.nextFloat() * n);
        }
    }

    function adaptRandom(random, options = {}) {
        if (!random) {
            if (options.strictParity) {
                throw new BedrockFeatureParityError(
                    'Strict Bedrock parity requires an injected RNG implementation; JavaScript Math.random/fallback RNG is not accepted.',
                    {code: 'EXACT_RNG_REQUIRED'}
                );
            }
            return new DeterministicFallbackRandom(options.seed || 0);
        }
        if (typeof random.nextFloat !== 'function' || typeof random.nextInt !== 'function') {
            throw new TypeError('RandomSource must implement nextFloat() and nextInt(bound).');
        }
        if (options.strictParity && random.exact !== true) {
            throw new BedrockFeatureParityError('Injected RNG is not marked exact=true.', {code: 'EXACT_RNG_REQUIRED'});
        }
        return random;
    }

    function traceRandom(random, trace, featureId, operation, argument, result) {
        trace?.push('rng', {featureId, operation, argument, result});
        return result;
    }

    function nextFloat(ctx, reason = null) {
        const value = ctx.rng.nextFloat();
        return traceRandom(ctx.rng, ctx.trace, ctx.featureId, 'nextFloat', reason, value);
    }

    function nextInt(ctx, bound, reason = null) {
        const value = ctx.rng.nextInt(bound);
        return traceRandom(ctx.rng, ctx.trace, ctx.featureId, 'nextInt', {bound, reason}, value);
    }

    function normalizeBlockState(value) {
        if (typeof value === 'string') return Object.freeze({name: normalizeIdentifier(value, 'block identifier'), states: Object.freeze({})});
        if (!isObject(value)) throw new BedrockFeatureParseError('Block reference must be a string or object.', {code: 'INVALID_BLOCK_REFERENCE'});
        const name = normalizeIdentifier(value.name || value.block || value.identifier, 'block identifier');
        const states = isObject(value.states) ? Object.freeze({...value.states}) : Object.freeze({});
        return Object.freeze({name, states});
    }

    function blockMatchesDescriptor(block, descriptor, services = {}) {
        if (descriptor == null) return false;
        if (typeof services.blockMatchesDescriptor === 'function') {
            return services.blockMatchesDescriptor(block, descriptor);
        }
        if (typeof descriptor === 'string') return block?.name === normalizeIdentifier(descriptor, 'block identifier');
        if (!isObject(descriptor)) return false;
        if (descriptor.tags || descriptor.tag) {
            const tags = descriptor.tags || [descriptor.tag];
            if (typeof services.blockHasTag !== 'function') return false;
            if (!Array.from(tags).some(tag => services.blockHasTag(block, tag))) return false;
        }
        if (descriptor.name && block?.name !== normalizeIdentifier(descriptor.name, 'block identifier')) return false;
        if (isObject(descriptor.states)) {
            for (const [key, value] of Object.entries(descriptor.states)) {
                if (block?.states?.[key] !== value) return false;
            }
        }
        return true;
    }

    function blockMatchesAny(block, list, services = {}) {
        if (!Array.isArray(list)) return false;
        return list.some(entry => blockMatchesDescriptor(block, entry, services));
    }

    function weightedEntries(value, itemKey = null) {
        if (!Array.isArray(value)) return [{value, weight: 1}];
        if (value.length === 0) return [];
        const pairList = value.every(entry => Array.isArray(entry) && entry.length >= 2 && Number.isFinite(Number(entry[1])));
        if (pairList) return value.map(entry => ({value: entry[0], weight: Math.max(0, Number(entry[1]))}));
        const objectWeighted = value.every(entry => isObject(entry) && Number.isFinite(Number(entry.weight)));
        if (objectWeighted) {
            return value.map(entry => ({
                value: itemKey ? entry[itemKey] : (entry.value ?? entry.block ?? entry.feature),
                weight: Math.max(0, Number(entry.weight)),
            }));
        }
        return value.map(entry => ({value: entry, weight: 1}));
    }

    function chooseWeighted(value, ctx, itemKey = null, reason = 'weighted_choice') {
        const entries = weightedEntries(value, itemKey).filter(entry => entry.weight > 0);
        if (!entries.length) throw new BedrockFeatureError('Weighted list has no positive weights.', {code: 'EMPTY_WEIGHTED_LIST'});
        const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
        const needle = nextFloat(ctx, reason) * total;
        let cursor = 0;
        for (const entry of entries) {
            cursor += entry.weight;
            if (needle < cursor) return entry.value;
        }
        return entries[entries.length - 1].value;
    }

    function evalMolang(expression, ctx, purpose = 'expression') {
        if (typeof expression === 'number') return expression;
        if (typeof expression === 'boolean') return expression ? 1 : 0;
        if (expression == null) return 0;
        if (typeof expression !== 'string') {
            throw new BedrockFeatureError(`Cannot evaluate ${purpose}: unsupported expression type.`, {code: 'MOLANG_TYPE'});
        }
        const trimmed = expression.trim();
        if (trimmed === '') return 0;
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) return numeric;
        if (!ctx.molang || typeof ctx.molang.evaluate !== 'function') {
            throw new BedrockFeatureParityError(`Molang evaluator required for '${expression}'.`, {code: 'MOLANG_EVALUATOR_REQUIRED'});
        }
        const value = Number(ctx.molang.evaluate(expression, {
            origin: {...ctx.origin},
            current: {...ctx.currentPosition},
            variables: ctx.variables,
            iteration: ctx.iteration,
            world: ctx.world,
            rng: ctx.rng,
            featureId: ctx.featureId,
        }));
        if (!Number.isFinite(value)) {
            throw new BedrockFeatureError(`Molang expression returned non-finite value for ${purpose}.`, {code: 'MOLANG_NONFINITE'});
        }
        ctx.trace?.push('molang', {featureId: ctx.featureId, expression, purpose, result: value});
        return value;
    }

    function evaluateRange(value, ctx, options = {}) {
        if (typeof value === 'number' || typeof value === 'string') return evalMolang(value, ctx, options.reason || 'value');
        if (!isObject(value)) return Number(value) || 0;
        if ('range_min' in value || 'range_max' in value) {
            const min = evalMolang(value.range_min ?? 0, ctx, `${options.reason || 'range'}.min`);
            const max = evalMolang(value.range_max ?? min, ctx, `${options.reason || 'range'}.max`);
            if (options.integer !== false) {
                const low = Math.min(Math.trunc(min), Math.trunc(max));
                const high = Math.max(Math.trunc(min), Math.trunc(max));
                return low + nextInt(ctx, high - low + 1, options.reason || 'range');
            }
            return Math.min(min, max) + nextFloat(ctx, options.reason || 'range') * Math.abs(max - min);
        }
        return evalMolang(value.value ?? 0, ctx, options.reason || 'value');
    }

    const DEFAULT_SEMANTICS = Object.freeze({
        distributionExtentUpperInclusive: false,
        numericScatterChanceScale: 'auto',
        defaultCoordinateEvalOrder: 'xzy',
        searchRequiredSuccesses: 1,
    });

    function evaluateChance(value, ctx, semantics = DEFAULT_SEMANTICS, reason = 'chance') {
        if (value == null) return true;
        if (isObject(value) && 'numerator' in value && 'denominator' in value) {
            const denominator = Math.max(1, Math.abs(asInteger(evalMolang(value.denominator, ctx, `${reason}.denominator`), 1)));
            const numerator = clamp(evalMolang(value.numerator, ctx, `${reason}.numerator`), 0, denominator);
            return nextFloat(ctx, reason) < numerator / denominator;
        }
        let chance = evalMolang(value, ctx, reason);
        if (semantics.numericScatterChanceScale === 'percent' || (semantics.numericScatterChanceScale === 'auto' && chance > 1)) {
            chance /= 100;
        }
        return nextFloat(ctx, reason) < clamp(chance, 0, 1);
    }

    function normalizeDistribution(value) {
        if (value == null) return {kind: 'constant', value: 0};
        if (typeof value === 'number' || typeof value === 'string') return {kind: 'expression', value};
        if (!isObject(value)) return {kind: 'constant', value: Number(value) || 0};
        if ('range_min' in value || 'range_max' in value) return {kind: 'range', value};
        return {
            kind: String(value.distribution || 'uniform').toLowerCase(),
            extent: Array.isArray(value.extent) ? value.extent.slice(0, 2) : [0, 0],
            stepSize: value.step_size == null ? 1 : value.step_size,
            gridOffset: value.grid_offset == null ? 0 : value.grid_offset,
            raw: value,
        };
    }

    function distributionBounds(spec, ctx, reason) {
        const extent = Array.isArray(spec.extent) ? spec.extent : [0, 0];
        const a = evalMolang(extent[0] ?? 0, ctx, `${reason}.extent_min`);
        const b = evalMolang(extent[1] ?? a, ctx, `${reason}.extent_max`);
        return [Math.min(a, b), Math.max(a, b)];
    }

    function evaluateDistribution(value, ctx, semantics = DEFAULT_SEMANTICS, reason = 'distribution') {
        const spec = normalizeDistribution(value);
        if (spec.kind === 'constant') return Number(spec.value) || 0;
        if (spec.kind === 'expression') return evalMolang(spec.value, ctx, reason);
        if (spec.kind === 'range') return evaluateRange(spec.value, ctx, {reason});
        const [minRaw, maxRaw] = distributionBounds(spec, ctx, reason);
        const min = Math.ceil(minRaw);
        const max = Math.floor(maxRaw);
        if (max < min) return min;
        const count = semantics.distributionExtentUpperInclusive ? (max - min + 1) : Math.max(1, max - min);
        const uniform = () => min + nextInt(ctx, count, reason);
        switch (spec.kind) {
            case 'uniform':
                return uniform();
            case 'gaussian': {
                // Bedrock documentation exposes the distribution but not its exact
                // RNG transform. Strict parity therefore requires an injected kernel.
                const kernel = ctx.services?.distributions?.gaussian;
                if (kernel) return kernel({min, max, spec, ctx});
                if (ctx.strictParity) throw new BedrockFeatureParityError('Exact gaussian distribution kernel is not injected.', {code: 'GAUSSIAN_KERNEL_REQUIRED'});
                return Math.round((uniform() + uniform()) / 2);
            }
            case 'inverse_gaussian': {
                const kernel = ctx.services?.distributions?.inverseGaussian;
                if (kernel) return kernel({min, max, spec, ctx});
                if (ctx.strictParity) throw new BedrockFeatureParityError('Exact inverse_gaussian distribution kernel is not injected.', {code: 'INVERSE_GAUSSIAN_KERNEL_REQUIRED'});
                const center = (min + max) / 2;
                const g = Math.round((uniform() + uniform()) / 2);
                return clamp(Math.round(g < center ? max - (g - min) : min + (max - g)), min, max);
            }
            case 'triangle': {
                const kernel = ctx.services?.distributions?.triangle;
                if (kernel) return kernel({min, max, spec, ctx});
                if (ctx.strictParity) throw new BedrockFeatureParityError('Exact triangle distribution kernel is not injected.', {code: 'TRIANGLE_KERNEL_REQUIRED'});
                return Math.round((uniform() + uniform()) / 2);
            }
            case 'fixed_grid':
            case 'jittered_grid': {
                const step = Math.max(1, Math.abs(asInteger(evalMolang(spec.stepSize, ctx, `${reason}.step_size`), 1)));
                const offset = asInteger(evalMolang(spec.gridOffset, ctx, `${reason}.grid_offset`), 0);
                const slots = Math.max(1, Math.floor((Math.max(min, max - 1) - min) / step) + 1);
                const index = Math.abs(asInteger(ctx.iteration, 0)) % slots;
                let result = min + index * step + offset;
                if (spec.kind === 'jittered_grid') {
                    const kernel = ctx.services?.distributions?.jitteredGrid;
                    if (kernel) return kernel({min, max, step, offset, index, spec, ctx});
                    if (ctx.strictParity) throw new BedrockFeatureParityError('Exact jittered_grid kernel is not injected.', {code: 'JITTERED_GRID_KERNEL_REQUIRED'});
                    result += nextInt(ctx, step, reason);
                }
                return clamp(result, min, semantics.distributionExtentUpperInclusive ? max : Math.max(min, max - 1));
            }
            default:
                throw new BedrockFeatureError(`Unsupported distribution '${spec.kind}'.`, {code: 'UNSUPPORTED_DISTRIBUTION'});
        }
    }

    class SparseWorld {
        constructor(options = {}) {
            this.blocks = new Map();
            this.defaultBlock = normalizeBlockState(options.defaultBlock || 'minecraft:air');
            this.biomeAt = typeof options.biomeAt === 'function' ? options.biomeAt : (() => options.defaultBiome || 'minecraft:plains');
            this.surfaceAt = typeof options.surfaceAt === 'function' ? options.surfaceAt : null;
            this.supportsFace = typeof options.supportsFace === 'function' ? options.supportsFace : null;
            this.minY = Number.isFinite(options.minY) ? asInteger(options.minY) : -64;
            this.maxY = Number.isFinite(options.maxY) ? asInteger(options.maxY) : 319;
        }

        getBlock(pos) {
            return this.blocks.get(positionKey(normalizePosition(pos))) || this.defaultBlock;
        }

        setBlock(pos, block) {
            const p = normalizePosition(pos);
            const state = normalizeBlockState(block);
            this.blocks.set(positionKey(p), state);
            return state;
        }

        deleteBlock(pos) {
            this.blocks.delete(positionKey(normalizePosition(pos)));
        }

        getBiome(pos) {
            return this.biomeAt(normalizePosition(pos));
        }

        getSurfaceY(x, z) {
            if (this.surfaceAt) return this.surfaceAt(asInteger(x), asInteger(z));
            for (let y = this.maxY; y >= this.minY; y--) {
                const block = this.getBlock({x, y, z});
                if (block.name !== 'minecraft:air' && this.getBlock({x, y: y + 1, z}).name === 'minecraft:air') return y;
            }
            return null;
        }

        canSupport(pos, face) {
            if (this.supportsFace) return !!this.supportsFace(normalizePosition(pos), face, this.getBlock(pos));
            return this.getBlock(pos).name !== 'minecraft:air';
        }

        beginTransaction() {
            return new WorldTransaction(this);
        }
    }

    class WorldTransaction {
        constructor(parent) {
            this.parent = parent;
            this.overlay = new Map();
            this.closed = false;
            this.minY = parent.minY;
            this.maxY = parent.maxY;
        }

        getBlock(pos) {
            const key = positionKey(normalizePosition(pos));
            return this.overlay.has(key) ? this.overlay.get(key) : this.parent.getBlock(pos);
        }

        setBlock(pos, block) {
            if (this.closed) throw new Error('Transaction is closed.');
            const state = normalizeBlockState(block);
            this.overlay.set(positionKey(normalizePosition(pos)), state);
            return state;
        }

        getBiome(pos) { return this.parent.getBiome(pos); }
        getSurfaceY(x, z) {
            for (let y = this.maxY ?? 319; y >= (this.minY ?? -64); y--) {
                const here = this.getBlock({x, y, z});
                const above = this.getBlock({x, y: y + 1, z});
                if (here.name !== 'minecraft:air' && above.name === 'minecraft:air') return y;
            }
            return this.parent.getSurfaceY?.(x, z) ?? null;
        }
        canSupport(pos, face) { return this.parent.canSupport?.(pos, face) ?? this.getBlock(pos).name !== 'minecraft:air'; }
        beginTransaction() { return new WorldTransaction(this); }

        commit() {
            if (this.closed) return;
            for (const [key, block] of this.overlay) {
                if (this.parent instanceof WorldTransaction) this.parent.overlay.set(key, block);
                else this.parent.blocks.set(key, block);
            }
            this.closed = true;
        }

        rollback() {
            this.overlay.clear();
            this.closed = true;
        }

        entries() {
            return Array.from(this.overlay.entries());
        }
    }

    function ensureWorld(world) {
        if (!world || typeof world.getBlock !== 'function' || typeof world.setBlock !== 'function') {
            throw new TypeError('WorldView must implement getBlock(pos) and setBlock(pos, block).');
        }
        return world;
    }

    function placementResult(success, outputPosition, extra = {}) {
        return Object.freeze({success: !!success, outputPosition: normalizePosition(outputPosition), ...extra});
    }

    function childContext(ctx, overrides = {}) {
        const currentPosition = normalizePosition(overrides.currentPosition || ctx.currentPosition);
        return {
            ...ctx,
            ...overrides,
            currentPosition,
            featureId: overrides.featureId || ctx.featureId,
            iteration: overrides.iteration == null ? ctx.iteration : overrides.iteration,
            variables: overrides.variables || ctx.variables,
        };
    }

    function getFeatureReference(body, keys) {
        for (const key of keys) {
            if (typeof body[key] === 'string') return normalizeIdentifier(body[key]);
        }
        return null;
    }

    const FACE_OFFSETS = Object.freeze({
        down: {x: 0, y: -1, z: 0},
        up: {x: 0, y: 1, z: 0},
        north: {x: 0, y: 0, z: -1},
        south: {x: 0, y: 0, z: 1},
        west: {x: -1, y: 0, z: 0},
        east: {x: 1, y: 0, z: 0},
    });

    function resolvePlacementBlock(value, ctx, reason = 'places_block') {
        const selected = Array.isArray(value) ? chooseWeighted(value, ctx, null, reason) : value;
        return normalizeBlockState(selected);
    }

    function canReplaceAt(world, pos, allowlist, services) {
        if (!Array.isArray(allowlist) || allowlist.length === 0) return true;
        return blockMatchesAny(world.getBlock(pos), allowlist, services);
    }

    function checkAttachRules(body, world, pos, services) {
        const allow = body.may_attach_to;
        const deny = body.may_not_attach_to;
        if (!allow && !deny) return true;
        const entries = Object.entries(FACE_OFFSETS);
        if (Array.isArray(deny) && entries.some(([, offset]) => blockMatchesAny(world.getBlock(addPosition(pos, offset)), deny, services))) {
            return false;
        }
        if (!Array.isArray(allow) || allow.length === 0) return true;
        return entries.some(([, offset]) => blockMatchesAny(world.getBlock(addPosition(pos, offset)), allow, services));
    }

    function rotateBlockCardinal(block, ctx) {
        const directions = ['north', 'east', 'south', 'west'];
        const direction = directions[nextInt(ctx, 4, 'randomize_rotation')];
        return Object.freeze({name: block.name, states: Object.freeze({...block.states, 'minecraft:cardinal_direction': direction})});
    }

    function genericKernel(runtime, feature, ctx) {
        const kernel = ctx.services?.kernels?.[feature.type] || ctx.services?.kernels?.[feature.type.replace(/^minecraft:/, '')];
        if (!kernel) {
            throw new BedrockFeatureParityError(
                `No oracle-verified kernel is installed for ${feature.type}.`,
                {featureId: feature.identifier, featureType: feature.type, code: 'KERNEL_REQUIRED'}
            );
        }
        return kernel({runtime, feature, body: feature.body, context: ctx});
    }

    class FeatureRuntime {
        constructor(options = {}) {
            this.registry = options.registry || new FeatureRegistry();
            this.strictParity = options.strictParity !== false;
            this.semantics = Object.freeze({...DEFAULT_SEMANTICS, ...(options.semantics || {})});
            this.services = options.services || Object.create(null);
            this.handlers = new Map();
            this.maxDepth = Math.max(1, asInteger(options.maxDepth, 128));
            this.installDefaultHandlers();
        }

        installDefaultHandlers() {
            this.handlers.set('minecraft:aggregate_feature', this.placeAggregate.bind(this));
            this.handlers.set('minecraft:sequence_feature', this.placeSequence.bind(this));
            this.handlers.set('minecraft:weighted_random_feature', this.placeWeightedRandom.bind(this));
            this.handlers.set('minecraft:scatter_feature', this.placeScatter.bind(this));
            this.handlers.set('minecraft:search_feature', this.placeSearch.bind(this));
            this.handlers.set('minecraft:single_block_feature', this.placeSingleBlock.bind(this));
            this.handlers.set('minecraft:snap_to_surface_feature', this.placeSnapToSurface.bind(this));
            this.handlers.set('minecraft:surface_relative_threshold_feature', this.placeSurfaceRelativeThreshold.bind(this));
            this.handlers.set('minecraft:partially_exposed_blob_feature', this.placePartiallyExposedBlob.bind(this));
            this.handlers.set('minecraft:growing_plant_feature', this.placeGrowingPlant.bind(this));
            for (const type of PRIVATE_KERNEL_TYPES) {
                if (!this.handlers.has(type)) this.handlers.set(type, (feature, ctx) => genericKernel(this, feature, ctx));
            }
        }

        registerHandler(type, handler) {
            if (typeof handler !== 'function') throw new TypeError('Feature handler must be a function.');
            this.handlers.set(String(type), handler);
            return this;
        }

        createContext(options = {}) {
            const world = ensureWorld(options.world);
            const rng = adaptRandom(options.rng, {strictParity: options.strictParity ?? this.strictParity, seed: options.seed});
            const origin = normalizePosition(options.origin || options.position);
            return {
                runtime: this,
                world,
                rng,
                molang: options.molang || this.services.molang || null,
                services: options.services ? {...this.services, ...options.services} : this.services,
                trace: options.trace === false ? null : (options.trace instanceof TraceSink ? options.trace : new TraceSink(true)),
                strictParity: options.strictParity ?? this.strictParity,
                semantics: Object.freeze({...this.semantics, ...(options.semantics || {})}),
                origin,
                currentPosition: normalizePosition(options.position || origin),
                placementBiome: options.placementBiome ?? world.getBiome?.(origin) ?? null,
                variables: options.variables || new Map(),
                iteration: asInteger(options.iteration, 0),
                featureId: options.featureId || null,
                depth: asInteger(options.depth, 0),
                formatVersion: options.formatVersion || null,
            };
        }

        place(featureId, options = {}) {
            const base = options.runtimeContext ? options.runtimeContext : this.createContext(options);
            return this._place(featureId, base);
        }

        _place(featureId, ctx) {
            if (ctx.depth >= this.maxDepth) {
                throw new BedrockFeatureError(`Feature recursion exceeded ${this.maxDepth}.`, {code: 'FEATURE_RECURSION_LIMIT', featureId});
            }
            const feature = this.registry.requireFeature(featureId);
            const handler = this.handlers.get(feature.type);
            if (!handler) {
                throw new BedrockFeatureError(`Unsupported feature type '${feature.type}'.`, {
                    code: 'UNSUPPORTED_FEATURE_TYPE', featureId: feature.identifier, featureType: feature.type,
                });
            }
            const local = childContext(ctx, {
                featureId: feature.identifier,
                formatVersion: feature.formatVersion,
                depth: ctx.depth + 1,
            });
            local.trace?.push('feature_begin', {featureId: feature.identifier, featureType: feature.type, position: local.currentPosition});
            let result;
            try {
                result = handler(feature, local);
            } catch (error) {
                local.trace?.push('feature_error', {featureId: feature.identifier, featureType: feature.type, message: error?.message || String(error)});
                throw error;
            }
            if (!result || typeof result.success !== 'boolean') {
                throw new BedrockFeatureError(`Handler for ${feature.type} returned an invalid result.`, {code: 'INVALID_HANDLER_RESULT'});
            }
            local.trace?.push('feature_end', {featureId: feature.identifier, featureType: feature.type, success: result.success, outputPosition: result.outputPosition});
            return result;
        }

        executeRule(ruleId, options = {}) {
            const rule = this.registry.requireRule(ruleId);
            const ctx = this.createContext({...options, formatVersion: rule.formatVersion, featureId: rule.identifier});
            const conditions = rule.conditions || {};
            if (conditions.placement_pass && options.placementPass && conditions.placement_pass !== options.placementPass) {
                return placementResult(false, ctx.currentPosition, {attempts: 0, reason: 'placement_pass'});
            }
            if (conditions['minecraft:biome_filter']) {
                const evaluator = ctx.services?.evaluateBiomeFilter;
                if (!evaluator) {
                    if (ctx.strictParity) throw new BedrockFeatureParityError('Biome filter evaluator is required in strict parity mode.', {code: 'BIOME_FILTER_EVALUATOR_REQUIRED'});
                } else if (!evaluator(conditions['minecraft:biome_filter'], {world: ctx.world, position: ctx.currentPosition, biome: ctx.placementBiome})) {
                    return placementResult(false, ctx.currentPosition, {attempts: 0, reason: 'biome_filter'});
                }
            }
            const distribution = rule.distribution || {};
            if (!evaluateChance(distribution.scatter_chance, ctx, ctx.semantics, 'feature_rule.scatter_chance')) {
                return placementResult(false, ctx.currentPosition, {attempts: 0, reason: 'scatter_chance'});
            }
            const iterations = Math.max(0, asInteger(evalMolang(distribution.iterations ?? 1, ctx, 'feature_rule.iterations'), 1));
            const order = String(distribution.coordinate_eval_order || ctx.semantics.defaultCoordinateEvalOrder || 'xzy').toLowerCase();
            let success = false;
            let output = ctx.currentPosition;
            let successes = 0;
            for (let i = 0; i < iterations; i++) {
                const candidate = this.evaluateCoordinates(distribution, ctx, order, i, ctx.currentPosition, 'feature_rule');
                const result = this._place(rule.placesFeature, childContext(ctx, {currentPosition: candidate, iteration: i, featureId: rule.identifier}));
                if (result.success) {
                    success = true;
                    successes++;
                    output = result.outputPosition;
                }
            }
            return placementResult(success, output, {attempts: iterations, successes, ruleId: rule.identifier});
        }

        evaluateCoordinates(distribution, ctx, order, iteration, basePosition, reasonPrefix) {
            const candidate = {...basePosition};
            const normalizedOrder = /^[xyz]{3}$/.test(order) && new Set(order).size === 3 ? order : 'xzy';
            const local = childContext(ctx, {iteration, currentPosition: candidate});
            for (const axis of normalizedOrder) {
                local.currentPosition = {...candidate};
                if (local.molang?.setCurrentPosition) local.molang.setCurrentPosition({...candidate});
                const offset = evaluateDistribution(distribution[axis] ?? 0, local, ctx.semantics, `${reasonPrefix}.${axis}`);
                candidate[axis] = basePosition[axis] + asInteger(offset);
                local.currentPosition = {...candidate};
                if (local.molang?.setCurrentPosition) local.molang.setCurrentPosition({...candidate});
            }
            ctx.trace?.push('candidate_position', {featureId: ctx.featureId, iteration, order: normalizedOrder, base: basePosition, candidate});
            return candidate;
        }

        placeAggregate(feature, ctx) {
            const body = feature.body;
            const features = Array.isArray(body.features) ? body.features.map(normalizeIdentifier) : [];
            const earlyOut = body.early_out || 'none';
            let anySuccess = false;
            let output = ctx.currentPosition;
            for (const id of features) {
                const result = this._place(id, childContext(ctx, {currentPosition: ctx.currentPosition}));
                if (result.success) {
                    anySuccess = true;
                    output = result.outputPosition;
                    if (earlyOut === 'first_success') break;
                } else if (earlyOut === 'first_failure') {
                    break;
                }
            }
            return placementResult(anySuccess, output);
        }

        placeSequence(feature, ctx) {
            const features = Array.isArray(feature.body.features) ? feature.body.features.map(normalizeIdentifier) : [];
            let current = ctx.currentPosition;
            for (const id of features) {
                const result = this._place(id, childContext(ctx, {currentPosition: current}));
                if (!result.success) return placementResult(false, current);
                current = result.outputPosition;
            }
            return placementResult(true, current);
        }

        placeWeightedRandom(feature, ctx) {
            const body = feature.body;
            const source = body.features || body.feature_choices || body.choices || [];
            const selected = chooseWeighted(source, ctx, null, 'weighted_random_feature');
            let id = selected;
            if (isObject(selected)) id = selected.feature || selected.places_feature || selected.value;
            if (Array.isArray(selected)) id = selected[0];
            return this._place(normalizeIdentifier(id), childContext(ctx, {currentPosition: ctx.currentPosition}));
        }

        placeScatter(feature, ctx) {
            const body = feature.body;
            const distribution = isObject(body.distribution) ? body.distribution : body;
            const placesFeature = getFeatureReference(body, ['places_feature', 'feature_to_place', 'feature']);
            if (!placesFeature) throw new BedrockFeatureError('scatter_feature is missing places_feature.', {code: 'MISSING_FEATURE_REFERENCE'});
            if (!evaluateChance(distribution.scatter_chance, ctx, ctx.semantics, 'scatter.scatter_chance')) {
                return placementResult(false, ctx.currentPosition, {attempts: 0});
            }
            const iterations = Math.max(0, asInteger(evalMolang(distribution.iterations ?? 1, ctx, 'scatter.iterations'), 1));
            const order = String(distribution.coordinate_eval_order || ctx.semantics.defaultCoordinateEvalOrder || 'xzy').toLowerCase();
            let success = false;
            let output = ctx.currentPosition;
            let successes = 0;
            for (let i = 0; i < iterations; i++) {
                const candidate = this.evaluateCoordinates(distribution, ctx, order, i, ctx.currentPosition, 'scatter');
                const result = this._place(placesFeature, childContext(ctx, {currentPosition: candidate, iteration: i}));
                if (result.success) {
                    success = true;
                    successes++;
                    output = result.outputPosition;
                }
            }
            return placementResult(success, output, {attempts: iterations, successes});
        }

        placeSearch(feature, ctx) {
            const body = feature.body;
            const placesFeature = getFeatureReference(body, ['places_feature', 'feature_to_place', 'feature']);
            if (!placesFeature) throw new BedrockFeatureError('search_feature is missing places_feature.', {code: 'MISSING_FEATURE_REFERENCE'});
            const volume = body.search_volume || {};
            const min = normalizePosition(volume.min || [-0, -0, -0]);
            const max = normalizePosition(volume.max || [0, 0, 0]);
            const axisToken = String(body.search_axis || '-y').toLowerCase();
            const axis = axisToken.endsWith('x') ? 'x' : axisToken.endsWith('z') ? 'z' : 'y';
            const positive = axisToken.startsWith('+');
            const required = Math.max(1, asInteger(body.required_successes, ctx.semantics.searchRequiredSuccesses));
            const candidates = this.enumerateSearchVolume(min, max, axis, positive).map(offset => addPosition(ctx.currentPosition, offset));
            const tx = typeof ctx.world.beginTransaction === 'function' ? ctx.world.beginTransaction() : new WorldTransaction(ctx.world);
            const successes = [];
            for (const candidate of candidates) {
                if (successes.length >= required) break;
                const result = this._place(placesFeature, childContext(ctx, {world: tx, currentPosition: candidate}));
                if (result.success) successes.push(result);
            }
            if (successes.length < required) {
                tx.rollback?.();
                return placementResult(false, ctx.currentPosition, {successes: successes.length, required});
            }
            tx.commit?.();
            return placementResult(true, successes[successes.length - 1].outputPosition, {successes: successes.length, required});
        }

        enumerateSearchVolume(min, max, axis, positive) {
            const low = {x: Math.min(min.x, max.x), y: Math.min(min.y, max.y), z: Math.min(min.z, max.z)};
            const high = {x: Math.max(min.x, max.x), y: Math.max(min.y, max.y), z: Math.max(min.z, max.z)};
            const layerValues = [];
            for (let v = low[axis]; v <= high[axis]; v++) layerValues.push(v);
            // Bedrock documentation: for -x, greater x is checked first.
            if (!positive) layerValues.reverse();
            const other = ['x', 'y', 'z'].filter(name => name !== axis);
            const result = [];
            for (const layer of layerValues) {
                for (let a = low[other[0]]; a <= high[other[0]]; a++) {
                    for (let b = low[other[1]]; b <= high[other[1]]; b++) {
                        const p = {x: 0, y: 0, z: 0};
                        p[axis] = layer;
                        p[other[0]] = a;
                        p[other[1]] = b;
                        result.push(p);
                    }
                }
            }
            return result;
        }

        placeSingleBlock(feature, ctx) {
            const body = feature.body;
            const pos = ctx.currentPosition;
            if (!canReplaceAt(ctx.world, pos, body.may_replace, ctx.services)) return placementResult(false, pos);
            if (!checkAttachRules(body, ctx.world, pos, ctx.services)) return placementResult(false, pos);
            let block = resolvePlacementBlock(body.places_block, ctx, 'single_block.places_block');
            if (body.randomize_rotation === true) block = rotateBlockCardinal(block, ctx);
            if (body.enforce_placement_rules === true) {
                const canPlace = ctx.services?.canPlaceBlock;
                if (!canPlace) {
                    if (ctx.strictParity) throw new BedrockFeatureParityError('canPlaceBlock service required to enforce placement rules.', {code: 'BLOCK_PLACEMENT_RULES_REQUIRED'});
                } else if (!canPlace(block, pos, ctx.world)) return placementResult(false, pos);
            }
            if (body.enforce_survivability_rules === true) {
                const canSurvive = ctx.services?.canBlockSurvive;
                if (!canSurvive) {
                    if (ctx.strictParity) throw new BedrockFeatureParityError('canBlockSurvive service required to enforce survivability rules.', {code: 'BLOCK_SURVIVAL_RULES_REQUIRED'});
                } else if (!canSurvive(block, pos, ctx.world)) return placementResult(false, pos);
            }
            ctx.world.setBlock(pos, block);
            ctx.trace?.push('block_write', {featureId: feature.identifier, position: pos, block});
            return placementResult(true, pos, {placed: 1});
        }

        placeSnapToSurface(feature, ctx) {
            const body = feature.body;
            const placesFeature = getFeatureReference(body, ['feature_to_snap', 'places_feature', 'feature_to_place']);
            if (!placesFeature) throw new BedrockFeatureError('snap_to_surface_feature is missing feature_to_snap.', {code: 'MISSING_FEATURE_REFERENCE'});
            const service = ctx.services?.snapToSurface;
            if (service) {
                const snapped = service({body, position: ctx.currentPosition, world: ctx.world, placementBiome: ctx.placementBiome, context: ctx});
                if (!snapped) return placementResult(false, ctx.currentPosition);
                if (ctx.placementBiome != null && ctx.world.getBiome && ctx.world.getBiome(snapped) !== ctx.placementBiome) return placementResult(false, ctx.currentPosition);
                return this._place(placesFeature, childContext(ctx, {currentPosition: normalizePosition(snapped)}));
            }
            if (ctx.strictParity) {
                throw new BedrockFeatureParityError('Exact snap_to_surface requires services.snapToSurface.', {code: 'SNAP_KERNEL_REQUIRED'});
            }
            const surface = String(body.surface || 'floor').toLowerCase();
            const range = Math.max(0, asInteger(body.search_range ?? body.vertical_search_range, 0));
            const snapped = this.fallbackSnap(ctx, surface, range, body);
            if (!snapped) return placementResult(false, ctx.currentPosition);
            return this._place(placesFeature, childContext(ctx, {currentPosition: snapped}));
        }

        fallbackSnap(ctx, surface, range, body) {
            const start = ctx.currentPosition;
            const testSurface = (support, target, face) => {
                const allowed = body.allowed_surface_blocks;
                if (Array.isArray(allowed) && allowed.length && !blockMatchesAny(ctx.world.getBlock(support), allowed, ctx.services)) return null;
                if ((!allowed || !allowed.length) && ctx.world.canSupport && !ctx.world.canSupport(support, face)) return null;
                const embed = body.embed_in_surface === true;
                return embed ? support : target;
            };
            if (surface === 'floor') {
                for (let d = 0; d <= range; d++) {
                    const support = {x: start.x, y: start.y - d, z: start.z};
                    const target = {x: start.x, y: support.y + 1, z: start.z};
                    if (ctx.world.getBlock(support).name !== 'minecraft:air' && ctx.world.getBlock(target).name === 'minecraft:air') return testSurface(support, target, 'up');
                }
            } else if (surface === 'ceiling') {
                for (let d = 0; d <= range; d++) {
                    const support = {x: start.x, y: start.y + d, z: start.z};
                    const target = {x: start.x, y: support.y - 1, z: start.z};
                    if (ctx.world.getBlock(support).name !== 'minecraft:air' && ctx.world.getBlock(target).name === 'minecraft:air') return testSurface(support, target, 'down');
                }
            }
            return null;
        }

        placeSurfaceRelativeThreshold(feature, ctx) {
            const body = feature.body;
            const placesFeature = getFeatureReference(body, ['feature_to_place', 'places_feature']);
            if (!placesFeature) throw new BedrockFeatureError('surface_relative_threshold_feature is missing feature_to_place.', {code: 'MISSING_FEATURE_REFERENCE'});
            const surfaceY = ctx.services?.estimatedSurfaceY
                ? ctx.services.estimatedSurfaceY(ctx.currentPosition.x, ctx.currentPosition.z, ctx)
                : ctx.world.getSurfaceY?.(ctx.currentPosition.x, ctx.currentPosition.z);
            if (!Number.isFinite(surfaceY)) return placementResult(false, ctx.currentPosition);
            const minimum = asInteger(body.minimum_distance_below_surface, 0);
            if (ctx.currentPosition.y > surfaceY - minimum) return placementResult(false, ctx.currentPosition);
            return this._place(placesFeature, childContext(ctx, {currentPosition: ctx.currentPosition}));
        }

        placePartiallyExposedBlob(feature, ctx) {
            const body = feature.body;
            if (ctx.strictParity && !ctx.services?.partiallyExposedBlobSemanticsVerified) {
                const kernel = ctx.services?.kernels?.[feature.type];
                if (kernel) return kernel({runtime: this, feature, body, context: ctx});
                throw new BedrockFeatureParityError('Exact partially_exposed_blob geometry/traversal requires an oracle-verified kernel.', {code: 'PARTIALLY_EXPOSED_BLOB_KERNEL_REQUIRED'});
            }
            const radius = clamp(asInteger(body.placement_radius_around_floor, 1), 1, 8);
            const probability = clamp(Number(body.placement_probability_per_valid_position ?? 1), 0, 1);
            const exposedFace = String(body.exposed_face || 'up').toLowerCase();
            const exposedOffset = FACE_OFFSETS[exposedFace] || FACE_OFFSETS.up;
            const block = normalizeBlockState(body.places_block);
            let placed = 0;
            for (let x = -radius; x <= radius; x++) {
                for (let y = -radius; y <= radius; y++) {
                    for (let z = -radius; z <= radius; z++) {
                        const pos = addPosition(ctx.currentPosition, {x, y, z});
                        if (nextFloat(ctx, 'partially_exposed_blob.probability') >= probability) continue;
                        let valid = true;
                        for (const [face, offset] of Object.entries(FACE_OFFSETS)) {
                            if (face === exposedFace) continue;
                            const neighbor = ctx.world.getBlock(addPosition(pos, offset));
                            if (neighbor.name === 'minecraft:air' || neighbor.name === 'minecraft:water') { valid = false; break; }
                        }
                        if (!valid) continue;
                        const exposedNeighbor = ctx.world.getBlock(addPosition(pos, exposedOffset));
                        if (exposedNeighbor.name !== 'minecraft:air' && exposedNeighbor.name !== 'minecraft:water') continue;
                        ctx.world.setBlock(pos, block);
                        placed++;
                    }
                }
            }
            return placementResult(placed > 0, ctx.currentPosition, {placed});
        }

        placeGrowingPlant(feature, ctx) {
            const body = feature.body;
            if (ctx.strictParity && !ctx.services?.growingPlantSemanticsVerified) {
                const kernel = ctx.services?.kernels?.[feature.type];
                if (kernel) return kernel({runtime: this, feature, body, context: ctx});
                throw new BedrockFeatureParityError('Exact growing_plant weighted/range semantics require an oracle-verified kernel or growingPlantSemanticsVerified=true.', {code: 'GROWING_PLANT_KERNEL_REQUIRED'});
            }
            const direction = String(body.growth_direction || 'UP').toUpperCase() === 'DOWN' ? -1 : 1;
            const heightSpec = chooseWeighted(body.height_distribution || [[{range_min: 1, range_max: 1}, 1]], ctx, null, 'growing_plant.height_distribution');
            const height = Math.max(1, asInteger(evaluateRange(heightSpec, ctx, {reason: 'growing_plant.height'}), 1));
            let placed = 0;
            let last = ctx.currentPosition;
            for (let i = 0; i < height; i++) {
                const pos = {x: ctx.currentPosition.x, y: ctx.currentPosition.y + direction * i, z: ctx.currentPosition.z};
                const existing = ctx.world.getBlock(pos);
                const replaceable = existing.name === 'minecraft:air' || (body.allow_water === true && existing.name === 'minecraft:water');
                if (!replaceable) break;
                const list = i === height - 1 ? body.head_blocks : body.body_blocks;
                let block = resolvePlacementBlock(chooseWeighted(list, ctx, null, 'growing_plant.block'), ctx, 'growing_plant.block');
                if (body.age != null) {
                    const age = asInteger(evaluateRange(body.age, ctx, {reason: 'growing_plant.age'}));
                    block = Object.freeze({name: block.name, states: Object.freeze({...block.states, age})});
                }
                ctx.world.setBlock(pos, block);
                placed++;
                last = pos;
            }
            return placementResult(placed > 0, last, {placed});
        }

        capabilities() {
            return PUBLIC_FEATURE_TYPES.map(type => ({
                type,
                handler: this.handlers.has(type),
                documentedRuntime: !PRIVATE_KERNEL_TYPES.has(type),
                requiresParityKernel: PRIVATE_KERNEL_TYPES.has(type),
            }));
        }
    }

    return Object.freeze({
        PUBLIC_FEATURE_TYPES,
        INTERNAL_OR_LEGACY_FEATURE_TYPES: Object.freeze(Array.from(INTERNAL_OR_LEGACY_FEATURE_TYPES)),
        PRIVATE_KERNEL_TYPES: Object.freeze(Array.from(PRIVATE_KERNEL_TYPES)),
        DEFAULT_SEMANTICS,
        BedrockFeatureError,
        BedrockFeatureParseError,
        BedrockFeatureParityError,
        FeatureRegistry,
        FeatureRuntime,
        SparseWorld,
        WorldTransaction,
        TraceSink,
        SequenceRandom,
        DeterministicFallbackRandom,
        parseFeatureDocument,
        parseFeatureRuleDocument,
        registerBehaviorPackDocuments,
        loadBehaviorPackDirectory,
        normalizeIdentifier,
        normalizePosition,
        normalizeBlockState,
        blockMatchesDescriptor,
        evaluateDistribution,
        evaluateChance,
        compareVersion,
    });
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BedrockFeatureRuntime;
}

if (typeof window !== 'undefined') {
    window.BedrockFeatureRuntime = BedrockFeatureRuntime;
}
