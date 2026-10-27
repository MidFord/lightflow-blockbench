(function () {
    'use strict';
    // Explicitly installed developer plugin. Never loaded by the essential suite.
    const instances = new Set();
    const actions = [];
    let panel, dialog, css, fixtureCss, panelVisible = false;
    let nextInstance = 0;
    const isSpanish = () => String(globalThis.Language?.code || '').startsWith('es');
    const text = (en, es) => isSpanish() ? es : en;
    const fixtureImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64" viewBox="0 0 128 64"><rect width="128" height="64" fill="#222"/><circle cx="48" cy="32" r="18" fill="#ddd"/><path d="M74 48V16l32 32z" fill="#999"/></svg>');
    const families = {
        actions: 'Buttons / Actions', inputs: 'Text / Number', sliders: 'Sliders / Vectors',
        booleans: 'Checkbox / Switch', selects: 'Select / Dropdown / Enum', tabs: 'Tabs / Segments',
        search: 'Search / Folders', color: 'Color / Gradient', media: 'Grid / Preview / Texture',
        code: 'Code / JSON properties / Block picker', tree: 'Outliner selection', information: 'Labels / Status / Progress', widgets: 'Widgets'
    };

    function createFixture(family, state, log) {
        const disabled = state === 'disabled';
        const long = state === 'long';
        const label = long ? text('A deliberately long translated label with units and explanatory context', 'Una etiqueta traducida deliberadamente larga con unidades y contexto explicativo') : text('Example', 'Ejemplo');
        const hooks = {onBefore:()=>log('begin'),onAfter:()=>log('end'),onCancel:()=>log('cancel')};
        const shared = {disable:disabled,label};
        const slider = {...shared,...hooks,type:'combo_slider',min:-10,max:100,step:.01,value:state==='extremes'?100:1.4,reset_value:0,full_track:true,unit:' lx',allow_higher:true};
        const optionName = (en, es) => long ? `${text(en, es)} · ${label}` : text(en, es);
        const options = {one:{name:optionName('First','Primero'),icon:'lightbulb'},two:{name:optionName('Second','Segundo'),icon:'wb_sunny'},three:{name:optionName('Unavailable','No disponible'),disabled:true}};
        switch (family) {
            case 'actions': return {
                primary:{...shared,type:'action_button',semantic_button:true,label:false,text:label,title:label,background:'var(--color-accent)',color:'var(--color-accent_text)',icon:'add',click:()=>log('primary')},
                icon:{...shared,type:'action_button',semantic_button:true,label:false,title:label,icon:'settings',icon_only:true,click:()=>log('icon')},
                toggle:{...shared,type:'action_toggle',value:state==='selected',icon_on:'visibility',icon_off:'visibility_off'},
                danger:{...shared,type:'action_button',semantic_button:true,icon:'delete',label:text('Delete fixture','Eliminar fixture'),color:'var(--color-error)',click:()=>log('danger')}
            };
            case 'code': return {
                json:{...shared,type:'code_editor',language:'json',mode:state==='selected'?'visual':'code',height:180,value:state==='error'?'{':JSON.stringify({enabled:true,amount:2,position:[1,2,3],unknown:{keep:'custom'}},null,2)},
                molang:{...shared,type:'code_editor',language:'molang',height:100,value:'variable.age = query.life_time; return math.sin(variable.age);'},
                block:{...shared,type:'block_select',value:'minecraft:stone',options:[{id:'minecraft:stone',name:'Stone'},{id:'minecraft:dirt',name:'Dirt'}]}
            };
            case 'inputs': return {
                short:{...shared,type:'compact_text',value:state==='empty'?'':long?'W'.repeat(120):text('Editable text','Texto editable')},
                number:{...slider,label:text('Number transaction','Transacción numérica'),full_track:false},
                native:{...shared,type:'number',value:-12.25,step:.01},
                raw_text:{...shared,type:'text',value:label},
                explanation:{type:'bar_display',text:text('Escape cancels; Enter confirms. Invalid text is reported, never silently reset.','Escape cancela; Enter confirma. El texto inválido se indica, sin reiniciar silenciosamente.')}
            };
            case 'sliders': return {
                full:slider,
                dense:{...slider,density:'compact',full_track:false,label:text('Compact inline','Compacto en línea')},
                minimum:{...slider,label:text('Minimum','Mínimo'),value:-10},
                maximum:{...slider,label:text('Maximum','Máximo'),value:100},
                fixed:{...slider,label:text('Fixed range','Rango fijo'),min:0,max:0,value:0,disable:true},
                marks:{...slider,label:text('Non-uniform marks','Marcas no uniformes'),marks:[{value:0,label:'0'},{value:10,label:'10'},{value:100,label:'100'}]},
                compact:{...slider,label:text('Popup slider','Slider emergente'),compact:true,full_track:false},
                vector:{...shared,...hooks,type:'custom_vector',axis_labels:true,value:state==='extremes'?[0,4,1]:[1,1,1],default:[1,1,1],min:0,max:4,step:.01}
            };
            case 'booleans': return {
                switch_off:{...shared,type:'custom_checkbox',presentation:'switch',value:false,layout:'space_between'},
                switch_on:{...shared,type:'custom_checkbox',presentation:'switch',value:true,layout:'space_between'},
                check:{...shared,type:'custom_checkbox',presentation:'checkbox',value:true},
                option_row:{...LightManagerUI.formDesign.checkboxRow({label:optionName('Geometry','Geometría'),supporting_text:text('Cubes and meshes from the source project.','Cubos y mallas del proyecto de origen.'),summary:'24',value:state==='selected'}),...hooks,disable:disabled},
                option_row_unselected:{...LightManagerUI.formDesign.checkboxRow({label:optionName('Billboards','Billboards'),supporting_text:text('Sprite elements from the source project.','Elementos sprite del proyecto de origen.'),summary:state==='extremes'?'1,024':'8',value:false}),...hooks,disable:disabled},
                group:{...shared,type:'custom_checkbox',variant:'group',value:state!=='collapsed',icon_on:'expand_more',icon_off:'chevron_right',summary:'3'}
            };
            case 'selects': return {
                select:{...shared,type:'compact_select',options,value:'one',show_value_text:true,expand:true,searchable:true},
                enum:{...shared,type:'enum_select',options:{0:{name:'0'},1:{name:'1'},2:{name:'2'}},value:state==='selected'?0:1,resettable:true,reset_value:0},
                inline:{...shared,type:'horizontal_select',presentation:'inline',options,value:'one'},
                many:{...shared,type:'compact_select',show_value_text:true,expand:true,searchable:true,options:Object.fromEntries(Array.from({length:100},(_,i)=>[String(i),{name:`${label} ${i}`}])) ,value:'50'}
            };
            case 'tabs': return {
                tabs:{...shared,type:'tab_select',presentation:'flat',options,value:state==='selected'?'two':'one'},
                rounded:{...shared,type:'horizontal_select',options,value:'one'},
                inline:{...shared,type:'horizontal_select',presentation:'inline',options,value:'two'},
                icons:{...shared,type:'icon_select',value:'lightbulb'},
                content:{type:'bar_display',paragraph:true,text:text('Real Form content, associated with the active tab.','Contenido del Form real, asociado a la pestaña activa.')}
            };
            case 'search': return {
                query:{type:'panel_search',placeholder:label,favorites_key:'lightflow_ui_lab_ephemeral',persist_favorites:false},
                folder:{type:'custom_checkbox',variant:'group',label,value:state!=='collapsed',icon_on:'expand_more',icon_off:'chevron_right'},
                value:{...slider,parent:'folder',condition:result=>!!result.folder || !!String(result.query || '').trim()},
                separator:{type:'bar_display',label,text:text('Search, collapse and filtering use real controls.','Búsqueda, colapso y filtros usan controles reales.'),separator:true}
            };
            case 'color': return {
                color:{...shared,type:'advanced_color',value:'#88aaff',alpha:true},
                gradient:{...shared,type:'gradient_editor',value:{stops:[{position:0,color:'#000000'},{position:1,color:'#ffffff'}]}}
            };
            case 'media': return {
                grid:{...shared,type:'grid_select',value:'one',options:state==='empty'?{}:{one:{name:text('Cached image','Imagen cacheada'),image:fixtureImage},two:{name:label,icon:'image'},three:{name:text('Disabled','Deshabilitado'),disabled:true,icon:'lock'}}},
                preview:{...shared,type:'image_preview',value:state==='empty'?'':state==='error'?'data:image/png;base64,invalid':fixtureImage,caption:label},
                texture:{...shared,type:'texture_source',value:''}
            };
            case 'tree': {
                const group={uuid:'lab-group',name:text('Fixture group','Grupo de prueba'),icon:'folder',color:0,children:[]};
                group.children=Array.from({length:long?80:8},(_,i)=>({uuid:`lab-object-${i}`,name:`${label} ${i}`,icon:i===0?'fa fas fa-bookmark':'deployed_code',color:i%8,parent:group}));
                return {targets:{...shared,type:'outliner_select',nodes:state==='empty'?[]:[group],value:{'lab-object-1':'include','lab-object-2':'exclude'}}};
            }
            case 'information': return {
                title:{type:'bar_display',label,text:label,paragraph:true,icon:'info',separator:true},
                progress:{type:'progress',label,value:state==='loading'?{value:null,status:'active',label}:{value:.35,status:state==='error'?'error':'active',label}},
                state:{type:'bar_display',text:text('State is deterministic. Hover, focus and pressed are verified through real interaction.','El estado es determinista. Hover, foco y pressed se comprueban con interacción real.')}
            };
            default:return {};
        }
    }

    function mountLab(root, close = null) {
        const instanceId = ++nextInstance;
        root.classList.add('lf-ui-lab','lf-controls');
        const toolbar=document.createElement('div'); toolbar.className='lf-ui-lab-toolbar';
        const select=(name,values)=>{
            const node=document.createElement('select');node.setAttribute('aria-label',name);
            for(const [value,label] of Object.entries(values)){const option=document.createElement('option');option.value=value;option.textContent=label;node.append(option);}
            toolbar.append(node);return node;
        };
        const family=select(text('Component family','Familia de componentes'),families);
        const state=select(text('Fixture state','Estado del fixture'),{normal:'Normal',disabled:'Disabled',selected:'Selected',collapsed:'Collapsed',empty:'Empty',error:'Error',loading:'Loading',long:'Long labels / 80 items',extremes:'Extremes'});
        const width=select(text('Container width','Ancho del contenedor'),{fluid:'Fluid',240:'240 px',280:'280 px',320:'320 px',480:'480 px',640:'640 px'});
        width.value='fluid';
        const reset=document.createElement('button');reset.type='button';reset.textContent=text('Reset fixture','Restablecer fixture');toolbar.append(reset);
        if(close){const button=document.createElement('button');button.type='button';button.textContent=text('Close lab','Cerrar laboratorio');button.addEventListener('click',close);toolbar.append(button);}
        const metrics=document.createElement('div');metrics.className='lf-ui-lab-metrics';
        const host=document.createElement('div');host.className='lf-ui-lab-fixture';
        const events=document.createElement('pre');events.className='lf-ui-lab-events';events.setAttribute('aria-label',text('Interaction events','Eventos de interacción'));
        root.append(toolbar,metrics,host,events);
        let form,widgets=[],viewerDispose,disposed=false,records=[];
        const log=value=>{records.push(value);records=records.slice(-12);events.textContent=records.join(' · ');};
        const clear=()=>{
            viewerDispose?.();viewerDispose=null;form?.delete();form=null;for(const widget of widgets)widget.delete?.();widgets=[];host.replaceChildren();
        };
        const updateMetrics=()=>{metrics.textContent=`Blockbench ${Blockbench.version} · Controls ${LightManagerUI.controls?.version || 0} · ${Math.round(host.getBoundingClientRect().width)} CSS px · DPR ${window.devicePixelRatio} · ${Language.code} · ${family.value}/${state.value}`;};
        const render=()=>{
            if(disposed)return;clear();records=[];events.textContent='';
            host.style.width=width.value==='fluid'?'100%':`${width.value}px`;host.style.maxWidth='100%';
            if(family.value==='widgets'){
                const widgetLabel = state.value==='long' ? text('A deliberately long translated widget label with explanatory context','Una etiqueta de widget traducida deliberadamente larga con contexto explicativo') : 'Widget';
                for(const [Type,id,options] of [
                    [window.ComboSlider,'slider',{label:widgetLabel+' slider',value:state.value==='extremes'?10:1.4,min:0,max:10,step:.01,reset_value:0,...{onBefore:()=>log('begin'),onAfter:()=>log('end')}}],
                    [window.CompactDropdownSelect,'select',{label:widgetLabel+' select',show_value_text:true,options:{one:{name:state.value==='long'?widgetLabel:'One'},two:{name:'Two'}},value:state.value==='selected'?'two':'one'}],
                    [window.TextInputWidget,'text',{label:widgetLabel+' text',default_text:state.value==='empty'?'':state.value==='long'?widgetLabel:'Lightflow'}],
                    [window.BarDisplay,'display',{label:widgetLabel+' display',text:'Lightflow'}]
                ]){if(!Type)continue;const widget=new Type(`lf_lab_${id}_${instanceId}`,options);widgets.push(widget);host.append(widget.getNode?.() || widget.node);if(state.value==='disabled'){widget.disable?.();const node=widget.getNode?.()||widget.node;node.setAttribute('aria-disabled','true');node.querySelectorAll('input,button,select').forEach(input=>input.disabled=true);}}
            }else{
                const fields=createFixture(family.value,state.value,log);
                form=new InputForm((window.LightManagerUI?.prepareForm || (form => form))(fields));
                form.on('change',event=>log(`change:${(event.changed_keys||[]).join(',')}`));
                host.append(form.node);
                // Native InputForm uses field keys as DOM IDs. Keep independent
                // Panel and Dialog fixtures associated with their own labels.
                for (const input of host.querySelectorAll('input[id],select[id]')) {
                    const oldId = input.id;
                    input.id = `lf_lab_${instanceId}_${oldId}`;
                    for (const label of host.querySelectorAll('label[for]')) {
                        if (label.htmlFor === oldId) label.htmlFor = input.id;
                    }
                }
                if(family.value==='media' && LightManagerUI.mediaViewer?.mount){
                    const viewer=document.createElement('div'),image=document.createElement('img');
                    image.alt=text('Finished-result fixture','Fixture de resultado final');
                    host.append(viewer);viewerDispose=LightManagerUI.mediaViewer.mount(viewer,image);
                    image.src=state.value==='error'?'data:image/png;base64,invalid':fixtureImage;
                }
                if(state.value==='disabled') host.querySelectorAll('input,button,select').forEach(input=>input.disabled=true);
                if(state.value==='error' && ['inputs','sliders'].includes(family.value)) {
                    const input=host.querySelector('.lf-number-input, input[type=number]');
                    input?.focus(); if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));}
                }

            }
            updateMetrics();
        };
        family.addEventListener('change',render);state.addEventListener('change',render);width.addEventListener('change',render);reset.addEventListener('click',render);
        const observer=new ResizeObserver(updateMetrics);observer.observe(host);
        const instance={dispose(){if(disposed)return;disposed=true;observer.disconnect();clear();root.replaceChildren();instances.delete(instance);},snapshot(){return{family:family.value,state:state.value,width:host.getBoundingClientRect().width,records:records.slice()};}};
        instances.add(instance);render();return instance;
    }

    function showDialog() {
        if(!globalThis.LightManagerUI){Blockbench.showQuickMessage('Load Light Manager first');return;}
        if(dialog){dialog.show();return;}
        let instance;
        const close=()=>{instance?.dispose();instance=null;const closed=dialog;dialog=null;closed?.hide();closed?.delete();};
        dialog=new Dialog('lightflow_ui_lab_dialog',{
            title:'Lightflow UI Lab — Dialog',width:680,resizable:true,
            lines:['<div class="lf-ui-lab-root"></div>'],buttons:['dialog.close'],
            onOpen(){if(!instance)instance=mountLab(this.object.querySelector('.lf-ui-lab-root'));},
            onConfirm:close,onCancel:close
        });
        dialog.show();
    }

    Plugin.register('lightflow_ui_lab',{
        title:'Lightflow UI Lab',author:'Lightflow',description:'Development-only gallery of real Lightflow controls.',
        icon:'widgets',version:'1.0.0',variant:'both',min_version:'4.9.0',
        onload(){
            fixtureCss=window.LightManagerUI?.addDesignedPanelStyles?.('lightflow_ui_lab_panel',{lab:true});
            css=Blockbench.addCSS(`
                .lf-ui-lab {display:flex;flex-direction:column;gap:8px;min-width:0;padding:8px;}
                .lf-ui-lab-toolbar {display:flex;flex-wrap:wrap;gap:4px;}
                .lf-ui-lab-toolbar select {min-width:0;max-width:100%;flex:1 1 120px;height:30px;}
                .lf-ui-lab-toolbar button {min-width:0;max-width:100%;padding:0 8px;flex:1 1 auto;min-height:28px;white-space:normal;line-height:1.3;}
                .lf-ui-lab-metrics {font-size:12px;color:var(--color-subtle_text);line-height:1.4;}
                .lf-ui-lab-fixture {min-width:0;align-self:flex-start;}
                .lf-ui-lab-fixture>.form {min-width:0;max-width:100%;}
                .lf-ui-lab-events {white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-height:96px;overflow:auto;margin:0;}
                #lightflow_ui_lab_dialog {max-width:calc(100vw - 32px);}
                #lightflow_ui_lab_dialog .dialog_content {max-height:calc(100vh - 160px);overflow:auto;}
                #panel_lightflow_ui_lab_panel .panel_vue_wrapper {min-width:0;overflow:auto;}
            `);
            const closePanel=()=>{panelVisible=false;panel.vue.lab?.dispose();panel.vue.lab=null;panel.update();window.updateInterfacePanels?.();};
            panel=new Panel('lightflow_ui_lab_panel',{
                name:'Lightflow UI Lab',icon:'widgets',optional:true,growable:true,resizable:true,min_height:180,condition:()=>panelVisible,
                onFold(){if(!this.vue)return;if(this.folded){this.vue.lab?.dispose();this.vue.lab=null;}else if(panelVisible&&!this.vue.lab){this.vue.lab=mountLab(this.vue.$el,closePanel);}},
                default_position:{slot:'float',float_position:[60,90],float_size:[360,540],height:540,folded:false},
                component:{template:'<div class="lf-ui-lab-root"></div>',beforeDestroy(){this.lab?.dispose();}}
            });
            panel.node.style.display='none';
            panel.on('update',event=>{
                if(!event.show || panel.folded || panel.slot==='hidden'){panel.vue.lab?.dispose();panel.vue.lab=null;}
                else if(panelVisible&&!panel.vue.lab){panel.vue.lab=mountLab(panel.vue.$el,closePanel);}
            });
            const openPanel=new Action('lightflow_ui_lab_panel_open',{name:'Lightflow UI Lab — Panel',icon:'widgets',click(){panelVisible=true;if(panel.slot==='hidden')panel.moveTo(panel.previous_slot || 'float');panel.node.style.display='';panel.fold(false);panel.update();window.updateInterfacePanels?.();}});
            const openDialog=new Action('lightflow_ui_lab_dialog_open',{name:'Lightflow UI Lab — Dialog',icon:'web_asset',click:showDialog});
            for(const action of [openPanel,openDialog]){actions.push(action);MenuBar.addAction(action,'tools');}
        },
        onunload(){
            for(const instance of [...instances])instance.dispose();
            dialog?.hide();dialog?.delete();dialog=null;panel?.delete();panel=null;css?.delete();css=null;fixtureCss?.delete();fixtureCss=null;
            for(const action of actions.splice(0))action.delete();
        }
    });
})();
