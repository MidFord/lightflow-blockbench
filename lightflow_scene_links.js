/* Lightflow Scene Links: data-only contract shared by the future viewport and Studio consumers. */
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

    // Resolve every base-map sample, including Shader Architect's materialUv,
    // alpha and neighbor samples. Native vUv alone does not cover those shaders.
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
            if(geometry.attributes.bedrockGreedyRepeat&&(!geometry.attributes.bedrockTileUv||!geometry.attributes.bedrockAtlasRect))throw new Error('Missing terrain atlas attributes.');
        }
        return terrain.sections;
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
        const visualCount=(elementTypes.cube||0)+(elementTypes.mesh||0)+(elementTypes.billboard||0);
        const ignoredTypes=Object.fromEntries(Object.entries(elementTypes).filter(([type])=>!['cube','mesh','billboard'].includes(type)));
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

    function linkedTextureReferences(model) {
        const records=[...(model.textures||[]),...(model.lightflow_terrain?.textures||[])];
        const references=new Set(terrainSections(model).flatMap(section=>section.terrain_materials.map(material=>String(material.map??'')).filter(Boolean)));
        for(const element of model.elements||[])if(['cube','mesh','billboard'].includes(element.type||'cube'))for(const face of Object.values(element.faces||{})){
            if(face?.texture!==null&&face?.texture!==false&&face?.texture!==undefined)references.add(String(face.texture));
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
            const unc=/^\/\/[^/]+\/[^/]+\//.exec(path);
            const root=drive?.[0]||unc?.[0]||(path.startsWith('/')?'/':'');
            return {root,parts:path.slice(root.length).split('/').filter(Boolean)};
        };
        const normalize=input=>{
            const {root,parts}=splitRoot(input),stack=[];
            for(const part of parts){if(part==='.')continue;if(part==='..'&&stack.length&&stack.at(-1)!=='..')stack.pop();else if(part==='..'&&!root)stack.push(part);else if(part!=='..')stack.push(part);}
            return root+stack.join('/')||'.';
        };
        const resolve=(...items)=>{
            let current='';
            for(const item of items){const value=String(item||'').replace(/\\/g,'/');if(!value)continue;current=splitRoot(value).root?value:(current.replace(/\/$/,'')+'/'+value);}
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
        const absolute=pathAPI.resolve(String(sourcePath||''));
        if (!/\.bbmodel$/i.test(absolute)) throw new Error('Choose a saved .bbmodel project.');
        const receiver=String(receiverPath||'');
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

    async function readLinkedSource(link, receiverPath, pathAPI, io, hash) {
        const resolved=resolveLinkReference(link,receiverPath,pathAPI);
        if(!resolved)return {status:'missing',path:null};
        if(typeof io?.readFile!=='function'||typeof hash!=='function') throw new Error('File and revision adapters are required.');
        let bytes;
        let actualPath=resolved;
        let usedFallback=false;
        try {bytes=await io.readFile(actualPath);}
        catch(error) {
            const fallback=link.absoluteFallback;
            if(error?.code==='ENOENT'&&fallback&&pathAPI.normalize(fallback)!==pathAPI.normalize(actualPath)) {
                actualPath=fallback;
                usedFallback=true;
                try {bytes=await io.readFile(actualPath);}
                catch(fallbackError) {
                    if(fallbackError?.code==='ENOENT')return {status:'missing',path:resolved};
                    return {status:'read_error',path:actualPath,message:String(fallbackError?.message||fallbackError)};
                }
            } else if(error?.code==='ENOENT')return {status:'missing',path:resolved};
            else return {status:'read_error',path:resolved,message:String(error?.message||error)};
        }
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

    return {VERSION,patchTerrainMapSamples,terrainGridOffset,parseBBModel,terrainSections,inspectBBModel,sourceMaterialDefinitions,linkedMaterialDefinition,linkedTextureReferences,linkedTextureBindings,normalizePose,portablePathAPI,quaternionFromDegrees,resolveGroupPose,animationSupported,normalizeLinkedAnimations,sampleAnimationChannel,linkedAnimationTime,reconcilePoses,makeLinkReference,resolveLinkReference,sourceCacheKey,readLinkedSource,sourceDisplayStatus,detectReferenceCycle};
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
            const t=(en,es)=>String(window.settings?.language?.value||window.Language?.code||'en').startsWith('es')?es:en;
            Language.addTranslations('en',{
                'lightflow_links.name':'Scene instance', 'lightflow_links.pose':'Local pose',
                'lightflow_links.add':'Linked scene…','lightflow_links.inspector':'Scene Links',
                'lightflow_links.open':'Open source','lightflow_links.refresh':'Update from source',
                'lightflow_links.relocate':'Find source…','lightflow_links.reset':'Reset local pose'
            });
            Language.addTranslations('es',{
                'lightflow_links.name':'Instancia de escena', 'lightflow_links.pose':'Pose local',
                'lightflow_links.add':'Escena vinculada…','lightflow_links.inspector':'Escenas vinculadas',
                'lightflow_links.open':'Abrir origen','lightflow_links.refresh':'Actualizar desde origen',
                'lightflow_links.relocate':'Buscar origen…','lightflow_links.reset':'Restablecer pose local'
            });
            const hash=async text=>{
                const bytes=new TextEncoder().encode(text);
                const digest=await crypto.subtle.digest('SHA-256',bytes);
                return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
            };
            const readFile=path=>new Promise((resolve,reject)=>{
                const ok=Blockbench.read([path],{errorbox:false,readtype:'text'},files=>{
                    if(files?.[0]?.content!==undefined)resolve(files[0].content);
                    else reject(Object.assign(new Error('Could not read source'),{code:'ENOENT'}));
                });
                if(ok===false)reject(Object.assign(new Error('Source unavailable'),{code:'ENOENT'}));
            });
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
                const receiver=element._lightflowProject?.save_path||window.Project?.save_path||'';
                let link;
                try{link=JSON.parse(element.source_link||'{}');}catch(_){return {status:'incompatible'};}
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

            class SceneInstanceElement extends OutlinerElement {
                constructor(data,uuid){super(data,uuid);this.children=[];this.isOpen=false;for(const prop of Object.values(SceneInstanceElement.properties))prop.reset(this);if(data)this.extend(data);}
                duplicate(){
                    const copy=super.duplicate();copy._lightflowProject=this._lightflowProject||Project;
                    refreshInstance(copy);return copy;
                }
                get origin(){return this.position;}
                getWorldCenter(){return this.mesh?.getWorldPosition(new THREE.Vector3())||new THREE.Vector3().fromArray(this.position);}
                extend(data){for(const prop of Object.values(SceneInstanceElement.properties))prop.merge(this,data);this.sanitizeName();return this;}
                getUndoCopy(){const copy=new SceneInstanceElement(this,this.uuid);delete copy.parent;return copy;}
                getSaveCopy(){const copy={type:'lightflow_scene_instance',uuid:this.uuid};for(const prop of Object.values(SceneInstanceElement.properties))prop.copy(this,copy);return copy;}
                setColor(index){
                    this.color=index;
                    const row=document.getElementById(this.uuid)?.querySelector('.outliner_object');
                    if(row){for(const name of [...row.classList])if(name.startsWith('lightflow_scene_link_color_'))row.classList.remove(name);if(index>=0)row.classList.add(`lightflow_scene_link_color_${index%markerColors.length}`);}
                    window.updateSelection?.();
                    return this;
                }
                forEachChild(callback,type=OutlinerElement,includeSelf=false){if(includeSelf&&this instanceof type)callback(this);const visit=child=>{if(child instanceof type)callback(child);for(const nested of child.children||[])visit(nested);};this.children.forEach(visit);}
                openUp(){this.isOpen=true;this.parent?.openUp?.();return this;}
                select(...args){const changed=Outliner.selected[0]!==this;super.select(...args);arrangeInspector();syncPanel();if(Modes.animate){ensureTimeline();Animation.selected?.getBoneAnimator(this)?.select(true);}else if(changed&&Modes.edit)Panels.transform?.getHostPanel?.()?.selectTab?.(Panels.transform);return this;}
                unselect(...args){super.unselect(...args);syncPanel();}
                static behavior={parent:true,child_types:['lightflow_pose_group'],select_children:'self_first',unique_name:true,movable:true,rotatable:true,scalable:true,use_absolute_position:true,marker_color:true,parent_types:['root','group','armature_bone']};
            }
            Object.assign(SceneInstanceElement.prototype,{type:'lightflow_scene_instance',title:'Scene instance',icon:'kid_star',movable:true,rotatable:true,scalable:true,needsUniqueName:true});
            SceneInstanceElement.prototype.buttons=[Outliner.buttons.visibility,Outliner.buttons.locked];
            for(const[key,type,value]of[['name','string','Scene instance'],['source_link','string',''],['source_revision','string',''],['include_geometry','boolean',true],['include_billboards','boolean',true],['animation_id','string',''],['animation_ids','array',[]],['animation_layers','array',[]],['animation_locked','boolean',false],['animation_offset','number',0],['animation_time','number',0],['animation_loop','boolean',true],['animation_loop_override','boolean',false],['position','vector',[0,0,0]],['rotation','vector',[0,0,0]],['scale','vector',[1,1,1]],['color','number',-1],['visibility','boolean',true],['locked','boolean',false]])owned.push(new Property(SceneInstanceElement,type,key,{default:value}));
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
                constructor(data,uuid){super(data,uuid);this.children=[];this.isOpen=false;for(const prop of Object.values(ScenePoseElement.properties))prop.reset(this);if(data)this.extend(data);}
                get origin(){return this.position;}
                getWorldCenter(){return this.mesh?.getWorldPosition(new THREE.Vector3())||new THREE.Vector3().fromArray(this.position);}
                extend(data){for(const prop of Object.values(ScenePoseElement.properties))prop.merge(this,data);this.sanitizeName();return this;}
                getUndoCopy(){const copy=new ScenePoseElement(this,this.uuid);delete copy.parent;return copy;}
                getSaveCopy(){const copy={type:'lightflow_pose_group',uuid:this.uuid};for(const prop of Object.values(ScenePoseElement.properties))prop.copy(this,copy);return copy;}
                forEachChild(callback,type=OutlinerElement,includeSelf=false){if(includeSelf&&this instanceof type)callback(this);const visit=child=>{if(child instanceof type)callback(child);for(const nested of child.children||[])visit(nested);};this.children.forEach(visit);}
                openUp(){this.isOpen=true;this.parent?.openUp?.();return this;}
                select(...args){const changed=Outliner.selected[0]!==this;super.select(...args);arrangeInspector();syncPanel();if(Modes.animate){ensureTimeline();Animation.selected?.getBoneAnimator(this)?.select(true);}else if(changed&&Modes.edit)Panels.transform?.getHostPanel?.()?.selectTab?.(Panels.transform);return this;}
                unselect(...args){super.unselect(...args);syncPanel();}
                static behavior={parent:true,child_types:['lightflow_pose_group'],select_children:'self_first',unique_name:true,movable:true,rotatable:true,scalable:true,use_absolute_position:true,parent_types:['lightflow_scene_instance','lightflow_pose_group']};
            }
            Object.assign(ScenePoseElement.prototype,{type:'lightflow_pose_group',title:'Local pose',icon:'accessibility_new',movable:true,rotatable:true,scalable:true,needsUniqueName:true});
            ScenePoseElement.prototype.buttons=[Outliner.buttons.visibility,Outliner.buttons.locked];
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
                        this.animation.name=t('Scene animation','Animación de escena');
                        this.animation.add(false);timelineCarriers.delete(Project);
                    }
                    return super.createKeyframe(...args);
                }
            }
            SceneInstanceElement.animator=LinkedNodeAnimator;
            ScenePoseElement.animator=LinkedNodeAnimator;
            for(const Type of [SceneInstanceElement,ScenePoseElement]){
                Type.behavior.has_pivot=true;Type.behavior.resizable=true;
                Type.prototype.size=function(axis){
                    if(!this.mesh)return axis===undefined?[1,1,1]:1;
                    this.mesh.updateWorldMatrix(true,true);const inverse=new THREE.Matrix4().copy(this.mesh.matrixWorld).invert(),box=new THREE.Box3();
                    this.mesh.traverseVisible(mesh=>{if(!mesh.isMesh||!mesh.geometry)return;if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();box.union(mesh.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().copy(inverse).multiply(mesh.matrixWorld)));});
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
                    element.mesh.visible=element.visibility!==false&&source?.visible!==false;
                    applyPoseAnimation(element);
                    element.mesh.fix_position=element.mesh.position.clone();element.mesh.fix_rotation=element.mesh.rotation.clone();
                    this.dispatchEvent('update_transform',{element});
                    if(!updatingAnimatedTree)window.ShaderEngine?.refreshExternalMeshTransforms?.(element.mesh);
                    if(!updatingAnimatedTree)updateOutline();
                }
            });
            const nativeEdit=window.TransformerModule?.modules.edit;
            if(nativeEdit){
                const module=new TransformerModule('lightflow_link_rotate',{
                    priority:2,condition:()=>!!Modes.edit&&Toolbox.selected.id==='rotate_tool'&&Outliner.selected.length>0&&Outliner.selected.every(node=>['lightflow_scene_instance','lightflow_pose_group'].includes(node.type)),
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
                const file=String(texture?.path||source||'');
                if(!file)return '';
                try{return new URL('file:///'+paths.resolve(paths.dirname(sourcePath),file).replace(/\\/g,'/')).href;}
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
                    const needsAo=ao&&!shader.vertexShader.includes('varying float vLinkAo;');
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
                    if(atlas){
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
                if(existing?.revision===result.revision)return existing;
                const resources={result,revision:result.revision,textures:new Map(),materials:new Map(),cubes:new Map(),owned:new Set(),users:new Set(),retired:false,batchVersion:0,batchCache:null};
                const terrain=core.terrainSections(result.model);
                const referencedTextures=core.linkedTextureReferences(result.model);
                const sourceTextures=[...(result.model.textures||[]),...(result.model.lightflow_terrain?.textures||[])];
                for(const [index,record] of sourceTextures.entries()){
                    if(!referencedTextures.has(String(index))&&!referencedTextures.has(String(record.uuid||record.id)))continue;
                    const url=getTextureSource(record,result.path);
                    if(!url)continue;
                    const texture=new THREE.TextureLoader().load(url,()=>{
                        if(disposed)return;
                        texture.userData||={};
                        try{
                            const image=texture.image,canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
                            const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
                            const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
                            let opaque=true,cutout=true;for(let i=3;i<pixels.length;i+=4){if(pixels[i]!==255)opaque=false;if(pixels[i]!==255&&pixels[i]/255>=.05)cutout=false;}
                            texture.userData.lightflowOpaque=opaque;texture.userData.lightflowCutout=cutout;
                        }catch(_){texture.userData.lightflowOpaque=false;}
                        resources.batchVersion++;
                        if(!disposed&&!resources.retired)for(const owner of [...resources.users])if(owner._lightflowProject===Project)mountResult(owner,result);
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
                }
                const textureBindings=core.linkedTextureBindings(result.model,resources.textures);
                const definitions=core.sourceMaterialDefinitions(result.model);
                const materialFor=(face,index=0,element=null,faceName=null)=>{
                    if(!face||face.texture===null)return hiddenFaceMaterial;
                    const definition=core.linkedMaterialDefinition(element,faceName,definitions);
                    const info=resources.textures.get(String(face.texture??''));
                    if(!info){
                        if(!definition)return fallbackMaterials[index%fallbackMaterials.length];
                        const key='fallback-'+index+'|'+definition.id;
                        if(!resources.materials.has(key)){
                            const material=fallbackMaterials[index%fallbackMaterials.length].clone();
                            material.sa_linked_material_definition=definition;
                            resources.materials.set(key,material);resources.owned.add(material);
                        }
                        return resources.materials.get(key);
                    }
                    const key=info.texture.uuid+'|'+(definition?.id||'');
                    if(!resources.materials.has(key)){
                        const material=new THREE.MeshBasicMaterial({map:info.texture,transparent:true,alphaTest:.05,side:THREE.DoubleSide});
                        material.sa_source_render_mode=info.record.render_mode||'default';
                        material.sa_source_blockbench_texture=textureBindings.get(String(face.texture));
                        material.sa_linked_material_definition=definition;
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
                        const textureInfo=resources.textures.get(String(face.texture??''));
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
                        return materialFor(face,index,cube,sides[index]);
                    });
                    uv.needsUpdate=true;
                    // Preserve the triangle order for picking, but collapse identical
                    // face materials into one draw and remove invisible faces.
                    const visibleGroups=geometry.groups.filter(group=>materials[group.materialIndex]?.visible!==false);
                    // Shader effects need the owning face's UV domain and source
                    // texture resolution even after native draw groups collapse.
                    const faceRanges=visibleGroups.map(group=>{
                        const face=cube.faces?.[sides[group.materialIndex]];
                        const info=resources.textures.get(String(face?.texture??''));
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
                    resources.cubes.set(cube.uuid,holder);
                }
                for(const record of result.model.elements||[]){
                    if(!['mesh','billboard'].includes(record.type))continue;
                    const holder=new THREE.Group();holder.rotation.order=window.Formats?.[result.manifest.format]?.euler_order||'ZYX';
                    holder.position.fromArray(record.type==='billboard'?record.position||record.origin||[0,0,0]:record.origin||[0,0,0]);
                    holder.rotation.fromArray((record.rotation||[0,0,0]).map(value=>Number(value)*Math.PI/180));
                    holder.visible=record.visibility!==false;holder.userData.lightflowKind=record.type==='billboard'?'billboards':'geometry';
                    if(record.type==='billboard'){
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
                            const positions=[],uvs=[],info=resources.textures.get(String(face.texture??''));
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
                            holder.add(new THREE.Mesh(geometry,materialFor(face,faceIndex,record,Object.keys(record.faces||{})[faceIndex])));
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
                    mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.lightflowTerrainSection=true;
                    holder.matrix.fromArray(section.matrix);holder.matrix.decompose(holder.position,holder.quaternion,holder.scale);
                    holder.userData.lightflowTerrainCoordinates=true;
                    holder.visible=section.visibility!==false;holder.userData.lightflowKind='geometry';holder.add(mesh);
                    resources.cubes.set(section.uuid,holder);
                }
                if(existing){existing.retired=true;if(!existing.users.size)existing.owned.forEach(resource=>resource.dispose?.());}
                renderResources.set(result.cacheKey,resources);
                return resources;
            };
            const clearMounted=element=>{
                for(const mesh of mountedCubes.get(element)||[]){mesh.traverse(object=>{if(object.isMesh){window.ShaderEngine?.releaseMeshIntegration?.({mesh:object},object);if(object.userData.lightflowOwnedGeometry){object.geometry?.dispose();delete object.userData.lightflowOwnedGeometry;}}});mesh.parent?.remove(mesh);}
                mountedCubes.delete(element);
                const old=activeMounts.get(element);
                if(old){old.users.delete(element);if(old.retired&&!old.users.size)old.owned.forEach(resource=>resource.dispose?.());}
                activeMounts.delete(element);
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
            const applyLinkedMaterials=root=>{
                const engine=window.ShaderEngine,manager=window.MaterialManager;
                if(!engine||!manager)return;
                for(const holder of mountedCubes.get(root)||[])holder.traverse(mesh=>{
                    if(!mesh.isMesh||mesh.userData.saOpaqueCoveragePass)return;
                    const node=OutlinerNode.uuids[mesh.userData.lightflowPose]||root;
                    const id=linkedMaterialId(node);
                    mesh.userData.lightflowReceiverMaterialOverride=id;
                    const shader=manager.getRenderMaterial(id||engine.globalRenderMode||'classic');
                    engine.applyToMesh({mesh,uuid:mesh.uuid},shader,{reuseUnchangedMaterial:true});
                    if(mesh.userData.lightflowTerrainSection)for(const material of [...(Array.isArray(mesh.material)?mesh.material:[mesh.material]),mesh.customDepthMaterial,mesh.customDistanceMaterial])installTerrainMaterialSupport(material,mesh.geometry);
                });
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
                element.forEachChild(child=>{if(child.type==='lightflow_pose_group')map.set(child.source_group_id,child);});
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
                    if(!holder.visible||holder.userData.lightflowKind!=='geometry')continue;
                    holder.updateMatrixWorld(true);
                    const meshes=[];holder.traverseVisible(object=>{if(object.isMesh)meshes.push(object);});
                    if(meshes.length!==1)continue;
                    const mesh=meshes[0],material=mesh.material;
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
                clearMounted(element);
                const poses=synchronizeTree(element,result);
                const resources=createRenderResources(result);
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
                        // Shader face dimensions and join attributes depend on
                        // this instance's transform; never mutate a shared template.
                        if(object.geometry){object.geometry=object.geometry.clone();object.userData.lightflowOwnedGeometry=true;}
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
                resources.users.add(element);
                activeMounts.set(element,resources);
                applyLinkedMaterials(element);
                window.ShaderEngine?.refreshExternalMeshTransforms?.(element.mesh);
                element._lightflowManifest=result.manifest;
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
            const refreshInstance=async(element,force=false)=>{
                if(disposed||!element||element.type!=='lightflow_scene_instance')return;
                const current=(element._lightflowRequest||0)+1;element._lightflowRequest=current;
                element._lightflowStatus='updating';syncPanel();
                const result=await readSource(element,force);
                if(disposed||element._lightflowRequest!==current||!element.mesh?.parent)return;
                element._lightflowStatus=result.status;
                if(result.status==='ready'){
                    element._lightflowManifest=result.manifest;
                    mountResult(element,result);
                }
                else syncPanel();
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
            const clearSelectionEdges=()=>{for(const edge of [...selectionEdges.children]){edge.geometry.dispose();edge.material.dispose();selectionEdges.remove(edge);}};
            updateOutline=()=>{
                const element=selected();
                let visible=!!element?.mesh;for(let node=element?.mesh;node;node=node.parent)if(!node.visible)visible=false;
                if(!visible){selectionOutline.visible=false;selectionEdges.visible=false;return;}
                // Native selection refreshes may empty Canvas.outlines.
                if(selectionOutline.parent!==Canvas.outlines||!Canvas.outlines?.children.includes(selectionOutline))Canvas.outlines?.add(selectionOutline);
                if(selectionEdges.parent!==Canvas.outlines||!Canvas.outlines?.children.includes(selectionEdges))Canvas.outlines?.add(selectionEdges);
                if(Canvas.outlines)Canvas.outlines.visible=true;
                element.mesh.updateWorldMatrix(true,true);
                const meshes=[];element.mesh.traverseVisible(mesh=>{if(mesh.isMesh&&mesh.geometry)meshes.push(mesh);});
                selectionBox.makeEmpty();for(const mesh of meshes){if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();selectionBox.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));}
                selectionOutline.visible=!selectionBox.isEmpty();
                const root=rootOf(element);
                const marker=Number.isInteger(root?.color)&&root.color>=0?window.markerColors?.[root.color%markerColors.length]:null;
                selectionOutline.material.color.set(marker?.pastel||0x5d9dff);
                const signature=meshes.map(mesh=>mesh.uuid).join('|');
                if(signature!==edgeSignature){
                    clearSelectionEdges();edgeSignature=signature;
                    for(const mesh of meshes){const edge=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:marker?.pastel||0x5d9dff,depthTest:true,depthWrite:false,transparent:true,opacity:.8}));edge.matrixAutoUpdate=false;edge.userData.source=mesh;edge.raycast=()=>{};edge.renderOrder=2001;selectionEdges.add(edge);}
                }
                selectionEdges.visible=meshes.length>0;
                selectionEdges.updateWorldMatrix(true,false);
                const inverse=new THREE.Matrix4().copy(selectionEdges.matrixWorld).invert();
                for(const edge of selectionEdges.children){edge.matrix.copy(inverse).multiply(edge.userData.source.matrixWorld);edge.matrixWorldNeedsUpdate=true;edge.material.color.copy(selectionOutline.material.color);}
            };
            owned.push({delete(){clearSelectionEdges();selectionEdges.parent?.remove(selectionEdges);selectionOutline.parent?.remove(selectionOutline);selectionOutline.geometry.dispose();selectionOutline.material.dispose();}});
            const statusText=element=>{
                const status=element?._lightflowStatus||'ready';
                return ({ready:t('Connected','Conectada'),changed:t('Changes available','Hay cambios'),updating:t('Updating…','Actualizando…'),missing:t('Source missing','Origen no encontrado'),incompatible:t('Incompatible source','Origen incompatible'),read_error:t('Could not read source','No se pudo leer el origen')})[status]||status;
            };
            const sourcePath=element=>{
                const root=rootOf(element);
                if(!root)return '';
                try{return core.resolveLinkReference(JSON.parse(root.source_link),root._lightflowProject?.save_path||Project?.save_path||'',paths)||'';}
                catch(_){return '';}
            };
            const edit=(element,values,label)=>{
                Undo.initEdit({elements:[element]});
                element.extend(values);
                element.preview_controller?.updateTransform?.(element);
                Undo.finishEdit(label);
                window.ShaderEngine?.requestPreviewRender?.({cause:'scene_link_edit'});
                syncPanel();
            };
            const animationIds=root=>Array.isArray(root?.animation_ids)&&root.animation_ids.length?root.animation_ids:root?.animation_id?[root.animation_id]:[];
            const animationsFor=root=>animationIds(root).map(id=>root?._lightflowAnimations?.find(a=>String(a.uuid||a.name)===id)).filter(a=>a&&core.animationSupported(a));
            const animationFor=root=>animationsFor(root).find(a=>String(a.uuid||a.name)===root?.animation_id)||animationsFor(root)[0];
            const layerFor=(root,id)=>root?.animation_layers?.find(layer=>layer.id===id);
            class LinkedSourceAnimator extends BoneAnimator {
                getGroup(){return this.group;}
                select(){return GeneralAnimator.prototype.select.call(this);}
                doRender(){return false;}
                createKeyframe(){Blockbench.showQuickMessage(t('Edit these keyframes in the source project','Edita estos keyframes en el proyecto de origen'));}
                showContextMenu(event){new Menu([{name:t('Open source project','Abrir proyecto de origen'),icon:'open_in_new',click:()=>openSource(this.group)}]).open(event);}
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
                Vue.nextTick(()=>{if(disposed)return;for(const animator of Timeline.animators)if(animator._lightflowReadOnly){const row=document.querySelector('.animator[uuid="'+animator.uuid+'"]');row?.classList.add('lf-links-readonly-track');if(row)row.title=t('Source animation · read-only','Animación de origen · solo lectura');}});
            };
            owned.push({delete(){for(const animator of [...Timeline.animators])if(animator._lightflowReadOnly)Timeline.animators.remove(animator);}});
            const guardSourceKeyframe=event=>{
                const element=event.target.closest?.('.keyframe[id]');if(!element)return;
                const track=Timeline.animators.find(animator=>animator._lightflowReadOnly&&animator.keyframes.some(key=>key.uuid===element.id.replace(/^_/,'')));if(!track)return;
                event.preventDefault();event.stopImmediatePropagation();
                if(event.type==='contextmenu')new Menu([{name:t('Open source project','Abrir proyecto de origen'),icon:'open_in_new',click:()=>openSource(track.group)}]).open(event);
                else if(event.type==='mousedown')Blockbench.showQuickMessage(t('Source keyframes are read-only','Los keyframes del origen son de solo lectura'));
            };
            for(const type of ['pointerdown','mousedown','touchstart','contextmenu'])document.addEventListener(type,guardSourceKeyframe,true);
            owned.push({delete(){for(const type of ['pointerdown','mousedown','touchstart','contextmenu'])document.removeEventListener(type,guardSourceKeyframe,true);}});
            const clipTime=(root,animation)=>{const layer=layerFor(root,String(animation.uuid||animation.name));const state={...root,animation_offset:(Number(root.animation_offset)||0)+(Number(layer?.offset)||0),animation_loop:typeof layer?.loop==='boolean'?layer.loop:root.animation_loop_override?root.animation_loop:animation.loop==='loop'};return core.linkedAnimationTime(layer?.locked?{...state,animation_locked:true,animation_time:layer.time}:state,animation,timelineClock(root));};
            const timelineClock=root=>Modes.animate?Number(Timeline.time)||0:Number(root?._lightflowTime??root?.animation_time)||0;
            const animationTime=root=>animationFor(root)?clipTime(root,animationFor(root)):0;
            const updateAnimatedTree=element=>{
                updatingAnimatedTree=true;
                try{
                    element?.preview_controller?.updateTransform?.(element);
                    element?.forEachChild?.(pose=>{if(pose.type==='lightflow_pose_group')pose.preview_controller?.updateTransform?.(pose);});
                    if(Modes.animate)for(const animation of Animator.animations){
                        if(!animation.playing)continue;
                        for(const animator of Object.values(animation.animators)){
                            const node=OutlinerNode.uuids[animator.uuid];
                            if(node&&rootOf(node)===element)animator.displayFrame();
                        }
                    }
                }finally{updatingAnimatedTree=false;}
                window.ShaderEngine?.refreshExternalMeshTransforms?.(element?.mesh);
                updateOutline();
                window.Transformer?.update?.();
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
                const basePosition=mesh.position.clone(),baseRotation=mesh.rotation.clone(),baseScale=mesh.scale.clone();
                for(const animation of animationsFor(root)){
                    const time=clipTime(root,animation);
                    const position=sampleLinkedChannel(pose,animation,'position',time);
                    const rotation=sampleLinkedChannel(pose,animation,'rotation',time);
                    const scale=sampleLinkedChannel(pose,animation,'scale',time);
                    if(position){if(animation.override)mesh.position.copy(basePosition);mesh.position.add(new THREE.Vector3().fromArray(position));}
                    if(rotation){if(animation.override)mesh.rotation.copy(baseRotation);mesh.rotation.x+=Math.degToRad(rotation[0]);mesh.rotation.y+=Math.degToRad(rotation[1]);mesh.rotation.z+=Math.degToRad(rotation[2]);}
                    if(scale){if(animation.override)mesh.scale.copy(baseScale);mesh.scale.multiply(new THREE.Vector3().fromArray(scale.map(value=>value===0?.00001:value)));}
                }
            };
            // A native, unsaved clock enables Timeline playback when the scene has
            // no local animation. It is never inserted into Animation.all.
            const timelineCarriers=new Map();
            const ensureTimeline=()=>{
                if(!Modes.animate||!Project)return;
                const current=Animation.selected;
                if(current&&!current._lightflowSceneLinkClock&&((Number(current.length)||0)>0||Object.values(current.animators||{}).some(animator=>animator.keyframes?.length)))return;
                const roots=(Project.elements||[]).filter(e=>e.type==='lightflow_scene_instance');
                const length=Math.max(.001,...roots.flatMap(root=>animationsFor(root).map(a=>(Number(a.length)||0)+Math.max(0,-((Number(root.animation_offset)||0)+(Number(layerFor(root,String(a.uuid||a.name))?.offset)||0))))));
                let carrier=timelineCarriers.get(Project);
                if(!carrier){carrier=new Animation({name:t('Linked scene timeline','Timeline de escena vinculada'),length,loop:'hold'});carrier._lightflowSceneLinkClock=true;timelineCarriers.set(Project,carrier);}
                carrier.length=length;
                if(current!==carrier){if(current)current.selected=false;Animation.selected=carrier;carrier.selected=true;}
                Timeline.vue.animation_length=length;Timeline.updateSize();
            };
            const syncTimeline=()=>{
                if(disposed||!Project)return;
                for(const root of Project.elements||[])if(root.type==='lightflow_scene_instance'){
                    if(Modes.animate)root._lightflowTime=Number(Timeline.time)||0;
                    updateAnimatedTree(root);
                }
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
                edit(root,{animation_ids:next,animation_id:next.includes(root.animation_id)?root.animation_id:next[0]||'',animation_layers:layers},t('Choose linked animations','Elegir animaciones vinculadas'));
                ensureTimeline();updateAnimatedTree(root);
            };
            const setAnimation=(element,id)=>setAnimations(element,id?[id]:[]);
            const selectClip=(element,id)=>{
                const root=rootOf(element);if(!root)return;
                const locked=(root.animation_layers||[]).filter(layer=>layer.locked&&animationIds(root).includes(layer.id)&&layer.id!==id);
                const inactive=(root.animation_layers||[]).filter(layer=>!animationIds(root).includes(layer.id)&&layer.id!==id);
                const existing=layerFor(root,id);
                edit(root,{animation_id:id,animation_ids:[...locked.map(layer=>layer.id),id],animation_layers:[...inactive,...locked,existing||{id,locked:false,time:0}]},t('Select linked clip','Seleccionar clip vinculado'));
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
                edit(root,{animation_ids:next,animation_layers:layers,...(!next.includes(root.animation_id)?{animation_id:next[0]||''}:{})},t('Change linked playback state','Cambiar estado de reproducción vinculada'));
                ensureTimeline();updateAnimatedTree(root);
            };
            const setAnimationTime=(element,time)=>{
                const root=rootOf(element);if(!root)return;
                edit(root,{animation_locked:true,animation_time:Math.max(0,Number(time)||0)},t('Lock linked animation pose','Fijar pose de animación vinculada'));updateAnimatedTree(root);
            };
            const setClipPlayback=(root,id,locked)=>{
                const ids=animationIds(root),layers=(root.animation_layers||[]).filter(layer=>layer.id!==id);
                layers.push({...layerFor(root,id),id,locked,time:locked?timelineClock(root):0});
                edit(root,{animation_ids:ids.includes(id)?ids:[...ids,id],animation_layers:layers,animation_id:root.animation_id||id},t('Change linked playback state','Cambiar estado de reproducción vinculada'));
                ensureTimeline();updateAnimatedTree(root);
            };
            const togglePlayback=()=>{ensureTimeline();if(Timeline.playing)Timeline.pause();else Timeline.start();};
            const showAnimationMenu=(root,anchor)=>{
                if(!root)return;
                const menu=new Menu(()=>[
                    {name:t('Original pose','Pose original'),icon:animationIds(root).length?'radio_button_unchecked':'check_box',click:()=>setAnimations(root,[])},
                    '_',...(root._lightflowManifest?.animations||[]).map(a=>({
                        name:a.name+(a.supported?'':' · '+t('unsupported','incompatible')),
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
                edit(root,{animation_layers:layers},t('Offset linked clip','Desfasar clip vinculado'));ensureTimeline();updateAnimatedTree(root);
            };
            const showClipMenu=(root,id,anchor)=>{
                const clip=root?._lightflowManifest?.animations?.find(a=>a.id===id);if(!clip)return;
                const totalOffset=()=>(Number(root.animation_offset)||0)+(Number(layerFor(root,id)?.offset)||0);
                const menu=new Menu([
                    {name:t('Start at timeline cursor','Comenzar en el cursor del timeline')+' · '+Timeline.time.toFixed(2)+' s',icon:'vertical_align_center',click:()=>setClipOffset(root,id,-Timeline.time)},
                    {name:t('Edit time offset…','Editar desfase de tiempo…'),icon:'schedule',click:()=>{
                        const dialog=new Dialog('lightflow_linked_clip_offset',{title:clip.name,width:440,form:(window.LightManagerUI?.prepareForm || (form => form))({
                            offset:{label:t('Time offset (seconds)','Desfase de tiempo (segundos)'),type:'number',value:totalOffset(),step:.05},
                            help:{type:'info',text:t('Clip time = timeline + offset. A negative offset delays its start.','Tiempo del clip = timeline + desfase. Un valor negativo retrasa su inicio.')}
                        }),onConfirm(values){if(root._lightflowProject===Project)setClipOffset(root,id,values.offset);dialog.delete();}});
                        offsetDialog?.delete();offsetDialog=dialog;dialog.show();
                    }},
                    {name:t('Reset offset','Restablecer desfase'),icon:'restart_alt',click:()=>setClipOffset(root,id,0)},
                    {name:t('Loop animation','Repetir animación'),icon:(typeof layerFor(root,id)?.loop==='boolean'?layerFor(root,id).loop:root.animation_loop_override?root.animation_loop:root._lightflowAnimations?.find(a=>String(a.uuid||a.name)===id)?.loop==='loop')?'check_box':'check_box_outline_blank',click:()=>{
                        const source=root._lightflowAnimations?.find(a=>String(a.uuid||a.name)===id),existing=layerFor(root,id);
                        const looping=typeof existing?.loop==='boolean'?existing.loop:root.animation_loop_override?root.animation_loop:source?.loop==='loop';
                        const layers=(root.animation_layers||[]).filter(layer=>layer.id!==id).map(layer=>({...layer}));layers.push({...existing,id,loop:!looping});
                        edit(root,{animation_layers:layers},t('Change clip loop','Cambiar bucle del clip'));updateAnimatedTree(root);
                    }},
                    '_',{name:t('Playback state','Estado de reproducción'),icon:'play_circle',children:[
                        {name:t('Play','Reproducir'),icon:'far.fa-play-circle',click:()=>setClipPlayback(root,id,false)},
                        {name:t('Lock current pose','Bloquear pose actual'),icon:'fas.fa-lock',click:()=>setClipPlayback(root,id,true)}
                    ]}
                ]);
                activeAnimationMenu?.hide();activeAnimationMenu=menu;menu.open(anchor);
            };
            let offsetDialog=null;
            owned.push({delete(){offsetDialog?.delete();}});
            let activeAnimationMenu=null;
            owned.push({delete(){activeAnimationMenu?.hide();}});

            const openSource=async element=>{
                const path=sourcePath(element);
                if(!path)return;
                const existing=window.ModelProject?.all?.find(project=>paths.normalize(project.save_path||'')===paths.normalize(path));
                if(existing){existing.select();return;}
                try{const text=await readFile(path);Codecs.project.load(core.parseBBModel(text),{path});}
                catch(error){Blockbench.showQuickMessage(t('Could not open source project','No se pudo abrir el proyecto origen'));}
            };
            const importPath=async(path,automatic=false)=>{
                const targetProject=Project;
                const receiver=Project?.save_path||'';
                if(receiver&&paths.normalize(receiver).toLowerCase()===paths.normalize(path).toLowerCase()){
                    Blockbench.showMessageBox({title:t('Choose another project','Elige otro proyecto'),message:t('A project cannot contain a linked instance of itself.','Un proyecto no puede contener una instancia vinculada de sí mismo.')});
                    return;
                }
                const link=core.makeLinkReference(path,receiver,paths);
                const result=await core.readLinkedSource(link,receiver,paths,{readFile,prepareModel:prepareSourceModel},hash);
                if(disposed||Project!==targetProject)return;
                if(result.status!=='ready'){
                    Blockbench.showMessageBox({title:t('Cannot link this scene','No se puede vincular esta escena'),message:result.message||statusText({_lightflowStatus:result.status})});
                    return;
                }
                if(!result.manifest.visualCount){
                    Blockbench.showMessageBox({title:t('No supported geometry','Sin geometría compatible'),message:t('Choose a project with cubes, meshes or billboards. Effects and locators are not imported.','Elige un proyecto con cubos, mallas o billboards. Los efectos y localizadores no se importan.')});
                    return;
                }
                const name=result.manifest.name||paths.normalize(path).split('/').pop().replace(/\.bbmodel$/i,'');
                const hasCustomMaterials=result.model.elements?.some(item=>item.sa_material_instance_id);
                const addInstance=form=>{
                    if(disposed||Project!==targetProject)return false;
                    const geometry=form.geometry!==false&&!!(result.manifest.elementTypes.cube||result.manifest.elementTypes.mesh),billboards=!!form.billboards&&!!result.manifest.elementTypes.billboard;
                    if(!geometry&&!billboards)return false;
                    Undo.initEdit({outliner:true,elements:[],selection:true});
                    const element=new SceneInstanceElement({name:form.name||name,source_link:JSON.stringify(link),include_geometry:geometry,include_billboards:billboards}).init();
                    element._lightflowProject=Project;element.addTo();element.select();
                    assetCache.set(result.cacheKey,result);mountResult(element,result);
                    Undo.finishEdit(t('Add linked scene','Añadir escena vinculada'),{outliner:true});return element;
                };
                if(automatic)return addInstance({name,geometry:true,billboards:true});
                importDialog?.delete?.();
                const checkboxRow=window.LightManagerUI?.formDesign?.checkboxRow || (options=>({type:'checkbox',...options}));
                const geometryCount=(result.manifest.elementTypes.cube||0)+(result.manifest.elementTypes.mesh||0);
                const billboardCount=result.manifest.elementTypes.billboard||0;
                importDialog=new Dialog('lightflow_scene_link_import',{title:t('Link a scene','Vincular una escena'),width:460,form:(window.LightManagerUI?.prepareForm || (form => form))({
                    summary:{type:'info',text:t('Choose what this instance includes. Textures follow the selected geometry.','Elige qué incluye esta instancia. Las texturas acompañan a la geometría elegida.')},
                    name:{type:'text',label:t('Instance name','Nombre de instancia'),value:name},
                    geometry:checkboxRow({label:t('Geometry','Geometría'),supporting_text:t('Cubes and meshes from the source project.','Cubos y mallas del proyecto de origen.'),summary:geometryCount,value:true,condition:geometryCount>0}),
                    billboards:checkboxRow({label:'Billboards',supporting_text:t('Sprite elements from the source project.','Elementos sprite del proyecto de origen.'),summary:billboardCount,value:true,condition:billboardCount>0}),
                    skipped:{type:'info',condition:Object.keys(result.manifest.ignoredTypes).length>0,text:t('Excluded from this version: ','Se excluyen en esta versión: ')+Object.entries(result.manifest.ignoredTypes).map(([type,count])=>`${count} ${type}`).join(', ')+'.'},
                    animations:{type:'info',condition:result.manifest.animations.length>0,text:`${result.manifest.animations.length} ${t('source animations available in the instance inspector. Group transforms only; effect tracks are excluded.','animaciones del origen disponibles en el inspector de la instancia. Solo transformaciones de grupos; las pistas de efectos se excluyen.')}`},
                    material_note:{type:'info',condition:hasCustomMaterials,text:t('Source material overrides are preserved. Receiver overrides take priority.','Se conservan los overrides del origen. Los overrides de esta instancia tienen prioridad.')},
                    file:{type:'info',text:path}
                }),onConfirm(form){
                    if(disposed||Project!==targetProject)return false;
                    const geometry=!!form.geometry&&!!(result.manifest.elementTypes.cube||result.manifest.elementTypes.mesh),billboards=!!form.billboards&&!!result.manifest.elementTypes.billboard;
                    if(!geometry&&!billboards){Blockbench.showQuickMessage(t('Select geometry or billboards','Selecciona geometría o billboards'));return false;}
                    addInstance(form);
                }});importDialog.show();
            };
            const chooseSource=(element=null)=>Blockbench.import({extensions:['bbmodel'],type:t('Blockbench project','Proyecto de Blockbench'),resource_id:'lightflow_scene_link'},files=>{
                const path=files?.[0]?.path;
                if(!path)return;
                if(element){
                    const link=core.makeLinkReference(path,element._lightflowProject?.save_path||Project?.save_path||'',paths);
                    edit(element,{source_link:JSON.stringify(link)},t('Relink scene','Revincular escena'));
                    refreshInstance(element,true);
                }else importPath(path);
            });
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
                    if(form.model==='flat_texture'){Blockbench.showQuickMessage(t('Choose a 3D skin model.','Elige un modelo de skin 3D.'));return false;}
                    if(form.texture_source==='upload_texture'&&!form.texture_file){Blockbench.showQuickMessage(t('Choose a skin texture.','Elige una textura de skin.'));return false;}
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
                            if(attempt===599){Blockbench.showQuickMessage(t('Load a skin texture before saving this project.','Carga una textura de skin antes de guardar este proyecto.'));return;}
                            await new Promise(resolve=>setTimeout(resolve,100));
                        }
                        if(disposed||Project!==skin)return;
                        Blockbench.export({resource_id:'model',type:Codecs.project.name,extensions:['bbmodel'],name:skin.name||'Skin',content:null,
                            custom_writer(_content,path){
                                if(disposed||Project!==skin)return;
                                if(receiver.save_path&&paths.normalize(path).toLowerCase()===paths.normalize(receiver.save_path).toLowerCase()){Blockbench.showQuickMessage(t('Save the skin separately from the current scene.','Guarda la skin en un archivo distinto de la escena actual.'));return;}
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
                const picker=new Dialog('lightflow_scene_link_picker',{title:t('Linked scene','Escena vinculada'),width:860,buttons:[],component:{
                    data(){return {query:'',projects};},
                    computed:{visible(){const q=this.query.trim().toLowerCase();return this.projects.filter(project=>!q||`${project.name} ${project.path}`.toLowerCase().includes(q));}},
                    methods:{
                        choose(project){if(project.self)return;picker.hide();importPath(project.path);},
                        browse(){picker.hide();chooseSource();},
                        skin(){picker.hide();createSkinLink();},
                        close(){picker.hide();}
                    },
                    template:`<div class="lf-links-picker">
                        <header class="lf-links-picker-head"><div><div class="lf-links-eyebrow">LIGHTFLOW · SCENE LINKS</div><h2>${t('Compose with a linked project','Compón con un proyecto vinculado')}</h2><p>${t('Choose a Blockbench project. Each instance has its own position and pose; the model stays connected to its source.','Elige un proyecto de Blockbench. Cada instancia tiene posición y pose propias; el modelo sigue conectado a su origen.')}</p></div><button type="button" class="lf-links-browse" @click="browse"><i class="material-icons">folder_open</i>${t('Choose .bbmodel…','Elegir .bbmodel…')}</button></header>
                        <div class="lf-links-picker-tools"><button type="button" class="lf-links-browse" @click="skin"><i class="material-icons">person_add</i>${t('Create skin…','Crear skin…')}</button><label><i class="material-icons">search</i><input v-model="query" type="search" :placeholder="'${t('Find a project','Buscar proyecto')}'" :aria-label="'${t('Find a project','Buscar proyecto')}'"></label><span>{{ visible.length }} ${t('projects','proyectos')}</span></div>
                        <main class="lf-links-picker-scroll"><div v-if="visible.length" class="lf-links-grid"><button v-for="project in visible" :key="project.path" type="button" class="lf-links-card" :disabled="project.self" :title="project.path" @click="choose(project)"><div class="lf-links-cover"><img v-if="project.thumbnail" :src="project.thumbnail" @error="project.thumbnail=''" alt=""><div v-else class="lf-links-cover-fallback"><i class="material-icons">view_in_ar</i></div><span class="lf-links-origin">{{ project.self ? '${t('Current scene','Escena actual')}' : project.open ? '${t('Open','Abierto')}' : '${t('Recent','Reciente')}' }}</span></div><div class="lf-links-card-info"><i class="material-icons">{{ project.self ? 'block' : 'kid_star' }}</i><div><strong>{{ project.name }}</strong><small>{{ project.path }}</small></div></div></button></div><div v-else class="lf-links-empty"><i class="material-icons">search_off</i><p>${t('No matching projects. Choose a .bbmodel file to continue.','No hay proyectos coincidentes. Elige un archivo .bbmodel para continuar.')}</p><button type="button" @click="browse">${t('Choose file','Elegir archivo')}</button></div></main>
                        <footer class="lf-links-picker-foot"><span>${t('The source remains editable in its own tab.','El origen se puede seguir editando en su propia pestaña.')}</span><button type="button" @click="close">${t('Close','Cerrar')}</button></footer>
                    </div>`
                }});
                pickerDialog=picker;picker.show();
            };
            const addAction=new Action('lightflow_scene_link_add',{name:'lightflow_links.add',icon:'kid_star',category:'edit',condition:()=>!!Project,click:showSourcePicker});
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
                Undo.finishEdit(t('Apply skin pose','Aplicar pose de skin'));
                updateOutline();syncPanel();window.updateSelection?.();
            };
            const skinPoseAction=new Action('lightflow_scene_link_skin_pose',{
                name:t('Skin pose','Pose de skin'),icon:'accessibility_new',category:'edit',
                condition:()=>rootOf(selected())?._lightflowManifest?.format==='skin',
                children(){
                    const root=rootOf(selected());
                    const apply=(preset,data)=>applySkinPose(root,preset,data).catch(error=>{if(!disposed)Blockbench.showMessageBox({title:t('Cannot apply pose','No se puede aplicar la pose'),message:String(error.message||error)});});
                    const items=['none','natural','walking','crouching','sitting','jumping','aiming'].map(id=>({name:tl('panel.skin_pose.'+id),icon:'accessibility_new',click:()=>apply(id)}));
                    const saved=StateMemory.get('skin_poses')||[];
                    if(saved.length)items.push('_',{name:t('Saved poses','Poses guardadas'),icon:'format_list_bulleted',children:saved.map(pose=>({name:pose.name,icon:'accessibility',click:()=>apply(undefined,JSON.parse(JSON.stringify(pose.data)))}))});
                    items.push('_',{name:t('Restore source pose','Restaurar pose del origen'),icon:'restart_alt',click:()=>{
                        const poses=[...treeFor(root).values()];Undo.initEdit({elements:poses});
                        for(const pose of poses){pose.extend({pose_mode:'additive',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});pose.preview_controller.updateTransform(pose);}
                        Undo.finishEdit(t('Restore source pose','Restaurar pose del origen'));updateOutline();syncPanel();window.updateSelection?.();
                    }});return items;
                }
            });
            owned.push(skinPoseAction);
            const openAction=new Action('lightflow_scene_link_open',{name:'lightflow_links.open',icon:'open_in_new',category:'edit',condition:()=>!!rootOf(selected()),click:()=>openSource(selected())});
            const refreshAction=new Action('lightflow_scene_link_refresh',{name:'lightflow_links.refresh',icon:'sync',category:'edit',condition:()=>!!rootOf(selected()),click:()=>refreshInstance(rootOf(selected()),true)});
            const relocateAction=new Action('lightflow_scene_link_relocate',{name:'lightflow_links.relocate',icon:'folder_open',category:'edit',condition:()=>!!rootOf(selected()),click:()=>chooseSource(rootOf(selected()))});
            const resetAction=new Action('lightflow_scene_link_reset_pose',{name:'lightflow_links.reset',icon:'restart_alt',category:'edit',condition:()=>selected()?.type==='lightflow_pose_group',click:()=>edit(selected(),{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},t('Reset local pose','Restablecer pose local'))});
            const inspectAction=new Action('lightflow_scene_link_inspect',{name:t('Instance settings','Ajustes de instancia'),icon:'kid_star',category:'edit',condition:()=>!!rootOf(selected()),click:()=>{arrangeInspector();syncPanel();inspector?.getHostPanel?.()?.selectTab?.(inspector);}});
            const materialAction=new Action('lightflow_scene_link_material',{name:t('Material override','Sobrescribir material'),icon:'palette',condition:()=>!!rootOf(selected()),click:event=>{
                const node=selected(),manager=window.MaterialManager;if(!node||!manager)return;
                const assign=id=>{edit(node,{lightflow_material_override:id},t('Override linked material','Sobrescribir material vinculado'));refreshLinkedMaterials();syncPanel();};
                new Menu([
                    {name:t('Inherit material','Heredar material'),icon:node.lightflow_material_override?'radio_button_unchecked':'radio_button_checked',click:()=>assign('')},
                    '_',
                    ...Object.values(manager.instances||{}).map(instance=>({name:instance.name||instance.id,icon:node.lightflow_material_override===instance.id?'radio_button_checked':instance.icon||'palette',click:()=>assign(instance.id)})),
                    '_',
                    ...Object.values(manager.materials||{}).map(material=>({name:material.name||material.id,icon:node.lightflow_material_override===material.id?'radio_button_checked':material.icon||'palette',click:()=>assign(material.id)}))
                ]).open(event);
            }});
            owned.push(materialAction);
            owned.push(addAction,openAction,refreshAction,relocateAction,resetAction,inspectAction);
            MenuBar.addAction(addAction,'tools');
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
            SceneInstanceElement.prototype.menu=new Menu(['lightflow_scene_link_inspect','lightflow_scene_link_skin_pose','lightflow_scene_link_material','lightflow_scene_link_refresh','lightflow_scene_link_open','lightflow_scene_link_relocate','set_element_marker_color','_',...Outliner.control_menu_group,'_','rename','delete']);
            ScenePoseElement.prototype.menu=new Menu(['lightflow_scene_link_inspect','lightflow_scene_link_skin_pose','lightflow_scene_link_material','lightflow_scene_link_reset_pose','lightflow_scene_link_open','_',...Outliner.control_menu_group,'_','rename','delete']);

            const inspectorFields=[
                {key:'position',icon:'open_with',label:t('Position','Posición'),poseLabel:t('Offset','Desplazamiento'),step:.25,reset:0},
                {key:'rotation',icon:'sync',label:t('Rotation','Rotación'),poseLabel:t('Rotation','Rotación'),step:1,reset:0},
                {key:'scale',icon:'aspect_ratio',label:t('Scale','Escala'),poseLabel:t('Scale','Escala'),step:.1,reset:1}
            ];
            inspector=new Panel('lightflow_scene_links_inspector',{name:t('Scene Links','Escenas vinculadas'),icon:'kid_star',growable:true,resizable:true,
                condition:{modes:['edit'],project:true},default_position:{slot:'right_bar',height:350,folded:false,attached_to:'transform',attached_index:1},
                component:{
                    data(){return {currentId:'',rootId:'',name:'',rootName:'',pose:false,renderMode:false,status:'',statusKey:'ready',path:'',file:'',poseMode:'additive',modified:0,stats:null,materialLimit:false,animations:[],animationId:'',playing:false,playbackTime:0,animationLength:0,loop:false,values:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},fields:inspectorFields};},
                    methods:{
                        syncSelection(){
                            const element=selected(),root=rootOf(element);
                            this.currentId=element?.uuid||'';this.rootId=root?.uuid||'';this.pose=element?.type==='lightflow_pose_group';this.renderMode=!!Modes.render;
                            this.name=element?.name||'';this.rootName=root?.name||'';this.status=root?statusText(root):'';this.statusKey=root?._lightflowStatus||'ready';
                            this.path=root?sourcePath(root):'';this.file=this.path.split(/[\\/]/).pop()||t('Source unavailable','Origen no disponible');
                            this.poseMode=this.pose?element.pose_mode||'additive':'additive';
                            this.values={position:element?.position?.slice()||[0,0,0],rotation:element?.rotation?.slice()||[0,0,0],scale:element?.scale?.slice()||[1,1,1]};
                            this.stats=root?._lightflowManifest||null;this.materialLimit=!!root?._lightflowMaterialLimit;
                            this.animations=this.stats?.animations||[];this.animationId=root?.animation_id||'';this.loop=!!root?.animation_loop;this.animationLength=Number(animationFor(root)?.length)||0;this.syncPlayback();
                            let count=0;
                            root?.forEachChild?.(child=>{if(child.type==='lightflow_pose_group'&&(child.pose_mode==='absolute'||child.position?.some(v=>v!==0)||child.rotation?.some(v=>v!==0)||child.scale?.some(v=>v!==1)))count++;});
                            this.modified=count;
                        },
                        syncPlayback(){const root=OutlinerNode.uuids?.[this.rootId];this.playbackTime=animationTime(root);this.playing=!!root?._lightflowPlaying;},
                        chooseAnimation(event){setAnimation(selected(),event.target.value);},
                        play(){togglePlayback(selected());},
                        scrub(event){setAnimationTime(selected(),event.target.value);},
                        previewTime(event){const root=rootOf(selected());if(!root)return;root._lightflowPlaying=false;root._lightflowTime=Number(event.target.value)||0;updateAnimatedTree(root);this.syncPlayback();},
                        toggleLoop(){const root=rootOf(selected());if(root)edit(root,{animation_loop:!root.animation_loop},t('Change linked animation loop','Cambiar repetición de animación vinculada'));},
                        commitAxis(event,key,axis){
                            const element=selected();if(!element||element.uuid!==this.currentId)return;
                            const value=Number(event.target.value);if(!Number.isFinite(value)){event.target.value=this.values[key][axis];return;}
                            if(value===element[key][axis])return;
                            const next=element[key].slice();next[axis]=value;
                            edit(element,{[key]:next},t('Edit linked transform','Editar transformación vinculada'));
                        },
                        resetField(field){const element=selected();if(element?.uuid!==this.currentId)return;edit(element,{[field.key]:[field.reset,field.reset,field.reset]},t('Reset linked transform','Restablecer transformación vinculada'));},
                        setPoseMode(mode){const element=selected();if(element?.type==='lightflow_pose_group'&&element.pose_mode!==mode)edit(element,{pose_mode:mode},t('Change pose mode','Cambiar modo de pose'));},
                        selectRoot(){const root=OutlinerNode.uuids[this.rootId];root?.clickSelect?.();if(root&&!root.selected)root.select();},
                        openSource(){openAction.trigger();},refresh(){refreshAction.trigger();},relink(){relocateAction.trigger();},resetPose(){resetAction.trigger();},add(){showSourcePicker();}
                    },
                    mounted(){this.syncSelection();},
                    template:`<div class="lf-links-inspector">
                        <div v-if="!currentId" class="lf-links-inspector-empty"><i class="material-icons">kid_star</i><strong>${t('Build a scene with linked projects','Compón una escena con proyectos vinculados')}</strong><p>${t('Choose an instance in the Outliner to place it, or open a group to pose it.','Selecciona una instancia en el Outliner para colocarla, o abre un grupo para posarlo.')}</p><button type="button" @click="add"><i class="material-icons">add</i>${t('Add linked scene','Añadir escena vinculada')}</button></div>
                        <template v-else>
                            <div class="lf-links-inspector-head">
                                <button v-if="pose" type="button" class="lf-links-back" @click="selectRoot" :title="rootName" :aria-label="'${t('Select instance','Seleccionar instancia')}'"><i class="material-icons">arrow_back</i></button>
                                <i v-else class="material-icons lf-links-head-icon">kid_star</i>
                                <div class="lf-links-title"><strong :title="name">{{ name }}</strong></div>
                                <span v-if="!pose" class="lf-links-status" :class="'lf-links-status-'+statusKey"><span class="lf-links-status-dot"></span>{{ status }}</span>
                                <button v-else type="button" class="lf-links-icon-action" @click="resetPose" :title="'${t('Reset group pose','Restablecer pose del grupo')}'" :aria-label="'${t('Reset group pose','Restablecer pose del grupo')}'"><i class="material-icons">restart_alt</i></button>
                            </div>
                            <div v-if="!pose" class="lf-links-source-card"><div class="lf-links-source-title"><i class="material-icons">description</i><span :title="path+(stats ? ' · '+stats.groups.length+' ${t('groups','grupos')}, '+stats.elements.length+' ${t('elements','elementos')}, '+stats.textures.length+' ${t('textures','texturas')}' : '')">{{ file }}</span><span v-if="materialLimit" class="lf-links-material-badge" :title="'${t('Source material overrides are not linked yet','Los materiales personalizados del origen aún no se vinculan')}'">${t('Textures only','Solo texturas')}</span></div></div>
                            <div v-if="!pose" class="lf-links-quick-actions"><button type="button" @click="refresh" :disabled="statusKey==='updating'" :title="'${t('Read the latest saved source','Leer la última versión guardada del origen')}'"><i class="material-icons">sync</i>${t('Update','Actualizar')}</button><button type="button" @click="openSource" :title="'${t('Edit the source project','Editar el proyecto origen')}'"><i class="material-icons">open_in_new</i>${t('Open','Abrir')}</button><button type="button" @click="relink" :title="'${t('Find a moved source','Buscar un origen movido')}'"><i class="material-icons">folder_open</i>${t('Find','Buscar')}</button></div>
                            <div v-if="!pose && statusKey!=='ready'" class="lf-links-notice" role="status"><i class="material-icons">{{ statusKey==='updating' ? 'sync' : 'info_outline' }}</i><span>{{ status }}</span></div>
                            <div v-if="renderMode" class="lf-links-section-label"><span>{{ pose ? '${t('Pose this group','Posar este grupo')}' : '${t('Place the instance','Colocar la instancia')}' }}</span><span v-if="!pose && modified" class="lf-links-pose-count">{{ modified }} ${t('posed','con pose')}</span></div>
                            <div v-if="pose" class="lf-links-mode" role="group" :aria-label="'${t('Pose mode','Modo de pose')}'"><button type="button" :class="{active:poseMode==='additive'}" :aria-pressed="poseMode==='additive'" :title="'${t('Adds to the source pose; follows later source edits.','Se suma a la pose original y sigue sus cambios.')}'" @click="setPoseMode('additive')">${t('Additive','Aditiva')}</button><button type="button" :class="{active:poseMode==='absolute'}" :aria-pressed="poseMode==='absolute'" :title="'${t('Keeps fixed values if the source pose changes.','Conserva valores fijos si cambia la pose original.')}'" @click="setPoseMode('absolute')">${t('Absolute','Absoluta')}</button></div>
                            <template v-if="renderMode"><div class="lf-links-transform" v-for="field in fields" :key="field.key"><div class="lf-links-transform-head"><label><i class="material-icons">{{ field.icon }}</i>{{ pose ? field.poseLabel : field.label }}</label><button type="button" class="lf-links-reset-field" @click="resetField(field)" :title="'${t('Reset','Restablecer')}'+' '+field.label" :aria-label="'${t('Reset','Restablecer')}'+' '+field.label"><i class="material-icons">restart_alt</i></button></div><div class="lf-links-axis-row"><label v-for="(axis,index) in ['X','Y','Z']" :key="axis" :class="'lf-links-axis-'+axis.toLowerCase()"><span>{{ axis }}</span><input type="number" :step="field.step" :value="values[field.key][index]" :aria-label="(pose ? field.poseLabel : field.label)+' '+axis" @change="commitAxis($event,field.key,index)" @keydown.enter="$event.target.blur()"></label></div></div></template>
                        </template>
                    </div>`
                }});
            motionPanel=new Panel('lightflow_scene_links_animation',{
                name:t('Linked animation','Animación vinculada'),icon:'cinematic_blur',growable:false,resizable:false,
                condition:()=>!!Project&&!!Modes.animate&&!!rootOf(selected()),
                default_position:{slot:'right_bar',height:100,folded:false,sidebar_index:7},
                component:{
                    data(){return {rootName:'',summary:'',locked:false,offset:0,loop:false,time:0,count:0};},
                    methods:{
                        syncSelection(){const root=rootOf(selected());this.rootName=root?.name||'';this.locked=!!root?.animation_locked;this.offset=Number(root?.animation_offset)||0;this.loop=root?.animation_loop_override?!!root.animation_loop:animationFor(root)?.loop==='loop';
                            const clips=animationsFor(root);this.count=clips.length;this.summary=clips.length===1?clips[0].name:clips.length?clips.length+' '+t('animations','animaciones'):t('Original pose','Pose original');this.syncPlayback();},
                        syncPlayback(){const root=rootOf(selected());this.time=animationTime(root);},
                        choose(event){showAnimationMenu(rootOf(selected()),event.currentTarget);},
                        setClock(locked){const root=rootOf(selected());if(!root)return;edit(root,{animation_locked:locked,...(locked?{animation_time:timelineClock(root)}:{})},t('Change linked clock','Cambiar reloj vinculado'));updateAnimatedTree(root);ensureTimeline();},
                        setOffset(event){const root=rootOf(selected()),value=Number(event.target.value);if(!root||!Number.isFinite(value))return;edit(root,{animation_offset:value},t('Offset linked animation','Desfasar animación vinculada'));ensureTimeline();updateAnimatedTree(root);},
                        toggleLoop(){const root=rootOf(selected());if(!root)return;edit(root,{animation_loop:!this.loop,animation_loop_override:true},t('Change linked loop','Cambiar repetición vinculada'));updateAnimatedTree(root);}
                    },
                    mounted(){this.syncSelection();},
                    template:`<div class="lf-links-inspector lf-links-animation-panel">
                        <div class="lf-links-clock-head"><strong :title="rootName">{{ rootName }}</strong><span :title="'${t('Evaluated clip time','Tiempo evaluado del clip')}'">{{ time.toFixed(2) }} s</span></div>
                        <div class="lf-links-mode lf-links-clock-mode" role="group" :aria-label="'${t('Animation clock','Reloj de animación')}'"><button type="button" :class="{active:!locked}" :aria-pressed="!locked" @click="setClock(false)" :title="'${t('Follow the native timeline plus Offset','Seguir el timeline nativo más Offset')}'"><i class="material-icons">timeline</i>Timeline</button><button type="button" :class="{active:locked}" :aria-pressed="locked" @click="setClock(true)" :title="'${t('Keep the pose at the current timeline time','Conservar la pose en el instante actual del timeline')}'"><i class="material-icons">lock</i>Lock in</button></div>

                    </div>`
                }
            });
            owned.push(motionPanel);
            const libraryHost=document.createElement('li');
            const libraryVM=new Vue({
                data(){return {instances:[],selectedId:'',folded:{},query:''};},
                methods:{
                    sync(){this.selectedId=rootOf(selected())?.uuid||'';this.instances=(Project?.elements||[]).filter(root=>root.type==='lightflow_scene_instance').map(root=>({id:root.uuid,name:root.name,color:root.color>=0?markerColors[root.color%markerColors.length]?.pastel:'var(--color-accent)',active:animationIds(root),focus:root.animation_id,layers:root.animation_layers||[],clips:root._lightflowManifest?.animations||[]}));this.query=Panels.animations?.inside_vue?.search_term||'';},
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
                    <ul v-if="selectedId===instance.id && !folded[instance.id]" class="indented lf-links-clip-list"><li v-for="clip in visibleClips(instance)" :key="clip.id" class="animation lf-links-library-clip" :class="{selected:instance.focus===clip.id,unsupported:!clip.supported}" :title="clip.name+(clip.supported?'':' · ${t('unsupported','incompatible')}')" :aria-disabled="!clip.supported" role="button" tabindex="0" @click.stop="choose(instance.id,clip,$event)" @keydown.enter.prevent="choose(instance.id,clip,$event)" @contextmenu.prevent.stop="clipMenu(instance.id,clip,$event)"><i class="material-icons">movie</i><label>{{ shortName(clip.name) }}</label><small v-if="Math.abs(offset(instance,clip.id))>0.00001" class="lf-links-clip-offset" :title="'${t('Clip time offset','Desfase de tiempo del clip')}'">{{ offsetLabel(offset(instance,clip.id)) }}</small><div class="in_list_button" role="button" tabindex="0" :aria-label="clip.name+' · '+state(instance,clip.id)" :title="state(instance,clip.id)==='locked'?'${t('Locked pose','Pose bloqueada')}':state(instance,clip.id)==='playing'?'${t('Playing — click to lock','Reproduciendo — clic para bloquear')}':'${t('Off — click to play','Apagada — clic para reproducir')}'" @click.stop="toggle(instance.id,clip)" @keydown.enter.stop.prevent="toggle(instance.id,clip)" @dblclick.stop><i v-if="state(instance,clip.id)==='locked'" class="fa_big fas fa-lock"></i><i v-else-if="state(instance,clip.id)==='playing'" class="fa_big far fa-play-circle"></i><i v-else class="fa_big far fa-circle"></i></div></li></ul>
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
                const target=Panels.transform;
                if(target&&(inspector.getHostPanel()?.id!==target.id||!inspector.handle?.isConnected))target.attachPanel(inspector,1);
                inspector.handle?.setAttribute?.('title',t('Scene Links','Escenas vinculadas'));
                inspector.handle?.setAttribute?.('aria-label',t('Scene Links','Escenas vinculadas'));
                const label=inspector.handle?.querySelector('span');if(label&&Modes.edit)label.textContent=t('Links','Vínculo');
            };
            arrangeInspector();
            owned.push(inspector);
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
                #panel_lightflow_scene_links_inspector .panel_vue_wrapper{min-width:0;overflow:auto;}
                .lf-links-inspector,.lf-links-inspector *{box-sizing:border-box;}
                .lf-links-inspector{display:block!important;min-width:0;padding:0 10px 8px;color:var(--color-text);font-size:12px;}
                .lf-links-inspector button{color:inherit;font:inherit;cursor:pointer;}
                .lf-links-inspector button:focus-visible,.lf-links-inspector input:focus-visible{outline:2px solid var(--lf-focus-color, var(--color-text));outline-offset:1px;}
                .lf-links-inspector-head{display:flex;align-items:center;gap:7px;min-height:36px;border-bottom:1px solid var(--color-border);}
                .lf-links-head-icon{flex:none;color:var(--color-accent);font-size:19px;}
                .lf-links-title{min-width:0;flex:1;}
                .lf-links-title strong{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;}
                .lf-links-status{display:flex;align-items:center;gap:5px;max-width:102px;font-size:11px;color:var(--color-subtle_text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
                .lf-links-status-dot{width:6px;height:6px;flex:none;border-radius:50%;background:#54b783;}
                .lf-links-status-missing .lf-links-status-dot,.lf-links-status-incompatible .lf-links-status-dot,.lf-links-status-read_error .lf-links-status-dot{background:#e7a35b;}
                .lf-links-status-updating .lf-links-status-dot{background:var(--color-accent);}
                .lf-links-back,.lf-links-icon-action{display:grid;place-items:center;width:27px;height:27px;flex:none;border-radius:8px;background:var(--color-button);}
                .lf-links-back i,.lf-links-icon-action i{font-size:17px;}
                .lf-links-icon-action{background:transparent;color:var(--color-subtle_text)!important;}
                .lf-links-icon-action:hover{background:var(--color-button);color:var(--color-text)!important;}
                .lf-links-icon-action:disabled{opacity:.4;cursor:default;}
                .lf-links-icon-action.active{color:var(--color-accent)!important;background:var(--color-button);}
                .lf-links-animation-panel{padding-top:6px;}
                .lf-links-clock-head{display:flex;gap:8px;align-items:center;margin-bottom:5px;min-width:0;}
                .lf-links-clock-head strong{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
                .lf-links-clock-head>span{font-size:11px;color:var(--color-subtle_text);font-variant-numeric:tabular-nums;flex:none;}
                #panel_lightflow_scene_links_animation .lf-links-animation-picker{display:flex;align-items:center;gap:5px;width:0;min-width:0;flex:1;height:28px;padding:0 6px;background:var(--color-button);border-radius:8px;text-align:left;}
                .lf-links-animation-picker span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
                .lf-links-animation-picker i{font-size:18px;flex:none;}
                .lf-links-clock-mode{margin-top:6px!important;}
                .lf-links-clock-mode button{display:flex;align-items:center;justify-content:center;gap:5px;}
                .lf-links-clock-mode i,.lf-links-offset i{font-size:16px;}
                .lf-links-offset{display:flex;gap:5px;align-items:center;margin-top:5px;}
                .lf-links-offset>span{display:flex;align-items:center;gap:5px;flex:1;color:var(--color-subtle_text);}
                .lf-links-offset input{width:78px;min-width:0;text-align:right;font:inherit;}
                .lf-links-offset small{color:var(--color-subtle_text);}
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
                .lf-links-motion{margin:6px 0 0;border-top:1px solid var(--color-border);padding-top:6px;}
                .lf-links-motion-row{display:flex;align-items:center;gap:4px;min-width:0;}
                .lf-links-motion-row>i{font-size:17px;width:18px;flex:none;color:var(--color-subtle_text);}
                .lf-links-motion-row select{flex:1;min-width:0;height:28px;border:1px solid var(--color-border);background:var(--color-dark);color:var(--color-text);font:inherit;}
                #panel_lightflow_scene_links_animation .lf-links-motion-row .lf-links-icon-action{width:28px;min-width:28px;max-width:28px;height:28px;min-height:28px;padding:0;display:grid;place-items:center;flex:0 0 28px;}
                .lf-links-motion-row .lf-links-icon-action i{font-size:18px;line-height:1;}
                .lf-links-time-row{display:flex;align-items:center;gap:7px;margin-top:3px;min-height:24px;}
                .lf-links-time-row input{flex:1;min-width:0;accent-color:var(--color-accent);}
                .lf-links-time-row span{flex:none;min-width:44px;text-align:right;font-variant-numeric:tabular-nums;font-size:11px;color:var(--color-subtle_text);}
                .lf-links-source-card{padding:6px 8px;margin:6px 0;background:var(--color-dark);border:1px solid var(--color-border);border-radius:8px;min-width:0;}
                .lf-links-source-title{display:flex;align-items:center;gap:7px;min-width:0;}
                .lf-links-source-title i{font-size:17px;color:var(--color-accent);flex:none;}
                .lf-links-source-title span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;}
                .lf-links-source-title .lf-links-material-badge{flex:none;color:#e7a35b;font-size:10px;font-weight:400;cursor:help;}
                #panel_lightflow_scene_links_inspector {container-type:inline-size;}
                .lf-links-axis-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;}
                @container (max-width:260px){
                    .lf-links-quick-actions button {flex-direction:column;white-space:normal;line-height:1.2;padding:5px 2px;}
                    .lf-links-axis-row {grid-template-columns:1fr;gap:3px;}
                    .lf-links-inspector-head {flex-wrap:wrap;padding-bottom:4px;}
                }
                .lf-links-quick-actions{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:5px;margin:6px 0;}
                .lf-links-quick-actions button,.lf-links-inspector-empty button{display:flex;align-items:center;justify-content:center;gap:5px;min-width:0;min-height:29px;padding:4px 6px;border-radius:8px;background:var(--color-button);white-space:nowrap;}
                .lf-links-quick-actions button:first-child{background:var(--color-accent);color:var(--lf-on-accent,var(--color-accent_text));}
                .lf-links-quick-actions button:hover,.lf-links-inspector-empty button:hover{filter:brightness(1.17);}
                .lf-links-quick-actions button:disabled{opacity:.5;cursor:wait;}
                .lf-links-quick-actions i,.lf-links-inspector-empty button i{font-size:16px;flex:none;}
                .lf-links-notice{display:flex;align-items:center;gap:6px;padding:6px 8px;margin-bottom:8px;background:var(--color-button);border-left:2px solid #e7a35b;color:var(--color-text);line-height:1.35;}
                .lf-links-notice i{font-size:15px;flex:none;}
                .lf-links-section-label{display:flex;align-items:center;justify-content:space-between;gap:7px;margin:12px 0 7px;color:var(--color-subtle_text);font-size:11px;text-transform:uppercase;letter-spacing:.045em;}
                .lf-links-pose-count{color:var(--color-accent);text-transform:none;letter-spacing:0;}
                .lf-links-transform{padding:6px 0 8px;border-top:1px solid var(--color-border);}
                .lf-links-transform-head{display:flex;align-items:center;justify-content:space-between;min-height:20px;gap:5px;margin-bottom:5px;}
                .lf-links-transform-head label{display:flex;align-items:center;gap:6px;color:var(--color-text);}
                .lf-links-transform-head label i{font-size:15px;color:var(--color-subtle_text);}
                .lf-links-reset-field{display:grid;place-items:center;width:23px!important;min-width:23px!important;height:22px!important;min-height:22px!important;padding:0!important;border-radius:8px;color:var(--color-subtle_text)!important;}
                .lf-links-reset-field:hover{background:var(--color-button);color:var(--color-text)!important;}
                .lf-links-reset-field i{font-size:16px;}
                .lf-links-axis-row label{display:flex;align-items:center;min-width:0;min-height:29px;background:var(--color-back);border:1px solid var(--color-border);border-radius:8px;}
                .lf-links-axis-row span{flex:none;width:20px;text-align:center;font-size:10px;font-weight:700;}
                .lf-links-axis-x span{color:#e27d87}.lf-links-axis-y span{color:#86c477}.lf-links-axis-z span{color:#77a8eb}
                .lf-links-axis-row input{width:100%;min-width:0;height:27px;border:0;background:transparent;color:var(--color-text);font:inherit;text-align:right;padding:0 4px 0 0;appearance:textfield;-moz-appearance:textfield;}
                .lf-links-axis-row label:focus-within{outline:2px solid var(--lf-focus-color, var(--color-text));outline-offset:2px;}
                .lf-links-axis-row input::-webkit-outer-spin-button,.lf-links-axis-row input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
                .lf-links-mode{display:grid;grid-template-columns:1fr 1fr;margin-top:7px;border:1px solid var(--color-border);border-radius:8px;overflow:hidden;}
                .lf-links-mode button{min-height:29px;background:var(--color-dark);}
                .lf-links-mode button+button{border-left:1px solid var(--color-border);}
                .lf-links-mode button.active{background:var(--color-accent);color:var(--lf-on-accent,var(--color-accent_text));}
                .lf-links-inspector-empty{display:grid;justify-items:center;gap:8px;padding:30px 10px;text-align:center;}
                .lf-links-inspector-empty>i{display:grid;place-items:center;width:40px;height:40px;line-height:40px;font-size:30px;color:var(--color-accent); justify-content: center; overflow: visible;}
                .lf-links-inspector-empty strong{font-size:13px;}.lf-links-inspector-empty p{margin:0 0 5px;color:var(--color-subtle_text);line-height:1.4;}
                #lightflow_scene_link_picker .dialog_wrapper{width:min(860px,calc(100vw - 28px));max-width:calc(100vw - 28px);}
                #lightflow_scene_link_picker .dialog_content{padding:0!important;overflow:hidden!important;max-height:none!important;}
                #lightflow_scene_link_picker .button_bar:empty{display:none;}
                .lf-links-picker,.lf-links-picker *{box-sizing:border-box;}
                .lf-links-picker{height:min(650px,calc(100vh - 112px));display:flex;flex-direction:column;min-height:0;background:var(--color-ui);color:var(--color-text);}
                .lf-links-picker-head{display:flex;align-items:center;justify-content:space-between;gap:20px;height:auto!important;min-height:148px;overflow:visible!important;padding:22px 28px 18px;background:linear-gradient(132deg,var(--color-dark),var(--color-ui) 80%);border-bottom:1px solid var(--color-border); border-radius:8px;}
                .lf-links-picker-head>div{min-width:0;max-width:540px;}
                .lf-links-eyebrow{color:var(--color-text);font-size:11px;font-weight:700;letter-spacing:.11em;margin-bottom:8px;}
                .lf-links-picker h2{font-size:25px;line-height:1.18;font-weight:400;margin:0 0 9px;}
                .lf-links-picker-head p{font-size:13px;line-height:1.5;color:var(--color-subtle_text);margin:0;white-space:normal!important;}
                .lf-links-browse{display:flex;align-items:center;justify-content:center;gap:8px;height:auto!important;min-height:38px;padding:8px 12px;white-space:nowrap;background:var(--color-button);color:var(--color-text);border-radius:4px;cursor:pointer;}
                .lf-links-browse:hover,.lf-links-picker-foot button:hover{background:var(--color-accent);color:var(--lf-on-accent,var(--color-accent_text));}
                .lf-links-picker-tools{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 28px 12px;}
                .lf-links-picker-tools label{display:flex;align-items:center;gap:7px;width:min(330px,100%);min-height:34px;padding:0 9px;background:var(--color-dark);border:1px solid var(--color-border);border-radius:4px;}
                .lf-links-picker-tools label:focus-within{border-color:var(--color-accent);}
                .lf-links-picker-tools input{min-width:0;width:100%;background:transparent;border:0;color:var(--color-text);outline:0;}
                .lf-links-picker-tools>span{color:var(--color-subtle_text);font-size:12px;white-space:nowrap;}
                .lf-links-picker-scroll{flex:1;min-height:0;overflow:auto;padding:3px 28px 24px;scrollbar-gutter:stable;}
                .lf-links-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-content:start;}
                .lf-links-card{height:auto!important;min-height:194px;min-width:0;padding:0;text-align:left;border:1px solid var(--color-border);border-radius:6px;overflow:hidden;color:var(--color-text);background:var(--color-dark);cursor:pointer;transition:border-color .15s,transform .15s,background .15s;}
                .lf-links-card:hover:not(:disabled){border-color:var(--color-accent);background:var(--color-button);transform:translateY(-2px);}
                .lf-links-card:focus-visible{border-color:var(--lf-focus-color,var(--color-text));background:var(--color-button);outline:2px solid var(--lf-focus-color,var(--color-text));outline-offset:2px;}
                .lf-links-card:disabled{opacity:.57;cursor:default;}
                .lf-links-cover{height:152px;position:relative;overflow:hidden;background:var(--color-button);}
                .lf-links-cover img{width:100%;height:100%;object-fit:cover;display:block;}
                .lf-links-cover-fallback{display:grid;place-items:center;width:100%;height:100%;background:radial-gradient(circle at 62% 35%,var(--color-button),var(--color-dark) 75%);}
                .lf-links-cover-fallback i{font-size:52px;color:var(--color-subtle_text);opacity:.65;}
                .lf-links-origin{position:absolute;top:9px;left:9px;padding:3px 7px;border-radius:8px;background:rgba(16,18,24,.82);color:#e5e9f0;font-size:11px;}
                .lf-links-card-info{display:flex;gap:9px;min-width:0;padding:12px;align-items:flex-start;}
                .lf-links-card-info>i{font-size:20px;color:var(--color-accent);flex:none;}
                .lf-links-card-info>div{min-width:0;}
                .lf-links-card-info strong{display:block;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
                .lf-links-card-info small{display:block;margin-top:5px;color:var(--color-text);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
                .lf-links-empty{display:grid;justify-items:center;gap:10px;padding:48px 12px;color:var(--color-subtle_text);text-align:center;}
                .lf-links-empty>i{font-size:42px;}.lf-links-empty p{margin:0;}.lf-links-empty button{padding:7px 12px;background:var(--color-button);border-radius:4px;}
                .lf-links-picker-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 28px;border-top:1px solid var(--color-border);color:var(--color-subtle_text);font-size:12px;}
                .lf-links-picker-foot button{padding:7px 12px;color:var(--color-text);background:var(--color-button);border-radius:4px;cursor:pointer;}
                @media(max-width:640px){.lf-links-picker-head{display:block;padding:18px;}.lf-links-picker-head .lf-links-browse{margin-top:13px;width:100%;}.lf-links-picker-tools{padding:12px 18px;}.lf-links-picker-scroll{padding:3px 18px 18px;}.lf-links-grid{grid-template-columns:1fr;}.lf-links-picker-foot{padding:10px 18px;}}
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
                for(const root of Project?.elements||[])if(root.type==='lightflow_scene_instance'){root._lightflowPlaying=false;delete root._lightflowTime;if(!activeMounts.has(root)){root._lightflowProject=Project;refreshInstance(root);}else updateAnimatedTree(root);}
                syncPanel();
            };
            owned.push(Blockbench.on('undo',restorePlaybackPose),Blockbench.on('redo',restorePlaybackPose));
            let pointerStart=null,lastLinkedClick=null;
            const previewForEvent=event=>window.Preview?.all?.find(preview=>preview.canvas===event.target)||null;
            const linkedHit=(event,preview)=>{
                const rect=preview.canvas.getBoundingClientRect();
                const mouse=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
                const ray=new THREE.Raycaster();ray.setFromCamera(mouse,preview.camera);
                const linked=[];
                for(const root of SceneInstanceElement.all){
                    if(root.visibility===false||root.locked||!root.mesh?.visible)continue;
                    for(const holder of mountedCubes.get(root)||[])holder.traverse(object=>{if(object.isMesh&&object.visible)linked.push(object);});
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
                if(!row)return;
                const element=selected();
                if(element?.type==='lightflow_scene_instance'&&row.contains(event.target)){event.preventDefault();event.stopPropagation();openSource(element);}
            };
            document.addEventListener('dblclick',onDoubleClick,true);
            owned.push({delete(){document.removeEventListener('dblclick',onDoubleClick,true);}});
            const setRigidBatching=enabled=>{rigidBatchingEnabled=!!enabled;for(const resource of renderResources.values())if(!resource.retired)for(const owner of [...resource.users])if(owner._lightflowProject===Project)mountResult(owner,resource.result);updateOutline();window.ShaderEngine?.requestPreviewRender?.({cause:'scene_link_batching'});};
            window.LightflowSceneLinks={resolveSourceMaterialSlots,importPath,createSkinLink,prepareSourceModel,applySkinPose,showSourcePicker,refresh:refreshInstance,refreshMaterials:refreshLinkedMaterials,openSource,setAnimation,setAnimationTime,togglePlayback,setAnimations,toggleAnimation,showAnimationMenu,showClipMenu,setClipOffset,setRigidBatching,core};
            hydrate();
            this._lightflowSceneLinksDispose=()=>{
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
