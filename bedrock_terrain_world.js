'use strict';

// Compact, deterministic world source. No Three, DOM, files, or per-voxel objects.
// The host supplies parsed structures and retains ownership of their typed NBT.
const BedrockTerrainWorld = (() => {
    const AIR = /^(?:minecraft:)?(?:air|cave_air|void_air)$/;
    const stable = value => value && typeof value === 'object'
        ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]))
        : typeof value === 'bigint' ? String(value) : value;
    function hash(x, z, seed = 0) {
        let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ (seed | 0);
        n = Math.imul(n ^ n >>> 13, 1274126177);
        return (n ^ n >>> 16) >>> 0;
    }
    function createPerlin(seed) {
        const permutation = Uint16Array.from({length: 256}, (_, i) => i);
        let state = seed >>> 0;
        for (let i = 255; i > 0; i--) {
            state = hash(state, i, seed);
            const j = state % (i + 1), v = permutation[i];
            permutation[i] = permutation[j]; permutation[j] = v;
        }
        const p = new Uint16Array(512);
        p.set(permutation); p.set(permutation, 256);
        const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
        const gradient = (h, x, y) => {
            switch (h & 7) {
                case 0: return x + y; case 1: return x - y;
                case 2: return -x + y; case 3: return -x - y;
                case 4: return x; case 5: return -x;
                case 6: return y; default: return -y;
            }
        };
        return (x, z) => {
            const fx = Math.floor(x), fz = Math.floor(z), X = fx & 255, Z = fz & 255;
            x -= fx; z -= fz;
            const u = fade(x), v = fade(z);
            const a = gradient(p[p[X] + Z], x, z), b = gradient(p[p[X + 1] + Z], x - 1, z);
            const c = gradient(p[p[X] + Z + 1], x, z - 1), d = gradient(p[p[X + 1] + Z + 1], x - 1, z - 1);
            return (a + u * (b - a)) * (1 - v) + (c + u * (d - c)) * v;
        };
    }
    const vec = (value, fallback) => {
        const result = value === undefined ? fallback.slice() : Array.from(value);
        if (result.length !== 3 || !result.every(Number.isSafeInteger)) throw new TypeError('Expected three integer coordinates.');
        return result;
    };
    class TerrainWorld {
        constructor(options = {}, sources = new Map()) {
            this.seed = Number(options.seed ?? 327) | 0;
            this.size = vec(options.size, [1024, 128, 1024]);
            if (this.size.some(n => n < 1 || n > 16384) || this.size[1] > 512) throw new RangeError('World bounds exceed 16384 x 512 x 16384.');
            this.origin = vec(options.origin, [-Math.floor(this.size[0] / 2), 0, -Math.floor(this.size[2] / 2)]);
            this.maximum = this.origin.map((n, i) => n + this.size[i]);
            this.waterLevel = Math.max(1, Math.min(this.size[1] - 1, Math.round(options.waterLevel ?? this.size[1] * .28))) + this.origin[1];
            this.noise = createPerlin(this.seed);
            this.palette = [];
            this.paletteKeys = new Map();
            this.columns = new Map();
            this.maxColumnTiles = Math.max(1, Math.min(128, Math.round(options.columnCacheTiles || 32)));
            this.stats = {columnTilesBuilt: 0, regionsRead: 0, cellsRead: 0};
            this.ids = Object.fromEntries(['bedrock', 'stone', 'dirt', 'grass_block', 'sand', 'water', 'snow', 'oak_log', 'oak_leaves', 'short_grass', 'dandelion'].map(name => [name, this.addPalette({name: 'minecraft:' + name, states: {}})]));
            this.sources = sources instanceof Map ? sources : new Map(Object.entries(sources));
            this.sourceRemaps = new Map();
            for (const [id, source] of this.sources) {
                if (!source?.blockIndices || !source?.blockPalette) throw new TypeError('A world source must be a parsed mcstructure: ' + id);
                const typed = source.nbtDocument?.value?.structure?.value?.palette?.value?.[source.paletteName || 'default']?.value?.block_palette?.value?.items;
                this.sourceRemaps.set(id, Int32Array.from(source.blockPalette, (block, index) => AIR.test(block.name) ? -1 : this.addPalette({...block, statesNBT: typed?.[index]?.value?.states})));
            }
            this.placements = [];
            this.placementTiles = new Map();
            for (const placement of options.placements || []) this.addPlacement(placement);
        }
        addPalette(block) {
            const key = JSON.stringify([block.name, stable(block.states || {}), block.version || 18168865]);
            if (this.paletteKeys.has(key)) return this.paletteKeys.get(key);
            const index = this.palette.length;
            this.palette.push({...block, version: block.version || 18168865}); this.paletteKeys.set(key, index);
            return index;
        }
        column(x, z) {
            const tx = Math.floor(x / 32), tz = Math.floor(z / 32), key = tx + ',' + tz;
            let tile = this.columns.get(key);
            if (!tile) {
                tile = new Array(1024);
                for (let lx = 0; lx < 32; lx++) for (let lz = 0; lz < 32; lz++) {
                    const px = tx * 32 + lx, pz = tz * 32 + lz, n = this.noise;
                    const h = this.heightUncached(px, pz);
                    const gx = Math.floor(px / 8), gz = Math.floor(pz / 8), tree = hash(gx, gz, this.seed);
                    const cx = gx * 8 + 2 + (tree & 3), cz = gz * 8 + 2 + (tree >>> 2 & 3);
                    const treeHere = tree % 7 === 0;
                    const dx = Math.abs(px - cx), dz = Math.abs(pz - cz);
                    const base = treeHere && dx <= 2 && dz <= 2 ? this.heightUncached(cx, cz) : -10000;
                    tile[lz + 32 * lx] = {
                        h, snow: h > this.origin[1] + this.size[1] * .64,
                        cave: this.origin[1] + 10 + Math.floor((n(px / 70 + 91, pz / 70) + 1) * 9),
                        hollow: Math.abs(n(px / 84, pz / 84 + 48)) < .16,
                        trunk: treeHere && dx === 0 && dz === 0 && base > this.waterLevel + 1,
                        leaves: treeHere && dx + dz < 4 && base > this.waterLevel + 1,
                        treeBase: base, flower: hash(px, pz, this.seed + 1) % 41,
                    };
                }
                this.columns.set(key, tile); this.stats.columnTilesBuilt++;
                if (this.columns.size > this.maxColumnTiles) this.columns.delete(this.columns.keys().next().value);
            } else {
                this.columns.delete(key); this.columns.set(key, tile);
            }
            return tile[z - tz * 32 + 32 * (x - tx * 32)];
        }
        heightUncached(x, z) {
            const n = this.noise, warp = n(x / 240, z / 240) * 28;
            let h = this.origin[1] + this.size[1] * (.30 + n((x + warp) / 180, (z - warp) / 180) * .24
                + n(x / 58, z / 58) * .22 + n(x / 21, z / 21) * .07
                + Math.pow(1 - Math.abs(n(x / 120 + 73, z / 120 - 91)), 3) * .17);
            const river = Math.abs(n(x / 310 + 19, z / 310 + 31));
            if (river < .045) h -= (1 - river / .045) * this.size[1] * .19;
            return Math.max(this.origin[1] + 3, Math.min(this.maximum[1] - 14, Math.floor(h)));
        }
        heightAt(x, z) { return this.column(x, z).h; }
        baseBlock(c, y) {
            const id = this.ids;
            if (y === this.origin[1]) return id.bedrock;
            if (y <= c.h) {
                if (c.hollow && y > this.origin[1] + 4 && y < c.h - 4 && Math.abs(y - c.cave) < 3) return -1;
                if (y < c.h - 3) return id.stone;
                if (c.h < this.waterLevel + 2) return id.sand;
                return y < c.h ? id.dirt : c.snow ? id.snow : id.grass_block;
            }
            if (y <= this.waterLevel) return id.water;
            if (c.trunk && y <= c.treeBase + 5) return id.oak_log;
            if (c.leaves && y >= c.treeBase + 3 && y <= c.treeBase + 6) return id.oak_leaves;
            if (y === c.h + 1 && c.h > this.waterLevel && !c.snow) {
                if (c.flower === 0) return id.dandelion;
                if (c.flower < 7) return id.short_grass;
            }
            return -1;
        }
        addPlacement(value) {
            const source = this.sources.get(value.source);
            if (!source) throw new Error('Missing structure source: ' + value.source);
            const position = vec(value.position, [0, 0, 0]);
            const placement = {source: value.source, position, pasteAir: value.pasteAir === true};
            const index = this.placements.length; this.placements.push(placement);
            for (let x = Math.floor(position[0] / 32); x <= Math.floor((position[0] + source.size.x - 1) / 32); x++)
                for (let z = Math.floor(position[2] / 32); z <= Math.floor((position[2] + source.size.z - 1) / 32); z++) {
                    const key = x + ',' + z;
                    if (!this.placementTiles.has(key)) this.placementTiles.set(key, []);
                    this.placementTiles.get(key).push(index);
                }
            return placement;
        }
        readRegion(minimum, size) {
            minimum = vec(minimum, this.origin); size = vec(size, [16, 16, 16]);
            const volume = size[0] * size[1] * size[2];
            if (size.some(n => n < 1) || volume > 16777216) throw new RangeError('Read regions in tiles of at most 16 million cells.');
            const layers = [new Int32Array(volume).fill(-1), new Int32Array(volume).fill(-1)];
            for (let x = 0; x < size[0]; x++) for (let z = 0; z < size[2]; z++) {
                const wx = minimum[0] + x, wz = minimum[2] + z;
                if (wx < this.origin[0] || wx >= this.maximum[0] || wz < this.origin[2] || wz >= this.maximum[2]) continue;
                const c = this.column(wx, wz), base = z + size[2] * size[1] * x;
                for (let y = 0; y < size[1]; y++) {
                    const wy = minimum[1] + y;
                    if (wy >= this.origin[1] && wy < this.maximum[1]) layers[0][base + size[2] * y] = this.baseBlock(c, wy);
                }
            }
            const candidates = new Set();
            for (let x = Math.floor(minimum[0] / 32); x <= Math.floor((minimum[0] + size[0] - 1) / 32); x++)
                for (let z = Math.floor(minimum[2] / 32); z <= Math.floor((minimum[2] + size[2] - 1) / 32); z++)
                    for (const index of this.placementTiles.get(x + ',' + z) || []) candidates.add(index);
            // Placement order is authoritative even when a read spans several tiles.
            for (const index of Array.from(candidates).sort((a, b) => a - b)) {
                const placement = this.placements[index], source = this.sources.get(placement.source), remap = this.sourceRemaps.get(placement.source);
                const lo = minimum.map((n, axis) => Math.max(n, placement.position[axis], this.origin[axis]));
                const hi = minimum.map((n, axis) => Math.min(n + size[axis], placement.position[axis] + source.size[['x', 'y', 'z'][axis]], this.maximum[axis]));
                for (let x = lo[0]; x < hi[0]; x++) for (let y = lo[1]; y < hi[1]; y++) for (let z = lo[2]; z < hi[2]; z++) {
                    const si = z - placement.position[2] + source.size.z * (y - placement.position[1] + source.size.y * (x - placement.position[0]));
                    const di = z - minimum[2] + size[2] * (y - minimum[1] + size[1] * (x - minimum[0]));
                    for (let layer = 0; layer < 2; layer++) {
                        const raw = source.blockIndices[layer]?.[si] ?? -1;
                        if (raw >= 0 && (remap[raw] >= 0 || placement.pasteAir)) layers[layer][di] = remap[raw];
                    }
                }
            }
            this.stats.regionsRead++; this.stats.cellsRead += volume;
            return {minimum, size, layers};
        }
        describe() {
            return {schema: 'lightflow-terrain-world-1', seed: this.seed, size: this.size.slice(), origin: this.origin.slice(), waterLevel: this.waterLevel - this.origin[1], placements: this.placements.map(p => ({...p, position: p.position.slice()}))};
        }
        diagnostics() {
            return {...this.stats, cachedColumnTiles: this.columns.size, maxColumnTiles: this.maxColumnTiles, palette: this.palette.length,
                placements: this.placements.length, sourceVoxels: Array.from(this.sources.values()).reduce((n, s) => n + s.volume, 0),
                worldVoxels: this.size.reduce((a, b) => a * b, 1)};
        }
    }
    function materializeRegion(world, parser, minimum, size) {
        const region = world.readRegion(minimum, size), NBT = parser.NBT;
        const editor = parser.MinecraftBedrockStructureEditor.create({size: {x: size[0], y: size[1], z: size[2]},
            worldOrigin: {x: minimum[0], y: minimum[1], z: minimum[2]}, fillPrimary: -1});
        const remap = Int32Array.from(world.palette, block => editor.ensureBlockPermutation(block));
        for (let layer = 0; layer < 2; layer++) for (let i = 0; i < region.layers[layer].length; i++) {
            const value = region.layers[layer][i]; editor.blockIndices[layer][i] = value < 0 ? -1 : remap[value];
        }
        const inside = p => p.every((n, axis) => n >= minimum[axis] && n < minimum[axis] + size[axis]);
        // Preserve typed block NBT; later placement writes own their coordinates.
        const metadata = new Map();
        for (let pi = 0; pi < world.placements.length; pi++) {
            const placement = world.placements[pi], source = world.sources.get(placement.source);
            for (const [key, value] of metadata) {
                const p = value.position.map((n, axis) => n - placement.position[axis]);
                if (p[0] < 0 || p[0] >= source.size.x || p[1] < 0 || p[1] >= source.size.y || p[2] < 0 || p[2] >= source.size.z) continue;
                const i = p[2] + source.size.z * (p[1] + source.size.y * p[0]);
                const map = world.sourceRemaps.get(placement.source);
                // Bedrock's second slot holds fluids such as waterlogged water.
                // Updating that slot alone must not erase the primary block's
                // block-entity NBT (for example, a waterlogged chest).
                const primary = source.blockIndices[0]?.[i] ?? -1;
                if (primary >= 0 && (map[primary] >= 0 || placement.pasteAir)) metadata.delete(key);
            }
            const typedPalette = source.nbtDocument?.value?.structure?.value?.palette?.value?.[source.paletteName || 'default']?.value;
            for (const [index] of source.blockPositionData || []) {
                const x = Math.floor(index / (source.size.y * source.size.z)), y = Math.floor((index % (source.size.y * source.size.z)) / source.size.z), z = index % source.size.z;
                const p = [x, y, z].map((n, axis) => n + placement.position[axis]);
                if (!inside(p)) continue;
                const node = typedPalette?.block_position_data?.value?.[String(index)];
                if (!node) continue;
                const copy = NBT.clone(node), entity = copy.value?.block_entity_data;
                if (entity?.value) for (let axis = 0; axis < 3; axis++) {
                    const name = ['x', 'y', 'z'][axis]; if (entity.value[name]) entity.value[name].value = p[axis];
                }
                metadata.set(p.join(','), {position: p, node: copy});
            }
            const entities = source.nbtDocument?.value?.structure?.value?.entities?.value?.items || [];
            for (let ei = 0; ei < entities.length; ei++) {
                const copy = NBT.clone(entities[ei]), position = copy.value?.Pos || copy.value?.pos;
                if (!position?.value?.items || position.value.items.length < 3) continue;
                const p = position.value.items.slice(0, 3).map((tag, axis) => tag.value - source.worldOrigin[['x', 'y', 'z'][axis]] + placement.position[axis]);
                if (!inside(p)) continue;
                for (let axis = 0; axis < 3; axis++) position.value.items[axis].value = p[axis];
                // Repeated copies must not retain colliding Bedrock actor IDs.
                if (copy.value.UniqueID) copy.value.UniqueID = NBT.long(BigInt(pi + 1) * 1048576n + BigInt(ei + 1));
                editor.addEntity(copy);
            }
        }
        for (const {position, node} of metadata.values()) editor.setBlockPositionData(...position.map((n, axis) => n - minimum[axis]), node);
        return editor;
    }
    return Object.freeze({TerrainWorld, createPerlin, hash, materializeRegion});
})();
if (typeof module !== 'undefined' && module.exports) module.exports = BedrockTerrainWorld;
if (typeof window !== 'undefined') window.BedrockTerrainWorld = BedrockTerrainWorld;
