/**
 * @typedef {Object} IconOptions
 * @property {string} [fontFamily='Material Icons'] - The CSS font-family name for the icons.
 * @property {string}[color='rgba(0, 0, 0, 1)'] - CSS color string (hex, rgb, rgba).
 * @property {string} [format='image/png'] - The output image MIME type.
 * @property {number} [quality=1.0] - Image quality for lossy formats (0.0 to 1.0).
 */

/**
 * Converts a font icon ligature or code into a Base64 encoded PNG/WebP.
 * @param {string} iconName - The name/ligature of the icon (e.g., 'settings').
 * @param {number} size - The square dimension of the output in pixels.
 * @param {IconOptions} [options={}] - Configuration for styling and output.
 * @returns {Promise<string>} A promise that resolves to the Base64 data URL.
 * @throws {Error} If the font fails to load or canvas context cannot be initialized.
 */
async function generateIconBase64(iconName, size, {
    fontFamily = 'Material Icons',
    color = 'rgba(0, 0, 0, 1)',
    format = 'image/png',
    quality = 1.0
} = {}) {
    // 1. Validation & Font Loading
    try {
        await document.fonts.load(`${size}px "${fontFamily}"`);
    } catch (error) {
        throw new Error(`Failed to load font family: ${fontFamily}`);
    }

    // 2. Canvas Setup
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Canvas 2D context is not supported.');
    }

    // 3. Rendering Logic
    ctx.clearRect(0, 0, size, size); // Ensure background is fully transparent
    ctx.fillStyle = color;
    ctx.font = `${size}px "${fontFamily}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw icon at the center of the canvas
    ctx.fillText(iconName, size / 2, size / 2);

    // 4. Export
    return canvas.toDataURL(format, quality);
}

window.generateIconBase64 = generateIconBase64;

const LIGHT_MANAGER_STORAGE_KEYS = {
    areaGizmos: 'light_manager_show_area_gizmos'
};

const LIGHT_MANAGER_SHADOW_RESOLUTIONS = [256, 512, 1024, 2048, 4096];

const DEFAULT_SHADOW_BIAS = -0.0005;
const DEFAULT_SHADOW_NORMAL_BIAS = 0.02;

const LIGHT_MANAGER_PROFILES = {
    keep: null,
    point_fill: {
        light_type: 'point',
        intensity: 1.4,
        distance: 18,
        angle: 45,
        penumbra: 0,
        has_shadow: true,
        shadow_resolution: 1024,
        shadow_bias: DEFAULT_SHADOW_BIAS,
        shadow_normal_bias: DEFAULT_SHADOW_NORMAL_BIAS,
        shadow_near: 0.05,
        shadow_far: 24,
        shadow_bounds: 35
    },
    spot_key: {
        light_type: 'spot',
        intensity: 2.5,
        distance: 28,
        angle: 32,
        penumbra: 0.35,
        has_shadow: true,
        shadow_resolution: 1024,
        shadow_bias: DEFAULT_SHADOW_BIAS,
        shadow_normal_bias: DEFAULT_SHADOW_NORMAL_BIAS,
        shadow_near: 0.1,
        shadow_far: 32,
        shadow_bounds: 35
    },
    directional_sun: {
        light_type: 'directional',
        intensity: 1.0,
        distance: 0,
        angle: 45,
        penumbra: 0,
        has_shadow: true,
        shadow_resolution: 2048,
        shadow_bias: DEFAULT_SHADOW_BIAS,
        shadow_normal_bias: DEFAULT_SHADOW_NORMAL_BIAS,
        shadow_near: 0.1,
        shadow_far: 240,
        shadow_bounds: 48
    },
    minecraft_optimized: {
        light_type: 'directional',
        intensity: 1.2,
        distance: 0,
        angle: 45,
        penumbra: 0,
        has_shadow: true,
        shadow_resolution: 2048,
        shadow_bias: -0.0005,
        shadow_normal_bias: 0.02,
        shadow_near: 0.1,
        shadow_far: 200,
        shadow_bounds: 64
    }
};

const LIGHT_MANAGER_SHADOW_PRESETS = {
    custom: null,
    off: { has_shadow: false },
    preview: { has_shadow: true, shadow_resolution: 512, shadow_bias: -0.0005, shadow_normal_bias: 0.02 },
    balanced: { has_shadow: true, shadow_resolution: 1024, shadow_bias: -0.0005, shadow_normal_bias: 0.02 },
    crisp: { has_shadow: true, shadow_resolution: 2048, shadow_bias: -0.0005, shadow_normal_bias: 0.02 },
    minecraft: { has_shadow: true, shadow_resolution: 2048, shadow_bias: -0.0005, shadow_normal_bias: 0.02, shadow_near: 0.1, shadow_far: 200, shadow_bounds: 64 },
};

function lightManagerSafeGet(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
    } catch (error) {
        return fallback;
    }
}

function lightManagerSafeSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (error) {
        // Storage can be unavailable in restricted contexts; the plugin should still work.
    }
}

function lightManagerFallbackIconDataUrl(label, color = '#ffffff') {
    const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">',
        '<rect width="128" height="128" rx="28" fill="rgba(0,0,0,0)"/>',
        `<circle cx="64" cy="64" r="38" fill="none" stroke="${color}" stroke-width="10"/>`,
        `<text x="64" y="74" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="${color}">${label}</text>`,
        '</svg>'
    ].join('');
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const LightManagerUtils = {
    num(value, fallback = 0, min = -Infinity, max = Infinity) {
        const parsed = Number(value);
        const safe = Number.isFinite(parsed) ? parsed : fallback;
        return Math.max(min, Math.min(max, safe));
    },

    int(value, fallback = 0, min = -Infinity, max = Infinity) {
        return Math.round(this.num(value, fallback, min, max));
    },

    bool(value, fallback = false) {
        if (typeof value === 'boolean') return value;
        if (value === 'true') return true;
        if (value === 'false') return false;
        return fallback;
    },

    lightType(value) {
        return ['point', 'directional', 'spot'].includes(value) ? value : 'point';
    },

    shadowResolution(value) {
        const parsed = this.int(value, 1024, 1);
        return LIGHT_MANAGER_SHADOW_RESOLUTIONS.includes(parsed) ? parsed : 1024;
    },

    colorArray(value, fallback = [255, 255, 255]) {
        const source = Array.isArray(value) ? value : fallback;
        return [
            this.int(source[0], fallback[0], 0, 255),
            this.int(source[1], fallback[1], 0, 255),
            this.int(source[2], fallback[2], 0, 255)
        ];
    },

    colorHex(value) {
        const color = this.colorArray(value);
        if (typeof tinycolor === 'function') {
            return tinycolor({ r: color[0], g: color[1], b: color[2] }).toHexString();
        }
        return `#${color.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
    },

    colorFromHex(value, fallback = [255, 255, 255]) {
        if (typeof tinycolor === 'function') {
            const color = tinycolor(value);
            if (color.isValid()) {
                const rgb = color.toRgb();
                return [rgb.r, rgb.g, rgb.b];
            }
        }

        if (typeof value === 'string') {
            const match = value.trim().match(/^#?([0-9a-f]{6})$/i);
            if (match) {
                return [
                    parseInt(match[1].slice(0, 2), 16),
                    parseInt(match[1].slice(2, 4), 16),
                    parseInt(match[1].slice(4, 6), 16)
                ];
            }
        }

        return this.colorArray(fallback);
    },

    resolveConfig(formResult, currentLight) {
        const base = {
            light_type: formResult.light_type,
            color: this.colorFromHex(formResult.color, currentLight?.color),
            intensity: formResult.intensity,
            distance: formResult.distance,
            angle: formResult.angle,
            penumbra: formResult.penumbra,
            has_shadow: formResult.has_shadow,
            shadow_resolution: formResult.shadow_resolution,
            shadow_bias: formResult.shadow_bias,
            shadow_normal_bias: formResult.shadow_normal_bias,
            shadow_near: formResult.shadow_near,
            shadow_far: formResult.shadow_far,
            shadow_bounds: formResult.shadow_bounds
        };

        const profile = LIGHT_MANAGER_PROFILES[formResult.profile];
        const shadowPreset = LIGHT_MANAGER_SHADOW_PRESETS[formResult.shadow_preset];

        return this.sanitizeConfig({
            ...base,
            ...(profile || {}),
            ...(shadowPreset || {}),
            color: base.color
        });
    },

    sanitizeConfig(config = {}) {
        const light_type = this.lightType(config.light_type);
        const shadow_near = this.num(config.shadow_near, 0.1, 0, 99999);
        const shadow_far = Math.max(shadow_near + 0.001, this.num(config.shadow_far, 200, 0.001, 100000));

        return {
            light_type,
            color: this.colorArray(config.color),
            intensity: this.num(config.intensity, 1, 0, 100000),
            distance: this.num(config.distance, 0, 0, 100000),
            angle: this.num(config.angle, 45, 0.1, 89.9),
            penumbra: this.num(config.penumbra, 0, 0, 1),
            has_shadow: this.bool(config.has_shadow, true),
            shadow_resolution: this.shadowResolution(config.shadow_resolution),
            shadow_bias: this.num(config.shadow_bias, DEFAULT_SHADOW_BIAS, -1, 1),
            shadow_normal_bias: this.num(config.shadow_normal_bias, DEFAULT_SHADOW_NORMAL_BIAS, -1, 1),
            shadow_near,
            shadow_far,
            shadow_bounds: this.num(config.shadow_bounds, 35, 0.001, 100000)
        };
    },

    sanitizeLight(light) {
        if (!light) return null;
        const config = this.sanitizeConfig(light);
        Object.assign(light, config);
        light.render_color = this.colorArray(light.render_color || light.color, config.color);
        light.render_intensity = this.num(light.render_intensity ?? light.intensity, config.intensity, 0, 100000);
        if (!Array.isArray(light.rotation)) light.rotation = [0, 0, 0];
        if (!Array.isArray(light.render_rotation)) light.render_rotation = light.rotation.slice();
        return light;
    },

    applyConfig(light, config) {
        if (!light) return;
        Object.assign(light, this.sanitizeConfig(config));
        light.render_color = light.color.slice();
        light.render_intensity = light.intensity;
        light.render_rotation = Array.isArray(light.rotation) ? light.rotation.slice() : [0, 0, 0];
    }
};



window.three_lights = window.three_lights || {};

function configureLightManagerRendererShadows(renderer) {
    if (!renderer || !renderer.shadowMap) return false;

    let changed = false;
    if (renderer.shadowMap.enabled !== true) {
        renderer.shadowMap.enabled = true;
        changed = true;
    }

    const shadowType = THREE.PCFSoftShadowMap || THREE.PCFShadowMap || renderer.shadowMap.type;
    if (shadowType !== undefined && renderer.shadowMap.type !== shadowType) {
        renderer.shadowMap.type = shadowType;
        changed = true;
    }

    if (renderer.shadowMap.autoUpdate === false) {
        renderer.shadowMap.needsUpdate = true;
    }

    return changed;
}

function forEachLightManagerPreview(callback) {
    const previews = new Set();

    if (window.Preview && Array.isArray(Preview.all)) {
        Preview.all.forEach(preview => {
            if (preview) previews.add(preview);
        });
    }

    [window.main_preview, window.MediaPreview, window.Screencam?.NoAAPreview].forEach(preview => {
        if (preview) previews.add(preview);
    });

    previews.forEach(callback);
}

function configureLightManagerRenderers() {
    forEachLightManagerPreview(preview => {
        configureLightManagerRendererShadows(preview.renderer);
    });
}

function configureLightManagerSceneShadowMeshes() {
    const elements = Array.isArray(window.Outliner?.elements) ? window.Outliner.elements : [];

    elements.forEach(element => {
        if (!element || element.type === 'light' || (window.LightElement && element instanceof window.LightElement)) return;

        const mesh = element.mesh;
        if (!mesh || typeof mesh.traverse !== 'function') return;

        mesh.traverse(object => {
            if (!object || object.isLight || object.isCamera) return;
            if (object.isMesh) {
                object.castShadow = true;
                object.receiveShadow = true;
            }
        });
    });
}

function invalidateLightManagerShadowMaps() {
    Object.keys(window.three_lights || {}).forEach(uuid => {
        const light = window.three_lights[uuid];
        if (light && light.shadow) {
            light.shadow.needsUpdate = true;
        }
    });

    forEachLightManagerPreview(preview => {
        if (preview?.renderer?.shadowMap) {
            preview.renderer.shadowMap.needsUpdate = true;
        }
    });
}

window.LightManagerPrepareRender = function LightManagerPrepareRender(preview) {
    if (preview?.renderer) {
        configureLightManagerRendererShadows(preview.renderer);
    } else {
        configureLightManagerRenderers();
    }

    configureLightManagerSceneShadowMeshes();
    invalidateLightManagerShadowMaps();
};

function registerLightManagerCanvasGizmo(object) {
    if (!object || !window.Canvas || !Array.isArray(Canvas.gizmos)) return;
    if (!Canvas.gizmos.includes(object)) Canvas.gizmos.push(object);
}

function unregisterLightManagerCanvasGizmo(object) {
    if (!object || !window.Canvas || !Array.isArray(Canvas.gizmos)) return;
    const index = Canvas.gizmos.indexOf(object);
    if (index >= 0) Canvas.gizmos.splice(index, 1);
}

if (window.LightManagerAreaGizmos && typeof window.LightManagerAreaGizmos.clear === 'function') {
    window.LightManagerAreaGizmos.clear();
}

window.LightManagerAreaGizmos = {
    enabled: lightManagerSafeGet(LIGHT_MANAGER_STORAGE_KEYS.areaGizmos, 'true') !== 'false',
    helpers: new Map(),
    group: null,

    getGroup() {
        if (!window.scene || !this.enabled) return null;
        if (!this.group || this.group.parent !== window.scene) {
            if (this.group && this.group.parent) this.group.parent.remove(this.group);
            this.group = new THREE.Group();
            this.group.name = 'light_manager_area_gizmos';
            this.group.raycast = () => { };
            window.scene.add(this.group);
        }
        registerLightManagerCanvasGizmo(this.group);
        return this.group;
    },

    num(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    },

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    },

    pushLine(vertices, ax, ay, az, bx, by, bz) {
        vertices.push(ax, ay, az, bx, by, bz);
    },

    pushCircle(vertices, radius, z, plane = 'xy', segments = 64) {
        for (let i = 0; i < segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            const b = ((i + 1) / segments) * Math.PI * 2;
            const ax = Math.cos(a) * radius;
            const ay = Math.sin(a) * radius;
            const bx = Math.cos(b) * radius;
            const by = Math.sin(b) * radius;

            if (plane === 'xy') this.pushLine(vertices, ax, ay, z, bx, by, z);
            else if (plane === 'xz') this.pushLine(vertices, ax, z, ay, bx, z, by);
            else this.pushLine(vertices, z, ax, ay, z, bx, by);
        }
    },

    buildDirectionalVertices(element) {
        const bounds = Math.max(0.001, this.num(element.shadow_bounds, 35));
        const near = Math.max(0, this.num(element.shadow_near, 0.1));
        const far = Math.max(near + 0.001, this.num(element.shadow_far, 200));
        const zn = -near;
        const zf = -far;
        const vertices = [];
        const corners = [
            [-bounds, -bounds, zn], [bounds, -bounds, zn],
            [bounds, bounds, zn], [-bounds, bounds, zn],
            [-bounds, -bounds, zf], [bounds, -bounds, zf],
            [bounds, bounds, zf], [-bounds, bounds, zf]
        ];
        const edges = [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7]
        ];

        edges.forEach(edge => {
            const a = corners[edge[0]];
            const b = corners[edge[1]];
            this.pushLine(vertices, a[0], a[1], a[2], b[0], b[1], b[2]);
        });

        this.pushLine(vertices, 0, 0, zn, 0, 0, zf);
        this.pushLine(vertices, -bounds, 0, zf, bounds, 0, zf);
        this.pushLine(vertices, 0, -bounds, zf, 0, bounds, zf);
        return vertices;
    },

    getRange(element, fallback = 8) {
        const distance = this.num(element.distance, 0);
        if (distance > 0) return distance;
        if (element.has_shadow !== false) return Math.max(0.001, this.num(element.shadow_far, fallback));
        return fallback;
    },

    buildSpotVertices(element) {
        const range = Math.max(0.001, this.getRange(element, 8));
        const angle = THREE.MathUtils.degToRad(this.clamp(this.num(element.angle, 45), 0.1, 89.9));
        const radius = Math.tan(angle) * range;
        const vertices = [];
        const segments = 64;

        this.pushCircle(vertices, radius, -range, 'xy', segments);

        const spokes = 8;
        for (let i = 0; i < spokes; i++) {
            const theta = (i / spokes) * Math.PI * 2;
            const x = Math.cos(theta) * radius;
            const y = Math.sin(theta) * radius;
            this.pushLine(vertices, 0, 0, 0, x, y, -range);
        }

        if (element.has_shadow !== false) {
            const near = this.clamp(this.num(element.shadow_near, 0.1), 0, Math.max(0, range - 0.001));
            if (near > 0.001) {
                this.pushCircle(vertices, Math.tan(angle) * near, -near, 'xy', 32);
            }
        }

        return vertices;
    },

    buildPointVertices(element) {
        const radius = Math.max(0.001, this.getRange(element, Math.max(4, Math.sqrt(this.num(element.render_intensity ?? element.intensity, 1)) * 4)));
        const vertices = [];
        this.pushCircle(vertices, radius, 0, 'xy', 64);
        this.pushCircle(vertices, radius, 0, 'xz', 64);
        this.pushCircle(vertices, radius, 0, 'yz', 64);
        return vertices;
    },

    buildVertices(element) {
        if (element.light_type === 'directional') return this.buildDirectionalVertices(element);
        if (element.light_type === 'spot') return this.buildSpotVertices(element);
        return this.buildPointVertices(element);
    },

    getSignature(element) {
        return [
            element.light_type || 'point',
            this.num(element.distance, 0),
            this.num(element.angle, 45),
            this.num(element.shadow_near, 0.1),
            this.num(element.shadow_far, 200),
            this.num(element.shadow_bounds, 35),
            element.has_shadow !== false ? 1 : 0,
            this.num(element.render_intensity ?? element.intensity, 1)
        ].join('|');
    },

    getColor01(element) {
        const spriteColor = element.mesh?.sprite?.material?.color;
        if (spriteColor) return [spriteColor.r, spriteColor.g, spriteColor.b];

        const color = element.render_color || element.color || [255, 255, 255];
        return [
            this.clamp(this.num(color[0], 255) / 255, 0, 1),
            this.clamp(this.num(color[1], 255) / 255, 0, 1),
            this.clamp(this.num(color[2], 255) / 255, 0, 1)
        ];
    },

    createHelper(element, group) {
        const root = new THREE.Object3D();
        root.name = `light_area_${element.uuid}`;
        root.raycast = () => { };
        root.renderOrder = 999;

        const material = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.28,
            depthTest: false,
            depthWrite: false
        });

        const line = new THREE.LineSegments(new THREE.BufferGeometry(), material);
        line.name = `light_area_lines_${element.uuid}`;
        line.raycast = () => { };
        root.add(line);
        group.add(root);

        const helper = { root, line, material, signature: '' };
        this.helpers.set(element.uuid, helper);
        return helper;
    },

    updateHelper(element, group) {
        if (!element || !element.uuid || !element.mesh) return;

        let helper = this.helpers.get(element.uuid);
        if (!helper) helper = this.createHelper(element, group);
        if (helper.root.parent !== group) group.add(helper.root);

        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        element.mesh.getWorldPosition(worldPos);
        element.mesh.getWorldQuaternion(worldQuat);
        helper.root.position.copy(worldPos);
        helper.root.quaternion.copy(worldQuat);
        helper.root.scale.setScalar(1);
        helper.root.visible = element.visibility !== false;

        const color = this.getColor01(element);
        helper.material.color.setRGB(color[0], color[1], color[2]);
        helper.material.opacity = element.selected ? 0.72 : 0.26;
        helper.material.needsUpdate = true;

        const signature = this.getSignature(element);
        if (helper.signature !== signature) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.buildVertices(element), 3));
            helper.line.geometry.dispose();
            helper.line.geometry = geometry;
            helper.signature = signature;
        }
    },

    destroyHelper(uuid) {
        const helper = this.helpers.get(uuid);
        if (!helper) return;
        if (helper.root && helper.root.parent) helper.root.parent.remove(helper.root);
        if (helper.line && helper.line.geometry) helper.line.geometry.dispose();
        if (helper.material) helper.material.dispose();
        this.helpers.delete(uuid);
    },

    updateAll() {
        if (!this.enabled) {
            this.clear();
            return;
        }

        const lights = (window.LightElement && Array.isArray(window.LightElement.all)) ? window.LightElement.all : [];
        const group = this.getGroup();
        if (!group) return;

        const active = new Set();
        lights.forEach(element => {
            active.add(element.uuid);
            this.updateHelper(element, group);
        });

        Array.from(this.helpers.keys()).forEach(uuid => {
            if (!active.has(uuid)) this.destroyHelper(uuid);
        });
    },

    clear() {
        Array.from(this.helpers.keys()).forEach(uuid => this.destroyHelper(uuid));
        unregisterLightManagerCanvasGizmo(this.group);
        if (this.group && this.group.parent) this.group.parent.remove(this.group);
        this.group = null;
    },

    setEnabled(enabled) {
        this.enabled = !!enabled;
        lightManagerSafeSet(LIGHT_MANAGER_STORAGE_KEYS.areaGizmos, this.enabled ? 'true' : 'false');
        if (this.enabled) this.updateAll();
        else this.clear();
    },

    toggle() {
        this.setEnabled(!this.enabled);
        return this.enabled;
    }
};

window.LightManagerFitTool = {
    getSelectedLights() {
        if (!window.LightElement || !Array.isArray(window.LightElement.selected)) return [];
        return window.LightElement.selected.filter(light => light && light.mesh);
    },

    addSelectionList(target, list) {
        if (!list) return;
        if (Array.isArray(list)) {
            list.forEach(item => target.push(item));
        } else if (typeof list[Symbol.iterator] === 'function') {
            Array.from(list).forEach(item => target.push(item));
        } else {
            target.push(list);
        }
    },

    getRawSelection() {
        const nodes = [];

        if (typeof selected !== 'undefined') this.addSelectionList(nodes, selected);
        if (typeof Cube !== 'undefined') this.addSelectionList(nodes, Cube.selected);
        if (typeof Group !== 'undefined') this.addSelectionList(nodes, Group.selected);
        if (typeof Mesh !== 'undefined') this.addSelectionList(nodes, Mesh.selected);
        if (typeof Locator !== 'undefined') this.addSelectionList(nodes, Locator.selected);
        if (typeof NullObject !== 'undefined') this.addSelectionList(nodes, NullObject.selected);

        return nodes.filter(Boolean);
    },

    isLightNode(node) {
        return !!node && (
            node.type === 'light' ||
            (window.LightElement && node instanceof window.LightElement)
        );
    },

    addTargetNode(node, target, seen) {
        if (!node || this.isLightNode(node)) return;

        const key = node.uuid || node;
        if (seen.has(key)) return;
        seen.add(key);

        if (node.mesh) target.push(node);

        if (Array.isArray(node.children)) {
            node.children.forEach(child => this.addTargetNode(child, target, seen));
        }
    },

    getSelectedTargets() {
        const targets = [];
        const seen = new Set();

        this.getRawSelection().forEach(node => this.addTargetNode(node, targets, seen));

        return targets;
    },

    canFit() {
        return this.getSelectedLights().length > 0 && this.getSelectedTargets().length > 0;
    },

    collectObjectPoints(object, points) {
        if (!object) return;
        if (typeof object.updateMatrixWorld === 'function') object.updateMatrixWorld(true);

        const startCount = points.length;
        const visit = child => {
            if (!child || child.type === 'Sprite') return;
            if (!child.geometry || !child.geometry.attributes || !child.geometry.attributes.position) return;

            if (typeof child.updateMatrixWorld === 'function') child.updateMatrixWorld(true);
            const position = child.geometry.attributes.position;
            for (let i = 0; i < position.count; i++) {
                points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld));
            }
        };

        if (typeof object.traverse === 'function') object.traverse(visit);
        else visit(object);

        if (points.length !== startCount) return;

        if (!object.isObject3D) return;

        const box = new THREE.Box3().setFromObject(object);
        if (box.isEmpty()) return;

        const min = box.min;
        const max = box.max;
        points.push(
            new THREE.Vector3(min.x, min.y, min.z),
            new THREE.Vector3(max.x, min.y, min.z),
            new THREE.Vector3(max.x, max.y, min.z),
            new THREE.Vector3(min.x, max.y, min.z),
            new THREE.Vector3(min.x, min.y, max.z),
            new THREE.Vector3(max.x, min.y, max.z),
            new THREE.Vector3(max.x, max.y, max.z),
            new THREE.Vector3(min.x, max.y, max.z)
        );
    },

    collectTargetPoints(targets) {
        const points = [];
        targets.forEach(target => this.collectObjectPoints(target.mesh, points));
        return points;
    },

    getPointsBox(points) {
        const box = new THREE.Box3();
        points.forEach(point => box.expandByPoint(point));
        return box;
    },

    getLightBasis(light) {
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        light.mesh.updateMatrixWorld(true);
        light.mesh.getWorldPosition(position);
        light.mesh.getWorldQuaternion(quaternion);
        return { position, quaternion, inverse: quaternion.clone().invert() };
    },

    getLightSpacePoints(light, points) {
        const basis = this.getLightBasis(light);
        return {
            basis,
            points: points.map(point => point.clone().sub(basis.position).applyQuaternion(basis.inverse))
        };
    },

    setLightLookAt(light, target) {
        if (!light.mesh) return false;

        const position = new THREE.Vector3();
        light.mesh.updateMatrixWorld(true);
        light.mesh.getWorldPosition(position);

        const direction = target.clone().sub(position);
        if (direction.lengthSq() < 1e-8) return false;
        direction.normalize();

        const worldQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
        const localQuaternion = worldQuaternion.clone();

        if (light.mesh.parent) {
            const parentQuaternion = new THREE.Quaternion();
            light.mesh.parent.updateMatrixWorld(true);
            light.mesh.parent.getWorldQuaternion(parentQuaternion);
            localQuaternion.copy(parentQuaternion.invert()).multiply(worldQuaternion);
        }

        const order = Format.euler_order || 'ZYX';
        const euler = new THREE.Euler().setFromQuaternion(localQuaternion, order);
        light.rotation = [
            THREE.MathUtils.radToDeg(euler.x),
            THREE.MathUtils.radToDeg(euler.y),
            THREE.MathUtils.radToDeg(euler.z)
        ];
        light.render_rotation = light.rotation.slice();
        light.mesh.rotation.copy(euler);
        light.mesh.updateMatrixWorld(true);
        return true;
    },

    getDistanceStats(light, points) {
        const position = new THREE.Vector3();
        light.mesh.getWorldPosition(position);

        let minDistance = Infinity;
        let maxDistance = 0;
        points.forEach(point => {
            const distance = point.distanceTo(position);
            minDistance = Math.min(minDistance, distance);
            maxDistance = Math.max(maxDistance, distance);
        });

        return { minDistance, maxDistance };
    },

    fitPoint(light, points, margin) {
        const stats = this.getDistanceStats(light, points);
        const far = Math.max(0.001, stats.maxDistance + margin);
        const near = Math.max(0.01, Math.min(far - 0.001, stats.minDistance - margin));

        light.distance = far;
        light.shadow_near = near;
        light.shadow_far = Math.max(near + 0.001, far);
    },

    fitDirectional(light, points, margin) {
        const data = this.getLightSpacePoints(light, points);
        let maxXY = 0;
        let minDepth = Infinity;
        let maxDepth = 0;
        let hasBehindPoints = false;

        data.points.forEach(point => {
            maxXY = Math.max(maxXY, Math.abs(point.x), Math.abs(point.y));
            const depth = -point.z;
            if (depth <= 0) hasBehindPoints = true;
            minDepth = Math.min(minDepth, depth);
            maxDepth = Math.max(maxDepth, depth);
        });

        const bounds = Math.max(0.001, maxXY + margin);
        const far = Math.max(0.001, maxDepth + margin);
        const near = Math.max(0.01, Math.min(far - 0.001, minDepth - margin));

        light.shadow_bounds = bounds;
        light.shadow_near = near;
        light.shadow_far = Math.max(near + 0.001, far);
        return { hasBehindPoints };
    },

    fitSpot(light, points, margin, angleMargin) {
        const data = this.getLightSpacePoints(light, points);
        const stats = this.getDistanceStats(light, points);
        let minDepth = Infinity;
        let maxDepth = 0;
        let maxAngle = 0;
        let hasBehindPoints = false;

        data.points.forEach(point => {
            const depth = -point.z;
            const radial = Math.sqrt(point.x * point.x + point.y * point.y);
            if (depth <= 0) {
                hasBehindPoints = true;
                maxAngle = Math.PI / 2;
            } else {
                maxAngle = Math.max(maxAngle, Math.atan2(radial + margin, depth));
            }
            minDepth = Math.min(minDepth, depth);
            maxDepth = Math.max(maxDepth, depth);
        });

        const far = Math.max(0.001, stats.maxDistance + margin, maxDepth + margin);
        const near = Math.max(0.01, Math.min(far - 0.001, minDepth - margin));
        const angle = THREE.MathUtils.clamp(
            THREE.MathUtils.radToDeg(maxAngle) + angleMargin,
            0.1,
            89.9
        );

        light.distance = far;
        light.angle = angle;
        light.shadow_near = near;
        light.shadow_far = Math.max(near + 0.001, far);
        return { hasBehindPoints };
    },

    fit(options = {}) {
        const margin = Math.max(0, this.num(options.margin, 0));
        const angleMargin = Math.max(0, this.num(options.angle_margin, 0));
        const aimToCenter = options.aim_to_center !== false;
        const lights = this.getSelectedLights();
        const targets = this.getSelectedTargets();
        const points = this.collectTargetPoints(targets);

        if (!lights.length) {
            Blockbench.showQuickMessage('Select one or more lights first.');
            return;
        }
        if (!targets.length || !points.length) {
            Blockbench.showQuickMessage('Select at least one target object or group.');
            return;
        }

        const center = this.getPointsBox(points).getCenter(new THREE.Vector3());
        let clippedLights = 0;

        Undo.initEdit({ elements: lights });
        lights.forEach(light => {
            if (aimToCenter && (light.light_type === 'directional' || light.light_type === 'spot')) {
                this.setLightLookAt(light, center);
            }

            let result = null;
            if (light.light_type === 'directional') result = this.fitDirectional(light, points, margin);
            else if (light.light_type === 'spot') result = this.fitSpot(light, points, margin, angleMargin);
            else this.fitPoint(light, points, margin);

            if (result && result.hasBehindPoints) clippedLights++;

            light.render_rotation = light.rotation.slice();
            light.render_intensity = light.intensity;
            light.render_color = light.color;

            if (window.LightElement?.preview_controller) {
                window.LightElement.preview_controller.updateTransform(light);
                window.LightElement.preview_controller.updateSelection(light);
            }
        });
        Undo.finishEdit('Fit light bounds to selection');

        updateSelection();
        window.update_light_element_callback?.();
        window.LightManagerAreaGizmos?.updateAll();

        const targetText = targets.length === 1 ? '1 target' : `${targets.length} targets`;
        const lightText = lights.length === 1 ? '1 light' : `${lights.length} lights`;
        Blockbench.showQuickMessage(`Fitted ${lightText} to ${targetText}.`);
        if (clippedLights > 0 && !aimToCenter) {
            Blockbench.showQuickMessage('Some target points are behind a fitted directional/spot light.');
        }
    },

    num(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    },

    openDialog() {
        if (!this.getSelectedLights().length) {
            Blockbench.showQuickMessage('Select one or more lights first.');
            return;
        }
        if (!this.getSelectedTargets().length) {
            Blockbench.showQuickMessage('Select target objects or groups too.');
            return;
        }

        new Dialog('fit_light_bounds_dialog', {
            title: 'Fit Lights to Selection',
            form: {
                margin: { label: 'Extra Margin', type: 'number', value: 0, min: 0, step: 0.1, description: 'Adds scene-unit padding to distance, bounds, near/far, and spot cone fitting.' },
                angle_margin: { label: 'Spot Angle Margin', type: 'number', value: 0, min: 0, max: 45, step: 0.1, description: 'Additional spot cone padding in degrees.' },
                aim_to_center: { label: 'Aim Directional/Spot', type: 'checkbox', value: true, description: 'Rotate directional and spot lights toward the center of the target selection.' }
            },
            onConfirm: form => {
                this.fit(form);
            }
        }).show();
    }
};

if (!THREE.ShaderChunk.common.includes('PUNCTUAL_LIGHT_PATCH')) {
    THREE.ShaderChunk.common += `\n
    #ifndef PUNCTUAL_LIGHT_PATCH
    #define PUNCTUAL_LIGHT_PATCH
    float punctualLightIntensityToIrradianceFactor( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
        if( cutoffDistance > 0.0 && decayExponent > 0.0 ) {
            return pow( clamp( -lightDistance / cutoffDistance + 1.0, 0.0, 1.0 ), decayExponent );
        }
        return 1.0;
    }
    float punctualLightIntensityToIrradianceFactor( const in float lightDistance, const in float cutoffDistance ) {
        if( cutoffDistance > 0.0 ) {
            return clamp( 1.0 - lightDistance / cutoffDistance, 0.0, 1.0 );
        }
        return 1.0;
    }
    #endif
    `;
}

if (typeof window.on_light_element_updated !== 'function') {
    window.on_light_element_updated = () => { };
}

window.update_light_element_callback = () => {
    if (!window.scene) return;

    configureLightManagerRenderers();
    configureLightManagerSceneShadowMeshes();

    // Ensure the main group exists in the scene
    if (!window.three_lights_group) {
        window.three_lights_group = new THREE.Group();
        window.three_lights_group.name = "light_manager_group";
        window.scene.add(window.three_lights_group);
    }

    // Keep track of active UUIDs to remove deleted lights
    const activeUuids = new Set();

    if (typeof LightElement !== 'undefined' && LightElement.all) {
        LightElement.all.forEach(element => {
            LightManagerUtils.sanitizeLight(element);
            activeUuids.add(element.uuid);

            let light = window.three_lights[element.uuid];

            // Determine required THREE light type based on user config
            let LightConstructor = THREE.PointLight;
            if (element.light_type === 'directional') LightConstructor = THREE.DirectionalLight;
            else if (element.light_type === 'spot') LightConstructor = THREE.SpotLight;

            // Recreate if type changed or it doesn't exist
            if (!light || light.constructor !== LightConstructor) {
                if (light) {
                    window.three_lights_group.remove(light);
                    if (light.target) window.three_lights_group.remove(light.target);
                    if (light.dispose) light.dispose();
                }

                const safeColor = LightManagerUtils.colorArray(element.color);
                const colorHex = new THREE.Color(safeColor[0] / 255, safeColor[1] / 255, safeColor[2] / 255).getHex();
                light = new LightConstructor(colorHex, element.intensity);

                // Shadow initialization is now handled dynamically in the sync phase below

                window.three_lights_group.add(light);
                if (light.target) {
                    window.three_lights_group.add(light.target);
                }
                window.three_lights[element.uuid] = light;
            }

            // Sync properties
            const safeColor = LightManagerUtils.colorArray(element.render_color || element.color);
            light.color.setRGB(safeColor[0] / 255, safeColor[1] / 255, safeColor[2] / 255);
            light.intensity = LightManagerUtils.num(element.render_intensity ?? element.intensity, element.intensity, 0, 100000);
            light.visible = element.visibility;
            light.castShadow = element.has_shadow !== false;

            // Sync dynamic shadow properties
            if (light.shadow) {
                let currentResolution = light.shadow.mapSize.width;
                let targetResolution = LightManagerUtils.shadowResolution(element.shadow_resolution);
                if (currentResolution !== targetResolution) {
                    light.shadow.mapSize.width = targetResolution;
                    light.shadow.mapSize.height = targetResolution;
                    if (light.shadow.map) {
                        light.shadow.map.dispose();
                        light.shadow.map = null;
                    }
                }

                light.shadow.bias = LightManagerUtils.num(element.shadow_bias, DEFAULT_SHADOW_BIAS, -1, 1);
                light.shadow.normalBias = LightManagerUtils.num(element.shadow_normal_bias, DEFAULT_SHADOW_NORMAL_BIAS, -1, 1);

                let shouldUpdateCamera = false;
                let near = LightManagerUtils.num(element.shadow_near, 0.1, 0, 99999);
                let far = Math.max(near + 0.001, LightManagerUtils.num(element.shadow_far, 200, 0.001, 100000));

                if (light.shadow.camera.near !== near || light.shadow.camera.far !== far) {
                    light.shadow.camera.near = near;
                    light.shadow.camera.far = far;
                    shouldUpdateCamera = true;
                }

                if (element.light_type === 'directional') {
                    let bounds = LightManagerUtils.num(element.shadow_bounds, 35, 0.001, 100000);
                    if (light.shadow.camera.top !== bounds) {
                        light.shadow.camera.top = bounds;
                        light.shadow.camera.bottom = -bounds;
                        light.shadow.camera.left = -bounds;
                        light.shadow.camera.right = bounds;
                        shouldUpdateCamera = true;
                    }
                }

                if (shouldUpdateCamera) {
                    light.shadow.camera.updateProjectionMatrix();
                }
            }

            if (element.distance !== undefined) {
                light.distance = LightManagerUtils.num(element.distance, 0, 0, 100000);
                // Define decay explicitly to keep the shader path stable.
                // 2 is physically realistic; 0 disables decay.
                light.decay = light.distance === 0 ? 0 : 2;
            }

            if (element.light_type === 'spot') {
                if (element.angle !== undefined) light.angle = THREE.MathUtils.degToRad(LightManagerUtils.num(element.angle, 45, 0.1, 89.9));
                if (element.penumbra !== undefined) light.penumbra = LightManagerUtils.num(element.penumbra, 0, 0, 1);
            }

            // Sync Position and Rotation
            if (element.mesh) {
                let worldPos = new THREE.Vector3();
                let worldQuat = new THREE.Quaternion();
                element.mesh.getWorldPosition(worldPos);
                element.mesh.getWorldQuaternion(worldQuat);

                light.position.copy(worldPos);

                if (light.target) {
                    let direction = new THREE.Vector3(0, 0, -1);
                    direction.applyQuaternion(worldQuat);
                    light.target.position.copy(worldPos).add(direction);
                    light.target.updateMatrixWorld(true);
                }
            }
        });
    }

    // Cleanup deleted lights
    for (const uuid in window.three_lights) {
        if (!activeUuids.has(uuid)) {
            const light = window.three_lights[uuid];
            if (light) {
                window.three_lights_group.remove(light);
                if (light.target) window.three_lights_group.remove(light.target);
                if (light.dispose) light.dispose();
            }
            delete window.three_lights[uuid];
        }
    }

    window.LightManagerAreaGizmos?.updateAll();
    invalidateLightManagerShadowMaps();
    window.on_light_element_updated?.();
};

/** Converts a Kelvin color temperature to a tinycolor instance.
 * @param {number} kelvin
 * @returns {tinycolor}
 */
function kelvinToTinyColor(kelvin) {
    let temp = Math.max(1000, Math.min(40000, kelvin)) / 100;

    let r, g, b;

    if (temp <= 66) {
        r = 255;
    } else {
        r = temp - 60;
        r = 329.698727446 * Math.pow(r, -0.1332047592);
    }
    if (temp <= 66) {
        g = temp;
        g = 99.4708025861 * Math.log(g) - 161.1195681661;
    } else {
        g = temp - 60;
        g = 288.1221695283 * Math.pow(g, -0.0755148492);
    }

    if (temp >= 66) {
        b = 255;
    } else if (temp <= 19) {
        b = 0;
    } else {
        b = temp - 10;
        b = 138.5177312231 * Math.log(b) - 305.0447927307;
    }

    const clamp = (c) => Math.max(0, Math.min(255, Math.round(c)));

    return tinycolor({
        r: clamp(r),
        g: clamp(g),
        b: clamp(b)
    });
}

// Dictionary to store Base64 textures for each light type
let light_icons_b64 = {};

/**
 * @name Light Manager
 * @author Blockbench User (Refactored & Fixed)
 * @description A standalone plugin to add, manage, and animate Light entities in the Blockbench Outliner.
 */

function initialize_light_plugin() {
    Language.addTranslations('en', {
        'dialog.preview_options.show_light_area_gizmos': 'Show Light Area Gizmos',
        'panel.light_properties': 'LIGHT',
        'property.light_settings': 'Light Settings',
        'property.light_color': 'Light Color',
        'property.light_intensity': 'Intensity',
        'property.light_intensity.desc': 'The brightness of the light. Higher values produce brighter illumination.',
        'property.light_temperature': 'Temperature',
        'property.light_temperature.desc': 'Color temperature in Kelvin. Lower is warmer; higher is cooler.',
        'property.light_type': 'Light Type',
        'property.light_type.point': 'Point',
        'property.light_type.directional': 'Directional',
        'property.light_type.spot': 'Spot',
        'property.distance': 'Distance',
        'property.distance.desc': 'Maximum range of the light. 0 means no limit.',
        'property.angle': 'Cone Angle',
        'property.angle.desc': 'Angle of the spot light cone in degrees.',
        'property.penumbra': 'Penumbra',
        'property.penumbra.desc': 'Softness of the spot light cone edge (0 to 1).',
        'property.cone_angle': 'Cone Angle',
        'property.cone_angle.desc': 'Angle of the spot light cone in degrees.',
        'property.cone_penumbra': 'Penumbra',
        'property.cone_penumbra.desc': 'Softness of the spot light cone edge (0 to 1).',
        'property.light.quickbuttons': 'Light',
        'property.cast_shadows': 'Cast Shadows',
        'property.shadow_near': 'Near',
        'property.shadow_far': 'Far',
        'property.shadow_bounds': 'Bounds',
        'property.shadow_clip': 'Clip',
        'property.shadow_area': 'Shadow Area',
        'property.shadow_biases': 'Shadow Bias',
        'property.shadow_resolution': 'Resolution',
        'property.shadow_bias': 'Bias',
        'property.shadow_bias.desc': 'Adjusts shadow depth to reduce artifacts. Positive values can reduce shadow acne but may cause peter-panning. Default: 0.001',
        'property.shadow_normal_bias': 'Normal Bias',
        'property.shadow_normal_bias.desc': 'Adjusts bias based on surface normal. Reduces shadow acne on angled surfaces. Default: 0.02',
        'action.edit_light_properties': 'Edit Light Properties',
        'action.fit_light_bounds_to_selection': 'Fit Light Bounds to Selection'
    });


    let deletables = [];
    let lightTextures = {}; // THREE.Texture instances will be loaded here

    const animationSign = Blockbench.isNewerThan('4.99') ? 1 : -1;

    function disposeLightManagerResources() {
        const resources = deletables.slice();
        deletables.length = 0;
        resources.forEach(item => {
            if (item && typeof item.delete === 'function') item.delete();
        });
    }

    function disposeThreeLight(light) {
        if (!light) return;
        if (light.parent) light.parent.remove(light);
        if (light.target && light.target.parent) light.target.parent.remove(light.target);
        if (light.shadow && light.shadow.map) light.shadow.map.dispose();
        if (typeof light.dispose === 'function') light.dispose();
    }

    Plugin.register('light_manager', {
        title: 'Light Entity Manager',
        icon: 'emoji_objects',
        author: 'Extracted & Refactored',
        description: 'Adds fully manipulatable and animatable Light elements to the outliner without shader logic.',
        version: '1.3.0',
        variant: 'both',

        onload() {
            disposeLightManagerResources();

            class ComboSlider extends Widget {
                constructor(id, data) {
                    if (typeof id === 'object') {
                        data = id;
                        id = data.id;
                    }
                    super(id, data);
                    const scope = this;

                    this.type = 'combo_slider';
                    this.icon = 'fa-sliders-h';
                    this.value = data.value !== undefined ? data.value : 0;

                    // Tracks active range dragging so the reset button cannot steal focus.
                    this.isDragging = false;

                    this.settings = {
                        min: data.min !== undefined ? data.min : 0,
                        max: data.max !== undefined ? data.max : 10,
                        step: data.step !== undefined ? data.step : 1,
                        circular: data.circular,
                        allow_lower: !!data.allow_lower,
                        allow_higher: !!data.allow_higher,
                        resettable: !!data.resettable || data.reset_value !== undefined,
                        reset_value: data.reset_value !== undefined ? data.reset_value : (data.value !== undefined ? data.value : 0)
                    };

                    // Range slider input.
                    let rangeInput = Interface.createElement('input', {
                        type: 'range',
                        value: this.value,
                        min: this.settings.min,
                        max: this.settings.max,
                        step: this.settings.step,
                        class: 'tool disp_range',
                        style: `margin: 0;flex: 1 1 auto;width: 100%;min-width: 30px;transition: opacity 0.2s, filter 0.2s;${data.color ? '--color-thumb: ' + data.color + ';' : ''}`
                    });

                    let numberInputOptions = {
                        type: 'number',
                        value: this.value,
                        step: this.settings.step,
                        class: 'dark_bordered focusable_input',
                        style: `width: 100%;min-width: 45px;height: 24px;box-sizing: border-box;text-align: center;margin: 0;padding: 0 2px;flex: 0 0 auto;`
                    };

                    if (!this.settings.allow_lower) numberInputOptions.min = this.settings.min;
                    if (!this.settings.allow_higher) numberInputOptions.max = this.settings.max;

                    let numberInput = Interface.createElement('input', numberInputOptions);

                    let numberContainer = Interface.createElement('div', {
                        class: 'numeric_input tool disp_text',
                        style: `display: flex;align-items: center;margin: 0;flex: 0 0 auto; `
                    }, [numberInput]);

                    let comboWrapper = Interface.createElement('div', {
                        class: 'bar slider_input_combo',
                        title: data.title ? tl(data.title) : '',
                        style: `display: flex;align-items: center;height: 100%;margin: 0 5px;flex: 1 1 auto;min-width: 0;width: auto; `
                    }, [rangeInput, numberContainer]);

                    // Build the final widget structure.
                    let containerChildren = [];

                    // Optional icon.
                    if (data.icon) {
                        let isFa = data.icon.startsWith('fa-') || data.icon.startsWith('fas ') || data.icon.startsWith('fab ');
                        let iconElement = Interface.createElement('i', {
                            class: isFa ? `fa ${data.icon}` : 'material-icons',
                            style: 'margin-right: 4px; font-size: 18px; color: var(--color-text); display: flex; align-items: center;'
                        }, isFa ? '' : data.icon);
                        containerChildren.push(iconElement);
                    }

                    // Optional label.
                    if (data.label) {
                        let labelElement = Interface.createElement('span', {
                            style: 'margin-right: 5px; font-size: 13px; color: var(--color-subtle_text); white-space: nowrap; display: flex; align-items: center;'
                        }, tl(data.label));
                        containerChildren.push(labelElement);
                    }

                    containerChildren.push(comboWrapper);

                    // Optional reset button.
                    if (this.settings.resettable) {
                        this.resetBtn = Interface.createElement('i', {
                            class: 'material-icons icon',
                            title: 'Reset value',
                            style: `font-size: 18px;cursor: pointer;display: none;margin-left: 2px;color: var(--color-subtle_text);display: flex;align-items: center;`
                        }, 'replay');

                        this.resetBtn.onclick = (e) => {
                            if (typeof this.onBefore === 'function') this.onBefore(e);
                            this.change(this.settings.reset_value, e);
                            if (typeof this.onAfter === 'function') this.onAfter(e);
                        };

                        containerChildren.push(this.resetBtn);
                    }

                    // Dynamic toolbar sizing.
                    let rootStyles = `display: flex;flex-direction: row;align-items: center;height: 30px;padding: 0 4px;min-width: 0;`;

                    if (data.grow) {
                        rootStyles += `flex: 1 1 auto;width: auto;min-width: ${data.min_width ? data.min_width + 'px' : '160px'};`;
                    } else {
                        rootStyles += `flex: 0 0 auto;width: ${data.width ? data.width + 'px' : '160px'};min-width: ${data.width ? data.width + 'px' : '160px'};`;
                    }

                    this.node = Interface.createElement('div', {
                        class: 'tool widget',
                        toolbar_item: this.id,
                        style: rootStyles
                    }, containerChildren);

                    // Assign callbacks.
                    if (typeof data.onChange === 'function') {
                        this.onChange = data.onChange;
                    }
                    if (typeof data.onBefore === 'function') {
                        this.onBefore = data.onBefore;
                    }
                    if (typeof data.onAfter === 'function') {
                        this.onAfter = data.onAfter;
                    }

                    // Keep both inputs synchronized.
                    let $inputs = $(this.node).find('input');
                    let $range = $(this.node).find('input[type="range"]');
                    let $number = $(this.node).find('input[type="number"]');

                    $inputs.on('input', function (event) {
                        let val = parseFloat($(event.target).val());
                        if (isNaN(val)) return;
                        let is_number_input = event.target === $number[0];
                        scope.change(val, event.originalEvent, is_number_input);
                    });

                    $number.on('blur', function (event) {
                        let val = parseFloat($(this).val());
                        if (isNaN(val)) {
                            val = scope.settings.reset_value;
                        }
                        scope.change(val, event.originalEvent, false);
                    });

                    $number.on('keydown', function (event) {
                        if (event.key === 'Enter' || event.key === 'Escape') {
                            this.blur();
                        }
                    });

                    // Track dragging state.
                    $range.on('mousedown touchstart', function (event) {
                        scope.isDragging = true;
                        if (scope.onBefore) scope.onBefore(event.originalEvent);
                    });

                    // Finish dragging and refresh reset button visibility.
                    $range.on('mouseup touchend', function (event) {
                        scope.isDragging = false;
                        scope.updateResetButton();
                    });

                    $number.on('focus', function (event) {
                        if (scope.onBefore) scope.onBefore(event.originalEvent);
                    });

                    $inputs.on('change', function (event) {
                        scope.isDragging = false;
                        scope.updateResetButton();
                        if (scope.onAfter) scope.onAfter(event.originalEvent);
                    });

                    // Keyboard shortcuts.
                    this.addSubKeybind('increase', 'keybindings.item.num_slider.increase', data.sub_keybinds?.increase, (event) => {
                        if (!Condition(this.condition)) return false;
                        if (typeof this.onBefore === 'function') this.onBefore(event);
                        let value = this.get() + this.settings.step;
                        if (this.settings.circular && value > this.settings.max) value = this.settings.min;
                        this.change(value, event);
                        if (typeof this.onAfter === 'function') this.onAfter(event);
                    });

                    this.addSubKeybind('decrease', 'keybindings.item.num_slider.decrease', data.sub_keybinds?.decrease, (event) => {
                        if (!Condition(this.condition)) return false;
                        if (typeof this.onBefore === 'function') this.onBefore(event);
                        let value = this.get() - this.settings.step;
                        if (this.settings.circular && value < this.settings.min) value = this.settings.max;
                        this.change(value, event);
                        if (typeof this.onAfter === 'function') this.onAfter(event);
                    });

                    this.set(this.value);
                }

                // Updates reset button visibility.
                updateResetButton() {
                    if (!this.settings.resettable || !this.resetBtn) return;

                    // Do not change visibility while dragging; it can steal pointer capture.
                    if (this.isDragging) return;

                    if (parseFloat(this.value) !== parseFloat(this.settings.reset_value)) {
                        this.resetBtn.style.display = 'flex';
                    } else {
                        this.resetBtn.style.display = 'none';
                    }
                }

                change(value, event, skip_number_input_update = false) {
                    if (!this.settings.allow_lower && value < this.settings.min) {
                        value = this.settings.min;
                    }
                    if (!this.settings.allow_higher && value > this.settings.max) {
                        value = this.settings.max;
                    }

                    this.set(value, skip_number_input_update);
                    if (this.onChange) {
                        this.onChange(event);
                    }
                    this.dispatchEvent('change', { value: this.value });
                }

                set(value, skip_number_input_update = false) {
                    this.value = value;
                    let $range = $(this.node).find('input[type="range"]');
                    let $number = $(this.node).find('input[type="number"]');

                    $range.val(value);
                    if (!skip_number_input_update) {
                        $number.val(value);
                    }

                    // Visual out-of-range state.
                    let isOutOfBounds = false;

                    if (this.settings.allow_lower && value < this.settings.min) isOutOfBounds = true;
                    if (this.settings.allow_higher && value > this.settings.max) isOutOfBounds = true;

                    if (isOutOfBounds) {
                        $range.css({
                            'opacity': '0.3',
                            'filter': 'grayscale(100%)'
                        });
                    } else {
                        $range.css({
                            'opacity': '1',
                            'filter': 'none'
                        });
                    }

                    // This internally no-ops while dragging.
                    this.updateResetButton();
                }

                get() {
                    return this.value;
                }
            }

            window.ComboSlider = ComboSlider;

            class CompactDropdownSelect extends Widget {
                constructor(id, data) {
                    super(id, data);
                    this.type = 'select';
                    this.value = data.value;
                    this.values = [];
                    this.options = data.options || {};
                    this.onChange = data.onChange;

                    // Collect available option keys.
                    for (let key in this.options) {
                        if (!this.value) this.value = key;
                        this.values.push(key);
                    }

                    // Main DOM node.
                    this.node = document.createElement('div');
                    this.node.className = 'tool widget compact_dropdown_select';
                    this.node.setAttribute('toolbar_item', this.id);

                    // Main icon container.
                    this.icon_wrapper = document.createElement('div');
                    this.icon_wrapper.className = 'main_icon_wrapper';

                    // Native-style dropdown arrow.
                    this.arrow_node = document.createElement('i');
                    this.arrow_node.className = 'fas fa-caret-down dropdown_arrow';

                    this.node.append(this.icon_wrapper, this.arrow_node);

                    this.node.addEventListener('click', (event) => {
                        this.open(event);
                    });

                    // Mouse wheel support for quick option switching.
                    $(this.node).on('wheel', event => {
                        let e = event.originalEvent;
                        let index = this.values.indexOf(this.value);
                        index += e.deltaY < 0 ? -1 : 1;
                        if (index < 0) index = this.values.length - 1;
                        if (index >= this.values.length) index = 0;
                        this.change(this.values[index], e);
                    });

                    this.nodes.push(this.node);
                    this.set(this.value);
                }

                // Opens the native Blockbench menu with this widget's options.
                open(event) {
                    if (Menu.closed_in_this_click == this.id) return this;
                    let scope = this;
                    let items = [];

                    for (let key in this.options) {
                        let opt = this.options[key];
                        if (opt) {
                            items.push({
                                name: opt.name || key,
                                icon: opt.icon,
                                color: opt.color,
                                condition: opt.condition,
                                click: (e) => {
                                    scope.change(key, e);
                                }
                            });
                        }
                    }

                    // Pass a single base class to the Menu constructor.
                    let menu = new Menu(this.id, items, { class: 'select_menu' });

                    // Add the custom menu class safely through classList.
                    if (menu.node) {
                        menu.node.classList.add('compact_dropdown_menu');
                        // Match the menu width to the button.
                        menu.node.style['min-width'] = this.node.clientWidth + 'px';
                    }

                    menu.open(this.node, this);
                }

                // Changes the value and dispatches widget events.
                change(value, event) {
                    this.set(value);
                    if (this.onChange) {
                        this.onChange(this, event);
                    }
                    this.dispatchEvent('change', { value, event });
                    return this;
                }

                // Updates the DOM to show the selected option icon.
                set(key) {
                    if (!this.options[key]) return this;
                    this.value = key;
                    let opt = this.options[key];

                    // Tooltip includes the widget name and current option.
                    this.node.title = `${this.name ? this.name + ': ' : ''}${opt.name || key}`;

                    // Replace the visible icon in every widget instance.
                    this.nodes.forEach(n => {
                        let wrapper = n.querySelector('.main_icon_wrapper');
                        if (wrapper) {
                            wrapper.innerHTML = '';

                            let iconElement = Blockbench.getIconNode(opt.icon || 'help');

                            // Apply custom color to the main icon.
                            if (opt.color) {
                                iconElement.style.color = opt.color;
                            }

                            wrapper.append(iconElement);
                        }
                    });

                    return this;
                }

                setOptions(options) {
                    this.options = options || {};
                    this.values = [];

                    // Extraer las keys de las nuevas opciones
                    for (let key in this.options) {
                        this.values.push(key);
                    }

                    // Fallback to the first option when the current value no longer exists.
                    if (!this.options[this.value] && this.values.length > 0) {
                        this.value = this.values[0];
                    }

                    // Refresh the displayed value.
                    this.set(this.value);
                    return this;
                }

                update() {
                    this.set(this.value);
                    if (this.onUpdate) {
                        this.onUpdate(this);
                    }
                    return this;
                }

                get() {
                    return this.value;
                }
            }

            window.CompactDropdownSelect = CompactDropdownSelect;

            class BarDisplay extends Widget {
                constructor(id, data) {
                    // Standard Blockbench constructor handling.
                    if (typeof id == 'object') {
                        data = id;
                        id = data.id;
                    }
                    super(id, data);
                    this.type = 'bar_display';

                    // Display state.
                    this.text = data.text || '';
                    this.label = data.label || '';
                    this.color = data.color || '';
                    this.icon_name = data.icon || '';
                    this.is_paragraph = !!data.paragraph;
                    this.expand = !!data.expand;
                    this.text_alignment = data.text_alignment || 'left';
                    this.onUpdate = data.onUpdate;

                    // DOM node.
                    this.node = document.createElement('div');
                    this.node.className = `tool widget bar_display ${this.is_paragraph ? 'bar_display_paragraph' : ''}`;
                    this.node.setAttribute('toolbar_item', this.id);

                    // Visual-only toolbar item.
                    this.node.style.display = 'flex';
                    this.node.style.alignItems = this.is_paragraph ? 'flex-start' : 'center';
                    this.node.style.gap = '6px';
                    this.node.style.padding = '0 8px';
                    this.node.style.cursor = 'default';
                    if (this.expand) {
                        this.node.style.flex = '1 1 0';
                        this.node.style.minWidth = '0';
                        this.node.style.width = 'auto';
                    }
                    if (this.color) this.node.style.color = this.color;

                    // Initialize node tracking.
                    this.nodes = [this.node];
                    this.buildDOM();

                    // Apply initial state.
                    this.update();
                }

                /**
                 * Builds or rebuilds internal DOM nodes.
                 */
                buildDOM() {
                    this.node.innerHTML = '';

                    // Optional icon.
                    if (this.icon_name) {
                        let icon_node = Blockbench.getIconNode(this.icon_name);
                        icon_node.style.fontSize = '1.1em';
                        this.node.append(icon_node);
                    }

                    // Optional label.
                    if (this.label) {
                        let label_node = document.createElement('span');
                        label_node.className = 'bar_display_label';
                        label_node.style.fontWeight = 'bold';
                        label_node.style.opacity = '0.85';
                        label_node.innerText = this.label;
                        this.node.append(label_node);
                    }

                    // Text container.
                    let text_node = document.createElement('span');
                    text_node.className = 'bar_display_content';
                    if (this.expand) {
                        text_node.style.flex = '1 1 0';
                        text_node.style.minWidth = '0';
                    }
                    text_node.style.textAlign = this.text_alignment;
                    if (this.is_paragraph) {
                        text_node.style.whiteSpace = 'pre-wrap';
                        text_node.style.lineHeight = '1.4';
                        text_node.style.maxWidth = '250px';
                    }
                    text_node.innerHTML = this.text;
                    this.node.append(text_node);
                }

                /**
                 * Updates the main text.
                 */
                set(text) {
                    this.text = text;
                    this.nodes.forEach(node => {
                        let content = node.querySelector('.bar_display_content');
                        if (content) content.innerHTML = text;
                    });
                    return this;
                }

                /**
                 * Updates the label.
                 */
                setLabel(label) {
                    this.label = label;
                    this.buildDOM();
                    return this;
                }

                /**
                 * Updates the icon dynamically.
                 */
                setIcon(icon) {
                    this.icon_name = icon;
                    this.buildDOM();
                    return this;
                }

                /**
                 * Changes text and icon color.
                 */
                setColor(color) {
                    this.color = color;
                    this.nodes.forEach(node => {
                        node.style.color = color;
                    });
                    return this;
                }

                /**
                 * Called by Blockbench or manually to refresh the widget.
                 */
                update() {
                    // Evaluate the native Blockbench display condition.
                    let condition_met = Condition(this.condition);
                    this.nodes.forEach(node => {
                        // Keep flex display so the toolbar layout remains stable.
                        node.style.display = condition_met ? 'flex' : 'none';
                    });

                    // Run the optional custom update callback.
                    if (typeof this.onUpdate === 'function') {
                        this.onUpdate(this);
                    }

                    this.dispatchEvent('update', {});
                    return this;
                }
            }

            window.BarDisplay = BarDisplay;

            class TextInputWidget extends Widget {
                constructor(id, data) {
                    // Handle standard Blockbench constructor pattern
                    if (typeof id === 'object') {
                        data = id;
                        id = data.id;
                    }
                    super(id, data);

                    // Define widget properties
                    this.type = 'text_input';
                    this.value = data.default_text || '';
                    this.placeholder = data.placeholder || '';
                    this.icon_name = data.icon || '';
                    this.expand = data.expand || false;
                    this.width = typeof data.width === 'number' ? data.width + 'px' : (data.width || '120px');

                    // Callbacks
                    this.onEdit = data.onEdit;
                    this.onFinishEdit = data.onFinishEdit;

                    // Outer Container Node
                    this.node = document.createElement('div');
                    this.node.className = 'tool wide widget text_input_widget';
                    this.node.setAttribute('toolbar_item', this.id);

                    // Styling the container to blend with Blockbench toolbars
                    this.node.style.display = 'flex';
                    this.node.style.alignItems = 'center';
                    this.node.style.width = this.expand ? 'auto' : this.width + 'px';
                    this.node.style.background = 'var(--color-back)';
                    this.node.style.border = '1px solid var(--color-border)';
                    this.node.style.borderRadius = '2px';
                    this.node.style.padding = '0 4px';
                    this.node.style.boxSizing = 'border-box';

                    if (this.expand) {
                        this.node.style.flex = '1 1 0';
                        this.node.style.minWidth = '0';
                    }

                    if (this.color) {
                        this.node.style.borderColor = this.color;
                    }

                    // Build internal DOM
                    this.buildDOM();

                    // jQuery wrapper for robust event handling (matches Blockbench native style)
                    this.jq_input = $(this.input_node);
                    this.bindEvents();

                    // Initial condition check
                    this.update();
                }

                /**
                 * Constructs the internal DOM elements (Icon and Input field)
                 */
                buildDOM() {
                    this.node.innerHTML = ''; // Clear previous

                    // 1. Add Icon if defined
                    if (this.icon_name) {
                        let icon_node = Blockbench.getIconNode(this.icon_name);
                        icon_node.style.fontSize = '1em';
                        icon_node.style.marginRight = '4px';
                        icon_node.style.color = this.color || 'var(--color-text)';
                        this.node.append(icon_node);
                    }

                    // 2. Add standard Input element
                    this.input_node = document.createElement('input');
                    this.input_node.type = 'text';
                    this.input_node.value = this.value;
                    this.input_node.placeholder = this.placeholder;

                    // Style the input to remove default web styling and fit Blockbench
                    this.input_node.style.flex = '1';
                    this.input_node.style.width = '100%';
                    this.input_node.style.minWidth = '10px'; // Prevent collapsing
                    this.input_node.style.background = 'transparent';
                    this.input_node.style.border = 'none';
                    this.input_node.style.color = 'var(--color-text)';
                    this.input_node.style.outline = 'none';

                    this.node.append(this.input_node);
                }

                /**
                 * Binds all necessary events for the input field
                 */
                bindEvents() {
                    const scope = this;

                    this.jq_input
                        // Triggered every time a character is typed or deleted
                        .on('input', function (e) {
                            scope.value = this.value;

                            if (typeof scope.onEdit === 'function') {
                                scope.onEdit(scope.value, e);
                            }
                            scope.dispatchEvent('edit', { value: scope.value });
                        })
                        // Handle specific keys and prevent Blockbench hotkeys from firing
                        .on('keydown', function (e) {
                            // Prevent Blockbench global keybinds (like Delete removing a cube) while typing
                            e.stopPropagation();

                            if (e.key === 'Enter') {
                                e.preventDefault();
                                this.blur(); // Triggers focusout
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                this.blur();
                            }
                        })
                        // Triggered when clicking outside or hitting Enter
                        .on('focusout', function (e) {
                            if (typeof scope.onFinishEdit === 'function') {
                                scope.onFinishEdit(scope.value, e);
                            }
                            scope.dispatchEvent('finish_edit', { value: scope.value });
                        })
                        // Allow easy selection of text
                        .on('dblclick', function () {
                            this.select();
                        });
                }

                /**
                 * Get the current text value
                 * @returns {string}
                 */
                get() {
                    return this.value;
                }

                /**
                 * Set the text value programmatically
                 * @param {string} text 
                 */
                set(text) {
                    this.value = text;
                    if (this.input_node) {
                        this.input_node.value = text;
                    }
                    return this;
                }

                /**
                 * Change the placeholder dynamically
                 * @param {string} text 
                 */
                setPlaceholder(text) {
                    this.placeholder = text;
                    if (this.input_node) {
                        this.input_node.placeholder = text;
                    }
                    return this;
                }

                /**
                 * Adjust the width of the widget
                 * @param {number} width 
                 */
                setWidth(width) {
                    this.width = width;
                    this.node.style.width = width + 'px';
                    return this;
                }

                /**
                 * Standard update method called by Blockbench
                 */
                update() {
                    // Evaluate the native Blockbench condition to show/hide
                    let condition_met = Condition(this.condition);
                    this.node.style.display = condition_met ? 'flex' : 'none';

                    // Keep input synchronized if value was modified externally
                    if (this.input_node.value !== this.value) {
                        this.input_node.value = this.value;
                    }

                    this.dispatchEvent('update', {});
                    return this;
                }
            }

            window.TextInputWidget = TextInputWidget;

            class HorizontalSelectWidget extends Widget {
                constructor(id, data) {
                    if (typeof id === 'object') {
                        data = id;
                        id = data.id;
                    }
                    super(id, data);

                    this.type = 'horizontal_select';

                    // Settings
                    this.options = data.options || {};
                    this.selected = []; // Internally we always use an array to support multi-select
                    this.expand = !!data.expand;
                    this.bg_color = data.bg_color || 'var(--color-back)';
                    this.divider_color = data.divider_color || 'var(--color-border)';
                    this.allow_empty = data.allow_empty !== undefined ? data.allow_empty : true;

                    // Callbacks
                    this.onSelect = data.onSelect;
                    this.onChange = data.onChange;

                    // Ensure default selection
                    if (data.value !== undefined) {
                        this.selected = Array.isArray(data.value) ? [...data.value] : [data.value];
                    } else if (!this.allow_empty && Object.keys(this.options).length > 0) {
                        this.selected = [Object.keys(this.options)[0]];
                    }

                    // Main Container Node
                    this.node = document.createElement('div');
                    this.node.className = 'tool widget horizontal_select_widget';
                    this.node.setAttribute('toolbar_item', this.id);

                    // Container Styles
                    this.node.style.backgroundColor = this.bg_color;
                    this.node.style.border = `1px solid ${this.divider_color}`;

                    if (this.expand) {
                        this.node.style.flex = '1 1 auto';
                        this.node.style.width = '100%';
                    } else {
                        this.node.style.flex = '0 0 auto';
                        this.node.style.display = 'inline-flex';
                    }

                    this.nodes = [this.node];
                    this.button_nodes = {}; // Store references to individual buttons

                    this.buildDOM();
                    this.updateSelectionVisuals();
                }

                /**
                 * Builds the buttons and dividers inside the main container
                 */
                buildDOM() {
                    this.node.innerHTML = '';
                    this.button_nodes = {};

                    let keys = Object.keys(this.options);

                    keys.forEach((key, index) => {
                        let opt = this.options[key];

                        // Create Button Wrapper
                        let btn = document.createElement('div');
                        btn.className = 'horizontal_select_btn';
                        btn.setAttribute('data-key', key);

                        if (this.expand) {
                            btn.style.flex = '1 1 0';
                        }

                        // Divider logic
                        if (index < keys.length - 1) {
                            btn.style.borderRight = `1px solid ${this.divider_color}`;
                        }

                        // Disable State
                        if (opt.disabled) {
                            btn.classList.add('disabled');
                        }

                        // Custom Colors (Only applied when NOT selected, CSS handles the selected state)
                        if (opt.color) {
                            btn.style.color = opt.color;
                        }

                        // Icon Element
                        let hasIcon = !!opt.icon;
                        let hasName = !!opt.name;

                        if (!hasName) btn.classList.add('icon_only');

                        if (hasIcon) {
                            let iconElement = Blockbench.getIconNode(opt.icon);
                            iconElement.classList.add('horizontal_select_icon');
                            btn.appendChild(iconElement);
                        }

                        // Text Label Element
                        if (hasName) {
                            let labelElement = document.createElement('span');
                            labelElement.className = 'horizontal_select_label';
                            labelElement.innerText = tl(opt.name); // Using tl() for Blockbench localization
                            btn.appendChild(labelElement);
                        }

                        // Tooltip
                        if (opt.description || hasName) {
                            btn.title = opt.description ? tl(opt.description) : tl(opt.name);
                        }

                        // Click Event Listener
                        btn.addEventListener('click', (event) => {
                            if (this.options[key].disabled) return;
                            this.handleInteraction(key, event);
                        });

                        this.button_nodes[key] = btn;
                        this.node.appendChild(btn);
                    });
                }

                /**
                 * Handles user clicks, taking Ctrl/Shift modifiers into account
                 */
                handleInteraction(key, event) {
                    let isMulti = event.ctrlKey || event.shiftKey;

                    if (isMulti) {
                        // Toggle selection
                        if (this.selected.includes(key)) {
                            if (this.allow_empty || this.selected.length > 1) {
                                this.selected = this.selected.filter(k => k !== key);
                            }
                        } else {
                            this.selected.push(key);
                        }
                    } else {
                        // Single select: If clicking the only selected item, optionally allow deselect
                        if (this.selected.length === 1 && this.selected[0] === key) {
                            if (this.allow_empty) {
                                this.selected = [];
                            }
                        } else {
                            this.selected = [key];
                        }
                    }

                    this.updateSelectionVisuals();

                    let returnValue = this.get();
                    if (this.onSelect) this.onSelect(returnValue, event);
                    if (this.onChange) this.onChange(returnValue, event);
                    this.dispatchEvent('change', { value: returnValue, event });
                }

                /**
                 * Updates the CSS classes for selected buttons
                 */
                updateSelectionVisuals() {
                    for (let key in this.button_nodes) {
                        let btn = this.button_nodes[key];
                        if (this.selected.includes(key)) {
                            btn.classList.add('selected');
                            btn.style.color = ''; // Remove custom color so accent stands out
                        } else {
                            btn.classList.remove('selected');
                            if (this.options[key].color) {
                                btn.style.color = this.options[key].color; // Restore custom color
                            }
                        }
                    }
                }

                /**
                 * Set the selected options programmatically
                 * @param {string|Array<string>} value - Key or array of keys to select
                 */
                set(value) {
                    if (!value && this.allow_empty) {
                        this.selected = [];
                    } else {
                        this.selected = Array.isArray(value) ? [...value] : [value];
                        // Filter out non-existent keys
                        this.selected = this.selected.filter(k => this.options[k]);
                    }
                    this.updateSelectionVisuals();
                    return this;
                }

                /**
                 * Returns the selected key(s). 
                 * Returns a string if only one item is selected, or an Array if multiple are selected.
                 */
                get() {
                    if (this.selected.length === 0) return null;
                    if (this.selected.length === 1) return this.selected[0];
                    return [...this.selected];
                }

                /**
                 * Enable or disable a specific option
                 * @param {string} key - Option key
                 * @param {boolean} disabled - True to disable, false to enable
                 */
                setDisabled(key, disabled = true) {
                    if (this.options[key]) {
                        this.options[key].disabled = disabled;
                        if (this.button_nodes[key]) {
                            if (disabled) {
                                this.button_nodes[key].classList.add('disabled');
                                // Remove from selection if disabled
                                if (this.selected.includes(key)) {
                                    this.selected = this.selected.filter(k => k !== key);
                                    this.updateSelectionVisuals();
                                }
                            } else {
                                this.button_nodes[key].classList.remove('disabled');
                            }
                        }
                    }
                    return this;
                }

                /**
                 * Replaces all options and rebuilds the widget
                 */
                setOptions(newOptions) {
                    this.options = newOptions || {};
                    this.selected = this.selected.filter(k => this.options[k]);
                    this.buildDOM();
                    this.updateSelectionVisuals();
                    return this;
                }

                update() {
                    let condition_met = Condition(this.condition);
                    this.node.style.display = condition_met ? (this.expand ? 'flex' : 'inline-flex') : 'none';
                    this.dispatchEvent('update', {});
                    return this;
                }
            }

            window.HorizontalSelectWidget = HorizontalSelectWidget;

            // MARK: Combo Slider
            FormElement.types.combo_slider = class FormElementComboSlider extends FormElement {
                // Al devolver 'true', evitamos que Blockbench divida la fila en "Label Izquierda | Input Derecha"
                get uses_wide_inputs() { return true; }

                setup() {
                    let tempDesc = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = tempDesc;
                }

                build(bar) {
                    this.bar = bar;
                    // Make it fill the toolbar width without native margins.
                    bar.classList.add('full_width_dialog_bar');
                    bar.style.padding = '0';
                    bar.style.background = 'transparent';

                    let data = this.options;
                    this.value = data.value !== undefined ? data.value : (data.default !== undefined ? data.default : 0);
                    this.isDragging = false;

                    this.settings = {
                        min: data.min !== undefined ? data.min : 0,
                        max: data.max !== undefined ? data.max : 10,
                        step: data.step !== undefined ? data.step : 1,
                        circular: data.circular,
                        allow_lower: !!data.allow_lower,
                        allow_higher: !!data.allow_higher,
                        resettable: !!data.resettable || data.reset_value !== undefined,
                        reset_value: data.reset_value !== undefined ? data.reset_value : this.value
                    };

                    // Inputs.
                    let rangeInput = Interface.createElement('input', {
                        type: 'range',
                        value: this.value,
                        min: this.settings.min,
                        max: this.settings.max,
                        step: this.settings.step,
                        class: 'tool disp_range',
                        style: `margin: 0;flex: 1 1 auto;width: 100%;min-width: 30px;transition: opacity 0.2s, filter 0.2s;${data.color ? '--color-thumb: ' + data.color + ';' : ''}`
                    });

                    let numberInputOptions = {
                        type: 'number',
                        value: this.value,
                        step: this.settings.step,
                        class: 'dark_bordered focusable_input',
                        style: `width: 100%;min-width: 45px;height: 24px;box-sizing: border-box;text-align: center;margin: 0;padding: 0 2px;flex: 0 0 auto;`
                    };

                    if (!this.settings.allow_lower) numberInputOptions.min = this.settings.min;
                    if (!this.settings.allow_higher) numberInputOptions.max = this.settings.max;

                    let numberInput = Interface.createElement('input', numberInputOptions);

                    let numberContainer = Interface.createElement('div', {
                        class: 'numeric_input tool disp_text',
                        style: `display: flex;align-items: center;margin: 0;flex: 0 0 auto;`
                    }, [numberInput]);

                    let comboWrapper = Interface.createElement('div', {
                        class: 'bar slider_input_combo',
                        title: data.description ? tl(data.description) : '',
                        style: `display: flex;align-items: center;height: 100%;margin: 0 5px;flex: 1 1 auto;min-width: 0;width: auto;`
                    }, [rangeInput, numberContainer]);

                    // Final widget layout.
                    let containerChildren = [];

                    // Optional left-aligned icon.
                    if (data.icon) {
                        let isFa = data.icon.startsWith('fa-') || data.icon.startsWith('fas ') || data.icon.startsWith('fab ');
                        let iconElement = Interface.createElement('i', {
                            class: isFa ? `fa ${data.icon}` : 'material-icons',
                            style: 'margin-right: 4px; font-size: 18px; color: var(--color-text); display: flex; align-items: center;'
                        }, isFa ? '' : data.icon);
                        containerChildren.push(iconElement);
                    }

                    // Inline label.
                    if (data.label) {
                        let labelElement = Interface.createElement('span', {
                            style: 'margin-right: 5px; font-size: 13px; color: var(--color-subtle_text); white-space: nowrap; display: flex; align-items: center;'
                        }, tl(data.label));
                        containerChildren.push(labelElement);
                    }

                    containerChildren.push(comboWrapper);

                    // Reset button.
                    if (this.settings.resettable) {
                        this.resetBtn = Interface.createElement('i', {
                            class: 'material-icons icon',
                            title: 'Reset',
                            style: `font-size: 18px;cursor: pointer;display: none;margin-left: 2px;color: var(--color-subtle_text);display: flex;align-items: center;`
                        }, 'replay');

                        this.resetBtn.onclick = (e) => {
                            this.setValue(this.settings.reset_value);
                            this.change();
                        };

                        containerChildren.push(this.resetBtn);
                    }

                    // Root container.
                    this.node = Interface.createElement('div', {
                        class: 'tool widget',
                        style: `display: flex;flex-direction: row;align-items: center;height: 30px;padding: 0 4px;min-width: 0; width: 100%; box-sizing: border-box;`
                    }, containerChildren);

                    bar.append(this.node);

                    // Match native event behavior.
                    let scope = this;
                    let $inputs = $(this.node).find('input');
                    let $range = $(this.node).find('input[type="range"]');
                    let $number = $(this.node).find('input[type="number"]');

                    $inputs.on('input', function (event) {
                        let val = parseFloat($(event.target).val());
                        if (isNaN(val)) return;
                        let is_number_input = event.target === $number[0];
                        scope.setValue(val, false, is_number_input);
                        scope.change();
                    });

                    $number.on('blur', function (event) {
                        let val = parseFloat($(this).val());
                        if (isNaN(val)) {
                            val = scope.settings.reset_value;
                        }
                        scope.setValue(val, true, false);
                    });

                    $number.on('keydown', function (event) {
                        if (event.key === 'Enter' || event.key === 'Escape') {
                            this.blur();
                        }
                    });

                    $range.on('mousedown touchstart', function () { scope.isDragging = true; });
                    $range.on('mouseup touchend', function () { scope.isDragging = false; scope.updateResetButton(); });
                    $inputs.on('change', function () { scope.isDragging = false; scope.updateResetButton(); });

                    this.setValue(this.value, false);
                }

                updateResetButton() {
                    if (!this.settings.resettable || !this.resetBtn) return;
                    if (this.isDragging) return;
                    if (parseFloat(this.value) !== parseFloat(this.settings.reset_value)) {
                        this.resetBtn.style.display = 'flex';
                    } else {
                        this.resetBtn.style.display = 'none';
                    }
                }

                getValue() {
                    return this.value;
                }

                setValue(value, dispatch = true, skip_number_input_update = false) {
                    if (!this.settings.allow_lower && value < this.settings.min) {
                        value = this.settings.min;
                    }
                    if (!this.settings.allow_higher && value > this.settings.max) {
                        value = this.settings.max;
                    }
                    this.value = value;
                    let $range = $(this.node).find('input[type="range"]');
                    let $number = $(this.node).find('input[type="number"]');

                    $range.val(value);
                    if (!skip_number_input_update) {
                        $number.val(value);
                    }

                    let isOutOfBounds = false;
                    if (this.settings.allow_lower && value < this.settings.min) isOutOfBounds = true;
                    if (this.settings.allow_higher && value > this.settings.max) isOutOfBounds = true;

                    if (isOutOfBounds) {
                        $range.css({ 'opacity': '0.3', 'filter': 'grayscale(100%)' });
                    } else {
                        $range.css({ 'opacity': '1', 'filter': 'none' });
                    }
                    this.updateResetButton();
                    if (dispatch) this.change();
                }

                getDefault() {
                    return this.settings.reset_value !== undefined ? this.settings.reset_value : 0;
                }
            };

            // MARK: Compact Dropdown Select
            FormElement.types.compact_select = class FormElementCompactDropdown extends FormElement {
                get uses_wide_inputs() { return true; }
                setup() {
                    let tempDesc = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = tempDesc;
                }
                build(bar) {
                    this.bar = bar;
                    bar.classList.add('full_width_dialog_bar');
                    bar.style.padding = '0';
                    bar.style.background = 'transparent';

                    let data = this.options;
                    this.options_dict = data.options || {};
                    this.values = Object.keys(this.options_dict);
                    this.value = data.value !== undefined ? data.value : (data.default !== undefined ? data.default : this.values[0]);

                    // Button DOM mirrors the original widget.
                    this.node = document.createElement('div');
                    this.node.className = 'tool widget compact_dropdown_select';
                    this.node.style = 'display: flex; align-items: center; cursor: pointer; padding: 2px 6px; background: var(--color-button); border-radius: 2px; height: 30px; box-sizing: border-box; flex-shrink: 0;';

                    this.icon_wrapper = document.createElement('div');
                    this.icon_wrapper.className = 'main_icon_wrapper';
                    this.icon_wrapper.style = 'display: flex; align-items: center; margin-right: 4px;';

                    this.arrow_node = document.createElement('i');
                    this.arrow_node.className = 'fas fa-caret-down dropdown_arrow';
                    this.arrow_node.style = 'font-size: 12px; color: var(--color-text); display: flex; align-items: center;';

                    this.node.append(this.icon_wrapper, this.arrow_node);

                    // Group with the label when present without splitting the row in half.
                    let outerContainer = document.createElement('div');
                    outerContainer.style = 'display: flex; align-items: center; gap: 8px; width: 100%; height: 30px; padding: 0 4px; box-sizing: border-box;';

                    if (data.label) {
                        let labelElement = document.createElement('span');
                        labelElement.style = 'font-size: 13px; color: var(--color-text); white-space: nowrap;';
                        labelElement.innerText = tl(data.label);
                        outerContainer.append(labelElement);
                    }

                    outerContainer.append(this.node);
                    bar.append(outerContainer);

                    // Events.
                    this.node.addEventListener('click', (event) => {
                        this.open(event);
                    });

                    $(this.node).on('wheel', event => {
                        let e = event.originalEvent;
                        let index = this.values.indexOf(this.value);
                        index += e.deltaY < 0 ? -1 : 1;
                        if (index < 0) index = this.values.length - 1;
                        if (index >= this.values.length) index = 0;
                        this.setValue(this.values[index]);
                        this.change();
                    });

                    this.updateVisuals();
                }

                open(event) {
                    if (Menu.closed_in_this_click == this.id) return;
                    let scope = this;
                    let items = [];

                    for (let key in this.options_dict) {
                        let opt = this.options_dict[key];
                        if (opt) {
                            items.push({
                                name: opt.name || key,
                                icon: opt.icon,
                                color: opt.color,
                                condition: opt.condition,
                                click: (e) => {
                                    scope.setValue(key);
                                    scope.change();
                                }
                            });
                        }
                    }

                    let menu = new Menu(this.id, items, { class: 'select_menu' });
                    if (menu.node) {
                        menu.node.classList.add('compact_dropdown_menu');
                        menu.node.style['min-width'] = this.node.clientWidth + 'px';
                    }
                    menu.open(this.node);
                }

                updateVisuals() {
                    let opt = this.options_dict[this.value];
                    if (!opt) return;

                    let baseName = this.options.label ? tl(this.options.label) + ': ' : '';
                    this.node.title = `${baseName}${opt.name || this.value}`;

                    this.icon_wrapper.innerHTML = '';
                    let iconElement = Blockbench.getIconNode(opt.icon || 'help');
                    if (opt.color) {
                        iconElement.style.color = opt.color;
                    }
                    this.icon_wrapper.append(iconElement);
                }

                getValue() {
                    return this.value;
                }

                setValue(value) {
                    this.value = value;
                    this.updateVisuals();
                }

                getDefault() {
                    return this.values[0] || '';
                }
            };

            // MARK: Bar Display
            FormElement.types.bar_display = class FormElementBarDisplay extends FormElement {
                get uses_wide_inputs() { return true; }
                setup() {
                    let tempDesc = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = tempDesc;
                }
                build(bar) {
                    this.bar = bar;
                    bar.classList.add('full_width_dialog_bar');
                    bar.style.padding = '0';
                    bar.style.background = 'transparent';

                    let data = this.options;
                    this.text = data.text !== undefined ? data.text : (data.value || '');
                    this.inline_label = data.label || '';
                    this.color = data.color || '';
                    this.icon_name = data.icon || '';
                    this.is_paragraph = !!data.paragraph;
                    this.expand = !!data.expand;
                    this.text_alignment = data.text_alignment || 'left';

                    this.node = document.createElement('div');
                    this.node.className = `tool widget bar_display ${this.is_paragraph ? 'bar_display_paragraph' : ''}`;
                    this.node.style = 'display: flex; gap: 6px; padding: 0 4px; cursor: default; width: 100%; box-sizing: border-box; align-items: ' + (this.is_paragraph ? 'flex-start' : 'center') + ';';

                    if (this.color) this.node.style.color = this.color;

                    bar.append(this.node);
                    this.buildDOM();
                }

                buildDOM() {
                    this.node.innerHTML = '';

                    if (this.icon_name) {
                        let icon_node = Blockbench.getIconNode(this.icon_name);
                        icon_node.style.fontSize = '1.1em';
                        icon_node.style.display = 'flex';
                        icon_node.style.alignItems = 'center';
                        this.node.append(icon_node);
                    }

                    if (this.inline_label) {
                        let label_node = document.createElement('span');
                        label_node.className = 'bar_display_label';
                        label_node.style.fontWeight = 'bold';
                        label_node.style.opacity = '0.85';
                        label_node.style.display = 'flex';
                        label_node.style.alignItems = 'center';
                        label_node.innerText = tl(this.inline_label);
                        this.node.append(label_node);
                    }

                    this.content_node = document.createElement('span');
                    this.content_node.className = 'bar_display_content';
                    if (this.expand) {
                        this.content_node.style.flex = '1 1 0';
                        this.content_node.style.minWidth = '0';
                    }
                    this.content_node.style.textAlign = this.text_alignment;

                    if (this.is_paragraph) {
                        this.content_node.style.whiteSpace = 'pre-wrap';
                        this.content_node.style.lineHeight = '1.4';
                    } else {
                        this.content_node.style.display = 'flex';
                        this.content_node.style.alignItems = 'center';
                    }

                    this.content_node.innerHTML = this.text;
                    this.node.append(this.content_node);
                }

                getValue() {
                    return this.text;
                }

                setValue(value) {
                    this.text = value;
                    if (this.content_node) {
                        this.content_node.innerHTML = value;
                    }
                }

                getDefault() {
                    return '';
                }
            };

            // MARK: Custom Checkbox
            FormElement.types.custom_checkbox = class FormElementCustomCheckbox extends FormElement {
                // Prevents Blockbench from splitting the row in half
                get uses_wide_inputs() { return true; }

                setup() {
                    // Temporarily hide the description during base setup to avoid the default '?' icon
                    let tempDesc = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = tempDesc;
                }

                build(bar) {
                    this.bar = bar;
                    bar.classList.add('full_width_dialog_bar');
                    bar.style.padding = '0';
                    bar.style.background = 'transparent';

                    let data = this.options;
                    this.value = data.value !== undefined ? !!data.value : (data.default !== undefined ? !!data.default : false);

                    // --- Customization Settings ---
                    this.icon_on = data.icon_on || 'check_box';
                    this.icon_off = data.icon_off || 'check_box_outline_blank';
                    this.icon_color_on = data.icon_color_on || 'var(--color-text)';
                    this.icon_color_off = data.icon_color_off || 'var(--color-subtle_text)';
                    this.label_color = data.label_color || 'var(--color-subtle_text)';
                    this.layout = data.layout || 'icon_left'; // Options: 'icon_left', 'icon_right', 'space_between'
                    this.icon_size = data.icon_size || '18px';

                    // Dynamic Padding Compilation
                    let padding_value = data.padding !== undefined ? data.padding : '0 4px';
                    if (data.padding_left !== undefined || data.padding_right !== undefined || data.padding_top !== undefined || data.padding_bottom !== undefined) {
                        let top = data.padding_top || '0';
                        let right = data.padding_right || '0';
                        let bottom = data.padding_bottom || '0';
                        let left = data.padding_left || '0';
                        padding_value = `${top} ${right} ${bottom} ${left}`;
                    }

                    // Main Interactive Container
                    this.node = document.createElement('div');
                    this.node.className = 'tool widget custom_checkbox';
                    Object.assign(this.node.style, {
                        display: 'flex',
                        alignItems: 'center',
                        height: '30px',
                        padding: padding_value,
                        boxSizing: 'border-box',
                        width: '100%',
                        cursor: 'pointer',
                        userSelect: 'none'
                    });

                    // Native Tooltip (Description)
                    if (data.description) {
                        this.node.title = tl(data.description);
                    }

                    // --- Create Icon Wrapper & Node ---
                    this.icon_wrapper = document.createElement('div');
                    Object.assign(this.icon_wrapper.style, {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: '0',
                        // Slightly larger than the icon to prevent cropping during bounce animation
                        width: `calc(${this.icon_size} + 4px)`,
                        height: `calc(${this.icon_size} + 4px)`
                    });

                    this.icon_node = document.createElement('i');
                    Object.assign(this.icon_node.style, {
                        fontSize: this.icon_size,
                        lineHeight: '1', // Prevents font ascender/descender clipping
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transformOrigin: 'center', // Perfect center scaling
                        transition: 'color 0.25s ease, transform 0.15s cubic-bezier(0.2, 1.5, 0.4, 1)'
                    });

                    this.icon_wrapper.append(this.icon_node);

                    // Create Label Node
                    this.label_node = document.createElement('span');
                    Object.assign(this.label_node.style, {
                        fontSize: '13px',
                        color: this.label_color,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        flexShrink: '1'
                    });

                    if (data.label) {
                        this.label_node.innerText = tl(data.label);
                    }

                    // --- Layout Configuration ---
                    if (this.layout === 'icon_left') {
                        this.node.style.justifyContent = 'flex-start';
                        this.node.style.gap = '8px';
                        this.node.append(this.icon_wrapper, this.label_node);

                    } else if (this.layout === 'icon_right') {
                        this.node.style.justifyContent = 'flex-start';
                        this.node.style.gap = '8px';
                        this.node.append(this.label_node, this.icon_wrapper);

                    } else if (this.layout === 'space_between') {
                        this.node.style.justifyContent = 'space-between';
                        this.node.append(this.label_node, this.icon_wrapper);
                    }

                    bar.append(this.node);

                    // Click Event Listener
                    this.node.addEventListener('click', () => {
                        this.setValue(!this.value);
                    });

                    // Apply initial visual state
                    this.updateVisuals(false);
                }

                updateVisuals(animate = true) {
                    let current_icon = this.value ? this.icon_on : this.icon_off;
                    let current_color = this.value ? this.icon_color_on : this.icon_color_off;

                    // Reset classes
                    this.icon_node.className = '';
                    this.icon_node.innerText = '';

                    // Detect FontAwesome vs Material Icons
                    let isFa = /^(fa-|fas |fab |far )/.test(current_icon);

                    if (isFa) {
                        this.icon_node.className = `fa ${current_icon}`;
                    } else {
                        this.icon_node.className = 'material-icons';
                        this.icon_node.innerText = current_icon;
                    }

                    // Apply dynamic color
                    this.icon_node.style.color = current_color;

                    // Trigger scale "pop" animation
                    if (animate) {
                        this.icon_node.style.transform = 'scale(0.7)';
                        setTimeout(() => {
                            this.icon_node.style.transform = 'scale(1)';
                        }, 50); // Slight delay allows the browser to register the transform change
                    } else {
                        this.icon_node.style.transform = 'scale(1)';
                    }
                }

                getValue() {
                    return this.value;
                }

                setValue(val, dispatch = true) {
                    this.value = !!val; // Enforce boolean
                    this.updateVisuals(true);
                    if (dispatch) this.change(); // Notify form of the change
                }

                getDefault() {
                    return false;
                }
            };

            // MARK: Custom Vector
            FormElement.types.custom_vector = class FormElementCustomVector extends FormElement {
                get uses_wide_inputs() { return true; }

                setup() {
                    // Own the help icon placement so it sits natively beside the title.
                    let tempDesc = this.options.description;
                    this.options.description = null;
                    super.setup();
                    this.options.description = tempDesc;
                }

                build(bar) {
                    this.bar = bar;
                    bar.classList.add('full_width_dialog_bar');
                    bar.style.padding = '0';
                    bar.style.background = 'transparent';
                    bar.style.display = 'flex';
                    bar.style.flexDirection = 'column';

                    let data = this.options;
                    this.dimensions = data.dimensions || 3;

                    // Initialize values and parse them safely as floats.
                    this.value = Array.isArray(data.value) ? data.value.slice() : new Array(this.dimensions).fill(0);
                    if (!data.value && Array.isArray(data.default)) {
                        this.value = data.default.slice();
                    }

                    for (let i = 0; i < this.dimensions; i++) {
                        this.value[i] = parseFloat(this.value[i]) || 0;
                    }

                    const axes = [
                        { name: 'X', key: 'x', color: 'x', css: 'var(--color-axis-x)' },
                        { name: 'Y', key: 'y', color: 'y', css: 'var(--color-axis-y)' },
                        { name: 'Z', key: 'z', color: 'z', css: 'var(--color-axis-z)' },
                        { name: 'W', key: 'w', color: 'w', css: 'var(--color-axis-w, var(--color-text))' }
                    ];

                    let has_any_range = false;
                    for (let i = 0; i < this.dimensions; i++) {
                        let axis = axes[i] || { key: String(i) };
                        let cConfig = (data.ranges && data.ranges[axis.key]) ? data.ranges[axis.key] : {};

                        let minCheck = cConfig.min !== undefined ? cConfig.min : (Array.isArray(data.min) ? data.min[i] : data.min);
                        let maxCheck = cConfig.max !== undefined ? cConfig.max : (Array.isArray(data.max) ? data.max[i] : data.max);

                        if (minCheck !== undefined && maxCheck !== undefined) {
                            has_any_range = true;
                            break;
                        }
                    }

                    // Title and reset button.
                    let labelWrapper = document.createElement('div');
                    labelWrapper.style = 'margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; width: 100%;';

                    let titleGroup = document.createElement('div');
                    titleGroup.style = 'display: flex; align-items: center; gap: 4px;  height: 22px;';

                    if (data.label) {
                        let labelElement = document.createElement('span');
                        // Match combo_slider label color.
                        labelElement.style = 'font-size: 13px; color: var(--color-subtle_text); display: flex; align-items: center; white-space: nowrap;';
                        labelElement.innerText = (typeof tl !== 'undefined' ? tl(data.label) : data.label);
                        titleGroup.append(labelElement);
                    }

                    if (data.description) {
                        let infoIcon = document.createElement('i');
                        infoIcon.className = 'fa fa-question dialog_form_description';
                        infoIcon.style = 'font-size: 14px; cursor: help; margin: 0; color: var(--color-subtle_text);';
                        infoIcon.title = typeof tl !== 'undefined' ? tl(data.description) : data.description;
                        titleGroup.append(infoIcon);
                    }

                    labelWrapper.append(titleGroup);

                    let resetBtn = null;
                    let updateResetButtonVisibility = () => {
                        let defaultArr = Array.isArray(data.default) ? data.default : new Array(this.dimensions).fill(0);
                        let isChanged = this.value.some((val, idx) => parseFloat(val) !== parseFloat(defaultArr[idx]));

                        if (resetBtn) {
                            resetBtn.style.display = (data.resettable !== false && isChanged) ? 'flex' : 'none';
                        }
                    };

                    if (data.resettable !== false) {
                        resetBtn = document.createElement('i');
                        resetBtn.className = 'material-icons icon';
                        resetBtn.innerText = 'replay';
                        resetBtn.title = 'Reset Vector';
                        // Match the icon size and spacing used by the other controls.
                        resetBtn.style = 'font-size: 18px; padding: 2px; color: var(--color-subtle_text); cursor: pointer; display: flex; align-items: center;';
                        resetBtn.onclick = () => {
                            let defaultArr = Array.isArray(data.default) ? data.default : new Array(this.dimensions).fill(0);
                            this.setValue(defaultArr);
                            updateResetButtonVisibility();
                        };
                        labelWrapper.append(resetBtn);
                    }

                    this.updateResetButtonVisibility = updateResetButtonVisibility;

                    bar.append(labelWrapper);

                    // Input container.
                    this.inputs_container = document.createElement('div');
                    this.inputs_container.style = has_any_range
                        ? 'display: flex; flex-direction: column; gap: 4px; width: 100%;'
                        : 'display: flex; flex-direction: row; gap: 4px; width: 100%;';

                    bar.append(this.inputs_container);
                    this.inputs = [];

                    for (let i = 0; i < this.dimensions; i++) {
                        let axis = axes[i] || { name: String(i), key: String(i), color: '', css: 'var(--color-text)' };
                        let val = parseFloat(this.value[i]) || 0;

                        let cConfig = (data.ranges && data.ranges[axis.key]) ? data.ranges[axis.key] : {};

                        let minVal = cConfig.min !== undefined ? cConfig.min : (Array.isArray(data.min) ? data.min[i] : data.min);
                        let maxVal = cConfig.max !== undefined ? cConfig.max : (Array.isArray(data.max) ? data.max[i] : data.max);
                        let stepVal = cConfig.step !== undefined ? cConfig.step : (data.step !== undefined ? data.step : (data.integer ? 1 : 0.1));

                        let allowLower = cConfig.allow_lower !== undefined ? cConfig.allow_lower : (Array.isArray(data.allow_lower) ? data.allow_lower[i] : !!data.allow_lower);
                        let allowHigher = cConfig.allow_higher !== undefined ? cConfig.allow_higher : (cConfig.allow_greater !== undefined ? cConfig.allow_greater : (Array.isArray(data.allow_higher) ? data.allow_higher[i] : !!data.allow_higher));

                        let is_range = minVal !== undefined && maxVal !== undefined;

                        // Row wrapper, used only when the vector has at least one slider.
                        let rowContainer = null;
                        if (has_any_range) {
                            rowContainer = document.createElement('div');
                            rowContainer.style = 'display: flex; flex-direction: row; align-items: center; height: 30px; width: 100%; box-sizing: border-box;';

                            let axisLabel = document.createElement('span');
                            axisLabel.style = `margin-right: 5px; font-size: 13px; color: ${axis.css}; font-weight: bold; white-space: nowrap; display: flex; align-items: center; width: 14px; justify-content: center; font-family: monospace;`;
                            axisLabel.innerText = axis.name;
                            rowContainer.append(axisLabel);
                        }

                        if (is_range) {
                            // Combo-slider style mode.
                            let sliderInitVal = val;
                            if (!allowLower && sliderInitVal < minVal) sliderInitVal = minVal;
                            if (!allowHigher && sliderInitVal > maxVal) sliderInitVal = maxVal;

                            let rangeInput = Interface.createElement('input', {
                                type: 'range',
                                value: sliderInitVal,
                                min: minVal,
                                max: maxVal,
                                step: stepVal,
                                class: 'tool disp_range',
                                style: `margin: 0; flex: 1 1 auto; width: 100%; min-width: 30px; transition: opacity 0.2s, filter 0.2s; --color-thumb: ${axis.css};`
                            });

                            let numberInputAttrs = {
                                type: 'number',
                                value: val,
                                step: stepVal,
                                class: 'dark_bordered focusable_input',
                                style: `width: 100%; min-width: 45px; height: 24px; box-sizing: border-box; text-align: center; margin: 0; padding: 0 2px; flex: 0 0 auto;`
                            };
                            if (!allowLower) numberInputAttrs.min = minVal;
                            if (!allowHigher) numberInputAttrs.max = maxVal;

                            let numberInput = Interface.createElement('input', numberInputAttrs);

                            let numberContainer = Interface.createElement('div', {
                                class: 'numeric_input tool disp_text',
                                style: `display: flex; align-items: center; margin: 0; flex: 0 0 auto;`
                            }, [numberInput]);

                            let comboWrapper = Interface.createElement('div', {
                                class: 'bar slider_input_combo',
                                style: `display: flex; align-items: center; height: 100%; margin: 0; flex: 1 1 auto; min-width: 0; width: auto;`
                            }, [rangeInput, numberContainer]);

                            if (rowContainer) {
                                rowContainer.append(comboWrapper);
                                this.inputs_container.append(rowContainer);
                            }

                            // combo_slider-style out-of-range visuals.
                            let updateVisuals = (currentVal) => {
                                let isOutOfBounds = false;
                                if (allowLower && currentVal < minVal) isOutOfBounds = true;
                                if (allowHigher && currentVal > maxVal) isOutOfBounds = true;

                                if (isOutOfBounds) {
                                    rangeInput.style.opacity = '0.3';
                                    rangeInput.style.filter = 'grayscale(100%)';
                                } else {
                                    rangeInput.style.opacity = '1';
                                    rangeInput.style.filter = 'none';
                                }
                            };
                            updateVisuals(val);

                            let sync = (e) => {
                                let num = parseFloat(e.target.value);
                                if (isNaN(num)) {
                                    if (e.target.value === "" || e.target.value === "-") return;
                                    num = 0;
                                }
                                if (data.integer) num = Math.round(num);

                                let clampedNum = num;
                                if (!allowLower && clampedNum < minVal) clampedNum = minVal;
                                if (!allowHigher && clampedNum > maxVal) clampedNum = maxVal;

                                let sliderNum = clampedNum;
                                if (sliderNum < minVal) sliderNum = minVal;
                                if (sliderNum > maxVal) sliderNum = maxVal;

                                rangeInput.value = sliderNum;
                                if (e.target === rangeInput || num !== clampedNum) {
                                    numberInput.value = clampedNum;
                                }

                                let finalVal = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(parseFloat(clampedNum) || 0) : parseFloat(clampedNum);
                                this.value[i] = finalVal;
                                updateVisuals(clampedNum);
                                this.change();
                                this.updateResetButtonVisibility();
                            };

                            $(rangeInput).on('input', sync);
                            $(numberInput).on('input', sync);
                            $(numberInput).on('blur', (e) => {
                                let num = parseFloat(e.target.value);
                                if (isNaN(num)) num = 0;
                                if (data.integer) num = Math.round(num);

                                let clampedNum = num;
                                if (!allowLower && clampedNum < minVal) clampedNum = minVal;
                                if (!allowHigher && clampedNum > maxVal) clampedNum = maxVal;

                                e.target.value = clampedNum;
                                this.value[i] = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(parseFloat(clampedNum) || 0) : clampedNum;
                                updateVisuals(clampedNum);
                                this.change();
                            });

                            this.inputs.push({
                                is_custom: true,
                                range: rangeInput,
                                number: numberInput,
                                min: minVal,
                                max: maxVal,
                                allowLower,
                                allowHigher,
                                updateVisuals
                            });

                            // Context menu for combo slider inputs
                            const showContextMenu = (event) => {
                                event.preventDefault();
                                if (typeof Menu !== 'undefined') {
                                    new Menu([
                                        '_',
                                        {
                                            id: 'copy',
                                            name: 'action.copy',
                                            icon: 'content_copy',
                                            click: () => {
                                                if (typeof Clipbench !== 'undefined') Clipbench.setText(this.value[i].toString());
                                            }
                                        },
                                        {
                                            id: 'copy_vector',
                                            name: 'menu.text_edit.copy_vector',
                                            icon: 'content_copy',
                                            condition: () => this.dimensions > 1,
                                            click: () => {
                                                let text = this.value.map(v => typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(v) : v).join(' ');
                                                if (typeof Clipbench !== 'undefined') Clipbench.setText(text);
                                            }
                                        },
                                        {
                                            id: 'paste',
                                            name: 'action.paste',
                                            icon: 'content_paste',
                                            click: async () => {
                                                let text = await navigator.clipboard.readText();
                                                let components = text.split(/\s+/g);
                                                if (components.length === this.dimensions) {
                                                    let vec = components.map(c => {
                                                        let num = parseFloat(c);
                                                        return isNaN(num) ? 0 : num;
                                                    });
                                                    this.setValue(vec);
                                                } else {
                                                    let num = parseFloat(text);
                                                    if (isNaN(num)) {
                                                        try {
                                                            if (typeof NumSlider !== 'undefined' && NumSlider.MolangParser) {
                                                                num = NumSlider.MolangParser.parse(text, { val: parseFloat(this.value[i]) || 0, n: 0 });
                                                            } else { num = 0; }
                                                        } catch (err) { num = 0; }
                                                    }
                                                    let newValue = this.value.slice();
                                                    newValue[i] = num;
                                                    this.setValue(newValue);
                                                }
                                            }
                                        },
                                        '_',
                                        {
                                            id: 'round',
                                            name: 'menu.slider.round_value',
                                            icon: 'percent',
                                            click: () => {
                                                let old_val = parseFloat(this.value[i]) || 0;
                                                let rounded = Math.round(old_val);
                                                let newValue = this.value.slice();
                                                newValue[i] = rounded;
                                                this.setValue(newValue);
                                            }
                                        },
                                        {
                                            id: 'reset_vector',
                                            name: 'menu.slider.reset_vector',
                                            icon: 'replay',
                                            condition: () => this.dimensions > 1,
                                            click: () => {
                                                let defaultArr = Array.isArray(data.default) ? data.default : new Array(this.dimensions).fill(0);
                                                this.setValue(defaultArr);
                                            }
                                        }
                                    ]).open(event);
                                }
                            };

                            rangeInput.addEventListener('contextmenu', showContextMenu);
                            numberInput.addEventListener('contextmenu', showContextMenu);

                        } else {
                            // Manual safe NumSlider mode.
                            let numSliderNode = document.createElement('div');
                            numSliderNode.className = 'tool wide widget nslide_tool';

                            if (axis.color) {
                                let css_color = 'uvwxyz'.includes(axis.color.toString()) ? `var(--color-axis-${axis.color})` : axis.color;
                                numSliderNode.style.setProperty('--corner-color', css_color);
                                numSliderNode.classList.add('is_colored');
                            }

                            let nslideInner = document.createElement('div');
                            nslideInner.className = 'nslide tab_target';
                            nslideInner.setAttribute('inputmode', 'decimal');
                            nslideInner.innerText = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(parseFloat(val) || 0) : val;
                            numSliderNode.append(nslideInner);

                            let jq_outer = $(numSliderNode);
                            let jq_inner = $(nslideInner);

                            let defaultVal = data.default ? (Array.isArray(data.default) ? data.default[i] : data.default) : 0;
                            let sensitivity = 30;

                            let getInterval = (e) => {
                                let interval = stepVal;
                                if (e && !e.shiftKey && !e.ctrlOrCmd) return interval;
                                if (e && e.ctrlOrCmd && e.shiftKey) return interval * 0.025;
                                if (e && e.ctrlOrCmd) return interval * 0.1;
                                if (e && e.shiftKey) return interval * 0.25;
                                return interval;
                            };

                            let updateCustomSliderValue = (num, dispatch = true) => {
                                num = parseFloat(num);
                                if (isNaN(num)) num = 0;
                                if (data.integer) num = Math.round(num);

                                // Safe float to prevent the "i.toFixed is not a function" error.
                                let trimmed = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(num) : num;
                                this.value[i] = trimmed;
                                nslideInner.innerText = trimmed;
                                if (dispatch) this.change();
                                if (this.updateResetButtonVisibility) this.updateResetButtonVisibility();
                            };

                            let last_value = val;

                            jq_inner.on('mousedown touchstart', async (event) => {
                                if (jq_inner.hasClass('editing')) return;
                                last_value = parseFloat(this.value[i]) || 0;

                                let drag_event = await new Promise((resolve) => {
                                    function move(e2) {
                                        if (!e2.clientX || Math.abs(e2.clientX - event.clientX) > 2) {
                                            document.removeEventListener('mousemove', move);
                                            document.removeEventListener('touchmove', move);
                                            document.removeEventListener('mouseup', stop);
                                            document.removeEventListener('touchend', stop);
                                            resolve(e2);
                                        }
                                    }
                                    function stop(e2) {
                                        document.removeEventListener('mousemove', move);
                                        document.removeEventListener('touchmove', move);
                                        document.removeEventListener('mouseup', stop);
                                        document.removeEventListener('touchend', stop);
                                        if (event.target == e2.target) startInput();
                                        resolve(false);
                                    }
                                    document.addEventListener('mousemove', move);
                                    document.addEventListener('touchmove', move);
                                    document.addEventListener('mouseup', stop);
                                    document.addEventListener('touchend', stop);
                                });

                                if (!drag_event) return;

                                if (typeof convertTouchEvent !== 'undefined') convertTouchEvent(drag_event);
                                let clientX = drag_event.clientX;
                                let pre = 0;
                                let sliding_start_pos = clientX;
                                let move_calls = 0;

                                if (!('touches' in drag_event)) jq_inner.get(0).requestPointerLock();

                                let move = (e) => {
                                    if (typeof convertTouchEvent !== 'undefined') convertTouchEvent(e);
                                    if (drag_event && 'touches' in drag_event) {
                                        clientX = e.clientX;
                                    } else {
                                        let limit = move_calls <= 2 ? 1 : 160;
                                        clientX += Math.clamp(e.movementX, -limit, limit);
                                    }

                                    let offset = Math.round((clientX - sliding_start_pos) / sensitivity);
                                    let difference = (offset - pre) * getInterval(e);
                                    pre = offset;

                                    if (difference) {
                                        let old_val = parseFloat(this.value[i]) || 0;
                                        updateCustomSliderValue(old_val + difference);

                                        let new_val = parseFloat(this.value[i]) || 0;
                                        let display_offset = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(new_val - last_value) : (new_val - last_value);
                                        if (typeof Blockbench !== 'undefined' && !Blockbench.isMobile) {
                                            Blockbench.setStatusBarText(display_offset);
                                        }
                                    }
                                    move_calls++;
                                };

                                let stop = (e) => {
                                    document.removeEventListener('mousemove', move);
                                    document.removeEventListener('touchmove', move);
                                    document.removeEventListener('mouseup', stop);
                                    document.removeEventListener('touchend', stop);
                                    document.exitPointerLock();
                                    if (typeof Blockbench !== 'undefined') Blockbench.setStatusBarText();
                                };

                                document.addEventListener('mousemove', move);
                                document.addEventListener('touchmove', move);
                                document.addEventListener('mouseup', stop);
                                document.addEventListener('touchend', stop);
                            });

                            let startInput = () => {
                                jq_inner.find('.nslide_arrow').remove();
                                jq_inner.attr('contenteditable', 'true');
                                jq_inner.addClass('editing');
                                jq_inner.focus();
                                document.execCommand('selectAll');
                            };

                            let stopInput = () => {
                                if (!jq_inner.hasClass('editing')) return;
                                let text = jq_inner.text();

                                if (last_value.toString() !== text) {
                                    if (text.split(/\s+/g).length === this.dimensions) {
                                        let components = text.split(/\s+/g);
                                        components.forEach((inputStr, axisIndex) => {
                                            let number = parseFloat(inputStr);
                                            if (isNaN(number)) number = 0;

                                            let targetInput = this.inputs[axisIndex];
                                            if (targetInput) {
                                                if (targetInput.is_custom) {
                                                    let clampedNum = number;
                                                    if (!targetInput.allowLower && targetInput.min !== undefined && clampedNum < targetInput.min) clampedNum = targetInput.min;
                                                    if (!targetInput.allowHigher && targetInput.max !== undefined && clampedNum > targetInput.max) clampedNum = targetInput.max;
                                                    targetInput.range.value = clampedNum;
                                                    targetInput.number.value = number;
                                                    this.value[axisIndex] = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(parseFloat(number) || 0) : number;
                                                    if (targetInput.updateVisuals) targetInput.updateVisuals(number);
                                                } else {
                                                    targetInput.updateCustomSliderValue(number, false);
                                                }
                                            }
                                        });
                                        this.change();
                                    } else {
                                        text = text.replace(/,(?=\d+$)/, '.');
                                        let num = parseFloat(text);
                                        if (isNaN(num)) {
                                            try {
                                                if (typeof NumSlider !== 'undefined' && NumSlider.MolangParser) {
                                                    num = NumSlider.MolangParser.parse(text, { val: parseFloat(this.value[i]) || 0, n: 0 });
                                                } else { num = 0; }
                                            } catch (err) { num = 0; }
                                        }
                                        updateCustomSliderValue(num);
                                    }
                                }
                                jq_inner.removeClass('editing');
                                jq_inner.attr('contenteditable', 'false');
                                nslideInner.innerText = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(parseFloat(this.value[i]) || 0) : this.value[i];
                            };

                            jq_inner
                                .on('keypress', function (e) {
                                    if (e.keyCode === 10 || e.keyCode === 13) {
                                        e.preventDefault();
                                        stopInput();
                                    }
                                })
                                .on('keyup', (e) => {
                                    if (e.keyCode !== 10 && e.keyCode !== 13) { last_value = parseFloat(this.value[i]) || 0; }
                                    if (e.keyCode === 27) {
                                        if (!jq_inner.hasClass('editing')) return;
                                        e.preventDefault();
                                        jq_inner.removeClass('editing');
                                        jq_inner.attr('contenteditable', 'false');
                                        nslideInner.innerText = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(parseFloat(this.value[i]) || 0) : this.value[i];
                                    }
                                })
                                .on('focusout', function () { stopInput(); })
                                .on('dblclick', function (event) {
                                    if (event.target != this) return;
                                    jq_inner.text(defaultVal.toString());
                                    stopInput();
                                })
                                .on('contextmenu', (event) => {
                                    event.preventDefault();
                                    if (typeof Menu !== 'undefined') {
                                        new Menu([
                                            '_',
                                            {
                                                id: 'copy',
                                                name: 'action.copy',
                                                icon: 'content_copy',
                                                click: () => {
                                                    if (typeof Clipbench !== 'undefined') Clipbench.setText(this.value[i].toString());
                                                }
                                            },
                                            {
                                                id: 'copy_vector',
                                                name: 'menu.text_edit.copy_vector',
                                                icon: 'content_copy',
                                                condition: () => this.dimensions > 1,
                                                click: () => {
                                                    let text = this.value.map(v => typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(v) : v).join(' ');
                                                    if (typeof Clipbench !== 'undefined') Clipbench.setText(text);
                                                }
                                            },
                                            {
                                                id: 'paste',
                                                name: 'action.paste',
                                                icon: 'content_paste',
                                                click: async () => {
                                                    let text = await navigator.clipboard.readText();
                                                    let components = text.split(/\s+/g);
                                                    if (components.length === this.dimensions) {
                                                        let vec = components.map(c => {
                                                            let num = parseFloat(c);
                                                            return isNaN(num) ? 0 : num;
                                                        });
                                                        this.setValue(vec);
                                                    } else {
                                                        let num = parseFloat(text);
                                                        if (isNaN(num)) {
                                                            try {
                                                                if (typeof NumSlider !== 'undefined' && NumSlider.MolangParser) {
                                                                    num = NumSlider.MolangParser.parse(text, { val: parseFloat(this.value[i]) || 0, n: 0 });
                                                                } else { num = 0; }
                                                            } catch (err) { num = 0; }
                                                        }
                                                        updateCustomSliderValue(num);
                                                    }
                                                }
                                            },
                                            '_',
                                            {
                                                id: 'round',
                                                name: 'menu.slider.round_value',
                                                icon: 'percent',
                                                click: () => {
                                                    let old_val = parseFloat(this.value[i]) || 0;
                                                    updateCustomSliderValue(Math.round(old_val));
                                                }
                                            },
                                            {
                                                id: 'reset_vector',
                                                name: 'menu.slider.reset_vector',
                                                icon: 'replay',
                                                condition: () => this.dimensions > 1,
                                                click: () => {
                                                    let defaultArr = Array.isArray(data.default) ? data.default : new Array(this.dimensions).fill(0);
                                                    this.setValue(defaultArr);
                                                }
                                            }
                                        ]).open(event);
                                    }
                                });

                            jq_outer
                                .on('mouseenter', () => {
                                    jq_outer.append(
                                        '<div class="nslide_arrow na_left" ><i class="material-icons">navigate_before</i></div>' +
                                        '<div class="nslide_arrow na_right"><i class="material-icons">navigate_next</i></div>'
                                    );
                                    let n = Math.clamp(numSliderNode.clientWidth / 2 - 22, 6, 1000);
                                    jq_outer.find('.nslide_arrow.na_left').click((e) => {
                                        let old_val = parseFloat(this.value[i]) || 0;
                                        updateCustomSliderValue(old_val - getInterval(e));
                                    }).css('margin-left', (-n - 22) + 'px');

                                    jq_outer.find('.nslide_arrow.na_right').click((e) => {
                                        let old_val = parseFloat(this.value[i]) || 0;
                                        updateCustomSliderValue(old_val + getInterval(e));
                                    }).css('margin-left', (n) + 'px');
                                })
                                .on('mouseleave', () => {
                                    jq_outer.find('.nslide_arrow').remove();
                                });

                            if (rowContainer) {
                                numSliderNode.style.height = '24px'; // Emparejarlo visualmente con el numero input en la fila
                                numSliderNode.style.flex = '1 1 auto';
                                rowContainer.append(numSliderNode);
                                this.inputs_container.append(rowContainer);
                            } else {
                                numSliderNode.style.flex = '1 1 0';
                                numSliderNode.style.minWidth = '0';
                                numSliderNode.style.width = 'auto';
                                this.inputs_container.append(numSliderNode);
                            }

                            this.inputs.push({ is_custom: false, updateCustomSliderValue });
                        }
                    }
                }

                getValue() {
                    return this.value.map(val => parseFloat(val) || 0);
                }

                setValue(arr, dispatch = true) {
                    for (let i = 0; i < this.dimensions; i++) {
                        let val = arr[i] !== undefined ? arr[i] : 0;
                        val = parseFloat(val) || 0;
                        this.value[i] = typeof trimFloatNumber !== 'undefined' ? trimFloatNumber(val) : val;

                        let inputObj = this.inputs[i];
                        if (!inputObj) continue;

                        if (inputObj.is_custom) {
                            let sliderNum = val;
                            if (!inputObj.allowLower && inputObj.min !== undefined && sliderNum < inputObj.min) sliderNum = inputObj.min;
                            if (!inputObj.allowHigher && inputObj.max !== undefined && sliderNum > inputObj.max) sliderNum = inputObj.max;

                            inputObj.range.value = sliderNum;
                            inputObj.number.value = val;
                            if (inputObj.updateVisuals) inputObj.updateVisuals(val);
                        } else {
                            inputObj.updateCustomSliderValue(val, false);
                        }
                    }
                    if (dispatch) this.change();
                    if (this.updateResetButtonVisibility) this.updateResetButtonVisibility();
                }

                getDefault() {
                    return new Array(this.dimensions).fill(0);
                }
            };




            window.HorizontalSelectWidget = HorizontalSelectWidget;

            const compactWidgetStyles = Blockbench.addCSS(
                `.compact_dropdown_select {
                    display: flex !important;
                    align-items: center;
                    justify-content: center;
                    padding: 0 4px !important;
                    cursor: pointer;
                    position: relative;
                    width: auto !important;
                    min-width: 32px;
                }

                .compact_dropdown_select:hover {
                    background-color: var(--color-button);
                }

                .compact_dropdown_select .main_icon_wrapper {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px; /* Icon size. */
                }

                .compact_dropdown_select .dropdown_arrow {
                    font-size: 10px;
                    margin-left: 4px;
                    color: var(--color-text);
                    opacity: 0.6;
                }
                    
                .horizontal_select_widget {
                    display: flex;
                    align-items: stretch;
                    border-radius: 2px;
                    overflow: hidden;
                    box-sizing: border-box;
                    height: 30px; /* Standard Blockbench toolbar height */
                    user-select: none;
                }
                .horizontal_select_btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 10px;
                    cursor: pointer;
                    transition: background 0.15s ease, color 0.15s ease;
                    color: var(--color-text);
                    background: transparent;
                    min-width: 32px;
                }
                .horizontal_select_btn:hover:not(.disabled) {
                    background: var(--color-button);
                }
                .horizontal_select_btn.selected {
                    background: var(--color-accent);
                    color: var(--color-light) !important; /* Overrides custom colors when selected for readability */
                }
                .horizontal_select_btn.disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                    filter: grayscale(100%);
                }
                .horizontal_select_icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.1em;
                }
                .horizontal_select_btn:not(.icon_only) .horizontal_select_icon {
                    margin-right: 6px;
                }
                .horizontal_select_label {
                    font-size: 13px;
                    white-space: nowrap;
                }
            `
            );
            deletables.push(compactWidgetStyles);


            // Configure three-dimensional textures based on the base64 dictionary
            for (let key in light_icons_b64) {
                let tex = new THREE.TextureLoader().load(light_icons_b64[key]);
                tex.magFilter = tex.minFilter = THREE.NearestFilter;
                lightTextures[key] = tex;
            }

            class LightElement extends OutlinerElement {
                constructor(data, uuid) {
                    super(data, uuid);
                    for (let key in LightElement.properties) {
                        LightElement.properties[key].reset(this);
                    }
                    if (data && typeof data === 'object') {
                        this.extend(data);
                    }
                    LightManagerUtils.sanitizeLight(this);
                    this.updateLightIcon();
                }
                // Dynamically updates the Blockbench icon depending on the light type
                updateLightIcon() {
                    const iconMap = { point: 'lightbulb', directional: 'light_mode', spot: 'highlight' };
                    this.icon = iconMap[this.light_type] || 'lightbulb';
                    if (typeof this.updateElement === 'function') {
                        this.updateElement();
                    }
                    this.render_color = this.color;
                    this.render_intensity = this.intensity;
                }

                get origin() { return this.position; }

                getWorldCenter() { return THREE.fastWorldPosition(this.mesh, Reusable.vec2); }

                extend(object) {
                    for (let key in LightElement.properties) {
                        LightElement.properties[key].merge(this, object);
                    }
                    LightManagerUtils.sanitizeLight(this);
                    this.sanitizeName();
                    this.updateLightIcon(); // Call update on extend/undo changes
                    return this;
                }

                getUndoCopy() {
                    let copy = new LightElement(this);
                    copy.uuid = this.uuid;
                    delete copy.parent;
                    return copy;
                }

                getSaveCopy() {
                    let el = {};
                    for (let key in LightElement.properties) {
                        LightElement.properties[key].copy(this, el);
                    }
                    el.type = 'light';
                    el.uuid = this.uuid;
                    return el;
                }

                select(event, isOutlinerClick) {
                    this.render_rotation = this.rotation;
                    super.select(event, isOutlinerClick);
                    if (Animator.open && Animation.selected) {
                        let animator = Animation.selected.getBoneAnimator(this);
                        if (animator) animator.select(true);
                    }
                    return this;
                }

                unselect(...args) {
                    super.unselect(...args);
                    if (Animator.open && Timeline.selected_animator && Timeline.selected_animator.element === this) {
                        Timeline.selected_animator.selected = false;
                    }
                }

                static behavior = {
                    unique_name: true,
                    movable: true,
                    rotatable: true, // Allowing rotation is now necessary to orient Directional and Spot lights
                    hide_in_screenshot: true,
                }
            }
            window.LightElement = LightElement;

            LightElement.prototype.title = 'Light';
            LightElement.prototype.type = 'light';
            LightElement.prototype.icon = 'lightbulb';
            LightElement.prototype.movable = true;
            LightElement.prototype.rotatable = true; // Enable rotation gizmo
            LightElement.prototype.name_regex = () => Format.node_name_regex ?? 'a-zA-Z0-9_';
            LightElement.prototype.needsUniqueName = true;

            LightElement.prototype.menu = new Menu([
                'edit_light_properties',
                'fit_light_bounds_to_selection',
                '_',
                ...Outliner.control_menu_group,
                '_',
                'rename',
                'delete'
            ]);

            LightElement.prototype.buttons = [
                Outliner.buttons.export,
                Outliner.buttons.locked,
                Outliner.buttons.visibility,
            ];

            // Base properties
            new Property(LightElement, 'string', 'name', { default: 'light' });
            new Property(LightElement, 'string', 'light_type', { default: 'point' }); // New
            new Property(LightElement, 'vector', 'position');
            new Property(LightElement, 'vector', 'rotation'); // New
            new Property(LightElement, 'vector', 'render_rotation', { default: [0, 0, 0] });
            new Property(LightElement, 'vector', 'color', { default: [255, 255, 255] });
            new Property(LightElement, 'vector', 'render_color', { default: [255, 255, 255] });
            new Property(LightElement, 'number', 'intensity', { default: 1, min: 0 });
            new Property(LightElement, 'number', 'render_intensity', { default: 1, min: 0 });
            new Property(LightElement, 'number', 'temperature', { default: 6500, min: 2700, max: 6500 });

            // New unique configuration options
            new Property(LightElement, 'number', 'distance', { default: 0, min: 0 });
            new Property(LightElement, 'number', 'angle', { default: 45, min: 0, max: 90 });
            new Property(LightElement, 'number', 'penumbra', { default: 0, min: 0, max: 1 });

            new Property(LightElement, 'boolean', 'visibility', { default: true });
            new Property(LightElement, 'boolean', 'has_shadow', { default: true });
            new Property(LightElement, 'number', 'shadow_resolution', { default: 1024 });
            new Property(LightElement, 'number', 'shadow_bias', { default: DEFAULT_SHADOW_BIAS });
            new Property(LightElement, 'number', 'shadow_normal_bias', { default: DEFAULT_SHADOW_NORMAL_BIAS, description: 'Adjusts bias based on surface normal. Reduces shadow acne on angled surfaces. Default: 0.02' });
            new Property(LightElement, 'number', 'shadow_near', { default: 0.1, min: 0 });
            new Property(LightElement, 'number', 'shadow_far', { default: 200, min: 0 });
            new Property(LightElement, 'number', 'shadow_bounds', { default: 35, min: 0 });

            OutlinerElement.registerType(LightElement, 'light');

            new NodePreviewController(LightElement, {
                setup(element) {
                    let mesh = new THREE.Object3D();
                    Project.nodes_3d[element.uuid] = mesh;

                    mesh.name = element.uuid;
                    mesh.type = element.type;
                    mesh.isElement = true;
                    mesh.visible = element.visibility;

                    // Maintain correct rotation order
                    mesh.rotation.order = Format.euler_order || 'ZYX';

                    // Sprite visual configuration
                    let initialTexture = lightTextures[element.light_type] || lightTextures.point;
                    let material = new THREE.SpriteMaterial({
                        map: initialTexture,
                        alphaTest: 0.1,
                        sizeAttenuation: false
                    });

                    let sprite = new THREE.Sprite(material);
                    sprite.name = element.uuid;
                    sprite.type = element.type;
                    sprite.isElement = true;

                    mesh.add(sprite);
                    mesh.sprite = sprite;
                    // Blockbench only raycasts non-locator custom elements when element.mesh has geometry.
                    // Use a valid empty geometry so Box3.expandByObject can inspect it without changing model bounds.
                    let selectionGeometry = new THREE.BufferGeometry();
                    selectionGeometry.boundingBox = new THREE.Box3().makeEmpty();
                    mesh.geometry = selectionGeometry;
                    mesh.raycast = function (raycaster, intersects) {
                        if (!this.sprite || this.sprite.visible === false) return;
                        this.sprite.updateMatrixWorld(true);
                        this.sprite.raycast(raycaster, intersects);
                    };

                    // ==========================================
                    // DIRECTIONAL GIZMO SYSTEM
                    // ==========================================
                    let gizmo = new THREE.Object3D();
                    let gizmo_mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });

                    let arrow_geo = new THREE.BufferGeometry();
                    let arrow_verts = new Float32Array([
                        0, 0, 0, 0, 0, -8,
                        0, 0, -8, -1.5, 0, -6.5,
                        0, 0, -8, 1.5, 0, -6.5,
                        0, 0, -8, 0, -1.5, -6.5,
                        0, 0, -8, 0, 1.5, -6.5
                    ]);
                    arrow_geo.setAttribute('position', new THREE.BufferAttribute(arrow_verts, 3));
                    let arrow = new THREE.LineSegments(arrow_geo, gizmo_mat);
                    arrow.raycast = () => { };
                    gizmo.add(arrow);
                    gizmo.arrow = arrow;

                    let ring_geo = new THREE.BufferGeometry();
                    let ring_verts = [];
                    let segments = 32;
                    for (let i = 0; i <= segments; i++) {
                        let theta = (i / segments) * Math.PI * 2;
                        ring_verts.push(Math.cos(theta), Math.sin(theta), -1);
                    }
                    ring_geo.setAttribute('position', new THREE.Float32BufferAttribute(ring_verts, 3));
                    let ring = new THREE.Line(ring_geo, gizmo_mat);
                    ring.raycast = () => { };
                    gizmo.add(ring);
                    gizmo.ring = ring;

                    let spot_lines_geo = new THREE.BufferGeometry();
                    let spot_lines_verts = new Float32Array([
                        0, 0, 0, 1, 0, -1,
                        0, 0, 0, -1, 0, -1,
                        0, 0, 0, 0, 1, -1,
                        0, 0, 0, 0, -1, -1
                    ]);
                    spot_lines_geo.setAttribute('position', new THREE.BufferAttribute(spot_lines_verts, 3));
                    let spot_lines = new THREE.LineSegments(spot_lines_geo, gizmo_mat);
                    spot_lines.raycast = () => { };
                    gizmo.add(spot_lines);
                    gizmo.spot_lines = spot_lines;

                    mesh.add(gizmo);
                    mesh.gizmo = gizmo;

                    mesh.fix_position = new THREE.Vector3();
                    mesh.fix_rotation = new THREE.Euler();

                    this.updateTransform(element);
                    this.dispatchEvent('setup', { element });
                },
                updateTransform(element) {
                    NodePreviewController.prototype.updateTransform.call(this, element);
                    element.mesh.fix_position.copy(element.mesh.position);
                    element.mesh.fix_rotation.copy(element.mesh.rotation);
                    this.updateWindowSize(element);
                    window.update_light_element_callback?.();
                },
                updateSelection(element) {
                    let { mesh } = element;

                    let desiredTexture = lightTextures[element.light_type] || lightTextures.point;
                    if (mesh.sprite.material.map !== desiredTexture) {
                        mesh.sprite.material.map = desiredTexture;
                        mesh.sprite.material.needsUpdate = true;
                    }

                    const previewColor = LightManagerUtils.colorArray(element.render_color || element.color);
                    let r = previewColor[0] / 255;
                    let g = previewColor[1] / 255;
                    let b = previewColor[2] / 255;
                    mesh.sprite.material.color.setRGB(r, g, b);

                    if (mesh.gizmo) {
                        mesh.gizmo.children.forEach(child => {
                            if (child.material) {
                                child.material.color.setRGB(r, g, b);
                                child.material.opacity = element.selected ? 1.0 : 0.25;
                            }
                        });

                        if (element.light_type === 'directional') {
                            mesh.gizmo.arrow.visible = true;
                            mesh.gizmo.ring.visible = false;
                            mesh.gizmo.spot_lines.visible = false;
                        } else if (element.light_type === 'spot') {
                            mesh.gizmo.arrow.visible = false;
                            mesh.gizmo.ring.visible = true;
                            mesh.gizmo.spot_lines.visible = true;

                            let dist = 8;
                            let safe_angle = LightManagerUtils.num(element.angle, 45, 0.1, 89.9);
                            let angle_rad = THREE.MathUtils.degToRad(safe_angle);
                            let radius = dist * Math.tan(angle_rad);

                            mesh.gizmo.ring.scale.set(radius, radius, dist);
                            mesh.gizmo.spot_lines.scale.set(radius, radius, dist);
                        } else {
                            mesh.gizmo.arrow.visible = false;
                            mesh.gizmo.ring.visible = false;
                            mesh.gizmo.spot_lines.visible = false;
                        }
                    }

                    let base_scale = Math.max(0.1, Math.sqrt(LightManagerUtils.num(element.render_intensity ?? element.intensity, 1, 0, 100000)));
                    mesh.scale.setScalar(element.selected ? base_scale * 1.2 : base_scale);

                    mesh.sprite.material.depthTest = !element.selected;
                    mesh.renderOrder = element.selected ? 100 : 0;

                    window.LightManagerAreaGizmos?.updateAll();
                    this.dispatchEvent('update_selection', { element });
                },
                updateWindowSize(element) {
                    if (Preview.selected && Preview.selected.camera && Preview.selected.height > 0) {
                        let size = 0.4 * Preview.selected.camera.fov / Preview.selected.height;
                        element.mesh.sprite.scale.setScalar(size);
                    }
                }
            });

            // -------------------------------------------------------------
            // TIMELINE OVERRIDES
            // -------------------------------------------------------------
            let old_y_condition = KeyframeDataPoint.properties.y.condition;
            let old_z_condition = KeyframeDataPoint.properties.z.condition;
            let old_x_default = KeyframeDataPoint.properties.x.default;
            let old_y_default = KeyframeDataPoint.properties.y.default;
            let old_z_default = KeyframeDataPoint.properties.z.default;

            KeyframeDataPoint.properties.y.condition = (point) => {
                if (point.keyframe.channel === 'intensity') return false;
                return typeof old_y_condition === 'function' ? old_y_condition(point) : true;
            };
            KeyframeDataPoint.properties.z.condition = (point) => {
                if (point.keyframe.channel === 'intensity') return false;
                return typeof old_z_condition === 'function' ? old_z_condition(point) : true;
            };

            KeyframeDataPoint.properties.x.default = (point) => {
                let el = point.keyframe.animator.element;
                if (point.keyframe.channel === 'intensity') return el?.intensity ?? 1;
                if (point.keyframe.channel === 'color') return el?.color[0] ?? 255;
                if (point.keyframe.channel === 'rotation') return el?.rotation[0] ?? 0;
                return typeof old_x_default === 'function' ? old_x_default(point) : (old_x_default || 0);
            };
            KeyframeDataPoint.properties.y.default = (point) => {
                let el = point.keyframe.animator.element;
                if (point.keyframe.channel === 'color') return el?.color[1] ?? 255;
                if (point.keyframe.channel === 'rotation') return el?.rotation[1] ?? 0;
                return typeof old_y_default === 'function' ? old_y_default(point) : (old_y_default || 0);
            };
            KeyframeDataPoint.properties.z.default = (point) => {
                let el = point.keyframe.animator.element;
                if (point.keyframe.channel === 'color') return el?.color[2] ?? 255;
                if (point.keyframe.channel === 'rotation') return el?.rotation[2] ?? 0;
                return typeof old_z_default === 'function' ? old_z_default(point) : (old_z_default || 0);
            };

            deletables.push({
                delete: () => {
                    KeyframeDataPoint.properties.y.condition = old_y_condition;
                    KeyframeDataPoint.properties.z.condition = old_z_condition;
                    KeyframeDataPoint.properties.x.default = old_x_default;
                    KeyframeDataPoint.properties.y.default = old_y_default;
                    KeyframeDataPoint.properties.z.default = old_z_default;
                }
            });

            class LightAnimator extends BoneAnimator {
                constructor(uuid, animation, name) {
                    super(uuid, animation);
                    this.uuid = uuid;
                    this._name = name;
                }
                get name() {
                    let element = this.getElement();
                    return element ? element.name : this._name;
                }
                set name(name) {
                    this._name = name;
                }
                getElement() {
                    this.element = OutlinerNode.uuids[this.uuid];
                    return this.element;
                }
                select(element_is_selected) {
                    if (!this.getElement()) {
                        unselectAll();
                        return this;
                    }
                    if (this.getElement().locked) return;

                    if (element_is_selected !== true && this.element) {
                        this.element.select();
                    }
                    GeneralAnimator.prototype.select.call(this);

                    if (this[Toolbox.selected.animation_channel] && (Timeline.selected.length == 0 || Timeline.selected[0].animator != this)) {
                        let nearest;
                        this[Toolbox.selected.animation_channel].forEach(kf => {
                            if (Math.abs(kf.time - Timeline.time) < 0.002) nearest = kf;
                        });
                        if (nearest) nearest.select();
                    }

                    if (this.element && this.element.parent && this.element.parent !== 'root') {
                        this.element.parent.openUp();
                    }
                    return this;
                }
                doRender() {
                    this.getElement();
                    return (this.element && this.element.mesh);
                }
                displayPosition(arr, multiplier = 1) {
                    let mesh = this.element.mesh;
                    if (arr && mesh) {
                        mesh.position.x += arr[0] * multiplier * animationSign;
                        mesh.position.y += arr[1] * multiplier;
                        mesh.position.z += arr[2] * multiplier;
                    }
                    return this;
                }
                displayRotation(arr, multiplier = 1) {
                    if (!arr) return this;
                    let mesh = this.element.mesh;
                    if (arr && mesh) {
                        // The main mesh rotates. The Gizmo, being its child, will visually rotate automatically!
                        mesh.rotation.x += THREE.MathUtils.degToRad(arr[0] * multiplier);
                        mesh.rotation.y += THREE.MathUtils.degToRad(arr[1] * multiplier);
                        mesh.rotation.z += THREE.MathUtils.degToRad(arr[2] * multiplier);
                    }
                    this.element.render_rotation = [
                        arr[0] * multiplier,
                        arr[1] * multiplier,
                        arr[2] * multiplier
                    ];
                    return this;
                }
                displayColor(arr, multiplier = 1) {
                    let mesh = this.element.mesh;
                    if (arr && mesh && mesh.sprite) {
                        let base = LightManagerUtils.colorArray(this.element.color);
                        let r = base[0] + (arr[0] - base[0]) * multiplier;
                        let g = base[1] + (arr[1] - base[1]) * multiplier;
                        let b = base[2] + (arr[2] - base[2]) * multiplier;

                        mesh.sprite.material.color.setRGB(r / 255, g / 255, b / 255);
                        this.element.render_color = [r, g, b];

                        // Also update the directional Gizmo color during animation
                        if (mesh.gizmo) {
                            mesh.gizmo.children.forEach(child => {
                                if (child.material) {
                                    child.material.color.setRGB(r / 255, g / 255, b / 255);
                                }
                            });
                        }
                    }
                    return this;
                }
                displayIntensity(arr, multiplier = 1) {
                    let mesh = this.element.mesh;
                    if (arr && mesh) {
                        let baseIntensity = LightManagerUtils.num(this.element.intensity, 1, 0, 100000);
                        let finalIntensity = Math.max(0, baseIntensity + (arr[0] - baseIntensity) * multiplier);
                        let baseScale = Math.max(0.1, Math.sqrt(finalIntensity));
                        mesh.scale.setScalar(this.element.selected ? baseScale * 1.2 : baseScale);
                        this.element.render_intensity = finalIntensity;
                    }
                    return this;
                }
                displayFrame(multiplier = 1) {
                    if (!this.doRender()) return;
                    this.getElement();

                    if (!this.muted.position) this.displayPosition(this.interpolate('position'), multiplier);
                    if (!this.muted.rotation) this.displayRotation(this.interpolate('rotation'), multiplier);
                    if (!this.muted.color) this.displayColor(this.interpolate('color'), multiplier);
                    if (!this.muted.intensity) this.displayIntensity(this.interpolate('intensity'), multiplier);

                    this.element.mesh.updateMatrixWorld();
                    window.update_light_element_callback?.();
                }
            }

            window.LightAnimator = LightAnimator;
            LightAnimator.prototype.type = 'light';

            LightAnimator.prototype.channels = {
                position: { name: tl('timeline.position'), mutable: true, transform: true, max_data_points: 3 },
                rotation: { name: tl('timeline.rotation'), mutable: true, transform: true, max_data_points: 3 },
                color: { name: 'Color', mutable: true, transform: true, max_data_points: 3 },
                intensity: { name: 'Intensity', mutable: true, transform: true, max_data_points: 1 },
            };
            LightElement.animator = LightAnimator;

            let modeObserver = Blockbench.on('select_mode', (arg) => {
                if (arg.mode.id === 'animate') return;
                for (let light of LightElement.all) {
                    if (LightElement.preview_controller) {
                        LightElement.preview_controller.updateSelection(light);
                    }
                }
            });
            deletables.push(modeObserver);

            const createLightFromProfile = (profileKey, undoLabel) => {
                const profile = LIGHT_MANAGER_PROFILES[profileKey] || LIGHT_MANAGER_PROFILES.point_fill;
                Undo.initEdit({ outliner: true, elements: [], selection: true });

                let group = getCurrentGroup();
                let light = new LightElement().addTo(group).init();

                if (Format.bone_rig && group && group !== Project) {
                    light.extend({ position: group.origin.slice() });
                }

                LightManagerUtils.applyConfig(light, profile);
                light.updateLightIcon();

                unselectAll();
                light.select();

                Undo.finishEdit(undoLabel, { outliner: true, elements: [light], selection: true });
                Blockbench.dispatchEvent('add_light', { object: light });
                window.update_light_element_callback?.();

                return light;
            };

            let addLightAction = new Action('add_light', {
                name: 'Add Point Light',
                description: 'Add a soft point light with balanced shadows.',
                icon: 'lightbulb',
                category: 'edit',
                condition: () => Modes.edit,
                click() {
                    return createLightFromProfile('point_fill', 'Add point light');
                }
            });
            deletables.push(addLightAction);
            Interface.Panels.outliner.menu.addAction(addLightAction, '3');
            MenuBar.menus.edit.addAction(addLightAction, '9');

            let addSpotLightAction = new Action('add_spot_light', {
                name: 'Add Spot Light',
                description: 'Add an aimable cone light for key lighting.',
                icon: 'highlight',
                category: 'edit',
                condition: () => Modes.edit,
                click() {
                    return createLightFromProfile('spot_key', 'Add spot light');
                }
            });
            deletables.push(addSpotLightAction);
            Interface.Panels.outliner.menu.addAction(addSpotLightAction, '3');
            MenuBar.menus.edit.addAction(addSpotLightAction, '9');

            let addDirectionalLightAction = new Action('add_directional_light', {
                name: 'Add Directional Light',
                description: 'Add a sun-style light for broad scene lighting.',
                icon: 'light_mode',
                category: 'edit',
                condition: () => Modes.edit,
                click() {
                    return createLightFromProfile('directional_sun', 'Add directional light');
                }
            });
            deletables.push(addDirectionalLightAction);
            Interface.Panels.outliner.menu.addAction(addDirectionalLightAction, '3');
            MenuBar.menus.edit.addAction(addDirectionalLightAction, '9');

            const updateAreaGizmoActionState = (action) => {
                const enabled = window.LightManagerAreaGizmos.enabled;
                action.name = enabled ? 'Hide Light Area Gizmos' : 'Show Light Area Gizmos';
                action.icon = enabled ? 'visibility' : 'visibility_off';
                if (typeof action.update === 'function') action.update();
            };

            ViewOptionsDialog.form_config.show_light_area_gizmos = {
                label: 'dialog.preview_options.show_light_area_gizmos', type: 'checkbox',
                style: 'toggle_switch', value: window.LightManagerAreaGizmos.enabled
            };
            let previousViewOptionsOnFormChange = ViewOptionsDialog.onFormChange;
            let lightManagerViewOptionsOnFormChange = (result) => {
                if (result.show_light_area_gizmos !== undefined) {
                    window.LightManagerAreaGizmos.setEnabled(result.show_light_area_gizmos);
                }
                if (typeof previousViewOptionsOnFormChange === 'function') {
                    previousViewOptionsOnFormChange(result);
                }
            };
            ViewOptionsDialog.onFormChange = lightManagerViewOptionsOnFormChange;
            deletables.push({
                delete: () => {
                    if (ViewOptionsDialog.onFormChange === lightManagerViewOptionsOnFormChange) {
                        ViewOptionsDialog.onFormChange = previousViewOptionsOnFormChange;
                    }
                    delete ViewOptionsDialog.form_config.show_light_area_gizmos;
                }
            });

            let fitLightBoundsAction = new Action('fit_light_bounds_to_selection', {
                name: 'Fit Lights to Selection...',
                description: 'Fit selected lights to the selected objects or groups.',
                icon: 'center_focus_strong',
                category: 'edit',
                condition: () => window.LightManagerFitTool.getSelectedLights().length > 0,
                click() {
                    window.LightManagerFitTool.openDialog();
                }
            });
            deletables.push(fitLightBoundsAction);
            MenuBar.menus.edit.addAction(fitLightBoundsAction, '9');

            let editLightPropertiesAction = new Action('edit_light_properties', {
                name: 'Light Properties...',
                icon: 'settings',
                category: 'edit',
                condition: () => Array.isArray(LightElement.selected) && LightElement.selected.length > 0,
                click() {
                    let firstLight = LightElement.selected[0];
                    if (!firstLight) return;
                    LightManagerUtils.sanitizeLight(firstLight);

                    let currentHex = LightManagerUtils.colorHex(firstLight.color);
                    const selectedCount = LightElement.selected.length;

                    new Dialog('edit_light_properties_dialog', {
                        title: selectedCount === 1 ? 'Edit Light' : `Edit ${selectedCount} Lights`,
                        form: {
                            profile: {
                                label: 'Quick Setup',
                                type: 'select',
                                options: {
                                    keep: 'Keep values below',
                                    point_fill: 'Point fill light',
                                    spot_key: 'Spot key light',
                                    directional_sun: 'Directional sun light',
                                    minecraft_optimized: 'Minecraft Optimized (Directional)'
                                },
                                value: 'keep',
                                description: 'Choose a profile to replace the technical values below on confirm.'
                            },
                            light_type: {
                                label: 'Light Type',
                                type: 'select',
                                options: {
                                    point: 'Point - radius light',
                                    directional: 'Directional - sun light',
                                    spot: 'Spot - cone light'
                                },
                                value: firstLight.light_type
                            },
                            color: { label: 'Color', type: 'color', value: currentHex },
                            intensity: { label: 'Brightness', type: 'number', value: firstLight.intensity, min: 0, step: 0.1 },
                            distance: { label: 'Range', type: 'number', value: firstLight.distance, min: 0, step: 0.5, description: 'Point/spot range. 0 means no hard cutoff.' },
                            angle: { label: 'Spot Cone', type: 'number', value: firstLight.angle, min: 0.1, max: 89.9, step: 0.1, description: 'Spot only. Values near 90 are very wide.' },
                            penumbra: { label: 'Spot Soft Edge', type: 'number', value: firstLight.penumbra, min: 0, max: 1, step: 0.01 },
                            shadow_preset: {
                                label: 'Shadow Preset',
                                type: 'select',
                                options: {
                                    custom: 'Use values below',
                                    off: 'Off',
                                    preview: 'Preview - fast',
                                    balanced: 'Balanced',
                                    crisp: 'Crisp - heavier',
                                    minecraft: 'Minecraft Optimized'
                                },
                                value: 'custom'
                            },
                            has_shadow: { label: 'Casts Shadows', type: 'checkbox', value: firstLight.has_shadow },
                            shadow_resolution: { label: 'Shadow Size', type: 'select', options: { '256': '256', '512': '512', '1024': '1024', '2048': '2048', '4096': '4096' }, value: firstLight.shadow_resolution ? firstLight.shadow_resolution.toString() : '1024' },
                            shadow_bias: { label: 'Shadow Bias', type: 'number', value: firstLight.shadow_bias !== undefined ? firstLight.shadow_bias : DEFAULT_SHADOW_BIAS, step: 0.0001, description: 'Small offsets reduce acne; too much causes detached shadows. Default: -0.0005' },
                            shadow_normal_bias: { label: 'Shadow Normal Bias', type: 'number', value: firstLight.shadow_normal_bias !== undefined ? firstLight.shadow_normal_bias : DEFAULT_SHADOW_NORMAL_BIAS, step: 0.0001, description: 'Adjusts bias based on surface normal. Reduces shadow acne on angled surfaces. Default: 0.02' },
                            shadow_near: { label: 'Shadow Near', type: 'number', value: firstLight.shadow_near !== undefined ? firstLight.shadow_near : 0.1, min: 0, step: 0.1 },
                            shadow_far: { label: 'Shadow Far', type: 'number', value: firstLight.shadow_far !== undefined ? firstLight.shadow_far : 200, min: 0.001, step: 1 },
                            shadow_bounds: { label: 'Sun Shadow Area', type: 'number', value: firstLight.shadow_bounds !== undefined ? firstLight.shadow_bounds : 35, min: 0.001, step: 1, description: 'Directional only. Smaller is sharper; larger covers more scene.' }
                        },
                        onConfirm(form_result) {
                            const selectedLights = LightElement.selected.slice();
                            const config = LightManagerUtils.resolveConfig(form_result, firstLight);

                            Undo.initEdit({ elements: selectedLights });

                            selectedLights.forEach(light => {
                                LightManagerUtils.applyConfig(light, config);
                                light.updateLightIcon();
                                LightElement.preview_controller?.updateSelection(light);
                            });

                            Undo.finishEdit('Edit light properties');
                            updateSelection();
                            window.update_light_element_callback?.();
                        }
                    }).show();
                }
            });
            deletables.push(editLightPropertiesAction);
            MenuBar.menus.edit.addAction(editLightPropertiesAction, '9');

            window.LightManagerAreaGizmos.updateAll();

            let LIGHT_SETTINGS_GROUP = {};
            let syncingLightSettings = false;
            let activeLightUndoLabel = null;

            let light_type_select;
            let light_intensity_slider;

            let light_color_picker;
            let light_temperature_slider;
            let light_distance_slider;
            let light_cone_angle_slider;
            let light_cone_penumbra_slider;
            let cast_shadows_toggle;
            let light_shadow_resolution_select;
            let light_shadow_near_sliderbox;
            let light_shadow_far_sliderbox;
            let light_shadow_bounds_slider;
            let light_shadow_bias_sliderbox;
            let light_shadow_normal_bias_sliderbox;

            const getSelectedLight = () => LightElement.selected.length === 1 ? LightElement.selected[0] : null;
            const singleLightCondition = () => !!getSelectedLight();
            const rangeLightCondition = () => {
                const light = getSelectedLight();
                return !!light && (light.light_type === 'point' || light.light_type === 'spot');
            };
            const spotLightCondition = () => {
                const light = getSelectedLight();
                return !!light && light.light_type === 'spot';
            };
            const shadowLightCondition = () => {
                const light = getSelectedLight();
                return !!light && light.has_shadow !== false;
            };
            const directionalShadowCondition = () => {
                const light = getSelectedLight();
                return !!light && light.has_shadow !== false && light.light_type === 'directional';
            };

            const lightValuesEqual = (a, b) => {
                if (Array.isArray(a) || Array.isArray(b)) {
                    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
                }
                return a === b;
            };

            const beginLightEdit = (label) => {
                if (syncingLightSettings || activeLightUndoLabel) return;
                Undo.initEdit({ elements: LightElement.selected.slice() });
                activeLightUndoLabel = label;
            };

            const finishLightEdit = (label) => {
                if (syncingLightSettings || !activeLightUndoLabel) return;
                Undo.finishEdit(label || activeLightUndoLabel);
                activeLightUndoLabel = null;
            };

            const setBarControl = (control, value) => {
                if (control && typeof control.set === 'function') control.set(value);
            };

            const setNumControl = (control, value) => {
                if (!control) return;
                control.value = value;
                if (typeof control.update === 'function') control.update();
            };

            const updateConditionalLightToolbars = () => {
                [
                    'light_settings_toolbar',
                    'light_quickbuttons_toolbar',
                    'light_shadow_clip_settings_toolbar',

                    'light_shadow_bias_settings_toolbar'
                ].forEach(key => LIGHT_SETTINGS_GROUP[key]?.update?.());
            };

            const normalizeLightPanelValue = (light, property, value) => {
                switch (property) {
                    case 'light_type':
                        return LightManagerUtils.lightType(value);
                    case 'color':
                        return LightManagerUtils.colorArray(value, light.color);
                    case 'intensity':
                        return LightManagerUtils.num(value, light.intensity, 0, 100000);
                    case 'temperature':
                        return LightManagerUtils.num(value, light.temperature || 6500, 2700, 6500);
                    case 'distance':
                        return LightManagerUtils.num(value, light.distance || 0, 0, 100000);
                    case 'angle':
                        return LightManagerUtils.num(value, light.angle || 45, 0.1, 89.9);
                    case 'penumbra':
                        return LightManagerUtils.num(value, light.penumbra || 0, 0, 1);
                    case 'has_shadow':
                        return !!value;
                    case 'shadow_resolution':
                        return LightManagerUtils.shadowResolution(value);
                    case 'shadow_bias':
                        return LightManagerUtils.num(value, light.shadow_bias ?? DEFAULT_SHADOW_BIAS, -1, 1);
                    case 'shadow_normal_bias':
                        return LightManagerUtils.num(value, light.shadow_normal_bias ?? DEFAULT_SHADOW_NORMAL_BIAS, -1, 1);
                    case 'shadow_near':
                        return LightManagerUtils.num(value, light.shadow_near ?? 0.1, 0, 99999);
                    case 'shadow_far':
                        return Math.max((light.shadow_near ?? 0.1) + 0.001, LightManagerUtils.num(value, light.shadow_far ?? 200, 0.001, 100000));
                    case 'shadow_bounds':
                        return LightManagerUtils.num(value, light.shadow_bounds ?? 35, 0.001, 100000);
                    default:
                        return value;
                }
            };

            const syncLightSettingsPanel = (light) => {
                if (!light) return;
                syncingLightSettings = true;
                try {
                    setBarControl(light_type_select, light.light_type);
                    setBarControl(light_intensity_slider, light.intensity);

                    light_color_picker?.set?.(LightManagerUtils.colorHex(light.color));

                    let selectedTemp = light.temperature || 6500;
                    setBarControl(light_temperature_slider, selectedTemp);

                    setBarControl(light_distance_slider, light.distance);
                    setBarControl(light_cone_angle_slider, light.angle);
                    setBarControl(light_cone_penumbra_slider, light.penumbra);

                    cast_shadows_toggle?.set?.(light.has_shadow !== false);
                    setBarControl(light_shadow_resolution_select, String(LightManagerUtils.shadowResolution(light.shadow_resolution)));
                    setNumControl(light_shadow_near_sliderbox, light.shadow_near);
                    setNumControl(light_shadow_far_sliderbox, light.shadow_far);
                    setNumControl(light_shadow_bounds_slider, light.shadow_bounds);
                    setNumControl(light_shadow_bias_sliderbox, light.shadow_bias);
                    setNumControl(light_shadow_normal_bias_sliderbox, light.shadow_normal_bias);
                } finally {
                    syncingLightSettings = false;
                }
                updateConditionalLightToolbars();
            };

            const applyLightPanelValue = (property, value, undoLabel) => {
                if (syncingLightSettings) return false;

                const light = getSelectedLight();
                if (!light) return false;

                const nextValue = normalizeLightPanelValue(light, property, value);
                if (lightValuesEqual(light[property], nextValue)) return false;

                const directUndo = undoLabel && !activeLightUndoLabel;
                if (directUndo) Undo.initEdit({ elements: [light] });

                light[property] = Array.isArray(nextValue) ? nextValue.slice() : nextValue;
                if (property === 'shadow_near' && light.shadow_far <= light.shadow_near) {
                    light.shadow_far = light.shadow_near + 0.001;
                }
                if (property === 'temperature') {
                    const tempColor = kelvinToTinyColor(light.temperature);
                    light.color = [tempColor._r, tempColor._g, tempColor._b];
                    light.render_color = light.color.slice();
                }
                if (property === 'color') {
                    light.render_color = light.color.slice();
                }
                if (property === 'intensity') {
                    light.render_intensity = light.intensity;
                }

                light.updateLightIcon();
                LightElement.preview_controller?.updateSelection(light);
                window.update_light_element_callback?.();
                syncLightSettingsPanel(light);

                if (directUndo) Undo.finishEdit(undoLabel);
                return true;
            };

            light_type_select = new CompactDropdownSelect('light_type_select', {
                name: 'property.light_type',
                icon_mode: true,
                options: {
                    point: { name: 'Point', icon: 'lightbulb' },
                    directional: { name: 'Directional', icon: 'light_mode' },
                    spot: { name: 'Spot', icon: 'highlight' }
                },
                condition: singleLightCondition,
                onChange: function () {
                    applyLightPanelValue('light_type', this.value, 'Change light type');
                }
            });

            light_color_picker = new ColorPicker({
                id: 'light_color_picker',
                name: tl('property.light_color'),
                label: false,
                value: tinycolor('ffffff'),
                condition: singleLightCondition,
                onBefore: () => beginLightEdit('Change light color'),
                onChange: function (color) {
                    let newColor = tinycolor(color);
                    applyLightPanelValue('color', [newColor._r, newColor._g, newColor._b], 'Change light color');
                },
                onAfter: () => finishLightEdit('Change light color')
            });

            light_temperature_slider = new ComboSlider('light_temperature_slider', {
                label: 'property.light_temperature',
                title: 'property.light_temperature.desc',
                grow: true,
                color: 'var(--color-warning)',
                condition: singleLightCondition,
                value: 6500,
                reset_value: 6500,
                min: 2700,
                max: 6500,
                step: 100,
                circular: true,
                allow_higher: false,
                allow_lower: false,
                get: function () {
                    let light = getSelectedLight();
                    return light ? (light.temperature || 6500) : 6500;
                },
                onBefore: () => beginLightEdit('Change light temperature'),
                onChange: function () {
                    applyLightPanelValue('temperature', this.value);
                },
                onAfter: () => finishLightEdit('Change light temperature')
            });

            cast_shadows_toggle = new Toggle('cast_shadows', {
                icon: 'ev_shadow',
                name: 'property.cast_shadows',
                category: 'edit',
                condition: singleLightCondition,
                default: true,
                onChange(toggle_value) {
                    applyLightPanelValue('has_shadow', toggle_value, 'Toggle shadows');
                }
            });

            light_shadow_resolution_select = new BarSelect('light_shadow_resolution_select', {
                name: 'property.shadow_resolution',
                options: {
                    256: { name: '256' },
                    512: { name: '512' },
                    1024: { name: '1024' },
                    2048: { name: '2048' },
                    4096: { name: '4096' }
                },
                condition: shadowLightCondition,
                onChange: function () {
                    applyLightPanelValue('shadow_resolution', this.value, 'Change shadow resolution');
                }
            });

            let light_quickbuttons_toolbar = new Toolbar({
                id: 'light_quickbuttons',
                name: 'property.light.quickbuttons',
                label: true,
                condition: singleLightCondition,
                children: ['light_type_select', 'light_color_picker', '+', 'cast_shadows', 'light_shadow_resolution_select', '#', 'light_temperature_slider']
            });

            light_intensity_slider = new ComboSlider('light_intensity_slider', {
                label: 'property.light_intensity',
                //icon: 'flare',
                title: 'property.light_intensity.desc',
                grow: true,
                color: 'var(--color-axis-w)',
                value: 1.0,
                reset_value: 1.0,
                min: 0.0,
                max: 3.0,
                step: 0.1,
                allow_higher: true,
                allow_lower: false,
                get: function () {
                    let light = getSelectedLight();
                    return light ? light.intensity : 0;
                },
                onBefore: () => beginLightEdit('Change light intensity'),
                onChange: function () {
                    applyLightPanelValue('intensity', this.value);
                },
                onAfter: () => finishLightEdit('Change light intensity')
            });

            light_distance_slider = new ComboSlider('light_distance_slider', {
                label: 'property.distance',
                title: 'property.distance.desc',
                grow: true,
                color: 'var(--color-axis-z)',
                condition: rangeLightCondition,
                value: 0,
                reset_value: 0,
                min: 0,
                max: 100,
                step: 0.5,
                allow_higher: true,
                allow_lower: false,
                get: function () {
                    let light = getSelectedLight();
                    return light ? light.distance : 0;
                },
                onBefore: () => beginLightEdit('Change light distance'),
                onChange: function () {
                    applyLightPanelValue('distance', this.value);
                },
                onAfter: () => finishLightEdit('Change light distance')
            });

            light_cone_angle_slider = new ComboSlider('light_cone_angle_slider', {
                label: 'property.cone_angle',
                title: 'property.cone_angle.desc',
                grow: true,
                color: 'var(--color-axis-x)',
                condition: spotLightCondition,
                value: 45,
                reset_value: 45,
                min: 0.1,
                max: 89.9,
                step: 0.1,
                allow_higher: false,
                allow_lower: false,
                get: function () {
                    let light = getSelectedLight();
                    return light ? light.angle : 45;
                },
                onBefore: () => beginLightEdit('Change light cone angle'),
                onChange: function () {
                    applyLightPanelValue('angle', this.value);
                },
                onAfter: () => finishLightEdit('Change light cone angle')
            });

            light_cone_penumbra_slider = new ComboSlider('light_cone_penumbra_slider', {
                label: 'property.cone_penumbra',
                title: 'property.cone_penumbra.desc',
                grow: true,
                color: 'var(--color-axis-y)',
                condition: spotLightCondition,
                value: 0,
                reset_value: 0,
                min: 0,
                max: 1,
                step: 0.01,
                allow_higher: false,
                allow_lower: false,
                get: function () {
                    let light = getSelectedLight();
                    return light ? light.penumbra : 0;
                },
                onBefore: () => beginLightEdit('Change light penumbra'),
                onChange: function () {
                    applyLightPanelValue('penumbra', this.value);
                },
                onAfter: () => finishLightEdit('Change light penumbra')
            });



            let light_settings_toolbar = new Toolbar({
                id: 'light_settings',
                name: 'property.light_settings',
                condition: singleLightCondition,
                label: true,
                children: ['light_intensity_slider', '#', 'light_distance_slider', '#', 'light_cone_angle_slider', '#', 'light_cone_penumbra_slider']
            });

            light_shadow_near_sliderbox = new NumSlider('light_shadow_near_sliderbox', {
                name: tl('property.shadow_near'),
                color: 'var(--color-axis-x)',
                settings: { default: 0.1, min: 0, max: 100000, step: 0.05 },
                condition: shadowLightCondition,
                onBefore: () => beginLightEdit('Change shadow clip'),
                onChange: modify => applyLightPanelValue('shadow_near', modify),
                onAfter: () => finishLightEdit('Change shadow clip')
            });

            Object.assign(light_shadow_near_sliderbox.node.style, {
                flex: '1 1 0',
                minWidth: 0,
                width: 'auto'
            });

            light_shadow_far_sliderbox = new NumSlider('light_shadow_far_sliderbox', {
                name: tl('property.shadow_far'),
                color: 'var(--color-axis-w)',
                settings: { default: 200, min: 0.001, max: 100000, step: 1 },
                condition: shadowLightCondition,
                onBefore: () => beginLightEdit('Change shadow clip'),
                onChange: modify => applyLightPanelValue('shadow_far', modify),
                onAfter: () => finishLightEdit('Change shadow clip')
            });

            Object.assign(light_shadow_far_sliderbox.node.style, {
                flex: '1 1 0',
                minWidth: 0,
                width: 'auto'
            });

            light_shadow_bounds_slider = new NumSlider('light_shadow_bounds_slider', {
                name: 'property.shadow_bounds',
                color: '#b28cff',
                condition: directionalShadowCondition,
                settings: {
                    default: 35,
                    min: 1,
                    max: 128,
                    step: 1
                },
                get: function () {
                    let light = getSelectedLight();
                    return light ? light.shadow_bounds : 35;
                },
                onBefore: () => beginLightEdit('Change shadow bounds'),
                onChange: function () {
                    applyLightPanelValue('shadow_bounds', this.value);
                },
                onAfter: () => finishLightEdit('Change shadow bounds')
            });

            Object.assign(light_shadow_bounds_slider.node.style, {
                flex: '1 1 0',
                minWidth: 0,
                width: 'auto'
            });

            let light_shadow_clip_settings_toolbar = new Toolbar({
                id: 'light_shadow_clip_settings',
                name: 'property.shadow_clip',
                label: true,
                condition: shadowLightCondition,
                children: ['light_shadow_near_sliderbox', 'light_shadow_far_sliderbox', 'light_shadow_bounds_slider']
            });

            light_shadow_bias_sliderbox = new ComboSlider('light_shadow_bias_sliderbox', {
                label: tl('property.shadow_bias'),
                color: 'var(--color-axis-z)',
                grow: true,
                value: DEFAULT_SHADOW_BIAS,
                reset_value: DEFAULT_SHADOW_BIAS,
                min: -1, max: 1, step: 0.0001,
                condition: shadowLightCondition,
                onBefore: () => beginLightEdit('Change shadow bias'),
                onChange: function () {
                    applyLightPanelValue('shadow_bias', this.value);
                },
                onAfter: () => finishLightEdit('Change shadow bias')
            });

            light_shadow_normal_bias_sliderbox = new ComboSlider('light_shadow_normal_bias_sliderbox', {
                label: tl('property.shadow_normal_bias'),
                color: 'var(--color-axis-u)',
                grow: true,
                description: tl('property.shadow_normal_bias.desc'),
                value: DEFAULT_SHADOW_NORMAL_BIAS,
                reset_value: DEFAULT_SHADOW_NORMAL_BIAS,
                min: -1, max: 1, step: 0.0001,
                condition: shadowLightCondition,
                onBefore: () => beginLightEdit('Change shadow normal bias'),
                onChange: function () {
                    applyLightPanelValue('shadow_normal_bias', this.value);
                },
                onAfter: () => finishLightEdit('Change shadow normal bias')
            });

            let light_shadow_bias_settings_toolbar = new Toolbar({
                id: 'light_shadow_bias_settings',
                name: 'property.shadow_biases',
                label: true,
                condition: shadowLightCondition,
                children: ['light_shadow_bias_sliderbox', '#', 'light_shadow_normal_bias_sliderbox']
            });

            Object.assign(LIGHT_SETTINGS_GROUP, {
                light_type_select,
                light_intensity_slider,

                light_settings_toolbar,
                light_color_picker,
                light_temperature_slider,

                light_distance_slider,

                light_cone_angle_slider,

                light_cone_penumbra_slider,

                cast_shadows_toggle,
                light_shadow_resolution_select,
                light_quickbuttons_toolbar,
                light_shadow_near_sliderbox,
                light_shadow_far_sliderbox,
                light_shadow_clip_settings_toolbar,
                light_shadow_bounds_slider,

                light_shadow_bias_sliderbox,
                light_shadow_normal_bias_sliderbox,
                light_shadow_bias_settings_toolbar
            });

            let lightPropertiesPanel = new Panel('light_properties', {
                icon: 'lightbulb',
                growable: true,
                resizable: true,
                condition: { modes: ['edit', 'render'], method: () => (LightElement.selected.length > 0) },
                display_condition: () => (LightElement.selected.length === 1),
                default_position: {
                    slot: 'right_bar',
                    float_position: [0, 0],
                    float_size: [320, 520],
                    height: 520,
                    attached_to: 'transform',
                    attached_index: 1,
                    sidebar_index: 2,
                },
                mode_positions: {
                    edit: {
                        slot: 'right_bar',
                        float_position: [0, 0],
                        float_size: [320, 520],
                        height: 520,
                        attached_to: 'transform',
                        attached_index: 1,
                        sidebar_index: 2,
                    },
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
                        attached_to: "material_properties",
                        sidebar_index: 1
                    }
                },
                toolbars: [
                    light_quickbuttons_toolbar,
                    light_settings_toolbar,
                    light_shadow_clip_settings_toolbar,
                    light_shadow_bias_settings_toolbar
                ]
            });
            window.light_properties_panel = lightPropertiesPanel;
            window.LIGHT_SETTINGS_GROUP = LIGHT_SETTINGS_GROUP;

            const lightPanelStyles = Blockbench.addCSS(`
                #panel_light_properties {
                    overflow-y: auto !important;
                    overflow-x: hidden;
                }
                /* Match the native Blockbench scrollbar style. */
                #panel_light_properties::-webkit-scrollbar {
                    width: 6px;
                }
                #panel_light_properties::-webkit-scrollbar-thumb {
                    background-color: var(--color-button);
                    border-radius: 3px;
                }

            `);
            deletables.push(lightPanelStyles);

            let lightPanelSelectionListener = Blockbench.on('update_selection', () => {
                const light = getSelectedLight();
                if (light) syncLightSettingsPanel(light);
                if (lightPropertiesPanel.isVisible() && LightElement.selected.length === 0) {
                    Panels.transform.selectTab();
                    if (Project.mode === 'render') {
                        Panels.material_properties.selectTab(Panels.material_properties);
                    }
                }
                if (Project.mode === 'render' && LightElement.selected.length > 0 && (Cube.selected.length === 0)) {
                    Panels.material_properties.selectTab(Panels.light_properties);
                }
            });
            deletables.push(lightPanelSelectionListener);
            Object.values(LIGHT_SETTINGS_GROUP).forEach(item => {
                if (item && typeof item.delete === 'function') deletables.push(item);
            });
            deletables.push(lightPropertiesPanel);

            window.LIGHT_MANAGER_LOADED = true;
            window.LightManagerPrepareRender?.();
            window.dispatchEvent(new CustomEvent('light_manager_initialized', {
                detail: 'Light Manager plugin has been initialized and is ready to use.'
            }));

        },

        onunload() {
            window.LightManagerAreaGizmos?.clear();
            disposeLightManagerResources();

            Object.keys(window.three_lights || {}).forEach(uuid => {
                const light = window.three_lights[uuid];
                disposeThreeLight(light);
                delete window.three_lights[uuid];
            });

            if (window.three_lights_group && window.three_lights_group.parent) {
                window.three_lights_group.parent.remove(window.three_lights_group);
            }
            delete window.three_lights_group;

            Object.keys(lightTextures).forEach(key => {
                if (lightTextures[key] && typeof lightTextures[key].dispose === 'function') {
                    lightTextures[key].dispose();
                }
                delete lightTextures[key];
            });
            lightTextures = {};

            delete OutlinerElement.types.light;
            if (NodePreviewController.controllers && NodePreviewController.controllers.light) {
                NodePreviewController.controllers.light.delete();
            }

            delete window.LIGHT_MANAGER_LOADED;
            delete window.ComboSlider;
            delete window.CompactDropdownSelect;
            delete window.BarDisplay;
            delete window.TextInputWidget;
            delete window.light_properties_panel;
            delete window.LIGHT_SETTINGS_GROUP;
            delete window.LightElement;
            delete window.LightAnimator;
            delete window.LightManagerAreaGizmos;
            delete window.LightManagerFitTool;
            delete window.LightManagerPrepareRender;
            delete window.update_light_element_callback;
            if (window.generateIconBase64 === generateIconBase64) delete window.generateIconBase64;
        }
    });
}

// Asynchronous initialization of all exclusive textures that will visually represent each light type
async function load_textures() {
    const specs = [
        ['point', 'lightbulb', 'P'],
        ['directional', 'light_mode', 'D'],
        ['spot', 'highlight', 'S']
    ];

    for (const [key, icon, fallbackLabel] of specs) {
        try {
            light_icons_b64[key] = await generateIconBase64(icon, 128, {
                fontFamily: 'Material Icons',
                color: 'rgba(255, 255, 255, 1)'
            });
        } catch (error) {
            light_icons_b64[key] = lightManagerFallbackIconDataUrl(fallbackLabel);
        }
    }
}

load_textures().catch(() => {
    light_icons_b64.point = lightManagerFallbackIconDataUrl('P');
    light_icons_b64.directional = lightManagerFallbackIconDataUrl('D');
    light_icons_b64.spot = lightManagerFallbackIconDataUrl('S');
}).then(() => {
    initialize_light_plugin();
});
