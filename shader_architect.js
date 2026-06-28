/**
 * @name Shader Architect
 * @description A standalone Blockbench plugin dedicated to switching Render Modes,
 * assigning specific shaders to parts, and providing a full GLSL Shader Material Studio.
 * Features custom JSON format export (.samat), time animations, and per-cube control.
 */

(function () {

    function isSystemUniform(name) {
        if (!name) return false;
        const lower = name.toLowerCase();
        return ['max_light_number', 'map', 'lightside', 'shade', 'emissive', 'lightcolor', 'uambient', 'uambientcolor', 'utime', 'uworldnormalmatrix', 'texture_size'].includes(lower) ||
            lower.startsWith('usa_ssr') ||
            lower.startsWith('ulight') ||
            lower.startsWith('light_');
    }

    const getBlockbenchTextureForCube = (cube, faceName) => {
        if (!cube || !cube.faces || typeof Texture === 'undefined' || !Texture.all) return null;
        const faceOrder = faceName ? [faceName] : ['north', 'south', 'east', 'west', 'up', 'down'];
        for (const faceName of faceOrder) {
            const face = cube.faces[faceName];
            if (!face) continue;

            if (typeof face.getTexture === 'function') {
                const faceTexture = face.getTexture();
                if (faceTexture && faceTexture.uuid) return faceTexture;
            }

            if (!face.texture) continue;
            const textureRef = face.texture;
            if (typeof textureRef === 'object') return textureRef;
            const bbTexture = Texture.all.find(t =>
                t && (
                    t.uuid === textureRef ||
                    t.id === textureRef ||
                    t.name === textureRef ||
                    t.path === textureRef
                )
            );
            if (bbTexture) return bbTexture;
        }
        return null;
    };

    function getBlockbenchTextureSize(texture) {
        if (!texture) return null;

        const width = typeof texture.getUVWidth === 'function'
            ? texture.getUVWidth()
            : texture.uv_width || texture.width;

        const height = typeof texture.getUVHeight === 'function'
            ? texture.getUVHeight()
            : texture.uv_height || texture.display_height || texture.height;

        if (!Number.isFinite(Number(width)) || !Number.isFinite(Number(height))) {
            return null;
        }

        return new THREE.Vector2(
            Math.max(1, Number(width)),
            Math.max(1, Number(height))
        );
    }

    function resolveSystemUniformValue(key, cube, defaultValue, sourceContext) {
        const lower = key.toLowerCase();

        if (lower === 'shade') {
            if (typeof settings !== 'undefined' && settings.shading) {
                return settings.shading.value;
            }
            if (typeof Settings !== 'undefined' && Settings.get) {
                return Settings.get('shading');
            }
            return defaultValue;
        }

        if (lower === 'lightside') {
            if (typeof Canvas !== 'undefined' && Canvas.global_light_side !== undefined) {
                return Canvas.global_light_side;
            }
            return defaultValue;
        }

        if (lower === 'lightcolor') {
            if (typeof Canvas !== 'undefined' && Canvas.global_light_color && typeof settings !== 'undefined' && settings.brightness) {
                let c = new THREE.Color().copy(Canvas.global_light_color).multiplyScalar(settings.brightness.value / 50);
                return new THREE.Vector3(c.r, c.g, c.b);
            }
            return defaultValue;
        }

        if (lower === 'uambientcolor') {
            if (typeof Canvas !== 'undefined' && Canvas.global_light_color) {
                let c = new THREE.Color().copy(Canvas.global_light_color);
                return new THREE.Vector3(c.r, c.g, c.b);
            }
            return defaultValue;
        }

        if (lower === 'uambient') {
            if (typeof settings !== 'undefined' && settings.brightness) {
                return settings.brightness.value / 100;
            }
            return defaultValue;
        }

        if (lower === 'emissive') {
            const renderMode = sourceContext && (
                sourceContext.renderMode ||
                sourceContext.sa_source_render_mode
            );
            if (renderMode) return renderMode === 'emissive';

            const faceName = sourceContext && (
                sourceContext.faceName ||
                sourceContext.sa_source_face_name
            );
            const bbTex = getBlockbenchTextureForCube(cube, faceName);
            return (bbTex && bbTex.render_mode === 'emissive') ? true : false;
        }

        if (lower === 'texture_size') {
            let texture = sourceContext && sourceContext.blockbenchTexture;

            if (!texture && sourceContext && sourceContext.sa_source_texture_uuid && typeof Texture !== 'undefined' && Texture.all) {
                texture = Texture.all.find(t => t && t.uuid === sourceContext.sa_source_texture_uuid);
            }

            if (!texture) {
                const faceName = sourceContext && (
                    sourceContext.faceName ||
                    sourceContext.sa_source_face_name
                );
                texture = getBlockbenchTextureForCube(cube, faceName);
            }

            return getBlockbenchTextureSize(texture) || defaultValue;
        }

        return defaultValue;
    }

    function areUniformValuesEqual(val1, val2) {
        if (val1 === val2) return true;
        if (val1 && val2 && typeof val1 === 'object' && typeof val2 === 'object') {
            if (typeof val1.equals === 'function') return val1.equals(val2);
            if (typeof val2.equals === 'function') return val2.equals(val1);
        }
        return false;
    }

    function formatGLSL(rawString) {
        if (!rawString) return "";

        let comments = [];
        // Extract block comments
        let code = rawString.replace(/\/\*[\s\S]*?\*\//g, match => {
            comments.push(match);
            return `\n__BLOCK_COMMENT_${comments.length - 1}__\n`;
        });

        // Extract line comments
        code = code.replace(/\/\/.*/g, match => {
            comments.push(match);
            return `\n__LINE_COMMENT_${comments.length - 1}__\n`;
        });

        // Extract preprocessor directives
        let directives = [];
        const lines = code.split('\n');
        code = '';

        lines.forEach(line => {
            let trimmed = line.trim();
            if (trimmed.startsWith('#')) {
                directives.push(trimmed);
                code += `\n__DIRECTIVE_${directives.length - 1}__\n`;
            } else {
                code += line + '\n';
            }
        });

        // Carriage return cleanup
        code = code.replace(/\r/g, '');

        // Tokenize around braces and semicolons to build a clean stream
        let normalizedCode = "";
        let parenDepth = 0;
        let spacesCollapsed = code.replace(/[ \t]+/g, ' ');

        for (let i = 0; i < spacesCollapsed.length; i++) {
            let char = spacesCollapsed[i];

            if (char === '(') {
                parenDepth++;
                normalizedCode += char;
            } else if (char === ')') {
                parenDepth = Math.max(0, parenDepth - 1);
                normalizedCode += char;
            } else if (char === '{') {
                normalizedCode = normalizedCode.trimEnd();
                normalizedCode += ' {\n';
            } else if (char === '}') {
                normalizedCode = normalizedCode.trimEnd();
                normalizedCode += '\n}\n';
            } else if (char === ';') {
                normalizedCode += ';';
                if (parenDepth === 0) {
                    normalizedCode += '\n';
                }
            } else if (char === ' ') {
                if (!normalizedCode.endsWith('\n')) {
                    normalizedCode += char;
                }
            } else if (char === '\n') {
                if (!normalizedCode.endsWith('\n')) {
                    normalizedCode += '\n';
                }
            } else {
                normalizedCode += char;
            }
        }

        // Format line-by-line helper
        function formatLineContent(lineContent) {
            let s = lineContent.trim();
            if (s.length === 0) return "";

            // Space after control keywords
            s = s.replace(/\b(if|for|while|switch|return)\b\s*\(/g, '$1 (');
            // Space before opening brace
            s = s.replace(/\)\s*\{/g, ') {');
            // Space after commas
            s = s.replace(/,\s*/g, ', ');
            // Space after semicolons inside for-loop headers
            s = s.replace(/;\s*/g, '; ');

            // Normalize spaces around binary operators
            const operators = [
                { pattern: '\\+=', text: '+=' },
                { pattern: '-=', text: '-=' },
                { pattern: '\\*=', text: '*=' },
                { pattern: '/=', text: '/=' },
                { pattern: '==', text: '==' },
                { pattern: '!=', text: '!=' },
                { pattern: '<=', text: '<=' },
                { pattern: '>=', text: '>=' },
                { pattern: '&&', text: '&&' },
                { pattern: '\\|\\|', text: '||' },
                { pattern: '=', text: '=' }
            ];
            operators.forEach(op => {
                const regex = new RegExp('\\s*' + op.pattern + '\\s*', 'g');
                s = s.replace(regex, ` ${op.text} `);
            });

            // Adjust comparison operators that might get mangled by the single '=' rule
            s = s.replace(/\s*=\s*=\s*/g, ' == ');
            s = s.replace(/\s*!\s*=\s*/g, ' != ');
            s = s.replace(/\s*\+\s*=\s*/g, ' += ');
            s = s.replace(/\s*-\s*=\s*/g, ' -= ');
            s = s.replace(/\s*\*\s*=\s*/g, ' *= ');
            s = s.replace(/\s*\/\s*=\s*/g, ' /= ');
            s = s.replace(/\s*<\s*=\s*/g, ' <= ');
            s = s.replace(/\s*>\s*=\s*/g, ' >= ');
            s = s.replace(/\s*<\s*(?!=)\s*/g, ' < ');
            s = s.replace(/\s*>\s*(?!=)\s*/g, ' > ');

            // Normalize spaces around math operators (+, -, *, /)
            s = s.replace(/\s*([+\-*/])\s*/g, ' $1 ');
            s = s.replace(/(^|[=(,\[{]\s*)-\s+/g, '$1-');
            s = s.replace(/\s*\+\s*=\s*/g, ' += ');
            s = s.replace(/\s*-\s*=\s*/g, ' -= ');
            s = s.replace(/\s*\*\s*=\s*/g, ' *= ');
            s = s.replace(/\s*\/\s*=\s*/g, ' /= ');
            s = s.replace(/\s*<\s*=\s*/g, ' <= ');
            s = s.replace(/\s*>\s*=\s*/g, ' >= ');

            // Fix double-spacing that might have occurred
            s = s.replace(/\s+/g, ' ');

            // Restore clean increment/decrement
            s = s.replace(/\s*\+\s*\+\s*/g, '++');
            s = s.replace(/\s*-\s*-\s*/g, '--');

            return s.trim();
        }

        let linesToProcess = normalizedCode.split('\n');
        let outputLines = [];
        let indentLevel = 0;
        const indentStr = '    ';

        linesToProcess.forEach(line => {
            let trimmed = line.trim();
            if (trimmed.length === 0) {
                // Keep single blank lines for readability spacing
                if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== "") {
                    outputLines.push("");
                }
                return;
            }

            // Keep directive and comment placeholders untouched
            if (trimmed.startsWith('__DIRECTIVE_') || trimmed.startsWith('__BLOCK_COMMENT_') || trimmed.startsWith('__LINE_COMMENT_')) {
                outputLines.push(trimmed);
                return;
            }

            if (trimmed === '}') {
                indentLevel = Math.max(0, indentLevel - 1);
                outputLines.push(indentStr.repeat(indentLevel) + '}');
            } else if (trimmed.endsWith('{')) {
                let content = trimmed.slice(0, -1).trim();
                outputLines.push(indentStr.repeat(indentLevel) + formatLineContent(content) + ' {');
                indentLevel++;
            } else if (trimmed.startsWith('}')) {
                indentLevel = Math.max(0, indentLevel - 1);
                let rest = trimmed.slice(1).trim();
                outputLines.push(indentStr.repeat(indentLevel) + '} ' + formatLineContent(rest));
                if (rest.endsWith('{')) {
                    indentLevel++;
                }
            } else {
                outputLines.push(indentStr.repeat(indentLevel) + formatLineContent(trimmed));
            }
        });

        // Reconstruct the full string
        let finalCode = outputLines.join('\n');

        // Restore directives
        finalCode = finalCode.replace(/__DIRECTIVE_(\d+)__/g, (m, id) => {
            return directives[id];
        });

        // Restore block comments nicely
        finalCode = finalCode.replace(/__BLOCK_COMMENT_(\d+)__/g, (m, id) => {
            const commentLines = comments[id].split('\n');
            return commentLines.map((l, idx) => {
                let t = l.trim();
                if (idx > 0 && t.startsWith('*')) {
                    return ' ' + t;
                }
                return t;
            }).join('\n');
        });

        // Restore line comments
        finalCode = finalCode.replace(/__LINE_COMMENT_(\d+)__/g, (m, id) => {
            return comments[id];
        });

        // Second pass: clean up indentation of comments and align bracket structures
        let finalLines = finalCode.split('\n');
        let currentIndent = 0;

        for (let i = 0; i < finalLines.length; i++) {
            let line = finalLines[i];
            let trimmed = line.trim();

            if (trimmed.endsWith('{')) {
                finalLines[i] = indentStr.repeat(currentIndent) + trimmed;
                currentIndent++;
            } else if (trimmed.startsWith('}')) {
                currentIndent = Math.max(0, currentIndent - 1);
                finalLines[i] = indentStr.repeat(currentIndent) + trimmed;
            } else if (trimmed.startsWith('/*') || trimmed.startsWith('//') || trimmed.startsWith('*')) {
                let extra = trimmed.startsWith('*') ? ' ' : '';
                finalLines[i] = indentStr.repeat(currentIndent) + extra + trimmed;
            } else if (!trimmed.startsWith('#') && trimmed.length > 0) {
                finalLines[i] = indentStr.repeat(currentIndent) + trimmed;
            } else {
                finalLines[i] = trimmed;
            }
        }

        // Return final filtered lines collapse consecutive empty lines
        let result = [];
        let lastWasEmpty = false;

        finalLines.forEach(line => {
            let trimmed = line.trim();
            if (trimmed.length === 0) {
                if (!lastWasEmpty && result.length > 0) {
                    result.push("");
                    lastWasEmpty = true;
                }
            } else {
                result.push(line.trimEnd());
                lastWasEmpty = false;
            }
        });

        return result.join('\n');
    }



    // =========================================================================
    // 1. INTERNATIONALIZATION (Translations)
    // =========================================================================
    Language.addTranslations('en', {
        'panel.global_renderer_properties': 'WORLD',
        'panel.material_properties': 'MATERIAL',

        'shader_architect.material_panel.no_selected': 'Select a single cube or multiple cubes to edit their material instance properties.',
        'shader_architect.material_panel.no_instance': 'Create a material instance to override the global material on this cube.',
        'shader_architect.material_panel.no_face_instance': 'Assign a material instance to this face to override the element material.',
        'shader_architect.material_panel.multiple_instances': 'Multiple material instances have been selected. All selected cubes must have the same material instance properties.',
        'shader_architect.material_panel.properties': 'Material Instance Properties',

        'shader_architect.material_panel.title': 'Material Instance',
        'shader_architect.material_panel.global_material': 'Global Material',
        'shader_architect.material_panel.element_material': 'Element Material',
        'shader_architect.material_panel.mixed_instances': '(Mixed Instances)',
        'shader_architect.material_panel.face_scope.element': 'Element',
        'shader_architect.material_panel.face_scope.north': 'North Face',
        'shader_architect.material_panel.face_scope.south': 'South Face',
        'shader_architect.material_panel.face_scope.east': 'East Face',
        'shader_architect.material_panel.face_scope.west': 'West Face',
        'shader_architect.material_panel.face_scope.up': 'Up Face',
        'shader_architect.material_panel.face_scope.down': 'Down Face',
        'shader_architect.material_panel.base_material': 'Base Material',
        'shader_architect.material_panel.base_material.desc': 'Select the FancyShaderMaterial that provides the shader code and uniform defaults for this instance.',
        'shader_architect.material_panel.instance': 'Material Instance',
        'shader_architect.material_panel.instance.desc': 'Assign a project material instance to the selected cubes, or use the global render material.',
        'shader_architect.material_panel.instance_name': 'Instance Name',
        'shader_architect.material_panel.new_instance_name': 'New Material Instance',
        'shader_architect.material_panel.create_instance': 'Create Material Instance',
        'shader_architect.material_panel.create_instance.desc': 'Create a project material instance from a base material and assign it to the selected cubes.',
        'shader_architect.material_panel.delete_instance': 'Delete Material Instance',
        'shader_architect.material_panel.delete_instance.desc': 'Delete the selected material instance from this project and clear it from every cube using it.',
        'shader_architect.material_panel.show_advanced': 'Advanced controls',
        'shader_architect.material_panel.show_advanced.desc': 'Show technical material controls for detailed tuning.',
        'shader_architect.uniform_group.core': 'Core',
        'shader_architect.uniform_group.texture': 'Texture',
        'shader_architect.uniform_group.surface': 'Surface',
        'shader_architect.uniform_group.lighting': 'Lighting',
        'shader_architect.uniform_group.ao': 'AO',
        'shader_architect.uniform_group.shadows': 'Shadows',
        'shader_architect.uniform_group.reflections': 'Reflections',
        'shader_architect.uniform_group.bevel': 'Bevel',
        'shader_architect.uniform_group.outline': 'Outline',
        'shader_architect.uniform_group.rim': 'Rim',
        'shader_architect.uniform_group.technical': 'Technical',
        'shader_architect.material_panel.undo.create_instance': 'Create material instance',
        'shader_architect.material_panel.undo.delete_instance': 'Delete material instance',
        'shader_architect.material_panel.undo.assign_instance': 'Assign material instance',
        'shader_architect.material_panel.undo.clear_instance': 'Use global material',
        'shader_architect.material_panel.undo.assign_face_instance': 'Assign face material instance',
        'shader_architect.material_panel.undo.clear_face_instance': 'Use element material',
        'shader_architect.material_panel.undo.rename_instance': 'Rename material instance',
        "menu.shader_architect": "Shader Architect",
        "action.sa_global_mode": "World Render Mode",
        "shader_architect.menu.material_studio": "Material Studio",
        "shader_architect.menu.material_studio.desc": "Open Material Studio to create, edit, import, and export Shader Architect materials.",
        "shader_architect.menu.apply_material": "Apply Material to Selection",
        "shader_architect.menu.clear_material": "Clear Material Override",
        "shader_architect.ui.global_mode": "Global Scene Material:",
        "shader_architect.dialog.studio_title": "Material Studio",
        "shader_architect.toast.applied": "Material applied to scene.",
        "shader_architect.toast.exported": "Material Exported successfully.",
        "shader_architect.toast.imported": "Material Imported successfully.",
        "shader_architect.toast.deleted": "Material deleted.",
        "shader_architect.message.import_failed": "Failed to parse .samat file.",
        "shader_architect.message.light_manager_required": "Shader Architect requires Light Manager. Please install and enable the Light Manager plugin.",

        "shader_architect.preset.classic": "Classic Shader",
        "shader_architect.preset.pbr_metallic_roughness": "PBR Metallic/Roughness",
        "shader_architect.preset.lightflow": "Unshaded Lightflow",
        "shader_architect.preset.shaded_lightflow": "Shaded Lightflow",
        "shader_architect.preset.pixelated_shaded_lightflow": "Pixelated Shaded Lightflow",
        "shader_architect.preset.luma_forge": "LumaForge",
        "shader_architect.preset.realview_pbr": "RealView PBR",

        "shader_architect.preset.pbr": "Standard PBR",

        // Preset Uniform Translations (Short labels for properties UI)
        "shader_architect.uniform.map": "Texture",
        "shader_architect.uniform.map.desc": "Main texture sampled by the material",
        "shader_architect.uniform.LIGHTCOLOR": "Light Tint",
        "shader_architect.uniform.LIGHTCOLOR.desc": "Overall color tint multiplier applied to the final render",
        "shader_architect.uniform.SHADE": "Shade",
        "shader_architect.uniform.SHADE.desc": "Toggle scene shading/shadowing systems",
        "shader_architect.uniform.LIGHTSIDE": "Light Side",
        "shader_architect.uniform.LIGHTSIDE.desc": "Side direction representing the main lighting vector",
        "shader_architect.uniform.EMISSIVE": "Emissive",
        "shader_architect.uniform.EMISSIVE.desc": "Treat textures as fully self-illuminated/emissive",
        "shader_architect.uniform.max_light_number": "Lights",
        "shader_architect.uniform.max_light_number.desc": "Number of Light Manager lights sampled by this material",
        "shader_architect.uniform.uLightPos": "Light Positions",
        "shader_architect.uniform.uLightPos.desc": "World positions for Light Manager lights",
        "shader_architect.uniform.uLightDir": "Light Directions",
        "shader_architect.uniform.uLightDir.desc": "Direction vectors for directional and spot lights",
        "shader_architect.uniform.uLightIntensity": "Light Intensity",
        "shader_architect.uniform.uLightIntensity.desc": "Per-light intensity values from Light Manager",
        "shader_architect.uniform.uLightDistance": "Light Distance",
        "shader_architect.uniform.uLightDistance.desc": "Per-light distance falloff values",
        "shader_architect.uniform.uLightConeAngle": "Light Cone",
        "shader_architect.uniform.uLightConeAngle.desc": "Spot light cone angle values",
        "shader_architect.uniform.uLightPenumbra": "Light Penumbra",
        "shader_architect.uniform.uLightPenumbra.desc": "Spot light edge softness values",
        "shader_architect.uniform.uLightType": "Light Types",
        "shader_architect.uniform.uLightType.desc": "Light type IDs for point, spot, and directional lights",
        "shader_architect.uniform.uLightColor": "Light Colors",
        "shader_architect.uniform.uLightColor.desc": "Per-light color values from Light Manager",
        "shader_architect.uniform.BEVEL_LIGHT_COLOR_STRENGTH": "Bevel Tint",
        "shader_architect.uniform.BEVEL_LIGHT_COLOR_STRENGTH.desc": "Boost how strongly Light Manager colors tint promotional bevel highlights",
        "shader_architect.uniform.BEVEL_ENABLED": "Bevel",
        "shader_architect.uniform.BEVEL_ENABLED.desc": "Enable promotional bevel lighting",
        "shader_architect.uniform.BEVEL_ALPHA_ENABLED": "Alpha Bevel",
        "shader_architect.uniform.BEVEL_ALPHA_ENABLED.desc": "Enable promotional bevel on alpha texture edges",
        "shader_architect.uniform.BEVEL_WIDTH": "Bevel Width",
        "shader_architect.uniform.BEVEL_WIDTH.desc": "Width of the bevel highlight band",
        "shader_architect.uniform.BEVEL_SOFTNESS": "Bevel Soft",
        "shader_architect.uniform.BEVEL_SOFTNESS.desc": "Softness of the bevel transition",
        "shader_architect.uniform.BEVEL_SLOPE": "Bevel Slope",
        "shader_architect.uniform.BEVEL_SLOPE.desc": "Slope response of the bevel mask",
        "shader_architect.uniform.BEVEL_HIGHLIGHT": "Highlight",
        "shader_architect.uniform.BEVEL_HIGHLIGHT.desc": "Strength of the bright bevel edge",
        "shader_architect.uniform.BEVEL_HIGHLIGHT_COLOR_INFLUENCE": "Hi Tint",
        "shader_architect.uniform.BEVEL_HIGHLIGHT_COLOR_INFLUENCE.desc": "Light color influence on bevel highlights",
        "shader_architect.uniform.BEVEL_LIGHT_STRENGTH": "Key Light",
        "shader_architect.uniform.BEVEL_LIGHT_STRENGTH.desc": "Main light strength used by the bevel",
        "shader_architect.uniform.BEVEL_SHADOW": "Shade",
        "shader_architect.uniform.BEVEL_SHADOW.desc": "Strength of the dark bevel edge",
        "shader_architect.uniform.BEVEL_SHADOW_SATURATION": "Shade Sat",
        "shader_architect.uniform.BEVEL_SHADOW_SATURATION.desc": "Color saturation of bevel shadowing",
        "shader_architect.uniform.BEVEL_CORNER_FADE": "Corner Fade",
        "shader_architect.uniform.BEVEL_CORNER_FADE.desc": "Fade amount near bevel corners",
        "shader_architect.uniform.BEVEL_GLOW_ENABLED": "Glow",
        "shader_architect.uniform.BEVEL_GLOW_ENABLED.desc": "Enable the inner bevel glow",
        "shader_architect.uniform.BEVEL_GLOW_SYNC_TO_PROMO_RIM": "Glow Sync",
        "shader_architect.uniform.BEVEL_GLOW_SYNC_TO_PROMO_RIM.desc": "Use rim settings for inner glow",
        "shader_architect.uniform.BEVEL_GLOW_SYNC_DIRECTION": "Glow Screen Sync",
        "shader_architect.uniform.BEVEL_GLOW_SYNC_DIRECTION.desc": "Aligns the glow with the 2D screen direction of the light, syncing with RIM",
        "shader_architect.uniform.BEVEL_GLOW_REQUIRE_LIGHT_FACING": "Glow Face Cull",
        "shader_architect.uniform.BEVEL_GLOW_REQUIRE_LIGHT_FACING.desc": "Require the face to point towards the light to show the glow",
        "shader_architect.uniform.BEVEL_GLOW_FACE_THRESHOLD": "Glow Face",
        "shader_architect.uniform.BEVEL_GLOW_FACE_THRESHOLD.desc": "Light angle needed for inner glow",
        "shader_architect.uniform.BEVEL_GLOW_WIDTH": "Glow Width",
        "shader_architect.uniform.BEVEL_GLOW_WIDTH.desc": "Width of the inner glow band",
        "shader_architect.uniform.BEVEL_GLOW_SOFTNESS": "Glow Soft",
        "shader_architect.uniform.BEVEL_GLOW_SOFTNESS.desc": "Softness of the inner glow",
        "shader_architect.uniform.BEVEL_GLOW_CORNER_FADE": "Glow Corner",
        "shader_architect.uniform.BEVEL_GLOW_CORNER_FADE.desc": "Corner fade of the inner glow",
        "shader_architect.uniform.BEVEL_GLOW_INTENSITY": "Glow Power",
        "shader_architect.uniform.BEVEL_GLOW_INTENSITY.desc": "Brightness of the inner glow",
        "shader_architect.uniform.BEVEL_GLOW_COLOR_INFLUENCE": "Glow Tint",
        "shader_architect.uniform.BEVEL_GLOW_COLOR_INFLUENCE.desc": "Light color influence on inner glow",
        "shader_architect.uniform.OUTLINE_ELEMENT_ENABLED": "Elem Line",
        "shader_architect.uniform.OUTLINE_ELEMENT_ENABLED.desc": "Enable element edge outline",
        "shader_architect.uniform.OUTLINE_ALPHA_ENABLED": "Alpha Line",
        "shader_architect.uniform.OUTLINE_ALPHA_ENABLED.desc": "Enable alpha edge outline",
        "shader_architect.uniform.OUTLINE_ALPHA_CLAMP_TO_ELEMENT": "Alpha Clamp",
        "shader_architect.uniform.OUTLINE_ALPHA_CLAMP_TO_ELEMENT.desc": "Keep alpha outline inside element bounds",
        "shader_architect.uniform.OUTLINE_ALPHA_DIAGONAL_ONLY": "Diag Only",
        "shader_architect.uniform.OUTLINE_ALPHA_DIAGONAL_ONLY.desc": "Limit alpha outline to diagonal corners",
        "shader_architect.uniform.OUTLINE_WIDTH": "Line Width",
        "shader_architect.uniform.OUTLINE_WIDTH.desc": "Width of the promotional outline",
        "shader_architect.uniform.OUTLINE_COLOR": "Line Color",
        "shader_architect.uniform.OUTLINE_COLOR.desc": "Color of the promotional outline",
        "shader_architect.uniform.OUTLINE_INTENSITY": "Line Power",
        "shader_architect.uniform.OUTLINE_INTENSITY.desc": "Brightness of the promotional outline",
        "shader_architect.uniform.OUTLINE_FADE": "Line Fade",
        "shader_architect.uniform.OUTLINE_FADE.desc": "Fade softness of the outline",
        "shader_architect.uniform.OUTLINE_MODE": "Line Mode",
        "shader_architect.uniform.OUTLINE_MODE.desc": "Outline blend mode",
        "shader_architect.uniform.OUTLINE_AFFECTED_BY_LIGHT": "Lit Line",
        "shader_architect.uniform.OUTLINE_AFFECTED_BY_LIGHT.desc": "Let lighting affect the outline",
        "shader_architect.uniform.PROMO_RIM_ENABLED": "Rim",
        "shader_architect.uniform.PROMO_RIM_ENABLED.desc": "Enable promotional rim light",
        "shader_architect.uniform.PROMO_RIM_WIDTH": "Rim Width",
        "shader_architect.uniform.PROMO_RIM_WIDTH.desc": "Width of the rim light",
        "shader_architect.uniform.PROMO_RIM_INTENSITY": "Rim Power",
        "shader_architect.uniform.PROMO_RIM_INTENSITY.desc": "Brightness of the rim light",
        "shader_architect.uniform.PROMO_RIM_COLOR": "Rim Color",
        "shader_architect.uniform.PROMO_RIM_COLOR.desc": "Fixed color of the rim light",
        "shader_architect.uniform.PROMO_RIM_COLOR_MODE": "Rim Mode",
        "shader_architect.uniform.PROMO_RIM_COLOR_MODE.desc": "0 fixed color, 1 mix with lights, 2 use light color",
        "shader_architect.uniform.PROMO_RIM_LIGHT_COLOR_INFLUENCE": "Rim Light",
        "shader_architect.uniform.PROMO_RIM_LIGHT_COLOR_INFLUENCE.desc": "How much Light Manager color affects the promotional silhouette rim",
        "shader_architect.uniform.PROMO_RIM_DIRECTION": "Rim Dir",
        "shader_architect.uniform.PROMO_RIM_DIRECTION.desc": "Direction of the rim light",
        "shader_architect.uniform.PROMO_RIM_DIRECTION_SOFTNESS": "Rim Soft",
        "shader_architect.uniform.PROMO_RIM_DIRECTION_SOFTNESS.desc": "Softness of the rim direction mask",
        "shader_architect.uniform.PROMO_RIM_DIRECTIONALITY": "Rim Focus",
        "shader_architect.uniform.PROMO_RIM_DIRECTIONALITY.desc": "Directional focus of the rim light",
        "shader_architect.uniform.PROMO_RIM_DEPTH_EPSILON": "Rim Depth",
        "shader_architect.uniform.PROMO_RIM_DEPTH_EPSILON.desc": "Depth tolerance for rim detection",
        "shader_architect.uniform.PROMO_RIM_OCCLUSION_ENABLED": "Rim Occl",
        "shader_architect.uniform.PROMO_RIM_OCCLUSION_ENABLED.desc": "Occlude rim light by nearby geometry",
        "shader_architect.uniform.PROMO_RIM_GROUP": "Rim Group",
        "shader_architect.uniform.PROMO_RIM_GROUP.desc": "Group mask for promotional rim light",
        "shader_architect.uniform.PROMO_RIM_TEXTURE_BLEND": "Rim Tex Blend",
        "shader_architect.uniform.PROMO_RIM_TEXTURE_BLEND.desc": "Blends the rim color with the edge texture to seamlessly connect with inner glow",
        "shader_architect.uniform.PROMO_RIM_SCALE_WITH_ZOOM": "Rim Scale Zoom",
        "shader_architect.uniform.PROMO_RIM_SCALE_WITH_ZOOM.desc": "Scale rim thickness with camera distance (Constant world size)",
        "shader_architect.uniform.OUTLINE_CONSTANT_SCREEN_SIZE": "Line Screen Size",
        "shader_architect.uniform.OUTLINE_CONSTANT_SCREEN_SIZE.desc": "Keep element outline thickness constant in screen pixels",
        "shader_architect.uniform.EDGE_FALLBACK_LIGHT_DIRECTION": "Edge Light",
        "shader_architect.uniform.EDGE_FALLBACK_LIGHT_DIRECTION.desc": "Fallback direction for edge lighting",
        "shader_architect.uniform.uLightCastShadow": "Shadow Casters",
        "shader_architect.uniform.uLightCastShadow.desc": "Per-light shadow casting flags",
        "shader_architect.uniform.uLightShadowIndex": "Shadow Indices",
        "shader_architect.uniform.uLightShadowIndex.desc": "Per-light shadow map indices",
        "shader_architect.uniform.uWorldNormalMatrix": "World Normal Matrix",
        "shader_architect.uniform.uWorldNormalMatrix.desc": "Normal transform matrix updated from each rendered cube",
        "shader_architect.uniform.uTime": "Time",
        "shader_architect.uniform.uTime.desc": "Animated time value updated every preview frame",
        "shader_architect.uniform.uAmbient": "Ambient",
        "shader_architect.uniform.uAmbient.desc": "Baseline light level in unlit areas",
        "shader_architect.uniform.uAmbientColor": "Amb Color",
        "shader_architect.uniform.uAmbientColor.desc": "Color of the background ambient light source",
        "shader_architect.uniform.uExposure": "Exposure",
        "shader_architect.uniform.uExposure.desc": "Overall brightness after lighting",
        "shader_architect.uniform.uToneMapping": "Tone Map",
        "shader_architect.uniform.uToneMapping.desc": "Algorithm for mapping high dynamic range color values",
        "shader_architect.uniform.uUseToneMapping": "Tone Map",
        "shader_architect.uniform.uUseToneMapping.desc": "Algorithm for mapping high dynamic range color values",
        "shader_architect.uniform.uStylizedNormalInfluence": "Shape",
        "shader_architect.uniform.uStylizedNormalInfluence.desc": "How much Blockbench-style side lighting shapes the material",
        "shader_architect.uniform.uLightWrap": "Light Wrap",
        "shader_architect.uniform.uLightWrap.desc": "Lets light wrap onto edges for a softer stylized look",
        "shader_architect.uniform.uAOEnabled": "Contact AO",
        "shader_architect.uniform.uAOEnabled.desc": "Toggle stylized contact shadowing",
        "shader_architect.uniform.uAOStrength": "AO Amount",
        "shader_architect.uniform.uAOStrength.desc": "Intensity of contact shadows",
        "shader_architect.uniform.uAORadius": "AO Radius",
        "shader_architect.uniform.uAORadius.desc": "How far contact shadows spread from edges and corners",
        "shader_architect.uniform.uAOPower": "AO Power",
        "shader_architect.uniform.uAOPower.desc": "Exponent curve adjustment for ambient occlusion falloff",
        "shader_architect.uniform.uAOMin": "AO Min",
        "shader_architect.uniform.uAOMin.desc": "Minimum ambient occlusion brightness clamp",
        "shader_architect.uniform.uAODirectInfluence": "AO Direct",
        "shader_architect.uniform.uAODirectInfluence.desc": "How much AO shadows affect direct light sources",
        "shader_architect.uniform.uShadowStrength": "Shadow",
        "shader_architect.uniform.uShadowStrength.desc": "Darkness intensity of cast shadows",
        "shader_architect.uniform.uShadowFloor": "Shadow Min",
        "shader_architect.uniform.uShadowFloor.desc": "Minimum ambient shadow value (shadow brightness floor)",
        "shader_architect.uniform.AMBIENT_INTENSITY": "Ambient Int",
        "shader_architect.uniform.AMBIENT_INTENSITY.desc": "Intensity multiplier for ambient scene lighting",
        "shader_architect.uniform.uBaseColor": "Base",
        "shader_architect.uniform.uBaseColor.desc": "Primary diffuse color of the material",
        "shader_architect.uniform.uMetallic": "Metallic",
        "shader_architect.uniform.uMetallic.desc": "Metallic metalness factor (0.0 = dielectric, 1.0 = metallic)",
        "shader_architect.uniform.uRoughness": "Roughness",
        "shader_architect.uniform.uRoughness.desc": "Surface roughness factor, controlling glossy reflections scatter",
        "shader_architect.uniform.uAO": "Baked AO",
        "shader_architect.uniform.uAO.desc": "Baked ambient occlusion factor",
        "shader_architect.uniform.uClearcoat": "Clearcoat",
        "shader_architect.uniform.uClearcoat.desc": "Clearcoat layer intensity (e.g. lacquer/varnish)",
        "shader_architect.uniform.uClearcoatRoughness": "Coat Rough",
        "shader_architect.uniform.uClearcoatRoughness.desc": "Roughness of the clearcoat layer",
        "shader_architect.uniform.uAnisotropy": "Anisotropy",
        "shader_architect.uniform.uAnisotropy.desc": "Reflection anisotropy level (stretching along a direction)",
        "shader_architect.uniform.uAnisotropyDirection": "Aniso Dir",
        "shader_architect.uniform.uAnisotropyDirection.desc": "Orientation angle/vector of anisotropy tangent",
        "shader_architect.uniform.uSheen": "Sheen",
        "shader_architect.uniform.uSheen.desc": "Sheen backscattering intensity for velvet/fabric effects",
        "shader_architect.uniform.uSheenColor": "Sheen Color",
        "shader_architect.uniform.uSheenColor.desc": "Color of the sheen reflection",
        "shader_architect.uniform.uSheenRoughness": "Sheen Soft",
        "shader_architect.uniform.uSheenRoughness.desc": "Roughness of the sheen reflection",
        "shader_architect.uniform.uTransmission": "Transmission",
        "shader_architect.uniform.uTransmission.desc": "Light transmission factor (translucency/glass effect)",
        "shader_architect.uniform.uThickness": "Thickness",
        "shader_architect.uniform.uThickness.desc": "Volumetric thickness of the medium for absorption",
        "shader_architect.uniform.uAttenuationColor": "Absorb Tint",
        "shader_architect.uniform.uAttenuationColor.desc": "Color tint when light passes through the thickness",
        "shader_architect.uniform.uAttenuationDistance": "Absorb Dist",
        "shader_architect.uniform.uAttenuationDistance.desc": "Distance light travels through medium before absorption",
        "shader_architect.uniform.uIOR": "IOR",
        "shader_architect.uniform.uIOR.desc": "Index of Refraction (IOR) determining light bending",
        "shader_architect.uniform.uIridescence": "Iridescence",
        "shader_architect.uniform.uIridescence.desc": "Thin-film interference iridescence (rainbow shimmer)",
        "shader_architect.uniform.uIridescenceIOR": "Iridesc IOR",
        "shader_architect.uniform.uIridescenceIOR.desc": "Index of refraction of the thin iridescence film",
        "shader_architect.uniform.uIridescenceThicknessMin": "Iridesc Min",
        "shader_architect.uniform.uIridescenceThicknessMin.desc": "Minimum thickness of thin-film in nanometers",
        "shader_architect.uniform.uIridescenceThicknessMax": "Iridesc Max",
        "shader_architect.uniform.uIridescenceThicknessMax.desc": "Maximum thickness of thin-film in nanometers",
        "shader_architect.uniform.uEmissiveColor": "Emit Color",
        "shader_architect.uniform.uEmissiveColor.desc": "Self-illumination emissive color",
        "shader_architect.uniform.uEmissiveStrength": "Emit Power",
        "shader_architect.uniform.uEmissiveStrength.desc": "Intensity multiplier for self-illumination emission",
        "shader_architect.uniform.uUseBaseColorMap": "Base Map",
        "shader_architect.uniform.uUseBaseColorMap.desc": "Toggle using texture map for base color",
        "shader_architect.uniform.uUseMetallicRoughnessMap": "M/R Map",
        "shader_architect.uniform.uUseMetallicRoughnessMap.desc": "Toggle using texture map for metallic/roughness",
        "shader_architect.uniform.uUseNormalMap": "Normal Map",
        "shader_architect.uniform.uUseNormalMap.desc": "Toggle using normal map for surface details",
        "shader_architect.uniform.uUseAOMap": "AO Map",
        "shader_architect.uniform.uUseAOMap.desc": "Toggle using texture map for Ambient Occlusion",
        "shader_architect.uniform.uUseEmissiveMap": "Emit Map",
        "shader_architect.uniform.uUseEmissiveMap.desc": "Toggle using texture map for emissive glow",
        "shader_architect.uniform.uUseClearcoatMap": "Coat Map",
        "shader_architect.uniform.uUseClearcoatMap.desc": "Toggle using texture map for clearcoat",
        "shader_architect.uniform.uUseClearcoatRoughnessMap": "Coat R Map",
        "shader_architect.uniform.uUseClearcoatRoughnessMap.desc": "Toggle using texture map for clearcoat roughness",
        "shader_architect.uniform.uUseAnisotropyMap": "Aniso Map",
        "shader_architect.uniform.uUseAnisotropyMap.desc": "Toggle using texture map for anisotropy",
        "shader_architect.uniform.uUseSheenColorMap": "Sheen Color Map",
        "shader_architect.uniform.uUseSheenColorMap.desc": "Toggle using texture map for sheen color",
        "shader_architect.uniform.uUseSheenRoughnessMap": "Sheen R Map",
        "shader_architect.uniform.uUseSheenRoughnessMap.desc": "Toggle using texture map for sheen roughness",
        "shader_architect.uniform.uUseTransmissionMap": "Trans Map",
        "shader_architect.uniform.uUseTransmissionMap.desc": "Toggle using texture map for transmission",
        "shader_architect.uniform.uUseThicknessMap": "Thickness Map",
        "shader_architect.uniform.uUseThicknessMap.desc": "Toggle using texture map for thickness",
        "shader_architect.uniform.uUseIridescenceMap": "Iridesc Map",
        "shader_architect.uniform.uUseIridescenceMap.desc": "Toggle using texture map for iridescence",
        "shader_architect.uniform.uUseIridescenceThicknessMap": "Iridesc T Map",
        "shader_architect.uniform.uUseIridescenceThicknessMap.desc": "Toggle using texture map for iridescence thickness",
        "shader_architect.uniform.uNormalScale": "Normal Power",
        "shader_architect.uniform.uNormalScale.desc": "Strength multiplier for normal mapping details",
        "shader_architect.uniform.uBaseColorMapScale": "Base Scale",
        "shader_architect.uniform.uBaseColorMapScale.desc": "Repeat scale for the base color map",
        "shader_architect.uniform.uMetallicRoughnessMapScale": "M/R Scale",
        "shader_architect.uniform.uMetallicRoughnessMapScale.desc": "Repeat scale for the metallic roughness map",
        "shader_architect.uniform.uNormalMapScale": "Normal Scale",
        "shader_architect.uniform.uNormalMapScale.desc": "Repeat scale for the normal map",
        "shader_architect.uniform.uAOMapScale": "AO Scale",
        "shader_architect.uniform.uAOMapScale.desc": "Repeat scale for the AO map",
        "shader_architect.uniform.uEmissiveMapScale": "Emit Scale",
        "shader_architect.uniform.uEmissiveMapScale.desc": "Repeat scale for the emissive map",
        "shader_architect.uniform.uClearcoatMapScale": "Coat Scale",
        "shader_architect.uniform.uClearcoatMapScale.desc": "Repeat scale for the clearcoat map",
        "shader_architect.uniform.uClearcoatRoughnessMapScale": "Coat R Scale",
        "shader_architect.uniform.uClearcoatRoughnessMapScale.desc": "Repeat scale for the clearcoat roughness map",
        "shader_architect.uniform.uAnisotropyMapScale": "Aniso Scale",
        "shader_architect.uniform.uAnisotropyMapScale.desc": "Repeat scale for the anisotropy map",
        "shader_architect.uniform.uSheenColorMapScale": "Sheen Scale",
        "shader_architect.uniform.uSheenColorMapScale.desc": "Repeat scale for the sheen color map",
        "shader_architect.uniform.uSheenRoughnessMapScale": "Sheen R Scale",
        "shader_architect.uniform.uSheenRoughnessMapScale.desc": "Repeat scale for the sheen roughness map",
        "shader_architect.uniform.uTransmissionMapScale": "Trans Scale",
        "shader_architect.uniform.uTransmissionMapScale.desc": "Repeat scale for the transmission map",
        "shader_architect.uniform.uThicknessMapScale": "Thick Scale",
        "shader_architect.uniform.uThicknessMapScale.desc": "Repeat scale for the thickness map",
        "shader_architect.uniform.uIridescenceMapScale": "Iridesc Scale",
        "shader_architect.uniform.uIridescenceMapScale.desc": "Repeat scale for the iridescence map",
        "shader_architect.uniform.uIridescenceThicknessMapScale": "Iris T Scale",
        "shader_architect.uniform.uIridescenceThicknessMapScale.desc": "Repeat scale for the iridescence thickness map",
        "shader_architect.uniform.uEnvSpecularStrength": "Env Shine",
        "shader_architect.uniform.uEnvSpecularStrength.desc": "Intensity of specular reflection from the environment environment",
        "shader_architect.uniform.uSpecularIntensity": "Specular",
        "shader_architect.uniform.uSpecularIntensity.desc": "General multiplier for direct specular highlight highlights",
        "shader_architect.uniform.uSSREnabled": "SSR",
        "shader_architect.uniform.uSSREnabled.desc": "Enable real screen-space reflections for this material",
        "shader_architect.uniform.uSSRIntensity": "SSR Power",
        "shader_architect.uniform.uSSRIntensity.desc": "How visible the reflected scene appears on this material",
        "shader_architect.uniform.uSSRRoughness": "SSR Soft",
        "shader_architect.uniform.uSSRRoughness.desc": "How soft and blurry the reflected scene appears",
        "shader_architect.uniform.uSSRThickness": "SSR Depth",
        "shader_architect.uniform.uSSRThickness.desc": "Depth hit tolerance used while raymarching reflections",
        "shader_architect.uniform.uSSRMaxDistance": "SSR Range",
        "shader_architect.uniform.uSSRMaxDistance.desc": "Maximum screen-space ray distance for reflected hits",
        "shader_architect.uniform.uSSRDistortion": "SSR Warp",
        "shader_architect.uniform.uSSRDistortion.desc": "Subtle animated distortion applied to reflected samples",
        "shader_architect.uniform.uSSRFresnelPower": "Fresnel Pow",
        "shader_architect.uniform.uSSRFresnelPower.desc": "Fresnel curve sharpness for grazing-angle reflections",
        "shader_architect.uniform.uSSRFresnelStrength": "Fresnel",
        "shader_architect.uniform.uSSRFresnelStrength.desc": "How much Fresnel affects reflection visibility",
        "shader_architect.uniform.uSSREdgeFade": "Edge Fade",
        "shader_architect.uniform.uSSREdgeFade.desc": "Fade width near screen borders",
        "shader_architect.uniform.uSSRDistanceFade": "Range Fade",
        "shader_architect.uniform.uSSRDistanceFade.desc": "Distance ratio where reflected hits start fading out",
        "shader_architect.uniform.uSSRDepthBias": "Depth Bias",
        "shader_architect.uniform.uSSRDepthBias.desc": "Extra ray thickness added with distance to stabilize hits",
        "shader_architect.uniform.uSSRQuality": "SSR Quality",
        "shader_architect.uniform.uSSRQuality.desc": "Raymarch quality used by screen-space reflections",
        "shader_architect.uniform.uSSRRenderScale": "SSR Scale",
        "shader_architect.uniform.uSSRRenderScale.desc": "Internal capture resolution scale for screen-space reflections",
        "shader_architect.uniform.uSSRFrameInterval": "SSR Refresh",
        "shader_architect.uniform.uSSRFrameInterval.desc": "How often reflections refresh while previewing",
        "shader_architect.uniform.shadowPixelResolution": "Pixel Size",
        "shader_architect.uniform.shadowPixelResolution.desc": "Size of the pixelated shadow grid",
        "shader_architect.uniform.shadowThreshold": "Cutoff",
        "shader_architect.uniform.shadowThreshold.desc": "Shadow threshold for the pixelated shadow mask",
        "shader_architect.uniform.AUTO_TILE": "Auto Tile",
        "shader_architect.uniform.AUTO_TILE.desc": "Scale texture tiling from face size",
        "shader_architect.uniform.TILING": "Tiling",
        "shader_architect.uniform.TILING.desc": "Manual texture repeat scale",
        "shader_architect.uniform.uClampLighting": "Clamp Light",
        "shader_architect.uniform.uClampLighting.desc": "Keep combined lighting inside display range",
        "shader_architect.uniform.uAOEdgeSharpness": "AO Edge",
        "shader_architect.uniform.uAOEdgeSharpness.desc": "Sharpness of edge contact occlusion",
        "shader_architect.uniform.uAOCornerWeight": "AO Corner",
        "shader_architect.uniform.uAOCornerWeight.desc": "Strength of corner contact occlusion",
        "shader_architect.uniform.uAOFaceNormalWeight": "AO Face",
        "shader_architect.uniform.uAOFaceNormalWeight.desc": "Normal based contact occlusion influence",
        "shader_architect.uniform.uShadowStrength": "Shadow",
        "shader_architect.uniform.uShadowStrength.desc": "Darkness intensity of cast shadows",
        "shader_architect.uniform.uShadowFloor": "Shadow Floor",
        "shader_architect.uniform.uShadowFloor.desc": "Minimum ambient shadow value (shadow brightness floor)",
        "shader_architect.ui.toggle_left": "Toggle Material Library (Ctrl+B)",
        "shader_architect.ui.toggle_right": "Toggle Properties Sidebar",
        "shader_architect.ui.format": "Format GLSL Code (Shift+Alt+F)",
        "shader_architect.ui.validate": "Compile & Link Shader (Ctrl+S)",
        "shader_architect.ui.apply": "Apply live updates to scene",
        "shader_architect.ui.toggle_shadows": "Toggle material shadow support",
        "shader_architect.ui.toggle_reflections": "Toggle material screen-space reflection support",
        "shader_architect.toast.shadows_enabled": "Material shadows enabled",
        "shader_architect.toast.shadows_disabled": "Material shadows disabled",
        "shader_architect.toast.reflections_enabled": "Screen-space reflections enabled",
        "shader_architect.toast.reflections_disabled": "Screen-space reflections disabled",
        "shader_architect.ui.problems": "Problems",
        "shader_architect.ui.no_problems": "No problems detected in shader.",
        "shader_architect.ui.status_ok": "Ready",
        "shader_architect.ui.status_errors": "Errors detected",
        "shader_architect.ui.tooltip.duplicate": "Duplicate this material",
        "shader_architect.ui.tooltip.export": "Export material to .samat file",
        "shader_architect.ui.tooltip.delete": "Delete this material",
    });

    Language.addTranslations('es', {
        'panel.global_renderer_properties': 'MUNDO',
        'panel.material_properties': 'MATERIAL',
        'shader_architect.material_panel.no_selected': 'Selecciona uno o varios cubos para editar sus instancias de material.',
        'shader_architect.material_panel.no_instance': 'Crea una instancia de material para sobrescribir el material global en este cubo.',
        'shader_architect.material_panel.no_face_instance': 'Asigna una instancia de material a esta cara para sobrescribir el material del elemento.',
        'shader_architect.material_panel.multiple_instances': 'Hay varias instancias de material seleccionadas. Todos los cubos seleccionados deben compartir la misma instancia.',
        'shader_architect.material_panel.properties': 'Propiedades de instancia de material',
        'shader_architect.material_panel.title': 'Instancia de material',
        'shader_architect.material_panel.global_material': 'Material global',
        'shader_architect.material_panel.element_material': 'Material del elemento',
        'shader_architect.material_panel.mixed_instances': '(Instancias diferentes)',
        'shader_architect.material_panel.face_scope.element': 'Elemento',
        'shader_architect.material_panel.face_scope.north': 'Cara norte',
        'shader_architect.material_panel.face_scope.south': 'Cara sur',
        'shader_architect.material_panel.face_scope.east': 'Cara este',
        'shader_architect.material_panel.face_scope.west': 'Cara oeste',
        'shader_architect.material_panel.face_scope.up': 'Cara superior',
        'shader_architect.material_panel.face_scope.down': 'Cara inferior',
        'shader_architect.material_panel.base_material': 'Material base',
        'shader_architect.material_panel.base_material.desc': 'Elige el FancyShaderMaterial que aporta el shader y los uniforms por defecto de esta instancia.',
        'shader_architect.material_panel.instance': 'Instancia de material',
        'shader_architect.material_panel.instance.desc': 'Asigna una instancia de material del proyecto a los cubos seleccionados, o usa el material global.',
        'shader_architect.material_panel.instance_name': 'Nombre de instancia',
        'shader_architect.material_panel.new_instance_name': 'Nueva instancia de material',
        'shader_architect.material_panel.create_instance': 'Crear instancia de material',
        'shader_architect.material_panel.create_instance.desc': 'Crea una instancia de material del proyecto desde un material base y la asigna a los cubos seleccionados.',
        'shader_architect.material_panel.delete_instance': 'Eliminar instancia de material',
        'shader_architect.material_panel.delete_instance.desc': 'Elimina la instancia de material seleccionada del proyecto y la limpia de todos los cubos que la usan.',
        'shader_architect.material_panel.show_advanced': 'Controles avanzados',
        'shader_architect.material_panel.show_advanced.desc': 'Muestra controles tecnicos del material para ajuste detallado.',
        'shader_architect.uniform_group.core': 'Base',
        'shader_architect.uniform_group.texture': 'Textura',
        'shader_architect.uniform_group.surface': 'Superficie',
        'shader_architect.uniform_group.lighting': 'Iluminacion',
        'shader_architect.uniform_group.ao': 'AO',
        'shader_architect.uniform_group.shadows': 'Sombras',
        'shader_architect.uniform_group.reflections': 'Reflejos',
        'shader_architect.uniform_group.bevel': 'Bevel',
        'shader_architect.uniform_group.outline': 'Contorno',
        'shader_architect.uniform_group.rim': 'Rim',
        'shader_architect.uniform_group.technical': 'Tecnico',
        'shader_architect.material_panel.undo.create_instance': 'Crear instancia de material',
        'shader_architect.material_panel.undo.delete_instance': 'Eliminar instancia de material',
        'shader_architect.material_panel.undo.assign_instance': 'Asignar instancia de material',
        'shader_architect.material_panel.undo.clear_instance': 'Usar material global',
        'shader_architect.material_panel.undo.assign_face_instance': 'Asignar instancia de material a cara',
        'shader_architect.material_panel.undo.clear_face_instance': 'Usar material del elemento',
        'shader_architect.material_panel.undo.rename_instance': 'Renombrar instancia de material',
        "menu.shader_architect": "Shader Architect",
        "action.sa_global_mode": "Modo de Render",
        "shader_architect.menu.material_studio": "Estudio de Materiales",
        "shader_architect.menu.material_studio.desc": "Abre Material Studio para crear, editar, importar y exportar materiales de Shader Architect.",
        "shader_architect.menu.apply_material": "Aplicar Material a Selección",
        "shader_architect.menu.clear_material": "Limpiar Material (Usar Global)",
        "shader_architect.ui.global_mode": "Material de Escena Global:",
        "shader_architect.dialog.studio_title": "Estudio de Materiales",
        "shader_architect.toast.applied": "Material aplicado a la escena.",
        "shader_architect.toast.exported": "Material Exportado exitosamente.",
        "shader_architect.toast.imported": "Material Importado exitosamente.",
        "shader_architect.toast.deleted": "Material eliminado.",
        "shader_architect.message.import_failed": "No se pudo leer el archivo .samat.",
        "shader_architect.message.light_manager_required": "Shader Architect requiere Light Manager. Instala y activa el plugin Light Manager.",

        "shader_architect.preset.classic": "Shader Clásico",
        "shader_architect.preset.pbr_metallic_roughness": "PBR Metálico/Rugosidad",
        "shader_architect.preset.lightflow": "Luces Sin Sombra",
        "shader_architect.preset.shaded_lightflow": "Luces con Sombra",
        "shader_architect.preset.pixelated_shaded_lightflow": "Luces con Sombra Pixeladas",
        "shader_architect.preset.luma_forge": "LumaForge",
        "shader_architect.preset.realview_pbr": "RealView PBR",

        "shader_architect.preset.pbr": "Standard PBR",
        "shader_architect.uniform.map": "Textura",
        "shader_architect.uniform.map.desc": "Textura principal del material",
        "shader_architect.uniform.LIGHTCOLOR": "Tinte Luz",
        "shader_architect.uniform.LIGHTCOLOR.desc": "Tinte general aplicado al resultado final",
        "shader_architect.uniform.SHADE": "Sombra",
        "shader_architect.uniform.SHADE.desc": "Activa el sombreado del material",
        "shader_architect.uniform.LIGHTSIDE": "Lado Luz",
        "shader_architect.uniform.LIGHTSIDE.desc": "Direccion usada para la luz base",
        "shader_architect.uniform.EMISSIVE": "Emisivo",
        "shader_architect.uniform.EMISSIVE.desc": "Renderiza la textura como iluminada",
        "shader_architect.uniform.max_light_number": "Luces",
        "shader_architect.uniform.max_light_number.desc": "Numero de luces activas de Light Manager",
        "shader_architect.uniform.uAmbient": "Ambiente",
        "shader_architect.uniform.uAmbient.desc": "Luz base en zonas sin luz directa",
        "shader_architect.uniform.uAmbientColor": "Color Amb",
        "shader_architect.uniform.uAmbientColor.desc": "Color de la luz ambiente",
        "shader_architect.uniform.uBaseColor": "Base",
        "shader_architect.uniform.uBaseColor.desc": "Color difuso principal",
        "shader_architect.uniform.uMetallic": "Metal",
        "shader_architect.uniform.uMetallic.desc": "Factor metalico de la superficie",
        "shader_architect.uniform.uRoughness": "Rugosidad",
        "shader_architect.uniform.uRoughness.desc": "Que tan opacos o definidos son los brillos",
        "shader_architect.uniform.uAO": "AO Baked",
        "shader_architect.uniform.uAO.desc": "Factor de oclusion ambiente horneada",
        "shader_architect.uniform.uClearcoat": "Barniz",
        "shader_architect.uniform.uClearcoat.desc": "Capa brillante adicional",
        "shader_architect.uniform.uClearcoatRoughness": "Barniz Rug",
        "shader_architect.uniform.uClearcoatRoughness.desc": "Rugosidad del barniz",
        "shader_architect.uniform.uAnisotropy": "Aniso",
        "shader_architect.uniform.uAnisotropy.desc": "Estiramiento direccional del brillo",
        "shader_architect.uniform.uAnisotropyDirection": "Dir Aniso",
        "shader_architect.uniform.uAnisotropyDirection.desc": "Direccion del brillo anisotropico",
        "shader_architect.uniform.uSheen": "Tela",
        "shader_architect.uniform.uSheen.desc": "Brillo suave tipo tela",
        "shader_architect.uniform.uSheenColor": "Color Tela",
        "shader_architect.uniform.uSheenColor.desc": "Color del brillo tipo tela",
        "shader_architect.uniform.uSheenRoughness": "Tela Rug",
        "shader_architect.uniform.uSheenRoughness.desc": "Suavidad del brillo tipo tela",
        "shader_architect.uniform.uTransmission": "Transmis",
        "shader_architect.uniform.uTransmission.desc": "Paso de luz tipo vidrio",
        "shader_architect.uniform.uThickness": "Grosor",
        "shader_architect.uniform.uThickness.desc": "Grosor del medio translucido",
        "shader_architect.uniform.uAttenuationColor": "Absorcion",
        "shader_architect.uniform.uAttenuationColor.desc": "Color absorbido por el grosor",
        "shader_architect.uniform.uAttenuationDistance": "Dist Abs",
        "shader_architect.uniform.uAttenuationDistance.desc": "Distancia antes de absorber luz",
        "shader_architect.uniform.uIOR": "IOR",
        "shader_architect.uniform.uIOR.desc": "Indice de refraccion",
        "shader_architect.uniform.uIridescence": "Irisado",
        "shader_architect.uniform.uIridescence.desc": "Brillo de interferencia de color",
        "shader_architect.uniform.uIridescenceIOR": "IOR Iris",
        "shader_architect.uniform.uIridescenceIOR.desc": "IOR de la capa irisada",
        "shader_architect.uniform.uIridescenceThicknessMin": "Iris Min",
        "shader_architect.uniform.uIridescenceThicknessMin.desc": "Grosor minimo del irisado",
        "shader_architect.uniform.uIridescenceThicknessMax": "Iris Max",
        "shader_architect.uniform.uIridescenceThicknessMax.desc": "Grosor maximo del irisado",
        "shader_architect.uniform.uEmissiveColor": "Color Emit",
        "shader_architect.uniform.uEmissiveColor.desc": "Color de autoiluminacion",
        "shader_architect.uniform.uEmissiveStrength": "Pot Emit",
        "shader_architect.uniform.uEmissiveStrength.desc": "Intensidad de autoiluminacion",
        "shader_architect.uniform.uUseBaseColorMap": "Mapa Base",
        "shader_architect.uniform.uUseBaseColorMap.desc": "Usar textura de color base",
        "shader_architect.uniform.uUseMetallicRoughnessMap": "Mapa M/R",
        "shader_architect.uniform.uUseMetallicRoughnessMap.desc": "Usar textura metal/rugosidad",
        "shader_architect.uniform.uUseNormalMap": "Mapa Normal",
        "shader_architect.uniform.uUseNormalMap.desc": "Usar mapa normal",
        "shader_architect.uniform.uUseAOMap": "Mapa AO",
        "shader_architect.uniform.uUseAOMap.desc": "Usar mapa de oclusion",
        "shader_architect.uniform.uUseEmissiveMap": "Mapa Emit",
        "shader_architect.uniform.uUseEmissiveMap.desc": "Usar textura emisiva",
        "shader_architect.uniform.uUseClearcoatMap": "Mapa Barn",
        "shader_architect.uniform.uUseClearcoatMap.desc": "Usar textura de barniz",
        "shader_architect.uniform.uUseClearcoatRoughnessMap": "Mapa B Rug",
        "shader_architect.uniform.uUseClearcoatRoughnessMap.desc": "Usar rugosidad de barniz",
        "shader_architect.uniform.uUseAnisotropyMap": "Mapa Aniso",
        "shader_architect.uniform.uUseAnisotropyMap.desc": "Usar textura anisotropica",
        "shader_architect.uniform.uUseSheenColorMap": "Mapa Tela",
        "shader_architect.uniform.uUseSheenColorMap.desc": "Usar color de tela",
        "shader_architect.uniform.uUseSheenRoughnessMap": "Mapa T Rug",
        "shader_architect.uniform.uUseSheenRoughnessMap.desc": "Usar rugosidad de tela",
        "shader_architect.uniform.uUseTransmissionMap": "Mapa Trans",
        "shader_architect.uniform.uUseTransmissionMap.desc": "Usar textura de transmision",
        "shader_architect.uniform.uUseThicknessMap": "Mapa Grosor",
        "shader_architect.uniform.uUseThicknessMap.desc": "Usar textura de grosor",
        "shader_architect.uniform.uUseIridescenceMap": "Mapa Iris",
        "shader_architect.uniform.uUseIridescenceMap.desc": "Usar textura irisada",
        "shader_architect.uniform.uUseIridescenceThicknessMap": "Mapa I Gros",
        "shader_architect.uniform.uUseIridescenceThicknessMap.desc": "Usar grosor de irisado",
        "shader_architect.uniform.uNormalScale": "Normal",
        "shader_architect.uniform.uNormalScale.desc": "Fuerza del mapa normal",
        "shader_architect.uniform.uBaseColorMapScale": "Esc Base",
        "shader_architect.uniform.uBaseColorMapScale.desc": "Escala del mapa base",
        "shader_architect.uniform.uMetallicRoughnessMapScale": "Esc M/R",
        "shader_architect.uniform.uMetallicRoughnessMapScale.desc": "Escala del mapa metal/rugosidad",
        "shader_architect.uniform.uNormalMapScale": "Esc Normal",
        "shader_architect.uniform.uNormalMapScale.desc": "Escala del mapa normal",
        "shader_architect.uniform.uAOMapScale": "Esc AO",
        "shader_architect.uniform.uAOMapScale.desc": "Escala del mapa AO",
        "shader_architect.uniform.uEmissiveMapScale": "Esc Emit",
        "shader_architect.uniform.uEmissiveMapScale.desc": "Escala del mapa emisivo",
        "shader_architect.uniform.uClearcoatMapScale": "Esc Barniz",
        "shader_architect.uniform.uClearcoatMapScale.desc": "Escala del mapa de barniz",
        "shader_architect.uniform.uClearcoatRoughnessMapScale": "Esc B Rug",
        "shader_architect.uniform.uClearcoatRoughnessMapScale.desc": "Escala de rugosidad de barniz",
        "shader_architect.uniform.uAnisotropyMapScale": "Esc Aniso",
        "shader_architect.uniform.uAnisotropyMapScale.desc": "Escala del mapa anisotropico",
        "shader_architect.uniform.uSheenColorMapScale": "Esc Tela",
        "shader_architect.uniform.uSheenColorMapScale.desc": "Escala del color de tela",
        "shader_architect.uniform.uSheenRoughnessMapScale": "Esc T Rug",
        "shader_architect.uniform.uSheenRoughnessMapScale.desc": "Escala de rugosidad de tela",
        "shader_architect.uniform.uTransmissionMapScale": "Esc Trans",
        "shader_architect.uniform.uTransmissionMapScale.desc": "Escala del mapa de transmision",
        "shader_architect.uniform.uThicknessMapScale": "Esc Grosor",
        "shader_architect.uniform.uThicknessMapScale.desc": "Escala del mapa de grosor",
        "shader_architect.uniform.uIridescenceMapScale": "Esc Iris",
        "shader_architect.uniform.uIridescenceMapScale.desc": "Escala del mapa irisado",
        "shader_architect.uniform.uIridescenceThicknessMapScale": "Esc I Gros",
        "shader_architect.uniform.uIridescenceThicknessMapScale.desc": "Escala del grosor irisado",
        "shader_architect.uniform.uEnvSpecularStrength": "Brillo Env",
        "shader_architect.uniform.uEnvSpecularStrength.desc": "Fuerza del reflejo de entorno",
        "shader_architect.uniform.uSpecularIntensity": "Especular",
        "shader_architect.uniform.uSpecularIntensity.desc": "Fuerza del brillo especular",
        "shader_architect.uniform.uSSREnabled": "SSR",
        "shader_architect.uniform.uSSREnabled.desc": "Activa reflejos en pantalla",
        "shader_architect.uniform.uSSRIntensity": "Pot SSR",
        "shader_architect.uniform.uSSRIntensity.desc": "Que tan visible aparece la escena reflejada sobre el material",
        "shader_architect.uniform.uSSRRoughness": "Suave SSR",
        "shader_architect.uniform.uSSRRoughness.desc": "Que tan suave o borrosa aparece la escena reflejada",
        "shader_architect.uniform.uSSRThickness": "Prof SSR",
        "shader_architect.uniform.uSSRThickness.desc": "Tolerancia de profundidad del reflejo",
        "shader_architect.uniform.uSSRMaxDistance": "Rango SSR",
        "shader_architect.uniform.uSSRMaxDistance.desc": "Distancia maxima del reflejo",
        "shader_architect.uniform.uSSRDistortion": "Warp SSR",
        "shader_architect.uniform.uSSRDistortion.desc": "Distorsion animada del reflejo",
        "shader_architect.uniform.uSSRFresnelPower": "Pot Fresnel",
        "shader_architect.uniform.uSSRFresnelPower.desc": "Curva Fresnel del reflejo",
        "shader_architect.uniform.uSSRFresnelStrength": "Fresnel",
        "shader_architect.uniform.uSSRFresnelStrength.desc": "Influencia Fresnel",
        "shader_architect.uniform.uSSREdgeFade": "Borde SSR",
        "shader_architect.uniform.uSSREdgeFade.desc": "Desvanecido en bordes de pantalla",
        "shader_architect.uniform.uSSRDistanceFade": "Fade Rango",
        "shader_architect.uniform.uSSRDistanceFade.desc": "Desvanecido por distancia",
        "shader_architect.uniform.uSSRDepthBias": "Bias Prof",
        "shader_architect.uniform.uSSRDepthBias.desc": "Margen extra de profundidad",
        "shader_architect.uniform.uSSRQuality": "Calidad SSR",
        "shader_architect.uniform.uSSRQuality.desc": "Calidad del raymarch",
        "shader_architect.uniform.uSSRRenderScale": "Escala SSR",
        "shader_architect.uniform.uSSRRenderScale.desc": "Escala interna de captura",
        "shader_architect.uniform.uSSRFrameInterval": "Refresh SSR",
        "shader_architect.uniform.uSSRFrameInterval.desc": "Frecuencia de refresco del reflejo",
        "shader_architect.uniform.uExposure": "Brillo",
        "shader_architect.uniform.uExposure.desc": "Brillo general despues de calcular la luz",
        "shader_architect.uniform.uToneMapping": "Mapeo",
        "shader_architect.uniform.uToneMapping.desc": "Curva de color final",
        "shader_architect.uniform.uUseToneMapping": "Mapeo",
        "shader_architect.uniform.uUseToneMapping.desc": "Curva de color final",
        "shader_architect.uniform.uStylizedNormalInfluence": "Forma",
        "shader_architect.uniform.uStylizedNormalInfluence.desc": "Cuanto la iluminacion lateral estilo Blockbench moldea el material",
        "shader_architect.uniform.uLightWrap": "Luz suave",
        "shader_architect.uniform.uLightWrap.desc": "Permite que la luz envuelva bordes para un estilo mas suave",
        "shader_architect.uniform.uLightPos": "Posiciones de luz",
        "shader_architect.uniform.uLightPos.desc": "Posiciones mundiales de las luces de Light Manager",
        "shader_architect.uniform.uLightDir": "Direcciones de luz",
        "shader_architect.uniform.uLightDir.desc": "Vectores de direccion para luces direccionales y spot",
        "shader_architect.uniform.uLightIntensity": "Intensidad de luz",
        "shader_architect.uniform.uLightIntensity.desc": "Valores de intensidad por luz desde Light Manager",
        "shader_architect.uniform.uLightDistance": "Distancia de luz",
        "shader_architect.uniform.uLightDistance.desc": "Valores de caida por distancia para cada luz",
        "shader_architect.uniform.uLightConeAngle": "Cono de luz",
        "shader_architect.uniform.uLightConeAngle.desc": "Angulos de cono para luces spot",
        "shader_architect.uniform.uLightPenumbra": "Penumbra de luz",
        "shader_architect.uniform.uLightPenumbra.desc": "Suavidad del borde para luces spot",
        "shader_architect.uniform.uLightType": "Tipos de luz",
        "shader_architect.uniform.uLightType.desc": "IDs de tipo para luces point, spot y direccionales",
        "shader_architect.uniform.uLightColor": "Colores de luz",
        "shader_architect.uniform.uLightColor.desc": "Valores de color por luz desde Light Manager",
        "shader_architect.uniform.BEVEL_LIGHT_COLOR_STRENGTH": "Tinte Bisel",
        "shader_architect.uniform.BEVEL_LIGHT_COLOR_STRENGTH.desc": "Refuerza cuanto los colores de Light Manager tintan los highlights del bevel promocional",
        "shader_architect.uniform.BEVEL_ENABLED": "Bisel",
        "shader_architect.uniform.BEVEL_ENABLED.desc": "Activa el bisel promocional",
        "shader_architect.uniform.BEVEL_ALPHA_ENABLED": "Bisel Alfa",
        "shader_architect.uniform.BEVEL_ALPHA_ENABLED.desc": "Activa el bisel promocional en los bordes alfa de la textura",
        "shader_architect.uniform.BEVEL_WIDTH": "Ancho Bisel",
        "shader_architect.uniform.BEVEL_WIDTH.desc": "Ancho de la banda de bisel",
        "shader_architect.uniform.BEVEL_SOFTNESS": "Suave Bisel",
        "shader_architect.uniform.BEVEL_SOFTNESS.desc": "Suavidad del bisel",
        "shader_architect.uniform.BEVEL_SLOPE": "Pendiente",
        "shader_architect.uniform.BEVEL_SLOPE.desc": "Respuesta de pendiente del bisel",
        "shader_architect.uniform.BEVEL_HIGHLIGHT": "Brillo",
        "shader_architect.uniform.BEVEL_HIGHLIGHT.desc": "Fuerza del borde claro",
        "shader_architect.uniform.BEVEL_HIGHLIGHT_COLOR_INFLUENCE": "Tinte Br",
        "shader_architect.uniform.BEVEL_HIGHLIGHT_COLOR_INFLUENCE.desc": "Influencia de color en brillo de bisel",
        "shader_architect.uniform.BEVEL_LIGHT_STRENGTH": "Luz Clave",
        "shader_architect.uniform.BEVEL_LIGHT_STRENGTH.desc": "Fuerza de la luz principal",
        "shader_architect.uniform.BEVEL_SHADOW": "Sombra",
        "shader_architect.uniform.BEVEL_SHADOW.desc": "Fuerza del borde oscuro",
        "shader_architect.uniform.BEVEL_SHADOW_SATURATION": "Sat Sombra",
        "shader_architect.uniform.BEVEL_SHADOW_SATURATION.desc": "Saturacion de la sombra del bisel",
        "shader_architect.uniform.BEVEL_CORNER_FADE": "Esquina",
        "shader_architect.uniform.BEVEL_CORNER_FADE.desc": "Desvanecido cerca de esquinas",
        "shader_architect.uniform.BEVEL_GLOW_ENABLED": "Glow",
        "shader_architect.uniform.BEVEL_GLOW_ENABLED.desc": "Activa el brillo interior",
        "shader_architect.uniform.BEVEL_GLOW_SYNC_TO_PROMO_RIM": "Sync Glow",
        "shader_architect.uniform.BEVEL_GLOW_SYNC_TO_PROMO_RIM.desc": "Usa ajustes del rim para el glow",
        "shader_architect.uniform.BEVEL_GLOW_SYNC_DIRECTION": "Sync Glow Pantalla",
        "shader_architect.uniform.BEVEL_GLOW_SYNC_DIRECTION.desc": "Alinea el glow con la direccion 2D de la luz en pantalla (Sync con Rim)",
        "shader_architect.uniform.BEVEL_GLOW_REQUIRE_LIGHT_FACING": "Cull Cara Glow",
        "shader_architect.uniform.BEVEL_GLOW_REQUIRE_LIGHT_FACING.desc": "Oculta el glow en caras que no apuntan a la luz",
        "shader_architect.uniform.BEVEL_GLOW_FACE_THRESHOLD": "Cara Glow",
        "shader_architect.uniform.BEVEL_GLOW_FACE_THRESHOLD.desc": "Angulo de luz requerido para glow",
        "shader_architect.uniform.BEVEL_GLOW_WIDTH": "Ancho Glow",
        "shader_architect.uniform.BEVEL_GLOW_WIDTH.desc": "Ancho del brillo interior",
        "shader_architect.uniform.BEVEL_GLOW_SOFTNESS": "Suave Glow",
        "shader_architect.uniform.BEVEL_GLOW_SOFTNESS.desc": "Suavidad del brillo interior",
        "shader_architect.uniform.BEVEL_GLOW_CORNER_FADE": "Glow Esq",
        "shader_architect.uniform.BEVEL_GLOW_CORNER_FADE.desc": "Fade de glow en esquinas",
        "shader_architect.uniform.BEVEL_GLOW_INTENSITY": "Pot Glow",
        "shader_architect.uniform.BEVEL_GLOW_INTENSITY.desc": "Brillo del glow interior",
        "shader_architect.uniform.BEVEL_GLOW_COLOR_INFLUENCE": "Tinte Glow",
        "shader_architect.uniform.BEVEL_GLOW_COLOR_INFLUENCE.desc": "Influencia de color en glow",
        "shader_architect.uniform.OUTLINE_ELEMENT_ENABLED": "Linea Elem",
        "shader_architect.uniform.OUTLINE_ELEMENT_ENABLED.desc": "Activa borde por elemento",
        "shader_architect.uniform.OUTLINE_ALPHA_ENABLED": "Linea Alfa",
        "shader_architect.uniform.OUTLINE_ALPHA_ENABLED.desc": "Activa borde por alfa",
        "shader_architect.uniform.OUTLINE_ALPHA_CLAMP_TO_ELEMENT": "Clamp Alfa",
        "shader_architect.uniform.OUTLINE_ALPHA_CLAMP_TO_ELEMENT.desc": "Mantiene borde dentro del elemento",
        "shader_architect.uniform.OUTLINE_ALPHA_DIAGONAL_ONLY": "Solo Diag",
        "shader_architect.uniform.OUTLINE_ALPHA_DIAGONAL_ONLY.desc": "Limita el borde a diagonales",
        "shader_architect.uniform.OUTLINE_WIDTH": "Ancho Linea",
        "shader_architect.uniform.OUTLINE_WIDTH.desc": "Ancho del borde",
        "shader_architect.uniform.OUTLINE_COLOR": "Color Linea",
        "shader_architect.uniform.OUTLINE_COLOR.desc": "Color del borde",
        "shader_architect.uniform.OUTLINE_INTENSITY": "Pot Linea",
        "shader_architect.uniform.OUTLINE_INTENSITY.desc": "Brillo del borde",
        "shader_architect.uniform.OUTLINE_FADE": "Fade Linea",
        "shader_architect.uniform.OUTLINE_FADE.desc": "Suavidad del borde",
        "shader_architect.uniform.OUTLINE_MODE": "Modo Linea",
        "shader_architect.uniform.OUTLINE_MODE.desc": "Modo de mezcla del borde",
        "shader_architect.uniform.OUTLINE_AFFECTED_BY_LIGHT": "Linea Luz",
        "shader_architect.uniform.OUTLINE_AFFECTED_BY_LIGHT.desc": "Permite que la luz afecte el borde",
        "shader_architect.uniform.PROMO_RIM_ENABLED": "Rim",
        "shader_architect.uniform.PROMO_RIM_ENABLED.desc": "Activa la luz de silueta",
        "shader_architect.uniform.PROMO_RIM_WIDTH": "Ancho Rim",
        "shader_architect.uniform.PROMO_RIM_WIDTH.desc": "Ancho de la luz de silueta",
        "shader_architect.uniform.PROMO_RIM_INTENSITY": "Pot Rim",
        "shader_architect.uniform.PROMO_RIM_INTENSITY.desc": "Brillo de la luz de silueta",
        "shader_architect.uniform.PROMO_RIM_COLOR": "Color Rim",
        "shader_architect.uniform.PROMO_RIM_COLOR.desc": "Color fijo de la silueta",
        "shader_architect.uniform.PROMO_RIM_COLOR_MODE": "Modo Rim",
        "shader_architect.uniform.PROMO_RIM_COLOR_MODE.desc": "0 color fijo, 1 mezcla con luces, 2 usa color de luces",
        "shader_architect.uniform.PROMO_RIM_LIGHT_COLOR_INFLUENCE": "Luz Rim",
        "shader_architect.uniform.PROMO_RIM_LIGHT_COLOR_INFLUENCE.desc": "Cuanto afecta el color de Light Manager a la silueta promocional",
        "shader_architect.uniform.PROMO_RIM_DIRECTION": "Dir Rim",
        "shader_architect.uniform.PROMO_RIM_DIRECTION.desc": "Direccion de la luz rim",
        "shader_architect.uniform.PROMO_RIM_DIRECTION_SOFTNESS": "Suave Rim",
        "shader_architect.uniform.PROMO_RIM_DIRECTION_SOFTNESS.desc": "Suavidad de direccion rim",
        "shader_architect.uniform.PROMO_RIM_DIRECTIONALITY": "Foco Rim",
        "shader_architect.uniform.PROMO_RIM_DIRECTIONALITY.desc": "Foco direccional del rim",
        "shader_architect.uniform.PROMO_RIM_DEPTH_EPSILON": "Prof Rim",
        "shader_architect.uniform.PROMO_RIM_DEPTH_EPSILON.desc": "Tolerancia de profundidad del rim",
        "shader_architect.uniform.PROMO_RIM_OCCLUSION_ENABLED": "Ocl Rim",
        "shader_architect.uniform.PROMO_RIM_OCCLUSION_ENABLED.desc": "Oculta rim con geometria cercana",
        "shader_architect.uniform.PROMO_RIM_GROUP": "Grupo Rim",
        "shader_architect.uniform.PROMO_RIM_GROUP.desc": "Grupo de mascara para rim",
        "shader_architect.uniform.PROMO_RIM_TEXTURE_BLEND": "Rim Textura",
        "shader_architect.uniform.PROMO_RIM_TEXTURE_BLEND.desc": "Mezcla el color del rim con la textura del borde para conectar fluido con el glow interior",
        "shader_architect.uniform.PROMO_RIM_SCALE_WITH_ZOOM": "Zoom de Rim",
        "shader_architect.uniform.PROMO_RIM_SCALE_WITH_ZOOM.desc": "Escala el grosor del Rim segun la distancia de la camara (Tamano global constante)",
        "shader_architect.uniform.OUTLINE_CONSTANT_SCREEN_SIZE": "Linea en Pantalla",
        "shader_architect.uniform.OUTLINE_CONSTANT_SCREEN_SIZE.desc": "Mantiene el grosor de la linea de elemento constante en pixeles de la pantalla",
        "shader_architect.uniform.EDGE_FALLBACK_LIGHT_DIRECTION": "Luz Borde",
        "shader_architect.uniform.EDGE_FALLBACK_LIGHT_DIRECTION.desc": "Direccion alternativa para bordes",
        "shader_architect.uniform.uLightCastShadow": "Sombras por luz",
        "shader_architect.uniform.uLightCastShadow.desc": "Flags de sombras proyectadas por cada luz",
        "shader_architect.uniform.uLightShadowIndex": "Indices de sombra",
        "shader_architect.uniform.uLightShadowIndex.desc": "Indices de shadow map por luz",
        "shader_architect.uniform.uWorldNormalMatrix": "Matriz normal mundial",
        "shader_architect.uniform.uWorldNormalMatrix.desc": "Matriz de normales actualizada desde cada cubo renderizado",
        "shader_architect.uniform.uTime": "Tiempo",
        "shader_architect.uniform.uTime.desc": "Valor de tiempo animado actualizado en cada frame del preview",
        "shader_architect.uniform.uAOEnabled": "AO Contacto",
        "shader_architect.uniform.uAOEnabled.desc": "Activa sombras de contacto estilizadas",
        "shader_architect.uniform.uAOStrength": "Fuerza AO",
        "shader_architect.uniform.uAOStrength.desc": "Intensidad de las sombras de contacto",
        "shader_architect.uniform.uAORadius": "Radio AO",
        "shader_architect.uniform.uAORadius.desc": "Que tanto se extienden las sombras desde bordes y esquinas",
        "shader_architect.uniform.uAOPower": "Pot AO",
        "shader_architect.uniform.uAOPower.desc": "Curva de la oclusion",
        "shader_architect.uniform.uAOMin": "Min AO",
        "shader_architect.uniform.uAOMin.desc": "Brillo minimo de AO",
        "shader_architect.uniform.uAODirectInfluence": "AO Directa",
        "shader_architect.uniform.uAODirectInfluence.desc": "Cuanto afecta AO a luz directa",
        "shader_architect.uniform.uAOEdgeSharpness": "Borde AO",
        "shader_architect.uniform.uAOEdgeSharpness.desc": "Nitidez de AO en bordes",
        "shader_architect.uniform.uAOCornerWeight": "Esquina AO",
        "shader_architect.uniform.uAOCornerWeight.desc": "Fuerza de AO en esquinas",
        "shader_architect.uniform.uAOFaceNormalWeight": "Cara AO",
        "shader_architect.uniform.uAOFaceNormalWeight.desc": "AO segun normal de cara",
        "shader_architect.uniform.uClampLighting": "Limitar Luz",
        "shader_architect.uniform.uClampLighting.desc": "Evita que la luz se pase de rango",
        "shader_architect.uniform.AUTO_TILE": "Auto Tile",
        "shader_architect.uniform.AUTO_TILE.desc": "Ajusta repeticion por tamano de cara",
        "shader_architect.uniform.TILING": "Tile",
        "shader_architect.uniform.TILING.desc": "Repeticion manual de textura",
        "shader_architect.uniform.shadowPixelResolution": "Pixel",
        "shader_architect.uniform.shadowPixelResolution.desc": "Tamano del pixel de sombra",
        "shader_architect.uniform.shadowThreshold": "Corte",
        "shader_architect.uniform.shadowThreshold.desc": "Umbral de sombra pixelada",
        "shader_architect.uniform.uShadowStrength": "Sombra",
        "shader_architect.uniform.uShadowStrength.desc": "Intensidad de las sombras proyectadas",
        "shader_architect.uniform.uShadowFloor": "Min Sombra",
        "shader_architect.uniform.uShadowFloor.desc": "Brillo minimo dentro de las sombras",
        "shader_architect.uniform.AMBIENT_INTENSITY": "Int Amb",
        "shader_architect.uniform.AMBIENT_INTENSITY.desc": "Multiplicador de intensidad para la luz ambiente de la escena",
        "shader_architect.ui.toggle_left": "Alternar Biblioteca de Materiales (Ctrl+B)",
        "shader_architect.ui.toggle_right": "Alternar Barra Lateral de Propiedades",
        "shader_architect.ui.format": "Formatear Código GLSL (Shift+Alt+F)",
        "shader_architect.ui.validate": "Compilar y Vincular Shader (Ctrl+S)",
        "shader_architect.ui.apply": "Aplicar cambios en vivo a la escena",
        "shader_architect.ui.toggle_shadows": "Alternar soporte de sombras del material",
        "shader_architect.ui.toggle_reflections": "Alternar soporte de reflejos en espacio de pantalla",
        "shader_architect.toast.shadows_enabled": "Sombras del material activadas",
        "shader_architect.toast.shadows_disabled": "Sombras del material desactivadas",
        "shader_architect.toast.reflections_enabled": "Reflejos en espacio de pantalla activados",
        "shader_architect.toast.reflections_disabled": "Reflejos en espacio de pantalla desactivados",
        "shader_architect.ui.problems": "Problemas",
        "shader_architect.ui.no_problems": "No se detectaron problemas en el shader.",
        "shader_architect.ui.status_ok": "Listo",
        "shader_architect.ui.status_errors": "Errores detectados",
        "shader_architect.ui.tooltip.duplicate": "Duplicar este material",
        "shader_architect.ui.tooltip.export": "Exportar material a archivo .samat",
        "shader_architect.ui.tooltip.delete": "Eliminar este material",
    });

    /*function tl(key) {
        return Language.get(key) || key;
    }*/

    // =========================================================================
    // 2. CSS & PRISM.JS SYNTAX HIGHLIGHTING
    // =========================================================================
    const PLUGIN_STYLE_ID = 'shader-architect-styles';
    const PROJECT_MATERIAL_INSTANCES_PROP = 'sa_material_instances_json';
    const MATERIAL_INSTANCES_UNDO_ASPECT = 'sa_material_instances';
    const GLOBAL_MATERIAL_LIST_EVENT = 'update_global_material_list';
    const FACE_MATERIAL_INSTANCES_PROP = 'sa_face_material_instance_ids';
    const CUBE_FACE_NAMES = ['north', 'south', 'east', 'west', 'up', 'down'];
    const MATERIAL_SLOT_FACE_ORDER = ['east', 'west', 'up', 'down', 'south', 'north'];
    const SCREEN_SPACE_REFLECTION_TARGET_MAX_SIZE = 960;
    const MATERIAL_UNIFORM_GROUP_FORM_PREFIX = '_sa_uniform_group_';
    const ANIMATION_SYSTEM_UNIFORM_KEYS = ['SHADE', 'LIGHTSIDE', 'LIGHTCOLOR', 'uAmbientColor', 'uAmbient', 'EMISSIVE', 'TEXTURE_SIZE'];
    const MATERIAL_UNIFORM_GROUPS = {
        core: { label: 'shader_architect.uniform_group.core', icon: 'tune', order: 10, defaultOpen: true },
        texture: { label: 'shader_architect.uniform_group.texture', icon: 'texture', order: 20, defaultOpen: true },
        surface: { label: 'shader_architect.uniform_group.surface', icon: 'deblur', order: 30, defaultOpen: true },
        lighting: { label: 'shader_architect.uniform_group.lighting', icon: 'lightbulb', order: 40, defaultOpen: true },
        ao: { label: 'shader_architect.uniform_group.ao', icon: 'grain', order: 50, defaultOpen: false },
        shadows: { label: 'shader_architect.uniform_group.shadows', icon: 'ev_shadow', order: 60, defaultOpen: false },
        reflections: { label: 'shader_architect.uniform_group.reflections', icon: 'water_drop', order: 70, defaultOpen: false },
        bevel: { label: 'shader_architect.uniform_group.bevel', icon: 'auto_awesome', order: 80, defaultOpen: false },
        outline: { label: 'shader_architect.uniform_group.outline', icon: 'border_style', order: 90, defaultOpen: false },
        rim: { label: 'shader_architect.uniform_group.rim', icon: 'flare', order: 100, defaultOpen: false },
        technical: { label: 'shader_architect.uniform_group.technical', icon: 'memory', order: 900, defaultOpen: false }
    };
    const BLOCKBENCH_LAYERED_TEXTURE_FRAGMENT = `
uniform bool saLayeredTextureEnabled;
uniform sampler2D saLayeredTexture0;
uniform sampler2D saLayeredTexture1;
uniform sampler2D saLayeredTexture2;

vec4 saSampleBlockbenchLayeredTexture(vec2 uv) {
    vec4 Ca = texture2D(saLayeredTexture0, uv);
    vec4 Cb = texture2D(saLayeredTexture1, uv);
    vec4 Cc = texture2D(saLayeredTexture2, uv);

    vec3 ctemp = Ca.rgb * Ca.a + Cb.rgb * Cb.a * (1.0 - Ca.a);
    vec4 ctemp4 = vec4(ctemp, Ca.a + (1.0 - Ca.a) * Cb.a);
    vec3 color = ctemp4.rgb + Cc.rgb * Cc.a * (1.0 - ctemp4.a);
    float alpha = ctemp4.a + (1.0 - ctemp4.a) * Cc.a;

    if (alpha < 0.05) {
        alpha = 0.0;
    }

    return vec4(color, alpha);
}

vec4 saSampleBaseMap(vec2 uv) {
    return saLayeredTextureEnabled
        ? saSampleBlockbenchLayeredTexture(uv)
        : texture2D(map, uv);
}
`;

    function injectBlockbenchLayeredTextureFragment(fragmentShader) {
        return String(fragmentShader || '').replace(
            /uniform\s+sampler2D\s+map\s*;/,
            match => `${match}\n${BLOCKBENCH_LAYERED_TEXTURE_FRAGMENT}`
        );
    }

    function cloneUniformValue(value) {
        if (value && typeof value.clone === 'function') return value.clone();
        if (Array.isArray(value)) return value.map(v => cloneUniformValue(v));
        if (value && typeof value === 'object') return Object.assign({}, value);
        return value;
    }

    function cloneUniformDefinition(def) {
        const clone = {};
        for (const key in def) {
            if (key === 'value') continue;
            clone[key] = cloneUniformValue(def[key]);
        }
        clone.value = cloneUniformValue(def.value);
        if (clone.advanced === undefined) clone.advanced = false;
        return clone;
    }

    function isColorUniformDefinition(def) {
        return !!def && (def.is_color === true || def.type === 'color');
    }

    function vectorToColorHex(value, fallback = '#ffffff') {
        if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
            return value;
        }
        if (value && value.isColor && typeof value.getHexString === 'function') {
            return '#' + value.getHexString();
        }
        if (!value || value.x === undefined || value.y === undefined || value.z === undefined) {
            return fallback;
        }
        const channelToHex = (channel) => {
            const normalized = Math.max(0, Math.min(1, Number(channel) || 0));
            return Math.round(normalized * 255).toString(16).padStart(2, '0');
        };
        return '#' + channelToHex(value.x) + channelToHex(value.y) + channelToHex(value.z);
    }

    function colorHexToVector(hex, targetValue, dimensions = 3) {
        const color = new THREE.Color(hex || '#ffffff');
        if (dimensions === 4) {
            const alpha = targetValue && Number.isFinite(Number(targetValue.w))
                ? Number(targetValue.w)
                : 1.0;
            return new THREE.Vector4(color.r, color.g, color.b, alpha);
        }
        return new THREE.Vector3(color.r, color.g, color.b);
    }

    function getUniformColorHex(def, fallback = '#ffffff') {
        if (!def) return fallback;
        if (def.hexValue) return def.hexValue;
        return vectorToColorHex(def.value, fallback);
    }

    function syncColorUniformValue(def, hex) {
        if (!def) return def;
        const nextHex = hex || getUniformColorHex(def);
        def.hexValue = nextHex;
        if (def.type === 'vec4') {
            def.value = colorHexToVector(nextHex, def.value, 4);
        } else {
            def.value = colorHexToVector(nextHex, def.value, 3);
        }
        return def;
    }

    function normalizeUniformGroupId(groupId) {
        const key = String(groupId || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
        return key && MATERIAL_UNIFORM_GROUPS[key] ? key : 'core';
    }

    function getUniformGroupDefinition(groupId) {
        const key = normalizeUniformGroupId(groupId);
        return Object.assign({ id: key }, MATERIAL_UNIFORM_GROUPS[key] || MATERIAL_UNIFORM_GROUPS.core);
    }

    function getUniformGroupFormKey(groupId) {
        return MATERIAL_UNIFORM_GROUP_FORM_PREFIX + normalizeUniformGroupId(groupId);
    }

    function isUniformGroupFormKey(key) {
        return typeof key === 'string' && key.indexOf(MATERIAL_UNIFORM_GROUP_FORM_PREFIX) === 0;
    }

    function getUniformGroupIdFromFormKey(key) {
        return normalizeUniformGroupId(String(key || '').slice(MATERIAL_UNIFORM_GROUP_FORM_PREFIX.length));
    }

    function resolveUniformGroupId(name, def) {
        if (def && (def.group || def.folder || def.category)) {
            return normalizeUniformGroupId(def.group || def.folder || def.category);
        }

        if (/^uSSR/.test(name)) return 'reflections';
        if (/^(BEVEL_|EDGE_FALLBACK_LIGHT_DIRECTION)/.test(name)) return 'bevel';
        if (/^OUTLINE_/.test(name)) return 'outline';
        if (/^PROMO_RIM_/.test(name)) return 'rim';
        if (/^(uShadow|shadowPixelResolution|shadowThreshold)/.test(name)) return 'shadows';
        if (/^uAO/.test(name)) return 'ao';
        if (name === 'map' || name === 'AUTO_TILE' || name === 'TILING' || /Map|TEXTURE_SIZE/.test(name)) {
            return 'texture';
        }
        if (/^(uLight|LIGHTCOLOR|LIGHTSIDE|SHADE|max_light_number|uAmbient|uExposure|uToneMapping|uStylizedNormalInfluence|uLightWrap|uClampLighting)/.test(name)) {
            return 'lighting';
        }
        if (/^(uBaseColor|uMetallic|uRoughness|uClearcoat|uAnisotropy|uSheen|uTransmission|uThickness|uAttenuation|uIOR|uIridescence|uEmissive|uNormalScale|EMISSIVE|uAO$)/.test(name)) {
            return 'surface';
        }
        if (def && def.advanced) return 'technical';

        return 'core';
    }

    function createScreenSpaceReflectionUniforms(options = {}) {
        const valueFor = (name, fallback) => {
            if (options[name] !== undefined) return options[name];
            const alias = name.replace(/^uSSR/, '');
            const lowerAlias = alias.charAt(0).toLowerCase() + alias.slice(1);
            return options[lowerAlias] !== undefined ? options[lowerAlias] : fallback;
        };
        const exposeMain = valueFor('uSSRExposeMain', true) !== false;
        const exposeAdvanced = valueFor('uSSRExposeAdvanced', true) !== false;
        const exposePerformance = valueFor('uSSRExposePerformance', exposeAdvanced) !== false;

        const uniforms = {
            uSSREnabled: { type: 'bool', value: !!valueFor('uSSREnabled', false), expose: exposeMain, advanced: false },
            uSSRIntensity: { type: 'float', value: valueFor('uSSRIntensity', 0.75), expose: exposeMain, advanced: false, min: 0.0, max: 1.0, step: 0.05, allow_higher: true, allow_lower: false },
            uSSRRoughness: { type: 'float', value: valueFor('uSSRRoughness', 0.18), expose: exposeMain, advanced: false, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
            uSSRThickness: { type: 'float', value: valueFor('uSSRThickness', 0.12), expose: exposeAdvanced, advanced: true, min: 0.01, max: 4.0, step: 0.01, allow_higher: true, allow_lower: false },
            uSSRMaxDistance: { type: 'float', value: valueFor('uSSRMaxDistance', 32.0), expose: exposeAdvanced, advanced: true, min: 1.0, max: 256.0, step: 1.0, allow_higher: true, allow_lower: false },
            uSSRDistortion: { type: 'float', value: valueFor('uSSRDistortion', 0.04), expose: exposeAdvanced, advanced: true, min: 0.0, max: 0.5, step: 0.01, allow_higher: false, allow_lower: false },
            uSSRFresnelPower: { type: 'float', value: valueFor('uSSRFresnelPower', 1.55), expose: exposeAdvanced, advanced: true, min: 0.1, max: 8.0, step: 0.05, allow_higher: true, allow_lower: false },
            uSSRFresnelStrength: { type: 'float', value: valueFor('uSSRFresnelStrength', 0.45), expose: exposeAdvanced, advanced: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
            uSSREdgeFade: { type: 'float', value: valueFor('uSSREdgeFade', 0.08), expose: exposeAdvanced, advanced: true, min: 0.0, max: 0.25, step: 0.01, allow_higher: true, allow_lower: false },
            uSSRDistanceFade: { type: 'float', value: valueFor('uSSRDistanceFade', 0.45), expose: exposeAdvanced, advanced: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
            uSSRDepthBias: { type: 'float', value: valueFor('uSSRDepthBias', 0.035), expose: exposeAdvanced, advanced: true, min: 0.0, max: 0.25, step: 0.005, allow_higher: true, allow_lower: false },
            uSSRQuality: { type: 'float', value: valueFor('uSSRQuality', 0.55), expose: exposePerformance, advanced: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
            uSSRRenderScale: { type: 'float', value: valueFor('uSSRRenderScale', 0.72), expose: exposePerformance, advanced: true, min: 0.25, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
            uSSRFrameInterval: { type: 'float', value: valueFor('uSSRFrameInterval', 1.0), expose: exposePerformance, advanced: true, min: 1.0, max: 4.0, step: 1.0, allow_higher: false, allow_lower: false }
        };

        const cloned = {};
        for (const key in uniforms) {
            cloned[key] = cloneUniformDefinition(uniforms[key]);
        }
        return cloned;
    }

    function addScreenSpaceReflectionUniforms(uniforms, options = {}) {
        const target = uniforms || {};
        const defaults = createScreenSpaceReflectionUniforms(options);
        for (const key in defaults) {
            if (!target[key]) {
                target[key] = defaults[key];
            }
        }
        return target;
    }

    function createMaterialLightingUniforms() {
        return {
            max_light_number: { type: 'int', value: 0, expose: true, min: 0, max: 16, step: 1, allow_higher: false, allow_lower: false },
            uAmbient: { type: 'float', value: 0.3, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: true, allow_lower: false },
            uAmbientColor: { type: 'vec3', value: new THREE.Vector3(1, 1, 1), hexValue: '#ffffff', expose: true, is_color: true },
            uShadowStrength: { type: 'float', value: 1.0, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
            uShadowFloor: { type: 'float', value: 0.0, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
            LIGHTCOLOR: { type: 'vec3', value: new THREE.Vector3(1, 1, 1), hexValue: '#ffffff', expose: true, is_color: true },
            uLightPos: { type: 'vec3v', value: Array.from({ length: 16 }, () => new THREE.Vector3()), expose: false },
            uLightDir: { type: 'vec3v', value: Array.from({ length: 16 }, () => new THREE.Vector3(0, -1, 0)), expose: false },
            uLightIntensity: { type: 'floatv', value: Array(16).fill(0.0), expose: false },
            uLightDistance: { type: 'floatv', value: Array(16).fill(0.0), expose: false },
            uLightConeAngle: { type: 'floatv', value: Array(16).fill(0.0), expose: false },
            uLightPenumbra: { type: 'floatv', value: Array(16).fill(0.0), expose: false },
            uLightType: { type: 'intv', value: Array(16).fill(0), expose: false },
            uLightColor: { type: 'vec3v', value: Array.from({ length: 16 }, () => new THREE.Vector3()), expose: false },
            uLightCastShadow: { type: 'intv', value: Array(16).fill(0), expose: false },
            uLightShadowIndex: { type: 'intv', value: Array(16).fill(-1), expose: false },
            uWorldNormalMatrix: { type: 'mat3', value: new THREE.Matrix3(), expose: false },
            TEXTURE_SIZE: { type: 'vec2', value: new THREE.Vector2(16, 16), expose: false }
        };
    }

    function createNativeMaterialUniforms() {
        return Object.assign(createMaterialLightingUniforms(), {
            SHADE: { type: 'bool', value: true, expose: true },
            LIGHTSIDE: { type: 'int', value: 0, expose: true, min: 0, max: 5, step: 1, allow_higher: false, allow_lower: false },
            EMISSIVE: { type: 'bool', value: false, expose: true },
            uTime: { type: 'float', value: 0.0, expose: false },
            uClampLighting: { type: 'bool', value: false, expose: true, advanced: true },
            uExposure: { type: 'float', value: 1.0, expose: true, min: 0.0, max: 5.0, step: 0.1, allow_higher: true, allow_lower: false },
            uToneMapping: { type: 'int', value: 0, expose: true, advanced: true, min: 0, max: 5, step: 1, allow_higher: false, allow_lower: false },
            uStylizedNormalInfluence: { type: 'float', value: 0.0, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
            uLightWrap: { type: 'float', value: 0.0, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
            uAOEnabled: { type: 'bool', value: true, expose: true },
            uAOStrength: { type: 'float', value: 0.5, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
            uAORadius: { type: 'float', value: 0.12, expose: true, min: 0.0, max: 2.0, step: 0.01, allow_higher: true, allow_lower: false },
            uAOPower: { type: 'float', value: 1.5, expose: true, advanced: true, min: 0.1, max: 5.0, step: 0.1, allow_higher: true, allow_lower: false },
            uAOMin: { type: 'float', value: 0.4, expose: true, advanced: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
            uAODirectInfluence: { type: 'float', value: 0.15, expose: true, advanced: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
            uAOEdgeSharpness: { type: 'float', value: 8.0, expose: true, advanced: true, min: 0.0, max: 16.0, step: 0.5, allow_higher: true, allow_lower: false },
            uAOCornerWeight: { type: 'float', value: 1.5, expose: true, advanced: true, min: 0.0, max: 5.0, step: 0.1, allow_higher: true, allow_lower: false },
            uAOFaceNormalWeight: { type: 'float', value: 0.3, expose: true, advanced: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
            AUTO_TILE: { type: 'bool', value: false, expose: true },
            TILING: { type: 'vec2', value: new THREE.Vector2(1, 1), expose: true, min: 0.1, max: 10.0, step: 0.1 }
        });
    }

    function addMaterialLightingUniforms(uniforms) {
        const target = uniforms || {};
        const defaults = createMaterialLightingUniforms();
        for (const key in defaults) {
            if (!target[key]) {
                target[key] = cloneUniformDefinition(defaults[key]);
            }
        }
        return target;
    }

    const SCREEN_SPACE_REFLECTIONS_PARS_FRAGMENT = `
#define SA_SSR_STEPS 56

uniform sampler2D uSA_SSRScene;
uniform sampler2D uSA_SSRDepth;
uniform int uSA_SSRHasDepth;
uniform vec2 uSA_SSRResolution;
uniform float uSA_SSRCameraNear;
uniform float uSA_SSRCameraFar;
uniform int uSA_SSRCameraIsPerspective;
uniform mat4 uSA_SSRCameraProjectionMatrix;
uniform float uSA_SSRTime;

uniform bool uSSREnabled;
uniform float uSSRIntensity;
uniform float uSSRRoughness;
uniform float uSSRThickness;
uniform float uSSRMaxDistance;
uniform float uSSRDistortion;
uniform float uSSRFresnelPower;
uniform float uSSRFresnelStrength;
uniform float uSSREdgeFade;
uniform float uSSRDistanceFade;
uniform float uSSRDepthBias;
uniform float uSSRQuality;

varying vec3 vSA_SSRViewPosition;
varying vec3 vSA_SSRViewNormal;
varying vec4 vSA_SSRClipPosition;

float saSSRScreenEdgeFade(vec2 uv) {
    float fadeWidth = max(uSSREdgeFade, 0.0001);
    vec2 edge = smoothstep(vec2(0.0), vec2(fadeWidth), uv) *
        smoothstep(vec2(0.0), vec2(fadeWidth), 1.0 - uv);
    return edge.x * edge.y;
}

bool saSSROutsideScreen(vec2 uv) {
    return uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0;
}

float saSSRPerspectiveDepthToViewZ(float depth) {
    return (uSA_SSRCameraNear * uSA_SSRCameraFar) /
        ((uSA_SSRCameraFar - uSA_SSRCameraNear) * depth - uSA_SSRCameraFar);
}

float saSSROrthographicDepthToViewZ(float depth) {
    return depth * (uSA_SSRCameraNear - uSA_SSRCameraFar) - uSA_SSRCameraNear;
}

float saSSRDepthToViewZ(float depth) {
    if (uSA_SSRCameraIsPerspective == 1) return saSSRPerspectiveDepthToViewZ(depth);
    return saSSROrthographicDepthToViewZ(depth);
}

vec3 saSSRSampleScene(vec2 uv, float roughness) {
    float radius = 1.0 + clamp(roughness, 0.0, 1.0) * 7.0;
    vec2 px = radius / max(uSA_SSRResolution, vec2(1.0));
    vec3 color = texture2D(uSA_SSRScene, uv).rgb * 0.48;
    color += texture2D(uSA_SSRScene, uv + vec2(px.x, 0.0)).rgb * 0.13;
    color += texture2D(uSA_SSRScene, uv - vec2(px.x, 0.0)).rgb * 0.13;
    color += texture2D(uSA_SSRScene, uv + vec2(0.0, px.y)).rgb * 0.13;
    color += texture2D(uSA_SSRScene, uv - vec2(0.0, px.y)).rgb * 0.13;
    return color;
}

vec3 saSSRFallbackReflection(vec4 clipPosition, vec3 rayDir, float roughness, out float hitFade) {
    vec2 screenUv = (clipPosition.xy / max(clipPosition.w, 0.0001)) * 0.5 + 0.5;
    vec2 uv = screenUv + rayDir.xy * clamp(uSSRDistortion, 0.0, 0.5) / max(0.35, abs(rayDir.z));
    hitFade = saSSRScreenEdgeFade(uv);
    if (saSSROutsideScreen(uv)) hitFade = 0.0;
    return saSSRSampleScene(uv, roughness);
}

vec3 saSSRRaymarch(vec3 viewPosition, vec3 rayDir, vec4 clipPosition, float roughness, out float hitFade) {
    hitFade = 0.0;

    if (uSA_SSRHasDepth != 1) {
        return saSSRFallbackReflection(clipPosition, rayDir, roughness, hitFade);
    }

    vec2 hitUv = vec2(0.0);
    float hitDistance = 0.0;
    float maxDistance = max(uSSRMaxDistance, 1.0);
    float startDistance = max(0.025, maxDistance * 0.002);
    float qualitySteps = mix(12.0, float(SA_SSR_STEPS), clamp(uSSRQuality, 0.0, 1.0));

    for (int i = 0; i < SA_SSR_STEPS; i++) {
        if (float(i) >= qualitySteps) break;

        float stepRatio = (float(i) + 1.0) / qualitySteps;
        float rayDistance = mix(startDistance, maxDistance, stepRatio * stepRatio);
        vec3 rayPosition = viewPosition + rayDir * rayDistance;

        if (rayPosition.z > -uSA_SSRCameraNear) break;

        vec4 rayClip = uSA_SSRCameraProjectionMatrix * vec4(rayPosition, 1.0);
        if (rayClip.w <= 0.0) break;

        vec2 uv = (rayClip.xy / rayClip.w) * 0.5 + 0.5;
        if (saSSROutsideScreen(uv)) break;

        float sceneDepth = texture2D(uSA_SSRDepth, uv).x;
        if (sceneDepth >= 0.9999) continue;

        float sceneViewZ = saSSRDepthToViewZ(sceneDepth);
        float depthDelta = rayPosition.z - sceneViewZ;
        float thickness = max(uSSRThickness, 0.001) + rayDistance * max(uSSRDepthBias, 0.0);

        if (depthDelta <= 0.0 && depthDelta > -thickness) {
            vec2 wave = vec2(
                sin((uv.y + uSA_SSRTime * 0.09) * 90.0),
                cos((uv.x - uSA_SSRTime * 0.07) * 70.0)
            ) * clamp(uSSRDistortion, 0.0, 0.5) * 0.012;

            hitUv = uv + wave;
            hitDistance = rayDistance;

            float fadeStart = clamp(uSSRDistanceFade, 0.0, 1.0) * maxDistance;
            hitFade = saSSRScreenEdgeFade(hitUv) *
                (1.0 - smoothstep(fadeStart, maxDistance, hitDistance));
            break;
        }
    }

    if (hitFade <= 0.0 || saSSROutsideScreen(hitUv)) return vec3(0.0);
    return saSSRSampleScene(hitUv, roughness);
}

vec4 saApplyScreenSpaceReflection(vec4 sourceColor, vec3 viewNormal, vec3 viewPosition, vec4 clipPosition, float materialRoughness, float materialIntensity) {
    if (!uSSREnabled || uSSRIntensity <= 0.0 || sourceColor.a <= 0.0) return sourceColor;

    vec3 normal = normalize(viewNormal);
    if (!gl_FrontFacing) normal *= -1.0;

    vec3 viewIncident = normalize(viewPosition);
    vec3 rayDir = normalize(reflect(viewIncident, normal));
    float roughness = clamp(max(uSSRRoughness, materialRoughness), 0.0, 1.0);

    float hitFade = 0.0;
    vec3 reflected = saSSRRaymarch(viewPosition, rayDir, clipPosition, roughness, hitFade);

    float viewFacing = clamp(1.0 - abs(dot(normal, -viewIncident)), 0.0, 1.0);
    float fresnel = pow(viewFacing, max(uSSRFresnelPower, 0.001));
    float reflectAmount = max(uSSRIntensity, 0.0) * max(materialIntensity, 0.0) * hitFade;
    reflectAmount *= mix(1.0, fresnel, clamp(uSSRFresnelStrength, 0.0, 1.0));
    reflectAmount *= 1.0 - clamp(roughness * 0.78, 0.0, 0.78);

    sourceColor.rgb = mix(sourceColor.rgb, reflected, clamp(reflectAmount, 0.0, 1.0));
    return sourceColor;
}
`;
    const pluginStyle = /*css*/`
    /* Dialog Layout Restructuring for fixed window with internal scrollbars */
    #sa_material_studio_dialog {
        display: flex !important;
        flex-direction: column !important;
    }
    #sa_material_studio_dialog .dialog_wrapper {
        flex-grow: 1 !important;
        display: flex !important;
        flex-direction: column !important;
        min-height: 0 !important;
        width: 100% !important;
    }
    #sa_material_studio_dialog .dialog_content {
        background: var(--color-back);
        color: var(--color-text);
        padding: 0px !important;
        flex-grow: 1 !important;  /* Replaces height: 100%. */
        min-height: 0 !important; /* Required for the internal scroll area. */
        display: flex;
        flex-direction: column;
        overflow: hidden !important;
    }

    .sa-studio-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        background: var(--color-back);
        color: var(--color-text);
        overflow: hidden;
    }

    .sa-studio-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: var(--color-ui);
        border-bottom: 1px solid var(--color-border);
        height: 48px;
        box-sizing: border-box;
    }

    .sa-studio-body {
        display: flex;
        flex-grow: 1;
        height: calc(100% - 72px); /* height minus header and status bar */
        width: 100%;
        overflow: hidden;
        position: relative;
    }

    .sa-studio-sidebar {
        width: 280px;
        background: var(--color-ui);
        display: flex;
        flex-direction: column;
        transition: width 0.15s ease, padding 0.15s ease, border 0.15s ease;
        overflow-y: auto;
        overflow-x: hidden;
        box-sizing: border-box;
        flex-shrink: 0;
    }

    .sa-studio-sidebar.sa-left {
        border-right: 1px solid var(--color-border);
    }

    .sa-studio-sidebar.sa-right {
        border-left: 1px solid var(--color-border);
    }

    .sa-studio-sidebar.collapsed {
        width: 0px !important;
        padding: 0px !important;
        border: none !important;
        overflow: hidden;
    }

    .sa-studio-main {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0 !important;
        overflow: hidden;
        background: var(--color-back);
    }

    /* Prism Editor Custom CSS styling */
    .prism-editor-wrapper {
        display: flex !important;
        flex-direction: row !important;
        align-items: stretch !important;
        flex-grow: 1 !important; /* Fill the available flex space */
        min-height: 0 !important; /* Prevent hidden overflow */
        width: 100% !important;
        overflow: auto !important;
        position: relative !important;
        background: var(--color-back);
        box-sizing: border-box;
        tab-size: 4;
    }
    .prism-editor__container {
        position: relative !important;
        flex-grow: 1 !important;
        min-height: max-content !important; /* Allow the container to grow with scroll content */
        height: auto !important;
        box-sizing: border-box;
        overflow: visible !important;
    }
    .prism-editor__textarea, .prism-editor__pre {
        margin: 0 !important;
        border: 0 !important;
        padding: 10px 10px 10px 10px !important;
        box-sizing: border-box !important;
        font-family: 'Consolas', 'Courier New', monospace !important;
        font-size: 13px !important;
        line-height: 20px !important;
        tab-size: 4 !important;
        white-space: pre !important;
        word-wrap: normal !important;
        overflow: visible !important;
    }
    .prism-editor__textarea {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        height: 100% !important;
        width: 100% !important;
        min-height: 100% !important;
        min-width: 100% !important;
        resize: none !important;
        color: transparent !important;
        background: transparent !important;
        caret-color: #ffffff !important;
        z-index: 2 !important;
        outline: none !important;
        overflow: hidden !important;
    }
    .prism-editor__pre {
        position: relative !important;
        z-index: 1 !important;
        pointer-events: none !important;
        display: block !important;
        margin: 0 !important;
    }
    .prism-editor__line-numbers {
        height: auto !important;
        min-height: max-content !important; /* Prevent line numbers from being clipped while scrolling */
        overflow: hidden !important;
        flex-shrink: 0 !important;
        padding: 10px 8px 10px 8px !important;
        box-sizing: border-box !important;
        background: #181818 !important;
        color: #858585 !important;
        border-right: 1px solid #2d2d2d !important;
        user-select: none !important;
        text-align: right;
    }
    .prism-editor__line-number {
        font-family: 'Consolas', 'Courier New', monospace !important;
        font-size: 13px !important;
        line-height: 20px !important;
        white-space: nowrap;
        opacity: 0.7;
    }
    .prism-editor__textarea::selection,
    .prism-editor__pre::selection,
    .prism-editor__pre *::selection {
        background: color-mix(in srgb, var(--color-accent) 30%, transparent) !important;
    }

    /* Code Area */
    code[class*="language-"], pre[class*="language-"] {
        color: var(--color-text); background: none; font-family: var(--font-code, monospace);
        font-size: 1em; text-align: left; white-space: pre; line-height: 1.5; cursor: text;
    }

    /* Syntax Highlighting Colors */
    .token.comment, .token.prolog, .token.doctype, .token.cdata { color: slategray; font-style: italic; opacity: 0.85; }
    .token.punctuation { color: #b2d0dd; }
    .token.property, .token.tag, .token.symbol, .token.deleted, .token.attr-name { color: #fc2f40; }
    .token.constant { color: #ffb86c; }
    .token.boolean { color: rgb(159, 255, 156); }
    .token.number { color: #bd93f9; }
    .token.string, .token.char { color: #f1fa8c; }
    .token.operator{ color: #ff79c6; }
    .token.keyword { color: #8be9fd; }
    .token.builtin { color: #50fa7b; }
    .token.builtin-variable { color: #ffb86c; font-weight: bold; }
    .token.function, .token.function-name { color: #ffb86c; }
    .token.class-name { color: #8be9fd; font-weight: bold; }
    .token.important { color: #ff5555; font-weight: bold; }

    /* VSCode Tabs Bar styling */
    .sa-vscode-tabs-row {
        display: flex;
        align-items: center;
        background: var(--color-ui);
        border-bottom: 1px solid var(--color-border);
        height: 38px;
        box-sizing: border-box;
        overflow-x: auto;
        overflow-y: hidden;
    }
    .sa-vscode-tab {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 16px;
        height: 100%;
        background: var(--color-ui);
        border: none;
        border-right: 1px solid var(--color-border);
        color: var(--color-text);
        opacity: 0.65;
        cursor: pointer;
        font-size: 0.9em;
        transition: background 0.15s, opacity 0.15s;
        user-select: none;
        border-bottom: 2px solid transparent;
        font-weight: 500;
    }
    .sa-vscode-tab:hover {
        background: rgba(255, 255, 255, 0.05);
        opacity: 0.9;
    }
    .sa-vscode-tab.active {
        background: var(--color-back);
        border-bottom: 2px solid var(--color-accent);
        opacity: 1;
        font-weight: bold;
    }

    .sa-editor-actions-toolbar {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: auto;
        padding-right: 8px;
    }

    .sa-editor-container {
        flex-grow: 1;
        position: relative;
        overflow: hidden;
        background: #1e1e1e;
        display: flex;
        flex-direction: column;
        min-height: 0 !important;
    }

    .sa-editor-scrollable {
        flex-grow: 1;
        overflow: auto;
        height: 100%;
        width: 100%;
        position: relative;
    }

    .glsl-editor-instance {
        font-family: 'Consolas', 'Courier New', monospace;
        font-size: 13px;
        line-height: 20px;
        /* Let Flexbox control the editor size instead of forcing height: 100% */
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        min-height: 0 !important;
    }

    .glsl-editor-instance textarea {
        outline: none;
        caret-color: #ffffff;
        font-family: inherit;
        font-size: inherit;
        line-height: inherit;
    }

    /* Autocomplete Dropdown styling */
    .sa-autocomplete-dropdown {
        position: absolute;
        background: #282a36;
        border: 1px solid var(--color-border);
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        z-index: 100000;
        max-height: 260px;
        overflow-y: auto;
        width: 380px;
        pointer-events: auto;
    }
    .sa-autocomplete-item {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        padding: 7px 10px;
        cursor: pointer;
        font-family: 'Consolas', monospace;
        font-size: 12px;
        color: #f8f8f2;
        user-select: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }
    .sa-autocomplete-item:hover, .sa-autocomplete-item.active {
        background: var(--color-accent);
        color: var(--color-accent_text);
    }
    .sa-autocomplete-main {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .sa-autocomplete-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
    }
    .sa-autocomplete-signature {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        opacity: 0.72;
        font-size: 0.9em;
    }
    .sa-autocomplete-meta {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        min-width: 0;
    }
    .sa-autocomplete-return {
        max-width: 92px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        opacity: 0.82;
        font-size: 0.86em;
    }
    .sa-autocomplete-item .type-badge {
        font-size: 0.8em;
        opacity: 0.8;
        padding: 1px 4px;
        border-radius: 3px;
        background: rgba(255, 255, 255, 0.15);
        color: #f8f8f2;
    }
    .sa-autocomplete-item .type-badge.type { background: rgba(189, 147, 249, 0.2); color: #bd93f9; border: 1px solid rgba(189, 147, 249, 0.4); opacity: 1; }
    .sa-autocomplete-item .type-badge.keyword { background: rgba(255, 121, 198, 0.2); color: #ff79c6; border: 1px solid rgba(255, 121, 198, 0.4); opacity: 1; }
    .sa-autocomplete-item .type-badge.builtin { background: rgba(80, 250, 123, 0.2); color: #50fa7b; border: 1px solid rgba(80, 250, 123, 0.4); opacity: 1; }
    .sa-autocomplete-item .type-badge.variable { background: rgba(255, 184, 108, 0.2); color: #ffb86c; border: 1px solid rgba(255, 184, 108, 0.4); opacity: 1; }
    .sa-autocomplete-item .type-badge.uniform { background: rgba(139, 233, 253, 0.2); color: #8be9fd; border: 1px solid rgba(139, 233, 253, 0.4); opacity: 1; }
    .sa-autocomplete-item .type-badge.function { background: rgba(255, 85, 85, 0.2); color: #ff5555; border: 1px solid rgba(255, 85, 85, 0.4); opacity: 1; }

    /* Problems Console styling */
    .sa-problems-console {
        background: #181a1f;
        border-top: 1px solid var(--color-border);
        height: 140px;
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        overflow: hidden;
    }
    .sa-problems-console.collapsed {
        height: 28px !important;
    }
    .sa-problems-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 12px;
        background: #21252b;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        font-weight: bold;
        font-size: 0.85em;
        cursor: pointer;
        user-select: none;
        height: 28px;
        box-sizing: border-box;
    }
    .sa-problems-list {
        flex-grow: 1;
        overflow-y: auto;
        padding: 6px 12px;
    }
    .sa-problem-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 4px 8px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 0.9em;
        transition: background 0.15s;
        margin-bottom: 2px;
        color: #f8f8f2;
    }
    .sa-problem-item:hover {
        background: rgba(255, 255, 255, 0.05);
    }
    .sa-problem-item.error {
        color: #ff5555;
    }
    .sa-problem-item.warning {
        color: #ffb86c;
    }
    .sa-problem-item .location {
        font-family: monospace;
        opacity: 0.7;
        flex-shrink: 0;
        font-weight: bold;
    }
    .sa-problem-item .message {
        word-break: break-all;
    }

    /* Status Bar styling */
    .sa-studio-statusbar {
        height: 24px;
        background: var(--color-ui);
        border-top: 1px solid var(--color-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 12px;
        font-size: 0.8em;
        box-sizing: border-box;
        opacity: 0.85;
    }
    .sa-statusbar-item {
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .sa-statusbar-item.clickable {
        cursor: pointer;
    }
    .sa-statusbar-item.clickable:hover {
        color: var(--color-accent);
    }

    /* Dialog Controls styling */
    #sa_material_studio_dialog select, #sa_material_studio_dialog button, #sa_material_studio_dialog input {
        background: var(--color-button); color: var(--color-text); border: 1px solid var(--color-border);
        border-radius: 4px; padding: 6px 12px; transition: background 0.15s, border 0.15s, color 0.15s; outline: none;
    }
    #sa_material_studio_dialog select {
        padding-right: 24px;
        appearance: none;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' fill='white'><path d='M7 10l5 5 5-5z'/></svg>");
        background-repeat: no-repeat;
        background-position: right 6px center;
    }
    #sa_material_studio_dialog input[type="color"] { padding: 2px; height: 32px; width: 44px; cursor: pointer; border-radius: 4px; }
    #sa_material_studio_dialog button:hover { background: var(--color-accent); color: var(--color-accent_text); cursor: pointer;}

    /* Left Panel Buttons */
    .sa-left-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        height: 34px;
        font-weight: 500;
        margin-bottom: 4px;
        cursor: pointer;
        transition: all 0.2s ease;
        background: var(--color-button);
        color: var(--color-text);
        border: 1px solid var(--color-border);
        border-radius: 4px;
    }
    .sa-left-btn:hover {
        background: var(--color-accent);
        color: var(--color-accent_text);
        border-color: transparent;
    }

    /* Header Editor styling */
    .sa-editor-header {
        display: flex;
        gap: 12px;
        align-items: center;
        background: var(--color-ui);
        padding: 6px 12px;
        border-radius: 6px;
        border: 1px solid var(--color-border);
        flex-grow: 1;
    }
    .sa-material-name-input {
        font-size: 1.25em;
        font-weight: bold;
        flex-grow: 1;
        background: transparent !important;
        border: 1px solid transparent !important;
        padding: 4px 8px !important;
        transition: all 0.2s ease;
    }
    .sa-material-name-input:focus {
        border-color: var(--color-accent) !important;
        background: var(--color-back) !important;
    }

    .sa-icon-btn {
        background: var(--color-button);
        border: 1px solid var(--color-border);
        border-radius: 4px;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.15s ease;
        color: var(--color-text);
    }
    .sa-icon-btn:hover, .sa-icon-btn.active {
        background: var(--color-accent);
        color: var(--color-accent_text);
        border-color: transparent;
    }
    .sa-icon-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }
    .sa-icon-btn:disabled:hover {
        background: var(--color-button);
        color: var(--color-text);
        border-color: var(--color-border);
    }
    .sa-icon-btn.delete-btn:hover {
        background: #fc2f40;
        color: #ffffff;
    }

    /* Material List Items */
    .sa-materiel-list-item {
        padding: 10px 12px;
        margin-bottom: 6px;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 10px;
        background: var(--color-back);
    }
    .sa-materiel-list-item:hover {
        background: var(--color-button);
        border-color: var(--color-border);
    }
    .sa-materiel-list-item.selected {
        background: var(--color-accent) !important;
        color: var(--color-accent_text) !important;
        border-color: transparent;
        box-shadow: 0 2px 4px rgba(0,0,0,0.15);
    }
    .sa-materiel-list-item.selected i {
        color: var(--color-accent_text);
    }

    /* Uniform Cards */
    .sa-uniform-row {
        display: block;
        margin-bottom: 8px;
        padding: 10px 12px;
        background: var(--color-ui);
        border: 1px solid var(--color-border);
        border-radius: 6px;
        transition: border-color 0.2s ease;
    }
    .sa-uniform-row:hover {
        border-color: var(--color-accent);
    }
    .sa-uniform-row-header {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
    }
    .sa-uniform-row label {
        min-width: 120px;
        font-weight: bold;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .sa-uniform-row label .uni-type {
        font-size: 0.8em;
        opacity: 0.5;
        font-family: var(--font-code, monospace);
        font-weight: normal;
    }

    /* Scrollbars */
    #sa_material_studio_dialog ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }
    #sa_material_studio_dialog ::-webkit-scrollbar-track {
        background: transparent;
    }
    #sa_material_studio_dialog ::-webkit-scrollbar-thumb {
        background: var(--color-border);
        border-radius: 4px;
    }
    #sa_material_studio_dialog ::-webkit-scrollbar-thumb:hover {
        background: var(--color-accent);
    }
    `;

    if (typeof Prism !== 'undefined' && !Prism.languages.glsl) {
        Prism.languages.glsl = {
            'comment': { pattern: /\/\/.*|\/\*[\s\S]*?\*\//, greedy: true },
            'preprocessor': { pattern: /(^\s*)#\s*[a-zA-Z_]\w*(?:[^\r\n\\]|\\(?:\r\n?|\n))*/m, lookbehind: true, alias: 'important' },
            'string': { pattern: /(["'])(?:\\.|(?!\1)[^\\\r\n])*\1/, greedy: true },
            'type': { pattern: /\b(?:void|bool|int|uint|float|vec2|vec3|vec4|mat2|mat3|mat4|sampler2D|samplerCube)\b/, alias: 'class-name' },
            'keyword': /\b(?:break|continue|discard|do|else|for|if|return|while|struct|attribute|const|in|inout|out|uniform|varying|precision|highp|mediump|lowp|layout|centroid|flat|smooth|noperspective)\b/,
            'constant': /\b(?:true|false|gl_MaxDrawBuffers|gl_MaxTextureImageUnits|gl_MaxTextureCoords|gl_MaxVertexAttribs|gl_MaxVertexUniformComponents|gl_MaxVaryingFloats|gl_MaxVertexTextureImageUnits|gl_MaxCombinedTextureImageUnits|gl_MaxFragmentUniformComponents|gl_DepthRange)\b/,
            'builtin-variable': /\b(?:gl_Position|gl_PointSize|gl_FragColor|gl_FragData|gl_FragCoord|gl_FrontFacing|gl_PointCoord)\b/,
            'builtin': /\b(?:radians|degrees|sin|cos|tan|asin|acos|atan|pow|exp|log|exp2|log2|sqrt|inversesqrt|abs|sign|floor|ceil|fract|mod|min|max|clamp|mix|step|smoothstep|length|distance|dot|cross|normalize|faceforward|reflect|refract|matrixCompMult|outerProduct|transpose|determinant|inverse|lessThan|lessThanEqual|greaterThan|greaterThanEqual|equal|notEqual|any|all|not|texture2D|textureCube|texture2DLod|texture2DProjLod|textureCubeLod|texture2DProj|texture2DProjGrad|texture2DGrad|textureCubeGrad)\b/,
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
            this.supportsScreenSpaceReflections = props.supportsScreenSpaceReflections !== undefined
                ? props.supportsScreenSpaceReflections
                : false;

            if (this.enableShadows) {
                this.uniforms = addMaterialLightingUniforms(this.uniforms);
            }

            if (!this.uniforms.map) {
                this.uniforms.map = { type: 'sampler2D', value: null, expose: true, repeat: false };
            } else {
                this.uniforms.map.type = 'sampler2D';
                if (this.uniforms.map.repeat === undefined) {
                    this.uniforms.map.repeat = false;
                }
            }
        }

        // Serializer for the JSON format
        toJSON() {
            let serializedUniforms = {};
            for (let key in this.uniforms) {
                let u = this.uniforms[key];
                let val = u.value;
                if (isColorUniformDefinition(u)) {
                    syncColorUniformValue(u, u.hexValue || vectorToColorHex(u.value));
                    val = u.type === 'color' ? u.hexValue : u.value;
                }
                if (val instanceof THREE.Vector4) val = { x: val.x, y: val.y, z: val.z, w: val.w };
                else if (val instanceof THREE.Vector3) val = { x: val.x, y: val.y, z: val.z };
                else if (val instanceof THREE.Vector2) val = { x: val.x, y: val.y };

                serializedUniforms[key] = MaterialManager.cloneUniformDefinition(u);
                serializedUniforms[key].value = val;
            }

            return {
                sa_format_version: "2.0",
                id: this.id,
                name: this.name,
                icon: this.icon,
                isCustom: this.isCustom,
                enableShadows: this.enableShadows,
                supportsScreenSpaceReflections: this.supportsScreenSpaceReflections,
                vertex: this.vertex,
                fragment: this.fragment,
                uniforms: serializedUniforms
            };
        }

        static fromJSON(data) {
            let parsedUniforms = {};
            if (data.uniforms) {
                for (let key in data.uniforms) {
                    let def = data.uniforms[key];
                    let type = def.type;
                    let parsedDef = MaterialManager.cloneUniformDefinition(def);
                    parsedDef.value = MaterialManager.deserializeUniformValue(type, def.value);

                    if (type === 'color' && parsedDef.hexValue === undefined && typeof def.value === 'string') {
                        parsedDef.hexValue = def.value;
                    }
                    if (isColorUniformDefinition(parsedDef)) {
                        syncColorUniformValue(parsedDef, parsedDef.hexValue || (typeof def.value === 'string' ? def.value : undefined));
                    }

                    parsedUniforms[key] = parsedDef;
                }
            }

            return new FancyShaderMaterial({
                id: data.id,
                name: data.name,
                icon: data.icon,
                isCustom: data.isCustom,
                enableShadows: data.enableShadows,
                supportsScreenSpaceReflections: data.supportsScreenSpaceReflections,
                vertex: data.vertex,
                fragment: data.fragment,
                uniforms: parsedUniforms
            });
        }
    }

    class FancyShaderMaterialInstance {
        constructor(props = {}) {
            this.id = props.id || guid();
            this.name = props.name || "Material Instance";
            this.icon = props.icon || "texture";
            this.baseMaterialId = props.baseMaterialId || props.materialId || 'classic';
            this.uniforms = props.uniforms || {};
            this.isMaterialInstance = true;
        }

        toJSON() {
            return {
                sa_format_version: "2.1-instance",
                id: this.id,
                name: this.name,
                icon: this.icon,
                baseMaterialId: this.baseMaterialId,
                uniforms: MaterialManager.serializeUniformMap(this.uniforms)
            };
        }

        static fromJSON(data) {
            return new FancyShaderMaterialInstance({
                id: data.id,
                name: data.name,
                icon: data.icon,
                baseMaterialId: data.baseMaterialId || data.materialId || 'classic',
                uniforms: MaterialManager.deserializeUniformMap(data.uniforms || data.uniformOverrides || {})
            });
        }
    }

    const MaterialManager = {
        materials: {}, // Registry of all available materials
        instances: {}, // Registry of material instances that only override uniforms
        projectMaterialInstancesProperty: null,
        materialInstancesUndoHooks: null,

        get materialInstances() {
            return this.instances;
        },

        init() {
            this.registerBuiltIns();
            this.loadCustomMaterials();
            this.loadMaterialInstances();
            this.revalidateAllMaterialInstances({ save: false });
        },

        dispatchGlobalMaterialListUpdate(action, material, options = {}) {
            if (typeof Blockbench === 'undefined') return;
            Blockbench.dispatchEvent(GLOBAL_MATERIAL_LIST_EVENT, {
                cause: options.cause || `${action}_material`,
                action,
                materialId: material && material.id ? material.id : material
            });
        },

        register(mat) {
            const isNewMaterial = !this.materials[mat.id];
            this.materials[mat.id] = mat;
            this.revalidateMaterialInstancesForMaterial(mat.id, { save: false });
            this.saveCustomMaterials();
            this.saveMaterialInstances();
            if (isNewMaterial) {
                this.dispatchGlobalMaterialListUpdate('add', mat);
            }
        },

        deleteMaterial(id) {
            if (this.materials[id] && this.materials[id].isCustom) {
                const removedMaterial = this.materials[id];
                delete this.materials[id];
                this.rebaseMaterialInstances(id, 'classic');
                this.saveCustomMaterials();
                this.saveMaterialInstances();

                // Clear outliner overrides that used this
                Cube.all.forEach(c => {
                    if (c.sa_material_id === id) {
                        c.sa_material_id = '';
                    }
                });
                if (ShaderEngine.globalRenderMode === id) {
                    ShaderEngine.globalRenderMode = 'classic';
                }
                ShaderEngine.updateAllCubes('delete_material');
                this.dispatchGlobalMaterialListUpdate('delete', removedMaterial);
            }
        },

        cloneUniformValue(value) {
            if (value && typeof value.clone === 'function') return value.clone();
            if (Array.isArray(value)) return value.map(v => this.cloneUniformValue(v));
            if (value && typeof value === 'object') return Object.assign({}, value);
            return value;
        },

        cloneUniformDefinition(def) {
            if (!def) return def;
            const clone = {};
            for (const key in def) {
                if (key === 'value') continue;
                clone[key] = this.cloneUniformValue(def[key]);
            }
            clone.value = this.cloneUniformValue(def.value);
            if (clone.advanced === undefined) clone.advanced = false;
            return clone;
        },

        cloneUniformMap(uniforms) {
            const cloned = {};
            for (const key in uniforms || {}) {
                cloned[key] = this.cloneUniformDefinition(uniforms[key]);
            }
            return cloned;
        },

        syncUniformPresentation(targetDef, baseDef) {
            if (!targetDef || !baseDef) return targetDef;
            for (const key in baseDef) {
                if (key === 'value' || key === 'hexValue' || key === 'repeat') continue;
                targetDef[key] = this.cloneUniformValue(baseDef[key]);
            }
            if (baseDef.repeat !== undefined && targetDef.repeat === undefined) {
                targetDef.repeat = baseDef.repeat;
            }
            return targetDef;
        },

        isColorUniformDefinition(def) {
            return isColorUniformDefinition(def);
        },

        getUniformColorHex(def, fallback = '#ffffff') {
            return getUniformColorHex(def, fallback);
        },

        syncColorUniformValue(def, hex) {
            return syncColorUniformValue(def, hex);
        },

        createScreenSpaceReflectionUniforms(options = {}) {
            return createScreenSpaceReflectionUniforms(options);
        },

        getScreenSpaceReflectionFragmentChunk() {
            return SCREEN_SPACE_REFLECTIONS_PARS_FRAGMENT;
        },

        addScreenSpaceReflectionUniforms(uniforms, options = {}) {
            return addScreenSpaceReflectionUniforms(uniforms, options);
        },

        createMaterialLightingUniforms() {
            return createMaterialLightingUniforms();
        },

        addMaterialLightingUniforms(uniforms) {
            return addMaterialLightingUniforms(uniforms);
        },

        createNativeMaterialUniforms() {
            return createNativeMaterialUniforms();
        },

        getUniformGroupId(name, def) {
            return resolveUniformGroupId(name, def);
        },

        getUniformGroupDefinition(groupId) {
            return getUniformGroupDefinition(groupId);
        },

        getUniformGroupFormKey(groupId) {
            return getUniformGroupFormKey(groupId);
        },

        isUniformGroupFormKey(key) {
            return isUniformGroupFormKey(key);
        },

        getUniformGroupIdFromFormKey(key) {
            return getUniformGroupIdFromFormKey(key);
        },

        getNativeMaterialUniformOptions() {
            const uniforms = createNativeMaterialUniforms();
            return Object.keys(uniforms).map(name => ({
                name,
                type: uniforms[name].type || 'uniform'
            }));
        },

        hasScreenSpaceReflectionSupport(materialOrId) {
            const material = typeof materialOrId === 'string'
                ? this.materials[materialOrId]
                : materialOrId;
            return !!(
                material &&
                (
                    material.supportsScreenSpaceReflections ||
                    (material.fragment && material.fragment.indexOf('saApplyScreenSpaceReflection') !== -1)
                )
            );
        },

        enableScreenSpaceReflections(materialOrId, options = {}) {
            const material = typeof materialOrId === 'string'
                ? this.materials[materialOrId]
                : materialOrId;
            if (!material) return null;

            material.uniforms = this.addScreenSpaceReflectionUniforms(material.uniforms || {}, options);
            material.supportsScreenSpaceReflections = true;

            if (options.enabled !== undefined && material.uniforms.uSSREnabled) {
                material.uniforms.uSSREnabled.value = !!options.enabled;
            }

            if (options.save !== false) {
                this.revalidateMaterialInstancesForMaterial(material.id, { save: false });
                this.saveCustomMaterials();
                this.saveMaterialInstances();
                ShaderEngine.updateAllCubes('enable_screen_space_reflections');
            }

            return material;
        },

        setScreenSpaceReflectionUniform(materialOrInstance, uniformName, value) {
            if (!uniformName || uniformName.indexOf('uSSR') !== 0) return null;

            const instance = this.getMaterialInstance(materialOrInstance);
            if (instance) {
                return this.setMaterialInstanceUniform(instance, uniformName, value);
            }

            const material = typeof materialOrInstance === 'string'
                ? this.materials[materialOrInstance]
                : materialOrInstance;
            if (!material) return null;

            material.uniforms = this.addScreenSpaceReflectionUniforms(material.uniforms || {});
            const def = material.uniforms[uniformName];
            if (!def) return null;

            def.value = this.cloneUniformValue(value);
            this.saveCustomMaterials();
            this.revalidateMaterialInstancesForMaterial(material.id, { save: false });
            ShaderEngine.updateAllUniforms('set_screen_space_reflection_uniform');
            return def;
        },

        serializeUniformValue(value) {
            if (value && value.x !== undefined && value.y !== undefined && value.z !== undefined && value.w !== undefined) {
                return { x: value.x, y: value.y, z: value.z, w: value.w };
            }
            if (value && value.x !== undefined && value.y !== undefined && value.z !== undefined) {
                return { x: value.x, y: value.y, z: value.z };
            }
            if (value && value.x !== undefined && value.y !== undefined) {
                return { x: value.x, y: value.y };
            }
            // Three.js matrix serialization support.
            if (value && (value.isMatrix3 || value instanceof THREE.Matrix3)) {
                return value.toArray();
            }
            if (value && (value.isMatrix4 || value instanceof THREE.Matrix4)) {
                return value.toArray();
            }
            if (Array.isArray(value)) return value.map(v => this.serializeUniformValue(v));
            return value;
        },

        serializeUniformMap(uniforms) {
            const serialized = {};
            for (const key in uniforms || {}) {
                const def = uniforms[key];
                if (isColorUniformDefinition(def)) {
                    syncColorUniformValue(def, def.hexValue || vectorToColorHex(def.value));
                }
                serialized[key] = this.cloneUniformDefinition(def);
                serialized[key].value = this.serializeUniformValue(def.value);
            }
            return serialized;
        },

        deserializeUniformValue(type, value) {
            if (Array.isArray(value)) {
                const itemType = type === 'vec3v' ? 'vec3' : (type === 'vec2v' ? 'vec2' : type);
                // Avoid recursively mapping serialized matrices as plain arrays.
                if (type !== 'mat3' && type !== 'mat4') {
                    return value.map(v => this.deserializeUniformValue(itemType, v));
                }
            }
            if ((type === 'vec4') && value && value.x !== undefined) {
                return new THREE.Vector4(value.x, value.y, value.z, value.w !== undefined ? value.w : 1.0);
            }
            if ((type === 'vec3' || type === 'vec3v' || type === 'color') && value && value.x !== undefined) {
                return new THREE.Vector3(value.x, value.y, value.z);
            }
            if ((type === 'vec2' || type === 'vec2v') && value && value.x !== undefined) {
                return new THREE.Vector2(value.x, value.y);
            }
            // Rebuild Matrix3.
            if (type === 'mat3' && value) {
                const m = new THREE.Matrix3();
                if (value.elements) {
                    m.fromArray(value.elements);
                } else if (Array.isArray(value)) {
                    m.fromArray(value);
                }
                return m;
            }
            // Rebuild Matrix4.
            if (type === 'mat4' && value) {
                const m = new THREE.Matrix4();
                if (value.elements) {
                    m.fromArray(value.elements);
                } else if (Array.isArray(value)) {
                    m.fromArray(value);
                }
                return m;
            }
            return value;
        },

        deserializeUniformMap(uniforms) {
            const parsed = {};
            for (const key in uniforms || {}) {
                const def = uniforms[key];
                const type = def.type;
                parsed[key] = this.cloneUniformDefinition(def);
                parsed[key].value = this.deserializeUniformValue(type, def.value);
                if (type === 'color' && parsed[key].hexValue === undefined && typeof def.value === 'string') {
                    parsed[key].hexValue = def.value;
                }
                if (isColorUniformDefinition(parsed[key])) {
                    syncColorUniformValue(parsed[key], parsed[key].hexValue || (typeof def.value === 'string' ? def.value : undefined));
                }
            }
            return parsed;
        },

        normalizeUniformType(type) {
            return type === 'color' ? 'vec3' : type;
        },

        areUniformsCompatible(baseDef, instanceDef) {
            if (!baseDef || !instanceDef) return false;
            return this.normalizeUniformType(baseDef.type) === this.normalizeUniformType(instanceDef.type);
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

        getActiveProject() {
            return typeof Project !== 'undefined' ? Project : null;
        },

        registerProjectMaterialInstanceProperty() {
            if (this.projectMaterialInstancesProperty) return this.projectMaterialInstancesProperty;
            if (typeof Property === 'undefined') return null;

            const activeProject = this.getActiveProject();
            const projectClass =
                typeof ModelProject !== 'undefined'
                    ? ModelProject
                    : (
                        activeProject &&
                            activeProject.constructor &&
                            activeProject.constructor !== Object
                            ? activeProject.constructor
                            : null
                    );

            if (!projectClass) return null;
            this.projectMaterialInstancesProperty = new Property(projectClass, 'string', PROJECT_MATERIAL_INSTANCES_PROP, {
                default: '',
                exposed: true
            });
            return this.projectMaterialInstancesProperty;
        },

        registerMaterialInstanceUndoHooks() {
            if (this.materialInstancesUndoHooks || typeof Blockbench === 'undefined') {
                return this.materialInstancesUndoHooks;
            }

            const createSaveEvent = Blockbench.on('create_undo_save', event => {
                if (!event || !event.aspects || !event.aspects[MATERIAL_INSTANCES_UNDO_ASPECT] || !event.save) return;
                event.save[PROJECT_MATERIAL_INSTANCES_PROP] = this.getProjectMaterialInstancesJSON();
            });

            const loadSaveEvent = Blockbench.on('load_undo_save', event => {
                if (!event || !event.save || event.save[PROJECT_MATERIAL_INSTANCES_PROP] === undefined) return;

                this.setProjectMaterialInstancesJSON(event.save[PROJECT_MATERIAL_INSTANCES_PROP], this.getActiveProject(), {
                    markDirty: false,
                    dispatch: false
                });
                this.syncMaterialInstancesFromProject();
                ShaderEngine.updateAllCubes('undo_material_instances');
                Blockbench.dispatchEvent('shader_architect_material_instances_changed', { cause: 'undo', undo: true });
            });

            this.materialInstancesUndoHooks = {
                delete: () => {
                    if (createSaveEvent && typeof createSaveEvent.delete === 'function') createSaveEvent.delete();
                    if (loadSaveEvent && typeof loadSaveEvent.delete === 'function') loadSaveEvent.delete();
                    this.materialInstancesUndoHooks = null;
                }
            };

            return this.materialInstancesUndoHooks;
        },

        markProjectDirty(project = this.getActiveProject()) {
            if (project && project.saved !== undefined) {
                project.saved = false;
            }
        },

        serializeMaterialInstances() {
            const instances = [];
            for (let id in this.instances) {
                instances.push(this.instances[id].toJSON());
            }
            return instances;
        },

        getProjectMaterialInstancesJSON(project = this.getActiveProject()) {
            if (!project) return '';
            return project[PROJECT_MATERIAL_INSTANCES_PROP] || '';
        },

        setProjectMaterialInstancesJSON(json, project = this.getActiveProject(), options = {}) {
            if (!project) return false;
            project[PROJECT_MATERIAL_INSTANCES_PROP] = json || '';
            if (options.markDirty !== false) {
                this.markProjectDirty(project);
            }
            return true;
        },

        saveMaterialInstances(options = {}) {
            try {
                const project = options.project || this.getActiveProject();
                if (!project) return false;
                const json = JSON.stringify(this.serializeMaterialInstances());
                const saved = this.setProjectMaterialInstancesJSON(json, project, options);
                if (saved && options.dispatch !== false && typeof Blockbench !== 'undefined') {
                    Blockbench.dispatchEvent('shader_architect_material_instances_changed', { cause: options.cause ? options.cause : 'save_instances' });
                }
                return saved;
            } catch (ignore) {
                return false;
            }
        },

        loadMaterialInstances(project = this.getActiveProject()) {
            this.instances = {};

            try {
                let data = this.getProjectMaterialInstancesJSON(project);
                if (!data) return this.instances;

                let parsed = typeof data === 'string' ? JSON.parse(data) : data;
                if (!Array.isArray(parsed)) return this.instances;

                parsed.forEach(iJson => {
                    let instance = FancyShaderMaterialInstance.fromJSON(iJson);
                    this.instances[instance.id] = instance;
                });
            } catch (ignore) { }

            return this.instances;
        },

        syncMaterialInstancesFromProject(project = this.getActiveProject()) {
            const instances = this.loadMaterialInstances(project);
            this.revalidateAllMaterialInstances({ save: false });
            return instances;
        },

        syncMaterialInstancesToProject(project = this.getActiveProject(), options = {}) {
            return this.saveMaterialInstances(Object.assign({}, options, { project }));
        },

        getMaterialInstance(instanceOrId) {
            if (!instanceOrId) return null;
            if (typeof instanceOrId === 'string') return this.instances[instanceOrId] || null;
            return instanceOrId.isMaterialInstance ? instanceOrId : null;
        },

        createMaterialInstance(baseMaterialIdOrProps = 'classic', props = {}) {
            const data = typeof baseMaterialIdOrProps === 'string'
                ? Object.assign({}, props, { baseMaterialId: baseMaterialIdOrProps })
                : Object.assign({}, baseMaterialIdOrProps);

            const base = this.materials[data.baseMaterialId] || this.materials['classic'];
            if (!base) return null;

            const instance = new FancyShaderMaterialInstance({
                id: data.id,
                name: data.name || `${base.name} Instance`,
                icon: data.icon || base.icon,
                baseMaterialId: base.id,
                uniforms: data.uniforms
                    ? this.cloneUniformMap(data.uniforms)
                    : this.cloneUniformMap(base.uniforms || {})
            });

            this.revalidateMaterialInstance(instance, { save: false });
            this.instances[instance.id] = instance;
            this.saveMaterialInstances();
            return instance;
        },

        createInstance(baseMaterialIdOrProps = 'classic', props = {}) {
            return this.createMaterialInstance(baseMaterialIdOrProps, props);
        },

        registerMaterialInstance(instanceOrProps) {
            const instance = instanceOrProps instanceof FancyShaderMaterialInstance
                ? instanceOrProps
                : new FancyShaderMaterialInstance(instanceOrProps || {});
            const base = this.materials[instance.baseMaterialId] || this.materials['classic'];
            if (!base) return null;

            instance.baseMaterialId = base.id;
            if (!instance.uniforms || Object.keys(instance.uniforms).length === 0) {
                instance.uniforms = this.cloneUniformMap(base.uniforms || {});
            }

            this.revalidateMaterialInstance(instance, { save: false });
            this.instances[instance.id] = instance;
            this.saveMaterialInstances();
            return instance;
        },

        registerInstance(instanceOrProps) {
            return this.registerMaterialInstance(instanceOrProps);
        },

        clearCubeMaterialAssignment(cube, options = {}) {
            if (!cube) return false;
            const hadMaterialId = cube.sa_material_id !== undefined && cube.sa_material_id !== '';
            const hadInstanceId = cube.sa_material_instance_id !== undefined && cube.sa_material_instance_id !== '';

            cube.sa_material_id = '';
            cube.sa_material_instance_id = '';

            if ((hadMaterialId || hadInstanceId) && options.markDirty !== false) {
                this.markProjectDirty();
            }
            return hadMaterialId || hadInstanceId;
        },

        normalizeCubeFaceName(face) {
            if (typeof face === 'number') {
                return MATERIAL_SLOT_FACE_ORDER[face] || null;
            }

            if (face && typeof face === 'object') {
                face = face.name || face.face || face.id || face.key;
            }

            if (!face) return null;

            const key = String(face).toLowerCase();
            const aliases = {
                front: 'south',
                back: 'north',
                right: 'east',
                left: 'west',
                top: 'up',
                bottom: 'down'
            };
            const normalized = aliases[key] || key;

            return CUBE_FACE_NAMES.includes(normalized) ? normalized : null;
        },

        getCubeFaceNames() {
            return CUBE_FACE_NAMES.slice();
        },

        getMaterialSlotFaceOrder() {
            return MATERIAL_SLOT_FACE_ORDER.slice();
        },

        getMaterialSlotFaceName(materialIndex) {
            return this.normalizeCubeFaceName(materialIndex);
        },

        getCubeFaceMaterialInstanceOverrides(cube) {
            if (!cube) return {};

            const raw = cube[FACE_MATERIAL_INSTANCES_PROP];
            if (!raw) return {};

            let parsed = raw;
            if (typeof raw === 'string') {
                try {
                    parsed = JSON.parse(raw);
                } catch (error) {
                    return {};
                }
            }

            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

            const normalizedOverrides = {};
            Object.keys(parsed).forEach(faceKey => {
                const faceName = this.normalizeCubeFaceName(faceKey);
                const instanceId = parsed[faceKey];
                if (faceName && typeof instanceId === 'string' && instanceId) {
                    normalizedOverrides[faceName] = instanceId;
                }
            });

            return normalizedOverrides;
        },

        setCubeFaceMaterialInstanceOverrides(cube, overrides, options = {}) {
            if (!cube) return false;

            const normalizedInput = {};
            if (overrides && typeof overrides === 'object') {
                Object.keys(overrides).forEach(faceKey => {
                    const faceName = this.normalizeCubeFaceName(faceKey);
                    const instanceId = overrides[faceKey];
                    if (faceName && typeof instanceId === 'string' && instanceId) {
                        normalizedInput[faceName] = instanceId;
                    }
                });
            }

            const orderedOverrides = {};
            CUBE_FACE_NAMES.forEach(faceName => {
                if (normalizedInput[faceName]) {
                    orderedOverrides[faceName] = normalizedInput[faceName];
                }
            });

            const nextValue = Object.keys(orderedOverrides).length
                ? JSON.stringify(orderedOverrides)
                : '';
            const previousValue = cube[FACE_MATERIAL_INSTANCES_PROP] || '';

            if (previousValue === nextValue) return false;

            cube[FACE_MATERIAL_INSTANCES_PROP] = nextValue;
            if (options.markDirty !== false) {
                this.markProjectDirty();
            }

            return true;
        },

        getCubeFaceMaterialInstanceId(cube, face) {
            const faceName = this.normalizeCubeFaceName(face);
            if (!faceName) return '';

            const overrides = this.getCubeFaceMaterialInstanceOverrides(cube);
            return overrides[faceName] || '';
        },

        hasCubeFaceMaterialInstanceOverride(cube, face) {
            return !!this.getCubeFaceMaterialInstanceId(cube, face);
        },

        assignMaterialInstanceToCubeFace(cube, face, instanceOrId, options = {}) {
            const faceName = this.normalizeCubeFaceName(face);
            const instance = this.getMaterialInstance(instanceOrId);
            if (!cube || !faceName || !instance) return false;

            const overrides = this.getCubeFaceMaterialInstanceOverrides(cube);
            if (overrides[faceName] === instance.id) return false;

            overrides[faceName] = instance.id;
            const changed = this.setCubeFaceMaterialInstanceOverrides(cube, overrides, options);

            if (changed && options.apply !== false) {
                ShaderEngine.applyToMesh(cube, this.resolveCubeMaterial(cube, ShaderEngine.globalRenderMode));
                ShaderEngine.updateLightUniforms();
                MinecraftPromotionalSilhouetteManager.invalidateGroups();
                ShaderEngine.requestPreviewRender({ cause: 'assign_face_material_instance' });
            }

            return changed;
        },

        assignInstanceToCubeFace(cube, face, instanceOrId, options = {}) {
            return this.assignMaterialInstanceToCubeFace(cube, face, instanceOrId, options);
        },

        setCubeFaceMaterialInstance(cube, face, instanceOrId, options = {}) {
            return this.assignMaterialInstanceToCubeFace(cube, face, instanceOrId, options);
        },

        clearMaterialInstanceFromCubeFace(cube, face, options = {}) {
            const faceName = this.normalizeCubeFaceName(face);
            if (!cube || !faceName) return false;

            const overrides = this.getCubeFaceMaterialInstanceOverrides(cube);
            if (!overrides[faceName]) return false;

            delete overrides[faceName];
            const changed = this.setCubeFaceMaterialInstanceOverrides(cube, overrides, options);

            if (changed && options.apply !== false) {
                ShaderEngine.applyToMesh(cube, this.resolveCubeMaterial(cube, ShaderEngine.globalRenderMode));
                ShaderEngine.updateLightUniforms();
                MinecraftPromotionalSilhouetteManager.invalidateGroups();
                ShaderEngine.requestPreviewRender({ cause: 'clear_face_material_instance' });
            }

            return changed;
        },

        clearInstanceFromCubeFace(cube, face, options = {}) {
            return this.clearMaterialInstanceFromCubeFace(cube, face, options);
        },

        clearCubeFaceMaterialInstanceOverrides(cube, options = {}) {
            if (!cube) return false;
            const hadOverrides = !!cube[FACE_MATERIAL_INSTANCES_PROP];
            if (!hadOverrides) return false;

            const changed = this.setCubeFaceMaterialInstanceOverrides(cube, {}, options);

            if (changed && options.apply !== false) {
                ShaderEngine.applyToMesh(cube, this.resolveCubeMaterial(cube, ShaderEngine.globalRenderMode));
                ShaderEngine.updateLightUniforms();
                MinecraftPromotionalSilhouetteManager.invalidateGroups();
                ShaderEngine.requestPreviewRender({ cause: 'clear_face_material_overrides' });
            }

            return changed;
        },

        clearCubeFaceMaterialInstanceOverridesByInstance(cube, instanceId, options = {}) {
            if (!cube || !instanceId) return false;

            const overrides = this.getCubeFaceMaterialInstanceOverrides(cube);
            let changed = false;

            Object.keys(overrides).forEach(faceName => {
                if (overrides[faceName] === instanceId) {
                    delete overrides[faceName];
                    changed = true;
                }
            });

            if (!changed) return false;
            return this.setCubeFaceMaterialInstanceOverrides(cube, overrides, options);
        },

        clearAllCubeMaterialAssignments(cube, options = {}) {
            if (!cube) return false;

            const changedGlobal = this.clearCubeMaterialAssignment(cube, {
                markDirty: false
            });
            const changedFaces = this.clearCubeFaceMaterialInstanceOverrides(cube, {
                markDirty: false,
                apply: false
            });
            const changed = changedGlobal || changedFaces;

            if (changed && options.markDirty !== false) {
                this.markProjectDirty();
            }

            if (changed && options.apply !== false) {
                ShaderEngine.applyToMesh(cube, this.resolveCubeMaterial(cube, ShaderEngine.globalRenderMode));
                ShaderEngine.updateLightUniforms();
                MinecraftPromotionalSilhouetteManager.invalidateGroups();
                ShaderEngine.requestPreviewRender({ cause: 'clear_material_assignments' });
            }

            return changed;
        },

        clearMissingMaterialInstanceFromCube(cube, missingInstanceId) {
            if (!cube || !missingInstanceId) return false;
            if (cube.sa_material_instance_id !== missingInstanceId) return false;

            this.clearCubeMaterialAssignment(cube);
            return true;
        },

        clearMissingMaterialInstanceFromCubeFace(cube, face, missingInstanceId) {
            if (!cube || !missingInstanceId) return false;
            const faceName = this.normalizeCubeFaceName(face);
            if (!faceName) return false;

            const currentInstanceId = this.getCubeFaceMaterialInstanceId(cube, faceName);
            if (currentInstanceId !== missingInstanceId) return false;

            const changed = this.clearMaterialInstanceFromCubeFace(cube, faceName, { apply: false });
            return changed;
        },

        deleteMaterialInstance(id) {
            if (!this.instances[id]) return false;
            delete this.instances[id];
            this.saveMaterialInstances();

            Cube.all.forEach(cube => {
                if (cube.sa_material_instance_id === id) {
                    this.clearCubeMaterialAssignment(cube);
                }
                this.clearCubeFaceMaterialInstanceOverridesByInstance(cube, id);
            });
            ShaderEngine.updateAllCubes('delete_material_instance');
            return true;
        },

        deleteInstance(id) {
            return this.deleteMaterialInstance(id);
        },

        exportMaterialInstance(instanceOrId, options = {}) {
            const instance = this.getMaterialInstance(instanceOrId);
            if (!instance) return null;

            const data = instance.toJSON();
            return options.asObject ? data : JSON.stringify(data, null, 4);
        },

        exportInstance(instanceOrId, options = {}) {
            return this.exportMaterialInstance(instanceOrId, options);
        },

        importMaterialInstance(data, options = {}) {
            try {
                const parsed = typeof data === 'string' ? JSON.parse(data) : data;
                if (!parsed) return null;

                const instance = FancyShaderMaterialInstance.fromJSON(parsed);
                if (!instance.id || (this.instances[instance.id] && !options.overwrite)) {
                    instance.id = guid();
                }

                if (!this.materials[instance.baseMaterialId]) {
                    instance.baseMaterialId = options.fallbackMaterialId || 'classic';
                }

                if (options.name) instance.name = options.name;
                return this.registerMaterialInstance(instance);
            } catch (error) {
                return null;
            }
        },

        importInstance(data, options = {}) {
            return this.importMaterialInstance(data, options);
        },

        duplicateMaterialInstance(instanceOrId, props = {}) {
            const source = this.getMaterialInstance(instanceOrId);
            if (!source) return null;

            const data = source.toJSON();
            data.id = props.id || guid();
            data.name = props.name || `${source.name} Copy`;
            if (props.baseMaterialId) data.baseMaterialId = props.baseMaterialId;

            return this.importMaterialInstance(data, { overwrite: false });
        },

        duplicateInstance(instanceOrId, props = {}) {
            return this.duplicateMaterialInstance(instanceOrId, props);
        },

        setMaterialInstanceBase(instanceOrId, baseMaterialId) {
            const instance = this.getMaterialInstance(instanceOrId);
            const base = this.materials[baseMaterialId];
            if (!instance || !base) return null;

            instance.baseMaterialId = base.id;
            instance.icon = instance.icon || base.icon;
            this.revalidateMaterialInstance(instance, { save: false });

            Cube.all.forEach(cube => {
                if (cube.sa_material_instance_id === instance.id) {
                    cube.sa_material_id = base.id;
                }
            });

            this.saveMaterialInstances();
            ShaderEngine.updateAllCubes('set_material_instance_base');
            return instance;
        },

        setInstanceBaseMaterial(instanceOrId, baseMaterialId) {
            return this.setMaterialInstanceBase(instanceOrId, baseMaterialId);
        },

        rebaseMaterialInstances(oldBaseId, newBaseId = 'classic') {
            for (let id in this.instances) {
                if (this.instances[id].baseMaterialId === oldBaseId) {
                    this.instances[id].baseMaterialId = newBaseId;
                    this.revalidateMaterialInstance(this.instances[id], { save: false });
                }
            }
        },

        revalidateMaterialInstance(instanceOrId, options = {}) {
            const instance = this.getMaterialInstance(instanceOrId) || instanceOrId;
            if (!instance) return null;

            const base = this.materials[instance.baseMaterialId] || this.materials['classic'];
            if (!base) return null;

            instance.baseMaterialId = base.id;
            const baseUniforms = this.cloneUniformMap(base.uniforms || {});
            const currentUniforms = instance.uniforms || {};
            const nextUniforms = {};

            for (const key in baseUniforms) {
                const currentDef = currentUniforms[key];
                if (this.areUniformsCompatible(baseUniforms[key], currentDef)) {
                    nextUniforms[key] = this.syncUniformPresentation(
                        this.cloneUniformDefinition(currentDef),
                        baseUniforms[key]
                    );
                } else {
                    nextUniforms[key] = this.cloneUniformDefinition(baseUniforms[key]);
                }
            }

            instance.uniforms = nextUniforms;
            if (options.save !== false) this.saveMaterialInstances();
            return instance;
        },

        revalidateMaterialInstancesForMaterial(materialId, options = {}) {
            for (let id in this.instances) {
                if (this.instances[id].baseMaterialId === materialId) {
                    this.revalidateMaterialInstance(this.instances[id], { save: false });
                }
            }
            if (options.save !== false) this.saveMaterialInstances();
        },

        revalidateAllMaterialInstances(options = {}) {
            for (let id in this.instances) {
                this.revalidateMaterialInstance(this.instances[id], { save: false });
            }
            if (options.save !== false) this.saveMaterialInstances();
        },

        getMaterialInstanceUniformDefaults(baseMaterialId) {
            const base = this.materials[baseMaterialId] || this.materials['classic'];
            return base ? this.cloneUniformMap(base.uniforms || {}) : {};
        },

        getMaterialInstanceUniforms(instanceOrId) {
            const instance = this.getMaterialInstance(instanceOrId);
            if (!instance) return {};

            const base = this.materials[instance.baseMaterialId] || this.materials['classic'];
            if (!base) return {};

            const uniforms = this.cloneUniformMap(base.uniforms || {});
            for (const key in instance.uniforms || {}) {
                if (this.areUniformsCompatible(uniforms[key], instance.uniforms[key])) {
                    uniforms[key] = this.syncUniformPresentation(
                        this.cloneUniformDefinition(instance.uniforms[key]),
                        uniforms[key]
                    );
                }
            }
            return uniforms;
        },

        getInstanceUniforms(instanceOrId) {
            return this.getMaterialInstanceUniforms(instanceOrId);
        },

        setMaterialInstanceUniform(instanceOrId, uniformName, value) {
            const instance = this.getMaterialInstance(instanceOrId);
            if (!instance) return null;

            const base = this.materials[instance.baseMaterialId] || this.materials['classic'];
            const baseDef = base && base.uniforms ? base.uniforms[uniformName] : null;
            if (!baseDef) return null;

            let nextDef;
            if (value && typeof value === 'object' && value.type && Object.prototype.hasOwnProperty.call(value, 'value')) {
                nextDef = this.cloneUniformDefinition(value);
            } else {
                nextDef = this.cloneUniformDefinition(baseDef);
                nextDef.value = this.cloneUniformValue(value);
                if (this.isColorUniformDefinition(nextDef)) {
                    if (typeof value === 'string') {
                        this.syncColorUniformValue(nextDef, value);
                    } else {
                        this.syncColorUniformValue(nextDef, nextDef.hexValue || vectorToColorHex(value));
                    }
                }
            }

            if (!this.areUniformsCompatible(baseDef, nextDef)) return null;
            instance.uniforms[uniformName] = nextDef;
            this.saveMaterialInstances();
            ShaderEngine.updateAllUniforms();
            ShaderEngine.updateAllCubes('set_material_instance_uniform');
            return nextDef;
        },

        setInstanceUniform(instanceOrId, uniformName, value) {
            return this.setMaterialInstanceUniform(instanceOrId, uniformName, value);
        },

        resetMaterialInstanceUniform(instanceOrId, uniformName) {
            const instance = this.getMaterialInstance(instanceOrId);
            if (!instance) return null;

            const base = this.materials[instance.baseMaterialId] || this.materials['classic'];
            const baseDef = base && base.uniforms ? base.uniforms[uniformName] : null;
            if (!baseDef) return null;

            instance.uniforms[uniformName] = this.cloneUniformDefinition(baseDef);
            this.saveMaterialInstances();
            ShaderEngine.updateAllUniforms();
            ShaderEngine.updateAllCubes('reset_material_instance_uniform');
            return instance.uniforms[uniformName];
        },

        resetInstanceUniform(instanceOrId, uniformName) {
            return this.resetMaterialInstanceUniform(instanceOrId, uniformName);
        },

        resetMaterialInstanceUniforms(instanceOrId) {
            const instance = this.getMaterialInstance(instanceOrId);
            if (!instance) return null;

            const base = this.materials[instance.baseMaterialId] || this.materials['classic'];
            if (!base) return null;

            instance.uniforms = this.cloneUniformMap(base.uniforms || {});
            this.saveMaterialInstances();
            ShaderEngine.updateAllUniforms();
            ShaderEngine.updateAllCubes('reset_material_instance_uniforms');
            return instance;
        },

        resetInstanceUniforms(instanceOrId) {
            return this.resetMaterialInstanceUniforms(instanceOrId);
        },

        assignMaterialInstanceToCube(cube, instanceOrId, options = {}) {
            const instance = this.getMaterialInstance(instanceOrId);
            if (!cube || !instance) return false;

            cube.sa_material_instance_id = instance.id;
            cube.sa_material_id = instance.baseMaterialId;
            if (options.apply !== false) {
                ShaderEngine.applyToMesh(cube, this.getRenderMaterialForInstance(instance));
                ShaderEngine.updateLightUniforms();
                MinecraftPromotionalSilhouetteManager.invalidateGroups();
                ShaderEngine.requestPreviewRender({ cause: 'assign_material_instance' });
            }
            return true;
        },

        assignInstanceToCube(cube, instanceOrId, options = {}) {
            return this.assignMaterialInstanceToCube(cube, instanceOrId, options);
        },

        clearMaterialInstanceFromCube(cube) {
            if (!cube) return false;
            this.clearCubeMaterialAssignment(cube);
            ShaderEngine.updateAllCubes('clear_material_instance');
            return true;
        },

        clearInstanceFromCube(cube) {
            return this.clearMaterialInstanceFromCube(cube);
        },

        getRenderMaterialForInstance(instanceOrId) {
            const instance = this.getMaterialInstance(instanceOrId);
            if (!instance) return null;

            const base = this.materials[instance.baseMaterialId] || this.materials['classic'];
            if (!base) return null;

            return {
                id: base.id,
                name: instance.name || base.name,
                icon: instance.icon || base.icon,
                vertex: base.vertex,
                fragment: base.fragment,
                uniforms: this.getMaterialInstanceUniforms(instance),
                isCustom: false,
                enableShadows: base.enableShadows,
                supportsScreenSpaceReflections: base.supportsScreenSpaceReflections,
                isMaterialInstanceRender: true,
                materialInstanceId: instance.id,
                baseMaterialId: base.id,
                baseMaterial: base
            };
        },

        getRenderMaterial(materialOrInstance) {
            if (!materialOrInstance) return this.materials['classic'] || null;
            if (materialOrInstance.isMaterialInstanceRender) return materialOrInstance;

            if (typeof materialOrInstance === 'string') {
                if (this.instances[materialOrInstance]) {
                    return this.getRenderMaterialForInstance(materialOrInstance);
                }
                return this.materials[materialOrInstance] || this.materials['classic'] || null;
            }

            if (materialOrInstance.isMaterialInstance) {
                return this.getRenderMaterialForInstance(materialOrInstance);
            }

            return materialOrInstance;
        },

        resolveCubeMaterial(cube, fallbackMaterialId = 'classic') {
            if (cube && cube.sa_material_instance_id) {
                if (this.instances[cube.sa_material_instance_id]) {
                    const material = this.getRenderMaterialForInstance(cube.sa_material_instance_id);
                    if (material) return material;
                }

                this.clearMissingMaterialInstanceFromCube(cube, cube.sa_material_instance_id);
                return this.getRenderMaterial(fallbackMaterialId || 'classic');
            }

            const materialId = (cube && cube.sa_material_id) || fallbackMaterialId || 'classic';
            return this.getRenderMaterial(materialId);
        },

        resolveCubeFaceMaterial(cube, face, fallbackMaterialId = 'classic') {
            const faceName = this.normalizeCubeFaceName(face);
            if (cube && faceName) {
                const instanceId = this.getCubeFaceMaterialInstanceId(cube, faceName);

                if (instanceId) {
                    if (this.instances[instanceId]) {
                        const material = this.getRenderMaterialForInstance(instanceId);
                        if (material) return material;
                    }

                    this.clearMissingMaterialInstanceFromCubeFace(cube, faceName, instanceId);
                }
            }

            return this.resolveCubeMaterial(cube, fallbackMaterialId);
        },

        registerBuiltIns() {
            let classic = new FancyShaderMaterial({
                id: 'classic',
                name: tl('shader_architect.preset.classic'),
                icon: 'deployed_code',
                isCustom: false,
                vertex: `
                    //Classic
                    attribute float highlight;

                    uniform bool SHADE;
                    uniform int LIGHTSIDE;

                    varying vec2 vUv;
                    varying float light;
                    varying float lift;

                    void main() {
                        if (SHADE) {
                            // Use normalMatrix for correct orientation with scaling.
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
                    "LIGHTCOLOR": { type: "vec3", value: new THREE.Vector3(1, 1, 1), hexValue: "#ffffff", expose: true, is_color: true },
                    "SHADE": { type: "bool", value: true, expose: true },
                    "LIGHTSIDE": { type: "int", value: 0, expose: true, min: 0, max: 5, step: 1, allow_higher: false, allow_lower: false },
                    "EMISSIVE": { type: "bool", value: false, expose: true }
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
attribute vec2 normalizedFaceUv;

uniform bool SHADE;
uniform int LIGHTSIDE;
uniform mat3 uWorldNormalMatrix;
uniform float uStylizedNormalInfluence;

varying vec2 vUv;
varying vec2 v_uvSize;
varying float lift;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec3 vSA_SSRViewPosition;
varying vec3 vSA_SSRViewNormal;
varying vec4 vSA_SSRClipPosition;

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
        Three.js r129 requires this exact variable for #include <shadowmap_vertex>.
        Keep it even though custom lighting uses uWorldNormalMatrix.
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
    v_uvSize = normalizedFaceUv;
    vViewDir = safeNormalizeVertex(cameraPosition - vWorldPos, vec3(0.0, 0.0, 1.0));
    vec4 saSSRViewPosition4 = modelViewMatrix * vec4(position, 1.0);
    vSA_SSRViewPosition = saSSRViewPosition4.xyz;
    vSA_SSRViewNormal = safeNormalizeVertex(normalMatrix * normal, vec3(0.0, 0.0, 1.0));
    vSA_SSRClipPosition = projectionMatrix * saSSRViewPosition4;

    lift = highlight == 2.0 ? 0.22 :
           highlight == 1.0 ? 0.10 :
           0.0;

    gl_Position = vSA_SSRClipPosition;

    #include <shadowmap_vertex>
}`,
                fragment: `#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
${SCREEN_SPACE_REFLECTIONS_PARS_FRAGMENT}

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
varying vec2 v_uvSize;
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

    float proceduralAO = computeAmbientOcclusion(v_uvSize, N);
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

    gl_FragColor = saApplyScreenSpaceReflection(
        vec4(color, texel.a),
        vSA_SSRViewNormal,
        vSA_SSRViewPosition,
        vSA_SSRClipPosition,
        roughness,
        max(uEnvSpecularStrength, uSpecularIntensity)
    );
}`,
                uniforms: Object.assign({
                    // Base PBR Properties
                    "uBaseColor": { type: "vec3", value: new THREE.Vector3(1, 1, 1), hexValue: "#ffffff", expose: true, is_color: true },
                    "uMetallic": { type: "float", value: 0.0, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
                    "uRoughness": { type: "float", value: 0.5, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
                    "uAO": { type: "float", value: 1.0, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },

                    // Clearcoat
                    "uClearcoat": { type: "float", value: 0.0, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
                    "uClearcoatRoughness": { type: "float", value: 0.1, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },

                    // Anisotropy
                    "uAnisotropy": { type: "float", value: 0.0, expose: true, min: -1.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
                    "uAnisotropyDirection": { type: "vec2", value: new THREE.Vector2(1.0, 0.0), expose: true },

                    // Sheen
                    "uSheen": { type: "float", value: 0.0, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
                    "uSheenColor": { type: "vec3", value: new THREE.Vector3(1, 1, 1), hexValue: "#ffffff", expose: true, is_color: true },
                    "uSheenRoughness": { type: "float", value: 0.5, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },

                    // Transmission
                    "uTransmission": { type: "float", value: 0.0, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
                    "uThickness": { type: "float", value: 1.0, expose: true, min: 0.0, max: 10.0, step: 0.1, allow_higher: true, allow_lower: false },
                    "uAttenuationColor": { type: "vec3", value: new THREE.Vector3(1, 1, 1), hexValue: "#ffffff", expose: true, is_color: true },
                    "uAttenuationDistance": { type: "float", value: 1.0, expose: true, min: 0.0, max: 10.0, step: 0.1, allow_higher: true, allow_lower: false },
                    "uIOR": { type: "float", value: 1.5, expose: true, min: 1.0, max: 3.0, step: 0.01, allow_higher: true, allow_lower: false },

                    // Iridescence
                    "uIridescence": { type: "float", value: 0.0, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
                    "uIridescenceIOR": { type: "float", value: 1.33, expose: true, min: 1.0, max: 3.0, step: 0.01, allow_higher: true, allow_lower: false },
                    "uIridescenceThicknessMin": { type: "float", value: 100.0, expose: true, min: 0.0, max: 1000.0, step: 10.0, allow_higher: true, allow_lower: false },
                    "uIridescenceThicknessMax": { type: "float", value: 400.0, expose: true, min: 0.0, max: 1000.0, step: 10.0, allow_higher: true, allow_lower: false },

                    // Emission
                    "uEmissiveColor": { type: "vec3", value: new THREE.Vector3(0, 0, 0), hexValue: "#000000", expose: true, is_color: true },
                    "uEmissiveStrength": { type: "float", value: 0.0, expose: true, min: 0.0, max: 10.0, step: 0.1, allow_higher: true, allow_lower: false },

                    // Texture enable flags. Set these to true only when a real texture exists.
                    "uUseBaseColorMap": { type: "bool", value: false, expose: true, advanced: true },
                    "uUseMetallicRoughnessMap": { type: "bool", value: false, expose: true, advanced: true },
                    "uUseNormalMap": { type: "bool", value: false, expose: true, advanced: true },
                    "uUseAOMap": { type: "bool", value: false, expose: true, advanced: true },
                    "uUseEmissiveMap": { type: "bool", value: false, expose: true, advanced: true },
                    "uUseClearcoatMap": { type: "bool", value: false, expose: true, advanced: true },
                    "uUseClearcoatRoughnessMap": { type: "bool", value: false, expose: true, advanced: true },
                    "uUseAnisotropyMap": { type: "bool", value: false, expose: true, advanced: true },
                    "uUseSheenColorMap": { type: "bool", value: false, expose: true, advanced: true },
                    "uUseSheenRoughnessMap": { type: "bool", value: false, expose: true, advanced: true },
                    "uUseTransmissionMap": { type: "bool", value: false, expose: true, advanced: true },
                    "uUseThicknessMap": { type: "bool", value: false, expose: true, advanced: true },
                    "uUseIridescenceMap": { type: "bool", value: false, expose: true, advanced: true },
                    "uUseIridescenceThicknessMap": { type: "bool", value: false, expose: true, advanced: true },

                    // Texture Maps
                    "uBaseColorMap": { type: "sampler2D", value: null, expose: false },
                    "uMetallicRoughnessMap": { type: "sampler2D", value: null, expose: false },
                    "uNormalMap": { type: "sampler2D", value: null, expose: false },
                    "uAOMap": { type: "sampler2D", value: null, expose: false },
                    "uEmissiveMap": { type: "sampler2D", value: null, expose: false },
                    "uClearcoatMap": { type: "sampler2D", value: null, expose: false },
                    "uClearcoatRoughnessMap": { type: "sampler2D", value: null, expose: false },
                    "uClearcoatNormalMap": { type: "sampler2D", value: null, expose: false },
                    "uAnisotropyMap": { type: "sampler2D", value: null, expose: false },
                    "uSheenColorMap": { type: "sampler2D", value: null, expose: false },
                    "uSheenRoughnessMap": { type: "sampler2D", value: null, expose: false },
                    "uTransmissionMap": { type: "sampler2D", value: null, expose: false },
                    "uThicknessMap": { type: "sampler2D", value: null, expose: false },
                    "uIridescenceMap": { type: "sampler2D", value: null, expose: false },
                    "uIridescenceThicknessMap": { type: "sampler2D", value: null, expose: false },

                    // Texture Scales
                    "uBaseColorMapScale": { type: "vec2", value: new THREE.Vector2(1, 1), expose: true, advanced: true },
                    "uMetallicRoughnessMapScale": { type: "vec2", value: new THREE.Vector2(1, 1), expose: true, advanced: true },
                    "uNormalMapScale": { type: "vec2", value: new THREE.Vector2(1, 1), expose: true, advanced: true },
                    "uAOMapScale": { type: "vec2", value: new THREE.Vector2(1, 1), expose: true, advanced: true },
                    "uEmissiveMapScale": { type: "vec2", value: new THREE.Vector2(1, 1), expose: true, advanced: true },
                    "uClearcoatMapScale": { type: "vec2", value: new THREE.Vector2(1, 1), expose: true, advanced: true },
                    "uClearcoatRoughnessMapScale": { type: "vec2", value: new THREE.Vector2(1, 1), expose: true, advanced: true },
                    "uAnisotropyMapScale": { type: "vec2", value: new THREE.Vector2(1, 1), expose: true, advanced: true },
                    "uSheenColorMapScale": { type: "vec2", value: new THREE.Vector2(1, 1), expose: true, advanced: true },
                    "uSheenRoughnessMapScale": { type: "vec2", value: new THREE.Vector2(1, 1), expose: true, advanced: true },
                    "uTransmissionMapScale": { type: "vec2", value: new THREE.Vector2(1, 1), expose: true, advanced: true },
                    "uThicknessMapScale": { type: "vec2", value: new THREE.Vector2(1, 1), expose: true, advanced: true },
                    "uIridescenceMapScale": { type: "vec2", value: new THREE.Vector2(1, 1), expose: true, advanced: true },
                    "uIridescenceThicknessMapScale": { type: "vec2", value: new THREE.Vector2(1, 1), expose: true, advanced: true },

                    // Rendering controls
                    "uNormalScale": { type: "float", value: 1.0, expose: true, min: -2.0, max: 2.0, step: 0.1, allow_higher: true, allow_lower: true },
                    "uEnvSpecularStrength": { type: "float", value: 0.35, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: true, allow_lower: false },
                    "uSpecularIntensity": { type: "float", value: 1.0, expose: true, min: 0.0, max: 2.0, step: 0.05, allow_higher: true, allow_lower: false },

                    // Light arrays / Lightflow-compatible uniforms
                    "uLightPos": { type: "vec3v", value: Array.from({ length: 16 }, () => new THREE.Vector3()), expose: false },
                    "uLightDir": { type: "vec3v", value: Array.from({ length: 16 }, () => new THREE.Vector3(0, -1, 0)), expose: false },
                    "uLightIntensity": { type: "floatv", value: Array(16).fill(0.0), expose: false },
                    "uLightDistance": { type: "floatv", value: Array(16).fill(0.0), expose: false },
                    "uLightConeAngle": { type: "floatv", value: Array(16).fill(0.0), expose: false },
                    "uLightPenumbra": { type: "floatv", value: Array(16).fill(0.0), expose: false },
                    "uLightType": { type: "intv", value: Array(16).fill(0), expose: false },
                    "uLightColor": { type: "vec3v", value: Array.from({ length: 16 }, () => new THREE.Vector3()), expose: false },
                    "max_light_number": { type: "int", value: 0, expose: true, min: 0, max: 16, step: 1, allow_higher: false, allow_lower: false },
                    "uLightCastShadow": { type: "intv", value: Array(16).fill(0), expose: false },
                    "uLightShadowIndex": { type: "intv", value: Array(16).fill(-1), expose: false },

                    // Ambient
                    "uAmbient": { type: "float", value: 0.3, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: true, allow_lower: false },
                    "uAmbientColor": { type: "vec3", value: new THREE.Vector3(1, 1, 1), hexValue: "#ffffff", expose: true, is_color: true },

                    // Normal correction
                    "uWorldNormalMatrix": { type: "mat3", value: new THREE.Matrix3(), expose: false },
                    "uStylizedNormalInfluence": { type: "float", value: 0.0, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },

                    // Output / artistic controls
                    "uExposure": { type: "float", value: 1.0, expose: true, min: 0.0, max: 5.0, step: 0.1, allow_higher: true, allow_lower: false },
                    "uUseToneMapping": { type: "float", value: 0.0, expose: true, min: 0.0, max: 5.0, step: 1.0, allow_higher: false, allow_lower: false },
                    "uLightWrap": { type: "float", value: 0.0, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },

                    // Ambient Occlusion
                    "uAOEnabled": { type: "bool", value: true, expose: true },
                    "uAOStrength": { type: "float", value: 0.5, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
                    "uAORadius": { type: "float", value: 0.12, expose: true, min: 0.0, max: 2.0, step: 0.01, allow_higher: true, allow_lower: false },
                    "uAOPower": { type: "float", value: 1.5, expose: true, min: 0.1, max: 5.0, step: 0.1, allow_higher: true, allow_lower: false },
                    "uAOMin": { type: "float", value: 0.4, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
                    "uAODirectInfluence": { type: "float", value: 0.15, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },

                    // Shadows
                    "uShadowStrength": { type: "float", value: 1.0, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },
                    "uShadowFloor": { type: "float", value: 0.0, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: false, allow_lower: false },

                    // Blockbench-style controls
                    "SHADE": { type: "bool", value: true, expose: true },
                    "LIGHTSIDE": { type: "int", value: 0, expose: true, min: 0, max: 5, step: 1, allow_higher: false, allow_lower: false },
                    "LIGHTCOLOR": { type: "vec3", value: new THREE.Vector3(1, 1, 1), hexValue: "#ffffff", expose: true, is_color: true },
                    "TEXTURE_SIZE": { type: "vec2", value: new THREE.Vector2(16, 16), expose: false }
                }, createScreenSpaceReflectionUniforms({
                    intensity: 0.82,
                    roughness: 0.16,
                    quality: 0.72,
                    renderScale: 0.85
                })),
                supportsScreenSpaceReflections: true,
                enableShadows: true
            });

            const lightflowScreenSpaceReflectionDefaults = {
                intensity: 0.55,
                roughness: 0.32,
                thickness: 0.18,
                maxDistance: 18.0,
                distortion: 0.018,
                fresnelPower: 1.25,
                fresnelStrength: 0.32,
                edgeFade: 0.1,
                distanceFade: 0.35,
                depthBias: 0.06,
                quality: 0.22,
                renderScale: 0.55,
                frameInterval: 2.0
            };

            const normalizeLightflowUniformOptions = (options = {}) => {
                if (typeof options === 'boolean') {
                    return {
                        shadows: options,
                        screenSpaceReflections: false
                    };
                }

                const config = options || {};
                return {
                    shadows: !!(config.shadows || config.withShadowBinding),
                    screenSpaceReflections: config.screenSpaceReflections === true || config.ssr === true
                };
            };

            const createLightflowUniforms = (options = {}) => {
                const config = normalizeLightflowUniformOptions(options);
                const uniforms = {
                    "map": {
                        type: "sampler2D",
                        repeat: true,
                        expose: true
                    },
                    "SHADE": {
                        type: "bool",
                        value: true,
                        expose: true
                    },
                    "LIGHTSIDE": {
                        type: "int",
                        value: 0,
                        expose: true,
                        min: 0,
                        max: 5,
                        step: 1,
                        allow_higher: false,
                        allow_lower: false
                    },
                    "LIGHTCOLOR": {
                        type: "vec3",
                        value: new THREE.Vector3(1, 1, 1),
                        hexValue: "#ffffff",
                        expose: true,
                        is_color: true
                    },
                    "AUTO_TILE": {
                        type: "bool",
                        value: false,
                        expose: true,
                        advanced: false
                    },
                    "TILING": {
                        type: "vec2",
                        value: new THREE.Vector2(1, 1),
                        expose: true,
                        min: 0.1,
                        max: 10.0,
                        step: 0.1
                    },
                    "uClampLighting": {
                        type: "bool",
                        value: false,
                        expose: true,
                        advanced: true
                    },
                    "max_light_number": {
                        type: "int",
                        value: 0,
                        expose: true,
                        min: 0,
                        max: 16,
                        step: 1,
                        allow_higher: false,
                        allow_lower: false
                    },
                    // Ambient
                    "uAmbient": {
                        type: "float",
                        value: 0.3,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.05,
                        allow_higher: true,
                        allow_lower: false
                    },
                    "uAmbientColor": {
                        type: "vec3",
                        value: new THREE.Vector3(1, 1, 1),
                        hexValue: "#ffffff",
                        expose: true,
                        is_color: true
                    },
                    // Light arrays
                    "uLightPos": {
                        type: "vec3v",
                        value: Array.from({ length: 16 }, () => new THREE.Vector3()),
                        expose: false
                    },
                    "uLightDir": {
                        type: "vec3v",
                        value: Array.from({ length: 16 }, () => new THREE.Vector3(0, -1, 0)),
                        expose: false
                    },
                    "uLightIntensity": {
                        type: "floatv",
                        value: Array(16).fill(0.0),
                        expose: false
                    },
                    "uLightDistance": {
                        type: "floatv",
                        value: Array(16).fill(0.0),
                        expose: false
                    },
                    "uLightConeAngle": {
                        type: "floatv",
                        value: Array(16).fill(0.0),
                        expose: false
                    },
                    "uLightPenumbra": {
                        type: "floatv",
                        value: Array(16).fill(0.0),
                        expose: false
                    },
                    "uLightType": {
                        type: "intv",
                        value: Array(16).fill(0),
                        expose: false
                    },
                    "uLightColor": {
                        type: "vec3v",
                        value: Array.from({ length: 16 }, () => new THREE.Vector3()),
                        expose: false
                    },
                    // Normal correction
                    "uWorldNormalMatrix": {
                        type: "mat3",
                        value: new THREE.Matrix3(),
                        expose: false
                    },

                    // Output / artistic controls
                    "uExposure": {
                        type: "float",
                        value: 1.0,
                        expose: true,
                        min: 0.0,
                        max: 5.0,
                        step: 0.1,
                        allow_higher: true,
                        allow_lower: false
                    },
                    "uToneMapping": {
                        type: "int",
                        value: 0,
                        expose: true,
                        advanced: true,
                        min: 0,
                        max: 5,
                        step: 1,
                        allow_higher: false,
                        allow_lower: false
                    },
                    "uStylizedNormalInfluence": {
                        type: "float",
                        value: 0.0,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.05,
                        allow_higher: false,
                        allow_lower: false
                    },
                    "uLightWrap": {
                        type: "float",
                        value: 0.0,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.05,
                        allow_higher: false,
                        allow_lower: false
                    },

                    // Ambient Occlusion - Voxel-friendly
                    "uAOEnabled": {
                        type: "bool",
                        value: true,
                        expose: true
                    },
                    "uAOStrength": {
                        type: "float",
                        value: 0.5,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.05,
                        allow_higher: false,
                        allow_lower: false
                    },
                    "uAORadius": {
                        type: "float",
                        value: 0.12,
                        expose: true,
                        min: 0.0,
                        max: 2.0,
                        step: 0.01,
                        allow_higher: true,
                        allow_lower: false
                    },
                    "uAOPower": {
                        type: "float",
                        value: 1.5,
                        expose: true,
                        advanced: true,
                        min: 0.1,
                        max: 5.0,
                        step: 0.1,
                        allow_higher: true,
                        allow_lower: false
                    },
                    "uAOMin": {
                        type: "float",
                        value: 0.4,
                        expose: true,
                        advanced: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.05,
                        allow_higher: false,
                        allow_lower: false
                    },
                    "uAODirectInfluence": {
                        type: "float",
                        value: 0.15,
                        expose: true,
                        advanced: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.05,
                        allow_higher: false,
                        allow_lower: false
                    },
                    "uAOEdgeSharpness": {
                        type: "float",
                        value: 8.0,
                        expose: true,
                        advanced: true,
                        min: 0.0,
                        max: 16.0,
                        step: 0.5,
                        allow_higher: true,
                        allow_lower: false
                    },
                    "uAOCornerWeight": {
                        type: "float",
                        value: 1.5,
                        expose: true,
                        advanced: true,
                        min: 0.0,
                        max: 5.0,
                        step: 0.1,
                        allow_higher: true,
                        allow_lower: false
                    },
                    "uAOFaceNormalWeight": {
                        type: "float",
                        value: 0.3,
                        expose: true,
                        advanced: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.05,
                        allow_higher: false,
                        allow_lower: false
                    },

                    "TEXTURE_SIZE": {
                        type: "vec2",
                        value: new THREE.Vector2(16, 16),
                        expose: false
                    }
                };

                if (config.shadows) {
                    uniforms["uLightCastShadow"] = {
                        type: "intv",
                        value: Array(16).fill(0),
                        expose: false
                    };

                    uniforms["uLightShadowIndex"] = {
                        type: "intv",
                        value: Array(16).fill(-1),
                        expose: false
                    };

                    uniforms["uShadowStrength"] = {
                        type: "float",
                        value: 1.0,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.05,
                        allow_higher: false,
                        allow_lower: false
                    };

                    uniforms["uShadowFloor"] = {
                        type: "float",
                        value: 0.0,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.05,
                        allow_higher: false,
                        allow_lower: false
                    };
                }

                if (config.screenSpaceReflections) {
                    addScreenSpaceReflectionUniforms(uniforms, lightflowScreenSpaceReflectionDefaults);
                }

                return uniforms;
            };

            let lightflow = new FancyShaderMaterial({
                id: 'lightflow',
                name: tl('shader_architect.preset.lightflow'),
                icon: 'wb_iridescent',
                isCustom: false,
                vertex: `attribute float highlight;
uniform bool SHADE;
uniform int LIGHTSIDE;
uniform mat3 uWorldNormalMatrix;
uniform float uStylizedNormalInfluence;

varying vec2 vUv;
varying float lift;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

//attributes
attribute vec2 normalizedFaceUv;
attribute vec2 globalFaceSize;
attribute vec2 uvSize;

//varyings
varying vec2 v_normalizedFaceUv;
varying vec2 v_faceSize;
varying vec2 v_uvSize;

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
    v_normalizedFaceUv = normalizedFaceUv;
    v_faceSize = globalFaceSize;
    v_uvSize = uvSize;

    lift = highlight == 2.0 ? 0.22 :
           highlight == 1.0 ? 0.10 :
           0.0;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
                fragment: `uniform sampler2D map;
uniform vec3 LIGHTCOLOR;
uniform vec2 TILING;
uniform bool AUTO_TILE;
uniform vec2 TEXTURE_SIZE;

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

// Checkbox option to clamp lighting
uniform bool uClampLighting;

varying vec2 vUv;
varying vec2 v_normalizedFaceUv;
varying vec2 v_faceSize;
varying vec2 v_uvSize;
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

// --- TONE MAPPING (Linear Workflow Compatible) ---

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
    return (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);
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
    vec2 tiling_value = TILING;
    if (AUTO_TILE) {
        tiling_value = v_faceSize / TEXTURE_SIZE;
    }
    vec4 texel = texture2D(map, vUv * tiling_value);

    if (texel.a < 0.01) discard;

    // --- LINEARIZE INPUT TEXTURE ---
    // Converts input texture from sRGB to Linear space so lighting calculations are correct.
    texel.rgb = pow(max(texel.rgb, vec3(0.0)), vec3(2.2));

    vec3 normal = safeNormalize(vWorldNormal, vec3(0.0, 1.0, 0.0));

    vec3 directLight = vec3(0.0);

    for (int i = 0; i < 16; i++) {
        if (i >= max_light_number) break;
        if (uLightIntensity[i] <= 0.0) continue;

        directLight += computeLightContribution(i, normal, vWorldPos);
    }

    float ambientOcclusion = computeVoxelAO(v_uvSize, normal);

    vec3 ambientLight = max(uAmbientColor, vec3(0.0)) * max(uAmbient, 0.0);
    ambientLight *= ambientOcclusion;

    float directAO = mix(1.0, ambientOcclusion, clamp(uAODirectInfluence, 0.0, 1.0));
    vec3 lighting = ambientLight + directLight * directAO;

    // --- LIGHTING CLAMP (Checkbox) ---
    if (uClampLighting) {
        float maxChannel = max(lighting.r, max(lighting.g, lighting.b));
        if (maxChannel > 1.0) {
            lighting /= maxChannel;
        }
    }

    vec3 finalColor = texel.rgb * lighting;

    // Apply lift uniform (keep values near 0.0 to prevent washing out dark tones)
    finalColor += vec3(lift);
    finalColor *= LIGHTCOLOR;

    if (lift > 0.2) {
        finalColor.rg *= vec2(0.6, 0.7);
    }

    finalColor = applyToneMapping(finalColor);

    // --- GAMMA CORRECTION ---
    // Converts the final linear color into sRGB space for correct display output.
    finalColor = pow(max(finalColor, vec3(0.0)), vec3(1.0 / 2.2));

    gl_FragColor = vec4(finalColor, texel.a);
}`,
                uniforms: createLightflowUniforms()
            });

            let shaded_lightflow = new FancyShaderMaterial({
                id: 'shaded_lightflow',
                name: tl('shader_architect.preset.shaded_lightflow'),
                icon: 'brightness_5',
                isCustom: false,
                vertex: `#include <common>
#include <shadowmap_pars_vertex>

attribute float highlight;

uniform bool SHADE;
uniform int LIGHTSIDE;
uniform mat3 uWorldNormalMatrix;
uniform float uStylizedNormalInfluence;

varying vec2 vUv;
varying float lift;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vSA_SSRViewPosition;
varying vec3 vSA_SSRViewNormal;
varying vec4 vSA_SSRClipPosition;

//attributes
attribute vec2 normalizedFaceUv;
attribute vec2 globalFaceSize;
attribute vec2 uvSize;

//varyings
varying vec2 v_normalizedFaceUv;
varying vec2 v_faceSize;
varying vec2 v_uvSize;

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
        Three.js r129 requires this exact variable for #include <shadowmap_vertex>.
        Keep it even though custom lighting uses uWorldNormalMatrix.
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
    v_normalizedFaceUv = normalizedFaceUv;
    v_faceSize = globalFaceSize;
    v_uvSize = uvSize;
    vec4 saSSRViewPosition4 = modelViewMatrix * vec4(position, 1.0);
    vSA_SSRViewPosition = saSSRViewPosition4.xyz;
    vSA_SSRViewNormal = normalize(normalMatrix * normal);
    vSA_SSRClipPosition = projectionMatrix * saSSRViewPosition4;

    lift = highlight == 2.0 ? 0.22 :
           highlight == 1.0 ? 0.10 :
           0.0;

    gl_Position = vSA_SSRClipPosition;

    #include <shadowmap_vertex>
}`,
                fragment: `#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
${SCREEN_SPACE_REFLECTIONS_PARS_FRAGMENT}

uniform sampler2D map;
uniform vec3 LIGHTCOLOR;
uniform vec2 TILING;
uniform bool AUTO_TILE;
uniform vec2 TEXTURE_SIZE;

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
uniform int uToneMapping;
uniform float uLightWrap;

// AO Uniforms
uniform bool uAOEnabled;
uniform float uAOStrength;
uniform float uAORadius;
uniform float uAOPower;
uniform float uAOMin;
uniform float uAODirectInfluence;
uniform float uAOEdgeSharpness;
uniform float uAOCornerWeight;
uniform float uAOFaceNormalWeight;

// Checkbox option to clamp lighting
uniform bool uClampLighting;

uniform float uShadowStrength;
uniform float uShadowFloor;

varying vec2 vUv;
varying float lift;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 v_normalizedFaceUv;
varying vec2 v_faceSize;
varying vec2 v_uvSize;

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

// --- SHADOW FUNCTIONS ---

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

// --- VOXEL-FRIENDLY AMBIENT OCCLUSION ---

float computeVoxelAO(vec2 faceUv, vec3 normal) {
    if (!uAOEnabled) return 1.0;

    vec2 uv = clamp(faceUv, vec2(0.0), vec2(1.0));
    float radius = clamp(uAORadius, 0.0001, 0.5);
    float sharpness = clamp(uAOEdgeSharpness, 1.0, 32.0);
    float cornerWeight = clamp(uAOCornerWeight, 0.0, 3.0);
    float faceNormalWeight = clamp(uAOFaceNormalWeight, 0.0, 1.0);
    float strength = clamp(uAOStrength, 0.0, 1.0);

    float faceNormalAO = 1.0;
    if (faceNormalWeight > 0.0) {
        float downward = clamp(-normal.y, 0.0, 1.0);
        faceNormalAO = 1.0 - downward * faceNormalWeight * 0.25;
    }

    float edgeX = 1.0 - smoothstep(0.0, radius, uv.x) * smoothstep(0.0, radius, 1.0 - uv.x);
    float edgeY = 1.0 - smoothstep(0.0, radius, uv.y) * smoothstep(0.0, radius, 1.0 - uv.y);

    edgeX = pow(edgeX, sharpness * 0.1);
    edgeY = pow(edgeY, sharpness * 0.1);

    float edgeAO = max(edgeX, edgeY);

    float cornerX = smoothstep(0.0, radius, uv.x) * smoothstep(0.0, radius, 1.0 - uv.x);
    float cornerY = smoothstep(0.0, radius, uv.y) * smoothstep(0.0, radius, 1.0 - uv.y);
    float cornerAO = cornerX * cornerY * cornerWeight;

    float cavity = edgeAO + cornerAO;
    cavity = clamp(cavity, 0.0, 1.0);

    float ao = 1.0 - cavity * strength;
    ao *= faceNormalAO;

    ao = pow(clamp(ao, 0.0, 1.0), max(uAOPower, 0.001));

    return clamp(ao, clamp(uAOMin, 0.0, 1.0), 1.0);
}

// --- TONE MAPPING (Linear Workflow Compatible) ---

vec3 acesFilm(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 reinhard(vec3 x) {
    return x / (x + vec3(1.0));
}

vec3 uncharted2(vec3 x) {
    float A = 0.15;
    float B = 0.50;
    float C = 0.10;
    float D = 0.20;
    float E = 0.02;
    float F = 0.30;
    return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

vec3 hable(vec3 x) {
    float A = 0.22;
    float B = 0.30;
    float C = 0.10;
    float D = 0.20;
    float E = 0.01;
    float F = 0.30;
    return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

vec3 filmic(vec3 x) {
    float exposure = max(uExposure, 0.001);
    x *= exposure;
    x = max(vec3(0.0), x - 0.004);
    return (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);
}

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
    vec2 tiling_value = TILING;
    if (AUTO_TILE) {
        tiling_value = v_faceSize / TEXTURE_SIZE;
    }
    vec4 texel = texture2D(map, vUv * tiling_value);

    if (texel.a < 0.01) discard;

    // --- LINEARIZE INPUT TEXTURE ---
    // Converts input texture from sRGB to Linear space so lighting math is calculated correctly.
    #if defined( sRGBToLinear )
        texel.rgb = sRGBToLinear(texel.rgb);
    #else
        texel.rgb = pow(max(texel.rgb, vec3(0.0)), vec3(2.2));
    #endif

    vec3 normal = safeNormalize(vWorldNormal, vec3(0.0, 1.0, 0.0));

    vec3 directLight = vec3(0.0);

    for (int i = 0; i < 16; i++) {
        if (i >= max_light_number) break;
        if (uLightIntensity[i] <= 0.0) continue;

        vec3 lightContribution = computeLightContribution(i, normal, vWorldPos);
        float shadow = getCustomLightShadow(i);

        directLight += lightContribution * shadow;
    }

    float ambientOcclusion = computeVoxelAO(v_uvSize, normal);

    vec3 ambientLight = max(uAmbientColor, vec3(0.0)) * max(uAmbient, 0.0);
    ambientLight *= ambientOcclusion;

    float directAO = mix(1.0, ambientOcclusion, clamp(uAODirectInfluence, 0.0, 1.0));
    vec3 lighting = ambientLight + directLight * directAO;

    // --- LIGHTING CLAMP ---
    if (uClampLighting) {
        float maxChannel = max(lighting.r, max(lighting.g, lighting.b));
        if (maxChannel > 1.0) {
            lighting /= maxChannel;
        }
    }

    vec3 finalColor = texel.rgb * lighting;

    // --- HANDLE LIFT INTENSITY ---
    // Applying flat offsets directly in linear space can destroy dark areas.
    // If lift is high, apply a soft tint reduction to preserve midtones.
    finalColor += vec3(lift);
    finalColor *= LIGHTCOLOR;

    if (lift > 0.2) {
        finalColor.rg *= vec2(0.6, 0.7);
    }

    // Apply Tonemapping in Linear Space
    finalColor = applyToneMapping(finalColor);

    // --- GAMMA CORRECTION ---
    // Converts the processed linear colors back to sRGB for display.
    finalColor = pow(max(finalColor, vec3(0.0)), vec3(1.0 / 2.2));

    gl_FragColor = saApplyScreenSpaceReflection(
        vec4(finalColor, texel.a),
        vSA_SSRViewNormal,
        vSA_SSRViewPosition,
        vSA_SSRClipPosition,
        0.0,
        1.0
    );
}`,
                uniforms: createLightflowUniforms({
                    shadows: true,
                    screenSpaceReflections: true
                }),
                supportsScreenSpaceReflections: true,
                enableShadows: true
            });

            let pixelated_shaded_lightflow = new FancyShaderMaterial({
                id: 'pixelated_shaded_lightflow',
                name: tl('shader_architect.preset.pixelated_shaded_lightflow'),
                icon: 'gradient',
                isCustom: false,

                vertex: `#include <common>
#include <shadowmap_pars_vertex>

attribute float highlight;
attribute vec2 normalizedFaceUv;
attribute vec2 faceSize;
attribute vec2 globalFaceSize;
attribute vec2 uvSize;

uniform bool SHADE;
uniform int LIGHTSIDE;
uniform mat3 uWorldNormalMatrix;
uniform float uStylizedNormalInfluence;

varying vec2 vUv;
varying vec2 vNormalizedFaceUv;
varying vec2 vfaceSize;
varying vec2 vGlobalFaceSize;
varying vec2 vuvSize;

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
        Requerido por shadowmap_vertex de Three.js.
        No sustituir por vWorldNormal: Three necesita esta variable exacta.
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
    vNormalizedFaceUv = normalizedFaceUv;
    vfaceSize = faceSize;
    vGlobalFaceSize = globalFaceSize;
    vuvSize = uvSize;

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
uniform vec2 TILING;
uniform bool AUTO_TILE;
uniform vec2 TEXTURE_SIZE;

/* Lightflow lights */
uniform vec3 uLightPos[16];
uniform vec3 uLightDir[16];
uniform float uLightIntensity[16];
uniform float uLightDistance[16];
uniform float uLightConeAngle[16];
uniform float uLightPenumbra[16];
uniform int uLightType[16];
uniform vec3 uLightColor[16];
uniform int max_light_number;

/* Ambient */
uniform float uAmbient;
uniform vec3 uAmbientColor;

/* Artistic controls */
uniform float uExposure;
uniform int uToneMapping;
uniform float uLightWrap;
uniform bool uClampLighting;

/* Voxel AO */
uniform bool uAOEnabled;
uniform float uAOStrength;
uniform float uAORadius;
uniform float uAOPower;
uniform float uAOMin;
uniform float uAODirectInfluence;
uniform float uAOEdgeSharpness;
uniform float uAOCornerWeight;
uniform float uAOFaceNormalWeight;

/*
    Controles de sombra de Lightflow.
    Se aplican DESPUÉS del threshold pixelado.
*/
uniform float uShadowStrength;
uniform float uShadowFloor;

/*
    Controles del sistema legacy de sombras pixeladas.
*/
uniform float shadowPixelResolution;
uniform float shadowThreshold;

varying vec2 vUv;
varying vec2 vNormalizedFaceUv;
varying vec2 vfaceSize;
varying vec2 vGlobalFaceSize;
varying vec2 vuvSize;

varying float lift;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

#define SA_LIGHT_POINT 0
#define SA_LIGHT_DIRECTIONAL 1
#define SA_LIGHT_SPOT 2

#define TM_NONE 0
#define TM_ACES 1
#define TM_REINHARD 2
#define TM_UNCHARTED2 3
#define TM_HABLE 4
#define TM_FILMIC 5
#define TM_LINEAR 6

#define SHADOW_DET_EPS 1e-12
#define SHADOW_QUALITY_EPS 1e-5

vec3 safeNormalize(vec3 v, vec3 fallback) {
    float lenSq = dot(v, v);

    if (lenSq <= 1e-8) {
        return fallback;
    }

    return v * inversesqrt(lenSq);
}

/* ------------------------------------------------------------
   LIGHTFLOW LIGHTING
------------------------------------------------------------ */

float computeDiffuse(vec3 normal, vec3 lightDir) {
    float ndotl = dot(normal, lightDir);
    float wrapAmount = clamp(uLightWrap, 0.0, 1.0);

    if (wrapAmount > 0.0) {
        return clamp(
            (ndotl + wrapAmount) / (1.0 + wrapAmount),
            0.0,
            1.0
        );
    }

    return max(ndotl, 0.0);
}

float computeDistanceAttenuation(float dist, float maxDist) {
    dist = max(dist, 0.0001);

    if (maxDist > 0.0) {
        if (dist >= maxDist) {
            return 0.0;
        }

        float x = clamp(dist / maxDist, 0.0, 1.0);
        float falloff = clamp(1.0 - pow(x, 4.0), 0.0, 1.0);

        return (falloff * falloff) / max(dist * dist, 1.0);
    }

    return 1.0 / (1.0 + 0.04 * dist + 0.002 * dist * dist);
}

float computeSpotAttenuation(int lightIndex, vec3 lightDir) {
    vec3 spotDirection = safeNormalize(
        uLightDir[lightIndex],
        vec3(0.0, -1.0, 0.0)
    );

    float coneAngle = clamp(
        uLightConeAngle[lightIndex],
        0.001,
        3.14159265
    );

    float penumbra = clamp(
        uLightPenumbra[lightIndex],
        0.0,
        0.999
    );

    float theta = dot(-lightDir, spotDirection);

    float outerCutoff = cos(coneAngle);
    float innerCutoff = cos(coneAngle * (1.0 - penumbra));
    float epsilon = max(innerCutoff - outerCutoff, 0.0001);

    return clamp(
        (theta - outerCutoff) / epsilon,
        0.0,
        1.0
    );
}

vec3 computeLightContribution(
    int lightIndex,
    vec3 normal,
    vec3 worldPos
) {
    int type = uLightType[lightIndex];

    vec3 lightDir = vec3(0.0, 1.0, 0.0);
    float attenuation = 1.0;

    if (type == SA_LIGHT_DIRECTIONAL) {
        lightDir = safeNormalize(
            -uLightDir[lightIndex],
            vec3(0.0, 1.0, 0.0)
        );
    } else {
        vec3 lightVec = uLightPos[lightIndex] - worldPos;
        float dist = max(length(lightVec), 0.0001);

        lightDir = lightVec / dist;
        attenuation = computeDistanceAttenuation(
            dist,
            uLightDistance[lightIndex]
        );

        if (type == SA_LIGHT_SPOT) {
            attenuation *= computeSpotAttenuation(
                lightIndex,
                lightDir
            );
        }
    }

    float diffuse = computeDiffuse(normal, lightDir);
    float intensity = max(uLightIntensity[lightIndex], 0.0);

    return max(uLightColor[lightIndex], vec3(0.0)) *
        diffuse *
        intensity *
        attenuation;
}

/* ------------------------------------------------------------
   PIXELATED LEGACY SHADOWS
   Esta ruta se conserva independiente de uLightShadowIndex.
   No usar sombras por luz aquí: rompería el comportamiento legacy.
------------------------------------------------------------ */

vec2 getPixelCenterUV(vec2 localUV, vec2 gridSize) {
    vec2 grid = max(floor(gridSize + 0.5), vec2(1.0));

    vec2 safeUV = clamp(
        localUV,
        vec2(0.001),
        vec2(0.999)
    );

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

    float det =
        dUV_dx.x * dUV_dy.y -
        dUV_dx.y * dUV_dy.x;

    float uvArea =
        length(dUV_dx) *
        length(dUV_dy);

    float quality = abs(det) / max(
        uvArea,
        SHADOW_DET_EPS
    );

    if (
        abs(det) > SHADOW_DET_EPS &&
        quality > SHADOW_QUALITY_EPS
    ) {
        float invDet = 1.0 / det;

        vec4 dCoord_du =
            (dCoord_dx * dUV_dy.y -
            dCoord_dy * dUV_dx.y) *
            invDet;

        vec4 dCoord_dv =
            (dCoord_dy * dUV_dx.x -
            dCoord_dx * dUV_dy.x) *
            invDet;

        valid = true;

        return currentShadowCoord +
            dCoord_du * deltaUV.x +
            dCoord_dv * deltaUV.y;
    }

    return currentShadowCoord;
}

vec4 snapShadowCoordToTexel(
    vec4 shadowCoord,
    vec2 shadowMapSize
) {
    /*
        Protección contra shadow maps aún no inicializados.
        No modifica nada mientras shadowMapSize sea válido.
    */
    vec2 safeShadowMapSize = max(
        shadowMapSize,
        vec2(1.0)
    );

    vec2 texelSize = 1.0 / safeShadowMapSize;

    shadowCoord.xy =
        floor(shadowCoord.xy / texelSize + 0.5) *
        texelSize;

    shadowCoord.z -= 0.0005;

    return shadowCoord;
}

vec4 getProjectedShadowCoordAtUV(
    vec4 currentShadowCoord,
    vec2 targetUV,
    vec2 currentUV,
    vec2 shadowMapSize
) {
    bool valid;

    vec4 candidate = getRawShadowCoordAtUV(
        currentShadowCoord,
        targetUV,
        currentUV,
        valid
    );

    if (valid && candidate.w > 0.0) {
        vec3 projCandidate = candidate.xyz / candidate.w;

        if (
            projCandidate.x >= 0.0 &&
            projCandidate.x <= 1.0 &&
            projCandidate.y >= 0.0 &&
            projCandidate.y <= 1.0
        ) {
            return snapShadowCoordToTexel(
                candidate,
                shadowMapSize
            );
        }
    }

    return currentShadowCoord;
}

vec4 getPointShadowCoordAtUV(
    vec4 currentShadowCoord,
    vec2 targetUV,
    vec2 currentUV,
    vec2 shadowMapSize
) {
    bool valid;

    vec4 candidate = getRawShadowCoordAtUV(
        currentShadowCoord,
        targetUV,
        currentUV,
        valid
    );

    if (valid) {
        float currentLen = length(currentShadowCoord.xyz);
        float candidateLen = length(candidate.xyz);

        if (
            candidateLen > 0.1 &&
            abs(candidateLen - currentLen) < 1.0
        ) {
            return candidate;
        }
    }

    return currentShadowCoord;
}

float getPixelatedShadowAtUV(
    vec2 targetUV,
    vec2 currentUV
) {
    float shadow = 1.0;

    #ifdef USE_SHADOWMAP

    vec4 shadowCoord;

    #if NUM_DIR_LIGHT_SHADOWS > 0
        DirectionalLightShadow directionalLight;

        #pragma unroll_loop_start
        for (int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i++) {
            directionalLight = directionalLightShadows[i];

            vec2 safeShadowMapSize = max(
                directionalLight.shadowMapSize,
                vec2(1.0)
            );

            shadowCoord = getProjectedShadowCoordAtUV(
                vDirectionalShadowCoord[i],
                targetUV,
                currentUV,
                safeShadowMapSize
            );

            if (receiveShadow) {
                float rawShadow = getShadow(
                    directionalShadowMap[i],
                    safeShadowMapSize,
                    directionalLight.shadowBias,
                    0.0,
                    shadowCoord
                );

                shadow *= step(
                    clamp(shadowThreshold, 0.0, 1.0),
                    rawShadow
                );
            }
        }
        #pragma unroll_loop_end
    #endif

    #if NUM_SPOT_LIGHT_SHADOWS > 0
        SpotLightShadow spotLight;

        #pragma unroll_loop_start
        for (int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i++) {
            spotLight = spotLightShadows[i];

            vec2 safeShadowMapSize = max(
                spotLight.shadowMapSize,
                vec2(1.0)
            );

            shadowCoord = getProjectedShadowCoordAtUV(
                vSpotShadowCoord[i],
                targetUV,
                currentUV,
                safeShadowMapSize
            );

            if (receiveShadow) {
                float rawShadow = getShadow(
                    spotShadowMap[i],
                    safeShadowMapSize,
                    spotLight.shadowBias,
                    0.0,
                    shadowCoord
                );

                shadow *= step(
                    clamp(shadowThreshold, 0.0, 1.0),
                    rawShadow
                );
            }
        }
        #pragma unroll_loop_end
    #endif

    #if NUM_POINT_LIGHT_SHADOWS > 0
        PointLightShadow pointLight;

        #pragma unroll_loop_start
        for (int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i++) {
            pointLight = pointLightShadows[i];

            vec2 safeShadowMapSize = max(
                pointLight.shadowMapSize,
                vec2(1.0)
            );

            shadowCoord = getPointShadowCoordAtUV(
                vPointShadowCoord[i],
                targetUV,
                currentUV,
                safeShadowMapSize
            );

            if (receiveShadow) {
                float rawShadow = getPointShadow(
                    pointShadowMap[i],
                    safeShadowMapSize,
                    pointLight.shadowBias,
                    0.0,
                    shadowCoord,
                    pointLight.shadowCameraNear,
                    pointLight.shadowCameraFar
                );

                shadow *= step(
                    clamp(shadowThreshold, 0.0, 1.0),
                    rawShadow
                );
            }
        }
        #pragma unroll_loop_end
    #endif

    #endif

    return shadow;
}

/* ------------------------------------------------------------
   VOXEL AO
------------------------------------------------------------ */

float computeVoxelAO(vec2 faceUv, vec3 normal) {
    if (!uAOEnabled) {
        return 1.0;
    }

    vec2 uv = clamp(faceUv, vec2(0.0), vec2(1.0));

    float radius = clamp(uAORadius, 0.0001, 0.5);
    float sharpness = clamp(uAOEdgeSharpness, 1.0, 32.0);
    float cornerWeight = clamp(uAOCornerWeight, 0.0, 3.0);
    float faceNormalWeight = clamp(uAOFaceNormalWeight, 0.0, 1.0);
    float strength = clamp(uAOStrength, 0.0, 1.0);

    float faceNormalAO = 1.0;

    if (faceNormalWeight > 0.0) {
        float downward = clamp(-normal.y, 0.0, 1.0);

        faceNormalAO =
            1.0 -
            downward *
            faceNormalWeight *
            0.25;
    }

    float edgeX =
        1.0 -
        smoothstep(0.0, radius, uv.x) *
        smoothstep(0.0, radius, 1.0 - uv.x);

    float edgeY =
        1.0 -
        smoothstep(0.0, radius, uv.y) *
        smoothstep(0.0, radius, 1.0 - uv.y);

    edgeX = pow(edgeX, sharpness * 0.1);
    edgeY = pow(edgeY, sharpness * 0.1);

    float edgeAO = max(edgeX, edgeY);

    float cornerX =
        smoothstep(0.0, radius, uv.x) *
        smoothstep(0.0, radius, 1.0 - uv.x);

    float cornerY =
        smoothstep(0.0, radius, uv.y) *
        smoothstep(0.0, radius, 1.0 - uv.y);

    float cornerAO = cornerX * cornerY * cornerWeight;

    float cavity = clamp(
        edgeAO + cornerAO,
        0.0,
        1.0
    );

    float ao = 1.0 - cavity * strength;
    ao *= faceNormalAO;

    ao = pow(
        clamp(ao, 0.0, 1.0),
        max(uAOPower, 0.001)
    );

    return clamp(
        ao,
        clamp(uAOMin, 0.0, 1.0),
        1.0
    );
}

/* ------------------------------------------------------------
   TONE MAPPING
------------------------------------------------------------ */

vec3 acesFilm(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;

    return clamp(
        (x * (a * x + b)) /
        (x * (c * x + d) + e),
        0.0,
        1.0
    );
}

vec3 reinhard(vec3 x) {
    return x / (x + vec3(1.0));
}

vec3 uncharted2(vec3 x) {
    float A = 0.15;
    float B = 0.50;
    float C = 0.10;
    float D = 0.20;
    float E = 0.02;
    float F = 0.30;

    return (
        (x * (A * x + C * B) + D * E) /
        (x * (A * x + B) + D * F)
    ) - E / F;
}

vec3 hable(vec3 x) {
    float A = 0.22;
    float B = 0.30;
    float C = 0.10;
    float D = 0.20;
    float E = 0.01;
    float F = 0.30;

    return (
        (x * (A * x + C * B) + D * E) /
        (x * (A * x + B) + D * F)
    ) - E / F;
}

vec3 filmic(vec3 x) {
    float exposure = max(uExposure, 0.001);

    x *= exposure;
    x = max(vec3(0.0), x - 0.004);

    return (
        x * (6.2 * x + 0.5)
    ) / (
        x * (6.2 * x + 1.7) + 0.06
    );
}

vec3 linearTone(vec3 x) {
    return clamp(
        x * max(uExposure, 0.001),
        0.0,
        1.0
    );
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
    vec2 tiling_value = TILING;
    if (AUTO_TILE) {
        tiling_value = vfaceSize / TEXTURE_SIZE;
    }
    vec4 texel = texture2D(map, vUv * tiling_value);

    /*
        Esta parte mantiene exactamente el flujo visual de tu shader legacy:
        UV de cara -> centro de píxel -> shadow map extrapolado y snap.
    */
    vec2 shadowCurrentUV = vNormalizedFaceUv;

    vec2 shadowTargetUV = getPixelCenterUV(
        shadowCurrentUV,
        vfaceSize * shadowPixelResolution
    );

    /*
        Debe ejecutarse antes del discard.
        dFdx/dFdy necesita derivadas válidas incluso con transparencia.
    */
    float rawPixelatedShadow = getPixelatedShadowAtUV(
        shadowTargetUV,
        shadowCurrentUV
    );

    /*
        Valores por defecto:
        uShadowStrength = 1.0
        uShadowFloor = 0.0

        Con esos valores se conserva el resultado binario legacy.
    */
    float pixelatedShadow = max(
        rawPixelatedShadow,
        clamp(uShadowFloor, 0.0, 1.0)
    );

    pixelatedShadow = mix(
        1.0,
        pixelatedShadow,
        clamp(uShadowStrength, 0.0, 1.0)
    );

    if (texel.a < 0.01) {
        discard;
    }

    /*
        Lightflow trabaja en lineal.
    */
    texel.rgb = pow(
        max(texel.rgb, vec3(0.0)),
        vec3(2.2)
    );

    vec3 normal = safeNormalize(
        vWorldNormal,
        vec3(0.0, 1.0, 0.0)
    );

    vec3 directLight = vec3(0.0);

    for (int i = 0; i < 16; i++) {
        if (i >= max_light_number) {
            break;
        }

        if (uLightIntensity[i] <= 0.0) {
            continue;
        }

        directLight += computeLightContribution(
            i,
            normal,
            vWorldPos
        );
    }

    float ambientOcclusion = computeVoxelAO(
        vNormalizedFaceUv,
        normal
    );

    vec3 ambientLight =
        max(uAmbientColor, vec3(0.0)) *
        max(uAmbient, 0.0);

    ambientLight *= ambientOcclusion;

    float directAO = mix(
        1.0,
        ambientOcclusion,
        clamp(uAODirectInfluence, 0.0, 1.0)
    );

    /*
        La sombra pixelada solo oscurece iluminación directa.
        El ambient/AO sigue visible dentro de las sombras.
    */
    vec3 lighting =
        ambientLight +
        directLight *
        pixelatedShadow *
        directAO;

    if (uClampLighting) {
        float maxChannel = max(
            lighting.r,
            max(lighting.g, lighting.b)
        );

        if (maxChannel > 1.0) {
            lighting /= maxChannel;
        }
    }

    vec3 finalColor = texel.rgb * lighting;

    finalColor += vec3(lift);
    finalColor *= LIGHTCOLOR;

    if (lift > 0.2) {
        finalColor.rg *= vec2(0.6, 0.7);
    }

    finalColor = applyToneMapping(finalColor);

    finalColor = pow(
        max(finalColor, vec3(0.0)),
        vec3(1.0 / 2.2)
    );

    gl_FragColor = vec4(finalColor, texel.a);
}`,

                uniforms: {
                    ...createLightflowUniforms({
                        shadows: true
                    }),

                    "shadowPixelResolution": {
                        type: "float",
                        value: 1.0,
                        expose: true,
                        min: 1.0,
                        max: 16.0,
                        step: 0.05,
                        allow_higher: true,
                        allow_lower: false
                    },

                    "shadowThreshold": {
                        type: "float",
                        value: 0.75,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.05,
                        allow_higher: false,
                        allow_lower: false
                    }
                },

                enableShadows: true
            });


            let minecraft_promotional_bevel = new FancyShaderMaterial({
                id: 'minecraft_promotional_bevel',
                name: 'Minecraft Promotional Bevel',
                icon: 'auto_awesome',
                isCustom: false,
                enableShadows: true,

                vertex: `#include <common>
#include <shadowmap_pars_vertex>

attribute float highlight;
attribute vec2 normalizedFaceUv;
attribute vec2 faceSize;
attribute vec2 uvSize;

uniform bool SHADE;
uniform int LIGHTSIDE;
uniform mat3 uWorldNormalMatrix;

varying vec2 vPromoMapUv;
varying vec2 vPromoElementUv;
varying vec2 vPromoElementSize;
varying vec2 vPromoElementUvSize;

varying vec3 vPromoWorldPosition;
varying vec3 vPromoWorldNormal;

varying float vPromoClassicLight;
varying float vPromoHighlightLift;

vec3 promoSafeNormalize(
    vec3 value,
    vec3 fallbackValue
) {
    float valueLengthSquared = dot(value, value);

    if (valueLengthSquared <= 0.000001) {
        return fallbackValue;
    }

    return value * inversesqrt(valueLengthSquared);
}

vec3 promoApplyLightSide(vec3 normalValue) {
    vec3 result = normalValue;

    if (LIGHTSIDE == 1) {
        float previousY = result.y;
        result.y = -result.z;
        result.z = previousY;
    } else if (LIGHTSIDE == 2) {
        float previousY = result.y;
        result.y = result.x;
        result.x = previousY;
    } else if (LIGHTSIDE == 3) {
        result.y = -result.y;
    } else if (LIGHTSIDE == 4) {
        float previousY = result.y;
        result.y = result.z;
        result.z = previousY;
    } else if (LIGHTSIDE == 5) {
        float previousY = result.y;
        result.y = -result.x;
        result.x = previousY;
    }

    return promoSafeNormalize(
        result,
        vec3(0.0, 1.0, 0.0)
    );
}

void main() {
    vec4 worldPosition =
        modelMatrix *
        vec4(position, 1.0);

    /*
        shadowmap_vertex expects this normal declaration.
    */
    vec3 transformedNormal =
        normalize(normalMatrix * normal);

    vPromoWorldPosition = worldPosition.xyz;

    vPromoWorldNormal = promoSafeNormalize(
        uWorldNormalMatrix * normal,
        vec3(0.0, 1.0, 0.0)
    );

    vPromoMapUv = uv;
    vPromoElementUv = normalizedFaceUv;
    vPromoElementSize = faceSize;
    vPromoElementUvSize = uvSize;

    if (SHADE) {
        vec3 lightingNormal = promoApplyLightSide(
            vPromoWorldNormal
        );

        float verticalLight =
            (1.0 + lightingNormal.y) * 0.5;

        vPromoClassicLight =
            verticalLight * 0.5 +
            lightingNormal.x *
            lightingNormal.x * -0.15 +
            lightingNormal.z *
            lightingNormal.z * 0.05 +
            0.5;
    } else {
        vPromoClassicLight = 1.0;
    }

    vPromoHighlightLift =
        highlight == 2.0 ? 0.22 :
        highlight == 1.0 ? 0.10 :
        0.0;

    gl_Position =
        projectionMatrix *
        modelViewMatrix *
        vec4(position, 1.0);

    #include <shadowmap_vertex>
}`,

                fragment: `#include <common>

uniform sampler2D map;

uniform bool EMISSIVE;
uniform vec3 LIGHTCOLOR;
uniform vec2 TEXTURE_SIZE;

uniform vec3 uLightPos[16];
uniform vec3 uLightDir[16];
uniform vec3 uLightColor[16];

uniform float uLightIntensity[16];
uniform float uLightDistance[16];
uniform float uLightConeAngle[16];
uniform float uLightPenumbra[16];

uniform int uLightType[16];
uniform int max_light_number;

/*
    Local per-element outline controls.
    These only shade already visible fragments. They never draw outside a cube.
*/
uniform bool OUTLINE_ELEMENT_ENABLED;
uniform bool OUTLINE_ALPHA_ENABLED;
uniform bool OUTLINE_ALPHA_CLAMP_TO_ELEMENT;
uniform bool OUTLINE_ALPHA_DIAGONAL_ONLY;
uniform bool OUTLINE_CONSTANT_SCREEN_SIZE;

uniform float OUTLINE_WIDTH;
uniform float OUTLINE_FADE;
uniform float OUTLINE_INTENSITY;

uniform int OUTLINE_MODE;
uniform vec3 OUTLINE_COLOR;
uniform bool OUTLINE_AFFECTED_BY_LIGHT;

/*
    Per-face promotional bevel controls.
*/
uniform bool BEVEL_ENABLED;
uniform bool BEVEL_ALPHA_ENABLED;
uniform float BEVEL_WIDTH;
uniform float BEVEL_SOFTNESS;
uniform float BEVEL_SLOPE;
uniform float BEVEL_CORNER_FADE;

uniform float BEVEL_HIGHLIGHT;
uniform float BEVEL_SHADOW;
uniform float BEVEL_SHADOW_SATURATION;
uniform float BEVEL_LIGHT_STRENGTH;
uniform float BEVEL_HIGHLIGHT_COLOR_INFLUENCE;
uniform float BEVEL_LIGHT_COLOR_STRENGTH;

uniform bool BEVEL_GLOW_ENABLED;
uniform float BEVEL_GLOW_WIDTH;
uniform float BEVEL_GLOW_SOFTNESS;
uniform float BEVEL_GLOW_INTENSITY;
uniform float BEVEL_GLOW_COLOR_INFLUENCE;
uniform float BEVEL_GLOW_FACE_THRESHOLD;
uniform float BEVEL_GLOW_CORNER_FADE;

uniform bool BEVEL_GLOW_SYNC_TO_PROMO_RIM;
uniform bool BEVEL_GLOW_SYNC_DIRECTION;
uniform bool BEVEL_GLOW_REQUIRE_LIGHT_FACING;

uniform vec3 EDGE_FALLBACK_LIGHT_DIRECTION;

/*
    Read by MinecraftPromotionalSilhouetteManager.
    The manager renders a global, union silhouette of every cube with the same
    PROMO_RIM_GROUP. It is intentionally not sampled in this fragment shader.
*/
uniform bool PROMO_RIM_ENABLED;
uniform float PROMO_RIM_WIDTH;
uniform float PROMO_RIM_INTENSITY;
uniform vec3 PROMO_RIM_COLOR;
uniform int PROMO_RIM_COLOR_MODE;
uniform float PROMO_RIM_LIGHT_COLOR_INFLUENCE;
uniform vec2 PROMO_RIM_DIRECTION;
uniform float PROMO_RIM_DIRECTIONALITY;
uniform float PROMO_RIM_DIRECTION_SOFTNESS;
uniform int PROMO_RIM_GROUP;
uniform bool PROMO_RIM_OCCLUSION_ENABLED;
uniform float PROMO_RIM_DEPTH_EPSILON;

varying vec2 vPromoMapUv;
varying vec2 vPromoElementUv;
varying vec2 vPromoElementSize;
varying vec2 vPromoElementUvSize;

varying vec3 vPromoWorldPosition;
varying vec3 vPromoWorldNormal;

varying float vPromoClassicLight;
varying float vPromoHighlightLift;

#define SA_PROMO_POINT_LIGHT 0
#define SA_PROMO_DIRECTIONAL_LIGHT 1
#define SA_PROMO_SPOT_LIGHT 2

vec3 promoSafeNormalize(
    vec3 value,
    vec3 fallbackValue
) {
    float valueLengthSquared = dot(value, value);

    if (valueLengthSquared <= 0.000001) {
        return fallbackValue;
    }

    return value * inversesqrt(valueLengthSquared);
}

vec3 promoRgbToHsv(vec3 rgb) {
    vec4 K = vec4(
        0.0,
        -1.0 / 3.0,
        2.0 / 3.0,
        -1.0
    );

    vec4 p = mix(
        vec4(rgb.bg, K.wz),
        vec4(rgb.gb, K.xy),
        step(rgb.b, rgb.g)
    );

    vec4 q = mix(
        vec4(p.xyw, rgb.r),
        vec4(rgb.r, p.yzx),
        step(p.x, rgb.r)
    );

    float delta = q.x - min(q.w, q.y);
    float epsilon = 0.0000001;

    return vec3(
        abs(q.z + (q.w - q.y) / (6.0 * delta + epsilon)),
        delta / (q.x + epsilon),
        q.x
    );
}

vec3 promoHsvToRgb(vec3 hsv) {
    vec4 K = vec4(
        1.0,
        2.0 / 3.0,
        1.0 / 3.0,
        3.0
    );

    vec3 p = abs(
        fract(hsv.xxx + K.xyz) * 6.0 -
        K.www
    );

    return hsv.z * mix(
        K.xxx,
        clamp(p - K.xxx, 0.0, 1.0),
        hsv.y
    );
}

/*
    Derives the local-UV -> atlas-UV transform before any discard.
    It prevents alpha-outline samples from jumping to arbitrary atlas pixels.
*/
mat2 promoGetElementToMapJacobian() {
    vec2 localDx = dFdx(vPromoElementUv);
    vec2 localDy = dFdy(vPromoElementUv);

    vec2 mapDx = dFdx(vPromoMapUv);
    vec2 mapDy = dFdy(vPromoMapUv);

    float determinant =
        localDx.x * localDy.y -
        localDx.y * localDy.x;

    if (abs(determinant) <= 0.000001) {
        return mat2(0.0);
    }

    float inverseDeterminant = 1.0 / determinant;

    vec2 mapPerLocalX =
        (mapDx * localDy.y - mapDy * localDx.y) *
        inverseDeterminant;

    vec2 mapPerLocalY =
        (mapDy * localDx.x - mapDx * localDy.x) *
        inverseDeterminant;

    return mat2(
        mapPerLocalX,
        mapPerLocalY
    );
}

/*
    Reconstructs a stable world-space tangent frame for the current cube face.
    It is based on the element-local face UV, not the atlas UV.
*/
void promoGetFaceFrame(
    vec3 normalValue,
    out vec3 tangentU,
    out vec3 tangentV
) {
    vec3 worldDx = dFdx(vPromoWorldPosition);
    vec3 worldDy = dFdy(vPromoWorldPosition);

    vec2 localDx = dFdx(vPromoElementUv);
    vec2 localDy = dFdy(vPromoElementUv);

    float determinant =
        localDx.x * localDy.y -
        localDx.y * localDy.x;

    vec3 fallbackTangentU;

    if (abs(normalValue.y) < 0.98) {
        fallbackTangentU = promoSafeNormalize(
            cross(vec3(0.0, 1.0, 0.0), normalValue),
            vec3(1.0, 0.0, 0.0)
        );
    } else {
        fallbackTangentU = promoSafeNormalize(
            cross(vec3(1.0, 0.0, 0.0), normalValue),
            vec3(0.0, 0.0, 1.0)
        );
    }

    if (abs(determinant) > 0.000001) {
        float inverseDeterminant = 1.0 / determinant;

        tangentU =
            (worldDx * localDy.y - worldDy * localDx.y) *
            inverseDeterminant;

        tangentV =
            (worldDy * localDx.x - worldDx * localDy.x) *
            inverseDeterminant;
    } else {
        tangentU = fallbackTangentU;
        tangentV = cross(normalValue, tangentU);
    }

    tangentU = promoSafeNormalize(
        tangentU,
        fallbackTangentU
    );

    tangentV -= tangentU * dot(tangentU, tangentV);

    tangentV = promoSafeNormalize(
        tangentV,
        promoSafeNormalize(
            cross(normalValue, tangentU),
            vec3(0.0, 0.0, 1.0)
        )
    );
}

vec4 promoGetEdgeBands(
    vec2 localUv,
    vec2 elementSize,
    float absoluteWidth,
    float softness
) {
    vec2 safeSize = max(abs(elementSize), vec2(0.0001));
    vec2 localPosition = clamp(localUv, vec2(0.0), vec2(1.0)) * safeSize;

    float bevelWidth = max(absoluteWidth, 0.00001);
    float feather = max(bevelWidth * max(softness, 0.0), 0.00001);

    float leftBand = 1.0 - smoothstep(
        bevelWidth,
        bevelWidth + feather,
        localPosition.x
    );

    float rightBand = 1.0 - smoothstep(
        bevelWidth,
        bevelWidth + feather,
        safeSize.x - localPosition.x
    );

    float bottomBand = 1.0 - smoothstep(
        bevelWidth,
        bevelWidth + feather,
        localPosition.y
    );

    float topBand = 1.0 - smoothstep(
        bevelWidth,
        bevelWidth + feather,
        safeSize.y - localPosition.y
    );

    return clamp(
        vec4(
            leftBand,
            rightBand,
            bottomBand,
            topBand
        ),
        0.0,
        1.0
    );
}

float promoDistanceAttenuation(
    float distanceToLight,
    float lightRange
) {
    distanceToLight = max(distanceToLight, 0.0001);

    if (lightRange > 0.0) {
        if (distanceToLight >= lightRange) {
            return 0.0;
        }

        float normalizedDistance = clamp(
            distanceToLight / lightRange,
            0.0,
            1.0
        );

        float falloff =
            1.0 -
            normalizedDistance *
            normalizedDistance;

        return falloff * falloff;
    }

    return 1.0 / (
        1.0 +
        0.04 * distanceToLight +
        0.002 * distanceToLight * distanceToLight
    );
}

float promoSpotAttenuation(
    int lightIndex,
    vec3 surfaceToLightDirection
) {
    vec3 spotDirection = promoSafeNormalize(
        uLightDir[lightIndex],
        vec3(0.0, -1.0, 0.0)
    );

    float outerAngle = clamp(
        uLightConeAngle[lightIndex],
        0.001,
        3.14159265
    );

    float penumbra = clamp(
        uLightPenumbra[lightIndex],
        0.0,
        0.999
    );

    float outerCutoff = cos(outerAngle);
    float innerCutoff = cos(
        outerAngle * (1.0 - penumbra)
    );

    float theta = dot(
        surfaceToLightDirection,
        -spotDirection
    );

    return clamp(
        (theta - outerCutoff) /
        max(innerCutoff - outerCutoff, 0.0001),
        0.0,
        1.0
    );
}

/*
    Collects an artistic directional key from Light Manager. It is only used
    for bevel orientation; it does not replace Lightflow's future lighting.
*/
void promoGetKeyLight(
    out vec3 keyDirection,
    out vec3 keyColor,
    out float keyEnergy
) {
    vec3 weightedDirection = vec3(0.0);
    vec3 weightedColor = vec3(0.0);
    float totalWeight = 0.0;

    for (int index = 0; index < 16; index++) {
        if (index >= max_light_number) {
            break;
        }

        float intensity = max(
            uLightIntensity[index],
            0.0
        );

        if (intensity <= 0.00001) {
            continue;
        }

        int lightType = uLightType[index];

        vec3 currentDirection;
        float attenuation = 1.0;

        if (lightType == SA_PROMO_DIRECTIONAL_LIGHT) {
            currentDirection = promoSafeNormalize(
                -uLightDir[index],
                vec3(-0.45, 0.80, 0.35)
            );
        } else {
            vec3 toLight =
                uLightPos[index] -
                vPromoWorldPosition;

            float distanceToLight = max(
                length(toLight),
                0.0001
            );

            currentDirection =
                toLight /
                distanceToLight;

            attenuation = promoDistanceAttenuation(
                distanceToLight,
                uLightDistance[index]
            );

            if (lightType == SA_PROMO_SPOT_LIGHT) {
                attenuation *= promoSpotAttenuation(
                    index,
                    currentDirection
                );
            }
        }

        float weight =
            intensity *
            attenuation;

        if (weight <= 0.00001) {
            continue;
        }

        weightedDirection +=
            currentDirection *
            weight;

        weightedColor +=
            max(uLightColor[index], vec3(0.0)) *
            weight;

        totalWeight += weight;
    }

    vec3 fallbackDirection = promoSafeNormalize(
        EDGE_FALLBACK_LIGHT_DIRECTION,
        vec3(-0.45, 0.80, 0.35)
    );

    if (totalWeight <= 0.00001) {
        keyDirection = fallbackDirection;
        keyColor = vec3(1.0);
        keyEnergy = 1.0;
        return;
    }

    keyDirection = promoSafeNormalize(
        weightedDirection,
        fallbackDirection
    );

    keyColor =
        weightedColor /
        max(totalWeight, 0.0001);

    keyEnergy = clamp(
        1.0 - exp(-totalWeight),
        0.0,
        1.0
    );
}

float promoCornerTaper(
    float coordinate,
    float cornerFade
) {
    if (cornerFade <= 0.00001) {
        return 1.0;
    }

    return min(
        smoothstep(0.0, cornerFade, coordinate),
        smoothstep(0.0, cornerFade, 1.0 - coordinate)
    );
}

float promoGetInnerGlowIntensity() {
    if (BEVEL_GLOW_SYNC_TO_PROMO_RIM) {
        return max(PROMO_RIM_INTENSITY, 0.0);
    }

    return max(BEVEL_GLOW_INTENSITY, 0.0);
}

vec3 promoResolveSharedRimGlowColor(vec3 keyColor) {
    vec3 rimColor = max(PROMO_RIM_COLOR, vec3(0.0));
    vec3 lightColor = max(keyColor, vec3(0.0));

    if (PROMO_RIM_COLOR_MODE == 2) {
        return lightColor;
    }

    if (PROMO_RIM_COLOR_MODE == 1) {
        return mix(
            rimColor,
            lightColor,
            clamp(PROMO_RIM_LIGHT_COLOR_INFLUENCE, 0.0, 1.0)
        );
    }

    return rimColor;
}

vec3 promoGetInnerGlowColor(
    vec3 keyColor,
    vec3 normalizedKeyColor
) {
    if (BEVEL_GLOW_SYNC_TO_PROMO_RIM) {
        return promoResolveSharedRimGlowColor(keyColor);
    }

    return mix(
        vec3(1.0),
        normalizedKeyColor,
        clamp(BEVEL_GLOW_COLOR_INFLUENCE, 0.0, 1.0)
    );
}

float promoSampleNeighborAlpha(
    vec2 localOffset,
    vec2 mapOffset,
    float sourceAlpha,
    bool clampToElement
) {
    if (clampToElement) {
        vec2 localSample =
            vPromoElementUv +
            localOffset;

        if (
            localSample.x < 0.0 ||
            localSample.y < 0.0 ||
            localSample.x > 1.0 ||
            localSample.y > 1.0
        ) {
            return sourceAlpha;
        }
    }

    vec2 mapSample =
        vPromoMapUv +
        mapOffset;

    if (
        mapSample.x < 0.0 ||
        mapSample.y < 0.0 ||
        mapSample.x > 1.0 ||
        mapSample.y > 1.0
    ) {
        return 0.0;
    }

    return texture2D(map, mapSample).a;
}

vec4 promoGetAlphaBands(
    float sourceAlpha,
    float width,
    mat2 elementToMapJacobian
) {
    if (!BEVEL_ALPHA_ENABLED || width <= 0.0) {
        return vec4(0.0);
    }
    
    vec2 safeSize = max(abs(vPromoElementSize), vec2(0.0001));
    vec2 localStep = vec2(width) / safeSize;
    
    bool validJacobian = length(elementToMapJacobian[0]) + length(elementToMapJacobian[1]) > 0.000001;
    
    vec2 fallbackMapStep = max(
        abs(vPromoElementUvSize) * width / max(TEXTURE_SIZE, vec2(1.0)),
        vec2(0.00001)
    );

    // 1. Calculamos las distancias en cruz (Norte, Sur, Este, Oeste)
    vec2 mStepL = validJacobian ? elementToMapJacobian * vec2(-localStep.x, 0.0) : vec2(-fallbackMapStep.x, 0.0);
    vec2 mStepR = validJacobian ? elementToMapJacobian * vec2(localStep.x, 0.0) : vec2(fallbackMapStep.x, 0.0);
    vec2 mStepB = validJacobian ? elementToMapJacobian * vec2(0.0, -localStep.y) : vec2(0.0, -fallbackMapStep.y);
    vec2 mStepT = validJacobian ? elementToMapJacobian * vec2(0.0, localStep.y) : vec2(0.0, fallbackMapStep.y);

    // 2. Calculamos las distancias en diagonal (Esquinas)
    vec2 stepTL = vec2(-localStep.x, localStep.y);
    vec2 mStepTL = validJacobian ? elementToMapJacobian * stepTL : vec2(-fallbackMapStep.x, fallbackMapStep.y);
    
    vec2 stepTR = vec2(localStep.x, localStep.y);
    vec2 mStepTR = validJacobian ? elementToMapJacobian * stepTR : vec2(fallbackMapStep.x, fallbackMapStep.y);
    
    vec2 stepBL = vec2(-localStep.x, -localStep.y);
    vec2 mStepBL = validJacobian ? elementToMapJacobian * stepBL : vec2(-fallbackMapStep.x, -fallbackMapStep.y);
    
    vec2 stepBR = vec2(localStep.x, -localStep.y);
    vec2 mStepBR = validJacobian ? elementToMapJacobian * stepBR : vec2(fallbackMapStep.x, -fallbackMapStep.y);

    // 3. Muestreamos la transparencia en cruz
    float aL = promoSampleNeighborAlpha(vec2(-localStep.x, 0.0), mStepL, sourceAlpha, true);
    float aR = promoSampleNeighborAlpha(vec2(localStep.x, 0.0), mStepR, sourceAlpha, true);
    float aB = promoSampleNeighborAlpha(vec2(0.0, -localStep.y), mStepB, sourceAlpha, true);
    float aT = promoSampleNeighborAlpha(vec2(0.0, localStep.y), mStepT, sourceAlpha, true);

    // 4. Muestreamos la transparencia en las esquinas
    float aTL = promoSampleNeighborAlpha(stepTL, mStepTL, sourceAlpha, true);
    float aTR = promoSampleNeighborAlpha(stepTR, mStepTR, sourceAlpha, true);
    float aBL = promoSampleNeighborAlpha(stepBL, mStepBL, sourceAlpha, true);
    float aBR = promoSampleNeighborAlpha(stepBR, mStepBR, sourceAlpha, true);

    // 5. Detección de esquinas internas: 
    // Se activa (1.0) solo si el pixel está flanqueado por lados sólidos, pero la esquina diagonal está vacía.
    float innerTL = aL * aT * (1.0 - aTL);
    float innerTR = aR * aT * (1.0 - aTR);
    float innerBL = aL * aB * (1.0 - aBL);
    float innerBR = aR * aB * (1.0 - aBR);

    // 6. Añadimos el peso de las esquinas internas a las bandas correspondientes para conectarlas
    float leftBand = (sourceAlpha - aL) + innerTL + innerBL;
    float rightBand = (sourceAlpha - aR) + innerTR + innerBR;
    float bottomBand = (sourceAlpha - aB) + innerBL + innerBR;
    float topBand = (sourceAlpha - aT) + innerTL + innerTR;

    return clamp(vec4(leftBand, rightBand, bottomBand, topBand), 0.0, 1.0);
}


vec3 promoApplyBevel(
    vec3 sourceColor,
    vec3 normalValue,
    vec3 tangentU,
    vec3 tangentV,
    float sourceAlpha,
    mat2 elementToMapJacobian
) {
    float innerGlowIntensity = promoGetInnerGlowIntensity();

    bool primaryBevelEnabled =
        BEVEL_WIDTH > 0.0 &&
        (
            BEVEL_HIGHLIGHT > 0.0 ||
            BEVEL_SHADOW > 0.0
        );

    bool innerGlowEnabled =
        BEVEL_GLOW_ENABLED &&
        BEVEL_GLOW_WIDTH > 0.0 &&
        innerGlowIntensity > 0.0;

    if (
        !BEVEL_ENABLED ||
        (!primaryBevelEnabled && !innerGlowEnabled)
    ) {
        return sourceColor;
    }

    vec3 keyDirection;
    vec3 keyColor;
    float keyEnergy;

    promoGetKeyLight(
        keyDirection,
        keyColor,
        keyEnergy
    );

    vec3 normalizedKeyColor =
        keyColor /
        max(
            max(keyColor.r, max(keyColor.g, keyColor.b)),
            0.0001
        );

    vec4 edgeBands = promoGetEdgeBands(
        vPromoElementUv,
        vPromoElementSize,
        max(BEVEL_WIDTH, 0.00001),
        BEVEL_SOFTNESS
    );
    
    vec4 alphaBands = promoGetAlphaBands(sourceAlpha, max(BEVEL_WIDTH, 0.00001), elementToMapJacobian);
    edgeBands = max(edgeBands, alphaBands);

    float slope = clamp(BEVEL_SLOPE, 0.0, 2.0);

    vec3 nL = promoSafeNormalize(
        normalValue - tangentU * slope,
        normalValue
    );

    vec3 nR = promoSafeNormalize(
        normalValue + tangentU * slope,
        normalValue
    );

    vec3 nB = promoSafeNormalize(
        normalValue - tangentV * slope,
        normalValue
    );

    vec3 nT = promoSafeNormalize(
        normalValue + tangentV * slope,
        normalValue
    );

    float typeL = smoothstep(
        -0.05,
        0.05,
        dot(nL, keyDirection)
    );

    float typeR = smoothstep(
        -0.05,
        0.05,
        dot(nR, keyDirection)
    );

    float typeB = smoothstep(
        -0.05,
        0.05,
        dot(nB, keyDirection)
    );

    float typeT = smoothstep(
        -0.05,
        0.05,
        dot(nT, keyDirection)
    );

    float glowTypeL = typeL;
    float glowTypeR = typeR;
    float glowTypeB = typeB;
    float glowTypeT = typeT;

    if (BEVEL_GLOW_SYNC_DIRECTION) {
        vec3 viewKeyDir = (viewMatrix * vec4(keyDirection, 0.0)).xyz;
        vec2 screenKeyDir = normalize(viewKeyDir.xy + vec2(0.00001));

        vec2 snL = normalize((viewMatrix * vec4(nL, 0.0)).xy + vec2(0.00001));
        vec2 snR = normalize((viewMatrix * vec4(nR, 0.0)).xy + vec2(0.00001));
        vec2 snB = normalize((viewMatrix * vec4(nB, 0.0)).xy + vec2(0.00001));
        vec2 snT = normalize((viewMatrix * vec4(nT, 0.0)).xy + vec2(0.00001));

        glowTypeL = smoothstep(-0.05, 0.05, dot(snL, screenKeyDir));
        glowTypeR = smoothstep(-0.05, 0.05, dot(snR, screenKeyDir));
        glowTypeB = smoothstep(-0.05, 0.05, dot(snB, screenKeyDir));
        glowTypeT = smoothstep(-0.05, 0.05, dot(snT, screenKeyDir));
    }

    float fadeLimit = max(
        clamp(BEVEL_CORNER_FADE, 0.0, 1.0),
        0.0001
    );

    float gapL = smoothstep(
        0.0,
        fadeLimit,
        vPromoElementUv.x
    );

    float gapR = 1.0 - smoothstep(
        1.0 - fadeLimit,
        1.0,
        vPromoElementUv.x
    );

    float gapB = smoothstep(
        0.0,
        fadeLimit,
        vPromoElementUv.y
    );

    float gapT = 1.0 - smoothstep(
        1.0 - fadeLimit,
        1.0,
        vPromoElementUv.y
    );

    float matchTL = 1.0 - abs(typeT - typeL);
    float matchTR = 1.0 - abs(typeT - typeR);
    float matchBL = 1.0 - abs(typeB - typeL);
    float matchBR = 1.0 - abs(typeB - typeR);

    float bevelL =
        edgeBands.x *
        mix(gapT, 1.0, matchTL) *
        mix(gapB, 1.0, matchBL);

    float bevelR =
        edgeBands.y *
        mix(gapT, 1.0, matchTR) *
        mix(gapB, 1.0, matchBR);

    float bevelB =
        edgeBands.z *
        mix(gapL, 1.0, matchBL) *
        mix(gapR, 1.0, matchBR);

    float bevelT =
        edgeBands.w *
        mix(gapL, 1.0, matchTL) *
        mix(gapR, 1.0, matchTR);

    float rawHighlightMask = max(
        max(bevelL * typeL, bevelR * typeR),
        max(bevelB * typeB, bevelT * typeT)
    );

    float shadowMask = max(
        max(bevelL * (1.0 - typeL), bevelR * (1.0 - typeR)),
        max(bevelB * (1.0 - typeB), bevelT * (1.0 - typeT))
    );

    rawHighlightMask = clamp(
        rawHighlightMask *
        keyEnergy *
        max(BEVEL_LIGHT_STRENGTH, 0.0),
        0.0,
        1.0
    );

    shadowMask = clamp(
        shadowMask *
        mix(0.35, 1.0, keyEnergy),
        0.0,
        1.0
    );

    float innerGlowMask = 0.0;

    if (innerGlowEnabled) {
        float faceIllumination = 1.0;
        
        if (BEVEL_GLOW_REQUIRE_LIGHT_FACING) {
            float glowFaceThreshold = clamp(
                BEVEL_GLOW_FACE_THRESHOLD,
                -1.0,
                1.0
            );

            faceIllumination = smoothstep(
                glowFaceThreshold - 0.15,
                glowFaceThreshold + 0.15,
                dot(normalValue, keyDirection)
            );
        }

        vec4 glowBands = promoGetEdgeBands(
            vPromoElementUv,
            vPromoElementSize,
            max(BEVEL_GLOW_WIDTH, BEVEL_WIDTH),
            BEVEL_GLOW_SOFTNESS
        );
        
        vec4 alphaGlowBands = promoGetAlphaBands(sourceAlpha, max(BEVEL_GLOW_WIDTH, BEVEL_WIDTH), elementToMapJacobian);
        glowBands = max(glowBands, alphaGlowBands);

        float glowFadeLimit = max(
            clamp(BEVEL_GLOW_CORNER_FADE, 0.0, 1.0),
            0.0001
        );

        float glowGapL = smoothstep(
            0.0,
            glowFadeLimit,
            vPromoElementUv.x
        );

        float glowGapR = 1.0 - smoothstep(
            1.0 - glowFadeLimit,
            1.0,
            vPromoElementUv.x
        );

        float glowGapB = smoothstep(
            0.0,
            glowFadeLimit,
            vPromoElementUv.y
        );

        float glowGapT = 1.0 - smoothstep(
            1.0 - glowFadeLimit,
            1.0,
            vPromoElementUv.y
        );

        // NUEVA LÓGICA DE CONEXIÓN DE ESQUINAS
            // Si el borde adyacente está encendido (> 0.01), fuerza la esquina sólida (1.0).
            // Si está apagado, usa el gap para desvanecer suavemente.
            float adjT = max(glowGapT, step(0.01, glowTypeT));
            float adjB = max(glowGapB, step(0.01, glowTypeB));
            float adjL = max(glowGapL, step(0.01, glowTypeL));
            float adjR = max(glowGapR, step(0.01, glowTypeR));

            float glowL =
                glowBands.x *
                glowTypeL *
                adjT *
                adjB;

            float glowR =
                glowBands.y *
                glowTypeR *
                adjT *
                adjB;

            float glowB =
                glowBands.z *
                glowTypeB *
                adjL *
                adjR;

            float glowT =
                glowBands.w *
                glowTypeT *
                adjL *
                adjR;

            innerGlowMask = clamp(
            max(
                max(glowL, glowR),
                max(glowB, glowT)
            ) *
            faceIllumination,
            0.0,
            1.0
        );
    }

    float highlightMask =
        rawHighlightMask *
        (1.0 - innerGlowMask);

    shadowMask *=
        1.0 - innerGlowMask;

    vec3 result = sourceColor;

    float lightColorAmount = clamp(
        BEVEL_HIGHLIGHT_COLOR_INFLUENCE *
        max(BEVEL_LIGHT_COLOR_STRENGTH, 0.0),
        0.0,
        1.0
    );

    vec3 highlightColor = mix(
        vec3(1.0),
        normalizedKeyColor,
        lightColorAmount
    );

    float lightColorBoost = max(
        BEVEL_LIGHT_COLOR_STRENGTH - 1.0,
        0.0
    );

    highlightColor *=
        1.0 +
        normalizedKeyColor *
        lightColorBoost *
        clamp(BEVEL_HIGHLIGHT_COLOR_INFLUENCE, 0.0, 1.0);

    result +=
        highlightColor *
        highlightMask *
        max(BEVEL_HIGHLIGHT, 0.0);

    if (innerGlowMask > 0.0) {
        vec3 glowColor = promoGetInnerGlowColor(
            keyColor,
            normalizedKeyColor
        );

        float glowEnergy =
            BEVEL_GLOW_SYNC_TO_PROMO_RIM
                ? 1.0
                : keyEnergy;

        result +=
            glowColor *
            innerGlowMask *
            innerGlowIntensity *
            glowEnergy;
    }

    vec3 hsv = promoRgbToHsv(
        clamp(result, vec3(0.0), vec3(1.0))
    );

    hsv.z *=
        1.0 -
        shadowMask *
        clamp(BEVEL_SHADOW, 0.0, 1.0);

    hsv.y +=
        shadowMask *
        clamp(BEVEL_SHADOW_SATURATION, 0.0, 1.0) *
        (1.0 - hsv.y);

    hsv.y = clamp(hsv.y, 0.0, 1.0);
    hsv.z = clamp(hsv.z, 0.0, 1.0);

    return promoHsvToRgb(hsv);
}

float promoGetElementOutlineMask() {
    vec2 safeSize = max(
        abs(vPromoElementSize),
        vec2(0.0001)
    );

    vec2 localPosition =
        clamp(vPromoElementUv, vec2(0.0), vec2(1.0)) *
        safeSize;

    float width = max(OUTLINE_WIDTH, 0.0);

    if (OUTLINE_CONSTANT_SCREEN_SIZE) {
        vec2 fw = fwidth(vPromoElementUv * safeSize);
        width *= max(fw.x, fw.y) * 15.0;
    }

    if (width <= 0.00001) {
        return 0.0;
    }

    float leftMask = 1.0 - smoothstep(
        width,
        width + 0.0001,
        localPosition.x
    );

    float rightMask = 1.0 - smoothstep(
        width,
        width + 0.0001,
        safeSize.x - localPosition.x
    );

    float bottomMask = 1.0 - smoothstep(
        width,
        width + 0.0001,
        localPosition.y
    );

    float topMask = 1.0 - smoothstep(
        width,
        width + 0.0001,
        safeSize.y - localPosition.y
    );

    return max(
        max(leftMask, rightMask),
        max(bottomMask, topMask)
    );
}


float promoGetAlphaOutlineMask(
    float sourceAlpha,
    mat2 elementToMapJacobian
) {
    if (
        !OUTLINE_ALPHA_ENABLED ||
        OUTLINE_WIDTH <= 0.0
    ) {
        return 0.0;
    }

    vec2 safeSize = max(
        abs(vPromoElementSize),
        vec2(0.0001)
    );

    float currentOutlineWidth = max(OUTLINE_WIDTH, 0.0);
    if (OUTLINE_CONSTANT_SCREEN_SIZE) {
        vec2 fw = fwidth(vPromoElementUv * safeSize);
        currentOutlineWidth *= max(fw.x, fw.y) * 15.0;
    }

    vec2 localStep =
        vec2(currentOutlineWidth) /
        safeSize;

    bool validJacobian =
        length(elementToMapJacobian[0]) +
        length(elementToMapJacobian[1]) >
        0.000001;

    bool clampToElement =
        OUTLINE_ALPHA_CLAMP_TO_ELEMENT &&
        validJacobian;

    vec2 fallbackMapStep = max(
        abs(vPromoElementUvSize) *
        OUTLINE_WIDTH /
        max(TEXTURE_SIZE, vec2(1.0)),
        vec2(0.00001)
    );

    float nearestNeighborAlpha = 1.0;

    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            if (x == 0 && y == 0) {
                continue;
            }

            if (
                OUTLINE_ALPHA_DIAGONAL_ONLY &&
                abs(x) + abs(y) != 2
            ) {
                continue;
            }

            vec2 localOffset =
                vec2(float(x), float(y)) *
                localStep;

            vec2 mapOffset = validJacobian
                ? elementToMapJacobian * localOffset
                : vec2(
                    float(x) * fallbackMapStep.x,
                    float(y) * fallbackMapStep.y
                );

            nearestNeighborAlpha = min(
                nearestNeighborAlpha,
                promoSampleNeighborAlpha(
                    localOffset,
                    mapOffset,
                    sourceAlpha,
                    clampToElement
                )
            );
        }
    }

    return clamp(
        sourceAlpha - nearestNeighborAlpha,
        0.0,
        1.0
    );
}

vec3 promoApplyOutline(
    vec3 sourceColor,
    float sourceAlpha,
    mat2 elementToMapJacobian
) {
    if (
        OUTLINE_WIDTH <= 0.0 ||
        OUTLINE_INTENSITY <= 0.0 ||
        (
            !OUTLINE_ELEMENT_ENABLED &&
            !OUTLINE_ALPHA_ENABLED
        )
    ) {
        return sourceColor;
    }

    float elementMask =
        OUTLINE_ELEMENT_ENABLED
            ? promoGetElementOutlineMask()
            : 0.0;

    float alphaMask = promoGetAlphaOutlineMask(
        sourceAlpha,
        elementToMapJacobian
    );

    if (OUTLINE_FADE <= 0.0) {
        elementMask = ceil(elementMask);
    } else {
        float fade = clamp(
            OUTLINE_FADE,
            0.001,
            1.0
        );

        elementMask = smoothstep(
            0.0,
            fade,
            elementMask
        );

        alphaMask = smoothstep(
            0.0,
            fade,
            alphaMask
        );
    }

    float outlineMask = max(
        elementMask,
        alphaMask
    );

    if (outlineMask <= 0.0) {
        return sourceColor;
    }

    float intensity = clamp(
        outlineMask *
        OUTLINE_INTENSITY,
        0.0,
        1.0
    );

    if (
        OUTLINE_AFFECTED_BY_LIGHT &&
        !EMISSIVE
    ) {
        intensity *= clamp(
            vPromoClassicLight,
            0.0,
            1.5
        );
    }

    if (OUTLINE_MODE == 0) {
        return clamp(
            sourceColor + vec3(intensity),
            vec3(0.0),
            vec3(1.0)
        );
    }

    if (OUTLINE_MODE == 1) {
        return sourceColor * (1.0 - intensity);
    }

    vec3 outlineColor = OUTLINE_COLOR;

    if (
        OUTLINE_AFFECTED_BY_LIGHT &&
        !EMISSIVE
    ) {
        outlineColor *=
            LIGHTCOLOR *
            vPromoClassicLight;
    }

    return mix(
        sourceColor,
        outlineColor,
        intensity
    );
}

void main() {
    /*
        All dFdx/dFdy-dependent values must be resolved before alpha discard.
    */
    mat2 elementToMapJacobian =
        promoGetElementToMapJacobian();

    vec3 surfaceNormal = promoSafeNormalize(
        vPromoWorldNormal,
        vec3(0.0, 1.0, 0.0)
    );

    vec3 faceTangentU;
    vec3 faceTangentV;

    promoGetFaceFrame(
        surfaceNormal,
        faceTangentU,
        faceTangentV
    );

    vec4 sampledColor = texture2D(
        map,
        vPromoMapUv
    );

    if (sampledColor.a < 0.01) {
        discard;
    }

    vec3 finalColor;
    float finalAlpha = sampledColor.a;

    if (EMISSIVE) {
        vec3 emissiveMix =
            (vPromoClassicLight * LIGHTCOLOR) +
            (
                1.0 -
                vPromoClassicLight * LIGHTCOLOR
            ) *
            (
                1.0 -
                sampledColor.a
            );

        finalColor =
            vPromoHighlightLift +
            sampledColor.rgb *
            emissiveMix;

        finalAlpha = 1.0;
    } else {
        finalColor =
            vPromoHighlightLift +
            sampledColor.rgb *
            vPromoClassicLight;

        finalColor *= LIGHTCOLOR;

        finalColor = promoApplyBevel(
            finalColor,
            surfaceNormal,
            faceTangentU,
            faceTangentV,
            sampledColor.a,
            elementToMapJacobian
        );
    }

    finalColor = promoApplyOutline(
        finalColor,
        sampledColor.a,
        elementToMapJacobian
    );

    if (vPromoHighlightLift > 0.2) {
        finalColor.rg *= vec2(0.6, 0.7);
    }

    gl_FragColor = vec4(
        clamp(
            finalColor,
            vec3(0.0),
            vec3(1.0)
        ),
        finalAlpha
    );
}`,

                uniforms: {
                    ...createLightflowUniforms({
                        shadows: true
                    }),

                    EMISSIVE: {
                        type: 'bool',
                        value: false,
                        expose: true
                    },

                    OUTLINE_ELEMENT_ENABLED: {
                        type: 'bool',
                        value: false,
                        expose: true
                    },

                    OUTLINE_ALPHA_ENABLED: {
                        type: 'bool',
                        value: false,
                        expose: true
                    },

                    OUTLINE_ALPHA_CLAMP_TO_ELEMENT: {
                        type: 'bool',
                        value: true,
                        expose: true,
                        advanced: true
                    },

                    OUTLINE_ALPHA_DIAGONAL_ONLY: {
                        type: 'bool',
                        value: false,
                        expose: true,
                        advanced: true
                    },

                    OUTLINE_CONSTANT_SCREEN_SIZE: {
                        type: 'bool',
                        value: false,
                        expose: true,
                        advanced: true
                    },

                    OUTLINE_WIDTH: {
                        type: 'float',
                        value: 0.18,
                        expose: true,
                        min: 0.0,
                        max: 4.0,
                        step: 0.01,
                        allow_higher: true,
                        allow_lower: false
                    },

                    OUTLINE_FADE: {
                        type: 'float',
                        value: 0.0,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.05,
                        allow_higher: false,
                        allow_lower: false
                    },

                    OUTLINE_INTENSITY: {
                        type: 'float',
                        value: 0.14,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.01,
                        allow_higher: false,
                        allow_lower: false
                    },

                    /*
                        0 = brighten, 1 = darken, 2 = replace with color.
                    */
                    OUTLINE_MODE: {
                        type: 'int',
                        value: 1,
                        expose: true,
                        min: 0,
                        max: 2,
                        step: 1,
                        allow_higher: false,
                        allow_lower: false
                    },

                    OUTLINE_COLOR: {
                        type: 'vec3',
                        value: new THREE.Vector3(
                            0.08,
                            0.05,
                            0.04
                        ),
                        expose: true,
                        is_color: true,
                        hexValue: '#140d0a'
                    },

                    OUTLINE_AFFECTED_BY_LIGHT: {
                        type: 'bool',
                        value: true,
                        expose: true
                    },

                    BEVEL_ENABLED: {
                        type: 'bool',
                        value: true,
                        expose: true
                    },

                    BEVEL_ALPHA_ENABLED: {
                        type: 'bool',
                        value: false,
                        expose: true
                    },

                    /*
                        Fraction of the shortest face side. 0.055 matches the
                        thick painted bevels in the current promotional art.
                    */
                    BEVEL_WIDTH: {
                        type: 'float',
                        value: 0.12, // Grosor por defecto correcto (fino y global)
                        expose: true,
                        min: 0.0,
                        max: 1.0,  // Rango máximo más lógico
                        step: 0.01,
                        allow_higher: true,
                        allow_lower: false
                    },

                    BEVEL_SOFTNESS: {
                        type: 'float',
                        value: 0.0,
                        expose: true,
                        min: 0.0,
                        max: 2.0,
                        step: 0.05,
                        allow_higher: true,
                        allow_lower: false
                    },

                    BEVEL_SLOPE: {
                        type: 'float',
                        value: 0.78,
                        expose: true,
                        min: 0.0,
                        max: 2.0,
                        step: 0.05,
                        allow_higher: true,
                        allow_lower: false
                    },

                    BEVEL_CORNER_FADE: {
                        type: 'float',
                        value: 1.0,
                        expose: true,
                        min: 0.0,
                        max: 1.0,    // 1.0 = todo el lado de la cara, 0.5 = mitad de la cara
                        step: 0.01,
                        allow_higher: false,
                        allow_lower: false
                    },

                    BEVEL_HIGHLIGHT: {
                        type: 'float',
                        value: 0.1,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.01,
                        allow_higher: false,
                        allow_lower: false
                    },

                    BEVEL_SHADOW: {
                        type: 'float',
                        value: 0.35,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.01,
                        allow_higher: false,
                        allow_lower: false
                    },

                    BEVEL_SHADOW_SATURATION: {
                        type: 'float',
                        value: 1.0,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.01,
                        allow_higher: false,
                        allow_lower: false
                    },

                    BEVEL_LIGHT_STRENGTH: {
                        type: 'float',
                        value: 3.0,
                        expose: true,
                        min: 0.0,
                        max: 3.0,
                        step: 0.05,
                        allow_higher: true,
                        allow_lower: false
                    },

                    BEVEL_HIGHLIGHT_COLOR_INFLUENCE: {
                        type: 'float',
                        value: 0.45,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.01,
                        allow_higher: false,
                        allow_lower: false
                    },

                    BEVEL_LIGHT_COLOR_STRENGTH: {
                        type: 'float',
                        value: 1.0,
                        expose: true,
                        min: 0.0,
                        max: 4.0,
                        step: 0.05,
                        allow_higher: true,
                        allow_lower: false
                    },



                    BEVEL_GLOW_ENABLED: {
                        type: 'bool',
                        value: true,
                        expose: true
                    },

                    BEVEL_GLOW_SYNC_TO_PROMO_RIM: {
                        type: 'bool',
                        value: true,
                        expose: true
                    },

                    BEVEL_GLOW_SYNC_DIRECTION: {
                        type: 'bool',
                        value: true,
                        expose: true
                    },

                    BEVEL_GLOW_REQUIRE_LIGHT_FACING: {
                        type: 'bool',
                        value: false,
                        expose: true
                    },

                    // Controla qué tan directo debe mirar la cara a la luz para tener glow.
                    // 0.0 = Cualquier cara que roce la luz. 0.5 = Solo caras muy iluminadas.
                    BEVEL_GLOW_FACE_THRESHOLD: {
                        type: 'float',
                        value: 0.25,
                        expose: true,
                        min: -0.2,
                        max: 1.0,
                        step: 0.05,
                        allow_higher: false,
                        allow_lower: false
                    },

                    BEVEL_GLOW_WIDTH: {
                        type: 'float',
                        value: 0.16,
                        expose: true,
                        min: 0.0,
                        max: 2.0,
                        step: 0.01,
                        allow_higher: true,
                        allow_lower: false
                    },

                    BEVEL_GLOW_SOFTNESS: {
                        type: 'float',
                        value: 0.0, // Reducido drásticamente para que no sea tan borroso
                        expose: true,
                        min: 0.0,
                        max: 5.0,
                        step: 0.05,
                        allow_higher: true,
                        allow_lower: false
                    },

                    // Controla la distancia de las esquinas para este glow independiente
                    BEVEL_GLOW_CORNER_FADE: {
                        type: 'float',
                        value: 0.35,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.01,
                        allow_higher: false,
                        allow_lower: false
                    },

                    BEVEL_GLOW_INTENSITY: {
                        type: 'float',
                        value: 0.40,
                        expose: true,
                        min: 0.0,
                        max: 2.0,
                        step: 0.01,
                        allow_higher: true,
                        allow_lower: false
                    },

                    BEVEL_GLOW_COLOR_INFLUENCE: {
                        type: 'float',
                        value: 0.85,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.01,
                        allow_higher: false,
                        allow_lower: false
                    },

                    EDGE_FALLBACK_LIGHT_DIRECTION: {
                        type: 'vec3',
                        value: new THREE.Vector3(
                            -0.45,
                            0.80,
                            0.35
                        ),
                        expose: true
                    },

                    /*
                        Global union-silhouette rim. This is the blue-circled
                        effect from the reference art, not a per-cube bevel.
                    */
                    PROMO_RIM_ENABLED: {
                        type: 'bool',
                        value: true,
                        expose: true
                    },

                    /*
                        Width in viewport pixels, limited to 12 by the manager.
                    */
                    PROMO_RIM_WIDTH: {
                        type: 'float',
                        value: 6.5,
                        expose: true,
                        min: 0.0,
                        max: 12.0,
                        step: 0.25,
                        allow_higher: false,
                        allow_lower: false
                    },

                    PROMO_RIM_INTENSITY: {
                        type: 'float',
                        value: 0.25,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.01,
                        allow_higher: false,
                        allow_lower: false
                    },

                    PROMO_RIM_COLOR: {
                        type: 'vec3',
                        value: new THREE.Vector3(
                            1.0,
                            0.76,
                            0.24
                        ),
                        hexValue: '#ffc23d',
                        is_color: true,
                        expose: true
                    },

                    /*
                        0 = fixed PROMO_RIM_COLOR.
                        1 = mix PROMO_RIM_COLOR with Light Manager color.
                        2 = use Light Manager color directly.
                    */
                    PROMO_RIM_COLOR_MODE: {
                        type: 'int',
                        value: 1,
                        expose: true,
                        min: 0,
                        max: 2,
                        step: 1,
                        allow_higher: false,
                        allow_lower: false
                    },

                    PROMO_RIM_LIGHT_COLOR_INFLUENCE: {
                        type: 'float',
                        value: 1.0,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.01,
                        allow_higher: false,
                        allow_lower: false
                    },

                    /*
                        Screen-space direction toward the artistic key light.
                        +X = right, +Y = up. The default matches the reference:
                        a gold rim along the upper/right silhouette.
                    */
                    PROMO_RIM_DIRECTION: {
                        type: 'vec2',
                        value: new THREE.Vector2(
                            0.70,
                            0.65
                        ),
                        expose: true
                    },

                    /*
                        0.0 = continuous outline.
                        1.0 = only contour sections facing PROMO_RIM_DIRECTION.
                    */
                    PROMO_RIM_DIRECTIONALITY: {
                        type: 'float',
                        value: 1.0,
                        expose: true,
                        min: 0.0,
                        max: 1.0,
                        step: 0.01,
                        allow_higher: false,
                        allow_lower: false
                    },

                    /*
                        Larger values make the directional transition wider.
                    */
                    PROMO_RIM_DIRECTION_SOFTNESS: {
                        type: 'float',
                        value: 0.75,
                        expose: true,
                        min: 0.01,
                        max: 1.0,
                        step: 0.01,
                        allow_higher: false,
                        allow_lower: false
                    },

                    /*
                        Cubes with the same group form one continuous silhouette.
                        Use distinct groups for separate characters.
                    */
                    PROMO_RIM_GROUP: {
                        type: 'int',
                        value: 0,
                        expose: true,
                        min: 0,
                        max: 99,
                        step: 1,
                        allow_higher: false,
                        allow_lower: false
                    },

                    PROMO_RIM_TEXTURE_BLEND: {
                        type: 'bool',
                        value: true,
                        expose: true
                    },

                    PROMO_RIM_OCCLUSION_ENABLED: {
                        type: 'bool',
                        value: true,
                        expose: true,
                        advanced: true
                    },

                    PROMO_RIM_DEPTH_EPSILON: {
                        type: 'float',
                        value: 0.00075,
                        expose: true,
                        advanced: true,
                        min: 0.0,
                        max: 0.02,
                        step: 0.00005,
                        allow_higher: true,
                        allow_lower: false
                    },

                    PROMO_RIM_SCALE_WITH_ZOOM: {
                        type: 'bool',
                        value: true,
                        expose: true
                    }
                }
            });

            const lumaForgeUniforms = {};
            for (const key in minecraft_promotional_bevel.uniforms) {
                lumaForgeUniforms[key] = cloneUniformDefinition(minecraft_promotional_bevel.uniforms[key]);
            }
            addScreenSpaceReflectionUniforms(lumaForgeUniforms, lightflowScreenSpaceReflectionDefaults);

            const lumaForgeLightflowHelpersStart = shaded_lightflow.fragment.indexOf('#define SA_LIGHT_POINT');
            const lumaForgeLightflowHelpersEnd = shaded_lightflow.fragment.indexOf('void main() {', lumaForgeLightflowHelpersStart);
            const lumaForgeLightflowHelpers = shaded_lightflow.fragment.slice(
                lumaForgeLightflowHelpersStart,
                lumaForgeLightflowHelpersEnd
            );
            const lumaForgePromoMain = minecraft_promotional_bevel.fragment.slice(
                minecraft_promotional_bevel.fragment.indexOf('void main() {')
            );

            const lumaForgeVertex = minecraft_promotional_bevel.vertex
                .replace(
                    `varying float vPromoClassicLight;
varying float vPromoHighlightLift;
`,
                    `varying float vPromoClassicLight;
varying float vPromoHighlightLift;
varying vec3 vSA_SSRViewPosition;
varying vec3 vSA_SSRViewNormal;
varying vec4 vSA_SSRClipPosition;
`
                )
                .replace(
                    `    gl_Position =
        projectionMatrix *
        modelViewMatrix *
        vec4(position, 1.0);
`,
                    `    vec4 saSSRViewPosition4 =
        modelViewMatrix *
        vec4(position, 1.0);

    vSA_SSRViewPosition = saSSRViewPosition4.xyz;
    vSA_SSRViewNormal =
        normalize(normalMatrix * normal);
    vSA_SSRClipPosition =
        projectionMatrix *
        saSSRViewPosition4;

    gl_Position = vSA_SSRClipPosition;
`
                );

            const lumaForgeFragment = minecraft_promotional_bevel.fragment
                .replace(
                    `#include <common>

uniform sampler2D map;`,
                    `#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
${SCREEN_SPACE_REFLECTIONS_PARS_FRAGMENT}

uniform sampler2D map;`
                )
                .replace(
                    `uniform int max_light_number;
`,
                    `uniform int max_light_number;

uniform int uLightCastShadow[16];
uniform int uLightShadowIndex[16];

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

uniform bool uClampLighting;

uniform float uShadowStrength;
uniform float uShadowFloor;
`
                )
                .replace(
                    `varying float vPromoClassicLight;
varying float vPromoHighlightLift;
`,
                    `varying float vPromoClassicLight;
varying float vPromoHighlightLift;

${lumaForgeLightflowHelpers}`
                )
                .replace(
                    lumaForgePromoMain,
                    `void main() {
    /*
        All dFdx/dFdy-dependent values must be resolved before alpha discard.
    */
    mat2 elementToMapJacobian =
        promoGetElementToMapJacobian();

    vec3 surfaceNormal = promoSafeNormalize(
        vPromoWorldNormal,
        vec3(0.0, 1.0, 0.0)
    );

    vec3 faceTangentU;
    vec3 faceTangentV;

    promoGetFaceFrame(
        surfaceNormal,
        faceTangentU,
        faceTangentV
    );

    vec4 sampledColor = texture2D(
        map,
        vPromoMapUv
    );

    if (sampledColor.a < 0.01) {
        discard;
    }

    vec3 finalColor;
    float finalAlpha = sampledColor.a;

    if (EMISSIVE) {
        vec3 emissiveMix =
            (vPromoClassicLight * LIGHTCOLOR) +
            (
                1.0 -
                vPromoClassicLight * LIGHTCOLOR
            ) *
            (
                1.0 -
                sampledColor.a
            );

        finalColor =
            vPromoHighlightLift +
            sampledColor.rgb *
            emissiveMix;

        finalAlpha = 1.0;
    } else {
        vec4 texel = sampledColor;

        #if defined( sRGBToLinear )
            texel.rgb = sRGBToLinear(texel.rgb);
        #else
            texel.rgb = pow(max(texel.rgb, vec3(0.0)), vec3(2.2));
        #endif

        vec3 normal = safeNormalize(
            surfaceNormal,
            vec3(0.0, 1.0, 0.0)
        );

        vec3 directLight = vec3(0.0);

        for (int i = 0; i < 16; i++) {
            if (i >= max_light_number) break;
            if (uLightIntensity[i] <= 0.0) continue;

            vec3 lightContribution = computeLightContribution(
                i,
                normal,
                vPromoWorldPosition
            );
            float shadow = getCustomLightShadow(i);

            directLight += lightContribution * shadow;
        }

        float ambientOcclusion = computeVoxelAO(
            vPromoElementUv,
            normal
        );

        vec3 ambientLight =
            max(uAmbientColor, vec3(0.0)) *
            max(uAmbient, 0.0);
        ambientLight *= ambientOcclusion;

        float directAO = mix(
            1.0,
            ambientOcclusion,
            clamp(uAODirectInfluence, 0.0, 1.0)
        );
        vec3 lighting = ambientLight + directLight * directAO;

        if (uClampLighting) {
            float maxChannel = max(lighting.r, max(lighting.g, lighting.b));
            if (maxChannel > 1.0) {
                lighting /= maxChannel;
            }
        }

        finalColor = texel.rgb * lighting;
        finalColor += vec3(vPromoHighlightLift);
        finalColor *= LIGHTCOLOR;

        if (vPromoHighlightLift > 0.2) {
            finalColor.rg *= vec2(0.6, 0.7);
        }

        finalColor = applyToneMapping(finalColor);
        finalColor = pow(max(finalColor, vec3(0.0)), vec3(1.0 / 2.2));

        finalColor = promoApplyBevel(
            finalColor,
            surfaceNormal,
            faceTangentU,
            faceTangentV,
            sampledColor.a,
            elementToMapJacobian
        );
    }

    finalColor = promoApplyOutline(
        finalColor,
        sampledColor.a,
        elementToMapJacobian
    );

    vec4 outputColor = vec4(
        clamp(
            finalColor,
            vec3(0.0),
            vec3(1.0)
        ),
        finalAlpha
    );

    gl_FragColor = saApplyScreenSpaceReflection(
        outputColor,
        vSA_SSRViewNormal,
        vSA_SSRViewPosition,
        vSA_SSRClipPosition,
        0.22,
        1.0
    );
}`
                );

            let luma_forge = new FancyShaderMaterial({
                id: 'luma_forge',
                name: tl('shader_architect.preset.luma_forge'),
                icon: 'auto_awesome',
                isCustom: false,
                enableShadows: true,
                supportsScreenSpaceReflections: true,
                vertex: lumaForgeVertex,
                fragment: lumaForgeFragment,
                uniforms: lumaForgeUniforms
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

                                    // Normal correction.
                                    vec3 transformedNormal = normalize(normalMatrix * normal);
                                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);


                                    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                                    // Mathematical correction for rotation and scale matrices.
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

                                    // 1. Resolve the raw shadow mask (0.0 = shadow, 1.0 = light).
                                    float shadow = getShadowMask();

                                    // 2. Ambient light affects all geometry evenly.
                                    vec3 ambientLight = uAmbientColor * uAmbient;

                                    // 3. Direct light (sumLight) is blocked by the shadow.
                                    vec3 directLight = sumLight * shadow;

                                    // 4. Combine both contributions.
                                    // Higher direct light intensity increases contrast against the shadowed area.
                                    vec3 finalLight = clamp(ambientLight + directLight, 0.0, 1.0);

                                    gl_FragColor = vec4(lift + color.rgb * finalLight, color.a);
                                    gl_FragColor.rgb *= LIGHTCOLOR;

                                    if(lift > 0.2) { gl_FragColor.rg *= vec2(0.6, 0.7); }
                                }
                            `,
                uniforms: {
                    "uLightPos": { type: "vec3v", value: Array.from({ length: 16 }, () => new THREE.Vector3()), expose: false },
                    "uLightDir": { type: "vec3v", value: Array.from({ length: 16 }, () => new THREE.Vector3(0, -1, 0)), expose: false },
                    "uLightIntensity": { type: "floatv", value: Array(16).fill(0.0), expose: false },
                    "uLightDistance": { type: "floatv", value: Array(16).fill(0.0), expose: false },
                    "uLightConeAngle": { type: "floatv", value: Array(16).fill(0.0), expose: false },
                    "uLightPenumbra": { type: "floatv", value: Array(16).fill(0.0), expose: false },
                    "uLightType": { type: "intv", value: Array(16).fill(0), expose: false },
                    "uLightColor": { type: "vec3v", value: Array.from({ length: 16 }, () => new THREE.Vector3()), expose: false },
                    "max_light_number": { type: "int", value: 0, expose: true, min: 0, max: 16, step: 1, allow_higher: false, allow_lower: false },
                    "uAmbient": { type: "float", value: 0.3, expose: true, min: 0.0, max: 1.0, step: 0.05, allow_higher: true, allow_lower: false }, // Controls how dark shadows can become.
                    "uAmbientColor": { type: "vec3", value: new THREE.Vector3(1, 1, 1), hexValue: "#ffffff", expose: true, is_color: true },
                    "LIGHTCOLOR": { type: "vec3", value: new THREE.Vector3(1, 1, 1), hexValue: "#ffffff", expose: true, is_color: true },
                    "TEXTURE_SIZE": { type: "vec2", value: new THREE.Vector2(16, 16), expose: false }
                },
                enableShadows: true
            });

            this.materials['classic'] = classic;
            this.materials['lightflow'] = lightflow;
            this.materials['shaded_lightflow'] = shaded_lightflow;
            this.materials['pbr_metallic_roughness'] = pbr_metallic_roughness;
            this.materials['pixelated_shaded_lightflow'] = pixelated_shaded_lightflow;
            this.materials['minecraft_promotional_bevel'] = minecraft_promotional_bevel;
            this.materials['luma_forge'] = luma_forge;
            //this.materials['uv_shadow'] = uv_shadow;
            // The new PBR material occupies the former hologram slot.
            // This keeps existing app references working.
            //this.materials['realview_pbr'] = realview_pbr;
        }
    };

    // =========================================================================
    // 4. ANIMATION & SHADER ENGINE
    // =========================================================================
    function collectShaderArchitectRenderPreviews() {
        const previews = new Set();

        if (window.Preview && Array.isArray(Preview.all)) {
            Preview.all.forEach(preview => {
                if (preview) previews.add(preview);
            });
        }

        [
            window.main_preview,
            window.MediaPreview,
            window.Screencam?.NoAAPreview
        ].forEach(preview => {
            if (preview) previews.add(preview);
        });

        return previews;
    }

    const ScreenSpaceReflectionManager = {
        states: new Map(),
        patchedPreviews: new Map(),
        fallbackTexture: null,
        lastPreviewPatchCount: -1,
        disposed: false,

        init() {
            this.disposed = false;
            this.patchAllPreviews();
        },

        dispose() {
            this.disposed = true;

            this.patchedPreviews.forEach((state, preview) => {
                if (preview && preview.render === state.patchedRender) {
                    preview.render = state.originalRender;
                }
            });
            this.patchedPreviews.clear();
            this.lastPreviewPatchCount = -1;

            this.states.forEach((state) => {
                if (state.captureTarget && typeof state.captureTarget.dispose === 'function') {
                    state.captureTarget.dispose();
                }
                if (state.depthTexture && typeof state.depthTexture.dispose === 'function') {
                    state.depthTexture.dispose();
                }
            });
            this.states.clear();

            if (this.fallbackTexture && typeof this.fallbackTexture.dispose === 'function') {
                this.fallbackTexture.dispose();
            }
            this.fallbackTexture = null;
        },

        getFallbackTexture() {
            if (!this.fallbackTexture) {
                const data = new Uint8Array([0, 0, 0, 255]);
                this.fallbackTexture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
                this.fallbackTexture.magFilter = THREE.NearestFilter;
                this.fallbackTexture.minFilter = THREE.NearestFilter;
                this.fallbackTexture.needsUpdate = true;
            }
            return this.fallbackTexture;
        },

        createDepthTexture() {
            if (!THREE.DepthTexture) return null;

            try {
                const depthTexture = new THREE.DepthTexture(1, 1);
                depthTexture.type = THREE.UnsignedShortType || THREE.UnsignedIntType;
                depthTexture.format = THREE.DepthFormat;
                depthTexture.minFilter = THREE.NearestFilter;
                depthTexture.magFilter = THREE.NearestFilter;
                depthTexture.generateMipmaps = false;
                return depthTexture;
            } catch (error) {
                return null;
            }
        },

        getPreviewState(preview) {
            if (!preview || !preview.renderer) return null;

            let state = this.states.get(preview);
            if (state) return state;

            const depthTexture = this.createDepthTexture();
            const targetOptions = {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                depthBuffer: true,
                stencilBuffer: false
            };

            if (depthTexture) targetOptions.depthTexture = depthTexture;

            const captureTarget = new THREE.WebGLRenderTarget(1, 1, targetOptions);
            if (depthTexture && !captureTarget.depthTexture) {
                captureTarget.depthTexture = depthTexture;
            }
            captureTarget.texture.name = 'SA_SSR_ScreenColor';
            captureTarget.texture.generateMipmaps = false;

            state = {
                preview,
                renderer: preview.renderer,
                captureTarget,
                depthTexture,
                width: 1,
                height: 1,
                frameIndex: 0,
                lastCaptureFrame: 0,
                hasCaptured: false,
                capturing: false
            };

            this.states.set(preview, state);
            return state;
        },

        patchAllPreviews(force = false) {
            if (this.disposed || !window.Preview || !Array.isArray(Preview.all)) return;
            const previews = collectShaderArchitectRenderPreviews();
            if (!force && previews.size === this.lastPreviewPatchCount && Array.from(previews).every(preview => this.patchedPreviews.has(preview))) return;
            this.lastPreviewPatchCount = previews.size;
            previews.forEach(preview => this.patchPreview(preview));
        },

        preparePreviewForRender(preview, options = {}) {
            if (typeof window.LightManagerPrepareRender === 'function') {
                window.LightManagerPrepareRender(preview, options);
            } else if (preview?.renderer?.shadowMap) {
                preview.renderer.shadowMap.enabled = true;
                if (THREE.PCFSoftShadowMap !== undefined) {
                    preview.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
                }
                preview.renderer.shadowMap.needsUpdate = true;
            }

            ShaderEngine.updateWorldNormalMatrices();
        },

        invalidateShadowMaps(preview, options = {}) {
            if (typeof window.LightManagerMarkShadowsDirty === 'function') {
                window.LightManagerMarkShadowsDirty();
                if (typeof window.LightManagerPrepareRender === 'function') {
                    window.LightManagerPrepareRender(preview, {
                        ...options,
                        force: !!(options.force || options.studio || options.studioRender)
                    });
                }
                return;
            }

            if (preview?.renderer?.shadowMap) {
                preview.renderer.shadowMap.needsUpdate = true;
            }

            Object.keys(window.three_lights || {}).forEach(uuid => {
                const light = window.three_lights[uuid];
                if (light && light.shadow) {
                    light.shadow.needsUpdate = true;
                }
            });
        },

        patchPreview(preview) {
            if (!preview || !preview.renderer || this.patchedPreviews.has(preview)) return;

            const originalRender = preview.render;
            if (typeof originalRender !== 'function') return;

            const manager = this;
            const patchedRender = function shaderArchitectSSRRender() {
                manager.preparePreviewForRender(this, {
                    studio: !!this.sa_studio_render_active
                });

                const activeMaterials = manager.collectActiveMaterials();
                if (activeMaterials.length === 0) {
                    return originalRender.apply(this, arguments);
                }

                if (this.controls && typeof this.controls.update === 'function') {
                    this.controls.update();
                }

                manager.capturePreview(this, activeMaterials);
                this.renderer.render(Canvas.scene, this.camera);
            };

            preview.render = patchedRender;
            this.patchedPreviews.set(preview, {
                originalRender,
                patchedRender
            });
        },

        getMaterialNumberUniform(material, name, fallback) {
            const uniform = material && material.uniforms ? material.uniforms[name] : null;
            const value = uniform ? Number(uniform.value) : NaN;
            return Number.isFinite(value) ? value : fallback;
        },

        getRenderScaleForMaterials(materials) {
            let renderScale = 0.55;
            (materials || []).forEach(material => {
                const materialScale = this.getMaterialNumberUniform(material, 'uSSRRenderScale', 0.72);
                renderScale = Math.max(renderScale, Math.min(Math.max(materialScale, 0.25), 1.0));
            });
            return renderScale;
        },

        getFrameIntervalForMaterials(materials) {
            let frameInterval = 4;
            (materials || []).forEach(material => {
                const materialInterval = Math.round(this.getMaterialNumberUniform(material, 'uSSRFrameInterval', 1.0));
                frameInterval = Math.min(frameInterval, Math.min(Math.max(materialInterval, 1), 4));
            });
            return frameInterval === 4 && (!materials || materials.length === 0) ? 1 : frameInterval;
        },

        resizeTarget(state, activeMaterials) {
            const renderer = state.renderer;
            const preview = state.preview;
            const canvas = renderer.domElement || preview.canvas;
            const rect = canvas && canvas.getBoundingClientRect
                ? canvas.getBoundingClientRect()
                : { width: preview.width || window.innerWidth || 800, height: preview.height || window.innerHeight || 600 };

            const pixelRatio = Math.min(
                renderer.getPixelRatio ? renderer.getPixelRatio() : (window.devicePixelRatio || 1),
                1.0
            );
            const renderScale = this.getRenderScaleForMaterials(activeMaterials);
            const rawWidth = Math.max(2, Math.floor(rect.width * pixelRatio));
            const rawHeight = Math.max(2, Math.floor(rect.height * pixelRatio));
            const scale = Math.min(1, SCREEN_SPACE_REFLECTION_TARGET_MAX_SIZE / Math.max(rawWidth, rawHeight));
            const width = Math.max(2, Math.floor(rawWidth * scale * renderScale));
            const height = Math.max(2, Math.floor(rawHeight * scale * renderScale));

            if (width === state.width && height === state.height) return false;

            state.width = width;
            state.height = height;
            state.captureTarget.setSize(width, height);
            return true;
        },

        ensureMaterialUniforms(material) {
            if (!material || !material.uniforms) return false;

            const fallbackTexture = this.getFallbackTexture();
            const ensureUniform = (name, valueFactory) => {
                if (!material.uniforms[name]) {
                    material.uniforms[name] = { value: valueFactory() };
                }
                return material.uniforms[name];
            };

            ensureUniform('uSA_SSRScene', () => fallbackTexture);
            ensureUniform('uSA_SSRDepth', () => fallbackTexture);
            ensureUniform('uSA_SSRHasDepth', () => 0);
            ensureUniform('uSA_SSRResolution', () => new THREE.Vector2(1, 1));
            ensureUniform('uSA_SSRCameraNear', () => 0.1);
            ensureUniform('uSA_SSRCameraFar', () => 1000.0);
            ensureUniform('uSA_SSRCameraIsPerspective', () => 1);
            ensureUniform('uSA_SSRCameraProjectionMatrix', () => new THREE.Matrix4());
            ensureUniform('uSA_SSRTime', () => 0.0);
            return true;
        },

        configureMaterial(material, activeShader) {
            const shaderSupportsSSR = MaterialManager.hasScreenSpaceReflectionSupport(activeShader);
            if (!shaderSupportsSSR || !material || !material.uniforms) {
                if (material) material.sa_uses_screen_space_reflections = false;
                return false;
            }

            addScreenSpaceReflectionUniforms(material.uniforms);
            this.ensureMaterialUniforms(material);
            material.sa_uses_screen_space_reflections = true;
            return true;
        },

        updateMaterialUniformsForPreview(material, state, camera) {
            if (!this.ensureMaterialUniforms(material)) return;

            const uniforms = material.uniforms;
            uniforms.uSA_SSRScene.value = state.captureTarget.texture || this.getFallbackTexture();
            uniforms.uSA_SSRDepth.value = state.depthTexture || state.captureTarget.depthTexture || this.getFallbackTexture();
            uniforms.uSA_SSRHasDepth.value = state.depthTexture || state.captureTarget.depthTexture ? 1 : 0;
            uniforms.uSA_SSRResolution.value.set(state.width, state.height);
            uniforms.uSA_SSRCameraNear.value = camera && camera.near ? camera.near : 0.1;
            uniforms.uSA_SSRCameraFar.value = camera && camera.far ? camera.far : 1000.0;
            uniforms.uSA_SSRCameraIsPerspective.value = camera && camera.isPerspectiveCamera ? 1 : 0;
            if (camera && camera.projectionMatrix) {
                uniforms.uSA_SSRCameraProjectionMatrix.value.copy(camera.projectionMatrix);
            }
            uniforms.uSA_SSRTime.value = performance.now() * 0.001;
            material.uniformsNeedUpdate = true;
        },

        materialIsActive(material) {
            if (!material || !material.uniforms || !material.sa_uses_screen_space_reflections) return false;
            const enabled = material.uniforms.uSSREnabled && material.uniforms.uSSREnabled.value === true;
            const intensity = material.uniforms.uSSRIntensity ? Number(material.uniforms.uSSRIntensity.value) || 0 : 0;
            return enabled && intensity > 0;
        },

        meshUsesActiveSSR(mesh) {
            if (!mesh || !mesh.material) return false;
            let active = false;
            ShaderEngine.forEachMeshMaterial(mesh, (material) => {
                if (this.materialIsActive(material)) active = true;
            });
            return active;
        },

        hasActiveReflectiveMaterials() {
            if (this.disposed || !window.Cube || !Array.isArray(Cube.all)) return false;
            for (const cube of Cube.all) {
                if (cube && this.meshUsesActiveSSR(cube.mesh)) return true;
            }
            return false;
        },

        collectActiveMaterials() {
            const materials = [];
            const seen = new Set();
            if (!window.Cube || !Array.isArray(Cube.all)) return materials;

            Cube.all.forEach(cube => {
                if (!cube || !cube.mesh) return;
                ShaderEngine.forEachMeshMaterial(cube.mesh, (material) => {
                    if (!this.materialIsActive(material)) return;
                    const key = material.uuid || material.id || material;
                    if (seen.has(key)) return;
                    seen.add(key);
                    materials.push(material);
                });
            });

            return materials;
        },

        setReflectiveMeshesVisible(visible) {
            const changed = [];
            if (!window.Cube || !Array.isArray(Cube.all)) return changed;

            Cube.all.forEach(cube => {
                const mesh = cube && cube.mesh;
                if (!mesh || !this.meshUsesActiveSSR(mesh)) return;
                changed.push({ mesh, visible: mesh.visible });
                mesh.visible = visible;
            });

            return changed;
        },

        restoreMeshVisibility(changed) {
            changed.forEach(entry => {
                if (entry.mesh) entry.mesh.visible = entry.visible;
            });
        },

        capturePreview(preview, activeMaterials = null) {
            if (this.disposed || !preview || !preview.renderer || typeof Canvas === 'undefined' || !Canvas.scene) return;

            const state = this.getPreviewState(preview);
            if (!state || state.capturing) return;

            const materials = Array.isArray(activeMaterials) ? activeMaterials : this.collectActiveMaterials();
            if (materials.length === 0) return;

            state.frameIndex = (state.frameIndex || 0) + 1;
            const targetChanged = this.resizeTarget(state, materials);
            const frameInterval = this.getFrameIntervalForMaterials(materials);
            const shouldCapture = !state.hasCaptured ||
                targetChanged ||
                frameInterval <= 1 ||
                (state.frameIndex - (state.lastCaptureFrame || 0)) >= frameInterval;

            if (!shouldCapture) {
                materials.forEach(material => {
                    this.updateMaterialUniformsForPreview(material, state, preview.camera);
                });
                return;
            }

            state.capturing = true;

            const renderer = state.renderer;
            const camera = preview.camera;
            const previousTarget = renderer.getRenderTarget();
            const previousAutoClear = renderer.autoClear;
            const hiddenMeshes = this.setReflectiveMeshesVisible(false);

            try {
                renderer.autoClear = true;
                renderer.setRenderTarget(state.captureTarget);
                renderer.clear(true, true, true);
                renderer.render(Canvas.scene, camera);
                renderer.setRenderTarget(previousTarget);
                renderer.autoClear = previousAutoClear;
                this.restoreMeshVisibility(hiddenMeshes);
                this.invalidateShadowMaps(preview, {
                    studio: !!preview.sa_studio_render_active
                });
                state.hasCaptured = true;
                state.lastCaptureFrame = state.frameIndex;

                materials.forEach(material => {
                    this.updateMaterialUniformsForPreview(material, state, camera);
                });
            } catch (error) {
                renderer.setRenderTarget(previousTarget);
                renderer.autoClear = previousAutoClear;
                this.restoreMeshVisibility(hiddenMeshes);
                this.invalidateShadowMaps(preview, {
                    studio: !!preview.sa_studio_render_active
                });
            } finally {
                state.capturing = false;
            }
        },

        refresh() {
            this.patchAllPreviews();
            if (!window.Preview || !Array.isArray(Preview.all)) return;
            Preview.all.forEach(preview => {
                if (preview && typeof preview.render === 'function') {
                    preview.render();
                }
            });
        }
    };


    /*
     * -------------------------------------------------------------------------
     * Minecraft Promotional Silhouette Manager
     * -------------------------------------------------------------------------
     * A fragment shader on an individual cube cannot shade pixels outside that
     * cube. The golden promotional rim is therefore rendered as a true,
     * screen-space union silhouette:
     *
     * 1. Render every eligible promotional cube into one mask per rim group.
     * 2. Dilate that mask horizontally and vertically.
     * 3. Composite only (dilatedMask - originalMask) after the scene render.
     *
     * The depth channel carried through the dilation chain suppresses the rim
     * behind foreground, non-promotional geometry. This is what prevents the
     * outline from leaking over a TNT block or another object in front.
     */
    const MinecraftPromotionalSilhouetteManager = {
        states: new Map(),
        patchedPreviews: new Map(),
        maskMaterialCache: new WeakMap(),
        maskMaterials: new Set(),
        fullscreenGeometry: null,
        fullscreenCamera: null,
        discardMaterial: null,
        sceneDepthMaterial: null,
        fallbackTexture: null,
        transparentFallbackTexture: null,
        cachedGroups: null,
        groupsDirty: true,
        advancedScreenshotPatch: null,
        screenshotPreviewPatch: null,
        lastPreviewPatchCount: -1,
        disposed: false,

        /*
            Radio máximo por pasada GLSL.
            No lo subas: el shader está compilado con un loop máximo de 12.
        */
        MAX_RIM_RADIUS: 12.0,

        /*
            Radio total máximo:
            12 px por pasada x 16 pasadas = 192 px.
        */
        MAX_RIM_DILATION_PASSES: 16,

        MAX_TARGET_SIZE: 2048,

        init() {
            this.disposed = false;
            this.ensureSharedResources();
            this.patchAllPreviews(true);
            this.patchScreencamPreviewRenders();
        },

        dispose() {
            this.disposed = true;

            this.patchedPreviews.forEach((record, preview) => {
                if (preview && preview.render === record.patchedRender) {
                    preview.render = record.originalRender;
                }
            });

            this.patchedPreviews.clear();
            this.lastPreviewPatchCount = -1;

            this.states.forEach(state => this.disposeState(state));
            this.states.clear();

            this.maskMaterials.forEach(material => {
                if (material && typeof material.dispose === 'function') {
                    material.dispose();
                }
            });
            this.maskMaterials.clear();
            this.maskMaterialCache = new WeakMap();
            this.cachedGroups = null;
            this.groupsDirty = true;
            this.restoreScreencamPreviewRenders();

            if (this.discardMaterial && typeof this.discardMaterial.dispose === 'function') {
                this.discardMaterial.dispose();
            }
            this.discardMaterial = null;

            if (this.sceneDepthMaterial && typeof this.sceneDepthMaterial.dispose === 'function') {
                this.sceneDepthMaterial.dispose();
            }
            this.sceneDepthMaterial = null;

            if (this.fullscreenGeometry && typeof this.fullscreenGeometry.dispose === 'function') {
                this.fullscreenGeometry.dispose();
            }
            this.fullscreenGeometry = null;
            this.fullscreenCamera = null;

            if (this.fallbackTexture && typeof this.fallbackTexture.dispose === 'function') {
                this.fallbackTexture.dispose();
            }
            this.fallbackTexture = null;

            if (this.transparentFallbackTexture && typeof this.transparentFallbackTexture.dispose === 'function') {
                this.transparentFallbackTexture.dispose();
            }
            this.transparentFallbackTexture = null;
        },

        invalidateGroups() {
            this.cachedGroups = null;
            this.groupsDirty = true;
            this.states.forEach(state => {
                state.silhouetteValid = false;
            });
        },

        ensureSharedResources() {
            if (!this.fullscreenGeometry) {
                this.fullscreenGeometry = new THREE.PlaneGeometry(2.0, 2.0);
            }

            if (!this.fullscreenCamera) {
                this.fullscreenCamera = new THREE.OrthographicCamera(
                    -1.0,
                    1.0,
                    1.0,
                    -1.0,
                    0.0,
                    1.0
                );
            }

            if (!this.discardMaterial) {
                this.discardMaterial = new THREE.ShaderMaterial({
                    vertexShader: `
                        void main() {
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        }
                    `,
                    fragmentShader: `
                        void main() {
                            discard;
                        }
                    `,
                    depthTest: false,
                    depthWrite: false,
                    colorWrite: false,
                    transparent: false
                });
                this.discardMaterial.name = 'SA_PromoSilhouetteDiscard';
            }

            if (!this.sceneDepthMaterial) {
                this.sceneDepthMaterial = new THREE.MeshDepthMaterial({
                    depthPacking: THREE.RGBADepthPacking,
                    side: THREE.DoubleSide
                });
                this.sceneDepthMaterial.name = 'SA_PromoSceneDepth';
            }
        },

        getFallbackTexture() {
            if (!this.fallbackTexture) {
                const pixel = new Uint8Array([255, 255, 255, 255]);

                this.fallbackTexture = new THREE.DataTexture(
                    pixel,
                    1,
                    1,
                    THREE.RGBAFormat
                );

                this.fallbackTexture.minFilter = THREE.NearestFilter;
                this.fallbackTexture.magFilter = THREE.NearestFilter;
                this.fallbackTexture.generateMipmaps = false;
                this.fallbackTexture.needsUpdate = true;
            }

            return this.fallbackTexture;
        },

        getTransparentFallbackTexture() {
            if (!this.transparentFallbackTexture) {
                const pixel = new Uint8Array([0, 0, 0, 0]);

                this.transparentFallbackTexture = new THREE.DataTexture(
                    pixel,
                    1,
                    1,
                    THREE.RGBAFormat
                );

                this.transparentFallbackTexture.minFilter = THREE.NearestFilter;
                this.transparentFallbackTexture.magFilter = THREE.NearestFilter;
                this.transparentFallbackTexture.generateMipmaps = false;
                this.transparentFallbackTexture.needsUpdate = true;
            }

            return this.transparentFallbackTexture;
        },

        createDepthTexture() {
            if (!THREE.DepthTexture) {
                return null;
            }

            try {
                const depthTexture = new THREE.DepthTexture(1, 1);
                depthTexture.type = THREE.UnsignedShortType;
                depthTexture.format = THREE.DepthFormat;
                depthTexture.minFilter = THREE.NearestFilter;
                depthTexture.magFilter = THREE.NearestFilter;
                depthTexture.generateMipmaps = false;
                return depthTexture;
            } catch (error) {
                return null;
            }
        },

        getIntermediateTargetType() {
            return THREE.HalfFloatType !== undefined
                ? THREE.HalfFloatType
                : THREE.UnsignedByteType;
        },

        createRenderTarget(name, withDepthBuffer = false) {
            const options = {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.RGBAFormat,
                type: this.getIntermediateTargetType(),

                // Solo sceneDepthTarget necesita depth buffer para conservar
                // la profundidad del fragmento frontal durante MeshDepthMaterial.
                depthBuffer: !!withDepthBuffer,
                stencilBuffer: false
            };

            const target = new THREE.WebGLRenderTarget(1, 1, options);
            target.texture.name = name;
            target.texture.generateMipmaps = false;

            /*
                No adjuntar THREE.DepthTexture.

                La profundidad autoritativa será el color RGBA que escribe
                MeshDepthMaterial con THREE.RGBADepthPacking.
            */
            return target;
        },

        createFullscreenMaterial(fragmentShader, uniforms) {
            return new THREE.ShaderMaterial({
                uniforms,
                vertexShader: `
                    varying vec2 vPromoUv;

                    void main() {
                        vPromoUv = uv;
                        gl_Position = vec4(position.xy, 0.0, 1.0);
                    }
                `,
                fragmentShader,
                depthTest: false,
                depthWrite: false,
                transparent: false,
                blending: THREE.NoBlending
            });
        },

        createState(preview) {
            this.ensureSharedResources();

            const maskTarget = this.createRenderTarget(
                'SA_PromoSilhouetteMask',
                false
            );

            const horizontalTarget = this.createRenderTarget(
                'SA_PromoSilhouetteDilateHorizontal',
                false
            );

            const verticalTarget = this.createRenderTarget(
                'SA_PromoSilhouetteDilateVertical',
                false
            );

            const sceneDepthTarget = this.createRenderTarget(
                'SA_PromoSilhouetteSceneDepth',
                true
            );

            const dilationFragment = `
                #define SA_PROMO_RIM_MAX_RADIUS 12

                uniform sampler2D uSource;
                uniform vec2 uTexelSize;
                uniform vec2 uDirection;
                uniform float uRadius;

                varying vec2 vPromoUv;

                void main() {
                    vec3 expandedColor = vec3(0.0);
                    float nearestDepth = 1.0;
                    float isMask = 0.0;

                    for (int offset = -SA_PROMO_RIM_MAX_RADIUS; offset <= SA_PROMO_RIM_MAX_RADIUS; offset++) {
                        float sampleOffset = float(offset);

                        if (abs(sampleOffset) > uRadius + 0.001) {
                            continue;
                        }

                        vec2 sampleUv =
                            vPromoUv +
                            uDirection *
                            uTexelSize *
                            sampleOffset;

                        vec4 sampleValue = texture2D(
                            uSource,
                            sampleUv
                        );

                        if (sampleValue.a > 0.001) {
                            float depth = (sampleValue.a - 0.01) / 0.99;
                            if (isMask == 0.0 || depth < nearestDepth) {
                                nearestDepth = depth;
                                expandedColor = sampleValue.rgb;
                                isMask = 1.0;
                            }
                        }
                    }

                    if (isMask > 0.5) {
                        gl_FragColor = vec4(expandedColor, nearestDepth * 0.99 + 0.01);
                    } else {
                        gl_FragColor = vec4(0.0);
                    }
                }
            `;

            const horizontalMaterial = this.createFullscreenMaterial(
                dilationFragment,
                {
                    uSource: { value: maskTarget.texture },
                    uTexelSize: { value: new THREE.Vector2(1.0, 1.0) },
                    uDirection: { value: new THREE.Vector2(1.0, 0.0) },
                    uRadius: { value: 1.0 }
                }
            );
            horizontalMaterial.name = 'SA_PromoSilhouetteDilateHorizontal';

            const verticalMaterial = this.createFullscreenMaterial(
                dilationFragment,
                {
                    uSource: { value: horizontalTarget.texture },
                    uTexelSize: { value: new THREE.Vector2(1.0, 1.0) },
                    uDirection: { value: new THREE.Vector2(0.0, 1.0) },
                    uRadius: { value: 1.0 }
                }
            );
            verticalMaterial.name = 'SA_PromoSilhouetteDilateVertical';

            const overlayMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    uOriginalMask: { value: maskTarget.texture },
                    uExpandedMask: { value: verticalTarget.texture },
                    uSceneDepth: {
                        value: sceneDepthTarget.texture
                    },
                    uRimColor: { value: new THREE.Vector3(1.0, 0.78, 0.26) },
                    uRimIntensity: { value: 1.0 },
                    uRimRadius: { value: 1.0 },
                    uTexelSize: { value: new THREE.Vector2(1.0, 1.0) },
                    uRimDirection: { value: new THREE.Vector2(0.70, 0.65) },
                    uDirectionality: { value: 0.72 },
                    uDirectionSoftness: { value: 0.32 },
                    uDepthEpsilon: { value: 0.00075 },
                    uHasSceneDepth: {
                        value: 1
                    },
                    uUseOcclusion: { value: 1 },
                    uTextureBlend: { value: 1 }
                },
                vertexShader: `
                    varying vec2 vPromoUv;

                    void main() {
                        vPromoUv = uv;
                        gl_Position = vec4(position.xy, 0.0, 1.0);
                    }
                `,
                fragmentShader: `
                    #include <packing>

                    uniform sampler2D uOriginalMask;
                    uniform sampler2D uExpandedMask;
                    uniform sampler2D uSceneDepth;

                    #define SA_PROMO_DIRECTION_SAMPLE_RADIUS 12

                    uniform vec3 uRimColor;
                    uniform float uRimIntensity;
                    uniform float uRimRadius;
                    uniform vec2 uTexelSize;
                    uniform vec2 uRimDirection;
                    uniform float uDirectionality;
                    uniform float uDirectionSoftness;
                    uniform float uDepthEpsilon;
                    uniform int uHasSceneDepth;
                    uniform int uUseOcclusion;
                    uniform int uTextureBlend;

                    varying vec2 vPromoUv;

                    vec3 promoRgbToHsv(vec3 rgb) {
                        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
                        vec4 p = mix(vec4(rgb.bg, K.wz), vec4(rgb.gb, K.xy), step(rgb.b, rgb.g));
                        vec4 q = mix(vec4(p.xyw, rgb.r), vec4(rgb.r, p.yzx), step(p.x, rgb.r));
                        float delta = q.x - min(q.w, q.y);
                        float epsilon = 0.0000001;
                        return vec3(abs(q.z + (q.w - q.y) / (6.0 * delta + epsilon)), delta / (q.x + epsilon), q.x);
                    }

                    vec3 promoHsvToRgb(vec3 hsv) {
                        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                        vec3 p = abs(fract(hsv.xxx + K.xyz) * 6.0 - K.www);
                        return hsv.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), hsv.y);
                    }

                    vec2 promoEstimateOutwardDirection() {
                        vec2 inwardDirection = vec2(0.0);

                        for (int radius = 1; radius <= SA_PROMO_DIRECTION_SAMPLE_RADIUS; radius++) {
                            float pixelRadius = float(radius);

                            if (pixelRadius > uRimRadius + 0.001) {
                                continue;
                            }

                            vec2 sampleOffset = uTexelSize * pixelRadius;

                            float sourceRight = texture2D(uOriginalMask, vPromoUv + vec2(sampleOffset.x, 0.0)).a;
                            float sourceLeft = texture2D(uOriginalMask, vPromoUv - vec2(sampleOffset.x, 0.0)).a;
                            float sourceTop = texture2D(uOriginalMask, vPromoUv + vec2(0.0, sampleOffset.y)).a;
                            float sourceBottom = texture2D(uOriginalMask, vPromoUv - vec2(0.0, sampleOffset.y)).a;
                            float sourceTopRight = texture2D(uOriginalMask, vPromoUv + sampleOffset).a;
                            float sourceTopLeft = texture2D(uOriginalMask, vPromoUv + vec2(-sampleOffset.x, sampleOffset.y)).a;
                            float sourceBottomRight = texture2D(uOriginalMask, vPromoUv + vec2(sampleOffset.x, -sampleOffset.y)).a;
                            float sourceBottomLeft = texture2D(uOriginalMask, vPromoUv - sampleOffset).a;

                            float inverseRadius = 1.0 / max(pixelRadius, 1.0);

                            inwardDirection += vec2(1.0, 0.0) * step(0.005, sourceRight) * inverseRadius;
                            inwardDirection += vec2(-1.0, 0.0) * step(0.005, sourceLeft) * inverseRadius;
                            inwardDirection += vec2(0.0, 1.0) * step(0.005, sourceTop) * inverseRadius;
                            inwardDirection += vec2(0.0, -1.0) * step(0.005, sourceBottom) * inverseRadius;
                            inwardDirection += vec2(0.70710678, 0.70710678) * step(0.005, sourceTopRight) * inverseRadius;
                            inwardDirection += vec2(-0.70710678, 0.70710678) * step(0.005, sourceTopLeft) * inverseRadius;
                            inwardDirection += vec2(0.70710678, -0.70710678) * step(0.005, sourceBottomRight) * inverseRadius;
                            inwardDirection += vec2(-0.70710678, -0.70710678) * step(0.005, sourceBottomLeft) * inverseRadius;
                        }

                        float inwardLength = length(inwardDirection);

                        if (inwardLength <= 0.00001) {
                            return vec2(0.0);
                        }

                        return -inwardDirection / inwardLength;
                    }

                    void main() {
                        vec4 originalMaskSample = texture2D(uOriginalMask, vPromoUv);
                        vec4 expandedMaskSample = texture2D(uExpandedMask, vPromoUv);

                        float originalMask = step(0.005, originalMaskSample.a);
                        float expandedMask = step(0.005, expandedMaskSample.a);
                        float rimMask = max(expandedMask - originalMask, 0.0);

                        if (rimMask <= 0.0) {
                            discard;
                        }

                        float visibility = 1.0;

                        if (uUseOcclusion == 1 && uHasSceneDepth == 1) {
                            float targetDepth = (expandedMaskSample.a - 0.01) / 0.99;

                            float sceneDepth = unpackRGBAToDepth(
                                texture2D(uSceneDepth, vPromoUv)
                            );

                            if (sceneDepth <= 0.000001 || sceneDepth >= 0.999999) {
                                visibility = 1.0;
                            } else {
                                visibility = step(
                                    targetDepth - max(uDepthEpsilon, 0.0),
                                    sceneDepth + 0.0005
                                );
                            }
                        }

                        vec2 outwardDirection = promoEstimateOutwardDirection();
                        vec2 artisticDirection = normalize(uRimDirection + vec2(0.00001));

                        float directionalAlignment = dot(outwardDirection, artisticDirection);

                        float directionalMask = smoothstep(
                            -max(uDirectionSoftness, 0.001),
                            max(uDirectionSoftness, 0.001),
                            directionalAlignment
                        );

                        float artMask = mix(
                            1.0,
                            max(directionalMask, 0.18),
                            clamp(uDirectionality, 0.0, 1.0)
                        );

                        // CÁLCULO DE ALPHA BASE (Mascara geométrica pura)
                        float baseAlpha = clamp(
                            rimMask *
                            visibility *
                            artMask,
                            0.0,
                            1.0
                        );

                        float alpha = baseAlpha;
                        vec3 finalRimColor = uRimColor;

                        if (uTextureBlend == 1) {
                            // Mantenemos la opacidad sólida para conectar perfecto con el Inner Glow, 
                            // y aplicamos uRimIntensity al color sumado, exactamente igual que el Inner Glow.
                            // Solo desvanecemos el alpha a 0 si la intensidad es menor a 0.05 para evitar un borde gordo si Rim Power = 0.
                            alpha *= smoothstep(0.0, 0.05, uRimIntensity);

                            vec3 additiveBlend = expandedMaskSample.rgb + (uRimColor * max(uRimIntensity, 0.0));
                            vec3 hsv = promoRgbToHsv(clamp(additiveBlend, vec3(0.0), vec3(1.0)));
                            
                            hsv.y = clamp(hsv.y, 0.0, 1.0);
                            hsv.z = clamp(hsv.z, 0.0, 1.0);
                            
                            finalRimColor = promoHsvToRgb(hsv);
                        } else {
                            // Modo clásico de color sólido: la intensidad sí debe controlar la transparencia global.
                            alpha *= clamp(uRimIntensity, 0.0, 1.0);
                        }

                        if (alpha <= 0.0) {
                            discard;
                        }

                        gl_FragColor = vec4(finalRimColor, alpha);
                    }`,
                depthTest: false,
                depthWrite: false,
                transparent: true,
                blending: THREE.NormalBlending
            });
            overlayMaterial.name = 'SA_PromoSilhouetteOverlay';

            const horizontalScene = new THREE.Scene();
            const horizontalQuad = new THREE.Mesh(
                this.fullscreenGeometry,
                horizontalMaterial
            );
            horizontalQuad.frustumCulled = false;
            horizontalScene.add(horizontalQuad);

            const verticalScene = new THREE.Scene();
            const verticalQuad = new THREE.Mesh(
                this.fullscreenGeometry,
                verticalMaterial
            );
            verticalQuad.frustumCulled = false;
            verticalScene.add(verticalQuad);

            const overlayScene = new THREE.Scene();
            const overlayQuad = new THREE.Mesh(
                this.fullscreenGeometry,
                overlayMaterial
            );
            overlayQuad.frustumCulled = false;
            overlayScene.add(overlayQuad);

            return {
                preview,
                renderer: preview.renderer,
                maskTarget,
                horizontalTarget,
                verticalTarget,
                sceneDepthTarget,
                horizontalMaterial,
                verticalMaterial,
                overlayMaterial,
                horizontalScene,
                verticalScene,
                overlayScene,
                width: 1,
                height: 1,
                renderScale: 1.0,
                texelSize: new THREE.Vector2(1.0, 1.0),
                silhouetteValid: false,
                viewSignature: '',
                rendering: false
            };
        },

        disposeState(state) {
            if (!state) {
                return;
            }

            [
                state.maskTarget,
                state.horizontalTarget,
                state.verticalTarget,
                state.sceneDepthTarget,
                state.horizontalMaterial,
                state.verticalMaterial,
                state.overlayMaterial
            ].forEach(resource => {
                if (resource && typeof resource.dispose === 'function') {
                    resource.dispose();
                }
            });
        },

        getPreviewState(preview) {
            if (!preview || !preview.renderer) {
                return null;
            }

            let state = this.states.get(preview);

            if (!state) {
                state = this.createState(preview);
                this.states.set(preview, state);
            }

            return state;
        },

        getPreviewSampleScale(preview) {
            const scale = Number(
                preview && preview.sa_promotional_rim_sample_scale
            );

            return Number.isFinite(scale)
                ? Math.max(1.0, Math.min(scale, 8.0))
                : 1.0;
        },

        getPreviewFrameScale(preview) {
            const scale = Number(
                preview && preview.sa_promotional_rim_frame_scale
            );

            /*
                El límite alto evita valores corruptos. El radio final queda
                protegido también por MAX_RIM_DILATION_PASSES.
            */
            return Number.isFinite(scale)
                ? Math.max(1.0, Math.min(scale, 64.0))
                : 1.0;
        },

        getRenderRadius(state, width) {
            const rawRadius =
                width *
                state.renderScale *
                this.getPreviewSampleScale(state.preview) *
                this.getPreviewFrameScale(state.preview);

            const maximumRadius =
                this.MAX_RIM_RADIUS *
                this.MAX_RIM_DILATION_PASSES;

            return Math.max(
                0.5,
                Math.min(rawRadius, maximumRadius)
            );
        },

        getCameraViewSignature(camera) {
            if (!camera) {
                return 'no-camera';
            }

            const view = camera.view || {};
            const matrix = camera.matrixWorld?.elements || [];

            return [
                camera.type || '',
                camera.near || 0,
                camera.far || 0,
                camera.zoom || 1,
                camera.fov || 0,
                camera.aspect || 0,

                view.enabled ? 1 : 0,
                view.fullWidth || 0,
                view.fullHeight || 0,
                view.offsetX || 0,
                view.offsetY || 0,
                view.width || 0,
                view.height || 0,

                ...Array.from(matrix).map(value => Number(value).toFixed(6))
            ].join('|');
        },

        setPreviewSampleScale(preview, scale) {
            if (!preview) {
                return () => { };
            }

            const previousScale = preview.sa_promotional_rim_sample_scale;
            preview.sa_promotional_rim_sample_scale = scale;

            return () => {
                if (previousScale === undefined) {
                    delete preview.sa_promotional_rim_sample_scale;
                } else {
                    preview.sa_promotional_rim_sample_scale = previousScale;
                }
            };
        },

        preparePreviewForRender(preview, options = {}) {
            if (!preview || !preview.renderer) {
                return;
            }

            this.patchAllPreviews(true);
            this.patchPreview(preview);
            this.invalidateGroups();

            const sampleScale = Number(options.sampleScale);

            preview.sa_promotional_rim_sample_scale =
                Number.isFinite(sampleScale)
                    ? Math.max(1.0, Math.min(sampleScale, 8.0))
                    : 1.0;

            const frameScale = Number(options.frameScale);

            preview.sa_promotional_rim_frame_scale =
                Number.isFinite(frameScale)
                    ? Math.max(1.0, Math.min(frameScale, 64.0))
                    : 1.0;

            const state = this.states.get(preview);

            if (state) {
                state.silhouetteValid = false;
            }

            ShaderEngine.updateWorldNormalMatrices();
        },

        patchScreencamPreviewRenders() {
            if (!window.Screencam) {
                return;
            }

            if (!this.screenshotPreviewPatch && typeof Screencam.screenshotPreview === 'function') {
                const manager = this;
                const original = Screencam.screenshotPreview;
                const patched = function shaderArchitectScreenshotPreview() {
                    manager.patchAllPreviews(true);
                    return original.apply(this, arguments);
                };

                Screencam.screenshotPreview = patched;
                this.screenshotPreviewPatch = {
                    original,
                    patched
                };
            }

            if (!this.advancedScreenshotPatch && typeof Screencam.advancedScreenshot === 'function') {
                const manager = this;
                const original = Screencam.advancedScreenshot;
                const patched = function shaderArchitectAdvancedScreenshot(preview, options) {
                    const screenshotOptions = options || {};
                    const renderPreview = screenshotOptions.anti_aliasing === 'msaa'
                        ? window.MediaPreview
                        : window.Screencam?.NoAAPreview;
                    const sampleScale = screenshotOptions.anti_aliasing === 'ssaa'
                        ? 4.0
                        : 1.0;
                    const restoreSampleScale = manager.setPreviewSampleScale(
                        renderPreview,
                        sampleScale
                    );

                    manager.patchAllPreviews(true);

                    let result;
                    try {
                        result = original.apply(this, arguments);
                    } catch (error) {
                        restoreSampleScale();
                        throw error;
                    }

                    if (result && typeof result.finally === 'function') {
                        return result.finally(restoreSampleScale);
                    }

                    restoreSampleScale();
                    return result;
                };

                Screencam.advancedScreenshot = patched;
                this.advancedScreenshotPatch = {
                    original,
                    patched
                };
            }
        },

        restoreScreencamPreviewRenders() {
            if (window.Screencam) {
                if (
                    this.screenshotPreviewPatch &&
                    Screencam.screenshotPreview === this.screenshotPreviewPatch.patched
                ) {
                    Screencam.screenshotPreview = this.screenshotPreviewPatch.original;
                }

                if (
                    this.advancedScreenshotPatch &&
                    Screencam.advancedScreenshot === this.advancedScreenshotPatch.patched
                ) {
                    Screencam.advancedScreenshot = this.advancedScreenshotPatch.original;
                }
            }

            this.screenshotPreviewPatch = null;
            this.advancedScreenshotPatch = null;
        },

        resizeState(state) {
            const renderer = state.renderer;
            const canvas = renderer.domElement || state.preview.canvas;

            const rawWidth = Math.max(
                2,
                Math.floor(
                    (canvas && canvas.width) ||
                    state.preview.width ||
                    window.innerWidth ||
                    800
                )
            );

            const rawHeight = Math.max(
                2,
                Math.floor(
                    (canvas && canvas.height) ||
                    state.preview.height ||
                    window.innerHeight ||
                    600
                )
            );

            const renderScale = Math.min(
                1.0,
                this.MAX_TARGET_SIZE / Math.max(rawWidth, rawHeight)
            );

            const width = Math.max(
                2,
                Math.floor(rawWidth * renderScale)
            );

            const height = Math.max(
                2,
                Math.floor(rawHeight * renderScale)
            );

            if (
                state.width === width &&
                state.height === height &&
                state.renderScale === renderScale
            ) {
                return false;
            }

            state.width = width;
            state.height = height;
            state.renderScale = renderScale;

            [
                state.maskTarget,
                state.horizontalTarget,
                state.verticalTarget,
                state.sceneDepthTarget
            ].forEach(target => target.setSize(width, height));

            state.silhouetteValid = false;
            return true;
        },

        getMaterialList(mesh) {
            if (!mesh || !mesh.material) {
                return [];
            }

            return Array.isArray(mesh.material)
                ? mesh.material.filter(Boolean)
                : [mesh.material];
        },

        getMaterialTexture(material) {
            if (!material) {
                return this.getFallbackTexture();
            }

            if (
                material.uniforms &&
                material.uniforms.map &&
                material.uniforms.map.value &&
                material.uniforms.map.value.isTexture
            ) {
                return material.uniforms.map.value;
            }

            if (material.map && material.map.isTexture) {
                return material.map;
            }

            return this.getFallbackTexture();
        },

        getNumberUniform(material, name, fallback) {
            const uniform = material && material.uniforms
                ? material.uniforms[name]
                : null;

            const value = uniform ? Number(uniform.value) : NaN;
            return Number.isFinite(value) ? value : fallback;
        },

        getBooleanUniform(material, name, fallback) {
            const uniform = material && material.uniforms
                ? material.uniforms[name]
                : null;

            if (!uniform) {
                return fallback;
            }

            const value = uniform.value;

            if (value === true || value === 1) {
                return true;
            }

            if (value === false || value === 0) {
                return false;
            }

            if (typeof value === 'string') {
                return value === 'true' || value === '1';
            }

            return fallback;
        },

        getVector2Uniform(material, name, fallback) {
            const uniform = material && material.uniforms
                ? material.uniforms[name]
                : null;

            const value = uniform ? uniform.value : null;

            if (
                value &&
                Number.isFinite(value.x) &&
                Number.isFinite(value.y)
            ) {
                return new THREE.Vector2(
                    value.x,
                    value.y
                );
            }

            return fallback.clone();
        },

        getVector3Uniform(material, name, fallback) {
            const uniform = material && material.uniforms
                ? material.uniforms[name]
                : null;

            const value = uniform ? uniform.value : null;

            if (
                value &&
                Number.isFinite(value.x) &&
                Number.isFinite(value.y) &&
                Number.isFinite(value.z)
            ) {
                return new THREE.Vector3(
                    value.x,
                    value.y,
                    value.z
                );
            }

            return fallback.clone();
        },

        materialHasPromotionalRimUniforms(material) {
            return !!(
                material &&
                material.uniforms &&
                material.uniforms.PROMO_RIM_ENABLED &&
                material.uniforms.PROMO_RIM_WIDTH &&
                material.uniforms.PROMO_RIM_INTENSITY
            );
        },

        getPromotionalMaterialLightColor(material) {
            if (!material || !material.uniforms) {
                return null;
            }

            const colorsUniform = material.uniforms.uLightColor;
            const intensitiesUniform = material.uniforms.uLightIntensity;
            const activeLightCount = Math.max(
                0,
                Math.min(
                    16,
                    Math.floor(
                        this.getNumberUniform(
                            material,
                            'max_light_number',
                            0
                        )
                    )
                )
            );

            const colors = colorsUniform ? colorsUniform.value : null;
            const intensities = intensitiesUniform ? intensitiesUniform.value : null;

            if (
                !Array.isArray(colors) ||
                !Array.isArray(intensities) ||
                activeLightCount <= 0
            ) {
                return null;
            }

            const weightedColor = new THREE.Vector3();
            let totalWeight = 0.0;

            for (let index = 0; index < activeLightCount; index++) {
                const color = colors[index];
                const intensity = Number(intensities[index]);
                const weight = Number.isFinite(intensity)
                    ? Math.max(0.0, intensity)
                    : 0.0;

                if (
                    !color ||
                    !Number.isFinite(color.x) ||
                    !Number.isFinite(color.y) ||
                    !Number.isFinite(color.z) ||
                    weight <= 0.00001
                ) {
                    continue;
                }

                weightedColor.x += Math.max(0.0, color.x) * weight;
                weightedColor.y += Math.max(0.0, color.y) * weight;
                weightedColor.z += Math.max(0.0, color.z) * weight;
                totalWeight += weight;
            }

            if (totalWeight <= 0.00001) {
                return null;
            }

            weightedColor.multiplyScalar(1.0 / totalWeight);

            const maxChannel = Math.max(
                weightedColor.x,
                weightedColor.y,
                weightedColor.z
            );

            if (maxChannel <= 0.00001) {
                return null;
            }

            return weightedColor.multiplyScalar(1.0 / maxChannel);
        },

        getEffectivePromotionalRimColor(group) {
            const fallbackConfig = group && group.config
                ? group.config
                : null;

            const fallbackColor = fallbackConfig && fallbackConfig.color
                ? fallbackConfig.color.clone()
                : new THREE.Vector3(1.0, 0.78, 0.26);

            const fixedColor = new THREE.Vector3();
            let fixedColorCount = 0;

            let colorMode = fallbackConfig
                ? fallbackConfig.colorMode
                : 0;

            let lightInfluence = fallbackConfig
                ? fallbackConfig.lightColorInfluence
                : 1.0;

            const lightColor = new THREE.Vector3();
            let lightColorCount = 0;

            if (group && group.materials) {
                group.materials.forEach(material => {
                    const config = this.getPromotionalRimConfig(material);

                    if (!config) {
                        return;
                    }

                    fixedColor.add(config.color);
                    fixedColorCount++;
                    colorMode = config.colorMode;
                    lightInfluence = config.lightColorInfluence;

                    const materialLightColor =
                        this.getPromotionalMaterialLightColor(material);

                    if (materialLightColor) {
                        lightColor.add(materialLightColor);
                        lightColorCount++;
                    }
                });
            }

            if (fixedColorCount > 0) {
                fixedColor.multiplyScalar(1.0 / fixedColorCount);
            } else {
                fixedColor.copy(fallbackColor);
            }

            if (colorMode <= 0 || lightColorCount <= 0) {
                return fixedColor;
            }

            lightColor.multiplyScalar(1.0 / lightColorCount);

            const influence = Math.max(
                0.0,
                Math.min(
                    1.0,
                    lightInfluence
                )
            );

            if (colorMode >= 2) {
                return new THREE.Vector3(1.0, 1.0, 1.0).lerp(
                    lightColor,
                    influence
                );
            }

            return fixedColor.lerp(
                lightColor,
                influence
            );
        },

        getEffectivePromotionalRimDirection(group, camera) {
            const fallbackConfig = group && group.config ? group.config : null;
            const fallbackDirection = fallbackConfig && fallbackConfig.direction
                ? fallbackConfig.direction.clone()
                : new THREE.Vector2(0.70, 0.65);

            let lightDirection = new THREE.Vector2();
            let lightDirectionCount = 0;

            const centerPos = new THREE.Vector3(0, 0, 0);
            if (group && group.meshList && group.meshList.length > 0) {
                let validMeshes = 0;
                group.meshList.forEach(mesh => {
                    if (mesh && typeof mesh.getWorldPosition === 'function') {
                        const pos = new THREE.Vector3();
                        mesh.getWorldPosition(pos);
                        centerPos.add(pos);
                        validMeshes++;
                    }
                });
                if (validMeshes > 0) {
                    centerPos.multiplyScalar(1.0 / validMeshes);
                }
            }

            if (group && group.materials) {
                group.materials.forEach(material => {
                    if (!material || !material.uniforms) return;

                    const intensities = material.uniforms.uLightIntensity ? material.uniforms.uLightIntensity.value : null;
                    const positions = material.uniforms.uLightPos ? material.uniforms.uLightPos.value : null;
                    const directions = material.uniforms.uLightDir ? material.uniforms.uLightDir.value : null;
                    const types = material.uniforms.uLightType ? material.uniforms.uLightType.value : null;
                    const activeLightCount = Math.max(0, Math.min(16, Math.floor(this.getNumberUniform(material, 'max_light_number', 0))));

                    if (!Array.isArray(intensities) || activeLightCount <= 0) return;

                    const weightedDirection = new THREE.Vector3();
                    let totalWeight = 0.0;

                    for (let index = 0; index < activeLightCount; index++) {
                        const intensity = Number(intensities[index]);
                        const weight = Number.isFinite(intensity) ? Math.max(0.0, intensity) : 0.0;

                        if (weight <= 0.00001) continue;

                        const type = types ? types[index] : 0;
                        let currentDir = new THREE.Vector3();

                        if (type === 1 && directions && directions[index]) {
                            currentDir.copy(directions[index]).multiplyScalar(-1);
                        } else if (positions && positions[index]) {
                            currentDir.copy(positions[index]).sub(centerPos);
                        }

                        if (currentDir.lengthSq() > 0.000001) {
                            currentDir.normalize();
                            weightedDirection.add(currentDir.multiplyScalar(weight));
                            totalWeight += weight;
                        }
                    }

                    if (totalWeight > 0.00001) {
                        weightedDirection.normalize();
                        if (camera) {
                            weightedDirection.transformDirection(camera.matrixWorldInverse);
                        }

                        const screenDir = new THREE.Vector2(weightedDirection.x, weightedDirection.y);
                        if (screenDir.lengthSq() > 0.000001) {
                            screenDir.normalize();
                            lightDirection.add(screenDir);
                            lightDirectionCount++;
                        }
                    }
                });
            }

            if (lightDirectionCount > 0) {
                return lightDirection.normalize();
            }

            return fallbackDirection;
        },

        getPromotionalRimConfig(material) {
            const shaderId = material && material.sa_shader_id;
            const hasPromotionalShaderId = ['minecraft_promotional_bevel', 'luma_forge'].includes(shaderId);

            if (
                !material ||
                !material.uniforms ||
                (!hasPromotionalShaderId && !this.materialHasPromotionalRimUniforms(material))
            ) {
                return null;
            }

            const enabled = this.getBooleanUniform(
                material,
                'PROMO_RIM_ENABLED',
                false
            );

            const width = Math.max(
                0.0,
                Math.min(
                    this.MAX_RIM_RADIUS,
                    this.getNumberUniform(
                        material,
                        'PROMO_RIM_WIDTH',
                        0.0
                    )
                )
            );

            const intensity = Math.max(
                0.0,
                this.getNumberUniform(
                    material,
                    'PROMO_RIM_INTENSITY',
                    1.0
                )
            );

            if (!enabled || width <= 0.001 || intensity <= 0.001) {
                return null;
            }

            return {
                group: Math.max(
                    0,
                    Math.floor(
                        this.getNumberUniform(
                            material,
                            'PROMO_RIM_GROUP',
                            0
                        )
                    )
                ),
                width,
                intensity,
                color: this.getVector3Uniform(
                    material,
                    'PROMO_RIM_COLOR',
                    new THREE.Vector3(1.0, 0.78, 0.26)
                ),
                colorMode: Math.max(
                    0,
                    Math.min(
                        2,
                        Math.floor(
                            this.getNumberUniform(
                                material,
                                'PROMO_RIM_COLOR_MODE',
                                0
                            )
                        )
                    )
                ),
                lightColorInfluence: Math.max(
                    0.0,
                    Math.min(
                        1.0,
                        this.getNumberUniform(
                            material,
                            'PROMO_RIM_LIGHT_COLOR_INFLUENCE',
                            1.0
                        )
                    )
                ),
                direction: this.getVector2Uniform(
                    material,
                    'PROMO_RIM_DIRECTION',
                    new THREE.Vector2(0.70, 0.65)
                ),
                directionality: Math.max(
                    0.0,
                    Math.min(
                        1.0,
                        this.getNumberUniform(
                            material,
                            'PROMO_RIM_DIRECTIONALITY',
                            0.72
                        )
                    )
                ),
                directionSoftness: Math.max(
                    0.001,
                    Math.min(
                        1.0,
                        this.getNumberUniform(
                            material,
                            'PROMO_RIM_DIRECTION_SOFTNESS',
                            0.32
                        )
                    )
                ),
                useOcclusion: this.getBooleanUniform(
                    material,
                    'PROMO_RIM_OCCLUSION_ENABLED',
                    true
                ),
                textureBlend: this.getBooleanUniform(
                    material,
                    'PROMO_RIM_TEXTURE_BLEND',
                    true
                ),
                depthEpsilon: Math.max(
                    0.0,
                    this.getNumberUniform(
                        material,
                        'PROMO_RIM_DEPTH_EPSILON',
                        0.00075
                    )
                ),
                scaleWithZoom: this.getBooleanUniform(
                    material,
                    'PROMO_RIM_SCALE_WITH_ZOOM',
                    false
                )
            };
        },

        collectGroups() {
            const groups = new Map();

            if (!window.Cube || !Array.isArray(Cube.all)) {
                return groups;
            }

            Cube.all.forEach(cube => {
                const mesh = cube && cube.mesh;

                if (!mesh) {
                    return;
                }

                this.getMaterialList(mesh).forEach(material => {
                    const config = this.getPromotionalRimConfig(material);

                    if (!config) {
                        return;
                    }

                    const key = String(config.group);

                    if (!groups.has(key)) {
                        groups.set(key, {
                            id: config.group,
                            config,
                            meshes: new Set(),
                            meshList: [],
                            materials: new Set()
                        });
                    }

                    const group = groups.get(key);

                    if (!group.meshes.has(mesh)) {
                        group.meshes.add(mesh);
                        group.meshList.push(mesh);
                    }

                    group.materials.add(material);
                });
            });

            return groups;
        },

        getGroups() {
            if (!this.groupsDirty && this.cachedGroups) {
                return this.cachedGroups;
            }

            this.cachedGroups = this.collectGroups();
            this.groupsDirty = false;
            return this.cachedGroups;
        },

        materialBelongsToGroup(material, group) {
            if (group && group.materials) {
                return group.materials.has(material);
            }

            const config = this.getPromotionalRimConfig(material);

            return !!(
                config &&
                group &&
                config.group === group.id
            );
        },

        getMaskMaterial(sourceMaterial) {
            if (!sourceMaterial || typeof sourceMaterial !== 'object') {
                return this.discardMaterial;
            }

            let maskMaterial = this.maskMaterialCache.get(sourceMaterial);

            if (!maskMaterial) {
                const transparentFallback = this.getTransparentFallbackTexture();
                maskMaterial = new THREE.ShaderMaterial({
                    uniforms: {
                        map: { value: this.getFallbackTexture() },
                        saLayeredTextureEnabled: { value: false },
                        saLayeredTexture0: { value: transparentFallback },
                        saLayeredTexture1: { value: transparentFallback },
                        saLayeredTexture2: { value: transparentFallback },
                        uAlphaCutoff: { value: 0.01 }
                    },
                    vertexShader: `
                        varying vec2 vPromoMaskUv;

                        void main() {
                            vPromoMaskUv = uv;
                            gl_Position =
                                projectionMatrix *
                                modelViewMatrix *
                                vec4(position, 1.0);
                        }
                    `,
                    fragmentShader: `
                        uniform sampler2D map;
                        ${BLOCKBENCH_LAYERED_TEXTURE_FRAGMENT}
                        uniform float uAlphaCutoff;

                        varying vec2 vPromoMaskUv;

                        void main() {
                            vec4 texColor = saSampleBaseMap(
                                vPromoMaskUv
                            );

                            if (texColor.a < uAlphaCutoff) {
                                discard;
                            }

                            /*
                                RGB = Texture Color
                                A = Mask Flag + Depth (0.0 = empty, 0.01-1.0 = depth)
                            */
                            gl_FragColor = vec4(
                                texColor.rgb,
                                gl_FragCoord.z * 0.99 + 0.01
                            );
                        }
                    `,
                    depthTest: true,
                    depthWrite: true,
                    transparent: false,
                    blending: THREE.NoBlending,
                    side: sourceMaterial.side !== undefined
                        ? sourceMaterial.side
                        : THREE.FrontSide
                });

                maskMaterial.name = 'SA_PromoSilhouetteMask';
                this.maskMaterialCache.set(sourceMaterial, maskMaterial);
                this.maskMaterials.add(maskMaterial);
            }

            maskMaterial.uniforms.map.value = this.getMaterialTexture(sourceMaterial);
            const sourceUniforms = sourceMaterial.uniforms || {};
            const layeredEnabled = !!(
                sourceUniforms.saLayeredTextureEnabled &&
                sourceUniforms.saLayeredTextureEnabled.value
            );
            const transparentFallback = this.getTransparentFallbackTexture();
            maskMaterial.uniforms.saLayeredTextureEnabled.value = layeredEnabled;
            for (let i = 0; i < 3; i++) {
                const key = `saLayeredTexture${i}`;
                maskMaterial.uniforms[key].value =
                    sourceUniforms[key] &&
                    sourceUniforms[key].value &&
                    sourceUniforms[key].value.isTexture
                        ? sourceUniforms[key].value
                        : transparentFallback;
            }
            maskMaterial.uniforms.uAlphaCutoff.value = Math.max(
                0.001,
                Number(sourceMaterial.alphaTest) || 0.01
            );

            maskMaterial.side = sourceMaterial.side !== undefined
                ? sourceMaterial.side
                : THREE.FrontSide;

            return maskMaterial;
        },

        temporarilyHideNonTargets(scene, targetMeshes) {
            const changed = [];
            const targetSet = targetMeshes instanceof Set
                ? targetMeshes
                : new Set(targetMeshes);

            scene.traverse(object => {
                if (
                    !object ||
                    targetSet.has(object) ||
                    !(
                        object.isMesh ||
                        object.isSprite ||
                        object.isLine ||
                        object.isLineSegments ||
                        object.isPoints
                    )
                ) {
                    return;
                }

                changed.push({
                    object,
                    visible: object.visible
                });

                object.visible = false;
            });

            return changed;
        },

        restoreVisibility(changed) {
            changed.forEach(entry => {
                if (entry.object) {
                    entry.object.visible = entry.visible;
                }
            });
        },

        captureSceneDepth(state, camera) {
            const renderer = state.renderer;
            const scene = Canvas.scene;

            const previousOverrideMaterial = scene.overrideMaterial;
            const previousBackground = scene.background;

            try {
                scene.overrideMaterial = this.sceneDepthMaterial;
                scene.background = null;

                renderer.setRenderTarget(state.sceneDepthTarget);
                renderer.setClearColor(0x000000, 0.0);
                renderer.clear(true, true, true);
                renderer.render(scene, camera);
            } finally {
                scene.overrideMaterial = previousOverrideMaterial;
                scene.background = previousBackground;
            }
        },

        captureGroupMask(state, camera, group) {
            const renderer = state.renderer;
            const scene = Canvas.scene;
            const targetMeshes = (group.meshList || Array.from(group.meshes))
                .filter(mesh => mesh && mesh.visible !== false);

            if (targetMeshes.length === 0) {
                return false;
            }

            const changedVisibility = this.temporarilyHideNonTargets(
                scene,
                group.meshes || targetMeshes
            );

            const materialChanges = [];

            targetMeshes.forEach(mesh => {
                const originalMaterial = mesh.material;
                const originalSlots = Array.isArray(originalMaterial)
                    ? originalMaterial.slice()
                    : [originalMaterial];

                const maskSlots = originalSlots.map(sourceMaterial => {
                    if (this.materialBelongsToGroup(sourceMaterial, group)) {
                        return this.getMaskMaterial(sourceMaterial);
                    }

                    return this.discardMaterial;
                });

                materialChanges.push({
                    mesh,
                    originalMaterial
                });

                mesh.material = Array.isArray(originalMaterial)
                    ? maskSlots
                    : maskSlots[0];
            });

            const previousOverrideMaterial = scene.overrideMaterial;
            const previousBackground = scene.background;

            try {
                scene.overrideMaterial = null;
                scene.background = null;

                renderer.setRenderTarget(state.maskTarget);
                renderer.setClearColor(0x000000, 0.0);
                renderer.clear(true, true, true);
                renderer.render(scene, camera);
                return true;
            } finally {
                materialChanges.forEach(entry => {
                    entry.mesh.material = entry.originalMaterial;
                });

                this.restoreVisibility(changedVisibility);
                scene.overrideMaterial = previousOverrideMaterial;
                scene.background = previousBackground;
            }
        },

        renderDilation(state, radius) {
            const renderer = state.renderer;
            const texelSize = state.texelSize;

            const maximumRadius =
                this.MAX_RIM_RADIUS *
                this.MAX_RIM_DILATION_PASSES;

            const totalRadius = Math.max(
                0.5,
                Math.min(radius, maximumRadius)
            );

            texelSize.set(
                1.0 / Math.max(state.width, 1),
                1.0 / Math.max(state.height, 1)
            );

            /*
                No se aumenta el loop GLSL de 12.
                En su lugar, cada pasada extiende hasta 12 píxeles y el resultado
                pasa a la siguiente iteración. Esto conserva rendimiento estable
                y permite radios grandes al usar Render Frame.
            */
            let remainingRadius = totalRadius;
            let sourceTexture = state.maskTarget.texture;

            while (remainingRadius > 0.001) {
                const passRadius = Math.min(
                    this.MAX_RIM_RADIUS,
                    remainingRadius
                );

                state.horizontalMaterial.uniforms.uSource.value =
                    sourceTexture;

                state.horizontalMaterial.uniforms.uTexelSize.value.copy(
                    texelSize
                );

                state.horizontalMaterial.uniforms.uRadius.value =
                    passRadius;

                renderer.setRenderTarget(state.horizontalTarget);
                renderer.clear(true, true, true);
                renderer.render(
                    state.horizontalScene,
                    this.fullscreenCamera
                );

                state.verticalMaterial.uniforms.uSource.value =
                    state.horizontalTarget.texture;

                state.verticalMaterial.uniforms.uTexelSize.value.copy(
                    texelSize
                );

                state.verticalMaterial.uniforms.uRadius.value =
                    passRadius;

                renderer.setRenderTarget(state.verticalTarget);
                renderer.clear(true, true, true);
                renderer.render(
                    state.verticalScene,
                    this.fullscreenCamera
                );

                /*
                    La siguiente pasada continúa dilatando desde el resultado de la
                    pasada vertical anterior.
                */
                sourceTexture = state.verticalTarget.texture;
                remainingRadius -= passRadius;
            }
        },

        compositeGroup(state, destinationTarget, group, camera, radius) {
            const renderer = state.renderer;
            const config = group.config;

            state.overlayMaterial.uniforms.uOriginalMask.value =
                state.maskTarget.texture;

            state.overlayMaterial.uniforms.uExpandedMask.value =
                state.verticalTarget.texture;

            state.overlayMaterial.uniforms.uSceneDepth.value =
                state.sceneDepthTarget.texture;

            state.overlayMaterial.uniforms.uRimColor.value.copy(
                this.getEffectivePromotionalRimColor(group)
            );

            state.overlayMaterial.uniforms.uRimIntensity.value =
                config.intensity;

            state.overlayMaterial.uniforms.uRimRadius.value = radius;

            state.overlayMaterial.uniforms.uTexelSize.value.set(
                1.0 / Math.max(state.width, 1),
                1.0 / Math.max(state.height, 1)
            );

            state.overlayMaterial.uniforms.uRimDirection.value.copy(
                this.getEffectivePromotionalRimDirection(group, camera)
            );

            state.overlayMaterial.uniforms.uDirectionality.value =
                config.directionality;

            state.overlayMaterial.uniforms.uDirectionSoftness.value =
                config.directionSoftness;

            state.overlayMaterial.uniforms.uDepthEpsilon.value =
                config.depthEpsilon;

            state.overlayMaterial.uniforms.uHasSceneDepth.value = 1;

            state.overlayMaterial.uniforms.uUseOcclusion.value =
                config.useOcclusion ? 1 : 0;

            state.overlayMaterial.uniforms.uTextureBlend.value =
                config.textureBlend ? 1 : 0;

            renderer.setRenderTarget(destinationTarget);
            renderer.render(
                state.overlayScene,
                this.fullscreenCamera
            );
        },

        renderSilhouette(preview) {
            if (
                this.disposed ||
                !preview ||
                !preview.renderer ||
                typeof Canvas === 'undefined' ||
                !Canvas.scene
            ) {
                return;
            }

            const groups = this.getGroups();

            if (groups.size === 0) {
                return;
            }

            const state = this.getPreviewState(preview);

            if (!state || state.rendering) {
                return;
            }

            state.rendering = true;

            const targetChanged = this.resizeState(state);

            const currentViewSignature = this.getCameraViewSignature(
                preview.camera
            );

            const viewChanged =
                state.viewSignature !== currentViewSignature;

            state.viewSignature = currentViewSignature;

            const reuseSilhouette =
                !targetChanged &&
                !viewChanged &&
                state.silhouetteValid &&
                ShaderEngine.currentPreviewRenderLightOnly;

            const renderer = state.renderer;
            const previousTarget = renderer.getRenderTarget();
            const previousAutoClear = renderer.autoClear;
            const previousClearColor = new THREE.Color();
            const previousClearAlpha = renderer.getClearAlpha
                ? renderer.getClearAlpha()
                : 1.0;

            if (renderer.getClearColor) {
                renderer.getClearColor(previousClearColor);
            }

            try {
                renderer.autoClear = true;

                if (!reuseSilhouette) {
                    let needsSceneDepth = false;
                    groups.forEach(group => {
                        if (group.config && group.config.useOcclusion) {
                            needsSceneDepth = true;
                        }
                    });

                    if (needsSceneDepth) {
                        /*
                            Capture the full scene depth once. It keeps the outline
                            behind a foreground non-promotional block.
                        */
                        this.captureSceneDepth(
                            state,
                            preview.camera
                        );
                    }

                }

                renderer.autoClear = false;

                groups.forEach(group => {
                    let configRadius = group.config.width;
                    if (group.config.scaleWithZoom && preview.camera) {
                        const centerPos = new THREE.Vector3(0, 0, 0);
                        let validMeshes = 0;
                        group.meshList.forEach(mesh => {
                            if (mesh && typeof mesh.getWorldPosition === 'function') {
                                const pos = new THREE.Vector3();
                                mesh.getWorldPosition(pos);
                                centerPos.add(pos);
                                validMeshes++;
                            }
                        });
                        if (validMeshes > 0) centerPos.multiplyScalar(1.0 / validMeshes);

                        if (preview.camera.isPerspectiveCamera) {
                            const dist = preview.camera.position.distanceTo(centerPos);
                            const baselineDist = 24.0;
                            configRadius = configRadius * (baselineDist / Math.max(dist, 0.1));
                        } else {
                            configRadius = configRadius * preview.camera.zoom;
                        }
                    }

                    const radius = this.getRenderRadius(
                        state,
                        configRadius
                    );

                    if (!reuseSilhouette) {
                        if (!this.captureGroupMask(
                            state,
                            preview.camera,
                            group
                        )) {
                            return;
                        }

                        this.renderDilation(
                            state,
                            radius
                        );
                    }

                    this.compositeGroup(
                        state,
                        previousTarget,
                        group,
                        preview.camera,
                        radius
                    );
                });

                if (!reuseSilhouette) {
                    state.silhouetteValid = true;
                }
            } catch (error) {
                state.silhouetteValid = false;
            } finally {
                renderer.setRenderTarget(previousTarget);
                renderer.autoClear = previousAutoClear;

                if (renderer.setClearColor) {
                    renderer.setClearColor(
                        previousClearColor,
                        previousClearAlpha
                    );
                }

                state.rendering = false;
            }
        },

        patchAllPreviews(force = false) {
            if (
                this.disposed ||
                !window.Preview ||
                !Array.isArray(Preview.all)
            ) {
                return;
            }

            const previews = collectShaderArchitectRenderPreviews();
            const allAlreadyPatched =
                previews.size === this.lastPreviewPatchCount &&
                Array.from(previews).every(preview =>
                    this.patchedPreviews.has(preview)
                );

            if (!force && allAlreadyPatched) {
                return;
            }

            this.lastPreviewPatchCount = previews.size;

            previews.forEach(preview => this.patchPreview(preview));
        },

        patchPreview(preview) {
            if (
                !preview ||
                !preview.renderer ||
                this.patchedPreviews.has(preview)
            ) {
                return;
            }

            const originalRender = preview.render;

            if (typeof originalRender !== 'function') {
                return;
            }

            const manager = this;

            const patchedRender = function minecraftPromotionalSilhouetteRender() {
                const result = originalRender.apply(
                    this,
                    arguments
                );

                if (!this.sa_studio_render_manual_silhouette) {
                    manager.renderSilhouette(this);
                }
                return result;
            };

            preview.render = patchedRender;

            this.patchedPreviews.set(preview, {
                originalRender,
                patchedRender
            });
        }
    };

    const ShaderEngine = {
        globalRenderMode: 'classic',
        animationReq: null,
        pendingSceneUpdateFrame: null,
        pendingSceneUpdateCauses: null,
        pendingLightUniformFrame: null,
        pendingLightUniformCause: null,
        pendingPreviewRenderFrame: null,
        pendingPreviewRenderLightOnly: false,
        currentPreviewRenderLightOnly: false,
        lightUniformMaterialCache: null,
        lightUniformMaterialCacheDirty: true,
        animationUniformTargets: null,
        animationUniformTargetCacheDirty: true,
        clock: new THREE.Clock(),

        startAnimationLoop() {
            const self = this;
            function tick() {
                let time = self.clock.getElapsedTime();
                const animationTargets = self.getAnimationUniformTargets();

                self.updateAnimationUniformTargets(animationTargets, time);

                self.updateWorldNormalMatrices(animationTargets);
                ScreenSpaceReflectionManager.patchAllPreviews();
                MinecraftPromotionalSilhouetteManager.patchAllPreviews();
                self.animationReq = requestAnimationFrame(tick);
            }
            tick();
        },

        stopAnimationLoop() {
            if (this.animationReq) cancelAnimationFrame(this.animationReq);
            this.cancelPendingSceneUpdate();
            this.cancelPendingLightUniformUpdate();
            this.cancelPendingPreviewRender();
            this.animationUniformTargets = null;
            this.animationUniformTargetCacheDirty = true;
        },

        invalidateAnimationUniformTargetCache() {
            this.animationUniformTargets = null;
            this.animationUniformTargetCacheDirty = true;
        },

        collectAnimationUniformTargets() {
            const targets = [];

            if (!window.Cube || !Array.isArray(Cube.all)) {
                return targets;
            }

            Cube.all.forEach(cube => {
                const mesh = cube && cube.mesh;
                if (!mesh) return;

                this.forEachMeshMaterial(mesh, mat => {
                    if (!mat || !mat.uniforms) return;

                    const systemKeys = ANIMATION_SYSTEM_UNIFORM_KEYS.filter(key => !!mat.uniforms[key]);
                    const hasTime = !!mat.uniforms.uTime;
                    const hasWorldNormalMatrix = !!mat.uniforms.uWorldNormalMatrix;

                    if (!hasTime && !hasWorldNormalMatrix && systemKeys.length === 0) {
                        return;
                    }

                    targets.push({
                        cube,
                        mesh,
                        material: mat,
                        systemKeys,
                        hasTime,
                        hasWorldNormalMatrix
                    });
                });
            });

            return targets;
        },

        getAnimationUniformTargets() {
            if (
                !this.animationUniformTargetCacheDirty &&
                this.animationUniformTargets
            ) {
                return this.animationUniformTargets;
            }

            this.animationUniformTargets = this.collectAnimationUniformTargets();
            this.animationUniformTargetCacheDirty = false;
            return this.animationUniformTargets;
        },

        updateAnimationUniformTargets(targets, time) {
            (targets || []).forEach(target => {
                const cube = target && target.cube;
                const mat = target && target.material;

                if (!cube || !cube.mesh || !mat || !mat.uniforms) {
                    return;
                }

                let updated = false;

                if (target.hasTime && mat.uniforms.uTime) {
                    mat.uniforms.uTime.value = time;
                    updated = true;
                }

                (target.systemKeys || []).forEach(uniKey => {
                    const uniform = mat.uniforms[uniKey];
                    if (!uniform) return;

                    const resolvedVal = resolveSystemUniformValue(
                        uniKey,
                        cube,
                        uniform.value,
                        mat
                    );

                    if (!areUniformValuesEqual(uniform.value, resolvedVal)) {
                        uniform.value = resolvedVal;
                        updated = true;
                    }
                });

                if (updated) {
                    mat.uniformsNeedUpdate = true;
                }
            });
        },

        invalidateLightUniformMaterialCache() {
            this.lightUniformMaterialCache = null;
            this.lightUniformMaterialCacheDirty = true;
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

        isSceneUpdateReady() {
            return !!Project?.parsed && !Blockbench.hasFlag('switching_project');
        },

        pickSceneUpdateCause(causes = []) {
            const priority = [
                'project_update',
                'texture_update_material',
                'texture_apply',
                'canvas_update_layered_textures',
                'canvas_update_all_faces',
                'canvas_update_render_sides',
                'cube_update_uv',
                'cube_update_faces',
                'update_selection'
            ];
            return priority.find(cause => causes.includes(cause)) || causes[0] || 'batched_update';
        },

        requestSceneUpdate(cause = 'default') {
            if (!this.pendingSceneUpdateCauses) {
                this.pendingSceneUpdateCauses = new Set();
            }
            this.pendingSceneUpdateCauses.add(cause);

            if (this.pendingSceneUpdateFrame !== null) return;

            const flush = () => {
                this.pendingSceneUpdateFrame = null;
                this.flushPendingSceneUpdate();
            };

            if (typeof requestAnimationFrame === 'function') {
                this.pendingSceneUpdateFrame = requestAnimationFrame(flush);
            } else if (typeof queueMicrotask === 'function') {
                this.pendingSceneUpdateFrame = 'microtask';
                queueMicrotask(flush);
            } else {
                this.pendingSceneUpdateFrame = 'promise';
                Promise.resolve().then(flush);
            }
        },

        flushPendingSceneUpdate() {
            const causes = this.pendingSceneUpdateCauses
                ? Array.from(this.pendingSceneUpdateCauses)
                : [];

            if (this.pendingSceneUpdateCauses) {
                this.pendingSceneUpdateCauses.clear();
            }

            if (!causes.length || !this.isSceneUpdateReady()) return;

            this.updateAllCubes(this.pickSceneUpdateCause(causes), { causes });
        },

        cancelPendingSceneUpdate() {
            if (typeof this.pendingSceneUpdateFrame === 'number' && typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(this.pendingSceneUpdateFrame);
            }
            this.pendingSceneUpdateFrame = null;
            if (this.pendingSceneUpdateCauses) {
                this.pendingSceneUpdateCauses.clear();
            }
        },

        requestLightUniformUpdate(cause = 'light_update') {
            this.pendingLightUniformCause = cause;

            if (this.pendingLightUniformFrame !== null) return;

            const flush = () => {
                const pendingCause = this.pendingLightUniformCause || 'light_update';
                this.pendingLightUniformFrame = null;
                this.pendingLightUniformCause = null;
                this.updateLightUniforms(pendingCause);
            };

            if (typeof requestAnimationFrame === 'function') {
                this.pendingLightUniformFrame = requestAnimationFrame(flush);
            } else if (typeof queueMicrotask === 'function') {
                this.pendingLightUniformFrame = 'microtask';
                queueMicrotask(flush);
            } else {
                this.pendingLightUniformFrame = 'promise';
                Promise.resolve().then(flush);
            }
        },

        cancelPendingLightUniformUpdate() {
            if (
                typeof this.pendingLightUniformFrame === 'number' &&
                typeof cancelAnimationFrame === 'function'
            ) {
                cancelAnimationFrame(this.pendingLightUniformFrame);
            }

            this.pendingLightUniformFrame = null;
            this.pendingLightUniformCause = null;
        },

        requestPreviewRender(options = {}) {
            const lightOnly = !!options.lightOnly;

            if (this.pendingPreviewRenderFrame !== null) {
                this.pendingPreviewRenderLightOnly =
                    this.pendingPreviewRenderLightOnly && lightOnly;
                return;
            }

            this.pendingPreviewRenderLightOnly = lightOnly;

            const flush = () => {
                const renderLightOnly = this.pendingPreviewRenderLightOnly;
                this.pendingPreviewRenderFrame = null;
                this.pendingPreviewRenderLightOnly = false;

                if (!window.Preview || !Array.isArray(Preview.all)) return;

                this.currentPreviewRenderLightOnly = renderLightOnly;
                try {
                    Preview.all.forEach(preview => {
                        if (preview && typeof preview.render === 'function') {
                            preview.render();
                        }
                    });
                } finally {
                    this.currentPreviewRenderLightOnly = false;
                }
            };

            if (typeof requestAnimationFrame === 'function') {
                this.pendingPreviewRenderFrame = requestAnimationFrame(flush);
            } else if (typeof queueMicrotask === 'function') {
                this.pendingPreviewRenderFrame = 'microtask';
                queueMicrotask(flush);
            } else {
                this.pendingPreviewRenderFrame = 'promise';
                Promise.resolve().then(flush);
            }
        },

        cancelPendingPreviewRender() {
            if (
                typeof this.pendingPreviewRenderFrame === 'number' &&
                typeof cancelAnimationFrame === 'function'
            ) {
                cancelAnimationFrame(this.pendingPreviewRenderFrame);
            }

            this.pendingPreviewRenderFrame = null;
            this.pendingPreviewRenderLightOnly = false;
            this.currentPreviewRenderLightOnly = false;
        },

        configureTextureWrap(texture, uniformDef, options = {}) {
            if (!texture || !texture.isTexture || !uniformDef) return false;

            const wrapMode = uniformDef.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
            let changed = false;

            if (texture.wrapS !== wrapMode) {
                texture.wrapS = wrapMode;
                changed = true;
            }

            if (texture.wrapT !== wrapMode) {
                texture.wrapT = wrapMode;
                changed = true;
            }

            if (changed || options.forceUpdate) {
                texture.needsUpdate = true;
            }

            return changed;
        },

        getTextureFromMaterial(material) {
            if (!material) return null;
            if (material.uniforms && material.uniforms.map && material.uniforms.map.value) {
                return material.uniforms.map.value;
            }
            if (material.map && material.map.isTexture) return material.map;
            return null;
        },

        getMaterialListLocal(material) {
            if (Array.isArray(material)) return material.filter(Boolean);
            return material ? [material] : [];
        },

        getTextureFromMaterialList(material) {
            const list = this.getMaterialListLocal(material);
            for (const mat of list) {
                const texture = this.getTextureFromMaterial(mat);
                if (texture) return texture;
            }
            return null;
        },

        getBlockbenchTextureMaterial(texture) {
            if (!texture) return null;

            if (typeof texture.getMaterial === 'function') {
                const material = texture.getMaterial();
                if (material) return material;
            }

            if (typeof texture.getOwnMaterial === 'function') {
                const material = texture.getOwnMaterial();
                if (material) return material;
            }

            if (texture.material) return texture.material;
            return null;
        },

        isBlockbenchLayeredTextureModeActive() {
            return !!(
                typeof Texture !== 'undefined' &&
                Texture.all &&
                Texture.all.length >= 2 &&
                typeof Format !== 'undefined' &&
                (Format.single_texture || Format.single_texture_default) &&
                Texture.all.find(texture => texture && texture.render_mode === 'layered')
            );
        },

        getTransparentFallbackTexture() {
            if (!this._transparentFallbackMap) {
                const data = new Uint8Array([0, 0, 0, 0]);
                this._transparentFallbackMap = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
                this._transparentFallbackMap.magFilter = THREE.NearestFilter;
                this._transparentFallbackMap.minFilter = THREE.NearestFilter;
                this._transparentFallbackMap.needsUpdate = true;
            }
            return this._transparentFallbackMap;
        },

        getBlockbenchLayeredTextures(fallbackTexture) {
            const textures = [];
            const fallback = fallbackTexture || this.getTransparentFallbackTexture();

            if (typeof Texture !== 'undefined' && Texture.all) {
                for (let i = Texture.all.length - 1; i >= 0 && textures.length < 3; i--) {
                    const texture = Texture.all[i];
                    if (!texture || !texture.visible) continue;

                    const material = this.getBlockbenchTextureMaterial(texture);
                    const map =
                        this.getTextureFromMaterial(material) ||
                        this.getTextureFromMaterialList(material);

                    textures.push(map || fallback);
                }
            }

            while (textures.length < 3) {
                textures.push(fallback);
            }

            return textures;
        },

        getBlockbenchTextureSourceState(cube, faceName, sourceMaterial, fallbackTexture) {
            const blockbenchTexture = getBlockbenchTextureForCube(cube, faceName);
            const layered = this.isBlockbenchLayeredTextureModeActive();

            let nativeMaterial = sourceMaterial || null;
            let layeredTextures = null;

            if (layered) {
                if (typeof Canvas !== 'undefined' && typeof Canvas.getLayeredMaterial === 'function') {
                    nativeMaterial = Canvas.getLayeredMaterial() || nativeMaterial;
                }
                layeredTextures = this.getBlockbenchLayeredTextures(fallbackTexture);
            } else {
                nativeMaterial = this.getBlockbenchTextureMaterial(blockbenchTexture) || nativeMaterial;
            }

            const nativeMap =
                layered
                    ? (layeredTextures && layeredTextures[0]) || fallbackTexture
                    : (
                        this.getTextureFromMaterial(nativeMaterial) ||
                        this.getTextureFromMaterialList(nativeMaterial) ||
                        fallbackTexture
                    );

            const renderMode = layered
                ? 'layered'
                : (
                    (blockbenchTexture && blockbenchTexture.render_mode) ||
                    (nativeMaterial && nativeMaterial.sa_source_render_mode) ||
                    'default'
                );

            let side = nativeMaterial && nativeMaterial.side !== undefined
                ? nativeMaterial.side
                : undefined;

            if (side === undefined && typeof Canvas !== 'undefined' && typeof Canvas.getRenderSide === 'function') {
                side = Canvas.getRenderSide(blockbenchTexture);
            }

            const textureSize = getBlockbenchTextureSize(blockbenchTexture);

            return {
                blockbenchTexture,
                faceName,
                nativeMaterial,
                map: nativeMap,
                renderMode,
                layered,
                layeredTextures,
                textureSize,
                transparent: nativeMaterial && nativeMaterial.transparent !== undefined ? nativeMaterial.transparent : true,
                alphaTest: layered
                    ? 0.05
                    : (nativeMaterial && nativeMaterial.alphaTest !== undefined ? nativeMaterial.alphaTest : 0.01),
                side: side !== undefined ? side : THREE.FrontSide,
                depthTest: nativeMaterial && nativeMaterial.depthTest !== undefined ? nativeMaterial.depthTest : true,
                depthWrite: nativeMaterial && nativeMaterial.depthWrite !== undefined ? nativeMaterial.depthWrite : true,
                shadowSide: nativeMaterial && nativeMaterial.shadowSide !== undefined ? nativeMaterial.shadowSide : undefined,
                blending: renderMode === 'additive'
                    ? THREE.AdditiveBlending
                    : (nativeMaterial && nativeMaterial.blending !== undefined ? nativeMaterial.blending : THREE.NormalBlending)
            };
        },

        getFragmentShaderForTextureSource(fragmentShader, sourceState) {
            if (!sourceState || !fragmentShader) {
                return fragmentShader;
            }

            let result = fragmentShader;
            let prefix = '';

            if (sourceState.layered && !result.includes('saSampleBaseMap')) {
                const canInjectLayeredTextureFragment = /uniform\s+sampler2D\s+map\s*;/.test(result);

                if (canInjectLayeredTextureFragment) {
                    const patchedFragment = result.replace(
                        /texture2D\s*\(\s*map\s*,/g,
                        'saSampleBaseMap('
                    );

                    if (patchedFragment !== result) {
                        result = injectBlockbenchLayeredTextureFragment(patchedFragment);
                    }
                }
            }

            const shaderAlreadyHandlesEmissive = /\bEMISSIVE\b/.test(fragmentShader);
            const needsEmissiveFallback =
                sourceState.renderMode === 'emissive' &&
                !shaderAlreadyHandlesEmissive;

            if (needsEmissiveFallback) {
                const sampleMatch = result.match(
                    /(vec4\s+([A-Za-z_]\w*)\s*=\s*(?:texture2D\s*\(\s*map\s*,|saSampleBaseMap\s*\()[\s\S]*?\);\s*)/
                );

                if (sampleMatch) {
                    const sampleName = sampleMatch[2];
                    const emissiveReturn = `
    if (EMISSIVE) {
        if (${sampleName}.a < 0.01) {
            discard;
        }
        gl_FragColor = vec4(${sampleName}.rgb, 1.0);
        return;
    }
`;

                    result = result.replace(sampleMatch[0], sampleMatch[0] + emissiveReturn);
                    prefix += 'uniform bool EMISSIVE;\n';
                }
            }

            return prefix ? `${prefix}\n${result}` : result;
        },

        applyBlockbenchTextureModeUniforms(targetMaterial, sourceState) {
            if (!targetMaterial || !targetMaterial.uniforms) return;

            const layered = !!(sourceState && sourceState.layered);
            const layeredTextures = layered
                ? sourceState.layeredTextures || this.getBlockbenchLayeredTextures()
                : null;

            targetMaterial.uniforms.saLayeredTextureEnabled = targetMaterial.uniforms.saLayeredTextureEnabled || {
                type: 'bool',
                value: false
            };
            targetMaterial.uniforms.saLayeredTextureEnabled.value = layered;

            for (let i = 0; i < 3; i++) {
                const key = `saLayeredTexture${i}`;
                const value = layered
                    ? (layeredTextures[i] || this.getTransparentFallbackTexture())
                    : this.getTransparentFallbackTexture();

                if (!targetMaterial.uniforms[key]) {
                    targetMaterial.uniforms[key] = {
                        type: 'sampler2D',
                        value
                    };
                } else {
                    targetMaterial.uniforms[key].value = value;
                }
            }

            targetMaterial.uniforms.EMISSIVE = targetMaterial.uniforms.EMISSIVE || {
                type: 'bool',
                value: false
            };
            targetMaterial.uniforms.EMISSIVE.value = !!(
                sourceState &&
                sourceState.renderMode === 'emissive'
            );
        },

        // Inject custom shader attributes into the generated geometry.
        addUvAspectRatioAttribute(geometry, cube, smoothnessFactor = 0.5) {
            if (!geometry.isBufferGeometry) {
                if (window.DebugTools) DebugTools.logError("Geometry must be BufferGeometry.");
                return;
            }

            smoothnessFactor = Math.max(0, Math.min(1, smoothnessFactor));

            const normalizedFaceUvData = [0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0];

            geometry.setAttribute('normalizedFaceUv', new THREE.BufferAttribute(new Float32Array(normalizedFaceUvData), 2));
            geometry.attributes.normalizedFaceUv.needsUpdate = true;

            geometry.setAttribute('uv_shadow_map', new THREE.BufferAttribute(new Float32Array(normalizedFaceUvData), 2));
            geometry.attributes.uv_shadow_map.needsUpdate = true;

            const posAttr = geometry.getAttribute('position');
            const uvAttr = geometry.getAttribute('normalizedFaceUv');
            const index = geometry.getIndex();

            if (!posAttr || !uvAttr) {
                if (window.DebugTools) DebugTools.logError("Geometry must have position and normalizedFaceUv attributes for aspect ratio calculation.");
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

            // --- UV ASPECT RATIO CALCULATION ---
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

            // --- FACE SIZE CALCULATION ---
            if (posAttr) {
                const faceSizes = new Float32Array(vertexCount * 2);
                const globalFaceSizes = new Float32Array(vertexCount * 2);
                const worldScale = new THREE.Vector3(1, 1, 1);
                const posA = new THREE.Vector3();
                const posB = new THREE.Vector3();
                const posC = new THREE.Vector3();

                if (cube?.mesh?.isObject3D) {
                    if (typeof cube.mesh.updateMatrixWorld === 'function') {
                        cube.mesh.updateMatrixWorld(true);
                    }
                    cube.mesh.getWorldScale(worldScale);
                    worldScale.set(
                        Math.abs(worldScale.x) || 1,
                        Math.abs(worldScale.y) || 1,
                        Math.abs(worldScale.z) || 1
                    );
                }

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
                    let scaleX = worldScale.x;
                    let scaleY = worldScale.y;
                    if (Math.abs(sizeX) < 1e-6) {
                        const minZ = Math.min(posA.z, posB.z, posC.z);
                        const maxZ = Math.max(posA.z, posB.z, posC.z);
                        sizeX = maxZ - minZ;
                        scaleX = worldScale.z;
                        if (Math.abs(sizeX) < 1e-6) sizeX = 1;
                    }
                    if (Math.abs(sizeY) < 1e-6) {
                        const minZ = Math.min(posA.z, posB.z, posC.z);
                        const maxZ = Math.max(posA.z, posB.z, posC.z);
                        sizeY = maxZ - minZ;
                        scaleY = worldScale.z;
                        if (Math.abs(sizeY) < 1e-6) sizeY = 1;
                    }

                    faceSizes[idxA * 2] = sizeX; faceSizes[idxA * 2 + 1] = sizeY;
                    faceSizes[idxB * 2] = sizeX; faceSizes[idxB * 2 + 1] = sizeY;
                    faceSizes[idxC * 2] = sizeX; faceSizes[idxC * 2 + 1] = sizeY;

                    globalFaceSizes[idxA * 2] = sizeX * scaleX; globalFaceSizes[idxA * 2 + 1] = sizeY * scaleY;
                    globalFaceSizes[idxB * 2] = sizeX * scaleX; globalFaceSizes[idxB * 2 + 1] = sizeY * scaleY;
                    globalFaceSizes[idxC * 2] = sizeX * scaleX; globalFaceSizes[idxC * 2 + 1] = sizeY * scaleY;
                }
                geometry.setAttribute('faceSize', new THREE.BufferAttribute(faceSizes, 2));
                geometry.attributes.faceSize.needsUpdate = true;

                geometry.setAttribute('globalFaceSize', new THREE.BufferAttribute(globalFaceSizes, 2));
                geometry.attributes.globalFaceSize.needsUpdate = true;

                const faceOrder = ['east', 'west', 'up', 'down', 'south', 'north'];
                // --- UV SIZE CALCULATION ---
                const uvAttrOriginal = geometry.getAttribute('uv');
                if (uvAttrOriginal) {
                    const uvSizeArray = new Float32Array(vertexCount * 2);

                    faceOrder.forEach((face, i) => {
                        const faceUvSize = [
                            Math.abs(cube.faces[face].uv[0] - cube.faces[face].uv[2]),
                            Math.abs(cube.faces[face].uv[1] - cube.faces[face].uv[3]),
                        ];
                        const faceSizeX = faceSizes[i * 8 + 0];
                        const faceSizeY = faceSizes[i * 8 + 1];
                        const uvSizeRows = [
                            [faceUvSize[0] / faceSizeX, faceUvSize[1] / faceSizeY],
                            [faceUvSize[0] / faceSizeX, faceUvSize[1] / faceSizeY],
                            [faceUvSize[0] / faceSizeX, faceUvSize[1] / faceSizeY],
                            [faceUvSize[0] / faceSizeX, faceUvSize[1] / faceSizeY]
                        ];
                        uvSizeArray.set(uvSizeRows[0], i * 8 + 0);
                        uvSizeArray.set(uvSizeRows[1], i * 8 + 2);
                        uvSizeArray.set(uvSizeRows[2], i * 8 + 4);
                        uvSizeArray.set(uvSizeRows[3], i * 8 + 6);
                    });

                    geometry.setAttribute('uvSize', new THREE.BufferAttribute(uvSizeArray, 2));
                    geometry.attributes.uvSize.needsUpdate = true;
                }
            }

            // --- SMOOTH NORMAL CALCULATION ---
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
            shader = MaterialManager.getRenderMaterial(shader);
            const mesh = cube.mesh;
            if (!mesh || !mesh.material || !mesh.geometry || !shader) return;

            const wasMaterialArray = Array.isArray(mesh.material);
            const sourceSlots = wasMaterialArray ? mesh.material.slice() : [mesh.material];
            const fallbackSourceMaterial = sourceSlots.find(Boolean);

            if (!fallbackSourceMaterial) return;

            const faceMaterialOverrides = MaterialManager.getCubeFaceMaterialInstanceOverrides(cube);
            const hasFaceMaterialOverrides = Object.keys(faceMaterialOverrides).length > 0;
            const useMaterialArray = wasMaterialArray || hasFaceMaterialOverrides;

            if (hasFaceMaterialOverrides && sourceSlots.length < MATERIAL_SLOT_FACE_ORDER.length) {
                while (sourceSlots.length < MATERIAL_SLOT_FACE_ORDER.length) {
                    sourceSlots.push(fallbackSourceMaterial);
                }
            }

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

            const setupAlphaShadowMaterials = (mesh, texture, sourceMaterial, shader, sourceState = {}) => {
                if (!shader.enableShadows || !texture) {
                    delete mesh.customDepthMaterial;
                    delete mesh.customDistanceMaterial;
                    return;
                }

                const alphaTest =
                    sourceState.alphaTest !== undefined
                        ? Math.max(sourceState.alphaTest, 0.01)
                        : sourceMaterial.alphaTest !== undefined
                        ? Math.max(sourceMaterial.alphaTest, 0.01)
                        : 0.01;

                const side =
                    sourceState.shadowSide !== undefined
                        ? sourceState.shadowSide
                        : sourceState.side !== undefined
                        ? sourceState.side
                        : sourceMaterial.shadowSide !== undefined
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

            const applyShaderUniformsToMaterial = (targetMaterial, sourceMaterial, resolvedMap, activeShader, sourceState = {}) => {
                activeShader = MaterialManager.getRenderMaterial(activeShader) || shader;

                targetMaterial.vertexShader = activeShader.vertex;
                targetMaterial.fragmentShader = this.getFragmentShaderForTextureSource(
                    activeShader.fragment,
                    sourceState
                );
                targetMaterial.lights = !!activeShader.enableShadows;
                targetMaterial.sa_shader_id = activeShader.baseMaterialId || activeShader.id || activeShader.name || 'material';
                targetMaterial.sa_source_face_name = sourceState.faceName || '';
                targetMaterial.sa_source_render_mode = sourceState.renderMode || 'default';
                targetMaterial.sa_source_texture_uuid = sourceState.blockbenchTexture && sourceState.blockbenchTexture.uuid
                    ? sourceState.blockbenchTexture.uuid
                    : '';

                if (activeShader.materialInstanceId) {
                    targetMaterial.sa_material_instance_id = activeShader.materialInstanceId;
                } else if (targetMaterial.sa_material_instance_id !== undefined) {
                    delete targetMaterial.sa_material_instance_id;
                }

                targetMaterial.extensions = targetMaterial.extensions || {};
                targetMaterial.extensions.derivatives = true;

                targetMaterial.uniforms = targetMaterial.uniforms || {};

                if (activeShader.enableShadows && !targetMaterial.uniforms.directionalLights) {
                    targetMaterial.uniforms = THREE.UniformsUtils.merge([
                        THREE.UniformsLib['lights'],
                        targetMaterial.uniforms
                    ]);
                }

                for (const key in activeShader.uniforms) {
                    const def = activeShader.uniforms[key];
                    let val = def.value;

                    if (def.type === 'sampler2D' && val && val.isTexture) {
                        this.configureTextureWrap(val, def);
                    }

                    if (isSystemUniform(key)) {
                        val = resolveSystemUniformValue(key, cube, val, sourceState);
                        const dynamicKeys = ['shade', 'lightside', 'lightcolor', 'uambient', 'uambientcolor', 'emissive', 'texture_size'];
                        if (!dynamicKeys.includes(key.toLowerCase())) {
                            if (targetMaterial.uniforms[key]) {
                                continue;
                            }
                        }
                    }

                    if (def.type === 'color' && def.hexValue) {
                        val = this.hexToVec3(def.hexValue);
                    }
                    if (isColorUniformDefinition(def) && def.type !== 'color') {
                        syncColorUniformValue(def, def.hexValue || vectorToColorHex(def.value));
                        val = def.value;
                    }

                    val = cloneUniformValue(val);
                    if (def.type === 'sampler2D' && val && val.isTexture) {
                        this.configureTextureWrap(val, def);
                    }

                    if (!targetMaterial.uniforms[key]) {
                        targetMaterial.uniforms[key] = {
                            type: def.type === 'color' ? 'vec3' : def.type,
                            value: val
                        };
                    } else {
                        targetMaterial.uniforms[key].value = val;
                    }
                }

                const mapDef = activeShader.uniforms.map;
                if (resolvedMap && mapDef) {
                    if (!sourceState.blockbenchTexture) {
                        this.configureTextureWrap(resolvedMap, mapDef, { forceUpdate: true });
                    } else {
                        resolvedMap.needsUpdate = true;
                    }
                }

                targetMaterial.uniforms.map = targetMaterial.uniforms.map || { value: resolvedMap };
                targetMaterial.uniforms.map.value = resolvedMap;
                targetMaterial.map = resolvedMap;
                this.applyBlockbenchTextureModeUniforms(targetMaterial, sourceState);

                if (!targetMaterial.uniforms.uWorldNormalMatrix) {
                    targetMaterial.uniforms.uWorldNormalMatrix = {
                        value: new THREE.Matrix3()
                    };
                }

                ScreenSpaceReflectionManager.configureMaterial(targetMaterial, activeShader);

                targetMaterial.transparent =
                    sourceState.transparent !== undefined
                        ? sourceState.transparent
                        : (sourceMaterial.transparent !== undefined ? sourceMaterial.transparent : true);

                targetMaterial.alphaTest =
                    sourceState.alphaTest !== undefined
                        ? sourceState.alphaTest
                        : (sourceMaterial.alphaTest !== undefined ? sourceMaterial.alphaTest : 0.01);

                targetMaterial.side =
                    sourceState.side !== undefined
                        ? sourceState.side
                        : (sourceMaterial.side !== undefined ? sourceMaterial.side : THREE.FrontSide);

                targetMaterial.depthTest =
                    sourceState.depthTest !== undefined
                        ? sourceState.depthTest
                        : (sourceMaterial.depthTest !== undefined ? sourceMaterial.depthTest : true);

                targetMaterial.depthWrite =
                    sourceState.depthWrite !== undefined
                        ? sourceState.depthWrite
                        : (sourceMaterial.depthWrite !== undefined ? sourceMaterial.depthWrite : true);

                targetMaterial.blending =
                    sourceState.blending !== undefined
                        ? sourceState.blending
                        : (sourceMaterial.blending !== undefined ? sourceMaterial.blending : THREE.NormalBlending);

                targetMaterial.needsUpdate = true;
                targetMaterial.uniformsNeedUpdate = true;
            };

            cube.shader_type = shader.name || shader.id;

            this.addUvAspectRatioAttribute(
                mesh.geometry,
                cube,
                window.smoothnessFactor ?? 0.5
            );

            const slotShaders = [];
            const sourceStates = [];
            const getShaderForMaterialSlot = (materialIndex) => {
                if (slotShaders[materialIndex]) return slotShaders[materialIndex];

                const faceName = MATERIAL_SLOT_FACE_ORDER[materialIndex];
                const slotShader = faceName
                    ? MaterialManager.resolveCubeFaceMaterial(cube, faceName, shader)
                    : shader;

                slotShaders[materialIndex] = MaterialManager.getRenderMaterial(slotShader) || shader;
                return slotShaders[materialIndex];
            };

            const newMaterialSlots = sourceSlots.map((slotMaterial, materialIndex) => {
                const sourceMaterial = slotMaterial || fallbackSourceMaterial;
                const activeShader = getShaderForMaterialSlot(materialIndex);
                const sourceFaceName = useMaterialArray
                    ? MaterialManager.getMaterialSlotFaceName(materialIndex)
                    : null;
                const sourceState = this.getBlockbenchTextureSourceState(
                    cube,
                    sourceFaceName,
                    sourceMaterial,
                    getFallbackTexture()
                );
                sourceStates[materialIndex] = sourceState;

                const resolvedMap =
                    sourceState.map ||
                    getTextureFromMaterial(sourceState.nativeMaterial) ||
                    getTextureFromMaterial(sourceMaterial) ||
                    getFallbackTexture();

                if (resolvedMap) {
                    if (resolvedMap.magFilter !== undefined) resolvedMap.magFilter = THREE.NearestFilter;
                    if (resolvedMap.minFilter !== undefined) resolvedMap.minFilter = THREE.NearestFilter;
                    resolvedMap.needsUpdate = true;
                }

                let targetMaterial = sourceMaterial;
                const shouldCreateSlotMaterial =
                    !sourceMaterial.is_sa_cloned ||
                    (useMaterialArray && sourceMaterial.sa_material_index !== materialIndex);

                if (shouldCreateSlotMaterial) {
                    const existingUniforms = sourceMaterial.uniforms
                        ? THREE.UniformsUtils.clone(sourceMaterial.uniforms)
                        : {};

                    const baseUniforms = activeShader.enableShadows
                        ? THREE.UniformsUtils.merge([THREE.UniformsLib['lights'], existingUniforms])
                        : THREE.UniformsUtils.clone(existingUniforms);

                    baseUniforms.map = { value: resolvedMap };

                    targetMaterial = new THREE.ShaderMaterial({
                        uniforms: baseUniforms,
                        vertexShader: activeShader.vertex,
                        fragmentShader: this.getFragmentShaderForTextureSource(
                            activeShader.fragment,
                            sourceState
                        ),
                        lights: !!activeShader.enableShadows,
                        transparent: sourceState.transparent !== undefined ? sourceState.transparent : true,
                        alphaTest: sourceState.alphaTest !== undefined ? sourceState.alphaTest : 0.01,
                        side: sourceState.side !== undefined ? sourceState.side : THREE.FrontSide,
                        depthTest: sourceState.depthTest !== undefined ? sourceState.depthTest : true,
                        depthWrite: sourceState.depthWrite !== undefined ? sourceState.depthWrite : true,
                        blending: sourceState.blending !== undefined ? sourceState.blending : THREE.NormalBlending,
                        extensions: {
                            derivatives: true
                        }
                    });

                    targetMaterial.is_sa_cloned = true;
                    targetMaterial.sa_shader_id = activeShader.baseMaterialId || activeShader.id || activeShader.name || 'material';
                    if (activeShader.materialInstanceId) {
                        targetMaterial.sa_material_instance_id = activeShader.materialInstanceId;
                    }
                    targetMaterial.sa_material_index = materialIndex;
                    targetMaterial.name = `SA_${activeShader.materialInstanceId || activeShader.id || activeShader.name || 'material'}_${materialIndex}`;
                }

                applyShaderUniformsToMaterial(targetMaterial, sourceMaterial, resolvedMap, activeShader, sourceState);

                return targetMaterial;
            });

            mesh.material = useMaterialArray ? newMaterialSlots : newMaterialSlots[0];

            const meshUsesShadows = slotShaders.some(slotShader => slotShader && slotShader.enableShadows);
            mesh.castShadow = meshUsesShadows;
            mesh.receiveShadow = meshUsesShadows;

            const firstSourceState = sourceStates.find(Boolean) ||
                this.getBlockbenchTextureSourceState(cube, null, sourceSlots.find(Boolean) || fallbackSourceMaterial, getFallbackTexture());
            const firstSourceMaterial = firstSourceState.nativeMaterial || sourceSlots.find(Boolean) || fallbackSourceMaterial;
            const firstTexture =
                firstSourceState.map ||
                getTextureFromMaterial(newMaterialSlots[0]) ||
                getTextureFromMaterial(firstSourceMaterial) ||
                getTextureFromBlockbenchCube(cube) ||
                getFallbackTexture();

            const shadowShader = slotShaders.find(slotShader => slotShader && slotShader.enableShadows) || shader;
            setupAlphaShadowMaterials(mesh, firstTexture, firstSourceMaterial, shadowShader, firstSourceState);
            this.invalidateLightUniformMaterialCache();
            this.invalidateAnimationUniformTargetCache();
        },

        updateAllCubes(cause = 'default', options = {}) {
            if (!options.keepPending) {
                this.cancelPendingSceneUpdate();
            }

            this.invalidateLightUniformMaterialCache();
            this.invalidateAnimationUniformTargetCache();

            Cube.all.forEach(cube => {
                if (cube.mesh) {
                    cube.mesh.castShadow = true;
                    cube.mesh.receiveShadow = true;
                    let shader = MaterialManager.resolveCubeMaterial(cube, this.globalRenderMode);
                    if (!shader) shader = MaterialManager.materials['classic'];

                    // Pass the full cube so `applyToMesh` can read custom attributes.
                    this.applyToMesh(cube, shader);
                }
            });

            this.updateWorldNormalMatrices();
            this.updateLightUniforms();
            MinecraftPromotionalSilhouetteManager.invalidateGroups();

            //Dispatch Blockbench event to signal that shaders have been updated

            const eventData = { cause };
            if (options.causes && options.causes.length) {
                eventData.causes = options.causes;
            }
            Blockbench.dispatchEvent('shader_update_complete', eventData);

        },

        updateAllUniforms(cause = 'default') {
            this.invalidateLightUniformMaterialCache();
            this.invalidateAnimationUniformTargetCache();

            const cloneUniformValue = (value) => {
                if (value && typeof value.clone === 'function') return value.clone();
                if (Array.isArray(value)) return value.map(v => cloneUniformValue(v));
                return value;
            };

            Cube.all.forEach(cube => {
                const mesh = cube.mesh;
                if (!mesh || !mesh.material) return;

                let shader = MaterialManager.resolveCubeMaterial(cube, this.globalRenderMode);
                if (!shader) shader = MaterialManager.materials['classic'];
                shader = MaterialManager.getRenderMaterial(shader);
                if (!shader) return;

                this.forEachMeshMaterial(mesh, (mat, materialIndex) => {
                    if (mat && mat.is_sa_cloned && mat.uniforms) {
                        const faceName = MaterialManager.getMaterialSlotFaceName(materialIndex);
                        const activeShader = faceName
                            ? MaterialManager.resolveCubeFaceMaterial(cube, faceName, shader)
                            : shader;
                        const renderShader = MaterialManager.getRenderMaterial(activeShader) || shader;

                        for (const key in renderShader.uniforms) {
                            const def = renderShader.uniforms[key];
                            let val = def.value;

                            if (def.type === 'sampler2D' && val && val.isTexture) {
                                this.configureTextureWrap(val, def);
                            }

                            if (isSystemUniform(key)) {
                                const dynamicKeys = ['shade', 'lightside', 'lightcolor', 'uambient', 'uambientcolor', 'emissive', 'texture_size'];
                                if (dynamicKeys.includes(key.toLowerCase())) {
                                    val = resolveSystemUniformValue(key, cube, val, mat);
                                } else {
                                    continue;
                                }
                            }

                            if (def.type === 'color' && def.hexValue) {
                                val = this.hexToVec3(def.hexValue);
                            }
                            if (isColorUniformDefinition(def) && def.type !== 'color') {
                                syncColorUniformValue(def, def.hexValue || vectorToColorHex(def.value));
                                val = def.value;
                            }

                            val = cloneUniformValue(val);
                            if (def.type === 'sampler2D' && val && val.isTexture) {
                                this.configureTextureWrap(val, def);
                            }

                            if (mat.uniforms[key]) {
                                mat.uniforms[key].value = val;
                            } else {
                                mat.uniforms[key] = {
                                    type: def.type === 'color' ? 'vec3' : def.type,
                                    value: val
                                };
                            }
                        }

                        const mapDef = renderShader.uniforms.map;
                        const activeMap = mat.uniforms.map && mat.uniforms.map.value;
                        if (mapDef && activeMap && activeMap.isTexture) {
                            if (!mat.sa_source_texture_uuid) {
                                this.configureTextureWrap(activeMap, mapDef);
                            } else {
                                activeMap.needsUpdate = true;
                            }
                        }

                        ScreenSpaceReflectionManager.configureMaterial(mat, renderShader);
                        mat.uniformsNeedUpdate = true;
                    }
                });
            });

            Blockbench.dispatchEvent('shader_update_complete', {
                cause
            });

            MinecraftPromotionalSilhouetteManager.invalidateGroups();
            this.requestPreviewRender();
        },

        updateWorldNormalMatrices(targets = null) {
            const sourceTargets = Array.isArray(targets)
                ? targets
                : this.getAnimationUniformTargets();
            const updatedMeshes = new Set();

            sourceTargets.forEach(target => {
                if (!target || !target.hasWorldNormalMatrix) return;

                const mesh = target.mesh || (target.cube && target.cube.mesh);
                const mat = target.material;

                if (!mesh || !mat || !mat.uniforms || !mat.uniforms.uWorldNormalMatrix) return;

                if (!updatedMeshes.has(mesh)) {
                    mesh.updateMatrixWorld(true);
                    updatedMeshes.add(mesh);
                }

                let m = mat.uniforms.uWorldNormalMatrix.value;

                // Ensure this is a valid Matrix3 instance.
                if (!m || typeof m.getNormalMatrix !== 'function') {
                    const newMatrix = new THREE.Matrix3();
                    if (m && m.elements) {
                        newMatrix.fromArray(m.elements);
                    } else if (m && Array.isArray(m)) {
                        newMatrix.fromArray(m);
                    }
                    mat.uniforms.uWorldNormalMatrix.value = newMatrix;
                    m = newMatrix;
                }

                m.getNormalMatrix(mesh.matrixWorld);
                mat.uniformsNeedUpdate = true;
            });
        },

        materialUsesLightUniforms(material) {
            if (!material || !material.uniforms) return false;

            return [
                'max_light_number',
                'uLightPos',
                'uLightDir',
                'uLightColor',
                'uLightIntensity',
                'uLightDistance',
                'uLightConeAngle',
                'uLightType',
                'uLightPenumbra',
                'uLightCastShadow',
                'uLightShadowIndex'
            ].some(name => !!material.uniforms[name]);
        },

        getLightUniformMaterials() {
            if (!this.lightUniformMaterialCacheDirty && this.lightUniformMaterialCache) {
                return this.lightUniformMaterialCache;
            }

            const materials = [];
            const seen = new Set();

            if (window.Cube && Array.isArray(Cube.all)) {
                Cube.all.forEach(cube => {
                    const mesh = cube && cube.mesh;
                    if (!mesh || !mesh.material) return;

                    this.forEachMeshMaterial(mesh, (mat) => {
                        if (!this.materialUsesLightUniforms(mat)) return;

                        const key = mat.uuid || mat.id || mat;
                        if (seen.has(key)) return;

                        seen.add(key);
                        materials.push(mat);
                    });
                });
            }

            this.lightUniformMaterialCache = materials;
            this.lightUniformMaterialCacheDirty = false;
            return materials;
        },

        updateLightUniforms() {
            this.cancelPendingLightUniformUpdate();

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

            if (!this._preparingLightUniformRender && typeof window.LightManagerPrepareRender === 'function') {
                this._preparingLightUniformRender = true;
                try {
                    const preview =
                        window.LightManagerStudioRenderPreview ||
                        (typeof Preview !== 'undefined' && Preview.selected) ||
                        window.main_preview ||
                        window.MediaPreview ||
                        window.Screencam?.NoAAPreview ||
                        null;
                    window.LightManagerPrepareRender(preview, {
                        shadows: true,
                        scene: true,
                        gizmos: false,
                        studio: !!window.LightManagerStudioRenderActive
                    });
                } finally {
                    this._preparingLightUniformRender = false;
                }
            }

            const threeLights = window.three_lights || {};
            const threeLightsGroup = window.three_lights_group || null;

            const getLightTypeIdFromElement = (element) => {
                if (element.light_type === 'directional') return 1;
                if (element.light_type === 'spot') return 2;
                return 0;
            };

            const isUsableThreeLight = (threeLight) => {
                return !!(
                    threeLight &&
                    (
                        threeLight.isLight ||
                        threeLight.shadow ||
                        threeLight.castShadow !== undefined ||
                        threeLight.color ||
                        threeLight.position
                    )
                );
            };

            const getLightTypeIdFromThree = (threeLight) => {
                if (!threeLight) return 0;
                const typeName = threeLight.constructor && threeLight.constructor.name;
                if (threeLight.isDirectionalLight || typeName === 'DirectionalLight') return 1;
                if (threeLight.isSpotLight || typeName === 'SpotLight') return 2;
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
                return isUsableThreeLight(threeLight) ? threeLight : null;
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
                Real shadow-map index map.
                Three.js does not use the LightElement.all index.
                Use the actual THREE light order from the scene/group.
            */
            const shadowIndexByThreeUuid = new Map();

            let directionalShadowIndex = 0;
            let spotShadowIndex = 0;
            let pointShadowIndex = 0;

            const registerShadowLight = (threeLight) => {
                if (!isUsableThreeLight(threeLight)) return;
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

            const toVector3 = (value, fallbackFactory) => {
                if (value && typeof value.copy === 'function') return value;

                const fallback = fallbackFactory();
                if (value && value.x !== undefined) {
                    fallback.set(
                        Number(value.x) || 0,
                        Number(value.y) || 0,
                        Number(value.z) || 0
                    );
                } else if (Array.isArray(value)) {
                    fallback.set(
                        Number(value[0]) || 0,
                        Number(value[1]) || 0,
                        Number(value[2]) || 0
                    );
                }
                return fallback;
            };

            const ensureVectorArrayUniform = (mat, name, fallbackFactory) => {
                const uniform = ensureUniform(mat, name, () => []);
                if (!Array.isArray(uniform.value)) uniform.value = [];

                for (let i = 0; i < MAX_LIGHTS; i++) {
                    uniform.value[i] = toVector3(uniform.value[i], fallbackFactory);
                }

                return uniform;
            };

            const ensureNumberArrayUniform = (mat, name, fallbackValue = 0) => {
                const uniform = ensureUniform(mat, name, () => []);
                if (!Array.isArray(uniform.value)) uniform.value = [];

                for (let i = 0; i < MAX_LIGHTS; i++) {
                    const value = Number(uniform.value[i] ?? fallbackValue);
                    uniform.value[i] = Number.isFinite(value) ? value : fallbackValue;
                }

                return uniform;
            };

            this.getLightUniformMaterials().forEach(mat => {
                if (!mat || !mat.uniforms) return;

                let lightUniformsUpdated = false;

                if (mat.uniforms.max_light_number) {
                    mat.uniforms.max_light_number.value = activeLightCount;
                    lightUniformsUpdated = true;
                }

                const vectorUniforms = [
                    ['uLightPos', posArray, () => new THREE.Vector3()],
                    ['uLightDir', dirArray, () => new THREE.Vector3(0, -1, 0)],
                    ['uLightColor', colArray, () => new THREE.Vector3()]
                ];

                vectorUniforms.forEach(([name, sourceArray, fallbackFactory]) => {
                    if (!mat.uniforms[name]) return;
                    const uniform = ensureVectorArrayUniform(mat, name, fallbackFactory);
                    for (let i = 0; i < MAX_LIGHTS; i++) {
                        uniform.value[i].copy(sourceArray[i]);
                    }
                    lightUniformsUpdated = true;
                });

                const numberUniforms = [
                    ['uLightIntensity', intArray, 0],
                    ['uLightDistance', distanceArray, 0],
                    ['uLightConeAngle', coneAngleArray, 0],
                    ['uLightType', lightTypeArray, 0],
                    ['uLightPenumbra', penumbraArray, 0],
                    ['uLightCastShadow', castShadowArray, 0],
                    ['uLightShadowIndex', shadowIndexArray, -1]
                ];

                numberUniforms.forEach(([name, sourceArray, fallbackValue]) => {
                    if (!mat.uniforms[name]) return;
                    const uniform = ensureNumberArrayUniform(mat, name, fallbackValue);
                    for (let i = 0; i < MAX_LIGHTS; i++) {
                        uniform.value[i] = sourceArray[i];
                    }
                    lightUniformsUpdated = true;
                });

                if (lightUniformsUpdated) {
                    mat.uniformsNeedUpdate = true;
                }
            });

            this.requestPreviewRender({ lightOnly: true });
        }
    };

    // =========================================================================
    // 5. MATERIAL STUDIO INTERFACE (Dialog & Vue)
    // =========================================================================

    let MaterialStudioDialog;

    function initMaterialStudio() {
        MaterialStudioDialog = new Dialog({
            title: tl('shader_architect.dialog.studio_title'),
            id: 'sa_material_studio_dialog',
            resizable: true,
            width: Math.min(1600, window.innerWidth - 60) || 1400,
            height: Math.min(1100, window.innerHeight - 60) || 900,
            onOpen() {
                // Apply the resolved height after Blockbench mounts the dialog.
                let h = Math.min(1100, window.innerHeight - 60) || 900;
                this.object.style.height = h + 'px';
                if (this.content_vue) {
                    this.content_vue.setupEditorEvents();
                }
            },
            component: {
                data() {
                    return {
                        materials: {},
                        selectedId: null,
                        editingMode: 'vertex',
                        newUniformName: 'u_myVar',
                        newUniformType: 'float',
                        newUniformExpose: true,
                        newUniformAdvanced: false,
                        newUniformMin: null,
                        newUniformMax: null,
                        newUniformStep: null,
                        newUniformAllowHigher: true,
                        newUniformAllowLower: true,
                        selectedNativeUniformName: 'uLightPos',
                        // Per-channel range for vec2 / vec3
                        newUniformChannels: {
                            x: { min: null, max: null, step: null, allow_higher: true, allow_lower: true, enabled: false },
                            y: { min: null, max: null, step: null, allow_higher: true, allow_lower: true, enabled: false },
                            z: { min: null, max: null, step: null, allow_higher: true, allow_lower: true, enabled: false },
                            w: { min: null, max: null, step: null, allow_higher: true, allow_lower: true, enabled: false }
                        },
                        expandedUniforms: {},
                        newTransLang: {},
                        newTransVal: {},
                        validationErrors: [],
                        validating: false,

                        // Layout and workspace controls
                        showLeftSidebar: true,
                        showRightSidebar: true,
                        showAdvancedTweaks: false,
                        problemsCollapsed: false,
                        autocomplete: {
                            show: false,
                            list: [],
                            index: 0,
                            x: 0,
                            y: 0,
                            textBefore: '',
                            word: '',
                            replaceStart: 0,
                            replaceEnd: 0
                        }
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
                    },
                    nativeUniformOptions() {
                        return MaterialManager.getNativeMaterialUniformOptions();
                    },
                    selectedNativeUniformOption() {
                        return this.nativeUniformOptions.find(option => option.name === this.selectedNativeUniformName) || null;
                    }
                },
                watch: {
                    currentShaderCode() {
                        this.debounceValidate();
                    },
                    editingMode() {
                        this.setupEditorEvents();
                        this.debounceValidate();
                        this.closeAutocomplete();
                    },
                    selectedId() {
                        this.setupEditorEvents();
                        this.debounceValidate();
                        this.closeAutocomplete();
                    }
                },
                methods: {
                    tl(key) {
                        return tl(key);
                    },
                    isSystemUniform(name) {
                        return isSystemUniform(name);
                    },
                    isUniformVisibleInQuickTweaks(uni, key) {
                        if (!uni || !((uni.expose || key === 'map') && !isSystemUniform(key))) return false;
                        return !uni.advanced || this.showAdvancedTweaks;
                    },
                    formatNumber(val) {
                        let num = Number(val);
                        return isNaN(num) ? "0.00" : num.toFixed(2);
                    },
                    isColorUniform(uni) {
                        return MaterialManager.isColorUniformDefinition(uni);
                    },
                    getUniformColorHex(uni) {
                        return MaterialManager.getUniformColorHex(uni);
                    },
                    setUniformColorHex(uni, hex) {
                        MaterialManager.syncColorUniformValue(uni, hex);
                    },
                    highlighter(code) {
                        if (typeof Prism !== 'undefined' && Prism.languages.glsl) {
                            return Prism.highlight(code, Prism.languages.glsl, 'glsl');
                        }
                        return code;
                    },
                    formatCode() {
                        this.currentShaderCode = formatGLSL(this.currentShaderCode);
                        Blockbench.showToastNotification({ text: 'GLSL Formatted', expire: 1500 });
                        this.$nextTick(() => {
                            this.debounceValidate();
                        });
                    },
                    toggleMaterialShadows() {
                        if (!this.activeMat || !this.activeMat.isCustom) return;

                        const enabled = !this.activeMat.enableShadows;
                        this.$set(
                            this.activeMat,
                            'uniforms',
                            MaterialManager.addMaterialLightingUniforms(this.activeMat.uniforms || {})
                        );
                        this.$set(this.activeMat, 'enableShadows', enabled);

                        MaterialManager.register(this.activeMat);
                        ShaderEngine.updateAllCubes('material_studio_toggle_shadows');
                        Blockbench.showToastNotification({
                            text: tl(enabled
                                ? 'shader_architect.toast.shadows_enabled'
                                : 'shader_architect.toast.shadows_disabled'),
                            expire: 1500
                        });
                    },
                    toggleMaterialScreenSpaceReflections() {
                        if (!this.activeMat || !this.activeMat.isCustom) return;

                        const enabled = !this.activeMat.supportsScreenSpaceReflections;
                        if (enabled) {
                            MaterialManager.enableScreenSpaceReflections(this.activeMat, {
                                enabled: true,
                                save: false
                            });
                        } else {
                            this.$set(this.activeMat, 'supportsScreenSpaceReflections', false);
                            if (this.activeMat.uniforms && this.activeMat.uniforms.uSSREnabled) {
                                this.activeMat.uniforms.uSSREnabled.value = false;
                            }
                        }

                        MaterialManager.register(this.activeMat);
                        ShaderEngine.updateAllCubes('material_studio_toggle_reflections');
                        Blockbench.showToastNotification({
                            text: tl(enabled
                                ? 'shader_architect.toast.reflections_enabled'
                                : 'shader_architect.toast.reflections_disabled'),
                            expire: 1500
                        });
                    },
                    hasMaterialShadowsEnabled() {
                        return !!(this.activeMat && this.activeMat.enableShadows);
                    },
                    hasMaterialScreenSpaceReflectionsEnabled() {
                        return !!(
                            this.activeMat &&
                            this.activeMat.supportsScreenSpaceReflections
                        );
                    },
                    selectMaterial(id) {
                        this.selectedId = id;
                        this.validationErrors = [];
                        this.closeAutocomplete();
                    },
                    createNewMaterial() {
                        let m = new FancyShaderMaterial({
                            name: "New Material",
                            vertex: MaterialManager.materials['classic'].vertex,
                            fragment: MaterialManager.materials['classic'].fragment,
                            uniforms: MaterialManager.cloneUniformMap(MaterialManager.materials['classic'].uniforms)
                        });
                        this.$set(this.materials, m.id, m);
                        MaterialManager.register(m);
                        this.selectMaterial(m.id);
                    },
                    duplicateActiveMaterial() {
                        if (!this.activeMat) return;
                        let newName = this.activeMat.name + " (Copy)";
                        let m = new FancyShaderMaterial({
                            name: newName,
                            icon: this.activeMat.icon,
                            vertex: this.activeMat.vertex,
                            fragment: this.activeMat.fragment,
                            uniforms: MaterialManager.cloneUniformMap(this.activeMat.uniforms),
                            isCustom: true,
                            enableShadows: this.activeMat.enableShadows,
                            supportsScreenSpaceReflections: this.activeMat.supportsScreenSpaceReflections
                        });
                        this.$set(this.materials, m.id, m);
                        MaterialManager.register(m);
                        this.selectMaterial(m.id);
                        Blockbench.showToastNotification({ text: 'Material duplicated successfully', expire: 1500 });
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
                        if (this.newUniformType === 'color') def = { type: 'vec3', value: new THREE.Vector3(1, 1, 1), hexValue: "#ffffff", is_color: true };
                        else if (this.newUniformType === 'bool') def.value = false;
                        else if (this.newUniformType === 'float') def.value = 1.0;
                        else if (this.newUniformType === 'int') def.value = 1;
                        else if (this.newUniformType === 'vec2') def.value = new THREE.Vector2(0, 0);
                        else if (this.newUniformType === 'vec3') def.value = new THREE.Vector3(0, 0, 0);
                        else if (this.newUniformType === 'vec4') def.value = new THREE.Vector4(0, 0, 0, 1);

                        def.expose = this.newUniformExpose;
                        def.advanced = !!this.newUniformAdvanced;
                        if (this.newUniformType === 'float' || this.newUniformType === 'int') {
                            if (this.newUniformMin !== null && this.newUniformMin !== '') def.min = Number(this.newUniformMin);
                            if (this.newUniformMax !== null && this.newUniformMax !== '') def.max = Number(this.newUniformMax);
                            if (this.newUniformStep !== null && this.newUniformStep !== '') def.step = Number(this.newUniformStep);
                            def.allow_higher = this.newUniformAllowHigher;
                            def.allow_lower = this.newUniformAllowLower;
                        } else if (this.newUniformType === 'vec2' || this.newUniformType === 'vec3' || this.newUniformType === 'vec4') {
                            const axes = this.newUniformType === 'vec2' ? ['x', 'y'] : (this.newUniformType === 'vec3' ? ['x', 'y', 'z'] : ['x', 'y', 'z', 'w']);
                            const channels = {};
                            let hasAny = false;
                            axes.forEach(axis => {
                                const ch = this.newUniformChannels[axis];
                                if (ch.enabled) {
                                    hasAny = true;
                                    const c = {};
                                    if (ch.min !== null && ch.min !== '') c.min = Number(ch.min);
                                    if (ch.max !== null && ch.max !== '') c.max = Number(ch.max);
                                    if (ch.step !== null && ch.step !== '') c.step = Number(ch.step);
                                    c.allow_higher = ch.allow_higher;
                                    c.allow_lower = ch.allow_lower;
                                    channels[axis] = c;
                                }
                            });
                            if (hasAny) def.channels = channels;
                        }

                        this.$set(this.activeMat.uniforms, safeVar, def);
                    },
                    addNativeUniform() {
                        if (!this.activeMat || !this.activeMat.isCustom || !this.selectedNativeUniformName) return;
                        if (!this.activeMat.uniforms) this.$set(this.activeMat, 'uniforms', {});
                        if (this.activeMat.uniforms[this.selectedNativeUniformName]) return;

                        const defaults = MaterialManager.createNativeMaterialUniforms();
                        const def = defaults[this.selectedNativeUniformName];
                        if (!def) return;

                        this.$set(
                            this.activeMat.uniforms,
                            this.selectedNativeUniformName,
                            MaterialManager.cloneUniformDefinition(def)
                        );
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
                                    Blockbench.showQuickMessage(tl('shader_architect.message.import_failed'));
                                }
                            });
                        });
                    },
                    applyLive() {
                        // Persist Vue model to backend
                        for (let id in this.materials) {
                            if (this.materials[id].isCustom) MaterialManager.register(this.materials[id]);
                        }
                        ShaderEngine.updateAllCubes('material_studio_live_apply');
                        Blockbench.showToastNotification({ text: tl('shader_architect.toast.applied'), expire: 1500 });
                    },
                    preprocessShader(code, isVertex) {
                        if (typeof THREE === 'undefined') return { code, lineMap: (line => line) };

                        let prefix = `precision highp float; precision highp int; uniform mat4 modelMatrix; uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix; uniform mat4 viewMatrix; uniform mat3 normalMatrix; uniform vec3 cameraPosition; `;
                        if (isVertex) {
                            prefix += `attribute vec3 position; attribute vec3 normal; attribute vec2 uv; `;
                        }

                        let lines = code.split('\n');
                        let processedLines = [];
                        let lineMap = []; // lineMap[compiledLineIndex] = originalLineNum (1-based)

                        // First pass: extract any #version or #extension directives to prepend before the prefix
                        let headerLines = [];
                        let bodyLines = [];

                        lines.forEach((line, idx) => {
                            let trimmed = line.trim();
                            if (trimmed.startsWith('#version') || trimmed.startsWith('#extension')) {
                                headerLines.push({ line, originalLineNum: idx + 1 });
                            } else {
                                bodyLines.push({ line, originalLineNum: idx + 1 });
                            }
                        });

                        // 1. Add header lines (e.g. #version, #extension)
                        headerLines.forEach(item => {
                            processedLines.push(item.line);
                            lineMap[processedLines.length] = item.originalLineNum;
                        });

                        // 2. Add prefix line
                        processedLines.push(prefix);
                        lineMap[processedLines.length] = 1; // map prefix line to user line 1

                        // 3. Add body lines (and resolve #include)
                        bodyLines.forEach(item => {
                            let trimmed = item.line.trim();
                            let includeMatch = trimmed.match(/^#include\s+<([\w_]+)>/);
                            if (includeMatch) {
                                let chunkName = includeMatch[1];
                                let chunkContent = (THREE.ShaderChunk && THREE.ShaderChunk[chunkName]) || "";
                                let chunkLines = chunkContent.split('\n');
                                chunkLines.forEach(cl => {
                                    processedLines.push(cl);
                                    lineMap[processedLines.length] = item.originalLineNum;
                                });
                            } else {
                                processedLines.push(item.line);
                                lineMap[processedLines.length] = item.originalLineNum;
                            }
                        });

                        return {
                            code: processedLines.join('\n'),
                            lineMap: (lineNum) => {
                                return lineMap[lineNum] !== undefined ? lineMap[lineNum] : lineNum;
                            }
                        };
                    },
                    validateShader(showFeedback = true) {
                        if (!this.activeMat) return;
                        this.validating = true;

                        try {
                            const canvas = document.createElement('canvas');
                            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                            if (!gl) throw new Error("WebGL not supported for validation.");

                            let errors = [];

                            // Preprocess vertex shader
                            const prepVS = this.preprocessShader(this.activeMat.vertex, true);
                            let vs = gl.createShader(gl.VERTEX_SHADER);
                            gl.shaderSource(vs, prepVS.code);
                            gl.compileShader(vs);
                            let vsSuccess = gl.getShaderParameter(vs, gl.COMPILE_STATUS);
                            if (!vsSuccess) {
                                let log = gl.getShaderInfoLog(vs);
                                let lines = log.split('\n').filter(l => l.trim());
                                lines.forEach(line => {
                                    let match = line.match(/ERROR:\s*\d+:(\d+):\s*(.*)/);
                                    let errLine = match ? parseInt(match[1]) : null;
                                    let mappedLine = errLine ? prepVS.lineMap(errLine) : null;
                                    errors.push({
                                        type: 'vertex',
                                        line: mappedLine,
                                        message: match ? match[2] : line,
                                        severity: 'error'
                                    });
                                });
                            }

                            // Preprocess fragment shader
                            const prepFS = this.preprocessShader(this.activeMat.fragment, false);
                            let fs = gl.createShader(gl.FRAGMENT_SHADER);
                            gl.shaderSource(fs, prepFS.code);
                            gl.compileShader(fs);
                            let fsSuccess = gl.getShaderParameter(fs, gl.COMPILE_STATUS);
                            if (!fsSuccess) {
                                let log = gl.getShaderInfoLog(fs);
                                let lines = log.split('\n').filter(l => l.trim());
                                lines.forEach(line => {
                                    let match = line.match(/ERROR:\s*\d+:(\d+):\s*(.*)/);
                                    let errLine = match ? parseInt(match[1]) : null;
                                    let mappedLine = errLine ? prepFS.lineMap(errLine) : null;
                                    errors.push({
                                        type: 'fragment',
                                        line: mappedLine,
                                        message: match ? match[2] : line,
                                        severity: 'error'
                                    });
                                });
                            }

                            // Link shaders
                            if (vsSuccess && fsSuccess) {
                                let program = gl.createProgram();
                                gl.attachShader(program, vs);
                                gl.attachShader(program, fs);
                                gl.linkProgram(program);
                                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                                    let log = gl.getProgramInfoLog(program);
                                    errors.push({
                                        type: 'linker',
                                        line: null,
                                        message: log || "Failed to link shaders.",
                                        severity: 'error'
                                    });
                                }
                                program = null; // Clean ref
                            }

                            this.validationErrors = errors;

                            if (errors.length === 0 && showFeedback) {
                                Blockbench.showToastNotification({ text: 'GLSL program compiles and links successfully!', expire: 2000 });
                            }

                            gl.deleteShader(vs);
                            gl.deleteShader(fs);
                        } catch (e) {
                            this.validationErrors = [{ type: 'system', line: null, message: e.message, severity: 'error' }];
                        } finally {
                            this.validating = false;
                        }
                    },
                    validateShaderBackground() {
                        this.validateShader(false);
                    },
                    debounceValidate() {
                        if (this.validationTimeout) clearTimeout(this.validationTimeout);
                        this.validationTimeout = setTimeout(() => {
                            this.validateShaderBackground();
                        }, 800);
                    },
                    expandUniform(key) {
                        this.$set(this.expandedUniforms, key, !this.expandedUniforms[key]);
                        if (this.expandedUniforms[key]) {
                            this.$set(this.newTransLang, key, '');
                            this.$set(this.newTransVal, key, '');
                            if (this.activeMat && this.activeMat.uniforms[key]) {
                                const uni = this.activeMat.uniforms[key];
                                if (!uni.translations) {
                                    this.$set(uni, 'translations', {});
                                }
                            }
                        }
                    },
                    addCustomTranslation(uni, key) {
                        const lang = (this.newTransLang[key] || '').trim().toLowerCase();
                        const val = (this.newTransVal[key] || '').trim();
                        if (!lang || !val) return;
                        if (!uni.translations) {
                            this.$set(uni, 'translations', {});
                        }
                        this.$set(uni.translations, lang, val);
                        this.$set(this.newTransLang, key, '');
                        this.$set(this.newTransVal, key, '');
                        this.$forceUpdate();
                    },
                    getUniformLabel(uni, key) {
                        const currentLang = (typeof Language !== 'undefined' && Language.code) ? Language.code : 'en';
                        if (uni && uni.translations && uni.translations[currentLang]) {
                            return uni.translations[currentLang];
                        }
                        const tlKey = 'shader_architect.uniform.' + key;
                        const globalTl = tl(tlKey);
                        if (globalTl !== tlKey) {
                            return globalTl;
                        }
                        if (uni && uni.translations && uni.translations['en']) {
                            return uni.translations['en'];
                        }
                        return '';
                    },

                    // Editor keys and autocomplete
                    setupEditorEvents() {
                        setTimeout(() => {
                            if (!this.$el) return;

                            const editorElement = this.getEditorInputElement();
                            if (!editorElement || editorElement.dataset.saInitialized) return;
                            editorElement.dataset.saInitialized = 'true';

                            editorElement.addEventListener('keydown', this.handleEditorKeyDown, true);
                            editorElement.addEventListener('input', this.handleEditorInput);
                            editorElement.addEventListener('click', this.closeAutocomplete);
                            editorElement.addEventListener('blur', () => {
                                setTimeout(() => {
                                    this.closeAutocomplete();
                                }, 200);
                            });

                            const wrapper = this.$el.querySelector('.prism-editor-wrapper');
                            if (wrapper && !wrapper.dataset.saAutocompleteScrollInitialized) {
                                wrapper.dataset.saAutocompleteScrollInitialized = 'true';
                                wrapper.addEventListener('scroll', () => {
                                    this.closeAutocomplete();
                                }, { passive: true });
                            }
                        }, 150);
                    },
                    getEditorInputElement() {
                        if (!this.$el) return null;
                        return this.$el.querySelector('.prism-editor__textarea')
                            || this.$el.querySelector('.glsl-editor-instance textarea')
                            || this.$el.querySelector('[contenteditable="true"]')
                            || this.$el.querySelector('.prism-editor__code');
                    },
                    isTextInputElement(element) {
                        return !!element && typeof element.value === 'string' && typeof element.selectionStart === 'number';
                    },
                    getEditorText(element) {
                        if (!element) return this.currentShaderCode || '';
                        if (typeof element.value === 'string') return element.value;
                        return element.textContent || '';
                    },
                    handleEditorKeyDown(e) {
                        const editorElement = e.target;

                        if (e.key === 'Tab') {
                            if (this.autocomplete.show && this.autocomplete.list.length > 0) {
                                e.preventDefault();
                                e.stopPropagation();
                                this.acceptAutocomplete(editorElement);
                                return;
                            }

                            e.preventDefault();
                            e.stopPropagation();

                            const { start, end } = this.getSelectionRange(editorElement);
                            const text = this.getEditorText(editorElement);
                            const spaces = "    ";

                            let newStart = start;
                            let newEnd = end;
                            let newText = '';

                            if (start !== end) {
                                const lineStart = text.lastIndexOf('\n', start) + 1;
                                let lineEnd = text.indexOf('\n', end);
                                if (lineEnd === -1) lineEnd = text.length;

                                const selectedText = text.substring(lineStart, lineEnd);
                                const lines = selectedText.split('\n');

                                if (e.shiftKey) {
                                    let removedChars = 0;
                                    const modifiedLines = lines.map(line => {
                                        if (line.startsWith(spaces)) { removedChars += 4; return line.substring(4); }
                                        if (line.startsWith('\t')) { removedChars += 1; return line.substring(1); }
                                        let leading = line.match(/^ +/);
                                        if (leading) {
                                            let rem = Math.min(leading[0].length, 4);
                                            removedChars += rem;
                                            return line.substring(rem);
                                        }
                                        return line;
                                    });
                                    newText = text.substring(0, lineStart) + modifiedLines.join('\n') + text.substring(lineEnd);
                                    newStart = start + (e.shiftKey ? -4 : 4);
                                    newEnd = start + modifiedLines.join('\n').length - (selectedText.length - (end - start));
                                } else {
                                    const modifiedLines = lines.map(line => spaces + line).join('\n');
                                    newText = text.substring(0, lineStart) + modifiedLines + text.substring(lineEnd);
                                    newStart = start + 4;
                                    newEnd = start + modifiedLines.length - (selectedText.length - (end - start));
                                }
                            } else {
                                if (e.shiftKey) {
                                    const lineStart = text.lastIndexOf('\n', start) + 1;
                                    const lineText = text.substring(lineStart, start);
                                    let removeCount = 0;
                                    if (lineText.startsWith(spaces)) removeCount = 4;
                                    else if (lineText.startsWith('\t')) removeCount = 1;
                                    else {
                                        let leading = lineText.match(/^ +/);
                                        if (leading) removeCount = Math.min(leading[0].length, 4);
                                    }
                                    if (removeCount > 0) {
                                        newText = text.substring(0, lineStart) + text.substring(lineStart + removeCount);
                                        newStart = newEnd = start - removeCount;
                                    } else {
                                        newText = text;
                                    }
                                } else {
                                    newText = text.substring(0, start) + spaces + text.substring(end);
                                    newStart = newEnd = start + 4;
                                }
                            }

                            this.syncEditorText(editorElement, newText, newStart, newEnd);

                            return;
                        }

                        if (this.autocomplete.show) {
                            if (e.key === 'ArrowDown') {
                                e.preventDefault(); e.stopPropagation();
                                this.autocomplete.index = (this.autocomplete.index + 1) % this.autocomplete.list.length;
                                return;
                            }
                            if (e.key === 'ArrowUp') {
                                e.preventDefault(); e.stopPropagation();
                                this.autocomplete.index = (this.autocomplete.index - 1 + this.autocomplete.list.length) % this.autocomplete.list.length;
                                return;
                            }
                            if (e.key === 'Enter') {
                                e.preventDefault(); e.stopPropagation();
                                this.acceptAutocomplete(editorElement);
                                return;
                            }
                            if (e.key === 'Escape') {
                                e.preventDefault(); e.stopPropagation();
                                this.closeAutocomplete();
                                return;
                            }
                        }

                        if (e.key === 'Enter' && !this.autocomplete.show) {
                            e.preventDefault();
                            e.stopPropagation();

                            const { start, end } = this.getSelectionRange(editorElement);
                            const text = this.getEditorText(editorElement);

                            const textBefore = text.substring(0, start);
                            const lineStart = textBefore.lastIndexOf('\n') + 1;
                            const currentLine = textBefore.substring(lineStart);
                            const indentMatch = currentLine.match(/^[ \t]+/);
                            const indent = indentMatch ? indentMatch[0] : "";

                            const newText = text.substring(0, start) + '\n' + indent + text.substring(end);

                            const newPos = start + 1 + indent.length;
                            this.syncEditorText(editorElement, newText, newPos, newPos);
                            return;
                        }
                    },

                    // Read selection from the real input when available; keep a DOM fallback for older editor builds.
                    getSelectionRange(element) {
                        if (this.isTextInputElement(element)) {
                            return {
                                start: element.selectionStart || 0,
                                end: element.selectionEnd || element.selectionStart || 0
                            };
                        }

                        let start = 0, end = 0;
                        const sel = window.getSelection();
                        if (!sel || sel.rangeCount === 0) return { start, end };

                        const range = sel.getRangeAt(0);
                        if (!element || !element.contains(range.startContainer) || !element.contains(range.endContainer)) {
                            return { start, end };
                        }

                        let charIndex = 0;
                        let foundStart = false;
                        let foundEnd = false;

                        function traverse(node) {
                            if (foundStart && foundEnd) return;

                            if (node === range.startContainer) {
                                start = charIndex + (node.nodeType === 3 ? range.startOffset : 0);
                                foundStart = true;
                            }
                            if (node === range.endContainer) {
                                end = charIndex + (node.nodeType === 3 ? range.endOffset : 0);
                                foundEnd = true;
                            }

                            if (node.nodeType === 3) {
                                charIndex += node.length;
                            } else if (node.nodeName === 'BR') {
                                charIndex += 1;
                            } else {
                                for (let i = 0; i < node.childNodes.length; i++) {
                                    if (!foundStart && node === range.startContainer && i === range.startOffset) {
                                        start = charIndex; foundStart = true;
                                    }
                                    if (!foundEnd && node === range.endContainer && i === range.endOffset) {
                                        end = charIndex; foundEnd = true;
                                    }
                                    traverse(node.childNodes[i]);
                                }
                                if (!foundStart && node === range.startContainer && range.startOffset === node.childNodes.length) {
                                    start = charIndex; foundStart = true;
                                }
                                if (!foundEnd && node === range.endContainer && range.endOffset === node.childNodes.length) {
                                    end = charIndex; foundEnd = true;
                                }
                            }
                        }

                        traverse(element);
                        return { start, end };
                    },

                    // Restore the caret without touching unrelated selection state.
                    setSelectionRange(element, start, end) {
                        if (!element) return;

                        const textLength = this.getEditorText(element).length;
                        start = Math.max(0, Math.min(start, textLength));
                        end = Math.max(0, Math.min(end, textLength));

                        if (this.isTextInputElement(element)) {
                            element.focus();
                            element.setSelectionRange(start, end);
                            return;
                        }

                        const sel = window.getSelection();
                        if (!sel) return;

                        const range = document.createRange();
                        let charIndex = 0;
                        let startNode = null, startOffset = 0;
                        let endNode = null, endOffset = 0;

                        function traverse(node) {
                            if (startNode && endNode) return;

                            if (node.nodeType === 3) {
                                const nextCharIndex = charIndex + node.length;
                                if (!startNode && start >= charIndex && start <= nextCharIndex) {
                                    startNode = node; startOffset = start - charIndex;
                                }
                                if (!endNode && end >= charIndex && end <= nextCharIndex) {
                                    endNode = node; endOffset = end - charIndex;
                                }
                                charIndex = nextCharIndex;
                            } else if (node.nodeName === 'BR') {
                                if (!startNode && start === charIndex) {
                                    startNode = node.parentNode; startOffset = Array.prototype.indexOf.call(node.parentNode.childNodes, node);
                                }
                                if (!endNode && end === charIndex) {
                                    endNode = node.parentNode; endOffset = Array.prototype.indexOf.call(node.parentNode.childNodes, node);
                                }
                                charIndex += 1;
                            } else {
                                for (let i = 0; i < node.childNodes.length; i++) {
                                    traverse(node.childNodes[i]);
                                }
                                if (!startNode && start === charIndex) {
                                    startNode = node; startOffset = node.childNodes.length;
                                }
                                if (!endNode && end === charIndex) {
                                    endNode = node; endOffset = node.childNodes.length;
                                }
                            }
                        }

                        traverse(element);

                        if (!startNode) { startNode = element; startOffset = element.childNodes.length; }
                        if (!endNode) { endNode = startNode; endOffset = startOffset; }

                        try {
                            range.setStart(startNode, startOffset);
                            range.setEnd(endNode, endOffset);
                            sel.removeAllRanges();
                            sel.addRange(range);
                        } catch (e) { }
                    },
                    syncEditorText(editorElement, value, selectionStart, selectionEnd) {
                        this.currentShaderCode = value;

                        if (this.isTextInputElement(editorElement)) {
                            editorElement.value = value;
                        }

                        this._lastKnownCursor = { start: selectionStart, end: selectionEnd };
                        this.$nextTick(() => {
                            const liveEditor = this.getEditorInputElement() || editorElement;
                            this.setSelectionRange(liveEditor, selectionStart, selectionEnd);
                            if (liveEditor) liveEditor.focus();
                        });
                    },
                    restoreEditorCaretAfterRender(editorElement, expectedText, expectedSelection, revision) {
                        this.$nextTick(() => {
                            requestAnimationFrame(() => {
                                if (revision !== this._editorInputRevision) return;

                                const liveEditor = this.getEditorInputElement() || editorElement;
                                if (!liveEditor || document.activeElement !== liveEditor) return;
                                if (this.getEditorText(liveEditor) !== expectedText) return;

                                const actualSelection = this.getSelectionRange(liveEditor);
                                if (actualSelection.start !== expectedSelection.start || actualSelection.end !== expectedSelection.end) {
                                    this.setSelectionRange(liveEditor, expectedSelection.start, expectedSelection.end);
                                }
                            });
                        });
                    },

                    handleEditorInput(e) {
                        const editorElement = e.target;
                        const currentSelection = this.getSelectionRange(editorElement);
                        const text = this.getEditorText(editorElement);

                        this._editorInputRevision = (this._editorInputRevision || 0) + 1;
                        const revision = this._editorInputRevision;

                        this.currentShaderCode = text;
                        this._lastKnownCursor = currentSelection;

                        if (currentSelection.start !== currentSelection.end) {
                            this.closeAutocomplete();
                            this.restoreEditorCaretAfterRender(editorElement, text, currentSelection, revision);
                            return;
                        }

                        const currentWord = this.getCurrentEditorWord(text, currentSelection.start);

                        let matches = [];
                        let word = currentWord ? currentWord.word : '';

                        if (currentWord && word.length >= 1) {
                            const suggestions = this.getAutocompleteSuggestions(text);
                            const search = word.toLowerCase();
                            matches = suggestions.filter(item => {
                                const label = this.getAutocompleteLabel(item);
                                const isExactMatch = label.toLowerCase() === search;
                                return label.toLowerCase().startsWith(search) && (!isExactMatch || this.isAutocompleteFunction(item));
                            });
                        }

                        if (matches.length === 0) {
                            this.closeAutocomplete();
                        } else {
                            const position = this.getAutocompletePosition(editorElement, currentSelection.start, matches.length);

                            this.autocomplete = {
                                show: true,
                                list: matches.slice(0, 10),
                                index: 0,
                                x: position.x,
                                y: position.y,
                                textBefore: text.slice(0, currentWord.start),
                                word: word,
                                replaceStart: currentWord.start,
                                replaceEnd: currentWord.end
                            };
                        }

                        this.restoreEditorCaretAfterRender(editorElement, text, currentSelection, revision);
                    },
                    getCurrentEditorWord(text, cursorPosition) {
                        const beforeCursor = text.slice(0, cursorPosition);
                        const prefixMatch = beforeCursor.match(/[a-zA-Z_][a-zA-Z0-9_]*$/);
                        if (!prefixMatch) return null;

                        const suffixMatch = text.slice(cursorPosition).match(/^[a-zA-Z0-9_]*/);
                        const word = prefixMatch[0];
                        const start = cursorPosition - word.length;
                        const end = cursorPosition + (suffixMatch ? suffixMatch[0].length : 0);

                        return { word, start, end };
                    },
                    getAutocompletePosition(editorElement, cursorPosition, itemCount) {
                        const editorContainer = this.$el ? this.$el.querySelector('.sa-editor-container') : null;
                        if (!editorElement || !editorContainer) return { x: 0, y: 0 };

                        const editorRect = editorContainer.getBoundingClientRect();
                        const style = window.getComputedStyle(editorElement);
                        const lineHeight = parseFloat(style.lineHeight) || 20;
                        let caret = null;

                        if (this.isTextInputElement(editorElement)) {
                            caret = this.getTextareaCaretCoordinates(editorElement, cursorPosition);
                        }

                        if (!caret) {
                            const textBefore = this.getEditorText(editorElement).slice(0, cursorPosition);
                            const lines = textBefore.split('\n');
                            const row = lines.length - 1;
                            const col = lines[row].length;
                            const charWidth = 7.7;
                            const wrapper = this.$el.querySelector('.prism-editor-wrapper');
                            caret = {
                                left: editorRect.left + 42 + (col * charWidth) - (wrapper ? wrapper.scrollLeft : 0),
                                top: editorRect.top + (row * lineHeight) - (wrapper ? wrapper.scrollTop : 0),
                                height: lineHeight
                            };
                        }

                        const dropdownWidth = 380;
                        const dropdownHeight = Math.min(220, Math.max(1, Math.min(itemCount, 10)) * 29 + 2);
                        let x = caret.left - editorRect.left;
                        let y = caret.top - editorRect.top + caret.height + 8;

                        if (y + dropdownHeight > editorRect.height - 4) {
                            y = caret.top - editorRect.top - dropdownHeight - 8;
                        }

                        x = Math.max(4, Math.min(x, Math.max(4, editorRect.width - dropdownWidth - 4)));
                        y = Math.max(4, Math.min(y, Math.max(4, editorRect.height - dropdownHeight - 4)));

                        return { x: Math.round(x), y: Math.round(y) };
                    },
                    getTextareaCaretCoordinates(textarea, cursorPosition) {
                        const rect = textarea.getBoundingClientRect();
                        const style = window.getComputedStyle(textarea);
                        const beforeCursor = textarea.value.slice(0, cursorPosition);
                        const lines = beforeCursor.split('\n');
                        const row = lines.length - 1;
                        const col = lines[row].length;
                        const lineHeight = parseFloat(style.lineHeight) || 20;
                        const paddingLeft = parseFloat(style.paddingLeft) || 0;
                        const paddingTop = parseFloat(style.paddingTop) || 0;
                        const wrapper = this.$el ? this.$el.querySelector('.prism-editor-wrapper') : null;
                        const scrollLeft = textarea.scrollLeft || (wrapper ? wrapper.scrollLeft : 0);
                        const scrollTop = textarea.scrollTop || (wrapper ? wrapper.scrollTop : 0);
                        const charWidth = this.getEditorCharacterWidth(textarea, style);

                        return {
                            left: rect.left + paddingLeft + (col * charWidth) - scrollLeft,
                            top: rect.top + paddingTop + (row * lineHeight) - scrollTop,
                            height: lineHeight
                        };
                    },
                    getEditorCharacterWidth(textarea, style) {
                        const probe = document.createElement('span');
                        probe.textContent = 'mmmmmmmmmm';
                        probe.style.position = 'absolute';
                        probe.style.visibility = 'hidden';
                        probe.style.whiteSpace = 'pre';
                        probe.style.fontFamily = style.fontFamily;
                        probe.style.fontSize = style.fontSize;
                        probe.style.fontWeight = style.fontWeight;
                        probe.style.fontStyle = style.fontStyle;
                        probe.style.letterSpacing = style.letterSpacing;
                        probe.style.left = '-9999px';
                        probe.style.top = '0';

                        document.body.appendChild(probe);
                        const width = probe.getBoundingClientRect().width / 10;
                        document.body.removeChild(probe);

                        return width || 7.7;
                    },
                    normalizeAutocompleteItem(item) {
                        if (typeof item === 'string') {
                            return { label: item, kind: this.getAutocompleteType(item) };
                        }
                        return Object.assign({
                            label: '',
                            kind: 'uniform',
                            signature: '',
                            returnType: '',
                            dataType: '',
                            argCount: null,
                            params: [],
                            insertKind: null
                        }, item || {});
                    },
                    getBuiltinFunctionCompletions() {
                        const defs = [
                            ['radians', 'genType', 'genType degrees'], ['degrees', 'genType', 'genType radians'],
                            ['sin', 'genType', 'genType angle'], ['cos', 'genType', 'genType angle'], ['tan', 'genType', 'genType angle'],
                            ['asin', 'genType', 'genType x'], ['acos', 'genType', 'genType x'], ['atan', 'genType', 'genType y, genType x', '1-2'],
                            ['pow', 'genType', 'genType x, genType y'], ['exp', 'genType', 'genType x'], ['log', 'genType', 'genType x'],
                            ['exp2', 'genType', 'genType x'], ['log2', 'genType', 'genType x'], ['sqrt', 'genType', 'genType x'], ['inversesqrt', 'genType', 'genType x'],
                            ['abs', 'genType', 'genType x'], ['sign', 'genType', 'genType x'], ['floor', 'genType', 'genType x'], ['ceil', 'genType', 'genType x'],
                            ['fract', 'genType', 'genType x'], ['mod', 'genType', 'genType x, genType y'], ['min', 'genType', 'genType x, genType y'],
                            ['max', 'genType', 'genType x, genType y'], ['clamp', 'genType', 'genType x, genType minVal, genType maxVal'],
                            ['mix', 'genType', 'genType x, genType y, genType a'], ['step', 'genType', 'genType edge, genType x'],
                            ['smoothstep', 'genType', 'genType edge0, genType edge1, genType x'], ['modf', 'genType', 'genType x, out genType i'],
                            ['trunc', 'genType', 'genType x'], ['round', 'genType', 'genType x'], ['roundEven', 'genType', 'genType x'],
                            ['length', 'float', 'genType x'], ['distance', 'float', 'genType p0, genType p1'], ['dot', 'float', 'genType x, genType y'],
                            ['cross', 'vec3', 'vec3 x, vec3 y'], ['normalize', 'genType', 'genType x'], ['faceforward', 'genType', 'genType N, genType I, genType Nref'],
                            ['reflect', 'genType', 'genType I, genType N'], ['refract', 'genType', 'genType I, genType N, float eta'],
                            ['matrixCompMult', 'mat', 'mat x, mat y'], ['outerProduct', 'mat', 'vec c, vec r'], ['transpose', 'mat', 'mat m'],
                            ['determinant', 'float', 'mat m'], ['inverse', 'mat', 'mat m'],
                            ['lessThan', 'bvec', 'vec x, vec y'], ['lessThanEqual', 'bvec', 'vec x, vec y'], ['greaterThan', 'bvec', 'vec x, vec y'],
                            ['greaterThanEqual', 'bvec', 'vec x, vec y'], ['equal', 'bvec', 'vec x, vec y'], ['notEqual', 'bvec', 'vec x, vec y'],
                            ['any', 'bool', 'bvec x'], ['all', 'bool', 'bvec x'], ['not', 'bvec', 'bvec x'],
                            ['texture2D', 'vec4', 'sampler2D sampler, vec2 coord, float bias', '2-3'],
                            ['textureCube', 'vec4', 'samplerCube sampler, vec3 coord, float bias', '2-3'],
                            ['texture', 'vec4', 'sampler sampler, vec coord, float bias', '2-3'],
                            ['textureProj', 'vec4', 'sampler sampler, vec coord, float bias', '2-3'],
                            ['textureLod', 'vec4', 'sampler sampler, vec coord, float lod'],
                            ['textureProjLod', 'vec4', 'sampler sampler, vec coord, float lod'],
                            ['textureGrad', 'vec4', 'sampler sampler, vec coord, vec dPdx, vec dPdy'],
                            ['textureProjGrad', 'vec4', 'sampler sampler, vec coord, vec dPdx, vec dPdy']
                        ];

                        const functions = {};
                        defs.forEach(def => {
                            const params = this.parseFunctionParameters(def[2]);
                            functions[def[0]] = {
                                label: def[0],
                                kind: 'builtin',
                                insertKind: 'function',
                                returnType: def[1],
                                params,
                                argCount: def[3] || params.length,
                                signature: `${def[1]} ${def[0]}(${def[2]})`,
                                source: 'global'
                            };
                        });
                        return functions;
                    },
                    getBuiltinVariableCompletions() {
                        const defs = {
                            gl_Position: 'vec4', gl_PointSize: 'float', gl_FragColor: 'vec4', gl_FragCoord: 'vec4',
                            gl_FrontFacing: 'bool', gl_PointCoord: 'vec2', gl_VertexID: 'int', gl_InstanceID: 'int',
                            gl_FragData: 'vec4[]', gl_FragDepth: 'float',
                            modelMatrix: 'mat4', modelViewMatrix: 'mat4', projectionMatrix: 'mat4', viewMatrix: 'mat4',
                            normalMatrix: 'mat3', cameraPosition: 'vec3', position: 'vec3', normal: 'vec3', uv: 'vec2',
                            normalizedFaceUv: 'vec2', faceSize: 'vec2', globalFaceSize: 'vec2', uvSize: 'vec2',
                            uTime: 'float', uAmbient: 'float', uAmbientColor: 'vec3', uLightColor: 'vec3',
                            uWorldNormalMatrix: 'mat3', max_light_number: 'int', map: 'sampler2D',
                            lightside: 'float', shade: 'float', emissive: 'vec3'
                        };

                        const variables = {};
                        Object.keys(defs).forEach(label => {
                            variables[label] = {
                                label,
                                kind: 'variable',
                                dataType: defs[label],
                                signature: `${defs[label]} ${label}`,
                                source: 'global'
                            };
                        });
                        return variables;
                    },
                    parseFunctionParameters(paramSource) {
                        const source = (paramSource || '').trim();
                        if (!source || source === 'void') return [];

                        return source.split(',').map(rawParam => {
                            const display = rawParam.trim().replace(/\s+/g, ' ');
                            const tokens = display.split(/\s+/).filter(Boolean);
                            const filtered = tokens.filter(token => !['const', 'in', 'out', 'inout'].includes(token));
                            const name = filtered.length > 1 ? filtered[filtered.length - 1].replace(/\[[^\]]*\]$/, '') : '';
                            const type = filtered.length > 1 ? filtered.slice(0, -1).join(' ') : filtered[0] || display;
                            return { display, type, name };
                        });
                    },
                    getUserVariableTypeMap(cleanCode) {
                        const declarations = new Map();
                        const glslTypes = [
                            'bool', 'int', 'uint', 'float', 'vec2', 'vec3', 'vec4', 'bvec2', 'bvec3', 'bvec4',
                            'ivec2', 'ivec3', 'ivec4', 'uvec2', 'uvec3', 'uvec4', 'mat2', 'mat3', 'mat4',
                            'sampler2D', 'samplerCube', 'sampler3D'
                        ];
                        const declarationRegex = new RegExp(`\\b(?:const\\s+)?(${glslTypes.join('|')})\\s+([^;]+);`, 'g');
                        let match;

                        while ((match = declarationRegex.exec(cleanCode)) !== null) {
                            const dataType = match[1];
                            match[2].split(',').forEach(part => {
                                const nameMatch = part.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
                                if (nameMatch) declarations.set(nameMatch[1], dataType);
                            });
                        }

                        return declarations;
                    },
                    getAutocompleteSuggestions(codeOverride) {
                        const list = [];
                        const seen = new Set();
                        const addSuggestion = (item) => {
                            const entry = this.normalizeAutocompleteItem(item);
                            if (!entry.label || seen.has(entry.label)) return;
                            seen.add(entry.label);
                            list.push(entry);
                        };

                        const types = [
                            'void', 'bool', 'int', 'uint', 'float', 'vec2', 'vec3', 'vec4', 'bvec2', 'bvec3', 'bvec4', 'ivec2', 'ivec3', 'ivec4', 'uvec2', 'uvec3', 'uvec4',
                            'mat2', 'mat3', 'mat4', 'mat2x2', 'mat2x3', 'mat2x4', 'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
                            'sampler2D', 'samplerCube', 'sampler3D', 'sampler2DShadow', 'samplerCubeShadow', 'sampler2DArray', 'sampler2DArrayShadow'
                        ];
                        const keywords = [
                            'uniform', 'attribute', 'varying', 'const', 'precision', 'highp', 'mediump', 'lowp', 'in', 'out', 'inout', 'struct',
                            'break', 'continue', 'discard', 'do', 'else', 'for', 'if', 'return', 'while', 'switch', 'case', 'default', 'layout', 'flat', 'smooth'
                        ];

                        types.forEach(label => addSuggestion({ label, kind: 'type', dataType: 'GLSL type' }));
                        keywords.forEach(label => addSuggestion({ label, kind: 'keyword' }));

                        const builtinFunctions = this.getBuiltinFunctionCompletions();
                        Object.keys(builtinFunctions).forEach(label => addSuggestion(builtinFunctions[label]));

                        const builtinVariables = this.getBuiltinVariableCompletions();
                        Object.keys(builtinVariables).forEach(label => addSuggestion(builtinVariables[label]));

                        if (this.activeMat && this.activeMat.uniforms) {
                            Object.keys(this.activeMat.uniforms).forEach(key => {
                                const uniform = this.activeMat.uniforms[key] || {};
                                addSuggestion({
                                    label: key,
                                    kind: 'uniform',
                                    dataType: uniform.type || 'uniform',
                                    signature: `${uniform.type || 'uniform'} ${key}`
                                });
                            });
                        }

                        const code = typeof codeOverride === 'string' ? codeOverride : (this.currentShaderCode || '');
                        const cleanCode = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
                        const excludeKeywords = new Set([
                            ...types, ...keywords,
                            'if', 'for', 'while', 'switch', 'else', 'return', 'discard', 'do', 'true', 'false'
                        ]);

                        const userFunctions = new Map();
                        const functionRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(?:\{|;)/g;
                        let match;
                        while ((match = functionRegex.exec(cleanCode)) !== null) {
                            const returnType = match[1];
                            const funcName = match[2];
                            if (excludeKeywords.has(funcName)) continue;

                            const params = this.parseFunctionParameters(match[3]);
                            const signature = `${returnType} ${funcName}(${params.map(param => param.display).join(', ')})`;
                            const entry = {
                                label: funcName,
                                kind: 'function',
                                insertKind: 'function',
                                returnType,
                                params,
                                argCount: params.length,
                                signature,
                                source: 'local'
                            };
                            userFunctions.set(funcName, entry);
                            addSuggestion(entry);
                        }

                        const userVariableTypes = this.getUserVariableTypeMap(cleanCode);
                        userVariableTypes.forEach((dataType, label) => {
                            if (!excludeKeywords.has(label) && !userFunctions.has(label)) {
                                addSuggestion({
                                    label,
                                    kind: 'variable',
                                    dataType,
                                    signature: `${dataType} ${label}`,
                                    source: 'local'
                                });
                            }
                        });

                        const words = cleanCode.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
                        const userVariables = new Set();
                        const standardNames = new Set([...seen, ...types, ...keywords, ...userFunctions.keys()]);
                        words.forEach(word => {
                            if (!standardNames.has(word) && !excludeKeywords.has(word) && !/^\d+$/.test(word)) {
                                userVariables.add(word);
                                addSuggestion({ label: word, kind: 'variable', source: 'local' });
                            }
                        });

                        this.userFunctions = new Set(userFunctions.keys());
                        this.userVariables = userVariables;

                        return list;
                    },
                    getAutocompleteType(name) {
                        if (name && typeof name === 'object') {
                            return name.kind || 'uniform';
                        }

                        const types = [
                            'void', 'bool', 'int', 'uint', 'float', 'vec2', 'vec3', 'vec4', 'bvec2', 'bvec3', 'bvec4', 'ivec2', 'ivec3', 'ivec4', 'uvec2', 'uvec3', 'uvec4',
                            'mat2', 'mat3', 'mat4', 'mat2x2', 'mat2x3', 'mat2x4', 'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
                            'sampler2D', 'samplerCube', 'sampler3D', 'sampler2DShadow', 'samplerCubeShadow', 'sampler2DArray', 'sampler2DArrayShadow'
                        ];
                        const keywords = [
                            'uniform', 'attribute', 'varying', 'const', 'precision', 'highp', 'mediump', 'lowp', 'in', 'out', 'inout', 'struct',
                            'break', 'continue', 'discard', 'do', 'else', 'for', 'if', 'return', 'while', 'switch', 'case', 'default', 'layout', 'flat', 'smooth'
                        ];
                        const builtins = [
                            'radians', 'degrees', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt',
                            'abs', 'sign', 'floor', 'ceil', 'fract', 'mod', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep', 'modf', 'trunc', 'round', 'roundEven',
                            'length', 'distance', 'dot', 'cross', 'normalize', 'faceforward', 'reflect', 'refract', 'matrixCompMult', 'outerProduct', 'transpose', 'determinant', 'inverse',
                            'lessThan', 'lessThanEqual', 'greaterThan', 'greaterThanEqual', 'equal', 'notEqual', 'any', 'all', 'not',
                            'texture2D', 'textureCube', 'texture', 'textureProj', 'textureLod', 'textureProjLod', 'textureGrad', 'textureProjGrad'
                        ];
                        const vars = [
                            'gl_Position', 'gl_PointSize', 'gl_FragColor', 'gl_FragCoord', 'gl_FrontFacing', 'gl_PointCoord', 'gl_VertexID', 'gl_InstanceID', 'gl_FragData', 'gl_FragDepth',
                            'modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix', 'cameraPosition', 'position', 'normal', 'uv',
                            'normalizedFaceUv', 'faceSize', 'globalFaceSize', 'uvSize'
                        ];

                        if (types.includes(name)) return 'type';
                        if (keywords.includes(name)) return 'keyword';
                        if (builtins.includes(name)) return 'builtin';
                        if (vars.includes(name)) return 'variable';

                        if (this.userFunctions && this.userFunctions.has(name)) return 'function';
                        if (this.userVariables && this.userVariables.has(name)) return 'variable';

                        return 'uniform';
                    },
                    getAutocompleteLabel(item) {
                        return typeof item === 'string' ? item : (item && item.label) || '';
                    },
                    getAutocompleteKey(item) {
                        if (typeof item === 'string') return item;
                        return `${item.kind || 'item'}:${item.label || ''}:${item.signature || ''}`;
                    },
                    getAutocompleteSignature(item) {
                        if (!item || typeof item === 'string') return '';
                        return item.signature || '';
                    },
                    getAutocompleteReturnInfo(item) {
                        if (!item || typeof item === 'string') return '';

                        if (this.isAutocompleteFunction(item)) {
                            const args = item.argCount === 1 ? '1 arg' : `${item.argCount} args`;
                            return `${item.returnType || 'void'} - ${args}`;
                        }

                        return item.dataType || '';
                    },
                    isAutocompleteFunction(item) {
                        if (!item || typeof item === 'string') return false;
                        return item.insertKind === 'function' || item.kind === 'function' || item.kind === 'builtin';
                    },
                    acceptAutocomplete(editorElement) {
                        if (!this.autocomplete.show || this.autocomplete.list.length === 0 || !editorElement) return;

                        const selected = this.autocomplete.list[this.autocomplete.index];
                        const selectedLabel = this.getAutocompleteLabel(selected);
                        const text = this.getEditorText(editorElement);
                        const { start } = this.getSelectionRange(editorElement);
                        const liveWord = this.getCurrentEditorWord(text, start);
                        const replaceStart = liveWord ? liveWord.start : this.autocomplete.replaceStart;
                        const replaceEnd = liveWord ? liveWord.end : this.autocomplete.replaceEnd;

                        let insertText = selectedLabel;
                        let nextPos = replaceStart + selectedLabel.length;
                        const suffix = text.slice(replaceEnd);

                        if (this.isAutocompleteFunction(selected)) {
                            if (suffix.startsWith('(')) {
                                insertText = selectedLabel;
                                nextPos = replaceStart + selectedLabel.length + 1;
                            } else if (selected.argCount === 0) {
                                insertText = `${selectedLabel}()`;
                                nextPos = replaceStart + insertText.length;
                            } else {
                                insertText = `${selectedLabel}(`;
                                nextPos = replaceStart + insertText.length;
                            }
                        }

                        const newText = text.slice(0, replaceStart) + insertText + suffix;

                        this.syncEditorText(editorElement, newText, nextPos, nextPos);
                        this.closeAutocomplete();
                    },
                    closeAutocomplete() {
                        this.autocomplete.show = false;
                        this.autocomplete.list = [];
                        this.autocomplete.index = 0;
                    },
                    goToProblemLine(prob) {
                        if (prob.type !== this.editingMode && (prob.type === 'vertex' || prob.type === 'fragment')) {
                            this.editingMode = prob.type;
                        }

                        this.$nextTick(() => {
                            const textarea = this.$el.querySelector('.prism-editor__textarea');
                            if (!textarea) return;

                            textarea.focus();

                            if (prob.line) {
                                const text = textarea.value;
                                const lines = text.split('\n');
                                let charIndex = 0;

                                for (let i = 0; i < Math.min(prob.line - 1, lines.length); i++) {
                                    charIndex += lines[i].length + 1;
                                }

                                textarea.selectionStart = textarea.selectionEnd = charIndex;

                                // Scroll to cursor manually
                                const rowHeight = 20;
                                const scrollTop = Math.max(0, (prob.line - 4) * rowHeight);
                                const scrollContainer = this.$el.querySelector('.prism-editor-wrapper');
                                if (scrollContainer) {
                                    scrollContainer.scrollTop = scrollTop;
                                }
                            }
                        });
                    }
                },
                created() {
                    // Load materials into reactive state
                    for (let id in MaterialManager.materials) {
                        this.$set(this.materials, id, MaterialManager.materials[id]);
                    }
                    this.selectedId = 'classic';
                },
                mounted() {
                    this.setupEditorEvents();
                    this.debounceValidate();

                    this._shortcutListener = (e) => {
                        // Collapses Material list (Ctrl+B)
                        if (e.ctrlKey && e.key === 'b') {
                            e.preventDefault();
                            this.showLeftSidebar = !this.showLeftSidebar;
                        }
                        // Format code (Shift+Alt+F or Ctrl+Alt+F)
                        if ((e.shiftKey && e.altKey && e.key === 'F') || (e.ctrlKey && e.altKey && e.key === 'f')) {
                            e.preventDefault();
                            if (this.editingMode !== 'uniforms') {
                                this.formatCode();
                            }
                        }
                        // Validate (Ctrl+S)
                        if (e.ctrlKey && e.key === 's') {
                            e.preventDefault();
                            this.validateShader();
                        }
                    };
                    window.addEventListener('keydown', this._shortcutListener);
                },
                beforeDestroy() {
                    if (this._shortcutListener) {
                        window.removeEventListener('keydown', this._shortcutListener);
                    }
                },
                components: {
                    'vue-prism-editor': window.VuePrismEditor || VuePrismEditor
                },
                template: `
                <div class="sa-studio-container">
                    <!-- Top toolbar / Header -->
                    <div class="sa-studio-header">
                        <div style="display: flex; align-items: center; gap: 8px; flex-grow: 1;">
                            <button class="sa-icon-btn" :class="{active: showLeftSidebar}" @click="showLeftSidebar = !showLeftSidebar" :title="tl('shader_architect.ui.toggle_left')">
                                <i class="material-icons">menu</i>
                            </button>
                            <div class="sa-editor-header" v-if="activeMat">
                                <input v-model="activeMat.name" type="text" :disabled="!activeMat.isCustom" class="sa-material-name-input">
                                <i class="material-icons" style="font-size: 1.4em">{{activeMat.icon}}</i>
                                <div style="display: flex; align-items: center; gap: 5px;" v-if="activeMat.isCustom">
                                    <span style="opacity: 0.6; font-size: 0.85em;">Icon:</span>
                                    <input v-model="activeMat.icon" type="text" title="Material Icon String" style="width: 70px; padding: 2px 4px; font-size:0.9em;">
                                </div>
                                <button class="sa-icon-btn" @click="duplicateActiveMaterial()" :title="tl('shader_architect.ui.tooltip.duplicate')"><i class="material-icons">content_copy</i></button>
                                <button class="sa-icon-btn" :class="{active: hasMaterialShadowsEnabled()}" @click="toggleMaterialShadows()" :disabled="!activeMat.isCustom" :title="tl('shader_architect.ui.toggle_shadows')"><i class="material-icons">brightness_3</i></button>
                                <button class="sa-icon-btn" :class="{active: hasMaterialScreenSpaceReflectionsEnabled()}" @click="toggleMaterialScreenSpaceReflections()" :disabled="!activeMat.isCustom" :title="tl('shader_architect.ui.toggle_reflections')"><i class="material-icons">opacity</i></button>
                                <button class="sa-icon-btn" @click="exportActive()" v-if="activeMat.isCustom" :title="tl('shader_architect.ui.tooltip.export')"><i class="material-icons">save_alt</i></button>
                                <button class="sa-icon-btn delete-btn" @click="deleteActiveMaterial()" v-if="activeMat.isCustom" :title="tl('shader_architect.ui.tooltip.delete')"><i class="material-icons">delete</i></button>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <button class="sa-icon-btn" :class="{active: showRightSidebar}" @click="showRightSidebar = !showRightSidebar" :title="tl('shader_architect.ui.toggle_right')">
                                <i class="material-icons">tune</i>
                            </button>
                        </div>
                    </div>

                    <!-- Main Workspace Body -->
                    <div class="sa-studio-body">

                        <!-- Left Sidebar: Materials Library -->
                        <div class="sa-studio-sidebar sa-left" :class="{collapsed: !showLeftSidebar}" style="padding: 12px 10px;">
                            <button class="sa-left-btn" @click="createNewMaterial()"><i class="material-icons">add</i> New Material</button>
                            <button class="sa-left-btn" @click="importMaterial()"><i class="material-icons">file_upload</i> Import .samat</button>
                            <div style="font-size: 0.85em; font-weight: bold; opacity: 0.6; text-transform: uppercase; margin: 12px 0 6px 4px; letter-spacing: 0.5px;">Material Library</div>
                            <div style="flex-grow: 1;">
                                <div v-for="(m, mid) in materials" :key="mid"
                                     class="sa-materiel-list-item" :class="{selected: selectedId === mid}"
                                     @click="selectMaterial(mid)">
                                     <i class="material-icons">{{m.icon}}</i>
                                     <div style="flex-grow:1; font-weight: bold; font-size:1.05em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{m.name}}</div>
                                     <i v-if="!m.isCustom" class="material-icons" style="opacity:0.5; font-size:0.9em;" title="Read Only">lock</i>
                                </div>
                            </div>
                        </div>

                        <!-- Center Panel: Code Editor -->
                        <div class="sa-studio-main" v-if="activeMat" style="flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;">

                            <!-- VSCode Style Tab Header Bar -->
                                <div class="sa-vscode-tabs-row" style="flex-shrink: 0; z-index: 2;">
                                    <button class="sa-vscode-tab" :class="{active: editingMode === 'vertex'}" @click="editingMode = 'vertex'">
                                        <i class="material-icons" style="font-size:1.15em; color: #8be9fd;">code</i> vertex.glsl
                                    </button>
                                    <button class="sa-vscode-tab" :class="{active: editingMode === 'fragment'}" @click="editingMode = 'fragment'">
                                        <i class="material-icons" style="font-size:1.15em; color: #ffb86c;">code</i> fragment.glsl
                                    </button>
                                    <button class="sa-vscode-tab" :class="{active: editingMode === 'uniforms'}" @click="editingMode = 'uniforms'">
                                        <i class="material-icons" style="font-size:1.15em; color: #50fa7b;">settings</i> uniforms.json
                                    </button>

                                    <div class="sa-editor-actions-toolbar" v-if="editingMode !== 'uniforms'">
                                        <button class="sa-icon-btn" @click="formatCode()" :title="tl('shader_architect.ui.format')">
                                            <i class="material-icons">format_align_left</i>
                                        </button>
                                        <button class="sa-icon-btn" @click="validateShader()" :title="tl('shader_architect.ui.validate')">
                                            <i class="material-icons">check_circle</i>
                                        </button>
                                        <button class="sa-icon-btn" style="background: var(--color-accent); color: var(--color-accent_text); border-color: transparent;" @click="applyLive()" :title="tl('shader_architect.ui.apply')">
                                            <i class="material-icons">play_arrow</i>
                                        </button>
                                    </div>
                                </div>

                            <!-- Workspace main content (Editor or Uniforms) -->
                            <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; min-height: 0;">

                                <!-- Main Code Editor area -->
                                <div v-if="editingMode !== 'uniforms'" class="sa-editor-container" style="flex: 1; display: flex; flex-direction: column; min-height: 0; position: relative; width: 100%;">

                                    <vue-prism-editor
                                        class="glsl-editor-instance"
                                        v-model="currentShaderCode"
                                        :highlight="highlighter"
                                        language="glsl"
                                        :line-numbers="true"
                                        :readonly="!activeMat.isCustom"
                                    ></vue-prism-editor>

                                    <!-- Autocomplete Suggestions popup -->
                                    <div v-if="autocomplete.show" class="sa-autocomplete-dropdown" :style="{top: autocomplete.y + 'px', left: autocomplete.x + 'px'}">
                                        <div v-for="(item, idx) in autocomplete.list" :key="getAutocompleteKey(item)"
                                            class="sa-autocomplete-item" :class="{active: idx === autocomplete.index}"
                                            @mousedown.prevent="autocomplete.index = idx; acceptAutocomplete(getEditorInputElement())">
                                            <div class="sa-autocomplete-main">
                                                <span class="sa-autocomplete-name">{{ getAutocompleteLabel(item) }}</span>
                                                <span v-if="getAutocompleteSignature(item)" class="sa-autocomplete-signature">{{ getAutocompleteSignature(item) }}</span>
                                            </div>
                                            <div class="sa-autocomplete-meta">
                                                <span v-if="getAutocompleteReturnInfo(item)" class="sa-autocomplete-return">{{ getAutocompleteReturnInfo(item) }}</span>
                                                <span class="type-badge" :class="getAutocompleteType(item)">{{ getAutocompleteType(item) }}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Bottom Problems Console Panel -->
                                <div v-if="editingMode !== 'uniforms'" class="sa-problems-console" :class="{collapsed: problemsCollapsed}" style="flex-shrink: 0; display: flex; flex-direction: column; max-height: 40%; z-index: 10; background: var(--color-back); border-top: 1px solid var(--color-border);">
                                    <div class="sa-problems-header" @click="problemsCollapsed = !problemsCollapsed" style="flex-shrink: 0; cursor: pointer; padding: 6px 12px;">
                                        <span style="display:flex; align-items:center; gap:6px;">
                                            <i class="material-icons" style="font-size:1.15em;" :style="{color: validationErrors.length > 0 ? '#ff5555' : '#50fa7b'}">
                                                {{ validationErrors.length > 0 ? 'error' : 'check_circle' }}
                                            </i>
                                            {{ tl('shader_architect.ui.problems') }} ({{ validationErrors.length }})
                                        </span>
                                        <i class="material-icons" style="font-size:1.15em;">
                                            {{ problemsCollapsed ? 'keyboard_arrow_up' : 'keyboard_arrow_down' }}
                                        </i>
                                    </div>
                                    <div class="sa-problems-list" v-if="!problemsCollapsed" style="flex: 1; overflow-y: auto;">
                                        <div v-if="validationErrors.length === 0" style="opacity: 0.5; padding: 8px 12px; font-size:0.95em;">
                                            {{ tl('shader_architect.ui.no_problems') }}
                                        </div>
                                        <div v-for="(prob, pidx) in validationErrors" :key="pidx"
                                            class="sa-problem-item error" @click="goToProblemLine(prob)">
                                            <span class="location">
                                                [{{ prob.type }}<span v-if="prob.line">:L{{ prob.line }}</span>]
                                            </span>
                                            <span class="message">{{ prob.message }}</span>
                                        </div>
                                    </div>
                                </div>

                                <!-- Uniforms panel inside main area (Full settings schema editor) -->
                                <div v-if="editingMode === 'uniforms'" style="flex: 1; overflow-y: auto; padding: 16px;">
                                    <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--color-border);">
                                        <h3 style="margin-top:0;">Add Custom Uniform</h3>
                                        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                                            <input v-model="newUniformName" type="text" placeholder="u_myProperty" :disabled="!activeMat.isCustom" class="dark_bordered" style="padding: 6px;">
                                            <select v-model="newUniformType" :disabled="!activeMat.isCustom">
                                                <option value="float">float</option>
                                                <option value="int">int</option>
                                                <option value="bool">bool</option>
                                                <option value="vec2">vec2</option>
                                                <option value="vec3">vec3</option>
                                                <option value="vec4">vec4</option>
                                                <option value="color">color (vec3)</option>
                                            </select>
                                            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                                                <input type="checkbox" v-model="newUniformExpose" :disabled="!activeMat.isCustom"> Expose
                                            </label>
                                            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                                                <input type="checkbox" v-model="newUniformAdvanced" :disabled="!activeMat.isCustom"> Advanced
                                            </label>
                                            <button @click="addUniform()" :disabled="!activeMat.isCustom"><i class="material-icons" style="font-size:1.1em; vertical-align:middle;">add_box</i> Add</button>
                                        </div>
                                        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 10px;">
                                            <span style="opacity: 0.75;">Native:</span>
                                            <select v-model="selectedNativeUniformName" :disabled="!activeMat.isCustom">
                                                <option v-for="option in nativeUniformOptions" :key="option.name" :value="option.name" :disabled="activeMat.uniforms && activeMat.uniforms[option.name]">
                                                    {{ option.name }} ({{ option.type }}){{ activeMat.uniforms && activeMat.uniforms[option.name] ? ' - added' : '' }}
                                                </option>
                                            </select>
                                            <span v-if="selectedNativeUniformOption" style="opacity: 0.65; font-size: 0.9em;">
                                                {{ getUniformLabel(null, selectedNativeUniformOption.name) || selectedNativeUniformOption.type }}
                                            </span>
                                            <button @click="addNativeUniform()" :disabled="!activeMat.isCustom || (activeMat.uniforms && activeMat.uniforms[selectedNativeUniformName])">
                                                <i class="material-icons" style="font-size:1.1em; vertical-align:middle;">playlist_add</i> Add Native
                                            </button>
                                        </div>
                                        <div v-if="(newUniformType === 'float' || newUniformType === 'int') && activeMat.isCustom" style="display: flex; gap: 12px; align-items: center; margin-top: 8px; flex-wrap: wrap;">
                                            <label style="display: flex; align-items: center; gap: 4px;">
                                                Min: <input type="number" placeholder="None" v-model.number="newUniformMin" class="dark_bordered" style="width: 70px; padding: 2px 4px;">
                                            </label>
                                            <label style="display: flex; align-items: center; gap: 4px;">
                                                Max: <input type="number" placeholder="None" v-model.number="newUniformMax" class="dark_bordered" style="width: 70px; padding: 2px 4px;">
                                            </label>
                                            <label style="display: flex; align-items: center; gap: 4px;">
                                                Step: <input type="number" placeholder="None" v-model.number="newUniformStep" class="dark_bordered" style="width: 70px; padding: 2px 4px;">
                                            </label>
                                            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                                                <input type="checkbox" v-model="newUniformAllowHigher"> Allow Higher
                                            </label>
                                            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                                                <input type="checkbox" v-model="newUniformAllowLower"> Allow Lower
                                            </label>
                                        </div>
                                        <!-- Per-channel range for vec2 / vec3 -->
                                        <div v-if="(newUniformType === 'vec2' || newUniformType === 'vec3' || newUniformType === 'vec4') && activeMat.isCustom" style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px;">
                                            <div v-for="axis in (newUniformType === 'vec2' ? ['x','y'] : (newUniformType === 'vec3' ? ['x','y','z'] : ['x','y','z','w']))" :key="axis" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 4px 0; border-top: 1px dashed rgba(255,255,255,0.08);">
                                                <label style="display: flex; align-items: center; gap: 4px; min-width: 100px; cursor: pointer;">
                                                    <input type="checkbox" v-model="newUniformChannels[axis].enabled"> Range <b style="text-transform:uppercase;">{{ axis }}</b>
                                                </label>
                                                <template v-if="newUniformChannels[axis].enabled">
                                                    <label style="display: flex; align-items: center; gap: 4px;">
                                                        Min: <input type="number" placeholder="None" v-model.number="newUniformChannels[axis].min" class="dark_bordered" style="width: 65px; padding: 2px 4px;">
                                                    </label>
                                                    <label style="display: flex; align-items: center; gap: 4px;">
                                                        Max: <input type="number" placeholder="None" v-model.number="newUniformChannels[axis].max" class="dark_bordered" style="width: 65px; padding: 2px 4px;">
                                                    </label>
                                                    <label style="display: flex; align-items: center; gap: 4px;">
                                                        Step: <input type="number" placeholder="None" v-model.number="newUniformChannels[axis].step" class="dark_bordered" style="width: 65px; padding: 2px 4px;">
                                                    </label>
                                                    <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                                                        <input type="checkbox" v-model="newUniformChannels[axis].allow_higher"> Allow Higher
                                                    </label>
                                                    <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                                                        <input type="checkbox" v-model="newUniformChannels[axis].allow_lower"> Allow Lower
                                                    </label>
                                                </template>
                                            </div>
                                        </div>
                                    </div>

                                    <h3 style="margin-top:0;">Active Uniforms</h3>
                                    <div v-if="!activeMat.uniforms || Object.keys(activeMat.uniforms).length === 0" style="opacity: 0.5;">No uniforms defined.</div>

                                    <div v-for="(uni, key) in activeMat.uniforms" :key="key" class="sa-uniform-row">
                                        <div class="sa-uniform-row-header">
                                            <label :title="key">
                                                <span>{{key}} <span v-if="getUniformLabel(uni, key)" style="opacity: 0.6; font-size: 0.9em; font-weight: normal;">({{getUniformLabel(uni, key)}})</span></span>
                                                <span class="uni-type">{{uni.type}}</span>
                                            </label>

                                            <!-- Editor varies by type -->
                                            <input v-if="uni.type==='float'" type="number" step="0.1" v-model.number="uni.value" class="dark_bordered" style="width: 100px;">
                                            <input v-if="uni.type==='int'" type="number" step="1" v-model.number="uni.value" class="dark_bordered" style="width: 100px;">
                                            <input v-if="uni.type==='bool'" type="checkbox" v-model="uni.value">
                                            <input v-if="isColorUniform(uni)" type="color" :value="getUniformColorHex(uni)" @input="setUniformColorHex(uni, $event.target.value)">

                                            <div v-if="uni.type==='sampler2D'" style="display: flex; gap: 8px; align-items: center;">
                                                <label style="display: flex; align-items: center; gap: 4px; font-weight: normal; cursor: pointer; font-size:0.9em;">
                                                    <input type="checkbox" v-model="uni.repeat" @change="applyLive()">
                                                    Repeat (Tiling)
                                                </label>
                                            </div>

                                            <div v-if="uni.type==='vec2'" style="display: flex; gap: 5px; align-items: center;">
                                                X <input type="number" step="0.1" v-model.number="uni.value.x" class="dark_bordered" style="width: 70px;">
                                                Y <input type="number" step="0.1" v-model.number="uni.value.y" class="dark_bordered" style="width: 70px;">
                                            </div>

                                            <div v-if="uni.type==='vec3' && !isColorUniform(uni)" style="display: flex; gap: 5px; align-items: center;">
                                                X <input type="number" step="0.1" v-model.number="uni.value.x" class="dark_bordered" style="width: 60px;">
                                                Y <input type="number" step="0.1" v-model.number="uni.value.y" class="dark_bordered" style="width: 60px;">
                                                Z <input type="number" step="0.1" v-model.number="uni.value.z" class="dark_bordered" style="width: 60px;">
                                            </div>

                                            <div v-if="uni.type==='vec4' && !isColorUniform(uni)" style="display: flex; gap: 5px; align-items: center;">
                                                X <input type="number" step="0.1" v-model.number="uni.value.x" class="dark_bordered" style="width: 55px;">
                                                Y <input type="number" step="0.1" v-model.number="uni.value.y" class="dark_bordered" style="width: 55px;">
                                                Z <input type="number" step="0.1" v-model.number="uni.value.z" class="dark_bordered" style="width: 55px;">
                                                W <input type="number" step="0.1" v-model.number="uni.value.w" class="dark_bordered" style="width: 55px;">
                                            </div>

                                            <div v-if="uni.type==='vec2v' || uni.type==='vec3v' || uni.type==='floatv'" style="opacity:0.6; font-style:italic;">[Array Data: {{uni.value.length}} items]</div>
                                            <div v-if="uni.type==='intv'" style="opacity:0.6; font-style:italic;">[Array Data: {{uni.value.length}} items]</div>

                                            <div style="flex-grow:1"></div>
                                            <button v-if="key !== 'map'" @click="expandUniform(key)" style="background: transparent; border: none; padding: 2px 4px; cursor: pointer; color: var(--color-text); margin-right: 4px;" title="Edit Metadata">
                                                <i class="material-icons" :style="{color: expandedUniforms[key] ? 'var(--color-accent)' : ''}" style="font-size: 1.2em;">settings</i>
                                            </button>
                                            <i v-if="activeMat.isCustom && key !== 'map'" class="material-icons" @click="removeUniform(key)" style="color: #fc2f40; cursor: pointer;" title="Remove Uniform">close</i>
                                        </div>

                                        <!-- Expanded Metadata Editor -->
                                        <div v-if="expandedUniforms[key]" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.1); display: flex; flex-direction: column; gap: 6px; font-size: 0.9em; opacity: 0.9;">
                                            <div style="display: flex; gap: 15px; align-items: center;">
                                                <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                                                    <input type="checkbox" v-model="uni.expose" :disabled="!activeMat.isCustom"> Expose to UI
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                                                    <input type="checkbox" v-model="uni.advanced" :disabled="!activeMat.isCustom"> Advanced
                                                </label>
                                                <label v-if="uni.type === 'vec3' || uni.type === 'vec4' || uni.type === 'color'" style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                                                    <input type="checkbox" v-model="uni.is_color" :disabled="!activeMat.isCustom" @change="uni.is_color ? setUniformColorHex(uni, getUniformColorHex(uni)) : null"> Is Color
                                                </label>
                                            </div>
                                            <div v-if="uni.type === 'float' || uni.type === 'int'" style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
                                                <label style="display: flex; align-items: center; gap: 4px;">
                                                    Min: <input type="number" v-model.number="uni.min" placeholder="None" :disabled="!activeMat.isCustom" class="dark_bordered" style="width: 70px; padding: 2px 4px;">
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 4px;">
                                                    Max: <input type="number" v-model.number="uni.max" placeholder="None" :disabled="!activeMat.isCustom" class="dark_bordered" style="width: 70px; padding: 2px 4px;">
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 4px;">
                                                    Step: <input type="number" v-model.number="uni.step" placeholder="None" :disabled="!activeMat.isCustom" class="dark_bordered" style="width: 70px; padding: 2px 4px;">
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                                                    <input type="checkbox" v-model="uni.allow_higher" :disabled="!activeMat.isCustom"> Allow Higher
                                                </label>
                                                <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                                                    <input type="checkbox" v-model="uni.allow_lower" :disabled="!activeMat.isCustom"> Allow Lower
                                                </label>
                                            </div>
                                            <!-- Per-channel range for vector uniforms in expanded metadata -->
                                            <div v-if="uni.type === 'vec2' || uni.type === 'vec3' || uni.type === 'vec4'" style="display: flex; flex-direction: column; gap: 5px; margin-top: 4px;">
                                                <div style="font-size: 0.85em; opacity: 0.7; margin-bottom: 2px;">Per-channel range (optional):</div>
                                                <div v-for="axis in (uni.type === 'vec2' ? ['x','y'] : (uni.type === 'vec3' ? ['x','y','z'] : ['x','y','z','w']))" :key="axis" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 4px 6px; background: rgba(255,255,255,0.03); border-radius: 4px;">
                                                    <label style="min-width: 110px; display: flex; align-items: center; gap: 4px; cursor: pointer; font-weight: bold;">
                                                        <input type="checkbox"
                                                            :checked="uni.channels && uni.channels[axis] !== undefined"
                                                            :disabled="!activeMat.isCustom"
                                                            @change="e => { if (!uni.channels) $set(uni, 'channels', {}); if (e.target.checked) { $set(uni.channels, axis, { min: 0, max: 1, step: 0.05, allow_higher: false, allow_lower: false }); } else { $delete(uni.channels, axis); } }">
                                                        <span style="text-transform: uppercase; font-family: monospace;">{{ axis }}</span>
                                                    </label>
                                                    <template v-if="uni.channels && uni.channels[axis] !== undefined">
                                                        <label style="display: flex; align-items: center; gap: 4px;">
                                                            Min: <input type="number" v-model.number="uni.channels[axis].min" placeholder="None" :disabled="!activeMat.isCustom" class="dark_bordered" style="width: 65px; padding: 2px 4px;">
                                                        </label>
                                                        <label style="display: flex; align-items: center; gap: 4px;">
                                                            Max: <input type="number" v-model.number="uni.channels[axis].max" placeholder="None" :disabled="!activeMat.isCustom" class="dark_bordered" style="width: 65px; padding: 2px 4px;">
                                                        </label>
                                                        <label style="display: flex; align-items: center; gap: 4px;">
                                                            Step: <input type="number" v-model.number="uni.channels[axis].step" placeholder="None" :disabled="!activeMat.isCustom" class="dark_bordered" style="width: 65px; padding: 2px 4px;">
                                                        </label>
                                                        <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                                                            <input type="checkbox" v-model="uni.channels[axis].allow_higher" :disabled="!activeMat.isCustom"> Allow Higher
                                                        </label>
                                                        <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                                                            <input type="checkbox" v-model="uni.channels[axis].allow_lower" :disabled="!activeMat.isCustom"> Allow Lower
                                                        </label>
                                                    </template>
                                                </div>
                                            </div>

                                            <!-- Description -->
                                            <div style="display: flex; flex-direction: column; gap: 2px; margin-top: 4px;">
                                                <label style="font-weight: bold;">Description (Tooltip):</label>
                                                <input type="text" v-model="uni.description" placeholder="Tooltip description" :disabled="!activeMat.isCustom" class="dark_bordered" style="padding: 4px;">
                                            </div>

                                            <!-- Translations -->
                                            <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
                                                <label style="font-weight: bold;">Custom Translations:</label>

                                                <!-- List existing translations -->
                                                <div v-for="(transVal, langCode) in uni.translations" :key="langCode" style="display: flex; gap: 5px; align-items: center; margin-bottom: 2px;">
                                                    <span style="font-family: monospace; width: 30px; text-transform: uppercase; opacity: 0.8;">{{langCode}}:</span>
                                                    <input type="text" v-model="uni.translations[langCode]" :disabled="!activeMat.isCustom" class="dark_bordered" style="flex-grow: 1; padding: 2px 4px;">
                                                    <button v-if="activeMat.isCustom" @click="$delete(uni.translations, langCode)" style="background: transparent; border: none; color: #fc2f40; cursor: pointer; padding: 0 4px;" title="Remove Translation">
                                                        <i class="material-icons" style="font-size: 1.1em;">close</i>
                                                    </button>
                                                </div>

                                                <!-- Add new translation -->
                                                <div v-if="activeMat.isCustom" style="display: flex; gap: 5px; align-items: center;">
                                                    <input type="text" placeholder="Language (e.g. en, es)" v-model="newTransLang[key]" class="dark_bordered" style="width: 100px; padding: 2px 4px;">
                                                    <input type="text" placeholder="Label translation" v-model="newTransVal[key]" class="dark_bordered" style="flex-grow: 1; padding: 2px 4px;">
                                                    <button @click="addCustomTranslation(uni, key)" style="padding: 2px 8px; cursor: pointer;">Add</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>



                            </div>

                        </div>
                        <div v-else style="flex-grow: 1; display:flex; align-items:center; justify-content:center; opacity:0.5; font-size:1.5em; background:var(--color-back);">
                            Select or create a material to edit.
                        </div>

                        <!-- Right Sidebar: Properties and Active Uniforms Quick Tweaks -->
                        <div class="sa-studio-sidebar sa-right" :class="{collapsed: !showRightSidebar}" style="padding: 16px 12px;">
                            <div v-if="activeMat">
                                <h3 style="margin-top:0; border-bottom: 1px solid var(--color-border); padding-bottom:6px; display:flex; align-items:center; gap:6px;">
                                    <i class="material-icons" style="color:var(--color-accent)">tune</i>
                                    Quick Tweaks
                                </h3>

                                <div style="font-size:0.85em; opacity:0.6; margin-bottom:12px;">
                                    Adjust exposed uniforms and properties in real-time to preview in the viewport.
                                </div>

                                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size:0.9em; font-weight:normal; margin-bottom:12px;">
                                    <input type="checkbox" v-model="showAdvancedTweaks"> {{ tl('shader_architect.material_panel.show_advanced') }}
                                </label>

                                <div v-if="!activeMat.uniforms || Object.keys(activeMat.uniforms).filter(k => isUniformVisibleInQuickTweaks(activeMat.uniforms[k], k)).length === 0" style="opacity: 0.5; font-style:italic;">
                                    No exposed properties. Turn on "Expose" in Uniforms tab settings.
                                </div>

                                <div v-for="(uni, key) in activeMat.uniforms" :key="key" v-if="isUniformVisibleInQuickTweaks(uni, key)" class="sa-uniform-row" style="margin-bottom:10px; padding: 8px;">
                                    <div style="font-weight:bold; font-size:0.9em; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
                                        <span>{{ getUniformLabel(uni, key) || key }}</span>
                                        <span style="opacity:0.4; font-size:0.8em; font-family:monospace;">{{ uni.type }}</span>
                                    </div>

                                    <!-- Float slider or input -->
                                    <div v-if="uni.type==='float'">
                                        <div v-if="uni.min !== undefined && uni.max !== undefined" style="display:flex; align-items:center; gap:6px;">
                                            <input type="range" :min="uni.min" :max="uni.max" :step="uni.step || 0.05" v-model.number="uni.value" @input="applyLive()" style="flex-grow:1; cursor:pointer; height:4px; padding:0;">
                                            <span style="font-size:0.85em; font-family:monospace; min-width:32px; text-align:right;">{{ formatNumber(uni.value) }}</span>
                                        </div>
                                        <input v-else type="number" step="0.1" v-model.number="uni.value" @change="applyLive()" class="dark_bordered" style="width: 100%; box-sizing:border-box;">
                                    </div>

                                    <!-- Int input -->
                                    <div v-if="uni.type==='int'">
                                        <input type="number" step="1" v-model.number="uni.value" @change="applyLive()" class="dark_bordered" style="width: 100%; box-sizing:border-box;">
                                    </div>

                                    <!-- Bool check -->
                                    <div v-if="uni.type==='bool'">
                                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.9em; font-weight:normal;">
                                            <input type="checkbox" v-model="uni.value" @change="applyLive()"> Enabled
                                        </label>
                                    </div>

                                    <!-- sampler2D -->
                                    <div v-if="uni.type==='sampler2D'">
                                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.9em; font-weight:normal;">
                                            <input type="checkbox" v-model="uni.repeat" @change="applyLive()"> Repeat (Tiling)
                                        </label>
                                    </div>

                                    <!-- Color picker -->
                                    <div v-if="isColorUniform(uni)">
                                        <input type="color" :value="getUniformColorHex(uni)" @input="setUniformColorHex(uni, $event.target.value); applyLive()" style="width:100%; padding:0; border:none; height:24px; cursor:pointer;">
                                    </div>

                                    <!-- Vec2 input with optional per-channel sliders -->
                                    <div v-if="uni.type==='vec2'" style="display: flex; flex-direction: column; gap: 4px; font-size:0.85em; width: 100%;">
                                        <div v-for="axis in ['x','y']" :key="axis" style="display: flex; align-items: center; gap: 4px;">
                                            <span style="font-family: monospace; text-transform: uppercase; min-width: 14px;">{{ axis }}:</span>
                                            <template v-if="uni.channels && uni.channels[axis] !== undefined">
                                                <input type="range"
                                                    :min="uni.channels[axis].min !== undefined ? uni.channels[axis].min : 0"
                                                    :max="uni.channels[axis].max !== undefined ? uni.channels[axis].max : 1"
                                                    :step="uni.channels[axis].step || 0.05"
                                                    v-model.number="uni.value[axis]"
                                                    @input="applyLive()"
                                                    style="flex-grow:1; cursor:pointer; height:4px; padding:0;">
                                                <span style="font-family:monospace; min-width:36px; text-align:right;">{{ formatNumber(uni.value[axis]) }}</span>
                                            </template>
                                            <template v-else>
                                                <input type="number" :step="0.1" v-model.number="uni.value[axis]" @change="applyLive()" class="dark_bordered" style="flex-grow:1; min-width:30px;">
                                            </template>
                                        </div>
                                    </div>

                                    <!-- Vec3 input with optional per-channel sliders -->
                                    <div v-if="uni.type==='vec3' && !isColorUniform(uni)" style="display: flex; flex-direction: column; gap: 4px; font-size:0.85em; width: 100%;">
                                        <div v-for="axis in ['x','y','z']" :key="axis" style="display: flex; align-items: center; gap: 4px;">
                                            <span style="font-family: monospace; text-transform: uppercase; min-width: 14px;">{{ axis }}:</span>
                                            <template v-if="uni.channels && uni.channels[axis] !== undefined">
                                                <input type="range"
                                                    :min="uni.channels[axis].min !== undefined ? uni.channels[axis].min : 0"
                                                    :max="uni.channels[axis].max !== undefined ? uni.channels[axis].max : 1"
                                                    :step="uni.channels[axis].step || 0.05"
                                                    v-model.number="uni.value[axis]"
                                                    @input="applyLive()"
                                                    style="flex-grow:1; cursor:pointer; height:4px; padding:0;">
                                                <span style="font-family:monospace; min-width:36px; text-align:right;">{{ formatNumber(uni.value[axis]) }}</span>
                                            </template>
                                            <template v-else>
                                                <input type="number" :step="0.1" v-model.number="uni.value[axis]" @change="applyLive()" class="dark_bordered" style="flex-grow:1; min-width:30px;">
                                            </template>
                                        </div>
                                    </div>

                                    <!-- Vec4 input with optional per-channel sliders -->
                                    <div v-if="uni.type==='vec4' && !isColorUniform(uni)" style="display: flex; flex-direction: column; gap: 4px; font-size:0.85em; width: 100%;">
                                        <div v-for="axis in ['x','y','z','w']" :key="axis" style="display: flex; align-items: center; gap: 4px;">
                                            <span style="font-family: monospace; text-transform: uppercase; min-width: 14px;">{{ axis }}:</span>
                                            <template v-if="uni.channels && uni.channels[axis] !== undefined">
                                                <input type="range"
                                                    :min="uni.channels[axis].min !== undefined ? uni.channels[axis].min : 0"
                                                    :max="uni.channels[axis].max !== undefined ? uni.channels[axis].max : 1"
                                                    :step="uni.channels[axis].step || 0.05"
                                                    v-model.number="uni.value[axis]"
                                                    @input="applyLive()"
                                                    style="flex-grow:1; cursor:pointer; height:4px; padding:0;">
                                                <span style="font-family:monospace; min-width:36px; text-align:right;">{{ formatNumber(uni.value[axis]) }}</span>
                                            </template>
                                            <template v-else>
                                                <input type="number" :step="0.1" v-model.number="uni.value[axis]" @change="applyLive()" class="dark_bordered" style="flex-grow:1; min-width:30px;">
                                            </template>
                                        </div>
                                    </div>
                                </div>

                            </div>
                            <div style="opacity:0.5; text-align:center; padding-top:40px;" v-else>
                                Select a material to tweak properties.
                            </div>
                        </div>

                    </div>

                    <!-- Status Bar -->
                    <div class="sa-studio-statusbar">
                        <div class="sa-statusbar-item">
                            <i class="material-icons" style="font-size:1.15em;" :style="{color: validationErrors.length > 0 ? '#ff5555' : '#50fa7b'}">
                                {{ validationErrors.length > 0 ? 'error' : 'offline_pin' }}
                            </i>
                            <span>{{ validationErrors.length > 0 ? tl('shader_architect.ui.status_errors') : tl('shader_architect.ui.status_ok') }}</span>
                        </div>
                        <div class="sa-statusbar-item" v-if="activeMat">
                            <span style="opacity:0.5; margin-right:4px;">Language:</span>
                            <span style="font-weight:bold; color:var(--color-accent)">GLSL ES 100</span>
                        </div>
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
                ShaderEngine.updateAllCubes('material_studio_confirm');
            }
        });
    }

    // =========================================================================
    // 6. PLUGIN INITIALIZATION & MENUS
    // =========================================================================
    function waitForPluginLightManager(timeout = 5000) {
        return new Promise((resolve, reject) => {

            // Use the existing ready flag when Light Manager has already loaded.
            if (window.LIGHT_MANAGER_LOADED) {
                resolve(window.LIGHT_MANAGER_LOADED);
                return;
            }

            let finished = false;

            const timer = setTimeout(() => {
                if (finished) return;
                finished = true;

                window.removeEventListener('light_manager_initialized', onReady);

                reject(new Error(`Light Manager is not available after waiting for ${timeout}ms. Shader Architect requires Light Manager to function properly. Please ensure Light Manager is installed and enabled.`));
            }, timeout);

            function onReady(event) {
                if (finished) return;
                finished = true;

                clearTimeout(timer);
                resolve(event.detail || window.LIGHT_MANAGER_LOADED);
            }

            window.addEventListener('light_manager_initialized', onReady, { once: true });
        });
    }

    /**
     * Wraps an existing function to dispatch a Blockbench event before or after its execution.
     * The wrapped function perfectly preserves the original arguments, 'this' context, and return value.
     *
     * @param {Function} originalFunction - The original function/method to wrap.
     * @param {string} eventName - The name of the Blockbench event to dispatch.
     * @param {Object} [options] - Configuration options.
     * @param {'before' | 'after'} [options.mode='before'] - When to dispatch the event relative to the function execution.
     * @param {Object} [options.eventData={}] - Additional data/arguments to pass to the Blockbench event.
     * @returns {Function} The new wrapped function.
     */
    function wrapWithBlockbenchEvent(originalFunction, eventName, options = {}) {
        const { mode = 'before', eventData = {} } = options;

        const targetFn = typeof originalFunction === 'function' ? originalFunction : () => { };
        const existingMeta = targetFn._shaderArchitectEventWrapper;

        if (existingMeta && existingMeta.eventName === eventName && existingMeta.mode === mode) {
            return targetFn;
        }

        // Preserve the original `this` binding and return value.
        const wrapped = function (...args) {
            if (mode === 'before') {
                Blockbench.dispatchEvent(eventName, eventData);
            }

            const result = targetFn.apply(this, args);

            if (mode === 'after') {
                Blockbench.dispatchEvent(eventName, eventData);
            }

            return result;
        };

        try {
            Object.defineProperty(wrapped, '_shaderArchitectEventWrapper', {
                value: {
                    eventName,
                    mode,
                    originalFunction: existingMeta && existingMeta.originalFunction
                        ? existingMeta.originalFunction
                        : targetFn
                },
                configurable: true
            });
        } catch (error) {
            wrapped._shaderArchitectEventWrapper = {
                eventName,
                mode,
                originalFunction: existingMeta && existingMeta.originalFunction
                    ? existingMeta.originalFunction
                    : targetFn
            };
        }

        return wrapped;
    }

    let deletables = [];
    let styleEl;

    let renderModeSelector;

    let material_properties;
    let materialPropertiesShowAdvanced = false;
    let materialPropertiesUniformGroupsOpen = {};

    let cube_material_instance;
    let cube_material_instance_name;
    let cube_face_material_instance;
    let material_instance_properties_toolbar;
    let create_material_instance;
    let delete_material_instance;
    let global_material_instance_text;

    function disposeTrackedResources() {
        const resources = deletables.slice();
        deletables.length = 0;
        resources.forEach(item => {
            if (item && typeof item.delete === 'function') item.delete();
        });
    }

    function restoreWindowBinding(name, previousValue, ownedValue) {
        if (window[name] !== ownedValue) return;
        if (previousValue === undefined) delete window[name];
        else window[name] = previousValue;
    }

    function bindShaderArchitectLightCallbacks() {
        const previousBindings = {
            updateLights: window.updateLights,
            UpdateShaderArchitectLights: window.UpdateShaderArchitectLights,
            on_light_element_updated: window.on_light_element_updated
        };
        const updateShaderLights = () => ShaderEngine.updateLightUniforms('light_element_update');

        window.updateLights = updateShaderLights;
        window.UpdateShaderArchitectLights = updateShaderLights;
        window.on_light_element_updated = updateShaderLights;

        deletables.push({
            delete: () => {
                restoreWindowBinding('updateLights', previousBindings.updateLights, updateShaderLights);
                restoreWindowBinding('UpdateShaderArchitectLights', previousBindings.UpdateShaderArchitectLights, updateShaderLights);
                restoreWindowBinding('on_light_element_updated', previousBindings.on_light_element_updated, updateShaderLights);
            }
        });
    }

    function registerNativeMethodEvent(owner, methodName, eventName, options = {}) {
        if (!owner) return;

        const wrapped = wrapWithBlockbenchEvent(owner[methodName], eventName, options);
        const originalFunction = wrapped._shaderArchitectEventWrapper
            ? wrapped._shaderArchitectEventWrapper.originalFunction
            : owner[methodName];

        owner[methodName] = wrapped;

        deletables.push({
            delete: () => {
                if (owner[methodName] === wrapped && typeof originalFunction === 'function') {
                    owner[methodName] = originalFunction;
                }
            }
        });
    }


    Plugin.register('shader_architect', {
        title: 'Shader Architect V2',
        icon: 'gradient',
        author: 'MidFord',
        description: 'Professional material and render workflow with shader presets, material instances, Light Manager integration, and full GLSL editing.',
        tags: ['Shader', 'Material', 'Render'],
        version: '2.0.0',
        min_version: '4.9.0',
        variant: 'both',

        onload: async function () {

            try {
                await waitForPluginLightManager();
            }
            catch (e) {
                Blockbench.showToastNotification({
                    text: tl('shader_architect.message.light_manager_required'),
                    icon: 'error',
                    expire: 10000
                });
                return;
            }

            window.ShaderEngine = ShaderEngine;
            window.MaterialManager = MaterialManager;
            window.FancyShaderMaterial = FancyShaderMaterial;
            window.FancyShaderMaterialInstance = FancyShaderMaterialInstance;
            window.ScreenSpaceReflectionManager = ScreenSpaceReflectionManager;
            window.MinecraftPromotionalSilhouetteManager = MinecraftPromotionalSilhouetteManager;
            bindShaderArchitectLightCallbacks();
            const saProjectInstancesProp = MaterialManager.registerProjectMaterialInstanceProperty();
            if (saProjectInstancesProp) deletables.push(saProjectInstancesProp);
            const saMaterialInstanceUndoHooks = MaterialManager.registerMaterialInstanceUndoHooks();
            if (saMaterialInstanceUndoHooks) deletables.push(saMaterialInstanceUndoHooks);
            // Register Cube property for material persistence in .bbmodel
            let saMatProp = new Property(Cube, 'string', 'sa_material_id', { default: '', exposed: true });
            deletables.push(saMatProp);
            let saMatInstanceProp = new Property(Cube, 'string', 'sa_material_instance_id', { default: '', exposed: true });
            deletables.push(saMatInstanceProp);
            let saFaceMatInstancesProp = new Property(Cube, 'string', FACE_MATERIAL_INSTANCES_PROP, { default: '', exposed: false });
            deletables.push(saFaceMatInstancesProp);

            // Load Styles
            styleEl = document.createElement('style');
            styleEl.id = PLUGIN_STYLE_ID;
            styleEl.innerHTML = pluginStyle;
            document.head.appendChild(styleEl);

            // Init backend
            MaterialManager.init();
            ScreenSpaceReflectionManager.init();
            MinecraftPromotionalSilhouetteManager.init();
            const studioRenderPreTileListener = Blockbench.on('studio_render_pre_tile', event => {
                const preview = event && event.preview;
                const settings = event && event.settings ? event.settings : {};
                if (!preview || !preview.renderer) {
                    return;
                }

                const sampleScale = Math.max(
                    1,
                    Math.min(
                        8,
                        parseInt(settings.samples, 10) || 1
                    )
                );

                const frameScale = Math.max(
                    1.0,
                    Number(event && event.promotionalRimFrameScale) || 1.0
                );

                ScreenSpaceReflectionManager.patchPreview(preview);
                ScreenSpaceReflectionManager.preparePreviewForRender(preview, {
                    studio: true
                });

                const currentSampleScale = Number(preview.sa_promotional_rim_sample_scale);
                const currentFrameScale = Number(preview.sa_promotional_rim_frame_scale);
                const rimAlreadyPrepared =
                    Number.isFinite(currentSampleScale) &&
                    Number.isFinite(currentFrameScale) &&
                    Math.abs(currentSampleScale - sampleScale) < 0.0001 &&
                    Math.abs(currentFrameScale - frameScale) < 0.0001;

                if (rimAlreadyPrepared) {
                    return;
                }

                MinecraftPromotionalSilhouetteManager.preparePreviewForRender(
                    preview,
                    {
                        sampleScale,
                        frameScale
                    }
                );
            });
            deletables.push(studioRenderPreTileListener);
            initMaterialStudio();
            deletables.push(MaterialStudioDialog);

            // Start Animation loop for `uTime`
            ShaderEngine.startAnimationLoop();

            // Menu: Material Studio
            let openStudioAction = new Action('sa_open_studio', {
                name: tl('shader_architect.menu.material_studio'),
                description: tl('shader_architect.menu.material_studio.desc'),
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

            const collectCubesFromItems = (items) => {
                if (!items || !items.length) return [];
                return items.flatMap(item => {
                    if (item instanceof Cube) return item;
                    if (item instanceof Group && item.children) return collectCubesFromItems(item.children);
                    return [];
                });
            };

            const getSelectedCubeSet = () => {
                const directCubes = Cube.selected || [];
                const groupCubes = Group.selected ? collectCubesFromItems(Group.selected) : [];
                return new Set([...directCubes, ...groupCubes]);
            };

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
                            getSelectedCubeSet().forEach(cube => {
                                cube.sa_material_id = formData.target_mat.replace('sa_', '');
                                cube.sa_material_instance_id = '';
                            });

                            ShaderEngine.updateAllCubes('apply_material');
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
                    getSelectedCubeSet().forEach(cube => {
                        MaterialManager.clearCubeMaterialAssignment(cube);
                    });

                    ShaderEngine.updateAllCubes('clear_material');
                }
            });

            // Add to Context Menu
            if (Cube.prototype.menu) {
                Cube.prototype.menu.addAction(contextApply);
                Cube.prototype.menu.addAction(contextClear);
            }

            // UI: Global Render Mode Selector (In Preview window)
            const getGlobalMaterialMenuOptions = () => {
                let globalMaterialMenuOptions = {};
                for (let id in MaterialManager.materials) {
                    let m = MaterialManager.materials[id];
                    globalMaterialMenuOptions['sa_' + id] = { name: m.name, icon: m.icon };
                };
                return globalMaterialMenuOptions;
            };

            renderModeSelector = new window.CompactDropdownSelect('sa_global_mode', {
                category: 'view',
                condition: () => Project,
                value: 'sa_' + ShaderEngine.globalRenderMode,
                icon_mode: true,
                options: getGlobalMaterialMenuOptions(),
                onChange() {
                    ShaderEngine.globalRenderMode = this.value.replace('sa_', '');
                    ShaderEngine.updateAllCubes('global_mode_change');
                }
            });

            const refreshGlobalMaterialSelector = () => {
                if (!renderModeSelector) return;
                renderModeSelector.setOptions(getGlobalMaterialMenuOptions());
                const selectorValue = 'sa_' + ShaderEngine.globalRenderMode;
                renderModeSelector.set(selectorValue);
                renderModeSelector.update();
            };

            let globalMaterialListEvent = Blockbench.on(GLOBAL_MATERIAL_LIST_EVENT, refreshGlobalMaterialSelector);
            deletables.push(globalMaterialListEvent);

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
            let renderWorkspaceMode = new Mode('render', {
                name: 'Render',
                icon: 'hangout_video',
                category: 'navigate',
                condition: () => Project,
                onSelect() {

                }
            });
            deletables.push(renderWorkspaceMode);

            Panels.outliner.condition.modes.push('render');

            let globalRendererPropertiesPanel = new Panel('global_renderer_properties', {
                icon: 'motion_mode',
                growable: true,
                resizable: true,
                condition: { modes: ['render'] },
                default_position: {
                    slot: "left_bar",
                    float_position: [
                        1322,
                        57
                    ],
                    float_size: [
                        314,
                        57
                    ],
                    height: 57,
                    folded: false,
                    fixed_height: true,
                    attached_to: "",
                    attached_index: 0,
                    sidebar_index: 0
                },
                mode_positions: {
                    render: {
                        slot: "left_bar",
                        float_position: [
                            1322,
                            57
                        ],
                        float_size: [
                            314,
                            57
                        ],
                        height: 57,
                        folded: false,
                        fixed_height: true,
                        attached_to: "",
                        attached_index: 0,
                        sidebar_index: 0
                    }
                },
                toolbars: [
                ]
            });

            deletables.push(globalRendererPropertiesPanel);



            const setBarControl = (control, value) => {
                if (control && typeof control.set === 'function') control.set(value);
            };

            const getSelectedCube = () => Cube.selected.length === 1 ? Cube.selected[0] : null;
            const getSelectedCubes = () => Cube.selected.length > 0 ? Cube.selected.slice() : [];
            const cubeSelectedCondition = () => Cube.selected.length > 0;
            const areMultipleSelected = () => Cube.selected.length > 1;
            const ELEMENT_MATERIAL_SCOPE = 'element';
            const getActiveMaterialScope = () => {
                let scope = cube_face_material_instance && typeof cube_face_material_instance.get === 'function'
                    ? cube_face_material_instance.get()
                    : ELEMENT_MATERIAL_SCOPE;

                if (Array.isArray(scope)) {
                    scope = scope[scope.length - 1] || ELEMENT_MATERIAL_SCOPE;
                }

                if (scope === ELEMENT_MATERIAL_SCOPE) return ELEMENT_MATERIAL_SCOPE;
                return MaterialManager.normalizeCubeFaceName(scope) || ELEMENT_MATERIAL_SCOPE;
            };
            const isFaceMaterialScope = scope => !!scope && scope !== ELEMENT_MATERIAL_SCOPE;
            const getCubeMaterialInstanceId = (cube, scope = ELEMENT_MATERIAL_SCOPE) => {
                if (!cube) return '';
                const activeScope = scope === ELEMENT_MATERIAL_SCOPE
                    ? ELEMENT_MATERIAL_SCOPE
                    : MaterialManager.normalizeCubeFaceName(scope);

                if (isFaceMaterialScope(activeScope)) {
                    return MaterialManager.getCubeFaceMaterialInstanceId(cube, activeScope);
                }

                return cube.sa_material_instance_id ? cube.sa_material_instance_id : '';
            };
            const allSelectedHaveSameMaterialInstance = (scope = getActiveMaterialScope()) => {
                const cubes = getSelectedCubes();
                if (cubes.length === 0) return false;
                const firstId = getCubeMaterialInstanceId(cubes[0], scope);
                return cubes.every(c => getCubeMaterialInstanceId(c, scope) === firstId);
            };

            const cubeHasMaterialInstance = (scope = getActiveMaterialScope()) => {
                const cubes = getSelectedCubes();
                if (cubes.length === 0) return false;
                if (areMultipleSelected()) {
                    const instanceId = getCubeMaterialInstanceId(cubes[0], scope);
                    return allSelectedHaveSameMaterialInstance(scope) && !!instanceId && !!MaterialManager.instances[instanceId];
                }
                const cube = getSelectedCube();
                if (!cube) return false;
                const instanceId = getCubeMaterialInstanceId(cube, scope);
                return !!instanceId && !!MaterialManager.instances[instanceId];
            };

            const getSharedSelectedMaterialInstanceId = (scope = getActiveMaterialScope()) => {
                const cubes = getSelectedCubes();
                if (cubes.length === 0 || !allSelectedHaveSameMaterialInstance(scope)) return '';
                return getCubeMaterialInstanceId(cubes[0], scope);
            };

            const getCubesUsingMaterialInstanceId = (instanceId) => {
                if (!instanceId) return [];
                return Cube.all.filter(cube => {
                    if (!cube) return false;
                    if (cube.sa_material_instance_id === instanceId) return true;
                    const faceOverrides = MaterialManager.getCubeFaceMaterialInstanceOverrides(cube);
                    return Object.keys(faceOverrides).some(faceName => faceOverrides[faceName] === instanceId);
                });
            };

            const getMaterialInstanceUndoAspects = (cubes = []) => {
                const aspects = {};
                if (cubes && cubes.length) aspects.elements = cubes;
                aspects[MATERIAL_INSTANCES_UNDO_ASPECT] = true;
                return aspects;
            };

            const runMaterialInstanceUndo = (labelKey, cubes, callback) => {
                const aspects = getMaterialInstanceUndoAspects(cubes);
                Undo.initEdit(aspects);
                try {
                    const result = callback();
                    Undo.finishEdit(tl(labelKey), aspects);
                    return result;
                } catch (error) {
                    Undo.cancelEdit(true);
                    throw error;
                }
            };

            const sanitizeSelectedMaterialInstances = (cubes) => {
                if (!Project.parsed || Blockbench.hasFlag('switching_project')) return;

                let changed = false;
                cubes.forEach(cube => {
                    const instanceId = getCubeMaterialInstanceId(cube);
                    if (instanceId && !MaterialManager.instances[instanceId]) {
                        changed = MaterialManager.clearMissingMaterialInstanceFromCube(cube, instanceId) || changed;
                    }
                    const faceOverrides = MaterialManager.getCubeFaceMaterialInstanceOverrides(cube);
                    Object.keys(faceOverrides).forEach(faceName => {
                        const faceInstanceId = faceOverrides[faceName];
                        if (faceInstanceId && !MaterialManager.instances[faceInstanceId]) {
                            changed = MaterialManager.clearMissingMaterialInstanceFromCubeFace(cube, faceName, faceInstanceId) || changed;
                        }
                    });
                });
                if (changed) ShaderEngine.updateAllCubes('sanitize_instances');
            };

            const updateMaterialInstancePanel = () => {
                if (!Project.parsed || Blockbench.hasFlag('switching_project')) return;

                const cubes = getSelectedCubes();
                if (cubes.length === 0) {
                    global_material_instance_text.set(tl('shader_architect.material_panel.global_material'));
                    material_properties.form.form_config = {
                        no_cube_selected: {
                            type: 'bar_display',
                            value: tl('shader_architect.material_panel.no_selected'),
                            icon: 'deployed_code_alert',
                            paragraph: false,
                            expand: true,
                            color: 'var(--color-text)'
                        }
                    };
                    material_properties.form.buildForm();
                    return;
                }

                sanitizeSelectedMaterialInstances(cubes);
                const activeScope = getActiveMaterialScope();
                const isFaceScope = isFaceMaterialScope(activeScope);
                global_material_instance_text.set(isFaceScope
                    ? tl('shader_architect.material_panel.element_material')
                    : (MaterialManager.materials[ShaderEngine.globalRenderMode] ? MaterialManager.materials[ShaderEngine.globalRenderMode].name : tl('shader_architect.material_panel.global_material')));

                const isMultiple = areMultipleSelected();
                const sameMaterialInstance = allSelectedHaveSameMaterialInstance(activeScope);

                let material_instances_options = {};

                if (isMultiple && !sameMaterialInstance) {
                    // Multiple cubes with different material instances: add the mixed option first.
                    material_instances_options['__mixed__'] = { name: 'shader_architect.material_panel.mixed_instances', icon: 'bubble_chart' };
                }

                material_instances_options['global'] = isFaceScope
                    ? { name: 'shader_architect.material_panel.element_material', icon: 'view_in_ar' }
                    : { name: 'shader_architect.material_panel.global_material', icon: 'globe' };
                for (let id in MaterialManager.instances) {
                    let inst = MaterialManager.instances[id];
                    material_instances_options[id] = { name: inst.name, icon: inst.icon };
                }

                if (isMultiple && !sameMaterialInstance) {
                    cube_material_instance.setOptions(material_instances_options);
                    cube_material_instance.update();
                    setBarControl(cube_material_instance, '__mixed__');
                    material_properties.form.form_config = {
                        multiple_instances: {
                            type: 'bar_display',
                            value: tl('shader_architect.material_panel.multiple_instances'),
                            icon: 'deployed_code_alert',
                            paragraph: false,
                            expand: true,
                            color: 'var(--color-text)'
                        }
                    };
                    material_properties.form.buildForm();
                } else {
                    // Single cube, or multiple cubes that share the same material instance.
                    const firstCube = cubes[0];
                    const instanceId = getCubeMaterialInstanceId(firstCube, activeScope);
                    cube_material_instance.setOptions(material_instances_options);
                    cube_material_instance.update();
                    setBarControl(cube_material_instance, instanceId ? instanceId : 'global');

                    if (instanceId && MaterialManager.instances[instanceId]) {
                        cube_material_instance_name.set(MaterialManager.instances[instanceId].name);
                        cube_material_instance_name.update();

                        const instance = MaterialManager.instances[instanceId];
                        MaterialManager.revalidateMaterialInstance(instance, { save: false });

                        let form_config = {
                            _sa_properties_info_label_: {
                                type: 'bar_display',
                                value: tl('shader_architect.material_panel.properties'),
                                icon: 'tune',
                                paragraph: false,
                                expand: true,
                                color: 'var(--color-text)'
                            },
                            _sa_show_advanced_uniforms: {
                                type: 'custom_checkbox',
                                label: tl('shader_architect.material_panel.show_advanced') + ':',
                                value: materialPropertiesShowAdvanced,
                                icon_size: '24px',
                                layout: 'space_between',
                                icon_on: 'font_download',
                                icon_off: 'font_download_off',
                                icon_color_on: 'var(--color-accent)',
                                icon_color_off: 'var(--color-text)',
                                title: tl('shader_architect.material_panel.show_advanced.desc'),
                                description: tl('shader_architect.material_panel.show_advanced.desc'),
                                padding_right: '32px'
                            }
                        };
                        const groupedUniformControls = {};

                        const isMaterialUniformGroupOpen = (groupId, groupDef) => {
                            if (Object.prototype.hasOwnProperty.call(materialPropertiesUniformGroupsOpen, groupId)) {
                                return materialPropertiesUniformGroupsOpen[groupId] !== false;
                            }
                            return groupDef.defaultOpen !== false;
                        };

                        const addGroupedUniformControl = (formKey, controlConfig, uniName, uni) => {
                            const groupId = MaterialManager.getUniformGroupId(uniName, uni);
                            const groupDef = MaterialManager.getUniformGroupDefinition(groupId);
                            const groupKey = MaterialManager.getUniformGroupFormKey(groupId);
                            const existingCondition = controlConfig.condition;
                            controlConfig.condition = form => {
                                const groupOpen = form && Object.prototype.hasOwnProperty.call(form, groupKey)
                                    ? form[groupKey] !== false
                                    : isMaterialUniformGroupOpen(groupId, groupDef);
                                if (!groupOpen) return false;
                                if (!existingCondition) return true;
                                if (typeof Condition === 'function') return Condition(existingCondition, form);
                                if (typeof existingCondition === 'function') return existingCondition(form);
                                return !!existingCondition;
                            };

                            if (!groupedUniformControls[groupId]) {
                                groupedUniformControls[groupId] = {
                                    id: groupId,
                                    groupKey,
                                    definition: groupDef,
                                    entries: []
                                };
                            }
                            groupedUniformControls[groupId].entries.push({ formKey, controlConfig });
                        };

                        const flushGroupedUniformControls = () => {
                            Object.values(groupedUniformControls)
                                .sort((a, b) => {
                                    const orderDiff = (a.definition.order || 0) - (b.definition.order || 0);
                                    return orderDiff || a.id.localeCompare(b.id);
                                })
                                .forEach(group => {
                                    const isOpen = isMaterialUniformGroupOpen(group.id, group.definition);
                                    form_config[group.groupKey] = {
                                        type: 'custom_checkbox',
                                        label: group.definition.label,
                                        value: isOpen,
                                        icon_size: '22px',
                                        layout: 'space_between',
                                        icon_on: 'expand_more',
                                        icon_off: 'chevron_right',
                                        icon_color_on: 'var(--color-accent)',
                                        icon_color_off: 'var(--color-subtle_text)',
                                        label_color: 'var(--color-text)',
                                        padding: '4px 8px',
                                        description: group.definition.label
                                    };

                                    group.entries.forEach(entry => {
                                        form_config[entry.formKey] = entry.controlConfig;
                                    });
                                });
                        };

                        /**
                         * @type {FancyShaderMaterial}
                         */
                        const baseMat = MaterialManager.materials[instance.baseMaterialId] || MaterialManager.materials['classic'];

                        for (let uniName in baseMat.uniforms) {
                            if (!instance.uniforms.hasOwnProperty(uniName)) {
                                instance.uniforms[uniName] = Object.assign({}, baseMat.uniforms[uniName]);
                            };
                            if (isSystemUniform(uniName)) continue; // Skip system uniforms
                            const uni = instance.uniforms[uniName];
                            if (uni.advanced === undefined) {
                                uni.advanced = !!(baseMat.uniforms[uniName] && baseMat.uniforms[uniName].advanced);
                            }
                            if (uni.advanced && !materialPropertiesShowAdvanced) continue;
                            if ((uni.expose || uniName === 'map') && !isSystemUniform(uniName)) {
                                const currentLang = (typeof Language !== 'undefined' && Language.code) ? Language.code : 'en';

                                // Resolve Label
                                let resolvedLabel = uniName;
                                if (uni.translations && uni.translations[currentLang]) {
                                    resolvedLabel = uni.translations[currentLang];
                                } else {
                                    const tlKey = 'shader_architect.uniform.' + uniName;
                                    const globalTl = tl(tlKey);
                                    if (globalTl !== tlKey) {
                                        resolvedLabel = globalTl;
                                    } else if (uni.translations && uni.translations['en']) {
                                        resolvedLabel = uni.translations['en'];
                                    }
                                }

                                // Resolve Description/Tooltip (title)
                                let resolvedDesc = '';
                                if (uni.translations && uni.translations[currentLang + '_desc']) {
                                    resolvedDesc = uni.translations[currentLang + '_desc'];
                                } else if (uni.description) {
                                    resolvedDesc = uni.description;
                                } else {
                                    const descKey = 'shader_architect.uniform.' + uniName + '.desc';
                                    const globalDesc = tl(descKey);
                                    if (globalDesc !== descKey) {
                                        resolvedDesc = globalDesc;
                                    } else if (uni.translations && uni.translations['en_desc']) {
                                        resolvedDesc = uni.translations['en_desc'];
                                    }
                                }

                                if (uni.type === 'float' || uni.type === 'int') {
                                    if (uni.min !== undefined && uni.max !== undefined) {
                                        addGroupedUniformControl(uniName, {
                                            type: 'combo_slider',
                                            label: resolvedLabel + ':',
                                            value: uni.value,
                                            min: uni.min,
                                            max: uni.max,
                                            step: uni.step ? uni.step : (uni.type === 'float') ? uni.min - uni.max * 0.1 : 1,
                                            resettable: true,
                                            reset_value: baseMat.uniforms[uniName] ? baseMat.uniforms[uniName].value : (uni.type === 'float' ? 0.0 : 0),
                                            color: (uni.type === 'float') ? 'var(--color-accent)' : 'var(--color-axis-y)',
                                            title: resolvedDesc || undefined,
                                            description: resolvedDesc || undefined
                                        }, uniName, uni);
                                    } else {
                                        addGroupedUniformControl(uniName, {
                                            type: 'number',
                                            label: resolvedLabel + ':',
                                            value: uni.value,
                                            step: uni.step !== undefined ? uni.step : (uni.type === 'float' ? 0.1 : 1),
                                            title: resolvedDesc || undefined,
                                            description: resolvedDesc || undefined
                                        }, uniName, uni);
                                    }
                                }
                                else if (uni.type === 'bool') {
                                    addGroupedUniformControl(uniName, {
                                        type: 'custom_checkbox',
                                        label: resolvedLabel + ':',
                                        value: uni.value,
                                        icon_size: '24px',
                                        layout: 'space_between',
                                        icon_on: 'check_circle',
                                        icon_off: 'progress_activity',
                                        icon_color_on: 'var(--color-axis-y)',
                                        icon_color_off: 'var(--color-axis-x)',
                                        title: resolvedDesc || undefined,
                                        description: resolvedDesc || undefined,
                                        padding_right: '32px'
                                    }, uniName, uni);
                                }
                                else if (uni.type === 'sampler2D') {
                                    addGroupedUniformControl(uniName + '_repeat', {
                                        type: 'custom_checkbox',
                                        label: (uniName === 'map' ? 'Repeat Texture' : resolvedLabel) + ':',
                                        value: !!uni.repeat,
                                        icon_size: '24px',
                                        layout: 'space_between',
                                        icon_on: 'check_circle',
                                        icon_off: 'progress_activity',
                                        icon_color_on: 'var(--color-axis-y)',
                                        icon_color_off: 'var(--color-axis-x)',
                                        title: resolvedDesc || undefined,
                                        description: resolvedDesc || undefined,
                                        padding_right: '32px'
                                    }, uniName, uni);
                                }
                                else if (MaterialManager.isColorUniformDefinition(uni)) {
                                    addGroupedUniformControl(uniName, {
                                        type: 'advanced_color',
                                        label: resolvedLabel + ':',
                                        value: MaterialManager.getUniformColorHex(uni),
                                        title: resolvedDesc || undefined,
                                        description: resolvedDesc || undefined
                                    }, uniName, uni);
                                }
                                else if (uni.type === 'vec2') {
                                    const val = uni.value || new THREE.Vector2(0, 0);
                                    const base_val = baseMat.uniforms[uniName] ? baseMat.uniforms[uniName].value : new THREE.Vector2(0, 0);
                                    addGroupedUniformControl(uniName, {
                                        type: 'custom_vector',
                                        label: resolvedLabel + ':',
                                        dimensions: 2,
                                        value: [val.x !== undefined ? parseFloat(val.x) || 0 : 0, val.y !== undefined ? parseFloat(val.y) || 0 : 0],
                                        description: resolvedDesc || undefined,
                                        ranges: baseMat.uniforms[uniName] && baseMat.uniforms[uniName].channels ? baseMat.uniforms[uniName].channels : undefined,
                                        resettable: true,
                                        default: [base_val.x !== undefined ? parseFloat(base_val.x) || 0 : 0, base_val.y !== undefined ? parseFloat(base_val.y) || 0 : 0]
                                    }, uniName, uni);
                                }
                                else if (uni.type === 'vec3') {
                                    const val = uni.value || new THREE.Vector3(0, 0, 0);
                                    const base_val = baseMat.uniforms[uniName] ? baseMat.uniforms[uniName].value : new THREE.Vector3(0, 0, 0);
                                    addGroupedUniformControl(uniName, {
                                        type: 'custom_vector',
                                        label: resolvedLabel + ':',
                                        dimensions: 3,
                                        value: [val.x !== undefined ? parseFloat(val.x) || 0 : 0, val.y !== undefined ? parseFloat(val.y) || 0 : 0, val.z !== undefined ? parseFloat(val.z) || 0 : 0],
                                        description: resolvedDesc || undefined,
                                        ranges: baseMat.uniforms[uniName] && baseMat.uniforms[uniName].channels ? baseMat.uniforms[uniName].channels : undefined,
                                        resettable: true,
                                        default: [base_val.x !== undefined ? parseFloat(base_val.x) || 0 : 0, base_val.y !== undefined ? parseFloat(base_val.y) || 0 : 0, base_val.z !== undefined ? parseFloat(base_val.z) || 0 : 0]
                                    }, uniName, uni);
                                }
                                else if (uni.type === 'vec4') {
                                    const val = uni.value || new THREE.Vector4(0, 0, 0, 1);
                                    const base_val = baseMat.uniforms[uniName] ? baseMat.uniforms[uniName].value : new THREE.Vector4(0, 0, 0, 1);
                                    addGroupedUniformControl(uniName, {
                                        type: 'custom_vector',
                                        label: resolvedLabel + ':',
                                        dimensions: 4,
                                        value: [
                                            val.x !== undefined ? parseFloat(val.x) || 0 : 0,
                                            val.y !== undefined ? parseFloat(val.y) || 0 : 0,
                                            val.z !== undefined ? parseFloat(val.z) || 0 : 0,
                                            val.w !== undefined ? parseFloat(val.w) || 0 : 0
                                        ],
                                        description: resolvedDesc || undefined,
                                        ranges: baseMat.uniforms[uniName] && baseMat.uniforms[uniName].channels ? baseMat.uniforms[uniName].channels : undefined,
                                        resettable: true,
                                        default: [
                                            base_val.x !== undefined ? parseFloat(base_val.x) || 0 : 0,
                                            base_val.y !== undefined ? parseFloat(base_val.y) || 0 : 0,
                                            base_val.z !== undefined ? parseFloat(base_val.z) || 0 : 0,
                                            base_val.w !== undefined ? parseFloat(base_val.w) || 0 : 0
                                        ]
                                    }, uniName, uni);
                                }
                            }
                        }

                        flushGroupedUniformControls();
                        material_properties.form.form_config = form_config;
                        material_properties.form.buildForm();
                    }
                    else {
                        material_properties.form.form_config = {
                            no_instance: {
                                type: 'bar_display',
                                value: tl(isFaceScope ? 'shader_architect.material_panel.no_face_instance' : 'shader_architect.material_panel.no_instance'),
                                icon: 'lock',
                                paragraph: false,
                                expand: true,
                                color: 'var(--color-text)'
                            }
                        };
                        material_properties.form.buildForm();
                    }
                }

                material_instance_properties_toolbar.update();
            };

            global_material_instance_text = new window.BarDisplay('sa_current_global_material', {
                icon: 'info',
                text: tl('shader_architect.material_panel.global_material'),
                expand: true,
                condition: () => { return !cubeHasMaterialInstance(getActiveMaterialScope()); }
            });

            create_material_instance = new Action('sa_create_material_instance', {
                name: 'shader_architect.material_panel.create_instance',
                description: 'shader_architect.material_panel.create_instance.desc',
                icon: 'masked_transitions_add',
                category: 'render',
                condition: cubeSelectedCondition,
                click() {
                    const dialog = new Dialog({
                        id: 'sa_create_material_instance_dialog',
                        title: 'shader_architect.material_panel.create_instance',
                        width: 500,
                        form: {
                            material_base: {
                                label: 'shader_architect.material_panel.base_material',
                                type: 'select',
                                options: getGlobalMaterialMenuOptions(),
                                value: 'sa_' + ShaderEngine.globalRenderMode,
                                description: 'shader_architect.material_panel.base_material.desc'
                            },
                            name: { label: 'shader_architect.material_panel.instance_name', type: 'text', value: tl('shader_architect.material_panel.new_instance_name') }
                        },
                        onConfirm: function (formResult) {
                            const cubes = getSelectedCubes();
                            if (cubes.length === 0) return;
                            const activeScope = getActiveMaterialScope();
                            const isFaceScope = isFaceMaterialScope(activeScope);

                            runMaterialInstanceUndo('shader_architect.material_panel.undo.create_instance', cubes, () => {
                                const selectedBase = typeof formResult.material_base === 'string'
                                    ? formResult.material_base
                                    : 'sa_' + ShaderEngine.globalRenderMode;
                                const baseMaterialId = selectedBase.indexOf('sa_') === 0
                                    ? selectedBase.slice(3)
                                    : selectedBase;
                                const materialInstance = MaterialManager.createInstance(baseMaterialId, { name: formResult.name });
                                if (!materialInstance) return;

                                cubes.forEach(cube => {
                                    if (isFaceScope) {
                                        MaterialManager.assignInstanceToCubeFace(cube, activeScope, materialInstance, { apply: false });
                                    } else {
                                        MaterialManager.assignInstanceToCube(cube, materialInstance, { apply: false });
                                    }
                                });
                            });
                            ShaderEngine.updateAllCubes('create_material_instance');
                            updateMaterialInstancePanel();
                            dialog.hide()
                        }
                    })
                    dialog.show()
                }
            });

            delete_material_instance = new Action('sa_delete_material_instance', {
                name: 'shader_architect.material_panel.delete_instance',
                description: 'shader_architect.material_panel.delete_instance.desc',
                icon: 'delete',
                category: 'render',
                condition: () => cubeHasMaterialInstance(getActiveMaterialScope()),
                click() {
                    const cubes = getSelectedCubes();
                    if (cubes.length === 0) return;
                    const activeScope = getActiveMaterialScope();
                    const instanceId = getSharedSelectedMaterialInstanceId(activeScope);
                    if (!instanceId || !MaterialManager.instances[instanceId]) return;
                    const affectedCubes = getCubesUsingMaterialInstanceId(instanceId);

                    runMaterialInstanceUndo('shader_architect.material_panel.undo.delete_instance', affectedCubes, () => {
                        MaterialManager.deleteInstance(instanceId);
                    });
                    updateMaterialInstancePanel();
                }
            });

            cube_material_instance = new CompactDropdownSelect('sa_cube_material_instance', {
                name: 'shader_architect.material_panel.instance',
                description: 'shader_architect.material_panel.instance.desc',
                options: {
                    global: { name: 'shader_architect.material_panel.global_material', icon: 'globe' }
                },
                condition: cubeSelectedCondition,
                onChange: function () {
                    if (this.value === '__mixed__') return;

                    const cubes = getSelectedCubes();
                    if (cubes.length === 0) return;

                    const activeScope = getActiveMaterialScope();
                    const isFaceScope = isFaceMaterialScope(activeScope);
                    const nextInstanceId = this.value;
                    const labelKey = nextInstanceId === 'global'
                        ? (isFaceScope ? 'shader_architect.material_panel.undo.clear_face_instance' : 'shader_architect.material_panel.undo.clear_instance')
                        : (isFaceScope ? 'shader_architect.material_panel.undo.assign_face_instance' : 'shader_architect.material_panel.undo.assign_instance');

                    runMaterialInstanceUndo(labelKey, cubes, () => {
                        cubes.forEach(cube => {
                            if (nextInstanceId === 'global') {
                                if (isFaceScope) {
                                    MaterialManager.clearMaterialInstanceFromCubeFace(cube, activeScope, { apply: false });
                                } else {
                                    MaterialManager.clearCubeMaterialAssignment(cube);
                                }
                            } else {
                                if (isFaceScope) {
                                    MaterialManager.assignInstanceToCubeFace(cube, activeScope, nextInstanceId, { apply: false });
                                } else {
                                    MaterialManager.assignInstanceToCube(cube, nextInstanceId, { apply: false });
                                }
                            }
                        });
                    });

                    ShaderEngine.updateAllCubes('update_instance');
                    updateMaterialInstancePanel();
                }
            });

            cube_face_material_instance = new HorizontalSelectWidget('sa_cube_face_material_instance', {
                expand: true, // Will fill the horizontal space of the toolbar
                bg_color: 'var(--color-back)', // Custom background color
                divider_color: 'var(--color-border)', // Custom color for the '|' dividers
                allow_empty: false, // Prevents deselecting the last active item
                value: 'element',

                options: {
                    element: {
                        //name: 'Element',
                        icon: 'view_in_ar',
                        color: 'var(--color-light)',
                        description: 'shader_architect.material_panel.face_scope.element'
                    },
                    north: {
                        name: 'N',
                        icon: 'north',
                        color: 'var(--color-axis-x)',
                        description: 'shader_architect.material_panel.face_scope.north'
                    },
                    south: {
                        name: 'S',
                        icon: 'south',
                        color: 'var(--color-axis-z)',
                        description: 'shader_architect.material_panel.face_scope.south'
                    },
                    east: {
                        name: 'E',
                        icon: 'east',
                        color: 'var(--color-axis-y)',
                        description: 'shader_architect.material_panel.face_scope.east'
                    },
                    west: {
                        name: 'W',
                        icon: 'west',
                        color: 'var(--color-axis-v)',
                        description: 'shader_architect.material_panel.face_scope.west'
                    },
                    up: {
                        //name: 'U',
                        icon: 'arrow_circle_up',
                        color: 'var(--color-axis-w)',
                        description: 'shader_architect.material_panel.face_scope.up'
                    },
                    down: {
                        //name: 'D',
                        icon: 'arrow_circle_down',
                        color: 'var(--color-axis-u)',
                        description: 'shader_architect.material_panel.face_scope.down'
                    }
                },

                onSelect: function (value) {
                    const nextScope = Array.isArray(value)
                        ? (value[value.length - 1] || ELEMENT_MATERIAL_SCOPE)
                        : (value || ELEMENT_MATERIAL_SCOPE);
                    const normalizedScope = nextScope === ELEMENT_MATERIAL_SCOPE
                        ? ELEMENT_MATERIAL_SCOPE
                        : (MaterialManager.normalizeCubeFaceName(nextScope) || ELEMENT_MATERIAL_SCOPE);

                    if (value !== normalizedScope || Array.isArray(value)) {
                        this.set(normalizedScope);
                    }
                    updateMaterialInstancePanel();
                }
            });
            cube_face_material_instance.set(ELEMENT_MATERIAL_SCOPE);

            cube_material_instance_name = new TextInputWidget('sa_material_instance_name', {
                name: 'shader_architect.material_panel.instance_name',
                placeholder: tl('shader_architect.material_panel.instance_name'),
                default_text: tl('shader_architect.material_panel.new_instance_name'),
                expand: true,
                condition: () => {
                    const cubes = getSelectedCubes();
                    if (cubes.length === 0) return false;
                    const activeScope = getActiveMaterialScope();
                    if (areMultipleSelected() && !allSelectedHaveSameMaterialInstance(activeScope)) return false;
                    return cubeHasMaterialInstance(activeScope);
                },

                onFinishEdit: (text, event) => {
                    const cubes = getSelectedCubes();
                    if (cubes.length === 0) return;
                    const firstCube = cubes[0];
                    const activeScope = getActiveMaterialScope();
                    const instanceId = getCubeMaterialInstanceId(firstCube, activeScope);
                    const instance = MaterialManager.instances[instanceId];
                    if (instance && instance.name !== text) {
                        runMaterialInstanceUndo('shader_architect.material_panel.undo.rename_instance', [], () => {
                            instance.name = text;
                            MaterialManager.saveMaterialInstances();
                        });
                        updateMaterialInstancePanel();
                    }
                }
            });

            material_instance_properties_toolbar = new Toolbar({
                id: 'sa_material_instance_properties',
                name: 'shader_architect.material_panel.title',
                label: true,
                condition: cubeSelectedCondition,
                children: [
                    'sa_cube_face_material_instance',
                    '#',
                    'sa_cube_material_instance',
                    'sa_current_global_material',
                    'sa_material_instance_name',
                    'sa_create_material_instance',
                    'sa_delete_material_instance'
                ]
            });
            deletables.push(create_material_instance, delete_material_instance, cube_material_instance, cube_face_material_instance, cube_material_instance_name, global_material_instance_text, material_instance_properties_toolbar);

            const getEventCause = (event) => event && typeof event === 'object' ? event.cause : event;
            const isProjectSwitching = () => !Project.parsed || Blockbench.hasFlag('switching_project');
            const skipMaterialPanelRefreshCauses = new Set(['project_update', 'select_project', 'rename_instance', 'update_form', 'sanitize_instances']);

            let materialPanelRenderListener = Blockbench.on('shader_update_complete', (event) => {
                if (isProjectSwitching()) return;
                const cause = getEventCause(event);
                if (skipMaterialPanelRefreshCauses.has(cause)) return;
                updateMaterialInstancePanel();
            });
            deletables.push(materialPanelRenderListener);

            let materialPanelSelectionListener = Blockbench.on('update_selection', () => {
                if (isProjectSwitching()) return;
                cube_face_material_instance.set(ELEMENT_MATERIAL_SCOPE);
                updateMaterialInstancePanel();
            });
            deletables.push(materialPanelSelectionListener);

            let materialInstancesListener = Blockbench.on('shader_architect_material_instances_changed', (event) => {
                if (isProjectSwitching()) return;
                const cause = getEventCause(event);
                if (cause === 'update_form' || cause === 'select_project' || cause === 'project_update') return;
                updateMaterialInstancePanel();
            });
            deletables.push(materialInstancesListener);

            material_properties = new Panel('material_properties', {
                icon: 'motion_mode',
                growable: true,
                resizable: true,
                condition: { modes: ['render'] },
                default_position: {
                    slot: "left_bar",
                    float_position: [
                        1322,
                        57
                    ],
                    float_size: [
                        314,
                        520
                    ],
                    height: 520,
                    folded: false,
                    fixed_height: false,
                    attached_to: "",
                    attached_index: 0,
                    sidebar_index: 1
                },
                mode_positions: {
                    render: {
                        slot: "left_bar",
                        float_position: [
                            1322,
                            57
                        ],
                        float_size: [
                            314,
                            520
                        ],
                        height: 520,
                        folded: false,
                        fixed_height: false,
                        attached_to: "",
                        attached_index: 0,
                        sidebar_index: 1
                    }
                },
                toolbars: [
                    material_instance_properties_toolbar
                ],
                form: {
                    no_cube_selected: {
                        type: 'bar_display',
                        value: tl('shader_architect.material_panel.no_selected'),
                        icon: 'deployed_code_alert',
                        paragraph: false,
                        expand: true,
                        color: 'var(--color-text)'
                    }
                }
            });

            material_properties.form.on('change', ({ result, changed_keys }) => {
                if (isProjectSwitching()) return;
                const advancedToggleKey = '_sa_show_advanced_uniforms';
                const nextShowAdvanced = result && Object.prototype.hasOwnProperty.call(result, advancedToggleKey)
                    ? !!result[advancedToggleKey]
                    : materialPropertiesShowAdvanced;
                const advancedModeChanged = nextShowAdvanced !== materialPropertiesShowAdvanced;
                materialPropertiesShowAdvanced = nextShowAdvanced;

                const cubes = getSelectedCubes();
                if (cubes.length === 0) return;
                const firstCube = cubes[0];
                const activeScope = getActiveMaterialScope();
                const instanceId = getCubeMaterialInstanceId(firstCube, activeScope);
                if (!instanceId || !MaterialManager.instances[instanceId]) return;
                const instance = MaterialManager.instances[instanceId];
                let uniformChanged = false;
                const keysToProcess = Array.isArray(changed_keys) && changed_keys.length
                    ? changed_keys
                    : Object.keys(result || {});

                for (let key of keysToProcess) {
                    if (key === advancedToggleKey) {
                        continue;
                    } else if (MaterialManager.isUniformGroupFormKey(key)) {
                        const groupId = MaterialManager.getUniformGroupIdFromFormKey(key);
                        materialPropertiesUniformGroupsOpen[groupId] = result[key] !== false;
                        continue;
                    } else if (key.endsWith('_x') || key.endsWith('_y') || key.endsWith('_z')) {
                        const baseKey = key.slice(0, -2);
                        const component = key.slice(-1);
                        if (instance.uniforms[baseKey]) {
                            const uni = instance.uniforms[baseKey];
                            if (!uni.value) {
                                if (uni.type === 'vec2') uni.value = new THREE.Vector2(0, 0);
                                else if (uni.type === 'vec3') uni.value = new THREE.Vector3(0, 0, 0);
                            }
                            uni.value[component] = Number(result[key]);
                            uniformChanged = true;
                        }
                    } else if (key.endsWith('_repeat')) {
                        const baseKey = key.slice(0, -7);
                        if (instance.uniforms[baseKey]) {
                            const uni = instance.uniforms[baseKey];
                            uni.repeat = !!result[key];
                            uniformChanged = true;
                        }
                    } else if (instance.uniforms[key]) {
                        const uni = instance.uniforms[key];
                        if (MaterialManager.isColorUniformDefinition(uni)) {
                            MaterialManager.syncColorUniformValue(uni, result[key]);
                        } else if (uni.type === 'float') {
                            uni.value = parseFloat(result[key]) || 0;
                        } else if (uni.type === 'int') {
                            uni.value = parseInt(result[key]) || 0;
                        } else if (uni.type === 'bool') {
                            uni.value = !!result[key];
                        } else if (uni.type === 'vec2') {
                            // Ensure the value is a THREE.Vector2.
                            if (!(uni.value instanceof THREE.Vector2)) {
                                uni.value = new THREE.Vector2(0, 0);
                            }
                            uni.value.x = parseFloat(result[key][0]) || 0;
                            uni.value.y = parseFloat(result[key][1]) || 0;
                        } else if (uni.type === 'vec3') {
                            // Ensure the value is a THREE.Vector3.
                            if (!(uni.value instanceof THREE.Vector3)) {
                                uni.value = new THREE.Vector3(0, 0, 0);
                            }
                            uni.value.x = parseFloat(result[key][0]) || 0;
                            uni.value.y = parseFloat(result[key][1]) || 0;
                            uni.value.z = parseFloat(result[key][2]) || 0;
                        } else if (uni.type === 'vec4') {
                            // Ensure the value is a THREE.Vector4.
                            if (!(uni.value instanceof THREE.Vector4)) {
                                uni.value = new THREE.Vector4(0, 0, 0, 0);
                            }
                            uni.value.x = parseFloat(result[key][0]) || 0;
                            uni.value.y = parseFloat(result[key][1]) || 0;
                            uni.value.z = parseFloat(result[key][2]) || 0;
                            uni.value.w = parseFloat(result[key][3]) || 0;
                        }

                        uniformChanged = true;
                    }
                }
                if (uniformChanged) {
                    MaterialManager.saveMaterialInstances({ cause: 'update_form' });
                    ShaderEngine.updateAllUniforms('update_form');
                }
                if (advancedModeChanged) updateMaterialInstancePanel();
            });

            const materialPanelStyle = Blockbench.addCSS(`
                #panel_material_properties .form {
                    overflow-y: auto !important;
                    overflow-x: hidden;
                }
                /* Match the native Blockbench scrollbar style. */
                #panel_material_properties .form::-webkit-scrollbar {
                    width: 6px;
                }
                #panel_material_properties .form::-webkit-scrollbar-thumb {
                    background-color: var(--color-button);
                    border-radius: 3px;
                }
                #panel_material_properties .dialog_bar[class*="form_bar__sa_uniform_group_"] {
                    margin-top: 7px;
                    padding: 0 !important;
                    background: rgba(255, 255, 255, 0.035) !important;
                    border: 1px solid var(--color-border);
                    border-radius: 4px;
                }
                #panel_material_properties .dialog_bar[class*="form_bar__sa_uniform_group_"] .custom_checkbox {
                    height: 28px !important;
                    font-weight: 600;
                }

            `);
            deletables.push(materialPanelStyle);

            deletables.push(material_properties);

            // MARK: Native event hooks
            const registerNativeListeners = () => {
                registerNativeMethodEvent(Texture.prototype, 'updateMaterial', 'texture_update_material', { mode: 'after' });
                let textureUpdateMaterialEvent = Blockbench.on('texture_update_material', () => {
                    if (!Project.parsed) return;
                    if (Blockbench.hasFlag('switching_project')) return;
                    ShaderEngine.requestSceneUpdate('texture_update_material');
                });
                deletables.push(textureUpdateMaterialEvent);

                registerNativeMethodEvent(Texture.prototype, 'apply', 'texture_apply', { mode: 'after' });
                let textureApplyEvent = Blockbench.on('texture_apply', () => {
                    if (!Project.parsed) return;
                    if (Blockbench.hasFlag('switching_project')) return;
                    ShaderEngine.requestSceneUpdate('texture_apply');
                });
                deletables.push(textureApplyEvent);

                registerNativeMethodEvent(Canvas, 'updateLayeredTextures', 'canvas_update_layered_textures', { mode: 'after' });
                let canvasLayeredTextureEvent = Blockbench.on('canvas_update_layered_textures', () => {
                    if (!Project.parsed) return;
                    if (Blockbench.hasFlag('switching_project')) return;
                    ShaderEngine.requestSceneUpdate('canvas_update_layered_textures');
                });
                deletables.push(canvasLayeredTextureEvent);

                registerNativeMethodEvent(Canvas, 'updateAllFaces', 'canvas_update_all_faces', { mode: 'after' });
                let canvasUpdateEvent = Blockbench.on('canvas_update_all_faces', () => {
                    if (!Project.parsed) return;
                    if (Blockbench.hasFlag('switching_project')) return;
                    ShaderEngine.requestSceneUpdate('canvas_update_all_faces');
                });
                deletables.push(canvasUpdateEvent);

                registerNativeMethodEvent(Canvas, 'updateRenderSides', 'canvas_update_render_sides', { mode: 'after' });
                let canvasRenderSidesEvent = Blockbench.on('canvas_update_render_sides', () => {
                    if (!Project.parsed) return;
                    if (Blockbench.hasFlag('switching_project')) return;
                    ShaderEngine.requestSceneUpdate('canvas_update_render_sides');
                });
                deletables.push(canvasRenderSidesEvent);

                let cubeUvUpdateEvent = Cube.preview_controller.on('update_uv', () => {
                    if (!Project.parsed) return;
                    if (Blockbench.hasFlag('switching_project')) return;

                    if (window.TextureAnimator && window.TextureAnimator.isPlaying) {
                        ShaderEngine.requestPreviewRender({ cause: 'texture_animation_frame' });
                        return;
                    }

                    ShaderEngine.requestSceneUpdate('cube_update_uv');
                });
                deletables.push(cubeUvUpdateEvent);

                let cubeFaceUpdateEvent = Cube.preview_controller.on('update_faces', () => {
                    if (!Project.parsed) return;
                    if (Blockbench.hasFlag('switching_project')) return;
                    ShaderEngine.requestSceneUpdate('cube_update_faces');
                });
                deletables.push(cubeFaceUpdateEvent);

                // Project event hooks to auto-update
                let addCubeEvent = Blockbench.on('add_cube', (event) => {
                    if (!Project.parsed) return;
                    if (Blockbench.hasFlag('switching_project')) return;
                    if (event.object && event.object.mesh) {
                        let shader = MaterialManager.resolveCubeMaterial(event.object, ShaderEngine.globalRenderMode);
                        ShaderEngine.applyToMesh(event.object, shader || MaterialManager.materials['classic']);
                        ShaderEngine.updateLightUniforms();
                    }
                });
                deletables.push(addCubeEvent);

                let transformEvent = Blockbench.on('update_transform', () => {
                    ShaderEngine.requestLightUniformUpdate('update_transform');
                });
                deletables.push(transformEvent);

                const updateProjectEvent = (project) => {
                    if (!Project.parsed) return;
                    if (!project) project = MaterialManager.getActiveProject();
                    MaterialManager.syncMaterialInstancesFromProject(project);
                    ShaderEngine.requestSceneUpdate('project_update');
                };

                let onParseProjectEvent = Codecs.project.on('parse', () => {
                    Project.parsed = false;
                    const projectInstancesProp = MaterialManager.registerProjectMaterialInstanceProperty();
                    if (projectInstancesProp && !deletables.includes(projectInstancesProp)) {
                        deletables.push(projectInstancesProp);
                    }
                });

                deletables.push(onParseProjectEvent);

                let loadProjectEvent = Codecs.project.on('parsed', () => {
                    Project.parsed = true;
                    updateProjectEvent();
                });

                deletables.push(loadProjectEvent);

                let selectProjectEvent = Blockbench.on('select_project', (args) => {
                    updateProjectEvent(args.project);
                });

                deletables.push(selectProjectEvent);

                let updateSelectionEvent = Blockbench.on('update_selection', () => {
                    if (!Project.parsed) return;
                    if (Blockbench.hasFlag('switching_project')) return;
                    ShaderEngine.requestSceneUpdate('update_selection');
                });

                deletables.push(updateSelectionEvent);
            };
            registerNativeListeners();
        },

        onunload() {
            ShaderEngine.stopAnimationLoop();
            MinecraftPromotionalSilhouetteManager.dispose();
            ScreenSpaceReflectionManager.dispose();
            if (ShaderEngine._transparentFallbackMap && typeof ShaderEngine._transparentFallbackMap.dispose === 'function') {
                ShaderEngine._transparentFallbackMap.dispose();
                ShaderEngine._transparentFallbackMap = null;
            }
            if (ShaderEngine._fallbackMap && typeof ShaderEngine._fallbackMap.dispose === 'function') {
                ShaderEngine._fallbackMap.dispose();
                ShaderEngine._fallbackMap = null;
            }

            if (styleEl && styleEl.parentElement) {
                styleEl.parentElement.removeChild(styleEl);
            }

            // Remove outliner actions if they exist
            if (Menu.menus.outliner_cube) {
                let idxA = Menu.menus.outliner_cube.structure.indexOf('sa_apply_override');
                if (idxA > -1) Menu.menus.outliner_cube.structure.splice(idxA, 1);
                let idxC = Menu.menus.outliner_cube.structure.indexOf('sa_clear_override');
                if (idxC > -1) Menu.menus.outliner_cube.structure.splice(idxC, 1);
            }

            disposeTrackedResources();

            Cube.all.forEach(cube => {
                if (cube.mesh && cube.mesh.material) {
                    ShaderEngine.getMaterialList(cube.mesh.material).forEach(mat => {
                        mat.vertexShader = undefined;
                        mat.fragmentShader = undefined;
                        mat.needsUpdate = true;
                    });
                }
            });

            if (window.ShaderEngine === ShaderEngine) delete window.ShaderEngine;
            if (window.MaterialManager === MaterialManager) delete window.MaterialManager;
            if (window.FancyShaderMaterial === FancyShaderMaterial) delete window.FancyShaderMaterial;
            if (window.FancyShaderMaterialInstance === FancyShaderMaterialInstance) delete window.FancyShaderMaterialInstance;
            if (window.ScreenSpaceReflectionManager === ScreenSpaceReflectionManager) delete window.ScreenSpaceReflectionManager;
            if (window.MinecraftPromotionalSilhouetteManager === MinecraftPromotionalSilhouetteManager) delete window.MinecraftPromotionalSilhouetteManager;

            styleEl = undefined;
            renderModeSelector = undefined;
            material_properties = undefined;
            cube_material_instance = undefined;
            cube_material_instance_name = undefined;
            cube_face_material_instance = undefined;
            material_instance_properties_toolbar = undefined;
            create_material_instance = undefined;
            delete_material_instance = undefined;
            global_material_instance_text = undefined;
        }
    });

})();
