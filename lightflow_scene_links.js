/* Lightflow Scene Links: shared scene data and Desktop Blockbench integration. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.LightflowSceneLinksCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : null, function () {
    'use strict';

    const VERSION = 1;
    const POSE_MODES = new Set(['additive', 'absolute']);
    const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const vector = (value, fallback) => fallback.map((defaultValue, index) => finite(value?.[index], defaultValue));
    const plain = value => value && typeof value === 'object' && !Array.isArray(value);

    // Resolve base-map samples for shaders without their own atlas resolver.
    // Shader Architect keeps its resolved material/neighbor UVs intact below.
    function patchTerrainMapSamples(source) {
        const samples = /\b(texture2D|texture)\s*\(\s*map\s*,/g;
        const edits = [];
        let match;
        while ((match = samples.exec(source))) {
            const start = samples.lastIndex;
            let depth = 1, end = start;
            for (; end < source.length; end++) {
                if (source[end] === '(') depth++;
                else if (source[end] === ')' && --depth === 0) break;
            }
            if (depth !== 0) continue;
            const argument = source.slice(start, end);
            if (!argument.trim().startsWith('lightflowTerrainUv(')) edits.push({start, end, argument});
            samples.lastIndex = end + 1;
        }
        for (const {start, end, argument} of edits.reverse()) source = source.slice(0, start) + 'lightflowTerrainUv(' + argument.trim() + ')' + source.slice(end);
        return source;
    }

    function terrainGridOffset(model, receiverCentered) {
        // Snapshots use source scene-local coordinates. Preserve the source's
        // block-grid origin when the receiver uses a different centered grid.
        const sourceOffset = model?.lightflow_terrain?.centered_grid === true ? 0 : -8;
        return sourceOffset - (receiverCentered ? 0 : -8);
    }

    function parseBBModel(input) {
        let model = input;
        if (typeof model === 'string') {
            try { model = JSON.parse(model); }
            catch (_) { throw new Error('The source is not valid JSON.'); }
        }
        if (!plain(model) || !plain(model.meta) || (!(model.meta.model_format === 'skin' && typeof model.skin_model === 'string') && (!Array.isArray(model.elements) || !Array.isArray(model.outliner)))) {
            throw new Error('The source is not a supported .bbmodel project.');
        }
        if (model.meta.format_version && Number.parseInt(model.meta.format_version, 10) > 5) {
            throw new Error('This .bbmodel uses a newer format version.');
        }
        return model;
    }

    function terrainSections(model) {
        const terrain=model?.lightflow_terrain;
        if(!terrain)return [];
        if(terrain.version!==1||!Array.isArray(terrain.sections)||!Array.isArray(terrain.textures))throw new Error('Unsupported terrain render snapshot. Save the terrain with the current Lightflow Terrain Render.');
        const types={Float32Array:4,Uint8Array:1,Uint16Array:2,Uint32Array:4,Int8Array:1,Int16Array:2,Int32Array:4};
        const names=new Set(['position','normal','uv','color','bedrockTileUv','bedrockAtlasRect','bedrockGreedyRepeat','bedrockBlockAo']);
        const bufferLength=descriptor=>{
            if(!descriptor||!types[descriptor.type]||typeof descriptor.data!=='string'||descriptor.data.length>700000000||descriptor.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(descriptor.data))throw new Error('Invalid terrain vertex data.');
            const bytes=descriptor.data.length/4*3-(descriptor.data.endsWith('==')?2:descriptor.data.endsWith('=')?1:0);
            if(bytes%types[descriptor.type])throw new Error('Misaligned terrain buffer.');
            return bytes/types[descriptor.type];
        };
        for(const section of terrain.sections){
            const geometry=section?.terrain_geometry,position=geometry?.attributes?.position;
            if(!section.uuid||!position||position.itemSize!==3||!Array.isArray(section.matrix)||section.matrix.length!==16||!section.matrix.every(Number.isFinite)||!Array.isArray(section.terrain_materials))throw new Error('Invalid terrain section.');
            const vertices=bufferLength(position)/3;
            if(position.type!=='Float32Array'||!Number.isInteger(vertices)||vertices<3||!section.terrain_materials.length)throw new Error('Invalid terrain positions or materials.');
            for(const [name,attribute] of Object.entries(geometry.attributes)){
                if(!names.has(name)||!Number.isInteger(attribute.itemSize)||attribute.itemSize<1||attribute.itemSize>4||bufferLength(attribute)/attribute.itemSize!==vertices)throw new Error('Invalid terrain attribute layout.');
            }
            if(geometry.index&&!['Uint16Array','Uint32Array'].includes(geometry.index.type))throw new Error('Invalid terrain index type.');
            const drawCount=geometry.index?bufferLength(geometry.index):vertices;
            if(drawCount%3)throw new Error('Invalid terrain triangle count.');
            if(!Array.isArray(geometry.groups)||geometry.groups.some(group=>!Number.isInteger(group.start)||!Number.isInteger(group.count)||group.start<0||group.count<0||group.start+group.count>drawCount||!Number.isInteger(group.materialIndex)||group.materialIndex<0||group.materialIndex>=section.terrain_materials.length))throw new Error('Invalid terrain material groups.');
            if(geometry.face_runs!==undefined){
                if(!Array.isArray(geometry.face_runs)||!geometry.face_runs.length)throw new Error('Invalid terrain face runs.');
                let cursor=0;
                for(const run of geometry.face_runs){
                    if(run.start!==cursor||![3,6].includes(run.faceSize)||!Number.isInteger(run.count)||run.count<run.faceSize||run.count%run.faceSize||
                        !geometry.groups.some(group=>run.start>=group.start&&run.start+run.count<=group.start+group.count&&run.materialIndex===group.materialIndex)||
                        (run.uvTextureSize!==undefined&&(!Array.isArray(run.uvTextureSize)||run.uvTextureSize.length!==2||!run.uvTextureSize.every(value=>Number.isFinite(value)&&value>0))))throw new Error('Invalid terrain face run layout.');
                    cursor+=run.count;
                }
                if(cursor!==drawCount)throw new Error('Incomplete terrain face runs.');
            }
            if(geometry.attributes.bedrockGreedyRepeat&&(!geometry.attributes.bedrockTileUv||!geometry.attributes.bedrockAtlasRect))throw new Error('Missing terrain atlas attributes.');
            const clip=geometry.connected_clip;
            if(clip){
                const box=value=>Array.isArray(value)&&value.length===6&&value.every(Number.isFinite)&&value.slice(0,3).every((v,i)=>v<=value[i+3]);
                if(clip.version!==1||!Number.isInteger(clip.resolution)||clip.resolution<64||clip.resolution>512||!Array.isArray(clip.faces)||clip.faces.length>drawCount/3||
                    bufferLength({type:'Uint8Array',data:clip.data})!==clip.faces.length*clip.resolution*4||clip.faces.some(face=>
                        !Array.isArray(face.vertices)||face.vertices.length<3||face.vertices.length>6||face.vertices.some(v=>!Number.isInteger(v)||v<0||v>=vertices)||
                        !Number.isInteger(face.materialIndex)||face.materialIndex<0||face.materialIndex>=section.terrain_materials.length||!box(face.bounds)||!box(face.ramp)))throw new Error('Invalid terrain connected clip bake.');
            }
        }
        return terrain.sections;
    }

    function terrainFaceRanges(data, drawCount) {
        const ranges=[];
        // Legacy snapshots have only groups. Each triangle is a safe UV domain
        // there; new snapshots retain exact quads with far fewer serialized runs.
        for(const run of data.face_runs||(data.groups?.length?data.groups:[{start:0,count:drawCount,materialIndex:0}])){
            const size=run.faceSize||3;
            for(let start=run.start;start<run.start+run.count;start+=size){
                const {faceSize,...range}=run;
                ranges.push({...range,start,count:size});
            }
        }
        return ranges;
    }

    function createTerrainInstanceGeometry(source, THREE) {
        const geometry=new THREE.BufferGeometry();
        // Only derived shader streams depend on an instance's transform. Source
        // positions, atlas UVs, AO and indices are immutable and share GPU buffers.
        for(const [name,attribute] of Object.entries(source.attributes))geometry.setAttribute(name,attribute);
        if(source.index)geometry.setIndex(source.index);
        geometry.groups=source.groups.map(group=>({...group}));
        geometry.boundingBox=source.boundingBox?.clone()||null;
        geometry.boundingSphere=source.boundingSphere?.clone()||null;
        geometry.userData={...source.userData};
        const dispose=geometry.dispose;
        geometry.dispose=function(){
            // Three r129 retires attributes by identity on geometry.dispose().
            // A shell may only retire its own streams; the source owns shared ones.
            const shared=[];
            for(const [name,attribute] of Object.entries(this.attributes))if(source.attributes[name]===attribute){shared.push([name,attribute]);this.deleteAttribute(name);}
            const index=this.index===source.index?this.index:null;
            if(index)this.setIndex(null);
            try{dispose.call(this);}finally{
                for(const [name,attribute] of shared)this.setAttribute(name,attribute);
                if(index)this.setIndex(index);
            }
        };
        return geometry;
    }

    function createTerrainBufferOwnerGeometry(sources, THREE) {
        // An empty, zero-draw mesh registers this owner in every renderer used
        // by the scene. Source templates themselves are never rendered. Without
        // this owner their dispose events cannot retire shared WebGL buffers.
        const owner=new THREE.BufferGeometry(),dispose=owner.dispose;
        owner.setAttribute('position',new THREE.BufferAttribute(new Float32Array(0),3));
        owner.dispose=function(){
            const attributes=new Set();
            for(const geometry of sources){
                for(const attribute of Object.values(geometry.attributes))attributes.add(attribute);
                if(geometry.index)attributes.add(geometry.index);
            }
            let index=0;
            for(const attribute of attributes)this.setAttribute('terrain_owned_'+index++,attribute);
            try{dispose.call(this);}finally{for(const name of Object.keys(this.attributes))this.deleteAttribute(name);}
        };
        return owner;
    }

    function inspectBBModel(input) {
        const model = parseBBModel(input);
        if(!Array.isArray(model.elements)||!Array.isArray(model.outliner))throw new Error('Skin sources require the native skin geometry adapter.');
        const warnings = [];
        const elementsById = new Map();
        const duplicateIds = new Set();
        const sections=terrainSections(model);
        for (const element of [...model.elements,...sections]) {
            if (!plain(element) || typeof element.uuid !== 'string' || !element.uuid) continue;
            if (elementsById.has(element.uuid)) duplicateIds.add(element.uuid);
            else elementsById.set(element.uuid, element);
        }
        if (duplicateIds.size) warnings.push({code:'duplicate_element_ids',ids:[...duplicateIds]});
        const groups = [];
        const groupsById = new Map();
        // Since .bbmodel v5, group properties live outside the hierarchy.
        const groupDefinitions=new Map((Array.isArray(model.groups)?model.groups:[]).filter(plain).map(group=>[group.uuid,group]));
        const groupIds = new Set();
        const referencedElements = new Set();
        const visit = (nodes, parentId, ancestors) => {
            for (const node of nodes) {
                if (typeof node === 'string') {
                    if (elementsById.has(node)) referencedElements.add(node);
                    else warnings.push({code:'missing_element',id:node});
                    continue;
                }
                if (!plain(node)) continue;
                const id = String(node.uuid || '');
                if (!id) { warnings.push({code:'group_without_uuid',name:String(node.name || '')}); continue; }
                if (groupIds.has(id)) { warnings.push({code:'duplicate_group_id',id}); continue; }
                groupIds.add(id);
                const definition={...groupDefinitions.get(id),...node};
                const ancestry = [...ancestors,id];
                const record = {
                    id,
                    name:String(definition.name || 'Group'),
                    parentId,
                    path:ancestry,
                    origin:vector(definition.origin,[0,0,0]),
                    rotation:vector(definition.rotation,[0,0,0]),
                    scale:vector(definition.scale,[1,1,1]),
                    visible:definition.visibility !== false,
                    childGroupIds:[],
                    elementIds:[]
                };
                groups.push(record);
                groupsById.set(id,record);
                if (parentId) groupsById.get(parentId)?.childGroupIds.push(id);
                for (const child of Array.isArray(node.children) ? node.children : []) {
                    if (typeof child === 'string') {
                        record.elementIds.push(child);
                        if (elementsById.has(child)) referencedElements.add(child);
                        else warnings.push({code:'missing_element',id:child});
                    } else if (plain(child)) visit([child],id,ancestry);
                }
            }
        };
        visit(model.outliner,null,[]);
        if(sections.length)visit([{uuid:model.lightflow_terrain.uuid||'lightflow-terrain-root',name:model.lightflow_terrain.name||'Terrain',children:sections.map(section=>section.uuid)}],null,[]);
        const ungroupedElementIds=[...elementsById.keys()].filter(id=>!referencedElements.has(id));
        const materialDefinitions=(() => {
            try { const result=JSON.parse(model.sa_material_instances_json || '[]');return Array.isArray(result)?result:[]; }
            catch (_) {warnings.push({code:'invalid_material_registry'});return [];}
        })();
        const textures=(Array.isArray(model.textures)?model.textures:[]).filter(plain);
        const elementTypes={};
        for(const element of elementsById.values()){
            const type=String(element.type||'cube');
            elementTypes[type]=(elementTypes[type]||0)+1;
        }
        const visualCount=(elementTypes.cube||0)+(elementTypes.mesh||0)+(elementTypes.billboard||0)+(elementTypes.texture_mesh||0);
        const ignoredTypes=Object.fromEntries(Object.entries(elementTypes).filter(([type])=>!['cube','mesh','billboard','texture_mesh'].includes(type)));
        // Names are presentation text; the canonical file path identifies a source.
        const sourceId=String(model.model_identifier || model.meta?.model_identifier || '');
        const blockingCodes=new Set(['duplicate_element_ids','duplicate_group_id','group_without_uuid']);
        return {
            version:VERSION,
            name:String(model.name || sourceId || 'Untitled source'),
            sourceId,
            format:String(model.meta.model_format || ''),
            groups,
            rootGroupIds:groups.filter(group=>!group.parentId).map(group=>group.id),
            ungroupedElementIds,
            elements:[...elementsById.values()].map(element=>({id:element.uuid,type:String(element.type||'cube'),name:String(element.name||'')})),
            elementTypes,visualCount,ignoredTypes,
            animations:(Array.isArray(model.animations)?model.animations:[]).filter(plain).map(animation=>({id:String(animation.uuid||animation.name||''),name:String(animation.name||'Animation'),length:Math.max(0,finite(animation.length)),loop:String(animation.loop||'once'),supported:animationSupported(animation)})),
            textures:textures.map(texture=>({id:String(texture.uuid||''),name:String(texture.name||''),embedded:typeof texture.source==='string'&&texture.source.startsWith('data:'),path:String(texture.path||'')})),
            materials:materialDefinitions.filter(plain).map(material=>({id:String(material.id||''),name:String(material.name||'')})),
            canLink:!warnings.some(warning=>blockingCodes.has(warning.code)),
            warnings
        };
    }

    function sourceMaterialDefinitions(model) {
        try {
            const raw = model.sa_material_instances_json || [];
            const records = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return new Map((Array.isArray(records) ? records : []).filter(record=>plain(record)&&record.id).map(record=>[String(record.id),record]));
        } catch (_) { return new Map(); }
    }

    function linkedMaterialDefinition(element, faceName, definitions) {
        let faces = element?.sa_face_material_instance_ids || {};
        try { if(typeof faces==='string')faces=JSON.parse(faces); } catch (_) { faces={}; }
        const id = faces?.[faceName] || element?.sa_material_instance_id;
        if(id && definitions.has(String(id)))return definitions.get(String(id));
        return element?.sa_material_id ? {id:String(element.sa_material_id),baseMaterialId:String(element.sa_material_id),uniforms:{}} : null;
    }

    // Mirror Light Manager's per-element texture_name assignment resolver.
    // Only unassigned/missing references fall back to the source default;
    // the receiver's selected texture must never influence linked geometry.
    function textureMeshTexture(model, element) {
        const records=model.textures||[];
        const reference=element?.texture_name?String(element.texture_name):'';
        let record=reference?['uuid','id','name','path'].map(key=>records.find(texture=>texture[key]===reference)).find(Boolean):null;
        record||=records.find(texture=>texture.use_as_default);
        if(!record)record=records.some(texture=>texture.render_mode==='layered')
            ? [...records].reverse().find(texture=>texture.visible!==false):records[0];
        if(record&&record.pbr_channel&&record.pbr_channel!=='color'&&record.group)
            record=records.find(texture=>texture.group===record.group&&texture.pbr_channel==='color')||record;
        return record||null;
    }

    function updateTextureMeshGeometry(geometry, record, model, textureRecord, pixels, THREE) {
        const width=Number(textureRecord?.uv_width||model.resolution?.width)||16;
        const height=Number(textureRecord?.uv_height||model.resolution?.height)||16;
        const positions=[],uvs=[],normals=[],indices=[],ranges=[];
        const scale=vector(record.scale,[1,1,1]),pivot=vector(record.local_pivot,[0,0,0]);
        const quad=(points,coords,normal,reverse=false)=>{
            const start=positions.length/3,indexStart=indices.length;
            for(let i=0;i<4;i++){
                positions.push(...points[i].map((value,axis)=>value*scale[axis]+pivot[axis]));
                uvs.push(...coords[i]);normals.push(...normal);
            }
            indices.push(...(reverse?[0,2,1,0,3,2]:[0,1,2,0,2,3]).map(i=>start+i));
            ranges.push({start:indexStart,count:6,faceKey:String(ranges.length),materialIndex:0,textureSize:[width,height]});
        };
        const corners=[[-width,0,0],[-width,0,height],[0,0,height],[0,0,0]];
        const frontUv=[[1,1],[1,0],[0,0],[0,1]];
        quad(corners,frontUv,[0,1,0]);
        quad(corners.map(([x,y,z])=>[x,-1,z]),frontUv,[0,-1,0],true);
        if(pixels?.width&&pixels?.height){
            const w=pixels.width,h=pixels.height;
            const solid=(x,y)=>x>=0&&x<w&&y>=0&&y<h&&pixels.data[(y*w+x)*4+3]>140;
            const edge=(sx,sy,ex,ey,dir)=>{
                const points=[[-sx*width/w,0,sy*height/h],[-sx*width/w,-1,sy*height/h],[-ex*width/w,-1,ey*height/h],[-ex*width/w,0,ey*height/h]];
                const vertical=sx===ex;
                if(vertical){sx-=.1*dir;ex-=.4*dir;sy+=.1;ey-=.1;}
                else{sy+=.1*dir;ey+=.4*dir;sx+=.1;ex-=.1;}
                quad(points,[[ex/w,1-sy/h],[ex/w,1-ey/h],[sx/w,1-ey/h],[sx/w,1-sy/h]],vertical?[-dir,0,0]:[0,0,-dir],dir!==1);
            };
            for(let y=0;y<h;y++)for(let x=0;x<=w;x++)if(solid(x-1,y)!==solid(x,y))edge(x,y,x,y+1,solid(x-1,y)?1:-1);
            for(let x=0;x<w;x++)for(let y=0;y<=h;y++)if(solid(x,y-1)!==solid(x,y))edge(x,y,x+1,y,solid(x,y-1)?-1:1);
        }
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
        geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
        geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
        geometry.setIndex(indices);
        geometry.userData.saLogicalFaceRanges=ranges;
        geometry.computeBoundingBox();geometry.computeBoundingSphere();
        return geometry;
    }

    function linkedTextureReferences(model, defaultTextureKey) {
        const records=[...(model.textures||[]),...(model.lightflow_terrain?.textures||[])];
        const references=new Set(terrainSections(model).flatMap(section=>section.terrain_materials.map(material=>String(material.map??'')).filter(Boolean)));
        if(defaultTextureKey!==undefined)references.add(defaultTextureKey);
        for(const element of model.elements||[])if(['cube','mesh','billboard'].includes(element.type||'cube'))for(const face of Object.values(element.faces||{})){
            if(face?.texture!==null&&face?.texture!==false&&face?.texture!==undefined)references.add(String(face.texture));
        }
        for(const element of model.elements||[])if(element.type==='texture_mesh'){
            const texture=textureMeshTexture(model,element);
            if(texture)references.add(String(records.indexOf(texture)));
        }
        const definitions=sourceMaterialDefinitions(model),usedDefinitions=new Set();
        for(const element of model.elements||[]){
            for(const face of [null,...Object.keys(element.faces||{})]){
                const definition=linkedMaterialDefinition(element,face,definitions);
                if(definition)usedDefinitions.add(definition);
            }
        }
        for(const definition of usedDefinitions)for(const uniform of Object.values(definition.uniforms||definition.uniformOverrides||{})){
            const id=uniform?.texture_uuid||uniform?.textureUuid;
            if(id)references.add(String(id));
        }
        const usedGroups=new Set();
        records.forEach((record,index)=>{
            if(references.has(String(index))||references.has(String(record.uuid||record.id))){
                if(record.group)usedGroups.add(String(record.group));
            }
        });
        const materialGroups=new Set((model.texture_groups||[]).filter(group=>group.is_material&&usedGroups.has(String(group.uuid))).map(group=>String(group.uuid)));
        records.forEach((record,index)=>{if(materialGroups.has(String(record.group)))references.add(String(index));});
        return references;
    }

    // Detached adapters reuse the native PBR bridge without adding source
    // textures/groups to the receiver's project-wide Blockbench registries.
    function linkedTextureBindings(model, textureInfos) {
        const bindings=new Map(),groups=new Map(),members=new Map(),byInfo=new Map();
        for(const record of model.texture_groups||[]){
            const id=String(record.uuid);
            members.set(id,[]);
            groups.set(id,{...record,getTextures:()=>members.get(id)});
        }
        for(const info of new Set(textureInfos.values())){
            // Native Texture.getOwnMaterial() starts with alphaTest=0. Keep
            // that metadata on detached textures so Shader Architect derives
            // the same coverage floor instead of its missing-value fallback.
            const record=info.record,ownMaterial={map:info.texture,alphaTest:0};
            // Detached bindings are not native Texture instances, so the host
            // Canvas.getRenderSide() cannot read their explicit side override.
            if(record.render_sides==='front')ownMaterial.side=0;
            else if(record.render_sides==='back')ownMaterial.side=1;
            else if(record.render_sides==='double')ownMaterial.side=2;
            const binding={...record,texture:info.texture,sa_source_format:String(model.meta?.model_format||''),
                uv_width:Number(record.uv_width||model.resolution?.width||16),
                uv_height:Number(record.uv_height||model.resolution?.height||16),
                getOwnMaterial:()=>ownMaterial,
                getGroup:()=>groups.get(String(record.group))||null};
            const groupMembers=members.get(String(record.group));
            if(groupMembers)groupMembers.push(binding);
            byInfo.set(info,binding);
        }
        for(const [key,info] of textureInfos)bindings.set(key,byInfo.get(info));
        return bindings;
    }

    function normalizePose(input) {
        const pose=plain(input)?input:{};
        const mode=POSE_MODES.has(pose.mode)?pose.mode:'additive';
        return {
            mode,
            position:vector(pose.position,[0,0,0]),
            rotation:vector(pose.rotation,[0,0,0]),
            scale:vector(pose.scale,[1,1,1])
        };
    }

    function portablePathAPI() {
        const splitRoot = input => {
            const path=String(input||'').replace(/\\/g,'/');
            const drive=/^[A-Za-z]:\//.exec(path);
            const unc=/^\/\/[^/]+\/[^/]+(?:\/|$)/.exec(path);
            const root=drive?.[0]||unc?.[0]||(path.startsWith('/')?'/':'');
            return {root:unc&&!root.endsWith('/')?root+'/':root,parts:path.slice(root.length).split('/').filter(Boolean)};
        };
        const normalize=input=>{
            const {root,parts}=splitRoot(input),stack=[];
            for(const part of parts){if(part==='.')continue;if(part==='..'&&stack.length&&stack.at(-1)!=='..')stack.pop();else if(part==='..'&&!root)stack.push(part);else if(part!=='..')stack.push(part);}
            return root+stack.join('/')||'.';
        };
        const resolve=(...items)=>{
            let current='';
            for(const item of items){const value=String(item||'').replace(/\\/g,'/');if(!value)continue;current=splitRoot(value).root||!current?value:(current.replace(/\/$/,'')+'/'+value);}
            if(!splitRoot(current).root)throw new Error('An absolute .bbmodel path is required.');
            return normalize(current);
        };
        const dirname=input=>{const value=normalize(input),{root}=splitRoot(value);if(value===root)return root;const index=value.lastIndexOf('/');return index<root.length-1?root:value.slice(0,index)||root;};
        const parse=input=>({root:splitRoot(input).root});
        const relative=(from,to)=>{
            const a=splitRoot(resolve(from)),b=splitRoot(resolve(to));
            if(a.root.toLowerCase()!==b.root.toLowerCase())return resolve(to);
            const equal=(x,y)=>a.root==='/'?x===y:x.toLowerCase()===y.toLowerCase();
            let shared=0;while(shared<a.parts.length&&shared<b.parts.length&&equal(a.parts[shared],b.parts[shared]))shared++;
            return [...a.parts.slice(shared).map(()=>'..'),...b.parts.slice(shared)].join('/');
        };
        return {normalize,resolve,dirname,parse,relative};
    }

    const multiplyQuat = (a,b) => [
        a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
        a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
        a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
        a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]
    ];
    function quaternionFromDegrees(degrees, order='XYZ') {
        const angles=vector(degrees,[0,0,0]).map(value=>value*Math.PI/360);
        const axis={X:[Math.sin(angles[0]),0,0,Math.cos(angles[0])],Y:[0,Math.sin(angles[1]),0,Math.cos(angles[1])],Z:[0,0,Math.sin(angles[2]),Math.cos(angles[2])]};
        let result=[0,0,0,1];
        for(const letter of /^[XYZ]{3}$/.test(order)&&new Set(order).size===3?order:'XYZ') result=multiplyQuat(result,axis[letter]);
        return result;
    }
    function resolveGroupPose(sourceGroup, poseInput, eulerOrder='XYZ') {
        if (!plain(sourceGroup)) throw new Error('A source group is required.');
        const pose=normalizePose(poseInput);
        const pivot=vector(sourceGroup.origin,[0,0,0]);
        const baseRotation=vector(sourceGroup.rotation,[0,0,0]);
        const baseScale=vector(sourceGroup.scale,[1,1,1]);
        if (pose.mode==='absolute') return {
            pivot,
            position:pose.position,
            quaternion:quaternionFromDegrees(pose.rotation,eulerOrder),
            scale:pose.scale,
            mode:pose.mode
        };
        return {
            pivot,
            position:pivot.map((value,index)=>value+pose.position[index]),
            quaternion:multiplyQuat(quaternionFromDegrees(baseRotation,eulerOrder),quaternionFromDegrees(pose.rotation,eulerOrder)),
            scale:baseScale.map((value,index)=>value*pose.scale[index]),
            mode:pose.mode
        };
    }

    function normalizePoseSnapshot(value) {
        if(!plain(value)||value.version!==1||!plain(value.groups)||Object.keys(value.groups).length>512)throw new Error('Invalid linked pose snapshot');
        const groups={};
        for(const[id,pose]of Object.entries(value.groups)){
            if(!id||id.length>128||['__proto__','constructor','prototype'].includes(id)||!plain(pose))throw new Error('Invalid pose bone');
            const entry={};
            for(const channel of ['position','rotation','scale']){
                const data=pose[channel];
                if(!Array.isArray(data)||data.length!==3||!data.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e9))throw new Error('Invalid pose transform');
                entry[channel]=data.slice();
            }
            groups[id]=entry;
        }
        return {version:1,groups};
    }
    const animationSupport=new WeakMap();
    function animationSupported(animation) {
        if(!plain(animation))return false;
        if(animationSupport.has(animation))return animationSupport.get(animation);
        let hasTransforms=false;
        for(const [id,animator] of Object.entries(animation?.animators||{})){
            if(id==='effects'||animator?.type&&animator.type!=='bone')continue;
            if(animator.rotation_global||animator.quaternion_interpolation)return false;
            for(const key of animator.keyframes||[]){
                if(!['position','rotation','scale'].includes(key.channel))continue;
                hasTransforms=true;
                if(!['linear','step','catmullrom','bezier'].includes(key.interpolation||'linear'))return false;
                if(!key.data_points?.length||key.data_points.some(point=>['x','y','z'].some(axis=>point[axis]!==undefined&&typeof point[axis]!=='string'&&!Number.isFinite(Number(point[axis])))))return false;
            }
        }
        animationSupport.set(animation,hasTransforms);return hasTransforms;
    }
    const legacyAnimationModels=new WeakMap();
    function normalizeLinkedAnimations(model,invertExpression) {
        const animations=Array.isArray(model?.animations)?model.animations:[];
        const version=Number.parseInt(model?.meta?.format_version??model?.meta?.format,10);
        if(!Number.isFinite(version)||version>=5)return animations;
        if(legacyAnimationModels.has(model))return legacyAnimationModels.get(model);
        const invert=value=>{
            if(typeof value==='number')return -value;
            if(value===''||value==='0')return value;
            if(Number.isFinite(Number(value)))return String(-Number(value));
            if(typeof invertExpression!=='function')throw new Error('Native Molang inversion is required for legacy linked animations.');
            return invertExpression(value);
        };
        const normalized=animations.map(animation=>({...animation,animators:Object.fromEntries(
            Object.entries(animation.animators||{}).map(([id,animator])=>[id,{...animator,keyframes:(animator.keyframes||[]).map(key=>{
                const axes=key.channel==='rotation'?['x','y']:key.channel==='position'?['x']:[];
                if(!axes.length)return key;
                const converted={...key,data_points:(key.data_points||[]).map(point=>{
                    const copy={...point};for(const axis of axes)if(copy[axis])copy[axis]=invert(copy[axis]);return copy;
                })};
                if(key.interpolation==='bezier')for(const field of ['bezier_left_value','bezier_right_value']){
                    if(Array.isArray(key[field]))converted[field]=key[field].map((value,index)=>axes.includes(['x','y','z'][index])?-value:value);
                }
                return converted;
            })}])
        )}));
        legacyAnimationModels.set(model,normalized);return normalized;
    }
    const animationTracks=new WeakMap();
    function linkedAnimationTime(state,animation,timelineTime=0){
        const clock=state.animation_locked?finite(state.animation_time):finite(timelineTime);
        const time=Math.max(0,clock+finite(state.animation_offset));
        const length=Math.max(0,finite(animation?.length));
        return length>0?(state.animation_loop&&time>length?time%length:Math.min(time,length)):time;
    }
    function sampleAnimationChannel(animation, groupId, channel, time) {
        const animator=animation?.animators?.[groupId];
        if(!animator || animator.type && animator.type!=='bone')return null;
        const defaultValue=channel==='scale'?[1,1,1]:[0,0,0];
        let tracks=animationTracks.get(animation);if(!tracks){tracks=new Map();animationTracks.set(animation,tracks);}
        const trackId=groupId+'\0'+channel;
        let keys=tracks.get(trackId);
        if(!keys){keys=(Array.isArray(animator.keyframes)?animator.keyframes:[])
            .filter(key=>key?.channel===channel&&Number.isFinite(Number(key.time))&&key.data_points?.length)
            .map(key=>({time:Number(key.time),single:key.data_points.length===1,value:['x','y','z'].map((axis,index)=>finite(key.data_points.at(-1)?.[axis],defaultValue[index])),incoming:['x','y','z'].map((axis,index)=>finite(key.data_points[0]?.[axis],defaultValue[index])),interpolation:key.interpolation||'linear'}))
            .sort((a,b)=>a.time-b.time);tracks.set(trackId,keys);}
        if(!keys.length)return null;
        if(time<keys[0].time)return keys[0].incoming;
        const exact=keys.find(key=>Math.abs(key.time-time)<1e-9);if(exact)return exact.incoming;
        if(time>=keys.at(-1).time)return keys.at(-1).value;
        const nextIndex=keys.findIndex(key=>key.time>time),left=keys[nextIndex-1],right=keys[nextIndex];
        if(left.interpolation==='step')return left.value;
        const fraction=(time-left.time)/Math.max(1e-6,right.time-left.time);
        if(left.interpolation==='catmullrom'||right.interpolation==='catmullrom'){
            let before=keys[nextIndex-2],after=keys[nextIndex+1];
            if(animation.loop==='loop'&&keys.length>=3){before||=keys.at(-2);after||=keys[1];}
            const previous=before&&left.single?before.value:left.value,following=after&&right.single?after.incoming:right.incoming;
            return left.value.map((value,i)=>{
                const t=fraction,t2=t*t,t3=t2*t;
                return .5*((2*value)+(-previous[i]+right.incoming[i])*t+(2*previous[i]-5*value+4*right.incoming[i]-following[i])*t2+(-previous[i]+3*value-3*right.incoming[i]+following[i])*t3);
            });
        }
        return left.value.map((value,i)=>value+(right.incoming[i]-value)*fraction);
    }

    function reconcilePoses(manifest, poses) {
        const sourceGroups=new Set(manifest.groups.map(group=>group.id));
        const active={};
        const conflicts={};
        for(const [id,input] of Object.entries(plain(poses)?poses:{})) {
            const normalized=normalizePose(input);
            if(sourceGroups.has(id)) active[id]=normalized;
            else conflicts[id]={...normalized,reason:'group_removed'};
        }
        return {active,conflicts};
    }

    function makeLinkReference(sourcePath, receiverPath, pathAPI) {
        if (!pathAPI?.resolve || !pathAPI?.relative || !pathAPI?.dirname || !pathAPI?.parse) throw new Error('A native path adapter is required.');
        const source=String(sourcePath||'');
        if (!/\.bbmodel$/i.test(source)) throw new Error('Choose a saved .bbmodel project.');
        const receiver=String(receiverPath||'');
        if(!pathAPI.parse(source).root&&!receiver)throw new Error('Save the receiving project before using a relative source path.');
        const absolute=receiver?pathAPI.resolve(pathAPI.dirname(pathAPI.resolve(receiver)),source):pathAPI.resolve(source);
        const sameRoot=receiver&&pathAPI.parse(absolute).root.toLowerCase()===pathAPI.parse(pathAPI.resolve(receiver)).root.toLowerCase();
        const relative=sameRoot?pathAPI.relative(pathAPI.dirname(pathAPI.resolve(receiver)),absolute):'';
        return {version:VERSION,sourcePath:relative&&relative!==absolute?relative.replace(/\\/g,'/'):null,absoluteFallback:absolute,portable:!!relative};
    }
    function resolveLinkReference(link, receiverPath, pathAPI) {
        if (!plain(link)) throw new Error('A link reference is required.');
        const receiver=String(receiverPath||'');
        if(link.sourcePath&&receiver) return pathAPI.resolve(pathAPI.dirname(pathAPI.resolve(receiver)),link.sourcePath);
        return link.absoluteFallback || null;
    }

    function canonicalPathKey(resolved, pathAPI) {
        if(!resolved)return null;
        const normalized=pathAPI.normalize(resolved).replace(/\\/g,'/');
        return /^[A-Za-z]:\//.test(normalized)||normalized.startsWith('//')?normalized.toLowerCase():normalized;
    }
    function sourceCacheKey(link, receiverPath, pathAPI) {
        return canonicalPathKey(resolveLinkReference(link,receiverPath,pathAPI),pathAPI);
    }

    function rebaseLinkReference(link, receiverPath, destination, pathAPI, confirmedPath) {
        if(!destination)return link;
        const directoryKey=file=>file&&canonicalPathKey(pathAPI.dirname(file),pathAPI);
        if(link.sourcePath&&directoryKey(receiverPath)===directoryKey(destination))return link;
        const source=confirmedPath||resolveLinkReference(link,receiverPath,pathAPI);
        if(!source)return link;
        const rebased=makeLinkReference(source,destination,pathAPI);
        if(!confirmedPath&&rebased.sourcePath&&link.absoluteFallback)rebased.absoluteFallback=link.absoluteFallback;
        return {...link,...rebased};
    }

    async function readLinkedFile(link, receiverPath, pathAPI, readFile) {
        const resolved=resolveLinkReference(link,receiverPath,pathAPI);
        if(!resolved)return {status:'missing',path:null};
        let readError;
        const candidates=[resolved];
        if(link.absoluteFallback&&canonicalPathKey(link.absoluteFallback,pathAPI)!==canonicalPathKey(resolved,pathAPI))candidates.push(link.absoluteFallback);
        for(const candidate of candidates){
            try{return {status:'ready',path:candidate,bytes:await readFile(candidate),usedFallback:candidate!==resolved};}
            catch(error){
                // A stale relative path may be a directory or inaccessible while
                // the original absolute source remains readable. Try both paths.
                if(!readError||['ENOENT','ENOTDIR'].includes(readError.error?.code))readError={error,path:candidate};
            }
        }
        const error=readError?.error;
        if(['ENOENT','ENOTDIR'].includes(error?.code))return {status:'missing',path:resolved};
        return {status:'read_error',path:readError?.path||resolved,message:String(error?.message||error)};
    }

    async function readLinkedSource(link, receiverPath, pathAPI, io, hash) {
        if(typeof io?.readFile!=='function'||typeof hash!=='function') throw new Error('File and revision adapters are required.');
        const file=await readLinkedFile(link,receiverPath,pathAPI,io.readFile);
        if(file.status!=='ready')return file;
        const {bytes,path:actualPath,usedFallback}=file;
        const text=typeof bytes==='string'?bytes:new TextDecoder().decode(bytes);
        try {
            let model=parseBBModel(text);
            if (io.prepareModel) model=await io.prepareModel(model);
            const manifest=inspectBBModel(model);
            if(!manifest.canLink)return {status:'incompatible',path:actualPath,manifest,message:'Source group or element identifiers are ambiguous.'};
            return {status:'ready',path:actualPath,cacheKey:canonicalPathKey(actualPath,pathAPI),usedFallback,revision:await hash(text),manifest,model};
        } catch(error) {
            return {status:'incompatible',path:actualPath,message:String(error?.message||error)};
        }
    }

    function bundleFileName(name) {
        let clean=String(name||'').split(/[\\/]/).pop().replace(/[<>:"|?*\x00-\x1f]/g,'_')
            .trim().replace(/[. ]+$/g,'');
        if(clean.length>120){
            const extension=clean.match(/\.[a-z0-9]{1,12}$/i)?.[0]||'';
            clean=clean.slice(0,120-extension.length)+extension;
        }
        return !clean||/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(clean)
            ? '_'+(clean||'Scene') : clean;
    }

    async function buildSceneBundle(rootModel, rootPath, rootName, paths, {readProject,readAsset,prepareModel,checkActive=()=>{}}) {
        const entries=new Map(),projects=new Map(),assets=new Map();
        const root={model:parseBBModel(JSON.parse(JSON.stringify(rootModel))),source:rootPath,
            path:bundleFileName(String(rootName||'Scene').replace(/\.bbmodel$/i,''))+'.bbmodel'};
        const queue=[root];
        if(rootPath)projects.set(canonicalPathKey(rootPath,paths),root);
        const archivePaths=portablePathAPI();
        const relative=(from,to)=>archivePaths.relative(archivePaths.dirname('/'+from),'/'+to);
        const read=async path=>{
            checkActive();
            return projects.get(canonicalPathKey(path,paths))||{text:await readProject(path)};
        };
        for(const project of queue){
            checkActive();
            for(const node of project.model.elements||[]){
                if(node.type!=='lightflow_scene_instance'||!node.source_link)continue;
                try{
                    const result=await readLinkedFile(JSON.parse(node.source_link),project.source,paths,read);
                    if(result.status!=='ready')throw new Error(result.path||node.name||node.uuid);
                    const key=canonicalPathKey(result.path,paths);
                    let target=projects.get(key);
                    if(!target){
                        const model=parseBBModel(result.bytes.text);
                        // Skin presets need reconstructed geometry for validation.
                        // Archive the native source so Blockbench can still edit it as a Skin.
                        const inspectionModel=prepareModel?await prepareModel(model):model;
                        if(!inspectBBModel(inspectionModel).canLink)throw new Error(result.path);
                        target={model,source:result.path,path:`scene-links/${queue.length}-${bundleFileName(result.path)}`};
                        projects.set(key,target);
                        queue.push(target);
                    }
                    node.source_link=JSON.stringify({version:VERSION,sourcePath:relative(project.path,target.path),absoluteFallback:null,portable:true});
                }catch(error){
                    checkActive();
                    throw new Error(`${project.path} → ${node.name||node.uuid||'Scene Link'}\n${error.message}`);
                }
            }
            const textures=project.model.textures||[],textureNames=new Set(),texturePaths=new Map();
            for(const texture of textures){
                for(const key of ['uuid','id','name'])if(texture[key])textureNames.add(texture[key]);
                if(texture.path&&!texturePaths.has(texture.path))texturePaths.set(texture.path,texture.uuid||texture.id||texture.name);
            }
            for(const node of project.model.elements||[]){
                const name=node.texture_name;
                if(node.type==='texture_mesh'&&!textureNames.has(name)&&texturePaths.get(name))node.texture_name=texturePaths.get(name);
            }
            for(const texture of textures){
                const pathsToTry=[texture.relative_path,texture.path,texture.source]
                    .filter(value=>typeof value==='string'&&value&&!/^(?:data:|blob:|https?:)/i.test(value));
                const embedded=typeof texture.source==='string'&&texture.source.startsWith('data:');
                if(!embedded&&pathsToTry.length){
                    let packed;
                    for(const candidate of pathsToTry){
                        checkActive();
                        try{
                            const file=project.source?paths.resolve(paths.dirname(project.source),candidate):paths.resolve(candidate);
                            const key=canonicalPathKey(file,paths);
                            packed=assets.get(key);
                            if(!packed){
                                const bytes=await readAsset(file);
                                packed=`textures/${assets.size+1}-${bundleFileName(file)}`;
                                assets.set(key,packed);entries.set(packed,bytes);
                            }
                            break;
                        }catch(_){/* Try the original absolute texture path. */}
                    }
                    checkActive();
                    if(!packed)throw new Error(`${project.path} → ${texture.name||pathsToTry[0]}`);
                    texture.relative_path=relative(project.path,packed);
                    delete texture.source;
                }else if(!embedded&&texture.source){
                    throw new Error(`${project.path} → ${texture.name||'Texture'}`);
                }else delete texture.relative_path;
                delete texture.path;
            }
            entries.set(project.path,JSON.stringify(project.model));
        }
        return {entries,root:root.path,projectCount:queue.length};
    }

    function sourceDisplayStatus(previousRevision, readResult) {
        if(readResult?.status!=='ready')return readResult?.status||'missing';
        if(previousRevision&&previousRevision!==readResult.revision)return 'changed';
        return 'ready';
    }

    function detectReferenceCycle(edges, start) {
        const visiting=new Set(),visited=new Set(),path=[];
        const walk=id=>{
            if(visiting.has(id)) return [...path.slice(path.indexOf(id)),id];
            if(visited.has(id)) return null;
            visiting.add(id);path.push(id);
            for(const child of edges[id]||[]) {const cycle=walk(child);if(cycle)return cycle;}
            path.pop();visiting.delete(id);visited.add(id);return null;
        };
        return walk(start);
    }

    return {VERSION,textureMeshTexture,updateTextureMeshGeometry,patchTerrainMapSamples,terrainGridOffset,terrainFaceRanges,createTerrainInstanceGeometry,createTerrainBufferOwnerGeometry,parseBBModel,terrainSections,inspectBBModel,sourceMaterialDefinitions,linkedMaterialDefinition,linkedTextureReferences,linkedTextureBindings,normalizePose,portablePathAPI,quaternionFromDegrees,resolveGroupPose,normalizePoseSnapshot,animationSupported,normalizeLinkedAnimations,sampleAnimationChannel,linkedAnimationTime,reconcilePoses,makeLinkReference,resolveLinkReference,rebaseLinkReference,canonicalPathKey,sourceCacheKey,readLinkedFile,readLinkedSource,buildSceneBundle,sourceDisplayStatus,detectReferenceCycle};
});

if (typeof Plugin !== 'undefined' && typeof Blockbench !== 'undefined') {
    const PROJECT_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAABjElEQVR4AbSUPUpDURCFhxQ2NoqCokUiCIoGLcRKFyCksxYtXIG9exDB1k5bOzcgWloIGrRKFAQFgzaCnfI9OJfh/iSkMPBxZu7MnJvhPV6tXm/8/gc1i371g44Bxyj4OM59jVgkxs9HcwY0oODjOPc1YpEY6x9NHrdMbJ7eWz8w0xwxJMYciqXxMQPyxvSo5aCWIzHWqrnmfmfxXGIcrySz7VkzKOXxXGIc3yyjQRrPJcbxzTK8eDWDUh7PBeO4IINhVT7BWKtIMWx/fhkQd9++LQc10Jw0GOumqcayLa5u2Nb8ScXKz56NfLSt93RbKTH4fOeyY8AF8qmR9GOmuW4wsbBWKTH4PDcfjLXCe/fBHu9u7Kw1V/HSOzTIDatHSo98gjErAEUUiAdBH9CHAnEw5ibgUErMwwNi//DIhfpR4DwYk3jUwLcCqPGtkCpWH+eeorFW8s25uNRXNM6ZDHNWNNaKV7vnBtf7zeotkfImcJH6iD1FY62IAkNefUwtpmisf4ICg159TC3mDwAA//993qksAAAABklEQVQDAPQIBToKDpbRAAAAAElFTkSuQmCC';


    Plugin.register('lightflow_scene_links', {
        title:'Lightflow Scene Links', 
        icon: PROJECT_ICON, 
        author:'MidFord327',
        description:'Compose scenes with linked Blockbench projects and independent group poses.',
        tags:['Lightflow','Scenes','Composition'], version:'0.1.0', min_version:'4.9.0', variant:'desktop',
        about:'Linked Blockbench projects with independent transforms, poses and source animations.',
        onload() {
            // Local development files have no catalog folder/about.md to fetch.
            if(this.source==='file')this.new_repository_format=false;
            const core=window.LightflowSceneLinksCore, paths=core.portablePathAPI();
            const owned=[];
            const assetCache=new Map();
            const receiverBaseKey=Symbol.for('lightflow.sceneLinks.receiverBase'),confirmedSources=new WeakMap();
            // Save As changes Project.save_path before compile. Keep live
            // references (including Undo snapshots) in their original frame.
            const receiverBase=project=>{
                if(!project)return '';
                return project[receiverBaseKey]??=(project.save_path||'');
            };
            const confirmedSource=element=>{
                const confirmed=confirmedSources.get(element);
                return confirmed&&confirmed.reference===element.source_link?confirmed.path:null;
            };
            const poseTrackFrames=new WeakMap();
            const mountedCubes=new WeakMap();
            const sourceForPose=new WeakMap();
            let disposed=false;
            let updatingAnimatedTree=false;
            let syncPanel=()=>{},arrangeInspector=()=>{},updateOutline=()=>{},applyPoseAnimation=()=>{},scheduleAnimation=()=>{};
            let instanceController=null, poseController=null, inspector=null, motionPanel=null, animationLibrary=null;
            let pickerDialog=null,importDialog=null;
            if(['lightflow_scene_link_picker','lightflow_scene_link_import'].includes(Dialog.open?.id))Dialog.open.delete();
            document.querySelectorAll('#lightflow_scene_link_picker,#lightflow_scene_link_import').forEach(node=>node.remove());
            owned.push({delete(){pickerDialog?.delete?.();importDialog?.delete?.();}});
            // UI copy stays local so this plugin can load independently.
            const SCENE_LINK_UI_TEXT = {
                "scene_animation": ["Scene animation","Animación de escena"],
                "pose_keyframes": ["Pose → bone keyframes…","Pose → keyframes de huesos…"],
                "pose_keyframe": ["Add pose keyframe…","Añadir keyframe de pose…"],
                "choose_key_pose": ["Choose pose for keyframe…","Elegir pose del keyframe…"],
                "pose_channel": ["Pose","Pose"],
                "select_local_animation": ["Select or create a local animation first.","Selecciona o crea primero una animación local."],
                "pose_source_changed": ["The linked skin changed. Select the pose again.","La skin vinculada cambió. Selecciona la pose de nuevo."],
                "pose_zero_scale": ["This bone has a zero-scale base. Use the Pose channel instead.","Este hueso tiene una escala base cero. Usa el canal Pose."],
                "pose_current": ["Current pose","Pose actual"],
                "multiple_poses": ["Multiple poses","Varias poses"],
                "connected": ["Connected","Conectada"],
                "changes_available": ["Changes available","Hay cambios"],
                "updating": ["Updating…","Actualizando…"],
                "source_missing": ["Source missing","Origen no encontrado"],
                "incompatible_source": ["Incompatible source","Origen incompatible"],
                "could_not_read_source": ["Could not read source","No se pudo leer el origen"],
                "edit_these_keyframes_in_the_source_project": ["Edit these keyframes in the source project","Edita estos keyframes en el proyecto de origen"],
                "open_source_project": ["Open source project","Abrir proyecto de origen"],
                "source_animation_read_only": ["Source animation · read-only","Animación de origen · solo lectura"],
                "source_keyframes_are_read_only": ["Source keyframes are read-only","Los keyframes del origen son de solo lectura"],
                "linked_scene_timeline": ["Linked scene timeline","Timeline de escena vinculada"],
                "choose_linked_animations": ["Choose linked animations","Elegir animaciones vinculadas"],
                "select_linked_clip": ["Select linked clip","Seleccionar clip vinculado"],
                "change_linked_playback_state": ["Change linked playback state","Cambiar estado de reproducción vinculada"],
                "lock_linked_animation_pose": ["Lock linked animation pose","Fijar pose de animación vinculada"],
                "original_pose": ["Original pose","Pose original"],
                "unsupported": ["unsupported","incompatible"],
                "offset_linked_clip": ["Offset linked clip","Desfasar clip vinculado"],
                "start_at_timeline_cursor": ["Start at timeline cursor","Comenzar en el cursor del timeline"],
                "edit_time_offset": ["Edit time offset…","Editar desfase de tiempo…"],
                "time_offset_seconds": ["Time offset (seconds)","Desfase de tiempo (segundos)"],
                "clip_time_timeline_offset_a_negative_offset_delays_its_start": ["Clip time = timeline + offset. A negative offset delays its start.","Tiempo del clip = timeline + desfase. Un valor negativo retrasa su inicio."],
                "reset_offset": ["Reset offset","Restablecer desfase"],
                "loop_animation": ["Loop animation","Repetir animación"],
                "change_clip_loop": ["Change clip loop","Cambiar bucle del clip"],
                "playback_state": ["Playback state","Estado de reproducción"],
                "play": ["Play","Reproducir"],
                "lock_current_pose": ["Lock current pose","Bloquear pose actual"],
                "source_recovery_help": ["The linked project could not be read. Choose its current file, leave this instance empty, or keep the link to retry later.","No se pudo leer el proyecto vinculado. Elige su archivo actual, deja la instancia vacía o conserva el vínculo para intentarlo más tarde."],
                "find_source_file": ["Find source…","Buscar origen…"],
                "leave_source_empty": ["Leave empty","Dejar vacío"],
                "retry_source_later": ["Later","Más tarde"],
                "empty_linked_scene": ["Empty linked scene","Vaciar escena vinculada"],
                "empty_source": ["Empty source","Origen vacío"],
                "could_not_open_source_project": ["Could not open source project","No se pudo abrir el proyecto origen"],
                "choose_another_project": ["Choose another project","Elige otro proyecto"],
                "a_project_cannot_contain_a_linked_instance_of_itself": ["A project cannot contain a linked instance of itself.","Un proyecto no puede contener una instancia vinculada de sí mismo."],
                "cannot_link_this_scene": ["Cannot link this scene","No se puede vincular esta escena"],
                "no_supported_geometry": ["No supported geometry","Sin geometría compatible"],
                "choose_a_project_with_cubes_meshes_or_billboards_effects_and_loc": ["Choose a project with cubes, meshes, texture meshes or billboards. Effects and locators are not imported.","Elige un proyecto con cubos, mallas, Texture Meshes o billboards. Los efectos y localizadores no se importan."],
                "add_linked_scene": ["Add linked scene","Añadir escena vinculada"],
                "link_a_scene": ["Link a scene","Vincular una escena"],
                "choose_what_this_instance_includes_textures_follow_the_selected": ["Choose what this instance includes. Textures follow the selected geometry.","Elige qué incluye esta instancia. Las texturas acompañan a la geometría elegida."],
                "instance_name": ["Instance name","Nombre de instancia"],
                "geometry": ["Geometry","Geometría"],
                "cubes_and_meshes_from_the_source_project": ["Cubes, meshes and texture meshes from the source project.","Cubos, mallas y Texture Meshes del proyecto de origen."],
                "sprite_elements_from_the_source_project": ["Sprite elements from the source project.","Elementos sprite del proyecto de origen."],
                "excluded_from_this_version": ["Excluded from this version: ","Se excluyen en esta versión: "],
                "source_animations_available_in_the_instance_inspector_group_tran": ["source animations available in the instance inspector. Group transforms only; effect tracks are excluded.","animaciones del origen disponibles en el inspector de la instancia. Solo transformaciones de grupos; las pistas de efectos se excluyen."],
                "source_material_overrides_are_preserved_receiver_overrides_take": ["Source material overrides are preserved. Receiver overrides take priority.","Se conservan los overrides del origen. Los overrides de esta instancia tienen prioridad."],
                "select_geometry_or_billboards": ["Select geometry or billboards","Selecciona geometría o billboards"],
                "blockbench_project": ["Blockbench project","Proyecto de Blockbench"],
                "relink_scene": ["Relink scene","Revincular escena"],
                "choose_a_3d_skin_model": ["Choose a 3D skin model.","Elige un modelo de skin 3D."],
                "choose_a_skin_texture": ["Choose a skin texture.","Elige una textura de skin."],
                "load_a_skin_texture_before_saving_this_project": ["Load a skin texture before saving this project.","Carga una textura de skin antes de guardar este proyecto."],
                "save_the_skin_separately_from_the_current_scene": ["Save the skin separately from the current scene.","Guarda la skin en un archivo distinto de la escena actual."],
                "linked_scene": ["Linked scene","Escena vinculada"],
                "compose_with_a_linked_project": ["Compose with a linked project","Compón con un proyecto vinculado"],
                "choose_a_blockbench_project_each_instance_has_its_own_position_a": ["Choose a Blockbench project. Each instance has its own position and pose; the model stays connected to its source.","Elige un proyecto de Blockbench. Cada instancia tiene posición y pose propias; el modelo sigue conectado a su origen."],
                "choose_bbmodel": ["Choose .bbmodel…","Elegir .bbmodel…"],
                "create_skin": ["Create skin…","Crear skin…"],
                "find_a_project": ["Find a project","Buscar proyecto"],
                "project": ["project","proyecto"],
                "projects": ["projects","proyectos"],
                "current_scene": ["Current scene","Escena actual"],
                "open": ["Open","Abierto"],
                "recent": ["Recent","Reciente"],
                "no_matching_projects_choose_a_bbmodel_file_to_continue": ["No matching projects. Choose a .bbmodel file to continue.","No hay proyectos coincidentes. Elige un archivo .bbmodel para continuar."],
                "choose_file": ["Choose file","Elegir archivo"],
                "the_source_remains_editable_in_its_own_tab": ["The source remains editable in its own tab.","El origen se puede seguir editando en su propia pestaña."],
                "close": ["Close","Cerrar"],
                "apply_skin_pose": ["Apply skin pose","Aplicar pose de skin"],
                "skin_pose": ["Skin pose","Pose de skin"],
                "cannot_apply_pose": ["Cannot apply pose","No se puede aplicar la pose"],
                "saved_poses": ["Saved poses","Poses guardadas"],
                "project_skin_poses": ["Project poses","Poses del proyecto"],
                "source_skin_poses": ["Source file poses…","Poses del archivo de origen…"],
                "source_skin_poses_empty": ["The source has no saved poses","El origen no tiene poses guardadas"],
                "restore_source_pose": ["Restore source pose","Restaurar pose del origen"],
                "reset_local_pose": ["Reset local pose","Restablecer pose local"],
                "instance_settings": ["Instance settings","Ajustes de instancia"],
                "material_override": ["Material override","Sobrescribir material"],
                "override_linked_material": ["Override linked material","Sobrescribir material vinculado"],
                "inherit_material": ["Inherit material","Heredar material"],
                "position": ["Position","Posición"],
                "offset": ["Offset","Desplazamiento"],
                "rotation": ["Rotation","Rotación"],
                "scale": ["Scale","Escala"],
                "scene_links": ["Scene Links","Escenas vinculadas"],
                "source_unavailable": ["Source unavailable","Origen no disponible"],
                "change_linked_animation_loop": ["Change linked animation loop","Cambiar repetición de animación vinculada"],
                "edit_linked_transform": ["Edit linked transform","Editar transformación vinculada"],
                "reset_linked_transform": ["Reset linked transform","Restablecer transformación vinculada"],
                "change_pose_mode": ["Change pose mode","Cambiar modo de pose"],
                "build_a_scene_with_linked_projects": ["Build a scene with linked projects","Compón una escena con proyectos vinculados"],
                "choose_an_instance_in_the_outliner_to_place_it_or_open_a_group_t": ["Choose an instance in the Outliner to place it, or open a group to pose it.","Selecciona una instancia en el Outliner para colocarla, o abre un grupo para posarlo."],
                "select_instance": ["Select instance","Seleccionar instancia"],
                "reset_group_pose": ["Reset group pose","Restablecer pose del grupo"],
                "groups": ["groups","grupos"],
                "elements": ["elements","elementos"],
                "textures": ["textures","texturas"],
                "instance_texture": ["Instance texture","Textura de la instancia"],
                "secondary_skin_layer": ["Secondary skin layer","Segunda capa de la skin"],
                "toggle_skin_layer": ["Toggle linked skin layer","Cambiar segunda capa de la skin vinculada"],
                "source_default_texture": ["Source default","Predeterminada del origen"],
                "linked_project_textures": ["Linked project","Proyecto vinculado"],
                "current_project_textures": ["Current project","Proyecto actual"],
                "missing_instance_texture": ["Texture missing · using source","Textura ausente · usando origen"],
                "change_instance_texture": ["Change linked instance texture","Cambiar textura de la instancia vinculada"],
                "source_material_overrides_are_not_linked_yet": ["Source material overrides are not linked yet","Los materiales personalizados del origen aún no se vinculan"],
                "textures_only": ["Textures only","Solo texturas"],
                "read_the_latest_saved_source": ["Read the latest saved source","Leer la última versión guardada del origen"],
                "update": ["Update","Actualizar"],
                "edit_the_source_project": ["Edit the source project","Editar el proyecto origen"],
                "open_2": ["Open","Abrir"],
                "find_a_moved_source": ["Find a moved source","Buscar un origen movido"],
                "find": ["Find","Buscar"],
                "source_actions": ["Source project actions","Acciones del proyecto de origen"],
                "pose_this_group": ["Pose this group","Posar este grupo"],
                "place_the_instance": ["Place the instance","Colocar la instancia"],
                "posed": ["posed","con pose"],
                "pose_mode": ["Pose mode","Modo de pose"],
                "adds_to_the_source_pose_follows_later_source_edits": ["Adds to the source pose; follows later source edits.","Se suma a la pose original y sigue sus cambios."],
                "additive": ["Additive","Aditiva"],
                "keeps_fixed_values_if_the_source_pose_changes": ["Keeps fixed values if the source pose changes.","Conserva valores fijos si cambia la pose original."],
                "absolute": ["Absolute","Absoluta"],
                "reset": ["Reset","Restablecer"],
                "linked_animation": ["Linked animation","Animación vinculada"],
                "animations": ["animations","animaciones"],
                "change_linked_clock": ["Change linked clock","Cambiar reloj vinculado"],
                "offset_linked_animation": ["Offset linked animation","Desfasar animación vinculada"],
                "change_linked_loop": ["Change linked loop","Cambiar repetición vinculada"],
                "evaluated_clip_time": ["Evaluated clip time","Tiempo evaluado del clip"],
                "animation_clock": ["Animation clock","Reloj de animación"],
                "linked_clips": ["Linked clips","Clips vinculados"],
                "time_offset": ["Time offset","Desfase temporal"],
                "offset_all_linked_clips": ["Time offset for all linked clips (seconds)","Desfase temporal para todos los clips vinculados (segundos)"],
                "default_clip_loop": ["Default loop for clips without an individual override","Repetición predeterminada de clips sin ajuste individual"],
                "follow_the_native_timeline_plus_offset": ["Follow the native timeline plus Offset","Seguir el timeline nativo más Offset"],
                "keep_the_pose_at_the_current_timeline_time": ["Keep the pose at the current timeline time","Conservar la pose en el instante actual del timeline"],
                "clip_time_offset": ["Clip time offset","Desfase de tiempo del clip"],
                "locked_pose": ["Locked pose","Pose bloqueada"],
                "playing_click_to_lock": ["Playing — click to lock","Reproduciendo — clic para bloquear"],
                "off_click_to_play": ["Off — click to play","Apagada — clic para reproducir"],
                "links": ["Links","Vínculo"]
            };
            const t = key => {
                const [en, es] = SCENE_LINK_UI_TEXT[key];
                return String(window.Language?.code||window.settings?.language?.value||'en').startsWith('es') ? es : en;
            };
            Language.addTranslations('en',{
                'lightflow_links.name':'Scene instance', 'lightflow_links.pose':'Local pose',
                'lightflow_links.add':'Linked scene…','lightflow_links.inspector':'Scene Links',
                'lightflow_links.open':'Open source','lightflow_links.refresh':'Update from source',
                'lightflow_links.relocate':'Find source…','lightflow_links.reset':'Reset local pose',
                'lightflow_links.export_bundle':'Export project with Scene Links…'
            });
            Language.addTranslations('es',{
                'lightflow_links.name':'Instancia de escena', 'lightflow_links.pose':'Pose local',
                'lightflow_links.add':'Escena vinculada…','lightflow_links.inspector':'Escenas vinculadas',
                'lightflow_links.open':'Abrir origen','lightflow_links.refresh':'Actualizar desde origen',
                'lightflow_links.relocate':'Buscar origen…','lightflow_links.reset':'Restablecer pose local',
                'lightflow_links.export_bundle':'Exportar proyecto con escenas vinculadas…'
            });
            const hash=async text=>{
                const bytes=new TextEncoder().encode(text);
                const digest=await crypto.subtle.digest('SHA-256',bytes);
                return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
            };
            // A bare require('fs') triggers Blockbench's broad filesystem
            // permission dialog. In an automated or unattended import that
            // synchronous prompt freezes the renderer/DevTools indefinitely.
            // Attempt only previously granted, *file-scoped* silent access;
            // otherwise use Blockbench's own path reader, bounded because it
            // does not guarantee a callback for failed reads.
            const readFile=async(path,readtype='text')=>{
                if(disposed)throw new Error('Scene Links unloaded');
                const files=require('node:fs',{scope:path,optional:true,show_permission_dialog:false});
                if(files?.promises?.readFile)return files.promises.readFile(path,readtype==='text'?'utf8':undefined);
                return new Promise((resolve,reject)=>{
                    let settled=false;
                    const finish=(error,content)=>{
                        if(settled)return;
                        settled=true;clearTimeout(timer);
                        if(error)reject(error);else resolve(content);
                    };
                    const timer=setTimeout(()=>{
                        const error=new Error('The source read did not complete. Choose the saved .bbmodel file again.');
                        error.code='ETIMEDOUT';finish(error);
                    },4000);
                    try{
                        // The host reports failed reads with console.error and
                        // can omit the callback; its default errorbox would
                        // also obscure Scene Links' own recovery UI.
                        Blockbench.read([path],{readtype,errorbox:false},entries=>{
                            const content=entries?.[0]?.content;
                            if(readtype==='text'?typeof content==='string':content instanceof ArrayBuffer)finish(null,content);
                            else finish(new Error('Blockbench did not return the requested file contents.'));
                        });
                    }catch(error){finish(error);}
                });
            };
            // Read the installed native preset without creating or selecting a project.
            let skinReadQueue=Promise.resolve();
            const skinSnapshots=new Map();
            const rebuildSkinModel=async(model,defaultPose)=>{
                if(model.meta.model_format!=='skin'||!model.skin_model)return model;
                const snapshotKey=await hash(JSON.stringify(model)+(defaultPose||''));
                if(disposed)throw new Error('Scene Links unloaded');
                if(skinSnapshots.has(snapshotKey))return skinSnapshots.get(snapshotKey);
                const seed=await hash(model.skin_model),codec=Codecs.skin_model,parse=codec.parse,stop={};
                let preset;
                try{
                    codec.parse=data=>{preset=JSON.parse(JSON.stringify(data));throw stop;};
                    try{codec.rebuild(model.skin_model);}catch(error){if(error!==stop)throw error;}
                }finally{codec.parse=parse;}
                if(!preset?.bones)throw new Error('Unknown skin model');
                const id=index=>{const suffix=index.toString(16).padStart(8,'0');return seed.slice(0,8)+'-'+seed.slice(8,12)+'-'+seed.slice(12,16)+'-'+seed.slice(16,20)+'-'+seed.slice(20,24)+suffix;};
                const groups=preset.bones.map((bone,index)=>{
                    const origin=(bone.pivot||[0,0,0]).slice();origin[0]*=-1;
                    const rotation=((!model.skin_pose_data&&model.skin_pose&&model.skin_pose!=='none'?bone.pose:undefined)||bone.rotation||[0,0,0]).slice();rotation[0]*=-1;rotation[1]*=-1;
                    return {uuid:id(index),name:bone.name,origin,rotation,children:[],skin_original_origin:origin.slice(),extend(data){this.rotation=data.rotation.slice();}};
                });
                const byName=new Map(groups.map(group=>[group.name,group]));
                if(defaultPose||(!model.skin_pose_data&&model.skin_pose&&!['none','natural'].includes(model.skin_pose))){
                    // Native pose math runs against detached data; no project events, tabs or rendering.
                    const receiver=Blockbench.Project,updateView=Canvas.updateView,panelPose=Panels.skin_pose.inside_vue.pose;
                    try{
                        Blockbench.Project={groups,elements:[],skin_pose:''};Canvas.updateView=()=>{};
                        Panels.skin_pose.inside_vue.setPose(defaultPose||model.skin_pose);
                    }finally{Blockbench.Project=receiver;Canvas.updateView=updateView;Panels.skin_pose.inside_vue.pose=panelPose;}
                }else if(model.skin_pose_data){
                    for(const group of groups){const entry=model.skin_pose_data[group.name]||model.skin_pose_data[group.name.replace(/\s/g,'')];const rotation=Array.isArray(entry)?entry:entry?.rotation;const offset=Array.isArray(entry)?[0,0,0]:entry?.offset;group.rotation=core.normalizePose({rotation}).rotation;group.origin=group.origin.map((value,i)=>value+(Number(offset?.[i])||0));}
                }
                const elements=[];let index=groups.length;
                const textureIndex=model.textures?.some(texture=>texture.render_mode==='layered')?Math.max(0,model.textures.findLastIndex(texture=>texture.visible!==false)):0;
                for(const bone of preset.bones){
                    const group=byName.get(bone.name),offset=group.origin.map((value,i)=>value-group.skin_original_origin[i]);
                    for(const cube of bone.cubes||[]){
                        const size=(cube.size||[0,0,0]).slice(),from=(cube.origin||[0,0,0]).slice();from[0]=-(from[0]+size[0]);
                        const to=from.map((value,i)=>value+size[i]);const pivot=(cube.pivot||[0,0,0]).slice();pivot[0]*=-1;
                        const rotation=(cube.rotation||[0,0,0]).slice();rotation[0]*=-1;rotation[1]*=-1;
                        const mirror=cube.mirror===undefined?bone.mirror===true:cube.mirror===true,faces={};
                        if(Array.isArray(cube.uv)){
                            // Same face domains and mirror permutation as native Cube.updateUV.
                            const [x,y,z]=size.map(value=>Math.floor(value+0.0000001)),[u,v]=cube.uv;
                            const domains=[['east',0,z,z,y],['west',z+x,z,z,y],['up',z+x,z,-x,-z],['down',z+2*x,0,-x,z],['south',2*z+x,z,x,y],['north',z,z,x,y]];
                            if(mirror){for(const face of domains){face[1]+=face[3];face[3]*=-1;}const east=domains[0].slice(1);domains[0].splice(1,4,...domains[1].slice(1));domains[1].splice(1,4,...east);}
                            for(const [side,du,dv,w,h] of domains)faces[side]={uv:[u+du,v+dv,u+du+w,v+dv+h],texture:textureIndex};
                        }else{
                            for(const side of ['east','west','up','down','south','north']){
                                const face=cube.uv?.[side];if(!face){faces[side]={texture:null,uv:[0,0,0,0]};continue;}
                                const [u,v]=face.uv,[w,h]=face.uv_size||(['up','down'].includes(side)?[size[0],size[2]]:['east','west'].includes(side)?[size[2],size[1]]:[size[0],size[1]]);
                                faces[side]={texture:textureIndex,rotation:face.uv_rotation||0,uv:['up','down'].includes(side)?[u+w,v+h,u,v]:[u,v,u+w,v+h]};
                            }
                        }
                        const element={uuid:id(index++),type:'cube',name:cube.name||bone.name,from:from.map((value,i)=>value+offset[i]),to:to.map((value,i)=>value+offset[i]),origin:pivot.map((value,i)=>value+offset[i]),rotation,inflate:cube.inflate||0,visibility:cube.visibility!==false,faces};
                        if(cube.layer===true)element.layer=true;
                        elements.push(element);group.children.push(element.uuid);
                    }
                    const parent=byName.get(bone.parent);if(parent)parent.children.push(group);
                }
                const outliner=groups.filter((group,index)=>!byName.has(preset.bones[index].parent));
                const serialize=group=>({uuid:group.uuid,children:group.children.map(child=>typeof child==='string'?child:serialize(child))});
                const snapshot={...model,elements,groups:groups.map(group=>({uuid:group.uuid,name:group.name,origin:group.origin,rotation:group.rotation})),outliner:outliner.map(serialize),resolution:{width:preset.texturewidth||64,height:preset.textureheight||64}};
                skinSnapshots.set(snapshotKey,snapshot);if(skinSnapshots.size>16)skinSnapshots.delete(skinSnapshots.keys().next().value);
                return snapshot;
            };
            const prepareSourceModel=(model,defaultPose)=>{
                if(model.meta.model_format!=='skin'||!model.skin_model)return model;
                const result=skinReadQueue.then(()=>rebuildSkinModel(model,defaultPose));
                skinReadQueue=result.catch(()=>{});return result;
            };
            owned.push({delete(){skinSnapshots.clear();}});
            const readSource=async(element,force=false)=>{
                const receiver=receiverBase(element._lightflowProject||window.Project);
                if(!element.source_link)return {status:'empty',path:null};
                let link;
                try{link=JSON.parse(element.source_link);if(!link||typeof link!=='object'||Array.isArray(link))return {status:'incompatible'};}catch(_){return {status:'incompatible'};}
                const key=core.sourceCacheKey(link,receiver,paths);
                if(!force&&key&&assetCache.has(key))return assetCache.get(key);
                const result=await core.readLinkedSource(link,receiver,paths,{readFile,prepareModel:prepareSourceModel},hash);
                if(result.status==='ready'){
                    result.key=result.cacheKey;
                    if(result.manifest.groups.length>0&&result.manifest.warnings.some(item=>item.code==='missing_element')){
                        result.warnings=result.manifest.warnings;
                    }
                    assetCache.set(result.key,result);
                }
                return result;
            };
            const ensureReloadPlaceholder=(element,project)=>{
                if(!project?.nodes_3d||project.nodes_3d[element.uuid])return;
                const mesh=new THREE.Object3D();
                mesh.name=element.uuid;mesh.type=element.type;mesh.isElement=true;mesh.visible=element.visibility!==false;
                mesh.geometry=new THREE.BufferGeometry();mesh.geometry.boundingBox=new THREE.Box3().makeEmpty();
                mesh.fix_position=new THREE.Vector3();mesh.fix_rotation=new THREE.Euler();
                mesh.userData.lightflowSceneLinkPlaceholder=true;
                project.nodes_3d[element.uuid]=mesh;
                project.model_3d?.add(mesh);
            };

            const scenePropertySchemas=new Map();
            const sceneProperties=Type=>{
                const current=Object.values(Type.properties||{});
                if(!disposed){scenePropertySchemas.set(Type,current);return current;}
                return [...new Map([...(scenePropertySchemas.get(Type)||[]),...current].map(prop=>[prop.name,prop])).values()];
            };
            const sceneChildTypes=['lightflow_pose_group','group','cube'];
            class SceneInstanceElement extends OutlinerElement {
                constructor(data,uuid){super(data,uuid);this.children=[];this.isOpen=false;for(const prop of sceneProperties(SceneInstanceElement))prop.reset(this);if(data)this.extend(data);}
                duplicate(){
                    const copy=super.duplicate();copy._lightflowProject=this._lightflowProject||Project;
                    refreshInstance(copy);return copy;
                }
                get origin(){return this.position;}
                getWorldCenter(){return this.mesh?.getWorldPosition(new THREE.Vector3())||new THREE.Vector3().fromArray(this.position);}
                extend(data){for(const prop of sceneProperties(SceneInstanceElement))prop.merge(this,data);this.sanitizeName();return this;}
                getUndoCopy(){const copy=new SceneInstanceElement(this,this.uuid);delete copy.parent;return copy;}
                getSaveCopy(meta){
                    const copy={type:'lightflow_scene_instance',uuid:this.uuid};
                    for(const prop of sceneProperties(SceneInstanceElement))prop.copy(this,copy);
                    const project=this._lightflowProject||window.Project,destination=project?.save_path;
                    if(copy.source_link&&destination&&(meta?.model_format||Blockbench.hasFlag?.('compiling_bbmodel'))){
                        try{
                            const link=JSON.parse(copy.source_link);
                            const rebased=core.rebaseLinkReference(link,receiverBase(project),destination,paths,confirmedSource(this));
                            if(rebased!==link)copy.source_link=JSON.stringify(rebased);
                        }catch(_){/* Preserve malformed legacy references for manual recovery. */}
                    }
                    return copy;
                }
                setColor(index){
                    this.color=index;
                    const row=document.getElementById(this.uuid)?.querySelector('.outliner_object');
                    if(row){for(const name of [...row.classList])if(name.startsWith('lightflow_scene_link_color_'))row.classList.remove(name);if(index>=0)row.classList.add(`lightflow_scene_link_color_${index%markerColors.length}`);}
                    window.updateSelection?.();
                    return this;
                }
                forEachChild(callback,type,includeSelf=false){if(includeSelf)callback(this);const visit=child=>{if(!type||(Array.isArray(type)?type.some(nodeType=>child instanceof nodeType):child instanceof type))callback(child);for(const nested of child.children||[])visit(nested);};this.children.forEach(visit);}
                openUp(){this.isOpen=true;this.parent?.openUp?.();return this;}
                select(...args){const changed=Outliner.selected[0]!==this;super.select(...args);arrangeInspector();syncPanel();if(Modes.animate){ensureTimeline();Animation.selected?.getBoneAnimator(this)?.select(true);}else if(changed&&Modes.edit)Panels.transform?.getHostPanel?.()?.selectTab?.(Panels.transform);return this;}
                unselect(...args){super.unselect(...args);syncPanel();}
                static behavior={parent:true,child_types:sceneChildTypes,select_children:'self_first',unique_name:true,movable:true,rotatable:true,scalable:true,use_absolute_position:true,marker_color:true,parent_types:['root','group','armature_bone']};
            }
            Object.assign(SceneInstanceElement.prototype,{type:'lightflow_scene_instance',title:'Scene instance',icon:'kid_star',movable:true,rotatable:true,scalable:true,needsUniqueName:true});
            SceneInstanceElement.prototype.buttons=[Outliner.buttons.locked,Outliner.buttons.visibility];
            owned.push(new Property(SceneInstanceElement,'string','texture_override',{default:''}));
            owned.push(new Property(SceneInstanceElement,'boolean','secondary_skin_layer',{default:false}));
            for(const[key,type,value]of[['name','string','Scene instance'],['source_link','string',''],['source_revision','string',''],['include_geometry','boolean',true],['include_billboards','boolean',true],['animation_id','string',''],['animation_ids','array',[]],['animation_layers','array',[]],['animation_locked','boolean',false],['animation_offset','number',0],['animation_time','number',0],['animation_loop','boolean',true],['animation_loop_override','boolean',false],['position','vector',[0,0,0]],['rotation','vector',[0,0,0]],['scale','vector',[1,1,1]],['color','number',-1],['visibility','boolean',true],['locked','boolean',false]])owned.push(new Property(SceneInstanceElement,type,key,{default:value}));
            owned.push(new Property(SceneInstanceElement,'string','source_model_format',{default:''}));
            const migratedRoots=[];
            for(const project of window.ModelProject?.all||[]){for(const element of project.elements||[]){
                if(element?.type!=='lightflow_scene_instance'||element instanceof SceneInstanceElement)continue;
                Object.setPrototypeOf(element,SceneInstanceElement.prototype);
                if(!Number.isInteger(element.color))element.color=-1;
                ensureReloadPlaceholder(element,project);
                migratedRoots.push(element);
            }}
            if(migratedRoots.length)SceneInstanceElement.preview_controller={setup(){},updateAll(){},updateTransform(){},updateVisibility(){},updateSelection(){},updateRenderOrder(){},remove(){}};
            window.LightflowSceneInstanceElement=SceneInstanceElement;

            class ScenePoseElement extends OutlinerElement {
                constructor(data,uuid){super(data,uuid);this.children=[];this.isOpen=false;for(const prop of sceneProperties(ScenePoseElement))prop.reset(this);if(data)this.extend(data);}
                get origin(){return this.position;}
                getWorldCenter(){return this.mesh?.getWorldPosition(new THREE.Vector3())||new THREE.Vector3().fromArray(this.position);}
                extend(data){for(const prop of sceneProperties(ScenePoseElement))prop.merge(this,data);this.sanitizeName();return this;}
                getUndoCopy(){const copy=new ScenePoseElement(this,this.uuid);delete copy.parent;return copy;}
                getSaveCopy(){const copy={type:'lightflow_pose_group',uuid:this.uuid};for(const prop of sceneProperties(ScenePoseElement))prop.copy(this,copy);return copy;}
                forEachChild(callback,type,includeSelf=false){if(includeSelf)callback(this);const visit=child=>{if(!type||(Array.isArray(type)?type.some(nodeType=>child instanceof nodeType):child instanceof type))callback(child);for(const nested of child.children||[])visit(nested);};this.children.forEach(visit);}
                openUp(){this.isOpen=true;this.parent?.openUp?.();return this;}
                select(...args){const changed=Outliner.selected[0]!==this;super.select(...args);arrangeInspector();syncPanel();if(Modes.animate){ensureTimeline();Animation.selected?.getBoneAnimator(this)?.select(true);}else if(changed&&Modes.edit)Panels.transform?.getHostPanel?.()?.selectTab?.(Panels.transform);return this;}
                unselect(...args){super.unselect(...args);syncPanel();}
                static behavior={parent:true,child_types:sceneChildTypes,select_children:'self_first',unique_name:true,movable:true,rotatable:true,scalable:true,use_absolute_position:true,parent_types:['lightflow_scene_instance','lightflow_pose_group']};
            }
            Object.assign(ScenePoseElement.prototype,{type:'lightflow_pose_group',title:'Local pose',icon:'accessibility_new',movable:true,rotatable:true,scalable:true,needsUniqueName:true});
            ScenePoseElement.prototype.buttons=[Outliner.buttons.locked,Outliner.buttons.visibility];
            for(const[key,type,value]of[['name','string','Group'],['source_group_id','string',''],['pose_mode','string','additive'],['position','vector',[0,0,0]],['rotation','vector',[0,0,0]],['scale','vector',[1,1,1]],['visibility','boolean',true],['locked','boolean',false]])owned.push(new Property(ScenePoseElement,type,key,{default:value}));
            const migratedPoses=[];
            for(const project of window.ModelProject?.all||[]){for(const element of project.elements||[]){
                if(element?.type!=='lightflow_pose_group'||element instanceof ScenePoseElement)continue;
                Object.setPrototypeOf(element,ScenePoseElement.prototype);
                ensureReloadPlaceholder(element,project);
                migratedPoses.push(element);
            }}
            if(migratedPoses.length)ScenePoseElement.preview_controller={setup(){},updateAll(){},updateTransform(){},updateVisibility(){},updateSelection(){},updateRenderOrder(){},remove(){}};
            OutlinerElement.registerType(SceneInstanceElement,'lightflow_scene_instance');
            OutlinerElement.registerType(ScenePoseElement,'lightflow_pose_group');
            window.LightflowScenePoseElement=ScenePoseElement;
            const rootOf=element=>{let node=element;while(node&&node!=='root'){if(node.type==='lightflow_scene_instance')return node;node=node.parent;}return null;};
            const isSkinRoot=root=>root?.type==='lightflow_scene_instance'&&(root._lightflowManifest?.format||root.source_model_format)==='skin';
            const recordFor=element=>sourceForPose.get(element)||null;
            const setupNode=(element,controller)=>{
                const node=new THREE.Group();node.name=element.uuid;node.type=element.type;node.isElement=true;
                Project.nodes_3d[element.uuid]=node;
                node.rotation.order=window.Format?.euler_order||'ZYX';
                controller.updateTransform(element);
                controller.dispatchEvent('setup',{element});
            };
            class LinkedNodeAnimator extends BoneAnimator {
                select(...args){const result=super.select(...args);showSourceKeyframes(this.getGroup());return result;}
                createKeyframe(...args){
                    if(this.animation._lightflowSceneLinkClock){
                        delete this.animation._lightflowSceneLinkClock;
                        this.animation.name=t("scene_animation");
                        this.animation.add(false);timelineCarriers.delete(Project);
                    }
                    return super.createKeyframe(...args);
                }
            }
            LinkedNodeAnimator.prototype.type='lightflow_scene_pose_animation';
            const poseChannel='lightflow_pose';
            const skinChannels={...BoneAnimator.prototype.channels,[poseChannel]:{name:t('pose_channel'),mutable:true,transform:true,max_data_points:1}};
            class LinkedInstanceAnimator extends LinkedNodeAnimator {
                constructor(...args){super(...args);this[poseChannel]||=[];this.muted[poseChannel]??=false;}
                get channels(){return isSkinRoot(OutlinerNode.uuids[this.uuid])?skinChannels:BoneAnimator.prototype.channels;}
                displayFrame(multiplier=1){if(disposed)return;this._lightflowPoseWeight=multiplier;return super.displayFrame(multiplier);}
                createKeyframe(value,time,channel,undo,select){
                    if(channel===poseChannel){
                        if(!isSkinRoot(this.getGroup()))return;
                        if(!value?.lightflow_pose_snapshot){
                            if(!activeMounts.has(this.getGroup())){Blockbench.showQuickMessage(t('source_unavailable'));return;}
                            value={lightflow_pose_snapshot:captureLinkedPose(this.getGroup()),lightflow_pose_label:t('pose_current')};
                        }
                    }
                    return super.createKeyframe(value,time,channel,undo,select);
                }
                getUndoCopy(options={}){
                    const copy=super.getUndoCopy(options),keys=this[poseChannel]||[];
                    // Keep authored snapshots serializable even after owned global Property definitions unload.
                    copy.keyframes||=[];
                    for(const key of keys){let saved=copy.keyframes.find(item=>item.uuid===key.uuid);if(!saved){saved=key.getUndoCopy(true);copy.keyframes.push(saved);}
                        for(const field of ['lightflow_pose_snapshot','lightflow_pose_label'])if(key[field]!==undefined)saved[field]=JSON.parse(JSON.stringify(key[field]));}
                    return copy;
                }
            }
            LinkedInstanceAnimator.prototype.type='lightflow_scene_instance_animation';
            for(const [type,key,value]of [['object','lightflow_pose_snapshot',{}],['string','lightflow_pose_label','']])owned.push(new Property(Keyframe,type,key,{default:value,exposed:false,condition:key=>key.channel===poseChannel}));
            SceneInstanceElement.animator=LinkedInstanceAnimator;
            ScenePoseElement.animator=LinkedNodeAnimator;
            const upgradeLinkedAnimators=()=>{
                for(const project of window.ModelProject?.all||[])for(const animation of project.animations||[])for(const[id,animator]of Object.entries(animation.animators||{})){
                    const element=(project.elements||[]).find(node=>node.uuid===id);
                    if(!element||!['lightflow_scene_instance','lightflow_pose_group'].includes(element.type))continue;
                    Object.setPrototypeOf(animator,element.type==='lightflow_scene_instance'?LinkedInstanceAnimator.prototype:LinkedNodeAnimator.prototype);
                    if(element.type==='lightflow_scene_instance'){animator[poseChannel]||=[];animator.muted[poseChannel]??=false;for(const key of animator[poseChannel])key.transform=true;}
                }
            };
            upgradeLinkedAnimators();
            function captureLinkedPose(root){
                const groups={};
                for(const pose of treeFor(root).values())if(pose.mesh)groups[pose.source_group_id]=pose.mesh.userData.lightflowPoseBase||{position:pose.mesh.position.toArray(),rotation:[pose.mesh.rotation.x,pose.mesh.rotation.y,pose.mesh.rotation.z].map(Math.radToDeg),scale:pose.mesh.scale.toArray()};
                return core.normalizePoseSnapshot({version:1,groups});
            }
            for(const Type of [SceneInstanceElement,ScenePoseElement]){
                Type.behavior.has_pivot=true;Type.behavior.resizable=true;
                Type.prototype.size=function(axis){
                    if(!this.mesh)return axis===undefined?[1,1,1]:1;
                    this.mesh.updateWorldMatrix(true,true);const inverse=new THREE.Matrix4().copy(this.mesh.matrixWorld).invert(),box=new THREE.Box3();
                    this.mesh.traverseVisible(mesh=>{if(!mesh.isMesh||!mesh.geometry||mesh.userData.lightflowTerrainBufferOwner)return;if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();box.union(mesh.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().copy(inverse).multiply(mesh.matrixWorld)));});
                    const size=box.isEmpty()?new THREE.Vector3(1,1,1):box.getSize(new THREE.Vector3());const values=size.toArray().map((value,index)=>Math.max(.001,value*Math.abs(this.scale[index])));
                    return axis===undefined?values:values[axis];
                };
                Type.prototype.resize=function(value,axis,negative,_allowNegative,bidirectional){
                    // Native Size sliders read scale[] for scalable elements and
                    // pass a modifier callback. Gizmo handles pass a numeric
                    // geometry delta with a saved old_size. Keep those contracts
                    // separate so typing 2 writes scale 2, not 2 / mesh width.
                    if(typeof value==='function'){
                        const next=Number(value(this.scale[axis]));
                        if(!Number.isFinite(next))return this;
                        this.scale[axis]=next;
                        delete this.temp_data.lightflowResize;
                    }else{
                        const change=Number(value);if(!Number.isFinite(change))return this;
                        const old=this.temp_data.old_size??this.size();
                        if(this.temp_data.lightflowResize?.old!==old)this.temp_data.lightflowResize={old,scale:this.scale.slice()};
                        const baseline=this.temp_data.lightflowResize.scale,before=Array.isArray(old)?old[axis]:old;
                        if(!Number.isFinite(before))return this;
                        const delta=change*(negative?-1:1)*(bidirectional?2:1);
                        this.scale[axis]=baseline[axis]*Math.max(.001,before+delta)/Math.max(.001,before);
                    }
                    this.preview_controller.updateTransform(this);TickUpdates.selection=true;
                    return this;
                };
            }
            instanceController=new NodePreviewController(SceneInstanceElement,{
                setup(element){setupNode(element,this);},
                updateTransform(element){if(!element.mesh)return;NodePreviewController.prototype.updateTransform.call(this,element);element.mesh.scale.fromArray(element.scale);element.mesh.visible=element.visibility!==false;element.mesh.fix_position=element.mesh.position.clone();element.mesh.fix_rotation=element.mesh.rotation.clone();if(!updatingAnimatedTree)window.ShaderEngine?.refreshExternalMeshTransforms?.(element.mesh);updateOutline();},
                remove(element){clearMounted(element);NodePreviewController.prototype.remove.call(this,element);}
            });
            poseController=new NodePreviewController(ScenePoseElement,{
                setup(element){setupNode(element,this);},
                updateTransform(element){if(!element.mesh)return;const source=recordFor(element),parent=element.parent;
                    const owner=rootOf(element);const parentMesh=parent?.mesh||owner?.mesh||Project.model_3d;
                    if(element.mesh.parent!==parentMesh)parentMesh.add(element.mesh);
                    element.mesh.rotation.order=owner?._lightflowEulerOrder||'ZYX';
                    const base=source?core.resolveGroupPose(source,{mode:element.pose_mode,position:element.position,rotation:element.rotation,scale:element.scale},element.mesh.rotation.order):null;
                    const parentSource=parent?.type==='lightflow_pose_group'?recordFor(parent):null;
                    element.mesh.position.fromArray(base?base.position.map((value,i)=>value-(parentSource?.origin?.[i]||0)):element.position);
                    if(base)element.mesh.quaternion.fromArray(base.quaternion);else element.mesh.rotation.fromArray(element.rotation.map(Math.degToRad));
                    element.mesh.scale.fromArray(base?.scale||element.scale);
                    const frames=poseTrackFrames.get(owner)||[];
                    if(frames.length){const position=element.mesh.position.clone(),rotation=element.mesh.quaternion.clone(),scale=element.mesh.scale.clone();
                        for(const frame of frames){const target=frame.groups[element.source_group_id];if(!target)continue;
                            if(frame.override){element.mesh.position.copy(position);element.mesh.quaternion.copy(rotation);element.mesh.scale.copy(scale);}
                            element.mesh.position.lerp(new THREE.Vector3().fromArray(target.position),frame.weight);
                            element.mesh.quaternion.slerp(new THREE.Quaternion().fromArray(target.quaternion),frame.weight);
                            element.mesh.scale.lerp(new THREE.Vector3().fromArray(target.scale),frame.weight);
                        }
                    }
                    element.mesh.userData.lightflowPoseBase={position:element.mesh.position.toArray(),rotation:[element.mesh.rotation.x,element.mesh.rotation.y,element.mesh.rotation.z].map(Math.radToDeg),scale:element.mesh.scale.toArray()};
                    element.mesh.visible=element.visibility!==false&&source?.visible!==false;
                    applyPoseAnimation(element);
                    element.mesh.fix_position=element.mesh.position.clone();element.mesh.fix_rotation=element.mesh.rotation.clone();
                    element.mesh.fix_scale=element.mesh.scale.clone();
                    this.dispatchEvent('update_transform',{element});
                    if(!updatingAnimatedTree)window.ShaderEngine?.refreshExternalMeshTransforms?.(element.mesh);
                    if(!updatingAnimatedTree)updateOutline();
                }
            });
            const nativeEdit=window.TransformerModule?.modules.edit;
            if(nativeEdit){
                const module=new TransformerModule('lightflow_link_rotate',{
                    priority:2,condition:()=>!!(Modes.edit||Modes.render)&&Toolbox.selected.id==='rotate_tool'&&Outliner.selected.length>0&&Outliner.selected.every(node=>['lightflow_scene_instance','lightflow_pose_group'].includes(node.type)),
                    updateGizmo:nativeEdit.updateGizmo,calculateOffset:nativeEdit.calculateOffset,onStart(context){this.lightflowRotationFrame=null;nativeEdit.onStart.call(this,context);},
                    onMove(context){
                        const difference=context.value-(this.initial_value||0),space=getEditTransformSpace();
                        this.lightflowRotationFrame||=new Map();
                        const nodes=Outliner.selected.filter(node=>{for(let parent=node.parent;parent instanceof OutlinerNode;parent=parent.parent)if(Outliner.selected.includes(parent))return false;return true;});
                        for(const node of nodes){
                            node.mesh.updateWorldMatrix(true,false);
                            if(!this.lightflowRotationFrame.has(node))this.lightflowRotationFrame.set(node,{rotation:node.rotation.slice(),quaternion:node.mesh.quaternion.clone(),euler:node.mesh.rotation.clone(),parent:node.mesh.parent.getWorldQuaternion(new THREE.Quaternion())});
                            const frame=this.lightflowRotationFrame.get(node);
                            const axis=context.axis_number===undefined?context.rotate_normal:context.axis_number;
                            const normal=axis instanceof THREE.Vector3?axis.clone():new THREE.Vector3().setComponent(axis,1);
                            let target;
                            if(space>=2)target=frame.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(normal,Math.degToRad(difference)));
                            else{
                                if(space===0)normal.applyQuaternion(frame.parent.clone().invert());
                                else if(space instanceof OutlinerNode)normal.applyQuaternion(space.mesh.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(frame.parent.clone().invert());
                                target=new THREE.Quaternion().setFromAxisAngle(normal,Math.degToRad(difference)).multiply(frame.quaternion);
                            }
                            const source=node.type==='lightflow_pose_group'?recordFor(node):null,order=node.mesh.rotation.order;
                            if(source){
                                const resolved=core.resolveGroupPose(source,{mode:node.pose_mode,position:node.position,rotation:frame.rotation,scale:node.scale},order),baseEuler=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(resolved.quaternion),order),desired=new THREE.Euler().setFromQuaternion(target,order);
                                desired.x-=frame.euler.x-baseEuler.x;desired.y-=frame.euler.y-baseEuler.y;desired.z-=frame.euler.z-baseEuler.z;target.setFromEuler(desired);
                                if(node.pose_mode!=='absolute')target.premultiply(new THREE.Quaternion().fromArray(core.resolveGroupPose(source,{mode:'additive',rotation:[0,0,0],position:[0,0,0],scale:[1,1,1]},order).quaternion).invert());
                            }
                            const euler=new THREE.Euler().setFromQuaternion(target,order);node.rotation=difference===0?frame.rotation.slice():[euler.x,euler.y,euler.z].map(Math.radToDeg);node.preview_controller.updateTransform(node);
                        }
                        window.updateSelection?.();updateOutline();
                    },onEnd(context){nativeEdit.onEnd.call(this,context);this.lightflowRotationFrame=null;updateOutline();}
                });
                owned.push({delete(){if(TransformerModule.modules[module.id]===module)delete TransformerModule.modules[module.id];}});
            }
            for(const element of [...migratedRoots,...migratedPoses].filter(element=>Project?.elements?.includes(element))){
                const oldMesh=element.mesh;
                oldMesh?.parent?.remove(oldMesh);
                if(oldMesh?.userData?.lightflowSceneLinkPlaceholder)oldMesh.geometry?.dispose?.();
                if(Project.nodes_3d?.[element.uuid]===oldMesh)delete Project.nodes_3d[element.uuid];
                element.preview_controller?.setup?.(element);
            }
            const renderResources=new Map();
            const activeMounts=new WeakMap();
            const fallbackMaterials=[0xb8c2cf,0x9eaab9,0xd6dce5,0x818d9e,0xadb9c8,0xa4b0bf]
                .map(color=>new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));
            const hiddenFaceMaterial=new THREE.MeshBasicMaterial({visible:false});
            const getTextureSource=(texture,sourcePath)=>{
                const source=String(texture?.source||'');
                if(source.startsWith('data:')||source.startsWith('blob:'))return source;
                const file=String(texture?.path||texture?.relative_path||source||'');
                if(!file)return '';
                try{
                    const absolute=paths.resolve(paths.dirname(sourcePath),file);
                    const url=absolute.split('/').map((part,i)=>i===0&&/^[a-z]:$/i.test(part)?part:encodeURIComponent(part)).join('/');
                    return new URL((absolute.startsWith('//')?'file:':absolute.startsWith('/')?'file://':'file:///')+url).href;
                }
                catch(_){return '';}
            };
            const decodeTerrainArray=descriptor=>{
                const constructors={Float32Array,Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array};
                const Type=constructors[descriptor.type];
                if(!Type)throw new Error('Unsupported terrain buffer type');
                const binary=atob(descriptor.data),bytes=new Uint8Array(binary.length);
                for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
                if(bytes.byteLength%Type.BYTES_PER_ELEMENT)throw new Error('Misaligned terrain buffer');
                return new Type(bytes.buffer);
            };
            const terrainMaterialPrograms=new WeakMap();
            const installTerrainMaterialSupport=(material,geometry)=>{
                if(!material)return;
                const atlas=!!geometry.getAttribute('bedrockGreedyRepeat'),ao=!!geometry.getAttribute('bedrockBlockAo');
                if(!atlas&&!ao)return;
                const installed=terrainMaterialPrograms.get(material);
                if(installed?.hook===material.onBeforeCompile&&installed.signature===`${atlas}:${ao}`)return;
                // Camera shadows and cloned coverage materials can retain this
                // hook below another decorator. Do not wrap that chain again.
                const seen=new Set();
                for(let hook=material.onBeforeCompile;typeof hook==='function'&&!seen.has(hook);hook=hook.lightflowPreviousOnBeforeCompile){
                    if(hook.lightflowTerrainSignature===`${atlas}:${ao}`)return;
                    seen.add(hook);
                }
                material.userData.lightflowTerrainProgram=true;
                const previous=material.onBeforeCompile,key=material.customProgramCacheKey?.bind(material);
                material.onBeforeCompile=function(shader,renderer){
                    previous?.call(this,shader,renderer);
                    // Defend shader sources as well: inherited hooks from older
                    // material chains must not duplicate declarations or AO.
                    const needsAtlas=atlas&&!shader.vertexShader.includes('varying vec2 vLinkTile;');
                    const needsAo=ao&&!shader.vertexShader.includes('SA_TERRAIN_VERTEX_AO')&&!shader.vertexShader.includes('varying float vLinkAo;');
                    const inject=(source,code)=>source.replace(/^(#version[^\n]*\n)?/,match=>match+code+'\n');
                    let vertex='',fragment='',assign='';
                    if(needsAtlas){
                        vertex+='attribute vec2 bedrockTileUv;\nattribute vec4 bedrockAtlasRect;\nattribute float bedrockGreedyRepeat;\nvarying vec2 vLinkTile;\nvarying vec4 vLinkRect;\nvarying float vLinkRepeat;\n';
                        fragment+='varying vec2 vLinkTile;\nvarying vec4 vLinkRect;\nvarying float vLinkRepeat;\nvec2 lightflowTerrainUv(vec2 uv){return vLinkRepeat<0.5?uv:vLinkRect.xy+(vLinkRect.zw-vLinkRect.xy)*fract(vLinkTile);}\n';
                        assign+='vLinkTile=bedrockTileUv;vLinkRect=bedrockAtlasRect;vLinkRepeat=bedrockGreedyRepeat;';
                    }
                    if(needsAo){vertex+='attribute float bedrockBlockAo;\nvarying float vLinkAo;\n';fragment+='varying float vLinkAo;\n';assign+='vLinkAo=bedrockBlockAo;';}
                    shader.vertexShader=inject(shader.vertexShader,vertex).replace(/void\s+main\s*\(\s*\)\s*\{/,match=>match+assign);
                    shader.fragmentShader=inject(shader.fragmentShader,fragment);
                    // Shader Architect resolves material UVs and neighbor offsets
                    // itself. Replacing those samples with the interpolated tile
                    // coordinate discards relief/alpha-bevel neighbor lookups.
                    if(atlas&&!shader.fragmentShader.includes('lfResolveMaterialUvWithJacobian')){
                        if(shader.fragmentShader.includes('#include <map_fragment>'))shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment);
                        shader.fragmentShader=core.patchTerrainMapSamples(shader.fragmentShader);
                    }
                    if(ao&&!shader.fragmentShader.includes('diffuseColor.rgb *= vLinkAo;')&&shader.fragmentShader.includes('#include <color_fragment>'))shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb *= vLinkAo;');
                };
                material.onBeforeCompile.lightflowPreviousOnBeforeCompile=previous;
                material.onBeforeCompile.lightflowTerrainSignature=`${atlas}:${ao}`;
                material.customProgramCacheKey=()=>`${key?.()||''}|lightflow-terrain-${atlas}-${ao}`;
                terrainMaterialPrograms.set(material,{hook:material.onBeforeCompile,signature:`${atlas}:${ao}`});
                material.needsUpdate=true;
            };

            const createRenderResources=result=>{
                const existing=renderResources.get(result.cacheKey);
                if(existing?.revision===result.revision){result.model=existing.result.model;result.manifest=existing.result.manifest;return existing;}
                const resources={result,revision:result.revision,textures:new Map(),materials:new Map(),cubes:new Map(),owned:new Set(),users:new Set(),retired:false,batchVersion:0,batchCache:null,textureMeshes:[]};
                const terrain=core.terrainSections(result.model);
                const format=window.Formats?.[result.manifest.format];
                const usesDefaultTexture=face=>face&&face.texture!==null&&
                    (format?.single_texture||format?.single_texture_default&&!format.per_group_texture&&!face.texture&&face.texture!==0);
                resources.hasDefaultTextureFaces=(result.model.elements||[]).some(element=>
                    ['cube','mesh'].includes(element.type||'cube')&&Object.values(element.faces||{}).some(usesDefaultTexture));
                const defaultRecord=resources.hasDefaultTextureFaces?core.textureMeshTexture(result.model,null):null;
                const defaultTextureKey=defaultRecord?String(result.model.textures.indexOf(defaultRecord)):undefined;
                const referencedTextures=core.linkedTextureReferences(result.model,defaultTextureKey);
                const sourceTextures=[...(result.model.textures||[]),...(result.model.lightflow_terrain?.textures||[])];
                const loadTexture=(record,index,usedByTemplate)=>{
                    if(resources.textures.has(String(index)))return;
                    const url=getTextureSource(record,result.path);
                    if(!url)return;
                    const texture=new THREE.TextureLoader().load(url,()=>{
                        if(disposed||resources.retired)return;
                        texture.userData||={};
                        try{
                            const image=texture.image,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
                            const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
                            const imageData=context.getImageData(0,0,canvas.width,canvas.height),pixels=imageData.data;
                            for(const entry of resources.textureMeshes)if(entry.textureRecord===record)
                                core.updateTextureMeshGeometry(entry.geometry,entry.record,result.model,record,imageData,THREE);
                            let opaque=true,cutout=true;for(let i=3;i<pixels.length;i+=4){if(pixels[i]!==255)opaque=false;if(pixels[i]>1&&pixels[i]<254)cutout=false;}
                            texture.userData.lightflowOpaque=opaque;texture.userData.lightflowCutout=cutout;
                        }catch(_){texture.userData.lightflowOpaque=false;}
                        if(usedByTemplate){
                            resources.batchVersion++;
                            for(const owner of [...resources.users])if(owner._lightflowProject===Project)mountResult(owner,result);
                        }else{
                            // Shader Architect chooses its alpha mode when the
                            // mesh is integrated. Rebind only current users of
                            // this lazy texture or its linked PBR group.
                            for(const owner of [...resources.users]){
                                if(owner._lightflowProject!==Project||activeMounts.get(owner)!==resources||
                                    !owner.texture_override?.startsWith('source:'))continue;
                                const choice=instanceTexture(owner,resources);
                                if(choice&&(choice===record||record.group&&record.group===choice.group))syncInstanceTexture(owner,true);
                            }
                        }
                        for(const owner of resources.users)window.ShaderEngine?.requestPreviewRender?.({cause:'scene_link_texture'});
                    });
                    texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;
                    texture.generateMipmaps=false;
                    texture.wrapS=record.wrapS??(record.terrain_atlas?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping);
                    texture.wrapT=record.wrapT??(record.terrain_atlas?THREE.ClampToEdgeWrapping:THREE.RepeatWrapping);
                    if(typeof record.flipY==='boolean')texture.flipY=record.flipY;
                    if(Array.isArray(record.repeat))texture.repeat.fromArray(record.repeat);
                    if(Array.isArray(record.offset))texture.offset.fromArray(record.offset);
                    if(Array.isArray(record.center))texture.center.fromArray(record.center);
                    if(Number.isFinite(record.rotation))texture.rotation=record.rotation;
                    if(record.encoding!==undefined)texture.encoding=record.encoding;
                    texture.userData||={};texture.userData.bedrockAtlas=record.terrain_atlas===true;
                    const colorChannel=['color','emissive','emission','emit'].includes(String(record.pbr_channel||'color').toLowerCase());
                    if('colorSpace'in texture&&THREE.SRGBColorSpace)texture.colorSpace=colorChannel?THREE.SRGBColorSpace:(THREE.NoColorSpace||'');
                    const info={record,texture};
                    resources.textures.set(String(record.uuid||record.id||''),info);
                    resources.textures.set(String(index),info);
                    resources.owned.add(texture);
                };
                for(const [index,record] of sourceTextures.entries()){
                    if(referencedTextures.has(String(index))||referencedTextures.has(String(record.uuid||record.id)))loadTexture(record,index,true);
                }
                resources.loadTextureChoice=index=>{
                    const references=core.linkedTextureReferences(result.model,String(index));
                    sourceTextures.forEach((record,i)=>{if(references.has(String(i)))loadTexture(record,i,false);});
                    return core.linkedTextureBindings(result.model,resources.textures).get(String(index));
                };
                const textureBindings=core.linkedTextureBindings(result.model,resources.textures);
                const definitions=core.sourceMaterialDefinitions(result.model);
                const materialFor=(face,index=0,element=null,faceName=null,implicit=false)=>{
                    if(!face||face.texture===null)return hiddenFaceMaterial;
                    const definition=core.linkedMaterialDefinition(element,faceName,definitions);
                    const textureKey=implicit?defaultTextureKey:String(face.texture??'');
                    const info=resources.textures.get(textureKey);
                    const prefix=implicit?'source-default|':'';
                    if(!info){
                        if(!definition&&!implicit)return fallbackMaterials[index%fallbackMaterials.length];
                        const key=prefix+'fallback-'+index+'|'+(definition?.id||'');
                        if(!resources.materials.has(key)){
                            const material=fallbackMaterials[index%fallbackMaterials.length].clone();
                            material.sa_linked_material_definition=definition;
                            material.sa_linked_default_texture=implicit;
                            resources.materials.set(key,material);resources.owned.add(material);
                        }
                        return resources.materials.get(key);
                    }
                    const key=prefix+info.texture.uuid+'|'+(definition?.id||'');
                    if(!resources.materials.has(key)){
                        const material=new THREE.MeshBasicMaterial({map:info.texture,transparent:true,alphaTest:.05,side:THREE.DoubleSide});
                        material.sa_source_render_mode=info.record.render_mode||'default';
                        material.sa_source_blockbench_texture=textureBindings.get(textureKey);
                        material.sa_linked_material_definition=definition;
                        material.sa_linked_default_texture=implicit;
                        resources.materials.set(key,material);resources.owned.add(material);
                    }
                    return resources.materials.get(key);
                };
                const sides=['east','west','up','down','south','north'];
                for(const cube of result.model.elements||[]){
                    if((cube?.type||'cube')!=='cube'||!Array.isArray(cube.from)||!Array.isArray(cube.to))continue;
                    const inflated=Number(cube.inflate)||0;
                    const signedSizes=cube.to.map((value,index)=>Number(value)-Number(cube.from[index])+2*inflated);
                    const sizes=signedSizes.map(value=>Math.max(.001,Math.abs(value)));
                    const geometry=new THREE.BoxGeometry(...sizes);resources.owned.add(geometry);
                    // Native cubes retain from/to orientation, including the
                    // inverted shells used by authored translucent effects.
                    const positions=geometry.getAttribute('position');
                    for(let vertex=0;vertex<positions.count;vertex++)positions.setXYZ(vertex,
                        positions.getX(vertex)*(signedSizes[0]<0?-1:1),
                        positions.getY(vertex)*(signedSizes[1]<0?-1:1),
                        positions.getZ(vertex)*(signedSizes[2]<0?-1:1));
                    positions.needsUpdate=true;
                    const uv=geometry.getAttribute('uv');
                    const materials=sides.map((side,index)=>{
                        const face=cube.faces?.[side];
                        if(!face)return hiddenFaceMaterial;
                        const implicit=usesDefaultTexture(face);
                        const textureInfo=resources.textures.get(implicit?defaultTextureKey:String(face.texture??''));
                        if(Array.isArray(face.uv)&&face.uv.length===4){
                            const w=Number(textureInfo?.record.uv_width||result.model.resolution?.width||16)||16;
                            const h=Number(textureInfo?.record.uv_height||result.model.resolution?.height||16)||16;
                            const [u1,v1,u2,v2]=face.uv;
                            const coords=[[u1/w,1-v1/h],[u2/w,1-v1/h],[u1/w,1-v2/h],[u2/w,1-v2/h]];
                            // Match the native cube UV permutation, including
                            // quarter-turns and intentionally mirrored ranges.
                            let rotation=((Number(face.rotation)||0)%360+360)%360;
                            while(rotation>=90){const first=coords[0];coords[0]=coords[2];coords[2]=coords[3];coords[3]=coords[1];coords[1]=first;rotation-=90;}
                            coords.forEach(([u,v],corner)=>uv.setXY(index*4+corner,u,v));
                        }
                        return materialFor(face,index,cube,sides[index],implicit);
                    });
                    uv.needsUpdate=true;
                    // Preserve the triangle order for picking, but collapse identical
                    // face materials into one draw and remove invisible faces.
                    const visibleGroups=geometry.groups.filter(group=>materials[group.materialIndex]?.visible!==false);
                    // Shader effects need the owning face's UV domain and source
                    // texture resolution even after native draw groups collapse.
                    const faceRanges=visibleGroups.map(group=>{
                        const face=cube.faces?.[sides[group.materialIndex]];
                        const info=resources.textures.get(usesDefaultTexture(face)?defaultTextureKey:String(face?.texture??''));
                        return {start:group.start,count:group.count,faceKey:sides[group.materialIndex],materialIndex:group.materialIndex,textureSize:[
                            Number(info?.record.uv_width||result.model.resolution?.width||16)||16,
                            Number(info?.record.uv_height||result.model.resolution?.height||16)||16
                        ]};
                    });
                    const uniqueMaterials=[...new Set(visibleGroups.map(group=>materials[group.materialIndex]))];
                    let drawMaterial=materials;
                    if(uniqueMaterials.length===1){
                        const indices=[];for(const group of visibleGroups)for(let i=group.start;i<group.start+group.count;i++)indices.push(geometry.index.getX(i));
                        geometry.setIndex(indices);geometry.clearGroups();drawMaterial=uniqueMaterials[0];
                        let faceStart=0;for(const range of faceRanges){range.start=faceStart;faceStart+=range.count;}
                    }
                    geometry.userData.saLogicalFaceRanges=faceRanges;
                    const holder=new THREE.Group();holder.rotation.order=window.Formats?.[result.manifest.format]?.euler_order||'ZYX';
                    const mesh=new THREE.Mesh(geometry,drawMaterial);
                    mesh.userData.lightflowSourcePrimitive='cube';
                    mesh.userData.lightflowSourceElement={sa_auto_tile:cube.sa_auto_tile,sa_face_auto_tile:cube.sa_face_auto_tile,sa_lighting_normal:cube.sa_lighting_normal,sa_cast_shadow:cube.sa_cast_shadow};
                    mesh.userData.lightflowSourceMaterialDefinitions=(Array.isArray(drawMaterial)?drawMaterial:[drawMaterial]).map(material=>material.sa_linked_material_definition||null);
                    mesh.castShadow=cube.sa_cast_shadow!==false;mesh.receiveShadow=true;holder.add(mesh);
                    const origin=Array.isArray(cube.origin)?cube.origin:[0,0,0];
                    mesh.position.fromArray(cube.from.map((value,index)=>(Number(value)+Number(cube.to[index]))/2-(Number(origin[index])||0)));
                    holder.position.fromArray(origin);
                    holder.rotation.fromArray((cube.rotation||[0,0,0]).map(value=>Number(value)*Math.PI/180));
                    holder.visible=cube.visibility!==false;holder.userData.lightflowKind='geometry';
                    if(result.manifest.format==='skin'&&cube.layer===true){
                        holder.userData.lightflowSkinLayer=true;
                        resources.hasSecondarySkinLayer=true;
                    }
                    resources.cubes.set(cube.uuid,holder);
                }
                for(const record of result.model.elements||[]){
                    if(!['mesh','billboard','texture_mesh'].includes(record.type))continue;
                    const holder=new THREE.Group();holder.rotation.order=window.Formats?.[result.manifest.format]?.euler_order||'ZYX';
                    holder.position.fromArray(record.type==='billboard'?record.position||record.origin||[0,0,0]:record.origin||[0,0,0]);
                    holder.rotation.fromArray((record.rotation||[0,0,0]).map(value=>Number(value)*Math.PI/180));
                    holder.visible=record.visibility!==false;holder.userData.lightflowKind=record.type==='billboard'?'billboards':'geometry';
                    if(record.type==='texture_mesh'){
                        const textureRecord=core.textureMeshTexture(result.model,record);
                        const textureKey=String((result.model.textures||[]).indexOf(textureRecord));
                        const geometry=core.updateTextureMeshGeometry(new THREE.BufferGeometry(),record,result.model,textureRecord,null,THREE);
                        resources.owned.add(geometry);resources.textureMeshes.push({geometry,record,textureRecord});
                        holder.add(new THREE.Mesh(geometry,materialFor({texture:textureKey},0,record)));
                    }else if(record.type==='billboard'){
                        const face=record.faces?.front,info=resources.textures.get(String(face?.texture??''));
                        const geometry=new THREE.PlaneGeometry(Number(record.size?.[0])||1,Number(record.size?.[1])||1);resources.owned.add(geometry);
                        const uv=face?.uv||[0,0,16,16],w=Number(info?.record.uv_width||result.model.resolution?.width)||16,h=Number(info?.record.uv_height||result.model.resolution?.height)||16;
                        let coords=[[uv[0]/w,1-uv[1]/h],[uv[2]/w,1-uv[1]/h],[uv[0]/w,1-uv[3]/h],[uv[2]/w,1-uv[3]/h]];
                        for(let turn=0;turn<(Number(face?.rotation)||0);turn+=90)coords=[coords[2],coords[0],coords[3],coords[1]];
                        coords.forEach((point,index)=>geometry.attributes.uv.setXY(index,...point));
                        const mesh=new THREE.Mesh(geometry,materialFor(face,0,record));mesh.position.set(Number(record.offset?.[0])||0,Number(record.offset?.[1])||0,0);
                        mesh.userData.lightflowBillboard=record.facing_mode||'lookat';holder.add(mesh);
                    }else{
                        for(const [faceIndex,face] of Object.values(record.faces||{}).entries()){
                            const ids=face.vertices||[];if(ids.length<3||ids.some(id=>!Array.isArray(record.vertices?.[id])))continue;
                            const implicit=usesDefaultTexture(face);
                            const positions=[],uvs=[],info=resources.textures.get(implicit?defaultTextureKey:String(face.texture??''));
                            const w=Number(info?.record.uv_width||result.model.resolution?.width)||16,h=Number(info?.record.uv_height||result.model.resolution?.height)||16;
                            const vertices=ids.map(id=>new THREE.Vector3().fromArray(record.vertices[id]));
                            const normal=new THREE.Vector3().crossVectors(vertices[1].clone().sub(vertices[0]),vertices[2].clone().sub(vertices[0]));
                            const axis=Math.abs(normal.x)>Math.abs(normal.y)?(Math.abs(normal.x)>Math.abs(normal.z)?0:2):(Math.abs(normal.y)>Math.abs(normal.z)?1:2);
                            const projected=vertices.map(v=>axis===0?new THREE.Vector2(v.y,v.z):axis===1?new THREE.Vector2(v.x,v.z):new THREE.Vector2(v.x,v.y));
                            const triangles=THREE.ShapeUtils.triangulateShape(projected,[]);
                            for(const triangle of triangles)for(const vertexIndex of triangle){const id=ids[vertexIndex];
                                positions.push(...record.vertices[id]);const uv=face.uv?.[id]||[0,0];uvs.push(uv[0]/w,1-uv[1]/h);
                            }
                            const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();resources.owned.add(geometry);
                            geometry.userData.saLogicalFaceRanges=[{start:0,count:positions.length/3,faceKey:Object.keys(record.faces||{})[faceIndex],materialIndex:0,textureSize:[w,h]}];
                            holder.add(new THREE.Mesh(geometry,materialFor(face,faceIndex,record,Object.keys(record.faces||{})[faceIndex],implicit)));
                        }
                    }
                    holder.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=record.sa_cast_shadow!==false;mesh.receiveShadow=true;mesh.userData.lightflowSourceElement={sa_auto_tile:record.sa_auto_tile,sa_mesh_face_auto_tile:record.sa_mesh_face_auto_tile,faces:record.faces,sa_lighting_normal:record.sa_lighting_normal,sa_cast_shadow:record.sa_cast_shadow};mesh.userData.lightflowSourceMaterialDefinitions=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(material=>material.sa_linked_material_definition||null);}});
                    resources.cubes.set(record.uuid,holder);
                }
                for(const section of terrain){
                    const holder=new THREE.Group(),geometry=new THREE.BufferGeometry(),data=section.terrain_geometry;
                    for(const [name,attribute] of Object.entries(data.attributes))geometry.setAttribute(name,new THREE.BufferAttribute(decodeTerrainArray(attribute),attribute.itemSize,attribute.normalized===true));
                    if(data.index)geometry.setIndex(new THREE.BufferAttribute(decodeTerrainArray(data.index),1));
                    for(const group of data.groups||[])geometry.addGroup(group.start,group.count,group.materialIndex);
                    // Preserve compact UV domains until a Lightflow material is
                    // actually requested. Native atlas draws need no face objects.
                    geometry.userData.lightflowLinkedTerrain=true;
                    geometry.userData.lightflowTerrainFaceData={groups:data.groups,face_runs:data.face_runs};
                    if(data.connected_clip){
                        const clip=data.connected_clip,raw=atob(clip.data);
                        geometry.userData.lightflowTerrainConnectedClip={...clip,data:Uint8Array.from(raw,char=>char.charCodeAt(0))};
                    }
                    geometry.computeBoundingBox();geometry.computeBoundingSphere();resources.owned.add(geometry);
                    const materials=section.terrain_materials.map(record=>{
                        const texture=resources.textures.get(record.map)?.texture;
                        const key=`terrain:${!!geometry.getAttribute('bedrockGreedyRepeat')}:${!!geometry.getAttribute('bedrockBlockAo')}:${JSON.stringify(record)}`;
                        if(resources.materials.has(key))return resources.materials.get(key);
                        const material=new THREE.MeshBasicMaterial({map:texture||null,color:record.color??0xffffff,alphaTest:record.alphaTest||0,transparent:!!record.transparent,opacity:record.opacity??1,side:record.side??THREE.FrontSide,depthWrite:record.depthWrite!==false,vertexColors:!!record.vertexColors});
                        material.sa_source_blockbench_texture=textureBindings.get(String(record.map));
                        material.sa_source_render_mode=material.sa_source_blockbench_texture?.render_mode||'default';
                        material.toneMapped=false;material.userData.bedrockAtlas=record.atlas===true;
                        installTerrainMaterialSupport(material,geometry);
                        resources.materials.set(key,material);resources.owned.add(material);return material;
                    });
                    const mesh=new THREE.Mesh(geometry,materials.length===1?materials[0]:materials);
                    mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=true;mesh.matrixAutoUpdate=false;
                    mesh.userData.lightflowTerrainSection=true;mesh.userData.bedrockStructurePrebatched=true;
                    mesh.userData.bedrockChunkLayer=Number(section.terrain_layer||0);
                    mesh.userData.bedrockRenderLayer=section.terrain_render_layer||'opaque';
                    holder.matrix.fromArray(section.matrix);holder.matrix.decompose(holder.position,holder.quaternion,holder.scale);
                    holder.userData.lightflowTerrainCoordinates=true;
                    holder.visible=section.visibility!==false;holder.userData.lightflowKind='geometry';holder.add(mesh);
                    resources.cubes.set(section.uuid,holder);
                }
                if(terrain.length){
                    resources.terrainNativeBytes=0;resources.terrainVertexCount=0;
                    const geometries=[];
                    for(const section of terrain){
                        const mesh=resources.cubes.get(section.uuid).children[0],geometry=mesh.geometry;
                        geometries.push(geometry);
                        for(const attribute of Object.values(geometry.attributes))resources.terrainNativeBytes+=attribute.array.byteLength;
                        resources.terrainNativeBytes+=geometry.index?.array.byteLength||0;
                        resources.terrainVertexCount+=geometry.getAttribute('position').count;
                    }
                    const limit=Number(result.model.lightflow_terrain?.performance?.maxGeometryBytes);
                    resources.terrainGeometryLimit=Number.isFinite(limit)&&limit>0?limit:384*1048576;
                    resources.terrainBufferOwner=core.createTerrainBufferOwnerGeometry(geometries,THREE);
                    resources.owned.add(resources.terrainBufferOwner);
                }
                if(existing){existing.retired=true;if(!existing.users.size)existing.owned.forEach(resource=>resource.dispose?.());}
                renderResources.set(result.cacheKey,resources);
                return resources;
            };
            const terrainInstanceStates=new WeakMap();
            const mountedTextureMaterials=new WeakMap();
            const updateSecondarySkinLayer=element=>{
                const visible=element.secondary_skin_layer===true;
                let changed=false;
                for(const holder of mountedCubes.get(element)||[]){
                    if(holder.userData.lightflowSkinLayer&&holder.visible!==visible){
                        holder.visible=visible;changed=true;
                    }
                }
                return changed;
            };
            const clearMounted=(element,preserveResources=false)=>{
                let released=false;
                for(const holder of mountedCubes.get(element)||[]){
                    const meshes=[];
                    holder.traverse(object=>{
                        if(object.isMesh&&!object.userData.lightflowTerrainBufferOwner&&
                            !object.userData.saOpaqueCoveragePass&&!object.userData.saToonOutlinePass)meshes.push(object);
                    });
                    // Releasing an integration can remove its child passes.
                    for(const object of meshes){
                        const terrain=terrainInstanceStates.has(object);
                        if(terrain&&object.userData.lightflowOwnedGeometry)object.geometry?.dispose();
                        window.ShaderEngine?.releaseMeshIntegration?.({mesh:object},object,{deferCacheInvalidation:true});released=true;
                        if(object.userData.lightflowOwnedGeometry){if(!terrain)object.geometry?.dispose();delete object.userData.lightflowOwnedGeometry;}
                        terrainInstanceStates.delete(object);
                    }
                    holder.parent?.remove(holder);
                }
                mountedCubes.delete(element);
                mountedTextureMaterials.get(element)?.forEach(material=>material.dispose());
                mountedTextureMaterials.delete(element);
                const old=activeMounts.get(element);
                if(old){
                    old.users.delete(element);
                    if(!old.users.size&&(old.retired||old.terrainVertexCount&&!preserveResources)){
                        old.retired=true;
                        old.owned.forEach(resource=>resource.dispose?.());
                        const key=old.result.cacheKey;
                        if(renderResources.get(key)===old)renderResources.delete(key);
                        if(assetCache.get(key)?.revision===old.revision)assetCache.delete(key);
                    }
                }
                activeMounts.delete(element);
                if(released)window.ShaderEngine?.invalidateExternalMeshIntegrationCaches?.();
            };
            // Resolve receiver overrides without changing shared source materials or textures.
            const linkedMaterialId=node=>{
                for(let current=node;current&&current!=='root';current=current.parent){
                    if(current.lightflow_material_override)return current.lightflow_material_override;
                }
                return '';
            };
            const linkedSourceResources=new WeakMap();
            const linkedSourceSlotCache=new WeakMap();
            const resolveSourceMaterialSlots=mesh=>{
                const manager=window.MaterialManager,resources=linkedSourceResources.get(mesh);
                if(!manager||!resources||mesh.userData.lightflowReceiverMaterialOverride)return null;
                if(resources.sourceMaterialManager!==manager){resources.sourceMaterialManager=manager;resources.sourceMaterialInstances=new Map();}
                const slots=(mesh.userData.lightflowSourceMaterialDefinitions||[]).map(definition=>{
                    if(!definition)return null;
                    let instance=resources.sourceMaterialInstances.get(definition.id);
                    if(!instance){
                        const uniforms=manager.deserializeUniformMap(definition.uniforms||definition.uniformOverrides||{});
                        const bindings=core.linkedTextureBindings(resources.result.model,resources.textures);
                        for(const def of Object.values(uniforms)){
                            const id=def.texture_uuid||def.textureUuid,info=resources.textures.get(String(id));
                            if(def.type==='sampler2D'&&info)def.saLinkedTexture={map:info.texture,blockbenchTexture:bindings.get(String(id))||null};
                        }
                        instance={...definition,id:resources.result.cacheKey+':'+definition.id,isMaterialInstance:true,baseMaterialId:definition.baseMaterialId||definition.materialId||'classic',uniforms};
                        resources.sourceMaterialInstances.set(definition.id,instance);
                    }
                    return manager.getRenderMaterial(instance);
                });
                const cached=linkedSourceSlotCache.get(mesh);
                if(cached&&cached.length===slots.length&&cached.every((material,index)=>material===slots[index]))return cached;
                linkedSourceSlotCache.set(mesh,slots);
                return slots;
            };
            const terrainBudget=()=>{
                const sources=new Set();let nativeBytes=0,vertices=0,limit=Infinity;
                for(const element of SceneInstanceElement.all){
                    const resources=activeMounts.get(element);
                    if(!resources)continue;
                    if(element._lightflowProject!==Project||!resources.terrainVertexCount||element.include_geometry===false)continue;
                    if(!sources.has(resources)){sources.add(resources);nativeBytes+=resources.terrainNativeBytes;}
                    vertices+=resources.terrainVertexCount;limit=Math.min(limit,resources.terrainGeometryLimit);
                }
                return {nativeGeometryBytes:nativeBytes,estimatedDecoratedBytes:nativeBytes+vertices*256,maxGeometryBytes:limit};
            };
            const restoreTerrainInstance=(mesh,engine)=>{
                const state=terrainInstanceStates.get(mesh);
                if(!state)return;
                if(state.integrated){
                    mesh.geometry.dispose();engine?.releaseMeshIntegration?.({mesh},mesh,{deferCacheInvalidation:true});
                    mesh.geometry=core.createTerrainInstanceGeometry(state.source,THREE);
                    state.integrated=false;
                    mesh.material=state.nativeMaterial;
                    return true;
                }
                mesh.material=state.nativeMaterial;
                return false;
            };
            const applyLinkedMaterials=root=>{
                const engine=window.ShaderEngine,manager=window.MaterialManager;
                const budget=terrainBudget(),lightflow=!!(engine&&manager&&Project?.view_mode==='lightflow');
                let restored=false;
                for(const holder of mountedCubes.get(root)||[])holder.traverse(mesh=>{
                    if(!mesh.isMesh||mesh.userData.saOpaqueCoveragePass||mesh.userData.saToonOutlinePass||mesh.userData.lightflowTerrainBufferOwner)return;
                    if(mesh.userData.lightflowTerrainSection){
                        const state=terrainInstanceStates.get(mesh);
                        const allowed=budget.estimatedDecoratedBytes<=budget.maxGeometryBytes;
                        root._lightflowTerrainStats={...budget,bridgeState:!lightflow?'native':!allowed?'native_geometry_budget':'lightflow'};
                        if(!lightflow||!allowed){restored=restoreTerrainInstance(mesh,engine)||restored;return;}
                        if(!state.source.userData.saLogicalFaceRanges){
                            state.source.userData.saLogicalFaceRanges=core.terrainFaceRanges(state.source.userData.lightflowTerrainFaceData,state.source.index?.count||state.source.getAttribute('position').count);
                        }
                        mesh.geometry.userData.saLogicalFaceRanges=state.source.userData.saLogicalFaceRanges;
                    }
                    if(!engine||!manager)return;
                    const node=OutlinerNode.uuids[mesh.userData.lightflowPose]||root;
                    const id=linkedMaterialId(node);
                    mesh.userData.lightflowReceiverMaterialOverride=id;
                    const shader=manager.getRenderMaterial(id||engine.globalRenderMode||'classic');
                    const applied=engine.applyToMesh({mesh,uuid:mesh.uuid,sa_lighting_normal:mesh.userData.bedrockRenderLayer==='vegetation'?'up':'physical'},shader,{reuseUnchangedMaterial:true});
                    if(mesh.userData.lightflowTerrainSection&&applied)terrainInstanceStates.get(mesh).integrated=true;
                    if(mesh.userData.lightflowTerrainSection)for(const material of [...(Array.isArray(mesh.material)?mesh.material:[mesh.material]),mesh.customDepthMaterial,mesh.customDistanceMaterial])installTerrainMaterialSupport(material,mesh.geometry);
                });
                if(restored)engine?.invalidateExternalMeshIntegrationCaches?.();
            };
            for(const Type of [SceneInstanceElement,ScenePoseElement])owned.push(new Property(Type,'string','lightflow_material_override',{default:''}));
            let linkedMaterialSignature='';
            const refreshLinkedMaterials=()=>{
                if(disposed)return;
                for(const root of SceneInstanceElement.all)applyLinkedMaterials(root);
                window.ShaderEngine?.requestPreviewRender?.({cause:'scene_link_material'});
            };
            const materialWatch=setInterval(()=>{
                if(disposed||!Project)return;
                const signature=[Project.uuid,Project.view_mode,window.ShaderEngine?.globalRenderMode,window.ShaderEngine?.materialRecipeRevision,...(Project.elements||[]).filter(node=>rootOf(node)).map(node=>node.uuid+':'+(node.lightflow_material_override||''))].join('|');
                if(signature!==linkedMaterialSignature){linkedMaterialSignature=signature;refreshLinkedMaterials();}
            },250);
            owned.push({delete(){clearInterval(materialWatch);}},Blockbench.on('shader_architect_material_instances_changed',refreshLinkedMaterials),Blockbench.on('change_view_mode',refreshLinkedMaterials));
            const treeFor=element=>{
                const map=new Map();
                const visit=parent=>{
                    for(const child of parent.children){
                        if(child.type!=='lightflow_pose_group')continue;
                        map.set(child.source_group_id,child);
                        visit(child);
                    }
                };
                visit(element);
                return map;
            };
            const synchronizeTree=(element,result)=>{
                const map=treeFor(element);
                for(const group of result.manifest.groups){
                    let pose=map.get(group.id);
                    const parent=group.parentId?map.get(group.parentId):element;
                    if(!pose){
                        pose=new ScenePoseElement({name:group.name,source_group_id:group.id}).init();
                        pose.addTo(parent);
                        map.set(group.id,pose);
                    }
                    if(pose.parent!==parent)pose.addTo(parent);
                    if(pose.name==='Group')pose.name=group.name;
                    sourceForPose.set(pose,group);
                    pose.preview_controller?.updateTransform?.(pose);
                }
                return map;
            };
            let rigidBatchingEnabled=true;
            const mountedInstanceStates=new WeakMap();
            const sourceTextureId=(record,index)=>'source:'+(record.uuid||record.id||index);
            const instanceTexture=(element,resources)=>{
                if(!resources?.hasDefaultTextureFaces||element.include_geometry===false||!element.texture_override)return;
                const id=element.texture_override;
                if(id.startsWith('source:'))return resources.result.model.textures?.find((record,index)=>sourceTextureId(record,index)===id);
                return Project.textures?.find(texture=>'project:'+texture.uuid===id);
            };
            const instanceTextureMap=(element,resources,texture)=>{
                if(element.texture_override?.startsWith('source:')){
                    const index=resources?.result.model.textures?.indexOf(texture);
                    const map=resources?.textures.get(String(index))?.texture;
                    return map?.image?map:undefined;
                }
                return texture?.getOwnMaterial()?.map;
            };
            const hasSameMountedTexture=(element,resources,state)=>{
                const texture=instanceTexture(element,resources);
                return state?.texture===texture&&state?.map===instanceTextureMap(element,resources,texture)&&state?.renderMode===texture?.render_mode;
            };
            const mountOptionsKey=element=>[element.include_geometry!==false,element.include_billboards!==false,!!Format.centered_grid,rigidBatchingEnabled].join('|');
            const rememberMountedInstance=(element,texture,map)=>mountedInstanceStates.set(element,{
                mesh:element.mesh,options:mountOptionsKey(element),texture,map,renderMode:texture?.render_mode
            });
            const canReuseMountedInstance=(element,result)=>{
                const resources=activeMounts.get(element),state=mountedInstanceStates.get(element),mounted=mountedCubes.get(element);
                if(!resources||resources.retired||resources.revision!==result.revision||resources.result.cacheKey!==result.cacheKey
                    ||!state||state.mesh!==element.mesh||state.options!==mountOptionsKey(element)||!mounted||!hasSameMountedTexture(element,resources,state))return false;
                const poses=treeFor(element);
                if(result.manifest.groups.some(group=>!poses.has(group.id)))return false;
                return mounted.every(mesh=>{
                    for(let current=mesh;current;current=current.parent)if(current===element.mesh)return true;
                    return false;
                });
            };
            const generatedSurfaceAttributes=new Set([
                'saSurfaceFlags','saFaceMetrics',
                'normalizedFaceUv','uv_shadow_map','saLightingNormal','sa_bevel_join_face',
                'sa_bevel_ramp_center','sa_bevel_ramp_half_size','autoTileBasis','affected_by_shadow',
                'uvAspectRatio','faceSize','globalFaceSize','uvSize','smooth_normal','autoTile'
            ]);
            const rigidTemplates=(resources,manifest)=>{
                if(!rigidBatchingEnabled)return resources.cubes;
                if(resources.batchCache?.version===resources.batchVersion)return resources.batchCache.templates;
                const templates=new Map(resources.cubes),parentIds=new Map(),buckets=new Map();
                for(const group of manifest.groups)for(const id of group.elementIds)parentIds.set(id,group.id);
                for(const [id,holder] of resources.cubes){
                    if(!holder.visible||holder.userData.lightflowKind!=='geometry'||holder.userData.lightflowSkinLayer)continue;
                    holder.updateMatrixWorld(true);
                    const meshes=[];holder.traverseVisible(object=>{if(object.isMesh)meshes.push(object);});
                    if(meshes.length!==1)continue;
                    const mesh=meshes[0],material=mesh.material;
                    if(mesh.userData.bedrockStructurePrebatched)continue;
                    const alpha=material?.map?.userData;
                    if(Array.isArray(material)||!material?.visible||material.opacity!==1||material.transparent&&!(alpha?.lightflowOpaque||alpha?.lightflowCutout&&material.alphaTest>=.05))continue;
                    const key=[parentIds.get(id)||'',material.uuid,mesh.castShadow,mesh.receiveShadow,mesh.renderOrder,JSON.stringify(mesh.userData.lightflowSourceElement||{})].join('|');
                    if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push({id,holder,mesh});
                }
                for(const members of buckets.values()){
                    if(members.length<2)continue;
                    const positions=[],normals=[],uvs=[],ranges=[],faceRanges=[];
                    let compatible=true;
                    for(const {id,mesh} of members){
                        const geometry=mesh.geometry,p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');
                        if(!p||!n||!uv||Object.keys(geometry.attributes).some(name=>!['position','normal','uv'].includes(name)&&!generatedSurfaceAttributes.has(name))){compatible=false;break;}
                        const normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld),point=new THREE.Vector3(),normal=new THREE.Vector3(),start=positions.length/9;
                        const vertexStart=positions.length/3;
                        const sourceFaces=geometry.userData.saLogicalFaceRanges;
                        if(!Array.isArray(sourceFaces)||!sourceFaces.length){compatible=false;break;}
                        for(const face of sourceFaces)faceRanges.push({...face,start:vertexStart+face.start,textureSize:face.textureSize?.slice()});
                        const count=geometry.index?.count??p.count;
                        for(let i=0;i<count;i++){
                            const index=geometry.index?geometry.index.getX(i):i;
                            point.fromBufferAttribute(p,index).applyMatrix4(mesh.matrixWorld);normal.fromBufferAttribute(n,index).applyNormalMatrix(normalMatrix);
                            positions.push(point.x,point.y,point.z);normals.push(normal.x,normal.y,normal.z);uvs.push(uv.getX(index),uv.getY(index));
                        }
                        ranges.push({source:id,start,count:count/3});
                    }
                    if(!compatible)continue;
                    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeBoundingBox();geometry.computeBoundingSphere();resources.owned.add(geometry);
                    geometry.userData.saLogicalFaceRanges=faceRanges;
                    const first=members[0].mesh,mesh=new THREE.Mesh(geometry,first.material);mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.renderOrder=first.renderOrder;mesh.userData.lightflowSourceRanges=ranges;mesh.userData.lightflowSourceMaterialDefinitions=first.userData.lightflowSourceMaterialDefinitions;mesh.userData.lightflowSourceElement=first.userData.lightflowSourceElement;
                    const holder=new THREE.Group();holder.userData.lightflowKind='geometry';holder.add(mesh);
                    members.forEach(member=>templates.delete(member.id));templates.set(members[0].id,holder);
                }
                resources.batchCache={version:resources.batchVersion,templates};return templates;
            };
            const mountResult=(element,result)=>{
                if(!element?.mesh||result.status!=='ready')return;
                element._lightflowEulerOrder=window.Formats?.[result.manifest.format]?.euler_order||'ZYX';
                clearMounted(element,true);
                const poses=synchronizeTree(element,result);
                const resources=createRenderResources(result);
                const texture=instanceTexture(element,resources);
                const binding=texture&&element.texture_override.startsWith('source:')
                    ? resources.loadTextureChoice(result.model.textures.indexOf(texture)):texture;
                const map=instanceTextureMap(element,resources,texture);
                const textureMaterials=new Map();
                const replaceTexture=material=>{
                    if(!material?.sa_linked_default_texture)return material;
                    if(!textureMaterials.has(material)){
                        const alpha=map.userData;
                        const replacement=new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:1/255,
                            depthWrite:!!(alpha?.lightflowOpaque||alpha?.lightflowCutout),side:THREE.DoubleSide});
                        replacement.sa_source_render_mode=texture.render_mode||'default';
                        replacement.sa_source_blockbench_texture=binding;
                        replacement.sa_linked_material_definition=material.sa_linked_material_definition;
                        textureMaterials.set(material,replacement);
                    }
                    return textureMaterials.get(material);
                };
                const mounted=[];
                const parentForCube=new Map();
                for(const group of result.manifest.groups)for(const uuid of group.elementIds)parentForCube.set(uuid,group);
                for(const [id,template] of rigidTemplates(resources,result.manifest)){
                    if(template.userData.lightflowKind==='billboards'?element.include_billboards===false:element.include_geometry===false)continue;
                    const sourceGroup=parentForCube.get(id),pose=sourceGroup?poses.get(sourceGroup.id):null;
                    const mesh=template.clone(true);
                    mesh.position.sub(new THREE.Vector3().fromArray(sourceGroup?.origin||[0,0,0]));
                    if(mesh.userData.lightflowTerrainCoordinates){const offset=core.terrainGridOffset(result.model,Format.centered_grid);mesh.position.x+=offset;mesh.position.z+=offset;}
                    mesh.traverse(object=>{if(object.isMesh){object.name=pose?.uuid||element.uuid;object.userData.lightflowSceneInstance=element.uuid;object.userData.lightflowPose=pose?.uuid||'';
                        linkedSourceResources.set(object,resources);
                        if(map)object.material=Array.isArray(object.material)?object.material.map(replaceTexture):replaceTexture(object.material);
                        // Shader face dimensions and join attributes depend on
                        // this instance's transform; never mutate a shared template.
                        if(object.geometry){
                            const source=object.geometry;
                            if(object.userData.lightflowTerrainSection){
                                object.geometry=core.createTerrainInstanceGeometry(source,THREE);
                                terrainInstanceStates.set(object,{source,nativeMaterial:object.material,integrated:false});
                            }else object.geometry=source.clone();
                            object.userData.lightflowOwnedGeometry=true;
                        }
                        if(object.userData.lightflowBillboard)object.onBeforeRender=(_renderer,_scene,camera)=>{
                            const mode=object.userData.lightflowBillboard,target=camera.getWorldPosition(new THREE.Vector3());
                            if(mode.endsWith('_y'))target.y=object.getWorldPosition(new THREE.Vector3()).y;
                            if(mode.startsWith('rotate')){const q=camera.getWorldQuaternion(new THREE.Quaternion());if(mode==='rotate_y'){const e=new THREE.Euler().setFromQuaternion(q,'YXZ');q.setFromEuler(new THREE.Euler(0,e.y,0));}object.quaternion.copy(object.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));}
                            else object.lookAt(target);
                            object.updateMatrixWorld(true);
                        };
                    }});
                    (pose?.mesh||element.mesh).add(mesh);
                    mounted.push(mesh);
                }
                mountedCubes.set(element,mounted);
                updateSecondarySkinLayer(element);
                if(textureMaterials.size)mountedTextureMaterials.set(element,textureMaterials);
                if(resources.terrainBufferOwner&&element.include_geometry!==false){
                    const owner=new THREE.Mesh(resources.terrainBufferOwner,[]);
                    owner.name='Terrain shared buffer owner';owner.frustumCulled=false;owner.matrixAutoUpdate=false;
                    owner.raycast=()=>{};
                    owner.userData.lightflowTerrainBufferOwner=true;owner.userData.bedrockStructurePrebatched=true;
                    element.mesh.add(owner);mounted.push(owner);
                }
                resources.users.add(element);
                activeMounts.set(element,resources);
                rememberMountedInstance(element,texture,map);
                // A second linked world shares source streams but needs its own
                // derived streams. Preflight the whole scene before decorating it.
                refreshLinkedMaterials();
                window.ShaderEngine?.refreshExternalMeshTransforms?.(element.mesh);
                element._lightflowManifest=result.manifest;
                element.source_model_format=result.manifest.format;
                element._lightflowAnimations=core.normalizeLinkedAnimations(result.model,window.invertMolang);
                element._lightflowVariableLines={};
                for(const line of String(result.model.animation_variable_placeholders||'').split('\n')){
                    let [key,value]=line.split(/=\s*(.+)/);if(value===undefined)continue;
                    key=key.replace(/[\s;]/g,'').replace(/^v\./,'variable.').replace(/^q\./,'query.').replace(/^t\./,'temp.').replace(/^c\./,'context.');
                    element._lightflowVariableLines[key]=value.trim();
                }
                for(const pose of poses.values())pose.preview_controller?.updateTransform?.(pose);
                scheduleAnimation();
                element._lightflowStatus='ready';
                element.source_revision=result.revision;
                element._lightflowMaterialLimit=false;
                window.ShaderEngine?.requestPreviewRender?.({cause:'scene_link_mount'});
                syncPanel();
            };
            const syncInstanceTexture=(element,force=false)=>{
                const resources=activeMounts.get(element);
                if(!resources||!force&&hasSameMountedTexture(element,resources,mountedInstanceStates.get(element)))return false;
                const status=element._lightflowStatus,revision=element.source_revision;
                mountResult(element,resources.result);
                element._lightflowStatus=status;element.source_revision=revision;
                updateAnimatedTree(element);
                return true;
            };
            // One native recovery dialog at a time; repeated hydration and linked
            // copies of the same source share a prompt. Dismissing keeps the link.
            const sourceRecoveryQueue=[],sourceRecoverySeen=new WeakMap();
            let sourceRecoveryTimer=null,sourceRecoveryDialog=null;
            const recoveryTargets=entry=>[...entry.targets].filter(([element,reference])=>
                !disposed&&entry.project===window.Project&&element.mesh?.parent&&element.source_link===reference&&
                ['missing','read_error'].includes(element._lightflowStatus)).map(([element])=>element);
            const scheduleSourceRecovery=()=>{
                if(disposed||sourceRecoveryDialog||sourceRecoveryTimer!==null||!sourceRecoveryQueue.length)return;
                sourceRecoveryTimer=setTimeout(()=>{
                    sourceRecoveryTimer=null;
                    if(disposed)return;
                    if(sourceRecoveryDialog||Dialog.open){scheduleSourceRecovery();return;}
                    let entry,targets;
                    do{entry=sourceRecoveryQueue.shift();targets=entry?recoveryTargets(entry):[];}while(entry&&!targets.length);
                    if(!entry)return;
                    targets.forEach(element=>sourceRecoverySeen.set(element,element.source_link));
                    const finish=()=>{sourceRecoveryDialog?.hide();sourceRecoveryDialog?.delete();sourceRecoveryDialog=null;scheduleSourceRecovery();};
                    sourceRecoveryDialog=new Dialog('lightflow_scene_link_recovery',{
                        title:t('source_unavailable'),width:560,
                        form:{
                            explanation:{type:'info',text:t('source_recovery_help')},
                            instances:{type:'text',label:t('instance_name'),value:targets.map(element=>element.name||element.uuid||'').join(', '),readonly:true},
                            source:{type:'text',label:t('linked_scene'),value:entry.path||'',readonly:true},
                            detail:{type:'text',label:t('could_not_read_source'),value:entry.message||statusText({_lightflowStatus:entry.status}),readonly:true}
                        },
                        buttons:[t('find_source_file'),t('leave_source_empty'),t('retry_source_later')],confirmIndex:0,cancelIndex:2,
                        onButton(index){
                            const current=recoveryTargets(entry);
                            finish();
                            if(index===0&&current.length)chooseSource(current);
                            if(index===1&&current.length){
                                Undo.initEdit({elements:current});
                                for(const element of current){
                                    element.extend({source_link:'',source_revision:''});
                                    element._lightflowRequest=(element._lightflowRequest||0)+1;
                                    element._lightflowPlaying=false;
                                    clearMounted(element);
                                    delete element._lightflowManifest;delete element._lightflowAnimations;
                                    element._lightflowStatus='empty';
                                }
                                Undo.finishEdit(t('empty_linked_scene'));
                                syncPanel();window.ShaderEngine?.requestPreviewRender?.({cause:'scene_link_empty'});
                            }
                            return false;
                        },
                        onCancel(){finish();}
                    });
                    sourceRecoveryDialog.show();
                },250);
            };
            const queueSourceRecovery=(element,result,force)=>{
                if(!force&&sourceRecoverySeen.get(element)===element.source_link)return;
                const project=element._lightflowProject||window.Project;
                let entry=sourceRecoveryQueue.find(item=>item.project===project&&item.path===result.path);
                if(!entry){entry={...result,project,targets:new Map()};sourceRecoveryQueue.push(entry);}
                entry.targets.set(element,element.source_link);
                scheduleSourceRecovery();
            };
            owned.push({delete(){
                if(sourceRecoveryTimer!==null)clearTimeout(sourceRecoveryTimer);
                sourceRecoveryTimer=null;sourceRecoveryQueue.length=0;
                sourceRecoveryDialog?.delete();sourceRecoveryDialog=null;
            }});
            const refreshInstance=async(element,force=false)=>{
                if(disposed||!element||element.type!=='lightflow_scene_instance')return;
                const project=element._lightflowProject||window.Project;
                const reference=element.source_link;
                const current=(element._lightflowRequest||0)+1;element._lightflowRequest=current;
                element._lightflowStatus='updating';syncPanel();
                const result=await readSource(element,force);
                if(disposed||element._lightflowRequest!==current||element.source_link!==reference||!element.mesh?.parent||project!==window.Project)return;
                element._lightflowStatus=result.status;
                if(result.status==='ready'){
                    confirmedSources.set(element,{reference,path:result.path});
                    sourceRecoverySeen.delete(element);
                    element._lightflowManifest=result.manifest;
                    // Source files are still checked on project selection. An
                    // unchanged resident mount keeps its geometry and GPU programs.
                    if(!force&&canReuseMountedInstance(element,result)){
                        element.source_revision=result.revision;
                        applyLinkedMaterials(element);
                        updateAnimatedTree(element);
                        window.ShaderEngine?.requestPreviewRender?.({cause:'scene_link_resume'});
                        syncPanel();
                        return;
                    }
                    mountResult(element,result);
                }
                else {
                    confirmedSources.delete(element);
                    if(result.status==='empty'){clearMounted(element);element._lightflowPlaying=false;}
                    if(['missing','read_error'].includes(result.status))queueSourceRecovery(element,result,force);
                    syncPanel();
                }
            };

            const selected=()=>Outliner.selected.find(node=>node?.type==='lightflow_scene_instance'||node?.type==='lightflow_pose_group');
            const selectionBox=new THREE.Box3();
            const selectionOutline=new THREE.Box3Helper(selectionBox,0x5d9dff);
            selectionOutline.name='lightflow_scene_link_selection';
            selectionOutline.visible=false;
            selectionOutline.renderOrder=2000;
            selectionOutline.material.depthTest=true;
            selectionOutline.material.depthWrite=false;
            selectionOutline.material.transparent=true;
            selectionOutline.material.opacity=.78;
            selectionOutline.raycast=()=>{};
            Canvas.outlines?.add(selectionOutline);
            const selectionEdges=new THREE.Group();
            selectionEdges.name='lightflow_scene_link_edges';
            let edgeSignature='';
            const terrainSelectionEdges=new WeakMap();
            const clearSelectionEdges=()=>{for(const edge of [...selectionEdges.children]){if(!edge.userData.sharedTerrainGeometry)edge.geometry.dispose();edge.material.dispose();selectionEdges.remove(edge);}};
            updateOutline=()=>{
                const element=selected();
                let visible=!!element?.mesh;for(let node=element?.mesh;node;node=node.parent)if(!node.visible)visible=false;
                if(!visible){selectionOutline.visible=false;selectionEdges.visible=false;return;}
                // Native selection refreshes may empty Canvas.outlines.
                if(selectionOutline.parent!==Canvas.outlines||!Canvas.outlines?.children.includes(selectionOutline))Canvas.outlines?.add(selectionOutline);
                if(selectionEdges.parent!==Canvas.outlines||!Canvas.outlines?.children.includes(selectionEdges))Canvas.outlines?.add(selectionEdges);
                if(Canvas.outlines)Canvas.outlines.visible=true;
                element.mesh.updateWorldMatrix(true,true);
                const meshes=[];element.mesh.traverseVisible(mesh=>{if(mesh.isMesh&&mesh.geometry&&!mesh.userData.lightflowTerrainBufferOwner)meshes.push(mesh);});
                selectionBox.makeEmpty();for(const mesh of meshes){if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();selectionBox.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));}
                selectionOutline.visible=!selectionBox.isEmpty();
                const root=rootOf(element);
                const marker=Number.isInteger(root?.color)&&root.color>=0?window.markerColors?.[root.color%markerColors.length]:null;
                selectionOutline.material.color.set(marker?.pastel||0x5d9dff);
                const signature=meshes.map(mesh=>mesh.uuid).join('|');
                if(signature!==edgeSignature){
                    clearSelectionEdges();edgeSignature=signature;
                    for(const mesh of meshes){
                        const source=terrainInstanceStates.get(mesh)?.source,resources=linkedSourceResources.get(mesh);
                        let geometry=source&&terrainSelectionEdges.get(source);
                        if(!geometry){geometry=new THREE.EdgesGeometry(source||mesh.geometry);if(source){terrainSelectionEdges.set(source,geometry);resources.owned.add(geometry);}}
                        const edge=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:marker?.pastel||0x5d9dff,depthTest:true,depthWrite:false,transparent:true,opacity:.8}));
                        edge.matrixAutoUpdate=false;edge.userData.source=mesh;edge.userData.sharedTerrainGeometry=!!source;edge.raycast=()=>{};edge.renderOrder=2001;selectionEdges.add(edge);
                    }
                }
                selectionEdges.visible=meshes.length>0;
                selectionEdges.updateWorldMatrix(true,false);
                const inverse=new THREE.Matrix4().copy(selectionEdges.matrixWorld).invert();
                for(const edge of selectionEdges.children){edge.matrix.copy(inverse).multiply(edge.userData.source.matrixWorld);edge.matrixWorldNeedsUpdate=true;edge.material.color.copy(selectionOutline.material.color);}
            };
            owned.push({delete(){clearSelectionEdges();selectionEdges.parent?.remove(selectionEdges);selectionOutline.parent?.remove(selectionOutline);selectionOutline.geometry.dispose();selectionOutline.material.dispose();}});
            const statusText=element=>{
                const status=element?._lightflowStatus||'ready';
                return ({ready:t("connected"),changed:t("changes_available"),updating:t("updating"),missing:t("source_missing"),empty:t('empty_source'),incompatible:t("incompatible_source"),read_error:t("could_not_read_source")})[status]||status;
            };
            const sourcePath=element=>{
                const root=rootOf(element);
                if(!root)return '';
                try{return confirmedSource(root)||core.resolveLinkReference(JSON.parse(root.source_link),receiverBase(root._lightflowProject||Project),paths)||'';}
                catch(_){return '';}
            };
            const edit=(element,values,label)=>{
                Undo.initEdit({elements:[element]});
                element.extend(values);
                if('secondary_skin_layer'in values&&updateSecondarySkinLayer(element))window.ShaderEngine?.invalidateExternalMeshIntegrationCaches?.();
                element.preview_controller?.updateTransform?.(element);
                Undo.finishEdit(label);
                window.ShaderEngine?.requestPreviewRender?.({cause:'scene_link_edit'});
                syncPanel();
            };
            const animationIds=root=>Array.isArray(root?.animation_ids)&&root.animation_ids.length?root.animation_ids:root?.animation_id?[root.animation_id]:[];
            const sourceAnimationId=animation=>String(animation.uuid||animation.name);
            const findSourceAnimation=(root,id)=>root?._lightflowAnimations?.find(animation=>sourceAnimationId(animation)===id&&core.animationSupported(animation));
            const animationsFor=root=>animationIds(root).map(id=>findSourceAnimation(root,id)).filter(Boolean);
            const mountedAnimationRoot=id=>{
                const root=OutlinerNode.uuids[id];
                return root?.type==='lightflow_scene_instance'&&root._lightflowProject===Project&&activeMounts.has(root)?root:null;
            };
            const listAnimationGroups=()=>(Project?.elements||[]).filter(root=>root.type==='lightflow_scene_instance'&&activeMounts.has(root))
                .map(root=>({id:root.uuid,name:root.name,animations:(root._lightflowAnimations||[]).filter(core.animationSupported)
                    .map(animation=>({id:sourceAnimationId(animation),name:animation.name}))}))
                .filter(group=>group.animations.length);
            const animationFor=root=>animationsFor(root).find(a=>String(a.uuid||a.name)===root?.animation_id)||animationsFor(root)[0];
            const layerFor=(root,id)=>root?.animation_layers?.find(layer=>layer.id===id);
            class LinkedSourceAnimator extends BoneAnimator {
                getGroup(){return this.group;}
                select(){return GeneralAnimator.prototype.select.call(this);}
                doRender(){return false;}
                createKeyframe(){Blockbench.showQuickMessage(t("edit_these_keyframes_in_the_source_project"));}
                showContextMenu(event){new Menu([{name:t("open_source_project"),icon:'open_in_new',click:()=>openSource(this.group)}]).open(event);}
            }
            let sourceTrackSignature='';
            const showSourceKeyframes=node=>{
                if(!Modes.animate||!node?.source_group_id){for(const animator of [...Timeline.animators])if(animator._lightflowReadOnly)Timeline.animators.remove(animator);sourceTrackSignature='';return;}
                const root=rootOf(node),clips=animationsFor(root),signature=node.uuid+'|'+root.source_revision+'|'+clips.map(a=>String(a.uuid||a.name)+':'+((Number(root.animation_offset)||0)+(Number(layerFor(root,String(a.uuid||a.name))?.offset)||0))).join('|');
                if(signature===sourceTrackSignature&&Timeline.animators.some(a=>a._lightflowReadOnly))return;
                for(const animator of [...Timeline.animators])if(animator._lightflowReadOnly)Timeline.animators.remove(animator);
                sourceTrackSignature=signature;
                for(const clip of clips){
                    const track=clip.animators?.[node.source_group_id];if(!track?.keyframes?.length)continue;
                    const offset=(Number(root.animation_offset)||0)+(Number(layerFor(root,String(clip.uuid||clip.name))?.offset)||0);
                    const animator=new LinkedSourceAnimator(guid(),{...clip,time:0,animators:{}});animator._lightflowReadOnly=true;animator.group=node;
                    Object.defineProperty(animator,'name',{get:()=>node.name+' · '+clip.name.split('.').at(-1),configurable:true});
                    for(const data of track.keyframes){const key=animator.addKeyframe({...data,time:Number(data.time)-offset});if(!key)continue;key._lightflowReadOnly=true;
                        const fixedTime=key.time;Object.defineProperty(key,'time',{get:()=>fixedTime,set(){},configurable:true});
                        for(const method of ['set','offset','flip','remove','extend'])key[method]=()=>key;
                        key.select=()=>key;key.clickSelect=()=>{Timeline.setTime(Math.max(0,key.time));Animator.preview();};
                    }
                    animator.expanded=true;animator.addToTimeline();
                }
                Vue.nextTick(()=>{if(disposed)return;for(const animator of Timeline.animators)if(animator._lightflowReadOnly){const row=document.querySelector('.animator[uuid="'+animator.uuid+'"]');row?.classList.add('lf-links-readonly-track');if(row)row.title=t("source_animation_read_only");}});
            };
            owned.push({delete(){for(const animator of [...Timeline.animators])if(animator._lightflowReadOnly)Timeline.animators.remove(animator);}});
            const guardSourceKeyframe=event=>{
                const element=event.target.closest?.('.keyframe[id]');if(!element)return;
                const track=Timeline.animators.find(animator=>animator._lightflowReadOnly&&animator.keyframes.some(key=>key.uuid===element.id.replace(/^_/,'')));if(!track)return;
                event.preventDefault();event.stopImmediatePropagation();
                if(event.type==='contextmenu')new Menu([{name:t("open_source_project"),icon:'open_in_new',click:()=>openSource(track.group)}]).open(event);
                else if(event.type==='mousedown')Blockbench.showQuickMessage(t("source_keyframes_are_read_only"));
            };
            for(const type of ['pointerdown','mousedown','touchstart','contextmenu'])document.addEventListener(type,guardSourceKeyframe,true);
            owned.push({delete(){for(const type of ['pointerdown','mousedown','touchstart','contextmenu'])document.removeEventListener(type,guardSourceKeyframe,true);}});
            const clipTime=(root,animation)=>{const layer=layerFor(root,String(animation.uuid||animation.name));const state={...root,animation_offset:(Number(root.animation_offset)||0)+(Number(layer?.offset)||0),animation_loop:typeof layer?.loop==='boolean'?layer.loop:root.animation_loop_override?root.animation_loop:animation.loop==='loop'};return core.linkedAnimationTime(layer?.locked?{...state,animation_locked:true,animation_time:layer.time}:state,animation,timelineClock(root));};
            const timelineClock=root=>Modes.animate?Number(Timeline.time)||0:Number(root?._lightflowTime??root?.animation_time)||0;
            const animationTime=root=>animationFor(root)?clipTime(root,animationFor(root)):0;
            const sampleNativePoseKeyframes=(animator,root)=>{
                const keys=[];
                for(const key of animator[poseChannel]||[]){try{keys.push({key,snapshot:core.normalizePoseSnapshot(key.lightflow_pose_snapshot)});}catch{/* Ignore malformed or future snapshots. */}}
                if(!keys.length)return null;
                const groups={},order=window.Format?.euler_order||root._lightflowEulerOrder||'ZYX';
                const neutralMesh={fix_rotation:new THREE.Euler(0,0,0,order),rotation:new THREE.Euler(0,0,0,order)};
                const lastValues=Animator._last_values;
                Animator._last_values=Object.fromEntries(Object.entries(lastValues||{}).map(([channel,values])=>[channel,Array.isArray(values)?values.slice():values]));
                try{
                    for(const id of new Set(keys.flatMap(({snapshot})=>Object.keys(snapshot.groups)))){
                        const sampler=Object.create(BoneAnimator.prototype);
                        sampler.animation=animator.animation;sampler.uuid=animator.uuid;
                        sampler.quaternion_interpolation=animator.quaternion_interpolation;
                        sampler.group={mesh:neutralMesh,scene_object:neutralMesh};
                        const values={};
                        for(const channel of ['position','rotation','scale']){
                            sampler[channel]=keys.filter(({snapshot})=>snapshot.groups[id]).map(({key,snapshot})=>{
                                // Read-only native Keyframe views: interpolation, handles and times stay owned by the real key.
                                const view=Object.create(key),xyz=snapshot.groups[id][channel];
                                Object.defineProperties(view,{channel:{value:channel},animator:{value:sampler},transform:{value:true},uniform:{value:false},data_points:{value:[{x:xyz[0],y:xyz[1],z:xyz[2]}]}});return view;
                            });
                            values[channel]=BoneAnimator.prototype.interpolate.call(sampler,channel);
                        }
                        if(values.position&&values.rotation&&values.scale)groups[id]={position:values.position,scale:values.scale,quaternion:core.quaternionFromDegrees(values.rotation,order)};
                    }
                }finally{Animator._last_values=lastValues;}
                return groups;
            };
            const updateLinkedGizmo=()=>{
                const transformer=window.Transformer;
                if(transformer&&!transformer.dragging&&rootOf(Group.first_selected||Outliner.selected[0]))transformer.updateSelection();
            };
            const updateAnimatedTree=(element,updateGizmo=true)=>{
                updatingAnimatedTree=true;
                try{
                    const frames=[];
                    if(Modes.animate&&isSkinRoot(element))for(const animation of Animator.animations){
                        const animator=animation.animators?.[element.uuid];
                        if(!animation.playing||!animator||animator.muted?.[poseChannel]||!animator[poseChannel]?.length)continue;
                        const groups=sampleNativePoseKeyframes(animator,element);
                        if(groups)frames.push({groups,weight:Math.max(0,Math.min(1,Number(animator._lightflowPoseWeight??1)||0)),override:!!animation.override});
                    }
                    poseTrackFrames.set(element,frames);
                    element?.preview_controller?.updateTransform?.(element);
                    element?.forEachChild?.(pose=>{if(pose.type==='lightflow_pose_group'&&rootOf(pose)===element)pose.preview_controller?.updateTransform?.(pose);});
                    if(Modes.animate)for(const animation of Animator.animations){
                        if(!animation.playing)continue;
                        for(const animator of Object.values(animation.animators)){
                            const node=OutlinerNode.uuids[animator.uuid];
                            // Only replay tracks for the transforms reset above.
                            // Native attachments already received their own keys from Blockbench.
                            if(node===element||node?.type==='lightflow_pose_group'&&rootOf(node)===element)animator.displayFrame();
                        }
                    }
                }finally{updatingAnimatedTree=false;}
                element?.mesh?.updateMatrixWorld(true);
                window.ShaderEngine?.refreshExternalMeshTransforms?.(element?.mesh);
                updateOutline();
                if(updateGizmo)updateLinkedGizmo();
                window.ShaderEngine?.requestPreviewRender?.({cause:'scene_link_animation'});
            };
            const expressionSamplers=new WeakMap(),instanceVariables=new WeakMap();
            const sampleLinkedChannel=(pose,animation,channel,time)=>{
                const track=animation.animators?.[pose.source_group_id];
                if(!track?.keyframes?.length)return null;
                if(!animation.blend_weight&&!track?.keyframes?.some(key=>key.interpolation==='bezier'||key.data_points?.some(point=>['x','y','z'].some(axis=>typeof point[axis]==='string'&&!Number.isFinite(Number(point[axis]))))))return core.sampleAnimationChannel(animation,pose.source_group_id,channel,time);
                if(!track.keyframes.some(key=>key.channel===channel))return null;
                let clips=expressionSamplers.get(pose);if(!clips){clips=new WeakMap();expressionSamplers.set(pose,clips);}
                let sampler=clips.get(animation);
                if(!sampler){const context={...animation,time,animators:{}};sampler=new BoneAnimator(pose.uuid,context);track.keyframes.forEach(key=>sampler.addKeyframe(key));clips.set(animation,sampler);}
                sampler.animation.time=time;
                const root=rootOf(pose),parser=Animator.MolangParser,previousAnimation=parser.context.animation,previousVariables=parser.global_variables,previousValues=Animator._last_values,previousLines=Animator.global_variable_lines;
                let variables=instanceVariables.get(root);if(!variables){variables={...previousVariables};instanceVariables.set(root,variables);}
                try{parser.context.animation=sampler.animation;parser.global_variables=variables;Animator.global_variable_lines=root._lightflowVariableLines||{};Animator._last_values={};const value=sampler.interpolate(channel),weight=animation.blend_weight?Math.max(0,Number(parser.parse(animation.blend_weight,{'query.anim_time':time}))||0):1;return Array.isArray(value)?value.map(v=>channel==='scale'?1+(v-1)*weight:v*weight):value;}
                finally{parser.context.animation=previousAnimation;parser.global_variables=previousVariables;Animator.global_variable_lines=previousLines;Animator._last_values=previousValues;}
            };
            applyPoseAnimation=pose=>{
                const root=rootOf(pose),mesh=pose.mesh;
                if(!root)return;
                const basePosition=mesh.position.clone(),baseRotation=mesh.rotation.clone(),baseScale=mesh.scale.clone();
                const entries=window.LightflowCinematic?.getLinkedAnimationFrame?.(root.uuid)
                    ?? animationsFor(root).map(animation=>({animation,time:clipTime(root,animation),weight:1}));
                for(const {animation,time,weight} of entries){
                    if(weight<=0)continue;
                    const position=sampleLinkedChannel(pose,animation,'position',time);
                    const rotation=sampleLinkedChannel(pose,animation,'rotation',time);
                    const scale=sampleLinkedChannel(pose,animation,'scale',time);
                    const override=animation.override&&weight>=1;
                    if(position){if(override)mesh.position.copy(basePosition);mesh.position.addScaledVector(new THREE.Vector3().fromArray(position),weight);}
                    if(rotation){if(override)mesh.rotation.copy(baseRotation);mesh.rotation.x+=Math.degToRad(rotation[0])*weight;mesh.rotation.y+=Math.degToRad(rotation[1])*weight;mesh.rotation.z+=Math.degToRad(rotation[2])*weight;}
                    if(scale){if(override)mesh.scale.copy(baseScale);mesh.scale.multiply(new THREE.Vector3().fromArray(scale.map(value=>(1+(value-1)*weight)||.00001)));}
                }
            };
            // A native, unsaved clock enables Timeline playback when the scene has
            // no local animation. It is never inserted into Animation.all.
            const timelineCarriers=new Map();
            const ensureTimeline=()=>{
                if(!Modes.animate||!Project)return;
                const current=Animation.selected;
                if(current&&!current._lightflowSceneLinkClock)return;
                const roots=(Project.elements||[]).filter(e=>e.type==='lightflow_scene_instance');
                const length=Math.max(.001,...roots.flatMap(root=>animationsFor(root).map(a=>(Number(a.length)||0)+Math.max(0,-((Number(root.animation_offset)||0)+(Number(layerFor(root,String(a.uuid||a.name))?.offset)||0))))));
                let carrier=timelineCarriers.get(Project);
                if(!carrier){carrier=new Animation({name:t("linked_scene_timeline"),length,loop:'hold'});carrier._lightflowSceneLinkClock=true;timelineCarriers.set(Project,carrier);}
                carrier.length=length;
                if(current!==carrier){if(current)current.selected=false;Animation.selected=carrier;carrier.selected=true;}
                Timeline.vue.animation_length=length;Timeline.updateSize();
            };
            const syncTimeline=()=>{
                if(disposed||!Project)return;
                for(const root of Project.elements||[])if(root.type==='lightflow_scene_instance'){
                    if(Modes.animate)root._lightflowTime=Number(Timeline.time)||0;
                    updateAnimatedTree(root,false);
                }
                // Blockbench centers the gizmo before dispatching display_animation_frame.
                updateLinkedGizmo();
                motionPanel?.inside_vue?.syncPlayback?.();
            };
            const nativeSetTime=Timeline.setTime;
            const linkedSetTime=function(...args){const result=nativeSetTime.apply(this,args);if(Modes.animate)syncTimeline();return result;};
            Timeline.setTime=linkedSetTime;
            owned.push(Blockbench.on('display_animation_frame',syncTimeline));
            owned.push({delete(){
                if(Timeline.setTime===linkedSetTime)Timeline.setTime=nativeSetTime;
                if(Animation.selected?._lightflowSceneLinkClock){Animation.selected=null;Timeline.clear();}
                for(const [project,carrier] of timelineCarriers)if(project.selected_animation===carrier)project.selected_animation=null;
                timelineCarriers.clear();
            }});
            scheduleAnimation=()=>{};
            const setAnimations=(element,ids)=>{
                const root=rootOf(element);if(!root)return;
                const available=new Set((root._lightflowAnimations||[]).filter(core.animationSupported).map(a=>String(a.uuid||a.name)));
                const next=[...new Set(ids)].filter(id=>available.has(id));
                delete root._lightflowTime;root._lightflowPlaying=false;
                const layers=(root.animation_layers||[]).map(layer=>({...layer}));
                next.forEach(id=>{if(!layers.some(layer=>layer.id===id))layers.push({id,locked:false,time:0});});
                edit(root,{animation_ids:next,animation_id:next.includes(root.animation_id)?root.animation_id:next[0]||'',animation_layers:layers},t("choose_linked_animations"));
                ensureTimeline();updateAnimatedTree(root);
            };
            const setAnimation=(element,id)=>setAnimations(element,id?[id]:[]);
            const selectClip=(element,id)=>{
                const root=rootOf(element);if(!root)return;
                const locked=(root.animation_layers||[]).filter(layer=>layer.locked&&animationIds(root).includes(layer.id)&&layer.id!==id);
                const inactive=(root.animation_layers||[]).filter(layer=>!animationIds(root).includes(layer.id)&&layer.id!==id);
                const existing=layerFor(root,id);
                edit(root,{animation_id:id,animation_ids:[...locked.map(layer=>layer.id),id],animation_layers:[...inactive,...locked,existing||{id,locked:false,time:0}]},t("select_linked_clip"));
                ensureTimeline();updateAnimatedTree(root);
            };
            const toggleAnimation=(element,id)=>{
                const root=rootOf(element);if(!root)return;
                const ids=animationIds(root),existing=layerFor(root,id),active=ids.includes(id);
                let layers=(root.animation_layers||[]).filter(layer=>layer.id!==id);
                const next=ids.filter(value=>value!==id);
                if(!active||existing?.locked&&root.animation_id===id){next.push(id);layers.push({...existing,id,locked:false,time:0});}
                else if(!existing?.locked){next.push(id);layers.push({...existing,id,locked:true,time:timelineClock(root)});}
                if(active&&existing?.locked&&root.animation_id!==id)layers.push({...existing,locked:false});
                edit(root,{animation_ids:next,animation_layers:layers,...(!next.includes(root.animation_id)?{animation_id:next[0]||''}:{})},t("change_linked_playback_state"));
                ensureTimeline();updateAnimatedTree(root);
            };
            const setAnimationTime=(element,time)=>{
                const root=rootOf(element);if(!root)return;
                edit(root,{animation_locked:true,animation_time:Math.max(0,Number(time)||0)},t("lock_linked_animation_pose"));updateAnimatedTree(root);
            };
            const setClipPlayback=(root,id,locked)=>{
                const ids=animationIds(root),layers=(root.animation_layers||[]).filter(layer=>layer.id!==id);
                layers.push({...layerFor(root,id),id,locked,time:locked?timelineClock(root):0});
                edit(root,{animation_ids:ids.includes(id)?ids:[...ids,id],animation_layers:layers,animation_id:root.animation_id||id},t("change_linked_playback_state"));
                ensureTimeline();updateAnimatedTree(root);
            };
            const togglePlayback=()=>{ensureTimeline();if(Timeline.playing)Timeline.pause();else Timeline.start();};
            const showAnimationMenu=(root,anchor)=>{
                if(!root)return;
                const menu=new Menu(()=>[
                    {name:t("original_pose"),icon:animationIds(root).length?'radio_button_unchecked':'check_box',click:()=>setAnimations(root,[])},
                    '_',...(root._lightflowManifest?.animations||[]).map(a=>({
                        name:a.name+(a.supported?'':' · '+t("unsupported")),
                        icon:animationIds(root).includes(a.id)?'check_box':'check_box_outline_blank',
                        condition:a.supported,click:()=>{const ids=animationIds(root);setAnimations(root,ids.includes(a.id)?ids.filter(id=>id!==a.id):[...ids,a.id]);}
                    }))
                ],{keep_open:true});
                activeAnimationMenu?.hide();activeAnimationMenu=menu;menu.open(anchor);
            };
            const setClipOffset=(root,id,total)=>{
                const value=Number(total);if(!root||!Number.isFinite(value))return;
                const layers=(root.animation_layers||[]).map(layer=>({...layer}));
                let layer=layers.find(item=>item.id===id);if(!layer){layer={id,locked:false,time:0};layers.push(layer);}
                layer.offset=value-(Number(root.animation_offset)||0);
                edit(root,{animation_layers:layers},t("offset_linked_clip"));ensureTimeline();updateAnimatedTree(root);
            };
            const showClipMenu=(root,id,anchor)=>{
                const clip=root?._lightflowManifest?.animations?.find(a=>a.id===id);if(!clip)return;
                const totalOffset=()=>(Number(root.animation_offset)||0)+(Number(layerFor(root,id)?.offset)||0);
                const menu=new Menu([
                    {name:t("start_at_timeline_cursor")+' · '+Timeline.time.toFixed(2)+' s',icon:'vertical_align_center',click:()=>setClipOffset(root,id,-Timeline.time)},
                    {name:t("edit_time_offset"),icon:'schedule',click:()=>{
                        const dialog=new Dialog('lightflow_linked_clip_offset',{title:clip.name,width:440,form:(window.LightManagerUI?.prepareForm || (form => form))({
                            offset:{label:t("time_offset_seconds"),type:'number',value:totalOffset(),step:.05},
                            help:{type:'info',text:t("clip_time_timeline_offset_a_negative_offset_delays_its_start")}
                        }),onConfirm(values){if(root._lightflowProject===Project)setClipOffset(root,id,values.offset);dialog.delete();}});
                        offsetDialog?.delete();offsetDialog=dialog;dialog.show();
                    }},
                    {name:t("reset_offset"),icon:'restart_alt',click:()=>setClipOffset(root,id,0)},
                    {name:t("loop_animation"),icon:(typeof layerFor(root,id)?.loop==='boolean'?layerFor(root,id).loop:root.animation_loop_override?root.animation_loop:root._lightflowAnimations?.find(a=>String(a.uuid||a.name)===id)?.loop==='loop')?'check_box':'check_box_outline_blank',click:()=>{
                        const source=root._lightflowAnimations?.find(a=>String(a.uuid||a.name)===id),existing=layerFor(root,id);
                        const looping=typeof existing?.loop==='boolean'?existing.loop:root.animation_loop_override?root.animation_loop:source?.loop==='loop';
                        const layers=(root.animation_layers||[]).filter(layer=>layer.id!==id).map(layer=>({...layer}));layers.push({...existing,id,loop:!looping});
                        edit(root,{animation_layers:layers},t("change_clip_loop"));updateAnimatedTree(root);
                    }},
                    '_',{name:t("playback_state"),icon:'play_circle',children:[
                        {name:t("play"),icon:'far.fa-play-circle',click:()=>setClipPlayback(root,id,false)},
                        {name:t("lock_current_pose"),icon:'fas.fa-lock',click:()=>setClipPlayback(root,id,true)}
                    ]}
                ]);
                activeAnimationMenu?.hide();activeAnimationMenu=menu;menu.open(anchor);
            };
            let offsetDialog=null;
            owned.push({delete(){offsetDialog?.delete();}});
            let activeAnimationMenu=null;
            owned.push({delete(){activeAnimationMenu?.hide();}});

            const openSource=async element=>{
                const root=rootOf(element),project=window.Project,reference=root?.source_link;
                if(!reference)return;
                try{
                    const file=await core.readLinkedFile(JSON.parse(reference),receiverBase(root._lightflowProject||project),paths,async path=>{
                        const key=core.canonicalPathKey(path,paths);
                        const existing=window.ModelProject?.all?.find(tab=>core.canonicalPathKey(tab.save_path,paths)===key);
                        return existing?{existing}:{text:await readFile(path)};
                    });
                    if(disposed||window.Project!==project||root.source_link!==reference||!root.mesh?.parent)return;
                    if(file.status!=='ready')throw new Error(file.message||file.status);
                    if(file.bytes.existing)file.bytes.existing.select();
                    else Codecs.project.load(core.parseBBModel(file.bytes.text),{path:file.path});
                }catch(error){
                    if(!disposed&&window.Project===project&&root.source_link===reference)Blockbench.showQuickMessage(t("could_not_open_source_project"));
                }
            };
            const importPath=async(path,automatic=false)=>{
                const targetProject=Project;
                const receiver=targetProject?.save_path||'';
                if(!targetProject)return;
                let source;
                try{source=core.makeLinkReference(path,receiver,paths).absoluteFallback;}
                catch(error){Blockbench.showMessageBox({title:t("cannot_link_this_scene"),message:error.message});return;}
                if(receiver&&core.canonicalPathKey(receiver,paths)===core.canonicalPathKey(source,paths)){
                    Blockbench.showMessageBox({title:t("choose_another_project"),message:t("a_project_cannot_contain_a_linked_instance_of_itself")});
                    return;
                }
                const base=receiverBase(targetProject);
                const link=core.makeLinkReference(source,base,paths);
                const result=await core.readLinkedSource(link,base,paths,{readFile,prepareModel:prepareSourceModel},hash);
                if(disposed||Project!==targetProject)return;
                if(result.status!=='ready'){
                    Blockbench.showMessageBox({title:t("cannot_link_this_scene"),message:result.message||statusText({_lightflowStatus:result.status})});
                    return;
                }
                if(!result.manifest.visualCount){
                    Blockbench.showMessageBox({title:t("no_supported_geometry"),message:t("choose_a_project_with_cubes_meshes_or_billboards_effects_and_loc")});
                    return;
                }
                const name=result.manifest.name||source.split('/').pop().replace(/\.bbmodel$/i,'');
                const hasCustomMaterials=result.model.elements?.some(item=>item.sa_material_instance_id);
                const addInstance=form=>{
                    if(disposed||Project!==targetProject)return false;
                    const geometry=form.geometry!==false&&!!(result.manifest.elementTypes.cube||result.manifest.elementTypes.mesh||result.manifest.elementTypes.texture_mesh),billboards=!!form.billboards&&!!result.manifest.elementTypes.billboard;
                    if(!geometry&&!billboards)return false;
                    Undo.initEdit({outliner:true,elements:[],selection:true});
                    const element=new SceneInstanceElement({name:form.name||name,source_link:JSON.stringify(link),include_geometry:geometry,include_billboards:billboards}).init();
                    element._lightflowProject=Project;element.addTo();element.select();
                    confirmedSources.set(element,{reference:element.source_link,path:result.path});
                    assetCache.set(result.cacheKey,result);mountResult(element,result);
                    Undo.finishEdit(t("add_linked_scene"),{outliner:true});return element;
                };
                if(automatic)return addInstance({name,geometry:true,billboards:true});
                importDialog?.delete?.();
                const checkboxRow=window.LightManagerUI?.formDesign?.checkboxRow || (options=>({type:'checkbox',...options}));
                const geometryCount=(result.manifest.elementTypes.cube||0)+(result.manifest.elementTypes.mesh||0)+(result.manifest.elementTypes.texture_mesh||0);
                const billboardCount=result.manifest.elementTypes.billboard||0;
                importDialog=new Dialog('lightflow_scene_link_import',{title:t("link_a_scene"),width:460,form:(window.LightManagerUI?.prepareForm || (form => form))({
                    summary:{type:'info',text:t("choose_what_this_instance_includes_textures_follow_the_selected")},
                    name:{type:'text',label:t("instance_name"),value:name},
                    geometry:checkboxRow({label:t("geometry"),supporting_text:t("cubes_and_meshes_from_the_source_project"),summary:geometryCount,value:true,condition:geometryCount>0}),
                    billboards:checkboxRow({label:'Billboards',supporting_text:t("sprite_elements_from_the_source_project"),summary:billboardCount,value:true,condition:billboardCount>0}),
                    skipped:{type:'info',condition:Object.keys(result.manifest.ignoredTypes).length>0,text:t("excluded_from_this_version")+Object.entries(result.manifest.ignoredTypes).map(([type,count])=>`${count} ${type}`).join(', ')+'.'},
                    animations:{type:'info',condition:result.manifest.animations.length>0,text:`${result.manifest.animations.length} ${t("source_animations_available_in_the_instance_inspector_group_tran")}`},
                    material_note:{type:'info',condition:hasCustomMaterials,text:t("source_material_overrides_are_preserved_receiver_overrides_take")},
                    file:{type:'info',text:source}
                }),onConfirm(form){
                    if(disposed||Project!==targetProject)return false;
                    const geometry=!!form.geometry&&!!(result.manifest.elementTypes.cube||result.manifest.elementTypes.mesh||result.manifest.elementTypes.texture_mesh),billboards=!!form.billboards&&!!result.manifest.elementTypes.billboard;
                    if(!geometry&&!billboards){Blockbench.showQuickMessage(t("select_geometry_or_billboards"));return false;}
                    addInstance(form);
                }});importDialog.show();
            };
            const chooseSource=(element=null)=>{
                const targetProject=window.Project,targets=Array.isArray(element)?element:element?[element]:[];
                const references=new Map(targets.map(target=>[target,target.source_link]));
                return Blockbench.import({extensions:['bbmodel'],type:t("blockbench_project"),resource_id:'lightflow_scene_link'},files=>{
                    const path=files?.[0]?.path;
                    if(!path||disposed||window.Project!==targetProject)return;
                    if(targets.length){
                        const current=targets.filter(target=>target.mesh?.parent&&target.source_link===references.get(target));
                        if(!current.length)return;
                        if(core.canonicalPathKey(targetProject?.save_path,paths)===core.canonicalPathKey(path,paths)){
                            Blockbench.showMessageBox({title:t("choose_another_project"),message:t("a_project_cannot_contain_a_linked_instance_of_itself")});
                            return;
                        }
                        const link=core.makeLinkReference(path,receiverBase(targetProject),paths);
                        Undo.initEdit({elements:current});
                        for(const target of current)target.extend({source_link:JSON.stringify(link)});
                        Undo.finishEdit(t('relink_scene'));
                        for(const target of current)refreshInstance(target,true);
                    }else importPath(path);
                });
            };
            let restoreSkinDialog=null;
            owned.push({delete(){restoreSkinDialog?.();}});
            const createSkinLink=()=>{
                const receiver=Project,native=Formats.skin?.setup_dialog;
                if(!receiver||!native||receiver.locked)return;
                restoreSkinDialog?.();
                const confirm=native.onConfirm,cancel=native.onCancel;
                const restore=()=>{native.onConfirm=confirm;native.onCancel=cancel;restoreSkinDialog=null;};
                restoreSkinDialog=restore;
                native.onCancel=function(){restore();receiver.select();};
                native.onConfirm=function(form){
                    if(form.model==='flat_texture'){Blockbench.showQuickMessage(t("choose_a_3d_skin_model"));return false;}
                    if(form.texture_source==='upload_texture'&&!form.texture_file){Blockbench.showQuickMessage(t("choose_a_skin_texture"));return false;}
                    restore();confirm.call(native,form);
                    const skin=Project;
                    if(skin===receiver||skin.format?.id!=='skin')return;
                    // Keep the new native project editable if saving is cancelled.
                    Vue.nextTick(async()=>{
                        // Uploaded and downloaded images must be decoded before embedding.
                        for(let attempt=0;attempt<600&&!disposed;attempt++){
                            if(Project!==skin)return;
                            const texture=skin.textures.find(texture=>texture.img?.complete&&texture.img.naturalWidth>0);
                            if(texture&&!Dialog.open)break;
                            if(attempt===599){Blockbench.showQuickMessage(t("load_a_skin_texture_before_saving_this_project"));return;}
                            await new Promise(resolve=>setTimeout(resolve,100));
                        }
                        if(disposed||Project!==skin)return;
                        Blockbench.export({resource_id:'model',type:Codecs.project.name,extensions:['bbmodel'],name:skin.name||'Skin',content:null,
                            custom_writer(_content,path){
                                if(disposed||Project!==skin)return;
                                if(receiver.save_path&&paths.normalize(path).toLowerCase()===paths.normalize(receiver.save_path).toLowerCase()){Blockbench.showQuickMessage(t("save_the_skin_separately_from_the_current_scene"));return;}
                                skin.save_path=path;skin.name=paths.normalize(path).split('/').pop().replace(/\.bbmodel$/i,'');
                                const content=Codecs.project.compile();
                                Blockbench.writeFile(path,{content},()=>{
                                    if(disposed)return;
                                    Codecs.project.afterSave(path);
                                    if(ModelProject.all.includes(receiver)){receiver.select();importPath(path,true);}
                                });
                            }
                        });
                    });
                };
                native.show();
            };
            const showSourcePicker=()=>{
                const current=Project?.save_path||'';
                // Native Recent keeps thumbnails in StartScreen's path-keyed map,
                // not on the recent-project records themselves.
                const start=window.StartScreen?.vue||document.getElementById('start_screen')?.__vue__;
                try{start?.updateThumbnails?.();}catch(_){}
                const thumbnailFor=project=>start?.thumbnails?.[project.save_path||project.path]||project.thumbnail||'';
                const candidates=new Map();
                for(const project of window.ModelProject?.all||[]){
                    const path=String(project.save_path||'');
                    if(/\.bbmodel$/i.test(path))candidates.set(paths.normalize(path).toLowerCase(),{path,name:project.name||path.split(/[\\/]/).pop(),open:true,self:paths.normalize(path).toLowerCase()===paths.normalize(current).toLowerCase(),thumbnail:thumbnailFor(project)});
                }
                for(const recent of typeof recent_projects!=='undefined'?recent_projects:[]){
                    const path=String(recent.path||'');
                    if(/\.bbmodel$/i.test(path)&&!candidates.has(paths.normalize(path).toLowerCase()))candidates.set(paths.normalize(path).toLowerCase(),{path,name:recent.name||path.split(/[\\/]/).pop(),open:false,self:paths.normalize(path).toLowerCase()===paths.normalize(current).toLowerCase(),thumbnail:thumbnailFor(recent)});
                }
                const projects=[...candidates.values()];
                pickerDialog?.delete?.();
                const picker=new Dialog('lightflow_scene_link_picker',{title:t("linked_scene"),width:740,buttons:[],component:{
                    data(){return {query:'',projects};},
                    computed:{visible(){const q=this.query.trim().toLowerCase();return this.projects.filter(project=>!q||`${project.name} ${project.path}`.toLowerCase().includes(q));}},
                    methods:{
                        choose(project){if(project.self)return;picker.hide();importPath(project.path);},
                        browse(){picker.hide();chooseSource();},
                        skin(){picker.hide();createSkinLink();},
                        close(){picker.hide();}
                    },
                    template:`<div class="lf-links-picker">
                        <header class="lf-links-picker-head"><div class="lf-links-picker-intro"><h2>${t("compose_with_a_linked_project")}</h2><p>${t("choose_a_blockbench_project_each_instance_has_its_own_position_a")}</p></div><button type="button" class="lf-links-browse" @click="browse"><i class="material-icons" aria-hidden="true">folder_open</i>${t("choose_bbmodel")}</button></header>
                        <div class="lf-links-picker-tools"><label class="lf-links-search"><i class="material-icons" aria-hidden="true">search</i><input v-model="query" type="search" :placeholder="'${t("find_a_project")}'" :aria-label="'${t("find_a_project")}'"></label><span class="lf-links-count" aria-live="polite">{{ visible.length }} {{ visible.length === 1 ? '${t("project")}' : '${t("projects")}' }}</span><button type="button" class="lf-links-skin" @click="skin"><i class="material-icons" aria-hidden="true">person_add</i>${t("create_skin")}</button></div>
                        <main class="lf-links-picker-scroll"><div v-if="visible.length" class="lf-links-grid"><button v-for="project in visible" :key="project.path" type="button" class="lf-links-card" :disabled="project.self" :title="project.path" @click="choose(project)"><div class="lf-links-cover"><img v-if="project.thumbnail" :src="project.thumbnail" @error="project.thumbnail=''" alt=""><div v-else class="lf-links-cover-fallback"><i class="material-icons" aria-hidden="true">view_in_ar</i></div></div><div class="lf-links-card-info"><div class="lf-links-card-heading"><strong>{{ project.name }}</strong><span class="lf-links-origin">{{ project.self ? '${t("current_scene")}' : project.open ? '${t("open")}' : '${t("recent")}' }}</span></div><small>{{ project.path }}</small></div><i v-if="!project.self" class="material-icons lf-links-card-arrow" aria-hidden="true">chevron_right</i></button></div><div v-else class="lf-links-empty"><i class="material-icons" aria-hidden="true">search_off</i><p>${t("no_matching_projects_choose_a_bbmodel_file_to_continue")}</p><button type="button" @click="browse">${t("choose_file")}</button></div></main>
                        <footer class="lf-links-picker-foot"><span>${t("the_source_remains_editable_in_its_own_tab")}</span><button type="button" @click="close">${t("close")}</button></footer>
                    </div>`
                }});
                pickerDialog=picker;picker.show();
            };
            const addAction=new Action('lightflow_scene_link_add',{name:'lightflow_links.add',icon:'kid_star',category:'edit',condition:()=>!!Project,click:showSourcePicker});
            const buildSkinPoseSnapshot=async(root,preset,data)=>{
                if(!isSkinRoot(root))throw Error(t('pose_source_changed'));
                const receiver=Project,reference=root.source_link,revision=root.source_revision,result=await readSource(root);
                if(disposed||Project!==receiver||OutlinerNode.uuids[root.uuid]!==root||root.source_link!==reference||root.source_revision!==revision)return null;
                if(result.status!=='ready'||result.model.meta?.model_format!=='skin')throw Error(t('pose_source_changed'));
                const posed=await prepareSourceModel({...result.model,skin_pose:'',skin_pose_data:data},preset);
                if(disposed||Project!==receiver||OutlinerNode.uuids[root.uuid]!==root||root.source_link!==reference||root.source_revision!==revision)return null;
                const desired=core.inspectBBModel(posed),targets=new Map(desired.groups.map(group=>[group.id,group])),groups={};
                for(const pose of treeFor(root).values()){
                    const target=targets.get(pose.source_group_id);if(!target)continue;
                    const parent=target.parentId?targets.get(target.parentId):null;
                    groups[pose.source_group_id]={position:target.origin.map((value,i)=>value-(parent?.origin[i]||0)),rotation:target.rotation.slice(),scale:(target.scale||[1,1,1]).slice()};
                }
                if(!Object.keys(groups).length)throw Error(t('pose_source_changed'));
                return core.normalizePoseSnapshot({version:1,groups});
            };
            const poseKeyContext=(root,keys=null)=>{
                if(disposed||!Modes.animate||!isSkinRoot(root)||!window.Format?.animation_mode)return null;
                const animation=Animation.selected;
                if(!animation||animation._lightflowSceneLinkClock){Blockbench.showQuickMessage(t('select_local_animation'));return null;}
                return {root,project:Project,animation,time:Timeline.snapTime(Timeline.time),keys};
            };
            const insertSkinPoseKeys=async(context,preset,data,name,mode='bones')=>{
                if(!context||disposed||!Modes.animate)return [];
                const {root,project,animation,time,keys}=context,snapshot=await buildSkinPoseSnapshot(root,preset,data);
                if(!snapshot||disposed||!Modes.animate||Project!==project||Animation.selected!==animation||OutlinerNode.uuids[root.uuid]!==root||!isSkinRoot(root))return [];
                if(!keys&&Math.abs(Timeline.snapTime(Timeline.time)-time)>1e-7)return [];
                if(keys&&!keys.every(key=>key.animator?.animation===animation&&key.animator[poseChannel]?.includes(key)))return [];
                const created=[];
                if(mode==='pose'){
                    const value={lightflow_pose_snapshot:snapshot,lightflow_pose_label:String(name||t('pose_channel'))};
                    const animator=animation.getBoneAnimator(root);animator.addToTimeline();
                    Undo.initEdit({keyframes:keys||created});
                    if(keys)for(const key of keys)key.extend(value);
                    else {
                        created.push(animator.createKeyframe(value,time,poseChannel,false,false));
                    }
                }else{
                    Animator.preview();
                    const requests=[];
                    for(const pose of treeFor(root).values()){
                        const target=snapshot.groups[pose.source_group_id],mesh=pose.mesh;if(!target||!mesh)continue;
                        const basePosition=mesh.fix_position||mesh.position,baseRotation=mesh.fix_rotation||mesh.rotation,baseScale=mesh.fix_scale||mesh.scale;
                        if(!animation.override&&baseScale.toArray().some((value,i)=>Math.abs(value)<1e-9&&target.scale[i]!==0))throw Error(t('pose_zero_scale'));
                        requests.push({pose,values:{position:target.position.map((value,i)=>value-basePosition.getComponent(i)),rotation:target.rotation.map((value,i)=>value-Math.radToDeg(baseRotation.toArray()[i])),scale:target.scale.map((value,i)=>animation.override?value:Math.abs(baseScale.getComponent(i))<1e-9?1:value/baseScale.getComponent(i))}});
                    }
                    if(!requests.length)return [];
                    for(const{pose}of requests)animation.getBoneAnimator(pose).addToTimeline(true);
                    Undo.initEdit({keyframes:created});
                    for(const{pose,values}of requests){const animator=animation.getBoneAnimator(pose);
                        for(const channel of ['position','rotation','scale']){const value=values[channel];created.push(animator.createKeyframe({x:value[0],y:value[1],z:value[2]},time,channel,false,false));}}
                }
                Undo.finishEdit(mode==='pose'?t('pose_keyframe'):t('pose_keyframes'));
                (keys?.[0]||created[0])?.select();TickUpdates.keyframe_selection=true;Animator.preview();
                return keys||created;
            };
            const chooseSkinPose=async(root,choose,event)=>{
                const position=event?.currentTarget?.isConnected?event.currentTarget:Number.isFinite(event?.clientX)?{clientX:event.clientX,clientY:event.clientY}:'mouse';
                const receiver=Project,reference=root.source_link,library=window.LightflowSkinPoses,result=await readSource(root);
                if(disposed||!Modes.animate||Project!==receiver||OutlinerNode.uuids[root.uuid]!==root||root.source_link!==reference||!isSkinRoot(root))return;
                const items=[new MenuSeparator('lightflow_pose_presets',t('skin_pose')),
                    ...['none','natural','walking','crouching','sitting','jumping','aiming'].map(id=>({id:'preset_'+id,name:tl('panel.skin_pose.'+id),icon:'accessibility_new',click:()=>choose(id,undefined,tl('panel.skin_pose.'+id))}))];
                const saved=StateMemory.get('skin_poses')||[];
                if(saved.length)items.push(new MenuSeparator('lightflow_pose_global',t('saved_poses')),...saved.map((pose,index)=>({id:'global_'+index,name:pose.name,icon:'accessibility',click:()=>choose(undefined,JSON.parse(JSON.stringify(pose.data)),pose.name)})));
                if(library){
                    const append=(model,prefix)=>{const entries=library.menuItems(model,(data,pose)=>choose(undefined,data,pose?.name||t('pose_channel')));
                        items.push(...entries.map(item=>item instanceof MenuSeparator?new MenuSeparator(prefix+'_'+item.id,prefix+' · '+item.label):{...item,id:prefix+'_'+item.id}));};
                    append(receiver,t('project_skin_poses'));if(result.status==='ready')append(result.model,t('source_skin_poses').replace(/…$/,''));
                }
                const menu=library?.openMenu?library.openMenu(items,position):new Menu(items,{searchable:true}).open(position);
                skinLibraryMenus.clear();skinLibraryMenus.add(menu);
            };
            const runPosePicker=(context,mode,event)=>{
                if(!context)return;
                const report=error=>{if(!disposed&&Project===context.project)Blockbench.showMessageBox({title:t('cannot_apply_pose'),message:String(error.message||error)});};
                chooseSkinPose(context.root,(preset,data,name)=>insertSkinPoseKeys(context,preset,data,name,mode).catch(report),event).catch(report);
            };
            const poseKeysAction=new Action('lightflow_scene_link_pose_keys',{name:t('pose_keyframes'),icon:'key',condition:()=>!!Modes.animate&&!!window.Format?.animation_mode&&isSkinRoot(rootOf(selected())),click:event=>runPosePicker(poseKeyContext(rootOf(selected())),'bones',event)});
            const poseTrackAction=new Action('lightflow_scene_link_pose_track',{name:t('pose_keyframe'),icon:'add',condition:()=>!!Modes.animate&&!!window.Format?.animation_mode&&isSkinRoot(rootOf(selected())),click:event=>runPosePicker(poseKeyContext(rootOf(selected())),'pose',event)});
            const selectedPoseKeys=()=>disposed?[]:Timeline.selected.filter(key=>key.channel===poseChannel&&isSkinRoot(rootOf(key.animator?.getGroup?.())));
            const keyPoseAction=new Action('lightflow_scene_link_key_pose',{name:t('choose_key_pose'),icon:'accessibility',condition:()=>!!Modes.animate&&selectedPoseKeys().length>0,click:event=>{
                const keys=selectedPoseKeys(),root=keys[0]?.animator?.getGroup();if(!root||!keys.every(key=>key.animator.getGroup()===root))return;
                runPosePicker(poseKeyContext(root,keys),'pose',event);
            }});
            owned.push(poseKeysAction,poseTrackAction,keyPoseAction);
            const keyMenu=Keyframe.prototype.menu;
            keyMenu.addAction(keyPoseAction);
            owned.push({delete(){keyMenu.removeAction(keyPoseAction);}});
            // Extend the existing Keyframe inspector, alongside other custom animated properties.
            const keyframeVue=window.Panels?.keyframe?.inside_vue;
            const originalKeyframeRender=keyframeVue?.$options?.render;
            const PoseKeyControl={
                name:'lightflow-pose-key-control',props:['keyframes'],
                computed:{
                    sameRoot(){return this.keyframes.every(key=>key.animator?.getGroup?.()===this.keyframes[0]?.animator?.getGroup?.());},
                    label(){const keys=this.keyframes;return keys.every(key=>key.lightflow_pose_label===keys[0]?.lightflow_pose_label)?keys[0]?.lightflow_pose_label||t('pose_channel'):t('multiple_poses');}
                },
                methods:{
                    choose(event){if(this.sameRoot)keyPoseAction.click(event);},
                    keyboard(event){if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();this.choose(event);}}
                },
                render(h){return h('div',{class:'lf-links-pose-key-properties'},[
                    h('div',{class:'lf-links-pose-key-row'},[
                        h('label',{attrs:{for:'lightflow_keyframe_pose'}},t('pose_channel')),
                        h('div',{class:'bb-select',attrs:{id:'lightflow_keyframe_pose',role:'button',tabindex:this.sameRoot?0:-1,'aria-disabled':!this.sameRoot,'aria-haspopup':'menu','aria-label':t('choose_key_pose'),title:this.label},on:{click:this.choose,keydown:this.keyboard}},[this.label])
                    ])
                ]);}
            };
            if(typeof originalKeyframeRender==='function'){
                const render=function(...args){
                    const tree=originalKeyframeRender.apply(this,args);
                    if(disposed||!Modes.animate||this.channel!==poseChannel||!this.keyframes.length||!this.keyframes.every(key=>key.channel===poseChannel&&isSkinRoot(key.animator?.getGroup?.())))return tree;
                    // Pose values are names/snapshots; retain Blockbench's interpolation toolbar.
                    const hideValues=node=>{if(node?.data?.staticClass==='keyframe_data_point')node.children=[];else node?.children?.forEach(hideValues);};hideValues(tree);
                    tree.children||=[];
                    tree.children.push(this.$createElement(PoseKeyControl,{key:'lightflow_pose_properties',props:{keyframes:this.keyframes}}));
                    return tree;
                };
                keyframeVue.$options.render=render;keyframeVue.$forceUpdate();
                owned.push({delete(){if(keyframeVue.$options.render===render)keyframeVue.$options.render=originalKeyframeRender;keyframeVue.$forceUpdate();}});
            }
            function updatePoseKeyPanel(){if(!disposed)keyframeVue?.$forceUpdate();}
            owned.push(Blockbench.on('update_keyframe_selection',updatePoseKeyPanel));
            owned.push(Blockbench.addCSS('#panel_keyframe .lf-links-pose-key-properties{padding:3px 8px}#panel_keyframe .lf-links-pose-key-row{display:flex;align-items:center;gap:7px;margin:4px 0;min-width:0}#panel_keyframe .lf-links-pose-key-row>label{flex:0 0 80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--color-subtle_text)}#panel_keyframe .lf-links-pose-key-row>.bb-select{flex:1;min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#panel_keyframe .lf-links-pose-key-row>.bb-select:focus-visible{outline:1px solid var(--color-accent)}'));
            const applySkinPose=async(root,preset,data)=>{
                if(!root||root._lightflowManifest?.format!=='skin')return;
                const receiver=Project,result=await readSource(root);
                if(result.status!=='ready'||disposed||Project!==receiver)return;
                const posed=await prepareSourceModel({...result.model,skin_pose:'',skin_pose_data:data},preset);
                if(disposed||Project!==receiver||OutlinerNode.uuids[root.uuid]!==root)return;
                const desired=core.inspectBBModel(posed),targets=new Map(desired.groups.map(group=>[group.id,group]));
                const poses=[...treeFor(root).values()];
                Undo.initEdit({elements:poses});
                for(const pose of poses){
                    const target=targets.get(pose.source_group_id);if(!target)continue;
                    const parent=pose.parent?.type==='lightflow_pose_group'?recordFor(pose.parent):null;
                    const targetParent=target.parentId?targets.get(target.parentId):null;
                    pose.extend({pose_mode:'absolute',position:target.origin.map((value,i)=>value-(targetParent?.origin[i]||0)+(parent?.origin[i]||0)),rotation:target.rotation,scale:target.scale});
                    pose.preview_controller.updateTransform(pose);
                }
                Undo.finishEdit(t("apply_skin_pose"));
                updateOutline();syncPanel();window.updateSelection?.();
            };
            const skinPoseAction=new Action('lightflow_scene_link_skin_pose',{
                name:t("skin_pose"),icon:'accessibility_new',category:'edit',
                condition:()=>rootOf(selected())?._lightflowManifest?.format==='skin',
                children(){
                    const root=rootOf(selected());
                    const apply=(preset,data)=>applySkinPose(root,preset,data).catch(error=>{if(!disposed)Blockbench.showMessageBox({title:t("cannot_apply_pose"),message:String(error.message||error)});});
                    const items=['none','natural','walking','crouching','sitting','jumping','aiming'].map(id=>({name:tl('panel.skin_pose.'+id),icon:'accessibility_new',click:()=>apply(id)}));
                    const saved=StateMemory.get('skin_poses')||[];
                    if(saved.length)items.push('_',{name:t("saved_poses"),icon:'format_list_bulleted',children:saved.map(pose=>({name:pose.name,icon:'accessibility',click:()=>apply(undefined,JSON.parse(JSON.stringify(pose.data)))}))});
                    const library=window.LightflowSkinPoses;
                    if(library){
                        const receiver=Project;
                        const applySaved=data=>{if(!disposed&&Project===receiver&&OutlinerNode.uuids[root.uuid]===root)apply(undefined,data);};
                        let projectPoses=[];
                        try{projectPoses=library.menuItems(receiver,applySaved);}
                        catch(error){items.push({name:t("cannot_apply_pose"),icon:'error',click:()=>{if(!disposed)Blockbench.showMessageBox({title:t("cannot_apply_pose"),message:String(error.message||error)});}});}
                        if(projectPoses.length)items.push({name:t("project_skin_poses"),icon:'format_list_bulleted',click:(context,event)=>{
                            if(!disposed&&Project===receiver&&OutlinerNode.uuids[root.uuid]===root&&window.LightflowSkinPoses===library){
                                const menu=library.openMenu(projectPoses,Number.isFinite(event?.clientX)?{clientX:event.clientX,clientY:event.clientY}:'mouse');
                                if(menu){skinLibraryMenus.clear();skinLibraryMenus.add(menu);}
                            }
                        }});
                        items.push({name:t("source_skin_poses"),icon:'folder_open',click:async(context,event)=>{
                            const position=Number.isFinite(event?.clientX)&&Number.isFinite(event?.clientY)?{clientX:event.clientX,clientY:event.clientY}:'mouse';
                            try{
                                const result=await readSource(root);
                                if(disposed||Project!==receiver||OutlinerNode.uuids[root.uuid]!==root||window.LightflowSkinPoses!==library)return;
                                if(result.status!=='ready')throw Error(result.message||t("cannot_apply_pose"));
                                const entries=library.menuItems(result.model,applySaved);
                                if(!entries.length){Blockbench.showQuickMessage(t("source_skin_poses_empty"));return;}
                                const menu=library.openMenu(entries,position);if(menu){skinLibraryMenus.clear();skinLibraryMenus.add(menu);}
                            }catch(error){if(!disposed&&Project===receiver&&OutlinerNode.uuids[root.uuid]===root&&window.LightflowSkinPoses===library)Blockbench.showMessageBox({title:t("cannot_apply_pose"),message:String(error.message||error)});}
                        }});
                    }
                    items.push('_',{name:t("restore_source_pose"),icon:'restart_alt',click:()=>{
                        const poses=[...treeFor(root).values()];Undo.initEdit({elements:poses});
                        for(const pose of poses){pose.extend({pose_mode:'additive',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});pose.preview_controller.updateTransform(pose);}
                        Undo.finishEdit(t("restore_source_pose"));updateOutline();syncPanel();window.updateSelection?.();
                    }});return items;
                }
            });
            const skinLibraryMenus=new Set();
            owned.push({delete(){for(const menu of skinLibraryMenus)if(Menu.open===menu)menu.hide();skinLibraryMenus.clear();}});
            owned.push(skinPoseAction);
            const openAction=new Action('lightflow_scene_link_open',{name:'lightflow_links.open',icon:'open_in_new',category:'edit',condition:()=>!!rootOf(selected()),click:()=>openSource(selected())});
            const refreshAction=new Action('lightflow_scene_link_refresh',{name:'lightflow_links.refresh',icon:'sync',category:'edit',condition:()=>!!rootOf(selected()),click:()=>refreshInstance(rootOf(selected()),true)});
            const relocateAction=new Action('lightflow_scene_link_relocate',{name:'lightflow_links.relocate',icon:'folder_open',category:'edit',condition:()=>!!rootOf(selected()),click:()=>chooseSource(rootOf(selected()))});
            const resetAction=new Action('lightflow_scene_link_reset_pose',{name:'lightflow_links.reset',icon:'restart_alt',category:'edit',condition:()=>selected()?.type==='lightflow_pose_group',click:()=>edit(selected(),{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},t("reset_local_pose"))});
            const inspectAction=new Action('lightflow_scene_link_inspect',{name:t("instance_settings"),icon:'kid_star',category:'edit',condition:()=>!!rootOf(selected()),click:()=>{arrangeInspector();syncPanel();inspector?.getHostPanel?.()?.selectTab?.(inspector);}});
            const materialAction=new Action('lightflow_scene_link_material',{name:t("material_override"),icon:'palette',condition:()=>!!rootOf(selected()),click:event=>{
                const node=selected(),manager=window.MaterialManager;if(!node||!manager)return;
                const assign=id=>{edit(node,{lightflow_material_override:id},t("override_linked_material"));refreshLinkedMaterials();syncPanel();};
                const presets = Object.values(manager.materials||{});
                for(const id of ['toon_outline_classic','toon_outline_lightflow']){
                    const preset=manager.materials?.[id];
                    if(preset&&!presets.includes(preset))presets.push(preset);
                }
                new Menu([
                    {name:t("inherit_material"),icon:node.lightflow_material_override?'radio_button_unchecked':'radio_button_checked',click:()=>assign('')},
                    '_',
                    ...Object.values(manager.instances||{}).map(instance=>({name:instance.name||instance.id,icon:node.lightflow_material_override===instance.id?'radio_button_checked':instance.icon||'palette',click:()=>assign(instance.id)})),
                    '_',
                    ...presets.map(material=>({name:material.name||material.id,icon:node.lightflow_material_override===material.id?'radio_button_checked':material.icon||'palette',click:()=>assign(material.id)}))
                ]).open(event);
            }});
            owned.push(materialAction);
            owned.push(addAction,openAction,refreshAction,relocateAction,resetAction,inspectAction);
            MenuBar.addAction(addAction,'tools');
            let exportingBundle=false;
            const exportBundleAction=new Action('lightflow_scene_link_export_bundle',{
                name:'lightflow_links.export_bundle',icon:'folder_zip',category:'file',
                condition:()=>!exportingBundle&&!!window.Project?.elements?.some(node=>node.type==='lightflow_scene_instance'&&node.source_link),
                async click(){
                    if(disposed||exportingBundle||!window.Project)return;
                    const project=window.Project,spanish=String(window.Language?.code||window.settings?.language?.value||'en').startsWith('es');
                    const title=tl('lightflow_links.export_bundle');
                    const checkActive=()=>{if(disposed)throw new Error('Scene Links unloaded');};
                    exportingBundle=true;
                    try{
                        if(typeof JSZip!=='function')throw new Error(spanish?'Blockbench no tiene disponible la compresión ZIP.':'ZIP compression is unavailable in this Blockbench build.');
                        Blockbench.showQuickMessage(spanish?'Preparando el ZIP de la escena…':'Preparing scene ZIP…');
                        const model=Codecs.project.compile({raw:true,bitmaps:true});
                        const bundle=await core.buildSceneBundle(model,project.save_path,project.name,paths,{
                            readProject:readFile,readAsset:path=>readFile(path,'buffer'),prepareModel:prepareSourceModel,checkActive
                        });
                        const zip=new JSZip();
                        for(const [file,content] of bundle.entries)zip.file(file,content);
                        const content=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
                        checkActive();
                        Blockbench.export({resource_id:'lightflow_scene_bundle',type:'ZIP',extensions:['zip'],
                            name:bundle.root.replace(/\.bbmodel$/i,''),savetype:'zip',content},()=>{
                            if(!disposed)Blockbench.showQuickMessage(spanish?'Paquete de escena exportado.':'Scene package exported.');
                        });
                    }catch(error){
                        if(!disposed)Blockbench.showMessageBox({title,icon:'error_outline',message:
                            (spanish?'No se pudo incluir este archivo o vínculo.':'Could not include this file or link.')
                            +'\n\n'+String(error.message).replace(/[`<>]/g,'')});
                    }finally{exportingBundle=false;}
                }
            });
            owned.push(exportBundleAction);
            MenuBar.addAction(exportBundleAction,'file.export');
            let injectedSceneControl=null;
            const refreshSceneCreate=()=>{
                if(disposed)return;
                const form=Panels.lightflow_scene?.form;
                if(!form?.form_config)return;
                if(!form.form_config._scene_link){
                    injectedSceneControl={type:'action_button',semantic_button:true,text:tl('lightflow_links.add'),icon:'kid_star',background:'var(--color-button)',click:()=>showSourcePicker()};
                    form.form_config._scene_link=injectedSceneControl;
                }
                form.form_config._scene_link.text=tl('lightflow_links.add');
                form.buildForm();
            };
            setTimeout(refreshSceneCreate,0);
            SceneInstanceElement.prototype.menu=new Menu(['lightflow_scene_link_inspect','lightflow_scene_link_skin_pose','lightflow_scene_link_pose_keys','lightflow_scene_link_pose_track','lightflow_scene_link_material','lightflow_scene_link_refresh','lightflow_scene_link_open','lightflow_scene_link_relocate','set_element_marker_color','_',...Outliner.control_menu_group,'_','rename','delete']);
            ScenePoseElement.prototype.menu=new Menu(['lightflow_scene_link_inspect','lightflow_scene_link_skin_pose','lightflow_scene_link_pose_keys','lightflow_scene_link_pose_track','lightflow_scene_link_material','lightflow_scene_link_reset_pose','lightflow_scene_link_open','_',...Outliner.control_menu_group,'_','rename','delete']);

            const inspectorFields=[
                {key:'position',icon:'open_with',label:t("position"),poseLabel:t("offset"),step:.25,reset:0},
                {key:'rotation',icon:'sync',label:t("rotation"),poseLabel:t("rotation"),step:1,reset:0},
                {key:'scale',icon:'aspect_ratio',label:t("scale"),poseLabel:t("scale"),step:.1,reset:1}
            ];
            // Embed Light Manager's real custom_vector/NumSlider control inside
            // the Vue inspector. The form owns its native DOM; Vue only owns the
            // mount point, model identity and the edit transaction.
            const sceneVectorComponent={
                props:['field','value','elementId'],
                template:'<div class="lf-links-shared-vector" ref="host"></div>',
                methods:{
                    currentElement(){const element=selected();return !disposed&&Project===this._vectorProject&&element?.uuid===this.elementId?element:null;},
                    beginEdit(){
                        if(this._vectorEdit||!this.currentElement())return;
                        const element=this.currentElement();
                        Undo.initEdit({elements:[element]});
                        this._vectorEdit={element,changed:false};
                    },
                    changeVector({result,changed_keys}){
                        if(changed_keys?.length&&!changed_keys.includes(this.field.key))return;
                        const element=this.currentElement(),next=result?.[this.field.key];
                        if(!element||!Array.isArray(next)||next.length!==3||!next.every(Number.isFinite))return;
                        if(next.every((value,index)=>value===element[this.field.key][index]))return;
                        const single=!this._vectorEdit;
                        if(single)this.beginEdit();
                        if(!this._vectorEdit)return;
                        element.extend({[this.field.key]:next.slice()});
                        element.preview_controller?.updateTransform?.(element);
                        window.ShaderEngine?.requestPreviewRender?.({cause:'scene_link_edit'});
                        this._vectorEdit.changed=true;
                        if(single)this.finishEdit();
                    },
                    finishEdit(){
                        const transaction=this._vectorEdit;
                        if(!transaction)return;
                        this._vectorEdit=null;
                        if(transaction.changed)Undo.finishEdit(t("edit_linked_transform"));
                        else Undo.cancelEdit(false);
                        if(!disposed&&Project===this._vectorProject)syncPanel();
                    },
                    syncValue(value){
                        if(this._vectorEdit||!this._vectorForm)return;
                        const control=this._vectorForm.form_data[this.field.key];
                        if(!control||!Array.isArray(value)||value.length!==3)return;
                        if(control.getValue().some((number,index)=>number!==value[index]))control.setValue(value.slice(),false);
                    },
                    disposeForm(){
                        this.finishEdit();
                        const form=this._vectorForm;
                        this._vectorForm=null;
                        if(this._vectorListener?.delete)this._vectorListener.delete();
                        else if(typeof this._vectorListener==='function')this._vectorListener();
                        else form?.removeListener?.('change',this._vectorCallback);
                        this._vectorListener=null;this._vectorCallback=null;
                        if(!form)return;
                        if(typeof form.delete==='function')form.delete();
                        else for(const control of Object.values(form.form_data)){
                            control.native_vector_sliders?.forEach(slider=>slider.delete?.());
                            control.numberEditors?.forEach(editor=>editor.dispose?.());
                        }
                        form.node.remove();
                    }
                },
                watch:{value:{handler(next){this.syncValue(next);},deep:true}},
                mounted(){
                    this._vectorProject=Project;
                    const key=this.field.key;
                    const form=new InputForm((window.LightManagerUI?.prepareForm||((config)=>config))({
                        [key]:window.LightManagerUI.formDesign.vector({
                            label:false,hide_header:true,resettable:false,axis_labels:true,dimensions:3,
                            value:this.value.slice(),default:[this.field.reset,this.field.reset,this.field.reset],
                            step:this.field.step,onBefore:()=>this.beginEdit(),onAfter:()=>this.finishEdit()
                        })
                    }));
                    // Blockbench applies Form's own 6px padding with a higher
                    // cascade layer priority than plugin CSS; remove it only
                    // for this embedded, already-titled 28px vector.
                    form.node.style.setProperty('padding','0px','important');
                    this._vectorForm=form;
                    this._vectorCallback=event=>this.changeVector(event);
                    this._vectorListener=form.on('change',this._vectorCallback);
                    const vector=form.form_data[key];
                    vector.inputs_container.style.height='28px';
                    Array.from(vector.inputs_container.children).forEach((row,index)=>{
                        const axis=row.querySelector(':scope > span');
                        if(axis)axis.style.color='var(--color-axis-'+['x','y','z'][index]+')';
                    });
                    for(const slider of vector.native_vector_sliders||[]){
                        slider.node.style.height='28px';
                        slider.node.style.borderRadius='8px';
                        slider.jq_inner.css({'justify-content':'center','text-align':'center'});
                        // Scene Links previously rejected blank/non-numeric XYZ
                        // edits. Blockbench's NumSlider otherwise converts blank
                        // text (or invalid pasted vector parts) to zero.
                        const stopInput=slider.stopInput;
                        slider.stopInput=function(...args){
                            if(this.jq_inner.hasClass('editing')){
                                const raw=this.jq_inner.text().trim().replace(/,(?=\d+$)/,'.');
                                const parts=raw.split(/\s+/);
                                const numeric=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
                                if(![1,3].includes(parts.length)||!parts.every(part=>numeric.test(part)&&Number.isFinite(Number(part)))){
                                    this.jq_inner.text(String(this.value));
                                }
                            }
                            return stopInput.apply(this,args);
                        };
                    }
                    this.$refs.host.append(form.node);
                },
                beforeDestroy(){this.disposeForm();}
            };
            inspector=new Panel('lightflow_scene_links_inspector',{name:t("scene_links"),icon:'kid_star',growable:true,resizable:true,
                condition:{modes:['edit','render'],project:true},default_position:{slot:'right_bar',height:350,folded:false,attached_to:'transform',attached_index:1},
                component:{
                    components:{'lf-scene-vector':sceneVectorComponent},
                    data(){return {currentId:'',rootId:'',name:'',rootName:'',pose:false,renderMode:false,sharedVectors:false,status:'',statusKey:'ready',path:'',file:'',poseMode:'additive',modified:0,stats:null,materialLimit:false,hasTextureChoice:false,textureLabel:'',textureMenuOpen:false,hasSecondarySkinLayer:false,secondarySkinLayer:false,animations:[],animationId:'',playing:false,playbackTime:0,animationLength:0,loop:false,values:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},fields:inspectorFields};},
                    methods:{
                        syncSelection(){
                            const element=selected(),root=rootOf(element);
                            if(this.currentId!==element?.uuid||this._textureMenuProject!==Project)this.closeTextureMenu();
                            this.sharedVectors=typeof InputForm!=='undefined'&&typeof FormElement!=='undefined'&&!!FormElement.types?.custom_vector&&!!window.LightManagerUI?.formDesign?.vector;
                            this.currentId=element?.uuid||'';this.rootId=root?.uuid||'';this.pose=element?.type==='lightflow_pose_group';this.renderMode=!!Modes.render;
                            this.name=element?.name||'';this.rootName=root?.name||'';this.status=root?statusText(root):'';this.statusKey=root?._lightflowStatus||'ready';
                            this.path=root?sourcePath(root):'';this.file=this.path.split(/[\\/]/).pop()||t("source_unavailable");
                            this.poseMode=this.pose?element.pose_mode||'additive':'additive';
                            this.values={position:element?.position?.slice()||[0,0,0],rotation:element?.rotation?.slice()||[0,0,0],scale:element?.scale?.slice()||[1,1,1]};
                            this.stats=root?._lightflowManifest||null;this.materialLimit=!!root?._lightflowMaterialLimit;
                            const resources=activeMounts.get(root);
                            this.hasSecondarySkinLayer=!!resources?.hasSecondarySkinLayer&&root.include_geometry!==false;
                            this.secondarySkinLayer=root?.secondary_skin_layer===true;
                            this.hasTextureChoice=!!resources?.hasDefaultTextureFaces&&root.include_geometry!==false;
                            this.textureLabel=instanceTexture(root,resources)?.name||
                                t(root?.texture_override?'missing_instance_texture':'source_default_texture');
                            this.animations=this.stats?.animations||[];this.animationId=root?.animation_id||'';this.loop=!!root?.animation_loop;this.animationLength=Number(animationFor(root)?.length)||0;this.syncPlayback();
                            let count=0;
                            root?.forEachChild?.(child=>{if(child.type==='lightflow_pose_group'&&(child.pose_mode==='absolute'||child.position?.some(v=>v!==0)||child.rotation?.some(v=>v!==0)||child.scale?.some(v=>v!==1)))count++;});
                            this.modified=count;
                        },
                        closeTextureMenu(){
                            if(this._textureMenu?.node.isConnected)this._textureMenu.hide();
                        },
                        toggleSecondarySkinLayer(event){
                            const element=selected();
                            if(element?.uuid!==this.rootId||!this.hasSecondarySkinLayer)return;
                            edit(element,{secondary_skin_layer:event.target.checked},t('toggle_skin_layer'));
                        },
                        openTextureMenu(event){
                            const element=selected(),project=Project,anchor=event.currentTarget;
                            if(element?.type!=='lightflow_scene_instance'||!this.hasTextureChoice)return;
                            if(this.textureMenuOpen){this.closeTextureMenu();return;}
                            const resources=activeMounts.get(element);
                            const sourceTextures=resources?.result.model.textures||[];
                            const choose=id=>{
                                if(disposed||Project!==project||selected()!==element||!anchor.isConnected||
                                    activeMounts.get(element)!==resources||
                                    (id.startsWith('project:')&&!project.textures.some(texture=>'project:'+texture.uuid===id)))return;
                                anchor.focus();
                                if(id===element.texture_override)return;
                                Undo.initEdit({elements:[element]});
                                element.extend({texture_override:id});
                                syncInstanceTexture(element);
                                Undo.finishEdit(t('change_instance_texture'));
                                syncPanel();
                            };
                            const items=[{id:'source_default',name:t('source_default_texture'),icon:'image',click:()=>choose('')}];
                            if(sourceTextures.length)items.push(new MenuSeparator('linked_project',t('linked_project_textures')));
                            for(const [index,texture] of sourceTextures.entries()){
                                const id=sourceTextureId(texture,index),url=getTextureSource(texture,resources.result.path);
                                const icon=document.createElement('img');
                                icon.className='icon';
                                if(url)icon.src=url;
                                items.push({id,name:texture.name||texture.id||String(index+1),description:texture.path,icon:url?icon:'texture',click:()=>choose(id)});
                            }
                            if(project.textures?.length)items.push(new MenuSeparator('current_project',t('current_project_textures')));
                            for(const texture of project.textures||[]){
                                const id='project:'+texture.uuid;
                                const icon=texture.img?.cloneNode(false);
                                if(icon)icon.className='icon';
                                items.push({id,name:texture.name,description:texture.path,icon:icon?.src?icon:'texture',click:()=>choose(id)});
                            }
                            const current=items.find(item=>item.id===(element.texture_override||'source_default'));
                            if(current)current.marked=true;
                            const search=window.LightManagerUI?.searchMenu;
                            const menu=new Menu('lightflow_scene_link_texture',items,{searchable:!search,onClose:()=>{
                                this.textureMenuOpen=false;
                                this._textureMenu=null;
                            }});
                            this._textureMenu=menu;this._textureMenuProject=project;
                            // Cap the list before opening so Blockbench never installs
                            // its wheel handler for moving an oversized context menu.
                            menu.node.classList.add('lf-links-texture-menu');
                            menu.node.style.maxHeight='min(420px, calc(100vh - 56px))';
                            menu.node.style.width='min(280px, calc(100vw - 16px))';
                            menu.open(anchor);
                            this.textureMenuOpen=true;
                            search?.(menu,Object.fromEntries(items.filter(item=>item.id).map(item=>[item.id,item])),anchor,{labeledSections:true,descriptions:true});
                        },
                        syncPlayback(){const root=OutlinerNode.uuids?.[this.rootId];this.playbackTime=animationTime(root);this.playing=!!root?._lightflowPlaying;},
                        chooseAnimation(event){setAnimation(selected(),event.target.value);},
                        play(){togglePlayback(selected());},
                        scrub(event){setAnimationTime(selected(),event.target.value);},
                        previewTime(event){const root=rootOf(selected());if(!root)return;root._lightflowPlaying=false;root._lightflowTime=Number(event.target.value)||0;updateAnimatedTree(root);this.syncPlayback();},
                        toggleLoop(){const root=rootOf(selected());if(root)edit(root,{animation_loop:!root.animation_loop},t("change_linked_animation_loop"));},
                        commitAxis(event,key,axis){
                            const element=selected();if(!element||element.uuid!==this.currentId)return;
                            const value=Number(event.target.value);if(!event.target.value.trim()||!Number.isFinite(value)){event.target.value=this.values[key][axis];return;}
                            if(value===element[key][axis])return;
                            const next=element[key].slice();next[axis]=value;
                            edit(element,{[key]:next},t("edit_linked_transform"));
                        },
                        resetField(field){const element=selected();if(element?.uuid!==this.currentId)return;edit(element,{[field.key]:[field.reset,field.reset,field.reset]},t("reset_linked_transform"));},
                        cancelAxis(event,key,axis){event.target.value=this.values[key][axis];event.target.blur();},
                        setPoseMode(mode){const element=selected();if(element?.type==='lightflow_pose_group'&&element.pose_mode!==mode)edit(element,{pose_mode:mode},t("change_pose_mode"));},
                        selectRoot(){const root=OutlinerNode.uuids[this.rootId];root?.clickSelect?.();if(root&&!root.selected)root.select();},
                        openSource(){openAction.trigger();},refresh(){refreshAction.trigger();},relink(){relocateAction.trigger();},resetPose(){resetAction.trigger();},add(){showSourcePicker();}
                    },
                    mounted(){this.syncSelection();},
                    beforeDestroy(){this.closeTextureMenu();},
                    template:`<div class="lf-links-inspector">
                        <div v-if="!currentId" class="lf-links-inspector-empty"><i class="material-icons">kid_star</i><strong>${t("build_a_scene_with_linked_projects")}</strong><p>${t("choose_an_instance_in_the_outliner_to_place_it_or_open_a_group_t")}</p><button type="button" @click="add"><i class="material-icons">add</i>${t("add_linked_scene")}</button></div>
                        <template v-else>
                            <div class="lf-links-inspector-head">
                                <button v-if="pose" type="button" class="lf-links-back" @click="selectRoot" :title="rootName" :aria-label="'${t("select_instance")}'"><i class="material-icons">arrow_back</i></button>
                                <i v-else class="material-icons lf-links-head-icon">kid_star</i>
                                <div class="lf-links-title"><strong :title="name">{{ name }}</strong></div>
                                <span v-if="!pose" class="lf-links-status" :class="'lf-links-status-'+statusKey"><span class="lf-links-status-dot"></span>{{ status }}</span>
                                <button v-else type="button" class="lf-links-icon-action" @click="resetPose" :title="'${t("reset_group_pose")}'" :aria-label="'${t("reset_group_pose")}'"><i class="material-icons">restart_alt</i></button>
                            </div>
                            <div v-if="!pose" class="lf-links-source-card">
                                <div class="lf-links-source-title"><i class="material-icons">description</i><span :title="path+(stats ? ' · '+stats.groups.length+' ${t("groups")}, '+stats.elements.length+' ${t("elements")}, '+stats.textures.length+' ${t("textures")}' : '')">{{ file }}</span><span v-if="materialLimit" class="lf-links-material-badge" :title="'${t("source_material_overrides_are_not_linked_yet")}'">${t("textures_only")}</span></div>
                                <div class="lf-links-source-actions" role="group" aria-label="${t("source_actions")}">
                                    <button type="button" class="lf-links-source-update" :class="{pending:statusKey==='changed'}" @click="refresh" :disabled="statusKey==='updating'" :title="'${t("read_the_latest_saved_source")}'" aria-label="${t("update")}"><i class="material-icons">sync</i><span>${t("update")}</span></button>
                                    <button type="button" class="lf-links-icon-action" @click="openSource" :title="'${t("edit_the_source_project")}'" aria-label="${t("open_2")}"><i class="material-icons">open_in_new</i></button>
                                    <button type="button" class="lf-links-icon-action" @click="relink" :title="'${t("find_a_moved_source")}'" aria-label="${t("find")}"><i class="material-icons">folder_open</i></button>
                                </div>
                            </div>
                            <button v-if="!pose && hasTextureChoice" type="button" class="lf-links-texture-choice" aria-haspopup="menu" :aria-expanded="String(textureMenuOpen)" :aria-label="'${t("instance_texture")} · '+textureLabel" :title="'${t("instance_texture")} · '+textureLabel" @click="openTextureMenu">
                                <i class="material-icons" aria-hidden="true">texture</i><span>{{ textureLabel }}</span><i class="material-icons" aria-hidden="true">expand_more</i>
                            </button>
                            <label v-if="!pose && hasSecondarySkinLayer" class="lf-links-skin-layer">
                                <input type="checkbox" :checked="secondarySkinLayer" @change="toggleSecondarySkinLayer" @keydown.space.stop.prevent="!$event.repeat && $event.target.click()"> ${t("secondary_skin_layer")}
                            </label>
                            <div v-if="!pose && statusKey!=='ready'" class="lf-links-notice" role="status"><i class="material-icons">{{ statusKey==='updating' ? 'sync' : 'info_outline' }}</i><span>{{ status }}</span></div>
                            <div v-if="renderMode" class="lf-links-section-label"><span>{{ pose ? '${t("pose_this_group")}' : '${t("place_the_instance")}' }}</span><span v-if="!pose && modified" class="lf-links-pose-count">{{ modified }} ${t("posed")}</span></div>
                            <div v-if="pose" class="lf-links-mode" role="group" :aria-label="'${t("pose_mode")}'"><button type="button" :class="{active:poseMode==='additive'}" :aria-pressed="poseMode==='additive'" :title="'${t("adds_to_the_source_pose_follows_later_source_edits")}'" @click="setPoseMode('additive')">${t("additive")}</button><button type="button" :class="{active:poseMode==='absolute'}" :aria-pressed="poseMode==='absolute'" :title="'${t("keeps_fixed_values_if_the_source_pose_changes")}'" @click="setPoseMode('absolute')">${t("absolute")}</button></div>
                            <template v-if="renderMode"><div class="lf-links-transform" v-for="field in fields" :key="field.key"><div class="lf-links-transform-head"><label><i class="material-icons">{{ field.icon }}</i>{{ pose ? field.poseLabel : field.label }}</label><button type="button" class="lf-links-reset-field" @click="resetField(field)" :title="'${t("reset")}'+' '+field.label" :aria-label="'${t("reset")}'+' '+field.label"><i class="material-icons">restart_alt</i></button></div><lf-scene-vector v-if="sharedVectors" :key="currentId+'_'+field.key" :element-id="currentId" :field="field" :value="values[field.key]"></lf-scene-vector><div v-else class="lf-links-axis-row"><label v-for="(axis,index) in ['X','Y','Z']" :key="axis" :class="'lf-links-axis-'+axis.toLowerCase()"><span class="lf-links-axis-marker" aria-hidden="true">{{ axis }}</span><input type="number" :step="field.step" :value="values[field.key][index]" :aria-label="(pose ? field.poseLabel : field.label)+' '+axis" @change="commitAxis($event,field.key,index)" @keydown.enter="$event.target.blur()" @keydown.esc.stop.prevent="cancelAxis($event,field.key,index)"></label></div></div></template>
                        </template>
                    </div>`
                }});
            motionPanel=new Panel('lightflow_scene_links_animation',{
                name:t("linked_animation"),icon:'cinematic_blur',growable:true,resizable:true,
                condition:()=>!!Project&&!!Modes.animate&&!!rootOf(selected())?._lightflowManifest?.animations?.length,
                default_position:{slot:'right_bar',height:185,folded:false,sidebar_index:7},
                component:{
                    data(){return {rootId:'',rootName:'',summary:'',locked:false,offset:0,loop:false,time:0,count:0};},
                    methods:{
                        syncSelection(){const root=rootOf(selected());this.rootId=root?.uuid||'';this.rootName=root?.name||'';this.locked=!!root?.animation_locked;this.offset=Number(root?.animation_offset)||0;this.loop=root?.animation_loop_override?!!root.animation_loop:animationFor(root)?.loop==='loop';
                            const clips=animationsFor(root);this.count=clips.length;this.summary=clips.length===1?clips[0].name:clips.length?clips.length+' '+t("animations"):t("original_pose");this.syncPlayback();},
                        syncPlayback(){const root=rootOf(selected());this.time=animationTime(root);},
                        choose(event){showAnimationMenu(rootOf(selected()),event.currentTarget);},
                        setClock(locked){const root=rootOf(selected());if(!root||root.uuid!==this.rootId)return;const time=timelineClock(root);if(!!root.animation_locked===locked&&(!locked||Number(root.animation_time)===time))return;edit(root,{animation_locked:locked,...(locked?{animation_time:time}:{})},t("change_linked_clock"));updateAnimatedTree(root);ensureTimeline();},
                        setOffset(event){const root=rootOf(selected()),raw=event.target.value.trim(),value=Number(raw);if(!root||root.uuid!==this.rootId||!raw||!Number.isFinite(value)){event.target.value=this.offset;return;}if(value===Number(root.animation_offset||0))return;edit(root,{animation_offset:value},t("offset_linked_animation"));ensureTimeline();updateAnimatedTree(root);},
                        cancelOffset(event){event.target.value=this.offset;event.target.blur();},
                        toggleLoop(){const root=rootOf(selected());if(!root||root.uuid!==this.rootId)return;edit(root,{animation_loop:!this.loop,animation_loop_override:true},t("change_linked_loop"));updateAnimatedTree(root);}
                    },
                    mounted(){this.syncSelection();},
                    template:`<div class="lf-links-inspector lf-links-animation-panel">
                        <div class="lf-links-clock-head"><strong :title="rootName">{{ rootName }}</strong><span :title="'${t("evaluated_clip_time")}'">{{ time.toFixed(2) }} s</span></div>
                        <button type="button" class="lf-links-animation-picker" @click="choose" aria-haspopup="menu" aria-label="${t("choose_linked_animations")}" :title="'${t("linked_clips")}: '+summary"><i class="material-icons">movie</i><span>{{ summary }}</span><i class="material-icons">arrow_drop_down</i></button>
                        <div class="lf-links-mode lf-links-clock-mode" role="group" :aria-label="'${t("animation_clock")}'"><button type="button" :class="{active:!locked}" :aria-pressed="!locked" @click="setClock(false)" :title="'${t("follow_the_native_timeline_plus_offset")}'"><i class="material-icons">timeline</i>Timeline</button><button type="button" :class="{active:locked}" :aria-pressed="locked" @click="setClock(true)" :title="'${t("keep_the_pose_at_the_current_timeline_time")}'"><i class="material-icons">lock</i>Lock in</button></div>
                        <div class="lf-links-clock-settings"><label class="lf-links-global-offset" :title="'${t("offset_all_linked_clips")}'"><span>${t("time_offset")}</span><input type="number" step="0.05" :value="offset" aria-label="${t("offset_all_linked_clips")}" @change="setOffset" @keydown.enter="$event.target.blur()" @keydown.esc.stop.prevent="cancelOffset"><small>s</small></label><button type="button" class="lf-links-loop-toggle" :class="{active:loop}" :aria-pressed="loop" :title="'${t("default_clip_loop")}'" @click="toggleLoop"><i class="material-icons">{{ loop ? 'check_box' : 'check_box_outline_blank' }}</i><span>${t("loop_animation")}</span></button></div>
                    </div>`
                }
            });
            owned.push(motionPanel);
            const libraryHost=document.createElement('li');
            const libraryVM=new Vue({
                data(){return {instances:[],selectedId:'',folded:{},query:''};},
                methods:{
                    sync(){this.selectedId=rootOf(selected())?.uuid||'';this.instances=(Project?.elements||[]).filter(root=>root.type==='lightflow_scene_instance'&&root._lightflowManifest?.animations?.length).map(root=>({id:root.uuid,name:root.name,color:root.color>=0?markerColors[root.color%markerColors.length]?.pastel:'var(--color-accent)',active:animationIds(root),focus:root.animation_id,layers:root.animation_layers||[],clips:root._lightflowManifest?.animations||[]}));this.query=Panels.animations?.inside_vue?.search_term||'';},
                    root(id){return OutlinerNode.uuids[id];},
                    expand(id){const root=this.root(id);if(this.selectedId!==id){root?.clickSelect?.();this.$set(this.folded,id,false);}else this.$set(this.folded,id,!this.folded[id]);},
                    choose(id,clip,event){const root=this.root(id);if(!root||!clip.supported)return;if(this.selectedId!==id)root.clickSelect();if(event.ctrlKey||event.metaKey)toggleAnimation(root,clip.id);else selectClip(root,clip.id);},
                    toggle(id,clip){const root=this.root(id);if(clip.supported)toggleAnimation(root,clip.id);},
                    menu(id,event){showAnimationMenu(this.root(id),event.currentTarget);},
                    clipMenu(id,clip,event){showClipMenu(this.root(id),clip.id,event.currentTarget);},
                    offset(instance,id){const root=this.root(instance.id);return (Number(root?.animation_offset)||0)+(Number(instance.layers.find(layer=>layer.id===id)?.offset)||0);},
                    offsetLabel(value){return (value>0?'+':'')+value.toFixed(2)+' s';},
                    visibleClips(instance){const q=this.query.trim().toLowerCase();return instance.clips.filter(clip=>!q||clip.name.toLowerCase().includes(q)||instance.name.toLowerCase().includes(q));},
                    state(instance,id){return !instance.active.includes(id)?'off':instance.layers.find(layer=>layer.id===id)?.locked?'locked':'playing';},
                    shortName(name){return name.replace(/^animation\.[^.]+\./,'');}
                },
                template:`<li class="lf-links-animation-library" @mousedown.stop @touchstart.stop><ul class="lf-links-source-groups"><li v-for="instance in instances" :key="instance.id" v-show="!query || visibleClips(instance).length" class="animation_file lf-links-animation-group" :style="{'--lf-link-color':instance.color}">
                    <div class="animation_file_head lf-links-library-head" role="button" tabindex="0" :aria-expanded="selectedId===instance.id && !folded[instance.id]" @click.stop="expand(instance.id)" @keydown.enter.prevent="expand(instance.id)" @keydown.space.prevent="expand(instance.id)" @contextmenu.stop.prevent="menu(instance.id,$event)"><i class="material-icons lf-links-disclosure">{{ selectedId===instance.id && !folded[instance.id] ? 'expand_more':'chevron_right' }}</i><i class="material-icons">cinematic_blur</i><label :title="instance.name">{{ instance.name }}</label><span v-if="instance.active.length" class="lf-links-clip-count">{{ instance.active.length }}</span></div>
                    <ul v-if="selectedId===instance.id && !folded[instance.id]" class="indented lf-links-clip-list"><li v-for="clip in visibleClips(instance)" :key="clip.id" class="animation lf-links-library-clip" :class="{selected:instance.focus===clip.id,unsupported:!clip.supported}" :title="clip.name+(clip.supported?'':' · ${t("unsupported")}')" :aria-disabled="!clip.supported" role="button" tabindex="0" @click.stop="choose(instance.id,clip,$event)" @keydown.enter.prevent="choose(instance.id,clip,$event)" @contextmenu.prevent.stop="clipMenu(instance.id,clip,$event)"><i class="material-icons">movie</i><label>{{ shortName(clip.name) }}</label><small v-if="Math.abs(offset(instance,clip.id))>0.00001" class="lf-links-clip-offset" :title="'${t("clip_time_offset")}'">{{ offsetLabel(offset(instance,clip.id)) }}</small><div class="in_list_button" role="button" tabindex="0" :aria-label="clip.name+' · '+state(instance,clip.id)" :title="state(instance,clip.id)==='locked'?'${t("locked_pose")}':state(instance,clip.id)==='playing'?'${t("playing_click_to_lock")}':'${t("off_click_to_play")}'" @click.stop="toggle(instance.id,clip)" @keydown.enter.stop.prevent="toggle(instance.id,clip)" @dblclick.stop><i v-if="state(instance,clip.id)==='locked'" class="fa_big fas fa-lock"></i><i v-else-if="state(instance,clip.id)==='playing'" class="fa_big far fa-play-circle"></i><i v-else class="fa_big far fa-circle"></i></div></li></ul>
                </li></ul></li>`
            });
            libraryVM.$mount(libraryHost);animationLibrary=libraryVM;
            const mountAnimationLibrary=()=>{if(disposed)return;const list=document.getElementById('animations_list');if(list&&libraryVM.$el.parentNode!==list)list.append(libraryVM.$el);libraryVM.sync();};
            mountAnimationLibrary();
            const stopSearchWatch=Panels.animations?.inside_vue?.$watch('search_term',()=>libraryVM.sync());
            owned.push({delete(){stopSearchWatch?.();libraryVM.$destroy();libraryVM.$el.remove();}});
            const inspectorLayoutKey='lightflow_scene_links_inspector_layout_v2';
            if(localStorage.getItem(inspectorLayoutKey)!=='1'){
                if(inspector.getHostPanel()?.id==='outliner'&&Panels.light_properties){
                    Panels.light_properties.attachPanel(inspector,4);
                    inspector.customizePosition({height:350});
                }
                localStorage.setItem(inspectorLayoutKey,'1');
            }
            arrangeInspector=()=>{
                const outliner=Panels.outliner;
                if(Modes.animate&&motionPanel&&outliner&&motionPanel.position_data.slot==='right_bar'&&outliner.position_data.slot==='right_bar'){
                    const below=motionPanel.container?.compareDocumentPosition(outliner.container)&Node.DOCUMENT_POSITION_PRECEDING;
                    if(below||motionPanel.position_data.sidebar_index>=outliner.position_data.sidebar_index)motionPanel.moveTo('right_bar',outliner,true);
                }
                if(!inspector)return;
                const target=Modes.render?Panels.light_properties||Panels.transform:Panels.transform;
                if(target&&(inspector.getHostPanel()?.id!==target.id||!inspector.handle?.isConnected))target.attachPanel(inspector,Modes.render?4:1);
                inspector.handle?.setAttribute?.('title',t("scene_links"));
                inspector.handle?.setAttribute?.('aria-label',t("scene_links"));
                const label=inspector.handle?.querySelector('span');if(label&&Modes.edit)label.textContent=t("links");
            };
            arrangeInspector();
            owned.push(inspector);
            window.LightManagerUI?.workspace?.register?.(inspector);
            owned.push({delete(){window.LightManagerUI?.workspace?.unregister?.(inspector);}});
            owned.push(Blockbench.on('loaded_plugin',({plugin})=>{
                if(plugin?.id!=='light_manager'||disposed)return;
                arrangeInspector();window.LightManagerUI?.workspace?.register?.(inspector);syncPanel();
            }));
            const outlinerClasses=Blockbench.on('get_outliner_node_classes',({node,classes})=>{
                if(node?.type!=='lightflow_scene_instance')return;
                classes.push('lightflow_scene_link');
                if(Number.isInteger(node.color)&&node.color>=0)classes.push(`lightflow_scene_link_color_${node.color%markerColors.length}`);
            });
            owned.push(outlinerClasses);
            const markerStyles=(window.markerColors||[]).map((color,index)=>`#panel_outliner .outliner_object.lightflow_scene_link_color_${index}{--lightflow-link-ink:${color.pastel};}`).join('');
            owned.push(Blockbench.addCSS(`
                #panel_outliner .outliner_object.lightflow_scene_link{--lightflow-link-ink:var(--color-accent);}
                ${markerStyles}
                #panel_outliner .outliner_object.lightflow_scene_link > .dynamic-icon,
                #panel_outliner .outliner_object.lightflow_scene_link > .icon,
                #panel_outliner .outliner_object.lightflow_scene_link > .cube_name{color:var(--lightflow-link-ink)!important;}
                #panel_outliner .outliner_object.lightflow_scene_link.selected > .cube_name{font-weight:600;}
                #right_bar .panel_tab_list:has(> .panel_handle[panel_id="transform"]):has(> .panel_handle[panel_id="lightflow_scene_links_inspector"]){display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 88px!important;}
                #right_bar .panel_tab_list:has(> .panel_handle[panel_id="transform"]) > .panel_handle[panel_id="lightflow_scene_links_inspector"]{display:flex;align-items:center;gap:4px;width:88px!important;min-width:88px!important;max-width:88px!important;padding:0 4px!important;}
                #right_bar .panel_tab_list:has(> .panel_handle[panel_id="transform"]) > .panel_handle[panel_id="lightflow_scene_links_inspector"] > span{font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;}
                #right_bar .panel_tab_list:has(> .panel_handle[panel_id="transform"]) > .panel_handle[panel_id="lightflow_scene_links_inspector"]:before{content:'kid_star';font-family:'Material Icons';font-size:18px;line-height:1;flex:none;width:18px;text-align:center;}
                body.lightflow-scene-link-selected #panel_transform .panel_toolbar_label:has(+ .toolbar[toolbar_id="element_origin"]),
                body.lightflow-scene-link-selected #panel_transform .toolbar[toolbar_id="element_origin"]{display:none!important;}
                #panel_lightflow_scene_links_inspector .panel_vue_wrapper,#panel_lightflow_scene_links_animation .panel_vue_wrapper{min-width:0;overflow:auto;}
                .lf-links-inspector,.lf-links-inspector *{box-sizing:border-box;}
                .lf-links-inspector{--lf-links-control-height:30px;--lf-links-control-radius:8px;--lf-links-action-size:28px;--lf-links-glyph-size:18px;display:block!important;min-width:0;padding:0 10px 8px;color:var(--color-text);font-size:12px;}
                .lf-links-inspector button{color:inherit;font:inherit;cursor:pointer;}
                .lf-links-inspector :is(button,input,select,.nslide_tool),
                :is(#lightflow_scene_link_picker,#lightflow_scene_link_import,#lightflow_scene_link_recovery,#lightflow_linked_clip_offset) :is(.dialog_wrapper,button,input,select){box-shadow:none!important;}
                .lf-links-inspector button:focus-visible,.lf-links-inspector input:focus-visible{outline:2px solid var(--lf-focus-color, var(--color-text));outline-offset:1px;}
                .lf-links-inspector .lf-links-texture-choice{display:flex;align-items:center;gap:6px;width:100%;min-width:0;min-height:var(--lf-links-control-height);margin:4px 0;padding:0 7px;border:1px solid var(--color-border);border-radius:var(--lf-links-control-radius);background:var(--color-back);text-align:left;}
                .lf-links-texture-choice:hover{background:var(--color-button);}
                .lf-links-texture-choice span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
                .lf-links-texture-choice i.material-icons{flex:none;font-size:18px;margin:0;}
                .lf-links-skin-layer{display:flex;align-items:center;gap:7px;min-height:28px;padding:0 7px;cursor:pointer;}
                .lf-links-skin-layer input{flex:none;margin:0;}
                .contextMenu.lf-links-texture-menu{overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;box-shadow:none!important;border:1px solid var(--color-border);}
                .lf-links-inspector-head{display:flex;align-items:center;gap:7px;min-height:36px;border-bottom:1px solid var(--color-border);}
                .lf-links-head-icon{flex:none;color:var(--color-accent);font-size:19px;}
                .lf-links-title{min-width:0;flex:1;}
                .lf-links-title strong{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;}
                .lf-links-status{display:flex;align-items:center;gap:5px;max-width:102px;font-size:11px;color:var(--color-subtle_text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
                .lf-links-status-dot{width:6px;height:6px;flex:none;border-radius:50%;background:#54b783;}
                .lf-links-status-missing .lf-links-status-dot,.lf-links-status-incompatible .lf-links-status-dot,.lf-links-status-read_error .lf-links-status-dot{background:#e7a35b;}
                .lf-links-status-updating .lf-links-status-dot{background:var(--color-accent);}
                .lf-links-inspector .lf-links-back,.lf-links-inspector .lf-links-icon-action{display:grid;place-items:center;width:28px;min-width:28px;max-width:28px;height:28px;min-height:28px;padding:0;flex:0 0 28px;border-radius:8px;background:var(--color-button);}
                .lf-links-back i,.lf-links-icon-action i{font-size:17px;}
                #panel_lightflow_scene_links_inspector .lf-links-source-actions i.material-icons,
                #panel_lightflow_scene_links_inspector .lf-links-reset-field i.material-icons,
                #panel_lightflow_scene_links_inspector .lf-links-icon-action i.material-icons,
                #panel_lightflow_scene_links_inspector .lf-links-back i.material-icons{display:block;flex:none;width:var(--lf-links-glyph-size);height:var(--lf-links-glyph-size);margin:0!important;font-size:var(--lf-links-glyph-size);line-height:var(--lf-links-glyph-size);text-align:center;transform:translateY(-.5px);}
                .lf-links-icon-action{background:transparent;color:var(--color-subtle_text)!important;}
                .lf-links-icon-action:hover{background:var(--color-button);color:var(--color-text)!important;}
                .lf-links-icon-action:disabled{opacity:.4;cursor:default;}
                .lf-links-icon-action.active{color:var(--color-accent)!important;background:var(--color-button);}
                .lf-links-animation-panel{padding-top:6px;}
                .lf-links-clock-head{display:flex;gap:8px;align-items:center;margin-bottom:5px;min-width:0;}
                .lf-links-clock-head strong{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
                .lf-links-clock-head>span{font-size:11px;color:var(--color-subtle_text);font-variant-numeric:tabular-nums;flex:none;}
                #panel_lightflow_scene_links_animation .lf-links-animation-picker{display:flex;align-items:center;gap:6px;width:100%;min-width:0;min-height:30px;padding:0 8px;background:var(--color-button);border-radius:8px;text-align:left;}
                .lf-links-animation-picker:hover{filter:brightness(1.12);}
                .lf-links-animation-picker span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
                .lf-links-animation-picker i{font-size:18px;line-height:1;flex:none;}
                .lf-links-clock-mode{margin-top:7px;}
                .lf-links-clock-mode button{display:flex;align-items:center;justify-content:center;gap:5px;}
                .lf-links-clock-mode i{font-size:16px;line-height:1;}
                .lf-links-clock-settings{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:5px;margin-top:7px;}
                .lf-links-global-offset{display:flex;align-items:center;gap:5px;min-width:0;min-height:30px;padding:0 6px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-dark);}
                .lf-links-global-offset>span{min-width:0;flex:1;color:var(--color-subtle_text);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
                .lf-links-global-offset input{width:53px;min-width:0;height:25px;padding:0 3px;background:transparent;border:0;text-align:right;font:inherit;color:var(--color-text);font-variant-numeric:tabular-nums;appearance:textfield;-moz-appearance:textfield;}
                .lf-links-global-offset input::-webkit-outer-spin-button,.lf-links-global-offset input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
                .lf-links-global-offset:focus-within{outline:2px solid var(--lf-focus-color,var(--color-text));outline-offset:1px;}
                .lf-links-global-offset input:focus-visible{outline:none;}
                .lf-links-global-offset small{font-size:11px;color:var(--color-subtle_text);}
                .lf-links-loop-toggle{display:flex;align-items:center;justify-content:center;gap:4px;min-width:0;min-height:30px;padding:0 6px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-dark);}
                .lf-links-loop-toggle i{font-size:17px;line-height:1;color:var(--color-subtle_text);}
                .lf-links-loop-toggle.active i{color:var(--color-accent);}
                .lf-links-loop-toggle:hover{background:var(--color-button);}
                .lf-links-loop-toggle span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
                #animations_list .lf-links-animation-library,#animations_list .lf-links-animation-library>ul{list-style:none;margin:0;padding:0;overflow:visible;max-height:none;}
                #animations_list .lf-links-library-head{display:flex;align-items:center;gap:5px;height:28px;min-width:0;padding:0 5px;color:var(--lf-link-color);cursor:pointer;}
                .lf-links-library-head>.material-icons{font-size:22px;flex:none;}
                .lf-links-library-head>label{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;}
                .lf-links-clip-count{font-size:11px;color:var(--color-subtle_text);flex:none;}
                #animations_list .lf-links-clip-list{margin-left:22px;padding-left:0;}
                #animations_list .lf-links-library-clip{display:flex;align-items:center;gap:5px;padding:0 5px;margin:0;min-width:0;min-height:28px;height:28px;border:0;box-shadow:none!important;background:transparent;cursor:pointer;}
                #animations_list .lf-links-library-clip.selected{background:var(--color-selected);}
                #animations_list .lf-links-library-clip:hover{background:var(--color-button);}
                #animations_list .lf-links-library-clip>i{font-size:18px;flex:none;}
                #animations_list .lf-links-library-clip>label{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;}
                #animations_list .lf-links-library-clip>.in_list_button{width:24px;height:24px;flex:none;display:grid;place-items:center;box-shadow:none;background:transparent;color:var(--color-text);}
                .lf-links-clip-offset{flex:none;color:var(--color-accent);font-size:10px;font-variant-numeric:tabular-nums;white-space:nowrap;margin-right:3px;}
                .lf-links-readonly-track .timeline_animator_name::after{content:'lock';font-family:'Material Icons';font-size:14px;margin-left:6px;vertical-align:middle;color:var(--color-subtle_text);}
                .lf-links-readonly-track .animator_channel_bar .channel_head>.text_button:last-child{visibility:hidden;pointer-events:none;}
                .lf-links-library-clip.unsupported{opacity:.45;}
                .lf-links-library-head:focus-visible,.lf-links-library-clip:focus-visible,.lf-links-library-clip>.in_list_button:focus-visible{outline:2px solid var(--lf-focus-color, var(--color-text));outline-offset:-2px;}
                .lf-links-animation-empty{margin:6px 0;color:var(--color-subtle_text);line-height:1.4;}
                .lf-links-source-card{display:flex;align-items:center;gap:6px;padding:5px 6px;margin:6px 0;background:var(--color-dark);border:1px solid var(--color-border);border-radius:8px;min-width:0;}
                .lf-links-source-title{display:flex;align-items:center;gap:6px;min-width:0;flex:1;}
                .lf-links-source-title i{font-size:17px;color:var(--color-accent);flex:none;}
                .lf-links-source-title span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;}
                .lf-links-source-title .lf-links-material-badge{flex:none;color:#e7a35b;font-size:10px;font-weight:400;cursor:help;}
                .lf-links-source-actions{display:flex;align-items:center;gap:3px;flex:none;}
                .lf-links-source-update{display:flex;align-items:center;justify-content:center;gap:4px;min-height:28px;height:28px;padding:0 7px;border-radius:var(--lf-links-control-radius);background:var(--color-button);white-space:nowrap;line-height:1.2;}
                .lf-links-source-update.pending{background:var(--color-accent);color:var(--lf-on-accent,var(--color-accent_text));}
                .lf-links-source-actions .lf-links-icon-action{background:var(--color-button);}
                .lf-links-source-actions button:hover{filter:brightness(1.12);}
                .lf-links-source-actions button:disabled{opacity:.5;cursor:wait;}
                #panel_lightflow_scene_links_inspector,#panel_lightflow_scene_links_animation{container-type:inline-size;}
                .lf-links-axis-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;}
                @container (max-width:300px){
                    .lf-links-source-card{flex-wrap:wrap;}
                    .lf-links-source-title{flex-basis:100%;}
                    .lf-links-source-actions{width:100%;}
                    .lf-links-source-update{flex:1;}
                    .lf-links-clock-settings{grid-template-columns:minmax(0,1fr);}
                    .lf-links-global-offset>span{overflow:visible;}
                }
                @container (max-width:260px){
                    .lf-links-axis-row {grid-template-columns:1fr;gap:3px;}
                    .lf-links-inspector-head {flex-wrap:wrap;padding-bottom:4px;}
                }
                .lf-links-inspector-empty button{display:flex;align-items:center;justify-content:center;gap:5px;min-width:0;min-height:29px;padding:4px 6px;border-radius:8px;background:var(--color-button);white-space:nowrap;}
                .lf-links-inspector-empty button:hover{filter:brightness(1.17);}
                .lf-links-inspector-empty button i{font-size:16px;flex:none;}
                .lf-links-notice{display:flex;align-items:center;gap:6px;padding:6px 8px;margin-bottom:8px;background:var(--color-button);border-left:2px solid #e7a35b;color:var(--color-text);line-height:1.35;}
                .lf-links-notice i{font-size:15px;flex:none;}
                .lf-links-section-label{display:flex;align-items:center;justify-content:space-between;gap:7px;margin:12px 0 7px;color:var(--color-subtle_text);font-size:11px;text-transform:uppercase;letter-spacing:.045em;}
                .lf-links-pose-count{color:var(--color-accent);text-transform:none;letter-spacing:0;}
                .lf-links-transform{padding:6px 0 8px;border-top:1px solid var(--color-border);}
                .lf-links-transform-head{display:flex;align-items:center;justify-content:space-between;min-height:28px;gap:5px;margin-bottom:4px;}
                /* InputForm owns native NumSliders, while Scene Links already
                   supplies the transform heading: avoid the generic 6px Form
                   padding and 4px FormElement margins around each 28px vector. */
                #panel_lightflow_scene_links_inspector .lf-links-shared-vector > .form{padding:0!important;margin:0!important;}
                #panel_lightflow_scene_links_inspector .lf-links-shared-vector .form_bar{margin:0!important;min-height:28px;}
                .lf-links-transform-head label{display:flex;align-items:center;gap:6px;color:var(--color-text);}
                #panel_lightflow_scene_links_inspector .lf-links-transform-head label i{display:grid;place-items:center;width:18px;height:18px;font-size:16px;line-height:1;color:var(--color-subtle_text);}
                #panel_lightflow_scene_links_inspector .lf-links-reset-field{display:grid;place-items:center;width:var(--lf-links-action-size)!important;min-width:var(--lf-links-action-size)!important;height:var(--lf-links-action-size)!important;min-height:var(--lf-links-action-size)!important;padding:0!important;flex:0 0 var(--lf-links-action-size);border:0;border-radius:var(--lf-links-control-radius);background:transparent;color:var(--color-subtle_text)!important;}
                #panel_lightflow_scene_links_inspector .lf-links-reset-field:hover{background:var(--color-button);color:var(--color-text)!important;}
                #panel_lightflow_scene_links_inspector .lf-links-axis-row label{display:flex;align-items:center;gap:5px;min-width:0;min-height:var(--lf-links-control-height);margin:0;background:transparent;border:0;}
                #panel_lightflow_scene_links_inspector .lf-links-axis-marker{display:grid;place-items:center;flex:0 0 14px;width:14px;height:var(--lf-links-control-height);font-family:monospace;font-size:13px;font-weight:700;line-height:1;}
                #panel_lightflow_scene_links_inspector .lf-links-axis-x .lf-links-axis-marker{color:var(--color-axis-x);}
                #panel_lightflow_scene_links_inspector .lf-links-axis-y .lf-links-axis-marker{color:var(--color-axis-y);}
                #panel_lightflow_scene_links_inspector .lf-links-axis-z .lf-links-axis-marker{color:var(--color-axis-z);}
                #panel_lightflow_scene_links_inspector .lf-links-axis-row input{display:block;width:100%;min-width:0;height:var(--lf-links-control-height);min-height:var(--lf-links-control-height);margin:0;padding:0 4px;background:var(--color-back);border:1px solid var(--color-border);border-radius:var(--lf-links-control-radius);color:var(--color-text);font:inherit;font-size:12px;line-height:28px;text-align:center;font-variant-numeric:tabular-nums;appearance:textfield;-moz-appearance:textfield;}
                #panel_lightflow_scene_links_inspector .lf-links-axis-row label:hover input:not(:focus){background:var(--color-button);}
                #panel_lightflow_scene_links_inspector .lf-links-axis-row input:focus-visible{outline:2px solid var(--lf-focus-color, var(--color-text));outline-offset:1px;}
                #panel_lightflow_scene_links_inspector .lf-links-axis-row input::-webkit-outer-spin-button,#panel_lightflow_scene_links_inspector .lf-links-axis-row input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
                .lf-links-mode{display:grid;grid-template-columns:1fr 1fr;margin-top:7px;border:1px solid var(--color-border);border-radius:8px;overflow:hidden;}
                .lf-links-mode button{min-height:29px;background:var(--color-dark);}
                .lf-links-mode button+button{border-left:1px solid var(--color-border);}
                .lf-links-mode button.active{background:var(--color-accent);color:var(--lf-on-accent,var(--color-accent_text));}
                .lf-links-inspector-empty{display:grid;justify-items:center;gap:8px;padding:30px 10px;text-align:center;}
                .lf-links-inspector-empty>i{display:grid;place-items:center;width:40px;height:40px;line-height:40px;font-size:30px;color:var(--color-accent); justify-content: center; overflow: visible;}
                .lf-links-inspector-empty strong{font-size:13px;}.lf-links-inspector-empty p{margin:0 0 5px;color:var(--color-subtle_text);line-height:1.4;}
                #lightflow_scene_link_picker .dialog_wrapper{width:min(740px,calc(100vw - 28px));max-width:calc(100vw - 28px);}
                #lightflow_scene_link_picker .dialog_content{padding:0!important;overflow:hidden!important;max-height:calc(100vh - 96px)!important;}
                #lightflow_scene_link_picker .button_bar:empty{display:none;}
                .lf-links-picker,.lf-links-picker *{box-sizing:border-box;}
                .lf-links-picker{display:flex;flex-direction:column;min-width:0;max-height:calc(100vh - 96px);background:var(--color-ui);color:var(--color-text);}
                .lf-links-picker button{margin:0;border:0;box-shadow:none;font:inherit;}
                .lf-links-picker button:focus-visible{outline:2px solid var(--lf-focus-color,var(--color-accent));outline-offset:2px;}
                #lightflow_scene_link_picker .lf-links-picker>.lf-links-picker-head{display:flex;align-items:center;justify-content:space-between;gap:18px;height:auto!important;margin:14px 24px 0;padding:16px 18px;background:color-mix(in srgb,var(--color-ui) 78%,var(--color-dark));border:1px solid var(--color-border);border-radius:8px;}
                .lf-links-picker-intro{min-width:0;flex:1;}
                .lf-links-picker h2{font-size:19px;line-height:1.25;font-weight:600;margin:0 0 7px;}
                .lf-links-picker-head p{max-width:520px;font-size:12px;line-height:1.5;color:var(--color-subtle_text);margin:0;white-space:normal!important;}
                .lf-links-browse,.lf-links-skin,.lf-links-picker-foot button,.lf-links-empty button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:34px;height:auto!important;padding:7px 12px;border-radius:8px;white-space:nowrap;cursor:pointer;}
                .lf-links-browse{flex:none;background:var(--color-accent);color:var(--lf-on-accent,var(--color-accent_text,var(--color-text)));font-weight:600!important;}
                .lf-links-browse:hover{filter:brightness(1.08);}
                .lf-links-picker button .material-icons{flex:none;margin:0;font-size:18px;line-height:1;}
                .lf-links-skin,.lf-links-picker-foot button,.lf-links-empty button{background:var(--color-button);color:var(--color-text);}
                .lf-links-skin:hover,.lf-links-picker-foot button:hover,.lf-links-empty button:hover{background:var(--color-dark);}
                .lf-links-picker-tools{display:flex;align-items:center;gap:12px;padding:14px 24px 10px;}
                .lf-links-search{display:flex;flex:1;align-items:center;gap:8px;min-width:0;min-height:34px;padding:0 10px;background:var(--color-dark);border:1px solid var(--color-border);border-radius:8px;color:var(--color-subtle_text);}
                .lf-links-search:focus-within{border-color:var(--color-accent);outline:1px solid var(--color-accent);}
                .lf-links-search .material-icons{font-size:18px;line-height:1;flex:none;}
                .lf-links-search input{flex:1;min-width:0;width:100%;height:32px;margin:0;padding:0;background:transparent;border:0;color:var(--color-text);outline:0!important;box-shadow:none!important;font:inherit;font-size:12px;}
                .lf-links-search input::-webkit-search-cancel-button{cursor:pointer;}
                .lf-links-count{color:var(--color-subtle_text);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;}
                .lf-links-picker-scroll{min-height:0;max-height:min(400px,calc(100vh - 320px));overflow-y:auto;overflow-x:hidden;padding:6px 24px 16px;}
                .lf-links-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;align-content:start;}
                .lf-links-card{display:flex;align-items:center;gap:14px;width:100%;min-width:0;min-height:102px;height:auto!important;padding:7px;text-align:left;border:1px solid var(--color-border)!important;border-radius:8px;overflow:hidden;color:var(--color-text);background:var(--color-dark);cursor:pointer;transition:border-color .12s,background .12s;}
                .lf-links-card:hover:not(:disabled){border-color:var(--color-accent)!important;background:var(--color-button);}
                .lf-links-card:focus-visible{border-color:var(--color-accent)!important;background:var(--color-button);}
                .lf-links-card:disabled{opacity:.68;cursor:default;}
                .lf-links-cover{width:148px;height:86px;flex:none;overflow:hidden;border-radius:5px;background:var(--color-button);}
                .lf-links-cover img{width:100%;height:100%;object-fit:cover;display:block;}
                .lf-links-cover-fallback{display:grid;place-items:center;width:100%;height:100%;background:var(--color-button);}
                .lf-links-cover-fallback i{font-size:32px!important;color:var(--color-subtle_text);}
                .lf-links-card-info{flex:1;min-width:0;padding:4px 0;}
                .lf-links-card-heading{display:flex;align-items:center;gap:8px;min-width:0;}
                .lf-links-card-heading strong{display:block;min-width:0;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
                .lf-links-origin{flex:none;padding:3px 7px;border-radius:6px;background:var(--color-button);color:var(--color-subtle_text);font-size:11px;line-height:1.3;white-space:nowrap;}
                .lf-links-card-info small{display:block;margin-top:8px;color:var(--color-subtle_text);font-size:11px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
                .lf-links-card-arrow{color:var(--color-subtle_text);margin:0 7px!important;}
                .lf-links-empty{display:grid;justify-items:center;gap:10px;padding:32px 12px;color:var(--color-subtle_text);text-align:center;}
                .lf-links-empty>i{font-size:32px;}.lf-links-empty p{margin:0;line-height:1.45;}.lf-links-empty button{margin-top:4px;}
                .lf-links-picker-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 24px;border-top:1px solid var(--color-border);color:var(--color-subtle_text);font-size:12px;line-height:1.4;}
                @media(max-width:640px){#lightflow_scene_link_picker .lf-links-picker>.lf-links-picker-head{align-items:stretch;flex-direction:column;gap:12px;margin:12px 16px 0;padding:16px;}.lf-links-picker-head .lf-links-browse{align-self:flex-start;}.lf-links-picker-tools{padding:12px 16px 10px;flex-wrap:wrap;gap:8px;}.lf-links-search{flex-basis:100%;}.lf-links-count{margin-right:auto;}.lf-links-picker-scroll{padding:6px 16px 12px;max-height:min(400px,calc(100vh - 380px));}.lf-links-picker-foot{padding:10px 16px;}}
                @media(max-width:430px){.lf-links-cover{width:88px;height:72px;}.lf-links-card{min-height:88px;gap:10px;}.lf-links-card-heading{align-items:flex-start;flex-direction:column;gap:4px;}.lf-links-card-info small{margin-top:5px;}.lf-links-card-arrow{margin:0 2px!important;}.lf-links-picker-foot{align-items:flex-start;}.lf-links-picker-foot span{flex:1;}}
            `));
            syncPanel=()=>{
                document.body.classList.toggle('lightflow-scene-link-selected',!!selected());
                inspector?.inside_vue?.syncSelection?.();motionPanel?.inside_vue?.syncSelection?.();animationLibrary?.sync?.();
                updateOutline();motionPanel?.update?.();
                arrangeInspector();
                showSourceKeyframes(selected());
                queueMicrotask(()=>{if(!disposed)updateOutline();});
            };
            const hydrate=()=>{
                upgradeLinkedAnimators();
                if(disposed||!Project)return;
                for(const element of Project.elements||[]){
                    if(element?.type==='lightflow_scene_instance'&&!(element instanceof SceneInstanceElement))Object.setPrototypeOf(element,SceneInstanceElement.prototype);
                    if(element?.type==='lightflow_pose_group'&&!(element instanceof ScenePoseElement))Object.setPrototypeOf(element,ScenePoseElement.prototype);
                    if(element?.type!=='lightflow_scene_instance'&&element?.type!=='lightflow_pose_group')continue;
                    const mesh=element.mesh;
                    if(mesh?.userData?.lightflowSceneLinkPlaceholder){mesh.parent?.remove(mesh);mesh.geometry?.dispose?.();delete Project.nodes_3d[element.uuid];}
                    if(!element.mesh)element.preview_controller?.setup?.(element);
                }
                for(const element of SceneInstanceElement.all){
                    element._lightflowProject=Project;
                    refreshInstance(element);
                }
                syncPanel();
            };
            owned.push(Blockbench.on('select_project',hydrate),Blockbench.on('load_project',hydrate),Blockbench.on('select_mode',()=>setTimeout(()=>{arrangeInspector();syncPanel();mountAnimationLibrary();ensureTimeline();syncTimeline();},0)),Blockbench.on('reset_layout',()=>setTimeout(()=>{arrangeInspector();syncPanel();mountAnimationLibrary();ensureTimeline();syncTimeline();},0)),Blockbench.on('update_selection',syncPanel));
            owned.push(Codecs.project.on('parsed',()=>{hydrate();queueMicrotask(()=>{if(!disposed)hydrate();});}));
            const restorePlaybackPose=()=>{
                let skinLayerChanged=false;
                for(const root of Project?.elements||[])if(root.type==='lightflow_scene_instance'){
                    root._lightflowPlaying=false;delete root._lightflowTime;
                    if(!activeMounts.has(root)||!confirmedSource(root)){root._lightflowProject=Project;refreshInstance(root);}
                    else if(!syncInstanceTexture(root)){
                        skinLayerChanged=updateSecondarySkinLayer(root)||skinLayerChanged;
                        updateAnimatedTree(root);
                    }
                }
                if(skinLayerChanged){
                    window.ShaderEngine?.invalidateExternalMeshIntegrationCaches?.();
                    window.ShaderEngine?.requestPreviewRender?.({cause:'scene_link_skin_layer'});
                }
                syncPanel();
            };
            owned.push(Blockbench.on('undo',restorePlaybackPose),Blockbench.on('redo',restorePlaybackPose));
            const onProjectTexturesChanged=()=>{
                if(disposed||!Project)return;
                for(const root of SceneInstanceElement.all)if(root.texture_override)syncInstanceTexture(root);
                inspector?.inside_vue?.syncSelection?.();
            };
            owned.push(Blockbench.on('add_texture',onProjectTexturesChanged),Blockbench.on('update_texture_selection',onProjectTexturesChanged),
                Blockbench.on('edit_texture',onProjectTexturesChanged));
            let pointerStart=null,lastLinkedClick=null;
            const previewForEvent=event=>window.Preview?.all?.find(preview=>preview.canvas===event.target)||null;
            const linkedHit=(event,preview)=>{
                const rect=preview.canvas.getBoundingClientRect();
                const mouse=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
                const ray=new THREE.Raycaster();ray.setFromCamera(mouse,preview.camera);
                const linked=[];
                for(const root of SceneInstanceElement.all){
                    if(root.visibility===false||root.locked||!root.mesh?.visible)continue;
                    for(const holder of mountedCubes.get(root)||[])holder.traverseVisible(object=>{if(object.isMesh&&!object.userData.lightflowTerrainBufferOwner)linked.push(object);});
                }
                if(!linked.length)return null;
                const native=Outliner.elements.map(element=>element.mesh).filter(mesh=>mesh?.geometry&&mesh.visible);
                const hit=ray.intersectObjects([...linked,...native],false)[0];
                if(!hit?.object?.userData?.lightflowSceneInstance)return null;
                const root=OutlinerNode.uuids[hit.object.userData.lightflowSceneInstance];
                const pose=OutlinerNode.uuids[hit.object.userData.lightflowPose];
                if(!root||root.visibility===false||pose?.visibility===false)return null;
                return {root,pose};
            };
            const onPointerDown=event=>{
                const preview=previewForEvent(event);
                pointerStart=preview&&event.button===0&&!event.altKey?{preview,x:event.clientX,y:event.clientY,time:performance.now(),id:event.pointerId}:null;
            };
            const onPointerUp=event=>{
                const start=pointerStart;pointerStart=null;
                if(!start||event.pointerId!==start.id||start.preview!==previewForEvent(event)||window.Transformer?.dragging)return;
                if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>5||performance.now()-start.time>650)return;
                const hit=linkedHit(event,start.preview);
                if(!hit)return;
                const double=lastLinkedClick?.root===hit.root&&performance.now()-lastLinkedClick.time<350&&Math.hypot(event.clientX-lastLinkedClick.x,event.clientY-lastLinkedClick.y)<7;
                const target=(hit.root.isOpen||double)&&hit.pose?hit.pose:hit.root;
                if(double&&hit.pose){hit.root.openUp();hit.pose.parent?.openUp?.();}
                target.clickSelect?.(event,true);
                if(!target.selected)target.select();
                lastLinkedClick={root:hit.root,time:performance.now(),x:event.clientX,y:event.clientY};
            };
            const onViewportDoubleClick=event=>{
                const preview=previewForEvent(event);
                if(preview&&linkedHit(event,preview)){event.stopPropagation();event.preventDefault();}
            };
            document.addEventListener('pointerdown',onPointerDown,true);
            document.addEventListener('pointerup',onPointerUp,true);
            document.addEventListener('dblclick',onViewportDoubleClick,true);
            owned.push({delete(){document.removeEventListener('pointerdown',onPointerDown,true);document.removeEventListener('pointerup',onPointerUp,true);document.removeEventListener('dblclick',onViewportDoubleClick,true);}});
            const onDoubleClick=event=>{
                const row=event.target.closest?.('.outliner_node');
                const object=event.target.closest?.('.outliner_object');
                const button=event.target.closest?.('.outliner_button, .outliner_buttons, button');
                if(!row||!object||button||!object.contains(event.target))return;
                const element=selected();
                if(element?.type==='lightflow_scene_instance'&&row.id===element.uuid&&row.contains(event.target)){event.preventDefault();event.stopPropagation();openSource(element);}
            };
            document.addEventListener('dblclick',onDoubleClick,true);
            owned.push({delete(){document.removeEventListener('dblclick',onDoubleClick,true);}});
            const setRigidBatching=enabled=>{rigidBatchingEnabled=!!enabled;for(const resource of renderResources.values())if(!resource.retired)for(const owner of [...resource.users])if(owner._lightflowProject===Project)mountResult(owner,resource.result);updateOutline();window.ShaderEngine?.requestPreviewRender?.({cause:'scene_link_batching'});};
            window.LightflowSceneLinks={resolveSourceMaterialSlots,importPath,createSkinLink,prepareSourceModel,applySkinPose,buildSkinPoseSnapshot,insertSkinPoseKeys,poseKeyContext,showSourcePicker,refresh:refreshInstance,refreshMaterials:refreshLinkedMaterials,openSource,setAnimation,setAnimationTime,togglePlayback,setAnimations,toggleAnimation,showAnimationMenu,showClipMenu,setClipOffset,setRigidBatching,core,
                listAnimationGroups,
                getLinkedAnimation:(instanceId,animationId)=>findSourceAnimation(mountedAnimationRoot(instanceId),animationId),
                openAnimationSource:instanceId=>openSource(mountedAnimationRoot(instanceId))};
            hydrate();
            this._lightflowSceneLinksDispose=()=>{
                if(disposed)return;
                sceneProperties(SceneInstanceElement);sceneProperties(ScenePoseElement);
                for(const animator of Timeline.animators.slice())if(['lightflow_scene_instance','lightflow_pose_group'].includes(animator.getGroup?.()?.type)){
                    for(const key of animator.keyframes)key.unselect?.();Timeline.animators.remove(animator);if(Timeline.selected_animator===animator)Timeline.selected_animator=null;
                }
                if(Animation.selected?._lightflowSceneLinkClock){if(Timeline.playing)Timeline.pause();Animation.selected=null;Timeline.clear();}
                delete SceneInstanceElement.animator;delete ScenePoseElement.animator;
                disposed=true;
                for(const project of window.ModelProject?.all||[]){
                    for(const element of project.elements||[]){
                        if(element?.type==='lightflow_scene_instance')clearMounted(element);
                        if(element?.type!=='lightflow_scene_instance'&&element?.type!=='lightflow_pose_group')continue;
                        const mesh=project.nodes_3d?.[element.uuid];
                        mesh?.parent?.remove(mesh);
                        if(mesh?.userData?.lightflowSceneLinkPlaceholder)mesh.geometry?.dispose?.();
                        if(project.nodes_3d?.[element.uuid]===mesh){
                            // Native hover highlighting dereferences every live element's mesh.
                            // Keep a resource-free placeholder until the next load hydrates it.
                            const placeholder=new THREE.Group();placeholder.name=element.uuid;placeholder.visible=false;
                            placeholder.userData.lightflowSceneLinkPlaceholder=true;
                            project.nodes_3d[element.uuid]=placeholder;
                        }
                    }
                }
                for(const resources of renderResources.values())resources.owned.forEach(resource=>resource.dispose?.());
                renderResources.clear();assetCache.clear();
                for(const item of owned.reverse())item?.delete?.();
                document.body.classList.remove('lightflow-scene-link-selected');
                fallbackMaterials.forEach(material=>material.dispose());hiddenFaceMaterial.dispose();
                delete window.LightflowSceneLinks;
                delete window.LightflowSceneInstanceElement;delete window.LightflowScenePoseElement;
                if(OutlinerElement.types.lightflow_scene_instance===SceneInstanceElement)delete OutlinerElement.types.lightflow_scene_instance;
                if(OutlinerElement.types.lightflow_pose_group===ScenePoseElement)delete OutlinerElement.types.lightflow_pose_group;
                const sceneForm=Panels.lightflow_scene?.form;
                if(injectedSceneControl&&sceneForm?.form_config?._scene_link===injectedSceneControl)delete sceneForm.form_config._scene_link;
                Panels.lightflow_scene?.form?.buildForm?.();
            };
        },
        onunload(){this._lightflowSceneLinksDispose?.();}
    });
}
