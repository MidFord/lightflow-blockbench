'use strict';

// Reads the user's locally installed Minecraft client JAR on demand. This
// module does not redistribute Minecraft models or textures. It extracts only
// requested JSON model/state definitions from the ZIP stream in memory.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');

class MinecraftJarArchive {
    constructor(file) {
        this.file = file;
        this.bytes = fs.readFileSync(file);
        this.entries = new Map();
        this.jsonCache = new Map();
        const bytes = this.bytes;
        let end = -1;
        for (let offset = bytes.length - 22; offset >= Math.max(0,bytes.length-65557); offset--) {
            if (bytes.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
        }
        if (end < 0) throw new Error('Minecraft client JAR has no ZIP central directory.');
        const directoryOffset = bytes.readUInt32LE(end+16);
        const entries = bytes.readUInt16LE(end+10);
        let cursor = directoryOffset;
        for (let i = 0; i < entries; i++) {
            if (bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP directory entry.');
            const method = bytes.readUInt16LE(cursor+10);
            const packed = bytes.readUInt32LE(cursor+20);
            const nameLength = bytes.readUInt16LE(cursor+28);
            const extraLength = bytes.readUInt16LE(cursor+30);
            const commentLength = bytes.readUInt16LE(cursor+32);
            const localOffset = bytes.readUInt32LE(cursor+42);
            const name = bytes.toString('utf8',cursor+46,cursor+46+nameLength);
            if (name.startsWith('assets/minecraft/') && (name.endsWith('.json') || name.endsWith('.png') || name.endsWith('.png.mcmeta'))) {
                this.entries.set(name,{method,packed,localOffset});
            }
            cursor += 46+nameLength+extraLength+commentLength;
        }
    }

    resource(name) {
        const entry = this.entries.get(name);
        if (!entry) return null;
        const header = entry.localOffset;
        if (this.bytes.readUInt32LE(header) !== 0x04034b50) throw new Error('Invalid ZIP local entry.');
        const start = header+30+this.bytes.readUInt16LE(header+26)+this.bytes.readUInt16LE(header+28);
        const compressed = this.bytes.subarray(start,start+entry.packed);
        const decoded = entry.method === 0 ? compressed : entry.method === 8
            ? zlib.inflateRawSync(compressed) : null;
        if (!decoded) throw new Error(`Unsupported ZIP compression method ${entry.method}.`);
        return decoded;
    }

    json(name) {
        if (this.jsonCache.has(name)) return this.jsonCache.get(name);
        const decoded = this.resource(name);
        if (!decoded) return null;
        const data = JSON.parse(decoded.toString('utf8'));
        this.jsonCache.set(name,data);
        return data;
    }

    model(identifier, parents = new Set()) {
        const name = String(identifier).replace(/^minecraft:/,'').replace(/^block\//,'');
        const key = `assets/minecraft/models/block/${name}.json`;
        if (parents.has(key)) throw new Error(`Cyclic Java model inheritance for ${key}`);
        const model = this.json(key);
        if (!model) return null;
        if (!model.parent) return model;
        parents.add(key);
        const base = this.model(model.parent,parents);
        parents.delete(key);
        if (!base) return model;
        return {
            ...base,
            ...model,
            textures: {...base.textures,...model.textures},
            elements: model.elements ?? base.elements,
        };
    }

    blockstate(identifier) {
        const name = String(identifier).replace(/^minecraft:/,'');
        return this.json(`assets/minecraft/blockstates/${name}.json`);
    }

    textureFile(identifier) {
        const name = String(identifier || '').replace(/^minecraft:/,'');
        if (!/^(?:block|entity|item)\/[a-z0-9_/-]+$/.test(name)) return null;
        const key = `assets/minecraft/textures/${name}.png`;
        if (!this.entries.has(key)) return null;
        const directory = path.join(os.tmpdir(),`lightflow-java-assets-${path.basename(this.file,'.jar')}-${this.bytes.length}`);
        const output = path.join(directory,...name.split('/'))+'.png';
        if (!fs.existsSync(output)) {
            fs.mkdirSync(path.dirname(output),{recursive:true});
            fs.writeFileSync(output,this.resource(key),{flag:'wx'});
        }
        return output;
    }

    textureAnimation(identifier) {
        const name = String(identifier || '').replace(/^minecraft:/,'');
        if (!/^(?:block|entity|item)\/[a-z0-9_/-]+$/.test(name)) return null;
        const metadata = this.json(`assets/minecraft/textures/${name}.png.mcmeta`);
        const animation = metadata?.animation;
        if (!animation || typeof animation !== 'object') return null;
        return {
            ticks_per_frame: Math.max(1, Number(animation.frametime) || 1),
            ...(Array.isArray(animation.frames) ? {frames:animation.frames.map(frame =>
                frame && typeof frame === 'object'
                    ? {index:frame.index, time:frame.time ?? animation.frametime ?? 1}
                    : frame)} : {}),
        };
    }
}

let cached;
function getMinecraftJar() {
    if (cached !== undefined) return cached;
    cached = null;
    for (const version of ['26.3','26.2']) {
        const file = path.join(os.homedir(),'AppData','Roaming','.minecraft','versions',version,`${version}.jar`);
        if (!fs.existsSync(file)) continue;
        try { cached = new MinecraftJarArchive(file); break; }
        catch (error) { /* Ignore damaged/unsupported local installations. */ }
    }
    return cached;
}

module.exports = {MinecraftJarArchive,getMinecraftJar};
