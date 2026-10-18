'use strict';

// Browser/Blockbench desktop-webview adapter. Reads the user's *local* Java
// client JAR using Blockbench's supported file bridge + bundled JSZip. No
// models, textures or Minecraft assets are shipped with the plugin.
class BrowserMinecraftJar {
    constructor(zip, definitions) {
        this.zip = zip;
        this.definitions = definitions;
        this.isBrowserJar = true;
        this.requestedDefinitions = new Set();
        this.onModelReady = null;
        this.materials = new Map();
        this.pending = new Set();
        this.onTextureReady = null;
    }

    static async open(bytes, zipModule) {
        const zip = await zipModule.loadAsync(bytes);
        // Deflate only assets the structure actually uses, rather than eagerly
        // decompressing several thousand models on the renderer's UI thread.
        return new BrowserMinecraftJar(zip,new Map());
    }

    definition(key) {
        if (this.definitions.has(key)) return this.definitions.get(key);
        if (this.requestedDefinitions.has(key)) return null;
        const entry = this.zip.file(key);
        if (!entry) return null;
        this.requestedDefinitions.add(key);
        entry.async('string').then(source => {
            this.definitions.set(key,JSON.parse(source));
            this.onModelReady?.();
        }).catch(()=>{}).finally(()=>this.requestedDefinitions.delete(key));
        return null;
    }

    blockstate(identifier) {
        return this.definition('assets/minecraft/blockstates/'
            + String(identifier).replace(/^minecraft:/,'') + '.json');
    }

    model(identifier, parents = new Set()) {
        const name = String(identifier).replace(/^minecraft:/,'').replace(/^block\//,'');
        const key = `assets/minecraft/models/block/${name}.json`;
        if (parents.has(key)) throw new Error(`Cyclic Java model parent: ${key}`);
        const model = this.definition(key);
        if (!model) return null;
        if (!model.parent) return model;
        parents.add(key);
        const parent = this.model(model.parent, parents);
        parents.delete(key);
        return parent ? {...parent,...model,textures:{...parent.textures,...model.textures},
            elements:model.elements ?? parent.elements} : model;
    }

    textureDataUrl(identifier) {
        const name = String(identifier||'').replace(/^minecraft:/,'');
        if (!/^(?:block|entity|item)\/[a-z0-9_/-]+$/.test(name)) return null;
        const key = `assets/minecraft/textures/${name}.png`;
        if (this.materials.has(key)) return this.materials.get(key);
        if (this.pending.has(key)) return null;
        const entry = this.zip.file(key);
        if (!entry) return null;
        this.pending.add(key);
        entry.async('base64').then(value => {
            this.materials.set(key,`data:image/png;base64,${value}`);
            this.onTextureReady?.();
        }).catch(()=>{}).finally(()=>this.pending.delete(key));
        return null;
    }
}

const BedrockBrowserJar = {BrowserMinecraftJar};
class IndexedMinecraftJar {
    constructor(index, basePath) {
        if (index.format !== 1 || !index.definitions || !Array.isArray(index.textures)) {
            throw new Error('Unsupported local Java model index.');
        }
        this.definitions = new Map(Object.entries(index.definitions));
        this.textureNames = new Set(index.textures);
        this.basePath = basePath;
        this.isBrowserJar = true;
    }
    blockstate(identifier) {
        return this.definitions.get(`assets/minecraft/blockstates/${String(identifier).replace(/^minecraft:/,'')}.json`) || null;
    }
    model(identifier, parents=new Set()) {
        const name=String(identifier).replace(/^minecraft:/,'').replace(/^block\//,'');
        const key=`assets/minecraft/models/block/${name}.json`;
        if(parents.has(key))throw new Error(`Cyclic model parent: ${key}`);
        const model=this.definitions.get(key);
        if(!model)return null;
        if(!model.parent)return model;
        parents.add(key);
        const parent=this.model(model.parent,parents);
        parents.delete(key);
        return parent?{...parent,...model,textures:{...parent.textures,...model.textures},
            elements:model.elements??parent.elements}:model;
    }
    textureFile(identifier) {
        const name=String(identifier||'').replace(/^minecraft:/,'');
        if(!this.textureNames.has(name))return null;
        return `${this.basePath.replace(/[\\/]$/,'')}/textures/${name}.png`;
    }
}
BedrockBrowserJar.IndexedMinecraftJar=IndexedMinecraftJar;
if (typeof module !== 'undefined' && module.exports) module.exports = BedrockBrowserJar;
