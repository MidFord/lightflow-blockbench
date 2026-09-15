(function () {
    'use strict';

    const PLUGIN_ID = 'visual_shader_graph';
    const GRAPH_FORMAT = 'lightflow_visual_shader_graph';
    const GRAPH_FORMAT_VERSION = 3;
    const GRAPH_PROJECT_PROPERTY = 'lf_visual_shader_graphs_json';
    const GRAPH_UNDO_ASPECT = 'lf_visual_shader_graphs';
    const GENERATED_MATERIAL_PREFIX = 'vsg_material_';
    const MAX_GRAPH_BYTES = 8 * 1024 * 1024;
    const MAX_PROJECT_GRAPH_BYTES = 32 * 1024 * 1024;
    const MAX_GRAPH_NODES = 2048;
    const MAX_GRAPH_EDGES = 8192;
    const MAX_EXPRESSION_CHARS = 256 * 1024;
    const MAX_GENERATED_SHADER_CHARS = 2 * 1024 * 1024;

    const TYPE_META = Object.freeze({
        any: { label: 'Any', color: '#9aa0aa', rank: 0 },
        bool: { label: 'Boolean', color: '#c78fea', rank: 1 },
        float: { label: 'Float', color: '#83c99b', rank: 1 },
        vec2: { label: 'Vector 2', color: '#e2bd6c', rank: 2 },
        vec3: { label: 'Vector 3', color: '#68b6cf', rank: 3 },
        color: { label: 'Color', color: '#d98f9b', rank: 3 },
        vec4: { label: 'Vector 4', color: '#bd9ae0', rank: 4 },
        texture: { label: 'Texture 2D', color: '#ca9d68', rank: 0 },
        int: { label: 'Integer', color: '#9ac47f', rank: 1 }
    });

    const CATEGORY_META = Object.freeze({
        output: { label: 'Output', icon: 'output', color: '#d8796f' },
        input: { label: 'Input', icon: 'input', color: '#6aa7c8' },
        stage: { label: 'Stage I/O', icon: 'swap_vert', color: '#5f9ed1' },
        parameter: { label: 'Parameters', icon: 'tune', color: '#b890cf' },
        texture: { label: 'Texture', icon: 'texture', color: '#c99664' },
        math: { label: 'Math', icon: 'calculate', color: '#7db991' },
        vector: { label: 'Vector', icon: 'open_with', color: '#68aebd' },
        color: { label: 'Color', icon: 'palette', color: '#ce8491' },
        lighting: { label: 'Lighting', icon: 'light_mode', color: '#d0ae63' },
        scene: { label: 'Scene & Screen', icon: 'layers', color: '#6fa6cf' },
        utility: { label: 'Utility', icon: 'construction', color: '#8c97a7' },
        advanced: { label: 'Advanced', icon: 'code', color: '#9a83be' }
    });

    const EN = {
        title: 'Visual Shader Graph',
        mode: 'Shader Graph',
        library: 'Node Library',
        inspector: 'Graph Inspector',
        search_nodes: 'Search nodes',
        empty_title: 'No shader graph in this project',
        empty_body: 'Create a graph from a production preset or start with an empty surface.',
        create_graph: 'Create Graph',
        new_graph: 'New Graph',
        import_graph: 'Import Graph',
        export_graph: 'Export Graph',
        export_material: 'Export Material',
        compile: 'Compile',
        apply_global: 'Apply Globally',
        apply_selection: 'Apply to Selection',
        validate: 'Validate',
        delete_graph: 'Delete Graph',
        duplicate_graph: 'Duplicate Graph',
        fit_graph: 'Frame All',
        reset_view: 'Reset View',
        zoom_in: 'Zoom In',
        zoom_out: 'Zoom Out',
        live_preview: 'Live Preview',
        graph_name: 'Graph Name',
        material_id: 'Material ID',
        graph_settings: 'Graph Settings',
        node_settings: 'Node Settings',
        input_defaults: 'Unconnected Inputs',
        diagnostics: 'Diagnostics',
        no_diagnostics: 'Graph is structurally valid.',
        no_selection: 'Select a node to edit its properties.',
        preset: 'Preset',
        presets: 'Graph Presets',
        exact_preset: 'Exact Shader Architect Preset',
        graph_native: 'Graph Native',
        ready: 'Ready',
        dirty: 'Changes not compiled',
        compiling: 'Compiling',
        compiled: 'Compiled',
        error: 'Error',
        warning: 'Warning',
        non_persistent: 'Visual Shader Graph data is session-only in this format. Save as .bbmodel to preserve it.',
        dependencies_missing: 'Visual Shader Graph requires Light Manager and Shader Architect.',
        select_elements: 'Select at least one renderable element first.',
        graph_imported: 'Shader graph imported.',
        material_exported: 'Compiled material ready for export.',
        confirm_delete_graph: 'Delete this shader graph? This can be undone.',
        add_uniform_port: 'Expose Uniform',
        remove_port: 'Remove Port',
        keyboard_help: 'Delete removes selected nodes. Ctrl/Cmd+C, V and D copy, paste and duplicate. F frames the graph. Enter on an output starts an accessible connection; Escape cancels it.',
        connect_from: 'Start connection from',
        connect_to: 'Connect to',
        connection_failed: 'These ports are not type-compatible.',
        surface_output_missing: 'Add one Surface Output or Preset Output node.',
        graph_too_large: 'The graph exceeds the safe import limit.',
        graph_expression_too_complex: 'The generated shader expression is too complex. Split or simplify the repeated branches.',
        invalid_graph_format: 'This file is not a Lightflow Visual Shader Graph.',
        unsupported_graph_version: 'This shader graph was created by a newer, unsupported plugin version.',
        compile_failed: 'The graph could not be compiled.',
        compile_success: 'Shader graph compiled.',
        apply_success: 'Compiled shader applied.',
        material_id_conflict: 'The Material ID is already owned by another Shader Architect material.',
        stage_mismatch: 'This node cannot be evaluated in the connected shader stage.',
        preset_base_missing: 'The referenced Shader Architect preset is unavailable.',
        preset_constant_only: 'Exact preset inputs only accept parameter values or reroutes; use a Graph Native surface for dynamic expressions.',
        preset_connections_repaired: 'Invalid preset connections were repaired.',
        exact_preset_note: 'This output clones the exact Shader Architect shader. Connected parameter nodes override exposed uniforms without rewriting its GLSL.',
        recent: 'Recent',
        search_nodes_commands: 'Search nodes or commands',
        graph: 'Graph',
        node: 'Node',
        selected_node: 'Selected Node',
        graph_summary: 'Graph Summary',
        node_count: 'Nodes',
        connection_count: 'Connections',
        last_compiled: 'Last Compiled',
        not_compiled: 'Not compiled',
        just_now: 'Just now',
        copy_material_id: 'Copy Material ID',
        material_id_copied: 'Material ID copied.',
        graph_actions: 'Graph Actions',
        apply: 'Apply',
        more: 'More',
        center_node: 'Center Node',
        view_all_diagnostics: 'View All Diagnostics',
        keyboard_shortcuts: 'Keyboard Shortcuts',
        zoom: 'Zoom',
        connections: 'connections',
        nodes: 'nodes',
        compiled_in: 'Compiled in',
        all_presets: 'All Presets',
        alpha_mode: 'Alpha Mode',
        title_override: 'Title Override',
        connected: 'Connected',
        preview_size: 'Preview Size',
        preview_small: 'Small Preview',
        preview_medium: 'Medium Preview',
        preview_large: 'Large Preview',
        disconnect: 'Disconnect',
        disconnect_input: 'Disconnect Input',
        disconnect_output: 'Disconnect Output',
        disconnect_node: 'Disconnect All',
        delete_node: 'Delete Node',
        duplicate_node: 'Duplicate Node',
        copy_node: 'Copy Node',
        node_actions: 'Node Actions',
        connection_actions: 'Connection Actions',
        move_node_help: 'Use arrow keys to move between nodes. Hold Shift and use the arrow keys to move the selected node.',
        resources: 'Resources / Blackboard',
        auto_layout: 'Auto Layout',
        snap_grid: 'Snap to Grid',
        create_group: 'Group Selection',
        ungroup: 'Ungroup',
        create_subgraph: 'Create Sub Graph'
    };

    const ES = {
        disconnect: 'Desconectar',
        disconnect_input: 'Desconectar Entrada',
        disconnect_output: 'Desconectar Salida',
        disconnect_node: 'Desconectar Todo',
        delete_node: 'Eliminar Nodo',
        duplicate_node: 'Duplicar Nodo',
        copy_node: 'Copiar Nodo',
        node_actions: 'Acciones del Nodo',
        connection_actions: 'Acciones de la Conexion',
        title: 'Grafo Visual de Shaders',
        mode: 'Grafo de Shaders',
        library: 'Biblioteca de Nodos',
        inspector: 'Inspector del Grafo',
        search_nodes: 'Buscar nodos',
        empty_title: 'Este proyecto no tiene un grafo de shaders',
        empty_body: 'Crea un grafo desde un preset de producción o comienza con una superficie vacía.',
        create_graph: 'Crear Grafo',
        new_graph: 'Nuevo Grafo',
        import_graph: 'Importar Grafo',
        export_graph: 'Exportar Grafo',
        export_material: 'Exportar Material',
        compile: 'Compilar',
        apply_global: 'Aplicar Globalmente',
        apply_selection: 'Aplicar a la Selección',
        validate: 'Validar',
        delete_graph: 'Eliminar Grafo',
        duplicate_graph: 'Duplicar Grafo',
        fit_graph: 'Encuadrar Todo',
        reset_view: 'Restablecer Vista',
        zoom_in: 'Acercar',
        zoom_out: 'Alejar',
        live_preview: 'Preview en Vivo',
        graph_name: 'Nombre del Grafo',
        material_id: 'ID del Material',
        graph_settings: 'Configuración del Grafo',
        node_settings: 'Configuración del Nodo',
        input_defaults: 'Entradas sin Conectar',
        diagnostics: 'Diagnóstico',
        no_diagnostics: 'El grafo es estructuralmente válido.',
        no_selection: 'Selecciona un nodo para editar sus propiedades.',
        preset: 'Preset',
        presets: 'Presets de Grafo',
        exact_preset: 'Preset Exacto de Shader Architect',
        graph_native: 'Nativo del Grafo',
        ready: 'Listo',
        dirty: 'Cambios sin compilar',
        compiling: 'Compilando',
        compiled: 'Compilado',
        error: 'Error',
        warning: 'Advertencia',
        non_persistent: 'Los datos del Grafo Visual son temporales en este formato. Guarda como .bbmodel para conservarlos.',
        dependencies_missing: 'Visual Shader Graph requiere Light Manager y Shader Architect.',
        select_elements: 'Primero selecciona al menos un elemento renderizable.',
        graph_imported: 'Grafo de shaders importado.',
        material_exported: 'El material compilado está listo para exportarse.',
        confirm_delete_graph: '¿Eliminar este grafo de shaders? Puedes deshacerlo.',
        add_uniform_port: 'Exponer Uniform',
        remove_port: 'Eliminar Puerto',
        keyboard_help: 'Supr elimina nodos. Ctrl/Cmd+C, V y D copia, pega y duplica. F encuadra el grafo. Enter en una salida inicia una conexión accesible; Escape la cancela.',
        connect_from: 'Iniciar conexión desde',
        connect_to: 'Conectar a',
        connection_failed: 'Estos puertos no son compatibles por tipo.',
        surface_output_missing: 'Agrega un nodo Surface Output o Preset Output.',
        graph_too_large: 'El grafo supera el límite seguro de importación.',
        graph_expression_too_complex: 'La expresión generada es demasiado compleja. Divide o simplifica las ramas repetidas.',
        invalid_graph_format: 'Este archivo no es un Grafo Visual de Shaders de Lightflow.',
        unsupported_graph_version: 'Este grafo fue creado con una versión más nueva y no compatible del plugin.',
        compile_failed: 'No fue posible compilar el grafo.',
        compile_success: 'Grafo de shaders compilado.',
        apply_success: 'Shader compilado y aplicado.',
        material_id_conflict: 'El ID de Material ya pertenece a otro material de Shader Architect.',
        stage_mismatch: 'Este nodo no puede evaluarse en la etapa del shader donde está conectado.',
        preset_base_missing: 'El preset de Shader Architect referenciado no está disponible.',
        preset_constant_only: 'Las entradas de presets exactos solo aceptan parámetros o reroutes; usa una superficie Nativa del Grafo para expresiones dinámicas.',
        exact_preset_note: 'Esta salida clona el shader exacto de Shader Architect. Los parámetros conectados reemplazan uniforms expuestos sin reescribir su GLSL.',
        recent: 'Recientes',
        search_nodes_commands: 'Buscar nodos o comandos',
        graph: 'Grafo',
        node: 'Nodo',
        selected_node: 'Nodo Seleccionado',
        graph_summary: 'Resumen del Grafo',
        node_count: 'Nodos',
        connection_count: 'Conexiones',
        last_compiled: 'Última Compilación',
        not_compiled: 'Sin compilar',
        just_now: 'Ahora',
        copy_material_id: 'Copiar ID del Material',
        material_id_copied: 'ID del Material copiado.',
        graph_actions: 'Acciones del Grafo',
        apply: 'Aplicar',
        more: 'Más',
        center_node: 'Centrar Nodo',
        view_all_diagnostics: 'Ver Todo el Diagnóstico',
        keyboard_shortcuts: 'Atajos de Teclado',
        zoom: 'Zoom',
        connections: 'conexiones',
        nodes: 'nodos',
        compiled_in: 'Compilado en',
        all_presets: 'Todos los Presets',
        alpha_mode: 'Modo Alfa',
        title_override: 'Título Personalizado',
        connected: 'Conectado',
        preview_size: 'Tamaño del Preview',
        preview_small: 'Preview Pequeño',
        preview_medium: 'Preview Mediano',
        preview_large: 'Preview Grande',
        move_node_help: 'Usa las flechas para moverte entre nodos. Mantén Shift y usa las flechas para mover el nodo seleccionado.',
        resources: 'Recursos / Blackboard',
        auto_layout: 'Organizar Automáticamente',
        snap_grid: 'Ajustar a Cuadrícula',
        create_group: 'Agrupar Selección',
        ungroup: 'Desagrupar',
        create_subgraph: 'Crear Subgrafo'
    };

    function isSpanish() {
        const language = String(
            (typeof settings !== 'undefined' && settings.language && settings.language.value) ||
            (typeof Blockbench !== 'undefined' && Blockbench.language) ||
            (typeof navigator !== 'undefined' && navigator.language) ||
            'en'
        ).toLowerCase();
        return language.startsWith('es');
    }

    function tr(key) {
        const table = isSpanish() ? ES : EN;
        return table[key] || EN[key] || key;
    }

    function makeId(prefix = 'vsg') {
        if (typeof guid === 'function') return guid();
        const random = Math.random().toString(36).slice(2, 10);
        return `${prefix}_${Date.now().toString(36)}_${random}`;
    }

    function deepClone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function clampNumber(value, min, max, fallback = 0) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, number));
    }

    function safeIdentifier(value, fallback = 'Value') {
        let clean = String(value || '')
            .replace(/[^a-zA-Z0-9_]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
        if (clean && !/^[a-zA-Z_]/.test(clean)) clean = `_${clean}`;
        return String(clean || fallback).slice(0, 96);
    }

    function materialIdForGraph(graph) {
        const explicit = safeIdentifier(graph?.settings?.materialId || '', '');
        return explicit || `${GENERATED_MATERIAL_PREFIX}${safeIdentifier(graph?.id || makeId('graph'), 'graph')}`;
    }

    function graphOwnerToken(graphId) {
        let hash = 2166136261;
        for (const character of String(graphId || '')) {
            hash ^= character.charCodeAt(0);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function compileGraphRenderState(graph, outputNode) {
        if (!graph) return null;
        const node = outputNode || graph.nodes.find(entry => entry.type === 'surface_output' || entry.type === 'preset_output');
        if (!node) return null;
        return {
            doubleSided: !!node.data.doubleSided,
            depthWrite: node.data.depthWrite !== false,
            transparent: graph.settings.alphaMode === 'blend' ||
                (node.type === 'preset_output' && graph.settings.alphaMode === 'additive')
        };
    }

    const port = (id, name, type, defaultValue, extra = {}) => Object.freeze(Object.assign({
        id, name, type, default: defaultValue
    }, extra));

    const nodeDef = (title, category, inputs, outputs, options = {}) => Object.freeze(Object.assign({
        title,
        category,
        icon: CATEGORY_META[category]?.icon || 'circle',
        color: CATEGORY_META[category]?.color || '#8c97a7',
        width: 210,
        inputs: inputs || [],
        outputs: outputs || [],
        defaults: {},
        properties: []
    }, options));

    const NODE_DEFINITIONS = Object.freeze({
        vertex_output: nodeDef('Vertex Output', 'stage', [
            port('position', 'Object Position', 'vec3', [0, 0, 0], { stage: 'vertex', binding: 'position' }),
            port('normal', 'Object Normal', 'vec3', [0, 1, 0], { stage: 'vertex', binding: 'normal' })
        ], [], {
            icon: 'vertical_align_top',
            width: 238,
            stages: ['vertex'],
            defaults: { positionMode: 'absolute' },
            properties: [
                { key: 'positionMode', label: 'Position Mode', type: 'select', options: {
                    absolute: 'Absolute Object Position',
                    offset: 'Offset From Geometry'
                } }
            ]
        }),
        surface_output: nodeDef('Fragment / Surface Output', 'output', [
            port('baseColor', 'Base Color', 'color', [1, 1, 1]),
            port('alpha', 'Alpha', 'float', 1),
            port('normal', 'World Normal', 'vec3', [0, 0, 0]),
            port('emission', 'Emission', 'color', [0, 0, 0]),
            port('metallic', 'Metallic', 'float', 0),
            port('roughness', 'Roughness', 'float', 0.65),
            port('occlusion', 'Occlusion', 'float', 1),
            port('alphaClip', 'Alpha Clip', 'float', 0.01),
            port('vertexOffset', 'Vertex Offset', 'vec3', [0, 0, 0], { stage: 'vertex' })
        ], [], {
            icon: 'output',
            width: 238,
            defaults: { lightingModel: 'pbr', doubleSided: false, depthWrite: true },
            properties: [
                { key: 'lightingModel', label: 'Lighting Model', type: 'select', options: {
                    pbr: 'PBR', lightflow: 'Lightflow', toon: 'Toon', unlit: 'Unlit'
                } },
                { key: 'doubleSided', label: 'Double Sided', type: 'checkbox' },
                { key: 'depthWrite', label: 'Write Depth', type: 'checkbox' }
            ]
        }),
        preset_output: nodeDef('Preset Output', 'output', [], [], {
            icon: 'architecture',
            width: 248,
            defaults: { baseMaterialId: 'lightflow', uniformPorts: [], doubleSided: false, depthWrite: true },
            properties: [
                { key: 'baseMaterialId', label: 'Base Material', type: 'material' },
                { key: 'doubleSided', label: 'Double Sided', type: 'checkbox' },
                { key: 'depthWrite', label: 'Write Depth', type: 'checkbox' }
            ]
        }),
        project_texture: nodeDef('Project Texture', 'texture', [], [
            port('texture', 'Texture', 'texture', null)
        ], { icon: 'texture', width: 188 }),
        texture_parameter: nodeDef('Texture Parameter', 'parameter', [], [
            port('texture', 'Texture', 'texture', null)
        ], {
            icon: 'image',
            defaults: { name: 'Texture', expose: true },
            properties: [
                { key: 'name', label: 'Parameter Name', type: 'text' },
                { key: 'expose', label: 'Expose in Material', type: 'checkbox' }
            ]
        }),
        float_parameter: nodeDef('Float Parameter', 'parameter', [], [
            port('value', 'Value', 'float', 0)
        ], {
            defaults: { name: 'Float', value: 0, min: 0, max: 1, step: 0.01, expose: true },
            properties: [
                { key: 'name', label: 'Parameter Name', type: 'text' },
                { key: 'value', label: 'Default Value', type: 'number' },
                { key: 'min', label: 'Minimum', type: 'number' },
                { key: 'max', label: 'Maximum', type: 'number' },
                { key: 'step', label: 'Step', type: 'number' },
                { key: 'expose', label: 'Expose in Material', type: 'checkbox' }
            ]
        }),
        bool_parameter: nodeDef('Boolean Parameter', 'parameter', [], [
            port('value', 'Value', 'bool', false)
        ], {
            defaults: { name: 'Toggle', value: false, expose: true },
            properties: [
                { key: 'name', label: 'Parameter Name', type: 'text' },
                { key: 'value', label: 'Default Value', type: 'checkbox' },
                { key: 'expose', label: 'Expose in Material', type: 'checkbox' }
            ]
        }),
        color_parameter: nodeDef('Color Parameter', 'parameter', [], [
            port('value', 'Color', 'color', [1, 1, 1])
        ], {
            defaults: { name: 'Color', value: [1, 1, 1], hex: '#ffffff', expose: true },
            properties: [
                { key: 'name', label: 'Parameter Name', type: 'text' },
                { key: 'hex', label: 'Default Color', type: 'color' },
                { key: 'expose', label: 'Expose in Material', type: 'checkbox' }
            ]
        }),
        vector2_parameter: nodeDef('Vector 2 Parameter', 'parameter', [], [
            port('value', 'Vector', 'vec2', [0, 0])
        ], {
            defaults: { name: 'Vector2', value: [0, 0], expose: true },
            properties: [
                { key: 'name', label: 'Parameter Name', type: 'text' },
                { key: 'value', label: 'Default Vector', type: 'vec2' },
                { key: 'expose', label: 'Expose in Material', type: 'checkbox' }
            ]
        }),
        vector3_parameter: nodeDef('Vector 3 Parameter', 'parameter', [], [
            port('value', 'Vector', 'vec3', [0, 0, 0])
        ], {
            defaults: { name: 'Vector3', value: [0, 0, 0], expose: true },
            properties: [
                { key: 'name', label: 'Parameter Name', type: 'text' },
                { key: 'value', label: 'Default Vector', type: 'vec3' },
                { key: 'expose', label: 'Expose in Material', type: 'checkbox' }
            ]
        }),
        vector4_parameter: nodeDef('Vector 4 Parameter', 'parameter', [], [
            port('value', 'Vector', 'vec4', [0, 0, 0, 1])
        ], {
            defaults: { name: 'Vector4', value: [0, 0, 0, 1], expose: true },
            properties: [
                { key: 'name', label: 'Parameter Name', type: 'text' },
                { key: 'value', label: 'Default Vector', type: 'vec4' },
                { key: 'expose', label: 'Expose in Material', type: 'checkbox' }
            ]
        }),
        uv: nodeDef('UV', 'input', [], [port('uv', 'UV', 'vec2', [0, 0])], { icon: 'grid_4x4' }),
        time: nodeDef('Time', 'input', [], [port('time', 'Time', 'float', 0)], { icon: 'schedule' }),
        world_position: nodeDef('World Position', 'input', [], [port('position', 'Position', 'vec3', [0, 0, 0])], { icon: 'language' }),
        world_normal: nodeDef('World Normal', 'input', [], [port('normal', 'Normal', 'vec3', [0, 1, 0])], { icon: 'north_east' }),
        view_direction: nodeDef('View Direction', 'input', [], [port('direction', 'Direction', 'vec3', [0, 0, 1])], { icon: 'visibility' }),
        camera_position: nodeDef('Camera Position', 'input', [], [port('position', 'Position', 'vec3', [0, 0, 0])], { icon: 'photo_camera' }),
        vertex_position: nodeDef('Vertex Position', 'input', [], [port('position', 'Position', 'vec3', [0, 0, 0])], { icon: 'scatter_plot', stages: ['vertex'] }),
        vertex_normal: nodeDef('Vertex Normal', 'input', [], [port('normal', 'Normal', 'vec3', [0, 1, 0])], { icon: 'navigation', stages: ['vertex'] }),
        vertex_tangent: nodeDef('Vertex Tangent', 'input', [], [port('tangent', 'Tangent', 'vec3', [1, 0, 0])], { icon: 'trending_flat', stages: ['vertex'] }),
        vertex_color: nodeDef('Vertex Color', 'input', [], [port('color', 'Color', 'vec4', [1, 1, 1, 1])], { icon: 'palette', stages: ['vertex'] }),
        uv_channel: nodeDef('UV Channel', 'input', [], [port('uv', 'UV', 'vec2', [0, 0])], {
            icon: 'grid_4x4',
            stages: ['vertex'],
            defaults: { channel: '0' },
            properties: [
                { key: 'channel', label: 'Channel', type: 'select', options: { '0': 'UV0', '1': 'UV1', '2': 'UV2', '3': 'UV3' } }
            ]
        }),
        geometry_attribute: nodeDef('Geometry Attribute', 'stage', [], [port('value', 'Value', 'float', 0)], {
            icon: 'data_object',
            width: 230,
            stages: ['vertex'],
            defaults: { attributeName: 'customAttribute', attributeType: 'float' },
            properties: [
                { key: 'attributeName', label: 'Attribute Name', type: 'text' },
                { key: 'attributeType', label: 'Attribute Type', type: 'select', options: {
                    float: 'Float', vec2: 'Vector 2', vec3: 'Vector 3', vec4: 'Vector 4'
                } }
            ]
        }),
        varying: nodeDef('Vertex → Fragment', 'stage', [port('in', 'Vertex Value', 'float', 0, { stage: 'vertex' })], [port('out', 'Fragment Value', 'float', 0, { stage: 'fragment' })], {
            icon: 'swap_vert',
            width: 230,
            stages: ['vertex', 'fragment'],
            defaults: { name: 'Varying', valueType: 'float' },
            properties: [
                { key: 'name', label: 'Varying Name', type: 'text' },
                { key: 'valueType', label: 'Value Type', type: 'select', options: {
                    float: 'Float', vec2: 'Vector 2', vec3: 'Vector 3', vec4: 'Vector 4', color: 'Color'
                } }
            ]
        }),
        uniform_reference: nodeDef('Uniform Reference', 'parameter', [], [port('value', 'Value', 'float', 0)], {
            icon: 'tune',
            width: 230,
            defaults: { name: 'uCustom', uniformType: 'float', value: 0, expose: false },
            properties: [
                { key: 'name', label: 'Uniform Name', type: 'text' },
                { key: 'uniformType', label: 'Uniform Type', type: 'select', options: {
                    bool: 'Boolean', int: 'Integer', float: 'Float', vec2: 'Vector 2', vec3: 'Vector 3', vec4: 'Vector 4', color: 'Color'
                } },
                { key: 'value', label: 'Default Value', type: 'text' },
                { key: 'expose', label: 'Expose in Material', type: 'checkbox' }
            ]
        }),
        fragment_coordinate: nodeDef('Fragment Coordinate', 'input', [], [port('coord', 'Frag Coord', 'vec4', [0, 0, 0, 1])], { icon: 'my_location', stages: ['fragment'] }),
        front_facing: nodeDef('Front Facing', 'input', [], [port('front', 'Front', 'bool', true)], { icon: 'flip', stages: ['fragment'] }),
        normalized_face_uv: nodeDef('Normalized Face UV', 'input', [], [port('uv', 'Face UV', 'vec2', [0, 0])], { icon: 'crop_free', width: 220 }),
        face_size: nodeDef('Face Size', 'input', [], [port('size', 'Face Size', 'vec2', [1, 1])], { icon: 'aspect_ratio', width: 190 }),
        global_face_size: nodeDef('Global Face Size', 'input', [], [port('size', 'Global Face Size', 'vec2', [1, 1])], { icon: 'straighten', width: 220 }),
        uv_size: nodeDef('UV Size', 'input', [], [port('size', 'UV Size', 'vec2', [1, 1])], { icon: 'texture', width: 190 }),
        normalized_uv_size: nodeDef('Normalized UV Size', 'input', [], [port('size', 'Normalized UV Region', 'vec2', [1, 1])], { icon: 'aspect_ratio', width: 225 }),
        auto_tile_state: nodeDef('Auto Tile State', 'input', [], [port('enabled', 'Auto Tile', 'float', 0)], { icon: 'grid_on', width: 200 }),
        texture_size: nodeDef('Texture Size', 'input', [], [port('size', 'Texture Size', 'vec2', [16, 16])], { icon: 'photo_size_select_large', width: 205 }),
        screen_uv: nodeDef('Screen UV', 'scene', [], [port('uv', 'Screen UV', 'vec2', [0, 0])], { icon: 'crop_16_9', stages: ['fragment'], width: 190 }),
        screen_size: nodeDef('Screen Size', 'scene', [], [port('size', 'Pixels', 'vec2', [1, 1])], { icon: 'desktop_windows', stages: ['fragment'], width: 190 }),
        screen_texel_size: nodeDef('Screen Texel Size', 'scene', [], [port('size', '1 / Pixels', 'vec2', [1, 1])], { icon: 'grid_3x3', stages: ['fragment'], width: 215 }),
        screen_info: nodeDef('Screen / Camera Info', 'scene', [], [
            port('near', 'Near', 'float', 0.1), port('far', 'Far', 'float', 1000), port('dpr', 'DPR', 'float', 1),
            port('frame', 'Frame ID', 'float', 0), port('colorAvailable', 'Color Available', 'float', 0), port('depthAvailable', 'Depth Available', 'float', 0)
        ], { icon: 'monitor', stages: ['fragment'], width: 235 }),
        scene_color: nodeDef('Scene Color', 'scene', [port('uv', 'Screen UV', 'vec2', [0, 0])], [
            port('rgba', 'RGBA', 'vec4', [0, 0, 0, 1]), port('rgb', 'RGB', 'color', [0, 0, 0]), port('a', 'A', 'float', 1)
        ], { icon: 'wallpaper', stages: ['fragment'], width: 220 }),
        scene_depth: nodeDef('Scene Depth', 'scene', [port('uv', 'Screen UV', 'vec2', [0, 0])], [port('depth', 'Depth', 'float', 1)], {
            icon: 'layers', stages: ['fragment'], width: 220,
            defaults: { mode: 'raw' },
            properties: [{ key: 'mode', label: 'Depth Mode', type: 'select', options: { raw: 'Raw 0–1', linear01: 'Linear 0–1', eye: 'Eye Distance' } }]
        }),
        scene_view_position: nodeDef('Scene View Position', 'scene', [port('uv', 'Screen UV', 'vec2', [0, 0]), port('depth', 'Raw Depth', 'float', 1)], [
            port('position', 'View Position', 'vec3', [0, 0, 0])
        ], { icon: 'center_focus_strong', stages: ['fragment'], width: 235 }),
        scene_world_position: nodeDef('Scene World Position', 'scene', [port('uv', 'Screen UV', 'vec2', [0, 0]), port('depth', 'Raw Depth', 'float', 1)], [
            port('position', 'World Position', 'vec3', [0, 0, 0])
        ], { icon: 'public', stages: ['fragment'], width: 235 }),
        ddx: nodeDef('DDX', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Derivative X', 'any', 0)], { icon: 'show_chart', unary: 'dFdx', stages: ['fragment'] }),
        ddy: nodeDef('DDY', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Derivative Y', 'any', 0)], { icon: 'show_chart', unary: 'dFdy', stages: ['fragment'] }),
        fwidth: nodeDef('Fwidth', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Width', 'any', 0)], { icon: 'show_chart', unary: 'fwidth', stages: ['fragment'] }),
        negate: nodeDef('Negate', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { icon: 'exposure_neg_1' }),
        tangent_math: nodeDef('Tangent', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { unary: 'tan' }),
        arcsine: nodeDef('Arcsine', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { unary: 'asin' }),
        arccosine: nodeDef('Arccosine', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { unary: 'acos' }),
        exponential: nodeDef('Exponential', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { unary: 'exp' }),
        exponential2: nodeDef('Exponential 2', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { unary: 'exp2' }),
        logarithm: nodeDef('Natural Log', 'math', [port('value', 'Value', 'any', 1)], [port('out', 'Result', 'any', 0)], { unary: 'log' }),
        logarithm2: nodeDef('Log 2', 'math', [port('value', 'Value', 'any', 1)], [port('out', 'Result', 'any', 0)], { unary: 'log2' }),
        sign: nodeDef('Sign', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { unary: 'sign' }),
        round: nodeDef('Round', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { unary: 'floor', unarySuffix: ' + 0.5' }),
        modulo: nodeDef('Modulo', 'math', [port('a', 'A', 'any', 0), port('b', 'B', 'any', 1)], [port('out', 'Result', 'any', 0)], { functionName: 'mod' }),
        step: nodeDef('Step', 'math', [port('a', 'Edge', 'any', 0.5), port('b', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { functionName: 'step' }),
        add: nodeDef('Add', 'math', [port('a', 'A', 'any', 0), port('b', 'B', 'any', 0)], [port('out', 'Result', 'any', 0)], { operation: '+' }),
        subtract: nodeDef('Subtract', 'math', [port('a', 'A', 'any', 0), port('b', 'B', 'any', 0)], [port('out', 'Result', 'any', 0)], { operation: '-' }),
        multiply: nodeDef('Multiply', 'math', [port('a', 'A', 'any', 0), port('b', 'B', 'any', 1)], [port('out', 'Result', 'any', 0)], { operation: '*' }),
        divide: nodeDef('Divide', 'math', [port('a', 'A', 'any', 0), port('b', 'B', 'any', 1)], [port('out', 'Result', 'any', 0)], { operation: '/' }),
        power: nodeDef('Power', 'math', [port('a', 'Base', 'any', 0), port('b', 'Exponent', 'any', 1)], [port('out', 'Result', 'any', 0)], { functionName: 'pow' }),
        minimum: nodeDef('Minimum', 'math', [port('a', 'A', 'any', 0), port('b', 'B', 'any', 0)], [port('out', 'Result', 'any', 0)], { functionName: 'min' }),
        maximum: nodeDef('Maximum', 'math', [port('a', 'A', 'any', 0), port('b', 'B', 'any', 0)], [port('out', 'Result', 'any', 0)], { functionName: 'max' }),
        clamp: nodeDef('Clamp', 'math', [port('value', 'Value', 'any', 0), port('min', 'Min', 'any', 0), port('max', 'Max', 'any', 1)], [port('out', 'Result', 'any', 0)], { functionName: 'clamp' }),
        saturate: nodeDef('Saturate', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { unary: 'clamp', unarySuffix: ', 0.0, 1.0' }),
        one_minus: nodeDef('One Minus', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { unaryPrefix: '1.0 - ' }),
        absolute: nodeDef('Absolute', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { unary: 'abs' }),
        floor: nodeDef('Floor', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { unary: 'floor' }),
        ceil: nodeDef('Ceil', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { unary: 'ceil' }),
        fraction: nodeDef('Fraction', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { unary: 'fract' }),
        sine: nodeDef('Sine', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { unary: 'sin' }),
        cosine: nodeDef('Cosine', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { unary: 'cos' }),
        square_root: nodeDef('Square Root', 'math', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { unary: 'sqrt' }),
        dot: nodeDef('Dot Product', 'vector', [port('a', 'A', 'vec3', [0, 0, 0]), port('b', 'B', 'vec3', [0, 0, 0])], [port('out', 'Result', 'float', 0)], { functionName: 'dot', forceOutputType: 'float' }),
        cross: nodeDef('Cross Product', 'vector', [port('a', 'A', 'vec3', [0, 0, 0]), port('b', 'B', 'vec3', [0, 0, 0])], [port('out', 'Result', 'vec3', [0, 0, 0])], { functionName: 'cross' }),
        normalize: nodeDef('Normalize', 'vector', [port('value', 'Value', 'any', 0)], [port('out', 'Result', 'any', 0)], { unary: 'normalize' }),
        length: nodeDef('Length', 'vector', [port('value', 'Value', 'any', 0)], [port('out', 'Length', 'float', 0)], { unary: 'length', forceOutputType: 'float' }),
        distance: nodeDef('Distance', 'vector', [port('a', 'A', 'any', 0), port('b', 'B', 'any', 0)], [port('out', 'Distance', 'float', 0)], { functionName: 'distance', forceOutputType: 'float' }),
        reflect: nodeDef('Reflect', 'vector', [port('a', 'Incident', 'vec3', [0, 0, -1]), port('b', 'Normal', 'vec3', [0, 1, 0])], [port('out', 'Direction', 'vec3', [0, 0, 1])], { functionName: 'reflect' }),
        refract: nodeDef('Refract', 'vector', [port('incident', 'Incident', 'vec3', [0, 0, -1]), port('normal', 'Normal', 'vec3', [0, 1, 0]), port('eta', 'Eta', 'float', 0.66)], [port('out', 'Direction', 'vec3', [0, 0, 1])]),
        faceforward: nodeDef('Face Forward', 'vector', [port('normal', 'Normal', 'vec3', [0, 1, 0]), port('incident', 'Incident', 'vec3', [0, 0, -1]), port('reference', 'Reference Normal', 'vec3', [0, 1, 0])], [port('out', 'Normal', 'vec3', [0, 1, 0])]),
        lerp: nodeDef('Lerp', 'math', [port('a', 'A', 'any', 0), port('b', 'B', 'any', 1), port('t', 'T', 'float', 0.5)], [port('out', 'Result', 'any', 0)], { functionName: 'mix' }),
        smoothstep: nodeDef('Smoothstep', 'math', [port('edge1', 'Edge 1', 'any', 0), port('edge2', 'Edge 2', 'any', 1), port('value', 'Value', 'any', 0.5)], [port('out', 'Result', 'any', 0)], { functionName: 'smoothstep' }),
        remap: nodeDef('Remap', 'math', [
            port('value', 'Value', 'any', 0), port('inMin', 'Input Min', 'any', 0), port('inMax', 'Input Max', 'any', 1),
            port('outMin', 'Output Min', 'any', 0), port('outMax', 'Output Max', 'any', 1)
        ], [port('out', 'Result', 'any', 0)], { customOperation: 'remap' }),
        combine: nodeDef('Combine', 'vector', [port('x', 'X', 'float', 0), port('y', 'Y', 'float', 0), port('z', 'Z', 'float', 0), port('w', 'W', 'float', 1)], [
            port('xy', 'XY', 'vec2', [0, 0]), port('xyz', 'XYZ', 'vec3', [0, 0, 0]), port('xyzw', 'XYZW', 'vec4', [0, 0, 0, 1])
        ]),
        split: nodeDef('Split', 'vector', [port('value', 'Vector', 'vec4', [0, 0, 0, 1])], [
            port('x', 'X / R', 'float', 0), port('y', 'Y / G', 'float', 0), port('z', 'Z / B', 'float', 0), port('w', 'W / A', 'float', 1)
        ]),
        sample_texture: nodeDef('Sample Texture 2D', 'texture', [port('texture', 'Texture', 'texture', null), port('uv', 'UV', 'vec2', [0, 0])], [
            port('rgba', 'RGBA', 'vec4', [1, 1, 1, 1]), port('rgb', 'RGB', 'color', [1, 1, 1]), port('r', 'R', 'float', 1),
            port('g', 'G', 'float', 1), port('b', 'B', 'float', 1), port('a', 'A', 'float', 1)
        ], { icon: 'texture' }),
        tiling_offset: nodeDef('Tiling and Offset', 'texture', [port('uv', 'UV', 'vec2', [0, 0]), port('tiling', 'Tiling', 'vec2', [1, 1]), port('offset', 'Offset', 'vec2', [0, 0])], [port('out', 'UV', 'vec2', [0, 0])]),
        checkerboard: nodeDef('Checkerboard', 'texture', [port('uv', 'UV', 'vec2', [0, 0]), port('scale', 'Scale', 'float', 8)], [port('out', 'Mask', 'float', 0)], { icon: 'grid_view' }),
        simple_noise: nodeDef('Simple Noise', 'texture', [port('uv', 'UV', 'vec2', [0, 0]), port('scale', 'Scale', 'float', 8)], [port('out', 'Noise', 'float', 0)], { icon: 'grain' }),
        triplanar_sample: nodeDef('Triplanar Sample', 'texture', [
            port('texture', 'Texture', 'texture', null), port('position', 'World Position', 'vec3', [0, 0, 0]),
            port('normal', 'World Normal', 'vec3', [0, 1, 0]), port('tiling', 'Tiling', 'float', 1), port('blend', 'Blend Sharpness', 'float', 4)
        ], [port('rgba', 'RGBA', 'vec4', [1, 1, 1, 1]), port('rgb', 'RGB', 'color', [1, 1, 1]), port('a', 'A', 'float', 1)], { icon: 'view_in_ar', stages: ['fragment'], width: 250 }),
        autotile_uv: nodeDef('AutoTile UV', 'texture', [port('uv', 'Atlas UV', 'vec2', [0, 0]), port('tiling', 'Fallback Tiling', 'vec2', [1, 1])], [port('uv', 'AutoTiled UV', 'vec2', [0, 0])], {
            icon: 'grid_view', stages: ['fragment'], width: 235,
            defaults: { mode: 'force' },
            properties: [{ key: 'mode', label: 'AutoTile Mode', type: 'select', options: { force: 'Force AutoTile', geometry: 'Use Geometry State', manual: 'Manual Tiling Only' } }]
        }),
        texture_relief: nodeDef('Texture Relief / Parallax', 'texture', [
            port('heightTexture', 'Height Texture', 'texture', null), port('uv', 'UV', 'vec2', [0, 0]),
            port('view', 'View Direction', 'vec3', [0, 0, 1]), port('height', 'Height', 'float', 0.04), port('steps', 'Steps', 'float', 16)
        ], [port('uv', 'Relief UV', 'vec2', [0, 0]), port('height', 'Sampled Height', 'float', 0)], { icon: 'terrain', stages: ['fragment'], width: 255 }),
        fresnel: nodeDef('Fresnel Effect', 'lighting', [port('normal', 'Normal', 'vec3', [0, 1, 0]), port('view', 'View Direction', 'vec3', [0, 0, 1]), port('power', 'Power', 'float', 3)], [port('out', 'Fresnel', 'float', 0)], { icon: 'flare' }),
        rim_lighting: nodeDef('Rim Lighting', 'lighting', [
            port('normal', 'Normal', 'vec3', [0, 1, 0]), port('view', 'View Direction', 'vec3', [0, 0, 1]),
            port('color', 'Rim Color', 'color', [1, 1, 1]), port('power', 'Power', 'float', 3), port('intensity', 'Intensity', 'float', 1)
        ], [port('mask', 'Rim Mask', 'float', 0), port('color', 'Rim Color', 'color', [0, 0, 0])], { icon: 'flare', width: 235 }),
        bump_from_height: nodeDef('Bump from Height', 'lighting', [
            port('height', 'Height', 'float', 0), port('normal', 'Normal', 'vec3', [0, 1, 0]),
            port('strength', 'Strength', 'float', 1), port('distance', 'Distance', 'float', 0.1)
        ], [port('normal', 'Normal', 'vec3', [0, 1, 0])], { icon: 'waves', stages: ['fragment'], width: 230 }),
        normal_from_texture: nodeDef('Normal from Texture', 'lighting', [port('sample', 'Normal Sample', 'color', [0.5, 0.5, 1]), port('strength', 'Strength', 'float', 1)], [port('normal', 'World Normal', 'vec3', [0, 1, 0])], { icon: 'filter_tilt_shift', stages: ['fragment'] }),
        less_than: nodeDef('Less Than', 'utility', [port('a', 'A', 'float', 0), port('b', 'B', 'float', 0)], [port('out', 'Result', 'bool', false)], { icon: 'compare_arrows' }),
        greater_than: nodeDef('Greater Than', 'utility', [port('a', 'A', 'float', 0), port('b', 'B', 'float', 0)], [port('out', 'Result', 'bool', false)], { icon: 'compare_arrows' }),
        equal: nodeDef('Equal', 'utility', [port('a', 'A', 'float', 0), port('b', 'B', 'float', 0)], [port('out', 'Result', 'bool', false)], { icon: 'drag_handle' }),
        boolean_not: nodeDef('Not', 'utility', [port('value', 'Value', 'bool', false)], [port('out', 'Result', 'bool', true)], { icon: 'priority_high' }),
        boolean_and: nodeDef('And', 'utility', [port('a', 'A', 'bool', false), port('b', 'B', 'bool', false)], [port('out', 'Result', 'bool', false)], { icon: 'join_inner' }),
        boolean_or: nodeDef('Or', 'utility', [port('a', 'A', 'bool', false), port('b', 'B', 'bool', false)], [port('out', 'Result', 'bool', false)], { icon: 'call_split' }),
        branch: nodeDef('Branch', 'utility', [port('condition', 'Condition', 'bool', false), port('true', 'True', 'any', 1), port('false', 'False', 'any', 0)], [port('out', 'Result', 'any', 0)], { icon: 'alt_route' }),
        reroute: nodeDef('Reroute', 'utility', [port('in', 'Input', 'any', 0)], [port('out', 'Output', 'any', 0)], { icon: 'timeline', width: 150 }),
        subgraph_input: nodeDef('Sub Graph Input', 'advanced', [], [], {
            icon: 'input', width: 205, defaults: { portId: '', name: 'Input', valueType: 'float', defaultValue: 0 },
            properties: [{ key: 'name', label: 'Port Name', type: 'text' }, { key: 'valueType', label: 'Type', type: 'select', options: { float: 'Float', vec2: 'Vector 2', vec3: 'Vector 3', vec4: 'Vector 4', color: 'Color', bool: 'Boolean', texture: 'Texture 2D' } }]
        }),
        subgraph_output: nodeDef('Sub Graph Output', 'advanced', [], [], {
            icon: 'output', width: 205, defaults: { portId: '', name: 'Output', valueType: 'float', defaultValue: 0 },
            properties: [{ key: 'name', label: 'Port Name', type: 'text' }, { key: 'valueType', label: 'Type', type: 'select', options: { float: 'Float', vec2: 'Vector 2', vec3: 'Vector 3', vec4: 'Vector 4', color: 'Color', bool: 'Boolean', texture: 'Texture 2D' } }]
        }),
        subgraph_instance: nodeDef('Sub Graph', 'advanced', [], [], { icon: 'account_tree', width: 240, defaults: { targetGraphId: '', targetGraphName: 'Sub Graph', inputs: [], outputs: [] } }),
        global_expression: nodeDef('Global GLSL', 'advanced', [], [], {
            icon: 'code_blocks',
            width: 260,
            defaults: { scope: 'both', code: '' },
            properties: [
                { key: 'scope', label: 'Shader Scope', type: 'select', options: { both: 'Vertex + Fragment', vertex: 'Vertex Only', fragment: 'Fragment Only' } },
                { key: 'code', label: 'Global GLSL', type: 'textarea' }
            ]
        }),
        custom_expression: nodeDef('Custom Expression', 'advanced', [port('a', 'A', 'any', 0), port('b', 'B', 'any', 0), port('c', 'C', 'any', 0)], [port('out', 'Result', 'any', 0)], {
            icon: 'code',
            width: 240,
            defaults: { expression: 'A', outputType: 'float' },
            properties: [
                { key: 'outputType', label: 'Output Type', type: 'select', options: { float: 'Float', vec2: 'Vector 2', vec3: 'Vector 3', vec4: 'Vector 4', color: 'Color' } },
                { key: 'expression', label: 'GLSL Expression', type: 'textarea' }
            ]
        })
    });

    function getNodeDefinition(type) {
        return NODE_DEFINITIONS[type] || null;
    }

    function getNodeDisplayTitle(node) {
        if (!node) return '';
        const parameterName = node.type?.endsWith('_parameter') && String(node.data?.name || '').trim();
        const namedStageResource = ['geometry_attribute', 'varying', 'uniform_reference'].includes(node.type)
            ? String(node.data?.attributeName || node.data?.name || '').trim()
            : '';
        if (node.type === 'preset_output') {
            const baseName = (typeof window !== 'undefined' && window.MaterialManager?.materials?.[node.data?.baseMaterialId]?.name) || node.data?.baseMaterialId;
            return node.title || `${getNodeDefinition(node.type)?.title || 'Preset Output'}${baseName ? `: ${baseName}` : ''}`;
        }
        if (node.type === 'subgraph_instance') return node.title || node.data?.targetGraphName || 'Sub Graph';
        if (node.type === 'subgraph_input' || node.type === 'subgraph_output') return node.title || node.data?.name || getNodeDefinition(node.type)?.title || node.type;
        return node.title || parameterName || namedStageResource || getNodeDefinition(node.type)?.title || node.type;
    }

    function getNodeTypeLabel(node) {
        if (!node) return '';
        if (node.type?.endsWith('_parameter')) {
            const output = getNodeOutputPorts(node)[0];
            return TYPE_META[output?.type]?.label || getNodeDefinition(node.type)?.title || node.type;
        }
        return getNodeDefinition(node.type)?.title || node.type;
    }

    function normalizeSubgraphPortType(value) {
        return ['bool', 'float', 'vec2', 'vec3', 'vec4', 'color', 'texture'].includes(value) ? value : 'float';
    }

    function defaultSubgraphValue(type) {
        if (type === 'bool') return false;
        if (type === 'texture') return null;
        if (type === 'vec2') return [0, 0];
        if (type === 'vec3' || type === 'color') return [0, 0, 0];
        if (type === 'vec4') return [0, 0, 0, 0];
        return 0;
    }

    function normalizeSubgraphInterfaceList(list, fallbackName) {
        const used = new Set();
        return (Array.isArray(list) ? list : []).slice(0, 64).map((entry, index) => {
            let id = safeIdentifier(entry?.id || `port_${index + 1}`, `port_${index + 1}`);
            while (used.has(id)) id = `${id}_${index + 1}`;
            used.add(id);
            const type = normalizeSubgraphPortType(entry?.type);
            return { id, name: String(entry?.name || `${fallbackName} ${index + 1}`).slice(0, 96), type, defaultValue: deepClone(entry?.defaultValue !== undefined ? entry.defaultValue : defaultSubgraphValue(type)) };
        });
    }

    function getNodeInputPorts(node, materialRegistry) {
        const definition = getNodeDefinition(node?.type);
        if (!definition) return [];
        if (node.type === 'varying') {
            const type = ['float', 'vec2', 'vec3', 'vec4', 'color'].includes(node.data?.valueType) ? node.data.valueType : 'float';
            return [port('in', 'Vertex Value', type, type === 'float' ? 0 : Array(type === 'vec2' ? 2 : type === 'vec4' ? 4 : 3).fill(0), { stage: 'vertex' })];
        }
        if (node.type === 'subgraph_output') {
            const type = normalizeSubgraphPortType(node.data?.valueType);
            return [port('in', node.data?.name || 'Output', type, deepClone(node.data?.defaultValue ?? defaultSubgraphValue(type)))];
        }
        if (node.type === 'subgraph_instance') return normalizeSubgraphInterfaceList(node.data?.inputs, 'Input').map(entry => port(`in:${entry.id}`, entry.name, entry.type, deepClone(entry.defaultValue)));
        if (node.type !== 'preset_output') return definition.inputs;
        const base = materialRegistry?.[node.data?.baseMaterialId];
        return (node.data?.uniformPorts || []).map(entry => {
            const uniform = base?.uniforms?.[entry.name];
            return port(
                `uniform:${entry.name}`,
                entry.label || entry.name,
                entry.type || uniform?.type || 'float',
                entry.default !== undefined ? entry.default : serializeUniformValue(uniform?.value)
            );
        });
    }

    function getNodeOutputPorts(node) {
        const definition = getNodeDefinition(node?.type);
        if (!definition) return [];
        if (node.type === 'geometry_attribute') {
            const type = ['float', 'vec2', 'vec3', 'vec4'].includes(node.data?.attributeType) ? node.data.attributeType : 'float';
            return [port('value', 'Value', type, type === 'float' ? 0 : Array(type === 'vec2' ? 2 : type === 'vec4' ? 4 : 3).fill(0), { stage: 'vertex' })];
        }
        if (node.type === 'varying') {
            const type = ['float', 'vec2', 'vec3', 'vec4', 'color'].includes(node.data?.valueType) ? node.data.valueType : 'float';
            return [port('out', 'Fragment Value', type, type === 'float' ? 0 : Array(type === 'vec2' ? 2 : type === 'vec4' ? 4 : 3).fill(0), { stage: 'fragment' })];
        }
        if (node.type === 'uniform_reference') {
            const type = ['bool', 'int', 'float', 'vec2', 'vec3', 'vec4', 'color'].includes(node.data?.uniformType) ? node.data.uniformType : 'float';
            return [port('value', 'Value', type, type === 'bool' ? false : (type === 'int' || type === 'float') ? 0 : Array(type === 'vec2' ? 2 : type === 'vec4' ? 4 : 3).fill(0))];
        }
        if (node.type === 'subgraph_input') {
            const type = normalizeSubgraphPortType(node.data?.valueType);
            return [port('out', node.data?.name || 'Input', type, deepClone(node.data?.defaultValue ?? defaultSubgraphValue(type)))];
        }
        if (node.type === 'subgraph_instance') return normalizeSubgraphInterfaceList(node.data?.outputs, 'Output').map(entry => port(`out:${entry.id}`, entry.name, entry.type, deepClone(entry.defaultValue)));
        return definition.outputs || [];
    }

    function normalizeNodeData(type, data = {}) {
        const defaults = getNodeDefinition(type)?.defaults || {};
        const normalized = Object.assign({}, deepClone(defaults), deepClone(data || {}));
        if (typeof normalized.name === 'string') normalized.name = normalized.name.slice(0, 96);
        if (type === 'color_parameter') {
            const rgb = typeof data?.hex === 'string'
                ? colorHexToArray(data.hex)
                : (Array.isArray(data?.value)
                    ? [0, 1, 2].map(index => clampNumber(data.value[index], 0, 1, 1))
                    : colorHexToArray(normalized.hex || '#ffffff'));
            normalized.value = rgb;
            normalized.hex = colorArrayToHex(rgb);
        }
        if (type === 'vector2_parameter' || type === 'vector3_parameter' || type === 'vector4_parameter') {
            const length = type === 'vector2_parameter' ? 2 : type === 'vector4_parameter' ? 4 : 3;
            const source = serializeUniformValue(normalized.value);
            normalized.value = Array.from({ length }, (_, index) => clampNumber(source?.[index], -1000000, 1000000, index === 3 ? 1 : 0));
        }
        if (type === 'float_parameter') normalized.value = clampNumber(normalized.value, -1000000, 1000000, 0);
        if (type === 'bool_parameter') normalized.value = !!normalized.value;
        if (type === 'custom_expression') {
            normalized.expression = String(normalized.expression || 'A').slice(0, 16384);
            if (!['float', 'vec2', 'vec3', 'vec4', 'color'].includes(normalized.outputType)) normalized.outputType = 'float';
        }
        if (type === 'global_expression') {
            normalized.scope = ['both', 'vertex', 'fragment'].includes(normalized.scope) ? normalized.scope : 'both';
            normalized.code = String(normalized.code || '').slice(0, 65536);
        }
        if (type === 'geometry_attribute') {
            normalized.attributeName = safeIdentifier(normalized.attributeName || 'customAttribute', 'customAttribute');
            if (!['float', 'vec2', 'vec3', 'vec4'].includes(normalized.attributeType)) normalized.attributeType = 'float';
        }
        if (type === 'varying') {
            normalized.name = safeIdentifier(normalized.name || 'Varying', 'Varying');
            if (!['float', 'vec2', 'vec3', 'vec4', 'color'].includes(normalized.valueType)) normalized.valueType = 'float';
        }
        if (type === 'uniform_reference') {
            normalized.name = safeIdentifier(normalized.name || 'uCustom', 'uCustom');
            if (!['bool', 'int', 'float', 'vec2', 'vec3', 'vec4', 'color'].includes(normalized.uniformType)) normalized.uniformType = 'float';
            normalized.expose = !!normalized.expose;
            if (normalized.uniformType === 'bool') normalized.value = normalized.value === true || normalized.value === 'true' || normalized.value === 1 || normalized.value === '1';
            else if (['vec2', 'vec3', 'vec4', 'color'].includes(normalized.uniformType)) {
                const length = normalized.uniformType === 'vec2' ? 2 : normalized.uniformType === 'vec4' ? 4 : 3;
                const source = Array.isArray(normalized.value)
                    ? normalized.value
                    : String(normalized.value ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
                normalized.value = Array.from({ length }, (_, index) => clampNumber(source?.[index], -1000000, 1000000, index === 3 ? 1 : 0));
            } else if (normalized.uniformType === 'int') normalized.value = Math.trunc(clampNumber(normalized.value, -1000000, 1000000, 0));
            else normalized.value = clampNumber(normalized.value, -1000000, 1000000, 0);
        }
        if (type === 'uv_channel') {
            normalized.channel = ['0', '1', '2', '3'].includes(String(normalized.channel)) ? String(normalized.channel) : '0';
        }
        if (type === 'scene_depth') normalized.mode = ['raw', 'linear01', 'eye'].includes(normalized.mode) ? normalized.mode : 'raw';
        if (type === 'autotile_uv') normalized.mode = ['force', 'geometry', 'manual'].includes(normalized.mode) ? normalized.mode : 'force';
        if (type === 'subgraph_input' || type === 'subgraph_output') {
            normalized.portId = safeIdentifier(normalized.portId || makeId('port'), 'port');
            normalized.name = String(normalized.name || (type === 'subgraph_input' ? 'Input' : 'Output')).slice(0, 96);
            normalized.valueType = normalizeSubgraphPortType(normalized.valueType);
            normalized.defaultValue = deepClone(normalized.defaultValue !== undefined ? normalized.defaultValue : defaultSubgraphValue(normalized.valueType));
        }
        if (type === 'subgraph_instance') {
            normalized.targetGraphId = String(normalized.targetGraphId || '').slice(0, 160);
            normalized.targetGraphName = String(normalized.targetGraphName || 'Sub Graph').slice(0, 96);
            normalized.inputs = normalizeSubgraphInterfaceList(normalized.inputs, 'Input');
            normalized.outputs = normalizeSubgraphInterfaceList(normalized.outputs, 'Output');
        }
        if (type === 'vertex_output') {
            normalized.positionMode = normalized.positionMode === 'offset' ? 'offset' : 'absolute';
        }
        if (type === 'surface_output') {
            if (!['pbr', 'lightflow', 'toon', 'unlit'].includes(normalized.lightingModel)) normalized.lightingModel = 'pbr';
            normalized.doubleSided = !!normalized.doubleSided;
            normalized.depthWrite = normalized.depthWrite !== false;
        }
        if (type === 'preset_output') {
            normalized.baseMaterialId = safeIdentifier(normalized.baseMaterialId || 'lightflow', 'lightflow');
            normalized.doubleSided = !!normalized.doubleSided;
            normalized.depthWrite = normalized.depthWrite !== false;
            const usedUniformNames = new Set();
            normalized.uniformPorts = (Array.isArray(normalized.uniformPorts) ? normalized.uniformPorts : []).slice(0, 256).map(entry => {
                const uniformType = ['bool', 'float', 'vec2', 'vec3', 'vec4', 'color'].includes(entry?.type) ? entry.type : 'float';
                return {
                    name: safeIdentifier(entry?.name || 'uniform', 'uniform'),
                    label: String(entry?.label || entry?.name || 'Uniform').slice(0, 96),
                    type: uniformType,
                    default: deepClone(entry?.default)
                };
            }).filter(entry => {
                if (usedUniformNames.has(entry.name)) return false;
                usedUniformNames.add(entry.name);
                return true;
            });
        }
        return normalized;
    }

    function createNode(type, x = 0, y = 0, data = {}) {
        const definition = getNodeDefinition(type);
        if (!definition) throw new Error(`Unknown node type: ${type}`);
        return {
            id: makeId('node'),
            type,
            title: '',
            x: Math.round(Number(x) || 0),
            y: Math.round(Number(y) || 0),
            data: normalizeNodeData(type, data),
            inputValues: {},
            width: getNodeDefinition(type)?.width || 210
        };
    }

    function createEdge(fromNode, fromPort, toNode, toPort) {
        return {
            id: makeId('edge'),
            from: { node: fromNode, port: fromPort },
            to: { node: toNode, port: toPort }
        };
    }

    function createGraph(name = 'Shader Graph', options = {}) {
        const id = makeId('graph');
        const graph = {
            format: GRAPH_FORMAT,
            formatVersion: GRAPH_FORMAT_VERSION,
            id,
            name: String(name || 'Shader Graph').slice(0, 96),
            nodes: [],
            edges: [],
            settings: {
                materialId: `${GENERATED_MATERIAL_PREFIX}${safeIdentifier(id, 'graph')}`,
                livePreview: options.livePreview !== false,
                alphaMode: options.alphaMode || 'cutout',
                graphKind: options.graphKind === 'subgraph' ? 'subgraph' : 'material',
                snapToGrid: options.snapToGrid !== false,
                gridSize: clampNumber(options.gridSize, 8, 64, 20)
            },
            groups: [],
            viewport: { x: 80, y: 80, zoom: 1 },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            revision: 0
        };
        if (options.withOutput !== false) {
            graph.nodes.push(createNode('vertex_output', 560, 80, options.vertexOutput || {}));
            graph.nodes.push(createNode('surface_output', 560, 360, options.output || {}));
        }
        return graph;
    }

    function sanitizeGraph(raw) {
        if (!raw || typeof raw !== 'object') throw new Error('Shader graph data must be an object.');
        if (Number(raw.formatVersion || 0) > GRAPH_FORMAT_VERSION) throw new Error(tr('unsupported_graph_version'));
        const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
        const edges = Array.isArray(raw.edges) ? raw.edges : [];
        if (nodes.length > MAX_GRAPH_NODES || edges.length > MAX_GRAPH_EDGES) {
            throw new Error(tr('graph_too_large'));
        }
        const graph = createGraph(raw.name || 'Imported Shader Graph', { withOutput: false });
        graph.id = typeof raw.id === 'string' && raw.id ? raw.id : makeId('graph');
        const rawSettings = raw.settings || {};
        graph.settings = {
            materialId: safeIdentifier(rawSettings.materialId || graph.settings.materialId, graph.settings.materialId),
            livePreview: rawSettings.livePreview !== false,
            alphaMode: ['opaque', 'cutout', 'blend', 'additive'].includes(rawSettings.alphaMode) ? rawSettings.alphaMode : 'cutout',
            graphKind: rawSettings.graphKind === 'subgraph' ? 'subgraph' : 'material',
            snapToGrid: rawSettings.snapToGrid !== false,
            gridSize: clampNumber(rawSettings.gridSize, 8, 64, 20)
        };
        graph.viewport = {
            x: clampNumber(raw.viewport?.x, -100000, 100000, 80),
            y: clampNumber(raw.viewport?.y, -100000, 100000, 80),
            zoom: clampNumber(raw.viewport?.zoom, 0.2, 2.5, 1)
        };
        const usedNodeIds = new Set();
        graph.nodes = nodes.map(rawNode => {
            const type = String(rawNode?.type || '');
            if (!getNodeDefinition(type)) throw new Error(`Unknown node type: ${type}`);
            let id = typeof rawNode.id === 'string' && rawNode.id ? rawNode.id : makeId('node');
            if (usedNodeIds.has(id)) id = makeId('node');
            usedNodeIds.add(id);
            return {
                id,
                type,
                title: String(rawNode.title || '').slice(0, 96),
                x: clampNumber(rawNode.x, -100000, 100000, 0),
                y: clampNumber(rawNode.y, -100000, 100000, 0),
                data: normalizeNodeData(type, rawNode.data),
                inputValues: deepClone(rawNode.inputValues || {}),
                width: clampNumber(rawNode.width, 140, 520, getNodeDefinition(type)?.width || 210)
            };
        });
        const usedGroupIds = new Set();
        graph.groups = (Array.isArray(raw.groups) ? raw.groups : []).slice(0, 256).map(rawGroup => {
            let id = typeof rawGroup?.id === 'string' && rawGroup.id ? rawGroup.id : makeId('group');
            if (usedGroupIds.has(id)) id = makeId('group');
            usedGroupIds.add(id);
            return { id, title: String(rawGroup?.title || 'Group').slice(0, 96), nodeIds: [...new Set((Array.isArray(rawGroup?.nodeIds) ? rawGroup.nodeIds : []).filter(nodeId => usedNodeIds.has(nodeId)))] };
        }).filter(group => group.nodeIds.length);
        const usedEdgeIds = new Set();
        graph.edges = edges.filter(rawEdge => {
            return usedNodeIds.has(rawEdge?.from?.node) && usedNodeIds.has(rawEdge?.to?.node);
        }).map(rawEdge => {
            let id = typeof rawEdge.id === 'string' && rawEdge.id ? rawEdge.id : makeId('edge');
            if (usedEdgeIds.has(id)) id = makeId('edge');
            usedEdgeIds.add(id);
            return {
                id,
                from: { node: rawEdge.from.node, port: String(rawEdge.from.port || '') },
                to: { node: rawEdge.to.node, port: String(rawEdge.to.port || '') }
            };
        });
        graph.createdAt = Number(raw.createdAt) || Date.now();
        graph.updatedAt = Number(raw.updatedAt) || Date.now();
        graph.revision = Math.max(0, Math.round(Number(raw.revision) || 0));
        graph.format = GRAPH_FORMAT;
        graph.formatVersion = GRAPH_FORMAT_VERSION;
        return graph;
    }

    function serializeGraph(graph) {
        const serialized = JSON.stringify({
            format: GRAPH_FORMAT,
            formatVersion: GRAPH_FORMAT_VERSION,
            graph: sanitizeGraph(graph)
        }, null, 2);
        if (serialized.length > MAX_GRAPH_BYTES) throw new Error(tr('graph_too_large'));
        return serialized;
    }

    function parseGraphFile(content) {
        if (typeof content !== 'string' || !content.trim()) throw new Error('Shader graph file is empty.');
        if (content.length > MAX_GRAPH_BYTES) throw new Error(tr('graph_too_large'));
        const parsed = JSON.parse(content);
        if (parsed?.format && parsed.format !== GRAPH_FORMAT) throw new Error(tr('invalid_graph_format'));
        if (Number(parsed?.formatVersion || 0) > GRAPH_FORMAT_VERSION) throw new Error(tr('unsupported_graph_version'));
        const graphData = parsed?.format === GRAPH_FORMAT ? (parsed.graph || parsed) : parsed?.graph || parsed;
        return sanitizeGraph(graphData);
    }

    function colorHexToArray(hex) {
        const value = String(hex || '#ffffff').trim().replace(/^#/, '');
        const expanded = value.length === 3 ? value.split('').map(char => char + char).join('') : value;
        if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return [1, 1, 1];
        return [0, 2, 4].map(index => parseInt(expanded.slice(index, index + 2), 16) / 255);
    }

    function colorArrayToHex(value) {
        const array = Array.isArray(value) ? value : [1, 1, 1];
        return '#' + [0, 1, 2].map(index => {
            return Math.round(clampNumber(array[index], 0, 1, 1) * 255).toString(16).padStart(2, '0');
        }).join('');
    }

    function serializeUniformValue(value) {
        if (value === null || value === undefined) return value;
        if (Array.isArray(value)) return value.map(serializeUniformValue);
        if (typeof value === 'object') {
            if (Number.isFinite(value.x)) {
                return ['x', 'y', 'z', 'w'].filter(key => Number.isFinite(value[key])).map(key => value[key]);
            }
            if (value.isColor && Number.isFinite(value.r)) return [value.r, value.g, value.b];
        }
        return value;
    }

    function glslFloat(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return '0.0';
        if (Number.isInteger(number)) return `${number}.0`;
        const fixed = Number(number.toFixed(8));
        return String(fixed).includes('.') ? String(fixed) : `${fixed}.0`;
    }

    function literalForType(value, type) {
        if (type === 'bool') return value ? 'true' : 'false';
        if (type === 'int') {
            const number = Number(Array.isArray(value) ? value[0] : value);
            return String(Number.isFinite(number) ? Math.trunc(number) : 0);
        }
        if (type === 'float' || type === 'any') return glslFloat(Array.isArray(value) ? value[0] : value);
        if (type === 'texture') return 'map';
        const size = type === 'vec2' ? 2 : type === 'vec4' ? 4 : 3;
        const array = Array.isArray(value) ? value : [value];
        const parts = Array.from({ length: size }, (_, index) => glslFloat(array[index] ?? (index === 3 ? 1 : array[0] ?? 0)));
        return `vec${size}(${parts.join(', ')})`;
    }

    function rankToType(rank, preferColor = false) {
        if (rank >= 4) return 'vec4';
        if (rank === 3) return preferColor ? 'color' : 'vec3';
        if (rank === 2) return 'vec2';
        return 'float';
    }

    function unifyTypes(types) {
        const concrete = types.filter(type => type && type !== 'any' && type !== 'texture' && type !== 'bool');
        if (!concrete.length) return types.includes('bool') ? 'bool' : 'float';
        const rank = Math.max(...concrete.map(type => TYPE_META[type]?.rank || 1));
        return rankToType(rank, concrete.includes('color'));
    }

    function canConnectTypes(fromType, toType) {
        if (!fromType || !toType || fromType === 'any' || toType === 'any') return true;
        if (fromType === toType) return true;
        if ((fromType === 'int' && toType === 'float') || (fromType === 'float' && toType === 'int')) return true;
        if ((fromType === 'color' && toType === 'vec3') || (fromType === 'vec3' && toType === 'color')) return true;
        if (fromType === 'float' && ['vec2', 'vec3', 'vec4', 'color'].includes(toType)) return true;
        if (fromType === 'vec4' && ['vec3', 'color', 'vec2', 'float'].includes(toType)) return true;
        if ((fromType === 'vec3' || fromType === 'color') && ['vec4', 'vec2', 'float'].includes(toType)) return true;
        if (fromType === 'vec2' && ['vec4', 'vec3', 'color', 'float'].includes(toType)) return true;
        return false;
    }

    function castExpression(result, targetType) {
        if (!targetType || targetType === 'any' || result.type === targetType) return result;
        if (result.type === 'color' && targetType === 'vec3') return Object.assign({}, result, { type: 'vec3' });
        if (result.type === 'vec3' && targetType === 'color') return Object.assign({}, result, { type: 'color' });
        if (result.type === 'int' && targetType === 'float') return { expr: `float(${result.expr})`, type: 'float' };
        if (result.type === 'float' && targetType === 'int') return { expr: `int(${result.expr})`, type: 'int' };
        if (result.type === 'float' && ['vec2', 'vec3', 'vec4', 'color'].includes(targetType)) {
            const size = targetType === 'vec2' ? 2 : targetType === 'vec4' ? 4 : 3;
            return { expr: `vec${size}(${result.expr})`, type: targetType };
        }
        if (result.type === 'vec4') {
            if (targetType === 'vec3' || targetType === 'color') return { expr: `(${result.expr}).rgb`, type: targetType };
            if (targetType === 'vec2') return { expr: `(${result.expr}).xy`, type: 'vec2' };
            if (targetType === 'float') return { expr: `(${result.expr}).x`, type: 'float' };
        }
        if (result.type === 'vec3' || result.type === 'color') {
            if (targetType === 'vec2') return { expr: `(${result.expr}).xy`, type: 'vec2' };
            if (targetType === 'float') return { expr: `(${result.expr}).x`, type: 'float' };
            if (targetType === 'vec4') return { expr: `vec4(${result.expr}, 1.0)`, type: 'vec4' };
        }
        if (result.type === 'vec2') {
            if (targetType === 'float') return { expr: `(${result.expr}).x`, type: 'float' };
            if (targetType === 'vec3' || targetType === 'color') return { expr: `vec3(${result.expr}, 0.0)`, type: targetType };
            if (targetType === 'vec4') return { expr: `vec4(${result.expr}, 0.0, 1.0)`, type: 'vec4' };
        }
        if (result.type === 'bool' && ['float', 'vec2', 'vec3', 'vec4', 'color'].includes(targetType)) {
            const scalar = `((${result.expr}) ? 1.0 : 0.0)`;
            if (targetType === 'float') return { expr: scalar, type: 'float' };
            const size = targetType === 'vec2' ? 2 : targetType === 'vec4' ? 4 : 3;
            return { expr: `vec${size}(${scalar})`, type: targetType };
        }
        return result;
    }

    function graphRegistryMap(graphs) {
        if (graphs instanceof Map) return graphs;
        if (Array.isArray(graphs)) return new Map(graphs.filter(Boolean).map(graph => [graph.id, graph]));
        if (graphs && typeof graphs === 'object') return new Map(Object.values(graphs).filter(Boolean).map(graph => [graph.id, graph]));
        return new Map();
    }

    function getSubgraphInterface(graph) {
        if (!graph) return { inputs: [], outputs: [] };
        const mapEntry = (node, fallback) => {
            const type = normalizeSubgraphPortType(node.data?.valueType);
            return {
                id: safeIdentifier(node.data?.portId || node.id, fallback),
                name: String(node.data?.name || fallback).slice(0, 96),
                type,
                defaultValue: deepClone(node.data?.defaultValue !== undefined ? node.data.defaultValue : defaultSubgraphValue(type)),
                nodeId: node.id
            };
        };
        return {
            inputs: graph.nodes.filter(node => node.type === 'subgraph_input').map(node => mapEntry(node, 'Input')),
            outputs: graph.nodes.filter(node => node.type === 'subgraph_output').map(node => mapEntry(node, 'Output'))
        };
    }

    function createSubgraphConstantNode(type, value, id, x = 0, y = 0) {
        let nodeType = 'float_parameter';
        if (type === 'bool') nodeType = 'bool_parameter';
        else if (type === 'vec2') nodeType = 'vector2_parameter';
        else if (type === 'vec3') nodeType = 'vector3_parameter';
        else if (type === 'vec4') nodeType = 'vector4_parameter';
        else if (type === 'color') nodeType = 'color_parameter';
        else if (type === 'texture') nodeType = 'texture_parameter';
        const data = { name: 'SubGraph Default', expose: false, value: deepClone(value !== undefined ? value : defaultSubgraphValue(type)) };
        if (nodeType === 'color_parameter') {
            data.value = Array.isArray(value) ? value.slice(0, 3) : [0, 0, 0];
            data.hex = colorArrayToHex(data.value);
        }
        const node = createNode(nodeType, x, y, data);
        node.id = id;
        return node;
    }

    function expandSubgraphs(graph, graphs, stack = []) {
        const registry = graphRegistryMap(graphs);
        const expanded = deepClone(graph);
        if (!expanded?.nodes?.some(node => node.type === 'subgraph_instance')) return expanded;
        const currentStack = stack.concat(graph.id || 'graph');
        let guard = 0;
        while (expanded.nodes.some(node => node.type === 'subgraph_instance')) {
            if (++guard > 256) throw new Error('Sub Graph expansion exceeded the safe nesting limit.');
            const instance = expanded.nodes.find(node => node.type === 'subgraph_instance');
            const targetId = instance.data?.targetGraphId;
            const target = registry.get(targetId);
            if (!target || target.settings?.graphKind !== 'subgraph') throw new Error(`Sub Graph "${instance.data?.targetGraphName || targetId || 'Unknown'}" is unavailable.`);
            if (currentStack.includes(target.id)) throw new Error(`Recursive Sub Graph dependency detected: ${currentStack.concat(target.id).join(' → ')}`);
            const targetExpanded = expandSubgraphs(target, registry, currentStack);
            const iface = getSubgraphInterface(targetExpanded);
            const inputByNode = new Map(iface.inputs.map(entry => [entry.nodeId, entry]));
            const outputByNode = new Map(iface.outputs.map(entry => [entry.nodeId, entry]));
            const internalNodes = targetExpanded.nodes.filter(node => !inputByNode.has(node.id) && !outputByNode.has(node.id));
            const idMap = new Map(internalNodes.map(node => [node.id, `${instance.id}__${node.id}`]));
            const parentIncoming = new Map(expanded.edges.filter(edge => edge.to.node === instance.id).map(edge => [String(edge.to.port || '').replace(/^in:/, ''), edge]));
            const parentOutgoing = expanded.edges.filter(edge => edge.from.node === instance.id);
            const additions = [];
            internalNodes.forEach(source => {
                const clone = deepClone(source);
                clone.id = idMap.get(source.id);
                clone.x = instance.x + (Number(source.x) || 0) * 0.05;
                clone.y = instance.y + (Number(source.y) || 0) * 0.05;
                additions.push(clone);
            });
            const constantByInput = new Map();
            const endpointForInput = inputEntry => {
                const parentEdge = parentIncoming.get(inputEntry.id);
                if (parentEdge) return deepClone(parentEdge.from);
                if (!constantByInput.has(inputEntry.id)) {
                    const id = `${instance.id}__default_${safeIdentifier(inputEntry.id, 'input')}`;
                    const node = createSubgraphConstantNode(inputEntry.type, inputEntry.defaultValue, id, instance.x - 80, instance.y);
                    additions.push(node);
                    constantByInput.set(inputEntry.id, { node: id, port: getNodeOutputPorts(node)[0].id });
                }
                return deepClone(constantByInput.get(inputEntry.id));
            };
            const mapEndpoint = endpoint => {
                if (!endpoint) return null;
                const input = inputByNode.get(endpoint.node);
                if (input) return endpointForInput(input);
                if (idMap.has(endpoint.node)) return { node: idMap.get(endpoint.node), port: endpoint.port };
                return null;
            };
            const internalEdges = [];
            targetExpanded.edges.forEach(edge => {
                if (outputByNode.has(edge.to.node)) return;
                const from = mapEndpoint(edge.from);
                const toNode = idMap.get(edge.to.node);
                if (!from || !toNode) return;
                internalEdges.push({ id: `${instance.id}__${edge.id}`, from, to: { node: toNode, port: edge.to.port } });
            });
            const outputSource = new Map();
            iface.outputs.forEach(outputEntry => {
                const edge = targetExpanded.edges.find(candidate => candidate.to.node === outputEntry.nodeId && candidate.to.port === 'in');
                const mapped = edge ? mapEndpoint(edge.from) : null;
                if (mapped) outputSource.set(outputEntry.id, mapped);
                else {
                    const id = `${instance.id}__default_out_${safeIdentifier(outputEntry.id, 'output')}`;
                    const node = createSubgraphConstantNode(outputEntry.type, outputEntry.defaultValue, id, instance.x + 280, instance.y);
                    additions.push(node);
                    outputSource.set(outputEntry.id, { node: id, port: getNodeOutputPorts(node)[0].id });
                }
            });
            const replacementOutgoing = parentOutgoing.map(edge => {
                const outputId = String(edge.from.port || '').replace(/^out:/, '');
                const source = outputSource.get(outputId);
                return source ? { id: edge.id, from: deepClone(source), to: deepClone(edge.to) } : null;
            }).filter(Boolean);
            expanded.nodes = expanded.nodes.filter(node => node.id !== instance.id);
            expanded.nodes.push(...additions);
            expanded.edges = expanded.edges.filter(edge => edge.from.node !== instance.id && edge.to.node !== instance.id);
            expanded.edges.push(...internalEdges, ...replacementOutgoing);
            expanded.groups = (expanded.groups || []).map(group => ({ ...group, nodeIds: group.nodeIds.filter(nodeId => nodeId !== instance.id) })).filter(group => group.nodeIds.length);
        }
        if (expanded.nodes.length > MAX_GRAPH_NODES || expanded.edges.length > MAX_GRAPH_EDGES) throw new Error(tr('graph_too_large'));
        return expanded;
    }

    function nodePortMap(graph, materials) {
        const map = new Map();
        graph.nodes.forEach(node => {
            map.set(node.id, {
                node,
                inputs: new Map(getNodeInputPorts(node, materials).map(entry => [entry.id, entry])),
                outputs: new Map(getNodeOutputPorts(node).map(entry => [entry.id, entry]))
            });
        });
        return map;
    }

    function literalValueType(value) {
        if (typeof value === 'boolean') return 'bool';
        if (Array.isArray(value)) {
            if (value.length >= 4) return 'vec4';
            if (value.length === 3) return 'vec3';
            if (value.length === 2) return 'vec2';
        }
        return 'float';
    }

    function createGraphTypeResolver(graph, materials) {
        const nodes = new Map(graph.nodes.map(node => [node.id, node]));
        const incoming = new Map(graph.edges.map(edge => [`${edge.to.node}:${edge.to.port}`, edge]));
        const cache = new Map();
        const resolving = new Set();
        const resolve = (nodeId, outputPortId) => {
            const key = `${nodeId}:${outputPortId}`;
            if (cache.has(key)) return cache.get(key);
            if (resolving.has(key)) return 'any';
            resolving.add(key);
            const node = nodes.get(nodeId);
            const definition = getNodeDefinition(node?.type);
            const output = getNodeOutputPorts(node).find(entry => entry.id === outputPortId);
            let type = output?.type || 'any';
            const inputType = portId => {
                const input = getNodeInputPorts(node, materials).find(entry => entry.id === portId);
                const edge = incoming.get(`${node.id}:${portId}`);
                if (edge) return resolve(edge.from.node, edge.from.port);
                if (input?.type && input.type !== 'any') return input.type;
                const stored = node.inputValues?.[portId] !== undefined ? node.inputValues[portId] : input?.default;
                return literalValueType(stored);
            };
            if (type === 'any') {
                if (node.type === 'custom_expression') type = node.data.outputType || 'float';
                else if (node.type === 'reroute') type = inputType('in');
                else if (node.type === 'branch') type = unifyTypes([inputType('true'), inputType('false')]);
                else if (node.type === 'remap') type = unifyTypes(['value', 'inMin', 'inMax', 'outMin', 'outMax'].map(inputType));
                else if (definition?.unary || definition?.unaryPrefix) type = definition.forceOutputType || inputType('value');
                else if (definition?.operation || definition?.functionName) {
                    type = definition.forceOutputType || unifyTypes(definition.inputs.map(entry => inputType(entry.id)));
                } else type = 'float';
            }
            resolving.delete(key);
            cache.set(key, type);
            return type;
        };
        return resolve;
    }

    function canConnectResolvedTypes(fromType, targetNode, targetPort) {
        // Exact preset bridges write values directly into the cloned material's uniforms.
        // Keep those sockets strict so a visually accepted connection can never produce a
        // scalar where the preset expects a vector (or the reverse).
        if (targetNode.type === 'preset_output') {
            return fromType === targetPort.type ||
                (fromType === 'color' && targetPort.type === 'vec3') ||
                (fromType === 'vec3' && targetPort.type === 'color');
        }
        if (targetPort.type !== 'any') return canConnectTypes(fromType, targetPort.type);
        if (targetNode.type === 'reroute') return true;
        if (targetNode.type === 'branch' && (targetPort.id === 'true' || targetPort.id === 'false')) return fromType !== 'texture';
        return !['texture', 'bool'].includes(fromType);
    }

    function normalizedPortName(value) {
        return String(value || '').toLowerCase().replace(/^uniform:/, '').replace(/[^a-z0-9]+/g, '');
    }

    function repairPresetParameterConnections(graph) {
        if (!graph) return 0;
        const output = graph.nodes.find(node => node.type === 'preset_output');
        if (!output) return 0;
        const ports = getNodeInputPorts(output, {});
        let repaired = 0;
        ports.forEach(targetPort => {
            const edge = graph.edges.find(entry => entry.to.node === output.id && entry.to.port === targetPort.id);
            if (!edge) return;
            const sourceNode = graph.nodes.find(node => node.id === edge.from.node);
            const sourcePort = sourceNode && getNodeOutputPorts(sourceNode).find(port => port.id === edge.from.port);
            if (sourcePort && canConnectResolvedTypes(sourcePort.type, output, targetPort)) return;

            const targetNames = new Set([
                normalizedPortName(targetPort.id),
                normalizedPortName(targetPort.name)
            ]);
            const candidates = graph.nodes.filter(node => {
                if (!node.type.endsWith('_parameter')) return false;
                const candidatePort = getNodeOutputPorts(node)[0];
                if (!candidatePort || !canConnectResolvedTypes(candidatePort.type, output, targetPort)) return false;
                return targetNames.has(normalizedPortName(node.data?.name)) || targetNames.has(normalizedPortName(getNodeDisplayTitle(node)));
            });
            if (candidates.length !== 1) return;
            edge.from.node = candidates[0].id;
            edge.from.port = getNodeOutputPorts(candidates[0])[0].id;
            repaired += 1;
        });
        if (repaired) {
            graph.revision = Math.max(0, Number(graph.revision) || 0) + 1;
            graph.updatedAt = Date.now();
        }
        return repaired;
    }

    function validateGraph(graph, options = {}) {
        const messages = [];
        const materials = options.materials || {};
        if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
            return [{ severity: 'error', code: 'invalid_graph', message: 'Invalid shader graph structure.' }];
        }
        if (!options._subgraphsExpanded && graph.nodes.some(node => node.type === 'subgraph_instance')) {
            try { return validateGraph(expandSubgraphs(graph, options.graphs || []), Object.assign({}, options, { _subgraphsExpanded: true })); }
            catch (error) { return [{ severity: 'error', code: 'subgraph_expand', message: error.message || 'Sub Graph expansion failed.' }]; }
        }
        if (graph.nodes.length > MAX_GRAPH_NODES || graph.edges.length > MAX_GRAPH_EDGES) {
            messages.push({ severity: 'error', code: 'graph_too_large', message: tr('graph_too_large') });
            return messages;
        }
        const ports = nodePortMap(graph, materials);
        const resolvePortType = createGraphTypeResolver(graph, materials);
        const outputs = graph.nodes.filter(node => node.type === 'surface_output' || node.type === 'preset_output');
        const vertexOutputs = graph.nodes.filter(node => node.type === 'vertex_output');
        const isSubgraph = graph.settings?.graphKind === 'subgraph';
        const subgraphOutputs = graph.nodes.filter(node => node.type === 'subgraph_output');
        if (!isSubgraph && outputs.length === 0) messages.push({ severity: 'error', code: 'missing_output', message: tr('surface_output_missing') });
        if (!isSubgraph && outputs.length > 1) messages.push({ severity: 'error', code: 'multiple_outputs', message: 'Only one Fragment/Surface or Preset Output can be active in a graph.' });
        if (!isSubgraph && vertexOutputs.length > 1) messages.push({ severity: 'error', code: 'multiple_vertex_outputs', message: 'Only one Vertex Output can be active in a graph.' });
        if (isSubgraph && outputs.length) messages.push({ severity: 'error', code: 'subgraph_master_output', message: 'Sub Graphs use Sub Graph Output nodes instead of material outputs.' });
        if (isSubgraph && vertexOutputs.length) messages.push({ severity: 'error', code: 'subgraph_vertex_output', message: 'Sub Graphs cannot contain a Vertex Output master node.' });
        if (isSubgraph && !subgraphOutputs.length) messages.push({ severity: 'warning', code: 'subgraph_no_output', message: 'This Sub Graph has no output interface yet.' });
        const graphMaterialId = materialIdForGraph(graph);
        const registeredMaterial = materials[graphMaterialId];
        const graphOwnsRegisteredMaterial = registeredMaterial && (
            registeredMaterial.vsgGraphId
                ? registeredMaterial.vsgGraphId === graph.id
                : Number(registeredMaterial.uniforms?.uVSGGraphOwner?.value) === graphOwnerToken(graph.id)
        );
        if (!isSubgraph && registeredMaterial && !graphOwnsRegisteredMaterial) {
            messages.push({ severity: 'error', code: 'material_id_conflict', message: tr('material_id_conflict') });
        }
        const inputOwners = new Map();
        graph.edges.forEach(edge => {
            const source = ports.get(edge.from?.node);
            const target = ports.get(edge.to?.node);
            if (!source || !target) {
                messages.push({ severity: 'error', code: 'orphan_edge', edgeId: edge.id, message: 'A connection references a missing node.' });
                return;
            }
            const sourcePort = source.outputs.get(edge.from.port);
            const targetPort = target.inputs.get(edge.to.port);
            if (!sourcePort || !targetPort) {
                messages.push({ severity: 'error', code: 'missing_port', edgeId: edge.id, message: 'A connection references a missing port.' });
                return;
            }
            const inputKey = `${edge.to.node}:${edge.to.port}`;
            if (inputOwners.has(inputKey)) {
                messages.push({ severity: 'error', code: 'multiple_input', edgeId: edge.id, message: 'An input can only have one connection.' });
            } else {
                inputOwners.set(inputKey, edge.id);
            }
            const resolvedSourceType = sourcePort.type === 'any'
                ? resolvePortType(edge.from.node, edge.from.port)
                : sourcePort.type;
            if (!canConnectResolvedTypes(resolvedSourceType, target.node, targetPort)) {
                messages.push({ severity: 'error', code: 'type_mismatch', edgeId: edge.id, message: `${resolvedSourceType} cannot connect to ${targetPort.type}.` });
            }
        });
        if (isSubgraph) {
            const seenInterfaceIds = new Set();
            graph.nodes.filter(node => node.type === 'subgraph_input' || node.type === 'subgraph_output').forEach(node => {
                const id = safeIdentifier(node.data?.portId || node.id, 'port');
                if (seenInterfaceIds.has(id)) messages.push({ severity: 'error', code: 'duplicate_subgraph_port', nodeId: node.id, message: `Duplicate Sub Graph interface ID: ${id}` });
                seenInterfaceIds.add(id);
            });
        }
        const adjacency = new Map(graph.nodes.map(node => [node.id, []]));
        graph.edges.forEach(edge => {
            if (adjacency.has(edge.from?.node) && adjacency.has(edge.to?.node)) adjacency.get(edge.from.node).push(edge.to.node);
        });
        const visiting = new Set();
        const visited = new Set();
        const visit = nodeId => {
            if (visiting.has(nodeId)) return true;
            if (visited.has(nodeId)) return false;
            visiting.add(nodeId);
            const cyclic = (adjacency.get(nodeId) || []).some(visit);
            visiting.delete(nodeId);
            visited.add(nodeId);
            return cyclic;
        };
        if (graph.nodes.some(node => visit(node.id))) {
            messages.push({ severity: 'error', code: 'cycle', message: 'Shader graphs cannot contain cyclic data connections.' });
        }
        const reverseEdges = new Map(graph.nodes.map(node => [node.id, []]));
        graph.edges.forEach(edge => reverseEdges.get(edge.to?.node)?.push(edge));
        const surfaceOutput = outputs.find(node => node.type === 'surface_output');
        const vertexOutput = vertexOutputs[0] || null;
        if (surfaceOutput) {
            const vertexNodes = new Set();
            const fragmentNodes = new Set();
            const walkStage = (nodeId, stage) => {
                const targetSet = stage === 'vertex' ? vertexNodes : fragmentNodes;
                if (targetSet.has(nodeId)) return;
                targetSet.add(nodeId);
                const node = graph.nodes.find(entry => entry.id === nodeId);
                const incomingEdges = reverseEdges.get(nodeId) || [];
                incomingEdges.forEach(edge => {
                    // A Vertex → Fragment bridge deliberately changes stage at its input.
                    const upstreamStage = node?.type === 'varying' && stage === 'fragment' ? 'vertex' : stage;
                    walkStage(edge.from.node, upstreamStage);
                });
            };
            graph.edges
                .filter(edge => edge.to.node === surfaceOutput.id && ['baseColor', 'alpha', 'normal', 'emission', 'metallic', 'roughness', 'occlusion', 'alphaClip'].includes(edge.to.port))
                .forEach(edge => walkStage(edge.from.node, 'fragment'));
            graph.edges
                .filter(edge => edge.to.node === surfaceOutput.id && edge.to.port === 'vertexOffset')
                .forEach(edge => walkStage(edge.from.node, 'vertex'));
            if (vertexOutput) {
                graph.edges
                    .filter(edge => edge.to.node === vertexOutput.id)
                    .forEach(edge => walkStage(edge.from.node, 'vertex'));
            }
            graph.nodes.forEach(node => {
                const stages = getNodeDefinition(node.type)?.stages;
                if (!Array.isArray(stages) || !stages.length) return;
                const invalidInFragment = fragmentNodes.has(node.id) && !stages.includes('fragment');
                const invalidInVertex = vertexNodes.has(node.id) && !stages.includes('vertex');
                if (invalidInFragment || invalidInVertex) {
                    messages.push({ severity: 'error', code: 'stage_mismatch', nodeId: node.id, message: tr('stage_mismatch') });
                }
            });
        }
        outputs.filter(node => node.type === 'preset_output').forEach(node => {
            if (!materials[node.data?.baseMaterialId]) {
                messages.push({ severity: 'error', code: 'missing_preset', nodeId: node.id, message: tr('preset_base_missing') });
            }
            graph.edges.filter(edge => edge.to.node === node.id).forEach(edge => {
                if (evaluateConstantNode(graph, edge.from.node, edge.from.port, materials) == null) {
                    messages.push({ severity: 'error', code: 'preset_dynamic_input', edgeId: edge.id, message: tr('preset_constant_only') });
                }
            });
        });
        const reverse = new Map(graph.nodes.map(node => [node.id, []]));
        graph.edges.forEach(edge => reverse.get(edge.to?.node)?.push(edge.from.node));
        const reachable = new Set();
        const markReachable = nodeId => {
            if (reachable.has(nodeId)) return;
            reachable.add(nodeId);
            (reverse.get(nodeId) || []).forEach(markReachable);
        };
        outputs.forEach(node => markReachable(node.id));
        vertexOutputs.forEach(node => markReachable(node.id));
        if (isSubgraph) subgraphOutputs.forEach(node => markReachable(node.id));
        graph.nodes.filter(node => !reachable.has(node.id) && node.type !== 'global_expression').forEach(node => {
            messages.push({ severity: 'warning', code: 'unused_node', nodeId: node.id, message: `${getNodeDisplayTitle(node)} is not connected to the active output.` });
        });
        return messages;
    }

    function evaluateConstantNode(graph, nodeId, outputPort, materials, stack = new Set()) {
        if (stack.has(nodeId)) return null;
        stack.add(nodeId);
        const node = graph.nodes.find(entry => entry.id === nodeId);
        if (!node) return null;
        const result = (() => {
            if (node.type === 'float_parameter' || node.type === 'bool_parameter') return node.data.value;
            if (node.type === 'color_parameter' || node.type === 'vector2_parameter' || node.type === 'vector3_parameter' || node.type === 'vector4_parameter') return deepClone(node.data.value);
            if (node.type === 'reroute') {
                const edge = graph.edges.find(entry => entry.to.node === node.id && entry.to.port === 'in');
                return edge ? evaluateConstantNode(graph, edge.from.node, edge.from.port, materials, stack) : node.inputValues?.in;
            }
            return null;
        })();
        stack.delete(nodeId);
        return result;
    }

    const VSG_NOISE_GLSL = `
float vsgHash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float vsgNoise21(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(vsgHash21(i), vsgHash21(i + vec2(1.0, 0.0)), f.x), mix(vsgHash21(i + vec2(0.0, 1.0)), vsgHash21(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

    const VSG_NORMAL_GLSL = `
vec3 vsgNormalFromMap(vec3 baseNormal, vec3 worldPosition, vec2 uvValue, vec3 sampleValue, float strength) {
    vec3 q0 = dFdx(worldPosition);
    vec3 q1 = dFdy(worldPosition);
    vec2 st0 = dFdx(uvValue);
    vec2 st1 = dFdy(uvValue);
    vec3 N = normalize(baseNormal);
    vec3 T = normalize(q0 * st1.t - q1 * st0.t);
    vec3 B = normalize(-q0 * st1.s + q1 * st0.s);
    vec3 mapN = normalize(vec3((sampleValue.xy * 2.0 - 1.0) * strength, sampleValue.z * 2.0 - 1.0));
    return normalize(mat3(T, B, N) * mapN);
}`;

    const VSG_TRIPLANAR_GLSL = `
vec4 vsgTriplanarSample(sampler2D tex, vec3 worldPosition, vec3 worldNormal, float tiling, float blendSharpness) {
    vec3 n = abs(normalize(worldNormal));
    vec3 weights = pow(max(n, vec3(0.0001)), vec3(max(blendSharpness, 0.0001)));
    weights /= max(weights.x + weights.y + weights.z, 0.0001);
    float scale = max(abs(tiling), 0.000001);
    vec4 xSample = texture2D(tex, worldPosition.zy * scale);
    vec4 ySample = texture2D(tex, worldPosition.xz * scale);
    vec4 zSample = texture2D(tex, worldPosition.xy * scale);
    return xSample * weights.x + ySample * weights.y + zSample * weights.z;
}`;

    const VSG_AUTOTILE_GLSL = `
bool vsgAutotileBasis(vec2 localUv, vec2 atlasUv, out mat2 localToAtlas) {
    vec2 localDx = dFdx(localUv);
    vec2 localDy = dFdy(localUv);
    vec2 atlasDx = dFdx(atlasUv);
    vec2 atlasDy = dFdy(atlasUv);
    float scale = max(max(abs(localDx.x), abs(localDx.y)), max(abs(localDy.x), abs(localDy.y)));
    if (scale <= 1e-12) { localToAtlas = mat2(0.0); return false; }
    vec2 ldx = localDx / scale;
    vec2 ldy = localDy / scale;
    float determinant = ldx.x * ldy.y - ldx.y * ldy.x;
    float quality = abs(determinant) / max(length(ldx) * length(ldy), 1e-12);
    if (abs(determinant) <= 1e-12 || quality <= 1e-5) { localToAtlas = mat2(0.0); return false; }
    vec2 adx = atlasDx / scale;
    vec2 ady = atlasDy / scale;
    float invDet = 1.0 / determinant;
    vec2 atlasPerLocalX = (adx * ldy.y - ady * ldx.y) * invDet;
    vec2 atlasPerLocalY = (ady * ldx.x - adx * ldy.x) * invDet;
    localToAtlas = mat2(atlasPerLocalX, atlasPerLocalY);
    return true;
}
vec2 vsgResolveAutotileUv(vec2 atlasUv, vec2 localUv, vec2 faceSize, vec2 uvSize, float geometryAutoTile, vec2 manualTiling, float mode) {
    vec2 repeatCount = manualTiling;
    if (mode > 1.5 || (mode > 0.5 && geometryAutoTile > 0.5)) {
        vec2 safeFace = max(abs(faceSize), vec2(0.000001));
        vec2 tileSize = max(abs(uvSize * faceSize), vec2(0.000001));
        repeatCount = safeFace / tileSize;
    }
    vec2 tiled = localUv;
    if (abs(repeatCount.x - 1.0) > 0.000001) tiled.x = fract(localUv.x * repeatCount.x);
    if (abs(repeatCount.y - 1.0) > 0.000001) tiled.y = fract(localUv.y * repeatCount.y);
    mat2 localToAtlas;
    if (!vsgAutotileBasis(localUv, atlasUv, localToAtlas)) return atlasUv;
    return atlasUv + localToAtlas * (tiled - localUv);
}`;

    const VSG_RELIEF_GLSL = `
vec2 vsgReliefUv(sampler2D heightTexture, vec2 baseUv, vec3 worldPosition, vec3 worldNormal, vec3 viewDirection, float heightScale, float requestedSteps) {
    vec2 dx = dFdx(baseUv);
    vec2 dy = dFdy(baseUv);
    vec3 q0 = dFdx(worldPosition);
    vec3 q1 = dFdy(worldPosition);
    vec3 N = normalize(worldNormal);
    vec3 T = normalize(q0 * dy.y - q1 * dx.y);
    vec3 B = normalize(-q0 * dy.x + q1 * dx.x);
    vec3 V = normalize(vec3(dot(viewDirection, T), dot(viewDirection, B), dot(viewDirection, N)));
    float layers = clamp(requestedSteps, 4.0, 24.0);
    float layerDepth = 1.0 / layers;
    vec2 delta = (V.xy / max(abs(V.z), 0.08)) * max(heightScale, 0.0) / layers;
    vec2 uv = baseUv;
    float currentLayer = 0.0;
    float sampled = 1.0 - texture2D(heightTexture, uv).r;
    for (int i = 0; i < 24; i++) {
        if (float(i) >= layers || currentLayer >= sampled) break;
        uv -= delta;
        currentLayer += layerDepth;
        sampled = 1.0 - texture2D(heightTexture, uv).r;
    }
    return uv;
}`;

    const VSG_BUMP_GLSL = `
vec3 vsgBumpFromHeight(vec3 worldPosition, vec3 normalValue, float heightValue, float strength, float distanceValue) {
    vec3 sigmaX = dFdx(worldPosition);
    vec3 sigmaY = dFdy(worldPosition);
    vec3 N = normalize(normalValue);
    vec3 r1 = cross(sigmaY, N);
    vec3 r2 = cross(N, sigmaX);
    float determinant = dot(sigmaX, r1);
    vec3 gradient = sign(determinant) * (dFdx(heightValue) * r1 + dFdy(heightValue) * r2);
    return normalize(abs(determinant) * N - gradient * max(strength, 0.0) * distanceValue);
}`;

    function compileExpressionGraph(graph, outputNode, options = {}) {
        const materials = options.materials || {};
        const nodeMap = new Map(graph.nodes.map(node => [node.id, node]));
        const incoming = new Map();
        graph.edges.forEach(edge => incoming.set(`${edge.to.node}:${edge.to.port}`, edge));
        const uniforms = {};
        const functions = { vertex: new Set(), fragment: new Set() };
        const caches = { vertex: new Map(), fragment: new Map() };
        const compiling = new Set();
        const attributes = new Map();
        const varyings = new Map();

        const glslValueType = type => type === 'color' ? 'vec3' : type;
        const defaultValueForType = type => {
            if (type === 'bool') return false;
            if (type === 'int' || type === 'float') return 0;
            if (type === 'vec2') return [0, 0];
            if (type === 'vec4') return [0, 0, 0, 0];
            return [0, 0, 0];
        };
        const parseLooseValue = (value, type) => {
            if (type === 'bool') {
                if (typeof value === 'string') return !['false', '0', 'off', 'no', ''].includes(value.trim().toLowerCase());
                return !!value;
            }
            if (type === 'int') {
                const number = Number(Array.isArray(value) ? value[0] : value);
                return Number.isFinite(number) ? Math.trunc(number) : 0;
            }
            if (type === 'float') {
                const number = Number(Array.isArray(value) ? value[0] : value);
                return Number.isFinite(number) ? number : 0;
            }
            const size = type === 'vec2' ? 2 : type === 'vec4' ? 4 : 3;
            const source = Array.isArray(value)
                ? value
                : String(value ?? '').split(/[\s,;]+/).filter(Boolean).map(Number);
            return Array.from({ length: size }, (_, index) => {
                const number = Number(source[index] ?? (index === 3 ? 1 : 0));
                return Number.isFinite(number) ? number : (index === 3 ? 1 : 0);
            });
        };
        const registerAttribute = (name, type, options = {}) => {
            const attributeName = safeIdentifier(name, 'attribute');
            const attributeType = glslValueType(type);
            const builtIn = ['position', 'normal', 'uv'].includes(attributeName);
            const existing = attributes.get(attributeName);
            if (existing && existing.type !== attributeType) {
                throw new Error(`Geometry attribute "${attributeName}" is requested with both ${existing.type} and ${attributeType}.`);
            }
            if (!existing) {
                attributes.set(attributeName, {
                    name: attributeName,
                    type: attributeType,
                    builtIn,
                    guardedDefine: options.guardedDefine || ''
                });
            }
            return attributeName;
        };
        const registerAutoVarying = (key, type, expression) => {
            const bridgeKey = `auto:${key}`;
            let bridge = varyings.get(bridgeKey);
            if (!bridge) {
                bridge = { name: `vVSGAuto_${safeIdentifier(key, 'Value')}`, type, glslType: glslValueType(type), expression };
                varyings.set(bridgeKey, bridge);
            }
            return { expr: bridge.name, type };
        };
        const geometryAttributeValue = (name, type, stage) => {
            const attributeName = registerAttribute(name, type);
            if (stage === 'vertex') return { expr: attributeName, type };
            return registerAutoVarying(attributeName, type, attributeName);
        };
        const registerExactUniform = (name, definition, owner) => {
            const uniformName = safeIdentifier(name, 'uValue');
            const existing = uniforms[uniformName];
            const requestedType = definition.type === 'color' ? 'vec3' : definition.type;
            if (existing) {
                const existingType = existing.type === 'color' ? 'vec3' : existing.type;
                if (existingType !== requestedType) {
                    throw new Error(`Uniform "${uniformName}" is requested with both ${existingType} and ${requestedType}.`);
                }
                return uniformName;
            }
            uniforms[uniformName] = Object.assign({}, definition, { _owner: owner });
            delete uniforms[uniformName]._owner;
            return uniformName;
        };

        const addUniform = (name, definition) => {
            let candidate = safeIdentifier(name, 'uValue');
            if (!candidate.startsWith('u')) candidate = `uVSG_${candidate}`;
            let unique = candidate;
            let index = 2;
            while (uniforms[unique] && uniforms[unique]._owner !== definition._owner) unique = `${candidate}_${index++}`;
            uniforms[unique] = Object.assign({}, definition);
            delete uniforms[unique]._owner;
            return unique;
        };

        const inputPortDefinition = (node, portId) => getNodeInputPorts(node, materials).find(entry => entry.id === portId);

        const readInput = (node, portId, stage, forcedType) => {
            const definition = inputPortDefinition(node, portId) || { id: portId, type: forcedType || 'float', default: 0 };
            const edge = incoming.get(`${node.id}:${portId}`);
            if (edge) return castExpression(compileOutput(edge.from.node, edge.from.port, stage), forcedType || definition.type);
            const stored = node.inputValues && node.inputValues[portId] !== undefined ? node.inputValues[portId] : definition.default;
            const requestedType = forcedType || definition.type;
            const resolvedType = requestedType === 'any' ? literalValueType(stored) : requestedType;
            if (resolvedType === 'texture') {
                uniforms.map = uniforms.map || { type: 'sampler2D', value: null, expose: true, repeat: true };
            }
            return { expr: literalForType(stored, resolvedType), type: resolvedType };
        };

        const compileOutput = (nodeId, outputPortId, stage) => {
            const cacheKey = `${nodeId}:${outputPortId}`;
            const cache = caches[stage];
            if (cache.has(cacheKey)) return cache.get(cacheKey);
            if (compiling.has(`${stage}:${cacheKey}`)) throw new Error('Cyclic shader expression detected.');
            compiling.add(`${stage}:${cacheKey}`);
            const node = nodeMap.get(nodeId);
            const definition = getNodeDefinition(node?.type);
            if (!node || !definition) throw new Error(`Unknown node in expression: ${nodeId}`);
            if (Array.isArray(definition.stages) && definition.stages.length && !definition.stages.includes(stage)) {
                throw new Error(`${getNodeDisplayTitle(node)} cannot be evaluated in the ${stage} stage.`);
            }
            let result;

            if (node.type === 'float_parameter' || node.type === 'bool_parameter' || node.type === 'color_parameter' || node.type === 'vector2_parameter' || node.type === 'vector3_parameter' || node.type === 'vector4_parameter') {
                const type = getNodeOutputPorts(node)[0].type;
                const suffix = String(node.id).replace(/[^a-zA-Z0-9]/g, '').slice(-6);
                const uniformName = addUniform(`uVSG_${safeIdentifier(node.data.name, 'Value')}_${suffix}`, {
                    _owner: node.id,
                    type: type === 'color' ? 'vec3' : type,
                    value: deepClone(node.data.value),
                    hexValue: type === 'color' ? colorArrayToHex(node.data.value) : undefined,
                    is_color: type === 'color',
                    expose: node.data.expose !== false,
                    min: node.data.min,
                    max: node.data.max,
                    step: node.data.step,
                    label: node.data.name
                });
                result = { expr: uniformName, type };
            } else if (node.type === 'project_texture') {
                uniforms.map = uniforms.map || { type: 'sampler2D', value: null, expose: true, repeat: true };
                result = { expr: 'map', type: 'texture' };
            } else if (node.type === 'texture_parameter') {
                const suffix = String(node.id).replace(/[^a-zA-Z0-9]/g, '').slice(-6);
                const uniformName = addUniform(`uVSG_${safeIdentifier(node.data.name, 'Texture')}_${suffix}`, {
                    _owner: node.id, type: 'sampler2D', value: null, expose: node.data.expose !== false, repeat: false, label: node.data.name
                });
                result = { expr: uniformName, type: 'texture' };
            } else if (node.type === 'uv') {
                result = { expr: stage === 'vertex' ? 'uv' : 'vVSGUv', type: 'vec2' };
            } else if (node.type === 'time') {
                uniforms.uTime = uniforms.uTime || { type: 'float', value: 0, expose: false };
                result = { expr: 'uTime', type: 'float' };
            } else if (node.type === 'world_position') {
                result = { expr: stage === 'vertex' ? '(modelMatrix * vec4(position, 1.0)).xyz' : 'vVSGWorldPosition', type: 'vec3' };
            } else if (node.type === 'world_normal') {
                result = { expr: stage === 'vertex' ? 'normalize(mat3(modelMatrix) * normal)' : 'normalize(vVSGWorldNormal)', type: 'vec3' };
            } else if (node.type === 'view_direction') {
                result = { expr: stage === 'vertex' ? 'normalize(cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz)' : 'normalize(cameraPosition - vVSGWorldPosition)', type: 'vec3' };
            } else if (node.type === 'camera_position') {
                result = { expr: 'cameraPosition', type: 'vec3' };
            } else if (node.type === 'vertex_position') {
                result = { expr: 'position', type: 'vec3' };
            } else if (node.type === 'vertex_normal') {
                result = { expr: 'normal', type: 'vec3' };
            } else if (node.type === 'vertex_tangent') {
                registerAttribute('tangent', 'vec4', { guardedDefine: 'USE_TANGENT' });
                result = { expr: 'tangent.xyz', type: 'vec3' };
            } else if (node.type === 'vertex_color') {
                registerAttribute('color', 'vec3', { guardedDefine: 'USE_COLOR' });
                result = { expr: 'vec4(color, 1.0)', type: 'vec4' };
            } else if (node.type === 'uv_channel') {
                const channel = Math.max(0, Math.min(3, Math.round(Number(node.data?.channel) || 0)));
                const attributeName = channel === 0 ? 'uv' : channel === 1 ? 'uv2' : channel === 2 ? 'uv3' : 'uv4';
                const guardedDefine = channel === 1 ? 'USE_UV2' : '';
                registerAttribute(attributeName, 'vec2', { guardedDefine });
                result = { expr: attributeName, type: 'vec2' };
            } else if (node.type === 'geometry_attribute') {
                const valueType = ['float', 'vec2', 'vec3', 'vec4'].includes(node.data?.attributeType) ? node.data.attributeType : 'float';
                const attributeName = registerAttribute(node.data?.attributeName || 'highlight', valueType);
                result = { expr: attributeName, type: valueType };
            } else if (node.type === 'varying') {
                const valueType = ['float', 'vec2', 'vec3', 'vec4', 'color'].includes(node.data?.valueType) ? node.data.valueType : 'float';
                if (stage === 'vertex') {
                    result = readInput(node, 'in', 'vertex', valueType);
                } else {
                    let bridge = varyings.get(node.id);
                    if (!bridge) {
                        const source = readInput(node, 'in', 'vertex', valueType);
                        const suffix = String(node.id).replace(/[^a-zA-Z0-9]/g, '').slice(-6);
                        const varyingName = `vVSG_${safeIdentifier(node.data?.name || 'Varying', 'Varying')}_${suffix}`;
                        bridge = {
                            name: varyingName,
                            type: valueType,
                            glslType: glslValueType(valueType),
                            expression: castExpression(source, valueType).expr
                        };
                        varyings.set(node.id, bridge);
                    }
                    result = { expr: bridge.name, type: bridge.type };
                }
            } else if (node.type === 'uniform_reference') {
                const valueType = ['bool', 'int', 'float', 'vec2', 'vec3', 'vec4', 'color'].includes(node.data?.uniformType) ? node.data.uniformType : 'float';
                const uniformName = safeIdentifier(node.data?.name || 'uValue', 'uValue');
                const builtInUniforms = new Set([
                    'modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix',
                    'normalMatrix', 'cameraPosition'
                ]);
                if (!builtInUniforms.has(uniformName)) {
                    const value = parseLooseValue(node.data?.value ?? defaultValueForType(valueType), valueType);
                    registerExactUniform(uniformName, {
                        type: valueType === 'color' ? 'vec3' : valueType,
                        value,
                        hexValue: valueType === 'color' ? colorArrayToHex(value) : undefined,
                        is_color: valueType === 'color',
                        expose: node.data?.expose !== false,
                        label: node.data?.name || uniformName
                    }, node.id);
                }
                result = { expr: uniformName, type: valueType };
            } else if (node.type === 'fragment_coordinate') {
                result = { expr: 'gl_FragCoord', type: 'vec4' };
            } else if (node.type === 'front_facing') {
                result = { expr: 'gl_FrontFacing', type: 'bool' };
            } else if (node.type === 'normalized_face_uv') {
                result = geometryAttributeValue('normalizedFaceUv', 'vec2', stage);
            } else if (node.type === 'face_size') {
                result = geometryAttributeValue('faceSize', 'vec2', stage);
            } else if (node.type === 'global_face_size') {
                result = geometryAttributeValue('globalFaceSize', 'vec2', stage);
            } else if (node.type === 'uv_size') {
                result = geometryAttributeValue('uvSize', 'vec2', stage);
            } else if (node.type === 'normalized_uv_size') {
                const uvSizeValue = geometryAttributeValue('uvSize', 'vec2', stage);
                const faceSizeValue = geometryAttributeValue('faceSize', 'vec2', stage);
                registerExactUniform('TEXTURE_SIZE', { type: 'vec2', value: [16, 16], expose: false }, node.id);
                result = { expr: `(((${uvSizeValue.expr}) * (${faceSizeValue.expr})) / max(TEXTURE_SIZE, vec2(1.0)))`, type: 'vec2' };
            } else if (node.type === 'auto_tile_state') {
                result = geometryAttributeValue('autoTile', 'float', stage);
            } else if (node.type === 'texture_size') {
                registerExactUniform('TEXTURE_SIZE', { type: 'vec2', value: [16, 16], expose: false }, node.id);
                result = { expr: 'TEXTURE_SIZE', type: 'vec2' };
            } else if (node.type === 'screen_uv') {
                result = { expr: 'saScreenUVFromFragCoord(gl_FragCoord.xy)', type: 'vec2' };
            } else if (node.type === 'screen_size') {
                result = { expr: 'SA_SCREEN_SIZE', type: 'vec2' };
            } else if (node.type === 'screen_texel_size') {
                result = { expr: 'SA_SCREEN_TEXEL_SIZE', type: 'vec2' };
            } else if (node.type === 'screen_info') {
                const symbols = { near: 'SA_SCREEN_CAMERA_NEAR', far: 'SA_SCREEN_CAMERA_FAR', dpr: 'SA_SCREEN_DPR', frame: 'SA_SCREEN_FRAME_ID', colorAvailable: 'SA_SCREEN_AVAILABLE', depthAvailable: 'SA_SCREEN_DEPTH_AVAILABLE' };
                result = { expr: symbols[outputPortId] || 'SA_SCREEN_AVAILABLE', type: 'float' };
            } else if (node.type === 'scene_color') {
                const uvValue = readInput(node, 'uv', stage, 'vec2');
                const sample = `saSampleScreenColor(${uvValue.expr})`;
                if (outputPortId === 'rgb') result = { expr: `${sample}.rgb`, type: 'color' };
                else if (outputPortId === 'a') result = { expr: `${sample}.a`, type: 'float' };
                else result = { expr: sample, type: 'vec4' };
            } else if (node.type === 'scene_depth') {
                const uvValue = readInput(node, 'uv', stage, 'vec2');
                const raw = `saSampleScreenDepth(${uvValue.expr})`;
                if (node.data?.mode === 'eye') result = { expr: `max(-saScreenDepthToViewZ(${raw}), 0.0)`, type: 'float' };
                else if (node.data?.mode === 'linear01') result = { expr: `clamp(max(-saScreenDepthToViewZ(${raw}), 0.0) / max(SA_SCREEN_CAMERA_FAR, 0.0001), 0.0, 1.0)`, type: 'float' };
                else result = { expr: raw, type: 'float' };
            } else if (node.type === 'scene_view_position') {
                const uvValue = readInput(node, 'uv', stage, 'vec2');
                const depthValue = readInput(node, 'depth', stage, 'float');
                result = { expr: `saScreenReconstructViewPosition(${uvValue.expr}, ${depthValue.expr})`, type: 'vec3' };
            } else if (node.type === 'scene_world_position') {
                const uvValue = readInput(node, 'uv', stage, 'vec2');
                const depthValue = readInput(node, 'depth', stage, 'float');
                result = { expr: `saScreenReconstructWorldPosition(${uvValue.expr}, ${depthValue.expr})`, type: 'vec3' };
            } else if (node.type === 'negate') {
                const value = readInput(node, 'value', stage);
                result = { expr: `(-(${value.expr}))`, type: value.type };
            } else if (node.type === 'refract') {
                const incident = readInput(node, 'incident', stage, 'vec3');
                const normal = readInput(node, 'normal', stage, 'vec3');
                const eta = readInput(node, 'eta', stage, 'float');
                result = { expr: `refract(${incident.expr}, ${normal.expr}, ${eta.expr})`, type: 'vec3' };
            } else if (node.type === 'faceforward') {
                const normal = readInput(node, 'normal', stage, 'vec3');
                const incident = readInput(node, 'incident', stage, 'vec3');
                const reference = readInput(node, 'reference', stage, 'vec3');
                result = { expr: `faceforward(${normal.expr}, ${incident.expr}, ${reference.expr})`, type: 'vec3' };
            } else if (node.type === 'less_than' || node.type === 'greater_than' || node.type === 'equal') {
                const a = readInput(node, 'a', stage, 'float');
                const b = readInput(node, 'b', stage, 'float');
                const operator = node.type === 'less_than' ? '<' : node.type === 'greater_than' ? '>' : '==';
                result = { expr: `((${a.expr}) ${operator} (${b.expr}))`, type: 'bool' };
            } else if (node.type === 'boolean_not') {
                const value = readInput(node, 'value', stage, 'bool');
                result = { expr: `(!(${value.expr}))`, type: 'bool' };
            } else if (node.type === 'boolean_and' || node.type === 'boolean_or') {
                const a = readInput(node, 'a', stage, 'bool');
                const b = readInput(node, 'b', stage, 'bool');
                result = { expr: `((${a.expr}) ${node.type === 'boolean_and' ? '&&' : '||'} (${b.expr}))`, type: 'bool' };
            } else if (definition.operation) {
                const a = readInput(node, 'a', stage);
                const b = readInput(node, 'b', stage);
                const type = unifyTypes([a.type, b.type]);
                result = { expr: `((${castExpression(a, type).expr}) ${definition.operation} (${castExpression(b, type).expr}))`, type };
            } else if (definition.functionName) {
                const inputs = definition.inputs.map(entry => readInput(node, entry.id, stage));
                const argumentType = unifyTypes(inputs.map(entry => entry.type));
                const outputType = definition.forceOutputType || argumentType;
                const args = inputs.map(entry => castExpression(entry, argumentType).expr);
                result = { expr: `${definition.functionName}(${args.join(', ')})`, type: outputType };
            } else if (definition.unary || definition.unaryPrefix) {
                const value = readInput(node, 'value', stage);
                const expression = definition.unaryPrefix
                    ? `(${definition.unaryPrefix}(${value.expr}))`
                    : `${definition.unary}(${value.expr}${definition.unarySuffix || ''})`;
                result = { expr: expression, type: definition.forceOutputType || value.type };
            } else if (node.type === 'remap') {
                const value = readInput(node, 'value', stage);
                const inputMin = readInput(node, 'inMin', stage);
                const inputMax = readInput(node, 'inMax', stage);
                const outputMin = readInput(node, 'outMin', stage);
                const outputMax = readInput(node, 'outMax', stage);
                const type = unifyTypes([value.type, inputMin.type, inputMax.type, outputMin.type, outputMax.type]);
                const typedValue = castExpression(value, type).expr;
                const inMin = castExpression(inputMin, type).expr;
                const inMax = castExpression(inputMax, type).expr;
                const outMin = castExpression(outputMin, type).expr;
                const outMax = castExpression(outputMax, type).expr;
                result = { expr: `((${outMin}) + ((${typedValue}) - (${inMin})) * ((${outMax}) - (${outMin})) / max((${inMax}) - (${inMin}), ${literalForType(0.00001, type)}))`, type };
            } else if (node.type === 'combine') {
                const values = ['x', 'y', 'z', 'w'].map(key => readInput(node, key, stage, 'float').expr);
                const count = outputPortId === 'xy' ? 2 : outputPortId === 'xyz' ? 3 : 4;
                result = { expr: `vec${count}(${values.slice(0, count).join(', ')})`, type: `vec${count}` };
            } else if (node.type === 'split') {
                const value = readInput(node, 'value', stage);
                const component = { x: 'x', y: 'y', z: 'z', w: 'w' }[outputPortId] || 'x';
                result = { expr: `(${castExpression(value, 'vec4').expr}).${component}`, type: 'float' };
            } else if (node.type === 'sample_texture') {
                const texture = readInput(node, 'texture', stage, 'texture');
                const uvValue = readInput(node, 'uv', stage, 'vec2');
                const sample = `texture2D(${texture.expr}, ${uvValue.expr})`;
                if (outputPortId === 'rgb') result = { expr: `${sample}.rgb`, type: 'color' };
                else if (['r', 'g', 'b', 'a'].includes(outputPortId)) result = { expr: `${sample}.${outputPortId}`, type: 'float' };
                else result = { expr: sample, type: 'vec4' };
            } else if (node.type === 'tiling_offset') {
                const uvValue = readInput(node, 'uv', stage, 'vec2');
                const tiling = readInput(node, 'tiling', stage, 'vec2');
                const offset = readInput(node, 'offset', stage, 'vec2');
                result = { expr: `((${uvValue.expr}) * (${tiling.expr}) + (${offset.expr}))`, type: 'vec2' };
            } else if (node.type === 'checkerboard') {
                const uvValue = readInput(node, 'uv', stage, 'vec2');
                const scale = readInput(node, 'scale', stage, 'float');
                result = { expr: `mod(floor((${uvValue.expr}).x * (${scale.expr})) + floor((${uvValue.expr}).y * (${scale.expr})), 2.0)`, type: 'float' };
            } else if (node.type === 'simple_noise') {
                functions[stage].add(VSG_NOISE_GLSL);
                const uvValue = readInput(node, 'uv', stage, 'vec2');
                const scale = readInput(node, 'scale', stage, 'float');
                result = { expr: `vsgNoise21((${uvValue.expr}) * (${scale.expr}))`, type: 'float' };
            } else if (node.type === 'triplanar_sample') {
                functions.fragment.add(VSG_TRIPLANAR_GLSL);
                const texture = readInput(node, 'texture', stage, 'texture');
                const position = readInput(node, 'position', stage, 'vec3');
                const normal = readInput(node, 'normal', stage, 'vec3');
                const tiling = readInput(node, 'tiling', stage, 'float');
                const blend = readInput(node, 'blend', stage, 'float');
                const sample = `vsgTriplanarSample(${texture.expr}, ${position.expr}, ${normal.expr}, ${tiling.expr}, ${blend.expr})`;
                if (outputPortId === 'rgb') result = { expr: `${sample}.rgb`, type: 'color' };
                else if (outputPortId === 'a') result = { expr: `${sample}.a`, type: 'float' };
                else result = { expr: sample, type: 'vec4' };
            } else if (node.type === 'autotile_uv') {
                functions.fragment.add(VSG_AUTOTILE_GLSL);
                const atlasUv = readInput(node, 'uv', stage, 'vec2');
                const manualTiling = readInput(node, 'tiling', stage, 'vec2');
                const localUv = geometryAttributeValue('normalizedFaceUv', 'vec2', stage);
                const faceSize = geometryAttributeValue('globalFaceSize', 'vec2', stage);
                const uvSize = geometryAttributeValue('uvSize', 'vec2', stage);
                const autoTile = geometryAttributeValue('autoTile', 'float', stage);
                const mode = node.data?.mode === 'manual' ? 0.0 : node.data?.mode === 'geometry' ? 1.0 : 2.0;
                result = { expr: `vsgResolveAutotileUv(${atlasUv.expr}, ${localUv.expr}, ${faceSize.expr}, ${uvSize.expr}, ${autoTile.expr}, ${manualTiling.expr}, ${mode.toFixed(1)})`, type: 'vec2' };
            } else if (node.type === 'texture_relief') {
                functions.fragment.add(VSG_RELIEF_GLSL);
                const heightTexture = readInput(node, 'heightTexture', stage, 'texture');
                const uvValue = readInput(node, 'uv', stage, 'vec2');
                const view = readInput(node, 'view', stage, 'vec3');
                const height = readInput(node, 'height', stage, 'float');
                const steps = readInput(node, 'steps', stage, 'float');
                const reliefUv = `vsgReliefUv(${heightTexture.expr}, ${uvValue.expr}, vVSGWorldPosition, vVSGWorldNormal, ${view.expr}, ${height.expr}, ${steps.expr})`;
                if (outputPortId === 'height') result = { expr: `texture2D(${heightTexture.expr}, ${reliefUv}).r`, type: 'float' };
                else result = { expr: reliefUv, type: 'vec2' };
            } else if (node.type === 'fresnel') {
                const normal = readInput(node, 'normal', stage, 'vec3');
                const view = readInput(node, 'view', stage, 'vec3');
                const power = readInput(node, 'power', stage, 'float');
                result = { expr: `pow(1.0 - clamp(dot(normalize(${normal.expr}), normalize(${view.expr})), 0.0, 1.0), max(${power.expr}, 0.0001))`, type: 'float' };
            } else if (node.type === 'rim_lighting') {
                const normal = readInput(node, 'normal', stage, 'vec3');
                const view = readInput(node, 'view', stage, 'vec3');
                const color = readInput(node, 'color', stage, 'vec3');
                const power = readInput(node, 'power', stage, 'float');
                const intensity = readInput(node, 'intensity', stage, 'float');
                const mask = `(pow(1.0 - clamp(abs(dot(normalize(${normal.expr}), normalize(${view.expr}))), 0.0, 1.0), max(${power.expr}, 0.0001)) * max(${intensity.expr}, 0.0))`;
                result = outputPortId === 'color' ? { expr: `((${color.expr}) * ${mask})`, type: 'color' } : { expr: mask, type: 'float' };
            } else if (node.type === 'bump_from_height') {
                functions.fragment.add(VSG_BUMP_GLSL);
                const height = readInput(node, 'height', stage, 'float');
                const normal = readInput(node, 'normal', stage, 'vec3');
                const strength = readInput(node, 'strength', stage, 'float');
                const distanceValue = readInput(node, 'distance', stage, 'float');
                result = { expr: `vsgBumpFromHeight(vVSGWorldPosition, ${normal.expr}, ${height.expr}, ${strength.expr}, ${distanceValue.expr})`, type: 'vec3' };
            } else if (node.type === 'normal_from_texture') {
                if (stage !== 'fragment') throw new Error('Normal from Texture can only be evaluated in the fragment stage.');
                functions.fragment.add(VSG_NORMAL_GLSL);
                const sample = readInput(node, 'sample', stage, 'vec3');
                const strength = readInput(node, 'strength', stage, 'float');
                result = { expr: `vsgNormalFromMap(vVSGWorldNormal, vVSGWorldPosition, vVSGUv, ${sample.expr}, ${strength.expr})`, type: 'vec3' };
            } else if (node.type === 'branch') {
                const condition = readInput(node, 'condition', stage, 'bool');
                const whenTrue = readInput(node, 'true', stage);
                const whenFalse = readInput(node, 'false', stage);
                const type = unifyTypes([whenTrue.type, whenFalse.type]);
                result = { expr: `((${condition.expr}) ? (${castExpression(whenTrue, type).expr}) : (${castExpression(whenFalse, type).expr}))`, type };
            } else if (node.type === 'reroute') {
                result = readInput(node, 'in', stage);
            } else if (node.type === 'custom_expression') {
                const a = readInput(node, 'a', stage);
                const b = readInput(node, 'b', stage);
                const c = readInput(node, 'c', stage);
                const expression = String(node.data.expression || 'A')
                    .replace(/\bA\b/g, `(${a.expr})`)
                    .replace(/\bB\b/g, `(${b.expr})`)
                    .replace(/\bC\b/g, `(${c.expr})`);
                result = { expr: `(${expression})`, type: node.data.outputType || 'float' };
            } else {
                throw new Error(`Node compiler not implemented: ${node.type}`);
            }
            if (String(result?.expr || '').length > MAX_EXPRESSION_CHARS) throw new Error(tr('graph_expression_too_complex'));
            compiling.delete(`${stage}:${cacheKey}`);
            cache.set(cacheKey, result);
            return result;
        };

        const outputInput = (portId, stage, type) => readInput(outputNode, portId, stage, type);
        const legacyVertexOffset = outputInput('vertexOffset', 'vertex', 'vec3');
        const vertexOutputNode = graph.nodes.find(node => node.type === 'vertex_output') || null;
        let vertexPosition = { expr: 'position', type: 'vec3' };
        let vertexNormal = { expr: 'normal', type: 'vec3' };
        if (vertexOutputNode) {
            const positionEdge = incoming.get(`${vertexOutputNode.id}:position`);
            if (positionEdge) {
                const sourcePosition = readInput(vertexOutputNode, 'position', 'vertex', 'vec3');
                vertexPosition = vertexOutputNode.data?.positionMode === 'offset'
                    ? { expr: `(position + (${sourcePosition.expr}))`, type: 'vec3' }
                    : sourcePosition;
            }
            const normalEdge = incoming.get(`${vertexOutputNode.id}:normal`);
            if (normalEdge) vertexNormal = readInput(vertexOutputNode, 'normal', 'vertex', 'vec3');
        }
        const finalVertexPosition = {
            expr: `((${vertexPosition.expr}) + (${legacyVertexOffset.expr}))`,
            type: 'vec3'
        };
        const baseColor = outputInput('baseColor', 'fragment', 'vec3');
        const alpha = outputInput('alpha', 'fragment', 'float');
        const normalInput = outputInput('normal', 'fragment', 'vec3');
        const emission = outputInput('emission', 'fragment', 'vec3');
        const metallic = outputInput('metallic', 'fragment', 'float');
        const roughness = outputInput('roughness', 'fragment', 'float');
        const occlusion = outputInput('occlusion', 'fragment', 'float');
        const alphaClip = outputInput('alphaClip', 'fragment', 'float');

        const lightingUniforms = {
            AFFECTED_BY_LIGHT: { type: 'bool', value: true, expose: true },
            max_light_number: { type: 'int', value: 0, expose: false },
            uAmbient: { type: 'float', value: 0.22, expose: true, min: 0, max: 1, step: 0.05 },
            uAmbientColor: { type: 'vec3', value: [1, 1, 1], hexValue: '#ffffff', is_color: true, expose: true },
            uShadowStrength: { type: 'float', value: 1, expose: true, min: 0, max: 1, step: 0.05 },
            uShadowFloor: { type: 'float', value: 0, expose: true, min: 0, max: 1, step: 0.05 },
            LIGHTCOLOR: { type: 'vec3', value: [1, 1, 1], hexValue: '#ffffff', is_color: true, expose: true },
            uLightPos: { type: 'vec3v', value: Array.from({ length: 16 }, () => [0, 0, 0]), expose: false },
            uLightDir: { type: 'vec3v', value: Array.from({ length: 16 }, () => [0, -1, 0]), expose: false },
            uLightIntensity: { type: 'floatv', value: Array(16).fill(0), expose: false },
            uLightDistance: { type: 'floatv', value: Array(16).fill(0), expose: false },
            uLightConeAngle: { type: 'floatv', value: Array(16).fill(0), expose: false },
            uLightPenumbra: { type: 'floatv', value: Array(16).fill(0), expose: false },
            uLightType: { type: 'intv', value: Array(16).fill(0), expose: false },
            uLightColor: { type: 'vec3v', value: Array.from({ length: 16 }, () => [0, 0, 0]), expose: false },
            uLightCastShadow: { type: 'intv', value: Array(16).fill(0), expose: false },
            uLightShadowIndex: { type: 'intv', value: Array(16).fill(-1), expose: false },
            uWorldNormalMatrix: { type: 'mat3', value: null, expose: false },
            TEXTURE_SIZE: { type: 'vec2', value: [16, 16], expose: false },
            // Shader Architect's environment integration drives these on every
            // light-bound material; bindSharedLightUniforms() keeps them current.
            uSAEnvironmentEnabled: { type: 'int', value: 0, expose: false },
            uSAEnvironmentAmbient: { type: 'vec3', value: [1, 1, 1], expose: false },
            uSAEnvironmentStrength: { type: 'float', value: 0, expose: false }
        };
        Object.keys(lightingUniforms).forEach(name => { if (!uniforms[name]) uniforms[name] = lightingUniforms[name]; });

        const uniformDeclaration = (name, definition) => {
            const type = definition.type === 'color' ? 'vec3' : definition.type;
            if (type === 'vec3v') return `uniform vec3 ${name}[16];`;
            if (type === 'floatv') return `uniform float ${name}[16];`;
            if (type === 'intv') return `uniform int ${name}[16];`;
            if (type === 'texture' || type === 'sampler2D') return `uniform sampler2D ${name};`;
            return `uniform ${type || 'float'} ${name};`;
        };
        const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const vertexSourceProbe = [
            finalVertexPosition.expr,
            vertexNormal.expr,
            ...Array.from(caches.vertex.values()).map(result => result.expr),
            ...Array.from(varyings.values()).map(entry => entry.expression)
        ].join('\n');
        const vertexUniformNames = new Set(
            Object.keys(uniforms).filter(name => new RegExp(`\\b${escapeRegExp(name)}\\b`).test(vertexSourceProbe))
        );
        const vertexUniformDeclarations = Object.entries(uniforms)
            .filter(([name]) => vertexUniformNames.has(name))
            .map(([name, definition]) => uniformDeclaration(name, definition)).join('\n');
        const fragmentUniformDeclarations = Object.entries(uniforms)
            .map(([name, definition]) => uniformDeclaration(name, definition)).join('\n');
        const attributeDeclarations = Array.from(attributes.values())
            .filter(entry => !entry.builtIn)
            .map(entry => entry.guardedDefine
                ? `#ifndef ${entry.guardedDefine}\nattribute ${entry.type} ${entry.name};\n#endif`
                : `attribute ${entry.type} ${entry.name};`)
            .join('\n');
        const customVaryingDeclarations = Array.from(varyings.values())
            .map(entry => `varying ${entry.glslType} ${entry.name};`).join('\n');
        const customVaryingAssignments = Array.from(varyings.values())
            .map(entry => `    ${entry.name} = ${entry.expression};`).join('\n');
        const vertexFunctions = Array.from(functions.vertex).join('\n');
        const fragmentFunctions = Array.from(functions.fragment).join('\n');
        const globalCodeForStage = stage => graph.nodes
            .filter(node => node.type === 'global_expression' && ['both', stage].includes(node.data?.scope || 'both'))
            .map(node => String(node.data?.code || '').trim())
            .filter(Boolean)
            .join('\n\n');
        const vertexGlobalCode = globalCodeForStage('vertex');
        const fragmentGlobalCode = globalCodeForStage('fragment');

        const vertex = `#include <common>
#include <shadowmap_pars_vertex>
${attributeDeclarations}
${vertexUniformDeclarations}
varying vec2 vVSGUv;
varying vec3 vVSGWorldPosition;
varying vec3 vVSGWorldNormal;
${customVaryingDeclarations}
${vertexGlobalCode}
${vertexFunctions}
void main() {
    vec3 vsgObjectPosition = ${finalVertexPosition.expr};
    vec3 vsgObjectNormal = normalize(${vertexNormal.expr});
    vec3 transformedNormal = normalize(normalMatrix * vsgObjectNormal);
    vec4 worldPosition = modelMatrix * vec4(vsgObjectPosition, 1.0);
    vVSGUv = uv;
    vVSGWorldPosition = worldPosition.xyz;
    vVSGWorldNormal = normalize(mat3(modelMatrix) * vsgObjectNormal);
${customVaryingAssignments}
    gl_Position = projectionMatrix * modelViewMatrix * vec4(vsgObjectPosition, 1.0);
    #include <shadowmap_vertex>
}`;

        const fragment = `#include <common>
#include <packing>
#ifndef VSG_PUNCTUAL_LIGHT_COMPAT
#define VSG_PUNCTUAL_LIGHT_COMPAT
float punctualLightIntensityToIrradianceFactor(const in float lightDistance, const in float cutoffDistance, const in float decayExponent) {
#if defined(PHYSICALLY_CORRECT_LIGHTS)
    float distanceFalloff = 1.0 / max(pow(lightDistance, decayExponent), 0.01);
    if (cutoffDistance > 0.0) distanceFalloff *= pow2(saturate(1.0 - pow4(lightDistance / cutoffDistance)));
    return distanceFalloff;
#else
    if (cutoffDistance > 0.0 && decayExponent > 0.0) return pow(saturate(-lightDistance / cutoffDistance + 1.0), decayExponent);
    return 1.0;
#endif
}
float punctualLightIntensityToIrradianceFactor(const in float lightDistance, const in float cutoffDistance) {
    return punctualLightIntensityToIrradianceFactor(lightDistance, cutoffDistance, 1.0);
}
#endif
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
${fragmentUniformDeclarations}
varying vec2 vVSGUv;
varying vec3 vVSGWorldPosition;
varying vec3 vVSGWorldNormal;
${customVaryingDeclarations}
${fragmentGlobalCode}
${fragmentFunctions}
float vsgDistanceAttenuation(float distanceToLight, float rangeValue) {
    if (rangeValue > 0.0) {
        if (distanceToLight >= rangeValue) return 0.0;
        float ratio = clamp(distanceToLight / rangeValue, 0.0, 1.0);
        float falloff = clamp(1.0 - pow(ratio, 4.0), 0.0, 1.0);
        return (falloff * falloff) / (distanceToLight * distanceToLight + 1.0);
    }
    return 1.0 / (1.0 + 0.04 * distanceToLight + 0.002 * distanceToLight * distanceToLight);
}
vec3 vsgFresnelSchlick(float cosTheta, vec3 f0) {
    return f0 + (1.0 - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}
float vsgDistributionGGX(vec3 N, vec3 H, float roughnessValue) {
    float a = max(roughnessValue * roughnessValue, 0.0025);
    float a2 = a * a;
    float nDotH = max(dot(N, H), 0.0);
    float denominator = nDotH * nDotH * (a2 - 1.0) + 1.0;
    return a2 / max(3.14159265 * denominator * denominator, 0.00001);
}
float vsgGeometrySchlick(float nDotV, float roughnessValue) {
    float r = roughnessValue + 1.0;
    float k = (r * r) / 8.0;
    return nDotV / max(nDotV * (1.0 - k) + k, 0.00001);
}
vec3 vsgEvaluateSurface(vec3 baseColor, vec3 normalValue, vec3 emissionValue, float metallicValue, float roughnessValue, float occlusionValue, int model) {
    if (!AFFECTED_BY_LIGHT) return baseColor + emissionValue;
    vec3 N = normalize(normalValue);
    vec3 V = normalize(cameraPosition - vVSGWorldPosition);
    vec3 direct = vec3(0.0);
    vec3 f0 = mix(vec3(0.04), baseColor, clamp(metallicValue, 0.0, 1.0));
    for (int i = 0; i < 16; i++) {
        if (i >= max_light_number) break;
        if (uLightIntensity[i] <= 0.0) continue;
        vec3 L;
        float attenuation = 1.0;
        if (uLightType[i] == 1) {
            L = normalize(-uLightDir[i]);
        } else {
            vec3 lightVector = uLightPos[i] - vVSGWorldPosition;
            float lightDistance = max(length(lightVector), 0.0001);
            L = lightVector / lightDistance;
            attenuation = vsgDistanceAttenuation(lightDistance, uLightDistance[i]);
            if (uLightType[i] == 2) {
                float theta = dot(-L, normalize(uLightDir[i]));
                float outerCutoff = cos(uLightConeAngle[i]);
                float innerCutoff = cos(uLightConeAngle[i] * (1.0 - clamp(uLightPenumbra[i], 0.0, 1.0)));
                attenuation *= innerCutoff <= outerCutoff + 0.0001 ? step(outerCutoff, theta) : clamp((theta - outerCutoff) / (innerCutoff - outerCutoff), 0.0, 1.0);
            }
        }
        vec3 radiance = uLightColor[i] * uLightIntensity[i] * attenuation;
        float nDotL = max(dot(N, L), 0.0);
        if (model == 2) nDotL = floor(nDotL * 4.0 + 0.5) / 4.0;
        vec3 H = normalize(V + L);
        if (model == 0 || model == 2) {
            float specularPower = mix(96.0, 4.0, clamp(roughnessValue, 0.0, 1.0));
            vec3 specular = f0 * pow(max(dot(N, H), 0.0), specularPower);
            direct += (baseColor * nDotL + specular) * radiance;
        } else {
            float nDotV = max(dot(N, V), 0.0);
            float nDotH = max(dot(N, H), 0.0);
            float hDotV = max(dot(H, V), 0.0);
            float distribution = vsgDistributionGGX(N, H, roughnessValue);
            float geometry = vsgGeometrySchlick(nDotV, roughnessValue) * vsgGeometrySchlick(nDotL, roughnessValue);
            vec3 fresnel = vsgFresnelSchlick(hDotV, f0);
            vec3 specular = distribution * geometry * fresnel / max(4.0 * nDotV * nDotL, 0.0001);
            vec3 diffuse = (vec3(1.0) - fresnel) * (1.0 - metallicValue) * baseColor / 3.14159265;
            direct += (diffuse + specular) * radiance * nDotL;
        }
    }
    float shadow = mix(1.0, max(getShadowMask(), clamp(uShadowFloor, 0.0, 1.0)), clamp(uShadowStrength, 0.0, 1.0));
    vec3 ambientLight = max(uAmbientColor, vec3(0.0)) * max(uAmbient, 0.0);
    if (uSAEnvironmentEnabled == 1) {
        ambientLight += max(uSAEnvironmentAmbient, vec3(0.0)) * max(uSAEnvironmentStrength, 0.0);
    }
    vec3 ambient = ambientLight * baseColor * clamp(occlusionValue, 0.0, 1.0);
    return max((ambient + direct * shadow) * LIGHTCOLOR + emissionValue, vec3(0.0));
}
void main() {
    vec3 vsgBaseColor = max(${baseColor.expr}, vec3(0.0));
    float vsgAlpha = ${graph.settings.alphaMode === 'opaque' ? '1.0' : `clamp(${alpha.expr}, 0.0, 1.0)`};
    float vsgAlphaClip = clamp(${alphaClip.expr}, 0.0, 1.0);
    ${graph.settings.alphaMode === 'opaque' ? '' : 'if (vsgAlpha < vsgAlphaClip) discard;'}
    vec3 vsgInputNormal = ${normalInput.expr};
    vec3 vsgNormal = dot(vsgInputNormal, vsgInputNormal) > 0.000001 ? normalize(vsgInputNormal) : normalize(vVSGWorldNormal);
    vec3 vsgEmission = max(${emission.expr}, vec3(0.0));
    int vsgLightingModel = ${outputNode.data.lightingModel === 'unlit' ? 3 : outputNode.data.lightingModel === 'toon' ? 2 : outputNode.data.lightingModel === 'pbr' ? 1 : 0};
    vec3 vsgFinal = vsgLightingModel == 3 ? vsgBaseColor + vsgEmission : vsgEvaluateSurface(vsgBaseColor, vsgNormal, vsgEmission, clamp(${metallic.expr}, 0.0, 1.0), clamp(${roughness.expr}, 0.04, 1.0), clamp(${occlusion.expr}, 0.0, 1.0), vsgLightingModel);
    #ifdef SA_LIGHTFLOW_MRT_ENABLED
        saMRTSurface = vec4(normalize((viewMatrix * vec4(vsgNormal, 0.0)).xyz) * 0.5 + 0.5, saMRTSurface.a);
        vec3 vsgEncodedEmission = log2(
            vec3(1.0) + clamp(vsgEmission, vec3(0.0), vec3(16.0))
        ) * 0.2446505421;
        saMRTEmission = vec4(vsgEncodedEmission, saMRTEmission.a);
    #endif
    gl_FragColor = vec4(vsgFinal, vsgAlpha);
}`;

        if (vertex.length > MAX_GENERATED_SHADER_CHARS || fragment.length > MAX_GENERATED_SHADER_CHARS) {
            throw new Error(tr('graph_expression_too_complex'));
        }

        return {
            kind: 'generated',
            materialId: materialIdForGraph(graph),
            name: graph.name,
            vertex,
            fragment,
            uniforms,
            enableShadows: outputNode.data.lightingModel !== 'unlit',
            doubleSided: !!outputNode.data.doubleSided,
            depthWrite: outputNode.data.depthWrite !== false,
            transparent: graph.settings.alphaMode === 'blend'
        };
    }

    function compilePresetGraph(graph, outputNode, options = {}) {
        const materials = options.materials || {};
        const base = materials[outputNode.data?.baseMaterialId];
        if (!base) throw new Error(tr('preset_base_missing'));
        const overrides = {};
        getNodeInputPorts(outputNode, materials).forEach(input => {
            const edge = graph.edges.find(entry => entry.to.node === outputNode.id && entry.to.port === input.id);
            const uniformName = input.id.replace(/^uniform:/, '');
            const value = edge
                ? evaluateConstantNode(graph, edge.from.node, edge.from.port, materials)
                : outputNode.inputValues?.[input.id];
            if (value !== null && value !== undefined) overrides[uniformName] = deepClone(value);
        });
        return {
            kind: 'preset',
            materialId: materialIdForGraph(graph),
            name: graph.name,
            baseMaterialId: base.id,
            vertex: base.vertex,
            fragment: base.fragment,
            uniforms: base.uniforms,
            overrides,
            enableShadows: !!base.enableShadows,
            supportsScreenSpaceReflections: !!base.supportsScreenSpaceReflections,
            doubleSided: !!outputNode.data.doubleSided,
            depthWrite: outputNode.data.depthWrite !== false,
            transparent: graph.settings.alphaMode === 'blend' || graph.settings.alphaMode === 'additive'
        };
    }

    function compileGraph(graph, options = {}) {
        if (graph?.settings?.graphKind === 'subgraph') throw new Error('Sub Graphs compile through a parent material graph and cannot be applied standalone.');
        const expandedGraph = graph.nodes?.some(node => node.type === 'subgraph_instance') ? expandSubgraphs(graph, options.graphs || []) : graph;
        const messages = validateGraph(expandedGraph, Object.assign({}, options, { _subgraphsExpanded: true }));
        const errors = messages.filter(message => message.severity === 'error');
        if (errors.length) {
            const error = new Error(errors.map(entry => entry.message).join('\n'));
            error.messages = messages;
            throw error;
        }
        const outputNode = expandedGraph.nodes.find(node => node.type === 'surface_output' || node.type === 'preset_output');
        const result = outputNode.type === 'preset_output'
            ? compilePresetGraph(expandedGraph, outputNode, options)
            : compileExpressionGraph(expandedGraph, outputNode, options);
        result.messages = messages;
        result.graphId = graph.id;
        result.graphRevision = graph.revision;
        result.expandedNodeCount = expandedGraph.nodes.length;
        return result;
    }

    const CORE_API = Object.freeze({
        GRAPH_FORMAT,
        GRAPH_FORMAT_VERSION,
        GRAPH_PROJECT_PROPERTY,
        TYPE_META,
        CATEGORY_META,
        NODE_DEFINITIONS,
        createGraph,
        createNode,
        createEdge,
        sanitizeGraph,
        serializeGraph,
        parseGraphFile,
        validateGraph,
        compileGraph,
        expandSubgraphs,
        getSubgraphInterface,
        canConnectTypes,
        repairPresetParameterConnections,
        materialIdForGraph
    });

    if (typeof Plugin === 'undefined') {
        if (typeof module !== 'undefined' && module.exports) module.exports = CORE_API;
        return;
    }

    function presetParameterType(uniformType) {
        if (uniformType === 'bool') return 'bool_parameter';
        if (uniformType === 'vec2') return 'vector2_parameter';
        if (uniformType === 'vec4') return 'vector4_parameter';
        if (uniformType === 'vec3' || uniformType === 'color') return uniformType === 'color' ? 'color_parameter' : 'vector3_parameter';
        return 'float_parameter';
    }

    function createExactPresetGraph(name, baseMaterialId, controls) {
        const graph = createGraph(name, { withOutput: false });
        const output = createNode('preset_output', 560, 150, {
            baseMaterialId,
            uniformPorts: controls.map(control => ({
                name: control.name,
                label: control.label || control.name,
                type: control.type || 'float',
                default: deepClone(control.value)
            }))
        });
        graph.nodes.push(output);
        controls.forEach((control, index) => {
            const type = control.nodeType || presetParameterType(control.type);
            const data = {
                name: control.label || control.name,
                value: deepClone(control.value),
                expose: control.expose !== false,
                min: control.min,
                max: control.max,
                step: control.step
            };
            if (type === 'color_parameter') data.hex = colorArrayToHex(control.value);
            const node = createNode(type, 110, 60 + index * 102, data);
            graph.nodes.push(node);
            graph.edges.push(createEdge(node.id, 'value', output.id, `uniform:${control.name}`));
        });
        graph.viewport = { x: 80, y: 64, zoom: 0.9 };
        return graph;
    }

    function connect(graph, from, fromPort, to, toPort) {
        graph.edges.push(createEdge(from.id, fromPort, to.id, toPort));
    }

    function createUnlitTexturePreset() {
        const graph = createGraph('Unlit Texture', { withOutput: false });
        const texture = createNode('project_texture', 90, 120);
        const uvNode = createNode('uv', 90, 300);
        const sample = createNode('sample_texture', 360, 160);
        const output = createNode('surface_output', 700, 140, { lightingModel: 'unlit' });
        graph.nodes.push(texture, uvNode, sample, output);
        connect(graph, texture, 'texture', sample, 'texture');
        connect(graph, uvNode, 'uv', sample, 'uv');
        connect(graph, sample, 'rgb', output, 'baseColor');
        connect(graph, sample, 'a', output, 'alpha');
        return graph;
    }

    function createLitTexturePreset(model = 'lightflow', name = 'Lightflow Surface') {
        const graph = createGraph(name, { withOutput: false });
        const texture = createNode('project_texture', 70, 110);
        const uvNode = createNode('uv', 70, 280);
        const sample = createNode('sample_texture', 320, 130);
        const tint = createNode('color_parameter', 320, 390, { name: 'Tint', value: [1, 1, 1], hex: '#ffffff' });
        const multiply = createNode('multiply', 570, 170);
        const roughness = createNode('float_parameter', 570, 410, { name: 'Roughness', value: model === 'pbr' ? 0.62 : 0.78, min: 0.04, max: 1, step: 0.01 });
        const output = createNode('surface_output', 850, 150, { lightingModel: model });
        graph.nodes.push(texture, uvNode, sample, tint, multiply, roughness, output);
        connect(graph, texture, 'texture', sample, 'texture');
        connect(graph, uvNode, 'uv', sample, 'uv');
        connect(graph, sample, 'rgb', multiply, 'a');
        connect(graph, tint, 'value', multiply, 'b');
        connect(graph, multiply, 'out', output, 'baseColor');
        connect(graph, sample, 'a', output, 'alpha');
        connect(graph, roughness, 'value', output, 'roughness');
        graph.viewport = { x: 80, y: 60, zoom: 0.82 };
        return graph;
    }

    function createToonPreset() {
        const graph = createLitTexturePreset('toon', 'Toon Surface');
        const output = graph.nodes.find(node => node.type === 'surface_output');
        const rimColor = createNode('color_parameter', 390, 590, { name: 'Rim Color', value: [0.35, 0.65, 1], hex: '#59a6ff' });
        const normal = createNode('world_normal', 80, 520);
        const view = createNode('view_direction', 80, 680);
        const fresnel = createNode('fresnel', 370, 700);
        const rimStrength = createNode('float_parameter', 370, 870, { name: 'Rim Strength', value: 0.28, min: 0, max: 2, step: 0.01 });
        const rimMultiply = createNode('multiply', 650, 700);
        const strengthMultiply = createNode('multiply', 650, 870);
        graph.nodes.push(rimColor, normal, view, fresnel, rimStrength, rimMultiply, strengthMultiply);
        connect(graph, normal, 'normal', fresnel, 'normal');
        connect(graph, view, 'direction', fresnel, 'view');
        connect(graph, fresnel, 'out', rimMultiply, 'a');
        connect(graph, rimColor, 'value', rimMultiply, 'b');
        connect(graph, rimMultiply, 'out', strengthMultiply, 'a');
        connect(graph, rimStrength, 'value', strengthMultiply, 'b');
        connect(graph, strengthMultiply, 'out', output, 'emission');
        graph.viewport = { x: 70, y: 35, zoom: 0.62 };
        return graph;
    }

    function createHologramPreset() {
        const graph = createGraph('Hologram', { withOutput: false, alphaMode: 'blend' });
        graph.settings.alphaMode = 'blend';
        const color = createNode('color_parameter', 80, 100, { name: 'Hologram Color', value: [0.1, 0.8, 0.9], hex: '#1accE6' });
        const normal = createNode('world_normal', 80, 300);
        const view = createNode('view_direction', 80, 450);
        const fresnel = createNode('fresnel', 350, 340);
        fresnel.inputValues.power = 2.2;
        const emission = createNode('multiply', 610, 160);
        const alpha = createNode('multiply', 610, 390);
        const alphaStrength = createNode('float_parameter', 340, 570, { name: 'Opacity', value: 0.62, min: 0, max: 1, step: 0.01 });
        const output = createNode('surface_output', 900, 220, { lightingModel: 'unlit', depthWrite: false });
        graph.nodes.push(color, normal, view, fresnel, emission, alpha, alphaStrength, output);
        connect(graph, normal, 'normal', fresnel, 'normal');
        connect(graph, view, 'direction', fresnel, 'view');
        connect(graph, color, 'value', emission, 'a');
        connect(graph, fresnel, 'out', emission, 'b');
        connect(graph, fresnel, 'out', alpha, 'a');
        connect(graph, alphaStrength, 'value', alpha, 'b');
        connect(graph, color, 'value', output, 'baseColor');
        connect(graph, emission, 'out', output, 'emission');
        connect(graph, alpha, 'out', output, 'alpha');
        graph.viewport = { x: 90, y: 80, zoom: 0.76 };
        return graph;
    }

    function createVertexWavePreset() {
        const graph = createLitTexturePreset('lightflow', 'Vertex Wave');
        const output = graph.nodes.find(node => node.type === 'surface_output');
        const position = createNode('vertex_position', 60, 620);
        const split = createNode('split', 280, 620);
        const timeNode = createNode('time', 60, 820);
        const speed = createNode('float_parameter', 280, 840, { name: 'Wave Speed', value: 1.8, min: 0, max: 8, step: 0.05 });
        const positionScale = createNode('float_parameter', 280, 1010, { name: 'Wave Frequency', value: 0.3, min: 0.01, max: 4, step: 0.01 });
        const multiplyPosition = createNode('multiply', 520, 640);
        const multiplyTime = createNode('multiply', 520, 840);
        const add = createNode('add', 740, 710);
        const sine = createNode('sine', 950, 710);
        const amplitude = createNode('float_parameter', 720, 1010, { name: 'Amplitude', value: 0.35, min: 0, max: 4, step: 0.01 });
        const waveStrength = createNode('multiply', 1160, 760);
        const combineNode = createNode('combine', 1370, 720);
        graph.nodes.push(position, split, timeNode, speed, positionScale, multiplyPosition, multiplyTime, add, sine, amplitude, waveStrength, combineNode);
        connect(graph, position, 'position', split, 'value');
        connect(graph, split, 'x', multiplyPosition, 'a');
        connect(graph, positionScale, 'value', multiplyPosition, 'b');
        connect(graph, timeNode, 'time', multiplyTime, 'a');
        connect(graph, speed, 'value', multiplyTime, 'b');
        connect(graph, multiplyPosition, 'out', add, 'a');
        connect(graph, multiplyTime, 'out', add, 'b');
        connect(graph, add, 'out', sine, 'value');
        connect(graph, sine, 'out', waveStrength, 'a');
        connect(graph, amplitude, 'value', waveStrength, 'b');
        connect(graph, waveStrength, 'out', combineNode, 'y');
        connect(graph, combineNode, 'xyz', output, 'vertexOffset');
        graph.viewport = { x: 30, y: 30, zoom: 0.48 };
        return graph;
    }

    function createStageIODemoPreset() {
        const graph = createGraph('Stage I/O Demo');
        const vertexOutput = graph.nodes.find(node => node.type === 'vertex_output');
        const fragmentOutput = graph.nodes.find(node => node.type === 'surface_output');
        vertexOutput.data.positionMode = 'offset';
        fragmentOutput.data.lightingModel = 'unlit';

        const highlight = createNode('geometry_attribute', 60, 90, {
            attributeName: 'highlight',
            attributeType: 'float'
        });
        const bridge = createNode('varying', 330, 90, {
            name: 'Highlight',
            valueType: 'float'
        });
        const tint = createNode('color_parameter', 330, 280, {
            name: 'Tint',
            value: [0.2, 0.7, 1.0],
            hex: '#33b3ff'
        });
        const multiply = createNode('multiply', 590, 170);
        const liftUniform = createNode('uniform_reference', 60, 520, {
            name: 'uVertexLift',
            uniformType: 'float',
            value: 0.0,
            expose: true
        });
        const offset = createNode('combine', 330, 520);

        graph.nodes.push(highlight, bridge, tint, multiply, liftUniform, offset);
        connect(graph, highlight, 'value', bridge, 'in');
        connect(graph, bridge, 'out', multiply, 'a');
        connect(graph, tint, 'value', multiply, 'b');
        connect(graph, multiply, 'out', fragmentOutput, 'baseColor');
        connect(graph, liftUniform, 'value', offset, 'y');
        connect(graph, offset, 'xyz', vertexOutput, 'position');
        graph.viewport = { x: 70, y: 55, zoom: 0.72 };
        return graph;
    }

    const PRESET_DEFINITIONS = Object.freeze({
        exact_lightflow: {
            name: 'Lightflow', family: 'exact', icon: 'wb_sunny',
            create: () => createExactPresetGraph('Lightflow', 'lightflow', [
                { name: 'LIGHTCOLOR', label: 'Light Color', type: 'color', value: [1, 1, 1] },
                { name: 'uAmbient', label: 'Ambient', type: 'float', value: 0.3, min: 0, max: 1, step: 0.05 },
                { name: 'uLightWrap', label: 'Light Wrap', type: 'float', value: 0, min: 0, max: 1, step: 0.05 },
                { name: 'uExposure', label: 'Exposure', type: 'float', value: 1, min: 0, max: 5, step: 0.05 },
                { name: 'SHADOWS', label: 'Shadows', type: 'bool', value: true }
            ])
        },
        exact_rendercraft: {
            /*
                cinematic_craft is now Rendercraft v4: the legacy BRDF uniforms
                (uRoughness, uMetallic, uExposure, RENDERCRAFT_COLOR_SATURATION,
                RENDERCRAFT_FACE_GRADIENT_STRENGTH, uEmissiveStrength) no longer
                exist on it. Expose the live bevel, glow, outline and rim
                controls with the trailer_hero defaults the preset ships with.
            */
            name: 'Rendercraft', family: 'exact', icon: 'movie_filter',
            create: () => createExactPresetGraph('Rendercraft', 'cinematic_craft', [
                { name: 'EMISSIVE', label: 'Emissive', type: 'bool', value: false },
                { name: 'BEVEL_ENABLED', label: 'Bevel', type: 'bool', value: true },
                { name: 'BEVEL_WIDTH', label: 'Bevel Width', type: 'float', value: 0.024, min: 0, max: 1, step: 0.01 },
                { name: 'BEVEL_LIGHT_STRENGTH', label: 'Bevel Light', type: 'float', value: 3.0, min: 0, max: 3, step: 0.05 },
                { name: 'BEVEL_GLOW_ENABLED', label: 'Edge Glow', type: 'bool', value: true },
                { name: 'BEVEL_GLOW_INTENSITY', label: 'Glow Intensity', type: 'float', value: 0.46, min: 0, max: 2, step: 0.01 },
                { name: 'OUTLINE_ELEMENT_ENABLED', label: 'Outline', type: 'bool', value: false },
                { name: 'PROMO_RIM_ENABLED', label: 'Promo Rim', type: 'bool', value: true },
                { name: 'PROMO_RIM_INTENSITY', label: 'Rim Intensity', type: 'float', value: 0.25, min: 0, max: 1, step: 0.01 }
            ])
        },
        exact_pbr: {
            name: 'PBR Metallic/Roughness', family: 'exact', icon: 'hexagon',
            create: () => createExactPresetGraph('PBR Metallic Roughness', 'pbr_metallic_roughness', [
                { name: 'uBaseColor', label: 'Base Color', type: 'color', value: [1, 1, 1] },
                { name: 'uMetallic', label: 'Metallic', type: 'float', value: 0, min: 0, max: 1, step: 0.01 },
                { name: 'uRoughness', label: 'Roughness', type: 'float', value: 0.62, min: 0.04, max: 1, step: 0.01 },
                { name: 'uEmissiveColor', label: 'Emission Color', type: 'color', value: [0, 0, 0] },
                { name: 'uEmissiveStrength', label: 'Emission Strength', type: 'float', value: 1, min: 0, max: 16, step: 0.05 }
            ])
        },
        exact_classic: {
            name: 'Classic Shader', family: 'exact', icon: 'grid_view',
            create: () => createExactPresetGraph('Classic Shader', 'classic', [
                { name: 'LIGHTCOLOR', label: 'Light Color', type: 'color', value: [1, 1, 1] },
                { name: 'SHADE', label: 'Face Shading', type: 'bool', value: true },
                { name: 'EMISSIVE', label: 'Emissive', type: 'bool', value: false }
            ])
        },
        empty_surface: { name: 'Empty Surface', family: 'native', icon: 'schema', create: () => createGraph('Custom Surface') },
        unlit_texture: { name: 'Unlit Texture', family: 'native', icon: 'texture', create: createUnlitTexturePreset },
        lightflow_surface: { name: 'Lightflow Surface', family: 'native', icon: 'flare', create: () => createLitTexturePreset('lightflow', 'Lightflow Surface') },
        pbr_surface: { name: 'PBR Surface', family: 'native', icon: 'view_in_ar', create: () => createLitTexturePreset('pbr', 'PBR Surface') },
        toon_surface: { name: 'Toon Surface', family: 'native', icon: 'format_paint', create: createToonPreset },
        hologram: { name: 'Hologram', family: 'native', icon: 'blur_on', create: createHologramPreset },
        vertex_wave: { name: 'Vertex Wave', family: 'native', icon: 'waves', create: createVertexWavePreset },
        stage_io_demo: { name: 'Stage I/O Demo', family: 'native', icon: 'swap_vert', create: createStageIODemoPreset }
    });

    const Runtime = {
        graphs: [],
        activeGraphId: '',
        selectedNodeIds: [],
        selectedEdgeId: '',
        clipboard: null,
        diagnostics: [],
        compileState: 'ready',
        compileMessage: '',
        lastCompileDuration: 0,
        lastCompiledAt: 0,
        lastRepairCount: 0,
        previewSize: 'medium',
        compiledByGraph: new Map(),
        views: new Set(),
        projectProperty: null,
        undoHooks: null,
        hydrationHandle: null,
        compileTimer: null,
        dependencyCompileTimer: null,
        warnedTemporary: false,
        activeProject: null,
        disposed: false,

        get activeGraph() {
            return this.graphs.find(graph => graph.id === this.activeGraphId) || null;
        },

        get selectedNodes() {
            const graph = this.activeGraph;
            if (!graph) return [];
            const selected = new Set(this.selectedNodeIds);
            return graph.nodes.filter(node => selected.has(node.id));
        },

        refresh() {
            this.views.forEach(view => {
                try {
                    view.$forceUpdate();
                } catch (error) {
                    this.views.delete(view);
                    console.warn('[Visual Shader Graph] A detached panel view could not be refreshed.', error);
                }
            });
        },

        registerView(view) {
            this.views.add(view);
            return view;
        },

        unregisterView(view) {
            this.views.delete(view);
        },

        focusNode(nodeId, options = {}) {
            const graph = this.activeGraph;
            if (!graph?.nodes.some(node => node.id === nodeId)) return false;
            this.selectedNodeIds = [nodeId];
            this.selectedEdgeId = '';
            this.refresh();
            this.views.forEach(view => {
                try {
                    view.centerNode?.(nodeId, options);
                } catch (error) {
                    console.warn('[Visual Shader Graph] A panel could not center the requested node.', error);
                }
            });
            return true;
        },

        releaseCompiledGraph(graphId) {
            const entry = this.compiledByGraph.get(graphId);
            const material = entry?.material;
            if (
                material?.id &&
                material.vsgGraphId === graphId &&
                window.MaterialManager?.materials?.[material.id] === material
            ) {
                try {
                    window.MaterialManager.deleteMaterial(material.id);
                } catch (error) {
                    console.warn(`[Visual Shader Graph] Material ${material.id} could not be released.`, error);
                }
            }
            this.compiledByGraph.delete(graphId);
        },

        registerProjectProperty() {
            if (this.projectProperty || typeof Property === 'undefined') return this.projectProperty;
            const projectClass = typeof ModelProject !== 'undefined'
                ? ModelProject
                : (window.Project?.constructor && window.Project.constructor !== Object ? window.Project.constructor : null);
            if (!projectClass) return null;
            this.projectProperty = new Property(projectClass, 'string', GRAPH_PROJECT_PROPERTY, { default: '', exposed: true });
            return this.projectProperty;
        },

        isBBModelProject(project = window.Project) {
            if (!project) return false;
            const path = String(project.save_path || project.path || '').toLowerCase();
            return path.endsWith('.bbmodel') || window.Format?.id === 'free' || project.format?.id === 'free';
        },

        serializeState() {
            return JSON.stringify({
                format: GRAPH_FORMAT,
                formatVersion: GRAPH_FORMAT_VERSION,
                activeGraphId: this.activeGraphId,
                graphs: this.graphs.map(sanitizeGraph)
            });
        },

        deserializeState(content, options = {}) {
            let parsed = content;
            if (typeof parsed === 'string') {
                if (parsed.length > MAX_PROJECT_GRAPH_BYTES) throw new Error(tr('graph_too_large'));
                parsed = parsed.trim() ? JSON.parse(parsed) : null;
            }
            if (parsed?.format && parsed.format !== GRAPH_FORMAT) throw new Error(tr('invalid_graph_format'));
            if (Number(parsed?.formatVersion || 0) > GRAPH_FORMAT_VERSION) throw new Error(tr('unsupported_graph_version'));
            const graphs = Array.isArray(parsed?.graphs) ? parsed.graphs.map(sanitizeGraph) : [];
            const repairedConnections = graphs.reduce((total, graph) => total + repairPresetParameterConnections(graph), 0);
            const nextGraphIds = new Set(graphs.map(graph => graph.id));
            Array.from(this.compiledByGraph.keys()).forEach(graphId => {
                if (!nextGraphIds.has(graphId)) this.releaseCompiledGraph(graphId);
            });
            this.graphs.splice(0, this.graphs.length, ...graphs);
            graphs.filter(graph => graph.settings?.graphKind === 'subgraph').forEach(graph => this.synchronizeSubgraphInstances(graph.id));
            this.activeGraphId = graphs.some(graph => graph.id === parsed?.activeGraphId)
                ? parsed.activeGraphId
                : graphs[0]?.id || '';
            this.selectedNodeIds = [];
            this.selectedEdgeId = '';
            this.diagnostics = this.activeGraph ? validateGraph(this.activeGraph, { materials: window.MaterialManager?.materials, graphs: this.graphs }) : [];
            this.compileState = 'ready';
            this.compileMessage = '';
            this.lastCompileDuration = 0;
            this.lastCompiledAt = 0;
            this.lastRepairCount = repairedConnections;
            if (options.refresh !== false) this.refresh();
            return graphs;
        },

        save(options = {}) {
            const project = options.project || window.Project;
            if (!project) return false;
            this.registerProjectProperty();
            const serialized = this.serializeState();
            if (serialized.length > MAX_PROJECT_GRAPH_BYTES) {
                Blockbench.showToastNotification({ text: tr('graph_too_large'), icon: 'error', expire: 6000 });
                return false;
            }
            project[GRAPH_PROJECT_PROPERTY] = serialized;
            if (options.markDirty !== false && project.saved !== undefined) project.saved = false;
            if (!this.isBBModelProject(project) && !this.warnedTemporary) {
                this.warnedTemporary = true;
                Blockbench.showToastNotification({ text: tr('non_persistent'), icon: 'info', expire: 6000 });
            }
            Blockbench.dispatchEvent('visual_shader_graph_changed', { cause: options.cause || 'save', graph: this.activeGraph });
            return this.isBBModelProject(project);
        },

        hydrate({ project, model, deferred } = {}) {
            if (this.activeProject && this.activeProject !== project) this.compiledByGraph.clear();
            this.activeProject = project || null;
            this.cancelCompile();
            if (deferred || !project) {
                this.graphs.splice(0);
                this.activeGraphId = '';
                this.selectedNodeIds = [];
                this.diagnostics = [];
                this.refresh();
                return;
            }
            const source = project[GRAPH_PROJECT_PROPERTY] || model?.[GRAPH_PROJECT_PROPERTY] || '';
            try {
                this.deserializeState(source || '', { refresh: true });
                if (source && !project[GRAPH_PROJECT_PROPERTY]) project[GRAPH_PROJECT_PROPERTY] = source;
                this.rebindRegisteredGraphMaterials();
                if (this.lastRepairCount > 0) {
                    this.save({ project, markDirty: true, cause: 'repair_preset_connections' });
                    Blockbench.showQuickMessage(`${this.lastRepairCount} ${tr('preset_connections_repaired')}`, 2600);
                }
            } catch (error) {
                console.warn('[Visual Shader Graph] Project graph data could not be loaded.', error);
                this.graphs.splice(0);
                this.activeGraphId = '';
                this.diagnostics = [{ severity: 'error', code: 'load_failed', message: error.message }];
                this.refresh();
            }
        },

        registerUndoHooks() {
            if (this.undoHooks) return this.undoHooks;
            const create = Blockbench.on('create_undo_save', event => {
                if (!event?.aspects?.[GRAPH_UNDO_ASPECT] || !event.save) return;
                event.save[GRAPH_PROJECT_PROPERTY] = this.serializeState();
            });
            const load = Blockbench.on('load_undo_save', event => {
                if (event?.save?.[GRAPH_PROJECT_PROPERTY] === undefined) return;
                try {
                    this.deserializeState(event.save[GRAPH_PROJECT_PROPERTY]);
                    this.save({ markDirty: false, cause: 'undo' });
                    this.scheduleCompile('undo', 0);
                } catch (error) {
                    console.warn('[Visual Shader Graph] Undo state could not be restored.', error);
                }
            });
            this.undoHooks = {
                delete: () => {
                    create?.delete?.();
                    load?.delete?.();
                    this.undoHooks = null;
                }
            };
            return this.undoHooks;
        },

        runUndo(label, callback, options = {}) {
            const aspects = { [GRAPH_UNDO_ASPECT]: true };
            Undo.initEdit(aspects);
            try {
                const result = callback();
                const graph = this.activeGraph;
                if (graph) {
                    graph.revision = Math.max(0, Number(graph.revision) || 0) + 1;
                    graph.updatedAt = Date.now();
                }
                this.save({ cause: options.cause || 'edit' });
                Undo.finishEdit(label, aspects);
                this.markDirty(options.cause || 'edit', { compile: options.compile !== false });
                return result;
            } catch (error) {
                Undo.cancelEdit(true);
                throw error;
            }
        },

        markDirty(cause = 'edit', options = {}) {
            this.compileState = 'dirty';
            this.compileMessage = '';
            const graph = this.activeGraph;
            if (graph?.settings?.graphKind === 'subgraph') {
                this.propagateSubgraphChange(graph.id);
                if (options.compile !== false) this.scheduleDependentCompiles(graph.id, cause);
            }
            this.diagnostics = graph ? validateGraph(graph, { materials: window.MaterialManager?.materials, graphs: this.graphs }) : [];
            this.refresh();
            if (options.compile !== false && graph?.settings?.livePreview && graph.settings?.graphKind !== 'subgraph') this.scheduleCompile(cause);
        },

        createFromPreset(presetId) {
            const preset = PRESET_DEFINITIONS[presetId] || PRESET_DEFINITIONS.lightflow_surface;
            return this.runUndo('Create visual shader graph', () => {
                const graph = preset.create();
                graph.name = this.uniqueGraphName(graph.name);
                graph.settings.materialId = `${GENERATED_MATERIAL_PREFIX}${safeIdentifier(graph.id, 'graph')}`;
                this.graphs.push(graph);
                this.activeGraphId = graph.id;
                this.selectedNodeIds = [];
                return graph;
            }, { cause: 'create_graph' });
        },

        uniqueGraphName(baseName) {
            const base = String(baseName || 'Shader Graph').slice(0, 90);
            if (!this.graphs.some(graph => graph.name === base)) return base;
            for (let index = 2; index < 10000; index++) {
                const candidate = `${base} ${index}`;
                if (!this.graphs.some(graph => graph.name === candidate)) return candidate;
            }
            return `${base} Copy`;
        },

        setActiveGraph(graphId) {
            if (!this.graphs.some(graph => graph.id === graphId)) return false;
            this.activeGraphId = graphId;
            this.selectedNodeIds = [];
            this.selectedEdgeId = '';
            this.diagnostics = validateGraph(this.activeGraph, { materials: window.MaterialManager?.materials, graphs: this.graphs });
            this.save({ markDirty: false, cause: 'select_graph' });
            this.refresh();
            if (this.activeGraph?.settings?.livePreview && this.activeGraph?.settings?.graphKind !== 'subgraph') this.scheduleCompile('select_graph', 80);
            return true;
        },

        duplicateActiveGraph() {
            const source = this.activeGraph;
            if (!source) return null;
            return this.runUndo('Duplicate visual shader graph', () => {
                const graph = sanitizeGraph(deepClone(source));
                graph.id = makeId('graph');
                graph.name = this.uniqueGraphName(`${source.name} Copy`);
                if (graph.settings.graphKind !== 'subgraph') graph.settings.materialId = `${GENERATED_MATERIAL_PREFIX}${safeIdentifier(graph.id, 'graph')}`;
                const nodeIdMap = new Map();
                graph.nodes.forEach(node => {
                    const previous = node.id;
                    node.id = makeId('node');
                    nodeIdMap.set(previous, node.id);
                });
                graph.edges.forEach(edge => {
                    edge.id = makeId('edge');
                    edge.from.node = nodeIdMap.get(edge.from.node) || edge.from.node;
                    edge.to.node = nodeIdMap.get(edge.to.node) || edge.to.node;
                });
                graph.groups = (graph.groups || []).map(group => ({
                    id: makeId('group'),
                    title: group.title,
                    nodeIds: (group.nodeIds || []).map(nodeId => nodeIdMap.get(nodeId)).filter(Boolean)
                })).filter(group => group.nodeIds.length);
                graph.createdAt = graph.updatedAt = Date.now();
                graph.revision = 0;
                this.graphs.push(graph);
                this.activeGraphId = graph.id;
                this.selectedNodeIds = [];
                return graph;
            }, { cause: 'duplicate_graph' });
        },

        deleteActiveGraph() {
            const graph = this.activeGraph;
            if (!graph) return false;
            if (graph.settings?.graphKind === 'subgraph') {
                const users = this.graphs.filter(candidate => candidate !== graph && candidate.nodes.some(node => node.type === 'subgraph_instance' && node.data?.targetGraphId === graph.id));
                if (users.length) {
                    Blockbench.showToastNotification({ text: `Sub Graph is still used by: ${users.slice(0, 4).map(entry => entry.name).join(', ')}${users.length > 4 ? '…' : ''}`, icon: 'link', expire: 5000 });
                    return false;
                }
            }
            return this.runUndo('Delete visual shader graph', () => {
                const index = this.graphs.indexOf(graph);
                this.graphs.splice(index, 1);
                this.activeGraphId = this.graphs[Math.min(index, this.graphs.length - 1)]?.id || '';
                this.selectedNodeIds = [];
                this.releaseCompiledGraph(graph.id);
                const restoredMaterial = window.MaterialManager?.materials?.[materialIdForGraph(graph)];
                if (restoredMaterial?.isCustom && Number(restoredMaterial.uniforms?.uVSGGraphOwner?.value) === graphOwnerToken(graph.id)) {
                    try {
                        window.MaterialManager.deleteMaterial(restoredMaterial.id);
                    } catch (error) {
                        console.warn(`[Visual Shader Graph] Material ${restoredMaterial.id} could not be released.`, error);
                    }
                }
                return true;
            }, { cause: 'delete_graph', compile: false });
        },

        addNode(type, x, y, data = {}) {
            const graph = this.activeGraph;
            if (!graph || !getNodeDefinition(type)) return null;
            if (graph.settings?.graphKind === 'subgraph' && ['vertex_output', 'surface_output', 'preset_output'].includes(type)) return null;
            if (graph.settings?.graphKind !== 'subgraph' && ['subgraph_input', 'subgraph_output'].includes(type)) return null;
            if (graph.nodes.length >= MAX_GRAPH_NODES) {
                Blockbench.showToastNotification({ text: tr('graph_too_large'), icon: 'error', expire: 5000 });
                return null;
            }
            return this.runUndo('Add shader node', () => {
                const node = createNode(type, snapGraphValue(graph, x), snapGraphValue(graph, y), data);
                graph.nodes.push(node);
                this.selectedNodeIds = [node.id];
                this.selectedEdgeId = '';
                return node;
            }, { cause: 'add_node' });
        },

        removeSelection() {
            const graph = this.activeGraph;
            if (!graph) return false;
            const selected = new Set(this.selectedNodeIds);
            if (!selected.size && !this.selectedEdgeId) return false;
            return this.runUndo('Delete shader graph selection', () => {
                if (selected.size) {
                    for (let index = graph.nodes.length - 1; index >= 0; index--) {
                        if (selected.has(graph.nodes[index].id)) graph.nodes.splice(index, 1);
                    }
                    for (let index = graph.edges.length - 1; index >= 0; index--) {
                        if (selected.has(graph.edges[index].from.node) || selected.has(graph.edges[index].to.node)) graph.edges.splice(index, 1);
                    }
                    graph.groups = (graph.groups || []).map(group => ({ ...group, nodeIds: group.nodeIds.filter(nodeId => !selected.has(nodeId)) })).filter(group => group.nodeIds.length);
                }
                if (this.selectedEdgeId) {
                    const edgeIndex = graph.edges.findIndex(edge => edge.id === this.selectedEdgeId);
                    if (edgeIndex >= 0) graph.edges.splice(edgeIndex, 1);
                }
                this.selectedNodeIds = [];
                this.selectedEdgeId = '';
                return true;
            }, { cause: 'delete_selection' });
        },

        disconnectEdges(predicate, label = 'Disconnect shader nodes') {
            const graph = this.activeGraph;
            if (!graph) return 0;
            const matches = graph.edges.filter(predicate);
            if (!matches.length) return 0;
            const ids = new Set(matches.map(edge => edge.id));
            this.runUndo(label, () => {
                for (let index = graph.edges.length - 1; index >= 0; index--) {
                    if (ids.has(graph.edges[index].id)) graph.edges.splice(index, 1);
                }
                if (ids.has(this.selectedEdgeId)) this.selectedEdgeId = '';
            }, { cause: 'disconnect_nodes' });
            return matches.length;
        },

        disconnectPort(nodeId, portId, direction) {
            const kind = direction === 'input' ? 'input' : direction === 'output' ? 'output' : 'both';
            return this.disconnectEdges(edge => (
                (kind !== 'output' && edge.to.node === nodeId && edge.to.port === portId) ||
                (kind !== 'input' && edge.from.node === nodeId && edge.from.port === portId)
            ), 'Disconnect shader port');
        },

        disconnectNode(nodeId) {
            return this.disconnectEdges(edge => edge.from.node === nodeId || edge.to.node === nodeId, 'Disconnect shader node');
        },

        disconnectEdge(edgeId) {
            return this.disconnectEdges(edge => edge.id === edgeId, 'Disconnect shader connection');
        },

        canConnect(fromNode, fromPort, toNode, toPort) {
            const graph = this.activeGraph;
            if (!graph || fromNode === toNode) return false;
            const ports = nodePortMap(graph, window.MaterialManager?.materials);
            const sourceEntry = ports.get(fromNode);
            const targetEntry = ports.get(toNode);
            const source = sourceEntry?.outputs.get(fromPort);
            const target = targetEntry?.inputs.get(toPort);
            const resolvedSourceType = source?.type === 'any'
                ? createGraphTypeResolver(graph, window.MaterialManager?.materials)(fromNode, fromPort)
                : source?.type;
            return !!(source && target && canConnectResolvedTypes(resolvedSourceType, targetEntry.node, target));
        },

        connect(fromNode, fromPort, toNode, toPort) {
            const graph = this.activeGraph;
            if (!graph || !this.canConnect(fromNode, fromPort, toNode, toPort)) return false;
            const replacesExistingInput = graph.edges.some(edge => edge.to.node === toNode && edge.to.port === toPort);
            if (graph.edges.length >= MAX_GRAPH_EDGES && !replacesExistingInput) {
                Blockbench.showToastNotification({ text: tr('graph_too_large'), icon: 'error', expire: 5000 });
                return false;
            }
            return this.runUndo('Connect shader nodes', () => {
                for (let index = graph.edges.length - 1; index >= 0; index--) {
                    const edge = graph.edges[index];
                    if (edge.to.node === toNode && edge.to.port === toPort) graph.edges.splice(index, 1);
                }
                graph.edges.push(createEdge(fromNode, fromPort, toNode, toPort));
                return true;
            }, { cause: 'connect_nodes' });
        },

        copySelection() {
            const graph = this.activeGraph;
            if (!graph || !this.selectedNodeIds.length) return false;
            const selected = new Set(this.selectedNodeIds);
            this.clipboard = {
                nodes: deepClone(graph.nodes.filter(node => selected.has(node.id))),
                edges: deepClone(graph.edges.filter(edge => selected.has(edge.from.node) && selected.has(edge.to.node))),
                groups: deepClone((graph.groups || []).filter(group => group.nodeIds.length && group.nodeIds.every(nodeId => selected.has(nodeId))))
            };
            return true;
        },

        pasteSelection(offset = 40) {
            const graph = this.activeGraph;
            if (!graph || !this.clipboard?.nodes?.length) return false;
            if (
                graph.nodes.length + this.clipboard.nodes.length > MAX_GRAPH_NODES ||
                graph.edges.length + (this.clipboard.edges?.length || 0) > MAX_GRAPH_EDGES
            ) {
                Blockbench.showToastNotification({ text: tr('graph_too_large'), icon: 'error', expire: 5000 });
                return false;
            }
            return this.runUndo('Paste shader nodes', () => {
                const nodeMap = new Map();
                const nodes = this.clipboard.nodes.map(source => {
                    const node = deepClone(source);
                    const oldId = node.id;
                    node.id = makeId('node');
                    node.x = snapGraphValue(graph, node.x + offset);
                    node.y = snapGraphValue(graph, node.y + offset);
                    nodeMap.set(oldId, node.id);
                    return node;
                });
                const edges = this.clipboard.edges.map(source => ({
                    id: makeId('edge'),
                    from: { node: nodeMap.get(source.from.node), port: source.from.port },
                    to: { node: nodeMap.get(source.to.node), port: source.to.port }
                })).filter(edge => edge.from.node && edge.to.node);
                const groups = (this.clipboard.groups || []).map(source => ({
                    id: makeId('group'),
                    title: source.title || 'Group',
                    nodeIds: (source.nodeIds || []).map(nodeId => nodeMap.get(nodeId)).filter(Boolean)
                })).filter(group => group.nodeIds.length);
                graph.nodes.push(...nodes);
                graph.edges.push(...edges);
                graph.groups.push(...groups);
                this.selectedNodeIds = nodes.map(node => node.id);
                return true;
            }, { cause: 'paste_nodes' });
        },

        duplicateSelection() {
            if (!this.copySelection()) return false;
            return this.pasteSelection(34);
        },

        getDependentGraphs(targetGraphId) {
            const result = [];
            const seen = new Set([targetGraphId]);
            const queue = [targetGraphId];
            while (queue.length) {
                const targetId = queue.shift();
                this.graphs.forEach(graph => {
                    if (seen.has(graph.id)) return;
                    if (!graph.nodes.some(node => node.type === 'subgraph_instance' && node.data?.targetGraphId === targetId)) return;
                    seen.add(graph.id);
                    result.push(graph);
                    queue.push(graph.id);
                });
            }
            return result;
        },

        synchronizeSubgraphInstances(targetGraphId) {
            const target = this.graphs.find(graph => graph.id === targetGraphId && graph.settings?.graphKind === 'subgraph');
            if (!target) return [];
            const iface = getSubgraphInterface(target);
            const touched = [];
            this.graphs.forEach(graph => {
                let changed = false;
                graph.nodes.forEach(node => {
                    if (node.type !== 'subgraph_instance' || node.data?.targetGraphId !== targetGraphId) return;
                    node.data.targetGraphName = target.name;
                    node.data.inputs = deepClone(iface.inputs.map(({ nodeId, ...entry }) => entry));
                    node.data.outputs = deepClone(iface.outputs.map(({ nodeId, ...entry }) => entry));
                    const allowedInputs = new Set(node.data.inputs.map(entry => `in:${entry.id}`));
                    const allowedOutputs = new Set(node.data.outputs.map(entry => `out:${entry.id}`));
                    for (let index = graph.edges.length - 1; index >= 0; index--) {
                        const edge = graph.edges[index];
                        if (edge.to.node === node.id && !allowedInputs.has(edge.to.port)) graph.edges.splice(index, 1);
                        else if (edge.from.node === node.id && !allowedOutputs.has(edge.from.port)) graph.edges.splice(index, 1);
                    }
                    changed = true;
                });
                if (changed) touched.push(graph);
            });
            return touched;
        },

        propagateSubgraphChange(targetGraphId) {
            this.synchronizeSubgraphInstances(targetGraphId);
            const dependents = this.getDependentGraphs(targetGraphId);
            dependents.forEach(graph => {
                graph.revision = Math.max(0, Number(graph.revision) || 0) + 1;
                graph.updatedAt = Date.now();
                this.releaseCompiledGraph(graph.id);
            });
            return dependents;
        },

        createSubgraph(name = 'Sub Graph') {
            return this.runUndo('Create Sub Graph', () => {
                const graph = createGraph(this.uniqueGraphName(name), { withOutput: false, graphKind: 'subgraph', livePreview: false });
                graph.nodes.push(createNode('subgraph_input', 80, 160, { name: 'Input', valueType: 'float', portId: 'input' }));
                graph.nodes.push(createNode('subgraph_output', 520, 160, { name: 'Output', valueType: 'float', portId: 'output' }));
                this.graphs.push(graph);
                this.activeGraphId = graph.id;
                this.selectedNodeIds = [];
                return graph;
            }, { cause: 'create_subgraph', compile: false });
        },

        createSubgraphInstance(targetGraphId, x, y) {
            const graph = this.activeGraph;
            const target = this.graphs.find(entry => entry.id === targetGraphId && entry.settings?.graphKind === 'subgraph');
            if (!graph || !target || graph.id === target.id) return null;
            const iface = getSubgraphInterface(target);
            return this.addNode('subgraph_instance', x, y, {
                targetGraphId: target.id,
                targetGraphName: target.name,
                inputs: iface.inputs.map(({ nodeId, ...entry }) => entry),
                outputs: iface.outputs.map(({ nodeId, ...entry }) => entry)
            });
        },

        createSubgraphFromSelection() {
            const graph = this.activeGraph;
            if (!graph || graph.settings?.graphKind === 'subgraph' || !this.selectedNodeIds.length) return null;
            const selected = new Set(this.selectedNodeIds);
            const selectedNodes = graph.nodes.filter(node => selected.has(node.id) && !['vertex_output', 'surface_output', 'preset_output'].includes(node.type));
            if (!selectedNodes.length || selectedNodes.length !== selected.size) {
                Blockbench.showQuickMessage('Select only regular shader nodes to create a Sub Graph.', 2600);
                return null;
            }
            const materials = window.MaterialManager?.materials;
            const resolveType = createGraphTypeResolver(graph, materials);
            const nodeById = new Map(graph.nodes.map(node => [node.id, node]));
            const minX = Math.min(...selectedNodes.map(node => node.x));
            const minY = Math.min(...selectedNodes.map(node => node.y));
            const incoming = graph.edges.filter(edge => !selected.has(edge.from.node) && selected.has(edge.to.node));
            const outgoing = graph.edges.filter(edge => selected.has(edge.from.node) && !selected.has(edge.to.node));
            const internal = graph.edges.filter(edge => selected.has(edge.from.node) && selected.has(edge.to.node));
            return this.runUndo('Create Sub Graph from selection', () => {
                const subgraph = createGraph(this.uniqueGraphName('Sub Graph'), { withOutput: false, graphKind: 'subgraph', livePreview: false });
                const nodeMap = new Map();
                selectedNodes.forEach(source => {
                    const clone = deepClone(source);
                    clone.id = makeId('node');
                    clone.x = source.x - minX + 240;
                    clone.y = source.y - minY + 80;
                    nodeMap.set(source.id, clone.id);
                    subgraph.nodes.push(clone);
                });
                internal.forEach(edge => subgraph.edges.push({
                    id: makeId('edge'),
                    from: { node: nodeMap.get(edge.from.node), port: edge.from.port },
                    to: { node: nodeMap.get(edge.to.node), port: edge.to.port }
                }));

                const inputInterface = [];
                incoming.forEach((edge, index) => {
                    const targetNode = nodeById.get(edge.to.node);
                    const targetPort = getNodeInputPorts(targetNode, materials).find(port => port.id === edge.to.port);
                    const sourceNode = nodeById.get(edge.from.node);
                    const sourcePort = getNodeOutputPorts(sourceNode).find(port => port.id === edge.from.port);
                    const type = normalizeSubgraphPortType(targetPort?.type === 'any' ? resolveType(edge.from.node, edge.from.port) : (targetPort?.type || sourcePort?.type));
                    const portId = `input_${index + 1}`;
                    const name = String(targetPort?.name || sourcePort?.name || `Input ${index + 1}`).slice(0, 96);
                    const defaultValue = deepClone(targetNode?.inputValues?.[edge.to.port] ?? targetPort?.default ?? defaultSubgraphValue(type));
                    const ifaceNode = createNode('subgraph_input', 20, 80 + index * 110, { portId, name, valueType: type, defaultValue });
                    subgraph.nodes.push(ifaceNode);
                    subgraph.edges.push(createEdge(ifaceNode.id, 'out', nodeMap.get(edge.to.node), edge.to.port));
                    inputInterface.push({ edge, portId, name, type, defaultValue });
                });

                const outputKeys = new Map();
                outgoing.forEach(edge => {
                    const key = `${edge.from.node}:${edge.from.port}`;
                    if (!outputKeys.has(key)) outputKeys.set(key, []);
                    outputKeys.get(key).push(edge);
                });
                const outputInterface = [];
                Array.from(outputKeys.entries()).forEach(([key, edges], index) => {
                    const edge = edges[0];
                    const sourceNode = nodeById.get(edge.from.node);
                    const sourcePort = getNodeOutputPorts(sourceNode).find(port => port.id === edge.from.port);
                    const type = normalizeSubgraphPortType(sourcePort?.type === 'any' ? resolveType(edge.from.node, edge.from.port) : sourcePort?.type);
                    const portId = `output_${index + 1}`;
                    const name = String(sourcePort?.name || `Output ${index + 1}`).slice(0, 96);
                    const defaultValue = defaultSubgraphValue(type);
                    const ifaceNode = createNode('subgraph_output', 720, 80 + index * 110, { portId, name, valueType: type, defaultValue });
                    subgraph.nodes.push(ifaceNode);
                    subgraph.edges.push(createEdge(nodeMap.get(edge.from.node), edge.from.port, ifaceNode.id, 'in'));
                    outputInterface.push({ key, edges, portId, name, type, defaultValue });
                });
                this.graphs.push(subgraph);
                const iface = getSubgraphInterface(subgraph);
                const instance = createNode('subgraph_instance', snapGraphValue(graph, minX), snapGraphValue(graph, minY), {
                    targetGraphId: subgraph.id,
                    targetGraphName: subgraph.name,
                    inputs: iface.inputs.map(({ nodeId, ...entry }) => entry),
                    outputs: iface.outputs.map(({ nodeId, ...entry }) => entry)
                });
                graph.nodes = graph.nodes.filter(node => !selected.has(node.id));
                graph.edges = graph.edges.filter(edge => !selected.has(edge.from.node) && !selected.has(edge.to.node));
                graph.groups = (graph.groups || []).map(group => ({ ...group, nodeIds: group.nodeIds.filter(nodeId => !selected.has(nodeId)) })).filter(group => group.nodeIds.length);
                graph.nodes.push(instance);
                inputInterface.forEach(entry => graph.edges.push(createEdge(entry.edge.from.node, entry.edge.from.port, instance.id, `in:${entry.portId}`)));
                outputInterface.forEach(entry => entry.edges.forEach(edge => graph.edges.push(createEdge(instance.id, `out:${entry.portId}`, edge.to.node, edge.to.port))));
                this.selectedNodeIds = [instance.id];
                this.selectedEdgeId = '';
                return subgraph;
            }, { cause: 'create_subgraph_from_selection' });
        },

        groupSelection(title = 'Group') {
            const graph = this.activeGraph;
            if (!graph || !this.selectedNodeIds.length) return null;
            const selected = new Set(this.selectedNodeIds);
            return this.runUndo('Group shader nodes', () => {
                graph.groups = (graph.groups || []).map(group => ({ ...group, nodeIds: group.nodeIds.filter(nodeId => !selected.has(nodeId)) })).filter(group => group.nodeIds.length);
                const group = { id: makeId('group'), title: String(title || 'Group').slice(0, 96), nodeIds: [...selected] };
                graph.groups.push(group);
                return group;
            }, { cause: 'group_nodes', compile: false });
        },

        ungroupSelection() {
            const graph = this.activeGraph;
            if (!graph || !this.selectedNodeIds.length) return false;
            const selected = new Set(this.selectedNodeIds);
            return this.runUndo('Ungroup shader nodes', () => {
                graph.groups = (graph.groups || []).map(group => ({ ...group, nodeIds: group.nodeIds.filter(nodeId => !selected.has(nodeId)) })).filter(group => group.nodeIds.length);
                return true;
            }, { cause: 'ungroup_nodes', compile: false });
        },

        autoLayoutSelection() {
            const graph = this.activeGraph;
            if (!graph?.nodes?.length) return false;
            const selection = new Set(this.selectedNodeIds);
            const nodes = selection.size ? graph.nodes.filter(node => selection.has(node.id)) : graph.nodes.slice();
            const ids = new Set(nodes.map(node => node.id));
            const edges = graph.edges.filter(edge => ids.has(edge.from.node) && ids.has(edge.to.node));
            const incoming = new Map(nodes.map(node => [node.id, 0]));
            const outgoing = new Map(nodes.map(node => [node.id, []]));
            edges.forEach(edge => {
                incoming.set(edge.to.node, (incoming.get(edge.to.node) || 0) + 1);
                outgoing.get(edge.from.node)?.push(edge.to.node);
            });
            const ranks = new Map(nodes.map(node => [node.id, 0]));
            const queue = nodes.filter(node => (incoming.get(node.id) || 0) === 0).sort((a, b) => a.y - b.y);
            const processed = new Set();
            while (queue.length) {
                const node = queue.shift();
                processed.add(node.id);
                (outgoing.get(node.id) || []).forEach(targetId => {
                    ranks.set(targetId, Math.max(ranks.get(targetId) || 0, (ranks.get(node.id) || 0) + 1));
                    incoming.set(targetId, incoming.get(targetId) - 1);
                    if (incoming.get(targetId) === 0) queue.push(nodes.find(entry => entry.id === targetId));
                });
            }
            nodes.filter(node => !processed.has(node.id)).forEach((node, index) => ranks.set(node.id, Math.max(0, Math.round((node.x - Math.min(...nodes.map(n => n.x))) / 320)) + index % 2));
            const columns = new Map();
            nodes.forEach(node => {
                const rank = ranks.get(node.id) || 0;
                if (!columns.has(rank)) columns.set(rank, []);
                columns.get(rank).push(node);
            });
            const originX = Math.min(...nodes.map(node => node.x));
            const originY = Math.min(...nodes.map(node => node.y));
            return this.runUndo('Auto layout shader graph', () => {
                Array.from(columns.entries()).sort((a, b) => a[0] - b[0]).forEach(([rank, column]) => {
                    column.sort((a, b) => a.y - b.y);
                    let y = originY;
                    column.forEach(node => {
                        node.x = snapGraphValue(graph, originX + rank * 320);
                        node.y = snapGraphValue(graph, y);
                        y += nodeVisualHeight(node, window.MaterialManager?.materials) + 54;
                    });
                });
            }, { cause: 'auto_layout', compile: false });
        },

        toggleSnapToGrid() {
            const graph = this.activeGraph;
            if (!graph) return false;
            return this.runUndo('Toggle shader graph grid snapping', () => {
                graph.settings.snapToGrid = !graph.settings.snapToGrid;
                if (graph.settings.snapToGrid) graph.nodes.forEach(node => snapNodePosition(graph, node));
                return graph.settings.snapToGrid;
            }, { cause: 'snap_grid', compile: false });
        },

        cancelCompile() {
            if (this.compileTimer) clearTimeout(this.compileTimer);
            this.compileTimer = null;
        },

        scheduleDependentCompiles(targetGraphId, cause = 'subgraph_edit', delay = 240) {
            if (this.dependencyCompileTimer) clearTimeout(this.dependencyCompileTimer);
            this.dependencyCompileTimer = setTimeout(() => {
                this.dependencyCompileTimer = null;
                this.getDependentGraphs(targetGraphId).filter(graph => graph.settings?.graphKind !== 'subgraph').forEach(graph => {
                    try {
                        const material = this.compileMaterialGraph(graph);
                        if (material && window.ShaderEngine?.globalRenderMode === material.id) window.ShaderEngine.updateAllCubes?.(`visual_shader_graph_${cause}`);
                    } catch (error) {
                        console.warn(`[Visual Shader Graph] Dependent graph ${graph.name} could not be recompiled.`, error);
                    }
                });
            }, Math.max(0, delay));
        },

        compileMaterialGraph(graph) {
            if (!graph || graph.settings?.graphKind === 'subgraph') return null;
            const compiled = compileGraph(graph, { materials: window.MaterialManager?.materials || {}, graphs: this.graphs });
            const material = createRuntimeMaterial(compiled);
            const replacedMaterial = window.MaterialManager.materials[material.id];
            window.MaterialManager.register(material);
            if (replacedMaterial) Blockbench.dispatchEvent('update_global_material_list', { cause: 'visual_shader_graph_compile', action: 'update', materialId: material.id });
            this.compiledByGraph.set(graph.id, { compiled, material, revision: graph.revision });
            return material;
        },

        scheduleCompile(cause = 'edit', delay = 220) {
            this.cancelCompile();
            if (this.activeGraph?.settings?.graphKind === 'subgraph') return;
            const graphId = this.activeGraphId;
            const revision = this.activeGraph?.revision;
            this.compileTimer = setTimeout(() => {
                this.compileTimer = null;
                if (this.disposed || graphId !== this.activeGraphId || revision !== this.activeGraph?.revision) return;
                this.compileActive({ cause, apply: 'global', silent: true });
            }, Math.max(0, delay));
        },

        compileActive(options = {}) {
            const graph = this.activeGraph;
            if (!graph) return null;
            this.cancelCompile();
            const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
            this.compileState = 'compiling';
            this.compileMessage = '';
            this.refresh();
            try {
                if (graph.settings?.graphKind === 'subgraph') {
                    this.diagnostics = validateGraph(graph, { materials: window.MaterialManager?.materials || {}, graphs: this.graphs });
                    const errors = this.diagnostics.filter(message => message.severity === 'error');
                    if (errors.length) {
                        const failure = new Error(errors[0].message || 'Sub Graph validation failed.');
                        failure.messages = this.diagnostics;
                        throw failure;
                    }
                    this.compileState = 'compiled';
                    this.compileMessage = 'Sub Graph validated.';
                    this.lastCompileDuration = Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt));
                    this.lastCompiledAt = Date.now();
                    this.refresh();
                    if (!options.silent) Blockbench.showQuickMessage('Sub Graph validated.', 1600);
                    return null;
                }
                const material = this.compileMaterialGraph(graph);
                const compiled = this.compiledByGraph.get(graph.id)?.compiled;
                this.diagnostics = compiled?.messages || [];
                this.compileState = 'compiled';
                this.compileMessage = tr('compile_success');
                this.lastCompileDuration = Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt));
                this.lastCompiledAt = Date.now();
                if (options.apply === 'selection') this.applyMaterialToSelection(material, { silent: !!options.silent });
                else if (options.apply === 'global') this.applyMaterialGlobally(material, { silent: !!options.silent });
                this.refresh();
                if (!options.silent) Blockbench.showQuickMessage(tr('compile_success'), 1800);
                return material;
            } catch (error) {
                this.diagnostics = error.messages || [{ severity: 'error', code: 'compile_error', message: error.message || tr('compile_failed') }];
                this.compileState = 'error';
                this.compileMessage = error.message || tr('compile_failed');
                this.lastCompileDuration = Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt));
                this.refresh();
                if (!options.silent) Blockbench.showToastNotification({ text: this.compileMessage, icon: 'error', expire: 6000 });
                console.warn('[Visual Shader Graph] Compilation failed.', error);
                return null;
            }
        },

        getCompiledMaterial(graph = this.activeGraph) {
            if (!graph) return null;
            const cached = this.compiledByGraph.get(graph.id);
            if (cached?.revision === graph.revision) return cached.material;
            const registered = window.MaterialManager?.materials?.[materialIdForGraph(graph)];
            return registered?.vsgGraphId === graph.id && registered?.vsgGraphRevision === graph.revision
                ? registered
                : null;
        },

        rebindRegisteredGraphMaterials() {
            /*
                Shader Architect persists custom materials through
                FancyShaderMaterial.toJSON(), which drops VSG's own fields.
                After a project reload, re-stamp ownership, the preset base
                identity and the render state so structural program compilers
                keep claiming preset clones and getCompiledMaterial() accepts
                the restored material without a forced recompile.
            */
            this.graphs.forEach(graph => {
                const material = window.MaterialManager?.materials?.[materialIdForGraph(graph)];
                if (!material || Number(material.uniforms?.uVSGGraphOwner?.value) !== graphOwnerToken(graph.id)) return;
                const presetOutput = graph.nodes.find(node => node.type === 'preset_output');
                const baseMaterialId = presetOutput?.data?.baseMaterialId;
                if (presetOutput && baseMaterialId && window.MaterialManager?.materials?.[baseMaterialId]) {
                    material.baseMaterialId = baseMaterialId;
                } else {
                    delete material.baseMaterialId;
                }
                material.vsgGraphId = graph.id;
                material.vsgGraphRevision = graph.revision;
                const settings = compileGraphRenderState(graph, presetOutput);
                if (settings) material.vsgRenderState = settings;
            });
        },

        applyMaterialGlobally(material = this.getCompiledMaterial(), options = {}) {
            if (!material || !window.ShaderEngine) return false;
            const engine = window.ShaderEngine;
            const alreadyActive = engine.globalRenderMode === material.id;
            engine.activateLightflowViewMode?.('visual_shader_graph_global');
            if (alreadyActive) {
                // Registering a new material under the same graph ID does not trigger
                // Shader Architect's global-mode transition. Rebind every live mesh so
                // it receives the newly compiled shader and uniforms immediately.
                engine.updateAllCubes('visual_shader_graph_recompile');
            } else {
                const queued = engine.requestGlobalRenderModeChange(material.id);
                if (!queued) {
                    engine.globalRenderMode = material.id;
                    engine.updateAllCubes('visual_shader_graph_apply');
                }
            }
            if (!options.silent) Blockbench.showQuickMessage(tr('apply_success'), 1800);
            return true;
        },

        getSelectedRenderableElements() {
            const result = [];
            // window.BedrockBlockElement is published by Bedrock Structure
            // Studio; when absent the entry is simply skipped.
            [window.Cube, window.Mesh, window.TextureMesh, window.BedrockBlockElement].forEach(ElementType => {
                if (Array.isArray(ElementType?.selected)) result.push(...ElementType.selected);
            });
            return [...new Set(result)];
        },

        applyMaterialToSelection(material = this.getCompiledMaterial(), options = {}) {
            if (!material || !window.ShaderEngine) return false;
            const elements = this.getSelectedRenderableElements();
            if (!elements.length) {
                if (!options.silent) Blockbench.showQuickMessage(tr('select_elements'), 2400);
                return false;
            }
            Undo.initEdit({ elements });
            elements.forEach(element => {
                element.sa_material_id = material.id;
                element.sa_material_instance_id = '';
            });
            Undo.finishEdit('Apply visual shader graph', { elements });
            window.ShaderEngine.activateLightflowViewMode('visual_shader_graph_selection');
            window.ShaderEngine.updateCubes(elements, 'visual_shader_graph_selection');
            if (!options.silent) Blockbench.showQuickMessage(tr('apply_success'), 1800);
            return true;
        },

        dispose() {
            this.disposed = true;
            this.cancelCompile();
            this.views.clear();
            try { this.undoHooks?.delete?.(); } catch (error) { console.warn('[Visual Shader Graph] Undo hooks could not be released.', error); }
            try { this.hydrationHandle?.delete?.(); } catch (error) { console.warn('[Visual Shader Graph] Hydration could not be released.', error); }
            this.undoHooks = null;
            this.hydrationHandle = null;
            Array.from(this.compiledByGraph.keys()).forEach(graphId => this.releaseCompiledGraph(graphId));
            this.compiledByGraph.clear();
            this.graphs.splice(0);
            this.activeGraphId = '';
            this.selectedNodeIds = [];
            this.selectedEdgeId = '';
            this.clipboard = null;
            this.diagnostics = [];
            this.compileState = 'ready';
            this.compileMessage = '';
            this.lastCompileDuration = 0;
            this.lastCompiledAt = 0;
            this.lastRepairCount = 0;
            this.projectProperty = null;
            this.activeProject = null;
            this.warnedTemporary = false;
        }
    };

    function materializeUniformValue(definition, value) {
        const type = definition?.type;
        if (value === null || value === undefined) return value;
        if (type === 'bool') return !!value;
        if (type === 'int') return Math.round(Number(value) || 0);
        if (type === 'float') return Number(value) || 0;
        if (type === 'vec2') return value instanceof THREE.Vector2 ? value.clone() : new THREE.Vector2(value[0] ?? value.x ?? 0, value[1] ?? value.y ?? 0);
        if (type === 'vec3' || type === 'color') return value instanceof THREE.Vector3 ? value.clone() : new THREE.Vector3(value[0] ?? value.x ?? value.r ?? 0, value[1] ?? value.y ?? value.g ?? 0, value[2] ?? value.z ?? value.b ?? 0);
        if (type === 'vec4') return value instanceof THREE.Vector4 ? value.clone() : new THREE.Vector4(value[0] ?? value.x ?? 0, value[1] ?? value.y ?? 0, value[2] ?? value.z ?? 0, value[3] ?? value.w ?? 1);
        if (type === 'mat3') return value instanceof THREE.Matrix3 ? value.clone() : new THREE.Matrix3();
        if (type === 'vec3v') return (value || []).map(entry => materializeUniformValue({ type: 'vec3' }, entry));
        if (type === 'floatv') return (value || []).map(entry => Number(entry) || 0);
        if (type === 'intv') return (value || []).map(entry => Math.round(Number(entry) || 0));
        if (Array.isArray(value)) return value.slice();
        return value;
    }

    function materializeUniformMap(source) {
        const uniforms = {};
        Object.entries(source || {}).forEach(([name, sourceDefinition]) => {
            const definition = window.MaterialManager?.cloneUniformDefinition
                ? window.MaterialManager.cloneUniformDefinition(sourceDefinition)
                : Object.assign({}, sourceDefinition);
            definition.value = materializeUniformValue(definition, sourceDefinition?.value);
            if (definition.is_color || definition.type === 'color') {
                definition.type = 'vec3';
                definition.is_color = true;
                definition.hexValue = definition.hexValue || colorArrayToHex(serializeUniformValue(definition.value));
            }
            uniforms[name] = definition;
        });
        return uniforms;
    }

    function applyPresetOverrides(uniforms, overrides) {
        Object.entries(overrides || {}).forEach(([name, value]) => {
            const definition = uniforms[name];
            if (!definition) return;
            definition.value = materializeUniformValue(definition, value);
            if (definition.is_color || definition.type === 'color') {
                const hex = colorArrayToHex(serializeUniformValue(definition.value));
                window.MaterialManager?.syncColorUniformValue?.(definition, hex);
            }
        });
        return uniforms;
    }

    function createRuntimeMaterial(compiled) {
        let uniforms = materializeUniformMap(compiled.uniforms);
        if (compiled.kind === 'preset') uniforms = applyPresetOverrides(uniforms, compiled.overrides);
        uniforms.uVSGGraphOwner = { type: 'float', value: graphOwnerToken(compiled.graphId), expose: false };
        const material = new window.FancyShaderMaterial({
            id: compiled.materialId,
            name: `[Graph] ${compiled.name}`,
            icon: compiled.kind === 'preset' ? 'account_tree' : 'schema',
            isCustom: true,
            vertex: compiled.vertex,
            fragment: compiled.fragment,
            uniforms,
            enableShadows: !!compiled.enableShadows,
            supportsScreenSpaceReflections: !!compiled.supportsScreenSpaceReflections
        });
        if (compiled.kind === 'preset' && compiled.baseMaterialId && window.MaterialManager?.materials?.[compiled.baseMaterialId]) {
            /*
                Shader Architect's structural program compilers (Rendercraft v4,
                PBR v3, Lightflow Surface v1) key off `shader.baseMaterialId ||
                shader.id`. Preset materials keep the base identity so the raw
                cloned sources — which store markers like
                SA_LIGHTFLOW_COLOR_OUTPUT instead of a resolved gl_FragColor
                write — get assembled by the same pipeline as the base preset.
            */
            material.baseMaterialId = compiled.baseMaterialId;
        }
        material.vsgGraphId = compiled.graphId;
        material.vsgGraphRevision = compiled.graphRevision;
        material.vsgRenderState = {
            doubleSided: !!compiled.doubleSided,
            depthWrite: compiled.depthWrite !== false,
            transparent: !!compiled.transparent
        };
        return material;
    }

    function applyGraphRenderStateToMaterial(material) {
        if (!material) return;
        const shaderId = material.sa_shader_id || material.name?.replace(/^SA_/, '').split('_')[0];
        let definition = window.MaterialManager?.materials?.[shaderId];
        let graphId = definition?.vsgGraphId;
        if (!graphId) {
            /*
                Preset clones carry the base material's id as sa_shader_id, so
                resolve ownership through the uVSGGraphOwner token the compiled
                material stamped into its uniforms instead.
            */
            const ownerToken = Number(material.uniforms?.uVSGGraphOwner?.value);
            if (Number.isFinite(ownerToken)) {
                const graph = Runtime.graphs.find(entry => graphOwnerToken(entry.id) === ownerToken);
                if (graph) {
                    graphId = graph.id;
                    definition = window.MaterialManager?.materials?.[materialIdForGraph(graph)];
                }
            }
        }
        const graph = graphId && Runtime.graphs.find(entry => entry.id === graphId);
        const state = definition?.vsgRenderState;
        if (!state || !graph) return;
        material.side = state.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
        material.depthWrite = graph.settings.alphaMode === 'additive' ? false : state.depthWrite;
        material.transparent = graph.settings.alphaMode === 'blend' || graph.settings.alphaMode === 'additive' || state.transparent;
        material.blending = graph.settings.alphaMode === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending;
        material.needsUpdate = true;
    }

    function applyGraphRenderStateToScene(mesh) {
        const visitMaterial = material => {
            if (Array.isArray(material)) material.forEach(visitMaterial);
            else applyGraphRenderStateToMaterial(material);
        };
        if (mesh) visitMaterial(mesh.material);
        else window.Canvas?.scene?.traverse?.(object => visitMaterial(object.material));
    }

    function getPortTypeColor(type) {
        return TYPE_META[type]?.color || TYPE_META.any.color;
    }

    function nodeVisualWidth(node) {
        return clampNumber(node?.width, 140, 520, getNodeDefinition(node?.type)?.width || 210);
    }

    function nodeVisualHeight(node, materials) {
        const rows = Math.max(getNodeInputPorts(node, materials).length, getNodeOutputPorts(node).length, 1);
        return 82 + rows * 32;
    }

    function snapGraphValue(graph, value) {
        const number = Number(value) || 0;
        if (!graph?.settings?.snapToGrid) return Math.round(number);
        const grid = clampNumber(graph.settings.gridSize, 8, 64, 20);
        return Math.round(number / grid) * grid;
    }

    function snapNodePosition(graph, node) {
        if (!node) return node;
        node.x = snapGraphValue(graph, node.x);
        node.y = snapGraphValue(graph, node.y);
        return node;
    }

    function graphGroupBounds(graph, group, materials = window.MaterialManager?.materials) {
        const ids = new Set(group?.nodeIds || []);
        const nodes = (graph?.nodes || []).filter(node => ids.has(node.id));
        if (!nodes.length) return null;
        const left = Math.min(...nodes.map(node => node.x));
        const top = Math.min(...nodes.map(node => node.y));
        const right = Math.max(...nodes.map(node => node.x + nodeVisualWidth(node)));
        const bottom = Math.max(...nodes.map(node => node.y + nodeVisualHeight(node, materials)));
        return { x: left - 28, y: top - 48, width: right - left + 56, height: bottom - top + 76 };
    }

    function nodePortX(node, kind) {
        return node.x + (kind === 'output' ? nodeVisualWidth(node) - 7 : 7);
    }

    function nodePortY(node, portId, kind, materials) {
        const ports = kind === 'input' ? getNodeInputPorts(node, materials) : getNodeOutputPorts(node);
        const index = Math.max(0, ports.findIndex(entry => entry.id === portId));
        return node.y + 64 + index * 32 + 16;
    }

    function graphPointFromClient(graph, element, clientX, clientY) {
        const rect = element.getBoundingClientRect();
        return {
            x: (clientX - rect.left - graph.viewport.x) / graph.viewport.zoom,
            y: (clientY - rect.top - graph.viewport.y) / graph.viewport.zoom
        };
    }

    function fieldValueAsText(value) {
        if (Array.isArray(value)) return value.map(entry => Number(entry).toFixed(3).replace(/\.0+$/, '')).join(', ');
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (value === null || value === undefined) return '';
        return String(value);
    }

    function parseFieldValue(text, type, fallback) {
        if (type === 'bool') return text === true || text === 'true' || text === '1';
        if (['vec2', 'vec3', 'vec4', 'color'].includes(type)) {
            const length = type === 'vec2' ? 2 : type === 'vec4' ? 4 : 3;
            const parts = String(text).split(/[\s,]+/).filter(Boolean).map(Number);
            if (!parts.length || parts.some(value => !Number.isFinite(value))) return deepClone(fallback);
            return Array.from({ length }, (_, index) => parts[index] ?? parts[0] ?? (index === 3 ? 1 : 0));
        }
        const number = Number(text);
        return Number.isFinite(number) ? number : fallback;
    }

    function showPresetMenu(target) {
        const exact = Object.entries(PRESET_DEFINITIONS).filter(([, preset]) => preset.family === 'exact');
        const native = Object.entries(PRESET_DEFINITIONS).filter(([, preset]) => preset.family === 'native');
        const items = [
            { name: tr('exact_preset'), icon: 'architecture', children: exact.map(([id, preset]) => ({
                name: preset.name, icon: preset.icon, click: () => Runtime.createFromPreset(id)
            })) },
            { name: tr('graph_native'), icon: 'schema', children: native.map(([id, preset]) => ({
                name: preset.name, icon: preset.icon, click: () => Runtime.createFromPreset(id)
            })) }
        ];
        new Menu('visual_shader_graph_presets', items).open(target);
    }

    function createAdvancedColorControlComponent() {
        return {
            name: 'vsg-advanced-color',
            props: {
                value: { type: String, default: '#ffffff' },
                label: { type: String, default: 'Color' }
            },
            data() {
                return { formElement: null, currentHex: this.value || '#ffffff', editing: false, destroying: false };
            },
            watch: {
                value(nextValue) {
                    const hex = String(nextValue || '#ffffff');
                    this.currentHex = hex;
                    if (!this.editing) this.formElement?.setValue?.(hex);
                }
            },
            methods: {
                normalizeColor(value) {
                    if (value?.toHexString) return value.toHexString();
                    const text = String(value || '#ffffff');
                    return colorArrayToHex(colorHexToArray(text));
                },
                buildControl() {
                    const host = this.$refs.host;
                    const FormType = (typeof FormElement !== 'undefined' && FormElement.types?.advanced_color) || globalThis.FormElement?.types?.advanced_color;
                    if (!host || !FormType) return;
                    const formBridge = {
                        updateValues: () => {
                            if (this.destroying || !this.formElement) return;
                            this.currentHex = this.normalizeColor(this.formElement.getValue());
                            this.$emit('input', this.currentHex);
                        }
                    };
                    this.formElement = new FormType(`vsg_color_${makeId('control')}`, {
                        type: 'advanced_color',
                        label: '',
                        value: this.currentHex,
                        default: '#ffffff',
                        alpha: false,
                        palette: true,
                        expand_control: true,
                        onBefore: () => {
                            if (this.destroying) return;
                            this.editing = true;
                            this.$emit('begin', this.currentHex);
                        },
                        onAfter: () => {
                            if (this.destroying) return;
                            this.currentHex = this.normalizeColor(this.formElement?.getValue?.() || this.currentHex);
                            this.editing = false;
                            this.$emit('commit', this.currentHex);
                        }
                    }, formBridge);
                    this.formElement.build(host);
                    this.formElement.setup();
                    host.setAttribute('aria-label', this.label);
                }
            },
            mounted() { this.buildControl(); },
            beforeDestroy() {
                this.destroying = true;
                try { this.formElement?.colorpicker?.delete?.(); } catch (error) { console.warn('[Visual Shader Graph] Color control cleanup failed.', error); }
                this.formElement = null;
            },
            template: '<div ref="host" class="vsg-advanced-color-control"></div>'
        };
    }

    function createGraphCanvasComponent() {
        return {
            name: 'visual-shader-graph-canvas',
            components: { VsgAdvancedColor: createAdvancedColorControlComponent() },
            data() {
                return {
                    runtime: Runtime,
                    connectionDraft: null,
                    dragState: null,
                    panState: null,
                    spacePressed: false,
                    pointerGraphPosition: { x: 320, y: 220 },
                    colorEditState: null,
                    suppressContextMenuUntil: 0
                };
            },
            computed: {
                graph() { return this.runtime.activeGraph; },
                transformStyle() {
                    if (!this.graph) return {};
                    return { transform: `translate(${this.graph.viewport.x}px, ${this.graph.viewport.y}px) scale(${this.graph.viewport.zoom})`, '--vsg-grid-size': `${clampNumber(this.graph.settings?.gridSize, 8, 64, 20)}px` };
                },
                graphStatusLabel() {
                    return tr(this.runtime.compileState) || this.runtime.compileState;
                },
                zoomLabel() {
                    return `${Math.round((this.graph?.viewport?.zoom || 1) * 100)}%`;
                },
                compilePerformanceLabel() {
                    return this.runtime.lastCompileDuration > 0
                        ? `${tr('compiled_in')} ${this.runtime.lastCompileDuration} ms`
                        : tr('not_compiled');
                }
            },
            watch: {
                'runtime.activeGraphId'() {
                    this.$nextTick(() => { if (this.graph) this.frameAll(); });
                }
            },
            methods: {
                tr,
                nodeDefinition(node) { return getNodeDefinition(node.type); },
                nodeWidth(node) { return nodeVisualWidth(node); },
                groupBounds(group) { return graphGroupBounds(this.graph, group, window.MaterialManager?.materials); },
                inputPorts(node) { return getNodeInputPorts(node, window.MaterialManager?.materials); },
                outputPorts(node) { return getNodeOutputPorts(node); },
                nodeRows(node) {
                    const inputs = this.inputPorts(node);
                    const outputs = this.outputPorts(node);
                    return Array.from({ length: Math.max(inputs.length, outputs.length, 1) }, (_, index) => ({
                        input: inputs[index] || null,
                        output: outputs[index] || null
                    }));
                },
                nodeTitle(node) { return getNodeDisplayTitle(node); },
                nodeTypeLabel(node) { return getNodeTypeLabel(node); },
                nodeSummary(node) {
                    if (node.type.endsWith('_parameter')) {
                        if (node.type === 'color_parameter') return node.data.hex || colorArrayToHex(node.data.value);
                        return fieldValueAsText(node.data.value);
                    }
                    if (node.type === 'preset_output') return window.MaterialManager?.materials?.[node.data.baseMaterialId]?.name || node.data.baseMaterialId;
                    if (node.type === 'surface_output') return String(node.data.lightingModel || 'pbr').toUpperCase();
                    if (node.type === 'custom_expression') return node.data.outputType || 'float';
                    return '';
                },
                parameterControlKind(node) {
                    if (node.type === 'color_parameter') return 'color';
                    if (node.type === 'float_parameter') return 'float';
                    if (node.type === 'bool_parameter') return 'bool';
                    return '';
                },
                parameterRange(node, key, fallback) {
                    const value = Number(node?.data?.[key]);
                    return Number.isFinite(value) ? value : fallback;
                },
                setParameterNumber(node, event) {
                    const min = this.parameterRange(node, 'min', -1000000);
                    const max = this.parameterRange(node, 'max', 1000000);
                    const value = clampNumber(event.target.value, Math.min(min, max), Math.max(min, max), node.data.value);
                    Runtime.runUndo('Edit shader parameter', () => {
                        this.$set(node.data, 'value', value);
                    }, { cause: 'parameter_value' });
                },
                setParameterBoolean(node, event) {
                    const value = !!event.target.checked;
                    Runtime.runUndo('Edit shader parameter', () => {
                        this.$set(node.data, 'value', value);
                    }, { cause: 'parameter_value' });
                },
                beginParameterColorEdit(node) {
                    if (this.colorEditState?.node === node) return;
                    if (this.colorEditState) this.finishParameterColorEdit(this.colorEditState.node, this.colorEditState.node.data.hex);
                    const aspects = { [GRAPH_UNDO_ASPECT]: true };
                    Undo.initEdit(aspects);
                    this.colorEditState = { node, initial: node.data.hex || '#ffffff', changed: false, aspects };
                },
                previewParameterColor(node, value) {
                    if (!this.colorEditState || this.colorEditState.node !== node) this.beginParameterColorEdit(node);
                    const hex = colorArrayToHex(colorHexToArray(value));
                    if (node.data.hex === hex) return;
                    this.$set(node.data, 'hex', hex);
                    this.$set(node.data, 'value', colorHexToArray(hex));
                    this.colorEditState.changed = true;
                    Runtime.refresh();
                    if (this.graph?.settings?.livePreview) Runtime.scheduleCompile('parameter_color_preview', 80);
                },
                finishParameterColorEdit(node, value) {
                    const state = this.colorEditState;
                    if (!state || state.node !== node) return;
                    this.previewParameterColor(node, value);
                    this.colorEditState = null;
                    if (!state.changed || node.data.hex === state.initial) {
                        Undo.cancelEdit(false);
                        return;
                    }
                    const graph = this.graph;
                    graph.revision = Math.max(0, Number(graph.revision) || 0) + 1;
                    graph.updatedAt = Date.now();
                    Runtime.save({ cause: 'parameter_color' });
                    Undo.finishEdit('Edit shader parameter color', state.aspects);
                    Runtime.markDirty('parameter_color');
                },
                portColor(port) { return getPortTypeColor(port?.type); },
                portTypeLabel(port) { return TYPE_META[port?.type]?.label || TYPE_META.any.label; },
                nodeTabIndex(node) {
                    if (Runtime.selectedNodeIds.includes(node.id)) return 0;
                    return this.graph?.nodes?.[0] === node ? 0 : -1;
                },
                isInputConnected(nodeId, portId) {
                    return !!this.graph?.edges.some(edge => edge.to.node === nodeId && edge.to.port === portId);
                },
                getInputText(node, port) {
                    const value = node.inputValues?.[port.id] !== undefined ? node.inputValues[port.id] : port.default;
                    return fieldValueAsText(value);
                },
                setInputText(node, port, event) {
                    const value = parseFieldValue(event.target.value, port.type, port.default);
                    Runtime.runUndo('Edit shader node input', () => {
                        if (!node.inputValues) this.$set(node, 'inputValues', {});
                        this.$set(node.inputValues, port.id, value);
                    }, { cause: 'edit_input' });
                },
                supportsInlineInput(port) {
                    return port && ['float', 'vec2', 'vec3', 'vec4', 'color', 'bool'].includes(port.type);
                },
                selectNode(node, event) {
                    if (event?.shiftKey || event?.ctrlOrCmd || event?.ctrlKey || event?.metaKey) {
                        const index = Runtime.selectedNodeIds.indexOf(node.id);
                        if (index >= 0) Runtime.selectedNodeIds.splice(index, 1);
                        else Runtime.selectedNodeIds.push(node.id);
                    } else if (!Runtime.selectedNodeIds.includes(node.id)) {
                        Runtime.selectedNodeIds = [node.id];
                    }
                    Runtime.selectedEdgeId = '';
                    Runtime.refresh();
                },
                focusNodeElement(nodeId) {
                    this.$nextTick(() => {
                        const element = this.$refs.viewport?.querySelector?.(`[data-node-id="${nodeId}"]`);
                        element?.focus?.({ preventScroll: true });
                    });
                },
                handleNodeKey(node, event) {
                    const directions = {
                        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]
                    };
                    const direction = directions[event.key];
                    if (!direction) return;
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.shiftKey) {
                        const distance = event.ctrlKey || event.metaKey ? 1 : (this.graph.settings?.snapToGrid ? clampNumber(this.graph.settings.gridSize, 8, 64, 20) : 12);
                        Runtime.runUndo('Move shader node', () => {
                            node.x = snapGraphValue(this.graph, node.x + direction[0] * distance);
                            node.y = snapGraphValue(this.graph, node.y + direction[1] * distance);
                        }, { cause: 'keyboard_move_node', compile: false });
                        this.focusNodeElement(node.id);
                        return;
                    }
                    const candidates = this.graph.nodes.filter(candidate => candidate !== node).map(candidate => {
                        const dx = candidate.x - node.x;
                        const dy = candidate.y - node.y;
                        const primary = dx * direction[0] + dy * direction[1];
                        const secondary = Math.abs(dx * direction[1] - dy * direction[0]);
                        return { candidate, primary, score: primary + secondary * 0.42 };
                    }).filter(entry => entry.primary > 0).sort((a, b) => a.score - b.score);
                    const next = candidates[0]?.candidate;
                    if (!next) return;
                    Runtime.selectedNodeIds = [next.id];
                    Runtime.selectedEdgeId = '';
                    Runtime.refresh();
                    this.focusNodeElement(next.id);
                },
                cancelPointerGesture() {
                    this._pointerCleanup?.();
                    this._pointerCleanup = null;
                    if (this.dragState) Undo.cancelEdit(false);
                    this.dragState = null;
                    this.panState = null;
                    const draft = this.connectionDraft;
                    if (draft?.rewire) {
                        const { edge, edgeIndex, aspects } = draft.rewire;
                        if (!this.graph.edges.some(candidate => candidate.id === edge.id)) {
                            this.graph.edges.splice(Math.min(edgeIndex, this.graph.edges.length), 0, edge);
                        }
                        Undo.cancelEdit(false);
                        this.connectionDraft = null;
                        this.$forceUpdate();
                    } else if (draft && !draft.keyboard) {
                        this.connectionDraft = null;
                    }
                },
                beginNodeDrag(node, event) {
                    if (event.button !== 0 || event.target.closest('.vsg-port, input, button, select, textarea')) return;
                    event.preventDefault();
                    this.cancelPointerGesture();
                    this.selectNode(node, event);
                    const graph = this.graph;
                    const selected = new Set(Runtime.selectedNodeIds);
                    const initial = graph.nodes.filter(entry => selected.has(entry.id)).map(entry => ({ node: entry, x: entry.x, y: entry.y }));
                    const start = { x: event.clientX, y: event.clientY };
                    const aspects = { [GRAPH_UNDO_ASPECT]: true };
                    Undo.initEdit(aspects);
                    this.dragState = { initial, start, moved: false, aspects };
                    const move = moveEvent => {
                        const dx = (moveEvent.clientX - start.x) / graph.viewport.zoom;
                        const dy = (moveEvent.clientY - start.y) / graph.viewport.zoom;
                        if (Math.abs(dx) + Math.abs(dy) > 1) this.dragState.moved = true;
                        initial.forEach(entry => {
                            entry.node.x = snapGraphValue(graph, entry.x + dx);
                            entry.node.y = snapGraphValue(graph, entry.y + dy);
                        });
                        Runtime.refresh();
                    };
                    const cleanup = () => {
                        document.removeEventListener('mousemove', move);
                        document.removeEventListener('mouseup', stop);
                    };
                    const stop = () => {
                        cleanup();
                        if (this._pointerCleanup === cleanup) this._pointerCleanup = null;
                        const state = this.dragState;
                        this.dragState = null;
                        if (!state?.moved) {
                            Undo.cancelEdit(false);
                            return;
                        }
                        graph.revision += 1;
                        graph.updatedAt = Date.now();
                        Runtime.save({ cause: 'move_nodes' });
                        Undo.finishEdit('Move shader nodes', aspects);
                        Runtime.markDirty('move_nodes', { compile: false });
                    };
                    this._pointerCleanup = cleanup;
                    document.addEventListener('mousemove', move);
                    document.addEventListener('mouseup', stop);
                },
                beginNodeResize(node, event) {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.stopPropagation();
                    this.cancelPointerGesture();
                    const startX = event.clientX;
                    const startWidth = nodeVisualWidth(node);
                    const graph = this.graph;
                    const aspects = { [GRAPH_UNDO_ASPECT]: true };
                    Undo.initEdit(aspects);
                    let moved = false;
                    const move = moveEvent => {
                        const delta = (moveEvent.clientX - startX) / graph.viewport.zoom;
                        if (Math.abs(delta) > 1) moved = true;
                        node.width = clampNumber(startWidth + delta, 140, 520, startWidth);
                        Runtime.refresh();
                    };
                    const cleanup = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', stop); };
                    const stop = () => {
                        cleanup();
                        if (this._pointerCleanup === cleanup) this._pointerCleanup = null;
                        if (!moved) return Undo.cancelEdit(false);
                        node.width = Math.round(node.width / 4) * 4;
                        graph.revision += 1;
                        graph.updatedAt = Date.now();
                        Runtime.save({ cause: 'resize_node' });
                        Undo.finishEdit('Resize shader node', aspects);
                        Runtime.markDirty('resize_node', { compile: false });
                    };
                    this._pointerCleanup = cleanup;
                    document.addEventListener('mousemove', move);
                    document.addEventListener('mouseup', stop);
                },
                beginGroupDrag(group, event) {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.stopPropagation();
                    this.cancelPointerGesture();
                    const graph = this.graph;
                    const ids = new Set(group.nodeIds || []);
                    const initial = graph.nodes.filter(node => ids.has(node.id)).map(node => ({ node, x: node.x, y: node.y }));
                    if (!initial.length) return;
                    Runtime.selectedNodeIds = initial.map(entry => entry.node.id);
                    Runtime.selectedEdgeId = '';
                    const start = { x: event.clientX, y: event.clientY };
                    const aspects = { [GRAPH_UNDO_ASPECT]: true };
                    Undo.initEdit(aspects);
                    let moved = false;
                    const move = moveEvent => {
                        const dx = (moveEvent.clientX - start.x) / graph.viewport.zoom;
                        const dy = (moveEvent.clientY - start.y) / graph.viewport.zoom;
                        if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
                        initial.forEach(entry => { entry.node.x = snapGraphValue(graph, entry.x + dx); entry.node.y = snapGraphValue(graph, entry.y + dy); });
                        Runtime.refresh();
                    };
                    const cleanup = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', stop); };
                    const stop = () => {
                        cleanup();
                        if (this._pointerCleanup === cleanup) this._pointerCleanup = null;
                        if (!moved) return Undo.cancelEdit(false);
                        graph.revision += 1; graph.updatedAt = Date.now();
                        Runtime.save({ cause: 'move_group' });
                        Undo.finishEdit('Move shader node group', aspects);
                        Runtime.markDirty('move_group', { compile: false });
                    };
                    this._pointerCleanup = cleanup;
                    document.addEventListener('mousemove', move);
                    document.addEventListener('mouseup', stop);
                },
                autoLayout() { Runtime.autoLayoutSelection(); this.$nextTick(() => this.frameAll()); },
                toggleSnap() { Runtime.toggleSnapToGrid(); },
                groupSelection() { Runtime.groupSelection(); },
                ungroupSelection() { Runtime.ungroupSelection(); },
                createSubgraphFromSelection() { Runtime.createSubgraphFromSelection(); },
                beginPan(event) {
                    if (!this.graph) return;
                    const interactiveTarget = event.target.closest?.('.vsg-node, .vsg-connection-hit, input, button, select, textarea');
                    const rightButtonPan = event.button === 2 && !interactiveTarget;
                    const shouldPan = rightButtonPan || event.button === 1 || (event.button === 0 && (event.altKey || this.spacePressed)) || (event.type.startsWith('touch'));
                    if (!shouldPan) {
                        if (event.button === 0 && !interactiveTarget) {
                            Runtime.selectedNodeIds = [];
                            Runtime.selectedEdgeId = '';
                            Runtime.refresh();
                        }
                        return;
                    }
                    if (!rightButtonPan) event.preventDefault();
                    this.cancelPointerGesture();
                    const point = event.touches?.[0] || event;
                    const start = { x: point.clientX, y: point.clientY };
                    const origin = { x: this.graph.viewport.x, y: this.graph.viewport.y };
                    this.panState = { start, origin, moved: false, rightButtonPan };
                    const move = moveEvent => {
                        const current = moveEvent.touches?.[0] || moveEvent;
                        if (Math.abs(current.clientX - start.x) + Math.abs(current.clientY - start.y) > 4) this.panState.moved = true;
                        this.graph.viewport.x = origin.x + current.clientX - start.x;
                        this.graph.viewport.y = origin.y + current.clientY - start.y;
                        Runtime.refresh();
                    };
                    const cleanup = () => {
                        document.removeEventListener('mousemove', move);
                        document.removeEventListener('mouseup', stop);
                        document.removeEventListener('touchmove', move);
                        document.removeEventListener('touchend', stop);
                    };
                    const stop = () => {
                        cleanup();
                        if (this._pointerCleanup === cleanup) this._pointerCleanup = null;
                        const state = this.panState;
                        if (state?.rightButtonPan && state.moved) this.suppressContextMenuUntil = Date.now() + 350;
                        this.panState = null;
                        Runtime.save({ markDirty: false, cause: 'pan_graph' });
                    };
                    this._pointerCleanup = cleanup;
                    document.addEventListener('mousemove', move);
                    document.addEventListener('mouseup', stop);
                    document.addEventListener('touchmove', move, { passive: false });
                    document.addEventListener('touchend', stop);
                },
                zoomGraph(event) {
                    if (!this.graph) return;
                    event.preventDefault();
                    const viewport = this.$refs.viewport;
                    const rect = viewport.getBoundingClientRect();
                    const mouseX = event.clientX - rect.left;
                    const mouseY = event.clientY - rect.top;
                    const oldZoom = this.graph.viewport.zoom;
                    const nextZoom = clampNumber(oldZoom * Math.exp(-event.deltaY * 0.0015), 0.2, 2.5, oldZoom);
                    const graphX = (mouseX - this.graph.viewport.x) / oldZoom;
                    const graphY = (mouseY - this.graph.viewport.y) / oldZoom;
                    this.graph.viewport.zoom = nextZoom;
                    this.graph.viewport.x = mouseX - graphX * nextZoom;
                    this.graph.viewport.y = mouseY - graphY * nextZoom;
                    Runtime.refresh();
                    this._zoomSave && clearTimeout(this._zoomSave);
                    this._zoomSave = setTimeout(() => Runtime.save({ markDirty: false, cause: 'zoom_graph' }), 180);
                },
                zoomBy(factor) {
                    if (!this.graph) return;
                    const viewport = this.$refs.viewport;
                    const rect = viewport.getBoundingClientRect();
                    const event = { preventDefault() {}, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, deltaY: factor > 1 ? -220 : 220 };
                    this.zoomGraph(event);
                },
                resetView() {
                    if (!this.graph) return;
                    this.graph.viewport = { x: 80, y: 80, zoom: 1 };
                    Runtime.save({ markDirty: false, cause: 'reset_view' });
                    Runtime.refresh();
                },
                frameAll() {
                    const graph = this.graph;
                    const viewport = this.$refs.viewport;
                    if (!graph || !viewport || !graph.nodes.length) return this.resetView();
                    const minX = Math.min(...graph.nodes.map(node => node.x));
                    const minY = Math.min(...graph.nodes.map(node => node.y));
                    const maxX = Math.max(...graph.nodes.map(node => node.x + nodeVisualWidth(node)));
                    const maxY = Math.max(...graph.nodes.map(node => node.y + 70 + Math.max(this.inputPorts(node).length, this.outputPorts(node).length, 1) * 32));
                    const width = Math.max(1, maxX - minX);
                    const height = Math.max(1, maxY - minY);
                    const zoom = clampNumber(Math.min((viewport.clientWidth - 56) / width, (viewport.clientHeight - 56) / height), 0.2, 1.35, 1);
                    graph.viewport.zoom = zoom;
                    graph.viewport.x = (viewport.clientWidth - width * zoom) / 2 - minX * zoom;
                    graph.viewport.y = (viewport.clientHeight - height * zoom) / 2 - minY * zoom;
                    Runtime.save({ markDirty: false, cause: 'frame_graph' });
                    Runtime.refresh();
                },
                centerNode(nodeId, options = {}) {
                    const graph = this.graph;
                    const viewport = this.$refs.viewport;
                    const node = graph?.nodes.find(entry => entry.id === nodeId);
                    if (!graph || !viewport || !node) return false;
                    const height = 70 + Math.max(this.inputPorts(node).length, this.outputPorts(node).length, 1) * 32;
                    if (options.preserveZoom !== true) graph.viewport.zoom = clampNumber(graph.viewport.zoom, 0.72, 1.2, 1);
                    graph.viewport.x = viewport.clientWidth / 2 - (node.x + nodeVisualWidth(node) / 2) * graph.viewport.zoom;
                    graph.viewport.y = viewport.clientHeight / 2 - (node.y + height / 2) * graph.viewport.zoom;
                    Runtime.save({ markDirty: false, cause: 'center_node' });
                    Runtime.refresh();
                    this.focusNodeElement(node.id);
                    return true;
                },
                connectionPath(edge) {
                    const source = this.graph.nodes.find(node => node.id === edge.from.node);
                    const target = this.graph.nodes.find(node => node.id === edge.to.node);
                    if (!source || !target) return '';
                    const x1 = nodePortX(source, 'output');
                    const y1 = nodePortY(source, edge.from.port, 'output', window.MaterialManager?.materials);
                    const x2 = nodePortX(target, 'input');
                    const y2 = nodePortY(target, edge.to.port, 'input', window.MaterialManager?.materials);
                    const span = Math.max(60, Math.abs(x2 - x1) * 0.45);
                    return `M ${x1} ${y1} C ${x1 + span} ${y1}, ${x2 - span} ${y2}, ${x2} ${y2}`;
                },
                edgeColor(edge) {
                    const source = this.graph.nodes.find(node => node.id === edge.from.node);
                    const output = source && this.outputPorts(source).find(port => port.id === edge.from.port);
                    return getPortTypeColor(output?.type);
                },
                edgeTypeLabel(edge) {
                    const source = this.graph.nodes.find(node => node.id === edge.from.node);
                    const output = source && this.outputPorts(source).find(port => port.id === edge.from.port);
                    return TYPE_META[output?.type]?.label || '';
                },
                edgeLabelPoint(edge) {
                    const source = this.graph.nodes.find(node => node.id === edge.from.node);
                    const target = this.graph.nodes.find(node => node.id === edge.to.node);
                    if (!source || !target) return { x: 0, y: 0 };
                    const x1 = nodePortX(source, 'output');
                    const y1 = nodePortY(source, edge.from.port, 'output', window.MaterialManager?.materials);
                    const x2 = nodePortX(target, 'input');
                    const y2 = nodePortY(target, edge.to.port, 'input', window.MaterialManager?.materials);
                    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 7 };
                },
                selectEdge(edge, event) {
                    event.stopPropagation();
                    Runtime.selectedNodeIds = [];
                    Runtime.selectedEdgeId = edge.id;
                    Runtime.refresh();
                },
                disconnectPort(node, port, direction) {
                    return Runtime.disconnectPort(node.id, port.id, direction);
                },
                openPortMenu(node, port, direction, event) {
                    event.preventDefault();
                    event.stopPropagation();
                    const connected = this.graph.edges.filter(edge => direction === 'input'
                        ? edge.to.node === node.id && edge.to.port === port.id
                        : edge.from.node === node.id && edge.from.port === port.id);
                    new Menu(`visual_shader_graph_${direction}_port`, [
                        {
                            name: direction === 'input' ? tr('disconnect_input') : tr('disconnect_output'),
                            icon: 'link_off',
                            condition: connected.length > 0,
                            click: () => this.disconnectPort(node, port, direction)
                        }
                    ]).open(event);
                },
                openEdgeMenu(edge, event) {
                    event.preventDefault();
                    event.stopPropagation();
                    Runtime.selectedNodeIds = [];
                    Runtime.selectedEdgeId = edge.id;
                    Runtime.refresh();
                    new Menu('visual_shader_graph_connection', [
                        { name: tr('disconnect'), icon: 'link_off', click: () => Runtime.disconnectEdge(edge.id) }
                    ]).open(event);
                },
                beginConnection(node, outputPort, event) {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.stopPropagation();
                    this.cancelPointerGesture();
                    const viewport = this.$refs.viewport;
                    const start = {
                        x: nodePortX(node, 'output'),
                        y: nodePortY(node, outputPort.id, 'output', window.MaterialManager?.materials)
                    };
                    this.connectionDraft = { node: node.id, port: outputPort.id, type: outputPort.type, start, end: start, keyboard: false };
                    const move = moveEvent => {
                        this.connectionDraft.end = graphPointFromClient(this.graph, viewport, moveEvent.clientX, moveEvent.clientY);
                        this.$forceUpdate();
                    };
                    const cleanup = () => {
                        document.removeEventListener('mousemove', move);
                        document.removeEventListener('mouseup', stop);
                    };
                    const stop = stopEvent => {
                        cleanup();
                        if (this._pointerCleanup === cleanup) this._pointerCleanup = null;
                        const target = document.elementFromPoint(stopEvent.clientX, stopEvent.clientY)?.closest?.('.vsg-port-input');
                        const draft = this.connectionDraft;
                        this.connectionDraft = null;
                        if (!target || !draft) return this.$forceUpdate();
                        if (!Runtime.connect(draft.node, draft.port, target.dataset.nodeId, target.dataset.portId)) {
                            Blockbench.showQuickMessage(tr('connection_failed'), 2200);
                        }
                    };
                    this._pointerCleanup = cleanup;
                    document.addEventListener('mousemove', move);
                    document.addEventListener('mouseup', stop);
                },
                beginInputRewire(node, inputPort, event) {
                    if (event.button !== 0) return;
                    const graph = this.graph;
                    const edgeIndex = graph.edges.findIndex(edge => edge.to.node === node.id && edge.to.port === inputPort.id);
                    if (edgeIndex < 0) return;
                    const edge = graph.edges[edgeIndex];
                    const sourceNode = graph.nodes.find(candidate => candidate.id === edge.from.node);
                    const sourcePort = sourceNode && this.outputPorts(sourceNode).find(port => port.id === edge.from.port);
                    if (!sourceNode || !sourcePort) return;

                    event.preventDefault();
                    event.stopPropagation();
                    this.cancelPointerGesture();
                    const aspects = { [GRAPH_UNDO_ASPECT]: true };
                    Undo.initEdit(aspects);
                    graph.edges.splice(edgeIndex, 1);
                    const viewport = this.$refs.viewport;
                    const startClient = { x: event.clientX, y: event.clientY };
                    const start = {
                        x: nodePortX(sourceNode, 'output'),
                        y: nodePortY(sourceNode, sourcePort.id, 'output', window.MaterialManager?.materials)
                    };
                    this.connectionDraft = {
                        node: sourceNode.id,
                        port: sourcePort.id,
                        type: sourcePort.type,
                        start,
                        end: graphPointFromClient(graph, viewport, event.clientX, event.clientY),
                        keyboard: false,
                        rewire: {
                            edge,
                            edgeIndex,
                            aspects,
                            originalTo: { node: edge.to.node, port: edge.to.port },
                            moved: false
                        }
                    };
                    Runtime.refresh();

                    const move = moveEvent => {
                        const draft = this.connectionDraft;
                        if (!draft?.rewire) return;
                        if (Math.abs(moveEvent.clientX - startClient.x) + Math.abs(moveEvent.clientY - startClient.y) > 3) {
                            draft.rewire.moved = true;
                        }
                        draft.end = graphPointFromClient(graph, viewport, moveEvent.clientX, moveEvent.clientY);
                        this.$forceUpdate();
                    };
                    const cleanup = () => {
                        document.removeEventListener('mousemove', move);
                        document.removeEventListener('mouseup', stop);
                    };
                    const restoreAndCancel = draft => {
                        const state = draft.rewire;
                        edge.to = { ...state.originalTo };
                        if (!graph.edges.some(candidate => candidate.id === edge.id)) {
                            graph.edges.splice(Math.min(state.edgeIndex, graph.edges.length), 0, edge);
                        }
                        Undo.cancelEdit(false);
                        Runtime.refresh();
                    };
                    const stop = stopEvent => {
                        cleanup();
                        if (this._pointerCleanup === cleanup) this._pointerCleanup = null;
                        const draft = this.connectionDraft;
                        this.connectionDraft = null;
                        if (!draft?.rewire) return this.$forceUpdate();
                        const state = draft.rewire;
                        if (!state.moved) return restoreAndCancel(draft);

                        const target = document.elementFromPoint(stopEvent.clientX, stopEvent.clientY)?.closest?.('.vsg-port-input');
                        if (target) {
                            const targetNode = target.dataset.nodeId;
                            const targetPort = target.dataset.portId;
                            const unchanged = targetNode === state.originalTo.node && targetPort === state.originalTo.port;
                            if (unchanged) return restoreAndCancel(draft);
                            if (!Runtime.canConnect(draft.node, draft.port, targetNode, targetPort)) {
                                restoreAndCancel(draft);
                                Blockbench.showQuickMessage(tr('connection_failed'), 2200);
                                return;
                            }
                            for (let index = graph.edges.length - 1; index >= 0; index--) {
                                const candidate = graph.edges[index];
                                if (candidate.to.node === targetNode && candidate.to.port === targetPort) graph.edges.splice(index, 1);
                            }
                            edge.to = { node: targetNode, port: targetPort };
                            graph.edges.push(edge);
                        }

                        graph.revision = Math.max(0, Number(graph.revision) || 0) + 1;
                        graph.updatedAt = Date.now();
                        Runtime.save({ cause: target ? 'rewire_connection' : 'disconnect_connection' });
                        Undo.finishEdit(target ? 'Reconnect shader nodes' : 'Disconnect shader connection', state.aspects);
                        Runtime.markDirty(target ? 'rewire_connection' : 'disconnect_connection');
                    };
                    this._pointerCleanup = cleanup;
                    document.addEventListener('mousemove', move);
                    document.addEventListener('mouseup', stop);
                },
                beginKeyboardConnection(node, outputPort, event) {
                    event.preventDefault();
                    event.stopPropagation();
                    const start = {
                        x: nodePortX(node, 'output'),
                        y: nodePortY(node, outputPort.id, 'output', window.MaterialManager?.materials)
                    };
                    this.connectionDraft = { node: node.id, port: outputPort.id, type: outputPort.type, start, end: start, keyboard: true };
                    Runtime.selectedNodeIds = [node.id];
                    Runtime.selectedEdgeId = '';
                    Runtime.refresh();
                },
                finishKeyboardConnection(node, inputPort, event) {
                    const draft = this.connectionDraft;
                    if (!draft?.keyboard) return;
                    event.preventDefault();
                    event.stopPropagation();
                    this.connectionDraft = null;
                    if (!Runtime.connect(draft.node, draft.port, node.id, inputPort.id)) {
                        Blockbench.showQuickMessage(tr('connection_failed'), 2200);
                    }
                    this.$forceUpdate();
                },
                draftPath() {
                    const draft = this.connectionDraft;
                    if (!draft) return '';
                    const span = Math.max(60, Math.abs(draft.end.x - draft.start.x) * 0.45);
                    return `M ${draft.start.x} ${draft.start.y} C ${draft.start.x + span} ${draft.start.y}, ${draft.end.x - span} ${draft.end.y}, ${draft.end.x} ${draft.end.y}`;
                },
                addNodeAt(type, point) {
                    if (!this.graph) return;
                    const graphPoint = point || graphPointFromClient(this.graph, this.$refs.viewport, this.$refs.viewport.getBoundingClientRect().left + this.$refs.viewport.clientWidth / 2, this.$refs.viewport.getBoundingClientRect().top + this.$refs.viewport.clientHeight / 2);
                    Runtime.addNode(type, graphPoint.x, graphPoint.y);
                },
                openCanvasMenu(event) {
                    if (!this.graph) return;
                    event.preventDefault();
                    if (Date.now() < this.suppressContextMenuUntil) return;
                    const point = graphPointFromClient(this.graph, this.$refs.viewport, event.clientX, event.clientY);
                    const items = Object.entries(CATEGORY_META).map(([categoryId, category]) => ({
                        name: category.label,
                        icon: category.icon,
                        children: Object.entries(NODE_DEFINITIONS)
                            .filter(([type, definition]) => definition.category === categoryId)
                            .filter(([type]) => this.graph.settings?.graphKind === 'subgraph' ? !['vertex_output', 'surface_output', 'preset_output', 'subgraph_instance'].includes(type) : !['subgraph_input', 'subgraph_output', 'subgraph_instance'].includes(type))
                            .map(([type, definition]) => ({ name: definition.title, icon: definition.icon, click: () => this.addNodeAt(type, point) }))
                    })).filter(item => item.children.length);
                    const subgraphs = Runtime.graphs.filter(graph => graph.settings?.graphKind === 'subgraph' && graph.id !== this.graph.id);
                    if (subgraphs.length) items.push({ name: 'Sub Graphs', icon: 'account_tree', children: subgraphs.map(graph => ({ name: graph.name, icon: 'account_tree', click: () => Runtime.createSubgraphInstance(graph.id, point.x, point.y) })) });
                    new Menu('visual_shader_graph_add_node', items, { searchable: true }).open(event);
                },
                openNodeMenu(node, event) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.selectNode(node, event);
                    const connected = this.graph.edges.some(edge => edge.from.node === node.id || edge.to.node === node.id);
                    new Menu('visual_shader_graph_node', [
                        { name: tr('copy_node'), icon: 'content_copy', click: () => Runtime.copySelection() },
                        { name: tr('duplicate_node'), icon: 'control_point_duplicate', click: () => Runtime.duplicateSelection() },
                        { name: tr('disconnect_node'), icon: 'link_off', condition: connected, click: () => Runtime.disconnectNode(node.id) },
                        '_',
                        { name: tr('center_node'), icon: 'filter_center_focus', click: () => this.centerNode(node.id) },
                        { name: tr('delete_node'), icon: 'delete', click: () => Runtime.removeSelection() }
                    ]).open(event);
                },
                selectGraph(event) { Runtime.setActiveGraph(event.target.value); },
                openPresetMenu(event) { showPresetMenu(event.currentTarget); },
                compile() { Runtime.compileActive({ cause: 'manual_compile' }); },
                openApplyMenu(event) {
                    new Menu('visual_shader_graph_apply', [
                        { name: tr('apply_global'), icon: 'public', click: () => this.applyGlobal() },
                        { name: `${tr('apply_selection')} (${Runtime.getSelectedRenderableElements().length})`, icon: 'select_all', condition: () => Runtime.getSelectedRenderableElements().length > 0, click: () => this.applySelection() }
                    ]).open(event.currentTarget);
                },
                showKeyboardHelp() {
                    Blockbench.showMessageBox({
                        title: tr('keyboard_shortcuts'),
                        icon: 'keyboard',
                        message: `${tr('keyboard_help')}\n\n${tr('move_node_help')}`
                    });
                },
                setPreviewSize(size) { setGraphPreviewSize(size); },
                applyGlobal() {
                    const material = Runtime.getCompiledMaterial() || Runtime.compileActive({ cause: 'apply_global' });
                    if (material) Runtime.applyMaterialGlobally(material);
                },
                applySelection() {
                    const material = Runtime.getCompiledMaterial() || Runtime.compileActive({ cause: 'apply_selection' });
                    if (material) Runtime.applyMaterialToSelection(material);
                },
                exportGraph() { exportActiveGraph(); },
                importGraph() { importGraphFile(); },
                handleKey(event) {
                    if (window.Project?.mode !== 'shader_graph') return;
                    const interactive = event.target?.closest?.('input, textarea, select, button, [contenteditable="true"], [role="tab"], [role="menuitem"]');
                    const insideCanvas = !!event.target?.closest?.('.vsg-graph-viewport');
                    if (event.code === 'Space' && insideCanvas && !interactive) this.spacePressed = event.type !== 'keyup';
                    if (event.type === 'keyup' || interactive || !insideCanvas) return;
                    if (event.key === 'Escape' && this.connectionDraft) {
                        event.preventDefault();
                        this.connectionDraft = null;
                        this.$forceUpdate();
                        return;
                    }
                    const command = event.ctrlKey || event.metaKey;
                    if (event.key === 'Delete' || event.key === 'Backspace') {
                        event.preventDefault();
                        Runtime.removeSelection();
                    } else if (command && event.key.toLowerCase() === 'c') {
                        event.preventDefault(); Runtime.copySelection();
                    } else if (command && event.key.toLowerCase() === 'v') {
                        event.preventDefault(); Runtime.pasteSelection();
                    } else if (command && event.key.toLowerCase() === 'd') {
                        event.preventDefault(); Runtime.duplicateSelection();
                    } else if (event.key.toLowerCase() === 'f') {
                        event.preventDefault(); this.frameAll();
                    } else if (event.key === '?' || (event.shiftKey && event.key === '/')) {
                        event.preventDefault(); this.showKeyboardHelp();
                    }
                }
            },
            mounted() {
                Runtime.registerView(this);
                this._keyDown = event => this.handleKey(event);
                this._keyUp = event => this.handleKey(event);
                window.addEventListener('keydown', this._keyDown);
                window.addEventListener('keyup', this._keyUp);
                this.$nextTick(() => {
                    if (this.graph) this.frameAll();
                    if (typeof ResizeObserver !== 'undefined' && this.$refs.viewport) {
                        this._resizeObserver = new ResizeObserver(() => Runtime.refresh());
                        this._resizeObserver.observe(this.$refs.viewport);
                    }
                });
            },
            beforeDestroy() {
                this.cancelPointerGesture();
                if (this.colorEditState) {
                    Undo.cancelEdit(false);
                    this.colorEditState = null;
                }
                this.connectionDraft = null;
                Runtime.unregisterView(this);
                window.removeEventListener('keydown', this._keyDown);
                window.removeEventListener('keyup', this._keyUp);
                this._resizeObserver?.disconnect?.();
                this._resizeObserver = null;
                if (this._zoomSave) clearTimeout(this._zoomSave);
            },
            template: `
                <div class="vsg-canvas-panel">
                    <div class="vsg-toolbar">
                        <div class="vsg-toolbar-group vsg-toolbar-graph">
                            <select class="dark_bordered vsg-graph-select" :value="runtime.activeGraphId" @change="selectGraph" :aria-label="tr('graph_name')">
                                <option v-for="entry in runtime.graphs" :key="entry.id" :value="entry.id">{{ entry.settings.graphKind === 'subgraph' ? '◇ ' : '' }}{{ entry.name }}</option>
                            </select>
                        </div>
                        <div class="vsg-toolbar-group vsg-toolbar-files">
                            <button class="button vsg-toolbar-action" @click="openPresetMenu" :title="tr('new_graph')"><i class="material-icons">add</i><span class="vsg-action-label">{{ tr('new_graph') }}</span></button>
                            <button class="button vsg-toolbar-action" @click="importGraph" :title="tr('import_graph')"><i class="material-icons">file_open</i><span class="vsg-action-label">{{ tr('import_graph') }}</span></button>
                            <button class="button vsg-toolbar-action" :disabled="!graph" @click="exportGraph" :title="tr('export_graph')"><i class="material-icons">save</i><span class="vsg-action-label">{{ tr('export_graph') }}</span></button>
                        </div>
                        <div class="vsg-toolbar-group vsg-toolbar-compile">
                            <button class="button confirm vsg-primary-action" :disabled="!graph || runtime.compileState === 'compiling'" @click="compile"><i class="material-icons">memory</i><span>{{ tr('compile') }}</span></button>
                            <span v-if="graph" class="vsg-status" :class="'is-' + runtime.compileState" role="status" aria-live="polite"><i class="material-icons">{{ runtime.compileState === 'compiled' ? 'check_circle' : runtime.compileState === 'error' ? 'error' : runtime.compileState === 'compiling' ? 'hourglass_top' : 'edit' }}</i>{{ graphStatusLabel }}</span>
                            <button class="button vsg-apply-action" :disabled="!graph || graph.settings.graphKind === 'subgraph'" @click="openApplyMenu" :title="tr('apply')"><i class="material-icons">publish</i><span>{{ tr('apply') }}</span><i class="material-icons vsg-chevron">arrow_drop_down</i></button>
                        </div>
                        <span class="vsg-toolbar-spacer"></span>
                        <div class="vsg-toolbar-group vsg-toolbar-view">
                            <button class="tool vsg-tool-button" :disabled="!graph" @click="zoomBy(1.2)" :title="tr('zoom_in')" :aria-label="tr('zoom_in')"><i class="material-icons">zoom_in</i></button>
                            <button class="tool vsg-tool-button" :disabled="!graph" @click="zoomBy(0.8)" :title="tr('zoom_out')" :aria-label="tr('zoom_out')"><i class="material-icons">zoom_out</i></button>
                            <button class="tool vsg-tool-button" :disabled="!graph" @click="frameAll" :title="tr('fit_graph')" :aria-label="tr('fit_graph')"><i class="material-icons">fit_screen</i></button>
                            <button class="tool vsg-tool-button" :disabled="!graph" @click="autoLayout" :title="tr('auto_layout')" :aria-label="tr('auto_layout')"><i class="material-icons">auto_fix_high</i></button>
                            <button class="tool vsg-tool-button" :class="{active: graph && graph.settings.snapToGrid}" :disabled="!graph" @click="toggleSnap" :title="tr('snap_grid')" :aria-label="tr('snap_grid')"><i class="material-icons">grid_4x4</i></button>
                            <button class="tool vsg-tool-button" :disabled="!graph || !runtime.selectedNodeIds.length" @click="groupSelection" :title="tr('create_group')"><i class="material-icons">folder</i></button>
                            <button class="tool vsg-tool-button" :disabled="!graph || !runtime.selectedNodeIds.length" @click="ungroupSelection" :title="tr('ungroup')"><i class="material-icons">folder_off</i></button>
                            <button class="tool vsg-tool-button" :disabled="!graph || graph.settings.graphKind === 'subgraph' || !runtime.selectedNodeIds.length" @click="createSubgraphFromSelection" :title="tr('create_subgraph')"><i class="material-icons">account_tree</i></button>
                            <button class="tool vsg-tool-button" @click="showKeyboardHelp" :title="tr('keyboard_shortcuts')" :aria-label="tr('keyboard_shortcuts')"><i class="material-icons">help_outline</i></button>
                        </div>
                    </div>
                    <div v-if="!graph" class="vsg-empty-state">
                        <i class="material-icons">schema</i>
                        <h2>{{ tr('empty_title') }}</h2>
                        <p>{{ tr('empty_body') }}</p>
                        <button class="button confirm" @click="openPresetMenu">{{ tr('create_graph') }}</button>
                    </div>
                    <div v-else ref="viewport" class="vsg-graph-viewport" :class="{'is-panning': !!panState}" tabindex="0" role="region" :aria-label="tr('title')" aria-describedby="vsg_keyboard_instructions"
                        @mousedown="beginPan" @touchstart="beginPan" @wheel="zoomGraph" @contextmenu="openCanvasMenu">
                        <p id="vsg_keyboard_instructions" class="vsg-sr-only">{{ tr('keyboard_help') }} {{ tr('move_node_help') }}</p>
                        <div class="vsg-graph-world" :style="transformStyle">
                            <div v-for="group in graph.groups" :key="group.id" v-if="groupBounds(group)" class="vsg-node-group" :style="{left: groupBounds(group).x + 'px', top: groupBounds(group).y + 'px', width: groupBounds(group).width + 'px', height: groupBounds(group).height + 'px'}">
                                <div class="vsg-node-group-title" @mousedown="beginGroupDrag(group, $event)"><i class="material-icons">folder_open</i><span>{{ group.title }}</span></div>
                            </div>
                            <svg class="vsg-connections" aria-hidden="true">
                                <path v-for="edge in graph.edges" :key="edge.id" class="vsg-connection-hit" :d="connectionPath(edge)" @click="selectEdge(edge, $event)" @contextmenu="openEdgeMenu(edge, $event)"></path>
                                <path v-for="edge in graph.edges" :key="edge.id + '-line'" class="vsg-connection" :class="{selected: runtime.selectedEdgeId === edge.id}" :d="connectionPath(edge)" :stroke="edgeColor(edge)"></path>
                                <text v-for="edge in graph.edges" v-if="runtime.selectedEdgeId === edge.id" :key="edge.id + '-label'" class="vsg-connection-label" :x="edgeLabelPoint(edge).x" :y="edgeLabelPoint(edge).y">{{ edgeTypeLabel(edge) }}</text>
                                <path v-if="connectionDraft" class="vsg-connection vsg-connection-draft" :d="draftPath()" :stroke="portColor(connectionDraft)"></path>
                            </svg>
                            <article v-for="node in graph.nodes" :key="node.id" class="vsg-node" :class="{selected: runtime.selectedNodeIds.includes(node.id), output: node.type.endsWith('_output')}"
                                :style="{left: node.x + 'px', top: node.y + 'px', width: nodeWidth(node) + 'px', '--node-color': nodeDefinition(node).color}"
                                :data-node-id="node.id" :tabindex="nodeTabIndex(node)" role="group" :aria-label="nodeTitle(node) + ', ' + nodeTypeLabel(node)"
                                @focus="selectNode(node, $event)" @keydown="handleNodeKey(node, $event)" @keydown.enter.stop="selectNode(node, $event)" @mousedown="beginNodeDrag(node, $event)" @click.stop="selectNode(node, $event)" @contextmenu="openNodeMenu(node, $event)">
                                <header class="vsg-node-header">
                                    <i class="material-icons">{{ nodeDefinition(node).icon }}</i>
                                    <span>{{ nodeTitle(node) }}</span>
                                </header>
                                <div class="vsg-node-meta">
                                    <span>{{ nodeTypeLabel(node) }}</span>
                                    <vsg-advanced-color v-if="parameterControlKind(node) === 'color'" :value="node.data.hex || '#ffffff'" :label="nodeTitle(node)"
                                        @begin="beginParameterColorEdit(node)" @input="previewParameterColor(node, $event)" @commit="finishParameterColorEdit(node, $event)"></vsg-advanced-color>
                                    <span v-else-if="parameterControlKind(node) === 'float'" class="vsg-node-number-control">
                                        <input type="range" :min="parameterRange(node, 'min', 0)" :max="parameterRange(node, 'max', 1)" :step="parameterRange(node, 'step', 0.01)" :value="node.data.value" @change.stop="setParameterNumber(node, $event)" @mousedown.stop :aria-label="nodeTitle(node) + ' slider'">
                                        <input class="dark_bordered vsg-node-number-input" type="number" :min="parameterRange(node, 'min', 0)" :max="parameterRange(node, 'max', 1)" :step="parameterRange(node, 'step', 0.01)" :value="node.data.value" @change.stop="setParameterNumber(node, $event)" @mousedown.stop :aria-label="nodeTitle(node) + ' value'">
                                    </span>
                                    <label v-else-if="parameterControlKind(node) === 'bool'" class="vsg-node-bool-control">
                                        <input type="checkbox" :checked="node.data.value" @change.stop="setParameterBoolean(node, $event)" @mousedown.stop :aria-label="nodeTitle(node)">
                                        <span>{{ node.data.value ? 'On' : 'Off' }}</span>
                                    </label>
                                    <code v-else-if="nodeSummary(node)">{{ nodeSummary(node) }}</code>
                                </div>
                                <div class="vsg-node-body">
                                    <div v-for="(row, index) in nodeRows(node)" :key="index" class="vsg-port-row">
                                        <div class="vsg-port-side vsg-port-side-input">
                                            <button v-if="row.input" class="vsg-port vsg-port-input" :class="{connected: isInputConnected(node.id, row.input.id)}"
                                                :style="{'--port-color': portColor(row.input)}" :data-node-id="node.id" :data-port-id="row.input.id" :title="row.input.name + ' (' + row.input.type + ')'"
                                                :aria-label="tr('connect_to') + ' ' + row.input.name" @click.stop="finishKeyboardConnection(node, row.input, $event)"
                                                @mousedown="beginInputRewire(node, row.input, $event)"
                                                @dblclick.stop.prevent="disconnectPort(node, row.input, 'input')" @contextmenu="openPortMenu(node, row.input, 'input', $event)"></button>
                                            <span v-if="row.input" class="vsg-port-label">{{ row.input.name }}</span>
                                        </div>
                                        <input v-if="row.input && !isInputConnected(node.id, row.input.id) && supportsInlineInput(row.input)" class="dark_bordered vsg-inline-input"
                                            :value="getInputText(node, row.input)" @change.stop="setInputText(node, row.input, $event)" @mousedown.stop :aria-label="row.input.name">
                                        <div class="vsg-port-side vsg-port-side-output">
                                            <span v-if="row.output" class="vsg-port-label">{{ row.output.name }}</span>
                                            <button v-if="row.output" class="vsg-port vsg-port-output" :style="{'--port-color': portColor(row.output)}"
                                                :title="row.output.name + ' (' + row.output.type + ')'" :aria-label="tr('connect_from') + ' ' + row.output.name"
                                                @keydown.enter="beginKeyboardConnection(node, row.output, $event)" @keydown.space="beginKeyboardConnection(node, row.output, $event)" @mousedown="beginConnection(node, row.output, $event)"
                                                @dblclick.stop.prevent="disconnectPort(node, row.output, 'output')" @contextmenu="openPortMenu(node, row.output, 'output', $event)"></button>
                                        </div>
                                    </div>
                                </div>
                                <span class="vsg-node-resize" title="Resize node" @mousedown.stop="beginNodeResize(node, $event)"></span>
                            </article>
                        </div>
                    </div>
                    <footer v-if="graph" class="vsg-statusbar">
                        <div class="vsg-statusbar-group">
                            <span><i class="material-icons">zoom_in</i>{{ tr('zoom') }} {{ zoomLabel }}</span>
                            <span><i class="material-icons">hub</i>{{ graph.nodes.length }} {{ tr('nodes') }}</span>
                            <span><i class="material-icons">share</i>{{ graph.edges.length }} {{ tr('connections') }}</span>
                            <span :class="'is-' + runtime.compileState"><i class="material-icons">{{ runtime.compileState === 'compiled' ? 'circle' : 'schedule' }}</i>{{ compilePerformanceLabel }}</span>
                        </div>
                        <div class="vsg-statusbar-group vsg-statusbar-tools">
                            <span class="vsg-preview-label">{{ tr('preview_size') }}</span>
                            <div class="vsg-segmented" role="group" :aria-label="tr('preview_size')">
                                <button :class="{active: runtime.previewSize === 'small'}" @click="setPreviewSize('small')" :title="tr('preview_small')">S</button>
                                <button :class="{active: runtime.previewSize === 'medium'}" @click="setPreviewSize('medium')" :title="tr('preview_medium')">M</button>
                                <button :class="{active: runtime.previewSize === 'large'}" @click="setPreviewSize('large')" :title="tr('preview_large')">L</button>
                            </div>
                            <span class="vsg-shortcut-hint">{{ tr('keyboard_shortcuts') }}: <kbd>F</kbd> {{ tr('fit_graph') }} <kbd>?</kbd> Help</span>
                        </div>
                    </footer>
                </div>`
        };
    }

    function createNodeLibraryComponent() {
        return {
            name: 'visual-shader-graph-library',
            data() {
                return { runtime: Runtime, query: '', openCategories: {} };
            },
            computed: {
                isSubgraph() { return this.runtime.activeGraph?.settings?.graphKind === 'subgraph'; },
                subgraphs() { return this.runtime.graphs.filter(graph => graph.settings?.graphKind === 'subgraph' && graph.id !== this.runtime.activeGraphId); },
                resources() {
                    const staticEntries = [
                        ['UV', 'uv', 'vec2', 'texture'], ['Normalized Face UV', 'normalized_face_uv', 'vec2', 'crop_free'],
                        ['Face Size', 'face_size', 'vec2', 'straighten'], ['Global Face Size', 'global_face_size', 'vec2', 'aspect_ratio'],
                        ['UV Size', 'uv_size', 'vec2', 'photo_size_select_small'], ['Normalized UV Size', 'normalized_uv_size', 'vec2', 'percent'],
                        ['AutoTile State', 'auto_tile_state', 'float', 'grid_view'], ['Texture Size', 'texture_size', 'vec2', 'texture'],
                        ['World Position', 'world_position', 'vec3', 'language'], ['World Normal', 'world_normal', 'vec3', 'explore'],
                        ['View Direction', 'view_direction', 'vec3', 'visibility'], ['Camera Position', 'camera_position', 'vec3', 'videocam'],
                        ['Time', 'time', 'float', 'schedule'], ['Screen UV', 'screen_uv', 'vec2', 'crop_free'],
                        ['Screen Size', 'screen_size', 'vec2', 'monitor'], ['Screen Texel Size', 'screen_texel_size', 'vec2', 'grid_4x4'],
                        ['Scene Color', 'scene_color', 'vec4', 'image'], ['Scene Depth', 'scene_depth', 'float', 'layers'],
                        ['Scene View Position', 'scene_view_position', 'vec3', 'view_in_ar'], ['Scene World Position', 'scene_world_position', 'vec3', 'public']
                    ].map(([title, nodeType, type, icon]) => ({ key: `builtin:${nodeType}`, title, nodeType, type, icon, data: {} }));
                    const uniforms = new Map();
                    Object.values(window.MaterialManager?.materials || {}).forEach(material => Object.entries(material?.uniforms || {}).forEach(([name, definition]) => {
                        if (uniforms.has(name)) return;
                        const type = uniformPortType(definition);
                        if (!type) return;
                        uniforms.set(name, { key: `uniform:${name}`, title: definition.label || name, subtitle: name, nodeType: 'uniform_reference', type, icon: 'tune', data: { name, uniformType: type, value: serializeUniformValue(definition.value), expose: false } });
                    }));
                    return staticEntries.concat(Array.from(uniforms.values()).sort((a, b) => a.title.localeCompare(b.title)));
                },
                filteredResources() {
                    const query = this.query.trim().toLowerCase();
                    return this.resources.filter(entry => !query || `${entry.title} ${entry.subtitle || ''} ${entry.type}`.toLowerCase().includes(query));
                },
                categories() {
                    const query = this.query.trim().toLowerCase();
                    return Object.entries(CATEGORY_META).map(([id, meta]) => {
                        const nodes = Object.entries(NODE_DEFINITIONS)
                            .filter(([type, definition]) => definition.category === id)
                            .filter(([type]) => this.isSubgraph ? !['vertex_output', 'surface_output', 'preset_output', 'subgraph_instance'].includes(type) : !['subgraph_input', 'subgraph_output', 'subgraph_instance'].includes(type))
                            .filter(([, definition]) => !query || `${definition.title} ${id}`.toLowerCase().includes(query))
                            .map(([type, definition]) => ({ type, definition }));
                        return { id, meta, nodes };
                    }).filter(category => category.nodes.length);
                },
                exactPresets() { return Object.entries(PRESET_DEFINITIONS).filter(([, preset]) => preset.family === 'exact'); },
                nativePresets() { return Object.entries(PRESET_DEFINITIONS).filter(([, preset]) => preset.family === 'native'); },
                featuredPresets() {
                    return ['exact_lightflow', 'exact_pbr', 'unlit_texture', 'stage_io_demo', 'toon_surface', 'hologram']
                        .map(id => [id, PRESET_DEFINITIONS[id]])
                        .filter(entry => !!entry[1]);
                },
                recentNodes() {
                    const graph = this.runtime.activeGraph;
                    const seen = new Set();
                    const nodes = (graph?.nodes || []).slice().reverse().filter(node => {
                        if (['surface_output', 'preset_output', 'vertex_output', 'subgraph_input', 'subgraph_output', 'subgraph_instance'].includes(node.type) || seen.has(node.type)) return false;
                        seen.add(node.type);
                        return true;
                    }).slice(0, 5).map(node => ({
                        type: node.type,
                        title: getNodeDisplayTitle(node),
                        definition: getNodeDefinition(node.type),
                        portType: getNodeOutputPorts(node)[0]?.type || 'any'
                    }));
                    if (nodes.length) return nodes;
                    return ['float_parameter', 'color_parameter', 'multiply', 'project_texture', 'reroute'].map(type => ({
                        type,
                        title: getNodeDefinition(type)?.title || type,
                        definition: getNodeDefinition(type),
                        portType: getNodeOutputPorts(createNode(type, 0, 0))[0]?.type || 'any'
                    }));
                }
            },
            methods: {
                tr,
                getPortTypeColor,
                typeLabel(type) { return TYPE_META[type]?.label || type; },
                categoryOpen(id) { return !!this.query.trim() || this.openCategories[id] === true; },
                toggleCategory(id) { this.$set(this.openCategories, id, !this.categoryOpen(id)); },
                insertionPoint() {
                    const graph = Runtime.activeGraph;
                    const selected = Runtime.selectedNodes[0];
                    return { x: selected ? selected.x + nodeVisualWidth(selected) + 90 : 260 + (graph?.nodes.length || 0) * 16, y: selected ? selected.y : 180 + (graph?.nodes.length || 0) * 12 };
                },
                addNode(type) {
                    const graph = Runtime.activeGraph;
                    if (!graph) return;
                    const point = this.insertionPoint();
                    Runtime.addNode(type, point.x, point.y);
                },
                addResource(entry) {
                    const point = this.insertionPoint();
                    Runtime.addNode(entry.nodeType, point.x, point.y, entry.data || {});
                },
                addSubgraph(entry) {
                    const point = this.insertionPoint();
                    Runtime.createSubgraphInstance(entry.id, point.x, point.y);
                },
                newSubgraph() { Runtime.createSubgraph(); },
                createPreset(id) { Runtime.createFromPreset(id); },
                openAllPresets(event) { showPresetMenu(event.currentTarget); }
            },
            mounted() { Runtime.registerView(this); },
            beforeDestroy() { Runtime.unregisterView(this); },
            template: `
                <div class="vsg-library">
                    <div class="vsg-library-search">
                        <i class="material-icons">search</i>
                        <input class="dark_bordered" v-model="query" :placeholder="tr('search_nodes_commands')" :aria-label="tr('search_nodes_commands')">
                    </div>
                    <section v-if="runtime.activeGraph && !query" class="vsg-library-section vsg-recent-section">
                        <h3>{{ tr('recent') }}</h3>
                        <button v-for="entry in recentNodes" :key="entry.type" class="vsg-recent-item" @click="addNode(entry.type)" :title="entry.definition.title">
                            <span class="vsg-type-dot" :style="{borderColor: getPortTypeColor(entry.portType)}"></span>
                            <span>{{ entry.title }}</span>
                            <small>{{ typeLabel(entry.portType) }}</small>
                        </button>
                    </section>
                    <section v-if="runtime.activeGraph && filteredResources.length" class="vsg-library-section vsg-resource-section">
                        <h3>{{ tr('resources') }}</h3>
                        <button v-for="entry in filteredResources.slice(0, query ? 80 : 24)" :key="entry.key" class="vsg-resource-item" @click="addResource(entry)" :title="entry.subtitle || entry.title">
                            <i class="material-icons">{{ entry.icon }}</i><span><strong>{{ entry.title }}</strong><small v-if="entry.subtitle">{{ entry.subtitle }}</small></span><span class="vsg-type-chip" :style="{borderColor: getPortTypeColor(entry.type)}">{{ typeLabel(entry.type) }}</span>
                        </button>
                    </section>
                    <section v-if="runtime.activeGraph && !query" class="vsg-library-section vsg-subgraph-section">
                        <h3>Sub Graphs</h3>
                        <button v-for="entry in subgraphs" :key="entry.id" class="vsg-preset-button" @click="addSubgraph(entry)"><i class="material-icons">account_tree</i><span>{{ entry.name }}</span><i class="material-icons vsg-add-indicator">add</i></button>
                        <button class="vsg-library-more" @click="newSubgraph"><span>{{ tr('create_subgraph') }}</span><i class="material-icons">add</i></button>
                    </section>
                    <section v-if="!query && !isSubgraph" class="vsg-library-section vsg-preset-section">
                        <h3>{{ tr('presets') }}</h3>
                        <button v-for="entry in featuredPresets" :key="entry[0]" class="vsg-preset-button" @click="createPreset(entry[0])">
                            <i class="material-icons">{{ entry[1].icon }}</i><span>{{ entry[1].name }}</span><i class="material-icons vsg-add-indicator">add</i>
                        </button>
                        <button class="vsg-library-more" @click="openAllPresets"><span>{{ tr('all_presets') }}</span><i class="material-icons">chevron_right</i></button>
                    </section>
                    <section v-if="runtime.activeGraph" class="vsg-library-section">
                        <div v-for="category in categories" :key="category.id" class="vsg-library-category">
                            <button class="vsg-section-header" @click="toggleCategory(category.id)" :aria-expanded="categoryOpen(category.id)">
                                <i class="material-icons">{{ categoryOpen(category.id) ? 'expand_more' : 'chevron_right' }}</i>
                                <i class="material-icons vsg-category-icon" :style="{color: category.meta.color}">{{ category.meta.icon }}</i>
                                <span>{{ category.meta.label }}</span>
                                <small>{{ category.nodes.length }}</small>
                            </button>
                            <div v-if="categoryOpen(category.id)" class="vsg-library-items">
                                <button v-for="entry in category.nodes" :key="entry.type" class="vsg-library-item" @click="addNode(entry.type)" :title="entry.definition.title">
                                    <i class="material-icons" :style="{color: entry.definition.color}">{{ entry.definition.icon }}</i>
                                    <span>{{ entry.definition.title }}</span>
                                    <i class="material-icons vsg-add-indicator">add</i>
                                </button>
                            </div>
                        </div>
                    </section>
                </div>`
        };
    }

    function uniformPortType(definition) {
        if (!definition) return 'float';
        if (definition.is_color || definition.type === 'color') return 'color';
        if (['bool', 'float', 'vec2', 'vec3', 'vec4'].includes(definition.type)) return definition.type;
        if (definition.type === 'int') return 'float';
        return null;
    }

    function createGraphInspectorComponent() {
        return {
            name: 'visual-shader-graph-inspector',
            components: { VsgAdvancedColor: createAdvancedColorControlComponent() },
            data() {
                return { runtime: Runtime, uniformToAdd: '', activeTab: 'graph' };
            },
            computed: {
                graph() { return this.runtime.activeGraph; },
                node() { return this.runtime.selectedNodes[0] || null; },
                definition() { return this.node ? getNodeDefinition(this.node.type) : null; },
                inputPorts() { return this.node ? getNodeInputPorts(this.node, window.MaterialManager?.materials) : []; },
                nodeTitle() { return getNodeDisplayTitle(this.node); },
                nodeTypeLabel() { return getNodeTypeLabel(this.node); },
                selectedDiagnostics() {
                    if (!this.node) return [];
                    return this.runtime.diagnostics.filter(message => message.nodeId === this.node.id);
                },
                materialOptions() {
                    return Object.values(window.MaterialManager?.materials || {}).map(material => ({ id: material.id, name: material.name || material.id })).sort((a, b) => a.name.localeCompare(b.name));
                },
                availableUniforms() {
                    if (this.node?.type !== 'preset_output') return [];
                    const base = window.MaterialManager?.materials?.[this.node.data.baseMaterialId];
                    const used = new Set((this.node.data.uniformPorts || []).map(entry => entry.name));
                    return Object.entries(base?.uniforms || {}).map(([name, definition]) => ({
                        name,
                        type: uniformPortType(definition),
                        definition,
                        label: definition.label || name
                    })).filter(entry => entry.type && !used.has(entry.name) && entry.definition.expose !== false);
                }
            },
            watch: {
                'runtime.selectedNodeIds': {
                    deep: true,
                    handler(ids) {
                        if (ids?.length && this.activeTab !== 'diagnostics') this.activeTab = 'node';
                    }
                }
            },
            methods: {
                tr,
                getPortTypeColor,
                setTab(tab) { this.activeTab = tab; },
                diagnosticTitle(message) {
                    const node = message.nodeId && this.graph?.nodes.find(entry => entry.id === message.nodeId);
                    return node ? getNodeDisplayTitle(node) : tr(message.severity || 'warning');
                },
                fieldValue(field) {
                    const value = this.node?.data?.[field.key];
                    if (field.type === 'vec2' || field.type === 'vec3' || field.type === 'vec4') return fieldValueAsText(value);
                    return value;
                },
                fieldOptions(field) {
                    if (field.type === 'material') return this.materialOptions.reduce((result, entry) => { result[entry.id] = entry.name; return result; }, {});
                    return field.options || {};
                },
                updateGraphName(event) {
                    if (!this.graph) return;
                    const value = String(event.target.value || 'Shader Graph').trim().slice(0, 96) || 'Shader Graph';
                    Runtime.runUndo('Rename visual shader graph', () => { this.graph.name = value; }, { cause: 'rename_graph', compile: false });
                },
                updateGraphSetting(key, event, type = 'text') {
                    if (!this.graph) return;
                    let value = type === 'checkbox' ? !!event.target.checked : type === 'number' ? Number(event.target.value) : event.target.value;
                    if (key === 'materialId') value = safeIdentifier(value, materialIdForGraph(this.graph));
                    if (key === 'gridSize') value = clampNumber(value, 8, 64, 20);
                    Runtime.runUndo('Edit shader graph settings', () => { this.$set(this.graph.settings, key, value); }, { cause: 'graph_settings' });
                },
                updateNodeField(field, event) {
                    if (!this.node) return;
                    let value;
                    if (field.type === 'checkbox') value = !!event.target.checked;
                    else if (field.type === 'number') value = Number(event.target.value);
                    else if (field.type === 'vec2' || field.type === 'vec3' || field.type === 'vec4') value = parseFieldValue(event.target.value, field.type, this.node.data[field.key]);
                    else value = event.target.value;
                    if (field.type === 'textarea') value = String(value || '').slice(0, 16384);
                    else if (field.type === 'text') value = String(value || '').slice(0, 96);
                    Runtime.runUndo('Edit shader node', () => {
                        if (field.type === 'nodeTitle') {
                            this.$set(this.node, 'title', String(value || '').slice(0, 96));
                            return;
                        }
                        this.$set(this.node.data, field.key, value);
                        if (field.type === 'color') this.$set(this.node.data, 'value', colorHexToArray(value));
                        if (this.node.type === 'preset_output' && field.key === 'baseMaterialId') {
                            const base = window.MaterialManager?.materials?.[value];
                            this.node.data.uniformPorts = (this.node.data.uniformPorts || []).filter(entry => !!base?.uniforms?.[entry.name]);
                            const allowed = new Set(this.node.data.uniformPorts.map(entry => `uniform:${entry.name}`));
                            for (let index = this.graph.edges.length - 1; index >= 0; index--) {
                                const edge = this.graph.edges[index];
                                if (edge.to.node === this.node.id && !allowed.has(edge.to.port)) this.graph.edges.splice(index, 1);
                            }
                        }
                    }, { cause: 'node_settings' });
                },
                updateNodeColor(field, value) {
                    if (String(this.node?.data?.[field.key] || '').toLowerCase() === String(value || '').toLowerCase()) return;
                    this.updateNodeField(field, { target: { value } });
                },
                inputConnected(port) {
                    return !!this.graph?.edges.some(edge => edge.to.node === this.node.id && edge.to.port === port.id);
                },
                inputValue(port) {
                    const value = this.node.inputValues?.[port.id] !== undefined ? this.node.inputValues[port.id] : port.default;
                    if (port.type === 'bool') return !!value;
                    return fieldValueAsText(value);
                },
                updateInput(port, event) {
                    const value = port.type === 'bool' ? !!event.target.checked : parseFieldValue(event.target.value, port.type, port.default);
                    Runtime.runUndo('Edit shader node input', () => {
                        if (!this.node.inputValues) this.$set(this.node, 'inputValues', {});
                        this.$set(this.node.inputValues, port.id, value);
                    }, { cause: 'edit_input' });
                },
                addUniformPort() {
                    if (!this.node || !this.uniformToAdd) return;
                    const entry = this.availableUniforms.find(option => option.name === this.uniformToAdd);
                    if (!entry) return;
                    Runtime.runUndo('Expose preset uniform', () => {
                        if (!Array.isArray(this.node.data.uniformPorts)) this.$set(this.node.data, 'uniformPorts', []);
                        this.node.data.uniformPorts.push({
                            name: entry.name,
                            label: entry.label,
                            type: entry.type,
                            default: serializeUniformValue(entry.definition.value)
                        });
                        if (!this.node.inputValues) this.$set(this.node, 'inputValues', {});
                        this.$set(this.node.inputValues, `uniform:${entry.name}`, serializeUniformValue(entry.definition.value));
                        this.uniformToAdd = '';
                    }, { cause: 'expose_uniform' });
                },
                removeUniformPort(port) {
                    if (!this.node || this.node.type !== 'preset_output') return;
                    Runtime.runUndo('Remove preset uniform', () => {
                        const name = port.id.replace(/^uniform:/, '');
                        const index = this.node.data.uniformPorts.findIndex(entry => entry.name === name);
                        if (index >= 0) this.node.data.uniformPorts.splice(index, 1);
                        for (let edgeIndex = this.graph.edges.length - 1; edgeIndex >= 0; edgeIndex--) {
                            const edge = this.graph.edges[edgeIndex];
                            if (edge.to.node === this.node.id && edge.to.port === port.id) this.graph.edges.splice(edgeIndex, 1);
                        }
                        if (this.node.inputValues) this.$delete(this.node.inputValues, port.id);
                    }, { cause: 'remove_uniform' });
                },
                toggleLive(event) { this.updateGraphSetting('livePreview', event, 'checkbox'); },
                exportMaterial() { exportCompiledMaterial(); },
                duplicateGraph() { Runtime.duplicateActiveGraph(); },
                copyMaterialId() {
                    if (!this.graph) return;
                    const value = this.graph.settings.materialId || materialIdForGraph(this.graph);
                    if (typeof Clipbench !== 'undefined') Clipbench.setText(value);
                    else navigator.clipboard?.writeText?.(value);
                    Blockbench.showQuickMessage(tr('material_id_copied'), 1400);
                },
                openGraphActions(event) {
                    new Menu('visual_shader_graph_actions', [
                        { name: tr('duplicate_graph'), icon: 'content_copy', click: () => this.duplicateGraph() },
                        ...(this.graph?.settings?.graphKind === 'subgraph' ? [] : [{ name: tr('export_material'), icon: 'data_object', click: () => this.exportMaterial() }]),
                        '_',
                        { name: tr('delete_graph'), icon: 'delete', click: () => this.deleteGraph() }
                    ]).open(event.currentTarget);
                },
                deleteGraph() {
                    if (!this.graph) return;
                    Blockbench.showMessageBox({ title: tr('delete_graph'), message: tr('confirm_delete_graph'), buttons: [tr('delete_graph'), 'dialog.cancel'], confirm: 0, cancel: 1 }, result => {
                        if (result === 0 || result === tr('delete_graph')) Runtime.deleteActiveGraph();
                    });
                },
                selectDiagnostic(message) {
                    if (message.nodeId) {
                        Runtime.focusNode(message.nodeId);
                        this.activeTab = 'node';
                    } else if (message.edgeId) {
                        Runtime.selectedNodeIds = [];
                        Runtime.selectedEdgeId = message.edgeId;
                        Runtime.refresh();
                    }
                },
                centerSelectedNode() {
                    if (this.node) Runtime.focusNode(this.node.id);
                },
                openAllDiagnostics() { this.activeTab = 'diagnostics'; }
            },
            mounted() { Runtime.registerView(this); },
            beforeDestroy() { Runtime.unregisterView(this); },
            template: `
                <div class="vsg-inspector">
                    <template v-if="graph">
                        <nav class="vsg-inspector-tabs" role="tablist" :aria-label="tr('inspector')">
                            <button role="tab" :aria-selected="activeTab === 'graph'" :class="{active: activeTab === 'graph'}" @click="setTab('graph')"><i class="material-icons">account_tree</i><span>{{ tr('graph') }}</span></button>
                            <button role="tab" :aria-selected="activeTab === 'node'" :class="{active: activeTab === 'node'}" @click="setTab('node')"><i class="material-icons">tune</i><span>{{ tr('node') }}</span></button>
                            <button role="tab" :aria-selected="activeTab === 'diagnostics'" :class="{active: activeTab === 'diagnostics'}" @click="setTab('diagnostics')"><i class="material-icons">fact_check</i><span>{{ tr('diagnostics') }}</span><small v-if="runtime.diagnostics.length">{{ runtime.diagnostics.length }}</small></button>
                        </nav>

                        <div v-if="activeTab === 'graph'" class="vsg-inspector-tabpanel" role="tabpanel">
                            <section class="vsg-inspector-section">
                                <div class="vsg-section-heading"><div><i class="material-icons">analytics</i><h3>{{ tr('graph_summary') }}</h3></div><button class="tool vsg-more-button" @click="openGraphActions" :title="tr('graph_actions')" :aria-label="tr('graph_actions')"><i class="material-icons">more_vert</i></button></div>
                                <dl class="vsg-summary-grid">
                                    <div><dt>{{ tr('node_count') }}</dt><dd>{{ graph.nodes.length }}</dd></div>
                                    <div><dt>{{ tr('connection_count') }}</dt><dd>{{ graph.edges.length }}</dd></div>
                                    <div><dt>{{ tr('last_compiled') }}</dt><dd :class="'is-' + runtime.compileState">{{ runtime.lastCompiledAt ? tr('just_now') : tr('not_compiled') }}</dd></div>
                                </dl>
                            </section>
                            <section class="vsg-inspector-section">
                                <div class="vsg-section-heading"><div><i class="material-icons">settings</i><h3>{{ tr('graph_settings') }}</h3></div></div>
                                <label class="vsg-field"><span>{{ tr('graph_name') }}</span><input class="dark_bordered" :value="graph.name" @change="updateGraphName"></label>
                                <div class="vsg-field"><span>Graph Type</span><code>{{ graph.settings.graphKind === 'subgraph' ? 'Sub Graph' : 'Material Graph' }}</code></div>
                                <div v-if="graph.settings.graphKind !== 'subgraph'" class="vsg-field vsg-field-stack"><span>{{ tr('material_id') }}</span><span class="vsg-copy-field"><input class="dark_bordered vsg-mono" :value="graph.settings.materialId" :title="graph.settings.materialId" @change="updateGraphSetting('materialId', $event)" :aria-label="tr('material_id')"><button class="tool" @click.prevent="copyMaterialId" :title="tr('copy_material_id')" :aria-label="tr('copy_material_id')"><i class="material-icons">content_copy</i></button></span></div>
                                <label v-if="graph.settings.graphKind !== 'subgraph'" class="vsg-field"><span>{{ tr('alpha_mode') }}</span><select class="dark_bordered" :value="graph.settings.alphaMode" @change="updateGraphSetting('alphaMode', $event)"><option value="opaque">Opaque</option><option value="cutout">Cutout</option><option value="blend">Blend</option><option value="additive">Additive</option></select></label>
                                <label class="vsg-check-field"><input type="checkbox" :checked="graph.settings.snapToGrid" @change="updateGraphSetting('snapToGrid', $event, 'checkbox')"><span>{{ tr('snap_grid') }}</span></label>
                                <label class="vsg-field"><span>Grid Size</span><input class="dark_bordered" type="number" min="8" max="64" step="1" :value="graph.settings.gridSize" @change="updateGraphSetting('gridSize', $event, 'number')"></label>
                                <label v-if="graph.settings.graphKind !== 'subgraph'" class="vsg-check-field"><input type="checkbox" :checked="graph.settings.livePreview" @change="toggleLive"><span>{{ tr('live_preview') }}</span></label>
                                <div class="vsg-inspector-actions">
                                    <button v-if="graph.settings.graphKind !== 'subgraph'" class="button" @click="exportMaterial"><i class="material-icons">data_object</i><span>{{ tr('export_material') }}</span></button>
                                    <button class="button" @click="openGraphActions"><i class="material-icons">more_horiz</i><span>{{ tr('more') }}</span></button>
                                </div>
                            </section>
                        </div>

                        <div v-else-if="activeTab === 'node'" class="vsg-inspector-tabpanel" role="tabpanel">
                            <section class="vsg-inspector-section">
                                <div class="vsg-section-heading"><div><i class="material-icons">tune</i><h3>{{ tr('selected_node') }}</h3></div></div>
                                <div v-if="!node" class="vsg-inspector-empty">{{ tr('no_selection') }}</div>
                                <template v-else>
                                    <div class="vsg-selected-node-title" :style="{'--node-color': definition.color}"><span class="vsg-selected-node-dot"></span><strong>{{ nodeTitle }}</strong><code>{{ nodeTypeLabel }}</code></div>
                                    <label v-if="!node.type.endsWith('_parameter')" class="vsg-field"><span>{{ tr('title_override') }}</span><input class="dark_bordered" :value="node.title" @change="updateNodeField({key: 'title', type: 'nodeTitle'}, $event)"></label>
                                    <label v-for="field in definition.properties" :key="field.key" class="vsg-field" :class="{'vsg-check-field': field.type === 'checkbox'}">
                                        <template v-if="field.type === 'checkbox'"><input type="checkbox" :checked="fieldValue(field)" @change="updateNodeField(field, $event)"><span>{{ field.label }}</span></template>
                                        <template v-else-if="field.type === 'select' || field.type === 'material'"><span>{{ field.label }}</span><select class="dark_bordered" :value="fieldValue(field)" @change="updateNodeField(field, $event)"><option v-for="(label, value) in fieldOptions(field)" :key="value" :value="value">{{ label }}</option></select></template>
                                        <template v-else-if="field.type === 'textarea'"><span>{{ field.label }}</span><textarea class="dark_bordered vsg-code-input" :value="fieldValue(field)" @change="updateNodeField(field, $event)" spellcheck="false"></textarea></template>
                                        <template v-else-if="field.type === 'color'"><span>{{ field.label }}</span><vsg-advanced-color class="vsg-inspector-color-control" :value="fieldValue(field)" :label="field.label" @commit="updateNodeColor(field, $event)"></vsg-advanced-color></template>
                                        <template v-else><span>{{ field.label }}</span><input class="dark_bordered vsg-mono" :type="field.type === 'number' ? 'number' : 'text'" :value="fieldValue(field)" @change="updateNodeField(field, $event)"></template>
                                    </label>
                                    <div v-if="node.type === 'preset_output'" class="vsg-preset-note"><i class="material-icons">info</i><span>{{ tr('exact_preset_note') }}</span></div>
                                    <div v-if="node.type === 'preset_output' && availableUniforms.length" class="vsg-add-uniform-row">
                                        <select class="dark_bordered" v-model="uniformToAdd"><option value="">{{ tr('add_uniform_port') }}</option><option v-for="entry in availableUniforms" :key="entry.name" :value="entry.name">{{ entry.label }} ({{ entry.type }})</option></select>
                                        <button class="tool" :disabled="!uniformToAdd" @click="addUniformPort" :aria-label="tr('add_uniform_port')"><i class="material-icons">add</i></button>
                                    </div>
                                    <h4 v-if="inputPorts.length">{{ tr('input_defaults') }}</h4>
                                    <div v-for="port in inputPorts" :key="port.id" class="vsg-input-default-row" :class="{connected: inputConnected(port)}">
                                        <span class="vsg-port-swatch" :style="{backgroundColor: getPortTypeColor(port.type)}"></span>
                                        <label>{{ port.name }}</label>
                                        <span v-if="inputConnected(port)" class="vsg-connected-label">{{ tr('connected') }}</span>
                                        <input v-else-if="port.type === 'bool'" type="checkbox" :checked="inputValue(port)" @change="updateInput(port, $event)">
                                        <input v-else class="dark_bordered vsg-mono" :value="inputValue(port)" @change="updateInput(port, $event)">
                                        <button v-if="node.type === 'preset_output'" class="tool vsg-remove-port" @click="removeUniformPort(port)" :title="tr('remove_port')" :aria-label="tr('remove_port') + ' ' + port.name"><i class="material-icons">close</i></button>
                                    </div>
                                    <button class="button vsg-center-node" @click="centerSelectedNode"><i class="material-icons">filter_center_focus</i><span>{{ tr('center_node') }}</span></button>
                                </template>
                            </section>
                            <section v-if="node && selectedDiagnostics.length" class="vsg-inspector-section vsg-context-diagnostics">
                                <div class="vsg-section-heading"><div><i class="material-icons">warning</i><h3>{{ tr('diagnostics') }}</h3></div><small>{{ selectedDiagnostics.length }}</small></div>
                                <button v-for="(message, index) in selectedDiagnostics" :key="index" class="vsg-diagnostic" :class="'is-' + message.severity" @click="selectDiagnostic(message)"><i class="material-icons">{{ message.severity === 'error' ? 'error' : 'warning' }}</i><span><strong>{{ diagnosticTitle(message) }}</strong>{{ message.message }}</span></button>
                                <button class="vsg-text-action" @click="openAllDiagnostics">{{ tr('view_all_diagnostics') }}<i class="material-icons">chevron_right</i></button>
                            </section>
                        </div>

                        <div v-else class="vsg-inspector-tabpanel" role="tabpanel">
                            <section class="vsg-inspector-section vsg-diagnostics">
                                <div class="vsg-section-heading"><div><i class="material-icons">fact_check</i><h3>{{ tr('diagnostics') }}</h3></div><small>{{ runtime.diagnostics.length }}</small></div>
                                <div v-if="!runtime.diagnostics.length" class="vsg-diagnostic is-success"><i class="material-icons">check_circle</i><span>{{ tr('no_diagnostics') }}</span></div>
                                <article v-for="(message, index) in runtime.diagnostics" :key="index" class="vsg-diagnostic-card" :class="'is-' + message.severity">
                                    <div class="vsg-diagnostic-card-body"><i class="material-icons">{{ message.severity === 'error' ? 'error' : 'warning' }}</i><span><strong>{{ diagnosticTitle(message) }}</strong>{{ message.message }}</span></div>
                                    <button v-if="message.nodeId" class="button" @click="selectDiagnostic(message)"><i class="material-icons">filter_center_focus</i><span>{{ tr('center_node') }}</span></button>
                                </article>
                            </section>
                        </div>
                    </template>
                    <div v-else class="vsg-inspector-empty vsg-inspector-empty-large"><i class="material-icons">schema</i><span>{{ tr('empty_body') }}</span></div>
                </div>`
        };
    }

    function reidentifyGraph(graph) {
        const clone = sanitizeGraph(deepClone(graph));
        clone.id = makeId('graph');
        clone.settings.materialId = `${GENERATED_MATERIAL_PREFIX}${safeIdentifier(clone.id, 'graph')}`;
        const nodeIds = new Map();
        clone.nodes.forEach(node => {
            const oldId = node.id;
            node.id = makeId('node');
            nodeIds.set(oldId, node.id);
        });
        clone.edges.forEach(edge => {
            edge.id = makeId('edge');
            edge.from.node = nodeIds.get(edge.from.node) || edge.from.node;
            edge.to.node = nodeIds.get(edge.to.node) || edge.to.node;
        });
        clone.createdAt = clone.updatedAt = Date.now();
        clone.revision = 0;
        return clone;
    }

    function exportActiveGraph() {
        const graph = Runtime.activeGraph;
        if (!graph) return false;
        let content;
        try {
            content = serializeGraph(graph);
        } catch (error) {
            Blockbench.showToastNotification({ text: error.message || tr('graph_too_large'), icon: 'error', expire: 6000 });
            return false;
        }
        Blockbench.export({
            type: 'Lightflow Visual Shader Graph',
            extensions: ['lfsg'],
            name: graph.name,
            content
        });
        return true;
    }

    function importGraphFile() {
        Blockbench.import({
            type: 'Lightflow Visual Shader Graph',
            extensions: ['lfsg', 'json'],
            multiple: true
        }, files => {
            const imported = [];
            const failures = [];
            (files || []).forEach(file => {
                try {
                    imported.push(reidentifyGraph(parseGraphFile(file.content)));
                } catch (error) {
                    failures.push(error);
                }
            });
            if (!imported.length) {
                const message = failures[0]?.message || tr('compile_failed');
                Blockbench.showToastNotification({ text: message, icon: 'error', expire: 6000 });
                return;
            }
            Runtime.runUndo('Import visual shader graph', () => {
                imported.forEach(graph => {
                    graph.name = Runtime.uniqueGraphName(graph.name);
                    Runtime.graphs.push(graph);
                });
                Runtime.activeGraphId = imported[imported.length - 1].id;
                Runtime.selectedNodeIds = [];
            }, { cause: 'import_graph' });
            Blockbench.showQuickMessage(tr('graph_imported'), 2200);
            if (failures.length) console.warn('[Visual Shader Graph] Some graph files could not be imported.', failures);
        });
    }

    function exportCompiledMaterial() {
        const graph = Runtime.activeGraph;
        if (!graph) return false;
        const material = Runtime.getCompiledMaterial(graph) || Runtime.compileActive({ cause: 'export_material' });
        if (!material) return false;
        Blockbench.export({
            type: 'Shader Architect Material',
            extensions: ['samat'],
            name: material.name || graph.name,
            content: JSON.stringify(material.toJSON(), null, 4)
        });
        Blockbench.showQuickMessage(tr('material_exported'), 1800);
        return true;
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.id = 'visual_shader_graph_styles';
        style.textContent = `
            .panel[panel_id="visual_shader_graph_canvas"] .panel_content,
            .panel[panel_id="visual_shader_graph_library"] .panel_content,
            .panel[panel_id="visual_shader_graph_inspector"] .panel_content {
                padding: 0 !important;
                overflow: hidden;
            }
            .vsg-canvas-panel,
            .vsg-library,
            .vsg-inspector {
                width: 100%;
                height: 100%;
                color: var(--color-text);
                background: var(--color-ui);
                font-family: var(--font-custom, inherit);
            }
            .vsg-canvas-panel {
                display: grid;
                grid-template-rows: 36px minmax(0, 1fr);
                min-height: 180px;
            }
            .vsg-toolbar {
                display: flex;
                align-items: center;
                min-width: 0;
                gap: 3px;
                padding: 3px 6px;
                border-bottom: 1px solid var(--color-border);
                background: var(--color-ui);
            }
            .vsg-graph-select {
                width: min(260px, 28vw);
                height: 28px;
                padding: 0 28px 0 8px;
                font-weight: 600;
            }
            .vsg-tool-button {
                display: inline-grid !important;
                place-items: center;
                width: 28px !important;
                height: 28px !important;
                min-width: 28px;
                margin: 0 !important;
                border: 1px solid transparent;
                border-radius: 3px;
            }
            .vsg-tool-button:hover:not(:disabled),
            .vsg-tool-button:focus-visible {
                border-color: var(--color-border);
                background: var(--color-button);
            }
            .vsg-tool-button:active:not(:disabled),
            .vsg-library-item:active,
            .vsg-preset-button:active {
                transform: translateY(1px);
            }
            .vsg-tool-button:disabled {
                opacity: 0.38;
                pointer-events: none;
            }
            .vsg-toolbar-separator {
                width: 1px;
                height: 20px;
                margin: 0 3px;
                background: var(--color-border);
            }
            .vsg-toolbar-spacer { flex: 1 1 auto; }
            .vsg-status {
                display: inline-flex;
                align-items: center;
                min-width: 0;
                gap: 4px;
                margin-right: 5px;
                padding: 0 5px;
                color: var(--color-subtle_text);
                font-size: 11px;
                line-height: 24px;
                white-space: nowrap;
            }
            .vsg-status .material-icons { font-size: 15px; }
            .vsg-status.is-compiled { color: var(--color-axis-y); }
            .vsg-status.is-error { color: var(--color-close); }
            .vsg-status.is-compiling { color: var(--color-warning); }
            .vsg-graph-viewport {
                position: relative;
                min-width: 0;
                min-height: 0;
                overflow: hidden;
                outline: none;
                cursor: default;
                background-color: color-mix(in srgb, var(--color-back) 88%, var(--color-ui));
                background-image:
                    linear-gradient(color-mix(in srgb, var(--color-border) 28%, transparent) 1px, transparent 1px),
                    linear-gradient(90deg, color-mix(in srgb, var(--color-border) 28%, transparent) 1px, transparent 1px),
                    linear-gradient(color-mix(in srgb, var(--color-border) 48%, transparent) 1px, transparent 1px),
                    linear-gradient(90deg, color-mix(in srgb, var(--color-border) 48%, transparent) 1px, transparent 1px);
                background-size: 20px 20px, 20px 20px, 100px 100px, 100px 100px;
            }
            .vsg-graph-viewport:focus-visible {
                box-shadow: inset 0 0 0 2px var(--color-accent);
            }
            .vsg-graph-world {
                position: absolute;
                inset: 0 auto auto 0;
                width: 1px;
                height: 1px;
                transform-origin: 0 0;
            }
            .vsg-connections {
                position: absolute;
                inset: 0 auto auto 0;
                width: 1px;
                height: 1px;
                overflow: visible;
                pointer-events: none;
            }
            .vsg-connection,
            .vsg-connection-hit {
                fill: none;
                vector-effect: non-scaling-stroke;
                stroke-linecap: round;
            }
            .vsg-connection {
                stroke-width: 2px;
                opacity: 0.82;
                pointer-events: none;
            }
            .vsg-connection.selected {
                stroke-width: 4px;
                opacity: 1;
            }
            .vsg-connection-hit {
                stroke: transparent;
                stroke-width: 12px;
                pointer-events: stroke;
                cursor: pointer;
            }
            .vsg-connection-draft {
                stroke-dasharray: 5 4;
                opacity: 1;
            }
            .vsg-node {
                position: absolute;
                z-index: 2;
                min-height: 58px;
                overflow: visible;
                border: 1px solid color-mix(in srgb, var(--node-color) 45%, var(--color-border));
                border-radius: 3px;
                background: color-mix(in srgb, var(--color-ui) 94%, var(--node-color));
                box-shadow: 0 3px 10px color-mix(in srgb, var(--color-back) 35%, transparent);
                user-select: none;
            }
            .vsg-node.output {
                border-width: 2px;
            }
            .vsg-node.selected {
                z-index: 3;
                outline: 2px solid var(--color-accent);
                outline-offset: 1px;
            }
            .vsg-node-header {
                display: grid;
                grid-template-columns: 20px minmax(0, 1fr) auto;
                align-items: center;
                min-height: 34px;
                gap: 5px;
                padding: 3px 7px;
                border-bottom: 1px solid color-mix(in srgb, var(--node-color) 28%, var(--color-border));
                border-radius: 2px 2px 0 0;
                background: color-mix(in srgb, var(--node-color) 22%, var(--color-ui));
                cursor: grab;
            }
            .vsg-node-header:active { cursor: grabbing; }
            .vsg-node-header > .material-icons { color: var(--node-color); font-size: 18px; }
            .vsg-node-header > span {
                overflow: hidden;
                font-size: 12px;
                font-weight: 650;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .vsg-node-header > small {
                max-width: 72px;
                overflow: hidden;
                color: var(--color-subtle_text);
                font: 10px var(--font-code, monospace);
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .vsg-node-body { padding: 6px 0; }
            .vsg-port-row {
                display: grid;
                grid-template-columns: minmax(58px, 1fr) minmax(0, 74px) minmax(58px, 1fr);
                align-items: center;
                min-height: 32px;
                gap: 3px;
            }
            .vsg-port-side {
                display: flex;
                align-items: center;
                min-width: 0;
                gap: 5px;
                font-size: 10.5px;
            }
            .vsg-port-side-input { grid-column: 1; justify-content: flex-start; }
            .vsg-inline-input { grid-column: 2; }
            .vsg-port-side-output { grid-column: 3; justify-content: flex-end; text-align: right; }
            .vsg-port-label {
                overflow: hidden;
                color: var(--color-text);
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .vsg-port {
                position: relative;
                width: 13px;
                height: 13px;
                flex: 0 0 13px;
                padding: 0;
                border: 2px solid var(--port-color);
                border-radius: 50%;
                background: var(--color-ui);
                cursor: crosshair;
            }
            .vsg-port:hover,
            .vsg-port:focus-visible,
            .vsg-port.connected {
                background: var(--port-color);
                box-shadow: 0 0 0 2px color-mix(in srgb, var(--port-color) 28%, transparent);
                outline: none;
            }
            .vsg-port-input { margin-left: 0; }
            .vsg-port-output { margin-right: 0; }
            .vsg-inline-input {
                width: 100%;
                height: 23px;
                min-width: 0;
                padding: 1px 4px;
                font: 10px var(--font-code, monospace);
                text-align: right;
            }
            .vsg-empty-state {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 220px;
                padding: 28px;
                text-align: center;
                background: color-mix(in srgb, var(--color-back) 88%, var(--color-ui));
            }
            .vsg-empty-state > .material-icons { color: var(--color-subtle_text); font-size: 48px; }
            .vsg-empty-state h2 { margin: 10px 0 4px; font-size: 16px; }
            .vsg-empty-state p { max-width: 420px; margin: 0 0 16px; color: var(--color-subtle_text); }
            .vsg-empty-state > button {
                width: max-content !important;
                min-width: 140px !important;
                max-width: 100%;
                height: auto !important;
                min-height: 32px;
                padding: 6px 14px !important;
                line-height: 1.3;
                white-space: normal;
            }
            .vsg-toolbar button:disabled { opacity: .45; cursor: default; }
            .vsg-library {
                overflow-y: auto;
                scrollbar-width: thin;
            }
            .vsg-library-search {
                position: sticky;
                z-index: 2;
                top: 0;
                display: grid;
                grid-template-columns: 22px minmax(0, 1fr);
                align-items: center;
                gap: 3px;
                padding: 6px;
                border-bottom: 1px solid var(--color-border);
                background: var(--color-ui);
            }
            .vsg-library-search .material-icons { color: var(--color-subtle_text); font-size: 17px; text-align: center; }
            .vsg-library-search input { width: 100%; height: 27px; }
            .vsg-library-section { padding: 5px 0; }
            .vsg-library-category + .vsg-library-category { border-top: 1px solid color-mix(in srgb, var(--color-border) 65%, transparent); }
            .vsg-section-header,
            .vsg-library-item,
            .vsg-preset-button,
            .vsg-diagnostic {
                width: 100%;
                border: 0;
                border-radius: 0;
                color: var(--color-text);
                background: transparent;
                text-align: left;
            }
            .vsg-section-header {
                display: grid;
                grid-template-columns: 18px 20px minmax(0, 1fr) auto;
                align-items: center;
                min-height: 29px;
                gap: 4px;
                padding: 2px 7px;
                font-size: 11px;
                font-weight: 650;
            }
            .vsg-section-header:hover { background: var(--color-button); }
            .vsg-section-header .material-icons { font-size: 16px; }
            .vsg-section-header small { color: var(--color-subtle_text); font: 10px var(--font-code, monospace); }
            .vsg-library-items { padding: 1px 0 5px; }
            .vsg-library-item,
            .vsg-preset-button {
                display: grid;
                grid-template-columns: 23px minmax(0, 1fr) 18px;
                align-items: center;
                min-height: 30px;
                gap: 5px;
                padding: 2px 8px 2px 21px;
                font-size: 11px;
            }
            .vsg-library-item:hover,
            .vsg-library-item:focus-visible,
            .vsg-preset-button:hover,
            .vsg-preset-button:focus-visible {
                color: var(--color-text);
                background: var(--color-button);
                outline: 1px solid var(--color-accent);
                outline-offset: -1px;
            }
            .vsg-library-item > .material-icons,
            .vsg-preset-button > .material-icons { font-size: 16px; }
            .vsg-add-indicator { opacity: 0; color: var(--color-subtle_text); }
            .vsg-library-item:hover .vsg-add-indicator,
            .vsg-library-item:focus-visible .vsg-add-indicator { opacity: 1; }
            .vsg-preset-section { border-top: 1px solid var(--color-border); }
            .vsg-preset-section h3 {
                margin: 9px 8px 4px;
                color: var(--color-subtle_text);
                font-size: 10px;
                font-weight: 650;
                letter-spacing: .04em;
                text-transform: uppercase;
            }
            .vsg-preset-button { grid-template-columns: 23px minmax(0, 1fr); padding-left: 12px; }
            .vsg-inspector {
                overflow-y: auto;
                scrollbar-width: thin;
            }
            .vsg-inspector-section {
                padding: 8px;
                border-bottom: 1px solid var(--color-border);
            }
            .vsg-inspector-section > h3 {
                display: grid;
                grid-template-columns: 20px minmax(0, 1fr) auto;
                align-items: center;
                gap: 4px;
                margin: 0 0 8px;
                font-size: 11px;
                font-weight: 700;
            }
            .vsg-inspector-section > h3 .material-icons { color: var(--color-subtle_text); font-size: 17px; }
            .vsg-inspector-section > h3 small { color: var(--color-subtle_text); font: 10px var(--font-code, monospace); }
            .vsg-inspector-section h4 {
                margin: 12px 0 5px;
                color: var(--color-subtle_text);
                font-size: 10px;
                font-weight: 650;
            }
            .vsg-field {
                display: grid;
                grid-template-columns: minmax(92px, .8fr) minmax(110px, 1.2fr);
                align-items: center;
                min-height: 31px;
                gap: 7px;
                font-size: 10.5px;
            }
            .vsg-field > span { color: var(--color-subtle_text); }
            .vsg-field input,
            .vsg-field select { width: 100%; min-width: 0; height: 25px; }
            .vsg-field input[type="color"] { padding: 2px; }
            .vsg-field.vsg-check-field,
            .vsg-check-field {
                display: flex;
                align-items: center;
                min-height: 29px;
                gap: 7px;
                font-size: 10.5px;
            }
            .vsg-field.vsg-check-field > span,
            .vsg-check-field > span { color: var(--color-text); }
            .vsg-code-input {
                grid-column: 1 / -1;
                width: 100%;
                min-height: 82px;
                padding: 6px;
                resize: vertical;
                font: 10.5px/1.45 var(--font-code, monospace);
                tab-size: 4;
            }
            .vsg-mono { font-family: var(--font-code, monospace) !important; font-variant-numeric: tabular-nums; }
            .vsg-inspector-actions {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 5px;
                margin-top: 8px;
            }
            .vsg-inspector-actions .button {
                display: flex;
                align-items: center;
                justify-content: center;
                min-width: 0;
                gap: 4px;
                padding: 0 6px;
                font-size: 10px;
                white-space: nowrap;
            }
            .vsg-inspector-actions .material-icons { font-size: 15px; }
            .vsg-secondary-actions .button { color: var(--color-subtle_text); }
            .vsg-selected-node-title {
                display: grid;
                grid-template-columns: 22px minmax(0, 1fr) auto;
                align-items: center;
                gap: 5px;
                margin: 0 -8px 8px;
                padding: 6px 8px;
                border-block: 1px solid color-mix(in srgb, var(--node-color) 35%, var(--color-border));
                background: color-mix(in srgb, var(--node-color) 13%, transparent);
            }
            .vsg-selected-node-title .material-icons { color: var(--node-color); font-size: 18px; }
            .vsg-selected-node-title strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
            .vsg-selected-node-title code { color: var(--color-subtle_text); font-size: 9px; }
            .vsg-inspector-empty {
                padding: 12px 6px;
                color: var(--color-subtle_text);
                font-size: 11px;
                line-height: 1.4;
                text-align: center;
            }
            .vsg-inspector-empty-large {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 180px;
                gap: 8px;
            }
            .vsg-inspector-empty-large .material-icons { font-size: 34px; }
            .vsg-input-default-row {
                display: grid;
                grid-template-columns: 8px minmax(70px, 1fr) minmax(80px, 1fr) auto;
                align-items: center;
                min-height: 29px;
                gap: 5px;
                font-size: 10px;
            }
            .vsg-input-default-row.connected { opacity: .62; }
            .vsg-input-default-row > input.dark_bordered { width: 100%; min-width: 0; height: 23px; }
            .vsg-port-swatch { width: 7px; height: 7px; border-radius: 50%; }
            .vsg-connected-label { color: var(--color-subtle_text); font-style: italic; text-align: right; }
            .vsg-remove-port { width: 20px !important; height: 20px !important; min-width: 20px; }
            .vsg-remove-port .material-icons { font-size: 14px; }
            .vsg-add-uniform-row {
                display: grid;
                grid-template-columns: minmax(0, 1fr) 26px;
                gap: 4px;
                margin-top: 8px;
            }
            .vsg-add-uniform-row select { width: 100%; height: 25px; }
            .vsg-add-uniform-row .tool { width: 26px !important; height: 25px !important; }
            .vsg-preset-note {
                display: grid;
                grid-template-columns: 18px minmax(0, 1fr);
                gap: 5px;
                margin-top: 7px;
                padding: 6px;
                border-left: 2px solid var(--color-accent);
                color: var(--color-subtle_text);
                background: color-mix(in srgb, var(--color-accent) 8%, transparent);
                font-size: 9.5px;
                line-height: 1.4;
            }
            .vsg-preset-note .material-icons { font-size: 15px; }
            .vsg-diagnostic {
                display: grid;
                grid-template-columns: 19px minmax(0, 1fr);
                align-items: start;
                gap: 5px;
                padding: 5px 4px;
                font-size: 10px;
                line-height: 1.35;
            }
            button.vsg-diagnostic:hover { background: var(--color-button); }
            .vsg-diagnostic .material-icons { font-size: 15px; }
            .vsg-diagnostic.is-error .material-icons { color: var(--color-close); }
            .vsg-diagnostic.is-warning .material-icons { color: var(--color-warning); }
            .vsg-diagnostic.is-success { color: var(--color-subtle_text); }
            .vsg-diagnostic.is-success .material-icons { color: var(--color-axis-y); }
            .vsg-diagnostic + .vsg-diagnostic { border-top: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent); }
            @media (max-width: 900px) {
                .vsg-status { display: none; }
                .vsg-graph-select { width: min(180px, 34vw); }
                .vsg-field { grid-template-columns: 1fr; gap: 2px; padding-block: 3px; }
                .vsg-inspector-actions { grid-template-columns: 1fr; }
            }

            /* Production workbench redesign */
            .vsg-canvas-panel,
            .vsg-library,
            .vsg-inspector,
            .vsg-canvas-panel *,
            .vsg-library *,
            .vsg-inspector * { box-sizing: border-box; }
            .vsg-canvas-panel {
                grid-template-rows: 44px minmax(0, 1fr) 30px;
                container: vsg-canvas / inline-size;
                min-height: 260px;
                overflow: hidden;
            }
            .vsg-toolbar {
                min-height: 44px;
                gap: 5px;
                padding: 5px 7px;
                overflow: hidden;
            }
            .vsg-toolbar-group {
                display: inline-flex;
                align-items: center;
                min-width: 0;
                gap: 3px;
            }
            .vsg-toolbar-group + .vsg-toolbar-group {
                padding-left: 5px;
                border-left: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
            }
            .vsg-toolbar-graph { flex: 0 1 230px; min-width: 132px; }
            .vsg-toolbar-files { flex: 0 0 auto; }
            .vsg-toolbar-compile { flex: 0 0 auto; }
            .vsg-toolbar-view { flex: 0 0 auto; }
            .vsg-graph-select {
                width: 100%;
                max-width: none;
                height: 30px;
                padding-inline: 9px 28px;
                border-color: color-mix(in srgb, var(--color-border) 85%, transparent);
                font-size: 12px;
                font-weight: 650;
            }
            button.vsg-toolbar-action,
            button.vsg-primary-action,
            button.vsg-apply-action,
            .vsg-inspector-actions button,
            button.vsg-center-node {
                display: inline-flex !important;
                align-items: center;
                justify-content: center;
                width: auto !important;
                min-width: 0 !important;
                height: 30px !important;
                margin: 0 !important;
                gap: 5px;
                padding: 0 8px !important;
                overflow: hidden;
                border-radius: 3px;
                line-height: 1;
                white-space: nowrap;
            }
            button.vsg-toolbar-action > span,
            button.vsg-primary-action > span,
            button.vsg-apply-action > span,
            .vsg-inspector-actions button > span,
            button.vsg-center-node > span {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            button.vsg-toolbar-action .material-icons,
            button.vsg-primary-action .material-icons,
            button.vsg-apply-action .material-icons { flex: 0 0 auto; font-size: 16px; }
            button.vsg-primary-action { min-width: 86px !important; font-weight: 650; }
            button.vsg-apply-action { min-width: 72px !important; }
            .vsg-chevron { margin-left: -3px; font-size: 16px !important; }
            .vsg-toolbar-spacer { min-width: 0; }
            .vsg-status {
                flex: 0 1 auto;
                max-width: 130px;
                margin: 0;
                padding: 0 4px;
                font-size: 11px;
                line-height: 28px;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .vsg-status .material-icons { flex: 0 0 auto; }
            .vsg-tool-button {
                width: 30px !important;
                min-width: 30px !important;
                max-width: 30px !important;
                height: 30px !important;
                padding: 0 !important;
            }
            .vsg-graph-viewport { isolation: isolate; }
            .vsg-graph-viewport.is-panning { cursor: grabbing; }
            .vsg-graph-viewport:focus-visible { box-shadow: inset 0 0 0 2px var(--color-accent); }
            .vsg-connections { overflow: visible; }
            .vsg-connection { stroke-width: 2px; opacity: .9; }
            .vsg-connection.selected { stroke-width: 3px; opacity: 1; }
            .vsg-connection-label {
                fill: var(--color-subtle_text);
                paint-order: stroke;
                stroke: color-mix(in srgb, var(--color-back) 92%, transparent);
                stroke-width: 4px;
                stroke-linejoin: round;
                font: 10px var(--font-code, monospace);
                text-anchor: middle;
                pointer-events: none;
            }
            .vsg-node {
                min-height: 76px;
                border-color: color-mix(in srgb, var(--node-color) 58%, var(--color-border));
                border-radius: 4px;
                background: color-mix(in srgb, var(--color-ui) 97%, var(--node-color));
                box-shadow: 0 3px 12px color-mix(in srgb, var(--color-back) 44%, transparent);
            }
            .vsg-node.output { border-width: 1px; }
            .vsg-node.selected {
                outline: 2px solid var(--color-accent);
                outline-offset: 2px;
                box-shadow: 0 0 0 1px color-mix(in srgb, var(--node-color) 70%, transparent), 0 5px 18px color-mix(in srgb, var(--color-back) 55%, transparent);
            }
            .vsg-node:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }
            .vsg-node-header {
                min-height: 34px;
                grid-template-columns: 20px minmax(0, 1fr);
                gap: 5px;
                padding: 4px 8px;
                background: color-mix(in srgb, var(--node-color) 16%, var(--color-ui));
            }
            .vsg-node-header > span { font-size: 12px; font-weight: 700; }
            .vsg-node-meta {
                display: flex;
                align-items: center;
                justify-content: space-between;
                min-height: 24px;
                gap: 8px;
                padding: 3px 9px;
                color: var(--color-subtle_text);
                background: color-mix(in srgb, var(--color-back) 24%, transparent);
                font-size: 10.5px;
            }
            .vsg-node-meta > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .vsg-node-meta > code { color: var(--color-text); font-size: 10px; font-variant-numeric: tabular-nums; }
            .vsg-advanced-color-control,
            .vsg-node-number-control,
            .vsg-node-bool-control {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: flex-end;
                min-width: 0;
                gap: 5px;
                color: var(--color-text);
            }
            .vsg-advanced-color-control {
                flex: 0 1 108px;
                width: 108px;
                height: 22px;
                overflow: visible;
            }
            .vsg-advanced-color-control.full_width_dialog_bar {
                width: 100% !important;
                height: 22px !important;
                min-height: 22px !important;
                margin: 0 !important;
            }
            .vsg-advanced-color-control .light_manager_advanced_color_control,
            .vsg-advanced-color-control .light_manager_advanced_color_control.is_expanded {
                width: 100% !important;
                min-width: 72px !important;
                max-width: 108px !important;
                height: 22px !important;
            }
            .vsg-advanced-color-control .sp-replacer {
                width: 100% !important;
                min-width: 0 !important;
                height: 22px !important;
                margin: 0 !important;
            }
            .vsg-advanced-color-control .sp-preview { height: 16px !important; }
            .vsg-node-number-control { flex: 1 1 118px; }
            .vsg-node-number-control > input[type="range"] { width: 66px; min-width: 36px; height: 18px; margin: 0; }
            .vsg-node-number-input {
                width: 48px !important;
                min-width: 42px;
                height: 21px !important;
                padding: 0 3px !important;
                font: 9.5px var(--font-code, monospace) !important;
                text-align: right;
            }
            .vsg-node-bool-control { cursor: pointer; font: 10px var(--font-code, monospace); }
            .vsg-node-bool-control > input { margin: 0; }
            .vsg-node-body { padding: 6px 0 7px; }
            .vsg-port-row {
                grid-template-columns: minmax(68px, 1fr) minmax(44px, 68px) minmax(68px, 1fr);
                min-height: 32px;
                gap: 2px;
            }
            .vsg-port-side { gap: 3px; font-size: 11px; }
            .vsg-port-label { min-width: 0; line-height: 1.2; }
            button.vsg-port {
                position: relative !important;
                display: block !important;
                flex: 0 0 24px !important;
                inline-size: 24px !important;
                min-inline-size: 24px !important;
                max-inline-size: 24px !important;
                block-size: 24px !important;
                min-block-size: 24px !important;
                max-block-size: 24px !important;
                width: 24px !important;
                min-width: 24px !important;
                max-width: 24px !important;
                height: 24px !important;
                min-height: 24px !important;
                max-height: 24px !important;
                margin: 0 !important;
                padding: 0 !important;
                border: 0 !important;
                border-radius: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
                appearance: none;
                -webkit-appearance: none;
                cursor: crosshair;
            }
            button.vsg-port::before {
                content: '';
                position: absolute;
                inset: 5px;
                border: 2px solid var(--port-color);
                border-radius: 50%;
                background: var(--color-ui);
                transition: background-color 90ms ease, box-shadow 90ms ease, transform 90ms ease;
            }
            button.vsg-port:hover::before,
            button.vsg-port:focus-visible::before,
            button.vsg-port.connected::before {
                background: var(--port-color);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--port-color) 25%, transparent);
            }
            button.vsg-port:focus-visible { outline: 2px solid var(--color-accent) !important; outline-offset: -2px; }
            button.vsg-port:active::before { transform: scale(.86); }
            .vsg-port-input { margin-left: 0 !important; }
            .vsg-port-output { margin-right: 0 !important; }
            .vsg-inline-input { height: 24px; font-size: 10.5px; }
            .vsg-statusbar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                min-width: 0;
                gap: 12px;
                padding: 0 8px;
                border-top: 1px solid var(--color-border);
                color: var(--color-subtle_text);
                background: var(--color-ui);
                font-size: 10.5px;
            }
            .vsg-statusbar-group { display: inline-flex; align-items: center; min-width: 0; gap: 13px; }
            .vsg-statusbar-group > span { display: inline-flex; align-items: center; min-width: 0; gap: 4px; white-space: nowrap; }
            .vsg-statusbar .material-icons { font-size: 13px; }
            .vsg-statusbar .is-compiled { color: var(--color-axis-y); }
            .vsg-statusbar-tools { justify-content: flex-end; gap: 7px; }
            .vsg-segmented { display: inline-flex; height: 23px; border: 1px solid var(--color-border); border-radius: 3px; overflow: hidden; }
            .vsg-segmented button {
                width: 27px !important;
                min-width: 27px !important;
                height: 21px !important;
                padding: 0 !important;
                border: 0;
                border-radius: 0;
                color: var(--color-subtle_text);
                background: transparent;
                font: 10px var(--font-code, monospace);
            }
            .vsg-segmented button + button { border-left: 1px solid var(--color-border); }
            .vsg-segmented button.active { color: var(--color-accent_text); background: var(--color-accent); }
            .vsg-shortcut-hint kbd {
                min-width: 18px;
                padding: 1px 4px;
                border: 1px solid var(--color-border);
                border-bottom-color: color-mix(in srgb, var(--color-border) 70%, var(--color-back));
                border-radius: 3px;
                color: var(--color-text);
                background: var(--color-button);
                font: 9.5px var(--font-code, monospace);
                text-align: center;
            }
            .vsg-sr-only {
                position: absolute !important;
                width: 1px !important;
                height: 1px !important;
                margin: -1px !important;
                padding: 0 !important;
                overflow: hidden !important;
                clip: rect(0, 0, 0, 0) !important;
                white-space: nowrap !important;
                border: 0 !important;
            }

            .vsg-library { overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; }
            .vsg-library-search {
                position: sticky;
                top: 0;
                z-index: 4;
                grid-template-columns: 24px minmax(0, 1fr);
                min-height: 43px;
                padding: 7px;
            }
            .vsg-library-search input { height: 29px; font-size: 11.5px; }
            .vsg-library-section { padding: 7px 0; }
            .vsg-library-section > h3 {
                margin: 2px 10px 6px;
                color: var(--color-subtle_text);
                font-size: 10px;
                font-weight: 700;
                letter-spacing: .055em;
                text-transform: uppercase;
            }
            .vsg-recent-section,
            .vsg-preset-section { border-bottom: 1px solid var(--color-border); }
            .vsg-recent-item,
            .vsg-library-more {
                display: grid;
                grid-template-columns: 22px minmax(0, 1fr) auto;
                align-items: center;
                width: 100%;
                min-height: 30px;
                gap: 4px;
                padding: 3px 9px;
                border: 0;
                color: var(--color-text);
                background: transparent;
                text-align: left;
            }
            .vsg-recent-item:hover,
            .vsg-recent-item:focus-visible,
            .vsg-library-more:hover,
            .vsg-library-more:focus-visible { background: var(--color-button); outline: 1px solid var(--color-accent); outline-offset: -1px; }
            .vsg-recent-item small { color: var(--color-subtle_text); font: 9px var(--font-code, monospace); }
            .vsg-type-dot {
                width: 11px;
                height: 11px;
                justify-self: center;
                border: 2px solid;
                border-radius: 50%;
                background: var(--color-ui);
            }
            .vsg-preset-section h3 { margin: 2px 10px 6px; }
            .vsg-preset-button {
                grid-template-columns: 24px minmax(0, 1fr) 20px;
                min-height: 31px;
                padding: 4px 9px;
                font-size: 11.5px;
            }
            .vsg-library-more { grid-template-columns: minmax(0, 1fr) 20px; color: var(--color-text); font-size: 12px; }
            .vsg-library-more > .material-icons { font-size: 15px; }
            .vsg-section-header { min-height: 33px; font-size: 11px; }
            .vsg-library-item { min-height: 31px; padding-block: 4px; font-size: 11px; }

            .vsg-inspector {
                container: vsg-inspector / inline-size;
                overflow-y: auto;
                overflow-x: hidden;
            }
            .vsg-inspector-tabs {
                position: sticky;
                top: 0;
                z-index: 5;
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                min-height: 40px;
                border-bottom: 1px solid var(--color-border);
                background: var(--color-ui);
            }
            .vsg-inspector-tabs button {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 0 !important;
                height: 39px !important;
                gap: 5px;
                padding: 0 6px !important;
                overflow: hidden;
                border: 0;
                border-radius: 0;
                color: var(--color-subtle_text);
                background: transparent;
                font-size: 10.5px;
            }
            .vsg-inspector-tabs button::after {
                content: '';
                position: absolute;
                right: 8px;
                bottom: 0;
                left: 8px;
                height: 2px;
                background: transparent;
            }
            .vsg-inspector-tabs button:hover,
            .vsg-inspector-tabs button:focus-visible { color: var(--color-text); background: var(--color-button); outline: none; }
            .vsg-inspector-tabs button:focus-visible { box-shadow: inset 0 0 0 2px var(--color-accent); }
            .vsg-inspector-tabs button.active { color: var(--color-text); }
            .vsg-inspector-tabs button.active::after { background: var(--color-accent); }
            .vsg-inspector-tabs .material-icons { flex: 0 0 auto; font-size: 15px; }
            .vsg-inspector-tabs span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .vsg-inspector-tabs small {
                flex: 0 0 auto;
                min-width: 17px;
                padding: 1px 4px;
                border-radius: 3px;
                color: var(--color-accent_text);
                background: var(--color-accent);
                font: 9px var(--font-code, monospace);
            }
            .vsg-inspector-tabpanel { min-width: 0; }
            .vsg-inspector-section { padding: 10px; }
            .vsg-section-heading {
                display: flex;
                align-items: center;
                justify-content: space-between;
                min-height: 25px;
                gap: 8px;
                margin-bottom: 8px;
            }
            .vsg-section-heading > div { display: flex; align-items: center; min-width: 0; gap: 6px; }
            .vsg-section-heading h3 { margin: 0; overflow: hidden; font-size: 11.5px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
            .vsg-section-heading .material-icons { color: var(--color-subtle_text); font-size: 17px; }
            .vsg-section-heading > small { color: var(--color-subtle_text); font: 10px var(--font-code, monospace); }
            .vsg-more-button { width: 26px !important; min-width: 26px !important; height: 26px !important; }
            .vsg-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; margin: 0; background: var(--color-border); }
            .vsg-summary-grid > div { display: flex; align-items: center; justify-content: space-between; min-width: 0; min-height: 31px; gap: 8px; padding: 5px 7px; background: var(--color-ui); }
            .vsg-summary-grid > div:last-child { grid-column: 1 / -1; }
            .vsg-summary-grid dt { min-width: 0; overflow: hidden; color: var(--color-subtle_text); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
            .vsg-summary-grid dd { margin: 0; color: var(--color-text); font: 10px var(--font-code, monospace); }
            .vsg-summary-grid dd.is-compiled { color: var(--color-axis-y); }
            .vsg-field {
                grid-template-columns: minmax(94px, .72fr) minmax(0, 1.28fr);
                min-height: 34px;
                gap: 8px;
                font-size: 11px;
            }
            .vsg-field > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .vsg-field input,
            .vsg-field select { width: 100%; min-width: 0; max-width: 100%; height: 27px; font-size: 11px; }
            .vsg-field-stack { grid-template-columns: 1fr; gap: 4px; padding-block: 3px; }
            .vsg-copy-field { display: grid; grid-template-columns: minmax(0, 1fr) 27px; min-width: 0; gap: 4px; }
            .vsg-copy-field .tool { width: 27px !important; min-width: 27px !important; height: 27px !important; }
            .vsg-copy-field .material-icons { font-size: 15px; }
            .vsg-check-field { min-height: 34px; font-size: 11px; }
            .vsg-inspector-actions { grid-template-columns: minmax(0, 1fr) minmax(82px, .55fr); gap: 6px; margin-top: 10px; }
            .vsg-inspector-actions .button { width: 100% !important; min-height: 30px; font-size: 10.5px; }
            .vsg-selected-node-title {
                grid-template-columns: 20px minmax(0, 1fr) auto;
                min-height: 42px;
                margin: 0 0 8px;
                padding: 7px 8px;
                border: 1px solid color-mix(in srgb, var(--node-color) 40%, var(--color-border));
                border-radius: 3px;
                background: color-mix(in srgb, var(--node-color) 10%, transparent);
            }
            .vsg-selected-node-dot { width: 13px; height: 13px; justify-self: center; border: 2px solid var(--node-color); border-radius: 50%; background: var(--color-ui); }
            .vsg-selected-node-title strong { font-size: 12px; }
            .vsg-selected-node-title code { max-width: 92px; overflow: hidden; font-size: 9.5px; text-overflow: ellipsis; white-space: nowrap; }
            button.vsg-center-node { width: 100% !important; margin-top: 10px !important; }
            .vsg-context-diagnostics { background: color-mix(in srgb, var(--color-warning) 3%, var(--color-ui)); }
            .vsg-diagnostic {
                min-height: 42px;
                padding: 7px 5px;
                font-size: 10.5px;
                text-align: left;
            }
            .vsg-diagnostic span { min-width: 0; overflow-wrap: anywhere; }
            .vsg-diagnostic strong { display: block; margin-bottom: 2px; color: var(--color-text); font-size: 10.5px; }
            .vsg-text-action {
                display: flex;
                align-items: center;
                justify-content: space-between;
                width: 100%;
                min-height: 30px;
                padding: 4px 6px;
                border: 0;
                color: var(--color-accent);
                background: transparent;
                font-size: 10.5px;
                text-align: left;
            }
            .vsg-text-action:hover,
            .vsg-text-action:focus-visible { background: var(--color-button); outline: 1px solid var(--color-accent); outline-offset: -1px; }
            .vsg-text-action .material-icons { font-size: 15px; }
            .vsg-diagnostic-card { padding: 8px; border: 1px solid var(--color-border); border-radius: 3px; background: color-mix(in srgb, var(--color-back) 18%, var(--color-ui)); }
            .vsg-diagnostic-card + .vsg-diagnostic-card { margin-top: 7px; }
            .vsg-diagnostic-card-body { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 6px; font-size: 10.5px; line-height: 1.4; }
            .vsg-diagnostic-card-body .material-icons { color: var(--color-warning); font-size: 17px; }
            .vsg-diagnostic-card.is-error .material-icons { color: var(--color-close); }
            .vsg-diagnostic-card-body strong { display: block; margin-bottom: 2px; }
            .vsg-diagnostic-card .button { display: flex !important; width: 100% !important; min-width: 0 !important; height: 29px !important; margin-top: 8px; gap: 5px; }
            .vsg-preset-note { font-size: 10px; }
            .vsg-input-default-row { grid-template-columns: 9px minmax(64px, 1fr) minmax(74px, 1fr) auto; min-height: 31px; font-size: 10.5px; }

            @container vsg-canvas (max-width: 980px) {
                .vsg-toolbar-action .vsg-action-label { display: none; }
                button.vsg-toolbar-action { width: 30px !important; min-width: 30px !important; padding: 0 !important; }
                .vsg-toolbar-graph { flex-basis: 190px; }
                .vsg-statusbar-tools .vsg-shortcut-hint { display: none; }
            }
            @container vsg-canvas (max-width: 740px) {
                .vsg-toolbar-graph { flex-basis: 150px; min-width: 100px; }
                .vsg-status { display: none; }
                .vsg-apply-action > span,
                .vsg-preview-label { display: none; }
                button.vsg-apply-action { width: 34px !important; min-width: 34px !important; padding: 0 !important; }
                .vsg-apply-action .vsg-chevron { display: none; }
                .vsg-statusbar-group { gap: 7px; }
            }
            @container vsg-canvas (max-width: 560px) {
                .vsg-toolbar-files { display: none; }
                .vsg-toolbar-graph { flex: 1 1 130px; }
                .vsg-statusbar-group > span:nth-child(2),
                .vsg-statusbar-group > span:nth-child(3),
                .vsg-preview-label { display: none; }
            }
            @container vsg-inspector (max-width: 320px) {
                .vsg-inspector-tabs button { gap: 3px; padding-inline: 3px !important; }
                .vsg-inspector-tabs .material-icons { display: none; }
                .vsg-field { grid-template-columns: 1fr; gap: 3px; padding-block: 4px; }
                .vsg-inspector-actions { grid-template-columns: 1fr; }
                .vsg-summary-grid { grid-template-columns: 1fr; }
                .vsg-summary-grid > div:last-child { grid-column: auto; }
            }
            @media (prefers-reduced-motion: reduce) {
                .vsg-tool-button,
                .vsg-library-item,
                .vsg-preset-button,
                button.vsg-port::before { transition: none !important; }
            }

            /* Shader Graph v3 composition/editor hardening */
            .vsg-node {
                min-width: 140px;
                max-width: 520px;
                overflow: hidden !important;
                contain: layout paint;
            }
            .vsg-node-header,
            .vsg-node-meta,
            .vsg-node-body,
            .vsg-port-row,
            .vsg-port-side { min-width: 0; max-width: 100%; }
            .vsg-node-header > span,
            .vsg-node-meta > span,
            .vsg-node-meta > code,
            .vsg-port-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .vsg-node-resize {
                position: absolute;
                right: 0;
                bottom: 0;
                z-index: 6;
                width: 14px;
                height: 14px;
                cursor: ew-resize;
                background: linear-gradient(135deg, transparent 0 45%, color-mix(in srgb, var(--color-subtle_text) 65%, transparent) 46% 55%, transparent 56% 66%, color-mix(in srgb, var(--color-subtle_text) 65%, transparent) 67% 76%, transparent 77%);
            }
            .vsg-node-group {
                position: absolute;
                z-index: 0;
                min-width: 160px;
                min-height: 90px;
                border: 1px solid color-mix(in srgb, var(--color-accent) 48%, var(--color-border));
                border-radius: 7px;
                background: color-mix(in srgb, var(--color-accent) 5%, transparent);
                pointer-events: none;
            }
            .vsg-node-group-title {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                display: flex;
                align-items: center;
                gap: 6px;
                height: 30px;
                padding: 0 9px;
                overflow: hidden;
                color: var(--color-text);
                background: color-mix(in srgb, var(--color-accent) 13%, var(--color-ui));
                font-size: 11px;
                font-weight: 700;
                cursor: grab;
                pointer-events: auto;
                user-select: none;
            }
            .vsg-node-group-title .material-icons { font-size: 15px; }
            .vsg-node-group-title span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .vsg-connections { z-index: 1; }
            .vsg-node { z-index: 2; }
            .vsg-tool-button.active { color: var(--color-accent_text) !important; background: var(--color-accent) !important; }
            .vsg-resource-section,
            .vsg-subgraph-section { border-top: 1px solid var(--color-border); }
            .vsg-resource-section h3,
            .vsg-subgraph-section h3 { margin: 8px 8px 4px; color: var(--color-subtle_text); font-size: 10px; letter-spacing: .04em; text-transform: uppercase; }
            .vsg-resource-item {
                display: grid;
                grid-template-columns: 22px minmax(0, 1fr) auto;
                align-items: center;
                width: 100%;
                min-height: 32px;
                gap: 5px;
                padding: 3px 8px 3px 12px;
                border: 0;
                color: var(--color-text);
                background: transparent;
                text-align: left;
            }
            .vsg-resource-item:hover,
            .vsg-resource-item:focus-visible { background: var(--color-button); outline: 1px solid var(--color-accent); outline-offset: -1px; }
            .vsg-resource-item > .material-icons { color: var(--color-subtle_text); font-size: 16px; }
            .vsg-resource-item > span:nth-child(2) { min-width: 0; }
            .vsg-resource-item strong,
            .vsg-resource-item small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .vsg-resource-item strong { font-size: 10.5px; font-weight: 650; }
            .vsg-resource-item small { color: var(--color-subtle_text); font: 9px var(--font-code, monospace); }
            .vsg-type-chip { padding: 1px 4px; border: 1px solid; border-radius: 8px; color: var(--color-subtle_text); font: 8.5px var(--font-code, monospace); }
        `;
        document.head.appendChild(style);
        return style;
    }

    const deletables = [];
    const publishedBindings = new Map();
    let graphMode = null;
    let graphCanvasPanel = null;
    let graphLibraryPanel = null;
    let graphInspectorPanel = null;

    function setGraphPreviewSize(size) {
        const normalized = ['small', 'medium', 'large'].includes(size) ? size : 'medium';
        Runtime.previewSize = normalized;
        if (graphCanvasPanel?.slot === 'bottom' && graphCanvasPanel.position_data) {
            const availableHeight = Math.max(520, window.Interface?.work_screen?.clientHeight || window.innerHeight - 110);
            const graphRatio = normalized === 'small' ? 0.73 : normalized === 'large' ? 0.43 : 0.58;
            graphCanvasPanel.position_data.height = Math.round(availableHeight * graphRatio);
            graphCanvasPanel.position_data.fixed_height = true;
            graphCanvasPanel.update?.();
            window.dispatchEvent(new Event('resize'));
        }
        Runtime.refresh();
    }

    function publishBinding(name, value) {
        publishedBindings.set(name, { previous: window[name], value });
        window[name] = value;
    }

    function restoreBindings() {
        Array.from(publishedBindings.entries()).reverse().forEach(([name, entry]) => {
            if (window[name] !== entry.value) return;
            if (entry.previous === undefined) delete window[name];
            else window[name] = entry.previous;
        });
        publishedBindings.clear();
    }

    function createPanels() {
        graphLibraryPanel = new Panel('visual_shader_graph_library', {
            name: tr('library'),
            icon: 'category',
            condition: { modes: ['shader_graph'] },
            default_position: { slot: 'left_bar', height: 560, width: 310 },
            growable: true,
            resizable: true,
            onResize() { Runtime.refresh(); },
            component: createNodeLibraryComponent()
        });
        graphCanvasPanel = new Panel('visual_shader_graph_canvas', {
            name: tr('title'),
            icon: 'schema',
            condition: { modes: ['shader_graph'] },
            default_position: { slot: 'bottom', height: 610, float_position: [220, 100], float_size: [1080, 720] },
            growable: true,
            resizable: true,
            expand_button: true,
            onResize() { Runtime.refresh(); },
            component: createGraphCanvasComponent()
        });
        graphInspectorPanel = new Panel('visual_shader_graph_inspector', {
            name: tr('inspector'),
            icon: 'tune',
            condition: { modes: ['shader_graph'] },
            default_position: { slot: 'right_bar', height: 560, width: 360 },
            growable: true,
            resizable: true,
            onResize() { Runtime.refresh(); },
            component: createGraphInspectorComponent()
        });
        deletables.push(graphLibraryPanel, graphCanvasPanel, graphInspectorPanel);
    }

    function selectShaderGraphMode() {
        if (!window.Project || !graphMode) return false;
        graphMode.select();
        return true;
    }

    function leaveShaderGraphMode() {
        if (window.Project?.mode !== 'shader_graph') return;
        const fallback = window.Modes?.options?.edit || window.Modes?.options?.paint || Object.values(window.Modes?.options || {}).find(mode => mode && mode !== graphMode && (!mode.condition || Condition(mode.condition)));
        fallback?.select?.();
    }

    const PUBLIC_API = Object.freeze(Object.assign({}, CORE_API, {
        apiVersion: 1,
        presets: PRESET_DEFINITIONS,
        runtime: Runtime,
        open: selectShaderGraphMode,
        createFromPreset: id => Runtime.createFromPreset(id),
        getActiveGraph: () => Runtime.activeGraph,
        getGraphs: () => Runtime.graphs.slice(),
        compileActive: options => Runtime.compileActive(options),
        applyGlobally: () => Runtime.applyMaterialGlobally(),
        applyToSelection: () => Runtime.applyMaterialToSelection(),
        importGraph: content => {
            const graph = reidentifyGraph(parseGraphFile(content));
            Runtime.runUndo('Import visual shader graph', () => {
                graph.name = Runtime.uniqueGraphName(graph.name);
                Runtime.graphs.push(graph);
                Runtime.activeGraphId = graph.id;
            }, { cause: 'api_import_graph' });
            return graph;
        },
        exportActiveGraph: () => Runtime.activeGraph ? serializeGraph(Runtime.activeGraph) : null
    }));

    Plugin.register(PLUGIN_ID, {
        title: 'Visual Shader Graph',
        icon: 'schema',
        author: 'MidFord327',
        description: 'Create production-ready staged vertex/fragment shader graphs for Lightflow with typed geometry attributes, custom varyings, exact uniforms, Shader Architect compilation, project persistence, and portable graph exports.',
        tags: ['Lightflow', 'Shaders', 'Materials'],
        version: '1.2.0',
        min_version: '4.9.0',
        variant: 'both',
        dependencies: ['light_manager', 'shader_architect'],

        onload() {
            Runtime.disposed = false;
            if (
                !window.LIGHT_MANAGER_LOADED ||
                !window.LightManagerUI ||
                !window.MaterialManager ||
                !window.FancyShaderMaterial ||
                !window.ShaderEngine
            ) {
                Blockbench.showToastNotification({ text: tr('dependencies_missing'), icon: 'error', expire: 10000 });
                return;
            }

            const style = injectStyles();
            deletables.push({ delete: () => style.remove() });

            const projectProperty = Runtime.registerProjectProperty();
            if (projectProperty) deletables.push(projectProperty);
            Runtime.registerUndoHooks();

            graphMode = new Mode('shader_graph', {
                name: tr('mode'),
                icon: 'schema',
                category: 'edit',
                condition: () => !!window.Project,
                onSelect() {
                    Runtime.refresh();
                    const graph = Runtime.activeGraph;
                    if (graph && graph.settings.livePreview && !Runtime.getCompiledMaterial(graph)) Runtime.scheduleCompile('mode_select', 80);
                },
                onUnselect() {
                    Runtime.cancelCompile();
                }
            });
            deletables.push(graphMode);
            createPanels();

            const openAction = new Action('open_visual_shader_graph', {
                name: tr('title'),
                description: tr('empty_body'),
                icon: 'schema',
                category: 'view',
                condition: () => !!window.Project,
                click: selectShaderGraphMode
            });
            MenuBar.addAction(openAction, 'tools');
            deletables.push(openAction);

            const compileAction = new Action('compile_visual_shader_graph', {
                name: tr('compile'),
                icon: 'memory',
                category: 'view',
                condition: () => !!Runtime.activeGraph,
                click: () => Runtime.compileActive({ cause: 'action_compile' })
            });
            deletables.push(compileAction);

            const importAction = new Action('import_visual_shader_graph', {
                name: tr('import_graph'),
                icon: 'file_open',
                category: 'file',
                condition: () => !!window.Project,
                click: importGraphFile
            });
            deletables.push(importAction);

            const materialApplied = Blockbench.on('shader_material_applied', event => {
                applyGraphRenderStateToScene(event?.mesh || null);
            });
            const materialListChanged = Blockbench.on('update_global_material_list', () => {
                if (Runtime.activeGraph) Runtime.diagnostics = validateGraph(Runtime.activeGraph, { materials: window.MaterialManager?.materials, graphs: Runtime.graphs });
                Runtime.refresh();
            });
            const parseListener = window.Codecs?.project?.on?.('parse', () => {
                const property = Runtime.registerProjectProperty();
                if (property && !deletables.includes(property)) deletables.push(property);
            });
            deletables.push(materialApplied, materialListChanged);
            if (parseListener) deletables.push(parseListener);

            Runtime.hydrationHandle = window.LightflowLifecycle?.registerHydrator?.(PLUGIN_ID, context => Runtime.hydrate(context));
            if (!Runtime.hydrationHandle) {
                Runtime.hydrate({ project: window.Project, reason: 'plugin_ready' });
                const parsed = window.Codecs?.project?.on?.('parsed', () => Runtime.hydrate({ project: window.Project, reason: 'parsed' }));
                const selected = Blockbench.on('select_project', event => Runtime.hydrate({ project: event?.project || window.Project, reason: 'select_project' }));
                const closed = Blockbench.on('close_project', () => Runtime.hydrate({ project: null, deferred: true, reason: 'close_project' }));
                if (parsed) deletables.push(parsed);
                deletables.push(selected, closed);
            }

            publishBinding('VisualShaderGraph', PUBLIC_API);
            publishBinding('LightflowVisualShaderGraph', PUBLIC_API);
        },

        onunload() {
            leaveShaderGraphMode();
            Runtime.dispose();
            Array.from(deletables).reverse().forEach(item => {
                try { item?.delete?.(); } catch (error) { console.warn('[Visual Shader Graph] Cleanup failed.', error); }
            });
            deletables.length = 0;
            restoreBindings();
            graphMode = null;
            graphCanvasPanel = null;
            graphLibraryPanel = null;
            graphInspectorPanel = null;
        }
    });

})();
