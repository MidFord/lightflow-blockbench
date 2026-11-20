'use strict';

// Pure assembly planner. Files, project transactions and rendering belong to the host.
// The PRNG is deliberately versioned: reproducible Lightflow seeds are not world seeds.
const BedrockJigsaw = (() => {
    const directions = {down:[0,-1,0],up:[0,1,0],north:[0,0,-1],south:[0,0,1],west:[-1,0,0],east:[1,0,0]};
    const orientations = {
        east_up:[5,0],north_up:[2,0],south_up:[3,0],west_up:[4,0],
        up_east:[1,1],up_north:[1,0],up_west:[1,3],up_south:[1,2],
        down_east:[0,3],down_west:[0,1],down_north:[0,0],down_south:[0,2]
    };
    const id = value => {
        const text = String(value || 'minecraft:empty').replace(/\\/g,'/').replace(/\.(?:nbt|mcstructure)$/i,'');
        if (!/^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(text) || text.split(/[/:]/).includes('..')) throw Error('Invalid resource identifier: ' + text);
        return text.includes(':') ? text : 'minecraft:' + text;
    };
    const rotate = (p, q) => { let [x,y,z]=p; for(let i=0;i<q;i++) [x,z]=[-z,x]; return [x||0,y||0,z||0]; };
    const add = (a,b) => a.map((n,i)=>n+b[i]);
    const equal = (a,b) => a.every((n,i)=>n===b[i]);
    const contains = (a,b) => a.min.every((n,i)=>n<=b.min[i] && a.max[i]>=b.max[i]);
    const intersects = (a,b) => a.min.every((n,i)=>n<b.max[i] && a.max[i]>b.min[i]);
    const integer = (value,min,max,label) => {const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw RangeError(label);return n;};
    function random(seed) {
        let state = 2166136261;
        for (const c of String(seed)) state = Math.imul(state ^ c.charCodeAt(0),16777619) >>> 0;
        const next = () => {state=(state+0x6D2B79F5)>>>0;let t=Math.imul(state^state>>>15,1|state);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};
        next.state = () => state;
        next.restore = n => {state=n;};
        return next;
    }
    function shuffle(values,rng) {
        const result=values.slice();
        for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
        return result;
    }
    function connectors(source) {
        const result=[];
        for(const [index,data] of source.blockPositionData || []) {
            const block=source.blockPalette[source.blockIndices[0][index]];
            if(block?.name!=='minecraft:jigsaw')continue;
            const entity=data.blockEntityData || {}, states=block.states || {};
            const orientation=Object.entries(orientations).find(([,v])=>v[0]===Number(states.facing_direction ?? 2)&&v[1]===Number(states.rotation || 0))?.[0];
            if(!orientation)throw Error('Unsupported jigsaw orientation at index '+index);
            const [front,top]=orientation.split('_'),p=source.indexToCoordinates(index);
            result.push({index,position:[p.x,p.y,p.z],front:directions[front],top:directions[top],
                name:id(entity.name),target:id(entity.target),pool:id(entity.target_pool ?? entity.pool),
                joint:entity.joint || (front==='up'||front==='down'?'rollable':'aligned'),
                finalState:String(entity.final_state || 'minecraft:air'),
                selectionPriority:Number(entity.selection_priority)||0,placementPriority:Number(entity.placement_priority)||0});
        }
        return result;
    }
    class Library {
        constructor(){this.templates=new Map();this.pools=new Map();this.processors=new Map();}
        template(name,source){this.templates.set(id(name),source);return this;}
        pool(name,json){
            const data=json['minecraft:template_pool'] || json;
            const nameId=id(data.description?.identifier || data.name || name);
            if(!Array.isArray(data.elements)||data.elements.length>4096)throw Error('Invalid pool: '+nameId);
            let total=0;
            const elements=data.elements.map(entry=>{const weight=integer(entry.weight ?? 1,1,200,'Pool weight must be 1–200');total+=weight;return {element:entry.element,weight};});
            if(total>32768)throw Error('Pool weighted entry limit exceeded: '+nameId);
            this.pools.set(nameId,{elements,fallback:id(data.fallback)});return this;
        }
        async get(name){
            name=id(name);let value=this.templates.get(name);
            if(!value)throw Error('Missing structure template: '+name);
            if(typeof value==='function'){value=await value();this.templates.set(name,value);}
            if(!value?.blockIndices)throw Error('Invalid parsed template: '+name);
            return value;
        }
    }
    function piece(source,sourceId,position,q,depth,number,usedIndex=-1,parent=-1) {
        const size=[source.size.x,source.size.y,source.size.z];
        const corners=[[0,0,0],[size[0]-1,0,0],[0,0,size[2]-1],[size[0]-1,0,size[2]-1]].map(p=>rotate(p,q));
        const min=position.map((n,i)=>n+Math.min(...corners.map(p=>p[i])));
        const max=min.map((n,i)=>n+(i===1?size[1]:size[q%2?2-i:i]));
        const ports=connectors(source).filter(c=>c.index!==usedIndex).map(c=>({...c,position:add(rotate(c.position,q),position),front:rotate(c.front,q),top:rotate(c.top,q),key:number+':'+c.index,piece:number,depth}));
        return {source,sourceId,position,q,depth,number,parent,bounds:{min,max},ports};
    }
    class Session {
        constructor(library,options={}) {
            this.library=library;this.seed=String(options.seed ?? '0');this.rng=random(this.seed);
            this.maxDepth=integer(options.maxDepth ?? 7,0,20,'Depth must be 0–20');
            this.maxPieces=integer(options.maxPieces ?? 128,1,512,'Pieces must be 1–512');
            this.radius=integer(options.radius ?? 128,1,512,'Radius must be 1–512');
            this.pieces=[];this.pending=[];this.events=[];this.center=null;
        }
        async start(sourceId,position=[0,0,0],q=0){
            if(this.pieces.length)throw Error('Session already started');
            if(position.length!==3||!position.every(Number.isSafeInteger))throw Error('Expected three integer coordinates');
            q=integer(q,0,3,'Rotation must be 0–3');
            const source=await this.library.get(sourceId),root=piece(source,id(sourceId),position.slice(),q,0,0);
            this.center=position.slice();this.pieces.push(root);this.enqueue(root);return root;
        }
        async startPool(poolId,position=[0,0,0],q=null){
            if(this.pieces.length)throw Error('Session already started');
            poolId=id(poolId);
            const pool=this.library.pools.get(poolId);if(!pool)throw Error('Missing start pool: '+poolId);
            const saved=this.rng.state();
            try{
                const total=pool.elements.reduce((sum,e)=>sum+e.weight,0);
                if(!total)return null;
                let roll=Math.floor(this.rng()*total),element;
                for(const entry of pool.elements){roll-=entry.weight;if(roll<0){element=entry.element;break;}}
                if(!this.validateElement(element))return null;
                const root=await this.start(element.location,position,q===null?Math.floor(this.rng()*4):q);
                root.legacy=element.element_type==='minecraft:legacy_single_pool_element';
                this.startPoolId=poolId;return root;
            }catch(error){this.rng.restore(saved);throw error;}
        }
        enqueue(value){if(value.depth>this.maxDepth)return;this.pending.push(...shuffle(value.ports,this.rng).sort((a,b)=>b.selectionPriority-a.selectionPriority));this.pending.sort((a,b)=>b.placementPriority-a.placementPriority||a.depth-b.depth);}
        fork(){const copy=Object.assign(Object.create(Session.prototype),this);copy.pieces=this.pieces.slice();copy.pending=this.pending.slice();copy.events=this.events.slice();copy.rng=random(this.seed);copy.rng.restore(this.rng.state());return copy;}
        candidates(poolId,depth){
            if(poolId==='minecraft:empty')return [];
            const pool=this.library.pools.get(poolId);if(!pool)throw Error('Missing template pool: '+poolId+'. Load its JSON definitions; NBT files do not contain pool weights.');
            const weighted=entries=>shuffle(entries.flatMap(e=>Array(e.weight).fill(e.element)),this.rng);
            const result=depth<this.maxDepth?weighted(pool.elements):[];
            if(pool.fallback!=='minecraft:empty'){
                const fallback=this.library.pools.get(pool.fallback);if(!fallback)throw Error('Missing fallback pool: '+pool.fallback);
                result.push(...weighted(fallback.elements));
            }
            return result;
        }
        validateElement(element){
            const type=element?.element_type || 'minecraft:single_pool_element';
            if(type==='minecraft:empty_pool_element')return false;
            if(!['minecraft:single_pool_element','minecraft:legacy_single_pool_element'].includes(type))throw Error('Unsupported pool element: '+type);
            if(element.projection && element.projection!=='rigid')throw Error('Terrain-matching projection needs Minecraft heightmaps: '+element.location);
            const processors=typeof element.processors==='string'?this.library.processors.get(id(element.processors)):element.processors;
            if(typeof element.processors==='string'&&id(element.processors)!=='minecraft:empty'&&!processors)throw Error('Missing processor list: '+element.processors);
            const list=Array.isArray(processors)?processors:processors?.processors;
            if(list?.length)throw Error('Non-empty processor lists are not yet supported: '+element.location);
            return true;
        }
        fits(candidate,port){
            if(candidate.bounds.min.some((n,i)=>n<this.center[i]-this.radius)||candidate.bounds.max.some((n,i)=>n>this.center[i]+this.radius+1))return false;
            const parent=this.pieces[port.piece],inside=port.position.map((n,i)=>n+port.front[i]).every((n,i)=>n>=parent.bounds.min[i]&&n<parent.bounds.max[i]);
            if(inside&&!contains(parent.bounds,candidate.bounds))return false;
            const ancestors=new Set();let p=parent;while(p){ancestors.add(p.number);p=this.pieces[p.parent];}
            return !this.pieces.some(other=>intersects(candidate.bounds,other.bounds)&&!(inside&&ancestors.has(other.number)&&contains(other.bounds,candidate.bounds)));
        }
        async step(key=this.pending[0]?.key){
            if(this.pieces.length>=this.maxPieces)return {status:'piece_limit'};
            const index=this.pending.findIndex(p=>p.key===key);if(index<0)return {status:'complete'};
            const port=this.pending[index],saved=this.rng.state();
            try{
                for(const element of this.candidates(port.pool,port.depth)){
                    if(!this.validateElement(element)){this.pending.splice(index,1);return this.record(port,'empty');}
                    const source=await this.library.get(element.location);
                    for(const q of shuffle([0,1,2,3],this.rng)){
                        for(const target of shuffle(connectors(source),this.rng).sort((a,b)=>b.selectionPriority-a.selectionPriority)){
                            if(target.name!==port.target||!equal(rotate(target.front,q),port.front.map(n=>-n)))continue;
                            if(port.joint!=='rollable'&&!equal(rotate(target.top,q),port.top))continue;
                            const position=add(add(port.position,port.front),rotate(target.position,q).map(n=>-n));
                            const candidate=piece(source,id(element.location),position,q,port.depth+1,this.pieces.length,target.index,port.piece);
                            if(!this.fits(candidate,port))continue;
                            candidate.legacy=element.element_type==='minecraft:legacy_single_pool_element';
                            this.pending.splice(index,1);this.pieces.push(candidate);this.enqueue(candidate);
                            return {...this.record(port,'placed'),piece:candidate};
                        }
                    }
                }
                this.pending.splice(index,1);return this.record(port,'blocked');
            }catch(error){this.rng.restore(saved);throw error;}
        }
        record(port,status){const event={connector:port.key,pool:port.pool,status};this.events.push(event);return event;}
        async generate(options={}){let steps=0;while(this.pending.length&&this.pieces.length<this.maxPieces){if(options.signal?.aborted)throw Error('Jigsaw generation cancelled');await this.step();if(++steps%16===0)await new Promise(resolve=>setTimeout(resolve,0));}return this.describe();}
        describe(){return {schema:'lightflow-jigsaw-1',seed:this.seed,startPool:this.startPoolId || null,maxDepth:this.maxDepth,maxPieces:this.maxPieces,radius:this.radius,pieces:this.pieces.map(p=>({source:p.sourceId,position:p.position.slice(),rotation:p.q,depth:p.depth})),pending:this.pending.length,events:this.events.slice(),limited:this.pending.length>0&&this.pieces.length>=this.maxPieces};}
    }
    function rotatedStates(states,q,name,transform){
        const result=transform(states,{quarterTurns:q},name);
        if(name==='minecraft:jigsaw'){
            const entry=Object.entries(orientations).find(([,v])=>v[0]===Number(states.facing_direction ?? 2)&&v[1]===Number(states.rotation || 0));
            if(entry){const names=entry[0].split('_').map(n=>Object.keys(directions).find(k=>equal(directions[k],rotate(directions[n],q))));const value=orientations[names.join('_')];result.facing_direction=value[0];result.rotation=value[1];}
        }
        return result;
    }
    function materialize(pieces,parser,transform,options={}){
        if(!pieces.length)return null;
        const min=[0,1,2].map(i=>Math.min(...pieces.map(p=>p.bounds.min[i]))),max=[0,1,2].map(i=>Math.max(...pieces.map(p=>p.bounds.max[i]))),size=max.map((n,i)=>n-min[i]);
        if(size.reduce((a,b)=>a*b,1)>(options.maxVoxels || 8000000))throw RangeError('Jigsaw bounds exceed 8 million cells. Use fewer pieces or generate step by step.');
        const editor=parser.MinecraftBedrockStructureEditor.create({size:{x:size[0],y:size[1],z:size[2]},fillPrimary:-1});
        for(const value of pieces){
            let entityId=BigInt(value.number+1)*1048576n;
            const source=value.source,ports=new Map(connectors(source).map(p=>[p.index,p]));
            const onlyConnectors=options.onlyConnectors || options.onlyConnectorsFor?.has(value.number);
            const typedPalette=source.nbtDocument.value.structure.value.palette.value[source.paletteName || 'default'].value;
            const permutations=source.blockPalette.map((block,index)=>{
                const states=rotatedStates(block.states,value.q,block.name,transform);
                const statesNBT=parser.NBT.compound(states),original=typedPalette.block_palette.value.items[index]?.value?.states?.value;
                for(const [key,node] of Object.entries(statesNBT.value))if(original?.[key] && typeof original[key].value===typeof node.value){
                    const copy=parser.NBT.clone(original[key]);copy.value=node.value;statesNBT.value[key]=copy;
                }
                return {name:block.name,version:block.version,states,statesNBT};
            });
            for(const cell of source.blocks({layers:'both',includeAir:true})){
                if(!cell.block || cell.block.name==='minecraft:structure_void' || value.legacy && cell.block.name==='minecraft:air')continue;
                const p=add(rotate([cell.position.x,cell.position.y,cell.position.z],value.q),value.position).map((n,i)=>n-min[i]);
                if(onlyConnectors && (cell.layer!==0||cell.block.name!=='minecraft:jigsaw'))continue;
                let block=permutations[cell.paletteIndex];
                if(cell.block.name==='minecraft:jigsaw'&&options.finalize){
                    const raw=parser.parseJavaBlockState(ports.get(cell.index)?.finalState || 'minecraft:air');
                    const converted=parser.convertJavaBlockStateToBedrock(raw);
                    block={...converted,states:rotatedStates(converted.states,value.q,converted.name,transform)};
                }
                editor.setBlock(...p,block,{layer:cell.layer});
                if(cell.layer===0)editor.blockPositionData.delete(editor.coordinatesToIndex(...p));
                const data=source.blockPositionData.get(cell.index);
                if(cell.layer===0&&data&&!(cell.block.name==='minecraft:jigsaw'&&options.finalize)){
                    const node=parser.NBT.clone(typedPalette.block_position_data.value[String(cell.index)]);
                    const entity=node.value?.block_entity_data?.value;
                    if(entity){
                        for(let axis=0;axis<3;axis++){const key=['x','y','z'][axis];if(entity[key])entity[key].value=p[axis];}
                        if(entity.pairx && entity.pairz){
                            const pair=add(rotate([entity.pairx.value-source.worldOrigin.x,0,entity.pairz.value-source.worldOrigin.z],value.q),value.position);
                            entity.pairx.value=pair[0]-min[0];entity.pairz.value=pair[2]-min[2];
                        }
                    }
                    editor.setBlockPositionData(...p,node);
                }
            }
            if(onlyConnectors || options.entities===false)continue;
            const entities=source.nbtDocument.value.structure.value.entities?.value?.items || [];
            for(const raw of entities){
                const node=parser.NBT.clone(raw),pos=node.value.Pos || node.value.pos;
                if(!pos?.value?.items)continue;
                const local=pos.value.items.map((n,i)=>n.value-source.worldOrigin[['x','y','z'][i]]);
                // Entity coordinates rotate around the block grid's corner at (.5,.5).
                const r=rotate([local[0]-.5,local[1],local[2]-.5],value.q);r[0]+=.5;r[2]+=.5;
                const p=add(r,value.position).map((n,i)=>n-min[i]);pos.value.items.forEach((n,i)=>{n.value=p[i];});
                const yaw=node.value.Rotation?.value?.items?.[0];if(yaw)yaw.value+=value.q*90;
                if(node.value.UniqueID)node.value.UniqueID=parser.NBT.long(++entityId);
                editor.addEntity(node);
            }
        }
        return {structure:editor.build(),anchor:min};
    }
    return Object.freeze({Library,Session,connectors,materialize,rotate,rotatedStates,id});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=BedrockJigsaw;
