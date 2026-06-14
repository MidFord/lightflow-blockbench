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
    window.on_light_element_updated?.();
    if (!window.scene) return;

    // Ensure the main group exists in the scene
    if (!window.three_lights_group) {
        window.three_lights_group = new THREE.Group();
        window.three_lights_group.name = "light_manager_group";
        window.scene.add(window.three_lights_group);
    }

    // Enable shadows in renderer
    if (window.main_preview && window.main_preview.renderer && !window.main_preview.renderer.shadowMap.enabled) {
        window.main_preview.renderer.shadowMap.enabled = true;
        window.main_preview.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    // Keep track of active UUIDs to remove deleted lights
    const active_uuids = new Set();

    if (typeof LightElement !== 'undefined' && LightElement.all) {
        LightElement.all.forEach(element => {
            LightManagerUtils.sanitizeLight(element);
            active_uuids.add(element.uuid);

            let light = window.three_lights[element.uuid];

            // Determine required THREE light type based on user config
            let LightClass = THREE.PointLight;
            if (element.light_type === 'directional') LightClass = THREE.DirectionalLight;
            else if (element.light_type === 'spot') LightClass = THREE.SpotLight;

            // Recreate if type changed or it doesn't exist
            if (!light || light.constructor !== LightClass) {
                if (light) {
                    window.three_lights_group.remove(light);
                    if (light.target) window.three_lights_group.remove(light.target);
                    if (light.dispose) light.dispose();
                }

                const safeColor = LightManagerUtils.colorArray(element.color);
                const colorHex = new THREE.Color(safeColor[0] / 255, safeColor[1] / 255, safeColor[2] / 255).getHex();
                light = new LightClass(colorHex, element.intensity);

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
                let current_res = light.shadow.mapSize.width;
                let target_res = LightManagerUtils.shadowResolution(element.shadow_resolution);
                if (current_res !== target_res) {
                    light.shadow.mapSize.width = target_res;
                    light.shadow.mapSize.height = target_res;
                    if (light.shadow.map) {
                        light.shadow.map.dispose();
                        light.shadow.map = null;
                    }
                }

                light.shadow.bias = LightManagerUtils.num(element.shadow_bias, DEFAULT_SHADOW_BIAS, -1, 1);
                light.shadow.normalBias = LightManagerUtils.num(element.shadow_normal_bias, DEFAULT_SHADOW_NORMAL_BIAS, -1, 1);

                let update_camera = false;
                let near = LightManagerUtils.num(element.shadow_near, 0.1, 0, 99999);
                let far = Math.max(near + 0.001, LightManagerUtils.num(element.shadow_far, 200, 0.001, 100000));

                if (light.shadow.camera.near !== near || light.shadow.camera.far !== far) {
                    light.shadow.camera.near = near;
                    light.shadow.camera.far = far;
                    update_camera = true;
                }

                if (element.light_type === 'directional') {
                    let bounds = LightManagerUtils.num(element.shadow_bounds, 35, 0.001, 100000);
                    if (light.shadow.camera.top !== bounds) {
                        light.shadow.camera.top = bounds;
                        light.shadow.camera.bottom = -bounds;
                        light.shadow.camera.left = -bounds;
                        light.shadow.camera.right = bounds;
                        update_camera = true;
                    }
                }

                if (update_camera) {
                    light.shadow.camera.updateProjectionMatrix();
                }
            }

            if (element.distance !== undefined) {
                light.distance = LightManagerUtils.num(element.distance, 0, 0, 100000);
                // Solución al error del shader: Definir explícitamente el decay
                // 2 es el valor realista físicamente correcto. 0 desactiva el decaimiento.
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
        if (!active_uuids.has(uuid)) {
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
        'panel.light_properties': 'LIGHT',
        'property.light': 'Light',
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
        'property.shadows': 'Shadows',
        'property.cast_shadows': 'Cast Shadows',
        'property.shadow_near': 'Shadow Near',
        'property.shadow_far': 'Shadow Far',
        'property.shadow_bounds': 'Shadow Bounds (Directional)',
        'property.shadow_clip': 'Shadow Clip',
        'property.shadow_area': 'Shadow Area',
        'property.shadow_biases': 'Shadow Bias',
        'property.shadow_resolution': 'Shadow Resolution',
        'property.shadow_bias': 'Shadow Bias',
        'property.shadow_normal_bias': 'Shadow Normal Bias',
        'property.shadow_normal_bias.desc': 'Adjusts bias based on surface normal. Reduces shadow acne on angled surfaces. Default: 0.02',
        'action.edit_light_properties': 'Edit Light Properties',
        'action.fit_light_bounds_to_selection': 'Fit Light Bounds to Selection'
    });


    let deletables = [];
    let lightTextures = {}; // THREE.Texture instances will be loaded here

    const anim_sign = Blockbench.isNewerThan('4.99') ? 1 : -1;

    Plugin.register('light_manager', {
        title: 'Light Entity Manager',
        icon: 'emoji_objects',
        author: 'Extracted & Refactored',
        description: 'Adds fully manipulatable and animatable Light elements to the outliner without shader logic.',
        version: '1.3.0',
        variant: 'both',

        onload() {
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
                    // Keep the root visually empty, but let it enter Canvas.raycast and delegate to the visible sprite.
                    mesh.geometry = {};
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
                        mesh.position.x += arr[0] * multiplier * anim_sign;
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
                        let final_intensity = Math.max(0, baseIntensity + (arr[0] - baseIntensity) * multiplier);
                        let base_scale = Math.max(0.1, Math.sqrt(final_intensity));
                        mesh.scale.setScalar(this.element.selected ? base_scale * 1.2 : base_scale);
                        this.element.render_intensity = final_intensity;
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

            let toggleLightAreaGizmosAction = new Action('toggle_light_area_gizmos', {
                name: window.LightManagerAreaGizmos.enabled ? 'Hide Light Area Gizmos' : 'Show Light Area Gizmos',
                description: 'Show or hide light area visualizers.',
                icon: window.LightManagerAreaGizmos.enabled ? 'visibility' : 'visibility_off',
                category: 'view',
                condition: () => Project,
                click() {
                    const enabled = window.LightManagerAreaGizmos.toggle();
                    updateAreaGizmoActionState(this);
                    Blockbench.showQuickMessage(enabled ? 'Light area gizmos enabled' : 'Light area gizmos disabled');
                }
            });
            deletables.push(toggleLightAreaGizmosAction);
            MenuBar.addAction(toggleLightAreaGizmosAction, 'view');

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
            let light_intensity_sliderbox;
            let light_color_picker;
            let light_temperature_slider;
            let light_temperature_sliderbox;
            let light_distance_slider;
            let light_distance_sliderbox;
            let light_cone_angle_slider;
            let light_cone_angle_sliderbox;
            let light_cone_penumbra_slider;
            let light_cone_penumbra_sliderbox;
            let cast_shadows_toggle;
            let light_shadow_resolution_select;
            let light_shadow_near_sliderbox;
            let light_shadow_far_sliderbox;
            let light_shadow_bounds_slider;
            let light_shadow_bounds_sliderbox;
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
                    'light_distance_settings_toolbar',
                    'light_cone_angle_settings_toolbar',
                    'light_cone_penumbra_settings_toolbar',
                    'light_shadows_toolbar',
                    'light_shadow_clip_settings_toolbar',
                    'light_shadow_bounds_settings_toolbar',
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
                    setNumControl(light_intensity_sliderbox, light.intensity);
                    light_color_picker?.set?.(LightManagerUtils.colorHex(light.color));

                    let selectedTemp = light.temperature || 6500;
                    setBarControl(light_temperature_slider, selectedTemp);
                    setNumControl(light_temperature_sliderbox, selectedTemp);

                    setBarControl(light_distance_slider, light.distance);
                    setNumControl(light_distance_sliderbox, light.distance);
                    setBarControl(light_cone_angle_slider, light.angle);
                    setNumControl(light_cone_angle_sliderbox, light.angle);
                    setBarControl(light_cone_penumbra_slider, light.penumbra);
                    setNumControl(light_cone_penumbra_sliderbox, light.penumbra);

                    cast_shadows_toggle?.set?.(light.has_shadow !== false);
                    setBarControl(light_shadow_resolution_select, String(LightManagerUtils.shadowResolution(light.shadow_resolution)));
                    setNumControl(light_shadow_near_sliderbox, light.shadow_near);
                    setNumControl(light_shadow_far_sliderbox, light.shadow_far);
                    setBarControl(light_shadow_bounds_slider, light.shadow_bounds);
                    setNumControl(light_shadow_bounds_sliderbox, light.shadow_bounds);
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

            light_type_select = new BarSelect('light_type_select', {
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

            light_intensity_slider = new BarSlider('light_intensity_slider', {
                name: 'property.light_intensity',
                condition: singleLightCondition,
                min: 0, max: 10, step: 0.1, circular: true,
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

            light_intensity_sliderbox = new NumSlider('light_intensity_sliderbox', {
                name: tl('property.light_intensity'),
                description: tl('property.light_intensity.desc'),
                settings: { default: 1, min: 0, max: 100000, step: 0.1 },
                condition: singleLightCondition,
                onBefore: () => beginLightEdit('Change light intensity'),
                onChange: modify => applyLightPanelValue('intensity', modify),
                onAfter: () => finishLightEdit('Change light intensity')
            });

            let light_settings_toolbar = new Toolbar({
                id: 'light_intensity',
                name: 'property.light',
                label: true,
                children: ['+', 'light_intensity_slider', 'light_intensity_sliderbox', '+', 'light_type_select']
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

            light_temperature_slider = new BarSlider('light_temperature_slider', {
                name: 'property.light_temperature',
                condition: singleLightCondition,
                min: 2700, max: 6500, step: 100, circular: true,
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

            light_temperature_sliderbox = new NumSlider('light_temperature_sliderbox', {
                name: tl('property.light_temperature'),
                description: tl('property.light_temperature.desc'),
                settings: { default: 6500, min: 2700, max: 6500, step: 100 },
                condition: singleLightCondition,
                onBefore: () => beginLightEdit('Change light temperature'),
                onChange: modify => applyLightPanelValue('temperature', modify),
                onAfter: () => finishLightEdit('Change light temperature')
            });

            let light_color_settings_toolbar = new Toolbar({
                id: 'light_color_settings',
                name: 'property.light_color',
                label: true,
                children: ['+', 'light_color_picker', 'light_temperature_slider', 'light_temperature_sliderbox', '+']
            });

            light_distance_slider = new BarSlider('light_distance_slider', {
                name: tl('property.distance'),
                description: tl('property.distance.desc'),
                condition: rangeLightCondition,
                min: 0, max: 100, step: 0.5, circular: true,
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

            light_distance_sliderbox = new NumSlider('light_distance_sliderbox', {
                name: tl('property.distance'),
                description: tl('property.distance.desc'),
                settings: { default: 0, min: 0, max: 100000, step: 0.5 },
                condition: rangeLightCondition,
                onBefore: () => beginLightEdit('Change light distance'),
                onChange: modify => applyLightPanelValue('distance', modify),
                onAfter: () => finishLightEdit('Change light distance')
            });

            let light_distance_settings_toolbar = new Toolbar({
                id: 'light_distance_settings',
                name: 'property.distance',
                label: true,
                condition: rangeLightCondition,
                children: ['+', 'light_distance_slider', 'light_distance_sliderbox', '+']
            });

            light_cone_angle_slider = new BarSlider('light_cone_angle_slider', {
                name: tl('property.cone_angle'),
                description: tl('property.cone_angle.desc'),
                condition: spotLightCondition,
                min: 0.1, max: 89.9, step: 0.1, circular: true, color: '#b28cff',
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

            light_cone_angle_sliderbox = new NumSlider('light_cone_angle_sliderbox', {
                name: tl('property.cone_angle'),
                description: tl('property.cone_angle.desc'),
                settings: { default: 45, min: 0.1, max: 89.9, step: 0.1 },
                condition: spotLightCondition,
                onBefore: () => beginLightEdit('Change light cone angle'),
                onChange: modify => applyLightPanelValue('angle', modify),
                onAfter: () => finishLightEdit('Change light cone angle')
            });

            let light_cone_angle_settings_toolbar = new Toolbar({
                id: 'light_cone_angle_settings',
                name: 'property.cone_angle',
                label: true,
                condition: spotLightCondition,
                children: ['+', 'light_cone_angle_slider', 'light_cone_angle_sliderbox', '+']
            });

            light_cone_penumbra_slider = new BarSlider('light_cone_penumbra_slider', {
                name: tl('property.cone_penumbra'),
                description: tl('property.cone_penumbra.desc'),
                condition: spotLightCondition,
                min: 0, max: 1, step: 0.01, circular: true, color: '#b28cff',
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

            light_cone_penumbra_sliderbox = new NumSlider('light_cone_penumbra_sliderbox', {
                name: tl('property.cone_penumbra'),
                description: tl('property.cone_penumbra.desc'),
                settings: { default: 0, min: 0, max: 1, step: 0.01 },
                condition: spotLightCondition,
                onBefore: () => beginLightEdit('Change light penumbra'),
                onChange: modify => applyLightPanelValue('penumbra', modify),
                onAfter: () => finishLightEdit('Change light penumbra')
            });

            let light_cone_penumbra_settings_toolbar = new Toolbar({
                id: 'light_cone_penumbra_settings',
                name: 'property.cone_penumbra',
                label: true,
                condition: spotLightCondition,
                children: ['+', 'light_cone_penumbra_slider', 'light_cone_penumbra_sliderbox', '+']
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

            let light_shadows_toolbar = new Toolbar({
                id: 'light_shadows',
                name: 'property.shadows',
                label: true,
                condition: singleLightCondition,
                children: ['+', 'cast_shadows', 'light_shadow_resolution_select', '+']
            });

            light_shadow_near_sliderbox = new NumSlider('light_shadow_near_sliderbox', {
                name: tl('property.shadow_near'),
                settings: { default: 0.1, min: 0, max: 100000, step: 0.05 },
                condition: shadowLightCondition,
                onBefore: () => beginLightEdit('Change shadow clip'),
                onChange: modify => applyLightPanelValue('shadow_near', modify),
                onAfter: () => finishLightEdit('Change shadow clip')
            });

            light_shadow_far_sliderbox = new NumSlider('light_shadow_far_sliderbox', {
                name: tl('property.shadow_far'),
                settings: { default: 200, min: 0.001, max: 100000, step: 1 },
                condition: shadowLightCondition,
                onBefore: () => beginLightEdit('Change shadow clip'),
                onChange: modify => applyLightPanelValue('shadow_far', modify),
                onAfter: () => finishLightEdit('Change shadow clip')
            });

            let light_shadow_clip_settings_toolbar = new Toolbar({
                id: 'light_shadow_clip_settings',
                name: 'property.shadow_clip',
                label: true,
                condition: shadowLightCondition,
                children: ['+', 'light_shadow_near_sliderbox', 'light_shadow_far_sliderbox', '+']
            });

            light_shadow_bounds_slider = new BarSlider('light_shadow_bounds_slider', {
                name: tl('property.shadow_bounds'),
                condition: directionalShadowCondition,
                min: 1, max: 128, step: 1, circular: true, color: '#ffd866',
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

            light_shadow_bounds_sliderbox = new NumSlider('light_shadow_bounds_sliderbox', {
                name: tl('property.shadow_bounds'),
                settings: { default: 35, min: 0.001, max: 100000, step: 1 },
                condition: directionalShadowCondition,
                onBefore: () => beginLightEdit('Change shadow bounds'),
                onChange: modify => applyLightPanelValue('shadow_bounds', modify),
                onAfter: () => finishLightEdit('Change shadow bounds')
            });

            let light_shadow_bounds_settings_toolbar = new Toolbar({
                id: 'light_shadow_bounds_settings',
                name: 'property.shadow_area',
                label: true,
                condition: directionalShadowCondition,
                children: ['+', 'light_shadow_bounds_slider', 'light_shadow_bounds_sliderbox', '+']
            });

            light_shadow_bias_sliderbox = new NumSlider('light_shadow_bias_sliderbox', {
                name: tl('property.shadow_bias'),
                settings: { default: DEFAULT_SHADOW_BIAS, min: -1, max: 1, step: 0.0001 },
                condition: shadowLightCondition,
                onBefore: () => beginLightEdit('Change shadow bias'),
                onChange: modify => applyLightPanelValue('shadow_bias', modify),
                onAfter: () => finishLightEdit('Change shadow bias')
            });

            light_shadow_normal_bias_sliderbox = new NumSlider('light_shadow_normal_bias_sliderbox', {
                name: tl('property.shadow_normal_bias'),
                description: tl('property.shadow_normal_bias.desc'),
                settings: { default: DEFAULT_SHADOW_NORMAL_BIAS, min: -1, max: 1, step: 0.0001 },
                condition: shadowLightCondition,
                onBefore: () => beginLightEdit('Change shadow normal bias'),
                onChange: modify => applyLightPanelValue('shadow_normal_bias', modify),
                onAfter: () => finishLightEdit('Change shadow normal bias')
            });

            let light_shadow_bias_settings_toolbar = new Toolbar({
                id: 'light_shadow_bias_settings',
                name: 'property.shadow_biases',
                label: true,
                condition: shadowLightCondition,
                children: ['+', 'light_shadow_bias_sliderbox', 'light_shadow_normal_bias_sliderbox', '+']
            });

            Object.assign(LIGHT_SETTINGS_GROUP, {
                light_type_select,
                light_intensity_slider,
                light_intensity_sliderbox,
                light_settings_toolbar,
                light_color_picker,
                light_temperature_slider,
                light_temperature_sliderbox,
                light_color_settings_toolbar,
                light_distance_slider,
                light_distance_sliderbox,
                light_distance_settings_toolbar,
                light_cone_angle_slider,
                light_cone_angle_sliderbox,
                light_cone_angle_settings_toolbar,
                light_cone_penumbra_slider,
                light_cone_penumbra_sliderbox,
                light_cone_penumbra_settings_toolbar,
                cast_shadows_toggle,
                light_shadow_resolution_select,
                light_shadows_toolbar,
                light_shadow_near_sliderbox,
                light_shadow_far_sliderbox,
                light_shadow_clip_settings_toolbar,
                light_shadow_bounds_slider,
                light_shadow_bounds_sliderbox,
                light_shadow_bounds_settings_toolbar,
                light_shadow_bias_sliderbox,
                light_shadow_normal_bias_sliderbox,
                light_shadow_bias_settings_toolbar
            });

            let light_properties_panel = new Panel('light_properties', {
                icon: 'lightbulb',
                growable: true,
                condition: { modes: ['edit'], method: () => (LightElement.selected.length > 0) },
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
                toolbars: [
                    light_settings_toolbar,
                    light_color_settings_toolbar,
                    light_distance_settings_toolbar,
                    light_cone_angle_settings_toolbar,
                    light_cone_penumbra_settings_toolbar,
                    light_shadows_toolbar,
                    light_shadow_clip_settings_toolbar,
                    light_shadow_bounds_settings_toolbar,
                    light_shadow_bias_settings_toolbar
                ]
            });
            window.light_properties_panel = light_properties_panel;
            window.LIGHT_SETTINGS_GROUP = LIGHT_SETTINGS_GROUP;

            let lightPanelSelectionListener = Blockbench.on('update_selection', () => {
                const light = getSelectedLight();
                if (light) syncLightSettingsPanel(light);
                if (light_properties_panel.isVisible() && LightElement.selected.length === 0) {
                    Panels.transform.selectTab();
                }
            });
            deletables.push(lightPanelSelectionListener);

        },

        onunload() {
            window.LightManagerAreaGizmos?.clear();
            deletables.forEach(item => {
                if (item && typeof item.delete === 'function') item.delete();
            });

            Object.keys(window.three_lights || {}).forEach(uuid => {
                const light = window.three_lights[uuid];
                if (!light) return;
                if (light.parent) light.parent.remove(light);
                if (light.target && light.target.parent) light.target.parent.remove(light.target);
                if (light.shadow && light.shadow.map) light.shadow.map.dispose();
                if (typeof light.dispose === 'function') light.dispose();
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

            delete OutlinerElement.types.light;
            if (NodePreviewController.controllers && NodePreviewController.controllers.light) {
                NodePreviewController.controllers.light.delete();
            }

            delete window.LightElement;
            delete window.LightAnimator;
            delete window.LightManagerAreaGizmos;
            delete window.LightManagerFitTool;
            delete window.update_light_element_callback;
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
