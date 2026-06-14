/**
 * @name Shader Architect
 * @description A standalone Blockbench plugin dedicated to switching Render Modes, 
 * assigning specific shaders to parts, and providing a full GLSL Shader Material Studio.
 * Features custom JSON format export (.samat), time animations, and per-cube control.
 */

(function () {
    function formatGLSL(rawString) {
        let comments = [];
        // Extract block and line comments to avoid collapsing them and breaking code
        let code = rawString.replace(/\/\*[\s\S]*?\*\//g, match => {
            comments.push(match);
            return ` __BLOCK_COMMENT_${comments.length - 1}__ `;
        }).replace(/\/\/.*/g, match => {
            comments.push(match);
            return ` __LINE_COMMENT_${comments.length - 1}__ `;
        });

        // 1. Proteger las directivas de preprocesador (#define, #ifdef, etc.)
        const lines = code.split('\n');
        code = '';
        const directives = [];

        lines.forEach((line) => {
            let trimmed = line.trim();
            if (trimmed.startsWith('#')) {
                directives.push(trimmed);
                code += ` __DIRECTIVE_${directives.length - 1}__ `;
            } else {
                code += trimmed + ' ';
            }
        });

        // 2. Normalizar espacios, palabras clave y comas
        code = code.replace(/\s+/g, ' '); // Colapsar espacios múltiples
        code = code.replace(/\b(if|for|while|return)\b\s*\(/g, '$1 ('); // Espacio tras keywords
        code = code.replace(/\)\s*\{/g, ') {'); // Espacio antes de abrir llave
        code = code.replace(/\}\s*else\b/g, '} else'); // 'else' en la misma línea que la llave
        code = code.replace(/\belse\b\s*\{/g, 'else {');
        code = code.replace(/,\s*/g, ', '); // Espacio uniforme después de las comas

        // 3. Normalizar operadores principales (asignaciones, comparaciones, lógicos)
        code = code.replace(/\s*(\+=|-=|\*=|\/=|==|!=|<=|>=|&&|\|\||=)\s*/g, ' $1 ');

        // 4. Parseo carácter por carácter para indentación
        let formatted = '';
        let indentLevel = 0;
        let parenDepth = 0;
        const indentStr = '    '; // 4 espacios por nivel

        for (let i = 0; i < code.length; i++) {
            let char = code[i];

            if (char === '(') {
                parenDepth++;
                formatted += char;
            } else if (char === ')') {
                parenDepth = Math.max(0, parenDepth - 1);
                formatted += char;
            } else if (char === '{') {
                formatted += ' {\n';
                indentLevel++;
                formatted += indentStr.repeat(indentLevel);
                while (code[i + 1] === ' ') i++; // Omitir espacios siguientes
            } else if (char === '}') {
                indentLevel = Math.max(0, indentLevel - 1);
                if (formatted.endsWith(indentStr.repeat(indentLevel + 1))) {
                    formatted = formatted.slice(0, -indentStr.length);
                } else {
                    formatted += '\n' + indentStr.repeat(indentLevel);
                }
                formatted += '}';

                let nextText = code.slice(i + 1, i + 6);
                if (!nextText.match(/^\s*else/)) {
                    formatted += '\n' + indentStr.repeat(indentLevel);
                }
                while (code[i + 1] === ' ') i++;
            } else if (char === ';') {
                formatted += ';';
                if (parenDepth === 0) {
                    formatted += '\n' + indentStr.repeat(indentLevel);
                    while (code[i + 1] === ' ') i++;
                }
            } else {
                formatted += char;
            }
        }

        // 5. Restaurar directivas y comentarios
        formatted = formatted.replace(/__DIRECTIVE_(\d+)__/g, (m, id) => '\n' + directives[id] + '\n' + indentStr.repeat(indentLevel));
        formatted = formatted.replace(/__BLOCK_COMMENT_(\d+)__/g, (m, id) => '\n' + comments[id] + '\n' + indentStr.repeat(indentLevel));
        formatted = formatted.replace(/__LINE_COMMENT_(\d+)__/g, (m, id) => comments[id] + '\n' + indentStr.repeat(indentLevel));

        // Limpiar líneas vacías
        let finalLines = formatted.split('\n');
        let result = [];
        finalLines.forEach(line => {
            let trimmed = line.trimEnd();
            if (trimmed.trim().length > 0) {
                result.push(trimmed);
            }
        });

        // Retoque de indentación post-restauración
        return result.join('\n');
    }



    // =========================================================================
    // 1. INTERNATIONALIZATION (Translations)
    // =========================================================================
    Language.addTranslations('en', {
        "menu.shader_architect": "Shader Architect",
        "action.sa_global_mode": "Render Mode",
        "shader_architect.menu.material_studio": "Material Studio",
        "shader_architect.menu.apply_material": "Apply Material to Selection",
        "shader_architect.menu.clear_material": "Clear Material Override",
        "shader_architect.ui.global_mode": "Global Scene Material:",
        "shader_architect.dialog.studio_title": "Material Studio",
        "shader_architect.toast.applied": "Material applied to scene.",
        "shader_architect.toast.exported": "Material Exported successfully.",
        "shader_architect.toast.imported": "Material Imported successfully.",
        "shader_architect.toast.deleted": "Material deleted.",

        "shader_architect.preset.classic": "Classic Shader",
        "shader_architect.preset.pbr_metallic_roughness": "PBR Metallic/Roughness",
        "shader_architect.preset.lightflow": "Unshaded Lightflow",
        "shader_architect.preset.shaded_lightflow": "Shaded Lightflow",
        "shader_architect.preset.pixelated_shaded_lightflow": "Pixelated Shaded Lightflow",


        "shader_architect.preset.pbr": "Standard PBR",
    });

    Language.addTranslations('es', {
        "menu.shader_architect": "Shader Architect",
        "action.sa_global_mode": "Modo de Render",
        "shader_architect.menu.material_studio": "Estudio de Materiales",
        "shader_architect.menu.apply_material": "Aplicar Material a Selección",
        "shader_architect.menu.clear_material": "Limpiar Material (Usar Global)",
        "shader_architect.ui.global_mode": "Material de Escena Global:",
        "shader_architect.dialog.studio_title": "Estudio de Materiales",
        "shader_architect.toast.applied": "Material aplicado a la escena.",
        "shader_architect.toast.exported": "Material Exportado exitosamente.",
        "shader_architect.toast.imported": "Material Importado exitosamente.",
        "shader_architect.toast.deleted": "Material eliminado.",

        "shader_architect.preset.classic": "Shader Clásico",
        "shader_architect.preset.pbr_metallic_roughness": "PBR Metálico/Rugosidad",
        "shader_architect.preset.lightflow": "Luces Sin Sombra",
        "shader_architect.preset.shaded_lightflow": "Luces con Sombra",
        "shader_architect.preset.pixelated_shaded_lightflow": "Luces con Sombra Pixeladas",

        "shader_architect.preset.pbr": "Standard PBR",
    });

    /*function tl(key) {
        return Language.get(key) || key;
    }*/

    // =========================================================================
    // 2. CSS & PRISM.JS SYNTAX HIGHLIGHTING
    // =========================================================================
    const PLUGIN_STYLE_ID = 'shader-architect-styles';
    const pluginStyle = /*css*/`
    /* Prism Editor Layout */
    .prism-editor-wrapper code { font-family: 'Consolas', 'Courier New', monospace; line-height: inherit; display: block; }
    .prism-editor-component { height: auto; max-height: 100%; align-items: flex-start; position: relative; }
    .prism-editor-component, .prism-editor-wrapper { width: 100%; display: flex; }
    .prism-editor-wrapper { height: 100%; overflow: auto; tab-size: 4; }
    .prism-editor-wrapper pre { display: inline-block; width: 100%; }
    
    .prism-editor__line-numbers {
        height: 100%; overflow: hidden; flex-shrink: 0; padding-top: 4px; margin-top: 0;
        background: var(--color-back); color: var(--color-text); border-right: 1px solid rgba(0, 0, 0, 0.2); user-select: none;
    }
    .prism-editor__line-number { text-align: right; white-space: nowrap; padding: 0 8px 0 4px; font-size: 0.9em; opacity: 0.7; }
    .prism-editor__code { margin: 0 !important; flex-grow: 2; min-height: 100%; box-sizing: border-box; tab-size: 4; outline: none; background: transparent; }

    /* Code Area */
    code[class*="language-"], pre[class*="language-"] {
        color: var(--color-text); background: none; font-family: var(--font-code, monospace);
        font-size: 1em; text-align: left; white-space: pre; line-height: 1.5; cursor: text;
    }

    /* Syntax Highlighting Colors */
    .token.comment, .token.prolog, .token.doctype, .token.cdata { color: slategray; font-style: italic; opacity: 0.85; }
    .token.punctuation { color: #b2d0dd; }
    .token.property, .token.tag, .token.symbol, .token.deleted, .token.attr-name { color: #fc2f40; }
    .token.constant { color: #73adff; }
    .token.boolean { color: rgb(159, 255, 156); }
    .token.number { color: #b28cff; }
    .token.string, .token.char { color: #e8df6a; }
    .token.operator{ color: #fd766a; }
    .token.keyword { color: #8cd9ff; }
    .token.builtin { color: #ffff80; }
    .token.function, .token.function-name { color: #94e400; }
    .token.class-name { color: #50e48f; }

    /* Dialog Styling */
    #sa_material_studio_dialog select, #sa_material_studio_dialog button, #sa_material_studio_dialog input {
        background: var(--color-button); color: var(--color-text); border: 1px solid var(--color-border);
        border-radius: 4px; padding: 6px 12px; transition: background 0.15s, border 0.15s; outline: none;
    }
    #sa_material_studio_dialog input[type="color"] { padding: 0px 4px; height: 32px; width: 40px; cursor: pointer; }
    #sa_material_studio_dialog button:hover { background: var(--color-accent); color: var(--color-text); cursor: pointer;}
    #sa_material_studio_dialog .dialog_content { background: var(--color-back); color: var(--color-text); }
    
    .sa-uniform-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding: 6px; background: rgba(0,0,0,0.1); border-radius: 4px; }
    .sa-uniform-row label { min-width: 120px; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;}
    .sa-materiel-list-item { padding: 8px; margin-bottom: 4px; border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; gap: 8px; }
    .sa-materiel-list-item:hover { background: rgba(255,255,255,0.05); }
    .sa-materiel-list-item.selected { background: var(--color-accent); border-color: transparent; }
    `;

    if (typeof Prism !== 'undefined' && !Prism.languages.glsl) {
        Prism.languages.glsl = {
            'comment': { pattern: /\/\/.*|\/\*[\s\S]*?\*\//, greedy: true },
            'preprocessor': { pattern: /(^\s*)#\s*[a-zA-Z_]\w*(?:[^\r\n\\]|\\(?:\r\n?|\n))*/m, lookbehind: true, alias: 'important' },
            'string': { pattern: /(["'])(?:\\.|(?!\1)[^\\\r\n])*\1/, greedy: true },
            'type': { pattern: /\b(?:void|bool|int|uint|float|vec2|vec3|vec4|mat2|mat3|mat4|sampler2D|samplerCube)\b/, alias: 'class-name' },
            'keyword': /\b(?:break|continue|do|for|while|if|else|return|discard|attribute|const|uniform|varying|precision|highp|mediump|lowp|in|out|inout|struct)\b/,
            'constant': /\b(?:true|false|[gG]l_[a-zA-Z0-9_]*)\b/,
            'builtin': /\b(?:radians|degrees|sin|cos|tan|pow|exp|log|sqrt|abs|sign|floor|ceil|fract|min|max|clamp|mix|step|smoothstep|length|distance|dot|cross|normalize|reflect|texture2D)\b/,
            'function': { pattern: /\b[a-zA-Z_]\w*(?=\s*\()/i, alias: 'function-name' },
            'number': /\b(?:0x[\da-fA-F]+|0b[01]+|0[0-7]+|(?:\d*\.)?\d+(?:[eE][+-]?\d+)?)\b/,
            'operator': /[+\-*/%=&|^~!<>?:]+/,
            'punctuation': /[()[\]{}.,;]/
        };
    }

    // =========================================================================
    // 3. CORE MATERIAL FRAMEWORK
    // =========================================================================

    class FancyShaderMaterial {
        constructor(props) {
            this.id = props.id || guid();
            this.name = props.name || "Untitled Material";
            this.icon = props.icon || "gradient";
            this.vertex = props.vertex || "";
            this.fragment = props.fragment || "";
            this.uniforms = props.uniforms || {};
            this.isCustom = props.isCustom !== undefined ? props.isCustom : true;
            this.enableShadows = props.enableShadows !== undefined ? props.enableShadows : false;
        }

        // Serializer for the JSON format
        toJSON() {
            let serializedUniforms = {};
            for (let key in this.uniforms) {
                let u = this.uniforms[key];
                let val = u.value;
                if (val instanceof THREE.Vector3) val = { x: val.x, y: val.y, z: val.z };
                else if (val instanceof THREE.Vector2) val = { x: val.x, y: val.y };
                else if (u.type === 'color') val = u.hexValue; // Custom hex handler

                serializedUniforms[key] = {
                    type: u.type,
                    value: val
                };
            }

            return {
                sa_format_version: "2.0",
                id: this.id,
                name: this.name,
                icon: this.icon,
                isCustom: this.isCustom,
                vertex: this.vertex,
                fragment: this.fragment,
                uniforms: serializedUniforms
            };
        }

        static fromJSON(data) {
            let parsedUniforms = {};
            if (data.uniforms) {
                for (let key in data.uniforms) {
                    let u = data.uniforms[key];
                    let val = u.value;
                    let type = u.type;

                    if (type === 'vec3' || type === 'vec3v') {
                        if (val && val.x !== undefined) val = new THREE.Vector3(val.x, val.y, val.z);
                    } else if (type === 'vec2' || type === 'vec2v') {
                        if (val && val.x !== undefined) val = new THREE.Vector2(val.x, val.y);
                    } else if (type === 'color') {
                        // Keep hex string for editing, conversion happens at render time
                        parsedUniforms[key] = { type: type, value: val, hexValue: val };
                        continue;
                    }
                    parsedUniforms[key] = { type: type, value: val };
                }
            }

            return new FancyShaderMaterial({
                id: data.id,
                name: data.name,
                icon: data.icon,
                isCustom: data.isCustom,
                vertex: data.vertex,
                fragment: data.fragment,
                uniforms: parsedUniforms
            });
        }
    }

    const MaterialManager = {
        materials: {}, // Registry of all available materials

        init() {
            this.registerBuiltIns();
            this.loadCustomMaterials();
        },

        register(mat) {
            this.materials[mat.id] = mat;
            this.saveCustomMaterials();
        },

        deleteMaterial(id) {
            if (this.materials[id] && this.materials[id].isCustom) {
                delete this.materials[id];
                this.saveCustomMaterials();

                // Clear outliner overrides that used this
                Cube.all.forEach(c => {
                    if (c.sa_material_id === id) {
                        delete c.sa_material_id;
                    }
                });
                ShaderEngine.updateAllCubes();
            }
        },

        saveCustomMaterials() {
            let customMats = [];
            for (let id in this.materials) {
                if (this.materials[id].isCustom) {
                    customMats.push(this.materials[id].toJSON());
                }
            }
            localStorage.setItem('shader_architect_materials', JSON.stringify(customMats));
        },

        loadCustomMaterials() {
            try {
                let data = localStorage.getItem('shader_architect_materials');
                if (data) {
                    let parsed = JSON.parse(data);
                    parsed.forEach(mJson => {
                        let mat = FancyShaderMaterial.fromJSON(mJson);
                        this.materials[mat.id] = mat;
                    });
                }
            } catch (ignore) { }
        },

        registerBuiltIns() {
            let classic = new FancyShaderMaterial({
                id: 'classic',
                name: tl('shader_architect.preset.classic'),
                icon: 'deployed_code',
                isCustom: false,
                vertex: `
                    attribute float highlight;
                    
                    uniform bool SHADE; 
                    uniform int LIGHTSIDE;
                    
                    varying vec2 vUv; 
                    varying float light; 
                    varying float lift;
                    
                    void main() {
                        if (SHADE) {
                            // Corrección: Usar normalMatrix para correcta orientación incluyendo escalas
                            vec3 N = normalize(normalMatrix * normal);
                            
                            if (LIGHTSIDE == 1) { float t = N.y; N.y = -N.z; N.z = t; }
                            else if (LIGHTSIDE == 2) { float t = N.y; N.y = N.x; N.x = t; }
                            else if (LIGHTSIDE == 3) { N.y = -N.y; }
                            else if (LIGHTSIDE == 4) { float t = N.y; N.y = N.z; N.z = t; }
                            else if (LIGHTSIDE == 5) { float t = N.y; N.y = -N.x; N.x = t; }
                            
                            float yLight = (1.0 + N.y) * 0.5;
                            light = yLight * 0.5 + N.x * N.x * -0.15 + N.z * N.z * 0.05 + 0.5;
                        } else { 
                            light = 1.0; 
                        }
                        
                        lift = (highlight == 2.0) ? 0.22 : (highlight == 1.0) ? 0.1 : 0.0;
                        vUv = uv; 
                        
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragment: `
                    uniform sampler2D map; 
                    uniform bool EMISSIVE; 
                    uniform vec3 LIGHTCOLOR;
                    
                    varying vec2 vUv; 
                    varying float light; 
                    varying float lift;
                    
                    void main() {
                        vec4 color = texture2D(map, vUv);
                        if(color.a < 0.01) discard;
                        
                        if (!EMISSIVE) {
                            gl_FragColor = vec4(lift + color.rgb * light, color.a);
                            gl_FragColor.rgb *= LIGHTCOLOR;
                        } else {
                            vec3 light_mix = (light * LIGHTCOLOR) + (1.0 - light * LIGHTCOLOR) * (1.0 - color.a);
                            gl_FragColor = vec4(lift + color.rgb * light_mix, 1.0);
                        }
                        
                        if (lift > 0.2) { 
                            gl_FragColor.rg *= vec2(0.6, 0.7); 
                        }
                    }
                `,
                uniforms: {
                    "LIGHTCOLOR": { type: "vec3", value: new THREE.Vector3(1, 1, 1) },
                    "SHADE": { type: "bool", value: true },
                    "LIGHTSIDE": { type: "int", value: 0 },
                    "EMISSIVE": { type: "bool", value: false }
                }
            });

            // =========================================================================
            // PBR METALLIC/ROUGHNESS SHADER - corrected v2 for Shader Architect / Blockbench
            // Based on the working shaded_lightflow light + shadow path.
            // =========================================================================
            let pbr_metallic_roughness = new FancyShaderMaterial({
                id: 'pbr_metallic_roughness',
                name: tl('shader_architect.preset.pbr_metallic_roughness'),
                icon: 'diamond',
                isCustom: false,
                vertex: `#include <common>
#include <shadowmap_pars_vertex>

attribute float highlight;
attribute vec2 uv_fit_fixed;

uniform bool SHADE;
uniform int LIGHTSIDE;
uniform mat3 uWorldNormalMatrix;
uniform float uStylizedNormalInfluence;

varying vec2 vUv;
varying vec2 vFaceUv;
varying float lift;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

vec3 safeNormalizeVertex(vec3 v, vec3 fallback) {
    float lenSq = dot(v, v);
    if (lenSq <= 1e-8) return fallback;
    return v * inversesqrt(lenSq);
}

vec3 applyLightSide(vec3 n) {
    vec3 N = n;

    if (LIGHTSIDE == 1) {
        float t = N.y;
        N.y = -N.z;
        N.z = t;
    } else if (LIGHTSIDE == 2) {
        float t = N.y;
        N.y = N.x;
        N.x = t;
    } else if (LIGHTSIDE == 3) {
        N.y = -N.y;
    } else if (LIGHTSIDE == 4) {
        float t = N.y;
        N.y = N.z;
        N.z = t;
    } else if (LIGHTSIDE == 5) {
        float t = N.y;
        N.y = -N.x;
        N.x = t;
    }

    return safeNormalizeVertex(N, vec3(0.0, 1.0, 0.0));
}

void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);

    /*
        Three.js r129 necesita esta variable exacta para #include <shadowmap_vertex>.
        No la borres aunque usemos uWorldNormalMatrix para la iluminación personalizada.
    */
    vec3 transformedNormal = normalize(normalMatrix * normal);

    vWorldPos = worldPosition.xyz;

    vec3 physicalNormal = safeNormalizeVertex(uWorldNormalMatrix * normal, vec3(0.0, 1.0, 0.0));
    vec3 stylizedNormal = applyLightSide(physicalNormal);

    if (SHADE) {
        vWorldNormal = safeNormalizeVertex(mix(
            physicalNormal,
            stylizedNormal,
            clamp(uStylizedNormalInfluence, 0.0, 1.0)
        ), physicalNormal);
    } else {
        vWorldNormal = physicalNormal;
    }

    vUv = uv;
    vFaceUv = uv_fit_fixed;
    vViewDir = safeNormalizeVertex(cameraPosition - vWorldPos, vec3(0.0, 0.0, 1.0));

    lift = highlight == 2.0 ? 0.22 :
           highlight == 1.0 ? 0.10 :
           0.0;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

    #include <shadowmap_vertex>
}`,
                fragment: `#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>

uniform sampler2D map;
uniform vec3 LIGHTCOLOR;

// -------------------------------------------------------------------------
// PBR material properties
// -------------------------------------------------------------------------
uniform vec3 uBaseColor;
uniform float uMetallic;
uniform float uRoughness;
uniform float uAO;

uniform float uClearcoat;
uniform float uClearcoatRoughness;

uniform float uAnisotropy;
uniform vec2 uAnisotropyDirection;

uniform float uSheen;
uniform vec3 uSheenColor;
uniform float uSheenRoughness;

uniform float uTransmission;
uniform float uThickness;
uniform vec3 uAttenuationColor;
uniform float uAttenuationDistance;
uniform float uIOR;

uniform float uIridescence;
uniform float uIridescenceIOR;
uniform float uIridescenceThicknessMin;
uniform float uIridescenceThicknessMax;

uniform vec3 uEmissiveColor;
uniform float uEmissiveStrength;

// -------------------------------------------------------------------------
// Optional texture maps. Do not compare samplers in GLSL; use these flags.
// -------------------------------------------------------------------------
uniform bool uUseBaseColorMap;
uniform bool uUseMetallicRoughnessMap;
uniform bool uUseNormalMap;
uniform bool uUseAOMap;
uniform bool uUseEmissiveMap;
uniform bool uUseClearcoatMap;
uniform bool uUseClearcoatRoughnessMap;
uniform bool uUseAnisotropyMap;
uniform bool uUseSheenColorMap;
uniform bool uUseSheenRoughnessMap;
uniform bool uUseTransmissionMap;
uniform bool uUseThicknessMap;
uniform bool uUseIridescenceMap;
uniform bool uUseIridescenceThicknessMap;

uniform sampler2D uBaseColorMap;
uniform sampler2D uMetallicRoughnessMap;
uniform sampler2D uNormalMap;
uniform sampler2D uAOMap;
uniform sampler2D uEmissiveMap;
uniform sampler2D uClearcoatMap;
uniform sampler2D uClearcoatRoughnessMap;
uniform sampler2D uClearcoatNormalMap;
uniform sampler2D uAnisotropyMap;
uniform sampler2D uSheenColorMap;
uniform sampler2D uSheenRoughnessMap;
uniform sampler2D uTransmissionMap;
uniform sampler2D uThicknessMap;
uniform sampler2D uIridescenceMap;
uniform sampler2D uIridescenceThicknessMap;

uniform vec2 uBaseColorMapScale;
uniform vec2 uMetallicRoughnessMapScale;
uniform vec2 uNormalMapScale;
uniform vec2 uAOMapScale;
uniform vec2 uEmissiveMapScale;
uniform vec2 uClearcoatMapScale;
uniform vec2 uClearcoatRoughnessMapScale;
uniform vec2 uAnisotropyMapScale;
uniform vec2 uSheenColorMapScale;
uniform vec2 uSheenRoughnessMapScale;
uniform vec2 uTransmissionMapScale;
uniform vec2 uThicknessMapScale;
uniform vec2 uIridescenceMapScale;
uniform vec2 uIridescenceThicknessMapScale;

uniform float uNormalScale;
uniform float uEnvSpecularStrength;
uniform float uSpecularIntensity;

// -------------------------------------------------------------------------
// Lightflow-compatible light arrays
// -------------------------------------------------------------------------
uniform vec3 uLightPos[16];
uniform vec3 uLightDir[16];
uniform float uLightIntensity[16];
uniform float uLightDistance[16];
uniform float uLightConeAngle[16];
uniform float uLightPenumbra[16];
uniform int uLightType[16];
uniform vec3 uLightColor[16];
uniform int max_light_number;

uniform int uLightCastShadow[16];
uniform int uLightShadowIndex[16];

uniform float uAmbient;
uniform vec3 uAmbientColor;

uniform float uExposure;
uniform float uUseToneMapping;
uniform float uLightWrap;

uniform bool uAOEnabled;
uniform float uAOStrength;
uniform float uAORadius;
uniform float uAOPower;
uniform float uAOMin;
uniform float uAODirectInfluence;

uniform float uShadowStrength;
uniform float uShadowFloor;

varying vec2 vUv;
varying vec2 vFaceUv;
varying float lift;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

#define SA_LIGHT_POINT 0
#define SA_LIGHT_DIRECTIONAL 1
#define SA_LIGHT_SPOT 2

//#define PI 3.14159265359
//#define RECIPROCAL_PI 0.31830988618

vec3 safeNormalize(vec3 v, vec3 fallback) {
    float lenSq = dot(v, v);
    if (lenSq <= 1e-8) return fallback;
    return v * inversesqrt(lenSq);
}

float pow5(float x) {
    float x2 = x * x;
    return x2 * x2 * x;
}

/*float saturate(float x) {
    return clamp(x, 0.0, 1.0);
}*/

vec3 saturateVec3(vec3 x) {
    return clamp(x, vec3(0.0), vec3(1.0));
}

// -------------------------------------------------------------------------
// BRDF helpers: stable GGX / Smith / Schlick for WebGL 1 era GLSL.
// -------------------------------------------------------------------------
vec3 F_Schlick(vec3 f0, float VdotH) {
    float fc = pow5(saturate(1.0 - VdotH));
    return f0 + (vec3(1.0) - f0) * fc;
}

vec3 F_SchlickRoughness(vec3 f0, float NdotV, float roughness) {
    float fc = pow5(saturate(1.0 - NdotV));
    vec3 f90 = max(vec3(1.0 - roughness), f0);
    return f0 + (f90 - f0) * fc;
}

float D_GGX(float NdotH, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float nh2 = NdotH * NdotH;
    float denom = nh2 * (a2 - 1.0) + 1.0;
    return a2 * RECIPROCAL_PI / max(denom * denom, 1e-7);
}

float G_SchlickGGX(float NdotX, float roughness) {
    float r = roughness + 1.0;
    float k = (r * r) * 0.125;
    return NdotX / max(NdotX * (1.0 - k) + k, 1e-7);
}

float G_Smith(float NdotV, float NdotL, float roughness) {
    return G_SchlickGGX(NdotV, roughness) * G_SchlickGGX(NdotL, roughness);
}

float computeWrappedDiffuse(float NdotL) {
    float wrapAmount = clamp(uLightWrap, 0.0, 1.0);

    if (wrapAmount > 0.0) {
        return clamp((NdotL + wrapAmount) / (1.0 + wrapAmount), 0.0, 1.0);
    }

    return max(NdotL, 0.0);
}

float computeDistanceAttenuation(float dist, float maxDist) {
    dist = max(dist, 0.0001);

    if (maxDist > 0.0) {
        if (dist >= maxDist) return 0.0;

        float x = clamp(dist / maxDist, 0.0, 1.0);
        float falloff = clamp(1.0 - pow(x, 4.0), 0.0, 1.0);

        return (falloff * falloff) / max(dist * dist, 1.0);
    }

    return 1.0 / (1.0 + 0.04 * dist + 0.002 * dist * dist);
}

float computeSpotAttenuation(int lightIndex, vec3 lightDir) {
    vec3 spotDirection = safeNormalize(uLightDir[lightIndex], vec3(0.0, -1.0, 0.0));

    float coneAngle = clamp(uLightConeAngle[lightIndex], 0.001, PI);
    float penumbra = clamp(uLightPenumbra[lightIndex], 0.0, 0.999);

    float theta = dot(-lightDir, spotDirection);

    float outerCutoff = cos(coneAngle);
    float innerCutoff = cos(coneAngle * (1.0 - penumbra));
    float epsilon = max(innerCutoff - outerCutoff, 0.0001);

    return clamp((theta - outerCutoff) / epsilon, 0.0, 1.0);
}

vec3 getLightDirection(int lightIndex, vec3 worldPos) {
    int type = uLightType[lightIndex];

    if (type == SA_LIGHT_DIRECTIONAL) {
        return safeNormalize(-uLightDir[lightIndex], vec3(0.0, 1.0, 0.0));
    }

    vec3 lightVec = uLightPos[lightIndex] - worldPos;
    return safeNormalize(lightVec, vec3(0.0, 1.0, 0.0));
}

float getLightAttenuation(int lightIndex, vec3 worldPos, vec3 lightDir) {
    int type = uLightType[lightIndex];

    if (type == SA_LIGHT_DIRECTIONAL) {
        return 1.0;
    }

    float dist = max(length(uLightPos[lightIndex] - worldPos), 0.0001);
    float attenuation = computeDistanceAttenuation(dist, uLightDistance[lightIndex]);

    if (type == SA_LIGHT_SPOT) {
        attenuation *= computeSpotAttenuation(lightIndex, lightDir);
    }

    return attenuation;
}

vec3 getLightRadiance(int lightIndex, float attenuation) {
    return max(uLightColor[lightIndex], vec3(0.0)) * max(uLightIntensity[lightIndex], 0.0) * attenuation;
}

// -------------------------------------------------------------------------
// Shadow functions: intentionally kept compatible with shaded_lightflow.
// -------------------------------------------------------------------------
float getDirectionalShadowByIndex(int shadowIndex) {
    float result = 1.0;

    #ifdef USE_SHADOWMAP

    #if NUM_DIR_LIGHT_SHADOWS > 0

        DirectionalLightShadow directionalLight;

        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
            directionalLight = directionalLightShadows[ i ];

            if (UNROLLED_LOOP_INDEX == shadowIndex) {
                result = receiveShadow ? getShadow(
                    directionalShadowMap[ i ],
                    directionalLight.shadowMapSize,
                    directionalLight.shadowBias,
                    directionalLight.shadowRadius,
                    vDirectionalShadowCoord[ i ]
                ) : 1.0;
            }
        }
        #pragma unroll_loop_end

    #endif

    #endif

    return result;
}

float getSpotShadowByIndex(int shadowIndex) {
    float result = 1.0;

    #ifdef USE_SHADOWMAP

    #if NUM_SPOT_LIGHT_SHADOWS > 0

        SpotLightShadow spotLight;

        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
            spotLight = spotLightShadows[ i ];

            if (UNROLLED_LOOP_INDEX == shadowIndex) {
                result = receiveShadow ? getShadow(
                    spotShadowMap[ i ],
                    spotLight.shadowMapSize,
                    spotLight.shadowBias,
                    spotLight.shadowRadius,
                    vSpotShadowCoord[ i ]
                ) : 1.0;
            }
        }
        #pragma unroll_loop_end

    #endif

    #endif

    return result;
}

float getPointShadowByIndex(int shadowIndex) {
    float result = 1.0;

    #ifdef USE_SHADOWMAP

    #if NUM_POINT_LIGHT_SHADOWS > 0

        PointLightShadow pointLight;

        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
            pointLight = pointLightShadows[ i ];

            if (UNROLLED_LOOP_INDEX == shadowIndex) {
                result = receiveShadow ? getPointShadow(
                    pointShadowMap[ i ],
                    pointLight.shadowMapSize,
                    pointLight.shadowBias,
                    pointLight.shadowRadius,
                    vPointShadowCoord[ i ],
                    pointLight.shadowCameraNear,
                    pointLight.shadowCameraFar
                ) : 1.0;
            }
        }
        #pragma unroll_loop_end

    #endif

    #endif

    return result;
}

float getCustomLightShadow(int lightIndex) {
    if (uLightCastShadow[lightIndex] == 0) return 1.0;

    int shadowIndex = uLightShadowIndex[lightIndex];
    if (shadowIndex < 0) return 1.0;

    int type = uLightType[lightIndex];

    float shadow = 1.0;

    if (type == SA_LIGHT_DIRECTIONAL) {
        shadow = getDirectionalShadowByIndex(shadowIndex);
    } else if (type == SA_LIGHT_SPOT) {
        shadow = getSpotShadowByIndex(shadowIndex);
    } else {
        shadow = getPointShadowByIndex(shadowIndex);
    }

    shadow = clamp(shadow, 0.0, 1.0);
    shadow = max(shadow, clamp(uShadowFloor, 0.0, 1.0));

    return mix(1.0, shadow, clamp(uShadowStrength, 0.0, 1.0));
}

// -------------------------------------------------------------------------
// Ambient occlusion: same stylized face-cavity idea as shaded_lightflow.
// -------------------------------------------------------------------------
float computeFaceCavityAO(vec2 faceUv) {
    vec2 uv = clamp(faceUv, vec2(0.0), vec2(1.0));
    float radius = clamp(uAORadius, 0.0001, 0.5);

    float left = 1.0 - smoothstep(0.0, radius, uv.x);
    float right = 1.0 - smoothstep(0.0, radius, 1.0 - uv.x);
    float bottom = 1.0 - smoothstep(0.0, radius, uv.y);
    float top = 1.0 - smoothstep(0.0, radius, 1.0 - uv.y);

    float edgeAO = max(max(left, right), max(bottom, top));
    float cornerAO = max(max(left * bottom, left * top), max(right * bottom, right * top));

    return clamp(edgeAO * 0.30 + cornerAO * 0.70, 0.0, 1.0);
}

float computeHemisphereAO(vec3 normal) {
    float strength = clamp(uAOStrength, 0.0, 1.0);
    float downward = clamp(-normal.y, 0.0, 1.0);

    return 1.0 - downward * strength * 0.18;
}

float computeAmbientOcclusion(vec2 faceUv, vec3 normal) {
    if (!uAOEnabled) return 1.0;

    float strength = clamp(uAOStrength, 0.0, 1.0);
    float cavity = computeFaceCavityAO(faceUv);

    float ao = 1.0 - cavity * strength;
    ao *= computeHemisphereAO(normal);

    ao = pow(clamp(ao, 0.0, 1.0), max(uAOPower, 0.001));

    return clamp(ao, clamp(uAOMin, 0.0, 1.0), 1.0);
}

vec3 applyOutputMapping(vec3 color) {
    color = max(color, vec3(0.0));

    if (uUseToneMapping > 0.5) {
        float exposure = max(uExposure, 0.001);
        return vec3(1.0) - exp(-color * exposure);
    }

    return clamp(color, 0.0, 1.0);
}

vec3 evaluateIridescence(float NdotV, float thickness) {
    float eta = max(uIridescenceIOR, 1.001);
    float cosTheta = clamp(NdotV, 0.0, 1.0);
    float sinTheta2 = 1.0 - cosTheta * cosTheta;
    float sinThetaT2 = sinTheta2 / (eta * eta);
    float cosThetaT = sqrt(max(0.0, 1.0 - sinThetaT2));

    float t = clamp(thickness, 1.0, 1200.0);

    vec3 wavelength = vec3(680.0, 540.0, 440.0);
    vec3 phase = 2.0 * PI * t * cosThetaT / wavelength;
    vec3 wave = 0.5 + 0.5 * cos(phase + vec3(0.0, 2.0943951, 4.1887902));

    return wave;
}

vec3 applyCheapNormalMap(vec3 normal) {
    if (!uUseNormalMap) return normal;

    vec3 nTex = texture2D(uNormalMap, vUv * uNormalMapScale).xyz * 2.0 - 1.0;

    // Blockbench meshes usually do not provide tangents. This is a safe stylized
    // perturbation, not a full tangent-space normal map. It stays optional.
    vec3 axisX = safeNormalize(cross(vec3(0.0, 1.0, 0.0), normal), vec3(1.0, 0.0, 0.0));
    vec3 axisY = safeNormalize(cross(normal, axisX), vec3(0.0, 1.0, 0.0));
    vec3 bumped = safeNormalize(
        normal + (axisX * nTex.x + axisY * nTex.y) * clamp(uNormalScale, 0.0, 2.0),
        normal
    );

    return bumped;
}

void main() {
    vec4 texel = texture2D(map, vUv);

    if (texel.a < 0.01) discard;

    vec3 baseColor = clamp(uBaseColor * texel.rgb, vec3(0.0), vec3(64.0));
    float metallic = uMetallic;
    float roughness = uRoughness;
    float aoMapValue = uAO;
    float clearcoat = uClearcoat;
    float clearcoatRoughness = uClearcoatRoughness;
    float anisotropy = uAnisotropy;
    float sheen = uSheen;
    vec3 sheenColor = uSheenColor;
    float sheenRoughness = uSheenRoughness;
    float transmission = uTransmission;
    float thickness = uThickness;
    float iridescence = uIridescence;
    float iridescenceThickness = mix(uIridescenceThicknessMin, uIridescenceThicknessMax, 0.5);
    vec3 emissive = uEmissiveColor * max(uEmissiveStrength, 0.0);

    if (uUseBaseColorMap) {
        baseColor *= texture2D(uBaseColorMap, vUv * uBaseColorMapScale).rgb;
    }

    if (uUseMetallicRoughnessMap) {
        vec4 mr = texture2D(uMetallicRoughnessMap, vUv * uMetallicRoughnessMapScale);
        metallic *= mr.r;
        roughness *= mr.g;
    }

    if (uUseAOMap) {
        aoMapValue *= texture2D(uAOMap, vUv * uAOMapScale).r;
    }

    if (uUseEmissiveMap) {
        emissive += texture2D(uEmissiveMap, vUv * uEmissiveMapScale).rgb * max(uEmissiveStrength, 1.0);
    }

    if (uUseClearcoatMap) {
        clearcoat *= texture2D(uClearcoatMap, vUv * uClearcoatMapScale).r;
    }

    if (uUseClearcoatRoughnessMap) {
        clearcoatRoughness *= texture2D(uClearcoatRoughnessMap, vUv * uClearcoatRoughnessMapScale).g;
    }

    if (uUseAnisotropyMap) {
        anisotropy *= texture2D(uAnisotropyMap, vUv * uAnisotropyMapScale).r * 2.0 - 1.0;
    }

    if (uUseSheenColorMap) {
        sheenColor *= texture2D(uSheenColorMap, vUv * uSheenColorMapScale).rgb;
    }

    if (uUseSheenRoughnessMap) {
        sheenRoughness *= texture2D(uSheenRoughnessMap, vUv * uSheenRoughnessMapScale).a;
    }

    if (uUseTransmissionMap) {
        transmission *= texture2D(uTransmissionMap, vUv * uTransmissionMapScale).r;
    }

    if (uUseThicknessMap) {
        thickness *= texture2D(uThicknessMap, vUv * uThicknessMapScale).r;
    }

    if (uUseIridescenceMap) {
        iridescence *= texture2D(uIridescenceMap, vUv * uIridescenceMapScale).r;
    }

    if (uUseIridescenceThicknessMap) {
        iridescenceThickness = mix(
            uIridescenceThicknessMin,
            uIridescenceThicknessMax,
            texture2D(uIridescenceThicknessMap, vUv * uIridescenceThicknessMapScale).r
        );
    }

    metallic = clamp(metallic, 0.0, 1.0);
    roughness = clamp(roughness, 0.035, 1.0);
    aoMapValue = clamp(aoMapValue, 0.0, 1.0);
    clearcoat = clamp(clearcoat, 0.0, 1.0);
    clearcoatRoughness = clamp(clearcoatRoughness, 0.035, 1.0);
    anisotropy = clamp(anisotropy, -1.0, 1.0);
    sheen = clamp(sheen, 0.0, 1.0);
    sheenRoughness = clamp(sheenRoughness, 0.035, 1.0);
    transmission = clamp(transmission, 0.0, 1.0);
    thickness = max(thickness, 0.0);
    iridescence = clamp(iridescence, 0.0, 1.0);

    vec3 N = safeNormalize(vWorldNormal, vec3(0.0, 1.0, 0.0));
    N = applyCheapNormalMap(N);

    vec3 V = safeNormalize(vViewDir, vec3(0.0, 0.0, 1.0));
    float NdotV = max(dot(N, V), 0.001);

    float ior = clamp(uIOR, 1.0, 3.0);
    float dielectricF0 = pow((ior - 1.0) / max(ior + 1.0, 0.001), 2.0);
    vec3 F0 = mix(vec3(dielectricF0), baseColor, metallic);

    vec3 directDiffuse = vec3(0.0);
    vec3 directSpecular = vec3(0.0);
    vec3 directClearcoat = vec3(0.0);
    vec3 directSheen = vec3(0.0);

    float anisotropyAmount = abs(anisotropy);
    float specRoughness = clamp(mix(roughness, roughness * (1.0 - 0.55 * anisotropyAmount), anisotropyAmount), 0.035, 1.0);

    for (int i = 0; i < 16; i++) {
        if (i >= max_light_number) break;

        vec3 L = getLightDirection(i, vWorldPos);
        float attenuation = getLightAttenuation(i, vWorldPos, L);
        float shadow = getCustomLightShadow(i);
        vec3 radiance = getLightRadiance(i, attenuation) * shadow;

        float NdotLRaw = dot(N, L);
        float NdotL = max(NdotLRaw, 0.0);
        float wrappedNdotL = computeWrappedDiffuse(NdotLRaw);
        float lightMask = step(0.000001, max(max(NdotL, wrappedNdotL), attenuation * shadow * max(uLightIntensity[i], 0.0)));

        vec3 H = safeNormalize(V + L, N);
        float NdotH = max(dot(N, H), 0.0);
        float VdotH = max(dot(V, H), 0.0);

        vec3 F = F_Schlick(F0, VdotH);
        float D = D_GGX(NdotH, specRoughness);
        float G = G_Smith(NdotV, max(NdotL, 0.001), specRoughness);

        vec3 specularBRDF = (D * G * F) / max(4.0 * NdotV * max(NdotL, 0.001), 0.001);
        specularBRDF *= max(uSpecularIntensity, 0.0);

        vec3 kS = F;
        vec3 kD = (vec3(1.0) - kS) * (1.0 - metallic);
        vec3 diffuseBRDF = kD * baseColor * RECIPROCAL_PI;

        directDiffuse += radiance * diffuseBRDF * wrappedNdotL * lightMask;
        directSpecular += radiance * specularBRDF * NdotL * lightMask;

        float ccD = D_GGX(NdotH, clearcoatRoughness);
        float ccG = G_Smith(NdotV, max(NdotL, 0.001), clearcoatRoughness);
        vec3 ccF = F_Schlick(vec3(0.04), VdotH);
        vec3 ccBRDF = (ccD * ccG * ccF) / max(4.0 * NdotV * max(NdotL, 0.001), 0.001);
        directClearcoat += radiance * ccBRDF * NdotL * clearcoat * lightMask;

        float sheenD = D_GGX(NdotH, sheenRoughness);
        float sheenG = G_Smith(NdotV, max(NdotL, 0.001), sheenRoughness);
        vec3 sheenF = F_Schlick(saturateVec3(sheenColor), VdotH);
        vec3 sheenBRDF = sheenD * sheenG * sheenF / max(4.0 * NdotV * max(NdotL, 0.001), 0.001);
        directSheen += radiance * sheenBRDF * NdotL * sheen * (1.0 - metallic) * lightMask;
    }

    float proceduralAO = computeAmbientOcclusion(vFaceUv, N);
    float ambientOcclusion = clamp(proceduralAO * aoMapValue, 0.0, 1.0);
    float directAO = mix(1.0, ambientOcclusion, clamp(uAODirectInfluence, 0.0, 1.0));
    float specAO = mix(1.0, ambientOcclusion, clamp(uAODirectInfluence * 0.35, 0.0, 1.0));

    vec3 ambientLight = max(uAmbientColor, vec3(0.0)) * max(uAmbient, 0.0);

    vec3 F_ambient = F_SchlickRoughness(F0, NdotV, roughness);
    vec3 ambientDiffuse = ambientLight * baseColor * (1.0 - metallic) * ambientOcclusion;
    vec3 ambientSpecular = ambientLight * F_ambient * max(uEnvSpecularStrength, 0.0) * (0.25 + 0.75 * (1.0 - roughness));
    ambientSpecular *= mix(vec3(1.0), baseColor, metallic) * ambientOcclusion;

    vec3 color = vec3(0.0);
    color += ambientDiffuse;
    color += ambientSpecular;
    color += directDiffuse * directAO;
    color += directSpecular * specAO;
    color += directClearcoat * specAO;
    color += directSheen * directAO;

    float transmissionFactor = transmission * (1.0 - metallic);
    vec3 absorption = exp(-max(vec3(1.0) - uAttenuationColor, vec3(0.0)) * thickness * max(uAttenuationDistance, 0.001));
    vec3 transmitted = ambientLight * baseColor * absorption;
    color = mix(color, transmitted + directSpecular * specAO, transmissionFactor);

    vec3 irid = evaluateIridescence(NdotV, iridescenceThickness);
    color += irid * iridescence * (0.08 + 0.35 * (1.0 - roughness));

    color += emissive;

    color += vec3(lift);
    color *= LIGHTCOLOR;

    if (lift > 0.2) {
        color.rg *= vec2(0.6, 0.7);
    }

    color = applyOutputMapping(color);

    gl_FragColor = vec4(color, texel.a);
}`,
                uniforms: {
                    // Base PBR Properties
                    "uBaseColor": { type: "color", value: "#ffffff", hexValue: "#ffffff" },
                    "uMetallic": { type: "float", value: 0.0 },
                    "uRoughness": { type: "float", value: 0.5 },
                    "uAO": { type: "float", value: 1.0 },

                    // Clearcoat
                    "uClearcoat": { type: "float", value: 0.0 },
                    "uClearcoatRoughness": { type: "float", value: 0.1 },

                    // Anisotropy
                    "uAnisotropy": { type: "float", value: 0.0 },
                    "uAnisotropyDirection": { type: "vec2", value: new THREE.Vector2(1.0, 0.0) },

                    // Sheen
                    "uSheen": { type: "float", value: 0.0 },
                    "uSheenColor": { type: "color", value: "#ffffff", hexValue: "#ffffff" },
                    "uSheenRoughness": { type: "float", value: 0.5 },

                    // Transmission
                    "uTransmission": { type: "float", value: 0.0 },
                    "uThickness": { type: "float", value: 1.0 },
                    "uAttenuationColor": { type: "color", value: "#ffffff", hexValue: "#ffffff" },
                    "uAttenuationDistance": { type: "float", value: 1.0 },
                    "uIOR": { type: "float", value: 1.5 },

                    // Iridescence
                    "uIridescence": { type: "float", value: 0.0 },
                    "uIridescenceIOR": { type: "float", value: 1.33 },
                    "uIridescenceThicknessMin": { type: "float", value: 100.0 },
                    "uIridescenceThicknessMax": { type: "float", value: 400.0 },

                    // Emission
                    "uEmissiveColor": { type: "color", value: "#000000", hexValue: "#000000" },
                    "uEmissiveStrength": { type: "float", value: 0.0 },

                    // Texture enable flags. Set these to true only when a real texture exists.
                    "uUseBaseColorMap": { type: "bool", value: false },
                    "uUseMetallicRoughnessMap": { type: "bool", value: false },
                    "uUseNormalMap": { type: "bool", value: false },
                    "uUseAOMap": { type: "bool", value: false },
                    "uUseEmissiveMap": { type: "bool", value: false },
                    "uUseClearcoatMap": { type: "bool", value: false },
                    "uUseClearcoatRoughnessMap": { type: "bool", value: false },
                    "uUseAnisotropyMap": { type: "bool", value: false },
                    "uUseSheenColorMap": { type: "bool", value: false },
                    "uUseSheenRoughnessMap": { type: "bool", value: false },
                    "uUseTransmissionMap": { type: "bool", value: false },
                    "uUseThicknessMap": { type: "bool", value: false },
                    "uUseIridescenceMap": { type: "bool", value: false },
                    "uUseIridescenceThicknessMap": { type: "bool", value: false },

                    // Texture Maps
                    "uBaseColorMap": { type: "sampler2D", value: null },
                    "uMetallicRoughnessMap": { type: "sampler2D", value: null },
                    "uNormalMap": { type: "sampler2D", value: null },
                    "uAOMap": { type: "sampler2D", value: null },
                    "uEmissiveMap": { type: "sampler2D", value: null },
                    "uClearcoatMap": { type: "sampler2D", value: null },
                    "uClearcoatRoughnessMap": { type: "sampler2D", value: null },
                    "uClearcoatNormalMap": { type: "sampler2D", value: null },
                    "uAnisotropyMap": { type: "sampler2D", value: null },
                    "uSheenColorMap": { type: "sampler2D", value: null },
                    "uSheenRoughnessMap": { type: "sampler2D", value: null },
                    "uTransmissionMap": { type: "sampler2D", value: null },
                    "uThicknessMap": { type: "sampler2D", value: null },
                    "uIridescenceMap": { type: "sampler2D", value: null },
                    "uIridescenceThicknessMap": { type: "sampler2D", value: null },

                    // Texture Scales
                    "uBaseColorMapScale": { type: "vec2", value: new THREE.Vector2(1, 1) },
                    "uMetallicRoughnessMapScale": { type: "vec2", value: new THREE.Vector2(1, 1) },
                    "uNormalMapScale": { type: "vec2", value: new THREE.Vector2(1, 1) },
                    "uAOMapScale": { type: "vec2", value: new THREE.Vector2(1, 1) },
                    "uEmissiveMapScale": { type: "vec2", value: new THREE.Vector2(1, 1) },
                    "uClearcoatMapScale": { type: "vec2", value: new THREE.Vector2(1, 1) },
                    "uClearcoatRoughnessMapScale": { type: "vec2", value: new THREE.Vector2(1, 1) },
                    "uAnisotropyMapScale": { type: "vec2", value: new THREE.Vector2(1, 1) },
                    "uSheenColorMapScale": { type: "vec2", value: new THREE.Vector2(1, 1) },
                    "uSheenRoughnessMapScale": { type: "vec2", value: new THREE.Vector2(1, 1) },
                    "uTransmissionMapScale": { type: "vec2", value: new THREE.Vector2(1, 1) },
                    "uThicknessMapScale": { type: "vec2", value: new THREE.Vector2(1, 1) },
                    "uIridescenceMapScale": { type: "vec2", value: new THREE.Vector2(1, 1) },
                    "uIridescenceThicknessMapScale": { type: "vec2", value: new THREE.Vector2(1, 1) },

                    // Rendering controls
                    "uNormalScale": { type: "float", value: 1.0 },
                    "uEnvSpecularStrength": { type: "float", value: 0.35 },
                    "uSpecularIntensity": { type: "float", value: 1.0 },

                    // Light arrays / Lightflow-compatible uniforms
                    "uLightPos": { type: "vec3v", value: Array.from({ length: 16 }, () => new THREE.Vector3()) },
                    "uLightDir": { type: "vec3v", value: Array.from({ length: 16 }, () => new THREE.Vector3(0, -1, 0)) },
                    "uLightIntensity": { type: "floatv", value: Array(16).fill(0.0) },
                    "uLightDistance": { type: "floatv", value: Array(16).fill(0.0) },
                    "uLightConeAngle": { type: "floatv", value: Array(16).fill(0.0) },
                    "uLightPenumbra": { type: "floatv", value: Array(16).fill(0.0) },
                    "uLightType": { type: "intv", value: Array(16).fill(0) },
                    "uLightColor": { type: "vec3v", value: Array.from({ length: 16 }, () => new THREE.Vector3()) },
                    "max_light_number": { type: "int", value: 0 },
                    "uLightCastShadow": { type: "intv", value: Array(16).fill(0) },
                    "uLightShadowIndex": { type: "intv", value: Array(16).fill(-1) },

                    // Ambient
                    "uAmbient": { type: "float", value: 0.3 },
                    "uAmbientColor": { type: "vec3", value: new THREE.Vector3(1, 1, 1) },

                    // Normal correction
                    "uWorldNormalMatrix": { type: "mat3", value: new THREE.Matrix3() },
                    "uStylizedNormalInfluence": { type: "float", value: 0.0 },

                    // Output / artistic controls
                    "uExposure": { type: "float", value: 1.0 },
                    "uUseToneMapping": { type: "float", value: 0.0 },
                    "uLightWrap": { type: "float", value: 0.0 },

                    // Ambient Occlusion
                    "uAOEnabled": { type: "bool", value: true },
                    "uAOStrength": { type: "float", value: 0.5 },
                    "uAORadius": { type: "float", value: 0.12 },
                    "uAOPower": { type: "float", value: 1.5 },
                    "uAOMin": { type: "float", value: 0.4 },
                    "uAODirectInfluence": { type: "float", value: 0.15 },

                    // Shadows
                    "uShadowStrength": { type: "float", value: 1.0 },
                    "uShadowFloor": { type: "float", value: 0.0 },

                    // Blockbench-style controls
                    "SHADE": { type: "bool", value: true },
                    "LIGHTSIDE": { type: "int", value: 0 },
                    "LIGHTCOLOR": { type: "vec3", value: new THREE.Vector3(1, 1, 1) },
                    "TEXTURE_SIZE": { type: "vec2", value: new THREE.Vector2(16, 16) }
                },
                enableShadows: true
            });



            const createLightflowUniforms = (withShadowBinding = false) => {
                const uniforms = {
                    // Light arrays
                    "uLightPos": {
                        type: "vec3v",
                        value: Array.from({ length: 16 }, () => new THREE.Vector3())
                    },
                    "uLightDir": {
                        type: "vec3v",
                        value: Array.from({ length: 16 }, () => new THREE.Vector3(0, -1, 0))
                    },
                    "uLightIntensity": {
                        type: "floatv",
                        value: Array(16).fill(0.0)
                    },
                    "uLightDistance": {
                        type: "floatv",
                        value: Array(16).fill(0.0)
                    },
                    "uLightConeAngle": {
                        type: "floatv",
                        value: Array(16).fill(0.0)
                    },
                    "uLightPenumbra": {
                        type: "floatv",
                        value: Array(16).fill(0.0)
                    },
                    "uLightType": {
                        type: "intv",
                        value: Array(16).fill(0)
                    },
                    "uLightColor": {
                        type: "vec3v",
                        value: Array.from({ length: 16 }, () => new THREE.Vector3())
                    },
                    "max_light_number": {
                        type: "int",
                        value: 0
                    },

                    // Ambient
                    "uAmbient": {
                        type: "float",
                        value: 0.3
                    },
                    "uAmbientColor": {
                        type: "vec3",
                        value: new THREE.Vector3(1, 1, 1)
                    },

                    // Normal correction
                    "uWorldNormalMatrix": {
                        type: "mat3",
                        value: new THREE.Matrix3()
                    },

                    // Output / artistic controls
                    "uExposure": {
                        type: "float",
                        value: 1.0
                    },
                    "uToneMapping": {
                        type: "int",
                        value: 0
                    },
                    "uStylizedNormalInfluence": {
                        type: "float",
                        value: 0.0
                    },
                    "uLightWrap": {
                        type: "float",
                        value: 0.0
                    },

                    // Ambient Occlusion - Voxel-friendly
                    "uAOEnabled": {
                        type: "bool",
                        value: true
                    },
                    "uAOStrength": {
                        type: "float",
                        value: 0.5
                    },
                    "uAORadius": {
                        type: "float",
                        value: 0.12
                    },
                    "uAOPower": {
                        type: "float",
                        value: 1.5
                    },
                    "uAOMin": {
                        type: "float",
                        value: 0.4
                    },
                    "uAODirectInfluence": {
                        type: "float",
                        value: 0.15
                    },
                    "uAOEdgeSharpness": {
                        type: "float",
                        value: 8.0
                    },
                    "uAOCornerWeight": {
                        type: "float",
                        value: 1.5
                    },
                    "uAOFaceNormalWeight": {
                        type: "float",
                        value: 0.3
                    },

                    // Blockbench-style controls
                    "SHADE": {
                        type: "bool",
                        value: true
                    },
                    "LIGHTSIDE": {
                        type: "int",
                        value: 0
                    },
                    "LIGHTCOLOR": {
                        type: "vec3",
                        value: new THREE.Vector3(1, 1, 1)
                    },
                    "TEXTURE_SIZE": {
                        type: "vec2",
                        value: new THREE.Vector2(16, 16)
                    }
                };

                if (withShadowBinding) {
                    uniforms["uLightCastShadow"] = {
                        type: "intv",
                        value: Array(16).fill(0)
                    };

                    uniforms["uLightShadowIndex"] = {
                        type: "intv",
                        value: Array(16).fill(-1)
                    };

                    uniforms["uShadowStrength"] = {
                        type: "float",
                        value: 1.0
                    };

                    uniforms["uShadowFloor"] = {
                        type: "float",
                        value: 0.0
                    };
                }

                return uniforms;
            };

            let lightflow = new FancyShaderMaterial({
                id: 'lightflow',
                name: tl('shader_architect.preset.lightflow'),
                icon: 'wb_iridescent',
                isCustom: false,
                vertex: `attribute float highlight;
attribute vec2 uv_fit_fixed;

uniform bool SHADE;
uniform int LIGHTSIDE;
uniform mat3 uWorldNormalMatrix;
uniform float uStylizedNormalInfluence;

varying vec2 vUv;
varying vec2 vFaceUv;
varying float lift;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

vec3 applyLightSide(vec3 n) {
    vec3 N = n;

    if (LIGHTSIDE == 1) {
        float t = N.y;
        N.y = -N.z;
        N.z = t;
    } else if (LIGHTSIDE == 2) {
        float t = N.y;
        N.y = N.x;
        N.x = t;
    } else if (LIGHTSIDE == 3) {
        N.y = -N.y;
    } else if (LIGHTSIDE == 4) {
        float t = N.y;
        N.y = N.z;
        N.z = t;
    } else if (LIGHTSIDE == 5) {
        float t = N.y;
        N.y = -N.x;
        N.x = t;
    }

    return normalize(N);
}

void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);

    vWorldPos = worldPosition.xyz;

    vec3 physicalNormal = normalize(uWorldNormalMatrix * normal);
    vec3 stylizedNormal = applyLightSide(physicalNormal);

    if (SHADE) {
        vWorldNormal = normalize(mix(
            physicalNormal,
            stylizedNormal,
            clamp(uStylizedNormalInfluence, 0.0, 1.0)
        ));
    } else {
        vWorldNormal = physicalNormal;
    }

    vUv = uv;
    vFaceUv = uv_fit_fixed;

    lift = highlight == 2.0 ? 0.22 :
           highlight == 1.0 ? 0.10 :
           0.0;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
                fragment: `uniform sampler2D map;
uniform vec3 LIGHTCOLOR;

uniform vec3 uLightPos[16];
uniform vec3 uLightDir[16];
uniform float uLightIntensity[16];
uniform float uLightDistance[16];
uniform float uLightConeAngle[16];
uniform float uLightPenumbra[16];
uniform int uLightType[16];
uniform vec3 uLightColor[16];
uniform int max_light_number;

uniform float uAmbient;
uniform vec3 uAmbientColor;

uniform float uExposure;
uniform int uToneMapping;
uniform float uLightWrap;

uniform bool uAOEnabled;
uniform float uAOStrength;
uniform float uAORadius;
uniform float uAOPower;
uniform float uAOMin;
uniform float uAODirectInfluence;
uniform float uAOEdgeSharpness;
uniform float uAOCornerWeight;
uniform float uAOFaceNormalWeight;

varying vec2 vUv;
varying vec2 vFaceUv;
varying float lift;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

#define SA_LIGHT_POINT 0
#define SA_LIGHT_DIRECTIONAL 1
#define SA_LIGHT_SPOT 2

// Tonemapping modes
#define TM_NONE 0
#define TM_ACES 1
#define TM_REINHARD 2
#define TM_UNCHARTED2 3
#define TM_HABLE 4
#define TM_FILMIC 5
#define TM_LINEAR 6

vec3 safeNormalize(vec3 v, vec3 fallback) {
    float lenSq = dot(v, v);
    if (lenSq <= 1e-8) return fallback;
    return v * inversesqrt(lenSq);
}

float computeDiffuse(vec3 normal, vec3 lightDir) {
    float ndotl = dot(normal, lightDir);
    float wrapAmount = clamp(uLightWrap, 0.0, 1.0);

    if (wrapAmount > 0.0) {
        return clamp((ndotl + wrapAmount) / (1.0 + wrapAmount), 0.0, 1.0);
    }

    return max(ndotl, 0.0);
}

float computeDistanceAttenuation(float dist, float maxDist) {
    dist = max(dist, 0.0001);

    if (maxDist > 0.0) {
        if (dist >= maxDist) return 0.0;

        float x = clamp(dist / maxDist, 0.0, 1.0);
        float falloff = clamp(1.0 - pow(x, 4.0), 0.0, 1.0);

        return (falloff * falloff) / max(dist * dist, 1.0);
    }

    return 1.0 / (1.0 + 0.04 * dist + 0.002 * dist * dist);
}

float computeSpotAttenuation(int lightIndex, vec3 lightDir) {
    vec3 spotDirection = safeNormalize(uLightDir[lightIndex], vec3(0.0, -1.0, 0.0));

    float coneAngle = clamp(uLightConeAngle[lightIndex], 0.001, 3.14159265);
    float penumbra = clamp(uLightPenumbra[lightIndex], 0.0, 0.999);

    float theta = dot(-lightDir, spotDirection);

    float outerCutoff = cos(coneAngle);
    float innerCutoff = cos(coneAngle * (1.0 - penumbra));
    float epsilon = max(innerCutoff - outerCutoff, 0.0001);

    return clamp((theta - outerCutoff) / epsilon, 0.0, 1.0);
}

vec3 computeLightContribution(int lightIndex, vec3 normal, vec3 worldPos) {
    int type = uLightType[lightIndex];

    vec3 lightDir = vec3(0.0, 1.0, 0.0);
    float attenuation = 1.0;

    if (type == SA_LIGHT_DIRECTIONAL) {
        lightDir = safeNormalize(-uLightDir[lightIndex], vec3(0.0, 1.0, 0.0));
    } else {
        vec3 lightVec = uLightPos[lightIndex] - worldPos;
        float dist = max(length(lightVec), 0.0001);

        lightDir = lightVec / dist;
        attenuation = computeDistanceAttenuation(dist, uLightDistance[lightIndex]);

        if (type == SA_LIGHT_SPOT) {
            attenuation *= computeSpotAttenuation(lightIndex, lightDir);
        }
    }

    float diffuse = computeDiffuse(normal, lightDir);
    float intensity = max(uLightIntensity[lightIndex], 0.0);

    return max(uLightColor[lightIndex], vec3(0.0)) * diffuse * intensity * attenuation;
}

// Voxel-friendly AO: detects face orientation, edges, and corners
float computeVoxelAO(vec2 faceUv, vec3 normal) {
    if (!uAOEnabled) return 1.0;

    vec2 uv = clamp(faceUv, vec2(0.0), vec2(1.0));
    float radius = clamp(uAORadius, 0.0001, 0.5);
    float sharpness = clamp(uAOEdgeSharpness, 1.0, 32.0);
    float cornerWeight = clamp(uAOCornerWeight, 0.0, 3.0);
    float faceNormalWeight = clamp(uAOFaceNormalWeight, 0.0, 1.0);
    float strength = clamp(uAOStrength, 0.0, 1.0);

    // Face normal contribution - darker on downward-facing faces
    float faceNormalAO = 1.0;
    if (faceNormalWeight > 0.0) {
        float downward = clamp(-normal.y, 0.0, 1.0);
        faceNormalAO = 1.0 - downward * faceNormalWeight * 0.25;
    }

    // Edge detection with sharp falloff
    float edgeX = 1.0 - smoothstep(0.0, radius, uv.x) * smoothstep(0.0, radius, 1.0 - uv.x);
    float edgeY = 1.0 - smoothstep(0.0, radius, uv.y) * smoothstep(0.0, radius, 1.0 - uv.y);
    
    // Sharpen edges
    edgeX = pow(edgeX, sharpness * 0.1);
    edgeY = pow(edgeY, sharpness * 0.1);
    
    float edgeAO = max(edgeX, edgeY);

    // Corner detection - strongest at corners
    float cornerX = smoothstep(0.0, radius, uv.x) * smoothstep(0.0, radius, 1.0 - uv.x);
    float cornerY = smoothstep(0.0, radius, uv.y) * smoothstep(0.0, radius, 1.0 - uv.y);
    float cornerAO = cornerX * cornerY * cornerWeight;

    // Combine: edges and corners create occlusion
    float cavity = edgeAO + cornerAO;
    cavity = clamp(cavity, 0.0, 1.0);

    // Apply strength
    float ao = 1.0 - cavity * strength;
    ao *= faceNormalAO;

    // Power curve for artistic control
    ao = pow(clamp(ao, 0.0, 1.0), max(uAOPower, 0.001));

    return clamp(ao, clamp(uAOMin, 0.0, 1.0), 1.0);
}

// ACES Filmic Tone Mapping
vec3 acesFilm(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// Reinhard Tone Mapping
vec3 reinhard(vec3 x) {
    return x / (x + vec3(1.0));
}

// Uncharted 2 Tone Mapping (Hable)
vec3 uncharted2(vec3 x) {
    float A = 0.15;
    float B = 0.50;
    float C = 0.10;
    float D = 0.20;
    float E = 0.02;
    float F = 0.30;
    return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

// Hable Tone Mapping (optimized)
vec3 hable(vec3 x) {
    float A = 0.22;
    float B = 0.30;
    float C = 0.10;
    float D = 0.20;
    float E = 0.01;
    float F = 0.30;
    return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

// Filmic Tone Mapping (generic)
vec3 filmic(vec3 x) {
    float exposure = max(uExposure, 0.001);
    x *= exposure;
    x = max(vec3(0.0), x - 0.004);
    float gamma = 2.2;
    return pow((x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06), vec3(1.0 / gamma));
}

// Linear with exposure only
vec3 linearTone(vec3 x) {
    return clamp(x * max(uExposure, 0.001), 0.0, 1.0);
}

vec3 applyToneMapping(vec3 color) {
    color = max(color, vec3(0.0));
    
    switch (uToneMapping) {
        case TM_ACES:
            return acesFilm(color * max(uExposure, 0.001));
        case TM_REINHARD:
            return reinhard(color * max(uExposure, 0.001));
        case TM_UNCHARTED2:
            return uncharted2(color * max(uExposure, 0.001));
        case TM_HABLE:
            return hable(color * max(uExposure, 0.001));
        case TM_FILMIC:
            return filmic(color);
        case TM_LINEAR:
            return linearTone(color);
        default:
            return clamp(color, 0.0, 1.0);
    }
}

void main() {
    vec4 texel = texture2D(map, vUv);

    if (texel.a < 0.01) discard;

    vec3 normal = safeNormalize(vWorldNormal, vec3(0.0, 1.0, 0.0));

    vec3 directLight = vec3(0.0);

    for (int i = 0; i < 16; i++) {
        if (i >= max_light_number) break;
        if (uLightIntensity[i] <= 0.0) continue;

        directLight += computeLightContribution(i, normal, vWorldPos);
    }

    float ambientOcclusion = computeVoxelAO(vFaceUv, normal);

    vec3 ambientLight = max(uAmbientColor, vec3(0.0)) * max(uAmbient, 0.0);
    ambientLight *= ambientOcclusion;

    float directAO = mix(1.0, ambientOcclusion, clamp(uAODirectInfluence, 0.0, 1.0));
    vec3 lighting = ambientLight + directLight * directAO;

    vec3 finalColor = texel.rgb * lighting;
    finalColor += vec3(lift);
    finalColor *= LIGHTCOLOR;

    if (lift > 0.2) {
        finalColor.rg *= vec2(0.6, 0.7);
    }

    finalColor = applyToneMapping(finalColor);

    gl_FragColor = vec4(finalColor, texel.a);
}`,
                uniforms: createLightflowUniforms(false)
            });

            let shaded_lightflow = new FancyShaderMaterial({
                id: 'shaded_lightflow',
                name: tl('shader_architect.preset.shaded_lightflow'),
                icon: 'brightness_5',
                isCustom: false,
                vertex: `#include <common>
#include <shadowmap_pars_vertex>

attribute float highlight;
attribute vec2 uv_fit_fixed;

uniform bool SHADE;
uniform int LIGHTSIDE;
uniform mat3 uWorldNormalMatrix;
uniform float uStylizedNormalInfluence;

varying vec2 vUv;
varying vec2 vFaceUv;
varying float lift;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

vec3 applyLightSide(vec3 n) {
    vec3 N = n;

    if (LIGHTSIDE == 1) {
        float t = N.y;
        N.y = -N.z;
        N.z = t;
    } else if (LIGHTSIDE == 2) {
        float t = N.y;
        N.y = N.x;
        N.x = t;
    } else if (LIGHTSIDE == 3) {
        N.y = -N.y;
    } else if (LIGHTSIDE == 4) {
        float t = N.y;
        N.y = N.z;
        N.z = t;
    } else if (LIGHTSIDE == 5) {
        float t = N.y;
        N.y = -N.x;
        N.x = t;
    }

    return normalize(N);
}

void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);

    /*
        IMPORTANTE:
        Three.js r129 necesita esta variable exacta para #include <shadowmap_vertex>.
        No la borres aunque usemos uWorldNormalMatrix para nuestra iluminación.
    */
    vec3 transformedNormal = normalize(normalMatrix * normal);

    vWorldPos = worldPosition.xyz;

    vec3 physicalNormal = normalize(uWorldNormalMatrix * normal);
    vec3 stylizedNormal = applyLightSide(physicalNormal);

    if (SHADE) {
        vWorldNormal = normalize(mix(
            physicalNormal,
            stylizedNormal,
            clamp(uStylizedNormalInfluence, 0.0, 1.0)
        ));
    } else {
        vWorldNormal = physicalNormal;
    }

    vUv = uv;
    vFaceUv = uv_fit_fixed;

    lift = highlight == 2.0 ? 0.22 :
           highlight == 1.0 ? 0.10 :
           0.0;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

    #include <shadowmap_vertex>
}`,
                fragment: `#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>

uniform sampler2D map;
uniform vec3 LIGHTCOLOR;

uniform vec3 uLightPos[16];
uniform vec3 uLightDir[16];
uniform float uLightIntensity[16];
uniform float uLightDistance[16];
uniform float uLightConeAngle[16];
uniform float uLightPenumbra[16];
uniform int uLightType[16];
uniform vec3 uLightColor[16];
uniform int max_light_number;

uniform int uLightCastShadow[16];
uniform int uLightShadowIndex[16];

uniform float uAmbient;
uniform vec3 uAmbientColor;

uniform float uExposure;
uniform float uUseToneMapping;
uniform float uLightWrap;

uniform bool uAOEnabled;
uniform float uAOStrength;
uniform float uAORadius;
uniform float uAOPower;
uniform float uAOMin;
uniform float uAODirectInfluence;

uniform float uShadowStrength;
uniform float uShadowFloor;

varying vec2 vUv;
varying vec2 vFaceUv;
varying float lift;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

#define SA_LIGHT_POINT 0
#define SA_LIGHT_DIRECTIONAL 1
#define SA_LIGHT_SPOT 2

vec3 safeNormalize(vec3 v, vec3 fallback) {
    float lenSq = dot(v, v);
    if (lenSq <= 1e-8) return fallback;
    return v * inversesqrt(lenSq);
}

float computeDiffuse(vec3 normal, vec3 lightDir) {
    float ndotl = dot(normal, lightDir);
    float wrapAmount = clamp(uLightWrap, 0.0, 1.0);

    if (wrapAmount > 0.0) {
        return clamp((ndotl + wrapAmount) / (1.0 + wrapAmount), 0.0, 1.0);
    }

    return max(ndotl, 0.0);
}

float computeDistanceAttenuation(float dist, float maxDist) {
    dist = max(dist, 0.0001);

    if (maxDist > 0.0) {
        if (dist >= maxDist) return 0.0;

        float x = clamp(dist / maxDist, 0.0, 1.0);
        float falloff = clamp(1.0 - pow(x, 4.0), 0.0, 1.0);

        return (falloff * falloff) / max(dist * dist, 1.0);
    }

    return 1.0 / (1.0 + 0.04 * dist + 0.002 * dist * dist);
}

float computeSpotAttenuation(int lightIndex, vec3 lightDir) {
    vec3 spotDirection = safeNormalize(uLightDir[lightIndex], vec3(0.0, -1.0, 0.0));

    float coneAngle = clamp(uLightConeAngle[lightIndex], 0.001, 3.14159265);
    float penumbra = clamp(uLightPenumbra[lightIndex], 0.0, 0.999);

    float theta = dot(-lightDir, spotDirection);

    float outerCutoff = cos(coneAngle);
    float innerCutoff = cos(coneAngle * (1.0 - penumbra));
    float epsilon = max(innerCutoff - outerCutoff, 0.0001);

    return clamp((theta - outerCutoff) / epsilon, 0.0, 1.0);
}

vec3 computeLightContribution(int lightIndex, vec3 normal, vec3 worldPos) {
    int type = uLightType[lightIndex];

    vec3 lightDir = vec3(0.0, 1.0, 0.0);
    float attenuation = 1.0;

    if (type == SA_LIGHT_DIRECTIONAL) {
        lightDir = safeNormalize(-uLightDir[lightIndex], vec3(0.0, 1.0, 0.0));
    } else {
        vec3 lightVec = uLightPos[lightIndex] - worldPos;
        float dist = max(length(lightVec), 0.0001);

        lightDir = lightVec / dist;
        attenuation = computeDistanceAttenuation(dist, uLightDistance[lightIndex]);

        if (type == SA_LIGHT_SPOT) {
            attenuation *= computeSpotAttenuation(lightIndex, lightDir);
        }
    }

    float diffuse = computeDiffuse(normal, lightDir);
    float intensity = max(uLightIntensity[lightIndex], 0.0);

    return max(uLightColor[lightIndex], vec3(0.0)) * diffuse * intensity * attenuation;
}

float getDirectionalShadowByIndex(int shadowIndex) {
    float result = 1.0;

    #ifdef USE_SHADOWMAP

    #if NUM_DIR_LIGHT_SHADOWS > 0

        DirectionalLightShadow directionalLight;

        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
            directionalLight = directionalLightShadows[ i ];

            if (UNROLLED_LOOP_INDEX == shadowIndex) {
                result = receiveShadow ? getShadow(
                    directionalShadowMap[ i ],
                    directionalLight.shadowMapSize,
                    directionalLight.shadowBias,
                    directionalLight.shadowRadius,
                    vDirectionalShadowCoord[ i ]
                ) : 1.0;
            }
        }
        #pragma unroll_loop_end

    #endif

    #endif

    return result;
}

float getSpotShadowByIndex(int shadowIndex) {
    float result = 1.0;

    #ifdef USE_SHADOWMAP

    #if NUM_SPOT_LIGHT_SHADOWS > 0

        SpotLightShadow spotLight;

        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
            spotLight = spotLightShadows[ i ];

            if (UNROLLED_LOOP_INDEX == shadowIndex) {
                result = receiveShadow ? getShadow(
                    spotShadowMap[ i ],
                    spotLight.shadowMapSize,
                    spotLight.shadowBias,
                    spotLight.shadowRadius,
                    vSpotShadowCoord[ i ]
                ) : 1.0;
            }
        }
        #pragma unroll_loop_end

    #endif

    #endif

    return result;
}

float getPointShadowByIndex(int shadowIndex) {
    float result = 1.0;

    #ifdef USE_SHADOWMAP

    #if NUM_POINT_LIGHT_SHADOWS > 0

        PointLightShadow pointLight;

        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
            pointLight = pointLightShadows[ i ];

            if (UNROLLED_LOOP_INDEX == shadowIndex) {
                result = receiveShadow ? getPointShadow(
                    pointShadowMap[ i ],
                    pointLight.shadowMapSize,
                    pointLight.shadowBias,
                    pointLight.shadowRadius,
                    vPointShadowCoord[ i ],
                    pointLight.shadowCameraNear,
                    pointLight.shadowCameraFar
                ) : 1.0;
            }
        }
        #pragma unroll_loop_end

    #endif

    #endif

    return result;
}

float getCustomLightShadow(int lightIndex) {
    if (uLightCastShadow[lightIndex] == 0) return 1.0;

    int shadowIndex = uLightShadowIndex[lightIndex];
    if (shadowIndex < 0) return 1.0;

    int type = uLightType[lightIndex];

    float shadow = 1.0;

    if (type == SA_LIGHT_DIRECTIONAL) {
        shadow = getDirectionalShadowByIndex(shadowIndex);
    } else if (type == SA_LIGHT_SPOT) {
        shadow = getSpotShadowByIndex(shadowIndex);
    } else {
        shadow = getPointShadowByIndex(shadowIndex);
    }

    shadow = clamp(shadow, 0.0, 1.0);
    shadow = max(shadow, clamp(uShadowFloor, 0.0, 1.0));

    return mix(1.0, shadow, clamp(uShadowStrength, 0.0, 1.0));
}

float computeFaceCavityAO(vec2 faceUv) {
    vec2 uv = clamp(faceUv, vec2(0.0), vec2(1.0));
    float radius = clamp(uAORadius, 0.0001, 0.5);

    float left = 1.0 - smoothstep(0.0, radius, uv.x);
    float right = 1.0 - smoothstep(0.0, radius, 1.0 - uv.x);
    float bottom = 1.0 - smoothstep(0.0, radius, uv.y);
    float top = 1.0 - smoothstep(0.0, radius, 1.0 - uv.y);

    float edgeAO = max(max(left, right), max(bottom, top));
    float cornerAO = max(max(left * bottom, left * top), max(right * bottom, right * top));

    return clamp(edgeAO * 0.30 + cornerAO * 0.70, 0.0, 1.0);
}

float computeHemisphereAO(vec3 normal) {
    float strength = clamp(uAOStrength, 0.0, 1.0);
    float downward = clamp(-normal.y, 0.0, 1.0);

    return 1.0 - downward * strength * 0.18;
}

float computeAmbientOcclusion(vec2 faceUv, vec3 normal) {
    if (!uAOEnabled) return 1.0;

    float strength = clamp(uAOStrength, 0.0, 1.0);
    float cavity = computeFaceCavityAO(faceUv);

    float ao = 1.0 - cavity * strength;
    ao *= computeHemisphereAO(normal);

    ao = pow(clamp(ao, 0.0, 1.0), max(uAOPower, 0.001));

    return clamp(ao, clamp(uAOMin, 0.0, 1.0), 1.0);
}

vec3 applyOutputMapping(vec3 color) {
    color = max(color, vec3(0.0));

    if (uUseToneMapping > 0.5) {
        float exposure = max(uExposure, 0.001);
        return vec3(1.0) - exp(-color * exposure);
    }

    return clamp(color, 0.0, 1.0);
}

void main() {
    vec4 texel = texture2D(map, vUv);

    if (texel.a < 0.01) discard;

    vec3 normal = safeNormalize(vWorldNormal, vec3(0.0, 1.0, 0.0));

    vec3 directLight = vec3(0.0);

    for (int i = 0; i < 16; i++) {
        if (i >= max_light_number) break;
        if (uLightIntensity[i] <= 0.0) continue;

        vec3 lightContribution = computeLightContribution(i, normal, vWorldPos);
        float shadow = getCustomLightShadow(i);

        directLight += lightContribution * shadow;
    }

    float ambientOcclusion = computeAmbientOcclusion(vFaceUv, normal);

    vec3 ambientLight = max(uAmbientColor, vec3(0.0)) * max(uAmbient, 0.0);
    ambientLight *= ambientOcclusion;

    float directAO = mix(1.0, ambientOcclusion, clamp(uAODirectInfluence, 0.0, 1.0));
    vec3 lighting = ambientLight + directLight * directAO;

    vec3 finalColor = texel.rgb * lighting;
    finalColor += vec3(lift);
    finalColor *= LIGHTCOLOR;

    if (lift > 0.2) {
        finalColor.rg *= vec2(0.6, 0.7);
    }

    finalColor = applyOutputMapping(finalColor);

    gl_FragColor = vec4(finalColor, texel.a);
}`,
                uniforms: createLightflowUniforms(true),
                enableShadows: true
            });

            //Experimental

            let uv_shadow = new FancyShaderMaterial({
                id: 'uv_shadow',
                name: tl('shader_architect.preset.uv_shadow'),
                icon: 'flash_auto',
                isCustom: true,
                vertex: `
                    #include <common>
                    #include <shadowmap_pars_vertex> 

                    attribute float highlight;
                    attribute vec2 uv_fit_fixed;
                    attribute vec2 faceSize;
                    attribute vec2 uvSize;

                    uniform bool SHADE; 
                    uniform int LIGHTSIDE;

                    varying vec2 vUv; 
                    varying float light; 
                    varying float lift;

                    varying vec2 vuv_fit_fixed;
                    varying vec2 vfaceSize;
                    varying vec2 vuvSize;

                    void main() {
                        vec3 transformedNormal = normalize(normalMatrix * normal);
                        vec4 worldPosition = modelMatrix * vec4(position, 1.0);

                        if(SHADE) {
                            vec3 N = transformedNormal;
                            if (LIGHTSIDE == 1) { float t = N.y; N.y = -N.z; N.z = t; }
                            else if (LIGHTSIDE == 2) { float t = N.y; N.y = N.x; N.x = t; }
                            else if (LIGHTSIDE == 3) { N.y = -N.y; }
                            else if (LIGHTSIDE == 4) { float t = N.y; N.y = N.z; N.z = t; }
                            else if (LIGHTSIDE == 5) { float t = N.y; N.y = -N.x; N.x = t; }
                            
                            float yLight = (1.0 + N.y) * 0.5;
                            light = yLight * 0.5 + N.x * N.x * -0.15 + N.z * N.z * 0.05 + 0.5;
                        } else { 
                            light = 1.0; 
                        }
                        
                        lift = (highlight == 2.0) ? 0.22 : (highlight == 1.0) ? 0.1 : 0.0;
                        vUv = uv; 
                        
                        vuv_fit_fixed = uv_fit_fixed;
                        vfaceSize = faceSize;
                        vuvSize = uvSize;
                        
                        gl_Position = projectionMatrix * viewMatrix * worldPosition;

                        #include <shadowmap_vertex> 
                    }
                `,
                fragment: `
                    #include <common>
                    #include <packing>
                    #include <lights_pars_begin>
                    #include <shadowmap_pars_fragment>
                    
                    // 1. PRIMERO DECLARAMOS LOS UNIFORMS Y VARYINGS
                    uniform sampler2D map; 
                    uniform bool EMISSIVE; 
                    uniform vec3 LIGHTCOLOR;
                    uniform float AMBIENT_INTENSITY;

                    varying vec2 vUv; 
                    varying float light; 
                    varying float lift;
                    
                    varying vec2 vuv_fit_fixed;
                    varying vec2 vfaceSize;
                    varying vec2 vuvSize;

                    // 2. LUEGO LAS FUNCIONES QUE LOS UTILIZAN
                    vec4 getShadowCoordAtUV(vec4 currentShadowCoord, vec2 targetUV, vec2 currentUV) {
                        vec2 deltaUV = targetUV - currentUV;
                        
                        vec2 dUV_dx = dFdx(currentUV);
                        vec2 dUV_dy = dFdy(currentUV);
                        
                        vec4 dCoord_dx = dFdx(currentShadowCoord);
                        vec4 dCoord_dy = dFdy(currentShadowCoord);
                        
                        float det = dUV_dx.x * dUV_dy.y - dUV_dx.y * dUV_dy.x;
                        
                        if (abs(det) > 0.00001) {
                            float invDet = 1.0 / det;
                            
                            vec4 dCoord_du = (dCoord_dx * dUV_dy.y - dCoord_dy * dUV_dx.y) * invDet;
                            vec4 dCoord_dv = (dCoord_dy * dUV_dx.x - dCoord_dx * dUV_dy.x) * invDet;
                            
                            return currentShadowCoord + dCoord_du * deltaUV.x + dCoord_dv * deltaUV.y;
                        }
                        
                        return currentShadowCoord;
                    }

                    float getShadowAtUV(vec2 targetUV) {
                        float shadow = 1.0;
                        
                        #ifdef USE_SHADOWMAP
                        vec4 shadowCoord; 
                        
                        #if NUM_DIR_LIGHT_SHADOWS > 0
                            DirectionalLightShadow directionalLight;
                            #pragma unroll_loop_start
                            for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
                                directionalLight = directionalLightShadows[ i ];
                                shadowCoord = getShadowCoordAtUV(vDirectionalShadowCoord[ i ], targetUV, vUv);
                                shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowBias, directionalLight.shadowRadius, shadowCoord ) : 1.0;
                            }
                            #pragma unroll_loop_end
                        #endif

                        #if NUM_SPOT_LIGHT_SHADOWS > 0
                            SpotLightShadow spotLight;
                            #pragma unroll_loop_start
                            for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
                                spotLight = spotLightShadows[ i ];
                                shadowCoord = getShadowCoordAtUV(vSpotShadowCoord[ i ], targetUV, vUv);
                                shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowBias, spotLight.shadowRadius, shadowCoord ) : 1.0;
                            }
                            #pragma unroll_loop_end
                        #endif

                        #if NUM_POINT_LIGHT_SHADOWS > 0
                            PointLightShadow pointLight;
                            #pragma unroll_loop_start
                            for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
                                pointLight = pointLightShadows[ i ];
                                shadowCoord = getShadowCoordAtUV(vPointShadowCoord[ i ], targetUV, vUv);
                                shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowBias, pointLight.shadowRadius, shadowCoord, pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
                            }
                            #pragma unroll_loop_end
                        #endif
                        #endif

                        return shadow;
                    }

                    // 3. FINALMENTE EL MAIN
                    void main() {
                        vec4 color = texture2D(map, vUv);
                        if(color.a < 0.01) discard;

                        // Aquí puedes alterar las UVs de las que leerás la sombra
                        // Por ejemplo, aquí estoy leyendo la sombra de las UV actuales:
                        vec2 shadowTargetUV = vUv; 

                        // Extraemos la sombra de esas UV calculadas
                        float shadow = getShadowAtUV(shadowTargetUV);
                        
                        float lightEffect = light * mix(AMBIENT_INTENSITY, 1.0, shadow);

                        if(!EMISSIVE) {
                            gl_FragColor = vec4(lift + color.rgb * lightEffect, color.a);
                            gl_FragColor.rgb *= LIGHTCOLOR;
                        } else {
                            vec3 light_mix = (lightEffect * LIGHTCOLOR) + (1.0 - lightEffect * LIGHTCOLOR) * (1.0 - color.a);
                            gl_FragColor = vec4(lift + color.rgb * light_mix, 1.0);
                        }

                        if(lift > 0.2) { 
                            gl_FragColor.rg *= vec2(0.6, 0.7); 
                        }
                    }
                `,
                uniforms: {
                    "LIGHTCOLOR": { type: "vec3", value: new THREE.Vector3(1, 1, 1) },
                    "SHADE": { type: "bool", value: true },
                    "LIGHTSIDE": { type: "int", value: 0 },
                    "EMISSIVE": { type: "bool", value: false },
                    "AMBIENT_INTENSITY": { type: "float", value: 0.4 }
                    // Se han eliminado los uniforms de SHADOW_SNAP, SHADOW_SMOOTH y RESOLUTION_FACTOR
                },
                enableShadows: true
            });


            //Outdated, but keeping for reference

            let pixelated_shaded_lightflow = new FancyShaderMaterial({
                id: 'pixelated_shaded_lightflow',
                name: tl('shader_architect.preset.pixelated_shaded_lightflow'),
                icon: 'gradient',
                isCustom: false,
                vertex: `#include <common>
#include <shadowmap_pars_vertex>

attribute float highlight;
attribute vec2 uv_fit_fixed;
attribute vec2 faceSize;
attribute vec2 uvSize;

uniform bool SHADE;
uniform int LIGHTSIDE;

varying vec2 vUv;
varying float light;
varying float lift;

varying vec2 vuv_fit_fixed;
varying vec2 vfaceSize;
varying vec2 vuvSize;

void main() {
    vec3 transformedNormal = normalize(normalMatrix * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);

    if (SHADE) {
        vec3 N = transformedNormal;

        if (LIGHTSIDE == 1) {
            float t = N.y;
            N.y = -N.z;
            N.z = t;
        } else if (LIGHTSIDE == 2) {
            float t = N.y;
            N.y = N.x;
            N.x = t;
        } else if (LIGHTSIDE == 3) {
            N.y = -N.y;
        } else if (LIGHTSIDE == 4) {
            float t = N.y;
            N.y = N.z;
            N.z = t;
        } else if (LIGHTSIDE == 5) {
            float t = N.y;
            N.y = -N.x;
            N.x = t;
        }

        float yLight = (1.0 + N.y) * 0.5;

        light =
            yLight * 0.5 +
            N.x * N.x * -0.15 +
            N.z * N.z * 0.05 +
            0.5;
    } else {
        light = 1.0;
    }

    lift = highlight == 2.0 ? 0.22 :
           highlight == 1.0 ? 0.10 :
           0.0;

    vUv = uv;

    vuv_fit_fixed = uv_fit_fixed;
    vfaceSize = faceSize;
    vuvSize = uvSize;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;

    #include <shadowmap_vertex>
}`,
                fragment: `#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>

uniform sampler2D map;
uniform bool EMISSIVE;
uniform vec3 LIGHTCOLOR;
uniform float AMBIENT_INTENSITY;

varying vec2 vUv;
varying float light;
varying float lift;

varying vec2 vuv_fit_fixed;
varying vec2 vfaceSize;
varying vec2 vuvSize;

#define SHADOW_DET_EPS 1e-12
#define SHADOW_QUALITY_EPS 1e-5

#define PROJECTED_SHADOW_COORD_MARGIN 0.05
#define PROJECTED_SHADOW_MAX_XY_JUMP 0.25
#define PROJECTED_SHADOW_MAX_Z_JUMP 0.25

#define POINT_SHADOW_MIN_LENGTH 1e-6
#define POINT_SHADOW_MAX_ABSOLUTE_JUMP 0.75
#define POINT_SHADOW_MAX_RELATIVE_JUMP 0.35

vec2 getPixelCenterUV(vec2 localUV, vec2 gridSize) {
    vec2 grid = max(floor(gridSize + 0.5), vec2(1.0));

    // Evita que UV exactamente 1.0 caiga fuera del último pixel.
    vec2 safeUV = clamp(localUV, vec2(0.0), vec2(0.999999));

    return (floor(safeUV * grid) + 0.5) / grid;
}

vec4 getRawShadowCoordAtUV(
    vec4 currentShadowCoord,
    vec2 targetUV,
    vec2 currentUV,
    out bool valid
) {
    valid = false;

    vec2 deltaUV = targetUV - currentUV;

    vec2 dUV_dx = dFdx(currentUV);
    vec2 dUV_dy = dFdy(currentUV);

    vec4 dCoord_dx = dFdx(currentShadowCoord);
    vec4 dCoord_dy = dFdy(currentShadowCoord);

    float det = dUV_dx.x * dUV_dy.y - dUV_dx.y * dUV_dy.x;

    float uvArea = length(dUV_dx) * length(dUV_dy);
    float quality = abs(det) / max(uvArea, SHADOW_DET_EPS);

    if (abs(det) > SHADOW_DET_EPS && quality > SHADOW_QUALITY_EPS) {
        float invDet = 1.0 / det;

        vec4 dCoord_du =
            (dCoord_dx * dUV_dy.y - dCoord_dy * dUV_dx.y) * invDet;

        vec4 dCoord_dv =
            (dCoord_dy * dUV_dx.x - dCoord_dx * dUV_dy.x) * invDet;

        valid = true;

        return currentShadowCoord +
            dCoord_du * deltaUV.x +
            dCoord_dv * deltaUV.y;
    }

    return currentShadowCoord;
}

vec4 getProjectedShadowCoordAtUV(
    vec4 currentShadowCoord,
    vec2 targetUV,
    vec2 currentUV
) {
    bool valid;

    vec4 candidate = getRawShadowCoordAtUV(
        currentShadowCoord,
        targetUV,
        currentUV,
        valid
    );

    if (valid) {
        vec3 currentProjected =
            currentShadowCoord.xyz / max(currentShadowCoord.w, 1e-8);

        vec3 candidateProjected =
            candidate.xyz / max(candidate.w, 1e-8);

        bool candidateIsValid =
            candidate.w > 0.0 &&
            candidateProjected.x > -PROJECTED_SHADOW_COORD_MARGIN &&
            candidateProjected.x < 1.0 + PROJECTED_SHADOW_COORD_MARGIN &&
            candidateProjected.y > -PROJECTED_SHADOW_COORD_MARGIN &&
            candidateProjected.y < 1.0 + PROJECTED_SHADOW_COORD_MARGIN &&
            candidateProjected.z > -PROJECTED_SHADOW_COORD_MARGIN &&
            candidateProjected.z < 1.0 + PROJECTED_SHADOW_COORD_MARGIN;

        bool candidateIsClose =
            distance(candidateProjected.xy, currentProjected.xy) <
                PROJECTED_SHADOW_MAX_XY_JUMP &&
            abs(candidateProjected.z - currentProjected.z) <
                PROJECTED_SHADOW_MAX_Z_JUMP;

        if (candidateIsValid && candidateIsClose) {
            return candidate;
        }
    }

    // Fallback seguro: sombra normal.
    return currentShadowCoord;
}

vec4 getPointShadowCoordAtUV(
    vec4 currentShadowCoord,
    vec2 targetUV,
    vec2 currentUV
) {
    bool valid;

    vec4 candidate = getRawShadowCoordAtUV(
        currentShadowCoord,
        targetUV,
        currentUV,
        valid
    );

    if (valid) {
        float currentLength = length(currentShadowCoord.xyz);
        float candidateLength = length(candidate.xyz);

        float allowedJump = max(
            POINT_SHADOW_MAX_ABSOLUTE_JUMP,
            currentLength * POINT_SHADOW_MAX_RELATIVE_JUMP
        );

        bool candidateIsReasonable =
            candidateLength > POINT_SHADOW_MIN_LENGTH &&
            abs(candidateLength - currentLength) < allowedJump;

        if (candidateIsReasonable) {
            return candidate;
        }
    }

    // Fallback seguro: sombra normal.
    return currentShadowCoord;
}

float getPixelatedShadowAtUV(vec2 targetUV, vec2 currentUV) {
    float shadow = 1.0;

    #ifdef USE_SHADOWMAP

    vec4 shadowCoord;

    // DirectionalLight shadows
    #if NUM_DIR_LIGHT_SHADOWS > 0

        DirectionalLightShadow directionalLight;

        #pragma unroll_loop_start
        for (int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i++) {
            directionalLight = directionalLightShadows[i];

            shadowCoord = getProjectedShadowCoordAtUV(
                vDirectionalShadowCoord[i],
                targetUV,
                currentUV
            );

            shadow *= receiveShadow ? getShadow(
                directionalShadowMap[i],
                directionalLight.shadowMapSize,
                directionalLight.shadowBias,
                directionalLight.shadowRadius,
                shadowCoord
            ) : 1.0;
        }
        #pragma unroll_loop_end

    #endif

    // SpotLight shadows
    #if NUM_SPOT_LIGHT_SHADOWS > 0

        SpotLightShadow spotLight;

        #pragma unroll_loop_start
        for (int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i++) {
            spotLight = spotLightShadows[i];

            shadowCoord = getProjectedShadowCoordAtUV(
                vSpotShadowCoord[i],
                targetUV,
                currentUV
            );

            shadow *= receiveShadow ? getShadow(
                spotShadowMap[i],
                spotLight.shadowMapSize,
                spotLight.shadowBias,
                spotLight.shadowRadius,
                shadowCoord
            ) : 1.0;
        }
        #pragma unroll_loop_end

    #endif

    // PointLight shadows
    #if NUM_POINT_LIGHT_SHADOWS > 0

        PointLightShadow pointLight;

        #pragma unroll_loop_start
        for (int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i++) {
            pointLight = pointLightShadows[i];

            shadowCoord = getPointShadowCoordAtUV(
                vPointShadowCoord[i],
                targetUV,
                currentUV
            );

            shadow *= receiveShadow ? getPointShadow(
                pointShadowMap[i],
                pointLight.shadowMapSize,
                pointLight.shadowBias,
                pointLight.shadowRadius,
                shadowCoord,
                pointLight.shadowCameraNear,
                pointLight.shadowCameraFar
            ) : 1.0;
        }
        #pragma unroll_loop_end

    #endif

    #endif

    return shadow;
}

void main() {
    vec4 color = texture2D(map, vUv);

    /*
        Importante:
        Calculamos la sombra antes del discard porque getPixelatedShadowAtUV()
        usa dFdx/dFdy. Las derivadas son más estables antes de descartar fragmentos.
    */

    vec2 shadowCurrentUV = vuv_fit_fixed;
    vec2 shadowTargetUV = getPixelCenterUV(shadowCurrentUV, vfaceSize);

    float shadow = getPixelatedShadowAtUV(shadowTargetUV, shadowCurrentUV);

    if (color.a < 0.01) discard;

    float lightEffect = light * mix(AMBIENT_INTENSITY, 1.0, shadow);

    if (!EMISSIVE) {
        gl_FragColor = vec4(lift + color.rgb * lightEffect, color.a);
        gl_FragColor.rgb *= LIGHTCOLOR;
    } else {
        vec3 light_mix =
            (lightEffect * LIGHTCOLOR) +
            (1.0 - lightEffect * LIGHTCOLOR) * (1.0 - color.a);

        gl_FragColor = vec4(lift + color.rgb * light_mix, 1.0);
    }

    if (lift > 0.2) {
        gl_FragColor.rg *= vec2(0.6, 0.7);
    }
}`,
                uniforms: {
                    "LIGHTCOLOR": { type: "vec3", value: new THREE.Vector3(1, 1, 1) },
                    "SHADE": { type: "bool", value: true },
                    "LIGHTSIDE": { type: "int", value: 0 },
                    "EMISSIVE": { type: "bool", value: false },
                    "AMBIENT_INTENSITY": { type: "float", value: 0.4 }
                    // Se han eliminado los uniforms de SHADOW_SNAP, SHADOW_SMOOTH y RESOLUTION_FACTOR
                },
                enableShadows: true
            });


            let realview_pbr = new FancyShaderMaterial({
                id: 'realview_pbr',
                name: tl('shader_architect.preset.realview_pbr'),
                icon: 'hdr_on_select',
                isCustom: false,
                vertex: `
                                #include <common>
                                #include <shadowmap_pars_vertex> 

                                attribute float highlight; 
                                uniform bool SHADE; 
                                uniform int LIGHTSIDE;
                                
                                varying vec2 vUv; 
                                varying float lift; 
                                varying vec3 vWorldPos; 
                                varying vec3 vWorldNormal;
                                
                                void main() {
                                    
                                    // Corrección de normales
                                    vec3 transformedNormal = normalize(normalMatrix * normal);
                                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                                    

                                    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                                    // Corrección matemática para matrices de rotación y escala
                                    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                                    
                                    if (SHADE) {
                                        if (LIGHTSIDE == 1) { float t = vWorldNormal.y; vWorldNormal.y = -vWorldNormal.z; vWorldNormal.z = t; }
                                        else if (LIGHTSIDE == 2) { float t = vWorldNormal.y; vWorldNormal.y = vWorldNormal.x; vWorldNormal.x = t; }
                                        else if (LIGHTSIDE == 3) { vWorldNormal.y = -vWorldNormal.y; }
                                        else if (LIGHTSIDE == 4) { float t = vWorldNormal.y; vWorldNormal.y = vWorldNormal.z; vWorldNormal.z = t; }
                                        else if (LIGHTSIDE == 5) { float t = vWorldNormal.y; vWorldNormal.y = -vWorldNormal.x; vWorldNormal.x = t; }
                                    }
                                    
                                    vUv = uv; 
                                    lift = (highlight == 2.0) ? 0.22 : (highlight == 1.0) ? 0.1 : 0.0;
                                    
                                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

                                    #include <shadowmap_vertex>
                                }
                            `,
                fragment: `
                                #include <common>
                                #include <packing>
                                #include <lights_pars_begin>
                                #include <shadowmap_pars_fragment>
                                #include <shadowmask_pars_fragment>

                                uniform sampler2D map; 
                                uniform vec3 LIGHTCOLOR;
                                
                                uniform vec3 uLightPos[16]; 
                                uniform vec3 uLightDir[16]; 
                                uniform float uLightIntensity[16];
                                uniform float uLightDistance[16]; 
                                uniform float uLightConeAngle[16]; 
                                uniform float uLightPenumbra[16];
                                uniform int uLightType[16]; 
                                uniform vec3 uLightColor[16]; 
                                uniform int max_light_number;
                                uniform float uAmbient; 
                                uniform vec3 uAmbientColor;
                                
                                varying vec2 vUv; 
                                varying float lift; 
                                varying vec3 vWorldPos; 
                                varying vec3 vWorldNormal;
                                
                                void main() {
                                    vec4 color = texture2D(map, vUv);
                                    if(color.a < 0.01) discard;
                                    
                                    vec3 normal = normalize(vWorldNormal);
                                    vec3 sumLight = vec3(0.0);
                                    
                                    for(int i = 0; i < 16; i++) {
                                        if(i >= max_light_number) break;
                                        if(uLightIntensity[i] <= 0.0) continue;
                                        
                                        vec3 lightDir; 
                                        float attenuation = 1.0; 
                                        int type = uLightType[i];
                                        
                                        if (type == 1) { 
                                            lightDir = normalize(-uLightDir[i]); 
                                        } else {
                                            vec3 lightVec = uLightPos[i] - vWorldPos; 
                                            float dist = length(lightVec);
                                            lightDir = lightVec / dist;
                                            float maxDist = uLightDistance[i];
                                            
                                            if (maxDist > 0.0) {
                                                if (dist > maxDist) continue;
                                                float falloff = clamp(1.0 - pow(dist / maxDist, 4.0), 0.0, 1.0);
                                                attenuation = (falloff * falloff) / (dist * dist + 1.0);
                                            } else { 
                                                attenuation = 1.0 / (1.0 + 0.04 * dist + 0.002 * (dist * dist)); 
                                            }
                                            
                                            if (type == 2) {
                                                float theta = dot(-lightDir, normalize(uLightDir[i]));
                                                float outerCutoff = cos(uLightConeAngle[i]);
                                                float innerCutoff = cos(uLightConeAngle[i] * (1.0 - clamp(uLightPenumbra[i], 0.0, 1.0)));
                                                float epsilon = innerCutoff - outerCutoff;
                                                attenuation *= (epsilon <= 0.0001) ? step(outerCutoff, theta) : clamp((theta - outerCutoff) / epsilon, 0.0, 1.0);
                                            }
                                        }
                                        sumLight += uLightColor[i] * (max(dot(normal, lightDir), 0.0) * uLightIntensity[i] * attenuation);
                                    }
                                    
                                    // 1. Obtenemos la máscara de sombra pura (0.0 = sombra, 1.0 = luz)
                                    float shadow = getShadowMask();
                                    
                                    // 2. La luz ambiente afecta a TODA la geometría por igual
                                    vec3 ambientLight = uAmbientColor * uAmbient;
                                    
                                    // 3. La luz directa (sumLight) SÍ es bloqueada por la sombra
                                    vec3 directLight = sumLight * shadow;
                                    
                                    // 4. Sumamos ambas contribuciones. 
                                    // A mayor intensidad de luz directa, mayor contraste con la zona de sombra.
                                    vec3 finalLight = clamp(ambientLight + directLight, 0.0, 1.0);
                                    
                                    gl_FragColor = vec4(lift + color.rgb * finalLight, color.a);
                                    gl_FragColor.rgb *= LIGHTCOLOR;
                                    
                                    if(lift > 0.2) { gl_FragColor.rg *= vec2(0.6, 0.7); }
                                }
                            `,
                uniforms: {
                    "uLightPos": { type: "vec3v", value: Array.from({ length: 16 }, () => new THREE.Vector3()) },
                    "uLightDir": { type: "vec3v", value: Array.from({ length: 16 }, () => new THREE.Vector3(0, -1, 0)) },
                    "uLightIntensity": { type: "floatv", value: Array(16).fill(0.0) },
                    "uLightDistance": { type: "floatv", value: Array(16).fill(0.0) },
                    "uLightConeAngle": { type: "floatv", value: Array(16).fill(0.0) },
                    "uLightPenumbra": { type: "floatv", value: Array(16).fill(0.0) },
                    "uLightType": { type: "intv", value: Array(16).fill(0) },
                    "uLightColor": { type: "vec3v", value: Array.from({ length: 16 }, () => new THREE.Vector3()) },
                    "max_light_number": { type: "int", value: 0 },
                    "uAmbient": { type: "float", value: 0.3 }, // Puedes ajustar esto para subir/bajar la oscuridad de la sombra
                    "uAmbientColor": { type: "vec3", value: new THREE.Vector3(1, 1, 1) },
                    "LIGHTCOLOR": { type: "vec3", value: new THREE.Vector3(1, 1, 1) },
                    "TEXTURE_SIZE": { type: "vec2", value: new THREE.Vector2(16, 16) }
                },
                enableShadows: true
            });

            this.materials['classic'] = classic;
            this.materials['lightflow'] = lightflow;
            this.materials['shaded_lightflow'] = shaded_lightflow;
            this.materials['pbr_metallic_roughness'] = pbr_metallic_roughness;
            //this.materials['pixelated_shaded_lightflow'] = pixelated_shaded_lightflow;
            //this.materials['uv_shadow'] = uv_shadow;
            // Se inyecta el nuevo PBR en el slot de lo que era el hologram. 
            // Esto asegura que las referencias en tu app sigan funcionando.
            //this.materials['realview_pbr'] = realview_pbr;
        }
    };

    // =========================================================================
    // 4. ANIMATION & SHADER ENGINE
    // =========================================================================
    const ShaderEngine = {
        globalRenderMode: 'classic',
        animationReq: null,
        clock: new THREE.Clock(),

        startAnimationLoop() {
            const self = this;
            function tick() {
                let time = self.clock.getElapsedTime();

                // Inject time to any material requesting it
                Cube.all.forEach(cube => {
                    self.forEachMeshMaterial(cube.mesh, (mat) => {
                        if (mat.uniforms && mat.uniforms.uTime) {
                            mat.uniforms.uTime.value = time;
                            mat.uniformsNeedUpdate = true;
                        }
                    });
                });

                self.updateWorldNormalMatrices();
                self.animationReq = requestAnimationFrame(tick);
            }
            tick();
        },

        stopAnimationLoop() {
            if (this.animationReq) cancelAnimationFrame(this.animationReq);
        },

        hexToVec3(hex) {
            let color = new THREE.Color(hex);
            return new THREE.Vector3(color.r, color.g, color.b);
        },

        getMaterialList(material) {
            if (Array.isArray(material)) return material.filter(Boolean);
            return material ? [material] : [];
        },

        forEachMeshMaterial(mesh, callback) {
            this.getMaterialList(mesh?.material).forEach((mat, index) => {
                if (mat) callback(mat, index);
            });
        },

        // AÑADIDO: Método para inyectar los atributos custom a la geometría
        addUvAspectRatioAttribute(geometry, cube, smoothnessFactor = 0.5) {
            if (!geometry.isBufferGeometry) {
                if (window.DebugTools) DebugTools.logError("Geometry must be BufferGeometry.");
                return;
            }

            smoothnessFactor = Math.max(0, Math.min(1, smoothnessFactor));

            const fixedPrecalculatedFitUV = [0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0];

            geometry.setAttribute('uv_fit_fixed', new THREE.BufferAttribute(new Float32Array(fixedPrecalculatedFitUV), 2));
            geometry.attributes.uv_fit_fixed.needsUpdate = true;

            geometry.setAttribute('uv_shadow_map', new THREE.BufferAttribute(new Float32Array(fixedPrecalculatedFitUV), 2));
            geometry.attributes.uv_shadow_map.needsUpdate = true;

            const posAttr = geometry.getAttribute('position');
            const uvAttr = geometry.getAttribute('uv_fit_fixed');
            const index = geometry.getIndex();

            if (!posAttr || !uvAttr) {
                if (window.DebugTools) DebugTools.logError("Geometry must have position and uv_fit_fixed attributes for aspect ratio calculation.");
            }

            const vertexCount = posAttr.count;
            const faceCount = index ? index.count / 3 : vertexCount / 3;

            if (cube.affected_by_shadow == undefined) {
                const affected_by_shadow = new Float32Array(vertexCount);
                for (let i = 0; i < vertexCount; i++) {
                    affected_by_shadow[i] = 1.0;
                }
                cube.affected_by_shadow = affected_by_shadow;
            }

            geometry.setAttribute('affected_by_shadow', new THREE.BufferAttribute(cube.affected_by_shadow, 1));
            geometry.attributes.affected_by_shadow.needsUpdate = true;

            // --- CÁLCULO DE UV ASPECT RATIO ---
            if (posAttr && uvAttr) {
                const uvAspectRatios = new Float32Array(vertexCount);

                const posA = new THREE.Vector3();
                const posB = new THREE.Vector3();
                const posC = new THREE.Vector3();
                const uvA = new THREE.Vector2();
                const uvB = new THREE.Vector2();
                const uvC = new THREE.Vector2();

                for (let i = 0; i < faceCount; i++) {
                    let idxA, idxB, idxC;

                    if (index) {
                        idxA = index.getX(i * 3);
                        idxB = index.getX(i * 3 + 1);
                        idxC = index.getX(i * 3 + 2);
                    } else {
                        idxA = i * 3;
                        idxB = i * 3 + 1;
                        idxC = i * 3 + 2;
                    }

                    posA.fromBufferAttribute(posAttr, idxA);
                    posB.fromBufferAttribute(posAttr, idxB);
                    posC.fromBufferAttribute(posAttr, idxC);

                    uvA.fromBufferAttribute(uvAttr, idxA);
                    uvB.fromBufferAttribute(uvAttr, idxB);
                    uvC.fromBufferAttribute(uvAttr, idxC);

                    const deltaPos1 = new THREE.Vector3().subVectors(posB, posA);
                    const deltaPos2 = new THREE.Vector3().subVectors(posC, posA);
                    const deltaUv1 = new THREE.Vector2().subVectors(uvB, uvA);
                    const deltaUv2 = new THREE.Vector2().subVectors(uvC, uvA);

                    let aspectRatio = 1.0;
                    const r = deltaUv1.x * deltaUv2.y - deltaUv1.y * deltaUv2.x;

                    if (Math.abs(r) > 1e-6) {
                        const invR = 1.0 / r;
                        const tangent = new THREE.Vector3()
                            .copy(deltaPos1).multiplyScalar(deltaUv2.y)
                            .sub(new THREE.Vector3().copy(deltaPos2).multiplyScalar(deltaUv1.y))
                            .multiplyScalar(invR);
                        const bitangent = new THREE.Vector3()
                            .copy(deltaPos2).multiplyScalar(deltaUv1.x)
                            .sub(new THREE.Vector3().copy(deltaPos1).multiplyScalar(deltaUv2.x))
                            .multiplyScalar(invR);
                        const lenT = tangent.length();
                        const lenB = bitangent.length();
                        if (lenT > 1e-6) aspectRatio = lenB / lenT;
                    } else {
                        if (window.DebugTools) DebugTools.logWarn("Degenerate UV face detected for aspect ratio, using 1.0");
                    }

                    uvAspectRatios[idxA] = aspectRatio;
                    uvAspectRatios[idxB] = aspectRatio;
                    uvAspectRatios[idxC] = aspectRatio;
                }
                geometry.setAttribute('uvAspectRatio', new THREE.BufferAttribute(uvAspectRatios, 1));
                geometry.attributes.uvAspectRatio.needsUpdate = true;
            }

            // --- CÁLCULO DE FACE SIZE ---
            if (posAttr) {
                const faceSizes = new Float32Array(vertexCount * 2);
                const posA = new THREE.Vector3();
                const posB = new THREE.Vector3();
                const posC = new THREE.Vector3();

                for (let i = 0; i < faceCount; i++) {
                    let idxA, idxB, idxC;
                    if (index) {
                        idxA = index.getX(i * 3);
                        idxB = index.getX(i * 3 + 1);
                        idxC = index.getX(i * 3 + 2);
                    } else {
                        idxA = i * 3;
                        idxB = i * 3 + 1;
                        idxC = i * 3 + 2;
                    }

                    posA.fromBufferAttribute(posAttr, idxA);
                    posB.fromBufferAttribute(posAttr, idxB);
                    posC.fromBufferAttribute(posAttr, idxC);

                    const minX = Math.min(posA.x, posB.x, posC.x);
                    const maxX = Math.max(posA.x, posB.x, posC.x);
                    const minY = Math.min(posA.y, posB.y, posC.y);
                    const maxY = Math.max(posA.y, posB.y, posC.y);

                    let sizeX = maxX - minX;
                    let sizeY = maxY - minY;
                    if (Math.abs(sizeX) < 1e-6) {
                        const minZ = Math.min(posA.z, posB.z, posC.z);
                        const maxZ = Math.max(posA.z, posB.z, posC.z);
                        sizeX = maxZ - minZ;
                        if (Math.abs(sizeX) < 1e-6) sizeX = 1;
                    }
                    if (Math.abs(sizeY) < 1e-6) {
                        const minZ = Math.min(posA.z, posB.z, posC.z);
                        const maxZ = Math.max(posA.z, posB.z, posC.z);
                        sizeY = maxZ - minZ;
                        if (Math.abs(sizeY) < 1e-6) sizeY = 1;
                    }

                    faceSizes[idxA * 2] = sizeX; faceSizes[idxA * 2 + 1] = sizeY;
                    faceSizes[idxB * 2] = sizeX; faceSizes[idxB * 2 + 1] = sizeY;
                    faceSizes[idxC * 2] = sizeX; faceSizes[idxC * 2 + 1] = sizeY;
                }
                geometry.setAttribute('faceSize', new THREE.BufferAttribute(faceSizes, 2));
                geometry.attributes.faceSize.needsUpdate = true;

                const faces_ = ['east', 'west', 'up', 'down', 'south', 'north'];
                // --- CÁLCULO DE UV SIZE ---
                const uvAttrOriginal = geometry.getAttribute('uv');
                if (uvAttrOriginal) {
                    const uvSizeArray = new Float32Array(vertexCount * 2);

                    faces_.forEach((face, i) => {
                        var face_uv_size = [
                            Math.abs(cube.faces[face].uv[0] - cube.faces[face].uv[2]),
                            Math.abs(cube.faces[face].uv[1] - cube.faces[face].uv[3]),
                        ];
                        var face_size_x = faceSizes[i * 8 + 0];
                        var face_size_y = faceSizes[i * 8 + 1];
                        var arr = [
                            [face_uv_size[0] / face_size_x, face_uv_size[1] / face_size_y],
                            [face_uv_size[0] / face_size_x, face_uv_size[1] / face_size_y],
                            [face_uv_size[0] / face_size_x, face_uv_size[1] / face_size_y],
                            [face_uv_size[0] / face_size_x, face_uv_size[1] / face_size_y]
                        ];
                        uvSizeArray.set(arr[0], i * 8 + 0);
                        uvSizeArray.set(arr[1], i * 8 + 2);
                        uvSizeArray.set(arr[2], i * 8 + 4);
                        uvSizeArray.set(arr[3], i * 8 + 6);
                    });

                    geometry.setAttribute('uvSize', new THREE.BufferAttribute(uvSizeArray, 2));
                    geometry.attributes.uvSize.needsUpdate = true;
                }
            }

            // --- CÁLCULO DE SMOOTH NORMAL ---
            if (posAttr) {
                if (smoothnessFactor > 0 && !geometry.getAttribute('normal')) {
                    geometry.computeVertexNormals();
                }
                const vertexNormalAttr = geometry.getAttribute('normal');

                const smoothNormalsArray = new Float32Array(vertexCount * 3);
                const pA = new THREE.Vector3();
                const pB = new THREE.Vector3();
                const pC = new THREE.Vector3();
                const cb = new THREE.Vector3();
                const ab = new THREE.Vector3();

                const faceNormal = new THREE.Vector3();
                const tempVertexNormal = new THREE.Vector3();
                const interpolatedNormal = new THREE.Vector3();

                for (let i = 0; i < faceCount; i++) {
                    let iA, iB, iC;
                    if (index) {
                        iA = index.getX(i * 3);
                        iB = index.getX(i * 3 + 1);
                        iC = index.getX(i * 3 + 2);
                    } else {
                        iA = i * 3;
                        iB = i * 3 + 1;
                        iC = i * 3 + 2;
                    }

                    pA.fromBufferAttribute(posAttr, iA);
                    pB.fromBufferAttribute(posAttr, iB);
                    pC.fromBufferAttribute(posAttr, iC);

                    ab.subVectors(pA, pB);
                    cb.subVectors(pC, pB);
                    faceNormal.crossVectors(cb, ab).normalize();

                    const vertexIndices = [iA, iB, iC];
                    for (const vertIdx of vertexIndices) {
                        if (smoothnessFactor === 0) {
                            interpolatedNormal.copy(faceNormal);
                        } else if (smoothnessFactor === 1) {
                            if (vertexNormalAttr) {
                                tempVertexNormal.fromBufferAttribute(vertexNormalAttr, vertIdx);
                                interpolatedNormal.copy(tempVertexNormal);
                            } else {
                                interpolatedNormal.copy(faceNormal);
                            }
                        } else {
                            if (vertexNormalAttr) {
                                tempVertexNormal.fromBufferAttribute(vertexNormalAttr, vertIdx);
                                interpolatedNormal.copy(faceNormal).multiplyScalar(1.0 - smoothnessFactor)
                                    .addScaledVector(tempVertexNormal, smoothnessFactor)
                                    .normalize();
                            } else {
                                interpolatedNormal.copy(faceNormal);
                            }
                        }

                        smoothNormalsArray[vertIdx * 3] = interpolatedNormal.x;
                        smoothNormalsArray[vertIdx * 3 + 1] = interpolatedNormal.y;
                        smoothNormalsArray[vertIdx * 3 + 2] = interpolatedNormal.z;
                    }
                }

                geometry.setAttribute('smooth_normal', new THREE.BufferAttribute(smoothNormalsArray, 3));
                geometry.attributes.smooth_normal.needsUpdate = true;
            }

            return geometry;
        },

        /**
         * @param {Cube} cube
         * @param {FancyShaderMaterial} shader
         */
        applyToMesh(cube, shader) {
            const mesh = cube.mesh;
            if (!mesh || !mesh.material || !mesh.geometry || !shader) return;

            const wasMaterialArray = Array.isArray(mesh.material);
            const sourceSlots = wasMaterialArray ? mesh.material.slice() : [mesh.material];
            const fallbackSourceMaterial = sourceSlots.find(Boolean);

            if (!fallbackSourceMaterial) return;

            const cloneUniformValue = (value) => {
                if (value && typeof value.clone === 'function') return value.clone();
                if (Array.isArray(value)) return value.map(v => cloneUniformValue(v));
                return value;
            };

            const getMaterialListLocal = (material) => {
                if (Array.isArray(material)) return material.filter(Boolean);
                return material ? [material] : [];
            };

            const getTextureFromMaterial = (material) => {
                if (!material) return null;
                if (material.uniforms && material.uniforms.map && material.uniforms.map.value) {
                    return material.uniforms.map.value;
                }
                if (material.map) return material.map;
                return null;
            };

            const getTextureFromMaterialList = (material) => {
                const list = getMaterialListLocal(material);
                for (const mat of list) {
                    const tex = getTextureFromMaterial(mat);
                    if (tex) return tex;
                }
                return null;
            };

            const getTextureFromBlockbenchCube = (cube) => {
                if (!cube || !cube.faces || typeof Texture === 'undefined' || !Texture.all) return null;

                const faceOrder = ['north', 'south', 'east', 'west', 'up', 'down'];

                for (const faceName of faceOrder) {
                    const face = cube.faces[faceName];
                    if (!face || !face.texture) continue;

                    const textureRef = face.texture;
                    let bbTexture = null;

                    if (typeof textureRef === 'object') {
                        bbTexture = textureRef;
                    } else {
                        bbTexture = Texture.all.find(t =>
                            t && (
                                t.uuid === textureRef ||
                                t.id === textureRef ||
                                t.name === textureRef ||
                                t.path === textureRef
                            )
                        );
                    }

                    if (!bbTexture) continue;

                    const directTextureCandidates = [
                        bbTexture.texture,
                        bbTexture.three_texture,
                        bbTexture.display_texture,
                        bbTexture.map
                    ];

                    for (const candidate of directTextureCandidates) {
                        if (candidate && candidate.isTexture) return candidate;
                    }

                    const materialCandidates = [];

                    if (bbTexture.material) materialCandidates.push(bbTexture.material);
                    if (bbTexture.mesh && bbTexture.mesh.material) materialCandidates.push(bbTexture.mesh.material);

                    if (typeof bbTexture.getMaterial === 'function') {
                        const mat = bbTexture.getMaterial();
                        if (mat) materialCandidates.push(mat);
                    }

                    for (const mat of materialCandidates) {
                        const tex = getTextureFromMaterialList(mat);
                        if (tex) return tex;
                    }

                    const sourceImage = bbTexture.img || bbTexture.image || bbTexture.canvas;
                    if (sourceImage) {
                        if (!bbTexture._shaderArchitectTexture) {
                            bbTexture._shaderArchitectTexture = new THREE.Texture(sourceImage);
                            bbTexture._shaderArchitectTexture.magFilter = THREE.NearestFilter;
                            bbTexture._shaderArchitectTexture.minFilter = THREE.NearestFilter;
                            bbTexture._shaderArchitectTexture.needsUpdate = true;
                        }
                        return bbTexture._shaderArchitectTexture;
                    }
                }

                return null;
            };

            const getFallbackTexture = () => {
                if (!this._fallbackMap) {
                    const data = new Uint8Array([255, 255, 255, 255]);
                    this._fallbackMap = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
                    this._fallbackMap.magFilter = THREE.NearestFilter;
                    this._fallbackMap.minFilter = THREE.NearestFilter;
                    this._fallbackMap.needsUpdate = true;
                }
                return this._fallbackMap;
            };

            const setupAlphaShadowMaterials = (mesh, texture, sourceMaterial, shader) => {
                if (!shader.enableShadows || !texture) {
                    mesh.customDepthMaterial = null;
                    mesh.customDistanceMaterial = null;
                    return;
                }

                const alphaTest =
                    sourceMaterial.alphaTest !== undefined
                        ? Math.max(sourceMaterial.alphaTest, 0.01)
                        : 0.01;

                const side =
                    sourceMaterial.shadowSide !== undefined
                        ? sourceMaterial.shadowSide
                        : (sourceMaterial.side !== undefined ? sourceMaterial.side : THREE.FrontSide);

                texture.needsUpdate = true;

                mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
                    depthPacking: THREE.RGBADepthPacking,
                    map: texture,
                    alphaTest,
                    side
                });

                mesh.customDepthMaterial.name = 'SA_AlphaDepthMaterial';
                mesh.customDepthMaterial.needsUpdate = true;

                mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial({
                    map: texture,
                    alphaTest,
                    side
                });

                mesh.customDistanceMaterial.name = 'SA_AlphaDistanceMaterial';
                mesh.customDistanceMaterial.needsUpdate = true;
            };

            const applyShaderUniformsToMaterial = (targetMaterial, sourceMaterial, resolvedMap) => {
                targetMaterial.vertexShader = shader.vertex;
                targetMaterial.fragmentShader = shader.fragment;
                targetMaterial.lights = !!shader.enableShadows;

                targetMaterial.extensions = targetMaterial.extensions || {};
                targetMaterial.extensions.derivatives = true;

                targetMaterial.uniforms = targetMaterial.uniforms || {};

                if (shader.enableShadows && !targetMaterial.uniforms.directionalLights) {
                    targetMaterial.uniforms = THREE.UniformsUtils.merge([
                        THREE.UniformsLib['lights'],
                        targetMaterial.uniforms
                    ]);
                }

                for (const key in shader.uniforms) {
                    const def = shader.uniforms[key];
                    let val = def.value;

                    if (def.type === 'color' && def.hexValue) {
                        val = this.hexToVec3(def.hexValue);
                    }

                    val = cloneUniformValue(val);

                    if (!targetMaterial.uniforms[key]) {
                        targetMaterial.uniforms[key] = {
                            type: def.type === 'color' ? 'vec3' : def.type,
                            value: val
                        };
                    } else {
                        targetMaterial.uniforms[key].value = val;
                    }
                }

                targetMaterial.uniforms.map = targetMaterial.uniforms.map || { value: resolvedMap };
                targetMaterial.uniforms.map.value = resolvedMap;
                targetMaterial.map = resolvedMap;

                if (!targetMaterial.uniforms.uWorldNormalMatrix) {
                    targetMaterial.uniforms.uWorldNormalMatrix = {
                        value: new THREE.Matrix3()
                    };
                }

                targetMaterial.transparent =
                    sourceMaterial.transparent !== undefined ? sourceMaterial.transparent : true;

                targetMaterial.alphaTest =
                    sourceMaterial.alphaTest !== undefined ? sourceMaterial.alphaTest : 0.01;

                targetMaterial.side =
                    sourceMaterial.side !== undefined ? sourceMaterial.side : THREE.FrontSide;

                targetMaterial.depthTest =
                    sourceMaterial.depthTest !== undefined ? sourceMaterial.depthTest : true;

                targetMaterial.depthWrite =
                    sourceMaterial.depthWrite !== undefined ? sourceMaterial.depthWrite : true;

                targetMaterial.blending =
                    sourceMaterial.blending !== undefined ? sourceMaterial.blending : THREE.NormalBlending;

                targetMaterial.needsUpdate = true;
                targetMaterial.uniformsNeedUpdate = true;
            };

            cube.shader_type = shader.name || shader.id;

            this.addUvAspectRatioAttribute(
                mesh.geometry,
                cube,
                window.smoothnessFactor ?? 0.5
            );

            mesh.castShadow = !!shader.enableShadows;
            mesh.receiveShadow = !!shader.enableShadows;

            const newMaterialSlots = sourceSlots.map((slotMaterial, materialIndex) => {
                const sourceMaterial = slotMaterial || fallbackSourceMaterial;

                const resolvedMap =
                    getTextureFromMaterial(sourceMaterial) ||
                    getTextureFromBlockbenchCube(cube) ||
                    getFallbackTexture();

                if (resolvedMap) {
                    if (resolvedMap.magFilter !== undefined) resolvedMap.magFilter = THREE.NearestFilter;
                    if (resolvedMap.minFilter !== undefined) resolvedMap.minFilter = THREE.NearestFilter;
                    resolvedMap.needsUpdate = true;
                }

                let targetMaterial = sourceMaterial;

                if (!sourceMaterial.is_sa_cloned) {
                    const existingUniforms = sourceMaterial.uniforms
                        ? THREE.UniformsUtils.clone(sourceMaterial.uniforms)
                        : {};

                    const baseUniforms = shader.enableShadows
                        ? THREE.UniformsUtils.merge([THREE.UniformsLib['lights'], existingUniforms])
                        : THREE.UniformsUtils.clone(existingUniforms);

                    baseUniforms.map = { value: resolvedMap };

                    targetMaterial = new THREE.ShaderMaterial({
                        uniforms: baseUniforms,
                        vertexShader: shader.vertex,
                        fragmentShader: shader.fragment,
                        lights: !!shader.enableShadows,
                        transparent: sourceMaterial.transparent !== undefined ? sourceMaterial.transparent : true,
                        alphaTest: sourceMaterial.alphaTest !== undefined ? sourceMaterial.alphaTest : 0.01,
                        side: sourceMaterial.side !== undefined ? sourceMaterial.side : THREE.FrontSide,
                        depthTest: sourceMaterial.depthTest !== undefined ? sourceMaterial.depthTest : true,
                        depthWrite: sourceMaterial.depthWrite !== undefined ? sourceMaterial.depthWrite : true,
                        blending: sourceMaterial.blending !== undefined ? sourceMaterial.blending : THREE.NormalBlending,
                        extensions: {
                            derivatives: true
                        }
                    });

                    targetMaterial.is_sa_cloned = true;
                    targetMaterial.sa_shader_id = shader.id || shader.name || 'material';
                    targetMaterial.sa_material_index = materialIndex;
                    targetMaterial.name = `SA_${shader.id || shader.name || 'material'}_${materialIndex}`;
                }

                applyShaderUniformsToMaterial(targetMaterial, sourceMaterial, resolvedMap);

                return targetMaterial;
            });

            mesh.material = wasMaterialArray ? newMaterialSlots : newMaterialSlots[0];

            const firstSourceMaterial = sourceSlots.find(Boolean) || fallbackSourceMaterial;
            const firstTexture =
                getTextureFromMaterial(newMaterialSlots[0]) ||
                getTextureFromMaterial(firstSourceMaterial) ||
                getTextureFromBlockbenchCube(cube) ||
                getFallbackTexture();

            setupAlphaShadowMaterials(mesh, firstTexture, firstSourceMaterial, shader);
        },

        updateAllCubes() {
            Cube.all.forEach(cube => {
                if (cube.mesh) {
                    cube.mesh.castShadow = true;
                    cube.mesh.receiveShadow = true;
                    let targetId = cube.sa_material_id || this.globalRenderMode;
                    let shader = MaterialManager.materials[targetId];
                    if (!shader) shader = MaterialManager.materials['classic'];

                    // Pasamos el cubo entero para que `applyToMesh` tenga acceso a los atributos
                    this.applyToMesh(cube, shader);
                }
            });

            this.updateWorldNormalMatrices();
            this.updateLightUniforms();
        },

        updateWorldNormalMatrices() {
            Cube.all.forEach(cube => {
                const mesh = cube.mesh;
                if (!mesh) return;

                mesh.updateMatrixWorld(true);

                this.forEachMeshMaterial(mesh, (mat) => {
                    if (!mat.uniforms || !mat.uniforms.uWorldNormalMatrix) return;

                    mat.uniforms.uWorldNormalMatrix.value.getNormalMatrix(mesh.matrixWorld);
                    mat.uniformsNeedUpdate = true;
                });
            });
        },

        updateLightUniforms() {
            const lights = (window.LightElement && Array.isArray(window.LightElement.all))
                ? window.LightElement.all
                : [];

            const MAX_LIGHTS = 16;

            const posArray = [];
            const dirArray = [];
            const colArray = [];
            const intArray = [];
            const distanceArray = [];
            const coneAngleArray = [];
            const penumbraArray = [];
            const lightTypeArray = [];
            const castShadowArray = [];
            const shadowIndexArray = [];

            const threeLights = window.three_lights || {};
            const threeLightsGroup = window.three_lights_group || null;

            const getLightTypeIdFromElement = (element) => {
                if (element.light_type === 'directional') return 1;
                if (element.light_type === 'spot') return 2;
                return 0;
            };

            const getLightTypeIdFromThree = (threeLight) => {
                if (!threeLight) return 0;
                if (threeLight.isDirectionalLight) return 1;
                if (threeLight.isSpotLight) return 2;
                return 0;
            };

            const getLightColor = (element, threeLight) => {
                if (threeLight && threeLight.color) {
                    return new THREE.Vector3(
                        threeLight.color.r,
                        threeLight.color.g,
                        threeLight.color.b
                    );
                }

                const color = element.render_color || element.color || [255, 255, 255];

                return new THREE.Vector3(
                    Math.max(0, Math.min(1, Number(color[0] ?? 255) / 255)),
                    Math.max(0, Math.min(1, Number(color[1] ?? 255) / 255)),
                    Math.max(0, Math.min(1, Number(color[2] ?? 255) / 255))
                );
            };

            const getThreeLightForElement = (element) => {
                if (!element || !element.uuid) return null;
                const threeLight = threeLights[element.uuid];
                return threeLight && threeLight.isLight ? threeLight : null;
            };

            const getWorldDirectionFromThreeLight = (threeLight, fallbackMesh) => {
                const direction = new THREE.Vector3(0, 0, -1);

                if (threeLight && threeLight.target) {
                    const lightPos = new THREE.Vector3();
                    const targetPos = new THREE.Vector3();

                    threeLight.updateMatrixWorld(true);
                    threeLight.target.updateMatrixWorld(true);

                    threeLight.getWorldPosition(lightPos);
                    threeLight.target.getWorldPosition(targetPos);

                    direction.copy(targetPos).sub(lightPos);

                    if (direction.lengthSq() > 1e-8) {
                        return direction.normalize();
                    }
                }

                if (fallbackMesh) {
                    const quat = new THREE.Quaternion();
                    fallbackMesh.updateMatrixWorld(true);
                    fallbackMesh.getWorldQuaternion(quat);
                    direction.applyQuaternion(quat);

                    if (direction.lengthSq() > 1e-8) {
                        return direction.normalize();
                    }
                }

                return new THREE.Vector3(0, -1, 0);
            };

            /*
                Mapa REAL de índices de shadow maps.
        
                Three.js no usa el índice de LightElement.all.
                Usa el orden de las luces THREE reales dentro de la escena/grupo.
            */
            const shadowIndexByThreeUuid = new Map();

            let directionalShadowIndex = 0;
            let spotShadowIndex = 0;
            let pointShadowIndex = 0;

            const registerShadowLight = (threeLight) => {
                if (!threeLight || !threeLight.isLight) return;
                if (threeLight.visible === false) return;
                if (threeLight.castShadow !== true) return;
                if (!threeLight.shadow) return;

                const typeId = getLightTypeIdFromThree(threeLight);

                if (typeId === 1) {
                    shadowIndexByThreeUuid.set(threeLight.uuid, directionalShadowIndex++);
                } else if (typeId === 2) {
                    shadowIndexByThreeUuid.set(threeLight.uuid, spotShadowIndex++);
                } else {
                    shadowIndexByThreeUuid.set(threeLight.uuid, pointShadowIndex++);
                }
            };

            if (threeLightsGroup && typeof threeLightsGroup.traverse === 'function') {
                threeLightsGroup.traverse((child) => {
                    registerShadowLight(child);
                });
            } else {
                Object.keys(threeLights).forEach((uuid) => {
                    registerShadowLight(threeLights[uuid]);
                });
            }

            let activeLightCount = 0;

            for (let i = 0; i < lights.length; i++) {
                if (activeLightCount >= MAX_LIGHTS) break;

                const element = lights[i];
                if (!element || element.visibility === false) continue;

                const threeLight = getThreeLightForElement(element);
                const typeId = getLightTypeIdFromElement(element);

                const worldPos = new THREE.Vector3();

                if (threeLight) {
                    threeLight.updateMatrixWorld(true);
                    threeLight.getWorldPosition(worldPos);
                } else if (element.mesh) {
                    element.mesh.updateMatrixWorld(true);
                    element.mesh.getWorldPosition(worldPos);
                }

                const worldDir = getWorldDirectionFromThreeLight(threeLight, element.mesh);

                const castsShadow =
                    !!threeLight &&
                    threeLight.visible !== false &&
                    threeLight.castShadow === true &&
                    !!threeLight.shadow &&
                    element.has_shadow !== false;

                const shadowIndex = castsShadow && shadowIndexByThreeUuid.has(threeLight.uuid)
                    ? shadowIndexByThreeUuid.get(threeLight.uuid)
                    : -1;

                posArray.push(worldPos);
                dirArray.push(worldDir);
                lightTypeArray.push(typeId);
                colArray.push(getLightColor(element, threeLight));

                intArray.push(
                    element.render_intensity !== undefined
                        ? Math.max(0, Number(element.render_intensity) || 0)
                        : Math.max(0, Number(element.intensity) || 0)
                );

                distanceArray.push(
                    element.distance !== undefined
                        ? Math.max(0, Number(element.distance) || 0)
                        : 0.0
                );

                coneAngleArray.push(
                    THREE.MathUtils.degToRad(
                        Math.max(0.001, Math.min(89.9, Number(element.angle) || 45))
                    )
                );

                penumbraArray.push(
                    element.penumbra !== undefined
                        ? Math.max(0, Math.min(1, Number(element.penumbra) || 0))
                        : 0.0
                );

                castShadowArray.push(castsShadow ? 1 : 0);
                shadowIndexArray.push(shadowIndex);

                activeLightCount++;
            }

            for (let i = activeLightCount; i < MAX_LIGHTS; i++) {
                posArray.push(new THREE.Vector3(0, 0, 0));
                dirArray.push(new THREE.Vector3(0, -1, 0));
                colArray.push(new THREE.Vector3(0, 0, 0));
                intArray.push(0.0);
                distanceArray.push(0.0);
                coneAngleArray.push(0.0);
                penumbraArray.push(0.0);
                lightTypeArray.push(0);
                castShadowArray.push(0);
                shadowIndexArray.push(-1);
            }

            const ensureUniform = (mat, name, valueFactory) => {
                if (!mat.uniforms[name]) {
                    mat.uniforms[name] = {
                        value: valueFactory()
                    };
                }
                return mat.uniforms[name];
            };

            const processedMaterials = new Set();

            Cube.all.forEach(cube => {
                const mesh = cube.mesh;
                if (!mesh) return;

                this.forEachMeshMaterial(mesh, (mat) => {
                    if (!mat || !mat.uniforms) return;

                    const materialKey = mat.uuid || mat.id || mat;
                    if (processedMaterials.has(materialKey)) return;

                    processedMaterials.add(materialKey);

                    if (mat.uniforms.map && mat.uniforms.map.value && mat.uniforms.map.value.image) {
                        if (mat.uniforms.TEXTURE_SIZE) {
                            mat.uniforms.TEXTURE_SIZE.value.set(
                                mat.uniforms.map.value.image.width,
                                mat.uniforms.map.value.image.height
                            );
                        }
                    }

                    if (mat.uniforms.uWorldNormalMatrix) {
                        mesh.updateMatrixWorld(true);
                        mat.uniforms.uWorldNormalMatrix.value.getNormalMatrix(mesh.matrixWorld);
                    }

                    if (!mat.uniforms.max_light_number || !mat.uniforms.uLightPos) return;

                    ensureUniform(mat, "uLightCastShadow", () => Array(16).fill(0));
                    ensureUniform(mat, "uLightShadowIndex", () => Array(16).fill(-1));

                    mat.uniforms.max_light_number.value = activeLightCount;

                    for (let i = 0; i < MAX_LIGHTS; i++) {
                        mat.uniforms.uLightPos.value[i].copy(posArray[i]);
                        mat.uniforms.uLightDir.value[i].copy(dirArray[i]);
                        mat.uniforms.uLightColor.value[i].copy(colArray[i]);

                        mat.uniforms.uLightIntensity.value[i] = intArray[i];
                        mat.uniforms.uLightDistance.value[i] = distanceArray[i];
                        mat.uniforms.uLightConeAngle.value[i] = coneAngleArray[i];
                        mat.uniforms.uLightType.value[i] = lightTypeArray[i];

                        if (mat.uniforms.uLightPenumbra) {
                            mat.uniforms.uLightPenumbra.value[i] = penumbraArray[i];
                        }

                        mat.uniforms.uLightCastShadow.value[i] = castShadowArray[i];
                        mat.uniforms.uLightShadowIndex.value[i] = shadowIndexArray[i];
                    }

                    mat.uniformsNeedUpdate = true;
                });
            });
        }
    };

    // Tie externals
    window.updateLights = () => ShaderEngine.updateLightUniforms();
    window.UpdateShaderArchitectLights = window.updateLights;
    window.on_light_element_updated = () => ShaderEngine.updateLightUniforms();

    let transformEvent = Blockbench.on('update_transform', () => {
        ShaderEngine.updateLightUniforms();
    });


    // =========================================================================
    // 5. MATERIAL STUDIO INTERFACE (Dialog & Vue Vue)
    // =========================================================================

    let MaterialStudioDialog;

    function initMaterialStudio() {
        MaterialStudioDialog = new Dialog({
            title: tl('shader_architect.dialog.studio_title'),
            id: 'sa_material_studio_dialog',
            resizable: true,
            width: Math.min(1400, window.innerWidth - 100) || 1200,
            height: Math.min(1000, window.innerHeight - 100) || 800,
            component: {
                data() {
                    return {
                        materials: {},
                        selectedId: null,
                        editingMode: 'vertex',
                        newUniformName: 'u_myVar',
                        newUniformType: 'float',
                        validationErrors: [],
                        validating: false
                    };
                },
                computed: {
                    activeMat() {
                        return this.materials[this.selectedId] || null;
                    },
                    currentShaderCode: {
                        get() {
                            if (!this.activeMat) return "";
                            return this.editingMode === 'vertex' ? this.activeMat.vertex : this.activeMat.fragment;
                        },
                        set(value) {
                            if (!this.activeMat) return;
                            if (this.editingMode === 'vertex') this.activeMat.vertex = value;
                            else this.activeMat.fragment = value;
                        }
                    }
                },
                methods: {
                    highlighter(code) {
                        if (typeof Prism !== 'undefined' && Prism.languages.glsl) {
                            return Prism.highlight(code, Prism.languages.glsl, 'glsl');
                        }
                        return code;
                    },
                    formatCode() {
                        this.currentShaderCode = formatGLSL(this.currentShaderCode);
                        Blockbench.showToastNotification({ text: 'GLSL Formatted', expire: 1500 });
                    },
                    selectMaterial(id) {
                        this.selectedId = id;
                        this.validationErrors = [];
                    },
                    createNewMaterial() {
                        let m = new FancyShaderMaterial({
                            name: "New Material",
                            vertex: MaterialManager.materials['classic'].vertex,
                            fragment: MaterialManager.materials['classic'].fragment,
                            uniforms: {}
                        });
                        this.$set(this.materials, m.id, m);
                        this.selectMaterial(m.id);
                    },
                    deleteActiveMaterial() {
                        if (this.activeMat && this.activeMat.isCustom && confirm("Delete material?")) {
                            MaterialManager.deleteMaterial(this.activeMat.id);
                            this.$delete(this.materials, this.activeMat.id);
                            this.selectedId = 'classic';
                            Blockbench.showToastNotification({ text: tl('shader_architect.toast.deleted'), expire: 1500 });
                        }
                    },
                    addUniform() {
                        if (!this.activeMat) return;
                        if (!this.activeMat.uniforms) this.$set(this.activeMat, 'uniforms', {});

                        let safeVar = this.newUniformName.replace(/[^a-zA-Z0-9_]/g, "");
                        if (!safeVar) return;

                        let def = { type: this.newUniformType, value: 0 };
                        if (this.newUniformType === 'color') def = { type: 'color', value: "#ffffff", hexValue: "#ffffff" };
                        else if (this.newUniformType === 'bool') def.value = false;
                        else if (this.newUniformType === 'float') def.value = 1.0;
                        else if (this.newUniformType === 'int') def.value = 1;
                        else if (this.newUniformType === 'vec2') def.value = new THREE.Vector2(0, 0);
                        else if (this.newUniformType === 'vec3') def.value = new THREE.Vector3(0, 0, 0);

                        this.$set(this.activeMat.uniforms, safeVar, def);
                    },
                    removeUniform(key) {
                        this.$delete(this.activeMat.uniforms, key);
                    },
                    exportActive() {
                        if (!this.activeMat || !this.activeMat.isCustom) return;
                        Blockbench.export({
                            type: 'Shader Architect Material',
                            extensions: ['samat'],
                            name: this.activeMat.name,
                            content: JSON.stringify(this.activeMat.toJSON(), null, 4)
                        });
                    },
                    importMaterial() {
                        Blockbench.import({
                            type: 'Shader Architect Material',
                            extensions: ['samat'],
                            multiple: true
                        }, files => {
                            files.forEach(f => {
                                try {
                                    let json = JSON.parse(f.content);
                                    let newMat = FancyShaderMaterial.fromJSON(json);
                                    newMat.id = guid(); // Prevent ID clashes
                                    newMat.isCustom = true;

                                    this.$set(this.materials, newMat.id, newMat);
                                    MaterialManager.register(newMat);
                                    this.selectMaterial(newMat.id);
                                    Blockbench.showToastNotification({ text: tl('shader_architect.toast.imported'), expire: 1500 });
                                } catch (e) {
                                    console.error(e);
                                    Blockbench.showQuickMessage("Failed to parse .samat file.");
                                }
                            });
                        });
                    },
                    applyLive() {
                        // Persist Vue model to backend
                        for (let id in this.materials) {
                            if (this.materials[id].isCustom) MaterialManager.register(this.materials[id]);
                        }
                        ShaderEngine.updateAllCubes();
                        Blockbench.showToastNotification({ text: tl('shader_architect.toast.applied'), expire: 1500 });
                    },
                    validateShader() {
                        this.validating = true;
                        this.validationErrors = [];
                        try {
                            const canvas = document.createElement('canvas');
                            const gl = canvas.getContext('webgl');
                            if (!gl) throw new Error("WebGL not supported for validation.");

                            let type = this.editingMode === 'vertex' ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER;
                            let shader = gl.createShader(type);
                            gl.shaderSource(shader, this.currentShaderCode);
                            gl.compileShader(shader);

                            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                                let log = gl.getShaderInfoLog(shader);
                                let lines = log.split('\\n').filter(l => l.trim());
                                this.validationErrors = lines.map(line => {
                                    let match = line.match(/ERROR:\\s*\\d+:(\\d+):\\s*(.*)/);
                                    return match ? { line: parseInt(match[1]), message: match[2] } : { line: null, message: line };
                                });
                            } else {
                                Blockbench.showToastNotification({ text: 'GLSL is valid!', expire: 2000 });
                            }
                            gl.deleteShader(shader);
                        } catch (e) {
                            this.validationErrors = [{ line: null, message: e.message }];
                        }
                        this.validating = false;
                    }
                },
                created() {
                    // Load materials into reactive state
                    for (let id in MaterialManager.materials) {
                        this.$set(this.materials, id, MaterialManager.materials[id]);
                    }
                    this.selectedId = 'classic';
                },
                components: {
                    'vue-prism-editor': window.VuePrismEditor || VuePrismEditor
                },
                template: `
                <div style="display: flex; height: 100%; gap: 12px;">
                    <!-- LEFT PANEL: Material List -->
                    <div style="width: 260px; display: flex; flex-direction: column; gap: 8px; border-right: 1px solid var(--color-border); padding-right: 12px; overflow-y: auto;">
                        <button @click="createNewMaterial()"><i class="material-icons">add</i> New Material</button>
                        <button @click="importMaterial()"><i class="material-icons">file_upload</i> Import .samat</button>
                        <hr style="border: 0; border-top: 1px solid var(--color-border); width: 100%;">
                        <div v-for="(m, mid) in materials" :key="mid" 
                             class="sa-materiel-list-item" :class="{selected: selectedId === mid}"
                             @click="selectMaterial(mid)">
                             <i class="material-icons">{{m.icon}}</i>
                             <div style="flex-grow:1; font-weight: bold; font-size:1.1em;">{{m.name}}</div>
                             <i v-if="!m.isCustom" class="material-icons" style="opacity:0.5; font-size:0.9em;" title="Read Only">lock</i>
                        </div>
                    </div>

                    <!-- RIGHT PANEL: Editor -->
                    <div v-if="activeMat" style="flex-grow: 1; display: flex; flex-direction: column; gap: 10px; overflow: hidden;">
                        
                        <!-- Metadata Header -->
                        <div style="display: flex; gap: 10px; align-items: center; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px;">
                            <input v-model="activeMat.name" type="text" :disabled="!activeMat.isCustom" style="font-size: 1.2em; font-weight: bold; flex-grow: 1;">
                            <i class="material-icons" style="font-size: 1.5em">{{activeMat.icon}}</i>
                            <input v-model="activeMat.icon" type="text" title="Icon String" :disabled="!activeMat.isCustom" style="width: 80px;">
                            <button @click="exportActive()" v-if="activeMat.isCustom" title="Export"><i class="material-icons">save_alt</i></button>
                            <button @click="deleteActiveMaterial()" v-if="activeMat.isCustom" style="color: #fc2f40;" title="Delete"><i class="material-icons">delete</i></button>
                        </div>

                        <!-- Editor Tabs -->
                        <div style="display: flex; gap: 5px;">
                            <button @click="editingMode = 'vertex'" :style="{background: editingMode==='vertex'?'var(--color-accent)':''}">Vertex Shader</button>
                            <button @click="editingMode = 'fragment'" :style="{background: editingMode==='fragment'?'var(--color-accent)':''}">Fragment Shader</button>
                            <button @click="editingMode = 'uniforms'" :style="{background: editingMode==='uniforms'?'var(--color-accent)':''}">Uniforms & Properties</button>
                        </div>

                        <!-- Code Editor Area -->
                        <div v-if="editingMode !== 'uniforms'" style="flex-grow: 1; border: 1px solid var(--color-border); position: relative; display: flex; flex-direction: column;">
                            <div style="flex-grow: 1; overflow-y: auto;">
                                <vue-prism-editor
                                    class="glsl-editor-instance" 
                                    v-model="currentShaderCode"
                                    :highlight="highlighter"
                                    language="glsl"
                                    :line-numbers="true"
                                    :readonly="!activeMat.isCustom"
                                    style="height: 100%; min-height: 300px;"
                                ></vue-prism-editor>
                            </div>
                            
                            <div v-if="validationErrors.length" style="color: #fc2f40; background: rgba(252,47,64,0.1); padding: 8px; border-top: 1px solid #fc2f40; max-height: 100px; overflow-y: auto;">
                                <b>GLSL Errors:</b><br/>
                                <span v-for="err in validationErrors" style="display:block"><span v-if="err.line">Line {{err.line}}: </span>{{err.message}}</span>
                            </div>

                            <div style="padding: 6px; background: var(--color-ui); display: flex; gap: 8px;">
                                <button @click="formatCode()"><i class="material-icons">format_align_left</i> Format</button>
                                <button @click="validateShader()"><i class="material-icons">check_circle</i> Validate & Compile</button>
                                <div style="flex-grow:1"></div>
                                <button @click="applyLive()" style="background: var(--color-accent);"><i class="material-icons">play_arrow</i> Apply Updates</button>
                            </div>
                        </div>

                        <!-- Uniforms Area -->
                        <div v-if="editingMode === 'uniforms'" style="flex-grow: 1; overflow-y: auto; padding-right: 8px;">
                            <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--color-border);">
                                <h3>Add Custom Uniform</h3>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <input v-model="newUniformName" type="text" placeholder="u_myProperty" :disabled="!activeMat.isCustom">
                                    <select v-model="newUniformType" :disabled="!activeMat.isCustom">
                                        <option value="float">float</option>
                                        <option value="int">int</option>
                                        <option value="bool">bool</option>
                                        <option value="vec2">vec2</option>
                                        <option value="vec3">vec3</option>
                                        <option value="color">color (vec3)</option>
                                    </select>
                                    <button @click="addUniform()" :disabled="!activeMat.isCustom"><i class="material-icons">add_box</i> Add</button>
                                </div>
                            </div>

                            <h3>Active Uniforms</h3>
                            <div v-if="!activeMat.uniforms || Object.keys(activeMat.uniforms).length === 0" style="opacity: 0.5;">No uniforms defined.</div>
                            
                            <div v-for="(uni, key) in activeMat.uniforms" :key="key" class="sa-uniform-row">
                                <label :title="key">{{key}} ({{uni.type}})</label>
                                
                                <!-- Editor varies by type -->
                                <input v-if="uni.type==='float'" type="number" step="0.1" v-model.number="uni.value" class="dark_bordered" style="width: 100px;">
                                <input v-if="uni.type==='int'" type="number" step="1" v-model.number="uni.value" class="dark_bordered" style="width: 100px;">
                                <input v-if="uni.type==='bool'" type="checkbox" v-model="uni.value">
                                <input v-if="uni.type==='color'" type="color" v-model="uni.hexValue">
                                
                                <div v-if="uni.type==='vec2'" style="display: flex; gap: 5px; align-items: center;">
                                    X <input type="number" step="0.1" v-model.number="uni.value.x" class="dark_bordered" style="width: 70px;">
                                    Y <input type="number" step="0.1" v-model.number="uni.value.y" class="dark_bordered" style="width: 70px;">
                                </div>

                                <div v-if="uni.type==='vec3'" style="display: flex; gap: 5px; align-items: center;">
                                    X <input type="number" step="0.1" v-model.number="uni.value.x" class="dark_bordered" style="width: 60px;">
                                    Y <input type="number" step="0.1" v-model.number="uni.value.y" class="dark_bordered" style="width: 60px;">
                                    Z <input type="number" step="0.1" v-model.number="uni.value.z" class="dark_bordered" style="width: 60px;">
                                </div>

                                <div v-if="uni.type==='vec2v' || uni.type==='vec3v' || uni.type==='floatv'" style="opacity:0.6; font-style:italic;">[Array Data: {{uni.value.length}} items]</div>
                                
                                <div style="flex-grow:1"></div>
                                <i v-if="activeMat.isCustom" class="material-icons" @click="removeUniform(key)" style="color: #fc2f40; cursor: pointer;" title="Remove Uniform">close</i>
                            </div>
                        </div>

                    </div>
                    <div v-else style="flex-grow: 1; display:flex; align-items:center; justify-content:center; opacity:0.5; font-size:1.5em;">
                        Select or create a material to edit.
                    </div>
                </div>
                `
            },
            onConfirm() {
                // Ensure everything saves cleanly on dialog exit
                for (let id in this.content_vue.materials) {
                    if (this.content_vue.materials[id].isCustom) {
                        MaterialManager.register(this.content_vue.materials[id]);
                    }
                }
                ShaderEngine.updateAllCubes();
            }
        });
    }

    // =========================================================================
    // 6. PLUGIN INITIALIZATION & MENUS
    // =========================================================================

    let deletables = [];
    let styleEl;

    Plugin.register('shader_architect', {
        title: 'Shader Architect V2',
        icon: 'gradient',
        author: 'Advanced Mode',
        description: 'Professional Render mode switcher, material overrides, and full GLSL workflow.',
        version: '2.0.0',
        variant: 'both',

        onload() {
            window.ShaderEngine = ShaderEngine;
            window.MaterialManager = MaterialManager;
            // Register Cube property for material persistence in .bbmodel
            let saMatProp = new Property(Cube, 'string', 'sa_material_id', { default: '', exposed: true });
            deletables.push(saMatProp);

            // Load Styles
            styleEl = document.createElement('style');
            styleEl.id = PLUGIN_STYLE_ID;
            styleEl.innerHTML = pluginStyle;
            document.head.appendChild(styleEl);

            // Init backend
            MaterialManager.init();
            initMaterialStudio();
            deletables.push(MaterialStudioDialog);

            // Start Animation loop for `uTime`
            ShaderEngine.startAnimationLoop();

            // Menu: Material Studio
            let openStudioAction = new Action('sa_open_studio', {
                name: tl('shader_architect.menu.material_studio'),
                description: 'Open the Material Architect Studio.',
                icon: 'brush',
                category: 'view',
                click() {
                    // Update external Vue with fresh data
                    MaterialStudioDialog.show();
                    if (MaterialStudioDialog.content_vue && MaterialStudioDialog.content_vue.materials) {
                        for (let id in MaterialManager.materials) {
                            MaterialStudioDialog.content_vue.$set(MaterialStudioDialog.content_vue.materials, id, MaterialManager.materials[id]);
                        }
                    }
                }
            });
            MenuBar.addAction(openStudioAction, 'view');
            deletables.push(openStudioAction);

            // Context Menu: Apply Material to specific Cube/Group
            let contextApply = new Action('sa_apply_override', {
                name: tl('shader_architect.menu.apply_material'),
                icon: 'format_paint',
                condition: () => Group.selected || Cube.selected.length,
                click() {
                    let mats = {};
                    for (let k in MaterialManager.materials) {
                        mats['sa_' + k] = MaterialManager.materials[k].name;
                    }
                    new Dialog({
                        id: 'sa_choose_material',
                        title: tl('shader_architect.menu.apply_material'),
                        form: {
                            target_mat: { label: 'Assign Material:', type: 'select', options: mats, value: 'sa_' + ShaderEngine.globalRenderMode }
                        },
                        onConfirm(formData) {
                            // 1. Recopilamos selección directa (evitando errores si es null)
                            const directCubes = Cube.selected || [];

                            // 2. Función auxiliar para extraer cubos de grupos (recursiva)
                            const getAllCubesFromGroups = (items) => {
                                if (!items || !items.length) return [];
                                return items.flatMap(item => {
                                    if (item instanceof Cube) return item;
                                    if (item instanceof Group && item.children) return getAllCubesFromGroups(item.children);
                                    return [];
                                });
                            };

                            // 3. Obtenemos cubos de los grupos seleccionados
                            const cubesFromGroups = Group.selected ? getAllCubesFromGroups(Group.selected) : [];

                            // 4. Unificamos sin duplicados usando un Set
                            const finalSelection = new Set([...directCubes, ...cubesFromGroups]);

                            // 5. Aplicamos el nuevo material a cada cubo
                            finalSelection.forEach(cube => {
                                cube.sa_material_id = formData.target_mat.replace('sa_', '');
                            });

                            // 6. Actualizamos y cerramos
                            ShaderEngine.updateAllCubes();
                            this.hide();
                        }
                    }).show();
                }
            });
            let contextClear = new Action('sa_clear_override', {
                name: tl('shader_architect.menu.clear_material'),
                icon: 'layers_clear',
                condition: () => Group.selected || Cube.selected.length,
                click() {
                    // 1. Recopilamos los cubos seleccionados directamente (asegurando que sea un array)
                    const directCubes = Cube.selected || [];

                    // 2. Definimos la lógica para extraer cubos de los grupos de forma recursiva
                    const getAllCubesFromGroups = (items) => {
                        if (!items || !items.length) return [];
                        return items.flatMap(item => {
                            if (item instanceof Cube) return item;
                            if (item instanceof Group && item.children) return getAllCubesFromGroups(item.children);
                            return [];
                        });
                    };

                    // 3. Extraemos los cubos de los grupos seleccionados
                    const cubesFromGroups = Group.selected ? getAllCubesFromGroups(Group.selected) : [];

                    // 4. Unificamos todo en un Set para eliminar duplicados y luego iteramos
                    const finalSelection = new Set([...directCubes, ...cubesFromGroups]);

                    finalSelection.forEach(cube => {
                        if (cube.sa_material_id !== undefined) {
                            delete cube.sa_material_id;
                        }
                    });

                    // 5. Refrescamos el motor
                    ShaderEngine.updateAllCubes();
                }
            });

            // Add to Context Menu
            if (Cube.prototype.menu) {
                Cube.prototype.menu.addAction(contextApply);
                Cube.prototype.menu.addAction(contextClear);
            }

            // UI: Global Render Mode Selector (In Preview window)
            let globalsMenuOptions = {};
            for (let id in MaterialManager.materials) {
                let m = MaterialManager.materials[id];
                globalsMenuOptions['sa_' + id] = { name: m.name, icon: m.icon };
            }

            let renderModeSelector = new BarSelect('sa_global_mode', {
                category: 'view',
                condition: () => Project,
                value: 'sa_' + ShaderEngine.globalRenderMode,
                icon_mode: true,
                options: globalsMenuOptions,
                onChange() {
                    ShaderEngine.globalRenderMode = this.value.replace('sa_', '');
                    ShaderEngine.updateAllCubes();
                }
            });

            // Keep select updated with newly created mats
            let pUpdate = setInterval(() => {
                let currentKeys = Object.keys(renderModeSelector.options).sort().join(',');
                let newKeys = Object.keys(MaterialManager.materials).map(k => 'sa_' + k).sort().join(',');
                if (currentKeys !== newKeys) {
                    let newDict = {};
                    for (let id in MaterialManager.materials) {
                        let m = MaterialManager.materials[id];
                        newDict['sa_' + id] = { name: m.name, icon: m.icon };
                    }
                    renderModeSelector.options = newDict;
                    renderModeSelector.update();
                }
            }, 1000);
            deletables.push({ delete: () => clearInterval(pUpdate) });

            let mainPreview = Preview.all.find(p => p.id === 'main');
            if (mainPreview && mainPreview.node.childNodes[1]) {
                mainPreview.node.childNodes[1].appendChild(renderModeSelector.getNode());
            }
            deletables.push({
                delete: () => {
                    if (mainPreview && mainPreview.node.childNodes[1]) {
                        mainPreview.node.childNodes[1].removeChild(renderModeSelector.getNode());
                    }
                    renderModeSelector.delete();
                }
            });

            // Project event hooks to auto-update
            let addCubeEvent = Blockbench.on('add_cube', (event) => {
                if (event.object && event.object.mesh) {
                    let id = event.object.sa_material_id || ShaderEngine.globalRenderMode;
                    ShaderEngine.applyToMesh(event.object, MaterialManager.materials[id] || MaterialManager.materials['classic']);
                    ShaderEngine.updateLightUniforms();
                }
            });
            deletables.push(addCubeEvent);

            let transformEvent = Blockbench.on('update_transform', () => {
                ShaderEngine.updateLightUniforms();
            });
            deletables.push(transformEvent);

            setTimeout(() => { ShaderEngine.updateAllCubes(); }, 300);
        },

        onunload() {
            ShaderEngine.stopAnimationLoop();

            if (styleEl && styleEl.parentElement) {
                styleEl.parentElement.removeChild(styleEl);
            }

            delete window.updateLights;
            delete window.UpdateShaderArchitectLights;
            delete window.on_light_element_updated;

            // Remove outliner actions if they exist
            if (Menu.menus.outliner_cube) {
                let idxA = Menu.menus.outliner_cube.structure.indexOf('sa_apply_override');
                if (idxA > -1) Menu.menus.outliner_cube.structure.splice(idxA, 1);
                let idxC = Menu.menus.outliner_cube.structure.indexOf('sa_clear_override');
                if (idxC > -1) Menu.menus.outliner_cube.structure.splice(idxC, 1);
            }

            deletables.forEach(item => {
                if (item && typeof item.delete === 'function') item.delete();
            });

            Cube.all.forEach(cube => {
                if (cube.mesh && cube.mesh.material) {
                    ShaderEngine.getMaterialList(cube.mesh.material).forEach(mat => {
                        mat.vertexShader = undefined;
                        mat.fragmentShader = undefined;
                        mat.needsUpdate = true;
                    });
                }
            });
        }
    });

})();
